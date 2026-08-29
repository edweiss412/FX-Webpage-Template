/**
 * tests/admin/stagedWarningIgnore.test.ts
 * (wizard-warning-ignore-controls spec §2.6 — Task 5)
 *
 * The FIRST-SEEN ignore backend. Pre-create there is no `shows` row and no durable
 * `ignored_warnings` row to write, so the decision is staged on
 * `pending_syncs.ignored_warnings` and carried at finalize.
 *
 * Harness shape mirrors `tests/admin/setStagedUseRawDecisionAction.test.ts` exactly:
 * module mocks (not injected dependencies) for the supabase client, `withShowLock`,
 * the admin gate, and `logAdminOutcome`, because the action under test resolves each
 * of those the way production does.
 *
 * The two assertions worth naming: the mutation must run INSIDE the lock callback
 * (a write that escapes the lock races a concurrent re-ingestion and loses), and the
 * stored `ignored_by` must be CANONICALIZED (invariant 3) — the staged entry is
 * carried verbatim into `public.ignored_warnings`, whose CHECK rejects a
 * non-canonical address, so a raw pass-through here fails silently at finalize
 * rather than here.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";

// ── mocks ───────────────────────────────────────────────────────────────────
const requireAdminMock = vi.fn(async () => undefined);
const requireAdminIdentityMock = vi.fn(async () => ({ email: "admin@example.com" }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdminMock(),
  requireAdminIdentity: () => requireAdminIdentityMock(),
  AdminInfraError: class AdminInfraError extends Error {},
}));

const logAdminOutcomeMock = vi.fn(async (_o: unknown) => undefined);
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (o: unknown) => logAdminOutcomeMock(o),
}));

// Pre-lock pairing verify reads pending_syncs through createSupabaseServerClient.
let preLockResult: { data: unknown; error: unknown };
let throwOnConstruct = false;
let rejectOnAwait = false;
function makeClient(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  for (const m of ["select", "eq", "limit"]) node[m] = self;
  node.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    rejectOnAwait
      ? Promise.reject(new Error("simulated query rejection")).then(onF, onR)
      : Promise.resolve(result).then(onF, onR);
  return { from: () => node };
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
  createSupabaseServerClient: async () => {
    if (throwOnConstruct) throw new Error("simulated construction fault");
    return makeClient(preLockResult);
  },
}));

// In-lock: a fake withShowLock tx over pending_syncs. `insideLock` records whether the
// write happened between callback entry and exit — the lock-topology proof.
type TxScript = {
  row: { parse_result: unknown; ignored_warnings: unknown } | null;
  throwOnRead?: boolean;
  skipLock?: boolean;
  throwFromWrapper?: boolean;
};
let txScript: TxScript;
let capturedWrite: { sql: string; params: unknown[] } | null;
let writeHappenedInsideLock: boolean | null;
let lockKeys: string[];
let inLockSql: string[];

const withShowLockMock = vi.fn(
  async (driveFileId: string, fn: (tx: unknown) => unknown): Promise<unknown> => {
    if (txScript.throwFromWrapper) throw new Error("simulated lock acquisition fault");
    lockKeys.push(driveFileId);
    if (txScript.skipLock) return { skipped: true };
    let open = true;
    const tx = {
      queryOne: async (sql: string, params: unknown[]) => {
        inLockSql.push(sql);
        if (/update/i.test(sql)) {
          capturedWrite = { sql, params };
          writeHappenedInsideLock = open;
          return null;
        }
        if (txScript.throwOnRead) throw new Error("simulated postgres fault");
        return txScript.row;
      },
      // The action must never reach for an RPC inside the lock (invariant 2
      // single-holder: a self-locking SECURITY DEFINER function under a held
      // JS-wrapper lock deadlocks under burst).
      rpc: () => {
        throw new Error("the in-lock body called .rpc(");
      },
    };
    try {
      return await fn(tx);
    } finally {
      open = false;
    }
  },
);
vi.mock("@/lib/sync/lockedShowTx", () => ({
  withShowLock: (...a: unknown[]) =>
    (withShowLockMock as unknown as (...x: unknown[]) => unknown)(...a),
}));

import { setStagedWarningIgnore } from "@/app/admin/onboarding/_actions/stagedWarningIgnore";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";

// ── fixtures ──────────────────────────────────────────────────────────────
const SNIPPET = "Hotel notes | double occupancy";
const CODE = "UNKNOWN_FIELD";
const FP = warningFingerprint({ code: CODE, rawSnippet: SNIPPET }) as string;

const liveWarning = (over: Partial<ParseWarning> = {}): ParseWarning => ({
  severity: "warn",
  code: CODE,
  message: "Unrecognized field.",
  rawSnippet: SNIPPET,
  ...over,
});

const args = (over: Partial<Parameters<typeof setStagedWarningIgnore>[0]> = {}) => ({
  wizardSessionId: "wiz-1",
  driveFileId: "df-wign",
  action: "ignore" as const,
  code: CODE,
  rawSnippet: SNIPPET,
  ...over,
});

const writtenEntries = () => capturedWrite?.params[2] as Array<Record<string, unknown>> | undefined;

beforeEach(() => {
  throwOnConstruct = false;
  rejectOnAwait = false;
  preLockResult = { data: [{ drive_file_id: "df-wign" }], error: null };
  txScript = { row: { parse_result: { warnings: [liveWarning()] }, ignored_warnings: [] } };
  capturedWrite = null;
  writeHappenedInsideLock = null;
  lockKeys = [];
  inLockSql = [];
  requireAdminIdentityMock.mockResolvedValue({ email: "admin@example.com" });
});
afterEach(() => vi.clearAllMocks());

describe("pairing verify + lock key", () => {
  test("an unknown (session, driveFileId) pairing refuses BEFORE taking the lock", async () => {
    preLockResult = { data: [], error: null };
    const r = await setStagedWarningIgnore(args());
    expect(r).toEqual({ ok: false, code: "session_not_found" });
    // The spy, not the result, is the point: a client arg must never steer the
    // advisory lock onto an unrelated show.
    expect(withShowLockMock).not.toHaveBeenCalled();
  });

  test("the verified driveFileId is the lock key AND the write row locator", async () => {
    await setStagedWarningIgnore(args());
    expect(lockKeys).toEqual(["df-wign"]);
    expect(capturedWrite?.params[1]).toBe("df-wign");
  });

  test("lock contention resolves to concurrent, never a silent success", async () => {
    txScript.skipLock = true;
    const r = await setStagedWarningIgnore(args());
    expect(r).toEqual({ ok: false, code: "concurrent" });
    expect(capturedWrite).toBeNull();
  });
});

describe("warning validation against the LOCKED parse", () => {
  test("no warning with that code → warning_not_found", async () => {
    txScript.row = {
      parse_result: { warnings: [liveWarning({ code: "SOMETHING_ELSE" })] },
      ignored_warnings: [],
    };
    expect(await setStagedWarningIgnore(args())).toEqual({
      ok: false,
      code: "warning_not_found",
    });
  });

  test("the locked row itself is gone → warning_not_found", async () => {
    txScript.row = null;
    expect(await setStagedWarningIgnore(args())).toEqual({
      ok: false,
      code: "warning_not_found",
    });
  });

  test("the matching warning carries no ignorable snippet → warning_not_ignorable", async () => {
    txScript.row = {
      parse_result: { warnings: [{ severity: "warn", code: CODE, message: "no snippet" }] },
      ignored_warnings: [],
    };
    expect(await setStagedWarningIgnore(args())).toEqual({
      ok: false,
      code: "warning_not_ignorable",
    });
  });

  test("the CLIENT's own snippet is blank → warning_not_ignorable", async () => {
    expect(await setStagedWarningIgnore(args({ rawSnippet: "   " }))).toEqual({
      ok: false,
      code: "warning_not_ignorable",
    });
  });

  test("identity drifted after a rescan → warning_stale", async () => {
    // Same code, still ignorable, but the snippet moved — the fingerprint the client
    // holds no longer names anything live.
    txScript.row = {
      parse_result: { warnings: [liveWarning({ rawSnippet: "Hotel notes | single" })] },
      ignored_warnings: [],
    };
    expect(await setStagedWarningIgnore(args())).toEqual({ ok: false, code: "warning_stale" });
  });

  test("a refusal writes nothing and emits nothing", async () => {
    txScript.row = { parse_result: { warnings: [] }, ignored_warnings: [] };
    await setStagedWarningIgnore(args());
    expect(capturedWrite).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });
});

describe("ignore / unignore round trip", () => {
  test("ignore upserts the entry and reports state ignored", async () => {
    const r = await setStagedWarningIgnore(args());
    expect(r).toEqual({ ok: true, state: "ignored" });
    expect(writtenEntries()).toEqual([
      { fingerprint: FP, code: CODE, ignored_by: "admin@example.com" },
    ]);
  });

  test("the stored ignored_by is CANONICALIZED, not the raw identity", async () => {
    // Discriminating fixture: a raw pass-through stores the mixed-case padded form,
    // which the durable table's CHECK rejects when the finalize carry inserts it.
    requireAdminIdentityMock.mockResolvedValue({ email: "  Doug.W@Example.COM " });
    await setStagedWarningIgnore(args());
    expect(writtenEntries()?.[0]?.ignored_by).toBe("doug.w@example.com");
  });

  test("an admin identity with a blank email refuses rather than storing an uncheckable value", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "   " });
    expect(await setStagedWarningIgnore(args())).toEqual({ ok: false, code: "infra_error" });
    expect(capturedWrite).toBeNull();
  });

  test("a duplicate ignore mutates nothing and emits nothing", async () => {
    txScript.row = {
      parse_result: { warnings: [liveWarning()] },
      ignored_warnings: [{ fingerprint: FP, code: CODE, ignored_by: "admin@example.com" }],
    };
    const r = await setStagedWarningIgnore(args());
    expect(r).toEqual({ ok: true, state: "ignored" });
    expect(capturedWrite).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("unignore removes the entry and reports state unignored", async () => {
    txScript.row = {
      parse_result: { warnings: [liveWarning()] },
      ignored_warnings: [
        { fingerprint: FP, code: CODE, ignored_by: "admin@example.com" },
        { fingerprint: "other-fp", code: "OTHER", ignored_by: "admin@example.com" },
      ],
    };
    const r = await setStagedWarningIgnore(args({ action: "unignore" }));
    expect(r).toEqual({ ok: true, state: "unignored" });
    expect(writtenEntries()).toEqual([
      { fingerprint: "other-fp", code: "OTHER", ignored_by: "admin@example.com" },
    ]);
  });

  test("unignoring an entry that is not there mutates nothing and emits nothing", async () => {
    const r = await setStagedWarningIgnore(args({ action: "unignore" }));
    expect(r).toEqual({ ok: true, state: "unignored" });
    expect(capturedWrite).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("a malformed stored column is rebuilt clean rather than propagated", async () => {
    txScript.row = { parse_result: { warnings: [liveWarning()] }, ignored_warnings: "garbage" };
    await setStagedWarningIgnore(args());
    expect(writtenEntries()).toEqual([
      { fingerprint: FP, code: CODE, ignored_by: "admin@example.com" },
    ]);
  });
});

describe("post-commit forensic emit", () => {
  test("a real ignore emits STAGED_WARNING_IGNORED after the lock callback returns", async () => {
    await setStagedWarningIgnore(args());
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock.mock.calls[0]?.[0]).toMatchObject({
      code: "STAGED_WARNING_IGNORED",
      source: "admin.onboarding.stagedWarningIgnore",
      actorEmail: "admin@example.com",
      wizardSessionId: "wiz-1",
      driveFileId: "df-wign",
    });
    // Post-commit means OUTSIDE the lock tx (invariant 10): no emit SQL ran in-lock,
    // and the emit is the last thing the action does.
    expect(inLockSql.some((s) => /log|outcome/i.test(s))).toBe(false);
  });

  test("a real unignore emits STAGED_WARNING_UNIGNORED", async () => {
    txScript.row = {
      parse_result: { warnings: [liveWarning()] },
      ignored_warnings: [{ fingerprint: FP, code: CODE, ignored_by: "admin@example.com" }],
    };
    await setStagedWarningIgnore(args({ action: "unignore" }));
    expect(logAdminOutcomeMock.mock.calls[0]?.[0]).toMatchObject({
      code: "STAGED_WARNING_UNIGNORED",
    });
  });

  test("the emitted actorEmail is canonicalized too (it is the audit identity)", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "  Doug.W@Example.COM " });
    await setStagedWarningIgnore(args());
    expect(logAdminOutcomeMock.mock.calls[0]?.[0]).toMatchObject({
      actorEmail: "doug.w@example.com",
    });
  });
});

describe("advisory-lock topology (invariant 2, single holder at the JS wrapper)", () => {
  test("the mutation executes INSIDE the withShowLock callback", async () => {
    await setStagedWarningIgnore(args());
    expect(capturedWrite).not.toBeNull();
    // Recorded by the tx at write time, from the callback's own open/closed flag —
    // a write issued after the callback returned records `false` here.
    expect(writeHappenedInsideLock).toBe(true);
  });

  test("the in-lock body issues no RPC", async () => {
    // The fake tx throws if `.rpc(` is reached; a throw would surface as infra_error,
    // so a clean success is the proof. Task 6's structural arm pins this statically
    // across every withShowLock acquirer.
    const r = await setStagedWarningIgnore(args());
    expect(r).toEqual({ ok: true, state: "ignored" });
  });
});

describe("infra fault matrix — every arm resolves typed, none throws over the caller", () => {
  test("supabase client construction throws", async () => {
    throwOnConstruct = true;
    expect(await setStagedWarningIgnore(args())).toEqual({ ok: false, code: "infra_error" });
  });

  test("the pre-lock query rejects", async () => {
    rejectOnAwait = true;
    expect(await setStagedWarningIgnore(args())).toEqual({ ok: false, code: "infra_error" });
  });

  test("the pre-lock query returns an error", async () => {
    preLockResult = { data: null, error: { message: "boom" } };
    expect(await setStagedWarningIgnore(args())).toEqual({ ok: false, code: "infra_error" });
  });

  test("the locked SQL throws inside the callback", async () => {
    txScript.throwOnRead = true;
    expect(await setStagedWarningIgnore(args())).toEqual({ ok: false, code: "infra_error" });
  });

  test("the lock wrapper itself throws", async () => {
    txScript.throwFromWrapper = true;
    expect(await setStagedWarningIgnore(args())).toEqual({ ok: false, code: "infra_error" });
  });

  test("no infra arm emits a forensic outcome", async () => {
    for (const setup of [
      () => (throwOnConstruct = true),
      () => (rejectOnAwait = true),
      () => (txScript.throwOnRead = true),
      () => (txScript.throwFromWrapper = true),
    ]) {
      vi.clearAllMocks();
      throwOnConstruct = false;
      rejectOnAwait = false;
      txScript = { row: { parse_result: { warnings: [liveWarning()] }, ignored_warnings: [] } };
      setup();
      await setStagedWarningIgnore(args());
      expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    }
  });
});
