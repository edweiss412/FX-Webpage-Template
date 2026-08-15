"use client";

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
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { useFitWithinClip } from "@/components/admin/useFitWithinClip";
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

// Inline ERROR popover positioning — the error/generic-retry skin is an absolutely-positioned
// FULL-STRIP-WIDTH banner (CASP2-2 fix, BL-CASP2-POPOVER-PROXIMITY). The inline container is
// intentionally NOT `relative`, so the popover's containing block is the nearest positioned
// ancestor — the sticky StatusStrip (`sticky` is a positioned element); `inset-x-0`/`top-full`
// render it as a banner spanning the strip's padding box just below it. A full-width banner reads
// as belonging to the strip (the pre-fix right-anchored max-w-60 box sat at a phantom right edge
// while a long title wrapped the toggle far-left). break-words caps long ErrorExplainer/
// HelpAffordance tokens so copy grows only vertically, never overflowing at 390px (§4.4 / §8.10d).
// This is ERROR-ONLY: errors are momentary. The finalize skin split off to the in-flow
// FINALIZE_CHIP below (CASP2-4 item 1, BL-CASP2-STRIP-POLISH) so it never overlays the rail
// content below the strip during the longer-lived finalize window.
const POPOVER_POSITION = cn(
  "absolute inset-x-0 top-full z-banner mt-1 overflow-x-hidden overflow-y-auto rounded-sm p-2 text-sm wrap-break-word shadow-tile",
);

// Inline FINALIZE hint — an IN-FLOW compact chip (a flex sibling of the switch inside the
// `inline-flex items-center gap-2` container), NOT an absolute overlay. `finalizeOwned` is a
// longer-lived server state, so an absolute banner would float over the rail content below the
// sticky strip for the whole window; an in-flow chip stays inside the strip's own flow (CASP2-4
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
};

export function PublishedToggle({
  slug: _slug,
  published,
  finalizeOwned,
  setPublished,
  variant = "card",
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

  // Caps the anchored refusal banner against the review-modal panel's clip edge.
  // Called unconditionally (rules of hooks); the ref is attached only in the
  // inline/settings arm, where the banner is an absolute overlay — the card
  // arm's error block is in-flow and cannot be clipped. The re-apply key is the
  // error state, because that is when the banner mounts (spec §4.3).
  const fitRef = useFitWithinClip(errorCode != null || genericError);

  if (variant === "inline" || variant === "settings") {
    const isSettings = variant === "settings";
    const popoverId = `published-toggle-popover-${_slug}`;
    /** Names the scroll region from the error copy it wraps (see the banner). */
    const errorTextId = `${popoverId}-text`;
    const showError = errorCode != null || genericError;
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
        {showError ? (
          <div
            id={popoverId}
            data-testid="published-toggle-popover"
            // A tabbable SCROLL REGION (spec §4.3): the banner is capped against
            // the review-modal panel's clip edge, so its overflow has to be
            // reachable, and its catalog copy can be long enough to overflow.
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
            ref={fitRef}
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
          </div>
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
