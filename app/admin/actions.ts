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

// Local UUID regex — duplicated from `lib/auth/constants.ts` (UUID_RE) because
// §B (this file's milestone) cannot import from §A's lib/auth surface. A single
// internal callsite of a stable, format-only regex is acceptable duplication;
// see I2 in the M5 §B Task 5.9 code-quality review.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Reject anything that isn't a well-formed UUID before it reaches Postgres.
  // Without this guard, a malformed id leaks into server logs as a Postgres
  // error and (pre-I1 fix) was silently swallowed by the discarded UPDATE
  // result. The hidden form input always supplies a valid UUID; rejecting
  // here is purely a hardening measure against crafted POSTs.
  if (!UUID_RE.test(id)) return;

  // not-subject-to-meta: server action with no typed-result contract.
  // Throws (client construction, getUser, .update()) propagate to the
  // Next.js error boundary, which is the intended loud-failure mode for
  // this form-submission path; there is no caller checking for
  // `{ kind: "infra_error" }`. Silent swallowing would be the §1.9
  // violation — propagation IS the contract here.
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    // §1.9 returned-error path: getUser surfaced an infra fault. We MUST
    // NOT fall through to the `!adminEmail` branch (which would silently
    // no-op and the page would revalidate as if nothing happened). Throw
    // so the Next.js error boundary renders, consistent with the
    // not-subject-to-meta exemption's "propagation IS the contract" rule.
    throw new Error(
      `[resolveAdminAlertFormAction] supabase.auth.getUser failed: ${userError.message}`,
    );
  }
  const adminEmail = canonicalize(userData.user?.email);
  if (!adminEmail) {
    // Should be unreachable — requireAdmin() above would have thrown if the
    // session lacked a canonical email. Defense in depth: if Supabase ever
    // returns a session whose user.email round-trips through canonicalize()
    // to null, we refuse to write a NULL resolved_by rather than silently
    // attributing the resolve to "unknown."
    console.error(
      "[resolveAdminAlertFormAction] requireAdmin returned but canonicalized email is null",
    );
    return;
  }
  const resolvedBy = adminEmail;

  // RLS-gated UPDATE. The admin_only policy on admin_alerts requires
  // public.is_admin() to be true, which we've already verified. The
  // WHERE clause additionally requires the row to be still unresolved
  // and global-only. Per-show alerts must be resolved from the
  // show-scoped route after the operator views show context.
  const { error: updateError } = await supabase
    .from("admin_alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq("id", id)
    .is("resolved_at", null)
    .is("show_id", null);

  if (updateError) {
    // I1 fix: do NOT call revalidatePath when the UPDATE failed (network
    // blip, RLS denial, misconfiguration). Silently revalidating would show
    // the admin a "resolved" UI while the row remains unresolved on the DB.
    console.error("[resolveAdminAlertFormAction] UPDATE failed:", updateError.message);
    return;
  }

  // Re-render the admin layout so the AlertBanner re-runs its SELECT
  // and the freshly-resolved row drops out of the topmost slot.
  revalidatePath("/admin", "layout");
}
