<script setup lang="ts">
// A room link (/r/<code>). Coming from "Spelen" or with a seat in this tab, you're straight in; from an invite link
// you first pick a name and avatar.
import { LIMITS } from '#shared/protocol';

const route = useRoute();
const code = computed(() => String(route.params.code).toLowerCase());
const { profile } = useProfile();
const autojoin = useState<string | null>('autojoin', () => null);
const joined = ref(autojoin.value === code.value || hasSeat(code.value));
autojoin.value = null;

interface RoomInfo {
  exists: boolean;
  players?: number;
  maxPlayers?: number;
  isPublic?: boolean;
}
const info = ref<RoomInfo | null>(null);
onMounted(async () => {
  if (joined.value) return;
  try {
    info.value = await $fetch<RoomInfo>(`/api/rooms/${code.value}` as string);
  } catch {
    info.value = { exists: false };
  }
});
const full = computed(() => !!info.value?.exists && info.value.players! >= info.value.maxPlayers!);
function join() {
  if (profile.value.name.trim()) joined.value = true;
}
</script>

<template>
  <GameRoom v-if="joined" :code="code" />
  <div v-else class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
    <div class="text-center"><AppLogo size="lg" /></div>
    <UCard v-if="info && !info.exists" :ui="{ body: 'text-center' }">
      <p class="font-display text-2xl text-highlighted">Deze kamer bestaat niet (meer)</p>
      <p class="mt-2 text-sm text-muted">Vraag een nieuwe link of start zelf een kamer.</p>
      <UButton to="/" label="Naar het begin" class="mt-4" />
    </UCard>
    <UCard v-else :ui="{ body: 'flex flex-col gap-5' }">
      <div>
        <h1 class="font-display text-2xl text-highlighted">Je bent uitgenodigd</h1>
        <p class="text-sm text-muted">
          Kamer <span class="font-mono">{{ code }}</span>
          <template v-if="info?.exists"> · {{ info.players }} van {{ info.maxPlayers }} spelers</template>
        </p>
      </div>
      <UFormField label="Je naam" required>
        <UInput v-model="profile.name" :maxlength="LIMITS.name" placeholder="Hoe heet je?" size="xl" class="w-full" autofocus @keydown.enter="join" />
      </UFormField>
      <AvatarEditor v-model="profile.avatar" />
      <UButton :label="full ? 'Deze kamer is vol' : 'Meedoen'" icon="i-lucide-play" size="xl" block :disabled="!profile.name.trim() || full || !info" @click="join" />
      <AccountPanel />
    </UCard>
  </div>
</template>
