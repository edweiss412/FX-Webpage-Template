/**
 * lib/onboarding/scanProgress.ts
 *
 * Shared wire contract for the streamed onboarding scan progress, imported by
 * BOTH the route (producer, app/api/admin/onboarding/scan/route.ts) and
 * <Step2Verify> (consumer). Defining it once turns any server/client drift into
 * a compile error — the same discipline as lib/onboarding/scanResponse.ts.
 *
 * The route emits one JSON object per line (NDJSON): zero or more progress
 * events, then exactly one terminal `result`.
 */
import type { OnboardingScanResponseBody } from "@/lib/onboarding/scanResponse";

/** Incremental progress events emitted during an onboarding scan. */
export type ScanProgressEvent =
  | { type: "listed"; total: number }
  | { type: "prepared"; done: number; total: number; name: string }
  | { type: "staging" };

/**
 * Terminal-event body. Superset of OnboardingScanResponseBody (completed |
 * schema_missing | superseded, scanResponse.ts) PLUS the mid-run-failure shape
 * that body cannot model. `code` widens to string | null so the route's
 * mid-run-failure `{ ok:false, code:null }` fits and the client's
 * copyForCode(null) returns the generic copy (no raw code).
 */
export type ScanResultBody =
  | OnboardingScanResponseBody
  | { ok: false; code: string | null };

/** One NDJSON line on the wire: a progress event or the terminal result. */
export type ScanStreamMessage =
  | ScanProgressEvent
  | { type: "result"; body: ScanResultBody };

export const SCAN_STREAM_CONTENT_TYPE = "application/x-ndjson";
