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
 * `hover:bg-accent-hover`, 44px tap target). The trigger button is
 * understated (text-only, underline) on the crew footer; the admin
 * surface uses the more prominent accent fill.
 */
import { useState } from "react";

import {
  ReportModal,
  type ReportAutocapture,
  type ReportSurface,
} from "@/components/shared/ReportModal";

export type ReportButtonProps = {
  surface: ReportSurface;
  /** Stable per-button-instance id; the sessionStorage scope. */
  surfaceId: string;
  showId: string;
  autocapture?: ReportAutocapture;
  /** Override the default label for this surface. */
  label?: string;
  /** Visual variant; defaults derived from surface. */
  variant?: "text" | "accent";
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

type RingOffset = "bg" | "surface" | "warning-bg" | "surface-sunken";

const DEFAULT_LABEL: Record<ReportSurface, string> = {
  crew: "Something looks wrong?",
  admin: "Report this",
};

const DEFAULT_VARIANT: Record<ReportSurface, "text" | "accent"> = {
  crew: "text",
  admin: "accent",
};

// Full literal class strings so Tailwind v4 JIT resolves each (no dynamic interpolation).
const RING_OFFSET_CLASS: Record<RingOffset, string> = {
  bg: "focus-visible:ring-offset-bg",
  surface: "focus-visible:ring-offset-surface",
  "warning-bg": "focus-visible:ring-offset-warning-bg",
  "surface-sunken": "focus-visible:ring-offset-surface-sunken",
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

  // Text variant is the quiet footer affordance — keeps the crew page's
  // primary hierarchy intact while remaining discoverable. Accent
  // variant is the admin-side prominent CTA — Doug should see it as a
  // first-class control on the staged-review card.
  const className =
    effectiveVariant === "accent"
      ? `inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${offsetClass}`
      : `inline-flex min-h-tap-min items-center rounded-sm px-3 py-2 text-sm font-medium text-text-subtle underline underline-offset-2 transition-colors duration-fast hover:text-text focus-visible:outline-none focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${offsetClass}`;

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
        onClick={() => setOpen(true)}
        className={className}
      >
        {effectiveLabel}
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
