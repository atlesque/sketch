<script setup lang="ts">
// One line under the play buttons: playing as a guest (with the way to sign in), or signed in with an Atlesque
// account (Atlesque Play) and that account's totals.
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
  await signIn();
}
</script>

<template>
  <div class="text-center text-sm text-muted">
    <template v-if="account">
      <p class="flex flex-wrap items-center justify-center gap-x-1">
        <UIcon name="i-lucide-badge-check" class="size-4 text-info" />
        <span>Ingelogd als <span class="font-semibold text-default">{{ account.user.email }}</span></span>
        <span aria-hidden="true">·</span>
        <button type="button" class="underline hover:text-default" @click="signOut">Uitloggen</button>
      </p>
      <p v-if="totals" class="mt-0.5 tabular-nums">{{ totals.games }} gespeeld · {{ totals.wins }} gewonnen · {{ totals.points }} punten</p>
    </template>
    <p v-else>
      Je speelt als gast.
      <button type="button" class="font-semibold text-highlighted underline decoration-[var(--color-brand)] decoration-2 underline-offset-2 disabled:opacity-60" :disabled="busy" @click="go">Inloggen of registreren</button>
      voor een badge en je punten.
    </p>
  </div>
</template>
