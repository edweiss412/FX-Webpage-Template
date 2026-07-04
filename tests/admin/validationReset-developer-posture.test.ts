/**
 * tests/admin/validationReset-developer-posture.test.ts (developer-tier §6 + §6.1)
 *
 * The validation reset/reseed server actions use the INLINE-TYPED posture: the
 * developer gate is the FIRST op INSIDE the top-level try, so a
 * DeveloperInfraError is caught and mapped to the action's typed FAILED code
 * (RETURNED, never thrown), while a confirmed non-developer forbidden() digest
 * is re-thrown to the Next boundary (not converted to { ok:false }).
 *
 * Failure mode caught: a gate swap that leaves the gate OUTSIDE the try would
 * let DeveloperInfraError escape as an unhandled rejection (the client boundary
 * then renders a generic denial with no typed code), and a catch that swallows
 * ALL errors would convert a forbidden() interrupt into a benign { ok:false }.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

// Override only requireDeveloper; keep the real DeveloperInfraError so the
// impl's `instanceof DeveloperInfraError` branch matches the thrown instance.
vi.mock("@/lib/auth/requireDeveloper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/requireDeveloper")>();
  return {
    ...actual,
    requireDeveloper: vi.fn(async () => {
      throw new actual.DeveloperInfraError("boom");
    }),
  };
});

// Spy the admin gate so we can prove the actions no longer call it.
const requireAdmin = vi.fn(async () => {});
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin }));

import { requireDeveloper, DeveloperInfraError } from "@/lib/auth/requireDeveloper";
const mockedRequireDeveloper = vi.mocked(requireDeveloper);

afterEach(() => {
  vi.clearAllMocks();
});

describe("validationReset developer-gate posture (inline-typed)", () => {
  test("resetValidationDataAction: DeveloperInfraError -> { ok:false, VALIDATION_RESET_FAILED } (returned, not thrown)", async () => {
    const { resetValidationDataAction } =
      await import("@/app/admin/settings/_actions/validationReset");
    const result = await resetValidationDataAction();
    expect(result).toEqual({ ok: false, code: "VALIDATION_RESET_FAILED" });
    // The gate is requireDeveloper, not requireAdmin.
    expect(mockedRequireDeveloper).toHaveBeenCalledTimes(1);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test("reseedValidationFixturesAction: DeveloperInfraError -> { ok:false, VALIDATION_RESEED_FAILED } (returned, not thrown)", async () => {
    const { reseedValidationFixturesAction } =
      await import("@/app/admin/settings/_actions/validationReset");
    const result = await reseedValidationFixturesAction();
    expect(result).toEqual({ ok: false, code: "VALIDATION_RESEED_FAILED" });
    expect(mockedRequireDeveloper).toHaveBeenCalledTimes(1);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test("a confirmed non-developer forbidden() digest is re-thrown, not converted to { ok:false }", async () => {
    // requireDeveloper calls forbidden() for a confirmed non-developer, which
    // throws a NEXT_HTTP_ERROR_FALLBACK;403 digest (NOT a DeveloperInfraError).
    mockedRequireDeveloper.mockImplementationOnce(async () => {
      throw Object.assign(new Error("forbidden"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
    });
    const { resetValidationDataAction } =
      await import("@/app/admin/settings/_actions/validationReset");
    await expect(resetValidationDataAction()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;403",
    });
  });

  test("DeveloperInfraError is a real, importable class (mock preserved the export)", () => {
    expect(new DeveloperInfraError("x")).toBeInstanceOf(Error);
    expect(new DeveloperInfraError("x").code).toBe("DEVELOPER_SESSION_LOOKUP_FAILED");
  });
});
