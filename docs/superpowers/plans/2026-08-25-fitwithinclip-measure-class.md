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

The citations this plan's own execution invalidates:

| Citation | Named in | Invalidated by |
| --- | --- | --- |
| `components/admin/useFitWithinClip.ts:161`, Task 2's `red-target` | Task 2's marker | Task 1 deletes the effect it lives in; Task 2 then deletes the call itself |
| the family-pin precedent, `tests/components/admin/useFitWithinClip.test.tsx:362-366` | Tasks 3 and 4 | Task 1 and Task 3 both add cases above it |
| observer wiring, `components/admin/useFitWithinClip.ts:167-170` | Task 3 | Task 1 moves it into the ref callback |
| the no-clip branch, `components/admin/useFitWithinClip.ts:91-96` | Task 3 | Task 2 changes `apply()`'s return shape |
| the synchronous measure, `components/admin/useFitWithinClip.ts:144` | Task 4 | Task 1 deletes the effect around it |

**So the rule is not "re-point at the end" — it is that a citation naming a line the plan DELETES
must not be a `red-target` at all.** Task 2's marker therefore names the surviving surface (the ref
callback's wiring, where the second walk lives after Task 1) with a `why=` describing the defect
rather than the deleted line. The five rows above are re-verified at close-out **by READING each
cited line and matching it to the symbol its sentence names** — confirming a citation RESOLVES
establishes nothing, which is the documented trap.

## 6. Task list## 6. Task list

<!-- tasks: depth=2 red-contract -->

## Task 1 — the attach counter goes away; the ref callback owns the wiring

<!-- task: red=`pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` red-state=authored red-target=`components/admin/useFitWithinClip.ts:77` why=`attachCount is an effect dependency, so the layout effect runs a second time and the mount apply count is 2; the assertion this task rewrites to 1 fails on that line, not on anything the test controls` ac=AC-1 -->

**What is red and why.** Case (g) at `tests/components/admin/useFitWithinClip.test.tsx:281` currently asserts `toBe(2)`. This task's RED step changes it to `toBe(1)` FIRST, against the unmodified hook, and observes it fail at 2 — the failure comes from `components/admin/useFitWithinClip.ts:77`'s state counter re-running the layout effect, not from anything the test controls.

RED:

1. `tests/components/admin/useFitWithinClip.test.tsx:281` → `expect(afterMount, "mount measure count changed").toBe(1)`.
2. Rewrite the comment at `tests/components/admin/useFitWithinClip.test.tsx:276-279`. It currently cites `BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE` as live debt. It must stop citing a row this branch closes, and say instead that one attach is one measure, pinned here so a regression to two is visible rather than absorbed into the coalescing delta below.
3. Add case (h3): after `view.unmount()`, fire a `window` resize and flush frames; assert `applyCount` did not move. Its red is mutant M3.
4. Add case (h2): call the ref callback with `null` directly and assert it neither throws nor measures. Its red is mutant M4.
5. Add case (h14): the LIVE conditional-host harness — the same tree with the overlay behind a flag, which is what all five call sites render. Assert per appearance: one `apply()`, one ancestor walk, and — the load-bearing one — **one owner render pass**, where the counter takes two. The existing always-present harness stays for the cases built on it; this one exists because no consumer uses that shape and spec §0.1's first two drafts drew the wrong conclusion from it. Its red is mutant M12.
6. Add case (h13): the same conditional-host harness inside `<StrictMode>`, asserting the replay's counts EXACTLY — two applies per appearance and two owner renders, against the current code's one and four. It pins the development cost in the direction it actually moves, so a later change that makes the replay worse is visible rather than absorbed. Its red is mutant M13, and it is the only case that would notice a ref callback that stopped returning its teardown.
7. Add case (h12) **before touching the wiring**, per spec §5.1: replace case (d)'s throwaway `ResizeObserver` stub with one that CAPTURES the constructor callback, then invoke it once with the clip ancestor resized and once with the positioned ancestor resized, asserting the cap re-derives from the new geometry each time. This is the only re-measure signal with no behavioural case, and Task 1 is the task that moves it — covering it afterwards would mean the move happened unobserved. Its red is mutant M11, which on the unmodified tree kills nothing at all.
8. Observe red. Paste every failure line into the commit.

The (h12) body, written out so it can be typechecked and reviewed rather than described:

<!-- fixture: why=`the stub must CAPTURE the constructor callback and the hook must observe both ancestors, or "the callback re-measures" is a claim about nothing` -->
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

Then RUN mutants M1, M3, M4, M5, M11, M12 and M13 against the green tree, confirm each named case goes red, revert each, and paste all seven results into the commit. Two are worth reading twice: M11 must go from killing NOTHING to killing (h12), and M12 must kill (h14) — it is the only guard on the render halving this arc's headline now rests on.

## Task 2 — `apply()` returns the clip it already resolved

<!-- task: red=`pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` red-state=authored red-target=`components/admin/useFitWithinClip.ts:161` why=`the ref callback re-walks the ancestor chain after apply() already walked it, so the new ancestor-getComputedStyle counter reads two walks where the assertion derives one` ac=AC-2 -->

**What is red and why.** After Task 1 the mount still walks twice: once inside `apply()` and once in the wiring, at what is `components/admin/useFitWithinClip.ts:161` on the pre-Task-1 tree. Case (h) is authored in this task and fails on that second walk. It cannot pass by accident: it counts `getComputedStyle` calls on ANCESTORS only, and its expected value is derived, not typed.

RED — add case (h) to `tests/components/admin/useFitWithinClip.test.tsx`:

<!-- fixture: why=`the harness chain must be at least two ancestors deep and the clip must be the OUTER one, or a per-walk count of 1 would be indistinguishable from a count of 2` -->
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

## Task 3 — transition audit, and the class sweep re-run as a closeout

**Red:** mutants M8, M9 and M10 from §5 — the two that target the compound rows specifically, since a
compound case that only re-proves what (g3) already proves is not worth its line. M8 drops
`coalescer.cancel()` from the teardown and must turn BOTH (g3) and the new (h5) red; M9 reorders the
teardown so the `transitionend` listener outlives the cancel and must turn the new (h7) red. Each RUN
against the green tree, each reverted, all output pasted into the commit.

M9 is the one worth stating twice, because it is the ordering bug this task exists to make visible: the
listener removal and the frame cancel are two lines whose ORDER carries the whole guarantee, and nothing
in the file says so today.

The spec's Transition Inventory in full, with the case that covers each. The writing-plans transition-audit rule requires the table in the task body, and requires compound transitions to be exercised, not described.

Eight of twelve ordered pairs are reachable — spec review R1 finding 3 corrected an earlier count of six, and `D → F` / `D → N` are the two it restored. Four are unreachable and are named in the spec rather than elided.

| Pair | Treatment | Covered by |
| --- | --- | --- |
| U → F | Instant, synchronous, pre-paint; one apply, one walk | (g2), (g), (h) |
| U → N | Instant; no clip found, no `max-height` written | (b) |
| F → N | Instant; the stale fit is REMOVED, not retained | family A |
| N → F | Instant; the re-fit derives from the DECLARED cap | family B |
| F → D | Teardown: disconnect, unlisten ×2, cancel frame, null the node | (g3), (h3) |
| N → D | Same teardown; `observer?.` already guards the absent observer | (h4), new here |
| D → F | The re-attach a `reapplyKey` change or a host reappearing takes | (c), (h8) |
| D → N | Same, where nothing clips on the new attach | (h10), new here |
| Compound: `reapplyKey` changes with a frame pending | Detach cancels the frame; re-attach measures synchronously | (h5), new here |
| Compound: unmount with a frame pending | Frame cancelled; `apply()` never runs on a detached node | (g3) |
| Compound: `reapplyKey` changes in the same commit that attaches | One attach, one measure | (h6), new here |
| Compound: `transitionend` mid-teardown | Listener removed before `cancel()`, so a late event cannot schedule | (h7), new here |
| Compound: conditional host hides and reappears, owner mounted throughout | F → D → F; the teardown's `nodeRef.current = null` sits in between | (h11), new here |
| Compound: the key and the node drop together | Teardown only, no re-attach. `PublishedToggle`'s close path — one boolean gates both | (h16), close half |
| Compound: a stable-ref re-render while the DOM's clip status changes | **Nothing happens**, deliberately. The cap corrects on the next signal; the SUBSCRIPTION does not correct at all (spec §7, and `BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION`) | (h19), (h20), whose first assertion is exactly this negative |

Nothing animates: every pair is deliberately instant, because the hook exists to write a cap BEFORE paint. There is no `AnimatePresence`, no `exit`/`initial`/`animate` prop, and no ternary render in `components/admin/useFitWithinClip.ts` — `rg -n 'AnimatePresence|initial=|animate=|exit=' components/admin/useFitWithinClip.ts` returns nothing. The audit's finding is therefore "all instant, deliberately", and the four new compound cases are what makes that executable rather than asserted.

**(h21)** and **(h22)** cover the two rows spec review R8 found citing ids this arc had never defined, and they correct a claim the inventory carried for four rounds: **state N still holds an observer.** With nothing clipping there is no CLIP to observe, but the POSITIONED ancestor is observed regardless (`components/admin/useFitWithinClip.ts:167-170`), and the teardown disconnects it — measured `constructed=1 observed=[["inner"]]` on the attach and `disconnected=1` on the unmount. (h21) asserts exactly that pair; (h22) asserts the re-attach onto a chain that stopped clipping builds a FRESH observer watching the positioned ancestor alone, disconnects the previous one, and removes the stale cap. Their red is mutant M20.

**PROBE DISCIPLINE, learned the hard way in spec review R10 and binding on every probe this plan authors:** give each one a CONTROL row whose expected value is the null result. R10's key/node probe wrapped the hook's ref in a fresh inline arrow per render, so the WRAPPER's identity changed every render and forced the very detach-and-attach it was measuring; it reported that a no-op re-render re-attaches, which is false, and it read exactly like a discovery. The control — `CONTROL_NOTHING_MOVES` must log `[]` — is what caught it. A probe without a null-result control cannot tell its own instrument from its subject.

**Counting note that applies to (h21), (h22) and any case on an UNCLIPPED path:** counting `apply()` by counting `getBoundingClientRect` on the fitted node is valid only where the chain CLIPS. On the no-clip path `apply()` returns before reading that rect (`components/admin/useFitWithinClip.ts:91-96`) and the proxy reports zero for a run that happened — spec review R8 finding 2. Those cases count walk entries instead, and say so in place.

**(h19)** and **(h20)** cover the two SIGNAL-DRIVEN edges spec review R7 established, neither of which had any case. R7's probe is the recipe and the reason: with a stable ref and an unchanged `reapplyKey`, a re-render does NOTHING even when the DOM's clip status changes in that commit, so both cases must be driven by a `window` resize plus a flushed frame, not by the re-render. Each asserts the re-render changed nothing FIRST — that negative is the fact R7 established and is worth pinning — then signals and asserts the cap appears (h19) or is removed (h20). Expected values derive from `computeFittedMaxHeight` against the fixture geometry, never typed. Reds are M18 and M19, and like M11 they kill nothing in today's suite.

The superseded reading, recorded so it is not re-attempted: an earlier draft of (h19) flipped `clips` on a re-render and expected the cap to appear. That would FAIL a correct implementation. `clips` and `reapplyKey` are independent fixture inputs (`tests/components/admin/useFitWithinClip.test.tsx:84`), and changing `reapplyKey` would not fix it either — that routes through a detach, giving `N to D to F` rather than the direct edge.

**M11 and M18 are the two mutants to run FIRST**, because both kill nothing in today's suite: a mutant that already kills something proves the suite has a pin, while a mutant that kills nothing proves it does not.

**(h18)** covers the FOURTH runtime path, which no round raised and which the source sweep found: the hook called with its ref NEVER attached. `PublishedToggle`'s `variant` defaults to `"card"` (`components/admin/PublishedToggle.tsx:98`), and the arm carrying `ref={fitRef}` is behind `if (variant === "inline" || variant === "settings")` (`components/admin/PublishedToggle.tsx:134`) — the file has exactly one `ref={fitRef}`, so the default variant calls the hook and never attaches. (h18) renders that arrangement and asserts zero applies, zero walks, and no throw. Its red is mutant M16. It is the only path where this refactor removes work with no number to show for it: today the layout effect still runs and returns early on the null node; after, nothing runs at all.

Cases created here, each named in the inventory above, plus the three per-lifecycle count cases spec review R4 forced into existence — **(h15)** the `ReSyncButton` shape, **(h16)** the `PublishedToggle` shape where the key IS the mounting condition, and **(h17)** the `AttentionMenuPanel` shape where the node is present at its owner's first render, which asserts TWO snapshots — the attach against spec §0.1, then the totals after flushing the entrance frame against §0.1a. Spec review R5 established that a single cumulative assertion there is unsatisfiable unless the entrance re-attach is suppressed, and suppressing it would leave the `scale-95` entrance's transformed geometry stale without tripping the floor-clamp diagnostic. Each asserts renders, applies and walks for its own row of spec §0.1, bare and under `<StrictMode>`, against the exact numbers there — including `ReSyncButton`'s dev apply count of 2, pinned AS 2 rather than wished down to 1. Their shared red is mutant M14: an implementation that improves one lifecycle by pessimising another, which every earlier version of this suite would have reported as success because it modelled a single shape. And: **(h4)** the N to D teardown with no observer to disconnect, **(h5)** a `reapplyKey` change with a coalesced frame pending, **(h6)** a `reapplyKey` change landing in the same commit that attaches the node, **(h7)** a `transitionend` arriving mid-teardown, **(h10)** the D to N re-attach where nothing clips on the new attach, and **(h11)** the conditional host hiding and reappearing while the owner stays mounted. The last is the live shape's own compound row and the one the §2.1 probe transcript was rewritten around.

Also in this task, case (h9): re-render with an UNCHANGED `reapplyKey` and assert zero applies and zero ancestor walks. It is green before and after — which is exactly why it is here and not in a red-then-green task — and its red is mutant M10. It is the only case in the suite that can see an identity-churning callback.

And RUN the class sweep from the REPAIRED spec §4.1 against the post-refactor tree, pasting each command with its output. Not the round-1 greps: those enumerated spellings and the shape-1 instrument could not see this hook. Run the derived pair — the scope check that `findClippingAncestor` is exported nowhere, and the ref-callback axis (`ref=\{\s*\(` plus `RefCallback`) whose positive control is that it finds `useFitWithinClip` itself. A sweep described and not run is the defect this rule exists for; a sweep run with an instrument that fails its own positive control is the defect round 1 found.

## Task 4 — the real-browser pin: never painted uncapped

**Red:** mutant M6 from §5 — the mount `apply()` deferred into `coalescer.schedule()`. The synchronous mount measure (`components/admin/useFitWithinClip.ts:144` on the live tree) is what keeps the FIRST painted frame capped, so with M6 planted the sampler's first sample sits below the clip edge and the per-frame assertion fails. RUN it, paste the failure, revert.

jsdom computes no layout, so spec §3's Dimensional Invariants are settled only here. This is a TRANSITION PIN in the sense the file already uses for the family A/B cases (`tests/components/admin/useFitWithinClip.test.tsx:362-366`): green on a correct tree by design, its red condition a defective refactor. That is why its red is proven by RUNNING mutant M6, not claimed.

Shape, on both surfaces the file can drive — the AttentionMenu scroller (`SCROLLER` against `PANEL`) and the PublishedToggle banner (`TOGGLE_BANNER` against `TOGGLE_CLIP`):

- `page.emulateMedia({ reducedMotion: "reduce" })` and `page.setViewportSize({ width: 390, height: 560 })` FIRST, so the entrance transition cannot distort a sampled rect. Existing cases establish that order (`tests/e2e/popover-clip-fit.spec.ts:252-254`).
- `page.addInitScript` installs a `requestAnimationFrame` loop that records `{ overlayBottom, clipBottom }` on every frame where both nodes exist. It must be an init script: `openMenu` navigates, and the menu auto-opens on mount, so anything installed afterwards misses the frames under test (§3 fact 2).
- Drive with the existing `openMenu(page, 10, 10, 10)` / `openToggleBanner(page)` helpers. Read the samples in ONE `page.evaluate`, which is also what keeps both rects from being read at two different scroll positions.
- Assert three things in this order, per spec §5.2. **(1) ARMING**: the recording contains at least one ABSENT row before its first present row, which is an executable statement that the recorder preceded the appearance. Spec review R4 finding 2 charged the earlier draft for omitting exactly this — "at least one frame was sampled" permits sampling to begin after the overlay corrected itself, which turns this case into a slower copy of the two after-settle cases it exists to complement, and the repo already carried the requirement in prose at `tests/e2e/section-header-reconcile.layout.spec.ts:117-119`. **(2) NON-VACUITY**: at least one PRESENT row exists. **(3) CONTAINMENT**: every present row satisfies `overlayBottom <= clipBottom + 0.5`. Mutant M15 arms the sampler after appearance and must turn (1) red; a sampler that never fired at all must turn (2) red.

Existing containment cases at `tests/e2e/popover-clip-fit.spec.ts:310` and `tests/e2e/popover-clip-fit.spec.ts:565` and the anchor-room census at `tests/e2e/popover-clip-fit.spec.ts:720-754` are not edited and must stay green. They measure after settle; this one measures from the first frame, which is the property the synchronous mount exists to provide and the only one M6 can break.

Run under `pnpm heavy`.

## Task 5 — full gates

**Not a red-then-green unit.** This is the post-implementation gate run. Its failure condition is any regression Tasks 1-4 introduced anywhere else in the tree, which is not a contract that can be declared in advance.

Each as its own command, never chained: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, `pnpm heavy pnpm test:e2e`, and `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts`. Vitest strips types, so a green suite proves nothing about `pnpm typecheck`.

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
6. Flip the header marker from `impeccable-gate: PENDING` to the closeout form.

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
| AC-1 | One ATTACH is one `apply()`, on both harnesses. On the always-present harness that is one per mount, pinned by (g); on the live conditional-host harness it is one per appearance in production and two under Strict Mode's replay, pinned by (h14) and (h13). Mutants M1/M3/M4/M5 each turn a named case red. |
| AC-1b | EVERY cell of spec §0.1's table is pinned — both modes, all three metrics. Renders by (h14) and (h13); applies by (g), (h14) and (h13); walks by (h) and (h14). The `reapplyKey` change is pinned by (h8) and the unchanged re-render by (h9). No cell of the acceptance condition is unfalsifiable, which is the defect round 1 charged. |
| AC-2 | One attach is one ancestor walk, pinned by (h) with a derived expectation, and mutants M2/M7 turn a named case red. |
| AC-3 | All eight reachable pairs and all SEVEN compound rows (the count is the spec's; plan review R1 caught this table carrying five and this criterion claiming five) have an executable case that ACTUALLY PERFORMS that transition — not one that merely cites a nearby test. Spec review R6 found `N to F` citing a clipped-to-clipped case for six rounds; (h19) closes it and every other row was re-verified against what its cited case does. Mutants M8, M9, M10 and M18 each turn a named one red. |
| AC-4 | In a real engine, neither overlay is ever painted crossing its clip edge, on any frame from first appearance, and mutant M6 breaks that. |
| AC-6 | Invariant 8's dual gate has RUN — both halves, externally attested, with findings and dispositions in §12 and the header marker flipped off PENDING. |
| AC-5 | Every gate green as its own command; no new CI wiring needed and the e2e coverage meta-test confirms it. |
