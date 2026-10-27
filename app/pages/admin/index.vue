<script setup lang="ts">
// Live rooms: the numbers that matter right now and every open room, refreshed every 5 seconds.
definePageMeta({ layout: 'admin' });
useHead({ title: 'Live rooms' });

interface RoomRow {
  code: string;
  public: number;
  players: number;
  max_players: number;
  phase: string;
  host_name: string | null;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
}

const { api } = useAdmin();
const overview = ref<{ rooms: number; players: number; games: number; reports: number; bans: number } | null>(null);
const rooms = ref<RoomRow[]>([]);
const closed = ref(false);
const now = ref(Date.now());

async function load() {
  try {
    const [o, r] = await Promise.all([api<typeof overview.value>('/overview'), api<{ rooms: RoomRow[] }>(`/rooms${closed.value ? '?closed=1' : ''}`)]);
    overview.value = o;
    rooms.value = r.rooms;
    now.value = Date.now();
  } catch {
    /* shown by useAdmin */
  }
}
watch(closed, load);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  load();
  timer = setInterval(load, 5000);
});
onBeforeUnmount(() => timer && clearInterval(timer));

const phaseColor: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = { lobby: 'neutral', choosing: 'info', drawing: 'success', reveal: 'info', results: 'warning' };
const cards = computed(() => [
  { label: 'Open rooms', value: overview.value?.rooms, icon: 'i-lucide-radio' },
  { label: 'Players online', value: overview.value?.players, icon: 'i-lucide-users' },
  { label: 'Games (24 h)', value: overview.value?.games, icon: 'i-lucide-gamepad-2' },
  { label: 'Open reports', value: overview.value?.reports, icon: 'i-lucide-flag', to: '/admin/reports' },
  { label: 'Active bans', value: overview.value?.bans, icon: 'i-lucide-ban', to: '/admin/bans' },
]);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl text-highlighted">Live rooms</h1>
        <p class="text-sm text-muted">Open a room to watch it live and moderate it. Refreshes every 5 seconds.</p>
      </div>
      <USwitch v-model="closed" label="Closed rooms" />
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <component :is="card.to ? resolveComponent('NuxtLink') : 'div'" v-for="card in cards" :key="card.label" :to="card.to" class="rounded-lg border border-default bg-default p-4" :class="card.to ? 'hover:bg-elevated' : ''">
        <p class="flex items-center gap-1.5 text-xs text-muted"><UIcon :name="card.icon" class="size-4" />{{ card.label }}</p>
        <p class="mt-1 text-2xl font-bold text-highlighted tabular-nums">{{ card.value ?? '…' }}</p>
      </component>
    </div>

    <div class="overflow-x-auto rounded-lg border border-default bg-default">
      <table class="w-full text-sm">
        <thead class="border-b border-default text-left text-xs text-muted">
          <tr>
            <th class="px-3 py-2 font-medium">Room</th>
            <th class="px-3 py-2 font-medium">Kind</th>
            <th class="px-3 py-2 font-medium">Phase</th>
            <th class="px-3 py-2 font-medium">Players</th>
            <th class="px-3 py-2 font-medium">Host</th>
            <th class="px-3 py-2 font-medium">Created</th>
            <th class="px-3 py-2 font-medium">{{ closed ? 'Closed' : 'Last change' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="room in rooms" :key="room.code" class="border-b border-default last:border-0 hover:bg-elevated/60">
            <td class="px-3 py-2"><NuxtLink :to="`/admin/rooms/${room.code}`" class="font-mono font-semibold text-primary hover:underline">{{ room.code }}</NuxtLink></td>
            <td class="px-3 py-2"><UBadge :label="room.public ? 'Public' : 'Private'" :icon="room.public ? 'i-lucide-users' : 'i-lucide-lock'" color="neutral" variant="subtle" size="sm" /></td>
            <td class="px-3 py-2"><UBadge :label="room.closed_at ? 'closed' : room.phase" :color="room.closed_at ? 'neutral' : phaseColor[room.phase] ?? 'neutral'" variant="soft" size="sm" /></td>
            <td class="px-3 py-2 tabular-nums">{{ room.players }} / {{ room.max_players }}</td>
            <td class="px-3 py-2">{{ room.host_name ?? '—' }}</td>
            <td class="px-3 py-2 text-muted">{{ fmtTime(room.created_at) }}</td>
            <td class="px-3 py-2 text-muted">{{ ago(room.closed_at ?? room.updated_at, now) }}</td>
          </tr>
          <tr v-if="!rooms.length">
            <td colspan="7" class="px-3 py-8 text-center text-muted">{{ closed ? 'No closed rooms yet.' : 'Nobody is playing right now.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
