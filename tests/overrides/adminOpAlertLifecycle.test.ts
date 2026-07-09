// Admin-op-driven override-alert auto-resolve lifecycle (spec 2026-07-07 §10 R30 /
// R3b-7). The sync path's auto-resolve is proven in Task 11; THIS file proves the
// SECOND post-commit re-derivation call site — the admin server action. A sync
// pauses an override (coarse bell open); the admin then discards / repoints /
// reactivates the last paused row of a code → setFieldOverrideAction's post-commit
// path re-derives per-(show,code) through the SINGLE resolve point and resolves the
// bell; while ≥1 paused row of that code remains, the bell stays open; a best-effort
// resolve failure never fails the committed override mutation (durable inactive-row
// stream stays authoritative).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  SetFieldOverrideParams,
  SetFieldOverrideResult,
} from "@/lib/overrides/setFieldOverride";

// ── auth gate ───────────────────────────────────────────────────────────────
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: vi.fn(async () => ({ email: "admin@example.com" })),
}));

// ── the RPC delegate (mocked so we drive ok / not-ok deterministically) ───────
const setFieldOverrideMock = vi.fn(
  async (_p: SetFieldOverrideParams): Promise<SetFieldOverrideResult> => ({
    ok: true,
    value: "applied",
  }),
);
vi.mock("@/lib/overrides/setFieldOverride", () => ({
  setFieldOverride: (p: SetFieldOverrideParams) => setFieldOverrideMock(p),
}));

// ── the bell resolve target (the durable inactive-row stream is authoritative;
//    this is the coarse per-(show,code) nudge) ────────────────────────────────
const resolveAdminAlertMock = vi.fn(async (_i: unknown, _c?: unknown) => undefined);
vi.mock("@/lib/adminAlerts/resolveAdminAlert", () => ({
  resolveAdminAlert: (i: unknown, c?: unknown) => resolveAdminAlertMock(i, c),
}));

// logAdminOutcome / revalidateShow are not under test here — silence them.
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: vi.fn(async () => undefined) }));
vi.mock("@/lib/data/showCacheTag", () => ({ revalidateShow: vi.fn(() => undefined) }));

// ── service-role client double: `shows` (id lookup) + `admin_overrides`
//    (remaining paused rows per deactivation_code) resolve independently ───────
const SHOW_ID = "44444444-4444-4444-8444-444444444444";
const clientState: { showId: string | null; pausedByCode: Record<string, unknown[]> } = {
  showId: SHOW_ID,
  pausedByCode: {},
};
function fakeServiceRoleClient() {
  return {
    from(table: string) {
      if (table === "shows") {
        const node: Record<string, unknown> = {};
        const self = () => node;
        node.select = self;
        node.eq = self;
        node.maybeSingle = async () => ({
          data: clientState.showId ? { id: clientState.showId } : null,
          error: null,
        });
        return node;
      }
      // admin_overrides — the resolveOverrideAlertsForShow read. Capture the
      // deactivation_code filter so we return that code's remaining paused rows.
      let deactivationCode = "";
      const node: Record<string, unknown> = {};
      node.select = () => node;
      node.eq = (col: string, val: unknown) => {
        if (col === "deactivation_code") deactivationCode = String(val);
        return node;
      };
      node.limit = () => node;
      node.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: clientState.pausedByCode[deactivationCode] ?? [],
          error: null,
        }).then(res, rej);
      return node;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => fakeServiceRoleClient(),
}));

import { setFieldOverrideAction } from "@/app/admin/show/[slug]/_actions/overrides";

function params(op: SetFieldOverrideParams["p_op"]): SetFieldOverrideParams {
  return {
    p_drive_file_id: "drive-ovr",
    p_op: op,
    p_domain: "crew",
    p_field: "name",
    p_match_key: "Jon",
    p_new_match_key: op === "repoint" ? "Jonathan" : null,
    p_override_value: "John",
    p_actor: "",
    p_expected_version: 1,
    p_expected_current_value: "John",
    p_current_ordinal: null,
    p_expected_live_hotel_name: null,
  };
}

const codesResolved = () =>
  resolveAdminAlertMock.mock.calls.map((c) => (c[0] as { code: string }).code);

beforeEach(() => {
  vi.clearAllMocks();
  clientState.showId = SHOW_ID;
  clientState.pausedByCode = {};
  setFieldOverrideMock.mockImplementation(async () => ({ ok: true as const, value: "applied" }));
  resolveAdminAlertMock.mockImplementation(async () => undefined);
});
afterEach(() => vi.clearAllMocks());

describe("admin-op override-alert auto-resolve lifecycle (R3b-7)", () => {
  for (const op of ["discard", "repoint", "upsert"] as const) {
    test(`${op} that clears the LAST paused row of BOTH codes resolves BOTH bells (post-commit)`, async () => {
      clientState.pausedByCode = { target_missing: [], name_conflict: [] };
      const result = await setFieldOverrideAction(params(op));
      expect(result).toEqual({ ok: true, value: "applied" });
      // Both codes re-derived through the single resolve point; zero paused rows → resolve.
      expect(codesResolved().sort()).toEqual(["OVERRIDE_NAME_CONFLICT", "OVERRIDE_TARGET_MISSING"]);
    });
  }

  test("while ≥1 paused row of a code remains, THAT bell stays open (only the cleared code resolves)", async () => {
    // target_missing still has a paused row; name_conflict is now empty.
    clientState.pausedByCode = { target_missing: [{ id: "still-paused" }], name_conflict: [] };
    const result = await setFieldOverrideAction(params("discard"));
    expect(result).toEqual({ ok: true, value: "applied" });
    const resolved = codesResolved();
    expect(resolved).toContain("OVERRIDE_NAME_CONFLICT");
    expect(resolved).not.toContain("OVERRIDE_TARGET_MISSING");
  });

  test("an {ok:false} RPC result never reaches the resolve path (no bell change on a refused op)", async () => {
    clientState.pausedByCode = { target_missing: [], name_conflict: [] };
    setFieldOverrideMock.mockImplementation(async () => ({
      ok: false as const,
      code: "OVERRIDE_STALE_REVIEW",
    }));
    const result = await setFieldOverrideAction(params("discard"));
    expect(result).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
    expect(resolveAdminAlertMock).not.toHaveBeenCalled();
  });

  test("a best-effort resolve FAILURE leaves the committed override mutation intact (durable stream authoritative)", async () => {
    clientState.pausedByCode = { target_missing: [], name_conflict: [] };
    resolveAdminAlertMock.mockImplementation(async () => {
      throw new Error("admin_alerts resolve infra fault");
    });
    // The action must NOT propagate the best-effort throw over the committed RPC success.
    const result = await setFieldOverrideAction(params("discard"));
    expect(result).toEqual({ ok: true, value: "applied" });
    // The mutation itself was delegated (committed) exactly once.
    expect(setFieldOverrideMock).toHaveBeenCalledTimes(1);
  });
});
