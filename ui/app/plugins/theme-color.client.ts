// Keeps the one theme-color tag on the page's background once the app runs. boot.js and useTheme toggle the `dark`
// class on <html>; this follows it (otherwise Nuxt's head manager puts nuxt.config's light value back).
export default defineNuxtPlugin(() => {
  const root = document.documentElement;
  const dark = ref(root.classList.contains('dark'));
  new MutationObserver(() => (dark.value = root.classList.contains('dark'))).observe(root, { attributes: true, attributeFilter: ['class'] });
  useHead({ meta: [{ name: 'theme-color', content: computed(() => (dark.value ? '#0d131c' : '#f6f7f9')) }] });
});
