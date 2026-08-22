# Plan: mutation-score jurisdiction gap. The `OPERATORS:` disclosure arm, the heading-form trigger, the bullet-4 correction, the documented limit, the graduation

Spec: `docs/superpowers/specs/ci/2026-08-22-mutation-score-jurisdiction-gap.md` (canonical; every § reference below is to it unless another document is named). Ledger row: `BL-MUTATION-SCORE-JURISDICTION-GAP-ARITHMETIC-BRANCH`.

Outcome (c) is ratified (spec §1.4). This plan is the L-effort close the spec sizes: one code change to the dispatch gate (the `OPERATORS:` arm on the GUARD SURFACE score line, plus the trigger reading the ATX heading form the corpus already writes), with its gate test and the 24 corpus heading lines as replay fixtures; the same grammar changed in every normative copy in ONE commit; the documented limit; the index row; the graduation. No enrolled source, deciding suite, registry, partition, or operator file is touched (spec §2.6, AC-7).

impeccable-gate: N/A — no UI surface

**Files:** `scripts/codex-guard.mjs`, `tests/codexGuard/guardSurfaceGate.test.ts`, a NEW fixture module at tests/codexGuard/fixtures/guardSurfaceHeadingCorpus.ts (named in plain text because it does not exist yet), `tests/docs/_metaDeferralLedgerGraduation.test.ts`, `AGENTS.md`, `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md`, `docs/superpowers/specs/2026-07-19-codex-guard.md`, `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`, `docs/superpowers/specs/ci/README.md`, `BACKLOG.md`, `BACKLOG-archive.md`. Nothing under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`.

---

## 0. Pre-draft code-verification pass, authored AND RUN

Every citation below was READ at this branch's HEAD `9102025c5` (`origin/main` `50ca72a56` plus eight commits) on 2026-08-22. Line numbers are drafting-time locators; the symbol or searchable token beside each is the durable anchor. Task 1 inserts lines into `scripts/codex-guard.mjs` below line 528 and into the test file, so the locators in those two files hold only until Task 1 lands; re-verify by symbol, not by number.

| citation                                                                      | what is there                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/codex-guard.mjs:497`                                                 | `const MUTATION_SCORE_ARM =` (the regex on the next line)                                                                                                                           |
| `scripts/codex-guard.mjs:518`                                                 | `function checkGuardSurfaceDeclarations(cfg) {`                                                                                                                                     |
| `scripts/codex-guard.mjs:525`                                                 | `const m = /^\s*GUARD SURFACE:(.*)$/.exec(line);` (the trigger; gains the optional ATX marker)                                                                                       |
| `scripts/codex-guard.mjs:528`                                                 | `const score = MUTATION_SCORE_ARM.exec(remainder);` (the score arm)                                                                                                                 |
| `scripts/codex-guard.mjs:537`                                                 | the safe-integer `if (` whose body is the bare `continue;` at line 543; the `OPERATORS:` check replaces that `continue`                                                              |
| `scripts/codex-guard.mjs:545`                                                 | `if (/CANNOT-EXPRESS:\s*\S/.test(remainder)) continue;` (the cannot-express arm, unchanged)                                                                                         |
| `scripts/codex-guard.mjs:549`                                                 | `usageError(` whose message names both arms; gains the third element                                                                                                                |
| `tests/codexGuard/guardSurfaceGate.test.ts:40`                                | "EXITS 2 on a declared line with neither arm"; asserts `MUTATION SCORE`, `CANNOT-EXPRESS`, `AGENTS.md` in stderr                                                                    |
| `tests/codexGuard/guardSurfaceGate.test.ts:56`                                | PASS fixture, a plain-form score line with no `OPERATORS:`; becomes a rejecting input after Task 1                                                                                   |
| `tests/codexGuard/guardSurfaceGate.test.ts:101`                               | mixed brief: a conforming score line plus a bare line; exits 2 on the bare line before and after                                                                                    |
| `tests/codexGuard/guardSurfaceGate.test.ts:159`                               | PASS fixture, the below-floor `0/1` line (documented limit §5.8); becomes a rejecting input after Task 1                                                                             |
| `tests/codexGuard/guardSurfaceGate.test.ts:240`                               | a conforming line INSIDE a fence beside a live bare line; exits 2 before and after; the fenced line is updated so it stays conforming by the new grammar                             |
| `tests/codexGuard/harness.ts:14`                                              | `GUARD` resolves `scripts/codex-guard.mjs` from `process.cwd()`; `mkRun` (line 123) writes under `os.tmpdir()`, never in the tree                                                    |
| `AGENTS.md:188`                                                               | "- Guard-surface briefs (round-1 diff only): a `GUARD SURFACE:` line …" (the dispatch-guard bullet)                                                                                 |
| `AGENTS.md:289`                                                               | "  4. **Score, when the surface is enrolled.** …" (convergence bullet 4)                                                                                                            |
| `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md:29`   | §2.1 item 3, the trigger: "If `scanText` has no line matching `/^\s*GUARD SURFACE:/m`"                                                                                              |
| `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md:31`   | §2.1 item 4, the score-arm bullet                                                                                                                                                   |
| `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md:33`   | §2.1 item 5, the rejection message                                                                                                                                                  |
| `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md:37`   | §2.1 accept-set paragraph                                                                                                                                                           |
| `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md:120`  | §5 item 8, the last documented limit                                                                                                                                                |
| `docs/superpowers/specs/2026-07-19-codex-guard.md:283`                        | §14, the cross-reference-only amendment paragraph                                                                                                                                   |
| `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md:367`      | §6.1, the quoted third bullet                                                                                                                                                       |
| `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md:399`      | §7 row L-10, the table's last row                                                                                                                                                   |
| `docs/superpowers/specs/ci/README.md:56`                                      | the last index row                                                                                                                                                                  |
| `BACKLOG.md:103`                                                              | the row heading; line 105 carries `**Status:** IN PROGRESS · **Branch:** docs/mutation-score-jurisdiction-gap`; the row ends at line 131                                            |
| `BACKLOG-archive.md:1`                                                        | newest-first; heading shape `## <id> — <title> — CLOSED <date>`                                                                                                                     |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts:682`                        | "every graduated id is archive-only"; `tests/docs/_metaLedgerInProgress.test.ts` rejects an in-flight archive row                                                                    |
| `tests/docs/specsReadmeIndexParity.test.ts:86`                                | "every doc has an index row" (the README guard Task 3 satisfies)                                                                                                                    |
| `probe/jurisdiction-census.mts`, `probe/jurisdiction-census.out.txt`          | the committed census (spec §1.0); output below                                                                                                                                      |

Census output, pasted from `pnpm exec tsx probe/jurisdiction-census.mts` at `9102025c5` (byte-identical to the committed `.out.txt`):

```text
surface psqlStartupScan declared [ 'relational-boundary', 'regex-quantifier-bound' ] floor 1
arm [ 1599, 1614 ] if (character === "$" && text[i + 1] === "(" && text[i + 2] === "(")
arm [ 1727, 1742 ] if (text[i] === "$" && text[i + 1] === "(" && text[i + 2] === "(")

operator                  declared  file-wide  reaches arm 1  reaches arm 2
relational-boundary        true             71          false          false
equality-flip              false           279           true           true
logical-connector          false           195           true           true
integer-literal            false           376           true           true
regex-quantifier-bound     true              8          false          false
statement-removal          false           417           true           true
declared-set sites 79

today: surfaces=42 totalBoots=4725 loads=[1186, 1183, 1179, 1177] psqlStartupScan weight=80 shard=1

widen +logical-connector: surfaces=42 totalBoots=4920 loads=[1235, 1232, 1227, 1226] psqlStartupScan weight=275 shard=2
  surfaces changing shard: 20

widen +logical-connector,equality-flip,integer-literal,statement-removal: surfaces=42 totalBoots=5992 loads=[1499, 1498, 1496, 1499] psqlStartupScan weight=1347 shard=0
  surfaces changing shard: 33
```

## 1. Every copy of the GUARD SURFACE grammar, enumerated by grep, landed in ONE commit

Orchestrator requirement (bl-orch, 2026-08-22): the grammar change touches every copy, enumerated from a grep rather than memory, and every normative copy lands in one commit so the copies cannot drift. Run at `9102025c5`:

```sh
git grep -n -E "GUARD SURFACE|MUTATION SCORE|MUTATION_SCORE_ARM" -- . ':!docs/review-rounds' ':!BACKLOG-archive.md' ':!DEFERRED-archive.md'
for d in $HOME/.claude $HOME/.claude-account*; do grep -l -E "GUARD SURFACE|MUTATION SCORE" "$d"/hooks/* 2>/dev/null; done
```

Run at `c34a86487` with this arc's own spec and plan excluded (`':!docs/superpowers/specs/ci/2026-08-22-mutation-score-jurisdiction-gap.md' ':!docs/superpowers/plans/2026-08-22-mutation-score-jurisdiction-gap.md'` appended to the pathspec, then `| cut -d: -f1 | sort | uniq -c | awk '{n++; l+=$1} END {print "files="n" lines="l}'`), the first command returns `files=45 lines=119`; of those 45 files, 35 are other plans and specs under `docs/superpowers/` (the same command with the pathspec narrowed to `docs/superpowers/plans docs/superpowers/specs` and the two owning specs also excluded, `| wc -l`). The second command returned NOTHING: no per-machine hook in any of the four config dirs scans the line (the review-convergence-gate hook checks bound, domain and fence only). Disposition of every hit:

| copy                                                                                         | kind                                                     | disposition                                                                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `scripts/codex-guard.mjs` (trigger at line 525, `MUTATION_SCORE_ARM`, the arms, the message) | the gate                                                 | **CHANGED, Task 1**                                                                                   |
| `tests/codexGuard/guardSurfaceGate.test.ts`                                                  | the gate's fixtures AND its header docblock (lines 9 to 14 state the two-arm contract) | **CHANGED, Task 1** (new cases, three updated fixtures, the corpus replay, and the docblock rewritten to the three-element contract plus the heading form; a live normative copy plan review round 1 found unscheduled) |
| `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md` §2.1 items 3, 4, 5; §5 | owns the grammar                                       | **CHANGED, Task 1**                                                                                   |
| `AGENTS.md` line 188 and bullet 4                                                            | the durable cross-CLI contract                           | **CHANGED, Task 1**                                                                                   |
| `docs/superpowers/specs/2026-07-19-codex-guard.md` §14                                       | the wrapper's canonical spec, cross-reference only       | **CHANGED, Task 1** (one sentence; §14 defers the grammar to the pair spec by design)                  |
| `docs/superpowers/specs/ci/2026-08-22-mutation-score-jurisdiction-gap.md`                    | this arc's spec                                          | already states the new grammar                                                                        |
| per-machine hooks under each config dir's `hooks/`                                           | none scan the line                                       | nothing to change; recorded here so the next reader does not re-grep                                  |
| 35 other files under `docs/superpowers/plans/` and `docs/superpowers/specs/`                  | dated plan/spec records quoting the old grammar for their own arcs | untouched: dated records are never corrected (`docs/agents/spec-self-review.md`, numeric sweep rule) |
| `BACKLOG.md` lines 1822 and 1834 (the speclint-predispatch-gate row's prose)                 | a ledger row describing the gate                         | untouched: descriptive, not a grammar statement                                                       |
| `tests/mutation/source/registry.ts` lines 242 and 1799; `tests/paneCompaction/enrolment.test.ts` line 12 | comments naming the line                     | untouched: the registry is the fenced seam (spec R5); neither states the grammar                      |
| `tests/specLint/fixtures/claimSweep/` plan fixtures                                          | spec-lint fixtures                                       | untouched: fixture corpora are frozen evidence                                                        |
| `docs/review-rounds/`, `BACKLOG-archive.md`                                                  | historical corpus                                        | excluded from the grep by design; never edited                                                        |

Re-run both commands at closeout with the same exclusions; the only NEW hits must be Task 1's files and the new fixture module.

## 2. Meta-test inventory

- **EXTENDS:** `tests/codexGuard/guardSurfaceGate.test.ts` (AC-1, AC-2, AC-3, AC-9); `tests/docs/_metaDeferralLedgerGraduation.test.ts`, the `BACKLOG_GRADUATED` registry, which is what enrolls a graduation in the archive-only and section-provenance assertions (running the suite after the move enrolls nothing; plan review round 1). `tests/docs/specsReadmeIndexParity.test.ts` is satisfied by the spec branch's README row (Task 3 retired).
- **CREATES:** the fixture module tests/codexGuard/fixtures/guardSurfaceHeadingCorpus.ts (new; plain text because it does not exist yet), the 24 corpus heading lines with their expected verdicts, derived by the Task 1 sweep command and frozen as evidence.
- Supabase call boundaries, sentinel hiding, admin-alert catalog, advisory-lock topology, no-inline-email: none applies (no Supabase call, no tile, no alert, no lock, no email path). `AUDITABLE_MUTATIONS` (invariant 10): N/A, no mutation surface under `app/`.
- Mutation registry: no row added or edited (spec R5). The round-1 diff brief declares `GUARD SURFACE: scripts/codex-guard.mjs` with `CANNOT-EXPRESS: spawn-only surface, no Vitest import edge (tests/codexGuard/harness.ts)`; no enrolled source is edited, so no score is stated and none is retired (spec §3).

## 3. Acceptance criteria (spec §5, restated one line each so the task markers resolve)

- **AC-1** a plain-form score line without `OPERATORS:` exits 2 before dispatch, zero fake-codex calls, message names `OPERATORS:`.
- **AC-2** the same line with an `OPERATORS:` tail dispatches; the two existing PASS fixtures are updated in the same commit.
- **AC-3** the cannot-express arm (on lines with no valid score arm) and the fenced-quotation behaviour are unchanged.
- **AC-4** harness spec §7 carries L-11; §6.1 points at the live bullet; the pair spec carries the arm and limit item 9.
- **AC-5** `AGENTS.md` bullet 4 rewritten in place (four points, no numbers); line 188 names the `OPERATORS:` element; `pnpm vitest run tests/docs/` green.
- **AC-6** the row is graduated; ledger meta-tests green; no marker reaches `main`.
- **AC-7** no enrolled source, deciding suite, registry, partition, or operator file in the diff; `pnpm mutation:sites psqlStartupScan` zero stale.
- **AC-8** the ci specs README carries the index row (landed on the spec branch; Task 3 retired).
- **AC-9** the ATX heading form is recognized; the 24 corpus heading lines replay with their classified verdicts (20 exit 2, 4 dispatch, 12 dispatch once a tail is appended); under the shipped trigger all 24 dispatch.
- **AC-1 (second half)** a score-shaped line is never rescued by a `CANNOT-EXPRESS:` tail: a valid score without `OPERATORS:` beside one exits 2, and a non-canonical `0/0` score beside one exits 2 (spec §2.2 matrix).

## 4. Tasks

Sequence: Task 1 (code + every grammar copy, one commit) → Task 2 (harness-spec limit) → closeout §5 items 1 to 9 (gates, push, the whole-diff review, CI) → Task 4 (graduation + registry row + marker strip, the PR's LAST commit) → closeout §5 items 10 and 11 (the scoped review of that commit plus a fresh CI read on the final head, then readiness). Task 3, the index row, is already landed on the spec branch (see below). Task 2 is docs-only and may be authored before Task 1's review lands, but it commits after it. The two obligations this ordering satisfies together: the marker comes off in the PR's last commit (invariant 12, spec §2.5), and the head that merges is a reviewed, CI-read head (review covers what merges) because the last commit gets its own scoped review and its own CI read.

<!-- tasks: depth=3 red-contract -->

### Task 1: the `OPERATORS:` arm and the heading-form trigger, in the gate and in every normative copy of its grammar (one commit)

<!-- task: red=`pnpm vitest run tests/codexGuard/guardSurfaceGate.test.ts` red-state=authored red-target=`scripts/codex-guard.mjs:528` why=`the new cases write briefs whose GUARD SURFACE line carries a conforming score arm and no OPERATORS: tail, one in plain form and one as a ## heading, and assert exit 2 with zero fake-codex calls; at scripts/codex-guard.mjs:528 the score arm's safe-integer branch ends in an unconditional continue, and the trigger three lines above it never matches a heading, so the live gate dispatches both briefs (exit 0, one call each) and the cases fail on the exit code` ac=AC-1,AC-2,AC-3,AC-5,AC-9 -->

**What is red and why.** On the live tree `checkGuardSurfaceDeclarations` accepts any canonical score arm (the `continue` at `scripts/codex-guard.mjs:543`) and its trigger (`scripts/codex-guard.mjs:525`) never matches a line that begins with `## `. So a plain score line without `OPERATORS:` dispatches, and a heading-form score line dispatches whatever it carries. The new cases assert exit 2 and zero calls; they fail with `expected 0 to be 2` (the replay case on `resAll.code`). The red and the green are the SAME command, the full file, so no name filter can hide a case (plan review round 1: a `-t "OPERATORS"` filter matched five of the seven new titles and would have excluded the replay and the non-canonical cases from the red).

**RED, part 1: the fixture module.** Create the new file tests/codexGuard/fixtures/guardSurfaceHeadingCorpus.ts from the sweep (authored-and-run at plan time; output in spec §2.2 and below). It exports `HEADING_CORPUS: ReadonlyArray<{ readonly source: string; readonly line: string; readonly verdict: "reject-no-operators" | "reject-non-canonical" | "reject-bare" | "dispatch-cannot-express" }>` with the 24 lines VERBATIM (em dashes included; it is evidence) and the classification the canonical grammar gives each, derived by this command and frozen:

```sh
grep -hE '^\s*(#{1,6}\s+)GUARD SURFACE:' /Users/ericweiss/FX-worktrees/_briefs/*.md | wc -l   # 24
```

Classification at plan time (the spec §2.2 matrix: a line carrying the `MUTATION SCORE:` marker is decided by the canonical score arm plus `OPERATORS:` and is never rescued; the cannot-express arm decides only marker-free lines; otherwise bare):

| verdict                    | count | corpus lines (brief stem : line)                                                                                                                                                                         |
| -------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reject-no-operators        |    12 | arc-A diff-r1 : 14 and 16; arc-I diff-r1 : 36, diff-r2 : 54, diff-r3 : 66; arc-B diff-r1 : 24, diff-r2 : 24; arcD diff-r1 : 22, diff-r2 : 19, diff-r3 : 19, diff-r4 : 19; arc-H diff-r1 : 67 (the mixed score-plus-cannot-express line: the score arm binds, spec §2.2) |
| reject-non-canonical       |     6 | arc-claimsweep diff-r1-core : 15 and diff-r1-covers : 15 (a `<SCORE>` placeholder); arc-shell diff-r1 : 45, diff-r2 : 45, diff-r3 : 45, diff-r4 : 45 (`plus` where the grammar wants `, ; — – -`)        |
| reject-bare                |     2 | arc-C diff-r1 : 25, diff-r2 : 25                                                                                                                                                                         |
| dispatch-cannot-express    |     4 | arc-browser diff-r1 : 19, diff-r2 : 19, diff-r3 : 23, diff-r4 : 23                                                                                                                                       |

All brief stems are dated 2026-08-17 to 2026-08-20 and live in the briefs directory spec §3 names as probe domain. The fixture file carries each line's `source` as that stem plus line number, so a fixture can be traced to the brief it came from without the plan citing out-of-repo paths.

**RED, part 2: the cases.** Add to `tests/codexGuard/guardSurfaceGate.test.ts`, beside the "neither arm" case:

```ts
  // Jurisdiction spec §2.2: a score without the operator set it ranges over is
  // a number without its jurisdiction. Presence is checked, not membership
  // (spec §4 L-A), the same posture as the cannot-express citation.
  it("EXITS 2 on a score arm with no OPERATORS: tail, naming OPERATORS, without dispatching", async () => {
    const run = mkRun();
    briefWith(run, "GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("OPERATORS:");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("PASSES a score arm with an OPERATORS: tail through to the dispatch", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors; OPERATORS: relational-boundary, regex-quantifier-bound",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  // Spec review round 2: the score arm BINDS. A valid score without its tail is
  // rejected even when the line also carries a cannot-express tail; otherwise a
  // quoted score passes without its jurisdiction on the other arm.
  it("EXITS 2 on a score arm with no OPERATORS: tail even beside a CANNOT-EXPRESS: tail", async () => {
    const run = mkRun();
    briefWith(
      run,
      "GUARD SURFACE: tests/mutation/source/spawnBounded.ts - MUTATION SCORE: 12/12, 0 unaccepted survivors; CANNOT-EXPRESS: watchdog half, no string-literal operator",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("OPERATORS:");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("EXITS 2 on a NON-canonical score beside a CANNOT-EXPRESS: tail (marker precedence)", async () => {
    const run = mkRun();
    briefWith(
      run,
      "GUARD SURFACE: lib/foo.ts - MUTATION SCORE: 0/0, 0 unaccepted survivors; CANNOT-EXPRESS: spawn-only",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  it("EXITS 2 on an OPERATORS: marker with an empty tail", async () => {
    const run = mkRun();
    briefWith(run, "GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors; OPERATORS:");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // Spec review round 1: the corpus writes the declaration as a Markdown
  // heading and the shipped trigger never read it. Structure-keyed: one to six
  // `#` then whitespace, nothing else (spec §4 L-E).
  it("EXITS 2 on a HEADING-form score arm with no OPERATORS: tail (AC-9)", async () => {
    const run = mkRun();
    briefWith(run, "## GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("OPERATORS:");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("replays the 24 corpus heading lines: the 20 nonconforming ones are enumerated by number, the 4 conforming ones dispatch alone, the 12 score lines dispatch once a tail is appended (AC-9)", async () => {
    const rejected = HEADING_CORPUS.filter((r) => r.verdict.startsWith("reject-"));
    const accepted = HEADING_CORPUS.filter((r) => r.verdict.startsWith("dispatch-"));
    const scored = HEADING_CORPUS.filter((r) => r.verdict === "reject-no-operators");
    expect([rejected.length, accepted.length, scored.length]).toEqual([20, 4, 12]);

    const all = mkRun();
    briefWith(all, HEADING_CORPUS.map((r) => r.line).join("\n"));
    const resAll = await dispatch(all);
    expect(resAll.code).toBe(2);
    expect(readCalls(all)).toHaveLength(0);
    // The message enumerates EXACTLY the nonconforming lines, by 1-based line number.
    const listed = [...resAll.stderr.matchAll(/^\s+line (\d+):/gm)].map((m) => Number(m[1])).sort((a, b) => a - b);
    const expected = HEADING_CORPUS.map((r, i) => (r.verdict.startsWith("reject-") ? i + 1 : null)).filter((n): n is number => n !== null);
    expect(listed).toEqual(expected);

    const ok = mkRun();
    writeScenario(ok, [APPROVE_STEP]);
    briefWith(ok, accepted.map((r) => r.line).join("\n"));
    const resOk = await dispatch(ok);
    expect(resOk.code).toBe(0);
    expect(readCalls(ok)).toHaveLength(1);

    const tailed = mkRun();
    writeScenario(tailed, [APPROVE_STEP]);
    briefWith(tailed, scored.map((r) => `${r.line}; OPERATORS: all`).join("\n"));
    const resTailed = await dispatch(tailed);
    expect(resTailed.code).toBe(0);
    expect(readCalls(tailed)).toHaveLength(1);
  });
```

with `import { HEADING_CORPUS } from "./fixtures/guardSurfaceHeadingCorpus";` at the top. Three spawns for the replay, not 24: the enumeration assertion is the per-line classification (exact set equality on line numbers, so a conforming line listed or a nonconforming line omitted both fail), and the two dispatching briefs are its positive twins, so "accepted" is never proven by absence alone.

Run `pnpm vitest run tests/codexGuard/guardSurfaceGate.test.ts` (the full file, the same command the GREEN criterion names) and record the observed output in the commit message. Expected at RED: exactly the five new rejecting cases fail and every pre-existing case passes, namely: the plain no-tail case, the heading no-tail case, the empty-tail case, the score-plus-cannot-express case and the non-canonical-plus-cannot-express case fail with `expected 0 to be 2`; the replay case fails on `resAll.code` (the shipped trigger reads none of the 24 lines, so the brief dispatches: the incident in executable form); the with-tail case passes on the live tree, which is the stays-green direction and is expected.

**GREEN, the gate.** In `scripts/codex-guard.mjs`:

1. The trigger at line 525 becomes `const m = /^\s*(?:#{1,6}\s+)?GUARD SURFACE:(.*)$/.exec(line);` (one CommonMark structure, nothing else).
2. Replace the WHOLE stretch from `const score = MUTATION_SCORE_ARM.exec(remainder);` (line 528) up to, but not including, the cannot-express check `if (/CANNOT-EXPRESS:\s*\S/.test(remainder)) continue;` (line 545) with this block, verbatim (it was applied to a scratch copy of the wrapper at plan time and `node --check` passed; plan review round 2 found the earlier fragment-shaped snippet did not compile when followed literally):

```js
    const score = MUTATION_SCORE_ARM.exec(remainder);
    if (score !== null) {
      const killed = Number(score[1]);
      const total = Number(score[2]);
      // The shipped authority's no-mutants and unaccounted-mutants conditions
      // (tests/mutation/source/gate.ts): 0/0 and 2/1 are declarations of
      // nothing, not evidence. SAFE integers required (diff R1 finding 1):
      // past MAX_SAFE_INTEGER the operands round together and an impossible
      // killed > total pair reads as equal.
      if (
        Number.isSafeInteger(killed) &&
        Number.isSafeInteger(total) &&
        total >= 1 &&
        killed <= total
      ) {
        // Jurisdiction disclosure (2026-08-22 spec §2.2): a score is complete
        // over its DECLARED OPERATORS applied to code that exists, so the line
        // names the set it ranges over. Presence, not membership (spec §4 L-A),
        // the same posture as the floor (§5.8) and the cannot-express citation.
        if (/\bOPERATORS:\s*\S/.test(remainder)) continue;
      }
    }
    // Marker precedence (spec §2.2 matrix): a line that carries MUTATION SCORE:
    // in any shape is a score declaration and is never rescued by the
    // cannot-express arm, valid or not. Without this, `0/0 ...; CANNOT-EXPRESS: x`
    // dispatched on the second arm, and so did a valid score with no tail.
    if (/MUTATION SCORE:/i.test(remainder)) {
      bad.push(`  line ${i + 1}: ${line.trim().slice(0, 80)}`);
      continue;
    }
```

3. The `usageError` message: its second template segment becomes `(<killed>/<total> plus "0 unaccepted survivors" plus OPERATORS: <declared names, or all>) ` and the literal `or CANNOT-EXPRESS: <probe citation>` moves to the start of the third segment; the first segment is unchanged.
4. The header comment above `checkGuardSurfaceDeclarations` says the score arm carries the operator set and the trigger reads the ATX heading form. The header docblock of `tests/codexGuard/guardSurfaceGate.test.ts` (lines 9 to 14) is rewritten to the same contract in the same commit: it is a normative copy of the grammar and the plan's §1 grep lists it.

**GREEN, the fixtures.** Every `GUARD SURFACE:` fixture line in `tests/codexGuard/guardSurfaceGate.test.ts` was classified under the planned grammar at plan time (a script applying the trigger, the score arm, the `OPERATORS:` check and marker precedence to each line; authored and run). Twenty-one lines: four are canonical-score lines with no tail and therefore change verdict from dispatch to reject, every other line keeps the verdict its case already asserts (bare, non-canonical, floating fraction, and the `${decl}` templates all still reject; the cannot-express lines still dispatch). The four, each repaired by appending `; OPERATORS: all` (a full-set row's honest tail):

| line | case                                                                | why the tail                                                                                                                    |
| ---: | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
|   56 | "PASSES a conforming score-arm line"                                | asserts dispatch; rejecting input after Task 1 without the tail                                                                 |
|  101 | the MIXED brief (a conforming score line plus a bare line)          | asserts exit 2 FOR THE BARE LINE; without the tail it would exit 2 for two reasons and stop proving that a conforming line does not cover a bare sibling (plan review round 2) |
|  159 | "PASSES a canonical below-floor declaration"                        | asserts dispatch; rejecting input after Task 1 without the tail                                                                 |
|  240 | the fenced line in "a conforming disposition inside a fence does not SATISFY a live bare line" | must stay CONFORMING by the new grammar so the case keeps testing a conforming fenced line against a live bare one |

**Same commit, the grammar's normative copies (§1 table):**

1. `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md`:
   - §2.1 item 3: the trigger regex becomes `/^\s*(?:#{1,6}\s+)?GUARD SURFACE:/m`, with one sentence: the optional ATX marker was added 2026-08-22 after the corpus sweep found 24 heading-form declarations the original never read (jurisdiction spec §2.2).
   - §2.1 item 4, inside the score-arm bullet after its last sentence: a remainder that satisfies the score regex must also contain `/\bOPERATORS:\s*\S/` (the comma-separated declared operator names, or `all` for a full-set row); a score without the set it ranges over is a number without its jurisdiction; presence is checked, membership is not (§5 item 9).
   - §2.1 item 5: the message text in its new three-element form.
   - §2.1 item 4, the marker-precedence matrix copied from jurisdiction spec §2.2 in place of the "at least one arm" sentence: a remainder carrying `MUTATION SCORE:` is decided by the canonical score arm plus `OPERATORS:` and is never consulted against the cannot-express arm, valid or not; the cannot-express arm decides only marker-free remainders.
   - §5 item 9: the `OPERATORS:` tail is checked for presence, not membership; `OPERATORS: all` on a scoped row passes; membership means registry semantics in a plain-node wrapper, the shape item 8 fences; contract: jurisdiction spec §4 L-A.
2. `docs/superpowers/specs/2026-07-19-codex-guard.md` §14: the phrase "canonical `MUTATION SCORE:` declaration with an empty unaccepted-survivor set" gains "and its `OPERATORS:` tail (2026-08-22)", and "a `GUARD SURFACE:` line" gains "(plain or ATX-heading form)". Nothing else; §14 defers the grammar to the pair spec by design.
3. `AGENTS.md` line 188, rewritten in place:

   > - Guard-surface briefs (round-1 diff only): a `GUARD SURFACE:` line in a round-1 `--stage diff` brief, plain or written as a Markdown heading, must carry, on that same line, `MUTATION SCORE: <killed>/<total>` plus "0 unaccepted survivors" plus `OPERATORS: <the declared operator names, or all>`, or `CANNOT-EXPRESS: <probe citation>`; otherwise the wrapper exits 2 before any dispatch, enumerating every nonconforming line. This is convergence-criterion bullet 4's enrolment-precedes-review rule made mechanical at the dispatch boundary; fenced quotations neither trigger nor satisfy it, and the gate never judges the declared value against the registry floor or the declared operator set against the registry row. Spec: `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md` §2; the operator-set arm and the heading form: `docs/superpowers/specs/ci/2026-08-22-mutation-score-jurisdiction-gap.md` §2.2.

4. `AGENTS.md` line 289, bullet 4: the first four sentences are rewritten in place (everything from "When the subject of a review IS a guard, proof, or equivalence surface the registry can express" to the end of the bullet is unchanged):

   > 4. **Score, when the surface is enrolled.** If the subject is a guard surface enrolled in the source-mutation registry (`tests/mutation/source/registry.ts`; spec `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`), the brief states the convergence criterion as **the mutation score plus an empty unaccepted-survivor set, stated with the operator set the score ranges over** (the `OPERATORS:` tail of the `GUARD SURFACE:` line); all three are machine-computed, none a matter of opinion. A score is complete over its DECLARED operators applied to code that EXISTS, and over nothing else: a scoped subset leaves the excluded operators' sites unscored, and a construct the code never distinguished generates no mutant at all (`docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md` §7 L-11). A "the guard does not pin what it claims" finding is therefore admissible **only with the surviving mutant that demonstrates it**, an operator and a site both from the declared set, **where at least one declared operator reaches the code in question**; there, if no declared operator produces a surviving mutant, the finding is refuted, or it is an operator proposal (a registry change carrying its own before/after numbers), and neither is a round on the current diff. Where NO declared operator reaches the code, an excluded operator of a scoped subset or a branch the code did not distinguish until this diff, the score says nothing and cannot refute: the finding is admissible with a domain probe drawn from the brief's `PROBE DOMAIN:`, and its repair is a deciding-suite case (the `psqlStartupScan` arithmetic-branch precedent, a bash-oracle matrix, `docs/superpowers/specs/ci/2026-08-22-mutation-score-jurisdiction-gap.md`), never a registry widening taken under review pressure. A score is never offered as guard completeness.

   The replaced sentences are DELETED, not left beside the new ones; after the edit `grep -c "neither a matter of opinion" AGENTS.md` is 0 and `grep -c "none a matter of opinion" AGENTS.md` is 1.

**Gates inside this task** (authored and run at plan time against `be301fc5d`; left column is the current output):

```sh
git grep -c -F 'OPERATORS:' -- AGENTS.md                                                          # now: exit 1 (no match) -> after: >= 2
git grep -c -F 'OPERATORS:' -- docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md   # now: exit 1 -> after: >= 2
git grep -c -F 'OPERATORS:' -- docs/superpowers/specs/2026-07-19-codex-guard.md                   # now: exit 1 -> after: 1
git grep -c -F 'OPERATORS:' -- scripts/codex-guard.mjs                                            # now: exit 1 -> after: >= 2
git grep -c -F '(?:#{1,6}\s+)?GUARD SURFACE:' -- scripts/codex-guard.mjs docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md   # now: exit 1 (a bare `#{1,6}` already occurs twice in the wrapper, at unrelated regexes, so the gate keys on the full trigger literal) -> after: 1 each
git grep -c -F 'neither a matter of opinion' -- AGENTS.md                                         # now: 1 -> after: exit 1 (deleted, not appended)
```

**GREEN criterion (the SAME command, full file):** `pnpm vitest run tests/codexGuard/guardSurfaceGate.test.ts` green, every case. Then `pnpm vitest run tests/codexGuard/` (the whole wrapper suite; it spawns the wrapper per case) and `pnpm vitest run tests/docs/` (the AGENTS.md structural pins). `pnpm typecheck` for the new fixture module.

Commit: `feat(codex-guard): OPERATORS: on the GUARD SURFACE score arm, heading-form trigger, every grammar copy`, with the red output and the six grep results in the body.

### Task 2: the documented limit in the harness spec (L-11) and the §6.1 pointer

<!-- task: red=`git grep -q -F '| L-11 |' -- docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md` red-state=live why=`the harness spec's §7 table ends at L-10 on the live tree, so the grep for an L-11 row exits 1 until this task appends it` ac=AC-4 -->

**What is red and why.** The grep exits 1 at `9102025c5` (run at plan time; no output); it exits 0 once the row lands.

**Edit 1.** Append to the §7 table, after the L-10 row (`docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md:399`), the L-11 row EXACTLY as spec §2.4 states it (copy; it is the single source, do not paraphrase).

**Edit 2.** In §6.1, after the quoted bullet, one sentence: the live text of this bullet is `AGENTS.md` convergence-criterion bullet 4, amended 2026-08-22 with the jurisdiction clause (§7 L-11; jurisdiction spec §2.3); the quotation above is the 2026-08-04 original and is not updated.

**Gate.** `pnpm spec:lint docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`: no NEW hard finding against the pre-edit run (capture both; set equality on the hard set, since this spec carries pre-existing advisories).

Commit: `docs(spec): harness spec L-11, score jurisdiction is declared operators over existing code`.

<!-- tasks: end -->

### Task 3 (retired): the index row

Landed on the spec branch itself, because the spec file ships there and `tests/docs/specsReadmeIndexParity.test.ts` ("every doc has an index row") is red on that branch until the row exists. AC-8 is satisfied before implementation starts; nothing for the implementation pane to do. No marker: there is no red left to observe.

## 5. Closeout: gates, the freeze diff, the whole-diff review, CI, then the last commit with its scoped review and its own CI read (not a task marker; every command here is a gate that passes, proved able to fail)

1. `pnpm typecheck`; `pnpm exec eslint .`; `pnpm format:check`, all unwrapped.
2. `pnpm vitest run tests/codexGuard/ tests/docs/`, scoped, unwrapped.
3. `pnpm heavy pnpm test:fast`: the full default suite, WRAPPED at the outermost entry (AGENTS.md heavy-slot rule), one run, `run_in_background`.
4. `pnpm mutation:sites psqlStartupScan` prints zero stale rows (spec §2.6's checkable consequence); `pnpm exec tsx probe/jurisdiction-census.mts` diffed against the committed `.out.txt` is byte-identical, because no enrolled input moved.
5. **The freeze diff (AC-7), run before the whole-diff dispatch and again on the final head:** `test -z "$(git diff --name-only origin/main...HEAD -- tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts tests/mutation/source/registry.ts tests/mutation/source/shardPartition.ts tests/mutation/source/operators.ts)"` exits 0. Proved able to fail at plan time by a CONSTRUCTED failing input: the identical command with `docs/superpowers/specs/ci/2026-08-22-mutation-score-jurisdiction-gap.md` appended to the path list prints that path and exits 1 (run 2026-08-22 at `48ad0ad30`: `gate rc=0`, `constructed rc=1`). `git diff --name-only origin/main...HEAD` is exactly the union of the eleven `**Files:**` entries and the eight paths the branch already carries at `7708d8e1b` (`BACKLOG.md`, `docs/superpowers/specs/ci/README.md`, the spec, this plan, `probe/jurisdiction-census.mts`, `probe/jurisdiction-census.out.txt`, and the two corpus files under `docs/review-rounds/docs/mutation-score-jurisdiction-gap/`): two overlap (`BACKLOG.md`, the README), so the union is 17 distinct paths, derived at plan time by `git diff --name-only origin/main...HEAD` plus the `**Files:**` list and re-derived at closeout by the same command (plan review round 2: the earlier "eleven plus the fixture" double-counted the fixture and omitted the branch's own artifacts).
6. Re-run the §1 grep pair; the only new hits are Task 1's files, the fixture module, and this plan.
7. **Round-1 `--stage diff` brief**, dispatched against the head that holds Tasks 1 and 2 (one scope; the diff is the 17 paths of item 5 minus the graduation's two ledger files and registry row, which land after the APPROVE; no split needed): REVIEWER ONLY; consequence bound, PROBE DOMAIN and threat fence copied from spec §3, each on ONE line (the convergence hook greps per line); `GUARD SURFACE: scripts/codex-guard.mjs` with `CANNOT-EXPRESS: spawn-only surface, no Vitest import edge (tests/codexGuard/harness.ts)` on that same line; the do-not-relitigate list from spec §1.1 R1 to R7 plus "presence not membership (§4 L-A)" and "the heading-form widening is bounded by the sweep (§4 L-E)" and "marker precedence: a score-shaped line is never rescued (§2.2 matrix)"; the four pre-dispatch string-presence mutants for the new cases' `toContain("OPERATORS:")` (value emptied; suffix appended; the word present only inside a fence; the `OPERATORS` regex varied) run against the wrapper by editing a SCRATCH brief, never the tree, and recorded in the brief. **Dispatch through the MAIN checkout's wrapper**, `~/.claude/bin/codex-guard` (it execs `$HOME/FX-Webpage-Template/scripts/codex-guard.mjs`), so the file under review is not the file running the review; dry-run the convergence hook first; `run_in_background`; fresh timestamped `--out`. Cap 4; a fourth counted diff round files the round-economy record in the arc's corpus directory.
8. If a review round demands a repair, the repair lands, the SAME whole-diff review is re-dispatched against the new head, and the round count continues; the whole-diff APPROVE is on the head that holds everything except the graduation.
9. Push; real CI green BY NAME on that head (the twelve required contexts in both vocabularies, sha-keyed; Vercel FAILURE is the deploy rate limit and is not required; a rollup PENDING with every named check green is suppressed).
10. **Task 4 lands now, as the PR's LAST commit** (invariant 12; spec §2.5): the graduation, its registry row, the marker strip. Then a SCOPED closeout review of that one commit alone (`--stage diff`, the next round number, brief scoped to `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`; precedent: the resurrect-mobile-safari arc's rounds 8 and 9, `docs/review-rounds/test/resurrect-mobile-safari-e2e/b2aca7b02547.md`), dispatched concurrently with a fresh sha-keyed CI read on the final head. Both must be green: the scoped APPROVE and the twelve checks on the final sha. A finding on the closeout commit is repaired in a further commit that is itself the new last commit, re-reviewed the same scoped way, and re-read by CI; nothing merges unreviewed or unread.
11. Readiness report to `bl-orch` naming the FINAL head sha, the scoped APPROVE, and the twelve checks on that sha; the merge word is the orchestrator's.



<!-- tasks: depth=3 red-contract -->

### Task 4: graduation, registry row and marker strip (the PR's LAST commit, after the whole-diff APPROVE and CI, followed by its own scoped review and CI read)

<!-- task: red=`git grep -q -F '## BL-MUTATION-SCORE-JURISDICTION-GAP-ARITHMETIC-BRANCH' -- BACKLOG-archive.md` red-state=live why=`the row lives in BACKLOG.md on the live tree and the archive has no heading for it, so the grep exits 1 until the graduation moves it` ac=AC-6 -->

**What is red and why.** The grep exits 1 at `9102025c5` (run at plan time); 0 after the move. `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts` is the GREEN criterion beside it (active/archive exclusivity, no in-flight archive row, mint-bar fields preserved).

Move the row (`BACKLOG.md:103` through the "Close condition" paragraph at line 131) to the TOP of `BACKLOG-archive.md`:

- Heading: the row's heading with the archive's closing suffix (an em dash, then `CLOSED <closeout date>`, the day this commit lands; the shape of the archive's first heading).
- Meta line: replace `**Status:** IN PROGRESS · **Branch:** docs/mutation-score-jurisdiction-gap` with `**Status:** CLOSED <closeout date> · **Resolution:** re-scoped 2026-08-22 (orchestrator ruling, wave-6 arc brief) to admit a documented-limit close, then closed as documented limit (harness spec §7 L-11) plus the OPERATORS: disclosure arm on the GUARD SURFACE score line, the heading-form trigger, and the bullet-4 admissibility correction · **Shipped by:** docs/mutation-score-jurisdiction-gap`; keep every other field (`Filed`, `Severity`, `Class`, `Effort`, `Facing`, `Class-sweep exception`, `Reachability`, `Incident`) verbatim.
- Body: verbatim, including the operator table, its correction history, and the original two-outcome close condition (kept, not edited).
- Closing paragraph, RE-SCOPE FIRST: the original close condition named only (a) a per-region mechanism and (b) a ratified widening; the orchestrator's wave-6 arc brief of 2026-08-22 added (c) a documented-limit close with a required disclosure as a first-class outcome, on the row's own finding that the general shape outranks the instance (spec §1, opening paragraph); then the three-way decision and where it is argued (spec §1); the re-censused numbers at `50ca72a56` (four reaching operators, cheapest `logical-connector` at 195 file-wide, widening 80 to 275 boots and 20 surfaces repartitioned); why (a) and (b) were declined, one sentence each; the round-1 incident (24 heading-form declarations the gate never read, 10 of 24 declaring round-1 briefs dark) and the round-2 rule, swept into the §2.2 marker-precedence matrix (a score-shaped line is never rescued); the re-file triggers verbatim from L-11 and L-E.
- The graduation registry: append to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (the `as const` array whose last rows carry `provenance: "chore/guard-completeness-wave"`) one row, `{ id: "BL-MUTATION-SCORE-JURISDICTION-GAP-ARITHMETIC-BRANCH", provenance: "docs/mutation-score-jurisdiction-gap" }`, with a comment naming the re-scope. The `provenance` string must appear inside the archive section (it does: the `**Shipped by:**` field carries the branch name); the suite's "every graduated id is archive-only" and the per-id provenance case then bind this graduation, which merely running the suite after the move would not.
- The in-progress marker is gone with the move. `pnpm ledger:claims --check BL-MUTATION-SCORE-JURISDICTION-GAP-ARITHMETIC-BRANCH` then reports the id as archived.

This commit is the PR's LAST commit (invariant 12: the marker comes off in the last commit before the merge; spec §2.5), landed after the whole-diff APPROVE and the CI read on the pre-graduation head. It is not unreviewed and not unread: §5 item 10 gives it a scoped closeout review of its own and a fresh sha-keyed CI read on the final head, so the merged head is a reviewed, CI-green head (plan review rounds 1 and 2 together: the first required the reviewed head to be the merged head, the second required the marker-strip commit to be last; a scoped review of the last commit satisfies both). The heading date is the day this commit lands (the closeout date; spec §2.5's wording amended from "merge date" to say so, since the merge date is not known before the merge word).

Commit: `docs(ledger): graduate BL-MUTATION-SCORE-JURISDICTION-GAP-ARITHMETIC-BRANCH, documented limit plus OPERATORS: disclosure`.

<!-- tasks: end -->

## 6. Rules that bind the implementation pane

- **Never mutate the tree while a reviewer is live against it.** Drafting happens in the scratchpad; commits land between dispatches.
- **The wrapper under change is not the wrapper that reviews it.** Dispatch every review of this branch through the main checkout's wrapper (`~/.claude/bin/codex-guard`) and say so in the brief.
- **One commit for Task 1.** The gate, its fixtures, the pair spec, the codex-guard spec, and AGENTS.md move together or not at all (§1).
- **Task 4 is the PR's last commit, and it is reviewed and CI-read on its own.** The marker comes off in that commit and never reaches `main` (invariant 12); the scoped closeout review of that commit plus the fresh CI read on the final sha are what make the merged head a reviewed head (review covers what merges). Nothing lands after the scoped APPROVE and its CI read.
- **No edit to any enrolled input.** Spec §2.6; AC-7 is the gate. `pnpm mutation:sites psqlStartupScan` zero stale before and after.
- **Dated records are not corrected.** The 35 historical plans and specs quoting the old grammar stay as they are (§1 table).
- **Heavy phases wrapped at the outermost entry**, `run_in_background`; CI read by name, both vocabularies, sha-keyed.
- **Fleet notice in the readiness report:** from the merge, every round-1 diff brief's score arm needs an `OPERATORS:` tail, and heading-form declarations are now read and held to the whole canonical grammar (separator included); the wrapper exits 2 naming the missing element; in-flight arcs past round 1 are unaffected.

## 7. Self-review transcript (writing-plans passes, run at plan time)

- Pre-draft verification: §0, every row read at `9102025c5`.
- Declared task contract: two `depth=3 red-contract` regions (Tasks 1 and 2; Task 4 after the closeout, because it executes last), the retired Task 3 note and the closeout as plain prose between them, because the closeout's commands are gates that pass today and were proved able to fail by constructed input (§5 item 5), which is the gate treatment rather than a `red=`. Every marker carries `red-state` and `why`; the authored one carries `red-target`. `pnpm spec:lint --exec-red` on this plan: the two `red-state=live` greps exit 1 (red observed); the authored red is the full-file suite command, the same command as the GREEN criterion, with no name filter.
- Anti-tautology: every red is a VALUE assertion on the exit code with a zero-call twin; the replay's "accepted" class is proven by a dispatching brief, not by absence from the rejection list; the empty-tail case pins the `\S` in the regex; the heading case pins the trigger and the plain case pins the arm, so neither can pass for the other's reason.
- String-presence mutants for `toContain("OPERATORS:")`: listed in §5 item 7 for the implementer to run before dispatch.
- Reconciliation sweep: §1, authored and run, per-hit disposition; re-run at closeout (§5 item 6).
- Registry count reconciliation: no registry rows change (spec R5); `pnpm mutation:sites psqlStartupScan` is the executable proof.
- Typecheck of pasted snippets: the test snippet uses only symbols the file already imports plus the new fixture import; the wrapper snippet is plain JS inside an existing `if`; the fixture module is a typed constant array.
- Meta-test inventory: §2.
- Adversarial review (cross-model): codex `--stage plan` on this document before handoff; APPROVE required.
