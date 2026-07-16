/**
 * tests/admin/mapRoleTokenStagedAction.test.ts
 * Wizard-staged "recognize this role" create action (spec 2026-07-15 §8.3 staged twin).
 *
 * Same pinned evaluation order as the live action, with the staged deltas:
 *   - provenance reads the wizard session's STAGED parse warnings (pending_syncs);
 *   - follow-up = re-stage via `rescanWizardSheet` (NOT a direct jsonb write);
 *   - `state:"applied"` = re-stage COMPLETED and the refreshed staged parse no longer
 *     contains the warning (Codex R14 F1); a failed/thrown re-stage after the durable
 *     upsert → `"apply_pending"` (Codex R5 F6), NEVER an error.
 * All deps injected via module mocks (no DB, no lock — the upsert is lockless).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";

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

// Re-stage follow-up. Default: "updated" AND consumes the token's warning (applied).
const rescanWizardSheetMock = vi.fn(async (_df: string, _wiz: string): Promise<unknown> => {
  svcScript.stagedWarnings = []; // overlay consumed the warning on refresh
  return { status: "updated", needsReview: false, changed: true, demoted: false };
});
vi.mock("@/lib/onboarding/rescanWizardSheet", () => ({
  rescanWizardSheet: (df: string, wiz: string) => rescanWizardSheetMock(df, wiz),
}));

type SvcScript = {
  existingMapping: { grants: string[] } | null;
  stagedWarnings: ParseWarning[] | null; // pending_syncs.parse_result.warnings
  stagedRowMissing?: boolean;
  mappingReadError?: boolean;
  stagedReadError?: boolean;
  insertError?: boolean;
  // Create-race scripting (§8.3): insert hits 23505, re-read returns the winner row.
  insertConflict?: boolean;
  raceRow?: { grants: string[] } | null;
  raceReadError?: boolean;
};
let svcScript: SvcScript;
let fromTables: string[];
let capturedInsert: Record<string, unknown> | null;
let mappingReads: number;

function makeSvc() {
  return {
    from(table: string) {
      fromTables.push(table);
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      builder.select = self;
      builder.eq = self;
      builder.insert = (payload: Record<string, unknown>) => {
        capturedInsert = payload;
        const error = svcScript.insertConflict
          ? { code: "23505", message: "duplicate key value violates unique constraint" }
          : svcScript.insertError
            ? { message: "insert boom" }
            : null;
        return {
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error }).then(res, rej),
        };
      };
      builder.maybeSingle = () => {
        if (table === "role_token_mappings") {
          mappingReads += 1;
          if (mappingReads > 1) {
            if (svcScript.raceReadError)
              return Promise.resolve({ data: null, error: { message: "reread boom" } });
            return Promise.resolve({ data: svcScript.raceRow ?? null, error: null });
          }
          return Promise.resolve(
            svcScript.mappingReadError
              ? { data: null, error: { message: "read boom" } }
              : { data: svcScript.existingMapping, error: null },
          );
        }
        if (table === "pending_syncs") {
          if (svcScript.stagedReadError)
            return Promise.resolve({ data: null, error: { message: "read boom" } });
          if (svcScript.stagedRowMissing) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({
            data: { parse_result: { warnings: svcScript.stagedWarnings ?? [] } },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => makeSvc(),
}));

import { mapRoleTokenStaged } from "@/app/admin/onboarding/_actions/roleTokenStaged";

const unknownWarning = (roleToken: string, name = "Marcus Webb"): ParseWarning => ({
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "unrecognized role",
  blockRef: { kind: "crew", index: 0, name },
  roleToken,
});

beforeEach(() => {
  svcScript = { existingMapping: null, stagedWarnings: [unknownWarning("DRONE OP")] };
  fromTables = [];
  capturedInsert = null;
  mappingReads = 0;
  requireAdminIdentityMock.mockResolvedValue({ email: "admin@example.com" });
  rescanWizardSheetMock.mockImplementation(async () => {
    svcScript.stagedWarnings = [];
    return { status: "updated", needsReview: false, changed: true, demoted: false };
  });
});
afterEach(() => vi.clearAllMocks());

describe("mapRoleTokenStaged (spec §8.3 staged twin)", () => {
  test("upsert failure → infra_error AND no emit, no re-stage", async () => {
    svcScript.insertError = true;
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(rescanWizardSheetMock).not.toHaveBeenCalled();
  });

  test("validation: blank / >64 / built-in / bad grant → validation_error, nothing written", async () => {
    const cases: Array<[string, string[]]> = [
      ["   ", ["A1"]],
      ["X".repeat(65), ["A1"]],
      ["green room", ["A1"]], // canonicalizes to GREEN ROOM (built-in)
      ["DRONE OP", ["A1", "NOPE"]],
    ];
    for (const [token, grants] of cases) {
      const r = await mapRoleTokenStaged("wiz-1", "df-1", token, grants);
      expect(r).toEqual({ ok: false, code: "validation_error" });
    }
    expect(capturedInsert).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("grants deduped + stable-ordered before write", async () => {
    await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["FINANCIALS", "A1", "A1"]);
    expect(capturedInsert?.grants).toEqual(["A1", "FINANCIALS"]);
  });

  test("existing row, set-equal grants: NO provenance check, proceeds to re-stage; state from outcome", async () => {
    svcScript.existingMapping = { grants: ["V1", "A1"] };
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1", "V1"]);
    expect(r).toEqual({ ok: true, state: "applied" });
    // provenance read (pending_syncs) is skipped on the set-equal branch; only the
    // post-restage refreshed read touches pending_syncs.
    expect(capturedInsert).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(rescanWizardSheetMock).toHaveBeenCalledTimes(1);
  });

  test("existing row, different grants: conflict, nothing written", async () => {
    svcScript.existingMapping = { grants: ["A1"] };
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["FINANCIALS"]);
    expect(r).toEqual({ ok: false, code: "conflict" });
    expect(capturedInsert).toBeNull();
    expect(rescanWizardSheetMock).not.toHaveBeenCalled();
  });

  test("create race: insert 23505 + winner row set-equal → idempotent success, re-stages, no emit", async () => {
    svcScript.insertConflict = true;
    svcScript.raceRow = { grants: ["A1"] };
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: true, state: "applied" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(rescanWizardSheetMock).toHaveBeenCalledTimes(1);
  });

  test("create race: insert 23505 + winner row with DIFFERENT grants → conflict, no emit, no re-stage", async () => {
    svcScript.insertConflict = true;
    svcScript.raceRow = { grants: ["FINANCIALS"] };
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "conflict" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(rescanWizardSheetMock).not.toHaveBeenCalled();
  });

  test("create race: insert 23505 but re-read errors/returns nothing → infra_error", async () => {
    svcScript.insertConflict = true;
    svcScript.raceReadError = true;
    expect(await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"])).toEqual({
      ok: false,
      code: "infra_error",
    });
    mappingReads = 0;
    svcScript.raceReadError = false;
    svcScript.raceRow = null;
    expect(await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"])).toEqual({
      ok: false,
      code: "infra_error",
    });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("no row + no matching staged warning (incl. absent session row): stale, nothing written", async () => {
    svcScript.stagedWarnings = [unknownWarning("GRIP")];
    expect(await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"])).toEqual({
      ok: false,
      code: "stale",
    });
    svcScript.stagedRowMissing = true;
    expect(await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"])).toEqual({
      ok: false,
      code: "stale",
    });
    expect(capturedInsert).toBeNull();
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("no row + matching staged warning: created; decided_by canonicalized lowercased; emit", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "  Admin@FX.TEST " });
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: true, state: "applied" });
    expect(capturedInsert).toMatchObject({
      token: "DRONE OP",
      grants: ["A1"],
      decided_by: "admin@fx.test",
    });
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ROLE_TOKEN_MAPPING_SET",
        source: "admin.onboarding.roleTokenStaged",
        actorEmail: "admin@fx.test",
        wizardSessionId: "wiz-1",
        driveFileId: "df-1",
      }),
    );
  });

  test("malformed identity (canonicalize → null): infra_error, nothing written", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "   " });
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(capturedInsert).toBeNull();
  });

  test("re-stage updated + warning gone → applied; re-stage throws after commit → apply_pending, row present", async () => {
    const okr = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(okr).toEqual({ ok: true, state: "applied" });
    expect(capturedInsert).not.toBeNull();

    capturedInsert = null;
    logAdminOutcomeMock.mockClear();
    svcScript.stagedWarnings = [unknownWarning("DRONE OP")];
    rescanWizardSheetMock.mockImplementation(async () => {
      throw new Error("rescan connection reset");
    });
    const pendr = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(pendr).toEqual({ ok: true, state: "apply_pending" });
    expect(capturedInsert).not.toBeNull(); // durable upsert happened before the throw
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
  });

  test("re-stage non-'updated' status → apply_pending (durable upsert)", async () => {
    rescanWizardSheetMock.mockImplementation(async () => ({ status: "busy", code: "X" }));
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    expect(capturedInsert).not.toBeNull();
  });

  test("re-stage updated but warning STILL present → apply_pending (not yet consumed)", async () => {
    rescanWizardSheetMock.mockImplementation(async () => {
      // overlay not applied at stage time — the warning survives the refresh.
      return { status: "updated", needsReview: false, changed: false, demoted: false };
    });
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
  });

  test("mapping existing-row read error → infra_error, nothing written", async () => {
    svcScript.mappingReadError = true;
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(capturedInsert).toBeNull();
  });

  test("staged provenance read error → infra_error, nothing written", async () => {
    svcScript.stagedReadError = true;
    const r = await mapRoleTokenStaged("wiz-1", "df-1", "DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(capturedInsert).toBeNull();
  });
});
