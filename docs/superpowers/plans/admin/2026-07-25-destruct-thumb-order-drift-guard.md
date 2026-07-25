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
| V22 | `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts` on first run of the new M1 guard | reported **`['D2', 'D4']`** declared-but-unmeasured | The structural defense found two unmeasured invariants that seven adversarial rounds never named. D2 named immediately; D4 is owned by Task 4 and stays red until it lands |
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

The design changed at round 9 from a container-keyed fork to a plain reorder (spec §4). Tasks 0-4 below are recorded as **DONE** with what actually shipped; the remainder are outstanding.

### Task 0 — Real-component mounting harness — **DONE**

`tests/e2e/_pendingDiscardHarness.tsx` renders the real `NeedsAttentionInbox` (hence the real component inside real card padding, real action row, real `Retry now` sibling) out of process under `tsx`. It now emits an **armed** panel per rail by substituting the component's own exported `IGNORE_ARMED_CLASS` / `IGNORE_ARMED_LABEL`, so both panels originate from the component and nothing is transcribed.

That substitution is what withdrew M2: with no transcription left to bind, the binding table and the six holes review found in it ceased to exist rather than being fixed.

### Task 1 — Shared `ARM_REVERT_MS` + T1/T2/T3 — **DONE**

`lib/admin/destructiveConfirm.ts` created; all 11 local declarations replaced with imports. No behavioural change (every site already used `4_000`), verified by 5996 tests across 507 files staying green. T1/T2/T3 and a T2 self-check landed with a non-vacuity floor of 11 detected scheduler calls.

### Task 2 — Reorder the component — **DONE**

Ignore moved before Defer; `basis-full sm:basis-auto` deleted; armed label shortened to `"Tap again to confirm"` (328.51px → 161.98px), which is also exactly what the live region already announces. The component exports its two Ignore skins and labels for the harness.

### Task 3 — jsdom coverage — **DONE**

Test 2 (DOM order), test 6 (single live region survives the reorder), test 7 (no `basis-full`/`sm:basis-auto`, idle or armed). The persistent-status test moved off `nextElementSibling` — the reorder puts Defer between Ignore and the region — and keeps every behavioural assertion it had. The DESTRUCT-1 class test inverted.

### Task 4 — Real-browser proof — **DONE**

`tests/e2e/pendingDiscardReal.layout.spec.ts`: 16 assertions across 3 rails × idle/armed covering D1, D2, D3, D4, D7. All measured **panel-relative** — comparing absolute `y` across two panels measures where the panel sits, not where the button sits, which cost one debugging cycle. `tests/e2e/pendingDiscardReflow.layout.spec.ts` narrowed to the historical negative control, with its old drift-guard inverted.

### Task 5 — CI wiring — **OUTSTANDING**

`package.json` script `test:e2e:destructive-layout` running **both** layout specs under `tests/e2e/standalone.config.ts`. New workflow **.github/workflows/destructive-layout-e2e.yml** modelled on `modal-header-layout-e2e.yml` (same setup action, Playwright cache, failure-artifact upload, `workflow_dispatch:`), no `env:` block — the harness imports no server chain.

`paths:` must include `components/admin/PendingPanelDiscardButtons.tsx`, `components/admin/NeedsAttentionInbox.tsx`, `tests/e2e/_pendingDiscardHarness.tsx`, both layout specs, `tests/e2e/standalone.config.ts`, `app/globals.css`, `package.json`, `pnpm-lock.yaml`, and the workflow file.

**Mandatory companion:** flip both specs' rows in `tests/ci/_metaE2eWorkflowCoverage.test.ts` from `UNSEEN` to `PATH_GATED`. That meta-test is already red on the new spec, so this task cannot be skipped silently.

Complete only when `gh workflow run` reports a green run on the branch — local green is not sufficient for a CI-bound surface.

### Task 6 — Backlog + stale anchors — **OUTSTANDING**

Delete all three `BL-DESTRUCT-*` rows and the family section. `BL-DESTRUCT-FORK-FOCUS-TRANSFER` is **withdrawn, not filed** — there is no fork to cross. Correct the three stale line anchors (`tests/help/_uiLabelExceptions.ts:137`, `tests/help/_uiLabelExceptions.ts:142`, `tests/e2e/needs-attention-page.spec.ts:53`) once line numbers are final.

### Task 7 — Invariant-8 impeccable dual-gate — **OUTSTANDING**

`/impeccable critique` and `/impeccable audit` on the diff. The armed-label change is user-visible copy and is the thing most likely to draw a finding — it is a deliberate trade (width, and matching the live-region announcement) and should be defended or revised on its merits, not waved through.

### Task 8 — Whole-diff cross-model review, then ship — **OUTSTANDING**

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, both e2e scripts, `pnpm test:e2e -- needs-attention-page` → push → real CI green → `gh pr merge --merge` → verify `git rev-list --left-right --count main...origin/main` reports `0  0`.
