/**
 * lib/admin/loadIgnoredSheets.ts (Task E2 — spec §6.3)
 *
 * Loader for the /admin/ignored-sheets view: the durably-ignored sheets — LIVE
 * `deferred_ingestions` rows with `wizard_session_id IS NULL` and
 * `deferred_kind = 'permanent_ignore'`. STRICTLY permanent_ignore: the
 * separate auto-expiring `defer_until_modified` partition is NOT listed here
 * (that re-surfaces on its own when the sheet is modified).
 *
 * Each row carries `drive_file_name` (A2 column — first-seen ignored sheets
 * have no `shows` row to join a name from), `deferred_at`, `deferred_by_email`.
 * The view renders the name (fallback to the drive id when null).
 *
 * Every Supabase await is wrapped per AGENTS.md invariant 9 (typed
 * infra_error, table-specific "…threw" message). Registered in
 * tests/admin/_metaInfraContract.test.ts (infraRegistry).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type IgnoredSheetRow = {
  driveFileId: string;
  driveFileName: string | null;
  deferredAt: string | null;
  deferredByEmail: string | null;
};

export type LoadIgnoredSheetsResult =
  | { kind: "ok"; rows: IgnoredSheetRow[] }
  | { kind: "infra_error"; message: string };

// Bound the rendered list (the ignored set is small; a safety cap so the page
// never renders an unbounded list).
const IGNORED_SHEETS_CAP = 500;

export async function loadIgnoredSheets(
  opts: {
    supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  } = {},
): Promise<LoadIgnoredSheetsResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  if (opts.supabase) {
    supabase = opts.supabase;
  } else {
    try {
      supabase = await createSupabaseServerClient();
    } catch (err) {
      return {
        kind: "infra_error",
        message: `supabase client construction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  let rawRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data, error } = await supabase
      .from("deferred_ingestions")
      .select("drive_file_id, drive_file_name, deferred_at, deferred_by_email")
      .is("wizard_session_id", null)
      .eq("deferred_kind", "permanent_ignore")
      .order("deferred_at", { ascending: false, nullsFirst: false })
      .limit(IGNORED_SHEETS_CAP);
    if (error) {
      return {
        kind: "infra_error",
        message: `deferred_ingestions query failed: ${error.message}`,
      };
    }
    rawRows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `deferred_ingestions query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const rows: IgnoredSheetRow[] = rawRows.map((r) => ({
    driveFileId: r.drive_file_id as string,
    driveFileName: (r.drive_file_name as string | null) ?? null,
    deferredAt: (r.deferred_at as string | null) ?? null,
    deferredByEmail: (r.deferred_by_email as string | null) ?? null,
  }));

  return { kind: "ok", rows };
}
