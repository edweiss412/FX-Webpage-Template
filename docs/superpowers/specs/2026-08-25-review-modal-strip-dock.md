# Review-modal StatusStrip dock, header bound, and upward refusal banner

**Row:** `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` (`BACKLOG.md`, effort M, filed 2026-08-02).
**Branch:** `feat/review-modal-strip-dock`. **Decision:** Option A, ratified by Eric 2026-08-25.
**Facing:** product.

The published review modal's control strip sits in a band directly under the identity header. This
spec docks it to the bottom of the panel, scrolls the change list above it, and gives the publish
refusal banner an upward arm so it stays readable once its anchor is at the panel floor.

**Read §0 before anything else.** The pre-spec measurement refutes the premise the row was filed on,
and it changes what this spec may claim. Nothing below assumes the strip is unreachable in the
ordinary state, because it is not.

---

## §0 Pre-spec measurement, and what it refutes

Run 2026-08-25 against the live hydrated harness (`tests/e2e/_pillFocusLiveEntry.tsx` mounting the
REAL `PublishedReviewModal` through `tests/e2e/_publishedReviewModalHarness.tsx`), in Chromium under
real compiled Tailwind, reduced motion, viewport 375x667. Measured with `getBoundingClientRect()`.
This is the empirical spike `docs/agents/spec-self-review.md` requires before speccing a layout /
lifecycle surface, and it earned its cost immediately.

Panel: top `100.0625`, bottom `667`, height `566.9375`, `clientHeight` 567, overflow `clip/clip`.

| attention items | menu | header h | strip rect | body h | publish switch |
|---|---|---|---|---|---|
| 0 | closed | `164.1875` | `316.25 .. 514.25` | `143.75` | reachable, `348.25 .. 392.25` |
| 2 | open | `164.1875` | `316.25 .. 514.25` | `143.75` | reachable, `348.25 .. 392.25` |
| 30 (10/10/10) | open | `560.96875` | `713.03125 .. 911.03125` | `0` | NOT reachable, `745.03 .. 789.03` |

Column sum at 0 items: `44 + 164.1875 + 215 + 143.75 = 566.9375` — exactly the panel height, so the
column is intact and nothing overflows.

**What this refutes.** `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` records the strip at
`713.03..911.03` against a panel bottom of `667`, room `-257px`, and asks whether that is "an
unrepresentative fixture or a real responsive defect". It reproduces EXACTLY — and only in the third
row. At a realistic attention load the strip is fully inside the clip window and the Published switch
is already reachable at 375x667 today. The row's figure was taken with the attention menu open on a
30-item stress fixture.

**What causes the third row, and it is not the strip.** The shell header is
`flex shrink-0 items-start gap-3` (`components/admin/review/ReviewModalShell.tsx:672`) holding a
`min-w-0 flex-1` text block and a `shrink-0` action cluster
(`components/admin/showpage/PublishedReviewModal.tsx:902` and
`components/admin/showpage/PublishedReviewModal.tsx:952`). A composite attention pill
widens the `shrink-0` cluster, which squeezes the `flex-1` title block at 375px: the `h2` wraps from
`54` to `324` and the subline from `83` to `210`, so the header reaches `561` inside a `567` panel
and everything below it is pushed out of the `overflow-clip` window. The modal's own comment predicts
this class and caps the count at 99+ (`components/admin/showpage/PublishedReviewModal.tsx:1000`) —
which caps digits, not segments.

**What that means for the dock, stated rather than buried.** Docking does NOT by itself make the
switch reachable in the 30-item state. Header `561` plus a docked footer of roughly `222` is `783`
against a `567` panel, and both are `shrink-0`, so the column overflows and the footer is pushed out
exactly as the band is today. The dock's honest, measured benefits are different ones and this spec
claims only those:

1. **Ordering.** The controls become the last thing in the column instead of the third, so chrome
   growth above them pushes the SCROLL REGION, which can absorb it, rather than the controls, which
   cannot. That is a real structural improvement even while an unbounded header can still defeat it.
2. **Reach.** Bottom-docked controls are thumb-reachable on a phone; the band at `316..514` on a
   667px screen is not, in the one-handed posture Doug actually uses on a venue floor.
3. **A measurable anchor.** The refusal banner finally gets a real-surface room number, which is the
   row's actual obligation.

**The header bound is IN SCOPE, by orchestrator ruling.** This spec's first draft proposed deferring
it to a sibling arc under class-sweep exception (c). bl-orch overruled that on 2026-08-25 and the
ruling is recorded here so it is not relitigated in either direction:

> SCOPE CALL: B. Eric's ratified decision is 'reachable on every phone'; your spike shows the dock
> alone does not deliver it at 30 items, so the header bound is part of the same deliverable, not
> another instance of a shape. Constrain it: bound the shrink-0 action cluster (composite pill) so
> the title never wraps past two lines at 375px, or let the title truncate; do not restructure the
> shell. Reviewers get the shell contract tests in scope explicitly. Assert the measurement across
> item counts (0, 2, 30) so the stress state and the ordinary state are both pinned.

The reasoning that settles it: the deliverable is the GOAL Eric ratified, not the mechanism named
alongside it, and a dock that is pushed out of the panel by the header delivers no goal at all. §3.0
is the bound, constrained exactly as the ruling constrains it. It is product-facing (a header that
hides the publish switch is something an admin sees), so the 2026-08-25 process mint freeze is not
in play.

**Probe hygiene.** The probe was a temporary `test.describe` appended to
`tests/e2e/popover-clip-fit.spec.ts`, run through its existing boot so it measured the same served
page the census does, then reverted — it is not part of the diff. It varied ONE dimension (item
count) across three values and read the header's subtree rather than only the strip, which is what
separated the two candidate causes; a probe that sampled the 30-item state alone would have
reproduced the row's number and confirmed the wrong diagnosis.

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

5. **The banner stays an out-of-flow overlay; the side is chosen, not re-skinned.** The considered
   alternative was rendering the refusal IN FLOW as the footer's first line, above the strip row.
   Rejected for three reasons, recorded so a reviewer does not re-derive them: (a) the ratified
   decision and the arc brief both specify a banner that *opens upward*, i.e. an overlay with a side;
   (b) an in-flow banner grows the dock, which shoves the change list mid-scroll, whereas an overlay
   leaves the scroll position untouched — errors here are momentary by design
   (`components/admin/PublishedToggle.tsx:69-70`: "This is ERROR-ONLY: errors are momentary"); (c) it
   would retire the overlay skin wholesale, taking with it the T4 containment / fit / scroll /
   keyboard obligations in `tests/e2e/popover-clip-fit.spec.ts`, the registry row
   (`tests/components/admin/showpage/popoverOverlayRegistry.ts:105-111`), and the `z-banner` rule
   against Re-sync's `z-overlay` (`components/admin/ReSyncButton.tsx:57`) — a far larger blast radius
   than choosing a side.

6. **The side is MEASURED, never hardcoded to the new dock.** Once the strip is docked, the space
   below its anchor is negative at every supported viewport, so the top side is what production takes
   in practice. The placement module still measures, for a stated reason: hardcoding a side would
   encode today's dock into the overlay, and §7's assertion would then restate a constant instead of
   measuring a surface. The bottom side is not dead — it is `preferredSide`, it is what wins every
   tie (`lib/popover/position.ts:129`), and it is what the replica entry
   (`tests/e2e/_publishedToggleClipLiveEntry.tsx`) exercises, which is where T4's four
   bottom-side obligations live.

7. **The header bound ships in this arc.** bl-orch's 2026-08-25 SCOPE CALL B, quoted in full in §0.
   The deferral this spec originally proposed is superseded. Equally not relitigable in the other
   direction: the bound is the two changes in §3.0 and nothing more — no shell restructuring, no cap
   on item counts, no pill copy change, no hidden segment.

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

### §3.0 Bound the header so the dock can hold

The dock is only as good as the column it sits in. §0 measures the column failing at 30 items because
one `shrink-0` child grows without limit; a `shrink-0` footer under an unbounded `shrink-0` header is
pushed out exactly as the band is. So the bound ships with the dock, in the order cause-then-effect.

**Bound the cause, not each symptom.** Both measured symptoms — the `h2` at `324` and the subline at
`210` — have ONE cause: the `shrink-0` action cluster takes whatever width it wants, and the
`min-w-0 flex-1` text block gets the remainder. At 30 items the pill reads
`10 issues · 20 monitoring`, the cluster reaches roughly `242` of the header's `335` content width,
and the title column is starved to roughly `81`. Clamping the title alone would leave the subline
starved; capping the cluster fixes both, because both are downstream of the same width.

**The change, in three parts, applied as one set.** None restructures the shell, per the ruling.

1. **Cap the action cluster below `sm`.** `components/admin/showpage/PublishedReviewModal.tsx:952`
   becomes `flex shrink-0 items-center gap-2 max-sm:max-w-40` (`max-w-40` = `10rem` = `160px`; the
   constant is derived below, not chosen).
2. **Let the pill wrap inside that cap.** The pill gains `min-w-0` and `flex-wrap` below `sm`, so its
   content reflows onto a second line instead of overflowing the capped cluster. **No copy is cut,
   no segment is hidden and nothing ellipsises** — measured, see the sweep.
3. **Clamp the title to two lines below `sm`.** The `h2`'s inner span
   (`components/admin/showpage/PublishedReviewModal.tsx:913`) gains `max-sm:line-clamp-2`. This is
   the guarantee the ruling names in as many words. It is belt-and-braces, not redundant: parts 1-2
   bound the width the title has to work with, part 3 bounds the height it may take whatever that
   width turns out to be. `line-clamp` is visual only — the full text stays in the accessibility
   tree, so `aria-labelledby={h2Id}` still names the dialog with the complete title.

**The cap is MEASURED. Sweep run 2026-08-25, same harness and viewport as §0**, applying all three
parts in-page and reading `getBoundingClientRect()`. `headerH` is the number that matters; the
0-item baseline is `164.19`.

| cap | items 0 | items 2 | items 30 | pill height @30 | any truncation |
|---|---|---|---|---|---|
| none (today) | `164.19` | `164.19` | **`560.97`, strip and switch OUTSIDE the panel** | `24.8` | no |
| `96` | **`143.89`** | **`143.89`** | `143.89` | `105.19` | no |
| `112` | `164.19` | `164.19` | `164.19` | `105.19` | no |
| `128` | `164.19` | `164.19` | `164.19` | `105.19` | no |
| `144` | `164.19` | `164.19` | `164.19` | `105.19` | no |
| **`160`** | **`164.19`** | **`164.19`** | **`164.19`** | `65.59` | no |
| `176` | `164.19` | `164.19` | `164.19` | `65.59` | no |
| `192` | `164.19` | `164.19` | **`184.48`** | `47.59` | no |

At every capped row the strip's rect and the publish switch's rect lie inside the panel; at the
uncapped row both lie outside. `96` is rejected even though it "passes" the containment check: it
changes the 0-item header height, i.e. it alters the ordinary state to fix the stress state.

**Why `160` and not the largest passing value.** `176` is the largest cap that holds and `192` is the
first that fails, so `176` sits on its own boundary — a font-metric shift or one more pill segment
walks it over. `160` is one step below, leaving `32px` of margin to the failure point, and it still
clears the 2-item cluster's natural width of `147.73`, so no realistic attention load is affected at
all: at 0 and 2 items the cluster measures `125.38` and `147.73`, both under the cap, and the rendered
header is byte-identical to today. **The cap engages only in the stress state it exists for.**

**What is doing the work, since the sweep applied three changes together.** The cap and the pill wrap.
At `160`/30 items the header is `164.19`, which is exactly the 0-item height where the title renders
on ONE line — so `line-clamp-2` cannot be contributing, because clamping a one-line title is a no-op.
The clamp is a guarantee against a title longer than the fixture's, which is
`"Published Modal Layout Fixture"` (`tests/e2e/_publishedReviewModalHarness.tsx:94`, 30 characters);
real `II -` show titles run far longer, and §7 exercises the saturated-title fixture for exactly that
reason. Stated plainly so a reviewer does not have to infer it: **the clamp does not engage at the
measured loads, and it is kept anyway.**

The cap lives in ONE place. `max-sm:max-w-40` is the Tailwind spelling; the sweep test derives its
expectation from the rendered cluster width rather than repeating `160`, so the two cannot drift.

**What the bound does not do.** It does not cap the number of attention items, change any pill copy,
hide any segment, or alter the menu. It does not touch `ReviewModalShell`, so Step 3's header is
byte-identical — pinned by AC-16.

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

### §3.2 The refusal banner migrates to the placement module

**This replaces the "add an upward arm to `POPOVER_POSITION`" design of this spec's first draft.** The
first draft was going to invent a direction predicate and a second fit hook. The repo already has
both, in a module built for exactly this panel, and a structural guard that steers new work toward it.
Finding that is the point of the mandatory citation pass; using it is the point of
`subtract-before-you-add`.

**The mechanism.** `lib/popover/position.ts`'s `computePopoverPlacement` takes a `preferredSide` and
returns the side it actually chose plus a fitted `maxHeight`, both bounded by the host rect
(`lib/popover/position.ts:122-135`):

```
if (height0 <= space(preferredSide)) side = preferredSide;
else if (height0 <= space(other))    side = other;          // <- the flip
else { side = space(preferredSide) >= space(other) ? preferredSide : other; maxHeight = space(side); }
```

That is the whole of scope item 2, already written and already unit-tested
(`tests/lib/popover/position.test.ts`). The tie-break this spec's first draft had to invent is the
`>=` on the last line: **ties go to `preferredSide`**, which for this banner is `bottom` — the same
"down is the stable default" the first draft argued for, but implemented once rather than twice.

**The migration, mirroring the two that came before it.** `components/admin/PublishedToggle.tsx`:

1. Portal the banner into the panel via `PopoverHostContext`
   (`components/admin/HoverHelp.tsx:77`), the provider the shell already wraps around the entire panel
   interior (`components/admin/review/ReviewModalShell.tsx:643`).
2. Position it with `placeWithinVisibleViewport` (`lib/popover/place.ts:33`) inside
   `withNaturalSize` (`lib/popover/naturalSize.ts`), driven by a `createRafCoalescer`
   (`lib/popover/rafCoalescer.ts`) — the template is `ShareHub`'s `applyPlacement`
   (`components/admin/showpage/ShareHub.tsx:268-400`), which this banner's version is a strict
   simplification of.
3. `preferredSide: "bottom"`, `align: "left"`.
4. **The trigger is the StatusStrip root, not the switch.** This is what preserves the CASP2-2
   full-strip-width intent (`components/admin/PublishedToggle.tsx:49-58`: a full-width banner "reads
   as belonging to the strip", and the pre-CASP2-2 right-anchored `max-w-60` box "sat at a phantom
   right edge while a long title wrapped the toggle far-left"). Passing the strip as the trigger and
   its width as `naturalSize.width` yields a strip-width, strip-aligned box — the same visual
   contract, now reachable.
5. **No caret.** The banner has never had one; the returned `caret` is ignored, and no caret element
   is added. `computePopoverPlacement` returns it unconditionally, so ignoring it is the adaptation,
   not a gap.
6. `POPOVER_POSITION`'s `absolute inset-x-0 top-full mt-1` becomes `absolute` plus the declared cap
   the placement core reads as its `cap` input, in the `max-h-[...]` idiom ShareHub uses
   (`components/admin/showpage/ShareHub.tsx:897`). Everything else in the skin — `z-banner`,
   `overflow-y-auto`, the border, background, focus ring, `wrap-break-word` — is unchanged.

**What this design DELETES relative to the first draft:** a new pure flip module beside `lib/layout/fitWithinClip.ts`, a new DOM hook beside
`components/admin/useFitWithinClip.ts`, a coordinate-reflection trick over
`computeFittedMaxHeight`, a hand-written direction predicate with its own guard table, a duplicated
`ResizeObserver`/`transitionend`/`resize` wiring, and the documented limit that admitted the
duplication. Net new modules: zero.

### §3.2a The SAME move is forced on Re-sync's three overlays (round-1 finding 1)

The first draft declared `components/admin/ReSyncButton.tsx` untouched. That was wrong, and the
component's own docblock says why:

> All THREE result surfaces anchor to the BAND, not the strip: the component's root is a fragment, so
> it generates no box and these resolve their containing block to the nearest positioned ancestor —
> the subheader band (`relative`, ReviewModalShell.tsx), which is what gives them full-band width. The
> strip root deliberately has no `relative` for exactly this reason.
> (`components/admin/ReSyncButton.tsx:50-55`)

`OVERLAY_PANEL` is `absolute inset-x-0 top-full z-overlay max-h-[min(50vh,20rem)] overflow-y-auto …`
(`components/admin/ReSyncButton.tsx:72-74`), shared by `admin-resync-error`,
`admin-resync-shrink-confirm` and `admin-resync-success`, each given to `useFitWithinClip`
(`components/admin/ReSyncButton.tsx:111-113`).

**Docking the strip re-anchors all three to the footer**, where `top-full` puts them below the
panel's clip edge. A height cap cannot move a box upward, so their content — including the shrink
confirm's decision buttons, the precise controls
`docs/superpowers/specs/2026-08-01-admin-popover-overlay-cluster` exists to keep reachable — becomes
unreachable. **This is not a class-sweep preference; it is forced.** The dock breaks these three, so
repairing them is part of shipping the dock.

They take the same migration as §3.2, for the same reason, which is what makes this one move rather
than two: `preferredSide: "bottom"`, trigger = the StatusStrip root (preserving the full-band width
the docblock calls load-bearing), `max-h-[min(50vh,20rem)]` staying as the declared cap the placement
core reads. Their three registry rows move to `placement-module` alongside the banner's.

**One visible consequence, stated rather than discovered later.** The panels currently ABUT the band's
bottom edge with no `mt-*`, deliberately, "so it reads as attached to the strip rather than floating
free over the rail", and `T-OVERLAY` pins that abut to within 1px
(`components/admin/ReSyncButton.tsx:67-70`, `tests/e2e/published-review-modal.interactions.spec.ts:670`).
The placement module applies `GAP = 6` (`lib/popover/position.ts:16`), a module constant with no
per-call override, so the abut becomes a 6px gap. The original rationale was about a panel hanging
DOWN over the rail; opening upward from a bottom dock it is over the change list either way, and a 6px
gap is exactly what `ShareHub`'s popover already does from this same strip. `T-OVERLAY`'s abut
assertion is retargeted to the 6px gap, and the change goes to the invariant-8 impeccable gate as a
visible change to a shipped surface rather than being absorbed silently.

**`z-overlay` vs `z-banner` survives the migration.** `components/admin/ReSyncButton.tsx:56-62` records
it as a RULE, not a default: both overlays anchor to the same ancestor and are independently
triggerable, and an unspecified z-index can leave the shrink confirm rendered UNDERNEATH the publish
popover while focus sits on "Keep current version". Both keep their z-classes; the placement module
writes position, never z-index.

### §3.3 The registry row changes disposition, and that IS the finding

`tests/components/admin/showpage/popoverOverlayRegistry.ts:105-111` carries
`published-toggle-popover` as `fit-within-clip`, with this reason:

> Absolutely anchored inside the sticky strip inside the review-modal panel (overflow-clip, NOT a
> scroll container); useFitWithinClip caps it against that edge. **Full-width inset-x-0, so
> side-flipping buys nothing.**

Both halves are now false. The "sticky strip" never existed (§2.3). And "side-flipping buys nothing"
was true only while the anchor sat mid-panel — this arc moves it to the panel floor, where side
flipping buys the entire feature. The registry's own `fit-within-clip` reasons name that condition
explicitly ("Full-width inset-x-0, where flipping sides buys nothing, so the placement module is not
worth the churn", `tests/components/admin/showpage/popoverOverlayRegistry.ts:89`), so the trigger
for migration is stated in the registry and this arc fires it.

That row and Re-sync's three (§3.2a) all become `placement-module` — four rows, one move. `IMPORT_FOR_DISPOSITION`
(`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:31-39`) then requires
`components/admin/PublishedToggle.tsx` to import from `@/lib/popover/position` and no longer checks
for the `useFitWithinClip` import — so the guard verifies the migration rather than obstructing it.

**This is the third migration in the series, not a novel move.** `HoverHelp` migrated 2026-07-22 and
`ShareHub` 2026-07-24, the latter from exactly this failure: "before this it was the live instance of
the defect (armed Archive confirm unreachable at every phone height)"
(`tests/components/admin/showpage/popoverOverlayRegistry.ts:78-81`).

### §3.4 The concurrency fence is no longer engaged for the banner

The first draft needed a second hook because `components/admin/useFitWithinClip.ts` is owned by
`arc-layoutmeasure` and could not be given a direction (§1.2). Under §3.2 the banner **stops
consuming that hook** rather than forking it, so this arc neither edits nor duplicates the fenced
files. `ReSyncButton` and `AttentionMenu` keep the hook and are untouched.

One consequence for §7. The per-anchor reachability table in
`lib/layout/fitWithinClip.ts:32-43` documents the anchors the FIT hook serves. The PublishedToggle
banner leaves that set, so its entry is not filled in with a number — it is **retired**, replaced by
one line recording that the anchor migrated to the placement module on this arc and naming where the
measurement lives. That is a smaller and safer edit to the fenced file than the first draft's, and it
leaves the docblock true rather than describing an anchor it no longer serves. The measured numbers
still land, in §7's test and in the registry row's reason.

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
| AC-5 | Driving a refusal through the REAL modal renders `[data-testid="published-toggle-popover"]` with `data-popover-side="top"` (the placement module's own output), the banner's rect lies entirely inside the panel, and its bottom sits `GAP` above the trigger's top within 0.5px. Asserted at all four domain viewports, each with the attention load set EXPLICITLY rather than inherited: round-1 finding 2 established that `tests/e2e/_pillFocusLiveEntry.tsx:101-107` boots at 1 actionable + 1 needs-look + 1 self-heal, a load of 3 that is outside the declared domain, so every refusal case calls `__setItems` first. |
| AC-6 | `document.querySelector("#share-access")` is the strip root, and that root is inside the footer. |
| AC-7 | Measured at 375x667 through the real modal, in the placement module's own terms: `spaceBelow` is under the banner's natural height and `spaceAbove` exceeds it, so the top side is chosen because it is the only one that fits. Both numbers recorded — in the test and in the migrated registry row's reason — and the retired `lib/layout/fitWithinClip.ts` entry cross-references them. |
| AC-8 | When the banner does not fit on either side, the placement module's `maxHeight` is written and the banner's rendered height equals the space on the chosen side within 0.5px; when it does fit, no `max-height` beyond the declared CSS cap is written and the rendered height is the natural height. Both branches are asserted, because asserting only the capped one passes against a component that never caps. |
| AC-9 | T4's four down-direction obligations against the replica panel still pass unchanged (containment, height-matches-room, scroll-not-strand, tab + ArrowDown). |
| AC-10 | `HarnessStateOverrides` accepts a `setPublished` override; omitted, `modalElement` still passes `NOOP_OK`, and every existing harness consumer is byte-identical. |
| AC-11 | The CONSUMER handles `kind: "hidden"` the way `ShareHub` does: on a degenerate measurement (SSR, jsdom, mid-unmount, zero-area trigger) the banner is left `visibility: hidden` with no `data-popover-side`, and recovers on the next frame rather than writing NaN coordinates. The placement algebra's own boundaries are already owned by `tests/lib/popover/position.test.ts` and are NOT re-asserted here — re-testing an imported pure module through a component is the tautology this arc is meant to avoid. |
| AC-12 | `rg -n -i 'sticky\s+(status\s?)?strip\|sticky\s+StatusStrip' app components tests lib` returns zero hits, AND all seven sites in §2.3 name the real positioned ancestor, AND the triaged remainder in §2.3 is unchanged. Dated records under `docs/` are out of the sweep by §2.3. |
| AC-13 | `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` is archived with the measured numbers, in the same commit that removes its in-progress marker. |
| AC-14 | **The full domain sweep, 4 viewports x 3 loads = 12 combinations, not 3.** For each of 375x667, 375x844, 390x560 and 390x844, crossed with attention loads 0 (menu closed), 2 and 30 (menu open): the header's height equals its 0-load height AT THAT VIEWPORT within 0.5px, the strip's rect lies entirely inside the panel, and the publish switch's rect lies entirely inside the panel. This is the executable form of "reachable on every supported phone" and it is the arc's central assertion. Round-1 finding 2: the first draft asserted only the three combinations at 375x667 while §11 declared twelve, leaving nine unpinned. The baseline is per-viewport because header height is width-dependent. |
| AC-15 | At all twelve combinations the panel column sums to `panel.clientHeight` within 0.5px (grab + header + main + footer in sheet mode; no grab term at `≥sm`), so no child overflows and the body never collapses to 0. |
| AC-16 | Step 3's modal header is byte-identical: `ReviewModalShell.tsx` is unmodified, and `tests/components/admin/review/reviewModalShell.test.tsx` passes unchanged, including the T-STEP3-INVARIANT cases. |
| AC-17 | The pill's full copy survives the cap: at 30 items every segment (`10 issues`, the middot, `20 monitoring`) is present in the pill's `textContent`, and no segment carries `display: none` or an ellipsis. **Plus geometric containment, which text assertions cannot establish (round-1 finding 5): the pill's rect and its `relative` wrapper's rect both lie within the capped cluster's rect, and the pill's rect does not intersect the title block's rect.** The accessible name of the dialog still contains the complete title despite `line-clamp-2`. |
| AC-18 | The cap is written once, as `max-sm:max-w-40` on the action cluster; the sweep test derives its expectations from measured rects (the cluster's rendered width, the 0-item header height) and never repeats `160` or `164.19` as a literal. |

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
| `<header>` (`flex items-start gap-3`) | text block | takes the width the cluster leaves, never less than the header width minus `160px` minus the gap | `min-w-0 flex-1` on the block + `max-sm:max-w-40` on the cluster — **NEW, and it is the header bound** | `components/admin/showpage/PublishedReviewModal.tsx:902`, `components/admin/showpage/PublishedReviewModal.tsx:952`, §3.0 |
| text block | `h2` inner span | at most two rendered lines below `sm`; full text still in the a11y tree | `max-sm:line-clamp-2` — **NEW** | `components/admin/showpage/PublishedReviewModal.tsx:913`, §3.0 |
| `<header>` action cluster (capped, `flex items-center`) | **the pill's `relative` wrapper — a DIRECT flex item, which the first draft's table skipped (round-1 finding 5)** | must not exceed the cluster's cap; a flex item defaults to `min-width: auto`, so its min-content width can force it WIDER than a capped parent | **`min-w-0` on that wrapper — NEW.** `items-center` is cross-axis only and transfers no width cap; nothing else in the chain constrains this element | `components/admin/showpage/PublishedReviewModal.tsx:966` |
| the pill's `relative` wrapper | pill button | wraps inside the cap instead of overflowing it; at 30 items it measures `65.59` tall, which exceeds the `44px` close button, so the CLUSTER's height is pill-driven in the stress state — it still does not drive the header, because the text block is taller | `min-w-0` + `max-sm:flex-wrap` on the pill | `components/admin/showpage/PublishedReviewModal.tsx:976`, §3.0 |

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
3. **Measure the space on each side**, using the placement module's own quantities so the test and
   the implementation cannot disagree about what "room" means: with `bounds` = the panel rect inset
   by `VIEWPORT_INSET` and `trigger` = the StatusStrip root,
   `spaceBelow = max(0, bounds.bottom - trigger.bottom - GAP)` and
   `spaceAbove = max(0, trigger.top - bounds.top - GAP)`
   (`lib/popover/position.ts:114-115`). `GAP` and `VIEWPORT_INSET` are imported from that module,
   never retyped.
4. **Assert** `spaceBelow` is under the banner's natural height while `spaceAbove` exceeds it — which
   is what makes the top side the CHOSEN one rather than an arbitrary one — and that the banner
   carries `data-popover-side="top"`, sits entirely inside the panel, and its bottom is `GAP` above
   the trigger's top within 0.5px (AC-5, AC-7, AC-8).

Both measured numbers are recorded, and the fenced file's edit shrinks accordingly. The per-anchor
table at `lib/layout/fitWithinClip.ts:32-43` documents the anchors the FIT hook serves; this anchor
leaves that set, so its entry is **retired** — replaced by one line naming the migration and where the
measurement lives — rather than filled in with a number for a hook that no longer serves it. That is
the arc's only edit to a fenced file, it is a deletion plus a cross-reference, and it lands only after
the measurement exists.

**Anti-tautology.** Every assertion derives from rects measured inside the page; no literal pixel
value appears in the spec file, matching the existing contract at
`tests/e2e/popover-clip-fit.spec.ts:22-24`. Three separate escapes are closed deliberately:
`spaceAbove > naturalHeight` alone would pass against a component that never places at all, so the
`data-popover-side` assertion pins that the module ran and chose; `data-popover-side="top"` alone
would pass against a component that writes the attribute and no coordinates, so the `GAP`-above-trigger
assertion pins the geometry; and containment alone is satisfied by a private ref writing
`max-height: 1px`, which is the escape cross-model review already found on the T4 block
(`tests/e2e/popover-clip-fit.spec.ts:583-586`), so AC-8 asserts BOTH branches — capped when neither
side fits, uncapped when the chosen side does.

---

## §8 Flag lifecycle

No boolean config field, feature flag or env gate is introduced or read. `direction` is derived
state, not a flag: it has no storage, is written only by the layout effect that measures, is read
only by the class selection at the banner's call site, and its effect on output is the arm class.
No zombie column.

---

## §9 Blast radius, and the class sweep

**The first draft's cover was narrower than it claimed, and round-1 finding 1 is that defect.** Its
placement sweep was `rg -n 'subHeader|show-status-strip|-footer|StatusStrip'` — case-SENSITIVE on
`subHeader`, which is the PROP spelling. The rendered test id is lower-case `subheader`, and
`published-review-modal.interactions.spec.ts` builds its selector as `` `${BASE}-subheader` ``. So an
entire class of placement assertion was invisible to a sweep that reported itself complete. The
corrected cover is case-insensitive, and it is the reason this section is longer than the draft's.

### The three sweeps, as commands

1. `rg -n -i 'subheader' app components tests -g '*.ts' -g '*.tsx'` — every site that names the band,
   by prop OR by test id.
2. `rg -n -i 'sticky\s+(status\s?)?strip|sticky\s+StatusStrip' app components tests lib` — §2.3.
3. `rg -n 'absolute[^"]*top-full' components -g '*.tsx'` — **NEW, and it is what would have caught
   finding 1 unaided.** Every overlay anchored below its ancestor is a candidate the moment that
   ancestor moves to the panel floor. Output: `components/admin/PublishedToggle.tsx`,
   `components/admin/ReSyncButton.tsx`, `components/admin/showpage/ShareHub.tsx` (a COMMENT quoting
   its own superseded anchoring — already `placement-module`),
   `components/admin/review/ReviewModalShell.tsx` (the slot comments), and
   `components/layout/ThemeToggle.tsx` (outside the modal entirely). The two live ones are exactly the
   two this arc migrates.

### Sweep 1 dispositions

| site | disposition |
|---|---|
| `components/admin/review/ReviewModalShell.tsx:116, 140, 697, 702` | **Untouched.** The slot keeps existing; one consumer stops using it. |
| `components/admin/showpage/PublishedReviewModal.tsx:12, 897, 1104, 1113` | Task 3 — the move plus three comment claims that the strip lives in the band. |
| `components/admin/showpage/StatusStrip.tsx:55` | Task 3 — its docblock names the band as its container and the source of its padding and seam. |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx:58, 113` | Task 4. |
| `components/admin/ReSyncButton.tsx:53` | §3.2a — the docblock that establishes finding 1. |
| `tests/e2e/published-review-modal.layout.spec.ts` (24 hits) | Task 5 — the column equation and the band-composition case. |
| `tests/e2e/skeletonBandParity.spec.ts` (15 hits) | Task 4 — A/B/D/E retargeted, tolerances unchanged. |
| **`tests/e2e/published-review-modal.interactions.spec.ts:627, 667, 691, 728, 825, 1102, 1143`** | **MISSED BY THE DRAFT.** `SUBHEADER` is built from `` `${BASE}-subheader` ``, and T-OVERLAY (`tests/e2e/published-review-modal.interactions.spec.ts:670`) and T-OVERLAY-BOUNDS (`tests/e2e/published-review-modal.interactions.spec.ts:737`) pin the Re-sync panel's abut and bounds against the BAND. Retargeted to the footer with the 6px placement gap (§3.2a). |
| **`tests/e2e/admin-parse-panel.spec.ts:274, 278`** | **MISSED BY THE DRAFT.** Locates the strip via `getByTestId("published-show-review-subheader")`. Retargeted. |
| **`tests/e2e/stackedBandLayout.spec.ts:78`** | **MISSED BY THE DRAFT, and it refutes the draft's own disposition.** The draft called this file placement-agnostic on the strength of a `show-status-strip` grep; its `BAND` constant is `[data-parity="loaded"] [data-testid="published-show-review-subheader"]`, so it locates THROUGH the band. Retargeted. |
| **`tests/e2e/published-review-modal.deeplink.spec.ts:212`** | **MISSED BY THE DRAFT.** A comment establishing the deep-link contract in terms of the "pinned subheader band". Corrected, and §3.5's `#share-access` behaviour re-checked against it. |
| **`tests/e2e/_skeletonParityHarness.tsx:128`** | **MISSED BY THE DRAFT.** A comment tying assertion E to the subheader's width and wrap behaviour. Corrected with Task 4. |
| `tests/e2e/_shareLinkFlashLiveEntry.tsx:20, 82, 126` | Task 8 — prop plus two comments. |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx:865, 888, 899` | Task 3 — retargeted. |
| `tests/components/admin/review/reviewModalShell.test.tsx` | **Untouched, and that is AC-16.** |
| `tests/parser/blocks/transport.test.ts` (4 hits) | **FALSE POSITIVE, named rather than silently filtered:** "subheader" there is a spreadsheet column sub-header in the transport parser. Unrelated to the shell slot. |

### Overlays and their registry rows

| overlay | row today | after |
|---|---|---|
| `published-toggle-popover` | `fit-within-clip` | `placement-module` (§3.3) |
| `admin-resync-error` | `fit-within-clip` | `placement-module` (§3.2a) |
| `admin-resync-shrink-confirm` | `fit-within-clip` | `placement-module` (§3.2a) |
| `admin-resync-success` | `fit-within-clip` | `placement-module` (§3.2a) |
| `share-hub-popover`, HoverHelp body | `placement-module` | unchanged — the precedents |
| AttentionMenu | unchanged | its anchor is the HEADER, at the top of the panel, which the dock does not move |

`components/admin/useFitWithinClip.ts` keeps `AttentionMenu` and loses these four consumers. It is
neither edited nor forked (§3.4).

### Other

| site | disposition |
|---|---|
| `components/admin/showpage/ShowReviewModalSkeleton.tsx:113-165` | Task 4 — move the fragment, content unchanged; both mirrors already carry `w-full`. |
| `tests/e2e/_statusStripToggleHarness.tsx:170-179` (`errorProbeHtml`) | A hand-rolled replica of the OLD banner geometry, backing an invariant about the real error content's WIDTH. Comment updated to say it pins width only; no clipping ancestor exists in that harness, so the placement module would place it unbounded there anyway. |
| The seven stale-anchor sites in §2.3 | Task 8. Cover is §2.3's `rg` returning zero (AC-12). |
| Dated `docs/superpowers/**/2026-07-17-casp2-*.md` | **Deliberately unchanged** (§2.3). |

**Disposition.** Every peer is repaired in this PR. Nothing is deferred, so no `BL-` filing is owed
under exception (a), (b) or (c). The two judgment calls, so a reviewer verifies rather than re-derives:
`ShowReviewModalSkeleton` is repaired because a skeleton that contradicts the modal it precedes is a
visible jump on every open; the dated `docs/` records are not repaired because correcting a dated
record destroys the evidence of what a decision was taken against.

## §10 Documented limits

Each is a conservative outcome plus a surfaced signal, not a silent wrong answer. Per the
consequence bound in §11, these are limits, not findings.

1. **Re-sync's panels gain a 6px gap where they used to abut.** `GAP` is a module constant in
   `lib/popover/position.ts:16` with no per-call override, so migrating the three Re-sync overlays
   changes their abut to a 6px offset (§3.2a). Consequence is cosmetic and one-directional; the
   alternative — a per-call gap parameter — widens a shared placement module to preserve one
   consumer's spacing, which is the churn the module exists to avoid. **Re-file trigger:** the
   invariant-8 impeccable gate rejecting the gap on this surface.

2. **Neither side fits.** When the banner's wrapped height exceeds the space on both sides, the
   placement module picks the larger side and writes `maxHeight = space(side)`
   (`lib/popover/position.ts:129-131`), so the banner is capped to the room it has and scrolls
   internally — never cut, never collapsed. When even that is degenerate (the trigger spans the
   bounds vertically) it returns `kind: "hidden"`, and the consumer leaves the banner unpositioned
   and recovers next frame (AC-11). Both outcomes are conservative and observable, so both are limits
   rather than findings. Not reachable at any domain viewport after the dock: §7 measures
   `spaceAbove` at 375x667 and it exceeds the banner's natural height.

3. **Measured at the fixture viewports.** This spec's own new measurement is at 375x667, the
   tightest supported phone and the viewport the row names. The declared probe domain (§11) is
   375x667, 375x844, 390x560 and 390x844. What the repo already sweeps is adjacent but not
   identical, and the difference is stated rather than blurred: the AttentionMenu census sweeps
   375x{844, 667, 560, 400} (`tests/e2e/popover-clip-fit.spec.ts:734`) and T4 runs at 390x560
   (`tests/e2e/popover-clip-fit.spec.ts:545`). A viewport outside the declared domain is not a claim
   this spec makes; widening the set is a new measurement, not a finding.

4. **The bound is a width cap, not a content policy.** A show whose title is one unbroken 60-character
   token still produces two clamped lines with the tail visually cut at 375px; `line-clamp` ellipsises
   rather than reflowing, and the full title remains the dialog's accessible name and is one tap away
   in the sheet. Capping the item count, shortening titles, or adding a title tooltip are content
   decisions this arc does not take. **Re-file trigger:** an operator reports a title they cannot read
   in the modal.

5. **The cap is measured at 375x667 and applies below the `sm` breakpoint.** Between 375 and 640 the
   cap is the same value, which is conservative at the wide end: at 639px the cluster could safely
   take more than it is allowed to. The cost is cosmetic (a pill that wraps a line earlier than it
   must); the alternative is a per-width cap the sweep would have to derive at every width, which
   buys nothing measurable. Widening it into a `clamp()` is a new measurement, not a finding.

6. **`offsetParent` is the anchor.** The predicate reads `node.offsetParent`, which returns `null`
   inside a `position: fixed` ancestor and for a `display: none` subtree. Both yield the down arm
   with no cap written, which is today's behavior. A `transform`/`filter`/`contain` ancestor between
   the banner and the footer would change the containing block without changing `offsetParent`; none
   exists on this path today, and AC-5 measures the real relation rather than assuming it.

---

## §10a Round-1 triage record

Five findings, spec round 1 (`docs/review-rounds/`, `--stage spec --round 1`, verdict BLOCKING). All
five were admissible; none is refuted. Recorded here so a later round does not re-derive them and so
the two that DISSOLVED are shown to dissolve rather than asserted to.

| # | finding | disposition |
|---|---|---|
| 1 | Docking breaks Re-sync's three overlays, and both sweeps missed them | **REPAIRED, §3.2a.** The migration extends to all four overlays. The sweep defect is repaired separately in §9: the draft's `subHeader` grep was case-sensitive against a lower-case test id, and the corrected cover finds four more files the draft missed — including two the finding did not name (`published-review-modal.deeplink.spec.ts`, `_skeletonParityHarness.tsx`) and one whose disposition the draft got positively wrong (`stackedBandLayout.spec.ts` locates THROUGH the band). |
| 2 | ACs cover 3 of the 12 declared domain combinations; the refusal case never sets a load, and the entry boots at load 3 | **REPAIRED.** AC-14/AC-15 now range over all twelve; AC-5 asserts at all four viewports with the load set explicitly. |
| 3 | The reflection is off by the footer's `border-t`: `bottom-full` is padding-box, `getBoundingClientRect().top` is border-box | **DISSOLVED, and here is why rather than that.** The finding is correct against the draft's arithmetic. It has no subject under §3.2: there is no `bottom-full` and no reflection. `computePopoverPlacement` derives both sides from ONE trigger rect and writes viewport coordinates (`y = trigger.top - GAP - height` for the top side, `lib/popover/position.ts:134`), so both sides are measured in the same border-box coordinate system and no padding-box quantity enters the computation. The border width is inside `trigger.top` on both sides and cancels. |
| 4 | Cap ownership across two renders: the up cap depends on `bannerBottom`, but the effect that chooses up runs while the DOM still carries the down-arm classes | **DISSOLVED, and here is why.** The finding is correct against the draft's two-phase design. §3.2 has one phase: `withNaturalSize` measures the body with class caps active and NO inline constraints (`lib/popover/naturalSize.ts`), `computePopoverPlacement` returns `side` and `maxHeight` together from that one measurement, and `applyPlacement` writes position and cap in the same pass. Nothing reads the banner's CURRENT rect to decide where it goes, so there is no stale-position window to own. This is the same single-pass structure `ShareHub` has run since 2026-07-24. |
| 5 | §5 skips the pill's `relative` wrapper, a direct flex item of the capped cluster | **REPAIRED.** §5 now models the three-level chain and adds `min-w-0` on that wrapper; AC-17 gains geometric containment, since text-presence assertions cannot establish it. |

**What findings 3 and 4 cost, and what that says.** Both were real defects in arithmetic the draft
invented, and both stopped existing the moment the design used the module that already existed. That
is the round-economy lesson in one arc: the draft's `chooseDirection` and its reflection were 40 lines
of new reasoning surface, and a reviewer found two defects in them on the first pass. The replacement
adds none, because `lib/popover/position.ts` has been reviewed and unit-tested since 2026-07-22. The
correction was not prompted by these findings — it came from the citation pass finding the registry
guard — but the findings measure what the draft would have cost.

---

## §11 Convergence criterion (carried into every review brief)

**Consequence bound.** At every supported viewport, and at every attention load in the probe domain,
the Published switch is reachable — its rect lies inside the clipping panel — and the refusal banner
is either fully readable or scrollable within its clip, never silently cut. A conservative clamp plus
a surfaced dev warning is a documented limit, not a finding. Visually clamped title text whose full
value remains in the accessibility tree is a documented limit (§10 item 4), not a finding.

**PROBE DOMAIN.** The review modal at the fixture viewports the suite already uses — 375x667,
375x844, 390x560, 390x844 — crossed with attention loads 0, 2 and 30, through the shared harness
(`tests/e2e/_publishedReviewModalHarness.tsx` via `tests/e2e/_pillFocusLiveEntry.tsx`) and the replica
entry (`tests/e2e/_publishedToggleClipLiveEntry.tsx`). The item-count axis is part of the domain, not
an extra: §0 measured that a probe varying only the viewport reproduces the row's number and confirms
the wrong cause. A probe outside those viewports or loads, or against a hand-built panel, files to §10
rather than to a finding.

**Threat fence.** Ordinary responsive layout under real compiled Tailwind at supported phone sizes.
Adversarial CSS injected into the panel, a caller mounting the strip outside the shell, and hostile
ancestor stacking are out of scope and file to §10.

---

## §12 Out of scope

- Any change to `components/admin/useFitWithinClip.ts`, and any change to
  `lib/layout/fitWithinClip.ts` other than RETIRING the PublishedToggle entry in its per-anchor
  docblock (§3.4). The banner and the three Re-sync overlays stop consuming that hook rather than
  forking it, so the §1.2 fence is not engaged.
- `AttentionMenu`'s overlay. Its anchor is the header, at the TOP of the panel, which the dock does
  not move; it keeps `useFitWithinClip` and its registry row is unchanged.
- Any user-visible copy change in `PublishedToggle` (§1.1 item 4).
- The wizard's Step 3 modal, which never passes `subHeader` and is asserted unchanged by
  `tests/components/admin/review/reviewModalShell.test.tsx:334-345` (AC-16).
- Any change to `components/admin/review/ReviewModalShell.tsx`. The header bound lives entirely in
  the consumer, per the §0 ruling's "do not restructure the shell".
- Re-hosting `StatusStrip` on any surface other than the published review modal.
- Server actions: none is touched, so invariant 10 does not apply.
