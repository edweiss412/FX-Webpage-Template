# Review-modal StatusStrip dock + upward refusal banner

**Row:** `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` (`BACKLOG.md`, effort M, filed 2026-08-02).
**Branch:** `feat/review-modal-strip-dock`. **Decision:** Option A, ratified by Eric 2026-08-25.
**Facing:** product.

The published review modal's control strip sits in a band directly under the identity header. At
375x667 that band scrolls out of the panel's clip window entirely, so the Published switch, the
Re-sync trigger and the share hub are unreachable on the tightest phone the app supports. This
spec docks the strip to the bottom of the panel, scrolls the change list above it, and gives the
publish refusal banner an upward arm so it stays readable once its anchor is at the panel floor.

---

## §1.1 Resolved scope — do not relitigate

Each item carries its ratification. Verify the citation; do not re-derive the decision.

1. **Option A itself — dock the strip to the panel bottom.** Ratified by Eric 2026-08-25:
   "OPTION A, pin the status strip (Published switch + refusal banner) to the bottom of the review
   window so it is reachable on every phone; change list scrolls above; banner opens upward when
   short" — the bl-orch arc brief 2026-08-25-arc-stripdock, quoting the ERIC'S DECISIONS
   section (18:40, entry 1) of the 2026-08-22 bl-orch handoff; both live in the untracked
   `FX-worktrees/_briefs/` directory beside this checkout, so neither is citable as a repo path. It
   was taken against the mockup at
   https://claude.ai/code/artifact/dbc1e2b2-a6e7-4c1c-a563-a061b017ecb0 . The mockup is
   published under a different Claude account than this arc runs in and did not resolve on a read
   from here; the handoff prose above is the ratified text of record and is what this spec builds.

2. **The 2026-08-04 PREREQ fence on this row is LIFTED.** The row was fenced out of the M-wave pool
   as PREREQ-fenced (`docs/superpowers/specs/2026-08-05-m-wave-design.md:24`, item 1; restated in
   the screen summary at `docs/superpowers/specs/2026-08-09-m-wave-2-decisions-brief.md:27`). The
   fence's unfired trigger was "a decision about obstacle 2" — whether the strip rendering below the
   clip window at 375x667 is an unrepresentative fixture or a real responsive defect. Eric's
   2026-08-25 decision answers it: **it is a real responsive defect**, and Option A is the repair.
   Recorded here per the handoff's instruction to record the lift in the next spec that touches the
   row. The fence is not relitigable and neither is its lift.

3. **"Maybe 375x667 is unsupported" was Option B and was rejected.** The switch must be reachable at
   375x667. Do not propose narrowing the supported viewport set.

4. **PublishedToggle user-visible copy is out of scope.** No string in
   `components/admin/PublishedToggle.tsx` changes: not the switch label, not `RETRY_COPY`, not the
   sublines, not the finalize chip. This spec moves geometry and adds a direction.

5. **The banner stays an absolutely-positioned overlay; the flip is a direction, not a re-skin.**
   The considered alternative was rendering the refusal in flow as the footer's first line, above
   the strip row, which would need no measurement, no cap and no predicate. Rejected for three
   reasons, recorded so a reviewer does not re-derive them: (a) the ratified decision and the arc
   brief both specify a banner that *opens upward*, i.e. an overlay with a direction; (b) an in-flow
   banner grows the dock, which shoves the change list mid-scroll, whereas an overlay leaves the
   scroll position untouched — errors here are momentary by design
   (`components/admin/PublishedToggle.tsx:69-70`, the `POPOVER_POSITION` docblock: "This is
   ERROR-ONLY: errors are momentary"); (c) it would retire the overlay skin wholesale, taking with it the T4
   containment / fit / scroll / keyboard obligations in `tests/e2e/popover-clip-fit.spec.ts`, the
   `popoverOverlayRegistry` row (`tests/components/admin/showpage/popoverOverlayRegistry.ts:105-111`)
   and the `z-banner` rule against `ReSyncButton`'s `z-overlay`
   (`components/admin/ReSyncButton.tsx:57`) — a far larger blast radius than the direction it
   replaces, in a file whose fit hook is fenced (§1.2).

6. **The direction is MEASURED, never hardcoded to the new dock.** Once the strip is docked, room
   below its anchor is negative on every supported viewport, so the up arm is what production takes
   in practice. The predicate still measures, for a stated reason: a hardcoded `bottom-full` encodes
   today's dock into the toggle, and the census assertion in §7 would then restate a constant
   instead of measuring a surface. The down arm is not dead — it is the default, it is what runs
   when nothing clips, and it is exercised end to end by the replica entry
   (`tests/e2e/_publishedToggleClipLiveEntry.tsx`), which is where T4's four down-direction
   obligations live.

### §1.2 Concurrency fence (not a design decision — a coordination constraint)

`arc-layoutmeasure` (branch `feat/fitwithinclip-measure-class`) owns `components/admin/useFitWithinClip.ts`
and `lib/layout/fitWithinClip.ts` for the duration of this arc. **This spec edits neither**, with one
exception the arc brief grants: the per-anchor docblock at `lib/layout/fitWithinClip.ts:38-43`, once
§7 has produced the measured number. Everything this spec adds is a new file or a call site.

The consequence is stated as a documented limit in §10, not smuggled in as a design preference: the
flip ships as a SECOND hook beside the existing one rather than as a direction parameter on it.

---

## §2 Current shape (live-code citations)

Every claim below was verified against the worktree at `feat/review-modal-strip-dock` on 2026-08-25.
Anchors are file + symbol; line numbers are drafting-time locators.

### §2.1 The panel column

`components/admin/review/ReviewModalShell.tsx:621-624` renders the panel as:

```
relative flex max-h-[85vh] w-full flex-col items-stretch overflow-clip rounded-t-md bg-bg
text-text shadow-tile sm:max-h-[80vh] sm:max-w-5xl sm:rounded-md
```

`items-stretch` is stated explicitly because this repo's Tailwind v4 does not default `.flex` to
`align-items: stretch` (the panel's own comment at `components/admin/review/ReviewModalShell.tsx:607-610` says so, citing `DESIGN.md §7`).
`overflow-clip` is load-bearing chrome, not a scroll guard (`components/admin/review/ReviewModalShell.tsx:611-619`).

Children of that column, top to bottom:

| # | element | classes (abridged) | cite |
|---|---|---|---|
| 1 | grab button (sheet only) | `flex min-h-tap-min w-full shrink-0 touch-none … sm:hidden` | `components/admin/review/ReviewModalShell.tsx:662` |
| 2 | `<header>` | `flex shrink-0 items-start gap-3 border-b border-border bg-surface px-tile-pad py-3 sm:py-4` | `components/admin/review/ReviewModalShell.tsx:672` |
| 3 | `subHeader` band (optional) | `relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2` | `components/admin/review/ReviewModalShell.tsx:696-702`, class at `components/admin/review/ReviewModalShell.tsx:700` |
| 4 | `children` — **no shell wrapper**; the consumer's surface root IS the body element | — | `components/admin/review/ReviewModalShell.tsx:714` |
| 5 | `<footer>` (optional) | `relative flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-surface px-tile-pad pt-3 pb-[calc(--spacing(3)+env(safe-area-inset-bottom,0))] sm:pb-3` | `components/admin/review/ReviewModalShell.tsx:723-731`, class at `components/admin/review/ReviewModalShell.tsx:727` |

The `subHeader` slot is gated on TRUTHINESS (`components/admin/review/ReviewModalShell.tsx:696`); the `footer` slot on `!= null` (`components/admin/review/ReviewModalShell.tsx:723`) — a
pre-existing difference the shell documents and deliberately did not unify (`components/admin/review/ReviewModalShell.tsx:681-684`).

`PublishedReviewModal` passes `subHeader` (`components/admin/showpage/PublishedReviewModal.tsx:1104`)
and **no `footer` prop at all**, so the footer slot renders nothing today. Inside `subHeader`: an
`sr-only` freshness-announce `<span role="status">` (`components/admin/showpage/PublishedReviewModal.tsx:1113-1121`), then
`<div data-testid="published-show-review-freshness-band">` (`components/admin/showpage/PublishedReviewModal.tsx:1127-1129`) wrapping `<StatusStrip>`
(`components/admin/showpage/PublishedReviewModal.tsx:1131`).

The body is `<ShowReviewSurface>`, whose root is
`flex min-h-0 flex-1 flex-col items-stretch lg:flex-row`
(`components/admin/review/ShowReviewSurface.tsx:857`), with the scroll pane at
`flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-tile-pad motion-safe:scroll-smooth` (`components/admin/review/ShowReviewSurface.tsx:1028`).

### §2.2 The strip

`components/admin/showpage/StatusStrip.tsx:200-226` is an unconditional root carrying
`id="share-access"` (`components/admin/showpage/StatusStrip.tsx:206`) (the deep-link target built by `shareAccess` in
`lib/adminAlerts/alertActions.ts:61`), `data-testid="show-status-strip"`, and
`className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"` (`components/admin/showpage/StatusStrip.tsx:226`).

Two comments on that root are load-bearing for this spec:

- `components/admin/showpage/StatusStrip.tsx:215-222` — `w-full` is **defensive, not load-bearing today**, because the band is a block-level
  non-flex container. It says in as many words that the guarantee "would evaporate the moment the
  band became a flex container", since the strip would then shrink-wrap as a flex item.
- `components/admin/showpage/StatusStrip.tsx:223-225` — the strip deliberately carries **no `relative`**, because the band owns the
  positioned ancestor.

The strip's only production render site is `PublishedReviewModal` (`components/admin/showpage/PublishedReviewModal.tsx:1131`); its docblock at
`StatusStrip.tsx:56-61` says so.

### §2.3 The refusal banner

`components/admin/PublishedToggle.tsx`:

- `KNOWN_REFUSAL_CODES` = `PUBLISH_BLOCKED_PENDING_REVIEW`, `SHOW_ARCHIVED_IMMUTABLE`,
  `FINALIZE_OWNED_SHOW` (`components/admin/PublishedToggle.tsx:36-40`).
- `POPOVER_POSITION` = `absolute inset-x-0 top-full z-banner mt-1 overflow-x-hidden overflow-y-auto
  rounded-sm p-2 text-sm wrap-break-word shadow-tile`
  (`components/admin/PublishedToggle.tsx:60-62`), applied at the banner's `className`
  (`components/admin/PublishedToggle.tsx:202`). **`top-full` is unconditional: there is no upward arm
  today.**
- The banner node carries `data-testid="published-toggle-popover"`, `role="group"`,
  `aria-labelledby={errorTextId}`, `tabIndex={0}` and `ref={fitRef}` (`components/admin/PublishedToggle.tsx:184-202`; the hook call is at
  `components/admin/PublishedToggle.tsx:132`).
- It declares **no CSS `max-height`**, so `useFitWithinClip` reads `max-height: none` and treats the
  cap as `+Infinity` (`components/admin/useFitWithinClip.ts:94-99`) — the clip is the only thing
  bounding this overlay.
- The switch is `role="switch"` (`components/admin/PublishedToggle.tsx:294`), `data-testid="published-toggle"` (`components/admin/PublishedToggle.tsx:299`).
- The only production call site is `components/admin/showpage/StatusStrip.tsx:255-262` with `variant="settings"` (`components/admin/showpage/StatusStrip.tsx:257`); `card` and
  `inline` are reached from tests and harness entries only (`variant="inline"` at
  `tests/e2e/_publishedToggleClipLiveEntry.tsx:80`, `variant="card"` by default in
  `tests/components/admin/PublishedToggle.test.tsx`). **Render-path enumeration:** three variants,
  two of which (`card`, and the in-flow `FINALIZE_CHIP` branch of `inline`/`settings`) render the
  refusal IN FLOW and cannot be clipped. Only the `showError` branch of `inline`/`settings`
  (`components/admin/PublishedToggle.tsx:184-212`) is an absolute overlay, so only it takes a direction.

**Stale claim, and its class.** `PublishedToggle.tsx:49-53` says the popover's containing block is
"the sticky StatusStrip (`sticky` is a positioned element)". There is no `sticky` on the strip: that
arm was retired with the former `chrome` prop (`StatusStrip.tsx:56-61`), and the strip carries no
`relative` either (`components/admin/showpage/StatusStrip.tsx:223-225`). The real positioned ancestor today is the shell's `relative`
subHeader band, and after §3.1 it is the footer. Any dock that moves the strip out of that band moves
the banner's containing block, so re-anchoring is part of the work, not a side effect.

The claim is not one comment. Swept with `rg -n -i 'sticky' app components tests lib` and triaged, it
has **seven live sites**, all repaired in this PR (§9):

| # | site | what it asserts |
|---|---|---|
| 1 | `components/admin/PublishedToggle.tsx:52` | the popover's containing block is the sticky strip |
| 2 | `components/admin/PublishedToggle.tsx:67` | the finalize chip is in flow so it never floats over content "below the sticky strip" |
| 3 | `tests/components/admin/PublishedToggle.test.tsx:485` | "absolutely anchored inside the sticky strip" |
| 4 | `tests/components/admin/showpage/popoverOverlayRegistry.ts:110` | "Absolutely anchored inside the sticky strip inside the review-modal panel" |
| 5 | `tests/e2e/popover-clip-fit.spec.ts:135` | "The strip is the banner's positioned ancestor (sticky implies positioned)" |
| 6 | `tests/e2e/statusStripToggleLayout.spec.ts:18` and `tests/e2e/statusStripToggleLayout.spec.ts:160` | "the rail content below the sticky strip" |
| 7 | `tests/e2e/_statusStripToggleHarness.tsx:104` | "the strip's `sticky top-0` behaves as in-app" |

The same pattern also hits four **dated historical records** under
`docs/superpowers/plans/admin/2026-07-17-casp2-*.md` and `docs/superpowers/specs/admin/2026-07-17-casp2-*.md`.
Those are **deliberately not corrected**: a dated record states what was true when it was written, and
rewriting one to match today's tree destroys the only evidence of what the decision was taken against.

**The remaining `sticky` hits are correct and stay.** Triaged, they are: `PreviewBanner.tsx` and
`StagedPreviewBanner.tsx`, two genuinely sticky components; the `z-sticky-banner` token name in
`tests/styles/_metaZIndexBands.test.ts` and `tests/_shared/zLevel.ts`; `StatusStrip.tsx:56`, which
correctly calls the sticky pin a property of the FORMER `chrome` prop; and two NEGATIVE assertions —
`tests/components/admin/showpage/statusStrip.test.tsx:613` (`PAGE_ONLY_CHROME` includes `"sticky"`
and the strip is asserted to carry none of it) and
`tests/components/admin/showpage/publishedReviewModal.test.tsx:898` ("no ... sticky pin"). Those two
are the executable proof of the paragraph above, and both stay correct after the dock.

**No guard is added for this class, deliberately, and the cover is honest about what it is.** The
seven sites are an enumeration-with-triage, not a derivation: the token `sticky` is legitimately used
by two other components, by a z-index token name, by one correct historical reference and by two
negative assertions, so a pattern that fired only on the false claim would itself be a prose
recognizer over comment English. That is the shape the 2026-08-04 round-economy measurement found
unbounded — an open grammar, one corner per round, finding rate flat — and building one here would
cost more than the class it guards. AC-12 therefore asserts the narrow pattern returns zero AND names
the triage, rather than claiming a cover it does not have.

### §2.4 The fit arithmetic (read-only for this arc)

In `lib/layout/fitWithinClip.ts`:

| symbol | what it is | cite |
|---|---|---|
| `DEFAULT_CLIP_GUTTER` | `8` | `lib/layout/fitWithinClip.ts:21` |
| `MIN_FITTED_HEIGHT` | `48`, and the per-anchor reachability table is its docblock | `lib/layout/fitWithinClip.ts:32-51` |
| the unmeasured PublishedToggle entry | "room NOT measured", citing the row | `lib/layout/fitWithinClip.ts:38-43` |
| `computeFittedMaxHeight` | `max(FLOOR, min(cap, floor(clipBottom - elementTop - gutter)))` | `lib/layout/fitWithinClip.ts:72-83` |
| `isFloorClamped` | whether the floor OVERRODE the room | `lib/layout/fitWithinClip.ts:99-107` |

In `components/admin/useFitWithinClip.ts`:

| symbol | what it is | cite |
|---|---|---|
| `findClippingAncestor` | first ancestor with a non-`visible` overflow on either axis | `components/admin/useFitWithinClip.ts:48-54` |
| `apply()` | measures inside `withNaturalSize`, writes `max-height`, dev-only `clientLog("debug", …)` when `isFloorClamped` | `components/admin/useFitWithinClip.ts:79-132` |
| the layout effect | `ResizeObserver` on the clip ancestor and the `offsetParent`, a scoped `transitionend`, `window.resize`, all coalesced to one apply per frame | `components/admin/useFitWithinClip.ts:134-201` |

### §2.5 The tests

`tests/e2e/popover-clip-fit.spec.ts` bundles two live entries with pinned esbuild, compiles real
Tailwind, and serves both from one `node:http` server
(`tests/e2e/popover-clip-fit.spec.ts:11-17`, `tests/e2e/popover-clip-fit.spec.ts:43-45`):

| served page | entry | what it mounts |
|---|---|---|
| the default page | `tests/e2e/_pillFocusLiveEntry.tsx` | the REAL `PublishedReviewModal`, hydrated via `createRoot`, through the shared harness |
| the toggle page | `tests/e2e/_publishedToggleClipLiveEntry.tsx` | the REAL `PublishedToggle` inline arm inside a replica `overflow-clip` panel |

Constants: `PANEL` (`tests/e2e/popover-clip-fit.spec.ts:118`), `TOGGLE_BANNER`
(`tests/e2e/popover-clip-fit.spec.ts:122`), `TOGGLE_CLIP`
(`tests/e2e/popover-clip-fit.spec.ts:123`), `GUTTER = 8`
(`tests/e2e/popover-clip-fit.spec.ts:128`), `FLOOR = 48`
(`tests/e2e/popover-clip-fit.spec.ts:132`), `BANNER_OFFSET = 4`
(`tests/e2e/popover-clip-fit.spec.ts:134`), `STRIP` (`tests/e2e/popover-clip-fit.spec.ts:136`).

- T4 (`tests/e2e/popover-clip-fit.spec.ts:541-658`) — four down-direction obligations against the replica panel.
- Anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:720-790`) — the AttentionMenu sweep (`tests/e2e/popover-clip-fit.spec.ts:721-752`) and the narrowed banner
  test (`tests/e2e/popover-clip-fit.spec.ts:754-789`), which asserts only the structural premise and says in its own comment that
  room here is deliberately NOT asserted, citing the row.

`tests/e2e/_publishedReviewModalHarness.tsx` builds the fixture tree: `NOOP_OK` at `tests/e2e/_publishedReviewModalHarness.tsx:223`,
`HarnessStateOverrides` at `tests/e2e/_publishedReviewModalHarness.tsx:243-263`, `modalElement` at `tests/e2e/_publishedReviewModalHarness.tsx:339`, and `setPublished: NOOP_OK` hardcoded
at `tests/e2e/_publishedReviewModalHarness.tsx:375`. `_pillFocusLiveEntry.tsx:117` mounts `modalElement(0, overrides)` live.

`tests/e2e/published-review-modal.layout.spec.ts` owns the panel-column equation (`tests/e2e/published-review-modal.layout.spec.ts:24-37`,
`tests/e2e/published-review-modal.layout.spec.ts:246-308`): sheet `grab + header + subheader + main === panel.clientHeight`, `≥sm`
`header + subheader + main === panel.clientHeight`, plus an explicit
`await expect(page.locator(FOOTER)).toHaveCount(0)` in BOTH modes (`tests/e2e/published-review-modal.layout.spec.ts:308`).

---

## §3 The change

### §3.1 Dock target: the shell's existing `footer` slot

`PublishedReviewModal` stops passing `subHeader` and passes `footer` instead. No new shell mechanism
is introduced and no new wrapper element is added to `ReviewModalShell`.

The footer slot is the dock because it already supplies, unchanged, every property the dock needs:
`shrink-0` (so the `flex-1 min-h-0` body absorbs all remaining height and the footer lands on the
panel's content bottom), `border-t` (the seam now belongs above the strip, not below it),
`bg-surface` and `px-tile-pad` (the chrome the band used to supply), `relative` (a positioned
ancestor for the banner), and
`pb-[calc(--spacing(3)+env(safe-area-inset-bottom,0))] sm:pb-3` — the iOS home-indicator inset,
which a bottom-docked control needs and a sub-header band never did.

**What moves.** The whole `subHeader` fragment moves into `footer` verbatim: the `sr-only`
freshness-announce `<span role="status">` and the `<div data-testid="published-show-review-freshness-band">`
wrapping `<StatusStrip>`. `data-section-freshness-flash` and both test ids are preserved byte for
byte. The announce region stays branch-stable and always mounted, for the reason its own comment
gives (`PublishedReviewModal.tsx:1108-1112`); it is `sr-only`, i.e. `position: absolute`, so it is
out of flow and is not a flex item of the footer.

**The band div gains `w-full`.** It has no width class today because its parent was a block-level
container. Its new parent is `flex flex-wrap items-center`, so without `w-full` it shrink-wraps and
the strip's own `w-full` resolves against a shrunk box. This is the exact evaporation
`StatusStrip.tsx:215-222` predicted. See §5.

**No subHeader band renders for this consumer.** `PublishedReviewModal` passes the slot nothing, and
the shell's truthiness gate then renders no band element (`ReviewModalShell.tsx:696`). Leaving the
`sr-only` span behind in the band would paint an empty bordered seam, which is why the whole
fragment moves rather than splitting.

**The shell is unchanged.** `ReviewModalShell.tsx` gets no edit. Both slots keep their current gates,
classes and test ids; the `subHeader` slot stays available and is still exercised by
`tests/components/admin/review/reviewModalShell.test.tsx` and `tests/e2e/_shareLinkFlashLiveEntry.tsx`
(see §9).

### §3.2 The refusal banner gains an upward arm

`POPOVER_POSITION` splits into a direction-free base and two direction arms:

| constant | value |
|---|---|
| `POPOVER_BASE` | `absolute inset-x-0 z-banner overflow-x-hidden overflow-y-auto rounded-sm p-2 text-sm wrap-break-word shadow-tile` |
| `POPOVER_DOWN` | `top-full mt-1` |
| `POPOVER_UP` | `bottom-full mb-1` |

`top-full`/`mt-1` are today's values, unchanged in the down arm. `bottom-full`/`mb-1` are the mirror:
`bottom-full` places the banner's bottom edge at the anchor's padding-box top, and `mb-1` reproduces
`BANNER_OFFSET = 4` on the other side. Nothing else in the skin changes — same `z-banner`, same
`inset-x-0` full-anchor-width banner, same `overflow-y-auto`, same border/background/focus classes at
the call site (`components/admin/PublishedToggle.tsx:202`).

The arm is chosen by `direction` from §3.3 and applied only in the `showError` branch of the
`inline`/`settings` variant. The `showFinalize` chip and the `card` arm are untouched: both are in
flow and cannot be clipped (§2.3).

### §3.3 Direction predicate

A new hook, `useFlipWithinClip`, returns `{ ref, direction }` and is attached to the banner node
INSTEAD OF `useFitWithinClip` (never alongside it — see §3.4). It is called unconditionally in
`PublishedToggle` for rules-of-hooks, exactly as `fitRef` is today (`components/admin/PublishedToggle.tsx:130-133`), with the same
re-apply key (`errorCode != null || genericError`).

Measured quantities, all from the same layout pass:

```
anchor  = node.offsetParent            // the shell footer (relative), see §3.1
clip    = findClippingAncestor(node)   // the review-modal panel (overflow-clip)

roomBelow = floor(clip.bottom - anchor.bottom - GUTTER - OFFSET)
roomAbove = floor(anchor.top    - clip.top     - GUTTER - OFFSET)
```

`GUTTER = DEFAULT_CLIP_GUTTER` (8) and `OFFSET = 4` (the `mt-1`/`mb-1` gap), both imported or
declared as named constants — never repeated as literals.

The predicate is measured against the ANCHOR, not the banner: the banner's own top edge depends on
the direction, so a predicate keyed to it would be circular.

```
chooseDirection({ roomBelow, roomAbove }):
  if roomBelow >= MIN_FITTED_HEIGHT        -> "down"
  if roomAbove >  roomBelow                -> "up"
  else                                     -> "down"
```

Stated as one sentence: **down unless down does not fit and up is strictly better.**

**Tie-break, explicitly.** When both rooms are under the floor and they are EQUAL, the result is
`"down"`. Down is the stable default: it is today's unconditional behavior, it is what the existing
`isFloorClamped` dev warning already describes, and a tie resolved toward the new arm would make the
direction flicker on a panel oscillating by a pixel during a resize.

**Guard conditions.** Every one of these yields `"down"` and no written cap, which is byte-identical
to today's uncapped behavior:

| input | result |
|---|---|
| `node` null (not yet attached, or detached) | no measurement runs at all |
| `findClippingAncestor` returns `null` (nothing clips) | `"down"`, and any stale inline `max-height` is REMOVED |
| `offsetParent` is `null` (anchor `display:none`, or a `fixed` ancestor) | `"down"`, no cap written |
| `offsetParent` is not an `Element` | `"down"`, no cap written |
| any of `clip.top`, `clip.bottom`, `anchor.top`, `anchor.bottom` non-finite | `"down"`, no cap written |
| anchor of zero height (`top === bottom`) | measured normally — a zero-height anchor is a real geometry, not an error |
| `roomBelow` and `roomAbove` both negative | `"down"` unless `roomAbove > roomBelow`; the overhang warning fires (§3.4) |

**Initial state.** `direction` starts `"down"` and is corrected in a `useLayoutEffect`, before paint,
for the same reason `useFitWithinClip` uses a layout effect (`components/admin/useFitWithinClip.ts:134-136`): a passive effect gives the
overlay one painted frame at the wrong anchor and it visibly snaps.

### §3.4 The cap in the up direction, and why one node never has two owners

An upward banner is bounded by the clip's TOP edge, and `computeFittedMaxHeight` is written for the
bottom edge. Feeding it the downward geometry of an upward banner returns a uselessly large number:
the banner's top is then ABOVE the anchor while `clipBottom` is the panel floor, so
`clipBottom - elementTop` exceeds the banner's own height and, with `cap` = `+Infinity` (§2.3), the
written `max-height` never binds. The banner would then be cut at the panel's top edge with its
scroll tail stranded — the precise defect the module exists to prevent.

The up arm therefore reuses the SAME arithmetic through a coordinate reflection, rather than
reimplementing it:

```
fittedAbove({ bannerBottom, clipTop, cap, gutter }) =
  computeFittedMaxHeight({ elementTop: -bannerBottom, clipBottom: -clipTop, cap, gutter })
```

because `(-clipTop) - (-bannerBottom) === bannerBottom - clipTop`. `isFloorClamped` takes the same
reflection, so the floor, the clamp semantics and the dev warning are identical in both directions by
construction rather than by a second implementation kept in sync by hand.

**One node, one owner.** `useFitWithinClip` and `useFlipWithinClip` both write `max-height` on the
node they are given, so attaching both would produce two writers racing on one style property.
`useFlipWithinClip` owns the banner node outright and handles BOTH directions itself; `fitRef` is no
longer attached in the `inline`/`settings` arm. `useFitWithinClip` keeps every other consumer
(`ReSyncButton`, `AttentionMenu`) untouched.

### §3.5 The `#share-access` deep link

The id lives on `StatusStrip`'s unconditional root and travels with it, so
`/admin?show=<slug>#share-access` (`lib/adminAlerts/alertActions.ts:61`) keeps resolving to
`[data-testid="show-status-strip"]`. Docking makes the anchor permanently visible rather than
scroll-dependent, so the fragment navigation is now a no-op scroll onto an element already in view.
Pinned by AC-6.

---

## §4 Acceptance criteria

| id | criterion |
|---|---|
| AC-1 | `PublishedReviewModal` passes `footer` and no `subHeader`; the strip, the freshness band and the announce span render inside `[data-testid="published-show-review-footer"]`, and `[data-testid="published-show-review-subheader"]` does not exist. |
| AC-2 | Panel column equation holds within 0.5px at 375x812 (sheet) and 1280x900 (`≥sm`): sheet `grab + header + main + footer === panel.clientHeight`; `≥sm` `header + main + footer === panel.clientHeight` (grab hidden, height 0). |
| AC-3 | The footer's bottom edge equals the panel's content bottom within 0.5px, and the body region's height equals `panel.clientHeight` minus the other terms — i.e. the scroll region fills the remainder. |
| AC-4 | The strip root's rendered width equals the footer's content-box width within 0.5px (the `w-full` chain of §5). |
| AC-5 | Driving a refusal through the REAL modal at 375x667 renders `[data-testid="published-toggle-popover"]`, and its measured direction is `up`: `banner.bottom <= anchor.top + 0.5` and `banner.top >= panel.top - 0.5`. |
| AC-6 | `document.querySelector("#share-access")` is the strip root, and that root is inside the footer. |
| AC-7 | Measured at 375x667 through the real modal: `roomBelow < FLOOR` (the fact that justifies the flip) and `roomAbove > FLOOR`, with the margin recorded in the `fitWithinClip.ts` docblock. |
| AC-8 | The banner's written `max-height` equals `roomAbove` within 0.5px when the up arm is taken, and the banner's rendered height never exceeds it. |
| AC-9 | T4's four down-direction obligations against the replica panel still pass unchanged (containment, height-matches-room, scroll-not-strand, tab + ArrowDown). |
| AC-10 | `HarnessStateOverrides` accepts a `setPublished` override; omitted, `modalElement` still passes `NOOP_OK`, and every existing harness consumer is byte-identical. |
| AC-11 | `chooseDirection` returns `"down"` for every guard condition in §3.3's table, and `"down"` on an exact tie under the floor. |
| AC-12 | `rg -n -i 'sticky\s+(status\s?)?strip\|sticky\s+StatusStrip' app components tests lib` returns zero hits, AND all seven sites in §2.3 name the real positioned ancestor, AND the triaged remainder in §2.3 is unchanged. Dated records under `docs/` are out of the sweep by §2.3. |
| AC-13 | `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` is archived with the measured numbers, in the same commit that removes its in-progress marker. |

---

## §5 Dimensional invariants

The panel is a **fixed-height flex column** (`max-h-[85vh]`, `sm:max-h-[80vh]`) with flex children,
and **this repo's Tailwind v4 does not default `.flex` to `align-items: stretch`**. Every
parent-to-child dimension relation below names the exact class that guarantees it. Verified in a real
browser by the AC-2/AC-3/AC-4 Playwright assertions; jsdom computes no layout and cannot stand in.

| parent | child | relation | guaranteeing class | cite |
|---|---|---|---|---|
| panel | grab button | full width; natural height; never shrinks | `w-full shrink-0` on the button | `ReviewModalShell.tsx:662` |
| panel | `<header>` | full width; natural height; never shrinks | `items-stretch` on the panel + `shrink-0` on the header | `components/admin/review/ReviewModalShell.tsx:624`, `components/admin/review/ReviewModalShell.tsx:672` |
| panel | body (`review-main`) | absorbs all remaining height; may shrink to 0 | `min-h-0 flex-1` on the surface root | `ShowReviewSurface.tsx:857` |
| panel | `<footer>` | full width; natural height; never shrinks; **therefore sits at the panel's content bottom** | `items-stretch` on the panel + `shrink-0` on the footer | `components/admin/review/ReviewModalShell.tsx:624`, `components/admin/review/ReviewModalShell.tsx:727` |
| `<footer>` (`flex flex-wrap items-center`) | freshness band div | full width, own line | **`w-full` — NEW, added by this spec** | §3.1 |
| freshness band div | StatusStrip root | full width | `w-full` on the strip root — **previously defensive, now LOAD-BEARING** | `StatusStrip.tsx:226` |
| StatusStrip root (`flex flex-wrap`) | trailing control (`ml-auto`) | flushes to the footer's content edge | the `w-full` chain above | `StatusStrip.tsx:208-222` |
| body (`flex min-h-0 flex-1 flex-col lg:flex-row`) | content pane | fills; scrolls | `min-w-0 flex-1 overflow-y-auto` | `ShowReviewSurface.tsx:1028` |
| `<footer>` (`relative`) | refusal banner (`absolute inset-x-0`) | spans the footer's padding box | `relative` on the footer + `inset-x-0` on the banner | `components/admin/review/ReviewModalShell.tsx:727`, §3.2 |

**The load-bearing flip, stated once.** `StatusStrip.tsx:215-222` records that `w-full` is defensive
"today" and would become load-bearing "the moment the band became a flex container". The footer IS a
flex container. That comment is updated in the same commit to say the condition has fired, naming the
footer, so the next reader does not delete a class its own comment calls optional. AC-4 is the
executable form of that claim.

---

## §6 Transition inventory

Banner states: **A** absent, **B** present-down, **C** present-up. All three pairs enumerated
(3x2/2 = 3), plus compounds.

| pair | treatment |
|---|---|
| A ↔ B | **Instant — no animation.** Today's behavior, unchanged: the banner mounts and unmounts with `showError`, no `AnimatePresence`, no transition classes. |
| A ↔ C | **Instant — no animation.** Same mount path; only the arm class differs. |
| B ↔ C | **Instant — no animation, and never both at once.** `direction` is a single value and selects exactly one arm class on one node; there is no second banner element to cross-fade. The change is written in a layout effect, before paint, so no frame shows the wrong anchor. |

Compound transitions:

| compound | treatment |
|---|---|
| direction changes while the panel is mid-resize (device rotation, browser resize) | The `ResizeObserver` + `window.resize` handlers are coalesced to one apply per frame, so a resize burst produces one direction decision per frame, not one per event. Same coalescer contract as `useFitWithinClip` (`components/admin/useFitWithinClip.ts:146-150`). |
| banner present while the panel's entrance transform is still running | Re-measure on the positioned ancestor's own `transitionend`, scoped to `propertyName === "transform"` — the same scoping `useFitWithinClip.ts:184-188` uses, and for the same reason (an unscoped listener re-measures on every hover fade below it). |
| banner present while the freshness flash animates on the band | Independent. The flash is a background/color animation on the band div and moves no geometry; no re-measure is required and none is triggered. |
| banner present while the AttentionMenu opens | Governed by the existing mutual exclusion (T7, `popover-clip-fit.spec.ts`), unchanged by this spec. |
| banner mounts on the very first frame after the modal opens | The layout effect runs before paint; the entrance `transitionend` then re-measures once the panel's final geometry exists. |

---

## §7 Measurement (the row's obligation)

The row exists because one clip-fit anchor has no real-surface number, for two reasons it names.
Both are removed here.

**Obstacle 1 — the harness cannot drive a refusal.** `HarnessStateOverrides` gains:

```ts
/** Lets a probe drive a REFUSAL through the real modal. Omitted ≡ NOOP_OK, so
 *  every existing harness page is byte-identical. */
setPublished?: PublishedReviewModalProps["setPublished"];
```

and `modalElement` resolves it as `state.setPublished ?? NOOP_OK`. `NOOP_OK` stays the default at
`_publishedReviewModalHarness.tsx:375`. `_pillFocusLiveEntry.tsx` gains a `refusalCode: string | null`
piece of state (initially `null`) and a `window.__setRefusal(code)` driver; the override is passed
only when the code is non-null, so `attention-pill-focus.spec.ts` and every other consumer of that
entry see an unchanged tree.

The refusal code used by the probe is `FINALIZE_OWNED_SHOW` — a member of `KNOWN_REFUSAL_CODES`
(`PublishedToggle.tsx:36-40`) and the same code the replica entry already drives
(`_publishedToggleClipLiveEntry.tsx:81`), so the banner renders catalog copy rather than the generic
retry string.

**Obstacle 2 — the anchor rendered below the clip window.** That was the defect; §3.1 is the repair.
After the dock the anchor is the footer, which is inside the clip window by construction.

**The replacement test.** `popover-clip-fit.spec.ts:754-789` is replaced by a case that keeps its
structural-premise assertion and adds the measurement. It does not trade one for the other:

1. **Structural premise, unchanged in substance.** Walking up from the strip, the first ancestor with
   a non-`visible` overflow on either axis is the review-modal panel — the same walk
   `findClippingAncestor` performs.
2. **Drive the refusal** through the real modal at 375x667 via `window.__setRefusal` plus a click on
   `[data-testid="published-toggle"]`, and wait for `[data-testid="published-toggle-popover"]`.
3. **Measure** `roomBelow` and `roomAbove` from the anchor and clip rects, by the §3.3 formulas, using
   the file's existing `GUTTER` and `BANNER_OFFSET` constants.
4. **Assert** `roomBelow < FLOOR` and `roomAbove > FLOOR` (AC-7); direction is up (AC-5); the written
   `max-height` matches `roomAbove` within 0.5px (AC-8).

Both measured numbers are recorded in the `MIN_FITTED_HEIGHT` docblock at
`lib/layout/fitWithinClip.ts:38-43`, in the same per-anchor form the Re-sync and AttentionMenu
entries use, replacing the "room NOT measured" paragraph. **This is the one edit this arc makes to a
fenced file (§1.2), and it lands only after the number exists.**

**Anti-tautology.** The assertions are derived from measured rects inside the page, never from a
hardcoded pixel value; no literal fitted height appears in the spec file, matching the existing
contract at `popover-clip-fit.spec.ts:22-24`. `roomAbove > FLOOR` would pass on a stub, so AC-8 pins
the WRITTEN cap against the same measurement — a private ref writing `max-height: 1px` satisfies
containment and direction but fails AC-8, which is the precedent the T4 block already records
(`tests/e2e/popover-clip-fit.spec.ts:583-586`). The direction assertion compares `banner.bottom` against `anchor.top`, not against the
panel, because a banner that failed to move would still sit inside the panel.

---

## §8 Flag lifecycle

No boolean config field, feature flag or env gate is introduced or read. `direction` is derived
state, not a flag: it has no storage, is written only by the layout effect that measures, is read
only by the class selection at the banner's call site, and its effect on output is the arm class.
No zombie column.

---

## §9 Blast radius, and the class sweep

Two independent sweeps on 2026-08-25, each stated as the command that produced it rather than as a
list someone has to keep current:

- **Placement:** `rg -n 'subHeader|show-status-strip|-footer|StatusStrip' app components tests` —
  every site that asserts or replicates where the strip lives.
- **Stale anchor claim:** the `rg` in §2.3 — every site that calls the strip sticky.

| site | effect | action |
|---|---|---|
| `tests/e2e/published-review-modal.layout.spec.ts:24-37, 246-308` | The panel-column equation names `subheader` and asserts `FOOTER` count 0 in both modes. | **Update in place** to the §4 AC-2/AC-3 form. This IS the layout-dimensions test; do not add a second one beside it. |
| `tests/e2e/attention-modal-gallery.spec.ts:535` | Comment + `MODAL_BOXES` assert the published modal never renders `-footer`. | Update the comment; add the footer box to the containment list. |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx:865-899` | Asserts the strip renders in the subHeader band and that the band owns the surface/border/padding. | Retarget to the footer. |
| `tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx:111` | Reads `data-section-freshness-flash` off `published-show-review-freshness-band`. | No change — the testid and attribute move with the div. |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx:114` | The loading skeleton mirrors the strip's band placement, so a skeleton with a top band followed by a modal with a bottom dock is a visible jump on every open. | **Repair in this PR** — same shape, same surface, no decision needed. This is the class sweep's one product-facing peer. |
| `tests/e2e/skeletonBandParity.spec.ts` (T-SKELETON-BANDS) | Asserts EXACTLY 3 bands (header, subheader, body) in both the skeleton and the loaded modal, plus subheader class parity (B), seam-offset parity (D, ≤8px) and band-height parity (E, ≤4px at both viewports). Every one of those names the subheader. | **Retarget in this PR**: the three bands become header, body, footer; `-subheader` count 0 and `-footer` count 1 in both states; B/D/E retarget to the footer, with D measuring the body→footer seam. Tolerances unchanged. |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx:113-165` | The skeleton passes the band as `subHeader`, with a ≥sm row mirror and a `<sm` stacked mirror, both already `w-full`. | **Move the whole fragment to `footer`**, unchanged in content. It is what keeps skeletonBandParity green. |
| `tests/e2e/_statusStripToggleHarness.tsx:170-179` (`errorProbeHtml`) | A HAND-ROLLED replica of the banner's `absolute inset-x-0 top-full` geometry — not the real component — backing invariant (d), which measures the real error CONTENT's WIDTH in a width-governing box. | No class change: direction does not affect width, and nothing clips in that harness so the real component would take the down arm there anyway. **Comment updated** to say the replica pins width only and that direction is out of its scope. |
| `tests/e2e/_shareLinkFlashLiveEntry.tsx:126` | A replica entry mounting the REAL shell with the REAL strip in `subHeader`. Its assertions are about the share-link flash cue's colors, not geometry, but a replica that contradicts production placement is a fixture that will mislead the next reader. | **Repair in this PR** — one prop rename, no assertion change expected. |
| `tests/components/admin/review/reviewModalShell.test.tsx:169-235, 334-345` | Exercises the `subHeader` slot generically against a test Host, not against `PublishedReviewModal`. | No change. The slot still exists and is still contract-tested. |
| The seven stale-anchor sites enumerated in §2.3 | Each asserts the strip is sticky and/or is the banner's positioned ancestor. Both halves are false today and stay false after the dock. | **Repair all six in this PR.** Cover is the §2.3 `rg` returning zero live hits (AC-12), not the table. |
| `docs/superpowers/plans/admin/2026-07-17-casp2-*.md`, `docs/superpowers/specs/admin/2026-07-17-casp2-*.md` | Same phrase, in dated historical records. | **Deliberately unchanged** (§2.3). |
| `tests/e2e/statusStripToggleLayout.spec.ts` | Real-browser geometry for the compact inline toggle in the strip; its overhang assertions are about the FINALIZE chip staying in flow, not about the refusal banner's direction. | Comments corrected (site 6 above); assertions unchanged — verify green, do not adjust. |
| `components/admin/ReSyncButton.tsx`, `AttentionMenu` | Other `useFitWithinClip` consumers. | Untouched — the hook is not edited and keeps every consumer it has. |

**Disposition.** Every peer either repairs in this PR or carries its reason in the row above. Nothing
is deferred to a follow-up, so no `BL-` filing is owed under exception (a), (b) or (c). The two
judgment calls, stated so a reviewer verifies rather than re-derives: `ShowReviewModalSkeleton` is
repaired because a skeleton that contradicts the modal it precedes is a visible jump on every open,
which is product-facing; the dated `docs/` records are not repaired because correcting a dated record
destroys the evidence of what a decision was taken against.

---

## §10 Documented limits

Each is a conservative outcome plus a surfaced signal, not a silent wrong answer. Per the
consequence bound in §11, these are limits, not findings.

1. **Two fit hooks, not one.** `useFlipWithinClip` duplicates the observer wiring of
   `useFitWithinClip` rather than adding a direction to it, because `arc-layoutmeasure` owns that
   file for the duration of this arc (§1.2). Consequence: a future change to the attach mechanism
   must be applied twice. **Re-file trigger:** when `feat/fitwithinclip-measure-class` merges and the
   fence lifts, fold `direction` into the single hook and delete the second. Recorded here rather
   than in the ledger: the repair changes nothing a crew member, admin or operator observes, so it is
   process-facing and the 2026-08-25 process mint freeze sends it to the owning surface's
   documented-limits record.

2. **Both directions under the floor.** When `roomBelow` and `roomAbove` are both under
   `MIN_FITTED_HEIGHT`, the banner takes the down arm and overhangs its clip edge, exactly as today,
   with the existing dev-only `isFloorClamped` warning firing. Collapsing the box instead would
   strand every control inside it — the least-bad of two bad options, and the choice
   `fitWithinClip.ts:28-30` already ratified. Not reachable on any supported viewport after the dock:
   `roomAbove` at 375x667 is measured in §7 and exceeds the floor by the margin recorded there.

3. **Measured at the fixture viewports.** This spec's own new measurement is at 375x667, the
   tightest supported phone and the viewport the row names. The declared probe domain (§11) is
   375x667, 375x844, 390x560 and 390x844. What the repo already sweeps is adjacent but not
   identical, and the difference is stated rather than blurred: the AttentionMenu census sweeps
   375x{844, 667, 560, 400} (`tests/e2e/popover-clip-fit.spec.ts:734`) and T4 runs at 390x560
   (`tests/e2e/popover-clip-fit.spec.ts:545`). A viewport outside the declared domain is not a claim
   this spec makes; widening the set is a new measurement, not a finding.

4. **`offsetParent` is the anchor.** The predicate reads `node.offsetParent`, which returns `null`
   inside a `position: fixed` ancestor and for a `display: none` subtree. Both yield the down arm
   with no cap written, which is today's behavior. A `transform`/`filter`/`contain` ancestor between
   the banner and the footer would change the containing block without changing `offsetParent`; none
   exists on this path today, and AC-5 measures the real relation rather than assuming it.

---

## §11 Convergence criterion (carried into every review brief)

**Consequence bound.** At every supported viewport the Published switch is reachable, and the refusal
banner is either fully readable or scrollable within its clip — never silently cut. A conservative
clamp plus a surfaced dev warning is a documented limit, not a finding.

**PROBE DOMAIN.** The review modal at the fixture viewports the suite already uses — 375x667,
375x844, 390x560, 390x844 — through the shared harness (`_publishedReviewModalHarness.tsx` via
`_pillFocusLiveEntry.tsx`) and the replica entry (`_publishedToggleClipLiveEntry.tsx`). A probe
outside those viewports, or against a hand-built panel, files to §10 rather than to a finding.

**Threat fence.** Ordinary responsive layout under real compiled Tailwind at supported phone sizes.
Adversarial CSS injected into the panel, a caller mounting the strip outside the shell, and hostile
ancestor stacking are out of scope and file to §10.

---

## §12 Out of scope

- Any change to `components/admin/useFitWithinClip.ts` or `lib/layout/fitWithinClip.ts` other than
  the `lib/layout/fitWithinClip.ts:38-43` docblock (§1.2).
- Any user-visible copy change in `PublishedToggle` (§1.1 item 4).
- The wizard's Step 3 modal, which never passes `subHeader` and is asserted unchanged by
  `reviewModalShell.test.tsx:334-345`.
- Re-hosting `StatusStrip` on any surface other than the published review modal.
- Server actions: none is touched, so invariant 10 does not apply.
