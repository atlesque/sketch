// The admin's global word list (D1 table config, migrations/0002): extra words on top of the built-in
// Dutch list, built-in words taken out, and whether the game uses only the extra words.

import { wordPool } from '../shared/game.ts';
import { WORDS_NL } from '../shared/words-nl.ts';

export interface WordList {
  extra: string[];
  removed: string[];
  onlyExtra: boolean;
}

export async function loadWordList(db: D1Database): Promise<WordList & { updatedAt: number | null; updatedBy: string | null }> {
  const { results } = await db.prepare("SELECT key, value, updated_at, updated_by FROM config WHERE key LIKE 'words.%'").all<{ key: string; value: string; updated_at: number; updated_by: string }>();
  const get = (key: string) => {
    const row = results.find((r) => r.key === key);
    return row ? (JSON.parse(row.value) as unknown) : null;
  };
  const latest = results.reduce<(typeof results)[number] | null>((a, b) => (!a || b.updated_at > a.updated_at ? b : a), null);
  return {
    extra: Array.isArray(get('words.extra')) ? (get('words.extra') as string[]) : [],
    removed: Array.isArray(get('words.removed')) ? (get('words.removed') as string[]) : [],
    onlyExtra: get('words.only_extra') === true,
    updatedAt: latest?.updated_at ?? null,
    updatedBy: latest?.updated_by ?? null,
  };
}

/** Saves the whole list in one batch (one transaction). */
export async function saveWordList(db: D1Database, list: WordList, email: string): Promise<void> {
  const now = Date.now();
  const set = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)');
  await db.batch([
    set.bind('words.extra', JSON.stringify(list.extra), now, email),
    set.bind('words.removed', JSON.stringify(list.removed), now, email),
    set.bind('words.only_extra', JSON.stringify(list.onlyExtra), now, email),
  ]);
}

/** The words a room draws from; the built-in list when D1 can't be read (or the tables aren't there yet). */
export async function loadPool(db: D1Database): Promise<string[]> {
  try {
    const list = await loadWordList(db);
    return wordPool(WORDS_NL, list.extra, list.removed, list.onlyExtra);
  } catch (error) {
    console.error('word list unavailable', error);
    return WORDS_NL;
  }
}
