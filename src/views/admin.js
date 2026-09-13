import { esc, money, formatDate, relativeTime } from '../util.js';
import { settings, orders as ordersRepo, products as productsRepo, notifications, stats } from '../db.js';
import { ORDER_STATUSES, statusMeta } from '../orders.js';
import { isSoldOut, totalStock } from '../catalog.js';
import { icon } from './layout.js';

const NAV = [
  { href: '/admin/dashboard', label: 'Overview', key: 'dashboard', icon: 'grid' },
  { href: '/admin/orders', label: 'Orders', key: 'orders', icon: 'cart' },
  { href: '/admin/products', label: 'Products', key: 'products', icon: 'box' },
  { href: '/admin/inventory', label: 'Inventory', key: 'inventory', icon: 'layers' },
  { href: '/admin/brands', label: 'Brands', key: 'brands', icon: 'tag' },
  { href: '/admin/settings', label: 'Settings', key: 'settings', icon: 'user' },
];

export async function adminShell({ title, subtitle = '', actions = '', body, active, session, flash = null }) {
  const [s, newOrders, unread] = await Promise.all([
    settings.get(),
    stats.newOrders(),
    stats.unreadNotifications(),
  ]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(s.storeName)} seller dashboard</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body>
<div class="shell">
  <aside class="side" id="side">
    <div class="side__brand">
      <span class="side__mark">SS</span>
      <span><b>${esc(s.storeName)}</b><span>Seller dashboard</span></span>
    </div>
    <nav class="side__nav">
      <p class="side__label">Manage</p>
      ${NAV.map(
        (n) => `<a href="${n.href}" class="${active === n.key ? 'is-active' : ''}">${icon(n.icon)} ${n.label}${
          n.key === 'orders' && newOrders ? `<span class="pill-count">${newOrders}</span>` : ''
        }</a>`,
      ).join('')}
      <p class="side__label mt-18">Activity</p>
      <a href="/admin/notifications" class="${active === 'notifications' ? 'is-active' : ''}">${icon('chat')} Notifications${unread ? `<span class="pill-count">${unread}</span>` : ''}</a>
    </nav>
    <div class="side__foot">
      <a href="/" target="_blank" rel="noopener">${icon('arrow')} View storefront</a>
      <span>Signed in as <b class="on-dark">${esc(session.username)}</b></span>
      <form method="post" action="/admin/logout">
        <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
        <button class="btn btn--ghost btn--sm btn--block" type="submit">Sign out</button>
      </form>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <button class="btn btn--ghost btn--sm admin-burger" type="button" data-side-toggle aria-label="Menu">${icon('menu')}</button>
      <div>
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p class="topbar__sub">${subtitle}</p>` : ''}
      </div>
      <div class="topbar__actions">${actions}</div>
    </header>
    <div class="content">
      ${flash ? `<div class="flash${flash.type === 'error' ? ' flash--error' : flash.type === 'info' ? ' flash--info' : ''}">${icon(flash.type === 'error' ? 'close' : 'check')} <span>${esc(flash.message)}</span></div>` : ''}
      ${body}
    </div>
  </div>
</div>
<script src="/js/admin.js" defer></script>
</body>
</html>`;
}

export async function loginPage({ error = '', username = '' } = {}) {
  const s = await settings.get();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seller login — ${esc(s.storeName)}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body>
<div class="login">
  <form class="login__card" method="post" action="/admin/login">
    <div class="login__mark">SS</div>
    <h1>Seller dashboard</h1>
    <p class="sub">Sign in to manage orders, products and inventory for ${esc(s.storeName)}.</p>
    ${error ? `<div class="flash flash--error mb-18">${icon('close')}<span>${esc(error)}</span></div>` : ''}
    <div class="field">
      <label for="username">Username</label>
      <input id="username" name="username" value="${esc(username)}" autocomplete="username" required autofocus>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
    </div>
    <button class="btn btn--block mt-8" type="submit">Sign in</button>
    <a class="login__back" href="/">← Back to the storefront</a>
  </form>
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export async function dashboardPage({ session, flash }) {
  const [all, catalogue, notificationList] = await Promise.all([
    ordersRepo.all(),
    productsRepo.active(),
    notifications.all(),
  ]);
  const newOrders = all.filter((o) => o.status === 'new');
  const openOrders = all.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const paidRevenue = all
    .filter((o) => ['paid', 'processing', 'shipped', 'completed'].includes(o.status))
    .reduce((sum, o) => sum + o.total, 0);
  const pipeline = openOrders.reduce((sum, o) => sum + o.total, 0);
  const soldOut = catalogue.filter(isSoldOut).length;
  const lowStock = catalogue.filter((p) => totalStock(p) > 0 && totalStock(p) <= 2);
  const recent = all.slice(0, 8);
  const unread = notificationList.slice(0, 6);

  const body = `
<div class="stats">
  <div class="stat stat--accent">
    <p class="stat__label">New orders</p>
    <p class="stat__value">${newOrders.length}</p>
    <p class="stat__meta">${newOrders.length ? 'Waiting to be contacted' : 'All caught up'}</p>
  </div>
  <div class="stat">
    <p class="stat__label">Open orders</p>
    <p class="stat__value">${openOrders.length}</p>
    <p class="stat__meta">${money(pipeline)} in the pipeline</p>
  </div>
  <div class="stat">
    <p class="stat__label">Confirmed revenue</p>
    <p class="stat__value">${money(paidRevenue)}</p>
    <p class="stat__meta">Paid, shipped &amp; completed</p>
  </div>
  <div class="stat">
    <p class="stat__label">Live products</p>
    <p class="stat__value">${catalogue.length}</p>
    <p class="stat__meta">${soldOut} sold out · ${lowStock.length} low on stock</p>
  </div>
</div>

<section class="panel">
  <div class="panel__head">
    <h2>Latest orders</h2>
    <a class="btn btn--ghost btn--sm" href="/admin/orders">All orders</a>
  </div>
  ${recent.length ? orderTable(recent) : '<p class="panel__empty">No orders yet. When a customer submits an order it lands here instantly.</p>'}
</section>

<div class="order-grid">
  <section class="panel">
    <div class="panel__head"><h2>Recent activity</h2>
      <a class="btn btn--ghost btn--sm" href="/admin/notifications">View all</a>
    </div>
    ${unread.length
      ? unread
          .map(
            (n) => `<div class="notif${n.read ? '' : ' is-unread'}">
        ${n.read ? '' : '<span class="notif__dot"></span>'}
        <div>
          <p class="notif__title"><a href="/admin/orders/${esc(n.orderId)}">${esc(n.title)}</a></p>
          <p class="notif__body">${esc(n.body)}</p>
        </div>
        <span class="notif__time">${esc(relativeTime(n.at))}</span>
      </div>`,
          )
          .join('')
      : '<p class="panel__empty">Nothing here yet.</p>'}
  </section>

  <section class="panel">
    <div class="panel__head"><h2>Needs attention</h2></div>
    <div class="panel__body stack">
      ${lowStock.length
        ? lowStock
            .slice(0, 6)
            .map(
              (p) => `<div class="row">
        <img class="thumb" src="${esc((p.images || [])[0] || '/img/placeholder.svg')}" alt="" width="46" height="46">
        <div><p class="row-title">${esc(p.name)}</p><p class="row-sub">${totalStock(p)} pair(s) left</p></div>
        <a class="btn btn--ghost btn--sm right" href="/admin/products/${esc(p.id)}">Restock</a>
      </div>`,
            )
            .join('')
        : '<p class="hint">Stock levels look healthy.</p>'}
      <div class="divider"></div>
      <a class="btn btn--ghost btn--block" href="/admin/products/new">${icon('plus')} Add a new sneaker</a>
    </div>
  </section>
</div>`;

  return await adminShell({
    title: 'Overview',
    subtitle: `${formatDate(new Date().toISOString())} · ${newOrders.length} new order(s) to action`,
    actions: `<a class="btn" href="/admin/products/new">${icon('plus')} Add sneaker</a>`,
    body,
    active: 'dashboard',
    session,
    flash,
  });
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export function orderTable(list) {
  return `<div class="table-wrap"><table class="data">
  <thead><tr>
    <th>Order</th><th>Customer</th><th>Contact</th><th>Items</th>
    <th class="num">Total</th><th>Date</th><th>Status</th><th></th>
  </tr></thead>
  <tbody>
    ${list
      .map((o) => {
        const meta = statusMeta(o.status);
        return `<tr>
      <td><a class="row-title" href="/admin/orders/${esc(o.id)}">#${esc(o.number)}</a></td>
      <td><p class="row-title">${esc(o.customer.firstName)} ${esc(o.customer.lastName)}</p>
          <p class="row-sub">${esc(o.customer.city)}</p></td>
      <td><p class="row-sub"><a href="tel:${esc(o.customer.phone.replace(/\s/g, ''))}">${esc(o.customer.phone)}</a></p>
          <p class="row-sub"><a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a></p></td>
      <td><p class="row-sub">${o.items
        .map((i) => `${esc(i.name)} — size ${esc(i.size)} × ${i.quantity}`)
        .join('<br>')}</p></td>
      <td class="num">${money(o.total)}</td>
      <td><p class="row-sub">${esc(formatDate(o.createdAt))}</p></td>
      <td><span class="tag tag--${meta.tone}">${esc(meta.label)}</span></td>
      <td class="num"><a class="btn btn--ghost btn--sm" href="/admin/orders/${esc(o.id)}">Open</a></td>
    </tr>`;
      })
      .join('')}
  </tbody>
</table></div>`;
}

export async function ordersPage({ session, flash, list, counts = {}, total = 0, status = '', search = '', page = 1, pages = 1 }) {
  const tabHref = (st) => `/admin/orders${st ? `?status=${st}` : ''}${search ? `${st ? '&' : '?'}search=${encodeURIComponent(search)}` : ''}`;

  const body = `
<div class="toolbar">
  <div class="filter-tabs">
    <a href="${esc(tabHref(''))}" class="${!status ? 'is-active' : ''}">All (${total})</a>
    ${ORDER_STATUSES.map(
      (st) => `<a href="${esc(tabHref(st))}" class="${status === st ? 'is-active' : ''}">${esc(statusMeta(st).label)}${counts[st] ? ` (${counts[st]})` : ''}</a>`,
    ).join('')}
  </div>
  <form class="right" method="get" action="/admin/orders">
    ${status ? `<input type="hidden" name="status" value="${esc(status)}">` : ''}
    <input type="search" name="search" value="${esc(search)}" placeholder="Order #, name, email or phone">
    <button class="btn btn--ghost btn--sm" type="submit">Search</button>
  </form>
</div>

<section class="panel">
  ${list.length ? orderTable(list) : '<p class="panel__empty">No orders match this view.</p>'}
  ${pages > 1
    ? `<div class="pagination">${Array.from({ length: pages }, (_, i) => i + 1)
        .map((n) =>
          n === page
            ? `<span class="is-current">${n}</span>`
            : `<a href="/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}), page: n })}">${n}</a>`,
        )
        .join('')}</div>`
    : ''}
</section>`;

  return await adminShell({
    title: 'Orders',
    subtitle: 'Every order submitted through the website. Open one to contact the customer and update its status.',
    body,
    active: 'orders',
    session,
    flash,
  });
}

export async function orderDetailPage({ session, flash, order }) {
  const meta = statusMeta(order.status);
  const c = order.customer;
  const body = `
<div class="order-grid">
  <div class="stack">
    <section class="panel">
      <div class="panel__head">
        <h2>Order #${esc(order.number)}</h2>
        <span class="tag tag--${meta.tone}">${esc(meta.label)}</span>
        <span class="hint right">Placed ${esc(formatDate(order.createdAt))}</span>
      </div>
      <div class="panel__body">
        <div class="table-wrap"><table class="data no-min">
          <thead><tr><th>Product</th><th>Size</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Sum</th></tr></thead>
          <tbody>
            ${order.items
              .map(
                (i) => `<tr>
              <td><div class="cell-product">
                <img class="thumb" src="${esc(i.image)}" alt="" width="46" height="46">
                <div><p class="row-title">${esc(i.brand)} ${esc(i.name)}</p><p class="row-sub">${esc(i.sku || '')}</p></div>
              </div></td>
              <td>${esc(i.size)}</td>
              <td class="num">${i.quantity}</td>
              <td class="num">${money(i.price)}</td>
              <td class="num">${money(i.price * i.quantity)}</td>
            </tr>`,
              )
              .join('')}
            <tr><td colspan="4">Shipping — ${esc(c.deliveryMethod || '')}</td><td class="num">${order.shipping ? money(order.shipping) : 'Free'}</td></tr>
            <tr><td colspan="4"><b>Total</b></td><td class="num"><b>${money(order.total)}</b></td></tr>
          </tbody>
        </table></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2>Customer</h2>
        <a class="btn btn--ghost btn--sm right" href="tel:${esc(c.phone.replace(/\s/g, ''))}">Call</a>
        <a class="btn btn--ghost btn--sm" href="mailto:${esc(c.email)}?subject=${encodeURIComponent(`Your order #${order.number}`)}">Email</a>
      </div>
      <div class="panel__body">
        <dl class="kv">
          <dt>Name</dt><dd>${esc(c.firstName)} ${esc(c.lastName)}</dd>
          <dt>Phone</dt><dd><a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a></dd>
          <dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>
          <dt>Address</dt><dd>${esc(c.address)}<br>${esc(c.postalCode)} ${esc(c.city)}</dd>
          <dt>Delivery</dt><dd>${esc(c.deliveryMethod || '—')}</dd>
          <dt>Customer note</dt><dd>${c.note ? esc(c.note) : '<span class="hint">—</span>'}</dd>
        </dl>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2>Seller notes</h2></div>
      <div class="panel__body">
        <form method="post" action="/admin/orders/${esc(order.id)}/notes" class="stack">
          <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
          <div class="field">
            <label for="sellerNotes">Private notes (never shown to the customer)</label>
            <textarea id="sellerNotes" name="sellerNotes" placeholder="Called at 14:20 — paying by Swish tonight.">${esc(order.sellerNotes || '')}</textarea>
          </div>
          <button class="btn btn--ghost self-start" type="submit">Save notes</button>
        </form>
      </div>
    </section>
  </div>

  <div class="stack">
    <section class="panel">
      <div class="panel__head"><h2>Update status</h2></div>
      <div class="panel__body stack">
        <p class="hint">${esc(meta.hint)}</p>
        <form method="post" action="/admin/orders/${esc(order.id)}/status" class="stack">
          <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
          <div class="status-grid">
            ${ORDER_STATUSES.map(
              (st) => `<button type="submit" name="status" value="${st}" class="${order.status === st ? 'is-current' : ''}">${esc(statusMeta(st).label)}</button>`,
            ).join('')}
          </div>
          <div class="field">
            <label for="note">Add a note to this change (optional)</label>
            <input id="note" name="note" placeholder="Swish received">
          </div>
        </form>
        <p class="hint">Cancelling an order releases its reserved stock automatically.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2>History</h2></div>
      <div class="panel__body">
        <ul class="timeline">
          ${(order.history || [])
            .slice()
            .reverse()
            .map(
              (h) => `<li><span class="dot"></span><div>
            <p class="what">${esc(statusMeta(h.status).label)}</p>
            <p class="when">${esc(formatDate(h.at))} · ${esc(h.by)}</p>
            ${h.note ? `<p class="note">${esc(h.note)}</p>` : ''}
          </div></li>`,
            )
            .join('')}
        </ul>
      </div>
    </section>
  </div>
</div>`;

  return await adminShell({
    title: `Order #${order.number}`,
    subtitle: `${esc(c.firstName)} ${esc(c.lastName)} · ${money(order.total)}`,
    actions: `<a class="btn btn--ghost" href="/admin/orders">← All orders</a>`,
    body,
    active: 'orders',
    session,
    flash,
  });
}

export async function notificationsPage({ session, flash }) {
  const list = await notifications.all();
  const body = `
<section class="panel">
  <div class="panel__head">
    <h2>Order notifications</h2>
    <form method="post" action="/admin/notifications/read" class="right">
      <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
      <button class="btn btn--ghost btn--sm" type="submit">Mark all as read</button>
    </form>
  </div>
  ${list.length
    ? list
        .map(
          (n) => `<div class="notif${n.read ? '' : ' is-unread'}">
      ${n.read ? '' : '<span class="notif__dot"></span>'}
      <div>
        <p class="notif__title"><a href="/admin/orders/${esc(n.orderId)}">${esc(n.title)}</a></p>
        <p class="notif__body">${esc(n.body)}</p>
      </div>
      <span class="notif__time">${esc(formatDate(n.at))}</span>
    </div>`,
        )
        .join('')
    : '<p class="panel__empty">No notifications yet.</p>'}
</section>`;
  return await adminShell({
    title: 'Notifications',
    subtitle: 'Every new order raises a notification here — and an email to the seller address if SMTP is configured.',
    body,
    active: 'notifications',
    session,
    flash,
  });
}

