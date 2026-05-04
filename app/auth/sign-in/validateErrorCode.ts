/**
 * app/auth/sign-in/validateErrorCode.ts (M5 §B Task 5.8 — Opus's portion)
 *
 * Sign-in-page-specific helper. Co-located with `page.tsx` (NOT in
 * `lib/auth/`) because:
 *   1. lib/auth/ is §A territory per the M5 split — staying out of it
 *      keeps the §A↔§B boundary clean.
 *   2. The OAuth allowlist below is sign-in-page-specific. Other catalog
 *      consumers (admin AlertBanner, etc.) have their own allowlists
 *      (see ADMIN_CODES in tests/components/AlertBanner.test.tsx). A
 *      shared lib/messages helper would conflate orthogonal concerns.
 *
 * Spec contract (Task 5.8 §B prompt + invariant 5):
 *   - Defense-in-depth syntactic regex: `^[A-Z_]{1,64}$`. Even though
 *     the allowlist below is the authoritative gate, the regex stops
 *     attacker-supplied non-MessageCode payloads from ever touching
 *     the catalog lookup. Bounded length prevents pathological inputs.
 *   - Allowlist: only the two §12.4 codes the OAuth callback emits and
 *     the sign-in page is expected to render.
 *   - Defensive null: invalid input returns null. The sign-in page
 *     skips rendering the error block silently — the validator's
 *     rules are NEVER revealed via the UI (no "invalid code" message,
 *     no fallback copy).
 *
 * Anti-tautology: the test in tests/auth/validateErrorCode.test.ts
 * asserts against literal allowed codes, NOT against re-derivation
 * from this file. If either side drifts the test fails.
 */
import type { MessageCode } from "@/lib/messages/catalog";

/**
 * Defense-in-depth syntactic regex. Bounded length (64 chars matches
 * the longest existing MessageCode comfortably while preventing
 * pathological inputs). UPPER_SNAKE_CASE only — matches the catalog's
 * naming convention. The leading `[A-Z]` requirement rejects all-
 * underscore strings (`_`, `___`) which catalog codes never start with;
 * defense-in-depth on top of the allowlist gate below.
 */
const ERROR_CODE_SYNTACTIC_RE = /^[A-Z][A-Z_]{0,63}$/;

/**
 * Allowlist of MessageCodes the OAuth callback emits and the sign-in
 * page is expected to render. Any other code — even a valid MessageCode
 * elsewhere in the catalog — returns null.
 *
 * `as const` keeps the literal type so the readonly Set check below
 * narrows the return type correctly.
 */
const OAUTH_ALLOWED_CODES = new Set<MessageCode>([
  "OAUTH_STATE_INVALID",
  "OAUTH_REDIRECT_INVALID",
  // R17 #2/#3 (round-16 §A+§B MEDIUM): admin-session lookup
  // infrastructure failure surfaces as a sign-in page error instead
  // of a silent /me redirect. The OAuth callback and the sign-in
  // already-authenticated guard both forward this code on
  // isAdminSession.reason === "infra_error" so the user sees a
  // cataloged retry-able error instead of an opaque downgrade.
  "ADMIN_SESSION_LOOKUP_FAILED",
]);

/**
 * Validate a user-controlled `searchParams.code` value for the sign-in
 * page's error-block render path.
 *
 * @param raw — the raw value from `searchParams.code` (any type; URL
 *   search-param helpers normalize to string|string[]|undefined, but
 *   this helper defensively accepts `unknown`).
 * @returns the MessageCode literal when input passes both regex and
 *   allowlist checks; otherwise `null`. The sign-in page treats `null`
 *   as "render no error block" — silent skip, no fallback copy.
 */
export function validateErrorCodeParam(raw: unknown): MessageCode | null {
  if (typeof raw !== "string") {
    return null;
  }
  if (!ERROR_CODE_SYNTACTIC_RE.test(raw)) {
    return null;
  }
  // The Set's value type is MessageCode; the .has() input is a string
  // that just passed our regex. Use a type-narrowing cast so the return
  // value carries the MessageCode type without `as` at the call site.
  if (!OAUTH_ALLOWED_CODES.has(raw as MessageCode)) {
    return null;
  }
  return raw as MessageCode;
}
