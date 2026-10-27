<script setup lang="ts">
// Guesses and chat. Correct guesses never show (only "X heeft het woord geraden!"); messages from the drawer and from
// players who guessed show in green and only reach the others who know the word.
import { LIMITS, type ChatLine, type RoomView } from '#shared/protocol';

const props = defineProps<{ lines: ChatLine[]; room: RoomView | null; me: string; disabled?: boolean; spectator?: boolean }>();
const emit = defineEmits<{ send: [string] }>();

const text = ref('');
const list = ref<HTMLElement>();
const input = ref<{ inputRef?: HTMLInputElement }>();

const knows = computed(() => {
  const room = props.room;
  if (!room || room.phase !== 'drawing') return false;
  return room.drawerId === props.me || !!room.players.find((p) => p.id === props.me)?.guessed;
});
const placeholder = computed(() => {
  if (props.room?.phase === 'drawing') return knows.value ? 'Chat met wie het al weet…' : 'Typ je gok hier…';
  return 'Typ een bericht…';
});

const style: Record<ChatLine['kind'], string> = {
  msg: 'text-default',
  info: 'text-info font-medium',
  correct: 'text-success font-semibold',
  close: 'text-warning font-medium',
  warn: 'text-error font-medium',
  good: 'text-success',
  bad: 'text-error',
  admin: 'text-secondary font-semibold',
};

function submit() {
  const value = text.value.trim();
  if (!value) return;
  emit('send', value);
  text.value = '';
}

watch(
  () => props.lines.length,
  async () => {
    const el = list.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    await nextTick();
    if (atBottom) el.scrollTop = el.scrollHeight;
  },
);
onMounted(() => list.value && (list.value.scrollTop = list.value.scrollHeight));

defineExpose({ focus: () => input.value?.inputRef?.focus() });
</script>

<template>
  <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-default bg-default">
    <ul ref="list" class="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 text-sm" aria-live="polite" aria-label="Chat">
      <li
        v-for="line in lines"
        :key="line.id"
        class="rounded px-1.5 py-0.5 break-words"
        :class="[style[line.kind], line.inner ? 'bg-success/10 text-success' : '', line.hidden ? 'bg-warning/10 italic' : '', line.id % 2 ? '' : 'bg-muted/60']"
      >
        <template v-if="line.kind === 'msg'">
          <span class="font-semibold">{{ line.name }}:</span> {{ line.text }}
          <UBadge v-if="spectator && line.hidden" label="verborgen" color="warning" variant="subtle" size="sm" class="ms-1" />
          <UBadge v-if="spectator && line.inner" label="alleen wie het weet" color="success" variant="subtle" size="sm" class="ms-1" />
        </template>
        <template v-else>{{ line.text }}</template>
      </li>
    </ul>
    <form v-if="!spectator" class="border-t border-default p-2" @submit.prevent="submit">
      <UInput ref="input" v-model="text" :placeholder="placeholder" :maxlength="LIMITS.chat" :disabled="disabled" autocomplete="off" class="w-full" :ui="{ base: knows ? 'ring-success/60' : '' }" aria-label="Bericht of gok">
        <template v-if="text.length > LIMITS.chat - 20" #trailing>
          <span class="text-xs text-dimmed tabular-nums">{{ text.length }}/{{ LIMITS.chat }}</span>
        </template>
      </UInput>
    </form>
  </div>
</template>
