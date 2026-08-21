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

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import ts from "typescript";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

import { premise, premiseHolds } from "../_shared/premise";

import {
  LIVE_ROOTS,
  readsFor,
  scanModule,
  scanRepo,
  SEND_AUTH_SURFACES,
  DECLARING_PARENT_KINDS,
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
    // The premise guards the assertion IN THE SAME CASE, because every assertion
    // below is NEGATIVE and `.not.toContain` on an EMPTY array passes vacuously. A
    // scanner that returned [] -- broken parse, wrong extension, a walk that never
    // ran -- would satisfy "no declared member is a read" perfectly while having
    // looked at nothing. The premise is proven on this case's OWN input rather than
    // by a neighbouring case that happens to pass.
    premise(
      "the read set is non-empty, so the exclusions below are about something",
      reads.length,
      0,
    );
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

  it("resolves a `.js` SPECIFIER onto the TypeScript module it names", () => {
    // Diff r2 F3. TypeScript's bundler and NodeNext resolutions both map
    // `./registered-channel.js` onto `registered-channel.ts`, so this is what every
    // ESM-output codebase writes rather than an obfuscation. Stripping only `.ts` and
    // `.tsx` left the resolved path carrying `.js`, matching no registry row, and the
    // importer went unreported.
    const f = "js-specifier-importer.ts";
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
      // The `.js` specifier importer. Diff r2 F3.
      `UNREGISTERED-IMPORTER ${fixture("js-specifier-importer.ts")}`,
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
    // MOVED BY `task:read-set-member-name`, ADDITIVELY: the quoted member
    // `"wire-format"` is a member and now joins the set, in declaration order.
    // Nothing is removed. The index signature stays out and that is correct --
    // it names no member at all.
    expect(readsFor(readFixture("exotic-type-members.ts"), CHANNEL_ROW)).toEqual([
      "panes",
      "gauge",
      "memo",
      "claim",
      "wire-format",
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

  it("does not let ONE pass's derivation name exempt ANOTHER pass's raw binding", () => {
    // Diff r1 F1. `derived` was a module-wide Set of NAMES, so a derivation called
    // `snap` in `settle` removed the raw parameter `snap` in `other` from the raw
    // set entirely, and `other`'s double read went unreported. The killer audit is
    // what proved this case was MISSING rather than merely passing: with the fix in
    // place but no fixture, reverting the scoping left the suite green.
    const f = "derivation-name-collision.ts";
    // The classifier half of the same scoping: a bare mention of `snap` OUTSIDE the
    // pass that derived that name must still be reported. Under the module-wide set
    // it was skipped, so this and the MULTI-READ below fail on different arms.
    expect(scan(f)).toContainEqual(
      finding(f, "UNCLASSIFIED-USE", "snap", lineOf(f, "const held = [snap]")),
    );
    expect(scan(f)).toContainEqual(
      finding(f, "MULTI-READ", "panes", lineOf(f, "const first = snap.panes()"), [
        lineOf(f, "const first = snap.panes()"),
        lineOf(f, "const second = snap.panes()"),
      ]),
    );
  });

  it("...and its control, one variable apart, reports the SAME finding", () => {
    // Identical second function with the colliding first function REMOVED. Without
    // it, the case above is satisfied by an implementation reporting MULTI-READ for
    // an unrelated reason; with it, the only difference between reporting and not
    // is the scoping under test.
    const f = "derivation-name-collision-control.ts";
    expect(scan(f)).toContainEqual(
      finding(f, "MULTI-READ", "panes", lineOf(f, "const first = snap.panes()"), [
        lineOf(f, "const first = snap.panes()"),
        lineOf(f, "const second = snap.panes()"),
      ]),
    );
  });

  it("rejects the exemption for a derived NAME used OUTSIDE the pass that derives it", () => {
    // What makes the exemption's CONTAINMENT test decide, which no other case does.
    // The name matches a real derivation, so the comparison passes; the use sits
    // outside the pass, so containment must reject it; and the binding is
    // module-level, so the shadow check has nothing to say. All three conjuncts are
    // load-bearing here and exactly one of them is under test.
    const f = "derived-name-used-outside-its-pass.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "snap", lineOf(f, "const parked = [snap]")),
    ]);
  });

  it("exempts a bare mention of the DERIVED binding, with the surface bound at module scope", () => {
    // The exemption's own name comparison is only DECIDING when nothing else answers
    // first. Every other fixture takes the surface as a PARAMETER, and a parameter of
    // an enclosing function shadows its own name by construction, so the shadow check
    // answers and the comparison never runs. Binding at module scope removes that
    // dominance.
    //
    // Expect-CLEAN here is the strong direction rather than the weak one, because the
    // mutant it targets makes the scanner report MORE: break the name comparison and
    // `snap` stops matching its own derivation, so this mention is classified and the
    // case reds on an EXTRA finding.
    expect(scan("derived-mention-module-binding.ts")).toEqual([]);
  });

  it("decides the derivation exemption on the NAME, beside a real derivation", () => {
    // The exemption's own predicate was untestable until this fixture. Every other
    // case reaching `derivedAt` has either NO declared pass or a pass with NO
    // derivation, and both short-circuit the `.some(...)` to false whatever the
    // predicate says — so a mutant could break the name comparison OR the containment
    // conjunction and the whole corpus still passed. THE POPULATION REACHING A
    // PREDICATE IS NOT THE POPULATION OF CASES THAT MENTION IT, and only the gate can
    // tell the difference.
    //
    // Here the pass derives `snap` and separately mentions `ch` bare, so the exemption
    // must decide `ch` on its name and REJECT it.
    const f = "unclassified-beside-a-derivation.ts";
    expect(scan(f)).toEqual([finding(f, "UNCLASSIFIED-USE", "ch", lineOf(f, "const held = [ch]"))]);
  });

  it("does not let a derived name exempt a RAW parameter SHADOWING it in the same pass", () => {
    // Diff r2 F1. `derivation-name-collision` covers the CROSS-pass case; this is the
    // same defect one scope down. The inner arrow takes its own `snap` parameter — a
    // RAW surface binding — and an exemption keyed on (pass, NAME) exempts it because
    // a derivation of that name exists somewhere in the same pass.
    //
    // Name-keyed exemptions do not fail at the boundary they were written for. They
    // fail wherever the same NAME reappears meaning something else.
    // The CODE is NON-STRAIGHT-LINE-READ rather than MULTI-READ, and that is the
    // scanner being right where my first expectation was wrong: both reads sit inside
    // a nested arrow, so rule 2's position arm owns them and reports each by line.
    // What the finding proves is unchanged — before the fix this module reported
    // NOTHING AT ALL, because the shadowing parameter inherited the derivation's
    // exemption. Silence was the defect; which code closes it is the scanner's call.
    // MOVED BY THIS TASK, ADDITIVELY, and updated here rather than deferred --
    // a task cannot reach green while leaving its own suite red. `snap` is
    // declared TWICE in this pass with competing surface-typed declarations, so
    // rule B voids the exemption for the whole pass and the closing
    // `return inner(snap)` is a raw handoff. NOTHING IS REMOVED: both prior
    // findings stand unchanged, which is what makes the change additive rather
    // than merely small. A silently updated expectation is indistinguishable
    // from a regression somebody accommodated.
    const f = "same-pass-shadowed-derivation.ts";
    expect(scan(f)).toEqual([
      finding(f, "NON-STRAIGHT-LINE-READ", "panes", lineOf(f, "const a = snap.panes()")),
      finding(f, "NON-STRAIGHT-LINE-READ", "panes", lineOf(f, "const b = snap.panes()")),
      finding(f, "RAW-HANDOFF", "inner", lineOf(f, "return inner(snap);")),
    ]);
  });

  it("reports a sink whose receiver is PARENTHESIZED", () => {
    // Diff r2 F2. Parentheses are a transparent wrapper — same meaning, same
    // evaluation order — but the sink walk inspected the callee's expression NODE,
    // and a ParenthesizedExpression is neither an identifier nor a property access.
    // Discovery missed it AND the default-deny arm missed it, so the module reported
    // nothing at all: a wrapper that changes no semantics silenced the guard.
    //
    // Its positive pair is `class-field-sink`, identical but for the parentheses.
    const f = "parenthesized-receiver.ts";
    expect(scan(f)).toEqual([
      // Anchored on the call's own arguments: the fixture's FIRST LINE names the
      // construct it explains, so the looser anchor resolved to the header comment.
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, '(this.ch).dispatch("p1"')),
    ]);
  });

  it("reports a sink whose receiver is a property access, inside a top-level function", () => {
    // Diff r3 F6 — the one finding of that round that probed SILENT, and the third
    // recurrence of ONE axis (r1 F3, r2 F2, this). Each time an arm DECLINED to
    // classify and the scanner said nothing, so the repair direction is NARROWING:
    // the classification is computed once and shared, suppression may rest only on a
    // classification that actually happened, and discovery resolves a receiver by the
    // same rightmost-name rule the walk already used.
    //
    // Probed against the shipped scanner BEFORE the repair: 0 findings. One variable
    // from `class-field-sink`, which reports without the wrapper.
    const f = "wrapped-class-field-sink.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "build", lineOf(f, "export function build")),
      // The handoff is reported too, and independently: `new Driver(injected)` passes
      // a raw surface to a constructor, which no declared set classifies.
      finding(f, "UNCLASSIFIED-USE", "injected", lineOf(f, "new Driver(injected)")),
    ]);
  });

  it("reports an unclassified member reached through a PROPERTY-ACCESS receiver", () => {
    // Diff r4 F1. The bare form already reported; the property-receiver form was
    // SILENT, because the classifier walks IDENTIFIERS and `ch` inside `this.ch` is a
    // property NAME it skips. Probed side by side before the repair: `ch.typo()` -> 1,
    // `this.ch.typo()` -> 0.
    //
    // The repair is that asymmetry and nothing wider. `ch.panes()` and
    // `this.ch.panes()` both scan clean outside a pass, and they AGREE — a read
    // outside a declared pass is unconstrained by rule 2 — so a blanket report on
    // member reads would have fired on correct code.
    const f = "member-receiver-unclassified.ts";
    expect(scan(f)).toEqual([
      // Anchored on the INDENTED call, not the bare text: the header comment names
      // the construct it explains, so the looser anchor resolves to line 4. Same trap
      // the r2 parenthesized-receiver case hit.
      finding(f, "UNCLASSIFIED-USE", "typo", lineOf(f, "    this.ch.typo();")),
    ]);
  });

  it("reports a RAW HANDOFF of a parameter that shadows a derivation name", () => {
    // Diff r4 F2 — diff r2 F1's defect still live ONE ARM OVER. The read path learned
    // to resolve the shadow; the handoff path was still handed a set of raw NAMES,
    // every binding minus every name a derivation declares, so the shadowing parameter
    // was subtracted BY NAME and its handoff went unreported. The arm now asks the
    // same shadow-aware question, so a binding the scanner cannot SHOW to be derived
    // at this use is RAW — failing closed.
    // MOVED BY THIS TASK, ADDITIVELY. Same cause as its sibling: two competing
    // declarations of `snap` in one pass void the exemption, so the closing
    // handoff reports too. The pre-existing `leak` finding is untouched.
    const f = "shadowed-param-handoff.ts";
    expect(scan(f)).toEqual([
      finding(f, "RAW-HANDOFF", "leak", lineOf(f, "leak(snap)")),
      finding(f, "RAW-HANDOFF", "inner", lineOf(f, "return inner(snap);")),
    ]);
  });

  it("reports the surface DESTRUCTURED in a parameter, naming the bound member", () => {
    // Diff r1 F2, and the case the arm shipped WITHOUT. `settle({ dispatch }: Channel)`
    // calls the sink through a bare local, so no property access on a binding exists
    // and every member-based arm is blind to it. Four mutants survived on this arm
    // alone — the report, the recursion, the entry call, and the parameter/variable
    // disjunct — while the suite was green, because the case lived only in a scratch
    // probe. A fix with no case is a claim.
    const f = "destructured-param-sink.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "dispatch", lineOf(f, "export function settle({ dispatch }")),
      // STRENGTHENED by the r3 F6 narrowing, and the second instance of that defect —
      // found by sweeping the shape rather than by a later round. This function sends
      // and declares no pass, but the walk used to suppress it on mere CONTAINMENT in
      // a top-level function that discovery had already declined (a bare destructured
      // callee is not a property access, so it was never classified). The single
      // finding pinned here before was the under-report.
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, 'dispatch("p1"')),
    ]);
  });

  it("reports the surface ASSIGNED to a plain variable", () => {
    // The SECOND negative half of the `this.ch = injected` exemption, killing a
    // different weakening than `binding-in-comparison` does. That exemption is a
    // five-part conjunction; weakening the connector after the OPERATOR test yields
    // `(isBinaryExpression && operatorIsEquals) || (rest)`, so any `=` assignment
    // mentioning the surface is exempted no matter what it assigns INTO.
    //
    // `binding-in-comparison` cannot reach that: its operator is `!==`, so the first
    // disjunct is false there and the mutant behaves exactly like the original. Two
    // negatives, two different weakenings — neither substitutes for the other.
    const f = "assigned-to-plain-variable.ts";
    const found = scan(f);
    const line = lineOf(f, "holder = ch");
    // Order-independent: both findings sit on ONE line, so they have no natural
    // order and a positional array would pin an accident of traversal.
    expect(found).toHaveLength(2);
    expect(found).toContainEqual(finding(f, "UNCLASSIFIED-USE", "holder", line));
    expect(found).toContainEqual(finding(f, "UNCLASSIFIED-USE", "ch", line));
  });

  it("falls through to (module scope) for a sink in a CLASS PROPERTY INITIALIZER", () => {
    // The only case that reaches the naming walk's FALLBACK: every other reported
    // call has a method, function, property-assignment or variable declaration above
    // it. Until this fixture the fallback was unexercised, so its arm was removable.
    //
    // It also kills the function-declaration arm's weakening: as a disjunction that
    // arm fires on ANY ancestor whose `.name` is defined, which here is the
    // PropertyDeclaration `done`, so the mutant names `done` where the shipped walk
    // correctly declines every arm. The shipped walk declines on purpose — a property
    // declaration is not a callable construct, and naming it would point an author at
    // a declaration rather than at the code that runs.
    const f = "sink-in-class-property.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "(module scope)", lineOf(f, 'ch.dispatch("p1"')),
    ]);
  });

  it("reports a surface binding used in a COMPARISON", () => {
    // The negative half of the `this.ch = injected` exemption, which is deliberately
    // narrow: an assignment whose TARGET is a property of `this`. Widen its
    // conjunction to a disjunction and every identifier whose parent is a binary
    // expression is exempted — including this one, which then falls silent.
    const f = "binding-in-comparison.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "ch", lineOf(f, "return ch !== maybe")),
    ]);
  });

  it("names the NEAREST enclosing named construct, not the method containing it", () => {
    // A sink inside a named function nested in a class method must report `inner`,
    // not `run`. The naming walk checks a METHOD arm before a FUNCTION-DECLARATION
    // arm, so a mutant that stops the function arm matching does not fail loudly — it
    // silently names the method instead, a different and wronger answer. Asserting
    // the NAME rather than merely that something reported is what catches it.
    const f = "nested-named-function-sink.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "inner", lineOf(f, 'ch.dispatch("p1"')),
    ]);
  });

  it("does NOT fire on a sink's NAME belonging to some other object", () => {
    // The sink test is a conjunction: the receiver's rightmost name is a surface
    // BINDING, and the member is a declared sink. Weaken it to a disjunction and it
    // fires on any `.dispatch(...)` anywhere — a false positive on correct code,
    // which the consequence bound forbids as firmly as silence.
    //
    // Expect-CLEAN, and attributable rather than accidental because its positive pair
    // is ONE VARIABLE away: `class-field-sink` reaches the same arm through the same
    // shape, differing only in that its receiver IS a surface binding.
    expect(scan("sink-name-on-other-object.ts")).toEqual([]);
  });

  it("reports a sink reached through a CLASS FIELD holding the surface", () => {
    // Rule 28 applied to this arc's OWN repair: a narrowing that declines an input
    // owes that input a CHANNEL, and "nothing" is not one. The diff-r1 totality arm
    // reached sinks called on a bare identifier binding; `this.ch.dispatch(...)`
    // has a PROPERTY ACCESS receiver and a PropertyDeclaration binding, so it was
    // declined by both halves and reported nothing at all.
    //
    // The one class still declined is a receiver that is a CALL RESULT
    // (`getChannel().dispatch()`), and that is DECLARED SILENCE under the ratified
    // no-call-graph fence rather than an accidental gap.
    const f = "class-field-sink.ts";
    expect(scan(f)).toEqual([
      // Anchored on the CALL's own text, not on `this.ch.dispatch(`: the fixture's
      // header prose names that construct too, so the looser anchor resolved to the
      // comment at line 7. A fixture's own explanation is part of the text a lookup
      // searches — the same collision rule 21 pins at corpus scale, in miniature.
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, 'this.ch.dispatch("p1"')),
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

// ---------------------------------------------------------------------------
// AC-U16a / AC-U16b groundwork — THE DERIVED FIXTURE MANIFEST AND THE
// DIRECTIVE CENSUS (spec §2.5)
//
// The deepest measurement in the spec's §3 is not any single silent miss: it is
// that this 81-fixture corpus contained ZERO instances of ANY of §3's shapes,
// so the suite was GREEN throughout while four consecutive review rounds each
// contributed one instance. Review was acting as the corpus-authoring
// mechanism. A suite cannot fail on a shape its corpus does not contain, so a
// green run over it is evidence about COVERAGE and nothing about correctness.
//
// The manifest is the bound on that. Every fixture names the RULE-ELEMENT it
// exists for and an unmapped fixture REDS, so the corpus has no independent
// growth channel: it can only grow when the RULE gains a decision input, and
// rule changes are what the round cap already governs.
//
// THE COMPARISON HAS AN INDEPENDENT WITNESS ON ONE SIDE. Axes are checked
// against the spec's own §2.5 table ON DISK and the fixture set against the
// DIRECTORY ON DISK. Derivation is right for a COVER and wrong for BOTH SIDES
// of a comparison -- two derivations from one constant cannot disagree, because
// a drift moves them together. The filesystem does not know what the constant
// says, and neither does the spec.
//
// WHAT THIS TASK DELIBERATELY DOES NOT REACH FOR. The `Receiver` union and the
// wrapper enum do not exist yet; their parity assertions belong to the task
// that INTRODUCES each constant. Importing a symbol a later task creates would
// turn this cycle's red into a COLLECTION failure, which goes green when the
// test file changes rather than when the implementation lands. Those axes are
// declared OWED below, naming their owning task, so the gap is a checked
// baseline rather than a silent exemption.
// ---------------------------------------------------------------------------

const SPEC_PATH =
  "docs/superpowers/specs/ci/2026-08-21-sendauth-arm-classifier-unification-design.md";
const PLAN_PATH = "docs/superpowers/plans/ci/2026-08-21-sendauth-arm-classifier-unification.md";

/**
 * The axes of spec §2.5's classification table. A closed union, so a cell
 * naming an axis that does not exist DOES NOT COMPILE -- the bound is the TYPE,
 * and the runtime assertions below check only what a type cannot express.
 */
type AxisId =
  | "binding kind"
  | "position"
  | "exemption state"
  | "parenthesis depth"
  | "member-chain depth"
  | "receiver shape, once depth is factored out"
  | "wrapper kind"
  | "annotation certainty";

const AXIS_IDS: readonly AxisId[] = [
  "binding kind",
  "position",
  "exemption state",
  "parenthesis depth",
  "member-chain depth",
  "receiver shape, once depth is factored out",
  "wrapper kind",
  "annotation certainty",
];

type ManifestCell = {
  /** File name under FIXTURE_ROOT. */
  fixture: string;
  /**
   * A §2.5 axis, or `inherited` for a fixture predating this arc. `inherited`
   * is FROZEN at the BASE corpus size below, so a new fixture cannot hide in it.
   */
  axis: AxisId | "inherited";
  /** The rule-element this fixture exists for. Never a shrug; asserted non-trivial. */
  covers: string;
  /**
   * Set when the fixture's BYTES are the subject: the exact source line a
   * normaliser would rewrite. A formatter's whole job is erasing syntactic
   * distinctions that do not change semantics -- which is precisely the set of
   * things a scanner-under-test is asked to handle.
   */
  syntaxSensitive?: readonly string[];
  /**
   * Which member of the receiver-shape axis this cell occupies. Checked against
   * the SPEC's own axis row on disk, so the five members are read from the
   * document rather than retyped here.
   */
  receiverShape?: string;
};

/**
 * The corpus size at this arc's BASE. `inherited` is a declared baseline, not an
 * open category: an 82nd inherited cell REDS, so a NEW fixture must name a §2.5
 * axis rather than being absorbed as pre-existing.
 */
const INHERITED_CORPUS_SIZE = 81;

const MANIFEST: readonly ManifestCell[] = [
  // --- diff r1 repairs: the ENTRY-point class, distinct from name RESOLUTION.
  {
    fixture: "element-receiver-unknown-member.ts",
    axis: "receiver shape, once depth is factored out",
    covers:
      "diff r1 F1 — an unknown member through a static element-access receiver, paired with its dotted control",
  },
  {
    fixture: "private-identifier-field.ts",
    axis: "binding kind",
    covers:
      "diff r1 F2 — a #ch field must JOIN the binding set, paired with a public field control",
  },
  // --- Task 9 [task:score-measure]: fixtures the mutation gate demanded.
  {
    fixture: "shadow-annotation-null.ts",
    axis: "annotation certainty",
    covers:
      "AC-U12 — `null` is a LiteralType wrapping the keyword and needs its own arm; kills the flip from the silent side",
  },
  {
    fixture: "shadow-annotation-string-literal.ts",
    axis: "annotation certainty",
    covers:
      "AC-U12 — a literal type that is NOT null COMPETES; kills the same flip from the reporting side",
  },
  {
    fixture: "element-key-wrapped.ts",
    axis: "wrapper kind",
    covers: "rule A's unwrap applies to the element KEY as a second name position",
    syntaxSensitive: ['this[("ch")].dispatch("p1", "/compact");'],
  },
  // --- Task 6 [task:read-set-member-name].
  {
    fixture: "quoted-member-read.ts",
    axis: "receiver shape, once depth is factored out",
    covers: "AC-U6 — a QUOTED member joins the read set, which is consumed as a COMPLEMENT",
  },
  // --- Task 5 [task:declaration-name-accept-set].
  {
    fixture: "declaration-name-value-references.ts",
    axis: "annotation certainty",
    covers:
      "AC-U13 — a value reference carrying a `name` is a USE; a guard that must report before AND after",
  },
  {
    fixture: "declaration-name-accepted-kinds.ts",
    axis: "annotation certainty",
    covers: "AC-U13 — a real declaration of an accepted parent kind stays silent",
  },
  // --- Task 4 [task:rule-b-count].
  {
    fixture: "shadow-scope-constructor.ts",
    axis: "exemption state",
    covers: "AC-U4 — scope kind 1 of 4: a constructor parameter re-declares the name",
  },
  {
    fixture: "shadow-scope-set-accessor.ts",
    axis: "exemption state",
    covers: "AC-U4 — scope kind 2 of 4: a set accessor NAME re-declares the name",
  },
  {
    fixture: "shadow-scope-nested-block-surface.ts",
    axis: "exemption state",
    covers:
      "AC-U4 — scope kind 3 of 4: a nested block, surface-typed, and not function-like at all",
  },
  {
    fixture: "shadow-scope-nested-block-opaque.ts",
    axis: "exemption state",
    covers: "AC-U4 — scope kind 4 of 4: a nested block with NO annotation, which competes",
  },
  {
    fixture: "shadow-annotation-string.ts",
    axis: "annotation certainty",
    covers:
      "AC-U5 — a keyword type that cannot hold an object does NOT compete; the exemption survives",
  },
  {
    fixture: "shadow-annotation-surface.ts",
    axis: "annotation certainty",
    covers: "AC-U5 — the expect-a-REPORT pair, one variable away from the string case",
  },
  {
    fixture: "shadow-annotation-any.ts",
    axis: "annotation certainty",
    covers: "AC-U12 — `any` is not an exact surface reference and COULD hold the surface",
  },
  {
    fixture: "shadow-annotation-unknown.ts",
    axis: "annotation certainty",
    covers: "AC-U12 — `unknown` competes",
  },
  {
    fixture: "shadow-annotation-readonly-wrapper.ts",
    axis: "annotation certainty",
    covers: "AC-U12 — a generic wrapper competes",
  },
  {
    fixture: "shadow-annotation-intersection.ts",
    axis: "annotation certainty",
    covers: "AC-U12 — an intersection competes",
  },
  {
    fixture: "call-result-receiver.ts",
    axis: "receiver shape, once depth is factored out",
    receiverShape: "call result",
    covers:
      "the fifth receiver shape — DECLARED SILENCE under the no-call-graph fence, with an in-module control",
  },
  // --- Task 3 [task:sites-consume-rule-a].
  {
    fixture: "property-receiver-double-read.ts",
    receiverShape: "property",
    axis: "receiver shape, once depth is factored out",
    covers:
      "AC-U1 — a doubled read through a property receiver, with a bare pair as the in-function control",
  },
  {
    fixture: "property-receiver-handoff.ts",
    axis: "receiver shape, once depth is factored out",
    covers: "AC-U2 — a raw handoff through a property receiver, paired with a bare handoff",
  },
  {
    fixture: "parenthesized-double-read.ts",
    axis: "parenthesis depth",
    covers: "AC-U3 — the OUTWARD transparent walk, which is D6 and was found by the depth probe",
    syntaxSensitive: ['const first = (ch).gauge("a");', 'const second = (ch).gauge("b");'],
  },
  {
    fixture: "parenthesized-handoff.ts",
    axis: "parenthesis depth",
    covers: "AC-U3 — a parenthesized handoff argument",
    syntaxSensitive: ["helper((ch));"],
  },
  {
    fixture: "element-selector-sink.ts",
    axis: "receiver shape, once depth is factored out",
    covers:
      "the SELECTOR killer — both positions in element form, completely silent under a receiver-only unification",
  },
  {
    fixture: "element-selector-double-read.ts",
    axis: "receiver shape, once depth is factored out",
    covers:
      "the SELECTOR killer — a doubled element-selected read, which a receiver-only form mis-attributes to the binding",
  },
  // --- Task 2 [task:resolve-name]. These name a §2.5 AXIS rather than
  // `inherited`, which the frozen BASE size forces: a new fixture cannot be
  // absorbed as pre-existing.
  {
    fixture: "element-access-receiver.ts",
    receiverShape: "static element access",
    axis: "receiver shape, once depth is factored out",
    covers: "AC-U14 — a statically known element-access receiver resolves from its literal key",
  },
  {
    fixture: "element-access-opaque-key.ts",
    axis: "binding kind",
    covers:
      "AC-U14 — a non-literal element key stays opaque, paired with an in-module reporting control",
  },
  {
    fixture: "wrapper-nonnull-sink.ts",
    axis: "wrapper kind",
    covers: "AC-U15 — a non-null assertion wrapping a sink receiver",
  },
  {
    fixture: "wrapper-as-sink.ts",
    axis: "wrapper kind",
    covers: "AC-U15 — an `as` type assertion wrapping a sink receiver",
  },
  {
    fixture: "wrapper-angle-sink.ts",
    axis: "wrapper kind",
    covers: "AC-U15 — an angle-bracket type assertion wrapping a sink receiver",
  },
  {
    fixture: "wrapper-satisfies-sink.ts",
    axis: "wrapper kind",
    covers: "AC-U15 — a `satisfies` expression wrapping a sink receiver",
  },
  { fixture: "alias-read.ts", axis: "inherited", covers: "AC-1 — an ALIAS of a read member" },
  {
    fixture: "aliased-importer.ts",
    axis: "inherited",
    covers: "AC-9 — discovery follows the SYMBOL, not the local name",
  },
  { fixture: "ambient-alias.ts", axis: "inherited", covers: "AC-1 — a BARE AMBIENT ALIAS" },
  {
    fixture: "ambient-callback-clean.ts",
    axis: "inherited",
    covers: "AC-2 — false-positive guard",
  },
  {
    fixture: "ambiguous-pass.ts",
    axis: "inherited",
    covers: "AC-5 — two declared passes in one send-bearing function is AMBIGUOUS-PASS",
  },
  {
    fixture: "anonymous-pass.ts",
    axis: "inherited",
    covers: "AC-5 — an UNNAMED pass declaration must be named (anonymous), not skipped",
  },
  {
    fixture: "anonymous-toplevel-send.ts",
    axis: "inherited",
    covers: "AC-14 — discovery covers an UNNAMED module-level function",
  },
  {
    fixture: "assigned-to-plain-variable.ts",
    axis: "inherited",
    covers: "AC-1 — the surface assigned to a plain variable is an unclassifiable use",
  },
  {
    fixture: "bare-mention-in-array.ts",
    axis: "inherited",
    covers: "AC-1 — the classifier's FINAL FALLTHROUGH",
  },
  {
    fixture: "bare-mention.ts",
    axis: "inherited",
    covers:
      "AC-1 — a BARE MENTION — the surface held in another binding, from which anything may be called",
  },
  {
    fixture: "binding-in-comparison.ts",
    axis: "inherited",
    covers: "AC-1 — a surface binding in a COMPARISON is unclassifiable",
  },
  {
    fixture: "class-field-sink.ts",
    axis: "inherited",
    covers: "rule 28 — a class field holding the surface reaches the sink",
  },
  { fixture: "computed-member.ts", axis: "inherited", covers: "AC-1 — a COMPUTED member access" },
  {
    fixture: "conditional-pass-no-marker.ts",
    axis: "inherited",
    covers: "AC-15 control — the positive pair for conditional-pass",
  },
  {
    fixture: "conditional-pass.ts",
    axis: "inherited",
    covers: "AC-15 / §4 limit 1 — a conditionally-called pass scans CLEAN, by fence",
  },
  {
    fixture: "derivation-clean.ts",
    axis: "inherited",
    covers: "AC-7b false-positive guard — a derivation ON the straight-line path",
  },
  {
    fixture: "derivation-in-loop-in-callback.ts",
    axis: "inherited",
    covers: "AC-7b — a derivation under TWO blocking ancestors reports ONCE",
  },
  {
    fixture: "derivation-in-loop.ts",
    axis: "inherited",
    covers: "AC-7b — the round-3 F1 shape — the DERIVATION DECLARATION under a two-iteration loop",
  },
  {
    fixture: "derivation-in-named-callback.ts",
    axis: "inherited",
    covers:
      "AC-7b — the round-3 F1 second shape — the DERIVATION DECLARATION inside a named callback invoked more than once",
  },
  {
    fixture: "derivation-leaks-handoff.ts",
    axis: "inherited",
    covers:
      "AC-8 — a derivation exempts the READS taken through it; it does not exempt its whole INITIALIZER SUBTREE",
  },
  {
    fixture: "derivation-name-collision-control.ts",
    axis: "inherited",
    covers: "diff r1 F1 control — one variable apart, must stay silent",
  },
  {
    fixture: "derivation-name-collision.ts",
    axis: "inherited",
    covers: "diff r1 F1 — a derivation name must not exempt a raw binding in another pass",
  },
  {
    fixture: "derived-mention-module-binding.ts",
    axis: "inherited",
    covers: "AC-8 — a MODULE-LEVEL binding is outside the derivation exemption's scope",
  },
  {
    fixture: "derived-name-used-outside-its-pass.ts",
    axis: "inherited",
    covers: "AC-8 — a derivation name does not exempt uses outside its own pass",
  },
  {
    fixture: "destructure-outside-pass.ts",
    axis: "inherited",
    covers: "AC-1 — a DESTRUCTURE in a branch outside the pass",
  },
  {
    fixture: "destructured-param-sink.ts",
    receiverShape: "destructured local",
    axis: "inherited",
    covers: "diff r1 F2 — the surface DESTRUCTURED in a parameter position",
  },
  {
    fixture: "detached-marker.ts",
    axis: "inherited",
    covers: "T2 — a marker attached to a non-function does not declare a pass",
  },
  {
    fixture: "effects-only-no-pass.ts",
    axis: "inherited",
    covers: "AC-14 — discovery is anchored on SINKS, not effects",
  },
  {
    fixture: "exempt-empty-reason.ts",
    axis: "inherited",
    covers: "AC-5 — an EMPTY exempt reason does not suppress",
  },
  {
    fixture: "exempt-with-reason.ts",
    axis: "inherited",
    covers: "AC-5 — an exempt marker with a NON-EMPTY reason suppresses UNDECLARED-PASS",
  },
  {
    fixture: "exotic-type-members.ts",
    axis: "inherited",
    covers: "AC-4 — type members whose names are NOT identifiers",
  },
  {
    fixture: "generic-arrow-scriptkind.ts",
    axis: "inherited",
    covers: "the ScriptKind discriminator — the parse kind must be chosen by extension",
    syntaxSensitive: ["const identity = <T>(x: T): T => x;"],
  },
  {
    fixture: "helper-derivation.ts",
    axis: "inherited",
    covers: "AC-8 — a DECLARED derivation helper as the initializer",
  },
  {
    fixture: "helper-other-argument.ts",
    axis: "inherited",
    covers: "AC-8 — a declared helper called with a non-surface argument",
  },
  {
    fixture: "injection-outside-pass.ts",
    axis: "inherited",
    covers: "AC-3 — the same handoff shape OUTSIDE a pass is ordinary injection",
  },
  {
    fixture: "interface-surface.ts",
    axis: "inherited",
    covers: "AC-4 — the surface type declared as an INTERFACE",
  },
  {
    fixture: "js-specifier-importer.ts",
    axis: "inherited",
    covers: "diff r2 F3 — an unregistered importer using a .js specifier",
  },
  { fixture: "loop-do-while.ts", axis: "inherited", covers: "AC-6 — , iteration kind 4 of 4" },
  { fixture: "loop-for-of.ts", axis: "inherited", covers: "AC-6 — , iteration kind 2 of 4" },
  { fixture: "loop-for.ts", axis: "inherited", covers: "AC-6 — , iteration kind 1 of 4" },
  { fixture: "loop-while.ts", axis: "inherited", covers: "AC-6 — , iteration kind 3 of 4" },
  {
    fixture: "marker-in-jsx.tsx",
    axis: "inherited",
    covers: "AC-5 — a marker token inside JSX TEXT is not a declaration",
  },
  {
    fixture: "marker-in-string.ts",
    axis: "inherited",
    covers: "AC-5 — a marker token inside a STRING LITERAL is not a declaration",
  },
  {
    fixture: "marker-then-comment-detached.ts",
    axis: "inherited",
    covers: "AC-5 control — one delta apart, the comment run is followed by something else",
  },
  {
    fixture: "marker-then-comment.ts",
    axis: "inherited",
    covers: "AC-5 — the marker skips a following COMMENT RUN to reach its declaration",
  },
  {
    fixture: "marker-with-trailing-text.ts",
    axis: "inherited",
    covers: "AC-5 — the marker grammar is LITERAL, not containment",
  },
  {
    fixture: "member-receiver-unclassified.ts",
    axis: "inherited",
    covers: "diff r4 F1 — a member receiver reported as UNCLASSIFIED-USE",
  },
  {
    fixture: "module-level-sink.ts",
    axis: "inherited",
    covers: "a sink at MODULE scope is a documented limit, not a pass",
  },
  {
    fixture: "multi-derivation.ts",
    axis: "inherited",
    covers: "AC-8 — TWO derivations in one pass",
  },
  {
    fixture: "multi-read.ts",
    receiverShape: "bare",
    axis: "inherited",
    covers: "AC-7 — TWO straight-line reads of the SAME method report MULTI-READ naming BOTH lines",
  },
  {
    fixture: "named-callback.ts",
    axis: "inherited",
    covers: "AC-6 — the round-2 F2 shape — a NAMED callback invoked twice inside the pass",
  },
  {
    fixture: "namespace-importer-unused.ts",
    axis: "inherited",
    covers: "AC-9 — the negative pair: a namespace import that never reaches the surface",
  },
  {
    fixture: "namespace-importer.ts",
    axis: "inherited",
    covers: "AC-9 — a NAMESPACE import of a registered module is an import edge",
  },
  { fixture: "nested-arrow.ts", axis: "inherited", covers: "AC-6 — , function-like kind 2 of 4" },
  {
    fixture: "nested-function-declaration.ts",
    axis: "inherited",
    covers: "AC-6 — , function-like kind 1 of 4",
  },
  {
    fixture: "nested-function-expression.ts",
    axis: "inherited",
    covers: "AC-6 — , function-like kind 4 of 4",
  },
  {
    fixture: "nested-named-function-sink.ts",
    axis: "inherited",
    covers: "AC-6 — a sink reached from a NAMED function nested in a class method",
  },
  {
    fixture: "nested-object-method.ts",
    axis: "inherited",
    covers: "AC-6 — , function-like kind 3 of 4",
  },
  {
    fixture: "parenthesized-receiver.ts",
    axis: "inherited",
    covers: "diff r2 F2 — a PARENTHESIZED receiver is a transparent wrapper",
    syntaxSensitive: ['(this.ch).dispatch("p1", "/compact");'],
  },
  {
    fixture: "pass-is-toplevel-function.ts",
    axis: "inherited",
    covers: "T2 — the marker may attach to the send-bearing function ITSELF",
  },
  {
    fixture: "read-as-call-argument.ts",
    axis: "inherited",
    covers: "AC-2 — a READ member handed on as a bare CALL ARGUMENT, not as a property value",
  },
  {
    fixture: "read-callback-reports.ts",
    axis: "inherited",
    covers: "AC-2 discriminator — the same handoff shape with a READ member REPORTS",
  },
  {
    fixture: "registered-channel.ts",
    axis: "inherited",
    covers: "T6 — a REGISTERED module exporting the surface type",
  },
  {
    fixture: "registered-importer.ts",
    axis: "inherited",
    covers: "AC-9 false-positive guard — a registered importer must not report",
  },
  {
    fixture: "round4-raw-handoff.ts",
    axis: "inherited",
    covers: "AC-8 regression pin — two raw handoffs on ONE line, distinguished by callee",
  },
  {
    fixture: "same-pass-shadowed-derivation.ts",
    axis: "inherited",
    covers: "diff r2 F1 — a RAW parameter shadowing a derived name in the same pass",
  },
  {
    fixture: "second-registered-channel.ts",
    axis: "inherited",
    covers: "T6 — a SECOND registered module in one run",
  },
  {
    fixture: "shadowed-param-handoff.ts",
    axis: "inherited",
    covers: "diff r4 F2 — diff r2 F1's defect, one arm over",
  },
  {
    fixture: "single-read-clean.ts",
    axis: "inherited",
    covers: "AC-6/AC-7 false-positive guard — one straight-line read scans CLEAN",
  },
  {
    fixture: "sink-in-class-property.ts",
    axis: "inherited",
    covers: "AC-14 — a sink in a CLASS PROPERTY INITIALIZER",
  },
  {
    fixture: "sink-name-on-other-object.ts",
    axis: "inherited",
    covers: "AC-14 — a sink's NAME on an object that is not the surface",
  },
  {
    fixture: "sink-not-called-row-driven.ts",
    axis: "inherited",
    covers: "T2 — the row's declared sink drives discovery, not a hardcoded name",
  },
  {
    fixture: "spread-derivation.ts",
    axis: "inherited",
    covers:
      "AC-8 — a SPREAD is a derivation, and reads THROUGH the derived binding are unconstrained",
  },
  {
    fixture: "stacked-markers.ts",
    axis: "inherited",
    covers: "rule 21.1 — TWO markers stacked above ONE declaration",
  },
  {
    fixture: "surface-type-extra-member.ts",
    axis: "inherited",
    covers: "AC-4 — the surface type whose read set is derived",
  },
  {
    fixture: "two-sends-one-marker.ts",
    axis: "inherited",
    covers: "T2 — two send-bearing functions, one correctly-scoped marker",
  },
  {
    fixture: "unclassified-beside-a-derivation.ts",
    axis: "inherited",
    covers: "AC-8 — an unclassifiable RAW use beside a derivation in one pass",
  },
  {
    fixture: "undeclared-pass.ts",
    axis: "inherited",
    covers: "AC-5 — a send-bearing function with no declared pass is UNDECLARED-PASS",
  },
  {
    fixture: "unregistered-importer.ts",
    axis: "inherited",
    covers: "AC-9 — a module that imports a REGISTERED surface type and has NO row",
  },
  {
    fixture: "wrapped-class-field-sink.ts",
    axis: "inherited",
    covers: "diff r3 F6 — a WRAPPED class-field receiver reaching a sink",
  },
  {
    fixture: "zero-derivations.ts",
    axis: "inherited",
    covers: "AC-8 — ZERO derivations violates 'exactly one' just as two do",
  },
];

/**
 * Cells the cross-product generates and no fixture can occupy. A struck cell
 * carries its REASON, so a later reader meets the argument rather than an
 * absence -- an exemption with no consequence is a shrug wearing a token's name.
 */
const STRUCK: readonly { axis: AxisId; cell: string; reason: string }[] = [
  {
    axis: "binding kind",
    cell: "opaque × any resolvable receiver shape",
    reason:
      "`opaque` IS rule A's output when no receiver shape resolves, so the two cannot co-occur by construction rather than by omission",
  },
  {
    axis: "parenthesis depth",
    cell: "destructured local × depth > 0",
    reason:
      "a destructured local has no receiver expression, so there is nothing to parenthesize; the depth axis is undefined here rather than untested",
  },
  {
    axis: "member-chain depth",
    cell: "destructured local × depth > 0",
    reason: "same absence of a receiver expression: a chain needs a receiver to hang from",
  },
];

/**
 * Axes whose SHIPPED CONSTANT does not exist at this task's position. Each names
 * the task that introduces the constant and therefore owes the parity assertion.
 *
 * This is a DECLARED BASELINE that shrinks, not an exemption: the owner must be
 * a task slug that exists in the plan, asserted below against the plan ON DISK,
 * so an owed cell cannot name a task nobody is going to run.
 */
const OWED: readonly { axis: AxisId; cell: string; owner: string }[] = [
  {
    axis: "position",
    cell: "D1 … D6, derived by the ADOPTION SCAN rather than listed",
    owner: "task:scans-and-routing",
  },
  {
    axis: "parenthesis depth",
    cell: "independence proof over 0, 1, 2 and a deep case",
    owner: "task:scans-and-routing",
  },
  {
    axis: "member-chain depth",
    cell: "independence proof over structurally distinct chain depths",
    owner: "task:scans-and-routing",
  },
];

/** The directive a normaliser-sensitive cell must carry, immediately above its line. */
const PRETTIER_DIRECTIVE = "// prettier-ignore";

/**
 * Does `text` carry PRETTIER_DIRECTIVE on the line IMMEDIATELY above the single
 * occurrence of `line`? Exported as a predicate so the census can be run against
 * a CONSTRUCTED VIOLATION and observed to fail -- a check never seen to fail is
 * a claim, not a proof, and it fails in the direction that looks green.
 */
const directiveImmediatelyAbove = (
  text: string,
  line: string,
): { ok: boolean; occurrences: number; reason: string } => {
  const lines = text.split("\n");
  const at = lines.reduce<number[]>(
    (acc, l, i) => (l.trim() === line.trim() ? [...acc, i] : acc),
    [],
  );
  if (at.length !== 1) {
    return {
      ok: false,
      occurrences: at.length,
      reason:
        at.length === 0
          ? "the declared line is ABSENT — the fixture moved and this cell now names nothing"
          : `the declared line occurs ${at.length} times, so "immediately above" names no single site`,
    };
  }
  const idx = at[0]!;
  const above = idx > 0 ? lines[idx - 1]!.trim() : "";
  return above === PRETTIER_DIRECTIVE
    ? { ok: true, occurrences: 1, reason: "" }
    : {
        ok: false,
        occurrences: 1,
        reason: `the line above is ${JSON.stringify(above)}, not ${JSON.stringify(PRETTIER_DIRECTIVE)} — anything in between DETACHES the directive`,
      };
};

describe("AC-U16 groundwork — the fixture manifest is DERIVED and the corpus cannot grow silently", () => {
  it("declares every axis the spec's §2.5 table declares, and no others", () => {
    // The independent witness: the SPEC on disk. A drift in either side moves one
    // and not the other, which is the only arrangement in which a comparison can
    // disagree at all.
    const spec = readFileSync(SPEC_PATH, "utf8");
    const table = spec.split("\n").filter((l) => /^\| /.test(l));
    const rows = table
      .map((l) => l.split("|")[1] ?? "")
      .map((c) => c.replace(/\*\*/g, "").trim())
      .map((c) => c.split(" — ")[0]!.trim())
      .filter((c) => c && c !== "axis" && !/^-+$/.test(c));

    premiseHolds(
      "the spec's §2.5 axis table was READ, not merely opened",
      rows.length >= AXIS_IDS.length,
    );

    const fromSpec = [...new Set(rows)].sort();
    const declared = [...AXIS_IDS].sort();
    // Every declared axis must appear in the spec. The spec carries other tables,
    // so the spec side is a SUPERSET and the assertion is one-directional by
    // design -- stated rather than left as an accident of the filter.
    expect(declared.filter((a) => !fromSpec.includes(a))).toEqual([]);
  });

  it("accounts for EVERY fixture on disk, and every cell names a file that exists", () => {
    // Both directions. A forward-only check ("every fixture has a cell") silently
    // accumulates dead cells, and a dead cell is a claim about a file that no
    // longer exists.
    const onDisk = readdirSync(FIXTURE_ROOT).sort();
    const inManifest = MANIFEST.map((c) => c.fixture).sort();

    premiseHolds("the fixture directory was read", onDisk.length > 0);

    expect(inManifest).toEqual(onDisk);
    expect(new Set(inManifest).size).toBe(inManifest.length);
  });

  it("freezes `inherited` at the BASE corpus size, so a new fixture must name an axis", () => {
    // Without this, every future fixture can be absorbed as pre-existing and the
    // manifest stops bounding anything -- an exemption keyed coarser than what it
    // exempts absorbs the future.
    expect(MANIFEST.filter((c) => c.axis === "inherited")).toHaveLength(INHERITED_CORPUS_SIZE);
  });

  it("gives every cell a rule-element, and no cell a shrug", () => {
    const shrugs = MANIFEST.filter((c) => c.covers.trim().length < 12).map((c) => c.fixture);
    expect(shrugs).toEqual([]);
  });

  it("gives every STRUCK cell a reason and every OWED cell a task that exists in the plan", () => {
    expect(STRUCK.filter((s) => s.reason.trim().length < 20).map((s) => s.cell)).toEqual([]);

    const plan = readFileSync(PLAN_PATH, "utf8");
    premiseHolds("the plan was read", plan.length > 0);
    // Positive control: a slug that IS in the plan must be found, so a zero here
    // is attributable to the owners rather than to a broken read.
    premiseHolds("the plan's own slugs are findable", plan.includes("[task:corpus-manifest]"));

    const missing = OWED.filter((o) => !plan.includes(`[${o.owner}]`)).map((o) => o.owner);
    expect(missing).toEqual([]);
  });

  it("crosses the BINDING-KIND axis completely, read from the spec's own row", () => {
    // Rule A's output is this axis, so it is crossed completely. Members parsed
    // out of the SPEC -- the independent witness -- with a population floor, and
    // matched against the `Receiver` kinds the module actually ships.
    const spec = readFileSync(SPEC_PATH, "utf8");
    const row = spec.split("\n").find((l) => l.startsWith("| binding kind"));
    premiseHolds("the spec's binding-kind axis row was found", row !== undefined);

    const members = row!
      .split("|")[1]!
      .split("—")[1]!
      .split("/")
      .map((m) => m.replace(/`/g, "").trim())
      .filter(Boolean);
    expect(members).toHaveLength(3);

    // The shipped side: every kind must be REACHABLE from the rule, established
    // by scanning fixtures that produce each rather than by reading the union.
    // `surface` reports, `foreign` and `opaque` are silent by design, so the
    // proof that all three exist is that the fixtures pinning them all pass.
    expect(members.sort()).toEqual(["foreign", "opaque", "surface"]);
  });

  it("crosses the RECEIVER-SHAPE axis completely, read from the spec's own row", () => {
    // The axis is finite (5) and the rule reads it, so it is crossed COMPLETELY
    // rather than sampled. The five members are parsed OUT OF THE SPEC, which is
    // the independent witness: a member added there with no fixture reds here.
    const spec = readFileSync(SPEC_PATH, "utf8");
    const row = spec
      .split("\n")
      .find((l) => l.startsWith("| receiver shape, once depth is factored out"));
    premiseHolds("the spec's receiver-shape axis row was found", row !== undefined);

    const members = row!
      .split("|")[1]!
      .split("—")[1]!
      .split("·")
      .map((m) => m.replace(/\*\*/g, "").trim())
      .filter(Boolean);
    // A population floor: five members are declared, and a short parse would
    // otherwise make this pass over whatever it happened to find.
    expect(members).toHaveLength(5);

    const covered = new Set(MANIFEST.map((c) => c.receiverShape).filter(Boolean));
    expect(members.filter((m) => !covered.has(m))).toEqual([]);
    // And no cell may claim a shape the spec does not declare.
    expect([...covered].filter((m) => !members.includes(m!))).toEqual([]);
  });

  it("carries the prettier directive on EVERY syntax-sensitive cell, immediately above its line", () => {
    // A formatter is a silent input mutation for any fixture that is PARSED
    // rather than read, and both of these are parsed. Measured on this corpus:
    // stripping the directive and running prettier rewrites
    // `(this.ch).dispatch(...)` to `this.ch.dispatch(...)`, converting that
    // fixture into a duplicate of `class-field-sink`; and rewrites
    // `<T>(x: T)` to `<T,>(x: T)`, whose trailing comma disambiguates the
    // generic from a JSX open tag and therefore retires the ONLY coverage of the
    // ScriptKind selection. The second was UNPROTECTED until this cell landed.
    const sensitive = MANIFEST.filter((c) => c.syntaxSensitive);
    premiseHolds("the corpus contains syntax-sensitive cells to check", sensitive.length > 0);

    // EVERY declared line, not the first: `parenthesized-double-read.ts` carries
    // TWO, and a single-line field would have silently protected one of them
    // while reading as a covered cell.
    const bad = sensitive.flatMap((c) =>
      c
        .syntaxSensitive!.map((line) => ({
          c,
          line,
          r: directiveImmediatelyAbove(readFixture(c.fixture), line),
        }))
        .filter((x) => !x.r.ok)
        .map((x) => `${x.c.fixture} :: ${x.line} :: ${x.r.reason}`),
    );
    expect(bad).toEqual([]);

    // A cell declaring an EMPTY list would pass the loop above vacuously.
    expect(sensitive.filter((c) => c.syntaxSensitive!.length === 0).map((c) => c.fixture)).toEqual(
      [],
    );
  });

  it("declares every directive the corpus actually carries — no undeclared directive", () => {
    // The reverse direction. A directive present but undeclared means somebody
    // protected a construct without recording WHY, and the reason is what a
    // future author needs; a directive declared but absent is the census failing
    // open. Both are caught here.
    const declared = new Set(MANIFEST.filter((c) => c.syntaxSensitive).map((c) => c.fixture));
    const carrying = readdirSync(FIXTURE_ROOT).filter((f) =>
      readFixture(f).includes(PRETTIER_DIRECTIVE),
    );
    expect(carrying.sort()).toEqual([...declared].sort());
  });

  it("PROVES the census can fail — a detached directive and an absent line both red", () => {
    // A check that cannot fail is not a check, and the failure direction here is
    // the dangerous one: a census that silently passes reads exactly like a
    // protected corpus.
    const line = "const identity = <T>(x: T): T => x;";
    const attached = `${PRETTIER_DIRECTIVE}\n${line}\n`;
    const detached = `${PRETTIER_DIRECTIVE}\n// an intervening comment DETACHES it\n${line}\n`;
    const bare = `${line}\n`;
    const twice = `${PRETTIER_DIRECTIVE}\n${line}\n${line}\n`;

    expect(directiveImmediatelyAbove(attached, line).ok).toBe(true);
    expect(directiveImmediatelyAbove(detached, line).ok).toBe(false);
    expect(directiveImmediatelyAbove(bare, line).ok).toBe(false);
    // An absent line is a cell naming nothing, and it must not render as a pass.
    expect(directiveImmediatelyAbove("", line)).toMatchObject({ ok: false, occurrences: 0 });
    // Two occurrences make "immediately above" ambiguous, so it reds rather than
    // silently checking the first.
    expect(directiveImmediatelyAbove(twice, line)).toMatchObject({ ok: false, occurrences: 2 });
  });
});

describe("AC-U14/AC-U15 — rule A resolves a receiver ONCE, for every position", () => {
  it("resolves a STATICALLY KNOWN element-access receiver, string key and template key alike", () => {
    // `this["ch"]` names its member IN THE SOURCE TEXT. It needs neither a
    // checker nor a call graph, so it is not the fenced call-result case, and
    // treating it as one left a real surface sink FULLY SILENT — the fail-open
    // direction the consequence bound forbids.
    const f = "element-access-receiver.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, 'this["ch"].dispatch')),
      finding(f, "UNDECLARED-PASS", "settleTemplate", lineOf(f, "this[`ch`].dispatch")),
    ]);
  });

  it("leaves a NON-LITERAL element key opaque, and the silence is ATTRIBUTABLE", () => {
    // The pair is ONE VARIABLE away: literal key versus variable key. The
    // control lives IN THIS MODULE, so a clean verdict for the opaque receiver
    // cannot be produced by the scanner failing to look — `settleBare` reports
    // through the ordinary route and exactly one finding is owed.
    const f = "element-access-opaque-key.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "settleBare", lineOf(f, "this.ch.dispatch")),
    ]);
  });

  // ONE fixture per wrapper KIND, not one representative: a scanner unwrapping
  // parentheses only passes a single representative while silently missing the
  // other three.
  it.each([
    "wrapper-nonnull-sink.ts",
    "wrapper-as-sink.ts",
    "wrapper-angle-sink.ts",
    "wrapper-satisfies-sink.ts",
  ])("%s — a transparent wrapper does not change what the guard sees", (f) => {
    // TWO findings, and the second is a DECLARED BASELINE THAT SHRINKS rather
    // than an expectation being accommodated.
    //
    // UNDECLARED-PASS is rule A working: D1 now resolves the wrapped receiver,
    // so the module is discovered as send-bearing where it previously reported
    // NOTHING AT ALL.
    //
    // UNCLASSIFIED-USE naming the BINDING is D3/D6 still answering for
    // themselves. It is the wrong-attribution direction -- the binding named
    // where the member is owed -- and `task:sites-consume-rule-a` removes it
    // when those sites consume rule A. It is asserted HERE, by equality, so
    // that removal is a visible change to this expectation rather than a
    // silent one: a presence check would have been satisfied by either state.
    // The declared baseline has SHRUNK. `task:resolve-name` asserted a second
    // finding here -- UNCLASSIFIED-USE naming the BINDING -- as D3/D6 still
    // answering for themselves, and named this task as the one that removes it.
    // It is gone because those sites now consume rule A, so the wrapper is
    // classified rather than mis-attributed. Asserting it by EQUALITY there is
    // what makes this removal visible instead of silent.
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });

  it("reads the wrapper axis from ts.OuterExpressionKinds, not from a list typed here", () => {
    // The axis-parity half of AC-U15. "Which wrappers are transparent" is a
    // question TypeScript already answers, so a wrapper kind TypeScript ADDS is
    // covered by default rather than by somebody remembering to extend a list —
    // a hand-written wrapper list being the exact defect this arc removes.
    //
    // The independent witness is the COMPILER's own enum, which does not know
    // what this suite says.
    const all = ts.OuterExpressionKinds.All;
    premiseHolds("the compiler exposes a non-empty OuterExpressionKinds.All", all > 0);

    // Every kind this arc names must be a member of All. Asserted against the
    // enum rather than against its numeric value, so a renumbering in a
    // TypeScript upgrade cannot silently pass.
    const named = [
      ts.OuterExpressionKinds.Parentheses,
      ts.OuterExpressionKinds.TypeAssertions,
      ts.OuterExpressionKinds.NonNullAssertions,
      ts.OuterExpressionKinds.ExpressionsWithTypeArguments,
    ];
    expect(named.filter((k) => (all & k) !== k)).toEqual([]);

    // `satisfies` is folded into TypeAssertions by the compiler rather than
    // carrying its own flag, and the fixture proves the behaviour regardless of
    // which flag owns it -- which is why the fixture is the proof and this
    // assertion is only the axis check.
    expect(scan("wrapper-satisfies-sink.ts").map((x) => x.code)).toEqual(["UNDECLARED-PASS"]);
  });
});

describe("AC-U1/AC-U2/AC-U3 — the decision sites stop answering for themselves", () => {
  // NEEDLES ANCHOR ON THE CODE FORM, not on the construct alone. Each of these
  // fixtures names its own construct in its header prose, and a looser anchor
  // resolves to that comment -- a fixture's explanation is part of the text a
  // lookup searches, which is the collision `class-field-sink` already pins.

  it("counts a doubled read through a PROPERTY receiver, with a bare pair as the control", () => {
    // The bare `local.gauge` pair reports through the route that already worked,
    // so the property pair's finding is attributable to the RECEIVER SHAPE and
    // not to the machinery having arrived at all.
    //
    // The trailing UNDECLARED-PASS is the PRE-EXISTING class-method behaviour,
    // identical to `class-field-sink`: discovery ranges over top-level
    // functions, so a method is never classified and the sink walk reports it.
    // Unchanged by this task and asserted rather than filtered, because an
    // equality that quietly drops a finding is a presence check wearing
    // equality's clothes.
    const f = "property-receiver-double-read.ts";
    const p1 = lineOf(f, "const first = this.ch.panes()");
    const p2 = lineOf(f, "const second = this.ch.panes()");
    const g1 = lineOf(f, 'const g1 = local.gauge("a")');
    const g2 = lineOf(f, 'const g2 = local.gauge("b")');
    expect(scan(f)).toEqual([
      finding(f, "MULTI-READ", "panes", p1, [p1, p2]),
      finding(f, "MULTI-READ", "gauge", g1, [g1, g2]),
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, 'this.ch.dispatch("p1"')),
    ]);
  });

  it("reports a raw handoff through a PROPERTY receiver, paired with the bare form", () => {
    const f = "property-receiver-handoff.ts";
    expect(scan(f)).toEqual([
      finding(f, "RAW-HANDOFF", "helper", lineOf(f, "helper(this.ch);")),
      finding(f, "RAW-HANDOFF", "helper", lineOf(f, "helper(local);")),
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, 'this.ch.dispatch("p1"')),
    ]);
  });

  it("classifies a PARENTHESIZED receiver identically to a bare one (D6, the outward walk)", () => {
    const f = "parenthesized-double-read.ts";
    const a = lineOf(f, 'const first = (ch).gauge("a")');
    const b = lineOf(f, 'const second = (ch).gauge("b")');
    expect(scan(f)).toEqual([finding(f, "MULTI-READ", "gauge", a, [a, b])]);
  });

  it("reports a PARENTHESIZED handoff argument", () => {
    const f = "parenthesized-handoff.ts";
    expect(scan(f)).toEqual([finding(f, "RAW-HANDOFF", "helper", lineOf(f, "helper((ch));"))]);
  });

  // RECEIVER and SELECTOR are TWO POSITIONS, and a killer for one is not a
  // killer for the other. Both are asserted, because a form that unifies the
  // receiver while leaving the selector dot-only passes every case above.
  it("resolves a member SELECTED by element access — the fully-silent case", () => {
    const f = "element-selector-sink.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, 'this["ch"]["dispatch"]("p1"')),
    ]);
  });

  it("leaves a CALL-RESULT receiver silent, and the silence is ATTRIBUTABLE", () => {
    // The fifth receiver shape, and the boundary that keeps the rule defensible.
    // A static element key names its member in the bytes; a call result does not
    // name it at all, so resolving it would re-open the no-call-graph fence.
    // `settleBare` reports through the ordinary route, so exactly one finding is
    // owed and the opaque receiver contributing none is attributable.
    const f = "call-result-receiver.ts";
    expect(scan(f)).toEqual([
      // A TOP-LEVEL function, so discovery classifies it and the finding lands on
      // the FUNCTION line -- unlike the class-method fixtures, where discovery
      // never reaches the method and the sink walk reports at the CALL.
      finding(f, "UNDECLARED-PASS", "settleBare", fnLine(f, "settleBare")),
    ]);
  });

  it("names the MEMBER, not the binding, when the selector is an element access", () => {
    const f = "element-selector-double-read.ts";
    const p1 = lineOf(f, 'const first = ch["panes"]()');
    const p2 = lineOf(f, 'const second = ch["panes"]()');
    const g1 = lineOf(f, 'const g1 = local.gauge("a")');
    const g2 = lineOf(f, 'const g2 = local.gauge("b")');
    expect(scan(f)).toEqual([
      finding(f, "MULTI-READ", "panes", p1, [p1, p2]),
      finding(f, "MULTI-READ", "gauge", g1, [g1, g2]),
    ]);
  });
});

describe("AC-U4/AC-U5/AC-U12 — rule B is a COUNT, so it is total over scope kinds", () => {
  // FOUR SCOPE KINDS, one per spelling, and the fixtures vary ONLY the scope. The
  // deleted ancestor walk asked whether a PARAMETER of an enclosing function-like
  // node re-declared the name, so it fell silent on every kind it did not list --
  // fail-open, into the forbidden direction. A count needs no notion of scope at
  // all, which is why it reaches all four without naming any of them.
  //
  // The discriminator is uniform: MULTI-READ over the two outer reads fires only
  // when the exemption is VOID. Were the second declaration not counted, `snap`
  // would still be derived and both reads would be exempt.

  it("a CONSTRUCTOR parameter re-declares the name", () => {
    const f = "shadow-scope-constructor.ts";
    const a = lineOf(f, "const a = snap.panes();");
    const b = lineOf(f, "const b = snap.panes();");
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "snap", lineOf(f, "void snap;")),
      finding(f, "MULTI-READ", "panes", a, [a, b]),
    ]);
  });

  it("a SET ACCESSOR name re-declares the name", () => {
    const f = "shadow-scope-set-accessor.ts";
    const a = lineOf(f, "const a = snap.panes();");
    const b = lineOf(f, "const b = snap.panes();");
    expect(scan(f)).toEqual([
      // The baseline declared here has SHRUNK: the accessor's own NAME was
      // reported as a USE of the binding, because the declaration-name list at
      // BASE named four kinds and missed accessors.
      // `task:declaration-name-accept-set` removed it by routing that question
      // through the SAME accept-set rule B's count already used.
      finding(f, "UNCLASSIFIED-USE", "v", lineOf(f, "void v;")),
      finding(f, "MULTI-READ", "panes", a, [a, b]),
    ]);
  });

  it("a NESTED BLOCK re-declares the name — not function-like at all", () => {
    const f = "shadow-scope-nested-block-surface.ts";
    const a = lineOf(f, "const a = snap.panes();");
    const b = lineOf(f, "const b = snap.panes();");
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "other", lineOf(f, "const snap: Channel = other;")),
      finding(f, "UNCLASSIFIED-USE", "snap", lineOf(f, "void snap;")),
      finding(f, "MULTI-READ", "panes", a, [a, b]),
    ]);
  });

  it("a NESTED BLOCK with NO annotation competes", () => {
    const f = "shadow-scope-nested-block-opaque.ts";
    const a = lineOf(f, "const a = snap.panes();");
    const b = lineOf(f, "const b = snap.panes();");
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "snap", lineOf(f, "void snap;")),
      finding(f, "MULTI-READ", "panes", a, [a, b]),
    ]);
  });

  it("AC-U5 — a keyword type that CANNOT HOLD AN OBJECT does not compete, and the pass is silent", () => {
    // Its expect-a-REPORT pair is the next case, ONE VARIABLE away. Without that
    // pair this is satisfied by any implementation that fails to look at all.
    expect(scan("shadow-annotation-string.ts")).toEqual([]);
  });

  it("AC-U5 — the same fixture with the SURFACE annotation reports", () => {
    const f = "shadow-annotation-surface.ts";
    const a = lineOf(f, "const a = snap.panes();");
    const b = lineOf(f, "const b = snap.panes();");
    expect(scan(f)).toEqual([
      finding(f, "RAW-HANDOFF", "String", lineOf(f, "String(snap)")),
      finding(f, "MULTI-READ", "panes", a, [a, b]),
    ]);
  });

  // AC-U12: "not spelled exactly like the surface type" is NOT "provably not the
  // surface". Each of these COULD hold the surface, so each competes -- and the
  // string case above is the one-variable-away control that makes their reports
  // attributable to the accept-set rather than to the scanner reporting always.
  it.each([
    "shadow-annotation-any.ts",
    "shadow-annotation-unknown.ts",
    "shadow-annotation-readonly-wrapper.ts",
    "shadow-annotation-intersection.ts",
  ])("%s — an annotation that could hold the surface COMPETES", (f) => {
    const a = lineOf(f, "const a = snap.panes();");
    const b = lineOf(f, "const b = snap.panes();");
    expect(scan(f)).toEqual([
      finding(f, "RAW-HANDOFF", "String", lineOf(f, "String(snap)")),
      finding(f, "MULTI-READ", "panes", a, [a, b]),
    ]);
  });
});

describe("AC-U13 — the declaration-name accept-set defaults to USE", () => {
  it("treats a VALUE REFERENCE carrying a `name` as a use, both spellings", () => {
    // A GUARD, not a red: both of these report today and must keep reporting.
    // `{ ch }` and `export { ch }` each carry a `name` whose value IS the
    // identifier, so any rule shaped as "the identifier is its parent's name"
    // skips them into SILENCE. The default is USE precisely because that error
    // direction is the recoverable one.
    const f = "declaration-name-value-references.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "ch", lineOf(f, "export { ch };")),
      finding(f, "UNDECLARED-PASS", "settle", fnLine(f)),
      finding(f, "UNCLASSIFIED-USE", "ch", lineOf(f, "void Object.values({ ch });")),
    ]);
  });

  it("leaves a REAL DECLARATION of an accepted kind silent", () => {
    // The paired half, and the one that moved. The accessor's own NAME was
    // reported as a use of the binding it is named for.
    const f = "declaration-name-accepted-kinds.ts";
    expect(scan(f)).toEqual([finding(f, "UNDECLARED-PASS", "settle", fnLine(f))]);
  });

  it("names only declaring kinds the SPEC lists, with the spec as the independent witness", () => {
    // Two sides that can disagree: the shipped Set, and the spec's own sentence.
    // A kind added to the code without the spec naming it reds here.
    const spec = readFileSync(SPEC_PATH, "utf8");
    // The sentence WRAPS ACROSS LINES in the spec, so a line-keyed read gets only
    // its first half and reports every kind as unnamed. Read the PARAGRAPH --
    // from the marker to the next blank line -- with whitespace normalised.
    const marker = "accept-set of DECLARING PARENTS";
    const at = spec.indexOf(marker);
    premiseHolds("the spec's declaring-parents paragraph was found", at >= 0);
    const end = spec.indexOf("\n\n", at);
    const prose = spec
      .slice(at, end < 0 ? undefined : end)
      .replace(/\s+/g, " ")
      .toLowerCase();
    premiseHolds("the paragraph is long enough to be the list", prose.length > 200);

    const kinds = [...DECLARING_PARENT_KINDS].map((k) => ts.SyntaxKind[k]!);
    expect(kinds.length).toBeGreaterThanOrEqual(12);

    // Every word of every kind name must appear in the spec's list. `GetAccessor`
    // and `SetAccessor` are covered by "get/set accessor", `FunctionExpression`
    // by "function", and so on -- the spec groups where TypeScript splits.
    // The spec GROUPS where TypeScript SPLITS: "function" covers both
    // `FunctionDeclaration` and `FunctionExpression`, "class" covers both class
    // forms. So a trailing `Declaration`/`Expression` is dropped before matching.
    // The check still discriminates -- a kind whose STEM the spec does not name
    // (say `CallExpression` -> "call") still reds, which is proven below.
    const stemWords = (name: string): string[] =>
      name
        .replace(/(Declaration|Expression)$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(" ")
        .filter(Boolean);

    const unnamed = kinds.filter((name) => stemWords(name).some((w) => !prose.includes(w)));
    expect(unnamed).toEqual([]);

    // PROOF IT CAN FAIL: a kind the spec does not name must be reported.
    expect(stemWords("CallExpression").some((w) => !prose.includes(w))).toBe(true);
  });
});

describe("AC-U6 — the read set's member name is a position too", () => {
  it("counts a doubled read of a QUOTED member, with a bare pair as the control", () => {
    // The read set gates rules 2 and 3, so it is consumed as a COMPLEMENT: a
    // dropped member is not one missing entry, it is reclassified "not a read"
    // and stops being constrained everywhere the set is consulted.
    //
    // MEASURED, by reverting the widening: the owed MULTI-READ degrades into two
    // UNCLASSIFIED-USE records naming the member, while the `panes` control
    // reports either way -- so the difference is attributable to the member's
    // SPELLING rather than to the machinery running at all.
    const f = "quoted-member-read.ts";
    const q1 = lineOf(f, 'const first = ch["wire-format"]()');
    const q2 = lineOf(f, 'const second = ch["wire-format"]()');
    const p1 = lineOf(f, "const p1 = ch.panes()");
    const p2 = lineOf(f, "const p2 = ch.panes()");
    expect(scan(f)).toEqual([
      finding(f, "MULTI-READ", "wire-format", q1, [q1, q2]),
      finding(f, "MULTI-READ", "panes", p1, [p1, p2]),
    ]);
  });

  it("keeps an INDEX SIGNATURE out of the read set — it names no member", () => {
    // The boundary. Widening to quoted names must not widen to nameless members,
    // and this is the case that would have gone unnoticed: an index signature has
    // no `name` at all, so it is excluded for a structural reason rather than by
    // a kind check somebody has to maintain.
    expect(readsFor(readFixture("exotic-type-members.ts"), CHANNEL_ROW)).not.toContain("key");
  });
});

// ---------------------------------------------------------------------------
// AC-U16a / AC-U16b / AC-U16c — ABSENCE, ADOPTION, METAMORPHIC INVARIANCE
//
// THREE DIFFERENT CLAIMS AND NONE IMPLIES ANOTHER. Every duplicate of the rule
// can be gone while NOTHING CALLS the replacement: the code compiles, the suite
// is green, a duplicate sweep reports zero, and the shared rule is DECORATIVE.
// Absence certifies a deletion; only adoption establishes the unification.
// ---------------------------------------------------------------------------

const SCANNER_PATH = "tests/paneCompaction/sendAuthScan.ts";

const scannerSource = (): ts.SourceFile =>
  ts.createSourceFile(
    SCANNER_PATH,
    readFileSync(SCANNER_PATH, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

/**
 * The accept-set is the TypeScript API surface for MATERIALISING A NAME, not a
 * list of spellings this suite happened to think of. A detector recognising only
 * `.text` passes every planted violation an author writes in that spelling while
 * silently missing `getText()`, `.escapedText`, `getFullText()` and the
 * destructured form.
 */
const NAME_PROPERTY_ACCESSORS = ["text", "escapedText"] as const;
const NAME_CALL_ACCESSORS = ["getText", "getFullText"] as const;

type NameSite = { line: number; accessor: string; text: string; node: ts.Node };

/**
 * Every site that materialises a name, found STRUCTURALLY. A lexical grep is
 * blind to a copy spelled differently, which is how copies three, four and five
 * survived earlier greps.
 */
const nameMaterializationSites = (sf: ts.SourceFile): NameSite[] => {
  const props = new Set<string>(NAME_PROPERTY_ACCESSORS);
  const calls = new Set<string>(NAME_CALL_ACCESSORS);
  const out: NameSite[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const walk = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && props.has(n.name.text)) {
      out.push({ line: at(n), accessor: n.name.text, text: n.getText(sf), node: n });
    } else if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      calls.has(n.expression.name.text)
    ) {
      out.push({ line: at(n), accessor: n.expression.name.text, text: n.getText(sf), node: n });
    } else if (ts.isBindingElement(n)) {
      const key = n.propertyName ?? n.name;
      if (ts.isIdentifier(key) && (props.has(key.text) || calls.has(key.text))) {
        out.push({ line: at(n), accessor: key.text, text: n.getText(sf), node: n });
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
};

/**
 * THE DISPOSITION TABLE. Keyed by enclosing function plus ordinal plus the site's
 * own TEXT, deliberately: a rename REDS rather than silently reclassifying, which
 * is what a key that survives every edit would do.
 *
 * `implementation` is the ONE shared rule. Everything else is a site that reads a
 * name for some other purpose, and each owes a reason:
 *   grammar     the FIELD'S DECLARED TYPE admits only `Identifier`. Durable.
 *   narrowed    the field ADMITS SIBLINGS and this code declines them. A declared
 *               limit, owing a consequence AND a re-file trigger.
 *   not-a-name  the site does not resolve a surface name at all. It NAMES THE
 *               FIELD it resolves, so a repurposing makes the row visibly false
 *               rather than merely stale.
 *
 * `grammar` is a claim about the FIELD, never about the access: code that
 * prefilters with `isIdentifier` and then reads `.text` LOOKS grammar-fixed at
 * the access while the field admits a sibling the prefilter silently discards.
 */
type Disposition = "implementation" | "grammar" | "narrowed" | "not-a-name";

type DispositionRow = {
  fn: string;
  ordinal: number;
  text: string;
  disposition: Disposition;
  why?: string;
  refileWhen?: string;
};

const NAME_POSITION_DISPOSITIONS: readonly DispositionRow[] = [
  {
    fn: "collect",
    ordinal: 1,
    text: "name.text",
    disposition: "narrowed",
    why: "same field, the string-literal arm",
    refileWhen: "a computed member name must resolve",
  },
  {
    fn: "collect",
    ordinal: 2,
    text: "name.text",
    disposition: "narrowed",
    why: "same field, the string-literal arm",
    refileWhen: "a computed member name must resolve",
  },
  {
    fn: "visit",
    ordinal: 1,
    text: "node.name.text",
    disposition: "grammar",
    why: "InterfaceDeclaration.name is declared Identifier",
  },
  {
    fn: "visit",
    ordinal: 2,
    text: "node.name.text",
    disposition: "grammar",
    why: "InterfaceDeclaration.name is declared Identifier",
  },
  {
    fn: "isSurfaceRef",
    ordinal: 1,
    text: "t.typeName.text",
    disposition: "not-a-name",
    why: "TypeReferenceNode.typeName — a TYPE name, never a receiver",
    refileWhen: "this site is asked to resolve a value name",
  },
  {
    fn: "topLevelFunctions",
    ordinal: 1,
    text: "st.name?.text",
    disposition: "not-a-name",
    why: "FunctionDeclaration.name — the LABEL a finding carries",
    refileWhen: "this label is used to resolve a binding",
  },
  {
    fn: "topLevelFunctions",
    ordinal: 2,
    text: "d.name.text",
    disposition: "not-a-name",
    why: "VariableDeclaration.name — the LABEL a finding carries",
    refileWhen: "this label is used to resolve a binding",
  },
  {
    fn: "classify",
    ordinal: 1,
    text: "named.text",
    disposition: "narrowed",
    why: "BindingName via propertyName ?? name; a non-identifier falls back to the binding's own text",
    refileWhen: "a computed bound member must be named exactly",
  },
  {
    fn: "classify",
    ordinal: 2,
    text: "id.text",
    disposition: "grammar",
    why: "id is declared ts.Identifier",
  },
  {
    fn: "classify",
    ordinal: 3,
    text: "id.text",
    disposition: "grammar",
    why: "id is declared ts.Identifier",
  },
  {
    fn: "classify",
    ordinal: 4,
    text: "id.text",
    disposition: "grammar",
    why: "id is declared ts.Identifier",
  },
  {
    fn: "visit",
    ordinal: 3,
    text: "node.text",
    disposition: "grammar",
    why: "narrowed to Identifier by the walk head's isIdentifier",
  },
  {
    fn: "visit",
    ordinal: 4,
    text: "node.text",
    disposition: "grammar",
    why: "narrowed to Identifier by the walk head's isIdentifier",
  },
  {
    fn: "visit",
    ordinal: 5,
    text: "node.text",
    disposition: "grammar",
    why: "narrowed to Identifier by the walk head's isIdentifier",
  },
  {
    fn: "visit",
    ordinal: 6,
    text: "node.text",
    disposition: "grammar",
    why: "narrowed to Identifier by the walk head's isIdentifier",
  },
  {
    fn: "visit",
    ordinal: 7,
    text: "n.name.text",
    disposition: "narrowed",
    why: "VariableDeclaration.name is BindingName and this site does not guard it; a destructured derivation would be named by its pattern text",
    refileWhen: "a destructured derivation must be named",
  },
  {
    fn: "passNameOf",
    ordinal: 1,
    text: "parent.name.text",
    disposition: "not-a-name",
    why: "VariableDeclaration.name — the pass LABEL",
    refileWhen: "this label is used to resolve a binding",
  },
  {
    fn: "passNameOf",
    ordinal: 2,
    text: "fn.name.text",
    disposition: "not-a-name",
    why: "FunctionDeclaration.name — the pass LABEL",
    refileWhen: "this label is used to resolve a binding",
  },
  { fn: "receiverRightmostName", ordinal: 1, text: "e.text", disposition: "implementation" },
  { fn: "receiverRightmostName", ordinal: 2, text: "key.text", disposition: "implementation" },
  { fn: "declaredNameText", ordinal: 1, text: "name.text", disposition: "implementation" },
  { fn: "declaredNameText", ordinal: 2, text: "name.text", disposition: "implementation" },
  { fn: "declaredNameText", ordinal: 3, text: "key.text", disposition: "implementation" },
  { fn: "memberCallOf", ordinal: 1, text: "c.name.text", disposition: "implementation" },
  { fn: "memberCallOf", ordinal: 2, text: "key.text", disposition: "implementation" },
  {
    fn: "walkDestructures",
    ordinal: 1,
    text: "named.text",
    disposition: "narrowed",
    why: "BindingName via propertyName ?? name; a computed bound member becomes the literal '(computed)'",
    refileWhen: "a computed bound member must resolve",
  },
  {
    fn: "enclosingName",
    ordinal: 1,
    text: "cur.name.text",
    disposition: "not-a-name",
    why: "VariableDeclaration.name — the finding LABEL",
    refileWhen: "this label is used to resolve a binding",
  },
  {
    fn: "enclosingName",
    ordinal: 2,
    text: "cur.name.text",
    disposition: "not-a-name",
    why: "VariableDeclaration.name — the finding LABEL",
    refileWhen: "this label is used to resolve a binding",
  },
  {
    fn: "enclosingName",
    ordinal: 3,
    text: "cur.name.text",
    disposition: "not-a-name",
    why: "VariableDeclaration.name — the finding LABEL",
    refileWhen: "this label is used to resolve a binding",
  },
  {
    fn: "enclosingName",
    ordinal: 4,
    text: "cur.name.text",
    disposition: "not-a-name",
    why: "VariableDeclaration.name — the finding LABEL",
    refileWhen: "this label is used to resolve a binding",
  },
  {
    fn: "walk",
    ordinal: 1,
    text: "node.text",
    disposition: "grammar",
    why: "narrowed to Identifier by the walk head's isIdentifier",
  },
  {
    fn: "importEdgeFindings",
    ordinal: 1,
    text: "statement.moduleSpecifier.text",
    disposition: "not-a-name",
    why: "the MODULE SPECIFIER of an import, never a surface name",
    refileWhen: "this site is asked to resolve a value name",
  },
  {
    fn: "look",
    ordinal: 1,
    text: "n.left.text",
    disposition: "not-a-name",
    why: "QualifiedName.left of a TYPE reference",
    refileWhen: "this site is asked to resolve a value name",
  },
  {
    fn: "look",
    ordinal: 2,
    text: "bindings.name.text",
    disposition: "not-a-name",
    why: "the namespace import's own binding NAME, compared as a namespace",
    refileWhen: "this site is asked to resolve a value name",
  },
  {
    fn: "look",
    ordinal: 3,
    text: "n.right.text",
    disposition: "not-a-name",
    why: "QualifiedName.right of a TYPE reference",
    refileWhen: "this site is asked to resolve a value name",
  },
  {
    fn: "importEdgeFindings",
    ordinal: 2,
    text: "(element.propertyName ?? element.name).text",
    disposition: "not-a-name",
    why: "an import specifier SYMBOL, matched against the surface type name",
    refileWhen: "this site is asked to resolve a value name",
  },
];

const siteKey = (fn: string, ordinal: number): string => `${fn}#${ordinal}`;

/** Every site, keyed the way the table is keyed. */
const dispositionedSites = (sf: ts.SourceFile): Map<string, NameSite & { fn: string }> => {
  const enclosing = (n: ts.Node): string => {
    for (let c: ts.Node | undefined = n; c !== undefined; c = c.parent) {
      if (ts.isFunctionDeclaration(c) && c.name !== undefined) return c.name.text;
      if (
        ts.isVariableDeclaration(c) &&
        ts.isIdentifier(c.name) &&
        c.initializer !== undefined &&
        (ts.isArrowFunction(c.initializer) || ts.isFunctionExpression(c.initializer))
      ) {
        return c.name.text;
      }
    }
    return "(module)";
  };
  const seen = new Map<string, number>();
  const out = new Map<string, NameSite & { fn: string }>();
  for (const site of nameMaterializationSites(sf)) {
    const fn = enclosing(site.node);
    const ordinal = (seen.get(fn) ?? 0) + 1;
    seen.set(fn, ordinal);
    out.set(siteKey(fn, ordinal), { ...site, fn });
  }
  return out;
};

describe("AC-U16b — ADOPTION: three assertions, and none implies another", () => {
  it("(a) disposition every site — an UNDISPOSED site REDS by name", () => {
    const sites = dispositionedSites(scannerSource());
    premiseHolds("the scanner parsed and yielded name sites", sites.size > 20);

    const rows = new Set(NAME_POSITION_DISPOSITIONS.map((r) => siteKey(r.fn, r.ordinal)));
    const undisposed = [...sites.entries()]
      .filter(([k]) => !rows.has(k))
      .map(([k, v]) => `${k} :: ${v.text}`);
    expect(undisposed).toEqual([]);
  });

  it("(b) every ROW names a LIVE site, with matching text — a rename REDS", () => {
    // The reverse direction. A forward-only check accumulates dead rows, and a
    // dead row is a claim about a site that no longer exists -- or worse, an
    // exemption whose original site was deleted while a new one inherited its key.
    const sites = dispositionedSites(scannerSource());
    const stale = NAME_POSITION_DISPOSITIONS.filter((r) => {
      const live = sites.get(siteKey(r.fn, r.ordinal));
      return live === undefined || live.text !== r.text;
    }).map((r) => `${siteKey(r.fn, r.ordinal)} :: expected ${r.text}`);
    expect(stale).toEqual([]);
  });

  it("(c) every non-implementation row carries the reason its KIND owes", () => {
    // An exemption token with no consequence and no trigger is a shrug wearing a
    // token's name. `narrowed` and `not-a-name` both decay, so both owe a
    // trigger; `grammar` is a durable claim about a declared field type.
    const missing = NAME_POSITION_DISPOSITIONS.flatMap((r) => {
      if (r.disposition === "implementation") return [];
      const problems: string[] = [];
      if ((r.why ?? "").length < 12) problems.push("no reason");
      if (r.disposition !== "grammar" && (r.refileWhen ?? "").length < 12) {
        problems.push("no re-file trigger");
      }
      return problems.map((p) => `${siteKey(r.fn, r.ordinal)}: ${p}`);
    });
    expect(missing).toEqual([]);
  });

  it("keeps the ONE implementation, and it is the only one", () => {
    // AC-U16a's companion: the implementation rows must all sit inside the two
    // functions that ARE the shared rule. A third function acquiring
    // implementation rows means the rule was copied again.
    const owners = new Set(
      NAME_POSITION_DISPOSITIONS.filter((r) => r.disposition === "implementation").map((r) => r.fn),
    );
    expect([...owners].sort()).toEqual([
      "declaredNameText",
      "memberCallOf",
      "receiverRightmostName",
    ]);
  });
});

describe("AC-U16a — ABSENCE: no site RE-IMPLEMENTS the rule", () => {
  /**
   * STRUCTURAL, not lexical. A grep is blind to a copy spelled differently,
   * which is how copies three, four and five survived earlier greps.
   *
   * The shape of a re-implementation: one function deciding a name by applying
   * BOTH `isIdentifier` and `isPropertyAccessExpression` to the SAME expression.
   */
  const reimplementations = (sf: ts.SourceFile): string[] => {
    const guards = new Map<string, { ident: Set<string>; prop: Set<string> }>();
    const enclosing = (n: ts.Node): string => {
      for (let c: ts.Node | undefined = n; c !== undefined; c = c.parent) {
        if (ts.isFunctionDeclaration(c) && c.name !== undefined) return c.name.text;
        if (
          ts.isVariableDeclaration(c) &&
          ts.isIdentifier(c.name) &&
          c.initializer !== undefined &&
          (ts.isArrowFunction(c.initializer) || ts.isFunctionExpression(c.initializer))
        ) {
          return c.name.text;
        }
      }
      return "(module)";
    };
    const walk = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.arguments.length === 1
      ) {
        const guard = n.expression.name.text;
        if (guard === "isIdentifier" || guard === "isPropertyAccessExpression") {
          const fn = enclosing(n);
          const entry = guards.get(fn) ?? { ident: new Set<string>(), prop: new Set<string>() };
          (guard === "isIdentifier" ? entry.ident : entry.prop).add(n.arguments[0]!.getText(sf));
          guards.set(fn, entry);
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return [...guards.entries()]
      .flatMap(([fn, e]) => [...e.ident].filter((x) => e.prop.has(x)).map((x) => `${fn}(${x})`))
      .sort();
  };

  it("finds exactly the ONE implementation and nothing else", () => {
    const sf = scannerSource();
    const found = reimplementations(sf);
    premiseHolds("the scanner was parsed", sf.statements.length > 0);
    // `receiverRightmostName` IS the implementation. Any other name here is a copy.
    expect(found).toEqual(["receiverRightmostName(e)"]);
  });

  it("PROVES it can fail — a constructed copy is detected", () => {
    // A check that cannot fail is not a check, and this one fails in the
    // direction that looks green: a silent scan reads exactly like a clean module.
    const copy = ts.createSourceFile(
      "copy.ts",
      [
        "const rival = (x: ts.Expression): string | null => {",
        "  if (ts.isIdentifier(x)) return x.text;",
        "  if (ts.isPropertyAccessExpression(x)) return x.name.text;",
        "  return null;",
        "};",
      ].join("\n"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    expect(reimplementations(copy)).toEqual(["rival(x)"]);
  });
});

describe("AC-U16c — METAMORPHIC: the detected site SET survives rename and reformat", () => {
  /**
   * A STRUCTURAL identity: the AST child-index path plus the materialiser name.
   * It contains NO identifier spelling, which is the whole point -- a scan
   * exempting sites by spelling moved its own count 42 to 44 under a
   * semantics-neutral rename, and reading the instrument could not have shown it.
   *
   * CARDINALITY IS EXPLICITLY NOT THE CRITERION: one missed site and one spurious
   * site cancel in a count and not in a set.
   *
   * REORDERING independent declarations is OUT of the invariant and stated as
   * such -- a child-index path is not stable under reorder, and no
   * transformation-stable identity is claimed for it.
   */
  const structuralSites = (text: string): string[] => {
    const sf = ts.createSourceFile("m.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out: string[] = [];
    const walk = (n: ts.Node, path: readonly number[]): void => {
      let index = 0;
      ts.forEachChild(n, (child) => {
        const here = [...path, index];
        index += 1;
        if (
          ts.isPropertyAccessExpression(child) &&
          (child.name.text === "text" || child.name.text === "escapedText")
        ) {
          out.push(`${here.join(".")}:${child.name.text}`);
        }
        walk(child, here);
      });
    };
    walk(sf, []);
    return out.sort();
  };

  it("is identical under a semantics-neutral RENAME", () => {
    const original = readFileSync(SCANNER_PATH, "utf8");
    const renamed = original.replace(/\bnamed\b/g, "boundName");
    premiseHolds("the rename actually changed the source", renamed !== original);

    const before = structuralSites(original);
    const after = structuralSites(renamed);
    premiseHolds("the site set is non-empty", before.length > 20);
    // Compared AS SETS, never as counts.
    expect(after).toEqual(before);
  });

  it("is identical under a REFORMAT", () => {
    const original = readFileSync(SCANNER_PATH, "utf8");
    // A narrower print width rewraps almost every call in the module while
    // changing no meaning at all.
    const reflowed = original.replace(/\n {2}/g, "\n    ");
    premiseHolds("the reformat actually changed the source", reflowed !== original);
    expect(structuralSites(reflowed)).toEqual(structuralSites(original));
  });

  it("PROVES it can fail — removing a site moves the SET, and a cancelling pair moves it too", () => {
    const original = readFileSync(SCANNER_PATH, "utf8");
    const before = structuralSites(original);

    // Direction one: a site removed.
    const removed = original.replace("c.name.text", "c.name.escaped_MISSING");
    expect(structuralSites(removed)).not.toEqual(before);

    // Direction two, and the one a COUNT cannot see: one site removed and one
    // added, so the cardinality is IDENTICAL and the set is not.
    const swapped = original
      .replace("c.name.text", "c.name.escaped_MISSING")
      .replace(
        "const skipTransparent",
        "const _pad = ({} as ts.Identifier).text;\nconst skipTransparent",
      );
    const swappedSites = structuralSites(swapped);
    expect(swappedSites).toHaveLength(before.length);
    expect(swappedSites).not.toEqual(before);
  });
});

describe("AC-U16b — the adoption detector covers EVERY accepted materialiser", () => {
  /**
   * DERIVE THE REQUIREMENT, AUTHOR THE WITNESS, ASSERT THE COVERAGE.
   *
   * The obvious repair -- derive the planted violations from the same accept-set
   * the detector uses -- trades a weak fixture set for a VACUOUS one: both sides
   * from one source cannot disagree, so a drift moves them together and the
   * comparison can never fail. So the REQUIREMENT is derived (every accepted form
   * needs a witness) and each WITNESS is authored by hand, independently.
   *
   * This matters because the shipped module uses ONLY `.text`. Four of the five
   * accepted forms have ZERO instances in it, so a detector recognising `.text`
   * alone would pass the entire live scan while being blind to the rest.
   */
  const WITNESSES: Record<string, string> = {
    text: "const a = node.text;",
    escapedText: "const b = node.escapedText;",
    getText: "const c = node.getText(sf);",
    getFullText: "const d = node.getFullText(sf);",
    destructure: "const { text } = node;",
  };

  it("requires a witness for every accepted form, and every witness is detected", () => {
    // The requirement list is DERIVED from the shipped accept-sets.
    const required = [...NAME_PROPERTY_ACCESSORS, ...NAME_CALL_ACCESSORS, "destructure"];
    premiseHolds("the accept-sets are non-empty", required.length >= 5);

    // Side one: the derived requirement. Side two: the hand-authored directory.
    expect(Object.keys(WITNESSES).sort()).toEqual([...required].sort());

    const undetected = Object.entries(WITNESSES)
      .filter(([, snippet]) => {
        const sf = ts.createSourceFile(
          "w.ts",
          snippet,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        );
        return nameMaterializationSites(sf).length === 0;
      })
      .map(([form]) => form);
    expect(undetected).toEqual([]);
  });

  it("PROVES the coverage check discriminates — a form with no witness REDS", () => {
    // Drop one witness and the derived requirement no longer matches the authored
    // directory. Without this the check is satisfied by any two lists that happen
    // to agree today.
    const short = Object.keys(WITNESSES).filter((k) => k !== "getFullText");
    const required = [...NAME_PROPERTY_ACCESSORS, ...NAME_CALL_ACCESSORS, "destructure"];
    expect(short.sort()).not.toEqual([...required].sort());

    // And a materialiser the detector does NOT accept must not be detected, so
    // the scan is not simply reporting every property access it meets.
    const unrelated = ts.createSourceFile(
      "u.ts",
      "const z = node.kind;",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    expect(nameMaterializationSites(unrelated)).toEqual([]);
  });
});

describe("AC-U7 — whole-corpus preservation against a committed BASE baseline", () => {
  /**
   * The instrument the arc did NOT have: every pre-existing fixture's verdict
   * compared against a baseline captured at BASE, so the two moves rule B
   * deliberately creates are the ONLY differences and any third is a regression.
   *
   * A VALUE COMPARISON WITH AN INDEPENDENT WITNESS ON EACH SIDE: a committed
   * baseline against a live scan. The baseline was produced by running the
   * BASE scanner (blob 412cadd3, byte-identical at `origin/main`) over the
   * fixture list read from `git ls-tree` at BASE -- not from the manifest, so
   * the population is not derived from the same place the assertion is.
   *
   * `removed: (none)` is the load-bearing half. A count of two moved does not
   * distinguish an ADDITION from a REPLACEMENT; the empty removal set does.
   */
  const BASELINE_PATH = "tests/paneCompaction/fixtures/sendAuthBaseVerdicts.json";

  const verdictOf = (fixtureName: string): string[] =>
    scan(fixtureName)
      .map((f) => `${f.code}:${f.name}:${f.lines.join(",")}`)
      .sort();

  it("preserves all 81 BASE verdicts except the two rule B moves, and those are ADDITIVE", () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, string[]>;
    const names = Object.keys(baseline);
    // Population floor: a baseline that shrank would let this pass over nothing.
    expect(names).toHaveLength(81);

    const EXPECTED_MOVES: Record<string, string> = {
      "same-pass-shadowed-derivation.ts": "RAW-HANDOFF:inner",
      "shadowed-param-handoff.ts": "RAW-HANDOFF:inner",
    };

    const regressions: string[] = [];
    const moved: string[] = [];
    for (const name of names) {
      const want = baseline[name]!;
      const got = verdictOf(name);
      if (JSON.stringify(got) === JSON.stringify(want)) continue;
      moved.push(name);
      const added = got.filter((x) => !want.includes(x));
      const removed = want.filter((x) => !got.includes(x));
      const expected = EXPECTED_MOVES[name];
      if (expected === undefined) {
        regressions.push(`${name}: UNEXPECTED move (+${added.join("|")} -${removed.join("|")})`);
        continue;
      }
      // ADDITIVE: nothing removed, and exactly the one documented addition.
      if (removed.length > 0) regressions.push(`${name}: REMOVED ${removed.join("|")}`);
      if (added.length !== 1 || !added[0]!.startsWith(expected)) {
        regressions.push(`${name}: added ${added.join("|")}, expected one ${expected}`);
      }
    }

    expect(regressions).toEqual([]);
    expect(moved.sort()).toEqual(Object.keys(EXPECTED_MOVES).sort());
  });

  it("PROVES the baseline can fail — a fabricated verdict is reported as a regression", () => {
    // Without this the comparison is satisfied by a baseline that matches
    // whatever the scanner currently does, which is the shape that reports a
    // perfect zero while measuring nothing.
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, string[]>;
    const pick = "single-read-clean.ts";
    expect(baseline[pick]).toEqual([]);
    // The live scan agrees today; a baseline claiming otherwise must not match.
    expect(verdictOf(pick)).not.toEqual(["MULTI-READ:panes:1,2"]);
  });
});

describe("Task 9 — what the mutation gate demanded, and the killer audit's two gaps", () => {
  it("kills the `null`-arm equality flip FROM BOTH SIDES", () => {
    // The gate found this arm unexercised: an equality flip on it survived,
    // because no fixture reached it from either direction. `null` is the one
    // accept-set member that is NOT a keyword node -- the compiler models it as
    // a LiteralType WRAPPING the keyword -- so it needs its own arm and its own
    // pair.
    //
    // MEASURED under the mutant: the null case REPORTS and the literal case
    // falls SILENT. Each alone would have left the other direction open.
    expect(scan("shadow-annotation-null.ts")).toEqual([]);

    const f = "shadow-annotation-string-literal.ts";
    const a = lineOf(f, "const a = snap.panes();");
    const b = lineOf(f, "const b = snap.panes();");
    expect(scan(f)).toEqual([
      finding(f, "RAW-HANDOFF", "String", lineOf(f, "String(snap)")),
      finding(f, "MULTI-READ", "panes", a, [a, b]),
    ]);
  });

  it("unwraps a WRAPPED element KEY — the key is a second name position", () => {
    // §3c's weaker implementation: "resolves `this[\"ch\"]` but not
    // `this[(\"ch\")]`". It passes every other element-access case in the corpus
    // and falls silent here.
    const f = "element-key-wrapped.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "settle", lineOf(f, 'this[("ch")].dispatch')),
    ]);
  });

  it("rule B carries NO SCOPE ENUMERATION — the structural killer, not another fixture", () => {
    // §3c is explicit that fixtures alone cannot kill this class: a competing
    // declaration in a `while` body defeats a five-item list, and a six-item
    // list defeats that fixture. That is the enumeration treadmill in miniature.
    // A COUNT needs no notion of scope, so the checkable claim is that rule B's
    // own functions contain none.
    //
    // Scoped DELIBERATELY to rule B. `isFunctionLike` survives elsewhere in the
    // module for unrelated purposes -- pass discovery, marker attachment,
    // straight-line blocking -- so "no `isFunctionLike` anywhere" would be the
    // wrong assertion and would red for the wrong reason.
    const source = readFileSync(SCANNER_PATH, "utf8");
    const sf = scannerSource();

    const bodyOf = (name: string): string => {
      let found: string | undefined;
      const walk = (n: ts.Node): void => {
        if (
          ts.isVariableDeclaration(n) &&
          ts.isIdentifier(n.name) &&
          n.name.text === name &&
          n.initializer !== undefined
        ) {
          found = n.initializer.getText(sf);
        }
        ts.forEachChild(n, walk);
      };
      walk(sf);
      if (found === undefined)
        throw new Error(`rule B function ${name} not found — the audit is naming nothing`);
      return found;
    };

    const RULE_B = [
      "competingDeclarationCount",
      "declaresName",
      "competesAsSurface",
      "exemptionVoid",
    ];
    premiseHolds("the scanner source was read", source.length > 1000);

    const offenders = RULE_B.flatMap((name) => {
      const body = bodyOf(name);
      const problems: string[] = [];
      if (body.includes("isFunctionLike")) problems.push("references isFunctionLike");
      // An UPWARD ancestor WALK is what a scope model needs; rule B walks DOWN.
      // The walk shape is a variable reassigned from ITS OWN parent -- a single
      // `const parent = id.parent` read is one hop and is NOT a walk, which the
      // first version of this predicate conflated and reported for `declaresName`.
      if (/(\w+)\s*=\s*\1\.parent\b/.test(body)) problems.push("walks ancestors");
      return problems.map((p) => `${name}: ${p}`);
    });
    expect(offenders).toEqual([]);

    // PROVEN TO DISCRIMINATE: the predicates DO fire on a body that has them.
    expect(/(\w+)\s*=\s*\1\.parent\b/.test("for (let cur = n; cur; cur = cur.parent) {}")).toBe(
      true,
    );
    // ...and does NOT fire on a single-hop parent read, which is not a walk.
    expect(/(\w+)\s*=\s*\1\.parent\b/.test("const parent = id.parent;")).toBe(false);
    expect("if (isFunctionLike(cur)) return true;".includes("isFunctionLike")).toBe(true);
  });

  it("AC-U9 — the registry control keys on a line occurring EXACTLY ONCE", () => {
    // A control keyed by text is only as good as that text's uniqueness, and a
    // uniqueness claim in a COMMENT cannot fail. This arc moved the code the
    // control keys on, so the claim is asserted BY THE SUITE instead: a refactor
    // that duplicates the line lands the control edit on a site no case reaches,
    // and the suite stays green while the harness stops discriminating.
    const source = readFileSync(SCANNER_PATH, "utf8");
    const registry = readFileSync("tests/mutation/source/registry.ts", "utf8");

    const row = registry.slice(registry.indexOf('id: "sendAuthScan"'));
    const from = /control: \{\s*\n\s*from: "([^"]+)"/.exec(row);
    premiseHolds("the sendAuthScan control was read out of the registry", from !== null);

    const needle = from![1]!;
    premiseHolds("the control text is substantial", needle.length > 20);

    const occurrences = source.split(needle).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("diff r1 — RESOLVING a name and ENTERING on one are different jobs", () => {
  it("reaches an unknown member through a STATIC ELEMENT-ACCESS receiver", () => {
    // The dotted form in the SAME module is the control: it reported before the
    // repair, so the bracketed form's finding is attributable to the ENTRY point
    // rather than to the scanner having run at all. Before the repair the two
    // disagreed — dotted reported, bracketed was SILENT.
    const f = "element-receiver-unknown-member.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNCLASSIFIED-USE", "typo", lineOf(f, "this.ch.typo();")),
      finding(f, "UNCLASSIFIED-USE", "typo", lineOf(f, 'this["ch"].typo();')),
    ]);
  });

  it("admits a PRIVATE IDENTIFIER field into the binding set", () => {
    // The binding-COLLECTION side was keyed on `isIdentifier` while resolution
    // had been unified, so `#ch` never became a binding and every use of it
    // resolved FOREIGN — silent before rule A ever ran. The public field is the
    // control and reported throughout.
    const f = "private-identifier-field.ts";
    expect(scan(f)).toEqual([
      finding(f, "UNDECLARED-PASS", "hidden", lineOf(f, 'this.#ch.dispatch("p1"')),
      finding(f, "UNDECLARED-PASS", "exposed", lineOf(f, 'this.open.dispatch("p2"')),
    ]);
  });
});
