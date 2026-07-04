"use server";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// not-subject-to-revalidate (nav-perf tag-caching Task 9): resetting a crew member's picker
// selection mutates only crew_members.selections_reset_at — a picker/auth column NOT in the
// getShowForViewer DATA projection. The rendered crew DATA is unchanged, so the `show-${id}`
// data cache need not bust.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Forensic source tag for both the durable success outcome and the infra-fault trace.
const OUTCOME_SOURCE = "admin.picker.resetCrewMemberSelection";

type ResetCrewMemberSelectionResult =
  | { ok: true; reset_at: string }
  | {
      ok: false;
      code:
        | "PICKER_CREW_MEMBER_NOT_FOUND"
        | "PICKER_RESOLVER_LOOKUP_FAILED"
        | "PICKER_INVALID_INPUT";
    };

export async function resetCrewMemberSelection(input: {
  showId: string;
  crewMemberId: string;
}): Promise<ResetCrewMemberSelectionResult> {
  // requireAdminIdentity (not the bare requireAdmin) so the audit trail can attribute the
  // reset to the acting admin (canonical email, hashed inside logAdminOutcome).
  const adminCtx = await requireAdminIdentity();

  if (!UUID_RE.test(input.showId) || !UUID_RE.test(input.crewMemberId)) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("reset_crew_member_selection", {
      p_show_id: input.showId,
      p_crew_member_id: input.crewMemberId,
    });
    // Distinguish returned-error (infra) from a NULL not-found signal (per call-boundary discipline).
    if (error) {
      // Forensic: a DB/infra fault on the reset otherwise vanishes silently. NOT §12.4
      // (inside a log.warn span → stripped from the producer scan).
      log.warn("PICKER_SELECTION_RESET_INFRA_FAILED", {
        code: "PICKER_SELECTION_RESET_INFRA_FAILED",
        source: OUTCOME_SOURCE,
        showId: input.showId,
      });
      return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    }
    // NULL is a benign no-op (member already off the roster) — expected, not a fault; unlogged.
    if (typeof data !== "string") return { ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" };

    // Durable admin-outcome audit trail. Emitted AFTER the RPC committed (the RPC holds its own
    // per-show advisory lock and commits before returning), so this is post-commit and the
    // internal wrapper guarantees it never throws over the committed mutation (invariant 9).
    // Forensic app_events code — NOT §12.4 (logAdminOutcome spans are stripped from producers).
    await logAdminOutcome({
      code: "PICKER_SELECTION_RESET_BY_ADMIN",
      source: OUTCOME_SOURCE,
      actorEmail: adminCtx.email,
      showId: input.showId,
      // crewMemberId is an internal UUID, not PII — low-cardinality forensic detail.
      extra: { crewMemberId: input.crewMemberId },
    });

    return { ok: true, reset_at: data };
  } catch {
    log.warn("PICKER_SELECTION_RESET_INFRA_FAILED", {
      code: "PICKER_SELECTION_RESET_INFRA_FAILED",
      source: OUTCOME_SOURCE,
      showId: input.showId,
    });
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}
