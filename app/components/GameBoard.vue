<script setup lang="ts">
// The drawing board. Everyone sees the ops painted here; the drawer also draws on it. The drawer's ops are painted
// at once and sent in small batches (every 50 ms), so the others see the line appear as it is drawn.
import { BOARD_H, BOARD_W, PALETTE, SIZES, type Op } from '#shared/protocol';
import { Board } from '~/utils/paint';

export type Tool = 'brush' | 'eraser' | 'fill';

const props = defineProps<{ drawing: boolean; tool: Tool; color: number; size: number }>();
const emit = defineEmits<{ ready: [Board]; ops: [Op[]] }>();

const canvas = ref<HTMLCanvasElement>();
const wrap = ref<HTMLDivElement>();
let board: Board | null = null;
let outbox: Op[] = [];
let flusher: ReturnType<typeof setInterval> | null = null;
let last: { x: number; y: number } | null = null;
const cursor = ref<{ x: number; y: number } | null>(null);
const scale = ref(1);

onMounted(() => {
  board = new Board(canvas.value!);
  emit('ready', board);
  flusher = setInterval(flush, 50);
  const observer = new ResizeObserver(() => (scale.value = (wrap.value?.clientWidth ?? BOARD_W) / BOARD_W));
  observer.observe(wrap.value!);
  onBeforeUnmount(() => observer.disconnect());
});
onBeforeUnmount(() => {
  if (flusher) clearInterval(flusher);
});

function flush() {
  if (!outbox.length) return;
  emit('ops', outbox);
  outbox = [];
}

function point(event: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * BOARD_W),
    y: Math.round(((event.clientY - rect.top) / rect.height) * BOARD_H),
  };
}

function push(op: Op) {
  board!.apply([op]);
  outbox.push(op);
  if (outbox.length > 400) flush();
}

function down(event: PointerEvent) {
  if (!props.drawing || event.button > 0) return;
  event.preventDefault();
  const p = point(event);
  if (props.tool === 'fill') {
    push(['f', props.color, p.x, p.y]);
    flush();
    return;
  }
  canvas.value!.setPointerCapture(event.pointerId);
  last = p;
  push(['b', props.tool === 'eraser' ? 0 : props.color, props.size, p.x, p.y]);
}

function move(event: PointerEvent) {
  if (props.drawing) {
    const rect = wrap.value!.getBoundingClientRect();
    cursor.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  if (!last) return;
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
  for (const e of events.length ? events : [event]) {
    const p = point(e);
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 2) continue;
    last = p;
    push(['l', p.x, p.y]);
  }
}

function up() {
  if (!last) return;
  last = null;
  flush();
}

const cursorSize = computed(() => Math.max(6, (SIZES[props.size] ?? 7) * scale.value));
const cursorColor = computed(() => (props.tool === 'eraser' ? '#9aa3ad' : PALETTE[props.color]));
</script>

<template>
  <div ref="wrap" class="paper relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-default shadow-sm" :class="drawing ? (tool === 'fill' ? 'cursor-cell' : 'cursor-none') : ''" @pointerleave="cursor = null">
    <canvas ref="canvas" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @contextmenu.prevent />
    <div
      v-if="drawing && cursor && tool !== 'fill'"
      class="pointer-events-none absolute rounded-full border border-neutral-500/70"
      :style="{ left: `${cursor.x}px`, top: `${cursor.y}px`, width: `${cursorSize}px`, height: `${cursorSize}px`, transform: 'translate(-50%, -50%)', background: cursorColor, opacity: 0.6 }"
    />
    <slot />
  </div>
</template>
