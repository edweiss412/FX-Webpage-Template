import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink, type LogRecord } from "@/lib/log";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";

// Spy on the failure-visible writer so we can (a) observe the durable event payload and (b) drive
// the { ok: false } branch. The emitter imports persistAppEventStrict from this module.
const persistAppEventStrict = vi.fn(async () => ({ ok: true }) as { ok: true });
vi.mock("@/lib/log/persist", () => ({
  persistAppEventStrict: (record: unknown) => persistAppEventStrict(record as never),
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

function notice(
  changes: RoleFlagsNotice["context"]["changes"],
): RoleFlagsNotice {
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

  test("a LEAD gain emits one durable LEAD_ROLE_APPLIED with direction 'gained'", async () => {
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
        direction: "gained",
      },
    });
  });

  test("a LEAD loss emits direction 'lost'", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Bob", prior_flags: ["LEAD", "A1"], new_flags: ["A1"] }]),
      { source: "sync.roleFlags" },
    );
    const arg = persistAppEventStrict.mock.calls[0]![0] as { context: { direction: string } };
    expect(arg.context.direction).toBe("lost");
  });

  test("a non-LEAD role change emits NO durable event (LEAD-bit subset only)", async () => {
    await emitLeadRoleApplied(
      notice([{ crew_name: "Carol", prior_flags: ["A1"], new_flags: ["A1", "BO"] }]),
      { source: "sync.roleFlags" },
    );
    expect(persistAppEventStrict).not.toHaveBeenCalled();
  });

  test("only the LEAD-subset entries emit when a batch mixes LEAD and non-LEAD changes", async () => {
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
    persistAppEventStrict.mockResolvedValueOnce({ ok: false, error: new Error("db down") } as never);
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
