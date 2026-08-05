import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import { checkCorpus, type Problem } from "../../lib/reviewRounds/corpus";

const ROOT = join(__dirname, "..", "..");
const tmpRoots: string[] = [];
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

type Fixture = { path: string; body: string };

/** Build a corpus tree and check it. `path` is relative to docs/review-rounds/. */
function check(files: Fixture[]): Problem[] {
  const root = mkdtempSync(join(tmpdir(), "rre-"));
  tmpRoots.push(root);
  for (const f of files) {
    const abs = join(root, "docs", "review-rounds", f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.body);
  }
  // Resolvable ids are injected so a fixture never depends on the live ledgers.
  return checkCorpus(root, { resolvableIds: new Set(["BL-REAL"]) });
}

/**
 * Same tree, but the ledgers are written at the fixture root and NO resolvable
 * set is injected - so the live `liveLedgerIds` path is the thing under test.
 * Without this, nothing exercises it at all: every case above injects its own
 * set, and the live-corpus check runs against an empty corpus that cites
 * nothing, so `liveLedgerIds` could return an empty set and stay green.
 */
function checkWithLedgers(files: Fixture[], ledgers: Fixture[]): Problem[] {
  const root = mkdtempSync(join(tmpdir(), "rre-live-"));
  tmpRoots.push(root);
  for (const f of files) {
    const abs = join(root, "docs", "review-rounds", f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.body);
  }
  for (const l of ledgers) writeFileSync(join(root, l.path), l.body);
  return checkCorpus(root);
}

const ARC = "feat/foo/aaaaaaaaaaaa";
const row = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    stage: "diff",
    round: 1,
    branch: "feat/foo",
    baseSha: "aaaaaaaaaaaa",
    label: null,
    status: "verdict",
    verdict: "APPROVE",
    failureReason: null,
    findingCount: null,
    startedAt: "2026-08-01T00:00:00.000Z",
    endedAt: "2026-08-01T00:10:00.000Z",
    briefPath: "b.md",
    outDir: "o",
    guardVersion: 1,
    recoveredFrom: null,
    ...over,
  });

const rows = (...overrides: Record<string, unknown>[]): string =>
  overrides.map((o) => row(o)).join("\n") + "\n";

/** Derived from ROUND_THRESHOLD, never a literal - a fixture that cannot reach
 *  the threshold would make the core assertion vacuous. */
const OBLIGING = Array.from({ length: ROUND_THRESHOLD }, (_, i) => ({ round: i + 1 }));
const BELOW = OBLIGING.slice(0, ROUND_THRESHOLD - 1);

const FILING_OK = `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** R1-R${ROUND_THRESHOLD}.\n\n**Mechanizable:** none\n`;

describe("review-round economy gate (spec §7.1)", () => {
  it("FAILS an arc at threshold with no filing - the core assertion", () => {
    const problems = check([{ path: `${ARC}.jsonl`, body: rows(...OBLIGING) }]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  it("PASSES the same arc once the filing exists", () => {
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        { path: `${ARC}.md`, body: FILING_OK },
      ]),
    ).toEqual([]);
  });

  it("PASSES below threshold", () => {
    expect(check([{ path: `${ARC}.jsonl`, body: rows(...BELOW) }])).toEqual([]);
  });

  it("PASSES when the last round is a no_verdict - infra noise must not oblige", () => {
    expect(
      check([
        {
          path: `${ARC}.jsonl`,
          body: rows(...BELOW, {
            round: ROUND_THRESHOLD,
            status: "no_verdict",
            verdict: null,
            failureReason: "attempts_exhausted",
          }),
        },
      ]),
    ).toEqual([]);
  });

  it("PASSES when the last round is a wrapper_error - same status, not a third one", () => {
    expect(
      check([
        {
          path: `${ARC}.jsonl`,
          body: rows(...BELOW, {
            round: ROUND_THRESHOLD,
            status: "no_verdict",
            verdict: null,
            failureReason: "wrapper_error",
          }),
        },
      ]),
    ).toEqual([]);
  });

  // The recovered-verdict case. An implementation reading failureReason: null
  // as part of the counted combination passes every other test here.
  it("FAILS when every round is a recovered verdict with a non-null failureReason", () => {
    const problems = check([
      {
        path: `${ARC}.jsonl`,
        body: rows(...OBLIGING.map((o) => ({ ...o, failureReason: "attempts_exhausted" }))),
      },
    ]);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  it("PASSES four task rounds with no filing - a task dispatch is not a review round", () => {
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, stage: "task" }))) },
      ]),
    ).toEqual([]);
  });

  // Failure caught: a filing SECTION for a stage the spec permits no filing
  // for. Spec §6 item 1 admits only spec, plan and diff; `task` rows are
  // recorded and never counted (spec §5.1), so a task filing is a category
  // error rather than a miscount. Every check downstream of the heading waved
  // it through: `recorded.get("task")` is 4, so stage_without_rows stayed
  // quiet, and `counted.get("task") ?? 0` is 0 against the declared 0, so
  // count_mismatch did too. The case directly above cannot catch it - that one
  // has no filing at all - so the gate returned CLEAN on a structurally
  // invalid filing, which is the binding gate blessing what the spec forbids.
  it("FAILS a filing section for a stage that carries no filings", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, stage: "task" }))) },
      { path: `${ARC}.md`, body: "## task — 0 rounds\n\n**Examined:** R1-R4.\n**Infra:** none\n" },
    ]);
    // A green result here IS the defect, and the kind is what separates the fix
    // from a coincidental failure on some other check.
    expect(problems).not.toEqual([]);
    expect(problems.map((p) => p.kind)).toContain("stage_not_filable");
  });

  it("PASSES a parallel wave whose distinct rounds are below threshold", () => {
    expect(
      check([
        {
          path: `${ARC}.jsonl`,
          body: rows({ round: 1 }, { round: 2 }, { round: 3 }, { round: 3 }, { round: 3 }),
        },
      ]),
    ).toEqual([]);
  });

  it("FAILS on a round gap", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows({ round: 1 }, { round: 2 }, { round: 4 }) },
    ]);
    expect(problems.map((p) => p.kind)).toContain("round_gap");
  });

  // Failure caught, and found by mutating the GATE rather than the counter: the
  // call site passing only counted rows to `roundGaps`. The unit test in
  // tests/reviewRounds/count.test.ts pins `roundGaps` itself, so it survives a
  // filter applied at the caller - and every other fixture here survives too,
  // because the only no_verdict rows among them sit at the LAST round, where
  // dropping the row shortens 1..N to 1..N-1 and stays contiguous. An infra
  // fault at an INTERIOR round is the case that separates the two: filtering
  // leaves a hole, and the gate accuses a healthy arc of a gap it does not
  // have. The case above cannot catch this - it has no no_verdict row at all -
  // and it is what stops the fix being "delete the roundGaps call".
  it("PASSES an arc whose interior round is an infra fault, not a gap", () => {
    const withInteriorFault = OBLIGING.map((o) =>
      o.round === 2
        ? { ...o, status: "no_verdict", verdict: null, failureReason: "wrapper_error" }
        : o,
    );
    // Round 2 is interior for the live ROUND_THRESHOLD of 4, and the counted
    // total drops to ROUND_THRESHOLD - 1, so no filing is owed either.
    expect(ROUND_THRESHOLD).toBeGreaterThanOrEqual(3);
    expect(check([{ path: `${ARC}.jsonl`, body: rows(...withInteriorFault) }])).toEqual([]);
  });

  it("FAILS when a filing cites an unresolvable id", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      {
        path: `${ARC}.md`,
        body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** a\n\n**Mechanizable:** BL-NOT-A-REAL-ID\n`,
      },
    ]);
    expect(problems.map((p) => p.kind)).toContain("unresolved_id");
  });

  it("PASSES when the cited id resolves", () => {
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        {
          path: `${ARC}.md`,
          body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** a\n\n**Mechanizable:** BL-REAL\n`,
        },
      ]),
    ).toEqual([]);
  });

  it("FAILS a filing section naming a stage with zero rows - catches copy-paste between arcs", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `${FILING_OK}\n## spec — 4 rounds\n\n**Examined:** a\n**Infra:** b\n` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("stage_without_rows");
  });

  it("FAILS a filing missing its Examined line", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Mechanizable:** none\n` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("filing_malformed");
  });

  // Failure caught: a heading with NO round count passing over an obliging
  // corpus. `HEADING_LOOSE` builds a section with `declaredRounds: null`; its
  // presence suppressed `missing_filing`, both body-field checks pass on this
  // body, and `count_mismatch` skipped `null` - so a structurally nonconforming
  // filing was reported compliant. Every other case in this describe would
  // still pass, which is exactly how the hole shipped.
  it("FAILS a filing heading that carries no round count", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: "## diff\n\n**Examined:** R1-R4.\n**Mechanizable:** none\n" },
    ]);
    // Not merely "some problem": a green result here is the defect, and the
    // kind is what distinguishes the fix from a coincidental failure.
    expect(problems).not.toEqual([]);
    expect(problems.map((p) => p.kind)).toContain("filing_malformed");
  });

  it("FAILS a malformed JSON row, naming file and line", () => {
    const problems = check([{ path: `${ARC}.jsonl`, body: `${row()}\n{not json\n` }]);
    const bad = problems.find((p) => p.kind === "malformed_row");
    expect(bad).toBeDefined();
    expect(bad?.message).toContain(`${ARC}.jsonl`);
    expect(bad?.message).toContain("line 2");
  });

  // A flat walk misses this, which is how the defect shipped in spec draft 1.
  it("FAILS an obliged arc nested two levels deep", () => {
    const problems = check([
      {
        path: "feat/deep/nested/bbbbbbbbbbbb.jsonl",
        body: rows(
          ...OBLIGING.map((o) => ({ ...o, branch: "feat/deep/nested", baseSha: "bbbbbbbbbbbb" })),
        ),
      },
    ]);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  // Failure caught: a later arc inheriting a merged arc's filing. This is the
  // reason arc identity is (branch, baseSha) and not branch alone.
  it("FAILS the new arc when an older arc on the same branch has the filing", () => {
    const old = "feat/reused/aaaaaaaaaaaa";
    const fresh = "feat/reused/cccccccccccc";
    const problems = check([
      { path: `${old}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, branch: "feat/reused" }))) },
      { path: `${old}.md`, body: FILING_OK },
      {
        path: `${fresh}.jsonl`,
        body: rows(
          ...OBLIGING.map((o) => ({ ...o, branch: "feat/reused", baseSha: "cccccccccccc" })),
        ),
      },
    ]);
    expect(
      problems.some((p) => p.kind === "missing_filing" && p.message.includes("cccccccccccc")),
    ).toBe(true);
  });

  it("FAILS a row whose branch or baseSha disagrees with its containing path", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows({ round: 1, branch: "feat/wrong" }) },
    ]);
    expect(problems.map((p) => p.kind)).toContain("identity_mismatch");
  });

  it("FAILS a filing heading whose round count contradicts the corpus", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `## diff — 999 rounds\n\n**Examined:** a\n**Infra:** b\n` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("count_mismatch");
  });

  it("FAILS two sections for one stage", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `${FILING_OK}\n${FILING_OK}` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("duplicate_section");
  });

  // The case a .jsonl-first walk never visits, which makes the orphan check
  // vacuous in exactly the situation it exists for.
  it("FAILS an orphan filing with no corpus beside it", () => {
    const problems = check([{ path: `${ARC}.md`, body: FILING_OK }]);
    expect(problems.map((p) => p.kind)).toContain("orphan_filing");
  });

  // Failure caught: a corpus file the walk drops on the floor. Under a filter
  // that only ADMITS the arc-name shape this file was invisible - not parsed,
  // not counted, not reported - and checkCorpus returned clean over a corpus
  // holding ROUND_THRESHOLD verdict rows that no arc owns. Its stem is the
  // arc's own, one hex character short, so it misses the shape by exactly the
  // margin a typo produces.
  it("FAILS a .jsonl whose name is not an arc's, instead of ignoring it", () => {
    const STRAY = `${ARC.slice(0, -1)}.jsonl`;
    const problems = check([{ path: STRAY, body: rows(...OBLIGING) }]);
    expect(problems.map((p) => p.kind)).toEqual(["unrecognized_corpus_file"]);
    // The path is named, derived from the fixture rather than retyped.
    expect(problems[0]!.message).toContain(STRAY);
  });

  // Failure caught: a walk keyed on "any .md" reports the corpus README as a
  // permanent orphan, so the live-corpus test can never be green once Task 12
  // ships the README. A stray .md is prose and is ignored; a stray .jsonl is
  // data, and the case above proves it is NOT.
  it("PASSES a README and other non-arc-shaped files in the corpus tree", () => {
    expect(
      check([
        { path: "README.md", body: "# Review rounds\n\nWhat this directory is.\n" },
        { path: "feat/notes.md", body: "scratch\n" },
        { path: `${ARC}.jsonl`, body: rows(...BELOW) },
      ]),
    ).toEqual([]);
  });

  // Failure caught: a filing whose stem is not a merge base at all. The loose
  // "any .md" walk accepted this silently; the shape key rejects it.
  it("FAILS a filing whose stem is not a 12-hex merge base", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: "feat/foo/my-notes.md", body: FILING_OK },
    ]);
    // The real arc still owes a filing, because my-notes.md is not one.
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });

  // Fails-by-default: a NEW arc dropped in is covered without editing the test.
  it("FAILS a brand-new fixture arc with no filing, without any test edit", () => {
    const problems = check([
      {
        path: "chore/brand-new/dddddddddddd.jsonl",
        body: rows(
          ...OBLIGING.map((o) => ({ ...o, branch: "chore/brand-new", baseSha: "dddddddddddd" })),
        ),
      },
    ]);
    expect(problems.map((p) => p.kind)).toContain("missing_filing");
  });
});

describe("liveLedgerIds resolves against the real ledgers", () => {
  // Written to the fixture root, in the two shapes the live ledgers use:
  // BACKLOG.md entries are `## BL-… — title` (level 2), DEFERRED.md entries are
  // `### <ID> — title` (level 3, no required prefix).
  const BACKLOG = [
    "# Backlog",
    "",
    "## BL-PLANTED-HEADING-ROW — a heading-defined row",
    "",
    "Body prose.",
    "",
    "- **`BL-PLANTED-SUBITEM-ROW`** — a sub-item defined in the body only",
    "",
  ].join("\n");
  const DEFERRED = ["# Deferred", "", "### DEF-PLANTED-HEADING-ROW — a deferral", "", "x", ""].join(
    "\n",
  );
  const LEDGERS: Fixture[] = [
    { path: "BACKLOG.md", body: BACKLOG },
    { path: "DEFERRED.md", body: DEFERRED },
  ];

  const filingCiting = (id: string): string =>
    `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** a\n\n**Mechanizable:** ${id}\n`;

  const live = (id: string): Problem[] =>
    checkWithLedgers(
      [
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        { path: `${ARC}.md`, body: filingCiting(id) },
      ],
      LEDGERS,
    );

  // Failure caught: `liveLedgerIds` returning an empty set. Nothing else in
  // this file would notice, because every other case injects its own set.
  it("resolves a BL- id defined by a BACKLOG.md heading", () => {
    expect(live("BL-PLANTED-HEADING-ROW")).toEqual([]);
  });

  // The DEFERRED option set is a separate pass over a separate file, and
  // dropping it would leave every DEF- citation falsely unresolved.
  it("resolves a DEF- id defined by a DEFERRED.md heading", () => {
    expect(live("DEF-PLANTED-HEADING-ROW")).toEqual([]);
  });

  it("reports an id defined in no ledger", () => {
    expect(live("BL-PLANTED-ABSENT-ROW").map((p) => p.kind)).toEqual(["unresolved_id"]);
  });

  // Pins the DOCUMENTED LIMIT in `liveLedgerIds`, in the direction that keeps
  // it honest. Resolution is ENTRY HEADINGS ONLY because the P5-sole probe in
  // _metaLedgerReferentialIntegrity.test.ts pins that the sub-item helper has
  // exactly one caller, and this gate must not become a second one. So a
  // sub-item citation is a FALSE POSITIVE - loud and blocking, never silently
  // accepted - and the remedy is to cite the parent heading, which resolves.
  // If someone later widens resolution to sub-items, this test fails and forces
  // the invariant to be confronted rather than quietly crossed.
  it("does NOT resolve an id defined only as a body sub-item - the documented limit", () => {
    expect(live("BL-PLANTED-SUBITEM-ROW").map((p) => p.kind)).toEqual(["unresolved_id"]);
  });

  // The absent-ledger path: `existsSync` skips a missing file rather than
  // throwing, so a root with no ledgers at all resolves nothing and says so.
  it("survives a root with no ledger files", () => {
    const problems = checkWithLedgers(
      [
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        { path: `${ARC}.md`, body: filingCiting("BL-PLANTED-HEADING-ROW") },
      ],
      [],
    );
    expect(problems.map((p) => p.kind)).toEqual(["unresolved_id"]);
  });
});

describe("live corpus", () => {
  it("is clean", () => {
    // Discovered from disk: a new arc's files are covered by default and can
    // never be silently exempt. Empty today (spec §12 - this arc is
    // pre-adoption by construction), which is a legal clean state.
    expect(checkCorpus(ROOT)).toEqual([]);
  });
});
