<script setup lang="ts">
// Report a player to the admin, with a reason. Opened through useOverlay(); resolves the reason or null.
const props = defineProps<{ name: string }>();
const emit = defineEmits<{ close: [string | null] }>();
const reasons = ['Ongepaste tekening', 'Ongepaste chat of naam', 'Verklapt het woord', 'Spelbederf', 'Iets anders'];
const reason = ref(reasons[0]!);
const details = ref('');
const send = () => emit('close', [reason.value, details.value.trim()].filter(Boolean).join(': '));
</script>

<template>
  <UModal :title="`${props.name} melden`" description="De beheerder ziet je melding met de tekening en de chat van dit moment." :close="false" :ui="{ footer: 'justify-end' }">
    <template #body>
      <div class="flex flex-col gap-3">
        <URadioGroup v-model="reason" :items="reasons" />
        <UTextarea v-model="details" :rows="2" :maxlength="200" placeholder="Wat is er gebeurd? (optioneel)" class="w-full" />
      </div>
    </template>
    <template #footer>
      <UButton label="Annuleren" color="neutral" variant="outline" @click="emit('close', null)" />
      <UButton label="Melden" color="error" icon="i-lucide-flag" @click="send" />
    </template>
  </UModal>
</template>
