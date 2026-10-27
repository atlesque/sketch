const SITE = 'https://sketch.atlesque.dev/';
const DESCRIPTION = 'Tekenen en raden met je team: een intern spel voor tijdens de Scrum-ceremonies.';

export default defineNuxtConfig({
  extends: ['./ui'],
  compatibilityDate: '2026-10-01',
  // One client-rendered page for the game and the admin; every route is answered by index.html
  // (assets.not_found_handling = single-page-application in wrangler.jsonc).
  ssr: false,
  app: {
    head: {
      title: 'Sketch',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'canonical', href: SITE },
      ],
      // An internal game, so it stays out of search (this tag, X-Robots-Tag in public/_headers, robots.txt). Every route
      // gets the same static head (ssr: false), so a shared room link previews as the home page. The share image is
      // public/og-image.png, rendered from scripts/og-image.html.
      meta: [
        { name: 'robots', content: 'noindex' },
        { name: 'description', content: DESCRIPTION },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'Sketch' },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:url', content: SITE },
        { property: 'og:image', content: `${SITE}og-image.png` },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'Het Sketch-logo, een rij getekende figuurtjes en een tekening van een huisje onder de zon' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      // The shared opt-in analytics banner every Atlesque tool loads.
      script: [{ src: 'https://tools.atlesque.dev/consent.js', defer: true }],
    },
  },
  runtimeConfig: {
    public: {
      // Atlesque Play, where players sign in (NUXT_PUBLIC_PLAY_URL=http://127.0.0.1:8787 for a local copy).
      playUrl: 'https://play.atlesque.dev',
    },
  },
  // Icons named in script blocks and data aren't always found by the bundle scan.
  icon: {
    clientBundle: {
      icons: [
        'lucide:pencil', 'lucide:eraser', 'lucide:paint-bucket', 'lucide:undo-2', 'lucide:trash-2', 'lucide:crown', 'lucide:check',
        'lucide:thumbs-up', 'lucide:thumbs-down', 'lucide:sun', 'lucide:moon', 'lucide:monitor', 'lucide:volume-2', 'lucide:volume-x',
        'lucide:user-x', 'lucide:flag', 'lucide:vote', 'lucide:shield', 'lucide:wifi-off', 'lucide:link', 'lucide:copy', 'lucide:log-out',
        'lucide:dice-5', 'lucide:chevron-left', 'lucide:chevron-right', 'lucide:play', 'lucide:users', 'lucide:lock', 'lucide:radio',
        'lucide:gamepad-2', 'lucide:scroll-text', 'lucide:ban', 'lucide:message-square-warning', 'lucide:user-round', 'lucide:eye',
        'lucide:mic-off', 'lucide:mic', 'lucide:skip-forward', 'lucide:square', 'lucide:x', 'lucide:send', 'lucide:refresh-cw',
        'lucide:circle-check', 'lucide:triangle-alert', 'lucide:info', 'lucide:loader-circle', 'lucide:badge-check', 'lucide:trophy',
        'lucide:clock', 'lucide:external-link', 'lucide:door-closed', 'lucide:megaphone', 'lucide:history', 'lucide:search',
        'lucide:settings', 'lucide:keyboard', 'lucide:sun-moon', 'lucide:message-circle', 'lucide:sparkles', 'lucide:shuffle',
      ],
    },
  },
  // Static output only; without this, Nitro switches to its Cloudflare preset inside Workers Builds.
  // In dev, /api goes to `pnpm dev:api` (wrangler dev on port 8840), which runs worker/index.ts.
  nitro: {
    preset: 'static',
    devProxy: { '/api': { target: 'http://127.0.0.1:8840/api', changeOrigin: true } },
  },
});
