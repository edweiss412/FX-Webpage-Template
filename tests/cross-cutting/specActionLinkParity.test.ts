/**
 * §12.4's action-link claim, made executable.
 *
 * WHY THIS EXISTS, and the finding that produced it. The `RESYNC_QUALITY_REGRESSED`
 * row said "No action link." while `lib/adminAlerts/alertActions.ts` had been
 * building one for that code the whole time — and pointing it at the wrong
 * section besides. Nothing caught it because nothing READS that sentence. The
 * x1 catalog-parity gate compares four fields (`dougFacing`, `crewFacing`,
 * `followUp`, `helpfulContext`); the description column, where the action-link
 * claim lives, is not extracted at all. So the claim could say anything.
 *
 * That is the shape worth generalizing: a prose claim with no executor does not
 * decay gracefully, it decays silently, and the reader who trusts it is the one
 * who pays. This file gives the sentence an executor.
 *
 * WHAT IT CHECKS, in both directions — the negative half is the load-bearing one,
 * because the defect above was a row claiming LESS than the code does:
 *
 *   1. A code that builds an action link may not say "No action link."
 *   2. A code that says "No action link." may not appear in ALERT_ACTION_CODES.
 *   3. A row naming an anchor (`Action link: … (#warnings)`) must name the anchor
 *      the builder actually produces.
 *
 * CONSEQUENCE BOUND. Every §12.4 row is either checked or reported — a row whose
 * description matches no known claim shape is listed by name in the unparsed
 * set, never silently skipped, so the guard cannot quietly cover nothing. It
 * does not attempt to read intent from free prose beyond the two fixed phrases
 * above; a row that phrases its claim some third way shows up as unparsed and is
 * a copy edit, not a defect in the alert.
 *
 * THREAT MODEL. Ordinary authoring drift — someone edits the mapping and not the
 * spec, or the reverse. Not adversarial obfuscation: a row deliberately worded
 * to evade the two phrases is out of scope and files to documented limits.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ALERT_ACTIONS, ALERT_ACTION_CODES } from "@/lib/adminAlerts/alertActions";
import { codeFromCell, splitMarkdownRow } from "@/scripts/extract-spec-codes";

const SPEC = join(
  __dirname,
  "..",
  "..",
  "docs",
  "superpowers",
  "specs",
  "2026-04-30-fxav-crew-pages-v1.md",
);

const NO_LINK = "No action link.";
/** `Action link: … (\`#anchor\`)` — the shape the amended RESYNC row uses. */
const ANCHOR_CLAIM = /Action link:[^.]*?\(`#([a-z0-9-]+)`\)/;

/** How many action-bearing rows may describe their link in prose this guard
 *  cannot read. A ceiling rather than an exact count: reconciling a row must
 *  never fail the build, and adding one must. */
const UNREADABLE_CEILING = 12;

type Row = { code: string; description: string };

/** Every §12.4 row, split with the generator's own parser. */
function specRows(): Row[] {
  const rows: Row[] = [];
  for (const line of readFileSync(SPEC, "utf8").split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = splitMarkdownRow(line);
    const code = codeFromCell(cells[0] ?? "");
    if (code === null) continue;
    const description = cells[1] ?? "";
    if (description === "") continue;
    rows.push({ code, description });
  }
  return rows;
}

/** The anchor a builder actually produces, or null when it builds no link. */
function builtAnchor(code: string): string | null {
  const build = ALERT_ACTIONS[code as (typeof ALERT_ACTION_CODES)[number]];
  if (build === undefined) return null;
  const link = build({} as never, { slug: "any-show" } as never);
  if (link === null) return null;
  const hash = link.href.indexOf("#");
  return hash === -1 ? "" : link.href.slice(hash + 1);
}

describe("§12.4 action-link claims match the shipped alert actions", () => {
  const rows = specRows();

  it("PREMISE: the parse reached real rows, including the one that was wrong", () => {
    // A parser that silently matched nothing would make every assertion below
    // vacuous — which is the same failure this guard exists to catch, turned on
    // itself. The named row is the one whose stale claim motivated the file.
    expect(rows.length).toBeGreaterThan(200);
    expect(rows.some((r) => r.code === "RESYNC_QUALITY_REGRESSED")).toBe(true);
    expect(ALERT_ACTION_CODES.length).toBeGreaterThan(0);
  });

  it("no row claims 'No action link.' while its code builds one", () => {
    const liars = rows
      .filter((r) => r.description.includes(NO_LINK) && builtAnchor(r.code) !== null)
      .map((r) => r.code);
    expect(
      liars,
      "§12.4 says these have no action link; lib/adminAlerts/alertActions.ts builds one",
    ).toEqual([]);
  });

  it("every code that names an anchor names the one its builder produces", () => {
    const mismatched = rows
      .map((r) => {
        const claimed = ANCHOR_CLAIM.exec(r.description)?.[1];
        if (claimed === undefined) return null;
        const built = builtAnchor(r.code);
        return built === claimed
          ? null
          : `${r.code}: §12.4 says #${claimed}, code builds #${built}`;
      })
      .filter((x): x is string => x !== null);
    expect(mismatched).toEqual([]);
  });

  it("every §12.4 row with an action-link claim is one this guard can read", () => {
    // The consequence bound, executable. A row is COVERED when it makes one of
    // the two recognized claims, and UNCOVERED otherwise — and an uncovered row
    // that nonetheless builds a link is reported, so silence is never mistaken
    // for agreement. Rows that build no link and claim nothing are simply out of
    // scope: there is no claim to contradict.
    const unreadable = rows
      .filter((r) => builtAnchor(r.code) !== null)
      .filter((r) => !r.description.includes(NO_LINK) && !ANCHOR_CLAIM.test(r.description))
      .map((r) => r.code);
    // Not asserted empty: most action-bearing rows predate the convention and
    // describe their link in free prose. The count is PINNED as a CEILING, so
    // adding a new unreadable row fails while reconciling one is always allowed.
    // (`toBe(unreadable.length)` was the first draft of this line and asserts
    // nothing whatsoever — the exact tautology this suite keeps finding
    // elsewhere, written here by the person finding it.)
    expect(
      unreadable.length,
      `action-bearing rows whose claim this guard cannot read: ${unreadable.join(", ")}`,
    ).toBeLessThanOrEqual(UNREADABLE_CEILING);
    expect(
      unreadable.includes("RESYNC_QUALITY_REGRESSED"),
      "the amended row must state its claim in the readable form",
    ).toBe(false);
  });
});
