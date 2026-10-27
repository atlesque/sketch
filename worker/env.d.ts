// Worker secrets (`wrangler secret put <NAME>`), kept out of wrangler.jsonc so the public repo holds no account details.
// `wrangler types` only sees vars, so they are declared here.
interface Env {
  /** The Zero Trust team name: <team>.cloudflareaccess.com. */
  ACCESS_TEAM?: string;
  /** The Access application's audience (AUD) tag. */
  ACCESS_AUD?: string;
  /** Comma-separated emails that may use the admin. */
  ALLOWED_EMAILS?: string;
}
