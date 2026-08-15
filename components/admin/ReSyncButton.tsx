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
import { useContext, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { useFitWithinClip } from "@/components/admin/useFitWithinClip";
import { requestShowSync } from "@/lib/admin/syncRequest";
import { cn } from "@/lib/ui/cn";

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
 * the strip rather than floating free over the rail. (PublishedToggle's popover
 * carries `mt-1`; that gap is wrong here, and T-OVERLAY pins the abut to within
 * 1px.)
 */
const OVERLAY_PANEL = cn(
  "absolute inset-x-0 top-full z-overlay max-h-[min(50vh,20rem)] overflow-y-auto rounded-sm border p-3 shadow-tile",
);

/** A real interactive control, not a glyph: 44px floor + a visible focus ring.
 *  Its accessible name is always branch-specific ("Dismiss sync error" /
 *  "Dismiss sync result") — a bare "Dismiss" is ambiguous once two overlay
 *  types exist. */
const DISMISS_BUTTON = cn(
  "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center rounded-sm text-lg leading-none transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
);

export function ReSyncButton({ slug }: ReSyncButtonProps) {
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
            className={`${DISMISS_BUTTON} focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
      {heldShrink && !errorCode ? (
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
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-text-faint bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>
      ) : null}
    </>
  );
}
