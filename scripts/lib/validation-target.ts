// scripts/lib/validation-target.ts — M12 Phase 0.C Task 0.C.2.
//
// Per master spec §3.3 step 5: validation tooling MUST refuse to operate
// against a local Supabase URL unless the operator explicitly opts in via
// --allow-local-override. Defends against accidental seeding/mutating of
// the local stack when the operator meant prod-equivalent.

const LOCALHOST_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

function isLocalUrl(url: string): boolean {
  return LOCALHOST_REGEX.test(url);
}

// Supabase project URLs follow the canonical shape
// `https://<project-ref>.supabase.co`. Subdomains for branched-database
// previews (`<project-ref>--<branch>.supabase.co`) and the legacy
// staging form (`.supabase.in`) MAY appear; we recognise both. The
// project-ref portion is opaque from the operator's perspective; the
// binding check below just compares the captured host-prefix against
// the env var that the operator independently set.
const PROJECT_REF_HOST_REGEX =
  /^https?:\/\/([a-z0-9]+)(?:--[\w-]+)?\.supabase\.(?:co|in)(?::\d+)?(?:\/|$)/i;

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
  if (isLocalUrl(url)) {
    if (!allowLocalOverride) {
      throw new Error(
        `Refusing to operate against local URL (${url}); use --allow-local-override to bypass. ` +
          "Per spec §3.3 step 5 — validation tooling defends against accidental local-stack seeds.",
      );
    }
    return;
  }
  // Codex Phase 0.C R2 F1 — plaintext-http guard. Service-role
  // VALIDATION_SUPABASE_SECRET_KEY is sent over the wire on every RPC
  // call; a typo (`http://<ref>.supabase.co`) would leak the secret in
  // cleartext before any redirect could save it. Hosted URLs MUST be https.
  if (!url.toLowerCase().startsWith("https://")) {
    throw new Error(
      `VALIDATION_SUPABASE_URL '${url}' is not https://. Service-role ` +
        "credentials would be sent in plaintext. Use https:// for hosted " +
        "Supabase targets; only localhost may be http (and only with " +
        "--allow-local-override).",
    );
  }
}

/**
 * Asserts that VALIDATION_SUPABASE_URL's host prefix matches
 * VALIDATION_SUPABASE_PROJECT_REF. Closes the F2 wrong-project bypass
 * (Codex Phase 0.C R1): without this binding, the operator could point
 * URL at project A while leaving project_ref env at B → reseed writes
 * to A, but stamps `seeded_supabase_project_ref = B`; check-seed
 * predicate (d) then compares the stamped B to env B and PASSes,
 * masking the wrong-database write.
 *
 * Skipped when `--allow-local-override` is in effect (local Supabase
 * uses an arbitrary host shape, not `<ref>.supabase.co`).
 */
export function assertSupabaseTargetMatchesProjectRef(
  url: string,
  projectRef: string | undefined,
  // Kept in the signature for symmetry with assertProdEquivalentTarget +
  // backwards-compatibility with call sites. The actual local-skip
  // decision is made by inspecting the URL itself (R2 F2 — the flag
  // alone is too coarse: passing --allow-local-override against a
  // hosted URL must NOT skip the binding check).
  _allowLocalOverride: boolean,
): void {
  // R2 F2 — skip binding ONLY when the URL is genuinely local. A hosted
  // URL with --allow-local-override still gets the host/ref binding.
  if (isLocalUrl(url)) return;
  if (projectRef === undefined || projectRef.length === 0) {
    throw new Error(
      "VALIDATION_SUPABASE_PROJECT_REF is required — set it to the project ref " +
        "matching VALIDATION_SUPABASE_URL's host (e.g., `vzakgrxqwcalbmagufjh` for " +
        "`https://vzakgrxqwcalbmagufjh.supabase.co`).",
    );
  }
  const match = url.match(PROJECT_REF_HOST_REGEX);
  if (!match) {
    throw new Error(
      `VALIDATION_SUPABASE_URL '${url}' does not match the canonical Supabase ` +
        "host shape `https://<project-ref>.supabase.{co,in}`. If you're using a " +
        "self-hosted Supabase mirror, pass --allow-local-override; otherwise fix " +
        "the URL value in .env.local.",
    );
  }
  const urlHostRef = match[1];
  if (urlHostRef !== projectRef) {
    throw new Error(
      `Project-ref mismatch (F2 wrong-project guard): VALIDATION_SUPABASE_URL host ` +
        `prefix '${urlHostRef}' != VALIDATION_SUPABASE_PROJECT_REF '${projectRef}'. ` +
        "An operator-misalignment here would cause reseed to mutate the wrong " +
        "Supabase project while check-seed predicate (d) still PASSes (stamped " +
        "project_ref echoes env). Fix the .env.local entries to align.",
    );
  }
}
