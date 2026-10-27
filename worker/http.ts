// Small helpers both the public API (worker/index.ts) and the admin API (worker/admin.ts) use.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return fail(400, 'Expected a JSON body');
  }
}

/** Room codes: six characters without look-alikes (no 0/o, 1/l/i). */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const CODE = /^[a-hjkmnp-z2-9]{6}$/;
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

export const roomStub = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

/** Forwards a WebSocket upgrade to the room with what the room may know about the client. */
export function forwardSocket(request: Request, env: Env, code: string, admin: string | null) {
  const headers = new Headers(request.headers);
  headers.delete('x-sketch-admin');
  headers.set('x-sketch-ip', request.headers.get('cf-connecting-ip') ?? '');
  headers.set('x-sketch-country', String((request.cf as { country?: string } | undefined)?.country ?? ''));
  if (admin) headers.set('x-sketch-admin', admin);
  return roomStub(env, code).fetch(new Request(request.url, { headers }));
}
