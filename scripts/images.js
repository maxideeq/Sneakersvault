// Generates the product imagery used by the demo catalogue.
//
// Every sneaker photo on a resale site is someone's copyrighted work, so the
// seed data ships with clean vector renderings instead: one stylised low-top
// silhouette, recoloured per colorway and rendered at two angles. Real photos
// uploaded through the dashboard replace them per product.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'products');

/**
 * A sneaker box, drawn isometrically and recoloured per product.
 * `angle` 2 lifts the lid for the second gallery image.
 */
function sneakerSvg({ upper, overlay, sole, accent, laces, backdrop, backdrop2, label = '', angle = 1 }) {
  const lift = angle === 2 ? 58 : 0;
  const shift = angle === 2 ? 26 : 0;

  // Isometric basis: ex runs right-and-down, ey left-and-down, ez straight up.
  // Screen y grows downward, so the two horizontal axes rise as they recede.
  const O = [392, 588];
  const ex = [252, -145];
  const ey = [-150, -86];
  const H = 112;
  const add = (p, ...vs) => vs.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1]], p);
  const up = (p, h) => [p[0], p[1] - h];
  const poly = (...pts) => pts.map((p) => `${round(p[0])},${round(p[1])}`).join(' ');
  const round = (n) => Math.round(n * 10) / 10;

  const bFront = O;
  const bRight = add(O, ex);
  const bLeft = add(O, ey);
  const tFront = up(bFront, H);
  const tRight = up(bRight, H);
  const tLeft = up(bLeft, H);
  const tBack = up(add(O, ex, ey), H);

  // Lid: the same box a little wider, sitting on top (and lifted when open).
  const centre = [(tFront[0] + tRight[0] + tBack[0] + tLeft[0]) / 4, (tFront[1] + tRight[1] + tBack[1] + tLeft[1]) / 4];
  const grow = (p) => [centre[0] + (p[0] - centre[0]) * 1.055, centre[1] + (p[1] - centre[1]) * 1.055];
  const lidBase = [tFront, tRight, tBack, tLeft].map((p) => {
    const g = grow(p);
    return [g[0] + shift, g[1] - lift];
  });
  const LID_H = 42;
  const lidTop = lidBase.map((p) => up(p, LID_H));

  // Label panel on the right-hand face of the box body. Text is skewed along
  // the same axis as that face so it sits flat on the box.
  const LABEL_W = 0.66;
  const LABEL_H = 0.62;
  const labelOrigin = add(bFront, [ex[0] * 0.15, ex[1] * 0.15], [0, -H * 0.16]);
  const labelTop = up(labelOrigin, H * LABEL_H);
  const isoText = `matrix(0.866,-0.5,0,1,${round(labelTop[0])},${round(labelTop[1])})`;

  // Very pale colourways would wash out against the backdrop, so the box takes
  // whichever of the product's colours has enough weight to read.
  const box = pickBoxColour(accent, overlay, upper);
  const bodyRight = darken(box, 0.16);
  const bodyLeft = darken(box, 0.34);
  const bodyTop = lighten(box, 0.06);
  const lidRight = darken(box, 0.08);
  const lidLeft = darken(box, 0.28);
  const lidTopFill = lighten(box, 0.14);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.55" y2="1">
      <stop offset="0" stop-color="${backdrop}"/>
      <stop offset="1" stop-color="${backdrop2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.44" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="rgba(0,0,0,0.26)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>

  <rect width="800" height="800" fill="url(#bg)"/>
  <ellipse cx="400" cy="400" rx="330" ry="270" fill="url(#glow)"/>
  <ellipse cx="418" cy="628" rx="230" ry="30" fill="url(#shadow)"/>

  <!-- box body -->
  <polygon points="${poly(bFront, bRight, tRight, tFront)}" fill="${bodyRight}"/>
  <polygon points="${poly(bFront, bLeft, tLeft, tFront)}" fill="${bodyLeft}"/>
  <polygon points="${poly(tFront, tRight, tBack, tLeft)}" fill="${bodyTop}"/>

  <!-- tissue paper peeking out when the lid is lifted -->
  ${angle === 2
    ? `<polygon points="${poly(up(tFront, 16), up(tRight, 10), up(tBack, 22), up(tLeft, 14))}"
        fill="${lighten(sole, 0.4)}" opacity="0.95"/>`
    : ''}

  <!-- label -->
  <polygon points="${poly(
    labelOrigin,
    add(labelOrigin, [ex[0] * LABEL_W, ex[1] * LABEL_W]),
    up(add(labelOrigin, [ex[0] * LABEL_W, ex[1] * LABEL_W]), H * LABEL_H),
    labelTop,
  )}" fill="${lighten(sole, 0.32)}" opacity="0.97"/>
  <g transform="${isoText}" fill="${darken(box, 0.62)}">
    <text x="16" y="24" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700"
          letter-spacing="2.5">${escapeXml(label.toUpperCase().slice(0, 11))}</text>
    <rect x="16" y="32" width="104" height="5" rx="2.5" opacity="0.32"/>
    <rect x="16" y="42" width="66" height="5" rx="2.5" opacity="0.22"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8]
      .map((i) => `<rect x="${16 + i * 7}" y="52" width="${i % 3 === 0 ? 4 : 2}" height="12" opacity="0.45"/>`)
      .join('\n    ')}
  </g>

  <!-- brand band across the body -->
  <polygon points="${poly(
    up(bFront, H * 0.16),
    up(bRight, H * 0.16),
    up(bRight, H * 0.26),
    up(bFront, H * 0.26),
  )}" fill="${overlay}" opacity="0.85"/>

  <!-- lid -->
  <polygon points="${poly(lidBase[0], lidBase[1], lidTop[1], lidTop[0])}" fill="${lidRight}"/>
  <polygon points="${poly(lidBase[0], lidBase[3], lidTop[3], lidTop[0])}" fill="${lidLeft}"/>
  <polygon points="${poly(lidTop[0], lidTop[1], lidTop[2], lidTop[3])}" fill="${lidTopFill}"/>
  <polygon points="${poly(
    add(lidTop[0], [(lidTop[1][0] - lidTop[0][0]) * 0.24, (lidTop[1][1] - lidTop[0][1]) * 0.24]),
    add(lidTop[0], [(lidTop[1][0] - lidTop[0][0]) * 0.76, (lidTop[1][1] - lidTop[0][1]) * 0.76]),
    add(lidTop[3], [(lidTop[2][0] - lidTop[3][0]) * 0.76, (lidTop[2][1] - lidTop[3][1]) * 0.76]),
    add(lidTop[3], [(lidTop[2][0] - lidTop[3][0]) * 0.24, (lidTop[2][1] - lidTop[3][1]) * 0.24]),
  )}" fill="${laces}" opacity="0.22"/>
</svg>
`;
}

/** Relative luminance, used to keep box colours from washing out. */
function luminance(hex) {
  const [r, g, b] = toRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function pickBoxColour(...candidates) {
  const usable = candidates.filter(Boolean).sort((a, b) => luminance(a) - luminance(b));
  const chosen = usable[0] || '#1b1b1f';
  return luminance(chosen) > 0.78 ? darken(chosen, 0.3) : chosen;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
}

function clampChannel(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((c) => clampChannel(c).toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex, amount) {
  return toHex(toRgb(hex).map((c) => c + (255 - c) * amount));
}

function darken(hex, amount) {
  return toHex(toRgb(hex).map((c) => c * (1 - amount)));
}

export function writeProductImages(slug, palette, label = '') {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = [];
  for (const angle of [1, 2]) {
    const file = `${slug}-${angle}.svg`;
    fs.writeFileSync(path.join(OUT_DIR, file), sneakerSvg({ ...palette, label, angle }));
    files.push(`/img/products/${file}`);
  }
  return files;
}

export function writeSiteImages() {
  const imgDir = path.join(ROOT, 'public', 'img');
  fs.mkdirSync(imgDir, { recursive: true });

  fs.writeFileSync(
    path.join(imgDir, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#0d0d0f"/>
  <path d="M14 40c4-2 8-6 12-9 3-2 6-2 9 0l4 3c2 1 5 2 8 2h3v6H14z" fill="#ff4b1f"/>
  <path d="M14 44h36v4a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2z" fill="#fff"/>
</svg>
`,
  );

  fs.writeFileSync(
    path.join(imgDir, 'placeholder.svg'),
    sneakerSvg({
      upper: '#d9d9de',
      overlay: '#c7c7ce',
      sole: '#f4f4f2',
      outsole: '#b9b9c0',
      laces: '#ffffff',
      accent: '#a8a8b0',
      backdrop: '#f1efec',
      backdrop2: '#e3e1dd',
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeSiteImages();
  console.log('Wrote site images.');
}
