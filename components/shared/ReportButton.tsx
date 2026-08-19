"use client";
/**
 * components/shared/ReportButton.tsx — M8 Task 8.4 (§B).
 *
 * Trigger button + modal-mount wrapper for the bug-report submit flow.
 * Two surfaces consume this component:
 *
 *   - Crew page footer (`components/layout/Footer.tsx`): surface="crew",
 *     label "Something looks wrong?". Mounts under the per-show footer
 *     so the crew member can report anything from the venue floor.
 *   - Admin staged-review card (`components/admin/StagedReviewCard.tsx`):
 *     surface="admin", label "Report this". One per staged row so Doug
 *     can flag a specific staged parse from the admin panel.
 *
 * The modal owns the idempotency-key lifecycle; this component only
 * controls open/close state. Per the resume-mount contract in
 * `ReportModal.tsx`, we render the modal CONDITIONALLY when open so
 * every reopen is a fresh mount whose `useState` lazy initializers
 * hydrate from `sessionStorage[fxav-report-attempt-${surfaceId}]`.
 *
 * `surfaceId` must be stable across mounts for the same logical surface
 * — sessionStorage uses it as the scope key. Callers should derive it
 * from a stable identifier (e.g., `footer-crew-${slug}` or
 * `admin-staged-${stagedId}`).
 *
 * Restrained accent palette — reuses the same Submit-button shape as
 * `components/admin/AlertBanner.tsx` (`bg-accent`, `text-accent-text`,
 * `hover:bg-accent-hover`, 44px tap target). The trigger button is secondary
 * (text-only, underline) on the crew footer and rests at `text-text` like any
 * other action target (DESIGN §1.1a, 2026-08-14); the admin surface uses the
 * more prominent accent fill.
 */
import { useState } from "react";

import {
  ReportModal,
  type ReportAutocapture,
  type ReportSurface,
} from "@/components/shared/ReportModal";
import { FlagGlyph } from "@/components/shared/FlagGlyph";
import { cn } from "@/lib/ui/cn";

export type ReportButtonProps = {
  surface: ReportSurface;
  /** Stable per-button-instance id; the sessionStorage scope. */
  surfaceId: string;
  /** Null for non-show-scoped surfaces (help). */
  showId: string | null;
  autocapture?: ReportAutocapture;
  /** Override the default label for this surface. */
  label?: string;
  /**
   * Visual variant; defaults derived from surface.
   *
   * `icon` is the crew footer's symbol-only form (UI spec §2.2, user-ratified
   * 2026-08-09): the visible copy is dropped and the glyph carries the
   * affordance. Both existing variants are untouched — a caller that does not
   * ask for `icon` renders exactly what it rendered before. The ACCESSIBLE NAME
   * is unchanged in every variant, so locators by role+name survive the switch
   * and a screen-reader user still hears the full invitation; the ratified
   * tradeoff is discoverability for sighted users, and it is a documented limit
   * (UI spec §4 limit 2), not an oversight.
   */
  variant?: "text" | "accent" | "icon";
  /**
   * Focus ring-offset color — MUST match the background this button renders on,
   * or the focus ring's 2px gap shows the wrong color. Defaults to the per-variant
   * value (accent → surface, text → bg). Pass e.g. "warning-bg"/"surface-sunken"
   * when the button sits on a tinted card (data-quality warning cards).
   */
  ringOffset?: RingOffset;
  /** Forwarded to ReportModal — when true, the freeform note is optional (Submit
   * enabled with an empty textarea). Use where the autocapture IS the content. */
  messageOptional?: boolean;
};

// `surface-raised` joined the set when the crew footer became a raised band
// (UI spec §2.2): the ring offset is a 2px GAP that paints the container's
// background, so an offset that does not match the container shows the wrong
// colour — the defect `tests/styles/noBareRingOffset.test.ts` exists to stop.
type RingOffset = "bg" | "surface" | "surface-raised" | "warning-bg" | "surface-sunken" | "info-bg";

const DEFAULT_LABEL: Record<ReportSurface, string> = {
  crew: "Something looks wrong?",
  admin: "Report this",
  help: "Report a recurring error",
};

const DEFAULT_VARIANT: Record<ReportSurface, "text" | "accent" | "icon"> = {
  crew: "text",
  admin: "accent",
  help: "accent",
};

// Full literal class strings so Tailwind v4 JIT resolves each (no dynamic interpolation).
const RING_OFFSET_CLASS: Record<RingOffset, string> = {
  bg: cn("focus-visible:ring-offset-bg"),
  surface: cn("focus-visible:ring-offset-surface"),
  "surface-raised": cn("focus-visible:ring-offset-surface-raised"),
  "warning-bg": cn("focus-visible:ring-offset-warning-bg"),
  "surface-sunken": cn("focus-visible:ring-offset-surface-sunken"),
  // The note-variant Callout on /help/errors paints bg-info-bg.
  "info-bg": cn("focus-visible:ring-offset-info-bg"),
};

export function ReportButton(props: ReportButtonProps) {
  const { surface, surfaceId, showId, autocapture, label, variant, ringOffset, messageOptional } =
    props;
  const [open, setOpen] = useState(false);

  const effectiveLabel = label ?? DEFAULT_LABEL[surface];
  const effectiveVariant = variant ?? DEFAULT_VARIANT[surface];
  // Ring-offset defaults to the historical per-variant value; callers on tinted
  // cards override it so the focus ring's gap matches the card background.
  const offsetClass =
    RING_OFFSET_CLASS[ringOffset ?? (effectiveVariant === "accent" ? "surface" : "bg")];

  // Text variant is the footer affordance — keeps the crew page's
  // primary hierarchy intact while remaining discoverable. Accent
  // variant is the admin-side prominent CTA — Doug should see it as a
  // first-class control on the staged-review card.
  // Full literal per branch so the Tailwind v4 JIT sees complete class names.
  // `hover:bg-surface-sunken`, NOT the toggle's `hover:bg-surface-raised`: this
  // button sits ON `surface-raised`, so that hover is a no-op in light (both
  // resolve to #ffffff) and in dark it flattens the button INTO the band. The
  // recipe is otherwise the shipped ThemeToggle one.
  // The `icon` run is the shipped ThemeToggle recipe (`ThemeToggle.tsx`, the
  // bordered 44x44 icon button) rather than a new treatment — the two controls
  // sat side by side in the footer until this arc moved the toggle to the
  // header, and a second icon-button vocabulary for the one that stayed is the
  // "same action looks different in two places" defect the product register
  // names.
  const className =
    effectiveVariant === "accent"
      ? `inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${offsetClass}`
      : effectiveVariant === "icon"
        ? `inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center rounded-sm border border-text-faint bg-surface text-text transition-colors duration-fast hover:border-text-subtle hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${offsetClass}`
        : `inline-flex min-h-tap-min items-center rounded-sm px-3 py-2 text-sm font-medium text-text underline underline-offset-2 transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${offsetClass}`;

  return (
    <>
      <button
        type="button"
        data-testid="report-button-trigger"
        data-surface={surface}
        // Surface the per-instance scope id into the DOM so the rendered footer
        // report metadata is observable WITHOUT opening the modal. The admin
        // preview-as footer overrides this to
        // `admin-preview-footer-<slug>-<crewId>` (CrewShell), and the
        // §9.3/report-routing contract is that the report files under that
        // surface id; a real-browser test asserts the override reaches the DOM
        // here (the surfaceId otherwise only existed inside the open modal +
        // sessionStorage, where it could not be inspected pre-interaction).
        data-surface-id={surfaceId}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={className}
        // The accessible name is the label in EVERY variant. In `icon` the label
        // is not rendered, so it has to arrive as `aria-label` or the control
        // would be nameless — and the existing e2e locators find this button by
        // role+name, so they keep resolving across the switch.
        {...(effectiveVariant === "icon" ? { "aria-label": effectiveLabel } : {})}
      >
        {effectiveVariant === "icon" ? <FlagGlyph className="size-4" /> : effectiveLabel}
      </button>
      {open ? (
        <ReportModal
          open={open}
          onOpenChange={setOpen}
          surface={surface}
          surfaceId={surfaceId}
          showId={showId}
          {...(autocapture ? { autocapture } : {})}
          {...(messageOptional ? { messageOptional } : {})}
        />
      ) : null}
    </>
  );
}
