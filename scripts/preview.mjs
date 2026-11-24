import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import worker from '../dist/server/index.js';
import { localDatabase } from './local-db.mjs';

const port = Number(process.env.EXHIBITION_PREVIEW_PORT || 4177);
const origin = `http://127.0.0.1:${port}`;
const session = randomBytes(24).toString('hex');
const local = new URL('../.local/', import.meta.url);
await mkdir(local, { recursive: true });
const adminEmail = 'administrator@exhibition.local';
const previewPassword = process.env.EXHIBITION_PREVIEW_PASSWORD || randomBytes(9).toString('base64url');
const env = {
  DB: localDatabase(fileURLToPath(new URL('votes.sqlite', local))),
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: previewPassword,
  ADMIN_SESSION_KEY: randomBytes(32).toString('hex'),
};

const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.headers.host !== `127.0.0.1:${port}`) {
      outgoing.writeHead(403).end();
      return;
    }
    const url = new URL(incoming.url, origin);
    if (url.origin !== origin) {
      outgoing.writeHead(400).end();
      return;
    }
    if (url.pathname === '/signin-with-chatgpt' && incoming.method === 'GET') {
      outgoing.writeHead(303, { Location: '/admin', 'Set-Cookie': `exhibition-admin=${session}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store' }).end();
      return;
    }

    const headers = new Headers(incoming.headers);
    headers.delete('oai-authenticated-user-id');
    headers.delete('oai-authenticated-user-email');
    if ((incoming.headers.cookie || '').split(/;\s*/).includes(`exhibition-admin=${session}`)) {
      headers.set('oai-authenticated-user-id', 'local-preview');
      headers.set('oai-authenticated-user-email', adminEmail);
    }
    const options = { method: incoming.method, headers };
    if (!['GET', 'HEAD'].includes(incoming.method)) Object.assign(options, { body: Readable.toWeb(incoming), duplex: 'half' });
    const response = await worker.fetch(new Request(url, options), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).on('error', () => outgoing.destroy()).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end('预览服务暂不可用。');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`展厅本机预览 ${origin}`);
  console.log(`本机预览管理员密码 ${previewPassword}`);
});
