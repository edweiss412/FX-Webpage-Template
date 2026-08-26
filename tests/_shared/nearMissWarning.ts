// The near-miss warning PAIR, shared by every suite that renders a candidate.
//
// ONE source for the candidate-present and candidate-absent cases, read by the per-show suite,
// the wizard suite, and the row-label-gate suite. Spec §7.3.
//
// Both halves come from the PRODUCER, not from object surgery. The obvious construction is to
// copy the real warning and delete its `candidate` key; that copy keeps the "; looks like '...'"
// clause in `message`, which a real candidate-less emission never has, because
// `emitUnknownField` builds the message from a two-arm ternary on the candidate
// (lib/parser/warnings.ts:421-423). Calling the producer twice makes the absent case
// byte-faithful to a pre-detector row.
import { readFileSync } from "node:fs";

import { parseSheet } from "@/lib/parser";
import { labelFromRawSnippet, valueFromRawSnippet } from "@/lib/parser/rawSnippet";
import type { ParseWarning } from "@/lib/parser/types";
import { emitUnknownField, newAggregator } from "@/lib/parser/warnings";

/** A committed fixture with FIVE UNKNOWN_FIELD rows, so one row disappearing does not empty it. */
const FIXTURE = "fixtures/shows/exporter-xlsx/consultants.md";

export type NearMissPair = {
  /** As the detector emits it today: carries `candidate`. */
  readonly withCandidate: ParseWarning;
  /** As a pre-detector row was: no `candidate` key, and no "looks like" clause either. */
  readonly withoutCandidate: ParseWarning;
};

export function nearMissWarningPair(): NearMissPair {
  const parsed = parseSheet(readFileSync(FIXTURE, "utf8"), FIXTURE);
  const real = parsed.warnings.find((w) => w.code === "UNKNOWN_FIELD");

  // PREMISE ON ITSELF. Without these, a fixture change makes every suite reading this helper
  // vacuously green, and the failure would surface three files away as a confusing null-render
  // assertion instead of here as the thing that actually broke.
  if (!real) throw new Error(`${FIXTURE} produced no UNKNOWN_FIELD warning`);
  if (typeof real.candidate !== "string" || real.candidate.trim().length === 0)
    throw new Error(`${FIXTURE}'s first UNKNOWN_FIELD carries no usable candidate`);

  // The value may itself contain " | ", so use the shared readers rather than a naive split.
  const key = labelFromRawSnippet(real.rawSnippet);
  const value = valueFromRawSnippet(real.rawSnippet);
  if (key === null || value === null)
    throw new Error(`${FIXTURE}'s first UNKNOWN_FIELD has no "<label> | <value>" rawSnippet`);

  const block = String(real.blockRef?.kind ?? "");
  const agg = newAggregator();
  emitUnknownField(agg, { block, kind: block, key, value });
  const emitted = agg.warnings[0];
  if (!emitted) throw new Error("emitUnknownField produced no warning");

  return { withCandidate: real, withoutCandidate: emitted };
}
