/**
 * app/admin/settings/admins/actions.ts (M9 C9 / M2-D1)
 *
 * Server Actions for the runtime-mutable admin allow-list per amendment
 * `docs/superpowers/specs/amendments/2026-05-14-admin-allowlist-runtime-mutable.md`.
 *
 *   - addAdminAction:   add a new admin OR re-add a revoked one (with
 *                       optional confirm_re_add second-tap).
 *   - revokeAdminAction: revoke an active admin row. Self-revoke of the
 *                        only active admin is refused at this layer
 *                        (LAST_ADMIN_LOCKOUT_REFUSED catalog code).
 *
 * Defense-in-depth: every action calls requireAdminIdentity() so the
 * caller is always re-authorized, even though the page-level layout
 * has already gated the request. RLS on admin_emails enforces the
 * same gate at the database (admin_only policy from the C9 migration).
 *
 * Email canonicalization happens INSIDE lib/data/adminEmails.ts at the
 * single canonicalize() boundary (AGENTS.md §1.3 invariant); these
 * actions hand the raw form input through and let the data layer
 * normalize it.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireAdminIdentity, type AdminIdentity } from "@/lib/auth/requireAdmin";
import { addAdminEmail, revokeAdminEmail } from "@/lib/data/adminEmails";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Discriminated outcome the page reads back through the React 19
 * useActionState/useFormState binding. The UI maps each kind to either
 * a catalog-driven message or a state mutation.
 */
export type AdminEmailActionResult =
  | { kind: "ok" }
  | { kind: "invalid_email" }
  | { kind: "already_active"; email: string }
  | { kind: "re_add_required"; email: string; previously_revoked_at: string }
  | { kind: "last_admin_lockout"; email: string };

/**
 * Resolve the actor's auth.users row id (UUID) so we can stamp it on
 * added_by / revoked_by. requireAdminIdentity() returns the email
 * only; we look up the uid via supabase.auth.getUser() against the
 * cookie-bound client (the same gate requireAdmin already passed).
 */
async function getActorUid(): Promise<{ uid: string | null; identity: AdminIdentity }> {
  const identity = await requireAdminIdentity();
  const supabase = await createSupabaseServerClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error) {
    // Should be unreachable — requireAdminIdentity() succeeded so the
    // session is valid. Defense in depth: if Supabase returns an error
    // here we still proceed with uid=null (the columns are nullable).
    console.error("[admins/actions] getActorUid: getUser failed:", error.message);
    return { uid: null, identity };
  }
  return { uid: userData.user?.id ?? null, identity };
}

export async function addAdminAction(
  _prev: AdminEmailActionResult | null,
  formData: FormData,
): Promise<AdminEmailActionResult> {
  const { uid } = await getActorUid();

  const rawEmail = formData.get("email");
  const note = formData.get("note");
  const confirmReAdd = formData.get("confirm_re_add") === "true";

  if (typeof rawEmail !== "string") return { kind: "invalid_email" };

  const outcome = await addAdminEmail({
    rawEmail,
    addedBy: uid,
    // M9 C9 — store note as-submitted (no inline normalization here so
    // the no-inline-email-normalization meta-test stays clean). Empty
    // string → NULL so the UI's "render only if truthy" branch hides
    // empty notes. Whitespace-only notes are stored as-is and
    // gracefully hidden by the page-level visibility predicate.
    note: typeof note === "string" && note.length > 0 ? note : null,
    confirmReAdd,
  });

  switch (outcome.kind) {
    case "ok":
      revalidatePath("/admin/settings/admins");
      return { kind: "ok" };
    case "invalid_email":
      return { kind: "invalid_email" };
    case "already_active":
      return { kind: "already_active", email: outcome.email };
    case "re_add_required":
      return {
        kind: "re_add_required",
        email: outcome.email,
        previously_revoked_at: outcome.previously_revoked_at,
      };
    case "last_admin_lockout":
      // Not reachable from addAdminEmail — keeps the switch exhaustive
      // for the discriminated outcome type.
      return { kind: "last_admin_lockout", email: outcome.email };
  }
}

export async function revokeAdminAction(
  _prev: AdminEmailActionResult | null,
  formData: FormData,
): Promise<AdminEmailActionResult> {
  const { uid, identity } = await getActorUid();

  const rawEmail = formData.get("email");
  if (typeof rawEmail !== "string") return { kind: "invalid_email" };
  if (uid === null) {
    // Defense in depth — revoke without an actor uid would write a
    // NULL revoked_by which violates revoke_atomicity CHECK. Refuse.
    console.error("[admins/actions] revoke: actor uid missing despite requireAdmin pass");
    return { kind: "invalid_email" };
  }

  const actorCanonicalEmail = canonicalize(identity.email) ?? "";

  const outcome = await revokeAdminEmail({
    rawEmail,
    revokedBy: uid,
    actorCanonicalEmail,
  });

  switch (outcome.kind) {
    case "ok":
      revalidatePath("/admin/settings/admins");
      return { kind: "ok" };
    case "invalid_email":
      return { kind: "invalid_email" };
    case "last_admin_lockout":
      return { kind: "last_admin_lockout", email: outcome.email };
    case "already_active":
      // Defensive — revokeAdminEmail returns this kind only when the
      // email never existed (mis-named in the data layer for type
      // economy). Surface as a successful no-op so the UI doesn't
      // light a red error region for a benign case.
      revalidatePath("/admin/settings/admins");
      return { kind: "ok" };
    case "re_add_required":
      // Not reachable from revokeAdminEmail.
      return { kind: "ok" };
  }
}
