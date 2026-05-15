import type { GoogleIdentityViewer } from "@/lib/auth/validateGoogleIdentity";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type CrewShowSummary = {
  id: string;
  slug: string;
  title: string;
  dates: unknown;
  /**
   * R2 F2 (codex finding): the /me featured card answers
   * "Where am I going next?" with `Venue · Date`. The shows table
   * carries `venue jsonb` (parser projection); expose its `name` so
   * the /me page can render it. Defensive — null when missing or
   * shape doesn't match.
   */
  venue: { name: string | null } | null;
  crewMemberId: string;
};

type JoinedShowRow = {
  id: string;
  slug: string;
  title: string;
  dates: unknown;
  venue: unknown;
  archived: boolean;
  published: boolean;
};

type JoinedCrewShowRow = {
  id: string;
  shows: JoinedShowRow | JoinedShowRow[];
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

function pickVenueName(venue: unknown): string | null {
  if (typeof venue !== "object" || venue === null || Array.isArray(venue)) return null;
  const name = (venue as { name?: unknown }).name;
  if (typeof name !== "string" || name.length === 0) return null;
  return name;
}

function normalizeShow(row: JoinedCrewShowRow): CrewShowSummary | null {
  const show = Array.isArray(row.shows) ? row.shows[0] : row.shows;
  if (!show || show.archived || !show.published) {
    return null;
  }
  const venueName = pickVenueName(show.venue);
  return {
    id: show.id,
    slug: show.slug,
    title: show.title,
    dates: show.dates,
    venue: venueName ? { name: venueName } : null,
    crewMemberId: row.id,
  };
}

export async function listShowsForCrew(viewer: GoogleIdentityViewer): Promise<CrewShowSummary[]> {
  const email = canonicalize(viewer.email);
  if (!email) {
    return [];
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = (await supabase
    .from("crew_members")
    .select("id, shows!inner(id, slug, title, dates, venue, archived, published)")
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
