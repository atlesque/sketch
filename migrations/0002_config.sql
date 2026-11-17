-- Admin settings, one row per key, values as JSON. The global word list the game draws from (/admin/words):
--   'words.extra'      words added to the built-in Dutch list (shared/words-nl.ts), a JSON array
--   'words.removed'    built-in words left out, a JSON array
--   'words.only_extra' true: the game uses only the extra words
-- A room's own custom words still come on top. Who changed what is in the audit log (admin.words).
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
