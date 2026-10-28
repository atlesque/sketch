<script setup lang="ts">
// The drawer's toolbar: colors, brush sizes, brush / eraser / fill, undo and clear. The keys are set in the settings
// dialog (useHotkeys); Ctrl/Cmd+Z always undoes. `compact` (phones) is one row: the color and the size each open a
// small panel, so the board keeps the room.
import { PALETTE, SIZES } from '#shared/protocol';
import type { Tool } from './GameBoard.vue';

const tool = defineModel<Tool>('tool', { required: true });
const color = defineModel<number>('color', { required: true });
const size = defineModel<number>('size', { required: true });
const emit = defineEmits<{ undo: []; clear: [] }>();
defineProps<{ compact?: boolean }>();
const { keys, match } = useHotkeys();

const colorsOpen = ref(false);
const sizesOpen = ref(false);
function pickColor(index: number) {
  color.value = index;
  if (tool.value === 'eraser') tool.value = 'brush';
  colorsOpen.value = false;
}
function pickSize(index: number) {
  size.value = index;
  sizesOpen.value = false;
}
/** The dot that shows a brush size, in the current color (grey for the eraser or white). */
function dot(width: number) {
  const d = `${Math.min(26, 3 + width * 0.55)}px`;
  return { width: d, height: d, background: tool.value === 'eraser' || PALETTE[color.value] === '#ffffff' ? '#9aa3ad' : PALETTE[color.value] };
}

const tools = computed<{ value: Tool; label: string; icon: string }[]>(() => [
  { value: 'brush', label: `Penseel (${keys.value.brush.toUpperCase()})`, icon: 'i-lucide-pencil' },
  { value: 'eraser', label: `Gum (${keys.value.eraser.toUpperCase()})`, icon: 'i-lucide-eraser' },
  { value: 'fill', label: `Emmer (${keys.value.fill.toUpperCase()})`, icon: 'i-lucide-paint-bucket' },
]);

function onKey(event: KeyboardEvent) {
  const action = match(event);
  if (!action) return;
  event.preventDefault();
  if (action === 'undo') emit('undo');
  else tool.value = action;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="compact" class="flex items-center gap-1 rounded-lg border border-default bg-default p-1">
    <UPopover v-model:open="colorsOpen" :content="{ side: 'top', align: 'start' }">
      <button type="button" class="size-9 shrink-0 rounded-md border border-black/15" :style="{ background: PALETTE[color] }" aria-label="Kleur kiezen" />
      <template #content>
        <div class="grid grid-cols-8 gap-1 p-2" role="radiogroup" aria-label="Kleur">
          <button
            v-for="(hex, index) in PALETTE"
            :key="hex"
            type="button"
            role="radio"
            :aria-checked="color === index"
            :aria-label="`Kleur ${index + 1}`"
            class="size-8 rounded-sm border border-black/15"
            :class="color === index ? 'ring-2 ring-primary ring-offset-1 ring-offset-(--ui-bg)' : ''"
            :style="{ background: hex }"
            @click="pickColor(index)"
          />
        </div>
      </template>
    </UPopover>
    <UPopover v-model:open="sizesOpen" :content="{ side: 'top', align: 'start' }">
      <button type="button" class="grid size-9 shrink-0 place-items-center rounded-md border border-default bg-white" aria-label="Dikte kiezen">
        <span class="rounded-full" :style="dot(SIZES[size] ?? 7)" />
      </button>
      <template #content>
        <div class="flex gap-1 p-2" role="radiogroup" aria-label="Dikte">
          <button
            v-for="(width, index) in SIZES"
            :key="width"
            type="button"
            role="radio"
            :aria-checked="size === index"
            :aria-label="`Dikte ${index + 1}`"
            class="grid size-10 place-items-center rounded-md border border-default bg-white"
            :class="size === index ? 'ring-2 ring-primary' : ''"
            @click="pickSize(index)"
          >
            <span class="rounded-full" :style="dot(width)" />
          </button>
        </div>
      </template>
    </UPopover>
    <UButton v-for="t in tools" :key="t.value" :icon="t.icon" :color="tool === t.value ? 'primary' : 'neutral'" :variant="tool === t.value ? 'solid' : 'ghost'" square :aria-label="t.label" :aria-pressed="tool === t.value" @click="tool = t.value" />
    <span class="flex-1" />
    <UButton icon="i-lucide-undo-2" color="neutral" variant="ghost" square aria-label="Ongedaan maken" @click="emit('undo')" />
    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" square aria-label="Alles wissen" @click="emit('clear')" />
  </div>

  <div v-else class="flex flex-wrap items-center gap-3 rounded-lg border border-default bg-default p-2">
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
        @click="pickColor(index)"
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
        class="grid size-9 place-items-center rounded-md border border-default bg-white hover:bg-neutral-100"
        :class="size === index ? 'ring-2 ring-primary' : ''"
        @click="size = index"
      >
        <span class="rounded-full" :style="dot(width)" />
      </button>
    </div>

    <div class="flex items-center gap-1">
      <UTooltip v-for="t in tools" :key="t.value" :text="t.label">
        <UButton :icon="t.icon" :color="tool === t.value ? 'primary' : 'neutral'" :variant="tool === t.value ? 'solid' : 'outline'" square :aria-label="t.label" :aria-pressed="tool === t.value" @click="tool = t.value" />
      </UTooltip>
    </div>

    <div class="ms-auto flex items-center gap-1">
      <UTooltip :text="`Ongedaan maken (${keys.undo.toUpperCase()})`">
        <UButton icon="i-lucide-undo-2" color="neutral" variant="outline" square aria-label="Ongedaan maken" @click="emit('undo')" />
      </UTooltip>
      <UTooltip text="Alles wissen">
        <UButton icon="i-lucide-trash-2" color="error" variant="outline" square aria-label="Alles wissen" @click="emit('clear')" />
      </UTooltip>
    </div>
  </div>
</template>
