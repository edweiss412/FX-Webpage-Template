/**
 * lib/data/adminEmails.ts (M9 C9 / M2-D1)
 *
 * Typed query helpers for `public.admin_emails`. Every helper:
 *   - Destructures `{ data, error }` from Supabase calls (AGENTS.md
 *     invariant 9 — call-boundary discipline).
 *   - Surfaces infra faults as a typed `AdminEmailsInfraError`.
 *   - Canonicalizes email at the boundary via `lib/email/canonicalize.ts`
 *     (AGENTS.md invariant 3). The DB-side RPCs ALSO canonicalize
 *     defense-in-depth so a slip-through still hits a canonical key.
 *
 * R1 fix (HIGH + MEDIUM): write paths now delegate to two Postgres
 * RPCs that own the atomic logic under a shared advisory lock —
 * `public.upsert_admin_email_rpc` and `public.revoke_admin_email_rpc`.
 * Previously, addAdminEmail / revokeAdminEmail were read-then-write
 * chains race-prone to concurrent operator clicks, and the upsert
 * branch surfaced unique-violation conflicts as infra errors instead
 * of the documented `already_active` branch. The RPCs return a
 * discriminated jsonb result this module translates to
 * AdminEmailWriteOutcome.
 *
 * Read-only listAdminEmails stays as a direct .select() — RLS gates
 * it and zero rows is a legitimate non-admin steady-state.
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
  | { kind: "ok"; row: AdminEmailRow | null }
  | { kind: "already_active"; email: string }
  | { kind: "re_add_required"; email: string; previously_revoked_at: string }
  | { kind: "last_admin_lockout"; email: string }
  | { kind: "invalid_email"; raw: string };

/**
 * List all admin_emails rows the caller is authorized to read.
 * RLS gates this — non-admins get an empty array.
 */
export async function listAdminEmails(): Promise<AdminEmailRow[]> {
  return wrapInfra("listAdminEmails", async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("admin_emails")
      .select("email, added_by, added_at, revoked_by, revoked_at, note")
      .order("revoked_at", { ascending: true, nullsFirst: true })
      .order("added_at", { ascending: false });
    if (error) {
      throw new AdminEmailsInfraError(`listAdminEmails: ${error.message}`);
    }
    return (data ?? []) as AdminEmailRow[];
  });
}

/**
 * Add a new active admin row, or re-add a revoked one. Delegates to
 * `public.upsert_admin_email_rpc` so the lookup + insert/update happen
 * atomically under an advisory lock — concurrent retries of the same
 * email cannot collide on the unique constraint.
 */
export async function addAdminEmail(opts: {
  rawEmail: string;
  /**
   * R2 fix: caller-supplied actor identity is no longer trusted — the
   * RPC derives added_by from auth.uid() inside its SECURITY DEFINER
   * body. The field is accepted for caller-side audit/log purposes
   * only and is NOT forwarded to the RPC.
   */
  addedBy?: string | null;
  note?: string | null;
  confirmReAdd?: boolean;
}): Promise<AdminEmailWriteOutcome> {
  const email = canonicalize(opts.rawEmail);
  if (email === null) return { kind: "invalid_email", raw: opts.rawEmail };

  return wrapInfra("addAdminEmail", async () => {
    const supabase = await createSupabaseServerClient();
    // R2 fix: added_by is derived from auth.uid() inside the RPC's
    // SECURITY DEFINER body — caller-supplied p_added_by removed so a
    // forged request can't spoof the actor identity.
    const { data, error } = await supabase.rpc("upsert_admin_email_rpc", {
      p_email: email,
      p_note: opts.note ?? null,
      p_confirm_re_add: opts.confirmReAdd ?? false,
    });
    if (error) {
      throw new AdminEmailsInfraError(`addAdminEmail.rpc: ${error.message}`);
    }
    return translateUpsertResult(data, email, opts.rawEmail);
  });
}

/**
 * Revoke an active admin row. Delegates to
 * `public.revoke_admin_email_rpc` so the count-then-update happens
 * atomically — two concurrent self-revokes cannot both proceed.
 */
export async function revokeAdminEmail(opts: {
  rawEmail: string;
  /**
   * R2 fix: caller-supplied actor identity is no longer trusted — the
   * RPC derives both revoked_by (auth.uid()) AND the self-revoke
   * predicate's actor email (auth_email_canonical()) inside its
   * SECURITY DEFINER body. These optional fields are accepted for
   * caller-side audit/log purposes only and are NOT forwarded.
   */
  revokedBy?: string;
  actorCanonicalEmail?: string;
}): Promise<AdminEmailWriteOutcome> {
  const email = canonicalize(opts.rawEmail);
  if (email === null) return { kind: "invalid_email", raw: opts.rawEmail };

  return wrapInfra("revokeAdminEmail", async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("revoke_admin_email_rpc", {
      p_email: email,
    });
    if (error) {
      throw new AdminEmailsInfraError(`revokeAdminEmail.rpc: ${error.message}`);
    }
    return translateRevokeResult(data, email, opts.rawEmail);
  });
}

// ---- private translation helpers ----------------------------------------

type RpcEnvelope = {
  status: "ok" | "already_active" | "re_add_required" | "last_admin_lockout" | "invalid_email";
  email?: string;
  previously_revoked_at?: string;
  row?: AdminEmailRow | null;
};

function translateUpsertResult(
  data: unknown,
  canonicalEmail: string,
  rawEmail: string,
): AdminEmailWriteOutcome {
  const env = data as RpcEnvelope | null;
  if (!env || typeof env.status !== "string") {
    throw new AdminEmailsInfraError(
      `addAdminEmail: malformed RPC envelope: ${JSON.stringify(data)}`,
    );
  }
  switch (env.status) {
    case "ok":
      return { kind: "ok", row: env.row ?? null };
    case "already_active":
      return { kind: "already_active", email: env.email ?? canonicalEmail };
    case "re_add_required":
      return {
        kind: "re_add_required",
        email: env.email ?? canonicalEmail,
        previously_revoked_at: env.previously_revoked_at ?? "",
      };
    case "invalid_email":
      return { kind: "invalid_email", raw: rawEmail };
    case "last_admin_lockout":
      // Not produced by upsert RPC; defensive switch arm.
      return { kind: "last_admin_lockout", email: env.email ?? canonicalEmail };
  }
}

function translateRevokeResult(
  data: unknown,
  canonicalEmail: string,
  rawEmail: string,
): AdminEmailWriteOutcome {
  const env = data as RpcEnvelope | null;
  if (!env || typeof env.status !== "string") {
    throw new AdminEmailsInfraError(
      `revokeAdminEmail: malformed RPC envelope: ${JSON.stringify(data)}`,
    );
  }
  switch (env.status) {
    case "ok":
      return { kind: "ok", row: env.row ?? null };
    case "last_admin_lockout":
      return { kind: "last_admin_lockout", email: env.email ?? canonicalEmail };
    case "invalid_email":
      return { kind: "invalid_email", raw: rawEmail };
    case "already_active":
    case "re_add_required":
      // Not produced by revoke RPC; defensive switch arms.
      return { kind: "ok", row: null };
  }
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
