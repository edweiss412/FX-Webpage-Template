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
 * Auth: derive show_id from slug, then authorize via admin session or picker
 * cookie before invoking viewer_version_token.
 *   - denied    → 401 SHOW_VERSION_AUTH_FAILED
 *   - forbidden → 403 SHOW_VERSION_CROSS_SHOW_FORBIDDEN
 *   - admin → 200 + { version_token }
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
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { resolvePickerSelection } from "@/lib/auth/picker/resolvePickerSelection";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type ApiViewer =
  | { ok: true; showId: string }
  | { ok: false; status: 401 | 410 | 500; error: string; reason?: string };

function pickerCookieFromRequest(request: Request): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === "__Host-fxav_picker") return valueParts.join("=");
  }
  return undefined;
}

async function showIdFromSlug(slug: string): Promise<"infra_error" | string | null> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = (await supabase
      .from("shows")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()) as { data: { id: string } | null; error: unknown };
    if (error) return "infra_error";
    return data?.id ?? null;
  } catch {
    return "infra_error";
  }
}

async function resolveVersionViewer(request: NextRequest, slug: string): Promise<ApiViewer> {
  const showId = await showIdFromSlug(slug);
  if (showId === "infra_error") {
    return { ok: false, status: 500, error: "ADMIN_SESSION_LOOKUP_FAILED" };
  }
  if (!showId) {
    return { ok: false, status: 401, error: "SHOW_VERSION_AUTH_FAILED", reason: "unknown_slug" };
  }

  const admin = await isAdminSession(request);
  if (admin.ok) return { ok: true, showId };
  if (admin.reason === "infra_error") {
    return { ok: false, status: 500, error: "ADMIN_SESSION_LOOKUP_FAILED" };
  }

  const picker = await resolvePickerSelection({
    showId,
    cookie: pickerCookieFromRequest(request),
  });
  switch (picker.kind) {
    case "resolved":
      return { ok: true, showId };
    case "show_unavailable":
      return { ok: false, status: 410, error: "PICKER_SHOW_UNAVAILABLE" };
    case "identity_invalidated":
      return {
        ok: false,
        status: 410,
        error: "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
        reason: picker.reason,
      };
    case "infra_error":
      return { ok: false, status: 500, error: picker.code };
    case "no_selection":
    case "epoch_stale":
    case "removed_from_roster":
      return { ok: false, status: 401, error: "SHOW_VERSION_AUTH_FAILED", reason: picker.kind };
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;

  const viewer = await resolveVersionViewer(request, slug);
  if (!viewer.ok) {
    return NextResponse.json(
      { error: viewer.error, reason: viewer.reason },
      { status: viewer.status },
    );
  }

  const showId = viewer.showId;

  const svc = createSupabaseServiceRoleClient();
  const { data, error } = await svc.rpc("viewer_version_token", {
    p_show_id: showId,
  });
  if (error) {
    return NextResponse.json({ error: "SHOW_VERSION_TOKEN_RPC_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ version_token: data ?? "" });
}
