# `useFitWithinClip` measure class — one attach, one walk

**Date:** 2026-08-25 · **Branch:** `feat/fitwithinclip-measure-class` · **Implementer:** Opus / Claude Code (AGENTS.md hard rule: everything in scope is under `components/`)

Closes `BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE` (`BACKLOG.md:659`) and `BL-FITWITHINCLIP-DOUBLE-ANCESTOR-WALK` (`BACKLOG.md:682`). Both rows name the same trigger — a refactor of the hook's attach mechanism — on the same effect body, so they are one arc.

Parent spec for the hook itself: `docs/superpowers/specs/2026-08-01-admin-popover-overlay-cluster.md` §4.1/§4.2.

---

## §0 — What is wrong, measured

`components/admin/useFitWithinClip.ts` caps an overlay so a clipping ancestor cannot cut it off. It does that correctly. It does it more times than it needs to.

Two mechanisms, both on the mount path:

1. **The attach counter.** The hook holds the node in a ref and a counter in state (`useFitWithinClip.ts:77`). The ref callback writes the node and bumps the counter (`components/admin/useFitWithinClip.ts:204`, `components/admin/useFitWithinClip.ts:207`); the counter is an effect dependency (`components/admin/useFitWithinClip.ts:201`), so the layout effect runs, measures, and then runs again when the bump lands. The counter exists for a real reason — these overlays mount long after their owner, so an effect keyed on the ref alone would run once with `null` and never wire the observers up — but React 19 lets a ref callback return a cleanup, which is the mechanism the counter was standing in for. The installed React is `19.2.4` (root `package.json`, `dependencies.react`), and §2.1 probes that behaviour against it rather than inferring it from a version string.

2. **The second ancestor walk.** `apply()` walks to the clip ancestor inside `withNaturalSize` (`components/admin/useFitWithinClip.ts:91`), and the effect body walks the same chain again immediately afterwards to decide what to observe (`components/admin/useFitWithinClip.ts:161`). Each walk calls `getComputedStyle` on every ancestor up to the first non-`visible` overflow.

The two compound: each of the two mount measures drags its own pair of walks along.

### §0.1 — Baseline, measured per consumer, because there are three shapes and not one

This section was rewritten three times before it was right, and the round-economy filing at
`docs/review-rounds/feat/fitwithinclip-measure-class/449f29faba03.md` records how. What follows is
what is true, measured from the components rather than modelled.

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
change, and the key change re-attaches. The attach table alone cannot describe that. Same probe, with
the entrance frame flushed:

| `AttentionMenu` | before | after |
| --- | --- | --- |
| bare, at attach | 2 / 2 / 4 | **1 / 1 / 1** |
| bare, after the entrance flip | 3 / 3 / 6 | **2 / 2 / 2** |
| Strict Mode, at attach | 4 / 3 / 6 | **2 / 2 / 2** |
| Strict Mode, after the entrance flip | 6 / 4 / 8 | **4 / 3 / 3** |

Every stage improves on every metric. **The re-attach on the key flip is load-bearing and must not be
suppressed to flatter a count**: the `scale-95` entrance distorts the measured rect and the settled
cap is what the second pass computes (`components/admin/showpage/AttentionMenu.tsx:69-72`).
Suppressing it would leave the transformed geometry stale without tripping the floor-clamp
diagnostic, which is the silent-wrong outcome §6 forbids. (h17) therefore asserts both snapshots
separately rather than one cumulative number.

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

`apply()` forces a synchronous reflow — it clears the caps, reads two rects and one computed style, writes a cap (`components/admin/useFitWithinClip.ts:90-111`) — and it is a **layout** effect, so every one of those reflows is on the path to the first paint of the overlay. Three overlays in `ReSyncButton` alone (`components/admin/ReSyncButton.tsx:111-113`), one in `PublishedToggle` (`components/admin/PublishedToggle.tsx:132`), one in `AttentionMenu` (`components/admin/showpage/AttentionMenu.tsx:72`). The `AttentionMenu` case pays twice over: its `reapplyKey` is the entrance flag, so opening the menu is an appearance plus a key change, and it pays its §0.1 attach row and its §0.1a entrance row together.

---

## §1 — What ships

One **source** file changes: `components/admin/useFitWithinClip.ts`. Its unit suite gains the cases §5.1 enumerates, and updates the one assertion that pins the old count. §5.1 is the single list; this sentence does not restate its size or its contents. `tests/e2e/popover-clip-fit.spec.ts` gains a real-browser containment assertion, because jsdom computes no layout and the whole subject is a measurement. `BACKLOG.md` carries the two in-progress markers (removed in the last commit) and gains the §4.2 row. No other production file is touched.

## §1.1 — Resolved scope — do not relitigate

Each of these is settled. A reviewer verifies the citation rather than re-deriving the decision.

| Decision | Ratified at | Note |
| --- | --- | --- |
| The mount measure is **synchronous** and deliberately bypasses the raf coalescer | `useFitWithinClip.ts:140-144`; pinned by case (g2), `tests/components/admin/useFitWithinClip.test.tsx:296-303` | Deferring it to a frame reintroduces the uncapped painted frame the layout effect exists to prevent. Removing a redundant measure is in scope. Making the surviving one async is not. |
| `apply()` re-walks on **every** invocation | `BACKLOG.md:682` | The ancestor chain can change between measures. Only the effect body's own second walk is redundant, and only for the run that just called `apply()`. §2 hoists that one walk and nothing else. |
| `transitionend` is scoped to the positioned ancestor **and** to `propertyName === "transform"` | `useFitWithinClip.ts:171-188`; pinned by (e2) `tests/components/admin/useFitWithinClip.test.tsx:236` and (g4) `tests/components/admin/useFitWithinClip.test.tsx:342` | Both narrowings are deliberate and documented in place. Unchanged by this arc. |
| `MIN_FITTED_HEIGHT = 48` wins over available room | `lib/layout/fitWithinClip.ts:51`, rationale at `lib/layout/fitWithinClip.ts:29` | Not this arc. |
| The `PublishedToggle` anchor room is **unmeasured on purpose** | `lib/layout/fitWithinClip.ts:38-43` | A documented limit with an open row (`BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED`, `BACKLOG.md:808`), not a finding. The docblock recording it is not edited by this arc. |
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

**Row 2, the walk.** `apply()` returns the clip ancestor it already resolved, and the ref callback observes that value instead of walking again. `apply()` still walks on every invocation — it must, per §1.1 — and the returned value is only ever used by the caller that just triggered that walk, which is exactly the redundancy `BACKLOG.md:682` describes.

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

**`reapplyKey` is not the only variable**, and a re-render's outcome is decided by the PAIR: did the
key change, and did the node's presence change. Round 10 caught these rows stated over the key alone;
round 11 caught a cell missing from the hand-written list. So the table is now **generated from the
cross product rather than enumerated** — 2 key states × 2 before × 2 after — and a missing cell is
impossible by construction. The probe is committed at
`docs/superpowers/specs/2026-08-25-fitwithinclip-key-node-matrix.probe.tsx`; its output, verbatim:

```
MX key=unchanged node=stays-absent  []
MX key=unchanged node=appears       ["attach","apply"]
MX key=unchanged node=disappears    ["cleanup"]
MX key=unchanged node=stays-present []
MX key=CHANGED   node=stays-absent  []
MX key=CHANGED   node=appears       ["attach","apply"]
MX key=CHANGED   node=disappears    ["cleanup"]
MX key=CHANGED   node=stays-present ["cleanup","attach","apply"]
MX CELLS=8 (2 key x 2 from x 2 to = 8, complete by construction)
```

**One cell in eight does a detach-and-reattach**, and it is the only one: a changed key with the node
still present. Every other cell is at most one operation. That is the whole behaviour, and it is
worth stating as one sentence because six rounds of prose about `reapplyKey` never did.

| `reapplyKey` | Node presence | Behaviour | Pinned by |
| --- | --- | --- | --- |
| unchanged | stays absent | Nothing | (h18) |
| unchanged | appears | One attach, one measure | (h14), (h15) |
| unchanged | disappears | Teardown only | (h3), (h21) |
| unchanged | stays present | **Nothing at all** — the control that catches an identity-churning callback | (h9) |
| changed | stays absent | Nothing. The callback identity changed and no node ever received it | (h18) |
| changed | appears | One attach, one measure. **NOT detach-then-attach** — nothing was attached. `PublishedToggle`'s shipped first-error case, where the key IS the mounting condition | (h16) |
| changed | disappears | Teardown only. `PublishedToggle`'s shipped CLOSE path: submitting again clears the error (`components/admin/PublishedToggle.tsx:116-117`), and the one boolean drops both the key and the banner in the same commit | (h16), second half |
| changed | stays present | Teardown, attach, measure — the `X → D → Y` route, and the only cell that takes it | (c), (h17) |

The `reapplyKey` VALUE matters only for the identity comparison React does on the callback, which is
`Object.is` and not ours. Two further value cases:

| `reapplyKey` value | Behaviour | Pinned by |
| --- | --- | --- |
| omitted (`undefined`) | Stable forever, so the ref never re-attaches on a re-render. `ReSyncButton` uses this arm | (g), and (h13) for the Strict Mode replay |
| an unstable object or array literal | A fresh identity every render, so every render is a detach-and-attach. No consumer does this — the hook is exported from one module and its call sites are enumerable: `rg -n 'useFitWithinClip\(' components app lib` returns SIX lines, five call sites (three passing nothing, two passing a boolean) plus the declaration itself at `components/admin/useFitWithinClip.ts:69`. Same exposure as today, where `reapplyKey` was an effect dependency compared the same way | (h9), whose zero-cost assertion is the only thing in the suite that can see it |

And the two ref-node cases:

| ref `node` | Behaviour | Pinned by |
| --- | --- | --- |
| an `HTMLElement` | Measure, wire, return the teardown | every case |
| `null` | Return without measuring or wiring. Unreachable under React 19 cleanup refs (fact 1), retained because the `RefCallback` type admits it and returning `undefined` is what React expects there | (h2) |

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

Every row below is measured, not reasoned: a probe walks each edge and the table is written from its
transcript. This section took four rounds to get right and the filing records why; what follows is
the result.

States over one node: **U** unattached, **F** attached and capped against a clip, **N** attached with
nothing clipping, **D** detached.

**Which counter, and why it matters.** Counting `apply()` by counting
`getBoundingClientRect` on the fitted node. That proxy is sound only on a CLIPPING chain: `apply()`
returns before reading the fitted rect when nothing clips
(`components/admin/useFitWithinClip.ts:91-96`), so on the no-clip path it reports zero for a run that
happened. The probe below counts walk entries instead, and reports both so the divergence is visible:

```
EDGE U->N_attach            realApplies=1 fittedRectReads=0 constructed=1 observed=[["inner"]]           disconnected=0 cap=""
EDGE N->D_unmount           realApplies=1 fittedRectReads=0 constructed=1 observed=[["inner"]]           disconnected=1 cap="<gone>"
EDGE U->F_attach            realApplies=1 fittedRectReads=1 constructed=1 observed=[["outer","inner"]]   disconnected=0 cap="322px"
EDGE F->N_rerender_only     realApplies=1 fittedRectReads=1 constructed=1 observed=[["outer","inner"]]   disconnected=0 cap="322px"
EDGE F->N_after_signal      realApplies=2 fittedRectReads=1 constructed=1 observed=[["outer","inner"]]   disconnected=0 cap=""
EDGE N->F_after_signal      realApplies=3 fittedRectReads=2 constructed=1 observed=[["outer","inner"]]   disconnected=0 cap="322px"
EDGE D->N_before            realApplies=1 fittedRectReads=1 constructed=1 observed=[["outer","inner"]]   disconnected=0 cap="322px"
EDGE D->N_after_key_change  realApplies=2 fittedRectReads=1 constructed=2 observed=[["outer","inner"],["inner"]] disconnected=1 cap=""
```

Four things the table rests on, all read off that transcript. A stable-ref re-render changes nothing
(`F->N_rerender_only` holds the cap at `322px` after the chain stopped clipping), so **`F ↔ N` is
driven only by a re-measure signal**. Those signals do fire and do the right thing
(`F->N_after_signal` removes the cap, `N->F_after_signal` writes it back). **State N still holds an
observer** — no clip to watch, but the positioned ancestor is watched regardless
(`components/admin/useFitWithinClip.ts:167-170`), `constructed=1 observed=[["inner"]]`, and the
teardown disconnects it. And a `reapplyKey` change is **`X → D → Y` when a node was already attached** — `constructed=2
disconnected=1` with two distinct observed sets. When nothing was attached it is a plain attach with
no D at all (§2.2's matrix, `CHANGED_KEY_AND_NODE_APPEARS`), which is `PublishedToggle`'s shipped
first-error case. Round-10 finding 1 caught this stated without its condition.

| Edge | Mechanism | Pinned by |
| --- | --- | --- |
| U → F | The attach, on a clipping chain | (g), (g2), (h) |
| U → N | The attach, with nothing clipping | (b) |
| F → D | Detach: host unmount, or the cleanup half of a re-attach | (g3), (h3) |
| N → D | Detach from the unclipped state. An observer DOES exist here — it watches the positioned ancestor even with no clip — and the teardown disconnects it | (h21) |
| D → F | Attach half of a re-attach, clipping | (c) — a `reapplyKey` flip with `clips` true throughout |
| D → N | Attach half of a re-attach onto a chain that no longer clips: a fresh observer watching the positioned ancestor only, and the stale cap removed | (h22) |

**N is two states, not one, and the difference is the subscription.** N reached by ATTACHING to a non-clipping chain observes the positioned ancestor alone. N reached from F by a signal still observes the OLD clip ancestor, because the subscription is fixed at attach. Round 12 caught this collapsed into one row. It changes no cap in either direction — `apply()` re-walks — but it is why `BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION` exists, and why (h19)'s guarantee is "the cap is correct at this signal" rather than "the overlay is now correctly subscribed".
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
| The key and the node drop together | Teardown only, no re-attach — `PublishedToggle`'s close path, §2.2's `changed / disappears` cell. The one boolean gates both |
| A re-render with a stable ref while the DOM's clip status changes | **Nothing happens**, deliberately — the probe above. The cap corrects on the next signal. This is a documented limit, §7, not a defect |

Nothing here animates. Every transition is instant by design: this hook exists to write a cap
**before** the browser paints, and easing the cap itself would be a visible resize of a panel the
user is already reading.

## §4 — Class sweep

Shapes swept, stated as the ledger rows state them:

- **Shape 1** — a state counter that exists only to re-run an effect a late-mounting ref should have driven.
- **Shape 2** — a value resolved inside `apply()` that the effect body re-resolves in the same run.

### §4.1 — Result: the class is one file, on a cover the type checker derives

**Shape 2 derives by SCOPE.** `findClippingAncestor` is declared `function` at `components/admin/useFitWithinClip.ts:48` and
exported nowhere in the source tree:

```
$ rg -n --glob '*.ts' --glob '*.tsx' 'export.*findClippingAncestor' components app lib
(no match, exit 1)
```

The globs and roots are load-bearing, not decoration: unscoped, that pattern matches this spec, its
plan, and a ledger fixture that quotes them, so the unscoped form establishes nothing. Round-9
finding 2 caught the unscoped version being printed here as if it returned nothing. A module-private binding cannot be called from outside its module, so enumerating
its call sites within that one file is exhaustive by construction rather than by pattern. There are
two: `components/admin/useFitWithinClip.ts:91` inside `apply()`, and
`components/admin/useFitWithinClip.ts:161` in the effect body, which is the instance this arc
removes.

What that does NOT establish, because it is worth stating rather than re-deriving: scope privacy
bounds calls to THIS resolver and says nothing about a different module resolving some other value
inside a measure function and re-resolving it in the same run. Settling that repo-wide is dataflow
analysis, which this repo has already ruled out for a structural cover
(`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:30-33`). §7 carries the residue
as a documented limit.

**Shape 1 derives from the TYPE CHECKER, and the check is a command rather than a pasted roster.**
Two earlier drafts enumerated spellings and each missed a family the next round found. The committed
probe asks a different question — does this `ref=` expression's TYPE have a call signature — which no
spelling can evade:

```
$ node docs/superpowers/specs/2026-08-25-fitwithinclip-ref-callable-probe.mjs
```

It prints every callable site with its type, and **reconciles its own counts**: callable plus
non-callable equals the total `ref=` attributes found, so a silent truncation is visible rather than
plausible. Measured 2026-08-25 against `origin/main@449f29faba03`: 18 callable of 120, verified
independently by review rounds 6 and 8.

**The roster is deliberately NOT pasted here.** It carries line numbers across `components/`,
`app/` and `lib/`, and any UI merge moves them — two landed while this spec was in review. A pasted
roster goes stale on someone else's commit and then reads as this arc's error; a command does not go
stale. Run it.

**Its positive control survives the edit that blinds a grep.** With `useFitWithinClip`'s explicit
`RefCallback<HTMLElement>` return annotation removed, the probe still finds all 18 sites, reporting
the inferred `(node: HTMLElement | null) => void` instead of the declared type. The checker sees the
call signature whether or not anyone wrote it down.

**The classification, which is what the conclusion rests on: 8 + 5 + 4 + 1 = 18.** Eight author a
callback in place and every one writes to a ref map or array and sets NO state (four in
`ShowReviewSurface`, two in `AvatarMenu`, one in `AgendaPdfViewer`, one in `Gallery`). Five are this
hook's own consumers, which are instances of the shape's FIX rather than of the shape. Four are
pass-throughs that author no callback at all — two forwarding a `forwardRef` parameter, two
forwarding a prop — so any callback reaching them was authored at a caller's `ref=` site, which the
same enumeration already covers. One is `emblaRef`, third-party. **Shape 1 is present exactly once,
and that instance is the one this arc removes.**

**Documented limit of the shape-1 cover.** It ranges over expressions the checker can type as
callable at a `ref=` attribute. A callback assembled some other way — built by a factory and spread
through `{...props}` — would not appear. That is the threat fence working rather than a gap in it:
the fence is ordinary authoring on the shipped admin surfaces. Re-file trigger: a ref callback
reaching a DOM node by any route other than a literal arrow or a callable-typed value at `ref=`.

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

`tests/components/admin/useFitWithinClip.test.tsx`. **Every existing case stays**, and the spike ran
all 15 against the §2 shape: 14 pass unchanged, and the one failure is case (g)'s `toBe(2)`, the
assertion this arc exists to move.

**Two harnesses, and the table's second column names which each case uses** — round-9 finding 1 caught this sentence promising a mapping the table did not carry. The existing `Harness` attaches its ref at its
owner's first render — which is `AttentionMenuPanel`'s shape, not `ReSyncButton`'s or
`PublishedToggle`'s. A second harness puts the overlay behind a flag, for the cases that must speak
about those. Reading a count without knowing its harness is how §0.1 went wrong twice.

| Case | Harness | Pins | Its mutant |
| --- | --- | --- | --- |
| (g), amended | always-present | Mount apply count is 1, not 2. The assertion the ledger row made executable; its comment stops citing a row this branch closes | M1 |
| (h) | always-present | One attach is ONE ancestor walk. Ancestor `getComputedStyle` calls only, expected value derived from the harness's own chain, never typed | M2, M7 |
| (h2) | always-present | The ref callback with `null`: no measure, no throw. Unreachable under React 19 cleanup refs but the type admits it | M4 |
| (h3) | always-present | The teardown nulls the node, so a stale `apply()` after unmount cannot measure. React no longer calls `ref(null)`, so this is not free any more | M3, M13 |
| (h8), (h9) | always-present | The two re-render rows of §2.2's matrix — key changed with the node still present, and nothing changed at all. (h9) is the ONLY case that can see an identity-churning callback, because every other assertion is about a single attach | M10 |
| (h12) | always-present | The `ResizeObserver` callback actually re-measures. That arm had NO behavioural case at all; case (d) discards the constructor callback | M11 |
| (h13) | conditional, in `<StrictMode>` | Strict Mode's replay counts, asserted EXACTLY — including `ReSyncButton`'s dev apply going to 2, pinned as 2 rather than wished down to 1 | M13 |
| (h14) | conditional | One owner render per appearance on the plainest live shape. The arc's headline in its minimal form | M12 |
| (h16) | `PublishedToggle` key-is-the-condition | BOTH directions of that shape — first error (key changes AND node appears: one attach, no detach) and close (key changes AND node disappears: teardown only), §2.2's two `changed` cells that are not `X → D → Y` — **AND its §0.1 counts in both modes**, renders included. Round 12 caught the directional half shipping alone: a mutant doing one extra owner render passes attach/apply/cleanup and fails §0.1's render row, so the directional assertions cannot stand in for the counts | M21, M12 |
| (h15), (h17) | the remaining two lifecycles: `ReSyncButton` conditional, `AttentionMenuPanel` always-present | One case per shipped lifecycle (§0.1), both modes. (h17) asserts TWO snapshots — the attach, then the totals after the entrance frame (§0.1a) | M14, M17 |
| (h18) | hook called, ref never attached | The hook called with its ref NEVER attached — `PublishedToggle`'s default `card` variant. Zero applies, zero walks, no throw | M16 |
| (h19), (h20) | always-present, driven by a signal | The two SIGNAL-driven edges. Each asserts the re-render changed nothing FIRST, then signals and asserts the cap appears (h19) or is removed (h20) | M18, M19 |
| (h21), (h22) | always-present, unclipped | State N still holds an observer on the positioned ancestor, and the teardown disconnects it. Four rounds of this inventory claimed otherwise | M20 |

**Every numbered id USED in §3.1's tables is DEFINED above, and a committed checker settles it:**

```
$ python3 docs/superpowers/specs/2026-08-25-fitwithinclip-case-id-parity.py
```

It exits non-zero on a dangling id, reads only §3.1's table rows, and strips backticked spans — so
the sentence naming `(h4)` and `(h10)` in order to reject them does not trip it. Without that
use-versus-mention distinction the checker flags the paragraph explaining the defect, which is how a
guard teaches people to ignore it.

**The counting proxy has a stated domain.** Counting `apply()` via `getBoundingClientRect` on the
fitted node is valid ONLY where the chain clips: on the no-clip path `apply()` returns before reading
that rect (`components/admin/useFitWithinClip.ts:91-96`) and the proxy reports zero for a run that
happened. §0.1 and §0.1a are unaffected — every shape they measure clips — but any case asserting a
count on an unclipped path counts walk entries instead, and says so in place.

A test proving only that `apply` was called is worthless here: the subject is **how many times**.
Every case above asserts a count or an absence, and each names the mutant that must turn it red. The
mutants themselves, with their run procedure, live in the plan.

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

**Consequence bound.** Every overlay this hook serves is capped correctly on mount and on every re-measure signal that is DELIVERED — all four arms, the `ResizeObserver` one included, which round 2 found had no behavioural case at all — or the miss is surfaced by the existing floor-clamp diagnostic (`useFitWithinClip.ts:118-131`).

**The qualifier is not a softening, it is the weaker fact stated verbatim, and round 12 is why.** The SUBSCRIPTION set is resolved once per attach and never updated, so an ancestor that starts clipping after the attach is never observed and its resizes deliver nothing: the cap corrects on the next signal from some other source and then goes stale, uncapped by anything and unreported by the diagnostic, which does not fire because the geometry is not floor-clamped. That outcome is neither correct nor signaled. **It is identical on the current hook and on the §2 shape — byte-for-byte in the probe — so it is pre-existing and untouched by this arc**, and it is filed as `BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION` with that transcript. The probe is committed at `docs/superpowers/specs/2026-08-25-fitwithinclip-stale-subscription.probe.tsx`; run it against either hook and the output is the same. This arc's bound therefore covers the measure path, which is its subject, and says so rather than claiming a guarantee the hook does not provide. Correct or signaled, never silently wrong: there is no third outcome, and that is the acceptance posture rather than a wish. A conservative fit plus a surfaced warning is a DOCUMENTED LIMIT, not a finding. The arc is done when every cell of §0.1's per-consumer table and §0.1a's entrance table holds its stated count and no overlay in the probe domain is capped wrongly without the diagnostic firing — a finite, measured condition, not an absence of imaginable inputs.

**Probe domain.** The five live call sites, across three components — `components/admin/ReSyncButton.tsx:111-113` (three of them), `components/admin/PublishedToggle.tsx:132`, `components/admin/showpage/AttentionMenu.tsx:72` — plus the fixtures in `tests/components/admin/useFitWithinClip.test.tsx` and `tests/e2e/popover-clip-fit.spec.ts`. A probe outside that set, or more than one ordinary edit from an input in it, files to documented limits.

**Threat fence.** Ordinary React mount and re-measure sequences on the shipped admin surfaces. Adversarial DOM reparenting, synthetic ancestor chains no route builds, and browsers without `ResizeObserver` beyond the existing feature detection (`components/admin/useFitWithinClip.ts:165-166`) are out of scope and file to documented limits.

## §7 — Documented limits

- **An unstable `reapplyKey`** (a fresh object or array each render) re-attaches every render. No consumer does this; every call site passes a primitive or omits the argument (§2.2). The exposure is identical to today's, where `reapplyKey` was an effect dependency compared the same way. Re-file trigger: a consumer that passes a non-primitive.
- **The ancestor chain is resolved once per attach for observation purposes.** If an overlay is reparented without a `reapplyKey` change or a resize, the observed clip ancestor is stale until the next signal. This is today's behaviour, unchanged — `apply()` still re-walks on every invocation, so the *measurement* is never stale, only the *subscription*. Reparenting a live overlay is outside the threat fence.
- **The `PublishedToggle` anchor room is unmeasured**, recorded at `lib/layout/fitWithinClip.ts:38-43` with an open row. Untouched.
- **`AnchoredPortal` measures three times per open**, §4.2, filed as `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`.
- **`ReSyncButton`'s development `apply()` count goes 1 to 2.** ONE consumer of three, in ONE mode: it is the only shape that measures once today, and the cleanup-returning ref opts it into Strict Mode's replay. `PublishedToggle` holds at 2 and `AttentionMenu` improves 3 to 2 (§0.1). Production is unaffected on all three — the replay is absent from React's production client build entirely (§0.1's grep over the two installed `react-dom` bundles, which are untracked `node_modules` artifacts rather than repo files) — so no admin ever pays it, but a developer profiling a Re-sync overlay in `next dev` sees two forced reflows where they saw one. Accepted deliberately against render passes halving on all three consumers in both modes. Pinned exactly by (h15) so it cannot drift further. Re-file trigger: a third apply under replay on any consumer, or React changing the replay's scope.
- **A clip-status change is stale in the CAP until the next signal, and stale in the SUBSCRIPTION until the next attach.** With a stable ref and an unchanged `reapplyKey`, a re-render does not re-measure, even if an ancestor's `overflow` changed in that same commit (§3.1's probe). The cap corrects on the next `window` resize, `transitionend` or `ResizeObserver` callback. **The subscription does not** — an ancestor that starts clipping after the attach is never observed, so its own resizes deliver nothing and the corrected cap then goes stale silently. An earlier draft of this limit said "stale until the next signal", which was false about the second half; round 12 caught it. Both halves are today's behaviour, unchanged by this arc and byte-identical in the probe, and the second is filed as `BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION`. Re-file trigger: a consumer that toggles an ancestor's `overflow` from state, or one whose clip ancestor is not the review-modal panel.
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
