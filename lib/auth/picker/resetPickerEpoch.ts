"use server";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { hashForLog } from "@/lib/email/hashForLog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ResetPickerEpochResult =
  | { ok: true; new_epoch: number }
  | { ok: false; code: "PICKER_RESOLVER_LOOKUP_FAILED" };

export async function resetPickerEpoch(input: { showId: string }): Promise<ResetPickerEpochResult> {
  const adminCtx = await requireAdminIdentity();
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc("reset_picker_epoch_atomic", { p_show_id: input.showId });
    if (error || typeof data !== "number") {
      return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    }

    try {
      await upsertAdminAlert({
        showId: input.showId,
        code: "PICKER_EPOCH_RESET" as never,
        context: {
          show_id: input.showId,
          new_epoch: data,
          admin_email_hash: hashForLog(adminCtx.email),
        },
      });
    } catch {
      // Alert emission is observational; the reset already succeeded.
    }

    return { ok: true, new_epoch: data };
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}
