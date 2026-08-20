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

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

import { premise, premiseHolds } from "../_shared/premise";

import {
  LIVE_ROOTS,
  readsFor,
  scanModule,
  scanRepo,
  SEND_AUTH_SURFACES,
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

/**
 * A registry pointed ENTIRELY at fixtures. THREE rows, so nothing in `scanRepo`
 * may assume a single-row registry: a scanner that stops at the first row reports
 * nothing about the second module and nothing about anything importing it.
 */
const FIXTURE_REGISTRY: SendAuthSurface[] = [
  { ...CHANNEL_ROW, module: fixture("registered-channel.ts") },
  { ...CHANNEL_ROW, module: fixture("second-registered-channel.ts") },
  { ...CHANNEL_ROW, module: fixture("registered-importer.ts") },
  // A registered module that VIOLATES, added by the Task 8 mutation gate.
  //
  // Without it, `scanRepo`'s entire per-module fan-out —
  // `findings.push(...scanModule(file, row))`, the most load-bearing line in the
  // function — was REMOVABLE with the whole corpus green: every registered
  // fixture produced zero findings and the live-tree case expects `[]`, so the
  // aggregation step was only ever reached by cases whose expectation was empty.
  //
  // This is rule 11 at a level per-fixture pairing structurally cannot reach.
  // Each fixture was individually well-paired and the AGGREGATION was still never
  // exercised. The question a fixture audit cannot ask is "which case fails if
  // this entire STAGE is deleted"; when the answer is none, no amount of
  // per-fixture pairing helps.
  { ...CHANNEL_ROW, module: fixture("undeclared-pass.ts") },
];

describe("AC-9 — scanRepo walks from disk, and unregistered importers report", () => {
  const found = (): Finding[] => sortFindings(scanRepo([FIXTURE_ROOT], FIXTURE_REGISTRY));

  it("discovers a module under the walked root that has NO registry row", () => {
    // The discriminator: the fixture sits under the root with no registry edit. A
    // scanner iterating SEND_AUTH_SURFACES alone cannot reach it, and neither can
    // a hardcoded file list — which is why discovery is a filesystem walk, so a
    // module added under a walked root is covered by default rather than silently
    // exempt.
    const f = "unregistered-importer.ts";
    expect(found()).toContainEqual(
      finding(f, "UNREGISTERED-IMPORTER", "Channel", lineOf(f, "import type { Channel }")),
    );
  });

  it("follows the SYMBOL, not the local binding name", () => {
    // `import type { Channel as Alias }` is an ordinary TypeScript spelling, not
    // an obfuscation. Comparing the local name passes every other import fixture
    // and misses this one.
    const f = "aliased-importer.ts";
    expect(found()).toContainEqual(
      finding(f, "UNREGISTERED-IMPORTER", "Channel", lineOf(f, "import type { Channel as Alias }")),
    );
  });

  it("scans a REGISTERED module through the walk, not merely its import edges", () => {
    // The fan-out check. Deleting `scanRepo`'s per-module scan leaves every
    // import-edge assertion above passing and this one failing alone.
    const f = "undeclared-pass.ts";
    expect(found()).toContainEqual(finding(f, "UNDECLARED-PASS", "settle", fnLine(f)));
  });

  it("DOES follow a namespace import that reaches the type by qualified name", () => {
    // This case asserted the opposite and called it "a documented limit, held
    // explicitly". Diff round 1 established the limit was never documented: §2.4
    // says any module importing the surfaceType symbol and not itself registered is
    // reported, and §4 excepts nothing for namespace imports — so the suite was
    // ratifying a contradiction the spec did not contain. `registered.Channel` is a
    // QualifiedName, which is how a namespace import reaches a symbol.
    const f = "namespace-importer.ts";
    expect(found()).toContainEqual(
      finding(f, "UNREGISTERED-IMPORTER", "Channel", lineOf(f, "import * as registered")),
    );
  });

  it("...and DECLINES a namespace import that never reaches the type, one variable apart", () => {
    // Exact rather than blanket: reporting every namespace importer of a registered
    // module would fire on any module that merely imports something else from it.
    // The pair differs from the case above ONLY in whether a `registered.Channel`
    // qualified name exists.
    //
    // The clean verdict here is ATTRIBUTABLE, which an expect-CLEAN case otherwise
    // is not: the arm prefilters on the surface type NAME before parsing, so a
    // fixture omitting the token would be skipped before the qualified-name check
    // ran and would pass for the wrong reason. That fixture carries the token in
    // its header prose, so the file IS parsed and the arm genuinely decides.
    expect(found().filter((x) => x.file === fixture("namespace-importer-unused.ts"))).toEqual([]);
  });

  it("does NOT report an importer that HAS a registry row", () => {
    // Without this, an implementation reporting every importer of the type passes
    // both cases above and then fires on every enrolled module.
    expect(found().filter((x) => x.file === fixture("registered-importer.ts"))).toEqual([]);
  });

  it("reports exactly the two unregistered importers and NOTHING else", () => {
    // The closed statement. `toContainEqual` proves presence; this proves ABSENCE
    // of everything else, which is what stops the arm firing on the other
    // forty-odd fixtures sharing this root — most of which DECLARE a type of the
    // same NAME locally without importing anything.
    expect(found().map((x) => `${x.code} ${x.file}`)).toEqual([
      `UNREGISTERED-IMPORTER ${fixture("aliased-importer.ts")}`,
      // The namespace importer, reached by qualified name. Its silent-skip was
      // diff r1 F5; the closed statement is where its absence would have shown.
      `UNREGISTERED-IMPORTER ${fixture("namespace-importer.ts")}`,
      // The registered violator. Its presence is what makes the per-module
      // fan-out load-bearing rather than decorative.
      `UNDECLARED-PASS ${fixture("undeclared-pass.ts")}`,
      `UNREGISTERED-IMPORTER ${fixture("unregistered-importer.ts")}`,
    ]);
  });
});

describe("AC-10/AC-11 — the live tree, with the gate's own premise", () => {
  const LIVE = [...LIVE_ROOTS];
  const CONTROL_ROOT = "tests/paneCompaction/fixtures/sendAuthLiveControl";

  const SELF = [
    "tests/paneCompaction/sendAuthScan.ts",
    "tests/paneCompaction/_metaSendAuthSingleRead.test.ts",
  ];

  it("no walked root contains the scanner or this suite", () => {
    // Rule 21: a guard scanning a tree that holds its own tests measures ITSELF.
    // Every literal here matching the scanner's patterns becomes corpus, and the
    // consequence is asymmetric — a polluting occurrence INFLATES a count pinned
    // elsewhere, so the suite passes while the number it pins is wrong.
    //
    // Keyed on the ROOT DATA, not on a filename convention. A check looking for
    // `*.test.ts` or a nonce in the name is blind to any polluting file written
    // without the convention — 9.4 turned on the mitigation itself.
    const walked = walkSourceFiles([...LIVE, FIXTURE_ROOT, CONTROL_ROOT]);
    premise("the roots resolve to files at all", walked.length, 0);
    expect(walked.filter((w) => SELF.some((self) => w.endsWith(self)))).toEqual([]);
  });

  it("...and the SAME filter DOES match once the scanner's own directory is walked", () => {
    // The positive control, one root apart. Without it the empty result above is
    // satisfied by a filter that matches nothing at all, and "the scanner is not
    // corpus" is indistinguishable from "this check is broken".
    const walked = walkSourceFiles([...LIVE, FIXTURE_ROOT, CONTROL_ROOT, "tests/paneCompaction"]);
    expect(walked.filter((w) => SELF.some((self) => w.endsWith(self))).sort()).toEqual(
      [...SELF].sort(),
    );
  });

  it("is GREEN on the live tree, and its premise guards it IN THE SAME CASE", () => {
    // `expect(scanRepo(...)).toEqual([])` passes trivially whenever the scanner
    // looked at NOTHING — the PR #701 shape, where a guard's premise was false
    // where it ran, so it passed unconditionally and would have forever.
    //
    // COUNTING IS NOT ENOUGH, and that is the correction this carries.
    // `SEND_AUTH_SURFACES.length > 0` and `walked.length > 0` are BOTH satisfiable
    // while the two sets never INTERSECT: unrelated nonempty roots, a registry
    // naming modules the walk never reaches, or a `scanRepo` that ignores its walk
    // entirely all keep the assertion green. A premise must be proven on the
    // case's OWN inputs, so it asserts the intersection rather than cardinalities.
    //
    // It sits in the SAME case as the assertion it guards, not a neighbouring
    // one: a premise in its own `it()` guards nothing, because the assertion case
    // still runs and still passes on its own terms and the gate goes red only
    // because a DIFFERENT case failed. That is one layer wearing the costume of
    // two.
    const walked = walkSourceFiles(LIVE);
    premiseHolds(
      "an enrolled module is among the walked files",
      walked.some((w) => SEND_AUTH_SURFACES.some((r) => w.endsWith(r.module))),
    );
    expect(scanRepo(LIVE)).toEqual([]);
  });

  it("and the SAME roots configuration does report, proven in a SECOND invocation", () => {
    // The positive control cannot share the call whose emptiness the assertion
    // above depends on — one call cannot be both empty and non-empty. The round-1
    // version of this premise put it in that same call and was internally
    // unsatisfiable; the round-2 reviewer caught it.
    //
    // The ONLY delta between the two calls is one added root, so a non-empty
    // result here is what makes the emptiness above mean "found nothing wrong"
    // rather than "looked at nothing".
    const controlFile = `${CONTROL_ROOT}/unregistered-live-importer.ts`;
    const importLine =
      readFileSync(controlFile, "utf8")
        .split("\n")
        .findIndex((l) => l.includes("import type { Surface }")) + 1;
    // Derived from the fixture's own text, and proven to have resolved: a `0`
    // flowing into the expected record would be a check that cannot fail.
    premise("the control fixture's import line resolved", importLine, 0);

    expect(scanRepo([...LIVE, CONTROL_ROOT])).toEqual([
      {
        code: "UNREGISTERED-IMPORTER",
        file: controlFile,
        line: importLine,
        name: "Surface",
        lines: [importLine],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Task 8 repairs. Every case below was added because the SOURCE-MUTATION GATE
// proved the corpus could not see the defect: the first scored run was 0.8584
// with 31 unaccepted survivors, and four of those were genuine fail-open holes
// rather than equivalences. Four plan rounds did not find them; one 906s run did.
// ---------------------------------------------------------------------------

describe("Task 8 — holes the mutation gate found, each now pinned", () => {
  it("derives the read set from an INTERFACE declaration too", () => {
    // The whole `interface` branch was REMOVABLE with the corpus green, because
    // every other fixture spells its surface as a type alias. A scanner
    // understanding one spelling returns an EMPTY read set — silently — against a
    // module using the other.
    expect(readsFor(readFixture("interface-surface.ts"), CHANNEL_ROW)).toEqual([
      "panes",
      "gauge",
      "memo",
      "claim",
    ]);
  });

  it("ignores type members whose names are not identifiers", () => {
    // A quoted key and an index signature are not read names. Admitting them puts
    // `wire-format` into the read set.
    expect(readsFor(readFixture("exotic-type-members.ts"), CHANNEL_ROW)).toEqual([
      "panes",
      "gauge",
      "memo",
      "claim",
    ]);
  });

  it("discovers an UNNAMED module-level function that is send-bearing", () => {
    // Requiring a NAME made `export default function () { ch.dispatch(...) }`
    // undiscoverable, and therefore silent — a send-bearing function nobody
    // reports, which is the direction the consequence bound forbids.
    const f = "anonymous-toplevel-send.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "(anonymous)", lineOf(f, "export default function")),
    ]);
  });

  it("reports a bare mention that no earlier classifier arm names", () => {
    // The classifier's FINAL FALLTHROUGH was unreached: its report statement was
    // removable with the corpus green.
    const f = "bare-mention-in-array.ts";
    expect(scan(f)).toEqual([finding(f, "UNCLASSIFIED-USE", "ch", lineOf(f, "const held = [ch]"))]);
  });

  it("reports a read member handed on as a bare CALL ARGUMENT", () => {
    // The called-versus-referenced test must ask whether the call's CALLEE is this
    // access, not merely whether a call is nearby — otherwise a member passed as a
    // callback reads as an invocation and is silently classified.
    const f = "read-as-call-argument.ts";
    expect(scan(f)).toEqual([finding(f, "UNCLASSIFIED-USE", "memo", lineOf(f, "mint(ch.memo)"))]);
  });

  it("does not treat a declared helper called with something ELSE as a derivation", () => {
    // Recognizing a helper by its callee alone makes any `snapshotOf(...)` a
    // derivation, and the pass then silently satisfies "exactly one" without ever
    // snapshotting the surface.
    const f = "helper-other-argument.ts";
    expect(scan(f)).toEqual([
      finding(f, "MISSING-DERIVATION", "authorizeOnce", lineOf(f, "const authorizeOnce")),
    ]);
  });

  it("accepts the marker attaching to the send-bearing function ITSELF", () => {
    // Two arms the corpus never exercised while every pass was a nested arrow: the
    // containment test must accept a function as lexically within itself, and the
    // pass name must come from a FunctionDeclaration rather than a variable
    // declaration. A finding NAMED `settle` proves both.
    const f = "pass-is-toplevel-function.ts";
    expect(scan(f)).toEqual([
      finding(f, "MISSING-DERIVATION", "settle", lineOf(f, "export function settle")),
    ]);
  });

  it("skips a COMMENT RUN between the marker and the declaration it attaches to", () => {
    expect(scan("marker-then-comment.ts")).toEqual([]);
  });

  it("...and its positive pair, one delta apart, still reports", () => {
    // Same comment run, but what follows it is not a function — so the marker
    // attaches to nothing and the pass stays undeclared. Without this pair, the
    // clean result above is satisfied by a scanner that never resolved the marker.
    const f = "marker-then-comment-detached.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });
});

describe("Task 8 — second repair pass, from the re-measure at 0.9259", () => {
  it("REPORTS a sink called at module scope, which was silence until diff r1", () => {
    // This case asserted CLEAN and called it a documented limit. Diff round 1
    // showed the limit was the wrong disposition: discovery ranges over
    // module-level FUNCTIONS by design (§3.5, so a nested arrow is not reported as
    // its own pass), and a send-bearing construct OUTSIDE that range was therefore
    // vanishing rather than being limited. The bound is "handled correctly or
    // SIGNALED — never silently wrong", and silence about a send with no pass is
    // exactly what it forbids.
    //
    // The repair is DEFAULT-DENY, not a wider recognizer: what discovery cannot
    // reach is reported. An expect-a-REPORT case is also the stronger direction —
    // an expect-CLEAN case is satisfied by any implementation that fails to look.
    const f = "module-level-sink.ts";
    // NAMED for the declaration that holds the call (`sent`) rather than with a
    // generic "(module scope)" label — the report points somewhere an author can
    // act on. The fallback label exists for a call held by no named construct.
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "sent", lineOf(f, "ch.dispatch("))]);
  });

  it("a derivation under TWO blocking ancestors reports ONCE", () => {
    // The straight-line walk stops at the first blocking ancestor. Without that
    // stop it emits one finding per enclosing loop or function — duplicates no
    // single-ancestor fixture can see, and both existing round-3 F1 shapes have
    // exactly one ancestor each.
    const f = "derivation-in-loop-in-callback.ts";
    expect(scan(f)).toEqual([
      finding(f, "NON-STRAIGHT-LINE-DERIVATION", "snap", lineOf(f, "const snap: Channel")),
    ]);
  });

  it("does NOT accept a comment that merely CONTAINS the marker token", () => {
    // The grammar is LITERAL. An unanchored matcher passed the ENTIRE corpus
    // until this fixture existed, because nothing carried the token alongside
    // other text — and the mutation gate's operator set cannot express that
    // change, so only building the weaker implementation by hand found it.
    //
    // This is the executable form of the scanner's documented limit: a marker
    // with trailing text is unrecognized and its function REPORTS, which is the
    // conservative direction.
    const f = "marker-with-trailing-text.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });

  it("names an UNNAMED pass function rather than reaching for a name that is not there", () => {
    const f = "anonymous-pass.ts";
    expect(scan(f)).toEqual([
      finding(f, "MISSING-DERIVATION", "(anonymous)", lineOf(f, "export default function")),
    ]);
  });

  it("reports two markers STACKED above ONE declaration", () => {
    // Rule 21.1 — association has more than one axis, and varying one and calling
    // the boundary covered is the same defect as a fixture whose observation a
    // different rule decides. The axes already carried: ADJACENCY
    // (`marker-then-comment`), TARGET KIND (`marker-then-comment-detached`), SCOPE
    // (`two-sends-one-marker`), SELF (`pass-is-toplevel-function`), and
    // multiplicity ACROSS targets (`ambiguous-pass`). Multiplicity ON ONE target
    // was uncovered.
    //
    // Both markers resolve past the intervening comment to the SAME declaration,
    // so `lines` names that one declaration TWICE — the observable difference from
    // `ambiguous-pass`, whose two lines differ. An implementation deduping the
    // pass set by attached node collapses this to one pass and reports clean.
    const f = "stacked-markers.ts";
    const decl = lineOf(f, "const authorizeOnce");
    expect(scan(f)).toEqual([finding(f, "AMBIGUOUS-PASS", "settle", fnLine(f), [decl, decl])]);
  });
});
