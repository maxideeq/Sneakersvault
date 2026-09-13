# Sole Society — sneaker resale storefront + seller dashboard

A complete, production-shaped sneaker reselling website: customers browse the
catalogue, pick a size, fill the cart and **submit an order** — no money changes
hands online. The order lands in a private seller dashboard where you contact
the customer to arrange payment and delivery.

```
Browse → Select sneaker → Select size → Add to cart → Checkout
      → Enter details → Submit order → Seller receives the order
```

**There is no online payment anywhere in this project.** No Stripe, Klarna,
PayPal, Swish checkout or card fields — by design. The checkout collects contact
and delivery details only, and every customer-facing surface says so plainly.

---

## Quick start

```bash
npm run seed        # one-off: writes the demo catalogue + product imagery
npm start           # http://localhost:3000
```

The first boot creates the dashboard login and prints it in the terminal. Set
your own before that first run:

```bash
cp .env.example .env      # then edit ADMIN_USER / ADMIN_PASSWORD
```

| URL | What it is |
| --- | --- |
| `/` | Storefront |
| `/admin` | Seller dashboard (login required) |

Node 20+ is the only requirement — **there are no dependencies to install.**
The server, templating, router, datastore, session auth, multipart upload
parser and SMTP client are all built on the Node standard library.

## What is included

### Storefront
- **Homepage** — hero with the featured pair, value props, featured sneakers,
  new arrivals, brand strip, popular sneakers, a plain-language "how ordering
  works" section and a CTA band.
- **Navigation** — Home, Sneakers, New Arrivals, Popular, Brands, search and
  cart; a hamburger drawer on mobile.
- **Search** — live suggestions as you type plus a full results page. Matches
  sneaker name, brand, SKU and colorway.
- **Filters & sorting** — brand, EU size, price range, category, availability,
  new arrivals and popular; sort by newest, popularity or price in either
  direction. Everything is a real URL, so filtered views can be shared and
  indexed, and the page works with JavaScript switched off.
- **Product page** — gallery, brand, price, condition, colorway, SKU, live
  availability, description, shipping/payment explainer and a size grid.
  **A size must be selected before adding to cart**; sizes that are out of stock
  or marked unavailable are struck through and cannot be selected.
- **Cart** — sizes, quantities (capped at what is actually in stock), per-line
  and order totals, remove, continue shopping, proceed to checkout. Revalidated
  against live stock and prices every time it is opened.
- **Checkout** — first name, last name, phone, email, address, postal code,
  city, delivery preference and optional delivery notes, with an order summary
  alongside. The button says **Submit order**, and underneath it:
  *"Your order will be sent to the seller. Payment and delivery details will be
  arranged with you after your order has been received."*
- **Order confirmation** — "Order received!", the order number, a full summary,
  what happens next, and a confirmation email to the customer.
- **Order tracking** — customers can look up an order with their order number
  and email.
- **Brands** — a brand index and a page per brand.

### Seller dashboard (`/admin`)
- **Overview** — new orders, open orders, confirmed revenue, catalogue health,
  latest orders and recent activity.
- **Orders** — every field the seller needs (order number, customer, phone,
  email, address, products, sizes, quantities, total, date, status), filterable
  by status and searchable by number, name, email, phone or city.
- **Order detail** — one-tap call/email links, full item breakdown, status
  updates across **New → Contacted → Payment Pending → Paid → Processing →
  Shipped → Completed / Cancelled**, a change log, and private seller notes.
- **Products** — add, edit and delete sneakers; upload images (or paste URLs);
  set price, brand, SKU, colorway, category, condition, release year and
  description; manage the size run and mark individual sizes unavailable;
  toggle visibility, featured, new arrival and popular.
- **Inventory** — pairs available per sneaker per size, with inline stock edits
  and low/sold-out highlighting.
- **Brands** — add, rename and delete brands (deletion is blocked while
  products still reference them).
- **Settings** — store details, shipping fee and free-shipping threshold, the
  checkout notice text, the inventory policy, and a password change.
- **Notifications** — every submitted order raises a `NEW ORDER #10024` entry
  with customer, products and total, and links straight to the order.

### Inventory policy
Set in **Settings → When an order is submitted…**:

| Mode | Behaviour |
| --- | --- |
| `reserve` *(default)* | The pairs are held. Stock drops out of the storefront but stays on the books until the order is marked paid (committed) or cancelled (released). |
| `reduce` | Stock is deducted the moment the order is submitted. |
| `none` | Orders never touch stock; the seller manages it by hand. |

## Email

If SMTP is configured, submitting an order sends the customer a confirmation and
the seller a `NEW ORDER` notification (with the customer's phone, products,
sizes and total). Without SMTP, both messages are appended to `data/outbox.log`
so nothing is lost — the order itself never depends on mail delivery.

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=orders@yourdomain.se
SMTP_PASS=•••
SMTP_FROM="Sole Society <orders@yourdomain.se>"
```

## Security

- Dashboard behind session auth — scrypt password hashing, HttpOnly `SameSite`
  cookies, 12-hour sessions, and login throttling after repeated failures.
- CSRF tokens plus an origin check on every state-changing dashboard request.
- Strict `Content-Security-Policy` (no inline scripts or styles anywhere),
  `X-Frame-Options: DENY`, `nosniff`, and a restrictive `Permissions-Policy`.
- All output is HTML-escaped; uploads are extension-checked and size-limited;
  static paths are traversal-guarded.
- Prices and stock are always resolved server-side at submit time — the client
  cannot set a price, exceed available stock, or order a disabled size.
- `/admin`, `/cart`, `/checkout`, `/order/*` and `/track` are `noindex`, and
  confirmation pages need the order's secret token.

## SEO & performance

Server-rendered HTML, semantic markup, per-page titles, descriptions, canonical
URLs and Open Graph tags, JSON-LD (`Product` with offers and availability,
`Store` on the homepage), a generated `sitemap.xml` and `robots.txt`, gzip,
ETag/`Cache-Control` on static assets, lazy-loaded images and a mobile-first
responsive layout. No web fonts, no frameworks, no trackers — the whole
storefront is a handful of kilobytes of CSS and JS.

## Project layout

```
server.js              HTTP server, static files, error handling
src/
  router.js            Storefront, JSON API and dashboard routes
  db.js                JSON datastore (atomic writes, narrow repository API)
  catalog.js           Search, filters, sizes and inventory movements
  orders.js            Order validation, creation, statuses, emails
  auth.js              scrypt hashing, sessions, CSRF, throttling
  mail.js              SMTP client with an outbox.log fallback
  http.js              Responses, security headers, body/multipart parsing
  util.js              Escaping, money, slugs, dates
  views/               Server-rendered pages (storefront + dashboard)
public/                CSS, client JS, generated imagery
scripts/
  seed.js              Demo catalogue           (npm run seed / npm run reset)
  images.js            Product image generator
  e2e.mjs              End-to-end journey check (npm run test:e2e)
  shots.mjs            Screenshot helper        (npm run shots)
data/                  db.json, uploads/, outbox.log  (created at runtime)
```

### Product imagery

Real sneaker photography is copyrighted, so the demo catalogue ships with
generated vector artwork — a sneaker box rendered per colorway, in closed and
open variants. Upload real photos per product in the dashboard and they replace
the placeholders immediately.

### Development checks

`scripts/e2e.mjs` and `scripts/shots.mjs` drive a real browser and need
Playwright available on `NODE_PATH` (they are dev helpers, not runtime
dependencies):

```bash
npm start &
NODE_PATH=$(npm root -g) npm run test:e2e
```

The end-to-end run covers browsing, search, size gating, cart maths, checkout
validation, order submission, the confirmation page, order tracking, the
dashboard login, status updates and the fact that `/admin` stays private.

## Scaling and what comes next

The catalogue lives in a single JSON file, which is fast and dependency-free for
hundreds of sneakers. Everything the rest of the app touches goes through the
small repository API in `src/db.js` (`products`, `brands`, `orders`, `settings`,
…), so moving to SQLite or Postgres means reimplementing that one module.

Adding a payment provider later does not disturb the order flow: orders already
carry line items, totals, customer details and a status history, so a provider
becomes an extra status transition rather than a rewrite.

## Deploying

Run `node server.js` behind a TLS-terminating reverse proxy (nginx, Caddy,
Fly.io, a container platform — anything that can forward HTTP). Set `SITE_URL`
to the public origin so canonical URLs, the sitemap and dashboard links in
emails are correct, and forward `X-Forwarded-Proto` so session cookies are
marked `Secure`. Persist the `data/` directory — it holds the catalogue, the
orders and the uploaded images.
