import { esc, money } from '../util.js';
import { settings } from '../db.js';
import { brandsWithCounts, brandOf, queryProducts } from '../catalog.js';
import { layout, icon } from './layout.js';
import { productGrid, sectionHead } from './components.js';

export function homePage() {
  const s = settings.get();
  const featured = queryProducts({ tag: 'featured', availability: 'in-stock', sort: 'newest' }).items.slice(0, 4);
  const newest = queryProducts({ tag: 'new', sort: 'newest' }).items.slice(0, 4);
  const popular = queryProducts({ tag: 'popular', sort: 'popular' }).items.slice(0, 4);
  const brands = brandsWithCounts().filter((b) => b.count > 0).slice(0, 7);
  const hero =
    featured.slice().sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))[0] ||
    queryProducts({ sort: 'newest' }).items[0];
  const heroBrand = hero ? brandOf(hero) : null;
  const totalPairs = queryProducts({ availability: 'in-stock' }).items.length;

  const body = `
<section class="hero">
  <div class="wrap">
    <div class="hero__inner">
      <div class="hero__content">
        <span class="hero__eyebrow"><span class="dot"></span> Authenticated resale · Stockholm</span>
        <h1>The grails you missed, <em>back in your size.</em></h1>
        <p class="hero__lede">${esc(s.tagline)} Reserve your pair online — we confirm the details and arrange payment and delivery with you personally.</p>
        <div class="hero__cta">
          <a class="btn btn--light btn--lg" href="/sneakers">Shop sneakers ${icon('arrow')}</a>
          <a class="btn btn--outline-light btn--lg" href="/new-arrivals">New arrivals</a>
        </div>
        <div class="hero__stats">
          <div class="hero__stat"><b>${totalPairs}</b><span>Pairs in stock</span></div>
          <div class="hero__stat"><b>100%</b><span>Legit checked</span></div>
          <div class="hero__stat"><b>24 h</b><span>Order response</span></div>
        </div>
      </div>
      <div class="hero__media">
        ${hero ? `<img class="hero__shoe" src="${esc(hero.images?.[0] || '/img/placeholder.svg')}" alt="${esc(`${heroBrand.name} ${hero.name}`)}" width="700" height="700" fetchpriority="high">` : ''}
        ${hero ? `<a class="hero__tag hero__tag--one" href="/sneakers/${esc(hero.slug)}">
          <p>Featured pair</p><b>${esc(hero.name)}</b><span>${money(hero.price)}</span>
        </a>` : ''}
        <div class="hero__tag hero__tag--two">
          <p>How it works</p><b>Order now, pay after</b><span>Seller confirms within 24 h</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    <div class="props reveal">
      <div class="prop">${icon('shield')}<h3>Verified before it ships</h3><p>Every pair is inspected and legit-checked in-house. Condition and flaws are always listed honestly.</p></div>
      <div class="prop">${icon('chat')}<h3>Personal confirmation</h3><p>No card forms, no surprises. Submit your order and we contact you to confirm payment and delivery.</p></div>
      <div class="prop">${icon('truck')}<h3>Fast Nordic shipping</h3><p>Tracked delivery across Sweden, free over ${s.freeShippingOver} SEK. Local pickup in Stockholm is welcome.</p></div>
      <div class="prop">${icon('star')}<h3>Grails, not filler</h3><p>A tight, hand-picked rotation — Air Max Plus, Jordans, 550s and the runners worth queuing for.</p></div>
    </div>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap">
    ${sectionHead('Featured sneakers', { kicker: 'Hand picked', link: '/sneakers', linkLabel: 'Shop all' })}
    <div class="reveal">${productGrid(featured, { empty: 'No featured pairs right now — check back soon.' })}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead('New arrivals', { kicker: 'Just landed', link: '/new-arrivals' })}
    <div class="reveal">${productGrid(newest, { eagerCount: 0, empty: 'Nothing new in the last drop.' })}</div>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    ${sectionHead('Shop by brand', { kicker: 'Brands', link: '/brands', linkLabel: 'All brands' })}
    <div class="brand-strip reveal">
      ${brands
        .map(
          (b) => `<a class="brand-chip" href="/brands/${esc(b.slug)}"><b>${esc(b.name)}</b><span>${b.count} ${b.count === 1 ? 'pair' : 'pairs'}</span></a>`,
        )
        .join('')}
      <a class="brand-chip" href="/brands"><b>All brands</b><span>Browse</span></a>
    </div>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap">
    ${sectionHead('Popular right now', { kicker: 'Most wanted', link: '/popular' })}
    <div class="reveal">${productGrid(popular, { eagerCount: 0, empty: 'Popularity data is still warming up.' })}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${sectionHead('How ordering works', { kicker: 'Simple, transparent' })}
    <div class="steps reveal">
      <div class="step"><h3>Pick your pair</h3><p>Browse the catalogue, check the condition notes and choose your EU size. Only sizes we physically have are selectable.</p></div>
      <div class="step"><h3>Submit your order</h3><p>Add to cart and fill in your details at checkout. No card details are ever requested — there is no online payment.</p></div>
      <div class="step"><h3>We confirm with you</h3><p>Your order lands in the seller dashboard instantly. We call or email within 24 hours to agree payment and delivery.</p></div>
      <div class="step"><h3>Pay &amp; receive</h3><p>Pay the way you prefer — Swish, bank transfer or cash at pickup — then your pair ships tracked or is handed over in person.</p></div>
    </div>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    <div class="band reveal">
      <div>
        <h2>Looking for a specific pair?</h2>
        <p>Tell us the model and size. We source grails on request through our network of trusted sellers.</p>
      </div>
      <div class="hero__cta">
        <a class="btn btn--light btn--lg" href="mailto:${esc(s.sellerEmail)}">Request a pair</a>
        <a class="btn btn--outline-light btn--lg" href="/how-it-works">How it works</a>
      </div>
    </div>
  </div>
</section>`;

  return layout({
    title: '',
    description: `${s.tagline} Browse authenticated sneakers, reserve your size online and arrange payment directly with the seller.`,
    body,
    active: 'home',
    canonical: '/',
    ogImage: hero?.images?.[0] || '',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: s.storeName,
      description: s.tagline,
      email: s.sellerEmail,
      telephone: s.sellerPhone,
      url: process.env.SITE_URL || undefined,
      areaServed: 'SE',
    },
  });
}
