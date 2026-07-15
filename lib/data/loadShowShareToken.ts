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

  // The RPC RETURNS TABLE(share_token text, picker_epoch int); PostgREST yields an
  // array of rows. Read token + epoch from the single snapshot row so the client
  // can order token versions monotonically (spec §3.0).
  //
  // STRICT shape validation (Codex whole-diff R1 [high]): the RPC selects
  // `shows LEFT JOIN show_share_tokens WHERE s.id = p_show_id LIMIT 1`, so for an
  // existing show it ALWAYS yields exactly one row carrying a finite numeric
  // picker_epoch (share_token may be null for a tokenless show / non-admin). Any
  // OTHER shape — empty result, a bare scalar (the retired `returns text`
  // signature under version skew / a stale PostgREST schema cache), a missing or
  // non-numeric picker_epoch, or a share_token that is neither string nor null —
  // is schema drift and MUST surface LOUDLY. We throw so the caller's
  // ADMIN_SHOW_TOKEN_READ_FAILED breadcrumb fires and the page degrades to its
  // recoverable "unavailable — refresh / rotate" state, instead of silently
  // treating a malformed response as a tokenless show (invariant 9).
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== "object" || row === null) {
    throw new Error(
      `admin_read_share_token returned an unexpected shape (schema drift?): ${JSON.stringify(data)?.slice(0, 200)}`,
    );
  }
  const { share_token, picker_epoch } = row as { share_token?: unknown; picker_epoch?: unknown };
  if (typeof picker_epoch !== "number" || !Number.isFinite(picker_epoch)) {
    throw new Error(
      `admin_read_share_token returned an unexpected shape (schema drift?): non-numeric picker_epoch`,
    );
  }
  if (share_token !== null && typeof share_token !== "string") {
    throw new Error(
      `admin_read_share_token returned an unexpected shape (schema drift?): share_token is neither string nor null`,
    );
  }
  return { token: share_token, epoch: picker_epoch };
}
