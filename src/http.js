// Request/response plumbing: static files, body parsing, security headers.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
};

export function send(req, res, status, body, headers = {}) {
  const base = { ...SECURITY_HEADERS, ...headers };
  let payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''));
  const type = base['Content-Type'] || '';
  const compressible = /text\/|json|javascript|svg|xml/.test(type);
  const accepts = String(req.headers['accept-encoding'] || '');

  if (compressible && payload.length > 1024 && /\bgzip\b/.test(accepts)) {
    payload = zlib.gzipSync(payload, { level: 6 });
    base['Content-Encoding'] = 'gzip';
    base.Vary = base.Vary ? `${base.Vary}, Accept-Encoding` : 'Accept-Encoding';
  }
  base['Content-Length'] = payload.length;
  res.writeHead(status, base);
  if (req.method === 'HEAD') return res.end();
  res.end(payload);
}

export const html = (req, res, body, status = 200, headers = {}) =>
  send(req, res, status, body, { 'Content-Type': MIME['.html'], ...headers });

export const json = (req, res, data, status = 200, headers = {}) =>
  send(req, res, status, JSON.stringify(data), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...headers });

export function redirect(res, location, status = 303) {
  res.writeHead(status, { ...SECURITY_HEADERS, Location: location });
  res.end();
}

/** Serve a file from disk with caching + range-free simplicity. */
export async function serveFile(req, res, filePath, { cache = 'public, max-age=3600' } = {}) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cache });
    return res.end(), true;
  }
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
    ETag: etag,
    'Content-Length': stat.size,
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(filePath).pipe(res);
  return true;
}

/** Reject traversal attempts before touching the filesystem. */
export function safeJoin(baseDir, relative) {
  const target = path.resolve(baseDir, `.${path.posix.normalize(`/${relative}`)}`);
  return target.startsWith(path.resolve(baseDir)) ? target : null;
}

const MAX_BODY = 12 * 1024 * 1024; // 12 MB, enough for a product photo

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Parse a request body into { fields, files }.
 * Supports urlencoded, JSON and multipart/form-data.
 */
export async function parseBody(req) {
  const type = String(req.headers['content-type'] || '');
  const raw = await readBody(req);
  if (type.includes('application/json')) {
    try {
      return { fields: JSON.parse(raw.toString('utf8') || '{}'), files: [] };
    } catch {
      return { fields: {}, files: [], invalid: true };
    }
  }
  if (type.includes('multipart/form-data')) {
    const boundary = (type.match(/boundary=(?:"([^"]+)"|([^;]+))/) || [])[1] ||
      (type.match(/boundary=(?:"([^"]+)"|([^;]+))/) || [])[2];
    return boundary ? parseMultipart(raw, boundary.trim()) : { fields: {}, files: [] };
  }
  return { fields: parseQuery(raw.toString('utf8')), files: [] };
}

/** Query/urlencoded parser that collects repeated keys into arrays. */
export function parseQuery(input) {
  const params = new URLSearchParams(input);
  const out = {};
  for (const [key, value] of params) {
    const name = key.endsWith('[]') ? key.slice(0, -2) : key;
    if (out[name] === undefined) out[name] = key.endsWith('[]') ? [value] : value;
    else if (Array.isArray(out[name])) out[name].push(value);
    else out[name] = [out[name], value];
  }
  return out;
}

function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let index = buffer.indexOf(delimiter);
  if (index === -1) return { fields, files };

  while (index !== -1) {
    const start = index + delimiter.length;
    if (buffer.slice(start, start + 2).toString() === '--') break; // closing boundary
    const headerEnd = buffer.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(start, headerEnd).toString('utf8');
    const next = buffer.indexOf(delimiter, headerEnd);
    const bodyEnd = next === -1 ? buffer.length : next - 2; // strip trailing CRLF
    const content = buffer.slice(headerEnd + 4, bodyEnd);

    const nameMatch = headerText.match(/name="([^"]*)"/i);
    const fileMatch = headerText.match(/filename="([^"]*)"/i);
    const typeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
    const rawName = nameMatch ? nameMatch[1] : '';
    const name = rawName.endsWith('[]') ? rawName.slice(0, -2) : rawName;

    if (fileMatch && fileMatch[1]) {
      files.push({ field: name, filename: fileMatch[1], type: typeMatch ? typeMatch[1].trim() : '', data: content });
    } else if (name) {
      const value = content.toString('utf8');
      if (fields[name] === undefined) fields[name] = rawName.endsWith('[]') ? [value] : value;
      else if (Array.isArray(fields[name])) fields[name].push(value);
      else fields[name] = [fields[name], value];
    }
    index = next;
  }
  return { fields, files };
}

/** Best-effort client IP, honouring a single proxy hop. */
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

/** Block cross-site form posts (defence in depth alongside CSRF tokens). */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // classic form posts may omit Origin
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
