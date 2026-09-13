// Sole Society — dependency-free Node HTTP server.
//   node server.js            start on PORT (default 3000)
//   npm run seed              load the demo catalogue

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { load, sessions } from './src/db.js';
import { ensureAdmin } from './src/auth.js';
import { route } from './src/router.js';
import { PUBLIC_DIR, safeJoin, serveFile, html, SECURITY_HEADERS } from './src/http.js';
import { errorPage } from './src/views/misc.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader so the app can be configured without extra tooling.
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnv();
load();

const created = ensureAdmin();
sessions.prune();

const STATIC_CACHE = 'public, max-age=86400';

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
      res.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD, POST' });
      return res.end();
    }

    const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

    // Static assets first — they are the hottest path.
    if (/^\/(css|js|img)\//.test(pathname)) {
      const target = safeJoin(PUBLIC_DIR, pathname);
      if (target && (await serveFile(req, res, target, { cache: STATIC_CACHE }))) return;
    }

    await route(req, res);
  } catch (err) {
    console.error(`[error] ${req.method} ${req.url}:`, err);
    if (!res.headersSent) {
      const status = err.status || 500;
      html(req, res, errorPage(), status);
    } else {
      res.end();
    }
  } finally {
    if (process.env.LOG_REQUESTS === 'true') {
      console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

server.headersTimeout = 20000;
server.requestTimeout = 30000;

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`\n  Sole Society running at http://localhost:${port}`);
  console.log(`  Seller dashboard:      http://localhost:${port}/admin`);
  if (created) {
    console.log(`\n  Dashboard login created:`);
    console.log(`    username: ${created.username}`);
    console.log(`    password: ${created.password}${created.generated ? '  (generated — save it now)' : ''}\n`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
