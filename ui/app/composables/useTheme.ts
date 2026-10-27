export type Theme = 'light' | 'dark' | 'system';
const KEY = 'sketch-theme';

// Mirrors public/boot.js. Use it in a theme switch: const { theme, set } = useTheme()
export function useTheme() {
  const theme = useState<Theme>('theme', () => 'system');
  const apply = () => {
    const dark = theme.value === 'dark' || (theme.value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  };
  onMounted(() => {
    try { theme.value = (localStorage.getItem(KEY) as Theme | null) ?? 'system'; } catch { /* storage blocked */ }
  });
  const set = (value: Theme) => {
    theme.value = value;
    try { localStorage.setItem(KEY, value); } catch { /* storage blocked */ }
    apply();
  };
  return { theme, set };
}
