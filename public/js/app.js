/* Sole Society storefront — cart, navigation, search and checkout.
   No dependencies; every feature degrades to plain links/forms when JS is off. */
(function () {
  'use strict';

  var CART_KEY = 'ss_cart_v1';

  // Scroll-reveal animations only apply once JS is confirmed, so the content
  // is never hidden for a visitor whose script fails to load.
  document.documentElement.classList.add('js');
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function money(amount) {
    return String(Math.round(Number(amount) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' SEK';
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name) {
    var paths = {
      cart: '<path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
      check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
      trash: '<path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      minus: '<path d="M5 12h14"/>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || '') + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Cart storage                                                        */
  /* ------------------------------------------------------------------ */
  var Cart = {
    read: function () {
      try {
        var raw = localStorage.getItem(CART_KEY);
        var items = raw ? JSON.parse(raw) : [];
        return Array.isArray(items) ? items.filter(function (i) { return i && i.productId && i.size; }) : [];
      } catch (err) { return []; }
    },
    write: function (items) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (err) { /* private mode */ }
      document.dispatchEvent(new CustomEvent('cart:change', { detail: { items: items } }));
      return items;
    },
    count: function () {
      return Cart.read().reduce(function (sum, i) { return sum + (Number(i.qty) || 0); }, 0);
    },
    total: function (items) {
      return (items || Cart.read()).reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
    },
    key: function (item) { return item.productId + '::' + item.size; },
    add: function (item) {
      var items = Cart.read();
      var existing = items.filter(function (i) { return Cart.key(i) === Cart.key(item); })[0];
      if (existing) existing.qty = Math.min(existing.qty + item.qty, item.maxQty || 10);
      else items.push(item);
      return Cart.write(items);
    },
    setQty: function (key, qty) {
      var items = Cart.read().map(function (i) {
        if (Cart.key(i) !== key) return i;
        i.qty = Math.max(1, Math.min(qty, i.maxQty || 10));
        return i;
      });
      return Cart.write(items);
    },
    remove: function (key) {
      return Cart.write(Cart.read().filter(function (i) { return Cart.key(i) !== key; }));
    },
    clear: function () { return Cart.write([]); }
  };
  window.SoleCart = Cart;

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */
  var toastTimer;
  function toast(html) {
    var el = $('[data-toast]');
    if (!el) return;
    el.innerHTML = icon('check') + '<span>' + html + '</span>';
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 300);
    }, 4000);
  }

  /* ------------------------------------------------------------------ */
  /* Header: cart badge, sticky, mobile menu, search                     */
  /* ------------------------------------------------------------------ */
  function paintCartCount(bump) {
    var n = Cart.count();
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = n;
      el.hidden = n === 0;
      if (bump && n > 0) {
        el.classList.remove('is-bump');
        void el.offsetWidth;
        el.classList.add('is-bump');
      }
    });
  }

  function initHeader() {
    var header = $('#header');
    if (header) {
      var onScroll = function () { header.classList.toggle('is-stuck', window.scrollY > 4); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    var menu = $('#mobile-menu');
    var openBtn = $('[data-menu-open]');
    var closeMenu = function () {
      if (!menu) return;
      menu.hidden = true;
      document.body.classList.remove('no-scroll');
      if (openBtn) { openBtn.setAttribute('aria-expanded', 'false'); openBtn.focus(); }
    };
    if (openBtn && menu) {
      openBtn.addEventListener('click', function () {
        menu.hidden = false;
        document.body.classList.add('no-scroll');
        openBtn.setAttribute('aria-expanded', 'true');
        var first = $('a, button', menu);
        if (first) first.focus();
      });
      menu.addEventListener('click', function (e) {
        if (e.target === menu || e.target.closest('[data-menu-close]')) closeMenu();
      });
    }

    var searchToggle = $('[data-search-toggle]');
    if (searchToggle) {
      searchToggle.addEventListener('click', function () {
        var form = $('.search--header');
        form.classList.toggle('is-open');
        if (form.classList.contains('is-open')) $('input', form).focus();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (menu && !menu.hidden) closeMenu();
        var panel = $('[data-suggest-panel]');
        if (panel) panel.hidden = true;
        var sheet = $('.filters.is-open');
        if (sheet) sheet.classList.remove('is-open');
      }
    });
  }

  /* Live search suggestions ------------------------------------------- */
  function initSuggest() {
    var input = $('[data-suggest]');
    var panel = $('[data-suggest-panel]');
    if (!input || !panel) return;
    var timer;
    var lastQuery = '';

    function render(items, query) {
      if (!items.length) {
        panel.innerHTML = '<p class="suggest__empty">No sneakers match “' + escapeHtml(query) + '”.</p>';
      } else {
        panel.innerHTML = items.map(function (p) {
          return '<a class="suggest__item" href="/sneakers/' + encodeURIComponent(p.slug) + '">' +
            '<img src="' + escapeHtml(p.image) + '" alt="" loading="lazy" width="46" height="46">' +
            '<span><span class="suggest__name">' + escapeHtml(p.name) + '</span>' +
            '<span class="suggest__meta">' + escapeHtml(p.brand) + ' · ' + escapeHtml(p.sku) + '</span></span>' +
            '<span class="suggest__price">' + money(p.price) + '</span></a>';
        }).join('') +
        '<a class="suggest__item" href="/sneakers?search=' + encodeURIComponent(query) + '"><span class="suggest__name">See all results for “' + escapeHtml(query) + '”</span></a>';
      }
      panel.hidden = false;
    }

    input.addEventListener('input', function () {
      var query = input.value.trim();
      clearTimeout(timer);
      if (query.length < 2) { panel.hidden = true; return; }
      timer = setTimeout(function () {
        if (query === lastQuery) return;
        lastQuery = query;
        fetch('/api/search?q=' + encodeURIComponent(query) + '&limit=6')
          .then(function (r) { return r.json(); })
          .then(function (data) { render(data.results || [], query); })
          .catch(function () { panel.hidden = true; });
      }, 180);
    });

    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== input) panel.hidden = true;
    });
    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 2 && panel.innerHTML) panel.hidden = false;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Product page                                                        */
  /* ------------------------------------------------------------------ */
  function initProduct() {
    var root = $('[data-product]');
    if (!root) return;
    var product = JSON.parse($('#product-data').textContent);
    var addBtn = $('[data-add-to-cart]');
    var error = $('[data-size-error]');

    $$('.gallery__thumb').forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        $('#gallery-main-img').src = thumb.dataset.full;
        $$('.gallery__thumb').forEach(function (t) { t.classList.toggle('is-active', t === thumb); });
      });
    });

    root.addEventListener('change', function (e) {
      if (e.target.name === 'size' && error) error.classList.remove('is-visible');
    });

    if (!addBtn) return;
    addBtn.addEventListener('click', function () {
      var checked = $('input[name="size"]:checked', root);
      if (!checked) {
        if (error) {
          error.classList.add('is-visible');
          error.focus();
        }
        var firstSize = $('.sizes');
        if (firstSize) firstSize.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      var size = checked.value;
      var stock = Number(checked.dataset.stock) || 1;
      Cart.add({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        size: size,
        qty: 1,
        price: product.price,
        image: product.image,
        maxQty: stock
      });
      paintCartCount(true);
      toast('Added <b>' + escapeHtml(product.name) + '</b> — size ' + escapeHtml(size) + '. <a href="/cart">View cart</a>');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Cart page                                                           */
  /* ------------------------------------------------------------------ */
  function lineHtml(item) {
    var key = Cart.key(item);
    var flag = item.issue ? '<span class="cart-line__flag">' + escapeHtml(item.issue) + '</span>' : '';
    return '<div class="cart-line" data-key="' + escapeHtml(key) + '">' +
      '<a class="cart-line__media" href="/sneakers/' + encodeURIComponent(item.slug) + '"><img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" width="104" height="104"></a>' +
      '<div>' +
        '<p class="cart-line__brand">' + escapeHtml(item.brand) + '</p>' +
        '<h2 class="cart-line__name"><a href="/sneakers/' + encodeURIComponent(item.slug) + '">' + escapeHtml(item.name) + '</a></h2>' +
        '<p class="cart-line__size">Size: <b>' + escapeHtml(item.size) + '</b> (EU)</p>' +
        '<div class="cart-line__controls">' +
          '<div class="qty">' +
            '<button type="button" data-qty="-1" aria-label="Decrease quantity"' + (item.qty <= 1 ? ' disabled' : '') + '>' + icon('minus') + '</button>' +
            '<output aria-label="Quantity">' + item.qty + '</output>' +
            '<button type="button" data-qty="1" aria-label="Increase quantity"' + (item.qty >= (item.maxQty || 10) ? ' disabled' : '') + '>' + icon('plus') + '</button>' +
          '</div>' +
          '<button type="button" class="cart-line__remove" data-remove>' + icon('trash') + ' Remove</button>' +
        '</div>' +
        flag +
      '</div>' +
      '<div class="cart-line__price">' + money(item.price * item.qty) +
        (item.qty > 1 ? '<span class="cart-line__unit">' + money(item.price) + ' each</span>' : '') +
      '</div>' +
    '</div>';
  }

  function renderCartPage() {
    var root = $('[data-cart-page]');
    if (!root) return;
    var items = Cart.read();
    if (!items.length) {
      root.innerHTML = '<div class="cart-empty">' + icon('cart') +
        '<h2>Your cart is empty</h2>' +
        '<p>Browse the latest pairs and add your size to get started.</p>' +
        '<a class="btn btn--lg" href="/sneakers">Shop sneakers</a></div>';
      return;
    }
    var subtotal = Cart.total(items);
    var shipping = subtotal >= Number(root.dataset.freeShippingOver || 2000) ? 0 : Number(root.dataset.shippingFee || 0);
    root.innerHTML =
      '<div class="cart-layout">' +
        '<section class="cart-lines" aria-label="Cart items">' + items.map(lineHtml).join('') + '</section>' +
        '<aside class="summary">' +
          '<h2>Order summary</h2>' +
          '<div class="summary__row"><span>Subtotal (' + Cart.count() + ' ' + (Cart.count() === 1 ? 'pair' : 'pairs') + ')</span><span>' + money(subtotal) + '</span></div>' +
          '<div class="summary__row summary__row--muted"><span>Shipping</span><span>' + (shipping ? money(shipping) : 'Free') + '</span></div>' +
          '<div class="summary__total"><span>Total</span><b>' + money(subtotal + shipping) + '</b></div>' +
          '<a class="btn btn--lg btn--block" href="/checkout">Proceed to checkout</a>' +
          '<a class="btn btn--ghost btn--block mt-10" href="/sneakers">Continue shopping</a>' +
          '<p class="summary__note">No payment is taken online. You submit the order and the seller contacts you to arrange payment and delivery.</p>' +
        '</aside>' +
      '</div>';
  }

  function initCartPage() {
    var root = $('[data-cart-page]');
    if (!root) return;
    renderCartPage();
    root.addEventListener('click', function (e) {
      var line = e.target.closest('[data-key]');
      if (!line) return;
      var key = line.dataset.key;
      var qtyBtn = e.target.closest('[data-qty]');
      if (qtyBtn) {
        var current = Cart.read().filter(function (i) { return Cart.key(i) === key; })[0];
        if (current) Cart.setQty(key, current.qty + Number(qtyBtn.dataset.qty));
        renderCartPage();
        paintCartCount(false);
        return;
      }
      if (e.target.closest('[data-remove]')) {
        Cart.remove(key);
        renderCartPage();
        paintCartCount(false);
        toast('Item removed from your cart.');
      }
    });
  }

  /* Re-check prices and stock against the live catalogue. */
  function syncCart(onDone) {
    var items = Cart.read();
    if (!items.length) { if (onDone) onDone([]); return; }
    fetch('/api/cart/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map(function (i) { return { productId: i.productId, size: i.size, qty: i.qty }; }) })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.items) { if (onDone) onDone(items); return; }
        Cart.write(data.items);
        if (data.changed) {
          toast('Your cart was updated to match current stock and prices.');
        }
        if (onDone) onDone(data.items);
      })
      .catch(function () { if (onDone) onDone(items); });
  }

  /* ------------------------------------------------------------------ */
  /* Checkout                                                            */
  /* ------------------------------------------------------------------ */
  function renderCheckoutSummary() {
    var host = $('[data-checkout-summary]');
    if (!host) return;
    var items = Cart.read();
    if (!items.length) {
      window.location.replace('/cart');
      return;
    }
    var subtotal = Cart.total(items);
    var delivery = $('#deliveryMethod');
    var collected = delivery && /pickup/i.test(delivery.value);
    var shipping = collected || subtotal >= Number(host.dataset.freeShippingOver || 2000)
      ? 0
      : Number(host.dataset.shippingFee || 0);
    host.innerHTML =
      '<h2>Order summary</h2>' +
      '<div class="summary__items">' + items.map(function (i) {
        return '<div class="summary__item">' +
          '<img src="' + escapeHtml(i.image) + '" alt="" width="54" height="54">' +
          '<span class="summary__item-info"><span class="summary__item-name">' + escapeHtml(i.name) + '</span>' +
          '<span class="summary__item-meta">' + escapeHtml(i.brand) + ' · Size ' + escapeHtml(i.size) + ' · ' + i.qty + ' ' + (i.qty === 1 ? 'pair' : 'pairs') + '</span></span>' +
          '<span class="summary__item-price">' + money(i.price * i.qty) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="summary__row"><span>Subtotal</span><span>' + money(subtotal) + '</span></div>' +
      '<div class="summary__row summary__row--muted"><span>' + (collected ? 'Pickup in Stockholm' : 'Shipping') + '</span><span>' + (shipping ? money(shipping) : 'Free') + '</span></div>' +
      '<div class="summary__total"><span>Total</span><b>' + money(subtotal + shipping) + '</b></div>' +
      '<p class="summary__note">Payment is arranged directly with the seller after your order is received.</p>' +
      '<a class="btn btn--ghost btn--block mt-14" href="/cart">Edit cart</a>';
  }

  function fieldError(input, message) {
    var field = input.closest('.field');
    if (!field) return;
    field.classList.toggle('has-error', Boolean(message));
    var box = $('.field__error', field);
    if (box) box.textContent = message || '';
  }

  function validateForm(form) {
    var ok = true;
    var firstBad = null;
    $$('input, textarea', form).forEach(function (input) {
      if (!input.name) return;
      var value = input.value.trim();
      var message = '';
      if (input.required && !value) message = 'This field is required.';
      else if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) message = 'Enter a valid email address.';
      else if (input.name === 'phone' && value && value.replace(/[^\d]/g, '').length < 7) message = 'Enter a valid phone number.';
      else if (input.name === 'postalCode' && value && !/^[\d\s-]{4,10}$/.test(value)) message = 'Enter a valid postal code.';
      fieldError(input, message);
      if (message) { ok = false; if (!firstBad) firstBad = input; }
    });
    if (firstBad) firstBad.focus();
    return ok;
  }

  function initCheckout() {
    var form = $('[data-checkout-form]');
    if (!form) return;
    syncCart(function () { renderCheckoutSummary(); });
    renderCheckoutSummary();

    var deliverySelect = $('#deliveryMethod', form);
    if (deliverySelect) {
      deliverySelect.addEventListener('change', renderCheckoutSummary);
    }

    $$('input, textarea', form).forEach(function (input) {
      input.addEventListener('blur', function () {
        if (input.value.trim() || input.required) validateForm.call(null, form);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var banner = $('[data-checkout-error]');
      if (banner) banner.hidden = true;
      if (!validateForm(form)) return;

      var items = Cart.read();
      if (!items.length) { window.location.href = '/cart'; return; }

      var button = $('[data-submit-order]', form);
      button.disabled = true;
      var original = button.textContent;
      button.textContent = 'Submitting order…';

      var data = {};
      new FormData(form).forEach(function (value, key) { data[key] = String(value).trim(); });
      data.items = items.map(function (i) { return { productId: i.productId, size: i.size, qty: i.qty }; });

      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
        .then(function (res) {
          if (!res.ok || !res.body.ok) {
            throw new Error((res.body && res.body.error) || 'Something went wrong. Please try again.');
          }
          Cart.clear();
          window.location.href = res.body.redirect;
        })
        .catch(function (err) {
          button.disabled = false;
          button.textContent = original;
          if (banner) {
            $('[data-checkout-error-text]').textContent = err.message;
            banner.hidden = false;
            banner.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Shop filters (mobile sheet + auto-submit)                           */
  /* ------------------------------------------------------------------ */
  function initFilters() {
    var form = $('[data-filter-form]');
    if (!form) return;
    var sheet = $('.filters');
    $$('[data-filter-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () { sheet.classList.toggle('is-open'); });
    });
    $$('[data-filter-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { sheet.classList.remove('is-open'); });
    });
    form.addEventListener('change', function (e) {
      if (e.target.matches('input[type="checkbox"], select')) form.requestSubmit();
    });
    var sort = $('[data-sort-select]');
    if (sort) sort.addEventListener('change', function () { sort.form.requestSubmit(); });
  }

  /* ------------------------------------------------------------------ */
  /* Scroll reveal                                                       */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    var nodes = $$('.reveal');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    nodes.forEach(function (n) { observer.observe(n); });
  }

  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    paintCartCount(false);
    initHeader();
    initSuggest();
    initProduct();
    initCartPage();
    initCheckout();
    initFilters();
    initReveal();
    if ($('[data-cart-page]')) syncCart(function () { renderCartPage(); paintCartCount(false); });
    document.addEventListener('cart:change', function () { paintCartCount(false); });
  });
})();
