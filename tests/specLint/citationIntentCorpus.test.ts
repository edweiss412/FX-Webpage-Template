import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
import { idPatterns } from "../../lib/specLint/citationIntent";
import { runLint } from "../../lib/specLint/run";
import type { FileResolver, Finding } from "../../lib/specLint/types";
import { CORPUS, type CorpusRow } from "./fixtures/citationIntent/corpus";

/**
 * The ground-truth pin (spec §6, AC-1). Each row's expected tier comes from the
 * plan's committed table — measured against the merged sync-log plan, which is
 * the only oracle that says which citation was WRONG — and the fixture is built
 * to realize that structure. Validating the arm against the citations that
 * actually burned review rounds is the backlog row's explicit instruction; a
 * suite written from the corrected plan would inherit the same blind spot the
 * R1 human repair did.
 */

const resolverFor = (row: CorpusRow): FileResolver => ({
  listTrackedFiles: () => [row.citedPath],
  readFileLines: (p) => (p === row.citedPath ? [...row.file] : null),
});

/** The doc line, and the 1-based column of the citation span's content. */
function docLineFor(row: CorpusRow): { text: string; column: number } {
  const cite = `${row.citedPath}:${row.citedStart}${row.citedEnd === undefined ? "" : `-${row.citedEnd}`}`;
  const prefix = `Sites list names ${row.ids.map((i) => `\`${i}\``).join(" and ")} at `;
  return { text: `${prefix}\`${cite}\`.`, column: prefix.length + 2 };
}

function intentFindings(row: CorpusRow): Finding[] {
  const { text } = docLineFor(row);
  const result = runLint(
    { text: text + "\n", repoRelPath: "docs/x.md", kind: "plan", kindSource: "explicit" },
    resolverFor(row),
  );
  return result.findings.filter((f) => f.check === "citations");
}

describe("citation intent — ground-truth corpus (spec §2.1-§2.2, AC-1)", () => {
  it("the corpus carries the tier counts the measurement fixed", () => {
    // The table is the oracle; if a row is added or re-tiered without the
    // measurement changing, this is the tripwire.
    const wrong = CORPUS.filter((r) => r.kind === "wrong");
    expect(wrong.filter((r) => r.expect === "unmatched")).toHaveLength(10);
    expect(wrong.filter((r) => r.expect === "absent")).toHaveLength(5);
    expect(CORPUS.filter((r) => r.kind === "escape")).toHaveLength(2);
    expect(CORPUS.filter((r) => r.kind === "future")).toHaveLength(2);
    expect(new Set(CORPUS.map((r) => r.key)).size).toBe(CORPUS.length);
  });

  it.each(CORPUS.filter((r) => r.kind === "wrong").map((r) => [r.key, r] as const))(
    "wrong citation %s fires at its measured tier",
    (_key, row) => {
      const { column } = docLineFor(row);
      const expectedCode =
        row.expect === "absent" ? "CITATION_SYMBOL_ABSENT" : "CITATION_SYMBOL_UNMATCHED";
      expect(intentFindings(row)).toEqual([
        expect.objectContaining({
          check: "citations",
          code: expectedCode,
          severity: "advisory",
          docLine: 1,
          column,
        }),
      ]);
    },
  );

  it.each(CORPUS.filter((r) => r.kind === "escape").map((r) => [r.key, r] as const))(
    "vocabulary-sharing sibling %s is a documented escape, not a finding",
    (_key, row) => {
      // Spec §1.1 item 2 / §8 item 1: these two are undetectable by ANY content
      // comparison, because the WRONG file boundary-matches a prose identifier
      // inside the window. The premise proves the fixture actually reproduces
      // that structure — without it, a fixture that merely failed to match
      // anything would pass this zero-finding assertion for the wrong reason.
      const lo = Math.max(1, row.citedStart - 5);
      const hi = Math.min(row.file.length, (row.citedEnd ?? row.citedStart) + 5);
      const patterns = row.ids.flatMap(idPatterns);
      const windowHits = row.file
        .slice(lo - 1, hi)
        .filter((line) => patterns.some((p) => p.test(line))).length;
      premise(`${row.key}: the wrong file boundary-matches an id inside the window`, windowHits, 0);

      expect(intentFindings(row)).toEqual([]);
    },
  );

  it.each(CORPUS.filter((r) => r.kind === "negative").map((r) => [r.key, r] as const))(
    "correct citation %s stays clean",
    (_key, row) => {
      expect(intentFindings(row)).toEqual([]);
    },
  );

  it.each(CORPUS.filter((r) => r.kind === "future").map((r) => [r.key, r] as const))(
    "future-code citation %s reports ABSENT as an ADVISORY, never a hard finding",
    (_key, row) => {
      const { column } = docLineFor(row);
      const findings = intentFindings(row);
      expect(findings).toEqual([
        expect.objectContaining({
          code: "CITATION_SYMBOL_ABSENT",
          severity: "advisory",
          docLine: 1,
          column,
        }),
      ]);
      // The severity law of spec §1.1 item 1, asserted on the class the measured
      // 15-of-135 false-fire floor comes from: escalating this tier is what
      // makes the whole arm get waived.
      expect(findings.every((f) => f.severity === "advisory")).toBe(true);
    },
  );
});
