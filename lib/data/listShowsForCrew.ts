import type { GoogleIdentityViewer } from "@/lib/auth/validateGoogleIdentity";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type CrewShowSummary = {
  id: string;
  slug: string;
  title: string;
  dates: unknown;
  crewMemberId: string;
};

type JoinedCrewShowRow = {
  id: string;
  shows:
    | {
        id: string;
        slug: string;
        title: string;
        dates: unknown;
        archived: boolean;
        published: boolean;
      }
    | Array<{
        id: string;
        slug: string;
        title: string;
        dates: unknown;
        archived: boolean;
        published: boolean;
      }>;
};

function setDateMs(dates: unknown): number {
  if (typeof dates !== "object" || dates === null || Array.isArray(dates)) {
    return Number.NEGATIVE_INFINITY;
  }
  const set = (dates as { set?: unknown }).set;
  if (typeof set !== "string") {
    return Number.NEGATIVE_INFINITY;
  }
  const ms = Date.parse(set);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function normalizeShow(row: JoinedCrewShowRow): CrewShowSummary | null {
  const show = Array.isArray(row.shows) ? row.shows[0] : row.shows;
  if (!show || show.archived || !show.published) {
    return null;
  }
  return {
    id: show.id,
    slug: show.slug,
    title: show.title,
    dates: show.dates,
    crewMemberId: row.id,
  };
}

export async function listShowsForCrew(
  viewer: GoogleIdentityViewer,
): Promise<CrewShowSummary[]> {
  const email = canonicalize(viewer.email);
  if (!email) {
    return [];
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = (await supabase
    .from("crew_members")
    .select("id, shows!inner(id, slug, title, dates, archived, published)")
    .eq("email", email)
    .eq("shows.archived", false)
    .eq("shows.published", true)) as {
    data: JoinedCrewShowRow[] | null;
    error: unknown;
  };

  if (error) {
    throw new Error("listShowsForCrew: show lookup failed");
  }

  return (data ?? [])
    .map(normalizeShow)
    .filter((show): show is CrewShowSummary => show !== null)
    .sort((a, b) => setDateMs(b.dates) - setDateMs(a.dates));
}
