<script setup lang="ts">
// Phones with little room (the keyboard is open): the newest chat lines float over the bottom of the board for a few
// seconds instead, so you still see "bijna!", who guessed it and what the others type. They don't catch taps.
import type { ChatLine } from '#shared/protocol';

const props = defineProps<{ lines: ChatLine[] }>();

const SHOW_MS = 7000;
const seen = new Map<number, number>();
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 500)));
onBeforeUnmount(() => timer && clearInterval(timer));

// lines already there when this mounts are old news; later ones get the time they arrived
let first = true;
watch(
  () => props.lines.at(-1)?.id,
  () => {
    const at = first ? 0 : Date.now();
    first = false;
    for (const line of props.lines.slice(-6)) if (!seen.has(line.id)) seen.set(line.id, at);
    now.value = Date.now();
  },
  { immediate: true },
);
const shown = computed(() => props.lines.slice(-3).filter((line) => now.value - (seen.get(line.id) ?? 0) < SHOW_MS));

const tone: Record<ChatLine['kind'], string> = {
  msg: 'bg-[#172b45]/80',
  info: 'bg-[#172b45]/80',
  admin: 'bg-[#172b45]/90',
  correct: 'bg-[#1f9d55]/90',
  good: 'bg-[#1f9d55]/90',
  close: 'bg-[#c27c0e]/90',
  warn: 'bg-[#c0392b]/90',
  bad: 'bg-[#c0392b]/90',
};
</script>

<template>
  <TransitionGroup
    tag="ul"
    class="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-start gap-1"
    aria-hidden="true"
    enter-active-class="transition duration-200"
    enter-from-class="translate-y-1 opacity-0"
    leave-active-class="transition duration-300"
    leave-to-class="opacity-0"
  >
    <li v-for="line in shown" :key="line.id" class="max-w-full truncate rounded-md px-2 py-0.5 text-xs font-medium text-white shadow-sm" :class="line.inner ? 'bg-[#1f9d55]/80' : tone[line.kind]">
      <template v-if="line.kind === 'msg'"><span class="font-bold">{{ line.name }}:</span> {{ line.text }}</template>
      <template v-else>{{ line.text }}</template>
    </li>
  </TransitionGroup>
</template>
