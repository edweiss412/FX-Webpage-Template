/**
 * BL-CATALOG-PARTITION-WARNING-CLASS — the warning universe, enumerated by the
 * catalog and cross-checked against the source scanner.
 *
 * THE DEFECT. "Which codes are parse warnings" was INFERRED, never declared: the
 * gallery derived it by filtering `INTERNAL_CODE_ENUMS` for a
 * `parse_warnings.code` provenance string. That producer recognises a warning by
 * TYPE, which is strong — but it is a scanner, and a scanner is blind wherever
 * the type is erased (an `any`, a higher-order factory, a code constructed
 * through a helper it cannot follow). A code the scanner misses is simply absent
 * from the gallery, and nothing anywhere says it should have been there.
 *
 * THE INVERSION. The catalog now DECLARES the partition on each row, and the
 * scanner becomes a cross-check rather than the source. Two directions, each
 * failing by name:
 *
 *   constructed-but-unlisted   the scanner sees a code the catalog does not
 *                              class as a parse warning — the gallery would
 *                              silently drop it
 *   listed-but-never-constructed  the catalog claims a class no source ever
 *                              constructs — a row asserting a fiction
 *
 * CATALOG-INTERNAL, so no §12.4 lockstep. The shipped precedent is
 * `triggerContext` (lib/messages/catalog.ts): a field the catalog carries for
 * its own consumers, absent from the §12.4 prose. The entry predicted lockstep
 * cost for a prose-visible field; this design deliberately avoids it, and
 * `tests/cross-cutting/codes.test.ts` staying green is the proof that x1 is
 * untouched.
 */
import { describe, expect, it } from "vitest";

import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import {
  type WarningClass,
  catalogParseWarningCodes,
  crossCheckWarningPartition,
  scannerParseWarningCodes,
} from "@/lib/messages/warningPartition";

/** A catalog fixture: just enough shape for the partition functions to read. */
const row = (code: string, warningClass: "parse_warning" | "general"): MessageCatalogEntry =>
  ({
    code,
    warningClass,
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  }) as MessageCatalogEntry;

const catalogOf = (...rows: MessageCatalogEntry[]): Record<string, MessageCatalogEntry> =>
  Object.fromEntries(rows.map((r) => [r.code, r]));

describe("warning partition — catalog declares, scanner cross-checks", () => {
  it("premise: both sides are non-empty on the real tree", () => {
    // Either side coming back empty would make every real-tree assertion below
    // vacuously true — an empty set is a subset of everything, and a cross-check
    // over two empty sets reports perfect agreement. This is the row that makes
    // a broken scanner or an unbackfilled catalog loud rather than green
    // (tests/_shared/premise.ts shape).
    expect(scannerParseWarningCodes().length).toBeGreaterThan(10);
    expect(catalogParseWarningCodes().length).toBeGreaterThan(10);
  });

  it("every catalog row declares a class — the union is total", () => {
    // Read through a WIDENED type on purpose. `warningClass` is required, so on
    // the literal TypeScript narrows this filter to `never` and proves the point
    // statically — which is the stronger guarantee and why the field is not
    // optional. This row still runs, because the static proof covers only what
    // the literal declares: a catalog assembled or widened through a cast is
    // exactly where a missing class would reappear, unseen by the compiler.
    const rows: MessageCatalogEntry[] = Object.values(
      MESSAGE_CATALOG as Record<string, MessageCatalogEntry>,
    );
    const undeclared = rows
      .filter((e) => (e.warningClass as WarningClass | undefined) === undefined)
      .map((e) => e.code);
    expect(
      undeclared,
      "the partition is a CLOSED binary union over every row; an absent value is a third state " +
        "the design does not have, and it would read as 'general' by accident",
    ).toEqual([]);
  });

  it("the real tree agrees in both directions", () => {
    const { constructedButUnlisted, listedButNeverConstructed } = crossCheckWarningPartition();
    expect(
      constructedButUnlisted,
      "a source constructs these as parse warnings, but the catalog does not class them so — " +
        "the gallery would drop them silently",
    ).toEqual([]);
    expect(
      listedButNeverConstructed,
      "the catalog classes these as parse warnings, but no source ever constructs one — " +
        "a row asserting a class its source does not have",
    ).toEqual([]);
  });

  it("fails BY NAME on a planted constructed-but-unlisted mismatch", () => {
    const result = crossCheckWarningPartition({
      scanner: ["PARSE_A", "PARSE_B"],
      catalog: catalogOf(row("PARSE_A", "parse_warning"), row("PARSE_B", "general")),
    });
    expect(result.constructedButUnlisted).toEqual(["PARSE_B"]);
    expect(result.listedButNeverConstructed).toEqual([]);
  });

  it("fails BY NAME on a planted listed-but-never-constructed mismatch", () => {
    const result = crossCheckWarningPartition({
      scanner: ["PARSE_A"],
      catalog: catalogOf(row("PARSE_A", "parse_warning"), row("GHOST", "parse_warning")),
    });
    expect(result.listedButNeverConstructed).toEqual(["GHOST"]);
    expect(result.constructedButUnlisted).toEqual([]);
  });

  it("reports BOTH directions at once rather than stopping at the first", () => {
    // A cross-check that returned on its first mismatch would drip one finding
    // per run, which is the same retail-convergence failure the class-sweep rule
    // exists to stop.
    const result = crossCheckWarningPartition({
      scanner: ["PARSE_A", "MISSED"],
      catalog: catalogOf(
        row("PARSE_A", "parse_warning"),
        row("MISSED", "general"),
        row("GHOST", "parse_warning"),
      ),
    });
    expect(result.constructedButUnlisted).toEqual(["MISSED"]);
    expect(result.listedButNeverConstructed).toEqual(["GHOST"]);
  });

  it("a scanner code with no catalog row at all is reported, not skipped", () => {
    // The blind spot a naive `catalog[code]?.warningClass !== "parse_warning"`
    // filter would create is the opposite one: an absent row is falsy either
    // way, so an unmatched scanner code must surface as a mismatch rather than
    // quietly agreeing with nothing.
    const result = crossCheckWarningPartition({
      scanner: ["ORPHAN"],
      catalog: catalogOf(row("PARSE_A", "parse_warning")),
    });
    expect(result.constructedButUnlisted).toEqual(["ORPHAN"]);
  });
});
