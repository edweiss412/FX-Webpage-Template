# Visual-Viewport Popover Placement Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md` (round 3)
**Branch:** `fix/hoverhelp-visual-viewport`, worktree `/Users/ericweiss/FX-worktrees/hoverhelp-visual-viewport`
**Closes:** `BL-HOVERHELP-VISUAL-VIEWPORT`
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-24 brainstorming gate); spec + plan user-review gates waived.

---

## Global Constraints

- **Invariant 1 (TDD per task).** Restructured after round 2 F2. Every task carrying implementation begins with a test that FAILS against that task's parent commit and ends fully green. **No commit intentionally retains a failing guard**, except Task 1, whose redness IS its declared deliverable. The two tasks that carry no implementation (Tasks 1 and 6) say so explicitly rather than dressing regression capture as a red-green cycle — invariant 1 forbids implementation before its test, which a task with no implementation cannot violate.
- **Invariant 6 (commit per task).** One conventional commit per task.
- **Invariant 8 (impeccable dual-gate).** Both `components/admin/HoverHelp.tsx` and `components/admin/showpage/ShareHub.tsx` are UI surfaces by path. Task 10.
- **Invariant 11 (worktree).** Satisfied.

Deliberately N/A: invariants 2, 3, 4, 5, 9, 10 — no DB path, no Supabase call, no mutation surface, no new user-visible error copy.

**Scope is TWO consumers** (spec R10). Every placement-touching task covers both or states why not.

**Ordering is a contract (spec R12).** The real-engine layer is Task 1, authored and observed RED before any implementation exists. Round 2 F4 established that a test written after the behavior cannot demonstrate it discriminates, and that comparing two synthetic rectangles never exercises placement at all. House pattern: `docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band.md` Task 1.

**Meta-test inventory (mandatory declaration).** No standard registry applies (no Supabase boundary, no `admin_alerts` row, no advisory-lock topology, no tile sentinel). One structural guard is created:

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/_metaPopoverViewportSource.test.ts` (Task 3) — DISCOVERS consumers by walking `components/` and `app/` for `computePopoverPlacement` call sites rather than reading a hardcoded list, so a third consumer added later fails by default. A hardcoded list is exactly what hid ShareHub in round 1. **Pre-verified against the live tree: the discovery assertion passes and four per-consumer assertions fail** — the correct red for Task 3.

<!-- spec-lint: ignore — bare basename of a file this plan creates or explicitly drops; not tracked -->
Round 2's proposed `viewportMutants.test.ts` is **DROPPED** (F4: comparing two synthetic rectangles is a tautology that never runs placement). Its job is done by Task 1's observed RED plus Task 6's placement-level discrimination pin.

**e2e harness-readiness checklist.** (a) Boot: no dev server, no Supabase — the spec bundles its entry with pinned esbuild, compiles token CSS with the Tailwind CLI, serves over `node:http` on an ephemeral port in `beforeAll`, under `tests/e2e/standalone.config.ts` (`standalone-chromium`, `devices["Desktop Chrome"]`). (b) Readiness: the existing per-case gate is reused; new cases mount into the same page and await the same popover-open state, never `networkidle` alone. (c) Detach safety: rects are read via `page.evaluate` while the popover is open; zoom never unmounts a node.

**Process correction from round 2 F2(d).** That finding observed untracked scratch files in the worktree, contradicting this plan's claim they had been deleted — transient artifacts of snippet verification running while the reviewer read the tree. All snippet verification now writes to the session scratchpad, copies in, runs, and removes in the SAME command, with `git status` verified after.

**Pre-draft verification already performed.**

| check | result |
|---|---|
| Every `file:line` in the spec read back | all matched |
| `pnpm spec:lint` on spec and plan | `0 hard` each |
| Sweep re-run **in the worktree** | exactly two consumers (spec §2) |
| Implementation snippet typechecked | **failed first** — `Property 'CSS' does not exist on type 'Window'`; fixed with the structural `CssCarrier` accessor |
| Unit suite typechecked + run, with `usesVisualViewport` | 22/22 pass |
| Unit suite mutation-tested | removing the WebKit exclusion turns T-U3 red; preferring `innerWidth` over the visual width turns T-U8 red |
| Structural guard run against the live tree | discovery passes; 4 per-consumer assertions fail (correct red) |
| ShareHub test scaffolding surveyed | needs `vi.hoisted` mocks for `rotateShareToken`, `resetPickerEpoch`, `next/navigation`; render under `ShareTokenProvider`; trigger `share-hub-kebab`, body `share-hub-popover` |

---

### Task 1: Author the RED real-engine layer + CI wiring

**Commit:** `test(admin): author the RED zoom-geometry e2e layer`

**No implementation in this task.** Its deliverable is a failing proof (spec R12).

Extend `tests/e2e/hoverhelp-geometry.spec.ts` with T-VV1..T-VV4 (spec §5), through `context.newCDPSession(page)` using `Emulation.setPageScaleFactor` + `Input.synthesizeScrollGesture` (`gestureSourceType: "mouse"`). **Not** `synthesizePinchGesture` — spec §3.3 measured it as a silent no-op under this touchless project.

T-VV1 carries the **runtime precondition** round 2 F4 requires: recompute in-page the placement the layout-viewport code produces and assert it lies OUTSIDE the visual bounds, so the fixture cannot silently degrade into one where the old answer was already fine.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
Also add to `.github/workflows/hoverhelp-geometry-e2e.yml`'s `pull_request` path filter: `lib/popover/viewport.ts` and `components/admin/showpage/ShareHub.tsx` (spec §6). Wiring lands with the tests that need it.

**Run it. Record the failure output verbatim in the commit body** — this is the discrimination evidence for the whole change.

---

### Task 2: `visibleViewportRect` + `usesVisualViewport`

**Commit:** `feat(popover): add the visible-viewport rect and its engine predicate`

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**RED.** Create `tests/lib/popover/viewport.test.ts` — T-U1..T-U9 (spec §5). Fails: module does not exist.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**GREEN.** Create `lib/popover/viewport.ts` exporting both functions. `usesVisualViewport` is the single source of truth for the WebKit exclusion (spec R5); `visibleViewportRect` returns the visual rect exactly when it is true. T-U9 asserts that agreement directly, because round 2 F1 was possible only through those two decisions drifting apart.

```ts
export function usesVisualViewport(win: Window): boolean {
  if (isWebKit(win)) return false;
  const vv = win.visualViewport;
  if (!vv) return false;
  const { width, height } = vv;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

export function visibleViewportRect(win: Window): Rect {
  const vv = win.visualViewport;
  if (!usesVisualViewport(win) || !vv) return layoutRect(win);
  const left = finiteOr0(vv.offsetLeft);
  const top = finiteOr0(vv.offsetTop);
  const { width, height } = vv;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
```

with the `CssCarrier` accessor and `layoutRect` helper as verified (`CSS` is a lib.dom global, not a `Window` property). No non-null assertion: the `!vv` re-check keeps eslint clean and costs nothing.

**Failure modes caught:** adopting the visual viewport on WebKit (ships the unverifiable transform R5 forbids); trusting a `NaN`/zero visual viewport (popover vanishes); keeping `innerWidth` when a scrollbar gutter makes the visible width narrower; the predicate and the rect disagreeing.

---

### Task 3: Both consumers bound by the visible slice

**Commit:** `fix(admin): bound both popover consumers by the visual viewport`

Both swaps land in ONE commit **because the structural guard covers both** — splitting them would require committing a knowingly-red guard, which round 2 F2 rejected.

**RED.** Create three files:
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/_metaPopoverViewportSource.test.ts` — the call-site-walking guard (pre-verified: discovery passes, four assertions fail).
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/hoverHelpVisualViewport.test.tsx` — T-C1, T-C4.
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` — T-S1, with the surveyed scaffolding.

**GREEN.** Replace the rect literal with `visibleViewportRect(window)` in `components/admin/HoverHelp.tsx:226-233` and `components/admin/showpage/ShareHub.tsx:247-253`, plus imports. Nothing downstream changes in either. Update HoverHelp's comment at :234-237 to say bounds are now the visible slice.

**Failure modes caught:** the class fixed on the named instance only (round 1 F6); the import added with the literal left in place; any future consumer reintroducing a direct layout-viewport read.

---

### Task 4: Reposition on zoom-pan, gated by the predicate

**Commit:** `fix(admin): reposition both popovers on visualViewport scroll and resize`

**RED.** Extend both component test files with T-C2/T-C3/T-C5 and T-S2/T-S3/T-S6. The stubs are real `EventTarget` subclasses so add/dispatch/remove are genuine.

T-C5 and T-S6 are the round 2 F1 pins, swept across BOTH consumers rather than patched on one: with a WebKit-shaped stub, **no `visualViewport` listener is attached at all**, asserted via an `addEventListener` spy. T-C3/T-S3 assert post-close inertness of the ORIGINAL viewport object, not merely that `removeEventListener` was called (round 2 F5).

**GREEN.** In each consumer's open-effect (HoverHelp :325-367; ShareHub around :372):

```ts
const vv = usesVisualViewport(window) ? window.visualViewport : null;
vv?.addEventListener("scroll", schedule);
vv?.addEventListener("resize", schedule);
```

with symmetric removal in the same cleanup block (HoverHelp :339-340; ShareHub :404). `vv` is captured once and reused by the cleanup closure, so add and remove cannot target different objects.

Existing `window` listeners stay. **ShareHub's missing `window` scroll listener is NOT added here** — pre-existing, unrelated to zoom, spec §8.

**Failure modes caught:** listeners on `window` instead of `window.visualViewport` (never fire on a pan); a WebKit browser scheduling re-measurement and drifting during pan (round 2 F1); asymmetric teardown leaking a listener per cycle.

---

### Task 5: ShareHub panel host + the collision-hidden focus contract

**Commit:** `fix(admin): give ShareHub a focus-safe collision-hidden path`

<!-- spec-lint: ignore — bare basename of a file this plan creates or explicitly drops; not tracked -->
**RED.** Extend `shareHubVisualViewport.test.tsx`:
- T-S4 panel host under `PopoverHostContext` with NON-ZERO `clientLeft`/`clientTop` and `scrollLeft`/`scrollTop`, asserting exact host-relative coordinates. Round 2 F5: a ShareHub-only regression ignoring the panel intersection would otherwise pass the source guard, the body-host test, and HoverHelp's panel e2e simultaneously.
- T-S5 both arms of spec R11: focus a descendant, drive placement hidden, then (a) not busy → closes and focus returns to `openerRef.current`; (b) busy → panel stays VISIBLE, focus not stranded.

**GREEN.** In ShareHub's `placement.kind === "hidden"` branch (:290-300) — today only `visibility: hidden`, with a comment scoping it to transient degenerate rects — add the focus-safety path following ShareHub's own idiom: the defer-while-busy shape at :486-506 and the `openerRef.current?.focus()` restore at :505. Mirror the existing mechanism; do not invent one.

**Failure mode caught:** a dialog carrying destructive controls left invisible with `open` true and focus inside it — newly reachable precisely because spec R4 makes the hidden state user-reachable.

---

### Task 6: Characterization pins on the pure core

**Commit:** `test(popover): pin narrow-bounds, below-floor, and origin-discrimination placement`

**No implementation. Not TDD, and not claimed to be** — `lib/popover/position.ts` is unmodified (spec R6), so these pass on first run. Regression capture, and the commit body says so.

Extend `tests/lib/popover/position.test.ts`, deriving expectations from input rects:
- narrow bounds → `placed` with both caps, not `hidden` (spec R3).
- bounds narrower than the R9 irreducible box → still `placed` (spec R9).
- **discrimination pin:** identical trigger/body fed once with layout-viewport bounds and once with visual-viewport bounds yield DIFFERENT placements. This exercises real placement, which round 2 F4 said the dropped mutant file never did.

**Failure mode caught:** a future change to the hidden gates at `lib/popover/position.ts:104-115` making every zoomed popover vanish.

---

### Task 7: Close the RED layer

**Commit:** `test(admin): confirm the zoom-geometry e2e layer is green`

Run `pnpm test:e2e:hoverhelp-geometry`. The Task 1 layer must now pass unchanged — **no assertion may be edited to make it pass**; if one needs editing, that is a finding about the implementation and goes back to Task 3/4/5.

Record Task 1's output and this one's in the commit body. That pair is the durable discrimination evidence replacing round 2's rejected one-shot negative run.

---

### Task 8: Bookkeeping

**Commit:** `docs: close BL-HOVERHELP-VISUAL-VIEWPORT`

1. `BACKLOG.md` — mark the row closed citing **this spec's path**, not a PR number. Round 2 F6 is right that the PR does not exist until Task 12; the spec path is stable at commit time and the PR body carries the reverse link (spec AC-7).
2. `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md` — add a superseded-by pointer on the §1.1 R8 row (line 30). Do NOT rewrite R8; it stays as the ratification that filed this successor.

---

### Task 9: Full local gates

`pnpm typecheck`; `pnpm exec eslint` over changed files; `pnpm format:check`; `pnpm test` (FULL suite — scoped runs miss the registry suites under `tests/styles` and `tests/help`); `pnpm test:e2e:hoverhelp-geometry`. Check `$?` after vitest explicitly: it can exit 1 on an uncaught error while every test line reports pass.

---

### Task 10: Impeccable dual-gate (invariant 8)

`/impeccable critique` and `/impeccable audit` on the diff with the canonical v3 setup gates, **with subagents** (standing owner requirement; an inline run is degraded and must be redone). P0/P1 fixed or deferred via `DEFERRED.md`; dispositions in the PR body. Expected light — no new element, no class-string change, no copy, no token — though Task 5 changes a focus behavior, which is the one thing here an audit could legitimately flag.

---

### Task 11: Adversarial review (cross-model), whole diff

Dispatch via `node scripts/codex-guard.mjs review --brief <file> --cwd <worktree> --out <fresh timestamped dir>`, backgrounded.

**The wrapper runs Codex read-only.** Round 1 lost its entire written deliverable to a rejected `apply_patch`. Briefs MUST request findings in the reviewer's FINAL MESSAGE, never in a file.

Brief contains: fresh-eyes posture; **"Your role: REVIEWER ONLY"**; the do-not-relitigate list from spec §1.1; the `VERDICT:` final-line instruction; no nested cross-model reviews; enumerate-all-instances-per-round discipline. A `no_verdict` result is an INFRASTRUCTURE fault, not "found nothing" — apply the skip/self-review ladder, never blind-retry. Iterate to APPROVE, no round budget.

---

### Task 12: Ship

Push; open the PR with spec/plan links, the Task 1 → Task 7 red/green evidence, and Task 10 dispositions; wait for **real CI green** (`hoverhelp-geometry-e2e` plus the standard suite); `gh pr merge --merge`; fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`; then `CronDelete` the Stage-0 nudge job.

Local green is necessary but not sufficient: this diff touches a workflow path filter and a Chromium-only e2e, both historically prone to dev-host/CI divergence.

---

## Self-review

- **Round-2 findings are discharged structurally, not in prose.** F1 → one predicate gating both decisions, pinned on BOTH consumers (T-C5/T-S6); this is the vector's second appearance, and the same-vector rule demands a structural close rather than another patch. F2 → task order rebuilt so every implementation task is red-then-green against its parent, the two no-implementation tasks are labelled, and scratch verification moved out of the worktree. F3 → Task 5. F4 → tautological mutant file dropped, replaced by RED-first authoring plus a placement-level discrimination pin and a runtime precondition assertion. F5 → T-S4 with non-zero border and scroll offsets. F6 → Task 8 cites the spec path.
- **Round-1 findings remain discharged:** WebKit exclusion (now complete), conditional R7 with T-U8, the R9 below-floor pin, exact-coordinate e2e, both-events listener coverage, ShareHub in scope.
- **Snippets are verified, not plausible:** the implementation failed `tsc` on first draft; the current version typechecks, runs 22/22, and dies under both injected mutations; the structural guard was run against the live tree and fails for exactly the four expected reasons.
- **Numeric sweep.** Constants are all pre-existing (`GAP` 6, `VIEWPORT_INSET` 8, `TOL` 0.5); the R9 floors are derived documentation no implementation hardcodes; the e2e zoom scale is computed in-page.
