"use client";

/**
 * app/admin/show/[slug]/PickerResetControl.tsx (everyone-only, 2026-07-19)
 *
 * Admin control on the per-show Share & access panel: reset EVERYONE's picker
 * selection (global epoch bump via resetPickerEpoch). Per-member reset moved to
 * the crew section's row menu (CrewRowActions — crew-row-controls spec §4.6);
 * this control keeps the two-tap idle → confirm → resolving pattern, tokens,
 * a11y contract, and every picker-reset-* testid.
 *
 * Correctness nudge, not access control: reset members return to the ungated
 * picker and can re-pick the same name. Revocation stays with Rotate
 * share-token / roster removal.
 */

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";

// Armed-state auto-revert window — harmonized to 4s across every destructive
// surface (spec §4; DESTRUCT-2). Shared naming idiom: ARM_REVERT_MS.
const ARM_REVERT_MS = 4_000;
/** PCR-1 (d): how long a success banner lingers before it auto-dismisses. */
const SUCCESS_DISMISS_MS = 5_000;

export type PickerResetCrewRow = { id: string; name: string; role: string | null };

type UiState = "idle" | "confirm" | "resolving";
type Outcome = { kind: "ok"; message: string } | { kind: "error"; message: string } | null;

export function PickerResetControl({
  showId,
  crew,
}: {
  showId: string;
  crew: PickerResetCrewRow[];
}) {
  const hasCrew = crew.length > 0;
  const [ui, setUi] = useState<UiState>("idle");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isPending, startTransition] = useTransition();
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descId = useId();
  const warningId = useId();
  // Destructive-confirm pass F4 (spec §6): C3 open-focus + C5 close-focus refs.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRowRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  useEffect(() => () => clearAutoRevert(), []);

  function closeConfirm() {
    // used ONLY by cancel onClick and the auto-revert timer callback — never submit/result paths
    // Capture ONLY while the confirm row is still mounted; a timer firing after the row is
    // gone must not write anything (and the functional setUi guard below already no-ops then).
    if (confirmRowRef.current) {
      restoreFocusRef.current = confirmRowRef.current.contains(document.activeElement);
    }
    // Preserve the existing functional guard — only confirm → idle, never clobber a later state.
    setUi((prev) => (prev === "confirm" ? "idle" : prev));
  }

  // C3 (open focus): the confirm row mounts with the SAFE control focused,
  // closing the stray-second-Enter vector (spec §3 C3).
  useEffect(() => {
    if (ui === "confirm") cancelRef.current?.focus();
  }, [ui]);

  // C5 (close focus), single-shot consumption: the idle-render effect resets
  // restoreFocusRef to false when it fires, and only one close happens per
  // confirm episode (cancel clears the timer; the timer cannot race a consumed
  // restore because the effect runs on the very next render, before any later
  // macro-task timer callback).
  useEffect(() => {
    if (ui === "idle" && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [ui]);

  // Snap back to idle when the transition settles so the outcome banner anchors next to the row.
  useEffect(() => {
    if (!isPending && outcome !== null && ui === "resolving") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUi("idle");
    }
  }, [isPending, outcome, ui]);

  // PCR-1 (d): auto-dismiss the SUCCESS banner so a stale "reset" confirmation
  // doesn't linger beside the control. Errors are NOT auto-dismissed — they must
  // persist until the admin reads and acts on them. Cleanup clears the timer on
  // unmount or when the outcome changes (no setState-after-unmount leak).
  useEffect(() => {
    if (outcome?.kind !== "ok") return;
    const t = setTimeout(() => setOutcome(null), SUCCESS_DISMISS_MS);
    return () => clearTimeout(t);
  }, [outcome]);

  const isResolving = ui === "resolving" || isPending;

  const enterConfirm = () => {
    clearAutoRevert();
    setOutcome(null);
    setUi("confirm");
    autoRevertRef.current = setTimeout(() => {
      closeConfirm();
    }, ARM_REVERT_MS);
  };

  const onCancel = () => {
    clearAutoRevert();
    closeConfirm();
  };

  const onConfirm = () => {
    clearAutoRevert();
    setUi("resolving");
    // not-subject:M5-D8 — this control's outcome copy (success AND error) is admin-authored inline
    // BY DESIGN (spec §6.2): the picker message catalog is crew-oriented and would misattribute an
    // admin reset on this surface. No new §12.4 codes; no raw error CODE is ever rendered (codes
    // are mapped to these sentences here).
    startTransition(async () => {
      const r = await resetPickerEpoch({ showId });
      // not-subject:M5-D8 — admin-authored inline copy (see rationale above).
      setOutcome(
        r.ok
          ? { kind: "ok", message: "Everyone will pick again on their next visit." }
          : { kind: "error", message: "Couldn't reset the picker. Please try again." },
      );
    });
  };

  const banners = (
    <>
      {/* PCR-1 (a): persistent, visually-hidden polite live region. A real
          element (NOT display:contents — whose live-region semantics can be
          dropped from the a11y tree in Safari/VoiceOver) that is always in the
          a11y tree and out of layout flow (sr-only ⇒ position:absolute, so no
          flex gap), so the success text swaps INTO a pre-existing region and
          SRs reliably announce it. The visible banner below is decorative. */}
      <div className="sr-only" role="status" aria-live="polite">
        {outcome?.kind === "ok" ? outcome.message : ""}
      </div>
      {/* Visible banners render only at rest (idle) — the sr-only region above
          still announces immediately regardless of ui. */}
      {ui === "idle" && outcome?.kind === "ok" && (
        // aria-hidden: the sr-only region above is the single SR source for the
        // success; this visible banner is purely decorative.
        <p
          data-testid="picker-reset-ok"
          aria-hidden="true"
          className="rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
        >
          <span aria-hidden="true" className="mr-1 font-semibold text-accent-on-bg">
            ✓
          </span>
          {outcome.message}
        </p>
      )}
      {ui === "idle" && outcome?.kind === "error" && (
        <p
          data-testid="picker-reset-error"
          role="alert"
          className="rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          {outcome.message}
        </p>
      )}
    </>
  );

  const inConfirm = ui === "confirm" || ui === "resolving";

  return (
    <div className="flex flex-col gap-2 py-3" data-testid="picker-reset-control">
      <div className="min-w-0">
        {/* PCR-1 (b): heading (under the panel's <h3>) so the control is reachable
            in the screen-reader heading outline. */}
        <h4 className="text-sm font-medium text-text-strong">{"Reset everyone's pick"}</h4>
        <p id={descId} className="text-xs text-text-subtle">
          {hasCrew
            ? "Make everyone pick their name again on their next visit."
            : "No crew to reset yet."}
        </p>
      </div>

      {inConfirm ? (
        <div
          ref={confirmRowRef}
          data-testid="picker-reset-confirm-row"
          role="group"
          aria-label="Confirm resetting picker selections for everyone on this show"
          className="flex flex-col gap-2"
        >
          <p id={warningId} className="text-xs text-text-subtle">
            {"Every device's picker re-prompts on next visit."}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isResolving}
              aria-busy={isResolving}
              aria-describedby={warningId}
              data-testid="picker-reset-confirm-button"
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResolving ? "Resetting…" : "Confirm reset"}
            </button>
            <button
              type="button"
              ref={cancelRef}
              onClick={onCancel}
              disabled={isResolving}
              data-testid="picker-reset-cancel-button"
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          ref={triggerRef}
          onClick={enterConfirm}
          disabled={!hasCrew}
          data-testid="picker-reset-all-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 self-start rounded-sm border border-border-strong bg-surface px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" size={14} />
          {"Reset everyone's pick"}
        </button>
      )}

      {banners}
    </div>
  );
}
