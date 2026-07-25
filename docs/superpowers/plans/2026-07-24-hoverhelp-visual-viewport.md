# Visual-Viewport Popover Placement Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md` (round 5)
**Branch:** `fix/hoverhelp-visual-viewport`, worktree `/Users/ericweiss/FX-worktrees/hoverhelp-visual-viewport`
**Closes:** `BL-HOVERHELP-VISUAL-VIEWPORT`
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-24 brainstorming gate); spec + plan user-review gates waived.

**Round 5 closes the recurring vector with a property, not another boundary.** Round 4 descoped (deleting a whole task), but its replacement rule was still a geometric guess and round 4's review refuted it: the helper compared overlap against the RAW visual rect while the core compares the INSET one. Four guesses, four refutations. Spec R4 is now an OUTCOME test — compute with visible bounds, and if the result is `hidden`, use today's layout bounds instead — and spec R14 ships the property suite that proves it, in the same commit as the code (Task 2), per the escalation rule.

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
| Unit + property suites, round-5 API | 29/29 pass, typecheck clean |
| **Mutation: inject round 4's refuted raw-overlap rule** | **all 9 property groups red, reproducing the reviewer's counterexample** |
| Mutation: make subscription depend on usable dimensions (R13) | 1 test red |
| Probe: R4 outcome rule in a real component render | anchor off-slice -> placed at trigger.bottom + GAP, NOT hidden |
| ShareHub jsdom scaffolding smoke | mounts, kebab opens the popover, stubs take |
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

### Task 2: The viewport rects, the bounds policy, and the property that pins it

**Commit:** `feat(popover): add visible-viewport bounds with a never-newly-hidden guarantee`

**RED.** Create three test files:

<!-- spec-lint: ignore — files created BY this plan; not tracked until this task lands -->
- `tests/lib/popover/viewport.test.ts` — T-U1..T-U8, T-U10 (spec §4.1 guard table). Pins what the rects ARE; contains no bounds policy.
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/lib/popover/neverNewlyHidden.test.ts` — **the structural defense (spec R14)**: `new placement hidden IMPLIES legacy placement hidden`, over a four-edge overlap sweep, short/narrow slices, panel hosts, and 2000 seeded random configs.
- (position.test.ts extensions land in Task 5.)

All fail: the modules do not exist.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**GREEN.** Create `lib/popover/viewport.ts` (three exports, no policy) and `lib/popover/place.ts`:

```ts
export function placeWithinVisibleViewport(win: Window, input: PlaceInput): PopoverPlacement {
  const { hostRect, ...core } = input;
  const layout = layoutViewportRect(win);
  const legacy = () => computePopoverPlacement({ ...core, bounds: boundsFor(layout, hostRect) });

  const visual = visualViewportRect(win);
  if (visual === null) return legacy();

  const zoomed = computePopoverPlacement({ ...core, bounds: boundsFor(visual, hostRect) });
  return zoomed.kind === "hidden" ? legacy() : zoomed; // spec R4
}
```

with `boundsFor(viewport, hostRect) = insetRect(intersectRects(hostRect ?? viewport, viewport), VIEWPORT_INSET)` — the identical composition the consumers use today, so the host model is unchanged. `lib/popover/position.ts` stays unmodified (spec R6); this wraps it.

**Already verified:** 29/29 pass (20 unit + 9 property), typecheck clean. **The property suite was validated by injecting round 4's refuted raw-overlap rule — all nine groups fail with `left overlap=1: zoom NEWLY hid the popover — legacy placed it`,** independently reproducing round 4's counterexample.

**Failure modes caught:** any bounds policy that lets zoom newly hide a popover, at any edge, through any core gate — including gates added later, because the property is checked against the core's own answer rather than a hand-derived threshold.

---

### Task 3: Route both consumers through the shared placement

**Commit:** `fix(admin): place both popovers within the visible viewport`

Both call sites change in ONE commit because the structural guard covers both; splitting would require committing a knowingly-red guard.

**RED.** Create:
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/_metaPopoverViewportSource.test.ts` — the call-site-walking guard (pre-verified: discovery passes, per-consumer assertions fail).
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/hoverHelpVisualViewport.test.tsx` — T-C1, T-C4, T-C6.
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` — T-S1, T-S6.

**GREEN — and this is more than a one-line swap; round 4 F3 was right to flag that claim.** In each consumer:

1. Compute the host rect as `Rect | null` (null for the body host) instead of degenerating it to a viewport rect.
2. Take ONE trigger snapshot and pass it to `placeWithinVisibleViewport` as `input.trigger`; the same snapshot serves the bounds decision and the placement, so the two cannot disagree.
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
3. Delete the local `viewportRect` literal and the local `bounds` composition — both now live in `place.ts`.
4. Keep the host rect for the existing host-offset conversion, which is unchanged.

**ShareHub specifically:** `trigger = containerRef.current` is in scope at :236, but `triggerRect` is currently computed at :273 — AFTER the viewport rect at :247. Hoist that measurement above the placement call so one rect feeds both. ShareHub's anchor is the CONTAINER, which is already the rect it passes to the core, so overlap semantics stay consistent.

**Verified by probe:** applying this swap to HoverHelp and rendering with the anchor outside the visible slice produced a placed popover at `trigger.bottom + GAP` — not a hidden one. Reverted after measuring.

**Failure modes caught:** the class fixed on one consumer only (round 1 F6); two trigger snapshots disagreeing at the boundary (round 4 F3); any future consumer reintroducing a direct layout-viewport read.

---

### Task 4: Reposition on zoom-pan, gated by the engine

**Commit:** `fix(admin): reposition both popovers on visualViewport scroll and resize`

**RED.** Extend both component test files with T-C2/T-C3/T-C5/T-C7 and T-S2/T-S3/T-S4/T-S5. Stubs are real `EventTarget` subclasses so add/dispatch/remove are genuine.

- T-C5/T-S5: WebKit-shaped stub → **no listener attached at all** (`addEventListener` spy). The class swept across both consumers.
- T-C3/T-S3: after close, dispatching both event types **on the originally captured object** schedules no frame — spying on `removeEventListener` proves nothing about which callback or target was removed.
- **T-C7**: open with a viewport reporting zero dimensions, then restore valid dimensions and dispatch `resize` — placement recovers and pan tracking works. Round 3 F4's hole, asserted end to end.
- **T-S4**: ShareHub under a `PopoverHostContext` panel with NON-ZERO `clientLeft`/`clientTop` and `scrollLeft`/`scrollTop`, asserting exact host-relative coordinates.
- **T-S7**: ShareHub's OWN zero-dimension recovery (round 4 F2). T-C7 proves it for HoverHelp only, and every other ShareHub test plus all Chromium e2e cases would survive a ShareHub-only regression, since the e2e fixtures render HoverHelp.

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

`pnpm typecheck`; `pnpm exec eslint` over changed files; `pnpm format:check`; `pnpm test` (FULL suite — scoped runs miss the registry suites under `tests/styles` and `tests/help`); `pnpm test:e2e:hoverhelp-geometry`. Check `$?` after vitest explicitly: it can exit 1 on an uncaught error while every test line reports pass, and NEVER pipe it through `tail` — that discards the failing filenames and makes `$?` report tail's status.

**Baseline: HEAD is GREEN** — 1586 files / 17138 tests passed, 0 failed, 16 skipped, measured on a quiet tree. There is no pre-existing failure budget, so Task 8 must be green too. (An earlier baseline reporting 5 failures was invalid: it ran concurrently with snippet verification that was creating and deleting files in the same worktree.)

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
