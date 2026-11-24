import { artworks, artworkByBoard, artworkLabel, votesPerStudent } from './artworks.js';
import { assets } from './assets.js';

const jsonHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const pageSize = 100;
const studentBallot = 'SELECT 1 FROM ballots WHERE student_id = ? COLLATE NOCASE';
const artworkRemaps = artworks.flatMap(art => art.boards.slice(1).map(board => `WHEN ${board} THEN ${art.id}`));
const countArtwork = artworkRemaps.length ? `CASE json_each.value ${artworkRemaps.join(' ')} ELSE json_each.value END` : 'json_each.value';
const adminCookie = 'exhibition-admin-unlock';
const adminLifetime = 8 * 60 * 60;
const encoder = new TextEncoder();

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { ...jsonHeaders, ...headers } });
}

function reject(error, status, extra = {}) {
  return json({ error, ...extra }, status);
}

function file(path, method) {
  const asset = assets[path];
  if (!asset) return new Response('页面不存在', { status: 404 });
  const [kind, encoded] = asset;
  const headers = {
    'Content-Type': kind,
    'Cache-Control': path.startsWith('/art/') ? 'public, max-age=3600' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'",
  };
  return new Response(method === 'HEAD' ? null : Uint8Array.from(atob(encoded), char => char.charCodeAt(0)), { headers });
}

async function votingIsOpen(db) {
  const row = await db.prepare('SELECT voting_open FROM exhibition_settings WHERE id = 1').first();
  return row?.voting_open !== 0;
}

async function body(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('格式无效。');
  if (!request.body) throw new Error('请填写提交内容。');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let content = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new Error('提交内容过长。');
    }
    content += decoder.decode(value, { stream: true });
  }
  try {
    const payload = JSON.parse(content + decoder.decode());
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    return payload;
  } catch {
    throw new Error('提交内容格式有误。');
  }
}

function normalizeChoices(choices) {
  return [...new Set(choices.map(id => artworkByBoard.get(id).id))].sort((left, right) => left - right);
}

async function castBallot(request, db) {
  let payload;
  try { payload = await body(request); }
  catch (error) { return reject(error.message, 400); }

  const studentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : '';
  const requestId = typeof payload.ballotId === 'string' ? payload.ballotId : '';
  const choices = payload.choices;
  if (!studentId || studentId.length > 64 || /[\x00-\x1f\x7f]/.test(studentId)) return reject('请输入有效学号。', 400);
  if (!idPattern.test(requestId)) return reject('选票编号无效，请刷新页面后重试。', 400);
  if (!Array.isArray(choices) || !choices.length || choices.length > artworkByBoard.size ||
    choices.some(id => !artworkByBoard.has(id)) || new Set(choices).size !== choices.length) {
    return reject('请选择有效且不同的作品。', 400);
  }

  const selected = normalizeChoices(choices);
  const selection = JSON.stringify(selected);
  const saved = await db.prepare(`
    INSERT INTO ballots (request_id, student_id, choices, submitted_at)
    SELECT ?, ?, ?, ? WHERE COALESCE((SELECT voting_open FROM exhibition_settings WHERE id = 1), 1) = 1
      AND ? <= ?
      AND NOT EXISTS (${studentBallot})
    ON CONFLICT(request_id) DO NOTHING
  `).bind(requestId, studentId, selection, new Date().toISOString(), selected.length, votesPerStudent, studentId).run();
  if (saved.meta.changes === 1) return json({ accepted: true }, 201);

  const existing = await db.prepare('SELECT student_id, choices FROM ballots WHERE request_id = ?').bind(requestId).first();
  if (existing?.student_id === studentId && JSON.stringify(normalizeChoices(JSON.parse(existing.choices))) === selection) return json({ accepted: true });
  if (existing) return reject('选票编号已使用，请刷新页面后重试。', 409);
  if (selected.length > votesPerStudent) return reject(`每张选票最多选择 ${votesPerStudent} 件作品。`, 400);
  if (!(await votingIsOpen(db))) return reject('投票当前已关闭。', 409, { closed: true });
  return reject('该学号已提交过选票，每个学号仅可提交一次。', 409);
}

function adminState(request, env) {
  const identity = request.headers.get('oai-authenticated-user-id');
  if (!identity) return 401;
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return env.ADMIN_EMAIL && email === env.ADMIN_EMAIL ? 200 : 403;
}

function adminKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.ADMIN_SESSION_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function sessionMessage(request, env, expiry) {
  return encoder.encode(JSON.stringify(['admin-session', request.headers.get('oai-authenticated-user-id'), expiry, env.ADMIN_PASSWORD]));
}

async function unlockAdmin(request, env) {
  let payload;
  try { payload = await body(request); }
  catch (error) { return reject(error.message, 400); }
  const { password } = payload;
  if (typeof password !== 'string' || !password || password.length > 128) return reject('请输入管理员密码。', 400);
  const key = await adminKey(env);
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(`password:${env.ADMIN_PASSWORD}`));
  if (!(await crypto.subtle.verify('HMAC', key, expected, encoder.encode(`password:${password}`)))) {
    return reject('管理员密码不正确。', 403);
  }
  const expiry = String(Math.floor(Date.now() / 1000) + adminLifetime);
  const signature = await crypto.subtle.sign('HMAC', key, sessionMessage(request, env, expiry));
  const token = `${expiry}.${Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const url = new URL(request.url);
  const secure = url.protocol === 'http:' && url.hostname === '127.0.0.1' ? '' : '; Secure';
  return json({ unlocked: true }, 200, {
    'Set-Cookie': `${adminCookie}=${token}; Path=/api/admin; Max-Age=${adminLifetime}; HttpOnly; SameSite=Strict${secure}`,
  });
}

async function adminUnlocked(request, env) {
  const cookie = request.headers.get('cookie')?.split(/;\s*/).find(value => value.startsWith(`${adminCookie}=`));
  const match = cookie?.slice(adminCookie.length + 1).match(/^(\d{10,12})\.([a-f0-9]{64})$/);
  if (!match || Number(match[1]) <= Date.now() / 1000) return false;
  const signature = Uint8Array.from(match[2].match(/../g), byte => Number.parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', await adminKey(env), signature, sessionMessage(request, env, match[1]));
}

function votesFrom(rows) {
  return rows.map(row => ({ ...row, choices: normalizeChoices(JSON.parse(row.choices)) }));
}

async function statistics(db, query) {
  const before = query.get('before');
  const cursor = before && /^\d{1,15}$/.test(before) ? Number(before) : Number.MAX_SAFE_INTEGER;
  const [numbers, totals, records] = await db.batch([
    db.prepare('SELECT COUNT(*) AS ballots, COUNT(DISTINCT student_id COLLATE NOCASE) AS studentIds FROM ballots'),
    db.prepare(`
      SELECT artwork, COUNT(*) AS votes
      FROM (SELECT DISTINCT ballots.id, ${countArtwork} AS artwork FROM ballots, json_each(ballots.choices))
      GROUP BY artwork
    `),
    db.prepare('SELECT id, student_id AS studentId, choices, submitted_at AS submittedAt FROM ballots WHERE id < ? ORDER BY id DESC LIMIT ?').bind(cursor, pageSize + 1),
  ]);
  const rows = records.results.slice(0, pageSize);
  return json({
    open: await votingIsOpen(db),
    counts: { ...numbers.results[0], selections: totals.results.reduce((sum, result) => sum + result.votes, 0) },
    totals: totals.results,
    records: votesFrom(rows),
    next: records.results.length > pageSize ? rows.at(-1).id : null,
  });
}

function csvCell(value) {
  let text = String(value);
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportBallots(db) {
  const edge = await db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM ballots').first();
  let lastId = 0;
  const csv = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode('\ufeff选票编号,提交时间（北京时间）,学号,作品编号,作品名称\r\n')); },
    async pull(controller) {
      const { results } = await db.prepare('SELECT id, student_id AS studentId, choices, submitted_at AS submittedAt FROM ballots WHERE id > ? AND id <= ? ORDER BY id LIMIT 500').bind(lastId, edge.id).all();
      if (!results.length) return controller.close();
      const rows = votesFrom(results).map(row => {
        const time = new Date(Date.parse(row.submittedAt) + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
        const works = row.choices.map(id => artworkByBoard.get(id));
        return [row.id, time, row.studentId, works.map(artworkLabel).join('、'), works.map(art => art.title).join('、')].map(csvCell).join(',');
      });
      lastId = results.at(-1).id;
      controller.enqueue(encoder.encode(rows.join('\r\n') + '\r\n'));
      if (results.length < 500) controller.close();
    },
  });
  return new Response(csv, {
    headers: { ...jsonHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="exhibition-ballots.csv"' },
  });
}

async function handle(request, env) {
  const url = new URL(request.url);
  const { pathname, searchParams, origin } = url;
  const { method, headers } = request;
  if (!pathname.startsWith('/api/')) {
    if (method !== 'GET' && method !== 'HEAD') return new Response(null, { status: 405 });
    if (pathname === '/') return file('/index.html', method);
    if (pathname === '/admin' || pathname === '/admin/') return file('/admin.html', method);
    return file(pathname, method);
  }

  if (method === 'POST' && headers.has('origin') && headers.get('origin') !== origin) return reject('请求来源无效。', 403);
  if (pathname.startsWith('/api/admin/')) {
    const status = adminState(request, env);
    if (status !== 200) return reject(status === 401 ? '请先登录管理员账号。' : '此账号没有管理权限。', status);
    if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_KEY) return reject('管理员密码验证暂不可用。', 503);
    if (pathname === '/api/admin/unlock' && method === 'POST') return unlockAdmin(request, env);
    if (!(await adminUnlocked(request, env))) return reject('请输入管理员密码。', 403, { passwordRequired: true });
  }

  const db = env.DB;
  if (!db) return reject('投票服务暂不可用。', 503);
  if (pathname === '/api/status' && method === 'GET') return json({ open: await votingIsOpen(db) });
  if (pathname === '/api/ballot' && method === 'POST') return castBallot(request, db);
  if (pathname === '/api/admin/statistics' && method === 'GET') return statistics(db, searchParams);
  if (pathname === '/api/admin/export.csv' && method === 'GET') return exportBallots(db);
  if (pathname === '/api/admin/status' && method === 'POST') {
    let update;
    try { update = await body(request); }
    catch (error) { return reject(error.message, 400); }
    if (typeof update.open !== 'boolean') return reject('投票状态无效。', 400);
    await db.prepare('INSERT INTO exhibition_settings (id, voting_open) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET voting_open = excluded.voting_open').bind(Number(update.open)).run();
    return json({ open: update.open });
  }
  return reject('接口不存在。', 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch {
      return reject('服务暂不可用，请稍后重试。', 500);
    }
  },
};
