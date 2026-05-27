// scripts/lib/validation-target.ts — M12 Phase 0.C Task 0.C.2.
//
// Per master spec §3.3 step 5: validation tooling MUST refuse to operate
// against a local Supabase URL unless the operator explicitly opts in via
// --allow-local-override. Defends against accidental seeding/mutating of
// the local stack when the operator meant prod-equivalent.

const LOCALHOST_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

/**
 * Throws if the URL points at localhost / 127.0.0.1 / [::1] without an
 * explicit --allow-local-override. Throws if the URL is undefined / empty.
 *
 * @param url   Resolved value of process.env.VALIDATION_SUPABASE_URL
 * @param allowLocalOverride  Resolved value of the --allow-local-override
 *                            CLI flag
 */
export function assertProdEquivalentTarget(
  url: string | undefined,
  allowLocalOverride: boolean,
): void {
  if (url === undefined || url.length === 0) {
    throw new Error(
      "VALIDATION_SUPABASE_URL is required — set it in .env.local (the dev's " +
        "Vercel Production-scope value) per spec §9.1.2 + .env.local.example.",
    );
  }
  if (LOCALHOST_REGEX.test(url) && !allowLocalOverride) {
    throw new Error(
      `Refusing to operate against local URL (${url}); use --allow-local-override to bypass. ` +
        "Per spec §3.3 step 5 — validation tooling defends against accidental local-stack seeds.",
    );
  }
}
