# Plan — round-economy enforcement pair

**Spec:** `docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md` (canonical; this plan implements it and restates nothing normative). **Branch:** `chore/round-economy-enforcement-pair`. **Ledger rows:** `BL-CODEX-GUARD-ENROLMENT-PRECEDES-DISPATCH`, `BL-FILING-MECHANIZABLE-LEDGER-PARITY`.

## Acceptance criteria

- **AC-A1** — round-1 `--stage diff` dispatch whose brief (fence-stripped) carries a bare line-anchored `GUARD SURFACE:` line (no arm in its remainder) exits 2 with a message naming both arms and enumerating every nonconforming line.
- **AC-A2** — a `GUARD SURFACE:` line whose remainder carries the canonical anchored score declaration (spec §2.1 single regex: literal `MUTATION SCORE:` marker, adjacent `<killed>/<total>` with `total >= 1`, `killed <= total`, adjacent zero-unaccepted-survivors phrase) passes validation and the dispatch proceeds.
- **AC-A3** — a `GUARD SURFACE:` line whose remainder carries the cannot-express arm (`CANNOT-EXPRESS:` with non-empty tail) passes validation.
- **AC-A4** — round ≥ 2 and stages `spec`/`plan`/`task` are exempt: the same bare-declared brief dispatches.
- **AC-A5** — markers inside a fenced code block neither trigger (`GUARD SURFACE:`) nor satisfy (a fenced conforming disposition does not cover a live bare line).
- **AC-A6** — per-line individually (spec §2.1, R1 findings 1–2 + R3/R4 findings): a MIXED brief (one conforming cannot-express line + one bare line) exits 2 naming the bare line; a score arm declaring a NON-empty unaccepted-survivor set (`1 unaccepted survivor`), lacking the marker-adjacent fraction (`unrelated_fraction`), or carrying a semantically invalid fraction (`0/0`, `2/1`) exits 2; a canonical below-floor declaration (`0/1, 0 unaccepted survivors`) passes and reaches the fake codex (§5.8 limit pinned in the accepting direction).
- **AC-B1** — `parseFiling` exposes per-section `mechanizable: { isNone, hasDecline, citedIds } | null`, block-scoped per spec §3.1.
- **AC-B2** — `checkCorpus` reports `mechanizable_untracked` for a non-grandfathered filing section whose Mechanizable entry is non-none, cites no `BL-`/`DEF-` id inside the block, and has no `declined:` marker.
- **AC-B3** — a block-scoped id or a `declined: <reason>` satisfies the duty; an id appearing only OUTSIDE the Mechanizable block (e.g. in Judgment) does not.
- **AC-B4** — `**Mechanizable:** none` and `**Mechanizable:** none — <prose>` carry no duty.
- **AC-B7** — a non-grandfathered section holding two canonical `**Mechanizable:**` markers reports `filing_malformed` in both orderings (spec §3.1, R6 finding).
- **AC-B8** — a non-grandfathered filing whose only disposition or Examined lines live in non-rendered content (fence, indented block, HTML) reports `filing_malformed` naming the raw-scan-only field (spec §3.1, R9 finding 1); grandfathered filings keep shipped raw semantics.
- **AC-B9** — every AST-derived `mechanizable.citedIds` value resolves against the resolvable set; a decoded-representation nonexistent id (backslash escape or character reference, either prefix) reports `unresolved_id` (spec §3.2, R10 finding).
- **AC-B10** — a list-nested AST-visible `Mechanizable:` field on a non-grandfathered filing reports `filing_malformed`, all five CommonMark list-marker forms pinned (spec §3.1, R12 finding).
- **AC-B5** — a filing whose path is in `MECHANIZABLE_GRANDFATHERED` is exempt; the live corpus check stays green.
- **AC-B6** — `lib/reviewRounds/filing.ts` is enrolled in `tests/mutation/source/registry.ts` and `pnpm mutation:guards` is green with any accepted rows dispositioned.
- **AC-C1** — the six §4 candidates are dispositioned: five `BL-` rows filed at the ledger bar, one decline recorded (candidate 2, covered by the spec-registration detector).
- **AC-D1** — docs fan-out landed: AGENTS.md bullet, codex-guard spec cross-reference, `docs/review-rounds/README.md` contract. (The ci specs README row landed with the spec commit.)

## Meta-test inventory (mandatory declaration)

- **EXTENDS:** `tests/docs/_metaReviewRoundEconomy.test.ts` (new problem-kind fixtures), `tests/reviewRounds/filing.test.ts` (parse contract), `tests/mutation/source/registry.ts` (new `reviewRoundFiling` row), `tests/mutation/_metaPremiseContract.test.ts` (`EXPECTED_ENV_TOUCHING` row for the newly enrolled suite; update the meta-test's own row counts in the same commit if the new fixture cases shift its declared number).
<!-- spec-lint: ignore — file created by this plan's implementation; not yet tracked -->
- **CREATES:** `tests/codexGuard/guardSurfaceGate.test.ts`.
- Candidate registries from the writing-plans list (Supabase call boundaries, sentinel hiding, admin-alert catalog, advisory-lock topology, no-inline-email-normalization): **none applies** — the diff touches no auth, DB write, alert, or tile surface.
- Advisory-lock topology: **N/A** — no `pg_advisory*` surface. e2e harness-readiness: **N/A** — no Playwright.

## Mutation-family closure (guard work)

The closure set the review converges against, per the registry's declared operator set (`tests/mutation/source/operators.ts:17`): `relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal` — applied to `lib/reviewRounds/filing.ts` (new enrolment) and already applied to `lib/reviewRounds/corpus.ts` (existing `reviewRoundCorpus` row, scoreFloor 1). A reviewer-proposed NEW family is admissible only with a live escaping mutant against the shipped guard. For the codex-guard test's message assertions, the four string-presence mutants (writing-plans anti-tautology bullet) are run pre-dispatch and recorded in the task commit: (a) message emptied, (b) message + suffix, (c) marker present in brief but fenced (not live), (d) each discriminating parameter varied (stage, round, arm content).

<!-- tasks: depth=2 -->

## Task 1: Half B parse contract — `parseFiling` Mechanizable block

<!-- task: red=`pnpm exec vitest run tests/reviewRounds/filing.test.ts` ac=AC-B1,AC-B3,AC-B4 -->

**What is red and why:** the new cases assert `section.mechanizable.isNone` / `.hasDecline` / `.citedIds`; `FilingSection` (`lib/reviewRounds/filing.ts:1`) has no `mechanizable` field, so the property reads are `undefined` and every new assertion fails against the live tree.

- RED: extend `tests/reviewRounds/filing.test.ts` with cases for: block extent (ids in Judgment text do not land in `mechanizable.citedIds`; ids in a trailing NONCANONICAL bold-run field such as `**Carry-forward:**` do not either — spec R5 finding 2); `isNone` on `none`, `none.`, `none — prose`; NOT-none on any other value; `hasDecline` on the marker line (`**Mechanizable:** declined: reason`, R7) and on block list items in ALL CommonMark marker forms (`-`, `*`, `+`, `1.`, `1)` — R8 finding 2), and `hasDecline: false` on the R5 probe pair (`not declined: …`; a prose mention of `declined: <reason>`); the R8 finding-1 matrix (markers, declines, ids, and field-closers inside fenced code, indented code, and HTML comments are invisible to all five decisions); strikethrough retraction cases (R11: `~~none~~`, `~~declined: …~~` marker-line and block-item, `~~BL-REAL~~` — none satisfies its decision); `markerCount` counts real markers only; block closes at any `heading` node (R9 finding 2 leak pair: id and declined under a following `### Judgment` heading do not satisfy the block); `astDispositions`/`astExamined` expose AST-visible fields (R9 finding 1); `mechanizable === null` when the marker is absent (including the colon-less `**Mechanizable** —` spelling, spec §3.1/§5.5).
- GREEN: implement per spec §3.1 — the Mechanizable analysis derived from the section body's remark+remark-gfm AST (`tests/docs/_ledgerMdast.ts` is the walker precedent; the lib implementation imports remark directly, never the test helper): marker = top-level paragraph opening with strong text `Mechanizable:`; block = siblings up to the next field paragraph (strong text ending in a colon) or any heading node; `isNone` = marker remainder `/^none\b/i`; `hasDecline` = marker remainder or a paragraph/listItem first-text beginning `declined:` with a reason; `citedIds` = `CITED_ID` over block text+inlineCode nodes; `code`/`html` nodes and `delete` (strikethrough) descendants invisible throughout (R11: struck text is retraction, the `_ledgerMdast` claim-mode precedent).
- Anti-tautology: expected ids derive from the fixture's own literals; the Judgment-vs-block case plants the SAME id string in both regions and asserts it appears once (block case) / zero times (Judgment-only case) — the fixture varies the discriminating field (placement), not just presence.

## Task 2: Half B corpus gate — `mechanizable_untracked` + grandfather set

<!-- task: red=`pnpm exec vitest run tests/docs/_metaReviewRoundEconomy.test.ts` ac=AC-B2,AC-B3,AC-B4,AC-B5,AC-B7,AC-B8,AC-B9,AC-B10 -->

**What is red and why:** the new fixture case (non-none Mechanizable, no id, no decline, non-grandfathered path) asserts `problems` contains kind `mechanizable_untracked`; `checkCorpus` (`lib/reviewRounds/corpus.ts:171`) has no such kind, so the assertion fails.

<!-- spec-lint: ignore — file created by this plan's implementation; not yet tracked -->
- RED: extend the meta-test with fixture cases (existing `check(files)` helper, meta-test `check` at line ~97): fail case; block-id pass; outside-block id still fails; `declined:` pass; `none` pass; grandfathered pass — plant a filing at a REAL grandfathered path (`refactor/classname-array-join-cn/61281c23e8ce`) with violating content and assert clean, with a `premiseHolds` (from `tests/_shared/premise.ts`) immediately above asserting `MECHANIZABLE_GRANDFATHERED.has("docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md")` — the exemption case discriminates only while the frozen set actually contains the planted path.
<!-- spec-lint: ignore — file created by this plan's implementation; not yet tracked -->
- GREEN: add `lib/reviewRounds/mechanizableGrandfather.ts` (frozen 56-path set generated from the live corpus, header contract per spec §3.3) and the `mechanizable_untracked` check in `checkCorpus` per spec §3.2. The live-corpus case (meta-test line ~649) must stay green with zero content edits to any existing filing.
- Sweep: after GREEN, run the FULL meta-test file plus `tests/reviewRounds/filing.test.ts` (fix-round regression budget).

## Task 3: Half A — codex-guard guard-surface gate

<!-- task: red=`pnpm exec vitest run tests/codexGuard/guardSurfaceGate.test.ts` ac=AC-A1,AC-A2,AC-A3,AC-A4,AC-A5,AC-A6 -->

**What is red and why:** the new suite's exit-2 case writes a brief containing only `GUARD SURFACE: x` and dispatches `--stage diff --round 1` via the spawn harness (`runGuard`, `tests/codexGuard/harness.ts:177`); `scripts/codex-guard.mjs` has no guard-surface validation, so the dispatch proceeds against the fake codex and exits 0 — the `expect(res.code).toBe(2)` assertion fails.

<!-- spec-lint: ignore — file created by this plan's implementation; not yet tracked -->
- RED: author `tests/codexGuard/guardSurfaceGate.test.ts` on the existing harness (`mkRun` writes `run.briefPath`; the test overwrites it per case, then `runGuard(run, ["--stage", "diff", "--round", "1"])`): one case per AC-A1..A6 including the spec §6.1 probe-pair fixtures (`mixed_missing_score`, `two_enrolled_one_score`, `nonempty_survivor_set`), asserting exit code and (for AC-A1/A6) that stderr enumerates every nonconforming `GUARD SURFACE:` line. Passing cases assert the dispatch reached the fake codex (`readCalls(run)` non-empty) rather than merely exit 0.
- GREEN: insert the check in `scripts/codex-guard.mjs` config validation, after `cfg.briefText` is read (the `--brief is empty` guard at line 176) — spec §2.1 algorithm, reusing `stripCodeBlocks` (line 537).
- Pre-dispatch string-presence mutants on the exit-2 message per the closure section above; results recorded in the task commit message.

<!-- tasks: end -->

## Task 4 (procedural — no TDD marker): enrol `filing.ts` in the source-mutation registry

Add the `reviewRoundFiling` row (`sourcePath: "lib/reviewRounds/filing.ts"`, `suitePaths: ["tests/reviewRounds/filing.test.ts", "tests/docs/_metaReviewRoundEconomy.test.ts"]`, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 1`, a `control` mutant flipping the Mechanizable block's `isNone` regex bound or the decline test) + `EXPECTED_ENV_TOUCHING["tests/reviewRounds/filing.test.ts"] = 0` in `tests/mutation/_metaPremiseContract.test.ts`. Run `python3 scripts/with-heavy-slot.py -- pnpm mutation:guards`; disposition every survivor (kill by strengthening the suite, or an `accepted` row with `kind` + reason per the registry's existing rows). Gate green = AC-B6. Score + unaccepted-survivor set go verbatim into the round-1 diff review brief (spec §6.3).

## Task 5 (procedural): backfill dispositions

Five `BL-` rows in `BACKLOG.md`, each at the ledger filing bar with `**Reachability:**` citing the originating filing (probe evidence already recorded there): candidates 1, 3, 4, 5, 6 of spec §4. Candidate 2 is DECLINED — probe (this arc, 2026-08-15): `tests/ci/_metaSpecRegistration.test.ts` "spec registration detector (spec §3.1)" already asserts every test-shaped file under `tests/e2e` is resolved by some config or dark-allowlisted with a backlog ref, which is the filing candidate's exact ask; the decline is recorded in the plan closeout and in the graduation note when `BL-FILING-MECHANIZABLE-LEDGER-PARITY` archives. Run `pnpm ledger:mass` / the ledger meta-tests (`pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaReviewRoundEconomy.test.ts`) to confirm the new rows parse and resolve.

## Task 6 (procedural): docs fan-out

- AGENTS.md codex-guard dispatch-guard bullet list: one bullet for the guard-surface brief contract, citing the spec.
- `docs/superpowers/specs/2026-07-19-codex-guard.md`: dated cross-reference section (§14) pointing at the pair spec — no restatement.
- `docs/review-rounds/README.md`: the §3.4 author contract (non-none Mechanizable cites its row or declines as `declined: <reason>`; filings authored after 2026-08-15).
- Run `pnpm spec:lint` over both edited specs; the AGENTS.md heavy-phase/prose guards (`pnpm exec vitest run tests/docs/agentsHeavyPhaseRule.test.ts tests/docs/_metaInvariant8Closeout.test.ts`) confirm nothing structural broke; add the plan-unit `closeout.md` with `impeccable-gate: N/A — no UI surface`.

## Task 7 (procedural): gates + ship

Full local gates under the heavy wrapper (`python3 scripts/with-heavy-slot.py -- pnpm test:fast`, then `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check` unwrapped), whole-diff codex review to APPROVE (round-1 diff brief carries the §6.3 `GUARD SURFACE:`/`MUTATION SCORE:`/`CANNOT-EXPRESS:` block — the arc dogfoods its own gate), Stage 4.4 ledger-marker removal in the PR's last commit, push, real CI green, `gh pr merge --merge`, fast-forward main to `0  0`, clear pane/agent labels, `CronDelete` the nudge.
