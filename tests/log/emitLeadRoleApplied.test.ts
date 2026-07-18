import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink, type LogRecord } from "@/lib/log";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";

// Spy on the failure-visible writer so we can (a) observe the durable event payload and (b) drive
// the { ok: false } branch. The emitter imports persistAppEventStrict from this module.
type StrictResult = { ok: true } | { ok: false; error: unknown };
type CapabilityChange = { flag: "LEAD" | "FINANCIALS"; direction: "gained" | "lost" };
const persistAppEventStrict = vi.fn(
  async (_record: Record<string, unknown>): Promise<StrictResult> => ({ ok: true }),
);
vi.mock("@/lib/log/persist", () => ({
  persistAppEventStrict: (record: Record<string, unknown>) => persistAppEventStrict(record),
}));

// Import AFTER the mock is registered.
const { emitLeadRoleApplied } = await import("@/lib/log/emitLeadRoleApplied");

function capture(): LogRecord[] {
  const records: LogRecord[] = [];
  setLogSink((record) => {
    records.push(record);
  });
  return records;
}

function notice(changes: RoleFlagsNotice["context"]["changes"]): RoleFlagsNotice {
  return {
    showId: "show-1",
    code: "ROLE_FLAGS_NOTICE",
    context: { drive_file_id: "file-1", changes },
  };
}

beforeEach(() => {
  persistAppEventStrict.mockClear();
  persistAppEventStrict.mockResolvedValue({ ok: true });
});
afterEach(() => resetLogSink());

// spec 2026-07-17-mi9-lead-autoapply-fyi §3.4 — a durable, non-coalescing LEAD_ROLE_APPLIED
// app_event per LEAD-bit change, failure-visible.
describe("emitLeadRoleApplied (spec §3.4)", () => {
  test("undefined notice → no durable event", async () => {
    await emitLeadRoleApplied(undefined, { source: "sync.roleFlags" });
    expect(persistAppEventStrict).not.toHaveBeenCalled();
  });

  test("a LEAD gain emits one durable LEAD_ROLE_APPLIED with capability_changes [{LEAD,gained}]", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Alice", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }]),
      { source: "sync.roleFlags" },
    );
    expect(persistAppEventStrict).toHaveBeenCalledTimes(1);
    const arg = persistAppEventStrict.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      level: "info",
      code: "LEAD_ROLE_APPLIED",
      showId: "show-1",
      driveFileId: "file-1",
      context: {
        crew_name: "Alice",
        prior_flags: ["A1"],
        new_flags: ["A1", "LEAD"],
        capability_changes: [{ flag: "LEAD", direction: "gained" }],
      },
    });
  });

  test("a LEAD loss emits capability_changes [{LEAD,lost}]", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Bob", prior_flags: ["LEAD", "A1"], new_flags: ["A1"] }]),
      { source: "sync.roleFlags" },
    );
    const arg = persistAppEventStrict.mock.calls[0]![0] as {
      context: { capability_changes: unknown };
    };
    expect(arg.context.capability_changes).toEqual([{ flag: "LEAD", direction: "lost" }]);
  });

  // Capability-narrow (2026-07-17): FINANCIALS independently grants financial-data access, so a
  // FINANCIALS gain/loss must emit the durable event too — the load-bearing new-capability case.
  test("a FINANCIALS gain emits capability_changes [{FINANCIALS,gained}]", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Fin", prior_flags: [], new_flags: ["FINANCIALS"] }]),
      { source: "sync.roleFlags" },
    );
    expect(persistAppEventStrict).toHaveBeenCalledTimes(1);
    const arg = persistAppEventStrict.mock.calls[0]![0] as {
      context: { capability_changes: unknown };
    };
    expect(arg.context.capability_changes).toEqual([{ flag: "FINANCIALS", direction: "gained" }]);
  });

  test("a FINANCIALS loss emits capability_changes [{FINANCIALS,lost}]", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Fin", prior_flags: ["FINANCIALS"], new_flags: [] }]),
      { source: "sync.roleFlags" },
    );
    const arg = persistAppEventStrict.mock.calls[0]![0] as {
      context: { capability_changes: unknown };
    };
    expect(arg.context.capability_changes).toEqual([{ flag: "FINANCIALS", direction: "lost" }]);
  });

  // A compound transition (LEAD lost AND FINANCIALS gained in one change) must render BOTH per-flag
  // entries in ONE event — a scalar direction could not represent it.
  test("a compound LEAD→FINANCIALS transition emits both per-flag capability_changes", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Compound", prior_flags: ["LEAD"], new_flags: ["FINANCIALS"] }]),
      { source: "sync.roleFlags" },
    );
    expect(persistAppEventStrict).toHaveBeenCalledTimes(1);
    const arg = persistAppEventStrict.mock.calls[0]![0] as {
      context: { capability_changes: CapabilityChange[] };
    };
    expect(new Set(arg.context.capability_changes)).toEqual(
      new Set([
        { flag: "LEAD", direction: "lost" },
        { flag: "FINANCIALS", direction: "gained" },
      ]),
    );
  });

  test("a simultaneous [] → [LEAD, FINANCIALS] grant emits both as gained", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Both", prior_flags: [], new_flags: ["LEAD", "FINANCIALS"] }]),
      { source: "sync.roleFlags" },
    );
    const arg = persistAppEventStrict.mock.calls[0]![0] as {
      context: { capability_changes: CapabilityChange[] };
    };
    expect(new Set(arg.context.capability_changes)).toEqual(
      new Set([
        { flag: "LEAD", direction: "gained" },
        { flag: "FINANCIALS", direction: "gained" },
      ]),
    );
  });

  test("a scope-tile-only role change emits NO durable event (capability subset only)", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Carol", prior_flags: ["A1"], new_flags: ["A1", "BO"] }]),
      { source: "sync.roleFlags" },
    );
    expect(persistAppEventStrict).not.toHaveBeenCalled();
  });

  test("only the capability-subset entries emit when a batch mixes capability and scope-tile changes", async () => {
    await emitLeadRoleApplied(
      notice([
        { crew_name: "Alice", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] },
        { crew_name: "Carol", prior_flags: ["A1"], new_flags: ["V1"] },
        { crew_name: "Dan", prior_flags: [], new_flags: ["LEAD"] },
      ]),
      { source: "sync.roleFlags" },
    );
    expect(persistAppEventStrict).toHaveBeenCalledTimes(2);
    const names = persistAppEventStrict.mock.calls.map(
      (c) => (c[0] as { context: { crew_name: string } }).context.crew_name,
    );
    expect(names).toEqual(["Alice", "Dan"]);
  });

  test("payload is redaction-safe: no email/phone-shaped values", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Alice", prior_flags: ["A1"], new_flags: ["LEAD"] }]),
      { source: "sync.roleFlags" },
    );
    const arg = persistAppEventStrict.mock.calls[0]![0];
    expect(JSON.stringify(arg.context)).not.toMatch(/@|\bphone\b/i);
  });

  // §3.4 failure policy (Codex R4): a { ok: false } from the strict writer must be SURFACED loudly
  // (log.error with a distinct code), never silently swallowed. Failure mode caught: prescribing a
  // best-effort emit that drops the authoritative audit under telemetry degradation.
  test("a { ok: false } strict-write failure is surfaced via log.error, not swallowed", async () => {
    const records = capture();
    persistAppEventStrict.mockResolvedValueOnce({
      ok: false,
      error: new Error("db down"),
    } as never);
    await emitLeadRoleApplied(
      notice([{ crew_name: "Alice", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }]),
      { source: "sync.roleFlags" },
    );
    const errorRec = records.find((r) => r.level === "error");
    expect(errorRec, "an error-level record must be emitted on strict-write failure").toBeDefined();
    expect(errorRec!.code).toBe("LEAD_ROLE_APPLIED_PERSIST_FAILED");
    expect(errorRec!.showId).toBe("show-1");
  });

  test("a successful strict write emits NO error record", async () => {
    const records = capture();
    await emitLeadRoleApplied(
      notice([{ crew_name: "Alice", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }]),
      { source: "sync.roleFlags" },
    );
    expect(records.filter((r) => r.level === "error")).toEqual([]);
  });
});
