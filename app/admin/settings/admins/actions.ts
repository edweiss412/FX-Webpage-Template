/**
 * app/admin/settings/admins/actions.ts (M9 C9 / M2-D1)
 *
 * Server Actions for the runtime-mutable admin allow-list per amendment
 * `docs/superpowers/specs/amendments/2026-05-14-admin-allowlist-runtime-mutable.md`.
 *
 *   - addAdminAction:   add a new admin OR re-add a revoked one (with
 *                       optional confirm_re_add second-tap).
 *   - revokeAdminAction: revoke an active admin row. Self-revoke of the
 *                        only active admin is refused inside the RPC
 *                        (LAST_ADMIN_LOCKOUT_REFUSED catalog code).
 *
 * Defense-in-depth: every action calls requireAdminIdentity() so the
 * caller is always re-authorized at the Server Action boundary. If the
 * helper throws AdminInfraError (Supabase / cookie store fault), Next
 * propagates the throw to the catalog 500 surface — actions DO NOT
 * swallow infra faults into benign action results (AGENTS.md §1.9).
 *
 * R3 fix: actor identity is owned by the two SECURITY DEFINER RPCs
 * (upsert_admin_email_rpc + revoke_admin_email_rpc) — they derive
 * added_by / revoked_by from auth.uid() and the self-revoke predicate's
 * actor email from public.auth_email_canonical() at the database
 * boundary. The Server Action no longer performs a redundant
 * supabase.auth.getUser() lookup to populate caller-supplied actor
 * fields (R3 finding: that lookup violated invariant 9 by turning
 * getUser() errors into either a successful mutation with uid=null
 * for add, or a misleading "invalid_email" result for revoke).
 *
 * Email canonicalization happens INSIDE lib/data/adminEmails.ts at the
 * single canonicalize() boundary (AGENTS.md §1.3 invariant); these
 * actions hand the raw form input through and let the data layer
 * normalize it.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { addAdminEmail, revokeAdminEmail } from "@/lib/data/adminEmails";
import { canonicalize } from "@/lib/email/canonicalize";

/**
 * Discriminated outcome the page reads back through the React 19
 * useActionState/useFormState binding. The UI maps each kind to either
 * a catalog-driven message or a state mutation.
 */
export type AdminEmailActionResult =
  | { kind: "ok"; email?: string }
  | { kind: "invalid_email" }
  | { kind: "already_active"; email: string }
  | { kind: "re_add_required"; email: string; previously_revoked_at: string }
  | { kind: "last_admin_lockout"; email: string };

export async function addAdminAction(
  _prev: AdminEmailActionResult | null,
  formData: FormData,
): Promise<AdminEmailActionResult> {
  // Defense-in-depth admin gate at the Server Action boundary. If the
  // session is missing or Supabase throws an infra fault, the
  // AdminInfraError propagates to Next's error boundary (cataloged 500
  // path) — invariant 9: infra faults are never swallowed into a
  // benign action result.
  await requireAdminIdentity();

  const rawEmail = formData.get("email");
  const note = formData.get("note");
  const confirmReAdd = formData.get("confirm_re_add") === "true";
  const confirmEmail = formData.get("confirm_email");

  if (typeof rawEmail !== "string") return { kind: "invalid_email" };

  // M9 final-review R14 fix: when re-add is confirmed, REJECT a
  // mismatch between the prompted email (confirm_email) and the
  // submitted email (email). The UI binds both via hidden inputs to
  // result.email; a forged submit that flips email but leaves
  // confirm_email + confirm_re_add intact gets rejected here.
  // Canonicalize both sides before comparison so case/space drift
  // doesn't break the gate.
  if (confirmReAdd && typeof confirmEmail === "string") {
    const submittedCanonical = canonicalize(rawEmail);
    const confirmedCanonical = canonicalize(confirmEmail);
    if (submittedCanonical === null || confirmedCanonical === null) {
      return { kind: "invalid_email" };
    }
    if (submittedCanonical !== confirmedCanonical) {
      return { kind: "invalid_email" };
    }
  }

  const outcome = await addAdminEmail({
    rawEmail,
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
      return outcome.row?.email
        ? { kind: "ok", email: outcome.row.email }
        : { kind: "ok" };
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
  // Defense-in-depth admin gate. AdminInfraError propagates per
  // invariant 9 (see addAdminAction docstring).
  await requireAdminIdentity();

  const rawEmail = formData.get("email");
  if (typeof rawEmail !== "string") return { kind: "invalid_email" };

  const outcome = await revokeAdminEmail({ rawEmail });

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
