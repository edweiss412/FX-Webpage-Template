# Static env-block key allowlist for both CI guard layers

**Date:** 2026-08-02 · **Branch:** `test/ci-static-env-injection` · **Class:** CI guard soundness (detector/guard surface — probe-before-argue and mutation-family closure apply, `docs/agents/adversarial-round-economy-2026-07-31.md`)

**Backlog item closed:** `BL-CI-STATIC-ENV-INJECTION` — graduated by this branch to repo-root `BACKLOG-archive.md` (heading token BL-CI-STATIC-ENV-INJECTION) with `test/ci-static-env-injection` as provenance; absent from the active `BACKLOG.md` queue once this ships.

<!-- spec-lint: not-ui — no UI surface. The diff is the two tests/ci/** guard modules and their caller, plus the registry/ledger/README fan-out enumerated below. -->

Files this spec MODIFIES: `tests/ci/_workflowCoverageScan.ts` (scanner module — new shared allowlist + predicate, per-scope rejection), `tests/ci/_metaSpecRegistration.test.ts` (census — per-scope poison), `tests/ci/_metaE2eWorkflowCoverage.test.ts` (scanner caller + self-suite fixtures), `tests/docs/_metaDeferralLedgerGraduation.test.ts` (one `BACKLOG_GRADUATED` row), `BACKLOG.md` + `BACKLOG-archive.md` (the graduation), `docs/superpowers/specs/ci/2026-08-01-ci-cross-step-env-guard-design.md` (§5 L3 pointer gains a graduated-to-archive note; no semantic change), and the `docs/superpowers/{specs,plans}/ci/README.md` index tables. It CREATES no production files and no new dependencies.

---

## §1 Problem

A static `env:` block — workflow, job, or step level — can set `PATH` (or any loader/interpreter control variable) so a textually clean `pnpm exec playwright test …` step runs a fake pnpm that exits 0: green step, no tests. Unlike the cross-step `GITHUB_ENV`/`GITHUB_PATH` class (closed by `docs/superpowers/specs/ci/2026-08-01-ci-cross-step-env-guard-design.md`), there is no step ordering to thread — the vector is a static key the scanner accepts as an unexamined scalar map. Both guard layers pass it today:

- The **workflow type table** (`tests/ci/_workflowCoverageScan.ts`, `WF_ROOT` / `WF_STEPS_JOB` / `WF_RUN_STEP` / `WF_USES_STEP`) declares `env: scalars` at every level — structural validity only (string keys, scalar values); key NAMES are never examined.
- The **census** (`tests/ci/_metaSpecRegistration.test.ts`, `runBlocksOf`) reads `env:` only through the shared `validWorkflowShape`, so a structurally valid poisoning block emits clean, unpoisoned run blocks.
- The static-key siblings are already closed: `UNMODELLED_RE` in `_workflowCoverageScan.ts` refuses `shell:` / `working-directory:` / `defaults:` / `container:` / `needs:` file-wide. `env:` is the sole static residual — and it cannot join that alternation, because live claiming workflows need `env:` (measurement below).

### §1.0 Probe record (bug demonstrated before drafting)

Probe file tests/ci/probe-static-env.test.ts (temporary and deliberately untracked; its fixtures graduate into the two self-suites and the probe file is deleted before merge), run 2026-08-02 in this worktree at `origin/main` (2509f1452):

- **Scanner:** a workflow with `env:\n  PATH: fixtures/fake:/usr/bin:/bin` at WORKFLOW level, at JOB level, or at STEP level (three separate fixtures), each followed by / carrying a plain `pnpm exec playwright test tests/e2e/synthetic-static-env.spec.ts` step under a bare `pull_request` trigger, yields `covered` CONTAINING the spec and `rejected: []` at all three scopes. All three probe assertions passed.
- **Census:** the job-level variant through `runBlocksOf` + `censusInvocations` yields blocks with `poisoned: false` throughout and `problems: []`. Assertions passed.

This extends the R1 probe recorded in the cross-step spec §5 L3 (job-level only) to all three static scopes. Zero live workflows carry an `env:` override of `PATH` or any other loader/interpreter key (measurement below), so this is a forward-looking fail-by-default guard proven on synthetic fixtures, with a hard requirement that live guard suites stay green.

### §1.0.1 Live measurement (2026-08-02, drafting-time input per probe-before-argue)

- 20 `env:` block sites across 13 workflow files (6 job-level, 14 step-level, 0 workflow-root, 0 under `.github/actions/**`, 0 under `services:`).
- 35 distinct keys (~120 total occurrences of those keys across the sites). Every key is application/test configuration (Supabase URLs/secrets, JWT secrets, test-auth flags, `GH_TOKEN`-family tokens, suite-selection flags like `CREW_E2E_ONLY`). None is read by the shell, the loader, the runtime launcher, or the runner when resolving or executing commands.
- The env-carrying files ARE the claiming e2e workflows (`crew-e2e.yml`, `admin-layout-e2e.yml`, `dev-gate-e2e.yml`, `lifecycle-layout-e2e.yml`, `phantom-gap-e2e.yml`, `published-modal-e2e.yml`, `step3-live-bundle.yml`, `help-affordances.yml`, …). Reject-on-`env:`-anywhere would therefore dark exactly the specs this guard exists to protect, forcing a `LOCAL_ONLY_ALLOWLIST` dark-spec row (`tests/ci/_metaE2eWorkflowCoverage.test.ts`) for each — deleting the guard's value where it matters most. This measurement refutes the BACKLOG charter's "reject-on-`env:`-anywhere … probably right" presumption, which had measured only PATH-override usage (zero), not general `env:` usage.

### §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Posture is a KEY ALLOWLIST, fail-closed on unknown keys. Reject-on-`env:`-anywhere is refuted by measurement (§1.0.1: 13 live claiming files carry `env:`); a dangerous-key blacklist is the losing enumeration game this program retired at R9/R13 of the cross-step arc. User ratified the allowlist posture and autonomous shipping 2026-08-02 (dispatch conversation). | §1.0.1 measurement; cross-step spec §7 R9/R13 (`docs/superpowers/specs/ci/2026-08-01-ci-cross-step-env-guard-design.md`) |
| The allowlist is KEY-NAME based; VALUES are unexamined. An env var's NAME is what the shell/loader/launcher reads; a row asserts name-inertness ("no execution surface reads a variable of this name"), not value safety. §5 LS1 carries the consequence. | §5 LS1; same trust boundary as every registry row (`COMPLEX_INVOCATION_REGISTRY`, `LOCAL_ONLY_ALLOWLIST`) |
| Matching is EXACT and case-sensitive. Linux env is case-sensitive, all live runners are Linux, and a Windows-runner `path` evasion fails closed anyway because `path` is not on the list — no case modeling exists to attack. | §2.0; §5 LS4 |
| Scope-correct precision, not file-wide darking: workflow env governs the file, job env its job, step env that step, a `uses:`-step env the action invocation it configures. Over-poisoning forces reason-free rows and trains rubber-stamping (cross-step §3 F1 precision-twin lesson). | Cross-step spec §3 F1 twin; §2.1/§2.2 here |
| One shared allowlist + one shared predicate exported from `_workflowCoverageScan.ts`, consumed by both layers. Layer drift WAS the defect at cross-step R8/R17; the single-authority pattern is settled. | Cross-step §7 R8/R17 |
| `UNMODELLED_RE` / `UNMODELLED_SHELL_RE` / the cross-step `ENV_FILE_MENTION` machinery are untouched. This spec adds the static-key layer only. | Cross-step §1.1, §2.3 |
| The census's existing `poisoned` boolean and registry-or-loud routing are REUSED, not duplicated — static env poison arrives through the same flag; the poisoned why-string generalizes to name both sources. | §2.2; cross-step §2.1 |
| `services.env` stays `scalars` (structural only). Service-container env applies inside an isolated service container and cannot alter step executable resolution; `container:` (which COULD) is already refused file-wide by `UNMODELLED_RE`. | §5 LS2 |
| Fail-closed direction everywhere: a false "unmodelled key" costs one reasoned allowlist row; a false "clean" silently deletes real coverage. | Header contract of `_workflowCoverageScan.ts` ("errs toward REJECTING") |
| No UI surface, no DB, no `pg_advisory*` path: invariants 2/8 N/A; Dimensional Invariants / Transition Inventory N/A. | `AGENTS.md` invariants 2, 8 |

---

## §2 Design

One shared allowlist and predicate; two layer-specific applications. Both layers keep their existing architecture — the change is a key check at the scopes that already parse `env:` maps, not a parser rewrite and not new stripping/matching machinery.

### §2.0 The allowlist and predicate

In `tests/ci/_workflowCoverageScan.ts`:

- `export const ENV_KEY_ALLOWLIST: Record<string, string>` — exact env key → non-empty reason string asserting name-inertness. Seeded with exactly the keys live workflows use at drafting time (35 keys per §1.0.1; the implementing task re-derives the set from the live tree rather than trusting this count). Example rows: `SUPABASE_URL: "app config read by the Next.js server under test, not by any execution surface"`, `CREW_E2E_ONLY: "vitest/playwright suite-selection flag read inside test code"`.
- `export function offAllowlistEnvKeys(env: unknown, allowlist: Record<string, string> = ENV_KEY_ALLOWLIST): string[]` — for a value that already passed the structural `scalars` check, return the SORTED list of keys not present in the allowlist; empty array means clean. Non-mapping input returns `[]` (structural invalidity is `validWorkflowShape`'s existing job, and it already fails the file).
- Exact string comparison, case-sensitive, no prefix families, no patterns. A key like `path`, `Path`, `LD_PRELOAD`, `NODE_OPTIONS`, `BASH_ENV`, `PERL5LIB`, or any GITHUB_-prefixed name is simply absent and fails closed — there is no dangerous-key enumeration to evade.

### §2.1 Scanner: per-scope rejection with a precise reason

`tests/ci/_workflowCoverageScan.ts`, inside `scanWorkflowCoverage` (which already reads the PARSED document for `runs-on`, mixed steps, and step values — R17/R25/R26 of the cross-step arc):

- Compute off-list keys at each scope from the parsed document: the workflow root's `env`, each job's `env`, each step's `env`.
- Rejection semantics (a claiming step is rejected when ANY governing scope is dirty):
  - workflow-root `env` dirty → every claim in the file rejects;
  - job `env` dirty → every claim in that job rejects (other jobs untouched);
  - run-step `env` dirty → that step's claims reject (sibling steps untouched — GitHub scoping: step env does not leak to siblings);
  - `uses:`-step `env` dirty → that step is treated as an untrusted action invocation: it poisons the job env fail-closed through the existing `usesValuePoisons` path semantics (the action's process receives the dirty env — e.g. `NODE_OPTIONS` injected into a javascript action — and what that action does to the job is thereafter unmodellable). This is deliberately COARSER than run-step scoping; §5 LS3 records it.
  - a composite-manifest step's `env` dirty (reached through `usesValuePoisons` recursion / the census splice) → same treatment as a `uses:`-step at that site: poison fail-closed.
- Reason string: `` env block sets unmodelled key(s): <k1>, <k2> `` — sorted, ALL off-list keys listed (a first-key-only mutant is pinned by §3 S5). REPORTED via `rejected`, never silently dropped (the `_rowWrapperScan` lesson, cross-step §4.2).
- Chain position: after the file/job schedulability gates (schema, `runs-on`, mixed step, spelling) and after the cross-step poison reason; before path-filter/if/continue-on-error. Order decides only which reason is reported; every one is a refusal.
- `Opts` gains `envKeyAllowlist?: Record<string, string>` (default `ENV_KEY_ALLOWLIST`) so fixtures pin behavior against a fixture-local allowlist instead of coupling to live rows.

### §2.2 Census: per-scope poison through the existing flag

`tests/ci/_metaSpecRegistration.test.ts`:

- `runBlocksOf(doc, localActions?, envKeyAllowlist?)` — new optional third parameter defaulting to the shared `ENV_KEY_ALLOWLIST` import.
- Workflow-root `env` dirty → every block in the file starts `poisoned: true` (same mechanism as the existing `schemaInvalid` / invalid-`runs-on` poison seeding in the walker).
- Job `env` dirty → that job's blocks start poisoned.
- Run-step `env` dirty → that block poisoned.
- `uses:`-step `env` dirty → `state.poisoned = true` at that step (spliced composite blocks and all later same-job blocks poisoned — the action can do unmodellable things with a hostile env), matching the scanner's coarse treatment.
- Composite-manifest step `env` dirty → poison at that step within the splice, same rule.
- `censusInvocations` and the registry-or-loud routing are UNCHANGED — static env poison rides the existing `poisoned` boolean. The poisoned why-string generalizes to: `environment poisoned by a same-job GITHUB_ENV/GITHUB_PATH write or an unmodelled static env: key`. Precision between the two sources is deliberately not distinguished in the why-string; the workflow file names the culprit in one glance.

### §2.3 Allowlist hygiene (registry-or-loud, mirrored from `LOCAL_ONLY_ALLOWLIST`)

New `it`-blocks in `tests/ci/_metaE2eWorkflowCoverage.test.ts`:

- **Stale rows red:** every `ENV_KEY_ALLOWLIST` key must appear in at least one live workflow/action `env:` block (parsed, not grepped); a row whose key vanished from the tree fails with "remove the stale env-key row". Mirrors the stale/shadowing checks on `LOCAL_ONLY_ALLOWLIST`.
- **Reasoned rows only:** every row's reason is a non-empty string.
- (No shadowing analogue exists — an allowlisted key that is also used is the normal state.)

### §2.4 What deliberately does NOT change

- `UNMODELLED_RE` / `UNMODELLED_SHELL_RE` / `ENV_FILE_MENTION` / `usesKind` / `validRunsOn` / `validatedCompositeSteps` / `validWorkflowShape` internals — untouched. `env: scalars` stays in the type tables as the structural gate; the key check is a separate layer with its own reason.
- `services.env` (structural `scalars` only, §5 LS2) and `WF_USES_JOB` (has no `env` key — GitHub schema) — untouched.
- No live workflow or action file changes; zero dirty live keys means zero new `LOCAL_ONLY_ALLOWLIST` rows and no live-coverage change. The rows this arc adds: the `ENV_KEY_ALLOWLIST` seed (live keys), one `BACKLOG_GRADUATED` row.
- No new comment-stripping mechanism (the predicate reads PARSED maps, so the comment-stripping single-source registry is untouched).

---

## §3 Mutation-family closure set

Fixtures land red against the pre-fix layer (TDD, invariant 1), then the key check turns them green; precision twins stay green throughout. Census fixtures live in the census `it`-blocks of `_metaSpecRegistration.test.ts`; scanner fixtures in the self-suite describes of `_metaE2eWorkflowCoverage.test.ts`. A NEW family requires a live escaping mutant against the shipped guard (`docs/agents/writing-plans.md`; round-economy contract).

| Family | Mutant | Pinning fixture(s) |
| --- | --- | --- |
| **S1 scope deletion** | the key check dropped at one scope | positive fixture per scope: workflow-root, job, run-step, `uses:`-step, composite-manifest step — each with an off-list key before/on a claiming step → scanner rejects with the env reason (or poison reason at uses/composite sites), census poisons. Both layers, every scope that layer models |
| **S2 fail-open flip** | unknown key accepted, or predicate inverted | off-list key (`PATH`, and a nonsense `TOTALLY_NOVEL_KEY`) reds; on-(fixture-)list key stays covered/clean |
| **S3 precision twins** | scoping coarsened to file-wide, or allowlist ignored | off-list key in job B → job A's claim stays covered; off-list STEP env on a non-claiming sibling → the claiming step stays covered; fixture-allowlisted keys at every scope stay covered/clean; live tree stays green (§4.3) |
| **S4 reason laundering** | rejection dropped instead of reported | `rejected[0].reason` pinned exactly (`env block sets unmodelled key(s): …`) — REPORTED, not silently dropped |
| **S5 multi-key completeness** | reason narrowed to the first off-list key | two off-list keys in one block → reason lists BOTH, sorted |
| **S6 hygiene deletion** | stale-row or empty-reason check dropped | synthetic stale row → hygiene test reds; empty-reason row → reds (tested by direct invocation with a doctored allowlist) |

S3 is as load-bearing as the positives: an over-poisoning guard that darkens every env-carrying workflow forces reason-free rows and trains humans to rubber-stamp them.

---

## §4 Test plan and acceptance criteria

TDD per task (invariant 1): each fixture lands red against the pre-fix layer, then the key check turns it green, with the S3 twins green throughout.

### §4.1 Census self-suite additions (`_metaSpecRegistration.test.ts`)

- `runBlocksOf` fixtures (every fixture job declares a `runs-on`, per cross-step §7 R16): workflow-root dirty → all blocks poisoned; job dirty → that job only; run-step dirty → that block only; `uses:`-step dirty → poisoned from that step onward incl. spliced blocks; composite-step dirty → poisoned at that step; fixture-allowlist twins clean; cross-job isolation twin.
- `censusInvocations`: a poisoned classifying line still routes registry-or-loud (existing behavior — one fixture confirming the static-env-poisoned block reds identically).

### §4.2 Scanner self-suite additions (`_metaE2eWorkflowCoverage.test.ts`)

- All §3 scanner-side fixtures, driven through `scanWorkflowCoverage` with a fixture-local `envKeyAllowlist`.
- Reason pins: exact string including the sorted key list (S4/S5).
- Hygiene blocks per §2.3.

### §4.3 Live-green gate

`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/ci/_metaSpecRegistration.test.ts` green against the live tree with the seeded `ENV_KEY_ALLOWLIST` — zero live workflows carry an off-list key, so zero coverage changes and zero new `LOCAL_ONLY_ALLOWLIST` rows; any live red is a defect in this design (or a missing seed row), not a candidate dark-spec row.

### §4.4 Cleanup

Probe file tests/ci/probe-static-env.test.ts deleted before merge (its fixtures graduate into §4.1/§4.2).

---

## §5 Documented limits

Consequence bound per limit. LS1 is the single trust assumption; LS2/LS3 err in the stated conservative direction; nothing here is fail-open for the charter vector (static key selecting a fake executable).

- **LS1 Allowlist rows are name-inertness ASSERTIONS, values unexamined.** A row claims "no execution surface reads a variable of this name" — the same human-trust boundary as every registry row in these suites. A WRONG row (allowlisting `NODE_OPTIONS`) is a review failure the guard cannot catch; the mitigation is the reason string (reviewable in the diff that adds it) and the stale-row hygiene keeping the list minimal. Values on allowlisted keys — including `${{ }}` expressions — are unexamined by construction: the key name, not the value, decides what the shell/loader reads.
- **LS2 `services.env` keys are unexamined (structural `scalars` only).** Service-container env applies inside an isolated service container; it cannot alter step executable resolution. The construct that could — `container:` — is already refused file-wide by `UNMODELLED_RE`. Zero live `services:` env blocks (§1.0.1). If a live workflow ever runs steps IN a container, `UNMODELLED_RE` refuses it before this limit matters.
- **LS3 `uses:`-step and composite-step env scoping is deliberately COARSE (poison, not step-local rejection).** A dirty env handed to an action invocation makes that action's effect on the job unmodellable (a javascript action given `NODE_OPTIONS` can do anything), so both layers poison fail-closed from that site instead of scoping the dirt to the step. Over-poison direction: costs a reasoned row if a legitimate case ever appears; never false coverage.
- **LS4 Windows-runner case-insensitivity is not modeled.** `path`/`Path` on a hypothetical `windows-latest` job fails closed anyway (not on the list), so no case modeling exists to be wrong.
- **LS5 Runtime env mutation is the cross-step guard's charter, not this one's.** `GITHUB_ENV`/`GITHUB_PATH` writes, `github.env` context spellings, and env-file games are covered by the 2026-08-01 spec; this spec adds only the static-block layer.
- **LS6 Reusable-workflow (`WF_USES_JOB`) inputs are not env.** Such jobs carry no `env:` key in GitHub's schema (and none in the type table); `with:`/`secrets:` are inputs to the called workflow, whose own file is scanned independently if it claims specs.

---

## §6 Invariant fan-out check

- Invariants 2/3/5/8/10: N/A (no locks, no email, no UI, no mutation surfaces — test-only diff). `impeccable-gate: N/A — no UI surface` will be carried by the plan closeout marker.
- Invariant 6: commits `test(ci): …` per task.
- Invariant 9: no Supabase calls.
- Invariant 11: work in `../FX-worktrees/ci-static-env-injection` (this worktree), never the main checkout.
- §12.4 catalog / DB parity / screenshots: untouched.
- Comment-stripping single-source registry: untouched (no new stripping — the predicate reads parsed maps; ratified in §2.4).
- Deferral-ledger graduation registry (`tests/docs/_metaDeferralLedgerGraduation.test.ts`): one `BACKLOG_GRADUATED` row for BL-CI-STATIC-ENV-INJECTION.
- Cross-step spec §5 L3: pointer sentence gains "(graduated to `BACKLOG-archive.md` by `test/ci-static-env-injection`)" — location note only, no semantic change.
- `docs/superpowers/specs/ci/README.md` (and plans README at plan time): one index row each.

---

## §7 Review record (triage — findings and dispositions, so later rounds do not re-derive)

_Populated during adversarial review._
