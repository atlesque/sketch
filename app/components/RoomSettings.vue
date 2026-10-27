<script setup lang="ts">
// A private room's settings, shown in the lobby. The host edits them (each change goes to the room straight away);
// everyone else sees them read-only.
import { parseWords } from '#shared/game';
import { LIMITS, type Settings } from '#shared/protocol';

const props = defineProps<{ settings: Settings; editable: boolean; players: number }>();
const emit = defineEmits<{ change: [Partial<Settings>] }>();

const words = ref(props.settings.customWords.join(', '));
watch(
  () => props.settings.customWords,
  (list) => {
    if (parseWords(words.value).join('|') !== list.join('|')) words.value = list.join(', ');
  },
);
const parsed = computed(() => parseWords(words.value));
let timer: ReturnType<typeof setTimeout> | null = null;
watch(words, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => emit('change', { customWords: parsed.value }), 600);
});

const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const fields = computed(() => [
  { key: 'maxPlayers' as const, label: 'Spelers', options: range(Math.max(2, props.players), LIMITS.maxPlayers[1]) },
  { key: 'rounds' as const, label: 'Rondes', options: range(...LIMITS.rounds) },
  { key: 'drawTime' as const, label: 'Tekentijd', options: [30, 45, 60, 80, 100, 120, 150, 180, 240], suffix: 's' },
  { key: 'wordChoices' as const, label: 'Woorden om uit te kiezen', options: range(...LIMITS.wordChoices) },
  { key: 'hints' as const, label: 'Hints (letters)', options: range(...LIMITS.hints) },
]);
const modes = [
  { label: 'Normaal: letters en hints', value: 'normal' },
  { label: 'Verborgen: geen letters, geen hints', value: 'hidden' },
];
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UFormField v-for="field in fields" :key="field.key" :label="field.label">
      <USelect
        :model-value="settings[field.key]"
        :items="field.options.map((value) => ({ label: `${value}${field.suffix ?? ''}`, value }))"
        :disabled="!editable"
        class="w-full"
        @update:model-value="(value) => emit('change', { [field.key]: Number(value) })"
      />
    </UFormField>
    <UFormField label="Woordmodus">
      <USelect :model-value="settings.wordMode" :items="modes" :disabled="!editable" class="w-full" @update:model-value="(value) => emit('change', { wordMode: value as Settings['wordMode'] })" />
    </UFormField>
    <UFormField
      label="Eigen woorden"
      class="sm:col-span-2"
      :hint="`${parsed.length} woorden`"
      :help="`Gescheiden door komma's of een nieuwe regel. Vanaf ${LIMITS.customOnlyMin} woorden kun je alleen deze gebruiken; anders komen ze tussen de ingebouwde woorden.`"
    >
      <UTextarea v-model="words" :rows="3" :disabled="!editable" placeholder="sprint, retro, backlog, stand-up, …" class="w-full" autoresize :maxrows="8" />
    </UFormField>
    <UCheckbox
      class="sm:col-span-2"
      :model-value="settings.customOnly"
      :disabled="!editable || parsed.length < LIMITS.customOnlyMin"
      label="Alleen eigen woorden gebruiken"
      @update:model-value="(value) => emit('change', { customOnly: !!value, customWords: parsed })"
    />
  </div>
</template>
