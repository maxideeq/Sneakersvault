// End-to-end check of the customer journey and the seller dashboard.
//   NODE_PATH=/opt/node22/lib/node_modules node scripts/e2e.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';
const USER = process.env.ADMIN_USER || 'admin';
const PASS = process.env.ADMIN_PASSWORD || 'sneakers123';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

/* 1. Browse + search --------------------------------------------------- */
await page.goto(BASE);
check('homepage renders product cards', (await page.locator('.card').count()) >= 4);

await page.fill('#site-search', 'dunk');
await page.waitForSelector('.suggest__item', { timeout: 4000 });
check('search suggestions appear', (await page.locator('.suggest__item').count()) > 0);

await page.goto(`${BASE}/sneakers?search=DD1391-100`);
check('SKU search finds the pair', (await page.locator('.card').count()) === 1);

/* 2. Product page: size gating ----------------------------------------- */
await page.goto(`${BASE}/sneakers/nike-dunk-low-retro-white`);
const disabled = await page.locator('.size--out input[disabled]').count();
check('unavailable sizes are disabled', disabled > 0, `${disabled} disabled`);

await page.click('[data-add-to-cart]');
check('add to cart is blocked without a size', await page.locator('[data-size-error]').evaluate((el) => el.classList.contains('is-visible')));

await page.locator('.size:not(.size--out) input').first().check();
await page.click('[data-add-to-cart]');
await page.waitForTimeout(300);
check('cart badge updates', (await page.locator('[data-cart-count]').textContent()) === '1');

/* 3. Cart -------------------------------------------------------------- */
await page.goto(`${BASE}/cart`);
await page.waitForSelector('.cart-line');
check('cart shows the line', (await page.locator('.cart-line').count()) === 1);
await page.click('[data-qty="1"]');
await page.waitForTimeout(200);
check('quantity increases', (await page.locator('.cart-line output').textContent()) === '2');

/* 4. Checkout ---------------------------------------------------------- */
await page.goto(`${BASE}/checkout`);
await page.waitForSelector('.summary__item');
await page.click('[data-submit-order]');
await page.waitForTimeout(200);
check('empty checkout form is rejected', (await page.locator('.field.has-error').count()) > 0);

await page.fill('#firstName', 'John');
await page.fill('#lastName', 'Doe');
await page.fill('#phone', '070-123 45 67');
await page.fill('#email', 'john.doe@example.com');
await page.fill('#address', 'Storgatan 1');
await page.fill('#postalCode', '112 21');
await page.fill('#city', 'Stockholm');
await page.fill('#note', 'Ring the top bell.');
await page.click('[data-submit-order]');
await page.waitForURL(/\/order\/\d+/, { timeout: 8000 });
check('order confirmation page reached', /\/order\/\d+\?t=/.test(page.url()), page.url());

const number = (await page.locator('.confirm__number').textContent()).trim();
check('confirmation shows an order number', /#\d+/.test(number), number);
check('cart is emptied after submit', (await page.evaluate(() => localStorage.getItem('ss_cart_v1'))) === '[]');

/* 5. Order tracking ---------------------------------------------------- */
const orderNo = number.match(/#(\d+)/)[1];
await page.goto(`${BASE}/track?number=${orderNo}&email=john.doe@example.com`);
check('customer can track the order', (await page.locator('.order-table').count()) > 0);

/* 6. Seller dashboard --------------------------------------------------- */
await page.goto(`${BASE}/admin`);
await page.fill('#username', USER);
await page.fill('#password', PASS);
await page.click('button[type=submit]');
await page.waitForURL(/\/admin\/dashboard/);
check('seller can sign in', page.url().includes('/admin/dashboard'));

await page.goto(`${BASE}/admin/orders`);
const row = page.locator(`table.data a:has-text("#${orderNo}")`).first();
check('order is listed in the dashboard', (await row.count()) === 1);
await row.click();
await page.waitForSelector('.status-grid');
check('order detail shows the customer phone', (await page.content()).includes('070-123 45 67'));

await page.click('.status-grid button:has-text("Paid")');
await page.waitForURL(/flash=status-updated/);
check('status can be updated', (await page.locator('.tag:has-text("Paid")').count()) > 0);

await page.goto(`${BASE}/admin/inventory`);
check('inventory lists sizes', (await page.locator('.inv-size').count()) > 0);

/* 7. Dashboard is private ----------------------------------------------- */
const anon = await browser.newContext();
const anonPage = await anon.newPage();
const res = await anonPage.goto(`${BASE}/admin/orders`);
check('dashboard is protected', res.status() === 401 && (await anonPage.locator('.login__card').count()) === 1);
await anon.close();

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
