<script setup lang="ts">
// Pick an avatar: arrows on either side of it (one row per part: color, eyes, mouth, extra) and a die for a random one.
import { AVATAR_PARTS, randomAvatar } from '#shared/game';
import type { Avatar } from '#shared/protocol';

const avatar = defineModel<Avatar>({ required: true });
const parts = [
  { key: 'color', label: 'kleur' },
  { key: 'eyes', label: 'ogen' },
  { key: 'mouth', label: 'mond' },
  { key: 'extra', label: 'extra' },
] as const;
const step = (key: keyof Avatar, by: number) => {
  const count = AVATAR_PARTS[key];
  avatar.value = { ...avatar.value, [key]: (avatar.value[key] + by + count) % count };
};
</script>

<template>
  <div class="relative flex items-center justify-center gap-2 rounded-lg bg-elevated py-3">
    <div class="flex flex-col">
      <UButton v-for="part in parts" :key="part.key" icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" square :aria-label="`Vorige ${part.label}`" @click="step(part.key, -1)" />
    </div>
    <PlayerAvatar :avatar="avatar" :size="128" />
    <div class="flex flex-col">
      <UButton v-for="part in parts" :key="part.key" icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" square :aria-label="`Volgende ${part.label}`" @click="step(part.key, 1)" />
    </div>
    <UTooltip text="Willekeurige avatar">
      <UButton icon="i-lucide-dice-5" color="neutral" variant="ghost" square class="absolute top-2 right-2" aria-label="Willekeurige avatar" @click="avatar = randomAvatar()" />
    </UTooltip>
  </div>
</template>
