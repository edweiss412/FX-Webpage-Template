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

describe("AC-6/AC-7 — in-pass reads are straight-line and single", () => {
  it("ONE straight-line read of one method scans CLEAN", () => {
    // The false-positive counterpart, and without it this whole block is
    // satisfied by reporting EVERY in-pass direct read — which passes every
    // violation case below and then fails against the live tree.
    expect(scan("single-read-clean.ts")).toEqual([]);
  });

  it("two straight-line reads of the SAME method report MULTI-READ naming BOTH lines", () => {
    // Two values read at different instants can disagree; one cannot. That is
    // the entire defect class this gate exists for.
    const f = "multi-read.ts";
    const first = lineOf(f, "ch.panes()", 1);
    const second = lineOf(f, "ch.panes()", 2);
    expect(scan(f)).toEqual([finding(f, "MULTI-READ", "panes", first, [first, second])]);
  });

  it("the round-2 F2 NAMED CALLBACK reports NON-STRAIGHT-LINE-READ", () => {
    // Asserted by that name per AC-6. Caught by POSITION, with no need to know
    // how many times the callback runs — which is exactly what replaced the
    // discarded draft's per-invocation counting and its cycle detection.
    const f = "named-callback.ts";
    expect(scan(f)).toEqual([
      finding(f, "NON-STRAIGHT-LINE-READ", "gauge", lineOf(f, "ch.gauge(id)")),
    ]);
  });

  // One case per FUNCTION-LIKE kind and per ITERATION kind. A scanner that
  // recognizes only the node kinds a minimal fixture set happens to use
  // satisfies the rule AS STATED while missing the rest of the language — the
  // analysis-primitive weakness round 4 named, distinct from a weak rule.
  it.each([
    ["nested-function-declaration.ts", "ch.gauge(id)"],
    ["nested-arrow.ts", "ch.gauge(id)"],
    ["nested-object-method.ts", "ch.gauge(id)"],
    ["nested-function-expression.ts", "ch.gauge(id)"],
    ["loop-for.ts", "ch.gauge(String(i))"],
    ["loop-for-of.ts", "ch.gauge(id)"],
    ["loop-while.ts", "ch.gauge(String(left))"],
    ["loop-do-while.ts", "ch.gauge(String(left))"],
  ])("%s reports NON-STRAIGHT-LINE-READ", (f, needle) => {
    expect(scan(f)).toEqual([finding(f, "NON-STRAIGHT-LINE-READ", "gauge", lineOf(f, needle))]);
  });
});

describe("AC-7b/AC-8 — exactly one declared derivation, declared straight-line", () => {
  it("the SHIPPED MEMO's shape scans clean", () => {
    // A derivation on the straight-line path, memoizing a raw read inside its own
    // initializer. Banning derivations outright satisfies every violation case
    // below and fails HERE — and the live module carries this exact shape at
    // `scripts/pane-compaction.ts:797`, so a rule that reported it would fail
    // against correct shipped code.
    expect(scan("derivation-clean.ts")).toEqual([]);
  });

  it("a SPREAD is a derivation, and reads THROUGH the derived binding are unconstrained", () => {
    // Two reads of one method through `snap`. If a spread were not recognized the
    // pass would have zero derivations AND those two reads would become a
    // MULTI-READ — it fails twice over, which is the point. The live memo is a
    // SPREAD, not a helper call, so a helper-only recognizer passes the rest of
    // this corpus and then reports against the live tree.
    expect(scan("spread-derivation.ts")).toEqual([]);
  });

  it("a DECLARED helper initializer is a derivation, not a handoff", () => {
    expect(scan("helper-derivation.ts")).toEqual([]);
  });

  it("ZERO derivations reports — 'exactly one' is violated by zero as well as by two", () => {
    // Without this the rule degrades silently into "at most one", and every read
    // then comes straight off the live surface at its own instant.
    const f = "zero-derivations.ts";
    expect(scan(f)).toEqual([
      finding(f, "MISSING-DERIVATION", "authorizeOnce", lineOf(f, "const authorizeOnce")),
    ]);
  });

  it("TWO derivations report MULTI-DERIVATION naming both declarations", () => {
    const f = "multi-derivation.ts";
    const a = lineOf(f, "const first: Channel");
    const b = lineOf(f, "const second = snapshotOf(ch)");
    expect(scan(f)).toEqual([finding(f, "MULTI-DERIVATION", "authorizeOnce", a, [a, b])]);
  });

  it.each([["derivation-in-loop.ts"], ["derivation-in-named-callback.ts"]])(
    "%s reports NON-STRAIGHT-LINE-DERIVATION",
    (f) => {
      // Both are round-3 F1 shapes and both scanned CLEAN under the round-2
      // design, whose exemption rested on a TEMPORAL claim ("the initializer is
      // evaluated once per pass"). The exemption is now POSITIONAL and the check
      // is rule 2's existing predicate applied to the DECLARATION — no new
      // mechanism, which is what made that repair subtractive.
      expect(scan(f)).toEqual([
        finding(f, "NON-STRAIGHT-LINE-DERIVATION", "snap", lineOf(f, "const snap: Channel")),
      ]);
    },
  );

  it("a derivation exempts its READS, not its whole initializer subtree", () => {
    // An implementation that skips the subtree on recognizing a derivation passes
    // every other derivation fixture and silently permits a handoff.
    const f = "derivation-leaks-handoff.ts";
    expect(scan(f)).toEqual([finding(f, "RAW-HANDOFF", "inspect", lineOf(f, "inspect(ch)"))]);
  });
});

describe("AC-8 — the round-4 regression pin", () => {
  it("emits TWO RAW-HANDOFF findings on ONE line, distinguished only by callee", () => {
    // THE IDENTITY PIN. These two records share `code`, `file` AND `line`, and
    // differ only in `name`. A dedup keyed on `code:file:line` — the natural way
    // to write one — collapses them into a single finding and this case goes
    // green having tested nothing. Compared as SORTED RECORDS because two
    // findings on one line have no natural order.
    //
    // The fixture carries its own derivation deliberately, so MISSING-DERIVATION
    // cannot be the record that makes the assertion pass.
    //
    // An "any call taking the surface is a derivation" reading silences this
    // fixture ENTIRELY (spec §3.2), which is why the helper list is DECLARED.
    const f = "round4-raw-handoff.ts";
    const line = lineOf(f, 'observeAll("p1", "main", ch,');
    expect(scan(f)).toEqual(
      sortFindings([
        finding(f, "RAW-HANDOFF", "observeAll", line),
        finding(f, "RAW-HANDOFF", "snapshotOf", line),
      ]),
    );
  });

  it("the same shape OUTSIDE the pass is ordinary injection and does NOT report", () => {
    // AC-3's other half. Reporting every raw-surface argument anywhere passes the
    // pin above and then fires on the live `drive(opts, pane, roster, s)` and
    // `cacheOf(s)` in the report phase.
    expect(scan("injection-outside-pass.ts")).toEqual([]);
  });
});
