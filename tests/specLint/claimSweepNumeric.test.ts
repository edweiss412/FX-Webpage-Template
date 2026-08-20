/**
 * Task 1 — the numeric half: sentence scoping, co-occurrence, and the incident
 * replay (spec §3.1, AC-1, AC-4, AC-6).
 *
 * The RED case is the historical re-enactment and it is an expect-a-REPORT
 * case: an expect-CLEAN fixture is satisfied by any implementation that fails
 * to look — a broken parse, an empty walk, a crashed read — so the red anchors
 * on output the implementation must PRODUCE. Every expect-CLEAN assertion below
 * is a GREEN-phase regression pin PAIRED one variable apart with a case that
 * reports.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claimSweep, sentenceSpans, type RepairRecord } from "../../lib/specLint/claimSweep";
import {
  FEDE_EXCLUDED,
  FEDE_SURVIVORS,
  FEDE_SURVIVORS_INSIDE_OWN_HUNKS,
  FROZEN_FIXTURES,
  INCIDENT_PLAN,
  INCIDENT_SPEC,
  fixturePath,
  incidentDocs,
  siteKey,
} from "./claimSweepFixtures";
import {
  ABSENT_PAIR,
  ABSENT_PAIR_STALE_SENTENCE,
  MIXED_LINE,
  STALE_SENTENCE,
  SYNTHETIC_PAIR,
  TRANSITION_SENTENCE,
  TRANSITION_SENTENCE_REPLACEMENT_DELETED,
} from "./claimSweepLiterals";

const NO_SPANS: ReadonlyMap<string, ReadonlySet<number>> = new Map();

function record(superseded: string, replacement: string): RepairRecord {
  return { superseded, replacement, claimAbout: null, touchedLines: NO_SPANS };
}

/** One synthetic document, so a pin does not depend on a frozen blob. */
function synthetic(path: string, lines: string[]) {
  return { path, lines };
}

/** Sorted `<path>:<line>:<column>` keys — findings on one line have no natural order. */
function keys(
  findings: readonly { docPath?: string; docLine: number; column: number }[],
): string[] {
  return findings
    .map((f) => siteKey({ docPath: f.docPath ?? "", docLine: f.docLine, column: f.column }))
    .sort();
}

describe("claim sweep — the numeric half", () => {
  describe("the replay fixtures are FROZEN BLOBS, not merely files", () => {
    // Every assertion in this suite is a (document, line, COLUMN, token) set
    // taken from the probe record, so anything that re-flows these documents
    // moves the columns and the replay silently stops reproducing the
    // acceptance criterion it exists to pin. The pre-commit formatter did
    // exactly that once — it reflowed six markdown tables — which is why
    // `.prettierignore` fences the directory and why this case exists to prove
    // the fence holds rather than to assume it.
    it.each(FROZEN_FIXTURES)("%s/%s.md is byte-identical to its blob", (rev, stem, path) => {
      const blob = execFileSync("git", ["show", `${rev}:${path}`], {
        maxBuffer: 64 * 1024 * 1024,
      });
      const onDisk = readFileSync(fixturePath(rev, stem));
      // Both reads SUCCEEDED. Two empty buffers compare equal, and a broken
      // read then renders identically to a match — which is how a check that
      // cannot fail passes forever.
      expect(blob.length).toBeGreaterThan(1000);
      expect(onDisk.length).toBeGreaterThan(1000);
      expect(onDisk.equals(blob)).toBe(true);
    });
  });

  describe("the incident replay (AC-4): fede5f084 changed 58 to 57", () => {
    const findings = claimSweep(incidentDocs("fede5f084"), record("58", "57"));

    it("yields exactly the nine (document, line, column) survivors, as a SET", () => {
      // A count is defeated by substitution: swapping one survivor for a
      // different occurrence keeps the total at nine while changing what is
      // asserted. A count answers "did something new appear"; a set answers
      // "are these the same things", and this criterion asks the second.
      expect(keys(findings)).toEqual([...FEDE_SURVIVORS].sort());
    });

    it("carries the superseded token and an advisory severity on every finding", () => {
      expect(findings.length).toBeGreaterThan(0); // premise: the run produced findings
      expect(findings.every((f) => f.severity === "advisory")).toBe(true);
      expect(findings.every((f) => f.code === "VALUE_SUPERSEDED_ELSEWHERE")).toBe(true);
      expect(findings.every((f) => f.token === "58")).toBe(true);
    });

    it("excludes exactly the three transition-sentence occurrences", () => {
      const reported = new Set(keys(findings));
      for (const excluded of FEDE_EXCLUDED) expect(reported.has(excluded)).toBe(false);
      // Attributable rather than the shape of an empty read: the three excluded
      // occurrences are REAL occurrences of 58 in these documents.
      const raw = incidentDocs("fede5f084").flatMap((d) =>
        (d.lines ?? []).flatMap((line, i) =>
          [...line.matchAll(/(?<![A-Za-z0-9_])58(?![A-Za-z0-9_])/g)].map(
            (m) => `${d.path}:${i + 1}:${m.index + 1}`,
          ),
        ),
      );
      expect(raw.sort()).toEqual([...FEDE_SURVIVORS, ...FEDE_EXCLUDED].sort());
    });
  });

  describe("the SENTENCE is the scope, and the LINE is not", () => {
    it("reports the stale occurrence on a line that also carries a transition sentence", () => {
      // Live in the incident blob: spec:220 carries one EXCLUDED occurrence at
      // column 83 (inside "grows from 21 rows to 57, not 58") and one SURVIVING
      // occurrence at column 395. A LINE-scoped implementation excludes the
      // whole line and misses the stale one; the same measurement run
      // line-scoped returns 7 survivors and 5 excluded, which is neither the
      // acceptance criterion's 9 nor its 3.
      const findings = claimSweep(incidentDocs("fede5f084"), record("58", "57"));
      const onLine220 = findings.filter((f) => f.docPath === INCIDENT_SPEC && f.docLine === 220);
      expect(onLine220.map((f) => f.column)).toEqual([395]);
    });

    it("reports the stale sentence on a synthetic mixed line, and nothing on the transition alone", () => {
      const { superseded, replacement } = SYNTHETIC_PAIR;
      const mixed = claimSweep(
        [synthetic("x/mixed.md", [MIXED_LINE])],
        record(superseded, replacement),
      );
      // Exactly one: the stale sentence's occurrence, not the transition's.
      expect(mixed).toHaveLength(1);
      expect(mixed[0]!.column).toBe(
        MIXED_LINE.indexOf(STALE_SENTENCE) + STALE_SENTENCE.indexOf(superseded) + 1,
      );

      // Paired negative, ONE variable apart — the same line without the stale sentence.
      const transitionOnly = claimSweep(
        [synthetic("x/transition.md", [TRANSITION_SENTENCE])],
        record(superseded, replacement),
      );
      expect(transitionOnly).toEqual([]);
    });
  });

  describe("a transition sentence draws nothing; the same sentence without the replacement reports", () => {
    const { superseded, replacement } = SYNTHETIC_PAIR;

    it("is silent on a sentence carrying BOTH values", () => {
      expect(
        claimSweep([synthetic("x/a.md", [TRANSITION_SENTENCE])], record(superseded, replacement)),
      ).toEqual([]);
    });

    it("reports the SAME sentence with the replacement deleted (one variable apart)", () => {
      const findings = claimSweep(
        [synthetic("x/a.md", [TRANSITION_SENTENCE_REPLACEMENT_DELETED])],
        record(superseded, replacement),
      );
      expect(keys(findings)).toEqual([
        `x/a.md:1:${TRANSITION_SENTENCE_REPLACEMENT_DELETED.indexOf(superseded) + 1}`,
      ]);
    });
  });

  describe("the diff status of a line is NOT the discriminator", () => {
    it("still reports the survivors that sit inside the repair's OWN hunks", () => {
      // The cheaper "report occurrences outside the repair's diff hunks" rule
      // is REFUTED by exactly these: the spec's consequence bound is an ADDED
      // line in fede5f084's own hunk, rewritten for an unrelated reason with
      // the 58 left standing.
      const spans = new Map<string, ReadonlySet<number>>([
        [INCIDENT_SPEC, new Set([220, 234, 242, 253, 270, 271, 282, 328, 344, 352])],
        [INCIDENT_PLAN, new Set([46, 78, 79, 83, 102, 112, 118, 214])],
      ]);
      const findings = claimSweep(incidentDocs("fede5f084"), {
        superseded: "58",
        replacement: "57",
        claimAbout: null,
        touchedLines: spans,
      });
      const reported = new Set(keys(findings));
      for (const inside of FEDE_SURVIVORS_INSIDE_OWN_HUNKS) {
        expect(reported.has(inside)).toBe(true);
      }
      // …and the spans change NOTHING for this half: the same nine either way.
      expect(keys(findings)).toEqual([...FEDE_SURVIVORS].sort());
    });
  });

  describe("a declared value that appears nowhere draws nothing (paired on the CORPUS)", () => {
    it("is silent over documents where the superseded value does not occur", () => {
      expect(
        claimSweep(
          incidentDocs("fede5f084"),
          record(ABSENT_PAIR.superseded, ABSENT_PAIR.replacement),
        ),
      ).toEqual([]);
    });

    it("reports the SAME declaration over documents where it DOES appear", () => {
      // One variable: the corpus. The declaration is held fixed, so the silence
      // above is attributable to the corpus rather than to the arm failing to look.
      const findings = claimSweep(
        [synthetic("x/absent-pair.md", [ABSENT_PAIR_STALE_SENTENCE])],
        record(ABSENT_PAIR.superseded, ABSENT_PAIR.replacement),
      );
      expect(keys(findings)).toEqual([
        `x/absent-pair.md:1:${ABSENT_PAIR_STALE_SENTENCE.indexOf(ABSENT_PAIR.superseded) + 1}`,
      ]);
    });
  });

  describe("sentence spans (the scoping primitive)", () => {
    it("splits after a period, a semicolon and a colon, and covers the whole line", () => {
      const line = "One. Two; three: four";
      const spans = sentenceSpans(line);
      expect(spans.map((s) => line.slice(s.start, s.end))).toEqual([
        "One.",
        "Two;",
        "three:",
        "four",
      ]);
      expect(spans[spans.length - 1]!.end).toBe(line.length);
    });

    it("returns one span covering a line with no break", () => {
      expect(sentenceSpans("no break here")).toEqual([{ start: 0, end: 13 }]);
    });

    it("returns a covering span for the empty line", () => {
      expect(sentenceSpans("")).toEqual([{ start: 0, end: 0 }]);
    });
  });

  describe("AC-6 — the corpus assertion is a RELATION, never a cardinality", () => {
    // Enumerated at RUN TIME over the live tracked corpus. No figure from spec
    // §2 is pinned anywhere here: a corpus that grows would turn a correct arm
    // red, and this arc paid for that four times as its own figure moved
    // 936 -> 943 -> 947 -> 953 across its rounds.
    const tracked = execFileSync("git", ["ls-files", "-z", "--", "docs/superpowers"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter((p) => p.endsWith(".md"));

    it("enumerates a non-empty corpus (floor on the derivation's own output)", () => {
      // A zero-length derivation is a BROKEN READ, not a corpus with no
      // documents, and the two render identically in every count below.
      expect(tracked.length).toBeGreaterThan(100);
    });

    const docs = tracked.map((path) => {
      let lines: string[] | null;
      try {
        lines = readFileSync(path, "utf8").split("\n");
      } catch {
        lines = null;
      }
      return { path, lines };
    });
    const readable = docs.filter((d) => d.lines !== null);
    const corpusFindings = claimSweep(docs, record("58", "57"));

    // The RELATION, derived by an INDEPENDENT extractor rather than by re-running
    // the rule under test: the set of occurrences sitting inside a sentence that
    // carries BOTH values. No reported occurrence may fall inside one.
    const OLD = /(?<![A-Za-z0-9_])58(?![A-Za-z0-9_])/;
    const NEW = /(?<![A-Za-z0-9_])57(?![A-Za-z0-9_])/;
    const bothSites = new Set<string>();
    for (const doc of readable) {
      for (let i = 0; i < doc.lines!.length; i += 1) {
        const line = doc.lines![i]!;
        if (!OLD.test(line)) continue;
        let cursor = 0;
        for (const piece of line.split(/(?<=[.;:])\s+/)) {
          const at = line.indexOf(piece, cursor);
          cursor = at < 0 ? cursor : at + piece.length;
          if (at < 0 || !OLD.test(piece) || !NEW.test(piece)) continue;
          for (const m of piece.matchAll(new RegExp(OLD.source, "g"))) {
            bothSites.add(`${doc.path}:${i + 1}:${at + m.index + 1}`);
          }
        }
      }
    }

    // The figures ride in the TITLE because this repo's vitest setup swallows
    // console output — a report nobody receives is not a report. They are
    // REPORTED and never asserted: every number below moves as the corpus grows,
    // and pinning one is how a corpus that grows turns a correct arm red.
    it(`excludes every co-occurring sentence [reported: ${tracked.length} files, ${bothSites.size} occurrences excluded, ${corpusFindings.length} not excluded]`, () => {
      // The read SUCCEEDED, rather than the walk merely having run.
      expect(readable.length).toBeGreaterThan(100);
      // Floor: the corpus genuinely contains transition sentences carrying both,
      // so the clean verdict below is attributable rather than vacuous.
      expect(bothSites.size).toBeGreaterThan(0);

      const reported = new Set(keys(corpusFindings));
      expect([...bothSites].filter((s) => reported.has(s))).toEqual([]);
    });
  });
});
