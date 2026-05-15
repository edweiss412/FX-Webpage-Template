"use client";

/**
 * components/admin/ResolveAlertButton.tsx (M9 C4 / M5-D3)
 *
 * Two-tap inline confirmation for resolving an admin_alerts row, per
 * shape brief 2026-05-14-alert-banner.md §5.4. Three states:
 *
 *   idle     → [ Resolve ] button (primary accent).
 *              Click → confirm.
 *   confirm  → [ Confirm resolve ] (orange) + [ Cancel ] sibling.
 *              Click confirm → submits the form.
 *              Click Cancel → back to idle.
 *              3s of inaction → auto-revert to idle.
 *   resolving→ confirm button disabled, label "Resolving…".
 *              Until form action completes (page refresh).
 *
 * Why a client island instead of URL-param state (brief Open Question
 * 2)? AlertBanner mounts inside `app/admin/layout.tsx`, which is a
 * Server Component layout — Next.js layouts don't receive
 * `searchParams`. URL-param state would require either a client-side
 * hash fragment (no SSR symmetry) or threading state through every
 * page that mounts the layout. A small client island is the cleanest
 * fit for the inline-confirm UX, and it isolates JS to the ~30 lines
 * needed for the timer + state transitions.
 *
 * Server Action contract: parent <AlertBanner> renders the <form
 * action={resolveAdminAlertFormAction}> wrapper around this island
 * and provides a hidden `<input name="id" value={alertId} />`. This
 * island only renders the buttons; submit goes through the parent
 * form so the existing Server Action posture is preserved.
 *
 * The 3s auto-revert protects Doug from a misfired tap on a P0 alert
 * (brief §1 + §11): if he tapped Resolve and put his phone down to
 * call a cue, the state reverts to idle automatically.
 */
import { useEffect, useRef, useState } from "react";

const AUTO_REVERT_MS = 3_000;

type UiState = "idle" | "confirm" | "resolving";

export function ResolveAlertButton() {
  const [ui, setUi] = useState<UiState>("idle");
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the 3s auto-revert timer if the component unmounts (e.g.,
  // banner re-renders after an alert resolves elsewhere) or if the
  // user clicks Confirm/Cancel before it fires.
  const clearAutoRevert = () => {
    if (autoRevertTimerRef.current !== null) {
      clearTimeout(autoRevertTimerRef.current);
      autoRevertTimerRef.current = null;
    }
  };
  useEffect(() => clearAutoRevert, []);

  const onResolveClick = () => {
    clearAutoRevert();
    setUi("confirm");
    autoRevertTimerRef.current = setTimeout(() => {
      setUi((prev) => (prev === "confirm" ? "idle" : prev));
    }, AUTO_REVERT_MS);
  };

  const onCancelClick = () => {
    clearAutoRevert();
    setUi("idle");
  };

  // Confirm button submits the parent form. We mark the island as
  // "resolving" first so the disabled state + label change paint
  // before the page refresh re-mounts the banner.
  const onConfirmClick = () => {
    clearAutoRevert();
    setUi("resolving");
  };

  if (ui === "idle") {
    return (
      <button
        type="button"
        data-testid="admin-alert-resolve-button"
        onClick={onResolveClick}
        className="min-h-tap-min min-w-tap-min rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
      >
        Resolve
      </button>
    );
  }

  // confirm | resolving — both render the Confirm + Cancel pair; the
  // submit button is the type="submit" so the parent form fires the
  // Server Action.
  const isResolving = ui === "resolving";
  return (
    <div data-testid="admin-alert-confirm-row" className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        data-testid="admin-alert-confirm-resolve-button"
        onClick={onConfirmClick}
        disabled={isResolving}
        aria-busy={isResolving}
        className="min-h-tap-min min-w-tap-min rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent"
      >
        {isResolving ? "Resolving…" : "Confirm resolve"}
      </button>
      <button
        type="button"
        data-testid="admin-alert-cancel-button"
        onClick={onCancelClick}
        disabled={isResolving}
        // C4 R1: brief §5.5 requires Cancel meet the 44×44 tap target
        // floor. The visual chrome stays text-only (no border/fill — UX
        // intent is "secondary, recoverable") but the hit area is full
        // tap-min via inline-flex padding. Prevents Doug from missing
        // the cancel control on a glance-and-thumb interaction.
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-sm text-text-subtle underline-offset-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );
}
