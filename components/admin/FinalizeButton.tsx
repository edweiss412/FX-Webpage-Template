"use client";

/**
 * components/admin/FinalizeButton.tsx (M10 §B Task 10.5 / Phase 2)
 *
 * Wizard-step-3 publish trigger. Drives the multi-batch finalize loop
 * per spec §4.5 / §9.0 and the Pin-2 FinalizeResponse contract:
 *
 *   1. POST /api/admin/onboarding/finalize (no body)
 *      → status='batch_complete'      → loop and POST /finalize again
 *      → status='all_batches_complete' → if per_row has failures, render
 *          re-apply links and STOP (race-row gate per plan §M10 Task
 *          10.5 test (g)). Otherwise POST /finalize-cas.
 *      → ok:false → render Doug-facing copy via messageFor.
 *   2. POST /api/admin/onboarding/finalize-cas (Phase D)
 *      → status='finalize_complete' → router.refresh (the next page-load
 *          observes pending_wizard_session_id NULL and watched_folder_id
 *          non-null, falling through to the Dashboard).
 *      → ok:false → render Doug-facing copy.
 *
 * No raw §12.4 codes leak into the rendered UI (AGENTS.md §1.5). Race-row
 * failure links are rendered VERBATIM from the response's pre-built
 * `re_apply_url` — the client never composes the URL itself per plan
 * §M10 Task 10.5 step 1 test (g).
 *
 * Idempotency under double-click: a state guard prevents a second click
 * from re-firing the loop while a /finalize or /finalize-cas request is
 * in flight (the server is already idempotency-gated by the
 * pg_try_advisory_xact_lock('finalize:<sessionId>'), but the UI guard
 * keeps the button from spinning the request count unnecessarily).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { AccentButton } from "@/components/shared/AccentButton";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";
import type {
  PerRowFailure,
  FinalizeBatchResponse,
  CasPerRowEntry,
  FinalizeResponse,
  FinalizeCasResponse,
} from "@/lib/onboarding/finalizeProgress";

// The one per-row code a re-scan can heal: an outdated Phase-D shadow. Corrupt-payload
// / archived-show rows keep their existing recovery (re-scan is the wrong tool there).
const RESCANNABLE_CAS_CODE = "STAGED_PARSE_OUTDATED_AT_PHASE_D";

type FinalizeButtonProps = {
  wizardSessionId: string;
  disabled?: boolean;
  // §4.1 / D5: the button label reads "Publish N shows & finish setup" where
  // N = publishCount (rows currently checked → status 'applied'). Optional so
  // legacy callers (and the resume button) keep the prior generic label.
  publishCount?: number;
  // §4.1 / D5: count of clean rows left UNCHECKED (status 'staged'). When > 0,
  // clicking Publish opens a soft confirm first ("N sheets won't be published
  // — you'll find them under Unpublished. Continue?"). They become Held shows.
  uncheckedCleanCount?: number;
};

type ButtonState =
  | { kind: "idle" }
  | { kind: "running"; phase: "batch" | "cas"; batchIndex: number }
  | { kind: "race_row"; failures: PerRowFailure[] }
  | { kind: "cas_per_row"; rows: CasPerRowEntry[] }
  | { kind: "error"; copy: string; code: string | null }
  | { kind: "complete" };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "The publish step could not complete. Refresh and try again, or contact the developer if this keeps happening.";

export function FinalizeButton({
  wizardSessionId,
  disabled,
  publishCount,
  uncheckedCleanCount = 0,
}: FinalizeButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<ButtonState>({ kind: "idle" });
  // D5 soft confirm: a CONTROLLED open flag (not an in-onClick self-disable —
  // see feedback_react_form_action_synchronous_disable_cancels_submit). Opening
  // the confirm is a pure setState; the loop runs only from the confirm's
  // Proceed action (or directly when nothing is left unchecked).
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runLoop() {
    if (state.kind === "running") return;
    setConfirmOpen(false);
    setState({ kind: "running", phase: "batch", batchIndex: 1 });

    let batchIndex = 1;
    while (true) {
      let response: Response;
      try {
        response = await fetch("/api/admin/onboarding/finalize", {
          method: "POST",
        });
      } catch {
        setState({ kind: "error", copy: GENERIC_ERROR, code: null });
        return;
      }
      const body = (await response.json()) as FinalizeResponse;
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
          code: body.code,
        });
        return;
      }
      const batchBody = body as FinalizeBatchResponse;
      // Per-row failures can land on EITHER batch_complete OR
      // all_batches_complete (Pin-2 FinalizeResponse — a row that races
      // mid-batch surfaces with status='batch_complete' AND a non-OK
      // entry in per_row alongside the OK entries for the rest of the
      // batch). Inspect per_row BEFORE branching on status; if any row
      // is non-OK, stop the loop and render the re-apply links from
      // THIS response's pre-built re_apply_url. Looping past a failure
      // response would lose the actionable re-apply links and strand
      // the operator.
      const failedRows = (batchBody.per_row ?? []).filter(
        (r): r is PerRowFailure => r.code !== "OK",
      );
      if (failedRows.length > 0) {
        setState({ kind: "race_row", failures: failedRows });
        return;
      }
      if (batchBody.status === "batch_complete") {
        batchIndex += 1;
        setState({ kind: "running", phase: "batch", batchIndex });
        continue;
      }
      if (batchBody.status === "all_batches_complete") {
        break;
      }
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
      return;
    }

    setState({ kind: "running", phase: "cas", batchIndex });
    let casResponse: Response;
    try {
      casResponse = await fetch("/api/admin/onboarding/finalize-cas", {
        method: "POST",
      });
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
      return;
    }
    const casBody = (await casResponse.json()) as FinalizeCasResponse;
    if ("ok" in casBody && casBody.ok === false) {
      // WM-R3: per-row entries (retained shadow rows) get their own catalog
      // copy INSTEAD OF the generic top-level line — a corrupt-retained
      // shadow blocks finalize on every retry, so the operator needs the
      // per-file recovery copy (cleanup for corrupt rows; outdated rows
      // self-heal on the next finalize click per the master-spec contract).
      const casFailedRows = (casBody.per_row ?? []).filter((row) => row.code !== "OK");
      if (casFailedRows.length > 0) {
        setState({ kind: "cas_per_row", rows: casFailedRows });
        return;
      }
      setState({
        kind: "error",
        copy: lookupDougFacing(casBody.code) ?? GENERIC_ERROR,
        code: casBody.code,
      });
      return;
    }
    setState({ kind: "complete" });
    router.refresh();
  }

  const isRunning = state.kind === "running";
  const buttonDisabled = Boolean(disabled) || isRunning;

  // D5 label: "Publish N shows & finish setup" when a count is threaded;
  // otherwise the prior generic label (legacy callers / resume button).
  const idleLabel =
    typeof publishCount === "number"
      ? `Publish ${publishCount} show${publishCount === 1 ? "" : "s"} & finish setup`
      : "Finish setup and publish";

  // Primary click: if clean rows remain unchecked, open the soft confirm
  // FIRST (pure setState — never self-disables the button mid-submit). With
  // nothing unchecked, run the loop directly. The confirm's Proceed runs it.
  function onPrimaryClick() {
    if (buttonDisabled) return;
    if (uncheckedCleanCount > 0) {
      setConfirmOpen(true);
      return;
    }
    void runLoop();
  }

  return (
    <div className="flex flex-col gap-3" data-testid="wizard-finalize">
      <AccentButton
        data-testid="wizard-finalize-button"
        onClick={onPrimaryClick}
        disabled={buttonDisabled}
        aria-haspopup={uncheckedCleanCount > 0 ? "dialog" : undefined}
        aria-expanded={uncheckedCleanCount > 0 ? confirmOpen : undefined}
        size="lg"
        inline
        selfStart
        shadow
      >
        {isRunning
          ? state.phase === "cas"
            ? "Publishing…"
            : `Publishing batch ${state.batchIndex}…`
          : idleLabel}
      </AccentButton>

      {confirmOpen ? (
        <FinalizeSoftConfirm
          uncheckedCleanCount={uncheckedCleanCount}
          onProceed={() => void runLoop()}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}

      {state.kind === "race_row" ? (
        <div
          role="alert"
          data-testid="wizard-finalize-race-row"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
        >
          <p className="text-sm font-semibold">
            Some sheets need another look before we can publish.
          </p>
          <ul className="flex flex-col gap-2">
            {state.failures.map((failure) => (
              <li key={failure.drive_file_id} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{failure.display_name ?? failure.drive_file_id}</span>
                <span className="text-text-subtle">
                  {lookupDougFacing(failure.code) ??
                    "This sheet could not be published in the current batch."}
                </span>
                <HelpAffordance code={failure.code} />
                <Link
                  data-testid={`wizard-finalize-reapply-${failure.drive_file_id}`}
                  href={failure.re_apply_url}
                  className="inline-flex min-h-tap-min items-center self-start text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  Review and re-apply
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === "cas_per_row" ? (
        <div
          role="alert"
          data-testid="wizard-finalize-cas-per-row"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
        >
          <p className="text-sm font-semibold">Some sheets are blocking the final publish step.</p>
          <ul className="flex flex-col gap-2">
            {state.rows.map((row) => (
              <li key={row.drive_file_id} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{row.display_name ?? row.drive_file_id}</span>
                <span className="text-text-subtle">
                  {lookupDougFacing(row.code) ?? GENERIC_ERROR}
                </span>
                <HelpAffordance code={row.code} />
                {/* An outdated Phase-D shadow self-heals via a re-scan; offer it inline. */}
                {row.code === RESCANNABLE_CAS_CODE ? (
                  <RescanSheetButton
                    driveFileId={row.drive_file_id}
                    wizardSessionId={wizardSessionId}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="wizard-finalize-error"
          className="flex flex-col gap-1 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          <p>{renderEmphasis(state.copy)}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}

      {state.kind === "complete" ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="wizard-finalize-publish-complete"
          className="text-sm text-text-subtle"
        >
          Setup is complete. Your shows are live for crew now.
        </p>
      ) : null}
    </div>
  );
}

/**
 * D5 soft confirm (spec §4.1 / D4 decision): an INLINE confirm surface (not a
 * portal modal — modals are an absolute-ban-unless-justified, and an inline
 * disclosure under the button is the lighter affordance) carrying dialog
 * semantics: `role="dialog"` + `aria-modal`, a labelled title, autofocus onto
 * Continue, Escape-to-cancel, and a focus trap between Continue ↔ Cancel so the
 * decision is keyboard-complete. It never self-disables the trigger mid-submit
 * (React-19 form-action hazard); Proceed simply calls the loop.
 */
function FinalizeSoftConfirm({
  uncheckedCleanCount,
  onProceed,
  onCancel,
}: {
  uncheckedCleanCount: number;
  onProceed: () => void;
  onCancel: () => void;
}) {
  const proceedRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Autofocus the primary action when the confirm opens (keyboard users land
  // inside the dialog, not back on the trigger).
  useEffect(() => {
    proceedRef.current?.focus();
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === "Tab") {
      // Two-stop focus trap: Continue ↔ Cancel, both directions.
      const proceed = proceedRef.current;
      const cancel = cancelRef.current;
      if (!proceed || !cancel) return;
      const active = document.activeElement;
      if (event.shiftKey && active === proceed) {
        event.preventDefault();
        cancel.focus();
      } else if (!event.shiftKey && active === cancel) {
        event.preventDefault();
        proceed.focus();
      }
    }
  }

  const noun = uncheckedCleanCount === 1 ? "sheet" : "sheets";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-finalize-confirm-title"
      data-testid="wizard-finalize-confirm"
      onKeyDown={onKeyDown}
      className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-raised p-tile-pad shadow-(--shadow-tile)"
    >
      <div className="flex flex-col gap-1">
        <p id="wizard-finalize-confirm-title" className="text-base font-semibold text-text-strong">
          {uncheckedCleanCount} {noun} won&rsquo;t be published
        </p>
        <p className="text-sm text-text-subtle">
          You&rsquo;ll find {uncheckedCleanCount === 1 ? "it" : "them"} under{" "}
          <span className="font-medium text-text-strong">Unpublished</span>, ready to publish
          anytime. Continue?
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <AccentButton
          ref={proceedRef}
          data-testid="wizard-finalize-confirm-proceed"
          onClick={onProceed}
          size="sm"
          inline
          ringOffset="surface-raised"
        >
          Continue
        </AccentButton>
        <button
          ref={cancelRef}
          type="button"
          data-testid="wizard-finalize-confirm-cancel"
          onClick={onCancel}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
