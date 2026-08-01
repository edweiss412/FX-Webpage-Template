# Plan: invariant-8 closeout enforcement

**Spec:** `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md` (canonical; APPROVED spec r3; this plan implements it, TDD per task, one commit per task). **Branch:** `test/invariant8-closeout-enforcement`. **Charter:** `BL-INVARIANT8-CLOSEOUT-ENFORCEMENT`.

impeccable-gate: N/A — no UI surface

(The marker above is live, not illustrative: this plan document names both gate halves in the meta-test inventory below, which makes its unit a declaring unit under spec §3.2 the moment the guard lands — the guard polices its own shipping plan, the spec §5 live-clean criterion.)

## Meta-test inventory (mandatory declaration)

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->

This milestone CREATES one structural meta-test: `tests/docs/_metaInvariant8Closeout.test.ts` (default-deny walk of `docs/superpowers/plans/` for invariant-8 — impeccable critique + impeccable audit — closeout markers), plus its helper-contract test `tests/docs/_invariant8Closeout.walker.test.ts` (recorded as a ratified addition to spec §8's ship shape — spec edited in T1's commit; the walker-contract file mirrors PR #646's `_ledgerMdast.walker.test.ts` precedent). It EXTENDS none of the standing registries (infra-contract, sentinel-hiding, admin-alert catalog, advisory-lock topology, no-inline-email-normalization): no auth, DB, alert, or tile surface is touched. The ONE edit to `tests/docs/_metaDeferralLedgerGraduation.test.ts` is the graduation registry row plus its header-comment pointer update (T3).

## Mutation-family ownership matrix (single owner per family; plan r1 F3)

| Family | Plant location (owner) | Live-assertion tie-in |
| --- | --- | --- |
| M1 discovery narrowing | T1 walker-contract test (tmpdir fixture trees) | T2 canary assertion (§4.1.5) |
| M2 predicate narrowing | T1 walker-contract test | — |
| M3 grammar widening | T1 walker-contract test (grammar-probe table ported) | T2 malformed-scan (§4.1.2) |
| M4 ledger staleness | T2 guard test (registry-coupled) | §4.1.3 |
| M5 ledger bypass | T2 guard test | §4.1.1 |
| M6 undated leak | T2 guard test | §4.1.4 |
| M7 malformed-marker tolerance | T1 walker-contract test (unitVerdict level) | T2 §4.1.2 |
| M8 template-file leak | grammar/verdict cases in T1; the live template-file assertion (§4.1.6) in T2 | §4.1.6 |

## Mutation-evidence protocol (plan r1 F4 — exact mutants, expected reds)

Run in T1/T2 per the owner column; per mutant: apply, record failing test IDs, restore, record green. All recorded in the owning task's commit body.

- M1 mutants: (a) `walkPlansTree` filters out directories whose name is undated (kills category traversal) — expect category-shape + canary reds; (b) delete the closeout-attach branch — expect attach plant red; (c) partition keys on the DEEPEST dated segment — expect no-sub-unit-reopen plant red; (d) `walkPlansTree` reads a hardcoded path list — expect novel-unit plant red.
- M2 mutants: (a) fold replaced by same-file-BOTH — split-across-files plant red; (b) predicate regexes made case-sensitive — mixed-case plant red; (c) single-half made triggering — critique-only/audit-only plants red.
- M3 mutants (one per reject-table row): drop trailing `$` anchor — trailing-text plants red; make `audit=` optional — missing-field plant red; delete cross-check — both cross-check plants red; widen int to `\d+` — leading-zero plant red; drop `trimStart` — indented plants red; accept TEMPLATE form everywhere — TEMPLATE-outside plant red.
- M4 mutants: delete each staleness branch (vanished / no-longer-declaring / now-conforming) — that branch's plant red, three mutants.
- M5 mutant: assertion 1 consults ledger before checking markers unconditionally passes ledgerless units — bypass plant red.
- M6 mutant: undated check skipped — undated-leak plant red.
- M7 mutant: `unitVerdict` returns conforms when ≥1 valid marker regardless of malformed — both M7 plants red.
- M8 mutants: TEMPLATE form confers conformance — non-conferring plant red; TEMPLATE valid outside registry — outside plant red; valid marker tolerated in template file — §4.1.6 plant red.

## Plan-time facts (verified, commands run 2026-08-01; census re-run AT PLAN HEAD per plan r1 F5)

- Census probe at spec draft (pre-plan tree): 301 units, 195 declaring (117 flat, 78 dir), 8 closeout-attached, aggregates 19/17. Census at THIS PLAN's commit HEAD: **302 units, 196 declaring (118 flat, 78 dir), aggregates 20/17** — the delta IS this plan document (its filename contains "closeout", so the `*closeout*` aggregate ticks too; it declares both halves and conforms via its live marker, so it takes no ledger row). Spec §2 keeps the draft census; implementation regenerates the ledger from the then-current tree (spec §8).
- Grammar probe: 17-case accept/reject table, exit 0.
<!-- spec-lint: ignore — files created by this plan; not yet tracked -->
- `vitest.projects.ts:126` globs `tests/docs/**/*.test.{ts,tsx}` — both new test files are collected by the existing project; the helper (`_invariant8Closeout.ts`) and registry (`invariant8/preGuardDebt.ts`) are non-test files, not collected.
- `pnpm spec:lint` on the spec: 0 hard, 6 advisory.
- Canary paths exist (probe-verified): `docs/superpowers/plans/2026-07-18-alert-copy-full-sweep.md`, `docs/superpowers/plans/admin/2026-06-22-validation-reset-button.md`, `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation`, `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1` (guard keys are plans-relative).
- HANDOFF-TEMPLATE.md §12 heading reads `## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)` with the backend-only N/A branch in its second paragraph (T2 edit site).

## Tasks (TDD; conventional commit per task; RED is demonstrated behaviorally — stubs/empty registries make the test COMPILE and fail on assertions, never on module resolution; plan r1 F2)

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->

### T1 `test(docs): invariant-8 closeout walker helper + contract test`

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->
RED: new `tests/docs/_invariant8Closeout.walker.test.ts` PLUS `tests/docs/_invariant8Closeout.ts` containing typed export STUBS (each throws `unimplemented`) so the suite compiles and every assertion fails behaviorally. Coverage: `walkPlansTree` (tmpdir fixture trees via `fs.mkdtempSync`; novel-unit visibility), `partitionUnits` (every §3.1 shape incl. closeout-attach + three non-attach controls), `declaresGate` (unit-wide fold incl. split-across-files), `parseMarkers` (grammar-probe 17-case table ported verbatim), `unitVerdict` (strictness incl. M7 cases), M8 grammar/verdict cases. GREEN: implement the helper by porting the committed probe partition + grammar-probe verdict logic. Then run the M1/M2/M3/M7/M8 mutants from the protocol above and record. SAME COMMIT: spec §8 gains the walker-contract test file in its ship-shape list, recorded as a ratified execution addition (plan r1 F3; mirrors the PR #646 execution-delta pattern).

### T2 `test(docs): live guard, M4-M6 plants, frozen ledger + write-path doc edits`

<!-- spec-lint: ignore — files created by this plan; not yet tracked -->
RED: new `tests/docs/_metaInvariant8Closeout.test.ts` implementing ALL SIX §4.1 live assertions, plus `tests/docs/invariant8/preGuardDebt.ts` shipping EMPTY registries (`PRE_GUARD_DEBT` empty set, `UNDATED_DECLARING_ALLOWLIST` empty, `MARKER_TEMPLATE_FILES` with its one HANDOFF-TEMPLATE row) — compiles, then reds: assertion 1 on ~196 declaring units (empty ledger), assertion 4 on `BACKLOG.md` (empty allowlist), assertion 6 on the template file (no TEMPLATE marker yet). Recorded RED output in the commit body. GREEN, same commit: (a) generate `PRE_GUARD_DEBT` from the census probe's declaring-unit list AT THIS COMMIT (minus units that conform, i.e. this plan); (b) add the `BACKLOG.md` allowlist row; (c) the write-path doc edits — HANDOFF-TEMPLATE.md §12 gains the TEMPLATE-form placeholder line + the backend-only sentence quoting the N/A form inline in backticks (this edit is §4.1.6's GREEN — the fold of old T3 gives the doc edit a real RED edge, plan r1 F1); (d) AGENTS.md invariant 8 gains the marker-line sentence naming the guard test AND the carrier-placement style recommendation (dir units: closeout.md/CLOSEOUT.md or the handoff §12; flat units: in-plan `## 12` section or stem-named sibling closeout) — same guidance sentence added to the template §12 (spec §6, previously orphaned; plan r1 F3). M4/M5/M6 plants live here; run their mutants + M8's live-assertion mutant and record.

### T3 `docs: graduate BL-INVARIANT8-CLOSEOUT-ENFORCEMENT`

TDD RED edge (T5 pattern of PR #646): add the `BACKLOG_GRADUATED` registry row FIRST — the mdast guard reds (id present in `BACKLOG.md`, absent from archive). GREEN: move the entry to `BACKLOG-archive.md` with provenance `test/invariant8-closeout-enforcement`, layering the reconciliation note; update the `_metaDeferralLedgerGraduation.test.ts` header comment (its "filed as … in BACKLOG.md" sentence gains "graduated via this branch; assertion restored in the new guard test" — prose comment, NOT a second registry edit).

Reference sweep RUN at plan time against the revised plan, exact command `rg -n "BL-INVARIANT8-CLOSEOUT-ENFORCEMENT" --no-heading | cut -d: -f1,2` — TEN hits (r1 counted eleven against the pre-revision plan, which carried one more self-reference; plan r1 F6), per-hit dispositions:

- root `BACKLOG.md` line 691 — the entry heading: MOVES to archive (the RED/GREEN above).
- `tests/docs/_metaDeferralLedgerGraduation.test.ts:31` — header comment: UPDATED in this commit (above).
- `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/closeout.md:140` — the descope's historical record: KEEP verbatim.
- design spec lines 1 and 5, both probe siblings (one hit each), and this plan's THREE self-references (title/charter line, the T3 heading, the sweep command line) — this arc's own artifacts naming their charter: KEEP ALL (provenance; graduation never purges historical references).

### T4 Close-out

Full `pnpm test`; `tsc` both configs; eslint; `format:check`. Whole-diff cross-model review (fresh-eyes brief; the new guard + helper + ledger + doc edits are one tight scope). Push; real CI green; `gh pr merge --merge`; ff-sync main to `0  0`; CronDelete nudge + clear pane + marker stage done.

## Snippet typecheck note

Task bodies carry no pasted TS snippets (shapes are named, not inlined) — T1/T2 test bodies are authored in-branch under the repo's strict tsconfig at implementation time.

## e2e/CI wiring

No new workflow, no e2e spec, no testMatch change: both new test files match the existing `tests/docs/**/*.test.{ts,tsx}` project row (`vitest.projects.ts:126`); helper + registry are non-test files. Verified at T1 by running the suite scoped to `tests/docs/`.
