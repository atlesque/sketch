// The game rules in shared/game.ts. Run with `pnpm test` (Node strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildHint,
  checkGuess,
  cleanSettings,
  containsWord,
  drawerPoints,
  guesserPoints,
  hintBudget,
  hintTimes,
  kickNeeded,
  nextHintIndex,
  normalize,
  parseWords,
  pickWords,
  rank,
  undoOps,
  validOps,
} from '../shared/game.ts';
import type { Op } from '../shared/protocol.ts';
import { WORDS_NL } from '../shared/words-nl.ts';

test('guesses ignore case, accents, hyphens and extra spaces', () => {
  assert.equal(normalize('  Rode-Kool '), 'rode kool');
  assert.equal(checkGuess('CAFÉ', 'cafe'), 'correct');
  assert.equal(checkGuess('rode  kool', 'rode-kool'), 'correct');
  assert.equal(checkGuess('olifnt', 'olifant'), 'close');
  assert.equal(checkGuess('giraf', 'olifant'), 'wrong');
  // short words are never "close"
  assert.equal(checkGuess('kot', 'kat'), 'wrong');
  // long words allow two typos
  assert.equal(checkGuess('vliegtuigg', 'vliegtuig'), 'close');
  assert.equal(checkGuess('vlietuigg', 'vliegtuig'), 'close');
});

test('the drawer cannot type the word', () => {
  assert.ok(containsWord('het is een olifant!', 'olifant'));
  assert.ok(containsWord('rode kool', 'rode kool'));
  assert.ok(containsWord('rodekool', 'rode kool'));
  assert.ok(containsWord('twee olifanten', 'olifant'));
  assert.ok(!containsWord('een grote tekening', 'teken'));
});

test('hints keep at least half the word hidden', () => {
  assert.deepEqual(buildHint('rode kool', [0]), ['r', null, null, null, ' ', null, null, null, null]);
  assert.equal(hintBudget('kat', 5), 1);
  assert.equal(hintBudget('olifant', 2), 2);
  assert.equal(hintBudget('olifant', 5), 3);
  assert.equal(hintBudget('ei', 3), 1);
  assert.deepEqual(hintTimes(80, 2), [26667, 53333]);
  const revealed: number[] = [];
  for (let i = 0; i < 7; i++) revealed.push(nextHintIndex('olifant', revealed));
  assert.deepEqual([...revealed].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(nextHintIndex('olifant', revealed), -1);
});

test('scoring rewards speed and the drawer', () => {
  assert.equal(guesserPoints(80_000, 80_000, 1), 325);
  assert.equal(guesserPoints(40_000, 80_000, 2), 175);
  assert.equal(guesserPoints(0, 80_000, 3), 50);
  assert.equal(drawerPoints(0, 4), 0);
  assert.equal(drawerPoints(2, 4), 150);
  assert.equal(drawerPoints(4, 4), 250);
});

test('ranking shares places on equal scores', () => {
  const ranked = rank([{ score: 10 }, { score: 30 }, { score: 10 }, { score: 0 }]);
  assert.deepEqual(ranked.map((p) => [p.score, p.rank]), [[30, 1], [10, 2], [10, 2], [0, 4]]);
});

test('vote kicks need a majority of the others, at least two', () => {
  assert.equal(kickNeeded(2), 2);
  assert.equal(kickNeeded(3), 2);
  assert.equal(kickNeeded(5), 3);
  assert.equal(kickNeeded(8), 4);
});

test('settings are clamped and custom words cleaned', () => {
  const s = cleanSettings({ rounds: 99, drawTime: 5, maxPlayers: 1, hints: -1, wordMode: 'weird' as never, customWords: ['  Sprint ', 'sprint', 'retro', ''] });
  assert.equal(s.rounds, 10);
  assert.equal(s.drawTime, 30);
  assert.equal(s.maxPlayers, 2);
  assert.equal(s.hints, 0);
  assert.equal(s.wordMode, 'normal');
  assert.deepEqual(s.customWords, ['Sprint', 'retro']);
  // "custom only" needs enough custom words
  assert.equal(cleanSettings({ customOnly: true, customWords: ['a', 'b'] }).customOnly, false);
  assert.equal(cleanSettings({ customOnly: true, customWords: parseWords('a,b,c,d,e,f,g,h,i,j') }).customOnly, true);
});

test('only well-formed ops pass, and undo takes back one stroke', () => {
  const ops: Op[] = [['b', 1, 2, 10, 10], ['l', 20, 20], ['f', 5, 100, 100], ['b', 3, 0, 5, 5], ['l', 6, 6], ['l', 7, 7]];
  assert.ok(validOps(ops));
  assert.ok(!validOps([['b', 99, 2, 10, 10]]));
  assert.ok(!validOps([['l', 1.5, 2]]));
  assert.ok(!validOps([['x', 1, 2]]));
  assert.ok(!validOps([]));
  assert.deepEqual(undoOps(ops), ops.slice(0, 3));
  assert.deepEqual(undoOps(undoOps(ops)), ops.slice(0, 2));
  assert.deepEqual(undoOps([]), []);
});

test('word choices are different and not reused', () => {
  const used = new Set(['appel']);
  const words = pickWords(['appel', 'peer', 'kers', 'druif'], used, 3);
  assert.equal(new Set(words).size, 3);
  assert.ok(!words.includes('appel'));
});

test('the built-in list is large and clean', () => {
  assert.ok(WORDS_NL.length >= 1500);
  assert.equal(new Set(WORDS_NL.map(normalize)).size, WORDS_NL.length);
  assert.ok(WORDS_NL.every((w) => w.length <= 20 && w === w.trim()));
});
