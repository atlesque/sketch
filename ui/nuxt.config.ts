import { fileURLToPath } from 'node:url';

// Shared theme layer (the Junk Desk design system, with Sketch's coral marker as the brand): Nuxt UI, fonts, light/dark.
const css = fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url));

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui'],
  css: [css],
  devtools: { enabled: false },
  telemetry: false,
  // Self-hosted fonts, bundled icons and our own color variables: no third-party requests, no inline scripts.
  ui: { fonts: false, colorMode: false, experimental: { componentDetection: true }, theme: { colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error'] } },
  icon: { mode: 'svg', provider: 'none', serverBundle: false, clientBundle: { scan: true, sizeLimitKb: 0 }, fallbackToApi: false },
  app: {
    head: {
      htmlAttrs: { lang: 'nl' },
      meta: [
        { name: 'theme-color', content: '#f6f7f9', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0d131c', media: '(prefers-color-scheme: dark)' },
      ],
      link: [{ rel: 'preload', href: '/fonts/plus-jakarta-sans-latin-wght-normal.woff2', as: 'font', type: 'font/woff2', crossorigin: '' }],
      // A classic script that applies the saved theme before first paint.
      script: [{ src: '/boot.js', tagPosition: 'head', tagPriority: 'critical' }],
    },
  },
  // An import map is an inline script, which the CSP blocks.
  experimental: { payloadExtraction: false, entryImportMap: false },
  hooks: {
    // Nuxt UI's color plugin injects an inline <style> at runtime; main.css defines the same variables.
    'app:resolve'(app) {
      app.plugins = app.plugins.filter((plugin) => !/@nuxt[/\\]ui[/\\].*plugins[/\\]colors/u.test(plugin.src));
    },
  },
});
