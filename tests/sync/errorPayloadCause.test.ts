// tests/sync/errorPayloadCause.test.ts
//
// Dark-path diagnosis fix: the cron file-loop catch (runScheduledCronSync.ts:3067)
// persists errorPayload(error) into sync_log.parse_warnings, but errorPayload
// dropped `error.cause`. Every wrapped infra error (Phase1InfraError /
// Phase2InfraError / SyncInfraError sets `.cause` to the real underlying failure)
// therefore lost its root reason — e.g. a Phase2InfraError "transaction-port
// failure during snapshotAssetsForApply" recorded the wrapper but NOT the
// Supabase-Storage / Drive / SQL error that actually threw. This pins that the
// underlying cause (message, name, code, stack, nested cause) is now captured.
import { describe, expect, test } from "vitest";

import { errorPayload } from "@/lib/sync/runScheduledCronSync";
import { Phase2InfraError } from "@/lib/sync/phase2";

describe("errorPayload captures the underlying .cause (dark-path diagnosis)", () => {
  test("a wrapped Phase2InfraError surfaces its cause's name/message/code + stack", () => {
    const cause = new Error("permission denied for bucket diagram-snapshots");
    (cause as { code?: string }).code = "42501";
    const payload = errorPayload(new Phase2InfraError("snapshotAssetsForApply", cause));

    expect(payload).toMatchObject({
      name: "Phase2InfraError",
      operation: "snapshotAssetsForApply",
      cause: {
        name: "Error",
        message: "permission denied for bucket diagram-snapshots",
        code: "42501",
      },
    });
    expect(typeof (payload.cause as { stack?: unknown }).stack).toBe("string");
  });

  test("nested causes are captured to a bounded depth", () => {
    const root = new Error("root boom");
    const mid = new Error("mid");
    (mid as { cause?: unknown }).cause = root;
    const top = new Error("top");
    (top as { cause?: unknown }).cause = mid;

    expect(errorPayload(top)).toMatchObject({
      message: "top",
      cause: { message: "mid", cause: { message: "root boom" } },
    });
  });

  test("a non-Error cause is stringified", () => {
    const err = new Error("wrapper");
    (err as { cause?: unknown }).cause = "plain string cause";
    expect(errorPayload(err)).toMatchObject({ cause: { message: "plain string cause" } });
  });

  test("no cause → no `cause` key (back-compat with existing payload shape)", () => {
    const payload = errorPayload(new Error("simple"));
    expect(payload).not.toHaveProperty("cause");
    expect(payload).toMatchObject({ name: "Error", message: "simple" });
  });
});
