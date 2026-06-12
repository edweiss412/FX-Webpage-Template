type SupabaseAuthErrorLike = {
  name?: unknown;
};

// Name-only matching, mirroring the SDK's own type guard
// (@supabase/auth-js src/lib/errors.ts: `error.name === 'AuthSessionMissingError'`).
// The literal-message arm was deleted by owner decision (2026-06-12) so an SDK
// message rewording can never break the signed-out redirect; the class name is
// set by CustomAuthError's constructor and is the stable contract.
export function isAuthSessionMissingError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as SupabaseAuthErrorLike;
  return err.name === "AuthSessionMissingError";
}
