"use client";

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
 * components/admin/PublishedToggle.tsx (published-toggle spec §3.3)
 *
 * The persistent Published switch at the top of Share & access — the single publish
 * control on the show page (replaces the window-gated Undo auto-publish and the Held
 * Publish button). ON → `publish_show` (existing gates), OFF → `unpublish_show` (pure
 * unpublish: the crew link pauses; the SAME link works again when toggled back on).
 * Flips instantly in both directions (user decision D6 — no confirm dialog; flipping
 * back IS the undo).
 *
 * Mode boundaries (spec §3.3; archived pages never mount this component):
 *   Live                  → ON, enabled     Held → OFF, enabled
 *   Publishing… (¬pub)    → OFF, disabled   Live + finalize-owned → ON, disabled
 * The disable condition is `finalizeOwned` alone — a pending-changes finalize can own
 * a LIVE show (spec R2/R3), and mid-finalize flips must not race the apply.
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson, AutoPublishToggle.tsx:21-27):
 * the switch is the form SUBMITTER; it disables ONLY on useFormStatus().pending or
 * finalizeOwned — never synchronously in its own onClick. Typed refusals render
 * locally WITHOUT router.refresh() (the established lifecycle-button pattern — refreshing
 * would remount the island and wipe the copy, plan R10); success refreshes so the
 * server-rendered `published` flows back down.
 */
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useRouter } from "next/navigation";
import { createPortal, useFormStatus } from "react-dom";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { type Rect } from "@/lib/popover/position";
import { placeWithinVisibleViewport } from "@/lib/popover/place";
import { withNaturalSize } from "@/lib/popover/naturalSize";
import { createRafCoalescer } from "@/lib/popover/rafCoalescer";
import { isVisualViewportEngine } from "@/lib/popover/viewport";
import { cn } from "@/lib/ui/cn";

type LifecycleResult = { ok: true } | { ok: false; code: string };

const KNOWN_REFUSAL_CODES = new Set([
  "PUBLISH_BLOCKED_PENDING_REVIEW",
  "SHOW_ARCHIVED_IMMUTABLE",
  "FINALIZE_OWNED_SHOW",
]);

// Generic-retry copy — reused verbatim by the card (published-toggle-retry) and the inline
// popover so the string is byte-identical (curly apostrophe = U+2019, same as the card's &rsquo;).
// not-subject:M5-D8 — this is the generic codeless retry fallback (shown for infra_error /
// unmapped codes that have no catalog entry to route through messageFor); it is the same literal
// the card has always rendered inline, now centralized to one const so both variants stay identical.
const RETRY_COPY = "That didn’t go through. Refresh and try again.";

// Inline ERROR popover skin — a full-width banner PLACED BY THE MODULE
// (spec 2026-08-25-review-modal-strip-dock §3.2). It used to be a CSS-anchored
// child: `inset-x-0 top-full` resolved against the nearest positioned ancestor,
// which was the strip. That worked only while the strip sat at the TOP of the
// panel, since CSS anchoring cannot flip a banner to the other side when the
// room below runs out — and docking the strip to the panel floor removes the
// room below entirely.
//
// So positioning moved to `placeWithinVisibleViewport`, which picks the side,
// caps the height against the host, and hands back coordinates the effect
// below writes. What survives here is only the SKIN. `absolute` and
// `overflow-y-auto` stay deliberately: the overlay registry's recognizer
// qualifies an element that is positioned AND has an internal scroll
// (tests/components/admin/showpage/_popoverOverlayExtract.ts:63), so dropping
// either would silently drop this banner OUT of the registry it is being
// re-dispositioned in. `inset-x-0`, `top-full` and `mt-1` are gone — the module
// writes `left`/`top`, and `mt-1` would add 4px on top of its GAP.
//
// break-words caps long ErrorExplainer/HelpAffordance tokens so copy grows only
// vertically, never overflowing at 390px (§4.4 / §8.10d). This is ERROR-ONLY:
// errors are momentary. The finalize skin split off to the in-flow
// FINALIZE_CHIP below (CASP2-4 item 1, BL-CASP2-STRIP-POLISH) so it never
// overlays the rail content below the strip during the longer-lived finalize
// window.
const POPOVER_POSITION = cn(
  "absolute z-banner w-full max-h-[min(50vh,20rem)] overflow-x-hidden overflow-y-auto rounded-sm p-2 text-sm wrap-break-word shadow-tile",
);

// Inline FINALIZE hint — an IN-FLOW compact chip (a flex sibling of the switch inside the
// `inline-flex items-center gap-2` container), NOT an absolute overlay. `finalizeOwned` is a
// longer-lived server state, so a placed overlay would float over the panel's content for the
// whole window; an in-flow chip stays inside the strip's own flow (CASP2-4
// item 1). Calm sunken plate reads as a strip-chrome-adjacent signal, distinct from the strip's
// own bg-surface via the fill step; `border-border` matches the sibling strip badges (archived /
// alert), not the heavier `border-strong` the old full-width banner needed. whitespace-nowrap +
// shrink-0 keep it on one line.
const FINALIZE_CHIP = cn(
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border border-border bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-subtle",
);

export type PublishedToggleProps = {
  /** Slug, for stable identification of the bound action's subject (debug/test affordance). */
  slug: string;
  /** Server-computed current state (page.tsx — never null at this callsite). */
  published: boolean;
  /** Server-computed finalize ownership; disables the switch in BOTH published states. */
  finalizeOwned: boolean;
  /** Pre-bound (to this show's slug) setShowPublishedAction. */
  setPublished: (next: boolean) => Promise<LifecycleResult>;
  /** Presentation. "card" (default) = full bordered box w/ h3 + subline + in-flow error.
   *  "inline" = compact switch + "Published" label; refusal/finalize copy → anchored popover.
   *  "settings" = the inline arm made responsive for the strip (spec
   *  2026-07-24-strip-mobile-stacked-band §3 R1): below sm a full-width row
   *  with a heading + state sublabel; at ≥sm identical to "inline". */
  variant?: "card" | "inline" | "settings";
  /** The element the refusal banner is placed against, supplied by `StatusStrip`
   *  from its own root. Neither this component nor `ReSyncButton` can reach the
   *  strip on its own — this one is a grandchild and ReSyncButton's root is a
   *  fragment with no box — and CSS used to resolve it implicitly by walking up
   *  to the nearest positioned ancestor. The placement module takes a RECT, so
   *  someone has to hand it one, and the owner that renders both consumers is
   *  the honest place to own it. Rejected: querying the strip's test id from in
   *  here, which reads fine until two strips share a page — exactly what
   *  `tests/e2e/_skeletonParityHarness.tsx` does. Optional, and the `card` arm
   *  ignores it: that arm's error block is in flow and is never placed. */
  anchorRef?: RefObject<HTMLElement | null>;
};

export function PublishedToggle({
  slug: _slug,
  published,
  finalizeOwned,
  setPublished,
  variant = "card",
  anchorRef,
}: PublishedToggleProps) {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [genericError, setGenericError] = useState(false);

  const subline = finalizeOwned
    ? published
      ? "Changes are being finalized; the switch unlocks when they commit."
      : "A publish is finishing; the switch unlocks when it's done."
    : published
      ? "Crew link is active."
      : "Crew link is off; nobody can open this show.";

  // Shared by both variants — the switch is the form SUBMITTER; refusals render locally WITHOUT
  // router.refresh() (remount would wipe the inline popover / card copy, plan R10). B1 dispatch
  // safety is variant-agnostic: only the RENDERING of errorCode/genericError differs below.
  const formAction = async () => {
    setErrorCode(null);
    setGenericError(false);
    const result = await setPublished(!published);
    if (result.ok) {
      router.refresh();
      return;
    }
    if (KNOWN_REFUSAL_CODES.has(result.code)) setErrorCode(result.code);
    else setGenericError(true);
  };

  // ── Refusal-banner placement (spec 2026-08-25-review-modal-strip-dock §3.2) ──
  // All of this runs unconditionally, per the rules of hooks; the banner is only
  // rendered by the inline/settings arm, and the card arm's error block is in
  // flow and is never placed.
  const showError = errorCode != null || genericError;
  const hostRef = useContext(PopoverHostContext);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // `mounted` flips in an EFFECT rather than via a has-mounted hook, and the
  // second render is load-bearing: a provider's `panelRef.current` is still
  // null on the first client commit, so reading the host then would fall back
  // to document.body and never re-parent. HoverHelp.tsx:146-154 documents this
  // and ShareHub.tsx:252-258 takes the identical escape for the identical
  // reason; this is the third consumer of one pattern, not a new exception.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render; see above
  useEffect(() => setMounted(true), []);

  const applyPlacement = useCallback(() => {
    const body = bodyRef.current;
    // NO parentElement fallback, and the reason is the portal. Before the
    // migration the banner's parent WAS the strip, so falling back to it was
    // reasonable; it is now portaled into the host, so its parent IS the host.
    // Anchoring to the host makes the trigger span the bounds exactly, which
    // `computePopoverPlacement` correctly reports as unplaceable, and the
    // banner would be hidden — on the one surface where the operator most
    // needs to read why the publish was refused. Caught by
    // PublishedToggle.test.tsx's portal case, which asserted `visibility` and
    // got `hidden`.
    //
    // Without an anchor there is nothing honest to measure against, so the
    // banner is left UNPOSITIONED AND VISIBLE — the same disposition AC-11
    // gives a degenerate measurement, for the same reason.
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
    // A zero-area HOST is DEGENERATE — reset and stop. Round 2 made this fall
    // back to `null`, i.e. viewport bounds, and round 3 showed that trades one
    // failure for a worse one: the coordinate conversion below turns
    // `hostRectOrNull === null` into the offset `{left: 0, top: 0}`, which is
    // only correct when the host really IS the body. A zero-HEIGHT host at a
    // nonzero screen origin then places the overlay off by that origin, and the
    // result is `kind: "placed"`, so NEITHER sanctioned warning fires. Hidden is
    // bad; silently mispositioned with no signal violates the correct-or-
    // signalled bound outright.
    //
    // The honest disposition is the one AC-11 already gives an unmeasurable
    // geometry: we are portaled INTO this host, so its box is our coordinate
    // space, and a box we cannot measure is a space we cannot place in.
    const hostRaw = host === document.body ? null : host.getBoundingClientRect();
    if (hostRaw !== null && (hostRaw.width <= 0 || hostRaw.height <= 0)) {
      resetPlacement(body);
      return;
    }
    const hostRectOrNull = hostRaw === null ? null : toRect(hostRaw);
    // ONE snapshot serves both the bounds decision and the placement, so the
    // two can never disagree at the visible-slice boundary.
    const triggerRect = trigger.getBoundingClientRect();
    const placement = withNaturalSize(body, (probe) => {
      const naturalRect = body.getBoundingClientRect();
      // NO LAYOUT ENGINE (SSR, jsdom): every rect is zero-area, which the core
      // correctly calls degenerate and would have us hide. Hiding is right for
      // a real browser that measured an unplaceable anchor; it is wrong here,
      // where nothing was measured at all — it would take the refusal out of
      // the accessibility tree exactly when an operator needs to read it, and
      // out of every unit test. Leave it unpositioned and VISIBLE, which is
      // what ShareHub does at ShareHub.tsx:293-302.
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
    // BOTH branches, always: `withNaturalSize` RESTORES the prior caps on its
    // way out, so an uncapped placement has to actively remove the one the
    // helper just put back. Writing only the capped branch is a silent
    // stale-cap bug that survives every containment assertion.
    if (placement.maxHeight !== null) body.style.maxHeight = `${placement.maxHeight}px`;
    else body.style.removeProperty("max-height");
    if (placement.maxWidth !== null) body.style.maxWidth = `${placement.maxWidth}px`;
    else body.style.removeProperty("max-width");
  }, [anchorRef, hostRef]);

  // A LAYOUT effect: `applyPlacement` runs before paint, so the first frame is
  // already placed. A passive effect would paint one frame at the unplaced
  // position, which reads as a flash on the exact surface an operator is
  // staring at after a refusal.
  useLayoutEffect(() => {
    if (!showError) return;
    const coalescer = createRafCoalescer(applyPlacement);
    const schedule = () => coalescer.schedule();
    applyPlacement();
    window.addEventListener("resize", schedule);
    const vv = isVisualViewportEngine(window) ? window.visualViewport : null;
    vv?.addEventListener("scroll", schedule);
    vv?.addEventListener("resize", schedule);
    const host = hostRef?.current ?? null;
    // Feature-detected and never constructed when absent: jsdom has no
    // ResizeObserver, and an unguarded `new` takes the whole component down.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    if (observer && host) observer.observe(host);
    return () => {
      observer?.disconnect();
      coalescer.cancel();
      window.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      vv?.removeEventListener("resize", schedule);
    };
    // `showError` IS the re-apply key the fit hook took as an argument: the
    // banner mounts and unmounts with it, so no separate key is needed.
  }, [showError, applyPlacement, hostRef]);

  if (variant === "inline" || variant === "settings") {
    const isSettings = variant === "settings";
    const popoverId = `published-toggle-popover-${_slug}`;
    /** Names the scroll region from the error copy it wraps (see the banner). */
    const errorTextId = `${popoverId}-text`;
    const showFinalize = !showError && finalizeOwned;
    // Settings sublabel (spec §3 R1): finalize copy verbatim when locked,
    // else the crew-visibility consequence. Plain adjacent text — NO id and
    // NO describedby wiring (an IDREF-referenced element contributes its text
    // even while CSS-hidden, so wiring it would leak into the >=sm switch's
    // accessible description; spec R3 finding 1).
    const settingsSublabel = finalizeOwned
      ? subline
      : published
        ? "Visible to crew"
        : "Hidden from crew";
    return (
      <div
        data-testid="published-toggle-inline"
        className={
          isSettings
            ? "inline-flex items-center gap-2 max-sm:flex max-sm:w-full max-sm:min-h-tap-min max-sm:items-center max-sm:justify-between max-sm:gap-3"
            : "inline-flex items-center gap-2"
        }
      >
        <span
          className={`text-sm font-medium text-text-strong${isSettings ? " max-sm:hidden" : ""}`}
        >
          Published
        </span>
        {isSettings ? (
          <span className="hidden max-sm:flex max-sm:min-w-0 max-sm:flex-col">
            <span className="text-sm font-semibold text-text-strong">Published</span>
            <span
              data-testid="published-toggle-sublabel"
              className="truncate text-xs text-text-subtle"
            >
              {settingsSublabel}
            </span>
          </span>
        ) : null}
        <form action={formAction} className="contents">
          <SwitchButton
            on={published}
            disabled={finalizeOwned}
            describedBy={showFinalize ? popoverId : undefined}
          />
        </form>
        {showError && mounted ? (
          // PORTALED into the popover host — the review-modal panel — rather
          // than rendered here. The banner is placed against the STRIP but must
          // be bounded by the PANEL, and a child of the strip is clipped by
          // whatever the strip sits in. Falls back to document.body when no host
          // is provided, which is the standalone-page case.
          //
          // Deliberately NOT AnchoredPortal, which also portals: that component
          // targets document.body BY DESIGN, to escape the dashboard's
          // overflow-hidden rows. Inside this modal that would move the banner
          // out of the aria-modal dialog subtree, out of the focus trap and out
          // of the inert subtree. HoverHelp and ShareHub portal INTO the panel
          // through PopoverHostContext for exactly that reason.
          createPortal(
            <div
              id={popoverId}
              data-testid="published-toggle-popover"
              // A tabbable SCROLL REGION (spec §4.3): the placement module caps
              // the banner against the host, so its overflow has to be reachable,
              // and its catalog copy can be long enough to overflow.
              //
              // The region and the LIVE region are deliberately two nodes.
              // Collapsed onto one, an author name on the alert competes with the
              // alert's own contents for the announcement, and the operator can
              // hear a generic label instead of why the publish was refused.
              // `aria-labelledby` points at the error text itself, so the region's
              // name can never diverge from what is displayed.
              // `ReSyncButton` uses the same split.
              role="group"
              aria-labelledby={errorTextId}
              tabIndex={0}
              ref={bodyRef}
              className={`${POPOVER_POSITION} border border-border-strong bg-warning-bg text-warning-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset`}
            >
              <div id={errorTextId} role="alert" className="min-w-0">
                {errorCode ? (
                  <>
                    <ErrorExplainer code={errorCode} surface="admin" />
                    <HelpAffordance code={errorCode} />
                  </>
                ) : (
                  RETRY_COPY
                )}
              </div>
            </div>,
            // Portal CONTAINER choice, not render data: only read once
            // `mounted` is true (post-first-commit, so a provider's ref is
            // populated). Same escape HoverHelp.tsx:634 and ShareHub.tsx:1166
            // take for the identical call.
            // eslint-disable-next-line react-hooks/refs -- portal target, see above
            hostRef?.current ?? document.body,
          )
        ) : showFinalize ? (
          <span
            id={popoverId}
            data-testid="published-toggle-popover"
            className={isSettings ? `${FINALIZE_CHIP} max-sm:hidden` : FINALIZE_CHIP}
          >
            {/* Compact visible label (mode-dependent); the full explanation is the sr-only copy so
                the aria-describedby announcement + the S4 substring assertion carry the whole
                sentence without a long visible strip chip. */}
            <span aria-hidden="true">{published ? "Finalizing…" : "Publishing…"}</span>
            <span className="sr-only">{subline}</span>
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="published-toggle-row"
      className="flex items-start justify-between gap-3 rounded-sm border border-border bg-surface p-tile-pad"
    >
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-text-strong">Published</h3>
        <p
          data-testid="published-toggle-subline"
          className="mt-1 max-w-prose text-sm text-text-subtle"
        >
          {subline}
        </p>
        {errorCode ? (
          <div
            role="alert"
            data-testid="published-toggle-error"
            className="mt-2 rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
          >
            <ErrorExplainer code={errorCode} surface="admin" />
            <HelpAffordance code={errorCode} />
          </div>
        ) : null}
        {genericError ? (
          <p
            role="alert"
            data-testid="published-toggle-retry"
            className="mt-2 rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            {RETRY_COPY}
          </p>
        ) : null}
      </div>

      <form action={formAction} className="shrink-0 self-center">
        <SwitchButton on={published} disabled={finalizeOwned} />
      </form>
    </div>
  );
}

/**
 * Extracted so useFormStatus() runs inside a definite child of the <form> (React 19
 * requirement — AutoPublishToggle.tsx:106-111 precedent). ARIA switch reflecting `on`;
 * disables on form-pending or finalizeOwned, never synchronously in its own onClick.
 */
function SwitchButton({
  on,
  disabled,
  describedBy,
}: {
  on: boolean;
  disabled: boolean;
  /** Inline-only: id of the finalize-hint popover so a reading-cursor SR user hears why the
   *  disabled switch is locked (card mode passes nothing → attribute absent, byte-identical). */
  describedBy?: string | undefined;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-busy={pending}
      aria-label="Published"
      aria-describedby={describedBy}
      data-testid="published-toggle"
      disabled={isDisabled}
      className={cn(
        // before:* extends the hit area to the 44px tap-min floor (DESIGN.md --spacing-tap-min)
        // without growing the 28px visual track: 28 + 2×8 = 44.
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-fast before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60",
        on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-5 rounded-full bg-bg shadow-tile transition-transform duration-fast",
          on ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
