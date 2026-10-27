// Sketch's Worker. The pages come from the assets binding; only /api/* reaches this code (assets.run_worker_first).
// Rooms are Durable Objects (worker/room.ts) named by their code; the admin API (worker/admin.ts) sits behind Cloudflare Access.

import { cleanSettings } from '../shared/game.ts';
import type { Settings } from '../shared/protocol.ts';
import { accessEmail } from './access.ts';
import { adminApi } from './admin.ts';
import { CODE, HttpError, fail, forwardSocket, json, newCode, readJson, roomStub } from './http.ts';
import { bearer, playUser } from './play.ts';

export { Room } from './room.ts';

async function createRoom(env: Env, isPublic: boolean, settings?: Partial<Settings>): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await roomStub(env, code).create(code, isPublic, settings)) return code;
  }
  return fail(503, 'Could not make a room, try again.');
}

/** Pages may open a room's socket from this site only (and from the local dev server in `wrangler dev --env dev`). */
function originAllowed(request: Request, url: URL, env: Env) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (origin === url.origin) return true;
  return env.DEV_NO_ACCESS === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname: path } = url;
  const method = request.method;

  if (path.startsWith('/api/admin/')) {
    const email = await accessEmail(request, env);
    if (!email) return fail(403, 'Admins only (Cloudflare Access).');
    return adminApi(request, env, url, email);
  }

  // Quick play: the fullest public room that still has a seat, or a new one.
  if (path === '/api/play' && method === 'POST') {
    const since = Date.now() - 10 * 60_000;
    const row = await env.DB.prepare(
      'SELECT code FROM rooms WHERE public = 1 AND closed_at IS NULL AND players < max_players AND updated_at > ? ORDER BY players DESC, updated_at DESC LIMIT 1',
    )
      .bind(since)
      .first<{ code: string }>();
    if (row) {
      const info = await roomStub(env, row.code).info();
      if (info.exists && info.players < info.maxPlayers) return json({ code: row.code });
    }
    return json({ code: await createRoom(env, true) });
  }

  if (path === '/api/rooms' && method === 'POST') {
    const body = await readJson<{ settings?: Partial<Settings> }>(request);
    return json({ code: await createRoom(env, false, cleanSettings(body.settings)) });
  }

  const room = path.match(/^\/api\/rooms\/([^/]+)(\/ws)?$/);
  if (room) {
    const code = room[1]!.toLowerCase();
    if (!CODE.test(code)) return fail(404, 'No such room');
    if (room[2]) {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'Expected a WebSocket');
      if (!originAllowed(request, url, env)) return fail(403, 'Join from the game page.');
      return forwardSocket(request, env, code, null);
    }
    if (method !== 'GET') return fail(405, 'Method not allowed');
    const info = await roomStub(env, code).info();
    return info.exists ? json(info) : fail(404, 'No such room');
  }

  // The signed-in player's totals, for the home page.
  if (path === '/api/stats' && method === 'GET') {
    const token = bearer(request);
    const user = token ? await playUser(env, token) : null;
    if (user === 'signed_out') return fail(401, 'Signed out');
    if (!user) return fail(401, 'Sign in first');
    const stats = await env.DB.prepare('SELECT games, wins, points, guesses, drawings, last_played FROM account_stats WHERE account_id = ?').bind(user.id).first();
    return json({ user, stats: stats ?? { games: 0, wins: 0, points: 0, guesses: 0, drawings: 0, last_played: null } });
  }

  return fail(404, 'No such endpoint');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      return await route(request, env, url);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Something went wrong' }, 500);
    }
  },

  // Nightly: the audit log keeps 180 days; room rows that never got closed (a deploy mid-game) are closed.
  async scheduled(_event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(now - 180 * 86_400_000),
      env.DB.prepare('UPDATE rooms SET closed_at = ?, players = 0 WHERE closed_at IS NULL AND updated_at < ?').bind(now, now - 86_400_000),
    ]);
  },
} satisfies ExportedHandler<Env>;
