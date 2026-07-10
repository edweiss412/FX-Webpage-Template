// Adversarial R2 (Codex round 2, HIGH): the production RPC only rejects null /
// non-object / {} for show dates/venue — a valid-JSON-but-wrong-shape object
// ({"foo":"bar"}) was written straight into shows.dates/venue. The spec (§7.4,
// line 254 "rejected by the RPC before write"; §389/391 shared validateOverrideValue
// helper; migration §178 "precise pre-RPC UI message") requires shape validation.
// setFieldOverrideAction now runs the authoritative TS shape guard before delegating.
//
// Failure mode this catches: the action delegating a malformed dates/venue object to
// the RPC (which accepts it) instead of rejecting pre-write.

import { describe, it, expect, vi, beforeEach } from "vitest";

const setFieldOverrideSpy = vi.fn(
  async (..._a: unknown[]) => ({ ok: true, value: "applied" }) as { ok: true; value: unknown },
);

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: async () => ({ email: "doug@example.com" }),
}));
vi.mock("@/lib/overrides/setFieldOverride", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/overrides/setFieldOverride")>()),
  setFieldOverride: (...a: unknown[]) => setFieldOverrideSpy(...a),
}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: async () => {} }));
vi.mock("@/lib/adminAlerts/resolveOverrideAlertsForShow", () => ({
  resolveOverrideAlertsForShow: async () => {},
}));
vi.mock("@/lib/data/showCacheTag", () => ({ revalidateShow: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "show-1" }, error: null }) }),
      }),
    }),
  }),
}));

import { setFieldOverrideAction } from "@/app/admin/show/[slug]/_actions/overrides";
import type { SetFieldOverrideParams } from "@/lib/overrides/setFieldOverride";

function params(over: Partial<SetFieldOverrideParams>): SetFieldOverrideParams {
  return {
    p_drive_file_id: "drive-1",
    p_op: "upsert",
    p_domain: "show",
    p_field: "dates",
    p_match_key: "",
    p_new_match_key: null,
    p_override_value: null,
    p_actor: "",
    p_expected_version: null,
    p_expected_current_value: null,
    p_current_ordinal: null,
    p_expected_live_hotel_name: null,
    ...over,
  };
}

beforeEach(() => setFieldOverrideSpy.mockClear());

describe("setFieldOverrideAction — §7.4 dates/venue shape guard (R2)", () => {
  it("rejects a wrong-shape dates object BEFORE the RPC (OVERRIDE_INVALID_SHAPE, helper not called)", async () => {
    const res = await setFieldOverrideAction(
      params({ p_field: "dates", p_override_value: { foo: "bar" } }),
    );
    expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_SHAPE" });
    expect(setFieldOverrideSpy).not.toHaveBeenCalled();
  });

  it("rejects a wrong-shape venue object (missing name/address) before the RPC", async () => {
    const res = await setFieldOverrideAction(
      params({ p_field: "venue", p_override_value: { city: "NYC" } }),
    );
    expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_SHAPE" });
    expect(setFieldOverrideSpy).not.toHaveBeenCalled();
  });

  it("passes a VALID dates shape through to the RPC helper", async () => {
    const res = await setFieldOverrideAction(
      params({
        p_field: "dates",
        p_override_value: { travelIn: "2026-07-01", showDays: ["2026-07-02"] },
      }),
    );
    expect(res.ok).toBe(true);
    expect(setFieldOverrideSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT shape-guard text fields (crew name) — leaves that to the RPC", async () => {
    // A crew name is a scalar string; the action must not run the object shape guard on it.
    await setFieldOverrideAction(
      params({ p_domain: "crew", p_field: "name", p_match_key: "Jon", p_override_value: "John" }),
    );
    expect(setFieldOverrideSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT shape-guard revert/discard (no value to write)", async () => {
    await setFieldOverrideAction(params({ p_op: "revert", p_override_value: null }));
    expect(setFieldOverrideSpy).toHaveBeenCalledTimes(1);
  });
});
