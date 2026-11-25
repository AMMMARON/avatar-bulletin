import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireValue } from './store.js';

const cookieName = 'bulletin_operator';
const ttl = 8 * 60 * 60;
const attempts = new Map();
const hash = value => createHash('sha256').update(value).digest();

export function adminReady() {
  return process.env.ADMIN_PASSWORD?.length >= 12 && process.env.STUDIO_SECRET?.length >= 32;
}

function signature(value) {
  return createHmac('sha256', process.env.STUDIO_SECRET)
    .update('operator-v1\0' + process.env.ADMIN_PASSWORD + '\0' + value).digest('base64url');
}

export function signedIn(req) {
  if (!adminReady()) return false;
  const cookie = String(req.headers.cookie || '').split(';').map(s => s.trim())
    .find(pair => pair.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
  const parts = /^(\d{10})\.(main|[a-f0-9]{32})\.([A-Za-z0-9_-]{24})\.([\w-]{43})$/.exec(cookie);
  if (!parts || +parts[1] <= Date.now()/1000) return false;
  return timingSafeEqual(hash(parts[4]), hash(signature(parts.slice(1,4).join('.')))) && parts[2];
}

function cookie(req, value, maxAge) {
  const secure = !!process.env.VERCEL || process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  return cookieName + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secure ? '; Secure' : '');
}

export function login(req, res, password) {
  requireValue(adminReady(), 'حساب المشغّل يحتاج إلى إعداد من مالك المشروع.', 503);
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0];
  const now = Date.now();
  const attempt = attempts.get(ip);
  requireValue(!attempt || attempt.until <= now || attempt.count < 10, 'محاولات كثيرة. حاول مرة أخرى بعد ١٥ دقيقة.', 429);
  const personal = typeof password === 'string' && /^studio_[a-f0-9]{64}$/.test(password);
  const valid = personal || typeof password === 'string' && password.length <= 1000 &&
    timingSafeEqual(hash(password), hash(process.env.ADMIN_PASSWORD));
  if (!valid) {
    if (attempts.size > 4096) attempts.delete(attempts.keys().next().value);
    attempts.set(ip, attempt && attempt.until > now ? {count: attempt.count + 1, until: attempt.until} : {count: 1, until: now + 900_000});
    requireValue(false, 'كلمة مرور المشغّل غير صحيحة.', 401);
  }
  attempts.delete(ip);
  const channel = personal ? createHmac('sha256', process.env.STUDIO_SECRET).update('channel/' + password).digest('hex').slice(0,32) : 'main';
  const payload = String(Math.floor(now/1000) + ttl) + '.' + channel + '.' + randomBytes(18).toString('base64url');
  res.setHeader('Set-Cookie', cookie(req, payload + '.' + signature(payload), ttl));
  return channel;
}

export function logout(req, res) {
  res.setHeader('Set-Cookie', cookie(req, '', 0));
}

export function requireSameOrigin(req) {
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  requireValue(!fetchSite || fetchSite === 'same-origin' || fetchSite === 'none', 'موقع الطلب غير مسموح.', 403);
  let host = '';
  if (origin) { try { host = new URL(origin).host; } catch {} }
  requireValue(!origin || (host && host === req.headers.host), 'موقع الطلب غير مسموح.', 403);
  requireValue(/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''), 'أرسل بيانات بصيغة JSON.', 415);
}
