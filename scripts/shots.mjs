// Dev helper: screenshot key pages for visual review.
//   NODE_PATH=/opt/node22/lib/node_modules node scripts/shots.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';

// Playwright is a dev-only dependency; resolve it from wherever it is installed
// (project node_modules, or a global install via NODE_PATH).
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.SHOT_DIR || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, url, { width = 1440, height = 1000, full = true, before } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  if (before) await before(page, ctx);
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  // Walk down the page so scroll-triggered reveals have run before capture.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
    // Full-page capture stitches the page outside the viewport, where the
    // scroll-reveal transition would otherwise register as mid-flight.
    document.documentElement.classList.remove('js');
  });
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  if (errors.length) console.log(`  ! ${name}:`, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

const cartSeed = async (page, ctx) => {
  await ctx.addInitScript(() => {
    localStorage.setItem(
      'ss_cart_v1',
      JSON.stringify([
        { productId: 'p_nike-dunk-low-retro-white', slug: 'nike-dunk-low-retro-white', name: 'Dunk Low Retro', brand: 'Nike', size: '43', qty: 1, price: 1499, image: '/img/products/nike-dunk-low-retro-white-1.svg', maxQty: 2 },
        { productId: 'p_adidas-campus-00s-core-black', slug: 'adidas-campus-00s-core-black', name: 'Campus 00s', brand: 'Adidas', size: '44', qty: 1, price: 1299, image: '/img/products/adidas-campus-00s-core-black-1.svg', maxQty: 1 },
      ]),
    );
  });
};

const args = process.argv.slice(2);
const only = args.length ? new Set(args) : null;
const want = (n) => !only || only.has(n);

if (want('home')) await shot('home', '/');
if (want('home-mobile')) await shot('home-mobile', '/', { width: 390, height: 844 });
if (want('shop')) await shot('shop', '/sneakers');
if (want('shop-mobile')) await shot('shop-mobile', '/sneakers', { width: 390, height: 844 });
if (want('product')) await shot('product', '/sneakers/nike-dunk-low-retro-white');
if (want('product-mobile')) await shot('product-mobile', '/sneakers/nike-dunk-low-retro-white', { width: 390, height: 844 });
if (want('brands')) await shot('brands', '/brands');
if (want('cart')) await shot('cart', '/cart', { before: cartSeed });
if (want('cart-mobile')) await shot('cart-mobile', '/cart', { width: 390, height: 844, before: cartSeed });
if (want('checkout')) await shot('checkout', '/checkout', { before: cartSeed });
if (want('how')) await shot('how', '/how-it-works');

const adminLogin = async (page, ctx) => {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin`);
  await p.fill('#username', process.env.ADMIN_USER || 'admin');
  await p.fill('#password', process.env.ADMIN_PASSWORD || 'sneakers123');
  await p.click('button[type=submit]');
  await p.waitForLoadState('networkidle');
  await p.close();
};

if (want('login')) await shot('login', '/admin', { full: false });
if (want('admin')) await shot('admin', '/admin/dashboard', { before: adminLogin });
if (want('admin-orders')) await shot('admin-orders', '/admin/orders', { before: adminLogin });
if (want('admin-products')) await shot('admin-products', '/admin/products', { before: adminLogin });
if (want('admin-product-form')) await shot('admin-product-form', '/admin/products/new', { before: adminLogin });
if (want('admin-inventory')) await shot('admin-inventory', '/admin/inventory', { before: adminLogin });
if (want('admin-settings')) await shot('admin-settings', '/admin/settings', { before: adminLogin });
if (want('admin-mobile')) await shot('admin-mobile', '/admin/dashboard', { width: 390, height: 844, before: adminLogin });

if (want('admin-order')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`);
  await page.fill('#username', process.env.ADMIN_USER || 'admin');
  await page.fill('#password', process.env.ADMIN_PASSWORD || 'sneakers123');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  await page.goto(`${BASE}/admin/orders`);
  const link = await page.getAttribute('table.data a[href^="/admin/orders/"]', 'href');
  if (link) {
    await page.goto(BASE + link, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/admin-order.png`, fullPage: true });
  }
  await ctx.close();
}

await browser.close();
console.log('shots in', OUT);
