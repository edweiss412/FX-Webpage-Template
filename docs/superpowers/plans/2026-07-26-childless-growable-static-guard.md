# Plan: childless-growable static guard

<!-- spec-lint: ignore — bare BACKLOG.md means the repo-root file; docs/superpowers/plans/BACKLOG.md shadows the basename -->
**Spec (canonical, APPROVE at review round 8, 2026-07-26):** `docs/superpowers/specs/2026-07-26-childless-growable-static-guard-design.md`. Every predicate, probe, and residual in this plan is DEFINED there; this plan does not restate them, because a second copy of a 26-findings-hardened rule set is a drift surface. Where a task says "per §N," the spec section is the single source of truth. **Branch:** `feat/childless-growable-static-guard` (worktree `../FX-worktrees/childless-growable-guard`, env linked, preflight green).

## Pre-draft verification (writing-plans mandate)

- Every `file:line` this plan relies on was verified during the spec's 8 adversarial rounds, including two independent Codex census reproductions at base `396416778` (47+19+7+4+2=79). No new claims are introduced here.
- **Reconciliation sweeps, run at plan time (2026-07-26), outputs inline:**
  - `grep -rn "childless-growable-ok" --include="*.ts*" --include="*.mdx" .` (node_modules excluded) → **0 hits** — the exemption marker is unclaimed.
  - `ls tests/styles/` → 13 entries, no `_childlessGrowable*` collision; template pair `_newTabScan.ts` + `_metaNewTabAnnouncement.test.ts` present.
  - `sed -n 73p vitest.projects.ts` → `"tests/styles/**/*.test.{ts,tsx}",` — the new meta test is picked up by the existing PARALLEL_TEST_GLOBS entry; **no CI wiring changes**, no workflow path-filter edits needed (tests run in the unit suite).
<!-- spec-lint: ignore — deliverable file, created by this plan's tasks -->
- **Meta-test inventory (mandatory declaration):** this work CREATES one structural meta-test, `tests/styles/_metaChildlessGrowable.test.ts` (filesystem-walked, fail-by-default on new surfaces), with two in-scanner registries (`APPROVED_GROWABLE_COMPONENTS`, `PAINT_TOKENS`). It EXTENDS none of the existing registries (`_metaInfraContract`, `_metaSentinelHidingContract`, `_metaAdminAlertCatalog`, `advisoryLockRpcDeadlock`, mutation-surface observability) — none applies: no Supabase calls, no advisory locks, no admin alerts, no mutation surfaces, no tiles.
- **N/A declarations:** no advisory-lock surfaces (no `pg_advisory*` touched); no e2e/Playwright attach; no fixed-dimension parents (tests-only diff → no layout-dimensions task); no Transition Inventory (no UI); no migrations; no §12.4 codes. Snippet typecheck: this plan embeds no implementation snippets — the spec's §6.4 probe list is the contract, and each task's first commit is the failing test that realizes it (TDD makes the typecheck gate the test run itself).

## Anti-tautology (per task, concrete failure mode)

Spec §6.4 closes with the anti-tautology contract: every reject probe asserts the reason discriminant AND location; every accept probe runs against a source that also contains a known violation (an accidentally-empty scan cannot pass); the named failure modes are scanner edits that silently narrow harvesting (join-array probe), widen paint (`bg-cover` probe), or break exemption ownership (consumed-by-compliant probe). Tasks below inherit this contract; a task is not done while any of its probes proves only "the function was called."

## Tasks (TDD each: failing test → minimal implementation → green → commit)

### Task 1 — token predicates: `test(styles): childless-growable token predicates`

<!-- spec-lint: ignore — deliverable files, created by this task -->
Failing test first: predicate-level probes in `tests/styles/_metaChildlessGrowable.test.ts` importing `growableFromToken` / `extentFromToken` / paint-set membership from `tests/styles/_childlessGrowableScan.ts` (file created this task). Cover exactly the §6.4 lines: growable, not-growable (incl. negatives on every class surface), growable-fail-closed/shorthand (`[flex-grow:junk]`, `flex-0/1`), variant/important interaction (incl. `sm:!flex-1`, `[&>*]:!grow-2`), extent accept/reject per prefix family and boundary category. Implement normalization (§3.1 order: variants first, then one important marker; bracket/paren-aware) and the three predicates. Failure mode caught: a future edit that reorders normalization (the `sm:!flex-1` probe dies) or reopens the `flex-[0px]` basis hole.

### Task 2 — scanSource core: `test(styles): childless-growable candidate classification`

Failing probes: harvesting forms (incl. join-receiver, split-token accepted-limits, invisible-kind accepted-limits), childless/childed forms (incl. the three line-terminator variants), style resolution (every §3.1 style bullet incl. wrapper transparency and the discriminating non-null probe), component registry + `opts.registry` dotted-name probe + `opts.paintTokens`, reason precedence (all three discriminants + mixed-grow cases), spread pair, union-synthesis accepted-limits + the negator-in-union reject. Implement `scanSource(source, fileName, opts?)` per §5: TS AST parse, harvest, children classification, candidate classification, violation records with positions/tag/source-label. Failure mode caught: harvest narrowing (the v1 join miss), precedence drift, registry bypass via visible paint on components.

### Task 3 — exemptions + MDX: `test(styles): childless-growable exemptions and MDX`

Failing probes: the §6.4 exemption line (template-verbatim claiming semantics incl. consumed-by-compliant = silent, same-line/preceding-line adjacency, jsdoc decoration, string-literal marker, unused failure) and the MDX line (compiled violation with approximate-position label, painted accept, exemption NOT honored). Implement: exemption scan reusing the template mechanics (`tests/styles/_newTabScan.ts:49`, `~2835`, `2854`–`2910` — extract-or-mirror decision made in code review against the template, LINE_TERMINATORS reused per §5), MDX `compileSync` path. Failure mode caught: exemption ownership drift; an MDX pipeline change that silently starts honoring (or mis-binding) comments.

### Task 4 — live gates: `test(styles): childless-growable live-tree and hygiene gates`

Failing test: `walkLiveTree()` over `components/` + `app/` (`.tsx` + `.mdx`) asserting zero violations with the §6.1 diagnostic message; zero unused exemptions; registry/paint-set OCCURRENCE liveness per §6.3 (each of the 4 paint tokens and 2 registry rows maps to its live site). Implement the walker + gates. **Negative-regression verification (spec §8.4), performed once and recorded in the PR body:** temporarily restore the deleted `<span className="flex-1" />` pusher shape at one of the five PR #605 sites, observe the live gate fail with the correct diagnostic, revert. Failure mode caught: a walker that silently skips directories or extensions (fail-by-default property is the whole point).

### Task 5 — backlog graduation: `docs: graduate BL-CHILDLESS-GROWABLE-STATIC-GUARD`

<!-- spec-lint: ignore — bare BACKLOG.md means the repo-root file -->
Move the `BACKLOG.md:169` entry to the archive section per repo convention, pointing at the spec and the landed guard files. No code.

## Close-out (order fixed)

1. Full local gates (pre-push memories): `pnpm test` (full suite, not scoped), `pnpm typecheck` (vitest AND playwright configs), `pnpm lint`, `pnpm format:check`.
2. Whole-diff Codex cross-model review to APPROVE (fresh-eyes posture; brief inlines the do-not-relitigate list from spec §1.1 and the reviewer-never-fixes rule).
3. Push → PR → real CI green (all twelve required contexts REPORTED, not merely absent) → `gh pr merge --merge` in the same turn.
4. Fast-forward main checkout; verify `git rev-list --left-right --count main...origin/main` == `0  0`; marker stage `done`; `CronDelete` the nudge job.

## Adversarial review (cross-model) — mandatory before execution

This plan goes to Codex via codex-guard after self-review; iterate to APPROVE before Task 1 begins.
