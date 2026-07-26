/**
 * lib/admin/destructiveConfirm.ts
 *
 * Single source of truth for the armed-state auto-revert window shared by every
 * two-tap destructive confirm in the admin surface.
 *
 * Ratified at 4s on 2026-07-17 (DEFERRED-archive.md:1228 — "more react time for a
 * venue-floor operator, one idiom"). Before this module the value existed as eleven
 * independently copy-pasted literals with no shared definition and no guard, so a
 * single surface could drift without anything failing.
 *
 * Pinned by tests/styles/_metaDestructiveConfirm.test.ts: T1 asserts exactly one
 * declaration and that it is this file; T3 asserts the value is 4s. That is the whole
 * guard. It does NOT detect a surface pointing its arm timer at some other value —
 * that needs to know which call is the arm timer, which is semantic. See §5.3 of
 * docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md.
 */
export const ARM_REVERT_MS = 4_000;
