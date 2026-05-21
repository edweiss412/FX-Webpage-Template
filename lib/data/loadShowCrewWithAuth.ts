/**
 * lib/data/loadShowCrewWithAuth.ts (M9.5)
 *
 * Per-show admin page data fetch: load crew_members rows and merge in
 * each member's crew_member_auth version state
 * (current_token_version, max_issued_version, revoked_below_version).
 * Used by app/admin/show/[slug]/page.tsx to render
 * <PerShowCrewSection>.
 *
 * Two separate SELECTs (not a PostgREST embedded join) because the
 * live schema has no FK from crew_member_auth to crew_members — the
 * correlation is (show_id, crew_name) only.
 *
 * Fail-closed contract (Codex R1 HIGH-1 fix):
 *   - ANY returned-error OR thrown-error from EITHER SELECT →
 *     crewLookupFailed=true + crew=[].
 *   - A crew_members row without a matching crew_member_auth row →
 *     authMissing:true with sentinel version values 0/0/0.
 *
 * UI MUST branch on authMissing FIRST — sentinel values 0/0/0 would
 * otherwise satisfy the no-live-link predicate
 * (current_token_version === revoked_below_version) AND the fresh
 * predicate (max_issued_version === 1 is false here, but 0/0/0 still
 * looks "live" to a naive consumer), producing a misleading affordance
 * on a row whose auth state is unknown.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CrewRowForLinkPanel = {
  id: string;
  name: string;
  role: string | null;
  authMissing: boolean;
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

export type LoadCrewResult = {
  crew: CrewRowForLinkPanel[];
  crewLookupFailed: boolean;
};

type MemberRow = { id: string; name: string; role: string | null };
type AuthRow = {
  crew_name: string;
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

export async function loadShowCrewWithAuth(
  supabase: SupabaseClient,
  showId: string,
): Promise<LoadCrewResult> {
  let members: MemberRow[] | null = null;
  let memberErr = false;
  try {
    const { data, error } = await supabase
      .from("crew_members")
      .select("id, name, role")
      .eq("show_id", showId)
      .order("name", { ascending: true });
    if (error !== null) {
      console.error(
        "[loadShowCrewWithAuth] crew_members error:",
        error.message,
      );
      memberErr = true;
    } else {
      members = (data as MemberRow[] | null) ?? [];
    }
  } catch (err) {
    console.error(
      "[loadShowCrewWithAuth] crew_members threw:",
      err instanceof Error ? err.message : String(err),
    );
    memberErr = true;
  }

  let authRows: AuthRow[] | null = null;
  let authErr = false;
  try {
    const { data, error } = await supabase
      .from("crew_member_auth")
      .select(
        "crew_name, current_token_version, max_issued_version, revoked_below_version",
      )
      .eq("show_id", showId);
    if (error !== null) {
      console.error(
        "[loadShowCrewWithAuth] crew_member_auth error:",
        error.message,
      );
      authErr = true;
    } else {
      authRows = (data as AuthRow[] | null) ?? [];
    }
  } catch (err) {
    console.error(
      "[loadShowCrewWithAuth] crew_member_auth threw:",
      err instanceof Error ? err.message : String(err),
    );
    authErr = true;
  }

  if (memberErr || authErr) {
    return { crew: [], crewLookupFailed: true };
  }

  const authByName = new Map((authRows ?? []).map((r) => [r.crew_name, r]));
  const crew: CrewRowForLinkPanel[] = (members ?? []).map((m) => {
    const auth = authByName.get(m.name);
    if (!auth) {
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        authMissing: true,
        current_token_version: 0,
        max_issued_version: 0,
        revoked_below_version: 0,
      };
    }
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      authMissing: false,
      current_token_version: auth.current_token_version,
      max_issued_version: auth.max_issued_version,
      revoked_below_version: auth.revoked_below_version,
    };
  });
  return { crew, crewLookupFailed: false };
}
