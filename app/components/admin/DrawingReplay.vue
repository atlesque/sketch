<script setup lang="ts">
// Replays a finished turn's drawing from its ops (saved in R2 at the end of the turn), stroke by stroke.
import type { Op } from '#shared/protocol';

const props = defineProps<{ ops: Op[] }>();
const canvas = ref<HTMLCanvasElement>();
const shown = ref(0);
const playing = ref(false);
const speed = ref(4);
let board: Board | null = null;
let frame = 0;

onMounted(() => {
  board = new Board(canvas.value!);
  board.reset(props.ops);
  shown.value = props.ops.length;
});
onBeforeUnmount(() => cancelAnimationFrame(frame));

function play() {
  if (!board) return;
  cancelAnimationFrame(frame);
  board.reset([]);
  shown.value = 0;
  playing.value = true;
  const step = () => {
    const next = Math.min(props.ops.length, shown.value + speed.value * 3);
    board!.apply(props.ops.slice(shown.value, next));
    shown.value = next;
    if (next < props.ops.length) frame = requestAnimationFrame(step);
    else playing.value = false;
  };
  frame = requestAnimationFrame(step);
}

function download() {
  const link = document.createElement('a');
  link.href = canvas.value!.toDataURL('image/png');
  link.download = 'drawing.png';
  link.click();
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="paper aspect-[4/3] w-full overflow-hidden rounded-md border border-default"><canvas ref="canvas" /></div>
    <div class="flex items-center gap-2">
      <UButton :label="playing ? 'Playing…' : 'Replay'" icon="i-lucide-play" size="sm" :disabled="playing || !ops.length" @click="play" />
      <USelect v-model="speed" :items="[{ label: '1×', value: 1 }, { label: '4×', value: 4 }, { label: '16×', value: 16 }]" size="sm" class="w-20" />
      <span class="text-xs text-muted tabular-nums">{{ shown }} / {{ ops.length }} ops</span>
      <UButton label="PNG" icon="i-lucide-external-link" size="sm" color="neutral" variant="ghost" class="ms-auto" @click="download" />
    </div>
  </div>
</template>
