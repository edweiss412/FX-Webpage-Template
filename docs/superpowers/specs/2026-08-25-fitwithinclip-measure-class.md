# `useFitWithinClip` measure class — one attach, one walk

**Date:** 2026-08-25 · **Branch:** `feat/fitwithinclip-measure-class` · **Implementer:** Opus / Claude Code (AGENTS.md hard rule: everything in scope is under `components/`)

Closes `BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE` (`BACKLOG.md:1271`) and `BL-FITWITHINCLIP-DOUBLE-ANCESTOR-WALK` (`BACKLOG.md:1294`). Both rows name the same trigger — a refactor of the hook's attach mechanism — on the same effect body, so they are one arc.

Parent spec for the hook itself: `docs/superpowers/specs/2026-08-01-admin-popover-overlay-cluster.md` §4.1/§4.2.

---

## §0 — What is wrong, measured

`components/admin/useFitWithinClip.ts` caps an overlay so a clipping ancestor cannot cut it off. It does that correctly. It does it more times than it needs to.

Two mechanisms, both on the mount path:

1. **The attach counter.** The hook holds the node in a ref and a counter in state (`useFitWithinClip.ts:77`). The ref callback writes the node and bumps the counter (`components/admin/useFitWithinClip.ts:204`, `components/admin/useFitWithinClip.ts:207`); the counter is an effect dependency (`components/admin/useFitWithinClip.ts:201`), so the layout effect runs, measures, and then runs again when the bump lands. The counter exists for a real reason — these overlays mount long after their owner, so an effect keyed on the ref alone would run once with `null` and never wire the observers up — but React 19 lets a ref callback return a cleanup, which is the mechanism the counter was standing in for. The installed React is `19.2.4` (root `package.json`, `dependencies.react`), and §2.1 probes that behaviour against it rather than inferring it from a version string.

2. **The second ancestor walk.** `apply()` walks to the clip ancestor inside `withNaturalSize` (`components/admin/useFitWithinClip.ts:91`), and the effect body walks the same chain again immediately afterwards to decide what to observe (`components/admin/useFitWithinClip.ts:161`). Each walk calls `getComputedStyle` on every ancestor up to the first non-`visible` overflow.

The two compound: each of the two mount measures drags its own pair of walks along.

### §0.1 — Baseline, measured per consumer, because there are three shapes and not one

**This is the section's third rewrite and the last one it should need, because it stops modelling the
consumers and measures them.** Round 3 killed the first version, which used the unit harness. Round 4
killed the second, which generalised one conditional-host probe to "all five call sites". Three
rounds on one vector is the same-vector trigger, so what follows is the comprehensive re-analysis
that rule demands: every shipped lifecycle enumerated from its component source, measured, and
pinned individually.

**There are three lifecycles, not one**, and the difference is structural rather than incidental:

| Consumer | Shape, read from the component | Cited at |
| --- | --- | --- |
| `ReSyncButton` (three instances) | No `reapplyKey`. The node is behind a flag on the SAME owner, so it appears on a later render. | `components/admin/ReSyncButton.tsx:111-113`, node at `components/admin/ReSyncButton.tsx:235`, `components/admin/ReSyncButton.tsx:261` and `components/admin/ReSyncButton.tsx:317` |
| `PublishedToggle` | The `reapplyKey` **is** the condition that mounts the node — `errorCode != null \|\| genericError` gates both. So the key flips in the same commit that attaches the node. | `components/admin/PublishedToggle.tsx:132`, node at `components/admin/PublishedToggle.tsx:201` |
| `AttentionMenu` | The hook is called inside `AttentionMenuPanel`, which is "Mounted only while open", and the node is rendered unconditionally in THAT panel's JSX. From the hook's owner the node is present at its FIRST render. `entered` then flips after mount. | `components/admin/showpage/AttentionMenu.tsx:61-72`, node at `components/admin/showpage/AttentionMenu.tsx:173` |

So the always-present shape — the one the first draft measured and the second dismissed as used by no
route — **is** a shipped surface. It is `AttentionMenuPanel`. The second draft's "all five use a late
conditional host" and "all five currently measure once" were both false.

**And there is a fourth runtime path that attaches nothing at all**, found by sweeping the call sites
from source rather than by a review round. `PublishedToggle`'s `variant` defaults to `"card"`
(`components/admin/PublishedToggle.tsx:98`); the arm carrying `ref={fitRef}` sits behind
`if (variant === "inline" || variant === "settings")`
(`components/admin/PublishedToggle.tsx:134`) and returns at
`components/admin/PublishedToggle.tsx:151`, while the card arm returns at
`components/admin/PublishedToggle.tsx:232` having never attached it — the file contains exactly one
`ref={fitRef}`. The hook is called unconditionally for rules-of-hooks reasons, and the component says
so in place (`components/admin/PublishedToggle.tsx:128-131`). So the DEFAULT variant of one consumer
calls the hook and never attaches its ref.

It carries no row in the table below because it measures nothing in either shape: zero applies, zero
walks. The difference is invisible to those columns and real anyway — today the layout effect still
RUNS on every dependency change and returns early on the null node, whereas after the refactor
nothing runs at all. It is the one path where this arc removes work with no number to show for it,
and (h18) pins that it stays silent rather than becoming a throw.

**Strict Mode is on and its replay is development-only.** `next.config.ts` never sets
`reactStrictMode`, and Next enables it for the App Router when unset, per its own inline build
comment. React 19 replays a callback ref that returns a cleanup, which is what §2 introduces.
Verified dev-only against the shipped bundles rather than from documentation: the strict
double-invoke symbols appear 101 times in the installed `react-dom` development client build and
**zero** times in its production build.

Probe: each of the three shapes reconstructed from the component structure above, driven through one
overlay appearance, once bare and once inside `<StrictMode>`, counting owner render passes,
`apply()` calls (one `getBoundingClientRect` on the fitted node each) and ancestor walks (two
`getComputedStyle` calls each in this two-deep chain). Run 2026-08-25 against `origin/main` at
`449f29faba03` and against the §2 shape.

**What the table measures, stated because round 5 caught the label overreaching:** the ATTACH — every
render, measure and walk from the commit that mounts the node up to and including the first measure.
For `ReSyncButton` and `PublishedToggle` that IS the whole appearance; neither does anything after it
until a real signal arrives. `AttentionMenu` is different, and §0.1a carries it.

**Per attach — renders / `apply()` / ancestor walks:**

| Consumer | Production before | Production after | Strict Mode before | Strict Mode after |
| --- | --- | --- | --- | --- |
| `ReSyncButton` ×3 | 2 / 1 / 2 | **1 / 1 / 1** | 4 / 1 / 2 | **2 / 2 / 2** |
| `PublishedToggle` | 2 / 2 / 4 | **1 / 1 / 1** | 4 / 2 / 4 | **2 / 2 / 2** |
| `AttentionMenu` | 2 / 2 / 4 | **1 / 1 / 1** | 4 / 3 / 6 | **2 / 2 / 2** |

#### §0.1a — `AttentionMenu`'s appearance continues past the attach

Its `reapplyKey` is an entrance flag flipped from a mount-scoped `requestAnimationFrame`
(`components/admin/showpage/AttentionMenu.tsx:82-84`), so one menu opening is an attach AND a key
change, and the key change re-attaches. Round-5 finding 1: the attach row alone cannot describe that,
and a case asserting the attach row while driving the flip would be asserting the wrong total. Same
probe, with the entrance frame flushed:

| `AttentionMenu` | before | after |
| --- | --- | --- |
| bare, at attach | 2 / 2 / 4 | **1 / 1 / 1** |
| bare, after the entrance flip | 3 / 3 / 6 | **2 / 2 / 2** |
| Strict Mode, at attach | 4 / 3 / 6 | **2 / 2 / 2** |
| Strict Mode, after the entrance flip | 6 / 4 / 8 | **4 / 3 / 3** |

Every stage improves on every metric. The re-attach on the key flip is **load-bearing and must not be
suppressed to flatter a count**: the `scale-95` entrance distorts the measured rect, and the settled
cap is what the second pass exists to compute (`components/admin/showpage/AttentionMenu.tsx:69-72`).
An implementation that skipped it would leave the transformed geometry stale without tripping the
floor-clamp diagnostic — silently wrong, which the §6 bound forbids. (h17) therefore asserts BOTH
snapshots, separately, rather than one cumulative number.

**What the tables say, stated plainly and including the one cell that moves the wrong way.**

- **In production every consumer improves or holds on every metric.** Render passes halve 2 → 1
  across all three. `apply()` halves for `PublishedToggle` and `AttentionMenu` and holds at 1 for
  `ReSyncButton`. Ancestor walks go 2 → 1 and 4 → 1.
- **In development render passes halve 4 → 2 across all three**, and walks improve or hold: 2 → 2,
  4 → 2, and `AttentionMenu` threefold, 6 → 2.
- **The single regression is `ReSyncButton`'s development `apply()` count, 1 → 2.** It is the only
  consumer that measures once today, and the cleanup-returning ref opts it into the replay.
  `PublishedToggle` holds at 2 and `AttentionMenu` improves from 3 to 2, so this is one cell of
  twelve, in the mode no admin runs. §7 carries it as a documented limit.
- **The proposed shape converges all three consumers onto identical costs** — 1/1/1 in production and
  2/2/2 under the replay — where today they range from 2/1/2 to 4/3/6. Uniformity is worth naming: it
  means the hook's cost stops depending on which of three lifecycles its caller happens to have.
- **`BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE`'s premise holds for two of three consumers, not "every
  mount" and not "none".** `PublishedToggle` and `AttentionMenu` do measure twice per appearance
  today; `ReSyncButton` measures once. The row is right about the defect and wrong about its reach,
  and the fix it prescribes is correct for all three either way. This is recorded rather than
  inherited, and it is the third and final correction this section has needed.

### §0.2 — Why it is worth doing

`apply()` forces a synchronous reflow — it clears the caps, reads two rects and one computed style, writes a cap (`components/admin/useFitWithinClip.ts:90-111`) — and it is a **layout** effect, so every one of those reflows is on the path to the first paint of the overlay. Three overlays in `ReSyncButton` alone (`components/admin/ReSyncButton.tsx:111-113`), one in `PublishedToggle` (`components/admin/PublishedToggle.tsx:132`), one in `AttentionMenu` (`components/admin/showpage/AttentionMenu.tsx:72`). The `AttentionMenu` case pays twice over: its `reapplyKey` is the entrance flag, so opening the menu is an appearance plus a key change, and it pays §0.1's appearance column and its key-change cost together.

---

## §1 — What ships

One **source** file changes: `components/admin/useFitWithinClip.ts`. Its unit suite gains the cases §5.1 enumerates, and updates the one assertion that pins the old count. §5.1 is the single list; this sentence does not restate its size or its contents. `tests/e2e/popover-clip-fit.spec.ts` gains a real-browser containment assertion, because jsdom computes no layout and the whole subject is a measurement. `BACKLOG.md` carries the two in-progress markers (removed in the last commit) and gains the §4.2 row. No other production file is touched.

## §1.1 — Resolved scope — do not relitigate

Each of these is settled. A reviewer verifies the citation rather than re-deriving the decision.

| Decision | Ratified at | Note |
| --- | --- | --- |
| The mount measure is **synchronous** and deliberately bypasses the raf coalescer | `useFitWithinClip.ts:140-144`; pinned by case (g2), `tests/components/admin/useFitWithinClip.test.tsx:296-303` | Deferring it to a frame reintroduces the uncapped painted frame the layout effect exists to prevent. Removing a redundant measure is in scope. Making the surviving one async is not. |
| `apply()` re-walks on **every** invocation | `BACKLOG.md:1294` | The ancestor chain can change between measures. Only the effect body's own second walk is redundant, and only for the run that just called `apply()`. §2 hoists that one walk and nothing else. |
| `transitionend` is scoped to the positioned ancestor **and** to `propertyName === "transform"` | `useFitWithinClip.ts:171-188`; pinned by (e2) `tests/components/admin/useFitWithinClip.test.tsx:236` and (g4) `tests/components/admin/useFitWithinClip.test.tsx:342` | Both narrowings are deliberate and documented in place. Unchanged by this arc. |
| `MIN_FITTED_HEIGHT = 48` wins over available room | `lib/layout/fitWithinClip.ts:51`, rationale at `lib/layout/fitWithinClip.ts:29` | Not this arc. |
| The `PublishedToggle` anchor room is **unmeasured on purpose** | `lib/layout/fitWithinClip.ts:38-43` | A documented limit with an open row (`BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED`, `BACKLOG.md:1450`), not a finding. The docblock recording it is not edited by this arc. |
| `ResizeObserver` is feature-detected, never assumed | `useFitWithinClip.ts:165-166`; pinned by (f) `tests/components/admin/useFitWithinClip.test.tsx:259` | jsdom has none. An unguarded construction takes down the component it is sizing. |
| Non-finite geometry falls back to `cap` | `lib/layout/fitWithinClip.ts:78-79` | Ratified fail-open. Out of scope; `lib/layout/fitWithinClip.ts` arithmetic is untouched by this arc. |
| The dev diagnostic stays `clientLog("debug", …)`, console-only | `useFitWithinClip.ts:118-131` | Invariant 5. A `warn`/`error` would mirror to `app_events`; a developer diagnostic that only fires outside production has no business writing telemetry rows. The call moves with `apply()`'s body and its level, message and once-per-element guard are byte-identical. |
| `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` is **out** | `docs/superpowers/specs/2026-08-05-m-wave-design.md:24`, `docs/superpowers/specs/2026-08-09-m-wave-2-decisions-brief.md:27` | PREREQ-fenced by ratified user selection in both, trigger unfired. It is a harness-reachability gap, not a measure-path defect. |
| `AnchoredPortal` is swept and **deferred with evidence** | §4.2 below | Probed at 3 measures per open. Different mechanism, exception (c). |

---

## §2 — The shape that ships

The counter goes away. The ref callback owns the wiring, and returns the teardown.

```
useFitWithinClip(reapplyKey)
  nodeRef                              ← the node, for apply() to read
  apply()      = useCallback([])       ← measures; RETURNS the clip it resolved
  refCallback  = useCallback([apply, reapplyKey])
      node === null → nothing to do
      nodeRef.current = node
      clip = apply()                   ← the ONE mount measure, synchronous
      wire coalescer / ResizeObserver(clip, offsetParent) / transitionend / window resize
      return teardown                  ← React 19 ref cleanup
```

Two changes, one each for the two rows.

**Row 1, the counter.** `useState` leaves the hook entirely, and so does `useLayoutEffect`. The whole hook becomes two `useCallback`s. React attaches the ref during the commit's layout phase, before the owning component's own layout effect and before paint, so the synchronous-mount guarantee is preserved by construction rather than by a comment.

**Row 2, the walk.** `apply()` returns the clip ancestor it already resolved, and the ref callback observes that value instead of walking again. `apply()` still walks on every invocation — it must, per §1.1 — and the returned value is only ever used by the caller that just triggered that walk, which is exactly the redundancy `BACKLOG.md:1294` describes.

`apply()` returns `HTMLElement | null`, where `null` carries two meanings: no node, or no clipping ancestor. The ref callback has just written a non-null node, so at that one call site `null` means "nothing clips", which is the same condition the `if (clip !== null)` guard already tested. Stated here because it is the one narrowing in the diff that is not locally obvious, and the implementation comments it at the call site.

### §2.1 — React 19 ref-callback semantics, probed not assumed

The empirical-spike rule (`docs/agents/spec-self-review.md`, "Empirical spike before speccing stateful/race/framework surfaces") makes this mandatory: the design rests on component-lifecycle ordering, so it is measured before it is written down. Probe run 2026-08-25 against React `19.2.4`, logging ref attach/cleanup and the owner's layout effect:

```
ref-attach k=1 node=DIV
owner-layout-effect k=1
--- rerender same k ---
--- rerender k=2 (ref identity changes) ---
ref-cleanup k=1
owner-layout-cleanup k=1
ref-attach k=2 node=DIV
owner-layout-effect k=2
--- unmount ---
owner-layout-cleanup k=2
ref-cleanup k=2
```

That transcript keeps the ref-bearing node present for the owner's whole life. **The live shape is not that.** `ReSyncButton` and `PublishedToggle` render their overlays conditionally, so the ref-bearing node appears and disappears while the hook's owner stays mounted — which is the case the hook's own docblock names as the counter's reason for existing (`components/admin/useFitWithinClip.ts:72-75`). Round-1 finding 2 was that the first transcript did not establish it. Second probe, same React, stable callback identity, conditional host:

```
owner-render show=false
-- show host --
owner-render show=true
attach node=SPAN
-- hide host, owner stays mounted --
owner-render show=false
cleanup
-- show host again --
owner-render show=true
attach node=SPAN
```

Six facts the design depends on, each read directly off one of the two transcripts:

1. **A returned cleanup is called, and `ref(null)` is not.** No `node=null` attach appears anywhere. So the teardown must null `nodeRef.current` itself; the old code got that for free from the `ref(null)` call.
2. **The ref attaches before the owner's layout effect.** The measure therefore happens no later than it does today, and still before paint. No consumer has a competing layout effect that mutates geometry: none of the three consumer files declares a `useLayoutEffect` at all — `rg -n 'useLayoutEffect' components/admin/ReSyncButton.tsx components/admin/PublishedToggle.tsx components/admin/showpage/AttentionMenu.tsx` returns nothing.
3. **A stable ref identity produces no churn.** The `rerender same k` block logs nothing at all. This is what makes `reapplyKey` safe as a dependency: an unchanged key re-renders without detaching.
4. **An identity change detaches and re-attaches, in that order.** So `reapplyKey` in the dependency list reproduces the old effect-dependency behaviour exactly: teardown, re-measure, re-wire. This arc changes how often the mount path measures, never what a `reapplyKey` change means.
5. **A STABLE callback attaches when a conditional host appears later.** The second transcript's first `attach` lands on the `show host` re-render, not on the owner's mount. This is the fact the `attachCount` counter existed to buy, and it is the fact that makes removing the counter safe rather than merely tidier: a ref callback is invoked when the node appears, whenever that is.
6. **The cleanup runs when that host disappears, with the owner still mounted.** `cleanup` lands on the `hide host` re-render. Without this, an overlay could be removed while its `ResizeObserver` stayed attached to a live ancestor and its listeners stayed on the positioned node — a leak per open, on surfaces an admin opens repeatedly.

Fact 4 is why `reapplyKey` stays a dependency of a callback that does not read it. ESLint says so out loud — `react-hooks/exhaustive-deps` reports `unnecessary dependency: 'reapplyKey'` (a warning, not an error: the CI step is `run: pnpm lint` with no `--max-warnings`, `.github/workflows/quality.yml:36`). The dependency is load-bearing and the rule cannot see why, so the implementation carries a targeted `eslint-disable-next-line react-hooks/exhaustive-deps -- <reason>` in the repo's established `--`-reason form, and the reason names fact 4. Silencing it repo-wide, or dropping the dependency, are both wrong: without it a `reapplyKey` change stops re-measuring and case (c) goes red.

### §2.2 — Guard conditions, per input

The hook has one parameter and one runtime input.

| Input | Value | Behaviour | Pinned by |
| --- | --- | --- | --- |
| `reapplyKey` | omitted (`undefined`) | Stable across renders, so the ref never re-attaches on a re-render. One measure per ATTACH — which is one per appearance in production and two under Strict Mode's replay, §0.1. | `ReSyncButton.tsx:111-113` uses this arm; case (g), and (h13) for the replay |
| `reapplyKey` | changes between renders | Detach, re-measure, re-wire. Unchanged from today. | case (c), `tests/components/admin/useFitWithinClip.test.tsx:193` |
| `reapplyKey` | unchanged between renders (any type) | Nothing happens. `Object.is` identity is React's own dependency comparison, not ours. | §0.1's no-op row; case (h9) |
| `reapplyKey` | an unstable object or array literal | Re-attach on every render — one measure and one walk per render. Same exposure as today, where it was an effect dependency with the same comparison. No consumer does this. The hook is exported from one module, so its call sites are enumerable by import: `rg -n 'useFitWithinClip\(' components app lib` returns five, three passing nothing and two passing a boolean. | the five call sites, enumerated below |
| ref `node` | an `HTMLElement` | Measure, wire, return teardown. | every case |
| the hook is called, ref NEVER attached | — | Nothing happens at all: no measure, no wiring, no teardown, and after this arc no effect invocation either. The DEFAULT `card` variant of `PublishedToggle` (`components/admin/PublishedToggle.tsx:98`, `components/admin/PublishedToggle.tsx:134`). | §5.1 case (h18) |
| ref `node` | `null` | Return without measuring or wiring. Unreachable under React 19 cleanup refs (fact 1) but retained: the `RefCallback` type admits it, and returning `undefined` there is what React expects. | §5.1 case (h2) |
| clip ancestor | none found | `max-height` is removed rather than left stale, and no `ResizeObserver.observe` is issued for it. | case (b) `tests/components/admin/useFitWithinClip.test.tsx:188`, family A `tests/components/admin/useFitWithinClip.test.tsx:368` |

---

## §3 — Dimensional Invariants

The hook's entire output is one dimension, so this section is short and load-bearing rather than ceremonial. There is no flex or grid parent-child relationship in scope; the Tailwind v4 `align-items` caveat does not apply.

| Relationship | Guaranteed by | Verified by |
| --- | --- | --- |
| Fitted overlay `bottom` ≤ clip ancestor `bottom` | `computeFittedMaxHeight` (`lib/layout/fitWithinClip.ts:82`) writing `el.style.maxHeight` | Real browser: `tests/e2e/popover-clip-fit.spec.ts` §9 obligations 1 and 3 (`tests/e2e/popover-clip-fit.spec.ts:310`, `tests/e2e/popover-clip-fit.spec.ts:565`), plus the new case in §5 |
| …**except** when the room falls under the floor | `Math.max(MIN_FITTED_HEIGHT, …)` (`lib/layout/fitWithinClip.ts:82`) deliberately wins | The overhang is surfaced by the floor-clamp diagnostic (`components/admin/useFitWithinClip.ts:118-131`), and case (g5) pins that it warns exactly once (`tests/components/admin/useFitWithinClip.test.tsx:316`). This is the consequence bound: never silently wrong |
| Fitted overlay height ≤ its declared CSS cap | `Math.min(cap, available)` (`lib/layout/fitWithinClip.ts:82`) | case (a) `tests/components/admin/useFitWithinClip.test.tsx:181`, family B `tests/components/admin/useFitWithinClip.test.tsx:380` |
| The measurement reads the **declared** cap, never the last fit | `withNaturalSize` owns the clear and restore (`lib/popover/naturalSize.ts:31-72`) | family B `tests/components/admin/useFitWithinClip.test.tsx:380` |

jsdom computes no layout, so none of the first three is settled by the unit suite alone — that is why §5 adds a browser assertion rather than only unit cases.

## §3.1 — Transition Inventory

**Rewritten in full after round-7 finding 1, which showed the previous model wrong about MECHANISM
rather than about coverage.** Rounds 5, 6 and 7 all landed here, so this is the comprehensive
re-analysis the same-vector rule requires: the machine is modelled by what CAUSES each edge, and
every row's pin is derived from what its case actually does rather than from which case sits nearby.

States over one node: **U** unattached, **F** attached and capped against a clip, **N** attached with
nothing clipping, **D** detached.

**The fact the earlier model lacked.** With a stable ref callback and an unchanged `reapplyKey`, a
re-render does **nothing at all** — not even when the DOM's clip status changes underneath it. The
node stays attached, the wiring persists, and no measure runs. Probed on the §2 shape:

```
TR  initial             clips=false  cap=""       applies=0
TR  stable-key rerender clips=true   cap=""       applies=0
TR  resize, pre-frame                cap=""       applies=0  queued=1
TR  resize, post-frame               cap="322px"  applies=1

TR2 initial             clips=true   cap="322px"
TR2 stable-key rerender clips=false  cap="322px"
TR2 after resize+frame               cap=""
```

So **F ↔ N happens only on a re-measure SIGNAL** — a `window` resize, a `transitionend` on the
positioned ancestor, or the `ResizeObserver` callback — and never on a re-render. And a `reapplyKey`
change is not a direct edge either: React runs cleanup then attach, so it is **X → D → Y**.

That corrects two claims the previous table made. Family A is `F → D → N`, not a direct `F → N`;
family B is `F → D → F`, not `F → F`. Both change `reapplyKey`
(`tests/components/admin/useFitWithinClip.test.tsx:369`,
`tests/components/admin/useFitWithinClip.test.tsx:395`), so both route through D by construction.

| Edge | Mechanism | Pinned by |
| --- | --- | --- |
| U → F | The attach, on a clipping chain | (g), (g2), (h) |
| U → N | The attach, with nothing clipping | (b) |
| F → D | Detach: host unmount, or the cleanup half of a re-attach | (g3), (h3) |
| N → D | Same, with no observer to disconnect | (h4) |
| D → F | Attach half of a re-attach, clipping | (c) — a `reapplyKey` flip with `clips` true throughout |
| D → N | Attach half of a re-attach, nothing clipping | (h10) |
| **F → N** | **A re-measure signal**, after the ancestor stops clipping. The stale cap is REMOVED | **(h20), new** |
| **N → F** | **A re-measure signal**, after an ancestor starts clipping. A cap is WRITTEN where none existed | **(h19), new** |

**The two composites the old table mislabelled as direct edges**, kept because the cases exist and
are worth having under their true names:

| Composite | Pinned by |
| --- | --- |
| F → D → N — re-attach onto a chain that no longer clips; the stale fit must not survive the D | family A (`tests/components/admin/useFitWithinClip.test.tsx:368`) |
| F → D → F — re-attach onto a still-clipping chain; the re-fit must derive from the DECLARED cap, not the stale inline one | family B (`tests/components/admin/useFitWithinClip.test.tsx:380`) |

**Unreachable, four of them, unchanged from round 5:** `F → U`, `N → U`, `D → U` (nothing restores
the unattached state; **U** is a hook instance's initial state only) and `U → D` (a detach can only
follow an attach).

**Why the two signal-driven rows are worth their cases rather than a shrug.** On `N → F` the hook
must WRITE a cap where none existed rather than update one, and `isFloorClamped` is FALSE at this
fixture's geometry (available 322 against a 384 cap and a 48 floor) — so an implementation that only
updated an existing inline value would leave the overlay uncapped with the diagnostic silent.
Uncapped and silent is exactly what §6's bound forbids. `F → N` is the mirror: a stale cap that
survives after the clip disappears is a wrongly-constrained overlay, also silent. Neither path had
any case at all before round 7.

| Compound | Treatment |
| --- | --- |
| `reapplyKey` changes with a coalesced frame pending | The detach cancels the frame; the re-attach measures synchronously. Each attach owns its own coalescer, so a stale frame can never land on new wiring |
| Unmount with a coalesced frame pending | Frame cancelled; `apply()` never runs on a detached node — (g3) |
| `reapplyKey` changes in the same commit that attaches the node | One attach, one measure. This is `PublishedToggle`'s shipped shape (§0.1) |
| A `transitionend` arrives mid-teardown | The listener is removed BEFORE `coalescer.cancel()`, so a late event cannot schedule after the cancel |
| The conditional host hides and reappears, owner mounted throughout | F → D → F, with `nodeRef.current = null` in between so a stale `apply()` cannot measure a removed node |
| A re-render with a stable ref while the DOM's clip status changes | **Nothing happens**, deliberately — the probe above. The cap corrects on the next signal. This is a documented limit, §7, not a defect |

Nothing here animates. Every transition is instant by design: this hook exists to write a cap
**before** the browser paints, and easing the cap itself would be a visible resize of a panel the
user is already reading.

## §4 — Class sweep

Shapes swept, stated as the ledger rows state them:

- **Shape 1** — a state counter that exists only to re-run an effect a late-mounting ref should have driven.
- **Shape 2** — a value resolved inside `apply()` that the effect body re-resolves in the same run.

### §4.1 — Result: the class is one file, on a cover the type checker derives

Two rounds went on this section, and both were right about the same thing. Round 1: the sweep
enumerated SPELLINGS, and the instrument failed its own positive control. Round 2: the repair was
still a spelling list — it read `ref={(el) => …}` and a `RefCallback` annotation, and therefore
missed `ref={fitRef}`, a NAMED CALLBACK VALUE, at five sites inside this arc's own probe domain.
Round 2 also noted that the positive control leaned on the hook's explicit return annotation, one
ordinary edit from disappearing. Both are settled below by asking the TYPE CHECKER instead of a
pattern.

**Shape 1 derives from the checker.** `docs/superpowers/specs/2026-08-25-fitwithinclip-ref-callable-probe.mjs`
walks every source file under `components/`, `app/` and `lib/`, finds every JSX `ref=` attribute, and
asks whether the expression's TYPE has a call signature — unioned types included, so `Ref<T>` counts.
A spelling cannot hide from it, because it never reads spelling.

```
$ node docs/superpowers/specs/2026-08-25-fitwithinclip-ref-callable-probe.mjs
ALL ref= attributes in components/ app/ lib/ (non-test): 120
CALLABLE (the shape-1 axis):                            18

components/admin/FinalizeButton.tsx:964  ref   :: ForwardedRef<HTMLDivElement>
components/admin/PublishedToggle.tsx:201  fitRef   :: RefCallback<HTMLElement>
components/admin/ReSyncButton.tsx:235  fitErrorRef   :: RefCallback<HTMLElement>
components/admin/ReSyncButton.tsx:261  fitShrinkRef   :: RefCallback<HTMLElement>
components/admin/ReSyncButton.tsx:317  fitSuccessRef   :: RefCallback<HTMLElement>
components/admin/review/ModalCloseButton.tsx:15  ref   :: ForwardedRef<HTMLButtonElement>
components/admin/review/ShowReviewSurface.tsx:784  (el) => { if (el) railItemRefs.current.set(ext   :: (el: HTMLButtonElement | null) => void
components/admin/review/ShowReviewSurface.tsx:836  (el) => { if (el) sectionElsRef.current.set(ex   :: (el: HTMLDivElement | null) => void
components/admin/review/ShowReviewSurface.tsx:902  (el) => { if (el) railItemRefs.current.set(s.i   :: (el: HTMLButtonElement | null) => void
components/admin/review/ShowReviewSurface.tsx:1058  (el) => { if (el) sectionElsRef.current.set(s.   :: (el: HTMLElement | null) => void
components/admin/showpage/AttentionMenu.tsx:173  fitRef   :: RefCallback<HTMLElement>
components/admin/UseRawControl.tsx:335  buttonRef   :: Ref<HTMLButtonElement>
components/agenda/AgendaPdfViewer.tsx:266  (node) => { pageRefs.current[i] = node; }   :: (node: HTMLDivElement | null) => void
components/auth/AvatarMenu.tsx:371  (el) => { itemRefs.current[0] = el; }   :: (el: HTMLButtonElement | null) => void
components/auth/AvatarMenu.tsx:418  (el) => { itemRefs.current[1] = el; }   :: (el: HTMLButtonElement | null) => void
components/diagrams/Gallery.tsx:346  (node) => { thumbRefs.current.set(item.id, nod   :: (node: HTMLButtonElement | null) => void
components/diagrams/GalleryLightbox.tsx:727  emblaRef   :: EmblaViewportRefType
components/shared/AccentButton.tsx:139  ref   :: Ref<HTMLButtonElement> | undefined

NON-callable (plain ref objects), for completeness: 102
```

**The probe reconciles its own counts**, so a silent truncation would be visible rather than plausible: 18 callable plus 102 non-callable is exactly the 120 `ref=` attributes it found, and it prints every callable row with no cap. Eighteen, where the round-1 grep saw eight plus an annotation. The five it missed — `components/admin/PublishedToggle.tsx:201`, `components/admin/ReSyncButton.tsx:235`, `components/admin/ReSyncButton.tsx:261`, `components/admin/ReSyncButton.tsx:317` and `components/admin/showpage/AttentionMenu.tsx:173` — are this hook's own consumers, which is as central to the probe domain as a site can be.

**The positive control now survives the edit that used to break it.** Round 2's sharpest sentence was
that the control depended on `useFitWithinClip`'s explicit `RefCallback<HTMLElement>` return
annotation. Removed it and re-ran:

```
CALLABLE (the shape-1 axis):  18
components/admin/PublishedToggle.tsx:201   fitRef        :: (node: HTMLElement | null) => void
components/admin/ReSyncButton.tsx:235      fitErrorRef   :: (node: HTMLElement | null) => void
components/admin/showpage/AttentionMenu.tsx:173  fitRef  :: (node: HTMLElement | null) => void
```

Same count, same sites, inferred type instead of the declared one. The checker sees the call
signature whether or not anyone wrote it down, which is the whole difference from a grep.

**All eighteen classified, by reading each site: 8 + 5 + 4 + 1 = 18.** Round-4 finding 3 caught this
sentence claiming nine in-place authors, which totalled nineteen against a derived set of eighteen.
**Eight** author a callback in place — four in `ShowReviewSurface`, two in `AvatarMenu`, one in
`AgendaPdfViewer`, one in `Gallery` — and every one writes to a ref map or ref array and sets NO
state: `pageRefs.current[i] = node`,
`thumbRefs.current.set(item.id, node)`, `itemRefs.current[0] = el`, `itemRefs.current[1] = el`, and
four `railItemRefs`/`sectionElsRef` `.set`/`.delete` pairs. Five are this hook's consumers, which are
instances OF the shape's fix, not instances of the shape. Four are pass-throughs that author no
callback at all — `FinalizeButton.tsx:964` and `ModalCloseButton.tsx:15` forward a `forwardRef`
parameter, `UseRawControl.tsx:335` and `AccentButton.tsx:139` forward a prop — so any callback
reaching them was authored at a caller's `ref=` site, which this same enumeration already covers.
The last is `emblaRef` from embla-carousel, third-party. **Shape 1 is present exactly once, and that
instance is the one this arc removes.**

**Shape 2 derives by SCOPE, for the resolver it names.** `findClippingAncestor` is declared
`function` at `components/admin/useFitWithinClip.ts:48` and exported nowhere:

```
$ rg -n --glob '*.ts' --glob '*.tsx' 'export.*findClippingAncestor' .
(no output)
```

A module-private binding cannot be called from outside its module, so enumerating its call sites
within that one file is exhaustive by construction. There are two —
`components/admin/useFitWithinClip.ts:91` inside `apply()`, and
`components/admin/useFitWithinClip.ts:161` in the effect body, which is the instance this arc
removes.

**And here is exactly what that does NOT establish, because round 2 was right about it.** Scope
privacy bounds calls to THIS resolver. It says nothing about a DIFFERENT module resolving some other
value inside a measure function and re-resolving it in the same run. Deciding that repo-wide is
dataflow analysis, and this repo has already ruled on whether that belongs in a structural cover:
`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:30-33` says of its own two known
evasions that "closing this statically means dataflow analysis, which is not what a meta-test should
be", and ships the rules that catch every shape short of a deliberate one. The same ruling applies
here. So the shape-2 claim is stated at the width the evidence carries: **`findClippingAncestor` has
exactly two call sites and this arc removes the redundant one**, plus a bounded manual sweep of the
sibling measure surfaces the popover registry names — `ShareHub` (clean, below) and `AnchoredPortal`
(§4.2). A shape-2 instance in an unswept module using a different resolver is **not excluded by any
command in this spec**, and is recorded in §7 as a documented limit with its re-file trigger rather
than asserted away.

`components/admin/showpage/ShareHub.tsx` was swept as a nominated peer: one layout effect
(`components/admin/showpage/ShareHub.tsx:403`) calling `applyPlacement()` once
(`components/admin/showpage/ShareHub.tsx:409`) and wiring subscriptions, plus an unrelated
lifecycle-close effect (`components/admin/showpage/ShareHub.tsx:648`). No counter, no re-resolved
value, no double measure. Clean.

### §4.2 — `AnchoredPortal`: probed, real, and deferred with a named reason

`components/admin/AnchoredPortal.tsx` carries neither declared shape, and shape 1's absence there is now established by the §4.1 probe rather than by reading: the file appears nowhere among the eighteen callable `ref=` expressions. Shape 2 is absent by inspection — its `mounted` flag (`components/admin/AnchoredPortal.tsx:93`) is an SSR gate for `createPortal`, not a ref-attach trigger, and `measureAndApply` resolves nothing the effect bodies re-resolve. But the nomination was worth probing, and the probe found something:

```
PROBE closedReads=0 measureRunsOnOpenCommit=3
```

Counting anchor-rect reads (one per `measureAndApply`, `AnchoredPortal.tsx:141`) across a closed → open transition: **three measures per open**. Two layout effects both cover the open commit — the gated one at `components/admin/AnchoredPortal.tsx:191` and the deliberately ungated every-commit one at `components/admin/AnchoredPortal.tsx:254` — and the `setApplied` those produce re-renders, firing `components/admin/AnchoredPortal.tsx:254` a third time before the placement converges.

That is the same consequence as this arc's rows and a **different mechanism**. Repairing it means changing when `components/admin/AnchoredPortal.tsx:254` fires, and `components/admin/AnchoredPortal.tsx:245-253` documents at length why it is unconditional: it is the only subscription that catches a position-only anchor move, which `ResizeObserver` explicitly does not report. The third run is a convergence step of that design, not a stray call. Unpicking it is a redesign of a placement loop this PR does not otherwise touch, with its own e2e geometry suite (`tests/e2e/rowactions-geometry.spec.ts`) and its own viewport-source registry (`tests/components/admin/_metaPopoverViewportSource.test.ts`).

**Filed as `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN` under class-sweep exception (c)** — a redesign of a surface this PR does not otherwise touch — with the probe above as its evidence. Product-facing: three measurement passes, each forcing a synchronous reflow, on every row-actions menu open is shipped admin behaviour. The row does not assert what the converged number should be; deciding that is the work. "Same defect, different file" is explicitly not the reason; the reason is that the repair is a different design decision on a surface with its own contract.

---

## §5 — Verification

### §5.1 — Unit

`tests/components/admin/useFitWithinClip.test.tsx`. Every existing case stays.

**Two harnesses, and every case below says which one it uses.** Round 3's finding turned on the
difference: the existing `Harness` attaches its ref at its owner's first render, which is the
`AttentionMenuPanel` shape and NOT the `ReSyncButton` or `PublishedToggle` one. It stays, and it is
not the vestigial fixture two earlier drafts of this spec called it. A second harness — the same tree with the overlay behind a flag — is
added for the cases that must speak about the LIVE shape, and (h13) drives that one inside
`<StrictMode>`. Reading a count without knowing its harness is how the first two drafts of §0.1 went
wrong; naming it per case is the repair. The spike ran all 15 against the §2 shape: **14 pass unchanged**, and the one failure is the assertion this arc exists to move.

- **(g) mount count.** `expect(afterMount).toBe(2)` at `tests/components/admin/useFitWithinClip.test.tsx:281` becomes `toBe(1)`, and the comment above it (`tests/components/admin/useFitWithinClip.test.tsx:276-279`) stops citing a row that no longer exists — it explains instead that one attach is one measure, and that the count is pinned so a regression to two is visible rather than absorbed into the coalescing delta below it. The coalescing deltas in the rest of (g) (`tests/components/admin/useFitWithinClip.test.tsx:288`, `tests/components/admin/useFitWithinClip.test.tsx:292`) are unchanged and stay green.
- **(g2) synchronous mount.** Unchanged, stays green. This is the pin that stops the refactor drifting the measure into a frame.
- **New (h) walk control.** On the existing always-present harness. Counts `getComputedStyle` calls on **ancestors only** across one mount — the fitted node's own declared-cap read is excluded, so the number is the walk and nothing else. The assertion is stated in ancestor-call units and its expected value is **derived from the harness's own chain**: the walk visits every ancestor up to and including the first non-`visible` overflow, which in this fixture is `inner` then `outer`, so one walk is `ANCESTORS_TO_CLIP.length` calls. Never hardcoded, so deepening the fixture cannot silently satisfy it. Concrete failure modes caught, in the same units: restoring the effect body's second walk doubles it; regressing the attach mechanism to two measures doubles it again.
- **New (h19) `N → F`, and (h20) `F → N` — the two signal-driven edges, neither of which had any case.** Round 6 found `N → F` citing a clipped-to-clipped test; round 7 found the deeper error, that neither edge is reachable by a re-render at all. Both are driven by a re-measure SIGNAL. (h19): mount `clips: false`, assert `maxHeight === ""`, re-render with `clips` true and assert **nothing changed** (the fact round 7 established), then fire a `window` resize, flush the frame, and assert the derived value — computed from `computeFittedMaxHeight` against the fixture geometry, never typed. (h20) is the mirror: mount clipped, stop clipping, assert the cap survives the re-render, then signal and assert it is REMOVED. Concrete failure modes: an `apply()` that updates an existing cap but never creates one (h19), and one that never removes a stale cap when the clip disappears (h20). `isFloorClamped` is false at this geometry, so both failures are silent.
- **New (h18) the hook is called and its ref is never attached.** The fourth runtime path (§0.1), and the DEFAULT variant of `PublishedToggle`. Renders a component that calls the hook and never uses the returned callback; asserts zero applies, zero walks, and no throw across several re-renders. Concrete failure mode: any implementation that measures or wires from the hook BODY rather than from the attach, which would make the card variant do layout work for an overlay it never renders.
- **New (h2) null-node arm.** Calls the returned ref callback with `null` directly and asserts it neither measures nor throws. Concrete failure mode: a teardown-only implementation that assumes a non-null node crashes on any consumer still passing `null`.
- **New (h3) teardown nulls the node.** After unmount, a stale `apply()` must not measure. Concrete failure mode: fact 1 above — React never calls `ref(null)` any more, so an implementation that relies on it leaves `nodeRef.current` pointing at a detached node.
- **New (h12) the `ResizeObserver` callback actually re-measures, on BOTH observed targets.** Round-2 finding 1, and it exposes a hole that predates this arc. Case (d) (`tests/components/admin/useFitWithinClip.test.tsx:204`) records which elements are observed and then **throws the constructor callback away** — its stub declares `observe`, `unobserve` and `disconnect` and never stores the function it was constructed with. Nothing in the repo ever invokes that callback. Proven by planting the mutant rather than by argument: with the hook's `new ResizeObserver(coalescer.schedule)` replaced by `new ResizeObserver(() => {})`, all four suites that touch this hook stay green.

  ```
  $ pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx \
      tests/components/admin/showpage/attentionMenu.test.tsx \
      tests/components/admin/PublishedToggle.test.tsx tests/components/ReSyncButton.test.tsx
  Tests  86 passed (86)
  ```

  Three of the hook's four re-measure signals have behavioural cases — `window` resize by (f), `transitionend` by (e)/(e2)/(g4), a `reapplyKey` change by (c). The fourth, the one covering a resizing panel and a growing band, has none. **This arc must not inherit that hole**, because the observer wiring is exactly what moves from the layout effect into the ref callback: a mis-wire there would be invisible to every case above. (h12) captures the callback the hook hands the constructor, invokes it once for the clip ancestor and once for the positioned ancestor, and asserts the cap re-derives from the NEW geometry each time. Concrete failure mode: mutant M11, `new ResizeObserver(() => {})`, which today kills nothing.
- **New (h15), (h16), (h17) — one case per shipped lifecycle, both modes.** (h17) asserts TWO snapshots, not one: the attach, and then the totals after flushing the entrance frame, against §0.1 and §0.1a respectively. Round-5 finding 1 was that a single cumulative assertion there is unsatisfiable without suppressing the entrance re-attach, which is load-bearing. Round-4 finding 1. §0.1 has three rows because there are three consumer shapes, and a table with three rows pinned by cases modelling one of them is the same defect the round charged. (h15) drives the `ReSyncButton` shape (no key, node behind a flag on the same owner), (h16) the `PublishedToggle` shape (the key IS the mounting condition, so both change in one commit), and (h17) the `AttentionMenuPanel` shape (node present at the panel's first render, key flips after mount). Each asserts renders, applies and walks for its row, bare and under `<StrictMode>`, against the exact numbers in §0.1 — including the one cell that regresses, which (h15) pins at 2 rather than pretending it is 1. Concrete failure mode: any implementation that improves one lifecycle by pessimising another, which every previous version of this suite would have reported as success.
- **New (h13) the Strict Mode replay is measured, not discovered later.** Round-3 finding 1. The suite renders its harness bare, so nothing in it would have shown that a cleanup-returning ref opts into React 19's replay and doubles `apply()` in development. (h13) mounts the conditional-host harness inside `<StrictMode>` and asserts the replay's counts EXACTLY — two applies per appearance, and two owner renders where the current code takes four. It pins the cost in the direction it actually moves rather than asserting it away, so a future change that makes the replay worse is visible. Concrete failure mode: any implementation that measures a third time under replay, or that regresses the render halving this arc's main win depends on.
- **New (h14) the conditional-host shape, bare.** Retained as the minimal statement of the arc's headline, and deliberately narrower than (h15)-(h17): it asserts one render per appearance on the plainest shape, which is the assertion mutant M12 exists to break. (h14) is the existing harness with the overlay behind a flag, asserting one apply and one walk per appearance and — the load-bearing one — ONE owner render pass where the counter takes two. Concrete failure mode: reintroducing any state update on the attach path, which is the defect `BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE` actually names once its premise is corrected.
- **New (h8) `reapplyKey`-change counts, and (h9) unchanged-key counts.** Round-1 finding 1, and the sharpest of the round: §0.1's table is the acceptance condition and only its MOUNT row had a pin. Case (c) (`tests/components/admin/useFitWithinClip.test.tsx:193`) checks the cap after a key change and counts nothing, and no case re-rendered with an UNCHANGED key at all. (h8) asserts one apply and one walk across a key change; (h9) asserts zero of each across a re-render that changes nothing. Concrete failure mode, and it is not hypothetical: a ref callback whose identity churns every render — the exposure §7 documents — re-attaches and re-measures on every render while satisfying every other assertion in this suite, because every other assertion is about a single mount. Four cells of the acceptance table were unfalsifiable; these two cases close all four. Both run on the existing always-present harness, which is why (h14) exists alongside them.

A test that only proves `apply` was called is worthless here: the whole subject is **how many times**. Every new case asserts a count or an absence, and each names the mutant it kills.

### §5.2 — Real browser

jsdom computes no layout, so the containment claim in §3 cannot be settled there.

**On which surfaces, corrected.** An earlier draft named "the `ReSyncButton` band" here. That file cannot drive it: `tests/e2e/popover-clip-fit.spec.ts` builds exactly two live entries, `tests/e2e/_pillFocusLiveEntry.tsx` and `tests/e2e/_publishedToggleClipLiveEntry.tsx` (`tests/e2e/popover-clip-fit.spec.ts:44-46`), and `rg -ln 'ReSyncButton' tests/e2e/ | rg popover-clip-fit` returns nothing. The pin lands on the two surfaces that exist there — the `AttentionMenu` scroller and the `PublishedToggle` banner — both of which consume this hook. A third live entry for `ReSyncButton` would be a new harness, not a pin, and its three overlays call the identical hook.

**What the new case adds that the two existing containment cases (`tests/e2e/popover-clip-fit.spec.ts:310`, `tests/e2e/popover-clip-fit.spec.ts:565`) do not.** Both existing containment cases measure AFTER settle, so a second after-settle assertion would be redundant with them. The property this refactor puts at risk is the FIRST PAINTED FRAME: the measure moved from the owner's layout effect to ref-attach, and the only reason it is synchronous at all is that an overlay must never be painted uncapped. So the new case samples on EVERY frame from first appearance, under `emulateMedia({ reducedMotion: "reduce" })` so the entrance transform cannot distort a sampled rect, and asserts containment on all of them. **Its premise must assert ARMING, not merely sampling.** Round-4 finding 2: "at least one frame was sampled" permits sampling to begin after the overlay has already corrected itself, which would make this case a slower copy of the two after-settle cases above. So the sampler records a row on every frame INCLUDING frames where the node is absent, and the case asserts, in this order:

1. the recording contains at least one ABSENT row BEFORE its first present row — an executable statement that the recorder preceded the appearance;
2. at least one PRESENT row exists, so the containment loop is not vacuous;
3. every present row satisfies `overlayBottom <= clipBottom + 0.5`.

This repo already states the requirement, in prose, on its one existing sampler
(`tests/e2e/section-header-reconcile.layout.spec.ts:117-119`), quoted verbatim:

```
THE RECORDER IS ARMED BEFORE THE CLICK. Sampling that starts after the event
has already been dispatched can miss the first frames — exactly the frames a
short tween lives in — and would make the oracle pass for the wrong reason.
```

Round 4's finding was that this spec asked for a sampler without carrying that requirement.
Assertion 1 is that prose made executable, which is the whole difference between a contract and a
comment.

Both the overlay rect and the clip rect are read in **one** `page.evaluate` per measurement. `boundingBox()` is viewport-relative and Playwright actionability scrolls before it measures, so two separate reads can be taken against two different scroll positions and manufacture a phantom overlap. Tolerance is 0.5px, matching the existing containment cases.

Existing containment cases (`tests/e2e/popover-clip-fit.spec.ts:310`, `tests/e2e/popover-clip-fit.spec.ts:565`) and the anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:720-754`) stay green, untouched.

### §5.3 — Gates

`pnpm heavy` wraps every full or directory-scoped vitest run and every `pnpm test:e2e`. Each gate runs as its own command; vitest strips types, so a green suite proves nothing about `pnpm typecheck`.

---

## §6 — Consequence bound, probe domain, threat fence

Carried verbatim into every review brief for this arc.

**Consequence bound.** Every overlay this hook serves is capped correctly on mount and on every re-measure signal — all four of them, the `ResizeObserver` arm included, which round 2 found had no behavioural case at all — or the miss is surfaced by the existing floor-clamp diagnostic (`useFitWithinClip.ts:118-131`). Correct or signaled, never silently wrong: there is no third outcome, and that is the acceptance posture rather than a wish. A conservative fit plus a surfaced warning is a DOCUMENTED LIMIT, not a finding. The arc is done when every cell of the §0.1 table — both modes, both columns — holds its stated count and no overlay in the probe domain is capped wrongly without the diagnostic firing — a finite, measured condition, not an absence of imaginable inputs.

**Probe domain.** The five live call sites, across three components — `components/admin/ReSyncButton.tsx:111-113` (three of them), `components/admin/PublishedToggle.tsx:132`, `components/admin/showpage/AttentionMenu.tsx:72` — plus the fixtures in `tests/components/admin/useFitWithinClip.test.tsx` and `tests/e2e/popover-clip-fit.spec.ts`. A probe outside that set, or more than one ordinary edit from an input in it, files to documented limits.

**Threat fence.** Ordinary React mount and re-measure sequences on the shipped admin surfaces. Adversarial DOM reparenting, synthetic ancestor chains no route builds, and browsers without `ResizeObserver` beyond the existing feature detection (`components/admin/useFitWithinClip.ts:165-166`) are out of scope and file to documented limits.

## §7 — Documented limits

- **An unstable `reapplyKey`** (a fresh object or array each render) re-attaches every render. No consumer does this; every call site passes a primitive or omits the argument (§2.2). The exposure is identical to today's, where `reapplyKey` was an effect dependency compared the same way. Re-file trigger: a consumer that passes a non-primitive.
- **The ancestor chain is resolved once per attach for observation purposes.** If an overlay is reparented without a `reapplyKey` change or a resize, the observed clip ancestor is stale until the next signal. This is today's behaviour, unchanged — `apply()` still re-walks on every invocation, so the *measurement* is never stale, only the *subscription*. Reparenting a live overlay is outside the threat fence.
- **The `PublishedToggle` anchor room is unmeasured**, recorded at `lib/layout/fitWithinClip.ts:38-43` with an open row. Untouched.
- **`AnchoredPortal` measures three times per open**, §4.2, filed as `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`.
- **`ReSyncButton`'s development `apply()` count goes 1 to 2.** ONE consumer of three, in ONE mode: it is the only shape that measures once today, and the cleanup-returning ref opts it into Strict Mode's replay. `PublishedToggle` holds at 2 and `AttentionMenu` improves 3 to 2 (§0.1). Production is unaffected on all three — the replay is absent from React's production client build entirely (§0.1's grep over the two installed `react-dom` bundles, which are untracked `node_modules` artifacts rather than repo files) — so no admin ever pays it, but a developer profiling a Re-sync overlay in `next dev` sees two forced reflows where they saw one. Accepted deliberately against render passes halving on all three consumers in both modes. Pinned exactly by (h15) so it cannot drift further. Re-file trigger: a third apply under replay on any consumer, or React changing the replay's scope.
- **A clip-status change with no signal is stale until the next signal.** With a stable ref and an unchanged `reapplyKey`, a re-render does not re-measure, even if an ancestor's `overflow` changed in that same commit (§3.1's probe). The cap corrects on the next `window` resize, `transitionend` or `ResizeObserver` callback. This is today's behaviour, unchanged by this arc — the current layout effect is keyed the same way — and it is bounded by the fact that an ancestor's overflow changing is itself almost always a resize or a class change that trips one of those signals. Re-file trigger: a consumer that toggles an ancestor's `overflow` from state without any accompanying geometry change.
- **Shape 2 is bounded to its named resolver.** §4.1's scope derivation excludes a second call site of `findClippingAncestor`, and the manual sweep covers the two sibling measure surfaces the popover registry names. A module that resolves some OTHER value inside a measure function and re-resolves it in the same run is not excluded by any command here; settling that repo-wide is dataflow analysis, which `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:30-33` already rules out for a structural cover. Re-file trigger: a second measure surface adopting the resolve-then-re-resolve pattern, which the popover registry would name as it is added.
- **The measure now precedes the owner's layout effects.** Moving it from the owner's layout effect to the ref attach makes it EARLIER in the same commit. What it now precedes is empty today on both counts: no consumer declares a `useLayoutEffect` (`rg -n 'useLayoutEffect' components/admin/ReSyncButton.tsx components/admin/PublishedToggle.tsx components/admin/showpage/AttentionMenu.tsx` returns nothing), and all five refs sit on a plain `<div>` in their hook-owner's own JSX with no intervening component boundary, read at each site — where for `AttentionMenu` that owner is `AttentionMenuPanel`, not `AttentionMenu` (§0.1). A future consumer adding a geometry-mutating layout effect in the same commit would have it run AFTER the measure rather than before. Re-file trigger: any `useLayoutEffect` appearing in a file that calls `useFitWithinClip`.
- **The coalescer's `.cancel()` is a registered obligation, not just good hygiene.** `components/admin/useFitWithinClip.ts` is registered as a consumer of `createRafCoalescer` with `requiresCancelAdoption: true` (`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:120-125`), whose comment states the reason: so a future local `requestAnimationFrame` plus frame-id bookkeeping inside the hook fails there rather than quietly reintroducing the per-event forced reflow. The coalescer moves into the ref callback and its `.cancel()` moves with it.

## §8 — Invariants

| # | Applies how |
| --- | --- |
| 1 TDD | Failing test, minimal implementation, passing test, commit, per task |
| 5 no raw codes in UI | The dev diagnostic stays `clientLog("debug", …)`, console-only (`components/admin/useFitWithinClip.ts:118-131`) |
| 6 commit per task | Conventional commits, scope `admin` |
| 8 impeccable dual-gate | UI surface touched. `/impeccable critique` **and** `/impeccable audit`, both externally attested, `impeccable-gate:` marker present |
| 11 isolated worktree | All edits in `../FX-worktrees/layoutmeasure` |
| 12 declared claims | Both rows marked at Stage 0 and pushed; markers come off in the PR's last commit |

Invariants 2, 3, 4, 9 and 10 do not apply: no DB, no email boundary, no sync cursor, no Supabase call site, no mutation surface.
