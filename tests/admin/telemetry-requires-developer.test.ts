/**
 * tests/admin/dev/telemetry-requires-developer.test.ts (developer-tier §6 row 5)
 *
 * Proves the Telemetry page is gated on requireDeveloperIdentity
 * (NOT requireAdminIdentity). The data loaders use service-role clients and do
 * NOT self-gate, so the page gate is the sole access control — if it throws,
 * neither loader may run (auth-before-read).
 *
 * Discriminating assertion: requireDeveloperIdentity must be CALLED. Before the
 * swap the page still imports requireAdminIdentity, so requireDeveloperIdentity
 * is never invoked and this test fails.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

const SENTINEL = new Error("requireDeveloperIdentity-sentinel");

const requireDeveloperIdentity = vi.fn(async () => {
  throw SENTINEL;
});
vi.mock("@/lib/auth/requireDeveloper", () => ({ requireDeveloperIdentity }));

// Pass-through spy: if the page still used the admin gate, this would resolve
// and the page would proceed — the toHaveBeenCalled assertions catch that.
const requireAdminIdentity = vi.fn(async () => ({ email: "a@b.c" }));
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdminIdentity }));

const loadCronHealth = vi.fn(async () => ({ kind: "ok" as const, jobs: [] }));
const loadAppEvents = vi.fn(async () => ({
  kind: "ok" as const,
  events: [],
  hasMore: false,
  nextCursor: null,
}));
vi.mock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth }));
vi.mock("@/lib/admin/loadAppEvents", () => ({ loadAppEvents }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-29T12:00:00.000Z") }));

afterEach(() => vi.clearAllMocks());

describe("TelemetryPage is developer-gated", () => {
  test("requireDeveloperIdentity gates the page; requireAdminIdentity unused; loaders never run", async () => {
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toBe(SENTINEL);
    expect(requireDeveloperIdentity).toHaveBeenCalledTimes(1);
    expect(requireAdminIdentity).not.toHaveBeenCalled();
    // auth-before-read: the gate throws before either service-role loader runs.
    expect(loadCronHealth).not.toHaveBeenCalled();
    expect(loadAppEvents).not.toHaveBeenCalled();
  });
});
