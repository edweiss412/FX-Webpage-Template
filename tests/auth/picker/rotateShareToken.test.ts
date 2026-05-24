import { beforeEach, describe, expect, test, vi } from "vitest";
import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const OLD_TOKEN = "a".repeat(64);
const NEW_TOKEN = "b".repeat(64);

const single = vi.fn();
const rpc = vi.fn();

beforeEach(() => {
  single.mockReset();
  single.mockResolvedValue({
    data: { new_share_token: NEW_TOKEN, new_epoch: 9 },
    error: null,
  });
  rpc.mockReset();
  rpc.mockReturnValue({ single });
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(requireAdmin).mockResolvedValue(undefined);
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
});

describe("rotateShareToken", () => {
  test("requires admin before calling the RPC", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("forbidden"));

    await expect(rotateShareToken({ showId: SHOW_ID })).rejects.toThrow("forbidden");

    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns the new 64-hex share token and picker epoch from the cookie-bound RPC", async () => {
    await expect(rotateShareToken({ showId: SHOW_ID, previousShareToken: OLD_TOKEN })).resolves.toEqual({
      ok: true,
      new_share_token: NEW_TOKEN,
      new_epoch: 9,
    });

    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rotate_show_share_token", { p_show_id: SHOW_ID });
    expect(single).toHaveBeenCalledTimes(1);
    expect(NEW_TOKEN).toMatch(/^[0-9a-f]{64}$/);
    expect(NEW_TOKEN).not.toBe(OLD_TOKEN);
  });

  test("maps returned or thrown RPC faults to typed picker infra failure", async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: "db failed" } });
    await expect(rotateShareToken({ showId: SHOW_ID })).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });

    single.mockRejectedValueOnce(new Error("network"));
    await expect(rotateShareToken({ showId: SHOW_ID })).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
  });
});
