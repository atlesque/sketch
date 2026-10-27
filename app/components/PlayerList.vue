<script setup lang="ts">
// Players in score order, with who draws, who guessed, the host, signed-in badges and reactions.
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
  <ol class="flex flex-col gap-1" aria-label="Spelers">
    <li v-for="p in ranked" :key="p.id">
      <UDropdownMenu :items="actions(p)" :disabled="p.id === me" :content="{ align: 'start', side: 'right' }">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors"
          :class="[
            p.guessed ? 'border-success/40 bg-success/10' : 'border-default bg-default',
            p.id === me ? 'ring-1 ring-primary/40' : '',
            p.id === me ? 'cursor-default' : 'hover:bg-elevated',
          ]"
        >
          <span class="w-6 shrink-0 text-center text-xs font-semibold text-muted">#{{ p.rank }}</span>
          <span class="relative">
            <PlayerAvatar :avatar="p.avatar" :size="36" :muted="!p.connected" />
            <UIcon v-if="room.drawerId === p.id" name="i-lucide-pencil" class="absolute -right-1 -bottom-1 size-4 rounded-full bg-[var(--color-brand)] p-0.5 text-white" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1">
              <span class="truncate text-sm font-semibold" :class="p.connected ? 'text-highlighted' : 'text-dimmed'">{{ p.name }}</span>
              <span v-if="p.id === me" class="text-xs text-muted">(jij)</span>
              <UIcon v-if="room.hostId === p.id" name="i-lucide-crown" class="size-3.5 shrink-0 text-warning" aria-label="Host" />
              <UTooltip v-if="p.account" text="Ingelogd met een Atlesque-account">
                <UIcon name="i-lucide-badge-check" class="size-3.5 shrink-0 text-info" aria-label="Atlesque-account" />
              </UTooltip>
            </span>
            <span class="block text-xs text-muted">{{ p.score }} punten<span v-if="!p.connected"> · weg</span></span>
          </span>
          <UIcon v-if="p.reaction === 'like'" name="i-lucide-thumbs-up" class="size-4 shrink-0 text-success" aria-label="Vindt het leuk" />
          <UIcon v-else-if="p.reaction === 'dislike'" name="i-lucide-thumbs-down" class="size-4 shrink-0 text-error" aria-label="Vindt het niet leuk" />
          <UIcon v-if="p.guessed" name="i-lucide-check" class="size-4 shrink-0 text-success" aria-label="Geraden" />
        </button>
      </UDropdownMenu>
    </li>
  </ol>
</template>
