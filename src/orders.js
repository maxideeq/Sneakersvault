// Order creation, status handling and the notifications/emails that follow.

import crypto from 'node:crypto';
import { orders, products, settings, notifications, nextOrderNumber, save } from './db.js';
import {
  applyOrderToInventory,
  brandOf,
  commitOrderInventory,
  releaseOrderInventory,
  sizeAvailable,
  sizeRow,
} from './catalog.js';
import { money, formatDate, esc } from './util.js';
import { sendMail } from './mail.js';

export const ORDER_STATUSES = [
  'new',
  'contacted',
  'payment_pending',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled',
];

const STATUS_META = {
  new: { label: 'New', tone: 'new', hint: 'Just arrived — contact the customer.' },
  contacted: { label: 'Contacted', tone: 'info', hint: 'You have reached out to the customer.' },
  payment_pending: { label: 'Payment Pending', tone: 'warn', hint: 'Waiting for the customer to pay.' },
  paid: { label: 'Paid', tone: 'good', hint: 'Payment received — get it packed.' },
  processing: { label: 'Processing', tone: 'info', hint: 'Being packed and prepared.' },
  shipped: { label: 'Shipped', tone: 'info', hint: 'On its way to the customer.' },
  completed: { label: 'Completed', tone: 'good', hint: 'Delivered and done.' },
  cancelled: { label: 'Cancelled', tone: 'bad', hint: 'Cancelled — stock has been released.' },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status, tone: 'info', hint: '' };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const FIELD_LIMITS = {
  firstName: 60,
  lastName: 60,
  phone: 30,
  email: 120,
  address: 160,
  postalCode: 12,
  city: 80,
  deliveryMethod: 60,
  note: 600,
};

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

export function validateCustomer(input) {
  const customer = {};
  const errors = {};
  for (const [field, max] of Object.entries(FIELD_LIMITS)) customer[field] = clean(input[field], max);

  if (!customer.firstName) errors.firstName = 'First name is required.';
  if (!customer.lastName) errors.lastName = 'Last name is required.';
  if (!/^[+\d][\d\s()-]{6,}$/.test(customer.phone)) errors.phone = 'A valid phone number is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email)) errors.email = 'A valid email address is required.';
  if (!customer.address) errors.address = 'Address is required.';
  if (!/^[\d\s-]{4,10}$/.test(customer.postalCode)) errors.postalCode = 'A valid postal code is required.';
  if (!customer.city) errors.city = 'City is required.';
  if (!customer.deliveryMethod) customer.deliveryMethod = 'Tracked shipping';

  return { customer, errors };
}

/**
 * Resolve raw cart lines against the live catalogue.
 * Prices always come from the server — never from the client.
 */
export function resolveItems(rawItems) {
  const lines = [];
  const problems = [];
  const seen = new Map();

  for (const raw of Array.isArray(rawItems) ? rawItems.slice(0, 40) : []) {
    const product = products.byId(String(raw.productId || ''));
    if (!product || product.active === false) {
      problems.push('One of the sneakers in your cart is no longer available.');
      continue;
    }
    const size = String(raw.size || '').replace(',', '.');
    const row = sizeRow(product, size);
    const brand = brandOf(product);
    const available = sizeAvailable(row);
    const key = `${product.id}::${size}`;
    const wanted = Math.max(1, Math.min(Math.round(Number(raw.qty) || 1), 10));

    if (!row) {
      problems.push(`${product.name} is not offered in size ${size} any more.`);
      continue;
    }
    if (available <= 0) {
      problems.push(`${product.name} in size ${size} just sold out.`);
      continue;
    }
    const already = seen.get(key) || 0;
    const quantity = Math.min(wanted, available - already);
    if (quantity <= 0) {
      problems.push(`Only ${available} pair(s) of ${product.name} in size ${size} are available.`);
      continue;
    }
    if (quantity < wanted) {
      problems.push(`Only ${available} pair(s) of ${product.name} in size ${size} are available — quantity adjusted.`);
    }
    seen.set(key, already + quantity);

    const existing = lines.find((l) => l.productId === product.id && l.size === size);
    if (existing) existing.quantity += quantity;
    else
      lines.push({
        productId: product.id,
        slug: product.slug,
        sku: product.sku,
        name: product.name,
        brand: brand.name,
        size,
        quantity,
        price: product.price,
        image: (product.images || [])[0] || '/img/placeholder.svg',
        maxQty: available,
      });
  }
  return { lines, problems };
}

export function totalsFor(lines, deliveryMethod = '') {
  const s = settings.get();
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const collected = /pickup/i.test(deliveryMethod);
  const shipping =
    collected || subtotal === 0 || subtotal >= s.freeShippingOver ? 0 : s.shippingFee;
  return { subtotal, shipping, total: subtotal + shipping };
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export async function createOrder({ customer, lines, source = 'web' }) {
  const { subtotal, shipping, total } = totalsFor(lines, customer.deliveryMethod);
  const now = new Date().toISOString();
  const number = nextOrderNumber();

  const order = {
    id: crypto.randomUUID(),
    number,
    token: crypto.randomBytes(16).toString('hex'),
    customer,
    items: lines.map(({ maxQty, ...line }) => line),
    subtotal,
    shipping,
    total,
    status: 'new',
    source,
    createdAt: now,
    updatedAt: now,
    history: [{ status: 'new', at: now, by: 'customer', note: 'Order submitted from the website.' }],
    sellerNotes: '',
  };

  applyOrderToInventory(order.items);
  orders.insert(order);
  save();

  notifications.push({
    id: crypto.randomUUID(),
    type: 'order',
    orderId: order.id,
    number: order.number,
    title: `NEW ORDER #${order.number}`,
    body: `${customer.firstName} ${customer.lastName} · ${order.items.length} item(s) · ${money(total)}`,
    at: now,
    read: false,
  });

  // Emails are best-effort: a delivery failure must never lose the order.
  queueMicrotask(() => {
    sendCustomerConfirmation(order).catch((e) => console.error('[mail] customer:', e.message));
    sendSellerNotification(order).catch((e) => console.error('[mail] seller:', e.message));
  });

  return order;
}

export function setStatus(order, status, { note = '', by = 'seller' } = {}) {
  if (!ORDER_STATUSES.includes(status)) return order;
  const previous = order.status;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  order.history = order.history || [];
  order.history.push({ status, at: order.updatedAt, by, note });

  if (status === 'cancelled') releaseOrderInventory(order);
  else if (previous === 'cancelled' && order.inventoryReleased) {
    applyOrderToInventory(order.items);
    order.inventoryReleased = false;
  }
  if (['paid', 'shipped', 'completed'].includes(status)) commitOrderInventory(order);

  save();
  return order;
}

/* ------------------------------------------------------------------ */
/* Emails                                                              */
/* ------------------------------------------------------------------ */

function itemLines(order) {
  return order.items
    .map(
      (i) =>
        `  - ${i.brand} ${i.name} — Size ${i.size} — ${i.quantity} ${i.quantity === 1 ? 'pair' : 'pairs'} — ${money(i.price * i.quantity)}`,
    )
    .join('\n');
}

function itemRows(order) {
  return order.items
    .map(
      (i) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee">
        <strong>${esc(i.brand)} ${esc(i.name)}</strong><br>
        <span style="color:#6e6e78;font-size:13px">Size ${esc(i.size)} (EU) · ${i.quantity} ${i.quantity === 1 ? 'pair' : 'pairs'}</span>
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;white-space:nowrap">${money(i.price * i.quantity)}</td>
    </tr>`,
    )
    .join('');
}

function wrapHtml(title, inner) {
  const s = settings.get();
  return `<!doctype html><html><body style="margin:0;background:#f7f6f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0d0d0f">
  <div style="max-width:600px;margin:0 auto;padding:28px 20px">
    <div style="background:#0d0d0f;color:#fff;border-radius:14px;padding:22px 24px;margin-bottom:18px">
      <div style="font-size:13px;letter-spacing:.16em;text-transform:uppercase;opacity:.7">${esc(s.storeName)}</div>
      <div style="font-size:23px;font-weight:650;margin-top:6px">${esc(title)}</div>
    </div>
    <div style="background:#fff;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">${inner}</div>
    <p style="color:#97979f;font-size:12px;text-align:center;margin-top:18px">${esc(s.storeName)} · ${esc(s.sellerEmail)} · ${esc(s.sellerPhone)}</p>
  </div></body></html>`;
}

export function sendCustomerConfirmation(order) {
  const s = settings.get();
  const text = [
    'Order received!',
    '',
    `Thank you for your order, ${order.customer.firstName}.`,
    '',
    `Your order number is #${order.number}.`,
    '',
    'We have received your order and will contact you shortly to confirm payment and delivery.',
    '',
    'Your order',
    itemLines(order),
    `  Shipping: ${order.shipping ? money(order.shipping) : 'Free'}`,
    `  Total: ${money(order.total)}`,
    '',
    'Delivery to',
    `  ${order.customer.firstName} ${order.customer.lastName}`,
    `  ${order.customer.address}, ${order.customer.postalCode} ${order.customer.city}`,
    `  ${order.customer.phone}`,
    `  Preference: ${order.customer.deliveryMethod}`,
    '',
    `Please note: no payment was taken online. ${s.orderNotice}`,
    '',
    `— ${s.storeName}`,
    `${s.sellerEmail} · ${s.sellerPhone}`,
  ].join('\n');

  const html = wrapHtml(
    'Order received!',
    `<p>Thank you for your order, <strong>${esc(order.customer.firstName)}</strong>.</p>
    <p style="font-size:18px"><strong>Your order number is #${esc(order.number)}.</strong></p>
    <p>We have received your order and will contact you shortly to confirm payment and delivery.</p>
    <table width="100%" style="border-collapse:collapse;margin:18px 0">${itemRows(order)}
      <tr><td style="padding:10px 0">Shipping</td><td align="right" style="padding:10px 0">${order.shipping ? money(order.shipping) : 'Free'}</td></tr>
      <tr><td style="padding:10px 0"><strong>Total</strong></td><td align="right" style="padding:10px 0"><strong>${money(order.total)}</strong></td></tr>
    </table>
    <p style="background:#fff0eb;border-radius:10px;padding:14px;font-size:14px"><strong>No payment was taken online.</strong> ${esc(s.orderNotice)}</p>
    <p style="color:#6e6e78;font-size:13px">Delivery to ${esc(order.customer.address)}, ${esc(order.customer.postalCode)} ${esc(order.customer.city)} · ${esc(order.customer.deliveryMethod)}</p>`,
  );

  return sendMail({
    to: order.customer.email,
    subject: `Order #${order.number} received — ${s.storeName}`,
    text,
    html,
    replyTo: s.sellerEmail,
  });
}

export function sendSellerNotification(order) {
  const s = settings.get();
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  const link = `${siteUrl}/admin/orders/${order.id}`;
  const text = [
    `NEW ORDER #${order.number}`,
    '',
    'Customer:',
    `${order.customer.firstName} ${order.customer.lastName}`,
    '',
    'Phone:',
    order.customer.phone,
    '',
    'Email:',
    order.customer.email,
    '',
    'Address:',
    `${order.customer.address}, ${order.customer.postalCode} ${order.customer.city}`,
    '',
    'Products:',
    order.items
      .map((i) => `${i.brand} ${i.name} — Size ${i.size} — ${i.quantity} ${i.quantity === 1 ? 'pair' : 'pairs'}`)
      .join('\n'),
    '',
    'Total:',
    money(order.total),
    '',
    `Delivery preference: ${order.customer.deliveryMethod}`,
    order.customer.note ? `Customer note: ${order.customer.note}` : null,
    `Placed: ${formatDate(order.createdAt)}`,
    '',
    `Open the order: ${link}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = wrapHtml(
    `New order #${order.number}`,
    `<p><strong>${esc(order.customer.firstName)} ${esc(order.customer.lastName)}</strong><br>
    <a href="tel:${esc(order.customer.phone.replace(/\s/g, ''))}">${esc(order.customer.phone)}</a> ·
    <a href="mailto:${esc(order.customer.email)}">${esc(order.customer.email)}</a><br>
    <span style="color:#6e6e78">${esc(order.customer.address)}, ${esc(order.customer.postalCode)} ${esc(order.customer.city)}</span></p>
    <table width="100%" style="border-collapse:collapse;margin:16px 0">${itemRows(order)}
      <tr><td style="padding:10px 0"><strong>Total</strong></td><td align="right" style="padding:10px 0"><strong>${money(order.total)}</strong></td></tr>
    </table>
    ${order.customer.note ? `<p style="background:#f1efec;border-radius:10px;padding:12px;font-size:14px"><strong>Note:</strong> ${esc(order.customer.note)}</p>` : ''}
    <p><a href="${esc(link)}" style="display:inline-block;background:#0d0d0f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px">Open order in dashboard</a></p>`,
  );

  return sendMail({
    to: s.sellerEmail,
    subject: `NEW ORDER #${order.number} — ${money(order.total)}`,
    text,
    html,
    replyTo: order.customer.email,
  });
}
