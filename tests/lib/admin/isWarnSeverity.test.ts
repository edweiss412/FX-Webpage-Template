/**
 * tests/lib/admin/isWarnSeverity.test.ts
 * (wizard-review-attention-menu spec §2.1 / §12.5a — Task 2)
 *
 * One predicate, seven sites. The #289 contract is that a warning counts as
 * warn-severity unless it explicitly says "info" — a persisted legacy row can
 * lack the field entirely. `summarizeDataGaps` (the badge) already honours
 * that; the six review-surface sites each inlined `severity === "warn"`, which
 * silently DROPS such a row. Every case below feeds a severity-less fixture to
 * one site and asserts it is treated as warn, so the badge and the surfaces can
 * never disagree again.
 *
 * Site (vii) is rendered markup and lives in Task 8's suite.
 */
import { describe, expect, it } from "vitest";
import { premiseHolds } from "@/tests/_shared/premise";
// Namespace import on purpose: the predicate does not exist yet, and a missing
// NAMED import fails at module load — which would red every case for the same
// uninformative reason instead of at each site's own assertion.
import * as gaps from "@/lib/parser/dataGaps";
import { sectionForWarning, sectionStatus, warningsBySection } from "@/lib/admin/step3SectionStatus";
import { visibleWarningRows } from "@/lib/admin/visibleWarningRows";
import { rowIsJudgment } from "@/lib/admin/step3Buckets";
import { isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import { guessSectionFromHeader } from "@/lib/admin/sectionSynonymGuess";
import { buildParseResult, stagedRow } from "@/tests/components/admin/wizard/_step3ReviewFixture";
import type { ParseWarning } from "@/lib/parser/types";

const { summarizeDataGaps } = gaps;
const isWarnSeverity = (w: Pick<ParseWarning, "severity">) =>
  (gaps as { isWarnSeverity?: (w: Pick<ParseWarning, "severity">) => boolean }).isWarnSeverity!(w);

/** A persisted legacy row: the severity KEY is absent, not undefined-valued. */
function legacy(code: string, extra: Partial<ParseWarning> = {}): ParseWarning {
  const w = { code, message: "", ...extra } as unknown as ParseWarning;
  premiseHolds("fixture has no severity key", !("severity" in w));
  return w;
}

describe("isWarnSeverity: one predicate, seven sites (spec §2.1)", () => {
  it("(i) the predicate is exported and summarizeDataGaps counts a severity-less gap code", () => {
    // red today: the predicate is inlined in summarizeDataGaps
    expect(typeof (gaps as { isWarnSeverity?: unknown }).isWarnSeverity).toBe("function");
    expect(summarizeDataGaps([legacy("UNKNOWN_FIELD")]).total).toBe(1);
    expect(isWarnSeverity(legacy("UNKNOWN_FIELD"))).toBe(true);
    expect(isWarnSeverity({ severity: "info" })).toBe(false);
  });

  it("(ii) warningsBySection routes it", () => {
    const m = warningsBySection([legacy("UNKNOWN_FIELD")], new Set(["warnings"]));
    expect(m.get("warnings")?.map((e) => e.index)).toEqual([0]);
  });

  it("(iii) sectionStatus flags it", () => {
    expect(sectionStatus([legacy("UNKNOWN_FIELD")])).toBe("flagged");
  });

  it("(iv) sectionForWarning header-guesses a severity-less UNKNOWN_SECTION_HEADER", () => {
    // "STAFF" (not "CREW") because the guess is an EXACT synonym allowlist and
    // "CREW" is not a key in it. The premise pins that, so a failure here is
    // the severity gate under test and never the synonym map moving.
    const guessed = guessSectionFromHeader("STAFF");
    premiseHolds("STAFF is a live synonym for a section", guessed !== null);
    const w = legacy("UNKNOWN_SECTION_HEADER", { rawSnippet: "STAFF" });
    expect(sectionForWarning(w)).toBe(guessed);
  });

  it("(v) visibleWarningRows excludes it from the info rows", () => {
    expect(visibleWarningRows([legacy("UNKNOWN_FIELD")], true)).toEqual([]);
  });

  it("(vi) rowIsJudgment is true for a severity-less ambiguity gap", () => {
    premiseHolds(
      "ROOM_HEADER_SPLIT_AMBIGUOUS is an ambiguity code",
      isAmbiguityCode("ROOM_HEADER_SPLIT_AMBIGUOUS"),
    );
    // A REAL staged row (parseResult.show present, so hasReviewablePreview is
    // true and rowNeedsLookPure does not short-circuit): the shared builders.
    const row = stagedRow(buildParseResult({ warnings: [legacy("ROOM_HEADER_SPLIT_AMBIGUOUS")] }));
    premiseHolds("row has a reviewable preview", row.parseResult?.show != null);
    expect(rowIsJudgment(row)).toBe(true);
  });
});
