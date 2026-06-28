"use client";

/**
 * components/admin/wizard/Step3DetailsDialog.tsx
 *
 * The Step-3 review card's "More" details overlay. It replaced the old inline
 * height-morph breakdown panel with a responsive disclosure:
 *
 *   - <640px (mobile): a bottom SHEET that rises from the bottom edge
 *     (translateY only — never an animated layout property, DESIGN.md §5.4).
 *   - >=640px (desktop): a centered modal POPUP that fades + lifts in.
 *
 * Both share one shell (the established ReportModal topology): a tap-out scrim
 * plus a focus-trapped `role="dialog" aria-modal="true"` panel. Focus
 * management — initial focus on the close button, Tab-trap, restore-to-trigger
 * on close — is the shared `useDialogFocus` hook (lib/a11y/dialogFocus.ts);
 * Escape and the scrim both close. Background scroll is locked while open. The
 * rise / pop / scrim-fade live in app/globals.css ([data-step3-details-panel] /
 * [data-step3-details-scrim]) and collapse to instant under the reduced-motion
 * media query (no entrance animation for those users).
 *
 * Presentational only: it renders whatever breakdown `children` the card passes
 * (the crew/schedule/rooms/hotels column flow + the warnings panel) and owns no
 * data. The card mounts it ONLY while open (`{open ? <Step3DetailsDialog/> :
 * null}`), so a closed card has no breakdown in the DOM at all — its focusable
 * controls are simply absent, not merely `inert`.
 *
 * Tokens only (DESIGN.md §10): the scrim is the dedicated `bg-overlay-scrim`
 * token; no hardcoded hex / ms / px.
 */
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";

export function Step3DetailsDialog({
  dfid,
  title,
  onClose,
  children,
}: {
  dfid: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const headingId = useId();

  // Initial focus → close button; Tab-trap inside the panel; restore focus to
  // the "More" trigger on unmount. (WCAG 2.4.3 / 2.1.2 — shared hook.)
  useDialogFocus(panelRef, closeRef);

  // Lock background scroll while the overlay is open; restore the prior value on
  // close/unmount (the card unmounts this component to close).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape closes. The focus hook traps Tab but defers Esc to the dialog
  // (lib/a11y/dialogFocus.ts contract). Listen on document so the key is caught
  // wherever focus currently sits inside the trap.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid={`wizard-step3-card-${dfid}-details-dialog`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      {/* Scrim — tap-out closes. A bare, AT-hidden button: pointer-only
          (tabIndex -1, aria-hidden so a screen reader doesn't hear a second
          "Close" alongside the real close button); Escape + the close button are
          the keyboard/AT exits. */}
      <button
        type="button"
        data-testid={`wizard-step3-card-${dfid}-details-backdrop`}
        data-step3-details-scrim=""
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-overlay-scrim"
      />

      {/* `items-stretch` so the header + scrollable body fill the panel's full
          width (this repo's Tailwind v4 does NOT default `.flex` to
          align-items:stretch — every parent→child dimension is stated). */}
      <div
        ref={panelRef}
        data-step3-details-panel=""
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col items-stretch rounded-t-md bg-surface text-text shadow-(--shadow-tile) sm:max-h-[80vh] sm:rounded-md"
      >
        {/* Mobile sheet grabber — affordance only (no drag wired), hidden >=sm. */}
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-pill bg-border sm:hidden"
        />

        <header className="flex shrink-0 items-start justify-between gap-4 px-tile-pad py-3 sm:pt-4">
          <h3
            id={headingId}
            className="min-w-0 wrap-break-word text-base font-semibold text-text-strong"
          >
            {title}
          </h3>
          <button
            ref={closeRef}
            type="button"
            data-testid={`wizard-step3-card-${dfid}-details-close`}
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        {/* Scrollable body — the breakdown overflows into internal scroll rather
            than growing the panel past the viewport (max-h on the panel). */}
        <div
          data-testid={`wizard-step3-card-${dfid}-breakdown`}
          className="min-h-0 flex-1 overflow-y-auto px-tile-pad pb-tile-pad"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
