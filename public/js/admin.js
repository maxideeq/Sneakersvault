/* Seller dashboard interactions: sidebar, dynamic size rows, image removal,
   destructive-action confirmation. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function initSidebar() {
    var side = $('#side');
    var toggle = $('[data-side-toggle]');
    if (!side || !toggle) return;
    toggle.addEventListener('click', function () { side.classList.toggle('is-open'); });
    document.addEventListener('click', function (e) {
      if (side.classList.contains('is-open') && !side.contains(e.target) && !toggle.contains(e.target)) {
        side.classList.remove('is-open');
      }
    });
  }

  function initConfirm() {
    $$('[data-confirm]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        if (!window.confirm(form.dataset.confirm)) e.preventDefault();
      });
    });
  }

  function initSizeRows() {
    var host = $('[data-size-rows]');
    if (!host) return;
    var templateNode = $('#size-row-template');
    var template = templateNode ? JSON.parse(templateNode.textContent) : '';
    var runNode = $('#default-size-run');
    var defaultRun = runNode ? JSON.parse(runNode.textContent) : [];

    var keyCounter = 0;
    function addRow(size) {
      // Every row needs its own key so the availability checkbox can be
      // matched back to it on the server.
      var key = 'k_new' + (keyCounter++) + '_' + Math.random().toString(36).slice(2, 8);
      var wrapper = document.createElement('div');
      wrapper.innerHTML = template.split('__KEY__').join(key).trim();
      var row = wrapper.firstElementChild;
      if (size) row.querySelector('input[name="sizeValue"]').value = size;
      host.appendChild(row);
      return row;
    }

    var addBtn = $('[data-add-size]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var row = addRow('');
        row.querySelector('input[name="sizeValue"]').focus();
      });
    }

    var fillBtn = $('[data-fill-run]');
    if (fillBtn) {
      fillBtn.addEventListener('click', function () {
        var existing = $$('input[name="sizeValue"]', host).map(function (i) { return i.value.trim(); });
        defaultRun.forEach(function (size) {
          if (existing.indexOf(size) === -1) addRow(size);
        });
      });
    }

    host.addEventListener('click', function (e) {
      var del = e.target.closest('[data-remove-size]');
      if (!del) return;
      var row = del.closest('.size-row');
      if (row) row.remove();
    });
  }

  function initImages() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove-image]');
      if (!btn) return;
      var item = btn.closest('.image-item');
      if (item) item.remove();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initSidebar();
    initConfirm();
    initSizeRows();
    initImages();
  });
})();
