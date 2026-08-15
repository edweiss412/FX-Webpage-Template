// tests/parser/leadingColumnAutocorrect.test.ts
// Spec §6: uniformly-empty leading column = drag-shift export artifact; the inverse
// transform is total, so correct + warn. Failure modes caught: data-only trigger
// (61 corpus false positives, probe §13.C); ratio trigger (East Coast partial runs);
// missing structured autocorrect field; payload not actually restored.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { normalizeLeadingColumn } from "@/lib/parser/leadingColumnNormalize";
import { payloadOf } from "@/tests/parser/mutation/oracle";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { canonicalSectionKind } from "@/lib/parser/sectionKind"; // branch-2 helper (r6: openerCell needs it)

const shifts = (md: string, name: string) =>
  parseSheet(md, name).warnings.filter((w) => w.code === "LEADING_COLUMN_AUTOCORRECTED");

/** Prefix an empty cell to EVERY row of ONE LOGICAL SECTION (columnShift shape,
 *  operators.ts:144). Retro F1: the operator's unit is the LOGICAL section - rows up to
 *  the next recognized section-opening header WITHIN the pipe block - not the whole
 *  contiguous block. A helper that shifts the whole block leaves 46 of the 211 ledger
 *  holes unreachable (mutants shift one section inside a multi-section block). */
function shiftLogicalSection(md: string, start: number): string {
  const lines = md.split("\n");
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.trimStart().startsWith("|")) break;
    if (i > start && openerCell(l) !== null) break; // next logical section begins
    lines[i] = l.replace(/^(\s*)\|/, "$1|  |");
  }
  return lines.join("\n");
}
/** Retro r5: the opener may sit in cell 1 (unshifted) OR cell 2 (columnShift moved it
 *  right - a shifted section's own header row leads empty). Check cell 1; when cell 1
 *  is empty, check cell 2. Returns the canonical kind or null. */
function openerCell(line: string): string | null {
  const parts = line.split("|");
  const c1 = (parts[1] ?? "").trim();
  if (c1 !== "") return canonicalSectionKind(c1);
  return canonicalSectionKind((parts[2] ?? "").trim());
}

describe("LEADING_COLUMN_AUTOCORRECTED (spec §6)", () => {
  const path = "fixtures/shows/exporter-xlsx/east-coast.md";
  const md = readFileSync(path, "utf8");
  const firstSection = md.split("\n").findIndex((l) => l.startsWith("|"));

  it("premise: corpus fires zero clean; the mutated section genuinely leads empty on every row", () => {
    expect(shifts(md, path)).toEqual([]);
    const mutated = shiftLogicalSection(md, firstSection);
    premiseHolds("section was shifted", mutated !== md);
  });

  it("corrects: payload equals unshifted baseline, one warning with structured autocorrect", () => {
    const mutated = shiftLogicalSection(md, firstSection);
    expect(payloadOf(parseSheet(mutated, path))).toEqual(payloadOf(parseSheet(md, path)));
    const w = shifts(mutated, path);
    expect(w).toHaveLength(1);
    expect(w[0]!.autocorrect).toEqual({
      subject: null,
      corrections: [{ detected: "empty leading column", corrected: "shifted left" }],
    });
  });

  it("partial leading-empty runs never fire (East Coast's widest run is 19 empty-leading rows in a 24-row block, probe §13.C)", () => {
    // Whole-diff review r1, Finding 2 (BL-GUARD-PREMISE-REACHABILITY): the discriminating
    // condition used to live only in this test's TITLE, so a fixture regenerated without a
    // partial run would leave the case green while it asserted nothing about partial runs.
    // Measured here instead. The premise is on the RATIO, not the row count: what makes this
    // fixture a real adversary is a block that leads empty on 19 of 24 rows, i.e. 79% - past
    // any plausible majority/ratio threshold, yet correctly silent because the trigger is
    // uniformity, not proportion. A larger but low-ratio run elsewhere in the file (35 of 127)
    // would not exercise that, so counting rows alone would let the fixture stop adversarial
    // while the premise still read green. Measured across blocks rather than at a pinned index
    // so an edit that MOVES the run still passes and only one that REMOVES it fails.
    const lines = md.split("\n");
    let sharpestPartialPct = 0;
    for (let i = 0; i < lines.length; ) {
      if (!lines[i]!.startsWith("|")) {
        i++;
        continue;
      }
      let j = i;
      let emptyLeading = 0;
      while (j < lines.length && lines[j]!.startsWith("|")) {
        if ((lines[j]!.split("|")[1] ?? "").trim() === "") emptyLeading++;
        j++;
      }
      // Partial means SOME rows lead empty but not all - a uniformly-empty block is the
      // trigger shape, not the partial shape, and would belong to a different case.
      if (emptyLeading > 0 && emptyLeading < j - i) {
        sharpestPartialPct = Math.max(
          sharpestPartialPct,
          Math.floor((emptyLeading * 100) / (j - i)),
        );
      }
      i = j;
    }
    premise(
      "east-coast still carries a HIGH-ratio partial leading-empty run",
      sharpestPartialPct,
      75,
    );
    expect(shifts(md, path)).toEqual([]); // the clean fixture IS the partial-run carrier
  });

  // Review round 1, Critical #1: a data row's second cell can coincidentally canonicalize
  // to a section kind (a contact's title, a driver's name, a room booked as a gear item),
  // and the pre-fix `opener()` treated that alone as a shifted-section header. Nothing here
  // is shifted, so both probes must produce zero warnings and an unchanged document.
  it("does not treat an ordinary data cell that canonicalizes as a section label for an opener (review Critical #1, probe A)", () => {
    const md = [
      "| CONTACTS | Name | Phone |",
      "| --- | --- | --- |",
      "| Production | Jane | 555-0100 |",
      "|  | Venue | 555-0111 |",
      "|  | Client | 555-0122 |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toEqual([]);
    expect(result.corrected).toEqual(md);
  });

  it("does not treat a room-family label sitting in a GEAR row's second cell as an opener (review Critical #1, probe B)", () => {
    const md = [
      "| GEAR | Item | Qty |",
      "| --- | --- | --- |",
      "| Audio | Mixer | 1 |",
      "|  | BREAKOUT 2 - SALON C | 4 |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toEqual([]);
    expect(result.corrected).toEqual(md);
  });

  // Review round 1, Important #2: inside a genuinely shifted section, EVERY row leads
  // empty, so the pre-fix cell-2 opener test ran on every data row, not just the header -
  // a data row whose own second cell canonicalized (here, "Driver") split one shifted
  // section into two spans and doubled the warning count. Spec §6 mandates exactly one.
  it("emits exactly one warning for one drag-shifted section, even when a data row's own second cell matches a section label (review Important #2)", () => {
    const md = [
      "|  | CREW | Role | Call |",
      "|  | --- | --- | --- |",
      "|  | Doug | LD | 08:00 |",
      "|  | Driver | Van | 09:00 |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toHaveLength(1);
    expect(result.corrected).toEqual(
      [
        "| CREW | Role | Call |",
        "| --- | --- | --- |",
        "| Doug | LD | 08:00 |",
        "| Driver | Van | 09:00 |",
      ].join("\n"),
    );
  });

  // Review round 2, Critical #1 (still open after round 1): round 1's corroboration
  // ("next line is its own colon-dash alignment row") accepted a LONE `-` placeholder cell
  // as a full alignment row, shaped on the real HOTEL block at
  // fixtures/shows/exporter-xlsx/fixed-income.md:44-51, which already carries lone `-`
  // cells. Nothing here is shifted, so this must produce zero warnings and an unchanged
  // document. The width-delta fix rejects it because the "DATES" row is the SAME width as
  // the block's other rows, not one wider.
  it("does not treat a lone dash placeholder cell as a shifted section's own alignment row (review round 2, Critical #1)", () => {
    const md = [
      "| HOTEL | RESERVATION \\#1 | RESERVATION \\#2 |",
      "| :---: | :---: | :---: |",
      "|  | Hotel Name / Address | Park Hyatt Chicago |",
      "|  | DATES | 10/18/25 |",
      "|  | - | - |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toEqual([]);
    expect(result.corrected).toEqual(md);
  });

  // Review round 2, missing positive-direction test: round 1's three regression tests only
  // pinned the SUPPRESSION direction, so a denylist and even deleting the cell-2 branch
  // outright passed all three. This is the shape that requires it: an INNER (mid-block)
  // section - shaped on the real consultants.md:41-49 TRANSPORTATION/Driver block - whose
  // own header ("Driver") owns no alignment row of its own, so it can ONLY be detected via
  // the cell-2 branch's width-delta corroboration (the row is exactly one cell wider than
  // the block's unshifted TRANSPORTATION header/alignment rows). Checked: with the cell-2
  // branch's width check replaced by `return false`, this test fails (0 warnings instead of
  // 1, document unchanged) while the three suppression tests above and the original corpus
  // test all still pass - confirmed by running the mutated function locally before writing
  // this comment.
  it("detects and corrects a shifted INNER section with no alignment row of its own, via the cell-2 width-delta (review round 2, positive direction)", () => {
    const md = [
      "| TRANSPORTATION | NAME | PHONE |",
      "| :---: | :---: | :---: |",
      "|  | Driver | Carlos Pineda | 610-618-0111 |",
      "|  | Vehicle | 16' Box Truck Rental |  |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toHaveLength(1);
    expect(result.corrected).toEqual(
      [
        "| TRANSPORTATION | NAME | PHONE |",
        "| :---: | :---: | :---: |",
        "| Driver | Carlos Pineda | 610-618-0111 |",
        "| Vehicle | 16' Box Truck Rental |  |",
      ].join("\n"),
    );
  });

  // Review round 3, Critical #1 (third narrowing, P-ESC): the width-delta was measured with
  // a naive `line.split("|")`, which counts an escaped in-cell pipe `\|` as a delimiter and
  // inflates a row's count by exactly the +1 the corroboration reads as proof of a shift.
  // Shaped on the real HOTEL block at fixtures/shows/exporter-xlsx/fixed-income.md, which
  // legitimately carries several continuation rows with an empty leading cell (a multi-line
  // reservation, not a shift). Nothing here is shifted, so this must produce zero warnings
  // and an unchanged document.
  it("does not let an escaped in-cell pipe inflate a row's width into a false +1 (review round 3, Critical #1, P-ESC)", () => {
    const md = [
      "| HOTEL | RESERVATION \\#1 | RESERVATION \\#1 | RESERVATION \\#2 | RESERVATION \\#2 |",
      "| :---: | :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address | Hotel Name / Address | Hotel Name / Address | Hotel Name / Address |",
      "|  | Park Hyatt Chicago 800 N Michigan Ave | Park Hyatt Chicago | - | - |",
      "|  | DATES | Holiday Inn Express \\| Dubois | Check In Date | Check Out Date |",
      "|  | 10/18/25 | 10/22/25 | - | - |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toEqual([]);
    expect(result.corrected).toEqual(md);
  });

  // Control for P-ESC: the identical block with the escaped pipe replaced by ordinary text.
  // This must ALSO be zero warnings, which proves the escaped pipe - not the block's shape,
  // its blank leading cells, or the "DATES" label - is the operative ingredient of P-ESC.
  it("P-ESC control: the same block without the escaped pipe is already clean", () => {
    const md = [
      "| HOTEL | RESERVATION \\#1 | RESERVATION \\#1 | RESERVATION \\#2 | RESERVATION \\#2 |",
      "| :---: | :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address | Hotel Name / Address | Hotel Name / Address | Hotel Name / Address |",
      "|  | Park Hyatt Chicago 800 N Michigan Ave | Park Hyatt Chicago | - | - |",
      "|  | DATES | Holiday Inn Express and Dubois | Check In Date | Check Out Date |",
      "|  | 10/18/25 | 10/22/25 | - | - |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toEqual([]);
    expect(result.corrected).toEqual(md);
  });

  // Review round 3, Fix-Diff Analysis 5: the committed tests did not distinguish shipped
  // from "any delta >= 1" (accept a wider-by-two-or-more row as an opener too). An unshifted
  // empty-leading row whose cell 2 canonicalizes and is +2 wide (not +1) must NOT be treated
  // as an opener - shipped requires an EXACT +1 match.
  it("does not accept an empty-leading row that is +2 wide as an opener (review round 3, any-delta discriminator)", () => {
    const md = [
      "| VENUE | Name | Phone |",
      "| --- | --- | --- |",
      "| Production | Jane | 555-0100 |",
      "|  | DATES | extra1 | extra2 | extra3 |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toEqual([]);
    expect(result.corrected).toEqual(md);
  });

  // Review round 3, Fix-Diff Analysis 5: the committed tests did not distinguish shipped
  // ("most recently seen unshifted row") from "compare against the block's first row". A
  // block whose first row (DATES, 2 cells) is narrower than a later unshifted section in the
  // SAME block (CLIENT, 4 cells) makes the two references disagree: a shifted VENUE row that
  // is one wider than CLIENT (5 cells) matches "most recent" but not "block's first"
  // (5 !== 2+1). Only "most recent" detects and restores it.
  it("uses the most recently seen unshifted row as the reference, not the block's first row (review round 3, block-first-row discriminator)", () => {
    const md = [
      "| DATES | Info |",
      "| :---: | :---: |",
      "| Set | 10/10 |",
      "| CLIENT | Name | Phone | Notes |",
      "| :---: | :---: | :---: | :---: |",
      "|  | VENUE | 123 Main St | Chicago | IL |",
    ].join("\n");
    const result = normalizeLeadingColumn(md);
    expect(result.warnings).toHaveLength(1);
    expect(result.corrected).toEqual(
      [
        "| DATES | Info |",
        "| :---: | :---: |",
        "| Set | 10/10 |",
        "| CLIENT | Name | Phone | Notes |",
        "| :---: | :---: | :---: | :---: |",
        "| VENUE | 123 Main St | Chicago | IL |",
      ].join("\n"),
    );
  });
});
