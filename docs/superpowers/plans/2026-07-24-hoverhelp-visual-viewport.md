# Visual-Viewport Popover Placement Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md` (round 4)
**Branch:** `fix/hoverhelp-visual-viewport`, worktree `/Users/ericweiss/FX-worktrees/hoverhelp-visual-viewport`
**Closes:** `BL-HOVERHELP-VISUAL-VIEWPORT`
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-24 brainstorming gate); spec + plan user-review gates waived.

**Round 4 is SMALLER than round 3.** Spec R4's rescission deleted a whole task (the ShareHub collision-hidden focus contract) along with the state machine behind it. Three consecutive rounds found the same vector; the project's three-round rule says descope rather than add a fourth gate, and that is what happened.

---

## Global Constraints

- **Invariant 1 (TDD per task).** Every task carrying implementation begins with a test that FAILS against that task's parent commit and ends fully green. **No commit intentionally retains a failing guard**, except Task 1, whose redness IS its declared deliverable. Tasks 1 and 5 carry no implementation and say so rather than dressing regression capture as red-green — invariant 1 forbids implementation before its test, which a task with no implementation cannot violate.
- **Invariant 6 (commit per task).** One conventional commit per task.
- **Invariant 8 (impeccable dual-gate).** Both changed component files are UI surfaces by path. Task 9.
- **Invariant 11 (worktree).** Satisfied.

N/A: invariants 2, 3, 4, 5, 9, 10 — no DB path, no Supabase call, no mutation surface, no new user-visible error copy.

**Scope is TWO consumers** (spec R10), and after R4 their changes are IDENTICAL: one rect call, one gated listener pair. Neither consumer's hidden branch, focus handling, or busy machinery is touched.

**Meta-test inventory.** No standard registry applies. One structural guard is created:

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/_metaPopoverViewportSource.test.ts` (Task 3) — DISCOVERS consumers by walking `components/` and `app/` for `computePopoverPlacement` call sites rather than reading a hardcoded list, so a third consumer added later fails by default. A hardcoded list is exactly what hid ShareHub in round 1. **Pre-verified against the live tree: discovery passes, four per-consumer assertions fail.**

**e2e harness readiness.** (a) Boot: no dev server, no Supabase — the spec bundles its entry with pinned esbuild, compiles token CSS with the Tailwind CLI, serves over `node:http` on an ephemeral port in `beforeAll`, under `tests/e2e/standalone.config.ts` (`standalone-chromium`, `devices["Desktop Chrome"]`). (b) Readiness: the existing per-case gate (`open()` waits for `harness-ready`, then a converge-by-loop `clickOpen`) is reused unchanged. (c) Detach safety: rects are read via `page.evaluate` while the popover is open; zoom never unmounts a node.

**Process correction (round 2 F2d).** Snippet verification writes to the session scratchpad, copies in, runs, and removes in the SAME command, with `git status` verified after. Round 2 observed leftover scratch files in the worktree while the reviewer was reading it; that cannot recur.

**Pre-draft verification already performed.**

| check | result |
|---|---|
| Every `file:line` in the spec read back | all matched |
| `pnpm spec:lint` spec and plan | `0 hard` each |
| Sweep re-run in the worktree | exactly two consumers (spec §2) |
| Implementation snippet typechecked | **failed first** — `Property 'CSS' does not exist on type 'Window'`; fixed with the structural `CssCarrier` accessor |
| Unit suite, round-4 API | 22/22 pass, typecheck clean |
| Mutation: drop the R4 anchor-overlap fallback | 2 tests red |
| Mutation: make subscription depend on usable dimensions (R13) | 1 test red |
| Structural guard against the live tree | discovery passes; 4 per-consumer assertions fail |
| **RED e2e layer actually run against unmodified code** | **3 discriminating failures + T-VV4 green by design; all 26 pre-existing tests still pass** (see Task 1) |
| ShareHub test scaffolding surveyed | `vi.hoisted` mocks for `rotateShareToken`, `resetPickerEpoch`, `next/navigation`; render under `ShareTokenProvider`; trigger `share-hub-kebab`, body `share-hub-popover` |

---

### Task 1: Author the RED real-engine layer + CI wiring

**Commit:** `test(admin): author the RED zoom-geometry e2e layer`

**No implementation.** The deliverable is a failing proof (spec R12).

Extend `tests/e2e/hoverhelp-geometry.spec.ts` with T-VV1..T-VV4 (spec §5) through `context.newCDPSession(page)`, using `Emulation.setPageScaleFactor` + `Input.synthesizeScrollGesture` (`gestureSourceType: "mouse"`) — **never** `synthesizePinchGesture`, measured as a silent no-op under this touchless project (spec §3.2).

**Round 3 F3 is binding: a red run is evidence only if it is red for the right reason.** Each case asserts, in order: (1) the gesture moved `visualViewport` — `scale > 1` and offsets non-zero; (2) the fixture's popover is open; (3) the discrimination precondition — the pre-zoom rect, which is exactly what the layout-viewport implementation leaves on screen because `window` scroll never fires on a zoom-pan, is NOT inside the zoomed visual viewport; only then (4) the exact-coordinate verdict. "Old placement" is the **pre-zoom natural box**, never an implementation-constrained post-zoom box.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
Also add `lib/popover/viewport.ts` and `components/admin/showpage/ShareHub.tsx` to the `pull_request` path filter in `.github/workflows/hoverhelp-geometry-e2e.yml` (spec §6). Wiring lands with the tests that need it.

**Already run against unmodified code. Observed:**

- 26 pre-existing tests: ALL PASS — no collateral damage.
- T-VV1 fails at `expect(after.left).toBeCloseTo(expectedLeft, 1)`; T-VV2 at `expect(insideVisual(after, v)).toBe(true)`; T-VV3 because the popover did not move with the pan.
- **All three reached their coordinate verdicts, i.e. every setup and precondition assertion passed** — including `insideVisual(before, v) === false`. The fixture genuinely places the legacy popover outside the zoomed slice.
- **T-VV4 PASSES against unmodified code by design** — it pins the R7 unzoomed no-op, which the layout-viewport implementation already satisfies. The layer is three discriminating failures plus one no-op guard; the commit body must say exactly that and must not claim 4/4 red.

Record that output verbatim in the commit body.

---

### Task 2: `isVisualViewportEngine` + `placementViewportRect`

**Commit:** `feat(popover): add the placement viewport rect and its engine predicate`

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**RED.** Create `tests/lib/popover/viewport.test.ts` — T-U1..T-U10 (spec §5). Fails: module does not exist.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**GREEN.** Create `lib/popover/viewport.ts`:

```ts
export function isVisualViewportEngine(win: Window): boolean {
  return !isWebKit(win) && !!win.visualViewport;
}

export function placementViewportRect(win: Window, trigger: Rect): Rect {
  if (!isVisualViewportEngine(win)) return layoutRect(win);
  const vv = win.visualViewport;
  if (!vv) return layoutRect(win);
  const { width, height } = vv;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return layoutRect(win);
  }
  const left = finiteOr0(vv.offsetLeft);
  const top = finiteOr0(vv.offsetTop);
  const visible: Rect = { left, top, width, height, right: left + width, bottom: top + height };
  if (!overlaps(trigger, visible)) return layoutRect(win); // spec R4
  return visible;
}
```

plus the `CssCarrier` accessor, `layoutRect`, and `overlaps` (built on the exported `intersectRects`, so "on screen" cannot mean something different here than in the core). `CSS` is a lib.dom global, not a `Window` property — that is a verified tsc failure, not a guess.

The two exports answer deliberately different questions (spec R13): subscription is an ENGINE question with no reference to current dimensions; usability is decided per measurement. Collapsing them is what created round 3 F4's recovery hole.

**Failure modes caught:** adopting the visual viewport on WebKit; trusting a `NaN`/zero visual viewport (popover vanishes); keeping `innerWidth` when a scrollbar gutter narrows the visible width; letting zoom drive placement while the anchor is off screen (R4); tying subscription to momentary dimensions (R13).

---

### Task 3: Both consumers bound by the visible slice

**Commit:** `fix(admin): bound both popover consumers by the visual viewport`

Both swaps land in ONE commit because the structural guard covers both; splitting them would require committing a knowingly-red guard.

**RED.** Create:
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/_metaPopoverViewportSource.test.ts` — the call-site-walking guard, asserting no consumer reads `window.innerWidth/innerHeight` and every consumer uses `placementViewportRect`.
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/hoverHelpVisualViewport.test.tsx` — T-C1, T-C4, **T-C6** (anchor off the visible slice → placed against the layout viewport and NOT hidden).
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` — T-S1, **T-S6** (same, plus `open` stays true and focus is untouched).

T-C6/T-S6 are the executable form of the descope: they fail on any implementation that lets zoom drive the hidden branch.

**GREEN.** In `components/admin/HoverHelp.tsx:226-233` and `components/admin/showpage/ShareHub.tsx:247-253`:

```ts
const viewportRect = placementViewportRect(window, toRect(trigger.getBoundingClientRect()));
```

reusing each file's existing trigger rect read rather than adding a measurement. Nothing downstream changes. Update HoverHelp's comment at :234-237.

**Failure modes caught:** the class fixed on the named instance only (round 1 F6); the import added with the literal left in place; zoom newly reaching a hidden branch (round 3 F1/F2); any future consumer reintroducing a direct layout-viewport read.

---

### Task 4: Reposition on zoom-pan, gated by the engine

**Commit:** `fix(admin): reposition both popovers on visualViewport scroll and resize`

**RED.** Extend both component test files with T-C2/T-C3/T-C5/T-C7 and T-S2/T-S3/T-S4/T-S5. Stubs are real `EventTarget` subclasses so add/dispatch/remove are genuine.

- T-C5/T-S5: WebKit-shaped stub → **no listener attached at all** (`addEventListener` spy). The class swept across both consumers.
- T-C3/T-S3: after close, dispatching both event types **on the originally captured object** schedules no frame — spying on `removeEventListener` proves nothing about which callback or target was removed.
- **T-C7**: open with a viewport reporting zero dimensions, then restore valid dimensions and dispatch `resize` — placement recovers and pan tracking works. Round 3 F4's hole, asserted end to end.
- **T-S4**: ShareHub under a `PopoverHostContext` panel with NON-ZERO `clientLeft`/`clientTop` and `scrollLeft`/`scrollTop`, asserting exact host-relative coordinates.

**GREEN.** In each open-effect (HoverHelp :325-367; ShareHub around :372):

```ts
const vv = isVisualViewportEngine(window) ? window.visualViewport : null;
vv?.addEventListener("scroll", schedule);
vv?.addEventListener("resize", schedule);
```

with symmetric removal in the same cleanup block (HoverHelp :339-340; ShareHub :404). `vv` is captured once and reused by the cleanup closure. Existing `window` listeners stay. **ShareHub's missing `window` scroll listener is NOT added** — pre-existing, unrelated to zoom (spec §8).

**Failure modes caught:** listeners on `window` instead of `window.visualViewport`; a WebKit browser scheduling re-measurement; asymmetric teardown leaking a listener per cycle; a degenerate-at-open viewport that can never recover.

---

### Task 5: Characterization pins on the pure core

**Commit:** `test(popover): pin narrow-bounds, below-floor, and origin-discrimination placement`

**No implementation. Not TDD, and not claimed to be** — `lib/popover/position.ts` is unmodified (spec R6), so these pass on first run. Regression capture; the commit body says so.

Extend `tests/lib/popover/position.test.ts`, deriving expectations from input rects: narrow bounds → `placed` with both caps, not `hidden` (R3); bounds narrower than the R9 floor → still `placed`; and a **discrimination pin** — identical trigger/body fed once with layout-viewport bounds and once with visual-viewport bounds yield DIFFERENT placements.

**Failure mode caught:** a future change to the hidden gates at `lib/popover/position.ts:104-115` making every zoomed popover vanish.

---

### Task 6: Close the RED layer

**Commit:** `test(admin): confirm the zoom-geometry e2e layer is green`

Run `pnpm test:e2e:hoverhelp-geometry`. The Task 1 layer must pass **unchanged** — no assertion may be edited to make it pass; if one needs editing, that is a finding about the implementation and goes back to Task 3/4. Record Task 1's output and this one's in the commit body.

---

### Task 7: Bookkeeping

**Commit:** `docs: close BL-HOVERHELP-VISUAL-VIEWPORT`

`BACKLOG.md` — mark the row closed citing **this spec's path**, not a PR number (the PR does not exist until Task 11; the PR body carries the reverse link). `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md` — add a superseded-by pointer on the §1.1 R8 row (line 30) without rewriting R8.

---

### Task 8: Full local gates

`pnpm typecheck`; `pnpm exec eslint` over changed files; `pnpm format:check`; `pnpm test` (FULL suite — scoped runs miss the registry suites under `tests/styles` and `tests/help`); `pnpm test:e2e:hoverhelp-geometry`. Check `$?` after vitest explicitly: it can exit 1 on an uncaught error while every test line reports pass. Compare against the pre-existing baseline captured before implementation began.

---

### Task 9: Impeccable dual-gate (invariant 8)

`/impeccable critique` and `/impeccable audit` on the diff with the canonical v3 setup gates, **with subagents** (standing owner requirement; an inline run is degraded and must be redone). P0/P1 fixed or deferred via `DEFERRED.md`; dispositions in the PR body. Expected light: no new element, no class-string change, no copy, no token, and after R4 no focus-behavior change either.

---

### Task 10: Adversarial review (cross-model), whole diff

Dispatch via `node scripts/codex-guard.mjs review --brief <file> --cwd <worktree> --out <fresh timestamped dir>`, backgrounded. **The wrapper runs Codex read-only** — round 1 lost its entire written deliverable to a rejected `apply_patch`, so briefs MUST request findings in the reviewer's FINAL MESSAGE, never in a file.

Brief contains: fresh-eyes posture; "Your role: REVIEWER ONLY"; the do-not-relitigate list from spec §1.1; the `VERDICT:` final-line instruction; no nested reviews; enumerate-all-instances-per-round discipline. A `no_verdict` is an INFRASTRUCTURE fault, not "found nothing" — apply the skip/self-review ladder, never blind-retry.

---

### Task 11: Ship

Push; open the PR with spec/plan links, the Task 1 → Task 6 red/green evidence, and Task 9 dispositions; wait for **real CI green** (`hoverhelp-geometry-e2e` plus the standard suite); `gh pr merge --merge`; fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`; then `CronDelete` the Stage-0 nudge job.

Local green is necessary but not sufficient: this diff touches a workflow path filter and a Chromium-only e2e, both historically prone to dev-host/CI divergence.

---

## Self-review

- **The three-round vector is closed by removal, not by another gate.** Round 3 F1 was the third consecutive finding on WebKit-exclusion completeness. Rounds 1-3 each added a gate to a growing surface (rect → listeners → hidden branch). Spec R4's rescission removes the surface: zoom can no longer drive placement into a hidden branch at all, so the exclusion now has exactly two surfaces and the plan lost a task instead of gaining one.
- **Round-3 findings discharged:** F1 → R4 rescission + R5's reduced surface. F2 → R11 deleted; the busy/settle conflict cannot arise because the state does not. F3 → Task 1's ordered precondition requirements, plus the honest T-VV4 accounting that came from actually running it. F4 → the R13 subscription/usability split with T-U10 and T-C7. F5 → §4.7 is now true rather than contradicted.
- **Round-1/2 findings remain discharged:** WebKit exclusion, conditional R7 with T-U8, R9 below-floor pin, exact-coordinate e2e with a runtime precondition, both-events listener coverage with post-close inertness, ShareHub in scope, PR-reference ordering.
- **Every claim of verification is backed by a run**, including the RED layer, which was executed against unmodified code and whose honest accounting (3 red + 1 green-by-design) corrected this plan's earlier framing.
- **Numeric sweep.** Constants all pre-existing (`GAP` 6, `VIEWPORT_INSET` 8, `TOL` 0.5); the R9 floors are derived documentation; the e2e zoom scale is computed in-page.
