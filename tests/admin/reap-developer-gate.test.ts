/**
 * tests/admin/reap-developer-gate.test.ts (developer-tier §6 row 6 + §6.1)
 *
 * The stale-session reap route swapped its gate requireAdminIdentity →
 * requireDeveloperIdentity. The developer gate's infra fault carries the raw
 * code DEVELOPER_SESSION_LOOKUP_FAILED, but the route must map it to the SAME
 * cataloged 500 body the admin gate used (ADMIN_SESSION_LOOKUP_FAILED) — the
 * admin UI does a catalog lookup on `code` and only ADMIN_* codes are cataloged
 * for this surface (invariant 5). A confirmed non-developer still gets 403.
 *
 * The injection seam is the `requireAdminIdentity` dep key (kept for tests);
 * the default is now backed by requireDeveloperIdentity.
 */
import { describe, expect, test, vi } from "vitest";
import { handleReapStaleSessions } from "@/app/api/admin/onboarding/reap-stale-sessions/route";
import { DeveloperInfraError } from "@/lib/auth/requireDeveloper";

describe("POST /api/admin/onboarding/reap-stale-sessions — developer gate", () => {
  test("developer infra fault -> 500 with cataloged ADMIN_SESSION_LOOKUP_FAILED code (NOT the raw developer code)", async () => {
    const reap = vi.fn();
    const res = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => {
        throw new DeveloperInfraError("boom");
      },
      reapStaleOnboardingSessions: reap,
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ADMIN_SESSION_LOOKUP_FAILED");
    expect(reap).not.toHaveBeenCalled();
  });

  test("confirmed non-developer (forbidden interrupt) -> 403 ADMIN_FORBIDDEN before any reap work", async () => {
    const reap = vi.fn();
    // requireDeveloperIdentity calls forbidden() for a confirmed non-developer,
    // which throws a NEXT_HTTP_ERROR_FALLBACK;403 digest carrying no `.code`.
    const res = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => {
        throw Object.assign(new Error("forbidden"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
      },
      reapStaleOnboardingSessions: reap,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ADMIN_FORBIDDEN");
    expect(reap).not.toHaveBeenCalled();
  });
});
