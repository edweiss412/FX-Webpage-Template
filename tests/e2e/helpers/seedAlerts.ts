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
  const { error } = await admin.from("admin_alerts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
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
    .filter((e) => (e as { severity?: string }).severity !== "info" && e.dougFacing != null && e.code !== TOP_CODE)
    .map((e) => e.code);
  const rows: Array<Record<string, unknown>> = [
    { show_id: null, code: TOP_CODE, context: { "sheet-name": "A Very Long Show Name That Exercises Summary Truncation 2026" }, raised_at: new Date(Date.now() - 5 * 3600_000).toISOString() },
  ];
  let made = 1;
  outer: for (const code of fillerCodes) {
    for (const showId of showIds) {
      if (made >= count) break outer;
      rows.push({ show_id: showId, code, context: {}, raised_at: new Date(Date.now() - 8 * 3600_000 - made * 1000).toISOString() });
      made++;
    }
  }
  if (made < count) throw new Error(`seedNUnresolved: only built ${made}/${count} (seeded shows=${showIds.length})`);
  const { error: insErr } = await admin.from("admin_alerts").insert(rows);
  if (insErr) throw new Error(`seedNUnresolved insert failed: ${insErr.message}`);
  const { count: got, error: cntErr } = await admin
    .from("admin_alerts").select("id", { count: "exact", head: true }).is("resolved_at", null);
  if (cntErr) throw new Error(`seedNUnresolved verify count failed: ${cntErr.message}`);
  if (got !== count) throw new Error(`seedNUnresolved: expected ${count} unresolved, got ${got}`);
}
export async function seedGlobalAlert(opts: { count: number }) { await seedNUnresolved(opts.count); }
