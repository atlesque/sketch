<script setup lang="ts">
// "Zo speel je": one step at a time with dots, moving on by itself unless you're pointing at it or picked a step.
const steps = [
  { icon: 'i-lucide-pencil', title: 'Jij tekent', text: 'Ben je aan de beurt, kies dan een woord en teken het. Letters of cijfers tekenen is valsspelen.' },
  { icon: 'i-lucide-message-circle', title: 'De rest raadt', text: 'Typ je gok in de chat. Hoe sneller je het woord raadt, hoe meer punten je krijgt.' },
  { icon: 'i-lucide-sparkles', title: 'Bijna goed?', text: 'Zit je er één letter naast, dan zie alleen jij dat. Een juiste gok ziet niemand anders.' },
  { icon: 'i-lucide-thumbs-up', title: 'De tekenaar scoort ook', text: 'Voor iedereen die het woord raadt, krijgt de tekenaar punten. Duidelijk tekenen loont dus.' },
  { icon: 'i-lucide-trophy', title: 'Het podium', text: 'Na de laatste ronde staan de drie beste spelers op het podium.' },
];
const index = ref(0);
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => (timer = setInterval(() => !paused.value && (index.value = (index.value + 1) % steps.length), 6000)));
onBeforeUnmount(() => timer && clearInterval(timer));
function pick(i: number) {
  index.value = i;
  if (timer) clearInterval(timer);
  timer = null;
}
const step = computed(() => steps[index.value]!);
</script>

<template>
  <div class="flex h-full flex-col items-center gap-3 text-center" @pointerenter="paused = true" @pointerleave="paused = false" @focusin="paused = true" @focusout="paused = false">
    <div class="grid size-20 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_18%,transparent)]">
      <UIcon :name="step.icon" class="size-10 text-[var(--color-brand)]" />
    </div>
    <div class="min-h-24" aria-live="polite">
      <p class="font-semibold text-highlighted">{{ step.title }}</p>
      <p class="mt-1 text-sm text-toned">{{ step.text }}</p>
    </div>
    <div class="mt-auto flex gap-2" role="tablist" aria-label="Stappen">
      <button
        v-for="(s, i) in steps"
        :key="s.title"
        type="button"
        role="tab"
        :aria-selected="i === index"
        :aria-label="s.title"
        class="size-2.5 rounded-full transition-colors"
        :class="i === index ? 'bg-[var(--color-brand)]' : 'bg-accented hover:bg-[color-mix(in_srgb,var(--color-brand)_50%,transparent)]'"
        @click="pick(i)"
      />
    </div>
  </div>
</template>
