"use client";

/**
 * app/admin/show/[slug]/ResetPickerEpochButton.tsx (M11.5 §B Task F2)
 *
 * Section-level admin action: bump shows.picker_epoch so every device's
 * picker cookie goes stale on next visit and the picker re-prompts.
 * Mirrors the two-tap pattern (idle → confirm → resolving → idle with
 * banner) used elsewhere in the admin surface.
 *
 * Wraps the typed Server Action `resetPickerEpoch({ showId })` (Pin-2
 * contract). Invoked directly from a transition (not via <form action>)
 * because the action takes a typed object input, not FormData.
 *
 * Confirm copy is count-free (R27) — we never display a "this will
 * reset N devices" promise that admin_alerts couldn't truthfully
 * count from the server-side state.
 */

import { useEffect, useRef, useState, useTransition } from "react";

import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";

const AUTO_REVERT_MS = 3_000;

type UiState = "idle" | "confirm" | "resolving";
type Result =
  | { ok: true; new_epoch: number }
  | { ok: false; code: string }
  | null;

export function ResetPickerEpochButton({ showId }: { showId: string }) {
  const [ui, setUi] = useState<UiState>("idle");
  const [result, setResult] = useState<Result>(null);
  const [isPending, startTransition] = useTransition();
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };

  useEffect(() => () => clearAutoRevert(), []);

  // Snap back to idle when the transition settles so the banner
  // anchors next to the original button cluster (matches the
  // Existing admin destructive-action accessibility precedent.
  useEffect(() => {
    if (!isPending && result !== null && ui === "resolving") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUi("idle");
    }
  }, [isPending, result, ui]);

  const onResetClick = () => {
    clearAutoRevert();
    // Clear any prior result so a stale OK/refused banner doesn't reappear
    // when the user re-enters confirm from an idle-with-banner state and
    // then cancels — the banner would otherwise outlive its context.
    setResult(null);
    setUi("confirm");
    autoRevertRef.current = setTimeout(() => {
      setUi((prev) => (prev === "confirm" ? "idle" : prev));
    }, AUTO_REVERT_MS);
  };

  const onCancelClick = () => {
    clearAutoRevert();
    setUi("idle");
  };

  const onConfirmClick = () => {
    clearAutoRevert();
    setUi("resolving");
    startTransition(async () => {
      const r = await resetPickerEpoch({ showId });
      setResult(r);
    });
  };

  const okMessage = result?.ok ? "Picker selections reset." : null;
  const refusedMessage =
    result && result.ok === false
      ? "Couldn't reset selections. Please try again."
      : null;
  const isResolving = ui === "resolving" || isPending;

  if (ui === "idle") {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={onResetClick}
          data-testid="admin-reset-picker-epoch-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Reset picker selections
        </button>
        {okMessage && (
          <p
            data-testid="admin-reset-picker-epoch-ok"
            role="status"
            aria-live="polite"
            className="rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
          >
            <span aria-hidden="true" className="mr-1 font-semibold text-accent">
              ✓
            </span>
            {okMessage}
          </p>
        )}
        {refusedMessage && (
          <p
            data-testid="admin-reset-picker-epoch-refused"
            role="alert"
            className="rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            {refusedMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="admin-reset-picker-epoch-confirm-row"
      role="group"
      aria-label="Confirm resetting picker selections for this show"
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <p className="text-sm text-text-subtle">
        Every device&rsquo;s picker re-prompts on next visit.
      </p>
      <button
        type="button"
        onClick={onConfirmClick}
        disabled={isResolving}
        aria-busy={isResolving}
        data-testid="admin-reset-picker-epoch-confirm-button"
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isResolving ? "Resetting…" : "Confirm reset"}
      </button>
      <button
        type="button"
        onClick={onCancelClick}
        disabled={isResolving}
        data-testid="admin-reset-picker-epoch-cancel-button"
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );
}
