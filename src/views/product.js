import { esc, jsonScript, money, fmtSize } from '../util.js';
import { settings } from '../db.js';
import { brandOf, isSoldOut, queryProducts, sizeAvailable, totalStock } from '../catalog.js';
import { layout, icon } from './layout.js';
import { breadcrumbs, productGrid, sectionHead, stockLine } from './components.js';

export function productPage(product) {
  const s = settings.get();
  const brand = brandOf(product);
  const images = product.images && product.images.length ? product.images : ['/img/placeholder.svg'];
  const soldOut = isSoldOut(product);
  const sizes = (product.sizes || []).slice().sort((a, b) => Number(a.size) - Number(b.size));

  const related = queryProducts({ brand: [brand.slug], availability: 'in-stock' })
    .items.filter((p) => p.id !== product.id)
    .slice(0, 4);
  const alsoLike = related.length
    ? related
    : queryProducts({ availability: 'in-stock', sort: 'popular' }).items.filter((p) => p.id !== product.id).slice(0, 4);

  const clientData = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: brand.name,
    price: product.price,
    image: images[0],
  };

  const sizeGrid = sizes
    .map((row) => {
      const qty = sizeAvailable(row);
      const out = qty <= 0;
      return `<label class="size${out ? ' size--out' : ''}">
        <input type="radio" name="size" value="${esc(row.size)}" data-stock="${qty}"${out ? ' disabled' : ''}>
        <b>${esc(fmtSize(Number(row.size)))}</b>
        <small>${out ? 'Unavailable' : `${qty} left`}</small>
      </label>`;
    })
    .join('');

  const body = `<div class="wrap">
  ${breadcrumbs([
    { href: '/', label: 'Home' },
    { href: '/sneakers', label: 'Sneakers' },
    { href: `/brands/${brand.slug}`, label: brand.name },
    { label: product.name },
  ])}

  <div class="pdp" data-product>
    <div class="gallery">
      <div class="gallery__main">
        <img id="gallery-main-img" src="${esc(images[0])}" alt="${esc(`${brand.name} ${product.name}`)}" width="900" height="900" fetchpriority="high">
      </div>
      ${images.length > 1
        ? `<div class="gallery__thumbs">${images
            .map(
              (img, i) => `<button class="gallery__thumb${i === 0 ? ' is-active' : ''}" type="button" data-full="${esc(img)}" aria-label="View image ${i + 1}">
          <img src="${esc(img)}" alt="" loading="lazy" width="78" height="78"></button>`,
            )
            .join('')}</div>`
        : ''}
    </div>

    <div class="pdp__info">
      <a class="pdp__brand" href="/brands/${esc(brand.slug)}">${esc(brand.name)}</a>
      <h1>${esc(product.name)}</h1>
      <p class="pdp__price">${money(product.price)}</p>
      <p class="pdp__price-note">Price includes VAT. Shipping ${s.shippingFee} SEK — free over ${s.freeShippingOver} SEK.</p>

      <div class="pdp__meta">
        <span class="pill">${icon('check')} <b>Condition:</b> ${esc(product.condition || 'Deadstock (DS)')}</span>
        <span class="pill"><b>Colorway:</b> ${esc(product.colorway || '—')}</span>
        <span class="pill"><b>SKU:</b> ${esc(product.sku || '—')}</span>
      </div>

      <p>${stockLine(product)}</p>

      <section class="sizes-block mt-24">
        <div class="sizes__head">
          <h2>Select size (EU)</h2>
          <a class="sizes__guide" href="/how-it-works#sizing">Size guide</a>
        </div>
        <div class="sizes">${sizeGrid || '<p class="empty">No sizes listed yet.</p>'}</div>
        <p class="size-error" data-size-error tabindex="-1">Please select a size before adding this pair to your cart.</p>
      </section>

      <div class="pdp__actions">
        ${soldOut
          ? `<button class="btn btn--lg" type="button" disabled>Sold out</button>
             <a class="btn btn--ghost btn--lg" href="mailto:${esc(s.sellerEmail)}?subject=${encodeURIComponent(`Restock request: ${product.name}`)}">Request this pair</a>`
          : `<button class="btn btn--lg" type="button" data-add-to-cart>${icon('cart')} Add to cart</button>
             <a class="btn btn--ghost btn--lg" href="/cart">Go to cart</a>`}
      </div>

      <div class="pdp__notice">
        ${icon('chat')}
        <span><b>No online payment.</b> ${esc(s.orderNotice)}</span>
      </div>

      <div class="acc">
        <details open>
          <summary>Description</summary>
          <div class="acc__body">${esc(product.description || 'No description provided.')}</div>
        </details>
        <details>
          <summary>Product details</summary>
          <div class="acc__body">
            <dl class="spec">
              <dt>Brand</dt><dd>${esc(brand.name)}</dd>
              <dt>Model</dt><dd>${esc(product.name)}</dd>
              <dt>SKU</dt><dd>${esc(product.sku || '—')}</dd>
              <dt>Colorway</dt><dd>${esc(product.colorway || '—')}</dd>
              <dt>Category</dt><dd>${esc(product.category || '—')}</dd>
              <dt>Condition</dt><dd>${esc(product.condition || '—')}</dd>
              <dt>Release year</dt><dd>${esc(product.releaseYear || '—')}</dd>
              <dt>Availability</dt><dd>${soldOut ? 'Sold out' : `${totalStock(product)} pairs across ${sizes.filter((r) => sizeAvailable(r) > 0).length} sizes`}</dd>
            </dl>
          </div>
        </details>
        <details>
          <summary>Shipping &amp; payment</summary>
          <div class="acc__body">
            Orders are submitted through the site — no card details are collected. Once your order arrives,
            ${esc(s.storeName)} contacts you by phone or email within 24 hours to confirm the pair, agree the payment
            method (Swish, bank transfer or cash at pickup) and book delivery. Tracked shipping within Sweden costs
            ${s.shippingFee} SEK and is free on orders over ${s.freeShippingOver} SEK.
          </div>
        </details>
      </div>
    </div>
  </div>

  <section class="section section--tight">
    ${sectionHead(related.length ? `More from ${brand.name}` : 'You might also like', { kicker: 'Keep browsing', link: `/brands/${brand.slug}`, linkLabel: 'View brand' })}
    ${productGrid(alsoLike, { eagerCount: 0, empty: 'Nothing else in stock right now.' })}
  </section>
</div>
<script type="application/json" id="product-data">${jsonScript(clientData)}</script>`;

  return layout({
    title: `${brand.name} ${product.name}`,
    description: `${brand.name} ${product.name} — ${product.colorway || ''} ${product.condition || ''}. ${money(product.price)}. Reserve your size online, pay directly with the seller.`,
    body,
    active: 'sneakers',
    canonical: `/sneakers/${product.slug}`,
    ogImage: images[0],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${brand.name} ${product.name}`,
      image: images,
      description: product.description,
      sku: product.sku,
      brand: { '@type': 'Brand', name: brand.name },
      color: product.colorway,
      offers: {
        '@type': 'Offer',
        price: product.price,
        priceCurrency: 'SEK',
        availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        itemCondition: /Deadstock/i.test(product.condition || '')
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
        seller: { '@type': 'Organization', name: settings.get().storeName },
      },
    },
  });
}
