"use strict";

(() => {
  const config = window.EASYCLEAN_FIREBASE_CONFIG;
  const adminEmail = String(window.EASYCLEAN_ADMIN_EMAIL || "").toLowerCase();
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
  const auth = app.auth();
  const db = app.firestore();
  let currentProfile = null;
  let authReady;

  class FirebaseRequestError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  function fail(status, message) {
    throw new FirebaseRequestError(status, message);
  }

  function jsonBody(options) {
    if (!options.body) return {};
    try {
      return JSON.parse(options.body);
    } catch {
      fail(400, "รูปแบบข้อมูลไม่ถูกต้อง");
    }
  }

  function profileDefaults(user) {
    const [firstName = "", ...rest] = String(user.displayName || "").split(" ");
    const isAdmin = user.emailVerified && String(user.email || "").toLowerCase() === adminEmail;
    return {
      uid: user.uid,
      email: String(user.email || "").toLowerCase(),
      firstName,
      lastName: rest.join(" "),
      phone: user.phoneNumber || "",
      role: isAdmin ? "admin" : "customer",
      active: true,
      createdAt: Date.now()
    };
  }

  async function ensureProfile(user = auth.currentUser) {
    if (!user) fail(401, "กรุณาเข้าสู่ระบบ");
    const refreshedUser = auth.currentUser;
    const reference = db.collection("profiles").doc(refreshedUser.uid);
    const snapshot = await reference.get();
    const defaults = profileDefaults(refreshedUser);
    if (!snapshot.exists) {
      await reference.set(defaults);
      currentProfile = defaults;
      return currentProfile;
    }
    currentProfile = { ...defaults, ...snapshot.data(), uid: refreshedUser.uid };
    if (currentProfile.active === false) {
      await auth.signOut();
      currentProfile = null;
      fail(403, "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
    }
    const adminVerified = refreshedUser.emailVerified && String(refreshedUser.email || "").toLowerCase() === adminEmail;
    const expectedRole = adminVerified ? "admin" : currentProfile.role === "admin" ? "customer" : currentProfile.role;
    if (currentProfile.role !== expectedRole) {
      await reference.update({ role: expectedRole });
      currentProfile.role = expectedRole;
    }
    return currentProfile;
  }

  function publicUser(user, profile) {
    return {
      id: user.uid,
      uid: user.uid,
      email: user.email,
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      phone: profile.phone || "",
      role: profile.role || "customer",
      active: profile.active !== false,
      provider: user.providerData.some((provider) => provider.providerId === "google.com") ? "google" : "password"
    };
  }

  async function requireUser() {
    await authReady;
    const user = auth.currentUser;
    if (!user) fail(401, "กรุณาเข้าสู่ระบบ");
    const profile = await ensureProfile(user);
    return { user: auth.currentUser, profile };
  }

  async function requireAdmin() {
    const session = await requireUser();
    if (session.profile.role !== "admin"
      || !session.user.emailVerified
      || String(session.user.email || "").toLowerCase() !== adminEmail) {
      fail(403, "ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ");
    }
    return session;
  }

  function ownerQuery(collection, uid) {
    return db.collection(collection).where("userId", "==", uid);
  }

  function normalizeDocument(document) {
    return { ...document.data(), id: document.id };
  }

  async function readCollection(collection, session, admin = false) {
    const snapshot = admin
      ? await db.collection(collection).get()
      : await ownerQuery(collection, session.user.uid).get();
    return snapshot.docs.map(normalizeDocument);
  }

  function documentId(collection, record) {
    if (collection === "services") {
      const id = record.name || record.id;
      return id ? encodeURIComponent(String(id)) : "";
    }
    if (collection === "reviews" || collection === "payments") {
      return String(record.bookingId || record.id || "");
    }
    return String(record.id || "");
  }

  function withOwner(record, session, admin = false) {
    const email = String(record.email || (admin ? "" : session.user.email) || "").toLowerCase();
    return {
      ...record,
      email,
      userId: record.userId || (email === String(session.user.email || "").toLowerCase()
        ? session.user.uid
        : "")
    };
  }

  async function importCollection(collection, records, session, admin = false) {
    const existing = await (admin
      ? db.collection(collection).get()
      : ownerQuery(collection, session.user.uid).get());
    const existingIds = new Set(existing.docs.map((document) => document.id));
    const operations = [];
    for (const rawRecord of records) {
      if (!rawRecord || typeof rawRecord !== "object") continue;
      const record = withOwner(rawRecord, session, admin);
      if (!admin && record.userId !== session.user.uid) continue;
      const id = documentId(collection, record);
      if (!id || id.includes("/")) continue;
      if (existingIds.has(id)) continue;
      const reference = db.collection(collection).doc(id);
      operations.push({ type: "set", reference, record });
    }
    await commitOperations(operations);
  }

  async function commitOperations(operations) {
    for (let offset = 0; offset < operations.length; offset += 450) {
      const batch = db.batch();
      for (const operation of operations.slice(offset, offset + 450)) {
        if (operation.type === "set") batch.set(operation.reference, operation.record);
        else if (operation.type === "update") batch.update(operation.reference, operation.record);
        else batch.delete(operation.reference);
      }
      await batch.commit();
    }
  }

  async function syncCollection(collection, records, session, admin = false) {
    const existing = await (admin
      ? db.collection(collection).get()
      : ownerQuery(collection, session.user.uid).get());
    const existingById = new Map(existing.docs.map((document) => [document.id, document]));
    const seen = new Set();
    const operations = [];

    for (const rawRecord of records) {
      if (!rawRecord || typeof rawRecord !== "object") continue;
      const record = withOwner(rawRecord, session, admin);
      if (!admin && record.userId !== session.user.uid) continue;
      const id = documentId(collection, record);
      if (!id || id.includes("/")) continue;
      const reference = db.collection(collection).doc(id);
      const previous = existingById.get(id);
      seen.add(id);
      if (!previous) {
        operations.push({ type: "set", reference, record });
        continue;
      }

      const previousData = previous.data();
      if (JSON.stringify({ ...previousData, id: previous.id }) === JSON.stringify(record)) continue;
      if (admin) {
        operations.push({ type: "set", reference, record });
      } else if (collection === "addresses") {
        operations.push({ type: "set", reference, record });
      } else if (collection === "notifications" && previousData.userId === session.user.uid) {
        operations.push({ type: "update", reference, record: { read: Boolean(record.read) } });
      } else if (collection === "bookings" && record.status === "ยกเลิกแล้ว") {
        operations.push({ type: "update", reference, record: { status: "ยกเลิกแล้ว" } });
      }
    }

    for (const [id, document] of existingById) {
      if (seen.has(id)) continue;
      if (admin || collection === "addresses" || collection === "notifications" || collection === "applications") {
        operations.push({ type: "delete", reference: document.ref });
      }
    }
    await commitOperations(operations);
  }

  function parseRequest(path, options) {
    const url = new URL(path, window.location.origin);
    return { pathname: url.pathname, method: options.method || "GET", body: jsonBody(options) };
  }

  async function handleRequest(path, options = {}) {
    await authReady;
    const { pathname, method, body } = parseRequest(path, options);

    if (pathname === "/api/config" && method === "GET") {
      return { googleEnabled: true, googleClientId: "" };
    }
    if (pathname === "/api/auth/me" && method === "GET") {
      if (!auth.currentUser) fail(401, "กรุณาเข้าสู่ระบบ");
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const profile = await ensureProfile();
      return { user: publicUser(auth.currentUser, profile) };
    }
    if (pathname === "/api/auth/register" && method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      if (String(body.password || "").length < 8) fail(400, "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร");
      const credential = await auth.createUserWithEmailAndPassword(email, String(body.password));
      await credential.user.updateProfile({ displayName: `${String(body.firstName || "").trim()} ${String(body.lastName || "").trim()}`.trim() });
      const profile = profileDefaults(credential.user);
      profile.firstName = String(body.firstName || "").trim();
      profile.lastName = String(body.lastName || "").trim();
      profile.phone = String(body.phone || "").trim();
      if (body.role === "job-seeker") profile.role = "job-seeker";
      await db.collection("profiles").doc(credential.user.uid).set(profile);
      currentProfile = profile;
      await credential.user.sendEmailVerification();
      return { user: publicUser(credential.user, profile), verificationEmailSent: true };
    }
    if (pathname === "/api/auth/login" && method === "POST") {
      const credential = await auth.signInWithEmailAndPassword(String(body.email || "").trim().toLowerCase(), String(body.password || ""));
      const profile = await ensureProfile(credential.user);
      return { user: publicUser(auth.currentUser, profile) };
    }
    if (pathname === "/api/auth/google" && method === "POST") {
      let credential;
      if (typeof body.credential === "string" && body.credential) {
        const providerCredential = firebase.auth.GoogleAuthProvider.credential(body.credential, null);
        credential = await auth.signInWithCredential(providerCredential);
      } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        credential = await auth.signInWithPopup(provider);
      }
      const profile = await ensureProfile(credential.user);
      return { user: publicUser(auth.currentUser, profile) };
    }
    if (pathname === "/api/auth/logout" && method === "POST") {
      await auth.signOut();
      currentProfile = null;
      return { ok: true };
    }
    if (pathname === "/api/auth/profile" && method === "POST") {
      const { user, profile } = await requireUser();
      const updated = {
        ...profile,
        firstName: String(body.firstName || "").trim(),
        lastName: String(body.lastName || "").trim(),
        phone: String(body.phone || "").trim()
      };
      await db.collection("profiles").doc(user.uid).update(updated);
      await user.updateProfile({ displayName: `${updated.firstName} ${updated.lastName}`.trim() });
      currentProfile = updated;
      return { user: publicUser(user, updated) };
    }
    if (pathname === "/api/auth/password" && method === "POST") {
      const { user } = await requireUser();
      if (!user.email) fail(400, "บัญชีนี้ไม่มีอีเมลสำหรับเข้าสู่ระบบด้วยรหัสผ่าน");
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, String(body.currentPassword || ""));
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(String(body.newPassword || ""));
      return { ok: true };
    }
    if (pathname === "/api/auth/password/reset" && method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) fail(400, "กรุณากรอกอีเมล");
      await auth.sendPasswordResetEmail(email);
      return { ok: true };
    }

    const session = await requireUser();
    if (pathname === "/api/bookings/sync" && method === "POST") {
      const [existingBookingSnapshot, existingPaymentSnapshot] = await Promise.all([
        ownerQuery("bookings", session.user.uid).get(),
        ownerQuery("payments", session.user.uid).get()
      ]);
      const existingBookings = new Map(existingBookingSnapshot.docs.map((document) => [document.id, document.data()]));
      const existingPaymentIds = new Set(existingPaymentSnapshot.docs.map((document) => document.id));
      const importedBookings = new Map();
      const bookingOperations = [];
      for (const booking of Array.isArray(body.bookings) ? body.bookings : []) {
        if (String(booking.email || "").toLowerCase() !== String(session.user.email || "").toLowerCase()) continue;
        const id = String(booking.id || "");
        if (!/^EC-\d{4}-\d{1,12}$/.test(id) || existingBookings.has(id)) continue;
        const imported = {
          ...booking,
          serviceId: booking.serviceId || encodeURIComponent(String(booking.service || "")),
          userId: session.user.uid,
          email: session.user.email,
          status: "รอชำระเงิน"
        };
        importedBookings.set(id, imported);
        bookingOperations.push({
          type: "set",
          reference: db.collection("bookings").doc(id),
          record: imported
        });
      }
      await commitOperations(bookingOperations);

      for (const payment of Array.isArray(body.payments) ? body.payments : []) {
        if (String(payment.email || "").toLowerCase() !== String(session.user.email || "").toLowerCase()) continue;
        const bookingId = String(payment.bookingId || "");
        if (payment.status !== "ชำระแล้ว" || existingPaymentIds.has(bookingId)) continue;
        const booking = importedBookings.get(bookingId) || existingBookings.get(bookingId);
        if (!booking || booking.status !== "รอชำระเงิน") continue;
        const bookingRef = db.collection("bookings").doc(bookingId);
        const paymentRef = db.collection("payments").doc(bookingId);
        const batch = db.batch();
        batch.set(paymentRef, {
          ...payment,
          id: `PAY-${bookingId}`,
          userId: session.user.uid,
          email: session.user.email
        });
        batch.update(bookingRef, { status: "รอการยืนยัน" });
        await batch.commit();
      }
      return { ok: true };
    }
    if (pathname === "/api/data/sync" && method === "POST") {
      const data = body.data || {};
      for (const collection of ["addresses", "reviews", "applications", "notifications"]) {
        const ownRecords = (Array.isArray(data[collection]) ? data[collection] : [])
          .filter((record) => String(record.email || "").toLowerCase() === String(session.user.email || "").toLowerCase());
        if (ownRecords.length) await importCollection(collection, ownRecords, session);
      }
      if (session.profile.role === "admin" && Array.isArray(data.services) && data.services.length) {
        await importCollection("services", data.services, session, true);
      }
      return { ok: true };
    }
    if (pathname === "/api/data" && method === "GET") {
      const admin = session.profile.role === "admin";
      const collections = ["bookings", "payments", "addresses", "reviews", "applications", "notifications", "services"];
      const values = await Promise.all(collections.map((collection) => readCollection(collection, session, admin || collection === "services")));
      const result = Object.fromEntries(collections.map((collection, index) => [collection, values[index]]));
      if (result.services.length === 0) result.services = [];
      return result;
    }
    if (pathname === "/api/bookings" && method === "GET") {
      const [bookings, payments] = await Promise.all([
        readCollection("bookings", session),
        readCollection("payments", session)
      ]);
      return { bookings, payments };
    }
    if (pathname === "/api/admin/bookings" && method === "GET") {
      await requireAdmin();
      const [bookings, payments] = await Promise.all([
        readCollection("bookings", session, true),
        readCollection("payments", session, true)
      ]);
      return { bookings, payments };
    }
    if (pathname === "/api/admin/users" && method === "GET") {
      await requireAdmin();
      return { users: (await readCollection("profiles", session, true)).map((profile) => ({
        ...profile,
        id: profile.uid
      })) };
    }
    if (pathname === "/api/bookings" && method === "POST") {
      const id = `EC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      const booking = {
        ...body,
        id,
        userId: session.user.uid,
        email: session.user.email,
        status: "รอชำระเงิน",
        createdAt: Date.now()
      };
      await db.collection("bookings").doc(id).set(booking);
      return { booking };
    }
    const ownBookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
    if (ownBookingMatch && method === "PATCH") {
      const reference = db.collection("bookings").doc(decodeURIComponent(ownBookingMatch[1]));
      const snapshot = await reference.get();
      if (!snapshot.exists || snapshot.data().userId !== session.user.uid) fail(404, "ไม่พบรายการจอง");
      if (body.status !== "ยกเลิกแล้ว") fail(400, "สถานะการจองไม่ถูกต้อง");
      await reference.update({ status: "ยกเลิกแล้ว" });
      return { booking: { ...snapshot.data(), status: "ยกเลิกแล้ว", id: snapshot.id } };
    }
    if (pathname === "/api/payments" && method === "POST") {
      const bookingRef = db.collection("bookings").doc(String(body.bookingId || ""));
      const bookingSnapshot = await bookingRef.get();
      if (!bookingSnapshot.exists || bookingSnapshot.data().userId !== session.user.uid
        || bookingSnapshot.data().status === "ยกเลิกแล้ว") fail(404, "ไม่พบรายการจองที่ชำระเงินได้");
      const booking = bookingSnapshot.data();
      const payment = {
        ...body,
        id: `PAY-${bookingSnapshot.id}`,
        bookingId: bookingSnapshot.id,
        userId: session.user.uid,
        email: session.user.email,
        amount: booking.price,
        status: "ชำระแล้ว",
        reference: `PAY-${bookingSnapshot.id}`,
        createdAt: Date.now()
      };
      const batch = db.batch();
      batch.set(db.collection("payments").doc(bookingSnapshot.id), payment);
      batch.update(bookingRef, { status: "รอการยืนยัน" });
      await batch.commit();
      return { payment, booking: { ...booking, id: bookingSnapshot.id, status: "รอการยืนยัน" } };
    }

    const adminBookingMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
    if (adminBookingMatch && method === "PATCH") {
      await requireAdmin();
      const reference = db.collection("bookings").doc(decodeURIComponent(adminBookingMatch[1]));
      const snapshot = await reference.get();
      if (!snapshot.exists) fail(404, "ไม่พบรายการจอง");
      await reference.update(body);
      return { booking: { ...snapshot.data(), ...body, id: snapshot.id } };
    }
    const adminPaymentMatch = pathname.match(/^\/api\/admin\/payments\/([^/]+)$/);
    if (adminPaymentMatch && method === "PATCH") {
      await requireAdmin();
      const paymentSnapshot = await db.collection("payments").doc(decodeURIComponent(adminPaymentMatch[1]).replace(/^PAY-/, "")).get();
      if (!paymentSnapshot.exists) fail(404, "ไม่พบรายการชำระเงิน");
      const payment = { ...paymentSnapshot.data(), id: paymentSnapshot.id };
      const bookingRef = db.collection("bookings").doc(payment.bookingId);
      const bookingSnapshot = await bookingRef.get();
      const bookingStatus = body.status === "ชำระแล้ว" ? "รอการยืนยัน" : "รอชำระเงิน";
      const batch = db.batch();
      batch.update(paymentSnapshot.ref, { status: body.status });
      if (bookingSnapshot.exists && bookingSnapshot.data().status !== "ยกเลิกแล้ว") {
        batch.update(bookingRef, { status: bookingStatus });
      }
      await batch.commit();
      return {
        payment: { ...payment, status: body.status },
        booking: bookingSnapshot.exists ? { ...bookingSnapshot.data(), id: bookingSnapshot.id, status: bookingStatus } : null
      };
    }
    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && method === "PATCH") {
      await requireAdmin();
      const reference = db.collection("profiles").doc(decodeURIComponent(adminUserMatch[1]));
      const snapshot = await reference.get();
      if (!snapshot.exists || snapshot.id === session.user.uid) fail(404, "ไม่พบบัญชีผู้ใช้");
      const update = {};
      if (body.role !== undefined && ["customer", "job-seeker"].includes(body.role)) update.role = body.role;
      if (body.active !== undefined && typeof body.active === "boolean") update.active = body.active;
      if (!Object.keys(update).length) fail(400, "ข้อมูลบัญชีไม่ถูกต้อง");
      await reference.update(update);
      return { user: { ...snapshot.data(), ...update, id: snapshot.id } };
    }

    fail(404, "ไม่พบ API ที่ร้องขอ");
  }

  async function syncCollectionFromLocal(key, records) {
    const session = await requireUser();
    const names = {
      "easyclean.addresses": "addresses",
      "easyclean.bookings": "bookings",
      "easyclean.payments": "payments",
      "easyclean.reviews": "reviews",
      "easyclean.applications": "applications",
      "easyclean.notifications": "notifications",
      "easyclean.services": "services"
    };
    const collection = names[key];
    if (!collection || collection === "bookings" || collection === "payments") return;
    const admin = collection === "services" || session.profile.role === "admin";
    await syncCollection(collection, records, session, admin);
  }

  function watchAdminTransactions(onChange, onError) {
    const initialized = { bookings: false, payments: false };
    let ready = false;
    const changed = (collection) => {
      if (ready) {
        onChange();
        return;
      }
      initialized[collection] = true;
      ready = initialized.bookings && initialized.payments;
    };
    const unsubscribe = [
      db.collection("bookings").onSnapshot(() => changed("bookings"), onError),
      db.collection("payments").onSnapshot(() => changed("payments"), onError)
    ];
    return () => unsubscribe.forEach((stop) => stop());
  }

  const ready = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(() => new Promise((resolve, reject) => {
    let stop = () => {};
    stop = auth.onAuthStateChanged((user) => {
      stop();
      resolve(user);
    }, reject);
  }));
  authReady = ready;

  window.easyCleanFirebase = {
    enabled: true,
    ready,
    request: handleRequest,
    syncCollection: syncCollectionFromLocal,
    watchAdminTransactions
  };
})();
