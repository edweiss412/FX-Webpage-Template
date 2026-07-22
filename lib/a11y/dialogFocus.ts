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
    // tabIndex >= 0 mirrors native sequential order: `a[href]` (etc.) with an
    // explicit tabindex="-1" is click/programmatically focusable but NOT
    // Tab-reachable, so the trap must not treat it as a boundary element
    // (e.g. HoverHelp's learn-more link while its popover is closed or
    // collision-hidden - visibility:hidden keeps offsetParent non-null).
    (el) => (el.offsetParent !== null && el.tabIndex >= 0) || el === document.activeElement,
  );
}

export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
  /**
   * Re-bind signal for callers whose container DOM NODE is recreated during
   * the dialog's lifetime. ReviewModalShell's `mounted` flip moves the tree
   * into a `createPortal(document.body)` — React recreates the host nodes, so
   * the keydown trap attached to the first panel node is silently lost (the
   * cold-load `/admin?show=` path; masked in production only because the
   * inert background plus the modal sitting at the end of `document.body`
   * makes native tab-wrap approximate the trap). Pass the value that flips
   * when the container is recreated; omit everywhere else — the effect then
   * runs once on mount exactly as before.
   */
  reattachKey?: unknown,
): void {
  // Restore-to-trigger is a MOUNT-LIFETIME concern, split from the (possibly
  // re-running) attach effect below: a reattach cleanup must NOT yank focus
  // back to the trigger mid-dialog, and the trigger snapshot must be the one
  // taken before the dialog FIRST opened, not whatever was focused at the
  // moment the container node was recreated.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      // Restore focus to the trigger. If it's no longer reachable
      // (removed during the dialog's lifetime), the browser falls
      // through to document.body.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Set initial focus. Prefer the explicit initial-focus ref (usually
    // the close button); fall back to the first focusable descendant.
    // Guarded on re-attach: recreating the container drops focus to <body>,
    // so re-applying is correct — but a user's own focus already inside the
    // NEW container is never stolen.
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !container.contains(active)) {
      const initial = initialFocusRef?.current ?? focusableDescendants(container)[0] ?? container;
      initial.focus();
    }

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
    };
    // Runs once on mount, plus once per reattachKey change (container node
    // recreated — see the parameter doc). Re-running on ref IDENTITY is still
    // deliberately avoided: refs don't trigger renders, and the guarded
    // initial-focus above makes any extra run a no-op for focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reattachKey]);
}
