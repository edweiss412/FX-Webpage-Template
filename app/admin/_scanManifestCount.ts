/**
 * app/admin/_scanManifestCount.ts (wizard Back/forward fix, 2026-06-26)
 *
 * Private helper consumed by app/admin/page.tsx's wizard dispatch. Reports
 * whether the active wizard session has any onboarding_scan_manifest rows —
 * i.e. whether a scan actually produced something reviewable on Step 3.
 *
 * WHY this exists: `pending_wizard_session_id !== null` is NOT a safe proxy for
 * "a scan produced reviewable data." reserveWizardSession commits the session id
 * + pending_folder_* BEFORE the scan runs (a failed/0-sheet scan leaves them
 * set), and purgeAndRotateOnboardingSession ("Start over") MINTS a new non-null
 * session id while purging the manifest rows. In both states the session id is
 * non-null but the manifest is empty. Gating the Step-2 resume affordance + the
 * forward stepper pill on the session id alone would surface a false
 * "You already scanned <stale folder>" panel and a live pill pointing at an
 * empty Step 3. The manifest row count is the honest predicate, and it is
 * exactly what the Step-3 render shows.
 *
 * Mirrors `_finalizeCheckpoint.ts`: cookie-bound Supabase server client
 * (admin-RLS gated by §4.3 / `is_admin()`), every await wrapped so a thrown
 * infra fault (auth expiry, network reset, RLS reject mid-query) surfaces as
 * the same typed `infra_error` as the returned-`.error` branch (AGENTS.md
 * invariant 9). The underscore prefix keeps Next.js routing from treating this
 * file as a page.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ScanManifestCountInfra = {
  kind: "infra_error";
  message: string;
};

export type ScanManifestCountResult = { kind: "value"; count: number } | ScanManifestCountInfra;

export async function readScanManifestCount(sessionId: string): Promise<ScanManifestCountResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `readScanManifestCount: server client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    const { count, error } = await supabase
      .from("onboarding_scan_manifest")
      .select("drive_file_id", { count: "exact", head: true })
      .eq("wizard_session_id", sessionId);
    if (error) {
      return {
        kind: "infra_error",
        message: `readScanManifestCount: query failed: ${error.message}`,
      };
    }
    return { kind: "value", count: count ?? 0 };
  } catch (err) {
    return {
      kind: "infra_error",
      message: `readScanManifestCount: query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
