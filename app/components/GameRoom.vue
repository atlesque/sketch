<script setup lang="ts">
// The game screen: players on the left, the board with the word bar and tools in the middle, chat on the right
// (players and chat side by side under the board on phones). Lobby, word choice, turn result and podium are
// overlays on the board.
import { TIMES, type Op, type PlayerView, type RoomView } from '#shared/protocol';
import { ConfirmModal, ReportModal } from '#components';
import type { Board } from '~/utils/paint';
import type { Tool } from './GameBoard.vue';

const props = defineProps<{ code: string }>();
const r = useRoom(props.code);
const { room, chat, me, isDrawer, isHost, status, bye, offset, send } = r;
const sounds = useSounds();
const toast = useToast();
const overlay = useOverlay();

const tool = ref<Tool>('brush');
const color = ref(1);
const size = ref(1);
let board: Board | null = null;

function ready(sink: Board) {
  board = sink;
  r.attach(sink);
}
const draw = (ops: Op[]) => send({ t: 'draw', ops });
function undo() {
  board?.undo();
  send({ t: 'undo' });
}
function clear() {
  board?.clear();
  send({ t: 'clear' });
}

const invite = computed(() => `${location.origin}/r/${props.code}`);
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(invite.value);
    toast.add({ title: 'Uitnodigingslink gekopieerd', color: 'success', icon: 'i-lucide-copy' });
  } catch {
    toast.add({ title: invite.value, description: 'Kopieer deze link en deel hem met je team.', color: 'info' });
  }
}

const drawer = computed(() => room.value?.players.find((p) => p.id === room.value?.drawerId) ?? null);
const total = computed(() => {
  const phase = room.value?.phase;
  if (phase === 'drawing') return room.value!.settings.drawTime;
  if (phase === 'choosing') return TIMES.choose;
  if (phase === 'reveal') return TIMES.reveal;
  if (phase === 'results') return TIMES.results;
  return TIMES.publicStart;
});
const myGuess = computed(() => room.value?.players.find((p) => p.id === me.value));
const reasonText: Record<NonNullable<RoomView['reveal']>['reason'], string> = {
  time: 'De tijd is om!',
  all_guessed: 'Iedereen heeft het geraden!',
  drawer_left: 'De tekenaar is weggegaan.',
  skipped: 'De beurt is overgeslagen.',
};
const podium = computed(() => {
  const results = room.value?.results ?? [];
  return [results[1], results[0], results[2]].filter(Boolean) as NonNullable<RoomView['results']>;
});

// ---------- sounds and title ----------
watch(
  () => [room.value?.phase, room.value?.drawerId] as const,
  ([phase, drawerId], [before]) => {
    if (phase === before) return;
    if (phase === 'choosing' && drawerId === me.value) sounds.play('myturn');
    else if (phase === 'drawing' && drawerId !== me.value) sounds.play('turn');
    else if (phase === 'reveal') sounds.play('reveal');
    else if (phase === 'results') sounds.play('end');
  },
);
watch(
  () => room.value?.players.length ?? 0,
  (count, before) => {
    if (before && count > before) sounds.play('join');
    else if (before && count < before) sounds.play('leave');
  },
);
r.onMessage((msg) => {
  if (msg.t !== 'chat') return;
  if (msg.line.kind === 'correct') sounds.play(msg.line.from === me.value ? 'correct' : 'guessed');
  else if (msg.line.kind === 'close') sounds.play('close');
});
watch(bye, (value) => value && (value.reason === 'kicked' || value.reason === 'banned') && sounds.play('kick'));
useHead({
  title: computed(() => {
    const phase = room.value?.phase;
    if (phase === 'drawing' && isDrawer.value) return 'Jij tekent! · Sketch';
    if (phase === 'choosing' && isDrawer.value) return 'Kies een woord! · Sketch';
    if (room.value && phase !== 'lobby') return `Ronde ${room.value.round} · Sketch`;
    return `Kamer ${props.code} · Sketch`;
  }),
});

// ---------- player actions ----------
async function confirm(title: string, body: string, confirmLabel: string) {
  return overlay.create(ConfirmModal).open({ title, body, confirmLabel, cancelLabel: 'Annuleren', danger: true }).result as Promise<boolean>;
}
async function kick(p: PlayerView) {
  if (await confirm(`${p.name} uit de kamer zetten?`, 'Ze kunnen niet meer terug in deze kamer.', 'Uit de kamer zetten')) send({ t: 'kick', id: p.id });
}
async function report(p: PlayerView) {
  const reason = (await overlay.create(ReportModal).open({ name: p.name }).result) as string | null;
  if (reason) send({ t: 'report', id: p.id, reason });
}
async function leave() {
  if (room.value?.phase !== 'lobby' && !(await confirm('Het spel verlaten?', 'Je punten van dit spel ben je dan kwijt.', 'Verlaten'))) return;
  r.leave();
  await navigateTo('/');
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-[90rem] flex-col gap-3 px-3 py-3 sm:px-4">
    <header class="flex flex-wrap items-center gap-2">
      <NuxtLink to="/" aria-label="Sketch, naar het begin"><AppLogo /></NuxtLink>
      <UBadge :label="room?.isPublic ? 'Open kamer' : 'Privékamer'" :icon="room?.isPublic ? 'i-lucide-users' : 'i-lucide-lock'" color="neutral" variant="subtle" class="ms-2" />
      <UButton :label="code" icon="i-lucide-link" color="neutral" variant="ghost" size="sm" class="font-mono" aria-label="Uitnodigingslink kopiëren" @click="copyInvite" />
      <div class="ms-auto flex items-center gap-1">
        <span v-if="room && room.phase !== 'lobby'" class="me-2 text-sm font-semibold text-muted">Ronde {{ room.round }} van {{ room.settings.rounds }}</span>
        <UTooltip :text="sounds.muted.value ? 'Geluid aan' : 'Geluid uit'">
          <UButton :icon="sounds.muted.value ? 'i-lucide-volume-x' : 'i-lucide-volume-2'" color="neutral" variant="ghost" square :aria-label="sounds.muted.value ? 'Geluid aan' : 'Geluid uit'" @click="sounds.toggle" />
        </UTooltip>
        <ThemeSwitch />
        <UButton label="Verlaten" icon="i-lucide-log-out" color="neutral" variant="outline" size="sm" @click="leave" />
      </div>
    </header>

    <div v-if="!room" class="grid flex-1 place-items-center">
      <div v-if="bye" class="max-w-sm text-center">
        <p class="font-display text-2xl text-highlighted">{{ bye.message }}</p>
        <UButton to="/" label="Naar het begin" class="mt-4" />
      </div>
      <p v-else class="flex items-center gap-2 text-muted"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" /> Verbinden met de kamer…</p>
    </div>

    <div v-else class="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
      <aside class="order-2 max-h-80 overflow-y-auto lg:order-1 lg:max-h-none" aria-label="Spelers">
        <PlayerList :room="room" :me="me" @votekick="(p) => send({ t: 'votekick', id: p.id })" @report="report" @kick="kick" @host="(p) => send({ t: 'host', id: p.id })" />
      </aside>

      <main class="order-1 col-span-2 flex min-w-0 flex-col gap-3 lg:order-2 lg:col-span-1">
        <div class="flex items-center gap-3 rounded-lg border border-default bg-default px-3 py-2">
          <TurnClock :deadline="room.deadline" :total="total" :offset="offset" :ticking="room.phase === 'drawing'" @tick="sounds.play('tick')" />
          <WordHint :room="room" :me="me" class="flex-1" />
          <span class="hidden w-14 sm:block" />
        </div>

        <!-- lobby: its own panel; the board stays mounted (hidden) so it keeps its ops -->
        <div v-if="room.phase === 'lobby'" class="rounded-lg border border-default bg-default p-4 sm:p-6">
          <div class="mx-auto flex max-w-xl flex-col gap-4">
            <template v-if="room.isPublic">
              <h2 class="font-display text-3xl text-highlighted">Open kamer</h2>
              <p class="text-toned">
                <template v-if="room.deadline">Het spel begint over een paar seconden…</template>
                <template v-else>Wachten op nog een speler. Nodig je collega's uit met de link.</template>
              </p>
            </template>
            <template v-else>
              <h2 class="font-display text-3xl text-highlighted">{{ isHost ? 'Kamer instellen' : 'Wachten op de host' }}</h2>
              <RoomSettings :settings="room.settings" :editable="isHost" :players="room.players.length" @change="(settings) => send({ t: 'settings', settings })" />
            </template>
            <div class="flex flex-col gap-2 rounded-md bg-elevated p-3">
              <p class="text-sm font-semibold text-highlighted">Nodig je team uit</p>
              <div class="flex gap-2">
                <UInput :model-value="invite" readonly class="flex-1 font-mono" aria-label="Uitnodigingslink" @focus="($event.target as HTMLInputElement).select()" />
                <UButton icon="i-lucide-copy" label="Kopiëren" color="neutral" variant="outline" @click="copyInvite" />
              </div>
            </div>
            <UButton
              v-if="isHost"
              label="Start het spel"
              icon="i-lucide-play"
              size="xl"
              block
              :disabled="room.players.filter((p) => p.connected).length < 2"
              @click="send({ t: 'start' })"
            />
            <p v-if="isHost && room.players.filter((p) => p.connected).length < 2" class="text-center text-sm text-muted">Er zijn minstens twee spelers nodig.</p>
          </div>
        </div>

        <GameBoard v-show="room.phase !== 'lobby' || !!bye" :drawing="isDrawer && room.phase === 'drawing'" :tool="tool" :color="color" :size="size" @ready="ready" @ops="draw">
          <!-- choosing a word -->
          <div v-if="room.phase === 'choosing'" class="absolute inset-0 grid place-items-center bg-[#172b45]/85 p-4 text-white">
            <div v-if="isDrawer && room.choices" class="flex flex-col items-center gap-4">
              <h2 class="font-display text-3xl">Kies een woord</h2>
              <div class="flex flex-wrap justify-center gap-2">
                <UButton v-for="(word, index) in room.choices" :key="word" :label="word" size="xl" color="secondary" class="text-lg" @click="send({ t: 'pick', index })" />
              </div>
            </div>
            <div v-else class="flex flex-col items-center gap-3">
              <PlayerAvatar v-if="drawer" :avatar="drawer.avatar" :size="96" />
              <p class="font-display text-2xl">{{ drawer?.name ?? 'Iemand' }} kiest een woord…</p>
            </div>
          </div>

          <!-- end of a turn -->
          <div v-else-if="room.phase === 'reveal' && room.reveal" class="absolute inset-0 grid place-items-center bg-[#172b45]/85 p-4 text-white">
            <div class="flex w-full max-w-sm flex-col items-center gap-3">
              <p class="text-sm opacity-80">{{ reasonText[room.reveal.reason] }}</p>
              <p v-if="room.reveal.word" class="text-center">Het woord was <span class="block font-display text-4xl text-[var(--color-brand)]">{{ room.reveal.word }}</span></p>
              <ul class="max-h-56 w-full overflow-y-auto">
                <li v-for="gain in room.reveal.gains" :key="gain.id" class="flex justify-between gap-4 border-b border-white/10 py-1 text-sm">
                  <span class="truncate">{{ gain.name }}<span v-if="gain.id === room.reveal.drawerId" class="opacity-70"> (tekenaar)</span></span>
                  <span class="font-bold tabular-nums" :class="gain.points ? 'text-[#7ee2a8]' : 'opacity-60'">+{{ gain.points }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- end of the game -->
          <div v-else-if="room.phase === 'results' && room.results" class="absolute inset-0 grid place-items-center overflow-y-auto bg-[#172b45]/90 p-4 text-white">
            <div class="flex w-full max-w-md flex-col items-center gap-4">
              <h2 class="font-display text-3xl">Einde van het spel</h2>
              <div class="flex items-end justify-center gap-3">
                <div v-for="p in podium" :key="p.id" class="flex flex-col items-center gap-1">
                  <UIcon v-if="p.rank === 1" name="i-lucide-crown" class="size-7 text-[#ffd23f]" />
                  <PlayerAvatar :avatar="p.avatar" :size="p.rank === 1 ? 84 : 64" />
                  <span class="max-w-24 truncate text-sm font-semibold">{{ p.name }}</span>
                  <div class="grid w-20 place-items-center rounded-t-md bg-white/15 font-display text-2xl" :class="p.rank === 1 ? 'h-24' : p.rank === 2 ? 'h-16' : 'h-10'">{{ p.rank }}</div>
                  <span class="text-xs tabular-nums opacity-80">{{ p.score }} punten</span>
                </div>
              </div>
              <ol v-if="room.results.length > 3" class="w-full text-sm">
                <li v-for="p in room.results.slice(3)" :key="p.id" class="flex justify-between border-b border-white/10 py-1">
                  <span>#{{ p.rank }} {{ p.name }}</span><span class="tabular-nums">{{ p.score }}</span>
                </li>
              </ol>
              <p class="text-xs opacity-70">{{ room.isPublic ? 'Zo meteen begint een nieuw spel.' : 'Zo meteen terug naar de lobby.' }}</p>
            </div>
          </div>

          <!-- connection -->
          <div v-if="bye" class="absolute inset-0 grid place-items-center bg-default/95 p-4 text-center">
            <div class="flex max-w-sm flex-col items-center gap-3">
              <UIcon name="i-lucide-door-closed" class="size-10 text-muted" />
              <p class="font-display text-2xl text-highlighted">{{ bye.message }}</p>
              <div class="flex gap-2">
                <UButton to="/" label="Naar het begin" />
                <UButton v-if="bye.reason === 'replaced'" label="Hier verder spelen" color="neutral" variant="outline" @click="r.reconnect()" />
              </div>
            </div>
          </div>
          <div v-else-if="status === 'reconnecting'" class="absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-warning/90 py-1.5 text-sm font-semibold text-white">
            <UIcon name="i-lucide-wifi-off" class="size-4" /> Verbinding herstellen…
          </div>
        </GameBoard>

        <DrawTools v-if="isDrawer && room.phase === 'drawing'" v-model:tool="tool" v-model:color="color" v-model:size="size" @undo="undo" @clear="clear" />
        <div v-else-if="room.phase === 'drawing' && drawer" class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted">{{ drawer.name }} tekent.</span>
          <UButton icon="i-lucide-thumbs-up" label="Leuk" color="success" variant="soft" size="sm" :disabled="!!myGuess?.reaction" @click="send({ t: 'react', kind: 'like' })" />
          <UButton icon="i-lucide-thumbs-down" label="Niet leuk" color="error" variant="soft" size="sm" :disabled="!!myGuess?.reaction" @click="send({ t: 'react', kind: 'dislike' })" />
          <UButton icon="i-lucide-flag" label="Melden" color="neutral" variant="ghost" size="sm" class="ms-auto" @click="report(drawer)" />
        </div>
      </main>

      <aside class="relative order-3 h-80 min-h-0 lg:h-auto" aria-label="Chat">
        <ChatBox :lines="chat" :room="room" :me="me" :disabled="status !== 'open' || !!bye" class="h-full lg:absolute lg:inset-0" @send="(text) => send({ t: 'chat', text })" />
      </aside>
    </div>
  </div>
</template>
