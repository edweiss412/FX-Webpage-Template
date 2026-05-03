/**
 * lib/visibility/scopeTiles.ts — canonical SCOPE_TILE_VISIBILITY_RULE
 * predicates (M4 Task 4.6, plan lines 332-363, spec §8.1).
 *
 * Single source of truth for which scope tiles a viewer sees on the
 * per-show crew page. EVERY scope-tile component (AudioScopeTile,
 * VideoScopeTile, LightingScopeTile) imports its predicate from this
 * file. NO ad-hoc `viewerRole === 'LEAD'` checks are permitted anywhere
 * in the codebase — every visibility decision routes through these
 * functions so the rule lives in one place.
 *
 * Origin-of-trust contract (read this before changing the signatures):
 *
 *   The `flags: RoleFlag[]` parameter is ALWAYS sourced from
 *   `getShowForViewer`'s freshly-loaded `crew_members.role_flags`. The
 *   array is NEVER caller-supplied via a query string, header, JWT
 *   claim, cookie, or any other input the user can shape. A redeemed-
 *   link cookie predates a sync-time demote, a `?role=lead` URL param
 *   tries to widen authority — both classes of stale-or-spoofed role
 *   bug are blocked by getShowForViewer re-deriving role_flags on every
 *   call (lib/data/getShowForViewer.ts:122-148). The predicates here
 *   trust the array because the helper guarantees its origin.
 *
 *   If a future refactor makes one of these predicates take a
 *   caller-supplied flags parameter (e.g., by exposing them on a public
 *   API surface), THIS COMMENT BLOCK MUST BE UPDATED FIRST and a
 *   matching adversarial review must approve the new origin chain.
 *
 *   The static-analysis test in tests/visibility/scopeTiles.test.ts
 *   greps this file for the words "freshly" and "role_flags" — those
 *   anchors keep the contract visible.
 *
 * Spec §8.1 mapping (verbatim plan lines 343-355):
 *   audioScopeVisible    → A1, A2, or LEAD
 *   videoScopeVisible    → V1 or LEAD
 *   lightingScopeVisible → L1 ONLY (LEAD intentionally NOT included —
 *                          spec §8.1 says lighting is a discipline
 *                          LEADs don't manage hands-on)
 *   financialsVisible    → admin OR LEAD (load-bearing for FinancialsTile
 *                          in Task 4.8 + the transition-audit gate in
 *                          Task 4.12)
 *
 * Server-safe (pure functions; no environment reads, no side effects).
 */
import type { RoleFlag } from "@/lib/parser/types";

/**
 * Audio scope tile visibility (§8.1).
 *
 * The viewer sees the Audio scope tile when their freshly-derived
 * role_flags contain ANY of: A1, A2, LEAD. The tile aggregates per-room
 * `audio` strings across General Session / breakouts / additional rooms.
 *
 * LEAD viewers see Audio UNCONDITIONALLY — even on shows with no audio
 * crew assigned, the tile renders so the LEAD can review the audio plan.
 * The empty-state fallback (no rooms have an `audio` value) is the
 * tile's responsibility, NOT this predicate's.
 */
export function audioScopeVisible(flags: RoleFlag[]): boolean {
  return flags.includes("A1") || flags.includes("A2") || flags.includes("LEAD");
}

/**
 * Video scope tile visibility (§8.1).
 *
 * The viewer sees the Video scope tile when their freshly-derived
 * role_flags contain ANY of: V1, LEAD. Same LEAD-unconditional contract
 * as Audio.
 */
export function videoScopeVisible(flags: RoleFlag[]): boolean {
  return flags.includes("V1") || flags.includes("LEAD");
}

/**
 * Lighting scope tile visibility (§8.1).
 *
 * The viewer sees the Lighting scope tile when their freshly-derived
 * role_flags contain L1. **LEAD is INTENTIONALLY NOT INCLUDED** — spec
 * §8.1 carves lighting out as a discipline LEADs don't manage hands-on.
 * A LEAD-only viewer (no L1 atomic flag) sees Audio + Video + Financials
 * but NOT Lighting. A LEAD+L1 compound viewer sees Lighting via the
 * atomic flag.
 *
 * Do NOT add `flags.includes("LEAD")` here without revising the spec
 * and the §8.1 documentation in tandem — the asymmetry is the point.
 */
export function lightingScopeVisible(flags: RoleFlag[]): boolean {
  return flags.includes("L1");
}

/**
 * Financials tile visibility (§4.4, §8.1, AC-4.2).
 *
 * The viewer sees the Financials tile when EITHER:
 *   - they are the admin viewer (kind === 'admin'), OR
 *   - their freshly-derived role_flags include LEAD.
 *
 * Defense in depth: this predicate is the application-layer gate.
 * `getShowForViewer` already enforces the same rule (only joins
 * `shows_internal` when isLead === true; lib/data/getShowForViewer.ts:312).
 * The FinancialsTile component then double-checks via this predicate
 * before rendering — so a future projection refactor that accidentally
 * exposes financials to a non-LEAD viewer is caught at the component
 * boundary too.
 *
 * `isAdmin` is supplied by the page (boolean derived from
 * `viewer.kind === 'admin'`); it is NOT caller-controlled — `?as=admin`
 * is the only mock-mode admit, gated at the page handler. M5 replaces
 * the mock with cookie-bound auth; the predicate signature stays stable.
 */
export function financialsVisible(
  flags: RoleFlag[],
  isAdmin: boolean,
): boolean {
  return isAdmin || flags.includes("LEAD");
}
