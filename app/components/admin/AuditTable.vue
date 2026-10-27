<script setup lang="ts">
// Audit log rows: time, what happened, where, who (and to whom), the text and the details. Click a row for its raw data.
export interface AuditRow {
  id: number;
  ts: number;
  room_code: string | null;
  game_id: string | null;
  type: string;
  actor: string | null;
  actor_name: string | null;
  account_id: string | null;
  account_email: string | null;
  device: string | null;
  ip: string | null;
  target: string | null;
  target_name: string | null;
  text: string | null;
  data: unknown;
}

defineProps<{ events: AuditRow[]; compact?: boolean }>();
const open = ref<number | null>(null);

function color(type: string): 'error' | 'warning' | 'success' | 'info' | 'neutral' | 'secondary' {
  if (type.startsWith('admin.')) return 'secondary';
  if (/ban|kick|blocked|report|muted/.test(type)) return 'error';
  if (/votekick|close|dislike|disconnect/.test(type)) return 'warning';
  if (/correct|like|game\.(start|end)|turn/.test(type)) return 'success';
  if (/join|leave|rejoin|room/.test(type)) return 'info';
  return 'neutral';
}

function summary(e: AuditRow): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'turn.end':
      return `${d.reason} · ${d.guessed}/${d.eligible} guessed`;
    case 'game.end':
      return `${d.reason} · ${d.turns} turns`;
    case 'player.leave':
      return `${d.why}`;
    case 'votekick.vote':
      return `${d.votes}/${d.needed} votes`;
    default:
      return '';
  }
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-default bg-default">
    <table class="w-full text-sm">
      <thead class="border-b border-default text-left text-xs text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Time</th>
          <th class="px-3 py-2 font-medium">Event</th>
          <th v-if="!compact" class="px-3 py-2 font-medium">Room</th>
          <th class="px-3 py-2 font-medium">Who</th>
          <th class="px-3 py-2 font-medium">Target</th>
          <th class="px-3 py-2 font-medium">Text</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="e in events" :key="e.id">
          <tr class="cursor-pointer border-b border-default align-top last:border-0 hover:bg-elevated/60" @click="open = open === e.id ? null : e.id">
            <td class="px-3 py-1.5 whitespace-nowrap text-muted tabular-nums">{{ fmtTime(e.ts) }}</td>
            <td class="px-3 py-1.5"><UBadge :label="e.type" :color="color(e.type)" variant="soft" size="sm" class="font-mono" /></td>
            <td v-if="!compact" class="px-3 py-1.5 font-mono">
              <NuxtLink v-if="e.room_code" :to="`/admin/rooms/${e.room_code}`" class="text-primary hover:underline" @click.stop>{{ e.room_code }}</NuxtLink>
            </td>
            <td class="px-3 py-1.5">
              <span class="font-medium text-highlighted">{{ e.actor_name ?? '' }}</span>
              <span v-if="e.account_email && !e.actor?.startsWith('admin:')" class="block text-xs text-muted">{{ e.account_email }}</span>
            </td>
            <td class="px-3 py-1.5">{{ e.target_name ?? '' }}</td>
            <td class="max-w-md px-3 py-1.5 break-words">
              {{ e.text ?? '' }}
              <span v-if="summary(e)" class="text-muted">{{ summary(e) }}</span>
            </td>
          </tr>
          <tr v-if="open === e.id" class="border-b border-default bg-muted">
            <td :colspan="compact ? 5 : 6" class="px-3 py-2">
              <dl class="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
                <template v-for="[label, value] in [['Actor id', e.actor], ['Account', e.account_email], ['Device', e.device], ['IP', e.ip], ['Target id', e.target], ['Game', e.game_id]]" :key="label">
                  <template v-if="value">
                    <dt class="text-muted">{{ label }}</dt>
                    <dd class="font-mono break-all">
                      <NuxtLink v-if="label === 'Game'" :to="`/admin/games/${value}`" class="text-primary hover:underline">{{ value }}</NuxtLink>
                      <NuxtLink v-else-if="label === 'Device'" :to="`/admin/audit?device=${value}`" class="text-primary hover:underline">{{ value }}</NuxtLink>
                      <template v-else>{{ value }}</template>
                    </dd>
                  </template>
                </template>
                <template v-if="e.data">
                  <dt class="text-muted">Data</dt>
                  <dd><pre class="overflow-x-auto font-mono whitespace-pre-wrap">{{ JSON.stringify(e.data, null, 2) }}</pre></dd>
                </template>
              </dl>
            </td>
          </tr>
        </template>
        <tr v-if="!events.length">
          <td :colspan="compact ? 5 : 6" class="px-3 py-6 text-center text-muted">No events.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
