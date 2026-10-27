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
  <div v-else class="flex min-h-dvh flex-col items-center bg-muted px-4 py-10">
    <NuxtLink to="/" aria-label="Sketch, naar het begin"><AppLogo size="lg" /></NuxtLink>

    <UCard v-if="info && !info.exists" class="mt-8 w-full max-w-md" :ui="{ body: 'text-center' }">
      <p class="font-display text-2xl text-highlighted">Deze kamer bestaat niet (meer)</p>
      <p class="mt-2 text-sm text-muted">Vraag een nieuwe link of start zelf een kamer.</p>
      <UButton to="/" label="Naar het begin" class="mt-4" />
    </UCard>

    <UCard v-else class="mt-8 w-full max-w-md" :ui="{ body: 'flex flex-col gap-4' }">
      <p class="text-center text-toned">
        Je bent uitgenodigd in kamer <span class="font-mono font-semibold text-highlighted">{{ code }}</span>
        <template v-if="info?.exists"><br><span class="text-sm text-muted">{{ info.players }} van {{ info.maxPlayers }} spelers</span></template>
      </p>
      <UInput v-model="profile.name" :maxlength="LIMITS.name" placeholder="Je naam" size="xl" class="w-full" aria-label="Je naam" autofocus @keydown.enter="join" />
      <AvatarEditor v-model="profile.avatar" />
      <UButton :label="full ? 'Deze kamer is vol' : 'Meedoen!'" size="xl" block class="py-3 text-xl font-bold" :disabled="!profile.name.trim() || full || !info" @click="join" />
      <AccountLine />
    </UCard>
  </div>
</template>
