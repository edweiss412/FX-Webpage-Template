"use client";
/**
 * lib/a11y/dialogFocus.ts — shared focus-management for modal dialogs
 * on the crew page (M7 Task 7.9 impeccable §12 audit P0/P1 closures).
 *
 * Implements the WCAG 2.4.3 + 2.1.2 modal-dialog contract:
 *   1. On mount, save the previously-focused element (so the trigger
 *      regains focus when the dialog closes).
 *   2. Set initial focus on the dialog's close button (the first
 *      reachable control inside the dialog).
 *   3. Trap focus inside the dialog: `Tab` from the last focusable
 *      element cycles to the first; `Shift+Tab` from the first cycles
 *      to the last. Esc handling is the dialog's responsibility
 *      (typically already wired in the dialog component).
 *   4. On unmount, restore focus to the saved element. If the element
 *      is no longer in the DOM (rare — the trigger was removed during
 *      the dialog's lifetime), focus falls through to `document.body`
 *      which is the platform default.
 *
 * The hook is intentionally framework-agnostic — no Embla, react-pdf,
 * or component-specific concerns. Both `GalleryLightbox` and the
 * `AgendaSheet` inside `AgendaEmbed` consume it identically.
 */
import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableDescendants(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Set initial focus. Prefer the explicit initial-focus ref (usually
    // the close button); fall back to the first focusable descendant.
    const initial =
      initialFocusRef?.current ?? focusableDescendants(container)[0] ?? container;
    initial.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusables = focusableDescendants(container as HTMLElement);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger. If it's no longer reachable
      // (removed during the dialog's lifetime), the browser falls
      // through to document.body.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
    // The hook intentionally runs once on mount + cleans up on unmount.
    // Re-running on ref change would re-grab focus mid-dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
