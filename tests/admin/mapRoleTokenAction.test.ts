/**
 * tests/admin/mapRoleTokenAction.test.ts
 * Live-show "recognize this role" create action (spec 2026-07-15 §8.3).
 *
 * Full pinned evaluation order (§8.3 / §7): validation → EXISTING-ROW branch
 * (set-equal → idempotent success that STILL re-syncs; different → conflict) →
 * warning-provenance (only when NO row) → upsert → logAdminOutcome STRICTLY AFTER
 * the successful write → follow-up re-sync (thrown fault caught → apply_pending).
 * `decided_by = canonicalize(identity)`; null → infra_error, nothing written. All
 * deps injected via module mocks (no DB, no real lock — the upsert is lockless).
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

const runManualSyncForShowMock = vi.fn(async (_df: string): Promise<unknown> => ({
  outcome: "applied",
  showId: "show-1",
}));
vi.mock("@/lib/sync/runManualSyncForShow", () => ({
  runManualSyncForShow: (df: string) => runManualSyncForShowMock(df),
}));

// Dispatching service-role fake: keys reads/writes by table name so the three
// service-role calls (role_token_mappings existing-row read, shows_internal
// warnings read, role_token_mappings insert) each get a scripted result.
type SvcScript = {
  existingMapping: { grants: string[] } | null;
  showWarnings: ParseWarning[] | null;
  mappingReadError?: boolean;
  warningsReadError?: boolean;
  insertError?: boolean;
};
let svcScript: SvcScript;
let fromTables: string[];
let capturedInsert: Record<string, unknown> | null;
let svcThrows: boolean;

function makeSvc() {
  return {
    from(table: string) {
      fromTables.push(table);
      const builder: Record<string, unknown> = { _table: table };
      const self = () => builder;
      builder.select = self;
      builder.eq = self;
      builder.insert = (payload: Record<string, unknown>) => {
        capturedInsert = payload;
        return {
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(
              svcScript.insertError
                ? { data: null, error: { message: "insert boom" } }
                : { data: null, error: null },
            ).then(res, rej),
        };
      };
      builder.maybeSingle = () => {
        if (table === "role_token_mappings") {
          return Promise.resolve(
            svcScript.mappingReadError
              ? { data: null, error: { message: "read boom" } }
              : { data: svcScript.existingMapping, error: null },
          );
        }
        if (table === "shows_internal") {
          return Promise.resolve(
            svcScript.warningsReadError
              ? { data: null, error: { message: "read boom" } }
              : {
                  data:
                    svcScript.showWarnings === null
                      ? null
                      : { parse_warnings: svcScript.showWarnings },
                  error: null,
                },
          );
        }
        return Promise.resolve({ data: null, error: null });
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (svcThrows) throw new Error("service-role client construction failed");
    return makeSvc();
  },
}));

import { mapRoleToken } from "@/app/admin/show/[slug]/_actions/roleToken";

// ── fixtures ──────────────────────────────────────────────────────────────
const unknownWarning = (roleToken: string, name = "Marcus Webb"): ParseWarning => ({
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "unrecognized role",
  blockRef: { kind: "crew", index: 0, name },
  roleToken,
});

beforeEach(() => {
  svcScript = { existingMapping: null, showWarnings: [unknownWarning("DRONE OP")] };
  fromTables = [];
  capturedInsert = null;
  svcThrows = false;
  requireAdminIdentityMock.mockResolvedValue({ email: "admin@example.com" });
  resolveShowByIdMock.mockResolvedValue({
    kind: "found",
    show: { id: "show-1", driveFileId: "df-server" },
  });
  runManualSyncForShowMock.mockImplementation(async () => ({ outcome: "applied", showId: "show-1" }));
});
afterEach(() => vi.clearAllMocks());

describe("mapRoleToken (spec §8.3)", () => {
  test("upsert failure → infra_error AND no ROLE_TOKEN_MAPPING_SET emitted (post-commit ordering)", async () => {
    svcScript.insertError = true;
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
  });

  test("validation: blank token → validation_error, nothing written", async () => {
    const r = await mapRoleToken("show-1", "   ", ["A1"]);
    expect(r).toEqual({ ok: false, code: "validation_error" });
    expect(capturedInsert).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("validation: >64 chars → validation_error", async () => {
    const r = await mapRoleToken("show-1", "X".repeat(65), ["A1"]);
    expect(r).toEqual({ ok: false, code: "validation_error" });
    expect(capturedInsert).toBeNull();
  });

  test("validation: built-in token → validation_error", async () => {
    const r = await mapRoleToken("show-1", "cam op", ["A1"]); // canonicalizes to CAM OP (built-in)
    expect(r).toEqual({ ok: false, code: "validation_error" });
    expect(capturedInsert).toBeNull();
  });

  test("validation: bad grant → validation_error (fail-closed, not filtered)", async () => {
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1", "NOPE"]);
    expect(r).toEqual({ ok: false, code: "validation_error" });
    expect(capturedInsert).toBeNull();
  });

  test("grants deduped + stable-ordered before write", async () => {
    await mapRoleToken("show-1", "DRONE OP", ["V1", "A1", "V1"]);
    expect(capturedInsert?.grants).toEqual(["A1", "V1"]);
  });

  test("existing row, set-equal grants: NO provenance check, proceeds to re-sync; state from outcome", async () => {
    svcScript.existingMapping = { grants: ["V1", "A1"] }; // set-equal to normalized [A1,V1]
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1", "V1"]);
    expect(r).toEqual({ ok: true, state: "applied" });
    expect(fromTables).not.toContain("shows_internal"); // provenance skipped
    expect(capturedInsert).toBeNull(); // idempotent — no write
    expect(logAdminOutcomeMock).not.toHaveBeenCalled(); // no write ⇒ no emit
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
  });

  test("existing row, different grants: conflict, row unchanged (concurrent-admins scenario)", async () => {
    svcScript.existingMapping = { grants: ["A1"] };
    const r = await mapRoleToken("show-1", "DRONE OP", ["FINANCIALS"]);
    expect(r).toEqual({ ok: false, code: "conflict" });
    expect(capturedInsert).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
  });

  test("no row + no matching current warning: stale, nothing written", async () => {
    svcScript.showWarnings = [unknownWarning("GRIP")]; // different token
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "stale" });
    expect(capturedInsert).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("no row + matching warning: row created; decided_by = canonicalize(identity); mixed-case persists lowercased", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "  Admin@FX.TEST " });
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: true, state: "applied" });
    expect(capturedInsert).toMatchObject({ token: "DRONE OP", grants: ["A1"], decided_by: "admin@fx.test" });
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ROLE_TOKEN_MAPPING_SET",
        source: "admin.show.roleToken",
        actorEmail: "admin@fx.test",
        showId: "show-1",
      }),
    );
  });

  test("malformed identity (canonicalize → null): infra_error, nothing written", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "   " });
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(capturedInsert).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("re-sync applied → state 'applied'; re-sync throws AFTER commit → 'apply_pending', row still present", async () => {
    const okr = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(okr).toEqual({ ok: true, state: "applied" });
    expect(capturedInsert).not.toBeNull();

    // reset write capture; the mapping is durable, the re-sync throws post-commit.
    capturedInsert = null;
    logAdminOutcomeMock.mockClear();
    runManualSyncForShowMock.mockImplementation(async () => {
      throw new Error("postgres connection reset mid-apply");
    });
    const pendr = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(pendr).toEqual({ ok: true, state: "apply_pending" });
    expect(capturedInsert).not.toBeNull(); // durable upsert happened before the throw
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1); // emitted post-commit, before the throw
  });

  test("re-sync returns non-applied outcome → apply_pending (mapping still durable)", async () => {
    runManualSyncForShowMock.mockImplementation(async () => ({ outcome: "blocked", code: "X" }));
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    expect(capturedInsert).not.toBeNull();
  });

  test("show resolution infra_error → infra_error (not not-found)", async () => {
    resolveShowByIdMock.mockResolvedValue({ kind: "infra_error" } as never);
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
  });

  test("missing show → show_not_found", async () => {
    resolveShowByIdMock.mockResolvedValue({ kind: "not_found" } as never);
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "show_not_found" });
  });

  test("mapping existing-row read returns error → infra_error, nothing written", async () => {
    svcScript.mappingReadError = true;
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(capturedInsert).toBeNull();
  });

  test("provenance warnings read returns error → infra_error, nothing written", async () => {
    svcScript.warningsReadError = true;
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(capturedInsert).toBeNull();
  });

  test("service-role client construction throws → infra_error", async () => {
    svcThrows = true;
    const r = await mapRoleToken("show-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
  });
});
