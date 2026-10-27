<script setup lang="ts">
// The "Sketch" word mark: the display serif with a coral marker scribble under it.
withDefaults(defineProps<{ size?: 'sm' | 'lg'; admin?: boolean }>(), { size: 'sm' });
</script>

<template>
  <span class="inline-flex items-center gap-2 text-highlighted">
    <img src="/favicon.svg" :width="size === 'lg' ? 56 : 28" :height="size === 'lg' ? 56 : 28" alt="" class="shrink-0">
    <span class="relative font-display leading-none" :class="size === 'lg' ? 'text-6xl' : 'text-2xl'">
      Sketch
      <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true" class="absolute -bottom-1.5 left-0 h-2 w-full text-[var(--color-brand)]">
        <path d="M2 8 C 30 2, 60 11, 118 4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
      </svg>
    </span>
    <UBadge v-if="admin" label="Admin" color="neutral" variant="subtle" size="sm" />
  </span>
</template>
