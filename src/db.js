// Postgres-backed datastore.
//
// Each "collection" is a Postgres table holding one JSONB `data` column plus a
// few indexed columns for fast lookups, which keeps the document-shaped records
// the rest of the app expects while giving real persistence and concurrent-safe
// writes. Every method is async — callers must await.
//
// Uploaded product images still live on the filesystem under data/uploads, so
// DATA_DIR/UPLOAD_DIR remain exported for the routes and the mailer.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[db] DATABASE_URL is not set. Add it as an environment variable ' +
      '(e.g. the connection string from Neon or Supabase) before starting the app.',
  );
}

/**
 * TLS policy. Hosted providers need SSL and present valid certificates, so
 * verification stays ON — turning it off would leave customer addresses and
 * phone numbers open to interception. Local sockets get no SSL, and a provider
 * with a private CA can opt out explicitly.
 */
function sslConfig(url) {
  const insecure = String(process.env.DATABASE_SSL_INSECURE || '').toLowerCase() === 'true';
  let host = '';
  let mode = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    mode = parsed.searchParams.get('sslmode') || '';
  } catch {
    /* a non-URL connection string falls through to the default below */
  }
  if (mode === 'disable' || host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  if (insecure) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => console.error('[db] idle client error:', err.message));

const DEFAULT_SETTINGS = {
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
};

/* ------------------------------------------------------------------ */
/* Schema + load                                                        */
/* ------------------------------------------------------------------ */

const SCHEMA = `
  create table if not exists products (
    id text primary key,
    slug text unique not null,
    brand_id text,
    active boolean not null default true,
    data jsonb not null
  );
  create table if not exists brands (
    id text primary key,
    slug text unique not null,
    data jsonb not null
  );
  create table if not exists orders (
    id text primary key,
    number text unique,
    created_at timestamptz not null default now(),
    data jsonb not null
  );
  create table if not exists notifications (
    id text primary key,
    read boolean not null default false,
    created_at timestamptz not null default now(),
    data jsonb not null
  );
  create table if not exists admins (
    id text primary key,
    username text unique not null,
    data jsonb not null
  );
  create table if not exists sessions (
    token text primary key,
    expires_at timestamptz,
    data jsonb not null
  );
  create table if not exists counters (
    name text primary key,
    value integer not null
  );
  create table if not exists settings (
    id boolean primary key default true,
    data jsonb not null,
    constraint settings_singleton check (id)
  );
  create index if not exists products_brand_idx on products (brand_id);
  create index if not exists orders_created_idx on orders (created_at desc);
`;

let ready = null;

/**
 * Ensure the tables exist and settings/counters have a starting row, and make
 * sure the upload directory is present. Safe to call repeatedly.
 */
export function load() {
  if (!ready) {
    ready = (async () => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      await pool.query(SCHEMA);
      await pool.query(
        `insert into settings (id, data) values (true, $1) on conflict (id) do nothing`,
        [DEFAULT_SETTINGS],
      );
      await pool.query(
        `insert into counters (name, value) values ('order', 10023) on conflict (name) do nothing`,
      );
    })().catch((err) => {
      ready = null; // let a later attempt retry rather than caching the failure
      throw err;
    });
  }
  return ready;
}

/** Collection facade, kept for compatibility with the old synchronous db(). */
export function db() {
  return { products, brands, orders, notifications, admins, sessions, settings, nextOrderNumber };
}

/**
 * Replace the catalogue in one transaction. Used by the seeder.
 * Orders and notifications are only touched when the caller passes them.
 */
export async function replaceAll(next) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('truncate products, brands');
    if (next.orders) await client.query('truncate orders');
    if (next.notifications) await client.query('truncate notifications');

    for (const brand of next.brands || []) {
      await client.query('insert into brands (id, slug, data) values ($1, $2, $3)', [
        brand.id,
        brand.slug,
        brand,
      ]);
    }
    for (const product of next.products || []) {
      await client.query(
        'insert into products (id, slug, brand_id, active, data) values ($1, $2, $3, $4, $5)',
        [product.id, product.slug, product.brandId, product.active !== false, product],
      );
    }
    for (const order of next.orders || []) {
      await client.query('insert into orders (id, number, data) values ($1, $2, $3)', [
        order.id,
        order.number != null ? String(order.number) : null,
        order,
      ]);
    }
    for (const n of next.notifications || []) {
      await client.query('insert into notifications (id, read, data) values ($1, $2, $3)', [
        n.id,
        Boolean(n.read),
        n,
      ]);
    }
    if (next.counters?.order) {
      await client.query(
        `insert into counters (name, value) values ('order', $1)
         on conflict (name) do update set value = excluded.value`,
        [next.counters.order],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * No-op kept for compatibility: every write below persists immediately.
 * Callers that used to mutate an object and call save() must now pass their
 * change to the matching update() method instead.
 */
export async function save() {
  return true;
}

export async function close() {
  await pool.end();
}

/* ------------------------------------------------------------------ */
/* Collections                                                          */
/* ------------------------------------------------------------------ */

export const products = {
  async all() {
    const { rows } = await pool.query("select data from products order by data->>'createdAt' desc");
    return rows.map((r) => r.data);
  },
  async active() {
    const { rows } = await pool.query(
      "select data from products where active = true order by data->>'createdAt' desc",
    );
    return rows.map((r) => r.data);
  },
  async byId(pid) {
    const { rows } = await pool.query('select data from products where id = $1', [pid]);
    return rows[0]?.data || null;
  },
  async bySlug(slug) {
    const { rows } = await pool.query('select data from products where slug = $1', [slug]);
    return rows[0]?.data || null;
  },
  async insert(product) {
    await pool.query(
      'insert into products (id, slug, brand_id, active, data) values ($1, $2, $3, $4, $5)',
      [product.id, product.slug, product.brandId, product.active !== false, product],
    );
    return product;
  },
  async update(pid, patch) {
    const current = await products.byId(pid);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await pool.query('update products set data = $2, slug = $3, brand_id = $4, active = $5 where id = $1', [
      pid,
      updated,
      updated.slug,
      updated.brandId,
      updated.active !== false,
    ]);
    return updated;
  },
  async remove(pid) {
    const { rowCount } = await pool.query('delete from products where id = $1', [pid]);
    return rowCount > 0;
  },
};

export const brands = {
  async all() {
    const { rows } = await pool.query("select data from brands order by data->>'createdAt'");
    return rows.map((r) => r.data);
  },
  async byId(bid) {
    const { rows } = await pool.query('select data from brands where id = $1', [bid]);
    return rows[0]?.data || null;
  },
  async bySlug(slug) {
    const { rows } = await pool.query('select data from brands where slug = $1', [slug]);
    return rows[0]?.data || null;
  },
  async byName(name) {
    const { rows } = await pool.query(
      `select data from brands where lower(data->>'name') = lower($1)`,
      [name],
    );
    return rows[0]?.data || null;
  },
  async insert(brand) {
    await pool.query('insert into brands (id, slug, data) values ($1, $2, $3)', [
      brand.id,
      brand.slug,
      brand,
    ]);
    return brand;
  },
  async update(bid, patch) {
    const current = await brands.byId(bid);
    if (!current) return null;
    const updated = { ...current, ...patch };
    await pool.query('update brands set data = $2, slug = $3 where id = $1', [bid, updated, updated.slug]);
    return updated;
  },
  async remove(bid) {
    const { rowCount } = await pool.query('delete from brands where id = $1', [bid]);
    return rowCount > 0;
  },
};

export const orders = {
  async all() {
    const { rows } = await pool.query('select data from orders order by created_at desc');
    return rows.map((r) => r.data);
  },
  async byId(oid) {
    const { rows } = await pool.query('select data from orders where id = $1', [oid]);
    return rows[0]?.data || null;
  },
  async byNumber(num) {
    const { rows } = await pool.query('select data from orders where number = $1', [String(num)]);
    return rows[0]?.data || null;
  },
  async insert(order) {
    await pool.query('insert into orders (id, number, data) values ($1, $2, $3)', [
      order.id,
      order.number != null ? String(order.number) : null,
      order,
    ]);
    return order;
  },
  /** Replaces the stored document with `patch` merged over the current one. */
  async update(oid, patch) {
    const current = await orders.byId(oid);
    if (!current) return null;
    const updated = { ...current, ...patch };
    await pool.query('update orders set data = $2 where id = $1', [oid, updated]);
    return updated;
  },
};

export async function nextOrderNumber() {
  const { rows } = await pool.query(
    `update counters set value = value + 1 where name = 'order' returning value`,
  );
  return rows[0].value;
}

export const settings = {
  async get() {
    const { rows } = await pool.query('select data from settings where id = true');
    return { ...DEFAULT_SETTINGS, ...(rows[0]?.data || {}) };
  },
  async update(patch) {
    const current = await settings.get();
    const updated = { ...current, ...patch };
    await pool.query(
      `insert into settings (id, data) values (true, $1)
       on conflict (id) do update set data = excluded.data`,
      [updated],
    );
    return updated;
  },
};

export const notifications = {
  async all() {
    const { rows } = await pool.query(
      'select data from notifications order by created_at desc limit 500',
    );
    return rows.map((r) => r.data);
  },
  async unread() {
    const { rows } = await pool.query(
      'select data from notifications where read = false order by created_at desc',
    );
    return rows.map((r) => r.data);
  },
  async push(notification) {
    await pool.query('insert into notifications (id, read, data) values ($1, $2, $3)', [
      notification.id,
      Boolean(notification.read),
      notification,
    ]);
    await pool.query(`
      delete from notifications where id in (
        select id from notifications order by created_at desc offset 500
      )
    `);
    return notification;
  },
  async markRead(nid) {
    await pool.query(
      `update notifications set read = true, data = jsonb_set(data, '{read}', 'true') where id = $1`,
      [nid],
    );
  },
  async markAllRead() {
    await pool.query(
      `update notifications set read = true, data = jsonb_set(data, '{read}', 'true') where read = false`,
    );
  },
};

export const admins = {
  async all() {
    const { rows } = await pool.query('select data from admins');
    return rows.map((r) => r.data);
  },
  async byUsername(username) {
    const { rows } = await pool.query('select data from admins where lower(username) = lower($1)', [
      username,
    ]);
    return rows[0]?.data || null;
  },
  async insert(admin) {
    // The old store had no ids for admins; generate one so the row is addressable.
    const record = { id: admin.id || crypto.randomUUID(), ...admin };
    await pool.query('insert into admins (id, username, data) values ($1, $2, $3)', [
      record.id,
      record.username,
      record,
    ]);
    return record;
  },
  /** Needed by the password change in the dashboard. */
  async update(username, patch) {
    const current = await admins.byUsername(username);
    if (!current) return null;
    const updated = { ...current, ...patch };
    await pool.query('update admins set data = $2 where lower(username) = lower($1)', [
      username,
      updated,
    ]);
    return updated;
  },
};

/** Small aggregate queries, so the dashboard shell doesn't load every row. */
export const stats = {
  async newOrders() {
    const { rows } = await pool.query(
      `select count(*)::int as n from orders where data->>'status' = 'new'`,
    );
    return rows[0].n;
  },
  async unreadNotifications() {
    const { rows } = await pool.query('select count(*)::int as n from notifications where read = false');
    return rows[0].n;
  },
};

export const sessions = {
  async all() {
    const { rows } = await pool.query('select data from sessions');
    return rows.map((r) => r.data);
  },
  async find(token) {
    const { rows } = await pool.query('select data from sessions where token = $1', [token]);
    return rows[0]?.data || null;
  },
  async insert(session) {
    await pool.query('insert into sessions (token, expires_at, data) values ($1, $2, $3)', [
      session.token,
      session.expiresAt ? new Date(session.expiresAt) : null,
      session,
    ]);
    return session;
  },
  async remove(token) {
    await pool.query('delete from sessions where token = $1', [token]);
  },
  async prune() {
    await pool.query('delete from sessions where expires_at is not null and expires_at <= now()');
  },
};
