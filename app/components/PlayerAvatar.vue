<script setup lang="ts">
// Sketch's own doodle creatures: a rounded blob in one of 12 colors with 8 eyes, 8 mouths and 7 extras
// (counts in AVATAR_PARTS, shared/game.ts). Pure SVG, so they scale from the player list to the podium.
import type { Avatar } from '#shared/protocol';

const props = withDefaults(defineProps<{ avatar: Avatar; size?: number; muted?: boolean }>(), { size: 40 });

const COLORS = ['#ff7a59', '#ff9f43', '#ffd23f', '#a8e05f', '#4cc38a', '#2ec4b6', '#5ec8f2', '#5b8def', '#9b7bf7', '#f78fb3', '#b07d5b', '#9aa3ad'];
const shade = (hex: string, amount: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};
const fill = computed(() => COLORS[props.avatar.color % COLORS.length]!);
const edge = computed(() => shade(fill.value, 0.28));
const ink = '#1d1d1f';
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 100 100" aria-hidden="true" class="shrink-0" :class="muted ? 'opacity-45 grayscale' : ''">
    <!-- extras behind the head -->
    <g v-if="avatar.extra === 3" :stroke="ink" stroke-width="5" fill="none" stroke-linecap="round">
      <path d="M17 52 C17 20 83 20 83 52" />
      <rect x="9" y="46" width="14" height="22" rx="6" :fill="edge" />
      <rect x="77" y="46" width="14" height="22" rx="6" :fill="edge" />
    </g>
    <g v-else-if="avatar.extra === 4" :stroke="ink" stroke-width="4" stroke-linecap="round">
      <path d="M50 22 L50 8" />
      <circle cx="50" cy="7" r="5" fill="#ffd23f" />
    </g>
    <g v-else-if="avatar.extra === 5" stroke-linecap="round">
      <path d="M50 24 C50 16 52 12 55 9" :stroke="ink" stroke-width="3.5" fill="none" />
      <path d="M55 10 C64 2 76 6 76 6 C72 16 62 17 55 10 Z" fill="#4cc38a" :stroke="ink" stroke-width="3" />
    </g>

    <!-- the blob -->
    <path d="M50 18 C74 18 88 32 88 56 C88 78 72 90 50 90 C28 90 12 78 12 56 C12 32 26 18 50 18 Z" :fill="fill" :stroke="edge" stroke-width="3" />
    <ellipse cx="34" cy="34" rx="9" ry="5" fill="#ffffff" opacity="0.35" transform="rotate(-25 34 34)" />

    <!-- eyes -->
    <g :fill="ink" :stroke="ink" stroke-linecap="round">
      <template v-if="avatar.eyes === 0">
        <circle cx="38" cy="50" r="5" stroke="none" />
        <circle cx="62" cy="50" r="5" stroke="none" />
      </template>
      <template v-else-if="avatar.eyes === 1">
        <circle cx="37" cy="49" r="10" fill="#fff" stroke-width="2.5" />
        <circle cx="63" cy="49" r="10" fill="#fff" stroke-width="2.5" />
        <circle cx="39" cy="51" r="4.5" stroke="none" />
        <circle cx="65" cy="51" r="4.5" stroke="none" />
      </template>
      <template v-else-if="avatar.eyes === 2">
        <path d="M30 52 Q38 42 46 52" fill="none" stroke-width="4" />
        <path d="M54 52 Q62 42 70 52" fill="none" stroke-width="4" />
      </template>
      <template v-else-if="avatar.eyes === 3">
        <path d="M30 50 L46 50" stroke-width="4" />
        <path d="M54 50 L70 50" stroke-width="4" />
        <path d="M31 44 Q38 41 45 44" fill="none" stroke-width="2.5" opacity="0.6" />
        <path d="M55 44 Q62 41 69 44" fill="none" stroke-width="2.5" opacity="0.6" />
      </template>
      <template v-else-if="avatar.eyes === 4">
        <circle cx="38" cy="50" r="5" stroke="none" />
        <path d="M55 50 Q62 45 69 50" fill="none" stroke-width="4" />
      </template>
      <template v-else-if="avatar.eyes === 5">
        <circle cx="37" cy="50" r="9" fill="#ffffffaa" stroke-width="3.5" />
        <circle cx="63" cy="50" r="9" fill="#ffffffaa" stroke-width="3.5" />
        <path d="M46 49 L54 49" stroke-width="3.5" />
        <circle cx="37" cy="50" r="3.5" stroke="none" />
        <circle cx="63" cy="50" r="3.5" stroke="none" />
      </template>
      <template v-else-if="avatar.eyes === 6">
        <path d="M30 41 L45 46" stroke-width="4" />
        <path d="M70 41 L55 46" stroke-width="4" />
        <circle cx="38" cy="53" r="4.5" stroke="none" />
        <circle cx="62" cy="53" r="4.5" stroke="none" />
      </template>
      <template v-else>
        <path d="M38 41 L40.5 47 L47 47.5 L42 51.5 L43.5 58 L38 54.5 L32.5 58 L34 51.5 L29 47.5 L35.5 47 Z" fill="#fff" stroke-width="2.5" stroke-linejoin="round" />
        <path d="M62 41 L64.5 47 L71 47.5 L66 51.5 L67.5 58 L62 54.5 L56.5 58 L58 51.5 L53 47.5 L59.5 47 Z" fill="#fff" stroke-width="2.5" stroke-linejoin="round" />
      </template>
    </g>

    <!-- mouth -->
    <g :stroke="ink" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-width="4">
      <path v-if="avatar.mouth === 0" d="M38 66 Q50 76 62 66" />
      <path v-else-if="avatar.mouth === 1" d="M36 64 L64 64 Q62 80 50 80 Q38 80 36 64 Z" :fill="ink" />
      <path v-else-if="avatar.mouth === 2" d="M40 70 L60 70" />
      <ellipse v-else-if="avatar.mouth === 3" cx="50" cy="70" rx="5" ry="6" :fill="ink" stroke-width="0" />
      <template v-else-if="avatar.mouth === 4">
        <path d="M38 66 Q50 74 62 66" />
        <path d="M48 70 Q48 80 54 80 Q59 79 57 70" fill="#f78fb3" stroke-width="3" />
      </template>
      <template v-else-if="avatar.mouth === 5">
        <rect x="36" y="63" width="28" height="12" rx="5" fill="#fff" stroke-width="3" />
        <path d="M45 63 L45 75 M55 63 L55 75" stroke-width="2.5" />
      </template>
      <path v-else-if="avatar.mouth === 6" d="M36 70 Q41 65 46 70 Q50 74 54 70 Q59 65 64 70" />
      <path v-else d="M40 70 Q52 72 60 64" />
    </g>

    <!-- extras on top -->
    <g v-if="avatar.extra === 1" :stroke="ink" stroke-width="3" stroke-linejoin="round">
      <path d="M24 30 C26 10 74 10 76 30 Z" fill="#5b8def" />
      <rect x="20" y="27" width="60" height="9" rx="4" fill="#ffd23f" />
      <circle cx="50" cy="10" r="5" fill="#ffd23f" />
    </g>
    <g v-else-if="avatar.extra === 2" :stroke="ink" stroke-width="3" stroke-linejoin="round">
      <path d="M64 22 L52 14 L52 30 Z" fill="#f78fb3" />
      <path d="M64 22 L76 14 L76 30 Z" fill="#f78fb3" />
      <circle cx="64" cy="22" r="4" fill="#ff7a59" />
    </g>
    <g v-else-if="avatar.extra === 6" :stroke="ink" stroke-width="3" stroke-linejoin="round">
      <path d="M36 26 L50 0 L64 26 Z" fill="#9b7bf7" />
      <path d="M41 17 L59 17 M44 10 L56 10" stroke="#ffd23f" stroke-width="3" />
      <circle cx="50" cy="2" r="3.5" fill="#ffd23f" />
    </g>
  </svg>
</template>
