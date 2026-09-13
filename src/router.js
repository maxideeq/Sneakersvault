// Route table for the storefront, the JSON API and the seller dashboard.

import crypto from 'node:crypto';
import path from 'node:path';
import fsp from 'node:fs/promises';

import {
  brands as brandsRepo,
  notifications,
  orders as ordersRepo,
  products as productsRepo,
  settings,
  admins,
  save,
  UPLOAD_DIR,
} from './db.js';
import {
  brandOf,
  normaliseSizes,
  queryProducts,
  sizeAvailable,
  totalStock,
  uniqueBrandSlug,
  uniqueSlug,
  isSoldOut,
} from './catalog.js';
import { esc, id as makeId } from './util.js';
import { html, json, redirect, parseBody, parseQuery, clientIp, sameOrigin, safeJoin, serveFile, IMAGE_MIME } from './http.js';
import {
  checkCsrf,
  clearCookie,
  hashPassword,
  login,
  logout,
  sessionCookie,
  sessionFromRequest,
  throttled,
  verifyPassword,
} from './auth.js';
import { createOrder, resolveItems, setStatus, totalsFor, validateCustomer } from './orders.js';
import { mailConfigured } from './mail.js';

import { homePage } from './views/home.js';
import { shopPage } from './views/shop.js';
import { productPage } from './views/product.js';
import { cartPage, checkoutPage, confirmationPage, trackPage } from './views/checkout.js';
import { brandsPage, howItWorksPage, notFoundPage } from './views/misc.js';
import {
  adminShell,
  dashboardPage,
  loginPage,
  notificationsPage,
  orderDetailPage,
  ordersPage,
} from './views/admin.js';
import {
  brandsAdminPage,
  inventoryPage,
  productFormPage,
  productsPage,
  settingsPage,
} from './views/adminCatalog.js';

const ADMIN_PAGE_SIZE = 25;

/* Flash messages are passed between redirects as short codes. */
const FLASHES = {
  saved: { type: 'ok', message: 'Changes saved.' },
  'product-created': { type: 'ok', message: 'Sneaker published and live in the shop.' },
  'product-updated': { type: 'ok', message: 'Sneaker updated.' },
  'product-deleted': { type: 'ok', message: 'Sneaker deleted.' },
  'stock-updated': { type: 'ok', message: 'Stock levels updated.' },
  'brand-created': { type: 'ok', message: 'Brand added.' },
  'brand-updated': { type: 'ok', message: 'Brand updated.' },
  'brand-deleted': { type: 'ok', message: 'Brand deleted.' },
  'brand-in-use': { type: 'error', message: 'That brand still has products — move or delete them first.' },
  'status-updated': { type: 'ok', message: 'Order status updated.' },
  'notes-saved': { type: 'ok', message: 'Notes saved.' },
  'password-changed': { type: 'ok', message: 'Password changed.' },
  'password-wrong': { type: 'error', message: 'Your current password was not correct.' },
  'password-short': { type: 'error', message: 'The new password must be at least 8 characters.' },
  'read-all': { type: 'ok', message: 'All notifications marked as read.' },
  'csrf': { type: 'error', message: 'Your session expired — please try again.' },
  'upload-failed': { type: 'error', message: 'One or more images could not be saved.' },
};

function flashFrom(url) {
  const code = url.searchParams.get('flash');
  return code && FLASHES[code] ? FLASHES[code] : null;
}

/* Simple per-IP throttle for order submissions. */
const orderHits = new Map();
function orderRateLimited(ip) {
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const hits = (orderHits.get(ip) || []).filter((t) => now - t < window);
  hits.push(now);
  orderHits.set(ip, hits);
  if (orderHits.size > 5000) orderHits.clear();
  return hits.length > 12;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname.replace(/\/+$/, '') || '/');
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  // Uploaded product images.
  if (pathname.startsWith('/uploads/')) {
    const target = safeJoin(UPLOAD_DIR, pathname.slice('/uploads'.length));
    if (target && (await serveFile(req, res, target, { cache: 'public, max-age=604800' }))) return;
    return html(req, res, notFoundPage(), 404);
  }

  if (pathname.startsWith('/admin')) return adminRoutes(req, res, url, pathname, method);
  if (pathname.startsWith('/api/')) return apiRoutes(req, res, url, pathname, method);
  return publicRoutes(req, res, url, pathname, method);
}

/* ------------------------------------------------------------------ */
/* Storefront                                                          */
/* ------------------------------------------------------------------ */

async function publicRoutes(req, res, url, pathname, method) {
  if (method !== 'GET') return html(req, res, notFoundPage(), 405);
  const params = parseQuery(url.searchParams.toString());
  const page = Math.max(1, Number(params.page) || 1);

  if (pathname === '/') return html(req, res, homePage());

  if (pathname === '/sneakers') {
    const { items } = queryProducts(params);
    return html(
      req,
      res,
      shopPage({
        title: params.search ? `Search: ${params.search}` : 'All sneakers',
        lede: params.search
          ? `Results for “${params.search}” across names, brands and SKUs.`
          : 'Every authenticated pair currently in the rotation. Filter by brand, size, price or availability.',
        items,
        params,
        page,
        canonical: '/sneakers',
      }),
    );
  }

  if (pathname === '/new-arrivals') {
    const { items } = queryProducts({ ...params, tag: 'new' });
    return html(
      req,
      res,
      shopPage({
        title: 'New arrivals',
        lede: 'The latest pairs to land in the shop — freshly inspected and ready to ship.',
        items,
        params: { ...params, tag: 'new' },
        basePath: '/new-arrivals',
        page,
        active: 'new',
        canonical: '/new-arrivals',
        crumbs: [{ href: '/', label: 'Home' }, { label: 'New arrivals' }],
      }),
    );
  }

  if (pathname === '/popular') {
    const { items } = queryProducts({ ...params, tag: 'popular', sort: params.sort || 'popular' });
    return html(
      req,
      res,
      shopPage({
        title: 'Popular sneakers',
        lede: 'The pairs everyone is asking for right now.',
        items,
        params: { ...params, tag: 'popular' },
        basePath: '/popular',
        page,
        active: 'popular',
        canonical: '/popular',
        crumbs: [{ href: '/', label: 'Home' }, { label: 'Popular' }],
      }),
    );
  }

  if (pathname === '/brands') return html(req, res, brandsPage());

  if (pathname.startsWith('/brands/')) {
    const brand = brandsRepo.bySlug(pathname.slice('/brands/'.length));
    if (!brand) return html(req, res, notFoundPage(), 404);
    const { items } = queryProducts({ ...params, brand: [brand.slug] });
    return html(
      req,
      res,
      shopPage({
        title: brand.name,
        lede: brand.description || `Every ${brand.name} pair currently available at ${settings.get().storeName}.`,
        items,
        params: { ...params, brand: [brand.slug] },
        basePath: `/brands/${brand.slug}`,
        page,
        active: 'brands',
        canonical: `/brands/${brand.slug}`,
        crumbs: [{ href: '/', label: 'Home' }, { href: '/brands', label: 'Brands' }, { label: brand.name }],
      }),
    );
  }

  if (pathname.startsWith('/sneakers/')) {
    const product = productsRepo.bySlug(pathname.slice('/sneakers/'.length));
    if (!product || product.active === false) return html(req, res, notFoundPage(), 404);
    return html(req, res, productPage(product));
  }

  if (pathname === '/cart') return html(req, res, cartPage(), 200, { 'X-Robots-Tag': 'noindex' });
  if (pathname === '/checkout') return html(req, res, checkoutPage(), 200, { 'X-Robots-Tag': 'noindex' });
  if (pathname === '/how-it-works') return html(req, res, howItWorksPage());

  if (pathname === '/track') {
    const number = String(params.number || '').replace(/[^\d]/g, '');
    const email = String(params.email || '').trim().toLowerCase();
    if (!number && !email) return html(req, res, trackPage({ query: params }), 200, { 'X-Robots-Tag': 'noindex' });
    const order = ordersRepo.byNumber(number);
    if (!order || order.customer.email.toLowerCase() !== email) {
      return html(
        req,
        res,
        trackPage({ error: 'No order matches that number and email. Check your confirmation email and try again.', query: params }),
        404,
        { 'X-Robots-Tag': 'noindex' },
      );
    }
    return html(req, res, trackPage({ order, query: params }), 200, { 'X-Robots-Tag': 'noindex' });
  }

  if (pathname.startsWith('/order/')) {
    const number = pathname.slice('/order/'.length).replace(/[^\d]/g, '');
    const order = ordersRepo.byNumber(number);
    const token = url.searchParams.get('t');
    if (!order || !token || token !== order.token) return html(req, res, notFoundPage(), 404);
    return html(req, res, confirmationPage(order), 200, { 'X-Robots-Tag': 'noindex' });
  }

  if (pathname === '/robots.txt') {
    const site = (process.env.SITE_URL || '').replace(/\/$/, '');
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /checkout',
      'Disallow: /cart',
      'Disallow: /order/',
      'Disallow: /track',
      site ? `Sitemap: ${site}/sitemap.xml` : '',
      '',
    ].join('\n');
    return res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }), res.end(body);
  }

  if (pathname === '/sitemap.xml') {
    const site = (process.env.SITE_URL || '').replace(/\/$/, '');
    const urls = [
      { loc: '/', priority: '1.0' },
      { loc: '/sneakers', priority: '0.9' },
      { loc: '/new-arrivals', priority: '0.8' },
      { loc: '/popular', priority: '0.8' },
      { loc: '/brands', priority: '0.7' },
      { loc: '/how-it-works', priority: '0.4' },
      ...brandsRepo.all().map((b) => ({ loc: `/brands/${b.slug}`, priority: '0.6' })),
      ...productsRepo.active().map((p) => ({ loc: `/sneakers/${p.slug}`, priority: '0.8', lastmod: p.updatedAt || p.createdAt })),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${esc(site + u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(String(u.lastmod).slice(0, 10))}</lastmod>` : ''}<priority>${u.priority}</priority></url>`,
  )
  .join('\n')}
</urlset>`;
    return res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' }), res.end(body);
  }

  return html(req, res, notFoundPage(), 404);
}

/* ------------------------------------------------------------------ */
/* JSON API                                                            */
/* ------------------------------------------------------------------ */

async function apiRoutes(req, res, url, pathname, method) {
  if (pathname === '/api/search' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(12, Math.max(1, Number(url.searchParams.get('limit')) || 6));
    const { items } = queryProducts({ search: q });
    return json(
      req,
      res,
      {
        results: items.slice(0, limit).map((p) => ({
          slug: p.slug,
          name: p.name,
          brand: brandOf(p).name,
          sku: p.sku || '',
          price: p.price,
          image: (p.images || [])[0] || '/img/placeholder.svg',
          soldOut: isSoldOut(p),
        })),
        total: items.length,
      },
      200,
      { 'Cache-Control': 'public, max-age=30' },
    );
  }

  if (pathname === '/api/cart/validate' && method === 'POST') {
    const { fields } = await parseBody(req);
    const { lines, problems } = resolveItems(fields.items);
    const items = lines.map((l) => ({
      productId: l.productId,
      slug: l.slug,
      name: l.name,
      brand: l.brand,
      size: l.size,
      qty: l.quantity,
      price: l.price,
      image: l.image,
      maxQty: l.maxQty,
    }));
    const requested = Array.isArray(fields.items) ? fields.items.length : 0;
    return json(req, res, {
      items,
      problems,
      changed: problems.length > 0 || items.length !== requested,
      totals: totalsFor(lines),
    });
  }

  if (pathname === '/api/orders' && method === 'POST') {
    if (!sameOrigin(req)) return json(req, res, { ok: false, error: 'Invalid request origin.' }, 403);
    const ip = clientIp(req);
    if (orderRateLimited(ip)) {
      return json(req, res, { ok: false, error: 'Too many orders from this connection. Please contact the seller directly.' }, 429);
    }
    const { fields } = await parseBody(req);
    const { customer, errors } = validateCustomer(fields);
    if (Object.keys(errors).length) {
      return json(req, res, { ok: false, error: Object.values(errors)[0], fields: errors }, 400);
    }
    const { lines, problems } = resolveItems(fields.items);
    if (!lines.length) {
      return json(
        req,
        res,
        { ok: false, error: problems[0] || 'Your cart is empty or the pairs are no longer available.' },
        409,
      );
    }
    const order = await createOrder({ customer, lines });
    return json(req, res, {
      ok: true,
      number: order.number,
      total: order.total,
      problems,
      redirect: `/order/${order.number}?t=${order.token}`,
    });
  }

  return json(req, res, { ok: false, error: 'Not found' }, 404);
}

/* ------------------------------------------------------------------ */
/* Seller dashboard                                                    */
/* ------------------------------------------------------------------ */

async function adminRoutes(req, res, url, pathname, method) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https');
  const session = sessionFromRequest(req);
  const noIndex = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };

  if (pathname === '/admin/login' && method === 'POST') {
    const { fields } = await parseBody(req);
    const ip = clientIp(req);
    if (!sameOrigin(req)) return html(req, res, loginPage({ error: 'Invalid request origin.' }), 403, noIndex);
    if (throttled(ip)) {
      return html(req, res, loginPage({ error: 'Too many failed attempts. Try again in a few minutes.' }), 429, noIndex);
    }
    const created = login(fields.username, fields.password, ip);
    if (!created) {
      return html(
        req,
        res,
        loginPage({ error: 'Wrong username or password.', username: String(fields.username || '').slice(0, 60) }),
        401,
        noIndex,
      );
    }
    res.writeHead(303, { Location: '/admin/dashboard', 'Set-Cookie': sessionCookie(created.token, { secure }) });
    return res.end();
  }

  if (!session) {
    if (pathname === '/admin/logout') return redirect(res, '/admin');
    return html(req, res, loginPage(), pathname === '/admin' ? 200 : 401, noIndex);
  }

  if (pathname === '/admin/logout' && method === 'POST') {
    logout(session.token);
    res.writeHead(303, { Location: '/admin', 'Set-Cookie': clearCookie() });
    return res.end();
  }

  // Every state-changing admin request must carry the session's CSRF token.
  let fields = {};
  let files = [];
  if (method === 'POST') {
    const parsed = await parseBody(req);
    fields = parsed.fields;
    files = parsed.files;
    if (!sameOrigin(req) || !checkCsrf(session, fields._csrf)) {
      return redirect(res, `${pathname}?flash=csrf`);
    }
  }

  const flash = flashFrom(url);
  const page = (body, status = 200) => html(req, res, body, status, noIndex);

  if (pathname === '/admin' || pathname === '/admin/dashboard') {
    return page(dashboardPage({ session, flash }));
  }

  /* Orders ---------------------------------------------------------- */
  if (pathname === '/admin/orders' && method === 'GET') {
    const status = url.searchParams.get('status') || '';
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const current = Math.max(1, Number(url.searchParams.get('page')) || 1);
    let list = ordersRepo.all();
    if (status) list = list.filter((o) => o.status === status);
    if (search) {
      list = list.filter((o) =>
        [
          String(o.number),
          `${o.customer.firstName} ${o.customer.lastName}`,
          o.customer.email,
          o.customer.phone,
          o.customer.city,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }
    const pages = Math.max(1, Math.ceil(list.length / ADMIN_PAGE_SIZE));
    const slice = list.slice((current - 1) * ADMIN_PAGE_SIZE, current * ADMIN_PAGE_SIZE);
    return page(ordersPage({ session, flash, list: slice, status, search: url.searchParams.get('search') || '', page: current, pages }));
  }

  const orderMatch = pathname.match(/^\/admin\/orders\/([^/]+)(\/(status|notes))?$/);
  if (orderMatch) {
    const order = ordersRepo.byId(orderMatch[1]);
    if (!order) return page(adminShell({ title: 'Order not found', body: '<p class="panel__empty">That order does not exist.</p>', active: 'orders', session }), 404);

    if (method === 'GET') {
      const unread = notifications.all().filter((n) => n.orderId === order.id && !n.read);
      unread.forEach((n) => notifications.markRead(n.id));
      return page(orderDetailPage({ session, flash, order }));
    }
    if (method === 'POST' && orderMatch[3] === 'status') {
      setStatus(order, String(fields.status || ''), { note: String(fields.note || '').slice(0, 300) });
      return redirect(res, `/admin/orders/${order.id}?flash=status-updated`);
    }
    if (method === 'POST' && orderMatch[3] === 'notes') {
      order.sellerNotes = String(fields.sellerNotes || '').slice(0, 4000);
      save();
      return redirect(res, `/admin/orders/${order.id}?flash=notes-saved`);
    }
  }

  /* Notifications ---------------------------------------------------- */
  if (pathname === '/admin/notifications' && method === 'GET') return page(notificationsPage({ session, flash }));
  if (pathname === '/admin/notifications/read' && method === 'POST') {
    notifications.markAllRead();
    return redirect(res, '/admin/notifications?flash=read-all');
  }

  /* Products --------------------------------------------------------- */
  if (pathname === '/admin/products' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const brand = url.searchParams.get('brand') || '';
    const stock = url.searchParams.get('stock') || '';
    let list = productsRepo.all().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (search) {
      list = list.filter((p) =>
        `${p.name} ${p.sku || ''} ${p.colorway || ''} ${brandOf(p).name}`.toLowerCase().includes(search),
      );
    }
    if (brand) list = list.filter((p) => brandOf(p).slug === brand);
    if (stock === 'in') list = list.filter((p) => totalStock(p) > 0);
    if (stock === 'low') list = list.filter((p) => totalStock(p) > 0 && totalStock(p) <= 2);
    if (stock === 'out') list = list.filter((p) => totalStock(p) === 0);
    if (stock === 'hidden') list = list.filter((p) => p.active === false);
    return page(productsPage({ session, flash, list, search: url.searchParams.get('search') || '', brand, stock }));
  }

  if (pathname === '/admin/products/new' && method === 'GET') return page(productFormPage({ session, flash }));

  if (pathname === '/admin/products' && method === 'POST') {
    const result = await buildProductFromForm(fields, files);
    if (result.errors) return page(productFormPage({ session, errors: result.errors, values: result.values }), 400);
    const now = new Date().toISOString();
    const product = {
      id: makeId('p_'),
      slug: uniqueSlug(`${brandsRepo.byId(result.data.brandId)?.name || ''} ${result.data.name}`),
      createdAt: now,
      updatedAt: now,
      salesCount: 0,
      ...result.data,
    };
    productsRepo.insert(product);
    return redirect(res, `/admin/products/${product.id}?flash=product-created`);
  }

  const productMatch = pathname.match(/^\/admin\/products\/([^/]+)(\/delete)?$/);
  if (productMatch && productMatch[1] !== 'new') {
    const product = productsRepo.byId(productMatch[1]);
    if (!product) {
      return page(
        adminShell({ title: 'Product not found', body: '<p class="panel__empty">That product does not exist.</p>', active: 'products', session }),
        404,
      );
    }
    if (method === 'GET') return page(productFormPage({ session, flash, product }));
    if (method === 'POST' && productMatch[2] === '/delete') {
      productsRepo.remove(product.id);
      return redirect(res, '/admin/products?flash=product-deleted');
    }
    if (method === 'POST') {
      const result = await buildProductFromForm(fields, files, product);
      if (result.errors) return page(productFormPage({ session, product, errors: result.errors, values: result.values }), 400);
      const renamed = result.data.name !== product.name || result.data.brandId !== product.brandId;
      productsRepo.update(product.id, {
        ...result.data,
        slug: renamed
          ? uniqueSlug(`${brandsRepo.byId(result.data.brandId)?.name || ''} ${result.data.name}`, product.id)
          : product.slug,
      });
      return redirect(res, `/admin/products/${product.id}?flash=product-updated`);
    }
  }

  /* Inventory -------------------------------------------------------- */
  if (pathname === '/admin/inventory' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    let list = productsRepo.all().slice().sort((a, b) => a.name.localeCompare(b.name));
    if (search) {
      list = list.filter((p) => `${p.name} ${p.sku || ''} ${brandOf(p).name}`.toLowerCase().includes(search));
    }
    return page(inventoryPage({ session, flash, list, search: url.searchParams.get('search') || '' }));
  }

  const inventoryMatch = pathname.match(/^\/admin\/inventory\/([^/]+)$/);
  if (inventoryMatch && method === 'POST') {
    const product = productsRepo.byId(inventoryMatch[1]);
    if (product) {
      for (const row of product.sizes || []) {
        const raw = fields[`stock_${row.size}`];
        if (raw === undefined) continue;
        row.stock = Math.max(0, Math.round(Number(raw) || 0));
      }
      productsRepo.update(product.id, { sizes: product.sizes });
    }
    return redirect(res, '/admin/inventory?flash=stock-updated');
  }

  /* Brands ----------------------------------------------------------- */
  if (pathname === '/admin/brands' && method === 'GET') return page(brandsAdminPage({ session, flash }));

  if (pathname === '/admin/brands' && method === 'POST') {
    const name = String(fields.name || '').trim().slice(0, 60);
    if (name && !brandsRepo.byName(name)) {
      brandsRepo.insert({
        id: makeId('b_'),
        name,
        slug: uniqueBrandSlug(name),
        description: String(fields.description || '').trim().slice(0, 400),
        createdAt: new Date().toISOString(),
      });
    }
    return redirect(res, '/admin/brands?flash=brand-created');
  }

  const brandMatch = pathname.match(/^\/admin\/brands\/([^/]+)(\/delete)?$/);
  if (brandMatch && method === 'POST') {
    const brand = brandsRepo.byId(brandMatch[1]);
    if (!brand) return redirect(res, '/admin/brands');
    if (brandMatch[2] === '/delete') {
      const inUse = productsRepo.all().some((p) => p.brandId === brand.id);
      if (inUse) return redirect(res, '/admin/brands?flash=brand-in-use');
      brandsRepo.remove(brand.id);
      return redirect(res, '/admin/brands?flash=brand-deleted');
    }
    const name = String(fields.name || '').trim().slice(0, 60);
    if (name) brandsRepo.update(brand.id, { name, slug: uniqueBrandSlug(name, brand.id) });
    return redirect(res, '/admin/brands?flash=brand-updated');
  }

  /* Settings --------------------------------------------------------- */
  if (pathname === '/admin/settings' && method === 'GET') {
    return page(settingsPage({ session, flash, mailStatus: { configured: mailConfigured(), host: process.env.SMTP_HOST || '' } }));
  }

  if (pathname === '/admin/settings' && method === 'POST') {
    settings.update({
      storeName: String(fields.storeName || '').trim().slice(0, 60) || settings.get().storeName,
      tagline: String(fields.tagline || '').trim().slice(0, 160),
      sellerEmail: String(fields.sellerEmail || '').trim().slice(0, 120),
      sellerPhone: String(fields.sellerPhone || '').trim().slice(0, 40),
      shippingFee: Math.max(0, Math.round(Number(fields.shippingFee) || 0)),
      freeShippingOver: Math.max(0, Math.round(Number(fields.freeShippingOver) || 0)),
      inventoryMode: ['reserve', 'reduce', 'none'].includes(fields.inventoryMode) ? fields.inventoryMode : 'reserve',
      orderNotice: String(fields.orderNotice || '').trim().slice(0, 400),
    });
    return redirect(res, '/admin/settings?flash=saved');
  }

  if (pathname === '/admin/password' && method === 'POST') {
    const admin = admins.byUsername(session.username);
    const next = String(fields.newPassword || '');
    if (!admin || !verifyPassword(String(fields.currentPassword || ''), admin.salt, admin.hash)) {
      return redirect(res, '/admin/settings?flash=password-wrong');
    }
    if (next.length < 8) return redirect(res, '/admin/settings?flash=password-short');
    const { salt, hash } = hashPassword(next);
    admin.salt = salt;
    admin.hash = hash;
    save();
    return redirect(res, '/admin/settings?flash=password-changed');
  }

  return page(
    adminShell({ title: 'Not found', body: '<p class="panel__empty">That dashboard page does not exist.</p>', active: '', session }),
    404,
  );
}

/* ------------------------------------------------------------------ */
/* Product form handling                                               */
/* ------------------------------------------------------------------ */

async function buildProductFromForm(fields, files, existing = null) {
  const values = {
    name: String(fields.name || '').trim().slice(0, 120),
    brandId: String(fields.brandId || ''),
    sku: String(fields.sku || '').trim().slice(0, 40),
    price: String(fields.price || '').trim(),
    category: String(fields.category || 'Lifestyle'),
    condition: String(fields.condition || '').slice(0, 60),
    colorway: String(fields.colorway || '').trim().slice(0, 80),
    releaseYear: String(fields.releaseYear || '').trim().slice(0, 4),
    description: String(fields.description || '').trim().slice(0, 3000),
    featured: fields.featured === '1',
    newArrival: fields.newArrival === '1',
    popular: fields.popular === '1',
    active: fields.active === '1',
  };

  const errors = {};
  if (!values.name) errors.name = 'A name is required.';
  if (!brandsRepo.byId(values.brandId)) errors.brandId = 'Pick a brand.';
  const price = Math.round(Number(values.price));
  if (!Number.isFinite(price) || price < 0) errors.price = 'Enter a price in SEK.';
  if (Object.keys(errors).length) return { errors, values };

  // Size rows arrive as parallel arrays. Unchecked checkboxes are never
  // submitted, so each row carries a key and "available" is the set of keys
  // that came back checked.
  const sizeKeys = toList(fields.sizeKey);
  const sizeValues = toList(fields.sizeValue);
  const sizeStocks = toList(fields.sizeStock);
  const availableKeys = new Set(toList(fields.sizeAvailable).map(String));
  const previous = new Map((existing?.sizes || []).map((r) => [String(r.size), r]));

  const sizes = normaliseSizes(
    sizeValues.map((size, i) => ({
      size,
      stock: sizeStocks[i] ?? 0,
      reserved: previous.get(String(size).trim())?.reserved || 0,
      available: availableKeys.has(String(sizeKeys[i])),
    })),
  );

  const images = [];
  for (const url of toList(fields.existingImages)) {
    const trimmed = String(url).trim();
    if (trimmed) images.push(trimmed);
  }
  for (const line of String(fields.imageUrls || '').split(/[\n,]/)) {
    const trimmed = line.trim();
    if (trimmed && !images.includes(trimmed)) images.push(trimmed);
  }
  for (const file of files) {
    if (file.field !== 'images' || !file.data?.length) continue;
    const saved = await saveUpload(file);
    if (saved) images.push(saved);
  }

  return {
    data: {
      ...values,
      price,
      releaseYear: values.releaseYear ? Number(values.releaseYear) : '',
      sizes,
      images: images.slice(0, 8),
    },
  };
}

function toList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

async function saveUpload(file) {
  const ext = path.extname(file.filename || '').toLowerCase();
  const allowed = Object.keys(IMAGE_MIME);
  const safeExt = allowed.includes(ext) ? ext : '';
  if (!safeExt) return null;
  if (file.data.length > 5 * 1024 * 1024) return null;
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}${safeExt}`;
  try {
    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
    await fsp.writeFile(path.join(UPLOAD_DIR, name), file.data);
    return `/uploads/${name}`;
  } catch (err) {
    console.error('[upload] failed:', err.message);
    return null;
  }
}

