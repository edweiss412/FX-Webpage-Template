import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink, type LogRecord } from "@/lib/log";
import type { UnlandedRename } from "@/lib/sync/applyParseResult";

// Spy on the failure-visible writer so we can (a) observe the durable event payload and (b) drive
// the { ok: false } branch. The emitter imports persistAppEventStrict from this module.
type StrictResult = { ok: true } | { ok: false; error: unknown };
const persistAppEventStrict = vi.fn(
  async (_record: Record<string, unknown>): Promise<StrictResult> => ({ ok: true }),
);
vi.mock("@/lib/log/persist", () => ({
  persistAppEventStrict: (record: Record<string, unknown>) => persistAppEventStrict(record),
}));

// Import AFTER the mock is registered.
const { emitIdentityLinkRenameUnlanded } = await import("@/lib/log/emitIdentityLinkRenameUnlanded");

function capture(): LogRecord[] {
  const records: LogRecord[] = [];
  setLogSink((record) => {
    records.push(record);
  });
  return records;
}

const CTX = { source: "sync.identityLink", showId: "s1", driveFileId: "d1" };

function unlanded(
  removedName: string,
  addedName: string,
  reason: UnlandedRename["reason"],
  sourceSurvived: boolean,
): UnlandedRename {
  return { pair: { removedName, addedName }, reason, sourceSurvived };
}

beforeEach(() => {
  persistAppEventStrict.mockClear();
  persistAppEventStrict.mockResolvedValue({ ok: true });
});
afterEach(() => resetLogSink());

/**
 * Spec 2026-08-03-apply-undo-audit-fidelity §2.2 (R4) — an identity-link rename that was requested
 * and did NOT land leaves no trace in the capability notice and no trace in the change-log feed, by
 * design. This forensic app_event is the ONLY signal that it happened at all, so "emitted nothing"
 * is the failure this file exists to catch.
 */
describe("emitIdentityLinkRenameUnlanded (spec §2.2)", () => {
  test("emits one event per unlanded pair, carrying the reason", async () => {
    await emitIdentityLinkRenameUnlanded(
      [unlanded("Old", "New", "target_absent", false), unlanded("A", "B", "name_held", true)],
      CTX,
    );
    expect(persistAppEventStrict).toHaveBeenCalledTimes(2);
    expect(persistAppEventStrict).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: "info",
        code: "IDENTITY_LINK_RENAME_UNLANDED",
        source: "sync.identityLink",
        showId: "s1",
        driveFileId: "d1",
        context: expect.objectContaining({
          removedName: "Old",
          addedName: "New",
          reason: "target_absent",
        }),
      }),
    );
    // Per-pair, not per-batch: the second pair must carry its OWN reason, not the first one's.
    expect(persistAppEventStrict).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        context: expect.objectContaining({
          removedName: "A",
          addedName: "B",
          reason: "name_held",
        }),
      }),
    );
    // Redaction posture: crew names only — no email, phone or token reaches the payload.
    const contexts = persistAppEventStrict.mock.calls.map((c) => c[0]!.context);
    expect(JSON.stringify(contexts)).not.toMatch(/@|\bphone\b|\btoken\b/i);
  });

  test("escalates loudly when the strict write fails, and does not throw", async () => {
    const records = capture();
    persistAppEventStrict.mockResolvedValue({ ok: false, error: new Error("boom") } as never);
    await expect(
      emitIdentityLinkRenameUnlanded([unlanded("Old", "New", "rename_no_op", false)], CTX),
    ).resolves.toBeUndefined();
    const errorRec = records.find((r) => r.level === "error");
    expect(errorRec, "an error-level record must be emitted on strict-write failure").toBeDefined();
    expect(errorRec!.code).toBe("IDENTITY_LINK_RENAME_UNLANDED_PERSIST_FAILED");
    expect(errorRec!.showId).toBe("s1");
  });

  test("emits nothing for an empty list", async () => {
    const records = capture();
    await emitIdentityLinkRenameUnlanded([], CTX);
    expect(persistAppEventStrict).not.toHaveBeenCalled();
    expect(records.filter((r) => r.level === "error")).toEqual([]);
  });
});
