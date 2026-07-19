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
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { computeFittedMaxHeight } from "@/lib/layout/fitWithinClip";

export type ReSyncButtonProps = {
  slug: string;
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
 * All THREE result surfaces anchor to the BAND, not the strip: the component's
 * root is a fragment, so it generates no box and these resolve their containing
 * block to the nearest positioned ancestor — the subheader band (`relative`,
 * ReviewModalShell.tsx), which is what gives them full-band width. The strip
 * root deliberately has no `relative` for exactly this reason.
 *
 * `z-50` vs the publish popover's `z-40` (PublishedToggle.tsx) is a RULE, not a
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
 * the strip rather than floating free over the rail. (PublishedToggle's popover
 * carries `mt-1`; that gap is wrong here, and T-OVERLAY pins the abut to within
 * 1px.)
 */
const OVERLAY_PANEL =
  "absolute inset-x-0 top-full z-50 max-h-[min(50vh,20rem)] overflow-y-auto rounded-sm border p-3 shadow-tile";

/**
 * Nearest ancestor that clips this node, or `null` when nothing does.
 *
 * Any non-`visible` overflow on either axis clips: the review-modal panel uses
 * `overflow-clip` (ReviewModalShell), and a scrolling ancestor clips just the
 * same. `overflow: clip` on ONE axis forces `clip` on the other in the used
 * value, so testing both axes and taking the first hit is sufficient.
 */
function findClippingAncestor(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el !== null; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (overflowX !== "visible" || overflowY !== "visible") return el;
  }
  return null;
}

/**
 * Caps an overlay so it cannot be cut off by a clipping ancestor.
 *
 * The panel that hosts these overlays clips (see `findClippingAncestor`), so
 * the CSS `max-h-[min(50vh,20rem)]` alone is not enough: at 375×667 the band's
 * bottom lands at 456 and the panel's at 667, so a 320px overlay loses 109px.
 * That is not merely a hidden tail — the overlay has its own `overflow-y-auto`,
 * so the last 109px of its scroll range sits in the hidden strip, and the
 * shrink confirm's decision buttons become unreachable at full scroll.
 *
 * Returns a callback ref: measurement has to happen once the node is in the
 * document, and the overlays mount and unmount with their own state.
 */
function useFitWithinClip() {
  // The node lives in a REF (the effect writes to its style, and the React
  // compiler refuses mutation of anything reached through state), while a
  // counter in STATE is what actually re-runs the effect: each overlay mounts
  // long after this component does — it appears when a sync resolves — so an
  // effect that keyed on the ref alone would run once with `null` and never
  // wire the observers up.
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [attachCount, setAttachCount] = useState(0);

  const apply = useCallback(() => {
    const el = nodeRef.current;
    if (el === null) return;

    // Cleared first so the CSS cap is what we measure, not last pass's result.
    el.style.maxHeight = "";
    const clip = findClippingAncestor(el);
    if (clip === null) return; // nothing clips: the CSS cap already governs

    const declaredCap = parseFloat(getComputedStyle(el).maxHeight);
    el.style.maxHeight = `${computeFittedMaxHeight({
      elementTop: el.getBoundingClientRect().top,
      clipBottom: clip.getBoundingClientRect().bottom,
      // `max-height: none` parses as NaN; Infinity means "only the clip binds".
      cap: Number.isFinite(declaredCap) ? declaredCap : Number.POSITIVE_INFINITY,
    })}px`;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (node === null) return;
    apply();

    // The band can grow (a wrapping header or strip pushes the anchor down)
    // and the panel's height is viewport-derived, so both need watching: a
    // ResizeObserver on the clip ancestor covers the panel, window resize
    // covers the viewport-unit cap.
    // Feature-detected, not assumed: a missing ResizeObserver must degrade to
    // "measured once on mount, re-measured on viewport resize", never throw
    // during render of the overlay it is trying to size (jsdom has no
    // ResizeObserver, and an unguarded `new ResizeObserver` there takes the
    // whole component down).
    const clip = findClippingAncestor(node);
    const observer =
      typeof ResizeObserver === "function" && clip !== null ? new ResizeObserver(apply) : null;
    if (observer !== null && clip !== null) observer.observe(clip);
    window.addEventListener("resize", apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [attachCount, apply]);

  return useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    // Bumped on detach too: the count is only an effect trigger, and a stale
    // observer on an unmounted overlay is exactly what the cleanup exists for.
    setAttachCount((n) => n + 1);
  }, []);
}

/** A real interactive control, not a glyph: 44px floor + a visible focus ring.
 *  Its accessible name is always branch-specific ("Dismiss sync error" /
 *  "Dismiss sync result") — a bare "Dismiss" is ambiguous once two overlay
 *  types exist. */
const DISMISS_BUTTON =
  "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center rounded-sm text-lg leading-none transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg";

// Friendly summary of `runManualSyncForShow`'s ProcessOneFileResult shapes
// (handoff §0 Pin-stop 2 contract). Plain-language so Doug doesn't read
// the raw enum on success.
function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") return "Sync complete.";
  const outcome = (result as { outcome?: unknown }).outcome;
  switch (outcome) {
    case "applied":
      return "Synced. Changes applied.";
    case "stage":
      return "Synced. A change is waiting for your review on this page.";
    case "skipped":
      return "Synced. Nothing new from Drive.";
    case "asset_recovery":
      return "Synced. Fetching linked files in the background.";
    case "hard_fail":
      return "Synced, but the latest edit couldn't be applied automatically. Review it on this page.";
    case "stale":
      return "Synced. A newer sync already finished; nothing changed.";
    case "revision_race":
      return "Synced, but the sheet changed mid-sync. We'll retry on the next sync.";
    case "source_gone":
      return "Sheet is no longer available in Drive.";
    case "parse_error":
      return "Synced, but part of the sheet couldn't be applied. Review the details on this page.";
    default:
      return "Sync complete.";
  }
}

export function ReSyncButton({ slug }: ReSyncButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Re-sync quality gate (audit #3): when a re-sync would materially shrink the show, the server
  // HOLDS last-good and returns { outcome: "shrink_held", detail, heldModifiedTime } instead of
  // applying. We surface a confirm — the admin must explicitly accept the reduced version, which
  // re-POSTs a VERSION-BOUND acceptShrink so a stale confirm (Doug edited since) re-holds.
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
  const fitErrorRef = useFitWithinClip();
  const fitShrinkRef = useFitWithinClip();
  const fitSuccessRef = useFitWithinClip();
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
      const res = await fetch(`/api/admin/sync/${encodeURIComponent(slug)}`, {
        method: "POST",
        ...(accept
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                acceptShrink: true,
                expectedModifiedTime: accept.expectedModifiedTime,
              }),
            }
          : {}),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        result?: unknown;
      };
      if (json.ok) {
        const result = json.result as
          | { outcome?: string; detail?: string; heldModifiedTime?: string }
          | undefined;
        if (result?.outcome === "shrink_held" && result.detail && result.heldModifiedTime) {
          setHeldShrink({ detail: result.detail, heldModifiedTime: result.heldModifiedTime });
        } else {
          setHeldShrink(null);
          setSuccessMessage(summarizeResult(json.result));
          router.refresh();
        }
      } else {
        setHeldShrink(null);
        setErrorCode(typeof json.error === "string" ? json.error : "SYNC_INFRA_ERROR");
      }
    } catch {
      setHeldShrink(null);
      setErrorCode("SYNC_INFRA_ERROR");
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
        className="inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
      >
        {/* Width reservation (§8, T-RESYNC-WIDTH). The trigger sits between the
            status line and an `ml-auto` Copy, so a naive label swap reflows the
            strip mid-action and slides Copy under the user's cursor. Both
            labels occupy the SAME grid cell, so the cell is always as wide as
            the wider of the two — no hardcoded min-w to drift when copy
            changes. The inactive label is aria-hidden AND `invisible`, so it
            contributes width but never reaches the accessible name. */}
        <span className="grid place-items-center">
          <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
            {pending ? IDLE_LABEL : PENDING_LABEL}
          </span>
          <span className="col-start-1 row-start-1 whitespace-nowrap">
            {pending ? PENDING_LABEL : IDLE_LABEL}
          </span>
        </span>
      </button>
      {errorCode ? (
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
            className={DISMISS_BUTTON}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
      {heldShrink && !errorCode ? (
        <div
          role="status"
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
            This re-sync would reduce the show: {heldShrink.detail}. The last confirmed version is
            still live. Apply the reduced version anyway?
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
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>
      ) : null}
      {successMessage && !errorCode ? (
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
          <p id={successMsgId} role="status" className="min-w-0 grow text-sm">
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
            className={DISMISS_BUTTON}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
