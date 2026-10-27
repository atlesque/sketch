<script setup lang="ts">
// A yes/no confirmation opened through useOverlay(); resolves true only when confirmed.
defineProps<{ title: string; body: string; confirmLabel: string; cancelLabel?: string; danger?: boolean }>();
const emit = defineEmits<{ close: [boolean] }>();
</script>

<template>
  <UModal :title="title" :description="body" :close="false" :ui="{ footer: 'justify-end' }">
    <template #footer>
      <UButton :label="cancelLabel ?? 'Cancel'" color="neutral" variant="outline" autofocus @click="emit('close', false)" />
      <UButton :label="confirmLabel" :color="danger ? 'error' : 'primary'" data-confirm @click="emit('close', true)" />
    </template>
  </UModal>
</template>
