/**
 * tests/e2e/helpers/stagedSync.ts — the ONE staged-row seed/cleanup pair for e2e.
 *
 * Both specs that need a real `pending_syncs` row (the admin route-boundary proof
 * and the staged crew preview) route through here rather than each carrying its
 * own copy of the insert. That matters for more than DRY: the locked-table pin in
 * `tests/help/walker-routes.test.ts` counts locked-table DML PER FILE and freezes
 * it, so two copies are two frozen counts that drift independently, while one
 * helper is one row that shrinks to zero the day a locked seed replaces it.
 *
 * These writes go through the SERVICE-ROLE client (`helpers/supabaseAdmin.ts`),
 * which is elevated test setup/cleanup and bypasses the PostgREST DML lockdown by
 * design — the lockdown REVOKEs from `authenticated`, not from `service_role`.
 */
import { admin } from "./supabaseAdmin";

/** Delete every staged row for a drive file. Safe to call when none exist. */
export async function clearStagedFor(driveFileId: string): Promise<void> {
  const { error } = await admin.from("pending_syncs").delete().eq("drive_file_id", driveFileId);
  if (error) throw new Error(`clearStagedFor(${driveFileId}) failed: ${error.message}`);
}

/**
 * Insert one staged row and return its `staged_id`.
 *
 * `parseResult` defaults to the minimal shape the route-boundary spec needs (its
 * gate throws before the row is ever read); callers that actually RENDER the
 * staged parse pass a real one.
 */
export async function insertStagedFor(
  driveFileId: string,
  parseResult: unknown = { show: { title: "Seed Test Show", client_label: "Seed Test Client" } },
): Promise<string> {
  const { data, error } = await admin
    .from("pending_syncs")
    .insert({
      drive_file_id: driveFileId,
      source_kind: "manual",
      base_modified_time: null,
      staged_modified_time: new Date().toISOString(),
      parse_result: parseResult,
      triggered_review_items: [],
      warning_summary: "",
    })
    .select("staged_id")
    .single();
  if (error) throw new Error(`insertStagedFor(${driveFileId}) failed: ${error.message}`);
  return (data as { staged_id: string }).staged_id;
}
