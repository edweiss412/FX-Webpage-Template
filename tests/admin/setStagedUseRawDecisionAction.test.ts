/**
 * tests/admin/setStagedUseRawDecisionAction.test.ts
 * Wizard-staged use-raw toggle action (spec 2026-07-10 §9a, plan Task 8).
 *
 * Pre-create: writes to pending_syncs.use_raw_decisions under withShowLock; toggle-ON
 * upserts {raw, applied:false}; toggle-OFF hard-deletes; NO re-apply (no show yet).
 * The client passes driveFileId (the exact staged-sheet row locator — two sheets in one
 * session can share a warning hash, F3); the action SERVER-VERIFIES the (session,
 * driveFileId) pairing before locking so a client arg can't steer the lock. warningRef
 * gets the three-branch validation (against that row's parse_result.warnings, in-lock);
 * stored contentHash/target come from the live staged warning; infra faults are typed.
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

vi.mock("@/lib/data/showCacheTag", () => ({ revalidateShow: vi.fn() }));

const logAdminOutcomeMock = vi.fn(async (_o: unknown) => undefined);
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (o: unknown) => logAdminOutcomeMock(o),
}));

// Pre-lock resolver reads pending_syncs via createSupabaseServerClient — a thenable
// builder resolving { data, error }.
let preLockResult: { data: unknown; error: unknown };
let throwOnConstruct = false;
function makeClient(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  for (const m of ["select", "eq", "limit"]) node[m] = self;
  node.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onF, onR);
  return { from: () => node };
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (throwOnConstruct) throw new Error("simulated construction fault");
    return makeClient(preLockResult);
  },
}));

// In-lock: fake withShowLock tx reading/writing pending_syncs.
type TxScript = {
  row: { parse_result: unknown; use_raw_decisions: unknown } | null;
  throwOnRead?: boolean;
};
let txScript: TxScript;
let capturedWrite: { sql: string; params: unknown[] } | null;
let lockKeys: string[];

const withShowLockMock = vi.fn(
  async (driveFileId: string, fn: (tx: unknown) => unknown): Promise<unknown> => {
    lockKeys.push(driveFileId);
    const tx = {
      queryOne: async (sql: string, params: unknown[]) => {
        if (txScript.throwOnRead) throw new Error("simulated postgres fault");
        if (/update/i.test(sql)) {
          capturedWrite = { sql, params };
          return null;
        }
        return txScript.row;
      },
    };
    return await fn(tx);
  },
);
vi.mock("@/lib/sync/lockedShowTx", () => ({
  withShowLock: (...a: unknown[]) =>
    (withShowLockMock as unknown as (...x: unknown[]) => unknown)(...a),
}));

import { setStagedUseRawDecisionAction } from "@/app/admin/onboarding/_actions/useRawStaged";

// ── fixtures ──────────────────────────────────────────────────────────────
const roomWarning = (
  contentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  resolvable = true,
): ParseWarning =>
  resolvable
    ? {
        severity: "warn",
        code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
        message: "ambiguous room header",
        blockRef: { kind: "rooms", name: "GENERAL SESSION" },
        resolution: {
          resolvable: true,
          contentHash,
          parsed: { kind: "rooms", name: "GENERAL SESSION", dimensions: "40x60", floor: null },
          replacement: {
            kind: "rooms",
            name: "GENERAL SESSION / 40x60",
            dimensions: null,
            floor: null,
          },
        },
      }
    : {
        severity: "warn",
        code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
        message: "guard",
        blockRef: { kind: "rooms", name: "GENERAL SESSION" },
        resolution: { resolvable: false, reason: "empty-raw" },
      };
const ref = (
  observedContentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
) => ({
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  blockRef: { kind: "rooms" as const, name: "GENERAL SESSION" },
  observedContentHash,
});
const rawDecision = (applied: boolean): UseRawDecision => ({
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  target: { kind: "rooms", name: "GENERAL SESSION" },
  preference: "raw",
  applied,
  decidedAt: "2026-07-10T00:00:00.000Z",
  decidedBy: "prior@example.com",
});
const writtenDecisions = () => capturedWrite?.params[2] as UseRawDecision[] | undefined;

beforeEach(() => {
  throwOnConstruct = false;
  preLockResult = {
    data: [{ drive_file_id: "df-uraw", parse_result: { warnings: [roomWarning()] } }],
    error: null,
  };
  txScript = { row: { parse_result: { warnings: [roomWarning()] }, use_raw_decisions: [] } };
  capturedWrite = null;
  lockKeys = [];
  requireAdminIdentityMock.mockResolvedValue({ email: "admin@example.com" });
});
afterEach(() => vi.clearAllMocks());

describe("staged write", () => {
  test("toggle ON from absent upserts {raw, applied:false}", async () => {
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    const d = writtenDecisions()!;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      preference: "raw",
      applied: false,
      contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(r).toEqual({ ok: true, state: "saved" });
  });

  test("toggle OFF hard-deletes (pre-create — no clear-pending)", async () => {
    txScript.row = {
      parse_result: { warnings: [roomWarning()] },
      use_raw_decisions: [rawDecision(false)],
    };
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), false);
    expect(writtenDecisions()).toEqual([]);
    expect(r).toEqual({ ok: true, state: "saved" });
  });

  test("staged decisions are NEVER applied:true (no entity rows pre-create)", async () => {
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(writtenDecisions()![0]!.applied).toBe(false);
    void r;
  });
});

describe("verified lock key + exact-row locator + provenance", () => {
  test("the passed driveFileId is the (server-verified) lock key AND the exact write row", async () => {
    // Pairing exists → verified; the passed driveFileId is BOTH the lock key and the
    // `where … drive_file_id = $2` row locator (never re-derived from the warningRef scan).
    preLockResult = { data: [{ drive_file_id: "df-from-staged" }], error: null };
    await setStagedUseRawDecisionAction("wiz-1", "df-from-staged", ref(), true);
    expect(lockKeys).toEqual(["df-from-staged"]);
    expect(capturedWrite?.params[1]).toBe("df-from-staged");
  });

  test("F3 — two staged sheets sharing a warning hash: writes ONLY the passed driveFileId's row", async () => {
    // Both sheets in the session own an identical warningRef (code+blockRef+contentHash) —
    // the collision the old warningRef-scan resolver mis-attributed to the FIRST sheet.
    // The explicit driveFileId must win: lock + write target sheet-B, never sheet-A.
    preLockResult = {
      data: [{ drive_file_id: "sheet-A" }, { drive_file_id: "sheet-B" }],
      error: null,
    };
    txScript.row = { parse_result: { warnings: [roomWarning()] }, use_raw_decisions: [] };
    await setStagedUseRawDecisionAction("wiz-1", "sheet-B", ref(), true);
    expect(lockKeys).toEqual(["sheet-B"]);
    expect(capturedWrite?.params[1]).toBe("sheet-B");
  });

  test("decidedBy from requireAdminIdentity; decidedAt is a server-clock ISO", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "staged-admin@fx.test" });
    await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    const d = writtenDecisions()![0]!;
    expect(d.decidedBy).toBe("staged-admin@fx.test");
    expect(new Date(d.decidedAt).toISOString()).toBe(d.decidedAt);
  });

  test("stored contentHash/target come from the live staged warning", async () => {
    preLockResult = {
      data: [{ drive_file_id: "df-uraw", parse_result: { warnings: [roomWarning("live")] } }],
      error: null,
    };
    txScript.row = { parse_result: { warnings: [roomWarning("live")] }, use_raw_decisions: [] };
    await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref("live"), true);
    expect(writtenDecisions()![0]!.contentHash).toBe("live");
    expect(writtenDecisions()![0]!.target).toEqual({ kind: "rooms", name: "GENERAL SESSION" });
  });
});

describe("warningRef validation (against live parse_result.warnings)", () => {
  test("no pending_syncs row for (session, driveFileId) → session_not_found (no lock, no write)", async () => {
    // The verified-pairing check fails: the client-supplied driveFileId is not staged in
    // this session, so we NEVER acquire that show's lock (client cannot steer the lock key).
    preLockResult = { data: [], error: null };
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-bogus", ref(), true);
    expect(r).toEqual({ ok: false, code: "session_not_found" });
    expect(lockKeys).toEqual([]);
    expect(capturedWrite).toBeNull();
  });

  test("resolvable:false warning → warning_not_resolvable, no write", async () => {
    preLockResult = {
      data: [
        {
          drive_file_id: "df-uraw",
          parse_result: {
            warnings: [
              roomWarning(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                false,
              ),
            ],
          },
        },
      ],
      error: null,
    };
    txScript.row = {
      parse_result: {
        warnings: [
          roomWarning("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", false),
        ],
      },
      use_raw_decisions: [],
    };
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(r).toEqual({ ok: false, code: "warning_not_resolvable" });
    expect(capturedWrite).toBeNull();
  });

  test("stale observedContentHash → warning_stale, no write", async () => {
    preLockResult = {
      data: [{ drive_file_id: "df-uraw", parse_result: { warnings: [roomWarning("live")] } }],
      error: null,
    };
    txScript.row = { parse_result: { warnings: [roomWarning("live")] }, use_raw_decisions: [] };
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref("client-old"), true);
    expect(r).toEqual({ ok: false, code: "warning_stale" });
    expect(capturedWrite).toBeNull();
  });

  test("locked re-read wins: sheet found pre-lock but warning gone in-lock → warning_not_found", async () => {
    // Pre-lock snapshot has the warning (picks the sheet); a concurrent re-ingestion
    // removed it, so the in-lock re-read has none → rejected on the authoritative read.
    preLockResult = {
      data: [{ drive_file_id: "df-uraw", parse_result: { warnings: [roomWarning()] } }],
      error: null,
    };
    txScript.row = { parse_result: { warnings: [] }, use_raw_decisions: [] };
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(r).toEqual({ ok: false, code: "warning_not_found" });
    expect(capturedWrite).toBeNull();
  });
});

describe("infra-fault typed result", () => {
  test("pre-lock client construction throw → infra_error", async () => {
    throwOnConstruct = true;
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(r).toEqual({ ok: false, code: "infra_error" });
  });

  test("pre-lock returned error → infra_error", async () => {
    preLockResult = { data: null, error: { message: "boom" } };
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(r).toEqual({ ok: false, code: "infra_error" });
  });

  test("in-lock postgres throw → infra_error, no emit", async () => {
    txScript.throwOnRead = true;
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("an OUTER lock-acquisition throw → typed infra_error, never an escaping reject (Codex R8 F1)", async () => {
    // The callback catches its OWN in-lock faults; this simulates the lock WRAPPER itself
    // throwing (acquisition / connection setup). It must surface as a typed result
    // (invariant 9), not reject the server action.
    withShowLockMock.mockImplementationOnce(async () => {
      throw new Error("advisory lock acquisition failed");
    });
    const r = await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(r).toEqual({ ok: false, code: "infra_error" });
  });
});

describe("post-commit forensic emit", () => {
  test("toggle ON emits USE_RAW_DECISION_SET (source admin.onboarding.useRawStaged)", async () => {
    await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "USE_RAW_DECISION_SET",
        source: "admin.onboarding.useRawStaged",
        actorEmail: "admin@example.com",
        wizardSessionId: "wiz-1",
        driveFileId: "df-uraw",
      }),
    );
  });

  test("toggle OFF emits USE_RAW_DECISION_CLEARED", async () => {
    txScript.row = {
      parse_result: { warnings: [roomWarning()] },
      use_raw_decisions: [rawDecision(false)],
    };
    await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), false);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "USE_RAW_DECISION_CLEARED" }),
    );
  });

  test("a no-op toggle (already in target state) does NOT emit", async () => {
    txScript.row = {
      parse_result: { warnings: [roomWarning()] },
      use_raw_decisions: [rawDecision(false)],
    };
    // toggle ON when already {raw,false} (apply-pending) → no-op.
    await setStagedUseRawDecisionAction("wiz-1", "df-uraw", ref(), true);
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(capturedWrite).toBeNull();
  });
});
