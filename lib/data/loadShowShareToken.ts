import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

export async function loadShowShareToken(
  showId: string,
): Promise<{ token: string | null; epoch: number }> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  let result: { data: unknown; error: unknown };
  try {
    result = (await supabase.rpc("admin_read_share_token", {
      p_show_id: showId,
    })) as { data: unknown; error: unknown };
  } catch (error) {
    throw new Error(`admin_read_share_token threw: ${errorMessage(error)}`);
  }

  const { data, error } = result;
  if (error) {
    throw new Error(`admin_read_share_token returned error: ${errorMessage(error)}`);
  }

  // The RPC now RETURNS TABLE(share_token, picker_epoch); PostgREST yields an
  // array of rows. Read token + epoch from the single snapshot row so the client
  // can order token versions monotonically (spec §3.0).
  const row = (Array.isArray(data) ? data[0] : data) as
    | { share_token?: unknown; picker_epoch?: unknown }
    | undefined
    | null;
  const token = typeof row?.share_token === "string" ? row.share_token : null;
  const epoch =
    typeof row?.picker_epoch === "number" && Number.isFinite(row.picker_epoch)
      ? row.picker_epoch
      : 1;
  return { token, epoch };
}
