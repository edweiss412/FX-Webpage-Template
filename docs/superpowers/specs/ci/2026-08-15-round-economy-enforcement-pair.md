# Round-economy enforcement pair: guard-surface dispatch gate + Mechanizable ledger parity

**Date:** 2026-08-15 · **Ledger rows:** `BL-CODEX-GUARD-ENROLMENT-PRECEDES-DISPATCH`, `BL-FILING-MECHANIZABLE-LEDGER-PARITY` (both `BACKLOG.md`) · **Branch:** `chore/round-economy-enforcement-pair`

Two enforcement halves, one arc, both mechanizing prose rules the round-economy corpus measured failing as prose:

- **Half A** — `scripts/codex-guard.mjs` refuses (exit 2, before any tokens burn) a round-1 `--stage diff` dispatch whose brief declares its subject a guard surface but states neither its mutation score + unaccepted-survivor set nor a cannot-express disposition. Mechanizes followups-2 promotion P2 (`docs/superpowers/specs/ci/2026-08-09-round-economy-followups-2.md` §2 P2), whose §5 non-goals deliberately excluded enforcement; this spec is that scheduled enforcement.
- **Half B** — `tests/docs/_metaReviewRoundEconomy.test.ts` additionally requires a NEW filing's non-none `**Mechanizable:**` entry to cite a resolvable `BL-`/`DEF-` id or decline explicitly (`declined: <reason>`), plus a one-time backfill dispositioning the enumerated stray candidates already merged.

## §1.1 Resolved scope — do not relitigate

1. **Trigger is an opt-in declaration line, not inference.** Half A fires only on a brief carrying a `GUARD SURFACE:` line. An undeclared guard-surface brief passes unchecked — a DOCUMENTED LIMIT (§5), same posture as the convergence hook's `PROBE DOMAIN:` line (AGENTS.md, convergence-criterion bullet 2): the declaration convention binds authors via the prose rule; the gate enforces the declared case. NLP-detecting "this brief is about a guard" is the recognizer-growth failure mode the round-economy corpus documents (speclint-prose-count-parity, 20 flat rounds) and is out of scope. Ratified by the ledger row itself: "Detection heuristics, override mechanics, and whether the declaration is a brief line or a flag belong to the implementing arc" (`BACKLOG.md`, `BL-CODEX-GUARD-ENROLMENT-PRECEDES-DISPATCH`).
2. **Round-1 diff only.** The row's title and body scope the gate to "a round-1 `--stage diff` dispatch". Spec/plan/task stages and rounds ≥ 2 are exempt by design — the AGENTS.md contract puts the score statement in "the round-1 brief" (convergence-criterion bullet 4).
3. **Entry-level granularity for Half B.** The row's gate half reads "a filing's non-none `**Mechanizable:**` entry must contain a resolvable `BL-`/`DEF-` id OR an explicit decline marker" — per entry, not per candidate. A block listing three candidates and citing one id passes (§5).
4. **Filings are immutable evidence; the existing corpus is grandfathered as-is** (corpus contract, `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md`; restated in the ledger row). No retro-edit of any merged filing, including the five stray candidates' filings. Grandfathering is a frozen path list (§3.3), a closed historical set — legitimately enumerated, never grown.
5. **The per-machine review-convergence hook is untouched.** The row fences it: "The per-machine review-convergence hook cannot carry this (it lives outside the repo and P2's arc fenced it off)". Enforcement lands only in tracked files.
6. **Row-vs-decline for each backfill candidate is this arc's call**, per the row's delegation ("the implementing arc decides which, per the ledger filing bar"). Dispositions in §4 are final for this arc; a reviewer disputing one argues against the ledger filing bar's own admissibility terms, not this spec.
7. **The score arm is a hygiene check on the declaration's existence and well-formedness, never a re-derivation of gate truth (ratified after spec R4).** Rounds 1, 3, and 4 each landed a finding on this one recognizer; per the repair-economy rule (`docs/agents/writing-plans.md`, "when consecutive rounds keep landing on ONE function, the mechanism is answering the wrong question"), the arm's final question is "did the author state their enrolment evidence in the one canonical shape" — §2.1's single anchored regex plus the two impossibility checks. Value-judgment probes (below-floor, accepted-row consistency, staleness of the stated run) file to §5.7, not to a round; an admissible new finding on this arm must show a CANONICAL declaration accepted with impossible accounting, or a conforming declaration rejected.
8. **`codex-guard.mjs` itself is cannot-express for the source-mutation registry**, measured not argued: the runner overlays a target only when a Vitest suite imports it, and every suite in `tests/codexGuard/*.test.ts` spawns the script as a child process (e.g. `tests/codexGuard/happyPath.test.ts`) — no import edge exists. Same shape class as the measured un-enrollable CLI oracle recorded in `tests/mutation/source/registry.ts` (the `phantomGapExecuted` row's header comment: enrolled whole, the sibling one-file CLI scored 0.27 with 18/19 survivors unreachable). The lib half (`lib/reviewRounds/filing.ts`, `corpus.ts`) IS expressible; `corpus.ts` and `count.ts` are already enrolled (`reviewRoundCorpus`, `reviewRoundCount` rows) and this arc enrols `filing.ts` (§6.3).

## §2 Half A — codex-guard guard-surface dispatch gate

### §2.1 Behavior

At config-validation time — after `--brief` is read (`scripts/codex-guard.mjs`, `cfg.briefText` at the `--brief unreadable` guard) and before lock/dispatch, alongside the existing exit-2 usage guards (`usageError`, `scripts/codex-guard.mjs:45`; missing `--stage`/`--round` already exit 2 naming the flag):

1. Applies only when `cfg.stage === "diff" && cfg.round === 1`.
2. Compute `scanText = stripCodeBlocks(cfg.briefText)` (`scripts/codex-guard.mjs:537`) — the existing CommonMark-hardened fence eliding, so a brief QUOTING a marker inside a fenced block neither triggers nor satisfies the gate (use-vs-mention, the convergence gate's measured lesson).
3. If `scanText` has no line matching `/^\s*GUARD SURFACE:/m` — no check. Done.
4. **Per-line contract (spec R1 findings 1–2): each `GUARD SURFACE:` line declares ONE surface and carries that surface's own disposition on the SAME line.** A multi-surface arc writes one line per surface. Every line matching `/^\s*GUARD SURFACE:/` must have a remainder (text after the first colon) satisfying at least one arm:
   - **Score arm (canonical anchored grammar; final form after R1/R3/R4 all landed on this recognizer — the repair-economy narrowing, not another widening):** the remainder matches ONE regex binding marker, fraction, and survivor phrase adjacently: `/MUTATION SCORE:\s*(\d+)\s*\/\s*(\d+)\s*[,;—–-]?\s*(?:0|no)\s+unaccepted\s+survivors?\b/i`, with the captured `<killed>/<total>` satisfying `total >= 1` and `killed <= total` (the shipped authority's `no-mutants` and `unaccounted-mutants` conditions, `tests/mutation/source/gate.ts`). Adjacency is load-bearing (R4 `unrelated_fraction` probe): a floating fraction elsewhere in the line — a date, a "last run 12/12" aside — cannot satisfy the arm, because the fraction must directly follow the literal `MUTATION SCORE:` marker and the zero-unaccepted phrase must directly follow the fraction. "MUTATION SCORE: 82/84, 0 unaccepted survivors" satisfies it; "2 unaccepted survivors" is a declared non-converged surface and is rejected — dispatching on it is exactly what enrolment-precedes-review forbids.
   - **Cannot-express arm:** the remainder contains `CANNOT-EXPRESS:` with a non-empty tail — the honest re-disposition citing its probe (the step3 pattern, `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4). Content of the citation is the author's; the gate checks presence, not prose quality.
5. Any nonconforming `GUARD SURFACE:` line → `usageError` (exit 2). The message enumerates EVERY nonconforming line (line number + first 80 chars), not only the first, and names both arms: `each GUARD SURFACE: line in a round-1 diff brief must carry its own MUTATION SCORE (<killed>/<total> plus "0 unaccepted survivors") or CANNOT-EXPRESS: <probe citation> — see AGENTS.md convergence-criterion bullet 4`.

Why per-line rather than the drafted brief-global arms: probed against this arc's own round-1 brief shape (spec R1 findings 1–2, both in-domain and inside the accidental-author fence), a brief-global check let one surface's `CANNOT-EXPRESS:` silently absorb a deleted `MUTATION SCORE:` line, one surface's score silently cover a second enrolled surface, and a declared NON-empty unaccepted-survivor set pass. Binding score to survivor-emptiness on the same declaring line closes all three with no new recognizer over prose.

Accept-set, stated positively: the gate ACCEPTS (a) briefs with no line-anchored `GUARD SURFACE:` marker outside fenced blocks, (b) declared briefs in which EVERY `GUARD SURFACE:` line carries a conforming score arm or cannot-express arm in its own remainder, (c) any brief at stage ≠ diff or round ≠ 1. Everything else at the trigger point is rejected by name (the exit-2 message). Markers are case-sensitive SHOUTY, matching the existing brief-marker family (`VERDICT:`, `FINDINGS:`, `PROBE DOMAIN:`).

### §2.2 Non-interference

- No change to the recovery ladder, result contract, heartbeat, or row emission — the check runs entirely inside the existing pre-dispatch validation phase, so a rejected dispatch writes no result artifact, takes no lock, and appends no corpus row (identical to today's missing-`--stage` behavior).
- `--fallback` rescue dispatches pass through the same check (they carry `--stage`/`--round` already); a rescue of a round-1 diff review re-presents the same brief, which by then conforms.

## §3 Half B — Mechanizable ledger parity

### §3.1 Parse contract (`lib/reviewRounds/filing.ts`)

`FilingSection` gains a `mechanizable` field:

```ts
mechanizable: {
  /** trimmed value on the marker line begins `none` (word-bounded) */
  isNone: boolean;
  /** a `declined:` marker with a non-empty reason appears in the block */
  hasDecline: boolean;
} | null;   // null = no **Mechanizable:** marker in the section body
```

- The block spans from the `**Mechanizable:**` marker line (existing disposition regex family, `lib/reviewRounds/filing.ts:17`) through subsequent lines until the next line matching another bold-run field marker (`**Judgment:**`, `**Infra:**`, `**Examined:**`) or the section end. Multi-line candidate lists (the `docs/review-rounds/README.md` filing example) belong to the block.
- `isNone`: the marker-line remainder, trimmed, matches `/^none\b/i` — accepts `none`, `none.`, `none — all judgment-shaped`. (`**Mechanizable:** none` is the existing legal form, meta-test fixture `FILING_OK`, `tests/docs/_metaReviewRoundEconomy.test.ts:151`.)
- `hasDecline`: the block matches `/\bdeclined:\s*\S/i`.
- Id citation reuses the existing per-section `citedIds` (`CITED_ID`, `lib/reviewRounds/filing.ts:24`) — no second recognizer — but for the parity check the ids are collected from the MECHANIZABLE BLOCK only, not the whole section body: a Judgment paragraph citing a `BL-` row must not satisfy the Mechanizable entry's duty. The block-scoped ids are exposed as `mechanizable.citedIds`.
- Sections whose disposition uses a nonconforming marker spelling (the grandfathered `**Mechanizable** —` colon-less form in `docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md`) parse as `mechanizable: null` — for NEW filings that spelling already fails the existing `hasDisposition` requirement unless another disposition line is present; the parity rule does not add a spelling recognizer (§5).

### §3.2 Gate (`lib/reviewRounds/corpus.ts`)

New `ProblemKind`: `"mechanizable_untracked"`. In `checkCorpus`, for each section of a NON-grandfathered filing that passed the existing structural checks: if `mechanizable` is non-null, `!isNone`, `mechanizable.citedIds` is empty, and `!hasDecline` → problem:

```
<filingPath>:<line>: stage <stage> declares a non-none Mechanizable entry that cites no BL-/DEF- id and records no "declined: <reason>"
```

Resolvability of any cited id stays with the existing `unresolved_id` check — this rule requires presence; that rule requires resolution; together they are the parity contract.

### §3.3 Grandfather set

<!-- spec-lint: ignore — new file created by this spec's implementation; not yet tracked -->
Lives in `lib/reviewRounds/mechanizableGrandfather.ts`, a new module exporting `MECHANIZABLE_GRANDFATHERED: ReadonlySet<string>` of repo-relative filing paths (the corpus filename shape, branch directory + 12-hex merge-base stem, per `docs/review-rounds/README.md`), generated from the corpus as of this arc's merge base and committed as a literal. 55 paths at authoring time, the count corrected by re-running the derivation after spec R1 finding 3 (derivation: `find docs/review-rounds -name '*.md' ! -name README.md | wc -l` → `55`, 2026-08-15; the committed set is the executable declaration and the single source — this prose count carries the dated at-authoring-time qualifier and is never re-derived). Header comment states the contract: closed historical set, frozen at this spec's landing; a path is NEVER added (a new filing complies instead) and removed only if its filing file is deleted. `checkCorpus` consults it by `arc.filingPath`; fixture-planted arcs (`feat/foo/aaaaaaaaaaaa`, meta-test line 122) are not in the set, so fixtures exercise the new rule by default, and one fixture case plants a grandfathered path to pin the exemption.

### §3.4 Author-facing contract (`docs/review-rounds/README.md`)

The filing-duty section gains the rule: a non-none `**Mechanizable:**` entry (in a filing authored after 2026-08-15) either cites the `BL-`/`DEF-` row it filed, or declines in the form `declined: <reason>` — "belongs to whoever next touches X" is a decline and is written in that form. `**Mechanizable:** none` stays legal and unchanged.

## §4 Backfill — dispositioning the enumerated strays

Per the ledger row: each stray gets a `BL-` row (its filing already carries the probe evidence) or a recorded decline in the disposing arc's ledger note — here, the graduation note written when `BL-FILING-MECHANIZABLE-LEDGER-PARITY` is archived. Enumeration below is the probe, not the cover; the §3 gate is the cover for the next candidate.

| # | Candidate (filing citation) | Disposition |
|---|---|---|
| 1 | Workflow `paths:`-coverage generalization (classname plan filing cand. 3, R4-F2; `docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md`) | **BL row** — per-workflow wiring tests exist for three workflows (`tests/cross-cutting/app-e2e-ci-wiring.test.ts`, `lifecycle-layout-e2e-ci-wiring.test.ts`, `picker-flow-e2e-ci-wiring.test.ts`); the generic walk does not. |
| 2 | Playwright spec matching no project's `testMatch` (same filing, cand. 2) | **Probe at implementation:** if `tests/ci/_metaSpecRegistration.test.ts` (or the `_metaE2eWorkflowCoverage` scan, `tests/ci/_workflowCoverageScan.ts`) already asserts every `tests/e2e/*.spec.ts` matches ≥ 1 project, record a decline naming the covering test; else fold into candidate 1's BL row (same meta-test per the filing's own text). |
| 3 | Enumerated accept-set carries its calibration probe (delta-arc plan §, `docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md`) | **BL row** — plan-lint arm shape, sibling of `BL-SPECLINT-RED-EXECUTABILITY-ARM`. |
| 4 | Recorded SHA names its own expiry (same filing, delta-arc plan §) | **BL row** — plan-lint arm shape, same family. |
| 5 | Post-repair forward-reference self-consistency arm (`docs/review-rounds/chore/guard-completeness-wave/04f601134519.md`, spec § item (a)) | **BL row** — spec-lint arm cross-checking out-of-scope bullets / closeout summaries against sections mandating the same change. |
| 6 | BL-disposition closeout arm (same filing, spec § item (c)) | **BL row** — spec-lint arm: a spec dispositioning `BL-` ids owes a graduation/closeout section naming each id's terminal state. |

Each new BL row is filed at the ledger filing bar with `**Reachability:**` citing the originating filing's probe evidence; the rows may be consolidated where the filing itself says the arms share a mechanism (candidates 3+4 may share one row, and 5+6 may share one row, if the implementing pass confirms one lint surface serves both — the graduation note records the final row ids either way).

## §5 Documented limits

1. **Undeclared guard surface (Half A).** A round-1 diff brief whose subject is a guard surface but which omits `GUARD SURFACE:` passes the gate. The declaration duty is the AGENTS.md prose contract (convergence-criterion bullet 4); the gate enforces the declared case only. Conservative under-check, surfaced here.
2. **Marker prose quality (Half A).** `CANNOT-EXPRESS: because I said so` passes. The gate is structural; probe quality is the reviewer's and orchestrator's ground, per the admissibility contract.
3. **Entry-level granularity (Half B).** A non-none Mechanizable block with N candidates and one cited id passes. Per-candidate parity was considered and rejected — it requires a candidate recognizer over free prose, the exact recognizer-growth shape §1.1.1 fences off.
4. **Judgment/Infra entries carry no parity duty.** Only Mechanizable names work someone should schedule; the other dispositions describe why rounds happened.
5. **Colon-less `**Mechanizable** —` spelling parses as absent** (§3.1). For new filings the existing `hasDisposition` structural check plus this rule make the canonical spelling the only conforming one when Mechanizable is the sole disposition; a new filing pairing the colon-less spelling with a conforming `**Judgment:**` line evades the parity duty. Accepted: the spelling recognizer costs more than the residual leak, and the README states the canonical form.
6. **A filing file deleted and re-created keeps its grandfather exemption** (path-keyed). Filings are immutable evidence; deletion is already a corpus-contract violation this gate does not police.
7. **The score arm does not judge the declared value against the registry (R4 `below_floor` probe — fenced, not repaired).** `MUTATION SCORE: 0/1, 0 unaccepted survivors` is canonical, semantically possible, and passes the dispatch check even though both enrolled review-round surfaces carry `scoreFloor: 1`. Deciding floor-compliance at dispatch requires re-implementing registry semantics — per-surface `scoreFloor` plus accepted-row accounting live in `tests/mutation/source/registry.ts` and are verified by the gate's own multi-hour run — inside a plain-node CLI wrapper, which is the recognizer-growth failure mode the repair-economy rule exists to stop (three of four spec rounds landed on this one recognizer). The consequence bound holds without it: a below-floor declaration is LOUD — the value sits in the round-1 brief precisely so the reviewer reads it, and a reviewer facing "0/1" sees a red gate instantly. The dispatch gate forces the evidence to EXIST in canonical form; judging the stated value is the reviewer's and orchestrator's ground, like cannot-express probe quality (limit 2).

## §6 Testing (TDD per task)

<!-- spec-lint: ignore — new file created by this spec's implementation; not yet tracked -->
1. **Half A** — new `tests/codexGuard/guardSurfaceGate.test.ts` on the existing spawn harness (`tests/codexGuard/fixtures/fake-codex.mjs`): exit-2 with message naming both arms (declared line, neither arm); score-arm line passes; cannot-express line passes; a MIXED brief (one conforming cannot-express line plus one bare `GUARD SURFACE:` line) exits 2 naming the bare line — the spec R1 finding-1 probe pair (`mixed_missing_score`, `two_enrolled_one_score`) rendered as fixtures; a score line declaring a NON-empty unaccepted-survivor set (`1 unaccepted survivor`) exits 2 — the finding-2 probe (`nonempty_survivor_set`); a semantically invalid fraction exits 2 — the R3 probe pair (`0/0, 0 unaccepted survivors` and `2/1, 0 unaccepted survivors`) rendered as fixtures; a floating fraction without the adjacent `MUTATION SCORE:` marker does not satisfy the arm — the R4 `unrelated_fraction` probe (`last run 12/12; 0 unaccepted survivors`) rendered as a fixture; a canonical below-floor declaration (`MUTATION SCORE: 0/1, 0 unaccepted survivors`) PASSES the dispatch check and reaches the fake codex — the R4 `below_floor` probe pinned as the §5.7 documented limit, asserted in the accepting direction so the limit's fence is executable; the exit-2 message enumerates every nonconforming line when two are bare; round 2 exempt; `--stage plan` exempt; fenced `GUARD SURFACE:` does not trigger; a conforming disposition inside a fence does not satisfy a live bare line; a score line lacking the fraction or the zero-unaccepted-survivors phrase still exits 2.
2. **Half B** — extend `tests/docs/_metaReviewRoundEconomy.test.ts` fixtures: non-none + no id + no decline FAILS (`mechanizable_untracked`); block-scoped id passes; section-body id OUTSIDE the block does NOT satisfy it; `declined: <reason>` passes; `none` and `none — prose` pass; grandfathered path with violating content passes; live-corpus case (line 649) stays green. Extend `tests/reviewRounds/filing.test.ts` for the parse contract (block extent, `isNone`, `hasDecline`, block-scoped ids).
3. **Enrolment precedes review (dogfood).** Before the first diff dispatch: add a `reviewRoundFiling` row to `tests/mutation/source/registry.ts` (`sourcePath: lib/reviewRounds/filing.ts`, suites: `tests/reviewRounds/filing.test.ts` + the meta-test), run `pnpm mutation:guards`, and write the round-1 diff brief in the §2.1 per-line form — one `GUARD SURFACE:` line per surface, each carrying its own score plus "0 unaccepted survivors" (`reviewRoundFiling`, `reviewRoundCorpus`) or its own `CANNOT-EXPRESS:` probe citation (`scripts/codex-guard.mjs`, §1.1.8's shape probe). The arc's own round-1 diff dispatch is the gate's first live customer.

## §7 Documentation fan-out

- `AGENTS.md` codex-guard bullet list: one bullet stating the round-1 guard-surface brief contract (markers, exit 2), citing this spec.
- `docs/superpowers/specs/2026-07-19-codex-guard.md`: short dated cross-reference section (no restatement — two copies drift): input-guard §7 family gains the guard-surface check, canonical text here.
- `docs/review-rounds/README.md`: §3.4 contract.
- `docs/superpowers/specs/ci/README.md`: index row for this spec.

## §8 Non-goals

- No change to the per-machine review-convergence hook (§1.1.5).
- No inference of guard-surface briefs (§1.1.1) and no per-candidate Mechanizable parsing (§5.3).
- No retroactive filing edits, no backfill of corpus rows.
- No new CLI flags on codex-guard; the declaration is a brief line (a flag was the row's alternative shape — rejected because the brief is the durable artifact committed with the arc, and a flag can contradict the brief it dispatches).
- No policing of filing deletion (§5.6).

## Convergence criterion (for this spec's own reviews)

**Consequence bound:** every dispatch and every filing is either accepted, or rejected with a message naming the missing element — never silently wrong; a conservative under-check that passes an undeclared or grandfathered artifact is a DOCUMENTED LIMIT (§5), not a finding. **Threat-model fence:** accidental authoring omissions by an ordinary contributor writing briefs and filings in this repo; adversarial evasion of either gate files to documented limits. **PROBE DOMAIN:** briefs — the committed brief files under `docs/review-rounds/` dispatch history and this arc's own dispatch briefs; filings — the live corpus `docs/review-rounds/**/*.md` (55 files at authoring, §3.3's dated derivation) plus the meta-test's planted fixtures. **Score:** stated per §6.3 in the round-1 diff brief.
