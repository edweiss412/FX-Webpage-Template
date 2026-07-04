"use client";

/**
 * app/admin/show/[slug]/PickerResetControl.tsx (per-crew picker reset, 2026-07-03)
 *
 * Unified admin control on the per-show Share & access panel. Two scopes under one control:
 *   - PRIMARY: reset ONE crew member's picker selection (pick a name → Reset). Forces only that
 *     member to re-pick who they are on their next visit. Calls the resetCrewMemberSelection action.
 *   - SECONDARY (de-emphasized): reset EVERYONE's pick (the existing global epoch bump). Calls
 *     resetPickerEpoch.
 *
 * Replaces <ResetPickerEpochButton> in CurrentShareLinkPanel's actions slot, keeping its
 * two-tap idle → confirm → resolving pattern, tokens, and a11y contract (role=group,
 * aria-describedby, data-testids). Outcome copy is admin-authored inline (NOT the crew-facing
 * picker catalog copy, which would misattribute an admin action on this surface).
 *
 * Correctness nudge, not access control: a reset member returns to the ungated picker and can
 * re-pick the same name. Revocation stays with Rotate share-token / roster removal.
 */

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";
import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";

const AUTO_REVERT_MS = 3_000;
/** PCR-1 (d): how long a success banner lingers before it auto-dismisses. */
const SUCCESS_DISMISS_MS = 5_000;

export type PickerResetCrewRow = { id: string; name: string; role: string | null };

type Scope = "member" | "all";
type UiState = "idle" | "confirm" | "resolving";
type Outcome = { kind: "ok"; message: string } | { kind: "error"; message: string } | null;

/** Non-blank label for a roster option: name → role → id-derived placeholder. */
function memberLabel(row: PickerResetCrewRow): string {
  const name = row.name.trim();
  if (name) return name;
  const role = (row.role ?? "").trim();
  if (role) return role;
  return `(unnamed · ${row.id.slice(0, 8)})`;
}

export function PickerResetControl({
  showId,
  crew,
}: {
  showId: string;
  crew: PickerResetCrewRow[];
}) {
  const hasCrew = crew.length > 0;
  const [selectedId, setSelectedId] = useState<string>(() => crew[0]?.id ?? "");
  const [ui, setUi] = useState<UiState>("idle");
  const [scope, setScope] = useState<Scope>("member");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isPending, startTransition] = useTransition();
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descId = useId();
  const warningId = useId();

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  useEffect(() => () => clearAutoRevert(), []);

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

  const selectedRow = crew.find((c) => c.id === selectedId) ?? null;
  // Fallback guards a removed/stale selectedId so aria-label + warning copy are never blank.
  const selectedLabel = selectedRow ? memberLabel(selectedRow) : "this crew member";
  const isResolving = ui === "resolving" || isPending;

  const enterConfirm = (next: Scope) => {
    clearAutoRevert();
    setOutcome(null);
    setScope(next);
    setUi("confirm");
    autoRevertRef.current = setTimeout(() => {
      setUi((prev) => (prev === "confirm" ? "idle" : prev));
    }, AUTO_REVERT_MS);
  };

  const onCancel = () => {
    clearAutoRevert();
    setUi("idle");
  };

  // Compound-transition guard: changing the target member mid-confirm cancels the pending
  // per-member confirm so a stale confirm can't fire against the previously-selected member.
  const onSelectChange = (id: string) => {
    setSelectedId(id);
    if (ui === "confirm" && scope === "member") {
      clearAutoRevert();
      setUi("idle");
    }
  };

  const onConfirm = () => {
    clearAutoRevert();
    setUi("resolving");
    // not-subject:M5-D8 — this control's outcome copy (success AND error) is admin-authored inline
    // BY DESIGN (spec §6.2): the picker message catalog is crew-oriented and would misattribute an
    // admin reset ("That crew member was just removed… Pick yourself…"). Spec §2.4/§8 also forbid
    // adding new §12.4 codes for this feature. So these strings intentionally do NOT route through
    // the crew message catalog; they are Doug-facing admin copy on an admin-only surface. No raw
    // error CODE is ever rendered (codes are mapped to these sentences here).
    startTransition(async () => {
      if (scope === "all") {
        const r = await resetPickerEpoch({ showId });
        // not-subject:M5-D8 — admin-authored inline copy (see rationale above).
        setOutcome(
          r.ok
            ? { kind: "ok", message: "Everyone will pick again on their next visit." }
            : { kind: "error", message: "Couldn't reset the picker. Please try again." },
        );
        return;
      }
      const r = await resetCrewMemberSelection({ showId, crewMemberId: selectedId });
      if (r.ok) {
        // not-subject:M5-D8 — admin-authored inline copy (see rationale above).
        setOutcome({
          kind: "ok",
          message: `Reset ${selectedLabel}. They'll pick again next visit.`,
        });
      } else if (r.code === "PICKER_CREW_MEMBER_NOT_FOUND") {
        // not-subject:M5-D8 — admin-authored inline copy (see rationale above).
        setOutcome({
          kind: "error",
          message:
            "That crew member is no longer on the roster, so there's nothing to reset. Refresh to see the current roster.",
        });
      } else {
        // not-subject:M5-D8 — admin-authored inline copy (see rationale above).
        setOutcome({ kind: "error", message: "Couldn't reset the picker. Please try again." });
      }
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
      {outcome?.kind === "ok" && (
        <p
          data-testid="picker-reset-ok"
          className="rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
        >
          <span aria-hidden="true" className="mr-1 font-semibold text-accent">
            ✓
          </span>
          {outcome.message}
        </p>
      )}
      {outcome?.kind === "error" && (
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
  const memberConfirm = inConfirm && scope === "member";
  const allConfirm = inConfirm && scope === "all";
  const warning =
    scope === "all"
      ? "Every device's picker re-prompts on next visit."
      : `${selectedLabel} will choose their name again on their next visit.`;

  const confirmActions = (
    <div
      data-testid="picker-reset-confirm-row"
      role="group"
      aria-label={
        scope === "all"
          ? "Confirm resetting picker selections for everyone on this show"
          : "Confirm resetting this crew member's picker selection"
      }
      className="flex flex-col gap-2"
    >
      <p id={warningId} className="text-xs text-text-subtle">
        {warning}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isResolving}
          aria-busy={isResolving}
          aria-describedby={warningId}
          data-testid="picker-reset-confirm-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResolving ? "Resetting…" : "Confirm reset"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isResolving}
          data-testid="picker-reset-cancel-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 py-3" data-testid="picker-reset-control">
      <div className="min-w-0">
        {/* PCR-1 (b): heading (under the panel's <h3>) so the control is reachable
            in the screen-reader heading outline. Visual style is unchanged. */}
        <h4 className="text-sm font-medium text-text-strong">
          {allConfirm ? "Reset everyone's pick" : "Reset name picker"}
        </h4>
        <p id={descId} className="text-xs text-text-subtle">
          {hasCrew
            ? "Ask one crew member to pick their name again, or reset everyone."
            : "No crew to reset yet."}
        </p>
      </div>

      {/* Member selector stays visible through the member-confirm so the admin keeps context
          and can switch targets (which cancels the pending confirm via onSelectChange). Hidden
          only during a reset-everyone confirm, where it is irrelevant. */}
      {hasCrew && !allConfirm && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-text-subtle">
            <span>Crew member</span>
            <select
              data-testid="picker-reset-member-select"
              aria-describedby={descId}
              value={selectedId}
              disabled={isResolving}
              onChange={(e) => onSelectChange(e.target.value)}
              className="min-h-tap-min rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
            >
              {crew.map((row) => (
                <option key={row.id} value={row.id}>
                  {memberLabel(row)}
                </option>
              ))}
            </select>
          </label>
          {!memberConfirm && (
            <button
              type="button"
              onClick={() => enterConfirm("member")}
              data-testid="picker-reset-member-button"
              aria-label={`Reset ${selectedLabel}`}
              className="inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <RefreshCw aria-hidden="true" size={14} />
              Reset
            </button>
          )}
        </div>
      )}

      {inConfirm ? (
        confirmActions
      ) : (
        <button
          type="button"
          onClick={() => enterConfirm("all")}
          disabled={!hasCrew}
          data-testid="picker-reset-all-button"
          // Secondary/broader action: neutral + de-emphasized (accent is reserved for the confirm
          // CTA, so it never out-ranks the primary per-member Reset). Tap-min for the venue floor.
          className="inline-flex min-h-tap-min items-center self-start rounded-sm text-xs text-text-subtle underline underline-offset-2 transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:text-text-faint disabled:no-underline"
        >
          Reset everyone&rsquo;s pick
        </button>
      )}

      {banners}
    </div>
  );
}
