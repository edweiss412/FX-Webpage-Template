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
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

type PerRowFailure = {
  drive_file_id: string;
  wizard_session_id: string;
  code: string;
  re_apply_url: string;
};

type PerRowOk = {
  drive_file_id: string;
  wizard_session_id: string;
  code: "OK";
};

type PerRowEntry = PerRowFailure | PerRowOk;

type FinalizeBatchResponse = {
  status: "batch_complete" | "all_batches_complete";
  wizard_session_id: string;
  remaining_count: number;
  unresolved_manifest_count: number;
  per_row: PerRowEntry[];
};

type FinalizeErrorResponse = { ok: false; code: string };

type FinalizeResponse = FinalizeBatchResponse | FinalizeErrorResponse;

type FinalizeCasResponse =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
    }
  | FinalizeErrorResponse;

type FinalizeButtonProps = {
  wizardSessionId: string;
  disabled?: boolean;
};

type ButtonState =
  | { kind: "idle" }
  | { kind: "running"; phase: "batch" | "cas"; batchIndex: number }
  | { kind: "race_row"; failures: PerRowFailure[] }
  | { kind: "error"; copy: string }
  | { kind: "complete" };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "The publish step could not complete. Refresh and try again, or contact the developer if this keeps happening.";

export function FinalizeButton({ wizardSessionId, disabled }: FinalizeButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<ButtonState>({ kind: "idle" });

  async function runLoop() {
    if (state.kind === "running") return;
    setState({ kind: "running", phase: "batch", batchIndex: 1 });

    let batchIndex = 1;
    while (true) {
      let response: Response;
      try {
        response = await fetch("/api/admin/onboarding/finalize", {
          method: "POST",
        });
      } catch {
        setState({ kind: "error", copy: GENERIC_ERROR });
        return;
      }
      const body = (await response.json()) as FinalizeResponse;
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
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
      setState({ kind: "error", copy: GENERIC_ERROR });
      return;
    }

    setState({ kind: "running", phase: "cas", batchIndex });
    let casResponse: Response;
    try {
      casResponse = await fetch("/api/admin/onboarding/finalize-cas", {
        method: "POST",
      });
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR });
      return;
    }
    const casBody = (await casResponse.json()) as FinalizeCasResponse;
    if ("ok" in casBody && casBody.ok === false) {
      setState({
        kind: "error",
        copy: lookupDougFacing(casBody.code) ?? GENERIC_ERROR,
      });
      return;
    }
    setState({ kind: "complete" });
    router.refresh();
  }

  const isRunning = state.kind === "running";
  const buttonDisabled = Boolean(disabled) || isRunning;

  return (
    <div className="flex flex-col gap-3" data-testid="wizard-finalize">
      <button
        type="button"
        data-testid="wizard-finalize-button"
        onClick={runLoop}
        disabled={buttonDisabled}
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {isRunning
          ? state.phase === "cas"
            ? "Publishing…"
            : `Publishing batch ${state.batchIndex}…`
          : "Finish setup and publish"}
      </button>

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
              <li
                key={failure.drive_file_id}
                className="flex flex-col gap-1 text-sm"
              >
                <span className="font-medium">{failure.drive_file_id}</span>
                <span className="text-text-subtle">
                  {lookupDougFacing(failure.code) ??
                    "This sheet could not be published in the current batch."}
                </span>
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

      {state.kind === "error" ? (
        <p
          role="alert"
          data-testid="wizard-finalize-error"
          className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          {state.copy}
        </p>
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
