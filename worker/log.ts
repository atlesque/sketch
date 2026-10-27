// The audit log (D1 table `events`): rooms write what happens in them, the admin API writes every admin action.

export interface AuditEvent {
  type: string;
  ts?: number;
  room?: string | null;
  game?: string | null;
  /** A player id, or "admin:<email>". */
  actor?: string | null;
  actorName?: string | null;
  accountId?: string | null;
  accountEmail?: string | null;
  device?: string | null;
  ip?: string | null;
  target?: string | null;
  targetName?: string | null;
  text?: string | null;
  data?: unknown;
}

const INSERT =
  'INSERT INTO events (ts, room_code, game_id, type, actor, actor_name, account_id, account_email, device, ip, target, target_name, text, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

export async function insertEvents(db: D1Database, events: AuditEvent[]): Promise<void> {
  if (!events.length) return;
  const now = Date.now();
  await db.batch(
    events.map((e) =>
      db
        .prepare(INSERT)
        .bind(
          e.ts ?? now,
          e.room ?? null,
          e.game ?? null,
          e.type,
          e.actor ?? null,
          e.actorName ?? null,
          e.accountId ?? null,
          e.accountEmail ?? null,
          e.device ?? null,
          e.ip ?? null,
          e.target ?? null,
          e.targetName ?? null,
          e.text ?? null,
          e.data === undefined ? null : JSON.stringify(e.data),
        ),
    ),
  );
}

export interface BanRow {
  id: number;
  kind: 'account' | 'device' | 'ip';
  value: string;
  reason: string | null;
}

/** An active site-wide ban on any of these identifiers. */
export async function findBan(db: D1Database, ids: { account?: string | null; device?: string | null; ip?: string | null }): Promise<BanRow | null> {
  const pairs = (['account', 'device', 'ip'] as const).flatMap((kind) => (ids[kind] ? [[kind, ids[kind]!] as const] : []));
  if (!pairs.length) return null;
  const where = pairs.map(() => '(kind = ? AND value = ?)').join(' OR ');
  return db
    .prepare(`SELECT id, kind, value, reason FROM bans WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ?) AND (${where}) LIMIT 1`)
    .bind(Date.now(), ...pairs.flat())
    .first<BanRow>();
}
