"use client";

/**
 * components/admin/ResumeFinalizeButton.tsx (M10 §B Task 10.1 §B / Phase 2)
 *
 * Resumes a paused multi-batch finalize from the FinalizeInProgress
 * re-entry surface. POSTs ONE batch to /api/admin/onboarding/finalize
 * (no body) and refreshes the page so the next page-load reads the
 * updated checkpoint. Unlike <FinalizeButton> in the wizard chrome,
 * Resume does NOT loop — each click is one batch; subsequent batches
 * either auto-refire through page reload (when the user clicks Resume
 * again from the refreshed FinalizeInProgress surface) or fall through
 * to ReadyToPublish when status='all_batches_complete'.
 *
 * Race-row failure handling: when per_row contains failures, render
 * the re-apply links VERBATIM from the response's pre-built
 * re_apply_url; client never composes the URL.
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

type ResumeFinalizeButtonProps = {
  sessionId: string;
};

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "race_row"; failures: PerRowFailure[] }
  | { kind: "error"; copy: string };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "We could not resume publishing. Refresh and try again, or contact the developer if this keeps happening.";

export function ResumeFinalizeButton({ sessionId: _sessionId }: ResumeFinalizeButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const response = await fetch("/api/admin/onboarding/finalize", {
        method: "POST",
      });
      const body = (await response.json()) as
        | FinalizeBatchResponse
        | FinalizeErrorResponse;
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
        });
        return;
      }
      const batchBody = body as FinalizeBatchResponse;
      // Filter to only non-OK per_row entries; OK entries are reported
      // for successfully-promoted rows in the same batch.
      const failedRows = (batchBody.per_row ?? []).filter(
        (r): r is PerRowFailure => r.code !== "OK",
      );
      if (failedRows.length > 0) {
        setState({ kind: "race_row", failures: failedRows });
        return;
      }
      setState({ kind: "idle" });
      router.refresh();
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR });
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="resume-finalize">
      <button
        type="button"
        data-testid="resume-finalize-button"
        onClick={handleClick}
        disabled={state.kind === "running"}
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {state.kind === "running" ? "Resuming…" : "Resume publishing"}
      </button>

      {state.kind === "race_row" ? (
        <div
          role="alert"
          data-testid="resume-finalize-race-row"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
        >
          <p className="text-sm font-semibold">
            Some sheets need another look before publishing can finish.
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
                  data-testid={`resume-finalize-reapply-${failure.drive_file_id}`}
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
          data-testid="resume-finalize-error"
          className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          {state.copy}
        </p>
      ) : null}
    </div>
  );
}
