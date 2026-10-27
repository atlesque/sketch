// Cloudflare Access guards /admin and /api/admin/*; the admin API checks the Access token as well, so a request that
// somehow skips Access (a misconfigured app, a new route) still gets nothing.

import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** The signed-in email, or null when the request carries no valid Access token for this app. */
export async function accessEmail(request: Request, env: Env): Promise<string | null> {
  // Only the "dev" environment in wrangler.jsonc sets this (wrangler dev rewrites the host, so it can't be told apart).
  if (env.DEV_NO_ACCESS === '1') return 'dev@localhost';
  // ACCESS_TEAM, ACCESS_AUD and ALLOWED_EMAILS are Worker secrets; without them nobody gets in.
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM || !env.ALLOWED_EMAILS) return null;

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;
  const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    const allowed = env.ALLOWED_EMAILS.split(',').map((value) => value.trim().toLowerCase());
    return email && allowed.includes(email) ? email : null;
  } catch {
    return null;
  }
}
