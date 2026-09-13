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

You need a Postgres database — [Neon](https://neon.tech) and
[Supabase](https://supabase.com) both have a free tier with no card required.
Copy the connection string it gives you into `.env`:

```bash
cp .env.example .env      # then set DATABASE_URL, ADMIN_USER, ADMIN_PASSWORD
npm install               # one dependency: pg
npm run seed              # creates the tables and loads the demo catalogue
npm start                 # http://localhost:3000
```

If `ADMIN_USER` / `ADMIN_PASSWORD` are not set, the first boot generates a
dashboard password and prints it in the terminal — save it.

| URL | What it is |
| --- | --- |
| `/` | Storefront |
| `/admin` | Seller dashboard (login required) |

Node 20+ and Postgres are the only requirements. **`pg` is the single
dependency** — the server, templating, router, session auth, multipart upload
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
  db.js                Postgres datastore (JSONB documents, async repository API)
  env.js               .env loader shared by the server and the scripts
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
data/                  uploads/, outbox.log  (created at runtime)
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

## Storage

Products, brands, orders, notifications, settings, admin accounts and sessions
live in Postgres, each table holding a JSONB `data` document plus a few indexed
columns. Every repository method in `src/db.js` is async, and the call sites
await it — nothing is cached in memory, so several instances can serve the same
database safely.

**Uploaded product photos are the exception**: they are written to
`data/uploads/` on local disk. If your host has an ephemeral filesystem, either
attach a small persistent disk, or add products using image URLs instead of
uploads.

## Scaling and what comes next

Everything the rest of the app touches goes through the repository API in
`src/db.js` (`products`, `brands`, `orders`, `settings`, …), so a different
database means reimplementing that one module.

Adding a payment provider later does not disturb the order flow: orders already
carry line items, totals, customer details and a status history, so a provider
becomes an extra status transition rather than a rewrite.

## Deploying

Run `node server.js` behind a TLS-terminating reverse proxy (nginx, Caddy,
Fly.io, a container platform — anything that can forward HTTP).

- `DATABASE_URL` — your Postgres connection string. Certificate verification is
  on by default; set `DATABASE_SSL_INSECURE=true` only if your provider uses a
  private CA.
- `SITE_URL` — the public origin, so canonical URLs, the sitemap and the
  dashboard links in emails are right.
- Forward `X-Forwarded-Proto` so session cookies are marked `Secure`.
- Build command `npm install && npm run seed`, start command `npm start`. The
  seeder only fills an empty database, so it is safe on every deploy.
- Persist `data/uploads/` if sellers upload photos through the dashboard.
