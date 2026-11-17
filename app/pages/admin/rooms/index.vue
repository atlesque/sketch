<script setup lang="ts">
// Room history: every room opened, closed or still open in a period, with a timeline of the openings and closings.
definePageMeta({ layout: 'admin' });
useHead({ title: 'Room history' });

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
  games: number;
  visitors: number;
  close_reason: string | null;
  closed_by: string | null;
}

const route = useRoute();
const router = useRouter();
const { api } = useAdmin();
const days = ref(Number(route.query.days) || 7);
const status = ref(String(route.query.status ?? 'all'));
const rooms = ref<RoomRow[]>([]);
const now = ref(Date.now());
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const result = await api<{ rooms: RoomRow[]; now: number }>(`/room-history?days=${days.value}&status=${status.value}`);
    rooms.value = result.rooms;
    now.value = result.now;
    router.replace({ query: { days: String(days.value), status: status.value } });
  } catch {
    /* shown by useAdmin */
  } finally {
    loading.value = false;
  }
}
watch([days, status], load);
onMounted(load);

const since = computed(() => now.value - days.value * 86_400_000);
function span(from: number, to: number) {
  const m = Math.max(0, Math.round((to - from) / 60_000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}
const reason = (room: RoomRow) =>
  room.close_reason === 'admin' ? `Closed by ${room.closed_by ?? 'an admin'}` : room.close_reason === 'empty' ? 'Everyone left' : 'Timed out (stale)';

// Openings and closings in the period, newest first.
const timeline = computed(() =>
  rooms.value
    .flatMap((room) => [
      ...(room.created_at > since.value ? [{ ts: room.created_at, kind: 'opened' as const, room }] : []),
      ...(room.closed_at && room.closed_at > since.value ? [{ ts: room.closed_at, kind: 'closed' as const, room }] : []),
    ])
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 100),
);
const counts = computed(() => ({
  active: rooms.value.filter((r) => !r.closed_at).length,
  opened: rooms.value.filter((r) => r.created_at > since.value).length,
  closed: rooms.value.filter((r) => r.closed_at && r.closed_at > since.value).length,
  games: rooms.value.reduce((sum, r) => sum + r.games, 0),
}));
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl text-highlighted">Room history</h1>
        <p class="text-sm text-muted">Rooms opened and closed lately, and the ones still open.</p>
      </div>
      <div class="flex gap-2">
        <USelect v-model="status" :items="[{ label: 'All rooms', value: 'all' }, { label: 'Open now', value: 'active' }, { label: 'Closed', value: 'closed' }]" class="w-36" />
        <USelect v-model="days" :items="[{ label: 'Last 24 hours', value: 1 }, { label: 'Last 7 days', value: 7 }, { label: 'Last 30 days', value: 30 }, { label: 'Last 180 days', value: 180 }]" class="w-40" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="loading" aria-label="Refresh" @click="load" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="card in [{ label: 'Open now', value: counts.active }, { label: 'Opened', value: counts.opened }, { label: 'Closed', value: counts.closed }, { label: 'Games in these rooms', value: counts.games }]" :key="card.label" class="rounded-lg border border-default bg-default p-4">
        <p class="text-xs text-muted">{{ card.label }}</p>
        <p class="mt-1 text-2xl font-bold text-highlighted tabular-nums">{{ card.value }}</p>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div class="overflow-x-auto rounded-lg border border-default bg-default">
        <table class="w-full text-sm">
          <thead class="border-b border-default text-left text-xs text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">Room</th>
              <th class="px-3 py-2 font-medium">Status</th>
              <th class="px-3 py-2 font-medium">Kind</th>
              <th class="px-3 py-2 font-medium">Opened</th>
              <th class="px-3 py-2 font-medium">Closed</th>
              <th class="px-3 py-2 font-medium">Open for</th>
              <th class="px-3 py-2 font-medium">Games</th>
              <th class="px-3 py-2 font-medium">Visitors</th>
              <th class="px-3 py-2 font-medium">Host</th>
              <th class="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in rooms" :key="room.code" class="border-b border-default last:border-0 hover:bg-elevated/60">
              <td class="px-3 py-2"><NuxtLink :to="`/admin/rooms/${room.code}`" class="font-mono font-semibold text-primary hover:underline">{{ room.code }}</NuxtLink></td>
              <td class="px-3 py-2">
                <UBadge v-if="!room.closed_at" :label="`open · ${room.players}/${room.max_players}`" color="success" variant="soft" size="sm" />
                <UBadge v-else :label="reason(room)" color="neutral" variant="soft" size="sm" />
              </td>
              <td class="px-3 py-2"><UBadge :label="room.public ? 'Public' : 'Private'" :icon="room.public ? 'i-lucide-users' : 'i-lucide-lock'" color="neutral" variant="subtle" size="sm" /></td>
              <td class="px-3 py-2 whitespace-nowrap text-muted">{{ fmtTime(room.created_at) }}</td>
              <td class="px-3 py-2 whitespace-nowrap text-muted">{{ room.closed_at ? fmtTime(room.closed_at) : '—' }}</td>
              <td class="px-3 py-2 whitespace-nowrap tabular-nums">{{ span(room.created_at, room.closed_at ?? now) }}</td>
              <td class="px-3 py-2 tabular-nums">{{ room.games }}</td>
              <td class="px-3 py-2 tabular-nums">{{ room.visitors }}</td>
              <td class="px-3 py-2">{{ room.host_name ?? '—' }}</td>
              <td class="px-3 py-2"><UButton :to="`/admin/audit?room=${room.code}`" label="Log" icon="i-lucide-scroll-text" size="xs" color="neutral" variant="ghost" /></td>
            </tr>
            <tr v-if="!rooms.length">
              <td colspan="10" class="px-3 py-8 text-center text-muted">{{ loading ? 'Loading…' : 'No rooms in this period.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="flex flex-col gap-2">
        <h2 class="font-display text-xl text-highlighted">Timeline</h2>
        <ol class="flex flex-col gap-1 rounded-lg border border-default bg-default p-3 text-sm">
          <li v-for="item in timeline" :key="`${item.kind}-${item.room.code}`" class="flex items-center gap-2">
            <UIcon :name="item.kind === 'opened' ? 'i-lucide-door-open' : 'i-lucide-door-closed'" :class="item.kind === 'opened' ? 'text-success' : 'text-muted'" class="size-4 shrink-0" />
            <NuxtLink :to="`/admin/rooms/${item.room.code}`" class="font-mono text-primary hover:underline">{{ item.room.code }}</NuxtLink>
            <span class="text-muted">{{ item.kind }}</span>
            <span class="ms-auto whitespace-nowrap text-xs text-muted" :title="fmtTime(item.ts)">{{ ago(item.ts, now) }}</span>
          </li>
          <li v-if="!timeline.length" class="py-4 text-center text-muted">Nothing happened in this period.</li>
        </ol>
      </section>
    </div>
  </div>
</template>
