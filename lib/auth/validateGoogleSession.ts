/**
 * lib/auth/validateGoogleSession.ts (M4 minimal stub — M5 owns full impl)
 *
 * STABLE SIGNATURE — DO NOT CHANGE in M5:
 *   validateGoogleSession(req: NextRequest): Promise<
 *     | { kind: 'success'; email: string; show_id: string; crew_member_id: string }
 *     | { kind: 'failure'; reason: string }
 *   >
 *
 * Purpose: predicate used by lib/auth/resolveShowViewer.ts to detect a
 * Google-OAuth session bound to a specific (show_id, crew_member_id) pair.
 *
 * M5 owns the Google OAuth flow. The full impl will read the Supabase auth
 * session via @supabase/ssr, canonicalize the user's email through
 * lib/email/canonicalize.ts (AGENTS.md §1.3), look up the crew_members row
 * matching that email + show, and return the (show_id, crew_member_id) tuple.
 *
 * Stub returns { kind: 'failure', reason: 'no_google_session' } unconditionally.
 * No M4 caller depends on a successful crew_google arm; the success path
 * lights up in M5 with the real implementation.
 */
import type { NextRequest } from "next/server";

export async function validateGoogleSession(
  req: NextRequest,
): Promise<
  | { kind: "success"; email: string; show_id: string; crew_member_id: string }
  | { kind: "failure"; reason: string }
> {
  void req;
  return { kind: "failure", reason: "no_google_session" };
}
