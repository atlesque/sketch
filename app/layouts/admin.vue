<script setup lang="ts">
// The admin shell (English): a collapsible sidebar, the signed-in Access email and the theme switch.
import type { NavigationMenuItem } from '@nuxt/ui';

const { api, expired } = useAdmin();
const email = ref('');
onMounted(async () => {
  try {
    email.value = (await api<{ email: string }>('/me')).email;
  } catch {
    /* expired is set */
  }
});

const items: NavigationMenuItem[] = [
  { label: 'Live rooms', icon: 'i-lucide-radio', to: '/admin', exact: true },
  { label: 'Games', icon: 'i-lucide-gamepad-2', to: '/admin/games' },
  { label: 'Audit log', icon: 'i-lucide-scroll-text', to: '/admin/audit' },
  { label: 'Reports', icon: 'i-lucide-flag', to: '/admin/reports' },
  { label: 'Bans', icon: 'i-lucide-ban', to: '/admin/bans' },
  { label: 'Players', icon: 'i-lucide-users', to: '/admin/players' },
];
const reload = () => window.location.reload();
useHead({ htmlAttrs: { lang: 'en' }, titleTemplate: (title) => (title ? `${title} · Sketch admin` : 'Sketch admin') });
</script>

<template>
  <UDashboardGroup storage="local" storage-key="sketch-admin" unit="px">
    <UDashboardSidebar collapsible :resizable="false" :default-size="232" :collapsed-size="68" :ui="{ root: 'bg-default/60', header: 'h-16', footer: 'flex-col items-stretch gap-2 border-t border-default py-3' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/admin" class="min-w-0" aria-label="Sketch admin home"><AppLogo v-if="!collapsed" admin /><img v-else src="/favicon.svg" width="28" height="28" alt=""></NuxtLink>
      </template>
      <template #default="{ collapsed }">
        <UNavigationMenu :items="items" orientation="vertical" :collapsed="collapsed" tooltip highlight color="neutral" aria-label="Admin" />
        <UNavigationMenu
          :items="[{ label: 'Open the game', icon: 'i-lucide-external-link', to: '/', target: '_blank' }]"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          color="neutral"
          class="mt-auto"
        />
      </template>
      <template #footer="{ collapsed }">
        <p v-if="!collapsed" class="truncate px-1 text-xs text-muted" :title="email">{{ email || '…' }}</p>
        <ThemeSwitch lang="en" :class="collapsed ? 'mx-auto' : ''" />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #body>
        <UAlert
          v-if="expired"
          color="warning"
          icon="i-lucide-triangle-alert"
          title="Your Cloudflare Access session has ended"
          description="Reload the page to sign in again."
          :actions="[{ label: 'Reload', icon: 'i-lucide-refresh-cw', onClick: reload }]"
        />
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
