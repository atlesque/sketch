<script setup lang="ts">
// A round countdown to the room's deadline (server clock, lined up with `offset`). Ticks through the last seconds.
const props = defineProps<{ deadline: number | null; total: number; offset: number; ticking?: boolean }>();
const emit = defineEmits<{ tick: [number] }>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 200)));
onBeforeUnmount(() => timer && clearInterval(timer));

const left = computed(() => (props.deadline ? Math.max(0, Math.ceil((props.deadline - (now.value + props.offset)) / 1000)) : null));
const share = computed(() => (left.value === null || !props.total ? 1 : Math.min(1, left.value / props.total)));
const urgent = computed(() => left.value !== null && left.value <= 10 && props.ticking);
watch(left, (value) => {
  if (value !== null && props.ticking && value <= 5 && value > 0) emit('tick', value);
});
const R = 20;
const C = 2 * Math.PI * R;
</script>

<template>
  <div class="relative grid size-14 shrink-0 place-items-center" role="timer" :aria-label="left === null ? 'Geen tijdslimiet' : `${left} seconden`">
    <svg viewBox="0 0 48 48" class="absolute inset-0 -rotate-90">
      <circle cx="24" cy="24" :r="R" fill="none" stroke="var(--ui-border)" stroke-width="5" />
      <circle
        cx="24"
        cy="24"
        :r="R"
        fill="none"
        :stroke="urgent ? 'var(--ui-error)' : 'var(--color-brand)'"
        stroke-width="5"
        stroke-linecap="round"
        :stroke-dasharray="C"
        :stroke-dashoffset="C * (1 - share)"
        class="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
    <span class="relative text-base font-bold tabular-nums" :class="urgent ? 'text-error' : 'text-highlighted'">{{ left ?? '∞' }}</span>
  </div>
</template>
