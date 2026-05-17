"use client";

/**
 * components/admin/ResolveAlertButton.tsx (M9 C4 / M5-D3, hardened M9-D-C4-1)
 *
 * Two-tap inline confirmation for resolving an admin_alerts row, per
 * shape brief 2026-05-14-alert-banner.md §5.4. Two local states +
 * one form-pending state:
 *
 *   idle     → [ Resolve ] button (primary accent).
 *              Click → confirm.
 *   confirm  → [ Confirm resolve ] (orange) + [ Cancel ] sibling.
 *              Click confirm → submits the form (useFormStatus.pending
 *              flips to true; controls disable; label becomes
 *              "Resolving…").
 *              Click Cancel → back to idle.
 *              3s of inaction → auto-revert to idle.
 *   pending  → derived from useFormStatus() inside the parent <form>.
 *              On happy path the page revalidates and the banner
 *              re-mounts. On failure (Supabase / RLS / network error
 *              where resolveAdminAlertFormAction returns without
 *              revalidatePath) pending flips back to false and Doug
 *              sees Confirm + Cancel re-enabled — no stuck Revoking…
 *              control, no required page reload.
 *
 * M9-D-C4-1 hardening: pre-fix, this component carried a local
 * `ui === "resolving"` flag set unconditionally on Confirm click. If
 * the Server Action returned without revalidating, the banner stayed
 * mounted with Confirm + Cancel permanently disabled and "Resolving…"
 * showing forever — Doug's only escape was reload. useFormStatus
 * derives pending from the parent form's submission lifecycle so the
 * disabled state clears automatically when the action returns,
 * regardless of whether revalidation fired.
 *
 * Why a client island instead of URL-param state (brief Open Question
 * 2)? AlertBanner mounts inside `app/admin/layout.tsx`, which is a
 * Server Component layout — Next.js layouts don't receive
 * `searchParams`. URL-param state would require either a client-side
 * hash fragment (no SSR symmetry) or threading state through every
 * page that mounts the layout.
 *
 * Server Action contract: parent <AlertBanner> renders the <form
 * action={resolveAdminAlertFormAction}> wrapper around this island
 * and provides a hidden `<input name="id" value={alertId} />`. This
 * island only renders the buttons; submit goes through the parent
 * form so the existing Server Action posture is preserved. Note that
 * useFormStatus REQUIRES this component to be a child of the form —
 * it reads pending state from the nearest ancestor <form>.
 *
 * The 3s auto-revert protects Doug from a misfired tap on a P0 alert
 * (brief §1 + §11): if he tapped Resolve and put his phone down to
 * call a cue, the state reverts to idle automatically.
 */
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const AUTO_REVERT_MS = 3_000;

type UiState = "idle" | "confirm";

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

  // Confirm button is type="submit" — clicking submits the parent
  // form which fires the Server Action. We only clear the auto-revert
  // timer here; the "Resolving…" label + disabled state come from
  // useFormStatus inside ConfirmRow, NOT from a local state flag.
  // This is the load-bearing M9-D-C4-1 change.
  const onConfirmClick = () => {
    clearAutoRevert();
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

  return <ConfirmRow onConfirmClick={onConfirmClick} onCancelClick={onCancelClick} />;
}

/**
 * Extracted so useFormStatus() runs inside a component that's
 * definitely a child of the parent <form>. (React 19 requires
 * useFormStatus callers to be inside a form; calling it from the
 * top-level ResolveAlertButton would couple it to the parent
 * structure in a way the linter / runtime can't verify here.)
 */
function ConfirmRow({
  onConfirmClick,
  onCancelClick,
}: {
  onConfirmClick: () => void;
  onCancelClick: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <div data-testid="admin-alert-confirm-row" className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        data-testid="admin-alert-confirm-resolve-button"
        onClick={onConfirmClick}
        disabled={pending}
        aria-busy={pending}
        className="min-h-tap-min min-w-tap-min rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent"
      >
        {pending ? "Resolving…" : "Confirm resolve"}
      </button>
      <button
        type="button"
        data-testid="admin-alert-cancel-button"
        onClick={onCancelClick}
        disabled={pending}
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
