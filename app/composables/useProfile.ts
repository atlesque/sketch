// The player's name and avatar (remembered in this browser) and this browser's device id, which moderation uses.

import { cleanAvatar, randomAvatar } from '#shared/game';
import { LIMITS, type Avatar } from '#shared/protocol';

const KEY = 'sketch-profile';
const DEVICE = 'sketch-device';

interface Profile {
  name: string;
  avatar: Avatar;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
};

function load(): Profile {
  try {
    const saved = JSON.parse(read(KEY) ?? 'null') as Partial<Profile> | null;
    if (saved) return { name: String(saved.name ?? '').slice(0, LIMITS.name), avatar: cleanAvatar(saved.avatar) };
  } catch {
    /* fall through */
  }
  return { name: '', avatar: randomAvatar() };
}

export function useProfile() {
  const profile = useState<Profile>('profile', load);
  const device = useState<string>('device', () => {
    let id = read(DEVICE);
    if (!id) {
      id = crypto.randomUUID();
      write(DEVICE, id);
    }
    return id;
  });
  watch(profile, (value) => write(KEY, JSON.stringify(value)), { deep: true });
  return { profile, device };
}
