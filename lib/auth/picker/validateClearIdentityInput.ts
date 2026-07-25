/**
 * lib/auth/picker/validateClearIdentityInput.ts
 *
 * Shape validation for the clear-identity inputs, shared by the guest action and
 * the core implementation so the two cannot drift.
 *
 * Why this is its own module rather than an export of clearIdentity.ts: that file
 * is a module-level `"use server"` file, and Next permits only async function
 * exports there. A synchronous predicate would fail the build, and marking it
 * async to satisfy the rule would mint another exported Server Action that the
 * mutation-surface scanner discovers per function — needing its own telemetry or
 * exemption for no benefit. A plain module sidesteps both.
 *
 * Why the guest action validates up front: sign-out and the cookie clear are
 * destructive, and validation used to sit downstream of them, so a malformed
 * direct submission signed the person out and only then reported the error.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export function isValidClearIdentityInput(input: {
  slug: string;
  shareToken: string;
  showId: string;
}): boolean {
  return SLUG_RE.test(input.slug) && TOKEN_RE.test(input.shareToken) && UUID_RE.test(input.showId);
}
