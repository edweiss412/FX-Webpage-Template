# Plan: round-economy followups (filing promotions + boundary-advisory repair)

**Spec:** `docs/superpowers/specs/ci/2026-08-07-round-economy-followups.md`.
**Branch:** `feat/round-economy-followups` (worktree `../FX-worktrees/round-economy-followups`).
**Implementer:** Opus / Claude Code (no UI surface; routing hard rule not triggered — no `app/`, `components/`, or design-token files in scope).

impeccable-gate: N/A — no UI surface

## Pre-flight notes

- **Meta-test inventory:** this plan EXTENDS `tests/reviewRounds/report.test.ts` only. No
  registry meta-test applies — no Supabase call boundary, no admin mutation, no advisory
  lock, no tile/sentinel surface; the report is read-only tooling
  (`scripts/review-economy.ts` CLI comment: "gates nothing, exit 0 always"). The corpus
  walker `tests/docs/_metaReviewRoundEconomy.test.ts` is untouched and must stay green.
- **Task-contract enrollment: declined.** Task 1 is docs-only prose with no executable
  RED, and enrollment requires a non-empty `red=` per task (`docs/agents/spec-self-review.md`,
  declared-task-contract bullet). TDD steps for the code task are stated inline in Task 2/3.
- **Advisory-lock topology:** N/A — no `pg_advisory*` in scope.
- **Worktree discipline:** all edits in the worktree; main checkout read-only. Commit per
  task, conventional-commits. Corpus rows written by codex-guard during this arc's
  reviews are committed with the arc (`docs/review-rounds/feat/round-economy-followups/`).

## Task 1 — docs/agents promotions (spec §2, AC-W1.1, AC-W1.2)

One commit: `docs(agents): promote review-round filing lessons into the checklists`.

Apply P1–P10 exactly as tabled in spec §2 — target file, integration point (extend vs new
bullet), substance, and the inline source-filing citation are all normative. Constraints:

- Extend-rows (P4, P5, P6, P8, P9, P10) modify ONLY the named bullet; no rewording of
  neighboring rules (AC-W1.1).
- P7 cross-references the same-vector-recurrence and structural-defense-calibration
  bullets without restating them, and does NOT carry site-list derivation (P9 owns it).
- P9 is exactly one sentence added to the `AGENTS.md` "Class-sweep before patching"
  bullet (AC-W1.2).
- No em-dash policy applies to docs (repo docs use them); match each file's existing
  voice and bullet format.
- After drafting, re-read spec §2's "Explicitly not promoted" list and confirm none of
  those four leaked in.

Verification: `git diff --stat` shows exactly `docs/agents/writing-plans.md`,
`docs/agents/spec-self-review.md`, `AGENTS.md`. `pnpm format:check` clean (prettier runs
on staged md via hook).

## Task 2 — RED: twelve advisory cases in `tests/reviewRounds/report.test.ts` (spec §4)

Commit: `test(infra): pin the boundary-advisory exclusion rule (RED)`.

Add the twelve §4 cases to the existing advisory describe-block, reusing the file's
`corpus()` / `jrows()` / `opts` helpers and `BOUNDARY` constant (`report.test.ts:289`).
Each case's comment names the production line that fails it (anti-tautology: concrete
failure mode stated per test). Spec §4 is normative for every fixture and assertion;
implementation notes only:

1. **Split-arc segment exclusion.** Corpus path baseSha and the merge fixture's
   `baseSha` MUST differ (pins the no-arcKey-join requirement); `mergedAt: BOUNDARY`.
   Expect `boundaryAdvisory === null`.
2. **Unexplained row fires — strictly-precedes companion.** Advisory fires with the
   spec §3.4 wording; companion run with the only unexplained row EXACTLY at BOUNDARY
   asserts `boundaryAdvisory === null` (kills the `<= boundary` mutant that would print
   "precedes" about an equal timestamp — spec §4.2).
3. **Post-merge reuse fires — inclusive-cap companion.** Row after the branch's
   pre-adoption merge fires; companion row EXACTLY at that `mergedAt` is excluded
   (null) — kills the `<`-cap mutant both of case 3's original comparisons miss
   (spec §4.3). Time-cap premise stated executably.
4. **Post-adoption merge does not launder** — merge `mergedAt` > BOUNDARY, row predates
   BOUNDARY, advisory fires.
5. **Shallow withholds an advisory that WOULD fire.** Premise pair per spec §4.5: same
   corpus (with a pre-boundary no-merge row) asserted non-null under a non-shallow run
   FIRST, then null under the shallow run, with the refusal note asserted by FULL-LINE
   equality — never a substring `toMatch`, which survives P1's suffix mutant (extend the
   synthesized shallow-clone pattern at `report.test.ts:627` — its current corpus is
   EMPTY, which is exactly the trivial-null the premise pair exists to block).
6. **Chronological, not lexical, earliest.** Use spec §4.6's two offset timestamps
   verbatim; expect the advisory to fire naming the chronologically-earliest row, and
   assert the non-placeable-rows note is ABSENT.
7. **Non-placeable `startedAt` signaled.** `"not-a-date"` + `null` + one placeable
   post-boundary row; expect null advisory AND the `2 row(s) without a placeable
   startedAt` note (spec §3.2 wording).
8. **Accept-set rejection families.** Spec §4.8's four rows verbatim — timezone-less
   `"2026-08-31T23:00:00"`, calendar-invalid `"2026-02-30T00:00:00.000Z"`, out-of-range
   offset `"2026-08-31T12:00:00+24:00"`, over-precise `"2026-08-31T12:00:00.0001Z"` —
   plus one placeable row → null advisory + `4 row(s) without a placeable startedAt`
   note. Pins the full accept-set of spec §3.2 (regex offset bounds, ms cap,
   calendar validity, finite-parse net).
9. **Latest pre-adoption merge caps — selected chronologically.** Spec §4.9's fixture
   VERBATIM: merges `"2026-08-31T20:30:00-02:00"` (chrono 22:30Z, lexically smaller)
   and `"2026-09-01T00:00:00+02:00"` (chrono 22:00Z, lexically larger), row
   `"2026-08-31T22:15:00Z"` → null advisory. BOTH named mutants fire: oldest-only
   selection AND lexical-max selection (which picks the lexically-larger 22:00Z merge
   and strands the 22:15Z row outside the cap).
10. **Pre-adoption classification chronological.** Spec §4.10's offset mergedAt
    verbatim → null advisory; lexical mutant at `mergedAt <= boundary` fires.
11. **Time cap chronological.** Spec §4.11's values verbatim → null advisory; lexical
    mutant at `startedAt <= mergedAt` fires.
12. **Same-branch exclusion, never global.** Spec §4.12: pre-boundary row on branch X
    (no merge); pre-adoption merge on branch Y with `mergedAt >=` the row's time →
    advisory FIRES. Global-time-cap mutant (branch condition dropped) silences it.
    Fixture varies ONLY branch identity against case 3's shape.

Also update the existing advisory test at `tests/reviewRounds/report.test.ts:554` — update its expected string to the spec §3.4 wording
(the one intentional existing-test change; every other existing case stays
byte-identical).

Run `pnpm vitest run tests/reviewRounds/report.test.ts` — cases 1, 3 (inclusive-cap
companion), 5, 6, 7, 8 and the reworded-string assertion MUST fail before Task 3; cases
2/4/9/10/11/12 may pass pre-fix only if the naive implementation happens to satisfy
them — verify each against the named mutant during Task 3's mutant pass (they pin
preserved/derived behavior; that is their premise, not a tautology — state it in the
comment).

## Task 3 — GREEN: exclusion rule + wording + shallow withhold in `scripts/review-economy.ts` (spec §3)

Commit: `fix(infra): boundary advisory excludes the adoption arc's own pre-merge rows`.

In `buildReport`:

- **Parse once, compare chronologically at every site — through ONE helper (spec
  §3.1).** Replace the lexical `.sort()[0]` selection. STRUCTURAL REQUIREMENT, not just
  behavioral: implement a single parse-and-compare helper and route ALL timestamp
  comparisons through it — earliest selection, boundary check,
  `mergedAt <= boundary` classification, `startedAt <= mergedAt` cap, AND the
  latest-merge max selection. NO direct string comparison of timestamps anywhere in the
  advisory block (spec §3.1: "a later-added site cannot be lexical by default").
  Separate ad-hoc `Date.parse` calls at each site satisfy the test cases but violate
  the spec.
- **Accept-set placement (spec §3.2).** A `startedAt` is placeable iff (a) it matches
  the §3.2 structural regex VERBATIM (explicit offset, bounded offset range, fractional
  seconds capped at 3 digits), (b) its date/time fields are calendar-valid, (c) its
  `Date.parse` is finite. Implement as a small pure helper beside the advisory block;
  rows outside the accept-set are excluded and counted in a note whenever any exist:
  `N row(s) without a placeable startedAt are invisible to the boundary advisory.`
- Build the exclusion set from `merges.recognized` where
  `Date.parse(mergedAt) <= Date.parse(boundary)`: map `branch -> max(mergedAt)` (max, so
  several pre-adoption merges of one branch use the latest — spec §3.3).
- `earliest` = chronological min over non-excluded, parseable rows (branch + time rule,
  spec §3.3).
- New advisory string per spec §3.4 VERBATIM (observation + open causes, no verdict,
  no claim that the arc lacks a pre-adoption merge — case 3 reaches this line with one).
- When `merges.shallow`: `boundaryAdvisory = null`; extend the existing shallow note with
  "; the boundary advisory is withheld for the same reason" (spec §3.5).
- `boundary === null` path unchanged.

`pnpm vitest run tests/reviewRounds/report.test.ts` fully green.

**Post-green mutants (spec §4 closing paragraph; P1 applied to this branch's own work —
record each result, mutant → failing case, in the commit message):**

String-presence families — ALL FOUR of P1's (a)-(d), applied to EVERY string this
feature emits: the advisory line, the non-placeable-rows note, AND the shallow-refusal
note extension (spec §4 closing paragraph):

- (a) empty value: each of the three strings emptied in turn;
- (b) content + suffix: each of the three strings with an appended suffix (case 5's
  full-line equality is what kills the shallow-note suffix mutant);
- (c) present but not live: each string emitted into a different report section (or
  behind a false condition) so it exists but not where asserted;
- (d) discriminating parameter: the note's count `N` hardcoded vs derived; the
  advisory's interpolated row timestamp swapped for another row's; the shallow note
  emitted without its advisory-withholding clause.

Logic mutants — one per spec-pinned decision, deferred here from Task 2:

- exclusion keyed on `arcKey(branch, baseSha)` instead of branch + time → case 1 fails;
- branch condition dropped (global time cap) → case 12 fails;
- oldest-only merge selection → case 9 fails;
- lexical-max merge selection → case 9 fails;
- lexical `mergedAt <= boundary` classification → case 10 fails;
- lexical `startedAt <= mergedAt` cap → case 11 fails;
- lexical earliest selection → case 6 fails;
- advisory condition `< boundary` widened to `<=` → case 2's at-boundary companion
  fails;
- time cap `<=` narrowed to `<` → case 3's at-mergedAt companion fails;
- `<=` at the pre-adoption boundary carve-out flipped to `<` → the existing
  equals-boundary test discriminates;
- bare-`Date.parse` placement (accept-set bypass) → cases 7 and 8 fail.

If any mutant survives, strengthen the test in the same commit before proceeding.

## Task 4 — 2026-08-04 spec amendment + live verification (spec §3 amendment ¶, AC-W2.13)

Commit: `docs(spec): amend review-round-economy §9/§11.3 for the advisory exclusion rule`.

- Amend the §9 advisory paragraph (ends "cannot be checked against anything") with the
  exclusion rule + the §3.4 reworded advisory line, dated note `(Amended 2026-08-07 —
  see 2026-08-07-round-economy-followups.md)`, matching the spec's amendment style.
- Extend §11.3 item 8 — the "Adoption boundary" test entry, NOT §10 item 8, which is
  unrelated mutation-enrollment work — with the twelve new case shapes (one line each).
- Live check: run `pnpm review:economy` at the pre-change commit and at HEAD, diff the
  outputs — identical except the ADVISORY line is gone (AC-W2.13). Paste both
  invocations' tail into the commit message or the PR body.
- `pnpm spec:lint` on the amended 2026-08-04 spec: no new hard findings.

## Task 5 — gates, review, ship

- Full pre-push gates in the worktree: `pnpm test`, typecheck (vitest AND playwright
  configs), `pnpm eslint`, `pnpm format:check`. `tests/docs/_metaReviewRoundEconomy.test.ts`
  green (corpus untouched by hand; new rows only from this arc's own dispatches).
- Whole-diff cross-model review via codex-guard (`--stage diff`, fresh out-dir per
  round, worktree frozen during each dispatch, brief carries the spec §7 bounds +
  REVIEWER ONLY + VERDICT/FINDINGS contract). **AC-X.1 lives here:** every review
  dispatch (diff rounds included) attaches `pnpm spec:lint` output for BOTH
  `docs/superpowers/specs/ci/2026-08-07-round-economy-followups.md` AND this plan —
  via `codex-guard --lint-doc` or a pasted transcript in the brief, findings never
  abridged silently. Class-sweep every finding before repair; structural defense in
  the FIRST repair commit where the class is nameable.
- Commit this arc's corpus rows + any owed filing under
  `docs/review-rounds/feat/round-economy-followups/`.
- Push → PR (body: spec link, AC checklist, the before/after report diff, docs-only
  preflight N/A note is NOT applicable — this branch ran full preflight) → real CI
  green → `gh pr merge --merge` → fast-forward main checkout, verify
  `git rev-list --left-right --count main...origin/main` = `0  0` → clear pane/agent
  labels.
