// Run by `pnpm run deploy` before the migrations: prints a D1 Time Travel bookmark, so the build log says exactly
// where to roll the database back to. The repo has no database id (Time Travel needs one), so it's looked up by name.
// Never stops a deploy.
import { execFileSync } from 'node:child_process';

const NAME = 'sketch';

try {
  const out = execFileSync('wrangler', ['d1', 'list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const db = JSON.parse(out.slice(out.indexOf('['))).find((d) => d.name === NAME);
  if (!db) throw new Error(`no D1 database named ${NAME}`);
  execFileSync('wrangler', ['d1', 'time-travel', 'info', db.uuid], { stdio: 'inherit' });
} catch (error) {
  console.warn(`No restore point printed (${String(error.message).split('\n')[0]}); the deploy carries on.`);
}
