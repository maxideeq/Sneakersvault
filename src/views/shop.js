import { esc, money } from '../util.js';
import { allSizes, brandsWithCounts, CATEGORIES, priceBounds, SORTS, toArray } from '../catalog.js';
import { settings } from '../db.js';
import { layout, icon } from './layout.js';
import { productGrid, pagination, breadcrumbs } from './components.js';

const PER_PAGE = 12;

function buildQuery(params, overrides = {}) {
  const sp = new URLSearchParams();
  const merged = { ...params, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '') continue;
    for (const v of Array.isArray(value) ? value : [value]) sp.append(key, v);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

function activeChips(params, basePath, brands) {
  const chips = [];
  const push = (label, dropKey, dropValue) => {
    const next = { ...params };
    if (dropValue !== undefined) {
      next[dropKey] = toArray(next[dropKey]).filter((v) => v !== dropValue);
    } else {
      delete next[dropKey];
    }
    delete next.page;
    chips.push(
      `<a class="chip" href="${esc(basePath + buildQuery(next))}">${icon('close')} ${esc(label)}</a>`,
    );
  };

  if (params.search) push(`“${params.search}”`, 'search');
  for (const slug of toArray(params.brand)) {
    const brand = brands.find((b) => b.slug === slug);
    push(brand ? brand.name : slug, 'brand', slug);
  }
  for (const size of toArray(params.size)) push(`Size ${size}`, 'size', size);
  for (const cat of toArray(params.category)) push(cat, 'category', cat);
  if (params.min) push(`From ${money(params.min)}`, 'min');
  if (params.max) push(`Up to ${money(params.max)}`, 'max');
  if (params.availability === 'in-stock') push('In stock', 'availability');
  if (params.availability === 'sold-out') push('Sold out', 'availability');

  if (chips.length > 1) {
    const keep = params.tag ? { tag: params.tag } : {};
    chips.push(`<a class="chip chip--clear" href="${esc(basePath + buildQuery(keep))}">Clear all</a>`);
  }
  return chips.length ? `<div class="chips">${chips.join('')}</div>` : '';
}

function filterPanel(params, basePath, { brands, sizes, bounds }) {
  const selectedBrands = toArray(params.brand);
  const selectedSizes = toArray(params.size);
  const selectedCats = toArray(params.category);

  return `<form class="filters" method="get" action="${esc(basePath)}" data-filter-form>
    <div class="filters__sheet-head">
      <strong>Filters</strong>
      <button class="icon-btn" type="button" data-filter-close aria-label="Close filters">${icon('close')}</button>
    </div>
    ${params.search ? `<input type="hidden" name="search" value="${esc(params.search)}">` : ''}
    ${params.sort ? `<input type="hidden" name="sort" value="${esc(params.sort)}">` : ''}

    <details class="filters__group" open>
      <summary>Brand</summary>
      <div class="filters__body">
        ${brands
          .map(
            (b) => `<label class="check">
          <input type="checkbox" name="brand" value="${esc(b.slug)}"${selectedBrands.includes(b.slug) ? ' checked' : ''}>
          <span>${esc(b.name)}</span><span class="count">${b.count}</span>
        </label>`,
          )
          .join('')}
      </div>
    </details>

    <details class="filters__group" open>
      <summary>Size (EU)</summary>
      <div class="filters__body">
        <div class="size-filter">
          ${sizes
            .map(
              (size) => `<label><input type="checkbox" name="size" value="${esc(size)}"${selectedSizes.includes(size) ? ' checked' : ''}>${esc(size)}</label>`,
            )
            .join('')}
        </div>
      </div>
    </details>

    <details class="filters__group"${params.min || params.max ? ' open' : ''}>
      <summary>Price (SEK)</summary>
      <div class="filters__body">
        <div class="price-inputs">
          <input type="number" name="min" inputmode="numeric" min="0" placeholder="${bounds.min}" value="${esc(params.min || '')}" aria-label="Minimum price">
          <span>–</span>
          <input type="number" name="max" inputmode="numeric" min="0" placeholder="${bounds.max}" value="${esc(params.max || '')}" aria-label="Maximum price">
        </div>
        <button class="btn btn--ghost btn--sm btn--block mt-12" type="submit">Apply price</button>
      </div>
    </details>

    <details class="filters__group"${selectedCats.length ? ' open' : ''}>
      <summary>Category</summary>
      <div class="filters__body">
        ${CATEGORIES.map(
          (c) => `<label class="check">
          <input type="checkbox" name="category" value="${esc(c)}"${selectedCats.includes(c) ? ' checked' : ''}>
          <span>${esc(c)}</span>
        </label>`,
        ).join('')}
      </div>
    </details>

    <details class="filters__group" open>
      <summary>Availability</summary>
      <div class="filters__body">
        <label class="check"><input type="checkbox" name="availability" value="in-stock"${params.availability === 'in-stock' ? ' checked' : ''}><span>In stock only</span></label>
        <label class="check"><input type="checkbox" name="tag" value="new"${params.tag === 'new' ? ' checked' : ''}><span>New arrivals</span></label>
        <label class="check"><input type="checkbox" name="tag" value="popular"${params.tag === 'popular' ? ' checked' : ''}><span>Popular sneakers</span></label>
      </div>
    </details>

    <div class="filters__apply">
      <button class="btn btn--block" type="button" data-filter-close>Show results</button>
    </div>
  </form>`;
}

export async function shopPage({
  title,
  lede = '',
  items,
  params,
  basePath = '/sneakers',
  page = 1,
  active = 'sneakers',
  crumbs = null,
  canonical = '',
  showFilters = true,
}) {
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const current = Math.min(Math.max(1, page), pages);
  const slice = items.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const sort = params.sort && SORTS[params.sort] ? params.sort : params.search ? 'relevance' : 'newest';
  const [brands, sizes, bounds, s] = await Promise.all([
    brandsWithCounts(),
    allSizes(),
    priceBounds(),
    settings.get(),
  ]);
  const filterData = { brands: brands.filter((b) => b.count > 0), sizes, bounds };

  const sortForm = `<form method="get" action="${esc(basePath)}">
    ${Object.entries(params)
      .filter(([k]) => !['sort', 'page'].includes(k))
      .flatMap(([k, v]) => toArray(v).map((val) => `<input type="hidden" name="${esc(k)}" value="${esc(val)}">`))
      .join('')}
    <label class="sr-only" for="sort">Sort by</label>
    <select class="select" id="sort" name="sort" data-sort-select>
      ${Object.entries(SORTS)
        .filter(([key]) => key !== 'relevance' || params.search)
        .map(([key, cfg]) => `<option value="${esc(key)}"${sort === key ? ' selected' : ''}>${esc(cfg.label)}</option>`)
        .join('')}
    </select>
    <noscript><button class="btn btn--ghost btn--sm" type="submit">Sort</button></noscript>
  </form>`;

  const body = `<div class="wrap">
  ${crumbs ? breadcrumbs(crumbs) : ''}
  <header class="shop__head">
    <h1>${esc(title)}</h1>
    ${lede ? `<p>${esc(lede)}</p>` : ''}
  </header>
  <div class="${showFilters ? 'shop' : ''}">
    ${showFilters ? filterPanel(params, basePath, filterData) : ''}
    <div>
      <div class="shop__toolbar">
        ${showFilters ? `<button class="btn btn--ghost btn--sm filter-toggle" type="button" data-filter-toggle>${icon('filter')} Filters</button>` : ''}
        <span class="shop__count">${items.length} ${items.length === 1 ? 'pair' : 'pairs'}${current > 1 ? ` · page ${current} of ${pages}` : ''}</span>
        ${sortForm}
      </div>
      ${showFilters ? activeChips(params, basePath, brands) : ''}
      ${productGrid(slice, { empty: 'No sneakers matched your filters. Try widening your search.' })}
      ${pagination(current, pages, (n) => basePath + buildQuery(params, { page: n === 1 ? '' : n }))}
    </div>
  </div>
</div>`;

  return layout({
    title,
    description: lede || `Browse ${items.length} authenticated sneakers at Sole Society.`,
    body,
    active,
    canonical,
    settings: s,
    searchValue: params.search || '',
  });
}
