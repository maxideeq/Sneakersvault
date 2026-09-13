import { esc, money, formatDate } from '../util.js';
import { settings } from '../db.js';
import { layout, icon } from './layout.js';
import { ORDER_STATUSES, statusMeta } from '../orders.js';

export async function cartPage() {
  const s = await settings.get();
  const body = `<div class="wrap">
  <header class="page-head">
    <h1>Your cart</h1>
    <p>Review your pairs and sizes. Nothing is charged here — you submit the order and we arrange payment with you afterwards.</p>
  </header>
  <div data-cart-page data-free-shipping-over="${s.freeShippingOver}" data-shipping-fee="${s.shippingFee}">
    <noscript><p class="empty">Your cart needs JavaScript enabled. Please turn it on to review and submit your order.</p></noscript>
  </div>
</div>`;
  return layout({ title: 'Cart', body, settings: s, active: '', description: 'Review the sneakers in your cart before submitting your order.' });
}

export async function checkoutPage() {
  const s = await settings.get();
  const body = `<div class="wrap">
  <header class="page-head">
    <h1>Checkout</h1>
    <p>Enter your details and submit the order. ${esc(s.orderNotice)}</p>
  </header>

  <div class="checkout">
    <form data-checkout-form novalidate>
      <div class="notice notice--pay">
        ${icon('chat')}
        <span><b>This store does not take payment online.</b> Submitting this form reserves your pairs and sends the order
        straight to the seller, who contacts you to agree payment (Swish, bank transfer or cash on pickup) and delivery.</span>
      </div>

      <div class="notice notice--error mb-20" data-checkout-error hidden>
        ${icon('close')}<span data-checkout-error-text></span>
      </div>

      <section class="form-card">
        <h2>Contact details</h2>
        <p class="form-card__lede">We use these to confirm your order — usually within 24 hours.</p>
        <div class="field-grid">
          <div class="field">
            <label for="firstName">First name <span class="req">*</span></label>
            <input id="firstName" name="firstName" required autocomplete="given-name" maxlength="60">
            <span class="field__error"></span>
          </div>
          <div class="field">
            <label for="lastName">Last name <span class="req">*</span></label>
            <input id="lastName" name="lastName" required autocomplete="family-name" maxlength="60">
            <span class="field__error"></span>
          </div>
          <div class="field">
            <label for="phone">Phone number <span class="req">*</span></label>
            <input id="phone" name="phone" type="tel" required autocomplete="tel" placeholder="070-123 45 67" maxlength="30">
            <span class="field__error"></span>
          </div>
          <div class="field">
            <label for="email">Email <span class="req">*</span></label>
            <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" maxlength="120">
            <span class="field__error"></span>
          </div>
        </div>
      </section>

      <section class="form-card">
        <h2>Delivery address</h2>
        <p class="form-card__lede">Where should the pair go if you choose shipping?</p>
        <div class="field-grid">
          <div class="field field--wide">
            <label for="address">Address <span class="req">*</span></label>
            <input id="address" name="address" required autocomplete="street-address" placeholder="Street and number" maxlength="160">
            <span class="field__error"></span>
          </div>
          <div class="field">
            <label for="postalCode">Postal code <span class="req">*</span></label>
            <input id="postalCode" name="postalCode" required autocomplete="postal-code" inputmode="numeric" placeholder="112 21" maxlength="12">
            <span class="field__error"></span>
          </div>
          <div class="field">
            <label for="city">City <span class="req">*</span></label>
            <input id="city" name="city" required autocomplete="address-level2" placeholder="Stockholm" maxlength="80">
            <span class="field__error"></span>
          </div>
          <div class="field field--wide">
            <label for="deliveryMethod">Delivery preference</label>
            <select id="deliveryMethod" name="deliveryMethod">
              <option value="Tracked shipping">Tracked shipping (PostNord / DHL)</option>
              <option value="Pickup in Stockholm">Pickup in Stockholm</option>
              <option value="Let the seller advise">Let the seller advise</option>
            </select>
          </div>
          <div class="field field--wide">
            <label for="note">Delivery information (optional)</label>
            <textarea id="note" name="note" placeholder="Door code, preferred pickup time, or anything else we should know." maxlength="600"></textarea>
            <small>Optional — leave blank if nothing applies.</small>
          </div>
        </div>
      </section>

      <div class="checkout__submit">
        <button class="btn btn--lg btn--block" type="submit" data-submit-order>Submit order</button>
        <p class="submit-note">${esc(s.orderNotice)}</p>
      </div>
    </form>

    <aside class="summary checkout__summary" data-checkout-summary data-free-shipping-over="${s.freeShippingOver}" data-shipping-fee="${s.shippingFee}">
      <h2>Order summary</h2>
      <noscript><p>JavaScript is required to complete checkout.</p></noscript>
    </aside>
  </div>
</div>`;
  return layout({ title: 'Checkout', body, settings: s, active: '', description: 'Submit your sneaker order — no online payment required.' });
}

export function orderLines(order) {
  return `<table class="order-table">
    <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Price</th></tr></thead>
    <tbody>
      ${order.items
        .map(
          (item) => `<tr>
        <td><span class="order-table__name">${esc(item.brand)} ${esc(item.name)}</span>
            <span class="order-table__meta">Size ${esc(item.size)} (EU)${item.sku ? ` · ${esc(item.sku)}` : ''}</span></td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.price * item.quantity)}</td>
      </tr>`,
        )
        .join('')}
      <tr><td colspan="2">Shipping — ${esc(order.customer.deliveryMethod || 'Tracked shipping')}</td><td class="num">${order.shipping ? money(order.shipping) : 'Free'}</td></tr>
      <tr><td colspan="2"><b>Total</b></td><td class="num"><b>${money(order.total)}</b></td></tr>
    </tbody>
  </table>`;
}

export async function confirmationPage(order) {
  const s = await settings.get();
  const body = `<div class="wrap">
  <div class="confirm">
    <div class="confirm__tick">${icon('check')}</div>
    <h1>Order received!</h1>
    <p class="confirm__lede">Thank you for your order, ${esc(order.customer.firstName)}. We have received it and will contact you shortly to confirm payment and delivery.</p>
    <p class="confirm__number">Your order number is #${esc(order.number)}</p>
    <p class="submit-note">A confirmation has been sent to ${esc(order.customer.email)}. Keep this number handy — you can use it to <a href="/track">track your order</a>.</p>

    <section class="confirm__panel">
      <h2>Order summary</h2>
      ${orderLines(order)}
    </section>

    <section class="confirm__panel">
      <h2>Your details</h2>
      <dl class="spec">
        <dt>Name</dt><dd>${esc(order.customer.firstName)} ${esc(order.customer.lastName)}</dd>
        <dt>Phone</dt><dd>${esc(order.customer.phone)}</dd>
        <dt>Email</dt><dd>${esc(order.customer.email)}</dd>
        <dt>Address</dt><dd>${esc(order.customer.address)}, ${esc(order.customer.postalCode)} ${esc(order.customer.city)}</dd>
        <dt>Delivery</dt><dd>${esc(order.customer.deliveryMethod || 'Tracked shipping')}</dd>
        ${order.customer.note ? `<dt>Notes</dt><dd>${esc(order.customer.note)}</dd>` : ''}
        <dt>Placed</dt><dd>${esc(formatDate(order.createdAt))}</dd>
      </dl>
    </section>

    <div class="confirm__next">
      <div class="step"><h3>We confirm</h3><p>The seller reviews your order and contacts you within 24 hours on ${esc(order.customer.phone)}.</p></div>
      <div class="step"><h3>You pay</h3><p>Agree the method that suits you — Swish, bank transfer or cash at pickup. Nothing was charged online.</p></div>
      <div class="step"><h3>It ships</h3><p>Your pair is packed and sent tracked, or handed over in person in Stockholm.</p></div>
    </div>

    <div class="confirm__actions">
      <a class="btn btn--lg" href="/sneakers">Continue shopping</a>
      <a class="btn btn--ghost btn--lg" href="mailto:${esc(s.sellerEmail)}?subject=${encodeURIComponent(`Order #${order.number}`)}">Contact the seller</a>
    </div>
  </div>
</div>`;
  return layout({ title: `Order #${order.number} received`, body, settings: s, active: '', description: 'Your order has been received.' });
}

export async function trackPage({ order = null, error = '', query = {} } = {}) {
  const s = await settings.get();
  const statuses = ORDER_STATUSES;
  const timeline = order
    ? `<ol class="spec kv-wide">
        ${statuses
          .map((st) => {
            const entry = (order.history || []).find((h) => h.status === st);
            const meta = statusMeta(st);
            return `<dt>${esc(meta.label)}</dt><dd>${entry ? esc(formatDate(entry.at)) : '<span class="muted-2">—</span>'}</dd>`;
          })
          .join('')}
      </ol>`
    : '';

  const body = `<div class="wrap">
  <header class="page-head">
    <h1>Track your order</h1>
    <p>Enter the order number from your confirmation together with the email you used.</p>
  </header>
  <div class="cart-layout">
    <div>
      <form class="form-card" method="get" action="/track">
        <div class="field-grid">
          <div class="field">
            <label for="number">Order number</label>
            <input id="number" name="number" placeholder="10024" value="${esc(query.number || '')}" required>
          </div>
          <div class="field">
            <label for="temail">Email</label>
            <input id="temail" name="email" type="email" placeholder="you@example.com" value="${esc(query.email || '')}" required>
          </div>
        </div>
        <button class="btn mt-18" type="submit">Find my order</button>
      </form>
      ${error ? `<div class="notice notice--error">${icon('close')}<span>${esc(error)}</span></div>` : ''}
      ${order
        ? `<div class="form-card">
            <h2>Order #${esc(order.number)}</h2>
            <p class="form-card__lede">Placed ${esc(formatDate(order.createdAt))} · Status: <b>${esc(statusMeta(order.status).label)}</b></p>
            ${orderLines(order)}
          </div>
          <div class="form-card"><h2>Progress</h2>${timeline}</div>`
        : ''}
    </div>
    <aside class="summary">
      <h2>Need help?</h2>
      <p class="summary__note ta-left">Payment and delivery are always arranged personally. If you have not heard from us within 24 hours, get in touch and we will sort it out straight away.</p>
      <a class="btn btn--ghost btn--block mt-14" href="mailto:${esc(s.sellerEmail)}">Email the seller</a>
    </aside>
  </div>
</div>`;
  return layout({ title: 'Track your order', body, settings: s, active: '', description: 'Check the status of a submitted order.' });
}
