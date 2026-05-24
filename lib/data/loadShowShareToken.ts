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

export async function loadShowShareToken(showId: string): Promise<string | null> {
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

  return typeof data === "string" ? data : null;
}
