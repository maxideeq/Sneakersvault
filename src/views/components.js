// Reusable public-site building blocks.

import { esc, money, sizeRange } from '../util.js';
import { brandOf, inStockSizes, isSoldOut, productBadge, totalStock } from '../catalog.js';
import { icon } from './layout.js';

export function productImage(product, { sizes = '(max-width: 700px) 50vw, 300px', eager = false } = {}) {
  const src = (product.images && product.images[0]) || '/img/placeholder.svg';
  return `<img src="${esc(src)}" alt="${esc(`${brandOf(product).name} ${product.name}`)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" sizes="${esc(sizes)}" width="600" height="600">`;
}

export function productCard(product, { eager = false } = {}) {
  const brand = brandOf(product);
  const badge = productBadge(product);
  const sizes = inStockSizes(product).map((s) => s.size);
  const soldOut = isSoldOut(product);
  return `<article class="card${soldOut ? ' card--soldout' : ''}">
  <a class="card__media" href="/sneakers/${esc(product.slug)}" tabindex="-1" aria-hidden="true">
    ${productImage(product, { eager })}
    ${badge ? `<span class="badge badge--${badge.tone}">${esc(badge.label)}</span>` : ''}
  </a>
  <div class="card__body">
    <p class="card__brand">${esc(brand.name)}</p>
    <h3 class="card__title"><a href="/sneakers/${esc(product.slug)}">${esc(product.name)}</a></h3>
    <p class="card__price">${money(product.price)}</p>
    <p class="card__sizes">${sizes.length ? `Sizes: ${esc(sizeRange(sizes))}` : 'Currently sold out'}</p>
    <span class="btn btn--ghost btn--block card__cta">View product</span>
  </div>
</article>`;
}

export function productGrid(items, { eagerCount = 4, empty = 'No sneakers matched.' } = {}) {
  if (!items.length) return `<p class="empty">${esc(empty)}</p>`;
  return `<div class="grid grid--products">${items
    .map((p, i) => productCard(p, { eager: i < eagerCount }))
    .join('')}</div>`;
}

export function sectionHead(title, { kicker = '', link = null, linkLabel = 'View all' } = {}) {
  return `<div class="section__head">
    <div>
      ${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}
      <h2 class="section__title">${esc(title)}</h2>
    </div>
    ${link ? `<a class="link-arrow" href="${esc(link)}">${esc(linkLabel)} ${icon('arrow')}</a>` : ''}
  </div>`;
}

export function breadcrumbs(trail) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${trail
    .map((t, i) =>
      i === trail.length - 1
        ? `<li aria-current="page">${esc(t.label)}</li>`
        : `<li><a href="${esc(t.href)}">${esc(t.label)}</a></li>`,
    )
    .join('')}</ol></nav>`;
}

export function brandCard(brand) {
  return `<a class="brand-card" href="/brands/${esc(brand.slug)}">
    <span class="brand-card__mark" aria-hidden="true">${esc(brand.name.slice(0, 2).toUpperCase())}</span>
    <span class="brand-card__name">${esc(brand.name)}</span>
    <span class="brand-card__count">${brand.count} ${brand.count === 1 ? 'pair' : 'pairs'}</span>
  </a>`;
}

export function stockLine(product) {
  const total = totalStock(product);
  if (!total) return `<span class="stock stock--out">Sold out</span>`;
  if (total <= 3) return `<span class="stock stock--low">Only ${total} ${total === 1 ? 'pair' : 'pairs'} left</span>`;
  return `<span class="stock stock--in">${icon('check')} In stock — ${total} pairs</span>`;
}

export function pagination(page, pages, buildHref) {
  if (pages <= 1) return '';
  const items = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
      items.push(
        i === page
          ? `<span class="page is-current" aria-current="page">${i}</span>`
          : `<a class="page" href="${esc(buildHref(i))}">${i}</a>`,
      );
    } else if (items[items.length - 1] !== '<span class="page page--gap">…</span>') {
      items.push('<span class="page page--gap">…</span>');
    }
  }
  return `<nav class="pagination" aria-label="Pagination">
    ${page > 1 ? `<a class="page page--nav" href="${esc(buildHref(page - 1))}" rel="prev">Previous</a>` : ''}
    ${items.join('')}
    ${page < pages ? `<a class="page page--nav" href="${esc(buildHref(page + 1))}" rel="next">Next</a>` : ''}
  </nav>`;
}
