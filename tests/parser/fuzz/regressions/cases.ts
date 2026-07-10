// tests/parser/fuzz/regressions/cases.ts
//
// Pinned deterministic regression cases (spec §6). Any future shrunk
// fast-check counterexample — from the Tier-1 chaos/model-rendered property
// (robustness.fuzz.test.ts) or the Tier-2 plant-and-find property
// (plantAndFind.fuzz.test.ts) — gets promoted here as a PLAIN EXPLICIT INPUT:
// no fast-check arbitrary, seed, or shrinking involved in ever replaying it
// again. `index.test.ts` replays every entry unconditionally on every test run,
// so once a counterexample lands here it can never silently regress.
//
// Starts EMPTY on purpose: this milestone ships the replay MACHINERY, not a
// fixture bank. `index.test.ts`'s own self-check block proves both replay
// paths work end-to-end without needing a real pinned case yet.
//
// `markdown` is populated for BOTH case kinds so the flat `RegressionCase`
// shape below never has an absent/optional field, but the two kinds use it
// differently:
//   - `expect: "tier1"`        -> `markdown` IS the executed input, passed
//                                 verbatim to the Tier-1 replay assertions.
//   - `expect: {model, dials}` -> `markdown` is NOT executed; the harness
//                                 re-derives the actual parser input via
//                                 `renderCase(model, dials)` (the same call
//                                 the Tier-2 property makes), so a model-kind
//                                 case's `markdown` is purely a human-readable
//                                 snapshot for at-a-glance debugging.
import type { ShowModel } from "../model";
import type { DialChoices } from "../dials";

export type RegressionCase = {
  /** Unique, human-readable identifier (e.g. an issue/PR reference). */
  id: string;
  /** See file header: executed input for "tier1", snapshot-only for model cases. */
  markdown: string;
  expect: "tier1" | { model: ShowModel; dials: DialChoices };
};

export const REGRESSION_CASES: ReadonlyArray<RegressionCase> = [];
