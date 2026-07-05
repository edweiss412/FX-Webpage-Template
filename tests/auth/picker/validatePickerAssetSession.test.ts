import { beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  picker: { kind: "no_selection" } as unknown,
  calls: [] as Array<{ showId: string; cookie: string | undefined }>,
}));

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({
  resolvePickerSelection: async (input: { showId: string; cookie: string | undefined }) => {
    state.calls.push(input);
    return state.picker;
  },
}));

function req(cookie?: string): NextRequest {
  const init: RequestInit = {};
  if (cookie) init.headers = { cookie };
  return new Request("http://localhost/api/asset/test", init) as unknown as NextRequest;
}

describe("validatePickerAssetSession", () => {
  beforeEach(() => {
    state.picker = { kind: "no_selection" };
    state.calls = [];
  });

  test("resolved picker cookie authorizes and passes only the picker cookie value", async () => {
    state.picker = { kind: "resolved", crewMemberId: "11111111-1111-4111-8111-111111111111" };
    const { validatePickerAssetSession } =
      await import("@/lib/auth/picker/validatePickerAssetSession");

    const result = await validatePickerAssetSession(
      req("other=value; __Host-fxav_picker=signed-value"),
      "22222222-2222-4222-8222-222222222222",
    );

    expect(result).toEqual({ ok: true });
    expect(state.calls).toEqual([
      {
        showId: "22222222-2222-4222-8222-222222222222",
        cookie: "signed-value",
      },
    ]);
  });

  test("session_mismatch maps to 410 for asset consumers", async () => {
    state.picker = {
      kind: "identity_invalidated",
      reason: "session_mismatch",
      expectedEpoch: 1,
      expectedCrewMemberId: "11111111-1111-4111-8111-111111111111",
    };
    const { validatePickerAssetSession } =
      await import("@/lib/auth/picker/validatePickerAssetSession");

    const result = await validatePickerAssetSession(req("__Host-fxav_picker=signed"), "show-id");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(410);
      await expect(result.response.json()).resolves.toEqual({
        error: "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
      });
    }
  });

  test("infra_error maps to 500", async () => {
    state.picker = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    const { validatePickerAssetSession } =
      await import("@/lib/auth/picker/validatePickerAssetSession");

    const result = await validatePickerAssetSession(req("__Host-fxav_picker=signed"), "show-id");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });

  test("selection_reset maps to the UNAUTHORIZED (401) response, not stale (410)", async () => {
    // Live code distinguishes unauthorized() [401] from stale() [410]. selection_reset joins
    // the 401 group (like epoch_stale), NOT the 410 group (show_unavailable/identity_invalidated).
    state.picker = {
      kind: "selection_reset",
      expectedEpoch: 4,
      expectedCrewMemberId: "11111111-1111-4111-8111-111111111111",
    };
    const { validatePickerAssetSession } =
      await import("@/lib/auth/picker/validatePickerAssetSession");

    const result = await validatePickerAssetSession(req("__Host-fxav_picker=signed"), "show-id");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401); // NOT 410 — asserts the correct group

    // Contrast pin: a stale kind returns 410, proving the 401 assertion is discriminating.
    state.picker = { kind: "show_unavailable" };
    const stale = await validatePickerAssetSession(req("__Host-fxav_picker=signed"), "show-id");
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.response.status).toBe(410);
  });
});
