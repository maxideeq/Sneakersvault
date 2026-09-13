import { esc, money, formatDate, jsonScript } from '../util.js';
import { brands as brandsRepo, settings } from '../db.js';
import { CATEGORIES, CONDITIONS, DEFAULT_SIZE_RUN, brandOf, brandsWithCounts, isSoldOut, sizeAvailable, totalStock } from '../catalog.js';
import { icon } from './layout.js';
import { adminShell } from './admin.js';

export async function productsPage({ session, flash, list, search = '', brand = '', stock = '' }) {
  const allBrands = await brandsWithCounts();
  const body = `
<div class="toolbar">
  <form method="get" action="/admin/products">
    <input type="search" name="search" value="${esc(search)}" placeholder="Name, SKU or colorway">
    <select name="brand">
      <option value="">All brands</option>
      ${allBrands.map((b) => `<option value="${esc(b.slug)}"${brand === b.slug ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
    </select>
    <select name="stock">
      <option value="">Any stock</option>
      <option value="in"${stock === 'in' ? ' selected' : ''}>In stock</option>
      <option value="low"${stock === 'low' ? ' selected' : ''}>Low (≤ 2)</option>
      <option value="out"${stock === 'out' ? ' selected' : ''}>Sold out</option>
      <option value="hidden"${stock === 'hidden' ? ' selected' : ''}>Hidden</option>
    </select>
    <button class="btn btn--ghost btn--sm" type="submit">Filter</button>
  </form>
</div>

<section class="panel">
  <div class="panel__head"><h2>${list.length} product(s)</h2>
    <a class="btn btn--sm" href="/admin/products/new">${icon('plus')} Add sneaker</a>
  </div>
  ${list.length
    ? `<div class="table-wrap"><table class="data">
    <thead><tr><th>Product</th><th>Brand</th><th>SKU</th><th class="num">Price</th><th>Stock</th><th>Tags</th><th></th></tr></thead>
    <tbody>
      ${list
        .map((p) => {
          const total = totalStock(p);
          return `<tr>
        <td><div class="cell-product">
          <img class="thumb" src="${esc((p.images || [])[0] || '/img/placeholder.svg')}" alt="" width="46" height="46" loading="lazy">
          <div><p class="row-title">${esc(p.name)}</p><p class="row-sub">${esc(p.colorway || '')}</p></div>
        </div></td>
        <td>${esc(brandOf(p).name)}</td>
        <td><span class="row-sub">${esc(p.sku || '—')}</span></td>
        <td class="num">${money(p.price)}</td>
        <td>${
          total === 0
            ? '<span class="tag tag--bad">Sold out</span>'
            : total <= 2
              ? `<span class="tag tag--warn">${total} left</span>`
              : `<span class="tag tag--good">${total} pairs</span>`
        }</td>
        <td>${[
          p.active === false ? '<span class="tag tag--muted">Hidden</span>' : '',
          p.featured ? '<span class="tag tag--info">Featured</span>' : '',
          p.newArrival ? '<span class="tag">New</span>' : '',
          p.popular ? '<span class="tag">Popular</span>' : '',
        ]
          .filter(Boolean)
          .join(' ')}</td>
        <td class="num">
          <a class="btn btn--ghost btn--sm" href="/admin/products/${esc(p.id)}">Edit</a>
          <a class="btn btn--ghost btn--sm" href="/sneakers/${esc(p.slug)}" target="_blank" rel="noopener">View</a>
        </td>
      </tr>`;
        })
        .join('')}
    </tbody></table></div>`
    : '<p class="panel__empty">No products match. Try a different filter, or add your first sneaker.</p>'}
</section>`;

  return await adminShell({
    title: 'Products',
    subtitle: 'Add, edit and retire sneakers. Everything here is what customers see on the storefront.',
    actions: `<a class="btn" href="/admin/products/new">${icon('plus')} Add sneaker</a>`,
    body,
    active: 'products',
    session,
    flash,
  });
}

export async function productFormPage({ session, flash, product = null, errors = {}, values = null }) {
  const editing = Boolean(product);
  const v = values || {
    name: product?.name || '',
    brandId: product?.brandId || '',
    sku: product?.sku || '',
    price: product?.price ?? '',
    category: product?.category || 'Lifestyle',
    condition: product?.condition || CONDITIONS[0],
    colorway: product?.colorway || '',
    releaseYear: product?.releaseYear || '',
    description: product?.description || '',
    featured: product?.featured ?? false,
    newArrival: product?.newArrival ?? true,
    popular: product?.popular ?? false,
    active: product?.active !== false,
  };
  const sizes = product?.sizes?.length
    ? product.sizes
    : DEFAULT_SIZE_RUN.map((size) => ({ size, stock: 0, reserved: 0, available: true }));
  const allBrands = await brandsRepo.all();

  const body = `
<form method="post" action="${editing ? `/admin/products/${esc(product.id)}` : '/admin/products'}" enctype="multipart/form-data" class="stack" data-product-form>
  <input type="hidden" name="_csrf" value="${esc(session.csrf)}">

  <div class="order-grid">
    <div class="stack">
      <section class="panel">
        <div class="panel__head"><h2>Sneaker details</h2></div>
        <div class="panel__body grid-2">
          <div class="field span-2">
            <label for="name">Name <span class="req">*</span></label>
            <input id="name" name="name" value="${esc(v.name)}" placeholder="Air Max Plus &quot;Triple Black&quot;" required>
            ${errors.name ? `<small class="err">${esc(errors.name)}</small>` : ''}
          </div>
          <div class="field">
            <label for="brandId">Brand <span class="req">*</span></label>
            <select id="brandId" name="brandId" required>
              <option value="">Select a brand…</option>
              ${allBrands.map((b) => `<option value="${esc(b.id)}"${v.brandId === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
            </select>
            ${errors.brandId ? `<small class="err">${esc(errors.brandId)}</small>` : ''}
            <small>Missing one? <a href="/admin/brands" class="link-u">Add a brand</a>.</small>
          </div>
          <div class="field">
            <label for="sku">SKU / product number</label>
            <input id="sku" name="sku" value="${esc(v.sku)}" placeholder="604133-050">
          </div>
          <div class="field">
            <label for="price">Price (SEK) <span class="req">*</span></label>
            <input id="price" name="price" type="number" min="0" step="1" value="${esc(v.price)}" required>
            ${errors.price ? `<small class="err">${esc(errors.price)}</small>` : ''}
          </div>
          <div class="field">
            <label for="colorway">Colorway</label>
            <input id="colorway" name="colorway" value="${esc(v.colorway)}" placeholder="White/Black">
          </div>
          <div class="field">
            <label for="category">Category</label>
            <select id="category" name="category">
              ${CATEGORIES.map((c) => `<option value="${esc(c)}"${v.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="condition">Condition</label>
            <select id="condition" name="condition">
              ${CONDITIONS.map((c) => `<option value="${esc(c)}"${v.condition === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="releaseYear">Release year</label>
            <input id="releaseYear" name="releaseYear" type="number" min="1970" max="2100" value="${esc(v.releaseYear)}" placeholder="2021">
          </div>
          <div class="field span-2">
            <label for="description">Description</label>
            <textarea id="description" name="description" placeholder="Condition notes, what is included, anything the buyer should know.">${esc(v.description)}</textarea>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head"><h2>Sizes &amp; inventory</h2>
          <span class="hint right">Set stock to 0 or untick “Available” to make a size unselectable.</span>
        </div>
        <div class="panel__body stack">
          <div class="size-rows" data-size-rows>
            ${sizes.map((row) => sizeRowHtml(row)).join('')}
          </div>
          <div class="row">
            <button class="btn btn--ghost btn--sm" type="button" data-add-size>${icon('plus')} Add size</button>
            <button class="btn btn--ghost btn--sm" type="button" data-fill-run>Add EU 38–47 run</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head"><h2>Images</h2></div>
        <div class="panel__body stack">
          ${product?.images?.length
            ? `<div class="image-list">
              ${product.images
                .map(
                  (img, i) => `<div class="image-item">
                <img src="${esc(img)}" alt="" width="96" height="96">
                <input type="hidden" name="existingImages" value="${esc(img)}">
                <button type="button" data-remove-image aria-label="Remove image ${i + 1}">${icon('close')}</button>
              </div>`,
                )
                .join('')}
            </div>`
            : '<p class="hint">No images yet. The first image becomes the main product photo.</p>'}
          <div class="dropzone">
            ${icon('plus')}
            <p>Upload product photos (JPG, PNG, WebP or SVG — up to 5 MB each)</p>
            <input type="file" name="images" accept="image/png,image/jpeg,image/webp,image/avif,image/svg+xml" multiple>
          </div>
          <div class="field">
            <label for="imageUrls">…or paste image URLs (one per line)</label>
            <textarea id="imageUrls" name="imageUrls" class="ta-sm" placeholder="/img/products/nike-air-max-plus-white-1.svg"></textarea>
          </div>
        </div>
      </section>
    </div>

    <div class="stack">
      <section class="panel">
        <div class="panel__head"><h2>Visibility</h2></div>
        <div class="panel__body stack">
          <label class="switch"><input type="checkbox" name="active" value="1"${v.active ? ' checked' : ''}> Visible in the shop</label>
          <label class="switch"><input type="checkbox" name="featured" value="1"${v.featured ? ' checked' : ''}> Featured on the homepage</label>
          <label class="switch"><input type="checkbox" name="newArrival" value="1"${v.newArrival ? ' checked' : ''}> Show under New Arrivals</label>
          <label class="switch"><input type="checkbox" name="popular" value="1"${v.popular ? ' checked' : ''}> Show under Popular</label>
        </div>
      </section>

      <section class="panel">
        <div class="panel__body stack">
          <button class="btn btn--block" type="submit">${editing ? 'Save changes' : 'Publish sneaker'}</button>
          <a class="btn btn--ghost btn--block" href="/admin/products">Cancel</a>
          ${editing
            ? `<p class="hint">Created ${esc(formatDate(product.createdAt))}${product.updatedAt ? ` · updated ${esc(formatDate(product.updatedAt))}` : ''}</p>`
            : ''}
        </div>
      </section>

      ${editing
        ? `<section class="panel">
        <div class="panel__head"><h2>Danger zone</h2></div>
        <div class="panel__body stack">
          <p class="hint">Deleting removes the sneaker from the shop for good. Past orders keep their record.</p>
        </div>
      </section>`
        : ''}
    </div>
  </div>
</form>

${editing
  ? `<form method="post" action="/admin/products/${esc(product.id)}/delete" data-confirm="Delete “${esc(product.name)}” permanently?">
      <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
      <button class="btn btn--danger" type="submit">${icon('trash')} Delete sneaker</button>
    </form>`
  : ''}

<script type="application/json" id="size-row-template">${jsonScript(sizeRowHtml({ size: '', stock: 0, reserved: 0, available: true, key: '__KEY__' }))}</script>
<script type="application/json" id="default-size-run">${jsonScript(DEFAULT_SIZE_RUN)}</script>`;

  return await adminShell({
    title: editing ? `Edit — ${product.name}` : 'Add sneaker',
    subtitle: editing ? 'Update details, sizes, stock and images.' : 'Add a new pair to the catalogue.',
    actions: `<a class="btn btn--ghost" href="/admin/products">← All products</a>`,
    body,
    active: 'products',
    session,
    flash,
  });
}

function sizeRowHtml(row) {
  // Each row carries a key so the (sparse) "available" checkboxes can be
  // matched back to their row even when some are unchecked.
  const key = row.key || `k_${Math.random().toString(36).slice(2, 10)}`;
  return `<div class="size-row">
    <input type="hidden" name="sizeKey" value="${esc(key)}">
    <input type="text" name="sizeValue" value="${esc(row.size)}" placeholder="42" inputmode="decimal" aria-label="EU size">
    <input type="number" name="sizeStock" value="${esc(row.stock ?? 0)}" min="0" step="1" aria-label="Pairs in stock">
    <label class="switch"><input type="checkbox" name="sizeAvailable" value="${esc(key)}"${row.available !== false ? ' checked' : ''}> Available${
      row.reserved ? ` <span class="hint">· ${row.reserved} reserved</span>` : ''
    }</label>
    <button class="del" type="button" data-remove-size aria-label="Remove size">${icon('trash')}</button>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export async function inventoryPage({ session, flash, list, search = '' }) {
  const mode = (await settings.get()).inventoryMode;
  const modeLabels = {
    reserve: 'Reserved on order (stock is held until you mark the order paid or cancelled)',
    reduce: 'Reduced on order (stock comes off immediately)',
    none: 'Manual (orders never change stock)',
  };

  const body = `
<div class="flash flash--info">${icon('shield')}<span><b>Inventory mode:</b> ${esc(modeLabels[mode])}. <a href="/admin/settings" class="link-u">Change</a></span></div>

<div class="toolbar">
  <form method="get" action="/admin/inventory">
    <input type="search" name="search" value="${esc(search)}" placeholder="Find a sneaker">
    <button class="btn btn--ghost btn--sm" type="submit">Search</button>
  </form>
</div>

<section class="panel">
  <div class="panel__head"><h2>Stock by size</h2><span class="hint right">Edit a number and press Save to update that pair.</span></div>
  ${list.length
    ? list
        .map((p) => {
          const total = totalStock(p);
          return `<div class="inv-product">
      <form method="post" action="/admin/inventory/${esc(p.id)}">
        <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
        <div class="inv-head">
          <img class="thumb" src="${esc((p.images || [])[0] || '/img/placeholder.svg')}" alt="" width="52" height="52" loading="lazy">
          <div>
            <p class="row-title">${esc(brandOf(p).name)} ${esc(p.name)}</p>
            <p class="row-sub">${esc(p.sku || '—')} · ${total} pair(s) available${isSoldOut(p) ? ' · sold out' : ''}</p>
          </div>
          <div class="row right">
            <a class="btn btn--ghost btn--sm" href="/admin/products/${esc(p.id)}">Edit product</a>
            <button class="btn btn--sm" type="submit">Save stock</button>
          </div>
        </div>
        <div class="inv-sizes">
          ${(p.sizes || [])
            .slice()
            .sort((a, b) => Number(a.size) - Number(b.size))
            .map((row) => {
              const avail = sizeAvailable(row);
              const cls = row.available === false || avail === 0 ? 'inv-size--out' : avail <= 1 ? 'inv-size--low' : '';
              return `<div class="inv-size ${cls}">
            <b>Size ${esc(row.size)}</b>
            <input type="hidden" name="size" value="${esc(row.size)}">
            <input type="number" name="stock_${esc(row.size)}" value="${esc(row.stock ?? 0)}" min="0" step="1" aria-label="Stock for size ${esc(row.size)}">
            <span>${row.available === false ? 'Marked unavailable' : `${avail} available${row.reserved ? ` · ${row.reserved} reserved` : ''}`}</span>
          </div>`;
            })
            .join('')}
        </div>
      </form>
    </div>`;
        })
        .join('')
    : '<p class="panel__empty">No products yet.</p>'}
</section>`;

  return await adminShell({
    title: 'Inventory',
    subtitle: 'How many pairs are available for each sneaker and size.',
    body,
    active: 'inventory',
    session,
    flash,
  });
}

/* ------------------------------------------------------------------ */
/* Brands                                                              */
/* ------------------------------------------------------------------ */

export async function brandsAdminPage({ session, flash }) {
  const list = await brandsWithCounts();
  const body = `
<div class="order-grid">
  <section class="panel">
    <div class="panel__head"><h2>${list.length} brand(s)</h2></div>
    ${list.length
      ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Brand</th><th>Slug</th><th class="num">Products</th><th></th></tr></thead>
      <tbody>${list
        .map(
          (b) => `<tr>
        <td>
          <form method="post" action="/admin/brands/${esc(b.id)}" class="row">
            <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
            <input type="text" name="name" value="${esc(b.name)}" class="w-200">
            <button class="btn btn--ghost btn--sm" type="submit">Save</button>
          </form>
        </td>
        <td><span class="row-sub">/brands/${esc(b.slug)}</span></td>
        <td class="num">${b.count}</td>
        <td class="num">
          <form method="post" action="/admin/brands/${esc(b.id)}/delete" data-confirm="Delete the brand “${esc(b.name)}”?">
            <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
            <button class="btn btn--danger btn--sm" type="submit"${b.count ? ' disabled title="Move or delete its products first"' : ''}>Delete</button>
          </form>
        </td>
      </tr>`,
        )
        .join('')}</tbody></table></div>`
      : '<p class="panel__empty">No brands yet — add your first one.</p>'}
  </section>

  <section class="panel">
    <div class="panel__head"><h2>Add a brand</h2></div>
    <div class="panel__body">
      <form method="post" action="/admin/brands" class="stack">
        <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
        <div class="field">
          <label for="brandName">Brand name</label>
          <input id="brandName" name="name" placeholder="Salomon" required>
        </div>
        <div class="field">
          <label for="brandDesc">Short description (optional)</label>
          <textarea id="brandDesc" name="description" class="ta-sm" placeholder="Trail-ready silhouettes with a cult following."></textarea>
        </div>
        <button class="btn" type="submit">Add brand</button>
      </form>
    </div>
  </section>
</div>`;

  return await adminShell({
    title: 'Brands',
    subtitle: 'Brands power the storefront navigation, filters and brand pages.',
    body,
    active: 'brands',
    session,
    flash,
  });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function settingsPage({ session, flash, mailStatus }) {
  const s = await settings.get();
  const body = `
<div class="order-grid">
  <form method="post" action="/admin/settings" class="stack">
    <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
    <section class="panel">
      <div class="panel__head"><h2>Store</h2></div>
      <div class="panel__body grid-2">
        <div class="field"><label for="storeName">Store name</label><input id="storeName" name="storeName" value="${esc(s.storeName)}"></div>
        <div class="field"><label for="sellerPhone">Seller phone</label><input id="sellerPhone" name="sellerPhone" value="${esc(s.sellerPhone)}"></div>
        <div class="field span-2"><label for="tagline">Tagline</label><input id="tagline" name="tagline" value="${esc(s.tagline)}"></div>
        <div class="field span-2"><label for="sellerEmail">Order notification email</label><input id="sellerEmail" name="sellerEmail" type="email" value="${esc(s.sellerEmail)}"><small>New orders are emailed here.</small></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><h2>Orders &amp; delivery</h2></div>
      <div class="panel__body grid-2">
        <div class="field"><label for="shippingFee">Shipping fee (SEK)</label><input id="shippingFee" name="shippingFee" type="number" min="0" value="${esc(s.shippingFee)}"></div>
        <div class="field"><label for="freeShippingOver">Free shipping over (SEK)</label><input id="freeShippingOver" name="freeShippingOver" type="number" min="0" value="${esc(s.freeShippingOver)}"></div>
        <div class="field span-2">
          <label for="inventoryMode">When an order is submitted…</label>
          <select id="inventoryMode" name="inventoryMode">
            <option value="reserve"${s.inventoryMode === 'reserve' ? ' selected' : ''}>Reserve the pairs (stock is held until paid or cancelled)</option>
            <option value="reduce"${s.inventoryMode === 'reduce' ? ' selected' : ''}>Reduce stock immediately</option>
            <option value="none"${s.inventoryMode === 'none' ? ' selected' : ''}>Do nothing — I manage stock manually</option>
          </select>
        </div>
        <div class="field span-2">
          <label for="orderNotice">Checkout notice (shown under the Submit order button)</label>
          <textarea id="orderNotice" name="orderNotice" class="ta-sm">${esc(s.orderNotice)}</textarea>
        </div>
      </div>
    </section>
    <div><button class="btn" type="submit">Save settings</button></div>
  </form>

  <div class="stack">
    <section class="panel">
      <div class="panel__head"><h2>Payments</h2></div>
      <div class="panel__body stack">
        <p class="hint">This store deliberately takes <b>no online payment</b>. Customers submit orders and you arrange payment directly — Swish, bank transfer or cash on pickup.</p>
        <p class="hint">A payment provider can be added later without changing the order flow: orders already carry totals, items and customer details.</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel__head"><h2>Email delivery</h2></div>
      <div class="panel__body stack">
        <p class="hint">${mailStatus.configured
          ? `SMTP is configured (<b>${esc(mailStatus.host)}</b>). Order confirmations go to customers and notifications to ${esc(s.sellerEmail)}.`
          : 'SMTP is not configured, so every email is written to <b>data/outbox.log</b> instead. Set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM to send for real.'}</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel__head"><h2>Account</h2></div>
      <div class="panel__body stack">
        <form method="post" action="/admin/password" class="stack">
          <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
          <div class="field"><label for="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" minlength="8" autocomplete="new-password" required><small>At least 8 characters.</small></div>
          <button class="btn btn--ghost" type="submit">Change password</button>
        </form>
      </div>
    </section>
  </div>
</div>`;

  return await adminShell({
    title: 'Settings',
    subtitle: 'Store details, order handling and your dashboard account.',
    body,
    active: 'settings',
    session,
    flash,
  });
}
