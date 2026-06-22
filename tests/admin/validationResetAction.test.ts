/**
 * tests/admin/validationResetAction.test.ts — Task 6 (validation-reset-button).
 *
 * Behavioral test suite for resetValidationDataAction + reseedValidationFixturesAction.
 * All Supabase clients are mocked; NO real DB connection is needed.
 *
 * Test structure per task-6-brief §Step 1:
 *   (a) gates fail → VALIDATION_RESET_NOT_ALLOWED + ZERO Supabase calls
 *   (b) gate-disabled RPC raise → VALIDATION_RESET_NOT_ENABLED; reseed does NOT
 *       build the service-role client when the assert RPC raises
 *   (c) reseed SUCCESS-PATH → mintFixtureCombos called THEN finalizeFixtures, each once,
 *       in order (P2-F1 — proves finalize is not forgotten)
 *   (d) reset SUCCESS → returns { ok:true, count:N } + revalidatePath called
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock state — vi.hoisted runs before any imports
// ---------------------------------------------------------------------------
const mockState = vi.hoisted(() => ({
  destructiveResetAllowed: true,
  rpcData: null as Record<string, unknown> | null,
  rpcError: null as { message?: string } | null,
  serviceClientConstructed: false,
}));

// ---------------------------------------------------------------------------
// Mock: destructiveResetAllowed
// ---------------------------------------------------------------------------
vi.mock("@/lib/admin/validationDeployment", () => ({
  destructiveResetAllowed: () => mockState.destructiveResetAllowed,
}));

// ---------------------------------------------------------------------------
// Mock: requireAdmin — pass-through (never throws in these tests)
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Mock: revalidatePath
// ---------------------------------------------------------------------------
const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

// ---------------------------------------------------------------------------
// Mock: Supabase clients
// The session client rpc() is configurable via mockState.
// The service-role client construction is tracked via mockState.serviceClientConstructed.
// ---------------------------------------------------------------------------
const mockSessionRpc = vi.fn(async () => ({
  data: mockState.rpcData,
  error: mockState.rpcError,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockSessionRpc,
  })),
  createSupabaseServiceRoleClient: vi.fn(() => {
    mockState.serviceClientConstructed = true;
    return {
      rpc: vi.fn(async () => ({ data: { show_id: "s1", alias_map_slice: {} }, error: null })),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Mock: buildFixtures — returns minimal fixture array
// ---------------------------------------------------------------------------
vi.mock("@/lib/validation/fixtures", () => ({
  buildFixtures: vi.fn(() => [
    {
      combo: "R1",
      showName: "Validation — Normal day (R1)",
      drive_file_id: "validation_R1",
      slug: "validation-r1",
      dateRestriction: { kind: "none" },
      stageRestriction: { kind: "none" },
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      expectedRuntimeStateKind: "set_day",
      crewMembers: [],
    },
  ]),
  R_COMBOS: ["R1"],
  SW_COMBOS: ["SW-PRE_TRAVEL"],
}));

// ---------------------------------------------------------------------------
// Mock: mintFixtureCombos + finalizeFixtures (spy, tracks invocation order)
// ---------------------------------------------------------------------------
const mintSpy = vi.fn(async () => ({ minted: 1 }));
const finalizeSpy = vi.fn(async () => {});

vi.mock("@/lib/validation/reseedFixtures", () => ({
  mintFixtureCombos: mintSpy,
  finalizeFixtures: finalizeSpy,
}));

// ---------------------------------------------------------------------------
// Helpers to read mock call counts from supabase/server factories
// ---------------------------------------------------------------------------
async function getServerMocks() {
  const mod = await import("@/lib/supabase/server");
  return {
    createSupabaseServerClient: vi.mocked(mod.createSupabaseServerClient),
    createSupabaseServiceRoleClient: vi.mocked(mod.createSupabaseServiceRoleClient),
  };
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock state to safe defaults
  mockState.destructiveResetAllowed = true;
  mockState.rpcData = { clearedShows: 0 };
  mockState.rpcError = null;
  mockState.serviceClientConstructed = false;

  // Re-wire mockSessionRpc to read current mockState on each call
  mockSessionRpc.mockImplementation(async () => ({
    data: mockState.rpcData,
    error: mockState.rpcError,
  }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resetValidationDataAction", () => {
  test("(a) gates fail → VALIDATION_RESET_NOT_ALLOWED, zero Supabase calls", async () => {
    mockState.destructiveResetAllowed = false;

    const { resetValidationDataAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await resetValidationDataAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESET_NOT_ALLOWED" });

    const { createSupabaseServerClient, createSupabaseServiceRoleClient } =
      await getServerMocks();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  test("(b) gate-disabled RPC raise → VALIDATION_RESET_NOT_ENABLED", async () => {
    mockState.rpcError = { message: "destructive reset not enabled" };

    const { resetValidationDataAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await resetValidationDataAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESET_NOT_ENABLED" });
  });

  test("(b) other RPC error → VALIDATION_RESET_FAILED", async () => {
    mockState.rpcError = { message: "connection refused" };

    const { resetValidationDataAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await resetValidationDataAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESET_FAILED" });
  });

  test("(d) success → returns { ok:true, count:N } and revalidatePath called", async () => {
    mockState.rpcData = { clearedShows: 7 };

    const { resetValidationDataAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await resetValidationDataAction();

    expect(result).toEqual({ ok: true, count: 7 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
  });

  test("requireAdmin is called before any Supabase client access", async () => {
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");
    const { createSupabaseServerClient } = await getServerMocks();

    mockState.rpcData = { clearedShows: 0 };

    const { resetValidationDataAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    await resetValidationDataAction();

    const requireAdminMock = vi.mocked(requireAdmin);
    expect(requireAdminMock).toHaveBeenCalled();
    // requireAdmin call order must precede createSupabaseServerClient
    const requireAdminCallOrder = requireAdminMock.mock.invocationCallOrder[0]!;
    const serverClientCallOrder = createSupabaseServerClient.mock.invocationCallOrder[0]!;
    expect(requireAdminCallOrder).toBeLessThan(serverClientCallOrder);
  });
});

describe("reseedValidationFixturesAction", () => {
  test("(a) gates fail → VALIDATION_RESET_NOT_ALLOWED, zero Supabase calls", async () => {
    mockState.destructiveResetAllowed = false;

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await reseedValidationFixturesAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESET_NOT_ALLOWED" });

    const { createSupabaseServerClient, createSupabaseServiceRoleClient } =
      await getServerMocks();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  test("(b) gate-disabled RPC raise → VALIDATION_RESET_NOT_ENABLED, no service-role client", async () => {
    mockState.rpcError = { message: "destructive reset not enabled" };

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await reseedValidationFixturesAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESET_NOT_ENABLED" });

    const { createSupabaseServiceRoleClient } = await getServerMocks();
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  test("(b) other assert RPC error → VALIDATION_RESEED_FAILED, no service-role client", async () => {
    mockState.rpcError = { message: "permission denied" };

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await reseedValidationFixturesAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESEED_FAILED" });

    const { createSupabaseServiceRoleClient } = await getServerMocks();
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  test(
    "(c) SUCCESS-PATH — mintFixtureCombos called THEN finalizeFixtures, each exactly once, in order",
    async () => {
      // assert_destructive_reset_enabled returns null data (no output) on success
      mockState.rpcData = null;

      mintSpy.mockImplementation(async () => ({ minted: 1 }));
      finalizeSpy.mockImplementation(async () => {});

      const { reseedValidationFixturesAction } = await import(
        "@/app/admin/settings/_actions/validationReset"
      );
      const result = await reseedValidationFixturesAction();

      expect(result).toMatchObject({ ok: true });

      expect(mintSpy).toHaveBeenCalledTimes(1);
      expect(finalizeSpy).toHaveBeenCalledTimes(1);

      // P2-F1: mint must precede finalize (a mint-but-no-finalize implementation fails here)
      const mintOrder = mintSpy.mock.invocationCallOrder[0]!;
      const finalizeOrder = finalizeSpy.mock.invocationCallOrder[0]!;
      expect(mintOrder).toBeLessThan(finalizeOrder);
    },
  );

  test("(c) SUCCESS-PATH — service-role client is constructed AFTER assert passes", async () => {
    mockState.rpcData = null;

    const { createSupabaseServiceRoleClient } = await getServerMocks();

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    await reseedValidationFixturesAction();

    expect(createSupabaseServiceRoleClient).toHaveBeenCalledTimes(1);
  });

  test("(c) SUCCESS-PATH — returns { ok:true, count } equal to minted", async () => {
    mockState.rpcData = null;
    mintSpy.mockImplementation(async () => ({ minted: 16 }));

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await reseedValidationFixturesAction();

    expect(result).toEqual({ ok: true, count: 16 });
  });

  test("(c) SUCCESS-PATH — revalidatePath called for /admin and /admin/settings", async () => {
    mockState.rpcData = null;

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    await reseedValidationFixturesAction();

    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
  });

  test("mint throws → VALIDATION_RESEED_FAILED", async () => {
    mockState.rpcData = null;
    mintSpy.mockRejectedValue(new Error("mint RPC failed"));

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await reseedValidationFixturesAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESEED_FAILED" });
    expect(finalizeSpy).not.toHaveBeenCalled();
  });

  test("finalize throws → VALIDATION_RESEED_FAILED", async () => {
    mockState.rpcData = null;
    mintSpy.mockImplementation(async () => ({ minted: 1 }));
    finalizeSpy.mockRejectedValue(new Error("finalize RPC failed"));

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    const result = await reseedValidationFixturesAction();

    expect(result).toEqual({ ok: false, code: "VALIDATION_RESEED_FAILED" });
  });

  test("requireAdmin is called before any Supabase client access", async () => {
    const { requireAdmin } = await import("@/lib/auth/requireAdmin");
    const { createSupabaseServerClient } = await getServerMocks();

    mockState.rpcData = null;

    const { reseedValidationFixturesAction } = await import(
      "@/app/admin/settings/_actions/validationReset"
    );
    await reseedValidationFixturesAction();

    const requireAdminMock = vi.mocked(requireAdmin);
    expect(requireAdminMock).toHaveBeenCalled();
    const requireAdminCallOrder = requireAdminMock.mock.invocationCallOrder[0]!;
    const serverClientCallOrder = createSupabaseServerClient.mock.invocationCallOrder[0]!;
    expect(requireAdminCallOrder).toBeLessThan(serverClientCallOrder);
  });
});
