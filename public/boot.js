// Runs before first paint: applies the saved Light/Dark/System choice (default: system).
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const read = () => { try { return localStorage.getItem('sketch-theme'); } catch { return null; } };
  const apply = () => {
    const mode = read() ?? 'system';
    root.classList.toggle('dark', mode === 'dark' || (mode === 'system' && media.matches));
  };
  apply();
  media.addEventListener('change', apply);
  window.addEventListener('storage', (event) => { if (event.key === 'sketch-theme') apply(); });
})();
