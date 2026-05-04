/**
 * lib/auth/validateLinkSession.ts (M4 minimal stub — M5 owns full impl)
 *
 * STABLE SIGNATURE — DO NOT CHANGE in M5:
 *   validateLinkSession(req: NextRequest): Promise<
 *     | { kind: 'success'; show_id: string; crew_member_id: string }
 *     | { kind: 'failure'; reason: string }
 *   >
 *
 * Purpose: predicate used by lib/auth/resolveShowViewer.ts to detect a
 * crew-link session (the magic-link-redeemed JWT cookie flow) without
 * coupling resolveShowViewer to the cookie/JWT internals.
 *
 * M3/M5 own the redeemed-link cookie flow (`__Host-fxav_session` cookie +
 * link_sessions table at supabase/migrations/20260501001000_internal_and_admin.sql:117).
 * M5 replaces THIS file's body with the full impl — read the cookie, verify
 * the session JWT, look up the row in link_sessions, and check it is not
 * expired or revoked (revoked_links table).
 *
 * Stub returns { kind: 'failure', reason: 'no_link_session' } unconditionally.
 * No M4 caller depends on a successful crew_link arm; the success path lights
 * up in M5 with the real implementation.
 */
import type { NextRequest } from "next/server";

export async function validateLinkSession(
  req: NextRequest,
): Promise<
  | { kind: "success"; show_id: string; crew_member_id: string }
  | { kind: "failure"; reason: string }
> {
  void req;
  return { kind: "failure", reason: "no_link_session" };
}
