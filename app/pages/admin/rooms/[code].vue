<script setup lang="ts">
// One room, live: the board as players see it, the word, every chat line (also the hidden ones), the players with
// who they are (account, device, IP) and the moderation controls. Below it the room's earlier games and its audit log.
import type { AdminLive, AdminPlayer } from '#shared/protocol';
import type { AuditRow } from '~/components/admin/AuditTable.vue';
import { ConfirmModal } from '#components';
import type { Board } from '~/utils/paint';

definePageMeta({ layout: 'admin' });
const route = useRoute();
const code = String(route.params.code).toLowerCase();
useHead({ title: `Room ${code}` });

const { api } = useAdmin();
const toast = useToast();
const overlay = useOverlay();
const live = ref<AdminLive | null>(null);
const r = useRoom(code, `/api/admin/rooms/${code}/ws`, { spectator: true });
r.onMessage((msg) => {
  if (msg.t === 'admin') live.value = msg.live;
});
const { room, chat, status, bye, offset } = r;

const history = ref<{ games: { id: string; started_at: number; ended_at: number | null; end_reason: string | null; winner_name: string | null; turns: number }[]; row: Record<string, unknown> | null } | null>(null);
const events = ref<AuditRow[]>([]);
async function loadHistory() {
  try {
    const [h, e] = await Promise.all([api<NonNullable<typeof history.value>>(`/rooms/${code}`), api<{ events: AuditRow[] }>(`/events?room=${code}&limit=150`)]);
    history.value = h;
    events.value = e.events;
  } catch {
    /* shown by useAdmin */
  }
}
onMounted(loadHistory);

const board = shallowRef<Board | null>(null);
function ready(sink: Board) {
  board.value = sink;
  r.attach(sink);
}

const busy = ref(false);
async function act(action: Record<string, unknown>, done?: string) {
  busy.value = true;
  try {
    await api(`/rooms/${code}/actions`, { method: 'POST', body: action });
    if (done) toast.add({ title: done, color: 'success', icon: 'i-lucide-circle-check' });
    void loadHistory();
  } catch {
    /* shown by useAdmin */
  } finally {
    busy.value = false;
  }
}
async function confirm(title: string, body: string, confirmLabel: string) {
  return overlay.create(ConfirmModal).open({ title, body, confirmLabel, danger: true }).result as Promise<boolean>;
}

const reason = ref('');
const banTarget = ref<AdminPlayer | null>(null);
const banKinds = ref<string[]>(['account', 'device']);
function openBan(p: AdminPlayer) {
  banTarget.value = p;
  reason.value = '';
  banKinds.value = p.account ? ['account', 'device'] : ['device'];
}
async function ban() {
  const p = banTarget.value;
  if (!p) return;
  banTarget.value = null;
  await act({ type: 'ban', id: p.id, reason: reason.value || undefined, kinds: banKinds.value }, `${p.name} is banned`);
}
async function kick(p: AdminPlayer) {
  if (await confirm(`Kick ${p.name}?`, 'They are removed from this room and cannot come back into it.', 'Kick')) await act({ type: 'kick', id: p.id }, `${p.name} was kicked`);
}

async function endGame() {
  if (await confirm('End this game?', 'The scores so far are recorded and the room goes to the podium.', 'End game')) await act({ type: 'end' }, 'Game ended');
}
async function closeRoom() {
  if (await confirm('Close this room?', 'Everyone is disconnected and the room is gone.', 'Close room')) await act({ type: 'close' }, 'Room closed');
}

const message = ref('');
async function say() {
  if (!message.value.trim()) return;
  await act({ type: 'say', text: message.value.trim() });
  message.value = '';
}

const phaseLabel: Record<string, string> = { lobby: 'Lobby', choosing: 'Choosing a word', drawing: 'Drawing', reveal: 'Turn result', results: 'Podium' };
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <UButton to="/admin" icon="i-lucide-chevron-left" color="neutral" variant="ghost" square aria-label="Back to live rooms" />
      <h1 class="font-display text-3xl text-highlighted">Room <span class="font-mono">{{ code }}</span></h1>
      <UBadge v-if="live" :label="live.isPublic ? 'Public' : 'Private'" color="neutral" variant="subtle" />
      <UBadge v-if="room" :label="phaseLabel[room.phase]" color="info" variant="soft" />
      <UBadge v-if="status === 'open' && !bye" label="Live" icon="i-lucide-radio" color="success" variant="soft" />
      <UBadge v-else-if="bye" :label="bye.message" color="neutral" variant="soft" />
      <UBadge v-else :label="status" color="warning" variant="soft" />
      <span class="ms-auto text-sm text-muted" v-if="live">Round {{ live.round }} · turn {{ live.turn }}</span>
    </div>

    <div v-if="room && live" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="flex min-w-0 flex-col gap-3">
        <div class="flex items-center gap-3 rounded-lg border border-default bg-default px-3 py-2">
          <TurnClock :deadline="room.deadline" :total="room.phase === 'drawing' ? room.settings.drawTime : 15" :offset="offset" />
          <div class="flex-1">
            <p class="text-xs text-muted">Word</p>
            <p class="font-display text-2xl text-highlighted">{{ live.word ?? (live.choices ? `choosing: ${live.choices.join(' / ')}` : '—') }}</p>
          </div>
          <div class="flex flex-wrap justify-end gap-1">
            <UButton label="Start game" icon="i-lucide-play" size="sm" color="neutral" variant="outline" :disabled="busy || (room.phase !== 'lobby' && room.phase !== 'results')" @click="act({ type: 'start' }, 'Game started')" />
            <UButton label="Skip turn" icon="i-lucide-skip-forward" size="sm" color="neutral" variant="outline" :disabled="busy || (room.phase !== 'drawing' && room.phase !== 'choosing')" @click="act({ type: 'skip' }, 'Turn skipped')" />
            <UButton label="End game" icon="i-lucide-square" size="sm" color="warning" variant="outline" :disabled="busy || !live.gameId" @click="endGame" />
            <UButton label="Close room" icon="i-lucide-door-closed" size="sm" color="error" variant="outline" :disabled="busy" @click="closeRoom" />
          </div>
        </div>

        <GameBoard :drawing="false" tool="brush" :color="1" :size="1" @ready="ready" />

        <form class="flex gap-2" @submit.prevent="say">
          <UInput v-model="message" icon="i-lucide-megaphone" placeholder="Message everyone in the room (shown as “Beheerder: …”)" class="flex-1" :maxlength="200" />
          <UButton type="submit" label="Send" icon="i-lucide-send" :disabled="busy || !message.trim()" />
        </form>

        <div class="overflow-x-auto rounded-lg border border-default bg-default">
          <table class="w-full text-sm">
            <thead class="border-b border-default text-left text-xs text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">Player</th>
                <th class="px-3 py-2 font-medium">Score</th>
                <th class="px-3 py-2 font-medium">Account</th>
                <th class="px-3 py-2 font-medium">Device / IP</th>
                <th class="px-3 py-2 font-medium">Joined</th>
                <th class="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in live.players" :key="p.id" class="border-b border-default last:border-0">
                <td class="px-3 py-2">
                  <span class="flex items-center gap-2">
                    <PlayerAvatar :avatar="p.avatar" :size="28" :muted="!p.connected" />
                    <span class="font-semibold text-highlighted">{{ p.name }}</span>
                    <UIcon v-if="p.host" name="i-lucide-crown" class="size-3.5 text-warning" title="Host" />
                    <UIcon v-if="p.drawer" name="i-lucide-pencil" class="size-3.5 text-secondary" title="Drawing" />
                    <UIcon v-if="p.guessed" name="i-lucide-check" class="size-3.5 text-success" title="Guessed" />
                    <UBadge v-if="p.muted" label="muted" color="warning" variant="subtle" size="sm" />
                    <UBadge v-if="!p.connected" label="away" color="neutral" variant="subtle" size="sm" />
                  </span>
                </td>
                <td class="px-3 py-2 tabular-nums">{{ p.score }}</td>
                <td class="px-3 py-2">{{ p.account?.email ?? 'guest' }}</td>
                <td class="px-3 py-2 font-mono text-xs text-muted">
                  <NuxtLink :to="`/admin/audit?device=${p.device}`" class="hover:underline">{{ p.device.slice(0, 8) }}</NuxtLink><br>{{ p.ip || '—' }} {{ p.country }}
                </td>
                <td class="px-3 py-2 text-muted">{{ ago(p.joinedAt) }}</td>
                <td class="px-3 py-2">
                  <div class="flex justify-end gap-1">
                    <UTooltip :text="p.muted ? 'Unmute' : 'Mute chat'"><UButton :icon="p.muted ? 'i-lucide-mic' : 'i-lucide-mic-off'" size="xs" color="neutral" variant="ghost" square :aria-label="p.muted ? 'Unmute' : 'Mute'" @click="act({ type: 'mute', id: p.id, muted: !p.muted })" /></UTooltip>
                    <UTooltip v-if="!live.isPublic && !p.host" text="Make host"><UButton icon="i-lucide-crown" size="xs" color="neutral" variant="ghost" square aria-label="Make host" @click="act({ type: 'host', id: p.id })" /></UTooltip>
                    <UTooltip text="Kick from this room"><UButton icon="i-lucide-user-x" size="xs" color="warning" variant="ghost" square aria-label="Kick" @click="kick(p)" /></UTooltip>
                    <UTooltip text="Ban from Sketch"><UButton icon="i-lucide-ban" size="xs" color="error" variant="ghost" square aria-label="Ban" @click="openBan(p)" /></UTooltip>
                  </div>
                </td>
              </tr>
              <tr v-if="!live.players.length"><td colspan="6" class="px-3 py-6 text-center text-muted">Nobody in the room.</td></tr>
            </tbody>
          </table>
        </div>
        <p v-if="live.spectators.length > 1" class="text-xs text-muted">Also watching: {{ live.spectators.join(', ') }}</p>
      </div>

      <ChatBox :lines="chat" :room="room" me="" spectator class="h-[36rem] xl:h-auto" />
    </div>

    <UCard v-else-if="bye || status === 'closed'">
      <p class="text-muted">{{ bye?.message ?? 'This room is not live.' }}</p>
    </UCard>
    <p v-else class="flex items-center gap-2 text-muted"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" /> Connecting…</p>

    <section v-if="history?.games.length" class="flex flex-col gap-2">
      <h2 class="font-display text-xl text-highlighted">Games in this room</h2>
      <div class="flex flex-wrap gap-2">
        <UButton v-for="g in history.games" :key="g.id" :to="`/admin/games/${g.id}`" color="neutral" variant="outline" size="sm" :label="`${fmtTime(g.started_at)} · ${g.turns} turns · ${g.winner_name ?? g.end_reason ?? 'running'}`" />
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h2 class="font-display text-xl text-highlighted">Audit log</h2>
        <div class="flex gap-1">
          <UButton label="Refresh" icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="ghost" @click="loadHistory" />
          <UButton :to="`/admin/audit?room=${code}`" label="Open in audit log" size="sm" color="neutral" variant="ghost" />
        </div>
      </div>
      <AdminAuditTable :events="events" compact />
    </section>

    <UModal :open="!!banTarget" :title="`Ban ${banTarget?.name}`" description="They are removed now and can't join any room while the ban lasts. You can lift it under Bans." @update:open="(open) => !open && (banTarget = null)">
      <template #body>
        <div class="flex flex-col gap-3">
          <UCheckboxGroup
            v-model="banKinds"
            :items="[
              { label: `Account${banTarget?.account ? ` (${banTarget.account.email})` : ' (guest: none)'}`, value: 'account', disabled: !banTarget?.account },
              { label: `This browser (${banTarget?.device.slice(0, 8)})`, value: 'device' },
              { label: `IP address (${banTarget?.ip || 'unknown'}) — careful, shared office IPs ban everyone behind them`, value: 'ip', disabled: !banTarget?.ip },
            ]"
          />
          <UInput v-model="reason" placeholder="Reason (they see it)" :maxlength="200" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="outline" @click="banTarget = null" />
          <UButton label="Ban" icon="i-lucide-ban" color="error" :disabled="!banKinds.length" @click="ban" />
        </div>
      </template>
    </UModal>
  </div>
</template>
