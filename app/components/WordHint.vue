<script setup lang="ts">
// The word bar: the drawer sees the word, guessers its letters as blanks (with hints filling in), and the letter count.
import type { RoomView } from '#shared/protocol';

const props = defineProps<{ room: RoomView; me: string }>();

const drawer = computed(() => props.room.players.find((p) => p.id === props.room.drawerId));
const guessed = computed(() => !!props.room.players.find((p) => p.id === props.me)?.guessed);
/** Letter counts per word part, e.g. "4 4" for "rode kool". */
const counts = computed(() => {
  const hint = props.room.hint;
  if (!hint) return '';
  return hint
    .map((ch) => (ch === ' ' ? ' ' : 'x'))
    .join('')
    .split(' ')
    .map((part) => part.replace(/[^x]/g, '').length || '')
    .join(' ');
});
/** Long words get smaller blanks on phones, so they still fit on one line in the top bar. */
const long = computed(() => (props.room.hint?.length ?? 0) > 11);
</script>

<template>
  <div class="flex min-h-12 flex-col items-center justify-center text-center">
    <template v-if="room.phase === 'drawing'">
      <p class="text-xs font-semibold tracking-wide text-muted uppercase">
        {{ room.drawerId === me ? 'Teken dit' : guessed ? 'Geraden!' : room.hint ? 'Raad het woord' : 'Raad het woord (verborgen)' }}
      </p>
      <p v-if="room.word && (room.drawerId === me || guessed)" class="font-display text-2xl tracking-wide text-highlighted">{{ room.word }}</p>
      <p v-else-if="room.hint" class="flex flex-wrap items-end justify-center font-mono font-bold text-highlighted sm:gap-x-1.5 sm:text-2xl" :class="long ? 'gap-x-0.5 text-base' : 'gap-x-1 text-xl'" :aria-label="`${room.hint.length} tekens`">
        <span v-for="(ch, index) in room.hint" :key="index" :class="ch === ' ' ? 'w-2 sm:w-3' : [long ? 'w-2.5' : 'w-3.5', 'border-b-[3px] border-current leading-6 sm:w-5 sm:leading-7']">{{ ch === ' ' ? '' : ch ?? '' }}</span>
        <span class="ms-1 font-sans text-xs leading-5 font-medium text-muted">{{ counts }}</span>
      </p>
      <p v-else class="font-display text-2xl text-highlighted">? ? ?</p>
    </template>
    <p v-else-if="room.phase === 'choosing'" class="text-sm font-semibold text-muted">
      {{ room.drawerId === me ? 'Kies een woord om te tekenen' : `${drawer?.name ?? 'Iemand'} kiest een woord…` }}
    </p>
    <p v-else-if="room.phase === 'reveal'" class="text-sm font-semibold text-muted">Het woord was <span class="font-display text-xl text-highlighted">{{ room.reveal?.word || '—' }}</span></p>
    <p v-else-if="room.phase === 'results'" class="font-display text-xl text-highlighted">Einde van het spel</p>
    <p v-else class="text-sm font-semibold text-muted">{{ room.isPublic ? 'Wachten op spelers' : room.hostId === me ? 'Stel de kamer in en start het spel' : 'Wachten tot de host start' }}</p>
  </div>
</template>
