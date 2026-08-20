// tests/paneCompaction/_metaSendAuthSingleRead.test.ts
//
// The send-authorization single-read gate (spec
// docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md).
//
// EVERY assertion about the scanner lives HERE, and that is not a style
// preference: `sendAuthScan`'s registry row lists this file as its only
// `suitePath`, and only a suite listed there decides KILLED versus SURVIVED. An
// assertion in a neighbouring file still runs, still passes, and contributes
// NOTHING to the mutation score -- probed on a sibling arc, where eight
// surviving mutants existed solely because their covering assertions sat
// outside the surface's `suitePaths` (BL-ENROLLED-SUITE-PLACEMENT-METATEST).
//
// The fixture corpus is authored against a DELIBERATELY DIFFERENT registry row
// -- `Channel` / `ch` / `dispatch` / `settle` / `snapshotOf` -- with no live
// spelling anywhere. A scanner hardcoded to the live instance's vocabulary
// fails every fixture immediately. The live instance is covered by exactly one
// case, the live-tree scan, and that split is the point: the fixtures prove the
// rules are driven by the registry row, the live tree proves the shipped row is
// correct.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readsFor,
  scanModule,
  type Finding,
  type FindingCode,
  type SendAuthSurface,
} from "./sendAuthScan";

const FIXTURE_ROOT = "tests/paneCompaction/fixtures/sendAuth";

const fixture = (name: string): string => join(FIXTURE_ROOT, name);

const readFixture = (name: string): string => readFileSync(fixture(name), "utf8");

/**
 * The fixture row. Not one live spelling: `Channel` where the live instance says
 * `Surface`, `dispatch` where it says `send`, `snapshotOf` where it says
 * `cacheOf`.
 */
const CHANNEL_ROW: SendAuthSurface = {
  module: fixture("surface-type-extra-member.ts"),
  surfaceType: "Channel",
  sinks: ["dispatch"],
  effects: ["emit", "trace"],
  ambient: ["clock"],
  derivationHelpers: ["snapshotOf"],
};

/**
 * Findings compared as SORTED RECORDS. The scanner guarantees no ordering, and
 * two findings on one line have no natural order, so a positional array either
 * flakes or passes by luck.
 */
const sortFindings = (found: Finding[]): Finding[] =>
  [...found].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.code.localeCompare(b.code) ||
      a.name.localeCompare(b.name),
  );

/**
 * Every expected LINE is DERIVED from the fixture's own text, never typed in. A
 * hardcoded line number stops naming the thing it was written for the first time
 * anyone edits above it, and the assertion then passes against whatever now sits
 * there.
 *
 * It THROWS when the needle is absent rather than returning a sentinel: a -1
 * flowing into an expected record is a check that cannot fail.
 */
const lineOf = (name: string, needle: string, occurrence = 1): number => {
  const lines = readFixture(name).split("\n");
  let seen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i]!.includes(needle)) continue;
    seen += 1;
    if (seen === occurrence) return i + 1;
  }
  throw new Error(
    `lineOf: ${JSON.stringify(needle)} occurrence ${occurrence} not found in ${name} — ` +
      "the fixture changed and this expectation is now naming nothing",
  );
};

/** Scan one fixture under a row pointed at that fixture. */
const scan = (name: string, row: SendAuthSurface = CHANNEL_ROW): Finding[] =>
  sortFindings(scanModule(fixture(name), { ...row, module: fixture(name) }));

const finding = (
  name: string,
  code: FindingCode,
  named: string,
  line: number,
  lines: number[] = [line],
): Finding => ({ code, file: fixture(name), line, name: named, lines });

const fnLine = (name: string, fn = "settle"): number => lineOf(name, `export function ${fn}`);

describe("AC-4 — the read set is DERIVED from the surface type declaration", () => {
  it("returns every member of the type that the row does not classify", () => {
    // The discriminator: `stamp` is declared in NONE of the row's three sets, so
    // it is a read by complement. A scanner hardcoded to the live read names
    // returns those instead and fails here on a value.
    expect(readsFor(readFixture("surface-type-extra-member.ts"), CHANNEL_ROW)).toEqual([
      "panes",
      "gauge",
      "memo",
      "claim",
      "stamp",
    ]);
  });

  it("covers a PROPERTY signature, not only a method signature", () => {
    // `stamp: (cwd: string) => string | null` is a PropertySignature. A scanner
    // inspecting only `MethodSignature` passes the assertion above's other four
    // members and drops this one -- the live type mixes both forms, so this is
    // the ordinary case rather than an exotic one.
    expect(readsFor(readFixture("surface-type-extra-member.ts"), CHANNEL_ROW)).toContain("stamp");
  });

  it("excludes every member the row declares as a sink, an effect or ambient", () => {
    const reads = readsFor(readFixture("surface-type-extra-member.ts"), CHANNEL_ROW);
    for (const declared of [...CHANNEL_ROW.sinks, ...CHANNEL_ROW.effects, ...CHANNEL_ROW.ambient]) {
      expect(reads, `${declared} is declared and must not be a read`).not.toContain(declared);
    }
  });

  it("is driven by the row, not by the type: reclassifying a member moves it out of the read set", () => {
    // The same source text with `memo` declared an effect. A hardcoded read set
    // cannot move, so this is the second, independent way the corpus refuses a
    // scanner that ignores its registry row.
    const reclassified: SendAuthSurface = {
      ...CHANNEL_ROW,
      effects: [...CHANNEL_ROW.effects, "memo"],
    };
    expect(readsFor(readFixture("surface-type-extra-member.ts"), reclassified)).toEqual([
      "panes",
      "gauge",
      "claim",
      "stamp",
    ]);
  });
});

describe("AC-5 — a declared pass, and undeclared is a finding", () => {
  it("reports UNDECLARED-PASS when a send-bearing function declares no pass", () => {
    const f = "undeclared-pass.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });

  it("reports AMBIGUOUS-PASS for two declared passes in one send-bearing function", () => {
    const f = "ambiguous-pass.ts";
    expect(scan(f)).toEqual([
      finding(f, "AMBIGUOUS-PASS", "settle", fnLine(f), [
        lineOf(f, "const authorizeOnce"),
        lineOf(f, "const authorizeAgain"),
      ]),
    ]);
  });

  it("suppresses on an exempt marker carrying a non-empty reason", () => {
    expect(scan("exempt-with-reason.ts")).toEqual([]);
  });

  it("does NOT suppress on a bare exempt token — an empty reason is not a certificate", () => {
    const f = "exempt-empty-reason.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });
});

describe("AC-5 — the marker is read impostor-safely", () => {
  // Three fixtures, three DIFFERENT weaker implementations. None stands in for
  // another; each fixture's own header records which one it kills.
  it("a token inside a STRING LITERAL is not a declaration", () => {
    const f = "marker-in-string.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });

  it("a token inside JSX TEXT is not a declaration", () => {
    const f = "marker-in-jsx.tsx";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });

  it("a module after a generic arrow still REPORTS — ScriptKind is chosen by extension", () => {
    // Direction matters and an earlier draft had it backwards. Expecting CLEAN
    // discriminates nothing: under a hardcoded kind the parse is garbage, no
    // top-level function is found, and the scanner returns the empty set by a
    // different route. Measured — a hardcoded-TSX variant passed the WHOLE
    // corpus. Expecting a REPORT removes the coincidence: the weaker variant
    // falls SILENT where a finding is owed, which is the fail-open direction.
    const f = "generic-arrow-scriptkind.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });
});

describe("T2 — the marker attaches to a FUNCTION, not to the file", () => {
  // Both cases are satisfied by a per-FILE marker count, which is why they exist.
  it("a marker above something that is not a function leaves the pass undeclared", () => {
    const f = "detached-marker.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });

  it("one marker cannot declare the pass of a SECOND send-bearing function", () => {
    const f = "two-sends-one-marker.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "settleSecond", fnLine(f, "settleSecond")),
    ]);
  });
});

describe("AC-14 — discovery is anchored on SINKS, not effects", () => {
  it("a module whose only surface calls are effects is not send-bearing", () => {
    expect(scan("effects-only-no-pass.ts")).toEqual([]);
  });

  it("the anchor is the ROW's sink list, not a literal", () => {
    // The row declares `settleAll`, which this module never calls, while it DOES
    // call `dispatch` — the member a scanner hardcoded to the corpus's usual
    // vocabulary would anchor on.
    const f = "sink-not-called-row-driven.ts";
    expect(scan(f, { ...CHANNEL_ROW, sinks: ["settleAll"] })).toEqual([]);
  });

  it("...and the SAME fixture under the default row DOES report", () => {
    // The positive pair, differing from the case above by exactly ONE variable:
    // the row. Without it, the clean result above is satisfied by any
    // implementation that failed to look at the module at all.
    const f = "sink-not-called-row-driven.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "report", fnLine(f, "report"))]);
  });
});

describe("AC-15 — the withdrawn control-flow claim, pinned as a limit", () => {
  it("a pass called CONDITIONALLY scans clean", () => {
    // Spec §4 limit 1, probed at §3.3. This gate does NOT decide whether a send
    // was authorized; the round-2 draft tried to and one conditional defeated
    // it. There is no honest red-then-green cycle for this assertion — the
    // scanner already declines to analyze control flow, so it passes the moment
    // it is written. That is what a characterization pin IS, and manufacturing a
    // red for it would be the marker-whose-cycle-cannot-complete shape the red
    // contract rejects. Its value is directional: without it the fence holds in
    // ONE direction only, a later contributor "fixes" the apparent gap, and the
    // round-1-through-round-3 ratchet restarts.
    expect(scan("conditional-pass.ts")).toEqual([]);
  });

  it("...and the same module without the marker DOES report", () => {
    // The positive pair, differing by exactly one line. This is what makes the
    // clean verdict above mean "examined and correctly declined to analyze
    // control flow" rather than "never got here".
    const f = "conditional-pass-no-marker.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });
});

describe("AC-1 — totality is MODULE-WIDE", () => {
  it("reports an ALIAS of a read member", () => {
    const f = "alias-read.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "memo", lineOf(f, "const m = ch.memo")),
    ]);
  });

  it("reports a DESTRUCTURE sitting OUTSIDE the declared pass", () => {
    // Round-2 F3's evasion verbatim. A pass-SCOPED totality rule cannot see it,
    // which is the whole reason the rule ranges over the module.
    const f = "destructure-outside-pass.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "dispatch", lineOf(f, "const { dispatch } = ch")),
    ]);
  });

  it("reports a COMPUTED member access", () => {
    const f = "computed-member.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "ch", lineOf(f, "const picked = ch[key]")),
    ]);
  });

  it("reports a BARE MENTION", () => {
    const f = "bare-mention.ts";
    expect(scan(f)).toEqual([finding(f, "UNCLASSIFIED-USE", "ch", lineOf(f, "const held = ch;"))]);
  });
});

describe("AC-2 — the ambient exemption is for a CALLBACK HANDOFF, and only that", () => {
  // These three are ONE triple. Drop any and the exemption reads as a hole: the
  // first alone is satisfied by exempting every ambient reference, and the first
  // two alone by exempting every callback handoff regardless of member class.
  it("an AMBIENT member handed on as a callback does NOT report", () => {
    // The live module carries this shape at `scripts/pane-compaction.ts:850`
    // (`random: s.random`), so a rule that reported it fails on correct code.
    expect(scan("ambient-callback-clean.ts")).toEqual([]);
  });

  it("the SAME handoff shape with a READ member DOES report", () => {
    const f = "read-callback-reports.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "memo", lineOf(f, "mint({ memo: ch.memo })")),
    ]);
  });

  it("a BARE ambient alias reports — a mention is not a handoff", () => {
    // Without this, an ambient member could be aliased and then called twice
    // invisibly, which is the exact invisibility this gate exists to remove.
    const f = "ambient-alias.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "clock", lineOf(f, "const clock = ch.clock")),
    ]);
  });
});
