<script setup lang="ts">
// Players in score order, one row each: rank, name and points, avatar (with a pencil on the drawer). Rows of players
// who guessed are green; the host has a crown, signed-in players a badge.
// Clicking someone else opens what you can do to them: vote to kick, report, and for the host kick or hand over.
import type { DropdownMenuItem } from '@nuxt/ui';
import { rank } from '#shared/game';
import type { PlayerView, RoomView } from '#shared/protocol';

const props = defineProps<{ room: RoomView; me: string }>();
const emit = defineEmits<{ votekick: [PlayerView]; report: [PlayerView]; kick: [PlayerView]; host: [PlayerView] }>();

const ranked = computed(() => rank(props.room.players));
const amHost = computed(() => !props.room.isPublic && props.room.hostId === props.me);

function actions(p: PlayerView): DropdownMenuItem[][] {
  if (p.id === props.me) return [];
  const votes = props.room.kickVotes[p.id] ?? 0;
  const groups: DropdownMenuItem[][] = [
    [
      { label: `Stem om te kicken (${votes}/${props.room.kickNeeded})`, icon: 'i-lucide-vote', onSelect: () => emit('votekick', p) },
      { label: 'Melden bij de beheerder', icon: 'i-lucide-flag', onSelect: () => emit('report', p) },
    ],
  ];
  if (amHost.value)
    groups.push([
      { label: 'Host maken', icon: 'i-lucide-crown', onSelect: () => emit('host', p) },
      { label: 'Uit de kamer zetten', icon: 'i-lucide-user-x', color: 'error', onSelect: () => emit('kick', p) },
    ]);
  return groups;
}
</script>

<template>
  <ol class="overflow-hidden rounded-lg border border-default bg-default" aria-label="Spelers">
    <li v-for="(p, index) in ranked" :key="p.id">
      <UDropdownMenu :items="actions(p)" :disabled="p.id === me" :content="{ align: 'start', side: 'right' }">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors"
          :class="[
            p.guessed ? 'bg-success/15' : index % 2 ? 'bg-muted' : '',
            p.id === me ? 'cursor-default' : 'hover:bg-elevated',
          ]"
        >
          <span class="w-7 shrink-0 text-sm font-bold text-muted tabular-nums">#{{ p.rank }}</span>
          <span class="min-w-0 flex-1 text-center">
            <span class="flex items-center justify-center gap-1">
              <span class="truncate text-sm font-semibold" :class="p.id === me ? 'text-primary' : p.connected ? 'text-highlighted' : 'text-dimmed'">{{ p.name }}<template v-if="p.id === me"> (jij)</template></span>
              <UIcon v-if="room.hostId === p.id" name="i-lucide-crown" class="size-3.5 shrink-0 text-warning" aria-label="Host" />
              <UTooltip v-if="p.account" text="Ingelogd met een Atlesque-account">
                <UIcon name="i-lucide-badge-check" class="size-3.5 shrink-0 text-info" aria-label="Atlesque-account" />
              </UTooltip>
            </span>
            <span class="block text-xs text-muted tabular-nums">{{ p.score }} punten<span v-if="!p.connected"> · weg</span></span>
          </span>
          <span class="relative shrink-0">
            <PlayerAvatar :avatar="p.avatar" :size="40" :muted="!p.connected" />
            <UIcon v-if="room.drawerId === p.id" name="i-lucide-pencil" class="absolute -bottom-0.5 -left-1 size-5 rounded-full bg-[var(--color-brand)] p-0.5 text-white" aria-label="Tekent" />
            <UIcon v-if="p.reaction === 'like'" name="i-lucide-thumbs-up" class="absolute -top-0.5 -right-1 size-4 text-success" aria-label="Vindt het leuk" />
            <UIcon v-else-if="p.reaction === 'dislike'" name="i-lucide-thumbs-down" class="absolute -top-0.5 -right-1 size-4 text-error" aria-label="Vindt het niet leuk" />
          </span>
        </button>
      </UDropdownMenu>
    </li>
  </ol>
</template>
