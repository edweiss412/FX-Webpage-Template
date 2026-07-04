"use server";

import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// not-subject-to-revalidate (nav-perf tag-caching Task 9): resetting a crew member's picker
// selection mutates only crew_members.selections_reset_at — a picker/auth column NOT in the
// getShowForViewer DATA projection. The rendered crew DATA is unchanged, so the `show-${id}`
// data cache need not bust.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ResetCrewMemberSelectionResult =
  | { ok: true; reset_at: string }
  | {
      ok: false;
      code: "PICKER_CREW_MEMBER_NOT_FOUND" | "PICKER_RESOLVER_LOOKUP_FAILED" | "PICKER_INVALID_INPUT";
    };

export async function resetCrewMemberSelection(input: {
  showId: string;
  crewMemberId: string;
}): Promise<ResetCrewMemberSelectionResult> {
  await requireAdmin();

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
    if (error) return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    if (typeof data !== "string") return { ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" };
    return { ok: true, reset_at: data };
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}
