/**
 * tests/e2e/helpers/claimStamp.ts (M11.5-PLAYWRIGHT-HELPERS)
 *
 * Service-role helper that sets `crew_members.claimed_via_oauth_at` directly so
 * the deactivated-row picker test does not depend on first running the OAuth
 * callback chain (C7). A claimed row renders in <PickerInterstitial> with
 * data-claimed="true" + a lock glyph + a GET form to /auth/sign-in
 * (app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:151-187).
 *
 * IMPORTANT: the claim timestamp lives on `crew_members`, NOT on
 * `crew_member_auth` — that table was DROPPED in
 * supabase/migrations/20260523000099_cutover_drop_m9_5.sql. The resolver reads
 * `crew_members.claimed_via_oauth_at` (lib/auth/picker/resolvePickerSelection.ts:93).
 *
 * AGENTS invariant 9 (Supabase call-boundary): destructure { data, error } and
 * throw with context; a silent no-op UPDATE (wrong id) would leave the row
 * unclaimed and the test would assert against a stale render.
 */
import { admin } from "./supabaseAdmin";

/**
 * Stamp `claimed_via_oauth_at` on a crew member. Returns the value written so
 * callers can build a picker cookie whose entry `t` is before/after the claim
 * (the resolver's claimed_after_pick branch compares entry.t <= claimMillis).
 */
export async function claimStamp(
  crewMemberId: string,
  at: string = new Date().toISOString(),
): Promise<string> {
  const { data, error } = await admin
    .from("crew_members")
    .update({ claimed_via_oauth_at: at })
    .eq("id", crewMemberId)
    .select("id, claimed_via_oauth_at");
  if (error) throw new Error(`claimStamp(${crewMemberId}) failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`claimStamp(${crewMemberId}): no crew_members row matched (wrong id?)`);
  }
  return data[0]!.claimed_via_oauth_at as string;
}
