/**
 * Service-role Supabase client for Playwright test setup/teardown + isolation
 * probes. Service role bypasses RLS, so tests can snapshot any table directly.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from process.env. Defaults
 * are local Supabase studio so `pnpm test:e2e` works out of the box against
 * `pnpm dlx supabase start`.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  // Default service role key shipped with `supabase start`.
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Snapshot of the public.* Phase-1 write surfaces. Used by the schema-isolation
 * probe in tests/e2e/admin-dev.spec.ts to assert that nothing in `public.*`
 * mutates while the dev panel writes to `dev.*`.
 *
 * Captures every Phase-1 surface listed in the M3 plan at lines 41-50 of
 * docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/03-04-tiles.md.
 */
export type PublicSchemaSnapshot = {
  showsCount: number;
  showsStatus: Array<{
    id: string;
    last_sync_status: string | null;
    last_sync_error: string | null;
    last_synced_at: string | null;
    last_seen_modified_time: string | null;
  }>;
  pendingSyncsCount: number;
  pendingSyncsHashes: string[];
  pendingIngestionsCount: number;
  pendingIngestionsHashes: string[];
  syncLogCount: number;
  syncAuditCount: number;
};

export async function snapshotPublicSchema(): Promise<PublicSchemaSnapshot> {
  // Use service-role client so RLS doesn't shadow rows. Each select uses count:'exact'
  // to surface the row count in the response header even if rows are empty.
  const showsRes = await admin
    .from("shows")
    .select("id, last_sync_status, last_sync_error, last_synced_at, last_seen_modified_time", {
      count: "exact",
    });
  if (showsRes.error) throw new Error(`shows snapshot failed: ${showsRes.error.message}`);

  const pendingSyncsRes = await admin
    .from("pending_syncs")
    .select("drive_file_id, parse_result, triggered_review_items, warning_summary", {
      count: "exact",
    });
  if (pendingSyncsRes.error)
    throw new Error(`pending_syncs snapshot failed: ${pendingSyncsRes.error.message}`);

  const pendingIngRes = await admin
    .from("pending_ingestions")
    .select("drive_file_id, last_error_code, last_error_message, last_warnings", {
      count: "exact",
    });
  if (pendingIngRes.error)
    throw new Error(`pending_ingestions snapshot failed: ${pendingIngRes.error.message}`);

  const logRes = await admin.from("sync_log").select("id", { count: "exact", head: true });
  if (logRes.error) throw new Error(`sync_log snapshot failed: ${logRes.error.message}`);

  const auditRes = await admin.from("sync_audit").select("id", { count: "exact", head: true });
  if (auditRes.error) throw new Error(`sync_audit snapshot failed: ${auditRes.error.message}`);

  // Build content hashes — JSON-stringify each row's content fields.
  const pendingSyncsHashes = (pendingSyncsRes.data ?? []).map((row) => JSON.stringify(row)).sort();
  const pendingIngestionsHashes = (pendingIngRes.data ?? [])
    .map((row) => JSON.stringify(row))
    .sort();
  const showsStatus = ((showsRes.data ?? []) as PublicSchemaSnapshot["showsStatus"])
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    showsCount: showsRes.count ?? 0,
    showsStatus,
    pendingSyncsCount: pendingSyncsRes.count ?? 0,
    pendingSyncsHashes,
    pendingIngestionsCount: pendingIngRes.count ?? 0,
    pendingIngestionsHashes,
    syncLogCount: logRes.count ?? 0,
    syncAuditCount: auditRes.count ?? 0,
  };
}

/**
 * Truncate every dev.* table the dev panel may have written to. Run as a
 * setup hook before each Playwright test to prevent test pollution.
 *
 * Uses TRUNCATE ... CASCADE so child tables clear too. Tables not yet
 * present (the migration hasn't run) are silently skipped.
 */
export async function resetDevSchema(): Promise<void> {
  // Service-role can call any RPC; dev_truncate_all is a SECURITY DEFINER
  // helper provisioned by the dev-schema clone migration.
  const { error } = await admin.rpc("dev_truncate_all");
  if (error) {
    throw new Error(`dev_truncate_all failed: ${error.message}`);
  }
}
