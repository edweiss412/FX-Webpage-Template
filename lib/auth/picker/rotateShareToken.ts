"use server";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

// not-subject-to-revalidate (nav-perf tag-caching Task 9): rotating the share token mutates only
// shows.share_token / picker_epoch — picker/auth columns NOT in the getShowForViewer DATA
// projection. The rendered crew DATA is unchanged, so the `show-${id}` data cache need not bust.

type RotateShareTokenResult =
  | { ok: true; new_share_token: string; new_epoch: number }
  | { ok: false; code: "PICKER_RESOLVER_LOOKUP_FAILED" };

type RotateShareTokenRow = {
  new_share_token: string;
  new_epoch: number;
};

function isRotateShareTokenRow(value: unknown): value is RotateShareTokenRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.new_share_token === "string" && typeof row.new_epoch === "number";
}

export async function rotateShareToken(input: {
  showId: string;
  previousShareToken?: string;
}): Promise<RotateShareTokenResult> {
  const { email } = await requireAdminIdentity();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("rotate_show_share_token", { p_show_id: input.showId })
      .single();
    if (error || !isRotateShareTokenRow(data)) {
      return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    }

    // Invariant #10: durable success trace, post-commit (the RPC's advisory lock
    // is held IN-RPC and has already released). The new share_token is a SECRET and
    // MUST NEVER be logged — only the non-sensitive epoch is emitted.
    await logAdminOutcome({
      code: "SHARE_TOKEN_ROTATED_BY_ADMIN",
      source: "admin.picker.rotateShareToken",
      actorEmail: email,
      showId: input.showId,
      result: "epoch_" + data.new_epoch,
    });

    return {
      ok: true,
      new_share_token: data.new_share_token,
      new_epoch: data.new_epoch,
    };
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}
