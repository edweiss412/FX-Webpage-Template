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

### §0.1 — Baseline, measured not asserted

Probe: the existing jsdom harness shape from `tests/components/admin/useFitWithinClip.test.tsx` (a `fitted` node inside `inner` inside a clipping `outer`), counting `getBoundingClientRect` on the fitted node (one per `apply()`, `components/admin/useFitWithinClip.ts:96`) and `getComputedStyle` on the two ancestors. Run 2026-08-25 against `origin/main` at `449f29fab`:

```
PROBE-BASE-MOUNT   applies=2  ancestorGCS=8
PROBE-BASE-REAPPLY applies=1  ancestorGCS=4
PROBE-BASE-NOOP    applies=0
```

The chain is two ancestors deep, so `ancestorGCS / 2` is the walk count. A re-render that changes nothing already costs nothing, and must keep costing nothing. The table below is the single record of the rest; no other section restates these figures.

The same probe against the §2 shape:

```
PROBE-MOUNT          applies=1  ancestorStyleReads=2 [inner,outer]
PROBE-REAPPLY        applies=1  ancestorStyleReads=2
PROBE-NOOP-RERENDER  applies=0
```

| Event | Applies (before → after) | Ancestor walks (before → after) |
| --- | --- | --- |
| Mount | 2 → **1** | 4 → **1** |
| `reapplyKey` change | 1 → **1** | 2 → **1** |
| Re-render, nothing changed | 0 → 0 | 0 → 0 |

Half the forced reflows on mount, and three quarters of the ancestor walks. Nothing regresses.

### §0.2 — Why it is worth doing

`apply()` forces a synchronous reflow — it clears the caps, reads three rects, writes a cap (`components/admin/useFitWithinClip.ts:90-111`) — and it is a **layout** effect, so every one of those reflows is on the path to the first paint of the overlay. Three overlays in `ReSyncButton` alone (`components/admin/ReSyncButton.tsx:111-113`), one in `PublishedToggle` (`components/admin/PublishedToggle.tsx:132`), one in `AttentionMenu` (`components/admin/showpage/AttentionMenu.tsx:72`). The `AttentionMenu` case pays twice over: its `reapplyKey` is the entrance flag, so opening the menu is a mount plus a key change — the sum of the first two rows of the table below, on both sides of the arrow.

---

## §1 — What ships

One **source** file changes: `components/admin/useFitWithinClip.ts`. Its unit suite gains a walk-count control and two lifecycle arms, and updates the one assertion that pins the old count. `tests/e2e/popover-clip-fit.spec.ts` gains a real-browser containment assertion, because jsdom computes no layout and the whole subject is a measurement. `BACKLOG.md` carries the two in-progress markers (removed in the last commit) and gains the §4.2 row. No other production file is touched.

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

Four facts the design depends on, each read directly off that transcript:

1. **A returned cleanup is called, and `ref(null)` is not.** No `node=null` attach appears anywhere. So the teardown must null `nodeRef.current` itself; the old code got that for free from the `ref(null)` call.
2. **The ref attaches before the owner's layout effect.** The measure therefore happens no later than it does today, and still before paint. No consumer has a competing layout effect that mutates geometry: none of the three consumer files declares a `useLayoutEffect` at all — `rg -n 'useLayoutEffect' components/admin/ReSyncButton.tsx components/admin/PublishedToggle.tsx components/admin/showpage/AttentionMenu.tsx` returns nothing.
3. **A stable ref identity produces no churn.** The `rerender same k` block logs nothing at all. This is what makes `reapplyKey` safe as a dependency: an unchanged key re-renders without detaching.
4. **An identity change detaches and re-attaches, in that order.** So `reapplyKey` in the dependency list reproduces the old effect-dependency behaviour exactly: teardown, re-measure, re-wire. This arc changes how often the mount path measures, never what a `reapplyKey` change means.

Fact 4 is why `reapplyKey` stays a dependency of a callback that does not read it. ESLint says so out loud — `react-hooks/exhaustive-deps` reports `unnecessary dependency: 'reapplyKey'` (a warning, not an error: the CI step is `run: pnpm lint` with no `--max-warnings`, `.github/workflows/quality.yml:36`). The dependency is load-bearing and the rule cannot see why, so the implementation carries a targeted `eslint-disable-next-line react-hooks/exhaustive-deps -- <reason>` in the repo's established `--`-reason form, and the reason names fact 4. Silencing it repo-wide, or dropping the dependency, are both wrong: without it a `reapplyKey` change stops re-measuring and case (c) goes red.

### §2.2 — Guard conditions, per input

The hook has one parameter and one runtime input.

| Input | Value | Behaviour | Pinned by |
| --- | --- | --- | --- |
| `reapplyKey` | omitted (`undefined`) | Stable across renders, so the ref never re-attaches. One measure per mount. | `ReSyncButton.tsx:111-113` uses this arm; case (g) |
| `reapplyKey` | changes between renders | Detach, re-measure, re-wire. Unchanged from today. | case (c), `tests/components/admin/useFitWithinClip.test.tsx:193` |
| `reapplyKey` | unchanged between renders (any type) | Nothing happens. `Object.is` identity is React's own dependency comparison, not ours. | §0.1 `PROBE-NOOP-RERENDER applies=0` |
| `reapplyKey` | an unstable object or array literal | Re-attach on every render — one measure and one walk per render. Same exposure as today, where it was an effect dependency with the same comparison. No consumer does this; every call site passes a primitive or omits the argument. | §4.1 sweep |
| ref `node` | an `HTMLElement` | Measure, wire, return teardown. | every case |
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

The hook is a four-state machine over one node. States: **U** unattached, **F** attached and fitted, **N** attached with no clipping ancestor, **D** detached. Twelve ordered pairs exist; six are reachable and each is a row below, followed by the compound rows. The other six are unreachable by construction and are named rather than elided: nothing ever returns to **U** (a hook instance's node is attached once per attach cycle, and a detach goes to **D**, never back to unattached), so `F → U` and `N → U` cannot occur; and **D** is terminal for that attach cycle — a subsequent attach is a fresh cycle starting from **U** — so `D → U`, `D → F`, `D → N` and `U → D` cannot occur either.

| Pair | Treatment |
| --- | --- |
| U → F | Instant, synchronous, pre-paint. One `apply()`, one walk. The whole point: no animation, no frame. Case (g2) pins that no frame is scheduled |
| U → N | Instant. `apply()` finds no clip and removes `max-height` rather than writing one. Case (b) |
| F → N | Instant. The stale fit is **removed**, not retained. Family A pin `tests/components/admin/useFitWithinClip.test.tsx:368` |
| N → F | Instant. The fit derives from the declared cap, not from an absent one. Family B pin `tests/components/admin/useFitWithinClip.test.tsx:380` |
| F → D | Teardown: disconnect observer, remove both listeners, cancel any pending frame, null the node ref. Case (g3) `tests/components/admin/useFitWithinClip.test.tsx:305` |
| N → D | Same teardown. No observer was created for the clip, so `disconnect()` on the (possibly null) observer is the only difference, already guarded by `observer?.` |
| **Compound:** `reapplyKey` changes while a coalesced frame is pending | The detach cancels the pending frame (`coalescer.cancel()`), the re-attach measures synchronously. The stale frame can never land on the new wiring, because each attach owns its own coalescer instance |
| **Compound:** unmount while a coalesced frame is pending | Case (g3). The frame is cancelled, so `apply()` never runs against a detached node |
| **Compound:** `reapplyKey` changes in the same commit that attaches the node | The ref callback runs once with the new key's identity — there is no second pass, because the identity change and the first attach are one attach. Costs one measure, where today it costs two |
| **Compound:** a `transitionend` arrives mid-teardown | The listener is removed before `coalescer.cancel()`, so a late event cannot schedule after the cancel |

Nothing here animates. Every transition is instant by design: this hook exists to write a cap **before** the browser paints, and any easing on the cap itself would be a visible resize of a panel the user is already reading.

---

## §4 — Class sweep

Shapes swept, stated as the ledger rows state them:

- **Shape 1** — a state counter that exists only to re-run an effect a late-mounting ref should have driven.
- **Shape 2** — a value resolved inside `apply()` that the effect body re-resolves in the same run.

### §4.1 — Result: the class is one file

```
$ rg -n --glob '*.ts' --glob '*.tsx' 'useState\(0\)|useState<number>\(0\)|attachCount' components app lib
components/admin/useFitWithinClip.ts:77   const [attachCount, setAttachCount] = useState(0);
components/admin/useFitWithinClip.ts:201  }, [attachCount, apply, reapplyKey]);
components/admin/useFitWithinClip.ts:207  setAttachCount((n) => n + 1);
components/auth/AvatarMenu.tsx:98         const [activeIndex, setActiveIndex] = useState(0);
components/crew/primitives/CopyFactValue.tsx:374  const [seenClipboardWrite, setSeenClipboardWrite] = useState(0);
app/admin/settings/admins/AddAdminForm.tsx:38     const [formKey, setFormKey] = useState(0);
app/admin/show/[slug]/ShareTokenContext.tsx:68    const [remoteTokenChanges, setRemoteTokenChanges] = useState(0);
components/admin/nav/useBellBadge.ts:65           const [pingSignal, setPingSignal] = useState(0);
components/admin/showpage/PublishedReviewModal.tsx:504  const [freshBatch, setFreshBatch] = useState(0);
components/diagrams/Gallery.tsx:114               const [openNonce, setOpenNonce] = useState(0);
```

All seven peers are something else: a selected index (`AvatarMenu`), an acknowledged-sequence watermark written from an effect (`CopyFactValue`, `components/crew/primitives/CopyFactValue.tsx:402`), a remount key (`AddAdminForm`), a remote-change signal (`ShareTokenContext`, `useBellBadge`), a batch counter (`PublishedReviewModal`), and an open nonce (`Gallery`). None is written from a ref callback, so none is shape 1. The check that decides that is not the `useState` line but the writer:

```
$ rg -n --glob '*.ts' --glob '*.tsx' -U 'ref=\{\(node' components app lib
components/agenda/AgendaPdfViewer.tsx:266
components/diagrams/Gallery.tsx:346
```

Both write a ref map (`pageRefs.current[i] = node`, `thumbRefs.current.set(item.id, node)`) and set no state. **Shape 1 is present exactly once in the repo, and that instance is the one this arc removes.**

```
$ rg -n --glob '*.ts' --glob '*.tsx' 'findClippingAncestor' components app lib
components/admin/useFitWithinClip.ts:48   function findClippingAncestor(...)
components/admin/useFitWithinClip.ts:91   const clip = findClippingAncestor(el);
components/admin/useFitWithinClip.ts:161  const clip = findClippingAncestor(node);
```

The function is module-private and has two call sites, both in this file. **Shape 2 is present exactly once**, and `components/admin/useFitWithinClip.ts:161` is it.

`components/admin/showpage/ShareHub.tsx` was swept as a nominated peer: one layout effect (`components/admin/showpage/ShareHub.tsx:403`) calling `applyPlacement()` once (`components/admin/showpage/ShareHub.tsx:409`) and wiring subscriptions, plus an unrelated lifecycle-close effect (`components/admin/showpage/ShareHub.tsx:648`). No counter, no re-resolved value, no double measure. Clean.

### §4.2 — `AnchoredPortal`: probed, real, and deferred with a named reason

`components/admin/AnchoredPortal.tsx` carries neither declared shape — its `mounted` flag (`components/admin/AnchoredPortal.tsx:93`) is an SSR gate for `createPortal`, not a ref-attach trigger, and `measureAndApply` resolves nothing the effect bodies re-resolve. But the nomination was worth probing, and the probe found something:

```
PROBE closedReads=0 measureRunsOnOpenCommit=3
```

Counting anchor-rect reads (one per `measureAndApply`, `AnchoredPortal.tsx:141`) across a closed → open transition: **three measures per open**. Two layout effects both cover the open commit — the gated one at `components/admin/AnchoredPortal.tsx:191` and the deliberately ungated every-commit one at `components/admin/AnchoredPortal.tsx:254` — and the `setApplied` those produce re-renders, firing `components/admin/AnchoredPortal.tsx:254` a third time before the placement converges.

That is the same consequence as this arc's rows and a **different mechanism**. Repairing it means changing when `components/admin/AnchoredPortal.tsx:254` fires, and `components/admin/AnchoredPortal.tsx:245-253` documents at length why it is unconditional: it is the only subscription that catches a position-only anchor move, which `ResizeObserver` explicitly does not report. The third run is a convergence step of that design, not a stray call. Unpicking it is a redesign of a placement loop this PR does not otherwise touch, with its own e2e geometry suite (`tests/e2e/rowactions-geometry.spec.ts`) and its own viewport-source registry (`tests/components/admin/_metaPopoverViewportSource.test.ts`).

**Filed as `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN` under class-sweep exception (c)** — a redesign of a surface this PR does not otherwise touch — with the probe above as its evidence. Product-facing: three measurement passes, each forcing a synchronous reflow, on every row-actions menu open is shipped admin behaviour. The row does not assert what the converged number should be; deciding that is the work. "Same defect, different file" is explicitly not the reason; the reason is that the repair is a different design decision on a surface with its own contract.

---

## §5 — Verification

### §5.1 — Unit

`tests/components/admin/useFitWithinClip.test.tsx`. Every existing case stays. The spike ran all 15 against the §2 shape: **14 pass unchanged**, and the one failure is the assertion this arc exists to move.

- **(g) mount count.** `expect(afterMount).toBe(2)` at `tests/components/admin/useFitWithinClip.test.tsx:281` becomes `toBe(1)`, and the comment above it (`tests/components/admin/useFitWithinClip.test.tsx:276-279`) stops citing a row that no longer exists — it explains instead that one attach is one measure, and that the count is pinned so a regression to two is visible rather than absorbed into the coalescing delta below it. The coalescing deltas in the rest of (g) (`tests/components/admin/useFitWithinClip.test.tsx:288`, `tests/components/admin/useFitWithinClip.test.tsx:292`) are unchanged and stay green.
- **(g2) synchronous mount.** Unchanged, stays green. This is the pin that stops the refactor drifting the measure into a frame.
- **New (h) walk control.** Counts `getComputedStyle` calls on **ancestors only** across one mount — the fitted node's own declared-cap read is excluded, so the number is the walk and nothing else. The assertion is stated in ancestor-call units and its expected value is **derived from the harness's own chain**: the walk visits every ancestor up to and including the first non-`visible` overflow, which in this fixture is `inner` then `outer`, so one walk is `ANCESTORS_TO_CLIP.length` calls. Never hardcoded, so deepening the fixture cannot silently satisfy it. Concrete failure modes caught, in the same units: restoring the effect body's second walk doubles it; regressing the attach mechanism to two measures doubles it again.
- **New (h2) null-node arm.** Calls the returned ref callback with `null` directly and asserts it neither measures nor throws. Concrete failure mode: a teardown-only implementation that assumes a non-null node crashes on any consumer still passing `null`.
- **New (h3) teardown nulls the node.** After unmount, a stale `apply()` must not measure. Concrete failure mode: fact 1 above — React never calls `ref(null)` any more, so an implementation that relies on it leaves `nodeRef.current` pointing at a detached node.

A test that only proves `apply` was called is worthless here: the whole subject is **how many times**. Every new case asserts a count or an absence, and each names the mutant it kills.

### §5.2 — Real browser

jsdom computes no layout, so the containment claim in §3 cannot be settled there. `tests/e2e/popover-clip-fit.spec.ts` gains one case asserting the §3 invariant after the refactor, on both live surfaces: the `AttentionMenu` scroller and the `ReSyncButton` band.

Both the overlay rect and the clip rect are read in **one** `page.evaluate` per measurement. `boundingBox()` is viewport-relative and Playwright actionability scrolls before it measures, so two separate reads can be taken against two different scroll positions and manufacture a phantom overlap. Tolerance is 0.5px, matching the existing containment cases.

Existing containment cases (`tests/e2e/popover-clip-fit.spec.ts:310`, `tests/e2e/popover-clip-fit.spec.ts:565`) and the anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:720-754`) stay green, untouched.

### §5.3 — Gates

`pnpm heavy` wraps every full or directory-scoped vitest run and every `pnpm test:e2e`. Each gate runs as its own command; vitest strips types, so a green suite proves nothing about `pnpm typecheck`.

---

## §6 — Consequence bound, probe domain, threat fence

Carried verbatim into every review brief for this arc.

**Consequence bound.** Every overlay this hook serves is capped correctly on mount and on every re-measure signal, or the miss is surfaced by the existing floor-clamp diagnostic (`useFitWithinClip.ts:118-131`). A conservative fit plus a surfaced warning is a documented limit, not a finding.

**Probe domain.** The five live call sites, across three components — `components/admin/ReSyncButton.tsx:111-113` (three of them), `components/admin/PublishedToggle.tsx:132`, `components/admin/showpage/AttentionMenu.tsx:72` — plus the fixtures in `tests/components/admin/useFitWithinClip.test.tsx` and `tests/e2e/popover-clip-fit.spec.ts`. A probe outside that set, or more than one ordinary edit from an input in it, files to documented limits.

**Threat fence.** Ordinary React mount and re-measure sequences on the shipped admin surfaces. Adversarial DOM reparenting, synthetic ancestor chains no route builds, and browsers without `ResizeObserver` beyond the existing feature detection (`components/admin/useFitWithinClip.ts:165-166`) are out of scope and file to documented limits.

## §7 — Documented limits

- **An unstable `reapplyKey`** (a fresh object or array each render) re-attaches every render. No consumer does this; every call site passes a primitive or omits the argument (§2.2). The exposure is identical to today's, where `reapplyKey` was an effect dependency compared the same way. Re-file trigger: a consumer that passes a non-primitive.
- **The ancestor chain is resolved once per attach for observation purposes.** If an overlay is reparented without a `reapplyKey` change or a resize, the observed clip ancestor is stale until the next signal. This is today's behaviour, unchanged — `apply()` still re-walks on every invocation, so the *measurement* is never stale, only the *subscription*. Reparenting a live overlay is outside the threat fence.
- **The `PublishedToggle` anchor room is unmeasured**, recorded at `lib/layout/fitWithinClip.ts:38-43` with an open row. Untouched.
- **`AnchoredPortal` measures three times per open**, §4.2, filed as `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`.

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
