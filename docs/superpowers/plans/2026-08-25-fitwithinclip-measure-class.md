# Plan — `useFitWithinClip` measure class: one attach, one walk

**Spec:** `docs/superpowers/specs/2026-08-25-fitwithinclip-measure-class.md` · **Rows:** `BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE`, `BL-FITWITHINCLIP-DOUBLE-ANCESTOR-WALK` · **Branch:** `feat/fitwithinclip-measure-class`

**Invariant 8 applies** — `components/admin/useFitWithinClip.ts` is a UI surface. Both gate halves run
at close-out (§6c) and the machine-checkable marker line is written into §12 **at that moment and not
before**, because the marker's grammar asserts the gate RAN: there is no pending form
(`tests/docs/_invariant8Closeout.ts`, `RAN_FORM` and `NA_FORM`). An earlier draft carried
`impeccable-gate: PENDING — …`, which is malformed, and plan review R1 was right to call the whole
close-out a P0.

## 1. Meta-test inventory

Declared before the tasks, per the writing-plans rule. This arc CREATES no meta-test. Four existing ones already reach the file; each is named with what it asserts and why the refactor does or does not move it.

| Meta-test | CREATES / EXTENDS / covered by default | Why |
| --- | --- | --- |
| `tests/components/_metaScrollNeutralMeasurement.test.ts` | covered by default, stays green | It walks `components/` and `lib/` from disk (`tests/components/_metaScrollNeutralMeasurement.test.ts:22`) and forbids a cap-clearing assignment — `.style.maxHeight = ""` — outside `lib/popover/naturalSize.ts`. The refactor keeps `withNaturalSize` as the only clear, and writes caps with `el.style.maxHeight = \`${fitted}px\`` and `removeProperty("max-height")`, neither of which matches `CLEAR_RE`. Verified by running it in Task 1's GREEN step, not assumed. |
| `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` | covered by default, stays green, **and constrains the diff** | Two claims, and the second is load-bearing. (a) Each registered consumer IMPORTS the hook from `@/components/admin/useFitWithinClip` and does not re-declare it locally; the refactor changes internals, not module path, export name, or `RefCallback<HTMLElement>` return type. (b) `components/admin/useFitWithinClip.ts` is itself registered as a consumer of `createRafCoalescer` with `requiresCancelAdoption: true` (`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:120-125`), whose comment says why: so that a future local `requestAnimationFrame` plus frame-id bookkeeping inside the hook fails HERE rather than quietly reintroducing the per-event forced reflow. **The coalescer moves into the ref callback and its `.cancel()` must move with it.** That is not a nice-to-have: mutant M8 turns this meta-test red as well as (g3) and (h5), which is stated in §5 so the mutant run is read correctly. |
| `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` | covered by default, stays green | Its `fit-within-clip` predicate is an IMPORT regex (`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:37`), deliberately not `/useFitWithinClip/`, which had matched a file carrying its own local copy. Unmoved by an internals change. |
| `tests/components/admin/showpage/popoverOverlayRegistry.ts` | covered by default, stays green | Prose rows recording which overlay is clip-safe by which route (`tests/components/admin/showpage/popoverOverlayRegistry.ts:49`, `tests/components/admin/showpage/popoverOverlayRegistry.ts:89`, `tests/components/admin/showpage/popoverOverlayRegistry.ts:110`, `tests/components/admin/showpage/popoverOverlayRegistry.ts:117`). No claim about the hook's internals. |
| a NEW registry-style meta-test | **NONE, with the reason** | The diff adds no Supabase call boundary (invariant 9), no mutation surface (invariant 10), no advisory-lock holder (invariant 2), no DB artifact, and no `admin_alerts` row. It removes a `useState` and a `useLayoutEffect` from one client hook. The class this arc closes is already derived-covered by the two greps in spec §4.1, which are re-run in Task 3 as a closeout sweep rather than described. |

## 1b. What this plan deliberately does NOT repair

Spec review R12 found a real defect and probed it BYTE-IDENTICAL on the current hook and on the §2
shape: the clip SUBSCRIPTION is resolved once per attach and never updated, so an ancestor that
starts clipping after the attach is never observed and its stale cap is silent
(`docs/superpowers/specs/2026-08-25-fitwithinclip-measure-class.md` §6, §7). It is filed as
`BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION` with a committed probe.

**It is out of scope for every task below, and a reviewer arguing it should be repaired here is
making a scope argument rather than reporting a defect** — the defect is not in dispute. The arc's
subject is the MEASURE path: how many times `apply()` runs and how many times the chain is walked.
This is the SUBSCRIPTION path, a different mechanism with no overlap in the diff. Repairing it would
mean re-resolving the observed set when the resolved clip differs, which changes runtime behaviour on
a path this diff never enters, needs its own cases and its own mutant, and would arrive unreviewed
inside a measure-count refactor.

**No task may quietly close it either.** If an implementation finds itself re-observing on a signal,
that is this deferred work leaking in; stop and file, do not ship it under a task that names
something else.

## 2. Advisory-lock topology

N/A. The diff touches no `pg_advisory*` call path. `rg -n 'pg_advisory' components/admin/useFitWithinClip.ts tests/components/admin/useFitWithinClip.test.tsx tests/e2e/popover-clip-fit.spec.ts` returns nothing.

## 3. Pre-draft code-verification pass

Run 2026-08-25 against the branch tree. Every name a task step below uses, verified present with the claimed shape.

```
$ rg -n 'const \[attachCount|const clip = findClippingAncestor|useLayoutEffect\(\(\)|const positioned = node.offsetParent|typeof ResizeObserver|export function useFitWithinClip' components/admin/useFitWithinClip.ts
69:export function useFitWithinClip(reapplyKey?: unknown): RefCallback<HTMLElement> {
77:  const [attachCount, setAttachCount] = useState(0);
91:      const clip = findClippingAncestor(el);
137:  useLayoutEffect(() => {
161:    const clip = findClippingAncestor(node);
164:    const positioned = node.offsetParent;
166:      typeof ResizeObserver === "function" ? new ResizeObserver(coalescer.schedule) : null;

$ rg -n 'export function withNaturalSize|export function createRafCoalescer' lib/popover/naturalSize.ts lib/popover/rafCoalescer.ts
lib/popover/naturalSize.ts:31:export function withNaturalSize<T>(
lib/popover/rafCoalescer.ts:16:export function createRafCoalescer(run: () => void): RafCoalescer {

$ rg -n 'export function premise|export function premiseHolds' tests/_shared/premise.ts
26:export function premise(description: string, actual: number, mustExceed: number): void {
36:export function premiseHolds(description: string, condition: boolean): void {

$ rg -n '^const (MENU|PANEL|SCROLLER|GUTTER|CSS_CAP|TOGGLE_BANNER|TOGGLE_CLIP)' tests/e2e/popover-clip-fit.spec.ts
117:const MENU = '[data-testid="published-show-review-attention-menu"]';
118:const PANEL = "[data-review-modal-panel]";
122:const TOGGLE_BANNER = '[data-testid="published-toggle-popover"]';
123:const TOGGLE_CLIP = '[data-testid="toggle-clip-panel"]';
125:const SCROLLER = 'div[role="group"][aria-label="Attention items"]';
128:const GUTTER = 8;
130:const CSS_CAP = 384;

$ rg -n 'async function openMenu' -A2 tests/e2e/popover-clip-fit.spec.ts
149:async function openMenu(page: Page, a: number, n: number, s: number) {
150:  await page.goto(baseUrl);
151:  await page.evaluate(() => document.fonts.ready);
```

**Two facts this pass established that changed the plan.**

1. `tests/e2e/popover-clip-fit.spec.ts` builds exactly TWO live entries — `tests/e2e/_pillFocusLiveEntry.tsx` and `tests/e2e/_publishedToggleClipLiveEntry.tsx` (`tests/e2e/popover-clip-fit.spec.ts:44-46`). There is no `ReSyncButton` surface in it; `rg -ln 'ReSyncButton' tests/e2e/ | rg popover-clip-fit` returns nothing. The real-browser pin therefore lands on the AttentionMenu scroller and the PublishedToggle banner, which are the two surfaces the file can actually drive. Building a third live entry for `ReSyncButton` would be a new harness, not a pin, and its three overlays consume the identical hook.

2. `openMenu` NAVIGATES (`tests/e2e/popover-clip-fit.spec.ts:150`) and the menu AUTO-OPENS on mount when actionable items exist (`tests/e2e/popover-clip-fit.spec.ts:157` clicks the pill only when the menu is absent). A per-frame sampler installed after `openMenu` returns would therefore miss the frames it exists to observe. Task 4 installs it with `page.addInitScript` instead, which runs before any page script on the navigation `openMenu` performs.

## 3b. The ordering shift, bounded

The measure moves from the owner's layout effect to the ref attach, which is EARLIER in the same
commit. What it moves earlier past is: any layout effect declared in the hook's owner, and any
layout effect in a component sitting between the owner and the ref-bearing node. Both are empty
here, and both were checked rather than assumed.

```
$ rg -n 'useLayoutEffect' components/admin/ReSyncButton.tsx components/admin/PublishedToggle.tsx     components/admin/showpage/AttentionMenu.tsx
(no output)

$ rg -n 'ref=\{fit' components/admin/showpage/AttentionMenu.tsx components/admin/PublishedToggle.tsx     components/admin/ReSyncButton.tsx
components/admin/showpage/AttentionMenu.tsx:173:        ref={fitRef}
components/admin/PublishedToggle.tsx:201:            ref={fitRef}
components/admin/ReSyncButton.tsx:235:          ref={fitErrorRef}
components/admin/ReSyncButton.tsx:261:          ref={fitShrinkRef}
components/admin/ReSyncButton.tsx:317:          ref={fitSuccessRef}
```

All five refs sit on a plain `<div>` in the hook owner's OWN JSX — read at each site, not inferred
from the grep. There is no intervening component boundary, so there is no intervening layout effect
either, and the set of things the measure now precedes is empty. If a future consumer adds a layout
effect that mutates geometry in the same commit, this is the assumption that breaks; §7 of the spec
carries it as a documented limit with that re-file trigger.

## 4. No test file is created, so no CI wiring changes — probed, and with the honest scope

Both suites already exist and are already wired, so this arc adds no `testMatch` entry and no
workflow path filter. Verified rather than assumed, because a `red=` naming a command that collects
nothing expresses no verdict in either direction:

```
$ node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts     tests/e2e/popover-clip-fit.spec.ts --list | tail -1
Total: 18 tests in 1 file

$ rg -n 'standalone.config' .github/workflows/standalone-e2e.yml
3:# Runs the WHOLE of tests/e2e/standalone.config.ts on every PR.
71:        run: pnpm exec playwright test --config tests/e2e/standalone.config.ts

$ pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts
Tests  97 passed (97)
```

`tests/components/admin/useFitWithinClip.test.tsx` is an ordinary vitest file under `tests/` and
runs in `unit-suite`, which IS one of the twelve required contexts.

**The e2e pin's scope, stated plainly rather than implied.** `standalone-e2e.yml` runs the whole
standalone config on every PR, so Task 4's assertion RUNS AND REPORTS on every PR — but that job is
not among the twelve required contexts, so it does not block a merge. The e2e coverage meta-test
says exactly this about the whole class (`tests/ci/_metaE2eWorkflowCoverage.test.ts:11-19`): covered
means it runs and reports, not that GitHub will block on it. The procedural enforcement is the ship
pipeline's all-checks-green gate. Task 5 re-runs that meta-test rather than asserting its result.

## 5. Mutants, declared up front

The convergence set for the diff review. Each names the case that must go red, **the task that RUNS
it**, and — where plan review R1 disproved a pairing — the fact that no case kills it.

Plan review R1 corrected two claims about this table. It is **not** true that every row is a one-line
edit: M1 restores a `useState` plus an effect, M12 adds a hook and a bump, M15 edits the e2e sampler
rather than the hook, and M21 is a conditional change with no single-line spelling. And six rows had
no owning task, so "each is RUN in the task that owns it" was aspiration. The **Run in** column below
is the fix: every row names its task, and a row without one is a plan defect.

**A row marked ACCEPTED GAP is RUN and recorded as SURVIVING.** That is its expected result, not a failure, and it is the one exception to "every assigned mutant turns its named case red". M3 is the only such row. Round 3 charged the plan for assigning M3 to a task whose generic instruction demanded a red it had already proved impossible.

| # | Mutant | Must turn red | Run in |
| --- | --- | --- | --- |
| M1 | Restore `useLayoutEffect` + `attachCount` as the effect trigger | (g) mount apply count | Task 1 |
| M2 | Restore the effect body's second `findClippingAncestor(node)` | (h) mount walk count | Task 2 |
| M3 | Drop `nodeRef.current = null` from the ref cleanup | **ACCEPTED GAP — no case kills it, and plan review R1 proved it.** (h3) fires a resize AFTER the teardown has removed that listener and cancelled pending frames, so nothing calls `apply()` either way. The consequence is RETENTION, not a wrong measure: `nodeRef` holds a detached node until the next attach overwrites it. Nothing observable to a test distinguishes the two, so this is recorded as a gap with its reason rather than paired with a case that does not kill it | Task 1 |
| M4 | Drop the `if (node === null) return` guard | (h2) null-node arm | Task 1 |
| M5 | Drop `reapplyKey` from the ref callback's dependency list | (c) reapplyKey re-measure | Task 1 |
| M6 | Defer the mount measure into `coalescer.schedule()` instead of calling `apply()` | (g2) no-frame pin AND the Task 4 first-paint sampler | Task 4 |
| M7 | Observe `findClippingAncestor(node)`'s result but pass `null` to `observer.observe` | (d) clip ancestor observed | Task 2 |
| M8 | Drop `coalescer.cancel()` from the teardown | (g3) unmount-with-frame-pending, (h5) reapplyKey-change-with-frame-pending, AND `_metaSharedHelperAdoption` (`requiresCancelAdoption: true` on this file's own registry row) | Task 3 |
| M9 | Move `positioned.removeEventListener` AFTER `coalescer.cancel()` in the teardown | (h7) transitionend mid-teardown | Task 3 |
| M10 | Make the ref callback's dependency list unstable — add an inline `{}` dep | (h9) unchanged-re-render costs nothing | Task 3 |
| M11 | `new ResizeObserver(() => {})` — observer constructed, callback dead | (h12) the observer callback re-measures, on both observed targets | Task 1 |
| M12 | Reintroduce ANY state update on the attach path — `const [n, setN] = useState(0)` bumped in the ref callback | (h14) one owner render per appearance | Task 3 |
| M13 | Return `undefined` from the ref callback instead of the teardown | **(h21)**, which asserts `disconnected=1` after unmount — with no cleanup returned, React has nothing to call and `observer.disconnect()` never runs. Plan review R1 disproved the earlier claim against (h13): Strict Mode yields two renders and two applies with or without a returned cleanup, so only a CLEANUP-counting case can see this. `_metaSharedHelperAdoption` also does not catch it — it checks `.cancel()` EXISTS, not that the closure is returned | Task 3 |
| M14 | Improve ONE lifecycle at another's expense — e.g. skip the mount `apply()` when `reapplyKey` is truthy, which flatters `PublishedToggle` and breaks `AttentionMenu` | (h16) and (h17), which must disagree | Task 3 |
| M15 | Arm the e2e sampler AFTER the overlay appears instead of via `addInitScript` | Task 4's absent-row-before-first-present-row premise | Task 4 |
| M16 | Call `apply()` at hook body level, so it runs on every render | **(h9)**, whose no-op re-render must cost zero applies: with a node attached, a body-level `apply()` measures on that re-render. Plan review R1 disproved the earlier claim against (h18) — on the never-attached path `apply()` returns on the null node, so zero applies, zero walks and no throw all still pass | Task 3 |
| M17 | Suppress the re-attach on a `reapplyKey` change when the node is unchanged — the "optimisation" that would make a single cumulative (h17) assertion pass | (h17)'s settled snapshot, and (c) | Task 3 |
| M18 | Write the cap only when one already exists — `if (el.style.maxHeight) el.style.maxHeight = …` | (h19) `N to F`. Kills NOTHING in today's suite | Task 3 |
| M19 | Skip `removeProperty("max-height")` on the nothing-clips branch, leaving the stale cap | (h20) `F to N`, and family A. Kills NOTHING on the DIRECT edge today | Task 3 |
| M20 | Skip `observer?.disconnect()` when no clip was found — `if (clip) observer?.disconnect()` | (h21) `N to D`. Leaves a live observer on a live ancestor after the node is gone; kills NOTHING today | Task 3 |
| M21 | Detach-and-reattach even when nothing was attached — treat a `reapplyKey` change as unconditionally `X to D to Y` | (h16), whose shipped shape is a key change WITH the first attach: one attach, no detach | Task 3 |

M6 is the one that matters most and the one the unit suite alone under-covers: (g2) proves no frame was SCHEDULED in jsdom, which is a proxy. Task 4's sampler proves the overlay was never PAINTED uncapped in a real engine, which is the property.

**M12 is the mutant that guards the arc's actual win**, which spec review R3 relocated. The counter's cost was never the doubled measure the ledger row names — on the live conditional-host shape the hook measures ONCE today. Its cost is that `setAttachCount` fires on every attach AND detach, and each is a state update that re-renders the owner's whole subtree: measured at 2 renders per appearance in production and 4 under Strict Mode, against 1 and 2 after. M12 reintroduces any state update on that path and must turn (h14) red. Without it, an implementation could delete `attachCount` and reintroduce an equivalent under another name with every count assertion in the suite still green.

M11 is the one spec review R2 finding 1 forced into existence, and it is the most important row in this table, because it is the only mutant here that **kills nothing today**. Measured on the unmodified tree: plant `new ResizeObserver(() => {})` and all four suites that touch the hook report `Tests 86 passed (86)`. The observer wiring is precisely what Task 1 relocates from the layout effect into the ref callback, so this arc would be moving a mechanism no test can see. (h12) closes it before Task 1 moves anything.

M10 is the one spec review R1 finding 1 forced into existence, and it is worth its own sentence. Every other mutant here is caught by an assertion about a single mount. M10 is not: an identity-churning ref callback re-attaches and re-measures on EVERY render, and it satisfies (g), (h), (g2), (g3), (c) and both family pins, because none of them re-renders without changing something. Only (h9) — a re-render that changes nothing, asserting zero applies and zero walks — can see it. That is the cell of §0.1's acceptance table that had no pin before the round.

## 5b. Citation lifetime — this plan's own execution invalidates several of its citations

Stated up front because it is a temporal dependency that costs an arc a hard failure with no edit to
the plan at all, and because `RED_TARGET_INVALID` cannot catch it: that check proves a tracked path
has an IN-RANGE line, never what is AT the line.

**Plan review R1 found the earlier version of this section both wrong and incomplete.** Wrong,
because it told Task 2 to "re-point its `red-target` in its own commit" — but Task 2's GREEN step
DELETES the second `findClippingAncestor` call its `red-target` names, so **no line in the final tree
can name that defect at all.** Incomplete, because four later-task citations are moved or deleted by
Tasks 1 and 2 and it named none of them.

The citations this plan's own execution moves or deletes, all six:

| Citation | Named in | Invalidated by |
| --- | --- | --- |
| `components/admin/useFitWithinClip.ts:77`, **Task 1's `red-target`** | Task 1's marker | Task 1 itself deletes the `attachCount` declaration. Expected: a marker names the defect it removes, and the RED is observed BEFORE the removal |
| `components/admin/useFitWithinClip.ts:203`, **Task 2's `red-target`** | Task 2's marker | Task 1 moves the ref callback's opening line. The marker deliberately names the SURVIVING surface rather than `components/admin/useFitWithinClip.ts:161`, the line Task 1 deletes — round 1 charged the earlier version for citing the deleted line |
| the family-pin precedent, `tests/components/admin/useFitWithinClip.test.tsx:362-366` | Tasks 3 and 4 | Task 1 and Task 3 both add cases above it |
| observer wiring, `components/admin/useFitWithinClip.ts:167-170` | Task 3 | Task 1 moves it into the ref callback |
| the no-clip branch, `components/admin/useFitWithinClip.ts:91-96` | Task 3 | Task 2 changes `apply()`'s return shape |
| the synchronous measure, `components/admin/useFitWithinClip.ts:144` | Task 4 | Task 1 deletes the effect around it |

Round 3 charged the earlier version of this table for still calling `components/admin/useFitWithinClip.ts:161` Task 2's target after the marker had moved to `components/admin/useFitWithinClip.ts:203`, and for omitting Task 1's `components/admin/useFitWithinClip.ts:77` entirely. **So the rule is not "re-point at the end" — it is that a citation naming a line the plan DELETES
must not be a `red-target` at all.** Task 2's marker therefore names the surviving surface (the ref
callback's wiring, where the second walk lives after Task 1) with a `why=` describing the defect
rather than the deleted line. Every row above is re-verified at close-out **by READING each
cited line and matching it to the symbol its sentence names** — confirming a citation RESOLVES
establishes nothing, which is the documented trap.

## 6. Task list

<!-- tasks: depth=2 red-contract -->

## Task 1 — the attach counter goes away; the ref callback owns the wiring

<!-- task: red=`pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` red-state=authored red-target=`components/admin/useFitWithinClip.ts:77` why=`attachCount is an effect dependency, so the layout effect runs a second time and the mount apply count is 2; the assertion this task rewrites to 1 fails on that line, not on anything the test controls` ac=AC-1 -->

**What is red and why.** Case (g) at `tests/components/admin/useFitWithinClip.test.tsx:281` currently asserts `toBe(2)`. This task's RED step changes it to `toBe(1)` FIRST, against the unmodified hook, and observes it fail at 2 — the failure comes from `components/admin/useFitWithinClip.ts:77`'s state counter re-running the layout effect, not from anything the test controls.

RED:

1. `tests/components/admin/useFitWithinClip.test.tsx:281` → `expect(afterMount, "mount measure count changed").toBe(1)`.
2. Rewrite the comment at `tests/components/admin/useFitWithinClip.test.tsx:276-279`. It currently cites `BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE` as live debt. It must stop citing a row this branch closes, and say instead that one attach is one measure, pinned here so a regression to two is visible rather than absorbed into the coalescing delta below.
3. Add case (h3): after `view.unmount()`, fire a `window` resize and flush frames; assert `applyCount` did not move. **No mutant kills it** — §5 records M3 as an ACCEPTED GAP for exactly this reason: the teardown has already removed that listener, so nothing calls `apply()` either way. (h3) is a regression pin against a future teardown that stops cancelling, not a mutant-backed case.
4. Add case (h2): call the ref callback with `null` directly and assert it neither throws nor measures. Its red is mutant M4.
5. Add case (h14): the LIVE conditional-host harness — the same tree with the overlay behind a flag. That is `ReSyncButton`'s shape specifically — **not all five call sites**, which spec §0.1 shows take three distinct lifecycles; (h15)-(h17) in Task 3 cover them one apiece. Assert per appearance: one `apply()`, one ancestor walk, and — the load-bearing one — **one owner render pass**, where the counter takes two. The existing always-present harness stays for the cases built on it; this one exists because spec §0.1's first two drafts drew the wrong conclusion from the always-present shape, which is `AttentionMenuPanel`'s and not nobody's. Its red is mutant M12.
6. Add case (h13): the same conditional-host harness inside `<StrictMode>`, asserting the replay's counts EXACTLY — two applies per appearance and two owner renders, against the current code's one and four. It pins the development cost in the direction it actually moves, so a later change that makes the replay worse is visible rather than absorbed. It has **no mutant of its own**: plan review R1 proved Strict Mode yields two renders and two applies with or without a returned cleanup, so M13 is repointed to (h21) in §5, which counts disconnects. (h13) pins the replay's COUNTS, which is its own job.
7. Add case (h12) **before touching the wiring**, per spec §5.1: replace case (d)'s throwaway `ResizeObserver` stub with one that CAPTURES the constructor callback, then invoke it once with the clip ancestor resized and once with the positioned ancestor resized, asserting the cap re-derives from the new geometry each time. This is the only re-measure signal with no behavioural case, and Task 1 is the task that moves it — covering it afterwards would mean the move happened unobserved. Its red is mutant M11, which on the unmodified tree kills nothing at all.
8. Observe red. Paste every failure line into the commit.

The (h12) body, written out so it can be typechecked and reviewed rather than described.

**Deliberately NOT enrolled for `--exec-red` splicing.** An earlier draft marked both embedded blocks
with `<!-- fixture: why=… -->`. That turns `tests/specLint/fixtureAcceptance.test.ts` red: its
"no shipped code inspects an unenrolled block" case proves the arm is silent on UNENROLLED blocks by
requiring the tracked corpus to hold zero ENROLLED ones, so the first plan to enrol anything breaks
its premise. The enrolment bought a fixture-satisfiability check worth less than a corpus-wide guard,
so the blocks ship unmarked and are typechecked by splicing them into a copy of the real suite
instead (§3's pre-draft pass).

```tsx
test("(h12) the ResizeObserver callback re-measures against the new geometry", () => {
  const observed: Element[] = [];
  const constructed: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: ResizeObserverCallback) {
        constructed.push(cb);
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {}
    },
  );

  const { outer, inner, fitted } = withOffsetParent(() => mount());
  expect(fitted.style.maxHeight).toBe(expectedPx());

  // PREMISE (this case's own inputs): the hook must have handed the constructor
  // a callback AND observed both ancestors. Without the first, every assertion
  // below is unreachable; without the second, "on both observed targets" is a
  // claim about a subscription that was never made.
  // The COUNT differs by tree and must not be asserted here. Plan review R1
  // proved it: this case is authored in Task 1 against the PRE-refactor hook,
  // where the attach counter runs the effect twice and constructs TWO observers
  // ({"constructed":2,"observed":["outer","inner","outer","inner"]}); after Task 1
  // it is one. A `=== 1` premise aborts before the assertion on the very tree the
  // case exists to pin, which is the premise-never-reached trap.
  premiseHolds(
    "the hook constructed at least one observer and observed both ancestors",
    constructed.length >= 1 && observed.includes(outer) && observed.includes(inner),
  );
  // The LAST one is the live one: on the pre-refactor tree the first is torn down
  // by the effect re-run, so firing the first would exercise a dead observer.
  const fire = constructed[constructed.length - 1];
  // Narrowing, not decoration: noUncheckedIndexedAccess types this as possibly
  // undefined and premiseHolds is a call, so it cannot narrow on its own.
  if (fire === undefined) throw new Error("unreachable: premise asserted length >= 1");

  for (const target of [outer, inner]) {
    geometry = { ...geometry, clipBottom: geometry.clipBottom - 40 };
    fire([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    flushFrames();
    expect(
      fitted.style.maxHeight,
      `a resize reported for ${String(target.getAttribute("data-testid"))} did not re-measure`,
    ).toBe(expectedPx());
  }
});
```

**What this case does and does not prove, stated so the next round does not have to find it.** It
proves the callback the hook hands the `ResizeObserver` constructor actually reaches `apply()`, and
that the re-measure derives from the NEW geometry rather than replaying the old cap. It does NOT
independently prove per-target behaviour: `coalescer.schedule` ignores the entries, so both loop
iterations exercise the same path. Which targets are observed is case (d)'s job, and the premise
above is what ties the two together — it fails if either ancestor stopped being observed, so (h12)
cannot report success against a subscription that no longer exists. Splitting that honestly is the
point; claiming (h12) alone covers both targets would be the over-claim round 2 charged twice.

GREEN — `components/admin/useFitWithinClip.ts`:

- Delete `useState`/`attachCount` (`components/admin/useFitWithinClip.ts:77`, `components/admin/useFitWithinClip.ts:201`, `components/admin/useFitWithinClip.ts:207`) and the whole `useLayoutEffect` (`components/admin/useFitWithinClip.ts:137-201`).
- The returned `useCallback` takes deps `[apply, reapplyKey]`, returns early on a `null` node, writes `nodeRef.current`, calls `apply()`, wires coalescer + `ResizeObserver` + `transitionend` + `window` resize exactly as the effect did, and RETURNS the teardown. The teardown does what the effect's cleanup did plus `nodeRef.current = null`, because React 19 no longer calls `ref(null)` (spec §2.1 fact 1).
- `reapplyKey` is a dependency the body does not read, so it carries `// eslint-disable-next-line react-hooks/exhaustive-deps -- <reason>` naming spec §2.1 fact 4. Do NOT drop it: mutant M5.
- Rewrite the hook's docblock at `components/admin/useFitWithinClip.ts:70-75`, which describes the counter. Two things it says stop being true and must not be carried across: the node/state split, which goes away entirely, and its stated rationale that "the React compiler refuses mutation of anything reached through state". The compiler is not wired in this repo — `rg -n 'react-compiler|reactCompiler|babel-plugin-react-compiler' eslint.config.* next.config.ts package.json` returns nothing — so repeating that sentence would carry an inactive constraint forward as if it still bound the design. The replacement says what is now true: the ref callback owns the wiring because React 19 gives it a cleanup, and the node lives in a ref because `apply()` writes to its style.

Verify, each as its own command: the suite; `pnpm vitest run tests/components/_metaScrollNeutralMeasurement.test.ts`; `pnpm exec eslint components/admin/useFitWithinClip.ts` (expect ZERO warnings — the disable comment is what makes that true); `pnpm typecheck`.

**Commit** (invariant 6, red observed then green, one commit for the task): `refactor(admin): the ref callback owns the wiring, and the attach counter goes away`.

Then RUN **every mutant whose `Run in` column names Task 1**, read off §5's table rather than
re-listed here — plan review R1 and R2 both charged this task for carrying a stale copy of those
pairings after the table was corrected. For each: confirm the case §5 names goes red, revert, paste
the result. **M11 is the one to read twice**: it must go from killing NOTHING to killing (h12).

## Task 2 — `apply()` returns the clip it already resolved

<!-- task: red=`pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` red-state=authored red-target=`components/admin/useFitWithinClip.ts:203` why=`the returned ref callback is where the second ancestor walk lives once Task 1 has moved it, so the new ancestor-getComputedStyle counter reads two walks where the assertion derives one; this cites the SURVIVING surface, not the line Task 1 deletes (5b)` ac=AC-2 -->

**What is red and why.** After Task 1 the mount still walks twice: once inside `apply()` and once in the wiring, at what is `components/admin/useFitWithinClip.ts:161` on the pre-Task-1 tree. Case (h) is authored in this task and fails on that second walk. It cannot pass by accident: it counts `getComputedStyle` calls on ANCESTORS only, and its expected value is derived, not typed.

RED — add case (h) to `tests/components/admin/useFitWithinClip.test.tsx`:

```tsx
test("(h) one attach walks the ancestor chain exactly once", () => {
  // The walk visits every ancestor up to and INCLUDING the first non-visible
  // overflow. In this harness that is `inner` then `outer`, so one walk is
  // one walk == expectedWalk(fitted).length calls, derived at runtime.
  // DERIVED from the rendered fixture, not typed: walk the real ancestor chain
  // the way the hook does, up to and INCLUDING the first non-visible overflow,
  // and take that as the expectation. Plan review R1 caught the earlier version
  // hardcoding ["inner","outer"] and comparing against its own literal, which
  // drifts silently the moment the fixture's nesting changes.
  const expectedWalk = (fitted: HTMLElement): string[] => {
    const out: string[] = [];
    for (let el = fitted.parentElement; el !== null; el = el.parentElement) {
      const id = el.dataset["testid"];
      if (id === undefined) break;
      out.push(id);
      if (el.dataset["clips"] === "true") break;
    }
    return out;
  };
  const seen: string[] = [];
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const data = (el as HTMLElement).dataset;
    const id = data?.["testid"] ?? "";
    if (id !== "fitted") seen.push(id);
    const clips = data?.["clips"] === "true";
    return {
      overflowX: clips ? "clip" : "visible",
      overflowY: clips ? "clip" : "visible",
      maxHeight: id === "fitted" ? `${DECLARED_CAP}px` : "none",
    } as unknown as CSSStyleDeclaration;
  });

  const { fitted } = mount();
  const expected = expectedWalk(fitted);

  // PREMISE (this case's own inputs): the chain must be at least two deep and
  // must clip, or one walk and two walks are the same number and the assertion
  // below cannot discriminate.
  premiseHolds(
    `the fixture walks ${expected.length} ancestors and clips at the last of them`,
    expected.length >= 2 && fitted.closest('[data-clips="true"]') !== null,
  );
  expect(seen, "one attach must walk the ancestor chain once").toEqual(expected);
});
```

GREEN — `apply()` returns `HTMLElement | null`. Its `withNaturalSize` callback returns `{ clip, fit }` rather than a bare fit or `null`, so the resolved ancestor rides out with the measurement instead of being re-derived; both existing exit paths return `measured.clip`. The ref callback uses that value for `observer.observe(clip)` and stops calling `findClippingAncestor` itself. `apply()` still walks on EVERY invocation — spec §1.1 — and only the wiring's own second walk is removed.

The `null` return is two-valued (no node, or no clip). The ref callback has just written a non-null node, so at that call site it means "nothing clips". That gets a comment at the call site; it is the one narrowing in the diff that is not locally obvious.

Also in this task, case (h8): count applies AND ancestor walks across a `reapplyKey` change, asserting one of each. Its APPLY half is green before and after — a key change always measured once — but its WALK half is red on the pre-Task-2 tree, which reapplies with two walks (§0.1's `PROBE-BASE-REAPPLY ancestorGCS=4`, two per walk). It belongs here because that is where its red is.

**Commit** (invariant 6): `refactor(admin): apply() returns the clip it resolved, so the wiring stops re-walking`.

Verify: the suite; `pnpm typecheck`; `pnpm exec eslint components/admin/useFitWithinClip.ts`. Then RUN mutants M2 and M7, confirm (h) and (d) go red, revert, paste.

<!-- tasks: end -->

### Why Tasks 3-5 are NOT in the region above

Tasks 1 and 2 are ordinary red-then-green units: a defective line exists on the live tree and a
named assertion fails on it. Tasks 3 and 4 are PINS — every case in them passes on a correct
implementation, which is the point — and Task 5 is a gate run. A declared `red=` that passes the
moment it is authored is rejected statically, and by the same rule so is a `red-state=live` whose
command exits 0. Manufacturing a contract for a pin would be the defect, not the compliance, so the
region closes here and Tasks 3-5 declare their red the way this repo already declares a pin's red:
a NAMED MUTANT from §5, RUN, with its output pasted into the commit. The precedent is in the file
being edited — `tests/components/admin/useFitWithinClip.test.tsx:362-366` says of the family A/B
cases that they are "green on the pre-migration tree by design; their red condition is a defective
migration (mutants A/B in the plan)".

## Task 3 — the transition and lifecycle cases

**No inventory, no mutant pairing and no sweep instrument is restated here.** Rounds 1, 2 and 3 each
charged this plan for a stale copy in a task body — the copy always outlived the correction. So every
list this task needs lives in exactly one place and is named, not reproduced:

| What | Single source |
| --- | --- |
| Which transitions exist, what causes each, and which case pins it | spec §3.1 |
| The per-consumer counts every case must assert | spec §0.1 and §0.1a |
| What each case is for | spec §5.1's table |
| Which mutants this task runs, and what each must turn red | §5's table, rows whose **Run in** says Task 3 |
| How the class sweep is performed | spec §4.1 — run the committed probe, `node docs/superpowers/specs/2026-08-25-fitwithinclip-ref-callable-probe.mjs`. **Not a grep.** The spelling census it replaced missed the live `ref={fitRef}` consumers |

Author the cases spec §5.1 lists whose ids are not already in the suite. Run every Task 3 mutant,
confirm the case §5 names goes red, revert, paste the result. **A mutant whose §5 row says ACCEPTED
GAP is run and recorded as surviving — that is its expected result, not a failure**, and it is the
one exception to "every assigned mutant turns a case red".

Then re-run the §4.1 probe against the post-refactor tree and paste its output; the conclusion must
still be that shape 1 is present exactly once.

**Commit** (invariant 6): `test(admin): transition and lifecycle cases for the measure class`.

## Task 4 — the real-browser pin: never painted uncapped

jsdom computes no layout, so spec §3's dimensional invariant is settled only here. This is a PIN:
green on a correct tree by design, its red a named mutant.

**e2e readiness, per `docs/agents/writing-plans.md`:**

- **Server boot** — none is added. `tests/e2e/popover-clip-fit.spec.ts` bundles its two live entries
  out-of-process, compiles Tailwind, and serves them from a tmp dir via `createServer`
  (`tests/e2e/popover-clip-fit.spec.ts:92`) on an ephemeral port (`tests/e2e/popover-clip-fit.spec.ts:107`).
  This task adds a case to that harness and boots nothing of its own.
- **Readiness gate** — `window.__hydrated`, awaited by the existing helpers
  (`tests/e2e/popover-clip-fit.spec.ts:152-154` for the menu, `tests/e2e/popover-clip-fit.spec.ts:230-232`
  for the toggle). Never `networkidle`.
- **Detach safety** — the sampler re-reads both nodes inside its own frame callback and records
  `{ present: false }` when either is missing, so it cannot auto-wait on an unmounted node.

The case itself, its three assertions and their order are spec §5.2. Run the Task 4 mutants from §5
— both of them — confirm each turns the named assertion red, revert, paste.

Run under `pnpm heavy`.

**Commit** (invariant 6): `test(e2e): pin the first painted frame against the clip edge`.

## Task 5 — full gates

Each as its own command, never chained: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`,
`pnpm format:check`, `pnpm heavy pnpm test:e2e`, and
`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts`. Vitest strips types, so a green suite
proves nothing about `pnpm typecheck`.

**Not a red-then-green unit.** Its failure condition is any regression Tasks 1-4 introduced elsewhere,
which cannot be declared in advance. No commit of its own unless a gate forces a fix, in which case
that fix commits under its own conventional-commit message.

## 6b. Review-round accounting across the re-base

The branch merged `origin/main` after the spec stage closed, so the merge base moved from
`449f29faba03` to `e381de76e` and the round corpus opens a NEW file. The spec stage's thirteen
dispatches live in `docs/review-rounds/feat/fitwithinclip-measure-class/449f29faba03.jsonl` with its
filing beside it; plan and diff rounds will land in the new base's file starting at round 1.

That restart is by design and is NOT a reset of the obligation. Per the arc-sum rule a stage reaches
the threshold either by one base's rounds or by the arc's rounds summed across every base of this
branch directory, counting distinct `(baseSha, round)` pairs. So: count across BOTH files, file at
the LATEST base holding rows for the stage, have its heading declare THAT file's count, and have its
`**Examined:**` line name the cross-base total.

## 6c. Close-out — invariant 8's dual gate

Plan review R1 finding 1 was a P0 and it was right: the header promised critique, audit and
dispositions in §12, Task 5 ran neither gate, and there was no §12. Executed as written the UI diff
would have ended at `impeccable-gate: PENDING`, which is the invariant-8 violation the marker exists
to make machine-checkable.

`components/admin/useFitWithinClip.ts` is a UI surface under the invariant's own definition (any file
under `components/`), so BOTH halves run on the affected diff, with the canonical v3 setup gates:
the impeccable v3 context load of PRODUCT.md and DESIGN.md (the skill's own setup step, not a repo file), then the register reference read.

**Task 6 — impeccable dual gate.** After Task 5's gates are green and before the whole-diff review:

1. `/impeccable critique` on the diff. Record every finding with its tier.
2. `/impeccable audit` on the same diff. Record every finding with its tier.
3. Both halves EXTERNALLY attested — never self-attested by the session that wrote the code.
4. Every P0 and P1 either fixed in this branch or explicitly deferred with a `DEFERRED.md` entry.
5. Findings and dispositions land in §12 below.
6. WRITE the marker line into §12 in its RAN form with the real counts. There is nothing to "flip": no marker exists yet, deliberately, because the grammar has no pending form.

Expect the surface to be quiet: the diff removes a `useState` and a `useLayoutEffect` from one hook
and adds test cases. It renders nothing, changes no class string, no token, no copy and no DOM shape.
The pre-code mechanical checklist (em-dash ban, apostrophes, 44px tap targets, canonical type and
token classes) has no applicable site in this diff — which is a prediction the gate falsifies, not a
reason to skip it.

## 12. Impeccable findings and dispositions

Filled at close-out by Task 6. Until then this section reads exactly one line, and that line is the
gate:

> **NOT RUN.** No marker line appears above, deliberately: the grammar has only a RAN form and an
> N/A form, so any line written here before the gate runs would be either malformed or a lie.
>
> **`tests/docs/_metaInvariant8Closeout.test.ts` is therefore RED on this branch until Task 6 runs**,
> reporting that this unit declares the dual gate and carries no valid marker. That is the guard
> working, not an accident, and it is recorded here so nobody reads the red as flake and silences it.
> It goes green when Task 6 writes the real line with real counts.

## 7. Acceptance criteria

| AC | Criterion |
| --- | --- |
| AC-0 | The arc's headline holds on the LIVE conditional-host shape, not only on the unit harness: owner render passes per overlay appearance go 2 to 1 in production and 4 to 2 under Strict Mode, pinned by (h14) and (h13), with mutant M12 as the guard. |
| AC-0b | The development-only cost is pinned rather than assumed: `apply()` goes 1 to 2 per appearance under Strict Mode's replay, asserted exactly by (h13). Production is unchanged at 1. |
| AC-1a | All FOUR of the hook's re-measure signals have a behavioural case: `window` resize (f), `transitionend` (e)/(e2)/(g4), `reapplyKey` (c), and the `ResizeObserver` callback (h12) — the last of which had none before this arc and is the wiring the arc relocates. Mutant M11 turns (h12) red where today it turns nothing red. |
| AC-1 | One ATTACH is one `apply()`, on both harnesses. On the always-present harness that is one per mount, pinned by (g); on the live conditional-host harness it is one per appearance in production and two under Strict Mode's replay, pinned by (h14) and (h13). Mutants M1, M4 and M5 each turn a named case red; M3 is an accepted gap, recorded in §5 with its reason. |
| AC-1b | EVERY cell of spec §0.1's per-consumer table and §0.1a's entrance table is pinned, in both modes, by the case spec §5.1 assigns to that consumer: `ReSyncButton` by (h15), `PublishedToggle` by (h16), `AttentionMenuPanel` by (h17), with (h17) asserting the attach and post-entrance snapshots separately. (h13) and (h14) pin the replay and the minimal-shape headline; (g) and (h) pin the always-present harness; (h8) and (h9) pin §2.2's two re-render rows. Plan review R3 charged the earlier version for crediting the generic cases with per-consumer rows they do not assert. |
| AC-2 | One attach is one ancestor walk, pinned by (h) with a derived expectation, and mutants M2/M7 turn a named case red. |
| AC-3 | All eight reachable pairs and all SEVEN compound rows (the count is the spec's; plan review R1 caught this table carrying five and this criterion claiming five) have an executable case that ACTUALLY PERFORMS that transition — not one that merely cites a nearby test. Spec review R6 found `N to F` citing a clipped-to-clipped case for six rounds; (h19) closes it and every other row was re-verified against what its cited case does. Mutants M8, M9, M10 and M18 each turn a named one red. |
| AC-4 | In a real engine, neither overlay is ever painted crossing its clip edge, on any frame from first appearance, and mutant M6 breaks that. |
| AC-6 | Invariant 8's dual gate has RUN — both halves, externally attested, findings and dispositions in §12, and a valid RAN-form marker line WRITTEN there, which is what turns `tests/docs/_metaInvariant8Closeout.test.ts` green. |
| AC-5 | Every gate green as its own command; no new CI wiring needed and the e2e coverage meta-test confirms it. |
