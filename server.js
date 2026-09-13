// Sole Society — Node HTTP server backed by Postgres.
//   node server.js            start on PORT (default 3000)
//   npm run seed              load the demo catalogue

import http from 'node:http';

import { loadEnv } from './src/env.js';

loadEnv(); // must run before db.js reads DATABASE_URL

const { load, sessions, close } = await import('./src/db.js');
const { ensureAdmin } = await import('./src/auth.js');
const { route } = await import('./src/router.js');
const { PUBLIC_DIR, safeJoin, serveFile, html, SECURITY_HEADERS } = await import('./src/http.js');
const { errorPage } = await import('./src/views/misc.js');


try {
  await load();
} catch (err) {
  console.error(`\n  Could not reach the database: ${err.message}`);
  console.error('  Check DATABASE_URL, then start again.\n');
  process.exit(1);
}

const created = await ensureAdmin();
await sessions.prune();

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
    server.close(async () => {
      await close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
