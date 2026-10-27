<script setup lang="ts">
// Home: name and avatar, then quick play (a public room), a private room for the team, or a code to join.
import { LIMITS } from '#shared/protocol';

const { profile } = useProfile();
const toast = useToast();
const busy = ref<'play' | 'private' | null>(null);
const joinCode = ref('');
const autojoin = useState<string | null>('autojoin', () => null);

const nameOk = computed(() => profile.value.name.trim().length > 0);

async function start(kind: 'play' | 'private') {
  if (!nameOk.value) {
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

function join() {
  const match = joinCode.value.trim().toLowerCase().match(/([a-z0-9]{6})\/?$/);
  if (!match) {
    toast.add({ title: 'Dat is geen kamercode', description: 'Een code heeft 6 tekens, of plak de uitnodigingslink.', color: 'warning' });
    return;
  }
  navigateTo(`/r/${match[1]}`);
}

const steps = [
  { icon: 'i-lucide-pencil', title: 'Teken', text: 'Om de beurt kies je een woord uit een paar opties en teken je het. Letters en cijfers tekenen is valsspelen!' },
  { icon: 'i-lucide-message-square-warning', title: 'Raad', text: 'De anderen typen hun gok in de chat. Hoe sneller je het woord raadt, hoe meer punten.' },
  { icon: 'i-lucide-trophy', title: 'Win', text: 'De tekenaar scoort voor iedereen die het raadt. Na de laatste ronde staat de winnaar op het podium.' },
];
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-4">
    <header class="flex items-center justify-between">
      <AppLogo />
      <ThemeSwitch />
    </header>

    <main class="flex flex-1 flex-col items-center gap-8 py-8">
      <div class="text-center">
        <AppLogo size="lg" />
        <p class="mt-4 text-lg text-toned">Tekenen en raden met je team.</p>
      </div>

      <div class="grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <UCard :ui="{ body: 'flex flex-col gap-5' }">
          <UFormField label="Je naam" required>
            <UInput v-model="profile.name" :maxlength="LIMITS.name" placeholder="Hoe heet je?" size="xl" class="w-full" autofocus @keydown.enter="start('play')" />
          </UFormField>
          <AvatarEditor v-model="profile.avatar" />
          <div class="grid gap-2 sm:grid-cols-2">
            <UButton label="Spelen" icon="i-lucide-play" size="xl" block :loading="busy === 'play'" :disabled="!!busy" @click="start('play')" />
            <UButton label="Privékamer maken" icon="i-lucide-lock" size="xl" color="secondary" variant="outline" block :loading="busy === 'private'" :disabled="!!busy" @click="start('private')" />
          </div>
          <form class="flex gap-2" @submit.prevent="join">
            <UInput v-model="joinCode" placeholder="Kamercode of uitnodigingslink" class="flex-1" aria-label="Kamercode" />
            <UButton type="submit" label="Meedoen" color="neutral" variant="outline" />
          </form>
        </UCard>

        <div class="flex flex-col gap-4">
          <AccountPanel />
          <UCard>
            <p class="text-sm text-toned"><strong>Spelen</strong> zet je in een open kamer met wie er nu speelt. Met een <strong>privékamer</strong> kies je zelf de rondes, de tijd en eigen woorden, en deel je de link met je team.</p>
          </UCard>
        </div>
      </div>

      <section class="grid w-full gap-4 sm:grid-cols-3" aria-label="Zo speel je">
        <UCard v-for="(step, index) in steps" :key="step.title">
          <div class="flex items-center gap-2">
            <span class="grid size-8 place-items-center rounded-full bg-[var(--color-brand)] text-sm font-bold text-white">{{ index + 1 }}</span>
            <UIcon :name="step.icon" class="size-5 text-muted" />
            <h2 class="font-display text-xl text-highlighted">{{ step.title }}</h2>
          </div>
          <p class="mt-2 text-sm text-toned">{{ step.text }}</p>
        </UCard>
      </section>
    </main>

    <footer class="border-t border-default pt-4 text-xs text-muted">
      Een intern spel van Atlesque. Voor moderatie bewaren we namen, chat, tekeningen en IP-adressen 180 dagen.
      <a href="https://tools.atlesque.dev/privacy" class="underline hover:text-default">Privacy</a> ·
      <button type="button" data-privacy-settings class="underline hover:text-default">Cookie-instellingen</button>
    </footer>
  </div>
</template>
