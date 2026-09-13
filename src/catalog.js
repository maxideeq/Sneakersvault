// Catalogue logic: inventory maths, search, filtering and sorting.

import { products, brands, settings } from './db.js';
import { slugify } from './util.js';

export const CONDITIONS = ['Deadstock (DS)', 'Very Near Deadstock (VNDS)', 'Used — Excellent', 'Used — Good'];
export const CATEGORIES = ['Lifestyle', 'Basketball', 'Running', 'Skate', 'Trail', 'Collab'];
export const DEFAULT_SIZE_RUN = ['38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];

/** Units a customer can actually buy for a given size row. */
export function sizeAvailable(row) {
  if (!row || row.available === false) return 0;
  return Math.max(0, (Number(row.stock) || 0) - (Number(row.reserved) || 0));
}

export function sizeRow(product, size) {
  return (product.sizes || []).find((s) => String(s.size) === String(size)) || null;
}

export function inStockSizes(product) {
  return (product.sizes || []).filter((s) => sizeAvailable(s) > 0);
}

export function totalStock(product) {
  return (product.sizes || []).reduce((sum, s) => sum + sizeAvailable(s), 0);
}

export function isSoldOut(product) {
  return totalStock(product) === 0;
}

export function lowestPrice(product) {
  return Number(product.price) || 0;
}

/** Highlight badge shown on cards / product page. */
export function productBadge(product) {
  if (isSoldOut(product)) return { label: 'Sold out', tone: 'muted' };
  if (product.newArrival) return { label: 'New arrival', tone: 'accent' };
  if (product.popular) return { label: 'Popular', tone: 'hot' };
  if (totalStock(product) <= 2) return { label: 'Last pairs', tone: 'warn' };
  return null;
}

/**
 * Attach each product's brand record so the view layer can stay synchronous
 * and a page of 12 cards costs one brands query instead of twelve.
 * The property is non-enumerable, so it never leaks back into the database
 * through a spread or JSON.stringify.
 */
export async function withBrands(list) {
  const all = await brands.all();
  const byId = new Map(all.map((b) => [b.id, b]));
  for (const product of list) {
    const brand = byId.get(product.brandId) || { name: product.brandName || 'Unknown', slug: '' };
    Object.defineProperty(product, '_brand', { value: brand, enumerable: false, configurable: true });
  }
  return list;
}

/** Synchronous — reads the brand attached by withBrands(). */
export function brandOf(product) {
  if (!product) return { name: 'Unknown', slug: '' };
  return product._brand || { name: product.brandName || 'Unknown', slug: '' };
}

/** Normalise a size list coming from the admin form. */
export function normaliseSizes(rows) {
  const seen = new Set();
  return rows
    .map((row) => ({
      size: String(row.size).trim().replace(',', '.'),
      stock: Math.max(0, Math.round(Number(row.stock) || 0)),
      reserved: Math.max(0, Math.round(Number(row.reserved) || 0)),
      available: row.available !== false && row.available !== 'false',
    }))
    .filter((row) => {
      if (!row.size || seen.has(row.size)) return false;
      seen.add(row.size);
      return true;
    })
    .sort((a, b) => Number(a.size) - Number(b.size));
}

export async function uniqueSlug(name, ignoreId = null) {
  const base = slugify(name) || 'sneaker';
  const taken = (await products.all()).filter((p) => p.id !== ignoreId).map((p) => p.slug);
  let candidate = base;
  let n = 2;
  while (taken.includes(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}

export async function uniqueBrandSlug(name, ignoreId = null) {
  const base = slugify(name) || 'brand';
  const taken = (await brands.all()).filter((b) => b.id !== ignoreId).map((b) => b.slug);
  let candidate = base;
  let n = 2;
  while (taken.includes(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}

/* ------------------------------------------------------------------ */
/* Search + filtering                                                   */
/* ------------------------------------------------------------------ */

export const SORTS = {
  relevance: { label: 'Relevance' },
  newest: { label: 'Newest' },
  popular: { label: 'Popular' },
  'price-asc': { label: 'Price: Low to High' },
  'price-desc': { label: 'Price: High to Low' },
};

function matchScore(product, brand, terms) {
  const name = product.name.toLowerCase();
  const brandName = (brand.name || '').toLowerCase();
  const sku = (product.sku || '').toLowerCase();
  const colorway = (product.colorway || '').toLowerCase();
  let score = 0;
  for (const term of terms) {
    let hit = 0;
    if (name.startsWith(term)) hit += 60;
    else if (name.includes(term)) hit += 40;
    if (brandName.includes(term)) hit += 30;
    if (sku.includes(term)) hit += 45;
    if (colorway.includes(term)) hit += 15;
    if (`${brandName} ${name}`.includes(term)) hit += 10;
    if (!hit) return -1; // every term must match something
    score += hit;
  }
  return score;
}

/**
 * Filter + sort the catalogue.
 * @param {object} q  { search, brand[], size[], min, max, category[], availability, tag, sort }
 */
export async function queryProducts(q = {}) {
  const list = await withBrands(await products.active());
  const terms = String(q.search || '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const brandSlugs = toArray(q.brand);
  const sizes = toArray(q.size).map((s) => String(s).replace(',', '.'));
  const categories = toArray(q.category);
  const min = q.min === '' || q.min === undefined ? null : Number(q.min);
  const max = q.max === '' || q.max === undefined ? null : Number(q.max);

  const scored = [];
  for (const product of list) {
    const brand = brandOf(product);
    if (brandSlugs.length && !brandSlugs.includes(brand.slug)) continue;
    if (categories.length && !categories.includes(product.category)) continue;
    if (min !== null && !Number.isNaN(min) && product.price < min) continue;
    if (max !== null && !Number.isNaN(max) && product.price > max) continue;
    if (sizes.length && !sizes.some((s) => sizeAvailable(sizeRow(product, s)) > 0)) continue;
    if (q.availability === 'in-stock' && isSoldOut(product)) continue;
    if (q.availability === 'sold-out' && !isSoldOut(product)) continue;
    if (q.tag === 'new' && !product.newArrival) continue;
    if (q.tag === 'popular' && !product.popular) continue;
    if (q.tag === 'featured' && !product.featured) continue;

    let score = 0;
    if (terms.length) {
      score = matchScore(product, brand, terms);
      if (score < 0) continue;
    }
    scored.push({ product, score });
  }

  const sort = q.sort && SORTS[q.sort] ? q.sort : terms.length ? 'relevance' : 'newest';
  scored.sort((a, b) => {
    switch (sort) {
      case 'price-asc':
        return a.product.price - b.product.price;
      case 'price-desc':
        return b.product.price - a.product.price;
      case 'popular':
        return (b.product.salesCount || 0) - (a.product.salesCount || 0) ||
          (b.product.popular ? 1 : 0) - (a.product.popular ? 1 : 0);
      case 'newest':
        return new Date(b.product.createdAt) - new Date(a.product.createdAt);
      default:
        return b.score - a.score || new Date(b.product.createdAt) - new Date(a.product.createdAt);
    }
  });

  return { items: scored.map((s) => s.product), sort };
}

export function toArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value.filter((v) => v !== '') : [value];
}

/** Every size that exists anywhere in the catalogue, for the filter sidebar. */
export async function allSizes() {
  const set = new Set();
  for (const p of await products.active()) for (const s of p.sizes || []) set.add(String(s.size));
  return [...set].sort((a, b) => Number(a) - Number(b));
}

export async function priceBounds() {
  const prices = (await products.active()).map((p) => p.price);
  if (!prices.length) return { min: 0, max: 5000 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Brands with a live product count, for the brands page and filters. */
export async function brandsWithCounts() {
  const counts = new Map();
  for (const p of await products.active()) counts.set(p.brandId, (counts.get(p.brandId) || 0) + 1);
  return (await brands.all())
    .map((b) => ({ ...b, count: counts.get(b.id) || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Inventory movements                                                  */
/* ------------------------------------------------------------------ */

/**
 * Apply an order to inventory according to the seller's setting.
 * reserve -> hold the pair (stock stays, availability drops)
 * reduce  -> take it straight out of stock
 * none    -> stock is managed manually
 *
 * Each product is written back explicitly — the store hands out detached
 * copies, so mutating them in memory would persist nothing.
 */
export async function applyOrderToInventory(items) {
  const mode = (await settings.get()).inventoryMode;
  if (mode === 'none') return;
  for (const item of items) {
    const product = await products.byId(item.productId);
    if (!product) continue;
    const row = sizeRow(product, item.size);
    if (!row) continue;
    if (mode === 'reduce') row.stock = Math.max(0, (row.stock || 0) - item.quantity);
    else row.reserved = (row.reserved || 0) + item.quantity;
    await products.update(product.id, {
      sizes: product.sizes,
      salesCount: (product.salesCount || 0) + item.quantity,
    });
  }
}

/**
 * Put stock back when an order is cancelled.
 * @returns {Promise<boolean>} true when stock was actually released, so the
 * caller can record it on the order.
 */
export async function releaseOrderInventory(order) {
  const mode = (await settings.get()).inventoryMode;
  if (mode === 'none' || order.inventoryReleased) return false;
  for (const item of order.items) {
    const product = await products.byId(item.productId);
    if (!product) continue;
    const row = sizeRow(product, item.size);
    if (!row) continue;
    if (mode === 'reduce') row.stock = (row.stock || 0) + item.quantity;
    else row.reserved = Math.max(0, (row.reserved || 0) - item.quantity);
    await products.update(product.id, {
      sizes: product.sizes,
      salesCount: Math.max(0, (product.salesCount || 0) - item.quantity),
    });
  }
  return true;
}

/**
 * A reserved pair becomes a sold pair once the seller marks the order paid.
 * @returns {Promise<boolean>} true when the reservation was converted.
 */
export async function commitOrderInventory(order) {
  const mode = (await settings.get()).inventoryMode;
  if (mode !== 'reserve' || order.inventoryCommitted) return false;
  for (const item of order.items) {
    const product = await products.byId(item.productId);
    if (!product) continue;
    const row = sizeRow(product, item.size);
    if (!row) continue;
    row.reserved = Math.max(0, (row.reserved || 0) - item.quantity);
    row.stock = Math.max(0, (row.stock || 0) - item.quantity);
    await products.update(product.id, { sizes: product.sizes });
  }
  return true;
}
