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
| Rows pin exact (key, value-TEXT) pairs — ratified at R2, superseding the R0 key-name-only design (refuted by the R2 live probe: flag values gate `test.skip`). Pinning is TEXT-level: no expression evaluation, no runtime resolution; secret CONTENT and dispatch-input runtime values are out of universe (§5 LS1). Do not relitigate toward value grammars or expression modeling — that is the losing game the docker/ref rounds retired. | §5 LS1; §7 R2; same trust boundary as every registry row (`COMPLEX_INVOCATION_REGISTRY`, `LOCAL_ONLY_ALLOWLIST`) |
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

- `export const ENV_KEY_ALLOWLIST: Record<string, { values: string[]; reason: string; governs: string[] }>` — exact env key → the exact scalar VALUE TEXTS the repo has reviewed for it, a non-empty reason, and the SORTED spec paths whose claiming steps the key currently governs (`governs`, mechanically derived — R3 repair, below). **Rows pin observed key=value pairs, not key names (R2 BLOCKING repair):** a key-name-only registry required a name-inertness judgment per row, and two mandatory seed keys (`MODAL_PREFETCH_E2E`, `MODAL_REALTIME_E2E`) flatly failed it — their values gate `test.skip`, so a value-only flip produced a green run with no tests while both layers stayed clean (R2 live probe). Value pinning closes that CLASS: a novel value fails closed exactly like a novel key, with no per-key inertness debate left to get wrong. Seeded with exactly the live (key, value-text) pairs at implementation time (35 keys per §1.0.1; pairs re-derived from the parsed live tree by script, not trusted from this prose).
- Expression values pin as TEXT: `${{ secrets.SUPABASE_URL }}` is one pinned string. What an expression RESOLVES to at runtime (secret content, dispatch inputs) is out of scope — repo secrets are an admin-controlled trust domain, and rotating a secret changes no YAML text, so pinned rows do not churn (§5 LS1).
- **`governs` binds pairs to the claims they gate (R3 BLOCKING repair):** value pinning closed the FLIP but not RELOCATION — the R3 live mutant moved `MODAL_PREFETCH_E2E: "1"` from the claiming job to an unrelated site; pair-level hygiene stayed green while the spec self-skipped on ABSENCE, false coverage at all nine modeled sites. Each row now carries the derived set of specs its key governs (a key at workflow-root/job/step env scope governs every spec named in that job's claiming run text), and hygiene asserts set EQUALITY against a fresh live derivation — relocation AND silently-gained governance both force a reviewable registry edit. Derivation is judgment-free (observed governance, like the value texts); scan-time behavior ignores `governs` — absence is a hygiene-layer contract, not a per-scan refusal.
- `export function offAllowlistEnvKeys(env: unknown, allowlist = ENV_KEY_ALLOWLIST): string[]` — for a value that already passed the structural `scalars` check, return the SORTED list of keys that lack a row OR carry a value text outside their row's `values`; empty array means clean. The reason string lists KEY names only (the workflow diff shows the value). Scalar coercion for comparison: strings as-is, other scalars via `String(v)`. Non-mapping input returns `[]` (structural invalidity is `validWorkflowShape`'s existing job, and it already fails the file).
- Membership is OWN-PROPERTY membership: `Object.hasOwn(allowlist, key)`, never the `in` operator (R1 F2: `in` walks the prototype chain, so env keys named `constructor`, `toString`, `__proto__`, or `hasOwnProperty` would read as allowlisted with no declared row — probe showed false coverage at all five modeled scopes in both layers). §3 S2 pins the mutant.
- Exact string comparison, case-sensitive, no prefix families, no patterns, for keys AND values. A key like `path`, `Path`, `LD_PRELOAD`, `NODE_OPTIONS`, `BASH_ENV`, `PERL5LIB`, or any GITHUB_-prefixed name is simply absent and fails closed — there is no dangerous-key enumeration to evade.

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
- The `uses:`/composite cells reject through the existing `envPoisoned` mechanism, whose reason string GENERALIZES exactly as the census why-string does (§2.2): `earlier same-job step writes GITHUB_ENV/GITHUB_PATH or carries an unmodelled static env: key`. A static-key poison reporting the write-only wording would send a human hunting an env-file write that does not exist; the cross-step fixtures pin the reason through a shared constant, so they update to the generalized string in the same commit.
- Chain position: after the file/job schedulability gates (schema, `runs-on`, mixed step, spelling) and after the cross-step poison reason; before path-filter/if/continue-on-error. Order decides only which reason is reported; every one is a refusal.
- `Opts` gains `envKeyAllowlist?` of the same row shape as `ENV_KEY_ALLOWLIST` (its default) so fixtures pin behavior against a fixture-local allowlist instead of coupling to live rows.

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

- **Stale rows red:** every `ENV_KEY_ALLOWLIST` (key, value-text) pair must appear in at least one live workflow/action `env:` block (parsed, not grepped); a row whose key vanished — or a pinned value no live site carries — fails with a remove-the-stale-row message. Mirrors the stale/shadowing checks on `LOCAL_ONLY_ALLOWLIST`.
- **Governance equality (R3, recognizer-corrected R4):** every row's `governs` equals the live derivation (`envPairGovernance` + `governanceViolations`, pure module exports so §3 S8 can feed doctored trees). Relocating a pair away from the claims it gates, or a pair silently gaining governance of new claims, reds with the mismatch named. The derivation recognizes claims through the SHARED `claimedSpecsOf` — the scan loop's own recognizer, extracted at R4 (command-position `INVOKER_SEG`, pnpm alias resolution, and the whole-config literal on the TOP-LEVEL run block only, never through alias bodies) — because a bare path regex credited `echo tests/e2e/…` prose as a claim, letting a parked pair launder its declared set (§7 R4).
- **Reasoned rows only:** every row's reason is a non-empty string and every row pins at least one value.
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
| **S1 scope deletion** | the key check dropped at one scope, or the composite walk narrowed by depth or step kind | positive fixture per scope CELL (R1 F1 — a single generic composite fixture left three cells escaping depth/kind-narrowed mutants): workflow-root, job, run-step, `uses:`-step, composite DIRECT run-step, composite DIRECT uses-step, composite NESTED run-step, composite NESTED uses-step — each with an off-list key governing a claiming step → scanner rejects with the env reason (or poison reason at uses/composite sites), census poisons. Both layers, every cell that layer models; census additionally pins the STANDALONE composite-doc entry (a dirty-env step in a directly-walked action doc) |
| **S2 fail-open flip** | unknown key accepted, predicate inverted, or membership widened to the prototype chain | off-list key (`PATH`, and a nonsense `TOTALLY_NOVEL_KEY`) reds; prototype-named key (`constructor`) reds in BOTH layers (R1 F2 — a `key in allowlist` mutant passes the plain fixtures while `constructor`/`toString`/`__proto__`/`hasOwnProperty` escape); on-(fixture-)list key stays covered/clean |
| **S3 precision twins** | scoping coarsened to file-wide, or allowlist ignored | off-list key in job B → job A's claim stays covered; off-list STEP env on a non-claiming sibling → the claiming step stays covered; fixture-allowlisted keys at every scope stay covered/clean; live tree stays green (§4.3) |
| **S4 reason laundering** | rejection dropped instead of reported | `rejected[0].reason` pinned exactly (`env block sets unmodelled key(s): …`) — REPORTED, not silently dropped |
| **S5 multi-key completeness** | reason narrowed to the first off-list key | two off-list keys in one block → reason lists BOTH, sorted |
| **S6 hygiene deletion** | stale-row or empty-reason check dropped | synthetic stale row → hygiene test reds; empty-reason or value-less row → reds (tested by direct invocation with a doctored allowlist) |
| **S7 value-pin deletion** (R2 BLOCKING, live probe) | matching widened to key-name-only | an allowlisted key with a NOVEL value (`GOOD_KEY: other` where the row pins `v`) reds in BOTH layers at the direct scopes; the pinned value stays covered/clean. Kills the `MODAL_PREFETCH_E2E=0` green-run-no-tests mutant |
| **S8 governance-binding deletion** (R3 BLOCKING + R4 recognizer laundering, live probes) | hygiene narrowed to pair-presence, `governs` ignored, or the derivation's recognizer widened past the scan's | doctored-tree twins through the pure checker: a pair RELOCATED from its claiming job to a non-claiming site reds; a pair silently GAINING governance reds; a pair parked on an `echo tests/e2e/…` prose step confers NO governance and the declaring row reds (R4 launder mutant); an ALIAS-resolved claim DOES confer governance (same recognizer as the scan); the faithful tree passes |

S3 is as load-bearing as the positives: an over-poisoning guard that darkens every env-carrying workflow forces reason-free rows and trains humans to rubber-stamp them.

---

## §4 Test plan and acceptance criteria

TDD per task (invariant 1): each fixture lands red against the pre-fix layer, then the key check turns it green, with the S3 twins green throughout.

### §4.1 Census self-suite additions (`_metaSpecRegistration.test.ts`)

- `runBlocksOf` fixtures (every fixture job declares a `runs-on`, per cross-step §7 R16): workflow-root dirty → all blocks poisoned; job dirty → that job only; run-step dirty → that block only; `uses:`-step dirty → poisoned from that step onward incl. spliced blocks; the full composite matrix per §3 S1 — direct run-step, direct uses-step, nested run-step, nested uses-step, each dirty → poisoned — plus the standalone composite-doc entry (dirty-env step in a directly-walked action doc → poisoned); fixture-allowlist twins clean; prototype-named key (`constructor`) poisons (S2); allowlisted key with a novel value poisons while the pinned value stays clean (S7); cross-job isolation twin.
- `censusInvocations`: a poisoned classifying line still routes registry-or-loud (existing behavior — one fixture confirming the static-env-poisoned block reds identically).

### §4.2 Scanner self-suite additions (`_metaE2eWorkflowCoverage.test.ts`)

- All §3 scanner-side fixtures, driven through `scanWorkflowCoverage` with a fixture-local `envKeyAllowlist` — including all four composite matrix cells (direct/nested × run/uses, S1), the prototype-named key (S2), and the novel-value twin (S7).
- Reason pins: exact string including the sorted key list (S4/S5).
- Hygiene blocks per §2.3, including the S8 governance twins (relocated pair, silently-gained governance, faithful control) through the pure checker.

### §4.3 Live-green gate

`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/ci/_metaSpecRegistration.test.ts` green against the live tree with the seeded `ENV_KEY_ALLOWLIST` — zero live workflows carry an off-list key, so zero coverage changes and zero new `LOCAL_ONLY_ALLOWLIST` rows; any live red is a defect in this design (or a missing seed row), not a candidate dark-spec row.

### §4.4 Cleanup

Probe file tests/ci/probe-static-env.test.ts deleted before merge (its fixtures graduate into §4.1/§4.2).

---

## §5 Documented limits

Consequence bound per limit. LS1 is the single trust assumption; LS2/LS3 err in the stated conservative direction; nothing here is fail-open for the charter vector (static key selecting a fake executable).

- **LS1 Allowlist rows pin key=value TEXT; runtime resolution of pinned expressions is out of scope.** (Rewritten at R2 — the original name-inertness contract was refuted by live probe: `MODAL_PREFETCH_E2E`/`MODAL_REALTIME_E2E` values gate `test.skip`, so no name-only row could honestly cover them.) A row asserts "the repo has reviewed exactly these value texts for this key" — the same human-trust boundary as every registry row. What a pinned `${{ }}` expression RESOLVES to at runtime (secret content, `github.event` inputs) is unexamined: repo secrets and dispatch inputs are admin-controlled trust domains outside a YAML scan's universe, and a hostile SECRET CONTENT cannot be reviewed in any diff. A WRONG row (pinning a hostile pair) remains a review failure the guard cannot catch; mitigations are the reason string and the pair-level stale-row hygiene.
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

**R1 (Codex, 2026-08-02, VERDICT: NEEDS-ATTENTION; both findings probe-backed and ACCEPTED):**

1. **NEEDS-ATTENTION — S1 did not pin composite depth × step-kind closure.** The reviewer's in-memory mutants (composite walk narrowed to depth 1; narrowed to run-steps only) escaped through direct composite uses-steps, nested run-steps, and nested uses-steps in BOTH layers while a single generic composite fixture stayed green. **Disposition:** §3 S1 now enumerates the full matrix — direct/nested × run/uses as four fixture cells per layer, plus the census standalone composite-doc entry (class-sweep addition: it is a ninth walk-entry site the matrix would otherwise miss); §4.1/§4.2 fixture inventories updated to match.
2. **NEEDS-ATTENTION — membership was not pinned to OWN properties.** A natural `key in allowlist` mutant passed the S2 fixtures while env keys named `constructor` / `toString` / `__proto__` / `hasOwnProperty` read as allowlisted (prototype chain) with no declared row — probe showed false coverage at all five modeled scopes, both layers. **Disposition:** §2.0 now specifies `Object.hasOwn` membership explicitly; §3 S2 gains the `constructor` fixture in both layers. Class-sweep: `offAllowlistEnvKeys` is the only key-membership lookup this charter introduces; the pre-existing `in`-based lookups elsewhere in the scanner (`packageScripts` alias resolution) are a different surface, crash-loud rather than fail-open on prototype names, and out of this charter.

**R4 (Codex, 2026-08-02, VERDICT: BLOCKING; one finding, probe-backed, ACCEPTED; S1 scope sweep, exact values, and prototype refusal all verified held against the shipped guard):**

1. **BLOCKING — governance could be laundered through non-claiming run prose.** The R3 derivation used a bare spec-path regex over run text, so it credited claims the guards do not recognize: the reviewer parked the live `MODAL_PREFETCH_E2E` pair on an `echo` step that PRINTS the eight governed spec paths — governance equality passed, pair presence passed, both layers clean, while the real Playwright step ran flagless and the prefetch spec self-skipped. **Disposition — one recognizer, shared:** the scan loop's claim recognizer is extracted as `claimedSpecsOf` (command-position `INVOKER_SEG`, pnpm alias recursion, whole-config literal on the top-level run block only — the fold into alias bodies was caught pre-commit by the ratified wrapped-literal fixture) and `envPairGovernance` now derives THROUGH it; prose mentions confer nothing. Live-seed consequence: the `BRANCH` row's governance claim was itself prose-derived and dropped to `[]` on re-derivation — the reviewer's class, demonstrated on the seed. S8 gains the echo-park launder twin and the alias-positive twin (§4.2). This is the R17-class lesson (derivation diverging from the layer it mirrors) applied to hygiene.

**R3 (Codex, 2026-08-02, VERDICT: BLOCKING; one finding, probe-backed, ACCEPTED; R1/R2 repairs verified held; probed the SHIPPED implementation):**

1. **BLOCKING — pinned pairs were not bound to their governing site.** The R2 value-pin closed the flip but not RELOCATION: the reviewer moved `MODAL_PREFETCH_E2E: "1"` from the claiming job to each of the nine modeled sites in turn — pair-level hygiene stayed green (the pair IS live, somewhere), both layers stayed clean, and the prefetch spec self-skips on ABSENCE (`published-review-modal.prefetch.spec.ts` `test.skip`), a green run with the claimed spec skipped. **Disposition — bind pairs to observed governance, judgment-free:** rows gain `governs` (the derived spec set each key's env scope gates); hygiene asserts set EQUALITY against a fresh derivation via pure `envPairGovernance` + `governanceViolations`, so relocation AND silent governance-gain both red and force a reviewable registry edit (§2.0/§2.3); family S8 pins the mutant with doctored-tree twins. Scan-time semantics unchanged — absence stays a hygiene-layer contract (a per-scan absence refusal would require modeling which env each spec REQUIRES, which is test-code semantics, the boundary this arc holds). The attacker-edits-the-registry residual is the standing trust model of every registry row (reviewable diff), unchanged.

**R2 (Codex, 2026-08-02, VERDICT: BLOCKING; one finding, probe-backed, ACCEPTED; R1 repairs verified held):**

1. **BLOCKING — two mandatory seed keys violated the allowlist's own name-inertness contract.** `MODAL_PREFETCH_E2E` and `MODAL_REALTIME_E2E` (seeded from `published-modal-e2e.yml`, consumed by `test.skip` in the two published-review-modal specs) are value-sensitive by design: the reviewer's live mutant set each to `0` and got a green run with no tests while both layers reported clean at every modeled scope — so seeding all 35 keys + "every row asserts name-inertness" + "no live workflow changes" + "live-green" were mutually inconsistent. **Disposition — close the class, not the two instances (structural-defense-at-first-occurrence):** rows now pin exact (key, value-TEXT) pairs (§2.0); a novel value fails closed like a novel key, so ANY flag-class key's value flip reds the guard with no per-key inertness judgment left to make. LS1 rewritten to the text-pinning contract; hygiene extends to pair-level staleness (§2.3); new mutation family S7 (value-pin deletion) pins the reviewer's exact mutant; §1.1 ratifies the value-pinned design and fences it against relitigation toward expression modeling. The residual (hostile secret CONTENT behind a pinned expression) is documented in LS1 as out of universe.
