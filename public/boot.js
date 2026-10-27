// Runs before first paint: applies the saved Light/Dark/System choice (default: system), and keeps the one
// theme-color tag (it comes after this script in <head>) on the page's background.
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const read = () => { try { return localStorage.getItem('sketch-theme'); } catch { return null; } };
  const apply = () => {
    const mode = read() ?? 'system';
    const dark = mode === 'dark' || (mode === 'system' && media.matches);
    root.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d131c' : '#f6f7f9');
  };
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  media.addEventListener('change', apply);
  window.addEventListener('storage', (event) => { if (event.key === 'sketch-theme') apply(); });
})();
