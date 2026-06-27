/**
 * lib/visibility/scopeTiles.ts — canonical SCOPE_TILE_VISIBILITY_RULE
 * predicates (M4 Task 4.6, plan lines 332-363, spec §8.1).
 *
 * Single source of truth for which scope tiles a viewer sees on the
 * per-show crew page. EVERY scope-tile component (AudioScopeTile,
 * VideoScopeTile, LightingScopeTile) imports its predicate from this
 * file. NO ad-hoc role-string checks are permitted anywhere
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
 * Spec §8.1 mapping (post-amendment 2026-05-13):
 *   audioScopeVisible    → A1, A2, or LEAD
 *   videoScopeVisible    → V1 or LEAD
 *   lightingScopeVisible → L1 or LEAD (§8.1 amended 2026-05-13: LEAD
 *                          now reads-in to Lighting scope, symmetric
 *                          with Audio and Video — LEADs need visibility
 *                          into lighting scope details even when not
 *                          managing hands-on)
 *   financialsVisible    → admin OR LEAD (load-bearing for FinancialsTile
 *                          in Task 4.8 + the transition-audit gate in
 *                          Task 4.12)
 *
 * Server-safe (pure functions; no environment reads, no side effects).
 */
import type { RoleFlag, TransportationRow } from "@/lib/parser/types";
import { namesRefer } from "@/lib/data/nameMatch";

/**
 * Canonical "all-flags" set for the bare admin viewer's tile-grid
 * synthesis (M4 catch-up review, Important 3).
 *
 * The page mounts every scope tile for an admin viewer (kind: 'admin'
 * has no specific crew row, so admins are super-LEADs per §4.4). The
 * scope-tile predicates already accept this — A1 unlocks audio, V1
 * unlocks video, L1 unlocks lighting (LEAD also unlocks lighting
 * post-§8.1 amendment 2026-05-13). Centralizing the array here
 * (instead of an inline magic-string literal in `page.tsx`) means a
 * future scope-tile addition only needs to add its unlocking flag here.
 *
 * The `satisfies RoleFlag[]` guard means a typo or a non-flag string
 * fails type-checking at this declaration AND the array remains a
 * narrow `readonly RoleFlag[]` literal at every callsite.
 */
export const SCOPE_TILE_UNLOCKING_FLAGS = [
  "LEAD",
  "A1",
  "V1",
  "L1",
] as const satisfies readonly RoleFlag[];

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
 * Lighting scope tile visibility (§8.1, amended 2026-05-13).
 *
 * The viewer sees the Lighting scope tile when their freshly-derived
 * role_flags contain ANY of: L1, LEAD. Symmetric with `audioScopeVisible`
 * and `videoScopeVisible` post-amendment — LEADs need read-in to
 * lighting scope details even when not managing the discipline hands-on.
 *
 * Amendment history: prior to 2026-05-13 the spec carved Lighting out
 * as LEAD-excluded ("a discipline LEADs don't manage hands-on"). The
 * exclusion was reversed because LEADs need lighting visibility to
 * coordinate across disciplines; the AVL triad is now symmetric.
 */
export function lightingScopeVisible(flags: RoleFlag[]): boolean {
  return flags.includes("L1") || flags.includes("LEAD");
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
export function financialsVisible(flags: RoleFlag[], isAdmin: boolean): boolean {
  return isAdmin || flags.includes("LEAD");
}

/**
 * Transport tile visibility (§8.1, Task 4.7).
 *
 * Two OR'd branches per spec §8.1:
 *   1. `namesRefer(transportation.driver_name, viewerName)` — the assigned
 *      driver sees their own ride card.
 *   2. The viewer's name refers to a name in any per-day schedule entry's
 *      `assigned_names[]` — passengers + co-drivers tagged on a leg
 *      see the tile so they know which vehicle / driver / parking
 *      spot they're paired with.
 *
 * Branch 3 (admin): admins see the tile UNCONDITIONALLY when any
 * transportation row exists for the show. This matches the admin
 * "see-everything" posture per §4.4 and aligns with how
 * `getShowForViewer` returns the full transportation row to admins
 * regardless of name match.
 *
 * The viewer-name match is NAME-AWARE via `namesRefer`
 * (BL-TRANSPORT-VIEWER-NAME-MATCH): diacritic-fold + suffix-strip +
 * nickname/initial-prefix + surname-anchored, tolerant of the
 * first-name-only / nickname / case / trim differences between a
 * free-text sheet "Driver: Doug" and a roster "Doug Larson". Exact `===`
 * hid the driver-crew-member's own transport — `driver_name` is FREE-TEXT
 * (`presence(clean(...))` in transport.ts, NOT roster-validated), so it
 * legitimately diverges from the roster name. `assigned_names` are mostly
 * roster-canonical (splitNames' isNameLike upstream) but a legal-name /
 * nickname variant still needs name-aware matching, not raw equality.
 * The filter is UX-not-security per the owner determination (master spec
 * §amendment 2026-05-23) — over-match is benign (the tile is re-reachable
 * by re-picking), under-match (hiding a viewer's own ride) is the harm.
 *
 * Returns false when transportation is null (no row seeded for the
 * show) — there's literally nothing to render. Page is responsible for
 * either rendering the tile or omitting it; this predicate is the
 * single source of truth for the decision.
 */
export function transportTileVisible(opts: {
  transportation: TransportationRow | null;
  viewerName: string | null;
  isAdmin: boolean;
}): boolean {
  const { transportation, viewerName, isAdmin } = opts;
  if (!transportation) return false;
  // Branch 3 — admin sees the tile when transportation exists.
  if (isAdmin) return true;
  if (!viewerName) return false;
  // Branch 1 — assigned driver. `driver_name` is FREE-TEXT (not roster-validated),
  // so match by NAME (namesRefer), tolerant of the first-name / nickname / case /
  // trim differences between a sheet "Driver: Doug" and roster "Doug Larson" —
  // exact `===` hid the driver-crew-member's own transport (BL-HOTEL-VIEWER-NAME-
  // MATCH sibling). UX-not-security per the owner determination.
  if (transportation.driver_name !== null && namesRefer(transportation.driver_name, viewerName))
    return true;
  // Branch 2 — viewer is tagged on at least one schedule leg's assigned_names.
  // assigned_names are mostly roster-canonical (splitNames' isNameLike), but a
  // nickname/legal-name variant ("Douglas Larson" vs "Doug Larson") still needs
  // name-aware matching. The `assigned_names` shape contract lives at
  // lib/parser/types.ts:147-152.
  return transportation.schedule.some((s) =>
    s.assigned_names.some((n) => namesRefer(n, viewerName)),
  );
}
