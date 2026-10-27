<script setup lang="ts">
// One game afterwards: the ranking, every turn (drawer, word, who guessed, likes) with its drawing, and the reports.
import type { Op } from '#shared/protocol';

definePageMeta({ layout: 'admin' });
const route = useRoute();
const id = String(route.params.id);
useHead({ title: 'Game' });

interface Turn {
  idx: number;
  round: number;
  drawer_name: string | null;
  word: string | null;
  started_at: number | null;
  ended_at: number | null;
  end_reason: string | null;
  guessed: number;
  eligible: number;
  likes: number;
  dislikes: number;
  drawing_key: string | null;
  gains: { id: string; name: string; points: number }[];
}
interface Report {
  id: number;
  ts: number;
  reporter_name: string;
  target_name: string;
  reason: string;
  word: string | null;
  status: string;
}
interface Game {
  id: string;
  room_code: string;
  public: number;
  started_at: number;
  ended_at: number | null;
  end_reason: string | null;
  winner_name: string | null;
  turns: number;
  settings: Record<string, unknown> | null;
  players: { id: string; name: string; score: number; rank: number; account: string | null }[];
}

const { api } = useAdmin();
const data = ref<{ game: Game; turns: Turn[]; reports: Report[] } | null>(null);
const replay = ref<{ turn: Turn; ops: Op[] } | null>(null);
const loadingDrawing = ref<number | null>(null);

onMounted(async () => {
  try {
    data.value = await api(`/games/${id}`);
  } catch {
    /* shown by useAdmin */
  }
});

async function open(turn: Turn) {
  if (!turn.drawing_key) return;
  loadingDrawing.value = turn.idx;
  try {
    const drawing = await api<{ ops: Op[] }>(`/drawing?key=${encodeURIComponent(turn.drawing_key)}`);
    replay.value = { turn, ops: drawing.ops };
  } catch {
    /* shown by useAdmin */
  } finally {
    loadingDrawing.value = null;
  }
}
const reasons: Record<string, string> = { time: 'Time ran out', all_guessed: 'Everyone guessed', drawer_left: 'Drawer left', skipped: 'Skipped' };
</script>

<template>
  <div v-if="data" class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center gap-3">
      <UButton to="/admin/games" icon="i-lucide-chevron-left" color="neutral" variant="ghost" square aria-label="Back to games" />
      <h1 class="font-display text-3xl text-highlighted">Game of {{ fmtTime(data.game.started_at) }}</h1>
      <UButton :to="`/admin/rooms/${data.game.room_code}`" :label="`Room ${data.game.room_code}`" icon="i-lucide-radio" color="neutral" variant="outline" size="sm" />
      <UButton :to="`/admin/audit?game=${data.game.id}`" label="Audit log for this game" icon="i-lucide-scroll-text" color="neutral" variant="outline" size="sm" />
    </div>

    <div class="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <UCard>
        <h2 class="mb-2 font-semibold text-highlighted">Ranking</h2>
        <ol class="flex flex-col gap-1 text-sm">
          <li v-for="p in data.game.players" :key="p.id" class="flex items-center justify-between gap-2">
            <span><span class="inline-block w-7 text-muted">#{{ p.rank }}</span>{{ p.name }} <span v-if="p.account" class="text-xs text-muted">({{ p.account }})</span></span>
            <span class="font-semibold tabular-nums">{{ p.score }}</span>
          </li>
        </ol>
        <USeparator class="my-3" />
        <dl class="grid grid-cols-2 gap-1 text-xs">
          <dt class="text-muted">Length</dt><dd>{{ duration(data.game.started_at, data.game.ended_at) }}</dd>
          <dt class="text-muted">Ended</dt><dd>{{ data.game.end_reason ?? 'still running' }}</dd>
          <template v-for="(value, key) in data.game.settings" :key="key">
            <dt class="text-muted">{{ key }}</dt><dd>{{ value }}</dd>
          </template>
        </dl>
      </UCard>

      <div class="overflow-x-auto rounded-lg border border-default bg-default">
        <table class="w-full text-sm">
          <thead class="border-b border-default text-left text-xs text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">#</th>
              <th class="px-3 py-2 font-medium">Drawer</th>
              <th class="px-3 py-2 font-medium">Word</th>
              <th class="px-3 py-2 font-medium">Guessed</th>
              <th class="px-3 py-2 font-medium">Likes</th>
              <th class="px-3 py-2 font-medium">Points</th>
              <th class="px-3 py-2 font-medium">Ended</th>
              <th class="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in data.turns" :key="t.idx" class="border-b border-default align-top last:border-0">
              <td class="px-3 py-2 text-muted tabular-nums">R{{ t.round }}·{{ t.idx }}</td>
              <td class="px-3 py-2">{{ t.drawer_name }}</td>
              <td class="px-3 py-2 font-semibold text-highlighted">{{ t.word }}</td>
              <td class="px-3 py-2 tabular-nums">{{ t.guessed }} / {{ t.eligible }}</td>
              <td class="px-3 py-2 tabular-nums">{{ t.likes }} / {{ t.dislikes }}</td>
              <td class="px-3 py-2 text-xs">{{ t.gains.map((g) => `${g.name} +${g.points}`).join(', ') || '—' }}</td>
              <td class="px-3 py-2 text-xs text-muted">{{ reasons[t.end_reason ?? ''] ?? t.end_reason }} · {{ duration(t.started_at, t.ended_at) }}</td>
              <td class="px-3 py-2"><UButton v-if="t.drawing_key" label="Drawing" icon="i-lucide-eye" size="xs" color="neutral" variant="outline" :loading="loadingDrawing === t.idx" @click="open(t)" /></td>
            </tr>
            <tr v-if="!data.turns.length"><td colspan="8" class="px-3 py-6 text-center text-muted">No turns were finished.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <section v-if="data.reports.length" class="flex flex-col gap-2">
      <h2 class="font-display text-xl text-highlighted">Reports in this game</h2>
      <UCard v-for="r in data.reports" :key="r.id">
        <p class="text-sm"><strong>{{ r.reporter_name }}</strong> reported <strong>{{ r.target_name }}</strong> ({{ fmtTime(r.ts) }}): {{ r.reason }}<span v-if="r.word" class="text-muted"> · word “{{ r.word }}”</span></p>
        <UBadge :label="r.status" color="neutral" variant="subtle" size="sm" class="mt-1" />
      </UCard>
    </section>

    <UModal :open="!!replay" :title="replay ? `“${replay.turn.word}” by ${replay.turn.drawer_name}` : ''" :ui="{ content: 'max-w-3xl' }" @update:open="(value) => !value && (replay = null)">
      <template #body>
        <AdminDrawingReplay v-if="replay" :ops="replay.ops" />
      </template>
    </UModal>
  </div>
  <p v-else class="flex items-center gap-2 text-muted"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" /> Loading…</p>
</template>
