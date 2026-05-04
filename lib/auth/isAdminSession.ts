import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminSessionResult =
  | { ok: true; email: string }
  | { ok: false };

export async function isAdminSession(req: Request): Promise<AdminSessionResult> {
  // Kept for the shared auth-chain signature; Supabase reads request cookies
  // via createSupabaseServerClient().
  void req;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    const email = canonicalize(userResult.user?.email);
    if (userError || !email) {
      return { ok: false };
    }

    const { data, error } = await supabase.rpc("is_admin");
    if (error || data !== true) {
      return { ok: false };
    }

    return { ok: true, email };
  } catch {
    return { ok: false };
  }
}
