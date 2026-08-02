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

So there is no reachable state with both surfaces open. The closed state — the
one T-HUB-ZORDER guards — is byte-identical.

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
`components/admin/useFitWithinClip.ts (new)` (exact body move — observer wiring,
feature-detected `ResizeObserver`, callback-ref + attach-counter shape all
unchanged); `ReSyncButton` imports it. The registry's mechanism assertion is an
import-regex on `useFitWithinClip`
(`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:44-47`),
which continues to match both the moved module's consumers and `ReSyncButton`.

### 4.2 AttentionMenu

Attach the fit ref to the scroller div (`components/admin/showpage/AttentionMenu.tsx:147`,
the `max-h-96 overflow-y-auto` element). The hook caps `style.maxHeight` at
`clipBottom − elementTop − DEFAULT_CLIP_GUTTER` (`lib/layout/fitWithinClip.ts:21`, `lib/layout/fitWithinClip.ts:56`),
so at 390×560 the scroller gets ≈ `560 − 230 − 8 = 322px` and the whole menu
bottom lands inside the clip edge; at 667/844 the CSS `max-h-96` (384px)
continues to govern (fitted value ≥ 384 → `computeFittedMaxHeight` returns the
declared cap). Entrance animation note: the panel's `scale-95` entrance
(`AttentionMenu.tsx:128-130`, `origin-top-right`) can shrink the measured
`elementTop` by ≤5% for one frame; the hook's clip-ancestor `ResizeObserver` +
resize listener re-apply, and the plan's real-browser assertion measures the
settled state (`prefers-reduced-motion: reduce`, the standalone-layout-spec
idiom).

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
context on a destructive decision; no cap needed (show titles are sheet tab
names, bounded in practice; Documented limits §9).

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

No new visual states are introduced anywhere in the cluster. Affected
components' existing inventories:

| Component | States touched | Treatment |
|---|---|---|
| ShareHub triggers | closed ↔ open (existing) | Class swap adds `relative z-30` on open — z/position changes do not animate; instant, no animation needed (matches the existing instant `bg-surface-sunken` kebab swap at `ShareHub.tsx:719-721`) |
| AttentionMenu panel | entrance (scale-95→100, existing) | Unchanged; fitted max-height applies to the SCROLLER (child), not the animated panel, and is re-applied by observers after the entrance settles (§4.2) |
| PublishedToggle banner | absent ↔ error (existing, instant) | Unchanged; cap+scroll only affects overflow behavior |
| ArchiveShowButton row | resting ↔ armed (existing, instant morph) | Copy-only change in the armed branch |

Compound cases: arming Archive while the hub popover is mid-placement is
already covered by the body-content `ResizeObserver`
(`ShareHub.tsx:401-419`); nothing in this cluster alters that machinery.

## 9. Dimensional invariants

Fixed-dimension parent → child relationships this cluster creates:

1. **AttentionMenu scroller inside the clip panel:** at every viewport where
   `panel.bottom − scroller.top − 8px < 384px`, the scroller's rendered height
   equals `panel.bottom − scroller.top − 8px` (±0.5px; floor 48px), guaranteed
   by the hook's `style.maxHeight` write (`lib/layout/fitWithinClip.ts:56`).
   Where the panel affords ≥384px, rendered height ≤ 384px (`max-h-96`).
2. **Menu bottom vs clip edge:** `menu.bottom ≤ panel.bottom` at 390×560 after
   the fix (probe showed 615 > 560 before).
3. **PublishedToggle banner:** `banner.bottom ≤ panel.bottom` whenever the
   banner renders inside the clipping panel; content beyond scrolls
   (`overflow-y-auto`).

Real-browser Playwright assertions required (jsdom computes no layout); the
plan's layout-dimensions task graduates the §2 probe into a permanent
standalone spec asserting 1-2 at 390×{560,667,844} plus last-row
`elementFromPoint` reachability and ≥44px effective tap height at 560.

## 10. Documented limits

- The fit cap makes the menu's visible window smaller on very short viewports
  (322px at 390×560); with 10+ items that is more scrolling, never stranding.
  Accepted: preparedness posture is "reachable or signaled, never silently
  unreachable."
- `showName` prose wraps unbounded in the armed confirm; pathological
  multi-hundred-char titles produce a tall popover, which the ShareHub
  placement cap already bounds against the panel (`ShareHub.tsx:401-406`
  body-observer + placement cap). No truncation by design (destructive-confirm
  context beats compactness).
- The jsdom Selection timer (§2.3) remains observable in any fake-timer test
  that focuses an element; tests must keep using delta baselines rather than
  global zero-count assertions.
- Trigger elevation relies on the §3.2 mutual-exclusion argument; a FUTURE
  surface that renders another `z≥30` positioned element inside the strip
  while the hub is open would need its own registry-style reasoning (T-HUB-ZORDER
  still guards the closed state; the open-state companion pin guards this one).

## 11. Test plan (summary — plan document carries the TDD tasks)

Unit (jsdom): open-state trigger-z companion pin; armed-confirm copy pins
(with/without `showName`); registry row updates + meta-test stays green;
`rafCoalescer` throttle/cancel/reschedule unit tests; T-S8 unchanged-green;
shareHubFlashState comment update (no assertion change).

Real browser (standalone config): new `tests/e2e/popover-clip-fit.spec.ts (new)` (name added to
`tests/e2e/standalone.config.ts` `testMatch`, R7) — §9 invariants 1-2, last-row
reachability + tap height at 390×560, `PublishedToggle` banner containment with
a forced long error; runs on the existing whole-config standalone workflow.

Real browser (app-backed, existing wired spec): T-BACKDROP trigger assertions
restored in `tests/e2e/admin-lifecycle-layout.spec.ts` (§3.3).

Registry/meta: `popoverOverlayRegistry.ts` — AttentionMenu row
`unverified-gap` → `fit-within-clip`; new PublishedToggle `fit-within-clip`
row; zero remaining `unverified-gap` rows after this cluster.

## 12. Out of scope

- Placement-module migration for AttentionMenu or ReSyncButton (R3; ReSync's
  own registry reason at `popoverOverlayRegistry.ts:56-60` stands).
- Any backdrop/portal restructuring in ShareHub (R1).
- `tests/ci/**`, workflow files, e2e-coverage allowlists (R7).
- BACKLOG.md graduation mechanics happen at close-out per repo convention
  (three-way keep-both-sides merge note, `git log` `af2cebbe8`).
