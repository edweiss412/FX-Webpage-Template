/**
 * lib/auth/isAdminSession.ts (M4 minimal stub — M5 owns full impl)
 *
 * STABLE SIGNATURE — DO NOT CHANGE in M5:
 *   isAdminSession(req: NextRequest): Promise<{ ok: boolean; email?: string }>
 *
 * Purpose: predicate used by lib/auth/resolveShowViewer.ts to detect admin
 * callers without coupling resolveShowViewer to the cookie/JWT internals.
 *
 * M3 already ships requireAdmin.ts (lib/auth/requireAdmin.ts) which gates
 * /admin/dev via Postgres' is_admin() helper (auth.jwt() app_metadata.role +
 * canonicalized email allowlist at supabase/migrations/20260501002000_rls_policies.sql:23-39).
 * M5 replaces THIS file's body with the same contract — read the cookie-bound
 * Supabase session, call public.is_admin(), and return { ok: true, email }
 * (canonicalized) on success.
 *
 * Stub returns { ok: false } unconditionally so the admin path falls through
 * to the link/google validators in resolveShowViewer. The admin path is
 * exercised by the existing requireAdmin tests in tests/admin/, NOT through
 * this helper, so the stub is safe in M4.
 *
 * AGENTS.md §1.3 boundary: when M5 wires the real impl, the email returned
 * here MUST be canonicalized via lib/email/canonicalize.ts before it leaves
 * the helper. resolveShowViewer's caller treats the returned email as canonical.
 */
import type { NextRequest } from "next/server";

export async function isAdminSession(
  req: NextRequest,
): Promise<{ ok: boolean; email?: string }> {
  void req;
  return { ok: false };
}
