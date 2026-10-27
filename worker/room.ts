// One room = one Durable Object, named by its code. It runs the whole game: who draws, the word, the clock, the hints,
// the guesses and the scores. Players connect over hibernatable WebSockets; the state is saved to the object's storage
// after every change and the drawing's ops to its SQLite table, so the room carries on when it wakes from hibernation.
// Everything worth keeping for later goes to D1 (rooms, games, turns, the audit log, account stats) and R2 (drawings).

import { DurableObject } from 'cloudflare:workers';
import {
  checkGuess,
  cleanAvatar,
  cleanName,
  cleanSettings,
  containsWord,
  buildHint,
  drawerPoints,
  guesserPoints,
  hintBudget,
  hintTimes,
  kickNeeded,
  nextHintIndex,
  normalize,
  pickWords,
  rank,
  undoOps,
  validOps,
} from '../shared/game.ts';
import {
  BOARD_H,
  BOARD_W,
  CLOSE,
  DEFAULT_SETTINGS,
  LIMITS,
  TIMES,
  type AdminLive,
  type Avatar,
  type ByeReason,
  type ChatKind,
  type ChatLine,
  type ClientMessage,
  type Gain,
  type Hello,
  type Op,
  type Phase,
  type Ranked,
  type RoomView,
  type ServerMessage,
  type Settings,
  type TurnEndReason,
} from '../shared/protocol.ts';
import { WORDS_NL } from '../shared/words-nl.ts';
import { findBan, insertEvents, type AuditEvent } from './log.ts';
import { playUser, type PlayUser } from './play.ts';

interface Player {
  id: string;
  secret: string;
  name: string;
  avatar: Avatar;
  score: number;
  account: PlayUser | null;
  device: string;
  ip: string;
  country: string;
  joinedAt: number;
  connected: boolean;
  /** When a dropped player's seat is given up. */
  goneAt: number | null;
  guessedAt: number | null;
  turnPoints: number;
  reaction: 'like' | 'dislike' | null;
  muted: boolean;
  /** This game, for the account stats. */
  guesses: number;
  drawings: number;
}

/** Who sees a chat line: everyone, the "inner" circle (drawer + players who guessed), one player, or admins only. */
type Audience = 'all' | 'inner' | 'admin' | { to: string };
interface StoredLine extends ChatLine {
  aud: 'all' | 'inner' | 'admin' | string;
}

interface State {
  code: string;
  isPublic: boolean;
  createdAt: number;
  settings: Settings;
  players: Player[];
  hostId: string | null;
  /** Devices and accounts kicked from this room. */
  roomBans: string[];
  phase: Phase;
  deadline: number | null;
  gameId: string | null;
  round: number;
  turnNo: number;
  /** Who still draws this round, in order. */
  queue: string[];
  drawerId: string | null;
  word: string | null;
  choices: string[] | null;
  /** Normalized words used this game. */
  used: string[];
  revealed: number[];
  /** When the next hints are due (ms). */
  hintAt: number[];
  turnStartedAt: number | null;
  kickVotes: Record<string, string[]>;
  reveal: RoomView['reveal'];
  results: Ranked[] | null;
  chat: StoredLine[];
  chatSeq: number;
  closeAt: number | null;
  /** Report rate limit: "reporter>target" this game. */
  reported: string[];
}

interface Attachment {
  pid: string | null;
  admin: string | null;
  ip: string;
  country: string;
  ua: string;
}

export type AdminAction =
  | { type: 'kick'; id: string; reason?: string }
  | { type: 'ban'; id: string; reason?: string; kinds?: ('account' | 'device' | 'ip')[] }
  | { type: 'mute'; id: string; muted: boolean }
  | { type: 'host'; id: string }
  | { type: 'skip' }
  | { type: 'end' }
  | { type: 'start' }
  | { type: 'close' }
  | { type: 'say'; text: string };

export interface AdminSnapshot {
  live: AdminLive;
  room: RoomView;
  chat: ChatLine[];
  ops: Op[];
}

const CHAT_KEEP = 80;
const MAX_OPS = 60_000;
const GRACE_LOBBY = 15_000;
const GRACE_GAME = 45_000;
const EMPTY_PUBLIC = 60_000;
const EMPTY_PRIVATE = 10 * 60_000;

const randomId = (bytes = 6) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, bytes * 2);
const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);

export class Room extends DurableObject<Env> {
  private s: State | null = null;
  private ops: Op[] = [];
  private events: AuditEvent[] = [];
  private pending: Promise<unknown>[] = [];
  private rates = new Map<string, number[]>();
  private lastRow = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.ensureOpsTable();
      this.s = (await ctx.storage.get<State>('state')) ?? null;
      this.ops = this.s ? ctx.storage.sql.exec<{ data: string }>('SELECT data FROM ops ORDER BY id').toArray().flatMap((row) => JSON.parse(row.data) as Op[]) : [];
    });
  }

  // ---------- called by the Worker ----------

  /** Sets up a new room. Answers false when the code is already taken. */
  async create(code: string, isPublic: boolean, settings?: Partial<Settings>): Promise<boolean> {
    if (this.s) return false;
    const now = Date.now();
    this.s = {
      code,
      isPublic,
      createdAt: now,
      settings: isPublic ? { ...DEFAULT_SETTINGS, maxPlayers: 12 } : cleanSettings(settings),
      players: [],
      hostId: null,
      roomBans: [],
      phase: 'lobby',
      deadline: null,
      gameId: null,
      round: 0,
      turnNo: 0,
      queue: [],
      drawerId: null,
      word: null,
      choices: null,
      used: [],
      revealed: [],
      hintAt: [],
      turnStartedAt: null,
      kickVotes: {},
      reveal: null,
      results: null,
      chat: [],
      chatSeq: 0,
      // a room nobody enters closes by itself
      closeAt: now + (isPublic ? EMPTY_PUBLIC : EMPTY_PRIVATE),
      reported: [],
    };
    this.bg(
      this.env.DB.prepare('INSERT INTO rooms (code, public, players, max_players, phase, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?)')
        .bind(code, isPublic ? 1 : 0, this.s.settings.maxPlayers, 'lobby', now, now)
        .run(),
    );
    this.lastRow = JSON.stringify([0, this.s.settings.maxPlayers, 'lobby', null]);
    this.log({ type: 'room.create', data: { public: isPublic, settings: this.s.settings } });
    this.commit();
    await this.drain();
    return true;
  }

  async info() {
    const s = this.s;
    if (!s) return { exists: false as const };
    return { exists: true as const, isPublic: s.isPublic, players: s.players.length, maxPlayers: s.settings.maxPlayers, phase: s.phase };
  }

  async adminSnapshot(): Promise<AdminSnapshot | null> {
    if (!this.s) return null;
    return { live: this.adminLive(), room: this.view(null, true), chat: this.chatFor(null, true), ops: this.ops };
  }

  async adminAction(email: string, action: AdminAction): Promise<{ ok: boolean; message?: string }> {
    const s = this.s;
    if (!s) return { ok: false, message: 'This room is closed.' };
    const actor = `admin:${email}`;
    const target = 'id' in action ? this.player(action.id) : undefined;
    if ('id' in action && !target) return { ok: false, message: 'That player is no longer in the room.' };
    const audit = (type: string, extra: Partial<AuditEvent> = {}) =>
      this.log({ type, actor, actorName: email, target: target?.id, targetName: target?.name, accountId: target?.account?.id, accountEmail: target?.account?.email, device: target?.device, ip: target?.ip, ...extra });

    switch (action.type) {
      case 'kick':
        audit('admin.kick', { text: action.reason ?? null });
        this.kickOut(target!, 'kicked', action.reason ? `Je bent uit de kamer gezet: ${action.reason}` : 'Je bent uit de kamer gezet door de beheerder.');
        break;
      case 'ban': {
        const kinds: ('account' | 'device' | 'ip')[] = action.kinds?.length ? action.kinds : ['account', 'device'];
        const now = Date.now();
        const values: [string, string][] = [];
        if (kinds.includes('account') && target!.account) values.push(['account', target!.account.id]);
        if (kinds.includes('device') && target!.device) values.push(['device', target!.device]);
        if (kinds.includes('ip') && target!.ip) values.push(['ip', target!.ip]);
        const label = target!.account ? `${target!.name} (${target!.account.email})` : target!.name;
        if (values.length)
          this.bg(
            this.env.DB.batch(
              values.map(([kind, value]) =>
                this.env.DB.prepare('INSERT INTO bans (kind, value, label, reason, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(kind, value, label, action.reason ?? null, now, email),
              ),
            ),
          );
        audit('admin.ban', { text: action.reason ?? null, data: { kinds: values.map(([kind]) => kind) } });
        this.kickOut(target!, 'banned', action.reason ? `Je bent uitgesloten van Sketch: ${action.reason}` : 'Je bent uitgesloten van Sketch.');
        break;
      }
      case 'mute':
        target!.muted = action.muted;
        audit(action.muted ? 'admin.mute' : 'admin.unmute');
        this.addChat({ kind: 'warn', text: action.muted ? 'De beheerder heeft je gedempt.' : 'Je mag weer chatten.' }, { to: target!.id });
        break;
      case 'host':
        if (s.isPublic) return { ok: false, message: 'Public rooms have no host.' };
        s.hostId = target!.id;
        audit('admin.host');
        this.addChat({ kind: 'info', text: `${target!.name} is nu de host.` }, 'all');
        break;
      case 'skip':
        if (s.phase !== 'choosing' && s.phase !== 'drawing') return { ok: false, message: 'Nobody is drawing right now.' };
        audit('admin.skip', { data: { word: s.word } });
        this.addChat({ kind: 'admin', text: 'De beheerder heeft deze beurt overgeslagen.' }, 'all');
        this.endTurn('skipped');
        break;
      case 'end':
        if (!s.gameId) return { ok: false, message: 'No game is running.' };
        audit('admin.end');
        this.addChat({ kind: 'admin', text: 'De beheerder heeft het spel beëindigd.' }, 'all');
        this.endGame('admin');
        break;
      case 'start':
        if (s.phase !== 'lobby' && s.phase !== 'results') return { ok: false, message: 'A game is already running.' };
        if (this.connected().length < 2) return { ok: false, message: 'At least two players are needed.' };
        audit('admin.start');
        this.startGame();
        break;
      case 'close':
        audit('admin.close');
        await this.closeRoom('admin');
        await this.drain();
        return { ok: true };
      case 'say': {
        const text = String(action.text ?? '').trim().slice(0, 200);
        if (!text) return { ok: false, message: 'Type a message.' };
        audit('admin.say', { text });
        this.addChat({ kind: 'admin', text: `Beheerder: ${text}` }, 'all');
        break;
      }
    }
    this.commit();
    await this.drain();
    return { ok: true };
  }

  /** WebSocket upgrades, forwarded by the Worker with the client's IP and country (and the admin's email for spectators). */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const admin = request.headers.get('x-sketch-admin');
    const attachment: Attachment = {
      pid: null,
      admin,
      ip: request.headers.get('x-sketch-ip') ?? '',
      country: request.headers.get('x-sketch-country') ?? '',
      ua: (request.headers.get('user-agent') ?? '').slice(0, 300),
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    if (!this.s) {
      this.bye(server, 'gone', 'Deze kamer bestaat niet (meer).');
    } else if (admin) {
      this.send(server, { t: 'welcome', you: '', secret: '', room: this.view(null, true), ops: this.ops, chat: this.chatFor(null, true), account: null });
      this.send(server, { t: 'admin', live: this.adminLive() });
      this.log({ type: 'admin.spectate', actor: `admin:${admin}`, actorName: admin, ip: attachment.ip });
      await this.drain();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- WebSocket events ----------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 64_000) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    if (att.admin) return; // spectators only watch; admin actions go through the HTTP API
    if (!this.s) return this.bye(ws, 'gone', 'Deze kamer bestaat niet (meer).');
    if (!att.pid) {
      if (msg.t === 'hello') await this.hello(ws, att, msg);
      await this.drain();
      return;
    }
    const p = this.player(att.pid);
    if (!p) return this.bye(ws, 'gone', 'Je zit niet meer in deze kamer.');
    this.handle(p, msg);
    this.commit();
    await this.drain();
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      /* already closed */
    }
    this.dropped(ws);
    await this.drain();
  }

  async webSocketError(ws: WebSocket) {
    this.dropped(ws);
    await this.drain();
  }

  async alarm() {
    const s = this.s;
    if (!s) return;
    const now = Date.now();
    for (const p of [...s.players]) if (!p.connected && p.goneAt && p.goneAt <= now) this.removePlayer(p, 'timeout');
    if (s.phase === 'drawing' && s.word) {
      while (s.hintAt.length && s.hintAt[0]! <= now + 50) {
        s.hintAt.shift();
        const index = nextHintIndex(s.word, s.revealed);
        if (index >= 0) s.revealed.push(index);
      }
    }
    if (s.deadline && s.deadline <= now + 50) {
      if (s.phase === 'lobby') {
        this.startGame();
        if (s.phase === 'lobby') s.deadline = null;
      } else if (s.phase === 'choosing') this.beginDrawing(s.choices![Math.floor(Math.random() * s.choices!.length)]!);
      else if (s.phase === 'drawing') this.endTurn('time');
      else if (s.phase === 'reveal') this.nextTurn();
      else if (s.phase === 'results') this.toLobby();
    }
    if (s.closeAt && s.closeAt <= now) {
      if (!this.connected().length) {
        await this.closeRoom('empty');
        await this.drain();
        return;
      }
      s.closeAt = null;
    }
    this.commit();
    await this.drain();
  }

  // ---------- joining and leaving ----------

  private async hello(ws: WebSocket, att: Attachment, msg: Hello) {
    const name = cleanName(msg.name);
    const avatar = cleanAvatar(msg.avatar);
    const device = typeof msg.device === 'string' && msg.device ? msg.device.slice(0, 64) : `anon-${randomId()}`;
    let account: PlayUser | null = null;
    if (typeof msg.token === 'string' && msg.token) {
      const result = await playUser(this.env, msg.token);
      if (result === 'signed_out') this.send(ws, { t: 'signedout' });
      else if (result) account = result;
    }
    const ban = await findBan(this.env.DB, { account: account?.id, device, ip: att.ip });
    const s = this.s;
    if (!s) return this.bye(ws, 'gone', 'Deze kamer bestaat niet (meer).');
    const who = { actorName: name, accountId: account?.id, accountEmail: account?.email, device, ip: att.ip };
    if (ban) {
      this.log({ type: 'join.banned', ...who, data: { ban: ban.id, kind: ban.kind } });
      return this.bye(ws, 'banned', ban.reason ? `Je bent uitgesloten van Sketch: ${ban.reason}` : 'Je bent uitgesloten van Sketch.');
    }
    if (s.roomBans.includes(device) || (account && s.roomBans.includes(account.id))) {
      this.log({ type: 'join.kicked', ...who });
      return this.bye(ws, 'kicked', 'Je bent uit deze kamer gezet.');
    }

    let p = typeof msg.secret === 'string' && msg.secret ? s.players.find((x) => x.secret === msg.secret) : undefined;
    const now = Date.now();
    if (p) {
      for (const other of this.socketsOf(p.id)) if (other !== ws) this.bye(other, 'replaced', 'Je speelt verder in een ander venster.');
      p.connected = true;
      p.goneAt = null;
      p.account = account;
      p.ip = att.ip;
      this.log({ type: 'player.rejoin', actor: p.id, ...who });
    } else {
      if (s.players.length >= s.settings.maxPlayers) {
        this.log({ type: 'join.full', ...who });
        return this.bye(ws, 'full', 'Deze kamer is vol.');
      }
      p = {
        id: randomId(),
        secret: randomSecret(),
        name,
        avatar,
        score: 0,
        account,
        device,
        ip: att.ip,
        country: att.country,
        joinedAt: now,
        connected: true,
        goneAt: null,
        guessedAt: null,
        turnPoints: 0,
        reaction: null,
        muted: false,
        guesses: 0,
        drawings: 0,
      };
      s.players.push(p);
      if (!s.isPublic && !this.player(s.hostId)) s.hostId = p.id;
      // players arriving during a game draw later this round
      if (s.gameId) s.queue.push(p.id);
      this.addChat({ kind: 'info', text: `${p.name} doet mee.` }, 'all');
      this.log({ type: 'player.join', actor: p.id, ...who, data: { country: att.country, ua: att.ua } });
    }
    att.pid = p.id;
    ws.serializeAttachment(att);
    s.closeAt = null;
    this.send(ws, { t: 'welcome', you: p.id, secret: p.secret, room: this.view(p.id), ops: this.ops, chat: this.chatFor(p.id), account: account ? { email: account.email } : null });
    this.autoStart();
    this.commit();
  }

  /** A socket closed: its player keeps their seat for a while, then loses it (alarm). */
  private dropped(ws: WebSocket) {
    const s = this.s;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!s || !att?.pid) return;
    const p = this.player(att.pid);
    if (!p || !p.connected || this.socketsOf(p.id).some((other) => other !== ws)) return;
    p.connected = false;
    p.goneAt = Date.now() + (s.gameId ? GRACE_GAME : GRACE_LOBBY);
    this.log({ type: 'player.disconnect', actor: p.id, actorName: p.name, device: p.device });
    this.checkTurn();
    if (!this.connected().length) s.closeAt = Date.now() + (s.isPublic ? EMPTY_PUBLIC : EMPTY_PRIVATE);
    this.autoStart();
    this.commit();
  }

  private removePlayer(p: Player, why: 'left' | 'timeout' | 'kicked' | 'banned') {
    const s = this.s!;
    s.players = s.players.filter((x) => x !== p);
    s.queue = s.queue.filter((id) => id !== p.id);
    delete s.kickVotes[p.id];
    for (const id of Object.keys(s.kickVotes)) s.kickVotes[id] = s.kickVotes[id]!.filter((voter) => voter !== p.id);
    if (why === 'left' || why === 'timeout') this.addChat({ kind: 'info', text: `${p.name} is weggegaan.` }, 'all');
    this.log({ type: 'player.leave', actor: p.id, actorName: p.name, accountId: p.account?.id, accountEmail: p.account?.email, device: p.device, data: { why, score: p.score } });
    if (s.hostId === p.id) {
      const next = this.connected()[0] ?? s.players[0];
      s.hostId = s.isPublic ? null : next?.id ?? null;
      if (next && !s.isPublic) this.addChat({ kind: 'info', text: `${next.name} is nu de host.` }, 'all');
    }
    this.checkTurn(p.id);
    if (!this.connected().length) s.closeAt = Date.now() + (s.isPublic ? EMPTY_PUBLIC : EMPTY_PRIVATE);
    this.autoStart();
  }

  private kickOut(p: Player, reason: 'kicked' | 'banned', message: string) {
    const s = this.s!;
    if (!s.roomBans.includes(p.device)) s.roomBans.push(p.device);
    if (p.account && !s.roomBans.includes(p.account.id)) s.roomBans.push(p.account.id);
    for (const ws of this.socketsOf(p.id)) this.bye(ws, reason, message);
    this.addChat({ kind: 'warn', text: `${p.name} is uit de kamer gezet.` }, 'all');
    this.removePlayer(p, reason);
  }

  // ---------- messages from players ----------

  private handle(p: Player, msg: ClientMessage) {
    const s = this.s!;
    const isHost = !s.isPublic && s.hostId === p.id;
    switch (msg.t) {
      case 'chat':
        return this.chat(p, msg.text);
      case 'draw':
        if (s.phase !== 'drawing' || s.drawerId !== p.id || !validOps(msg.ops) || this.ops.length > MAX_OPS) return;
        this.ops.push(...msg.ops);
        this.ctx.storage.sql.exec('INSERT INTO ops (data) VALUES (?)', JSON.stringify(msg.ops));
        return this.relay(p.id, { t: 'draw', ops: msg.ops });
      case 'undo':
        if (s.phase !== 'drawing' || s.drawerId !== p.id) return;
        this.ops = undoOps(this.ops);
        this.ctx.storage.sql.exec('DELETE FROM ops');
        if (this.ops.length) this.ctx.storage.sql.exec('INSERT INTO ops (data) VALUES (?)', JSON.stringify(this.ops));
        return this.relay(p.id, { t: 'undo' });
      case 'clear':
        if (s.phase !== 'drawing' || s.drawerId !== p.id) return;
        this.clearOps();
        return this.relay(p.id, { t: 'clear' });
      case 'pick':
        if (s.phase === 'choosing' && s.drawerId === p.id && s.choices?.[msg.index]) this.beginDrawing(s.choices[msg.index]!);
        return;
      case 'start':
        if (!isHost) return this.error(p, 'Alleen de host kan het spel starten.');
        if (s.phase !== 'lobby' && s.phase !== 'results') return;
        if (this.connected().length < 2) return this.error(p, 'Er zijn minstens twee spelers nodig.');
        return this.startGame();
      case 'settings': {
        if (!isHost || s.phase !== 'lobby') return;
        const input = msg.settings ?? {};
        const before = s.settings;
        const next = cleanSettings(input, before);
        next.maxPlayers = Math.max(next.maxPlayers, s.players.length);
        s.settings = next;
        const changed = (Object.keys(next) as (keyof Settings)[]).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]));
        if (changed.length)
          this.log({
            type: 'settings.change',
            actor: p.id,
            actorName: p.name,
            data: Object.fromEntries(changed.map((key) => [key, key === 'customWords' ? `${next.customWords.length} words` : next[key]])),
          });
        if (input.customWords !== undefined && JSON.stringify(next.customWords) !== JSON.stringify(before.customWords))
          this.log({ type: 'settings.words', actor: p.id, actorName: p.name, text: next.customWords.join(', ').slice(0, 4000) });
        return;
      }
      case 'kick': {
        const target = this.player(msg.id);
        if (!isHost) return this.error(p, 'Alleen de host kan spelers uit de kamer zetten.');
        if (!target || target.id === p.id) return;
        this.log({ type: 'host.kick', actor: p.id, actorName: p.name, target: target.id, targetName: target.name, accountId: target.account?.id, accountEmail: target.account?.email, device: target.device, ip: target.ip });
        return this.kickOut(target, 'kicked', `${p.name} (host) heeft je uit de kamer gezet.`);
      }
      case 'host': {
        const target = this.player(msg.id);
        if (!isHost || !target || target.id === p.id) return;
        s.hostId = target.id;
        this.addChat({ kind: 'info', text: `${target.name} is nu de host.` }, 'all');
        this.log({ type: 'host.transfer', actor: p.id, actorName: p.name, target: target.id, targetName: target.name });
        return;
      }
      case 'votekick': {
        const target = this.player(msg.id);
        if (!target || target.id === p.id) return;
        const votes = (s.kickVotes[target.id] ??= []);
        if (votes.includes(p.id)) return;
        votes.push(p.id);
        const needed = kickNeeded(this.connected().length);
        this.addChat({ kind: 'warn', text: `${p.name} wil ${target.name} uit de kamer zetten (${votes.length}/${needed}).` }, 'all');
        this.log({ type: 'votekick.vote', actor: p.id, actorName: p.name, target: target.id, targetName: target.name, data: { votes: votes.length, needed } });
        if (votes.length >= needed) {
          this.log({ type: 'votekick.kick', target: target.id, targetName: target.name, accountId: target.account?.id, accountEmail: target.account?.email, device: target.device, ip: target.ip, data: { voters: votes } });
          this.kickOut(target, 'kicked', 'De andere spelers hebben je uit de kamer gestemd.');
        }
        return;
      }
      case 'react': {
        if (s.phase !== 'drawing' || p.id === s.drawerId || p.reaction || (msg.kind !== 'like' && msg.kind !== 'dislike')) return;
        p.reaction = msg.kind;
        const drawer = this.player(s.drawerId);
        this.addChat({ kind: msg.kind === 'like' ? 'good' : 'bad', text: msg.kind === 'like' ? `${p.name} vindt de tekening leuk!` : `${p.name} vindt de tekening niet leuk.` }, 'all');
        this.log({ type: `react.${msg.kind}`, actor: p.id, actorName: p.name, target: drawer?.id, targetName: drawer?.name });
        return;
      }
      case 'report': {
        const target = this.player(msg.id);
        const key = `${p.id}>${msg.id}`;
        if (!target || target.id === p.id || s.reported.includes(key)) return;
        s.reported.push(key);
        const reason = String(msg.reason ?? '').trim().slice(0, 300) || 'Geen reden opgegeven';
        this.bg(
          this.env.DB.prepare(
            'INSERT INTO reports (ts, room_code, game_id, turn_idx, reporter_id, reporter_name, reporter_account, target_id, target_name, target_account, target_device, reason, word) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
            .bind(Date.now(), s.code, s.gameId, s.gameId ? s.turnNo : null, p.id, p.name, p.account?.email ?? null, target.id, target.name, target.account?.email ?? null, target.device, reason, target.id === s.drawerId ? s.word : null)
            .run(),
        );
        this.log({ type: 'report', actor: p.id, actorName: p.name, target: target.id, targetName: target.name, accountEmail: target.account?.email, device: target.device, text: reason });
        this.addChat({ kind: 'info', text: `Bedankt. De beheerder bekijkt je melding over ${target.name}.` }, { to: p.id });
        return;
      }
      case 'leave':
        for (const ws of this.socketsOf(p.id)) this.bye(ws, 'closed', 'Tot de volgende keer!');
        return this.removePlayer(p, 'left');
    }
  }

  private chat(p: Player, input: unknown) {
    const s = this.s!;
    const text = String(input ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.chat);
    if (!text) return;
    const now = Date.now();
    const recent = (this.rates.get(p.id) ?? []).filter((t) => now - t < 4000);
    if (recent.length >= 6) return this.error(p, 'Rustig aan, je stuurt te veel berichten.');
    recent.push(now);
    this.rates.set(p.id, recent);
    const who = { actor: p.id, actorName: p.name, accountId: p.account?.id, accountEmail: p.account?.email, device: p.device };
    if (p.muted) {
      this.log({ type: 'chat.muted', ...who, text });
      return this.addChat({ kind: 'warn', text: 'Je bent gedempt door de beheerder.' }, { to: p.id });
    }
    if (s.phase === 'drawing' && s.word) {
      if (p.id === s.drawerId || p.guessedAt) {
        if (p.id === s.drawerId && containsWord(text, s.word)) {
          this.log({ type: 'chat.blocked', ...who, text, data: { word: s.word } });
          this.addChat({ kind: 'msg', text, from: p.id, name: p.name, hidden: true }, 'admin');
          return this.addChat({ kind: 'warn', text: 'Je mag het woord niet verklappen!' }, { to: p.id });
        }
        this.log({ type: 'chat', ...who, text, data: { inner: true } });
        return this.addChat({ kind: 'msg', text, from: p.id, name: p.name, inner: true }, 'inner');
      }
      const result = checkGuess(text, s.word);
      if (result === 'correct') {
        this.log({ type: 'guess.correct', ...who, text, data: { word: s.word } });
        this.addChat({ kind: 'msg', text, from: p.id, name: p.name, hidden: true }, 'admin');
        return this.correctGuess(p);
      }
      this.log({ type: result === 'close' ? 'guess.close' : 'chat', ...who, text });
      this.addChat({ kind: 'msg', text, from: p.id, name: p.name }, 'all');
      if (result === 'close') this.addChat({ kind: 'close', text: `'${text}' is bijna goed!` }, { to: p.id });
      return;
    }
    this.log({ type: 'chat', ...who, text });
    this.addChat({ kind: 'msg', text, from: p.id, name: p.name }, 'all');
  }

  // ---------- the game ----------

  private startGame() {
    const s = this.s!;
    const ready = this.connected();
    if (ready.length < 2) return;
    const now = Date.now();
    s.gameId = crypto.randomUUID();
    s.round = 1;
    s.turnNo = 0;
    s.used = [];
    s.results = null;
    s.reveal = null;
    s.kickVotes = {};
    s.reported = [];
    for (const p of s.players) Object.assign(p, { score: 0, guesses: 0, drawings: 0, guessedAt: null, turnPoints: 0, reaction: null });
    s.queue = ready.map((p) => p.id);
    this.bg(
      this.env.DB.prepare('INSERT INTO games (id, room_code, public, settings, started_at) VALUES (?, ?, ?, ?, ?)')
        .bind(s.gameId, s.code, s.isPublic ? 1 : 0, JSON.stringify({ ...s.settings, customWords: s.settings.customWords.length }), now)
        .run(),
    );
    this.log({ type: 'game.start', data: { players: ready.map((p) => ({ id: p.id, name: p.name, account: p.account?.email ?? null })), settings: { ...s.settings, customWords: s.settings.customWords.length } } });
    this.addChat({ kind: 'info', text: 'Het spel begint!' }, 'all');
    this.nextTurn();
  }

  private nextTurn() {
    const s = this.s!;
    const connected = this.connected();
    this.resetTurn();
    if (connected.length < 2) return this.endGame('not_enough_players');
    s.queue = s.queue.filter((id) => connected.some((p) => p.id === id));
    if (!s.queue.length) {
      if (s.round >= s.settings.rounds) return this.endGame('finished');
      s.round++;
      s.queue = connected.map((p) => p.id);
      this.addChat({ kind: 'info', text: `Ronde ${s.round} van ${s.settings.rounds}.` }, 'all');
    }
    s.drawerId = s.queue.shift()!;
    s.turnNo++;
    const drawer = this.player(s.drawerId)!;
    const words = this.pickChoices();
    if (words.length <= 1) return this.beginDrawing(words[0] ?? 'appel');
    s.phase = 'choosing';
    s.choices = words;
    s.deadline = Date.now() + TIMES.choose * 1000;
    this.addChat({ kind: 'info', text: `${drawer.name} kiest een woord.` }, 'all');
  }

  /** The drawer's choices: custom words get half the slots when the room has them, unless the room uses only those. */
  private pickChoices(): string[] {
    const s = this.s!;
    const used = new Set(s.used);
    const n = s.settings.wordChoices;
    const custom = s.settings.customWords;
    if (s.settings.customOnly && custom.length) return pickWords(custom, used, n);
    let fromCustom = 0;
    if (custom.length) for (let i = 0; i < n; i++) if (Math.random() < 0.5) fromCustom++;
    const picked = pickWords(custom, used, Math.min(fromCustom, custom.length));
    for (const word of picked) used.add(normalize(word));
    return [...picked, ...pickWords(WORDS_NL, used, n - picked.length)].sort(() => Math.random() - 0.5);
  }

  private beginDrawing(word: string) {
    const s = this.s!;
    const now = Date.now();
    const drawer = this.player(s.drawerId);
    s.phase = 'drawing';
    s.word = word;
    s.choices = null;
    s.used.push(normalize(word));
    s.turnStartedAt = now;
    s.deadline = now + s.settings.drawTime * 1000;
    const budget = s.settings.wordMode === 'hidden' ? 0 : hintBudget(word, s.settings.hints);
    s.hintAt = hintTimes(s.settings.drawTime, budget).map((ms) => now + ms);
    s.revealed = [];
    for (const p of s.players) Object.assign(p, { guessedAt: null, turnPoints: 0, reaction: null });
    if (drawer) drawer.drawings++;
    this.clearOps();
    this.relay(null, { t: 'clear' });
    this.addChat({ kind: 'info', text: `${drawer?.name ?? 'Iemand'} is aan het tekenen!` }, 'all');
    this.log({ type: 'turn.start', actor: drawer?.id, actorName: drawer?.name, accountEmail: drawer?.account?.email, text: word, data: { round: s.round, turn: s.turnNo } });
  }

  private correctGuess(p: Player) {
    const s = this.s!;
    const now = Date.now();
    p.guessedAt = now;
    const order = s.players.filter((x) => x.guessedAt).length;
    const points = guesserPoints(Math.max(0, (s.deadline ?? now) - now), s.settings.drawTime * 1000, order);
    p.score += points;
    p.turnPoints = points;
    p.guesses++;
    this.addChat({ kind: 'correct', text: `${p.name} heeft het woord geraden!`, from: p.id }, 'all');
    this.checkTurn();
  }

  /** Ends the drawing turn when it can't go on: the drawer is gone, nobody is left to guess, or everyone guessed. */
  private checkTurn(removedId?: string) {
    const s = this.s!;
    if (s.phase !== 'drawing' && s.phase !== 'choosing') return;
    const drawer = this.player(s.drawerId);
    if (!drawer || !drawer.connected || removedId === s.drawerId) return this.endTurn('drawer_left');
    if (s.phase !== 'drawing') return;
    const guessers = s.players.filter((p) => p.connected && p.id !== s.drawerId);
    if (!guessers.length) return this.endTurn('skipped');
    if (guessers.every((p) => p.guessedAt)) this.endTurn('all_guessed');
  }

  private endTurn(reason: TurnEndReason) {
    const s = this.s!;
    if (s.phase !== 'drawing' && s.phase !== 'choosing') return;
    const now = Date.now();
    const drawer = this.player(s.drawerId);
    const eligible = s.players.filter((p) => p.id !== s.drawerId && (p.connected || p.guessedAt));
    const guessed = eligible.filter((p) => p.guessedAt);
    if (drawer && s.phase === 'drawing' && reason !== 'skipped') {
      drawer.turnPoints = drawerPoints(guessed.length, eligible.length);
      drawer.score += drawer.turnPoints;
    }
    const gains: Gain[] = s.players.map((p) => ({ id: p.id, name: p.name, points: p.turnPoints })).sort((a, b) => b.points - a.points);
    const word = s.phase === 'drawing' ? s.word ?? '' : '';
    s.reveal = { word, reason, drawerId: s.drawerId, gains };
    if (word) this.addChat({ kind: 'info', text: `Het woord was: ${word}` }, 'all');
    else this.addChat({ kind: 'warn', text: 'Deze beurt is overgeslagen.' }, 'all');

    if (s.gameId && word) {
      const likes = s.players.filter((p) => p.reaction === 'like').length;
      const dislikes = s.players.filter((p) => p.reaction === 'dislike').length;
      const key = this.ops.length ? `games/${s.gameId}/${String(s.turnNo).padStart(3, '0')}.json` : null;
      if (key)
        this.bg(
          this.env.DRAWINGS.put(key, JSON.stringify({ w: BOARD_W, h: BOARD_H, word, drawer: drawer?.name ?? null, ops: this.ops }), {
            httpMetadata: { contentType: 'application/json' },
          }),
        );
      this.bg(
        this.env.DB.prepare(
          'INSERT OR REPLACE INTO turns (game_id, idx, round, drawer_id, drawer_name, word, started_at, ended_at, end_reason, guessed, eligible, likes, dislikes, drawing_key, gains) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
          .bind(s.gameId, s.turnNo, s.round, drawer?.id ?? null, drawer?.name ?? null, word, s.turnStartedAt, now, reason, guessed.length, eligible.length, likes, dislikes, key, JSON.stringify(gains.filter((g) => g.points)))
          .run(),
      );
    }
    this.log({ type: 'turn.end', actor: drawer?.id, actorName: drawer?.name, text: word || null, data: { reason, guessed: guessed.length, eligible: eligible.length, gains: gains.filter((g) => g.points) } });
    s.phase = 'reveal';
    s.word = word || null;
    s.choices = null;
    s.hintAt = [];
    s.deadline = now + TIMES.reveal * 1000;
  }

  private endGame(reason: 'finished' | 'not_enough_players' | 'admin' | 'closed') {
    const s = this.s!;
    // a turn cut short still goes on record (word, drawing, points so far)
    if (s.phase === 'drawing' || s.phase === 'choosing') this.endTurn('skipped');
    const now = Date.now();
    if (s.gameId) {
      const ranked = rank(s.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score })));
      const winner = ranked[0] && ranked[0].score > 0 ? ranked[0] : null;
      const summary = ranked.map((r) => ({ id: r.id, name: r.name, score: r.score, rank: r.rank, account: this.player(r.id)?.account?.email ?? null }));
      this.bg(
        this.env.DB.prepare('UPDATE games SET ended_at = ?, end_reason = ?, players = ?, winner_name = ?, turns = ? WHERE id = ?')
          .bind(now, reason, JSON.stringify(summary), winner?.name ?? null, s.turnNo, s.gameId)
          .run(),
      );
      const accounts = s.players.filter((p) => p.account);
      if (accounts.length && s.turnNo > 0)
        this.bg(
          this.env.DB.batch(
            accounts.map((p) =>
              this.env.DB.prepare(
                `INSERT INTO account_stats (account_id, email, name, games, wins, points, guesses, drawings, first_played, last_played) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (account_id) DO UPDATE SET email = excluded.email, name = excluded.name, games = games + 1, wins = wins + excluded.wins,
                 points = points + excluded.points, guesses = guesses + excluded.guesses, drawings = drawings + excluded.drawings, last_played = excluded.last_played`,
              ).bind(p.account!.id, p.account!.email, p.name, reason === 'finished' && ranked.find((r) => r.id === p.id)?.rank === 1 && p.score > 0 ? 1 : 0, p.score, p.guesses, p.drawings, now, now),
            ),
          ),
        );
      this.log({ type: 'game.end', data: { reason, turns: s.turnNo, ranking: summary } });
      if (reason === 'not_enough_players') this.addChat({ kind: 'warn', text: 'Het spel is gestopt: er zijn niet genoeg spelers meer.' }, 'all');
      s.gameId = null;
      if (s.turnNo > 0 && reason !== 'closed') {
        this.resetTurn();
        s.queue = [];
        s.phase = 'results';
        s.results = ranked;
        s.deadline = now + TIMES.results * 1000;
        return;
      }
    }
    this.resetTurn();
    s.queue = [];
    this.toLobby();
  }

  private toLobby() {
    const s = this.s!;
    s.phase = 'lobby';
    s.results = null;
    s.reveal = null;
    s.deadline = null;
    s.round = 0;
    s.turnNo = 0;
    this.autoStart();
  }

  private resetTurn() {
    const s = this.s!;
    s.drawerId = null;
    s.word = null;
    s.choices = null;
    s.revealed = [];
    s.hintAt = [];
    s.reveal = null;
    s.turnStartedAt = null;
    s.deadline = null;
    for (const p of s.players) Object.assign(p, { guessedAt: null, turnPoints: 0, reaction: null });
  }

  /** Public rooms start a game by themselves once two players are in. */
  private autoStart() {
    const s = this.s!;
    if (!s.isPublic || s.phase !== 'lobby') return;
    const enough = this.connected().length >= 2;
    if (enough && !s.deadline) s.deadline = Date.now() + TIMES.publicStart * 1000;
    if (!enough) s.deadline = null;
  }

  private async closeRoom(reason: 'empty' | 'admin') {
    const s = this.s;
    if (!s) return;
    if (s.gameId) this.endGame('closed');
    for (const ws of this.ctx.getWebSockets()) this.bye(ws, 'closed', reason === 'admin' ? 'De beheerder heeft deze kamer gesloten.' : 'Deze kamer is gesloten.');
    this.log({ type: 'room.close', data: { reason } });
    const now = Date.now();
    this.bg(this.env.DB.prepare('UPDATE rooms SET closed_at = ?, players = 0, updated_at = ? WHERE code = ?').bind(now, now, s.code).run());
    this.s = null;
    this.ops = [];
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.ensureOpsTable();
  }

  // ---------- views ----------

  private view(pid: string | null, admin = false): RoomView {
    const s = this.s!;
    const me = pid ? this.player(pid) : undefined;
    const knows = admin || s.phase === 'reveal' || (!!me && (me.id === s.drawerId || !!me.guessedAt));
    let hint: RoomView['hint'] = null;
    if (s.word && s.phase === 'drawing') {
      if (knows) hint = [...s.word];
      else if (s.settings.wordMode !== 'hidden') hint = buildHint(s.word, s.revealed);
    }
    const connected = this.connected().length;
    return {
      code: s.code,
      isPublic: s.isPublic,
      phase: s.phase,
      settings: s.settings,
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        guessed: !!p.guessedAt,
        connected: p.connected,
        account: !!p.account,
        reaction: p.reaction,
      })),
      hostId: s.hostId,
      drawerId: s.drawerId,
      round: s.round,
      deadline: s.deadline,
      now: Date.now(),
      hint,
      word: knows ? s.word : null,
      reveal: s.reveal,
      results: s.results,
      choices: s.phase === 'choosing' && (admin || me?.id === s.drawerId) ? s.choices : null,
      kickVotes: Object.fromEntries(Object.entries(s.kickVotes).map(([id, voters]) => [id, voters.length])),
      kickNeeded: kickNeeded(connected),
    };
  }

  private adminLive(): AdminLive {
    const s = this.s!;
    return {
      code: s.code,
      isPublic: s.isPublic,
      phase: s.phase,
      gameId: s.gameId,
      round: s.round,
      turn: s.turnNo,
      word: s.word,
      choices: s.choices,
      createdAt: s.createdAt,
      spectators: this.ctx.getWebSockets().flatMap((ws) => {
        const att = ws.deserializeAttachment() as Attachment | null;
        return att?.admin ? [att.admin] : [];
      }),
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        connected: p.connected,
        guessed: !!p.guessedAt,
        muted: p.muted,
        host: s.hostId === p.id,
        drawer: s.drawerId === p.id,
        device: p.device,
        ip: p.ip,
        country: p.country,
        account: p.account,
        joinedAt: p.joinedAt,
      })),
    };
  }

  private chatFor(pid: string | null, admin = false): ChatLine[] {
    const s = this.s!;
    const me = pid ? this.player(pid) : undefined;
    const inner = admin || (!!me && (me.id === s.drawerId || !!me.guessedAt));
    return s.chat
      .filter((line) => line.aud === 'all' || (line.aud === 'inner' && inner) || (line.aud === 'admin' && admin) || (!!pid && line.aud === pid))
      .map(({ aud: _aud, ...line }) => line);
  }

  // ---------- sending ----------

  private addChat(line: Omit<ChatLine, 'id'>, aud: Audience) {
    const s = this.s!;
    const stored: StoredLine = { ...line, id: ++s.chatSeq, aud: typeof aud === 'string' ? aud : aud.to };
    s.chat.push(stored);
    if (s.chat.length > CHAT_KEEP) s.chat.splice(0, s.chat.length - CHAT_KEEP);
    const { aud: _aud, ...out } = stored;
    const msg = JSON.stringify({ t: 'chat', line: out } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const me = att.pid ? this.player(att.pid) : undefined;
      const ok = att.admin
        ? typeof aud === 'string'
        : !!me &&
          (aud === 'all' || (aud === 'inner' && (me.id === s.drawerId || !!me.guessedAt)) || (typeof aud === 'object' && aud.to === me.id));
      if (ok) this.sendRaw(ws, msg);
    }
  }

  /** To everyone but the sender (the drawer has already drawn it), admins included. */
  private relay(fromId: string | null, msg: ServerMessage) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att && (att.admin || (att.pid && att.pid !== fromId))) this.sendRaw(ws, text);
    }
  }

  /** After every change: everyone gets their own view, the room row in D1 follows, the alarm is set and the state saved. */
  private commit() {
    const s = this.s;
    if (!s) return;
    let live: string | null = null;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      if (att.admin) {
        this.send(ws, { t: 'state', room: this.view(null, true) });
        live ??= JSON.stringify({ t: 'admin', live: this.adminLive() } satisfies ServerMessage);
        this.sendRaw(ws, live);
      } else if (att.pid && this.player(att.pid)) {
        this.send(ws, { t: 'state', room: this.view(att.pid) });
      }
    }
    const host = this.player(s.hostId);
    const row = JSON.stringify([this.connected().length, s.settings.maxPlayers, s.phase, host?.name ?? null]);
    if (row !== this.lastRow) {
      this.lastRow = row;
      this.bg(
        this.env.DB.prepare('UPDATE rooms SET players = ?, max_players = ?, phase = ?, host_name = ?, updated_at = ? WHERE code = ?')
          .bind(this.connected().length, s.settings.maxPlayers, s.phase, host?.name ?? null, Date.now(), s.code)
          .run(),
      );
    }
    const due = [s.deadline, s.hintAt[0], s.closeAt, ...s.players.map((p) => p.goneAt)].filter((t): t is number => typeof t === 'number');
    if (due.length) this.bg(this.ctx.storage.setAlarm(Math.min(...due)));
    else this.bg(this.ctx.storage.deleteAlarm());
    this.bg(this.ctx.storage.put('state', s));
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private sendRaw(ws: WebSocket, text: string) {
    try {
      ws.send(text);
    } catch {
      /* closing */
    }
  }

  private error(p: Player, message: string) {
    for (const ws of this.socketsOf(p.id)) this.send(ws, { t: 'error', message });
  }

  private bye(ws: WebSocket, reason: ByeReason, message: string) {
    this.send(ws, { t: 'bye', reason, message });
    const code = reason === 'full' ? CLOSE.full : reason === 'replaced' ? CLOSE.replaced : reason === 'kicked' ? CLOSE.kicked : reason === 'banned' ? CLOSE.banned : reason === 'gone' ? CLOSE.gone : CLOSE.closed;
    const att = ws.deserializeAttachment() as Attachment | null;
    // the seat is given up on purpose, so closing this socket must not count as a dropped connection
    if (att) ws.serializeAttachment({ ...att, pid: null });
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  // ---------- helpers ----------

  private player(id: string | null | undefined) {
    return id ? this.s?.players.find((p) => p.id === id) : undefined;
  }

  private connected() {
    return this.s ? this.s.players.filter((p) => p.connected) : [];
  }

  private socketsOf(pid: string) {
    return this.ctx.getWebSockets().filter((ws) => (ws.deserializeAttachment() as Attachment | null)?.pid === pid);
  }

  private clearOps() {
    this.ops = [];
    this.ctx.storage.sql.exec('DELETE FROM ops');
  }

  private ensureOpsTable() {
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ops (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL)');
  }

  private log(event: AuditEvent) {
    const s = this.s;
    this.events.push({ ts: Date.now(), room: s?.code ?? null, game: s?.gameId ?? null, ...event });
  }

  private bg(promise: Promise<unknown>) {
    this.pending.push(promise);
  }

  /** Waits for the D1/R2/storage writes started while handling an event, and writes the audit events, before the handler returns. */
  private async drain() {
    const events = this.events.splice(0);
    if (events.length) this.pending.push(insertEvents(this.env.DB, events));
    const pending = this.pending.splice(0);
    const results = await Promise.allSettled(pending);
    for (const result of results) if (result.status === 'rejected') console.error('room write failed', result.reason);
  }
}
