// Small shared helpers: escaping, money formatting, slugs, ids.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape untrusted text for HTML output. Used by every template interpolation. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escape a value for use inside a JSON blob embedded in a <script> tag. */
export function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

/** 1499 -> "1 499 SEK" (Swedish grouping with a non-breaking thin space). */
export function money(amount, { suffix = ' SEK' } = {}) {
  const n = Math.round(Number(amount) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + suffix;
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[åäàáâ]/g, 'a')
    .replace(/[öòóô]/g, 'o')
    .replace(/[éèêë]/g, 'e')
    .replace(/[üùú]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function id(prefix = '') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

/** Compact size range for product cards: ["40","41","42","45"] -> "40–42, 45" */
export function sizeRange(sizes) {
  const nums = sizes
    .map((s) => Number(String(s).replace(',', '.')))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (!nums.length) return '';
  const parts = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const cur = nums[i];
    if (cur !== undefined && (cur === prev + 1 || cur === prev + 0.5)) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? fmtSize(start) : `${fmtSize(start)}–${fmtSize(prev)}`);
    start = cur;
    prev = cur;
  }
  return parts.join(', ');
}

export function fmtSize(n) {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function formatDate(iso, { withTime = true } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x) => String(x).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(iso, { withTime: false });
}
