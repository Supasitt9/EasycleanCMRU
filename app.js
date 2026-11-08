"use strict";

const PAGE_TITLES = {
  dashboard: "ภาพรวม",
  services: "บริการของเรา",
  booking: "จองบริการ",
  tracking: "ติดตามการจอง",
  addresses: "ที่อยู่ของฉัน",
  payments: "การชำระเงิน",
  reviews: "รีวิว",
  career: "สมัครเป็นพนักงาน",
  admin: "ผู้ดูแลระบบ",
  account: "บัญชีของฉัน"
};
const STORE = {
  bookings: "easyclean.bookings",
  addresses: "easyclean.addresses",
  payments: "easyclean.payments",
  reviews: "easyclean.reviews",
  applications: "easyclean.applications",
  notifications: "easyclean.notifications",
  services: "easyclean.services"
};
const SERVICES = new Proxy([
  { name: "ทำความสะอาดบ้าน", category: "บ้าน", size: "large", price: 1290, rating: 4.9, time: "3–5 ชั่วโมง", kind: "home", description: "ดูแลทุกมุมบ้านของคุณ ให้สะอาดน่าอยู่ทุกวัน" },
  { name: "ทำความสะอาดคอนโด", category: "คอนโด", size: "large", price: 890, rating: 4.8, time: "2–4 ชั่วโมง", kind: "condo", description: "ใส่ใจทุกรายละเอียด สำหรับพื้นที่ส่วนตัวของคุณ" },
  { name: "ทำความสะอาดห้องน้ำ", category: "ห้องน้ำ", size: "small", price: 690, rating: 4.9, time: "1–2 ชั่วโมง", kind: "bathroom", description: "ขจัดคราบและทำความสะอาดจุดใช้งาน ให้ห้องน้ำสดชื่นน่าใช้" },
  { name: "ทำความสะอาดห้องครัว", category: "ห้องครัว", size: "small", price: 790, rating: 4.9, time: "1–3 ชั่วโมง", kind: "kitchen", description: "ดูแลเคาน์เตอร์ เตา และพื้นที่เตรียมอาหารให้สะอาดเรียบร้อย" },
  { name: "ทำความสะอาดห้องนอน", category: "ห้องนอน", size: "small", price: 690, rating: 4.8, time: "1–2 ชั่วโมง", kind: "bedroom", description: "ปัดฝุ่น จัดระเบียบ และทำความสะอาดพื้นที่พักผ่อนของคุณ" },
  { name: "ทำความสะอาดสำนักงาน", category: "สำนักงาน", size: "large", price: 1690, rating: 4.8, time: "3–6 ชั่วโมง", kind: "office", description: "พื้นที่ทำงานสะอาด พร้อมเริ่มวันใหม่อย่างสดใส" }
], {
  get(target, property) {
    const stored = read(STORE.services, null);
    const current = Array.isArray(stored) ? stored : target;
    const value = Reflect.get(current, property);
    return typeof value === "function" ? value.bind(current) : value;
  }
});
const MENU = [
  ["dashboard", "⌂", "ภาพรวม", "dashboard.html"],
  ["services", "✧", "ค้นหาบริการ", "services.html"],
  ["booking", "＋", "จองบริการ", "booking.html"],
  ["tracking", "◷", "ติดตามการจอง", "tracking.html"],
  ["addresses", "⌖", "ที่อยู่ของฉัน", "addresses.html"],
  ["payments", "▤", "การชำระเงิน", "payments.html"],
  ["reviews", "☆", "รีวิวของฉัน", "reviews.html"],
  ["career", "♧", "สมัครเป็นพนักงาน", "career.html"],
  ["admin", "▦", "แดชบอร์ดผู้ดูแล", "admin.html"],
  ["account", "⚙", "บัญชีและโปรไฟล์", "account.html"]
];
let activeUser = null;
let adminUsers = [];
let firebaseSyncReady = false;
let firebaseWriteQueue = Promise.resolve();
let addressMap;
let addressMarker;
let addressGeocodeController;
let addressGeocodeTimer;
let lastAddressGeocodeAt = 0;

async function apiRequest(path, options = {}) {
  if (window.easyCleanFirebase?.enabled) {
    try {
      return await window.easyCleanFirebase.request(path, options);
    } catch (error) {
      if (error.status) throw error;
      const messages = {
        "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
        "auth/user-not-found": "ไม่พบบัญชีนี้ กรุณาสมัครสมาชิก",
        "auth/wrong-password": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/email-already-in-use": "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ",
        "auth/weak-password": "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร",
        "auth/too-many-requests": "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่",
        "auth/popup-closed-by-user": "ปิดหน้าต่าง Google Sign-In ก่อนเข้าสู่ระบบ",
        "permission-denied": "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้"
      };
      const mapped = new Error(messages[error.code] || error.message || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
      mapped.status = error.code === "permission-denied" ? 403 : 400;
      throw mapped;
    }
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
    error.status = response.status;
    throw error;
  }
  return result;
}

function apiOptions(body) {
  return { method: "POST", body: JSON.stringify(body) };
}

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.error("Could not read Easy Clean demo data.", error);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Could not save Easy Clean demo data.", error);
    notify("บันทึกข้อมูลไม่ได้ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์");
    throw error;
  }
  if (firebaseSyncReady && window.easyCleanFirebase?.enabled) {
    firebaseWriteQueue = firebaseWriteQueue
      .catch(() => undefined)
      .then(() => window.easyCleanFirebase.syncCollection(key, value))
      .catch((error) => {
        console.error(`Could not sync ${key} to Firebase.`, error);
        notify("ซิงก์ข้อมูลกับระบบออนไลน์ไม่สำเร็จ กรุณาลองบันทึกอีกครั้ง");
        throw error;
      });
  }
}

function flushFirebaseWrites() {
  return firebaseWriteQueue;
}

async function reloadAfterFirebaseWrites() {
  await flushFirebaseWrites();
  location.reload();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function notify(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("toast-visible");
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => toast.classList.remove("toast-visible"), 3200);
}

function currentUser() {
  return activeUser;
}

function authenticatedDestination() {
  const requested = new URLSearchParams(location.search).get("next");
  const allowed = MENU.map((item) => item[3]);
  return allowed.includes(requested) ? requested : "dashboard.html";
}

function formatPrice(price) {
  return new Intl.NumberFormat("th-TH").format(Number(price) || 0);
}

function getBookings() {
  return read(STORE.bookings, []);
}

async function loadServerTransactions(user, isAdmin = false) {
  const legacyBookings = isAdmin ? getBookings() : getBookings().filter((booking) => booking.email === user.email);
  const legacyPayments = isAdmin ? read(STORE.payments, []) : read(STORE.payments, []).filter((payment) => payment.email === user.email);
  try {
    await apiRequest("/api/bookings/sync", apiOptions({ bookings: legacyBookings, payments: legacyPayments }));
  } catch (error) {
    console.error("Could not migrate locally saved bookings to the server.", error);
    notify("ซิงก์รายการเดิมไม่สำเร็จ ระบบจะแสดงข้อมูลที่บันทึกบนเซิร์ฟเวอร์");
  }
  if (window.easyCleanFirebase?.enabled) {
    try {
      await apiRequest("/api/data/sync", apiOptions({
        data: {
          addresses: read(STORE.addresses, []),
          reviews: read(STORE.reviews, []),
          applications: read(STORE.applications, []),
          notifications: read(STORE.notifications, []),
          services: isAdmin ? getServices() : []
        }
      }));
    } catch (error) {
      console.error("Could not import locally saved Easy Clean data.", error);
      notify(error.message || "ย้ายข้อมูลเดิมไป Firebase ไม่สำเร็จ");
    }
    const data = await apiRequest("/api/data");
    const collections = {
      bookings: data.bookings || [],
      payments: data.payments || [],
      addresses: data.addresses || [],
      reviews: data.reviews || [],
      applications: data.applications || [],
      notifications: data.notifications || [],
      services: data.services?.length ? data.services : getServices()
    };
    for (const [collection, records] of Object.entries(collections)) {
      const key = STORE[collection];
      const otherAccounts = isAdmin ? [] : read(key, []).filter((record) => record.email !== user.email);
      write(key, [...records, ...otherAccounts]);
    }
    firebaseSyncReady = true;
    return { bookings: collections.bookings, payments: collections.payments };
  }
  const result = await apiRequest(isAdmin ? "/api/admin/bookings" : "/api/bookings");
  const bookings = Array.isArray(result.bookings) ? result.bookings : [];
  const payments = Array.isArray(result.payments) ? result.payments : [];
  if (!isAdmin) {
    const otherBookings = getBookings().filter((booking) => booking.email !== user.email);
    const otherPayments = read(STORE.payments, []).filter((payment) => payment.email !== user.email);
    write(STORE.bookings, [...bookings, ...otherBookings]);
    write(STORE.payments, [...payments, ...otherPayments]);
  } else {
    write(STORE.bookings, bookings);
    write(STORE.payments, payments);
  }
  return { bookings, payments };
}

function startAdminTransactionPolling() {
  if (window.easyCleanFirebase?.enabled) {
    let reloadScheduled = false;
    window.easyCleanFirebase.watchAdminTransactions(() => {
      if (reloadScheduled) return;
      reloadScheduled = true;
      flushFirebaseWrites().then(() => location.reload()).catch((error) => {
        console.error("Could not reload after live admin booking updates.", error);
        reloadScheduled = false;
        notify("อัปเดตรายการจองไม่สำเร็จ กรุณาโหลดหน้าใหม่");
      });
    }, (error) => {
      console.error("Could not subscribe to live admin booking updates.", error);
      notify("เชื่อมต่อการอัปเดตรายการจองแบบเรียลไทม์ไม่สำเร็จ");
    });
    return;
  }
  let isLoading = false;
  window.setInterval(async () => {
    if (isLoading || document.hidden) return;
    isLoading = true;
    try {
      const result = await apiRequest("/api/admin/bookings");
      const bookings = Array.isArray(result.bookings) ? result.bookings : [];
      const payments = Array.isArray(result.payments) ? result.payments : [];
      if (JSON.stringify(bookings) !== JSON.stringify(getBookings())
        || JSON.stringify(payments) !== JSON.stringify(read(STORE.payments, []))) {
        write(STORE.bookings, bookings);
        write(STORE.payments, payments);
        await reloadAfterFirebaseWrites();
      }
    } catch (error) {
      console.error("Could not refresh admin bookings from the server.", error);
      if (error.status === 401 || error.status === 403) notify(error.message || "เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    } finally {
      isLoading = false;
    }
  }, 5000);
}

function getServices() {
  const services = read(STORE.services, null);
  return Array.isArray(services) ? services : Array.from(SERVICES);
}

function pushNotification(email, title, message, type = "general", id = `NOT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  const notifications = read(STORE.notifications, []);
  if (notifications.some((item) => item.id === id)) return;
  const recipient = email === activeUser?.email ? activeUser : adminUsers.find((account) => account.email === email);
  notifications.unshift({ id, email, userId: recipient?.id || "", title, message, type, createdAt: Date.now(), read: false });
  write(STORE.notifications, notifications.slice(0, 1000));
  window.dispatchEvent(new CustomEvent("easyclean:notification", { detail: { email, title, message } }));
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่"));
    reader.readAsDataURL(file);
  });
}

function scheduleBookingReminders(email) {
  const now = Date.now();
  getBookings().filter((booking) => booking.email === email && isBookingPaid(booking) && booking.status !== "ยกเลิกแล้ว").forEach((booking) => {
    const serviceAt = new Date(`${booking.date}T${booking.time || "09:00"}:00`).getTime();
    const reminderAt = serviceAt - 60 * 60 * 1000;
    const reminderId = `REM-${booking.id}`;
    if (!Number.isFinite(serviceAt) || serviceAt <= now || reminderAt - now > 2147480000) return;
    window.setTimeout(() => {
      const current = getBookings().find((item) => item.id === booking.id && item.email === email);
      if (!current || current.status === "ยกเลิกแล้ว" || !isBookingPaid(current)) return;
      pushNotification(email, "เตือนนัดหมาย", `${current.service} ${reminderAt <= now ? "ใกล้ถึงเวลารับบริการแล้ว" : "จะเริ่มใน 1 ชั่วโมง"} (${current.date} เวลา ${current.time || "09:00"})`, "reminder", reminderId);
    }, Math.max(0, reminderAt - now));
  });
}

function isBookingPaid(booking, payments = read(STORE.payments, [])) {
  return payments.some((payment) => payment.bookingId === booking.id && payment.email === booking.email && payment.status === "ชำระแล้ว");
}

function unpaidBookings(email) {
  const payments = read(STORE.payments, []);
  return getBookings().filter((booking) => booking.email === email && booking.status !== "ยกเลิกแล้ว" && !isBookingPaid(booking, payments));
}

function bookingStatus(status) {
  const classes = {
    "รอชำระเงิน": "pending-chip",
    "รอการยืนยัน": "pending-chip",
    "รอตรวจสอบ": "pending-chip",
    "ไม่สำเร็จ": "cancelled-chip",
    "ยืนยันแล้ว": "status-chip",
    "กำลังเดินทาง": "status-chip",
    "กำลังทำความสะอาด": "status-chip",
    "เสร็จสิ้น": "completed-chip",
    "ชำระแล้ว": "completed-chip",
    "ผ่านการคัดเลือก": "completed-chip",
    "ไม่ผ่าน": "cancelled-chip",
    "ยกเลิกแล้ว": "cancelled-chip"
  };
  return `<span class="${classes[status] || "pending-chip"}">${escapeHtml(status || "รอการยืนยัน")}</span>`;
}

function trackingProgress(booking) {
  const steps = ["ยืนยันการชำระเงิน", "รอการยืนยัน", "ยืนยันแล้ว", "กำลังเดินทาง", "กำลังทำความสะอาด", "เสร็จสิ้น"];
  const currentIndex = steps.indexOf(booking.status);
  const progressWidth = (currentIndex / (steps.length - 1) * 88).toFixed(2);
  return `<div class="tracking-progress" style="--progress-width: ${progressWidth}%">${steps.map((status, index) => `<div class="progress-step ${index <= currentIndex ? "done" : ""} ${index === currentIndex ? "current" : ""}"><span>${index + 1}</span><strong>${status}</strong></div>`).join("")}</div>`;
}

function pageHeading(eyebrow, title, action = "") {
  return `<div class="page-title-row"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>${action}</div>`;
}

async function configureGoogleButton() {
  const container = document.querySelector("#google-button");
  const message = document.querySelector("#google-status");
  try {
    if (window.easyCleanFirebase?.enabled) {
      container.innerHTML = '<button class="google-signin-action" type="button" data-google-signin>G&nbsp;&nbsp; ดำเนินการต่อด้วย Google</button>';
      message.textContent = "เข้าสู่ระบบหรือสมัครบัญชีด้วยบัญชี Google ของคุณ";
      return;
    }
    const config = await apiRequest("/api/config");
    if (!config.googleEnabled) {
      message.textContent = "Google Sign-In ต้องตั้งค่า Google OAuth Client ID ก่อน";
      container.classList.add("google-button-disabled");
      return;
    }
    const start = Date.now();
    const waitForGoogle = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: window.handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true
        });
        window.google.accounts.id.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          width: Math.min(360, Math.max(220, Math.floor(container.getBoundingClientRect().width)))
        });
        message.textContent = "เข้าสู่ระบบหรือสมัครบัญชีด้วยบัญชี Google ของคุณ";
        return;
      }
      if (Date.now() - start > 10000) {
        message.textContent = "โหลด Google Sign-In ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
        return;
      }
      window.setTimeout(waitForGoogle, 100);
    };
    waitForGoogle();
  } catch (error) {
    console.error("Could not load Google Sign-In configuration.", error);
    message.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาเปิดเว็บผ่าน npm start";
    container.classList.add("google-button-disabled");
  }
}

async function renderAuth() {
  const root = document.querySelector("#auth-root");
  if (currentUser()) {
    window.location.replace(authenticatedDestination());
    return;
  }
  root.innerHTML = `
    <div class="auth-page">
      <section class="auth-brand-panel">
        <div class="auth-background-bubbles" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <a class="brand auth-brand" href="index.html"><span class="brand-mark">✦</span><span>easy<span class="brand-light">clean</span><small>สะอาดง่าย ในแบบคุณ</small></span></a>
        <div class="auth-brand-message"><span class="hero-tag">บ้านสะอาด ใจสบาย</span><h1>พื้นที่สะอาด<br>เริ่มต้นที่คุณ</h1><p>จองบริการทำความสะอาดที่ไว้ใจได้<br>ให้เราช่วยดูแลพื้นที่ของคุณ</p><div class="auth-illustration" role="img" aria-label="แม่บ้านกำลังทำความสะอาดด้วยอุปกรณ์ครบครัน"><svg viewBox="0 0 520 340" aria-hidden="true"><circle cx="340" cy="164" r="132" fill="#ffffff" fill-opacity=".12"/><g class="auth-bubble bubble-one"><circle cx="246" cy="105" r="17"/><path d="M240 98q5-6 11-2"/></g><g class="auth-bubble bubble-two"><circle cx="461" cy="158" r="11"/><path d="M457 154q3-4 7-1"/></g><g class="auth-bubble bubble-three"><circle cx="192" cy="202" r="8"/><path d="M190 199q2-3 5-1"/></g><g class="auth-bubble bubble-four"><circle cx="442" cy="261" r="14"/><path d="M437 257q4-5 9-2"/></g><circle cx="420" cy="82" r="8" fill="#ffffff" fill-opacity=".8"/><circle cx="456" cy="127" r="5" fill="#b9e8ff"/><path d="M75 286h390" stroke="#ffffff" stroke-opacity=".28" stroke-width="3" stroke-linecap="round"/><g transform="rotate(-16 183 161)"><path d="M188 49l-19 191" stroke="#d7f0ff" stroke-width="13" stroke-linecap="round"/><path d="M188 49l-19 191" stroke="#ffffff" stroke-opacity=".66" stroke-width="4" stroke-linecap="round"/><path d="M144 236q24 17 51 3l19 32q-39 25-78-2z" fill="#f3fbff"/><path d="M141 270l-10 14m28-8-7 17m27-15-3 16m25-29 5 15" stroke="#98d6fa" stroke-width="7" stroke-linecap="round"/></g><g transform="translate(272 48)"><path d="M33 59q-17 12-21 40l-9 49h112l-12-54q-6-27-28-35z" fill="#f1faff"/><path d="M26 71q-15 2-22 18l-20 37 12 8 31-31m66-31q16 4 22 20l13 27-12 7-25-24" fill="none" stroke="#c9edff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 91h57l11 58H20z" fill="#7bc5f0"/><path d="M44 93l-2 53m25-53-1 53" stroke="#b8e7ff" stroke-width="4"/><circle cx="57" cy="35" r="24" fill="#ffd7b8"/><path d="M33 35q2-31 28-29 22 2 22 28l-9-9-25-1-12 11z" fill="#183f61"/><path d="M47 48q10 8 20 0" fill="none" stroke="#d68c72" stroke-width="2" stroke-linecap="round"/><path d="M29 145l-12 48m74-47 10 49" stroke="#e9f8ff" stroke-width="13" stroke-linecap="round"/><path d="M18 193l-8 43m91-42 10 42" stroke="#d5efff" stroke-width="15" stroke-linecap="round"/><path d="M0 239h34m66 0h27" stroke="#f8fcff" stroke-width="10" stroke-linecap="round"/><path d="M105 82l20-13 18 20-9 8-17-10" fill="#dff5ff"/><path d="M133 89l10-17m-3 20 16-11m-16 16 19-2" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/></g><g><path d="M244 194h158l-15 76q-3 16-19 16h-89q-16 0-19-16z" fill="#eff9ff"/><path d="M233 188h180q10 0 10 10v8H223v-8q0-10 10-10z" fill="#9bdcff"/><path d="M275 193h92" stroke="#ffffff" stroke-opacity=".8" stroke-width="5" stroke-linecap="round"/><path d="M251 219l10 49q2 8 10 8h90" fill="none" stroke="#b8e7ff" stroke-width="5"/></g><g transform="translate(392 126)"><path d="M16 33h48l8 102H8z" fill="#7bc5f0"/><path d="M24 33V17q0-10 10-10h16v13h19v13" fill="#dff5ff"/><path d="M42 8h25v11H42z" fill="#ffffff"/><path d="M19 54h48" stroke="#c9efff" stroke-width="5"/><path d="M36 71h18" stroke="#e9f9ff" stroke-width="5" stroke-linecap="round"/><path d="M67 18l-19-9m17 20-24-1m24-16-18-16" stroke="#dff5ff" stroke-width="4" stroke-linecap="round"/></g><path d="M113 131l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" fill="#ffffff"/></svg></div></div>
        <small class="auth-brand-foot">Easy Clean · ดูแลบ้านเหมือนบ้านเรา</small>
      </section>
      <section class="auth-form-side">
        <div class="auth-card auth-main-card">
          <div class="auth-tabs" role="tablist"><button type="button" class="auth-tab active" data-auth-tab="login">เข้าสู่ระบบ</button><button type="button" class="auth-tab" data-auth-tab="register">สมัครสมาชิก</button></div>
          <form id="login-form" class="auth-panel">
            <p class="eyebrow">ยินดีต้อนรับกลับมา</p><h2>เข้าสู่ระบบ</h2><p class="auth-description">กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน</p>
            <label>อีเมล<input type="email" name="email" placeholder="name@example.com" autocomplete="email" required></label>
            <label>รหัสผ่าน<input type="password" name="password" placeholder="กรอกรหัสผ่าน" autocomplete="current-password" minlength="8" required></label>
            <div class="auth-options"><label><input type="checkbox" name="remember"> จดจำฉันไว้</label><button type="button" class="link-button" data-show-reset>ลืมรหัสผ่าน?</button></div>
            <button type="submit" class="button button-green full-button">เข้าสู่ระบบ <span>→</span></button>
            <p class="auth-footnote">ยังไม่มีบัญชี? <button type="button" class="link-button" data-auth-tab="register">สมัครสมาชิก</button></p>
          </form>
          <form id="register-form" class="auth-panel hidden">
            <p class="eyebrow">เริ่มใช้บริการได้เลย</p><h2>สร้างบัญชี Easy Clean</h2><p class="auth-description">กรอกข้อมูลเพื่อสร้างบัญชีลูกค้าของคุณ</p>
            <div class="auth-name-row"><label>ชื่อ<input name="firstName" autocomplete="given-name" required></label><label>นามสกุล<input name="lastName" autocomplete="family-name" required></label></div>
            <label>อีเมล<input type="email" name="email" placeholder="name@example.com" autocomplete="email" required></label>
            <label>เบอร์โทรศัพท์<input type="tel" name="phone" placeholder="08X-XXX-XXXX" autocomplete="tel" required></label>
            <label>รหัสผ่าน<input type="password" name="password" placeholder="อย่างน้อย 8 ตัวอักษร" autocomplete="new-password" minlength="8" required></label>
            <label>ประเภทบัญชี<select name="role"><option value="customer">ลูกค้า</option><option value="job-seeker">ผู้สมัครงาน</option></select></label>
            <button type="submit" class="button button-green full-button">สมัครสมาชิกและเข้าใช้งาน <span>→</span></button>
            <p class="auth-footnote">มีบัญชีอยู่แล้ว? <button type="button" class="link-button" data-auth-tab="login">เข้าสู่ระบบ</button></p>
          </form>
          <div class="google-divider"><span>หรือ</span></div>
          <div id="google-button" class="google-button" aria-label="ดำเนินการต่อด้วย Google"></div>
          <p id="google-status" class="google-status" role="status">กำลังตรวจสอบการตั้งค่า Google Sign-In…</p>
          <p class="demo-disclaimer">${window.easyCleanFirebase?.enabled ? "ระบบล็อกอินและข้อมูลบัญชีจัดเก็บผ่าน Firebase" : "ระบบใช้ Google OAuth ตรวจสอบบัญชีผ่านเซิร์ฟเวอร์ · รหัสผ่านและ session ไม่เก็บไว้ใน localStorage"}</p>
        </div>
      </section>
    </div>`;
  configureGoogleButton();
}

window.handleGoogleCredential = async (response) => {
  try {
    await apiRequest("/api/auth/google", apiOptions({ credential: response.credential }));
    location.assign(authenticatedDestination());
  } catch (error) {
    console.error("Google sign-in failed.", error);
    notify(error.message);
  }
};

function renderNotificationCenter(user) {
  const notifications = read(STORE.notifications, []).filter((item) => item.email === user.email).slice(0, 8);
  const unreadCount = notifications.filter((item) => !item.read).length;
  return `<div class="notification-menu"><button class="notification-button" type="button" aria-label="การแจ้งเตือน" data-toggle-notifications>♧${unreadCount ? `<span class="notification-count">${unreadCount > 9 ? "9+" : unreadCount}</span>` : ""}</button><section class="notification-panel hidden" data-notification-panel><div class="notification-panel-heading"><strong>การแจ้งเตือน</strong><button class="text-link" type="button" data-mark-notifications-read>อ่านทั้งหมด</button></div><button class="notification-permission" type="button" data-enable-notifications>เปิดการแจ้งเตือนบนอุปกรณ์</button>${notifications.length ? notifications.map((item) => `<article class="notification-item ${item.read ? "" : "unread"}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><small>${escapeHtml(new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt)))}</small></article>`).join("") : '<p class="muted notification-empty">ยังไม่มีการแจ้งเตือน</p>'}</section></div>`;
}

function refreshNotificationCenter() {
  const center = document.querySelector(".notification-menu");
  if (!center || !activeUser) return;
  const wasOpen = !center.querySelector("[data-notification-panel]").classList.contains("hidden");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderNotificationCenter(activeUser);
  const replacement = wrapper.firstElementChild;
  if (wasOpen) replacement.querySelector("[data-notification-panel]").classList.remove("hidden");
  center.replaceWith(replacement);
}

function renderShell(page, user) {
  const links = MENU.map(([key, icon, label, href]) => `<a class="nav-link ${page === key ? "active" : ""}" href="${href}"><span class="nav-icon">${icon}</span><span>${label}</span></a>`).join("");
  const notificationCenter = renderNotificationCenter(user);
  return `<div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="dashboard.html"><span class="brand-mark">✦</span><span>easy<span class="brand-light">clean</span><small>สะอาดง่าย ในแบบคุณ</small></span></a>
      <div class="workspace-label">เมนูหลัก</div><nav class="side-nav">${links}</nav>
      <div class="sidebar-help"><div class="help-icon">?</div><strong>ต้องการความช่วยเหลือ?</strong><p>ทีมงานของเราพร้อมดูแลคุณทุกวัน</p><a href="tel:021234567">โทร 02-123-4567 <span>↗</span></a></div>
      <a class="profile-mini" href="account.html"><span class="avatar avatar-small">${escapeHtml((user.firstName || user.name || "E").slice(0, 1))}</span><span><strong>${escapeHtml(user.firstName ? `${user.firstName} ${user.lastName || ""}` : user.name)}</strong><small>${user.role === "admin" ? "ผู้ดูแลระบบ" : user.role === "job-seeker" ? "ผู้สมัครงาน" : "บัญชีลูกค้า"}</small></span><span class="profile-more">⚙</span></a>
    </aside>
    <main class="main-content"><header class="topbar"><div class="breadcrumb"><a href="dashboard.html">หน้าหลัก</a><span>/</span>${PAGE_TITLES[page]}</div><div class="top-actions"><a class="support-link" href="tel:021234567">☎ <span>ติดต่อเรา</span></a>${notificationCenter}<span class="top-divider"></span><span class="avatar">${escapeHtml((user.firstName || user.name || "E").slice(0, 1))}</span><span class="top-user">${escapeHtml(user.firstName || user.name)} <button type="button" class="signout-inline" data-signout>ออกจากระบบ</button></span></div></header>
      <div class="page-wrap" id="page-content">${pageContent(page, user)}</div>
    </main>
  </div>`;
}

function serviceIllustration(kind) {
  const illustrations = {
    home: '<svg viewBox="0 0 180 120" aria-hidden="true"><path d="M37 57 90 18l53 39" fill="#68afe4"/><path d="M48 54v49h84V54L90 25z" fill="#f8fcff"/><path d="M80 103V70h22v33" fill="#3585bf"/><path d="M58 67h15v15H58zM108 67h15v15h-15z" fill="#b9e8ff"/><path d="M25 102h130" stroke="#6aaed9" stroke-width="4" stroke-linecap="round"/><path d="M37 101q2-17 13-21 1 11-2 21m95 0q1-15 12-19 2 11-2 19" fill="#74bd9e"/></svg>',
    condo: '<svg viewBox="0 0 180 120" aria-hidden="true"><path d="M52 105V27q0-7 7-7h62q7 0 7 7v78z" fill="#f8fcff" stroke="#4b9bd1" stroke-width="4"/><path d="M44 105h92" stroke="#4b9bd1" stroke-width="5" stroke-linecap="round"/><path d="M67 35h15v15H67zm31 0h15v15H98zM67 61h15v15H67zm31 0h15v15H98zM67 87h15v15H67zm31 0h15v15H98z" fill="#9dd8f5"/><path d="M82 20v-8h16v8" fill="none" stroke="#4b9bd1" stroke-width="4"/></svg>',
    bathroom: '<svg viewBox="0 0 180 120" aria-hidden="true"><path d="M48 30V18q0-9 9-9h19q9 0 9 9v20" fill="none" stroke="#438fc4" stroke-width="5" stroke-linecap="round"/><path d="M79 18h29q10 0 10 10v4" fill="none" stroke="#438fc4" stroke-width="5" stroke-linecap="round"/><path d="M55 48h88v19q0 26-25 26H80Q55 93 55 67z" fill="#f8fcff" stroke="#4b9bd1" stroke-width="4"/><path d="M64 59h71v9q0 15-17 15H81Q64 83 64 68z" fill="#b9e8ff"/><path d="M69 94v10m58-10v10" stroke="#438fc4" stroke-width="5" stroke-linecap="round"/><path d="M98 38v8m14-8v8m14-8v8" stroke="#63bce9" stroke-width="4" stroke-linecap="round"/><path d="m145 27 3 6 6 2-6 3-3 6-2-6-6-3 6-2z" fill="#fff"/></svg>',
    kitchen: '<svg viewBox="0 0 180 120" aria-hidden="true"><path d="M33 42h114v62H33z" fill="#f8fcff" stroke="#4b9bd1" stroke-width="4"/><path d="M27 39h126v10H27z" fill="#68afe4"/><path d="M49 34V22h82v12" fill="#dff4ff" stroke="#438fc4" stroke-width="4" stroke-linejoin="round"/><path d="M57 22v-8h66v8" fill="none" stroke="#438fc4" stroke-width="4" stroke-linejoin="round"/><path d="M45 61h57v35H45z" fill="#dff4ff"/><path d="M112 58h25v38h-25z" fill="#b9e8ff"/><path d="M112 58q12-14 25 0" fill="#f8fcff" stroke="#438fc4" stroke-width="3"/><path d="M117 77h15m-15 8h15" stroke="#68afe4" stroke-width="3" stroke-linecap="round"/><path d="M55 69h36m-36 8h36m-36 8h36" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="73" cy="58" r="4" fill="#438fc4"/><circle cx="87" cy="58" r="4" fill="#438fc4"/><path d="M41 104v6m98-6v6" stroke="#438fc4" stroke-width="4" stroke-linecap="round"/></svg>',
    bedroom: '<svg viewBox="0 0 180 120" aria-hidden="true"><path d="M38 43v63m104-63v63" stroke="#438fc4" stroke-width="7" stroke-linecap="round"/><path d="M40 89h101v14H40z" fill="#4b91c3"/><path d="M44 76q0-11 11-11h75q11 0 11 11v16H44z" fill="#f8fcff" stroke="#4b9bd1" stroke-width="3"/><path d="M49 72q0-5 7-5h22q7 0 7 6v11H49z" fill="#fff" stroke="#8abbdc" stroke-width="2"/><path d="M51 73h30" stroke="#c0dff2" stroke-width="2" stroke-linecap="round"/><path d="M88 70h38q7 0 7 7v15H88z" fill="#a9d2ee"/><path d="M90 73h37" stroke="#dff3ff" stroke-width="3" stroke-linecap="round"/><path d="M88 70v22" stroke="#6da9d1" stroke-width="2"/><path d="M44 83q20-5 44 1 24-7 42 0v9H44z" fill="#77b4dc"/><path d="M44 83q20-5 44 1 24-7 42 0" fill="none" stroke="#f8fcff" stroke-width="3"/><path d="M48 104v8m85-8v8" stroke="#438fc4" stroke-width="5" stroke-linecap="round"/><path d="M32 43h116" stroke="#438fc4" stroke-width="5" stroke-linecap="round"/><path d="M28 45q0-7 8-7h4v22h-4q-8 0-8-7z" fill="#72add2"/></svg>',
    office: '<svg viewBox="0 0 180 120" aria-hidden="true"><path d="M39 69h102v9H39z" fill="#4b9bd1"/><path d="M48 78v28m84-28v28" stroke="#438fc4" stroke-width="5" stroke-linecap="round"/><path d="M68 28h48v37H68z" fill="#f8fcff" stroke="#438fc4" stroke-width="4"/><path d="M74 34h36v25H74z" fill="#a9e1fa"/><path d="M92 65v4m-10 0h20" stroke="#438fc4" stroke-width="4" stroke-linecap="round"/><path d="M57 81h68" stroke="#8dc9ed" stroke-width="3"/><path d="M145 70q-1-18 9-24 8 8 5 24m-15 0q-10-12-19-8 2 10 19 14" fill="#78bf9e"/><path d="M140 73h22l-3 32h-16z" fill="#68afe4"/></svg>'
  };
  return illustrations[kind] || "";
}

function serviceCard(service) {
  return `<article class="service-card" data-category="${escapeHtml(service.category)}" data-size="${service.size}" data-price="${service.price}" data-rating="${service.rating}">
    <a class="service-visual visual-${service.kind}" href="booking.html?service=${encodeURIComponent(service.name)}" aria-label="จอง${service.name}"><span class="service-label">${service.category}</span>${serviceIllustration(service.kind)}<span class="visual-spark">✦</span></a>
    <div class="service-card-body"><div class="service-title"><h3>${service.name}</h3><span class="rating">★ ${service.rating} <small>รีวิว</small></span></div><p>${service.description}</p><div class="service-meta"><span>◷ ${service.time}</span><span>✓ อุปกรณ์ครบ</span></div><div class="service-price"><span>เริ่มต้น <strong>฿${formatPrice(service.price)}</strong></span><a href="booking.html?service=${encodeURIComponent(service.name)}" aria-label="จอง${service.name}">→</a></div></div>
  </article>`;
}

function renderAdminDashboard(user) {
  const allBookings = getBookings();
  const allPayments = read(STORE.payments, []);
  const allApplications = read(STORE.applications, []);
  const allReviews = read(STORE.reviews, []);
  const acceptedApplicants = allApplications.filter((application) => application.status === "ผ่านการคัดเลือก");
  const paidBookings = allBookings.filter((booking) => isBookingPaid(booking));
  const revenue = paidBookings.reduce((sum, booking) => sum + Number(booking.price || 0), 0);
  const averageRating = allReviews.length ? allReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / allReviews.length : 0;
  const statusOptions = ["รอการยืนยัน", "ยืนยันแล้ว", "กำลังเดินทาง", "กำลังทำความสะอาด", "เสร็จสิ้น", "ยกเลิกแล้ว"];
  return `${pageHeading("จัดการระบบ", "แดชบอร์ดผู้ดูแลระบบ")}<div class="admin-view-tag admin-demo-warning">โหมดต้นแบบ · รายการจองและการชำระเงินจัดเก็บบนเซิร์ฟเวอร์ ส่วนบริการและรีวิวจัดเก็บในเบราว์เซอร์</div>
    <div class="admin-metrics">
      <article><span class="admin-metric-icon mint">▣</span><span>การจองทั้งหมด<strong>${allBookings.filter((booking) => booking.status !== "ยกเลิกแล้ว").length}</strong><small>ไม่รวมรายการยกเลิก</small></span></article>
      <article><span class="admin-metric-icon peach">฿</span><span>รายได้ที่ยืนยันแล้ว<strong>฿${formatPrice(revenue)}</strong><small>${paidBookings.length} รายการชำระ</small></span></article>
      <article><span class="admin-metric-icon lilac">♧</span><span>ผู้สมัครงาน<strong>${allApplications.length}</strong><small>${allApplications.filter((item) => item.status === "รอตรวจสอบ").length} รอตรวจสอบ</small></span></article>
      <article><span class="admin-metric-icon pale-yellow">★</span><span>คะแนนรีวิวเฉลี่ย<strong>${averageRating ? averageRating.toFixed(1) : "—"}</strong><small>${allReviews.length} รีวิว</small></span></article>
    </div>
    <section class="panel-card form-panel admin-data-panel"><h2>จัดการบัญชีลูกค้าและผู้สมัครงาน</h2>${adminUsers.length ? `<div class="admin-list">${adminUsers.map((account) => `<div class="admin-list-row"><span><strong>${escapeHtml(`${account.firstName} ${account.lastName}`.trim() || account.email)}</strong><small>${escapeHtml(account.email)} · ${escapeHtml(account.phone || "ไม่มีเบอร์โทร")}</small></span><select data-admin-user-role="${escapeHtml(account.id)}" ${account.role === "admin" ? "disabled" : ""}><option value="customer" ${account.role === "customer" ? "selected" : ""}>ลูกค้า</option><option value="job-seeker" ${account.role === "job-seeker" ? "selected" : ""}>ผู้สมัครงาน</option></select><select data-admin-user-active="${escapeHtml(account.id)}" ${account.role === "admin" || account.id === user.id ? "disabled" : ""}><option value="true" ${account.active !== false ? "selected" : ""}>ใช้งาน</option><option value="false" ${account.active === false ? "selected" : ""}>ระงับ</option></select></div>`).join("")}</div>` : '<p class="muted">ไม่พบข้อมูลบัญชีผู้ใช้</p>'}</section>
    <section class="panel-card form-panel admin-data-panel"><h2>รายการซื้อบริการและความคืบหน้า</h2><p class="muted small-copy">แสดงผู้จอง สถานะชำระเงิน และสถานะการให้บริการ รวมรายการที่ยกเลิกแล้ว</p>${allBookings.length ? `<div class="admin-list admin-bookings-scroll">${allBookings.map((booking) => {
      const customer = adminUsers.find((account) => account.email === booking.email);
      const payment = allPayments.find((item) => item.bookingId === booking.id && item.email === booking.email);
      const paid = isBookingPaid(booking, allPayments);
      const progressStatus = booking.status === "ยกเลิกแล้ว" ? "ยกเลิกแล้ว" : paid ? booking.status : "รอชำระเงิน";
      const paymentStatus = payment?.status || "ยังไม่ชำระ";
      const availableStatuses = paid ? statusOptions : ["รอชำระเงิน", "ยกเลิกแล้ว"];
      if (!availableStatuses.includes(booking.status)) availableStatuses.push(booking.status);
      return `<article class="admin-list-row admin-booking-row ${booking.status === "ยกเลิกแล้ว" ? "booking-cancelled" : ""}"><div class="admin-booking-customer"><strong>${escapeHtml(`${customer?.firstName || ""} ${customer?.lastName || ""}`.trim() || "ไม่พบชื่อบัญชี")}</strong><small>${escapeHtml(booking.email)}</small><small>จอง ${escapeHtml(booking.id)} · ${escapeHtml(booking.date)} เวลา ${escapeHtml(booking.time || "—")}</small></div><div class="admin-booking-service"><strong>${escapeHtml(booking.service)}</strong><small>ยอดบริการ ฿${formatPrice(booking.price)}</small><small>ชำระเงิน: ${bookingStatus(paymentStatus)}</small></div><div class="admin-booking-progress"><small>ความคืบหน้าบริการ</small>${bookingStatus(progressStatus)}<select aria-label="อัปเดตสถานะบริการ ${escapeHtml(booking.id)}" data-admin-booking="${escapeHtml(booking.id)}">${availableStatuses.map((status) => `<option value="${status}" ${status === booking.status ? "selected" : ""}>${status}</option>`).join("")}</select></div><div class="admin-booking-assignment"><small>พนักงาน</small><select aria-label="มอบหมายพนักงาน ${escapeHtml(booking.id)}" data-admin-assignment="${escapeHtml(booking.id)}"><option value="">ยังไม่มอบหมาย</option>${acceptedApplicants.map((applicant) => `<option value="${escapeHtml(applicant.id)}" ${booking.assignedWorker === applicant.id ? "selected" : ""}>${escapeHtml(applicant.name)}</option>`).join("")}</select></div></article>`;
    }).join("")}</div>` : '<p class="muted">ยังไม่มีรายการจองบริการ</p>'}</section>
    <div class="two-column section-block"><section class="panel-card form-panel"><h2>ตรวจสอบการชำระเงินและหลักฐาน</h2>${allPayments.length ? allPayments.map((payment) => `<div class="admin-list-row"><span><strong>${escapeHtml(payment.reference)}</strong><small>${escapeHtml(payment.bookingId)} · ${escapeHtml(payment.filename || payment.method)}</small>${payment.slipDataUrl ? `<a href="${escapeHtml(payment.slipDataUrl)}" download="${escapeHtml(payment.filename || "payment-slip")}">เปิดหลักฐานที่แนบ</a>` : ""}</span><select data-admin-payment="${escapeHtml(payment.reference)}"><option ${payment.status === "รอตรวจสอบ" ? "selected" : ""}>รอตรวจสอบ</option><option ${payment.status === "ชำระแล้ว" ? "selected" : ""}>ชำระแล้ว</option><option ${payment.status === "ไม่สำเร็จ" ? "selected" : ""}>ไม่สำเร็จ</option></select></div>`).join("") : '<p class="muted">ไม่มีรายการชำระเงิน</p>'}</section>
      <section class="panel-card form-panel"><h2>ตรวจสอบผู้สมัครงาน</h2>${allApplications.length ? allApplications.map((application) => `<div class="admin-list-row"><span><strong>${escapeHtml(application.name)}</strong><small>${escapeHtml(application.email)} · ${escapeHtml(application.phone)} · ${escapeHtml(application.experience)} · ${escapeHtml(application.skill)}</small>${application.details ? `<small>${escapeHtml(application.details)}</small>` : ""}${application.cvDataUrl ? `<a class="text-link" href="${escapeHtml(application.cvDataUrl)}" download="${escapeHtml(application.filename)}">ดาวน์โหลด ${escapeHtml(application.filename)}</a>` : `<small>${escapeHtml(application.filename || "ไม่ได้แนบเอกสาร")}</small>`}</span><select data-admin-application="${escapeHtml(application.id)}"><option ${application.status === "รอตรวจสอบ" ? "selected" : ""}>รอตรวจสอบ</option><option ${application.status === "ผ่านการคัดเลือก" ? "selected" : ""}>ผ่านการคัดเลือก</option><option ${application.status === "ไม่ผ่าน" ? "selected" : ""}>ไม่ผ่าน</option></select></div>`).join("") : '<p class="muted">ไม่มีใบสมัคร</p>'}</section></div>
    `;
}

function pageContent(page, user) {
  const bookings = getBookings().filter((booking) => booking.email === user.email && booking.status !== "ยกเลิกแล้ว");
  const latest = bookings[0];
  if (page === "dashboard") return `
    <section class="welcome-row"><div><p class="eyebrow">${new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(new Date())}</p><h1 class="welcome-title">Welcome <span>Easyclean</span><i aria-hidden="true">✦</i></h1><p class="muted">บ้านสะอาดสดใส เริ่มต้นได้ง่าย ๆ ที่นี่</p></div><a class="button button-dark" href="booking.html"><span>＋</span> จองบริการใหม่</a></section>
    <section class="summary-grid"><article class="summary-card"><div class="summary-icon mint">▣</div><div><p>การจองทั้งหมด</p><strong>${bookings.length} <small>ครั้ง</small></strong></div></article><article class="summary-card"><div class="summary-icon lilac">☆</div><div><p>รีวิวของฉัน</p><strong>${read(STORE.reviews, []).filter((item) => item.email === user.email).length} <small>รายการ</small></strong></div></article><article class="summary-card"><div class="summary-icon peach">♧</div><div><p>ที่อยู่ที่บันทึกไว้</p><strong>${read(STORE.addresses, []).filter((item) => item.email === user.email).length} <small>แห่ง</small></strong></div></article></section>
    <section class="hero-banner"><div class="hero-copy"><span class="hero-tag">บ้านสะอาด ใจสบาย</span><h2>ให้เราดูแลบ้าน<br>ในวันที่คุณอยากพัก</h2><p>แม่บ้านมืออาชีพ พร้อมดูแลทุกพื้นที่ของคุณ</p><a class="button button-white" href="services.html">เลือกบริการ <span>→</span></a></div><div class="hero-art" aria-hidden="true"><div class="sun-shape"></div><div class="hero-soap-bubbles"><i></i><i></i><i></i><i></i><i></i></div><div class="hero-cleaner"><svg viewBox="0 0 180 210"><ellipse cx="92" cy="197" rx="66" ry="8" fill="#4a91c4" fill-opacity=".12"/><path d="M37 193h113" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/><g transform="rotate(-13 39 110)"><path d="M41 39l-10 124" stroke="#eaf9ff" stroke-width="8" stroke-linecap="round"/><path d="M41 39l-10 124" stroke="#78b8df" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/><path d="M15 159q15 9 29 1l9 17q-22 13-45-1z" fill="#f5fbff"/><path d="M13 176l-5 9m15-5-3 10m15-13v10m12-13 4 9" stroke="#75b9df" stroke-width="4" stroke-linecap="round"/></g><g transform="translate(67 22)"><path d="M69 130l3 31" stroke="#f4fbff" stroke-width="11" stroke-linecap="round"/><path d="M66 159l2 27h22l-7-27" fill="#2c78b4"/><path d="M65 188h28" stroke="#f7fcff" stroke-width="7" stroke-linecap="round"/><path d="M38 130l-3 31" stroke="#f4fbff" stroke-width="11" stroke-linecap="round"/><path d="M31 159l-5 27h23l-5-27" fill="#2c78b4"/><path d="M21 188h29" stroke="#f7fcff" stroke-width="7" stroke-linecap="round"/><path d="M42 54q-21 7-25 34l-8 43h75L77 83Q71 57 55 54z" fill="#fff"/><path d="M27 67q-14 3-20 18L-1 108l10 6 22-24m50-22q15 5 20 21l8 21-10 5-18-22" fill="none" stroke="#d7f0ff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 88h52l8 44H17z" fill="#43a0d8"/><path d="M37 90v40m25-40v40" stroke="#bce9ff" stroke-width="3"/><circle cx="49" cy="31" r="20" fill="#ffd9bc"/><path d="M29 31q0-26 22-27 21 1 21 26l-9-8-22-1z" fill="#19466a"/><path d="M39 42q10 7 19 0" fill="none" stroke="#cf856e" stroke-width="2" stroke-linecap="round"/><path d="M91 80l11-12 13 13-8 8-12-5" fill="#f2fbff"/><path d="M109 81l8-10m-5 14 12-8m-11 13 14-1" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g><g transform="translate(113 145)"><path d="M4 13h34l-4 34q-1 5-6 5H14q-5 0-6-5z" fill="#f7fcff"/><path d="M1 10h40v7H1z" fill="#75c5eb"/><path d="M13 25h16" stroke="#addffa" stroke-width="3" stroke-linecap="round"/><path d="M15 5q0-7 5-7t5 7m5 0q0-6 4-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g><path d="M139 55l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#fff"/><circle cx="22" cy="91" r="4" fill="#fff" fill-opacity=".8"/></svg></div><div class="house-art"><div class="roof"></div><div class="house-body"><div class="window"></div><div class="door"></div></div></div><div class="clean-bubble">✦ บ้านสะอาดแล้ว!</div></div></section>
    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">เลือกบริการที่เหมาะกับคุณ</p><h2>บริการยอดนิยม</h2></div><a class="text-link" href="services.html">ดูบริการทั้งหมด →</a></div><div class="service-grid">${SERVICES.slice(0, 3).map(serviceCard).join("")}</div></section>
    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">อัปเดตล่าสุด</p><h2>การจองของฉัน</h2></div><a class="text-link" href="tracking.html">ดูการจองทั้งหมด →</a></div>${latest ? `<article class="booking-status-card"><div class="booking-status-top"><div class="booking-id"><span class="booking-icon">⌂</span><div><h3>${escapeHtml(latest.service)} ${bookingStatus(latest.status)}</h3><p>หมายเลขการจอง <strong>${escapeHtml(latest.id)}</strong></p></div></div><a class="button button-outline" href="tracking.html">ดูรายละเอียด</a></div><div class="booking-details-grid"><div><span class="detail-label">วันที่และเวลา</span><strong>${escapeHtml(latest.date)} · ${escapeHtml(latest.time)}</strong></div><div><span class="detail-label">ที่อยู่บริการ</span><strong>${escapeHtml(latest.address || "ยังไม่ได้ระบุ")}</strong></div><div><span class="detail-label">รูปแบบบริการ</span><strong>${escapeHtml(latest.cleaningType)}</strong></div><div><span class="detail-label">ยอดชำระ</span><strong>฿${formatPrice(latest.price)}</strong></div></div></article>` : `<div class="empty-state"><span>⌂</span><strong>ยังไม่มีรายการจอง</strong><p>เลือกบริการที่ต้องการ แล้วนัดวันเวลาที่สะดวก</p><a class="button button-green" href="booking.html">เริ่มจองบริการ</a></div>`}</section>`;
  if (page === "services") return `${pageHeading("บริการของเรา", "ค้นหาบริการทำความสะอาด", '<a class="button button-dark" href="booking.html">จองบริการ <span>→</span></a>')}<div class="service-toolbar"><div class="filter-pills"><button class="filter-pill selected" data-filter="all" type="button">ทั้งหมด</button><button class="filter-pill" data-filter="large" type="button">ขนาดใหญ่</button><button class="filter-pill" data-filter="small" type="button">ขนาดเล็ก</button></div><label class="sort-select">เรียงตาม <select id="service-sort"><option value="recommended">แนะนำ</option><option value="price">ราคาต่ำไปสูง</option><option value="rating">คะแนนรีวิว</option></select></label></div><div class="service-grid service-list">${SERVICES.map(serviceCard).join("")}</div><div class="info-panel"><strong>บริการทุกประเภทประกอบด้วย</strong><p>อุปกรณ์ทำความสะอาดพื้นฐาน · พนักงานผ่านการตรวจสอบ · แจ้งรายละเอียดพื้นที่ก่อนเริ่มงาน · ช่องทางติดต่อทีมดูแลลูกค้า</p></div>`;
  if (page === "booking") {
    const selectedService = new URLSearchParams(location.search).get("service") || "";
    const addresses = read(STORE.addresses, []).filter((item) => item.email === user.email).sort((a, b) => Number(b.default) - Number(a.default));
    return `${pageHeading("นัดหมายบริการ", "จองบริการทำความสะอาด")}<div class="step-indicator booking-steps"><b>1</b> รายละเอียดบริการ <i>→</i><span>2</span> ที่อยู่และนัดหมาย <i>→</i><span>3</span> ชำระเงิน</div><form id="booking-form" class="panel-card form-panel"><div class="form-grid"><label>ประเภทบริการ<select name="service" id="booking-service" required>${SERVICES.map((item) => `<option value="${item.name}" ${item.name === selectedService ? "selected" : ""}>${item.name} · เริ่ม ฿${formatPrice(item.price)}</option>`).join("")}</select></label><label>รูปแบบบริการ<select name="cleaningType"><option>ทำความสะอาดทั่วไป</option></select></label><label>วันที่ต้องการ<input type="date" name="date" min="${new Date().toISOString().slice(0, 10)}" required></label><label>เวลาที่ต้องการ<select name="time"><option>09:00</option><option>13:00</option><option>16:00</option></select></label><label>จำนวนห้อง<select name="rooms"><option value="1">1 ห้องนอน · 1 ห้องน้ำ</option><option value="2" selected>2 ห้องนอน · 1 ห้องน้ำ</option><option value="3">3 ห้องนอน · 2 ห้องน้ำ</option><option value="4">4 ห้องนอนขึ้นไป</option></select></label><label>จำนวนผู้ให้บริการ<select name="workers"><option value="1">พนักงาน 1 คน</option><option value="2">พนักงาน 2 คน</option></select></label><label class="form-wide">เลือกที่อยู่<select name="addressId" required>${addresses.length ? addresses.map((address) => `<option value="${escapeHtml(address.id)}">${escapeHtml(address.label)} — ${escapeHtml(address.street)}</option>`).join("") : '<option value="">เพิ่มที่อยู่ในหน้าที่อยู่ของฉัน</option>'}</select></label><label class="form-wide">รายละเอียดเพิ่มเติม<textarea name="notes" rows="3" placeholder="จุดสังเกตหรือรายละเอียดที่พนักงานควรทราบ"></textarea></label></div><div class="booking-total"><span><small>ยอดรวมโดยประมาณ</small><strong id="booking-price">฿1,290</strong><small id="booking-price-note">ราคาขึ้นอยู่กับรูปแบบบริการและจำนวนห้อง</small></span><button class="button button-green" type="submit">ไปชำระเงิน <span>→</span></button></div></form>`;
  }
  if (page === "tracking") return `${pageHeading("สถานะและประวัติ", "ติดตามการจอง")}<div class="history-list">${bookings.length ? bookings.map((booking) => {
    const paid = isBookingPaid(booking);
    const displayedStatus = paid ? booking.status : booking.status === "ยกเลิกแล้ว" ? booking.status : "รอชำระเงิน";
    return `<article class="booking-status-card tracking-card"><div class="booking-status-top"><div class="booking-id"><span class="booking-icon">⌂</span><div><h3>${escapeHtml(booking.service)} ${bookingStatus(displayedStatus)}</h3><p>หมายเลขการจอง <strong>${escapeHtml(booking.id)}</strong></p></div></div><div class="booking-actions">${booking.status !== "เสร็จสิ้น" && booking.status !== "ยกเลิกแล้ว" ? `<button class="button button-quiet" data-cancel-booking="${escapeHtml(booking.id)}" type="button">ยกเลิก</button>` : ""}${!paid && booking.status !== "ยกเลิกแล้ว" ? `<a class="button button-green" href="payments.html?booking=${encodeURIComponent(booking.id)}">ชำระเงินเพื่อไปต่อ</a>` : ""}${paid && booking.status !== "ยกเลิกแล้ว" && !read(STORE.reviews, []).some((review) => review.bookingId === booking.id) ? `<a class="button button-outline" href="reviews.html?booking=${encodeURIComponent(booking.id)}">เขียนรีวิว</a>` : ""}</div></div><div class="booking-details-grid"><div><span class="detail-label">วันที่และเวลา</span><strong>${escapeHtml(booking.date)} · ${escapeHtml(booking.time)}</strong></div><div><span class="detail-label">ที่อยู่บริการ</span><strong>${escapeHtml(booking.address || "ยังไม่ได้ระบุ")}</strong></div><div><span class="detail-label">รูปแบบบริการ</span><strong>${escapeHtml(booking.cleaningType)}</strong></div><div><span class="detail-label">ยอดชำระ</span><strong>฿${formatPrice(booking.price)}</strong></div></div>${paid ? `${trackingProgress(booking)}<p class="muted tracking-footnote">สถานะอัปเดตโดยพนักงาน · หากต้องการความช่วยเหลือ <a href="tel:021234567">ติดต่อทีมงาน</a></p>` : booking.status !== "ยกเลิกแล้ว" ? '<p class="muted tracking-footnote">ต้องยืนยันการชำระเงินก่อนจึงจะดำเนินการจองต่อได้</p>' : ""}</article>`;
  }).join("") : '<div class="empty-state"><span>◷</span><strong>ยังไม่มีประวัติการจอง</strong><p>เมื่อยืนยันการจองแล้ว สถานะจะแสดงที่หน้านี้</p><a class="button button-green" href="booking.html">จองบริการ</a></div>'}</div>`;
  if (page === "addresses") {
    const addresses = read(STORE.addresses, []).filter((item) => item.email === user.email);
    return `${pageHeading("จัดการสถานที่", "ที่อยู่ของฉัน")}<div class="two-column address-page-grid"><div>${addresses.length ? addresses.map((address) => `<article class="address-card address-large"><div class="address-title"><span class="address-icon">⌂</span><strong>${escapeHtml(address.label)}</strong>${address.default ? '<span class="default-chip">ค่าเริ่มต้น</span>' : ""}<button type="button" data-delete-address="${escapeHtml(address.id)}" aria-label="ลบที่อยู่">ลบ</button></div><p>${escapeHtml(address.house)} ${escapeHtml(address.street)}<br>${escapeHtml(address.subdistrict)} ${escapeHtml(address.district)} ${escapeHtml(address.province)} ${escapeHtml(address.postcode)}</p><small>จุดสังเกต: ${escapeHtml(address.note || "ไม่ได้ระบุ")}</small>${Number.isFinite(address.latitude) && Number.isFinite(address.longitude) ? `<small class="saved-coordinates">ตำแหน่ง: ${address.latitude.toFixed(5)}, ${address.longitude.toFixed(5)}</small>` : ""}</article>`).join("") : '<div class="empty-state"><span>⌖</span><strong>ยังไม่มีที่อยู่ที่บันทึกไว้</strong><p>เพิ่มที่อยู่ก่อนเริ่มจองบริการ</p></div>'}</div><form id="address-form" class="panel-card form-panel"><h2>เพิ่มที่อยู่ใหม่</h2><div class="form-grid"><label>ชื่อที่อยู่<select name="label"><option>บ้าน</option><option>ที่ทำงาน</option><option>อื่น ๆ</option></select></label><label>บ้านเลขที่<input name="house" required></label><label class="form-wide">ถนน<input name="street" required></label><label>ตำบล / แขวง<input name="subdistrict" required></label><label>อำเภอ / เขต<input name="district" required></label><label>จังหวัด<input name="province" required></label><label>รหัสไปรษณีย์<input name="postcode" inputmode="numeric" pattern="[0-9]{5}" required></label><label class="form-wide">จุดสังเกต / ติดต่อหน้างาน<input name="note" placeholder="เช่น บ้านสีขาว โทรก่อนถึง"></label></div><section class="address-map-section"><div class="address-map-heading"><strong>ปักหมุดตำแหน่ง</strong><button class="button button-outline" type="button" data-locate-address>⌖ ใช้ตำแหน่งปัจจุบัน</button></div><p class="muted">คลิกแผนที่เพื่อวางหมุด หรือกดค้างที่หมุดเพื่อลากไปยังตำแหน่งที่ต้องการ</p><p class="address-geocode-disclosure">เมื่อปักหมุด ระบบจะส่งพิกัดไปยัง OpenStreetMap เพื่อค้นหาที่อยู่ โปรดตรวจสอบข้อมูลที่เติมให้อัตโนมัติก่อนบันทึก</p><div id="address-map" role="application" aria-label="แผนที่สำหรับปักหมุดที่อยู่"></div><input type="hidden" name="latitude"><input type="hidden" name="longitude"><p class="address-coordinates" id="address-coordinates" aria-live="polite">ยังไม่ได้ปักหมุด</p><p class="address-geocode-status" id="address-geocode-status" role="status" aria-live="polite">ปักหมุดบนแผนที่เพื่อค้นหาที่อยู่</p><p class="address-map-status" id="address-map-status">แผนที่ © OpenStreetMap</p></section><label class="check-row"><input type="checkbox" name="default" ${addresses.length ? "" : "checked"}> ตั้งเป็นที่อยู่เริ่มต้น</label><button class="button button-green" type="submit">บันทึกที่อยู่</button></form></div>`;
  }
  if (page === "payments") {
    const payments = read(STORE.payments, []).filter((item) => item.email === user.email);
    const payable = unpaidBookings(user.email);
    const requestedBooking = new URLSearchParams(location.search).get("booking");
    const selectedBooking = payable.some((booking) => booking.id === requestedBooking) ? requestedBooking : payable[0]?.id || "";
    return `${pageHeading("รายการและหลักฐาน", "การชำระเงิน")}<div class="step-indicator booking-steps"><b>1</b> รายละเอียดบริการ <i>→</i><b>2</b> ชำระเงิน <i>→</i><span>3</span> ติดตามการจอง</div><div class="two-column payment-page-grid"><section class="panel-card form-panel"><h2>รายการรอชำระ</h2>${payable.length ? payable.map((booking) => `<article class="payable-row"><div><strong>${escapeHtml(booking.service)}</strong><small>${escapeHtml(booking.id)} · ${escapeHtml(booking.date)}</small></div><strong>฿${formatPrice(booking.price)}</strong><button type="button" class="button button-outline" data-pay="${escapeHtml(booking.id)}">เลือกชำระ</button></article>`).join("") : '<div class="empty-state"><strong>ไม่มีรายการค้างชำระ</strong><p>เมื่อเริ่มจองบริการ รายการจะแสดงที่นี่</p><a class="button button-green" href="booking.html">จองบริการ</a></div>'}</section><section class="panel-card form-panel"><h2>วิธีชำระเงิน</h2><p class="muted">โหมดทดสอบ: เลือกวิธีแล้วกดยืนยันการชำระเงินเพื่อไปต่อ</p>${payable.length ? `<form id="payment-form"><label>เลือกรายการจอง<select name="bookingId" required>${payable.map((booking) => `<option value="${escapeHtml(booking.id)}" ${booking.id === selectedBooking ? "selected" : ""}>${escapeHtml(booking.id)} · ฿${formatPrice(booking.price)}</option>`).join("")}</select></label><label>วิธีชำระ<select name="method" id="payment-method"><option value="qr">โอนเงินผ่าน QR Code</option><option value="cod">เก็บเงินปลายทาง</option></select></label><section class="qr-payment-details" id="qr-payment-details"><div class="payment-qr-card"><img src="assets/promptpay-qr.png" alt="PromptPay QR Code สำหรับโอนเงินให้ Easy Clean"><div><strong>สแกน QR Code เพื่อชำระเงิน</strong><span>PromptPay · บัญชี xxx-x-x0628-x</span><small>เลขที่อ้างอิง 004999220408735</small><small>โหมดทดสอบ: ยืนยันในหน้านี้ได้โดยไม่ต้องแนบสลิป</small></div></div><label class="upload-slip"><input type="file" name="slip" accept="image/*"><span class="upload-icon">↑</span><span><strong>แนบหลักฐานการโอน (ไม่บังคับ)</strong><small>ใช้สำหรับประกอบการทดสอบเท่านั้น</small></span></label></section><p class="cod-payment-note hidden" id="cod-payment-note">โหมดทดสอบ: กดยืนยันเพื่อบันทึกการชำระเงินปลายทางและไปต่อ</p><button class="button button-green" id="payment-submit" type="submit">ยืนยันการชำระเงิน</button></form>` : '<div class="empty-state"><strong>ชำระครบแล้ว</strong><p>ไม่มีรายการที่ต้องชำระก่อนดำเนินการต่อ</p></div>'}</section></div><section class="section-block panel-card form-panel"><h2>ประวัติการชำระเงิน</h2>${payments.length ? payments.map((payment) => `<div class="payable-row"><div><strong>${escapeHtml(payment.bookingId)}</strong><small>${escapeHtml(payment.method)} · อ้างอิง ${escapeHtml(payment.reference)}${payment.filename ? ` · ${escapeHtml(payment.filename)}` : ""}</small></div>${bookingStatus(payment.status)}<strong>฿${formatPrice(payment.amount)}</strong></div>`).join("") : '<p class="muted">ยังไม่มีประวัติการชำระเงิน</p>'}</section>`;
  }
  if (page === "reviews") {
    const reviews = read(STORE.reviews, []).filter((item) => item.email === user.email);
    const eligible = bookings.filter((booking) => booking.status !== "ยกเลิกแล้ว" && isBookingPaid(booking) && !reviews.some((review) => review.bookingId === booking.id));
    const selectedBookingId = new URLSearchParams(location.search).get("booking");
    return `${pageHeading("แบ่งปันประสบการณ์", "รีวิวบริการ")}<div class="two-column"><form id="review-form" class="panel-card form-panel"><h2>เขียนรีวิว</h2><p class="muted small-copy">โหมดทดสอบ: รีวิวได้ทันทีหลังจากจองบริการ</p>${eligible.length ? `<label>รายการจองที่รีวิวได้<select name="bookingId" required>${eligible.map((booking) => `<option value="${escapeHtml(booking.id)}" ${booking.id === selectedBookingId ? "selected" : ""}>${escapeHtml(booking.id)} · ${escapeHtml(booking.service)}</option>`).join("")}</select></label><label>คะแนนโดยรวม<select name="rating"><option value="5">5 ดาว · ดีมาก</option><option value="4">4 ดาว · ดี</option><option value="3">3 ดาว · ปานกลาง</option><option value="2">2 ดาว · ควรปรับปรุง</option><option value="1">1 ดาว · ไม่พอใจ</option></select></label><label>ความคิดเห็น<textarea name="comment" rows="4" placeholder="เล่าประสบการณ์ที่ประทับใจให้เราฟัง" required></textarea></label><div class="form-grid"><label>ความตรงต่อเวลา<select name="punctuality"><option>ดีมาก</option><option>ดี</option><option>ปานกลาง</option></select></label><label>คุณภาพงาน<select name="quality"><option>ดีมาก</option><option>ดี</option><option>ปานกลาง</option></select></label></div><button class="button button-green" type="submit">ส่งรีวิว</button>` : '<div class="empty-state"><span>☆</span><strong>ยังไม่มีรายการที่รีวิวได้</strong><p>เมื่อมีการจองบริการ รายการจะแสดงที่นี่เพื่อให้ทดลองเขียนรีวิว</p></div>'}</form><section class="panel-card form-panel"><h2>รีวิวของฉัน</h2>${reviews.length ? reviews.map((review) => `<article class="review-entry"><span class="avatar review-avatar">${escapeHtml((user.firstName || "ค").slice(0, 1))}</span><div><strong>${escapeHtml(review.service)}</strong><div class="review-stars">${"★".repeat(Number(review.rating))} <small>${review.rating}.0</small></div><p>${escapeHtml(review.comment)}</p><small>${escapeHtml(review.date)}</small></div></article>`).join("") : '<p class="muted">รีวิวที่คุณส่งจะแสดงที่นี่</p>'}</section></div>`;
  }
  if (page === "career") {
    const apps = read(STORE.applications, []).filter((item) => item.email === user.email);
    return `${pageHeading("ร่วมงานกับเรา", "สมัครเป็นพนักงาน")}<div class="two-column career-page-grid"><form id="career-form" class="panel-card form-panel"><h2>ข้อมูลผู้สมัคร</h2><div class="form-grid"><label>ชื่อ-นามสกุล<input name="name" value="${escapeHtml(`${user.firstName || ""} ${user.lastName || ""}`.trim())}" required></label><label>เบอร์โทรศัพท์<input name="phone" type="tel" value="${escapeHtml(user.phone || "")}" required></label><label>ประสบการณ์ทำงาน<input name="experience" placeholder="เช่น 2 ปี" required></label><label>ทักษะที่ถนัด<select name="skill"><option>ทำความสะอาดทั่วไป</option><option>ดูแลสำนักงาน</option><option>ดูแลห้องน้ำ</option><option>ดูแลห้องครัว</option><option>ดูแลห้องนอน</option></select></label><label class="form-wide">ประวัติและรายละเอียดเพิ่มเติม<textarea name="details" rows="4" placeholder="แนะนำประสบการณ์และความสามารถของคุณ"></textarea></label><label class="form-wide">แนบประวัติส่วนตัว (PDF, DOC)<input type="file" name="cv" accept=".pdf,.doc,.docx"></label></div><button class="button button-green" type="submit">ส่งใบสมัคร</button></form><section class="panel-card form-panel"><h2>สถานะใบสมัคร</h2>${apps.length ? apps.map((application) => `<div class="application-status-card"><strong>สมัครตำแหน่งพนักงานทำความสะอาด</strong><p>ส่งใบสมัครเมื่อ ${escapeHtml(application.date)}</p>${bookingStatus(application.status)}<p class="muted">${escapeHtml(application.filename || "ไม่ได้แนบเอกสาร")}</p></div>`).join("") : '<div class="empty-state"><span>♧</span><strong>ยังไม่มีใบสมัคร</strong><p>กรอกข้อมูลเพื่อร่วมงานกับ Easy Clean</p></div>'}<div class="info-panel"><strong>ขั้นตอนการสมัคร</strong><p>ส่งข้อมูล → เจ้าหน้าที่ตรวจสอบ → แจ้งผลการคัดเลือกผ่านช่องทางติดต่อ</p></div></section></div>`;
  }
  if (page === "admin") {
    if (user.role !== "admin") return `${pageHeading("จำกัดสิทธิ์", "เฉพาะผู้ดูแลระบบ")}<div class="empty-state"><span>▦</span><strong>บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้านี้</strong><p>เปลี่ยนประเภทบัญชีในหน้าเข้าสู่ระบบของต้นแบบ หรือใช้บัญชีผู้ดูแลระบบที่ได้รับอนุญาต</p><a class="button button-green" href="dashboard.html">กลับหน้าภาพรวม</a></div>`;
    return renderAdminDashboard(user);
  }
  if (page === "account") return `${pageHeading("ข้อมูลส่วนตัว", "บัญชีและโปรไฟล์")}<div class="two-column"><form id="profile-form" class="panel-card form-panel"><h2>แก้ไขข้อมูลส่วนตัว</h2><div class="form-grid"><label>ชื่อ<input name="firstName" value="${escapeHtml(user.firstName || "")}" required></label><label>นามสกุล<input name="lastName" value="${escapeHtml(user.lastName || "")}" required></label><label class="form-wide">อีเมล<input type="email" value="${escapeHtml(user.email)}" disabled></label><label class="form-wide">เบอร์โทรศัพท์<input name="phone" type="tel" value="${escapeHtml(user.phone || "")}" required></label></div><button class="button button-green" type="submit">บันทึกข้อมูล</button></form><div class="panel-card form-panel"><h2>บัญชีผู้ใช้</h2><p class="muted">ประเภทบัญชี: ${user.role === "admin" ? "ผู้ดูแลระบบ" : user.role === "job-seeker" ? "ผู้สมัครงาน" : "ลูกค้า"}</p>${user.provider === "google" ? '<div class="info-panel"><strong>เข้าสู่ระบบด้วย Google</strong><p>จัดการรหัสผ่านและความปลอดภัยของบัญชีผ่าน Google</p></div>' : '<form id="password-form"><label>รหัสผ่านปัจจุบัน<input name="currentPassword" type="password" minlength="8" required></label><label>รหัสผ่านใหม่<input name="newPassword" type="password" minlength="8" required></label><button class="button button-outline" type="submit">เปลี่ยนรหัสผ่าน</button></form>'}<hr><button class="button button-quiet" type="button" data-signout>ออกจากระบบ</button></div></div>`;
  return `${pageHeading("ไม่พบหน้า", "ขออภัย ไม่พบหน้าที่ต้องการ")}<a class="button button-green" href="dashboard.html">กลับหน้าภาพรวม</a>`;
}

function authTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((button) => button.classList.toggle("active", button.dataset.authTab === tab));
  document.querySelectorAll(".auth-panel").forEach((panel) => panel.classList.add("hidden"));
  const panel = document.querySelector(`#${tab}-form`);
  if (panel) panel.classList.remove("hidden");
}

function selectedAddressText(addressId, email) {
  const address = read(STORE.addresses, []).find((item) => item.id === addressId && item.email === email);
  return address ? `${address.house} ${address.street}, ${address.district}, ${address.province}` : "";
}

function updateAddressPin(latlng) {
  const form = document.querySelector("#address-form");
  if (!form) return;
  const latitude = Number(latlng.lat.toFixed(6));
  const longitude = Number(latlng.lng.toFixed(6));
  form.elements.latitude.value = String(latitude);
  form.elements.longitude.value = String(longitude);
  document.querySelector("#address-coordinates").textContent = `ตำแหน่งที่เลือก: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  resolveAddressFromPin(latitude, longitude);
}

async function resolveAddressFromPin(latitude, longitude) {
  const status = document.querySelector("#address-geocode-status");
  if (!status) return;
  if (addressGeocodeController) addressGeocodeController.abort();
  window.clearTimeout(addressGeocodeTimer);
  addressGeocodeController = new AbortController();
  const controller = addressGeocodeController;
  status.textContent = "กำลังค้นหาที่อยู่จากตำแหน่งที่ปักหมุด…";

  const wait = Math.max(0, 1100 - (Date.now() - lastAddressGeocodeAt));
  await new Promise((resolve) => {
    const onAbort = () => {
      window.clearTimeout(addressGeocodeTimer);
      resolve();
    };
    addressGeocodeTimer = window.setTimeout(() => {
      controller.signal.removeEventListener("abort", onAbort);
      resolve();
    }, wait);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  if (controller.signal.aborted) return;

  try {
    lastAddressGeocodeAt = Date.now();
    const query = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "th"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status}).`);
    const result = await response.json();
    if (controller.signal.aborted) return;
    if (!result.address) {
      status.textContent = "ไม่พบที่อยู่บริเวณนี้ กรุณากรอกข้อมูลด้วยตนเอง";
      return;
    }

    const address = result.address;
    const isThailand = address.country_code === "th";
    const form = document.querySelector("#address-form");
    form.elements.house.value = address.house_number || "";
    form.elements.street.value = address.road || address.pedestrian || address.footway || "";
    form.elements.subdistrict.value = address.quarter || address.village || address.hamlet || address.neighbourhood || (isThailand ? "" : address.suburb || "");
    form.elements.district.value = isThailand
      ? address.suburb || address.city_district || address.county || ""
      : address.city_district || address.district || address.county || address.city || address.town || "";
    form.elements.province.value = address.state || address.province || (isThailand ? address.city || address.town || "" : "");
    form.elements.postcode.value = address.postcode || "";
    status.textContent = "เติมที่อยู่จากแผนที่แล้ว กรุณาตรวจสอบและเติมข้อมูลที่ยังขาด";
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Could not look up the address for the selected map pin.", error);
    status.textContent = "ค้นหาที่อยู่ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและกรอกข้อมูลด้วยตนเอง";
  }
}

function initAddressMap() {
  const mapElement = document.querySelector("#address-map");
  if (!mapElement) return;
  if (!window.L) {
    mapElement.textContent = "โหลดแผนที่ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วโหลดหน้านี้ใหม่";
    console.error("Leaflet could not be loaded; address map is unavailable.");
    return;
  }

  addressMap = window.L.map(mapElement, { scrollWheelZoom: false }).setView([13.7563, 100.5018], 12);
  const tiles = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(addressMap);
  tiles.on("tileerror", () => {
    document.querySelector("#address-map-status").textContent = "โหลดแผนที่บางส่วนไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต";
  });
  addressMap.on("click", (event) => {
    if (!addressMarker) {
      addressMarker = window.L.marker(event.latlng, { draggable: true }).addTo(addressMap);
      addressMarker.on("dragend", () => updateAddressPin(addressMarker.getLatLng()));
    } else {
      addressMarker.setLatLng(event.latlng);
    }
    updateAddressPin(event.latlng);
  });
}

function updateBookingEstimate() {
  const form = document.querySelector("#booking-form");
  if (!form) return;
  const service = SERVICES.find((item) => item.name === form.elements.service.value);
  const rooms = Number(form.elements.rooms.value);
  const workers = Number(form.elements.workers.value);
  const total = Math.round(((service ? service.price : 0) + Math.max(0, rooms - 2) * 250) * (workers > 1 ? 1.65 : 1));
  document.querySelector("#booking-price").textContent = `฿${formatPrice(total)}`;
}

function updatePaymentMethodUI() {
  const form = document.querySelector("#payment-form");
  if (!form) return;
  const isQrPayment = form.elements.method.value === "qr";
  document.querySelector("#qr-payment-details").classList.toggle("hidden", !isQrPayment);
  document.querySelector("#cod-payment-note").classList.toggle("hidden", isQrPayment);
  form.elements.slip.required = false;
  document.querySelector("#payment-submit").textContent = "ยืนยันการชำระเงิน";
}

function initAdminBookingStatuses() {
  document.querySelectorAll("[data-admin-booking]").forEach((select) => {
    const booking = getBookings().find((item) => item.id === select.dataset.adminBooking);
    if (!booking) return;
    const statuses = isBookingPaid(booking)
      ? ["รอการยืนยัน", "ยืนยันแล้ว", "กำลังเดินทาง", "กำลังทำความสะอาด", "เสร็จสิ้น", "ยกเลิกแล้ว"]
      : ["รอชำระเงิน", "ยกเลิกแล้ว"];
    select.replaceChildren(...statuses.map((status) => new Option(status, status, false, status === booking.status)));
  });
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    if (form.id === "login-form") {
      await apiRequest("/api/auth/login", apiOptions({
        email: data.get("email"),
        password: data.get("password"),
        remember: data.get("remember") === "on"
      }));
      location.assign(authenticatedDestination());
    } else if (form.id === "register-form") {
      const result = await apiRequest("/api/auth/register", apiOptions({
        firstName: String(data.get("firstName")).trim(),
        lastName: String(data.get("lastName")).trim(),
        email: String(data.get("email")).trim(),
        phone: String(data.get("phone")).trim(),
        password: data.get("password"),
        role: data.get("role")
      }));
      if (result.verificationEmailSent) sessionStorage.setItem("easyclean.verification-notice", "sent");
      location.assign("dashboard.html");
    } else if (form.id === "booking-form") {
      const user = currentUser();
      const service = SERVICES.find((item) => item.name === data.get("service"));
      if (!service) {
        notify("ไม่พบบริการที่เลือก กรุณาเลือกบริการใหม่");
        return;
      }
      if (!data.get("addressId")) {
        notify("กรุณาเพิ่มที่อยู่ก่อนยืนยันการจอง");
        location.assign("addresses.html");
        return;
      }
      const price = Number(document.querySelector("#booking-price").textContent.replace(/[^\d]/g, ""));
      const booking = {
        id: `EC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        email: user.email,
        service: service.name,
        serviceId: encodeURIComponent(service.name),
        cleaningType: String(data.get("cleaningType")),
        date: String(data.get("date")),
        time: String(data.get("time")),
        rooms: Number(data.get("rooms")),
        workers: Number(data.get("workers")),
        address: selectedAddressText(String(data.get("addressId")), user.email),
        notes: String(data.get("notes") || ""),
        price,
        status: "รอชำระเงิน",
        createdAt: Date.now()
      };
      const { booking: savedBooking } = await apiRequest("/api/bookings", apiOptions(booking));
      write(STORE.bookings, [savedBooking, ...getBookings().filter((item) => item.id !== savedBooking.id)]);
      pushNotification(user.email, "เริ่มทำรายการจองแล้ว", `${savedBooking.service} รอการยืนยันชำระเงินก่อนดำเนินการต่อ`, "booking", `BOOK-${savedBooking.id}`);
      await flushFirebaseWrites();
      location.assign(`payments.html?booking=${encodeURIComponent(savedBooking.id)}`);
    } else if (form.id === "address-form") {
      const user = currentUser();
      const addresses = read(STORE.addresses, []);
      const makeDefault = data.get("default") === "on" || !addresses.some((item) => item.email === user.email);
      const latitudeValue = String(data.get("latitude") || "");
      const longitudeValue = String(data.get("longitude") || "");
      const latitude = latitudeValue ? Number(latitudeValue) : null;
      const longitude = longitudeValue ? Number(longitudeValue) : null;
      if ((latitudeValue || longitudeValue) && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
        notify("พิกัดบนแผนที่ไม่ถูกต้อง กรุณาปักหมุดใหม่");
        return;
      }
      const next = addresses.map((item) => item.email === user.email && makeDefault ? { ...item, default: false } : item);
      next.push({ id: `ADDR-${Date.now()}`, email: user.email, label: String(data.get("label")), house: String(data.get("house")).trim(), street: String(data.get("street")).trim(), subdistrict: String(data.get("subdistrict")).trim(), district: String(data.get("district")).trim(), province: String(data.get("province")).trim(), postcode: String(data.get("postcode")).trim(), note: String(data.get("note")).trim(), latitude, longitude, default: makeDefault });
      write(STORE.addresses, next);
      notify("บันทึกที่อยู่แล้ว");
      await reloadAfterFirebaseWrites();
    } else if (form.id === "payment-form") {
      const user = currentUser();
      const booking = getBookings().find((item) => item.id === data.get("bookingId") && item.email === user.email);
      const method = String(data.get("method"));
      const file = data.get("slip");
      if (!booking) {
        notify("กรุณาเลือกรายการจองที่ต้องการชำระ");
        return;
      }
      if (booking.status === "ยกเลิกแล้ว" || isBookingPaid(booking)) {
        notify("รายการนี้ไม่มียอดค้างชำระ");
        location.reload();
        return;
      }
      if (!["qr", "cod"].includes(method)) {
        notify("กรุณาเลือกวิธีชำระเงิน");
        return;
      }
      const maxUploadBytes = window.easyCleanFirebase?.enabled ? 500 * 1024 : 1024 * 1024;
      if (method === "qr" && file instanceof File && file.name && (!file.type.startsWith("image/") || file.size > maxUploadBytes)) {
        notify(`หลักฐานการโอนต้องเป็นไฟล์รูปภาพและมีขนาดไม่เกิน ${window.easyCleanFirebase?.enabled ? "500 KB" : "1 MB"}`);
        return;
      }
      const paymentInput = {
        bookingId: booking.id,
        method: method === "qr" ? "โอนเงินผ่าน QR Code" : "เก็บเงินปลายทาง",
        filename: method === "qr" && file instanceof File ? file.name : "",
        slipDataUrl: method === "qr" && file instanceof File && file.name ? await fileAsDataUrl(file) : ""
      };
      const { payment, booking: paidBooking } = await apiRequest("/api/payments", apiOptions(paymentInput));
      const payments = read(STORE.payments, []);
      const existingPaymentIndex = payments.findIndex((item) => item.bookingId === booking.id && item.email === user.email);
      if (existingPaymentIndex >= 0) payments[existingPaymentIndex] = payment;
      else payments.unshift(payment);
      write(STORE.payments, payments);
      const bookings = getBookings();
      const paidBookingIndex = bookings.findIndex((item) => item.id === booking.id && item.email === user.email);
      if (paidBookingIndex >= 0) bookings[paidBookingIndex] = paidBooking;
      else bookings.unshift(paidBooking);
      write(STORE.bookings, bookings);
      pushNotification(user.email, "ยืนยันการชำระเงินแล้ว", `บันทึกการชำระเงินสำหรับ ${booking.service} แล้ว`, "payment", `PAY-${payment.reference}`);
      notify("ยืนยันการชำระเงินแล้ว กำลังไปยังการติดตามการจอง");
      await flushFirebaseWrites();
      location.assign("tracking.html");
    } else if (form.id === "review-form") {
      const user = currentUser();
      const booking = getBookings().find((item) => item.id === data.get("bookingId") && item.email === user.email && item.status !== "ยกเลิกแล้ว" && isBookingPaid(item));
      if (!booking) {
        notify("ไม่พบรายการจองที่รีวิวได้");
        return;
      }
      const reviews = read(STORE.reviews, []);
      if (reviews.some((item) => item.bookingId === booking.id)) {
        notify("รายการนี้ส่งรีวิวแล้ว");
        return;
      }
      reviews.unshift({ email: user.email, bookingId: booking.id, service: booking.service, rating: Number(data.get("rating")), comment: String(data.get("comment")).trim(), date: new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date()) });
      write(STORE.reviews, reviews);
      notify("ขอบคุณสำหรับรีวิว");
      await reloadAfterFirebaseWrites();
    } else if (form.id === "career-form") {
      const user = currentUser();
      const file = data.get("cv");
      if (file instanceof File && file.name) {
        const extension = file.name.split(".").pop().toLowerCase();
        const maxUploadBytes = window.easyCleanFirebase?.enabled ? 500 * 1024 : 1024 * 1024;
        if (!["pdf", "doc", "docx"].includes(extension) || file.size > maxUploadBytes) {
          notify(`ไฟล์ประวัติต้องเป็น PDF, DOC หรือ DOCX และมีขนาดไม่เกิน ${window.easyCleanFirebase?.enabled ? "500 KB" : "1 MB"}`);
          return;
        }
      }
      const applications = read(STORE.applications, []);
      applications.unshift({ id: `APP-${Date.now()}`, email: user.email, name: String(data.get("name")).trim(), phone: String(data.get("phone")).trim(), experience: String(data.get("experience")).trim(), skill: String(data.get("skill")), details: String(data.get("details") || "").trim(), filename: file instanceof File ? file.name : "", cvDataUrl: file instanceof File && file.name ? await fileAsDataUrl(file) : "", status: "รอตรวจสอบ", date: new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date()), createdAt: Date.now() });
      write(STORE.applications, applications);
      pushNotification(user.email, "ส่งใบสมัครแล้ว", "ระบบได้รับใบสมัครพนักงานของคุณแล้ว", "application", `APP-${applications[0].id}`);
      notify("ส่งใบสมัครแล้ว");
      await reloadAfterFirebaseWrites();
    } else if (form.id === "profile-form") {
      const user = currentUser();
      const result = await apiRequest("/api/auth/profile", apiOptions({
        firstName: String(data.get("firstName")).trim(),
        lastName: String(data.get("lastName")).trim(),
        phone: String(data.get("phone")).trim()
      }));
      activeUser = result.user;
      notify("บันทึกข้อมูลส่วนตัวแล้ว");
      await reloadAfterFirebaseWrites();
    } else if (form.id === "password-form") {
      await apiRequest("/api/auth/password", apiOptions({
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword")
      }));
      notify("เปลี่ยนรหัสผ่านแล้ว");
      form.reset();
    }
  } catch (error) {
    console.error("Easy Clean demo action failed.", error);
    notify(error.message || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
  }
}

async function onClick(event) {
  const tab = event.target.closest("[data-auth-tab]");
  if (tab) authTab(tab.dataset.authTab);
  if (event.target.closest("[data-toggle-notifications]")) {
    const panel = document.querySelector("[data-notification-panel]");
    if (panel) panel.classList.toggle("hidden");
  }
  if (event.target.closest("[data-mark-notifications-read]")) {
    const user = currentUser();
    const notifications = read(STORE.notifications, []).map((item) => item.email === user.email ? { ...item, read: true } : item);
    write(STORE.notifications, notifications);
    refreshNotificationCenter();
  }
  if (event.target.closest("[data-enable-notifications]")) {
    if (!("Notification" in window)) {
      notify("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนบนอุปกรณ์");
    } else {
      Notification.requestPermission().then((permission) => {
        notify(permission === "granted" ? "เปิดการแจ้งเตือนบนอุปกรณ์แล้ว" : "ยังไม่ได้รับอนุญาตให้แสดงการแจ้งเตือน");
      }).catch((error) => {
        console.error("Could not request notification permission.", error);
        notify("เปิดการแจ้งเตือนไม่สำเร็จ");
      });
    }
  }
  const locateAddress = event.target.closest("[data-locate-address]");
  if (locateAddress) {
    if (!addressMap || !window.L) {
      notify("แผนที่ยังไม่พร้อมใช้งาน กรุณาโหลดหน้าใหม่");
      return;
    }
    if (!navigator.geolocation) {
      notify("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง กรุณาปักหมุดบนแผนที่");
      return;
    }
    locateAddress.disabled = true;
    navigator.geolocation.getCurrentPosition((position) => {
      const location = window.L.latLng(position.coords.latitude, position.coords.longitude);
      addressMap.setView(location, 17);
      if (!addressMarker) {
        addressMarker = window.L.marker(location, { draggable: true }).addTo(addressMap);
        addressMarker.on("dragend", () => updateAddressPin(addressMarker.getLatLng()));
      } else {
        addressMarker.setLatLng(location);
      }
      updateAddressPin(location);
      locateAddress.disabled = false;
    }, (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาตหรือปักหมุดบนแผนที่"
        : error.code === error.POSITION_UNAVAILABLE
          ? "ไม่สามารถระบุตำแหน่งได้ กรุณาปักหมุดบนแผนที่"
          : "ใช้เวลาระบุตำแหน่งนานเกินไป กรุณาลองอีกครั้ง";
      document.querySelector("#address-map-status").textContent = message;
      locateAddress.disabled = false;
      notify(message);
    }, { enableHighAccuracy: true, timeout: 12000 });
  }
  if (event.target.closest("[data-show-reset]")) {
    if (!window.easyCleanFirebase?.enabled) {
      notify("การรีเซ็ตรหัสผ่านทางอีเมลยังไม่เปิดใช้ กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }
    const emailInput = document.querySelector('#login-form input[name="email"]');
    let email = String(emailInput?.value || "").trim();
    if (!email) email = String(window.prompt("กรุณากรอกอีเมลสำหรับรับลิงก์ตั้งรหัสผ่านใหม่") || "").trim();
    if (!email) return;
    try {
      await apiRequest("/api/auth/password/reset", apiOptions({ email }));
      notify("ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว กรุณาตรวจสอบอีเมล");
    } catch (error) {
      console.error("Could not send a password reset email.", error);
      notify(error.message || "ส่งลิงก์ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
    }
  }
  const googleSignIn = event.target.closest("[data-google-signin]");
  if (googleSignIn) {
    googleSignIn.disabled = true;
    try {
      await apiRequest("/api/auth/google", apiOptions({}));
      location.assign(authenticatedDestination());
    } catch (error) {
      console.error("Firebase Google sign-in failed.", error);
      notify(error.message || "เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
      googleSignIn.disabled = false;
    }
  }
  if (event.target.closest("[data-signout]")) {
    apiRequest("/api/auth/logout", apiOptions({})).catch((error) => console.error("Sign out failed.", error)).finally(() => location.assign("index.html"));
  }
  const cancel = event.target.closest("[data-cancel-booking]");
  if (cancel && window.confirm("ยืนยันการยกเลิกรายการจองนี้หรือไม่?")) {
    try {
      const { booking } = await apiRequest(`/api/bookings/${encodeURIComponent(cancel.dataset.cancelBooking)}`, { ...apiOptions({ status: "ยกเลิกแล้ว" }), method: "PATCH" });
      write(STORE.bookings, getBookings().map((item) => item.id === booking.id ? booking : item));
      await reloadAfterFirebaseWrites();
    } catch (error) {
      console.error("Could not cancel the booking on the server.", error);
      notify(error.message || "ยกเลิกรายการจองไม่สำเร็จ");
    }
  }
  const deleteAddress = event.target.closest("[data-delete-address]");
  if (deleteAddress && window.confirm("ต้องการลบที่อยู่นี้หรือไม่?")) {
    const user = currentUser();
    write(STORE.addresses, read(STORE.addresses, []).filter((item) => !(item.email === user.email && item.id === deleteAddress.dataset.deleteAddress)));
    await reloadAfterFirebaseWrites();
  }
  const payButton = event.target.closest("[data-pay]");
  if (payButton) location.assign(`payments.html?booking=${encodeURIComponent(payButton.dataset.pay)}`);
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("selected", button === filter));
    document.querySelectorAll(".service-card").forEach((card) => card.classList.toggle("hidden", filter.dataset.filter !== "all" && card.dataset.size !== filter.dataset.filter));
  }
}

async function onChange(event) {
  if (event.target.matches("#booking-form select")) updateBookingEstimate();
  if (event.target.matches("#payment-method")) updatePaymentMethodUI();
  if (event.target.matches("#service-sort")) {
    const container = document.querySelector(".service-list");
    const cards = Array.from(container.querySelectorAll(".service-card"));
    const key = event.target.value === "price" ? "price" : event.target.value === "rating" ? "rating" : null;
    if (key) cards.sort((a, b) => {
      const difference = Number(a.dataset[key]) - Number(b.dataset[key]);
      return key === "rating" ? -difference : difference;
    });
    cards.forEach((card) => container.append(card));
  }
  const bookingStatusSelect = event.target.closest("[data-admin-booking]");
  if (bookingStatusSelect) {
    const bookings = getBookings();
    const booking = bookings.find((item) => item.id === bookingStatusSelect.dataset.adminBooking);
    if (booking && !isBookingPaid(booking) && bookingStatusSelect.value !== "ยกเลิกแล้ว") {
      bookingStatusSelect.value = booking.status;
      notify("ต้องยืนยันการชำระเงินก่อนจึงจะดำเนินการจองต่อได้");
      return;
    }
    if (!booking) return;
    const previousStatus = booking.status;
    try {
      const { booking: updatedBooking } = await apiRequest(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, { ...apiOptions({ status: bookingStatusSelect.value }), method: "PATCH" });
      write(STORE.bookings, bookings.map((item) => item.id === updatedBooking.id ? updatedBooking : item));
      if (previousStatus !== updatedBooking.status) {
        pushNotification(updatedBooking.email, "สถานะการจองเปลี่ยนแปลง", `${updatedBooking.service}: ${updatedBooking.status}`, "booking-status", `STATUS-${updatedBooking.id}-${updatedBooking.status}`);
      }
      notify("อัปเดตสถานะการจองแล้ว");
    } catch (error) {
      console.error("Could not update the booking status on the server.", error);
      notify(error.message || "อัปเดตสถานะการจองไม่สำเร็จ");
      await reloadAfterFirebaseWrites();
    }
  }
  const assignmentSelect = event.target.closest("[data-admin-assignment]");
  if (assignmentSelect) {
    const bookings = getBookings();
    const booking = bookings.find((item) => item.id === assignmentSelect.dataset.adminAssignment);
    if (!booking) return;
    try {
      const { booking: updatedBooking } = await apiRequest(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, { ...apiOptions({ assignedWorker: assignmentSelect.value }), method: "PATCH" });
      write(STORE.bookings, bookings.map((item) => item.id === updatedBooking.id ? updatedBooking : item));
      pushNotification(updatedBooking.email, "อัปเดตผู้ให้บริการ", assignmentSelect.value ? `มีการมอบหมายพนักงานให้ ${updatedBooking.service} แล้ว` : `ยกเลิกการมอบหมายพนักงานของ ${updatedBooking.service} แล้ว`, "assignment", `ASSIGN-${updatedBooking.id}-${Date.now()}`);
      notify("บันทึกการมอบหมายพนักงานแล้ว");
    } catch (error) {
      console.error("Could not assign a worker on the server.", error);
      notify(error.message || "บันทึกการมอบหมายพนักงานไม่สำเร็จ");
      await reloadAfterFirebaseWrites();
    }
  }
  const paymentStatusSelect = event.target.closest("[data-admin-payment]");
  if (paymentStatusSelect) {
    const payments = read(STORE.payments, []);
    const payment = payments.find((item) => item.reference === paymentStatusSelect.dataset.adminPayment);
    if (!payment) return;
    const previousStatus = payment.status;
    try {
      const { payment: updatedPayment, booking: updatedBooking } = await apiRequest(`/api/admin/payments/${encodeURIComponent(payment.reference)}`, { ...apiOptions({ status: paymentStatusSelect.value }), method: "PATCH" });
      write(STORE.payments, payments.map((item) => item.reference === updatedPayment.reference ? updatedPayment : item));
      if (updatedBooking) {
        write(STORE.bookings, getBookings().map((item) => item.id === updatedBooking.id ? updatedBooking : item));
      }
      if (previousStatus !== updatedPayment.status) pushNotification(updatedPayment.email, "สถานะการชำระเงินเปลี่ยนแปลง", `${updatedPayment.bookingId}: ${updatedPayment.status}`, "payment-status", `PAY-STATUS-${updatedPayment.reference}-${updatedPayment.status}`);
      notify("อัปเดตสถานะการชำระเงินแล้ว");
    } catch (error) {
      console.error("Could not update the payment status on the server.", error);
      notify(error.message || "อัปเดตสถานะการชำระเงินไม่สำเร็จ");
      location.reload();
    }
  }
  const applicationSelect = event.target.closest("[data-admin-application]");
  if (applicationSelect) {
    const applications = read(STORE.applications, []);
    const application = applications.find((item) => item.id === applicationSelect.dataset.adminApplication);
    if (application) application.status = applicationSelect.value;
    write(STORE.applications, applications);
    if (application) pushNotification(application.email, "อัปเดตผลการสมัครงาน", `ใบสมัครของคุณ: ${application.status}`, "application-status", `APP-STATUS-${application.id}-${application.status}`);
    notify("อัปเดตสถานะใบสมัครแล้ว");
  }
  const roleSelect = event.target.closest("[data-admin-user-role]");
  const activeSelect = event.target.closest("[data-admin-user-active]");
  if (roleSelect || activeSelect) {
    const select = roleSelect || activeSelect;
    const userId = select.dataset.adminUserRole || select.dataset.adminUserActive;
    const update = roleSelect ? { role: roleSelect.value } : { active: activeSelect.value === "true" };
    apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { ...apiOptions(update), method: "PATCH" }).then(({ user }) => {
      adminUsers = adminUsers.map((item) => item.id === user.id ? user : item);
      notify("บันทึกข้อมูลบัญชีแล้ว");
    }).catch((error) => {
      console.error("Could not update the user account.", error);
      notify(error.message || "บันทึกข้อมูลบัญชีไม่สำเร็จ");
      location.reload();
    });
  }
}

async function init() {
  try {
    await window.easyCleanFirebaseReady;
    if (window.easyCleanFirebase?.enabled) await window.easyCleanFirebase.ready;
  } catch (error) {
    console.error("Could not initialize Firebase.", error);
    notify("เริ่มต้น Firebase ไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าโปรเจกต์");
    return;
  }
  localStorage.removeItem("easyclean.users");
  localStorage.removeItem("easyclean.session");
  sessionStorage.removeItem("easyclean.session");
  const page = document.body.dataset.page;
  try {
    const response = await apiRequest("/api/auth/me");
    activeUser = response.user;
  } catch (error) {
    if (error.status !== 401) {
      console.error("Could not validate the current session.", error);
    }
  }
  if (page === "auth") {
    await renderAuth();
  } else {
    const user = currentUser();
    if (!user) {
      const redirect = encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html");
      location.replace(`index.html?next=${redirect}`);
      return;
    }
    try {
      await loadServerTransactions(user, page === "admin" && user.role === "admin");
    } catch (error) {
      console.error("Could not load bookings from the server.", error);
      notify(error.message || "โหลดรายการจองจากเซิร์ฟเวอร์ไม่สำเร็จ");
    }
    if (page === "booking") {
      const pendingBooking = unpaidBookings(user.email)[0];
      if (pendingBooking) {
        location.replace(`payments.html?booking=${encodeURIComponent(pendingBooking.id)}`);
        return;
      }
    }
    if (page === "admin" && user.role === "admin") {
      try {
        const result = await apiRequest("/api/admin/users");
        adminUsers = result.users;
      } catch (error) {
        console.error("Could not load admin user accounts.", error);
        notify(error.message || "โหลดบัญชีผู้ใช้ไม่สำเร็จ");
      }
    }
    if (page === "admin" && user.role !== "admin") {
      document.title = "จำกัดสิทธิ์ — Easy Clean";
    } else {
      document.title = `${PAGE_TITLES[page] || "Easy Clean"} — Easy Clean`;
    }
    document.querySelector("#app").innerHTML = renderShell(page, user);
    if (page === "addresses") initAddressMap();
    if (page === "payments") updatePaymentMethodUI();
    if (page === "admin") initAdminBookingStatuses();
    scheduleBookingReminders(user.email);
    updateBookingEstimate();
  }
  document.addEventListener("submit", onSubmit);
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  if (sessionStorage.getItem("easyclean.verification-notice") === "sent") {
    sessionStorage.removeItem("easyclean.verification-notice");
    notify("สมัครสมาชิกแล้ว กรุณายืนยันอีเมลจากกล่องจดหมาย");
  }
  window.addEventListener("easyclean:notification", (event) => {
    refreshNotificationCenter();
    if ("Notification" in window && Notification.permission === "granted" && event.detail?.email === activeUser?.email) {
      const notification = new Notification(event.detail.title, { body: event.detail.message });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  });
  window.addEventListener("storage", (event) => {
    if (document.body.dataset.page === "admin" && [STORE.bookings, STORE.payments, STORE.reviews, STORE.applications, STORE.services].includes(event.key)) {
      location.reload();
      return;
    }
    if (event.key === STORE.notifications) refreshNotificationCenter();
    if (activeUser && (event.key === STORE.bookings || event.key === STORE.payments)) scheduleBookingReminders(activeUser.email);
  });
  if (page === "admin" && activeUser?.role === "admin") startAdminTransactionPolling();
}

document.addEventListener("DOMContentLoaded", init);
