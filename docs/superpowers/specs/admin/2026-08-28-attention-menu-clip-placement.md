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
| A width cap does not fix this; the x-clamp does. | RESOLVED on measurement, §2.1. `maxWidth` is `null` at the failing viewport — the cap is inert, not merely insufficient. | Probe §1.3; `lib/popover/position.ts:118`, `lib/popover/position.ts:138-139` |
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

**Settled geometry, after the entrance settles (`scale` reads `1`):**

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

// position.ts:138-139, step 4, horizontal
let x = align === "right" ? trigger.right - effectiveWidth : trigger.left;
x = Math.min(Math.max(x, bounds.left), bounds.right - effectiveWidth);
```

`bounds` is the clip: `insetRect(intersectRects(hostRect ?? viewport, viewport), VIEWPORT_INSET)`
(`lib/popover/place.ts:101-102`).

**Line 139 is the fix, and line 118 is not.** Substituting the measured numbers
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

**The cap's inertness is provable over the whole probe domain, not just at the
viewport measured.** On a modal spanning the viewport width W (measured true at
375, where the clip is `[0, 375]`):

```
panel natural width = min(400, W - 32)          the CSS
bounds.width        = W - 2*VIEWPORT_INSET = W - 16

W - 32  <  W - 16   for every W
```

So when the `W - 32` arm is selected, `naturalSize.width > bounds.width` is false
and `maxWidth` is `null`. When the 400 arm is selected instead (`W >= 432`), the
modal is already wide enough that `400 < W - 16`, so it is null there too. **The
width cap can never fire on a full-width modal at any width.** At 1280 the modal
is not full width (clip `[128, 1152]`), and it is null there as well by the
numbers above.

**AMENDED 2026-08-28 AT IMPLEMENTATION, and the amendment is the honest half of
this section.** The proof above is sound for the natural width it assumes,
`min(400, W - 32)` — the OLD CSS formula. But that formula is exactly what this
arc removes: it is viewport-derived, and AC-7 forbids a viewport-derived width in
this component. The shipped natural width is a plain `w-[400px]`, which §3.3
already called for ("a plain `w-`/`max-w-` on the natural-size measurement"), and
those two statements were mutually inconsistent from round 1. Neither this spec
nor four review rounds caught it; the whole-diff review did.

With a 400px natural width the cap DOES fire at phone widths: at 375 the bounds
are 359 wide, `400 > 359`, so `maxWidth` is written and the panel settles at 359
rather than 343 — **16px WIDER than before the fix, and still fully contained.**

**The declination of candidate (A) survives this unchanged, and it matters that it
does.** A cap alone still does not fix the defect at any width: capped to 359 and
anchored right, the panel would start at `307 - 359 = -52`, further outside the
clip than the -36 it started at. The clamp remains the only mechanism that
contains it. What changes is the REASON the cap is not the fix — "inert" was true
of the old natural width and is not true of the shipped one; "insufficient, and in
the wrong direction" is true of both. §2.3(A) is corrected to argue the latter.

**AC-2b is amended to match** (§9): the settled width is
`min(400, bounds.width)`, derived from the measured clip and the core's
`VIEWPORT_INSET`, not the literal 343. The suites assert the derivation, so the
number moves with the viewport instead of being pinned to one.

This is recorded as an amendment rather than applied silently because the
alternative — editing the assertions to match the implementation and saying
nothing — is weakening a ratified contract, which is what the review correctly
called it before this paragraph existed.

This is a derivation, so it does not re-open when a viewport is added to the
domain — which is what the class-sweep rule asks for in place of a per-viewport
table. §6.3 still allocates every cell, but as confirmation of a proved claim
rather than as its evidence.

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
  arithmetic, not on style: a width cap does not contain this panel at ANY width.
  Capped to the clip's bounds (359 at 375) and still anchored right, it would
  start at `307 - 359 = -52` — further outside the clip than the -36 it began at,
  because narrowing a right-anchored panel moves its LEFT edge left. §2.1 records
  that the cap is additionally inert under the old natural width and fires under
  the shipped one; under both, it is the wrong mechanism. To work at all it would have to
  cap by a different quantity, the anchor-to-clip-edge distance, and then clamp —
  which is `lib/popover/position.ts:138-139` re-implemented in a second place,
  against the explicit trajectory of `lib/popover/place.ts:54`. A reviewer
  proposing this should be shown §2.1's substitution and its proof of inertness.
  (An earlier draft of this bullet argued the cap leaves the edge at -20; that
  number is refuted and §2.1 records why. It is named here only so the refutation
  is findable from the place the wrong number used to live.)
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

### 3.1a AMENDED AT IMPLEMENTATION — three decisions reversed

§3.2 and §3.3 below are kept as written, because the reasoning that produced them
is worth reading, but **three of their instructions were reversed by evidence
during implementation and the shipped code does not follow them.** The spec is
canonical, so the reversals are recorded HERE, ahead of the text they override,
rather than left for a reader to discover by diffing code against spec.

| §3 says | What shipped | Why |
| --- | --- | --- |
| Portal into the `PopoverHostContext` host (§3.2) | **No portal.** The panel renders in place; the host supplies BOUNDS only. | Portaling appends the panel late in the modal. It preserves the focus TRAP — §3.2's argument is correct as far as it goes — but sequential focus ORDER follows DOM order, so Tab from the pill reached the modal's close button instead of the menu. The suite pins that as an accessibility contract. The trap and the order within it are different properties, and §3.2 conflated them. |
| Anchor to `pillRef` (§3.3) | **Anchor to the panel's `offsetParent`** — the pill's wrapper. | That is what `right-0 top-[calc(100%+8px)]` anchored to before the migration. The wrapper carries the title block and is taller than the pill, so hanging the panel off the pill's bottom edge lifted it over the status strip; measured, the published toggle became unclickable with a monitoring row intercepting its pointer events. `pillRef` remains the dismissal inside-set, which is what it was always for. |
| Remove `top-[calc(100%+8px)] right-0` (§3.3) | **Both classes RETAINED** as a CSS fallback. | A panel whose placement returns early — null `offsetParent`, zero-area anchor, degenerate natural measurement — would otherwise be `absolute` with no offsets, sprawl at its static position, and swallow pointer events over the controls beneath it. The fallback is load-bearing, not vestigial. |

What is NOT reversed: the direction (§2), the clamp as the mechanism (§2.1), the
element each placement output lands on (§3.3's table), and the single `entered`
re-place signal (§7).

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

**Where each output lands, and why this is not one element.** The four precedents
all write `left`, `top`, `maxHeight` and `maxWidth` to a single node, because in
each of them the positioned panel IS the scroller. ShareHub's body carries
`flex max-h-[min(70vh,30rem)] w-[308px] flex-col … overflow-y-auto` on the very
element placement writes to (`components/admin/showpage/ShareHub.tsx:908`).

**The attention menu is the one consumer where those are two different elements.**
The panel positions (`components/admin/showpage/AttentionMenu.tsx:405`); the
scroller inside it owns `max-h-96 overflow-y-auto`
(`components/admin/showpage/AttentionMenu.tsx:426`), and a heading may sit above
it (`components/admin/showpage/AttentionMenu.tsx:409`). Copying the precedents
literally would put `maxHeight` on a non-scrolling parent whose scrolling child is
free to paint straight through it, and because the written cap would still be
above `MIN_FITTED_HEIGHT`, neither diagnostic in `lib/popover/place.ts:75-99`
would fire. That is a SILENT violation of the consequence bound in §10, and it is
why `useFitWithinClip` caps the SCROLLER today
(`components/admin/showpage/AttentionMenu.tsx:422`) rather than the panel.

So the assignment is:

| Output | Element | Note |
| --- | --- | --- |
| `left`, `top` | panel | Host-relative, converted as `components/admin/PublishedToggle.tsx:291-296` does. |
| `maxWidth` | panel | The one line identical in all four precedents (`components/admin/PublishedToggle.tsx:307`, `components/admin/ReSyncButton.tsx:243`, `components/admin/showpage/ShareHub.tsx:356`, `components/admin/HoverHelp.tsx:297`). Inert over the probe domain (§2.1), written for correctness outside it. |
| `maxHeight` | panel | Bounds the WHOLE overlay, heading included. |
| effective scroll cap | scroller, via flexbox | NOT written directly. The panel becomes a flex column that clips; the scroller shrinks inside the panel's cap. §7.1 pins the invariant that makes this true. |

The scroller keeps its declared `max-h-96` as the authored maximum, matching
ShareHub's note that its own `max-h-…` class *"stays as the DECLARED cap the
placement core reads as its `cap` input"*
(`components/admin/showpage/ShareHub.tsx:902-907`). The two caps compose: the
panel's fitted `maxHeight` bounds the total, `max-h-96` bounds the scroller's own
growth, and whichever binds first wins.

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

Migrating the last consumer makes the retired hook module (components/admin/useFitWithinClip.ts) dead
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

### 4.1 Source and executable contracts

The derivation is exactly
`grep -rln 'useFitWithinClip\|fit-within-clip' components app lib tests`, which
returns 15 files. **All 15 are dispositioned across §4.1 and §4.3** — 12 rows
here, and the three prose-only files (`lib/popover/place.ts`,
`tests/components/ReSyncButton.test.tsx`,
`tests/lib/popover/placeWarning.test.ts`) in §4.3. An earlier draft said "the
table below is exactly its 15 hits", which was false of the table even though the
scope was complete; the count spans the two sections. An earlier draft claimed this derivation while omitting two hits and
listing one file the command does not produce, which is the failure the phrase
"derived, not remembered" exists to prevent.

Rows are grouped by what the edit is, but the SET is the command's output.

| File | Change |
| --- | --- |
| `components/admin/showpage/AttentionMenu.tsx` | The frame portals into the host and is placed by the shared module; the viewport-sized width class, `right-0`, `top-[calc(100%+8px)]` and the `useFitWithinClip` call go. Panel becomes a clipping flex column (§7.1). |
| the retired hook module (components/admin/useFitWithinClip.ts) | Deleted (§3.4). |
| its retired suite (tests/components/admin/useFitWithinClip.test.tsx) | Deleted with its subject. |
| `tests/components/admin/_metaPopoverViewportSource.test.ts` | Derived registry discovers a sixth placement consumer; consumer/exemption rows updated. |
| `tests/components/admin/showpage/popoverOverlayRegistry.ts` | AttentionMenu's row moves from `disposition: "fit-within-clip"` (`tests/components/admin/showpage/popoverOverlayRegistry.ts:123`) to `"placement-module"`, with a reason citing the 2026-08-25 toggle-banner migration at `tests/components/admin/showpage/popoverOverlayRegistry.ts:108-110`. Held both ways, so a stale row fails. |
| `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` | Validates the `"fit-within-clip"` disposition through an import of the deleted module; the contract row follows the disposition change. |
| `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` | Three edits: the row REQUIRING AttentionMenu to call `useFitWithinClip`, the hook's registration as a `createRafCoalescer` consumer, and the deleted module named as a defining module (`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:169-170`). |
| `tests/components/admin/showpage/attentionMenu.test.tsx` | The case at `tests/components/admin/showpage/attentionMenu.test.tsx:336` asserts the scroller receives the fitted INLINE cap. That behavior is what §3.3 changes: the cap lands on the panel and the scroller shrinks by flex. The case is rewritten to the new invariant, not deleted. |
| `tests/e2e/wizard-attention-menu.spec.ts` | Measures at rest, drops the `w === 375` branch, and gains two viewports (§6.1, §6.3). |
| `tests/e2e/popover-clip-fit.spec.ts` | Gains both horizontal edges and the 1280x800 cell (§6.2, §6.3). |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | Its provenance comment at `tests/docs/_metaDeferralLedgerGraduation.test.ts:414` says the scroller *"now takes the shared useFitWithinClip"*. That is live prose in a live test describing a module this PR deletes, so it is edited to past tense naming the retirement — not left to rot and not deleted, since it records why `BL-ATTENTION-MENU-PANEL-CLIP` was closed. |
| `tests/fixtures/ledger-mass/2026-08-04.ledgers.json` | **NO CHANGE, explicitly.** A frozen dated fixture of the ledger corpus as it stood on 2026-08-04. Dated historical records are never corrected (spec-self-review's numeric-sweep rule says so in as many words), so its mention of the hook stays. Listed because the derivation produces it and an undispositioned hit is indistinguishable from an overlooked one. |

**Not produced by the derivation, added deliberately:**

| File | Change | Why it is here anyway |
| --- | --- | --- |
| `tests/components/admin/transitionAudit.test.tsx` | **NO CHANGE, explicitly.** An earlier draft assigned it an edit "covering the `entered` re-place". The suite cannot express that: it registers this component in a no-motion list (`tests/components/admin/transitionAudit.test.tsx:53`) banning motion libraries and `AnimatePresence`, and a re-place is neither. The registration stays green by construction. The transition-INVENTORY obligation is discharged in the plan's transition-audit section, which is where the rule puts it. |

### 4.2 Baselines — TWO move

An earlier draft said three and listed a published screenshot baseline. §8
records the verification that no such baseline covers this surface.

| Baseline | Why it moves | Regeneration |
| --- | --- | --- |
| `tests/components/admin/showpage/__fixtures__/published-attention-menu-baseline.html` | Captures the panel's exact class string, including `w-[min(400px,calc(100vw-32px))]` and `right-0`, both removed. | `PUBLISHED_ATTENTION_CAPTURE=1`, deliberately never a `-u` side effect. Diff reviewed line by line. |
| `tests/e2e/standalone-baseline.json` | A Playwright `--list` baseline, so only tasks changing the PLAYWRIGHT case set touch it. | Per its own documented procedure. |

### 4.3 Historical prose that is NOT changed

Four files mention the hook in docblocks explaining provenance:
`lib/popover/place.ts:52`, `lib/popover/place.ts:72`,
`tests/components/ReSyncButton.test.tsx:555`,
`tests/lib/popover/placeWarning.test.ts:6-8`,
`tests/e2e/popover-clip-fit.spec.ts:614`. None is executable. They stay, because
they explain why the current code is shaped as it is, and rewriting history is
not a repair. **One judgment call flagged for review:**
`tests/lib/popover/placeWarning.test.ts:8` cites the deleted module BY PATH, so
after retirement it is a dead path reference in live prose. The proposal is to
leave it and let the hook spec's retirement note (§3.4) be the pointer; the
alternative is a one-word edit to mark it retired.

### 4.4 Ledger

| File | Change |
| --- | --- |
| `docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md` | Dated header note recording the retirement (§3.4). |
| `BACKLOG.md` | Row archived; in-progress marker removed in the PR's last commit. |

---

## 5. Class sweep

**Shape:** an overlay sized or positioned against the layout viewport while
anchored inside a clipping ancestor that is inset from that viewport.

**Derived cover, and NOT a raw grep — the grep was tried and produced a false
row.** Two covers, used together:

1. `tests/components/admin/showpage/popoverOverlayRegistry.ts` is a per-overlay
   registry of every anchored, internally-scrolling overlay in `components/**`,
   each row carrying an explicit decision about how that overlay survives a
   clipping ancestor. Detection is a per-element AST walk
   (`tests/components/admin/showpage/_popoverOverlayExtract.ts`) over static
   className forms and literal inline styles, and rows are held BOTH ways: a
   missing row fails and a stale row fails. **This is the authoritative cover for
   this class**, because it reads structure rather than text and so cannot match
   a comment.
2. `tests/components/admin/_metaPopoverViewportSource.test.ts:125` walks
   `components/`, `app/` and `lib/` and bans JS layout-viewport reads outside the
   placement policy. **It does not scan CSS**, which is how this defect survived
   it: `100vw` in a Tailwind class is the same measurement in a channel that guard
   does not read (recorded as L-3).

A text sweep, `rg '100vw|100vh|100dvh|100dvw|100svh|100lvh' components app`, is
run only to enumerate CANDIDATES for the table below, never to decide one. Each
hit is then read as source, because two of them are not layout CSS at all: a
comment in ShareHub and an `Image` `sizes` attribute in GalleryLightbox. The
discriminator is four conditions that must all hold:

1. right-anchored (or otherwise clip-relative) positioning,
2. NOT portaled out of the clipping ancestor,
3. sized against the viewport, AND
4. **the panel's width can exceed the distance from its anchor's RIGHT edge to
   the clip's LEFT edge.**

Condition 4 is the one that does the work, and an earlier draft omitted it —
which made the discriminator wrong rather than merely incomplete, because
`AvatarMenu` satisfies 1, 2 and 3 and was nonetheless excluded by prose. The
overhang is `anchor.right - panelWidth < clip.left`; a viewport-derived cap
bounds `panelWidth` against the wrong quantity, so whether a given overlay
overflows depends on where its anchor sits. Note this is NOT "the clip is inset
from the viewport": at 375 the wizard clip IS the full viewport and the defect
still occurs, because the ANCHOR is inset (307 of 375).

Every hit, with its disposition:

| Site | Verdict |
| --- | --- |
| `components/admin/showpage/AttentionMenu.tsx:405` | **The defect.** All four conditions hold. Repaired here. |
| `components/auth/AvatarMenu.tsx:388` | **LATENT, not excluded.** It satisfies 1, 2 and 3. It escapes on condition 4 only: its anchor is the header's far-right identity chip, so the distance from the anchor's right edge to the clip's left edge is very nearly the full viewport, and `max-w-[calc(100vw-2rem)]` happens to bound it. That is a property of where the anchor sits, not of the cap being the right quantity — the same cap on an inset anchor would overflow. Its own docblock records hitting the left-overflow symptom and fixing it with that cap (`components/auth/AvatarMenu.tsx:383-387`). Recorded as L-5 with a trigger rather than repaired: it is outside any review-modal clip, it is not on the placement stack, and moving it there is a different surface. |
| `components/admin/FinalizeButton.tsx:1092` | Not in class on condition 4. **Both facts an earlier draft gave for this row were wrong**: `components/admin/FinalizeButton.tsx:773` portals the `role="dialog" aria-modal` blocker modal, NOT this soft-confirm panel, so citing it as this element's portal was a mis-attachment. The real mechanism is transitive: this control renders inside the wizard footer, which `components/admin/wizard/WizardFooter.tsx:62-63` portals into a `fixed inset-x-0 bottom-0` root. Its containing block is therefore viewport-width, the anchor-to-edge distance is ~the viewport, and a `100vw`-derived cap bounds the right quantity by accident of that geometry. **Scheduled for Task 1 runtime confirmation.** |
| `components/admin/CleanupAbandonedFinalizeButton.tsx:169` | Not in class on condition 1, **but not for the reason an earlier draft gave.** It is NOT a centered unanchored dialog: `components/admin/CleanupAbandonedFinalizeButton.tsx:93` is `absolute bottom-full left-0`, an anchored popover floating above its trigger, and its own comment says so. It escapes condition 1 because it is LEFT-aligned, so it grows rightward and cannot overflow the clip's left edge; the mirror-image hazard (`anchor.left + width > clip.right`) is bounded for the same transitive reason as the row above — it lives in the same `fixed inset-x-0` footer portal. **Scheduled for Task 1 runtime confirmation.** |
| `components/admin/showpage/ShareHub.tsx:39` | Not a match — a docblock recording that ShareHub *"used to be `absolute top-full right-0` … with `max-w-[calc(100vw-2rem)]`"*, and that this anchoring is what broke it. Historical prose about the migration this arc follows. An earlier draft's table omitted this hit while claiming to disposition every one. |
| `components/admin/showpage/ShareHub.tsx:906` | **Not a match — the grep hit a COMMENT.** Line 906 is prose recording that the old `right-0 … max-w-[calc(100vw-2rem)]` anchoring *"is gone"*; the live class at `components/admin/showpage/ShareHub.tsx:908` is `w-[308px]` and carries no viewport unit. An earlier draft read that comment as executable CSS and called it a redundant belt. Corrected, and recorded rather than silently deleted, because it is why the cover above is no longer a raw grep. |
| `components/diagrams/GalleryLightbox.tsx:999`, `components/diagrams/GalleryLightbox.tsx:1161` | N/A — `sizes="100vw"` is a Next `Image` srcset hint, not layout. |

**These dispositions are static reads, and Task 1 confirms EVERY non-defect row in
a browser** before the class is declared closed. An earlier draft scheduled only
AvatarMenu and ShareHub for confirmation, and the two rows it left unscheduled are
exactly the two whose stated facts turned out to be wrong — a static read that
excuses itself from verification is how a wrong exclusion survives. Task 1
measures, for each row, the panel's rect against its own containing block and
reports the anchor-to-edge distance, so condition 4 is decided by a number rather
than by a reading of the source.

**After this change the class is empty among overlays inside a review-modal
clip** — every one of those is on a stack that measures against
`hostRect ?? viewport`, and the one hook that measured otherwise is gone.

**The stronger claim, that the class is empty in the whole tree, is NOT made.**
`AvatarMenu` is not on the placement stack and is bounded only by where its
anchor happens to sit (L-5), and L-3 records that neither guard scans CSS, so
nothing mechanically prevents a new `100vw`-sized anchored overlay from being
written tomorrow. An earlier draft claimed emptiness by construction across the
tree; that claim outran its evidence and is withdrawn.

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
in one case: wait for the entrance to settle (`scale` reads `1` — NOT
`transform: none`, which §7 shows is always true here), then assert containment
at both horizontal edges. This is the instrument bug named in §1.4, fixed where it lives.

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

### 6.3 The acceptance matrix is allocated, cell by cell

§9 requires both modals at all four probe-domain viewports. That is eight cells,
and the suites as they stand cover five. Naming them individually, because an
earlier draft asserted the domain without allocating it:

| | 375x667 | 375x844 | 390x560 | 1280x800 |
| --- | --- | --- | --- | --- |
| **wizard** (`tests/e2e/wizard-attention-menu.spec.ts`) | exists (§6.1) | **ADD** | **ADD** | exists (§6.1) |
| **published** (`tests/e2e/popover-clip-fit.spec.ts`) | anchor-room only today, gains containment (§6.2) | gains containment (§6.2) | exists (§6.2) | **ADD** |

Three cells are new: wizard 375x844, wizard 390x560, published 1280x800. The
wizard file already loops a viewport list
(`tests/e2e/wizard-attention-menu.spec.ts:201-203`), so the two wizard cells are
two entries in that array, not two new cases. Published 1280x800 is the cell that
carries AC-6's discriminator (§9), so it is load-bearing rather than
completeness-for-its-own-sake.

**Alternative considered and declined:** narrowing the declared PROBE DOMAIN to
the five cells that exist. Declined because 1280x800 is exactly where a frozen
placement is distinguishable from a re-measured one, so dropping it would remove
the only viewport at which AC-6 can be falsified.

### 6.4 Structural

`_metaPopoverViewportSource.test.ts` fails by default on the new consumer, because
its registry is derived from source (`tests/components/admin/_metaPopoverViewportSource.test.ts:183`). That is a second red, and it is the
guard working as designed rather than an obstacle.

### 6.5 Real-browser only

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

**The geometry-affecting property is never transitioned, in either motion mode.**
This section said the opposite twice, and both drafts were wrong. Probed at this
branch's head:

```
motion-safe:     transitionProperty "opacity, transform"   duration 0.12s
                 scale "1"   transform "none"
reduced-motion:  transitionProperty "none"                 duration 0s
                 scale "1"   transform "none"
```

Tailwind v4 compiles `scale-95` / `scale-100` to the INDIVIDUAL `scale` property,
not to `transform`. The repository already records this independently, with its
own verification: *"the INDIVIDUAL `scale` / `rotate` / `translate` properties are
distinct inputs to the current transformation matrix and never appear in
`transform` (verified: a `scale: 0` element reports `transform: "none"`, and
Tailwind v4's `scale-*` utilities compile to exactly that property)"*
(`tests/e2e/helpers/phantomGap.ts:306-310`).

Three consequences, each of which killed a claim this spec previously made:

1. **`transform: none` is not a settled-state oracle.** It reads `none` while the
   panel is scaled to 95%, so a wait on it returns immediately. §1.3's probe
   reached settled geometry through a fixed delay, not through that check; the
   numbers are sound and the stated oracle was not. §1.3, §6.1 and §9 now wait on
   `scale` reading `1` (equivalently `none`), which is the property that actually
   moves.
2. **A `transitionend` filtered to `propertyName === "transform"` never fires
   here.** `transform` is listed in `transition-property` but is permanently
   `none`, so it never transitions. The only property that does transition is
   `opacity`, which changes no geometry.
3. **Therefore the scale change is INSTANT in both motion modes** — it is not in
   the transition list at all — and it lands in the same commit as the `entered`
   flip.

**So there is ONE signal, not two: `entered`.** It covers both motion preferences
for the same reason — the geometry is not animated on either. The two-signal
design of the previous draft is withdrawn, and so is the reduced-motion split that
motivated it: reduced motion is not a distinct branch for GEOMETRY, only for
opacity.

| Signal | Covers | Why nothing else is needed |
| --- | --- | --- |
| `entered` re-place | The scale-95 → scale-100 change, in both motion modes | The change is instant and synchronous with the class flip, so a re-place keyed to it observes the final geometry |
| ~~`transitionend`, `propertyName === "transform"`~~ | Nothing | The property never transitions; the listener would never fire |

**The hook's `transitionend` listener is not being dropped carelessly** — it is
being dropped because on THIS consumer it is already dead. It remains meaningful
in general, for a positioned ancestor that genuinely transitions `transform`,
which is the case the retired hook (components/admin/useFitWithinClip.ts line 300-304, deleted in this arc) was written for.
Retiring the hook removes it from a consumer where it never fired.

**Ratified, and load-bearing for the implementer: this change does NOT add `scale`
to the transition list.** Doing so would make the geometry animate and would
immediately require the settle signal this section just showed does not exist.
The entrance's visual behavior is out of scope and unchanged. Recorded as L-6,
because the component's docblock describes a "fade+scale" entrance
(`components/admin/showpage/AttentionMenu.tsx:27-29`) whose scale half is in fact
instant — a pre-existing cosmetic gap this arc deliberately does not close.

### 7.1 Dimensional Invariants

**This section exists because §3.3 changed the answer.** An earlier draft said the
panel is not a fixed-dimension parent and there was nothing to pin. Once the
fitted cap moves from the scroller to the panel, the panel IS a
constrained-height parent whose children must distribute inside it, which is
exactly the configuration this project requires be enumerated — and Tailwind v4
here does not default `.flex` to `align-items: stretch`, so nothing is assumed.

| Parent → child | Relationship | Exact guarantee |
| --- | --- | --- |
| panel → itself | Receives the fitted `maxHeight`; content must not paint past it | `overflow-hidden` on the panel. Without it a child overflows a `max-height` parent by default and the clip edge does the cutting, which is the defect F1 named |
| panel → children | Heading and scroller stack and share the panel's height | `flex flex-col` on the panel |
| panel → heading | Never compressed; it labels the panel while the list scrolls | `shrink-0` on the heading wrapper |
| panel → scroller | Absorbs the remaining height and no more | `flex-1` **and** `min-h-0` on the scroller. `min-h-0` is load-bearing: a flex item's default `min-height: auto` refuses to shrink below content, so without it the scroller keeps its content height, the panel's `max-height` is exceeded, and the fitted cap silently does nothing |
| scroller → itself | Scrolls rather than grows | `overflow-y-auto` unchanged, plus its declared `max-h-96` |

**Verified in a real browser, not jsdom**, per the layout-dimensions rule. The
oracle must be written against the right box, and an earlier draft of this
section got that wrong in a way that could never pass:

**The panel has a border and no padding.** Its classes are
`rounded-md border border-border bg-surface-raised shadow-popover`
(`components/admin/showpage/AttentionMenu.tsx:405`) — `border` is 1px per side,
and there is no `p-*`. So `panel.getBoundingClientRect().height` is a BORDER-BOX
that exceeds the children's content-box sum by exactly 2px, and
`heading.height + scroller.height === panel.getBoundingClientRect().height` is a
guaranteed false failure at every viewport, not a proof of anything.

The assertions, each within 0.5px:

| Assertion | Boxes |
| --- | --- |
| `heading.height + scroller.height === panel.clientHeight` | `clientHeight` excludes the border and includes padding; the panel has no padding, so this is exactly the content box the children fill |
| `panel.getBoundingClientRect().height <= fittedCap` | Border-box against the written cap, which `max-height` also applies to the border box under `box-sizing: border-box` |
| `scroller.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom` | Catches the `min-h-0` failure directly: without it the scroller keeps its content height and paints past the panel |

The third is the one that fails if `min-h-0` is dropped, so it is the assertion
that makes the invariant table executable rather than decorative. jsdom computes
no layout and would pass on every failure mode above.

**Geometric invariants**, asserted in §6.2 and §9: `menu.left >= clip.left`,
`menu.right <= clip.right`, `menu.bottom <= clip.bottom`, within 0.5px, at rest.

---

## 8. Published byte baseline

The published surface's geometry changes, so its byte baseline moves. **Which
baseline that is turned out not to be the one this spec and the arc brief both
named**, and the correction is recorded rather than quietly applied.

**There is no published SCREENSHOT baseline for this surface.** Verified three
ways: neither e2e suite calls `screenshot()` or `toHaveScreenshot()`; no tracked
screenshot artifact names the attention menu; and the only `needs-attention`
captures (`public/help/screenshots/needs-attention-mobile-{dark,light}.webp`) are
of the `/admin/needs-attention` PAGE via
`[data-testid=admin-needs-attention-page]`
(`scripts/help-screenshots.manifest.ts:80-85`), which does not render this
component. No entry in that manifest opens a review modal at all.

The byte baseline that genuinely moves is
`tests/components/admin/showpage/__fixtures__/published-attention-menu-baseline.html`
(§4.2) — a byte baseline, just not a screenshot one. It regenerates under
`PUBLISHED_ATTENTION_CAPTURE=1`, deliberately never a `-u` side effect, with the
diff reviewed line by line.

**The byte-comparison discipline is not weakened, it simply has no subject
here.** Any arc that does move a screenshot baseline still regenerates it from
the pinned Playwright Docker image with `--platform linux/amd64` on an arm64
host, never from the dev machine. Recorded this way so the rule is not read as
relaxed by an arc that merely had no screenshot to regenerate.

## 9. Acceptance criteria

Measured in a real browser, on both review modals, at every viewport in the probe
domain, with `TOL = 0.5px`:

**Every AC is measured at rest** — after the entrance settles, detected by
`scale` reading `1`, never by `transform: none`, which §7 shows is permanently
true on this element and so waits for nothing. §1.3 showed a pre-settle
measurement understates the overhang by 5%. AC-6 is the one that additionally
checks the transient.

- **AC-1.** `menu.left >= clip.left - TOL` on both surfaces. The measured settled
  failure (`menu.left = -36` against `clip.left = 0`, §1.3) is gone. Expected
  post-fix value at 375x667 is `bounds.left = 8`, derived in §2.1.
- **AC-2.** `menu.right <= clip.right + TOL`, so the repair does not move the
  overhang to the other edge. Expected `351 ≤ 367`.

  **The panel shifts right by 44px at 375 and is no longer flush with the pill.
  That is a CHOICE, not a geometric necessity, and an earlier draft wrongly
  called it forced.** Containment and right-alignment ARE simultaneously
  satisfiable: a 299px panel spans `x = 8` to `x = 307`, contained and still
  flush with the trigger. What is not simultaneously satisfiable is containment,
  right-alignment, AND the 343px natural width. One of the three gives.

  **Ratified: the width is preserved and the alignment gives.** Three reasons,
  recorded so the alternative is not re-proposed as a discovery:
  1. It is what the shared stack does. `lib/popover/position.ts:138-139` clamps
     `x`; narrowing to preserve alignment would need a cap of
     `trigger.right - bounds.left`, a quantity the core does not compute. Getting
     it would mean either changing the core for all six consumers or overriding
     locally — a bespoke seventh variant, which is the thing §2 declines.
  2. 375 is the most cramped viewport, where 44px of content width is worth more
     than flushness. The rows are `title + second line`; narrowing costs wrapping.
  3. The other five overlays already shift. A menu that narrows instead would be
     the only one behaving differently.

  The alternative is recorded in §11 as L-4 with its trigger, not discarded.

  **AC-2b — the choice is ENFORCED, not merely stated.** The settled `menu.width`
  is `min(400, bounds.width)` — the declared 400px natural width, capped only by
  the clip's inset bounds — asserted from the measured clip and the core's
  `VIEWPORT_INSET` rather than a pixel constant. At 375x667 that is 359.

  **Amended from a literal `343` at implementation time** (§2.1): 343 was the old
  viewport-derived formula's output, and AC-7 forbids that formula. The panel is
  16px wider than before the fix and still contained.

  Without this the acceptance criteria do not discriminate the ratified design
  from the rejected one: a 299px panel at `left = 8, right = 307` satisfies AC-1
  (`8 >= -0.5`), AC-2 (`307 <= 375.5`), AC-3, AC-4 (`299 > 0`) and AC-7, and an
  implementation that narrowed only on phones would still satisfy AC-5 and AC-6
  at 1280. The rejected outcome passed every written AC. That is a silent wrong
  auto-correct, not a documented limit, and AC-2b closes it.
- **AC-3.** `menu.bottom <= clip.bottom + TOL` — the existing height contract
  survives the hook's removal. **The regression that matters most**, since the
  height cap changes hands from `useFitWithinClip` to `placement.maxHeight`.
- **AC-4.** `menu.width > 0` and every row still clears the 44px tap floor at
  375x667 (`tests/e2e/wizard-attention-menu.spec.ts:204`) — a shifted or narrowed panel must
  not reflow rows under the floor.
- **AC-5.** At 1280x800 the settled geometry is **identical** to today's measured
  values: `menu.left = 684`, `menu.width = 400`. Derived as an identity in §2.1,
  not an approximation, so any drift is a real defect rather than tolerance.
- **AC-6.** Placement is RE-COMPUTED when the entrance settles, and the assertion
  discriminates that from a frozen placement.

  **A settled width of 343 does NOT prove this** and must not be used: the rect
  grows from 325.85 to 343 when the CSS transform finishes whether or not any
  code ran. Nor does containment at 375, where a frozen and a re-measured
  placement both clamp `x` to `bounds.left = 8` and are indistinguishable.

  The assertion is therefore made where the two answers DIFFER — a viewport with
  enough room that the clamp does not fire, so `x` tracks
  `trigger.right - effectiveWidth` and moves by exactly the 5% width difference
  when the natural size is re-read. At 1280x800: frozen gives
  `1084 - 380 = 704`; re-measured gives `1084 - 400 = 684`, the measured settled
  value in §1.3. Asserting `menu.left === 684` at rest fails on a frozen
  placement and passes on a re-measured one. The mutant that proves the
  assertion discriminates is **removing the `entered` re-place** and observing
  704 — not removing a `transitionend` listener, which §7 shows never fires and
  whose removal would therefore change nothing.

  **Asserted under BOTH motion settings**, not because the geometry differs —
  §7 shows the scale is instant either way — but because the harness's default
  is `reducedMotion: true` (probed), so a suite that never sets it has silently
  tested only one of the two settings an operator can be in. The motion-safe
  case is obtained with `page.emulateMedia({ reducedMotion: "no-preference" })`.
  Both must read 684. Equal results are the expected outcome and are the point:
  they confirm the geometry does not depend on the setting.
- **AC-7.** Two assertable halves, narrowed from an earlier draft that stated a
  tree-wide claim nothing could falsify:
  1. the retired hook module (components/admin/useFitWithinClip.ts) no longer exists, and no module
     imports it — proven by the build and typecheck resolving with the file
     deleted, since a surviving import cannot resolve.
  2. `components/admin/showpage/AttentionMenu.tsx` carries no viewport-derived
     width (`100vw`, `100dvw`, `100svw`) in any className — asserted directly on
     the component source.

  **The tree-wide form is deliberately NOT an acceptance criterion.** No guard
  scans CSS for it (L-3), so as an AC it would be a claim the arc cannot check
  and a later reader would take as enforced. §5 establishes the class is empty
  among clipped overlays by argument and probe; L-3 records that nothing
  mechanically keeps it so.

---

## 10. Consequence bound, probe domain, threat fence

Stated per the convergence criterion, since the change pins geometry.

**Consequence bound.** Every geometry either places the panel wholly inside its
clip, or is signaled — `lib/popover/place.ts:75-99` already warns on `hidden` and on a
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
- **L-3. `tests/components/admin/_metaPopoverViewportSource.test.ts` still does not scan CSS.** This
  change empties the class, but the guard that would keep it empty reads JS only —
  a future `100vw` width on a new clipped overlay would not fail it. Extending the
  guard to CSS is process-facing work with no incident behind it, so under the
  2026-08-25 process mint freeze it is recorded here rather than filed.
  **Trigger:** a second instance of this shape reaching main, which would make it a
  recurrence with two independent arcs and admissible under `Mint-exception:
  recurrence`.
- **L-4. Containment is bought with alignment, not with width.** AC-2 ratifies the
  shift; the alternative that narrows the panel to `trigger.right - bounds.left`
  (299px at 375x667) keeps it flush with the pill and is equally contained. It is
  declined for the three reasons in AC-2, none of which is that it fails to work.
  **Trigger:** an operator report that the shifted menu reads as detached from its
  pill, or a design decision making flushness a contract — at which point the
  repair is a new cap quantity in the shared core, affecting all six consumers,
  never a local override.
- **L-5. `AvatarMenu` is a latent instance of this class, bounded by luck of
  anchor placement.** It meets conditions 1-3 of §5 and escapes only on condition
  4, because its anchor sits at the header's far-right edge. Its cap
  (`max-w-[calc(100vw-2rem)]`) bounds the wrong quantity — the viewport rather
  than the anchor-to-clip-edge distance — so the bound is incidental. Not
  repaired here: it sits outside any review-modal clip, is not on the placement
  stack, and migrating it is a different surface with its own review.
  **Trigger:** the identity chip moving off the far-right edge, a container that
  insets the header, or any report of the avatar menu clipping on a narrow
  screen.
- **L-6. The entrance's scale half does not animate, and this arc does not fix
  it.** The component's docblock describes a "motion-safe fade+scale" entrance
  (`components/admin/showpage/AttentionMenu.tsx:27-29`), but Tailwind v4 compiles
  `scale-*` to the individual `scale` property while `transition-property` lists
  `opacity, transform` (probed, §7). `scale` is therefore not in the transition
  list and the scale change is instant; only the fade animates. Cosmetic,
  pre-existing, and deliberately untouched — adding `scale` to the list would
  make the geometry animate and would require a settle signal that §7 shows does
  not currently exist, which is a strictly larger change than this row.
  **Trigger:** a design decision to restore the scale entrance, which must land
  together with a settle signal for placement.

---

## 12. Closeout
### 12.1 Pre-code mechanical checklist

Run before the component edit, per the pre-code UI gate. All arms are no-ops on
this diff, and that was PREDICTED rather than discovered: the change writes
geometry and adds no user-visible copy. Verified rather than assumed:

| Arm | Result |
| --- | --- |
| em-dash in user-visible copy | 5 occurrences, all in comments; none in rendered copy |
| apostrophe literals | 0 curly apostrophes |
| 44px tap targets | `min-h-tap-min` retained on the row button |
| canonical type/token classes | only `text-xs`, `text-xs/relaxed`, `text-sm`, `text-text-subtle` |
| new rendered copy | none — the diff's added non-comment lines contain no rendered strings |

### 12.2 Impeccable dual gate

**Provenance.** Assessments A (design review) and B (detector + browser evidence)
ran as two isolated sub-agents, per the command's hard invariant.

**Disclosed deviation, because a silent degraded critique is a failed one:** the
parent context ran the impeccable detector directly for corroboration BEFORE Assessment A
finished, which the command orders the other way so detector output cannot anchor
the design review. The scan returned `[]` at exit 0, so there were no findings
available to anchor on, and Assessment A's review was already dispatched and
isolated when it ran. Recorded rather than omitted.

**Deterministic scan:** the impeccable detector (detect.mjs, a skill script outside this repo) run with --json over `components/admin/showpage/AttentionMenu.tsx`
→ exit 0, `[]`. Clean.

**Browser evidence:** the standalone harness renders the real published review
modal with this menu open and needs no app server or database.
`tests/e2e/popover-clip-fit.spec.ts` 42/42 and
`tests/e2e/wizard-attention-menu.spec.ts` 13/13 at this head, including the
eight-cell containment matrix, the host-descendancy pin, the dimensional
invariants and both motion branches of the re-place assertion.

### 12.3 Impeccable audit

Code-level technical audit of the diff. Scored per the command's five dimensions.

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | No new debt, and the migration actively DEFENDED an a11y contract: the portal was reverted because it broke sequential focus order from the pill. |
| 2 | Performance | 3 | One forced sync layout per placement pass, inherent to measure-then-place and the same cost the other five stack consumers pay. Coalesced through the shared rAF throttle with teardown. |
| 3 | Theming | 4 | Zero hard-coded colors. Semantic tokens throughout, and a semantic `z-dropdown` rather than a numeric z-index. |
| 4 | Responsive | 3 | Containment now measured at four viewports on both surfaces; 44px floor asserted on both. One residual, P3 below. |
| 5 | Anti-patterns | 4 | Detector clean, zero tells. |
| **Total** | | **18/20** | **Excellent (minor polish)** |

**Anti-patterns verdict: PASS.** The deterministic detector returns `[]`. No
gradient text, no glassmorphism, no side-stripe border, no hero-metric block, no
eyebrow, no card grid. Motion is opacity-only and honors `prefers-reduced-motion`.
`role="menu"` appears exactly once in the file, in a comment explaining why the
component deliberately does NOT use it — the rows are plain buttons with no
arrow-key contract, which is the honest disclosure pattern.

**Findings**

- **P2 — dead portal scaffolding, FOUND AND FIXED IN THIS AUDIT.** `eslint`
  reported `react-hooks/set-state-in-effect` on a `mounted` flag that existed only
  to defer `createPortal` until after hydration. The portal was reverted earlier in
  this task; the flag survived it. It cost a wasted render cycle on every open (the
  panel returned `null` on first commit) and tripped the rule. Removed with an
  unused `scrollerRef`. Lint and typecheck clean afterwards, and all four affected
  suites re-run green: 13, 42, and 20 across the unit and baseline pair. This is
  the `subtract-before-you-add` case — scaffolding for a decision that was reversed
  is the easiest thing in a diff to leave behind, and only the linter noticed.
- **P3 — the degraded-path width no longer self-limits.** `w-[400px]` is the
  declared natural width and its only limiter is the runtime cap. The class it
  replaced, `w-[min(400px,calc(100vw-32px))]`, bounded itself in CSS. So in the
  early-return paths — null `offsetParent`, zero-area anchor, degenerate natural
  measurement — a 400px panel could exceed a 375px clip where the old class would
  have shrunk. **Not repaired, and the reason is that every one of those paths
  corresponds to a panel that is not laid out or is already `visibility: hidden`**,
  so the width is unobservable. Recorded rather than fixed because the obvious
  repair reintroduces a viewport-derived width, which is the defect this arc
  closed. **Trigger:** any report of the panel exceeding its clip in a state where
  it is nonetheless visible.




UI surface, so invariant 8 applies in full.

`impeccable-gate: critique+audit required — components/admin/showpage/AttentionMenu.tsx`

The dual gate runs on the affected diff before the whole-diff adversarial review
and before this arc reports READY. Findings and dispositions land in §12 of this
document. The pre-code mechanical checklist (em-dash ban in user-visible copy,
apostrophe literals, 44px tap targets, canonical type/token classes) runs before
the component edit, not after — noting that this change writes geometry and adds
no user-visible copy, so the copy arms are expected to be no-ops rather than
skipped.
