<script setup lang="ts">
// The audit log with filters (also set from links: ?room=, ?game=, ?device=, ?account=, ?type=), paging and CSV export.
import type { AuditRow } from '~/components/admin/AuditTable.vue';

definePageMeta({ layout: 'admin' });
useHead({ title: 'Audit log' });

const route = useRoute();
const router = useRouter();
const { api } = useAdmin();

const filters = reactive({
  // "any": Reka's Select doesn't take an empty value
  type: String(route.query.type ?? 'any'),
  room: String(route.query.room ?? ''),
  game: String(route.query.game ?? ''),
  actor: String(route.query.actor ?? ''),
  account: String(route.query.account ?? ''),
  device: String(route.query.device ?? ''),
  ip: String(route.query.ip ?? ''),
  q: String(route.query.q ?? ''),
  from: String(route.query.from ?? ''),
  to: String(route.query.to ?? ''),
});
const types = ref<{ type: string; count: number }[]>([]);
const events = ref<AuditRow[]>([]);
const more = ref(false);
const loading = ref(false);

const typeItems = computed(() => [
  { label: 'All events', value: 'any' },
  { label: 'All admin actions', value: 'admin.*' },
  { label: 'All chat and guesses', value: 'chat*' },
  { label: 'All player joins and leaves', value: 'player.*' },
  ...types.value.map((t) => ({ label: `${t.type} (${t.count})`, value: t.type })),
]);

function query(before?: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value || value === 'any') continue;
    if (key === 'from' || key === 'to') params.set(key, String(new Date(value).getTime() + (key === 'to' ? 86_400_000 - 1 : 0)));
    else params.set(key, value);
  }
  if (before) params.set('before', String(before));
  params.set('limit', '200');
  return params;
}

async function load(append = false) {
  loading.value = true;
  try {
    const before = append ? events.value.at(-1)?.id : undefined;
    const result = await api<{ events: AuditRow[]; more: boolean }>(`/events?${query(before)}`);
    events.value = append ? [...events.value, ...result.events] : result.events;
    more.value = result.more;
    if (!append) router.replace({ query: Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'any')) });
  } catch {
    /* shown by useAdmin */
  } finally {
    loading.value = false;
  }
}

function reset() {
  for (const key of Object.keys(filters) as (keyof typeof filters)[]) filters[key] = key === 'type' ? 'any' : '';
  load();
}

function exportCsv() {
  const columns = ['id', 'ts', 'type', 'room_code', 'game_id', 'actor', 'actor_name', 'account_email', 'device', 'ip', 'target', 'target_name', 'text', 'data'] as const;
  const cell = (value: unknown) => {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = events.value.map((e) => columns.map((c) => (c === 'ts' ? new Date(e.ts).toISOString() : cell(e[c]))).join(','));
  const blob = new Blob([[columns.join(','), ...rows].join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `sketch-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

onMounted(async () => {
  load();
  try {
    types.value = (await api<{ types: typeof types.value }>('/event-types')).types;
  } catch {
    /* shown by useAdmin */
  }
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="font-display text-3xl text-highlighted">Audit log</h1>
      <p class="text-sm text-muted">Everything that happened in the rooms and every admin action, newest first. Kept for 180 days.</p>
    </div>

    <form class="grid gap-2 rounded-lg border border-default bg-default p-3 sm:grid-cols-2 lg:grid-cols-4" @submit.prevent="load()">
      <USelect v-model="filters.type" :items="typeItems" placeholder="Event type" class="w-full" />
      <UInput v-model="filters.actor" icon="i-lucide-user-round" placeholder="Player name or id" />
      <UInput v-model="filters.account" placeholder="Account email" />
      <UInput v-model="filters.q" icon="i-lucide-search" placeholder="Text (chat, words, reasons)" />
      <UInput v-model="filters.room" placeholder="Room code" class="font-mono" />
      <UInput v-model="filters.game" placeholder="Game id" class="font-mono" />
      <UInput v-model="filters.device" placeholder="Device id" class="font-mono" />
      <UInput v-model="filters.ip" placeholder="IP address" class="font-mono" />
      <UFormField label="From"><UInput v-model="filters.from" type="date" class="w-full" /></UFormField>
      <UFormField label="To"><UInput v-model="filters.to" type="date" class="w-full" /></UFormField>
      <div class="flex items-end gap-2 lg:col-span-2">
        <UButton type="submit" label="Filter" icon="i-lucide-search" :loading="loading" />
        <UButton label="Reset" color="neutral" variant="ghost" @click="reset" />
        <UButton label="Export CSV" icon="i-lucide-external-link" color="neutral" variant="outline" class="ms-auto" :disabled="!events.length" @click="exportCsv" />
      </div>
    </form>

    <AdminAuditTable :events="events" />
    <UButton v-if="more" label="Load older events" color="neutral" variant="outline" class="self-center" :loading="loading" @click="load(true)" />
  </div>
</template>
