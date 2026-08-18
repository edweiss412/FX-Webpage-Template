import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkUniversals } from "../../lib/specLint/universals";
import type { InventoryGroup } from "../../lib/specLint/types";

/**
 * Arm B — the `universal-claims` and `scope-fences` inventory groups (spec
 * `docs/superpowers/specs/2026-08-17-speclint-prose-consistency-arms.md` §3.4, §6).
 *
 * ALL inventory-membership assertions live here, including the group-side halves of
 * the word-form and heading fixtures whose finding-side halves live in
 * `universals.test.ts` (plan review R1 F1 ownership split).
 */

function groups(docText: string, kind: "spec" | "plan" = "spec"): InventoryGroup[] {
  return checkUniversals(parseDoc(docText), kind).inventory;
}

/** The doc lines of ONE group, or null when the group is absent entirely. Scoping to a
 * named group keeps a fixture from passing because the OTHER group happened to carry
 * the line (anti-tautology). */
function linesOf(docText: string, raw: string, kind: "spec" | "plan" = "spec"): number[] | null {
  const g = groups(docText, kind).find((x) => x.raw === raw);
  return g ? g.occurrences.map((o) => o.docLine) : null;
}

/** Resolve a fixture's expected line numbers from the fixture itself, never hardcoded. */
const at = (doc: string, ...needles: string[]): number[] => {
  const lines = doc.split("\n");
  return needles.map((n) => {
    const i = lines.findIndex((l) => l.includes(n));
    if (i === -1) throw new Error(`fixture does not contain: ${n}`);
    return i + 1;
  });
};

/** E4, verbatim from the defective revision `a045c53d1:235`
 * (`docs/superpowers/specs/ci/2026-08-14-guard-completeness-wave-design.md` §8), stale
 * after R1 repaired §4. Clause-initial universal INSIDE an "Out of scope" region. */
const E4_LINE =
  "- Any closing of the wiring-guard bypasses (§4 — ratified limits; reopening requires the promotion trigger).";

/** E5, verbatim from the defective revision `65641604f:235` (same doc, §7.1). Its
 * closing clause contradicted invariant 12's graduating-entry rule for entry C. */
const E5_LINE =
  "Every entry this wave resolves leaves the open queue with a durable archive record AND a `BACKLOG_GRADUATED` registry row in `tests/docs/_metaDeferralLedgerGraduation.test.ts`, in the same commit as its archive move; in-progress markers come off in the PR's last commit per invariant 12:";

describe("inventory group `universal-claims` (spec §3.4)", () => {
  it("collects every clause-start position the closed quantifier set admits", () => {
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "Every swapped control carries the token.", // line start
      "The ruling holds. Each site keeps its fill.", // after a period + space
      "One thing is settled; No site regresses.", // after a semicolon + space
      "The rule is this: All rows are pinned.", // after a colon + space
      "- Any closing of the bypass is out.", // behind a list marker
      "* Never a silent demote.", // behind the other list marker
      "**Nothing rewrites the source.**", // behind a bold prefix",
      "- **All twenty-one sites carry the swap.**", // list marker AND bold
      "",
    ].join("\n");
    expect(linesOf(doc, "universal-claims")).toEqual(
      at(
        doc,
        "Every swapped control",
        "Each site keeps",
        "No site regresses",
        "All rows are pinned",
        "Any closing of the bypass",
        "Never a silent demote",
        "Nothing rewrites",
        "All twenty-one sites",
      ),
    );
  });

  it("a word-form cardinal line IS inventoried though arm A stays silent (spec §7)", () => {
    // The group-side half of universals.test.ts's accept-set fixture: the same line,
    // no advisory, one inventory row.
    const doc = ["# Doc", "", "## A", "", "All twenty-one sites carry the swap.", ""].join("\n");
    expect(linesOf(doc, "universal-claims")).toEqual(at(doc, "All twenty-one sites"));
    expect(checkUniversals(parseDoc(doc), "spec").findings).toEqual([]);
  });

  it("a HEADING carrying a universal draws no inventory row and no advisory", () => {
    // The group-side half of universals.test.ts's heading-exclusion fixture.
    const doc = [
      "# Doc",
      "",
      "## Every one of the 21 swapped sites",
      "",
      "Body prose carrying no quantifier.",
      "",
      "## B",
      "",
      "The census carries 21 swapped sites.",
      "",
    ].join("\n");
    expect(linesOf(doc, "universal-claims")).toBeNull();
    expect(checkUniversals(parseDoc(doc), "spec").findings).toEqual([]);
  });

  // Each negative isolates ONE mechanism: the line would otherwise be accepted, so
  // deleting that mechanism fails exactly this row. A negative whose text the
  // recognizer could never match at all proves nothing (probed: the first draft's
  // table-row fixture `| Every site | note |` matched no clause start, so the
  // table-row exclusion was dead code beneath it).
  it.each([
    [
      "fenced",
      ["# Doc", "", "```", "Every swapped control carries the token.", "```", ""],
      "the fenced-line guard",
    ],
    [
      "table CONTENT row",
      ["# Doc", "", "| site | note |", "| --- | --- |", "| a | note: Every site is pinned |", ""],
      "the table-row exclusion (scope-fences KEEPS such a row; universal-claims does not)",
    ],
    [
      "quantifier mid-clause",
      ["# Doc", "", "The sweep closes All 21 gaps it names.", ""],
      "the clause-start anchor",
    ],
    [
      "lowercase clause start",
      ["# Doc", "", "every swapped control carries the token.", ""],
      "case sensitivity",
    ],
  ])("%s: excluded from universal-claims by %s", (_label, lines, _mechanism) => {
    expect(linesOf(lines.join("\n"), "universal-claims")).toBeNull();
  });
});

describe("inventory group `scope-fences` (spec §3.4)", () => {
  it("collects a depth-2 out-of-scope region's claim lines and stops at an equal-depth heading", () => {
    const doc = [
      "# Doc",
      "",
      "## 8. Out of scope",
      "",
      E4_LINE,
      "- Widening the reader `maxBuffer` (§6.1 — behavior change this entry does not need).",
      "",
      "## 9. Verification",
      "",
      "- This line is outside the region entirely.",
      "",
    ].join("\n");
    expect(linesOf(doc, "scope-fences")).toEqual(
      at(doc, "Any closing of the wiring-guard", "Widening the reader"),
    );
  });

  it("a deeper heading inside the region does not close it; its body lines stay in", () => {
    const doc = [
      "# Doc",
      "",
      "## 8. Out of scope",
      "",
      "- The first fenced item.",
      "",
      "### 8.1 A nested detail",
      "",
      "- The nested item, still fenced.",
      "",
      "## 9. Verification",
      "",
      "- Outside.",
      "",
    ].join("\n");
    // The nested HEADING line itself is excluded (a heading is a label); its body is not.
    expect(linesOf(doc, "scope-fences")).toEqual(
      at(doc, "The first fenced item", "The nested item"),
    );
  });

  it("a MATCHING heading nested inside an open region does not re-anchor it (R3 F2)", () => {
    // Re-anchoring would set the region depth to 3, so the NEXT depth-3 sibling would
    // close the parent early and silently drop its remaining lines (probed: 142 lines
    // lost on a one-rename edit). Deleting the no-re-anchor rule fails exactly this.
    const doc = [
      "# Doc",
      "",
      "## 8. Out of scope",
      "",
      "- Parent region line one.",
      "",
      "### 8.1 Out of scope for the sweep",
      "",
      "- Nested region line.",
      "",
      "### 8.2 A sibling that must not close the parent",
      "",
      "- Still inside the parent region.",
      "",
      "## 9. Verification",
      "",
      "- Outside.",
      "",
    ].join("\n");
    expect(linesOf(doc, "scope-fences")).toEqual(
      at(doc, "Parent region line one", "Nested region line", "Still inside the parent region"),
    );
  });

  it("a depth-1 close-out TITLE opens NO region (R1 F2 depth bound)", () => {
    // A title is a doc identity, not a fence region — a depth-1 match would own the
    // whole document (measured: 513 lines of one doc).
    const doc = [
      "# Ledger close-out for the wave",
      "",
      "Body prose that is not fenced by anything.",
      "",
      "More body prose.",
      "",
    ].join("\n");
    expect(linesOf(doc, "scope-fences")).toBeNull();
  });

  it("the closeout heading family opens a region too", () => {
    const doc = ["# Doc", "", "### 7.1 Ledger closeout", "", E5_LINE, ""].join("\n");
    expect(linesOf(doc, "scope-fences")).toEqual(at(doc, "Every entry this wave resolves"));
  });

  it.each([["## Non-goals"], ["## Non-goal"], ["## 7. Graduation"], ["## Ledger close-out"]])(
    "%s opens a region",
    (heading) => {
      const doc = ["# Doc", "", heading, "", "- A fenced claim line.", ""].join("\n");
      expect(linesOf(doc, "scope-fences")).toEqual(at(doc, "A fenced claim line"));
    },
  );

  it("structural lines are excluded; a table CONTENT row stays (R4)", () => {
    const doc = [
      "# Doc",
      "",
      "## 8. Out of scope",
      "",
      "- A claim line.",
      "",
      "---",
      "",
      "| surface | disposition |",
      "| --- | --- |",
      "| the wiring guard | deferred |",
      "",
      "```",
      "rg -n 'fenced content is not a claim'",
      "```",
      "",
    ].join("\n");
    // Excluded: blanks, the thematic break, the `| --- |` delimiter, both fence
    // delimiters and the fence content. Kept: the claim line and BOTH table content
    // rows — a fence claim can live in a table cell.
    expect(linesOf(doc, "scope-fences")).toEqual(
      at(doc, "- A claim line.", "| surface | disposition |", "| the wiring guard |"),
    );
  });
});

describe("both groups together (spec §6)", () => {
  it("the E4 and E5 escapes land in BOTH groups", () => {
    const doc = [
      "# Guard completeness wave",
      "",
      "## 7. Close-out",
      "",
      "### 7.1 Ledger closeout",
      "",
      E5_LINE,
      "",
      "## 8. Out of scope",
      "",
      E4_LINE,
      "",
    ].join("\n");
    const expected = at(doc, "Every entry this wave resolves", "Any closing of the wiring-guard");
    expect(linesOf(doc, "universal-claims")).toEqual(expected);
    expect(linesOf(doc, "scope-fences")).toEqual(expected);
  });

  it("groups are omitted entirely when empty, and a plan-kind doc yields none", () => {
    const quiet = ["# Doc", "", "## A", "", "Body prose with no quantifier at all.", ""].join("\n");
    expect(groups(quiet)).toEqual([]);
    expect(groups("")).toEqual([]);

    const rich = ["# Doc", "", "## 8. Out of scope", "", "- Any closing of the bypass.", ""].join(
      "\n",
    );
    expect(groups(rich).map((g) => g.raw)).toEqual(["universal-claims", "scope-fences"]);
    expect(groups(rich, "plan")).toEqual([]);
  });

  it("an occurrence carries the line's own text as its snippet", () => {
    const doc = ["# Doc", "", "## A", "", "Every swapped control carries the token.", ""].join(
      "\n",
    );
    const g = groups(doc).find((x) => x.raw === "universal-claims")!;
    expect(g.occurrences).toHaveLength(1);
    expect(g.occurrences[0]!.snippet).toBe("Every swapped control carries the token.");
    expect(g.occurrences[0]!.column).toBe(1);
  });
});
