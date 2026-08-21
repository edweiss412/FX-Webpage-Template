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
import { premise } from "@/tests/_shared/premise";
import { boundedOccurrences, claimSweep, sentenceSpans } from "../../lib/specLint/claimSweep";
import type { RepairRecord } from "../../lib/specLint/types";
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
      premise(`git show returned bytes for ${rev}:${path}`, blob.length, 1000);
      premise(`the fixture on disk has bytes for ${rev}/${stem}.md`, onDisk.length, 1000);
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

    it("states the finding by EQUALITY, so no superset wording can pass", () => {
      // Class sweep from the named half's mutant (b): a `toMatch` presence
      // assertion is satisfied by every superset of the required wording, so a
      // message could acquire an extra claim and stay green. The expected text
      // is DERIVED from each finding's own fields, so a message that names the
      // wrong document, line or token fails as well.
      for (const f of findings) {
        expect(f.message).toBe(
          `${f.docPath}:${f.docLine} carries ${f.token}, declared superseded by 57, ` +
            `in a sentence that does not name 57`,
        );
        expect(f.detail).toBe(
          "re-read it -- it is stale, or it is deliberate and wants a word saying so.",
        );
      }
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
      premise("git ls-files enumerated docs/superpowers markdown", tracked.length, 100);
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
      premise("the corpus files were readable", readable.length, 100);
      // The corpus genuinely contains transition sentences carrying both, so the
      // clean verdict below is attributable rather than vacuous.
      premise("the corpus contains co-occurring sentences", bothSites.size, 0);

      const reported = new Set(keys(corpusFindings));
      expect([...bothSites].filter((s) => reported.has(s))).toEqual([]);
    });
  });
});

/**
 * The scanning primitives, called DIRECTLY, and the two preconditions the
 * numeric half applies before it reads a single line.
 *
 * The half above exercises these through `claimSweep`, which is the right grain
 * for a behavioural claim and the wrong one for the primitives' own boundaries:
 * a corpus-shaped line never puts a token at offset zero, never repeats it at
 * adjacent offsets, and never starts an occurrence at a sentence break, so
 * mutants on exactly those edges survived a suite that is otherwise thorough.
 *
 * The failure mode each case catches: an off-by-one in the scan that DROPS an
 * occurrence (a stale claim goes unreported and the run reads as clean), or one
 * that INVENTS an occurrence whose neighbours should have excluded it (a false
 * advisory against a value that is not a claim at all).
 */
describe("claim sweep -- the scanning primitives, called directly", () => {
  // Deliberately NOT the module's own NUMERIC_BOUNDARY. A boundary of digits
  // lets a fixture use letters as the token, so the token can fill the line
  // without its own characters excluding every occurrence of it.
  const DIGIT = /[0-9]/;

  describe("boundedOccurrences", () => {
    it("finds the single interior occurrence of a one-character token", () => {
      expect(boundedOccurrences("x5x", "5", DIGIT)).toEqual([1]);
    });

    it("finds an occurrence at offset ZERO, where there is no preceding character", () => {
      expect(boundedOccurrences("5x", "5", DIGIT)).toEqual([0]);
    });

    it("finds ADJACENT occurrences, one position apart", () => {
      expect(boundedOccurrences("aa", "a", DIGIT)).toEqual([0, 1]);
    });

    it("finds EVERY position of a token that fills the line", () => {
      expect(boundedOccurrences("aaa", "a", DIGIT)).toEqual([0, 1, 2]);
    });

    it("EXCLUDES an occurrence whose PRECEDING character is inside the boundary", () => {
      // Both offsets are rejected: offset 0 by its following digit, offset 1 by
      // its preceding one. An implementation that reads the wrong neighbour for
      // the second reports it.
      expect(boundedOccurrences("55", "5", DIGIT)).toEqual([]);
    });

    it("returns nothing for an EMPTY token rather than matching every position", () => {
      expect(boundedOccurrences("aaa", "", DIGIT)).toEqual([]);
    });
  });

  describe("the numeric half runs only on a COMPLETE pair", () => {
    const doc = synthetic("docs/superpowers/specs/half.md", [STALE_SENTENCE]);

    it("runs NOTHING when only the SUPERSEDED value is declared", () => {
      const half: RepairRecord = {
        superseded: "8811",
        replacement: null,
        claimAbout: null,
        touchedLines: NO_SPANS,
      };
      expect(() => claimSweep([doc], half)).not.toThrow();
      expect(claimSweep([doc], half)).toEqual([]);
    });

    it("runs NOTHING when only the REPLACEMENT is declared", () => {
      const half: RepairRecord = {
        superseded: null,
        replacement: "9900",
        claimAbout: null,
        touchedLines: NO_SPANS,
      };
      expect(() => claimSweep([doc], half)).not.toThrow();
      expect(claimSweep([doc], half)).toEqual([]);
    });

    it("REPORTS on that same document once BOTH sides are declared", () => {
      // One variable apart from each case above: an implementation that returns
      // early on every record satisfies both of them and fails this.
      expect(keys(claimSweep([doc], record("8811", "9900")))).toEqual([
        `docs/superpowers/specs/half.md:1:${STALE_SENTENCE.indexOf("8811") + 1}`,
      ]);
    });
  });

  describe("the sentence lookup is what SCOPES the co-occurrence test", () => {
    it("scopes to the sentence the occurrence STARTS, never widening to the line", () => {
      // The occurrence sits at its sentence's FIRST offset, the only position at
      // which `span.start <= at` and `span.start < at` disagree. Under the
      // strict form no span matches, the scope falls back to the whole LINE, the
      // line carries the replacement, and a live stale claim is suppressed.
      const line = "now 63. 58 is stale.";
      const doc = synthetic("docs/superpowers/specs/scope.md", [line]);
      expect(keys(claimSweep([doc], record("58", "63")))).toEqual([
        `docs/superpowers/specs/scope.md:1:${line.indexOf("58") + 1}`,
      ]);
    });

    it("finds NO span for an occurrence beginning AT a sentence break, and uses the line", () => {
      // A declared token may begin with whitespace: `--superseded " 63"` is a
      // parseable invocation, and such a token starts exactly at a span's END
      // offset, because a span ends where the break's whitespace run begins.
      // That offset is the only position at which `at < span.end` and
      // `at <= span.end` disagree. The loose form attributes the occurrence to
      // the sentence BEFORE the break, which does not carry the replacement, and
      // reports a claim the line itself already restates.
      const doc = synthetic("docs/superpowers/specs/break.md", ["stale. 63"]);
      expect(claimSweep([doc], record(" 63", "63"))).toEqual([]);
    });

    it("REPORTS that same occurrence when the LINE does not carry the replacement", () => {
      // One variable apart from the case above: the fallback-to-line scope is
      // doing real work here, so a fixture that reports for the wrong reason
      // cannot satisfy both.
      const doc = synthetic("docs/superpowers/specs/break.md", ["stale. 63"]);
      expect(keys(claimSweep([doc], record(" 63", "99")))).toEqual([
        "docs/superpowers/specs/break.md:1:7",
      ]);
    });
  });
});
