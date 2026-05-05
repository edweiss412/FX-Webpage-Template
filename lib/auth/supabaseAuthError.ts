type SupabaseAuthErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
};

export function isAuthSessionMissingError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as SupabaseAuthErrorLike;
  return err.name === "AuthSessionMissingError" || err.message === "Auth session missing!";
}
