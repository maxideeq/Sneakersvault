// Tiny embedded JSON datastore.
//
// The whole catalogue lives in memory (a few hundred sneakers is a few hundred
// kB) and is flushed to disk atomically after every mutation. That keeps the
// project dependency-free and fast, while the API below is deliberately narrow
// so it can be swapped for Postgres/SQLite later without touching the routes.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  version: 1,
  products: [],
  brands: [],
  orders: [],
  notifications: [],
  admins: [],
  sessions: [],
  counters: { order: 10023 },
  settings: {
    storeName: 'Sole Society',
    tagline: 'Curated grails, verified pairs, shipped from Stockholm.',
    sellerEmail: process.env.SELLER_EMAIL || 'orders@solesociety.se',
    sellerPhone: '+46 70 123 45 67',
    currency: 'SEK',
    freeShippingOver: 2000,
    shippingFee: 79,
    inventoryMode: 'reserve', // 'reserve' | 'reduce' | 'none'
    orderNotice:
      'Your order will be sent to the seller. Payment and delivery details will be arranged with you after your order has been received.',
  },
};

let state = structuredClone(EMPTY);
let writeQueue = Promise.resolve();
let dirty = false;

export function load() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      state = { ...structuredClone(EMPTY), ...parsed };
      state.settings = { ...EMPTY.settings, ...(parsed.settings || {}) };
      state.counters = { ...EMPTY.counters, ...(parsed.counters || {}) };
    } catch (err) {
      const backup = `${DB_FILE}.corrupt-${Date.now()}`;
      fs.copyFileSync(DB_FILE, backup);
      console.error(`[db] could not parse db.json (${err.message}); kept a copy at ${backup}`);
      state = structuredClone(EMPTY);
    }
  }
  return state;
}

export function db() {
  return state;
}

/** Replace the whole state (used by the seeder). */
export function replaceAll(next) {
  state = next;
  return save();
}

/** Persist to disk atomically: write a temp file, then rename over the target. */
export function save() {
  dirty = true;
  writeQueue = writeQueue.then(async () => {
    if (!dirty) return;
    dirty = false;
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
    await fsp.rename(tmp, DB_FILE);
  }).catch((err) => console.error('[db] write failed:', err));
  return writeQueue;
}

/* ------------------------------------------------------------------ */
/* Collection helpers                                                   */
/* ------------------------------------------------------------------ */

export const products = {
  all: () => state.products,
  active: () => state.products.filter((p) => p.active !== false),
  byId: (pid) => state.products.find((p) => p.id === pid) || null,
  bySlug: (slug) => state.products.find((p) => p.slug === slug) || null,
  insert(product) {
    state.products.push(product);
    save();
    return product;
  },
  update(pid, patch) {
    const product = products.byId(pid);
    if (!product) return null;
    Object.assign(product, patch, { updatedAt: new Date().toISOString() });
    save();
    return product;
  },
  remove(pid) {
    const i = state.products.findIndex((p) => p.id === pid);
    if (i === -1) return false;
    state.products.splice(i, 1);
    save();
    return true;
  },
};

export const brands = {
  all: () => state.brands,
  byId: (bid) => state.brands.find((b) => b.id === bid) || null,
  bySlug: (slug) => state.brands.find((b) => b.slug === slug) || null,
  byName: (name) =>
    state.brands.find((b) => b.name.toLowerCase() === String(name).toLowerCase()) || null,
  insert(brand) {
    state.brands.push(brand);
    save();
    return brand;
  },
  update(bid, patch) {
    const brand = brands.byId(bid);
    if (!brand) return null;
    Object.assign(brand, patch);
    save();
    return brand;
  },
  remove(bid) {
    const i = state.brands.findIndex((b) => b.id === bid);
    if (i === -1) return false;
    state.brands.splice(i, 1);
    save();
    return true;
  },
};

export const orders = {
  all: () => state.orders,
  byId: (oid) => state.orders.find((o) => o.id === oid) || null,
  byNumber: (num) => state.orders.find((o) => String(o.number) === String(num)) || null,
  insert(order) {
    state.orders.unshift(order);
    save();
    return order;
  },
  update(oid, patch) {
    const order = orders.byId(oid);
    if (!order) return null;
    Object.assign(order, patch);
    save();
    return order;
  },
};

export function nextOrderNumber() {
  state.counters.order = (state.counters.order || 10023) + 1;
  save();
  return state.counters.order;
}

export const settings = {
  get: () => state.settings,
  update(patch) {
    Object.assign(state.settings, patch);
    save();
    return state.settings;
  },
};

export const notifications = {
  all: () => state.notifications,
  unread: () => state.notifications.filter((n) => !n.read),
  push(notification) {
    state.notifications.unshift(notification);
    if (state.notifications.length > 500) state.notifications.length = 500;
    save();
    return notification;
  },
  markRead(nid) {
    const n = state.notifications.find((x) => x.id === nid);
    if (n) n.read = true;
    save();
  },
  markAllRead() {
    state.notifications.forEach((n) => { n.read = true; });
    save();
  },
};

export const admins = {
  all: () => state.admins,
  byUsername: (username) =>
    state.admins.find((a) => a.username.toLowerCase() === String(username).toLowerCase()) || null,
  insert(admin) {
    state.admins.push(admin);
    save();
    return admin;
  },
};

export const sessions = {
  all: () => state.sessions,
  find: (token) => state.sessions.find((s) => s.token === token) || null,
  insert(session) {
    state.sessions.push(session);
    save();
    return session;
  },
  remove(token) {
    const i = state.sessions.findIndex((s) => s.token === token);
    if (i !== -1) state.sessions.splice(i, 1);
    save();
  },
  prune() {
    const now = Date.now();
    state.sessions = state.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    save();
  },
};
