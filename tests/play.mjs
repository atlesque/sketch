// Plays one whole game with three bots against a running Sketch (default: `pnpm preview` on 127.0.0.1:8840)
// and checks what each player may and may not see. Usage: node tests/play.mjs [base url]
// With SKETCH_TOKEN set (an Atlesque Play token the server accepts), the first bot plays signed in, and its badge
// and account totals are checked too.
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8840';
const WS = BASE.replace(/^http/, 'ws');
const origin = new URL(BASE).origin;

const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { rounds: 1, drawTime: 30, wordChoices: 1, hints: 1 } }) })).json();
console.log('room', code);

const TOKEN = process.env.SKETCH_TOKEN;

function bot(name, token) {
  const ws = new WebSocket(`${WS}/api/rooms/${code}/ws`, { headers: { origin } });
  const me = { name, ws, id: null, room: null, chat: [], ops: 0, sawWordWhileGuessing: false };
  ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'hello', name, avatar: { color: 1, eyes: 2, mouth: 3, extra: 0 }, device: `bot-${name}`, token })));
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.t === 'welcome') me.id = msg.you;
    if (msg.t === 'welcome' || msg.t === 'state') {
      me.room = msg.room;
      const r = msg.room;
      const p = r.players.find((x) => x.id === me.id);
      if (r.phase === 'drawing' && r.drawerId !== me.id && !p?.guessed && r.word) me.sawWordWhileGuessing = true;
    }
    if (msg.t === 'chat') me.chat.push(msg.line);
    if (msg.t === 'draw') me.ops += msg.ops.length;
  });
  me.send = (m) => ws.send(JSON.stringify(m));
  return me;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 40_000, what = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await wait(50);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const bots = [bot('Ada', TOKEN), bot('Bram'), bot('Cleo')];
await until(() => bots.every((b) => b.room?.players.length === 3), 10_000, 'three players');
if (TOKEN) assert.deepEqual(Object.fromEntries(bots[0].room.players.map((p) => [p.name, p.account])), { Ada: true, Bram: false, Cleo: false }, 'only the signed-in bot has a badge');
const host = bots.find((b) => b.room.hostId === b.id);
assert.ok(host, 'someone is host');
host.send({ t: 'start' });

let turns = 0;
let word = null;
while (true) {
  await until(() => ['drawing', 'results'].includes(host.room.phase) && host.room.word !== word, 40_000, 'a drawing turn');
  if (host.room.phase === 'results') break;
  const drawer = bots.find((b) => b.id === host.room.drawerId);
  await until(() => drawer.room.phase === 'drawing' && drawer.room.word, 5000, 'the drawer to see the word');
  word = drawer.room.word;
  const guessers = bots.filter((b) => b !== drawer);
  for (const g of guessers) assert.equal(g.room.word, null, 'guessers do not get the word');
  drawer.send({ t: 'draw', ops: [['b', 1, 2, 100, 100], ['l', 200, 150], ['l', 300, 120]] });
  drawer.send({ t: 'chat', text: `het is ${word}` });
  await wait(200);
  for (const g of guessers) {
    g.send({ t: 'chat', text: 'zzzz' });
    g.send({ t: 'chat', text: word.toUpperCase() });
    await wait(150);
  }
  await until(() => host.room.phase !== 'drawing', 10_000, 'the turn to end');
  turns++;
  const reveal = (host.room.reveal ?? {});
  console.log(`turn ${turns}: ${word} (${reveal.reason})`, (reveal.gains ?? []).map((g) => `${g.name}+${g.points}`).join(' '));
  assert.equal(reveal.reason, 'all_guessed');
  for (const g of guessers) assert.ok(g.ops >= 3, 'guessers got the strokes');
}

assert.equal(turns, 3, 'one round of three players is three turns');
const ranked = host.room.results;
assert.equal(ranked.length, 3);
assert.ok(ranked[0].score > 0);
for (const b of bots) {
  assert.ok(!b.sawWordWhileGuessing, `${b.name} never saw the word before guessing`);
  // the answer itself never shows up in chat as someone's message, and the drawer's spoiler was blocked
  const leaks = b.chat.filter((l) => l.kind === 'msg' && l.from !== b.id && /^het is /.test(l.text));
  assert.equal(leaks.length, 0, `${b.name} did not see the drawer's spoiler`);
}
console.log('results', ranked.map((r) => `#${r.rank} ${r.name} ${r.score}`).join(', '));

// the game is on record (local dev has no Access in front of the admin API)
const games = await (await fetch(`${BASE}/api/admin/games?room=${code}`)).json();
assert.equal(games.games?.[0]?.turns, 3, 'the game is in D1 with its turns');
const game = await (await fetch(`${BASE}/api/admin/games/${games.games[0].id}`)).json();
assert.equal(game.turns.length, 3);
assert.ok(game.turns.every((t) => t.drawing_key), 'every turn has its drawing in R2');
console.log('admin: game and', game.turns.length, 'turns with drawings recorded');

if (TOKEN) {
  const players = await (await fetch(`${BASE}/api/admin/players`)).json();
  const stats = players.accounts.find((a) => a.name === 'Ada');
  assert.ok(stats && stats.games >= 1 && stats.points > 0, 'the signed-in bot has account totals');
  console.log('account totals:', stats.email, `${stats.games} games, ${stats.wins} wins, ${stats.points} points`);
}

for (const b of bots) b.send({ t: 'leave' });
await wait(300);
console.log('ok');
process.exit(0);
