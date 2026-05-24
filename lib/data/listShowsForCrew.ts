/**
 * lib/data/listShowsForCrew.ts (M11.5 §B Task E2)
 *
 * Pre-pivot: read `crew_members` joined to `shows` via service-role
 * client, keyed off the canonical email passed in by the caller.
 *
 * Post-pivot: read the per-show share-token via the SECURITY DEFINER
 * RPC `my_share_tokens_for_email`. The RPC reads `auth.email()`
 * canonically inside the function body, which means it ONLY returns
 * rows when the calling Supabase client carries an authenticated JWT
 * (a cookie-bound client built via createSupabaseServerClient).
 *
 * Service-role clients have NO JWT — `auth.email()` is null — and
 * the RPC returns an empty set. The negative test in
 * tests/data/listShowsForCrew.test.ts pins this contract; the
 * function's signature accepts a `SupabaseClient` so callers can be
 * inspected for cookie-bound vs service-role construction at the
 * call-site rather than inside this helper.
 *
 * The function still returns the existing CrewShowSummary shape so
 * the /me page rendering (partitionMeShows, featured/upcoming/past
 * cards) stays unchanged. The new field `shareToken` is added so
 * callers can render `/show/<slug>/<share-token>` tokenized URLs
 * per the M11.5 R35 routing contract.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CrewShowSummary = {
  id: string;
  slug: string;
  title: string;
  dates: unknown;
  venue: { name: string | null } | null;
  shareToken: string;
};

type ShareTokenRow = { slug: string; share_token: string };

type ShowMetadataRow = {
  id: string;
  slug: string;
  title: string;
  dates: unknown;
  venue: unknown;
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
  if (typeof venue !== "object" || venue === null || Array.isArray(venue)) {
    return null;
  }
  const name = (venue as { name?: unknown }).name;
  if (typeof name !== "string" || name.length === 0) return null;
  return name;
}

/**
 * The `supabase` argument MUST be a cookie-bound client built via
 * `createSupabaseServerClient` so the underlying RPC's
 * `auth.email()` read resolves to the signed-in user. Service-role
 * clients silently return an empty set — see the structural
 * negative test pinning this contract.
 */
export async function listShowsForCrew(
  supabase: SupabaseClient,
): Promise<CrewShowSummary[]> {
  const { data: tokens, error: tokenErr } = await supabase.rpc(
    "my_share_tokens_for_email",
  );
  if (tokenErr) {
    throw new Error("listShowsForCrew: share-token lookup failed");
  }
  const rows = (tokens ?? []) as ShareTokenRow[];
  if (rows.length === 0) return [];

  const slugs = rows.map((r) => r.slug);
  const tokenBySlug = new Map(rows.map((r) => [r.slug, r.share_token]));

  const { data: shows, error: showErr } = await supabase
    .from("shows")
    .select("id, slug, title, dates, venue")
    .in("slug", slugs)
    .eq("archived", false)
    .eq("published", true);
  if (showErr) {
    throw new Error("listShowsForCrew: show metadata lookup failed");
  }

  return ((shows ?? []) as ShowMetadataRow[])
    .map((s) => {
      const shareToken = tokenBySlug.get(s.slug);
      if (typeof shareToken !== "string") return null;
      return {
        id: s.id,
        slug: s.slug,
        title: s.title,
        dates: s.dates,
        venue: pickVenueName(s.venue) ? { name: pickVenueName(s.venue) } : null,
        shareToken,
      } satisfies CrewShowSummary;
    })
    .filter((s): s is CrewShowSummary => s !== null)
    .sort((a, b) => setDateMs(b.dates) - setDateMs(a.dates));
}
