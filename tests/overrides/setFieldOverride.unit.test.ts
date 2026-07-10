import { describe, it, expect } from "vitest";
import { setFieldOverride, type SetFieldOverrideParams } from "@/lib/overrides/setFieldOverride";

// Step 4.1 — mocked-client unit test (call-boundary discipline, invariant 9). The RPC's returned
// `{ data, error }` is the ONLY thing this helper observes; each case pins the discriminated mapping
// without a live DB. A fake `createClient` is injected via the `deps` seam (mirrors setPullSheetOverrideRpc).

// Minimal, valid params shape — the helper forwards it verbatim; the fake rpc ignores it.
const PARAMS: SetFieldOverrideParams = {
  p_drive_file_id: "drive-x",
  p_op: "upsert",
  p_domain: "crew",
  p_field: "name",
  p_match_key: "Jon",
  p_new_match_key: null,
  p_override_value: "Jonathan",
  p_actor: "admin@fx.co",
  p_expected_version: null,
  p_expected_current_value: "Jon",
  p_current_ordinal: null,
  p_expected_live_hotel_name: null,
};

// A fake service-role client whose `.rpc()` returns a fixed `{ data, error }`. Typed loosely because
// the helper only reads `.rpc`; `as never` keeps the injected shape assignable to the deps signature.
function fakeClient(result: { data: unknown; error: unknown }) {
  return (() => ({ rpc: async () => result })) as never;
}

describe("setFieldOverride (helper unit — mocked client)", () => {
  it("(a) returned-error SQLSTATE 40001 → OVERRIDE_STALE_REVIEW (helper-raised stale target, NOT infra)", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({ data: null, error: { code: "40001", message: "stale" } }),
    });
    expect(res).toEqual({ ok: false, code: "OVERRIDE_STALE_REVIEW" });
  });

  it("(a2) returned-error with any other code → SYNC_INFRA_ERROR (genuine fault)", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({ data: null, error: { code: "PGRST301", message: "boom" } }),
    });
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
  });

  it("(a3) returned-error with NO code → SYNC_INFRA_ERROR (undefined !== '40001')", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({ data: null, error: { message: "no code" } }),
    });
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
  });

  it("(b) data.ok === false → pass through {ok:false, code:data.code}", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({
        data: { ok: false, code: "OVERRIDE_INVALID_STATE" },
        error: null,
      }),
    });
    expect(res).toEqual({ ok: false, code: "OVERRIDE_INVALID_STATE" });
  });

  it("(b2) data.ok === false but code missing → SYNC_INFRA_ERROR fallback", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({ data: { ok: false }, error: null }),
    });
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
  });

  it("(c) data.ok === true → {ok:true, value}", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({ data: { ok: true, value: "Jonathan" }, error: null }),
    });
    expect(res).toEqual({ ok: true, value: "Jonathan" });
  });

  it("(c2) data.ok === true with a structured value → value passed through verbatim", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({
        data: { ok: true, value: { start: "2026-02" } },
        error: null,
      }),
    });
    expect(res).toEqual({ ok: true, value: { start: "2026-02" } });
  });

  it("(d) null data, no error → SYNC_INFRA_ERROR (never silent success)", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({ data: null, error: null }),
    });
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
  });

  it("(d2) unexpected data shape (no ok field) → SYNC_INFRA_ERROR", async () => {
    const res = await setFieldOverride(PARAMS, {
      createClient: fakeClient({ data: { unexpected: true }, error: null }),
    });
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
  });
});
