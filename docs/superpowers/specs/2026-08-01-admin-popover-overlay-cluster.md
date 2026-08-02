# Admin show-page popover/overlay-clip cluster

**Date:** 2026-08-01 · **Status:** DRAFT (autonomous /ship-feature run)
**Backlog items:** `BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS`, `BL-ATTENTION-MENU-PANEL-CLIP`, `BL-PUBLISHED-TOGGLE-OVERLAY-CLIP`, `BL-SHAREHUB-CONFIRM-NAMES-SHOW`, `BL-SHAREHUB-OPEN-TIMER-LEAK`, `BL-POPOVER-SHARED-RAF-COALESCER` (all in `BACKLOG.md`)

Six items on one surface family: the admin show-page popovers/overlays inside the
review-modal clipping panel (`components/admin/review/ReviewModalShell.tsx`,
`overflow-clip` panel — see the registry preamble at
`tests/components/admin/showpage/popoverOverlayRegistry.ts:8-15`), plus the
ShareHub trigger/backdrop stack and two hygiene items (a measured-artifact timer
"leak" and a duplicated rAF coalescer).

---

## 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | The ShareHub backdrop-swallows-triggers defect is **pre-existing, not a regression**; verified identical against `origin/main`. The fix is open-gated trigger elevation, not backdrop removal or portal relocation. | `BACKLOG.md` item `BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS`; ShareHub header comment `components/admin/showpage/ShareHub.tsx:70-75` |
| R2 | The armed Archive confirm's upward placement on short viewports is **correct and stays** — reachability beats visible context. The confirm becomes self-describing instead. | `BACKLOG.md` item `BL-SHAREHUB-CONFIRM-NAMES-SHOW` ("Placement is not the thing to change") |
| R3 | AttentionMenu is fixed by **fit-within-clip capping**, not a placement-module portal migration. Its anchor sits near the panel top; flipping above the pill buys nothing (the space above is header, then the panel edge). The cap is the mechanism `ReSyncButton` already ships (`components/admin/ReSyncButton.tsx` `useFitWithinClip`). | Probe data §2.2 of this spec; registry disposition taxonomy `tests/components/admin/showpage/popoverOverlayRegistry.ts:24-32` |
| R4 | `BL-SHAREHUB-OPEN-TIMER-LEAK` closes as **measured jsdom artifact, no component fix**. Probe transcript §2.3. The component's own timers all clean up. | Probe §2.3 (draft-time, this spec) |
| R5 | The rAF coalescer extraction changes **no semantics**: leading-edge throttle exactly as both copies already implement (pinned by T-S8, `tests/components/admin/showpage/shareHubVisualViewport.test.tsx:164`). | `BACKLOG.md` item `BL-POPOVER-SHARED-RAF-COALESCER` |
| R6 | Archive confirm copy is owner-ratified (destructive-confirm-pass §R7); the show-name addition below went to the owner as an explicit copy decision during drafting. The ratified copy is in §5.2. | This spec §5.2 |
| R7 | No workflow files and no e2e-coverage allowlist rows change in this cluster (a parallel live branch owns `tests/ci/**`). New e2e assertions land only in files already wired: `tests/e2e/admin-lifecycle-layout.spec.ts` (run by `lifecycle-layout-e2e.yml`) and a new standalone spec added to `tests/e2e/standalone.config.ts` `testMatch` (the standalone workflow runs the whole config unfiltered — `BACKLOG.md` `BL-E2E-LIFECYCLE-SPECS-CI-DARK` PARTIAL 2026-07-26 note). | Orchestrator guardrail, 2026-08-01 dispatch |
| R8 | `PublishedToggle`'s error banner keeps its full-strip-width banner idiom (CASP2-2, `components/admin/PublishedToggle.tsx` `POPOVER_POSITION` rationale comment); the fix adds a clip-safety cap + scroll, not a new placement. | `components/admin/PublishedToggle.tsx:47-58` comment block |

## 2. Draft-time probe data (empirical inputs, 2026-08-01)

### 2.1 Probe harness

Live hydrated `PublishedReviewModal` via the existing standalone toolchain:
`tests/e2e/_pillFocusLiveEntry.tsx` bundled by
`tests/e2e/_step3ReviewModalBundle.mjs`, real Tailwind CSS, viewports
390×{844,667,560}, items a=10/n=10/s=10 (fills the `max-h-96` scroller;
scrollHeight 1985px). Throwaway spec (not committed) mirrored
`tests/e2e/attention-pill-focus.spec.ts` boot.

### 2.2 AttentionMenu geometry (BL-ATTENTION-MENU-PANEL-CLIP → CONFIRMED, short viewports only)

Menu height is constant **431.8px** (47.8px heading band + 384px scroller + border).
Panel (`[data-review-modal-panel]`, computed `overflow: clip`) bottom = viewport
bottom on phones.

| Viewport | menu.top | menu.bottom | clip edge (panel.bottom) | overhang | last row reachable? |
|---|---|---|---|---|---|
| 390×844 | 224.8 | 656.6 | 844 | none | yes |
| 390×667 | 199.3 | 631.1 | 667 | none | yes |
| 390×560 | 183.2 | **615.0** | **560** | **55px** | tap target cut to ~30px; row bottom 613.7 — the scroller's final 54px of box height is unreachable at every scroll position |

At 390×560 the scroller box (top 230, bottom 614, clientHeight 384) extends 54px
past the clip edge: at max `scrollTop` (1601) the last row renders 530.4→613.7,
so its lower 53.7px — and any content that lands in that band at any scroll
position — is stranded exactly as the registry defines
(`tests/components/admin/showpage/popoverOverlayRegistry.ts:9-15`). The visible
remainder of the last row (~30px) is below the 44px tap minimum. At 667/844 the
menu fits; the defect is real but short-viewport-only.

### 2.3 ShareHub open-timer "leak" (BL-SHAREHUB-OPEN-TIMER-LEAK → jsdom artifact)

jsdom probe (fake timers, instrumented `setTimeout`): render hub = 0 timers;
open = 1; unmount = still 1. The arming stack:

```
at SelectionImpl._associateRange (jsdom/lib/jsdom/living/selection/Selection-impl.js:349)
at SelectionImpl.collapse (.../Selection-impl.js:142)
at HTMLDivElementImpl.focus (.../HTMLOrSVGElement-impl.js:73)
at components/admin/showpage/ShareHub.tsx:630 (panelRef.current?.focus() open-focus effect)
```

The timer is **jsdom's own** `setTimeout(0)` inside its Selection
implementation, armed when the dialog-focus effect
(`components/admin/showpage/ShareHub.tsx`, `useEffect` at the "role=dialog must
RECEIVE focus" comment) calls `HTMLElement.focus()`. It is not a component
timer, cannot be cleaned by component code, does not exist in a real browser's
timer semantics, and fires after one tick outside fake timers. Disposition:
document at the delta-baseline comment in
`tests/components/admin/showpage/shareHubFlashState.test.tsx`, graduate the
backlog item, change no component.

### 2.4 Backdrop hit-test (BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS — already proven)

Not re-probed: the backlog item records the `elementFromPoint` failure
reproducing identically on `origin/main`, and the scoped-out assertions plus
rationale live in T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts:623-640`).
Mechanism: the backdrop is `fixed inset-0 z-20`
(`components/admin/showpage/ShareHub.tsx:660`), a positioned element; the two
triggers are non-positioned in-flow siblings, which CSS 2.1 Appendix E paints
below any positive-z positioned box regardless of DOM order.

## 3. BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS — open-gated trigger elevation

### 3.1 Change

While `open` is true, both trigger buttons (`share-hub-primary`
`components/admin/showpage/ShareHub.tsx:672`, `share-hub-kebab` `components/admin/showpage/ShareHub.tsx:707`) carry
`relative z-30`; while closed they carry no z utility (unchanged classes).
The backdrop (`components/admin/showpage/ShareHub.tsx:651-661`) is untouched.

Result: with the hub open, a tap on either trigger hits the trigger, which runs
`toggle("primary"|"kebab")` — the popover closes through the toggle path (focus
staying on the tapped trigger) instead of the backdrop's close-without-restore
path. The backdrop still catches every other outside tap.

### 3.2 Why this does not resurrect the T-HUB-ZORDER defect

The historical defect (`components/admin/showpage/ShareHub.tsx:60-68`): an
UNCONDITIONAL root `z-30` painted the closed-state triggers above the header
attention menu's `z-20` panel (`components/admin/showpage/AttentionMenu.tsx:128`)
and stole its clicks. The new z is (a) on the triggers, not the root, and
(b) applied ONLY while the hub popover is open — a state in which the attention
menu cannot be open concurrently:

- Opening the hub while the menu is open: the trigger tap's `pointerdown`
  reaches the menu's document-level outside-close listener
  (`components/admin/showpage/AttentionMenu.tsx:89-98`) and closes the menu
  before the hub opens.
- Opening the menu while the hub is open: the pill tap lands on the hub
  backdrop (`fixed inset-0 z-20` paints above the header's in-flow content),
  which closes the hub without opening the menu.

Those two arguments cover POINTER activation only. Keyboard activation fires
no `pointerdown` and the backdrop does not block focus traversal: with the hub
open, Tab reaches the attention pill and Enter toggles `menuOpen`
(`components/admin/showpage/PublishedReviewModal.tsx:773`), and with the menu
open, Tab reaches a hub trigger and Enter opens the hub (review R3 F1) — and
T-HUB-ZORDER proves the trigger and menu boxes overlap, so a concurrent state
would let the elevated triggers overpaint menu rows. The mutual exclusion is
therefore made keyboard-inclusive (§3.4) rather than argued from pointer
machinery alone. The closed state — the one T-HUB-ZORDER guards — is
byte-identical.

### 3.4 Focus-leave light dismiss (keyboard-inclusive mutual exclusion)

Both surfaces adopt the standard non-modal light-dismiss-on-focus-leave
contract, which closes each of the two keyboard routes into a concurrent-open
state one Tab stop before it can occur:

- **AttentionMenu:** the panel's existing document-listener effect
  (`components/admin/showpage/AttentionMenu.tsx:81-105`) additionally closes
  the menu on `focusin` events whose target is outside both the panel and the
  pill (mirroring the `pointerdown` predicate at
  `components/admin/showpage/AttentionMenu.tsx:89-98`). Tabbing from the menu
  toward a hub trigger closes the menu before Enter can open the hub.
- **ShareHub:** while `open`, a document-level `focusin` listener closes the
  popover (without focus restore — focus is already where the user sent it)
  when focus lands outside the popover panel, the backdrop, and both triggers,
  EXCEPT while `busy` (the same gate every other dismissal path honors,
  `components/admin/showpage/ShareHub.tsx:198`). Tabbing from the hub toward
  the attention pill closes the hub before Enter can open the menu.

Guard conditions: `focusin` fires only when focus lands on another DOCUMENT
element, so window blur / focus to browser chrome (no `focusin` target inside
the document) does NOT dismiss either surface — deliberate, matching the
backdrop's behavior (documented in §10). Real-browser coverage (§11): from
each surface held open, keyboard-walk to the other's trigger and activate it;
assert the first surface is closed by the time the second opens (both
directions).

### 3.3 Guard updates

- `tests/components/admin/showpage/shareHub.test.tsx` "keeps BOTH triggers
  below the z-20 menu's stacking level" (`tests/components/admin/showpage/shareHub.test.tsx:280`) stays green as-is (it renders
  the CLOSED hub). Add the open-state companion: open the hub, assert both
  triggers' parsed max z-level (same `maxZLevel` helper) is **> 20** and the
  backdrop stays `z-20` (`tests/components/admin/showpage/shareHub.test.tsx:217` pin unchanged).
- Restore the deliberately-scoped-out trigger assertions in T-BACKDROP
  (`tests/e2e/admin-lifecycle-layout.spec.ts:630-638`): with the hub open,
  `elementFromPoint` at each trigger's center resolves into that trigger, and
  a real click on the primary trigger closes the popover with focus remaining
  on the trigger (the toggle path, distinguishable from the backdrop path by
  `document.activeElement`).

## 4. BL-ATTENTION-MENU-PANEL-CLIP + BL-PUBLISHED-TOGGLE-OVERLAY-CLIP — shared fit-within-clip

### 4.1 Hook extraction (enabler)

`useFitWithinClip` and its private helper `findClippingAncestor` currently live
inside `components/admin/ReSyncButton.tsx` (`components/admin/ReSyncButton.tsx:79`, `components/admin/ReSyncButton.tsx:100`); the pure math
`computeFittedMaxHeight` is already shared at `lib/layout/fitWithinClip.ts:56`.
Move the hook + `findClippingAncestor` to a new client module
`components/admin/useFitWithinClip.ts (new)`. The body moves with ONE contract
extension (below); observer wiring, feature-detected `ResizeObserver`,
callback-ref + attach-counter shape are otherwise unchanged. `ReSyncButton`
imports it and its local copies are DELETED.

**Contract extension — re-measure on structural moves (review R1 F1):** the
hook's `ResizeObserver` today watches only the clipping ancestor (plus window
resize; `components/admin/ReSyncButton.tsx:142-146`), so a fitted element that
is PUSHED DOWN without the clip ancestor resizing — e.g. the AttentionMenu
"Needs you" heading mounting above the persistent scroller on a live
monitoring-only → needs-you items update while the menu stays open
(`components/admin/showpage/AttentionMenu.tsx:120`,
`tests/components/admin/showpage/pillFocusReconcile.test.tsx:307`) — would keep
a stale (too-large) cap. The moved hook therefore ALSO observes the fitted
element's `offsetParent` (for AttentionMenu: the menu panel, whose border-box
height grows when the heading mounts, firing the observer and re-running
`apply()`). `ReSyncButton`'s overlays are unaffected (their offsetParent is
inside the same band the clip observer already covers; observing it is
harmless). Structural adoption pins for the extraction are in §11.

Registry mechanism assertion: the current import-regex `/useFitWithinClip/`
(`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:44-47`)
also matches a LOCAL definition (verified by the R1 reviewer's live probe), so
this cluster tightens it to require the shared-module import
(`from "@/components/admin/useFitWithinClip"`), which a local copy cannot
satisfy.

### 4.2 AttentionMenu

Attach the fit ref to the scroller div (`components/admin/showpage/AttentionMenu.tsx:147`,
the `max-h-96 overflow-y-auto` element). The hook caps `style.maxHeight` at
`clipBottom − elementTop − DEFAULT_CLIP_GUTTER` (`lib/layout/fitWithinClip.ts:21`, `lib/layout/fitWithinClip.ts:56`),
so at 390×560 the scroller gets ≈ `560 − 230 − 8 = 322px` and the whole menu
bottom lands inside the clip edge; at 667/844 the CSS `max-h-96` (384px)
continues to govern (fitted value ≥ 384 → `computeFittedMaxHeight` returns the
declared cap).

Live-update re-measure: covered by the §4.1 contract extension — the heading
mounting/unmounting on a group-structure change (`hasNeedsYou` flip,
`components/admin/showpage/AttentionMenu.tsx:120`) resizes the observed menu
panel and re-fires `apply()`. The real-browser regression for this exact
transition (monitoring-only → needs-you at 390×560 with the menu held open,
asserting containment + last-row reachability after the flip) is a REQUIRED
case in the §11 standalone spec.

Entrance-transform error + settled remeasure (review R3 F4): the panel's
`scale-95` entrance (`AttentionMenu.tsx:128-130`, `origin-top-right`) distorts
`getBoundingClientRect` while it is applied, and the mount-effect measurement
runs BEFORE the entrance rAF flip, so with no further signal the cap would
retain a mis-measure bounded by (1−0.95) × (scroller.top − panel.top) ≈
0.05 × 47 ≈ 2.4px (probe §2.2 geometry) — contained (strictly less than the
8px `DEFAULT_CLIP_GUTTER`, `lib/layout/fitWithinClip.ts:21`) but violating
§9.1's ±0.5px equality. Transform completion does not change the observed
offset-parent's layout box, so the §4.1 observer does not cover it. Two
settled-remeasure signals close it deterministically: the hook accepts an
optional `reapplyKey` dep (re-runs `apply()` when it changes) and AttentionMenu
passes its `entered` state — under `prefers-reduced-motion: reduce` the flip
IS the settle (transition collapses to none), so this alone makes the layout
spec deterministic; and the hook listens for `transitionend` on the fitted
element's `offsetParent` and re-applies, covering the animated path. The
transient window between mount-measure and settle stays contained by the
gutter (§10).

Keyboard reachability (review R2 F3): the scroller can overflow with ZERO
focusable descendants (monitoring-only lists render read-only rows,
`components/admin/showpage/AttentionMenu.tsx:188-220`), and engines do not
uniformly place scroll containers in sequential focus order. The scroller
therefore gains `tabIndex={0}` AND an explicit nameable role with an
accessible name: `role="group"` + `aria-label="Show issues"`. The role is
load-bearing, not decorative (review R3 F3): a bare `div` maps to the
`generic` role, which is naming-prohibited under W3C ARIA-in-HTML, so
`aria-label` alone would be invalid. (`PublishedToggle`'s banner is already
`role="alert"` — `components/admin/PublishedToggle.tsx:174` — which is
nameable, so §4.3 needs only `tabIndex` + `aria-label`.) The §11 standalone
spec asserts the accessibility tree AND the behavior: locate the scroller via
`getByRole("group", { name: "Show issues" })`, focus it via Tab, send
`ArrowDown`, assert `scrollTop` increased.

Registry row flips: `components/admin/showpage/AttentionMenu.tsx` disposition
`unverified-gap` → `fit-within-clip`
(`tests/components/admin/showpage/popoverOverlayRegistry.ts:74-78`), reason
citing this spec + probe numbers. The meta-test's import assertion then binds it.

### 4.3 PublishedToggle error banner

`components/admin/PublishedToggle.tsx` `POPOVER_POSITION` (`components/admin/PublishedToggle.tsx:59`) gains
`overflow-y-auto` and the rendered error banner takes the fit ref. No CSS
max-height is declared, so the clip cap is the only bound
(`computeFittedMaxHeight` treats `max-height: none` as Infinity —
`components/admin/ReSyncButton.tsx:122-124` comment, moving verbatim): a long
error inside the clipping panel now scrolls instead of being cut; error-only
and momentary otherwise unchanged (`components/admin/PublishedToggle.tsx:55` rationale comment stays).

Keyboard reachability (review R2 F3): the banner's content is plain text
(including the codeless generic-retry branch,
`components/admin/PublishedToggle.tsx:170-185`), so a capped, overflowing
banner would be keyboard-unreachable without the same contract: the banner
element gains `tabIndex={0}` + `aria-label` naming it (e.g.
"Publish error details") alongside the new `overflow-y-auto`. Covered by the
same keyboard-scroll assertion shape in the §11 standalone spec.

Adding `overflow-y-auto` makes the file match the anchored-scroller detector
(`_metaPopoverPlacementContract.test.ts:39-41` — `absolute` + `top-full` +
scroller), so add the `fit-within-clip` registry row for
`components/admin/PublishedToggle.tsx` in the same change (fail-by-default
guard otherwise trips, which is the registry working as designed).

### 4.4 Guard conditions

- No clipping ancestor found (`findClippingAncestor` returns null — e.g. unit
  tests mounting the menu bare): hook is a no-op; CSS caps govern. Existing
  behavior, unchanged by the move.
- jsdom (no `ResizeObserver`): degrade to measure-once + window-resize, never
  throw (`components/admin/ReSyncButton.tsx:137-141` comment, moving verbatim).
- Empty/short item lists (menu content < fitted cap): `max-height` caps are
  upper bounds only; layout unchanged.
- `MIN_FITTED_HEIGHT` floor (48px, `lib/layout/fitWithinClip.ts:35`): an
  anchor pathologically close to the clip edge yields a floor-height scroller
  rather than a zero-height one. Pre-existing contract, inherited.

## 5. BL-SHAREHUB-CONFIRM-NAMES-SHOW — self-describing armed confirm

### 5.1 Mechanism

`ArchiveShowButton` gains an optional `showName?: string` prop (row variant
consumer only). `ShareHub` threads its existing `showTitle` prop
(`components/admin/showpage/ShareHub.tsx:153`) into the row-variant
`ArchiveShowButton` call site (`components/admin/showpage/ShareHub.tsx:962-982`). Guard: `showName` absent/empty/
whitespace → render exactly today's copy (all non-hub call sites and partial
data during editing are unchanged); the morph/legacy variants ignore the prop
entirely (mode boundary: prop is consumed ONLY in the `asRow` armed branch,
`components/admin/ArchiveShowButton.tsx:277-289`).

### 5.2 Copy (owner decision — ratified 2026-08-01)

Armed consequence sentence in the row variant
(`components/admin/ArchiveShowButton.tsx:284-287`), with `showName` present:

> Crew links for “{showName}” stop working now and won’t come back until you
> re-publish and issue a new link.

and the armed group's accessible name (`components/admin/ArchiveShowButton.tsx:279` `aria-label`) becomes
`Confirm archiving “{showName}”`. Curly quotes (U+201C/U+201D) and the existing
curly apostrophe, per the repo apostrophe/em-dash invariants. The confirm
BUTTON label stays `Confirm archive` (`components/admin/ArchiveShowButton.tsx:301`) — consequence lives in the prose
the button is `aria-describedby`-bound to, unchanged mechanism. Absent
`showName`, both strings render byte-identically to today (guard in §5.1).

Long titles: the prose paragraph wraps (`text-sm text-text-subtle`, no
truncation) — a popover-width title wraps to more lines rather than truncating
context on a destructive decision. `show.title` is parser-derived
(`extractTitleFromMarkdown`, `lib/parser/index.ts:189` — banner cells /
`Event Name` / other sheet cells, filename as last resort) with NO
application-level length cap, so pathological lengths are possible; the
ShareHub placement cap + body-content observer bound the popover against the
panel regardless (Documented limits §10).

### 5.3 Pins

Pin the armed prose + group label with/without `showName` in
`tests/components/admin/showpage/shareHub.test.tsx` (armed-state cases exist
there today per the backlog item's fix-shape note).

## 6. BL-SHAREHUB-OPEN-TIMER-LEAK — close as measured artifact

Per §2.3: no component change. Work items: (a) replace the delta-baseline
rationale comment in `tests/components/admin/showpage/shareHubFlashState.test.tsx`
(the "measures a delta against a post-open baseline" note the backlog item
cites) with the root cause — jsdom `Selection._associateRange` `setTimeout(0)`
armed by the open-focus `HTMLElement.focus()` call — so the next reader does
not re-bisect; (b) graduate the backlog row with the same finding. The
delta-based assertion style STAYS (the artifact still exists under fake
timers; a global zero-count assertion remains unusable in jsdom by
construction).

## 7. BL-POPOVER-SHARED-RAF-COALESCER — shared helper

New `lib/popover/rafCoalescer.ts (new)`:

```ts
export type RafCoalescer = { schedule: () => void; cancel: () => void };
export function createRafCoalescer(run: () => void): RafCoalescer
```

Leading-edge THROTTLE: `schedule()` is a no-op while a frame is pending; the
pending flag clears BEFORE `run()` executes so events landing during `run` can
schedule the next frame — the exact semantics both copies implement today
(`components/admin/showpage/ShareHub.tsx:379-386`,
`components/admin/HoverHelp.tsx:309-316`, both carrying the
"cleared BEFORE running" comment). `cancel()` cancels any pending frame and
clears the flag (the effect-cleanup path both consumers need).

Consumers: ShareHub's placement effect replaces its local `frame`/`schedule`
with the helper (cancel in the same effect cleanup that today does
`cancelAnimationFrame`); HoverHelp replaces `frameRef`/`schedule` — its
open-gate (`if (!open …) return` at `HoverHelp.tsx:310`) stays OUTSIDE the
helper at the call site, so helper semantics are consumer-independent.
Behavioral pin T-S8 (`tests/components/admin/showpage/shareHubVisualViewport.test.tsx:164`
"the coalescer THROTTLES, it does not debounce") moves conceptually to a new
unit test on the helper (`tests/popover/rafCoalescer.test.ts (new)`: throttle vs
debounce under a burst; reschedule-from-within-run; cancel) while T-S8 itself
remains as the ShareHub integration pin (it exercises the visualViewport
subscription path end-to-end, which the unit test cannot).

No other rAF sites change: the double-rAF settle helper
(`ShareHub.tsx:521-523`) and the flash/entrance rAFs are not coalescers.

## 8. Transition inventory

No new visual states are introduced anywhere in the cluster; this inventory
enumerates ALL pairs of the touched components' existing states (review R1 F3).

**ShareHub triggers** — open axis: closed, open; presentation axis (primary
trigger label/weight, prop-driven): live ("Share link"), paused
("Share link · paused"), archived ("Show actions")
(`components/admin/showpage/ShareHub.tsx:693-705`).
| Pair | Treatment |
|---|---|
| closed ↔ open | Instant class swap; this cluster adds `relative z-30` on open — z/position changes do not animate (matches the existing instant `bg-surface-sunken` kebab swap, `components/admin/showpage/ShareHub.tsx:719-721`) |
| live ↔ paused ↔ archived (any pair) | Server-prop re-render, instant label/weight swap (existing; no animation) |
| Compound: lifecycle change while open | Existing immediate-or-busy-deferred close machinery (`components/admin/showpage/ShareHub.tsx:548-602`) — untouched by this cluster; the open-gated `z-30` unmounts with the same close, so no state where the backdrop is gone but the elevation remains |

**AttentionMenu panel** — states: absent, pre-frame (mounted, `scale-95
opacity-0`), entered (`scale-100 opacity-100`); orthogonal axis: group
structure O1 (needs-you present) / O2 (monitoring-only)
(`components/admin/showpage/AttentionMenu.tsx:66`, `components/admin/showpage/AttentionMenu.tsx:120`, `components/admin/showpage/AttentionMenu.tsx:128-130`).
| Pair | Treatment |
|---|---|
| absent → pre-frame | Instant mount (existing) |
| pre-frame → entered | Existing `transition-[opacity,transform] duration-fast`; reduced-motion instant. Unchanged |
| entered/pre-frame → absent | Instant unmount (existing; close has no exit animation by contract) |
| O1 ↔ O2 while open | Instant heading mount/unmount (existing, pinned by the O1↔O2 collapse coverage in `tests/e2e/attention-pill-focus.spec.ts`). NEW interaction: the flip re-fires the fit observer (§4.1 extension); no animation |
| Compound: O1↔O2 while entrance mid-flight | Both instant vs animated axes compose; fit re-measure fires on the panel resize regardless of entrance progress; mid-entrance measurement error bounded < gutter (§4.2) |
| Compound: menu open while hub open (keyboard route) | Prevented one Tab stop early by focus-leave light dismiss on both surfaces (§3.4); asserted both directions in the §11 e2e |

**PublishedToggle inline surfaces** — states: none, error banner, finalize
chip; error wins over finalize (`components/admin/PublishedToggle.tsx:126-127`).
| Pair | Treatment |
|---|---|
| none ↔ error | Instant (existing); this cluster adds cap+scroll to the error banner only — overflow behavior, no transition change |
| none ↔ finalize chip | Instant, in-flow chip (existing, `components/admin/PublishedToggle.tsx:69`). Untouched |
| error ↔ finalize chip | Priority swap, instant (existing `showFinalize = !showError && finalizeOwned`). Untouched |

**ArchiveShowButton row variant** — states: resting, armed, armed-submitting
(`pending`/`submitting`, `components/admin/ArchiveShowButton.tsx:115`),
post-failure (refusal / not-found / generic banners via `banners`,
`components/admin/ArchiveShowButton.tsx:209`).
| Pair | Treatment |
|---|---|
| resting ↔ armed | Instant morph (existing). Copy-only change in the armed branch (§5.2) |
| resting → armed-submitting | Unreachable directly (submit exists only in the armed render) |
| armed → armed-submitting | Instant disable/`aria-busy` (existing). Untouched |
| armed-submitting → success | `router.refresh()` re-renders into the Archived presentation; the row unmounts (`components/admin/ArchiveShowButton.tsx:152-156`). Instant, existing |
| armed-submitting → post-failure | Instant banner mount (existing). Untouched |
| post-failure → armed | Re-arm clears banners and sets `armed` directly (`components/admin/ArchiveShowButton.tsx:134-145`) — goes to ARMED, not resting. Instant, existing |
| post-failure → resting | Only via Cancel from the armed render (banners persist until re-arm). Instant, existing |

Inventory boundary: components this cluster does not edit (`UnarchiveShowButton`,
`RotateShareTokenButton`, `PickerResetControl`) keep their shipped inventories;
nothing here alters their states.

Compound cases: arming Archive while the hub popover is mid-placement is
already covered by the body-content `ResizeObserver`
(`ShareHub.tsx:401-419`); nothing in this cluster alters that machinery.

## 9. Dimensional invariants

Fixed-dimension parent → child relationships this cluster creates:

1. **AttentionMenu scroller inside the clip panel:** when content OVERFLOWS
   the fitted cap (`scrollHeight > fitted max-height` — the probe's 10/10/10
   fixture guarantees it) and `floor(panel.bottom − scroller.top − 8) < 384`,
   the scroller's rendered height equals
   `floor(panel.bottom − scroller.top − 8)` px (±0.5px), guaranteed by the
   hook's `style.maxHeight` write (`lib/layout/fitWithinClip.ts:56`),
   asserted SETTLED — after the entrance flip/transition end, which re-fires
   `apply()` per §4.2 (mid-entrance the cap may exceed the formula by ≤2.4px,
   still inside the gutter). Where the
   panel affords ≥384px, rendered height ≤ 384px (`max-h-96`). Short content
   renders at natural height (max-height is an upper bound only, §4.4). Floor
   regime: when available space < `MIN_FITTED_HEIGHT` (48px), the floor wins
   BY DESIGN and the overlay may overhang (`lib/layout/fitWithinClip.ts:28-35`
   rationale comment) — inherited contract, documented in §10, unreachable for
   AttentionMenu at the asserted viewports (available is 322px at 390×560).
2. **Menu bottom vs clip edge:** `menu.bottom ≤ panel.bottom` at 390×560 with
   the overflow fixture (probe showed 615 > 560 before), including after a
   monitoring-only → needs-you group flip with the menu held open (§4.2).
   Assertion targeting (review R2 F3): the ≥44px effective-tap-height
   assertion targets the last INTERACTIVE needs-you row button (the 10/10/10
   fixture's tail rows are read-only monitoring rows,
   `tests/e2e/_pillFocusLiveEntry.tsx:68-87`); the monitoring tail is asserted
   for READ reachability (`elementFromPoint` resolves into the row's text at
   max scroll).
3. **PublishedToggle banner:** `banner.bottom ≤ panel.bottom` whenever the
   banner renders inside the clipping panel AND available space ≥ 48px (same
   floor exemption as 1); content beyond scrolls (`overflow-y-auto`).

Real-browser Playwright assertions required (jsdom computes no layout); the
plan's layout-dimensions task graduates the §2 probe into a permanent
standalone spec asserting 1-2 at 390×{560,667,844} plus last-row
`elementFromPoint` reachability and ≥44px effective tap height at 560.

## 10. Documented limits

- The fit cap makes the menu's visible window smaller on very short viewports
  (322px at 390×560); with 10+ items that is more scrolling, never stranding.
  Accepted: preparedness posture is "reachable or signaled, never silently
  unreachable."
- `showName` prose wraps unbounded in the armed confirm; `show.title` is
  parser-derived with no length cap (§5.2), so pathological multi-hundred-char
  titles produce a tall popover, which the ShareHub placement cap already
  bounds against the panel (`ShareHub.tsx:401-406` body-observer + placement
  cap). No truncation by design (destructive-confirm context beats
  compactness).
- `MIN_FITTED_HEIGHT` floor regime (inherited, `lib/layout/fitWithinClip.ts:28-35`):
  when the space between an overlay's top and the clip edge is under 48px, the
  48px floor wins and the overlay overhangs rather than collapsing to
  unusable height. Pre-existing contract for ReSync overlays; unreachable for
  AttentionMenu at phone viewports (§9.1); reachable in principle for the
  PublishedToggle banner only if the strip bottom sits within 48px of the
  panel bottom, a layout that does not occur in the shipped modal (strip is
  sticky near the panel top).
- The jsdom Selection timer (§2.3) remains observable in any fake-timer test
  that focuses an element; tests must keep using delta baselines rather than
  global zero-count assertions.
- Focus-leave light dismiss (§3.4) deliberately does not fire on window blur
  or focus moving to browser chrome (no in-document `focusin` target) — the
  surface stays open across an app switch, matching backdrop behavior.
- Trigger elevation relies on the §3.2/§3.4 mutual-exclusion contract; a FUTURE
  surface that renders another `z≥30` positioned element inside the strip
  while the hub is open would need its own registry-style reasoning (T-HUB-ZORDER
  still guards the closed state; the open-state companion pin guards this one).

## 11. Test plan (summary — plan document carries the TDD tasks)

Unit (jsdom): open-state trigger-z companion pin; armed-confirm copy pins
(with/without `showName`); registry row updates + meta-test stays green;
`rafCoalescer` throttle/cancel/reschedule unit tests; T-S8 unchanged-green;
shareHubFlashState comment update (no assertion change).

Structural adoption pins (review R1 F2 — behavioral pins alone pass with the
shared helpers unadopted):
- Tighten `IMPORT_FOR_DISPOSITION["fit-within-clip"]`
  (`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:44-47`)
  from `/useFitWithinClip/` to a shared-module import regex
  (`from "@/components/admin/useFitWithinClip"`), so a local definition no
  longer satisfies the registry (the R1 reviewer's probe showed the current
  regex passes `ReSyncButton`'s local copy). Rows bound: `ReSyncButton`,
  `AttentionMenu`, `PublishedToggle`.
- Source-form assertions (same test file or a sibling structural test), with
  the mutation-family closure declared up front (writing-plans rule: the
  enumeration is the closure set the review converges against):
  (i) IMPORT — each consumer imports the shared module
  (`@/components/admin/useFitWithinClip` for ReSyncButton/AttentionMenu/
  PublishedToggle; `@/lib/popover/rafCoalescer` for ShareHub/HoverHelp);
  (ii) CALL BOUND TO THE IMPORT — the structural test resolves, at the
  TypeScript AST level (the compiler API the repo already ships; regex is
  insufficient here, review R3 F2), that the file contains a call expression
  whose callee identifier is the IMPORT BINDING from the shared module — an
  unused aliased import plus a decoy call cannot satisfy it;
  (iii) NO SAME-NAME LOCAL, ANY DECLARATION FORM — no consumer declares
  `useFitWithinClip`, `findClippingAncestor`, or `createRafCoalescer` locally
  in ANY form (`function`, `const`/`let`/`var`, `class`, import alias
  shadowing), and the "cleared BEFORE running" marker comment appears in
  exactly one source file (the shared module).
  Closure boundary, stated explicitly (review R2 F1): a local
  reimplementation under a DIFFERENT name with the imported helper consumed
  by a decoy call is outside this closure set — these are drift guards, not
  adversarial-rename guards; per the mutation-family rule a new family is
  admissible only with a live escaping mutant demonstrated against the
  shipped guard, and the behavioral pins (T-S8, the fit layout spec) remain
  the semantic backstop for any such shape.

Real browser (standalone config): new `tests/e2e/popover-clip-fit.spec.ts (new)` (name added to
`tests/e2e/standalone.config.ts` `testMatch`, R7) — §9 invariants 1-2 with the
assertion-targeting split above (last interactive needs-you row ≥44px;
monitoring tail read-reachable), the held-open monitoring-only → needs-you
group-flip containment case (§4.2), keyboard-scroll + role/name
accessibility-tree assertions for both focusable scrollers (§4.2/§4.3), the
§3.4 keyboard mutual-exclusion walks (both directions), the settled-state
±0.5px fit equality (§9.1), and `PublishedToggle` banner containment with
a forced long error; runs on the existing whole-config standalone workflow.

Standalone membership baseline (review R2 F4): the standalone workflow and
`tests/ci/_metaSpecRegistration.test.ts:74` both compare executed membership
against `tests/e2e/standalone-baseline.json`
(`scripts/check-standalone-baseline.mjs:180-192` fails on any extra spec), so
landing the new spec REQUIRES regenerating the committed baseline in the same
change (`node scripts/check-standalone-baseline.mjs --write`) once test
identities are final, then verifying with `--list-check`. This is a committed
JSON fixture regeneration — neither a workflow edit nor an e2e-coverage
allowlist row, so R7 is not violated.

Real browser (app-backed, existing wired spec): T-BACKDROP trigger assertions
restored in `tests/e2e/admin-lifecycle-layout.spec.ts` (§3.3).

Registry/meta: `popoverOverlayRegistry.ts` — AttentionMenu row
`unverified-gap` → `fit-within-clip`; new PublishedToggle `fit-within-clip`
row; zero remaining `unverified-gap` rows after this cluster.

## 11.1 UI quality gate (invariant 8 — mandatory closeout, review R1 F4)

This cluster edits `components/**`, so the impeccable dual gate applies in
full (AGENTS.md plan-wide invariant 8): `/impeccable critique` AND
`/impeccable audit` on the affected diff, each with the canonical v3 setup
gates (the impeccable context script's load of PRODUCT.md + DESIGN.md, then the register
reference read), run AFTER implementation and BEFORE the whole-diff
cross-model review. P0/P1 findings are fixed or explicitly deferred via a
`DEFERRED.md` entry; findings + dispositions recorded in the plan's closeout.
The plan directory carries the machine-checkable marker line
(`impeccable-gate: …`, grammar per the 2026-08-01
invariant-8-closeout-enforcement spec §3.3), enforced by
`tests/docs/_metaInvariant8Closeout.test.ts`. The §3.1 trigger-elevation and
§5.2 copy changes additionally observe the pre-code mechanical checklist
(44px tap targets, apostrophe literals, canonical token classes) before the
gate runs.

## 12. Out of scope

- Placement-module migration for AttentionMenu or ReSyncButton (R3; ReSync's
  own registry reason at `popoverOverlayRegistry.ts:56-60` stands).
- Any backdrop/portal restructuring in ShareHub (R1).
- `tests/ci/**`, workflow files, e2e-coverage allowlists (R7).
- BACKLOG.md graduation mechanics happen at close-out per repo convention
  (three-way keep-both-sides merge note, `git log` `af2cebbe8`).
