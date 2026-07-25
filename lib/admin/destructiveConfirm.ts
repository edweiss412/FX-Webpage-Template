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
 * Pinned by tests/styles/_metaDestructiveConfirm.test.ts (T1 single declaration,
 * T2 per-file identifier census, T3 value pin). That guard reduces re-drift; it does
 * not eliminate it — six holes are enumerated honestly in §5.3 of
 * docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md.
 */
export const ARM_REVERT_MS = 4_000;
