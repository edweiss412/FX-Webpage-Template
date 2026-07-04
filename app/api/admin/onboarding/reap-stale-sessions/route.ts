/**
 * app/api/admin/onboarding/reap-stale-sessions/route.ts (onboarding-fixups F4
 * Task 4.5)
 *
 * Developer-gated trigger for the strictly session-scoped stale-debris reap
 * (lib/onboarding/sessionLifecycle.ts reapStaleOnboardingSessions). Structurally
 * a slim sibling of the cleanup-abandoned-finalize route's gate (developer-tier
 * §6 row 6: swapped requireAdminIdentity → requireDeveloperIdentity).
 * Invariant 5: every error path emits a cataloged JSON code (ADMIN_FORBIDDEN /
 * ADMIN_SESSION_LOOKUP_FAILED / REAP_STALE_SESSIONS_FAILED), never raw 500
 * stack text — the admin UI does a catalog lookup on `code`. The developer
 * gate's raw DEVELOPER_SESSION_LOOKUP_FAILED is mapped to the cataloged
 * ADMIN_SESSION_LOOKUP_FAILED 500 (only ADMIN_* codes are cataloged here).
 */
import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import {
  reapStaleOnboardingSessions as defaultReap,
  type ReapStaleSessionsResult,
  type SessionLifecycleDeps,
} from "@/lib/onboarding/sessionLifecycle";

export type ReapStaleSessionsRouteDeps = {
  // `requireAdminIdentity` is the legacy injection-seam key (kept stable for
  // tests); it is now backed by the developer gate (developer-tier §6 row 6).
  requireAdminIdentity?: () => Promise<{ email: string }>;
  reapStaleOnboardingSessions?: (deps?: SessionLifecycleDeps) => Promise<ReapStaleSessionsResult>;
};

async function defaultRequireDeveloperIdentity(): Promise<{ email: string }> {
  const { requireDeveloperIdentity } = await import("@/lib/auth/requireDeveloper");
  return await requireDeveloperIdentity();
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function handleReapStaleSessions(
  _request: Request,
  routeDeps: ReapStaleSessionsRouteDeps = {},
): Promise<Response> {
  const requireDeveloperIdentity =
    routeDeps.requireAdminIdentity ?? defaultRequireDeveloperIdentity;
  const reap = routeDeps.reapStaleOnboardingSessions ?? defaultReap;
  let admin: { email: string };
  try {
    admin = await requireDeveloperIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    // Both the admin and developer infra faults map to the SAME cataloged 500
    // body — only ADMIN_* codes are cataloged for this surface (invariant 5).
    if (code === "ADMIN_SESSION_LOOKUP_FAILED" || code === "DEVELOPER_SESSION_LOOKUP_FAILED") {
      return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }
  try {
    const result = await reap({ requireAdminIdentity: async () => admin });
    // R29-2: the summary surfaces skipped_unstable sessions verbatim so the
    // admin affordance can render them distinctly from successful reaps.
    return NextResponse.json({ status: "reaped", sessions: result.sessions });
  } catch (error) {
    // Plan-R1 finding 1: a thrown infra error from the reap transaction must
    // surface as a cataloged JSON code, never a raw 500 — the UI does a
    // catalog lookup on `code`. Plan R31-2: LOG the cause before returning the
    // cataloged response — this route performs advisory-locked deletes; losing
    // the DB/lock/permission context makes failures unrecoverable.
    log.error("reap-stale-sessions failed", {
      source: "api.admin.onboarding.reap",
      code: "REAP_STALE_SESSIONS_INFRA_FAILED",
      error,
    });
    return errorResponse(500, "REAP_STALE_SESSIONS_FAILED");
  }
}

export async function POST(request: Request): Promise<Response> {
  return await handleReapStaleSessions(request);
}
