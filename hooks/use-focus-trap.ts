/**
 * Focus trap for custom (non-Radix) modal dialogs — Phase G8.
 *
 * Radix `<Dialog>` (in `components/ui/dialog.tsx`) handles all this for free,
 * but a lot of pre-existing modals in the codebase are bespoke
 * `<div className="fixed inset-0 …">` overlays. Refactoring all of them to
 * Radix is out of scope; this hook brings them up to keyboard-accessibility
 * parity with three lines of consumer code.
 *
 * What it does while the modal is open:
 *   - **Auto-focuses** the first tabbable element inside the modal so a
 *     keyboard user lands inside the dialog rather than continuing to tab
 *     through the now-obscured page.
 *   - **Cycles Tab / Shift+Tab** within the modal so focus can't escape to
 *     the inert background — the screen-reader rotor is similarly gated by
 *     `aria-modal="true"` (you should set that on the container).
 *   - **Listens for Escape** and calls the `onClose` callback, matching the
 *     ARIA Authoring Practices Guide expectation for dialogs.
 *   - **Restores focus** to whatever element was focused before the modal
 *     opened, so closing the dialog drops the keyboard user back on the
 *     button that opened it.
 *
 * Usage:
 *   const ref = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));
 *   return open ? <div ref={ref} role="dialog" aria-modal>...</div> : null;
 */

import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter((el) => el.offsetParent !== null || el.tagName === 'BODY');
}

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void,
): RefObject<T> {
  const ref = useRef<T>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const root = ref.current;
    if (!root) return;

    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const focusables = getFocusable(root);
    const target = focusables[0] ?? root;
    if (target === root && !root.hasAttribute('tabindex')) {
      root.setAttribute('tabindex', '-1');
    }
    const raf = requestAnimationFrame(() => {
      target.focus({ preventScroll: false });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.stopPropagation();
        onEscape();
        return;
      }

      if (event.key !== 'Tab') return;

      const current = getFocusable(root);
      if (current.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = current[0];
      const last = current[current.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeEl === first || !root.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !root.contains(activeEl)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      const prev = previouslyFocusedRef.current;
      if (prev && document.body.contains(prev)) {
        try {
          prev.focus({ preventScroll: true });
        } catch {
        }
      }
    };
  }, [active, onEscape]);

  return ref;
}

export default useFocusTrap;
