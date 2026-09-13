// Seeds a demo catalogue so the store is browsable from the first run.
//   npm run seed            fills an empty database
//   npm run reset           wipes products/brands/orders and reseeds

import { load, db, replaceAll, save } from '../src/db.js';
import { slugify } from '../src/util.js';
import { clearProductImages, writeProductImages, writeSiteImages } from './images.js';

const FORCE = process.argv.includes('--force');

const BRANDS = [
  ['Nike', 'Air Max Plus in the colourways that move — from the OG Hyper Blue to the latest Sunset.'],
  ['Jordan', 'Retro Air Jordans in the OG colourways, verified pair by pair.'],
  ['New Balance', 'From the 550 to the 990 — the comfort grails that never sit long.'],
  ['ASICS', 'Gel technology and archive running silhouettes back in rotation.'],
];

/* [name, brand, sku, price, colorway, category, condition, year, tags, palette, stockRun, description] */
const PRODUCTS = [
  ['Air Max Plus "White"', 'Nike', '604133-102', 2099, 'White/White/Pure Platinum', 'Lifestyle', 'Deadstock (DS)', 2023,
    ['featured', 'popular'],
    { upper: '#f7f7f4', overlay: '#c9ccd2', sole: '#ffffff', outsole: '#dcdcda', laces: '#ffffff', accent: '#9aa0a8', backdrop: '#f1efec', backdrop2: '#dedbd6' },
    { 40: 1, 41: 3, 42: 4, 43: 3, 44: 2, 45: 1, 46: 0 },
    'The cleanest TN there is. White mesh under the signature wavy cage, Tuned Air in the heel and a full-length Air unit underfoot. Deadstock in the original box.'],

  ['Air Max Plus "Triple Black"', 'Nike', '604133-050', 1999, 'Black/Black/Dark Grey', 'Lifestyle', 'Deadstock (DS)', 2022,
    ['featured', 'popular'],
    { upper: '#1c1c20', overlay: '#26262b', sole: '#2a2a30', outsole: '#151517', laces: '#2f2f36', accent: '#3a3a42', backdrop: '#edecea', backdrop2: '#d9d7d4' },
    { 40: 2, 41: 2, 42: 5, 43: 4, 44: 3, 45: 2, 46: 1 },
    'Blacked-out from the mudguard to the outsole. The one pair that goes with everything and never shows a scuff. Brand new, never worn.'],

  ['Air Max Plus "Sunset"', 'Nike', 'FD0670-800', 2299, 'Sunset/Pink Glow/Magma Orange', 'Lifestyle', 'Deadstock (DS)', 2024,
    ['featured', 'new'],
    { upper: '#f26b3a', overlay: '#d9365a', sole: '#ffffff', outsole: '#e7e3dd', laces: '#ffffff', accent: '#ff8a3d', backdrop: '#fdf0e8', backdrop2: '#f5ded2' },
    { 41: 1, 42: 2, 43: 2, 44: 1, 45: 1 },
    'The 2024 Sunset gradient — magma orange fading into pink glow across the mesh. One of the loudest TNs of the year and it sold out everywhere. Deadstock with the original box.'],

  ['Air Max Plus "Black Racer Blue"', 'Nike', 'DM0032-004', 2199, 'Black/Racer Blue', 'Lifestyle', 'Deadstock (DS)', 2023,
    ['new'],
    { upper: '#17213f', overlay: '#1b3fd1', sole: '#f2f2f0', outsole: '#c8c8ca', laces: '#20242e', accent: '#2f6bff', backdrop: '#eceef4', backdrop2: '#d8dce6' },
    { 40: 1, 41: 2, 42: 3, 43: 2, 44: 2, 45: 0, 46: 1 },
    'Black base with racer blue running through the cage and the Tuned Air heel clip. Subtle until the light catches it. Unworn, box included.'],

  ['Air Max Plus "OG Hyper Blue"', 'Nike', '604133-139', 2799, 'OG Hyper Blue/Black/White', 'Lifestyle', 'Deadstock (DS)', 2024,
    ['featured', 'popular', 'new'],
    { upper: '#1e63c8', overlay: '#14418f', sole: '#f5f3ee', outsole: '#cfcdc7', laces: '#e9e7e1', accent: '#2f9ae0', backdrop: '#eaf0f8', backdrop2: '#d6dfee' },
    { 41: 1, 42: 1, 43: 2, 44: 1, 45: 1, 46: 0 },
    'The colourway that started the whole TN obsession, back on the original tooling — the blue-to-black gradient, the palm-tree cage and the sunset-inspired heel. The grail of the lineup.'],

  ['Air Max Plus "Sail Pure Platinum"', 'Nike', 'FZ4623-100', 2149, 'Sail/Pure Platinum/Metallic Silver', 'Lifestyle', 'Deadstock (DS)', 2024,
    ['new'],
    { upper: '#efe9dd', overlay: '#c3c6cb', sole: '#f7f4ed', outsole: '#d6d2cb', laces: '#e8e2d6', accent: '#8f949b', backdrop: '#f2efe9', backdrop2: '#e0dcd4' },
    { 40: 2, 41: 2, 42: 3, 43: 3, 44: 2, 45: 1 },
    'Warm sail mesh with pure platinum overlays and metallic silver detailing on the cage. The quiet, wearable end of the TN range. Deadstock in box.'],

  ['Air Jordan 1 Retro High OG', 'Jordan', '555088-101', 3499, 'White/Black/Varsity Red "Chicago"', 'Basketball', 'Deadstock (DS)', 2022,
    ['featured', 'popular'],
    { upper: '#f6f5f2', overlay: '#d22630', sole: '#ffffff', outsole: '#d6d6d4', laces: '#d22630', accent: '#1b1b1f', backdrop: '#f2efe9', backdrop2: '#e0dcd3' },
    { 41: 1, 42: 1, 43: 2, 44: 1, 45: 0 },
    'The grail colourway, reissued on the Lost & Found tooling. Aged midsole, cracked Wings logo and a yellowed Nike Air label — deadstock with the special edition box.'],

  ['Air Jordan 4 Retro', 'Jordan', '308497-060', 4299, 'Black/Cement Grey "Bred"', 'Basketball', 'Very Near Deadstock (VNDS)', 2019,
    ['popular'],
    { upper: '#1f1f23', overlay: '#2c2c31', sole: '#f2f2f0', outsole: '#c2c2c4', laces: '#e8e8e6', accent: '#c8102e', backdrop: '#e9e7e3', backdrop2: '#d4d1cb' },
    { 42: 1, 43: 1, 44: 2, 45: 1, 46: 1 },
    'Tried on indoors twice, no creasing and no sole wear. Comes with the original box and hangtag. Photos of the exact pair available on request.'],

  ['Air Jordan 1 Mid', 'Jordan', 'DQ8426-106', 1899, 'White/Gym Red/Black', 'Basketball', 'Deadstock (DS)', 2023,
    ['new'],
    { upper: '#f7f6f3', overlay: '#c8102e', sole: '#ffffff', outsole: '#d9d9d7', laces: '#ffffff', accent: '#1b1b1f', backdrop: '#f1efeb', backdrop2: '#dfdcd6' },
    { 38: 2, 39: 2, 40: 3, 41: 2, 42: 1, 43: 0 },
    'Clean Mid in the classic red and white blocking. Brand new in box, perfect first Jordan or a safe gift.'],

  ['550', 'New Balance', 'BB550WT1', 1699, 'White/Green', 'Lifestyle', 'Deadstock (DS)', 2022,
    ['featured', 'popular'],
    { upper: '#f6f6f2', overlay: '#e4e4df', sole: '#fbfbf8', outsole: '#d5d5d0', laces: '#ffffff', accent: '#2f7d4f', backdrop: '#eef0ec', backdrop2: '#dbded8' },
    { 40: 2, 41: 3, 42: 2, 43: 3, 44: 2, 45: 1 },
    'The 550 that restarted the whole basketball revival. Leather upper with green accents, deadstock in box.'],

  ['2002R', 'New Balance', 'M2002RXJ', 2199, 'Protection Pack — Rain Cloud', 'Running', 'Deadstock (DS)', 2023,
    ['popular', 'new'],
    { upper: '#9ea0a5', overlay: '#7d8087', sole: '#e7e6e2', outsole: '#b9b9b7', laces: '#c9cacd', accent: '#5c5f66', backdrop: '#eceded', backdrop2: '#d8dadb' },
    { 41: 1, 42: 2, 43: 2, 44: 1, 45: 1 },
    'Deconstructed Protection Pack styling with N-ergy cushioning. Comfortable enough for all day, still one of the best-looking greys out there.'],

  ['990v6', 'New Balance', 'U990GL6', 2599, 'Grey/White', 'Running', 'Deadstock (DS)', 2023,
    [],
    { upper: '#a9a9ad', overlay: '#8d8d93', sole: '#f0efeb', outsole: '#c4c4c2', laces: '#d6d6d8', accent: '#5f5f66', backdrop: '#eeeeec', backdrop2: '#dadad7' },
    { 42: 1, 43: 1, 44: 2, 45: 1, 46: 1 },
    'Made in USA flagship. Pigskin suede and mesh upper on FuelCell cushioning. Deadstock with box and spare laces.'],

  ['Gel-Kayano 14', 'ASICS', '1201A019-105', 1799, 'Cream/Pure Silver', 'Running', 'Deadstock (DS)', 2023,
    ['popular', 'new'],
    { upper: '#efeae0', overlay: '#cfcbc2', sole: '#fbfaf6', outsole: '#cccac5', laces: '#e9e5dc', accent: '#9aa3ad', backdrop: '#f2efe9', backdrop2: '#e0dcd4' },
    { 40: 1, 41: 2, 42: 3, 43: 2, 44: 1, 45: 0 },
    'The Y2K runner that took over. Cream and silver mesh with GEL cushioning in the heel. Brand new in box.'],

  ['Gel-Lyte III OG', 'ASICS', '1201A052-020', 1399, 'Black/Black', 'Lifestyle', 'Deadstock (DS)', 2022,
    [],
    { upper: '#212127', overlay: '#2f2f37', sole: '#ececea', outsole: '#bcbcbd', laces: '#3a3a42', accent: '#5b5b66', backdrop: '#eaeaea', backdrop2: '#d6d6d7' },
    { 41: 1, 42: 1, 43: 2, 44: 1 },
    'Split tongue classic in triple black. Suede and mesh upper, unworn.'],
];

function build() {
  const now = Date.now();
  const brands = BRANDS.map(([name, description], i) => ({
    id: `b_${slugify(name)}`,
    name,
    slug: slugify(name),
    description,
    createdAt: new Date(now - (BRANDS.length - i) * 86400000).toISOString(),
  }));

  const products = PRODUCTS.map((entry, i) => {
    const [name, brandName, sku, price, colorway, category, condition, releaseYear, tags, palette, stock, description] = entry;
    const brand = brands.find((b) => b.name === brandName);
    const slug = slugify(`${brandName} ${name}`);
    const images = writeProductImages(slug, palette, brandName);
    return {
      id: `p_${slug}`,
      slug,
      name,
      brandId: brand.id,
      sku,
      price,
      colorway,
      category,
      condition,
      releaseYear,
      description,
      images,
      sizes: Object.entries(stock).map(([size, count]) => ({
        size,
        stock: count,
        reserved: 0,
        available: count > 0,
      })),
      featured: tags.includes('featured'),
      popular: tags.includes('popular'),
      newArrival: tags.includes('new'),
      active: true,
      salesCount: tags.includes('popular') ? 12 - i : Math.max(0, 6 - i),
      // First in the list = most recently listed, so the array reads newest-first.
      createdAt: new Date(now - (i + 1) * 43200000).toISOString(),
      updatedAt: new Date(now - (i + 1) * 43200000).toISOString(),
    };
  });

  return { brands, products };
}

load();
const state = db();

if (state.products.length && !FORCE) {
  console.log(`Database already holds ${state.products.length} products. Use "npm run reset" to replace them.`);
  process.exit(0);
}

writeSiteImages();
clearProductImages();
const { brands, products } = build();

if (FORCE) {
  state.orders = [];
  state.notifications = [];
  state.counters.order = 10023;
}
state.brands = brands;
state.products = products;

await replaceAll(state);
await save();

console.log(`Seeded ${brands.length} brands and ${products.length} sneakers.`);
console.log('Product imagery written to public/img/products/.');
