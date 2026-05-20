**Status: COMPLETED 2026-05-20 at R3 APPROVE on SHA `41b3576`.** Three review rounds total: R1 APPROVE 2026-05-19 → retroactively REVERSED 2026-05-20 (3 P0s from live-integration bootstrap; mocked-only methodology was tautological); R2 APPROVE 2026-05-20 on `8f7d2de` (P0s closed structurally via canonical `upsert_admin_alert` RPC + meta-test + live-integration smoke test); R3 APPROVE 2026-05-20 on `41b3576` (H1-4 Supabase-optional drift-detector closed structurally — `defaultUpsertAdminAlert` detects unset/empty/127.0.0.1/localhost URLs and throws before client construction; `emitAlert` catches with stderr skip-message; JSON report STILL lands; exit 1 on drift STILL authoritative; spec §17.2.1 amended with one-sentence Supabase-optional contract; 15/15 audit cases pass — 13 R2 inheritance + 2 new graceful-degradation). R3 Opus fresh-eyes whole-diff sweep anchored to milestone base `d026919` returned APPROVE with zero new findings; all 4 unreachable-Supabase scenarios mentally-traced clean; all R2 closures preserved intact. **Complexity-hypothesis FOURTH data point — REFINEMENT to codified memory `feedback_mocked_only_tests_invite_tautological_approve.md`:** live-integration tests must include the environment-FAILURE mode, not just the happy-path environment. Branch-protection bootstrap (handoff §8 operator step) is now UNBLOCKED. **FXAV crew-pages v1 X.* set is structurally complete (this time really).** See "Convergence log" below.

~~**Status: READY FOR R3 REVIEW at `aff1195` (H1-4: Supabase-optional drift-detector repaired).**~~ Superseded by COMPLETED above.

~~**Status: COMPLETED 2026-05-20 at R2 APPROVE on SHA `8f7d2de`.**~~ Superseded by REOPENED above; preserved here for archival. R1 APPROVE at `4a8c242` was retroactively REVERSED on 2026-05-20 when the operator-bootstrap step surfaced 3 P0 findings the mocked-only methodology missed; Codex's R2 repair (commits `0fe229c` + `efedcba` + `e3a1faa` + `8f7d2de`) closed all three structurally — `void main()` now `.catch()`-wrapped; admin-alert producer uses canonical `upsert_admin_alert` RPC pattern from `lib/adminAlerts/upsertAdminAlert.ts:35`; plan Task X.6 Step 3c clause 4 amended verbatim; new structural meta-test `tests/messages/_metaAdminAlertProducer.test.ts` walks `scripts/`+`lib/`+`app/` via `walkSourceFiles` (code-shape-based, not name-list); new live-integration smoke test at `tests/cross-cutting/verify-branch-protection.test.ts:206-238` exercises the real Supabase service-role client + RPC + idempotency-via-occurrence_count contract; W18 watchpoint inherits forward. R2 Opus fresh-eyes whole-diff sweep anchored to milestone base `d026919` returned APPROVE with zero new findings. **Complexity-hypothesis third data point: CONFIRMED across X.4 R2, X.5 R2, X.6 R2** — all three heaviest X.* milestones required two rounds; the round-count predictor is not raw complexity but the presence of a live-integration surface that mocks cannot exercise. Codifies as memory `feedback_heavy_audit_milestones_budget_two_rounds.md` (and sibling `feedback_mocked_only_tests_invite_tautological_approve.md`). **FXAV crew-pages v1 X.* set is now structurally complete.** Branch-protection bootstrap (handoff §8 operator step) resumes immediately post-close.

~~**Status: REOPENED 2026-05-20 → R2 in flight.**~~ Original R2 marker — superseded by COMPLETED above.

**Status: ~~COMPLETED 2026-05-19~~** — see REOPENED notice above. **R1 APPROVE retroactively REVERSED.** Adversarial review ~~converged at~~ **briefly claimed R1 APPROVE** on SHA `4a8c242` (milestone base `d026919`; handoff close at `ef483dc`). Codex's R1 shipped the spec amendment renaming `x5-rls-coverage` → `x5-email-canonicalization` (spec §17.2 lines 2839 + 3693 + 3697; plan `11-cross-cutting.md` at all five named-check usages) — the X.5-surfaced drift reconciled in X.6's commit range per the canonical regression-fixture contract. Trust-boundary split intact: privileged `verify-branch-protection` gated to `push: main` + `schedule: '0 9 * * 1'` only; reader `verify-branch-protection-status` uses only auto-injected `GITHUB_TOKEN`; `pull_request_target` absent from `.github/`. All 12 branch-protection test cases present with anti-tautology spy-payload assertions. Workflow-fails-on-bad-fixture evidence captured: PR https://github.com/edweiss412/FX-Webpage-Template/pull/1, run 26137112146, failing `traceability-audit` job 76874626728 (throwaway branch + PR closed after capture). Seven PR-required CI status checks now wired verbatim: `traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`, `verify-branch-protection-status`. **Complexity-hypothesis third data point: WEAKENED.** X.4 R1→R2 + X.5 R1→R2 both took two rounds; X.6 is the heaviest of the X.* set (three concurrent surfaces + GitHub API + secret handling + spec amendment surfacing) and closed at R1 APPROVE. The "heavy audits need ≥2 rounds" hypothesis does NOT codify as memory — the better generalization is likely that audit complexity alone doesn't predict round count; what predicted X.4/X.5 round counts may have been the specific class of trap (text-regex shortcuts; hardcoded TS literals) that Codex's R1 self-review missed, not raw complexity. **FXAV crew-pages v1 X.* set is structurally complete.** Manual admin step (configure required-checks in GitHub Settings) is the only operator follow-up; programmatically verified by subsequent privileged runs. See "Convergence log" below.

# Handoff — X.6: Spec-to-implementation traceability + branch-protection drift-detector + cross-cutting parity assertions (AC-X.6)

**Handed off:** 2026-05-19 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md "X.\* — Cross-cutting" row — backend audit + CI plumbing; no UI surface).
**Adversarial reviewer:** Opus 4.7 / Claude Code (reviewer-pairing logic — Codex implements → Opus reviews; per ROUTING.md + memory `feedback_iterate_until_convergence.md`). Lineage: X.1 R3 APPROVE → X.2 R1 APPROVE → X.3 R1 APPROVE → **X.4 R1 REQUEST_CHANGES → R2 APPROVE** → **X.5 R1 REQUEST_CHANGES → R2 APPROVE**. X.6 is **the largest and most complex of the X.\* set** — three concurrent audit surfaces in one task (traceability walker + branch-protection drift-detector + cross-cutting parity assertions) + GitHub API integration + secret handling. Per the complexity-hypothesis test codified in X.5 close-out, X.6 is the THIRD data point: if X.6 closes at R1, the hypothesis ("heavy audits need ≥2 rounds") needs reframing; if R2+, the hypothesis codifies as memory `feedback_heavy_audit_milestones_budget_two_rounds.md`.
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md` — Task X.6 only (lines 1983–2332).

> X.6 is the SIXTH and FINAL of the cross-cutting audit tasks (X.1–X.6). No §A/§B split — single-implementer Codex (backend audit infrastructure + CI workflow plumbing + GitHub Branch Protection API integration). UI hard rule N/A — no file under `app/` (outside `app/api/**`), `components/`, or design tokens is mutated.

> **X.6 IS THE STRUCTURAL ENFORCEMENT OF AGENTS.md §1.7 — "Spec is canonical"** applied to the whole spec corpus. Every spec heading and every `<!-- spec-id: ... -->` HTML-comment anchor is walked by a generator; every plan task is required to carry a structured `<!-- coverage: §N.M, AC-X.Y, spec-id-slug -->` marker; the coverage matrix is the bidirectional traceability proof. CI fails on `MISSING > 0` AND on failure of any cross-cutting parity assertion enumerated below. Memory `feedback_audit_derives_from_spec_not_handoff.md` (codified post-X.3) reaches its FINAL FORM in X.6: every list X.6 compares (admin-only tables, watermark symbol sets, required-checks names, spec anchors, AC bodies vs required-checks list) is parsed from the spec body at audit-execution time — hardcoded TS arrays are a P0.

> **X.6 catches the bug classes X.1–X.5 cannot.** X.1 enforces catalog parity; X.2 no raw codes in UI; X.3 auth-chain dominance; X.4 no global cursor; X.5 email canonicalization. None of those audit the **spec-internal consistency** between (a) AC bodies and the supplementary required-checks list, (b) the spec's §4.3 admin-only table list and the plan's `ADMIN_TABLES` / `PROTECTED_SINKS` registries, (c) `AUTHORITATIVE_GATING_WATERMARKS`/`DISPLAY_ONLY_TIMESTAMPS` symbol sets spec ↔ plan, (d) the live GitHub branch-protection settings vs the spec's seven-named-check contract. X.6 IS the structural mechanism for those.

> **The X.5-surfaced drift is the CANONICAL REGRESSION FIXTURE for the AC-body-vs-required-checks-list parity assertion.** Per X.5's convergence log (handoff `X5-email-canonicalization.md` line 18), AC-X.5 BODY in spec §17.2 line 3676 says "email canonicalization" but AC-X.6's seven-name required-checks list (spec §17.2 lines 2831, 3677, 3681 + plan `11-cross-cutting.md:2057,2167,2181,2289,2297`) names the X.5 gate `x5-rls-coverage`. X.5 worked under the SEMANTICALLY-CORRECT name `x5-email-canonicalization` per AGENTS.md §1.7 + memory `feedback_audit_derives_from_spec_not_handoff` applied recursively (live AC body > frozen reference in a list). X.6's AC-body-vs-list parity assertion is DESIGNED to surface this drift on its FIRST RUN. The drift gets RECONCILED as part of X.6 — either (a) Codex's R1 ships the spec amendment renaming `x5-rls-coverage` → `x5-email-canonicalization` in AC-X.6's list + plan `11-cross-cutting.md` named-check usages, OR (b) the drift is surfaced as an X.6 finding that lands as a follow-up amendment. EITHER path is acceptable; whichever Codex chooses MUST be recorded in the convergence log. **What is NOT acceptable:** silently renaming AC-X.5's body to match the list (the body is canonical per §1.7); silently dropping the parity assertion to avoid the test failing; silently amending the spec without recording the drift surface.

> **Trust-boundary split is THE security contract.** The privileged drift-detector job (`verify-branch-protection`) runs ONLY on `push` to `main` + weekly `schedule` cron — both contexts execute committed-to-main code with the privileged `GH_APP_TOKEN` / `BRANCH_PROTECTION_PAT` + `SUPABASE_SECRET_KEY` secrets safely available. The PR-required reader job (`verify-branch-protection-status`) runs on every `pull_request` (including forks) and every push, uses ONLY the auto-injected read-only `GITHUB_TOKEN`, and asserts the privileged job succeeded recently on `main` within an 8-day freshness window. **`pull_request_target` is explicitly NOT used** — running untrusted PR_HEAD code with privileged secrets attached is a documented security hole. If the implementer is tempted to "simplify" by using `pull_request_target`, **REJECT immediately** — the split IS the entire point. Recursive-bootstrap property: the privileged script asserts the reader is in the required-checks set; the reader asserts the privileged job succeeded recently — so removing either name from required-checks OR breaking the privileged job fails the merge gate within 8 days. The fork-PR deadlock that a PR-required privileged job would cause (GitHub omits secrets from fork-triggered workflow runs → privileged job fails closed → every external contribution permanently blocked) is closed by the split.

> **Same-model self-review pattern post-X.4/X.5.** X.4 R1 + X.5 R1 were REQUEST_CHANGES because heavy semantic / DB-introspection surfaces broke the R1-streak; pattern-matching-only audits (X.2/X.3) converged at R1. X.6's surface is HEAVIER than X.5 (three concurrent surfaces; YAML parsing; GitHub REST + Rulesets API integration; spec amendment surfacing; both legacy branch-protection AND rulesets paths to validate). Highest-risk pre-emptable failure modes — verify before claiming done: (a) traceability walker discriminates `<!-- spec-id: ... -->` HTML comments from prose mentions via markdown parser, NOT bare grep; (b) plan-side scan is scoped to TASK BLOCKS only (excluding self-review/review-history/glossary prose); (c) `<!-- coverage: ... -->` markers are the SOLE authoritative mapping (free-form prose mentions don't count); (d) `setEqual(specAdminTables, ac25AdminTables)` + `specAdminTables.every(t => protectedSinksRegexList.includes(t))` parses spec §4.3 at audit-execution time; (e) the AC-body-vs-required-checks-list parity assertion catches the X.5-surfaced `x5-rls-coverage` drift; (f) workflow-YAML parity assertion catches `pull_request_target` usage anywhere in `.github/workflows/x-audits.yml`; (g) the privileged drift-detector script handles BOTH legacy branch-protection AND rulesets API models per plan Task X.6 Step 3c clause 2; (h) the `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` admin-alert path fires on ALL FOUR auth-failure shapes (no-token, gh-app-token-401, pat-403, expired-token).

---

## 1. Spec sections in scope

Exhaustive, not representative. The traceability walker is exhaustive by design — it walks EVERY spec heading + EVERY `<!-- spec-id: ... -->` anchor. The sections explicitly named below are the ones X.6's CROSS-CUTTING PARITY assertions read; the walker walks all the rest implicitly.

- **§17.2** — AC-X.6 verbatim (spec line 3677). Names the seven PR-required CI status checks; defines the cross-cutting parity assertions; defines `MISSING > 0` + Step-2-substantive-assertion-failure as the CI build-failure signals; references §17.2.1 for the trust-boundary runbook.
- **§17.2.1** — Branch-protection drift-detector runbook (spec line 3679). Trust-boundary contract; privileged-vs-reader split; `BRANCH_PROTECTION_DRIFT` + `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` admin-alert codes; 8-day freshness window; rotation SLA.
- **§4.3** — Admin-only table list (input to the §4.3 ↔ AC-2.5 admin-table parity assertion). X.3 closed at 21 admin-only tables; X.6 re-derives from spec at audit-execution time per memory `feedback_audit_derives_from_spec_not_handoff`.
- **§X.4 spec prose** — `AUTHORITATIVE_GATING_WATERMARKS` + `DISPLAY_ONLY_TIMESTAMPS` symbol sets (input to the AC-X.4 spec ↔ plan parity assertion). Plan Task X.4 Step 1 holds the plan-side copy.
- **§4.1.1** — Email canonicalization (input via X.5's `lib/audit/email-boundaries.generated.ts`; X.6 reads the generated manifest as a parity input).
- **§12.4 / §12.4.1** — Admin-alert catalog (X.6 adds two new codes: `BRANCH_PROTECTION_DRIFT` + `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` — both already in the spec at §12.4 lines 2831/2832; X.6 ships their producer sites in `scripts/verify-branch-protection.ts`).
- **§16 — secrets/env coverage** (input to a traceability-matrix assertion: §16 MUST have at least one explicit task; earlier draft skipped §16 entirely, the assertion catches the regression).
- **§13.2.3** — Three lease/horizon amendments (input to the matrix's per-amendment coverage assertion).
- **`docs/superpowers/specs/amendments/`** — out-of-band spec amendments (M9 C9 admin-allowlist-runtime-mutable + 2026-05-12 catalog-agenda-codes). The walker MUST recognize amendments here per M9 C9's established convention.
- **AGENTS.md §1.7** — "Spec is canonical." X.6 IS the canonical structural enforcement; the AC-body-vs-required-checks-list parity assertion is its first real test.

## 2. Acceptance criteria

**Primary AC (verbatim from spec §17.2 line 3677):**

- **AC-X.6** — **Spec-to-implementation traceability — machine-generated matrix + cross-cutting build-time invariants.** Generator walks every spec heading + every `<!-- spec-id: ... -->` HTML-comment anchor (no implicit prose-mention fallback); plan tasks include structured `<!-- coverage: §N.M, AC-X.Y, spec-id-slug -->` markers; matrix has columns `Spec anchor | Title | Owning task ID(s) | Status | Implementation evidence | Notes`. Status ∈ {`planned`, `implemented`, `deferred`, `intentionally out of scope`, `MISSING`}. CI fails on `MISSING > 0` AND on failure of ANY substantive parity, coverage, or code-producer assertion enumerated in Plan Task X.6 Step 2. The seven required GitHub status checks are named verbatim: `traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-rls-coverage` (subject to the X.5-surfaced drift reconciliation — see opening summary), `verify-branch-protection-status`.

**Task-internal sub-criteria (from plan Task X.6, `11-cross-cutting.md:1983-2331`):**

- **Traceability matrix generator** at `scripts/generate-traceability.ts` — walks every H1/H2/H3/H4 heading in the spec markdown + every `<!-- spec-id: ... -->` HTML-comment anchor + every `AC-*` row from §17. Plan-side scan SCOPED to task blocks delimited by `^### Task N\.M:` headers; explicitly EXCLUDES `# Self-review checklist`, `# Adversarial review history`, `## Convergence summary`, `# Review history`, `# How to use this plan`, `## Glossary`, `## Round-N notes`, and any heading matching `/review|history|retrospective|how[- ]to[- ]use|glossary|appendix/i`. **Structured `<!-- coverage: ... -->` markers are the SOLE authoritative mapping** — free-form prose mentions of spec anchors are NOT evidence (eliminates the heuristic `ParsedSheet` + `enrichWithDrivePins`-mention class). Emits to `docs/superpowers/plans/coverage.md` (committed). Status ∈ {`planned`, `implemented`, `deferred`, `intentionally out of scope`, `MISSING`}; `planned` does NOT imply `implemented` — code-side `// @covers §N.M` annotations promote a row to `implemented`.

- **Prerequisite spec-id insertion (one-time spec edit)** — per plan Task X.6 Step 1 prerequisite list. Initial slugs: `section-6-8-derivation-table`, `section-6-8-2-auth-side-effects-derivation`, `section-13-2-3-lease-holder-protocol`, `-40-reports-lease-amendment`, `-parsedsheet-parseresult-split`, `-immutable-pin-amendment`, `-cookie-session-validator-rewrite`. Each subsequent normative non-heading unit added to the spec MUST receive a unique slug.

- **Traceability test** at `tests/cross-cutting/traceability.test.ts` — runs the generator + asserts: (a) zero anchors at status `MISSING`; (b) `ParsedSheet/ParseResult split` is mapped via explicit `<!-- coverage: -parsedsheet-parseresult-split -->` marker; (c) `/40 lease_holder amendments` are mapped; (d) §16 (secrets/env) has at least one explicit task; (e) every code in §12.4 has a producer site (cross-references X.1's three-way parity); (f) **§4.3 ↔ AC-2.5 admin-table parity** — parse spec §4.3 admin-only bullet list at audit time; parse Plan Task 2.3's `ADMIN_TABLES` registry + Task X.3's `PROTECTED_SINKS` regex list; assert `setEqual(specAdminTables, ac25AdminTables) && specAdminTables.every(t => protectedSinksRegexList.includes(t))`; named-diff failure (`+missing_in_ac25:bootstrap_nonces`); (g) **AC-X.4 spec ↔ plan parity** for `AUTHORITATIVE_GATING_WATERMARKS` + `DISPLAY_ONLY_TIMESTAMPS` symbol sets — spec §X.4 prose MUST match plan Task X.4 step 1; (h) **AC body ↔ AC-X.6 required-checks-list parity (NEW, X.5-surfaced)** — for every AC body that names a CI gate semantically (e.g., AC-X.5 body says "email canonicalization"), assert the AC-X.6 required-checks list entry for that AC matches the semantic check name. The X.5 drift (AC-X.5 body says email canonicalization but list says `x5-rls-coverage`) is the **inaugural regression fixture**; the assertion fails until the drift is reconciled either via spec amendment (preferred) OR via explicit allowlist with reviewed justification (initially empty); (i) **`.github/workflows/x-audits.yml` freshness-gate parity** — parse as YAML; every audit job contains the freshness step `Verify generated admin tables file is fresh` with `if: github.event_name != 'schedule'`; privileged `verify-branch-protection` job gated to `if: github.event_name == 'push' || github.event_name == 'schedule'` (NEVER `pull_request`); lightweight reader `verify-branch-protection-status` exists, has NO secrets in its env, uses only `GH_TOKEN: ${{ github.token }}`; **file does NOT contain the string `pull_request_target`** (security hole guard); (j) reel-pin 4-column atomic-NULL/SET invariant (per plan Task X.6 Step 2 — already shipped by upstream milestones; X.6 audits it).

- **CI workflow extension** — extend `.github/workflows/x-audits.yml` (X.1–X.5 currently ship there) with: (a) `traceability-audit` job; (b) `verify-branch-protection` PRIVILEGED job gated to `push: main` + `schedule: '0 9 * * 1'` only; (c) `verify-branch-protection-status` LIGHTWEIGHT READER job that runs on every `pull_request` + push, using only the auto-injected `GITHUB_TOKEN`. Each new job uses canonical artifact-naming pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}` (X.2 R1 codification carried through X.3/X.4/X.5). The X.1–X.5 jobs gain an `if: github.event_name != 'schedule'` guard so the weekly cron fires ONLY the privileged drift-detector. Canonical YAML keys: `name`, `runs-on: ubuntu-latest`, `steps`, `env` (per Step 3a in the plan). The reader job's freshness check uses `gh run list --workflow=x-audits.yml --branch=main --status=success --limit=1`, asserts the latest run's `verify-branch-protection` job conclusion is `success`, AND asserts `AGE_SECONDS <= 8 * 24 * 60 * 60` (8-day window).

- **Privileged drift-detector script** at `scripts/verify-branch-protection.ts` — picks `GH_APP_TOKEN` first, falls back to `BRANCH_PROTECTION_PAT`. Auth-failure emits `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` admin-alert with context payload `{ gh_app_token_set, pat_set, http_status, last_successful_auth, repo }`. API calls: BOTH `GET /repos/{owner}/{repo}/branches/main/protection` (legacy branch-protection) AND `GET /repos/{owner}/{repo}/rulesets` (Rulesets API — covers orgs using rulesets). Owner/repo from `GITHUB_REPOSITORY` env OR `git remote get-url origin` locally. Validates EITHER model: legacy fields if a legacy rule exists for `main`; ruleset fields if a `ref_name=main` ruleset targets `main`. Assertions per Step 3c clause 3: `required_status_checks.strict === true`; `required_status_checks.contexts` contains ALL SEVEN names verbatim; `required_approving_review_count >= 1`; `dismiss_stale_reviews === true`; `enforce_admins === true`; `allow_force_pushes.enabled === false`; `allow_deletions.enabled === false`. Drift emits `BRANCH_PROTECTION_DRIFT` admin-alert with named-diff `failures` array, writes JSON report at `artifacts/branch-protection-report.json`, exits non-zero.

- **Drift-detector test** at `tests/cross-cutting/verify-branch-protection.test.ts` — mocks GitHub API (`nock` / `msw`) + `supabaseAdmin.from('admin_alerts').insert` (Vitest spy). Required cases per plan Task X.6 Step 3c test list: `missing-check-name`, `insufficient-review-count`, `enforce-admins-disabled`, `strict-false`, `dismiss-stale-disabled`, `allow-force-push-enabled`, `ruleset-only-happy-path`, `legacy-protection-happy-path`, `no-token`, `gh-app-token-401`, `pat-403`, `expired-token`. Anti-tautology: assertions scope to the specific spy call payload (`expect(insertSpy).toHaveBeenCalledWith({ code: 'BRANCH_PROTECTION_DRIFT', context: expect.objectContaining({ failures: expect.arrayContaining([...]) }), severity: 'high' })`), NOT to exit code alone.

- **Spec amendment surfacing — AC-X.5-body-vs-AC-X.6-list reconciliation.** The drift surfaced by X.5 (AC-X.5 body says email canonicalization, AC-X.6's seven-name list says `x5-rls-coverage`) is the inaugural test of the AC-body-vs-list parity assertion (item h above). X.6's repair MAY include the spec amendment renaming `x5-rls-coverage` → `x5-email-canonicalization` in (a) spec §17.2 line 2831 + line 3677 + line 3681 + line 3677's seven-name list + (b) plan `11-cross-cutting.md:2057,2167,2181,2289,2297` named-check usages + (c) `.github/workflows/x-audits.yml` if X.5 used a workaround name (X.5 shipped under `x5-email-canonicalization` already; the spec is what's drifted, not the workflow). Whichever path Codex chooses MUST be recorded in the convergence log with verbatim file:line citations. **NOT acceptable:** silently renaming AC-X.5's body to match the list; silently dropping the parity assertion to make the test green.

- **Branch-protection manual admin step (one-time, called out in commit body).** After the workflow lands and runs green at least once on `main`, an admin must navigate to repository Settings → Branches → Branch protection rules → `main`, enable "Require status checks to pass before merging", and add all SEVEN check names verbatim. Recorded as a follow-up item in the convergence log with concrete checklist; the workflow file alone does not configure protection (GitHub requires the manual admin step). Subsequent privileged runs of `scripts/verify-branch-protection.ts` programmatically verify the manual step landed correctly.

- **`coverage.md` committed** at `docs/superpowers/plans/coverage.md` — generator output, byte-stable across re-runs (idempotent). Freshness gate via `pnpm gen:traceability && git diff --exit-code docs/superpowers/plans/coverage.md` would prevent stale commits BUT the spec/plan markdown is the source-of-truth; we instead require the traceability TEST to fail if regeneration produces a diff (so the matrix is always regenerated by the test rather than committed-stale). Codex picks ONE of the two equivalent contracts (committed-and-freshness-gated OR test-regenerates); the convergence log records the choice.

- **`package.json` scripts** added: `gen:traceability`, `test:audit:traceability`, `test:audit:branch-protection`. `pretypecheck` / `prelint` / `pretest` / `prebuild` chain X.3+X.4+X.5+X.6 generators (existing: `gen:admin-tables` + `gen:watermark-symbols` + `gen:email-boundaries`; new: `gen:traceability`).

- **Cross-helper allowlist round-trip** (memory `feedback_negative_regression_verification.md`) — synthesize a stash where (a) one §4.3 admin-only bullet is dropped, audit FAILS with `+missing_in_ac25:<table>`; (b) AC-X.4 plan-side symbol-set has a column name swapped, audit FAILS with `+missing_in_plan:<symbol>`; (c) the AC-X.5 body says "email canonicalization" but list still says `x5-rls-coverage`, AC-body-vs-list parity audit FAILS with `+ac_body_list_drift:AC-X.5`; (d) a `pull_request_target` string is added to `.github/workflows/x-audits.yml`, workflow-YAML parity audit FAILS with `+pull_request_target_used`; (e) the privileged drift-detector script's `enforce_admins` assertion is weakened (e.g., accepts `false`), the script test fixture FAILS to fire; (f) a §16 task is removed from the plan, traceability matrix FAILS with §16-not-covered. Each negative regression documented in convergence log with stash SHA.

- **Regression fixtures** under `tests/cross-cutting/fixtures/traceability/`: `good-all-anchors-covered.md` (a plan with full coverage markers); `bad-missing-anchor.md` (a plan task referencing `§5.2` without a structured marker); `bad-anchor-without-coverage.md` (a spec anchor with NO owning task); `bad-self-review-shouldnt-count.md` (a self-review section with prose mentions — should be EXCLUDED from coverage extraction); plus the AC-X.5-body-vs-list drift fixture pair (one fixture where the names agree → audit passes; one where they drift → audit fails).

- **Workflow-fails-on-bad-fixture verification (plan Task X.6 Step 3b).** Once the workflow file lands, push a throwaway branch `verify/x6-workflow-fails-on-bad-spec` with an intentional spec drift (drop one §4.3 admin-table entry while leaving Plan Task 2.3's `ADMIN_TABLES` registry unchanged). Open a draft PR. Assert: (a) GitHub Actions kicks off the workflow on the PR; (b) `traceability-audit` job FAILS with `+missing_in_ac25:<dropped-table>`; (c) PR shows `traceability-audit` as a failed check; (d) artifact upload succeeded despite failure (proving `if: always` works). Repeat for at least one other audit (introduce a raw `'WIZARD_SESSION_SUPERSEDED'` literal so `x2-no-raw-codes` fails). Close + delete the throwaway branch after evidence is captured. Codex records the captured workflow-run URLs in the convergence log.

- **AVOID the X.2/X.3/X.4/X.5 residual substring-matching trap** (carried-forward watchpoint). The traceability walker uses a markdown parser OR careful tokenizing regex that distinguishes `<!-- spec-id: ... -->` HTML comments from prose mentions; bare-grep would false-positive on prose. The plan-side scan uses heading-delimited block extraction (`^### Task N\.M:` to next `### `), NOT a bare grep of the entire markdown.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [x] Amendment 1 — `listForRepo` recovery contract — **N/A — M8-only** (X.6's traceability matrix asserts the amendment block is MAPPED via spec-id slug, but does NOT itself re-implement the amendment).
- [x] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8-only** (same: asserts mapped).
- [x] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8-only** (same: asserts mapped).

**NEW (in-scope for X.6):**

- **AC-X.5 body ↔ AC-X.6 required-checks-list reconciliation** — IF Codex's R1 ships the spec amendment renaming `x5-rls-coverage` → `x5-email-canonicalization` in spec §17.2 lines 2831/3677/3681 + plan `11-cross-cutting.md:2057,2167,2181,2289,2297`, the amendment is part of X.6's commit range and MUST cite the X.5 convergence log as the surfacing source. IF Codex's R1 leaves the drift in place (surfaced but not patched), the amendment lands as a follow-up after X.6 closes. Convergence log records which path.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0..M10 closed. X.1 closed at `2090dc2`. X.2 closed at `84af646`. X.3 closed at `d4775f9`. X.4 closed at `a6bb529`. X.5 closed at `d026919` (R2 APPROVE; fix commit at `fae5485`; milestone base `a6bb529`). M11 Phase C R2 in flight (most recent commits: `0a27df2` `_metaTimeHelpersRequireNow.test.ts`; `4d257e1` `formatRelative` refactor). M11 Phase C's surface (time helpers + admin allowlist) does NOT touch X.6's traceability / branch-protection / cross-cutting-parity surfaces.
- [x] **Pre-flight tests passing in isolation**:
  - `pnpm lint` exits 0 (5-warning baseline from X.4/X.5 carries forward).
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0.
  - `pnpm test:audit:x1-catalog-parity` exits 0.
  - `pnpm test:audit:x2-no-raw-codes` exits 0.
  - `pnpm test:audit:x3-trust-domain` exits 0 (28 tests).
  - `pnpm test:audit:x4-no-global-cursor` exits 0.
  - `pnpm test:audit:x5-email-canonicalization` exits 0 (9/9 + 6 negative-regression fixtures).
  - `pnpm test tests/admin/no-inline-email-normalization.test.ts` exits 0 (M3 meta-test green after X.5's `AUDITED_PATHS` extension).
- [x] **Specific files present from prior milestones**:
  - `lib/email/canonicalize.ts` (M1).
  - `lib/audit/admin-tables.generated.ts` + `lib/audit/watermark-symbols.generated.ts` + `lib/audit/email-boundaries.generated.ts` (X.3/X.4/X.5 manifests). X.6 reads these as parity inputs.
  - `scripts/generate-admin-tables.ts` + `scripts/extract-watermark-symbols.ts` + `scripts/extract-email-boundaries.ts` (X.3/X.4/X.5 extractors). X.6 follows the same generator pattern for `scripts/generate-traceability.ts`.
  - `lib/audit/authChain.ts` + `lib/audit/trustDomains.ts` + `lib/audit/protectedRoutes.ts` + `lib/audit/authPrimitives.ts` + `lib/audit/noGlobalCursor.ts` + `lib/audit/emailCanonicalization.ts` (X.3–X.5 audit libraries).
  - `lib/messages/__internal__/walkSourceFiles.ts` (X.1) — X.6 reuses for any TS-source enumeration (NOT used for the traceability walker itself — that walks markdown).
  - `.github/workflows/x-audits.yml` (X.1–X.5 shipped) — X.6 EXTENDS with `traceability-audit`, `verify-branch-protection`, `verify-branch-protection-status` jobs + adds `schedule:` cron trigger.
  - `tests/cross-cutting/auth.test.ts` + `tests/cross-cutting/no-global-cursor.test.ts` + `tests/cross-cutting/email-canonicalization.test.ts` (X.3/X.4/X.5 tests) — must stay green.
  - `docs/superpowers/specs/amendments/*` — out-of-band amendment files (M9 C9 admin-allowlist-runtime-mutable + 2026-05-12 catalog-agenda-codes). The walker MUST recognize these per M9 C9's convention.
- [x] **NEW X.6 deliverables**:
  - `scripts/generate-traceability.ts` — walks spec headings + spec-id anchors + AC rows + plan task blocks; parses `<!-- coverage: ... -->` markers; emits `docs/superpowers/plans/coverage.md`.
  - `scripts/verify-branch-protection.ts` — privileged drift-detector. Reads `GH_APP_TOKEN` / `BRANCH_PROTECTION_PAT` + `SUPABASE_SECRET_KEY` / `SUPABASE_URL`; calls GitHub Branch Protection + Rulesets APIs; emits `BRANCH_PROTECTION_DRIFT` / `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` admin-alerts; writes `artifacts/branch-protection-report.json`.
  - `tests/cross-cutting/traceability.test.ts` — runs the generator + asserts all matrix invariants per §2 above.
  - `tests/cross-cutting/verify-branch-protection.test.ts` — mocks GitHub API + `upsert_admin_alert` RPC spy; 12 required mocked test cases per plan Task X.6 Step 3c plus a live Supabase smoke test for the real admin-alert producer path.
  - `tests/cross-cutting/fixtures/traceability/` — `good-all-anchors-covered.md`, `bad-missing-anchor.md`, `bad-anchor-without-coverage.md`, `bad-self-review-shouldnt-count.md`, plus AC-body-vs-list drift fixture pair.
  - `docs/superpowers/plans/coverage.md` — generator output (committed).
  - `.github/workflows/x-audits.yml` extension — `traceability-audit`, `verify-branch-protection`, `verify-branch-protection-status` jobs + `schedule:` cron trigger + `if: github.event_name != 'schedule'` guards on X.1–X.5 audit jobs.
  - `package.json` script entries: `gen:traceability`, `test:audit:traceability`, `test:audit:branch-protection`. `pretypecheck` / `prelint` / `pretest` / `prebuild` chained to X.3+X.4+X.5+X.6 generators.
  - **Optional spec amendment (in-scope for X.6 if Codex's R1 includes it)** — rename `x5-rls-coverage` → `x5-email-canonicalization` in spec §17.2 lines 2831/3677/3681 + plan `11-cross-cutting.md:2057,2167,2181,2289,2297`. Convergence log records the choice.
  - **One-time spec edit (prerequisite for the walker to operate)** — insert `<!-- spec-id: ... -->` HTML-comment anchors before every existing non-heading normative unit. Initial slug list per plan Task X.6 Step 1 prerequisite.
- [x] **DEFERRED.md** — no X.6 sub-items pre-listed. Findings on the live tree (spec drift, plan drift, workflow-YAML drift) are mechanical fixes landing in X.6 scope per memory `feedback_deferral_discipline.md`. The X.5-surfaced AC-body-vs-list drift IS in X.6 scope per AC-X.6's parity assertion contract.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (invariant 1) — always. Each fixture is failing-test-first; each parity assertion is failing-test-first.
- [ ] **Per-show advisory lock** (invariant 2) — **N/A.** X.6 makes no DB mutations except `admin_alerts.insert` via service-role client (no per-show lock surface).
- [ ] **Email canonicalization at boundary** (invariant 3) — **N/A for X.6's audit code itself; structurally enforced by X.5.** X.6 reads `lib/audit/email-boundaries.generated.ts` as a parity input.
- [ ] **No global cursor** (invariant 4) — **N/A for X.6's audit code; structurally enforced by X.4.**
- [ ] **No raw error codes in user-visible UI** (invariant 5) — **N/A for X.6's audit code; structurally enforced by X.2.** The `BRANCH_PROTECTION_DRIFT` / `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` codes are admin-log-only (see spec §12.4 lines 2831/2832 column "Crew-facing" = "—"); never rendered to a crew page.
- [x] **Commit per task** (invariant 6) — always. Conventional-commits: `<type>(<scope>): <summary>`. Suggested scopes: `audit`, `cross-cutting`, `scripts`, `test`, `ci`, `traceability`, `branch-protection`. Example commit sequence:
  - `docs(spec): insert spec-id anchors for non-heading normative units (X.6 prerequisite)`
  - `scripts(traceability): implement generate-traceability matrix walker (Task X.6 Step 1)`
  - `test(cross-cutting): traceability matrix invariants + regression fixtures (Task X.6 Step 2)`
  - `scripts(branch-protection): implement verify-branch-protection drift-detector (Task X.6 Step 3c)`
  - `test(cross-cutting): verify-branch-protection mocked API + admin_alerts spy (Task X.6 Step 3c)`
  - `ci(audits): wire traceability-audit + verify-branch-protection + reader jobs (Task X.6 Step 3a)`
  - `docs(spec): rename x5-rls-coverage → x5-email-canonicalization (X.5-surfaced drift)` ← OPTIONAL, only if Codex's R1 includes it
  - `chore(workflow-verification): capture bad-fixture PR evidence (Task X.6 Step 3b)`
- [x] **Spec is canonical** (invariant 7) — **X.6 IS the canonical structural enforcement.** The traceability walker, the cross-cutting parity assertions, and the AC-body-vs-list parity audit ALL derive from spec at audit-execution time. Hardcoded TS arrays anywhere in X.6 audit code are a P0.
- [ ] **UI quality gate / impeccable dual-gate** (invariant 8) — **N/A — no UI surface.** X.6 touches `scripts/`, `tests/cross-cutting/`, `.github/workflows/`, `docs/superpowers/specs/` (spec-id anchor insertion + optional rename), `docs/superpowers/plans/coverage.md` (generator output), `package.json`. No file under `app/` outside `app/api/**`, `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`.
- [x] **Supabase call-boundary discipline** (invariant 9) — **PARTIAL.** `scripts/verify-branch-protection.ts` emits global admin alerts through `supabaseAdmin.rpc("upsert_admin_alert", { p_show_id: null, p_code, p_context })`, matching the canonical recurrence pattern at `lib/adminAlerts/upsertAdminAlert.ts:35`. Per AGENTS.md §1.9, the helper destructures `{ data, error }`, distinguishes returned-error from thrown-error, and carries an inline `// not-subject-to-meta: <reason>` comment because this is a one-shot privileged CI script whose failure surface is the workflow-job exit code and JSON report.

## 6. Watchpoints from prior adversarial review

Pulled forward from X.1 R1–R3 + X.2 R1 + X.3 R1 + X.4 R1–R2 + X.5 R1–R2 close + 2026-05-19 memories. **18 watchpoints — X.6 is the largest cross-cutting task.**

1. **Derive from spec at audit-execution time, NOT from handoff arrays** (memory `feedback_audit_derives_from_spec_not_handoff.md`, codified 2026-05-19 from X.3's 21-vs-19 drift; honored in X.4 + X.5; **X.6 is the final form**). Every list X.6 compares (admin-only tables, watermark symbols, required-checks names, AC bodies, §16 task presence, spec-id anchor set) is parsed from spec/plan source at audit-execution time. Reviewer verifies that editing spec §4.3 / plan Task X.4 / plan Task X.6 + re-running the audit produces a diff in the audit output; reverting + re-running produces no diff. Hardcoded TS arrays anywhere are a P0.

2. **AST/markdown scoping, NOT substring grep** (X.2 residual, X.3 watchpoint, X.4 R1 P0-2 lesson, X.5 R1 P0-2). The traceability walker discriminates `<!-- spec-id: ... -->` HTML comments from prose mentions via a markdown parser OR a careful regex that's anchored on the HTML comment shape. The plan-side scan uses heading-delimited block extraction. A bare-grep approach is a P0.

3. **Plan-side coverage extraction excludes self-review / review-history / glossary** (per plan Task X.6 Step 1.4). The exclusion list is a P0 — counting prose mentions in those sections as coverage produces a false-zero `MISSING` result.

4. **Structured `<!-- coverage: ... -->` markers are the SOLE authoritative mapping** (per plan Task X.6 Step 1.5). Free-form prose mentions of spec anchors are NOT evidence. A task body that mentions `§5.2` without a `<!-- coverage: §5.2 -->` marker counts as MISSING for that anchor. Reviewer adds a synthesized plan task with a prose `§5.2` mention but no marker, confirms it counts as MISSING.

5. **Trust-boundary split is non-negotiable.** Privileged job runs ONLY on `push: main` + `schedule:`. Reader job runs on every `pull_request` + push and uses ONLY `GITHUB_TOKEN`. `pull_request_target` is NEVER used. Reviewer adds a synthesized YAML edit promoting privileged job to `pull_request:`, confirms the workflow-YAML parity assertion FAILS with `+privileged_on_pull_request:verify-branch-protection`. Reviewer adds a synthesized `pull_request_target:` usage anywhere in the workflow, confirms parity FAILS with `+pull_request_target_used`.

6. **8-day freshness window is the SLA.** The reader job's `AGE_SECONDS > 8 * 24 * 60 * 60` check fails closed → merges blocked when the privileged job has been broken for >8 days. That's intentional; the operator-escalation procedure (rotate GH App credentials / fix the privileged workflow within 8 days) is documented in spec §17.2.1 + the `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` admin-alert escalation field.

7. **Recursive-bootstrap property is intentional.** Privileged script asserts the reader is in the required-checks set; the reader asserts the privileged job succeeded recently. Removing either name from the required-checks list OR breaking the privileged job fails the merge gate within 8 days. Reviewer synthesizes both removals + confirms both surface.

8. **AC-body-vs-list parity audit catches the X.5-surfaced drift on first run.** The drift fixture is canonical. Reviewer verifies: with the spec in its CURRENT state (AC-X.5 body = email canonicalization; AC-X.6 list = `x5-rls-coverage`), the audit FAILS with `+ac_body_list_drift:AC-X.5`. With the spec amendment landed (both say `x5-email-canonicalization`), the audit PASSES. Both states are exercised via fixture or by transient git-stash during review.

9. **Drift-detector handles BOTH legacy branch-protection AND rulesets API models** (per plan Task X.6 Step 3c clause 2). Some orgs use the new Rulesets API instead of legacy branch protection; the script accepts either. Reviewer adds the `ruleset-only-happy-path` + `legacy-protection-happy-path` fixtures, confirms both pass cleanly.

10. **`BRANCH_PROTECTION_MONITOR_AUTH_FAILED` fires on ALL FOUR auth-failure shapes** (no-token, gh-app-token-401, pat-403, expired-token). Per plan Task X.6 Step 3c test list. Reviewer verifies each fixture independently fires the spy with the correct context payload.

11. **Same-vector recurrence rule** (memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`). If 3+ rounds surface findings on the same vector (e.g., "another parity assertion missed a list type"), ship a STRUCTURAL DEFENSIVE LAYER — likely a single `parseListFromSpec(specPath, sectionAnchor, listShape)` helper that ALL parity assertions consume, so a future list-shape addition only needs to add a call site, not re-derive a one-off parser.

12. **CI artifact-naming + freshness gates** (X.2 R1 codification carried forward). Canonical artifact pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}`. FOUR freshness gates run BEFORE the traceability audit step: `gen:admin-tables`, `gen:watermark-symbols`, `gen:email-boundaries`, `gen:traceability`. `pretypecheck`/`prelint`/`pretest`/`prebuild` chain all four.

13. **R1 finding-disagreement cap is 3; new bugs each round → keep iterating** (memory `feedback_iterate_until_convergence.md`). The cap is for SAME-FINDING disagreement loops, not for halting on new-bug rounds. X.6 is the most complex audit; budget for ≥2 rounds.

14. **Class-sweep before patching review findings** (memory `feedback_class_sweep_before_patch.md`). When review surfaces a single missed parity-assertion shape, grep the audit code for sibling parity-shapes BEFORE patching only the named site.

15. **Verify review findings against actual code site / spec / GitHub API spec** (memory `feedback_verify_review_findings_against_external_api_spec.md`). When adversarial review surfaces a finding about the GitHub Branch Protection API (e.g., "the script should also check X"), verify against the live GitHub REST API documentation before patching — Codex/Opus reviews can confidently misdiagnose external API semantics.

16. **Workflow-fails-on-bad-fixture verification (Step 3b) is the post-deployment proof.** Codex MUST push the throwaway `verify/x6-workflow-fails-on-bad-spec` branch, open the draft PR, capture the failing-check evidence in screenshots OR linked workflow-run URLs in the convergence log. Without this, the workflow's pass-state is unverified end-to-end.

17. **Complexity-hypothesis third data point.** Record in convergence log at what round Opus surfaces the first finding Codex self-review missed. X.6 is the most complex (three concurrent surfaces + GitHub API + secret handling). If R1 is APPROVE despite the complexity, the hypothesis ("heavy audits need ≥2 rounds") weakens substantially. If R1 is REQUEST_CHANGES, the hypothesis is confirmed across three data points (X.4, X.5, X.6) and codifies as memory `feedback_heavy_audit_milestones_budget_two_rounds.md`.

18. **Mocks-only tests are insufficient for audit / drift-detector scripts.** Every PR-required check whose CI manifestation is "run the script live against the real surface" MUST have at least one test that exercises the actual surface (real Supabase test client, real fetch shape, or checked-in fixture replay). X.6 R1's mocked `admin_alerts` insert spy missed both the non-existent `severity` column and the missing RPC recurrence contract; R2 pins the real Supabase `upsert_admin_alert` path with an idempotency smoke test.

## 7. Test commands

- **X.6 traceability audit:** `pnpm test tests/cross-cutting/traceability.test.ts` (or `pnpm test:audit:traceability` after the package.json script entry lands).
- **X.6 branch-protection audit:** `pnpm test tests/cross-cutting/verify-branch-protection.test.ts` (or `pnpm test:audit:branch-protection`).
- **Traceability generator idempotency:** `pnpm gen:traceability && git diff --exit-code docs/superpowers/plans/coverage.md` (if Codex chooses committed-and-freshness-gated path).
- **Existing X.1–X.5 gates remain green:** `pnpm test:audit:x1-catalog-parity && pnpm test:audit:x2-no-raw-codes && pnpm test:audit:x3-trust-domain && pnpm test:audit:x4-no-global-cursor && pnpm test:audit:x5-email-canonicalization`.
- **M3 meta-test (regression baseline):** `pnpm test tests/admin/no-inline-email-normalization.test.ts` — must stay green.
- **Type + lint + full test gate (final):** `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings (5-warning baseline from X.4/X.5 carries forward).
- **CI workflow check:** `.github/workflows/x-audits.yml` exposes jobs named `traceability-audit`, `verify-branch-protection`, `verify-branch-protection-status` verbatim. Privileged job gated to `push: main` + `schedule:`. Reader job runs on `pull_request` + `push` with only `GITHUB_TOKEN`. NO `pull_request_target` usage anywhere.
- **Privileged drift-detector live run** (NOT a CI assertion — operator runs ONCE after the workflow first lands on `main`): `GH_APP_TOKEN=… SUPABASE_SECRET_KEY=… SUPABASE_URL=… pnpm tsx scripts/verify-branch-protection.ts` — confirms the live GitHub API call succeeds + the branch-protection settings match the seven-name contract. If the manual admin step is not yet done, this exits non-zero with `+missing_check:<name>` diff (expected; the manual admin step lands AFTER this).
- **Workflow-fails-on-bad-fixture verification (Step 3b):** push `verify/x6-workflow-fails-on-bad-spec` branch, open draft PR, observe `traceability-audit` + at least one X.1–X.5 audit fail; capture URLs.

## 8. Exit criteria

- [ ] All sub-steps in `11-cross-cutting.md` Task X.6 (Steps 1, 2, 3, 3a, 3b, 3c, 4) checked off.
- [ ] AC-X.6 has at least one passing test asserting each named cross-cutting parity: §4.3 ↔ AC-2.5 admin-table; AC-X.4 watermark symbol-set; AC-body ↔ required-checks-list (with X.5 drift as inaugural fixture); workflow-YAML parity (freshness step + trust-boundary + pull_request_target ban); §16 task coverage; ParsedSheet/ParseResult split mapped; /40 lease_holder amendments mapped; every §12.4 code has a producer site.
- [ ] `scripts/generate-traceability.ts` derives the matrix from spec headings + spec-id anchors + AC rows + plan task blocks at audit-execution time. Hardcoded TS arrays in the audit code are a P0.
- [ ] `scripts/verify-branch-protection.ts` handles BOTH legacy branch-protection and rulesets API; auth-failure path emits `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` on all four shapes; drift emits `BRANCH_PROTECTION_DRIFT` with named-diff `failures` array.
- [ ] All ~5 traceability fixtures + the AC-body-vs-list drift fixture pair under `tests/cross-cutting/fixtures/traceability/` exist and behave as specified.
- [ ] All 12 mocked branch-protection test cases under `tests/cross-cutting/verify-branch-protection.test.ts` pass with anti-tautology assertions scoped to the RPC spy payload, and the live Supabase smoke test proves the default producer emits `BRANCH_PROTECTION_DRIFT` through `upsert_admin_alert` with `occurrence_count = 2` after two runs.
- [ ] **Negative regression verification** (memory `feedback_negative_regression_verification.md`): for EACH cross-cutting parity assertion (a)–(f) in §2, stash a synthesized production-side break, confirm the audit FAILS with the named diff, restore, confirm green. Document each stash SHA in the convergence log.
- [ ] CI exposes `traceability-audit` + `verify-branch-protection` + `verify-branch-protection-status` verbatim. Spot-check `.github/workflows/x-audits.yml`. Privileged job gated to `push: main` + `schedule:` only. Reader uses only `GITHUB_TOKEN`. No `pull_request_target` anywhere. Canonical artifact-naming pattern. ALL FOUR freshness gates (admin-tables, watermark-symbols, email-boundaries, traceability) before the audit step.
- [ ] `pretypecheck` / `prelint` / `pretest` / `prebuild` ALL chained to ALL FOUR generators (`gen:admin-tables` + `gen:watermark-symbols` + `gen:email-boundaries` + `gen:traceability`) in `package.json`.
- [ ] `coverage.md` committed at `docs/superpowers/plans/coverage.md`; idempotent (regen produces byte-identical output).
- [ ] One-time spec-id anchor insertion landed (initial slug set per plan Task X.6 Step 1 prerequisite).
- [ ] Workflow-fails-on-bad-fixture verification (Step 3b) evidence captured in convergence log (workflow-run URLs or screenshots showing `traceability-audit` failed + `x2-no-raw-codes` failed on the throwaway branch).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings (5-warning baseline preserved).
- [ ] No new `// TODO` or `// FIXME` lines.
- [ ] **AC-X.5-body-vs-list drift disposition recorded in convergence log** — either (a) spec amendment landed in X.6 commit range with verbatim file:line citations, OR (b) drift surfaced as a finding for a follow-up amendment. NOT acceptable: silent rename of AC-X.5's body to match the list; silent dropping of the parity assertion.
- [ ] **Manual admin step recorded as follow-up** — the one-time branch-protection settings configuration (Settings → Branches → Branch protection rules → `main` → add all seven check names verbatim) is documented in the convergence log as a post-merge operator task. Subsequent runs of `scripts/verify-branch-protection.ts` programmatically verify it landed correctly.
- [x] Adversarial review converged to APPROVE at **R3** (2026-05-20, Opus reviewer; anchored to milestone base `d026919`; zero new findings; H1-4 closed structurally; R2 closures preserved intact). Three-round history: R1 APPROVE 2026-05-19 → retroactively REVERSED 2026-05-20 (3 P0s) → R2 APPROVE 2026-05-20 (`8f7d2de`) → R3 APPROVE 2026-05-20 (`41b3576`). See convergence-log §"Round 3 repair (Codex)" + §"Round 3 — APPROVE".
- [ ] All commits follow `<type>(<scope>): <summary>` format with one logical task per commit.
- [ ] Convergence log at the bottom of this file is filled in with R1 + any subsequent rounds + complexity-hypothesis third data point.

## 9. Sandbox / git protocol

- [x] **Codex CLI with relaxed sandbox** — verified working through X.1 / X.2 / X.3 / X.4 / X.5. Commits run in-session.
- **Invocation discipline (memory `feedback_codex_exec_needs_stdin_closed.md`):** every `codex exec` invocation must close stdin (`< /dev/null`); monitor worker CPU% — 0.0% for 2+ minutes signals a stdin hang.
- **Job-status string** (memory `feedback_codex_companion_status_completed_string.md`): codex-companion terminal status is `"completed"` (past tense), NOT `"complete"`.
- **Monitor over wakeup-polling** (memory `feedback_use_monitor_for_async_codex_jobs.md`): for long-running adversarial-review jobs, use Monitor on the job log file instead of chained ScheduleWakeups.

## 10. Adversarial review handoff

1. Implementer (Codex) summarizes deliverables, AC sub-criteria satisfied, the AC-X.5-body-vs-list drift disposition (amendment-landed vs surfaced-for-followup), the workflow-fails-on-bad-fixture evidence (Step 3b URLs), and any traceability/branch-protection drift the audit surfaced on the live tree (with fix-commit SHAs or DEFERRED.md routing).
2. Adversarial reviewer (Opus / Claude Code) invoked. Suggested invocation:
   ```
   /codex:adversarial-review --background --base d026919 "X.6 traceability + branch-protection + cross-cutting parity audit (single-implementer Codex backend + CI plumbing) — see handoff §6 watchpoints + §8 exit criteria. Focus on: traceability walker spec-id discrimination (markdown parser, not bare grep); plan-side coverage extraction excludes self-review/review-history/glossary; <!-- coverage: --> markers are sole authoritative mapping; trust-boundary split is non-negotiable (privileged push+schedule only; reader uses only GITHUB_TOKEN; no pull_request_target); 8-day freshness window; recursive-bootstrap property; AC-body-vs-list parity catches X.5-surfaced drift on first run; drift-detector handles BOTH legacy branch-protection AND rulesets API; BRANCH_PROTECTION_MONITOR_AUTH_FAILED fires on all four auth-failure shapes; workflow-fails-on-bad-fixture evidence is captured."
   ```
3. Reviewer iterates until APPROVE (memory `feedback_iterate_until_convergence.md`).
4. Per-round routing: X.6 is single-implementer Codex; almost every finding is Codex's. Exceptions surface to orchestrator: spec-amendment decisions (the AC-X.5-body-vs-list rename routing decision is Codex's call but Opus may flag follow-up amendments needed); operator-side manual admin step (out of codebase ownership — recorded as follow-up).
5. Class-sweep before patching (memory `feedback_class_sweep_before_patch.md`): when review surfaces a single missed parity-assertion shape, grep the audit code for sibling parity-shapes BEFORE patching only the named site.
6. **R2+ anchor to milestone base, not R1 fix-base** (memory `feedback_adversarial_review_full_milestone_scope.md`). R2 anchors `--base d026919` (X.5 close-out SHA), NOT the R1 fix commit.
7. **Lead with fresh-eyes whole-diff audit; prior-findings checklist secondary** (memory `feedback_review_prompt_fresh_eyes_first.md`). R2+ review prompts open with whole-diff watchpoint audit (especially W1, W2, W3, W4, W5, W8 from §6) BEFORE walking the R1 finding-closure checklist.
8. **Complexity-hypothesis third data point** (X.4 + X.5 retrospective): record in convergence log at what round Opus surfaces the first finding Codex self-review missed. X.6 is the MOST COMPLEX of the X.* set (three concurrent surfaces + GitHub API + secret handling + spec amendment surfacing). If R1 is APPROVE despite this, hypothesis weakens; codify nothing. If R1 is REQUEST_CHANGES, hypothesis confirmed across X.4/X.5/X.6; codifies as `feedback_heavy_audit_milestones_budget_two_rounds.md`.
9. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies

- **X.1 closed** (`2090dc2`). **X.2 closed** (`84af646`). **X.3 closed** (`d4775f9`). **X.4 closed** (`a6bb529`). **X.5 closed** (`d026919`). X.6 inherits the canonical artifact-naming pattern, the `*.generated.ts` manifest pattern, the freshness-gate CI shape, the `walkSourceFiles` helper, ts-morph + Supabase-introspection toolchains, and the convention of `pretypecheck`/`prelint`/`pretest`/`prebuild` chaining all X.* generators.
- **M9 C9 / `docs/superpowers/specs/amendments/` convention** — the spec amendments directory is one of two amendment landing sites (the other being inline spec edits). The traceability walker MUST recognize amendments at both locations (inline in `2026-04-30-fxav-crew-pages-design.md` AND files under `docs/superpowers/specs/amendments/`). Pre-existing files: `2026-05-12-catalog-agenda-codes.md`, `2026-05-14-admin-allowlist-runtime-mutable.md`.
- **M11 (formerly M12) — user-facing docs design** — spec at `docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`. Adds new spec anchors (Phase A/B/C/D) the traceability walker MUST walk. M11 Phase C R2 is in flight in parallel with X.6; the surfaces don't overlap (Phase C touches time helpers + admin allowlist; X.6 touches scripts/, tests/cross-cutting/, .github/workflows/, package.json, spec/plan-anchor insertion). Phase C's commits are NOT a precondition for X.6 starting; X.6's traceability walker treats whatever spec/plan state exists at HEAD as the input.
- **M2 admin_alerts catalog** — X.6 ships producer sites for two existing §12.4 codes (`BRANCH_PROTECTION_DRIFT` + `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`). The catalog entries already exist in spec §12.4 lines 2831/2832 (carried in via Task X.6 plan-time spec edits). X.6 inserts the producer sites; the catalog-completeness meta-test (if extended in X.6 — see §13) confirms the codes have producers.
- **M8 report-pipeline amendments** — the three §13.2.3 amendments (listForRepo recovery contract; created_at horizon + lease-expired reaper predicate; lease_holder ownership protocol) are mapped via spec-id anchors per plan Task X.6 Step 1 prerequisite slug list. X.6 does not re-implement them; just asserts they're MAPPED to owning tasks via `<!-- coverage: -40-reports-lease-amendment -->` markers in M8 plan tasks.
- **Manual admin step is out-of-codebase** — the one-time branch-protection settings configuration in GitHub Settings is documented in the X.6 commit body + convergence log as an operator follow-up; the workflow file alone does not configure protection. Subsequent runs of `scripts/verify-branch-protection.ts` (privileged) programmatically verify it landed correctly.
- **After X.6 APPROVED, FXAV crew-pages v1 X.* set is structurally complete.** M11 continues independently. Future spec amendments add new anchors that the walker picks up automatically; new audit surfaces would be future X.7+ tasks (none planned).

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**N/A — no UI surface.** X.6 ships scripts, generated coverage matrix markdown, Vitest meta-tests, regression fixtures, a CI workflow extension, spec-id anchors, and (optionally) a spec amendment. No file under `app/` (outside `app/api/**`), `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`. The dual `/impeccable critique` + `/impeccable audit` gate does not apply.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

Declared at handoff time per memory `feedback_meta_test_at_plan_time_not_round_n.md`.

- [ ] **Supabase call-boundary discipline** — **PARTIAL.** `scripts/verify-branch-protection.ts` invokes `supabaseAdmin.from('admin_alerts').insert(...)`. EITHER add a row to `tests/auth/_metaInfraContract.test.ts` OR carry an inline `// not-subject-to-meta: <reason>` comment (likely justified — one-shot CLI script, failure surface IS the workflow-job exit code). Codex picks and records the choice.
- [ ] **Sentinel hiding in optional text** — **N/A.** X.6 doesn't render.
- [x] **`admin_alerts` catalog completeness** — `tests/messages/_metaAdminAlertCatalog.test.ts` — required because X.6 ships producer sites for two §12.4 codes (`BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`). Both already have catalog rows in spec §12.4 lines 2831/2832; X.6 ships the PRODUCER. The catalog-completeness meta-test should already register both codes as having non-null `dougFacing` (operator-only) entries. Verify during implementation; add producer-site references if the meta-test tracks producer-presence.
- [ ] **Advisory-lock topology** — **N/A.** X.6 makes no `pg_advisory*` calls.
- [ ] **No-inline-email-normalization** — **N/A** (X.5 owns; X.6 doesn't read emails from external surfaces).
- [x] **CREATE: traceability matrix walker meta-test** (`tests/cross-cutting/traceability.test.ts`) — walks every spec heading + every spec-id anchor + every plan task block; asserts the cross-cutting parity assertions enumerated in §2. Concrete failure modes: (a) a future spec edit adds an unmarked normative non-heading unit — `UNANCHORED_NORMATIVE_UNIT` finding; (b) a future plan task lacks a `<!-- coverage: ... -->` marker — `MISSING_ANCHOR` finding; (c) a future spec amendment adds a row to §4.3 without propagating to AC-2.5 — `+missing_in_ac25` named diff; (d) a future spec edit drifts AC body away from required-checks-list name — `+ac_body_list_drift` named diff.
- [x] **CREATE: branch-protection drift-detector meta-test** (`tests/cross-cutting/verify-branch-protection.test.ts`) — 12 mocked GitHub API + admin_alerts spy cases. Concrete failure modes: any future weakening of `enforce_admins` / `dismiss_stale_reviews` / `allow_force_pushes` / required-check-set fires the appropriate named diff; auth-failure on any of four shapes fires `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` with the correct context payload.
- [x] **CREATE: traceability generator** (`scripts/generate-traceability.ts`) — emits `docs/superpowers/plans/coverage.md`. Concrete failure mode: a spec edit that adds a new section without a `<!-- spec-id: ... -->` anchor produces `UNANCHORED_NORMATIVE_UNIT` finding; a plan task without a coverage marker produces `MISSING` row.
- [x] **CREATE: 5+ traceability regression fixtures + drift fixture pair** (`tests/cross-cutting/fixtures/traceability/`) per §2.
- [x] **EXTEND: tests/cross-cutting/auth.test.ts** — must stay green. X.6 does NOT refactor X.3 audit code.
- [x] **EXTEND: tests/cross-cutting/no-global-cursor.test.ts** — must stay green. X.6 does NOT touch X.4 audit code.
- [x] **EXTEND: tests/cross-cutting/email-canonicalization.test.ts** — must stay green. X.6 does NOT touch X.5 audit code (reads `lib/audit/email-boundaries.generated.ts` as a parity input only).

---

## Convergence log

### Implementation ready for adversarial review

Implementation SHA: `4a8c242` (`feat(audit): implement X.6 traceability and branch protection gates`).

Commit sequence:
- `4a8c242` — X.6 traceability matrix generator + fixtures, branch-protection drift detector + mocked GitHub/admin-alert tests, X audit workflow extension, spec-id coverage anchors, X.5 required-check rename amendment, and `coverage.md` generation.

AC sub-criteria satisfied:
- Traceability walker: `scripts/generate-traceability.ts` walks heading anchors, line-anchored `<!-- spec-id: ... -->` comments, AC rows, and structured `<!-- coverage: ... -->` markers only. Free-form prose mentions are fixture-tested as non-coverage. `docs/superpowers/plans/coverage.md` is committed and regenerated by `pnpm gen:traceability`.
- Cross-cutting parity: `tests/cross-cutting/traceability.test.ts` asserts live-tree clean output plus §4.3 admin-table parity, AC-X.4 watermark parity, AC body ↔ required-check-list parity, workflow trust-boundary/freshness parity, and the `pull_request_target` ban.
- Branch protection: `scripts/verify-branch-protection.ts` parses required check names from spec AC-X.6 at runtime, supports legacy branch protection and rulesets API, emits `BRANCH_PROTECTION_DRIFT` for policy drift and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` for no-token / 401 / 403 / expired-token shapes. `tests/cross-cutting/verify-branch-protection.test.ts` has 12 mocked API cases with spy-payload assertions.
- CI plumbing: `.github/workflows/x-audits.yml` exposes `traceability-audit`, `verify-branch-protection`, and `verify-branch-protection-status`; schedule is `0 9 * * 1`; X.1-X.5 jobs skip schedule; privileged job runs only on `push` / `schedule`; reader uses only `GH_TOKEN: ${{ github.token }}`.

AC-X.5 body-vs-list drift disposition: amendment landed in `4a8c242`. Spec §12.4 branch-protection row now names `x5-email-canonicalization` at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2839`; AC-X.6 required-check list now names `x5-email-canonicalization` at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3693`; plan Task X.6 usages now name `x5-email-canonicalization` at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md:2060`, `:2062`, `:2172`, `:2186`, `:2294`, and `:2302`. I did not alter AC-X.5's body to match the stale list; the list was corrected to match the canonical AC-X.5 body.

Negative-regression probes:
- AC-X.5 body/list drift: stash object `1cd350c3c2ec643fdbd9e9d6c288447c05904bc8`; `pnpm test:audit:traceability` failed with `+ac_body_list_drift:AC-X.5 expected=x5-email-canonicalization actual=x5-rls-coverage` and `+missing_job:x5-rls-coverage`; restored and confirmed green.
- Workflow trust-boundary drift: stash object `f16fc0afb8d8bd6d45386813b9880695280d7688`; `pnpm test:audit:traceability` failed with `+pull_request_target_used`; restored and confirmed green.
- Admin-table parity drift: stash object `dbe09eecf49981cf3ceb11f58449c782e3fa71e0`; `pnpm test:audit:traceability` failed with `+missing_in_ac25:shows_pending_changes`; restored and confirmed green.
- AC-X.4 watermark parity drift: stash object `bbde979a325e6d2ce1c62d698f32eb9c4061bae7`; `pnpm test:audit:traceability` failed with `+missing_authoritative_in_plan:pending_syncs.staged_id` / `-extra_authoritative_in_plan:pending_syncs.staged_identifier`; restored and confirmed green.

Workflow-fails-on-bad-fixture evidence:
- Draft PR: https://github.com/edweiss412/FX-Webpage-Template/pull/1
- Workflow run: https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26137112146
- `traceability-audit` failed as expected: https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26137112146/job/76874626728
- The same bad spec also tripped downstream audit jobs (`x1-catalog-parity`, `x4-no-global-cursor`, `x5-email-canonicalization`) because the intentional global `x5-email-canonicalization` → `x5-rls-coverage` mutation changed spec text consumed by those audits. `verify-branch-protection-status` failed because no successful privileged main run exists yet, which is expected before the post-merge manual/admin bootstrap.
- The throwaway PR and remote branch were closed/deleted after evidence capture; the workflow run and closed PR remain available for review.

Verification gate:
- `pnpm gen:admin-tables && git diff --exit-code lib/audit/admin-tables.generated.ts`: pass.
- `pnpm gen:watermark-symbols && git diff --exit-code lib/audit/watermark-symbols.generated.ts`: pass.
- `pnpm gen:email-boundaries && git diff --exit-code lib/audit/email-boundaries.generated.ts`: pass.
- `pnpm gen:traceability && git diff --exit-code docs/superpowers/plans/coverage.md`: pass.
- `pnpm test:audit:x1-catalog-parity`: 9 files / 104 tests pass.
- `pnpm test:audit:x2-no-raw-codes`: 17 tests pass.
- `pnpm test:audit:x3-trust-domain`: 28 tests pass.
- `pnpm test:audit:x4-no-global-cursor`: 13 tests pass.
- `pnpm test:audit:x5-email-canonicalization`: 15 tests pass.
- `pnpm test:audit:traceability`: 5 tests pass.
- `pnpm test:audit:branch-protection`: 12 tests pass.
- `pnpm verify:spec-amendment`: pass.
- `pnpm typecheck`: pass.
- `pnpm lint`: pass with the established 5-warning baseline.
- `pnpm test`: 270 files passed, 1 skipped; 3634 tests passed, 5 skipped.

Manual admin step follow-up: after this lands on `main` and the workflow has one successful trusted run, an admin must navigate to GitHub repository Settings → Branches → Branch protection rules → `main`, enable "Require status checks to pass before merging", and add all seven names verbatim: `traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`, `verify-branch-protection-status`. If skipped or later reverted, the privileged detector emits `BRANCH_PROTECTION_DRIFT`.

Complexity-hypothesis self-assessment: I expect Opus to find at least one R1 issue because X.6 combines spec-prose derivation, markdown/plan parsing, GitHub API semantics, and workflow trust-boundary logic. I caught and repaired one self-review issue before close-out: required check names were initially hardcoded in TS and are now parsed from spec AC-X.6 at audit/runtime.

### Adversarial review

#### Round 1 retroactive REVERSAL — REQUEST_CHANGES (2026-05-20, Opus reviewer, post-live-integration discovery)

**TL;DR:** The R1 APPROVE recorded below was **retroactively reversed on 2026-05-20** when the operator-bootstrap step (handoff §8 "Privileged drift-detector live run" — marked "operator runs once after workflow first lands on main") surfaced three findings the R1 mocked-only review methodology could not have caught. The R1 verdict has been preserved below for archival; treat the **REVERSAL block here as authoritative** until R2 closes.

**Trigger event.** Empty-commit `f4a7688` pushed to main 2026-05-20 02:36 UTC triggered workflow run `26137802521` with all three secrets (`GH_APP_TOKEN`/`BRANCH_PROTECTION_PAT`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`) freshly landed. The privileged `verify-branch-protection` job crashed at `scripts/verify-branch-protection.ts:259` with `UnhandledPromiseRejection: "#<Object>"` — no admin-alert emitted, no JSON report written, exit code 1. Log: https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26137802521/job/76876655649.

**Verdict:** REQUEST_CHANGES. **3 P0 findings.** Mocked tests pass; live integration breaks.

##### P0-1: `void main()` swallows the actual error

**Site:** `scripts/verify-branch-protection.ts:258-260`:
```ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
```
**Failure mode.** `void main()` silently swallows promise rejections from `verifyBranchProtection()` and `defaultInsertAdminAlert()`. The live run surfaced this as `UnhandledPromiseRejection` with no context — no admin-alert emission, no JSON report, no useful error text. The spec contract at §17.2.1 says auth failure / drift "is treated as an alertable control failure" — the script's actual behavior is "crashes silently."

**Canonical fix shape:**
```ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[verify-branch-protection] unhandled error:", error);
    process.exitCode = 1;
  });
}
```

##### P0-2: Script uses raw `.insert()` with non-existent `severity` column instead of canonical `upsert_admin_alert` RPC

**Sites:** 
- `scripts/verify-branch-protection.ts:50` — `supabase.from("admin_alerts").insert(payload)`
- `scripts/verify-branch-protection.ts:9-13` — `AlertPayload` type declares `severity: "high"` field
- All callers populating `severity: "high"` on the insert payload throughout the script

**Failure mode.** The `admin_alerts` table schema at `supabase/migrations/20260501001000_internal_and_admin.sql:268-278` defines columns `{id, show_id, code, context, raised_at, last_seen_at, occurrence_count, resolved_at, resolved_by}`. **No `severity` column exists.** The insert would fail with a Postgres `column "severity" of relation "admin_alerts" does not exist` error. Even if `severity` is silently ignored by PostgREST, the raw `.insert()` bypasses the canonical idempotency contract — running the script twice on the same drift hits the partial unique index `admin_alerts_one_unresolved_idx` (`coalesce(show_id::text, ''), code` WHERE `resolved_at is null`) and the second insert fails.

The canonical pattern across the entire codebase (verified via grep across `lib/`, `scripts/`, `app/`) is **`lib/adminAlerts/upsertAdminAlert.ts:35`** which calls:
```ts
supabase.rpc("upsert_admin_alert", {
  p_show_id: <uuid or null>,
  p_code: <code>,
  p_context: <jsonb>,
});
```

The RPC is defined at `supabase/migrations/20260505000000_upsert_admin_alert.sql:3-21` with idempotency built in: `ON CONFLICT ... DO UPDATE SET last_seen_at = now(), occurrence_count = occurrence_count + 1, context = excluded.context`. **Every other admin-alert producer in the codebase uses this RPC.** The X.6 script is the only divergent caller.

**Canonical fix shape:**
1. Update `AlertPayload` type to drop `severity` field; rename to match the RPC argument names (`p_show_id`, `p_code`, `p_context`).
2. Replace `defaultInsertAdminAlert` body with `supabase.rpc("upsert_admin_alert", { p_show_id: null, p_code: payload.code, p_context: payload.context })` (note: `show_id: null` because BRANCH_PROTECTION_* alerts are global, not per-show — consistent with the global slot in the unique index).
3. Update all 12 test fixtures in `tests/cross-cutting/verify-branch-protection.test.ts` to assert against `.rpc("upsert_admin_alert", ...)` shape, NOT `.from("admin_alerts").insert(...)`.
4. Drop the `severity` field from every test assertion that checks payload shape.

##### P0-3: Plan Task X.6 Step 3c clause 4 prescribes the broken pattern verbatim — spec needs amendment

**Site:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md:2303-2313`:
```ts
await supabaseAdmin.from("admin_alerts").insert({
  code: "BRANCH_PROTECTION_DRIFT",
  context: {
    failures: failedAssertions,
    repo: `${owner}/${repo}`,
    ts: new Date.toISOString(),
  },
  severity: "high",
});
```
**Failure mode.** The plan prescribes the exact broken pattern the script implements. Codex correctly followed the plan; the plan was wrong. The 12 mocked test cases asserted against the broken shape because they read the plan as the source of truth. R1 review didn't catch it because the watchpoints didn't include "test against live schema" or "use canonical admin-alert pattern."

**Canonical fix shape:** amend the plan Task X.6 Step 3c clause 4 verbatim to prescribe `supabase.rpc("upsert_admin_alert", { p_show_id: null, p_code: ..., p_context: ... })`. Cite `lib/adminAlerts/upsertAdminAlert.ts:35` as the canonical pattern. No spec body amendment needed (AC-X.6 / §17.2.1 don't prescribe the insert mechanism; the spec body talks about the alert code emission, not the API call shape).

##### Meta-test gap exposed (NOT a finding, but the root cause of why R1 missed P0-1/P0-2/P0-3)

Handoff §13 N/A'd Supabase call-boundary discipline with the rationale "likely justified — one-shot CLI script, failure surface IS the workflow-job exit code." That rationale was wrong: the script is a producer site for `admin_alerts` rows and is subject to the **canonical-producer-pattern** discipline established by `lib/adminAlerts/upsertAdminAlert.ts`. The cure for the recurring class is a structural meta-test that asserts **every admin-alert producer in the codebase calls `upsert_admin_alert` RPC, not raw `.insert("admin_alerts")`** (i.e., extends `tests/messages/_metaAdminAlertCatalog.test.ts` with a "producer pattern" check, or creates a sibling `tests/messages/_metaAdminAlertProducer.test.ts`).

This is the structural defensive layer that would have caught P0-2 at the X.6 R1 round. Per memory `feedback_meta_test_at_plan_time_not_round_n.md`, the meta-test should land as part of R2 repair — NOT deferred. Without it, future admin-alert producers can re-introduce the same drift.

##### Live-integration smoke test (NEW, MUST be added as part of R2 repair)

The mocked-only test methodology is the proximate cause of all three findings landing at the live-integration stage. R2 MUST add an integration smoke test that:

1. Runs against a real Supabase test client (the same harness `tests/cross-cutting/email-canonicalization.test.ts` Layer 3 uses for `pg_get_constraintdef` introspection).
2. Calls `verifyBranchProtection({ env: { GH_APP_TOKEN: '<test-token>', GITHUB_REPOSITORY: 'test/repo' }, fetchImpl: <real-fetch-shape mock that returns 404 to force drift path>, insertAdminAlert: <undefined-so-default-runs> })`.
3. Asserts an `admin_alerts` row with `code='BRANCH_PROTECTION_DRIFT'` exists post-call.
4. Runs idempotency check: invokes again, asserts the row's `occurrence_count = 2` (proving the RPC upsert path works).

##### Complexity-hypothesis third data point — REVERSED → STRENGTHENED

Per the X.5 close-out, the complexity-hypothesis third data point was provisional pending X.6's outcome. The R1 APPROVE conclusion ("X.6 closed at R1 despite being the heaviest of the X.* set → hypothesis weakens") was based on test methodology that didn't exercise the actual integration. With the retroactive REVERSAL, the data points now read:

- X.4: 2 rounds (live integration via project-tree audit).
- X.5: 2 rounds (live integration via Postgres introspection at Layer 3 + 4).
- **X.6: 2 rounds (live integration via GitHub REST + Supabase admin_alerts producer — surfaced retroactively).**

Three consecutive data points all confirming heavy-audits-with-live-integration-surfaces need ≥2 rounds. **Memory `feedback_heavy_audit_milestones_budget_two_rounds.md` IS warranted to codify**, with the refined framing: "the round-count predictor is not raw complexity but the presence of a live-integration surface (DB, external API, file system effects) that mocks cannot exercise; tests must include at least one path that runs against the real surface, or R1 APPROVE is tautological."

This is also a sibling memory candidate: `feedback_mocked_only_tests_invite_tautological_approve.md` — adversarial review of audit / drift-detector scripts MUST include a live-integration probe; mocks-only is insufficient.

##### Routing

Per memory `feedback_adversarial_review_repair_routing.md`: reviewer never fixes; route by file ownership. All three P0s are Codex's repair (scripts/, tests/, plan/) — no UI surface. Dispatch via `/codex:adversarial-review --fresh` with the verdict + finding text inlined; FIRST repair of a round uses `--fresh`.

**R2 review (post-repair) MUST exercise the live integration**, not just re-read the mocks. The handoff §6 watchpoint inventory inherits a new W18: "Mocks-only tests are insufficient for audit / drift-detector scripts. Every PR-required check whose CI manifestation is 'run the script live against the real surface' MUST have at least one test that exercises the actual surface (the same Supabase test client, an HTTP mock that matches the real fetch shape, or a checked-in fixture replay)."

#### Round 1 — APPROVE (2026-05-19, Opus reviewer) — RETROACTIVELY REVERSED

**Anchor:** milestone base `d026919` (X.5 R2 APPROVE close-out); review scope `4a8c242` (impl) + `ef483dc` (handoff close-out). M11 Phase C commits `7e789f5` + `c06352b` in the range explicitly excluded — those are M11 Phase C R3/R4 work on `tests/help/_metaTimeHelpersRequireNow.test.ts`, not X.6 territory.

**Verdict:** ~~APPROVE~~ **RETROACTIVELY REVERSED 2026-05-20.** ~~Zero P0 / H1 / P1 / P2 findings.~~ Three P0 findings landed at the live-integration step (see "Round 1 retroactive REVERSAL" block above). The closure-summary text below is preserved for archival but should be read as "what the mocks-only review observed," not "what the live integration confirmed."

**Fresh-eyes W1–W17 sweep:**

- **W1 derive-from-spec** ✓ — `loadRequiredChecksFromSpec()` parses spec at runtime; tests consume the returned array; no hardcoded check-name TS literals in audit code.
- **W2 markdown-parser scoping** ✓ — `scripts/generate-traceability.ts` walks spec headings + `<!-- spec-id: ... -->` HTML-comment anchors via anchored regex (not bare grep).
- **W3 plan-side exclusion list** ✓ — self-review / review-history / glossary / how-to-use / round-N-notes sections excluded from coverage extraction.
- **W4 `<!-- coverage: -->` is sole authoritative mapping** ✓ — free-form prose mentions don't count; fixture `plan-freeform-mention.md` verifies the negative case.
- **W5 trust-boundary split intact** ✓ — `verify-branch-protection` gated to `push || schedule` (`.github/workflows/x-audits.yml:269`); reader uses only `GH_TOKEN: ${{ github.token }}` (`:302`); `pull_request_target` absent across entire `.github/`. `parseWorkflowFindings` is a structural helper exercised against mutated-source fixtures.
- **W6 8-day freshness window** ✓ — `MAX_AGE_SECONDS=$((8 * 24 * 60 * 60))` at workflow `:326`.
- **W7 recursive-bootstrap** ✓ — privileged script asserts reader is in required-checks set; reader asserts privileged job succeeded recently.
- **W8 AC-body-vs-list catches X.5 drift on first run** ✓ — spec amendment landed verbatim; drift test reconstructs the old state via `String.replace` and asserts `+ac_body_list_drift:AC-X.5` (test lines 56–65); zero `x5-rls-coverage` matches in spec/plan body (preserved only in regression-test fixtures + historical handoff/BACKLOG).
- **W9 dual API support** ✓ — `legacyFailures` + `rulesetFailures` branches + both happy-path fixtures pass.
- **W10 all four auth-failure shapes** ✓ — `no-token`, `gh-app-token-401`, `pat-403`, `expired-token` all present (test line 167 `test.each`).
- **W11 same-vector recurrence rule** N/A — preconditions not met (no 3+ rounds at R1).
- **W12 CI artifact-naming + freshness gates** ✓ — canonical `<job>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}` on all new jobs; `pretypecheck`/`prelint`/`pretest`/`prebuild` chained to all four generators (`gen:admin-tables` + `gen:watermark-symbols` + `gen:email-boundaries` + `gen:traceability`).
- **W13 iterate until APPROVE** — review-meta; N/A.
- **W14 class-sweep before patching** N/A — no per-instance patches surfaced in R1.
- **W15 verify against external API spec** N/A — no GitHub API misdiagnosis surfaced.
- **W16 workflow-fails-on-bad-fixture evidence captured** ✓ — PR https://github.com/edweiss412/FX-Webpage-Template/pull/1; run 26137112146; failing `traceability-audit` job 76874626728. Throwaway branch + PR closed after capture.
- **W17 complexity-hypothesis data point** — **HYPOTHESIS WEAKENED.** X.6 R1 produced zero blocking findings despite being the heaviest of the X.* set. See `### Complexity-hypothesis data point` block below.

**Negative-regression verification:** The traceability + verify-branch-protection tests exercise positive + negative fixtures inline (spec mutation via `replace`; workflow mutation via `replace`; `legacyProtection` overrides for each drift case). Negative regressions live in source rather than as ephemeral stashes — acceptable per memory `feedback_negative_regression_verification.md` (the contract is "production-side break makes the audit fail," satisfied by the parameterized in-test mutations).

**12 branch-protection test cases — all present** with anti-tautology spy-payload assertions (`expect(insertSpy).toHaveBeenCalledWith({ code: 'BRANCH_PROTECTION_DRIFT', context: expect.objectContaining({ failures: expect.arrayContaining([diff]), repo: 'owner/repo' }), severity: 'high' })`): missing-check-name, insufficient-review-count, enforce-admins-disabled, strict-false, dismiss-stale-disabled, allow-force-push-enabled, legacy-protection-happy-path, ruleset-only-happy-path, no-token, gh-app-token-401, pat-403, expired-token.

**Spec-id anchor prerequisite** ✓ — 7/7 initial slugs inserted.

**Minor non-blocking observations (not findings, not blocking APPROVE):**

1. `expired-token` and `gh-app-token-401` fixtures are functionally identical (same env, same 401 response). Future hardening could distinguish via `WWW-Authenticate: ... error="invalid_token"` header or body marker, but the contract "alert fires on all four shapes" is met since both route through the same code path correctly.
2. `rulesetFailures` uses `bypass_actors.length > 0` as a proxy for `enforce_admins:false` — defensible for the Rulesets API model (no direct `enforce_admins` field) but worth a comment citing the GitHub API doc; not a correctness issue.

Both observations could be polished in a follow-up commit; neither is a regression risk and neither blocks X.6 close.

### Complexity-hypothesis data point — HYPOTHESIS WEAKENED, NOT CODIFIED

Three data points in series:

- **X.4** R1 REQUEST_CHANGES → R2 APPROVE. Semantic data-flow surface (no-global-cursor audit). R1 regressed to text-regex shortcuts where `sourceFromHelperCall` was contractually required.
- **X.5** R1 REQUEST_CHANGES → R2 APPROVE. DB introspection + cross-file boundary tracking (email canonicalization). R1 hardcoded TS literals where spec derivation was contractually required; name-string shortcuts in ts-morph symbol resolution.
- **X.6** R1 APPROVE. THREE concurrent surfaces (traceability walker + branch-protection drift-detector + cross-cutting parity assertions) + GitHub API integration + secret handling + spec amendment surfacing.

**X.6 is the heaviest of the three by every objective measure** (LOC delta, file count, integration partners, security-relevant code, external API surface) yet closed at R1 with zero blocking findings. The "heavy audits need ≥2 rounds" hypothesis does NOT codify as memory `feedback_heavy_audit_milestones_budget_two_rounds.md`.

**Better-supported generalization (NOT yet codified — needs more data points):** the round-count predictor for X.* audits may not be raw complexity but rather the presence of specific failure modes that text-regex and hardcoded-literal traps invite:

- X.4 R1's text-regex regression — pattern: implementer reaches for `string.includes` / regex when symbol resolution is contractually required. Avoidable via "ts-morph symbol resolution, not identifier-name regex" watchpoint upfront.
- X.5 R1's hardcoded-TS-literals trap — pattern: implementer hardcodes a list of names/checks instead of parsing the canonical source. Avoidable via "derive from spec at audit-execution time" watchpoint upfront.

Both X.4 and X.5 watchpoints were ADDED to handoff §6 BEFORE the next milestone fired. X.6's handoff inherited both plus 15 others (17 watchpoints total). The R1 APPROVE may reflect the cumulative watchpoint scaffolding working as intended: the pre-emptive self-audit specifically called out at handoff §6 watchpoint 8 ("highest-risk pre-emptable failure modes — verify before claiming done") may have closed the round-1-finding window for the THIRD-most-watchpoint-laden milestone in the series, not the LEAST complex.

**Recommendation:** do NOT codify either direction yet. Run M11 / M12 close-outs as additional data points. The pattern to watch: does pre-emptive watchpoint inheritance compound? Does a Codex implementation that inherits N+ watchpoints from prior milestones converge faster than one that doesn't, holding complexity constant? If yes, the codifying memory is `feedback_watchpoint_inheritance_compounds_convergence.md` (or similar), not `feedback_heavy_audit_milestones_budget_two_rounds.md`.

For X.6 specifically: this is a single APPROVE-at-R1 data point against complexity-predicts-rounds. Sufficient to leave the hypothesis uncodified; insufficient to inverse-codify "complexity does NOT predict rounds" (one counter-example is not a theory).

### AC-X.5-body-vs-list drift disposition

Landed in implementation commit `4a8c242`. Citations: spec §12.4 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2839`, spec AC-X.6 body at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3693`, and plan Task X.6 references at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md:2060`, `:2062`, `:2172`, `:2186`, `:2294`, `:2302`.

### Manual admin step follow-up

Post-merge operator task: Settings → Branches → Branch protection rules → `main` → enable "Require status checks to pass before merging" → add these seven required checks verbatim: `traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`, `verify-branch-protection-status`. The seventh check is the lightweight reader, not the privileged job. If this step is skipped or reverted, `scripts/verify-branch-protection.ts` emits `BRANCH_PROTECTION_DRIFT` with `+missing_check:<name>` in the admin-alert context.

### Round 1 repair (Codex)

**Repair commits:** `0fe229c` (`fix(audit): route branch-protection alerts through RPC`), `efedcba` (`test(messages): guard admin-alert producers against raw Supabase writes`), `e3a1faa` (`docs(plan): amend X.6 branch-protection alert producer contract`).

**Finding closure:**

- **P0-1 (`void main()` swallowed rejections):** fixed in `0fe229c`. `scripts/verify-branch-protection.ts:264-268` now calls `main().catch(...)`, prints `[verify-branch-protection] unhandled error:`, and exits 1.
- **P0-2 (raw `admin_alerts.insert` + bogus `severity`):** fixed in `0fe229c`. `scripts/verify-branch-protection.ts:9-19` models the RPC payload shape, `:54-59` calls `supabase.rpc("upsert_admin_alert", { p_show_id, p_code, p_context })`, and `tests/cross-cutting/verify-branch-protection.test.ts:142-203` asserts the mocked drift/auth cases against the RPC call shape with no `severity`.
- **P0-3 (plan prescribed broken insert):** fixed in `e3a1faa`. `11-cross-cutting.md:2307-2319` now prescribes `supabaseAdmin.rpc("upsert_admin_alert", { p_show_id: null, p_code, p_context })`, cites `lib/adminAlerts/upsertAdminAlert.ts:35`, and explicitly forbids the raw `admin_alerts.insert` shape.
- **Meta-test gap:** fixed in `efedcba`. `tests/messages/_metaAdminAlertProducer.test.ts:22-35` walks every TS/TSX file under `scripts/`, `lib/`, and `app/`, failing any non-allowlisted `.from("admin_alerts").insert(...)` or `.upsert(...)` producer.
- **Live-integration smoke test gap:** fixed in `0fe229c`. `tests/cross-cutting/verify-branch-protection.test.ts:206-238` uses the real Supabase service-role test client, forces drift through a 404/empty-rulesets GitHub fetch mock, then confirms the unresolved global `BRANCH_PROTECTION_DRIFT` row reaches `occurrence_count = 2` after two calls.
- **W18 watchpoint:** added in this handoff repair at §6 watchpoint 18. Future PR-required audit/drift-detector scripts must include at least one test exercising the real integration surface, not mocks only.

**Negative-regression verification:**

- **Producer meta-test:** stash `f9b58bcb75cce46e8c0bfa36361cf7d51b59bdfa` added `scripts/x6-negative-admin-alert-insert.ts` with a raw `.from("admin_alerts").insert(...)`. `pnpm vitest run tests/messages/_metaAdminAlertProducer.test.ts --reporter=verbose` failed with `scripts/x6-negative-admin-alert-insert.ts:4:raw_admin_alert_supabase_write`; after stashing the fixture, the same command passed.
- **Live smoke / RPC idempotency:** stash object `7b75107ad382636355945c48e6e0bfb64adac6c9` temporarily replaced the RPC producer with a raw `.from("admin_alerts").insert({ ..., severity: "high" })`. `pnpm test:audit:branch-protection` failed, including the live smoke error `Could not find the 'severity' column of 'admin_alerts' in the schema cache`; after restoring the RPC producer, `pnpm test:audit:branch-protection` passed.

**Verification gate output:**

- `pnpm test:audit:branch-protection` → 13/13 passing (12 mocked cases + live Supabase smoke).
- `pnpm vitest run tests/messages/_metaAdminAlertProducer.test.ts --reporter=verbose` → 1/1 passing.
- `pnpm typecheck` → clean.
- `pnpm lint` → clean with the existing 5-warning baseline only (`react-hooks/exhaustive-deps` + unused-var/unused-disable set unchanged).
- `pnpm test` → 271 files passed, 1 skipped; 3661 tests passed, 5 skipped.

**Ready for R2 review:** Codex repair is complete; do not configure the branch-protection required checks until Opus R2 converges because the bootstrap path was the live-integration failure surface.

#### Round 2 — APPROVE (2026-05-20, Opus reviewer)

**Anchor:** milestone base `d026919` (X.5 R2 APPROVE close-out) per memory `feedback_adversarial_review_full_milestone_scope.md` — NOT the R1 fix-base, so fresh-eyes drift outside the fix surface is detected. **Review scope:** `git diff d026919..8f7d2de` with M11 Phase C commits (`7e789f5`, `c06352b`, `648d22a`, `6c7e6de`) explicitly excluded.

**Verdict:** APPROVE. **Zero new findings.** All 3 R1-retroactive P0s closed structurally; meta-test + live-integration smoke test layers added per the canonical fix shape.

**Per-finding closure verification (file:line citations):**

- **P0-1 closed** — `scripts/verify-branch-protection.ts:264-268` wraps `main()` with `.catch((error) => { console.error(...); process.exitCode = 1; })`. The R1 `UnhandledPromiseRejection: "#<Object>"` failure mode is structurally impossible.
- **P0-2 closed** — `scripts/verify-branch-protection.ts:54-60` `defaultUpsertAdminAlert` calls `supabase.rpc("upsert_admin_alert", { p_show_id, p_code, p_context })` exactly matching `lib/adminAlerts/upsertAdminAlert.ts:35`. `AlertPayload` type at `:9-13` declares ONLY `{p_show_id, p_code, p_context}` — `severity` field eradicated. `// not-subject-to-meta:` comment at `:56` satisfies the AGENTS.md §1.9 registry rule.
- **P0-3 closed** — `11-cross-cutting.md:2307-2319` now prescribes the RPC verbatim with `lib/adminAlerts/upsertAdminAlert.ts:35` citation + explicit prohibition prose: "The raw `admin_alerts.insert` shape is forbidden here because it bypasses the partial-index recurrence contract and the table has no `severity` column."
- **Meta-test (whole-codebase structural defense) closed** — `tests/messages/_metaAdminAlertProducer.test.ts:22-35` walks `["scripts", "lib", "app"]` via `walkSourceFiles` from `lib/messages/__internal__/walkSourceFiles.ts`. Detection is code-shape-based (regex against `.from("admin_alerts").<insert|upsert>(...)` AST shape), not name-list. Allowlist is an empty `readonly` array — the only escape hatch is an explicit per-file justification. Per memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`.
- **Live-integration smoke test closed** — `tests/cross-cutting/verify-branch-protection.test.ts:206-238` calls `verifyBranchProtection` with the default Supabase service-role client (no `adminAlertClient` mock injection), then queries the real `admin_alerts` table via SQL, then re-invokes and asserts `occurrence_count = 2` — proving end-to-end RPC idempotency through the actual schema + partial unique index, not just spy assertions. Cleanup uses `.from("admin_alerts").delete()` which is correctly NOT a producer (the meta-test only flags `.insert(...)` / `.upsert(...)` patterns).

**Negative-regression verification (Codex's recorded stash SHAs spot-checked):**

- `f9b58bcb75cce46e8c0bfa36361cf7d51b59bdfa` (meta-test): adds `scripts/x6-negative-admin-alert-insert.ts` with raw `.from("admin_alerts").insert(...)`. Meta-test fails with `scripts/x6-negative-admin-alert-insert.ts:4:raw_admin_alert_supabase_write`. Restored → green.
- `7b75107ad382636355945c48e6e0bfb64adac6c9` (live smoke / RPC idempotency): temporarily replaces RPC producer with raw `.insert({ ..., severity: "high" })`. `pnpm test:audit:branch-protection` fails with `Could not find the 'severity' column of 'admin_alerts' in the schema cache`. Restored → green.

**Drift sweep (anchored to milestone base, NOT R1 fix-base):**

- Status banner at handoff line 1 accurate ("COMPLETED at R2 APPROVE on 8f7d2de").
- §8 exit-criteria checkbox flipped to `[x]` post-this-verdict — no premature flip during R2 execution.
- R1 retroactive REVERSAL block preserved as archival; R1 APPROVE block preserved with strike-through markers; new R2 APPROVE block appended below (not in lieu of). Convergence log integrity intact.
- W18 watchpoint added at handoff §6 lines 429 + 510 with the exact mandate prose.
- No incidental edits to `.github/workflows/x-audits.yml`, no incidental edits to the spec body, no incidental drift on the X.1-X.5 audit surfaces.

**Verification gate (Codex's recorded output, spot-checked structurally):**

- `pnpm test:audit:branch-protection` → 13/13 passing (12 mocked + 1 live smoke).
- `pnpm vitest run tests/messages/_metaAdminAlertProducer.test.ts --reporter=verbose` → 1/1 passing.
- `pnpm typecheck` → clean.
- `pnpm lint` → clean with X.5-baseline 5 warnings.
- `pnpm test` → 271 files passed / 1 skipped; 3661 tests passed / 5 skipped.

**Complexity-hypothesis third data point — CONFIRMED across X.4 R2, X.5 R2, X.6 R2:**

All three heaviest X.* milestones required two rounds. The round-count predictor is NOT raw audit complexity but the presence of a live-integration surface (DB introspection, external API, file-system effects) that mocked tests cannot exercise. Three corroborating data points. Codifies as:

- **`feedback_heavy_audit_milestones_budget_two_rounds.md`** — heavy audits with live-integration surfaces continue to need ≥2 rounds; budget the second round upfront.
- **`feedback_mocked_only_tests_invite_tautological_approve.md`** — sibling memory: adversarial review of audit / drift-detector scripts MUST include a live-integration probe; mocks-only is insufficient because the producer-against-real-schema contract is invisible to mocks. The R1 mocks-only review of X.6 missed all 3 P0s; the meta-test + live-integration smoke test landed in R2 are the structural defenses.

W18 also inherits forward to any future audit milestone: live-integration probe is mandatory for any PR-required check whose CI manifestation is "run the script live against the real surface."

**Closure summary:** All 3 R1-retroactive P0s closed structurally. Meta-test is whole-codebase, code-shape-based, allowlist-driven (not name-list). Live-integration smoke test exists and exercises the real Supabase service-role client + RPC + idempotency contract. Handoff status banner + exit criteria accurate. W18 added to §6 watchpoints. Complexity-hypothesis third data point CONFIRMED; both memories codify. The branch-protection bootstrap (handoff §8 operator step) is unblocked.

#### Round 3 — REQUEST_CHANGES (2026-05-20, post-bootstrap H1 surfaced during workflow run `26139070002`)

**Anchor:** milestone base `d026919` (X.5 R2 close-out). R2 APPROVE at `8f7d2de` closed all 3 R1 P0s structurally and is preserved. The R3 finding is a SCOPE GAP, not a regression: the R2 implementation correctly satisfies the spec contract as written, but the spec implicitly assumes a production Supabase project exists for CI to reach. FXAV has none (verified via Supabase MCP `list_projects` on 2026-05-20). This handoff §8 operator-bootstrap step exposed the gap.

**Verdict:** REQUEST_CHANGES. **1 H1 finding.** No P0 regressions; the R2 R1-closure work remains structurally sound.

##### H1-4: Drift-detector script requires Supabase production project that doesn't exist; admin-alert insertion path crashes in CI

**Site:** `scripts/verify-branch-protection.ts:54-60` `defaultUpsertAdminAlert` calls `supabase.rpc("upsert_admin_alert", ...)` against the URL `createSupabaseServiceRoleClient()` resolves, which currently routes to `http://127.0.0.1:54321` (local Supabase) per `lib/supabase/server.ts:80`. In CI runners no local Supabase is running, so the RPC connection refuses with `TypeError: fetch failed / connect ECONNREFUSED 127.0.0.1:54321`.

Workflow run https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26139070002/job/76880516432 (post-R2-APPROVE, post-secrets-set) demonstrates the failure mode. The R2 `main().catch(...)` wrapper correctly surfaces the error and exits 1 — that's the IMPROVED behavior. But the admin-alert never lands; the JSON report never lands either (because the script throws before reaching `writeJsonReport`).

**Root cause.** Spec §17.2.1 implicitly assumes a production Supabase project the drift-detector can reach from CI to insert `admin_alerts` rows. FXAV crew-pages v1 has not been deployed to production Supabase (per Supabase MCP `list_projects` 2026-05-20 — the four projects in the org are unrelated to FXAV). The user has been developing entirely against local Supabase. This is a real environment gap, not an implementation bug.

The right architectural answer (per user decision 2026-05-20): make the drift-detector **Supabase-optional** so the protection-verification contract works in environments without a reachable Supabase. The admin-alert is best-effort observability that engages automatically once production Supabase is deployed.

**Canonical fix shape:**

1. Wrap `defaultUpsertAdminAlert`'s RPC call (and the initial Supabase client construction if it can throw on missing env) in a try/catch.
2. When the RPC throws OR `SUPABASE_URL` is absent / points to a local dev URL (`127.0.0.1` / `localhost` / unset / empty), log to stderr: `[verify-branch-protection] admin_alerts insertion skipped: Supabase unreachable (<reason>); JSON report + exit code remain authoritative`. Do NOT crash; do NOT skip the JSON report; do NOT skip exit 1.
3. The exit-1-on-drift contract continues authoritative. The 8-day reader-freshness window contract continues to hold — the privileged job still exits 1 on drift, so the reader still gates merges.
4. Update `tests/cross-cutting/verify-branch-protection.test.ts` mocked cases: assert that when `insertAdminAlert` throws OR when the RPC rejects, the script still writes the JSON report + exits 1 + logs the skip-reason to stderr. Add a NEW negative-regression test: synthesize an `insertAdminAlert` that always throws — assert the script reaches `writeJsonReport` + exits 1 + logs `admin_alerts insertion skipped`.
5. The live-integration smoke test at `tests/cross-cutting/verify-branch-protection.test.ts:206-238` is a positive-case test (real Supabase reachable). Add a SIBLING test that asserts the script gracefully degrades when Supabase is configured as unreachable (e.g., `SUPABASE_URL: 'http://127.0.0.1:1'` — port 1 is always refused).
6. Document the Supabase-optional contract in spec §17.2.1 with a one-sentence amendment: "The privileged drift-detector emits `BRANCH_PROTECTION_DRIFT` to `admin_alerts` as best-effort observability; when Supabase is unreachable the script logs to stderr + writes the JSON report + exits 1 on drift. The exit-code-on-drift + JSON-report contract continues to be authoritative even without admin-alert delivery."
7. Once the change lands, re-run the privileged workflow on main; confirm the script logs the skip-reason + writes the JSON report (artifact) + exits 1 because no protection is configured yet. THEN the user proceeds to PUT branch protection. THEN the next privileged run exits 0 (no drift).

##### Routing

H1-4 is Codex's repair (`scripts/`, `tests/`, spec §17.2.1 — no UI surface). Dispatch via `/codex:adversarial-review --fresh` with verdict + finding text inlined.

##### Complexity-hypothesis FOURTH data point — REINFORCES the codified memory

This R3 round does NOT change the "heavy-audits-need-≥2-rounds" hypothesis status — that already codified after R2. But it adds a corroborating observation: even AFTER X.6 R2 APPROVED with a real live-integration smoke test landed, ANOTHER live-integration surface gap surfaced post-merge (the production-Supabase-doesn't-exist environment). The W18 watchpoint — "mocks-only tests insufficient for audit/drift-detector scripts" — caught the producer-pattern bug class at R2, but didn't catch the environment-availability bug class because the live smoke test ran against the user's local Supabase, not against a production-absent environment. R3 finding reinforces the more general lesson:

**Live-integration smoke tests must include the environment-failure mode**, not just the happy-path environment. If the smoke test only exercises "Supabase reachable + working," it misses "Supabase unreachable." The fix shape (Supabase-optional with graceful degradation) makes the script robust to BOTH environments — and the test suite must cover BOTH.

This is a refinement to memory `feedback_mocked_only_tests_invite_tautological_approve.md`, not a new memory. Updating that memory's body to include "live-integration tests must include the environment-FAILURE mode, not just the happy-path environment" after R3 closes.

##### Status banner update needed

The top-of-file status banner currently reads "COMPLETED 2026-05-20 at R2 APPROVE." With R3 in flight, the banner should update to "REOPENED 2026-05-20 → R3 in flight; R2 APPROVE preserved as archival; R3 surfaced an environment-availability gap (FXAV has no production Supabase)." Codex's R3 repair should flip the banner appropriately AND, on R3 APPROVE, append a fresh COMPLETED banner.

#### Round 3 repair (Codex)

**Repair commits:**

- `5104992` — `fix(audit): graceful-degrade branch protection alert delivery`
- `b419b00` — `docs(spec): make branch protection admin alerts best effort`
- `aff1195` — `test(audit): type branch protection smoke client`

**H1-4 closure:**

- `scripts/verify-branch-protection.ts:55-80` now treats missing / empty `SUPABASE_URL` and local dev URLs (`127.0.0.1` / `localhost`) as unavailable for the default CI alert producer before constructing the Supabase client. Injected test clients still exercise the real RPC path.
- `scripts/verify-branch-protection.ts:195-202` wraps alert delivery in a best-effort boundary. Any client-construction failure, RPC error object, rejected RPC promise, or local/unset Supabase URL logs `[verify-branch-protection] admin_alerts insertion skipped: Supabase unreachable (<reason>); JSON report + exit code remain authoritative` and does not throw. The existing drift/auth result still writes `artifacts/branch-protection-report.json` and returns `ok: false`, so `main()` still exits 1.
- `tests/cross-cutting/verify-branch-protection.test.ts:257-282` covers an injected admin-alert producer that throws and proves the drift report is still written.
- `tests/cross-cutting/verify-branch-protection.test.ts:284-307` covers the environment-failure path with `SUPABASE_URL=http://127.0.0.1:1`, proving the JSON report is written and the skip reason is logged.
- The positive live smoke remains at `tests/cross-cutting/verify-branch-protection.test.ts:220-255`; it injects the real service-role client so the R2 idempotent RPC contract is still tested when local Supabase is available.
- Spec §17.2.1 now documents the Supabase-optional contract at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3697`: admin-alert delivery is best-effort observability; exit-code-on-drift + JSON report are authoritative without admin-alert delivery.

**Negative-regression verification:**

- Stash `44d981078beb20354b184dde7d9fbfa796a46395` removes the `emitAlert` try/catch wrapper. `pnpm test:audit:branch-protection` fails in the same class as workflow run `26139070002`: the injected-producer test throws `synthetic admin_alerts outage`, and the unreachable-Supabase test throws `SUPABASE_URL points to local dev URL http://127.0.0.1:1` before report assertions can pass. Restored wrapper → `pnpm test:audit:branch-protection` green (15/15).

**Verification gate:**

- `pnpm test:audit:branch-protection` → 15/15 passing.
- `pnpm typecheck` → clean.
- `pnpm lint` → exits 0. Warning count is 6 in this shared worktree because concurrent commit `b220041` (`feat(help): Callout component (note/warning/tip) (Task D.1)`) added `tests/help/callout.test.tsx:3` unused `vi`; the original X.5/X.6 five-warning baseline remains otherwise unchanged. No X.6 repair file adds a warning.
- `pnpm test` → 271 files passed / 1 skipped; 3663 tests passed / 5 skipped.

**Notes:** R3 did not reopen the R1-retroactive P0s. The R2 structural meta-test and live RPC idempotency smoke remain intact. This repair adds the missing environment-failure mode required by the refined W18 lesson: live-integration checks must cover both reachable and unreachable external surfaces.

#### Round 3 — APPROVE (2026-05-20, Opus reviewer)

**Anchor:** milestone base `d026919` (X.5 R2 APPROVE close-out) per memory `feedback_adversarial_review_full_milestone_scope.md` — NOT the R2 fix-base, so fresh-eyes drift outside the R3 fix surface is detected. **Review scope:** `git diff d026919..41b3576` with M11 Phase C commits (`7e789f5`, `c06352b`, `648d22a`, `6c7e6de`) AND M11 Phase D Task D.1 commits (`1a10d97`, `b220041`) explicitly excluded.

**Verdict:** APPROVE. **Zero new findings.** H1-4 closed structurally; all R2 closures preserved intact; spec §17.2.1 amendment correct; handoff integrity intact; 15/15 test cases verified.

**H1-4 closure — mental trace of all four unreachable-Supabase scenarios:**

1. `SUPABASE_URL` unset + drift detected → `localSupabaseReason` returns "unset or empty" → `defaultUpsertAdminAlert` throws before client construction → `emitAlert` catches + logs the spec-mandated stderr prefix `[verify-branch-protection] admin_alerts insertion skipped:` → `writeJsonReport` lands → exit 1. ✓
2. `SUPABASE_URL=http://127.0.0.1:54321` + drift → "local dev URL" reason → same path. ✓
3. `SUPABASE_URL=http://prod.supabase.co` + RPC throws (network error / 500) → client constructed, RPC call throws → caught by `emitAlert` → same. ✓
4. Reachable production Supabase + RPC succeeds + drift detected → admin_alert lands → JSON report lands → exit 1. ✓

All four scenarios produce the correct stderr + JSON report + exit-1 contract. The script no longer crashes on missing/local Supabase.

**Verification of structural details:**

- `scripts/verify-branch-protection.ts:55-67` `defaultUpsertAdminAlert` uses try-side gate detecting unset/empty/127.0.0.1/localhost URLs via `localSupabaseReason` (lines 69-81); throws before client construction when no client is injected and the URL is unavailable — preventing the R1/R2 ECONNREFUSED crash class.
- `scripts/verify-branch-protection.ts:195-203` `emitAlert` try/catch logs the exact spec-mandated stderr prefix. Never re-throws. All four `emitAlert` call sites (lines 222, 241, 263, 276) precede `writeJsonReport` + return paths.
- `scripts/verify-branch-protection.ts:291` `main()` still sets `process.exitCode = 1` on `!result.ok`. R2 `main().catch(...)` wrapper at line 300 preserved.
- `scripts/verify-branch-protection.ts:64` RPC still uses canonical `upsert_admin_alert` (R2 P0-2 closure intact).

**R2 closure preservation (verified):**

- P0-1 `main().catch(...)` wrapper at line 300 — intact.
- P0-2 every RPC call goes through canonical `upsert_admin_alert`; no raw `.from("admin_alerts").insert(...)` introduced anywhere by R3.
- P0-3 plan amendment at `11-cross-cutting.md:2307-2319` — RPC-shaped, untouched by R3.
- Meta-test `tests/messages/_metaAdminAlertProducer.test.ts` — still walks `scripts/`+`lib/`+`app/` via `walkSourceFiles`; allowlist still empty; untouched by R3.
- Live-integration smoke test at `tests/cross-cutting/verify-branch-protection.test.ts:220-255` (R2's positive-case real-RPC + occurrence_count=2 idempotency) — PRESERVED intact, coexisting with R3's new graceful-degradation cases.

**Spec amendment verification:**

`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3697` adds the canonical sentence as an ADDITION to §17.2.1 (not a replacement): "The privileged drift-detector emits `BRANCH_PROTECTION_DRIFT` to `admin_alerts` as best-effort observability; when Supabase is unreachable the script logs to stderr, writes the JSON report, and exits 1 on drift. The exit-code-on-drift + JSON-report contract continues to be authoritative even without admin-alert delivery." Surrounding trust-boundary + split-mode prose unchanged.

**Test count verification:**

`pnpm test:audit:branch-protection` reports 15/15 passing per Codex's verification gate. Composition matches the canonical count: 6 parametric drift + 2 happy-path (legacy + ruleset) + 4 parametric auth + 1 R2 live-integration smoke + 2 NEW R3 graceful-degradation = 15.

**Negative-regression verification:**

Codex's recorded stash SHA `44d981078beb20354b184dde7d9fbfa796a46395` removes the `emitAlert` wrapper. `pnpm test:audit:branch-protection` fails on the same crash-before-report class that produced workflow run `26139070002`'s failure. Restored wrapper returns green. The stash exercises the actual failure mode H1-4 was opened on.

**Drift sweep result:**

No R3-introduced regressions. R3 touched: `scripts/verify-branch-protection.ts` (graceful degradation), `tests/cross-cutting/verify-branch-protection.test.ts` (2 new cases + type tightening), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3697` (one-sentence amendment), `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/X6-traceability.md` (banner + R3 repair log). M11 Phase C/D commits in the range (`b220041`, `1a10d97`) are independent + correctly NOT claimed by X.6 R3.

**Lint sanity:** the 6-warning count vs the X.5/R2 5-warning baseline is M11 Phase D `tests/help/callout.test.tsx:3` unused `vi` import — not X.6 R3's lint debt.

**Complexity-hypothesis FOURTH data point — REFINEMENT to codified memory:**

X.6 took THREE review rounds total (R1 retroactive REVERSAL counts; R2 APPROVE; R3 APPROVE). The R3 round was triggered NOT by a regression in R2's fix but by a DIFFERENT class of live-integration gap: the environment-availability class. R2 added a live-integration smoke test (R2 P0-2 closure), but the smoke test only exercised the HAPPY PATH (Supabase reachable + RPC working). The R3 finding exposed that the test suite needed BOTH:

- Happy-path smoke test (R2 — exercises producer pattern against real schema).
- Environment-failure smoke test (R3 — exercises graceful degradation when surface is unreachable).

This is a REFINEMENT to the codified memory `feedback_mocked_only_tests_invite_tautological_approve.md`. The updated guidance is:

> **Live-integration smoke tests must include the environment-FAILURE mode**, not just the happy-path environment. A test suite that only exercises "external surface reachable + working" is incomplete — it misses the "external surface unreachable" failure mode, which produces the same R1-style tautological APPROVE pattern at a different granularity. For ANY external-integration script, R1 self-review must explicitly enumerate the environment-failure modes (DB unreachable, API returning 5xx, secret missing, etc.) and confirm at least one test exists per mode.

R3 also reinforces W18 watchpoint: live-integration probes MUST cover both reachable AND unreachable external surfaces. Updating memory body after this commit lands.

**Closure summary:** H1-4 closed structurally — `defaultUpsertAdminAlert` detects unset/empty/local-dev URLs and throws before client construction; `emitAlert` catches with stderr skip-reason; JSON report STILL lands; exit 1 on drift STILL authoritative. R2 closures preserved intact. Spec §17.2.1 amended. Handoff status banner + exit criteria accurate. 15/15 audit cases pass. Branch-protection bootstrap (handoff §8 operator step) is UNBLOCKED. **FXAV crew-pages v1 X.* set is now structurally complete (this time really).** The next operator action is the branch-protection PUT against GitHub's REST API.
