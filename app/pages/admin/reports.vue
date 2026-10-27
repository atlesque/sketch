<script setup lang="ts">
// Reports from players: resolve or dismiss them (with a note), and ban the reported player's browser or account.
definePageMeta({ layout: 'admin' });
useHead({ title: 'Reports' });

interface Report {
  id: number;
  ts: number;
  room_code: string | null;
  game_id: string | null;
  turn_idx: number | null;
  reporter_name: string;
  reporter_account: string | null;
  target_id: string;
  target_name: string;
  target_account: string | null;
  target_device: string | null;
  reason: string;
  word: string | null;
  status: string;
  resolved_at: number | null;
  resolved_by: string | null;
  note: string | null;
}

const { api } = useAdmin();
const toast = useToast();
const status = ref('open');
const reports = ref<Report[]>([]);
const notes = reactive<Record<number, string>>({});

async function load() {
  try {
    reports.value = (await api<{ reports: Report[] }>(`/reports?status=${status.value}`)).reports;
  } catch {
    /* shown by useAdmin */
  }
}
watch(status, load);
onMounted(load);

async function set(r: Report, next: string) {
  try {
    await api(`/reports/${r.id}`, { method: 'POST', body: { status: next, note: notes[r.id] ?? r.note ?? undefined } });
    toast.add({ title: `Report ${next}`, color: 'success', icon: 'i-lucide-circle-check' });
    load();
  } catch {
    /* shown by useAdmin */
  }
}

/** Bans the reported player's browser; account bans are on the live room and the Players page (they need the account id). */
async function ban(r: Report) {
  if (!r.target_device) return;
  try {
    await api('/bans', { method: 'POST', body: { kind: 'device', value: r.target_device, label: `${r.target_name}${r.target_account ? ` (${r.target_account})` : ''}`, reason: notes[r.id] || r.reason } });
    toast.add({ title: `${r.target_name}'s browser is banned`, color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    /* shown by useAdmin */
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl text-highlighted">Reports</h1>
        <p class="text-sm text-muted">What players reported, with the word being drawn at the time.</p>
      </div>
      <USelect v-model="status" :items="[{ label: 'Open', value: 'open' }, { label: 'Resolved', value: 'resolved' }, { label: 'Dismissed', value: 'dismissed' }, { label: 'All', value: 'all' }]" class="w-40" />
    </div>

    <UCard v-for="r in reports" :key="r.id" :ui="{ body: 'flex flex-col gap-3' }">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <strong class="text-highlighted">{{ r.reporter_name }}</strong>
        <span class="text-muted">reported</span>
        <strong class="text-highlighted">{{ r.target_name }}</strong>
        <span v-if="r.target_account" class="text-xs text-muted">({{ r.target_account }})</span>
        <UBadge :label="r.status" :color="r.status === 'open' ? 'warning' : 'neutral'" variant="soft" size="sm" />
        <span class="ms-auto text-xs text-muted">{{ fmtTime(r.ts) }}</span>
      </div>
      <p class="text-sm">{{ r.reason }}<span v-if="r.word" class="text-muted"> · they were drawing “{{ r.word }}”</span></p>
      <div class="flex flex-wrap gap-2 text-xs">
        <UButton v-if="r.room_code" :to="`/admin/rooms/${r.room_code}`" :label="`Room ${r.room_code}`" size="xs" color="neutral" variant="outline" />
        <UButton v-if="r.game_id" :to="`/admin/games/${r.game_id}`" label="Game and drawings" size="xs" color="neutral" variant="outline" />
        <UButton v-if="r.target_device" :to="`/admin/audit?device=${r.target_device}`" label="Their audit log" size="xs" color="neutral" variant="outline" />
      </div>
      <UInput v-model="notes[r.id]" :placeholder="r.note ?? 'Note (optional)'" size="sm" />
      <div class="flex flex-wrap gap-2">
        <UButton v-if="r.status !== 'resolved'" label="Resolve" icon="i-lucide-check" size="sm" @click="set(r, 'resolved')" />
        <UButton v-if="r.status !== 'dismissed'" label="Dismiss" size="sm" color="neutral" variant="outline" @click="set(r, 'dismissed')" />
        <UButton v-if="r.status !== 'open'" label="Reopen" size="sm" color="neutral" variant="ghost" @click="set(r, 'open')" />
        <span class="ms-auto flex gap-2">
          <UButton v-if="r.target_device" label="Ban browser" icon="i-lucide-ban" size="sm" color="error" variant="outline" @click="ban(r)" />
        </span>
      </div>
      <p v-if="r.resolved_by" class="text-xs text-muted">{{ r.status }} by {{ r.resolved_by }} {{ ago(r.resolved_at) }}<span v-if="r.note">: {{ r.note }}</span></p>
    </UCard>
    <p v-if="!reports.length" class="py-8 text-center text-muted">No {{ status === 'all' ? '' : status }} reports.</p>
  </div>
</template>
