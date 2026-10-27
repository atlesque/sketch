// Signing in (and registering: the first sign-in creates the account) with Atlesque Play, the shared account
// service at play.atlesque.dev. The flow is its PKCE one (see the mbp-games README): we send the player to its /signin
// page, it sends them back with ?mbpg_code, and we swap that code for a bearer token. Playing never needs an account;
// signed-in players get a badge in rooms and their totals kept.

const CLIENT = 'sketch';
const KEY = 'sketch-account';
const PKCE = 'sketch-pkce';

export interface Account {
  token: string;
  user: { id: string; email: string };
  expiresAt: number;
}

export interface Stats {
  games: number;
  wins: number;
  points: number;
  guesses: number;
  drawings: number;
  last_played: number | null;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

function load(): Account | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Account | null;
    return saved && saved.expiresAt > Date.now() ? saved : null;
  } catch {
    return null;
  }
}

export function useAccount() {
  const playUrl = useRuntimeConfig().public.playUrl as string;
  const account = useState<Account | null>('account', load);
  const redirectUri = () => `${location.origin}/`;

  function store(value: Account | null) {
    account.value = value;
    try {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage blocked */
    }
  }

  /** Off to Atlesque Play's sign-in page; `returnTo` is where the player lands afterwards. */
  async function signIn(returnTo = location.pathname) {
    const verifier = random();
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = random(16);
    localStorage.setItem(PKCE, JSON.stringify({ verifier, state, returnTo }));
    const query = new URLSearchParams({ client: CLIENT, redirect_uri: redirectUri(), state, code_challenge: challenge });
    location.href = `${playUrl}/signin?${query}`;
  }

  /** Back from Atlesque Play: finishes the sign-in and answers where to go next (null when the URL has no sign-in). */
  async function finish(query: URLSearchParams): Promise<{ returnTo: string; error?: string } | null> {
    const code = query.get('mbpg_code');
    if (!code) return null;
    let saved: { verifier: string; state: string; returnTo: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(PKCE) ?? 'null');
    } catch {
      /* missing */
    }
    localStorage.removeItem(PKCE);
    const returnTo = saved?.returnTo && saved.returnTo.startsWith('/') ? saved.returnTo : '/';
    if (!saved || saved.state !== query.get('mbpg_state')) return { returnTo, error: 'Het inloggen is verlopen. Probeer opnieuw.' };
    try {
      const result = await $fetch<Account>(`${playUrl}/api/token`, {
        method: 'POST',
        body: { code, code_verifier: saved.verifier, client: CLIENT, redirect_uri: redirectUri() },
      });
      store(result);
      return { returnTo };
    } catch (error) {
      const message = (error as { data?: { message?: string } }).data?.message;
      return { returnTo, error: message ?? 'Inloggen is mislukt. Probeer opnieuw.' };
    }
  }

  async function signOut() {
    const token = account.value?.token;
    store(null);
    if (token) await $fetch(`${playUrl}/api/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  }

  /** Our totals for this account (worker/index.ts /api/stats); null and signed out when the token is no longer valid. */
  async function stats(): Promise<Stats | null> {
    const token = account.value?.token;
    if (!token) return null;
    try {
      const result = await $fetch<{ stats: Stats }>('/api/stats', { headers: { authorization: `Bearer ${token}` } });
      void saveProgress(result.stats);
      return result.stats;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 401) store(null);
      return null;
    }
  }

  /** Puts the totals in the account's save on Atlesque Play too, so its hub and admin page show them. */
  async function saveProgress(totals: Stats) {
    const token = account.value?.token;
    if (!token) return;
    const headers = { authorization: `Bearer ${token}` };
    const url = `${playUrl}/api/games/${CLIENT}/progress`;
    const data = { stats: { games: totals.games, wins: totals.wins, points: totals.points } };
    try {
      const current = await $fetch<{ data: { stats?: typeof data.stats } | null; rev: number }>(url, { headers });
      if (JSON.stringify(current.data?.stats) === JSON.stringify(data.stats)) return;
      await $fetch(url, { method: 'PUT', headers, body: { data, rev: current.rev } });
    } catch {
      /* the next visit tries again */
    }
  }

  return { account, signIn, finish, signOut, stats, clear: () => store(null) };
}
