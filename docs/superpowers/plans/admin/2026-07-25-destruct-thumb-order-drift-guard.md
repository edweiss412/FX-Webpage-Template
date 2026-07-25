# Plan — Destructive-confirm family close-out

**Spec:** `docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md` (canonical; §-references below point into it)
**Branch:** `fix/destruct-thumb-order-drift-guard`
**Worktree:** `/Users/ericweiss/FX-worktrees/destruct-thumb-order` (off `origin/main` @ `dd4fecf43`)
**Implementer:** Opus / Claude Code — UI surface, so routing rule "UI work is always Opus" applies.

---

## 0. Pre-draft verification (run, not described)

Every command below was executed at plan-authoring time in the worktree. Output and disposition recorded; nothing here is a grep to be run later.

| # | Command | Output | Disposition |
|---|---|---|---|
| V1 | `rg -n "ARM_REVERT_MS\|AUTO_REVERT_MS" --glob '*.ts*'` | 11 files declare `const ARM_REVERT_MS = 4_000`; **zero** `AUTO_REVERT_MS` | Confirms spec §2.2's count of 11 and confirms DESTRUCT-2's timing harmonization already shipped |
| V2 | per-file `rg -o "setTimeout\([^,]*,\s*[0-9_]+\s*\)"` over all 18 registry files | **no matches** | T2 (literal ban) lands clean; every existing timer already passes a named constant |
| V3 | per-file `rg -o "set[A-Za-z]*Armed\("` over the 11 declaring files | matches **4 of 11** (`PendingPanelDiscardButtons`, `StagedReviewCard`, `ArchiveShowButton`, `BlockedRowResolver`) | Kills the arm-state detector; T2 is literal-based instead (spec §5.2 "Rejected detector") |
| V4 | `rg -n "admin-pending-ignore\|admin-pending-defer" tests app components` | `pendingIngestionActions.test.tsx` (~10), `needs-attention-page.spec.ts` (2 + 1 stale comment) | The complete test-id consumer set. `_uiLabelExceptions.ts`, `page-dashboard.test.tsx`, `_metaEmphasisRenderContract.test.ts` reference the component but **not** the ids |
| V5 | `rg -n "Permanently ignore\|Defer until modified" tests app components` | all non-component hits are help-page MDX prose or `expect(src).toContain(...)` source scans | Doubling the rendered labels breaks nothing. No DOM label counts exist |
| V6 | `sed -n '15,17p' tests/styles/_classScanUtils.ts` | `stripComments` deletes `//` comments | Constraint C-A: T2's exemption lookup must read RAW source (spec §5.2.1) |
| V7 | `sed -n '131p' tests/styles/_metaDestructiveConfirm.test.ts` | walks `["components", "app"]` | Constraint C-B: T1 must add `"lib"` or it scans every directory except the one holding the constant |
| V8 | `rg -n "pendingDiscardReflow" .github/workflows/*.yml package.json` | **no matches**; only `tests/e2e/standalone.config.ts:36` | The layout spec runs in no CI job. Task 5 wires it |
| V9 | `pnpm vitest run` on the 4 affected test files at merge-base | **4 files, 28 tests, all pass** | Clean baseline; any later red is mine |
| V10 | `head -1 tests/components/admin/pendingIngestionActions.test.tsx` | `// @vitest-environment jsdom` | Pragma already present; new tests inherit it |

| V11 | snippets from Tasks 1-2 extracted to a scratch test file, then `pnpm typecheck` | **exit 0, zero `error TS`** | Every pasted snippet compiles under the strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Scratch file deleted after |
| V12 | `pnpm vitest run` on that scratch file | **T1 failed with `expected [ …(11) ] to deeply equal [ 'lib/admin/destructiveConfirm.ts' ]`; T2 and the T2 self-check passed** | Task 1's expected failure is demonstrated, not predicted. The self-check passing proves the matcher fires on `3000`/`3_000`, does not fire on `ARM_REVERT_MS`, and that the exemption comment is invisible in stripped source — constraint C-A, proven executably rather than argued |

| V13 | Chromium probe: today's shipped markup in a 280px container at a 1280px viewport | Defer `y744`, Ignore `y796` (idle); Defer `y840`, Ignore `y892` (armed) | **The defect is already live on desktop.** Drove the re-key from viewport to container width (spec §2.5) |
| V14 | `rg -n "@container\|container-type" app components` | no matches | This is the repo's first container-query usage; the plan must not assume prior art |
| V15 | Chromium probe: `@container` + `@min-[576px]:` fork at 280 / 512 / 560 / 576 / 720px, idle and armed | exactly one copy shown at every width; hidden copy `0x0` with `offsetParent === null`; safe placement in every case | The container-keyed fork works. Tailwind v4 compiles `@min-[Npx]:` to `@container (width >= Npx)` with no plugin |
| V17 | Chromium probe: `@container` on a shrink-to-fit flex item, real card nesting | wrapper `0px`, buttons `26px`, card +18.89px taller | The containment-context trap. Forces `w-full` on the root (spec §4.1) |
| V18 | Chromium probe: today's markup in the REAL nesting (card padding + action row + Retry sibling) | 320px rail: Ignore below Defer idle AND armed; 900px card: side by side, correct order | Confirms §2.5's premise against real DOM, not a bare container |
| V20 | `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/pendingDiscardReal.layout.spec.ts` against today's component | **7 failed, 4 passed** — `w-full`/`@container` absent (3), no fork so two copies display (3), and `rail320` Ignore.bottom `290.19` vs Defer.y `194.69` (Ignore BELOW Defer). Passing: tap targets, `wide900` | The real-tree spec is red for exactly the right reasons. Closes R3 finding 2 by demonstration: the `w-full` assertion reads rendered markup and fails when absent |
| V21 | `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` after adding the new spec | **1 failed** — new spec listed as dark | The coverage registry is fail-by-default and caught it; Task 5 must wire both specs |
| V19 | Chromium probe: `w-full @container` vs `@container` on the action row, at 320px and 900px | both avoid the collapse; `w-full` keeps full-width stacked buttons (278px) but pushes `Retry` off the line and adds ~52px card height at 900px | The accepted trade-off, flagged for the invariant-8 gate |
| V16 | Chromium probe: armed row at the threshold | 512px leaves **20.75px** slack, 511px cleanly switches to stacked, 576px leaves **84.75px** | Threshold set to 576px, not 512px, for cross-platform font headroom (spec §4.2) |

**Real-browser probe (spec §4.7).** The proposed markup was rendered in Chromium with the compiled token CSS before this plan was written. Measurements are in spec §4.6 and are the basis for Task 4's assertions — the geometry is measured, not predicted.

---

## 1. Meta-test inventory (mandatory declaration)

| Registry | This plan |
|---|---|
| `tests/styles/_metaDestructiveConfirm.test.ts` | **EXTENDS** — adds T1 (single declaration), T2 (no literal timer delays), T3 (value pin), plus matcher self-checks |
| `tests/auth/_metaInfraContract.test.ts` (Supabase call boundaries) | N/A — no Supabase client call added or changed |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (lock topology) | N/A — no `pg_advisory*` anywhere in this diff |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | N/A — no `admin_alerts` row, no §12.4 code added or edited |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | N/A — no new route handler, no new `"use server"` action; the existing discard route is untouched |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | N/A — not a tile surface |

**No new test FILES are created.** Every test lands in an existing file, so no `testMatch` entry and no Playwright project registration is required. The one new *workflow* (Task 5) names its own spec list explicitly.

## 2. Advisory-lock holder topology

N/A. `rg -n "pg_advisory" ` over this diff's surfaces returns nothing; no code path here mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions`. The component POSTs to an existing route whose locking is unchanged.

## 3. e2e harness-readiness checklist

For `tests/e2e/pendingDiscardReflow.layout.spec.ts` (Task 4):

- **(a) Server boot.** None. The spec self-hosts: `beforeAll` compiles token CSS from `app/globals.css` via the Tailwind CLI into a temp dir and serves it from its own `node:http` server on an ephemeral port (`tests/e2e/pendingDiscardReflow.layout.spec.ts:82-108`). No app boot, no Supabase, no seed, no `webServer` block, and no dependency on the 3000-3004 dev-server ports.
- **(b) Readiness gate.** The harness serves **static HTML** — there is no React, no hydration, no client island. The gate is `page.goto(baseUrl)` returning, after which layout is final. `networkidle` is not used and not needed. This is deliberately unlike the app-booting e2e specs.
- **(c) Detach safety.** N/A by construction. Every measurement is a single one-shot `page.evaluate()` that reads `getBoundingClientRect()` synchronously inside the page and returns plain numbers (`tests/e2e/pendingDiscardReflow.layout.spec.ts:115-130`). No `locator.evaluate`, no sampler, no handle outlives its call, so nothing can auto-wait on an unmounted node.

---

## 4. Tasks

Every task: failing test → minimal implementation → passing test → commit (invariant 1). One commit per task (invariant 6).

### Task 0 — Real-component mounting harness (already spiked)

**Why it is task zero.** Spec §6.3 explains it: two review rounds failed on the same vector, that a transcribed harness can pass while the shipped component differs. Every positive geometry claim in this plan depends on measuring the real tree, so the harness precedes the code it verifies.

**Already built and run as a spike** (`tests/e2e/_pendingDiscardHarness.tsx`, committed). It renders the real `NeedsAttentionInbox` with one `pending_ingestion` item — hence the real `PendingPanelDiscardButtons`, real card padding, real action row, real `Retry now` sibling — via `renderToStaticMarkup`, out of process under `tsx`, following `tests/e2e/_statusStripToggleHarness.tsx`.

**Spike output, recorded:** against today's markup at a 1280px viewport, `rail320` reproduces the defect from the real tree (`admin-pending-ignore-*` below `admin-pending-defer-*`) and `wide900` shows both on one row with `Retry` inline. This is §2.5's premise proven by the component.

**Remaining in this task:** a new spec file **tests/e2e/pendingDiscardReal.layout.spec.ts** that consumes the harness JSON, compiles token CSS, serves it, and carries the 6.3.a assertion list — starting with the two that close the round-3 findings: `w-full` and `@container` present on the **rendered** root, and the root's measured width equal to the rail width (the direct test for the 0px collapse, which cannot pass if `w-full` is dropped).

**Commit:** `test(admin): measure the real discard tree in a browser`

### Task 1 — Shared `ARM_REVERT_MS` + T1/T3 guards

**Test first.** Extend `tests/styles/_metaDestructiveConfirm.test.ts`:

```ts
const CONST_MODULE = "lib/admin/destructiveConfirm.ts";
const DECL = /(?:^|\n)\s*(?:export\s+)?const\s+ARM_REVERT_MS\s*=/;

it("T1: exactly one file declares ARM_REVERT_MS, and it is the shared module", () => {
  const declaring: string[] = [];
  for (const root of ["components", "app", "lib"]) {
    for (const file of walk(root)) {
      if (DECL.test(stripComments(readFileSync(file, "utf8")))) {
        declaring.push(file);
      }
    }
  }
  // Asserting equality, not "at most one": "<= 1" passes on zero (constraint C-B).
  expect(declaring).toEqual([CONST_MODULE]);
});

it("T3: the shared value is the ratified 4s (DEFERRED-archive.md:1228)", async () => {
  const mod = await import("@/lib/admin/destructiveConfirm");
  expect(mod.ARM_REVERT_MS).toBe(4_000);
});
```

Note the root list is `["components", "app", "lib"]` — constraint C-B. `walk` already filters to `.ts`/`.tsx` (`tests/styles/_classScanUtils.ts:7-14`). `DECL` matches the declaration with or without `export`, so a local `const ARM_REVERT_MS` in a component is caught as well as the module's exported one.

**Expected failure:** `declaring` has 11 entries, none of them the module (which does not exist).

**Implementation.** Create the new module **lib/admin/destructiveConfirm.ts** exporting `ARM_REVERT_MS = 4_000` with the ratification comment. Replace the local declaration in all **11** files (spec §2.2 table) with `import { ARM_REVERT_MS } from "@/lib/admin/destructiveConfirm";`. Each file keeps its existing explanatory comment, minus the now-false "declared locally" phrasing.

**No behavioural change** — every site already used `4_000`, so the existing per-surface timer tests (which advance past 4s) are untouched. Confirm by running them, not by asserting it.

**Commit:** `refactor(admin): source ARM_REVERT_MS from one module and pin it`

### Task 2 — T2 identifier allowlist + the four bypass closures

**Test first.** T2 rejects any scheduler-call delay that is not a **registered identifier**. Spec §5.2 carries the allowlist table (`ARM_REVERT_MS`, `SUCCESS_DISMISS_MS`, `WATCHDOG_MS`) and is the authority; the task body reproduces it at execution time.

Five assertions, because a literal ban alone is fail-open — `const CONFIRM_TIMEOUT = 3_000; setTimeout(cb, CONFIRM_TIMEOUT)` passes a literal ban, T1 and T3 simultaneously:

| Assertion | Closes | Concrete bypass it catches |
|---|---|---|
| delay must be an allowlisted identifier | the base case | `setTimeout(cb, 3_000)` and `setTimeout(cb, CONFIRM_TIMEOUT)` |
| `ARM_REVERT_MS` references resolve to `@/lib/admin/destructiveConfirm`, matched on the **module specifier**, with no local rename of a foreign binding to that name | B1 | `import { THREE_SECONDS as ARM_REVERT_MS } from "./elsewhere"` — green under T1/T3 because T1 must ignore import bindings for the eleven migrated files to pass |
| scan a scheduler **set** (`setTimeout`, `setInterval`, `AbortSignal.timeout`, `requestIdleCallback` with `timeout`) and fail on aliasing any of them | B2 | `const t = setTimeout; t(cb, 3000)` |
| exemption binds to the **call**, not the file: on the call's own line or the line above, consumed by exactly one call | B3 | one legitimate `// not-arm-revert:` suppressing every other timer in the same file |
| assert the **count** of detected scheduler calls per registry file against a checked-in expected count | B4 | a detector that silently stops matching — this is the assertion that makes the other four trustworthy |

**Self-check** (mandatory, per the vacuous-pass rule): fires on single-line, multiline, and nested-callback call shapes; does not fire on an allowlisted identifier; and carries one negative case per bypass B1-B4. A self-check that only proves `3000` is caught would let every closure above rot.

**Expected state.** V2 measured zero literal-delay violations across all 18 registry files, so the base assertion lands green. That is stated plainly rather than dressed up: T2 is a fails-**forward** guard, and its self-check plus B4's count assertion are what prove it is not vacuous today.

**Implementation.** The allowlist table, the scheduler set, and a header comment documenting T1/T2/T3, the exemption idiom, and §5.3's residual scope limit (a surface that never adopts the recipe pair is invisible to the registry, hence to T2).

**Commit:** `test(admin): require a registered timer identifier in destructive-confirm surfaces`

### Task 3 — Fork the render on container width (jsdom)

**Test first.** In `tests/components/admin/pendingIngestionActions.test.tsx`, retarget the existing ~10 `getByTestId` calls to the `-inline-` ids (spec §4.4), then add the eleven tests of spec §6.2. Each carries a comment naming the concrete failure mode it catches; the table in §6.2 is the authority and is reproduced in the task body at execution time.

Two of them exist specifically because the other would not catch the bug:

- **2a parity** compares the two copies to each other — catches drift *apart*.
- **2b canonical tokens** checks each button against a literal required set — catches drift *together*, which parity is structurally blind to. This was a round-1 review finding and my original reasoning about it was backwards.

Tests 10 and 11 cover the compound `error + armed` exits that the flat five-state model missed (spec §4.8).

**Implementation.** Restructure `components/admin/PendingPanelDiscardButtons.tsx` per spec §4.1: a `w-full @container` root (the `w-full` is mandatory — see below), one local `pair(variant)` helper, stacked copy `[ignore, defer]` with `flex flex-col items-stretch gap-2 @min-[576px]:hidden`, inline copy `[defer, ignore]` with `hidden flex-wrap gap-2 @min-[576px]:flex`, live region and error block hoisted out so each renders once. Remove `basis-full sm:basis-auto`.

Two tokens are load-bearing and each has its own failure mode:

- **`flex` on the stacked container.** Without it the element is `display:block`, `items-stretch` is inert, and a source guard checking only `flex-col`/`items-stretch` still passes.
- **`w-full` on the `@container` root.** `container-type: inline-size` severs inline size from contents, and the root is a shrink-to-fit flex item in the card's action row (`components/admin/NeedsAttentionInbox.tsx:72`). Without a definite width the wrapper collapses to `0px` and the buttons shrink to `26px` — measured, silent, no error. Spec §4.1 carries the measurement.

Update `tests/e2e/needs-attention-page.spec.ts:243` and `tests/e2e/needs-attention-page.spec.ts:250` to the **stacked** ids — that spec sets `MOBILE` (390px) at `tests/e2e/needs-attention-page.spec.ts:232`, so the stacked copy is the live one. Targeting inline there would click a `display:none` node and fail on actionability, which reads as a flake rather than a wiring error.

**Also in this task:** rewrite the persistent-status test at `tests/components/admin/pendingIngestionActions.test.tsx:282`. It reaches the live region via `btn.nextElementSibling` and re-checks that adjacency after the timer decays; moving the region outside both copies makes that `null`. It is relocated to `getByRole("status")` — unambiguous once exactly one region exists — keeping every behavioural assertion it already made.

**Commit:** `fix(admin): key the discard fork on container width, safe action first`

### Task 4 — Narrow the transcribed spec to negative controls

**Test first.** Per spec §6.3.b the transcribed spec keeps only what transcription is legitimately good at — rendering markup the product no longer contains. Every positive claim moves to Task 0's real-tree spec. Panels are fixed-width wrappers carrying `@container`, so one page exercises 280 / 576 / 720px without resizing the viewport — plus three controls: `nofork-280-*` (today's markup, which must show Ignore *below* Defer), `nobasis-328-*` (the reflow control, at **328px** — at 280px the idle pair is already wrapped and cannot reproduce a *relocation*, only width growth), and `prod-320-*`, a production-nesting panel carrying the real card padding, the `flex flex-wrap items-center gap-2` action row and the `Retry now` sibling. The last one exists because every other panel is a fixed-width wrapper, which manufactures a definite width the live tree does not hand the component — without it, D1-D6 can all pass while the shipped buttons collapse or overflow. Assertions are spec §6.3's list, with the exact D1–D6 invariants from spec §4.7 inlined in the file header. Panel widths derive from one local threshold constant so a future change cannot leave a panel testing the old boundary.

Both negative controls are load-bearing: without `nofork-*`, "Ignore is above Defer" could pass on a harness that renders nothing meaningful; V-probe measured `nofork` at Defer `y192` / Ignore `y244`, so the control does reproduce the defect.

Rewrite the drift-guard test (currently `tests/e2e/pendingDiscardReflow.layout.spec.ts:165-173`) to assert the source contains `@container`, `flex`, `items-stretch`, `@min-[576px]:hidden`, `@min-[576px]:flex` **and does NOT contain** `basis-full` or `sm:basis-auto`. The negative half is what makes it bite — asserting only presence would still pass if the old markup survived alongside the new.

**Commit:** `test(admin): prove the forked discard order in a real browser`

### Task 5 — CI wiring (spec §6.4)

`package.json`: add `"test:e2e:destructive-layout"` running **both** specs under `tests/e2e/standalone.config.ts` — `tests/e2e/pendingDiscardReal.layout.spec.ts` (the real-tree proof) and `tests/e2e/pendingDiscardReflow.layout.spec.ts` (the negative controls).

**Verified fail-by-default:** adding the new spec immediately turned `tests/ci/_metaE2eWorkflowCoverage.test.ts` red — `dark specs - wire a workflow or add a reasoned allowlist entry` listing `tests/e2e/pendingDiscardReal.layout.spec.ts`. That is the registry doing its job, and it means this task cannot be skipped silently. **Both** rows flip to `PATH_GATED` when the workflow lands.

New workflow **.github/workflows/destructive-layout-e2e.yml**, modelled on `.github/workflows/modal-header-layout-e2e.yml`: same `actions/checkout` + `./.github/actions/setup`, same Playwright browser cache keyed on `pnpm-lock.yaml`, same `install-deps chromium` + `install chromium`, same failure-artifact upload, `workflow_dispatch:` enabled. **No `env:` block** — unlike the modal-header job, this harness renders static HTML strings and imports no server chain, so none of the `HASH_FOR_LOG_PEPPER` / Supabase demo keys are needed. `paths:` per spec §6.4.

Update the `BL-STANDALONE-CONFIG-CI-DARK` row in `BACKLOG.md`: one more spec covered, remainder still dark.

**Verification is not local-green.** Per the project's "local-passes-CI-fails is its own bug class" rule, this task is complete only after `gh workflow run destructive-layout-e2e.yml` reports a green run on the branch.

**Commit:** `infra: run the destructive-confirm layout spec in CI`

### Task 6 — Backlog hygiene + stale anchors (spec §7, §2.4)

Delete all three `BL-DESTRUCT-*` rows and the now-empty family section with its preceding `---`. Correct the three stale line anchors (`tests/help/_uiLabelExceptions.ts:137`, `tests/help/_uiLabelExceptions.ts:142`, `tests/e2e/needs-attention-page.spec.ts:53`) to the post-fork line numbers — done last, so the numbers are final.

**Commit:** `docs(backlog): close the destructive-confirm family`

### Task 7 — Invariant-8 impeccable dual-gate

`components/admin/PendingPanelDiscardButtons.tsx` is under `components/`, so both `/impeccable critique` and `/impeccable audit` run on the diff, with the canonical v3 setup gates (the skill's context loader pulling PRODUCT.md + DESIGN.md, then the register reference read). P0/P1 fixed or explicitly deferred via a `DEFERRED.md` entry. Findings and dispositions recorded in §12 of the close-out.

**Pre-code mechanical checklist** (run before Task 3's implementation, not after): em-dash ban in user-visible copy, apostrophe literals, `min-h-tap-min` on both copies' buttons, canonical type/token classes. No new colour token is introduced, so no contrast meta-test is needed.

### Task 8 — Self-review

Numeric sweep + self-consistency sweep across spec and plan. Re-run V1–V10 after the code lands and confirm the recorded outputs still hold (V2 in particular: the diff must not introduce the first literal delay).

### Task 9 — Adversarial review (cross-model)

Codex, via `scripts/codex-guard.mjs`, on the whole diff. Brief carries REVIEWER-ONLY framing, fresh-eyes posture, and spec §1.1's do-not-relitigate list. Iterate to APPROVE.

### Task 10 — Ship

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, both e2e scripts → push → **real CI green** → `gh pr merge --merge` → fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## 5. Risks carried from the spec

Spec §9's table applies unchanged. The one this plan adds machinery for: **two live copies of a destructive control.** Containment is Task 3's `pair()` helper (one source expression), tests 2/3/7 (parity plus independent class pinning), and Task 4's real-browser one-copy-per-breakpoint assertion. No single one of those is sufficient alone, which is why all three ship together.
