/**
 * Task 4 — the fourth code: a declared identifier that is not there
 * (spec §3.2, §3.4, AC-2).
 *
 * Exact matching without a not-found report converts an ordinary typo's nine
 * WRONG advisories into SILENCE — the same defect wearing the conservative
 * direction's clothes. `CLAIM_SITE_UNSWEPT` asserts an occurrence AT A
 * LOCATION, so emitting it here would invent one; the other two codes do not
 * apply; and silence is the fail-open this arm exists to prevent. So the code
 * carries the fact and NO location, because there is no location.
 */
import { describe, expect, it } from "vitest";
import { claimSweep } from "../../lib/specLint/claimSweep";
import type { RepairRecord } from "../../lib/specLint/types";
import {
  C272_OUTSIDE_SPANS,
  INCIDENT_IDENTIFIER,
  INCIDENT_IDENTIFIER_TRUNCATED,
  incidentDocs,
  repairSpans,
  siteKey,
} from "./claimSweepFixtures";
import { ABSENT_IDENTIFIER } from "./claimSweepLiterals";

const SPANS = repairSpans("c272ebed3");

/**
 * An identifier whose ONLY occurrence sits INSIDE the repair's own hunks,
 * measured over the frozen blob. It separates "found, but every occurrence is
 * the repair's own new claim" from "not found at all" — two states an
 * implementation keyed on the REPORTED list collapses into one.
 */
const ONLY_INSIDE_SPANS = "PublishedReviewModal.tsx:978";

function named(claimAbout: string): RepairRecord {
  return { superseded: null, replacement: null, claimAbout, touchedLines: SPANS };
}

const of = (code: string) => (fs: ReturnType<typeof claimSweep>) =>
  fs.filter((f) => f.code === code);
const notFound = of("CLAIM_IDENTIFIER_NOT_FOUND");
const unswept = of("CLAIM_SITE_UNSWEPT");

describe("claim sweep — a declared identifier that is not there", () => {
  describe("the truncated identifier: zero exact, nine as a substring", () => {
    const findings = claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER_TRUNCATED));

    it("emits EXACTLY ONE not-found finding", () => {
      expect(notFound(findings)).toHaveLength(1);
    });

    it("emits ZERO occurrence findings — both halves asserted", () => {
      // Both halves, because a silent implementation emits nothing and passes
      // every occurrence assertion in the named half's suite: there are no
      // occurrences to assert on.
      expect(unswept(findings)).toEqual([]);
    });

    it("carries the identifier, an advisory severity, and NO document", () => {
      const f = notFound(findings)[0]!;
      expect(f.severity).toBe("advisory");
      expect(f.token).toBe(INCIDENT_IDENTIFIER_TRUNCATED);
      // No location is invented. `CLAIM_SITE_UNSWEPT` asserts an occurrence AT
      // a location; this code asserts there is none, so a docPath would be a
      // fabrication.
      expect(f.docPath).toBeUndefined();
      expect(f.docLine).toBe(1);
      expect(f.column).toBe(1);
    });

    it("names the substring hazard in its detail, by EQUALITY", () => {
      const f = notFound(findings)[0]!;
      expect(f.message).toBe(
        `${INCIDENT_IDENTIFIER_TRUNCATED} was DECLARED as a changed claim and occurs ` +
          `zero times EXACTLY in the swept set`,
      );
      expect(f.detail).toBe(
        "nothing was swept for it. Check the declaration for a truncation or a typo -- an " +
          "ordinary one-character slip matches as a SUBSTRING and would have reported everywhere.",
      );
    });
  });

  describe("the untruncated identifier over the SAME swept set (one variable: the identifier)", () => {
    const findings = claimSweep(incidentDocs("c272ebed3"), named(INCIDENT_IDENTIFIER));

    it("emits ZERO not-found findings", () => {
      expect(notFound(findings)).toEqual([]);
    });

    it("emits its occurrences instead", () => {
      // The pair is what makes the truncated case's clean half attributable —
      // "examined and correctly declined" rather than "never got here".
      expect(
        unswept(findings)
          .map((f) => siteKey({ docPath: f.docPath ?? "", docLine: f.docLine, column: f.column }))
          .sort(),
      ).toEqual([...C272_OUTSIDE_SPANS].sort());
    });
  });

  describe("FOUND-BUT-ALL-INSIDE-THE-REPAIR is not NOT-FOUND", () => {
    // The naive rule — "emit not-found whenever the occurrence list is empty" —
    // is WRONG here, and this is the case that separates them. The predicate
    // ranges over every EXACT occurrence in the swept set, not over the
    // REPORTED ones, because an identifier the repair restated everywhere WAS
    // found; saying it occurs zero times would be a false statement about the
    // corpus in the arm's own finding text.
    const findings = claimSweep(incidentDocs("c272ebed3"), named(ONLY_INSIDE_SPANS));

    it("reports no occurrence, because the only one is the repair's own claim", () => {
      expect(unswept(findings)).toEqual([]);
    });

    it("and emits NO not-found finding, because it WAS found", () => {
      expect(notFound(findings)).toEqual([]);
    });

    it("premise: that identifier really does occur, and only inside the spans", () => {
      // Without this the case above is satisfied by an identifier that is
      // simply absent, which is the other state entirely.
      const withoutSpans = claimSweep(incidentDocs("c272ebed3"), {
        superseded: null,
        replacement: null,
        claimAbout: ONLY_INSIDE_SPANS,
        touchedLines: new Map(),
      });
      expect(unswept(withoutSpans)).toHaveLength(1);
      const site = unswept(withoutSpans)[0]!;
      expect((SPANS.get(site.docPath ?? "") ?? new Set()).has(site.docLine)).toBe(true);
    });
  });

  describe("an identifier absent from every document", () => {
    const findings = claimSweep(incidentDocs("c272ebed3"), named(ABSENT_IDENTIFIER));

    it("emits exactly one not-found and no occurrence", () => {
      expect(notFound(findings)).toHaveLength(1);
      expect(unswept(findings)).toEqual([]);
    });
  });

  describe("no identifier declared", () => {
    it("emits no not-found finding for a numeric-only declaration", () => {
      // The code reports a DECLARED identifier that is missing. With none
      // declared there is nothing to be missing, and emitting one would make a
      // numeric-only run indistinguishable from a failed identifier lookup.
      const findings = claimSweep(incidentDocs("c272ebed3"), {
        superseded: "58",
        replacement: "57",
        claimAbout: null,
        touchedLines: SPANS,
      });
      expect(notFound(findings)).toEqual([]);
      expect(findings.length).toBeGreaterThan(0); // premise: the run did produce findings
    });
  });
});
