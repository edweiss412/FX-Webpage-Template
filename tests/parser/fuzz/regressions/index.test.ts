// tests/parser/fuzz/regressions/index.test.ts
//
// Fast-check-FREE replay harness (spec §6). `REGRESSION_CASES` (cases.ts) starts
// EMPTY on purpose — this file is the machinery a future shrunk fast-check
// counterexample gets pinned into as a plain explicit input, not a fixture bank
// itself. Each entry replays through the SAME assertions its originating
// property used, with NO fast-check involved at replay time:
//   - `expect: "tier1"`         -> the never-throws/deterministic/shape/JSON
//                                  assertions the Tier-1 property runs
//                                  (robustness.fuzz.test.ts's `runTier1`).
//   - `expect: {model, dials}`  -> render -> parse -> checkPlantAndFind, the
//                                  same pipeline the Tier-2 property drives
//                                  (plantAndFind.fuzz.test.ts:29-32).
//
// Why the Tier-1 check is RE-IMPLEMENTED here instead of imported: this task's
// brief says to import `runTier1` from "../chaos", but chaos.ts exports only
// `chaosMarkdown` (verified by reading the file in full) — the actual
// `runTier1` lives in robustness.fuzz.test.ts:37. Importing a SIBLING .test.ts
// file would execute its top-level module code on import, which (a) imports
// `fast-check` — directly violating this file's fast-check-free replay
// contract — and (b) re-registers that file's own `describe`/`it` blocks into
// THIS suite, silently re-running the full randomized Tier-1 property (and its
// FUZZ-CONFIG console.log) every time this fast/deterministic replay file runs.
// So `runTier1` below is a byte-identical mirror of
// robustness.fuzz.test.ts:37-59, built only from fast-check-free primitives
// (`parseSheet`, `assertParsedSheetShape`, `payloadChanged`, `signalEq`) that
// this file already needs to import as siblings of the Tier-2 pipeline.
import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser";
import type { ParsedSheet } from "@/lib/parser/types";
import { assertParsedSheetShape } from "../shape";
import { payloadChanged, signalEq } from "../../mutation/oracle";
import { checkPlantAndFind } from "../groundTruth";
import { renderCase } from "../render";
import { validateGeneratedCase, type ShowModel } from "../model";
import type { DialChoices } from "../dials";
import { REGRESSION_CASES, type RegressionCase } from "./cases";

/**
 * Fast-check-free mirror of robustness.fuzz.test.ts's `runTier1`: never
 * throws, is deterministic (via the oracle's canon-based comparators, not
 * `fingerprint` — see robustness.fuzz.test.ts's comment on why), and returns a
 * structurally valid + JSON-round-trippable `ParsedSheet`. Throws on any
 * violation (same contract as the original).
 */
function runTier1(input: string): void {
  const a = parseSheet(input, "fuzz.md");
  const b = parseSheet(input, "fuzz.md");
  assertParsedSheetShape(a);
  assertParsedSheetShape(b);
  JSON.stringify(a); // JSON-round-trippable (also checked inside assertParsedSheetShape)

  if (payloadChanged(a, b) || !signalEq(a, b)) {
    throw new Error("parseSheet nondeterministic on identical input");
  }
}

/**
 * Replays one model-kind regression case through the exact Tier-2 call shape
 * plantAndFind.fuzz.test.ts:29-32 drives: honesty gate -> render -> parse ->
 * oracle. Throws (failing the containing test) on any oracle miss.
 */
function replayModelCase(model: ShowModel, dials: DialChoices): void {
  // A throw here is a case-authoring bug, not a parser finding: any case
  // promoted into REGRESSION_CASES must already be honest (spec §3.1) — the
  // same precondition plantAndFind.fuzz.test.ts:28-29 documents.
  validateGeneratedCase(model, dials);
  const parsed: ParsedSheet = parseSheet(renderCase(model, dials), "regression.md");
  const verdict = checkPlantAndFind(model, dials, parsed);
  if (!verdict.ok) {
    throw new Error(`plant-and-find misses:\n${verdict.misses.join("\n")}`);
  }
}

/** Dispatches one `RegressionCase` to the replay path matching its `expect` kind. */
function replay(c: RegressionCase): void {
  if (c.expect === "tier1") {
    runTier1(c.markdown);
  } else {
    replayModelCase(c.expect.model, c.expect.dials);
  }
}

describe("fuzz regressions replay harness", () => {
  it("REGRESSION_CASES exists (array) and every id is unique", () => {
    expect(Array.isArray(REGRESSION_CASES)).toBe(true);
    const ids = REGRESSION_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("replays every pinned regression case (vacuously passes while the array is empty)", () => {
    for (const c of REGRESSION_CASES) {
      replay(c);
    }
  });

  // ---------------------------------------------------------------------------
  // Harness self-check: TEMPORARY, hand-built anchors that live ONLY in this
  // test file (never in cases.ts) proving BOTH replay paths actually execute
  // end-to-end even while REGRESSION_CASES stays empty. Without this block, an
  // empty REGRESSION_CASES array would make the "replays every pinned case"
  // test above vacuously green regardless of whether `replay()` itself is
  // wired correctly.
  // ---------------------------------------------------------------------------

  describe("harness self-check (proves the replay path; REGRESSION_CASES itself stays empty)", () => {
    it("replays a tier1 markdown case", () => {
      const selfCheckTier1: RegressionCase = {
        id: "self-check-tier1",
        // Deliberately hostile/malformed (unbalanced pipes, control chars, no
        // real section structure) — Tier 1 makes no assumption about sheet
        // shape, so any input qualifies; the point is only that `runTier1`
        // executes end-to-end without throwing on non-honest input.
        markdown: "CREW\n||not a real table|||\n\u0000\u0001 stray control chars\n",
        expect: "tier1",
      };
      replay(selfCheckTier1);
    });

    it("replays a {model, dials} case through checkPlantAndFind", () => {
      // A copy (not an import — see file header on why sibling .test.ts files
      // are never imported here) of the fixed, hand-built 3-crew anchor from
      // plantAndFind.fuzz.test.ts's SABOTAGE_MODEL/SABOTAGE_DIALS (:65-89):
      // labeled crew header, no typo, dayRestriction off, no hotels/rooms,
      // recognized-vocab roles (V1/A2/LED) so the clean parse round-trips with
      // zero crew warnings.
      const selfCheckModel: ShowModel = {
        version: "v4",
        year: 2025,
        dates: { travelIn: "2025-04-01", showDays: ["2025-04-02"], travelOut: "2025-04-03" },
        crew: [
          { name: "Amara QAA Quinn", role: "V1", phone: "201-202-0001", email: "q0@fuzz.example" },
          { name: "Boris QAB Stone", role: "A2", phone: "203-204-0002", email: "q1@fuzz.example" },
          { name: "Clara QAC Vale", role: "LED", phone: "205-206-0003", email: "q2@fuzz.example" },
        ],
        hotels: [],
        rooms: [],
        venue: { name: "Vantage VAA Center", address: "123 Main St" },
        sections: ["crew", "dates", "venue"],
      };
      const selfCheckDials: DialChoices = {
        dateFormat: "iso",
        dimsFormat: "unit",
        crewSectionToken: "CREW",
        crewHeader: "labeled",
        sectionOrder: 0,
        blankPadding: 1,
        headerTypo: null,
        dayRestrictionOn: false,
      };
      const selfCheckCase: RegressionCase = {
        id: "self-check-model",
        // Unused for model-kind cases (see cases.ts header on the `markdown`
        // field's role) — kept only to satisfy `RegressionCase`'s flat shape.
        markdown: "",
        expect: { model: selfCheckModel, dials: selfCheckDials },
      };
      replay(selfCheckCase);
    });
  });
});
