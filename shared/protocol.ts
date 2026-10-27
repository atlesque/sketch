// What goes over a room's WebSocket, shared by the Room Durable Object (worker/room.ts) and the game page.
// The server is the authority: it picks words, keeps time, checks guesses and keeps the scores.
// Clients only ever see the word when they are drawing, have guessed it, or the turn is over.

/** The drawing board's own coordinate space; canvases scale it to whatever size they are shown at. */
export const BOARD_W = 800;
export const BOARD_H = 600;

/** The drawing palette, by index (ops carry the index, not the color). 0 is the paper, used by the eraser. */
export const PALETTE = [
  '#ffffff', '#1d1d1f', '#5b5d63', '#9a9ca3', '#cfd1d6',
  '#e8382f', '#9e1f1a', '#ff8a3d', '#b4561a', '#ffd23f',
  '#c99a12', '#5ccb5f', '#1f7a35', '#2ec4b6', '#13706a',
  '#3a86ff', '#1b3f8f', '#8f5cf7', '#4f2a99', '#ff6fb5',
  '#a8326e', '#f7c6a3', '#c98b62', '#7a4b2a',
] as const;
export const PAPER = 0;

/** Brush widths in board pixels. */
export const SIZES = [3, 7, 14, 26, 44] as const;

/**
 * Drawing operations, kept tiny because a stroke is sent as it is drawn.
 * ['b', color, size, x, y] begins a stroke (a dot until it moves), ['l', x, y] continues it,
 * ['f', color, x, y] flood-fills from a point. Clearing the board and undoing are messages of their own.
 */
export type Op = ['b', number, number, number, number] | ['l', number, number] | ['f', number, number, number];

export interface Avatar {
  color: number;
  eyes: number;
  mouth: number;
  extra: number;
}

export type WordMode = 'normal' | 'hidden';

export interface Settings {
  maxPlayers: number;
  rounds: number;
  /** Seconds to draw. */
  drawTime: number;
  /** Words the drawer picks from. */
  wordChoices: number;
  /** Letters revealed over the turn. */
  hints: number;
  /** 'hidden' shows guessers no letter count and no hints. */
  wordMode: WordMode;
  customWords: string[];
  /** Only use the custom words, not the built-in list. */
  customOnly: boolean;
}

export const LIMITS = {
  maxPlayers: [2, 20],
  rounds: [1, 10],
  drawTime: [30, 240],
  wordChoices: [1, 5],
  hints: [0, 5],
  customWords: 1000,
  customWordLength: 30,
  /** At least this many custom words before a room may use only those. */
  customOnlyMin: 10,
  name: 20,
  chat: 100,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  maxPlayers: 10,
  rounds: 3,
  drawTime: 80,
  wordChoices: 3,
  hints: 2,
  wordMode: 'normal',
  customWords: [],
  customOnly: false,
};

/** Seconds for each phase that isn't the drawing itself. */
export const TIMES = {
  choose: 15,
  reveal: 6,
  results: 12,
  /** Public rooms start by themselves this long after the second player arrives. */
  publicStart: 10,
} as const;

export type Phase = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'results';

export interface PlayerView {
  id: string;
  name: string;
  avatar: Avatar;
  score: number;
  /** Guessed the word this turn. */
  guessed: boolean;
  connected: boolean;
  /** Signed in with an Atlesque Play account. */
  account: boolean;
  /** 'like' | 'dislike' for this turn's drawing. */
  reaction: 'like' | 'dislike' | null;
}

export interface Gain {
  id: string;
  name: string;
  points: number;
}

export interface Ranked {
  id: string;
  name: string;
  avatar: Avatar;
  score: number;
  rank: number;
}

export interface RoomView {
  code: string;
  isPublic: boolean;
  phase: Phase;
  settings: Settings;
  players: PlayerView[];
  hostId: string | null;
  drawerId: string | null;
  round: number;
  /** When the current phase ends (server clock, ms); null when it waits for someone. */
  deadline: number | null;
  /** The server clock when this view was made, to line up countdowns. */
  now: number;
  /**
   * The word as this player may see it: every character, with null for a letter still hidden.
   * Spaces and hyphens always show. null when guessers get no letter count (wordMode 'hidden') or there is no word yet.
   */
  hint: (string | null)[] | null;
  /** The whole word, for the drawer, for players who guessed it, during the reveal, and for admins. */
  word: string | null;
  /** End of a turn: the word and who scored what. */
  reveal: { word: string; reason: TurnEndReason; drawerId: string | null; gains: Gain[] } | null;
  /** End of a game: everyone in order. */
  results: Ranked[] | null;
  /** For the drawer while choosing. */
  choices: string[] | null;
  /** Players who voted to kick each target this turn, by target id. */
  kickVotes: Record<string, number>;
  /** Votes needed to kick someone right now. */
  kickNeeded: number;
}

export type TurnEndReason = 'time' | 'all_guessed' | 'drawer_left' | 'skipped';

export type ChatKind =
  /** Someone's message. `inner` = only seen by the drawer and players who guessed. */
  | 'msg'
  /** Neutral notices (who joined, the round). */
  | 'info'
  /** Someone guessed the word. */
  | 'correct'
  /** Your guess was nearly right (only you see it). */
  | 'close'
  /** Kicks, warnings. */
  | 'warn'
  /** Likes and dislikes. */
  | 'good'
  | 'bad'
  /** A message from the moderator. */
  | 'admin';

export interface ChatLine {
  id: number;
  kind: ChatKind;
  text: string;
  from?: string;
  name?: string;
  /** Only the drawer and the players who guessed saw this message. */
  inner?: boolean;
  /** Admin spectators only: the message contained the answer and was not shown to anyone. */
  hidden?: boolean;
}

export interface Hello {
  t: 'hello';
  name: string;
  avatar: Avatar;
  /** This browser's id for the room seat, to come back as the same player after a dropped connection. */
  secret?: string;
  /** This browser's id, for moderation (bans, reports). */
  device: string;
  /** Atlesque Play bearer token, when signed in. */
  token?: string;
}

export type ClientMessage =
  | Hello
  | { t: 'chat'; text: string }
  | { t: 'draw'; ops: Op[] }
  | { t: 'undo' }
  | { t: 'clear' }
  | { t: 'pick'; index: number }
  | { t: 'start' }
  | { t: 'settings'; settings: Partial<Settings> }
  | { t: 'kick'; id: string }
  | { t: 'host'; id: string }
  | { t: 'votekick'; id: string }
  | { t: 'react'; kind: 'like' | 'dislike' }
  | { t: 'report'; id: string; reason: string }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'welcome'; you: string; secret: string; room: RoomView; ops: Op[]; chat: ChatLine[]; account: { email: string } | null }
  | { t: 'state'; room: RoomView }
  | { t: 'chat'; line: ChatLine }
  | { t: 'draw'; ops: Op[] }
  | { t: 'undo' }
  | { t: 'clear' }
  | { t: 'error'; message: string }
  | { t: 'signedout' }
  /** Admin spectators: the moderation view of the room, alongside the normal state. */
  | { t: 'admin'; live: AdminLive }
  | { t: 'bye'; reason: ByeReason; message: string };

export type ByeReason = 'full' | 'gone' | 'kicked' | 'banned' | 'replaced' | 'closed' | 'started';

/** Close codes the room uses, so the page knows not to reconnect. */
export const CLOSE = { full: 4001, replaced: 4002, kicked: 4003, gone: 4004, banned: 4005, closed: 4006 } as const;

// ---------- admin ----------

export interface AdminPlayer {
  id: string;
  name: string;
  avatar: Avatar;
  score: number;
  connected: boolean;
  guessed: boolean;
  muted: boolean;
  host: boolean;
  drawer: boolean;
  device: string;
  ip: string;
  country: string;
  account: { id: string; email: string } | null;
  joinedAt: number;
}

export interface AdminLive {
  code: string;
  isPublic: boolean;
  phase: Phase;
  gameId: string | null;
  round: number;
  turn: number;
  word: string | null;
  choices: string[] | null;
  players: AdminPlayer[];
  spectators: string[];
  createdAt: number;
}
