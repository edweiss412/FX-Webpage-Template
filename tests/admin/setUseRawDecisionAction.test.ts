/**
 * tests/admin/setUseRawDecisionAction.test.ts
 * Per-show use-raw toggle action (spec 2026-07-10 §9b, plan Task 7).
 *
 * Full state-aware write matrix (§3), (code, contentHash) equivalence-class
 * governance, toggle-off failure symmetry, warningRef three-branch validation
 * (incl. stale observedContentHash), server-derived provenance + lock key, no-TOCTOU
 * (locked re-read wins), sequential-not-nested re-sync delegation, and infra-fault
 * typed result. All deps are injected via module mocks (no DB, no real lock).
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

vi.mock("@/lib/data/showCacheTag", () => ({ revalidateShow: vi.fn() }));

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

import { setUseRawDecisionAction } from "@/app/admin/show/[slug]/_actions/useRaw";

// ── fixtures ──────────────────────────────────────────────────────────────
const roomWarning = (contentHash = "hash-abc", name = "GENERAL SESSION"): ParseWarning => ({
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
const ref = (observedContentHash = "hash-abc", name = "GENERAL SESSION") => ({
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  blockRef: { kind: "rooms" as const, name },
  observedContentHash,
});
const rawDecision = (applied: boolean, contentHash = "hash-abc"): UseRawDecision => ({
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
    expect(r).toEqual({ ok: true, state: "settled" }); // resync applied
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

  test("raw-active → OFF writes {transform, applied:false} and delegates re-sync", async () => {
    txScript.decisions = [rawDecision(true)];
    await setUseRawDecisionAction("show-1", ref(), false);
    const d = writtenDecisions()!;
    expect(d[0]!.preference).toBe("transform");
    expect(d[0]!.applied).toBe(false);
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
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
    txScript.warnings = [roomWarning("hash-dup", "ROOM A"), roomWarning("hash-dup", "ROOM B")];
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref("hash-dup", "ROOM A"), true);
    const d = writtenDecisions()!;
    // Exactly ONE content-scoped decision written for the shared hash — not one per cell.
    expect(d).toHaveLength(1);
    expect(d[0]!.contentHash).toBe("hash-dup");
  });

  test("clear-pending → ON over the class writes applied:true (entity rows uniform per §3)", async () => {
    txScript.warnings = [roomWarning("hash-dup", "ROOM A"), roomWarning("hash-dup", "ROOM B")];
    txScript.decisions = [{ ...rawDecision(false, "hash-dup"), preference: "transform" }];
    await setUseRawDecisionAction("show-1", ref("hash-dup", "ROOM A"), true);
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
    expect(r).toEqual({ ok: true, state: "apply_pending" });
  });

  test("a THROWN re-sync fault does NOT escape after the decision committed → apply_pending (Codex R6 F3)", async () => {
    // The decision is committed BEFORE the sync + the audit outcome already emitted, so a
    // thrown (not returned) sync fault must surface as the durable apply_pending state the UI
    // self-heals to (spec §9b), never a raw client error. Before the fix, the throw escaped.
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
    txScript.warnings = [roomWarning("live-hash")];
    const r = await setUseRawDecisionAction("show-1", ref("client-saw-old"), true);
    expect(r).toEqual({ ok: false, code: "warning_stale" });
    expect(capturedWrite).toBeNull();
  });

  test("stored contentHash/target come from the LIVE warning (client hash is only a staleness token)", async () => {
    txScript.warnings = [roomWarning("live-hash")];
    await setUseRawDecisionAction("show-1", ref("live-hash"), true);
    const d = writtenDecisions()![0]!;
    expect(d.contentHash).toBe("live-hash"); // the LIVE hash, server-derived
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
    txScript.warnings = [roomWarning("in-lock-new-hash")];
    const r = await setUseRawDecisionAction("show-1", ref("stale-pre-lock-hash"), true);
    expect(r).toEqual({ ok: false, code: "warning_stale" });
    // resolveShowById never surfaced warnings — it only produced the lock key.
    expect(lockKeys).toEqual(["df-server"]);
  });
});

describe("sequential-not-nested + delegated re-sync order", () => {
  test("re-sync is invoked AFTER the decision lock releases, exactly once, on the success path", async () => {
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(callOrder).toEqual(["lock:acquire", "lock:release", "resync"]);
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, state: "settled" });
  });

  test("re-sync is NOT called inside the lock (no nested double-hold)", async () => {
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref(), true);
    // "resync" must appear strictly after "lock:release".
    expect(callOrder.indexOf("resync")).toBeGreaterThan(callOrder.indexOf("lock:release"));
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
