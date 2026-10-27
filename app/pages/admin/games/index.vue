<script setup lang="ts">
// Every game played, newest first; search by player name or by a word that was drawn.
definePageMeta({ layout: 'admin' });
useHead({ title: 'Games' });

interface GameRow {
  id: string;
  room_code: string;
  public: number;
  started_at: number;
  ended_at: number | null;
  end_reason: string | null;
  winner_name: string | null;
  turns: number;
  players: { name: string; score: number; rank: number; account: string | null }[];
}

const { api } = useAdmin();
const games = ref<GameRow[]>([]);
const more = ref(false);
const search = ref('');
const loading = ref(false);

async function load(append = false) {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (search.value.trim()) params.set('q', search.value.trim());
    if (append && games.value.length) params.set('before', String(games.value.at(-1)!.started_at));
    const result = await api<{ games: GameRow[]; more: boolean }>(`/games?${params}`);
    games.value = append ? [...games.value, ...result.games] : result.games;
    more.value = result.more;
  } catch {
    /* shown by useAdmin */
  } finally {
    loading.value = false;
  }
}
onMounted(() => load());

const reasons: Record<string, string> = { finished: 'Finished', not_enough_players: 'Too few players', admin: 'Ended by admin', closed: 'Room closed' };
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl text-highlighted">Games</h1>
        <p class="text-sm text-muted">Open a game for its turns, words, points and the drawings.</p>
      </div>
      <form class="flex gap-2" @submit.prevent="load()">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Player or word" />
        <UButton type="submit" label="Search" :loading="loading" />
      </form>
    </div>

    <div class="overflow-x-auto rounded-lg border border-default bg-default">
      <table class="w-full text-sm">
        <thead class="border-b border-default text-left text-xs text-muted">
          <tr>
            <th class="px-3 py-2 font-medium">Started</th>
            <th class="px-3 py-2 font-medium">Room</th>
            <th class="px-3 py-2 font-medium">Players</th>
            <th class="px-3 py-2 font-medium">Turns</th>
            <th class="px-3 py-2 font-medium">Length</th>
            <th class="px-3 py-2 font-medium">Winner</th>
            <th class="px-3 py-2 font-medium">Ended</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in games" :key="g.id" class="cursor-pointer border-b border-default last:border-0 hover:bg-elevated/60" @click="navigateTo(`/admin/games/${g.id}`)">
            <td class="px-3 py-2 whitespace-nowrap"><NuxtLink :to="`/admin/games/${g.id}`" class="text-primary hover:underline">{{ fmtTime(g.started_at) }}</NuxtLink></td>
            <td class="px-3 py-2 font-mono">{{ g.room_code }} <UIcon :name="g.public ? 'i-lucide-users' : 'i-lucide-lock'" class="size-3.5 text-muted" /></td>
            <td class="max-w-xs px-3 py-2"><span class="line-clamp-2">{{ g.players.map((p) => p.name).join(', ') || '…' }}</span></td>
            <td class="px-3 py-2 tabular-nums">{{ g.turns }}</td>
            <td class="px-3 py-2 tabular-nums">{{ duration(g.started_at, g.ended_at) }}</td>
            <td class="px-3 py-2">{{ g.winner_name ?? '—' }}</td>
            <td class="px-3 py-2"><UBadge :label="g.end_reason ? reasons[g.end_reason] ?? g.end_reason : 'Running'" :color="g.end_reason ? 'neutral' : 'success'" variant="soft" size="sm" /></td>
          </tr>
          <tr v-if="!games.length"><td colspan="7" class="px-3 py-8 text-center text-muted">No games yet.</td></tr>
        </tbody>
      </table>
    </div>
    <UButton v-if="more" label="Load older games" color="neutral" variant="outline" class="self-center" :loading="loading" @click="load(true)" />
  </div>
</template>
