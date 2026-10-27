<script setup lang="ts">
// Site-wide bans: an Atlesque account id, a browser (device id) or an IP. Checked whenever someone joins a room.
definePageMeta({ layout: 'admin' });
useHead({ title: 'Bans' });

interface Ban {
  id: number;
  kind: 'account' | 'device' | 'ip';
  value: string;
  label: string | null;
  reason: string | null;
  created_at: number;
  created_by: string;
  expires_at: number | null;
  lifted_at: number | null;
  lifted_by: string | null;
}

const route = useRoute();
const { api } = useAdmin();
const toast = useToast();
const bans = ref<Ban[]>([]);
const now = ref(Date.now());
const form = reactive({ kind: String(route.query.kind ?? 'device'), value: String(route.query.value ?? ''), label: String(route.query.label ?? ''), reason: '', days: 0 });

async function load() {
  try {
    const result = await api<{ bans: Ban[]; now: number }>('/bans');
    bans.value = result.bans;
    now.value = result.now;
  } catch {
    /* shown by useAdmin */
  }
}
onMounted(load);

async function add() {
  if (!form.value.trim()) return;
  try {
    await api('/bans', { method: 'POST', body: { ...form, days: form.days || undefined } });
    toast.add({ title: 'Ban added', color: 'success', icon: 'i-lucide-circle-check' });
    Object.assign(form, { value: '', label: '', reason: '', days: 0 });
    load();
  } catch {
    /* shown by useAdmin */
  }
}

async function lift(ban: Ban) {
  try {
    await api(`/bans/${ban.id}/lift`, { method: 'POST' });
    toast.add({ title: 'Ban lifted', color: 'success', icon: 'i-lucide-circle-check' });
    load();
  } catch {
    /* shown by useAdmin */
  }
}

const active = (ban: Ban) => !ban.lifted_at && (!ban.expires_at || ban.expires_at > now.value);
const kinds = [
  { label: 'Browser (device id)', value: 'device' },
  { label: 'Atlesque account (user id)', value: 'account' },
  { label: 'IP address', value: 'ip' },
];
const durations = [
  { label: 'Until lifted', value: 0 },
  { label: '1 day', value: 1 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
];
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="font-display text-3xl text-highlighted">Bans</h1>
      <p class="text-sm text-muted">Banned players can't join any room. Bans from a live room cover the account and the browser; add one by hand here.</p>
    </div>

    <form class="grid gap-2 rounded-lg border border-default bg-default p-3 sm:grid-cols-2 lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_9rem_auto]" @submit.prevent="add">
      <USelect v-model="form.kind" :items="kinds" />
      <UInput v-model="form.value" placeholder="Device id, account id or IP" class="font-mono" required />
      <UInput v-model="form.label" placeholder="Who (name, email)" />
      <UInput v-model="form.reason" placeholder="Reason (they see it)" />
      <USelect v-model="form.days" :items="durations" />
      <UButton type="submit" label="Ban" icon="i-lucide-ban" color="error" :disabled="!form.value.trim()" />
    </form>

    <div class="overflow-x-auto rounded-lg border border-default bg-default">
      <table class="w-full text-sm">
        <thead class="border-b border-default text-left text-xs text-muted">
          <tr>
            <th class="px-3 py-2 font-medium">Who</th>
            <th class="px-3 py-2 font-medium">Kind</th>
            <th class="px-3 py-2 font-medium">Value</th>
            <th class="px-3 py-2 font-medium">Reason</th>
            <th class="px-3 py-2 font-medium">Added</th>
            <th class="px-3 py-2 font-medium">Until</th>
            <th class="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="ban in bans" :key="ban.id" class="border-b border-default last:border-0" :class="active(ban) ? '' : 'opacity-55'">
            <td class="px-3 py-2">{{ ban.label ?? '—' }}</td>
            <td class="px-3 py-2"><UBadge :label="ban.kind" color="neutral" variant="subtle" size="sm" /></td>
            <td class="px-3 py-2 font-mono text-xs break-all">
              <NuxtLink v-if="ban.kind === 'device'" :to="`/admin/audit?device=${ban.value}`" class="hover:underline">{{ ban.value }}</NuxtLink>
              <NuxtLink v-else-if="ban.kind === 'ip'" :to="`/admin/audit?ip=${ban.value}`" class="hover:underline">{{ ban.value }}</NuxtLink>
              <template v-else>{{ ban.value }}</template>
            </td>
            <td class="px-3 py-2">{{ ban.reason ?? '—' }}</td>
            <td class="px-3 py-2 text-xs text-muted">{{ fmtTime(ban.created_at) }}<br>by {{ ban.created_by }}</td>
            <td class="px-3 py-2 text-xs text-muted">
              <template v-if="ban.lifted_at">lifted {{ ago(ban.lifted_at, now) }} by {{ ban.lifted_by }}</template>
              <template v-else-if="ban.expires_at">{{ fmtTime(ban.expires_at) }}</template>
              <template v-else>lifted by hand</template>
            </td>
            <td class="px-3 py-2"><UButton v-if="active(ban)" label="Lift" size="xs" color="neutral" variant="outline" @click="lift(ban)" /></td>
          </tr>
          <tr v-if="!bans.length"><td colspan="7" class="px-3 py-8 text-center text-muted">Nobody is banned.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
