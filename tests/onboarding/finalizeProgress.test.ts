import { describe, expect, test } from "vitest";
import {
  FINALIZE_STREAM_CONTENT_TYPE,
  type FinalizeStreamMessage,
  type FinalizeCasStreamMessage,
} from "@/lib/onboarding/finalizeProgress";

describe("finalizeProgress wire contract", () => {
  test("content-type constant matches the scan stream convention", () => {
    expect(FINALIZE_STREAM_CONTENT_TYPE).toBe("application/x-ndjson");
  });

  test("finalize stream union accepts listed, row, and terminal result", () => {
    // Compile-time coverage: if a variant's shape drifts, this file fails to typecheck.
    const msgs: FinalizeStreamMessage[] = [
      { type: "listed", total: 3 },
      { type: "row", done: 1, total: 3, name: "East Coast", driveFileId: "f1" },
      { type: "row", done: 2, total: 3, name: null, driveFileId: "f2" },
      {
        type: "result",
        body: {
          status: "all_batches_complete",
          wizard_session_id: "s",
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        },
      },
      { type: "result", body: { ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" } },
    ];
    expect(msgs).toHaveLength(5);
  });

  test("cas stream union accepts phase events and terminal result", () => {
    const msgs: FinalizeCasStreamMessage[] = [
      { type: "phase", phase: "applying" },
      { type: "phase", phase: "publishing" },
      { type: "phase", phase: "subscribing" },
      {
        type: "result",
        body: { status: "finalize_complete", wizard_session_id: "s", watched_folder_id: "wf" },
      },
      {
        type: "result",
        body: { ok: false, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D", per_row: [] },
      },
    ];
    expect(msgs).toHaveLength(5);
  });
});
