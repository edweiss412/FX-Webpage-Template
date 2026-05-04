/**
 * app/admin/actions.ts (M5 §B Task 5.9 — Doug's portion)
 *
 * Server Actions for the admin section. Currently a single action:
 *   - resolveAdminAlertFormAction: marks an `admin_alerts` row resolved.
 *
 * Defense-in-depth: every action gates with `requireAdmin()` independently
 * of its caller (per AGENTS.md §1.6). The cookie-bound Supabase client used
 * inside the action also enforces the row-level admin_only policy on
 * `public.admin_alerts` (supabase/migrations/20260501002000_rls_policies.sql:150),
 * so even if the application gate were bypassed, the database would reject.
 *
 * The action revalidates `/admin/dev` so the next render observes the
 * mutated state without a hard reload (the layout's AlertBanner re-runs
 * its SELECT against the topmost unresolved row).
 *
 * No advisory lock: spec §4.6 admin_alerts is admin-side row management
 * (not crew-data mutation under the per-show lock invariant). The unique
 * partial index `admin_alerts_one_unresolved_idx` enforces single-row-per
 * (show_id, code) at the database level — concurrent resolves of the same
 * row are idempotent (the second update no-ops because the WHERE clause
 * matches zero rows).
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";

export async function resolveAdminAlertFormAction(formData: FormData): Promise<void> {
  // Defense-in-depth: gate independent of the caller (the layout's
  // requireAdmin call has already gated the page render, but the action
  // could be invoked directly with crafted POST + cookies).
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    // Bad request — no id supplied. Silently no-op rather than 400; the
    // form always supplies the hidden id input.
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const resolvedBy = canonicalize(userData.user?.email) ?? null;

  // RLS-gated UPDATE. The admin_only policy on admin_alerts requires
  // public.is_admin() to be true, which we've already verified. The
  // WHERE clause additionally requires the row to be still unresolved
  // so a double-click is a no-op (we don't overwrite a previous
  // resolved_at / resolved_by).
  await supabase
    .from("admin_alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq("id", id)
    .is("resolved_at", null);

  // Re-render the admin layout so the AlertBanner re-runs its SELECT
  // and the freshly-resolved row drops out of the topmost slot.
  revalidatePath("/admin", "layout");
}
