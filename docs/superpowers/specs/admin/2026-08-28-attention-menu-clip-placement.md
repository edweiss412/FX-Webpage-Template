# The attention menu joins the placement stack, and the last viewport-sized overlay stops overhanging its clip

**Row:** `BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW`
**Branch:** `fix/attention-panel-left-overflow`
**Facing:** product · **Severity:** MEDIUM · **Effort:** M
**Probe evidence:** filed with the row, reproduced in the tree at
`tests/e2e/wizard-attention-menu.spec.ts:265` as a running assertion. §1.2 records
what this arc re-measured and what it took on the filing's authority.

The row offered two candidate directions and marked neither as decided. Both are
declined here, and not on taste: the repair they describe is **already written,
already reviewed, and already shipped on five other overlays**. The attention
menu is the last overlay in the tree that does not use it. §2 is the evidence for
that claim; §3 is what it makes the fix.

---

## 1. What is wrong

### 1.1 Resolved scope — do not relitigate

Each row is settled, with the evidence that settles it. Verify the citation
rather than re-deriving the decision.

| Decision | Status | Ratification |
| --- | --- | --- |
| A width cap does not fix this; the x-clamp does. | RESOLVED on measurement, §2.1. `maxWidth` is `null` at the failing viewport — the cap is inert, not merely insufficient. | Probe §1.3; `lib/popover/position.ts:118`, `lib/popover/position.ts:137-138` |
| Direction is migration onto the shared stack, not a new cap on the old hook. | RESOLVED. The attention menu is the last `useFitWithinClip` consumer; the stack is where the algebra lives. | §2.2; `lib/popover/place.ts:54`; hook spec `docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md:233` |
| `AnchoredPortal` is the wrong vehicle. | RESOLVED. It passes `hostRect: null`, so bounds degenerate to the viewport and containment is lost. | §2.3(D); `components/admin/AnchoredPortal.tsx:147` |
| Portaling into the host does not break Escape, outside-click, or the focus trap. | RESOLVED by mechanism, §3.2. | `components/admin/showpage/AttentionMenu.tsx:365-369`, `components/admin/showpage/AttentionMenu.tsx:380`; `components/admin/showpage/ShareHub.tsx:878-880` |
| The published byte baseline is EXPECTED to move. | RATIFIED at filing; in scope here. | Row's `Class-sweep exception (c)` and the arc brief; §8 |
| The 375 e2e case is a running characterization, not a `test.fixme`. | RESOLVED against the arc brief's description. Nothing to un-skip. | `tests/e2e/wizard-attention-menu.spec.ts:255-265` |
| No `BL-` rows are filed for the swept peers. | RESOLVED. Every other hit fails the discriminator on a fact, not on effort — there is nothing deferred. | §5 |
| Retiring the hook is in scope. | PROPOSED, not ratified — the one open scope call. §3.4 states the case and the alternative. | §3.4 |

### 1.2 The mechanism

The panel is `absolute top-[calc(100%+8px)] right-0 … w-[min(400px,calc(100vw-32px))]`
(`components/admin/showpage/AttentionMenu.tsx:405`). Two independent facts about
that one class string put the left edge outside the clip:

- **It is sized against the VIEWPORT.** `100vw` is the layout viewport, not the
  room the panel actually has. Inside a review modal the panel's clipping
  ancestor is the `ReviewModalShell` panel, which is inset from the viewport on
  both sides, so `100vw - 32px` overstates the available width by roughly the
  modal's own margins.
- **It is anchored right, to the pill wrapper, whose right edge is inset from the
  clip's right edge.** So the panel grows leftward from a point that is already
  inside the clip, and the overflow lands entirely on the LEFT.

`useFitWithinClip` does not catch it. The hook caps `max-height` and nothing else,
by design — it is applied to the inner scroller
(`components/admin/showpage/AttentionMenu.tsx:422`, `components/admin/showpage/AttentionMenu.tsx:426`), not to the outer
panel that carries the width.

The row states the constraint the CSS cannot express: *"no wider than the distance
from the clip's left edge to my anchor's right edge"* is a runtime measurement,
and no static `calc()` can name it.

### 1.3 The numbers, re-measured at this branch's head

Re-measured 2026-08-28 on `fix/attention-panel-left-overflow`, real Chromium, via
the standalone harness (`tests/e2e/standalone.config.ts` — no app boot, no
database, so this needed no local stack). Temporary probe added, read, reverted;
the working tree is clean.

**Settled geometry, after the entrance transition completes (`transform: none`):**

| Viewport | `menu.left` | `menu.right` | `menu.width` | `clip.left` | `clip.right` |
| --- | --- | --- | --- | --- | --- |
| 375x667 | **-36** | 307 | 343 | 0 | 375 |
| 1280x800 | 684 | 1084 | 400 | 128 | 1152 |

**The same probe mid-entrance, while `scale-95` is still applied:**

| Viewport | `menu.left` | `menu.width` |
| --- | --- | --- |
| 375x667 | **-18.850006103515625** | 325.85 |
| 1280x800 | 704 | 380 |

**This resolves the filing's two numbers into one defect.** The row records
`-18.85` on the wizard and `-36.00` on the published surface and reads them as the
defect being *"worse on the shipped surface."* It is not. They are the same
overhang measured at two different moments of the same animation:
`343 x 0.95 = 325.85`, and with `origin-top-right` the right edge stays pinned at
307, so `307 - 325.85 = -18.85`. The wizard figure was taken before the entrance
settled. **Settled, both surfaces overhang by 36px.**

Two consequences, both load-bearing:

- The filed comparison between surfaces should not be carried into review as
  evidence of anything. Corrected here rather than repeated.
- `tests/e2e/wizard-attention-menu.spec.ts:231` measures a **transient** state. Its
  assertions are true of a frame that lasts one transition, not of the panel at
  rest. §6.1 and §7 treat that as part of the repair, not as incidental.

The settled arithmetic is worth checking by hand, because §2.1 turns on it:
`307 - 343 = -36`. The panel's left edge is its anchor's right edge minus its own
width. Nothing else is involved.

### 1.4 Why nothing caught it

`tests/e2e/popover-clip-fit.spec.ts:332` is named *"the menu never crosses the
panel's clip edge"* and reads only `panelBottom` and `menuBottom`. **The suite has
never evaluated a horizontal edge for the menu.** The name promises containment;
the body asserts one dimension of it. That gap is why a 36px overhang lived on a
shipped surface with a dedicated clip-fit suite pointed straight at it.

The wizard suite did look horizontally, and still under-reported: it measures
mid-entrance (§1.3), so the number it recorded as the defect's size is 0.95 of the
real one. Neither suite was wrong about *whether* the panel overhangs. Between
them they were wrong about which edges are checked, and about when.

---

## 2. Why this is a migration, not a new width cap

### 2.1 The algebra already exists, and it is not the one the row guessed

`lib/popover/position.ts` computes placement against a `bounds` rect. Two steps
matter:

```js
// position.ts:118, step 2, width
const maxWidth = naturalSize.width > bounds.width ? bounds.width : null;

// position.ts:137-138, step 4, horizontal
let x = align === "right" ? trigger.right - effectiveWidth : trigger.left;
x = Math.min(Math.max(x, bounds.left), bounds.right - effectiveWidth);
```

`bounds` is the clip: `insetRect(intersectRects(hostRect ?? viewport, viewport), VIEWPORT_INSET)`
(`lib/popover/place.ts:103`).

**Line 138 is the fix, and line 118 is not.** Substituting the measured numbers
from §1.3 at the failing viewport:

```
clip        = [0, 375]                        (measured)
bounds      = inset(clip ∩ viewport, 8) = [8, 367],  width 359
naturalSize.width = 343                       (measured, settled)
trigger.right     = 307                       (measured)

step 2:  maxWidth = 343 > 359 ? 359 : null    →  null      ← no cap fires
step 4:  x = 307 - 343 = -36
         x = min(max(-36, 8), 367 - 343)  =  8            ← the clamp fixes it
         right = 8 + 343 = 351 ≤ 367 ✓
```

**The width cap is INERT here, not merely insufficient.** At 375 the panel (343)
is already narrower than the clip bounds (359), so `maxWidth` evaluates to `null`
and no width cap of any kind is written. A cap cannot repair an overhang caused by
where the panel *starts*.

This is the declination record for the row's candidate (A), and it is stronger
than the arithmetic this spec carried in its first draft. That draft argued a cap
would move the left edge from -36 to about -20 — still failing, so still wrong,
but wrong for the wrong reason. The probe in §1.3 refutes it: the clip at 375 is
the **full viewport** (0..375), not the inset ~343 the draft assumed, so the cap
does not narrow the panel at all. **Recorded rather than quietly corrected**,
because the -20 figure was reported to the orchestrator before the probe ran and
should not survive anywhere as a reason to reconsider width-capping.

The general statement: any cap derived from the clip's WIDTH is the wrong quantity.
The constraint is the distance from the clip's left edge to the anchor's RIGHT
edge (`307 - 8 = 299`), which is smaller than both the clip width and the panel's
natural width, and which no static `calc()` can name. `Math.max(x, bounds.left)`
enforces it directly by moving the panel instead of shrinking it.

Desktop is untouched by the same arithmetic: `x = max(1084 - 400, 136) = 684`,
which is exactly the measured settled `menu.left`, and `maxWidth` is again `null`.
AC-5 is therefore an identity, not an approximation.

### 2.2 Five overlays already use it; the attention menu is the last that does not

`placeWithinVisibleViewport` consumers today:

| Consumer | Placement call | Applies `maxWidth` |
| --- | --- | --- |
| `components/admin/HoverHelp.tsx` | `components/admin/HoverHelp.tsx:234` | `components/admin/HoverHelp.tsx:297` |
| `components/admin/PublishedToggle.tsx` | `components/admin/PublishedToggle.tsx:268` | `components/admin/PublishedToggle.tsx:307` |
| `components/admin/ReSyncButton.tsx` | `components/admin/ReSyncButton.tsx:206` | `components/admin/ReSyncButton.tsx:243` |
| `components/admin/showpage/ShareHub.tsx` | `components/admin/showpage/ShareHub.tsx:304` | `components/admin/showpage/ShareHub.tsx:356` |
| `components/admin/AnchoredPortal.tsx` | `components/admin/AnchoredPortal.tsx:146` | `components/admin/AnchoredPortal.tsx:289` |

And the holdouts on `useFitWithinClip`, in the whole tree:

| Consumer | Call |
| --- | --- |
| `components/admin/showpage/AttentionMenu.tsx` | `components/admin/showpage/AttentionMenu.tsx:338` |

That is the entire list. The hook's own spec says so independently, while
documenting an unrelated limit: L-5 is *"unreachable on **the one live
consumer**, whose declared cap is `max-h-96`"*
(`docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md:233`).

The migration is a tracked program, not an inference of this arc:

- `lib/popover/place.ts:54` — *"The overlays migrating onto this stack leave that
  hook behind."*
- `docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md:41`
  — *"The other two migrated onto `placeWithinVisibleViewport`."*
- `tests/components/admin/_metaPopoverViewportSource.test.ts:183` — the refusal
  banner's migration, recorded in a registry that **derives its consumer list from
  source**, so a new consumer fails the meta-test by default rather than being
  silently exempt.

**The defect and the holdout are the same fact.** The attention menu overhangs its
clip because it is the last overlay still positioning itself with CSS against the
viewport instead of with measurement against its host. Every overlay that migrated
stopped being able to have this bug. That is the argument for the direction: the
repair is not "add a width cap to the attention menu", it is "finish the
migration", and the bug closes as a consequence.

### 2.3 The declined alternatives, fenced in both directions

Recorded here so neither side is relitigated, per the disagreement-loop rule.

- **(A) Extend `useFitWithinClip` (or a sibling) to cap width.** DECLINED on
  arithmetic, not on style: §2.1 shows a width cap leaves the left edge at -20.
  To work it would have to compute the anchor-to-clip-edge distance and clamp —
  which is `lib/popover/position.ts:137-138`, re-implemented in a second place, against the
  explicit trajectory of `lib/popover/place.ts:54`. A reviewer proposing this should be shown
  the -20 arithmetic first.
- **(B) Re-anchor the panel to the modal panel rather than the pill wrapper.**
  DECLINED. This is the migration described in vaguer terms: "anchor to the modal
  panel" is what `hostRect` already means. Adopting it bespoke would produce a
  sixth hand-rolled variant of a solved problem.
- **(D) Use `AnchoredPortal`.** DECLINED, and this one is a real trap.
  `AnchoredPortal` portals to `document.body` and passes `hostRect: null`
  (`components/admin/AnchoredPortal.tsx:147`), which the `place.ts` contract
  degenerates to the viewport. Bounds would be the viewport, so the menu would be
  fully visible but free to overhang the modal panel's edges — it would satisfy
  "not cut off" while breaking the containment the suite actually asserts
  (`menu.right <= clip.right`, `tests/e2e/wizard-attention-menu.spec.ts:272`).
  `AnchoredPortal` is right for the dashboard rows it was built for, where the
  viewport IS the bound. It is wrong here.

---

## 3. The design

Follow the ShareHub precedent exactly. It is the closest existing case: the same
host, the same modal, the same overflow edge, and its own code comment describes
this defect being closed for it
(`components/admin/showpage/ShareHub.tsx:876-882`) — *"Placement bounds the body by
that host's rect, so it can no longer overhang the panel's `overflow-clip` edge."*

### 3.1 Host

`ReviewModalShell` already provides the host, and it is the very element the tests
measure as the clip:

```jsx
<PopoverHostContext.Provider value={panelRef}>   // ReviewModalShell.tsx:643
```

So `useContext(PopoverHostContext)` inside the attention menu frame yields the
clip rect with **no new plumbing on either modal**, and both review modals get the
fix from one change — the shared-frame requirement the row and the arc brief both
set. The context is defined at `components/admin/HoverHelp.tsx:77` and falls back
to `document.body` where no provider exists, which is the correct degenerate
behavior for any future unclipped mount.

### 3.2 Portal target, and why portaling is safe here

The panel portals **into the host**, not to `document.body`. ShareHub's comment
states the reason and it applies unchanged: the host portal *"keeps the dialog
inside the shell's focus trap, aria-modal subtree and inert handling"*
(`components/admin/showpage/ShareHub.tsx:878-880`).

Three semantics a reviewer will reasonably worry about, and why each survives:

- **Outside-click.** `isOutside` tests `panelRef.current.contains(target)` and
  `pillRef.current?.contains(target)`
  (`components/admin/showpage/AttentionMenu.tsx:365-369`). Both are DOM
  containment checks against live nodes; neither depends on where the panel sits
  in the tree.
- **Escape.** The handler is a document-level CAPTURE listener
  (`components/admin/showpage/AttentionMenu.tsx:380`). Capture at `document`
  is unaffected by the node's position.
- **Focus trap.** The host IS `ReviewModalShell`'s `panelRef`, so the portaled
  panel lands inside the trapped subtree, not outside it.

**Coordination note.** `arc-escrace` is live on this component's Escape behavior
(`escTransparentUntilEngaged`, `components/admin/showpage/AttentionMenu.tsx:93`,
ratified 2026-08-28). This design does not touch the Escape handler, the engagement
tracking, or the inside-set — only where the panel node is mounted and how its
box is sized and positioned. bl-orch has ruled this arc's repair takes priority on
the shared surface; the intent here is that the two changes do not overlap at all.

### 3.3 What is written, and what stops being written

Placement call, matching the four precedents field for field:

```js
placeWithinVisibleViewport(window, {
  hostRect,                       // from PopoverHostContext, null for the body host
  trigger: <pillRef rect>,        // the pill is already a prop
  naturalSize, wrappedHeightAt,   // measured via the shared naturalSize probe
  preferredSide: "bottom",        // matches today's top-[calc(100%+8px)]
  align: "right",                 // matches today's right-0
  warnKey,                        // once-per-overlay dev diagnostic
})
```

Applied to the panel: `left`, `top`, `maxHeight`, and **`maxWidth`** — the last of
these being the one line that is identical in all four precedents
(`components/admin/PublishedToggle.tsx:307`, `components/admin/ReSyncButton.tsx:243`, `components/admin/showpage/ShareHub.tsx:356`,
`components/admin/HoverHelp.tsx:297`).

Removed from the panel:

- `right-0` and `top-[calc(100%+8px)]` — position is now written, not declared.
- `w-[min(400px,calc(100vw-32px))]` — **the last `100vw` read on a clipped,
  non-portaled overlay in the tree** (§5). The 400px natural width is preserved as
  a plain `w-`/`max-w-` on the natural-size measurement, so an uncrowded desktop
  panel is byte-identical in width to today's.
- `useFitWithinClip` and its import (`components/admin/showpage/AttentionMenu.tsx:32`, `components/admin/showpage/AttentionMenu.tsx:338`) — the height cap now comes
  from `placement.maxHeight`.

`origin-top-right` and the entrance transition stay; §7 covers them.

### 3.4 Retiring the hook

Migrating the last consumer makes `components/admin/useFitWithinClip.ts` dead
code. **Disposition: delete it, with its test file, in this PR.**

The reasoning is `subtract-before-you-add`, and one specific hazard: a dead
height-only clip hook left in the tree next to a live placement stack is an
invitation. The next author who needs a clip-aware overlay finds a hook whose name
says exactly what they want, adopts it, and reintroduces this defect — which is
the whole failure mode of keeping a second parallel implementation. Retiring it
also makes the class in §5 empty **by construction** rather than by enumeration.

Two things are explicitly NOT deleted, because they are not dead:

- `lib/layout/fitWithinClip.ts` — `MIN_FITTED_HEIGHT` is imported by
  `lib/popover/place.ts:14` and is load-bearing for the whole stack's diagnostic.
- The hook's spec (`docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md`) — it is a
  record of shipped work, not live documentation. It gains a dated header note
  saying its subject was retired here and pointing at this document. That spec's
  documented limits L-1 through L-7 die with the code; the note says so, so a
  future reader does not go looking for a hook to fix.

**This is the one part of the design whose scope is a judgment call**, and it is
flagged for review rather than asserted: the alternative is leaving the hook and
its suite in place and filing the deletion. That alternative is rejected because
"delete the code nothing calls" is the cheapest possible moment of this work and
the filing would cost a full pipeline to re-earn context we hold for free — the
class-sweep disposition default. If a reviewer disagrees, the disagreement is
about the deletion only; the migration in §3.1-3.3 stands either way.

---

## 4. Files

| File | Change |
| --- | --- |
| `components/admin/showpage/AttentionMenu.tsx` | The frame portals into the host and is placed by the shared module; the viewport-sized width class, `right-0`, and the `useFitWithinClip` call go. |
| `components/admin/useFitWithinClip.ts` | Deleted (§3.4). |
| `tests/components/admin/useFitWithinClip.test.tsx` | Deleted with its subject. |
| `tests/components/admin/_metaPopoverViewportSource.test.ts` | The derived registry discovers a sixth consumer; its exemption/consumer rows are updated to match. |
| `tests/e2e/wizard-attention-menu.spec.ts` | The 375 characterization branch is deleted and the viewport-agnostic `toBeGreaterThanOrEqual` form takes over (§6.1). |
| `tests/e2e/popover-clip-fit.spec.ts` | Gains the horizontal edge the suite never asserted (§6.2). |
| `docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md` | Dated header note recording the retirement. |
| `BACKLOG.md` | Row archived; in-progress marker removed in the PR's last commit. |
| published byte baseline | Regenerated (§8). |

---

## 5. Class sweep

**Shape:** an overlay sized or positioned against the layout viewport while
anchored inside a clipping ancestor that is inset from that viewport.

**Derived cover, not a list.** `_metaPopoverViewportSource.test.ts` already walks
`components/`, `app/` and `lib/` and bans JS layout-viewport reads outside the
placement policy. **It does not scan CSS**, which is exactly how this defect
survived it: `100vw` in a Tailwind class is the same measurement in a channel the
guard does not read. The sweep is therefore
`rg '100vw|100vh|100dvh|100dvw|100svh|100lvh' components app`, and the
discriminator is three conditions that must all hold:

1. right-anchored (or otherwise clip-relative) positioning,
2. NOT portaled out of the clipping ancestor,
3. sized against the viewport.

Every hit, with its disposition:

| Site | Verdict |
| --- | --- |
| `components/admin/showpage/AttentionMenu.tsx:405` | **The defect.** All three conditions hold. Repaired here. |
| `components/auth/AvatarMenu.tsx:388` | Not in class — condition 1 holds, but its clip IS the viewport (header chip, no modal ancestor), so `100vw` is the correct bound. |
| `components/admin/FinalizeButton.tsx:1092` | Not in class — condition 2 fails; it is portaled (`createPortal`, `components/admin/FinalizeButton.tsx:773`), so the viewport is again the correct bound. |
| `components/admin/CleanupAbandonedFinalizeButton.tsx:169` | Not in class — condition 1 fails; a centered `role="dialog"` panel, not anchored to anything. |
| `components/admin/showpage/ShareHub.tsx:906` | Not in class — already on the stack; its `max-w-[calc(100vw-2rem)]` is a redundant CSS belt behind the live JS `maxWidth` at `components/admin/showpage/ShareHub.tsx:356`. Harmless; noted, not touched. |
| `components/diagrams/GalleryLightbox.tsx:999`, `components/diagrams/GalleryLightbox.tsx:1161` | N/A — `sizes="100vw"` is a Next `Image` srcset hint, not layout. |

**These dispositions are static reads and Task 1 confirms them in a browser**
before the class is declared closed. The two that matter are AvatarMenu and
ShareHub, since "its clip is the viewport" and "the CSS belt is redundant" are both
claims about runtime geometry.

**After this change the class is empty by construction**, not by enumeration:
every anchored overlay in the tree is on a stack that measures against
`hostRect ?? viewport`, and the one hook that measured otherwise is gone.

**No peers are deferred, so no `BL-` rows are filed for this class.** Under the
class-sweep disposition rule the default is repair-in-branch; here there is
nothing to repair, because every other hit fails the discriminator on a fact rather
than on effort.

---

## 6. Tests

Both reds exist before any implementation, and neither is written by this arc.

### 6.1 The carrier red is already on disk, running, and inverted on purpose

`tests/e2e/wizard-attention-menu.spec.ts:265`:

```js
expect(box.menu.left).toBeLessThan(box.clip.left);
```

with the instruction, at `tests/e2e/wizard-attention-menu.spec.ts:262-264`: *"WHEN THE ROW IS FIXED THIS FAILS. That is
intended: flip it to the `toBeGreaterThanOrEqual` form the other viewport uses and
delete this branch."*

**Correction to the arc brief, recorded because it changes what Task 1 does.** The
brief describes this case as a `test.fixme` to be re-enabled. It is not — it is a
running characterization assertion, and the file explains at `tests/e2e/wizard-attention-menu.spec.ts:255-261` why a fixme
was deliberately rejected (*"a fixme is listed but never reported"*). The practical
difference: there is nothing to un-skip. The case runs today and goes red the
moment the fix lands, which is a strictly better carrier. The repair is to delete
the `w === 375` branch so both viewports share the containment assertion at `tests/e2e/wizard-attention-menu.spec.ts:270`.

**The case also has to start measuring at rest.** Per §1.3 it reads the panel
mid-entrance, so today it characterizes -18.85 rather than the real -36. Flipping
the assertion without fixing the timing would leave a containment test that passes
on a transient frame — it would still catch this defect, since 8 > 0 either way,
but it would keep asserting the wrong quantity and would not catch a regression
that only appears once the transform settles. The repair is therefore two changes
in one case: wait for `transform: none`, then assert containment at both
horizontal edges. This is the instrument bug named in §1.4, fixed where it lives.

### 6.2 The horizontal edge the clip-fit suite never had

`tests/e2e/popover-clip-fit.spec.ts:332` gains `menu.left >= panel.left` and
`menu.right <= panel.right` alongside its existing bottom assertion, at the
viewports the suite already drives (390x560, and the 375x667 / 375x844 pair it
uses elsewhere). This is the assertion whose absence let a 36px overhang live on
the published surface under a suite named for containment.

**Anti-tautology.** The expected values are derived from the measured clip rect,
never hardcoded, and the assertion is scoped to the menu's own rect rather than to
a container that also renders the pill — so a menu that failed to open cannot pass
by rendering nothing. The case asserts a non-zero `menu.width` first, for exactly
that reason.

### 6.3 Structural

`_metaPopoverViewportSource.test.ts` fails by default on the new consumer, because
its registry is derived from source (`tests/components/admin/_metaPopoverViewportSource.test.ts:183`). That is a second red, and it is the
guard working as designed rather than an obstacle.

### 6.4 Real-browser only

Per the writing-plans layout-dimensions rule: jsdom computes no layout, so every
assertion above is Playwright. **The row exists precisely because nothing asserted
a horizontal edge in a real browser** — a jsdom test here would restate the bug's
own blind spot.

---

## 7. Transition Inventory and dimensional invariants

**Transition inventory.** The panel has two visual states, so there is one pair:

| From → To | Behavior |
| --- | --- |
| closed → open | `opacity-0 scale-95` → `opacity-100 scale-100`, motion-safe, via the existing mount-frame rAF idiom (`components/admin/showpage/AttentionMenu.tsx:405-407`). Unchanged. |
| open → closed | Instant (unmount). Unchanged, and deliberate — the row-click path closes first and lets the jump own the scroll (`components/admin/showpage/AttentionMenu.tsx:14-17`). |

Compound case, and the one thing this change could genuinely break: **the entrance
scale runs while placement is measured, and §1.3 measured exactly how much it
distorts.** At `scale-95` the panel's rect is 325.85 instead of 343 — a 17.15px
under-read of `naturalSize.width`. Feed that to `computePopoverPlacement` and
`x = 307 - 325.85 = -18.85`, clamped to 8; the panel is then placed correctly but
sized from a stale natural width, and nothing re-places it when the transform
settles unless a re-measure is wired.

Today `useFitWithinClip` handles this with `entered` as its re-apply key
(`components/admin/showpage/AttentionMenu.tsx:338`, `components/admin/showpage/AttentionMenu.tsx:417-419`). **The migration must carry an equivalent
re-measure across, and this is the highest-risk part of the change** — it is the
one behavior the old hook had that is not automatic on the new stack. Two
requirements follow:

- The placement re-runs on transition settle, not only at mount. The stack's
  `transitionend` path is the mechanism; `entered` remains the trigger.
- **Measurement must be transform-neutral or taken at rest.** Measuring a scaled
  box is a documented pre-existing limit of the measure path (the hook spec's
  L-8 records the `transform: scale` case as unrepaired). This spec does not fix
  that limit; it avoids depending on it, by re-measuring once `transform` is
  `none`.

Verified by a test that opens the menu and asserts containment **after** the
transition settles, mirroring the existing animated-path case at
`tests/e2e/popover-clip-fit.spec.ts:308` — and, per §6.1, by fixing the wizard case that
currently asserts before it.

### 7.1 Guard conditions

Every input, and what renders when it is absent or degenerate. The stack already
decides most of these; the rows record which behavior is inherited rather than
authored here.

| Input | Degenerate value | Behavior |
| --- | --- | --- |
| `hostRect` (from `PopoverHostContext`) | `null` — no provider, e.g. a future unclipped mount | Bounds degenerate to the viewport (`lib/popover/place.ts:103`, `components/admin/AnchoredPortal.tsx:147` precedent). The panel is placed against the viewport, which is correct when nothing clips it. |
| `hostRect` | zero-area (host `display:none` mid-toggle) | `bounds.width <= 0` → `HIDDEN` (`lib/popover/position.ts:110`); panel is `visibility: hidden`, recovers next frame. |
| `pillRef.current` | `null` (pill unmounted while menu open) | No trigger rect; placement is skipped and the prior placement is cleared rather than left stale — the `resetPlacement` posture at `components/admin/PublishedToggle.tsx:277-281`. |
| trigger rect | zero-area | `HIDDEN` (`lib/popover/position.ts:111`), explicitly guarded on width **and** height — a lesson already paid for on `components/admin/PublishedToggle.tsx:255-266`. |
| `naturalSize` | 0 or non-finite (measured while detached) | `HIDDEN` (`lib/popover/position.ts:105`, `lib/popover/position.ts:109`), recovers on the next frame. |
| `items` | empty array | Out of scope: the menu does not open with zero items, and the pill is not rendered. Unchanged by this spec. |
| `warningIndex` | `undefined` | Unchanged (`components/admin/showpage/AttentionMenu.tsx:58-65`) — the panel is byte-identical to the alerts-only menu. Placement is indifferent to it. |
| viewport | narrower than the panel's minimum usable width | Panel is clamped to `bounds.left` and capped to `bounds.width`; if the resulting height falls under the floor, the stack's dev diagnostic fires (`lib/popover/place.ts:76-99`). Conservative and signaled — §10. |

**Dimensional invariants.** The panel is not a fixed-dimension parent, and the
scroller's height comes from `max-h-96` plus a written cap, so there is no
flex/grid stretch relationship to pin. The invariants that ARE load-bearing are
geometric and are asserted in §6.2 and §9: `menu.left >= clip.left`,
`menu.right <= clip.right`, `menu.bottom <= clip.bottom`, all within 0.5px, in a
real browser.

---

## 8. Published byte baseline

The published surface's geometry changes, so its byte baseline **is expected to
move**. This was the deferral reason at filing and is explicitly in scope here.

Regeneration follows the byte-comparison discipline without exception: from the
pinned Playwright Docker image, with `--platform linux/amd64` on this arm64 host,
**never** from the host directly. A baseline captured on the dev machine differs
from the CI runner's bytes on font hinting and Skia build alone, which is the
documented failure this rule exists for.

---

## 9. Acceptance criteria

Measured in a real browser, on both review modals, at every viewport in the probe
domain, with `TOL = 0.5px`:

**Every AC is measured at rest** — after the entrance transition reports
`transform: none` — because §1.3 showed a mid-entrance measurement understates the
overhang by 5%. AC-6 is the one that additionally checks the transient.

- **AC-1.** `menu.left >= clip.left - TOL` on both surfaces. The measured settled
  failure (`menu.left = -36` against `clip.left = 0`, §1.3) is gone. Expected
  post-fix value at 375x667 is `bounds.left = 8`, derived in §2.1.
- **AC-2.** `menu.right <= clip.right + TOL`, so the repair does not move the
  overhang to the other edge. Expected `351 ≤ 367`. **This AC is why the right
  anchor is deliberately given up**: at 375 the panel shifts right by 44px and is
  no longer flush with the pill. Containment and right-alignment are not
  simultaneously satisfiable at that width — the panel needs 343px and has 299px
  to the left of its anchor — and containment wins. Stated as a ratified
  trade-off so review does not read the shift as a regression.
- **AC-3.** `menu.bottom <= clip.bottom + TOL` — the existing height contract
  survives the hook's removal. **The regression that matters most**, since the
  height cap changes hands from `useFitWithinClip` to `placement.maxHeight`.
- **AC-4.** `menu.width > 0` and every row still clears the 44px tap floor at
  375x667 (`tests/e2e/wizard-attention-menu.spec.ts:204`) — a shifted or narrowed panel must
  not reflow rows under the floor.
- **AC-5.** At 1280x800 the settled geometry is **identical** to today's measured
  values: `menu.left = 684`, `menu.width = 400`. Derived as an identity in §2.1,
  not an approximation, so any drift is a real defect rather than tolerance.
- **AC-6.** Containment holds after the entrance settles **and** the panel is
  placed from a settled `naturalSize` — the compound case in §7. Concretely: the
  post-fix settled width at 375 is 343, not 325.85, proving placement did not
  freeze a mid-scale measurement.
- **AC-7.** No `useFitWithinClip` import remains in the tree, and no
  `100vw`-derived width remains on a clipped, non-portaled overlay (§5).

---

## 10. Consequence bound, probe domain, threat fence

Stated per the convergence criterion, since the change pins geometry.

**Consequence bound.** Every geometry either places the panel wholly inside its
clip, or is signaled — `lib/popover/place.ts:76-99` already warns on `hidden` and on a
sub-floor cap, and that diagnostic is inherited, not rebuilt. A panel that cannot
be placed is `visibility: hidden` with a dev warning, never a silently
half-rendered menu. **A conservative outcome plus a surfaced signal is a documented
limit, not a finding.**

**PROBE DOMAIN.** Both review modals — wizard (`Step3Review`) and published — at
the viewports their suites already drive: 375x667, 375x844, 390x560, 1280x800. A
probe outside this set, or more than one ordinary edit from an input in it, files
to §11 rather than to a review round.

**Threat fence.** This defends against ordinary responsive geometry a real
operator hits on a real phone. It does **not** defend against adversarially
constructed hosts: a zero-area clip, a `transform: scale` on an ancestor (a known
pre-existing limit of the measure path, recorded at the hook spec's L-8 and
untouched here), or a host smaller than the panel's minimum usable width. Those
degrade to the signaled outcomes above and file to documented limits.

---

## 11. Documented limits

- **L-1. The natural width is still declared in CSS.** The 400px preference stays
  a class; only the CAP is measured. A future author could set a natural width
  wider than any host and get a permanently capped panel with no diagnostic, since
  `place.ts` warns on sub-floor HEIGHT only, not on an always-capped width.
  Conservative (the panel fits and is usable) and therefore a limit.
  **Trigger:** a consumer whose natural width exceeds every host it mounts in.
- **L-2. The published baseline pins bytes, not geometry.** It will catch this
  regression returning on the published surface, but only because the pixels move;
  it makes no assertion about `menu.left`. The e2e assertions in §6.2 are the real
  guard. Recorded so nobody reads a green baseline as containment evidence.
- **L-3. `_metaPopoverViewportSource.test.ts` still does not scan CSS.** This
  change empties the class, but the guard that would keep it empty reads JS only —
  a future `100vw` width on a new clipped overlay would not fail it. Extending the
  guard to CSS is process-facing work with no incident behind it, so under the
  2026-08-25 process mint freeze it is recorded here rather than filed.
  **Trigger:** a second instance of this shape reaching main, which would make it a
  recurrence with two independent arcs and admissible under `Mint-exception:
  recurrence`.

---

## 12. Closeout

UI surface, so invariant 8 applies in full.

`impeccable-gate: critique+audit required — components/admin/showpage/AttentionMenu.tsx`

The dual gate runs on the affected diff before the whole-diff adversarial review
and before this arc reports READY. Findings and dispositions land in §12 of this
document. The pre-code mechanical checklist (em-dash ban in user-visible copy,
apostrophe literals, 44px tap targets, canonical type/token classes) runs before
the component edit, not after — noting that this change writes geometry and adds
no user-visible copy, so the copy arms are expected to be no-ops rather than
skipped.
