<script setup lang="ts">
// Who plays: Atlesque accounts with their totals, and every browser that joined a room lately (guests included).
definePageMeta({ layout: 'admin' });
useHead({ title: 'Players' });

interface AccountRow {
  account_id: string;
  email: string;
  name: string | null;
  games: number;
  wins: number;
  points: number;
  guesses: number;
  drawings: number;
  first_played: number | null;
  last_played: number | null;
}
interface DeviceRow {
  device: string;
  name: string | null;
  account_email: string | null;
  ip: string | null;
  joins: number;
  rooms: number;
  last_seen: number;
}

const { api } = useAdmin();
const days = ref(30);
const accounts = ref<AccountRow[]>([]);
const devices = ref<DeviceRow[]>([]);
const filter = ref('');

async function load() {
  try {
    const result = await api<{ accounts: AccountRow[]; devices: DeviceRow[] }>(`/players?days=${days.value}`);
    accounts.value = result.accounts;
    devices.value = result.devices;
  } catch {
    /* shown by useAdmin */
  }
}
watch(days, load);
onMounted(load);

const match = (...values: (string | null)[]) => !filter.value || values.some((v) => v?.toLowerCase().includes(filter.value.toLowerCase()));
const banLink = (kind: string, value: string, label: string) => `/admin/bans?${new URLSearchParams({ kind, value, label })}`;
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl text-highlighted">Players</h1>
        <p class="text-sm text-muted">Signed-in players and every browser that joined a room.</p>
      </div>
      <div class="flex gap-2">
        <UInput v-model="filter" icon="i-lucide-search" placeholder="Name, email, IP" />
        <USelect v-model="days" :items="[{ label: 'Last 7 days', value: 7 }, { label: 'Last 30 days', value: 30 }, { label: 'Last 180 days', value: 180 }]" class="w-40" />
      </div>
    </div>

    <section class="flex flex-col gap-2">
      <h2 class="font-display text-xl text-highlighted">Atlesque accounts</h2>
      <div class="overflow-x-auto rounded-lg border border-default bg-default">
        <table class="w-full text-sm">
          <thead class="border-b border-default text-left text-xs text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">Account</th>
              <th class="px-3 py-2 font-medium">Last name</th>
              <th class="px-3 py-2 font-medium">Games</th>
              <th class="px-3 py-2 font-medium">Wins</th>
              <th class="px-3 py-2 font-medium">Points</th>
              <th class="px-3 py-2 font-medium">Guessed</th>
              <th class="px-3 py-2 font-medium">Drew</th>
              <th class="px-3 py-2 font-medium">Last played</th>
              <th class="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in accounts.filter((a) => match(a.email, a.name))" :key="a.account_id" class="border-b border-default last:border-0">
              <td class="px-3 py-2"><NuxtLink :to="`/admin/audit?account=${a.email}`" class="text-primary hover:underline">{{ a.email }}</NuxtLink></td>
              <td class="px-3 py-2">{{ a.name }}</td>
              <td class="px-3 py-2 tabular-nums">{{ a.games }}</td>
              <td class="px-3 py-2 tabular-nums">{{ a.wins }}</td>
              <td class="px-3 py-2 tabular-nums">{{ a.points }}</td>
              <td class="px-3 py-2 tabular-nums">{{ a.guesses }}</td>
              <td class="px-3 py-2 tabular-nums">{{ a.drawings }}</td>
              <td class="px-3 py-2 text-muted">{{ ago(a.last_played) }}</td>
              <td class="px-3 py-2"><UButton :to="banLink('account', a.account_id, a.email)" label="Ban" icon="i-lucide-ban" size="xs" color="error" variant="ghost" /></td>
            </tr>
            <tr v-if="!accounts.length"><td colspan="9" class="px-3 py-6 text-center text-muted">Nobody has played signed in yet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="font-display text-xl text-highlighted">Browsers</h2>
      <div class="overflow-x-auto rounded-lg border border-default bg-default">
        <table class="w-full text-sm">
          <thead class="border-b border-default text-left text-xs text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">Last name</th>
              <th class="px-3 py-2 font-medium">Account</th>
              <th class="px-3 py-2 font-medium">Device</th>
              <th class="px-3 py-2 font-medium">Last IP</th>
              <th class="px-3 py-2 font-medium">Joins</th>
              <th class="px-3 py-2 font-medium">Rooms</th>
              <th class="px-3 py-2 font-medium">Last seen</th>
              <th class="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in devices.filter((d) => match(d.name, d.account_email, d.ip, d.device))" :key="d.device" class="border-b border-default last:border-0">
              <td class="px-3 py-2 font-semibold text-highlighted">{{ d.name }}</td>
              <td class="px-3 py-2">{{ d.account_email ?? 'guest' }}</td>
              <td class="px-3 py-2 font-mono text-xs"><NuxtLink :to="`/admin/audit?device=${d.device}`" class="text-primary hover:underline">{{ d.device.slice(0, 8) }}</NuxtLink></td>
              <td class="px-3 py-2 font-mono text-xs">{{ d.ip ?? '—' }}</td>
              <td class="px-3 py-2 tabular-nums">{{ d.joins }}</td>
              <td class="px-3 py-2 tabular-nums">{{ d.rooms }}</td>
              <td class="px-3 py-2 text-muted">{{ ago(d.last_seen) }}</td>
              <td class="px-3 py-2"><UButton :to="banLink('device', d.device, d.name ?? '')" label="Ban" icon="i-lucide-ban" size="xs" color="error" variant="ghost" /></td>
            </tr>
            <tr v-if="!devices.length"><td colspan="8" class="px-3 py-6 text-center text-muted">Nobody joined a room in this period.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
