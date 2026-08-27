/**
 * The committed residue for the `TASK_AC_UNCLAIMED` corpus equality (AC-6).
 *
 * Spec §7 limit 8: this list IS the documented-limits record for the unclaimed
 * arm. It is not a ledger row and nothing is filed for it. It holds only the
 * pairs no disposition can honestly express, it may shrink as owning arcs
 * resolve their own plans, and it may never grow to make a red go away.
 *
 * Every row carries a QUOTATION and the line it came from, and
 * `acUnclaimedCorpus.test.ts` asserts that line of that plan actually contains
 * that text. The quotation alone is not the gate, because quoting a real line
 * proves the quotation is real and says nothing about the row's claim — an
 * `unsettled` row for a criterion its plan assigns to Task 10 could quote that
 * very assignment. Each kind therefore carries an executable PREDICATE, and the
 * two point opposite ways:
 *
 * - `unsettled` — NO line of that plan carries the id beside an owner word. That
 *   is the classification rule ("the plan's prose names the id and states the
 *   task, step or procedure that owns it") made mechanical, and its absence is
 *   what the row asserts.
 * - `owner-inexpressible` — the mirror. The quoted line DOES carry the id beside
 *   an owner, the row names that owner, and the disposition grammar must REJECT
 *   `(discharged by <owner>)` after the owner is normalised. Normalisation is
 *   load-bearing: `app-e2e-batch2` line 28 carries the verbatim substring
 *   `Task 10.`. Note the dot is NOT what normalisation defends against: `ident`
 *   permits a trailing dot, so `Task 10.` is expressible raw. The forms it
 *   decides are `Task 10,` and `Task 10;` — rejected raw, accepted normalised —
 *   which is what an author produces by copying an owner out of a
 *   comma-separated clause.
 */
export type ResidueRow =
  | {
      kind: "unsettled";
      plan: string;
      id: string;
      /** what was looked for, and the nearest candidate the search turned up. */
      searched: string;
      /** the line that came closest, quoted, and where it is. */
      nearMiss: string;
      nearMissAt: number;
    }
  | {
      kind: "owner-inexpressible";
      plan: string;
      id: string;
      /** the sentence that settles the criterion, quoted, and where it is. */
      quote: string;
      quotedAt: number;
      /** the owner that sentence names, verbatim. */
      owner: string;
    };

export const AC_UNCLAIMED_RESIDUE: ResidueRow[] = [
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/2026-08-10-help-tour-hydration-fix.md",
    id: "AC-4",
    searched:
      "whole-id AC-4 occurs once in the plan, at its own declaration. The nearest candidate is Task 2's step 5, which rewrites the workflow header AC-4 is about but never writes the id.",
    nearMiss: "Header comments: rewrite",
    nearMissAt: 37,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md",
    id: "AC-B6",
    searched:
      "whole-id AC-B6 occurs once in the whole plan unit and zero times in its closeout. The nearest candidate matches the content and never writes the id.",
    nearMiss: "enrol `filing.ts` in the source-mutation registry",
    nearMissAt: 76,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md",
    id: "AC-C1",
    searched:
      "one hit in the plan unit, at the declaration. The nearest candidate matches the content and never writes the id.",
    nearMiss: "backfill dispositions",
    nearMissAt: 80,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md",
    id: "AC-D1",
    searched:
      "one hit in the plan unit, at the declaration. The nearest candidate matches the content and never writes the id.",
    nearMiss: "docs fan-out",
    nearMissAt: 84,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md",
    id: "AC-7",
    searched:
      "whole-id AC-7 occurs once, at its declaration. The nearest candidate is Task 2 step 2.4a, which cites the same spec section but links through the section number rather than the id.",
    nearMiss: "Fix the `GalleryLightbox` comment in THIS commit",
    nearMissAt: 160,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md",
    id: "AC-8",
    searched:
      "whole-id AC-8 occurs once, at its declaration under the acceptance-criteria heading. The nearest candidate matches the content and never writes the id.",
    nearMiss: "Documented limits, here-string peer ledger row",
    nearMissAt: 761,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/ci/2026-08-26-speclint-dispatch-gates.md",
    id: "AC-8",
    searched:
      "whole-id AC-8 occurs exactly once in that plan, at its own declaration. No sentence anywhere names the task, step or procedure that owns it, so there is no candidate to quote but the declaration itself.",
    nearMiss: "both ledger rows are archived with",
    nearMissAt: 45,
  },
  // The three criteria the split left behind. `a673d040c` moved the AC arm's
  // tasks into the follow-on plan and took their markers with them, so the
  // criteria stayed declared in a plan that no longer schedules them. The
  // sentence that settles them names the ARM, never the id, which is why they
  // are `unsettled` rather than `owner-inexpressible`.
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/ci/2026-08-26-speclint-dispatch-gates.md",
    id: "AC-4",
    searched:
      "the AC arm was split into docs/superpowers/plans/ci/2026-08-26-speclint-ac-unclaimed-arm.md and this plan's markers no longer cite AC-4. The sentence that settles it names the arm and not the id.",
    nearMiss: "is **ratified and unimplemented**, and it is not in this plan",
    nearMissAt: 30,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/ci/2026-08-26-speclint-dispatch-gates.md",
    id: "AC-5",
    searched:
      "as AC-4 above: split out with the arm, and the settling sentence names the arm rather than the id.",
    nearMiss: "is **ratified and unimplemented**, and it is not in this plan",
    nearMissAt: 30,
  },
  {
    kind: "unsettled",
    plan: "docs/superpowers/plans/ci/2026-08-26-speclint-dispatch-gates.md",
    id: "AC-6",
    searched:
      "as AC-4 above: split out with the arm, and the settling sentence names the arm rather than the id.",
    nearMiss: "is **ratified and unimplemented**, and it is not in this plan",
    nearMissAt: 30,
  },
  // ---- settled, and the closed owner set cannot say so ----------------------
  {
    kind: "owner-inexpressible",
    plan: "docs/superpowers/plans/2026-08-16-server-action-origin-sweep.md",
    id: "AC-8",
    quote: "AC-8 → no task (a spec-time derivation, re-exercised by Task 5",
    quotedAt: 341,
    owner:
      "no task (a spec-time derivation, re-exercised by Task 5 hitting the exemption path against real code)",
  },
  {
    kind: "owner-inexpressible",
    plan: "docs/superpowers/plans/ci/2026-08-21-shell-attached-redirection-target.md",
    id: "AC-7",
    quote: "| AC-7 | score at or above floor, empty unaccepted set | Step 4 |",
    quotedAt: 701,
    owner: "Step 4",
  },
];
