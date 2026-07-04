import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { log } from "@/lib/log";

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdminIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const CREW_ID = "22222222-2222-2222-2222-222222222222";
const RESET_AT = "2026-07-03T12:00:00.000Z";
const ADMIN_EMAIL = "doug@example.com";

const rpc = vi.fn();
const mockOutcome = logAdminOutcome as unknown as ReturnType<typeof vi.fn>;
const mockWarn = log.warn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: RESET_AT, error: null });
  vi.mocked(requireAdminIdentity).mockReset();
  vi.mocked(requireAdminIdentity).mockResolvedValue({ email: ADMIN_EMAIL } as never);
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  mockOutcome.mockReset();
  mockOutcome.mockResolvedValue(undefined);
  mockWarn.mockReset();
});

describe("resetCrewMemberSelection", () => {
  test("requires admin before calling the RPC", async () => {
    vi.mocked(requireAdminIdentity).mockRejectedValue(new Error("forbidden"));
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

  // --- Forensic telemetry (BL / spec §2.4/§8 deferral closed) ---

  test("success awaits a logAdminOutcome trace attributing the acting admin + show", async () => {
    await resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID });
    expect(mockOutcome).toHaveBeenCalledTimes(1);
    expect(mockOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "PICKER_SELECTION_RESET_BY_ADMIN",
        actorEmail: ADMIN_EMAIL,
        showId: SHOW_ID,
      }),
    );
    // the crew member is carried as low-cardinality forensic detail
    expect(mockOutcome.mock.calls[0]![0].extra).toMatchObject({ crewMemberId: CREW_ID });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test("RPC returned-error emits a forensic PICKER_SELECTION_RESET_INFRA_FAILED warn, no outcome", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db failed" } });
    await resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID });
    expect(mockWarn).toHaveBeenCalledWith(
      "PICKER_SELECTION_RESET_INFRA_FAILED",
      expect.objectContaining({ code: "PICKER_SELECTION_RESET_INFRA_FAILED", showId: SHOW_ID }),
    );
    expect(mockOutcome).not.toHaveBeenCalled();
  });

  test("RPC thrown fault emits a forensic PICKER_SELECTION_RESET_INFRA_FAILED warn, no outcome", async () => {
    rpc.mockRejectedValueOnce(new Error("network"));
    await resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID });
    expect(mockWarn).toHaveBeenCalledWith(
      "PICKER_SELECTION_RESET_INFRA_FAILED",
      expect.objectContaining({ code: "PICKER_SELECTION_RESET_INFRA_FAILED" }),
    );
    expect(mockOutcome).not.toHaveBeenCalled();
  });

  test("not-found (benign no-op) emits NEITHER a success outcome NOR an infra warn", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID });
    expect(mockOutcome).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });
});
