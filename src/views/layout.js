// The public site shell: <head>, header/nav, cart drawer, footer.

import { esc, jsonScript } from '../util.js';
import { settings } from '../db.js';

const NAV = [
  { href: '/', label: 'Home', key: 'home' },
  { href: '/sneakers', label: 'Sneakers', key: 'sneakers' },
  { href: '/new-arrivals', label: 'New Arrivals', key: 'new' },
  { href: '/popular', label: 'Popular', key: 'popular' },
  { href: '/brands', label: 'Brands', key: 'brands' },
];

export function icon(name, cls = '') {
  const paths = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    cart: '<path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    shield: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3Z"/>',
    chat: '<path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-5.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/>',
    star: '<path d="m12 4 2.4 5 5.6.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.6-.7Z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    box: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"/><path d="m4 8 8 4.5L20 8M12 12.5V20"/>',
    layers: '<path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/>',
    tag: '<path d="M4 11V5a1 1 0 0 1 1-1h6l8 8-7 7-8-8Z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
  };
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

export function layout({
  title,
  description = '',
  body,
  active = '',
  canonical = '',
  ogImage = '',
  jsonLd = null,
  bodyClass = '',
  searchValue = '',
}) {
  const s = settings.get();
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  const fullTitle = title ? `${title} — ${s.storeName}` : `${s.storeName} — ${s.tagline}`;
  const desc = description || s.tagline;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0e0e10">
${canonical ? `<link rel="canonical" href="${esc(siteUrl + canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(s.storeName)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
${ogImage ? `<meta property="og:image" content="${esc(siteUrl + ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/styles.css">
${jsonLd ? `<script type="application/ld+json">${jsonScript(jsonLd)}</script>` : ''}
</head>
<body class="${esc(bodyClass)}">
<a class="skip-link" href="#main">Skip to content</a>

<div class="announce">
  <div class="wrap announce__inner">
    <span>${icon('shield')} 100% authenticated pairs</span>
    <span class="announce__sep">·</span>
    <span>${icon('truck')} Free shipping in Sweden over ${s.freeShippingOver} SEK</span>
    <span class="announce__sep">·</span>
    <span>${icon('chat')} Order online — pay directly with the seller</span>
  </div>
</div>

<header class="header" id="header">
  <div class="wrap header__inner">
    <button class="icon-btn header__burger" type="button" data-menu-open aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">${icon('menu')}</button>

    <a class="logo" href="/" aria-label="${esc(s.storeName)} home">
      <span class="logo__mark" aria-hidden="true">SS</span>
      <span class="logo__text">${esc(s.storeName)}</span>
    </a>

    <nav class="nav" aria-label="Main">
      ${NAV.map((n) => `<a class="nav__link${active === n.key ? ' is-active' : ''}" href="${n.href}">${n.label}</a>`).join('')}
    </nav>

    <div class="header__actions">
      <form class="search search--header" action="/sneakers" method="get" role="search">
        <label class="sr-only" for="site-search">Search sneakers</label>
        ${icon('search', 'search__icon')}
        <input id="site-search" type="search" name="search" value="${esc(searchValue)}" placeholder="Search name, brand or SKU" autocomplete="off" data-suggest>
        <div class="suggest" data-suggest-panel hidden></div>
      </form>
      <button class="icon-btn header__search-toggle" type="button" data-search-toggle aria-label="Search">${icon('search')}</button>
      <a class="icon-btn cart-btn" href="/cart" aria-label="Cart">
        ${icon('cart')}
        <span class="cart-count" data-cart-count hidden>0</span>
      </a>
    </div>
  </div>
</header>

<div class="mobile-menu" id="mobile-menu" hidden>
  <div class="mobile-menu__panel">
    <div class="mobile-menu__top">
      <span class="logo__text">${esc(s.storeName)}</span>
      <button class="icon-btn" type="button" data-menu-close aria-label="Close menu">${icon('close')}</button>
    </div>
    <form class="search search--mobile" action="/sneakers" method="get" role="search">
      ${icon('search', 'search__icon')}
      <label class="sr-only" for="mobile-search">Search sneakers</label>
      <input id="mobile-search" type="search" name="search" placeholder="Search name, brand or SKU">
    </form>
    <nav class="mobile-menu__nav" aria-label="Mobile">
      ${NAV.map((n) => `<a href="${n.href}"${active === n.key ? ' aria-current="page"' : ''}>${n.label} ${icon('arrow')}</a>`).join('')}
      <a href="/cart">Cart ${icon('arrow')}</a>
    </nav>
    <p class="mobile-menu__note">${icon('chat')} Orders are confirmed personally by the seller — no online payment.</p>
  </div>
</div>

<main id="main">${body}</main>

<footer class="footer">
  <div class="wrap footer__grid">
    <div class="footer__brand">
      <span class="logo__mark" aria-hidden="true">SS</span>
      <p class="footer__tagline">${esc(s.tagline)}</p>
      <p class="footer__legal">© ${new Date().getFullYear()} ${esc(s.storeName)}. All rights reserved.</p>
    </div>
    <div class="footer__col">
      <h3>Shop</h3>
      <a href="/sneakers">All sneakers</a>
      <a href="/new-arrivals">New arrivals</a>
      <a href="/popular">Popular</a>
      <a href="/brands">Brands</a>
    </div>
    <div class="footer__col">
      <h3>How it works</h3>
      <a href="/how-it-works">Ordering &amp; payment</a>
      <a href="/how-it-works#shipping">Shipping</a>
      <a href="/how-it-works#authenticity">Authenticity</a>
      <a href="/track">Track an order</a>
    </div>
    <div class="footer__col">
      <h3>Contact</h3>
      <a href="mailto:${esc(s.sellerEmail)}">${esc(s.sellerEmail)}</a>
      <a href="tel:${esc(String(s.sellerPhone).replace(/\s/g, ''))}">${esc(s.sellerPhone)}</a>
      <a href="/admin">Seller login</a>
    </div>
  </div>
</footer>

<div class="toast" data-toast hidden role="status" aria-live="polite"></div>
<script src="/js/app.js" defer></script>
</body>
</html>`;
}
