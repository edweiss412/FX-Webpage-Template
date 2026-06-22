"use server";

import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  await requireAdmin();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("rotate_show_share_token", { p_show_id: input.showId })
      .single();
    if (error || !isRotateShareTokenRow(data)) {
      return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    }

    return {
      ok: true,
      new_share_token: data.new_share_token,
      new_epoch: data.new_epoch,
    };
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}
