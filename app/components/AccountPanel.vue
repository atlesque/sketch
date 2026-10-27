<script setup lang="ts">
// Guest or signed in with an Atlesque account (Atlesque Play); signed-in players see their totals here.
import type { Stats } from '~/composables/useAccount';

const { account, signIn, signOut, stats } = useAccount();
const totals = ref<Stats | null>(null);
const busy = ref(false);
watch(
  () => account.value?.token,
  async (token) => (totals.value = token ? await stats() : null),
  { immediate: true },
);
async function go() {
  busy.value = true;
  await signIn('/');
}
</script>

<template>
  <UCard :ui="{ body: 'flex flex-col gap-3' }">
    <template v-if="account">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-badge-check" class="size-5 text-info" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-highlighted">Ingelogd</p>
          <p class="truncate text-xs text-muted">{{ account.user.email }}</p>
        </div>
        <UButton label="Uitloggen" icon="i-lucide-log-out" color="neutral" variant="ghost" size="xs" class="ms-auto" @click="signOut" />
      </div>
      <dl v-if="totals" class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-md bg-elevated p-2"><dt class="text-xs text-muted">Gespeeld</dt><dd class="text-lg font-bold text-highlighted tabular-nums">{{ totals.games }}</dd></div>
        <div class="rounded-md bg-elevated p-2"><dt class="text-xs text-muted">Gewonnen</dt><dd class="text-lg font-bold text-highlighted tabular-nums">{{ totals.wins }}</dd></div>
        <div class="rounded-md bg-elevated p-2"><dt class="text-xs text-muted">Punten</dt><dd class="text-lg font-bold text-highlighted tabular-nums">{{ totals.points }}</dd></div>
      </dl>
    </template>
    <template v-else>
      <p class="text-sm text-toned">Je speelt als <strong>gast</strong>. Log in of maak een account aan met je Atlesque-account om je punten bij te houden en een badge te krijgen.</p>
      <UButton label="Inloggen of registreren" icon="i-lucide-user-round" color="neutral" variant="outline" block :loading="busy" @click="go" />
    </template>
  </UCard>
</template>
