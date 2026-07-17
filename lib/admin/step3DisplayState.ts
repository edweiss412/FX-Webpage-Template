import type { Step3ManifestStatus } from "@/components/admin/wizard/Step3Review";

/**
 * lib/admin/step3DisplayState.ts (spec §4.2 — the single, total, ordered
 * display-state derivation for a Step-3 row).
 *
 * This is the structural defense for the display-derivation surface (spec §4.2
 * / §12): ONE first-match-wins algorithm, proven total by the §4.2.2 matrix
 * test. Every later display decision (badge, checkbox visibility, Review→
 * affordance) routes through the state this returns — never a per-cell re-derive.
 */
export type Step3DisplayState =
  | "needs_review_other" // rule 1 — hard_failed / live_row_conflict / discard_retryable (inline controls)
  | "needs_review_reapply" // rule 2 — staged+failure, well-formed parseResult (Review→ modal)
  | "needs_review_no_details" // rule 2 — staged+failure, null/corrupt parseResult (inline Re-scan/Ignore)
  | "set_aside" // rule 3a — permanent_ignore / defer_until_modified
  | "skipped" // rule 3b — skipped_non_sheet
  | "live" // rule 4 — crew-visible linked show
  | "ready_to_publish" // rule 5 — pre-CAS session-linked, published=false, publish_intent
  | "held" // rule 6 — session-linked, not Live, not Ready-to-publish
  | "ready"; // rule 7 — pre-finalize, no linked show, clean

export type DisplayDerivationInput = {
  status: Step3ManifestStatus;
  lastFinalizeFailureCode: string | null;
  hasWellFormedParseResult: boolean;
  // The row's linked show, resolved by the caller via the session-provenance
  // join OR the existing-show branch (spec §4.3). null when neither matches.
  linkedShow: { published: boolean; archived: boolean } | null;
  publishIntent: boolean; // manifest.publish_intent (default false pre-finalize)
  sessionLinked: boolean; // true iff linkedShow came from the session-provenance join
};

const HARD_BLOCK = new Set<Step3ManifestStatus>([
  "hard_failed",
  "live_row_conflict",
  "discard_retryable",
]);
const SET_ASIDE = new Set<Step3ManifestStatus>(["permanent_ignore", "defer_until_modified"]);

// First-match-wins ordered algorithm (spec §4.2). Total: the final `ready`
// fallthrough guarantees exactly one state per row. Proven by the §4.2.2 matrix
// test (tests/admin/step3DisplayState.test.ts).
export function deriveStep3DisplayState(input: DisplayDerivationInput): Step3DisplayState {
  // 1. hard blocks outrank everything (even a defensively-linked show).
  if (HARD_BLOCK.has(input.status)) return "needs_review_other";
  // 2. re-apply blocked rows.
  if (input.status === "staged" && input.lastFinalizeFailureCode !== null) {
    return input.hasWellFormedParseResult ? "needs_review_reapply" : "needs_review_no_details";
  }
  // 3a. resolved / set aside; 3b. skipped (distinct copy, spec §4.2 rule 3).
  if (SET_ASIDE.has(input.status)) return "set_aside";
  if (input.status === "skipped_non_sheet") return "skipped";
  // 4. Live: any crew-visible linked show (session-provenance OR existing-show branch).
  const crewVisible = input.linkedShow?.published === true && input.linkedShow.archived === false;
  if (crewVisible) return "live";
  // 5. pre-CAS checked (session-linked only): a first-seen show created Held that
  //    CAS will flip to Live on Finish. Distinct from Held.
  if (
    input.sessionLinked &&
    input.linkedShow &&
    !input.linkedShow.published &&
    !input.linkedShow.archived &&
    input.publishIntent
  ) {
    return "ready_to_publish";
  }
  // 6. Held: any linked show that is neither crew-visible-live (Rule 4) nor a
  //    session-created ready-to-publish (Rule 5) is Held, regardless of
  //    provenance (session-linked OR existing-show branch). Was
  //    `input.sessionLinked && input.linkedShow` — that guard let an existing
  //    archived/held-with-blocker show fall through to Rule 7 "ready", a green
  //    badge on a publish-blocked show (spec 2026-07-16-wizard-blocker-inline-
  //    resolution §4.1). Only `linkedShow===null` now reaches Rule 7.
  if (input.linkedShow) return "held";
  // 7. Ready (pre-finalize): no linked show, clean row.
  return "ready";
}
