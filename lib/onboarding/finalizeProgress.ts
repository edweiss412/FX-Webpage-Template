/**
 * lib/onboarding/finalizeProgress.ts
 *
 * Shared wire contract for the streamed Step-3 publish/finish-setup progress,
 * imported by BOTH routes (producers: finalize + finalize-cas) and <FinalizeButton>
 * (consumer). Defining it once turns any server/client drift into a compile error —
 * the same discipline as lib/onboarding/scanProgress.ts.
 *
 * Each route emits one JSON object per line (NDJSON): zero or more progress events,
 * then exactly one terminal `result`. Progress events are OPTIMISTIC; the terminal
 * `result.body` is authoritative and equals the non-streaming JSON body.
 */

export const FINALIZE_STREAM_CONTENT_TYPE = "application/x-ndjson";

// ---- response body types (moved from FinalizeButton.tsx) ----
export type PerRowFailure = {
  drive_file_id: string;
  wizard_session_id: string;
  code: string;
  re_apply_url: string;
  display_name?: string;
};
export type PerRowOk = {
  drive_file_id: string;
  wizard_session_id: string;
  code: "OK";
};
export type PerRowEntry = PerRowFailure | PerRowOk;

export type FinalizeBatchResponse = {
  status: "batch_complete" | "all_batches_complete";
  wizard_session_id: string;
  remaining_count: number;
  unresolved_manifest_count: number;
  per_row: PerRowEntry[];
};

// finalize-cas 409s carry per_row entries ({ drive_file_id, code }) for retained shadow rows.
export type CasPerRowEntry = { drive_file_id: string; code: string; display_name?: string };
export type FinalizeErrorResponse = { ok: false; code: string; per_row?: CasPerRowEntry[] };
export type FinalizeResponse = FinalizeBatchResponse | FinalizeErrorResponse;

export type FinalizeCasResponse =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
      // The server success object may also carry these (both IGNORED by the client): `idempotent`
      // on the already-finalized replay path, and `per_row` discarded-by-choice confirmations.
      // Widened vs the pre-move FinalizeButton type so the finalize-cas stream `emit({type:"result",
      // body: result})` assigns the runFinalizeCas success arm cleanly under tsc.
      idempotent?: boolean;
      per_row?: CasPerRowEntry[];
    }
  | FinalizeErrorResponse;

// ---- /finalize batch stream ----
export type FinalizeProgressEvent =
  | { type: "listed"; total: number }
  | { type: "row"; done: number; total: number; name: string | null; driveFileId: string };
export type FinalizeResultBody = FinalizeBatchResponse | FinalizeErrorResponse;
export type FinalizeStreamMessage =
  | FinalizeProgressEvent
  | { type: "result"; body: FinalizeResultBody };

// ---- /finalize-cas stream ----
export type FinalizeCasPhase = "applying" | "publishing" | "subscribing";
export type FinalizeCasProgressEvent = { type: "phase"; phase: FinalizeCasPhase };
export type FinalizeCasResultBody = FinalizeCasResponse;
export type FinalizeCasStreamMessage =
  | FinalizeCasProgressEvent
  | { type: "result"; body: FinalizeCasResultBody };
