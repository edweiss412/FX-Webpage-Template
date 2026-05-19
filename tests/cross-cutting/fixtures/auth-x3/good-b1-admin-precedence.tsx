import { isAdminSession } from "@/lib/auth/isAdminSession";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export default async function Page(req: Request) {
  const admin = await isAdminSession(req);
  if (admin.ok) {
    await requireAdmin();
    const adminResult = { kind: "success" as const };
    if (adminResult.kind === "success") {
      return createSupabaseServiceRoleClient().from("shows_internal").select("*");
    }
  }
  return null;
}
