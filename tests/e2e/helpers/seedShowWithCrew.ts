/**
 * tests/e2e/helpers/seedShowWithCrew.ts (M11.5-PLAYWRIGHT-HELPERS)
 *
 * Service-role seed helper for the picker-flow Playwright suite. Writes a
 * fully-resolvable crew route — `shows` + `crew_members` + `show_share_tokens`
 * — so the tokenized URL `/show/<slug>/<shareToken>` resolves through
 * `resolve_show_by_slug_and_token` (a SECURITY DEFINER join over both tables,
 * supabase/migrations/20260523000005_resolve_show_by_slug_and_token.sql).
 *
 * Resolvability contract (lib/auth/picker/resolveShowPageAccess.ts):
 *   - the slug+token pair must join in `show_share_tokens` (a row is created
 *     for us — see below)
 *   - the show must be `published=true` AND `archived=false` (table defaults;
 *     we leave them at default unless the caller overrides) so the route
 *     reaches the picker chain rather than 404 / unpublished.
 *
 * share_token provenance: an AFTER INSERT trigger on `shows`
 * (shows_create_share_token_after_insert → create_share_token_for_show) ALWAYS
 * creates the `show_share_tokens` row with a random 64-hex default token. So we
 * do NOT insert that row ourselves (it would collide on the show_id PK); we
 * UPDATE it to the caller's token (when supplied) and read the effective token
 * back. share_token shape `^[0-9a-f]{64}$` is enforced by a CHECK constraint
 * (show_share_tokens_share_token_check); freshShareToken() satisfies it.
 *
 * AGENTS invariant 9 (Supabase call-boundary): every call destructures
 * { data, error } and throws with context — a silent failed insert would
 * leave a half-seeded show that satisfies some assertions and hides the bug.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { admin } from "./supabaseAdmin";

export type SeedCrewMemberInput = {
  /** Defaults to a fresh UUID; pass one when the test needs to reference it (e.g. picker cookie entry). */
  id?: string;
  name: string;
  role: string;
  /** Optional canonical email so a Google-session match (validateGoogleSession) resolves to this row. */
  email?: string | null;
  roleFlags?: string[];
  /** ISO timestamp; when set the picker renders this row as claimed (data-claimed="true"). */
  claimedViaOauthAt?: string | null;
};

export type SeededCrewMember = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  claimedViaOauthAt: string | null;
};

export type SeedShowWithCrewOptions = {
  /** Stable identifier so re-runs can purge prior residue; defaults to a unique value. */
  driveFileId?: string;
  /** URL slug path segment; defaults to a unique value. */
  slug?: string;
  title?: string;
  clientLabel?: string;
  templateVersion?: string;
  /** 64-hex share token; defaults to the trigger-minted one (read back). */
  shareToken?: string;
  published?: boolean;
  archived?: boolean;
  pickerEpoch?: number;
  crew?: SeedCrewMemberInput[];
};

export type SeededShow = {
  showId: string;
  slug: string;
  shareToken: string;
  driveFileId: string;
  pickerEpoch: number;
  crew: SeededCrewMember[];
};

/** A 64-lowercase-hex token satisfying show_share_tokens_share_token_check. */
export function freshShareToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Purge any prior show seeded under `driveFileId` (and its FK-cascading
 * crew_members / show_share_tokens rows) so re-runs start clean. Idempotent.
 */
export async function deleteSeededShow(driveFileId: string): Promise<void> {
  const { error } = await admin.from("shows").delete().eq("drive_file_id", driveFileId);
  if (error) throw new Error(`deleteSeededShow(${driveFileId}) failed: ${error.message}`);
}

export async function seedShowWithCrew(options: SeedShowWithCrewOptions = {}): Promise<SeededShow> {
  const driveFileId = options.driveFileId ?? `picker-e2e:${randomUUID()}`;
  const slug = options.slug ?? `picker-e2e-${randomUUID().slice(0, 8)}`;
  const pickerEpoch = options.pickerEpoch ?? 1;

  // Create-or-replace: drop any residue from a prior run under this driveFileId
  // first (FK ON DELETE CASCADE clears crew_members + show_share_tokens).
  await deleteSeededShow(driveFileId);

  const showId = randomUUID();
  const { error: showErr } = await admin.from("shows").insert({
    id: showId,
    drive_file_id: driveFileId,
    slug,
    title: options.title ?? "Picker E2E Show",
    client_label: options.clientLabel ?? "Picker E2E Client",
    template_version: options.templateVersion ?? "v1",
    published: options.published ?? true,
    archived: options.archived ?? false,
    picker_epoch: pickerEpoch,
  });
  if (showErr) throw new Error(`seedShowWithCrew shows insert failed: ${showErr.message}`);

  // The AFTER INSERT trigger already created the show_share_tokens row. Set the
  // token to the caller's value when supplied; otherwise read the minted one.
  let shareToken: string;
  if (options.shareToken) {
    const { data, error } = await admin
      .from("show_share_tokens")
      .update({ share_token: options.shareToken })
      .eq("show_id", showId)
      .select("share_token");
    if (error) throw new Error(`seedShowWithCrew share_token update failed: ${error.message}`);
    if (!data || data.length === 0)
      throw new Error("seedShowWithCrew: trigger did not create a show_share_tokens row");
    shareToken = data[0]!.share_token as string;
  } else {
    const { data, error } = await admin
      .from("show_share_tokens")
      .select("share_token")
      .eq("show_id", showId)
      .maybeSingle();
    if (error) throw new Error(`seedShowWithCrew share_token read failed: ${error.message}`);
    if (!data?.share_token)
      throw new Error("seedShowWithCrew: trigger did not create a show_share_tokens row");
    shareToken = data.share_token as string;
  }

  const crewInput = options.crew ?? [];
  const crewRows = crewInput.map((c) => ({
    id: c.id ?? randomUUID(),
    show_id: showId,
    name: c.name,
    role: c.role,
    email: c.email ?? null,
    role_flags: c.roleFlags ?? [],
    claimed_via_oauth_at: c.claimedViaOauthAt ?? null,
  }));

  let crew: SeededCrewMember[] = [];
  if (crewRows.length > 0) {
    const { data, error: crewErr } = await admin
      .from("crew_members")
      .insert(crewRows)
      .select("id, name, role, email, claimed_via_oauth_at");
    if (crewErr) throw new Error(`seedShowWithCrew crew_members insert failed: ${crewErr.message}`);
    crew = (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      role: r.role as string,
      email: (r.email as string | null) ?? null,
      claimedViaOauthAt: (r.claimed_via_oauth_at as string | null) ?? null,
    }));
  }

  return { showId, slug, shareToken, driveFileId, pickerEpoch, crew };
}
