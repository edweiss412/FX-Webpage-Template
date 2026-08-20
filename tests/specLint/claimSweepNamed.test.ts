/**
 * Task 3 — the named-claim half: exact identity, span exclusion, and the
 * incident replay (spec §3.2, AC-2, AC-4).
 *
 * The RED case is the `c272ebed3` replay and it is expect-a-REPORT by
 * construction. The substring and span cases are expect-CLEAN and would pass
 * VACUOUSLY against an unimplemented half — there are no occurrences to assert
 * on — so they are GREEN-phase pins rather than the red.
 *
 * THE ARM DOES NOT ESTABLISH THAT THE REPAIR CHANGED THE CLAIM, and its finding
 * text must not say it did. Which identifier had its claim changed is the
 * AUTHOR's declaration: it is a semantic fact about the repair and no rule over
 * the diff recovers it. The attribution assertion below runs over EVERY emitted
 * finding rather than a sample, because the occurrence assertions structurally
 * cannot kill a wrong attribution — the occurrences are right either way.
 */
import { describe, expect, it } from "vitest";
import { claimSweep, type RepairRecord } from "../../lib/specLint/claimSweep";
import {
  C272_COLLATERAL_OUTSIDE,
  C272_INSIDE_SPANS,
  C272_OUTSIDE_SPANS,
  COLLATERAL_IDENTIFIER,
  INCIDENT_IDENTIFIER,
  INCIDENT_IDENTIFIER_TRUNCATED,
  INCIDENT_PLAN,
  INCIDENT_SPEC,
  incidentDocs,
  repairSpans,
  siteKey,
} from "./claimSweepFixtures";
import { ABSENT_IDENTIFIER } from "./claimSweepLiterals";

const SPANS = repairSpans("c272ebed3");

function named(
  claimAbout: string,
  spans: ReadonlyMap<string, ReadonlySet<number>> = SPANS,
): RepairRecord {
  return { superseded: null, replacement: null, claimAbout, touchedLines: spans };
}

function keys(
  findings: readonly { docPath?: string; docLine: number; column: number }[],
): string[] {
  return findings
    .map((f) => siteKey({ docPath: f.docPath ?? "", docLine: f.docLine, column: f.column }))
    .sort();
}

const unswept = (fs: ReturnType<typeof claimSweep>) =>
  fs.filter((f) => f.code === "CLAIM_SITE_UNSWEPT");

describe("claim sweep — the named-claim half", () => {
  describe("the incident replay (AC-4): c272ebed3 re-classified PublishedReviewModal.tsx:964", () => {
    const findings = claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER));

    it("yields exactly the FOUR sites outside the repair's spans, as a SET", () => {
      // Nine occurrences across the arc minus the five inside the repair's own
      // hunks. Asserted as a set: a count is defeated by substitution.
      expect(keys(unswept(findings))).toEqual([...C272_OUTSIDE_SPANS].sort());
    });

    it("carries the identifier and an advisory severity on every finding", () => {
      expect(findings.length).toBeGreaterThan(0); // premise: the run produced findings
      expect(findings.every((f) => f.severity === "advisory")).toBe(true);
      expect(findings.every((f) => f.code === "CLAIM_SITE_UNSWEPT")).toBe(true);
      expect(findings.every((f) => f.token === INCIDENT_IDENTIFIER)).toBe(true);
    });
  });

  describe("the repair's OWN new claim draws nothing; the same identifier elsewhere reports", () => {
    it("excludes every occurrence inside the repair's hunks", () => {
      const reported = new Set(
        keys(claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER))),
      );
      for (const inside of C272_INSIDE_SPANS) expect(reported.has(inside)).toBe(false);
      // Attributable rather than the shape of an empty read: those five ARE
      // real occurrences, so with the spans emptied all nine report.
      const noSpans = claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER, new Map()));
      expect(keys(unswept(noSpans)).length).toBe(9);
      expect(new Set(keys(unswept(noSpans)))).toEqual(
        new Set([...C272_OUTSIDE_SPANS, ...C272_INSIDE_SPANS]),
      );
    });

    it("reports nothing at all when whole-file spans swallow every occurrence", () => {
      // The other direction: an adapter supplying whole-file spans returns
      // zero. Between this and the empty-span case above, a span bug in either
      // direction is caught rather than only the one that under-reports.
      const whole = new Map<string, ReadonlySet<number>>(
        incidentDocs("c272ebed3").map((d) => [
          d.path,
          new Set(Array.from({ length: (d.lines ?? []).length }, (_, i) => i + 1)),
        ]),
      );
      expect(
        unswept(claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER, whole))),
      ).toEqual([]);
    });
  });

  describe("the identifier is matched EXACTLY, never as a SUBSTRING", () => {
    it("reports nothing for a one-character truncation that matches nine lines as a substring", () => {
      // `…tsx:96` is one deleted character from `…tsx:964`. It occurs ZERO
      // times exactly and on NINE lines as a substring, so a substring
      // implementation emits nine wrong advisories from an ordinary CLI typo.
      const findings = claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER_TRUNCATED));
      expect(unswept(findings)).toEqual([]);
    });

    it("reports the untruncated identifier over the SAME corpus (one variable: the identifier)", () => {
      const findings = claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER));
      expect(keys(unswept(findings))).toEqual([...C272_OUTSIDE_SPANS].sort());
    });

    it("treats a path separator as a boundary, so a declared TAIL still matches", () => {
      // The identifier is a path SUFFIX in every one of its occurrences —
      // `components/admin/showpage/PublishedReviewModal.tsx:964` — so `/` must
      // not count as identifier continuation or the replay returns nothing.
      // The fully-qualified form finds the same nine sites at earlier columns.
      const full = claimSweep(
        incidentDocs("c272ebed3"),
        named("components/admin/showpage/PublishedReviewModal.tsx:964", new Map()),
      );
      expect(unswept(full)).toHaveLength(9);
    });
  });

  describe("a COLLATERAL identifier is the author's to get right (spec §5 item 8)", () => {
    it("reports its three outside occurrences, all TRUE about the occurrence", () => {
      // `HoverHelp.tsx:562` sits on BOTH the removed and the added line of the
      // repair's hunk while staying in exactly the classification it started
      // in. Declaring it produces advisories that are TRUE about the
      // occurrences and WRONG about the repair — which is precisely why the
      // wording attributes the changed claim to the DECLARATION.
      const findings = claimSweep(incidentDocs("c272ebed3"), named(COLLATERAL_IDENTIFIER));
      expect(keys(unswept(findings))).toEqual([...C272_COLLATERAL_OUTSIDE].sort());
    });
  });

  describe("ATTRIBUTION: the declaration identified the changed claim, never the arm", () => {
    // A string-presence assertion over EVERY emitted finding. The occurrence
    // assertions above cannot kill a wrong attribution, because the occurrences
    // are correct whatever the wording says.
    const everyFinding = [
      ...unswept(claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER))),
      ...unswept(claimSweep(incidentDocs("c272ebed3"), named(COLLATERAL_IDENTIFIER))),
      ...unswept(claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER, new Map()))),
    ];

    it("has findings to assert over (premise)", () => {
      expect(everyFinding.length).toBe(16);
    });

    // ASSERTED BY EQUALITY, NOT BY PRESENCE, and that is the whole point of the
    // mutant this case was written against. A `toMatch` presence assertion is
    // satisfied by every SUPERSET of the required wording, so the mutant that
    // appends "and the arm verified the repair changed it" -- the exact claim
    // this finding is forbidden from making -- passed the entire suite. Presence
    // is not adequacy, applied to a string. The expected message is DERIVED from
    // each finding's own fields rather than typed per case, so a message that
    // drops the identifier or names the wrong document fails too.
    const EXPECTED_DETAIL =
      "the identifier is not superseded, and this arm did not verify that the repair " +
      "changed the claim -- the declaration did. Re-read this occurrence against the " +
      "repair's new claim.";

    it("says the DECLARATION named the changed claim, and says nothing more, on every finding", () => {
      for (const f of everyFinding) {
        expect(f.message).toBe(
          `${f.docPath}:${f.docLine} mentions ${f.token}, DECLARED as a claim this repair changed`,
        );
      }
    });

    it("says outright that the arm did NOT verify it, and says nothing more, on every finding", () => {
      for (const f of everyFinding) {
        expect(f.detail).toBe(EXPECTED_DETAIL);
      }
    });

    it("DENIES supersession rather than merely omitting it, on every finding", () => {
      // An identifier has no replacement: a repair that re-classifies a site
      // changes the CLAIM about a stable identifier. Saying otherwise would be
      // a wrong advisory in the arm's own finding text. Asserted as a DENIAL
      // and not as an absence, because an absence is satisfied by wording that
      // simply never mentions it — and the numeric half's own phrasing
      // ("declared superseded by M") must never appear on a named finding.
      for (const f of everyFinding) {
        const text = `${f.message} ${f.detail ?? ""}`;
        expect(text).toMatch(/is not superseded/);
        expect(text).not.toMatch(/superseded by/);
      }
    });
  });

  describe("a declared identifier that occurs nowhere", () => {
    it("emits no CLAIM_SITE_UNSWEPT (the not-found CODE is Task 4's)", () => {
      // Task 3 pins only that no occurrence is invented at a location that does
      // not exist. Reporting the absence is a separate signal with its own code.
      const findings = claimSweep(incidentDocs("c272ebed3"), named(ABSENT_IDENTIFIER));
      expect(unswept(findings)).toEqual([]);
    });
  });

  describe("the two halves do not interfere", () => {
    it("a numeric declaration and an identifier declaration coexist in one run", () => {
      const both = claimSweep(incidentDocs("c272ebed3"), {
        superseded: "58",
        replacement: "57",
        claimAbout: INCIDENT_IDENTIFIER,
        touchedLines: SPANS,
      });
      const codes = new Set(both.map((f) => f.code));
      expect(codes).toEqual(new Set(["VALUE_SUPERSEDED_ELSEWHERE", "CLAIM_SITE_UNSWEPT"]));
      // The named half's set is unchanged by the numeric declaration beside it.
      expect(keys(unswept(both))).toEqual([...C272_OUTSIDE_SPANS].sort());
      // And the numeric half stays blind to the spans: its occurrences inside
      // the repair's hunks are still reported.
      const numeric = both.filter((f) => f.code === "VALUE_SUPERSEDED_ELSEWHERE");
      const insideHunks = numeric.filter((f) =>
        (SPANS.get(f.docPath ?? "") ?? new Set()).has(f.docLine),
      );
      expect(insideHunks.length).toBeGreaterThan(0);
    });

    it("keeps the two docPaths distinct across halves", () => {
      const both = claimSweep(incidentDocs("c272ebed3"), {
        superseded: "58",
        replacement: "57",
        claimAbout: INCIDENT_IDENTIFIER,
        touchedLines: SPANS,
      });
      const paths = new Set(both.map((f) => f.docPath));
      expect(paths.has(INCIDENT_SPEC)).toBe(true);
      expect(paths.has(INCIDENT_PLAN)).toBe(true);
    });
  });
});
