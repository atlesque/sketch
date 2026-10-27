// The drawer's keys (brush, eraser, fill, undo), changeable in the settings dialog and remembered in this browser.
// Ctrl/Cmd+Z always undoes as well.

export type Action = 'brush' | 'eraser' | 'fill' | 'undo';
export type Keys = Record<Action, string>;

const KEY = 'sketch-keys';
export const DEFAULT_KEYS: Keys = { brush: 'b', eraser: 'e', fill: 'f', undo: 'z' };
export const ACTIONS: { action: Action; label: string }[] = [
  { action: 'brush', label: 'Penseel' },
  { action: 'eraser', label: 'Gum' },
  { action: 'fill', label: 'Emmer' },
  { action: 'undo', label: 'Ongedaan maken' },
];

function load(): Keys {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Keys> | null;
    const keys = { ...DEFAULT_KEYS };
    for (const { action } of ACTIONS) {
      const value = saved?.[action];
      if (typeof value === 'string' && value.length === 1) keys[action] = value.toLowerCase();
    }
    return keys;
  } catch {
    return { ...DEFAULT_KEYS };
  }
}

export function useHotkeys() {
  const keys = useState<Keys>('keys', load);

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(keys.value));
    } catch {
      /* storage blocked */
    }
  }

  /** Gives `action` the key `key`; an action that had that key swaps to this action's old key. */
  function set(action: Action, key: string) {
    const value = key.toLowerCase();
    const other = ACTIONS.find((a) => a.action !== action && keys.value[a.action] === value);
    const next = { ...keys.value, [action]: value };
    if (other) next[other.action] = keys.value[action];
    keys.value = next;
    save();
  }

  function reset() {
    keys.value = { ...DEFAULT_KEYS };
    save();
  }

  /** The action a key press means, or null (typing in a field never counts). */
  function match(event: KeyboardEvent): Action | null {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return null;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') return 'undo';
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    return ACTIONS.find((a) => keys.value[a.action] === event.key.toLowerCase())?.action ?? null;
  }

  return { keys, set, reset, match };
}
