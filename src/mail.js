// Outgoing email.
//
// If SMTP is configured the message is delivered with a tiny built-in SMTP
// client (no dependencies). If it is not configured — the normal case for a
// local install — every message is appended to data/outbox.log so the seller
// still has a record, and the order itself is never lost.

import net from 'node:net';
import tls from 'node:tls';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const OUTBOX = path.join(DATA_DIR, 'outbox.log');

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  const message = { to, subject, text, html, replyTo, at: new Date().toISOString() };
  if (!mailConfigured()) return logToOutbox(message, 'smtp-not-configured');
  try {
    await smtpSend(message);
    return { delivered: true, via: 'smtp' };
  } catch (err) {
    console.error('[mail] SMTP delivery failed:', err.message);
    return logToOutbox(message, `smtp-error: ${err.message}`);
  }
}

async function logToOutbox(message, reason) {
  const entry = [
    '='.repeat(72),
    `date:    ${message.at}`,
    `reason:  ${reason}`,
    `to:      ${message.to}`,
    `subject: ${message.subject}`,
    '-'.repeat(72),
    message.text,
    '',
  ].join('\n');
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.appendFile(OUTBOX, entry);
  } catch (err) {
    console.error('[mail] could not write outbox:', err.message);
  }
  return { delivered: false, via: 'outbox', reason };
}

function buildMime({ from, to, subject, text, html, replyTo }) {
  const boundary = `=_ss_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  if (!html) {
    headers.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '');
    return `${headers.join('\r\n')}\r\n${normaliseBody(text)}`;
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '');
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normaliseBody(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normaliseBody(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return `${headers.join('\r\n')}\r\n${body}`;
}

function encodeHeader(value) {
  // RFC 2047 encode when the subject is not plain ASCII (åäö in sneaker names).
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function normaliseBody(body) {
  // CRLF line endings, and dot-stuffing so a line of "." cannot end DATA early.
  return String(body).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function smtpSend(message) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const fromAddress = (from.match(/<([^>]+)>/) || [null, from])[1];

  return new Promise((resolve, reject) => {
    let socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    let buffer = '';
    let pending = null;
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), 20000);

    function fail(err) {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    }

    function attach(sock) {
      sock.setEncoding('utf8');
      sock.on('data', onData);
      sock.on('error', fail);
    }

    function onData(chunk) {
      buffer += chunk;
      const lines = buffer.split('\r\n');
      // A reply is complete when the last full line is "NNN <space>".
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const reply = { code: Number(lines[i].slice(0, 3)), text: lines.slice(0, i + 1).join('\n') };
          buffer = lines.slice(i + 1).join('\r\n');
          const handler = pending;
          pending = null;
          if (handler) handler(reply);
          return;
        }
      }
    }

    const expect = (codes) =>
      new Promise((res, rej) => {
        pending = (reply) => {
          if (codes.includes(reply.code)) res(reply);
          else rej(new Error(`SMTP ${reply.code}: ${reply.text.split('\n')[0]}`));
        };
      });

    const send = (line, codes) => {
      const wait = expect(codes);
      socket.write(`${line}\r\n`);
      return wait;
    };

    attach(socket);

    (async () => {
      await expect([220]);
      let ehlo = await send(`EHLO ${hostname()}`, [250]);

      if (!secure && /STARTTLS/i.test(ehlo.text)) {
        await send('STARTTLS', [220]);
        socket.removeAllListeners('data');
        socket.removeAllListeners('error');
        socket = tls.connect({ socket, servername: host });
        attach(socket);
        await new Promise((res, rej) => {
          socket.once('secureConnect', res);
          socket.once('error', rej);
        });
        ehlo = await send(`EHLO ${hostname()}`, [250]);
      }

      if (user && pass) {
        await send('AUTH LOGIN', [334]);
        await send(Buffer.from(user).toString('base64'), [334]);
        await send(Buffer.from(pass).toString('base64'), [235]);
      }

      await send(`MAIL FROM:<${fromAddress}>`, [250]);
      await send(`RCPT TO:<${message.to}>`, [250, 251]);
      await send('DATA', [354]);
      await send(`${buildMime({ ...message, from })}\r\n.`, [250]);
      socket.write('QUIT\r\n');
      clearTimeout(timer);
      socket.end();
      resolve();
    })().catch(fail);
  });
}

function hostname() {
  try {
    return new URL(process.env.SITE_URL || 'http://localhost').hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}
