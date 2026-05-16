/**
 * lib/data/adminEmails.ts (M9 C9 / M2-D1)
 *
 * Typed query helpers for `public.admin_emails`. Every helper:
 *   - Destructures `{ data, error }` from Supabase calls (AGENTS.md
 *     invariant 9 — call-boundary discipline).
 *   - Surfaces infra faults as a typed `AdminEmailsInfraError` so
 *     callers can distinguish RLS denial from network failure from
 *     business-logic refusal.
 *   - Canonicalizes email at the boundary via `lib/email/canonicalize.ts`
 *     (AGENTS.md invariant 3) BEFORE the DB INSERT/UPDATE/SELECT.
 *
 * Read-only helpers run via the cookie-bound server client; the RLS
 * `admin_only` policy gates them. Server Actions invoke these from the
 * `/admin/settings/admins` page where the layout's `requireAdmin()` has
 * already authorized the request.
 */
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Typed infra fault — caller maps to a 500-class response or admin_alert. */
export class AdminEmailsInfraError extends Error {
  readonly code = "ADMIN_EMAILS_INFRA";

  constructor(message: string) {
    super(message);
    this.name = "AdminEmailsInfraError";
  }
}

/**
 * One row from `public.admin_emails`. Columns mirror the table DDL.
 * `revoked_at` null → row is active.
 */
export type AdminEmailRow = {
  email: string;
  added_by: string | null;
  added_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  note: string | null;
};

/** Discriminated outcome for write paths. */
export type AdminEmailWriteOutcome =
  | { kind: "ok"; row: AdminEmailRow }
  | { kind: "already_active"; email: string }
  | { kind: "re_add_required"; email: string; previously_revoked_at: string }
  | { kind: "last_admin_lockout"; email: string }
  | { kind: "invalid_email"; raw: string };

/**
 * List all admin_emails rows the caller is authorized to read.
 * RLS gates this — non-admins get an empty array.
 *
 * Both arms wrapped in try/catch: a synchronous throw from
 * createSupabaseServerClient() (missing env, broken cookie store) OR
 * from the .from() call chain (per AGENTS.md invariant 9 meta-test
 * registry) MUST surface as AdminEmailsInfraError so the caller can
 * render a 500-class admin alert instead of an empty list.
 */
export async function listAdminEmails(): Promise<AdminEmailRow[]> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    throw new AdminEmailsInfraError(
      `listAdminEmails: server client construction failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  let result: { data: unknown; error: { message: string } | null };
  try {
    result = await supabase
      .from("admin_emails")
      .select("email, added_by, added_at, revoked_by, revoked_at, note")
      .order("revoked_at", { ascending: true, nullsFirst: true })
      .order("added_at", { ascending: false });
  } catch (err) {
    throw new AdminEmailsInfraError(
      `listAdminEmails: from threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (result.error) {
    throw new AdminEmailsInfraError(`listAdminEmails: ${result.error.message}`);
  }
  // The RLS-gated SELECT can legitimately return zero rows for non-admins.
  // Empty array is the steady-state "no rows" signal, NOT an infra fault.
  return (result.data ?? []) as AdminEmailRow[];
}

/**
 * Add a new active admin row, or re-add a revoked one.
 * - If the email is already active: returns `{ kind: 'already_active' }`.
 * - If the email exists but is revoked: returns
 *   `{ kind: 're_add_required', previously_revoked_at }` UNLESS
 *   `confirmReAdd` is true, in which case the revoked row is reactivated.
 * - If the email is new: inserts a fresh active row.
 *
 * Canonicalizes `rawEmail` before any DB call. Empty / whitespace
 * input returns `{ kind: 'invalid_email' }` without touching the DB.
 */
export async function addAdminEmail(opts: {
  rawEmail: string;
  addedBy: string | null;
  note?: string | null;
  confirmReAdd?: boolean;
}): Promise<AdminEmailWriteOutcome> {
  const email = canonicalize(opts.rawEmail);
  if (email === null) return { kind: "invalid_email", raw: opts.rawEmail };

  return wrapInfra("addAdminEmail", () => addAdminEmailInner(opts, email));
}

async function addAdminEmailInner(
  opts: {
    rawEmail: string;
    addedBy: string | null;
    note?: string | null;
    confirmReAdd?: boolean;
  },
  email: string,
): Promise<AdminEmailWriteOutcome> {
  const supabase = await createSupabaseServerClient();

  // Check existing row first — this gates the re-add prompt (UI needs
  // the previously_revoked_at to render the "<email> was revoked X
  // days ago" copy). Single SELECT keeps the round-trip count minimal.
  const { data: existing, error: existingError } = await supabase
    .from("admin_emails")
    .select("email, added_by, added_at, revoked_by, revoked_at, note")
    .eq("email", email)
    .maybeSingle();
  if (existingError) {
    throw new AdminEmailsInfraError(`addAdminEmail.lookup: ${existingError.message}`);
  }

  if (existing) {
    const row = existing as AdminEmailRow;
    if (row.revoked_at === null) {
      return { kind: "already_active", email };
    }
    // Revoked row exists. Without explicit confirmation, surface the
    // re-add prompt; the UI displays "previously revoked X days ago"
    // and re-submits with confirmReAdd=true.
    if (!opts.confirmReAdd) {
      return {
        kind: "re_add_required",
        email,
        previously_revoked_at: row.revoked_at,
      };
    }
    // Re-add: clear revoked_*, refresh added_*, replace note. Single
    // UPDATE with a guard on revoked_at IS NOT NULL so a concurrent
    // reactivation can't double-flip.
    const { data: updated, error: updateError } = await supabase
      .from("admin_emails")
      .update({
        revoked_at: null,
        revoked_by: null,
        added_at: new Date().toISOString(),
        added_by: opts.addedBy,
        note: opts.note ?? null,
      })
      .eq("email", email)
      .not("revoked_at", "is", null)
      .select("email, added_by, added_at, revoked_by, revoked_at, note")
      .single();
    if (updateError) {
      throw new AdminEmailsInfraError(`addAdminEmail.reactivate: ${updateError.message}`);
    }
    return { kind: "ok", row: updated as AdminEmailRow };
  }

  // Fresh INSERT.
  const { data: inserted, error: insertError } = await supabase
    .from("admin_emails")
    .insert({
      email,
      added_by: opts.addedBy,
      added_at: new Date().toISOString(),
      note: opts.note ?? null,
    })
    .select("email, added_by, added_at, revoked_by, revoked_at, note")
    .single();
  if (insertError) {
    throw new AdminEmailsInfraError(`addAdminEmail.insert: ${insertError.message}`);
  }
  return { kind: "ok", row: inserted as AdminEmailRow };
}

/**
 * Revoke an active admin row. Sets `revoked_at = now()` + `revoked_by`.
 *
 * Last-admin-lockout: if the actor is revoking THEMSELVES AND no other
 * active rows exist, returns `{ kind: 'last_admin_lockout' }`. Caller
 * (Server Action) maps to `LAST_ADMIN_LOCKOUT_REFUSED` catalog code.
 *
 * Other-revoke (rogue admin revoking peers, including the last seed
 * admin while leaving themselves active) is by-design allowed; see
 * amendment §5.5 + §11 anti-goal.
 */
export async function revokeAdminEmail(opts: {
  rawEmail: string;
  revokedBy: string;
  actorCanonicalEmail: string;
}): Promise<AdminEmailWriteOutcome> {
  const email = canonicalize(opts.rawEmail);
  if (email === null) return { kind: "invalid_email", raw: opts.rawEmail };

  return wrapInfra("revokeAdminEmail", () => revokeAdminEmailInner(opts, email));
}

async function revokeAdminEmailInner(
  opts: { rawEmail: string; revokedBy: string; actorCanonicalEmail: string },
  email: string,
): Promise<AdminEmailWriteOutcome> {
  const supabase = await createSupabaseServerClient();

  // Last-admin-lockout check: if the actor is revoking themselves AND
  // no other active rows exist, refuse before mutating.
  if (email === opts.actorCanonicalEmail) {
    const { count: otherActiveCount, error: countError } = await supabase
      .from("admin_emails")
      .select("email", { count: "exact", head: true })
      .is("revoked_at", null)
      .neq("email", email);
    if (countError) {
      throw new AdminEmailsInfraError(`revokeAdminEmail.lockout_check: ${countError.message}`);
    }
    if ((otherActiveCount ?? 0) === 0) {
      return { kind: "last_admin_lockout", email };
    }
  }

  // Guarded UPDATE — only flip rows still active. Idempotent on
  // re-submit (zero rows updated → still success outcome below if the
  // row is now revoked; we re-SELECT to confirm).
  const { data: updated, error: updateError } = await supabase
    .from("admin_emails")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: opts.revokedBy,
    })
    .eq("email", email)
    .is("revoked_at", null)
    .select("email, added_by, added_at, revoked_by, revoked_at, note")
    .maybeSingle();
  if (updateError) {
    throw new AdminEmailsInfraError(`revokeAdminEmail.update: ${updateError.message}`);
  }
  if (!updated) {
    // No active row matched — either already revoked or never existed.
    // Either way, the post-condition (email is not an active admin) is
    // satisfied. Re-SELECT to return the current row state.
    const { data: current, error: currentError } = await supabase
      .from("admin_emails")
      .select("email, added_by, added_at, revoked_by, revoked_at, note")
      .eq("email", email)
      .maybeSingle();
    if (currentError) {
      throw new AdminEmailsInfraError(`revokeAdminEmail.confirm: ${currentError.message}`);
    }
    if (!current) {
      // Email never existed — treat as already-not-an-admin.
      return { kind: "already_active", email }; // mis-named; caller
      // doesn't distinguish the never-existed case; brief §6.4 only
      // surfaces RE_ADD prompt on revoked rows.
    }
    return { kind: "ok", row: current as AdminEmailRow };
  }
  return { kind: "ok", row: updated as AdminEmailRow };
}

/**
 * Wrap a write operation so synchronous throws (createSupabaseServerClient
 * failure, .from() throw) AND async-chain throws ALL surface as
 * AdminEmailsInfraError per AGENTS.md invariant 9. AdminEmailsInfraError
 * thrown intentionally by the inner function passes through unchanged.
 */
async function wrapInfra<T>(label: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof AdminEmailsInfraError) throw err;
    throw new AdminEmailsInfraError(
      `${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
