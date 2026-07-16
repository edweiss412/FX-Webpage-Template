/**
 * tests/admin/setUseRawDecisionAction.test.ts
 * Per-show use-raw toggle action (spec 2026-07-10 §9b, plan Task 7).
 *
 * Full state-aware write matrix (§3), (code, contentHash) equivalence-class
 * governance, toggle-off failure symmetry, warningRef three-branch validation
 * (incl. stale observedContentHash), server-derived provenance + lock key, no-TOCTOU
 * (locked re-read wins), sequential-not-nested DEFERRED re-sync delegation (spec
 * 2026-07-16-use-raw-bg-apply: the apply is post-response; settled = no-op/
 * already-settled only), and infra-fault typed result. All deps are injected via
 * module mocks (no DB, no real lock).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

// ── mocks ───────────────────────────────────────────────────────────────────
const requireAdminMock = vi.fn(async () => undefined);
const requireAdminIdentityMock = vi.fn(async () => ({ email: "admin@example.com" }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdminMock(),
  requireAdminIdentity: () => requireAdminIdentityMock(),
  AdminInfraError: class AdminInfraError extends Error {},
}));

const resolveShowByIdMock = vi.fn(async (_id: string) => ({
  kind: "found" as const,
  show: { id: "show-1", driveFileId: "df-server" },
}));
vi.mock("@/app/admin/show/[slug]/_actions/shared", () => ({
  resolveShowById: (id: string) => resolveShowByIdMock(id),
}));

const revalidateShowMock = vi.fn((_id: string) => undefined);
vi.mock("@/lib/data/showCacheTag", () => ({
  revalidateShow: (id: string) => revalidateShowMock(id),
}));

const logAdminOutcomeMock = vi.fn(async (_o: unknown) => undefined);
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (o: unknown) => logAdminOutcomeMock(o),
}));

// Fake withShowLock: runs the callback with a scripted tx; captures the write and
// the acquire/release ordering. `txScript` drives the in-lock reads.
type TxScript = { warnings: ParseWarning[]; decisions: unknown[]; throwOnRead?: boolean };
let txScript: TxScript;
let capturedWrite: { sql: string; params: unknown[] } | null;
let lockKeys: string[];
let callOrder: string[];

const withShowLockMock = vi.fn(
  async (driveFileId: string, fn: (tx: unknown) => unknown): Promise<unknown> => {
    lockKeys.push(driveFileId);
    callOrder.push("lock:acquire");
    const tx = {
      queryOne: async (sql: string, params: unknown[]) => {
        if (txScript.throwOnRead) throw new Error("simulated postgres fault");
        if (/update/i.test(sql)) {
          capturedWrite = { sql, params };
          return null;
        }
        if (/parse_warnings/i.test(sql)) return { parse_warnings: txScript.warnings };
        if (/use_raw_decisions/i.test(sql)) return { use_raw_decisions: txScript.decisions };
        return null;
      },
    };
    const r = await fn(tx);
    callOrder.push("lock:release");
    return r;
  },
);
vi.mock("@/lib/sync/lockedShowTx", () => ({
  withShowLock: (...a: unknown[]) =>
    (withShowLockMock as unknown as (...x: unknown[]) => unknown)(...a),
}));

const runManualSyncForShowMock = vi.fn(async (_df: string): Promise<unknown> => {
  callOrder.push("resync");
  return { outcome: "applied", showId: "show-1" };
});
vi.mock("@/lib/sync/runManualSyncForShow", () => ({
  runManualSyncForShow: (df: string) => runManualSyncForShowMock(df),
}));

// Deferred-task capture (spec 2026-07-16-use-raw-bg-apply): the action must
// NEVER run the sync inline. Tests drain tasks explicitly and awaited — no
// promise may leak past teardown. Registered BEFORE the action import so the
// action binds this capture mock, never the real next/server after().
let deferredTasks: Array<() => Promise<void>>;
const deferPostResponseMock = vi.fn((task: () => Promise<void>) => {
  callOrder.push("defer:schedule");
  deferredTasks.push(task);
});
vi.mock("@/lib/async/deferPostResponse", () => ({
  deferPostResponse: (t: () => Promise<void>) => deferPostResponseMock(t),
}));

import { setUseRawDecisionAction } from "@/app/admin/show/[slug]/_actions/useRaw";

// ── fixtures ──────────────────────────────────────────────────────────────
const roomWarning = (
  contentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name = "GENERAL SESSION",
): ParseWarning => ({
  severity: "warn",
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  message: "ambiguous room header",
  blockRef: { kind: "rooms", name },
  resolution: {
    resolvable: true,
    contentHash,
    parsed: { kind: "rooms", name, dimensions: "40x60", floor: null },
    replacement: { kind: "rooms", name: `${name} / 40x60`, dimensions: null, floor: null },
  },
});
const ref = (
  observedContentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name = "GENERAL SESSION",
) => ({
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  blockRef: { kind: "rooms" as const, name },
  observedContentHash,
});
const rawDecision = (
  applied: boolean,
  contentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
): UseRawDecision => ({
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  contentHash,
  target: { kind: "rooms", name: "GENERAL SESSION" },
  preference: "raw",
  applied,
  decidedAt: "2026-07-10T00:00:00.000Z",
  decidedBy: "prior@example.com",
});
const writtenDecisions = () => capturedWrite?.params[1] as UseRawDecision[] | undefined;

beforeEach(() => {
  txScript = { warnings: [roomWarning()], decisions: [] };
  capturedWrite = null;
  lockKeys = [];
  callOrder = [];
  deferredTasks = [];
  requireAdminIdentityMock.mockResolvedValue({ email: "admin@example.com" });
  resolveShowByIdMock.mockResolvedValue({
    kind: "found",
    show: { id: "show-1", driveFileId: "df-server" },
  });
  runManualSyncForShowMock.mockImplementation(async () => {
    callOrder.push("resync");
    return { outcome: "applied", showId: "show-1" };
  });
});
afterEach(() => vi.clearAllMocks());

describe("state-aware write matrix (§3)", () => {
  test("transform-active → ON writes {raw, applied:false} (NOT applied:true)", async () => {
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    const d = writtenDecisions()!;
    expect(d).toHaveLength(1);
    expect(d[0]!.preference).toBe("raw");
    expect(d[0]!.applied).toBe(false);
    expect(runManualSyncForShowMock).not.toHaveBeenCalled(); // deferred, not inline
    expect(deferredTasks).toHaveLength(1);
    expect(r).toEqual({ ok: true, state: "apply_pending" }); // spec 2026-07-16 §2.3
  });

  test("clear-pending → ON writes {raw, applied:true} and does NOT re-sync (settled)", async () => {
    txScript.decisions = [
      { ...rawDecision(false), preference: "transform" }, // {transform, false}
    ];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    const d = writtenDecisions()!;
    expect(d[0]!.preference).toBe("raw");
    expect(d[0]!.applied).toBe(true);
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, state: "settled" });
  });

  test("raw-active → OFF writes {transform, applied:false} and defers the re-sync", async () => {
    txScript.decisions = [rawDecision(true)];
    await setUseRawDecisionAction("show-1", ref(), false);
    const d = writtenDecisions()!;
    expect(d[0]!.preference).toBe("transform");
    expect(d[0]!.applied).toBe(false);
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(deferredTasks).toHaveLength(1);
    await deferredTasks[0]!();
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
    expect(runManualSyncForShowMock).toHaveBeenCalledWith("df-server");
  });

  test("apply-pending → OFF deletes the row (GC, settled, no re-sync)", async () => {
    txScript.decisions = [rawDecision(false)];
    const r = await setUseRawDecisionAction("show-1", ref(), false);
    expect(writtenDecisions()).toEqual([]); // row removed
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, state: "settled" });
  });

  test("apply-pending → ON is a no-op (no write, no emit, settled)", async () => {
    txScript.decisions = [rawDecision(false)];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(capturedWrite).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, state: "settled" });
  });

  test("transform-active → OFF is a no-op", async () => {
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), false);
    expect(capturedWrite).toBeNull();
    expect(r).toEqual({ ok: true, state: "settled" });
  });
});

describe("(code, contentHash) equivalence class (R5)", () => {
  test("one decision governs N>1 warnings sharing the hash (keyed by content, not blockRef)", async () => {
    txScript.warnings = [
      roomWarning("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "ROOM A"),
      roomWarning("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "ROOM B"),
    ];
    txScript.decisions = [];
    await setUseRawDecisionAction(
      "show-1",
      ref("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "ROOM A"),
      true,
    );
    const d = writtenDecisions()!;
    // Exactly ONE content-scoped decision written for the shared hash — not one per cell.
    expect(d).toHaveLength(1);
    expect(d[0]!.contentHash).toBe(
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    );
  });

  test("clear-pending → ON over the class writes applied:true (entity rows uniform per §3)", async () => {
    txScript.warnings = [
      roomWarning("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "ROOM A"),
      roomWarning("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "ROOM B"),
    ];
    txScript.decisions = [
      {
        ...rawDecision(false, "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"),
        preference: "transform",
      },
    ];
    await setUseRawDecisionAction(
      "show-1",
      ref("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "ROOM A"),
      true,
    );
    expect(writtenDecisions()![0]!.applied).toBe(true);
  });
});

describe("toggle-off / on failure symmetry (R8)", () => {
  test("re-sync failure after toggle-OFF leaves {transform,false} durable (clear-pending, not rolled back)", async () => {
    runManualSyncForShowMock.mockImplementation(async () => {
      callOrder.push("resync");
      return { outcome: "hard_fail", code: "SHEET_UNAVAILABLE" };
    });
    txScript.decisions = [rawDecision(true)];
    const r = await setUseRawDecisionAction("show-1", ref(), false);
    expect(writtenDecisions()![0]).toMatchObject({ preference: "transform", applied: false });
    // Length assertion FIRST — a missing schedule must fail as a contract
    // violation, not a vague "deferredTasks[0] is not a function" (plan-R1 F3).
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(deferredTasks).toHaveLength(1);
    await deferredTasks[0]!(); // drained task runs the failing sync; result already returned
    expect(r).toEqual({ ok: true, state: "apply_pending" });
  });

  test("re-sync failure after toggle-ON leaves {raw,false} durable (apply-pending)", async () => {
    runManualSyncForShowMock.mockImplementation(async () => {
      callOrder.push("resync");
      return { outcome: "hard_fail", code: "SHEET_UNAVAILABLE" };
    });
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(writtenDecisions()![0]).toMatchObject({ preference: "raw", applied: false });
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(deferredTasks).toHaveLength(1);
    await deferredTasks[0]!(); // drained task runs the failing sync; result already returned
    expect(r).toEqual({ ok: true, state: "apply_pending" });
  });

  test("a THROWN re-sync fault does NOT escape after the decision committed → apply_pending (Codex R6 F3)", async () => {
    // The decision is committed BEFORE the sync + the audit outcome already emitted, so a
    // thrown (not returned) sync fault must stay contained: the action resolves apply_pending
    // and the DRAINED task resolves too (spec 2026-07-16 §4 test 3), never a raw client error.
    runManualSyncForShowMock.mockImplementation(async () => {
      callOrder.push("resync");
      throw new Error("postgres connection reset mid-apply");
    });
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    // The decision is still durably written (preference:raw, not yet applied)...
    expect(writtenDecisions()![0]).toMatchObject({ preference: "raw", applied: false });
    // ...and the action resolves to apply_pending instead of rejecting.
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    // Containment: the drained task RESOLVES despite the sync throw, and the
    // in-task revalidate still fires (regression pin on always-revalidate).
    expect(deferredTasks).toHaveLength(1);
    await expect(deferredTasks[0]!()).resolves.toBeUndefined();
    expect(revalidateShowMock).toHaveBeenCalledTimes(2);
  });
});

describe("warningRef validation (three branches)", () => {
  test("(a) no matching in-scope warning → warning_not_found, no write", async () => {
    txScript.warnings = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: false, code: "warning_not_found" });
    expect(capturedWrite).toBeNull();
  });

  test("(b) resolution absent / resolvable:false → warning_not_resolvable, no write", async () => {
    txScript.warnings = [
      {
        severity: "warn",
        code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
        message: "guard",
        blockRef: { kind: "rooms", name: "GENERAL SESSION" },
        resolution: { resolvable: false, reason: "empty-raw" },
      },
    ];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: false, code: "warning_not_resolvable" });
    expect(capturedWrite).toBeNull();
  });

  test("(c) stale observedContentHash → warning_stale, no write", async () => {
    txScript.warnings = [
      roomWarning("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
    ];
    const r = await setUseRawDecisionAction("show-1", ref("client-saw-old"), true);
    expect(r).toEqual({ ok: false, code: "warning_stale" });
    expect(capturedWrite).toBeNull();
  });

  test("stored contentHash/target come from the LIVE warning (client hash is only a staleness token)", async () => {
    txScript.warnings = [
      roomWarning("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
    ];
    await setUseRawDecisionAction(
      "show-1",
      ref("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
      true,
    );
    const d = writtenDecisions()![0]!;
    expect(d.contentHash).toBe("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"); // the LIVE hash, server-derived
    expect(d.target).toEqual({ kind: "rooms", name: "GENERAL SESSION" });
  });
});

describe("server-derived provenance + lock key", () => {
  test("decidedBy is requireAdminIdentity email; decidedAt is a server-clock ISO", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "real-admin@fx.test" });
    await setUseRawDecisionAction("show-1", ref(), true);
    const d = writtenDecisions()![0]!;
    expect(d.decidedBy).toBe("real-admin@fx.test");
    expect(new Date(d.decidedAt).toISOString()).toBe(d.decidedAt);
    expect(Date.now() - new Date(d.decidedAt).getTime()).toBeLessThan(60_000);
  });

  test("lock key is server-derived from the loaded show, not any client value", async () => {
    resolveShowByIdMock.mockResolvedValue({
      kind: "found",
      show: { id: "show-1", driveFileId: "df-from-row" },
    });
    await setUseRawDecisionAction("client-forged-show-id", ref(), true);
    expect(lockKeys).toEqual(["df-from-row"]);
  });
});

describe("no TOCTOU — locked re-read wins", () => {
  test("validation runs against the IN-LOCK warnings, not a pre-lock snapshot", async () => {
    // The ONLY pre-lock read is resolveShowById (returns just the drive_file_id). The
    // in-lock warning carries a NEW hash (a concurrent sync re-parsed), so a ref that
    // would have validated against the stale pre-lock content is rejected in-lock.
    txScript.warnings = [
      roomWarning("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ];
    const r = await setUseRawDecisionAction(
      "show-1",
      ref("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      true,
    );
    expect(r).toEqual({ ok: false, code: "warning_stale" });
    // resolveShowById never surfaced warnings — it only produced the lock key.
    expect(lockKeys).toEqual(["df-server"]);
  });
});

describe("sequential-not-nested + deferred re-sync order", () => {
  test("apply is scheduled AFTER lock release AND after the emit; sync runs only when drained", async () => {
    logAdminOutcomeMock.mockImplementationOnce(async () => {
      callOrder.push("emit");
    });
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(callOrder).toEqual(["lock:acquire", "lock:release", "emit", "defer:schedule"]);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    await deferredTasks[0]!();
    expect(callOrder).toEqual(["lock:acquire", "lock:release", "emit", "defer:schedule", "resync"]);
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
  });

  test("re-sync is NOT called inside the lock (no nested double-hold)", async () => {
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref(), true);
    await deferredTasks[0]!();
    // "resync" must appear strictly after "lock:release".
    expect(callOrder.indexOf("resync")).toBeGreaterThan(callOrder.indexOf("lock:release"));
  });
});

describe("background apply (spec 2026-07-16-use-raw-bg-apply)", () => {
  test("mutated non-settled write returns apply_pending WITHOUT running the sync inline (test 1)", async () => {
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(deferredTasks).toHaveLength(1);
  });

  test("drained task runs the sync then revalidates; pre-return revalidate already fired (test 2)", async () => {
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref(), true);
    // Exactly ONE revalidate before draining — the synchronous pre-return call
    // (catches the pre-return revalidate moving into the deferred task).
    expect(revalidateShowMock).toHaveBeenCalledTimes(1);
    expect(revalidateShowMock).toHaveBeenCalledWith("show-1");
    await deferredTasks[0]!();
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
    expect(runManualSyncForShowMock).toHaveBeenCalledWith("df-server");
    expect(revalidateShowMock).toHaveBeenCalledTimes(2);
    expect(revalidateShowMock).toHaveBeenNthCalledWith(2, "show-1");
  });

  // Split per settled path (plan-R1 F2): each proves its own no-schedule AND
  // its settled result, with no spy state shared across action calls.
  test("alreadySettled write (clear-pending → ON) schedules nothing and returns settled (test 4a)", async () => {
    txScript.decisions = [{ ...rawDecision(false), preference: "transform" }];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "settled" });
    expect(deferredTasks).toHaveLength(0);
    expect(deferPostResponseMock).not.toHaveBeenCalled();
  });

  test("non-mutated toggle (apply-pending → ON) schedules nothing and returns settled (test 4b)", async () => {
    txScript.decisions = [rawDecision(false)];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "settled" });
    expect(deferredTasks).toHaveLength(0);
    expect(deferPostResponseMock).not.toHaveBeenCalled();
  });

  test("synchronous scheduling fault is contained: apply_pending, emit-before-schedule ordering intact (test 7)", async () => {
    // Ordering pin (plan-R1 F4): the scheduling attempt must come AFTER the
    // post-commit emit and AFTER lock release — a swallowed fault must not be
    // able to mask a reordering of the post-commit sequence.
    deferPostResponseMock.mockImplementationOnce(() => {
      callOrder.push("defer:throw");
      throw new Error("after() called outside a request scope");
    });
    logAdminOutcomeMock.mockImplementationOnce(async () => {
      callOrder.push("emit");
    });
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    expect(callOrder).toEqual(["lock:acquire", "lock:release", "emit", "defer:throw"]);
    // The action really called deferPostResponse WITH a task (plan-R2 F1) —
    // callOrder alone proves a local marker ran, not the call contract.
    expect(deferPostResponseMock).toHaveBeenCalledTimes(1);
    expect(deferPostResponseMock.mock.calls[0]![0]).toBeInstanceOf(Function);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(revalidateShowMock).toHaveBeenCalledTimes(1); // synchronous pre-return call
  });

  test("an in-task revalidate throw is also contained — drained task resolves (plan-R3 F1)", async () => {
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref(), true);
    // First (synchronous pre-return) revalidate already succeeded; make the
    // SECOND (in-task) call throw — the task must still resolve, never reject.
    revalidateShowMock.mockImplementationOnce(() => {
      throw new Error("revalidateTag outside request scope");
    });
    await expect(deferredTasks[0]!()).resolves.toBeUndefined();
    // The sync still ran BEFORE the throwing revalidate (plan-R4 A2 — a broken
    // task that skips the sync must not pass this test).
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
    expect(revalidateShowMock).toHaveBeenCalledTimes(2);
  });

  test("an applied sync outcome no longer upgrades the result to settled (test 8)", async () => {
    // Suite default mock resolves { outcome: "applied" } — the action must
    // return apply_pending BEFORE the task is drained, and draining changes
    // nothing about the returned value (pins spec §2.3; failure mode:
    // reintroducing the sync.outcome === "applied" → settled mapping).
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    await deferredTasks[0]!();
    expect(r).toEqual({ ok: true, state: "apply_pending" });
  });
});

describe("infra-fault typed result", () => {
  test("a postgres throw mid-lock returns { ok:false, code:'infra_error' }, no emit", async () => {
    txScript.throwOnRead = true;
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("an OUTER lock-acquisition throw → typed infra_error, never an escaping reject (Codex R8 F1)", async () => {
    // The callback catches its OWN in-lock faults; this simulates the lock WRAPPER itself
    // throwing (acquisition / connection setup, before/around the callback). It must surface
    // as a typed result (invariant 9), not reject the server action.
    withShowLockMock.mockImplementationOnce(async () => {
      throw new Error("advisory lock acquisition failed");
    });
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: false, code: "infra_error" });
  });

  test("show resolution infra_error surfaces as infra_error (not not-found)", async () => {
    resolveShowByIdMock.mockResolvedValue({ kind: "infra_error" } as never);
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: false, code: "infra_error" });
  });

  test("missing show → show_not_found", async () => {
    resolveShowByIdMock.mockResolvedValue({ kind: "not_found" } as never);
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: false, code: "show_not_found" });
  });
});

describe("post-commit forensic emit", () => {
  test("emits USE_RAW_DECISION_SET post-commit on a toggle-ON mutation", async () => {
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref(), true);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "USE_RAW_DECISION_SET",
        source: "admin.show.useRaw",
        actorEmail: "admin@example.com",
        showId: "show-1",
      }),
    );
  });

  test("emits USE_RAW_DECISION_CLEARED on a toggle-OFF mutation", async () => {
    txScript.decisions = [rawDecision(true)];
    await setUseRawDecisionAction("show-1", ref(), false);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "USE_RAW_DECISION_CLEARED" }),
    );
  });
});
