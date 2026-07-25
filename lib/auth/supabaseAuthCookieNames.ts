/**
 * lib/auth/supabaseAuthCookieNames.ts
 *
 * Single matcher for the Supabase auth cookies an explicit teardown clears.
 *
 * Two callers share it so they cannot drift: the sign-out route's belt-and-
 * braces sweep (app/auth/sign-out/route.ts) and the crew guest path's
 * device-local sign-out (lib/auth/picker/clearIdentity.ts). Getting the shape
 * wrong fails in both directions — too narrow leaves a session shard behind, too
 * broad eats unrelated cookies including the `__Host-fxav_picker` envelope.
 *
 * Shape: `sb-<project>-auth-token`, optionally `-code-verifier`, optionally a
 * `.<n>` chunk suffix (Supabase splits a large session across numbered cookies).
 */
const SUPABASE_AUTH_COOKIE_RE = /^sb-[^-]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

export function isSupabaseAuthCookieName(name: string): boolean {
  return SUPABASE_AUTH_COOKIE_RE.test(name);
}
