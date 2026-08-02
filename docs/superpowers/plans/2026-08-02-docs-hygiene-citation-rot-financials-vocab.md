# Plan — docs hygiene: retired-workflow citation rot + master-spec financials vocabulary

**Spec:** `docs/superpowers/specs/2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md` (canonical; this plan implements it and does not override it).
**Branch:** `docs/citation-rot-financials-vocab` (worktree off origin/main at 2509f1452).
**Preflight:** skipped — docs + one test-registry file; no env, no DB, no app code. Declared in the PR body.

impeccable-gate: N/A — no UI surface

## Meta-test inventory

None created or extended, with one convention-mandated exception: two `{ id, provenance }` rows appended to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (the graduation ledger's own registry — required by the existing guard, not a new guard). No other registry applies: no Supabase calls, no locks, no alerts, no tiles, no e2e.

## TDD framing (docs tasks)

Each task's red state is a measured failing check (a lint count, a grep hit-set, a stale literal), captured before the edit; green is the same command's pinned expected output after. The checks are the spec's §2.3 / §3.3 acceptance items.

---

## Task 1 — strip dangling workflow citations (spec §2)

**Red (measured at merge-base):** `pnpm spec:lint <file>` target-class (`CITATION_FILE_MISSING` naming a deleted `*-e2e.yml`) hard counts: see spec §2.2 table — 15 findings across 10 files.

**Edits (per-site disposition; style per spec §2.1):**

| Site | Current (fragment) | New (fragment) |
| --- | --- | --- |
| strip-mobile plan :34 | "Modify: backticked path (workflow), (path filter, if it names spec files individually…)" | "Modify: the now-deleted modal-header-layout-e2e workflow (path filter, …)" |
| strip-mobile plan :352 | "backticked path: grep for `skeletonBandParity`; mirror every per-file entry…" | "the now-deleted modal-header-layout-e2e workflow: grep for `skeletonBandParity`; …" |
| destruct-thumb plan :102 | "modelled on backticked bare filename (same setup action, …)" | "modelled on the since-retired modal-header-layout-e2e workflow (same setup action, …)" |
| modal-header CLOSE-OUT :86 | "backticked bare filename was narrowed to what #493 left dark" | "the modal-header-layout-e2e workflow (since retired) was narrowed to what #493 left dark" |
| share-link-chrome spec :30 (2 sites) | "(backticked path:39 says exactly that about the ~15 specs still dark)" and the citation-column entry | "(line 39 of the since-retired modal-header-layout-e2e workflow said exactly that about the ~15 specs then dark)"; citation column keeps only the still-tracked phantom-gap and package.json citations |
| archive-row-menu spec :128 | "(R14: e.g. backticked bare filename runs `pnpm test:e2e:modal-header`, whose spec list lives in `package.json`)" | "(R14: e.g. the since-retired modal-header-layout-e2e workflow ran `pnpm test:e2e:modal-header`, …)" |
| destruct-thumb spec :24 | "the config itself IS invoked by backticked path:106" | "the config itself was invoked by the since-retired modal-header-layout-e2e workflow" |
| destruct-thumb spec :326 | "modelled directly on backticked path" | "modelled directly on the since-retired modal-header-layout-e2e workflow" |
| caret-blur plan :20 | "backticked hoverhelp-geometry path path-triggers on …" | "the since-retired hoverhelp-geometry-e2e workflow path-triggered on …" |
| caret-blur spec :30 | test-inventory row citing the backticked hoverhelp-geometry path | same row naming "the since-retired hoverhelp-geometry-e2e workflow" in prose |
| attention-index plan :269 | "(backticked attention-anchor path is the closest template, a standalone-config job with a path filter)" (source uses a dash separator) | "(the since-retired attention-anchor-e2e workflow was the closest template, …)" (source's dash separator stays as-is) |
| attention-index plan :288 | "backticked attention-anchor path:19-32 is the structural template, but **it does not demonstrate every class**" | "lines 19-32 of the since-retired attention-anchor-e2e workflow were the structural template, but **they did not demonstrate every class**" |
| hoverhelp-viewport spec :63 | "CI: backticked hoverhelp-geometry path lists … It does NOT list ShareHub" | "CI: the since-retired hoverhelp-geometry-e2e workflow listed … It did NOT list ShareHub" |
| hoverhelp-viewport spec :251 | "Three entries MUST be added to backticked path's `pull_request` path filter" | "Three entries MUST be added to the since-retired hoverhelp-geometry-e2e workflow's `pull_request` path filter" |

Wording latitude: the implementer may vary the qualifier ("retired" / "since-retired" / "now-deleted") to read naturally in each sentence; the binding constraints are (a) no backticks around any deleted workflow name or path, (b) no `.yml`-suffixed backticked token pointing at a deleted file, (c) sentence meaning preserved, (d) no em-dash introduced, (e) tense adjusted only where the sentence otherwise asserts live CI behavior.

**Green:** per-file `pnpm spec:lint` matches spec §2.2's expected-after column exactly (0 target-class; residuals unchanged: 8 / 0 / 1 / 0 / 0 / 0 / 1 / 1 / 0 / 0). Tree-wide sweep — for each of the seven deleted basenames, a backtick-aware grep over `docs/**/*.md` confirmed against `spec:lint` — returns zero target-class citations.

**Commit:** `docs: strip dangling citations to the seven retired e2e workflows`

## Task 2 — master-spec financials vocabulary (spec §3)

**Red (measured):** the seed (spec §3.2, exact command in spec) returns 15 lines; 11 carry stale LEAD-only entitlement claims.

**Edits:** the 11-line partition and per-line edit directions in spec §3.2 are the disposition table (9 rule-a rewrites, 2 rule-b bracketed amendment notes). Constraints: line-count-neutral (each edit stays on its line); no em-dash introduced; entitlement phrasing matches `financialsEntitled` (`lib/data/getShowForViewer.ts:380`); inline vocab-extension marker `(… 2026-07-15 vocab extension)` where a bare rewrite would read as drift from the v1 ratification.

**Green (spec §3.3):**
1. Seed re-run returns exactly lines 193, 655, 657, 1418.
2. `wc -l docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` = 4027.
3. `pnpm spec:lint` on the master spec: no new findings of any severity vs the merge-base baseline run (baseline captured before editing).
4. Manual read of the §4.1 / §4.4 / §7.4-area prose around each edited line for multi-line LEAD-only phrasing the seed cannot see; stragglers join rule-a with the same treatment and are recorded in the PR body.

**Commit:** `docs: reconcile master-spec financials prose to LEAD/FINANCIALS/admin entitlement`

## Task 3 — specs README stale line-count (spec §1.1 item 8)

**Red:** `docs/superpowers/specs/README.md` says "3769 lines"; the file is 4027 lines at merge-base and stays 4027 after Task 2.
**Green:** the note reads 4027. One-word edit, same commit as Task 2.

## Task 4 — ledger graduation (spec §5)

1. Move both entries (`BL-DANGLING-CITATIONS-RETIRED-WORKFLOW`, `BL-MASTERSPEC-FINANCIALS-VOCAB`) from BACKLOG.md's open queue to `BACKLOG-archive.md`, each with a close-out note naming the provenance branch `docs/citation-rot-financials-vocab`, what shipped (item 1: 15 citations across 10 files rendered as prose, class-swept per AGENTS.md; item 2: 11 master-spec lines reconciled, 4 ratified exclusions), and the two backlog-entry corrections measured en route (retiring spec is second-to-last in its list and already clean; the seed returns 15 hits, not "~15 claims all needing edits").
2. Update BACKLOG.md's "Last reconciled" header line.
3. Append two `{ id, provenance: "docs/citation-rot-financials-vocab" }` rows to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` with the conventional explanatory comment.
4. `BL-HELP-STRIP-COPYLINK-STALE` untouched.

**Red:** `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` fails after step 1 alone (archived id without registry row) — run it mid-task to observe, then step 3 turns it green.
**Green:** that test passes; the full docs suite (`pnpm vitest run tests/docs/`) passes.
**Commit:** `docs: graduate BL-DANGLING-CITATIONS-RETIRED-WORKFLOW + BL-MASTERSPEC-FINANCIALS-VOCAB`

## Task 5 — verification sweep + gates

- All Task 1/2/3 acceptance commands re-run from clean tree; outputs recorded for the PR body.
- Full pre-push gates (repo memory contract): `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- `pnpm spec:lint` on this plan and on the spec: 0 hard each.

## Task 6 — adversarial review (cross-model), then ship

- Whole-diff Codex review via `scripts/codex-guard.mjs` (tight scope: the diff is ~14 files; inline the file list in the brief; REVIEWER ONLY; verdict marker; do-not-relitigate list from spec §1.1).
- Push, PR with body: scope summary, preflight-skip declaration, acceptance-command outputs, deferred-item note.
- Real CI green (all checks, not just required) → `gh pr merge --merge` → fast-forward local main → `git rev-list --left-right --count main...origin/main` = `0  0`.

## Checklist

- [ ] Task 1 strip + lint deltas
- [ ] Task 2 master-spec vocab + seed/wc/lint checks
- [ ] Task 3 README count
- [ ] Task 4 graduation (archive + header + registry)
- [ ] Task 5 verification sweep + full gates
- [ ] Self-review (this plan) against docs/agents/writing-plans.md
- [ ] Adversarial review (cross-model) — plan, then whole-diff
- [ ] Execution handoff (same session; autonomous pipeline)
