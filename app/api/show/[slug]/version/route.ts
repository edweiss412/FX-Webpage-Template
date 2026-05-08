/**
 * app/api/show/[slug]/version/route.ts (M4 Task 4.16 routes)
 *
 * Returns the current invalidation-version token for a show. The version
 * token is a monotonic millisecond high-water-mark across:
 *   - shows.last_synced_at
 *   - max(crew_member_auth.last_changed_at)
 *   - max(crew_members.last_changed_at)
 *
 * (Computed by public.viewer_version_token(uuid) at
 * supabase/migrations/20260501001000_internal_and_admin.sql:18-32.)
 *
 * Used by the Checkpoint B `<ShowRealtimeBridge>` client island as a
 * cold-start fence: on mount, the island compares the snapshot's token to
 * the value returned here. If they differ, the snapshot is stale (a publish
 * fired during the SSR → hydrate gap) and the island must router.refresh().
 *
 * Auth: resolveShowViewer is the FIRST action.
 *   - denied    → 401 SHOW_VERSION_AUTH_FAILED
 *   - forbidden → 403 SHOW_VERSION_CROSS_SHOW_FORBIDDEN
 *   - admin/crew_link/crew_google → 200 + { version_token }
 *
 * The codes are version-route-specific (NOT shared with the realtime
 * subscriber-token route) per plan §826. Distinct codes let admin-info logs
 * and client-side branching tell which surface returned the 403/401 — a
 * stale snapshot vs. a stale realtime subscription is a different recovery.
 *
 * The error codes match the catalog in §12.4 (M5 lib/messages/lookup.ts maps
 * them to user-visible copy; this route emits the raw code so the client
 * island can branch on it deterministically).
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveShowViewer } from "@/lib/auth/resolveShowViewer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;

  const viewer = await resolveShowViewer(request, slug);
  if (viewer.kind === "denied") {
    return NextResponse.json(
      { error: "SHOW_VERSION_AUTH_FAILED", reason: viewer.reason },
      { status: 401 },
    );
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json(
      { error: "SHOW_VERSION_CROSS_SHOW_FORBIDDEN", reason: viewer.reason },
      { status: 403 },
    );
  }
  if (viewer.kind === "terminal_failure") {
    // R14 #2: validator infra fault — surface as 500 so operators see
    // server-side faults instead of misclassifying them as auth denials.
    console.error("[/api/show/[slug]/version] validator infra failure", viewer.code);
    return NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
  }

  // viewer is now admin | crew_link | crew_google — all carry show_id.
  // Exhaustive switch fence: adding a 6th `ShowViewer` arm would fail to
  // assign the new variant to `_exhaustive: never` and break the typecheck,
  // preventing a silent regression where the new arm either falls through
  // to the 500 branch or gets read as one of the existing arms via
  // structural coincidence. Per Task 4.16 Checkpoint A code-quality review
  // (Important 2).
  let showId: string;
  switch (viewer.kind) {
    case "admin":
    case "crew_link":
    case "crew_google":
      showId = viewer.show_id;
      break;
    default: {
      const _exhaustive: never = viewer;
      void _exhaustive;
      return new Response("Unreachable show-version viewer kind", {
        status: 500,
      });
    }
  }

  const svc = createSupabaseServiceRoleClient();
  const { data, error } = await svc.rpc("viewer_version_token", {
    p_show_id: showId,
  });
  if (error) {
    return NextResponse.json({ error: "SHOW_VERSION_TOKEN_RPC_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ version_token: data ?? "" });
}
