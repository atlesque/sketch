// The game's rules as pure functions, used by the room (worker/room.ts) and covered by tests/game.test.ts.

import { BOARD_H, BOARD_W, DEFAULT_SETTINGS, LIMITS, PALETTE, SIZES, type Avatar, type Op, type Settings } from './protocol.ts';

/** How many choices each avatar part has (components/PlayerAvatar.vue draws them). */
export const AVATAR_PARTS = { color: 12, eyes: 8, mouth: 8, extra: 7 } as const;

const clampInt = (value: unknown, [min, max]: readonly [number, number], fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Lowercase, no accents, single spaces, hyphens as spaces: "Rode-kool " and "rode kool" are the same guess. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length]!;
}

export type GuessResult = 'correct' | 'close' | 'wrong';

/** One typo away (two for long words) is "close"; the guesser is told privately. */
export function checkGuess(guess: string, word: string): GuessResult {
  const g = normalize(guess);
  const w = normalize(word);
  if (!g) return 'wrong';
  if (g === w) return 'correct';
  if (w.length < 4) return 'wrong';
  const distance = levenshtein(g, w);
  return distance <= (w.length >= 9 ? 2 : 1) ? 'close' : 'wrong';
}

/** Does a message give the answer away? The word itself, run together ("rodekool"), or with a short ending ("olifanten"). */
export function containsWord(text: string, word: string): boolean {
  const w = normalize(word);
  if (!w) return false;
  const t = normalize(text);
  if (` ${t} `.includes(` ${w} `)) return true;
  const solid = w.replace(/ /g, '');
  return t.split(' ').some((token) => token === solid || (solid.length >= 4 && token.startsWith(solid) && token.length - solid.length <= 2));
}

const isLetter = (ch: string) => ch !== ' ' && ch !== '-';

/** The word as guessers see it: separators show, revealed letters show, every other letter is null. */
export function buildHint(word: string, revealed: number[]): (string | null)[] {
  const shown = new Set(revealed);
  return [...word].map((ch, i) => (!isLetter(ch) || shown.has(i) ? ch : null));
}

/** Letters a hint may still reveal; at least half the word (and always one letter) stays hidden. */
export function hintBudget(word: string, hints: number): number {
  const letters = [...word].filter(isLetter).length;
  return Math.max(0, Math.min(hints, Math.floor(letters / 2), letters - 1));
}

/** A random letter position not shown yet, or -1. */
export function nextHintIndex(word: string, revealed: number[], random = Math.random): number {
  const open = [...word].flatMap((ch, i) => (isLetter(ch) && !revealed.includes(i) ? [i] : []));
  return open.length ? open[Math.floor(random() * open.length)]! : -1;
}

/** When each hint is revealed, in ms after the drawing starts: spread evenly over the turn. */
export function hintTimes(drawSeconds: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((drawSeconds * 1000 * (i + 1)) / (count + 1)));
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/** A correct guess: more for guessing early, a small bonus for being first. */
export function guesserPoints(msLeft: number, drawMs: number, order: number): number {
  const share = Math.min(1, Math.max(0, msLeft / drawMs));
  return Math.max(25, round5(50 + 250 * share)) + (order === 1 ? 25 : 0);
}

/** The drawer scores for every player their drawing got to guess it. */
export function drawerPoints(guessed: number, eligible: number): number {
  if (!guessed || !eligible) return 0;
  return round5(50 + 200 * (guessed / eligible));
}

/** Votes needed to kick a player: a majority of the others, and never fewer than two. */
export function kickNeeded(connected: number): number {
  return Math.max(2, Math.floor((connected - 1) / 2) + 1);
}

/** Highest score first; equal scores share a rank. */
export function rank<T extends { score: number }>(players: T[]): (T & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let last = Number.NaN;
  let place = 0;
  return sorted.map((p, i) => {
    if (p.score !== last) place = i + 1;
    last = p.score;
    return { ...p, rank: place };
  });
}

/** Custom words from a textarea: one per line or comma separated, trimmed, no duplicates. */
export function parseWords(input: unknown): string[] {
  const list = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[\n,;]/);
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of list) {
    const word = raw.replace(/\s+/g, ' ').trim().slice(0, LIMITS.customWordLength);
    const key = normalize(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length >= LIMITS.customWords) break;
  }
  return words;
}

/** Settings from a client, clamped to what the game allows. Unknown fields are dropped. */
export function cleanSettings(input: Partial<Settings> | undefined, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = input ?? {};
  const customWords = s.customWords !== undefined ? parseWords(s.customWords) : base.customWords;
  return {
    maxPlayers: clampInt(s.maxPlayers ?? base.maxPlayers, LIMITS.maxPlayers, base.maxPlayers),
    rounds: clampInt(s.rounds ?? base.rounds, LIMITS.rounds, base.rounds),
    drawTime: clampInt(s.drawTime ?? base.drawTime, LIMITS.drawTime, base.drawTime),
    wordChoices: clampInt(s.wordChoices ?? base.wordChoices, LIMITS.wordChoices, base.wordChoices),
    hints: clampInt(s.hints ?? base.hints, LIMITS.hints, base.hints),
    wordMode: (s.wordMode ?? base.wordMode) === 'hidden' ? 'hidden' : 'normal',
    customWords,
    customOnly: !!(s.customOnly ?? base.customOnly) && customWords.length >= LIMITS.customOnlyMin,
  };
}

export function cleanName(input: unknown): string {
  const name = String(input ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
  return name || 'Naamloos';
}

export function cleanAvatar(input: unknown): Avatar {
  const a = (input ?? {}) as Partial<Avatar>;
  const part = (value: unknown, count: number) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 0 && n < count ? n : 0;
  };
  return { color: part(a.color, AVATAR_PARTS.color), eyes: part(a.eyes, AVATAR_PARTS.eyes), mouth: part(a.mouth, AVATAR_PARTS.mouth), extra: part(a.extra, AVATAR_PARTS.extra) };
}

export function randomAvatar(random = Math.random): Avatar {
  const pick = (count: number) => Math.floor(random() * count);
  return { color: pick(AVATAR_PARTS.color), eyes: pick(AVATAR_PARTS.eyes), mouth: pick(AVATAR_PARTS.mouth), extra: pick(AVATAR_PARTS.extra) };
}

const inBoard = (x: unknown, y: unknown) => Number.isInteger(x) && Number.isInteger(y) && (x as number) >= -50 && (x as number) <= BOARD_W + 50 && (y as number) >= -50 && (y as number) <= BOARD_H + 50;

/** Only well-formed ops are relayed; one bad op drops the whole batch. */
export function validOps(input: unknown, max = 600): input is Op[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > max) return false;
  return input.every((op) => {
    if (!Array.isArray(op)) return false;
    if (op[0] === 'b') return op.length === 5 && Number.isInteger(op[1]) && op[1] >= 0 && op[1] < PALETTE.length && Number.isInteger(op[2]) && op[2] >= 0 && op[2] < SIZES.length && inBoard(op[3], op[4]);
    if (op[0] === 'l') return op.length === 3 && inBoard(op[1], op[2]);
    if (op[0] === 'f') return op.length === 4 && Number.isInteger(op[1]) && op[1] >= 0 && op[1] < PALETTE.length && inBoard(op[2], op[3]);
    return false;
  });
}

/** Undo takes back the last stroke or fill. */
export function undoOps(ops: Op[]): Op[] {
  for (let i = ops.length - 1; i >= 0; i--) {
    const kind = ops[i]![0];
    if (kind === 'b' || kind === 'f') return ops.slice(0, i);
  }
  return [];
}

/** n different words, none used earlier in the game (when the list allows it). */
export function pickWords(pool: string[], used: Set<string>, n: number, random = Math.random): string[] {
  const fresh = pool.filter((w) => !used.has(normalize(w)));
  const source = fresh.length >= n ? fresh : pool;
  const picked = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  while (out.length < Math.min(n, source.length) && guard++ < 1000) {
    const word = source[Math.floor(random() * source.length)]!;
    const key = normalize(word);
    if (picked.has(key)) continue;
    picked.add(key);
    out.push(word);
  }
  return out;
}
