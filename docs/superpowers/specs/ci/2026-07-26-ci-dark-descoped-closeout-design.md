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

| Config | Files resolved (specs + config-declared setup files) |
| --- | --- |
| `tests/e2e/standalone.config.ts` | 30 (423 tests) |
| `playwright.config.ts` (default) | 62 (includes 2 setup files) |
| `playwright.screenshots.config.ts` | 7 (5 spec files + 2 setup files) |

Disk holds **91** `tests/e2e/**/*.spec.ts` files. The spike's first pass unioned only the
FIRST TWO configs and found 3 unresolved; the full THREE-config union resolves
`screenshots-help-capture.spec.ts` as well (adversarial R3 F7 measured 89 of 91 at HEAD), so
the detector's actual dark set is **2**:

1. `tests/e2e/packlist-rescan-recovery.spec.ts` — known; the `BL-HARNESS-PACKLIST-SERVER-GRAPH`
   subject. PR-C restores it.
2. `tests/e2e/report-modal.spec.ts` — **a live instance of the bug class, found by this spike.**
   Its allowlist row (`tests/ci/_metaE2eWorkflowCoverage.test.ts:85`, reason `UNSEEN` =
   app-dependent local-only) claims it runs locally; it is a member of NO config, so even a
   local `pnpm exec playwright test` never resolves it. The row's premise is false today.
(A third file, `tests/e2e/screenshots-help-capture.spec.ts`, is NOT dark: it is deliberate
third-config membership — `playwright.config.ts:161` documents that the WebP-writing project
lives only in the screenshots config. It appeared unresolved only to the spike's initial
two-config union, and is why the detector unions all three configs.)

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

### §2.5 Toolchain integration points — there are TWO, and one already elides directives by regex

`bundleLiveEntry` invokes the esbuild CLI via `execFileSync` with `--alias:` flags
(`tests/e2e/helpers/liveEntryToolchain.ts:81`). The CLI cannot host plugins, and esbuild's
synchronous JS API rejects plugins outright (adversarial R1 F4; the installed esbuild's
main.js throws on `plugins` in sync calls), so §5.3 keeps the
helper's synchronous void contract and moves the plugin build into a child `node` script —
the same process boundary the CLI call already crosses.

The second integration point, found by adversarial R1 F3: `tests/e2e/_step3ReviewModalBundle.mjs`
already ships a `useServerElision` esbuild plugin that replicates Next's directive elision —
with a regex comment-stripper prologue scan (`_step3ReviewModalBundle.mjs:51`) and regex export
discovery (`_step3ReviewModalBundle.mjs:66`-ish), exempted by name in
`tests/e2e/_metaLiveEntryToolchain.test.ts:37`. It is invoked from
`tests/e2e/step3-review-modal.interactions.spec.ts`, a resolved standalone-config member. A
repo sweep for other ad-hoc bundlers (`rg -l esbuild tests/e2e -g '*.mjs'`) returns only this
file. §5.3a consolidates it onto the shared parser-based plugin; closing
`BL-HARNESS-RESOLVER-POLICY` while this regex resolver survived would have been false.

### §2.6 Session spike measurements (2026-07-26, this worktree)

- **Directive-resolver prototype over the packlist entry:** esbuild JS API + a
  TypeScript-parse directive plugin bundles `tests/e2e/_packListRescanLiveEntry.tsx`
  successfully: 1908 metafile inputs, **zero** under `node_modules/googleapis`,
  `node_modules/postgres`, or `node_modules/google-auth-library`. SIX modules stubbed — the
  five §2.2 names plus `lib/auth/picker/resetCrewMemberSelection.ts`, which no static pass had
  found (the plugin finds directives by construction, not by list). All six export ONLY
  `export async function` declarations (no other shape in live code today). One explicit alias
  was required: `node:crypto` mapped to the existing `tests/e2e/_nodeCryptoStub.ts`, the exact
  precedent `tests/e2e/compact-alert-card-layout.spec.ts:67` already uses. The surviving
  `lib/sync` value imports (`lib/sync/roleMappingOverlay.ts`, `lib/sync/pullSheetOverride.ts`)
  bring no server package into the graph.
- **SWC directive-semantics probe (R5):** Next's installed `transformSync` (from the
  next/dist/build/swc module) with
  `serverActions: { isReactServerLayer: false, isDevelopment: false, useCacheEnabled: false,
  hashSalt: '', cacheKinds: [] }` over three sources: `"use server"` → server-action output
  (`createServerReference`), hex-escaped `"use\x20server"` → server-action output, `"not
  server"` control → plain. SWC matches the directive's COOKED text; §5.1 follows the
  platform, and this probe is the fixture oracle for guard case (g).
- **`test-auth-gate` without a server:** `pnpm vitest run tests/admin/test-auth-gate.test.ts
  --project serial`, three consecutive runs: 24 passed / 3 skipped, 1.56 s / 0.70 s / 0.73 s.
  The Layer-2 probe fails fast (2 s abort ceiling, instant connection-refused on loopback) and
  the file is green-with-skips, stable. §6.2's primary disposition rests on this measurement.

---

## §3 PR-A, part 1 — unregistered-spec detector (`BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC`)

### §3.1 Mechanism: registration by observation

A new meta-test tests/ci/\_metaSpecRegistration.test.ts (created by PR-A):

1. Enumerates test-shaped files on disk: every file under `tests/e2e/` matching Playwright's
   OWN default matcher — `**/*.@(spec|test).?(c|m)[jt]s?(x)`, taken verbatim from the
   installed Playwright's common/config default (adversarial R3 F2: a hand-rolled extension
   list missed seven suffixes) — MINUS the exact extension pair the Vitest project globs
   claim, the test.ts and test.tsx forms (`vitest.projects.ts:34`). Filesystem walk, so a NEW
   spec fails by default — same posture as the mutation-surface meta-test. The subtraction is
   per adversarial R2 F1 (three live Vitest files sit under `tests/e2e/` today:
   `tests/e2e/_metaLiveEntryToolchain.test.ts` and the two
   `tests/e2e/helpers/liveEntryToolchain.*.test.ts` files — they run in `unit-suite` and are
   not dark), and it is EXACTLY the Vitest-claimed pair rather than all `.test.*`
   (adversarial R4 F1: the test.js, test.mjs, test.cts forms and seven siblings are accepted
   by Playwright but collected by NO Vitest glob, so they stay in the universe). Drift tie:
   a test case asserts the Vitest include globs still claim exactly that pair under
   `tests/`, so a Vitest glob change re-opens the subtraction rather than silently widening
   it. A Playwright spec misnamed `*.test.ts` cannot go SILENTLY dark either: the Vitest glob
   collects it and the `@playwright/test` API fails loudly outside a Playwright runner. **Deliberate universe
   boundary:** config-declared SETUP files (`screenshots-help-setup.ts`,
   `help-docs-setup.ts` — `testMatch` targets at `playwright.config.ts:136` and
   `playwright.config.ts:169`) are infrastructure, not tests; an unregistered setup file is
   dead code, not dark coverage, and stays out of the universe. The union side (step 2) is
   total regardless of extension or directory because Playwright itself resolves it.
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

**Config-set tripwire (rewritten per adversarial R1 F9 — observation, not a narrow glob).**
The three config paths are a hardcoded list, guarded two ways, and the prose claim is now
exactly the mechanism:

- **Invocation census:** extract every `--config`/`-c` argument of every `playwright test`
  invocation across `package.json` scripts and every `run:` block under `.github/workflows/`,
  plus the bare-invocation default (`playwright.config.ts`). Assert the extracted set equals
  the hardcoded trio. A Playwright config is only ever exercised through an invocation naming
  it (or the default), so a config invoked anywhere the repo's automation can invoke it is
  caught regardless of its filename or location.
- **Filename belt:** a repo-wide glob `**/playwright*.config.*` (node_modules excluded) must
  also equal the trio's conventional-named members — catches a conventionally-named config
  committed but not yet wired anywhere.

What this deliberately does not claim: a config with an unconventional name that is invoked by
NOTHING in the repo is invisible — and also runs nowhere, which is the dead-code case, not the
dark-test case.

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
  list AND the total test count, `{ files: [...], totalTests: N }`. The file list pinpoints
  WHICH spec vanished; the test count catches narrowing that keeps every file while dropping
  tests — an environment-conditioned `grep` that leaves one test per file, or
  environment-conditioned test generation, passes a file-only comparison (adversarial R1 F1).
  Both fields compared on BOTH sides below.
- **Local side:** a case in tests/ci/\_metaSpecRegistration.test.ts (or its own meta-test —
  plan decides file placement) asserts baseline == local `--list` resolution of the standalone
  config. Adding a spec without regenerating the baseline reds this locally and in `unit-suite`.
- **CI side — compare the RUN'S OWN REPORT, not a sibling probe (adversarial R3 F1; this is
  the backlog entry's named fix verbatim).** Adjacent steps do NOT share an environment:
  GitHub assigns per-step values (`GITHUB_ACTION`, `GITHUB_ENV`, `GITHUB_STEP_SUMMARY` paths
  change every step), so a `--list` in a sibling step — R1's design, R1-F2's pinning
  notwithstanding — could see full membership while the run step narrows. Instead:
  `tests/e2e/standalone.config.ts` adds a `json` reporter with a fixed `outputFile` alongside
  its current reporter (a CONFIG change; the run command literal is untouched), and a new step
  in `.github/workflows/standalone-e2e.yml` DIRECTLY AFTER the run step executes
  `node scripts/check-standalone-baseline.mjs` to compare the report the run itself produced —
  executed spec files and total test count — against the committed baseline. Whatever
  environment the run step had, the report records what actually ran in it; there is no second
  context to diverge.
- **Structural pinning.** The meta-test parses `standalone-e2e.yml` and asserts on the parsed
  YAML: (a) the comparison step exists with `run:` exactly
  `node scripts/check-standalone-baseline.mjs`; (b) it DIRECTLY FOLLOWS the whole-config run
  step; (c) neither step carries step-level `if:`, `env:`, `continue-on-error`, `shell:`, or
  `working-directory:`; (d) the workflow keeps a bare `pull_request` trigger (no `paths:`,
  `paths-ignore:`, `types:`, `branches:`, or `branches-ignore:`), and the job has no `needs:`,
  no `strategy.matrix`, no job-level `continue-on-error`, no `environment:` (adversarial R6
  F2: a protected environment can hold the job on manual approval so it never runs on an
  ordinary PR), and no `defaults.run.shell` /
  `defaults.run.working-directory` override at any level (adversarial R2 F3 classes). The
  json-reporter declaration is pinned by OBSERVATION: the `_standaloneConfigProbe`-style
  import asserts the evaluated config's `reporter` includes the json entry with the exact
  `outputFile`. Deleting or decorating the comparison step, or dropping the reporter, reds
  `unit-suite`, which is merge-blocking. (Default Actions behavior already skips the
  comparison step when the run step fails — a red run is loud on its own.)
- **The script itself is behaviorally pinned (adversarial R2 F4 — a no-op script satisfies
  every structural assertion while destroying the proof).** A unit-suite test executes
  scripts/check-standalone-baseline.mjs as a child process against fixture report/baseline
  pairs and asserts it EXITS NON-ZERO on (i) a baseline listing one spec the report lacks,
  (ii) a report containing one spec the baseline lacks, (iii) matching file lists with a
  mismatched total test count, and (iv) a missing or malformed report file — and exits zero
  on a full match. Guard-tests-the-real-control: the thing pinned is the script's rejection
  behavior, not its invocation.
- **Transitivity:** the local test proves `baseline == local resolution`; the post-run
  comparison proves `baseline == what the CI run actually executed`; together
  `local resolution == CI execution` — a STRONGER claim than R1's resolution-equality, and
  exactly the "verify in the environment rather than predict it locally" fix the backlog
  entry names.

### §4.2 Scanner and workflow contract

The run command literal in `standalone-e2e.yml` stays byte-identical —
`WHOLE_CONFIG_RE` (`tests/ci/_workflowCoverageScan.ts:74`) anchors `^pnpm exec playwright test
--config (\S+)$`, and the post-run comparison step is a separate `run:` naming a `node`
script, which the scanner does not read as a spec invocation and which carries no trailing
pipe. The json-reporter addition lives in the CONFIG, not the command. Verified at plan time
by running `scanWorkflowCoverage` over the edited workflow in the TDD step that touches it.

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
`ExpressionStatement` string literal in the module's directive prologue whose COOKED text is
exactly `use server` — either quote style (adversarial R1 F5) and any escape spelling.
**Measured, not assumed (adversarial R4 F2 → R5 F1):** the R4 draft matched RAW source text on
the ECMAScript use-strict convention; R5 disproved that premise against the installed
toolchain — Next's own `transformSync` with `serverActions` enabled compiles BOTH
`"use server"` and the hex-escaped `"use\x20server"` to `createServerReference` entries
(control literal stays plain; probe reproduced in this worktree, §2.6). SWC matches the
cooked text, so the harness matches the cooked text. Consequence: **no substring pre-filter
exists** — any code point of the literal can be escape-spelled, so no raw substring test is
sound, and every non-node_modules candidate file is parsed. The parse cost is bounded and
measured at plan time by re-running the §2.6 prototype without its (unsound) pre-filter. The
parse — not a regex over the file — decides placement in the prologue, so the
regex-comment-stripping class (`feedback_regex_comment_stripping_does_not_survive_tsx`) stays
dead. **Zero-diagnostics requirement (adversarial R6 F1):** the resolver stubs a module ONLY
when the parse produced no syntax diagnostics; a directive module whose source fails to parse
cleanly is a hard bundle-time ERROR, never a stub — TypeScript's recovering parser cooks
literals SWC rejects (octal-escape directives are invalid in module code) and recovers past
trailing garbage SWC refuses, so stubbing a diagnostic-bearing module could mask a production
build failure. Fail-closed matches production, which also fails. Guard case (e) in §5.5 pins
the single-quote form; guard case (g) pins that the escape-spelled `"use\x20server"` form
DOES stub, with the SWC probe as the recorded oracle for why; guard case (h) pins both
diagnostic-bearing counterexamples (octal-escape directive; valid directive with trailing
garbage) as bundle FAILURES.

### §5.2 The stub

Per stubbed module, generated at bundle time from the module's OWN parsed exports.
**Supported export grammar (adversarial R1 F6 — enumerated, everything else fail-closed):**

- `export async function f(...)` — stub as a named throwing async function.
- `export default async function` (named or anonymous) — stub as a throwing async default
  export.
- `export const f = <async arrow or async function expression>` — stub as a named throwing
  async function. (Next's own server-boundary rule accepts exported variables whose values
  are async functions; the syntactic async marker on the initializer is the decider here.)
- Type-only exports need nothing (erased).
- **Every other shape is a hard bundle-time ERROR**, not a silent pass: `export * from`,
  `export { f } from` re-export forwarding, local aliased `export { f as g }`, consts with
  non-async initializers, classes, sync functions. A syntax-only parse cannot classify these
  soundly, so the harness refuses to guess and names the module and the shape. Measured basis:
  all SIX live directive modules today export only `export async function` declarations
  (§2.6), so the error branch has zero live instances and exists to stay fail-closed as the
  app grows.

Soundness inventory against the three recorded holes:

| Recorded hole | Status under §5.1–§5.2 |
| --- | --- |
| Proxy consumable without a call | No proxy exists. Named exports are real async functions; non-call consumption of a function value (truthiness, identity, `.bind`) does not alter behavior until called, and a call throws. The export-shape ERROR closes the non-function residue. **Scope of this claim (adversarial R1 F7):** it holds for CLIENT-RENDERED harnesses — every live-entry harness mounts via `createRoot`, none server-renders. Production server references carry registration metadata (React's server-reference registry, `$$FORM_ACTION` inspection in react-dom's SSR path) that a plain throwing async function does not; reflection on that metadata, or SSR progressive-enhancement serialization, behaves differently and is OUTSIDE the guarantee. In a client render the realistic consumptions are call (throws — including `<form action={stub}>` submit, which React treats as a client action and invokes) and reference-pass (inert). Guard case (f) measures the form-action path rather than asserting it. |
| Strict stub breaks esbuild named-export resolution | Stub carries real named exports parsed from the module source; esbuild resolves them like any module. |
| Path-rule overmatch (both named instances) | §2.3: neither module carries the directive; neither is stubbed. Zero overmatch surface by construction — the app author, not the harness, declares the boundary. |

What the rule does NOT claim, stated for the guard's honesty: a client module importing
server-reaching code WITHOUT a `"use server"` boundary still bundles it (and typically fails the
build loudly on node builtins — the four-in-sequence failure chain in the BACKLOG entry). That
is production-faithful: Next would bundle it too (or reject the build), and the harness must not
hide an app-code defect behind a stub.

### §5.3 Helper change

`bundleLiveEntry` keeps its synchronous `void` signature and its call sites keep not awaiting
it (adversarial R1 F4: esbuild's synchronous JS API rejects plugins, so "move to the JS API in
place" was unimplementable as written). Instead the helper's `execFileSync` target changes
from the esbuild CLI to a small child `node` script (placed under `tests/e2e/helpers/`) that
calls the ASYNC `esbuild.build` with the directive plugin and the passed aliases, then exits.
Same process boundary as today, same blocking semantics, zero call-site churn. Precedent for
the child-script shape: `tests/e2e/_step3ReviewModalBundle.mjs` is already exactly this.
`aliases` (explicit, per call site) still win — the plugin skips any specifier an alias
already covers. `tests/e2e/_metaLiveEntryToolchain.test.ts`'s assertions are re-pointed at the
child script; its binary-naming ban is unchanged.

### §5.3a Consolidate the second resolver (adversarial R1 F3)

The directive-detection and stub-generation logic lives in ONE shared module (under
`tests/e2e/helpers/`), used by both the `bundleLiveEntry` child script and
`tests/e2e/_step3ReviewModalBundle.mjs`. The step3 bundler's regex `useServerElision` plugin
(`_step3ReviewModalBundle.mjs:51` comment-stripper, regex export scan) is DELETED in favor of
the shared parser-based plugin; its `emptyNodeBuiltins` handling stays as-is. The exemption
rationale row for it in `tests/e2e/_metaLiveEntryToolchain.test.ts:37` is rewritten to reflect
that it now consumes the shared plugin. Closing `BL-HARNESS-RESOLVER-POLICY` requires the
regex resolver class to actually END, not to survive in an exempted file.

### §5.4 The packlist restore

With the boundary stubbed at `useRaw.ts` / `useRawStaged.ts` (the two actions
`step3ReviewSections.tsx` reaches via `components/admin/UseRawControlBoundary.tsx:33` and
`components/admin/UseRawControlBoundary.tsx:34`), the recorded chain
to `googleapis` (913 metafile inputs) and `postgres` is cut at its entry. Acceptance is
measured, not asserted:

1. `_packListRescanLiveEntry.tsx` bundles with the plugin active; the esbuild **metafile** shows
   no input under `node_modules/googleapis`, `node_modules/postgres`, or
   `node_modules/google-auth-library` — the SERVER-PACKAGE criterion, not a blanket `lib/sync/`
   ban (adversarial R2 F2: the §2.6 spike measures two surviving client-safe `lib/sync` value
   imports, `lib/sync/roleMappingOverlay.ts` and `lib/sync/pullSheetOverride.ts`, whose
   subgraphs pull no server package; a blanket ban would contradict the measurement that
   defines success).
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

A meta-test pins the resolver contract: (a) fixture modules with a `"use server"` directive
bundle to throwing stubs whose export names equal the fixture's — ONE FIXTURE PER SUPPORTED
§5.2 SHAPE, enumerated exhaustively per adversarial R3 F3: named async declaration, NAMED
default async function, ANONYMOUS default async function, async-ARROW const, async
FUNCTION-EXPRESSION const, and a type-only-exports module (stubs to an empty module rather
than failing); (b) one FAILING fixture per unsupported §5.2 shape, also exhaustive:
`export { f } from` re-export forwarding, `export * from`, local aliased `export { f as g }`,
sync-initializer const, class declaration, and sync function declaration; (c) a directive-free fixture bundles
its real body byte-for-byte (no stub); (d) a directive in a nested string/comment does NOT
trigger (parse, not grep); (e) a SINGLE-QUOTED `'use server'` directive triggers identically
to the double-quoted form; (g) an escape-spelled directive-position literal (hex-escaped
space, `"use\x20server"`) DOES trigger — cooked-text matching per §5.1, verified against
Next's SWC behavior; (h) a diagnostic-bearing directive module FAILS the bundle rather than
stubbing — two fixtures per the R6 counterexamples: an octal-escape directive (TypeScript
cooks it, SWC rejects it) and a valid directive followed by trailing garbage (TypeScript
recovers, SWC refuses); (f) a client-rendered fixture passing a stubbed action to
`<form action={stub}>` and submitting produces the loud harness throw (the §5.2 form-action
consumption path, measured rather than asserted). Mutation check per the guard-design ledger:
break the plugin (make it skip stubbing) and confirm (a) reds.

---

## §6 PR-B — vitest exclusion coverage (`BL-CI-VITEST-EXCLUSION-COVERAGE`)

### §6.1 Mechanism: registry + the runner as the execution oracle

What failed three times was PREDICTING execution by reading shell. What is decidable: (i)
resolved-config membership under the exact env CI sets (measured in the parent: env unset → 8
tests pass; `VITEST_EXCLUDE_ENV_BOUND=1` → "No test files found", exit 1), and (ii) an
in-environment execution proof carried by the step itself. Vitest's bare exit code proves
COLLECTION, not execution — `passWithNoTests`, or a collected file whose tests ALL skip, exits
0 (adversarial R1 F11; both remaining entries contain conditional skips:
`tests/admin/test-auth-gate.test.ts:535` and the `livePsqlReachable` guards at
`tests/cross-cutting/email-canonicalization.test.ts:313` and two sibling rows). So the
registry step's literal is `pnpm run-excluded <file>` — a package.json alias for a small
script (scripts/run-excluded-test.mjs, created by PR-B) that runs vitest on the file with a
JSON reporter written to a temp file (no shell pipes), then asserts **at least one test
EXECUTED AND PASSED and zero failed**, exiting non-zero otherwise. `false && pnpm run-excluded
<f>` still cannot fake it, because the registry is verified against the workflow's parsed step
list, not its shell semantics: the row must name a workflow, a job, and a step whose `run:` is
EXACTLY `pnpm run-excluded <file>` (string equality after trim, the same exact-literal posture
as `WHOLE_CONFIG_RE`), with no `if:` on the step, no `continue-on-error`, and no pipe — all
checked structurally on the parsed YAML. Any decoration makes it not the literal.

**Job-and-workflow qualification (adversarial R1 F10 + R2 F3 — command text alone proves
nothing about whether the job runs, or runs where it claims).** The registry verifier
additionally requires, on the parsed workflow: a BARE `pull_request` trigger — no `paths:`,
`paths-ignore:`, `types:`, `branches:`, or `branches-ignore:` (adversarial R3 F4: a
`types: [closed]` or branch-filtered trigger passes a paths-only check while never running on
ordinary PRs; other triggers such as `schedule` may coexist, the `pull_request` KEY itself
must be bare); no job-level `if:` other than the exact schedule-exclusion literal
`github.event_name != 'schedule'`; no `needs:` on the job; no `strategy.matrix` conditioning;
no job-level `environment:` (a protected environment gates the job on approval — adversarial
R6 F2); no `continue-on-error` at STEP OR JOB level; no `working-directory` on the step and no
`defaults.run.working-directory` at workflow or job level (a redirected cwd re-points the
package alias and the relative test path); and no `defaults.run.shell` override at workflow or
job level. These are the same execution-override classes the existing scanner already
disqualifies (`tests/ci/_workflowCoverageScan.ts:141` and
`tests/ci/_workflowCoverageScan.ts:197` regions); the verifier reuses that machinery rather
than re-deriving it, EXTENDED with the `environment:` class, which the scanner's current
disqualifier set omits (adversarial R6 F2).

**The script and its alias are behaviorally pinned (adversarial R2 F4).** A unit-suite test
(i) asserts the `package.json` `run-excluded` script is EXACTLY `node
scripts/run-excluded-test.mjs` (alias-mapping pin — an alias rewired to a no-op passes the
step-literal check otherwise), and (ii) executes the script against fixture scenarios,
asserting non-zero exit on: a zero-passed report, an all-skipped report, a report with
failures, a missing/malformed report, AND a child vitest process that exits non-zero even
when its report shows passing tests (adversarial R3 F5: collection, setup, teardown, and
unhandled-runtime failures can coexist with passed test cases — the script requires BOTH
child exit 0 AND ≥1 passed with 0 failed). Zero exit only when both hold. Same
guard-tests-the-real-control posture as the §4.1 baseline-script pin.

**Honest ceiling, stated:** a green `pnpm run-excluded <file>` step proves the file resolved,
executed, and passed at least one test under that job's environment. It does not prove every
suite inside ran (env-conditional skips remain visible only in the JSON report). The plan adds
a per-file skip audit as a one-time task: enumerate each `skipIf` in the two files and confirm
the registry job's environment satisfies it or the skip is acceptable — for
`email-canonicalization`, whether the `x5` job's `TEST_DATABASE_URL` makes `livePsqlReachable`
true is resolved at plan time, not assumed.

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
  already self-skips without a server (`test-auth-gate.test.ts:535`), so the file runs in
  `unit-suite` with Layer 1 asserting and Layer 2 skipping. Measured this session (§2.6):
  three consecutive server-less runs, 24 passed / 3 skipped, worst 1.56 s, no flake — the
  probe fails fast on loopback connection-refused under a 2 s abort ceiling. The exclusion row
  and its registry question both disappear; the file is an ordinary unit-suite member.
  Fallback (only if CI shows flake the local measurement did not): split the file and PORT the
  HTTP layer's assertions to a Playwright e2e spec where a server exists, DELETING the vitest
  HTTP layer — the exclusion array loses the entry either way, the registry stays total, and
  nothing is dark. (The R1 draft's fallback — an excluded vitest file "covered" by an e2e spec
  that never executes it — was incoherent, adversarial R1 F12, and is withdrawn.)
- `tests/cross-cutting/email-canonicalization.test.ts` — a dedicated verbatim step
  `pnpm run-excluded tests/cross-cutting/email-canonicalization.test.ts` added to the
  `x5-email-canonicalization` job (`.github/workflows/x-audits.yml:204`), replacing its
  membership in the aliased-and-piped audit step for coverage purposes (the audit alias keeps
  running it too — harmless double execution, ~seconds). Registry row points at the new step.
  The job's `if: github.event_name != 'schedule'` (`x-audits.yml:205`) is a JOB-level guard; the
  registry's verifier accepts a job-level `if` only when it is exactly this schedule-exclusion
  literal (runs on every PR — the property the guard exists to protect), and rejects any other.
  The §6.1 skip audit for this file (does `livePsqlReachable` hold in the `x5` job?) is a
  named plan task.

### §6.3 Sequencing

PR-B branches after #613 merges: both touch `vitest.projects.ts`, and #613's whole point is
deleting the third array entry. If #613 is still open when PR-A completes, PR-C goes first —
no shared surface between PR-C and #613.

---

## §7 Meta-test inventory

| File | Change | PR |
| --- | --- | --- |
| tests/ci/\_metaSpecRegistration.test.ts | created — test-shaped disk files ⊆ three-config union ∪ dark-allowlist; invocation-census + filename-belt config tripwire; shadow/stale row checks; standalone baseline (files + totalTests) == local resolution; `standalone-e2e.yml` baseline-step structural pinning (§4.1) | PR-A |
| tests/e2e/standalone-baseline.json + scripts/check-standalone-baseline.mjs | created — committed `{files, totalTests}`; `--write` regen; pinned CI-side comparison step in `standalone-e2e.yml`; behavioral rejection test for the script (three mismatch classes exit non-zero) | PR-A |
| tests/ci/\_metaEnvBoundExclusionCoverage.test.ts + scripts/run-excluded-test.mjs | created — registry totality over `ENV_BOUND_EXCLUDES`; exact-literal `pnpm run-excluded` step verification; workflow/job qualification via the scanner's disqualification classes incl. job-level continue-on-error and working-directory redirection; alias-mapping pin + behavioral rejection test for the script (zero-passed / all-skipped / failed reports exit non-zero); dark rows are red | PR-B |
| resolver contract meta-test (file placement per plan, under `tests/e2e/`) | created — §5.5 (a)–(h) | PR-C |
| shared directive-plugin module (under `tests/e2e/helpers/`) | created — consumed by the bundleLiveEntry child script AND `tests/e2e/_step3ReviewModalBundle.mjs`, whose regex `useServerElision` is deleted (§5.3a) | PR-C |
| `tests/e2e/_metaLiveEntryToolchain.test.ts` | edited — assertions follow the CLI→child-script move; `_step3ReviewModalBundle.mjs` exemption rationale rewritten; binary ban unchanged | PR-C |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | edited — packlist row deleted (PR-C); `report-modal` row premise restored or replaced per §3.2 (PR-A) | PR-A, PR-C |

## §8 Acceptance criteria

1. A new `tests/e2e/**/*.spec.ts` file registered in no config reds `unit-suite` locally and in
   CI, naming the file and the three configs it is absent from. (Mutation-verified with THREE
   temp files: one plain spec.ts form, one exotic-suffix spec member such as the spec.cts
   form — adversarial R3 F2 — and one Vitest-unclaimed test form such as test.mjs —
   adversarial R4 F1 — so both the widened glob and the exact-pair subtraction are
   exercised.)
2. A standalone-config narrowing that only manifests under the RUN's environment — whether it
   drops FILES or drops TESTS while keeping every file — reds the `standalone-e2e` job's
   post-run comparison, because the comparison reads the run's own json report; the same edit
   with the baseline regenerated reds the local baseline test until both the file list and
   the total test count match. Deleting or decorating the comparison step, or removing the
   config's json reporter, reds the structural pin in `unit-suite`. (Mutation-verified in CI
   via a `workflow_dispatch` run on a scratch branch carrying a
   `GITHUB_EVENT_NAME`-conditioned `grep` narrowing — the exact mutation class the backlog
   entry names as invisible today, in its file-preserving form.)
3. Every `ENV_BOUND_EXCLUDES` entry has a verified execution home; the array reaching a state
   where an entry runs nowhere is a red `unit-suite`, not a silent fact. `test-auth-gate`
   Layer 1 executes in CI again (either disposition).
4. `packlist-rescan-recovery.spec.ts` runs in the standalone CI job, green, with a metafile
   satisfying the §5.4 server-package criterion — no `googleapis`, `postgres`, OR
   `google-auth-library` inputs (prototype already measures 0 for all three, §2.6);
   `BL-HARNESS-PACKLIST-SERVER-GRAPH` and `BL-HARNESS-RESOLVER-POLICY` close in BACKLOG.md
   with the resolver's contract cited — and no regex-based directive detection remains
   anywhere under `tests/e2e/` (the §5.3a consolidation is part of the close, not a
   follow-up).
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
