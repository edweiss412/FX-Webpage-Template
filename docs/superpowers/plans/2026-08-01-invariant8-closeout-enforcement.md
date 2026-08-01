# Plan: invariant-8 closeout enforcement

**Spec:** `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md` (canonical; APPROVED r3; this plan implements it, TDD per task, one commit per task). **Branch:** `test/invariant8-closeout-enforcement`. **Charter:** `BL-INVARIANT8-CLOSEOUT-ENFORCEMENT`.

impeccable-gate: N/A — no UI surface

(The marker above is live, not illustrative: this plan document names both gate halves in the meta-test inventory below, which makes its unit a declaring unit under spec §3.2 the moment the guard lands — the guard polices its own shipping plan, the spec §5 live-clean criterion.)

## Meta-test inventory (mandatory declaration)

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->

This milestone CREATES one structural meta-test: `tests/docs/_metaInvariant8Closeout.test.ts` (default-deny walk of `docs/superpowers/plans/` for invariant-8 — impeccable critique + impeccable audit — closeout markers). It EXTENDS none of the standing registries (infra-contract, sentinel-hiding, admin-alert catalog, advisory-lock topology, no-inline-email-normalization): no auth, DB, alert, or tile surface is touched. The ONE edit to `tests/docs/_metaDeferralLedgerGraduation.test.ts` is the graduation registry row (T4).

## Mutation-family closure set (round-economy rule; the review converges against THIS enumeration)

Spec §5 M1–M8, verbatim authority. Summary: M1 discovery narrowing (incl. closeout-attach both directions) — tmpdir fixture-tree plants + canaries; M2 predicate narrowing (incl. fold drop) — 4 plants; M3 grammar widening — reject-table plants incl. P-HEDGE, leading-zero, indented, TEMPLATE-outside; M4 ledger staleness — 3 plants; M5 ledger bypass — 1 plant; M6 undated leak — 1 plant; M7 malformed-marker tolerance — 2 plants; M8 template-file leak — 3 plants. A reviewer-proposed NEW family is admissible only with a live escaping mutant (AGENTS.md finding-admissibility (c)).

## Plan-time facts (verified, commands run 2026-08-01)

- Census probe (committed spec sibling): 301 units, 195 declaring (117 flat, 78 dir), 8 closeout-attached files, aggregates 19/17, four canaries OK, fold comparison 195/0.
- Grammar probe (committed spec sibling): 17-case accept/reject table, exit 0.
<!-- spec-lint: ignore — files created by this plan; not yet tracked -->
- `vitest.projects.ts:126` globs `tests/docs/**/*.test.{ts,tsx}` — the new test file is collected by the existing project; the helper (`_invariant8Closeout.ts`) and registry (`invariant8/preGuardDebt.ts`) are non-test files, not collected.
- `pnpm spec:lint` on the spec: 0 hard, 6 advisory.
- Canary paths exist (probe-verified): `docs/superpowers/plans/2026-07-18-alert-copy-full-sweep.md`, `docs/superpowers/plans/admin/2026-06-22-validation-reset-button.md`, `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation`, `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1` (guard keys are plans-relative).
- HANDOFF-TEMPLATE.md §12 heading reads `## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)` with the backend-only N/A branch in its second paragraph (T3 edit site).

## Tasks (TDD; conventional commit per task)

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->

### T1 `test(docs): invariant-8 closeout walker helper`

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->
RED: new `tests/docs/_invariant8Closeout.walker.test.ts` exercising, on in-memory maps AND tmpdir fixture trees (`fs.mkdtempSync`), the full helper surface from spec §4: `walkPlansTree` (fs acquisition; novel-unit visibility), `partitionUnits` (every §3.1 shape: flat, nested dated dir, category subdir, no-sub-unit nesting, closeout-attach + the three non-attach controls), `declaresGate` (unit-wide fold incl. split-across-files), `parseMarkers` (the grammar probe's 17-case table ported verbatim, incl. cross-check, trimmed-line classification, TEMPLATE-form file gating), `unitVerdict` (strictness rule). GREEN: implement `tests/docs/_invariant8Closeout.ts` — port the committed probe partition and grammar-probe verdict logic. Failure mode caught per assertion: a walker that reads only top-level `plan.md` dirs (the `a20b94457` defect) fails the shape plants; a grammar that accepts "critique not run" fails the reject table.

### T2 `test(docs): live guard + plants + frozen debt ledger`

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->
RED: new `tests/docs/_metaInvariant8Closeout.test.ts` with the five §4.1 live assertions plus the M1–M8 plant corpus (each plant names its family in a comment) — RED because `tests/docs/invariant8/preGuardDebt.ts` does not exist yet, so ~195 declaring units fail assertion 1 (the fail-by-default direction, demonstrated in the commit body). GREEN: generate the ledger from the census probe's declaring-unit list AT THIS COMMIT (not the spec's draft snapshot; regenerate again at any merge-conflict resolution), plus `UNDATED_DECLARING_ALLOWLIST` (one row: `BACKLOG.md`) and `MARKER_TEMPLATE_FILES` (one row: HANDOFF-TEMPLATE.md path). Mutation evidence recorded in the commit body: per family M1–M8, comment out the corresponding mechanism (attach rule, fold, grammar branch, staleness branch, registry consult, allowlist check, strictness loop, template gating) and record the failing plant count; restore and record green.

### T3 `docs: write-path — AGENTS.md sentence + HANDOFF-TEMPLATE §12 marker`

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->
ONE commit (spec §6): AGENTS.md invariant 8 gains the marker-line sentence naming `tests/docs/_metaInvariant8Closeout.test.ts`; HANDOFF-TEMPLATE.md §12 gains the TEMPLATE-form placeholder line plus the backend-only branch sentence quoting the N/A form inline in backticks (mid-line). Guard must stay green after the edit (assertion §4.1.6 proves the template file carries the TEMPLATE form and no valid marker — run in the same commit).

### T4 `docs: graduate BL-INVARIANT8-CLOSEOUT-ENFORCEMENT`

TDD RED edge (T5 pattern of PR #646): add the `BACKLOG_GRADUATED` registry row FIRST — the mdast guard reds (id present in `BACKLOG.md`, absent from archive). GREEN: move the entry to `BACKLOG-archive.md` with provenance `test/invariant8-closeout-enforcement`, layering the reconciliation note. Reference sweep RUN at plan time, exact command `rg -n "BL-INVARIANT8-CLOSEOUT-ENFORCEMENT" --no-heading | cut -d: -f1,2` — TEN hits, per-hit dispositions:

- root `BACKLOG.md` line 691 — the entry heading: MOVES to archive (the RED/GREEN above).
- `tests/docs/_metaDeferralLedgerGraduation.test.ts:31` — guard header comment saying the assertion is "filed as BL-INVARIANT8-CLOSEOUT-ENFORCEMENT in BACKLOG.md": UPDATE in this commit — after graduation the id lives in the archive and the assertion lives in the new guard test (T2); the comment gains that pointer (this is prose in a comment, NOT a second registry edit).
- `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/closeout.md:140` — the descope's historical record: KEEP verbatim.
- design spec lines 1 and 5, both probe siblings, and this plan's three self-references — this arc's own artifacts naming their charter: KEEP ALL (provenance; graduation never purges historical references).

### T5 Close-out

Full `pnpm test`; `tsc` both configs; eslint; `format:check`. Whole-diff cross-model review (fresh-eyes brief; the new guard + helper + ledger + doc edits are one tight scope). Push; real CI green; `gh pr merge --merge`; ff-sync main to `0  0`; delete nothing else (no snapshot branch this arc); CronDelete nudge + clear pane + marker stage done.

## Snippet typecheck note

Task bodies carry no pasted TS snippets (shapes are named, not inlined) — T1/T2 test bodies are authored in-branch under the repo's strict tsconfig at implementation time.

## e2e/CI wiring

No new workflow, no e2e spec, no testMatch change: both new test files match the existing `tests/docs/**/*.test.{ts,tsx}` project row (`vitest.projects.ts:126`); helper + registry are non-test files. Verified at T1 by running the suite scoped to `tests/docs/`.
