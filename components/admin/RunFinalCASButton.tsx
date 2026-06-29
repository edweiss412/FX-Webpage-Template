"use client";

/**
 * components/admin/RunFinalCASButton.tsx (M10 §B Task 10.1 §B / Phase 2)
 *
 * Phase D "Publish all" trigger. POSTs to
 * /api/admin/onboarding/finalize-cas (no body). On
 * status='finalize_complete' calls router.refresh; the next page-load
 * sees pending_wizard_session_id IS NULL AND watched_folder_id IS NOT
 * NULL and falls through to the Dashboard. On 409 errors renders
 * Doug-facing copy via messageFor.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { AccentButton } from "@/components/shared/AccentButton";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";

// The one per-row code a re-scan can heal: an outdated Phase-D shadow. Corrupt-payload
// / archived-show rows keep their existing recovery (re-scan is the wrong tool there).
const RESCANNABLE_CAS_CODE = "STAGED_PARSE_OUTDATED_AT_PHASE_D";

// WM-R3: finalize-cas 409s carry per_row entries ({ drive_file_id, code })
// for retained shadow rows (app/api/admin/onboarding/finalize-cas/route.ts
// errorResponse(409, "STAGED_PARSE_OUTDATED_AT_PHASE_D", { per_row })).
// OK rows ride along in the array and are filtered before rendering.
type CasPerRowEntry = { drive_file_id: string; code: string };

type FinalizeCasResponse =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
    }
  | { ok: false; code: string; per_row?: CasPerRowEntry[] };

type Props = { sessionId: string };

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "per_row"; rows: CasPerRowEntry[] }
  | { kind: "error"; copy: string; code: string | null }
  | { kind: "complete" };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "We could not publish your shows. Refresh and try again, or contact the developer if this keeps happening.";

export function RunFinalCASButton({ sessionId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const response = await fetch("/api/admin/onboarding/finalize-cas", {
        method: "POST",
      });
      const body = (await response.json()) as FinalizeCasResponse;
      if ("ok" in body && body.ok === false) {
        // WM-R3: per-row entries (retained shadow rows) get their own
        // catalog copy INSTEAD OF the generic top-level line — a
        // corrupt-retained shadow blocks finalize on every retry, so the
        // operator needs the per-file recovery copy (cleanup for corrupt
        // rows; outdated rows self-heal on the next finalize click per the
        // master-spec contract).
        const failedRows = (body.per_row ?? []).filter((row) => row.code !== "OK");
        if (failedRows.length > 0) {
          setState({ kind: "per_row", rows: failedRows });
          return;
        }
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
          code: body.code,
        });
        return;
      }
      setState({ kind: "complete" });
      router.refresh();
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="run-final-cas">
      <AccentButton
        data-testid="run-final-cas-button"
        onClick={handleClick}
        disabled={state.kind === "running"}
        size="lg"
        inline
        selfStart
        shadow
      >
        {state.kind === "running" ? "Publishing…" : "Publish all"}
      </AccentButton>

      {state.kind === "per_row" ? (
        <div
          role="alert"
          data-testid="run-final-cas-per-row"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
        >
          <p className="text-sm font-semibold">Some sheets are blocking the final publish step.</p>
          <ul className="flex flex-col gap-2">
            {state.rows.map((row) => (
              <li key={row.drive_file_id} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{row.drive_file_id}</span>
                <span className="text-text-subtle">
                  {lookupDougFacing(row.code) ?? GENERIC_ERROR}
                </span>
                <HelpAffordance code={row.code} />
                {/* An outdated Phase-D shadow self-heals via a re-scan; offer it inline. */}
                {row.code === RESCANNABLE_CAS_CODE ? (
                  <RescanSheetButton driveFileId={row.drive_file_id} wizardSessionId={sessionId} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="run-final-cas-error"
          className="flex flex-col gap-1 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          <p>{renderEmphasis(state.copy)}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}
    </div>
  );
}
