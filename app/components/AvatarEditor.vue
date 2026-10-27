<script setup lang="ts">
// Pick an avatar: a big preview, a row of arrows per part, and a die for a random one.
import { AVATAR_PARTS, randomAvatar } from '#shared/game';
import type { Avatar } from '#shared/protocol';

const avatar = defineModel<Avatar>({ required: true });
const parts = [
  { key: 'color', label: 'Kleur' },
  { key: 'eyes', label: 'Ogen' },
  { key: 'mouth', label: 'Mond' },
  { key: 'extra', label: 'Extra' },
] as const;
const step = (key: keyof Avatar, by: number) => {
  const count = AVATAR_PARTS[key];
  avatar.value = { ...avatar.value, [key]: (avatar.value[key] + by + count) % count };
};
</script>

<template>
  <div class="flex items-center justify-center gap-6">
    <div class="relative grid place-items-center">
      <PlayerAvatar :avatar="avatar" :size="120" />
      <UTooltip text="Willekeurig">
        <UButton icon="i-lucide-dice-5" color="neutral" variant="outline" size="xs" square class="absolute -right-1 bottom-0 rounded-full bg-default" aria-label="Willekeurige avatar" @click="avatar = randomAvatar()" />
      </UTooltip>
    </div>
    <div class="flex flex-col gap-0.5">
      <div v-for="part in parts" :key="part.key" class="flex items-center gap-1">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" square :aria-label="`Vorige ${part.label.toLowerCase()}`" @click="step(part.key, -1)" />
        <span class="w-12 text-center text-xs text-muted">{{ part.label }}</span>
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" square :aria-label="`Volgende ${part.label.toLowerCase()}`" @click="step(part.key, 1)" />
      </div>
    </div>
  </div>
</template>
