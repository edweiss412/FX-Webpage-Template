/**
 * lib/time/rightNowTransitions.ts — RightNow §8.2 transition audit matrix
 * (M4 Task 4.12; spec §8.2 lines 2416-2426; AGENTS.md §3
 * Transition Inventory).
 *
 * The §8.2 RightNow card has 12 discriminated-union states (see
 * `lib/time/rightNow.ts` `RightNowState`). AGENTS.md §3 requires a
 * Transition Inventory table enumerating every unordered state pair
 * (`C(12,2) = 66`) with one of four animation treatments. This module
 * is the single source of truth — both vitest contract tests
 * (`tests/time/rightNowTransitions.test.ts`) and the Playwright audit
 * (`tests/e2e/right-now-transitions.spec.ts`, scaffolded as
 * `test.fixme` until Batch 2 lands `framer-motion`) drive their
 * assertions from this constant.
 *
 * Treatment heuristic (first match wins per pair):
 *
 *   1. Either endpoint `unknown`, other not `dateless` → morph-to-last-good
 *      (spec line 2424: "Card morphs to last-good state with a 'stale'
 *      tint, no animation"). The reverse direction (recovery) carries
 *      the same treatment — the card is unwinding the stale tint, not
 *      crossfading body content.
 *   2. Either endpoint `dateless`, other not `unknown` → morph-to-last-good.
 *      `dateless` is the more degenerate fallback than `unknown`; both
 *      carry the stale-tint treatment.
 *   3. `unknown ↔ dateless` → crossfade-body. Both are date-data
 *      fallbacks; the natural code path is sync recovery moving from
 *      `dateless` (no parseable dates) → `unknown` (some parseable but
 *      not all). Recovery, not stale-on-stale.
 *   4. Both time-driven (`pre_travel`, `travel_in_day`, `set_day`,
 *      `show_day_n`, `travel_out_day`, `post_show`) AND adjacent in the
 *      show-day sequence → crossfade-body (date rollover; spec lines
 *      2420-2421).
 *   5. Both time-driven but NOT adjacent → unreachable. The natural
 *      code path skips intermediate states only via sync, which routes
 *      through `unknown`. Direct skips (e.g., `pre_travel → set_day`
 *      without ever rendering `travel_in_day`) cannot occur on the
 *      60-second clock tick that drives state-recomputation.
 *   6. Viewer-aware (`viewer_unconfirmed`, `viewer_after_last_day`,
 *      `viewer_off_day`, `viewer_off_day_pre`) ↔ time-driven, plausible
 *      → crossfade-body. Plausible means a single render-cycle delta
 *      (date rollover OR viewer.date_restriction edit) can produce the
 *      transition.
 *   7. Two viewer-aware states → crossfade-body, except
 *      `viewer_after_last_day ↔ viewer_off_day_pre` which is a
 *      calendrical paradox (viewer's last day BEFORE viewer's first
 *      day) → unreachable.
 *   8. `post_show ↔ pre_travel` → unreachable. Show wraps then "starts
 *      over" implies a fresh show with the same `show.id`; never
 *      occurs.
 *
 * Pure data + a tiny lookup helper. No I/O, no environment reads.
 * Server-safe.
 */
import type { RightNowState } from "./rightNow";

/**
 * The 12 RightNow state kinds, as a string-literal union derived from
 * the `RightNowState` discriminated union. Keeping this aligned to
 * `RightNowState["kind"]` means any future state addition (or removal)
 * surfaces as a TypeScript error here AND in the matrix.
 */
export type RightNowStateKind = RightNowState["kind"];

/**
 * The four animation treatments §8.2 transitions can carry.
 *
 *   - `crossfade-body`     Date rollover OR data-edit recovery; the
 *                          card body crossfades while the container
 *                          preserves its height (`min-h-[X]`).
 *   - `morph-to-last-good` Sync error (Any → unknown) OR fall-back to
 *                          the more degenerate `dateless`. Card snaps
 *                          to the last-good content with a stale tint
 *                          applied; no animation.
 *   - `instant`            User-initiated state change where snap is
 *                          acceptable (kept in the type for future
 *                          extensions; currently no entry uses this
 *                          treatment because every §8.2 transition is
 *                          either time-driven, sync-driven, or
 *                          unreachable).
 *   - `unreachable`        No natural code path reaches this transition
 *                          on the 60-second clock tick. Regression-
 *                          guarded by the audit suite — if the state
 *                          machine ever produces one of these, the
 *                          assumption underlying the matrix is broken
 *                          and the test must fail loudly.
 */
export type TransitionTreatment =
  | "crossfade-body"
  | "morph-to-last-good"
  | "instant"
  | "unreachable";

/**
 * One entry per unordered state pair. The matrix is symmetric — `(a, b)`
 * and `(b, a)` carry the same treatment — so we store one row per
 * unordered pair, NOT both directions, to keep the matrix at exactly
 * 66 entries (C(12, 2) = 66).
 *
 * `reason` is required for `unreachable` cells (per AGENTS.md §3 and
 * the dispatch spec) and optional for the others. Free-text rationale
 * naming the calendar / sync invariant that drives the cell.
 */
export interface TransitionMatrixEntry {
  from: RightNowStateKind;
  to: RightNowStateKind;
  treatment: TransitionTreatment;
  reason?: string;
}

/**
 * The full 66-entry transition matrix. Order within the array is
 * grouped by treatment + heuristic rule for readability — the audit
 * tests do not depend on insertion order.
 *
 * Adjacent time-driven sequence (Rule 4):
 *   pre_travel → travel_in_day → set_day → show_day_n → travel_out_day → post_show
 */
export const RIGHT_NOW_TRANSITION_MATRIX: TransitionMatrixEntry[] = [
  // ── Rule 4: adjacent time-driven (5 pairs) ────────────────────────
  {
    from: "pre_travel",
    to: "travel_in_day",
    treatment: "crossfade-body",
    reason: "Date rollover travelIn-1 → travelIn (spec line 2420).",
  },
  {
    from: "travel_in_day",
    to: "set_day",
    treatment: "crossfade-body",
    reason: "Date rollover travelIn → setDay.",
  },
  {
    from: "set_day",
    to: "show_day_n",
    treatment: "crossfade-body",
    reason: "Date rollover setDay → showDays[0].",
  },
  {
    from: "show_day_n",
    to: "travel_out_day",
    treatment: "crossfade-body",
    reason:
      "Date rollover last show day → travelOut. (Same-day show_day_n → show_day_n+1 is a self-transition handled inside the show_day_n payload, not a kind-pair entry.)",
  },
  {
    from: "travel_out_day",
    to: "post_show",
    treatment: "crossfade-body",
    reason: "Date rollover travelOut → travelOut+1.",
  },

  // ── Rule 5: non-adjacent time-driven (10 pairs, unreachable) ──────
  {
    from: "pre_travel",
    to: "set_day",
    treatment: "unreachable",
    reason:
      "Skips travel_in_day. Date rollover ticks one day at a time; sync skips route through `unknown`, not directly state-to-state.",
  },
  {
    from: "pre_travel",
    to: "show_day_n",
    treatment: "unreachable",
    reason: "Skips travel_in_day and set_day. Same as above.",
  },
  {
    from: "pre_travel",
    to: "travel_out_day",
    treatment: "unreachable",
    reason: "Skips three intermediate time-driven states.",
  },
  {
    from: "pre_travel",
    to: "post_show",
    treatment: "unreachable",
    reason:
      "Show wraps then 'starts over' — would require fresh show.id, not the same row. Heuristic rule 8.",
  },
  {
    from: "travel_in_day",
    to: "show_day_n",
    treatment: "unreachable",
    reason: "Skips set_day on the natural rollover.",
  },
  {
    from: "travel_in_day",
    to: "travel_out_day",
    treatment: "unreachable",
    reason: "Skips set_day and show_day_n on the natural rollover.",
  },
  {
    from: "travel_in_day",
    to: "post_show",
    treatment: "unreachable",
    reason: "Skips three intermediate time-driven states.",
  },
  {
    from: "set_day",
    to: "travel_out_day",
    treatment: "unreachable",
    reason: "Skips show_day_n on the natural rollover.",
  },
  {
    from: "set_day",
    to: "post_show",
    treatment: "unreachable",
    reason: "Skips show_day_n and travel_out_day on the natural rollover.",
  },
  {
    from: "show_day_n",
    to: "post_show",
    treatment: "unreachable",
    reason: "Skips travel_out_day on the natural rollover.",
  },

  // ── Rule 1: `unknown` ↔ time-driven (6 pairs, morph-to-last-good) ──
  {
    from: "unknown",
    to: "pre_travel",
    treatment: "morph-to-last-good",
    reason:
      "Sync error during pre_travel collapses to unknown; recovery unwinds the stale tint without crossfading body (spec line 2424).",
  },
  {
    from: "unknown",
    to: "travel_in_day",
    treatment: "morph-to-last-good",
    reason: "Sync error during travel_in_day; reverse is recovery.",
  },
  {
    from: "unknown",
    to: "set_day",
    treatment: "morph-to-last-good",
    reason: "Sync error during set_day; reverse is recovery.",
  },
  {
    from: "unknown",
    to: "show_day_n",
    treatment: "morph-to-last-good",
    reason: "Sync error during show_day_n; reverse is recovery.",
  },
  {
    from: "unknown",
    to: "travel_out_day",
    treatment: "morph-to-last-good",
    reason: "Sync error during travel_out_day; reverse is recovery.",
  },
  {
    from: "unknown",
    to: "post_show",
    treatment: "morph-to-last-good",
    reason: "Sync error during post_show; reverse is recovery.",
  },

  // ── Rule 1: `unknown` ↔ viewer-aware (4 pairs, morph-to-last-good) ─
  {
    from: "unknown",
    to: "viewer_off_day",
    treatment: "morph-to-last-good",
    reason: "Sync error while viewer is off-day; reverse is recovery.",
  },
  {
    from: "unknown",
    to: "viewer_off_day_pre",
    treatment: "morph-to-last-good",
    reason: "Sync error while viewer is pre-first-assigned-day; reverse is recovery.",
  },
  {
    from: "unknown",
    to: "viewer_unconfirmed",
    treatment: "morph-to-last-good",
    reason: "Sync error while viewer is unconfirmed; reverse is recovery.",
  },
  {
    from: "unknown",
    to: "viewer_after_last_day",
    treatment: "morph-to-last-good",
    reason: "Sync error after viewer's last assigned day; reverse is recovery.",
  },

  // ── Rule 2: `dateless` ↔ time-driven (6 pairs, morph-to-last-good) ─
  {
    from: "dateless",
    to: "pre_travel",
    treatment: "morph-to-last-good",
    reason:
      "Total date loss is the more degenerate fallback than `unknown`; carries the same stale-tint treatment.",
  },
  {
    from: "dateless",
    to: "travel_in_day",
    treatment: "morph-to-last-good",
    reason: "Same as above; total date loss.",
  },
  {
    from: "dateless",
    to: "set_day",
    treatment: "morph-to-last-good",
    reason: "Same as above; total date loss.",
  },
  {
    from: "dateless",
    to: "show_day_n",
    treatment: "morph-to-last-good",
    reason: "Same as above; total date loss.",
  },
  {
    from: "dateless",
    to: "travel_out_day",
    treatment: "morph-to-last-good",
    reason: "Same as above; total date loss.",
  },
  {
    from: "dateless",
    to: "post_show",
    treatment: "morph-to-last-good",
    reason: "Same as above; total date loss.",
  },

  // ── Rule 2: `dateless` ↔ viewer-aware (4 pairs, morph-to-last-good)─
  {
    from: "dateless",
    to: "viewer_off_day",
    treatment: "morph-to-last-good",
    reason: "Total date loss; stale tint regardless of viewer state.",
  },
  {
    from: "dateless",
    to: "viewer_off_day_pre",
    treatment: "morph-to-last-good",
    reason: "Total date loss; stale tint regardless of viewer state.",
  },
  {
    from: "dateless",
    to: "viewer_unconfirmed",
    treatment: "morph-to-last-good",
    reason: "Total date loss; stale tint regardless of viewer state.",
  },
  {
    from: "dateless",
    to: "viewer_after_last_day",
    treatment: "morph-to-last-good",
    reason: "Total date loss; stale tint regardless of viewer state.",
  },

  // ── Rule 3: `unknown` ↔ `dateless` (1 pair, crossfade-body) ────────
  {
    from: "unknown",
    to: "dateless",
    treatment: "crossfade-body",
    reason:
      "Both are date-data fallbacks. Natural recovery moves from `dateless` (no parseable dates) → `unknown` (some parseable but not all) → time-driven state. Recovery, not stale-on-stale.",
  },

  // ── Rule 6: viewer-aware ↔ time-driven (24 pairs total) ───────────
  // viewer_off_day ↔ time-driven (6 plausible)
  {
    from: "viewer_off_day",
    to: "pre_travel",
    treatment: "crossfade-body",
    reason:
      "Doug edits viewer.date_restriction OR show.travelIn shifts; render cycle re-derives state.",
  },
  {
    from: "viewer_off_day",
    to: "travel_in_day",
    treatment: "crossfade-body",
    reason: "Today rolls onto travelIn AND travelIn is in viewer.days (data edit).",
  },
  {
    from: "viewer_off_day",
    to: "set_day",
    treatment: "crossfade-body",
    reason: "Today rolls onto setDay AND setDay is in viewer.days.",
  },
  {
    from: "viewer_off_day",
    to: "show_day_n",
    treatment: "crossfade-body",
    reason: "Spec lines 2422-2423: today rolls into a viewer's assigned day.",
  },
  {
    from: "viewer_off_day",
    to: "travel_out_day",
    treatment: "crossfade-body",
    reason: "Today rolls onto travelOut AND travelOut is in viewer.days.",
  },
  {
    from: "viewer_off_day",
    to: "post_show",
    treatment: "crossfade-body",
    reason: "Date rollover travelOut → travelOut+1 with viewer NOT assigned travelOut.",
  },

  // viewer_off_day_pre ↔ time-driven (3 plausible, 3 unreachable)
  {
    from: "viewer_off_day_pre",
    to: "pre_travel",
    treatment: "crossfade-body",
    reason: "Doug toggles viewer.date_restriction between explicit and none.",
  },
  {
    from: "viewer_off_day_pre",
    to: "travel_in_day",
    treatment: "crossfade-body",
    reason:
      "Today rolls onto travelIn AND travelIn is the viewer's first assigned day (Step 2 explicitly named in plan).",
  },
  {
    from: "viewer_off_day_pre",
    to: "set_day",
    treatment: "crossfade-body",
    reason:
      "Spec/plan call this out: viewer's first assigned day = setDay AND today rolls onto it.",
  },
  {
    from: "viewer_off_day_pre",
    to: "show_day_n",
    treatment: "unreachable",
    reason:
      "viewer_off_day_pre requires today < travelIn; show_day_n requires today = a show day. Skipping travel_in_day / set_day on a single tick is a sync skip, which routes through `unknown`.",
  },
  {
    from: "viewer_off_day_pre",
    to: "travel_out_day",
    treatment: "unreachable",
    reason:
      "viewer_off_day_pre requires today < travelIn; travel_out_day requires today = travelOut. Skips travel_in_day, set_day, show_day_n.",
  },
  {
    from: "viewer_off_day_pre",
    to: "post_show",
    treatment: "unreachable",
    reason:
      "viewer_off_day_pre requires today < travelIn; post_show requires today > travelOut. Skips every intermediate state.",
  },

  // viewer_unconfirmed ↔ time-driven (6 plausible)
  {
    from: "viewer_unconfirmed",
    to: "pre_travel",
    treatment: "crossfade-body",
    reason:
      "Spec line 2425: Doug fixes unknown_asterisk → viewer_unconfirmed becomes a concrete state.",
  },
  {
    from: "viewer_unconfirmed",
    to: "travel_in_day",
    treatment: "crossfade-body",
    reason: "Spec line 2425; same mechanism (asterisk → explicit days).",
  },
  {
    from: "viewer_unconfirmed",
    to: "set_day",
    treatment: "crossfade-body",
    reason: "Spec line 2425; same mechanism.",
  },
  {
    from: "viewer_unconfirmed",
    to: "show_day_n",
    treatment: "crossfade-body",
    reason: "Spec line 2425; same mechanism.",
  },
  {
    from: "viewer_unconfirmed",
    to: "travel_out_day",
    treatment: "crossfade-body",
    reason: "Spec line 2425; same mechanism.",
  },
  {
    from: "viewer_unconfirmed",
    to: "post_show",
    treatment: "crossfade-body",
    reason: "Spec line 2425; same mechanism (asterisk fixed after wrap).",
  },

  // viewer_after_last_day ↔ time-driven (6 plausible)
  {
    from: "viewer_after_last_day",
    to: "pre_travel",
    treatment: "crossfade-body",
    reason:
      "Doug extends viewer.days OR show.travelIn shifts forward; render cycle re-derives state.",
  },
  {
    from: "viewer_after_last_day",
    to: "travel_in_day",
    treatment: "crossfade-body",
    reason: "Doug edits viewer.days to include travelIn (data edit).",
  },
  {
    from: "viewer_after_last_day",
    to: "set_day",
    treatment: "crossfade-body",
    reason: "Doug edits viewer.days to include setDay.",
  },
  {
    from: "viewer_after_last_day",
    to: "show_day_n",
    treatment: "crossfade-body",
    reason: "Doug edits viewer.days to include the current show day.",
  },
  {
    from: "viewer_after_last_day",
    to: "travel_out_day",
    treatment: "crossfade-body",
    reason: "Doug edits viewer.days to include travelOut.",
  },
  {
    from: "viewer_after_last_day",
    to: "post_show",
    treatment: "crossfade-body",
    reason:
      "Doug removes the explicit restriction; viewer becomes unrestricted post-show.",
  },

  // ── Rule 7: viewer-aware ↔ viewer-aware (6 pairs) ─────────────────
  {
    from: "viewer_off_day",
    to: "viewer_off_day_pre",
    treatment: "crossfade-body",
    reason:
      "Doug edits viewer.days such that today shifts from inside-span-not-today to before-first-day.",
  },
  {
    from: "viewer_off_day",
    to: "viewer_unconfirmed",
    treatment: "crossfade-body",
    reason: "Doug toggles viewer.date_restriction between explicit and unknown_asterisk.",
  },
  {
    from: "viewer_off_day",
    to: "viewer_after_last_day",
    treatment: "crossfade-body",
    reason: "Date rollover across viewer's last assigned day.",
  },
  {
    from: "viewer_off_day_pre",
    to: "viewer_unconfirmed",
    treatment: "crossfade-body",
    reason: "Doug toggles viewer.date_restriction between explicit and unknown_asterisk.",
  },
  {
    from: "viewer_off_day_pre",
    to: "viewer_after_last_day",
    treatment: "unreachable",
    reason:
      "Calendrical paradox: viewer's last day BEFORE viewer's first day. Sorted explicit days cannot satisfy both gates simultaneously.",
  },
  {
    from: "viewer_unconfirmed",
    to: "viewer_after_last_day",
    treatment: "crossfade-body",
    reason: "Doug fixes asterisk to explicit days; today is past the last assigned day.",
  },
];

/**
 * Sort two state kinds lexicographically and return them as a `:`-
 * separated key. Used to look up symmetric pair entries — `(a, b)` and
 * `(b, a)` produce the same key, which is what makes the matrix
 * symmetric without storing both directions.
 */
function pairKey(a: RightNowStateKind, b: RightNowStateKind): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * O(n)-built lookup map (n = 66). Computed once at module load.
 * Symmetric: `lookup.get(pairKey(a, b))` returns the entry's treatment
 * regardless of `(a, b)` argument order.
 */
const TREATMENT_LOOKUP: Map<string, TransitionTreatment> = (() => {
  const map = new Map<string, TransitionTreatment>();
  for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
    map.set(pairKey(entry.from, entry.to), entry.treatment);
  }
  return map;
})();

/**
 * Look up the matrix-defined treatment for a from→to pair. The matrix
 * is symmetric: `transitionTreatment(a, b) === transitionTreatment(b, a)`
 * for every pair in `RIGHT_NOW_TRANSITION_MATRIX`.
 *
 * Returns `null` for:
 *   - Diagonals (`from === to`): self-transitions are not §8.2 state
 *     pairs. The `show_day_n → show_day_n+1` rollover is a same-kind
 *     transition handled INSIDE the show_day_n payload (`n` increments),
 *     not as a kind-pair entry.
 *   - Unknown kinds: defends the helper against caller bugs (e.g., a
 *     state-kind typo that bypasses TypeScript's checking via `as any`).
 */
export function transitionTreatment(
  from: RightNowStateKind,
  to: RightNowStateKind,
): TransitionTreatment | null {
  if (from === to) return null;
  // Map.get returns undefined if either kind is unknown (caller bypassed
  // types via `as` / `as any`); coerce to null for the helper's typed
  // nullable return. Do NOT simplify — runtime defense against a
  // type-bypass is intentional and pinned by the
  // "returns null for unknown kinds" test in
  // tests/time/rightNowTransitions.test.ts.
  return TREATMENT_LOOKUP.get(pairKey(from, to)) ?? null;
}
