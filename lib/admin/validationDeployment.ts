export const VALIDATION_PROJECT_REF = "vzakgrxqwcalbmagufjh";

// Strict host-boundary regex copied verbatim from scripts/lib/validation-target.ts:27.
// Rejects branch-preview/suffixed hosts and trailing-garbage suffixes.
const PROJECT_REF_HOST_REGEX = /^https?:\/\/([a-z0-9]+)\.supabase\.(?:co|in)(?::\d+)?(?:\/|$)/i;

export function projectRefFromUrl(url: string | undefined): string | null {
  const m = (url ?? "").match(PROJECT_REF_HOST_REGEX);
  return m?.[1] ?? null;
}

export function isValidationDeployment(): boolean {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return projectRefFromUrl(url) === VALIDATION_PROJECT_REF;
}

export function destructiveResetAllowed(): boolean {
  return isValidationDeployment() && process.env.ALLOW_DESTRUCTIVE_RESET === "true";
}
