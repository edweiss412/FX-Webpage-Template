import { describe, expect, test } from "vitest";
import {
  SCAN_STREAM_CONTENT_TYPE,
  type ScanProgressEvent,
  type ScanResultBody,
  type ScanStreamMessage,
} from "@/lib/onboarding/scanProgress";

describe("scanProgress contract", () => {
  test("content-type is NDJSON", () => {
    expect(SCAN_STREAM_CONTENT_TYPE).toBe("application/x-ndjson");
  });

  test("event/message/result-body shapes are assignable as specified", () => {
    const listed: ScanProgressEvent = { type: "listed", total: 19 };
    const prepared: ScanProgressEvent = {
      type: "prepared",
      done: 1,
      total: 19,
      name: "II — East Coast",
    };
    const staging: ScanProgressEvent = { type: "staging" };
    const errBody: ScanResultBody = { ok: false, code: null };
    const okBody: ScanResultBody = {
      outcome: "completed",
      wizardSessionId: "w",
      folderId: "f",
      totals: { staged: 1, hard_failed: 0, skipped_non_sheet: 0, live_row_conflict: 0 },
    };
    const msgs: ScanStreamMessage[] = [
      listed,
      prepared,
      staging,
      { type: "result", body: okBody },
      { type: "result", body: errBody },
    ];
    expect(msgs).toHaveLength(5);
    for (const m of [listed, prepared, staging]) expect(typeof m.type).toBe("string");
  });
});
