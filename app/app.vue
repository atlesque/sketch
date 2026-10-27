<script setup lang="ts">
// Back from Atlesque Play's sign-in (?mbpg_code=…): finish it, then go where the player was.
const toast = useToast();
const router = useRouter();
onMounted(async () => {
  const query = new URLSearchParams(location.search);
  if (!query.has('mbpg_code')) return;
  const result = await useAccount().finish(query);
  if (!result) return;
  await router.replace(result.returnTo);
  if (result.error) toast.add({ title: result.error, color: 'error', icon: 'i-lucide-triangle-alert' });
  else toast.add({ title: 'Je bent ingelogd', description: 'Je badge en je punten staan nu op je Atlesque-account.', color: 'success', icon: 'i-lucide-circle-check' });
});
</script>

<template>
  <UApp :toaster="{ position: 'top-center' }" :tooltip="{ delayDuration: 300 }">
    <NuxtLayout><NuxtPage /></NuxtLayout>
  </UApp>
</template>
