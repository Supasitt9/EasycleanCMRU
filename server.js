"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { promisify } = require("node:util");
const { OAuth2Client } = require("google-auth-library");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "auth.json");
const TRANSACTION_FILE = path.join(DATA_DIR, "transactions.json");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_COOKIE = "easyclean.sid";
const SESSION_DAYS = 7;
const MAX_BODY_BYTES = 20 * 1024;
const STATIC_FILES = new Set([
  "index.html", "dashboard.html", "services.html", "booking.html", "tracking.html",
  "addresses.html", "payments.html", "reviews.html", "career.html", "admin.html",
  "account.html", "styles.css", "app.js", "assets/promptpay-qr.png"
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};
const oauthClient = new OAuth2Client(CLIENT_ID || undefined);
const pbkdf2 = promisify(crypto.pbkdf2);
let state = { users: [], sessions: [] };
let writeQueue = Promise.resolve();
let transactionState = { bookings: [], payments: [] };
let transactionWriteQueue = Promise.resolve();
const loginAttempts = new Map();
const BOOKING_STATUSES = ["รอชำระเงิน", "รอการยืนยัน", "ยืนยันแล้ว", "กำลังเดินทาง", "กำลังทำความสะอาด", "เสร็จสิ้น", "ยกเลิกแล้ว"];
const PAYMENT_STATUSES = ["ชำระแล้ว", "รอตรวจสอบ", "ไม่สำเร็จ"];
const PAYMENT_METHODS = ["โอนเงินผ่าน QR Code", "เก็บเงินปลายทาง"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function saveState() {
  writeQueue = writeQueue.then(async () => {
    const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.rename(temporaryFile, DATA_FILE);
  });
  return writeQueue;
}

async function saveTransactions() {
  transactionWriteQueue = transactionWriteQueue.then(async () => {
    const temporaryFile = `${TRANSACTION_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(transactionState, null, 2), { mode: 0o600 });
    await fs.rename(temporaryFile, TRANSACTION_FILE);
  });
  return transactionWriteQueue;
}

async function loadTransactions() {
  try {
    const stored = JSON.parse(await fs.readFile(TRANSACTION_FILE, "utf8"));
    transactionState = {
      bookings: Array.isArray(stored.bookings) ? stored.bookings : [],
      payments: Array.isArray(stored.payments) ? stored.payments : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await saveTransactions();
  }
}

async function loadState() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const stored = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    state = {
      users: Array.isArray(stored.users) ? stored.users : [],
      sessions: Array.isArray(stored.sessions) ? stored.sessions : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await saveState();
  }
  const now = Date.now();
  state.sessions = state.sessions.filter((session) => session.expiresAt > now);
  await seedDemoAccount();
  await saveState();
}

async function seedDemoAccount() {
  const email = String(process.env.DEMO_ACCOUNT_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.DEMO_ACCOUNT_PASSWORD || "");
  if (!email && !password) return;
  if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
    throw new Error("DEMO_ACCOUNT_EMAIL และ DEMO_ACCOUNT_PASSWORD ต้องตั้งค่าครบ โดยรหัสผ่านยาว 8–128 ตัวอักษร");
  }
  const existing = state.users.find((user) => user.email === email);
  if (existing) {
    if (!existing.passwordHash || !await verifyPassword(password, existing.passwordHash)) {
      existing.passwordHash = await passwordRecord(password);
    }
    existing.role = roleFor(email, "customer");
    existing.active = true;
    existing.firstName ||= "Admin";
    existing.lastName ||= "Easy Clean";
    console.log("Updated the configured local demo account.");
    return;
  }
  state.users.push({
    id: crypto.randomUUID(),
    email,
    firstName: "Admin",
    lastName: "Easy Clean",
    phone: "",
    role: roleFor(email, "customer"),
    active: true,
    passwordHash: await passwordRecord(password),
    createdAt: Date.now()
  });
  console.log("Created the configured local demo account.");
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(value));
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0
      ? ["", ""]
      : [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([name]) => name));
}

function sessionCookie(value, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  let actualOrigin;
  try {
    actualOrigin = new URL(origin).origin;
  } catch {
    throw new HttpError(403, "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา");
  }
  const forwardedProtocol = process.env.TRUST_PROXY === "1"
    ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    : "";
  const protocol = forwardedProtocol
    ? `${forwardedProtocol}:`
    : request.socket.encrypted ? "https:" : "http:";
  if (!origin || actualOrigin !== `${protocol}//${request.headers.host}`) {
    throw new HttpError(403, "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา");
  }
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "ต้องส่งข้อมูลในรูปแบบ JSON");
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) throw new HttpError(413, "ข้อมูลมีขนาดใหญ่เกินไป");
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new HttpError(400, "รูปแบบข้อมูลไม่ถูกต้อง");
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone || "",
    role: user.role,
    active: user.active !== false,
    provider: user.googleSub ? "google" : "password"
  };
}

function getUserFromRequest(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const session = state.sessions.find((item) => item.tokenHash === hash(token) && item.expiresAt > Date.now());
  return session ? state.users.find((item) => item.id === session.userId) || null : null;
}

function requireUser(request) {
  const user = getUserFromRequest(request);
  if (!user) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  return user;
}

function requireAdmin(request) {
  const user = requireUser(request);
  if (user.role !== "admin") throw new HttpError(403, "ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ");
  return user;
}

async function createSession(response, user, remember = true) {
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAge = remember ? SESSION_DAYS * 24 * 60 * 60 : 8 * 60 * 60;
  state.sessions = state.sessions.filter((session) => session.userId !== user.id);
  state.sessions.push({ tokenHash: hash(token), userId: user.id, expiresAt: Date.now() + maxAge * 1000 });
  await saveState();
  response.setHeader("Set-Cookie", sessionCookie(token, maxAge));
}

async function passwordRecord(password, salt = crypto.randomBytes(16)) {
  const derived = await pbkdf2(password, salt, 310000, 32, "sha256");
  return `${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function verifyPassword(password, record) {
  const [saltHex, expectedHex] = String(record || "").split("$");
  if (!/^[a-f0-9]{32}$/i.test(saltHex || "") || !/^[a-f0-9]{64}$/i.test(expectedHex || "")) return false;
  const actual = Buffer.from(await passwordRecord(password, Buffer.from(saltHex, "hex")).then((value) => value.split("$")[1]), "hex");
  return crypto.timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

function roleFor(email, requestedRole) {
  if (ADMIN_EMAIL && email === ADMIN_EMAIL) return "admin";
  return requestedRole === "job-seeker" ? "job-seeker" : "customer";
}

function validBookingInput(body) {
  return body && typeof body === "object"
    && typeof body.service === "string" && body.service.trim().length > 0 && body.service.length <= 120
    && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    && typeof body.time === "string" && /^\d{2}:\d{2}$/.test(body.time)
    && Number.isInteger(Number(body.rooms)) && Number(body.rooms) >= 1 && Number(body.rooms) <= 30
    && Number.isInteger(Number(body.workers)) && Number(body.workers) >= 1 && Number(body.workers) <= 30
    && Number.isSafeInteger(Number(body.price)) && Number(body.price) > 0 && Number(body.price) <= 10000000
    && typeof body.cleaningType === "string" && body.cleaningType.length <= 100
    && typeof body.address === "string" && body.address.length <= 2000
    && typeof (body.notes || "") === "string" && String(body.notes || "").length <= 1000;
}

function createBooking(user, body, id) {
  return {
    id,
    email: user.email,
    service: body.service.trim(),
    cleaningType: body.cleaningType,
    date: body.date,
    time: body.time,
    rooms: Number(body.rooms),
    workers: Number(body.workers),
    address: body.address,
    notes: String(body.notes || ""),
    price: Number(body.price),
    status: "รอชำระเงิน",
    createdAt: Date.now()
  };
}

function createPayment(user, booking, body) {
  if (!PAYMENT_METHODS.includes(body.method)) throw new HttpError(400, "วิธีชำระเงินไม่ถูกต้อง");
  const slipDataUrl = typeof body.slipDataUrl === "string" ? body.slipDataUrl : "";
  if (slipDataUrl && (slipDataUrl.length > 1400000 || !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(slipDataUrl))) {
    throw new HttpError(400, "ไฟล์หลักฐานการชำระเงินไม่ถูกต้อง");
  }
  return {
    email: user.email,
    bookingId: booking.id,
    amount: booking.price,
    method: body.method,
    filename: typeof body.filename === "string" ? body.filename.slice(0, 255) : "",
    slipDataUrl,
    reference: `PAY-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    status: "ชำระแล้ว",
    createdAt: Date.now()
  };
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/config") {
    return sendJson(response, 200, { googleClientId: CLIENT_ID, googleEnabled: Boolean(CLIENT_ID) });
  }

  if (request.method === "GET" && pathname === "/api/auth/me") {
    const user = getUserFromRequest(request);
    return sendJson(response, user ? 200 : 401, user ? { user: publicUser(user) } : { error: "กรุณาเข้าสู่ระบบ" });
  }

  if (request.method === "POST") assertSameOrigin(request);

  if (request.method === "GET" && pathname === "/api/bookings") {
    const user = requireUser(request);
    return sendJson(response, 200, {
      bookings: transactionState.bookings.filter((booking) => booking.email === user.email),
      payments: transactionState.payments.filter((payment) => payment.email === user.email)
    });
  }

  if (request.method === "POST" && pathname === "/api/bookings/sync") {
    const user = requireUser(request);
    const body = await readJson(request, 2 * 1024 * 1024);
    const bookings = Array.isArray(body.bookings) ? body.bookings.slice(0, 100) : [];
    const payments = Array.isArray(body.payments) ? body.payments.slice(0, 100) : [];
    const isAdmin = user.role === "admin";
    let changed = false;
    for (const candidate of bookings) {
      if (!validBookingInput(candidate) || typeof candidate.id !== "string" || !/^EC-\d{4}-\d{1,12}$/.test(candidate.id)) continue;
      if (transactionState.bookings.some((booking) => booking.id === candidate.id)) continue;
      const owner = isAdmin
        ? state.users.find((account) => account.email === candidate.email)
        : user;
      if (!owner) continue;
      transactionState.bookings.unshift(createBooking(owner, candidate, candidate.id));
      changed = true;
    }
    for (const candidate of payments) {
      const ownerEmail = isAdmin && typeof candidate.email === "string" ? candidate.email : user.email;
      const booking = transactionState.bookings.find((item) => item.email === ownerEmail && item.id === candidate.bookingId);
      if (!booking || !PAYMENT_METHODS.includes(candidate.method)) continue;
      if (transactionState.payments.some((payment) => payment.email === ownerEmail && payment.bookingId === booking.id)) continue;
      const owner = isAdmin ? state.users.find((account) => account.email === ownerEmail) : user;
      if (!owner) continue;
      const payment = createPayment(owner, booking, candidate);
      if (candidate.status === "รอตรวจสอบ" || candidate.status === "ไม่สำเร็จ") payment.status = candidate.status;
      transactionState.payments.unshift(payment);
      if (payment.status === "ชำระแล้ว" && booking.status !== "ยกเลิกแล้ว") booking.status = "รอการยืนยัน";
      changed = true;
    }
    if (changed) await saveTransactions();
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && pathname === "/api/bookings") {
    const user = requireUser(request);
    const body = await readJson(request);
    if (!validBookingInput(body)) throw new HttpError(400, "กรุณาตรวจสอบรายละเอียดการจอง");
    let id;
    do {
      id = `EC-${new Date().getFullYear()}-${crypto.randomInt(100000, 1000000)}`;
    } while (transactionState.bookings.some((booking) => booking.id === id));
    const booking = createBooking(user, body, id);
    transactionState.bookings.unshift(booking);
    await saveTransactions();
    return sendJson(response, 201, { booking });
  }

  const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (request.method === "PATCH" && bookingMatch) {
    const user = requireUser(request);
    const booking = transactionState.bookings.find((item) => item.id === decodeURIComponent(bookingMatch[1]) && item.email === user.email);
    if (!booking) throw new HttpError(404, "ไม่พบรายการจอง");
    const body = await readJson(request);
    if (body.status !== "ยกเลิกแล้ว") throw new HttpError(400, "สถานะการจองไม่ถูกต้อง");
    booking.status = "ยกเลิกแล้ว";
    await saveTransactions();
    return sendJson(response, 200, { booking });
  }

  if (request.method === "POST" && pathname === "/api/payments") {
    const user = requireUser(request);
    const body = await readJson(request, 2 * 1024 * 1024);
    const booking = transactionState.bookings.find((item) => item.id === body.bookingId && item.email === user.email);
    if (!booking || booking.status === "ยกเลิกแล้ว") throw new HttpError(404, "ไม่พบรายการจองที่ชำระเงินได้");
    const payment = createPayment(user, booking, body);
    const paymentIndex = transactionState.payments.findIndex((item) => item.bookingId === booking.id && item.email === user.email);
    if (paymentIndex >= 0) transactionState.payments[paymentIndex] = payment;
    else transactionState.payments.unshift(payment);
    booking.status = "รอการยืนยัน";
    await saveTransactions();
    return sendJson(response, 201, { payment, booking });
  }

  if (request.method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const phone = String(body.phone || "").trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128 || firstName.length < 1 || firstName.length > 100 || lastName.length < 1 || lastName.length > 100 || phone.length < 9 || phone.length > 20) {
      throw new HttpError(400, "กรุณาตรวจสอบข้อมูลสมัครสมาชิก");
    }
    if (state.users.some((user) => user.email === email)) throw new HttpError(409, "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ");
    const user = {
      id: crypto.randomUUID(), email, firstName, lastName, phone,
      role: roleFor(email, body.role),
      active: true,
      passwordHash: await passwordRecord(password),
      createdAt: Date.now()
    };
    state.users.push(user);
    await createSession(response, user);
    return sendJson(response, 201, { user: publicUser(user) });
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const attemptKey = `${request.socket.remoteAddress || "unknown"}:${email.slice(0, 254)}`;
    const attempt = loginAttempts.get(attemptKey);
    if (attempt && attempt.count >= 10 && Date.now() - attempt.startedAt < 15 * 60 * 1000) {
      throw new HttpError(429, "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที");
    }
    const user = state.users.find((item) => item.email === email);
    if (!user || user.active === false || !user.passwordHash || !await verifyPassword(String(body.password || ""), user.passwordHash)) {
      if (!attempt || Date.now() - attempt.startedAt >= 15 * 60 * 1000) {
        loginAttempts.set(attemptKey, { count: 1, startedAt: Date.now() });
      } else {
        attempt.count += 1;
      }
      throw new HttpError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
    loginAttempts.delete(attemptKey);
    await createSession(response, user, body.remember !== false);
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (request.method === "POST" && pathname === "/api/auth/google") {
    if (!CLIENT_ID) throw new HttpError(503, "ยังไม่ได้ตั้งค่า Google OAuth Client ID");
    const body = await readJson(request);
    if (typeof body.credential !== "string" || body.credential.length > 12000) {
      throw new HttpError(400, "ไม่พบ Google ID token ที่ถูกต้อง");
    }
    let ticket;
    try {
      ticket = await oauthClient.verifyIdToken({ idToken: body.credential, audience: CLIENT_ID });
    } catch (error) {
      console.warn("Google ID token verification failed:", error.message);
      throw new HttpError(401, "ไม่สามารถยืนยันบัญชี Google ได้ กรุณาลองอีกครั้ง");
    }
    const profile = ticket.getPayload();
    if (!profile || !profile.sub || !profile.email || profile.email_verified !== true) {
      throw new HttpError(401, "บัญชี Google นี้ไม่มีอีเมลที่ยืนยันแล้ว");
    }
    const email = profile.email.trim().toLowerCase();
    let user = state.users.find((item) => item.googleSub === profile.sub || item.email === email);
    if (user && user.active === false) throw new HttpError(403, "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
    if (user && user.googleSub && user.googleSub !== profile.sub) throw new HttpError(409, "อีเมลนี้เชื่อมกับบัญชี Google อื่นแล้ว");
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email,
        firstName: String(profile.given_name || profile.name || "ผู้ใช้").slice(0, 100),
        lastName: String(profile.family_name || "").slice(0, 100),
        phone: "",
        role: roleFor(email, "customer"),
        active: true,
        createdAt: Date.now()
      };
      state.users.push(user);
    }
    user.googleSub = profile.sub;
    user.email = email;
    user.firstName = String(profile.given_name || user.firstName || "ผู้ใช้").slice(0, 100);
    user.lastName = String(profile.family_name || user.lastName || "").slice(0, 100);
    await createSession(response, user);
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) {
      state.sessions = state.sessions.filter((item) => item.tokenHash !== hash(token));
      await saveState();
    }
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (request.method === "POST" && pathname === "/api/auth/profile") {
    const user = requireUser(request);
    const body = await readJson(request);
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const phone = String(body.phone || "").trim();
    if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100 || phone.length > 20) {
      throw new HttpError(400, "กรุณาตรวจสอบชื่อและเบอร์โทรศัพท์");
    }
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    await saveState();
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (request.method === "POST" && pathname === "/api/auth/password") {
    const user = requireUser(request);
    const body = await readJson(request);
    if (!user.passwordHash || !await verifyPassword(String(body.currentPassword || ""), user.passwordHash)) {
      throw new HttpError(401, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
    }
    if (typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword.length > 128) {
      throw new HttpError(400, "รหัสผ่านใหม่ต้องมีความยาว 8–128 ตัวอักษร");
    }
    user.passwordHash = await passwordRecord(body.newPassword);
    const currentToken = parseCookies(request)[SESSION_COOKIE];
    const currentTokenHash = currentToken ? hash(currentToken) : "";
    state.sessions = state.sessions.filter((session) => session.userId !== user.id || session.tokenHash === currentTokenHash);
    await saveState();
    return sendJson(response, 200, { ok: true });
  }

  if (pathname.startsWith("/api/admin/")) requireAdmin(request);
  if (request.method === "GET" && pathname === "/api/admin/bookings") {
    return sendJson(response, 200, transactionState);
  }
  const adminBookingMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
  if (request.method === "PATCH" && adminBookingMatch) {
    const body = await readJson(request);
    const booking = transactionState.bookings.find((item) => item.id === decodeURIComponent(adminBookingMatch[1]));
    if (!booking) throw new HttpError(404, "ไม่พบรายการจอง");
    if (body.status !== undefined) {
      if (!BOOKING_STATUSES.includes(body.status)) throw new HttpError(400, "สถานะการจองไม่ถูกต้อง");
      const paid = transactionState.payments.some((payment) => payment.bookingId === booking.id && payment.email === booking.email && payment.status === "ชำระแล้ว");
      if (!paid && !["รอชำระเงิน", "ยกเลิกแล้ว"].includes(body.status)) throw new HttpError(400, "ต้องยืนยันการชำระเงินก่อนจึงจะดำเนินการจองต่อได้");
      booking.status = body.status;
    }
    if (body.assignedWorker !== undefined) {
      if (typeof body.assignedWorker !== "string" || body.assignedWorker.length > 100) throw new HttpError(400, "ข้อมูลพนักงานไม่ถูกต้อง");
      booking.assignedWorker = body.assignedWorker;
    }
    await saveTransactions();
    return sendJson(response, 200, { booking });
  }
  const adminPaymentMatch = pathname.match(/^\/api\/admin\/payments\/([^/]+)$/);
  if (request.method === "PATCH" && adminPaymentMatch) {
    const body = await readJson(request);
    if (!PAYMENT_STATUSES.includes(body.status)) throw new HttpError(400, "สถานะการชำระเงินไม่ถูกต้อง");
    const payment = transactionState.payments.find((item) => item.reference === decodeURIComponent(adminPaymentMatch[1]));
    if (!payment) throw new HttpError(404, "ไม่พบรายการชำระเงิน");
    payment.status = body.status;
    const booking = transactionState.bookings.find((item) => item.id === payment.bookingId && item.email === payment.email);
    if (booking && booking.status !== "ยกเลิกแล้ว") booking.status = body.status === "ชำระแล้ว" ? "รอการยืนยัน" : "รอชำระเงิน";
    await saveTransactions();
    return sendJson(response, 200, { payment, booking });
  }
  if (request.method === "GET" && pathname === "/api/admin/users") {
    return sendJson(response, 200, { users: state.users.map(publicUser) });
  }
  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (request.method === "PATCH" && adminUserMatch) {
    const body = await readJson(request);
    const user = state.users.find((item) => item.id === decodeURIComponent(adminUserMatch[1]));
    if (!user) throw new HttpError(404, "ไม่พบบัญชีผู้ใช้");
    const actor = requireUser(request);
    if (user.id === actor.id || user.role === "admin") throw new HttpError(400, "ไม่สามารถเปลี่ยนแปลงบัญชีผู้ดูแลระบบได้");
    if (body.role !== undefined) {
      if (!["customer", "job-seeker"].includes(body.role)) throw new HttpError(400, "ประเภทบัญชีไม่ถูกต้อง");
      user.role = body.role;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new HttpError(400, "สถานะบัญชีไม่ถูกต้อง");
      user.active = body.active;
      if (!body.active) state.sessions = state.sessions.filter((session) => session.userId !== user.id);
    }
    await saveState();
    return sendJson(response, 200, { user: publicUser(user) });
  }

  return sendJson(response, 404, { error: "ไม่พบ API ที่ร้องขอ" });
}

async function serveStatic(request, response, pathname) {
  const requestedFile = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  if (!STATIC_FILES.has(requestedFile)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const filePath = path.join(ROOT, requestedFile);
  try {
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-cache"
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    throw error;
  }
}

async function requestHandler(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
    } else if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response, url.pathname);
    } else {
      sendJson(response, 405, { error: "ไม่รองรับ HTTP method นี้" }, { Allow: "GET, HEAD" });
    }
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("Easy Clean request failed:", error);
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    sendJson(response, error instanceof HttpError ? error.status : 500, {
      error: error instanceof HttpError ? error.message : "เกิดข้อผิดพลาดในระบบ กรุณาลองอีกครั้ง"
    });
  }
}

async function start() {
  await loadState();
  await loadTransactions();
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    console.log(`Easy Clean is running at http://localhost:${PORT}`);
    if (!CLIENT_ID) console.warn("Google login is disabled: set GOOGLE_CLIENT_ID in .env.");
    if (!ADMIN_EMAIL) console.warn("Admin access is disabled: set ADMIN_EMAIL in .env.");
  });
}

start().catch((error) => {
  console.error("Could not start Easy Clean:", error);
  process.exitCode = 1;
});
