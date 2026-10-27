// The admin API (worker/admin.ts) behind Cloudflare Access. When the Access session runs out, its requests are
// redirected to the Access login, which fetch can't follow; the page then asks for a reload to sign in again.

export function useAdmin() {
  const toast = useToast();
  const expired = useState('admin-expired', () => false);

  async function api<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    try {
      return await $fetch<T>(`/api/admin${path}`, { ...options, redirect: 'manual' } as Parameters<typeof $fetch>[1]) as T;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      const message = (error as { data?: { error?: string } }).data?.error;
      if (!status || status === 403) expired.value = true;
      else toast.add({ title: message ?? 'That did not work', color: 'error', icon: 'i-lucide-triangle-alert' });
      throw error;
    }
  }

  return { api, expired };
}

export const fmtTime = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export function ago(ts: number | null | undefined, now = Date.now()) {
  if (!ts) return '—';
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

export function duration(from: number | null | undefined, to: number | null | undefined) {
  if (!from || !to) return '—';
  const s = Math.round((to - from) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}
