import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdminIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: vi.fn() }));

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_EMAIL = "admin@example.com";

let rpcError: unknown;
let newEpoch: number;
const rpc = vi.fn();

beforeEach(() => {
  process.env.HASH_FOR_LOG_PEPPER = "x".repeat(32);
  rpcError = null;
  newEpoch = 8;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: newEpoch, error: rpcError });
  vi.mocked(requireAdminIdentity).mockReset();
  vi.mocked(requireAdminIdentity).mockResolvedValue({ email: ADMIN_EMAIL });
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  vi.mocked(upsertAdminAlert).mockReset();
  vi.mocked(upsertAdminAlert).mockResolvedValue(null);
});

describe("resetPickerEpoch", () => {
  test("requires admin identity before calling the RPC", async () => {
    vi.mocked(requireAdminIdentity).mockRejectedValue(new Error("forbidden"));

    await expect(resetPickerEpoch({ showId: SHOW_ID })).rejects.toThrow("forbidden");

    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("bumps picker epoch through the cookie-bound RPC and emits a hashed audit alert", async () => {
    await expect(resetPickerEpoch({ showId: SHOW_ID })).resolves.toEqual({
      ok: true,
      new_epoch: 8,
    });

    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reset_picker_epoch_atomic", { p_show_id: SHOW_ID });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: SHOW_ID,
      code: "PICKER_EPOCH_RESET",
      context: {
        show_id: SHOW_ID,
        new_epoch: 8,
        admin_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(vi.mocked(upsertAdminAlert).mock.calls[0]![0].context.admin_email_hash).not.toBe(ADMIN_EMAIL);
  });

  test("maps returned or thrown RPC faults to typed picker infra failure", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db failed" } });
    await expect(resetPickerEpoch({ showId: SHOW_ID })).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });

    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(resetPickerEpoch({ showId: SHOW_ID })).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
  });

  test("does not roll back the reset result when alert emission fails", async () => {
    vi.mocked(upsertAdminAlert).mockRejectedValueOnce(new Error("alert down"));

    await expect(resetPickerEpoch({ showId: SHOW_ID })).resolves.toEqual({
      ok: true,
      new_epoch: 8,
    });
  });
});
