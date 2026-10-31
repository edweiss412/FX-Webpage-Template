"use client";

/**
 * components/crew/CrewSectionSheet.tsx: the compact crew page's section sheet
 * (crew page redesign spec §5.2).
 *
 * A bottom sheet over the home, below 1024px: full width below 640px, centred
 * at the panel max width from 640px up. It shows one section's server-rendered
 * body; the controller (`CrewSections`) owns which section, the URL and the
 * history calls, and hands every close path here one `onRequestClose`.
 *
 * Modal behavior, only while `modal` is true (the hydrated compact layout; the
 * server render and the wide layout get none of it): `role="dialog"`,
 * `aria-modal`, labelled by its title; focus to the title on open and back to
 * the opener on close; Tab trapped (`useDialogFocus`); the page behind `inert`;
 * body scroll locked through the shared reference-counted lock. Esc, the scrim
 * and a swipe are ignored while another `aria-modal="true"` dialog is open (the
 * agenda viewer, the diagram lightbox and the report modal render inside the
 * sheet and own their own Esc).
 *
 * Motion (spec §7): the sheet slides up and the scrim fades in at
 * `--duration-normal` / `--ease-out-quart`, and every close runs the same exit,
 * except a close the controller makes instant by bumping `presence` (a refresh
 * that took the open section's body away).
 * A drag on the header follows the pointer; released past the shared threshold
 * it closes (the exit continues from where the drag left it), released before
 * it springs back at `--duration-fast`. Reduced motion makes every step
 * instant. Nothing here leaves a transform on the panel at rest, so a nested
 * dialog's `position: fixed` still resolves against the viewport.
 *
 * The body is the section's size container (`@container`): the body's grids
 * read its width (`@min-crew-split:`), so at 446px they stay one column even
 * when the window is 1000px wide. `container-type: inline-size` adds no
 * containing block, so that nested `position: fixed` is unaffected.
 *
 * data-testid: crew-section-sheet-host, -sheet, -scrim, -dialog (role=dialog,
 * data-section), -panel (the drag layer), -grab, -body (the scroller).
 */

import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { CrewSectionTransition } from "@/components/crew/CrewSectionTransition";
import { DRAG_DISMISS_THRESHOLD_PX, DRAG_SLOP_PX } from "@/components/shared/sheetConstants";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import type { CrewSectionId } from "@/lib/crew/crewSections";
import { acquireScrollLock } from "@/lib/ui/scrollLock";

/** The open section, or null when the sheet is closed. */
export type CrewSheetSection = { id: CrewSectionId; label: string };

export interface CrewSectionSheetProps {
  section: CrewSheetSection | null;
  /** True once hydrated in the compact layout: trap focus, inert the page, lock scroll. */
  modal: boolean;
  /** The single close entry point for the button, scrim, Esc and swipe. */
  onRequestClose: () => void;
  /** The body scroller, so the controller can reset it on an in-sheet switch. */
  bodyRef?: RefObject<HTMLDivElement | null>;
  /**
   * The presence generation. A new value drops a departing sheet at once, with
   * no exit slide: the controller bumps it when a refresh took the open
   * section's body away (a lost entitlement, spec §7), so nothing of the old
   * body stays on the page while it slides out.
   */
  presence?: number;
  /**
   * Where focus goes on close when there is no opener to go back to: a deep link
   * opened the sheet with nothing focused, or the control that opened it has
   * left the page. Called at close time with the section being closed; null
   * leaves the floor to the browser. The controller answers with that section's
   * "All sections" row.
   */
  fallbackFocus?: ((id: CrewSectionId) => HTMLElement | null) | undefined;
  children?: ReactNode;
}

const TITLE_ID = "crew-section-sheet-title";

/** `--duration-normal` (220ms) on `--ease-out-quart`; DESIGN.md §5.5 rows. */
const SHEET_SLIDE = { duration: 0.22, ease: [0.25, 1, 0.5, 1] } as const;
/** Reduced motion: every sheet step is instant. */
const SHEET_INSTANT = { duration: 0 } as const;

/**
 * Elements the inert sweep leaves alone: they render nothing a user can reach.
 * `NEXT-ROUTE-ANNOUNCER` is Next's live region for client navigations, a child
 * of <body>: inerting it would drop it from the accessibility tree, so a
 * navigation started from inside the sheet would be announced into nothing.
 */
const NOT_INERTED = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "TEMPLATE",
  "NOSCRIPT",
  "NEXT-ROUTE-ANNOUNCER",
]);
/**
 * A status region marked with this attribute stays live under an open sheet: it
 * holds no control, and an inert subtree is dropped from the accessibility tree,
 * so inerting it would silence an announcement made while the sheet is up (the
 * controller's "line is gone" status, search spec §6.6).
 */
const LIVE_REGION_ATTR = "data-sheet-live-region";

/** True while a dialog other than `self` is open as a modal: it owns Esc and gestures. */
function anotherModalOpen(self: Element | null): boolean {
  return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((el) => el !== self);
}

export function CrewSectionSheet({
  section,
  modal,
  onRequestClose,
  bodyRef,
  presence = 0,
  fallbackFocus,
  children,
}: CrewSectionSheetProps) {
  const reduced = usePrefersReducedMotion() === true;
  const transition = reduced ? SHEET_INSTANT : SHEET_SLIDE;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // One generation per open-from-closed. A sheet that opens while the last one
  // is still sliding out (close, then a quick tap on another row) gets a fresh
  // presence: the departing frame is dropped there and then, so no frame ever
  // shows the new section's title over the old section's body, which the
  // reused frame did for as long as its body's crossfade took (critique F4).
  // An in-sheet switch stays one open, so its body still crossfades (spec §7).
  // Adjusted during render, so the new presence mounts in the commit that opens.
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(section !== null);
  if ((section !== null) !== wasOpen) {
    setWasOpen(section !== null);
    if (section !== null) setOpens((n) => n + 1);
  }

  return (
    <div ref={hostRef} data-testid="crew-section-sheet-host">
      {section !== null && modal ? (
        <SheetModalEffects
          sectionId={section.id}
          hostRef={hostRef}
          dialogRef={dialogRef}
          titleRef={titleRef}
          onRequestClose={onRequestClose}
          fallbackFocus={fallbackFocus}
        />
      ) : null}
      {/* Keyed by the controller's presence generation and the opens above: a
      new key remounts the presence and drops a departing frame without its exit.
      `initial` is false only for the first presence, the server render's: a
      deep-linked sheet is already up on hydration and must not slide in. Every
      later presence mounts with the sheet that opened it, which slides up. */}
      <AnimatePresence key={`${presence}:${opens}`} initial={opens !== 0}>
        {section !== null ? (
          <SheetFrame
            key="crew-section-sheet"
            section={section}
            transition={transition}
            dialogRef={dialogRef}
            titleRef={titleRef}
            bodyRef={bodyRef}
            onRequestClose={onRequestClose}
          >
            {children}
          </SheetFrame>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The open sheet's side effects. Rendered beside the frame rather than inside
 * it, so a close releases the page the moment it is requested instead of after
 * the exit slide.
 */
function SheetModalEffects({
  sectionId,
  hostRef,
  dialogRef,
  titleRef,
  onRequestClose,
  fallbackFocus,
}: {
  sectionId: CrewSectionId;
  hostRef: RefObject<HTMLDivElement | null>;
  dialogRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onRequestClose: () => void;
  fallbackFocus: ((id: CrewSectionId) => HTMLElement | null) | undefined;
}) {
  // The section and fallback as they stand at close, read by the cleanup below:
  // an in-sheet switch changes the section without re-running the open.
  const latest = useRef({ sectionId, fallbackFocus });
  useEffect(() => {
    latest.current = { sectionId, fallbackFocus };
  }, [sectionId, fallbackFocus]);

  // The page behind goes inert: every sibling along the path from the sheet to
  // <body>. Declared BEFORE useDialogFocus: React runs cleanups in declaration
  // order, and inerting an ancestor blurs the opener, so the opener is read
  // here first and focused here after the page is live again (the
  // ReviewModalShell ordering, memory #437 class).
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement && opener !== document.body ? opener : null;
    const inerted: HTMLElement[] = [];
    let node: Element | null = hostRef.current;
    while (node && node !== document.body && node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || !(sibling instanceof HTMLElement)) continue;
        if (NOT_INERTED.has(sibling.tagName) || sibling.hasAttribute("inert")) continue;
        if (sibling.hasAttribute(LIVE_REGION_ATTR)) continue;
        sibling.setAttribute("inert", "");
        inerted.push(sibling);
      }
      node = node.parentElement;
    }
    // The title takes focus here, without scrolling: on open the panel still
    // sits translated below the viewport, and a plain focus() lets WebKit
    // scroll the page behind to "reveal" it. useDialogFocus then finds focus
    // already inside and leaves it.
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      for (const el of inerted) el.removeAttribute("inert");
      // The opener when it is still on the page; otherwise the owner's fallback
      // for the section being closed. Without one, focus would land on the
      // departing title and fall to <body> when the frame leaves (audit P2-5).
      // The fallback also becomes the dialog hook's restore target, so its own
      // restore (which runs next) lands on the same element.
      const reachable =
        opener instanceof HTMLElement && opener !== document.body && opener.isConnected
          ? opener
          : (latest.current.fallbackFocus?.(latest.current.sectionId) ?? null);
      if (reachable?.isConnected) {
        openerRef.current = reachable;
        reachable.focus({ preventScroll: true });
      }
    };
  }, [hostRef, titleRef]);

  // Tab kept inside the dialog; on close, focus goes back to the opener read
  // above (the hook's own snapshot is taken after the title has focus).
  useDialogFocus(dialogRef, titleRef, undefined, { restoreTargetRef: openerRef });

  useEffect(() => acquireScrollLock(), []);

  // Esc closes, unless a dialog opened inside the sheet is the one it is for.
  const closeRef = useRef(onRequestClose);
  useEffect(() => {
    closeRef.current = onRequestClose;
  }, [onRequestClose]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || anotherModalOpen(dialogRef.current)) return;
      event.preventDefault();
      closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogRef]);

  return null;
}

function SheetFrame({
  section,
  transition,
  dialogRef,
  titleRef,
  bodyRef,
  onRequestClose,
  children,
}: {
  section: CrewSheetSection;
  transition: typeof SHEET_SLIDE | typeof SHEET_INSTANT;
  dialogRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  bodyRef: RefObject<HTMLDivElement | null> | undefined;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  // A departing sheet takes no input while it slides out.
  const isPresent = useIsPresent();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; maxDy: number } | null>(null);

  function settle(panel: HTMLDivElement) {
    panel.style.transition = "";
    panel.style.transform = "";
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("button")) return; // the close button taps, never drags
    if (anotherModalOpen(dialogRef.current)) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, maxDy: 0 };
    panel.style.transition = "none";
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    drag.maxDy = Math.max(drag.maxDy, Math.abs(dy));
    // Downward only: the sheet never rises above its resting place.
    panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      try {
        event.currentTarget.releasePointerCapture(drag.pointerId);
      } catch {
        /* capture already released */
      }
    }
    const dy = event.clientY - drag.startY;
    if (dy > DRAG_DISMISS_THRESHOLD_PX) {
      // The exit slide continues from the dragged offset.
      onRequestClose();
      return;
    }
    if (Math.max(drag.maxDy, Math.abs(dy)) <= DRAG_SLOP_PX) {
      settle(panel);
      return;
    }
    // Spring back at --duration-fast, then hand the panel back to the stylesheet.
    panel.style.transition = "transform var(--duration-fast) var(--ease-out-quart)";
    panel.style.transform = "translateY(0px)";
    if (
      getComputedStyle(panel)
        .transitionDuration.split(",")
        .every((d) => parseFloat(d) === 0)
    ) {
      settle(panel); // reduced motion: no transition runs, so no transitionend arrives
      return;
    }
    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== panel || ev.propertyName !== "transform") return;
      panel.removeEventListener("transitionend", onEnd);
      if (dragRef.current === null) settle(panel);
    };
    panel.addEventListener("transitionend", onEnd);
  }

  const closeName = `Close ${section.label.toLowerCase()}`;

  return (
    <motion.div
      data-testid="crew-section-sheet"
      className="fixed inset-0 z-sheet lg:hidden"
      inert={isPresent ? undefined : true}
    >
      <motion.div
        aria-hidden="true"
        data-testid="crew-section-sheet-scrim"
        className="absolute inset-0 bg-overlay-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
        onClick={() => {
          if (!anotherModalOpen(dialogRef.current)) onRequestClose();
        }}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        data-testid="crew-section-sheet-dialog"
        data-section={section.id}
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={transition}
      >
        <div
          ref={panelRef}
          data-testid="crew-section-sheet-panel"
          className="pointer-events-auto flex max-h-[90dvh] w-full flex-col rounded-t-lg border border-b-0 border-border bg-surface text-text shadow-popover sm:max-w-panel-max"
        >
          <div
            className="shrink-0 touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <div
              data-testid="crew-section-sheet-grab"
              aria-hidden="true"
              className="flex cursor-grab justify-center pt-2 pb-1"
            >
              <span className="h-1 w-10 rounded-pill bg-border" />
            </div>
            <div className="flex items-center gap-3 border-b border-border pr-3 pb-2 pl-5">
              <h2
                id={TITLE_ID}
                ref={titleRef}
                tabIndex={-1}
                className="min-w-0 flex-1 truncate text-lg font-semibold text-text-strong"
              >
                {section.label}
              </h2>
              <button
                type="button"
                aria-label={closeName}
                onClick={onRequestClose}
                className="inline-flex size-tap-min shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-text transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
          <div
            ref={bodyRef}
            data-testid="crew-section-sheet-body"
            className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
          >
            <CrewSectionTransition sectionId={section.id}>{children}</CrewSectionTransition>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
