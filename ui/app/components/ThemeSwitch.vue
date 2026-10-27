<script setup lang="ts">
// One button that cycles Light → Dark → Auto; `lang` picks the wording (the game is Dutch, the admin English).
import type { Theme } from '../composables/useTheme';
const props = withDefaults(defineProps<{ lang?: 'nl' | 'en' }>(), { lang: 'nl' });
const { theme, set } = useTheme();
const options: { value: Theme; nl: string; en: string; icon: string }[] = [
  { value: 'light', nl: 'Licht', en: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', nl: 'Donker', en: 'Dark', icon: 'i-lucide-moon' },
  { value: 'system', nl: 'Automatisch', en: 'Auto', icon: 'i-lucide-monitor' },
];
const index = computed(() => Math.max(0, options.findIndex((option) => option.value === theme.value)));
const current = computed(() => options[index.value]!);
const label = computed(() => `${props.lang === 'nl' ? 'Thema' : 'Theme'}: ${current.value[props.lang]}`);
</script>

<template>
  <UTooltip :text="label">
    <UButton :icon="current.icon" color="neutral" variant="ghost" square :aria-label="label" @click="set(options[(index + 1) % options.length]!.value)" />
  </UTooltip>
</template>
