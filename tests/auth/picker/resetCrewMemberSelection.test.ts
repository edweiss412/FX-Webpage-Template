import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const CREW_ID = "22222222-2222-2222-2222-222222222222";
const RESET_AT = "2026-07-03T12:00:00.000Z";

const rpc = vi.fn();

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: RESET_AT, error: null });
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(requireAdmin).mockResolvedValue(undefined as never);
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
});

describe("resetCrewMemberSelection", () => {
  test("requires admin before calling the RPC", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(
      resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    ).rejects.toThrow("forbidden");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("admin happy path returns reset_at and calls the cookie-bound RPC", async () => {
    await expect(
      resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    ).resolves.toEqual({ ok: true, reset_at: RESET_AT });
    expect(rpc).toHaveBeenCalledWith("reset_crew_member_selection", {
      p_show_id: SHOW_ID,
      p_crew_member_id: CREW_ID,
    });
  });

  test("RPC returned-error → PICKER_RESOLVER_LOOKUP_FAILED", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db failed" } });
    await expect(
      resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    ).resolves.toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
  });

  test("RPC thrown fault → PICKER_RESOLVER_LOOKUP_FAILED", async () => {
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(
      resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    ).resolves.toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
  });

  test("NULL data (not-found) → PICKER_CREW_MEMBER_NOT_FOUND (distinct from infra)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    ).resolves.toEqual({ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" });
  });

  test("bad UUID → PICKER_INVALID_INPUT and no RPC call", async () => {
    await expect(
      resetCrewMemberSelection({ showId: "nope", crewMemberId: CREW_ID }),
    ).resolves.toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("emits NO admin_alerts upsert (per-member reset copy would be false; R5-HIGH)", () => {
    const src = readFileSync("lib/auth/picker/resetCrewMemberSelection.ts", "utf8");
    expect(src).not.toMatch(/upsertAdminAlert/);
  });
});
