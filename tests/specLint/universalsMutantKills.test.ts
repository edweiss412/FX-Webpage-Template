import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkUniversals } from "../../lib/specLint/universals";
import type { Finding, InventoryGroup } from "../../lib/specLint/types";

/**
 * Boundary and seam behavior of `checkUniversals` (spec §3.2, §3.4).
 *
 * The fixtures in `universals.test.ts` and `universalsInventory.test.ts` pin the GATES —
 * what the accept-set admits and what each exclusion rejects. This file pins the parts a
 * gate-shaped fixture cannot reach: section arithmetic, the probe scan's extent, span
 * boundaries at the exact edge, index origins, and the message's own coordinates. Every
 * case names the behavior it protects, and each was written against a surviving mutant of
 * the source-mutation gate — the assertion is the behavior, the mutant is the proof that
 * nothing else was already asserting it.
 */

const ADVISORY = "ENUMERATED_UNIVERSAL_NO_PROBE";

const run = (docText: string, kind: "spec" | "plan" = "spec") =>
  checkUniversals(parseDoc(docText), kind);

const advisories = (docText: string): Finding[] =>
  run(docText).findings.filter((f) => f.code === ADVISORY);

const group = (docText: string, raw: string): InventoryGroup | undefined =>
  run(docText).inventory.find((g) => g.raw === raw);

/** 1-based line of the first line containing `needle`, derived from the fixture itself. */
const lineOf = (doc: string, needle: string): number => {
  const i = doc.split("\n").findIndex((l) => l.includes(needle));
  if (i === -1) throw new Error(`fixture does not contain: ${needle}`);
  return i + 1;
};

describe("the value bound admits exactly 2 (spec §3.2 gate 2)", () => {
  it("a population of 2 is a population, not status text", () => {
    // The bound is `>= 2`, so 2 itself must fire: raising it to 3, or making the
    // rejection `<= 2`, silences a real two-row population.
    const doc = [
      "# Doc",
      "## A",
      "The ruling covers all 2 sites without exception.",
      "## B",
      "The census carries 2 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });
});

describe("the message's own coordinates (spec §3.2)", () => {
  const doc = [
    "# Doc",
    "## A",
    "As the census shows, all 21 sites carry the swap.",
    "## B",
    "The census carries 21 rows, one per site.",
  ].join("\n");

  it("column points at the start of the matched claim, not at the line start", () => {
    const [f] = advisories(doc);
    const claim = doc.split("\n")[lineOf(doc, "As the census shows") - 1]!;
    expect(f!.column).toBe(claim.indexOf("all 21") + 1);
  });

  it("detail names the evidence line by number AND quotes that exact line", () => {
    const [f] = advisories(doc);
    const evidenceLine = lineOf(doc, "The census carries 21 rows");
    expect(f!.detail).toContain(`line ${evidenceLine}`);
    expect(f!.detail).toContain("The census carries 21 rows, one per site.");
  });

  it("the snippet is capped, and the cap is 140 characters", () => {
    // A cap of 141 would emit one more character than the record and the message
    // formula agree on.
    const long = "All 21 sites carry the swap, " + "and the reason is stated at length. ".repeat(8);
    expect(long.length).toBeGreaterThan(200);
    const d = ["# Doc", "## A", long, "## B", "The census carries 21 rows."].join("\n");
    const [f] = advisories(d);
    expect(f!.message).toContain(long.slice(0, 140));
    expect(f!.message).not.toContain(long.slice(0, 141));
  });

  it("the evidence quoted is the FIRST other-section occurrence, not the last", () => {
    const d = [
      "# Doc",
      "## A",
      "Every one of the 21 sites lands there.",
      "## B",
      "The FIRST other section carries 21 rows.",
      "## C",
      "The LAST other section also carries 21 rows.",
    ].join("\n");
    const [f] = advisories(d);
    expect(f!.detail).toContain("The FIRST other section carries 21 rows.");
    expect(f!.detail).not.toContain("The LAST other section");
  });
});

describe("section arithmetic (spec §3.2 gates 4 and 5)", () => {
  it("a cardinal ON a heading line belongs to THAT heading's section", () => {
    // Membership is "nearest preceding heading, inclusive of the heading itself". Read
    // exclusively, the heading's own cardinal falls back into the previous section — here
    // the claim's own — and the evidence disappears.
    const doc = [
      "# Doc",
      "## A",
      "Every one of the 21 sites lands there.",
      "## 21 census rows",
      "Body prose.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });

  it("an EQUAL-depth sibling heading ends the section the probe scan covers", () => {
    // The scan must stop at the next heading of depth <= its own. If an equal-depth
    // sibling does not close it, a probe command in the NEXT section silences a claim
    // that has none of its own.
    const doc = [
      "# Doc",
      "## 5.1 The claim",
      "Every one of the 21 sites lands there.",
      "## 5.2 The probe",
      "Counted with `rg -n text components/`.",
      "## 6 Census",
      "The census carries 21 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });

  it("the probe scan covers the section's LAST line", () => {
    // The command sits on the final line before the next heading. An extent short by one
    // line, or a loop that stops before `end`, misses it and emits a false advisory.
    const doc = [
      "# Doc",
      "## A",
      "Every one of the 21 sites lands there.",
      "Counted with `rg -n text components/`.",
      "## B",
      "The census carries 21 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("evidence on a section's LAST line keeps that section as its owner", () => {
    // The owner is read at the evidence line itself. Read one line later, the evidence
    // is attributed to the NEXT section — here the claim's own — and vanishes.
    const doc = [
      "# Doc",
      "## A",
      "Filler prose.",
      "## B",
      "The census carries 21 rows.",
      "## C",
      "Every one of the 21 sites lands there.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });

  it("a table row is not enumeration evidence", () => {
    // Gate 4 reads non-table lines only, matching gate 1's own table exclusion: a
    // cardinal that appears solely in a table cell does not establish the population.
    const doc = [
      "# Doc",
      "## A",
      "Every one of the 21 sites lands there.",
      "## B",
      "| count | note |",
      "| --- | --- |",
      "| 21 | the census |",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("a cardinal at the very START of a line is indexed as evidence", () => {
    // The evidence scan begins at offset 0. Beginning one character in silently drops
    // every line that opens with its number.
    const doc = [
      "# Doc",
      "## A",
      "Every one of the 21 sites lands there.",
      "## B",
      "21 rows are listed below, one per site.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });
});

describe("the pre-heading preamble (spec §3.2)", () => {
  it("a claim on the document's FIRST line is read", () => {
    const doc = [
      "Every one of the 21 sites lands there.",
      "",
      "## B",
      "The census carries 21 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });

  it("evidence on the document's FIRST line is indexed", () => {
    const doc = [
      "# 21 census rows",
      "## A",
      "Every one of the 21 sites lands there.",
      "## B",
      "Body prose with no cardinal.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });

  it("a probe command on the FIRST line covers a preamble claim", () => {
    // With no preceding heading the owning section starts at line 1. Starting at line 2
    // skips exactly one line, and it is the only line a preamble claim can hide a
    // command on above itself.
    const doc = [
      "Counted with `rg -n text components/`.",
      "Every one of the 21 sites lands there.",
      "## B",
      "The census carries 21 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("a claim and its evidence BOTH in the preamble are one section, so nothing fires", () => {
    // Both resolve to the same no-heading sentinel. Two different sentinels would make
    // the preamble differ from itself and emit on a claim whose population is stated
    // three lines above it.
    const doc = [
      "Every one of the 21 sites lands there.",
      "The census carries 21 rows.",
      "",
      "## B",
      "Body prose with no cardinal.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });
});

describe("the probe-command fence families (spec §3.2 gate 5)", () => {
  const withFence = (info: string): string =>
    [
      "# Doc",
      "## A",
      "Every one of the 21 sites lands there.",
      "```" + info,
      "rg -n text components/",
      "```",
      "## B",
      "The census carries 21 rows.",
    ].join("\n");

  it.each([
    ["sh", 0],
    ["bash", 0],
    ["", 0],
  ])("a `%s` fence whose first token is a command silences the claim", (info, expected) => {
    expect(advisories(withFence(info))).toHaveLength(expected);
  });

  it("a fence with a NON-command info string is not a probe, whatever it contains", () => {
    // The accept-set is `sh`, `bash`, and info-less. A `ts` block holding a command-shaped
    // line is sample code, and treating it as a probe would silence a real claim.
    expect(advisories(withFence("ts"))).toHaveLength(1);
  });

  it("a fence's info string is read from the fence's own content line", () => {
    // Off-by-one here reads a neighbouring line's fence state, which for the fixture
    // above is `undefined` — the command becomes invisible and the claim fires falsely.
    expect(advisories(withFence("sh"))).toHaveLength(0);
    expect(advisories(withFence("bash"))).toHaveLength(0);
  });
});

describe("inline-span boundaries are inclusive at BOTH edges (spec §3.2 gate 2)", () => {
  it("a match starting exactly at the span's first character is inside it", () => {
    const doc = [
      "# Doc",
      "## A",
      "The banner reads `all 21 rows` verbatim.",
      "## B",
      "The census carries 21 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("a match ending exactly at the span's last character is inside it", () => {
    // The span content is the match itself, so both edges are the equality case at once.
    const doc = [
      "# Doc",
      "## A",
      "The banner reads `all 21` verbatim.",
      "## B",
      "The census carries 21 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("a match adjacent to a span but outside it still fires", () => {
    // The exclusion must not swallow a neighbour: this is the premise that makes the two
    // cases above about the BOUNDARY rather than about spans existing at all.
    const doc = [
      "# Doc",
      "## A",
      "The `banner` says all 21 sites carry the swap.",
      "## B",
      "The census carries 21 rows.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(1);
  });
});

describe("inventory boundaries (spec §3.4)", () => {
  it("the bold prefix accepted before a quantifier is at most two asterisks", () => {
    // Exactly the instrument's recognizer. A bold-italic `***Every` is outside it and
    // draws silence, which is a documented bound rather than an accident.
    const doc = ["# Doc", "## A", "***Every swapped control carries the token.***"].join("\n");
    expect(group(doc, "universal-claims")).toBeUndefined();
    const two = ["# Doc", "## A", "**Every swapped control carries the token.**"].join("\n");
    expect(group(two, "universal-claims")?.occurrences.map((o) => o.docLine)).toEqual([3]);
  });

  it("a universal-claims column points at the quantifier, not at the match start", () => {
    const doc = ["# Doc", "## A", "- Any closing of the bypass is out of scope."].join("\n");
    const occ = group(doc, "universal-claims")!.occurrences[0]!;
    expect(occ.column).toBe(doc.split("\n")[2]!.indexOf("Any") + 1);
  });

  it("a universal-claims row on the document's FIRST line is collected", () => {
    const doc = ["Every swapped control carries the token.", "", "## A", "Body."].join("\n");
    expect(group(doc, "universal-claims")?.occurrences.map((o) => o.docLine)).toEqual([1]);
  });

  it("a scope-fences occurrence is anchored at column 1", () => {
    // The group's unit is the LINE, so its column is the line's own start; anything else
    // would point into the middle of a line the group does not claim to have parsed.
    const doc = ["# Doc", "## 8. Out of scope", "- A fenced claim line."].join("\n");
    expect(group(doc, "scope-fences")!.occurrences[0]!.column).toBe(1);
  });

  it("a thematic break may be indented at most three spaces before it stops being one", () => {
    // Four spaces makes it an indented code block in CommonMark, so it is ordinary
    // content and STAYS in the region; three spaces is still a break and is excluded.
    const four = ["# Doc", "## 8. Out of scope", "- A claim line.", "    ---"].join("\n");
    expect(group(four, "scope-fences")!.occurrences.map((o) => o.docLine)).toEqual([3, 4]);
    const three = ["# Doc", "## 8. Out of scope", "- A claim line.", "   ---"].join("\n");
    expect(group(three, "scope-fences")!.occurrences.map((o) => o.docLine)).toEqual([3]);
  });
});
