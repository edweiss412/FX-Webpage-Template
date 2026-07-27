# CI-dark descoped items — close-out of the four backlog entries

<!-- spec-lint: not-ui — no UI surface is modified; components/ and app/ citations are incidental (import-graph tracing for the harness resolver and Server Action directive verification). Same posture as the parent spec's waiver. -->

**Status:** draft for adversarial review · **Owner ratification:** 2026-07-26, "looks good ship autonomously" (all four items, sequenced; autonomous pipeline per AGENTS.md gate)
**Parent:** `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §10 (the descope record) and the BACKLOG.md section "Descoped from the CI-dark coverage cluster (2026-07-26)".

This spec re-attempts the four items the parent cluster descoped after four adversarial rounds
(37 accepted findings). Every mechanism proposed here is one the descope record's own "fix
direction if resumed" lines name, or one that dissolves a recorded counterexample rather than
patching around it. Nothing below re-litigates the descoped mechanisms themselves: the path-rule
resolver, the shell-semantics reader, and the env-var enumeration stay dead.

---

## §1 Problem

Four backlog items record guard gaps that were designed, built, measured, and descoped because
the mechanism tried at the time could not be made sound:

1. `BL-HARNESS-RESOLVER-POLICY` — no sound rule for stubbing server-only modules in browser
   harness bundles.
2. `BL-HARNESS-PACKLIST-SERVER-GRAPH` — `packlist-rescan-recovery.spec.ts` is in no config and
   no workflow; genuinely dark.
3. `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` — a spec nobody registers in any config runs
   nowhere, and no detector existed that could see it.
4. `BL-CI-VITEST-EXCLUSION-COVERAGE` — nothing proves an `ENV_BOUND_EXCLUDES` entry
   (`vitest.projects.ts:48`) runs anywhere; `tests/admin/test-auth-gate.test.ts` runs nowhere
   today.

Plus the parent's honest ceiling `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`: a Playwright config
narrowing on a variable only GitHub sets is invisible to any local probe by construction.

### §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| All four items in scope, sequenced as three PRs (PR-A guards, PR-B vitest-exclusion, PR-C resolver+packlist). | Owner, this arc's brainstorm, 2026-07-26. |
| Autonomous pipeline; spec/plan user gates waived. | Owner: "looks good ship autonomously", 2026-07-26; AGENTS.md brainstorming gate. |
| The `liveEntryToolchain.ts` header's "DELIBERATELY NOT a resolver policy" (`tests/e2e/helpers/liveEntryToolchain.ts:15`) is superseded **for the directive rule only**. What that header descoped is the PATH-heuristic policy; §5 introduces a different mechanism whose stub surface is decided by the module's own `"use server"` directive, and §2.3 shows both recorded overmatch counterexamples dissolve under it. The header text is updated by PR-C. | This spec §5; BACKLOG `BL-HARNESS-RESOLVER-POLICY` "fix direction if resumed" names a graph/semantic rule as the revival path. |
| Descoped mechanisms stay descoped: no path-rule resolver, no shell-semantics modelling of `run:` blocks, no env-var enumeration for narrowing detection. Each §-design below states what it does INSTEAD. | Parent spec §10; BACKLOG measurements. |
| No writes to `feat/ci-pgcron-coverage` (#613, PR3) or the PR4 surfaces (`admin-lifecycle-transitions`, `attention-modal-gallery`, dev-gate schedule) — owned by a concurrently live session. PR-B branches only after #613 merges (same file: `vitest.projects.ts`). | Two-sessions protocol; live marker `sessionId 3fa9659a…` in that worktree. |
| `BL-CHILDLESS-GROWABLE-STATIC-GUARD` (BACKLOG.md, separate section) is NOT in scope. | Owner selected only the descoped-cluster section. |
| Counts in §2 are provenance, not contract — guards derive membership at runtime; the committed baseline (§4.2) is the one deliberate exception and its maintenance story is stated there. | Parent spec §2 discipline. |

---

## §2 Measured inventory (2026-07-26, worktree at `396416778`)

### §2.1 Config membership by observation

`pnpm exec playwright test --config <cfg> --list --reporter=json` resolves membership without
booting browsers or the `webServer` (measured ~1.1 s for the standalone config):

| Config | Spec files resolved |
| --- | --- |
| `tests/e2e/standalone.config.ts` | 30 (423 tests) |
| `playwright.config.ts` (default) | 62 |
| `playwright.screenshots.config.ts` | 7 (5 spec files + 2 setup files) |

Disk holds **91** `tests/e2e/**/*.spec.ts` files; the three-config union covers **88**; **3** are
dark:

1. `tests/e2e/packlist-rescan-recovery.spec.ts` — known; the `BL-HARNESS-PACKLIST-SERVER-GRAPH`
   subject. PR-C restores it.
2. `tests/e2e/report-modal.spec.ts` — **a live instance of the bug class, found by this spike.**
   Its allowlist row (`tests/ci/_metaE2eWorkflowCoverage.test.ts:85`, reason `UNSEEN` =
   app-dependent local-only) claims it runs locally; it is a member of NO config, so even a
   local `pnpm exec playwright test` never resolves it. The row's premise is false today.
3. `tests/e2e/screenshots-help-capture.spec.ts` — deliberate third-config membership
   (`playwright.config.ts:161` documents that the WebP-writing project lives only in the
   screenshots config). Dark only to a two-config union; resolved by unioning all three.

### §2.2 The `"use server"` boundary, verified per module

Every Server Action module the harness graph reaches carries a module-level directive:
`app/admin/show/[slug]/_actions/useRaw.ts:24`, `app/admin/onboarding/_actions/useRawStaged.ts:30`,
`app/admin/show/[slug]/_actions/roleToken.ts:21`,
`app/admin/onboarding/_actions/roleTokenStaged.ts:16`,
`app/admin/settings/_actions/roleTokenMappings.ts:14`. The client components that import them:
`components/admin/UseRawControlBoundary.tsx:33` and `components/admin/UseRawControlBoundary.tsx:34`, and
`components/admin/RoleRecognizeControlBoundary.tsx:34` through
`components/admin/RoleRecognizeControlBoundary.tsx:36`.

A `"use server"` module may export ONLY async functions and types — recorded contract
(`feedback_use_server_module_cannot_export_sync_predicate`; enforced by Next at build). The
production client bundle never contains these modules: Next compiles the import into an RPC
reference (`components/admin/UseRawControlBoundary.tsx:12` documents exactly this pattern).

### §2.3 The two recorded overmatch counterexamples, re-examined under the directive rule

- `lib/drive/driveFolderUrl.ts` (pure string function, loud-failure instance): carries no
  directive, is never stubbed, keeps bundling as real code. Non-instance.
- `SHOW_NOT_FOUND` at `app/admin/show/[slug]/_actions/shared.ts:35` (the silent shape): its
  module's own header says "NOT a `"use server"` module" (`shared.ts:5`), so it is never
  stubbed and the constant stays real. Non-instance.

The silent-consumption hole itself (`flags.code === proxyStub` quietly false) requires a
non-function export to consume without calling. Under the directive rule the stub surface
exports only async functions; a function's realistic consumptions are call (throws loudly,
§5.2) or reference-pass (inert until called). The hole has no instance shape left.

### §2.4 The vitest exclusion array and its two remaining entries

`ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48`) lists three files; #613 (PR3, in flight) removes
`pg-cron-coverage.test.ts`, leaving two:

- `tests/admin/test-auth-gate.test.ts` — runs NOWHERE (no workflow names it; excluded from
  `unit-suite.yml` via `VITEST_EXCLUDE_ENV_BOUND: "1"` at `unit-suite.yml:122` and
  `unit-suite.yml:152`).
  Internally it is already two layers: Layer 1, deterministic route-handler tests needing no
  server (`tests/admin/test-auth-gate.test.ts:201`); Layer 2, HTTP positive-path suite that
  self-skips when the dev server is unreachable (`describe.skipIf(!isReachable)` at
  `tests/admin/test-auth-gate.test.ts:535`).
- `tests/cross-cutting/email-canonicalization.test.ts` — runs on every PR in the
  `x5-email-canonicalization` job (`.github/workflows/x-audits.yml:204`): the job-level `if:` at
  `x-audits.yml:205` only excludes `schedule` events, and the `| tee` at `x-audits.yml:231` sits
  under `set -o pipefail` (`x-audits.yml:230`), so the exit code is not suppressed. The file IS
  covered in fact; it is the scanner's qualification rules that cannot see it.

### §2.5 Toolchain integration point

`bundleLiveEntry` invokes the esbuild CLI via `execFileSync` with `--alias:` flags
(`tests/e2e/helpers/liveEntryToolchain.ts:81`). The CLI cannot host plugins; the directive rule
needs `onLoad`, so PR-C moves the helper to esbuild's JS API (same package, same pinned
devDependency version — no new binary names; `tests/e2e/_metaLiveEntryToolchain.test.ts`
restricts binary-naming to this helper, which is unchanged by an API-instead-of-CLI call).

---

## §3 PR-A, part 1 — unregistered-spec detector (`BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC`)

### §3.1 Mechanism: registration by observation

A new meta-test tests/ci/\_metaSpecRegistration.test.ts (created by PR-A):

1. Enumerates `tests/e2e/**/*.spec.ts` on disk (filesystem walk, so a NEW spec fails by
   default — same posture as the mutation-surface meta-test).
2. Resolves membership of each of the three configs with
   `playwright test --config <cfg> --list --reporter=json` in a child process, unioning file
   paths normalized against each report's `rootDir`.
3. Asserts every disk spec is a member of the union OR of `DARK_SPEC_ALLOWLIST`, a
   reason-and-backlog-ref-keyed record seeded with exactly one row:
   `packlist-rescan-recovery.spec.ts` → `BL-HARNESS-PACKLIST-SERVER-GRAPH` (deleted again by
   PR-C).
4. Asserts the reverse: no allowlist row for a spec that IS resolved (shadowing), and no row for
   a file that does not exist (stale) — the same three-way discipline as
   `tests/ci/_metaE2eWorkflowCoverage.test.ts:139` through
   `tests/ci/_metaE2eWorkflowCoverage.test.ts:146`.

**Config-set tripwire.** The three config paths are a hardcoded list, guarded: the test also
globs `playwright*.config.ts` at repo root plus `tests/e2e/*.config.ts` and asserts the glob set
equals the hardcoded set — a fourth config file appearing anywhere reds the guard until it is
added to the union. (This is the allowlist-shapes posture: enumerate what exists, fail on
novelty, never silently widen.)

**Why this detector is sound where both previous attempts were not.** The two failed detectors
tried to recognize a self-contained spec by its CONTENT ("calls the toolchain helper",
"imports `node:http`") — predicting harness shape. This one never inspects a spec at all: it
asks Playwright what each config resolves — the same observe-don't-parse move that closed the
guard-hole class in `tests/ci/_standaloneConfigProbe.ts` — and treats disk-minus-resolved as the
defect. `page.setContent` harnesses, `data:` navigation harnesses, and every future shape are
covered identically because the detector never needs to know what a harness looks like.

### §3.2 The `report-modal.spec.ts` disposition

Primary: register it — add a `testMatch` branch to whichever default-config project carries the
crew-page app-dependent specs, verified at implementation time by running the spec locally
against a dev server before the registration commit. Its workflow-coverage row at
`tests/ci/_metaE2eWorkflowCoverage.test.ts:85` then keeps the SAME `UNSEEN` reason it has today,
now with a true premise (config-resolvable, app-dependent, local-only).
Fallback (if the spec is broken after its long dark period): move it to `DARK_SPEC_ALLOWLIST`
with a fresh backlog entry recording the measured failure — honesty over silent registration.
The plan carries both branches; the detector is green either way, which is the point of
seeding dispositions rather than hardcoding outcomes.

---

## §4 PR-A, part 2 — env-narrowing baseline (`BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`)

### §4.1 Mechanism: verify in the environment, not predict it locally

The backlog entry's own "if picked up" line names this fix: compare the CI run's own resolved
membership against a committed baseline. Enumeration of narrowing variables is what failed three
times and is not attempted.

- **Committed baseline:** tests/e2e/standalone-baseline.json (new file) — the sorted spec-file
  list (not a bare count: a list pinpoints WHICH spec vanished, and the count is derivable).
- **Local side:** a case in tests/ci/\_metaSpecRegistration.test.ts (or its own meta-test —
  plan decides file placement) asserts baseline == local `--list` resolution of the standalone
  config. Adding a spec without regenerating the baseline reds this locally and in `unit-suite`.
- **CI side:** a new step in `.github/workflows/standalone-e2e.yml`, BEFORE the run step, runs
  the `--list` comparison under the real Actions environment via a small new script
  (scripts/check-standalone-baseline.mjs) so the workflow diff is one `run:` line.
- **Transitivity:** local test proves `baseline == local resolution`; the CI step proves
  `baseline == CI resolution`; together `local == CI` — exactly the claim §10b of the parent
  spec records as unprovable from a developer machine alone.

### §4.2 Scanner and workflow contract

The run command literal at the bottom of `standalone-e2e.yml` stays byte-identical —
`WHOLE_CONFIG_RE` (`tests/ci/_workflowCoverageScan.ts:74`) anchors `^pnpm exec playwright test
--config (\S+)$`, and the baseline step is a separate `run:` naming a `node` script, which the
scanner does not read as a spec invocation and which carries no trailing pipe. Verified at plan
time by running `scanWorkflowCoverage` over the edited workflow in the TDD step that touches it.

Baseline maintenance cost, owned: adding/removing a standalone spec now requires regenerating
one JSON file, enforced fail-loud on both sides. The script gains a
`--write` mode so the regeneration is one command.

---

## §5 PR-C — the directive resolver (`BL-HARNESS-RESOLVER-POLICY`) and the packlist restore (`BL-HARNESS-PACKLIST-SERVER-GRAPH`)

### §5.1 The rule

Stub a module **iff its source carries a module-level `"use server"` directive.** This is not a
heuristic about where server code lives; it is the semantic Next.js itself applies when a client
module imports a Server Action module — production's client bundle contains an RPC reference,
never the module body. The harness reproduces the same boundary with a throwing stub, making the
harness bundle MORE faithful to the production client bundle than bundling the real module would
be.

Detection: TypeScript compiler API (`ts.createSourceFile`), directive = a leading
`ExpressionStatement` string literal `"use server"` in the module's directive prologue. No
regex over source — the regex-comment-stripping class
(`feedback_regex_comment_stripping_does_not_survive_tsx`) stays dead. A cheap substring
pre-filter (`source.includes('"use server"')`) bounds the parse cost; the parse is the decider.

### §5.2 The stub

Per stubbed module, generated at bundle time from the module's OWN parsed exports:

- For each exported async function name `f`: `export const f = async () => { throw new Error("[harness] server action 'f' invoked in a browser harness bundle; this boundary is an RPC in production") }`.
- Type-only exports need nothing (erased).
- Any OTHER export shape found (const, sync function, class) is a hard bundle-time ERROR, not a
  silent pass — that module violates the Server Action export contract, and the harness refuses
  to guess.

Soundness inventory against the three recorded holes:

| Recorded hole | Status under §5.1–§5.2 |
| --- | --- |
| Proxy consumable without a call | No proxy exists. Named exports are real async functions; non-call consumption of a function value (truthiness, identity, `.bind`) does not alter behavior until called, and a call throws. The export-shape ERROR closes the non-function residue. |
| Strict stub breaks esbuild named-export resolution | Stub carries real named exports parsed from the module source; esbuild resolves them like any module. |
| Path-rule overmatch (both named instances) | §2.3: neither module carries the directive; neither is stubbed. Zero overmatch surface by construction — the app author, not the harness, declares the boundary. |

What the rule does NOT claim, stated for the guard's honesty: a client module importing
server-reaching code WITHOUT a `"use server"` boundary still bundles it (and typically fails the
build loudly on node builtins — the four-in-sequence failure chain in the BACKLOG entry). That
is production-faithful: Next would bundle it too (or reject the build), and the harness must not
hide an app-code defect behind a stub.

### §5.3 Helper change

`bundleLiveEntry` moves from the esbuild CLI to the esbuild JS API (§2.5) so the plugin can run.
Call-site contract unchanged: `aliases` (explicit, per call site) still win — the plugin skips
any specifier an alias already covers. `tests/e2e/_metaLiveEntryToolchain.test.ts`'s assertions
are re-pointed at the API invocation; its binary-naming ban is unchanged.

### §5.4 The packlist restore

With the boundary stubbed at `useRaw.ts` / `useRawStaged.ts` (the two actions
`step3ReviewSections.tsx` reaches via `components/admin/UseRawControlBoundary.tsx:33` and
`components/admin/UseRawControlBoundary.tsx:34`), the recorded chain
to `googleapis` (913 metafile inputs) and `postgres` is cut at its entry. Acceptance is
measured, not asserted:

1. `_packListRescanLiveEntry.tsx` bundles with the plugin active; the esbuild **metafile** shows
   no input under `node_modules/googleapis`, `node_modules/postgres`, or `lib/sync/` reached via
   a value import (type-only edges are fine and invisible to the metafile anyway).
2. The spec runs green in a real browser locally and in the standalone CI job.
3. `packlist-rescan-recovery.spec.ts` returns to `tests/e2e/standalone.config.ts` `testMatch`
   (`standalone.config.ts:83`); its `DARK_SPEC_ALLOWLIST` row (§3.1) and its
   `LOCAL_ONLY_ALLOWLIST` row (`tests/ci/_metaE2eWorkflowCoverage.test.ts:75`) are both deleted;
   the §4 baseline is regenerated in the same commit (the local baseline test forces this).

If a parallel NON-directive value edge to `postgres` survives the stub (the BACKLOG entry's "ten
distinct `lib/sync/*` modules" concern), that is an app-code import-graph defect
(client component importing server module without a boundary): fix the edge in the same PR if it
is a one-line import split, else file it with the metafile trace and keep the spec dark — the
rule itself is not widened to compensate. **Import-graph reality check before any of this:**
the plan's first PR-C task bundles the entry with the plugin and reads the metafile; every
subsequent task conditions on that measurement.

### §5.5 Guard

A meta-test pins the resolver contract: (a) a fixture module with a `"use server"` directive
bundles to a throwing stub whose export names equal the fixture's; (b) a fixture with the
directive and a non-function export makes the bundle FAIL; (c) a directive-free fixture bundles
its real body byte-for-byte (no stub); (d) a directive in a nested string/comment does NOT
trigger (parse, not grep). Mutation check per the guard-design ledger: break the plugin (make it
skip stubbing) and confirm (a) reds.

---

## §6 PR-B — vitest exclusion coverage (`BL-CI-VITEST-EXCLUSION-COVERAGE`)

### §6.1 Mechanism: registry + the runner as the execution oracle

What failed three times was PREDICTING execution by reading shell. What is decidable: (i)
resolved-config membership under the exact env CI sets (measured in the parent: env unset → 8
tests pass; `VITEST_EXCLUDE_ENV_BOUND=1` → "No test files found", exit 1), and (ii) vitest's own
exit-1-on-empty-resolution semantics, which make a PASSING dedicated `vitest run <file>` step an
in-environment existence proof no shell reading can fake — `false && vitest run <f>` skips the
step's purpose but then the registry check (below) fails the build ANYWAY, because the registry
is verified against the workflow's parsed step list, not its shell semantics: the row must name
a workflow, a job, and a step whose `run:` is EXACTLY `pnpm vitest run <file>` (string equality
after trim, the same exact-literal posture as `WHOLE_CONFIG_RE`), with no `if:` on the step, no
`continue-on-error`, and no pipe — all four properties checked structurally on the parsed YAML.
Exact string equality is what kills the `false &&` prefix, the `|| true` suffix, and every other
composition: any decoration makes it not the literal.

New meta-test tests/ci/\_metaEnvBoundExclusionCoverage.test.ts (created by PR-B):

1. Imports `ENV_BOUND_EXCLUDES` from `vitest.projects.ts` (value import, not source scan).
2. Asserts every entry has exactly one row in `ENV_BOUND_COVERAGE_REGISTRY` (same file), each
   row either `{ workflow, job }` (verified as above) or `{ dark: true, backlogRef }` — and a
   dark row is a RED test, not a pass: it exists only so the failure message names the backlog
   entry. The array must not grow a dark row silently; the test fails while one exists, matching
   the item's "runs nowhere is the defect" framing.
3. Asserts no registry row for a file not in the array (stale-row check).

### §6.2 Dispositions for the two entries

- `tests/admin/test-auth-gate.test.ts` — **primary: delete its exclusion row entirely.** Layer 2
  already self-skips without a server (`test-auth-gate.test.ts:535`), so the file can run in
  `unit-suite` with Layer 1 asserting and Layer 2 skipping — IF the `isReachable` probe is
  fast and non-flaky under CI (implementation-time measurement: run the file 5× with
  `VITEST_EXCLUDE_ENV_BOUND` unset in a network-denied env). Fallback: split Layer 1 into
  a new tests/admin/test-auth-gate.deterministic.test.ts (runs everywhere), keep the HTTP layer
  excluded with a registry row pointing at the e2e path that exercises the endpoint. Either
  branch ends with zero dark entries.
- `tests/cross-cutting/email-canonicalization.test.ts` — a dedicated verbatim step
  `pnpm vitest run tests/cross-cutting/email-canonicalization.test.ts` added to the
  `x5-email-canonicalization` job (`.github/workflows/x-audits.yml:204`), replacing its
  membership in the aliased-and-piped audit step for coverage purposes (the audit alias keeps
  running it too — harmless double execution, ~seconds). Registry row points at the new step.
  The job's `if: github.event_name != 'schedule'` (`x-audits.yml:205`) is a JOB-level guard; the
  registry's verifier accepts a job-level `if` only when it is exactly this schedule-exclusion
  literal (runs on every PR — the property the guard exists to protect), and rejects any other.

### §6.3 Sequencing

PR-B branches after #613 merges: both touch `vitest.projects.ts`, and #613's whole point is
deleting the third array entry. If #613 is still open when PR-A completes, PR-C goes first —
no shared surface between PR-C and #613.

---

## §7 Meta-test inventory

| File | Change | PR |
| --- | --- | --- |
| tests/ci/\_metaSpecRegistration.test.ts | created — disk specs ⊆ three-config union ∪ dark-allowlist; config-set tripwire; shadow/stale row checks; standalone baseline == local resolution | PR-A |
| tests/e2e/standalone-baseline.json + scripts/check-standalone-baseline.mjs | created — committed membership list; `--write` regen; CI-side comparison step in `standalone-e2e.yml` | PR-A |
| tests/ci/\_metaEnvBoundExclusionCoverage.test.ts | created — registry totality over `ENV_BOUND_EXCLUDES`; exact-literal step verification; dark rows are red | PR-B |
| resolver contract meta-test (file placement per plan, under `tests/e2e/`) | created — §5.5 (a)–(d) | PR-C |
| `tests/e2e/_metaLiveEntryToolchain.test.ts` | edited — assertions follow the CLI→JS-API move; binary ban unchanged | PR-C |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | edited — packlist row deleted (PR-C); `report-modal` row premise restored or replaced per §3.2 (PR-A) | PR-A, PR-C |

## §8 Acceptance criteria

1. A new `tests/e2e/**/*.spec.ts` file registered in no config reds `unit-suite` locally and in
   CI, naming the file and the three configs it is absent from. (Mutation-verified: temp file.)
2. A standalone-config narrowing that only manifests under Actions env reds the
   `standalone-e2e` job's baseline step; the same edit with the baseline regenerated reds the
   local baseline test until the list matches. (Mutation-verified in CI via a
   `workflow_dispatch` run on a scratch branch carrying a `GITHUB_EVENT_NAME`-conditioned
   narrowing — the exact mutation the backlog entry names as invisible today.)
3. Every `ENV_BOUND_EXCLUDES` entry has a verified execution home; the array reaching a state
   where an entry runs nowhere is a red `unit-suite`, not a silent fact. `test-auth-gate`
   Layer 1 executes in CI again (either disposition).
4. `packlist-rescan-recovery.spec.ts` runs in the standalone CI job, green, with a metafile
   clean of `googleapis`/`postgres` inputs; `BL-HARNESS-PACKLIST-SERVER-GRAPH` and
   `BL-HARNESS-RESOLVER-POLICY` close in BACKLOG.md with the resolver's contract cited.
5. All four BACKLOG entries (plus the env-narrowing entry) move to resolved with pointers to
   the shipped guards; the parent spec's §10b ceiling paragraph gains a supersession note.
6. Real CI green on each PR (local green is necessary, not sufficient — CI-bound surface rule),
   and each merge fast-forwards local `main` to `0 0`.

## §9 Out of scope

- Restoring `report-modal.spec.ts` to a WORKFLOW (it gains config membership, not CI execution;
  its app-dependent allowlist row remains, truthful again). The 60-row app-dependent umbrella
  (`BL-E2E-LIFECYCLE-SPECS-CI-DARK`) is untouched.
- Any generalization of the directive rule to `"server-only"` package imports, poisoned
  imports, or graph-transitive stubbing — explicitly rejected; §5.2's honesty paragraph is the
  contract.
- PR3/PR4 surfaces (live in the sibling session).
- The `x5` job's scanner-visibility for the AUDIT alias itself (the §6.2 verbatim step makes the
  FILE visible; teaching the scanner to qualify `tee`-under-pipefail stays dead per the shell-
  semantics descope).
