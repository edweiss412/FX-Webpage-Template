/**
 * Task 5 — the swept set is DECLARED, and an unreadable peer is REPORTED
 * (spec §3.3, §3.4, AC-5).
 *
 * "Same arc" has no executable identity in this repo, and all three inference
 * rules were measured wrong on the incident's own arc — which is exactly one
 * such arc — each in a different direction: citation-following from the spec
 * reaches the probe record and NOT the plan (where 7 of the incident's 9
 * survivors were), stem matching misses the probe record, and date matching
 * pulls in an unrelated spec. So the peers are NAMED.
 *
 * THE RED IS THE UNREADABLE-PEER HALF. The plan-peer half is PRE-SATISFIED by
 * Task 1, whose own acceptance is a nine-survivor replay across THREE
 * documents, so the core has taken a document SET since that task; asserting it
 * here would pass the moment it was written. It ships as a green-phase pin.
 */
import { describe, expect, it } from "vitest";
import { claimSweep, type RepairRecord, type SweepDocument } from "../../lib/specLint/claimSweep";
import {
  FEDE_SURVIVORS,
  INCIDENT_PLAN,
  INCIDENT_PROBE,
  INCIDENT_SPEC,
  INCIDENT_IDENTIFIER,
  incidentDocs,
  repairSpans,
  siteKey,
} from "./claimSweepFixtures";
import { ABSENT_IDENTIFIER, SIBLING_STALE_SENTENCE } from "./claimSweepLiterals";

/**
 * The undeclared sibling: a document that EXISTS beside the arc's own and would
 * contribute a survivor if it were declared. Its content is what makes the
 * "absent from the result" half discriminating — an empty sibling is absent
 * from every result, including a correct one.
 *
 * The live analogue is `2026-08-18-process-facing-mint-bar.md`, which date
 * matching pulls into the incident's arc and which is NOT part of it. That blob
 * carries zero occurrences of the declared value (measured), so using it here
 * would prove nothing about the declaration rule; this sibling carries one.
 */
const SIBLING_PATH = "docs/superpowers/specs/2026-08-18-unrelated-sibling.md";
const SIBLING: SweepDocument = { path: SIBLING_PATH, lines: [SIBLING_STALE_SENTENCE] };
const SIBLING_SITE = `${SIBLING_PATH}:1:${SIBLING_STALE_SENTENCE.indexOf("58") + 1}`;

function numeric(superseded: string, replacement: string): RepairRecord {
  return { superseded, replacement, claimAbout: null, touchedLines: new Map() };
}

function keys(
  findings: readonly { docPath?: string; docLine: number; column: number }[],
): string[] {
  return findings
    .map((f) => siteKey({ docPath: f.docPath ?? "", docLine: f.docLine, column: f.column }))
    .sort();
}

const of = (code: string) => (fs: ReturnType<typeof claimSweep>) =>
  fs.filter((f) => f.code === code);
const unreadable = of("SWEEP_DOCUMENT_UNREADABLE");
const superseded = of("VALUE_SUPERSEDED_ELSEWHERE");
const notFound = of("CLAIM_IDENTIFIER_NOT_FOUND");

describe("claim sweep — the declared swept set", () => {
  describe("a DECLARED peer the resolver cannot read is REPORTED, never silently skipped", () => {
    // The live corpus shape: `git ls-files -s docs/superpowers | awk '$1==120000'`
    // finds one tracked SYMLINK under the swept tree, and `FileResolver`'s own
    // contract names the case -- "null = tracked but unreadable OR tracked
    // symlink". So the null branch is reachable from the shipped resolver
    // rather than hypothetical.
    const docs = incidentDocs("fede5f084");
    // THE UNREADABLE PEER IS FIRST, AND THE ORDER IS LOAD-BEARING. With it last,
    // an implementation that BAILS on the first unreadable document loses
    // nothing -- every survivor has already been collected -- so the
    // "still reports the readable peers" case below passes against the very
    // defect it names. Measured: with the null peer last, a `break` mutant
    // survives the whole suite; with it first, the same mutant loses all nine.
    // The rule that decided the observation was the fixture's ORDER, not the
    // rule under test.
    const withNullPeer: SweepDocument[] = [
      { path: INCIDENT_PROBE, lines: null },
      docs[0]!,
      docs[1]!,
    ];

    it("emits exactly one SWEEP_DOCUMENT_UNREADABLE, naming the peer", () => {
      const findings = claimSweep(withNullPeer, numeric("58", "57"));
      expect(unreadable(findings)).toHaveLength(1);
      const f = unreadable(findings)[0]!;
      expect(f.docPath).toBe(INCIDENT_PROBE);
      expect(f.severity).toBe("advisory");
      expect(f.message).toBe(
        `${INCIDENT_PROBE} was declared in the swept set and could not be read; it was NOT swept`,
      );
      expect(f.detail).toBe(
        "the sweep over this document did not happen. Silence about it is not a clean.",
      );
    });

    it("still reports the readable peers' occurrences alongside it", () => {
      // An implementation that BAILS on the first unreadable document would
      // report the code and nothing else, which is a different defect from the
      // silent one and is not caught by asserting the code alone.
      const findings = claimSweep(withNullPeer, numeric("58", "57"));
      expect(keys(superseded(findings))).toEqual([...FEDE_SURVIVORS].sort());
    });

    it("the SAME peer READABLE emits no unreadable code (one variable: the readability)", () => {
      const findings = claimSweep(docs, numeric("58", "57"));
      expect(unreadable(findings)).toEqual([]);
      // Paired positive: with the probe record readable the run still produces
      // findings, so the clean verdict is "examined and correctly declined"
      // rather than "never got here".
      expect(superseded(findings).length).toBeGreaterThan(0);
    });

    it("reports one code per unreadable peer, not one for the run", () => {
      const twoNull: SweepDocument[] = [
        docs[0]!,
        { path: INCIDENT_PLAN, lines: null },
        { path: INCIDENT_PROBE, lines: null },
      ];
      const findings = claimSweep(twoNull, numeric("58", "57"));
      expect(
        unreadable(findings)
          .map((f) => f.docPath)
          .sort(),
      ).toEqual([INCIDENT_PLAN, INCIDENT_PROBE].sort());
    });
  });

  describe("the swept set is EXACTLY the declared documents", () => {
    // ONE case over ONE corpus, because NEITHER HALF DISCRIMINATES ALONE: the
    // absent-sibling half is satisfied by an implementation that sweeps only
    // the linted document, and the plan-peer half by one that sweeps the whole
    // tree. Asserting them together is what rules out both.
    const declared = [...incidentDocs("fede5f084")];
    const record = numeric("58", "57");

    it("includes the PLAN peer's survivors and EXCLUDES the undeclared sibling", () => {
      const findings = claimSweep(declared, record);
      const reported = keys(superseded(findings));
      // 7 of the incident's 9 survivors are in the PLAN, not the spec.
      const inPlan = reported.filter((k) => k.startsWith(INCIDENT_PLAN));
      expect(inPlan).toHaveLength(7);
      const inSpec = reported.filter((k) => k.startsWith(INCIDENT_SPEC));
      expect(inSpec).toHaveLength(2);
      // …and the sibling contributes nothing while it is not declared.
      expect(reported).not.toContain(SIBLING_SITE);
      expect(reported).toEqual([...FEDE_SURVIVORS].sort());
    });

    it("includes the sibling the moment it IS declared (one variable: the declaration)", () => {
      // The sibling's absence above is attributable to the DECLARATION rather
      // than to the sibling being empty or unreachable.
      const findings = claimSweep([...declared, SIBLING], record);
      expect(keys(superseded(findings))).toEqual([...FEDE_SURVIVORS, SIBLING_SITE].sort());
    });

    it("sweeps nothing at all when the declared set is empty", () => {
      // The floor: an empty declaration is not a clean sweep, it is no sweep.
      expect(claimSweep([], record)).toEqual([]);
    });
  });

  describe("an unreadable peer and a missing identifier are DIFFERENT signals", () => {
    it("emits both when both hold, because neither statement covers the other", () => {
      // `CLAIM_IDENTIFIER_NOT_FOUND` says the identifier occurs zero times in
      // THE SWEPT SET, which is true of what was actually swept.
      // `SWEEP_DOCUMENT_UNREADABLE` says the swept set is smaller than the
      // declared one. Collapsing either into the other would make an incomplete
      // sweep read as a complete one, or a complete one read as a failure.
      const findings = claimSweep(
        [
          { path: INCIDENT_SPEC, lines: ["nothing relevant here"] },
          { path: INCIDENT_PROBE, lines: null },
        ],
        {
          superseded: null,
          replacement: null,
          claimAbout: ABSENT_IDENTIFIER,
          touchedLines: new Map(),
        },
      );
      expect(unreadable(findings)).toHaveLength(1);
      expect(notFound(findings)).toHaveLength(1);
    });

    it("an unreadable peer does not suppress a found identifier", () => {
      const docs = incidentDocs("c272ebed3");
      const findings = claimSweep([docs[0]!, { path: INCIDENT_PLAN, lines: null }, docs[2]!], {
        superseded: null,
        replacement: null,
        claimAbout: INCIDENT_IDENTIFIER,
        touchedLines: repairSpans("c272ebed3"),
      });
      expect(unreadable(findings)).toHaveLength(1);
      expect(notFound(findings)).toEqual([]);
      // The spec's two outside-span sites and the probe record's one survive
      // the plan being unreadable; the plan's one is lost with it, which is
      // exactly what the unreadable code is there to announce.
      expect(keys(findings.filter((f) => f.code === "CLAIM_SITE_UNSWEPT"))).toEqual(
        [`${INCIDENT_SPEC}:268:116`, `${INCIDENT_SPEC}:327:301`, `${INCIDENT_PROBE}:64:36`].sort(),
      );
    });
  });
});
