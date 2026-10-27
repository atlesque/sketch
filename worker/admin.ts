// The admin API, for the emails in ALLOWED_EMAILS behind Cloudflare Access (worker/access.ts checks the token).
// Live rooms come from their Durable Objects; everything after the fact (games, turns, drawings, the audit log,
// reports, bans, players) from D1 and R2. Every change an admin makes is written to the audit log.

import { CODE, fail, forwardSocket, json, readJson, roomStub } from './http.ts';
import { insertEvents } from './log.ts';
import type { AdminAction } from './room.ts';

const PAGE = 100;
const int = (value: string | null, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== '' ? Math.floor(n) : fallback;
};

export async function adminApi(request: Request, env: Env, url: URL, email: string): Promise<Response> {
  const path = url.pathname.slice('/api/admin'.length);
  const method = request.method;
  const q = url.searchParams;
  const audit = (type: string, extra: Record<string, unknown> = {}) => insertEvents(env.DB, [{ type, actor: `admin:${email}`, actorName: email, ...extra }]);

  if (path === '/me') return json({ email });

  if (path === '/overview' && method === 'GET') {
    const day = Date.now() - 86_400_000;
    const [rooms, games, reports, bans] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS rooms, COALESCE(SUM(players), 0) AS players FROM rooms WHERE closed_at IS NULL'),
      env.DB.prepare('SELECT COUNT(*) AS games FROM games WHERE started_at > ?').bind(day),
      env.DB.prepare("SELECT COUNT(*) AS open FROM reports WHERE status = 'open'"),
      env.DB.prepare('SELECT COUNT(*) AS active FROM bans WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ?)').bind(Date.now()),
    ]);
    return json({ ...(rooms!.results[0] as object), ...(games!.results[0] as object), reports: (reports!.results[0] as { open: number }).open, bans: (bans!.results[0] as { active: number }).active });
  }

  // ---------- rooms ----------

  if (path === '/rooms' && method === 'GET') {
    const closed = q.get('closed') === '1';
    const { results } = await env.DB.prepare(
      closed
        ? 'SELECT * FROM rooms WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT ?'
        : 'SELECT * FROM rooms WHERE closed_at IS NULL ORDER BY players DESC, updated_at DESC LIMIT ?',
    )
      .bind(PAGE)
      .all();
    return json({ rooms: results });
  }

  const room = path.match(/^\/rooms\/([^/]+)(\/ws|\/actions)?$/);
  if (room) {
    const code = room[1]!.toLowerCase();
    if (!CODE.test(code)) return fail(404, 'No such room');
    if (room[2] === '/ws') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'Expected a WebSocket');
      if (request.headers.get('origin') !== url.origin && env.DEV_NO_ACCESS !== '1') return fail(403, 'Open it from the admin page.');
      return forwardSocket(request, env, code, email);
    }
    if (room[2] === '/actions' && method === 'POST') {
      const action = await readJson<AdminAction>(request);
      const result = await roomStub(env, code).adminAction(email, action);
      return result.ok ? json(result) : fail(409, result.message ?? 'That did not work.');
    }
    if (method === 'GET') {
      const snapshot = await roomStub(env, code).adminSnapshot();
      const row = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
      if (!snapshot && !row) return fail(404, 'No such room');
      const { results: games } = await env.DB.prepare('SELECT id, started_at, ended_at, end_reason, winner_name, turns FROM games WHERE room_code = ? ORDER BY started_at DESC LIMIT 20').bind(code).all();
      return json({ snapshot, row, games });
    }
  }

  // ---------- games, turns, drawings ----------

  if (path === '/games' && method === 'GET') {
    const before = int(q.get('before'), Number.MAX_SAFE_INTEGER);
    const search = q.get('q')?.trim();
    const filters = ['started_at < ?'];
    const binds: unknown[] = [before];
    if (q.get('room')) {
      filters.push('room_code = ?');
      binds.push(q.get('room')!.toLowerCase());
    }
    if (search) {
      filters.push('(players LIKE ? OR id IN (SELECT game_id FROM turns WHERE word LIKE ?))');
      binds.push(`%${search}%`, `%${search}%`);
    }
    const { results } = await env.DB.prepare(`SELECT * FROM games WHERE ${filters.join(' AND ')} ORDER BY started_at DESC LIMIT ${PAGE}`)
      .bind(...binds)
      .all();
    return json({ games: results.map(parseGame), more: results.length === PAGE });
  }

  const game = path.match(/^\/games\/([0-9a-f-]{36})$/);
  if (game && method === 'GET') {
    const id = game[1]!;
    const row = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first();
    if (!row) return fail(404, 'No such game');
    const { results: turns } = await env.DB.prepare('SELECT * FROM turns WHERE game_id = ? ORDER BY idx').bind(id).all();
    const { results: reports } = await env.DB.prepare('SELECT * FROM reports WHERE game_id = ? ORDER BY ts').bind(id).all();
    return json({ game: parseGame(row), turns: turns.map((t) => ({ ...t, gains: t.gains ? JSON.parse(String(t.gains)) : [] })), reports });
  }

  if (path === '/drawing' && method === 'GET') {
    const key = q.get('key') ?? '';
    if (!/^games\/[0-9a-f-]{36}\/\d{3}\.json$/.test(key)) return fail(400, 'Bad key');
    const object = await env.DRAWINGS.get(key);
    if (!object) return fail(404, 'No such drawing');
    return new Response(object.body, { headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=3600' } });
  }

  // ---------- audit log ----------

  if (path === '/events' && method === 'GET') {
    const filters = ['id < ?'];
    const binds: unknown[] = [int(q.get('before'), Number.MAX_SAFE_INTEGER)];
    for (const [param, column] of [
      ['room', 'room_code'],
      ['game', 'game_id'],
      ['account', 'account_email'],
      ['device', 'device'],
      ['ip', 'ip'],
    ] as const) {
      const value = q.get(param)?.trim();
      if (value) {
        filters.push(`${column} = ?`);
        binds.push(param === 'room' || param === 'account' ? value.toLowerCase() : value);
      }
    }
    const type = q.get('type')?.trim();
    if (type) {
      // "admin" matches every admin.* type, "chat" every chat and guess
      if (type.endsWith('*')) {
        filters.push('type LIKE ?');
        binds.push(`${type.slice(0, -1)}%`);
      } else {
        filters.push('type = ?');
        binds.push(type);
      }
    }
    const actor = q.get('actor')?.trim();
    if (actor) {
      filters.push('(actor = ? OR actor_name LIKE ? OR target = ? OR target_name LIKE ?)');
      binds.push(actor, `%${actor}%`, actor, `%${actor}%`);
    }
    const search = q.get('q')?.trim();
    if (search) {
      filters.push('(text LIKE ? OR data LIKE ?)');
      binds.push(`%${search}%`, `%${search}%`);
    }
    const from = int(q.get('from'), 0);
    if (from) {
      filters.push('ts >= ?');
      binds.push(from);
    }
    const to = int(q.get('to'), 0);
    if (to) {
      filters.push('ts <= ?');
      binds.push(to);
    }
    const limit = Math.min(500, Math.max(1, int(q.get('limit'), 200)));
    const order = q.get('order') === 'asc' ? 'ASC' : 'DESC';
    const { results } = await env.DB.prepare(`SELECT * FROM events WHERE ${filters.join(' AND ')} ORDER BY id ${order} LIMIT ${limit}`)
      .bind(...binds)
      .all();
    return json({ events: results.map((e) => ({ ...e, data: e.data ? JSON.parse(String(e.data)) : null })), more: results.length === limit });
  }

  if (path === '/event-types' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT type, COUNT(*) AS count FROM events GROUP BY type ORDER BY type').all();
    return json({ types: results });
  }

  // ---------- reports ----------

  if (path === '/reports' && method === 'GET') {
    const status = q.get('status') === 'all' ? null : q.get('status') || 'open';
    const { results } = await (status
      ? env.DB.prepare(`SELECT * FROM reports WHERE status = ? ORDER BY ts DESC LIMIT ${PAGE}`).bind(status)
      : env.DB.prepare(`SELECT * FROM reports ORDER BY ts DESC LIMIT ${PAGE}`)
    ).all();
    return json({ reports: results });
  }

  const report = path.match(/^\/reports\/(\d+)$/);
  if (report && method === 'POST') {
    const body = await readJson<{ status?: string; note?: string }>(request);
    const status = body.status === 'open' ? 'open' : body.status === 'dismissed' ? 'dismissed' : 'resolved';
    const note = body.note ? String(body.note).slice(0, 1000) : null;
    const now = Date.now();
    const result = await env.DB.prepare('UPDATE reports SET status = ?, note = ?, resolved_at = ?, resolved_by = ? WHERE id = ?')
      .bind(status, note, status === 'open' ? null : now, status === 'open' ? null : email, Number(report[1]))
      .run();
    if (!result.meta.changes) return fail(404, 'No such report');
    await audit('admin.report', { target: report[1], text: note, data: { status } });
    return json({ ok: true });
  }

  // ---------- bans ----------

  if (path === '/bans' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM bans ORDER BY (lifted_at IS NULL) DESC, created_at DESC LIMIT 500`).all();
    return json({ bans: results, now: Date.now() });
  }

  if (path === '/bans' && method === 'POST') {
    const body = await readJson<{ kind?: string; value?: string; label?: string; reason?: string; days?: number }>(request);
    const kind = body.kind === 'account' || body.kind === 'device' || body.kind === 'ip' ? body.kind : fail(400, 'kind is account, device or ip');
    const value = String(body.value ?? '').trim().slice(0, 200) || fail(400, 'Missing value');
    const days = Number(body.days) > 0 ? Math.min(3650, Number(body.days)) : null;
    const now = Date.now();
    const label = body.label ? String(body.label).slice(0, 200) : null;
    const reason = body.reason ? String(body.reason).slice(0, 500) : null;
    await env.DB.prepare('INSERT INTO bans (kind, value, label, reason, created_at, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(kind, value, label, reason, now, email, days ? now + days * 86_400_000 : null)
      .run();
    await audit('admin.ban.add', { target: value, targetName: label, text: reason, data: { kind, days } });
    return json({ ok: true });
  }

  const ban = path.match(/^\/bans\/(\d+)\/lift$/);
  if (ban && method === 'POST') {
    const row = await env.DB.prepare('SELECT * FROM bans WHERE id = ?').bind(Number(ban[1])).first<{ kind: string; value: string; label: string | null }>();
    if (!row) return fail(404, 'No such ban');
    await env.DB.prepare('UPDATE bans SET lifted_at = ?, lifted_by = ? WHERE id = ? AND lifted_at IS NULL').bind(Date.now(), email, Number(ban[1])).run();
    await audit('admin.ban.lift', { target: row.value, targetName: row.label, data: { kind: row.kind, ban: Number(ban[1]) } });
    return json({ ok: true });
  }

  // ---------- players ----------

  if (path === '/players' && method === 'GET') {
    const since = Date.now() - int(q.get('days'), 30) * 86_400_000;
    const [accounts, recent] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM account_stats ORDER BY last_played DESC LIMIT 500'),
      // one line per browser: the last name it used, how often it joined, and from where
      env.DB.prepare(
        `SELECT device, MAX(ts) AS last_seen, COUNT(*) AS joins, COUNT(DISTINCT room_code) AS rooms,
          (SELECT actor_name FROM events e2 WHERE e2.device = e.device AND e2.type = 'player.join' ORDER BY ts DESC LIMIT 1) AS name,
          (SELECT account_email FROM events e2 WHERE e2.device = e.device AND e2.type = 'player.join' AND account_email IS NOT NULL ORDER BY ts DESC LIMIT 1) AS account_email,
          (SELECT ip FROM events e2 WHERE e2.device = e.device AND e2.type = 'player.join' ORDER BY ts DESC LIMIT 1) AS ip
         FROM events e WHERE type = 'player.join' AND ts > ? AND device IS NOT NULL GROUP BY device ORDER BY last_seen DESC LIMIT 500`,
      ).bind(since),
    ]);
    return json({ accounts: accounts!.results, devices: recent!.results });
  }

  return fail(404, 'No such admin endpoint');
}

function parseGame(row: Record<string, unknown>) {
  return { ...row, settings: row.settings ? JSON.parse(String(row.settings)) : null, players: row.players ? JSON.parse(String(row.players)) : [] };
}
