// tests/log/requestContext.test.ts
import { describe, expect, test } from "vitest";
import {
  deriveRequestId,
  getRequestContext,
  runWithRequestContext,
  setCronInFlight,
  setRequestShowId,
} from "@/lib/log/requestContext";

describe("requestContext", () => {
  test("getRequestContext is undefined outside a run", () => {
    expect(getRequestContext()).toBeUndefined();
  });
  test("context is visible across awaited async + Promise.all", async () => {
    await runWithRequestContext({ requestId: "req-1" }, async () => {
      expect(getRequestContext()?.requestId).toBe("req-1");
      await Promise.all([
        (async () => expect(getRequestContext()?.requestId).toBe("req-1"))(),
        (async () => {
          await Promise.resolve();
          expect(getRequestContext()?.requestId).toBe("req-1");
        })(),
      ]);
    });
    expect(getRequestContext()).toBeUndefined();
  });
  test("deriveRequestId prefers x-vercel-id, else a uuid", () => {
    expect(deriveRequestId(new Headers({ "x-vercel-id": "iad1::abc" }))).toBe("iad1::abc");
    const minted = deriveRequestId(new Headers());
    expect(minted).toMatch(/^[0-9a-f-]{36}$/);
  });
  test("setRequestShowId mutates the active store only", async () => {
    await runWithRequestContext({ requestId: "r" }, () => {
      setRequestShowId("show-9");
      expect(getRequestContext()?.showId).toBe("show-9");
    });
    setRequestShowId("ignored"); // no active store → no throw
    expect(getRequestContext()).toBeUndefined();
  });
});

describe("setCronInFlight", () => {
  test("mutates the current store in place (phase/driveFileId/count)", () => {
    runWithRequestContext({ requestId: "r1" }, () => {
      setCronInFlight({ phase: "file-loop", driveFileId: "df-1", processedCount: 2 });
      expect(getRequestContext()).toMatchObject({
        cronPhase: "file-loop",
        cronInFlightDriveFileId: "df-1",
        cronProcessedCount: 2,
      });
    });
  });

  test("clears driveFileId to null (no stale leak, exactOptional-safe)", () => {
    runWithRequestContext({ requestId: "r1" }, () => {
      setCronInFlight({ driveFileId: "df-1" });
      setCronInFlight({ driveFileId: null, processedCount: 3 });
      expect(getRequestContext()?.cronInFlightDriveFileId).toBeNull();
    });
  });

  test("partial patch leaves other fields untouched", () => {
    runWithRequestContext({ requestId: "r1" }, () => {
      setCronInFlight({ phase: "missing-shows", driveFileId: "df-9" });
      setCronInFlight({ phase: "file-loop" }); // only phase
      expect(getRequestContext()).toMatchObject({
        cronPhase: "file-loop",
        cronInFlightDriveFileId: "df-9",
      });
    });
  });

  test("no-op outside an ALS scope (does not throw)", () => {
    expect(() => setCronInFlight({ phase: "x" })).not.toThrow();
  });
});
