<script setup lang="ts">
// The global word list the game draws from: the built-in Dutch words, words added to them, built-in words taken
// out, and whether the game uses only the added words. A room's own custom words still come on top.
import { normalize, parseWords } from '#shared/game';
import { WORDS_NL } from '#shared/words-nl';

definePageMeta({ layout: 'admin' });
useHead({ title: 'Word list' });

interface WordsResponse {
  extra: string[];
  removed: string[];
  onlyExtra: boolean;
  builtin: number;
  pool: number;
  onlyExtraMin: number;
  max: number;
  updatedAt: number | null;
  updatedBy: string | null;
}

const { api } = useAdmin();
const toast = useToast();
const saved = ref<WordsResponse | null>(null);
const extraText = ref('');
const removedText = ref('');
const onlyExtra = ref(false);
const saving = ref(false);
const search = ref('');

async function load() {
  try {
    const result = await api<WordsResponse>('/words');
    saved.value = result;
    extraText.value = result.extra.join('\n');
    removedText.value = result.removed.join('\n');
    onlyExtra.value = result.onlyExtra;
  } catch {
    /* shown by useAdmin */
  }
}
onMounted(load);

const extra = computed(() => parseWords(extraText.value, saved.value?.max ?? 5000));
const removed = computed(() => parseWords(removedText.value, WORDS_NL.length));
const builtinKeys = new Set(WORDS_NL.map(normalize));
const unknownRemoved = computed(() => removed.value.filter((w) => !builtinKeys.has(normalize(w))));
const alreadyBuiltin = computed(() => extra.value.filter((w) => builtinKeys.has(normalize(w))));
const minOnly = computed(() => saved.value?.onlyExtraMin ?? 50);
const canOnly = computed(() => extra.value.length >= minOnly.value);
const pool = computed(() => {
  const keys = new Set<string>();
  const gone = new Set(removed.value.map(normalize));
  if (!(onlyExtra.value && canOnly.value)) for (const w of WORDS_NL) if (!gone.has(normalize(w))) keys.add(normalize(w));
  for (const w of extra.value) keys.add(normalize(w));
  return keys.size;
});
const dirty = computed(
  () => !!saved.value && (extra.value.join('\n') !== saved.value.extra.join('\n') || removed.value.join('\n') !== saved.value.removed.join('\n') || onlyExtra.value !== saved.value.onlyExtra),
);

async function save() {
  saving.value = true;
  try {
    const result = await api<{ unknown: string[]; pool: number }>('/words', { method: 'PUT', body: { extra: extra.value, removed: removed.value, onlyExtra: onlyExtra.value && canOnly.value } });
    toast.add({
      title: 'Word list saved',
      description: `${result.pool} words in play. Rooms pick it up within a minute.${result.unknown.length ? ` Not built-in, so not removed: ${result.unknown.join(', ')}.` : ''}`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await load();
  } catch {
    /* shown by useAdmin */
  } finally {
    saving.value = false;
  }
}

// The built-in list, searchable, with a button to take a word out (or put it back).
const removedKeys = computed(() => new Set(removed.value.map(normalize)));
const builtinMatches = computed(() => {
  const term = normalize(search.value);
  return term ? WORDS_NL.filter((w) => normalize(w).includes(term)).slice(0, 60) : [];
});
function toggleBuiltin(word: string) {
  const key = normalize(word);
  removedText.value = removedKeys.value.has(key) ? removed.value.filter((w) => normalize(w) !== key).join('\n') : [...removed.value, word].join('\n');
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl text-highlighted">Word list</h1>
        <p class="text-sm text-muted">
          The words every room draws from. A private room's own custom words still come on top. Saved changes reach the rooms within a minute.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton label="Discard" color="neutral" variant="ghost" :disabled="!dirty || saving" @click="load" />
        <UButton label="Save" icon="i-lucide-save" :loading="saving" :disabled="!dirty" @click="save" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-lg border border-default bg-default p-4">
        <p class="text-xs text-muted">Words in play</p>
        <p class="mt-1 text-2xl font-bold text-highlighted tabular-nums">{{ saved ? pool : '…' }}</p>
      </div>
      <div class="rounded-lg border border-default bg-default p-4">
        <p class="text-xs text-muted">Built-in</p>
        <p class="mt-1 text-2xl font-bold text-highlighted tabular-nums">{{ WORDS_NL.length }}</p>
      </div>
      <div class="rounded-lg border border-default bg-default p-4">
        <p class="text-xs text-muted">Added</p>
        <p class="mt-1 text-2xl font-bold text-highlighted tabular-nums">{{ extra.length }}</p>
      </div>
      <div class="rounded-lg border border-default bg-default p-4">
        <p class="text-xs text-muted">Built-in taken out</p>
        <p class="mt-1 text-2xl font-bold text-highlighted tabular-nums">{{ removed.length - unknownRemoved.length }}</p>
      </div>
    </div>
    <p v-if="saved?.updatedAt" class="-mt-3 text-xs text-muted">Last saved {{ fmtTime(saved.updatedAt) }} by {{ saved.updatedBy }}. Every change is in the <NuxtLink to="/admin/audit?type=admin.words" class="text-primary hover:underline">audit log</NuxtLink>.</p>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="flex flex-col gap-2 rounded-lg border border-default bg-default p-4">
        <h2 class="font-display text-xl text-highlighted">Added words</h2>
        <p class="text-sm text-muted">One per line or comma separated, up to {{ saved?.max ?? 5000 }}, each at most 30 characters. Duplicates are dropped.</p>
        <UTextarea v-model="extraText" :rows="16" autoresize :maxrows="30" placeholder="sprint&#10;standup&#10;retrospective" class="w-full font-mono" spellcheck="false" />
        <p v-if="alreadyBuiltin.length" class="text-xs text-muted">Already built in: {{ alreadyBuiltin.slice(0, 20).join(', ') }}{{ alreadyBuiltin.length > 20 ? '…' : '' }}</p>
        <USwitch
          v-model="onlyExtra"
          :disabled="!canOnly"
          label="Use only the added words"
          :description="canOnly ? 'The built-in words are left out entirely.' : `Needs at least ${minOnly} added words (now ${extra.length}).`"
        />
      </section>

      <section class="flex flex-col gap-2 rounded-lg border border-default bg-default p-4">
        <h2 class="font-display text-xl text-highlighted">Built-in words taken out</h2>
        <p class="text-sm text-muted">Built-in words the game should never offer. Search the built-in list below, or type them here.</p>
        <UTextarea v-model="removedText" :rows="6" autoresize :maxrows="16" class="w-full font-mono" spellcheck="false" />
        <p v-if="unknownRemoved.length" class="text-xs text-warning">Not in the built-in list (ignored): {{ unknownRemoved.join(', ') }}</p>

        <UInput v-model="search" icon="i-lucide-search" placeholder="Search the built-in words" class="mt-2" />
        <div v-if="search" class="flex flex-wrap gap-1.5">
          <UButton
            v-for="word in builtinMatches"
            :key="word"
            :label="word"
            size="xs"
            :color="removedKeys.has(normalize(word)) ? 'error' : 'neutral'"
            :variant="removedKeys.has(normalize(word)) ? 'soft' : 'outline'"
            :icon="removedKeys.has(normalize(word)) ? 'i-lucide-undo-2' : 'i-lucide-x'"
            :title="removedKeys.has(normalize(word)) ? 'Put back' : 'Take out'"
            @click="toggleBuiltin(word)"
          />
          <p v-if="!builtinMatches.length" class="text-xs text-muted">No built-in word matches.</p>
        </div>
      </section>
    </div>
  </div>
</template>
