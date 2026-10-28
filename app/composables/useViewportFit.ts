// Phones: the game screen is pinned to the part of the screen you can actually see. window.visualViewport shrinks
// when the keyboard opens (iOS keeps the page itself at full height and pans it), so following it keeps the top bar,
// the board and the guess field in view without scrolling. Meanwhile the page itself doesn't scroll.
import type { Ref } from 'vue';

/** Whether a media query matches, kept up to date. */
export function useMedia(query: string) {
  const list = typeof window === 'undefined' ? null : window.matchMedia(query);
  const matches = ref(!!list?.matches);
  const update = () => (matches.value = !!list?.matches);
  onMounted(() => list?.addEventListener('change', update));
  onBeforeUnmount(() => list?.removeEventListener('change', update));
  return matches;
}

export function useViewportFit(active: Ref<boolean>) {
  const box = ref({ top: 0, height: 0 });

  function update() {
    const vv = window.visualViewport;
    box.value = { top: vv?.offsetTop ?? 0, height: vv?.height ?? window.innerHeight };
  }
  function lock(on: boolean) {
    const root = document.documentElement;
    root.style.overflow = on ? 'hidden' : '';
    root.style.overscrollBehavior = on ? 'none' : '';
  }

  onMounted(() => {
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
  });
  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    lock(false);
  });
  watch(
    active,
    (on) => {
      lock(on);
      if (!on) return;
      window.scrollTo(0, 0);
      update();
    },
    { immediate: true },
  );

  /** Inline position for the pinned screen (with `fixed inset-x-0`), or nothing when not active. */
  const style = computed(() => (active.value && box.value.height ? { top: `${box.value.top}px`, height: `${box.value.height}px` } : undefined));
  return { style };
}
