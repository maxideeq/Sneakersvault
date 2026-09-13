// Seeds a demo catalogue so the store is browsable from the first run.
//   npm run seed            fills an empty database
//   npm run reset           wipes products/brands/orders and reseeds

import { load, db, replaceAll, save } from '../src/db.js';
import { slugify } from '../src/util.js';
import { writeProductImages, writeSiteImages } from './images.js';

const FORCE = process.argv.includes('--force');

const BRANDS = [
  ['Nike', 'The backbone of any collection — Dunks, Air Force 1s and Air Max in the colourways that move.'],
  ['Jordan', 'Retro Air Jordans in the OG colourways, verified pair by pair.'],
  ['Adidas', 'Terrace classics: Samba, Campus, Gazelle and the collabs worth chasing.'],
  ['New Balance', 'From the 550 to the 990 — the comfort grails that never sit long.'],
  ['ASICS', 'Gel technology and archive running silhouettes back in rotation.'],
  ['Puma', 'Motorsport heritage and low-profile silhouettes with serious momentum.'],
  ['Salomon', 'Technical trail shoes that took over the city.'],
];

/* [name, brand, sku, price, colorway, category, condition, year, tags, palette, stockRun, description] */
const PRODUCTS = [
  ['Dunk Low Retro', 'Nike', 'DD1391-100', 1499, 'White/Black "Panda"', 'Lifestyle', 'Deadstock (DS)', 2021,
    ['featured', 'popular', 'new'],
    { upper: '#f5f5f3', overlay: '#1b1b1f', sole: '#ffffff', outsole: '#d8d8d6', laces: '#ffffff', accent: '#1b1b1f', backdrop: '#f0eeea', backdrop2: '#dedbd5' },
    { 40: 2, 41: 5, 42: 0, 43: 3, 44: 1, 45: 2, 46: 0 },
    'The pair that never stopped selling. Crisp white leather base with black overlays, deadstock in the original box with both sets of laces. Inspected and legit checked in-house.'],

  ['Air Force 1 ’07', 'Nike', 'CW2288-111', 1299, 'Triple White', 'Lifestyle', 'Deadstock (DS)', 2023,
    ['featured'],
    { upper: '#fbfbf9', overlay: '#efefec', sole: '#ffffff', outsole: '#dedede', laces: '#ffffff', accent: '#e6e6e2', backdrop: '#eeece8', backdrop2: '#dcd9d3' },
    { 39: 1, 40: 3, 41: 4, 42: 6, 43: 4, 44: 2, 45: 1 },
    'The everyday staple in triple white. Full-grain leather upper, Air cushioning, and a silhouette that goes with everything. Brand new, never worn.'],

  ['Air Max 90', 'Nike', 'CN8490-100', 1599, 'White/Particle Grey/Infrared', 'Running', 'Deadstock (DS)', 2020,
    ['popular'],
    { upper: '#f2f1ee', overlay: '#b9bcc4', sole: '#ffffff', outsole: '#c9ccd2', laces: '#ffffff', accent: '#e0452a', backdrop: '#efeeeb', backdrop2: '#dcdad6' },
    { 41: 2, 42: 2, 43: 1, 44: 3, 45: 1 },
    'Infrared hits on the classic 90 chassis. Visible Air unit, layered mesh and suede upper, unworn with the original box.'],

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

  ['Samba OG', 'Adidas', 'B75806', 1399, 'Cloud White/Core Black/Clear Granite', 'Lifestyle', 'Deadstock (DS)', 2023,
    ['featured', 'popular', 'new'],
    { upper: '#f7f6f2', overlay: '#1b1b1f', sole: '#efe6d2', outsole: '#c9b98f', laces: '#f4f2ec', accent: '#1b1b1f', backdrop: '#f0eee9', backdrop2: '#ddd9d1' },
    { 39: 1, 40: 4, 41: 5, 42: 4, 43: 3, 44: 2, 45: 1 },
    'The silhouette of the moment. Leather upper, suede T-toe and a gum sole that goes with anything. Deadstock, full size run available.'],

  ['Campus 00s', 'Adidas', 'HQ8708', 1299, 'Core Black/Off White', 'Lifestyle', 'Deadstock (DS)', 2023,
    ['new'],
    { upper: '#22222a', overlay: '#2c2c36', sole: '#f4f2ec', outsole: '#ddd9cf', laces: '#f4f2ec', accent: '#f4f2ec', backdrop: '#eceae5', backdrop2: '#d8d5cf' },
    { 40: 2, 41: 3, 42: 2, 43: 2, 44: 1 },
    'Chunky suede Campus in black with off-white three stripes. Unworn, original box included.'],

  ['Gazelle Bold', 'Adidas', 'IE0428', 1249, 'Lucid Pink/Core White', 'Lifestyle', 'Deadstock (DS)', 2024,
    ['new'],
    { upper: '#e8a5bd', overlay: '#f2c6d6', sole: '#fbfbf8', outsole: '#e2ded6', laces: '#fbfbf8', accent: '#fbfbf8', backdrop: '#f6eef0', backdrop2: '#e6dade' },
    { 36: 1, 37: 2, 38: 3, 39: 2, 40: 2, 41: 1 },
    'Platform Gazelle in the pink everyone is after. Suede upper, raised rubber sole. Brand new.'],

  ['Superstar', 'Adidas', 'EG4958', 1099, 'Cloud White/Core Black', 'Lifestyle', 'Used — Excellent', 2019,
    [],
    { upper: '#f8f8f5', overlay: '#1b1b1f', sole: '#f6f6f3', outsole: '#d7d7d4', laces: '#ffffff', accent: '#1b1b1f', backdrop: '#efefec', backdrop2: '#dcdcd8' },
    { 41: 1, 42: 2, 43: 1, 44: 1 },
    'Worn a handful of times, cleaned and ready to go. Light creasing on the toe box, shell toe is perfect. No box.'],

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

  ['Speedcat OG', 'Puma', '398846-01', 1199, 'Puma Black/Puma White', 'Lifestyle', 'Deadstock (DS)', 2024,
    ['new'],
    { upper: '#1d1d22', overlay: '#26262c', sole: '#f5f5f2', outsole: '#cfcfcc', laces: '#efefec', accent: '#f5f5f2', backdrop: '#ebebe9', backdrop2: '#d7d7d5' },
    { 37: 2, 38: 2, 39: 3, 40: 2, 41: 2, 42: 1 },
    'Low-profile motorsport silhouette with a suede upper. Runs slim — consider sizing up half a size.'],

  ['Palermo', 'Puma', '396463-04', 1249, 'Vine/Puma White', 'Lifestyle', 'Deadstock (DS)', 2024,
    [],
    { upper: '#cfe0c0', overlay: '#b6cfa3', sole: '#f7f5ee', outsole: '#ddd8c9', laces: '#f7f5ee', accent: '#4f7a43', backdrop: '#f0f2ea', backdrop2: '#dde0d4' },
    { 39: 1, 40: 2, 41: 2, 42: 2, 43: 1 },
    'Terrace-style Palermo in vine green suede. Gum sole, brand new with box.'],

  ['XT-6', 'Salomon', 'L41086600', 2399, 'Black/Phantom', 'Trail', 'Deadstock (DS)', 2023,
    ['featured', 'popular'],
    { upper: '#25252b', overlay: '#33333b', sole: '#e9e9e7', outsole: '#b6b6b8', laces: '#4a4a54', accent: '#f05a28', backdrop: '#ebebeb', backdrop2: '#d7d7d8' },
    { 41: 1, 42: 2, 43: 2, 44: 2, 45: 1 },
    'The technical trail shoe that became a city staple. Quicklace system, Contagrip outsole, deadstock.'],

  ['ACS Pro', 'Salomon', 'L47179600', 2799, 'Vanilla Ice/Almond Milk', 'Trail', 'Deadstock (DS)', 2024,
    ['new'],
    { upper: '#e9e2d4', overlay: '#d6cdbb', sole: '#f7f4ed', outsole: '#cfc9bd', laces: '#cfc6b4', accent: '#8a8478', backdrop: '#f3f0e9', backdrop2: '#e1ddd3' },
    { 41: 1, 42: 1, 43: 2, 44: 1 },
    'Chunky ACS Pro in a neutral cream colourway. Agile Chassis System, Sensifit upper. Brand new in box.'],

  ['Air Max 1', 'Nike', 'FD9082-107', 1799, 'White/University Red/Neutral Grey', 'Running', 'Deadstock (DS)', 2023,
    ['new'],
    { upper: '#f3f2ef', overlay: '#c7c9cd', sole: '#ffffff', outsole: '#cfd1d5', laces: '#ffffff', accent: '#c8102e', backdrop: '#eeedea', backdrop2: '#dbdad6' },
    { 40: 1, 41: 2, 42: 2, 43: 2, 44: 1, 45: 1 },
    'The original Air Max in its most recognisable colourway. Deadstock, box in perfect condition.'],
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
    const slug = slugify(`${brandName} ${name} ${colorway.split('/')[0]}`);
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
      createdAt: new Date(now - (PRODUCTS.length - i) * 43200000).toISOString(),
      updatedAt: new Date(now - (PRODUCTS.length - i) * 43200000).toISOString(),
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
