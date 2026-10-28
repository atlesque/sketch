# Sketch

Draw and guess with your team, for the Scrum ceremonies. One player draws a word, the others guess it in the chat; quick guesses score the most, and the drawer scores for every player who gets it. At **https://sketch.atlesque.dev**.

## What players get

- The home page asks for a name and an avatar, then two buttons. **Spelen!** (play) drops you in an open room with whoever is playing; it starts by itself once two people are in. **Privékamer maken** (private room) makes a room you set up yourself (players, rounds, drawing time, word choices, hints, a hidden-word mode, custom words or only custom words) and share with a link (`/r/<code>`). There's no code field: you join by the link.
- The game screen: one bar on top (the clock, the round, the word or its blanks, a gear for the settings), the players on the left, the board in the middle with the drawer's tools under it, the chat on the right. On a phone, a game fills exactly the visible screen, with nothing to scroll: the bar, the board as big as fits, the drawer's tools in one row (color and size open small panels), the chat and the guess field. When the keyboard opens, the board shrinks to stay above it and the newest chat lines float over the board for a few seconds. The players open from a button in the bar, which shows how many guessed.
- The settings (the gear): volume, the drawing keys, light or dark, the cookie settings, the invite link, and leaving the room.
- The game is in Dutch, with 1,900 everyday Dutch words built in (`shared/words-nl.ts`). Custom words get about half the choices when a room has them.
- Turns: the drawer picks a word (15 s), draws it (brush, eraser, fill, five sizes, 24 colors, undo, clear; keys B / E / F / Z unless changed in the settings, and Ctrl+Z always undoes), and the others guess. Letters are revealed as hints over the turn, and at least half the word always stays hidden. Correct guesses are never shown; "nearly right" (one typo, two for long words) is told privately. Players who guessed and the drawer chat among themselves in green. The drawer can't type the word.
- Like or dislike a drawing (the thumbs on the board), and click a player for vote to kick (a majority of the others) or report to the admin. In a private room, the host can kick and hand over the host role.
- Guests play with just a name and an avatar. **Inloggen of registreren** (sign in or register) uses an Atlesque account ([Atlesque Play](https://github.com/atlesque/mbp-games), play.atlesque.dev; the first sign-in creates the account): signed-in players get a badge in rooms and their totals kept (also shown on the Atlesque Play hub).
- A dropped connection (a reload, a phone that slept) comes back as the same player with the same score for 45 seconds.

## Admin (`/admin`)

Behind Cloudflare Access (only the emails in `ALLOWED_EMAILS`); the admin API checks the Access token itself as well (`worker/access.ts`).

- **Live rooms**: every open room, and per room a live view: the board as it is being drawn, the word, all chat (including correct guesses and blocked spoilers), the players with their account, device and IP, and controls: start, skip turn, end game, close room, message everyone, mute, make host, kick, ban (account, browser, IP).
- **Games**: every game with its ranking and turns (drawer, word, who guessed, likes, points) and each turn's drawing, replayable and downloadable as PNG.
- **Audit log**: everything that happens in the rooms (joins, chat and guesses, turns, votes, kicks, reports, settings) and every admin action, filterable and exportable as CSV. Kept for 180 days.
- **Reports**, **Bans** (lift, add by hand, with an expiry) and **Players** (accounts with totals, and every browser that joined lately).

## How it works

- `worker/index.ts`: the Worker. Pages come from static assets (Nuxt, `ssr: false`); only `/api/*` runs the Worker.
- `worker/room.ts`: one Durable Object per room (named by its code). It is the authority: words, the clock, hints, guesses, scores. WebSockets use the hibernation API; the state is saved after every change and the drawing's ops go to the object's SQLite, so a room carries on after hibernating. Alarms drive the clock.
- `shared/protocol.ts` is the wire format; `shared/game.ts` the rules (tested in `tests/game.test.ts`).
- D1 (`migrations/`): rooms (matchmaking and the admin's live list), games, turns, the audit log (`events`), bans, reports, account totals. R2 (`sketch-drawings`): each finished turn's drawing as its ops.
- Atlesque Play checks sign-in tokens over a service binding (`PLAY` → `mbp-games`); see `worker/play.ts` and `app/composables/useAccount.ts`.
- A nightly cron prunes the audit log and closes room rows a deploy left open.

## Running it

```sh
pnpm install
pnpm db:migrate:local
pnpm build && pnpm preview   # http://127.0.0.1:8840 with local D1/R2/Durable Objects, no Access
pnpm test                    # the rules
node tests/play.mjs          # three bots play a whole game against the preview and check what each may see
```

`pnpm dev` (Nuxt on :3340) with `pnpm dev:api` (the Worker on :8840) is the fast loop for the pages. To try sign-in locally, run Atlesque Play (`npm run dev` in mbp-games, :8787), build with `NUXT_PUBLIC_PLAY_URL=http://127.0.0.1:8787` and start the preview with `--var PLAY_URL:http://127.0.0.1:8787`; with `SKETCH_TOKEN=<token>`, `tests/play.mjs` plays one bot signed in.

## Deploying

Pushing to `main` deploys: Cloudflare Workers Builds runs `pnpm run build`, then `pnpm run deploy`, which

1. prints a D1 Time Travel bookmark (`scripts/restore-point.mjs`), so the build log says where to roll the database back to;
2. applies the new migrations in `migrations/` (Wrangler records which ones ran, so each runs once);
3. deploys the Worker.

If a migration fails, the build stops before the deploy, and the live site keeps its code and database as they were.

### Changing the database

- Add the next numbered file to `migrations/` (`0002_….sql`) and try it with `pnpm db:migrate:local`. Pushing it to `main` applies it.
- A migration runs about a minute before the new code is live, so the code that's still running has to keep working with it: add tables, or columns with a default. Drop or rename something in a later push, once the code no longer uses it.
- To undo, restore the bookmark from the build log: `wrangler d1 time-travel restore <database id> --bookmark=<bookmark>` (or `--timestamp=<time>`; Time Travel reaches back 30 days). Time Travel needs the database id, which `wrangler d1 list` shows.

The repository holds no account details; Cloudflare is configured through the environment:

- **Account**: `CLOUDFLARE_ACCOUNT_ID` (Workers Builds sets it; export it yourself to run Wrangler against the account by hand).
- **D1**: the binding names the database (`sketch`) but has no id. Wrangler looks it up by name on the first deploy, and later deploys inherit the binding.
- **Access**: Worker secrets, set once with `printf %s "<value>" | npx wrangler secret put <NAME>`:
  - `ACCESS_TEAM`: the Zero Trust team name (`<team>.cloudflareaccess.com`)
  - `ACCESS_AUD`: the audience tag of the Access application that guards `/admin` and `/api/admin`
  - `ALLOWED_EMAILS`: comma-separated emails that may use the admin

  Without all three the admin API lets nobody in. `.dev.vars.example` lists them for `wrangler dev` without `--env dev`.

Resources: Worker `sketch` on the custom domain `sketch.atlesque.dev`, D1 `sketch`, R2 `sketch-drawings`, Durable Object class `Room` (migration `v1`), a self-hosted Access application covering `sketch.atlesque.dev/admin` and `sketch.atlesque.dev/api/admin`, and a service binding to `mbp-games` (Atlesque Play).

Privacy: the page loads the shared consent banner (analytics only after opt-in), without its floating privacy button (it covered the guess field on phones); the home page's footer and the gear in a game reopen the banner. For moderation, names, chat, drawings, IP addresses and browser ids are kept for 180 days.
