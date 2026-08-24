import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import { checkCorpus, readArcs, type Problem } from "../../lib/reviewRounds/corpus";
import { parseFiling } from "../../lib/reviewRounds/filing";
import {
  ARC_SUM_FREEZE,
  ARC_SUM_GRANDFATHERED,
} from "../../lib/reviewRounds/arcSumGrandfather";
import { arcCountedRounds } from "../../lib/reviewRounds/count";
import { MECHANIZABLE_GRANDFATHERED } from "../../lib/reviewRounds/mechanizableGrandfather";
import { premiseHolds } from "../_shared/premise";
import { ledgerIds, type ExtractOpts } from "./_ledgerMdast";

const ROOT = join(__dirname, "..", "..");

const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };
const DEFERRED_OPTS: ExtractOpts = { requirePrefix: null, levels: [3] };
// Named LEDGER_FILES, not LEDGERS: the live-ledger describe below already binds
// LEDGERS to its planted fixtures, and a shadowed name there would read as this
// list.
const LEDGER_FILES: readonly (readonly [string, ExtractOpts])[] = [
  ["BACKLOG.md", BACKLOG_OPTS],
  ["BACKLOG-archive.md", BACKLOG_OPTS],
  ["DEFERRED.md", DEFERRED_OPTS],
  ["DEFERRED-archive.md", DEFERRED_OPTS],
];

/**
 * The resolvable-id set, over all four ledgers under BOTH option sets (plan R2).
 * DEFERRED entries carry bare SHOUTY ids, so the production `definedIds` helper
 * - which resolves every ledger under BACKLOG_OPTS - collects only `BL-` ids.
 *
 * It lives HERE rather than in lib/reviewRounds/corpus.ts because the ledger
 * recognizer it needs, `ledgerIds`, is a test helper: resolving ids inside the
 * shipped module made lib/ import from tests/, which the carve-containment
 * guard bans as a laundering channel. `checkCorpus` takes the set as a REQUIRED
 * argument instead, so the dependency is explicit at every call site and no
 * caller can silently resolve nothing.
 *
 * It deliberately does NOT import `definedIds` from
 * tests/docs/_metaLedgerReferentialIntegrity.test.ts: that symbol is exported
 * from a `*.test.ts` module, and importing it re-registers that file's whole
 * suite inside this one.
 *
 * ENTRY HEADINGS ONLY, and that is a live structural invariant rather than a
 * preference. `definedIds` resolves headings PLUS ids defined as sub-item
 * bullets inside an entry's body, and the P5-sole probe in
 * tests/docs/_metaLedgerReferentialIntegrity.test.ts pins that the sub-item
 * helper has EXACTLY ONE caller - "a second production caller with its own file
 * list would pass every plant above while scanning whatever it liked". Calling
 * it here would be that second caller. The alternatives are worse: importing
 * `definedIds` re-registers a whole suite (above), and exempting this file
 * weakens the probe that stops the resolvable universe from being widened
 * unaccountably.
 *
 * DOCUMENTED LIMIT, measured 2026-08-04 against the live ledgers: exactly 8
 * ids this recognizer could ever cite are defined only as sub-item bullets and
 * so do not resolve here - the five mutation operator classes such as
 * `BL-MUTATION-UNICODE`, and the three sync-feed rows such as
 * `BL-SYNCFEED-UI-1`. (The body-defined set holds 16, but the other 8 carry no
 * `BL-`/`DEF-` prefix, so CITED_ID cannot cite them and they cost nothing.)
 *
 * A filing citing one of the 8 is reported `unresolved_id`, which is a FALSE
 * POSITIVE: loud, self-explanatory and blocking, never silent wrongness - the
 * one outcome the consequence bound forbids. The remedy is also the better
 * citation. BACKLOG.md says of those sub-items that "the parent owns the
 * shrink-only ratchet that gives them their meaning", so a filing should cite
 * the parent row - which is a heading, and resolves.
 */
function liveLedgerIds(root: string): Set<string> {
  const out = new Set<string>();
  for (const [file, opts] of LEDGER_FILES) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    for (const id of ledgerIds(text, opts)) out.add(id);
  }
  return out;
}
const tmpRoots: string[] = [];
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

type Fixture = { path: string; body: string };

/** Build a corpus tree and return its root. `path` is relative to docs/review-rounds/. */
function write(files: Fixture[]): string {
  const root = mkdtempSync(join(tmpdir(), "rre-"));
  tmpRoots.push(root);
  for (const f of files) {
    const abs = join(root, "docs", "review-rounds", f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.body);
  }
  return root;
}

/** Build a corpus tree and check it. `path` is relative to docs/review-rounds/. */
function check(files: Fixture[]): Problem[] {
  // Resolvable ids are injected so a fixture never depends on the live ledgers.
  return checkCorpus(write(files), { resolvableIds: new Set(["BL-REAL"]) });
}

/**
 * Same tree, but the ledgers are written at the fixture root and the resolvable
 * set is the one `liveLedgerIds` reads off them - so the live path is the thing
 * under test. Without this, nothing exercises it at all: every case above hands
 * over a hand-built set, and the live-corpus check runs against an empty corpus
 * that cites nothing, so `liveLedgerIds` could return an empty set and stay
 * green.
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
  return checkCorpus(root, { resolvableIds: liveLedgerIds(root) });
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
    // The message NAMES the file the arc owes, derived from the fixture path
    // rather than retyped. Failure caught: the expected-filing path computed off
    // a wrong slice bound - the kind assertion above stays green while the
    // author is sent to a path that does not exist.
    expect(problems.find((p) => p.kind === "missing_filing")?.message).toContain(
      `docs/review-rounds/${ARC}.md`,
    );
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

  // Failure caught: `stage_not_filable` reported and then the section checked
  // ANYWAY. The case above cannot see it - its heading declares 0, which
  // matches `counted.get("task") ?? 0`, so falling through adds nothing. A
  // task section declaring a NON-ZERO count separates them: an unfilable stage
  // has no count worth reading, so the only correct report is the category
  // error, and a second complaint about a number nobody should be comparing is
  // noise the author has to triage.
  it("reports ONLY the category error for an unfilable stage, never its round count", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING.map((o) => ({ ...o, stage: "task" }))) },
      {
        path: `${ARC}.md`,
        body: `## task — ${ROUND_THRESHOLD} rounds\n\n**Examined:** R1-R${ROUND_THRESHOLD}.\n**Infra:** none\n`,
      },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["stage_not_filable"]);
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
    // EXACTLY this kind: the copy-pasted section also declares 4 rounds against
    // a corpus counting none, so a checker that reports the missing rows and
    // then compares the counts anyway adds a `count_mismatch` about a stage this
    // arc never dispatched. `toContain` cannot see that; equality can.
    expect(problems.map((p) => p.kind)).toEqual(["stage_without_rows"]);
  });

  it("FAILS a filing missing its Examined line", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Mechanizable:** none\n` },
    ]);
    expect(problems.map((p) => p.kind)).toContain("filing_malformed");
    // The message names the FILING, not the corpus: the author has to open the
    // .md to fix it. Failure caught: `filingPath` never recorded, which reports
    // every filing problem against "null" while the kinds stay right.
    const message = problems.find((p) => p.kind === "filing_malformed")?.message;
    expect(message).toContain(`docs/review-rounds/${ARC}.md`);
    // A field that is MISSING gets the base message, never the non-rendered
    // one - the two send the author to different repairs (Task-4 mutation
    // repairs: kills the &&>|| flips at corpus.ts:301/:302 and the rawOnly
    // length boundary at :306, each of which mislabels an absent field as a
    // non-rendered one).
    expect(message).toContain("needs an **Examined:** line and at least one disposition line");
    expect(message).not.toContain("non-rendered");
  });

  it("uses the base message when the DISPOSITION is missing entirely", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** a\n` },
    ]);
    const message = problems.find((p) => p.kind === "filing_malformed")?.message;
    expect(message).toContain("needs an **Examined:** line and at least one disposition line");
    expect(message).not.toContain("non-rendered");
  });

  // Diff R1 finding 2: a prose MENTION of a field label - a strong run
  // mid-sentence - is rendered but does not open a field paragraph, so it must
  // not satisfy the Examined or disposition duties. The duties need BOTH the
  // raw line anchor AND a rendered label.
  it("FAILS a filing whose only field labels are mid-sentence mentions", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      {
        path: `${ARC}.md`,
        body: `## diff — ${ROUND_THRESHOLD} rounds\n\nThis paragraph merely mentions **Examined:** and **Judgment:** as examples.\n`,
      },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
    expect(problems[0]!.message).toContain(
      "needs an **Examined:** line and at least one disposition line",
    );
  });

  // Diff R2 finding 2: the two conjunction witnesses must not come from
  // UNRELATED occurrences - a fenced field example (raw anchor) plus a prose
  // mention (formerly a rendered label) assembled both duties with no rendered
  // field paragraph anywhere. Line-opening label semantics closes it.
  it("FAILS a fenced field example paired with a prose mention", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      {
        path: `${ARC}.md`,
        body: `## diff — ${ROUND_THRESHOLD} rounds\n\n\`\`\`\n**Examined:** fenced example\n**Mechanizable:** fenced example\n\`\`\`\n\nA live sentence merely mentioning **Examined:** and **Mechanizable:** as labels.\n`,
      },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
  });

  // The compact soft-broken form stays legal under the conjunction: the raw
  // anchor and the rendered label both hold on `**Examined:** a\n**Infra:** b`.
  it("PASSES the compact soft-broken field form", () => {
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        {
          path: `${ARC}.md`,
          body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** R1-R${ROUND_THRESHOLD}.\n**Mechanizable:** none\n`,
        },
      ]),
    ).toEqual([]);
  });

  // Failure caught: a malformed BODY reported and the section checked anyway.
  // The case above cannot see it - its heading declares the true count, so
  // falling through compares 4 against 4 and adds nothing. Declaring a wrong
  // count alongside the missing line separates them: the body is not yet
  // readable, so the count comparison is premature and its complaint is noise.
  it("reports ONLY the malformed body when the heading also miscounts", () => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: "## diff — 999 rounds\n\n**Mechanizable:** none\n" },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
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
    // kind is what distinguishes the fix from a coincidental failure. EXACTLY
    // one kind, because a heading with no count read as a count compares `null`
    // against the corpus's 4 and reports a `count_mismatch` naming a number the
    // heading never carried.
    expect(problems).not.toEqual([]);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
  });

  // Failure caught: a stage whose rows all faulted read as "1 counted round"
  // rather than none. Its corpus obliges nothing (no counted rounds at all), so
  // a filing declaring 0 is correct and must pass - and a default of 1 standing
  // in for the missing count accuses that honest filing of a miscount. No other
  // case reaches the default: every one of them has a stage the corpus counts.
  it("PASSES a filing declaring 0 rounds for a stage whose rounds all faulted", () => {
    const allFaulted = OBLIGING.map((o) => ({
      ...o,
      status: "no_verdict",
      verdict: null,
      failureReason: "wrapper_error",
    }));
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...allFaulted) },
        { path: `${ARC}.md`, body: "## diff — 0 rounds\n\n**Examined:** none\n**Infra:** all\n" },
      ]),
    ).toEqual([]);
  });

  // Failure caught: `arc.dir` computed off a wrong slice bound. It is the
  // report's file label for an arc with no corpus of its own
  // (scripts/review-economy.ts:82), so a truncated dir names a directory that
  // does not exist, while every problem-kind assertion here stays green because
  // `checkCorpus` never reads the field.
  it("records an arc's containing directory, whole, from its nested path", () => {
    const root = write([
      {
        path: "feat/deep/nested/bbbbbbbbbbbb.jsonl",
        body: rows(
          ...BELOW.map((o) => ({ ...o, branch: "feat/deep/nested", baseSha: "bbbbbbbbbbbb" })),
        ),
      },
    ]);
    const arcs = readArcs(root);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.dir).toBe("docs/review-rounds/feat/deep/nested");
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

describe("mechanizable ledger parity (enforcement-pair spec §3)", () => {
  /** An obliged arc plus a filing whose body is Examined + the given tail. */
  const filing = (tail: string): string =>
    `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** R1-R${ROUND_THRESHOLD}.\n\n${tail}\n`;
  const gate = (tail: string): Problem[] =>
    check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      { path: `${ARC}.md`, body: filing(tail) },
    ]);

  it("FAILS a non-none entry with no id and no decline - the core parity assertion", () => {
    const problems = gate("**Mechanizable:** promising lint arm, nobody filed it");
    expect(problems.map((p) => p.kind)).toEqual(["mechanizable_untracked"]);
    // The message names the filing, the stage, and both missing arms (spec §3.2).
    const message = problems[0]!.message;
    expect(message).toContain(`docs/review-rounds/${ARC}.md`);
    expect(message).toContain("stage diff");
    expect(message).toContain("cites no BL-/DEF- id");
    expect(message).toContain('declined: <reason>');
  });

  it("PASSES an id cited in a block paragraph below the marker", () => {
    expect(gate("**Mechanizable:** one candidate\n\nFiled as BL-REAL.")).toEqual([]);
  });

  // Block-scoped on purpose: a Judgment paragraph citing a BL- row must not
  // satisfy the Mechanizable entry's duty (spec §3.1).
  it("FAILS when the only id sits OUTSIDE the block, in a following field", () => {
    expect(gate("**Mechanizable:** one candidate\n\n**Judgment:** cites BL-REAL").map((p) => p.kind)).toEqual([
      "mechanizable_untracked",
    ]);
  });

  // R5 finding 2: the block closes at ANY field paragraph, derived - not an
  // enumerated closer list that re-opens per noncanonical spelling.
  it("FAILS when the only id sits under a noncanonical trailing field", () => {
    expect(
      gate("**Mechanizable:** uncited candidate\n\n**Carry-forward:** unrelated note cites BL-REAL").map(
        (p) => p.kind,
      ),
    ).toEqual(["mechanizable_untracked"]);
  });

  it("PASSES a structural declined: line in the block", () => {
    expect(gate("**Mechanizable:** one candidate\n\ndeclined: no owner until the M14 window")).toEqual([]);
  });

  // R7 finding 1: 79 of 88 live canonical markers carry their value on the line.
  it("PASSES a marker-line declined: declaration", () => {
    expect(gate("**Mechanizable:** declined: waiting on the product call")).toEqual([]);
  });

  it("PASSES none, with and without trailing prose", () => {
    expect(gate("**Mechanizable:** none")).toEqual([]);
    expect(gate("**Mechanizable:** none — all judgment-shaped")).toEqual([]);
  });

  // R7 finding 2, the ACCEPTING direction of documented limit §5.7: isNone reads
  // only the marker-line remainder, so content later added below a stale none
  // passes. Rejecting it was probed against the live corpus and would
  // false-reject the dominant idiom (prose under none. markers).
  it("PASSES a stale none followed by candidate lines - documented limit §5.7", () => {
    expect(gate("**Mechanizable:** none\n\nActually, here is a candidate nobody filed.")).toEqual([]);
  });

  // R5 finding 1: begins-with, never contains.
  it("FAILS 'not declined:' - negation is not a declaration", () => {
    expect(gate("**Mechanizable:** not declined: no owner has accepted this").map((p) => p.kind)).toEqual([
      "mechanizable_untracked",
    ]);
  });

  it("FAILS a mid-sentence prose MENTION of the declined: form", () => {
    expect(
      gate(
        "**Mechanizable:** one candidate\n\nWe should use declined: <reason> only after a decision.",
      ).map((p) => p.kind),
    ).toEqual(["mechanizable_untracked"]);
  });

  // R8 finding 2: every CommonMark list-marker form declares; the two exotic
  // forms are pinned at gate level (all five are pinned at parse level).
  it.each(["+", "1)"])("PASSES a %s list-item declined: declaration", (m) => {
    expect(gate(`**Mechanizable:** one candidate\n\n${m} declined: no owner until M14`)).toEqual([]);
  });

  // R6: two markers have no defined aggregation - both orderings are malformed.
  it("FAILS two canonical markers, tracked-then-uncited", () => {
    const problems = gate("**Mechanizable:** BL-REAL\n\n**Mechanizable:** stray uncited second entry");
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
    expect(problems[0]!.message).toContain("2");
  });

  it("FAILS two canonical markers, uncited-then-tracked", () => {
    expect(
      gate("**Mechanizable:** stray uncited entry\n\n**Mechanizable:** BL-REAL").map((p) => p.kind),
    ).toEqual(["filing_malformed"]);
  });

  // R10: remark decodes backslash escapes and character references before
  // CITED_ID runs, so an id the raw scan never saw must still RESOLVE - without
  // this, the decoded spelling satisfies parity while resolution sees nothing.
  it.each([
    ["backslash-escaped BL-", "BL\\-NO-SUCH-ROW", "BL-NO-SUCH-ROW"],
    ["character-reference BL-", "BL&#45;NO-SUCH-ROW", "BL-NO-SUCH-ROW"],
    ["backslash-escaped DEF-", "DEF\\-NO-SUCH-ROW", "DEF-NO-SUCH-ROW"],
    ["character-reference DEF-", "DEF&#45;NO-SUCH-ROW", "DEF-NO-SUCH-ROW"],
  ])("FAILS an AST-decoded unresolvable id (%s) as unresolved_id", (_name, spelled, decoded) => {
    const problems = gate(`**Mechanizable:** ${spelled}`);
    expect(problems.map((p) => p.kind)).toEqual(["unresolved_id"]);
    expect(problems[0]!.message).toContain(decoded);
  });

  // R11: struck-through content is a visible RETRACTION and satisfies nothing.
  it("FAILS ~~none~~ - a struck none is not none", () => {
    expect(gate("**Mechanizable:** ~~none~~ candidates remain").map((p) => p.kind)).toEqual([
      "mechanizable_untracked",
    ]);
  });

  it("FAILS a struck marker-line decline", () => {
    expect(gate("**Mechanizable:** ~~declined: no owner~~").map((p) => p.kind)).toEqual([
      "mechanizable_untracked",
    ]);
  });

  it("FAILS a struck block-item decline", () => {
    expect(gate("**Mechanizable:** one candidate\n\n- ~~declined: struck~~").map((p) => p.kind)).toEqual([
      "mechanizable_untracked",
    ]);
  });

  it("FAILS a struck citation - the entry stays untracked", () => {
    expect(gate("**Mechanizable:** ~~BL-REAL~~ retracted").map((p) => p.kind)).toEqual([
      "mechanizable_untracked",
    ]);
  });

  // R9 finding 2: a heading closes the block (the live corpus lays out
  // `### Judgment, not mechanizable` subsections), so ids and declines in prose
  // under it never leak in.
  it("FAILS when the only id sits under a following subsection heading", () => {
    expect(
      gate(
        "**Mechanizable:** one candidate\n\n### Judgment, not mechanizable\n\nBL-REAL is judgment prose.",
      ).map((p) => p.kind),
    ).toEqual(["mechanizable_untracked"]);
  });

  it("FAILS when the only declined: sits under a following subsection heading", () => {
    expect(
      gate(
        "**Mechanizable:** one candidate\n\n### Judgment, not mechanizable\n\ndeclined: judgment prose",
      ).map((p) => p.kind),
    ).toEqual(["mechanizable_untracked"]);
  });

  // R8 finding 1: content CommonMark does not render as prose is structurally
  // invisible - one fixture per matrix cell, per non-rendered form.
  const NON_RENDERED: readonly [string, (inner: string) => string][] = [
    ["a fenced block", (s) => `\`\`\`\n${s}\n\`\`\``],
    [
      "an indented code block",
      (s) =>
        s
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n"),
    ],
    ["an HTML comment", (s) => `<!--\n${s}\n-->`],
  ] as const;

  it.each(NON_RENDERED)("does not count a marker inside %s - no phantom duplicate", (_n, wrap) => {
    expect(gate(`**Mechanizable:** BL-REAL\n\n${wrap("**Mechanizable:** phantom")}`)).toEqual([]);
  });

  it.each(NON_RENDERED)("does not accept a declined: example inside %s", (_n, wrap) => {
    expect(
      gate(`**Mechanizable:** one candidate\n\n${wrap("declined: example only")}`).map((p) => p.kind),
    ).toEqual(["mechanizable_untracked"]);
  });

  it.each(NON_RENDERED)("does not collect an id inside %s", (_n, wrap) => {
    expect(gate(`**Mechanizable:** one candidate\n\n${wrap("BL-REAL")}`).map((p) => p.kind)).toEqual([
      "mechanizable_untracked",
    ]);
  });

  it.each(NON_RENDERED)("an example bold field inside %s does not close the block", (_n, wrap) => {
    expect(
      gate(`**Mechanizable:** one candidate\n\n${wrap("**Judgment:** example")}\n\nFiled as BL-REAL.`),
    ).toEqual([]);
  });

  // R9 finding 1: a filing whose only disposition (or Examined) lines live in
  // non-rendered content satisfied the raw line scan while the AST saw nothing,
  // and parity was never consulted - the whole-gate silent accept.
  const RAW_ONLY_FORMS: readonly [string, (inner: string) => string][] = [
    ...NON_RENDERED,
    ["an HTML block", (s) => `<div>\n${s}\n</div>`],
  ] as const;

  it.each(RAW_ONLY_FORMS)("FAILS a filing whose only disposition line sits in %s", (_n, wrap) => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      {
        path: `${ARC}.md`,
        body: `## diff — ${ROUND_THRESHOLD} rounds\n\n**Examined:** R1-R${ROUND_THRESHOLD}.\n\n${wrap("**Mechanizable:** none")}\n`,
      },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
    expect(problems[0]!.message).toContain("non-rendered");
  });

  it.each(RAW_ONLY_FORMS)("FAILS a filing whose only Examined line sits in %s", (_n, wrap) => {
    const problems = check([
      { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
      {
        path: `${ARC}.md`,
        body: `## diff — ${ROUND_THRESHOLD} rounds\n\n${wrap("**Examined:** R1-R4.")}\n\n**Mechanizable:** none\n`,
      },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
    expect(problems[0]!.message).toContain("non-rendered");
  });

  // R12: a rendered field nested under a listItem renders for the reader while
  // marker discovery sees nothing - rejected loudly, all five marker forms.
  it.each(["-", "*", "+", "1.", "1)"])("FAILS a %s list-nested Mechanizable field", (m) => {
    const problems = gate(`**Judgment:** the real disposition\n\n${m} **Mechanizable:** nested candidate`);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
    expect(problems[0]!.message).toMatch(/nest/);
  });

  // Diff R1 finding 3, gate level: a rendered Mechanizable field nested under
  // a blockquote inside a list item (and a bare top-level blockquote) is
  // rejected, not silently admitted beside a conforming Judgment.
  it.each([
    ["a blockquote inside a list item", "- > **Mechanizable:** nested candidate"],
    ["a bare top-level blockquote", "> **Mechanizable:** quoted candidate"],
  ])("FAILS a rendered Mechanizable field in %s", (_n, body) => {
    const problems = gate(`**Judgment:** the real disposition\n\n${body}`);
    expect(problems.map((p) => p.kind)).toEqual(["filing_malformed"]);
    expect(problems[0]!.message).toMatch(/top-level/);
  });

  // Diff R1 finding 4, gate level: a decline declared in a sub-list item or a
  // blockquote paragraph inside the block is a declaration - the gate must not
  // reject a conforming filing over its nesting depth.
  it.each([
    ["a sub-list item", "- one candidate\n  - declined: owner decision"],
    ["a blockquote paragraph", "> declined: quoted owner decision"],
  ])("PASSES a decline declared in %s", (_n, body) => {
    expect(gate(`**Mechanizable:** one candidate\n\n${body}`)).toEqual([]);
  });

  // §3.3: the grandfather exemption, pinned on a REAL frozen path whose fixture
  // content violates all four grandfather-exempt families at once - a raw-only
  // Examined, duplicate markers, an untracked non-none entry, and a nested
  // field - so every exemption branch is executably covered.
  it("PASSES violating content on a grandfathered path, and FAILS it on a new one", () => {
    const gfPath = "refactor/classname-array-join-cn/61281c23e8ce";
    premiseHolds(
      "the planted path is in the frozen grandfather set",
      MECHANIZABLE_GRANDFATHERED.has(`docs/review-rounds/${gfPath}.md`),
    );
    premiseHolds(
      "the fixture arc path is NOT grandfathered, so new-filing checks bind",
      !MECHANIZABLE_GRANDFATHERED.has(`docs/review-rounds/${ARC}.md`),
    );
    const violating = [
      `## diff — ${ROUND_THRESHOLD} rounds`,
      "",
      "```",
      `**Examined:** R1-R${ROUND_THRESHOLD} raw-only in a fence`,
      "```",
      "",
      "**Mechanizable:** first uncited candidate",
      "",
      "**Mechanizable:** second duplicate marker",
      "",
      "- **Mechanizable:** nested under a list item",
      "",
    ].join("\n");
    expect(
      check([
        {
          path: `${gfPath}.jsonl`,
          body: rows(
            ...OBLIGING.map((o) => ({
              ...o,
              branch: "refactor/classname-array-join-cn",
              baseSha: "61281c23e8ce",
            })),
          ),
        },
        { path: `${gfPath}.md`, body: violating },
      ]),
    ).toEqual([]);
    // The same body on a non-grandfathered path is rejected - the exemption is
    // the only thing letting it pass, not the content being legal.
    expect(
      check([
        { path: `${ARC}.jsonl`, body: rows(...OBLIGING) },
        { path: `${ARC}.md`, body: violating },
      ]),
    ).not.toEqual([]);
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
    "### BL-PLANTED-NESTED-HEADING-ROW — a level-3 entry under a section",
    "",
    "Body prose.",
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

  // BACKLOG entries are written at BOTH heading depths - level 2 for top-level
  // rows, level 3 for rows nested under a section heading. Failure caught: a
  // recognizer admitting only one of the two depths, which leaves every
  // citation of a nested row falsely unresolved while the level-2 case above
  // stays green.
  it("resolves a BL- id defined by a level-3 BACKLOG.md heading", () => {
    expect(live("BL-PLANTED-NESTED-HEADING-ROW")).toEqual([]);
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

describe("clause B - the arc sum across merge bases (spec §3.1)", () => {
  // HALF the threshold in each of two bases: neither base obliges under clause
  // A, and the arc has still burned the full threshold. Derived from
  // ROUND_THRESHOLD so a raised threshold cannot make this vacuous.
  const HALF = ROUND_THRESHOLD / 2;
  const half = (baseSha: string) =>
    rows(...Array.from({ length: HALF }, (_, i) => ({ round: i + 1, baseSha })));

  // THE defect this whole arc exists for. Four diff rounds were burned; the
  // per-base reader sees two and two, obliges nothing, and every other
  // assertion in this suite passes while a real filing duty goes unreported.
  it("reports a stage that reaches the threshold only by summing across bases", () => {
    const problems = check([
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: half("aaaaaaaaaaaa") },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
  });

  // V2 and V3. A message that names the total but not WHERE the rounds were
  // burned sends a reader to the wrong file; a breakdown blind to stage is
  // wrong on 7 of the 11 live newly-owing pairs while the total stays right.
  it("names the total and the per-(baseSha, stage) breakdown BY VALUE", () => {
    const problems = check([
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: half("aaaaaaaaaaaa") },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
    ]);
    const message = problems.find((p) => p.kind === "missing_arc_filing")?.message ?? "";
    expect(message).toContain(`burned ${ROUND_THRESHOLD} counted rounds`);
    expect(message).toContain(`aaaaaaaaaaaa ${HALF}`);
    expect(message).toContain(`bbbbbbbbbbbb ${HALF}`);
    expect(message).toContain("feat/foo");
    expect(message).toContain("diff");
  });

  // K2a/`directory`. Excludes an accumulator keyed on stage alone, where each
  // directory overwrites the last and only the final one can ever report.
  // Every other two-directory fixture here gives both directories the same
  // obligation state, so none of them discriminates this.
  it("keeps directories independent, so a later clean one cannot mask an owing one", () => {
    const problems = check([
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: half("aaaaaaaaaaaa") },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
      // Sorts AFTER feat/foo and is nowhere near the threshold.
      { path: "feat/zzz/cccccccccccc.jsonl", body: rows({ branch: "feat/zzz", baseSha: "cccccccccccc" }) },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
    expect(problems[0]?.message).toContain("feat/foo");
  });

  // K2a/`stage`. A stage-blind clause B sums two diff rounds and two spec
  // rounds to the threshold and reports an arc that owes nothing.
  // K2a/`stage`. HALF the threshold of `diff` in one base and HALF of `spec`
  // in the other: neither stage reaches the threshold, and the ROWS sum to it
  // exactly. A stage-blind clause B reports an arc that owes nothing.
  it("keeps stages independent, so two half-stages do not sum into an obligation", () => {
    const problems = check([
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: rows(...Array.from({ length: HALF }, (_, i) => ({ round: i + 1 }))),
      },
      {
        path: "feat/foo/bbbbbbbbbbbb.jsonl",
        body: rows(
          ...Array.from({ length: HALF }, (_, i) => ({
            round: i + 1,
            baseSha: "bbbbbbbbbbbb",
            stage: "spec",
          })),
        ),
      },
    ]);
    expect(problems).toEqual([]);
  });

  // Clause B is RESIDUAL: when a base already reaches the threshold on its
  // own, clause A reports it and clause B must stay quiet, or one duty is
  // announced twice and a reader files twice.
  it("stays silent when clause A already reports the same stage", () => {
    const problems = check([
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: rows(...OBLIGING) },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_filing"]);
  });
});

describe("clause B scoping - satisfaction and suppression (spec §3.1)", () => {
  const HALF = ROUND_THRESHOLD / 2;
  const half = (baseSha: string, over: Record<string, unknown> = {}) =>
    rows(...Array.from({ length: HALF }, (_, i) => ({ round: i + 1, baseSha, ...over })));
  // The owing shape every case below is one ordinary edit from: HALF the
  // threshold in each of two bases, so clause A never fires and clause B must.
  const OWING: Fixture[] = [
    { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: half("aaaaaaaaaaaa") },
    { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
  ];
  // The declared count is PER BASE (count_mismatch is ratified per-base), so
  // it is a parameter: a section declaring the arc sum beside a base holding
  // half of it is a count_mismatch, not a satisfaction.
  const section = (stage: string, n: number) =>
    [`## ${stage} — ${n} rounds`, "", `**Examined:** R1-R${n}.`, "", "**Infra:** none.", ""].join("\n");

  // One filing section anywhere in the directory discharges the duty, because
  // the duty is attached to no single base (spec §4 limit 2). Both bases are
  // asserted so nothing can pass by privileging the first file enumerated.
  it("is discharged by a section at EITHER base", () => {
    for (const at of ["aaaaaaaaaaaa", "bbbbbbbbbbbb"]) {
      expect(check([...OWING, { path: `feat/foo/${at}.md`, body: section("diff", HALF) }])).toEqual([]);
    }
  });

  // AC-17. readArcs recognizes only ^[0-9a-f]{12}\.md$, so a stray prose file
  // is invisible to the canonical reader. A satisfaction lookup reading "any
  // .md under the directory" would let it discharge a real obligation while
  // the reader sees no filing at all - an obliged arc reported compliant.
  // Deliberately BELOW the per-base threshold in every base: the existing
  // stray-filing case reaches it in one base and asserts clause A, which a
  // loose clause B still emits, so that case passes either way.
  it("is NOT discharged by a stray non-arc .md carrying a parseable section", () => {
    const problems = check([...OWING, { path: "feat/foo/notes.md", body: section("diff", HALF) }]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
  });

  // K2b/`directory`. Excludes a satisfaction lookup that collects sections
  // globally, under which any filed directory anywhere silences every owing
  // directory in the corpus.
  it("does not let a DIFFERENT directory's filing discharge this one", () => {
    const problems = check([
      ...OWING,
      { path: "feat/zzz/cccccccccccc.jsonl", body: half("cccccccccccc", { branch: "feat/zzz" }) },
      { path: "feat/zzz/cccccccccccc.md", body: section("diff", HALF) },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
    expect(problems[0]?.message).toContain("feat/foo");
  });

  // K2b/`stage`. Excludes a lookup that ignores the filing's stage, under
  // which a spec section discharges a diff duty.
  it("does not let a spec section discharge a diff duty", () => {
    const problems = check([
      // Base A carries the spec rounds the spec section describes, so the
      // section is well-formed and the ONLY thing left to observe is whether
      // clause B lets it discharge the unrelated diff duty.
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: half("aaaaaaaaaaaa") + half("aaaaaaaaaaaa", { stage: "spec" }),
      },
      { path: "feat/foo/aaaaaaaaaaaa.md", body: section("spec", HALF) },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
    expect(problems[0]?.message).toContain("diff");
  });

  // K2c/`directory`. Excludes suppression that is global rather than
  // per-directory: one clause-A report anywhere would silence every clause-B
  // duty in the corpus.
  it("suppresses per directory, so a clause-A report elsewhere does not silence this one", () => {
    const problems = check([
      ...OWING,
      { path: "feat/zzz/cccccccccccc.jsonl", body: rows(...OBLIGING.map((o) => ({ ...o, branch: "feat/zzz", baseSha: "cccccccccccc" }))) },
    ]);
    expect(problems.map((p) => p.kind).sort()).toEqual(["missing_arc_filing", "missing_filing"]);
  });

  // K2c/`stage`. Excludes suppression that silences every stage in a
  // directory once any stage is suppressed.
  it("suppresses per stage, so a clause-A diff report does not silence a spec duty", () => {
    const problems = check([
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: rows(...OBLIGING) + half("aaaaaaaaaaaa", { stage: "spec" }) },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb", { stage: "spec" }) },
    ]);
    expect(problems.map((p) => p.kind).sort()).toEqual(["missing_arc_filing", "missing_filing"]);
    expect(problems.find((p) => p.kind === "missing_arc_filing")?.message).toContain("spec");
  });

  // Clause B is residual: a base already at the threshold is clause A's to
  // report, and announcing one duty twice sends a reader to file twice.
  it("reports only clause A when a base is at the threshold alone", () => {
    const problems = check([
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: rows(...OBLIGING) },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_filing"]);
  });

  // The spec §3.1 equivalence fixture: clause A satisfied at its own base,
  // and the remaining bases carry the rest of the arc's rounds.
  it("is clean when the at-threshold base carries its own section", () => {
    const problems = check([
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: rows(...OBLIGING) },
      { path: "feat/foo/aaaaaaaaaaaa.md", body: section("diff", ROUND_THRESHOLD) },
      { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
      { path: "feat/foo/cccccccccccc.jsonl", body: half("cccccccccccc") },
    ]);
    expect(problems).toEqual([]);
  });
});

describe("the arc-sum addition guard (spec §3.3)", () => {
  // Exemption is the CONJUNCTION of list membership and an all-pre-freeze
  // arc. Either half alone would let the set grow: membership alone makes the
  // list the whole mechanism, and the timestamp alone exempts every old arc in
  // the corpus. Both directions are cases here for exactly that reason.
  const HALF = ROUND_THRESHOLD / 2;
  const GF = ARC_SUM_GRANDFATHERED[0]!; // a real listed pair, never invented
  const half = (baseSha: string, over: Record<string, unknown> = {}) =>
    rows(...Array.from({ length: HALF }, (_, i) => ({ round: i + 1, baseSha, ...over })));
  const twoBase = (branch: string, over: Record<string, unknown> = {}): Fixture[] => [
    { path: `${branch}/aaaaaaaaaaaa.jsonl`, body: half("aaaaaaaaaaaa", { branch, ...over }) },
    { path: `${branch}/bbbbbbbbbbbb.jsonl`, body: half("bbbbbbbbbbbb", { branch, ...over }) },
  ];

  it("exempts a listed pair whose rows all predate the freeze", () => {
    premiseHolds(
      "the harness default row predates ARC_SUM_FREEZE, so the accepting case is not passing on an override",
      JSON.parse(row()).startedAt < ARC_SUM_FREEZE,
    );
    expect(check(twoBase(GF.branch, { stage: GF.stage }))).toEqual([]);
  });

  // K3/`branch`. Timestamp without list membership: every row predates the
  // freeze, and the branch is not among the eleven. A predicate that exempted
  // on age alone would silence most of the corpus.
  it("reports a pre-freeze arc whose branch is not listed", () => {
    const problems = check(twoBase("feat/foo"));
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
  });

  // List membership without the timestamp. One post-freeze row is enough:
  // the pair has kept burning rounds since the freeze, so it is no longer the
  // frozen historical arc the list describes.
  it("reports a listed pair carrying a row started after the freeze", () => {
    const problems = check([
      { path: `${GF.branch}/aaaaaaaaaaaa.jsonl`, body: half("aaaaaaaaaaaa", { branch: GF.branch, stage: GF.stage }) },
      {
        path: `${GF.branch}/bbbbbbbbbbbb.jsonl`,
        body: half("bbbbbbbbbbbb", {
          branch: GF.branch,
          stage: GF.stage,
          startedAt: "2026-08-23T00:00:00.000Z",
        }),
      },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
    expect(problems[0]?.message).toContain("freeze");
  });

  // A null startedAt cannot be PROVEN older than the freeze, so it fails the
  // same way. Conservative and loud beats a silent exemption.
  it("reports a listed pair carrying a row with no startedAt at all", () => {
    const problems = check([
      { path: `${GF.branch}/aaaaaaaaaaaa.jsonl`, body: half("aaaaaaaaaaaa", { branch: GF.branch, stage: GF.stage }) },
      {
        path: `${GF.branch}/bbbbbbbbbbbb.jsonl`,
        body: half("bbbbbbbbbbbb", { branch: GF.branch, stage: GF.stage, startedAt: null }),
      },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
    expect(problems[0]?.message).toContain("freeze");
  });

  // K3/`stage`. Without this, a predicate keyed on `branch` alone passes every
  // case above and silently exempts every OTHER counted stage on those eleven
  // branches. No declared mutation operator can drop a key coordinate
  // (spec §4 limit 8), so this control is the only thing that catches it.
  it("reports a DIFFERENT stage on a grandfathered branch", () => {
    const other = GF.stage === "diff" ? "spec" : "diff";
    premiseHolds(
      "the chosen stage is genuinely not the grandfathered one for this branch",
      !ARC_SUM_GRANDFATHERED.some((g) => g.branch === GF.branch && g.stage === other),
    );
    const problems = check(twoBase(GF.branch, { stage: other }));
    expect(problems.map((p) => p.kind)).toEqual(["missing_arc_filing"]);
    expect(problems[0]?.message).toContain(other);
  });
});

describe("clause B only ADDS (spec §3.2 monotonicity)", () => {
  // The risk clause B carries is not a wrong new report - the scoping controls
  // above cover that - it is SILENCING an old one. Suppression and satisfaction
  // both `continue`, and a mis-scoped one would swallow a per-base problem the
  // gate has always reported. So the battery asserts the per-base kinds that
  // survive, by value, over one fixture per problem shape.
  const HALF = ROUND_THRESHOLD / 2;
  const half = (baseSha: string, over: Record<string, unknown> = {}) =>
    rows(...Array.from({ length: HALF }, (_, i) => ({ round: i + 1, baseSha, ...over })));

  // Each fixture is ALSO owing under clause B, which is what makes the case
  // discriminating: a clause B that swallowed the per-base problem would
  // report only its own kind and still look busy.
  const BATTERY: { what: string; files: Fixture[]; perBase: string[] }[] = [
    {
      what: "a malformed row",
      files: [
        { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: half("aaaaaaaaaaaa") + "{not json\n" },
        { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
      ],
      perBase: ["malformed_row"],
    },
    {
      what: "a row whose declared identity contradicts its path",
      files: [
        { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: half("aaaaaaaaaaaa") },
        {
          path: "feat/foo/bbbbbbbbbbbb.jsonl",
          body: half("bbbbbbbbbbbb", { branch: "feat/other" }),
        },
      ],
      perBase: ["identity_mismatch", "identity_mismatch"],
    },
    {
      what: "rounds that are not contiguous",
      files: [
        {
          path: "feat/foo/aaaaaaaaaaaa.jsonl",
          body: rows({ round: 1 }, { round: 3 }),
        },
        { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
      ],
      perBase: ["round_gap"],
    },
    {
      what: "a .jsonl not named for any arc",
      files: [
        { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: half("aaaaaaaaaaaa") },
        { path: "feat/foo/bbbbbbbbbbbb.jsonl", body: half("bbbbbbbbbbbb") },
        { path: "feat/foo/scratch.jsonl", body: half("aaaaaaaaaaaa") },
      ],
      perBase: ["unrecognized_corpus_file"],
    },
  ];

  it.each(BATTERY)("still reports the per-base problem when $what", ({ files, perBase }) => {
    const problems = check(files);
    premiseHolds(
      "the fixture also owes under clause B, so a swallowed per-base problem cannot hide behind an empty result",
      problems.some((p) => p.kind === "missing_arc_filing"),
    );
    expect(problems.filter((p) => p.kind !== "missing_arc_filing").map((p) => p.kind)).toEqual(
      perBase,
    );
  });
});

describe("the arc-sum grandfather set can only shrink (spec §3.3)", () => {
  // Every assertion here reads the LIVE corpus, so the set is policed against
  // the thing it exempts rather than against a fixture that agrees with it.
  const live = readArcs(ROOT);
  const byBranch = new Map<string, typeof live>();
  for (const arc of live) {
    const group = byBranch.get(arc.branch);
    if (group) group.push(arc);
    else byBranch.set(arc.branch, [arc]);
  }

  it("holds exactly the dated count, as a second lock against a silent edit", () => {
    expect(ARC_SUM_GRANDFATHERED.length).toBe(11);
  });

  // This is the STRUCTURAL rejection of additions, not a convention. Every row
  // written from now on postdates the freeze, so no future arc can join the
  // set at all. A row with a null startedAt cannot be proven older and fails -
  // conservative and loud.
  it("carries only rows that predate ARC_SUM_FREEZE", () => {
    premiseHolds(
      "the live corpus still holds rows for every grandfathered pair",
      ARC_SUM_GRANDFATHERED.every(({ branch }) => (byBranch.get(branch) ?? []).length > 0),
    );
    const offenders = ARC_SUM_GRANDFATHERED.flatMap(({ branch, stage }) =>
      (byBranch.get(branch) ?? [])
        .flatMap((arc) => arc.rows)
        .filter((r) => r.stage === stage)
        .filter((r) => r.startedAt === null || !(r.startedAt < ARC_SUM_FREEZE))
        .map((r) => `${branch} ${stage} round ${r.round} startedAt=${r.startedAt}`),
    );
    expect(offenders).toEqual([]);
  });

  // The set can only SHRINK. An entry whose arc has since gained a filing, or
  // whose rows were deleted, is stale: it would silently exempt nothing while
  // reading as a live exemption.
  it("holds no entry that has stopped owing under clause B", () => {
    premiseHolds(
      "the live corpus holds at least one multi-base branch directory, so clause B can bind at all",
      [...byBranch.values()].some((group) => group.length > 1),
    );
    const stale = ARC_SUM_GRANDFATHERED.filter(({ branch, stage }) => {
      const group = byBranch.get(branch) ?? [];
      const arcSum = arcCountedRounds(group.flatMap((arc) => arc.rows)).get(stage) ?? 0;
      if (arcSum < ROUND_THRESHOLD) return true;
      return group.some(
        (arc) =>
          arc.filingText !== null &&
          parseFiling(arc.filingText).some((section) => section.stage === stage),
      );
    }).map(({ branch, stage }) => `${branch} ${stage}`);
    expect(stale).toEqual([]);
  });
});

describe("live corpus", () => {
  it("is clean", () => {
    // Discovered from disk: a new arc's files are covered by default and can
    // never be silently exempt. Empty today (spec §12 - this arc is
    // pre-adoption by construction), which is a legal clean state.
    expect(checkCorpus(ROOT, { resolvableIds: liveLedgerIds(ROOT) })).toEqual([]);
  });
});
