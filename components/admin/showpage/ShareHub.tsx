"use client";

/**
 * components/admin/showpage/ShareHub.tsx
 *
 * The published review modal's share hub: one popover holding the crew URL,
 * Copy, the batched Email-crew rows, the two destructive share controls (rotate
 * share link / reset everyone's pick), and — in its own "Show" section — the
 * archive lifecycle control. Opened by either the primary "Share link" button
 * or the kebab; both drive the same popover.
 *
 * Two arms, selected by `archived`:
 *   - Not archived → primary reads "Share link"; crew-link section, Careful
 *     section, and (unless finalize-owned) a Show section holding Archive.
 *   - Archived     → primary RELABELS to "Show actions" and the popover holds
 *     nothing but the Show section's Unarchive; the share half is
 *     read-only-suppressed wholesale. Both triggers stay: the hub is
 *     Unarchive's only home (so the strip's group is unconditional —
 *     StatusStrip.tsx), and degrading to a bare kebab would hide the one way
 *     back behind a glyph in the state where it matters most.
 *
 * The lifecycle control is a busy-reporting child exactly like rotate and
 * reset — it reports through `onBusyChange`, so an in-flight archive gates
 * every dismissal path (§6) instead of unmounting its own outcome banner.
 *
 * Spec: docs/superpowers/specs/2026-07-20-share-hub-design.md
 *   §4 lifecycle close (deferred while busy) · §6 dismissal + busy contract ·
 *   §9 R1-R4 composition rules (executable in shareHub.test.tsx, not narrated).
 *
 * Geometry (spec docs/superpowers/specs/2026-07-24-sharehub-viewport-popover-
 * and-archive-copy.md §2.1; jsdom computes no layout, so none of it is provable
 * in a unit test — the Playwright sweep in admin-lifecycle-layout.spec.ts owns
 * it). The popover PORTALS into the ReviewModalShell panel via
 * PopoverHostContext and is positioned by `computePopoverPlacement`
 * (lib/popover/position.ts), which picks a side and a fitted max-height from
 * the room available inside that host.
 *
 * It used to be `absolute top-full right-0` against this component's own
 * `relative` root, with `max-w-[calc(100vw-2rem)]`. That anchoring is what
 * broke it: the host panel is `overflow-clip` (ReviewModalShell.tsx:623), which
 * is NOT a scroll container, and no ancestor between this popover and the
 * viewport scrolls either — so a body that overhung the panel stranded the tail
 * of its OWN scroll range below the clip edge, where no scroll position in any
 * container could reach it. The armed Archive confirm lived in that band and
 * was unreachable at every phone height measured (844/740/667/620/560).
 * Bounding placement by the host rect is what prevents that by construction.
 *
 * The same class was found and fixed for HoverHelp first (BL-HOVERHELP-PORTAL);
 * this hub was written in the old idiom afterwards and did not inherit it.
 * tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts is the
 * registry that makes the next such overlay fail loudly instead of silently.
 *
 * Elevation (spec 2026-07-20-share-hub-fidelity-fixes §3): the root is `relative`
 * always but `z-30` ONLY while open. `z-index: auto` establishes no stacking
 * context, so the header attention menu's `z-20` panel
 * (AttentionMenu.tsx:99) participates directly in the shared ancestor context;
 * an unconditional `z-30` here therefore painted this hub's two NON-POSITIONED
 * trigger buttons above that menu and stole its clicks. Gating the class on
 * `open` is the whole fix — PublishedReviewModal's attention wrapper is
 * deliberately left as a bare `relative`. A trigger overpaints the menu only
 * if it carries a z-index >= the menu's level (20): `relative`, `z-0`, `z-10`,
 * and `isolate` all paint below the menu's z-20 (CSS 2.1 Appendix E), so none
 * of those reintroduces the defect — only a trigger z-index >= 20 does. The
 * real guard is the T-HUB-ZORDER real-browser test; shareHub.test.tsx adds a
 * cheap class-level z >= 20 check.
 *
 * Close semantics mirror the shipped CrewRowActions popover (#499): a backdrop
 * button that closes without focus restore, and Escape that closes WITH focus
 * restore and calls stopPropagation — ReviewModalShell.tsx:238-245 listens for
 * Escape at the document level and closes the whole modal on any Escape
 * without inspecting defaultPrevented, so stopping propagation is what keeps
 * the review modal open.
 */

import { Camera, Link2, Mail, MoreHorizontal, MoreVertical } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  computePopoverPlacement,
  insetRect,
  intersectRects,
  VIEWPORT_INSET,
  type Rect,
} from "@/lib/popover/position";
import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { ArchiveShowButton } from "@/components/admin/ArchiveShowButton";
import { UnarchiveShowButton } from "@/components/admin/UnarchiveShowButton";
import { buildCrewLinkMailtos } from "@/app/admin/show/[slug]/crewLinkMailto";
import { PickerResetControl } from "@/app/admin/show/[slug]/PickerResetControl";
import { resolveOrigin } from "@/app/admin/show/[slug]/resolveOrigin";
import { RotateShareTokenButton } from "@/app/admin/show/[slug]/RotateShareTokenButton";
import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";
import { useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";
import { useViewerIsDeveloper } from "@/components/admin/dev/DeveloperFlagContext";
import { useDevCapture } from "@/components/admin/dev/DevCaptureControl";
import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";

/** How long dismissal stays gated on an in-flight action before the operator
 *  gets control back (see the `busyStuck` rationale below). Deliberately longer
 *  than any healthy round-trip on this surface. */
const BUSY_GATE_MAX_MS = 15_000;

/** The caret is a 10px rotated square (`size-2.5`), not the 12px triangle
 *  `lib/popover/position.ts` specifies — hence the §1.1 carve-out that keeps
 *  the hub's own horizontal caret math instead of `placement.caret`. */
const CARET_SIZE_PX = 10;
/** Min distance from a body corner to the caret box, so the square always sits
 *  on the straight edge run rather than a rounded corner. Mirrors
 *  `--radius-md`, the same value `CARET_EDGE_INSET` encodes for the triangle. */
const CARET_CORNER_INSET_PX = 12;

type LifecycleResult = { ok: true } | { ok: false; code: string };

export type ShareHubProps = {
  slug: string;
  showId: string;
  /** Drives the paused presentation and the crew-link arm; NOT a security gate. */
  published: boolean;
  /** Read-only lifecycle: the whole share half is suppressed and the Show
   *  section offers Unarchive instead of Archive. */
  archived: boolean;
  /** Finalize-owned ("Publishing…") window: the show is immutable, so the Show
   *  section is omitted entirely rather than rendering a disabled Archive. */
  finalizeOwned: boolean;
  crewEmails: readonly string[];
  showTitle: string;
  pickerCrew: PickerResetCrewRow[];
  /** Pre-bound (to this show's slug) Archive server action. */
  archiveAction: () => Promise<LifecycleResult>;
  /** Show-scoped Unarchive server action (called with `showId`). */
  unarchiveAction: (showId: string) => Promise<void>;
  /** Dev-capture (spec 2026-07-22 §4.3): snapshot thunk threaded from
   *  PublishedReviewModal via StatusStrip. Optional — absent outside the
   *  published modal composition; the capture row then bundles a null
   *  snapshot. Same name at every hop. */
  devCaptureSnapshot?: () => unknown;
};

export function ShareHub({
  slug,
  showId,
  published,
  archived,
  finalizeOwned,
  crewEmails,
  showTitle,
  pickerCrew,
  archiveAction,
  unarchiveAction,
  devCaptureSnapshot,
}: ShareHubProps) {
  const { token, applyRotated } = useShareToken();
  const [open, setOpen] = useState(false);
  const popoverId = useId();

  // One flag per child rather than a shared counter: the children report a
  // LEVEL (spec §6), so a repeated value is harmless and no missed edge can
  // drift a count into a permanently-inert popover.
  const [rotateBusy, setRotateBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  // A server action that never settles (network hang, a proxy that drops the
  // response after the mutation commits) would otherwise leave `busy` true
  // forever: all four dismissal paths inert AND Escape swallowed, so the
  // operator could not close the popover at all. Being unable to dismiss is a
  // worse failure than losing an outcome banner, so the gate is time-bounded —
  // past this window the operator gets control back even though the action is
  // still notionally in flight.
  const [busyStuck, setBusyStuck] = useState(false);
  const inFlight = rotateBusy || resetBusy || lifecycleBusy;
  const busy = inFlight && !busyStuck;

  useEffect(() => {
    if (!inFlight) return;
    const t = setTimeout(() => setBusyStuck(true), BUSY_GATE_MAX_MS);
    // Cleanup runs when the action settles (or the hub unmounts), which is
    // exactly when the bound should be re-armed for the next action.
    return () => {
      clearTimeout(t);
      setBusyStuck(false);
    };
  }, [inFlight]);

  const containerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Which trigger opened it — Escape restores focus there specifically, and
      the caret is anchored under it. */
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const caretRef = useRef<HTMLSpanElement>(null);
  /** Content height at the last placement. The body observer compares against
   *  it so our own `max-height` write cannot retrigger placement forever. */
  const lastContentHeightRef = useRef<number>(-1);

  // Portal host (spec §2.1.1). `mounted` flips in an EFFECT rather than via a
  // has-mounted hook: a provider's `panelRef.current` is still null on the
  // first client commit, so reading the host then would fall back to
  // document.body and never re-parent (HoverHelp.tsx:146-154 documents this).
  const hostRef = useContext(PopoverHostContext);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render; see above
  useEffect(() => setMounted(true), []);

  // Placement (spec §2.1.2). ALL geometry comes from computePopoverPlacement —
  // this component only measures rects and applies what it returns
  // (lib/popover/position.ts:5-8). The panel that hosts this popover is
  // `overflow-clip` (ReviewModalShell.tsx:623), which is NOT a scroll
  // container, so an overlay that overhangs it strands the tail of its own
  // scroll range where nothing can reach it. Bounding placement by the host
  // rect is what keeps that from happening.
  const applyPlacement = useCallback(() => {
    const body = panelRef.current;
    const trigger = containerRef.current;
    if (!body || !trigger) return;
    const host = hostRef?.current ?? document.body;
    const toRect = (r: DOMRect): Rect => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
    });
    const viewportRect: Rect = {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    // Body-host bounds degenerate to the viewport: an all-absolute page gives
    // document.body a zero-height rect, which would wrongly collapse bounds.
    const hostRect = host === document.body ? viewportRect : toRect(host.getBoundingClientRect());
    const bounds = insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET);

    // Natural size = class caps active, NO inline constraints. Cleared first so
    // we measure the CSS cap rather than the previous pass's result.
    body.style.maxHeight = "";
    body.style.maxWidth = "";
    const naturalRect = body.getBoundingClientRect();

    // NO LAYOUT ENGINE (SSR, jsdom): every rect is zero-area, which the
    // placement core correctly classifies as degenerate and would have us hide.
    // Hiding is right for a real browser that measured a genuinely unplaceable
    // anchor; it is wrong here, where nothing was measured at all — it would
    // make the dialog invisible to assistive tech and to every unit test. Leave
    // the popover unpositioned and visible instead, the same posture the
    // superseded caret measurement took for this case.
    const triggerRect = trigger.getBoundingClientRect();
    if (triggerRect.width === 0 || naturalRect.width === 0) return;
    const placement = computePopoverPlacement({
      trigger: toRect(triggerRect),
      naturalSize: { width: naturalRect.width, height: naturalRect.height },
      wrappedHeightAt: (w) => {
        body.style.maxWidth = `${w}px`;
        const h = body.getBoundingClientRect().height;
        body.style.maxWidth = "";
        return h;
      },
      bounds,
      preferredSide: "bottom",
      align: "right",
    });

    const caret = caretRef.current;
    if (placement.kind === "hidden") {
      // Degenerate/unlaid-out rects (SSR, jsdom, mid-unmount). Recover on the
      // next frame rather than writing NaN coordinates.
      body.style.visibility = "hidden";
      delete body.dataset["popoverSide"];
      if (caret) {
        caret.style.visibility = "hidden";
        delete caret.dataset["popoverSide"];
      }
      return;
    }

    body.style.visibility = "";
    body.dataset["popoverSide"] = placement.side;
    const isBodyHost = host === document.body;
    // Shared by body and caret so the two coordinate paths cannot drift.
    const toHostOffsets = (pt: { x: number; y: number }) => ({
      left: isBodyHost
        ? pt.x + window.scrollX
        : pt.x - hostRect.left - host.clientLeft + host.scrollLeft,
      top: isBodyHost
        ? pt.y + window.scrollY
        : pt.y - hostRect.top - host.clientTop + host.scrollTop,
    });
    const bodyOffsets = toHostOffsets(placement.viewport);
    body.style.left = `${bodyOffsets.left}px`;
    body.style.top = `${bodyOffsets.top}px`;
    if (placement.maxHeight !== null) body.style.maxHeight = `${placement.maxHeight}px`;
    if (placement.maxWidth !== null) body.style.maxWidth = `${placement.maxWidth}px`;

    // Caret keeps the hub's own 10px rotated-square visual and its
    // opener-centre horizontal math — the ratified §1.1 carve-out.
    // `placement.caret` is specified against a 12px triangle (CARET_WIDTH) and
    // would misalign a 10px square. The corner constraint it encodes is still
    // honoured by the clamp below.
    if (caret) {
      caret.style.visibility = "";
      caret.dataset["popoverSide"] = placement.side;
      const bodyRect = body.getBoundingClientRect();
      const opener = openerRef.current;
      const openerRect = opener?.getBoundingClientRect();
      const centreX =
        openerRect && openerRect.width > 0
          ? openerRect.left + openerRect.width / 2
          : bodyRect.right - 22;
      const half = CARET_SIZE_PX / 2;
      const minLeft = bodyRect.left + CARET_CORNER_INSET_PX;
      const maxLeft = bodyRect.right - CARET_CORNER_INSET_PX - CARET_SIZE_PX;
      const clampedLeft = Math.min(Math.max(centreX - half, minLeft), Math.max(minLeft, maxLeft));
      const caretTop = placement.side === "bottom" ? bodyRect.top - half : bodyRect.bottom - half;
      const caretOffsets = toHostOffsets({ x: clampedLeft, y: caretTop });
      caret.style.left = `${caretOffsets.left}px`;
      caret.style.top = `${caretOffsets.top}px`;
    }

    // Content height AFTER placing, so the body observer can tell a real
    // content change from the size change our own max-height write causes.
    lastContentHeightRef.current = body.scrollHeight;
  }, [hostRef]);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedule = () => {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyPlacement);
    };
    applyPlacement();
    window.addEventListener("resize", schedule);
    // The host can change height (the modal's own content moves the anchor).
    // Feature-detected and never constructed when absent: jsdom has no
    // ResizeObserver, and an unguarded construction takes the component down
    // (ReSyncButton.tsx:137-141 documents the same trap).
    const host = hostRef?.current ?? null;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    if (observer && host) observer.observe(host);

    // The BODY's own content changes too — arming Archive swaps a 44px row for
    // the confirm block (~477 -> 583 measured). Without this signal, a viewport
    // where the IDLE body fitted below keeps `side: "bottom"` with NO cap (the
    // placement core only sets one when nothing fits, lib/popover/position.ts:127-133),
    // and the grown body overhangs the clip edge again — the very defect this
    // portal migration closes, back in the one interaction it is about.
    //
    // Compared against CONTENT height, not box height: our own `max-height`
    // write changes the box on every pass, so observing the box alone would
    // re-place forever. `scrollHeight` is unaffected by the cap.
    const bodyObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            const node = panelRef.current;
            if (!node) return;
            if (node.scrollHeight === lastContentHeightRef.current) return;
            schedule();
          })
        : null;
    if (bodyObserver && panelRef.current) bodyObserver.observe(panelRef.current);
    return () => {
      bodyObserver?.disconnect();
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [open, applyPlacement, hostRef, published, archived]);

  const onRotateBusy = useCallback((b: boolean) => setRotateBusy(b), []);
  const onResetBusy = useCallback((b: boolean) => setResetBusy(b), []);
  const onLifecycleBusy = useCallback((b: boolean) => setLifecycleBusy(b), []);

  const url = token != null ? `${resolveOrigin()}/show/${slug}/${token}` : null;
  // The crew link is live only for a published show; an unpublished one keeps
  // its token but must not surface a copyable URL (spec §4).
  // `!archived` is defensive-in-depth: the archived arm renders no share half at
  // all, but a future edit that reintroduces one must not surface a live crew URL
  // for a read-only show.
  const linkActive = published && !archived && url != null;
  // Gated on `open`: the strip re-renders on every loader pass (relative-time
  // props churn), and batching the roster into mailto hrefs is real work that
  // nothing can observe while the popover is closed.
  const mailtos = useMemo(
    () => (open && linkActive ? buildCrewLinkMailtos({ emails: crewEmails, url, showTitle }) : []),
    [open, linkActive, crewEmails, url, showTitle],
  );

  // ── Dev capture (spec 2026-07-22 §2.2) ────────────────────────────────
  // Developer-only bundle capture. `busyRef` is the SYNCHRONOUS lockout: both
  // toggle handlers gate on it (rendered `capture.state` lags a commit and
  // cannot close the same-tick race — spec §2.4 amendment #3). The popover
  // close + two settle frames run INSIDE the busy window via `preCapture`
  // (amendment #2), so the share URL can never re-enter the frame.
  const viewerIsDeveloper = useViewerIsDeveloper();
  const capture = useDevCapture({
    target: () => document.querySelector<HTMLElement>("[data-review-modal-panel]"),
    request: { kind: "published", showId },
    clientSnapshot: devCaptureSnapshot ?? (() => null),
    filenameSeed: slug,
    preCapture: () => {
      setOpen(false);
      // Focus rescue (impeccable critique P3): the clicked capture row unmounts
      // with the popover; without this, keyboard focus drops to body.
      kebabRef.current?.focus();
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
  });
  const captureBusy = capture.state === "busy";

  const toggle = (which: "primary" | "kebab") => {
    // Dev-capture lockout FIRST (synchronous ref, not rendered state).
    if (capture.busyRef.current) return;
    // §6: every dismissal path is inert while a child is mid-flight. Closing
    // here would unmount the child — the mutation still lands (rotate would
    // kill the crew's current link) but its outcome banner would never render.
    if (open && busy) return;
    if (open) {
      setOpen(false);
      return;
    }
    openerRef.current = which === "primary" ? primaryRef.current : kebabRef.current;
    setOpen(true);
  };

  const closeWithFocus = () => {
    setOpen(false);
    openerRef.current?.focus();
  };

  // §4: a lifecycle change closes the hub — EXCEPT while a child is mid-flight,
  // where the close is DEFERRED until the action settles. Unmounting mid-flight
  // still completes the mutation but loses its outcome banner, so the operator
  // would rotate a share link (killing the crew's current URL) with no
  // confirmation it happened.
  //
  // "Lifecycle" is BOTH axes, not just publish: the hub now hosts the archive
  // control, so a successful Archive swaps the popover's entire contents
  // (share half gone, Archive → Unarchive). Keyed on `published` alone, the
  // popover would survive that swap and the operator's next tap would land on
  // a different control than the one they aimed at.
  const prevLifecycleRef = useRef({ published, archived });
  const deferredCloseRef = useRef(false);

  useEffect(() => {
    const prev = prevLifecycleRef.current;
    if (prev.published === published && prev.archived === archived) return;
    prevLifecycleRef.current = { published, archived };
    if (!open) return;
    if (busy) {
      deferredCloseRef.current = true;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
    // Restore focus, which the publish-only version of this effect did not need
    // to: that axis flips from the toggle OUTSIDE the panel, so focus was never
    // inside the subtree being unmounted. The archive axis flips from a control
    // INSIDE it — the operator confirms, the action commits, `archived` flips on
    // the refresh, and the panel disappears out from under their focus. Without
    // this, focus falls to <body> and a keyboard or SR user has to Tab from the
    // top of the modal (impeccable audit P1). The primary trigger renders in
    // both arms, so the restore target always exists.
    openerRef.current?.focus();
  }, [published, archived, open, busy]);

  // When the action settles, the deferred close is CANCELLED, not applied.
  //
  // Applying it here was self-defeating: `busy` clearing is the SAME transition
  // that mounts the outcome banner, so closing on it unmounted the banner after
  // roughly one paint and could swallow its live-region announcement — exactly
  // the harm the deferral exists to prevent. A completed destructive action
  // (a rotated link is already dead for the whole crew) outranks the
  // convenience of auto-closing on a lifecycle change, so the popover stays
  // open with its outcome visible and the operator dismisses it.
  useEffect(() => {
    if (busy) return;
    deferredCloseRef.current = false;
  }, [busy]);

  // Escape safety net. The panel's own onKeyDown only fires while focus is
  // INSIDE it, and this popover deliberately has no focus trap — so after
  // tabbing past the last control, Escape would reach the shell's document
  // listener (ReviewModalShell.tsx:238-245), which closes the ENTIRE review
  // modal on any Escape without checking defaultPrevented. Capture phase is
  // what makes the hub win: it runs before the shell's bubble-phase handler.
  useEffect(() => {
    if (!open) return;
    const onDocKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      setOpen(false);
      openerRef.current?.focus();
    };
    document.addEventListener("keydown", onDocKeyDown, true);
    return () => document.removeEventListener("keydown", onDocKeyDown, true);
  }, [open, busy]);

  // A role="dialog" must RECEIVE focus when it opens; without this, Tab from
  // the primary trigger reaches the kebab before the panel's own controls, and
  // screen-reader users are never moved into the dialog they just opened.
  // The panel itself takes focus (tabIndex={-1}) rather than the first control,
  // so the label is announced before the first action.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onPopoverKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    // stopPropagation is the load-bearing call: the shell's document listener
    // closes the whole modal on ANY Escape and never checks defaultPrevented.
    // Swallowed even while busy — closing the review modal instead of the
    // popover is strictly worse.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    closeWithFocus();
  };

  return (
    <div
      ref={containerRef}
      data-testid="share-hub-root"
      className={`relative flex items-center gap-2 max-sm:w-full ${open ? "z-30" : ""}`}
    >
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          data-testid="share-hub-backdrop"
          onClick={() => {
            if (!busy) setOpen(false);
          }}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      {/* The primary trigger renders in BOTH lifecycles, only its label changes.
          Archived drops the crew-link half of the popover, but it must NOT drop
          down to a bare kebab: Unarchive would then be reachable only by
          guessing that a three-dot glyph is its home, in the one state where
          the operator most needs a way back — and the hub does not even appear
          on an archived show today, so there is no learned position either
          (impeccable critique P1). A labelled trigger keeps it recognition,
          not recall. */}
      <button
        type="button"
        ref={primaryRef}
        data-testid="share-hub-primary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-disabled={captureBusy ? "true" : undefined}
        onClick={() => toggle("primary")}
        // NOT bg-accent, deliberately. DESIGN.md reserves the FXAV orange for
        // "this matters now" — and the band's accent set is contractually
        // EXACTLY {published-toggle, status-dot-live} (T-NO-ORANGE in
        // published-review-modal.layout.spec.ts). Share link is a routine,
        // always-available action, not a live-state signal, so an accent fill
        // here would both break that pin and dilute the one cue that means the
        // show is on air. The mock drew it orange; the project invariant wins.
        // The two arms differentiate by LABEL and weight instead.
        // Mobile split row (spec 2026-07-24-strip-mobile-stacked-band §3 R3):
        // flex-1 fills the band; no-wrap + shrink keeps R3 one 44px line even
        // when the dev-capture status competes for the row; border color drops
        // to border-border below sm (the §3 R3 skin; width stays 1px).
        className={
          published && !archived
            ? "inline-flex min-h-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring max-sm:flex-1 max-sm:justify-center max-sm:min-h-tap-min max-sm:rounded-sm max-sm:border max-sm:border-border max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden"
            : "inline-flex min-h-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-subtle transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring max-sm:flex-1 max-sm:justify-center max-sm:min-h-tap-min max-sm:rounded-sm max-sm:border max-sm:border-border max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden"
        }
      >
        {archived ? (
          <MoreHorizontal aria-hidden="true" size={15} />
        ) : (
          <Link2 aria-hidden="true" size={15} />
        )}
        {archived ? "Show actions" : published ? "Share link" : "Share link · paused"}
      </button>

      <button
        type="button"
        ref={kebabRef}
        data-testid="share-hub-kebab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-disabled={captureBusy ? "true" : undefined}
        // Not "More SHARE actions" any more: the popover also owns the archive
        // lifecycle control, and on an archived show that is ALL it owns.
        aria-label="More show actions"
        onClick={() => toggle("kebab")}
        className={`inline-flex size-tap-min items-center justify-center rounded-sm text-text-strong transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring max-sm:min-h-tap-min max-sm:min-w-tap-min max-sm:rounded-sm max-sm:border max-sm:border-border ${
          open ? "bg-surface-sunken" : "bg-transparent"
        }`}
      >
        <MoreVertical aria-hidden="true" size={18} />
      </button>

      {/* Dev-capture status (spec §2.2/§7.1): inline transient line after the
          kebab in the same strip row. Busy while in flight; error copy for 6 s
          on failure (the hook auto-clears). Dev-only surface, dev-only copy. */}
      {viewerIsDeveloper && capture.state !== "idle" ? (
        <span
          role="status"
          data-testid="share-hub-dev-capture-status"
          // max-w + truncate (impeccable critique P2): the strip row is no-wrap;
          // unbounded error copy collides with band content at 390px. Full text
          // is in the console by contract.
          className="ml-2 max-w-48 truncate text-xs text-text-subtle"
          title={
            capture.state === "busy"
              ? undefined
              : "Capture failed. Details are in the browser console."
          }
        >
          {capture.state === "busy"
            ? "Capturing the modal…"
            : "Capture failed. Details are in the browser console."}
        </span>
      ) : null}

      {/* Portaled into the ReviewModalShell panel via PopoverHostContext (spec
          §2.1.1), falling back to document.body where no provider exists. The
          panel host is deliberate: it keeps the dialog inside the shell's focus
          trap, aria-modal subtree and inert handling — the same reason the
          HoverHelp migration chose it. Placement (spec §2.1.2) bounds the body
          by that host's rect, so it can no longer overhang the panel's
          `overflow-clip` edge and strand its own scroll tail. */}
      {open &&
        mounted &&
        createPortal(
          <>
            <div
              id={popoverId}
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              // While a child is mid-flight every dismissal path is inert and
              // Escape is swallowed. Without this, an SR user pressing Escape
              // mid-archive gets no response and no explanation (impeccable audit).
              aria-busy={busy}
              aria-label={archived ? "Show actions" : "Share crew link and show actions"}
              data-testid="share-hub-popover"
              onKeyDown={onPopoverKeyDown}
              // max-h + overflow: the email rows are batched per 1900-char mailto
              // cap with no row limit, so a large roster could otherwise push the
              // destructive controls below the fold on a 390px phone.
              // Positioned by computePopoverPlacement: `left`/`top` (host
              // coordinates) and the fitted `max-height` are written inline by
              // applyPlacement. `max-h-[min(70vh,30rem)]` stays as the DECLARED cap
              // the placement core reads as its `cap` input. The old
              // `right-0 top-full mt-1.5 max-w-[calc(100vw-2rem)]` anchoring is
              // gone: it is what pinned the body to a spot that overhung the clip.
              className="absolute z-40 flex max-h-[min(70vh,30rem)] w-[308px] flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface p-2.5 shadow-popover focus-visible:outline-none"
            >
              {/* Share half — suppressed wholesale while archived (read-only): no
              URL, no Copy, no email rows, no rotate, no reset. What remains is
              the Show section below. */}
              {!archived ? (
                <>
                  <h3 className="px-0.5 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                    Crew link
                  </h3>

                  {linkActive ? (
                    <>
                      <div className="flex items-start gap-1.5">
                        <code
                          data-testid="admin-current-share-link-url"
                          className="min-w-0 flex-1 break-all rounded-sm bg-surface-sunken px-2 py-1 text-xs text-text-strong"
                        >
                          {url}
                        </code>
                        <ShareLinkCopyButton url={url} variant="accent" />
                      </div>
                      {mailtos.length > 1 && (
                        <p
                          data-testid="admin-current-share-link-email-note"
                          className="text-xs text-text-subtle"
                        >
                          Your crew list needs {mailtos.length} separate emails. Send each one;
                          addresses go in Bcc.
                        </p>
                      )}
                      {mailtos.map((m) => (
                        <a
                          key={m.batch}
                          href={m.href}
                          data-testid="admin-current-share-link-email-button"
                          className="flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          <Mail
                            aria-hidden="true"
                            size={16}
                            className="shrink-0 text-text-subtle"
                          />
                          {m.batchCount === 1
                            ? "Email this link to crew"
                            : `Email this link to crew (${m.batch} of ${m.batchCount})`}
                        </a>
                      ))}
                    </>
                  ) : published ? (
                    <p
                      data-testid="admin-current-share-link-unavailable"
                      role="status"
                      className="rounded-sm bg-surface-sunken px-2 py-1 text-sm text-text-subtle"
                    >
                      The share-link is unavailable right now. Refresh the page; if the problem
                      repeats, rotate to mint a new link.
                    </p>
                  ) : (
                    <p
                      data-testid="share-hub-paused-note"
                      className="rounded-sm bg-surface-sunken px-2 py-1.5 text-xs/relaxed text-text-subtle"
                    >
                      The crew link is paused while this show is unpublished. Publish to share it.
                      You can still rotate or reset below.
                    </p>
                  )}

                  <div className="h-px bg-border" />
                  <h3 className="px-0.5 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                    Careful
                  </h3>

                  <RotateShareTokenButton
                    showId={showId}
                    slug={slug}
                    isCrewLinkActive={linkActive}
                    onRotated={applyRotated}
                    onBusyChange={onRotateBusy}
                    compact
                    rowLabel="Rotate share link"
                    rowDescription="Old link stops working immediately"
                  />
                  <PickerResetControl
                    showId={showId}
                    crew={pickerCrew}
                    onBusyChange={onResetBusy}
                  />
                </>
              ) : null}

              {/* Show — the lifecycle control's single home, in BOTH directions.
              Deliberately its own section rather than folded into Careful:
              Careful is share-scoped (rotate the link, reset the picks), while
              this changes what the show IS.

              Omitted entirely during the finalize-owned "Publishing…" window
              (consolidated-admin-show-page §6): the show is immutable there, so
              rendering the heading with nothing under it would state a section
              that offers nothing. `archived` wins over `finalizeOwned` — an
              archived show is never finalize-owned (the loader forces it false),
              and Unarchive must stay reachable regardless. */}
              {archived || !finalizeOwned ? (
                <>
                  {!archived ? <div className="h-px bg-border" /> : null}
                  <h3 className="px-0.5 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                    Show
                  </h3>
                  {/* The armed confirm carries the ratified long consequence
                  sentence (destructive-confirm-pass §R7 keeps it), which in a
                  308px panel wraps to several lines and grows the section
                  downward. In the panel's own max-h scroller that growth can
                  push the confirm target past the fold on a 390px phone — the
                  venue-floor case — so the section scrolls itself back into
                  view on the arming tap. The ARMED CONFIRM is the scroll
                  subject, not this wrapper: once the sentence wraps, the
                  section can be taller than the remaining scroll port, and
                  `nearest` on the wrapper then moves nothing (impeccable audit
                  P3). Falls back to the wrapper before the confirm mounts. */}
                  <div
                    data-testid="share-hub-show-section"
                    // w-full is load-bearing, not cosmetic (spec §2.3): this div is
                    // a flex child of the fixed-width popover column, and this
                    // project's Tailwind v4 does NOT default flex children to
                    // cross-axis stretch — without it the section can shrink-wrap
                    // and the row's inner w-full chain resolves against a narrower
                    // box. The old px-0.5 inset is gone so the archive row's hover
                    // plane spans the same content width as the Careful rows.
                    className="w-full"
                    onClick={(e) => {
                      const el = e.currentTarget;
                      requestAnimationFrame(() => {
                        const confirm = el.querySelector(
                          '[data-testid="archive-show-confirm-button"]',
                        );
                        const target = confirm ?? el;
                        // jsdom implements no layout and no scrollIntoView, and this
                        // runs inside a rAF — where a throw is an UNCAUGHT exception
                        // that fails the run without failing any test (vitest exits
                        // 1 on `Errors`, reported separately from the passing
                        // count). Same typeof guard the modal's alert-deep-link
                        // scroll already uses.
                        if (typeof target.scrollIntoView !== "function") return;
                        target.scrollIntoView({ block: confirm ? "end" : "nearest" });
                      });
                    }}
                  >
                    {archived ? (
                      <UnarchiveShowButton
                        showId={showId}
                        unarchiveAction={unarchiveAction}
                        onBusyChange={onLifecycleBusy}
                      />
                    ) : (
                      <ArchiveShowButton
                        archiveAction={archiveAction}
                        compact
                        onBusyChange={onLifecycleBusy}
                        rowLabel="Archive show"
                        rowDescription="Crew links stop working immediately"
                      />
                    )}
                  </div>
                </>
              ) : null}

              {/* Developer section (spec §2.2, plan-review amendment #1):
              lifecycle-INDEPENDENT — outside the archived/finalize-owned
              branches above, gated on the developer flag alone (§7.3: the only
              visibility gate). Captures the modal + telemetry bundle. */}
              {viewerIsDeveloper ? (
                <>
                  <div className="h-px bg-border" />
                  <h3 className="px-0.5 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                    Developer
                  </h3>
                  <button
                    type="button"
                    data-testid="share-hub-dev-capture"
                    onClick={() => capture.run()}
                    className="flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Camera aria-hidden="true" size={16} className="shrink-0 text-text-subtle" />
                    Capture debug bundle
                  </button>
                </>
              ) : null}
            </div>

            {/* Caret notch (spec 2026-07-20-share-hub-fidelity-fixes §5).
                A SIBLING of the body, not a child: the body is
                `overflow-y-auto`, so a child would be clipped away and
                silently invisible. Rendered AFTER it because both are `z-40`
                and equal z-index resolves by TREE ORDER, not by the class —
                reorder these two and the body's border cuts through the notch.
                `pointer-events-none` because `aria-hidden` hides it from
                assistive tech but does NOT disable hit-testing: painted above
                the body and overlapping it, the caret would otherwise swallow
                clicks there and `panelRef.current.contains(target)` would
                classify them as OUTSIDE the dialog.
                Position is written by applyPlacement in the same host
                coordinate space as the body. Border faces flip with the placed
                side via data-attribute variants, so the diamond always points
                at the trigger (Tailwind cannot extract dynamic class strings,
                hence variants rather than a computed string). */}
            <span
              ref={caretRef}
              aria-hidden="true"
              data-testid="share-hub-caret"
              className="pointer-events-none absolute z-40 size-2.5 rotate-45 border-border bg-surface data-[popover-side=bottom]:border-t data-[popover-side=bottom]:border-l data-[popover-side=top]:border-r data-[popover-side=top]:border-b"
            />
          </>,
          // Portal CONTAINER choice, not render data: only read once `mounted`
          // is true (post-first-commit, so a provider's panelRef is populated);
          // the same escape HoverHelp.tsx:634 takes for the identical call.
          // eslint-disable-next-line react-hooks/refs -- portal target, see above
          hostRef?.current ?? document.body,
        )}
    </div>
  );
}
