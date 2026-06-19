/**
 * F4 Task 4.5 — POST /api/admin/onboarding/reap-stale-sessions.
 *
 * Failure mode caught: the reap is reachable without an admin identity, or
 * infra failures surface as raw 500 stack text instead of the typed codes the
 * admin surface expects (invariant 5: UI reads codes through
 * lib/messages/lookup.ts; the route must emit cataloged codes only).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { handleReapStaleSessions } from "@/app/api/admin/onboarding/reap-stale-sessions/route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/onboarding/reap-stale-sessions", () => {
  test("gates admin and returns the reap summary (skipped_unstable surfaced distinctly, R29-2)", async () => {
    const reap = vi.fn(async () => ({
      sessions: [
        { wizardSessionId: "b", outcome: "reaped_full" as const },
        { wizardSessionId: "u", outcome: "skipped_unstable" as const },
      ],
    }));
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      reapStaleOnboardingSessions: reap,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "reaped",
      sessions: [
        { wizardSessionId: "b", outcome: "reaped_full" },
        { wizardSessionId: "u", outcome: "skipped_unstable" },
      ],
    });
    // The route passes the already-resolved admin identity through (no double prompt).
    expect(reap).toHaveBeenCalledWith(
      expect.objectContaining({ requireAdminIdentity: expect.any(Function) }),
    );
  });

  test("non-admin callers get 403 ADMIN_FORBIDDEN before any reap work", async () => {
    const reap = vi.fn();
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => {
        throw Object.assign(new Error("nope"), { code: "ADMIN_FORBIDDEN" });
      },
      reapStaleOnboardingSessions: reap,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "ADMIN_FORBIDDEN" });
    expect(reap).not.toHaveBeenCalled();
  });

  test("session-lookup infra failure surfaces as 500 ADMIN_SESSION_LOOKUP_FAILED", async () => {
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => {
        throw Object.assign(new Error("boom"), { code: "ADMIN_SESSION_LOOKUP_FAILED" });
      },
      reapStaleOnboardingSessions: vi.fn(),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, code: "ADMIN_SESSION_LOOKUP_FAILED" });
  });

  test("a thrown infra error mid-reap surfaces as 500 REAP_STALE_SESSIONS_FAILED with the cause logged (plan-R1/R31-2)", async () => {
    // Concrete failure mode caught: an OnboardingSessionInfraError thrown
    // mid-reap escaping the route so the operator sees an unparseable error
    // exactly when destructive cleanup fails — and losing the DB/lock/
    // permission context that makes the failure diagnosable.
    const cause = new Error("connection reset");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      reapStaleOnboardingSessions: async () => {
        throw cause;
      },
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, code: "REAP_STALE_SESSIONS_FAILED" });
    expect(consoleError).toHaveBeenCalledWith("reap-stale-sessions failed", cause);
  });
});
