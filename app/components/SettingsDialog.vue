<script setup lang="ts">
// The gear in the game's top bar: volume, the drawing keys, the theme, the cookie settings, and the room (invite link, leaving).
import type { Theme } from '../../ui/app/composables/useTheme';
import { ACTIONS, type Action } from '~/composables/useHotkeys';

const props = defineProps<{ code?: string }>();
const emit = defineEmits<{ leave: [] }>();
const open = defineModel<boolean>('open', { default: false });

const { volume, setVolume } = useSounds();
const { keys, set, reset } = useHotkeys();
const { theme, set: setTheme } = useTheme();
const toast = useToast();

const themes: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Licht', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Donker', icon: 'i-lucide-moon' },
  { value: 'system', label: 'Automatisch', icon: 'i-lucide-monitor' },
];

function capture(action: Action, event: KeyboardEvent) {
  if (event.key === 'Tab' || event.key === 'Escape') return;
  event.preventDefault();
  if (event.key.length !== 1 || !/\S/.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
  set(action, event.key);
}

const invite = computed(() => (props.code ? `${location.origin}/r/${props.code}` : ''));
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(invite.value);
    toast.add({ title: 'Uitnodigingslink gekopieerd', color: 'success', icon: 'i-lucide-copy' });
  } catch {
    toast.add({ title: invite.value, description: 'Kopieer deze link en deel hem met je team.', color: 'info' });
  }
}

// The shared consent banner (consent.js, if it loaded) opens once this dialog has closed and would hand the focus back
// to the gear, so the focus goes to the banner instead.
const consent = () => (window as { AtlesqueConsent?: { open(): void } }).AtlesqueConsent;
let consentNext = false;
function openConsent() {
  consentNext = true;
  open.value = false;
}
function closeAutoFocus(event: Event) {
  if (!consentNext) return;
  consentNext = false;
  event.preventDefault();
  consent()?.open();
}
</script>

<template>
  <UModal v-model:open="open" title="Instellingen" :ui="{ body: 'flex flex-col gap-6' }" :content="{ onCloseAutoFocus: closeAutoFocus }">
    <template #body>
      <section class="flex flex-col gap-2">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon :name="volume ? 'i-lucide-volume-2' : 'i-lucide-volume-x'" class="size-5" /> Volume {{ volume }}%
        </h3>
        <USlider :model-value="volume" :min="0" :max="100" :step="5" aria-label="Volume" @update:model-value="(value) => setVolume(Number(value))" />
      </section>

      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-keyboard" class="size-5" /> Sneltoetsen</h3>
          <UButton label="Standaard" color="neutral" variant="ghost" size="xs" @click="reset" />
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UFormField v-for="a in ACTIONS" :key="a.action" :label="a.label">
            <UInput :model-value="keys[a.action].toUpperCase()" readonly class="w-full" :ui="{ base: 'text-center font-mono cursor-pointer caret-transparent' }" :aria-label="`Toets voor ${a.label.toLowerCase()}`" @keydown="(event: KeyboardEvent) => capture(a.action, event)" />
          </UFormField>
        </div>
        <p class="text-xs text-muted">Klik in een vakje en druk op een toets. Ctrl+Z maakt ook altijd ongedaan.</p>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-sun-moon" class="size-5" /> Thema</h3>
        <div class="grid grid-cols-3 gap-2">
          <UButton v-for="t in themes" :key="t.value" :label="t.label" :icon="t.icon" block :color="theme === t.value ? 'primary' : 'neutral'" :variant="theme === t.value ? 'solid' : 'outline'" @click="setTheme(t.value)" />
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-shield" class="size-5" /> Privacy</h3>
        <div class="flex flex-wrap gap-2">
          <UButton v-if="consent()" label="Cookie-instellingen" color="neutral" variant="outline" @click="openConsent" />
          <UButton label="Privacybeleid" to="https://tools.atlesque.dev/privacy" target="_blank" trailing-icon="i-lucide-external-link" color="neutral" variant="ghost" />
        </div>
      </section>

      <section v-if="code" class="flex flex-col gap-2">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-link" class="size-5" /> Uitnodigen</h3>
        <div class="flex gap-2">
          <UInput :model-value="invite" readonly class="flex-1" :ui="{ base: 'font-mono' }" aria-label="Uitnodigingslink" @focus="($event.target as HTMLInputElement).select()" />
          <UButton icon="i-lucide-copy" label="Kopiëren" color="neutral" variant="outline" @click="copyInvite" />
        </div>
      </section>
    </template>
    <template v-if="code" #footer>
      <UButton label="Kamer verlaten" icon="i-lucide-log-out" color="error" variant="soft" @click="open = false; emit('leave')" />
    </template>
  </UModal>
</template>
