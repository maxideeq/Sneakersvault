import { esc } from '../util.js';
import { settings } from '../db.js';
import { brandsWithCounts } from '../catalog.js';
import { layout, icon } from './layout.js';
import { brandCard, breadcrumbs } from './components.js';

export function brandsPage() {
  const brands = brandsWithCounts();
  const body = `<div class="wrap">
  ${breadcrumbs([{ href: '/', label: 'Home' }, { label: 'Brands' }])}
  <header class="page-head">
    <h1>Brands</h1>
    <p>Every label in the current rotation. Tap a brand to see the pairs we have in stock right now.</p>
  </header>
  <div class="grid grid--brands">
    ${brands.length ? brands.map(brandCard).join('') : '<p class="empty">No brands yet.</p>'}
  </div>
</div>`;
  return layout({
    title: 'Brands',
    body,
    active: 'brands',
    canonical: '/brands',
    description: 'Nike, Adidas, Jordan, New Balance, ASICS and more — browse authenticated sneakers by brand.',
  });
}

export function howItWorksPage() {
  const s = settings.get();
  const body = `<div class="wrap">
  ${breadcrumbs([{ href: '/', label: 'Home' }, { label: 'How it works' }])}
  <header class="page-head">
    <h1>Ordering, payment &amp; delivery</h1>
    <p>${esc(s.storeName)} works a little differently from a big-box store — and deliberately so. Here is exactly what happens after you hit “Submit order”.</p>
  </header>
  <div class="prose">
    <div class="notice">${icon('chat')}<span><b>There is no online payment on this site.</b> ${esc(s.orderNotice)}</span></div>

    <h2 id="ordering">1. You place the order</h2>
    <p>Pick your pair, choose an EU size that is in stock, and add it to your cart. At checkout you give us your name, phone, email and address. No card details are requested, stored or processed anywhere on this site.</p>

    <h2 id="payment">2. We confirm and agree payment</h2>
    <p>Your order arrives in our seller dashboard the second you submit it, and you get an order number on screen and by email. We contact you within 24 hours to confirm the pair is ready and agree how you would like to pay:</p>
    <ul>
      <li>Swish — the fastest option for Swedish customers</li>
      <li>Bank transfer — for larger orders or company purchases</li>
      <li>Cash on pickup — if you collect the pair in Stockholm</li>
    </ul>
    <p>Your pair is held for you while we sort this out, so nobody else can buy the same size from under you.</p>

    <h2 id="shipping">3. Shipping &amp; pickup</h2>
    <p>Tracked delivery within Sweden costs ${s.shippingFee} SEK and is free on orders over ${s.freeShippingOver} SEK. Most pairs leave the same or next working day once payment is settled. Pickup in central Stockholm can be arranged by appointment at no cost.</p>

    <h2 id="authenticity">Authenticity</h2>
    <p>Every pair is inspected in-house before it is listed: box label against the shoe, stitching, tongue tags, midsole finish and UV details. Anything that does not pass is never listed. Condition grades are used consistently:</p>
    <ul>
      <li><b>Deadstock (DS)</b> — brand new, unworn, with the original box</li>
      <li><b>Very Near Deadstock (VNDS)</b> — tried on or worn once or twice, no visible wear</li>
      <li><b>Used — Excellent</b> — light wear, no flaws worth mentioning</li>
      <li><b>Used — Good</b> — visible wear, always photographed and described</li>
    </ul>

    <h2 id="sizing">Sizing</h2>
    <p>All sizes on this site are EU sizes as printed on the box label. If you are between sizes on a particular model, message us before ordering — we own most of these silhouettes ourselves and will tell you honestly how they fit.</p>

    <h2 id="returns">Returns</h2>
    <p>Because each pair is inspected and reserved for you personally, returns are handled case by case. If a pair does not match its description, contact us within 14 days and we will make it right.</p>

    <h2>Still have a question?</h2>
    <p>Email <a href="mailto:${esc(s.sellerEmail)}" class="link-in">${esc(s.sellerEmail)}</a> or call <a href="tel:${esc(String(s.sellerPhone).replace(/\s/g, ''))}" class="link-in">${esc(s.sellerPhone)}</a>.</p>
  </div>
</div>`;
  return layout({
    title: 'How it works',
    body,
    active: '',
    canonical: '/how-it-works',
    description: 'How ordering, payment and delivery work at Sole Society — order online, pay directly with the seller.',
  });
}

export function notFoundPage() {
  const body = `<div class="wrap">
  <div class="confirm pt-xl">
    <p class="kicker">404</p>
    <h1>This pair walked off</h1>
    <p class="confirm__lede">The page you are looking for does not exist, or the sneaker has been sold and delisted.</p>
    <div class="confirm__actions">
      <a class="btn btn--lg" href="/sneakers">Shop sneakers</a>
      <a class="btn btn--ghost btn--lg" href="/">Back home</a>
    </div>
  </div>
</div>`;
  return layout({ title: 'Page not found', body, active: '', description: 'Page not found.' });
}

export function errorPage() {
  const body = `<div class="wrap">
  <div class="confirm pt-xl">
    <p class="kicker">500</p>
    <h1>Something went wrong</h1>
    <p class="confirm__lede">An unexpected error occurred. Please try again — if it keeps happening, contact the seller directly.</p>
    <div class="confirm__actions"><a class="btn btn--lg" href="/">Back home</a></div>
  </div>
</div>`;
  return layout({ title: 'Error', body, active: '' });
}

