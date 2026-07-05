// tests/e2e/helpers/seedAlerts.ts (M12.2 RECON-1, shared by T7 + T8)
import { admin } from "./supabaseAdmin";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

// A long-message non-info code so the summary truncation is exercised; used as
// the TOP alert (most recent raised_at), so it's the one the banner renders.
export const TOP_CODE = "SYNC_DELAYED_SEVERE" as const;

// AGENTS invariant 9 (Supabase call-boundary): every call destructures
// { data, error } and throws with context — a silent failed clear/insert would
// leave stale alerts that satisfy assertions and hide seed bugs.
export async function clearAlerts() {
  const { error } = await admin
    .from("admin_alerts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`clearAlerts failed: ${error.message}`);
}

// Seed exactly `count` UNRESOLVED rows so fetchUnresolvedAlertCount() === count.
// Unique index (coalesce(show_id,''), code) WHERE resolved_at IS NULL ⇒ each row
// needs a distinct (show_id, code) pair: one GLOBAL top row (show_id null +
// TOP_CODE) + (count-1) filler rows spread across seeded shows × non-info codes.
export async function seedNUnresolved(count: number) {
  await clearAlerts();
  const { data: shows, error: showsErr } = await admin.from("shows").select("id").limit(50);
  if (showsErr) throw new Error(`seedNUnresolved shows select failed: ${showsErr.message}`);
  const showIds = (shows ?? []).map((s) => s.id as string);
  const fillerCodes = Object.values(MESSAGE_CATALOG)
    .filter(
      (e) =>
        (e as { severity?: string }).severity !== "info" &&
        e.dougFacing != null &&
        e.code !== TOP_CODE,
    )
    .map((e) => e.code);
  const rows: Array<Record<string, unknown>> = [
    {
      show_id: null,
      code: TOP_CODE,
      context: { "sheet-name": "A Very Long Show Name That Exercises Summary Truncation 2026" },
      raised_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    },
  ];
  let made = 1;
  outer: for (const code of fillerCodes) {
    for (const showId of showIds) {
      if (made >= count) break outer;
      rows.push({
        show_id: showId,
        code,
        context: {},
        raised_at: new Date(Date.now() - 8 * 3600_000 - made * 1000).toISOString(),
      });
      made++;
    }
  }
  if (made < count)
    throw new Error(
      `seedNUnresolved: only built ${made}/${count} (seeded shows=${showIds.length})`,
    );
  const { error: insErr } = await admin.from("admin_alerts").insert(rows);
  if (insErr) throw new Error(`seedNUnresolved insert failed: ${insErr.message}`);
  const { count: got, error: cntErr } = await admin
    .from("admin_alerts")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);
  if (cntErr) throw new Error(`seedNUnresolved verify count failed: ${cntErr.message}`);
  if (got !== count) throw new Error(`seedNUnresolved: expected ${count} unresolved, got ${got}`);
}
export async function seedGlobalAlert(opts: { count: number }) {
  await seedNUnresolved(opts.count);
}

// Seed exactly ONE unresolved GLOBAL WATCH_CHANNEL_ORPHANED row (spec §3.4). The
// banner's watch branch keys on `code === "WATCH_CHANNEL_ORPHANED" && show_id null`
// so this row renders the Retry action slot + panel dismiss/status/error-detail.
// `context.error_class` / `context.error_message` drive the escalated status line
// (config → escalated) and the muted error-detail <code> line; `occurrence_count`
// drives escalation (>= ESCALATION_THRESHOLD → "flagged for support"). admin_alerts.context
// is NOT NULL, so an empty `{}` is always inserted even when no knobs are supplied.
export async function seedWatchAlert(
  opts: { occurrenceCount?: number; errorClass?: string; errorMessage?: string } = {},
) {
  await clearAlerts();
  const context: Record<string, unknown> = {};
  if (opts.errorClass !== undefined) context.error_class = opts.errorClass;
  if (opts.errorMessage !== undefined) context.error_message = opts.errorMessage;
  const { error } = await admin.from("admin_alerts").insert({
    show_id: null,
    code: "WATCH_CHANNEL_ORPHANED",
    context,
    occurrence_count: opts.occurrenceCount ?? 1,
    raised_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
  });
  if (error) throw new Error(`seedWatchAlert insert failed: ${error.message}`);
}

// Seed exactly ONE unresolved PER-SHOW OAUTH_IDENTITY_CLAIMED row whose context
// resolves to a visible at-a-glance identity (Task 10 / spec §3.1–§3.3). Used by
// tests/e2e/alert-identity-banner-layout.spec.ts to exercise the identity line's
// real-browser geometry (jsdom computes no layout).
//
// Code choice: OAUTH_IDENTITY_CLAIMED is (a) NON-info severity — its catalog entry
// (lib/messages/catalog.ts:2908) has no `severity:"info"` field, so the banner's
// info-exclusion filter does NOT drop it and it renders — and (b) has an identity
// map entry (lib/adminAlerts/alertIdentityMap.ts:68) with crewName · email · showName
// segments. The EMAIL segment is authoritative from `context.user_email` WITHOUT a
// DB lookup (resolveAlertIdentities.ts:71 EMAIL_FIELD_BY_CODE), so setting
// user_email ALWAYS makes describeAlert non-null ⇒ admin-alert-identity present,
// even if the crew/show segments fail to resolve.
//
// `show_id` (the COLUMN) is set to a real show id ⇒ isPerShowAlert (AlertBanner.tsx:219)
// ⇒ the action cell renders the "Check it" show link (admin-alert-show-link). The
// banner joins `shows(slug,title)`, so the picked show must have a slug (real shows
// do). Returns the seeded show's { id, title, slug } so callers can assert copy.
export async function seedIdentityAlert(
  opts: { userEmail?: string } = {},
): Promise<{ id: string; title: string | null; slug: string | null }> {
  await clearAlerts();
  const { data: shows, error: showsErr } = await admin
    .from("shows")
    .select("id, title, slug")
    .limit(1);
  if (showsErr) throw new Error(`seedIdentityAlert shows select failed: ${showsErr.message}`);
  const show = (shows ?? [])[0] as
    | { id: string; title: string | null; slug: string | null }
    | undefined;
  if (!show) throw new Error("seedIdentityAlert: no shows seeded in local DB");

  // Optionally resolve the crew segment against a real crew_member for this show.
  // Absent is fine — the user_email email segment alone still renders the identity.
  const { data: crew, error: crewErr } = await admin
    .from("crew_members")
    .select("id, name")
    .eq("show_id", show.id)
    .limit(1);
  if (crewErr) throw new Error(`seedIdentityAlert crew select failed: ${crewErr.message}`);
  const crewMember = (crew ?? [])[0] as { id: string; name: string | null } | undefined;

  const context: Record<string, unknown> = {
    show_id: show.id,
    user_email: opts.userEmail ?? "crew.identity@example.com",
  };
  if (crewMember) context.crew_member_id = crewMember.id;

  const { error } = await admin.from("admin_alerts").insert({
    show_id: show.id,
    code: "OAUTH_IDENTITY_CLAIMED",
    context,
    raised_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
  });
  if (error) throw new Error(`seedIdentityAlert insert failed: ${error.message}`);
  return { id: show.id, title: show.title, slug: show.slug };
}
