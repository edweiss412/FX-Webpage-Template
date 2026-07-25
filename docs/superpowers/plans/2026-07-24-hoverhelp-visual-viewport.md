# Visual-Viewport Popover Placement Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md` (round 2, after a BLOCKING round-1 review)
**Branch:** `fix/hoverhelp-visual-viewport`, worktree `/Users/ericweiss/FX-worktrees/hoverhelp-visual-viewport`
**Closes:** `BL-HOVERHELP-VISUAL-VIEWPORT`
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-24 brainstorming gate); spec + plan user-review gates waived.

---

## Global Constraints

Applicable AGENTS.md plan-wide invariants:

- **Invariant 1 (TDD per task).** Every task is RED test → minimal implementation → GREEN → commit. Pre-draft verification deliberately DELETED its scratch implementation so each task's first run is a genuine red.
- **Invariant 6 (commit per task).** One conventional commit per task, scoped as noted.
- **Invariant 8 (impeccable dual-gate).** Both `components/admin/HoverHelp.tsx` and `components/admin/showpage/ShareHub.tsx` are UI surfaces by path. Task 9 runs the critique + audit pair.
- **Invariant 11 (worktree).** Satisfied: authored in the worktree off `origin/main` at `b58fb0966`.

Deliberately N/A: invariants 2 (advisory locks), 3 (email canonicalization), 4 (sync cursor), 5 (no new user-visible error copy), 9 (Supabase call boundaries), 10 (mutation-surface telemetry) — this diff has no DB path, no Supabase call, and mutates nothing.

**Scope is TWO consumers, not one.** Spec R10: `ShareHub` builds the identical viewport rect and calls the same `computePopoverPlacement`. Round 1 caught this because the original sweep had been run in the stale main checkout. Every task below that touches placement touches both files or explicitly says why not.

**Meta-test inventory (mandatory declaration).** No standard registry applies (no Supabase boundary, no `admin_alerts` row, no advisory-lock topology, no tile sentinel). This plan CREATES two structural guards, both because their defect class is nameable at first occurrence rather than after a recurrence:

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/components/admin/_metaPopoverViewportSource.test.ts` (Task 2) — no placement consumer may read `window.innerWidth`/`innerHeight` directly. Walks the `computePopoverPlacement` call sites rather than a hardcoded file list, so a THIRD consumer added later is covered by default. This is the guard that would have caught the ShareHub miss.
<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
- `tests/lib/popover/viewportMutants.test.ts` (Task 6) — pins that the e2e oracle can discriminate: a double-added offset and a layout-viewport origin each produce a rect different from `visibleViewportRect`'s. Round 1 F4 rejected a one-shot uncommitted negative run as non-durable; this is its committed replacement.

**e2e harness-readiness checklist (mandatory).** (a) Boot: no dev server, no Supabase — `tests/e2e/hoverhelp-geometry.spec.ts` bundles its entry with pinned esbuild, compiles token CSS with the Tailwind CLI, and serves its page over `node:http` on an ephemeral port in `beforeAll`, under `tests/e2e/standalone.config.ts` (`standalone-chromium`, `devices["Desktop Chrome"]`). (b) Readiness: the existing per-case gate is reused unchanged; new cases mount into the same page and await the same popover-open state, never `networkidle` alone. (c) Detach safety: assertions read rects via `page.evaluate` while the popover is open; no sampler outlives its element, and zoom never unmounts a node.

**Pre-draft verification already performed (do not re-derive).**

| check | result |
|---|---|
| Every `file:line` in the spec read back with `sed -n` | all matched |
| `pnpm spec:lint <spec>` | `0 hard`, exit 0 |
| Sweep re-run **in the worktree** (`innerWidth`/`innerHeight`/`visualViewport`, and `computePopoverPlacement` call sites) | exactly two consumers; dispositions in spec §2 |
| Task 1 implementation snippet typechecked against strict tsconfig | **failed first** — `Property 'CSS' does not exist on type 'Window'`; fixed with the structural `CssCarrier` accessor now in the Task 1 body |
| Task 1 unit suite typechecked + run | 16/16 pass |
| Task 1 unit suite mutation-tested, round-2 semantics | removing the WebKit exclusion turns T-U3 red; preferring `innerWidth` over the visual width turns T-U8 red; both restored green |
| Task 3 component-test snippet typechecked | clean |
| Wiring for every new test file | `tests/lib/**` and `tests/components/**` are covered by the default vitest config; the e2e extends a file already in the standalone allow-list; the two missing workflow path entries are Task 7 |

---

### Task 1: `visibleViewportRect`

**Commit:** `feat(popover): add visibleViewportRect for visual-viewport bounds`

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**RED.** Create `tests/lib/popover/viewport.test.ts` — one case per spec §4.1 guard-table row (T-U1..T-U8), built on a `makeWin({ innerWidth, innerHeight, vv, webkit, css })` stub cast to `Window`. No jsdom, no global mutation, so no `@vitest-environment` pragma. Fixture values are the probe's real numbers (156x312 at 117,234). Every expectation is a full `toEqual` on all six `Rect` fields.

T-U3 asserts the **WebKit exclusion** (layout rect returned, visual size NOT adopted) plus a paired non-WebKit case proving the branch is load-bearing. T-U8 asserts the scrollbar-shaped case (`innerWidth` 1280, `vv.width` 1265 → 1265), pinning spec R7.

Run: must fail because `@/lib/popover/viewport` does not exist yet.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**GREEN.** Create `lib/popover/viewport.ts`:

```ts
import type { Rect } from "@/lib/popover/position";

const finiteOr0 = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * `CSS` is a global var in lib.dom, NOT a property of the `Window` interface
 * (tsc: "Property 'CSS' does not exist on type 'Window'"), so it is read
 * structurally off the injected window. An engine without `CSS.supports` takes
 * the non-WebKit branch, which is correct for every such engine.
 */
type CssCarrier = { CSS?: { supports?: (property: string, value: string) => boolean } };

const isWebKit = (win: Window): boolean => {
  const css = (win as Window & CssCarrier).CSS;
  return typeof css?.supports === "function" && css.supports("-webkit-backdrop-filter", "none");
};

function layoutRect(win: Window): Rect {
  const width = win.innerWidth;
  const height = win.innerHeight;
  return { left: 0, top: 0, width, height, right: width, bottom: height };
}

export function visibleViewportRect(win: Window): Rect {
  // WebKit is EXCLUDED (spec R5): client coords there are already
  // visual-viewport-relative, so the body-host conversion would ALSO need the
  // visual offset - and none of it is verifiable in this repo's harness.
  if (isWebKit(win)) return layoutRect(win);
  const vv = win.visualViewport;
  if (!vv) return layoutRect(win);
  const { width, height } = vv;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return layoutRect(win);
  }
  const left = finiteOr0(vv.offsetLeft);
  const top = finiteOr0(vv.offsetTop);
  return { left, top, width, height, right: left + width, bottom: top + height };
}
```

Header comment states why this lives outside `lib/popover/position.ts` (that module is pure algebra with no environment reads) and cites spec §3.4 / R5.

**Failure modes caught:** an implementation that adopts the visual viewport on WebKit (ships the unverifiable transform R5 forbids); one that trusts a `NaN`/zero visual viewport (popover vanishes — worse than the bug being fixed); one that keeps `innerWidth` when a scrollbar gutter makes the visible width narrower.

---

### Task 2: HoverHelp — bound by the visible slice

**Commit:** `fix(admin): bound HoverHelp by the visual viewport, not the layout viewport`

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**RED (behavioral).** Create `tests/components/admin/hoverHelpVisualViewport.test.tsx` with T-C1, T-C4, T-C5 (T-C2/T-C3 land in Task 3), reusing the `stubRect` idiom at `tests/components/admin/hoverHelpLifecycle.test.tsx:157`. The stubbed slice (300x250 at 400,200) is smaller than AND offset from the layout viewport (1000x800), so a layout-viewport implementation and a visual-viewport one cannot agree. Every expected number derives from the stubs plus `GAP`/`VIEWPORT_INSET`; T-C1 carries a negative assertion naming the value the old code would have written. T-C5 pins the WebKit path at the component layer.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**RED (structural).** Create `tests/components/admin/_metaPopoverViewportSource.test.ts`: enumerate the `computePopoverPlacement` call sites by walking `components/` and `app/` (NOT a hardcoded list — a hardcoded list is what let ShareHub slip), and for each consuming file assert its comment-stripped source contains no `window.innerWidth`/`innerHeight` and does contain `visibleViewportRect`. Comment-stripping matters: this repo's meta-tests have a documented comment-fragility failure mode.

At this point the guard FAILS for ShareHub — that is correct and expected; Task 4 turns it green. Note the expected-red explicitly in the commit body so the intermediate state is not mistaken for a broken commit.

**GREEN.** In `components/admin/HoverHelp.tsx`, replace the inline rect literal at :226-233 with `const viewportRect = visibleViewportRect(window);` plus the import. Nothing downstream changes. Update the existing comment at :234-237 to say the bounds are now the visible slice.

**Failure modes caught:** the swap made for one rect consumer but not the other; the import added with the literal left in place; any future reintroduction of a direct layout-viewport read in a placement consumer (structural guard).

---

### Task 3: HoverHelp — reposition on zoom-pan

**Commit:** `fix(admin): reposition HoverHelp on visualViewport scroll and resize`

**RED.** Extend the Task 2 file with T-C2 and T-C3. The stub is a real `EventTarget` subclass so add/dispatch/remove are genuine.

- T-C2 exercises **both** event types independently (a `scroll` schedules exactly one frame; a `resize` schedules one; either while CLOSED schedules none). Round 1 F5 flagged scroll-only coverage.
- T-C3 closes, then dispatches **both** event types **on the originally captured viewport object** and asserts no frame is scheduled. Round 1 F5 is right that spying on `removeEventListener` proves nothing about which callback or target was removed — post-close inertness of the original object is the assertion that does.

**GREEN.** In the open-effect (:325-367), alongside the existing `window` listeners:

```ts
const vv = window.visualViewport;
vv?.addEventListener("scroll", schedule);
vv?.addEventListener("resize", schedule);
```

and in the same cleanup block (:339-340), the symmetric `vv?.removeEventListener(...)` pair. `vv` is captured once in the effect body and reused by the cleanup closure, so add and remove cannot target different objects; `schedule` is the single instance captured by that effect run. Existing `window` listeners stay — they carry ordinary scrolling and resizes, which visual-viewport events do not replace.

**Failure modes caught:** listeners attached to `window` instead of `window.visualViewport` (never fire on a pan); asymmetric teardown leaking a listener per open/close cycle; a non-optional call crashing where the API is absent.

---

### Task 4: ShareHub — the same fix on the second consumer

**Commit:** `fix(admin): bound the ShareHub popover by the visual viewport`

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**RED.** Create `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` with the T-C1 / T-C2 / T-C3 trio against ShareHub's own popover, same stub shapes. Without this, ShareHub is changed but unproven.

**GREEN.** In `components/admin/showpage/ShareHub.tsx`: replace the rect literal at :247-253 with `visibleViewportRect(window)`, and add the `visualViewport` listener pair to the effect that registers `window` `resize` at :372, removed symmetrically at :404.

This also turns the Task 2 structural guard green for the second consumer.

**Explicitly NOT changed:** ShareHub has no `window` `scroll` listener today (spec §2). That asymmetry with HoverHelp is pre-existing and unrelated to zoom; spec §8 keeps it out of scope. Do not "fix" it here.

**Failure modes caught:** the class being fixed on the named instance only — precisely the round-1 F6 defect, now guarded by a test rather than by a promise.

---

### Task 5: Pure-core pins

**Commit:** `test(popover): pin narrow-bounds and below-floor placement`

**RED.** Extend `tests/lib/popover/position.test.ts` with two cases, deriving expectations from the input rects. `lib/popover/position.ts` is NOT modified (spec R6) — this task adds coverage only, so both cases pass on first run against today's core; their value is regression capture, and the commit body says so rather than pretending to a red.

- narrow bounds → `kind: "placed"` with both `maxWidth` and `maxHeight` set, not `hidden` (spec R3).
- bounds narrower than the R9 irreducible box → still `kind: "placed"`, pinning R9's ratified posture as defined behavior rather than accident.

**Failure mode caught:** a future change to the hidden gates at `lib/popover/position.ts:104-115` making every zoomed popover vanish — invisible to the unit layer without this pin.

---

### Task 6: Real-engine proof under zoom

**Commit:** `test(admin): prove popover geometry under real Chromium zoom`

**RED.** Extend `tests/e2e/hoverhelp-geometry.spec.ts` (already in the allow-list) with four cases driven through `context.newCDPSession(page)`. Round 1 F4 governs the design: containment is a weak oracle, so every case asserts a **uniquely derivable expected coordinate**, not a range.

- **T-VV1 (body host)** — zoom to a SATURATING scale, chosen so the pre-change placement provably lies outside the zoomed bounds. Compute the saturating scale from the live popover width and viewport width in-page rather than hardcoding it; at 1280px, scale 2.5 leaves ~512px, which a 288px popover fits inside — exactly the non-discriminating fixture F4 named. Pan first so both offsets are non-zero, then assert the body's exact `left`/`top` equal values recomputed in-page from the live `visualViewport` rect, live trigger rect, `GAP`, and `VIEWPORT_INSET`, within `TOL`.
- **T-VV2 (panel host)** — the same against the existing `PaneCase` fixture (`tests/e2e/_hoverHelpGeometryLiveEntry.tsx:112`), so both halves of the two-host coordinate claim are proven. Bounds are `panel ∩ visible slice`.
- **T-VV3 (pan tracking)** — assert FIRST that the gesture actually moved `visualViewport.offsetLeft/offsetTop` (guarding the silent no-op spec §3.3 documents), THEN that the popover's new exact coordinates match the recomputation.
- **T-VV4 (unzoomed restore)** — `setPageScaleFactor 1`; the popover returns to the pre-zoom rect within `TOL`.

Drive zoom with `Emulation.setPageScaleFactor` + `Input.synthesizeScrollGesture` (`gestureSourceType: "mouse"`). **Not** `synthesizePinchGesture`: spec §3.3 measured it as a silent no-op under this touchless project, which would produce a test that passes while proving nothing. Teardown resets page scale to 1 so a failure cannot leak zoom state into later tests in this serial file.

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
**Also create `tests/lib/popover/viewportMutants.test.ts`** — the durable replacement for round 1's rejected one-shot negative run: assert that a double-added offset and a layout-viewport origin each produce a rect DIFFERENT from `visibleViewportRect`'s for the probe fixture, so the oracle's discriminating power is pinned in CI rather than attested in a PR body.

**Failure modes caught:** the feature not working in a real engine despite green jsdom stubs; zoom emulation not engaging; a double-added offset that still lands inside bounds; unzoomed geometry regressing.

---

### Task 7: Wiring and bookkeeping

**Commit:** `chore(infra): gate the new placement surfaces and close BL-HOVERHELP-VISUAL-VIEWPORT`

<!-- spec-lint: ignore — file created BY this plan; not tracked until its task lands -->
1. Add to the `pull_request` path filter in `.github/workflows/hoverhelp-geometry-e2e.yml`: `lib/popover/viewport.ts` and `components/admin/showpage/ShareHub.tsx`. **Load-bearing** (spec §6): without them, a later edit to either would not fire the only gate that can catch a zoom-geometry regression.
2. `BACKLOG.md` — mark `BL-HOVERHELP-VISUAL-VIEWPORT` closed with the PR reference.
3. `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md` — add a superseded-by pointer on the §1.1 R8 row (line 30). Do NOT rewrite R8's text; it stays as the ratification that filed this successor.

**Verify:** `git diff` shows both paths added inside `pull_request.paths` (not under `workflow_dispatch`), and `grep -n "BL-HOVERHELP-VISUAL-VIEWPORT" BACKLOG.md` shows the closed status.

---

### Task 8: Full local gates

Run in order; paste real output into the close-out record:

- `pnpm typecheck`
- `pnpm exec eslint` over the changed files
- `pnpm format:check`
- `pnpm test` — the FULL suite; scoped runs miss the registry suites under `tests/styles` and `tests/help`
- `pnpm test:e2e:hoverhelp-geometry`

Check `$?` after vitest explicitly: it can exit 1 on an uncaught error while every test line reports pass.

---

### Task 9: Impeccable dual-gate (invariant 8)

Both changed component files are UI surfaces by path. `/impeccable critique` and `/impeccable audit` run on the diff with the canonical v3 setup gates (context load of PRODUCT.md + DESIGN.md, then the register reference read), **with subagents** — a standing owner requirement; an inline run is degraded and must be redone. P0/P1 findings fixed or deferred via `DEFERRED.md`; dispositions in the PR body.

Expected light: no new element, no class-string change, no copy, no token.

---

### Task 10: Adversarial review (cross-model), whole diff

Dispatch via `node scripts/codex-guard.mjs review --brief <file> --cwd <worktree> --out <fresh timestamped dir>`, backgrounded.

**The wrapper runs Codex read-only** — round 1 lost its written deliverable to a rejected `apply_patch` because the brief asked for a written review file. Briefs MUST request findings in the reviewer's final message, not in a file.

Brief contains: fresh-eyes posture; **"Your role: REVIEWER ONLY"**; the do-not-relitigate list from spec §1.1; the `VERDICT: <APPROVE|NEEDS-ATTENTION|BLOCKING>` final-line instruction; no nested cross-model reviews; enumerate-all-instances-per-round discipline.

A `no_verdict` result is an INFRASTRUCTURE fault, not "found nothing" — apply the skip/self-review ladder, do not blind-retry. Iterate to APPROVE, no round budget.

---

### Task 11: Ship

Push; open the PR with spec/plan links, the Task 6 mutant-guard evidence, and Task 9 dispositions; wait for **real CI green** (`hoverhelp-geometry-e2e` plus the standard suite); `gh pr merge --merge`; fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`; then `CronDelete` the Stage-0 nudge job.

Local green is necessary but not sufficient: this diff touches a workflow path filter and a Chromium-only e2e, both historically prone to dev-host/CI divergence.

---

## Self-review

- **Round-1 findings are all discharged in tasks, not just prose.** F1 → Task 1's WebKit exclusion + T-U3/T-C5. F2 → T-U8 and spec R7. F3 → Task 5's below-floor pin. F4 → Task 6's exact-coordinate oracle, panel-host case, and committed mutant guard. F5 → Task 3's both-events and post-close-inertness assertions. F6 → Task 4 plus the call-site-walking structural guard.
- **The structural guard walks call sites, not a file list.** The round-1 miss was a stale hardcoded view of who the consumers are; a guard with the same weakness would repeat it.
- **Every task names the failure mode its tests catch,** and Task 5's "no red available" case says so plainly instead of dressing regression capture as TDD.
- **Snippets are verified, not plausible.** The Task 1 implementation failed typecheck on first draft; what appears above is the fixed, run, and mutation-tested version.
- **Numeric sweep.** Constants are all pre-existing (`GAP` 6, `VIEWPORT_INSET` 8, `TOL` 0.5); the R9 floors are derived documentation and no implementation hardcodes them; the saturating zoom scale is computed in-page, not written down.
