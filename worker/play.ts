// Atlesque Play (play.atlesque.dev, the mbp-games Worker) holds the accounts. A signed-in player's browser has a
// bearer token from it; the room checks that token with GET /api/me before it trusts the account.
// In production the call goes over a service binding (PLAY); in `wrangler dev` there is none, so it goes to PLAY_URL.

export interface PlayUser {
  id: string;
  email: string;
}

/** The account, 'signed_out' when Atlesque Play no longer accepts the token (or bans the account), null when it can't be reached. */
export async function playUser(env: Env, token: string): Promise<PlayUser | 'signed_out' | null> {
  const request = new Request(`${env.PLAY_URL}/api/me`, { headers: { authorization: `Bearer ${token}` } });
  try {
    const response = env.PLAY ? await env.PLAY.fetch(request) : await fetch(request);
    if (response.status === 401 || response.status === 403) return 'signed_out';
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: Partial<PlayUser> };
    const user = body.user;
    return user && typeof user.id === 'string' && typeof user.email === 'string' ? { id: user.id, email: user.email.toLowerCase() } : null;
  } catch (error) {
    console.error('Atlesque Play unreachable', error);
    return null;
  }
}

export const bearer = (request: Request) => {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};
