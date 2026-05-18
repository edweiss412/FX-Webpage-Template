/**
 * app/admin/_finalizeCheckpoint.ts (M10 §B Task 10.1 §B / Phase 2)
 *
 * Private helper consumed by app/admin/page.tsx's renderWizardOrFinalizeReentry
 * dispatcher. Reads the wizard_finalize_checkpoints row for a pending wizard
 * session via the cookie-bound Supabase server client (admin-RLS gated by
 * §4.3 / `is_admin()`).
 *
 * Returns null when no checkpoint row exists for the session — the dispatcher
 * treats that as "wizard pre-finalize" and falls through to <OnboardingWizard />.
 *
 * Underscore prefix keeps Next.js routing from treating this file as a page;
 * `_finalizeCheckpoint.ts` is admin-private utility code that lives next to
 * `app/admin/page.tsx` so the dispatcher is easy to find without crossing the
 * §B disjoint-paths line into `lib/`.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FinalizeCheckpointStatus = "in_progress" | "all_batches_complete" | "final_cas_done";

export type FinalizeCheckpointRow = {
  status: FinalizeCheckpointStatus;
  batches_completed: number;
  last_processed_drive_file_id: string | null;
  last_processed_at: string | null;
};

export type FinalizeCheckpointReadInfra = {
  kind: "infra_error";
  message: string;
};

export type FinalizeCheckpointReadResult = FinalizeCheckpointRow | null | FinalizeCheckpointReadInfra;

export function isInfraError(
  result: FinalizeCheckpointReadResult,
): result is FinalizeCheckpointReadInfra {
  return result !== null && typeof result === "object" && "kind" in result && result.kind === "infra_error";
}

export async function readFinalizeCheckpoint(
  sessionId: string,
): Promise<FinalizeCheckpointReadResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `readFinalizeCheckpoint: server client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const { data, error } = await supabase
    .from("wizard_finalize_checkpoints")
    .select("status, batches_completed, last_processed_drive_file_id, last_processed_at")
    .eq("wizard_session_id", sessionId)
    .maybeSingle();
  if (error) {
    return {
      kind: "infra_error",
      message: `readFinalizeCheckpoint: query failed: ${error.message}`,
    };
  }
  if (!data) return null;
  return {
    status: data.status as FinalizeCheckpointStatus,
    batches_completed: data.batches_completed as number,
    last_processed_drive_file_id: data.last_processed_drive_file_id as string | null,
    last_processed_at: data.last_processed_at as string | null,
  };
}

const STALENESS_HORIZON_MS = 24 * 3600 * 1000;

/**
 * Render-time staleness check for all_batches_complete checkpoints. Per plan
 * §M10 Task 10.1 finding 3: this is INFORMATIONAL ONLY — it determines which
 * surface renders (<ReadyToPublish /> vs <StaleReadyToPublish />) but does
 * NOT authorize destructive action. The CleanupAbandonedFinalize helper's
 * DB-clock CAS is the authoritative gate (Task 10.1 finding 1 helper guards
 * 3 + 4). App-vs-DB clock skew at the 24h boundary can flicker the rendered
 * surface but cannot let a fresh checkpoint be cleaned up.
 */
export function isCheckpointStale(lastProcessedAt: string | null): boolean {
  if (!lastProcessedAt) return false;
  const parsed = Date.parse(lastProcessedAt);
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed > STALENESS_HORIZON_MS;
}
