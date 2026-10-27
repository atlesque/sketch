<script setup lang="ts">
// Home: your name and avatar, then Spelen (an open room with whoever is playing) or a private room for the team.
// Below: what Sketch is, private rooms, and how to play.
import { LIMITS, type Avatar } from '#shared/protocol';

const { profile } = useProfile();
const toast = useToast();
const busy = ref<'play' | 'private' | null>(null);
const autojoin = useState<string | null>('autojoin', () => null);

async function start(kind: 'play' | 'private') {
  if (!profile.value.name.trim()) {
    toast.add({ title: 'Kies eerst een naam', color: 'warning', icon: 'i-lucide-triangle-alert' });
    return;
  }
  busy.value = kind;
  try {
    const { code } = await $fetch<{ code: string }>(kind === 'play' ? '/api/play' : '/api/rooms', { method: 'POST', body: {} });
    autojoin.value = code;
    await navigateTo(`/r/${code}`);
  } catch {
    toast.add({ title: 'Dat lukte niet, probeer opnieuw', color: 'error', icon: 'i-lucide-triangle-alert' });
  } finally {
    busy.value = null;
  }
}

// a row of Sketch's own creatures under the logo
const crowd: Avatar[] = [
  { color: 0, eyes: 1, mouth: 2, extra: 0 },
  { color: 1, eyes: 3, mouth: 0, extra: 4 },
  { color: 2, eyes: 0, mouth: 5, extra: 0 },
  { color: 4, eyes: 5, mouth: 1, extra: 2 },
  { color: 6, eyes: 2, mouth: 3, extra: 0 },
  { color: 7, eyes: 6, mouth: 4, extra: 5 },
  { color: 8, eyes: 4, mouth: 6, extra: 0 },
  { color: 9, eyes: 7, mouth: 7, extra: 1 },
];
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-muted">
    <div class="flex justify-end p-3"><ThemeSwitch /></div>

    <main class="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pb-10">
      <h1 class="sr-only">Sketch</h1>
      <AppLogo size="lg" />
      <div class="mt-5 flex flex-wrap justify-center" aria-hidden="true">
        <PlayerAvatar v-for="(a, i) in crowd" :key="i" :avatar="a" :size="48" class="-mx-0.5" />
      </div>

      <UCard class="mt-6 w-full max-w-md" :ui="{ body: 'flex flex-col gap-4' }">
        <UInput v-model="profile.name" :maxlength="LIMITS.name" placeholder="Je naam" size="xl" class="w-full" aria-label="Je naam" autofocus @keydown.enter="start('play')" />
        <AvatarEditor v-model="profile.avatar" />
        <UButton label="Spelen!" size="xl" block class="py-3 text-xl font-bold" :loading="busy === 'play'" :disabled="!!busy" @click="start('play')" />
        <UButton label="Privékamer maken" icon="i-lucide-lock" size="lg" color="neutral" variant="subtle" block :loading="busy === 'private'" :disabled="!!busy" @click="start('private')" />
        <AccountLine />
      </UCard>

      <section class="mt-14 grid w-full gap-4 md:grid-cols-3">
        <UCard :ui="{ body: 'h-full' }">
          <h2 class="flex items-center gap-2 font-display text-2xl text-highlighted"><UIcon name="i-lucide-info" class="size-6 text-[var(--color-brand)]" /> Over Sketch</h2>
          <p class="mt-3 text-sm text-toned">Sketch is ons teken- en raadspel voor tijdens de Scrum-ceremonies.</p>
          <p class="mt-2 text-sm text-toned">Een spel duurt een paar rondes. Om de beurt tekent iemand een woord en raden de anderen wat het is. Wie aan het eind de meeste punten heeft, wint.</p>
        </UCard>
        <UCard :ui="{ body: 'h-full' }">
          <h2 class="flex items-center gap-2 font-display text-2xl text-highlighted"><UIcon name="i-lucide-lock" class="size-6 text-[var(--color-brand)]" /> Voor je team</h2>
          <p class="mt-3 text-sm text-toned"><strong>Spelen!</strong> zet je in een open kamer met wie er nu speelt.</p>
          <p class="mt-2 text-sm text-toned">In een <strong>privékamer</strong> kies je zelf het aantal rondes, de tekentijd en eigen woorden, zoals sprint, retro of backlog. Deel de link en start als iedereen er is.</p>
        </UCard>
        <UCard :ui="{ body: 'h-full flex flex-col' }">
          <h2 class="mb-3 flex items-center gap-2 font-display text-2xl text-highlighted"><UIcon name="i-lucide-pencil" class="size-6 text-[var(--color-brand)]" /> Zo speel je</h2>
          <HowToPlay class="flex-1" />
        </UCard>
      </section>
    </main>

    <footer class="px-4 pb-6 text-center text-xs text-muted">
      <a href="https://tools.atlesque.dev/privacy" class="underline hover:text-default">Privacy</a> ·
      <button type="button" data-privacy-settings class="underline hover:text-default">Cookie-instellingen</button>
    </footer>
  </div>
</template>
