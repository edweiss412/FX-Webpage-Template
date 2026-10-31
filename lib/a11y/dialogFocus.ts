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
 *      to the last. Every other Tab is the browser's. Esc handling is the
 *      dialog's responsibility (typically already wired in the dialog
 *      component). One dialog opts into a walk instead (`walkTabs`,
 *      below): the crew section sheet.
 *   4. On unmount, restore focus to the saved element. If the element
 *      is no longer in the DOM (rare — the trigger was removed during
 *      the dialog's lifetime), focus falls through to `document.body`
 *      which is the platform default.
 *
 * The hook is intentionally framework-agnostic — no Embla, react-pdf,
 * or component-specific concerns. Both `GalleryLightbox` and the
 * `AgendaSheet` inside `AgendaEmbed` consume it identically.
 */
import { useEffect, useRef, type RefObject } from "react";

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

// ── Walk mode (`walkTabs`) ──────────────────────────────────────────────────
// The trap moves focus itself on every Tab, so its stop list has to match the
// browser's: a stop it omits is one Tab never reaches.
const WALK_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  // A disclosure's own summary is a native Tab stop (narrowed to a details
  // element's first summary in `isTabStop`).
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** A details element's own summary: the first summary child, the one the browser renders. */
function ownSummary(details: HTMLDetailsElement): Element | null {
  return details.querySelector(":scope > summary");
}

/**
 * Inside a closed <details> and not in its own summary: not rendered. Both
 * engines still report an offsetParent and tabIndex 0 for such a control, but
 * focus() on it does nothing, so a walk that counted it would stay where it was
 * on every Tab (whole-diff review R2-F1).
 */
function inClosedDisclosure(el: HTMLElement): boolean {
  let child: Element = el;
  for (let parent = el.parentElement; parent; child = parent, parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.open && child !== ownSummary(parent)) {
      return true;
    }
  }
  return false;
}

/** Whether the browser's own sequential navigation would stop on `el`. */
function isTabStop(el: HTMLElement): boolean {
  if (el.tagName === "SUMMARY") {
    const details = el.parentElement;
    if (!(details instanceof HTMLDetailsElement) || ownSummary(details) !== el) {
      return false;
    }
  }
  return (
    !inClosedDisclosure(el) &&
    el.offsetParent !== null &&
    // tabIndex >= 0 mirrors native sequential order: `a[href]` (etc.) with an
    // explicit tabindex="-1" is click/programmatically focusable but NOT
    // Tab-reachable (e.g. HoverHelp's learn-more link while its popover is
    // closed or collision-hidden).
    el.tabIndex >= 0 &&
    // visibility:hidden keeps offsetParent non-null, and focus() on such an
    // element is a no-op that would strand the walk on it.
    getComputedStyle(el).visibility !== "hidden" &&
    el.closest("[inert]") === null
  );
}

/** A named radio group, keyed within its form (or the document). */
function radioGroup(el: HTMLElement): string | null {
  return el instanceof HTMLInputElement && el.type === "radio" && el.name !== ""
    ? `${el.form?.id ?? ""}\u0000${el.name}`
    : null;
}

function walkStops(container: HTMLElement): HTMLElement[] {
  const active = document.activeElement;
  const stops = Array.from(container.querySelectorAll<HTMLElement>(WALK_SELECTOR)).filter(
    (el) => el === active || isTabStop(el),
  );
  // A radio group is ONE stop, as it is natively: the radio holding focus,
  // else the checked one, else the group's first. Arrow keys move within it.
  const stopFor = new Map<string, HTMLElement>();
  for (const el of stops) {
    const group = radioGroup(el);
    if (group === null) continue;
    const held = stopFor.get(group);
    const better =
      held === undefined ||
      el === active ||
      (held !== active && (el as HTMLInputElement).checked && !(held as HTMLInputElement).checked);
    if (better) stopFor.set(group, el);
  }
  return stops.filter((el) => {
    const group = radioGroup(el);
    return group === null || stopFor.get(group) === el;
  });
}

/**
 * The stop a Tab (or Shift+Tab) moves to from `active`: the next (previous)
 * stop in document order, wrapping. From an element that is not a stop (a
 * `tabindex="-1"` heading focused on open, or the container itself), the first
 * stop after it (the last before it), as the browser would choose.
 */
function nextStop(
  focusables: readonly HTMLElement[],
  active: Element | null,
  backward: boolean,
): HTMLElement {
  const count = focusables.length;
  const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1;
  if (index !== -1) return focusables[(index + (backward ? count - 1 : 1)) % count]!;
  const follows = (el: HTMLElement) =>
    active !== null &&
    (active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return backward
    ? (focusables.findLast((el) => !follows(el)) ?? focusables[count - 1]!)
    : (focusables.find(follows) ?? focusables[0]!);
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
  /**
   * Optional, and added as a FOURTH parameter rather than by repurposing
   * `reattachKey`, so every existing call site compiles and behaves unchanged.
   *
   * `restoreTargetRef` overrides the saved trigger at restore time. It exists
   * because a trigger can be REMOVED while the dialog is open — a diagrams
   * thumbnail whose image 404s swaps its button for a placeholder — and
   * restoring to a detached node is a silent no-op that drops focus to
   * `<body>`. A MUTABLE REF rather than a prop or state: the owner may need to
   * re-point it during an `AnimatePresence` exit, when the dialog's props are
   * frozen and no re-render can reach it, and a ref object's identity survives
   * that freeze so a `.current` write is visible at the unmount cleanup below.
   */
  options?: {
    restoreTargetRef?: RefObject<HTMLElement | null> | undefined;
    /**
     * Opt-in, for the crew section sheet only: the trap moves focus itself on
     * every `Tab` and `Shift+Tab`, to the next or previous stop in document
     * order, wrapping, and never hands a Tab to the browser. WebKit's default
     * sequential navigation skips buttons and links, so a Tab left to it in a
     * dialog of buttons and links lands on `<body>` (measured under
     * Playwright's mobile-safari). Every other dialog keeps the default: act at
     * the two ends only, which leaves a closed disclosure's contents and a
     * child's own Tab handling to the browser and the child (whole-diff review
     * R2-F1, R2-F2).
     */
    walkTabs?: boolean | undefined;
  },
): void {
  // Mirrored into a ref so the mount-lifetime effect below can read the LATEST
  // one without taking `options` as a dependency — a new options object every
  // render would otherwise re-run that effect and restore focus mid-dialog.
  const restoreTargetRef = options?.restoreTargetRef;
  // Used when the trap attaches: a dialog keeps one mode for its lifetime.
  const walkTabs = options?.walkTabs === true;
  const latestRestoreTarget = useRef(restoreTargetRef);
  useEffect(() => {
    latestRestoreTarget.current = restoreTargetRef;
  }, [restoreTargetRef]);

  // Restore-to-trigger is a MOUNT-LIFETIME concern, split from the (possibly
  // re-running) attach effect below: a reattach cleanup must NOT yank focus
  // back to the trigger mid-dialog, and the trigger snapshot must be the one
  // taken before the dialog FIRST opened, not whatever was focused at the
  // moment the container node was recreated.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      // Restore focus to the retarget when the owner set one, else to the
      // trigger. If neither is reachable (removed during the dialog's
      // lifetime), the browser falls through to document.body.
      // CONNECTED targets only, and the fallback chain is why. Whole-diff
      // review round 2 measured the failure: an opener removed while the dialog
      // was open leaves `restoreTargetRef` pointing at a detached node, and
      // `.focus()` on a detached node is a silent no-op that drops focus to
      // `<body>`. Clearing the ref alone does not help either -- the chain then
      // falls through to `previouslyFocused`, which is the SAME detached node.
      //
      // So each candidate is tried in turn and skipped unless it is still in
      // the document. When none is reachable the owner's own last-resort takes
      // over (the diagrams gallery rescues to its list); the browser's fallback
      // to `<body>` remains the floor, and is now the case nobody can reach by
      // accident.
      const candidates = [latestRestoreTarget.current?.current, previouslyFocused];
      for (const target of candidates) {
        if (target && target.isConnected && typeof target.focus === "function") {
          target.focus();
          return;
        }
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
      const stops = walkTabs ? walkStops(container) : focusableDescendants(container);
      const initial = initialFocusRef?.current ?? stops[0] ?? container;
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

    function onWalkKeyDown(event: KeyboardEvent) {
      // A dialog nested inside this one has already moved focus for this Tab.
      if (event.key !== "Tab" || event.defaultPrevented) return;
      event.preventDefault();
      const stops = walkStops(container as HTMLElement);
      if (stops.length === 0) return;
      nextStop(stops, document.activeElement, event.shiftKey).focus();
    }

    const listener = walkTabs ? onWalkKeyDown : onKeyDown;
    container.addEventListener("keydown", listener);
    return () => {
      container.removeEventListener("keydown", listener);
    };
    // Runs once on mount, plus once per reattachKey change (container node
    // recreated — see the parameter doc). Re-running on ref IDENTITY is still
    // deliberately avoided: refs don't trigger renders, and the guarded
    // initial-focus above makes any extra run a no-op for focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reattachKey]);
}
