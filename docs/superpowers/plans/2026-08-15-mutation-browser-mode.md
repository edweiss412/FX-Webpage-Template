# Implementation plan — browser-mutant mode (`feat/mutation-playwright-component-mode`)

**Spec:** `docs/superpowers/specs/ci/2026-08-15-mutation-browser-mode.md` (canonical; section
references below are to it). **Implementer:** Opus / Claude Code (separate pane; handoff brief
accompanies this plan). **Ledger:** graduates `BL-MUTATION-HARNESS-PLAYWRIGHT-COMPONENT-MODE`
and `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`.

## Meta-test inventory (declared per docs/agents/writing-plans.md)

- **CREATES** tests/mutation/browser/registry.test.ts — validation suite; also the deciding
  suite for the registry module's own vitest-registry enrolment (§6).
- **CREATES** tests/mutation/browser/mutate.test.ts — deciding suite for the pure runner
  logic's enrolment (§6).
- **CREATES** tests/mutation/browser/overlayWiring.test.ts — the "flag off means off" pin
  (§6): env unset ⇒ bundle registers no overlay plugin, spec `beforeAll` emits no extra
  `@source`; env set ⇒ overlay serves mutant text and sentinel is written.
- **CREATES** tests/cross-cutting/mutation-browser-ci-wiring.test.ts — workflow wiring pin
  (Task 8), following the `tests/cross-cutting/*-ci-wiring.test.ts` precedent.
- **EXTENDS** tests/mutation/source/registry.ts — two enrolment rows (browser registry
  module, mutate module). Registry count reconciliation: `GUARD_SURFACES` currently has 11
  rows (ids at tests/mutation/source/registry.ts: taskContract:153, ledgerClaimsCore:330,
  ledgerGit:371, destructiveFileAnalysis:446, pgCronSmokes:523, reviewRoundCount:551,
  reviewRoundCorpus:562, phantomGapExecuted:590, popoverOverlayExtract:620,
  renderedTextHaystack:649, interactionTimingScan:663); this arc adds exactly 2 (13 total),
  removes 0.
- **EXTENDS** vitest.projects.ts — the browser gate file added to the `mutation` project's
  include list in BOTH entries (mirror of `vitest.projects.ts:87` and `vitest.projects.ts:91`);
  adds exactly 2 lines, removes 0. Unit suites are auto-included by the existing
  `tests/mutation/**/*.test.{ts,tsx}` glob (`vitest.projects.ts:138`) — no edit for them.
- **N/A — reason:** advisory-lock topology (no `pg_advisory*` touched); Supabase
  call-boundary registry (no Supabase calls); admin-alert catalog (no alerts); sentinel-
  hiding contract (no tiles); mutation-surface observability invariant 10 (no HTTP routes,
  no server actions).

## e2e harness-readiness (declared per writing-plans)

(a) Server boot: none added — the tap-target spec boots its own http server in `beforeAll`
(spec §3.2 context; `tests/e2e/tap-target-floor.layout.spec.ts:190-207`). (b) Readiness
gate: the spec's existing single-mount proof in its own `beforeAll`; this arc adds no new
assertion path. (c) Detach-safety: N/A — no new locator/evaluate calls are added to any
spec.

## Acceptance criteria (plan-local index of the spec's §9)

- AC-1: `pnpm mutation:browser` end-to-end — baseline green, 19 mutants classified, control killed, gate evaluated (spec §9 AC-1).
- AC-2: score meets floor with empty unaccepted-survivor set, or survivors triaged (spec §9 AC-2).
- AC-3: env unset ⇒ byte-identical behavior; sibling bundle untouched (spec §9 AC-3).
- AC-4: §6 self-enrolments land before the first implementation review dispatch, scores stated (spec §9 AC-4).
- AC-5: the new workflow fires on this PR via path filter, green on real Actions (spec §9 AC-5).
- AC-6: AGENTS.md heavy-phase member list names `pnpm mutation:browser` (spec §9 AC-6).
- AC-7: both ledger rows graduate; markers off in the final commit; specs/ci README row (spec §9 AC-7).
- AC-8: impeccable-gate N/A — no UI surface (spec §9 AC-8).

## Mutation-family closure (declared per writing-plans)

The operator family for browser surfaces is the CLOSED explicit edit list in the enrolment
payload below (nineteen mutants + one control). A reviewer-proposed NEW family or mutant is
admissible only with a live escaping mutant demonstrated against the shipped guard. The
mode's own modules converge on the vitest-registry score + empty unaccepted-survivor set
(spec §6; scores stated in each diff-round brief).

<!-- tasks: depth=2 -->

## Task 1 — registry module: types, validation, site ids

<!-- task: red=`pnpm vitest run tests/mutation/browser/registry.test.ts` ac=AC-1,AC-4 -->

RED: the new suite imports the planned module tests/mutation/browser/registry.ts, which does not exist on
the live tree (verified absent 2026-08-15: `ls tests/mutation/browser` → no such
directory); the import fails until the module lands. What is red and why: module absence.

Implement spec §2 exactly: `MutantEdit`, `ExplicitMutant`, `DecidingSuite`,
`BrowserGuardSurface`, `validateBrowserSurface`, `browserSiteId` (`explicit:<key>`), and an
initially-empty `BROWSER_SURFACES` export (populated in Task 6; the §3.6 non-empty
structural case is added in Task 5 and goes green in Task 6 — see Task 5 body for the
red/green pairing).

Test cases (anti-tautology: each constructs the failing fixture and asserts the SPECIFIC
problem string, plus one fully-green fixture; premise lines assert fixture files exist
before the case that reads them):
- edit `from` absent from file; `from` twice in file; `from === to`
- duplicate mutant `key`; empty `edits`; empty `reason`
- empty `mutants`; scoreFloor 0 / NaN / >1
- playwright suite config missing; filter matching no spec file; vitest suite path missing
- accepted-gap row without `BL-*`/`DEF-*` ref (reuse of ledger checks)
- green fixture: 2-edit mutant across two temp files validates cleanly; `browserSiteId`
  returns `explicit:<key>` verbatim

## Task 2 — mutate module: edit application, manifest, verdict table

<!-- task: red=`pnpm vitest run tests/mutation/browser/mutate.test.ts` ac=AC-1 -->

RED: imports the planned module tests/mutation/browser/mutate.ts, absent on the live tree. What is red and
why: module absence.

Pure functions only (no spawning): `applyEdits(files, edits)` → per-file mutated text
(atomic: any anchor miss throws with every miss listed); `buildManifest(entries)` → JSON
text; `classifyChild({sentinelPresent, exitStatus, reportEvidence, kind})` implementing the
§3.4 verdict table verbatim, returning `KILLED` / `DID_NOT_KILL` / `{infra: reason}`;
`accountOutcomes` → the existing `RunResult` shape (`tests/mutation/source/runner.ts:22-30`).

Tests enumerate the FULL §3.4 table — all four playwright rows, the vitest rows, and signal
death (`exitStatus: null`) — plus multi-edit atomicity (second edit's anchor missing ⇒
whole mutant refused). Derive expectations from the table in the spec, not from the
implementation. Four string-guard mutants (writing-plans) run pre-dispatch on the problem-
string assertions.

## Task 3 — overlay layers: bundle plugin, CSS lines, vitest overlay config

<!-- task: red=`pnpm vitest run tests/mutation/browser/overlayWiring.test.ts` ac=AC-3 -->

RED: the new wiring suite bundles a tiny probe entry through the REAL
`tests/e2e/_tapTargetFloorBundle.mjs` with `MUTATION_OVERLAY_MANIFEST` set to a manifest
overlaying a marker module, and asserts the output contains the MUTANT text and the
sentinel `<manifest>.ok` exists. Red because the plugin does not exist yet — the bundle
emits DISK text and writes no sentinel. What is red and why: overlay plugin absence in the
live bundle script.

Implement spec §3.1 (eager validate → sentinel → per-entry onLoad, registered first), §3.2
(one `@source` per entry in the tap-target spec's `beforeAll`), and the thin
tests/mutation/browser/vitestOverlay.config.ts (§3.3 step 3: manifest-driven
`createMutantLoadHook` per entry + same eager-validate-then-sentinel).

Wiring suite also pins the OFF state (env unset ⇒ bundle output byte-identical for the
probe entry, no sentinel, and the tap-target spec source contains the `@source` append
only inside the env-guarded branch) and the sibling fence: a case asserting
`git diff --quiet -- tests/e2e/_step3ReviewModalBundle.mjs` equivalent — implemented as a
content-hash pin of the sibling at its current tree state is NOT durable; instead assert
the sibling file contains no `MUTATION_OVERLAY_MANIFEST` reference (the honest structural
claim: the overlay lives only in the tap-target bundle).

After the tap-target spec edit, run the e2e meta-suites that walk spec text:
`pnpm vitest run tests/e2e/_metaFontFidelityWiring.test.ts tests/e2e/_metaFontWaitCoverage.test.ts`
plus `pnpm vitest run tests/mutation` (scoped; the `_meta*` suites there discover files).

## Task 4 — runner: spawn wrapper + brackets

<!-- task: red=`pnpm vitest run tests/mutation/browser/mutate.test.ts tests/mutation/browser/registry.test.ts` ac=AC-1 -->

RED for this task is carried by the Task 1/2 suites growing cases for the runner's pure
seams (baseline-abort mapping, short-circuit ordering: vitest suites before playwright;
sentinel deletion before each child). The spawn wrapper itself
(tests/mutation/browser/runner.ts) is thin by design (spec §6): child invocations are
`execFileSync("pnpm", ["exec", "playwright", ...])` and
`execFileSync("pnpm", ["exec", "vitest", "run", "--config", "tests/mutation/browser/vitestOverlay.config.ts", path])`
per spec §3.3; report deletion/read per §3.4; `MutantRunInfraError` imported, never
subclassed. What is red and why: the new pure-seam cases in the Task 1/2 suites name
runner.ts exports that do not exist until this task.

## Task 5 — gate suite, project wiring, command, heavy membership

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm vitest run --project mutation tests/mutation/browser/browserSurfaces.gate.test.ts` ac=AC-1,AC-6 -->

RED: the command exits non-zero on the live tree — the gate file does not exist and the
`mutation` project's include list does not name it. What is red and why: file + wiring
absence. (Observed-red lands in this task's first commit; the SAME command goes green at
Task 6 when the registry is populated — the §3.6 registry-non-empty structural case is
authored HERE and is the deliberate red-until-Task-6 bridge, so this task's GREEN criterion
is "suite runs, every case except registry-non-empty passes" and Task 6's includes it.)

- browserSurfaces.gate.test.ts per spec §3.6 (describe.each over `BROWSER_SURFACES`,
  env-gated; control assertion beside `evaluateGate` per §3.5; registry-non-empty case
  NOT env-gated).
- vitest.projects.ts: add the gate file to both include entries (reconciliation: +2 lines,
  pasted in the PR description).
- package.json: the `mutation:browser` script string from spec §3.6, verbatim.
- AGENTS.md heavy-phase member list: add `pnpm mutation:browser` (transitive playwright);
  update the pinned fixture tests/docs/fixtures/agents-heavy-phase-rule.md in the SAME
  commit (tests/docs/agentsHeavyPhaseRule.test.ts pins the section against it); run
  `pnpm vitest run tests/docs/agentsHeavyPhaseRule.test.ts` red-then-green across the pair.

## Task 6 — tap-target enrolment: the nineteen mutants + control

<!-- task: red=`pnpm heavy pnpm mutation:browser` ac=AC-1,AC-2 -->

RED: before the registry row lands, the registry-non-empty structural case (Task 5) fails
this exact command. What is red and why: `BROWSER_SURFACES` is empty on the pre-task tree.
GREEN: the same command runs the full surface — baseline green across both suites, 19
mutants classified, control killed, gate green (or survivors triaged per spec §4).

Enrolment payload — the reconstruction table is APPENDED VERBATIM as this plan's
"Enrolment payload" appendix (§A below): nineteen mutants, per-mutant source commits,
verified-unique `from` anchors, the two tree drifts (payload #8 SVG-caret shape; #18 five
sites, administrators inverted), and the multi-site table. Implementation steps:

1. Transcribe §A rows into `ExplicitMutant` rows (keys: short slugs, e.g.
   `drop-group-operator-error`, `rounded-sm-both-pill-sites`, `w-fit-strip-five-summaries`).
2. MEDIUM-confidence rows (#8, #18): before enrolment, apply each mutant by hand, run the
   deciding suite scoped, observe the payload's named failure line, revert (this is the
   spec §4 verification step; record command + one output line per row in the commit).
3. Control: strip `size-tap-min` from the HelpSheet CLOSE button's target
   (`components/admin/HelpSheet.tsx:169` area, the `className="group -m-2 inline-flex
   size-tap-min shrink-0 …"` string — probed 2026-08-15: that file contains `size-tap-min`,
   not `min-h-tap-min`, and the close button is NOT among the nineteen mutants' sites; the
   payload's HelpSheet rows touch only lines 84 and 88). The 44px floor assertions cover
   the close button, so every suite-kill expectation is obvious.
4. suites order: vitest first, playwright second (spec §4).
5. Full run under `pnpm heavy`; paste the gate summary (score, killed, survivors) into the
   commit message and the PR body.

Survivor triage protocol: spec §4 (repair suite gap in-arc, or `equivalent` row with
argument, or `accepted-gap` with `BL-` ref; scoreFloor stays 1 unless a triaged ledger row
justifies otherwise in the same commit).

## Task 7 — P2 self-enrolment of the mode's modules

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-4 -->

RED: adding the two rows (registry module → registry.test.ts; mutate module →
mutate.test.ts) to `GUARD_SURFACES` makes this command exercise them; the first run's
unaccepted survivors (if any) fail the gate — that is the red this task exists to burn
down. What is red and why: new-surface survivors are unledgered by definition until
triaged. GREEN: score ≥ floor with empty unaccepted-survivor set for both rows; controls
chosen per `tests/mutation/source/registry.ts:36` rules. Record both scores — they go in
every implementation-review brief (spec §6 / AC-4).

## Task 8 — CI workflow + wiring pin

<!-- task: red=`pnpm vitest run tests/cross-cutting/mutation-browser-ci-wiring.test.ts` ac=AC-5 -->

RED: the wiring suite reads the planned workflow .github/workflows/mutation-browser.yml, absent on the live
tree. What is red and why: workflow file absence.

Workflow per spec §5 (triggers, paths, chromium-only install, `timeout-minutes: 60`,
least-privilege). Paths per the R2-repaired §5 list: the workflow file, tests/mutation/**,
the two e2e harness files, standalone.config.ts, Step3Review.test.tsx, vitest.projects.ts,
package.json, and every registry mutant/control target file. Wiring suite pins: schedule
`17 8 * * *`; `workflow_dispatch` present; every §5 static path listed; the DERIVED cover —
every distinct `edits[].file` (mutants + control) across `BROWSER_SURFACES` appears in the
workflow's `paths:` — imported from the registry, not re-enumerated; the run step invokes
`pnpm mutation:browser`; permissions block holds no write scopes. Real-Actions proof: the path-filtered `pull_request` fires on this PR
(workflow file is on the PR head); AC-5 is checked at closeout by naming the green run URL
in the PR body — gate command probed against a constructed failing input per writing-plans:
`gh run list --workflow mutation-browser.yml --branch feat/mutation-playwright-component-mode --json conclusion -q '.[0].conclusion' | grep -qx success`
(exits non-zero when the run is absent or red; verified by running it BEFORE the workflow
exists and observing exit 1).

## Task 9 — closeout

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-7,AC-8 -->

RED: the graduation edits below make `tests/docs` guards fail until every paired edit
lands (archives reject in-progress entries; the reconciliation-log head must move; the
specs/ci README row must exist) — run the suite after the FIRST graduation edit and
observe the named failures, then land the rest to green. What is red and why: the ledger
guards' cross-file consistency rules.

1. specs/ci README index row for the spec (if not already landed with the spec commit).
2. Graduate both rows to `BACKLOG-archive.md` (terminal states + evidence: gate summary,
   scores); update the `Last reconciled:` head line in `BACKLOG.md`; remove both
   IN PROGRESS markers in the PR's FINAL commit (invariant 12 — the graduation commit).
3. Closeout marker line in this plan: see §Closeout below.
4. Full gates in the worktree: `pnpm heavy pnpm test:fast`, `pnpm typecheck`,
   `pnpm exec eslint .`, `pnpm format:check`.
5. Whole-diff codex review (`--stage diff`) to APPROVE; round corpus rows committed; at 4
   counted rounds a stage owes its filing (docs/review-rounds/README.md format).
6. Push → real CI green (required contexts via `gh pr checks <pr> --required --watch
   --fail-fast`; plus the AC-5 mutation-browser run) → `gh pr merge --merge` → fast-forward
   main → `0  0` → Stage 4.4 cleanup (CronDelete, pane/agent label clears, marker stage
   "done").

<!-- tasks: end -->

## Closeout

impeccable-gate: N/A — no UI surface

(No file under `app/` or `components/` is touched; the two e2e-harness files are test
infrastructure — spec AC-8.)

## §A Enrolment payload (verbatim reconstruction table)

# Tap-target arc — the nineteen isolating mutants, reconstructed against the CURRENT tree

Worktree: `/Users/ericweiss/FX-worktrees/mutation-playwright-component-mode` @ `0f0d62025`.
Order follows the `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT` prose list in `BACKLOG.md` (the paragraph
beginning "The **nineteen** isolating mutants, as an operator list ready to enrol").

Every `from` snippet below was verified by exact-substring count against the live file: each occurs
**exactly once** unless the row says otherwise. Line numbers are current-tree.

**Two tree drifts since the mutants were authored** (both recorded in the affected rows):

1. Commit `e9e80ec25` ("restore the Revoked toggle's hit area") replaced the `▸` **text** carets with
   lucide `<ChevronRight>` **SVGs** and re-dispositioned the AdministratorsSection summary from
   `inline-flex w-fit` to `flex w-full`. This changes the shape of mutant #8 and reduces mutant #18
   from six sites to five.
2. The guard now exempts `administrators` from the `w-fit` pin by name
   (`DI2_FULL_WIDTH_BY_DESIGN`, `tests/e2e/tap-target-floor.layout.spec.ts:86`), so the sixth site is
   not merely absent — it is asserted *inverted*.

---

## 1. Drop `group` from a `<details>` (OperatorErrorBlock)

- **file:** `components/admin/OnboardingWizard.tsx` (line 685)
- **from:** `<details className="group text-sm">`
- **to:** `<details className="text-sm">`
- **source:** `893793235` — "drop `group` from OperatorErrorBlock's `<details>` → 1 failed, 'caret did not rotate on open'"
- **confidence:** HIGH

## 2. Strip `transition-colors duration-fast` from a visual span (HelpTooltip visual)

- **file:** `components/admin/HelpTooltip.tsx` (line 72)
- **from:** `text-text-subtle transition-colors duration-fast group-hover:bg-surface`
- **to:** `text-text-subtle group-hover:bg-surface`
- **source:** `893793235` — "strip `transition-colors duration-fast` from HelpTooltip's visual → 'colour transition was retimed (got 0s)'"
- **confidence:** HIGH

## 3. Add `group` to an ancestor that must not carry it (HelpTooltip `<details>`)

- **file:** `components/admin/HelpTooltip.tsx` (line 55)
- **from:** `className="inline-block list-none align-middle [&::-webkit-details-marker]:hidden`
- **to:** `className="group inline-block list-none align-middle [&::-webkit-details-marker]:hidden`
- **source:** `893793235` — "add `group` to HelpTooltip's `<details>` → 'hovering the disclosed body leaked color onto the trigger'"
- **confidence:** HIGH

## 4. Strip an `aria-label` entirely (AdminNav brand link)

- **file:** `components/admin/nav/AdminNav.tsx` (line 118)
- **from:** `          aria-label="FXAV Admin"\n` (the whole line including its newline)
- **to:** `` (empty — delete the line)
- **source:** `95e9eb4a7` — "strip the `aria-label` → 'brand link has no accessible name at 320px'"
- **confidence:** HIGH

## 5. Relabel an `aria-label` to a string that contradicts the visible wordmark

- **file:** `components/admin/nav/AdminNav.tsx` (line 118)
- **from:** `aria-label="FXAV Admin"`
- **to:** `aria-label="Dashboard"`
- **source:** `06cc09ed1` — "`aria-label` → 'Dashboard' → 'brand link name is empty or contradicts its visible \"FXAV\" wordmark at 320px'"
- **confidence:** HIGH

## 6. Swap `rounded-pill` → `rounded-sm` on BOTH a target and its visual (StepIndicator)

Two edits, one mutant — both must apply together (the guard's round-2 finding is that they stay
*equal and non-zero*, so a single-site edit is a different mutant).

- **file:** `components/admin/OnboardingWizard.tsx`
  - **6a (visual, `base`, line 166) from:** `"flex size-7 shrink-0 items-center justify-center rounded-pill border text-xs font-semibold tabular-nums transition-colors duration-fast",`
    **to:** `"flex size-7 shrink-0 items-center justify-center rounded-sm border text-xs font-semibold tabular-nums transition-colors duration-fast",`
  - **6b (target, `tapTarget`, line 191) from:** `"group -m-2 flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill",`
    **to:** `"group -m-2 flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-sm",`
- **source:** `95e9eb4a7` — "'pill 1 is no longer pill-shaped: radius 6px on a 28px box' (and pill 2)"
- **confidence:** HIGH

## 7. Swap `rounded-pill` → `rounded-[14px]` on both (visual stays circular, 44px target squares off)

Same two sites as #6, different replacement. Both edits together.

- **file:** `components/admin/OnboardingWizard.tsx`
  - **7a (line 166) from:** `justify-center rounded-pill border text-xs` → **to:** `justify-center rounded-[14px] border text-xs`
  - **7b (line 191) from:** `justify-center rounded-pill",` → **to:** `justify-center rounded-[14px]",`
  - (If the harness needs one-shot unique anchors, reuse the full `6a`/`6b` strings with `rounded-[14px]` substituted.)
- **source:** `cc9fcfe4d` — "'pill 1 target is no longer pill-shaped: radius 14px on a 44px box'"
- **confidence:** HIGH

## 8. Delete a caret's glyph while keeping its span and classes (operator-error)

**Shape changed with the tree.** The mutant was authored when the caret was an `aria-hidden` `▸`
text node; `e9e80ec25` replaced it with a lucide `<ChevronRight>` SVG. The guard now branches on
`isSvg ? drawable > 0 : text !== ""` (`tests/e2e/tap-target-floor.layout.spec.ts:970-988`), so the
equivalent mutant is "same box, same classes, nothing drawable" — an empty `<span>` in place of the
icon.

- **file:** `components/admin/OnboardingWizard.tsx` (lines 688-691)
- **from:**
  ```
  <ChevronRight
                aria-hidden="true"
                className="ml-1 inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"
              />
  ```
  (exact current text is indented 12 spaces on the first line; the snippet is unique in the file)
- **to:**
  ```
  <span
                aria-hidden="true"
                className="ml-1 inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"
              />
  ```
- **source:** `95e9eb4a7` — "delete only the `▸` glyph → 'operator-error caret renders no glyph'"
- **confidence:** MEDIUM — file and site are certain; the span-vs-empty-SVG form is implementer
  judgment because the glyph is no longer a text node. The empty `<span>` keeps area, display,
  visibility, opacity and rotation valid and fails only the `text !== ""` branch, which is the
  assertion the original mutant defeated.

## 9. Add `text-transparent` to a caret (both caret mounts)

Two edits, one mutant — the round-3 commit applied it to both caret spans and both failed.

- **9a file:** `components/admin/OnboardingWizard.tsx` (line 690)
  **from:** `className="ml-1 inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"`
  **to:** `className="ml-1 inline-block size-4 shrink-0 text-transparent transition-transform duration-normal group-open:rotate-90"`
- **9b file:** `components/admin/settings/AdministratorsSection.tsx` (line 154)
  **from / to:** identical strings to 9a (the className is byte-identical at both sites; each occurs
  exactly once *within its own file*, so the substitution must be file-scoped, not repo-scoped)
- **source:** `06cc09ed1` — "`text-transparent` on both carets → 'caret text is fully transparent (color rgba(0, 0, 0, 0))', on operator-error AND administrators"
- **confidence:** HIGH — lucide icons stroke with `currentColor`, so the guard's alpha read still
  kills it on the SVG caret.

## 10. Change `-m-2` to `-m-1` (HelpSheet trigger)

- **file:** `components/admin/HelpSheet.tsx` (line 84)
- **from:** `className="group -m-2 inline-flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill focus-visible:outline-none`
- **to:** `className="group -m-1 inline-flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill focus-visible:outline-none`
- **note:** the `cursor-pointer` token is what makes this unique — the close button at line 169 is
  otherwise the same prefix (`group -m-2 inline-flex size-tap-min shrink-0 items-center …`).
- **source:** `fc628f3e9` — "`-m-1` → 'HelpSheet trigger horizontal margin box changed'"
- **confidence:** HIGH

## 11. Remove `items-center` from a split target (StepIndicator `tapTarget`)

- **file:** `components/admin/OnboardingWizard.tsx` (line 191)
- **from:** `"group -m-2 flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill",`
- **to:** `"group -m-2 flex size-tap-min shrink-0 cursor-pointer justify-center rounded-pill",`
- **source:** `fc628f3e9` — "dropped `items-center` → 'pill 1 visual is not vertically centred in its target'"
- **confidence:** HIGH

## 12. Move `cursor-pointer` from a target to its inner span (HelpTooltip)

Two edits, one mutant — remove from the `<summary>`, add to the visual `<span>`.

- **12a file:** `components/admin/HelpTooltip.tsx` (line 68)
  **from:** `className="group -m-2 inline-flex size-tap-min shrink-0 cursor-pointer list-none items-center justify-center rounded-pill`
  **to:** `className="group -m-2 inline-flex size-tap-min shrink-0 list-none items-center justify-center rounded-pill`
- **12b file:** `components/admin/HelpTooltip.tsx` (line 72)
  **from:** `className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm`
  **to:** `className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-pill bg-surface-sunken text-sm`
- **source:** `fc628f3e9` — "relocated `cursor-pointer` → 'HelpTooltip trigger target lost its pointer cursor'"
- **confidence:** HIGH

## 13. Narrow `transition-colors` → `transition-[background-color]` (HelpTooltip visual)

- **file:** `components/admin/HelpTooltip.tsx` (line 72)
- **from:** `text-text-subtle transition-colors duration-fast group-hover:bg-surface`
- **to:** `text-text-subtle transition-[background-color] duration-fast group-hover:bg-surface`
- **source:** `cc9fcfe4d` — "`transition-[background-color]` on the HelpTooltip visual → 'the visual span no longer transitions color (got background-color)'"
- **confidence:** HIGH

## 14. Collapse the topbar's `gap-3` to `gap-0`

- **file:** `components/admin/nav/AdminNav.tsx` (line 104)
- **from:** `className="mb-4 flex items-center gap-3 border-b border-border pb-3"`
- **to:** `className="mb-4 flex items-center gap-0 border-b border-border pb-3"`
- **source:** named in the `cc9fcfe4d` BACKLOG update ("the `gap-3 → gap-0` overlap mutant"); the
  BACKLOG probe block records it as the one mutant already machine-observed, killing exactly its own
  case per container via `BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE`.
- **confidence:** HIGH

## 15. Narrow the STEP PILL's `transition-colors` the same way (second substring-matcher site)

- **file:** `components/admin/OnboardingWizard.tsx` (line 166, `base`)
- **from:** `tabular-nums transition-colors duration-fast",`
- **to:** `tabular-nums transition-[background-color] duration-fast",`
- **source:** `e88e7e0f6` — "pill `transition-[background-color]` → 'the visual span lost its colour transition (got background-color)'"
- **confidence:** HIGH

## 16. Drop `justify-center` from a VISUAL span (HelpSheet trigger visual)

- **file:** `components/admin/HelpSheet.tsx` (line 88)
- **from:** `className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-sunken align-middle`
- **to:** `className="inline-flex size-7 shrink-0 items-center rounded-pill bg-surface-sunken align-middle`
- **source:** `e88e7e0f6` — "drop `justify-center` from the trigger's visual → 'HelpSheet trigger glyph is not horizontally centred in its visual'"
- **confidence:** HIGH

## 17. Revert only ONE of the two promoted headings, leaving `h1, h2, h3`

Targets the **grouped-rows** section heading (not a CSS/globals file — it is a JSX tag). The
needs-attention heading at `components/admin/wizard/Step3Review.tsx:1447` stays `h2`, which is what
makes the sequence monotonic and the mutant isolating.

- **file:** `components/admin/wizard/Step3Review.tsx` (lines 787-789)
- **from:**
  ```
  <h2 className="text-sm font-semibold text-text-subtle">
            {heading} <span className="tabular-nums text-text-faint">({rows.length})</span>
          </h2>
  ```
- **to:**
  ```
  <h3 className="text-sm font-semibold text-text-subtle">
            {heading} <span className="tabular-nums text-text-faint">({rows.length})</span>
          </h3>
  ```
- **source:** `e88e7e0f6` — "partial heading revert → 'the grouped-rows section heading is not an h2: expected \"H3\" to be \"H2\"'"
- **confidence:** HIGH
- **HARNESS NOTE:** this is the one mutant killed by a **Vitest** suite
  (`tests/components/admin/wizard/Step3Review.test.tsx:809-813`), not by the Playwright spec — so it
  is executable by the existing vitest-child runner the moment the registry accepts a `.tsx`
  component `sourcePath`. It needs no Playwright mode at all.

## 18. Strip `w-fit` from the Class-A summaries (conformance pin)

**FIVE sites on the current tree, not six.** `e9e80ec25` moved the `administrators` summary to
`flex w-full`, and the guard exempts that mount by name (`DI2_FULL_WIDTH_BY_DESIGN`,
`tests/e2e/tap-target-floor.layout.spec.ts:86`; the `w-fit` assertion is gated on
`!DI2_FULL_WIDTH_BY_DESIGN.has(mount)` at line 1474). Applying `w-fit` there would fail the
*inverted* assertion instead, which is a different mutant.

One mutant, five per-site removals of the bare token `w-fit ` (each `from` string below occurs
exactly once in its own file):

| site | file:line | from (unique anchor) | to |
| --- | --- | --- | --- |
| help-affordance | `components/admin/HelpAffordance.tsx:97` | `className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center underline-offset-2` | `className="inline-flex min-h-tap-min cursor-pointer list-none items-center underline-offset-2` |
| operator-error | `components/admin/OnboardingWizard.tsx:686` | `className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center font-medium"` | `className="inline-flex min-h-tap-min cursor-pointer list-none items-center font-medium"` |
| error-explainer | `components/messages/ErrorExplainer.tsx:114` | `className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center"` | `className="inline-flex min-h-tap-min cursor-pointer list-none items-center"` |
| me-show-sections | `app/me/meShowSections.tsx:124` | `className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center text-xs` | `className="inline-flex min-h-tap-min cursor-pointer list-none items-center text-xs` |
| run-of-show | `components/crew/primitives/RunOfShowList.tsx:83` | ``className={`inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center text-sm`` | ``className={`inline-flex min-h-tap-min cursor-pointer list-none items-center text-sm`` |

- **DO NOT also strip** `components/admin/HelpAffordance.tsx:111` — that `inline-flex w-fit
  min-h-tap-min` sits on the Learn-more link, not a `<summary>`, and is outside the guard's scope.
- **source:** `0bce8e51c` — "stripping `w-fit` from all six summaries now fails with 'help-affordance
  summary dropped the spec-required w-fit token' — and, notably, DI-2's width comparison still passes
  under that mutant"
- **confidence:** MEDIUM — every site and snippet is verified unique, but this is a multi-site
  mutant whose site count moved from six to five with the tree, so the harness needs a
  multi-substitution mutant form and the enrolment prose needs the count corrected.

## 19. Delete `transition-colors duration-fast` outright (StepIndicator `base`)

Distinct from #15: #15 narrows the property (computes to `background-color`), #19 removes the
utility so the property computes to the CSS `all` default that the pre-repair matcher accepted.

- **file:** `components/admin/OnboardingWizard.tsx` (line 166, `base`)
- **from:** `tabular-nums transition-colors duration-fast",`
- **to:** `tabular-nums",`
- **source:** `50f2478e1` — "deleting `transition-colors duration-fast` from the pill's base now fails with 'the visual span lost its colour transition (got all)'"
- **confidence:** HIGH

---

## Files touched, by mutant

| file | mutants |
| --- | --- |
| `components/admin/OnboardingWizard.tsx` | 1, 6a, 7a, 8, 9a, 11, 15, 18-operator-error, 19 |
| `components/admin/HelpTooltip.tsx` | 2, 3, 12a, 12b, 13 |
| `components/admin/HelpSheet.tsx` | 10, 16 |
| `components/admin/nav/AdminNav.tsx` | 4, 5, 14 |
| `components/admin/settings/AdministratorsSection.tsx` | 9b |
| `components/admin/wizard/Step3Review.tsx` | 17 |
| `components/admin/HelpAffordance.tsx` | 18 |
| `components/messages/ErrorExplainer.tsx` | 18 |
| `app/me/meShowSections.tsx` | 18 |
| `components/crew/primitives/RunOfShowList.tsx` | 18 |

## Multi-site mutants (the harness needs an N-substitution mutant form)

| mutant | sites |
| --- | --- |
| 6 (`rounded-sm`) | 2 — `base` + `tapTarget`, same file |
| 7 (`rounded-[14px]`) | 2 — same two sites |
| 9 (`text-transparent`) | 2 — two files, byte-identical className |
| 12 (`cursor-pointer` relocation) | 2 — remove + add, same file |
| 18 (`w-fit` strip) | 5 — five files |

The other fourteen are single substitutions.

