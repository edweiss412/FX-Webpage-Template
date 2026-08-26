"use client";

/**
 * components/admin/ReSyncButton.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Per-show "Re-sync" CTA mounted at the top of the show review modal
 * (`/admin?show=<slug>`).
 * POSTs to §A's manual-sync route (Pin-stop 2 extension @ ddafda3):
 *
 *   POST /api/admin/sync/[slug]
 *
 * Errors render through <ErrorExplainer surface="admin" /> using the
 * §12.4 catalog so no raw codes leak into the DOM (invariant 5).
 *
 * Manual sync acquires the admin/blocking show lock (`tryOnly: false`)
 * and FINALIZE_OWNED_SHOW arms inside that locked transaction. A
 * successful sync ends with router.refresh() so the parse panel reads
 * fresh `pending_syncs` rows on the next render.
 */
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";

import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { type Rect } from "@/lib/popover/position";
import { placeWithinVisibleViewport } from "@/lib/popover/place";
import { withNaturalSize } from "@/lib/popover/naturalSize";
import { createRafCoalescer } from "@/lib/popover/rafCoalescer";
import { isVisualViewportEngine } from "@/lib/popover/viewport";
import { requestShowSync } from "@/lib/admin/syncRequest";
import { cn } from "@/lib/ui/cn";

export type ReSyncButtonProps = {
  slug: string;
  /** The element all three overlays are placed against, supplied by
   *  `StatusStrip` from its own root. This component's root is a FRAGMENT, so
   *  it generates no box and can reach nothing above itself — which is exactly
   *  why the anchor has to be handed down rather than discovered. Optional, so
   *  a consumer that supplies none leaves the overlays unpositioned and
   *  visible rather than placed against something meaningless. */
  anchorRef?: RefObject<HTMLElement | null>;
};

// ── modal-header-reconciliation §6.7: the strip is this component's ONLY
// consumer ───────────────────────────────────────────────────────────────────
//
// There is deliberately no `surface` mode prop. The two former render sites
// (OverviewSection) are both removed by §4.3's ratified amendment, so a "flow"
// arm would be dead on arrival — unreachable API, untestable branch. Everything
// below (fragment root, absolute panels, dismiss controls) is simply what this
// component IS now, not one mode of two.

/** Labels (§6.7). The idle label shortened from "Re-sync from Drive" when the
 *  control moved into the horizontal strip; the help-label registry row moved
 *  with it (tests/help/_uiLabelExceptions.ts). */
const IDLE_LABEL = "Re-sync";
const PENDING_LABEL = "Syncing…";

/**
 * All THREE result surfaces are PLACED against the strip root and portaled into
 * the popover host (spec 2026-08-25-review-modal-strip-dock §3.2a). They used to
 * anchor to the BAND: the component's root is a fragment, so it generates no box,
 * and CSS resolved their containing block to the nearest positioned ancestor —
 * the subheader band. The fragment is still the reason they cannot find the
 * strip themselves, but it is now the reason `anchorRef` has to be HANDED DOWN
 * rather than the reason the band is used.
 *
 * `z-overlay` vs the publish popover's `z-banner` (PublishedToggle.tsx) is a RULE, not a
 * default: both anchor to the same band and are independently triggerable, and
 * an unspecified z-index can leave the shrink confirm rendered UNDERNEATH the
 * popover while focus sits on "Keep current version" — reachable but obscured,
 * defeating the WCAG 2.4.3 intent the focus management exists for.
 *
 * The panels reserve no layout space by design (an in-flow panel would reflow
 * the band and shove the body down mid-action). The height cap + internal
 * scroll are what keep that from becoming an obscured-content bug.
 *
 * NO `mt-*`: the panel ABUTS the band's bottom edge, so it reads as attached to
 * the strip rather than floating free over the rail. (Both overlays now take the
 * placement module's `GAP`, so what used to be a DIFFERENCE between them —
 * PublishedToggle carried `mt-1` and these abutted — is a thing they share.
 * T-OVERLAY pins the gap to within 1px on whichever side the module picks.)
 */
const OVERLAY_PANEL = cn(
  "absolute z-overlay w-full max-h-[min(50vh,20rem)] overflow-y-auto rounded-sm border p-3 shadow-tile",
);

/** A real interactive control, not a glyph: 44px floor + a visible focus ring.
 *  Its accessible name is always branch-specific ("Dismiss sync error" /
 *  "Dismiss sync result") — a bare "Dismiss" is ambiguous once two overlay
 *  types exist. */
const DISMISS_BUTTON = cn(
  "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center rounded-sm text-lg leading-none transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
);

/**
 * Clears any placement a previous pass wrote. Shared by every early return that
 * cannot produce a new placement, so an overlay is never left wearing stale
 * coordinates, a stale cap, a stale side or a stale `visibility` with no signal.
 * Unpositioned and VISIBLE is AC-11's disposition for an unmeasurable geometry.
 */
function resetPlacement(body: HTMLElement): void {
  body.style.visibility = "";
  body.style.removeProperty("left");
  body.style.removeProperty("top");
  body.style.removeProperty("max-height");
  body.style.removeProperty("max-width");
  delete body.dataset["popoverSide"];
}

/**
 * Places ONE overlay against the strip, portaled into the popover host (spec
 * 2026-08-25-review-modal-strip-dock §3.2a).
 *
 * Called once PER OVERLAY, never once with a switch. `fitErrorRef`,
 * `fitShrinkRef` and `fitSuccessRef` are independent nodes with independent
 * mount lifetimes, and a single shared effect would place whichever mounted
 * last while the other two kept stale coordinates.
 *
 * Local to this file on purpose. The four existing consumers of the placement
 * core (HoverHelp, ShareHub, AnchoredPortal, PublishedToggle) each own their
 * effect too — what is SHARED is the core itself, `withNaturalSize` and the
 * frame coalescer, which is what `_metaSharedHelperAdoption` pins. Extracting a
 * second cross-component placement hook is the fork
 * `_metaPopoverPlacementContract` exists to prevent.
 */
function usePlacedOverlay(active: boolean, anchorRef?: RefObject<HTMLElement | null>) {
  const hostRef = useContext(PopoverHostContext);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const applyPlacement = useCallback(() => {
    const body = bodyRef.current;
    // No parentElement fallback: the overlay is portaled, so its parent IS the
    // host, and anchoring to the host makes the trigger span the bounds — which
    // the core correctly calls unplaceable and would hide. Without an anchor
    // there is nothing honest to measure, so it stays unpositioned and VISIBLE.
    const trigger = anchorRef?.current ?? null;
    if (!body || !trigger) {
      // CLEARS, exactly as the degenerate path below does. Round 1 fixed that
      // path and left this one returning bare, which is the same defect one
      // early-return over: `anchorRef` is OPTIONAL, so an overlay can outlive
      // its anchor and keep stale coordinates, a stale cap and a stale side
      // with nothing signalled. Diff review round 2 caught the half-swept fix.
      if (body) resetPlacement(body);
      return;
    }
    const host = hostRef?.current ?? document.body;
    const toRect = (r: DOMRect): Rect => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
    });
    // A zero-area HOST is degenerate too, and guarding only the trigger and the
    // natural rect let it through: invalid bounds reach the core, which
    // correctly returns `kind: "hidden"`, and ALL FOUR overlays vanish — the
    // precise outcome AC-11 forbids for an unmeasurable geometry. Falling back
    // to `null` here means viewport-only bounds, which is the same disposition
    // a body-hosted overlay already gets and is measurable. (Round 2, 🔴.)
    const hostRaw = host === document.body ? null : host.getBoundingClientRect();
    const hostRectOrNull =
      hostRaw === null || hostRaw.width <= 0 || hostRaw.height <= 0 ? null : toRect(hostRaw);
    const triggerRect = trigger.getBoundingClientRect();
    const placement = withNaturalSize(body, (probe) => {
      const naturalRect = body.getBoundingClientRect();
      // Degenerate (SSR, jsdom): nothing was measured, so leave it alone and
      // visible rather than hiding a pending decision about the show's data.
      // WIDTH **OR HEIGHT**, on BOTH rects. Guarding width alone let a
      // zero-HEIGHT trigger or overlay through to the core, which correctly
      // calls it degenerate and returns `kind: "hidden"` — the exact opposite
      // of AC-11, which requires an unmeasurable geometry to stay VISIBLE and
      // unpositioned. Caught by cross-model diff review round 1, which probed
      // the core directly on both shapes.
      if (
        triggerRect.width <= 0 ||
        triggerRect.height <= 0 ||
        naturalRect.width <= 0 ||
        naturalRect.height <= 0
      )
        return null;
      return placeWithinVisibleViewport(window, {
        hostRect: hostRectOrNull,
        trigger: toRect(triggerRect),
        naturalSize: { width: naturalRect.width, height: naturalRect.height },
        wrappedHeightAt: probe.heightAtWidth,
        preferredSide: "bottom",
        align: "left",
        warnKey: body,
      });
    });
    if (placement === null) {
      // A degenerate measurement CLEARS any prior placement rather than
      // returning bare, for the reason resetPlacement documents.
      resetPlacement(body);
      return;
    }
    if (placement.kind === "hidden") {
      body.style.visibility = "hidden";
      delete body.dataset["popoverSide"];
      return;
    }
    body.style.visibility = "";
    body.dataset["popoverSide"] = placement.side;
    const isBodyHost = host === document.body;
    const hostRect = hostRectOrNull ?? { left: 0, top: 0 };
    const left = isBodyHost
      ? placement.viewport.x + window.scrollX
      : placement.viewport.x - hostRect.left - host.clientLeft + host.scrollLeft;
    const top = isBodyHost
      ? placement.viewport.y + window.scrollY
      : placement.viewport.y - hostRect.top - host.clientTop + host.scrollTop;
    body.style.left = `${left}px`;
    body.style.top = `${top}px`;
    // Both branches: withNaturalSize restores the PRIOR caps, so an uncapped
    // placement has to actively remove the one it put back.
    if (placement.maxHeight !== null) body.style.maxHeight = `${placement.maxHeight}px`;
    else body.style.removeProperty("max-height");
    if (placement.maxWidth !== null) body.style.maxWidth = `${placement.maxWidth}px`;
    else body.style.removeProperty("max-width");
  }, [anchorRef, hostRef]);

  useLayoutEffect(() => {
    if (!active) return;
    const coalescer = createRafCoalescer(applyPlacement);
    const schedule = () => coalescer.schedule();
    applyPlacement();
    window.addEventListener("resize", schedule);
    const vv = isVisualViewportEngine(window) ? window.visualViewport : null;
    vv?.addEventListener("scroll", schedule);
    vv?.addEventListener("resize", schedule);
    const host = hostRef?.current ?? null;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    if (observer && host) observer.observe(host);

    // The BODY is observed too, and PublishedToggle's banner deliberately does
    // not do this. That asymmetry is the point, and getting it wrong is what
    // diff review round 1 caught.
    //
    // The banner's content IS fixed at mount: one catalog string and a help
    // link, nothing that changes height while it is open. These three panels
    // are not. The shrink CONFIRM grows when armed — the component keeps
    // `heldShrink` mounted across the version-bound accept request and a
    // response can replace its `detail` — while `heldShrink != null` stays
    // true, so the effect above never reruns and the enlarged panel keeps
    // coordinates computed for the smaller one. Measured by the reviewer: the
    // core returns top 352 at 142px tall and top 234 at 260px, so the stale
    // coordinate overlaps the strip, the cap is stale, and NO diagnostic fires
    // because no placement call happens at all.
    //
    // That is precisely the case ShareHub keeps its body observer for — arming
    // Archive swaps a 44px row for a confirm block — and the T2 note that
    // dropped the observer said so about ShareHub while generalising the
    // banner's fixed-content property onto these three.
    //
    // scrollHeight, not the observed box: our own `max-height` write CHANGES
    // the box, so observing the box re-places forever. Same guard ShareHub uses.
    let lastScrollHeight = -1;
    const bodyObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            const el = bodyRef.current;
            if (el === null) return;
            if (el.scrollHeight === lastScrollHeight) return;
            lastScrollHeight = el.scrollHeight;
            schedule();
          })
        : null;
    if (bodyObserver && bodyRef.current) bodyObserver.observe(bodyRef.current);

    return () => {
      bodyObserver?.disconnect();
      observer?.disconnect();
      coalescer.cancel();
      window.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      vv?.removeEventListener("resize", schedule);
    };
  }, [active, applyPlacement, hostRef]);

  return bodyRef;
}

export function ReSyncButton({ slug, anchorRef }: ReSyncButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Re-sync quality gate (audit #3): when a re-sync would materially shrink the show, the server
  // HOLDS last-good and returns { outcome: "shrink_held", detail, heldModifiedTime } instead of
  // applying. We surface a confirm — the admin must explicitly accept the reduced version, which
  // re-POSTs a VERSION-BOUND acceptShrink so a stale confirm (Doug edited since) re-holds.
  const { announce } = useContext(UndoAnnounceContext);
  const [heldShrink, setHeldShrink] = useState<{
    detail: string;
    heldModifiedTime: string;
  } | null>(null);

  // A11y (WCAG 2.4.3) + accidental-accept safety: when the hold confirm appears, move focus to the
  // SAFE "Keep current version" control — never the destructive accept — so a keyboard user reaches
  // the region and an inadvertent Enter keeps last-good rather than clobbering it.
  const keepCurrentRef = useRef<HTMLButtonElement>(null);
  // C5 close focus (destructive-confirm pass R8, single-phase): "Keep current
  // version" unmounts the panel AND the focused safe button, so the cancel
  // handler focuses the still-mounted re-sync trigger FIRST, then dismisses.
  // No auto-revert exists (persistent panel), so no two-phase guard is needed.
  const triggerRef = useRef<HTMLButtonElement>(null);

  // One per overlay: each is an independent node with its own mount lifetime,
  // so they cannot share a single measured cap.
  // One placement per overlay, gated on the SAME condition that renders it —
  // matched term for term against the three ternaries below, not approximated.
  // A broader gate is harmless (the ref is null, so the effect returns early)
  // but a narrower one renders an overlay that is never placed, and a reader
  // who finds the two out of step cannot tell which way the mismatch runs.
  const fitErrorRef = usePlacedOverlay(errorCode != null, anchorRef);
  const fitShrinkRef = usePlacedOverlay(heldShrink != null && errorCode == null, anchorRef);
  const fitSuccessRef = usePlacedOverlay(successMessage != null && errorCode == null, anchorRef);
  const overlayHostRef = useContext(PopoverHostContext);
  // `createPortal` needs a DOM node, and a provider's ref is still null on the
  // first client commit — the same load-bearing second render HoverHelp.tsx:146-154
  // documents and ShareHub.tsx:252-258 takes.
  const [overlayMounted, setOverlayMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render; see above
  useEffect(() => setOverlayMounted(true), []);
  // Names for the two dismissable panels' role="group" wrappers, pointing at
  // the message node that also carries the live-region role.
  const errorMsgId = useId();
  const successMsgId = useId();
  useEffect(() => {
    if (heldShrink && !errorCode) keepCurrentRef.current?.focus();
  }, [heldShrink, errorCode]);

  // Shared POST helper. `accept` is set only by the "Apply reduced version" confirm — its presence
  // adds the version-bound acceptShrink body. NB: heldShrink is deliberately NOT cleared at the
  // start so the confirm (which hosts the accept button) stays mounted through the accept re-POST.
  const post = async (accept?: { expectedModifiedTime: string }) => {
    if (pending) return;
    setErrorCode(null);
    setSuccessMessage(null);
    setPending(true);
    try {
      // The request + branch classification live in lib/admin/syncRequest.ts so
      // the dashboard row menu decides `shrink_held` identically; the state,
      // focus and announcement choices below stay here.
      const outcome = await requestShowSync(slug, accept);
      if (outcome.kind === "held") {
        setHeldShrink({ detail: outcome.detail, heldModifiedTime: outcome.heldModifiedTime });
        // BL-ANNOUNCE-REGION-UNMOUNT-CLASS. The panel below is interactive —
        // it holds this decision's own buttons and takes focus — so it must
        // stay conditional AND must not be a live region: a reader would
        // otherwise hear the controls as part of the announcement. The
        // arrival is announced on the branch-stable channel instead.
        announce(`Sync paused for a decision. ${outcome.detail}`);
      } else if (outcome.kind === "success") {
        setHeldShrink(null);
        // BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS. ONE summary string feeds
        // both the card and the announcement, so the two cannot drift. The
        // card's own `role="status"` announced nothing — it is inserted
        // together with this text — which left the most common outcome of the
        // most common admin action silent for AT.
        setSuccessMessage(outcome.summary);
        announce(outcome.summary);
        router.refresh();
      } else {
        setHeldShrink(null);
        setErrorCode(outcome.code);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {/* Ghost, NOT accent (§6.7). This is a DEMOTION, not a reskin: moving the
          old <AccentButton> into the strip unchanged would put a second orange
          beside the publish toggle and contradict delta 4's orange budget
          (§4.2). AccentButton supplied `ref` / `disabled` / `aria-busy` /
          `data-testid` through props — each is restated here, because a raw
          <button> drops them silently and a trigger that merely LOOKS right is
          still clickable mid-flight and able to double-POST.
          `minWidthTap` → explicit min-h/min-w-tap-min (the mock's ~30px box is
          below the 44px floor); `ringOffset="bg"` → the band's surface;
          `selfStart` is DROPPED — correct for Overview's flex-col, wrong in a
          centered row. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => post()}
        disabled={pending}
        data-testid="admin-resync-button"
        aria-busy={pending}
        className="inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold text-text transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 max-sm:px-0 max-sm:ml-auto"
      >
        {/* Width reservation (§8, T-RESYNC-WIDTH). The trigger sits between the
            status line and an `ml-auto` Copy, so a naive label swap reflows the
            strip mid-action and slides Copy under the user's cursor. Both
            labels occupy the SAME grid cell, so the cell is always as wide as
            the wider of the two — no hardcoded min-w to drift when copy
            changes. The inactive label is aria-hidden AND `invisible`, so it
            contributes width but never reaches the accessible name.
            >=sm ONLY: below sm the mobile skin next door renders instead
            (spec 2026-07-24-strip-mobile-stacked-band §3 R2); whichever block
            is display:none is excluded from the accessible name. */}
        <span data-testid="admin-resync-desktop-label" className="max-sm:hidden">
          <span className="grid place-items-center">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 whitespace-nowrap"
            >
              {pending ? IDLE_LABEL : PENDING_LABEL}
            </span>
            <span className="col-start-1 row-start-1 whitespace-nowrap">
              {pending ? PENDING_LABEL : IDLE_LABEL}
            </span>
          </span>
        </span>
        {/* <sm: bordered 32px skin inside the 44px button. The BUTTON keeps its
            real min-h/min-w-tap-min rect (no pseudo-element hit games); the
            skin owns the mobile padding (button px-2 -> max-sm:px-0 above).
            Visible text IS the accessible name at this breakpoint: "Sync".
            Pending is carried by spin + aria-busy + disabled; the label never
            swaps, so nothing reflows. */}
        <span
          data-testid="admin-resync-mobile-label"
          className="hidden max-sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-border"
        >
          <RefreshCw
            aria-hidden="true"
            size={15}
            className={pending ? "animate-spin motion-reduce:animate-none" : undefined}
          />
          Sync
        </span>
      </button>
      {errorCode && overlayMounted
        ? createPortal(
            // role="alert" MOVED from this container to the message node below.
            // Adding the dismiss button puts a focusable control inside what used
            // to be the live region, which would announce the control as part of
            // the alert. role="group" is REQUIRED, not optional: aria-labelledby on
            // a bare <div> names it but gives assistive tech no role to attach the
            // name to, so it is not obliged to announce a named region.
            <div
              role="group"
              aria-labelledby={errorMsgId}
              ref={fitErrorRef}
              data-testid="admin-resync-error"
              className={`${OVERLAY_PANEL} flex items-start gap-2 border-border-strong bg-warning-bg text-warning-text`}
            >
              <div id={errorMsgId} role="alert" className="min-w-0 grow">
                <ErrorExplainer code={errorCode} surface="admin" />
                <HelpAffordance code={errorCode} />
              </div>
              <button
                type="button"
                aria-label="Dismiss sync error"
                data-testid="admin-resync-error-dismiss"
                onClick={() => {
                  // Focus the still-mounted trigger BEFORE unmounting the panel
                  // that holds the focused control (the C5 idiom, as on cancel).
                  triggerRef.current?.focus();
                  setErrorCode(null);
                }}
                className={`${DISMISS_BUTTON} focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>,
            // Portal CONTAINER choice, not render data: only read once
            // `overlayMounted` is true, so a provider's ref is populated. Same
            // escape HoverHelp.tsx:634 and ShareHub.tsx:1166 take.
            // eslint-disable-next-line react-hooks/refs -- portal target, see above
            overlayHostRef?.current ?? document.body,
          )
        : null}
      {heldShrink && !errorCode && overlayMounted
        ? createPortal(
            <div
              ref={fitShrinkRef}
              data-testid="admin-resync-shrink-confirm"
              // Watchpoint 9: NO neutral dismiss and NO outside-click-to-close.
              // This is not a notification, it is a pending decision about the
              // show's data; a neutral X would create a third, ambiguous outcome
              // ("I closed it — did it apply?"). "Keep current version" IS the safe
              // exit, which is why focus lands there on open.
              className={`${OVERLAY_PANEL} flex flex-col gap-2 border-border-strong bg-warning-bg text-warning-text`}
            >
              <p className="text-sm">
                This re-sync would reduce the show: {heldShrink.detail}. The last confirmed version
                is still live. Apply the reduced version anyway?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  ref={keepCurrentRef}
                  type="button"
                  onClick={() => {
                    // C5: focus the trigger BEFORE unmounting the panel that holds
                    // the currently-focused safe control.
                    triggerRef.current?.focus();
                    setHeldShrink(null);
                  }}
                  disabled={pending}
                  data-testid="admin-resync-keep-current"
                  className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-control-outline-tinted bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Keep current version
                </button>
                {/* Destructive-confirm recipe (spec R8): accepting a show-shrinking
                sync over last-good is a destructive confirm-go — inverted-amber
                C1 fill, plain button (not AccentButton). */}
                <button
                  type="button"
                  onClick={() => post({ expectedModifiedTime: heldShrink.heldModifiedTime })}
                  disabled={pending}
                  data-testid="admin-resync-accept"
                  aria-busy={pending}
                  className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Applying…" : "Apply reduced version"}
                </button>
              </div>
            </div>,
            // Portal CONTAINER choice, not render data: only read once
            // `overlayMounted` is true, so a provider's ref is populated. Same
            // escape HoverHelp.tsx:634 and ShareHub.tsx:1166 take.
            // eslint-disable-next-line react-hooks/refs -- portal target, see above
            overlayHostRef?.current ?? document.body,
          )
        : null}
      {successMessage && !errorCode && overlayMounted
        ? createPortal(
            // Success does NOT self-clear — `successMessage` is set above and
            // cleared only at the start of the NEXT post(); there is no timer, and
            // router.refresh() refreshes server data without touching local state.
            // In flow inside Overview that was tolerable; floating over the rail it
            // is not, so this branch gains an explicit dismiss. Same role split as
            // the error branch: the live region is the message node, never the
            // container that also holds the focusable control.
            <div
              role="group"
              aria-labelledby={successMsgId}
              ref={fitSuccessRef}
              data-testid="admin-resync-success"
              className={`${OVERLAY_PANEL} flex items-start gap-2 border-border bg-info-bg text-text-strong`}
            >
              {/* No `role="status"`: this node is inserted with its summary, so the
              attribute announced nothing. `run()` announces the same string
              through the channel. The id still names the group. */}
              <p id={successMsgId} className="min-w-0 grow text-sm">
                {successMessage}
              </p>
              <button
                type="button"
                aria-label="Dismiss sync result"
                data-testid="admin-resync-success-dismiss"
                onClick={() => {
                  triggerRef.current?.focus();
                  setSuccessMessage(null);
                }}
                className={`${DISMISS_BUTTON} focus-visible:ring-offset-2 focus-visible:ring-offset-info-bg`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>,
            // Portal CONTAINER choice, not render data: only read once
            // `overlayMounted` is true, so a provider's ref is populated. Same
            // escape HoverHelp.tsx:634 and ShareHub.tsx:1166 take.
            // eslint-disable-next-line react-hooks/refs -- portal target, see above
            overlayHostRef?.current ?? document.body,
          )
        : null}
    </>
  );
}
