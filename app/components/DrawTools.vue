<script setup lang="ts">
// The drawer's toolbar: colors, brush sizes, brush / eraser / fill, undo and clear. Keys: B, E, F, Ctrl/Cmd+Z.
import { PALETTE, SIZES } from '#shared/protocol';
import type { Tool } from './GameBoard.vue';

const tool = defineModel<Tool>('tool', { required: true });
const color = defineModel<number>('color', { required: true });
const size = defineModel<number>('size', { required: true });
const emit = defineEmits<{ undo: []; clear: [] }>();

const tools: { value: Tool; label: string; icon: string; key: string }[] = [
  { value: 'brush', label: 'Penseel (B)', icon: 'i-lucide-pencil', key: 'b' },
  { value: 'eraser', label: 'Gom (E)', icon: 'i-lucide-eraser', key: 'e' },
  { value: 'fill', label: 'Emmer (F)', icon: 'i-lucide-paint-bucket', key: 'f' },
];

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    emit('undo');
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const match = tools.find((t) => t.key === event.key.toLowerCase());
  if (match) tool.value = match.value;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 rounded-lg border border-default bg-default p-2">
    <div class="grid grid-flow-col grid-rows-2 gap-0.5" role="radiogroup" aria-label="Kleur">
      <button
        v-for="(hex, index) in PALETTE"
        :key="hex"
        type="button"
        role="radio"
        :aria-checked="color === index"
        :aria-label="`Kleur ${index + 1}`"
        class="size-6 rounded-sm border border-black/15 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary"
        :class="color === index ? 'ring-2 ring-primary ring-offset-1 ring-offset-(--ui-bg)' : ''"
        :style="{ background: hex }"
        @click="color = index; if (tool === 'eraser') tool = 'brush'"
      />
    </div>

    <div class="flex items-center gap-1" role="radiogroup" aria-label="Dikte">
      <button
        v-for="(width, index) in SIZES"
        :key="width"
        type="button"
        role="radio"
        :aria-checked="size === index"
        :aria-label="`Dikte ${index + 1}`"
        class="grid size-9 place-items-center rounded-md border border-default hover:bg-elevated"
        :class="size === index ? 'bg-elevated ring-2 ring-primary' : ''"
        @click="size = index"
      >
        <span class="rounded-full bg-highlighted" :style="{ width: `${Math.min(26, 3 + width * 0.55)}px`, height: `${Math.min(26, 3 + width * 0.55)}px`, background: tool === 'eraser' ? undefined : PALETTE[color] === '#ffffff' ? '#cfd1d6' : PALETTE[color] }" />
      </button>
    </div>

    <div class="flex items-center gap-1">
      <UTooltip v-for="t in tools" :key="t.value" :text="t.label">
        <UButton :icon="t.icon" :color="tool === t.value ? 'primary' : 'neutral'" :variant="tool === t.value ? 'solid' : 'outline'" square :aria-label="t.label" :aria-pressed="tool === t.value" @click="tool = t.value" />
      </UTooltip>
    </div>

    <div class="ms-auto flex items-center gap-1">
      <UTooltip text="Ongedaan maken (Ctrl+Z)">
        <UButton icon="i-lucide-undo-2" color="neutral" variant="outline" square aria-label="Ongedaan maken" @click="emit('undo')" />
      </UTooltip>
      <UTooltip text="Alles wissen">
        <UButton icon="i-lucide-trash-2" color="error" variant="outline" square aria-label="Alles wissen" @click="emit('clear')" />
      </UTooltip>
    </div>
  </div>
</template>
