# Moving from the JSON file store to Postgres

`src/db.js` now talks to Postgres through the `pg` package instead of reading
and writing `data/db.json`. Records keep the same document shape — each table
holds an indexed id/slug plus a JSONB `data` column — so nothing about the
storefront or the dashboard changes for a visitor.

## Setup

1. **Get a database.** [Neon](https://neon.tech) and [Supabase](https://supabase.com)
   both have a free tier with no card required. Copy the connection string.
2. **Configure it.** `cp .env.example .env`, then set `DATABASE_URL`. Never
   commit the real `.env`; on Render (or any host) add `DATABASE_URL` as an
   environment variable instead.
3. **Install and seed.** `npm install && npm run seed` — the seeder creates the
   tables and fills an empty database. It refuses to overwrite a database that
   already has products, so it is safe to run on every deploy. `npm run reset`
   forces a rebuild and also clears orders.

TLS certificate verification is **on** by default. Set
`DATABASE_SSL_INSECURE=true` only if your provider uses a private CA — turning
verification off exposes customer names, addresses and phone numbers in transit.

## What the migration changed in the app

Every repository method is now async, which reached further than the data layer:

- **Call sites** — `catalog.js`, `orders.js`, `auth.js` and `router.js` await
  every store call (~90 sites).
- **Views** — templates used to read the store while rendering (`settings.get()`
  inside `layout()`, `brandOf()` inside every product card). Page views are now
  async and resolve their data first; `layout()` receives `settings` as a
  parameter. Products carry their brand on a non-enumerable `_brand` property
  attached by `withBrands()`, so a page of cards costs one brands query instead
  of one per card.
- **Writes** — the old code mutated a shared in-memory object and called
  `save()`. Postgres hands back detached copies, so order status changes, seller
  notes, password changes and every inventory movement now pass an explicit
  patch to the matching `update()` method. `save()` remains only as a no-op for
  compatibility.
- **Startup** — `server.js` and `scripts/seed.js` load `.env` through
  `src/env.js` before importing `db.js`, then `await load()`.

## Uploads still use the disk

Product photos uploaded through the dashboard are written to `data/uploads/`,
not to Postgres. On a host with an ephemeral filesystem, either attach a small
persistent disk for that directory or add products using image URLs.

## Verifying a deploy

```bash
npm run seed          # says "already holds N products" on a seeded database
npm start
```

Then place a test order, mark it Paid in the dashboard, restart the server, and
confirm the order and its status are still there.
