// Admin authentication: scrypt password hashing, signed session cookies,
// CSRF tokens and a small brute-force throttle.

import crypto from 'node:crypto';
import { admins, sessions } from './db.js';

const SESSION_COOKIE = 'ss_admin';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 h
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const attempts = new Map(); // ip -> { count, first }

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expected) {
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function throttled(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > ATTEMPT_WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

export function noteFailure(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > ATTEMPT_WINDOW_MS) attempts.set(ip, { count: 1, first: Date.now() });
  else rec.count += 1;
}

export function clearFailures(ip) {
  attempts.delete(ip);
}

export function login(username, password, ip) {
  const admin = admins.byUsername(username);
  if (!admin || !verifyPassword(password, admin.salt, admin.hash)) {
    noteFailure(ip);
    return null;
  }
  clearFailures(ip);
  sessions.prune();
  const session = {
    token: crypto.randomBytes(32).toString('hex'),
    csrf: crypto.randomBytes(24).toString('hex'),
    username: admin.username,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  sessions.insert(session);
  return session;
}

export function logout(token) {
  if (token) sessions.remove(token);
}

export function sessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.find(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    sessions.remove(token);
    return null;
  }
  return session;
}

export function sessionCookie(token, { secure }) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseCookies(header = '') {
  const out = {};
  for (const pair of String(header || '').split(';')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}

export function checkCsrf(session, token) {
  if (!session || !token) return false;
  const a = Buffer.from(String(session.csrf));
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Create the seller account on first boot if none exists. */
export function ensureAdmin() {
  if (admins.all().length) return null;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const { salt, hash } = hashPassword(password);
  admins.insert({ username, salt, hash, createdAt: new Date().toISOString() });
  return { username, password, generated: !process.env.ADMIN_PASSWORD };
}
