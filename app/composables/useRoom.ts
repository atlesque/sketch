// The room's WebSocket: joins with the profile (and the Atlesque Play token when signed in), keeps the latest room view,
// the chat and the drawing ops, and reconnects as the same player after a dropped connection (the seat's secret is
// kept per tab in sessionStorage, so two tabs are two players).

import { CLOSE, type ChatLine, type ClientMessage, type Op, type RoomView, type ServerMessage } from '#shared/protocol';

export type Status = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface BoardSink {
  reset(ops: Op[]): void;
  apply(ops: Op[]): void;
  undo(): void;
  clear(): void;
}

const seatKey = (code: string) => `sketch-seat-${code}`;
const final = new Set<number>(Object.values(CLOSE));

/** ws://127.0.0.1:8840 next to `nuxt dev` (pnpm dev:api); the page's own host otherwise. */
export function socketBase(): string {
  if (import.meta.dev && location.port === '3340') return 'ws://127.0.0.1:8840';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

export function hasSeat(code: string): boolean {
  try {
    return !!sessionStorage.getItem(seatKey(code));
  } catch {
    return false;
  }
}

export function useRoom(code: string, path = `/api/rooms/${code}/ws`, options: { spectator?: boolean } = {}) {
  const { profile, device } = useProfile();
  const { account, clear: signOutLocally } = useAccount();
  const toast = useToast();

  const room = shallowRef<RoomView | null>(null);
  const chat = ref<ChatLine[]>([]);
  const me = ref('');
  const status = ref<Status>('connecting');
  const bye = ref<{ reason: string; message: string } | null>(null);
  /** server clock minus ours */
  const offset = ref(0);
  const listeners: ((msg: ServerMessage) => void)[] = [];
  let board: BoardSink | null = null;
  let pendingOps: Op[] | null = null;

  let ws: WebSocket | null = null;
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  function connect() {
    if (stopped) return;
    status.value = attempts ? 'reconnecting' : 'connecting';
    ws = new WebSocket(`${socketBase()}${path}`);
    ws.onopen = () => {
      attempts = 0;
      if (options.spectator) return;
      let secret: string | undefined;
      try {
        secret = sessionStorage.getItem(seatKey(code)) ?? undefined;
      } catch {
        /* storage blocked */
      }
      send({ t: 'hello', name: profile.value.name, avatar: profile.value.avatar, secret, device: device.value, token: account.value?.token });
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      const msg = JSON.parse(event.data) as ServerMessage;
      handle(msg);
      for (const listener of listeners) listener(msg);
    };
    ws.onclose = (event) => {
      if (ping) clearInterval(ping);
      ping = null;
      if (stopped || bye.value || final.has(event.code)) {
        status.value = 'closed';
        return;
      }
      status.value = 'reconnecting';
      attempts++;
      retry = setTimeout(connect, Math.min(8000, 500 * 2 ** attempts));
    };
    ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000);
  }

  function handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome':
        me.value = msg.you;
        status.value = 'open';
        if (msg.secret) {
          try {
            sessionStorage.setItem(seatKey(code), msg.secret);
          } catch {
            /* storage blocked */
          }
        }
        setRoom(msg.room);
        chat.value = msg.chat;
        if (board) board.reset(msg.ops);
        else pendingOps = msg.ops;
        break;
      case 'state':
        setRoom(msg.room);
        break;
      case 'chat':
        chat.value.push(msg.line);
        if (chat.value.length > 250) chat.value.splice(0, chat.value.length - 250);
        break;
      case 'draw':
        board?.apply(msg.ops);
        break;
      case 'undo':
        board?.undo();
        break;
      case 'clear':
        board?.clear();
        break;
      case 'error':
        toast.add({ title: msg.message, color: 'warning', icon: 'i-lucide-triangle-alert' });
        break;
      case 'signedout':
        signOutLocally();
        toast.add({ title: 'Je bent afgemeld bij Atlesque Play', description: 'Je speelt verder als gast.', color: 'info', icon: 'i-lucide-info' });
        break;
      case 'bye':
        bye.value = { reason: msg.reason, message: msg.message };
        if (msg.reason !== 'replaced') forgetSeat();
        break;
    }
  }

  function setRoom(view: RoomView) {
    offset.value = view.now - Date.now();
    room.value = view;
  }

  function forgetSeat() {
    try {
      sessionStorage.removeItem(seatKey(code));
    } catch {
      /* storage blocked */
    }
  }

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function attach(sink: BoardSink) {
    board = sink;
    if (pendingOps) {
      sink.reset(pendingOps);
      pendingOps = null;
    }
  }

  /** Leaves on purpose: the seat is given up at once. */
  function leave() {
    send({ t: 'leave' });
    forgetSeat();
    stop();
  }

  function stop() {
    stopped = true;
    if (retry) clearTimeout(retry);
    if (ping) clearInterval(ping);
    ws?.close(1000, 'bye');
    status.value = 'closed';
  }

  function reconnect() {
    bye.value = null;
    stopped = false;
    attempts = 0;
    connect();
  }

  const onMessage = (listener: (msg: ServerMessage) => void) => listeners.push(listener);

  onMounted(connect);
  onBeforeUnmount(stop);

  const player = computed(() => room.value?.players.find((p) => p.id === me.value) ?? null);
  const isDrawer = computed(() => !!room.value && room.value.drawerId === me.value && !!me.value);
  const isHost = computed(() => !!room.value && room.value.hostId === me.value && !!me.value);

  return { room, chat, me, player, isDrawer, isHost, status, bye, offset, send, attach, leave, stop, reconnect, onMessage };
}
