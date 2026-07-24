# Share-hub popover portal/placement migration + state-conditional Archive copy

**Date:** 2026-07-24
**Branch:** `feat/sharehub-archive-copy-reveal`
**Surfaces:** `components/admin/showpage/ShareHub.tsx`, `app/help/admin/dashboard/page.mdx`, `BACKLOG.md`, `DEFERRED.md`, `DEFERRED-archive.md`
**Origin:** the two open deferrals `SHAREHUB-ARM-VIEWPORT-REVEAL-1` and `SHAREHUB-ARCHIVE-GRAVITY-CUE-1` (`DEFERRED.md`), both filed from the `feat/archive-row-menu-idiom` close-out (PR #573).

---

## 1. Problem

### 1.0 What the empirical probe found (§9 is the raw data)

`SHAREHUB-ARM-VIEWPORT-REVEAL-1` was filed as **P2**: "the armed Archive confirm settles below the viewport on short phones (auto-reveal stops at the popover scroller)", mitigated by "The user CAN reach them by scrolling the modal panel manually" (`DEFERRED.md`; same claim in `BACKLOG.md` `BL-SHAREHUB-ARM-VIEWPORT-REVEAL`).

**That mitigation is false and the severity is understated.** A real-browser probe (§9) measured:

1. `[data-review-modal-panel]` is **`overflow: clip`** (`components/admin/review/ReviewModalShell.tsx:623`). A clip box is not a scroll container: it reports a `scrollHeight` (1854) exceeding its `clientHeight` (476) — which is why an earlier reading took it for a scroller — but assigning `scrollTop` is a no-op. The probe asserted this directly: `panelIsScrollContainer: false`, and a manual `panel.scrollTop += overshoot` left it at `0`.
2. Walking the chain from the armed confirm to `<html>`, **no ancestor between the popover and the viewport is a scroll container**: `body` is `overflow: hidden` (modal scroll-lock), the modal wrapper is `fixed inset-0`. The popover's own scroller is the only one that exists.
3. The popover therefore overhangs the clip edge, and because it carries its own `overflow-y-auto` (`ShareHub.tsx:487`), the tail of its scroll range lands in the hidden strip below that edge. Scrolling it to `maxScroll` brings content only to the bottom of the **scrollport**, which is itself off-screen. The last 108-261px of popover content is unreachable at every measured height, and the armed Confirm and Cancel live in that band.

Reachability of the armed confirm, five heights (§9.2):

| viewport | popover box | clip edge | confirm at best scroll | reachable |
| -------- | ----------- | --------- | ---------------------- | --------- |
| 390x844 | 474 -> 952 | 844 | 802-846 | 42 of 44px (2px clipped) |
| 390x740 | 458 -> 936 | 740 | 786-830 | no |
| 390x667 | 447 -> 914 | 667 | 762-806 | no |
| 390x620 | 440 -> 872 | 620 | 722-766 | no |
| 390x560 | 431 -> 823 | 560 | 671-715 | no |

The geometry is structural. The hub's anchor sits a **constant 347px below the panel's top edge** at every measured height (fixed sub-header stack above it; measured 347 at both 560 and 844). The panel is `max-h-[85vh]`; the popover is `max-h-[min(70vh,30rem)]`. Fitting requires `347 + popoverHeight <= 0.85 * vh`:

- 30rem cap binding (`vh >= 686`): `347 + 480 = 827 <= 0.85vh` -> **`vh >= 973px`**.
- 70vh cap binding (`vh < 686`): `347 + 0.7vh <= 0.85vh` -> `347 <= 0.15vh` -> **`vh >= 2313px`**, i.e. never.

Clipped on every phone and most portrait tablets. Commit `cedc10c22` ("tighten share-hub popover height cap to 30rem") patched one instance of this class at 600x1000; it works there and leaves every phone broken.

**Reclassification:** a functional defect on a destructive control, not P2 polish. On a 390x667 iPhone SE an operator can arm Archive and reach neither Confirm nor Cancel. Escape still closes the popover, so nobody is trapped, but the action cannot be completed.

### 1.1 This defect class is already RESOLVED in this repo — the share hub was never migrated

`BACKLOG.md` `BL-HOVERHELP-PORTAL` documents the identical class against `HoverHelp`, in the same panel:

> `HoverHelp` positions its popover body absolutely IN FLOW rather than portaling it. Inside a scrolling surface the popover can be visually clipped by an ancestor, and `getBoundingClientRect()` does not reveal it (it reports the unclipped box, so a naive assertion passes). ... nested in an `overflow-clip` panel (`components/admin/review/ReviewModalShell.tsx:614`)
>
> **Status:** ✅ RESOLVED — `feat/hoverhelp-smart-position` (2026-07-22; spec `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md`). The shared `HoverHelp` body now portals — into the `ReviewModalShell` panel via `PopoverHostContext` (staying inside the focus trap / aria-modal / inert subtree) or `document.body` elsewhere — with a pure collision-aware positioning core (`lib/popover/position.ts`).

That migration shipped the pieces this fix needs:

- **`lib/popover/position.ts`** — `computePopoverPlacement`, pure placement algebra: side selection from `spaceAbove`/`spaceBelow` with ties to `preferredSide` (`lib/popover/position.ts:123-133`), `maxHeight` capping (`lib/popover/position.ts:132`), width-first wrap handling (`lib/popover/position.ts:117-121`), and a degenerate/hidden gate for non-finite or zero-area rects (`lib/popover/position.ts:103-115`). Its header states the structural intent: *"ALL placement math lives here ... The component shell only measures rects and applies the returned values"* (`lib/popover/position.ts:5-8`). Decision-table tests: `tests/lib/popover/position.test.ts`.
- **`PopoverHostContext`** — declared at `components/admin/HoverHelp.tsx:79`, provided with the panel ref at `components/admin/review/ReviewModalShell.tsx:625`.
- **`bounds` semantics** — `intersect(hostRect, viewportRect)` inset by `VIEWPORT_INSET` (`lib/popover/position.ts:46`, `lib/popover/position.ts:17`). Placing against the panel's own rect is what keeps a portaled popover inside the clip by construction.

**The share hub was simply never migrated.** It still hand-rolls `absolute right-0 top-full` with its own caret measurement (`ShareHub.tsx:180-211`, `ShareHub.tsx:487`, `ShareHub.tsx:683-690`). This spec migrates it. That is why no new placement math is written here: `computePopoverPlacement` is the flip-and-fit function, already hardened by two adversarial rounds and 19 real-browser cases (`tests/e2e/hoverhelp-geometry.spec.ts`).

Class sweep for the same shape — an overlay anchored inside the clipping panel that carries its own internal scroller:

| overlay | own scroller + cap | clip-safe today | disposition |
| ------- | ------------------ | --------------- | ----------- |
| `HoverHelp` body | yes | yes — portal + `computePopoverPlacement` | shipped 2026-07-22 |
| `ReSyncButton.tsx:69` `OVERLAY_PANEL` | yes (`max-h-[min(50vh,20rem)]`) | yes — `useFitWithinClip` (`ReSyncButton.tsx:100`) caps it against the clip edge | already correct; untouched |
| `ShareHub.tsx:487` popover | yes (`max-h-[min(70vh,30rem)]`) | **no** | **this spec** |
| `PublishedToggle.tsx:59` `POPOVER_POSITION` | **no** (no cap, no scroller) | n/a | out of scope — §7 |

`ReSyncButton` solved it a third way (fit-in-place via `lib/layout/fitWithinClip.ts`). That approach is left alone: it works, its overlay is anchored full-width `inset-x-0` where flipping buys nothing, and re-plumbing it is not this diff's job.

### 1.2 The Archive row's description is wrong in one of its two states

`SHAREHUB-ARCHIVE-GRAVITY-CUE-1` (`DEFERRED.md`) asserts Archive is "the hub's most destructive action" wearing "its calmest idle framing", and proposes an amber glyph tint, a `CAREFUL`-weight eyebrow on the Show section, or folding Archive under `CAREFUL`.

**The premise does not survive contact with what archive does.** Archive is dashboard cleanup for a wrapped show. The shipped help copy says so (`app/help/admin/dashboard/page.mdx:47`): *"Their crew links stay off until you unarchive and republish - crew who open an old link see nothing, which is the point of archiving a wrapped show."* `archive_show` (`supabase/migrations/20260601000000_b2_show_lifecycle.sql:37-55`) sets `archived = true, published = false`; regenerates the share token so existing crew links 404; bumps `picker_epoch`; nulls `unpublish_token`; deletes non-wizard `pending_syncs` / `pending_ingestions` / `deferred_ingestions`; calls `publish_show_invalidation`. Archived shows are excluded from cron polling (`lib/sync/runScheduledCronSync.ts:2152`, `and archived = false`) and orphan deletion moves from 7 to 30 days (master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1941`). It is **reversible**: `unarchive_show` (`supabase/migrations/20260601000000_b2_show_lifecycle.sql:84-110`) returns the show as Held - not published with `requires_resync = true`.

The routine intended use is the end-of-lifecycle path, so every proposed cue would make the routine path shout. All three refused. **`SHAREHUB-ARCHIVE-GRAVITY-CUE-1` closes as REFUTED** (§2.3).

What survives is a copy defect the deferral did not identify:

1. **The row rhymes with its neighbour.** Rotate reads `"Old link stops working immediately"` (`ShareHub.tsx:564`); Archive reads `"Crew links stop working immediately"` (`ShareHub.tsx:636`). Adjacent rows in one 308px popover, near-identical sentence, identical row idiom (ratified PR #573) — nothing distinguishes them at idle scan, and the weaker-sounding sentence belongs to the larger action.
2. **The sentence is false in the Held state.** `rowDescription` is a constant, but the Show section renders in both arms. On an unpublished show `linkActive` is false (`ShareHub.tsx:223`) and the popover simultaneously renders *"The crew link is paused while this show is unpublished."* (`ShareHub.tsx:543-548`). The row promises to stop access that is already stopped.
3. **It never says what the action is for.** The purpose appears only in the help page, never in the control.

---

## 1.1 Resolved scope - do not relitigate

Verify the citation; do not re-derive the decision.

| Decision | Ratification |
| -------- | ------------ |
| The idle Archive row keeps the shared §4.1 menu-row idiom with **no** destructive cue (no amber glyph, no amber eyebrow, no severity rail, no fold under `CAREFUL`). | Owner decision, 2026-07-24 brainstorm; premise refuted in §1.2 against `app/help/admin/dashboard/page.mdx:47` + `supabase/migrations/20260601000000_b2_show_lifecycle.sql:37-55` |
| No NEW placement math is written. `computePopoverPlacement` is adopted as-is. A second placement helper was drafted and **rejected** as duplicate logic. | `lib/popover/position.ts:5-8` ("ALL placement math lives here ... cannot drift per-call-site") |
| `ReSyncButton`'s fit-in-place approach is NOT migrated to the portal, and its `useFitWithinClip` is NOT extracted or shared. Untouched by this diff. | §1.1 sweep table |
| The armed confirm's long consequence sentence is UNCHANGED (owner-ratified, correctly carries the full consequence). | `components/admin/ArchiveShowButton.tsx:80-84` |
| The row variant keeps its explicit Cancel and no auto-revert timer. | `components/admin/ArchiveShowButton.tsx:82-84` |
| Archive is REVERSIBLE. Copy must not call it permanent. | `supabase/migrations/20260601000000_b2_show_lifecycle.sql:84-110`; `ShareHub.tsx:624-629` |
| `SHAREHUB-ARCHIVE-GRAVITY-CUE-1` closes as **refuted**, not deferred-again and not fixed. | Owner decision, 2026-07-24 brainstorm |
| The popover stays a popover. It does NOT become a bottom sheet below `sm`. | Owner decision, 2026-07-24 brainstorm (offered, declined) |
| Rotate's and Reset's copy are UNCHANGED. The pair stops rhyming because Archive leads with what it does. | §2.2 |
| The `scrollIntoView` arming handler (`ShareHub.tsx:608-622`) is RETAINED, not deleted. | §2.1.5 |
| The popover's `w-[308px]`, backdrop, Escape semantics, focus-on-open, and busy-gate contract are UNCHANGED. | `ShareHub.tsx:54-59`, `ShareHub.tsx:326-365`, `ShareHub.tsx:471-487` |
| `PublishedToggle`'s overlay is out of scope with a stated reason (no internal scroller, so no stranded-tail failure mode). | §1.1 sweep table, §7 |

---

## 2. Design

### 2.1 Migrate the hub popover to the shipped portal + placement stack

The migration mirrors `HoverHelp` step for step. Every sub-decision below already has a shipped precedent cited.

#### 2.1.1 Portal host and mount gate

The popover (and its caret) render through `createPortal` into `useContext(PopoverHostContext)`'s element when present, else `document.body`.

A `mounted` state flag flips in an effect before the portal is used, exactly as `HoverHelp.tsx:146-154` does, and for the reason stated there: `useHasMounted` reports true from the first client commit, when a provider's `panelRef.current` is still `null`, so the portal would fall back to `document.body` and never re-parent. The effect-flip guarantees one render after refs populate.

ShareHub mounts in exactly one place — `StatusStrip.tsx:400` -> `PublishedReviewModal.tsx:906` -> `ReviewModalShell`, which provides the host at `ReviewModalShell.tsx:625` — so the panel host is always available in production. The `document.body` fallback exists for tests and any future host-less mount, matching `HoverHelp`.

Portaling **into the panel** (not `document.body`) is load-bearing: it keeps the popover inside the shell's focus trap, `aria-modal` subtree, and `inert` handling, which is precisely why the HoverHelp migration chose that host (`BL-HOVERHELP-PORTAL` resolution note).

#### 2.1.2 Placement

Measured per open and on resize, then fed to `computePopoverPlacement`:

| input | value |
| ----- | ----- |
| `trigger` | the hub group's rect (`containerRef`, `ShareHub.tsx:369`) — the popover aligns to the group's right edge today via `right-0`, so the group stays the anchor |
| `naturalSize` | the popover body's border-box size with class caps active and no inline constraints |
| `wrappedHeightAt` | body border-box height at a forced width (the body is fixed `w-[308px]`, so this is a near-constant, but the contract is honoured rather than assumed) |
| `bounds` | `insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET)` |
| `preferredSide` | `"bottom"` — today's behavior; flipping happens only when below cannot fit |
| `align` | `"right"` — preserves the current right-edge alignment |

Returned `viewport.x/y` are applied as `position: fixed; left; top`; `maxHeight`/`maxWidth` as inline styles; `side` as `data-popover-side` on the popover (the observable test contract, mirroring `HoverHelp.tsx:279`).

`kind: "hidden"` renders nothing positioned — the same recover-next-frame posture `HoverHelp` takes for degenerate rects (`lib/popover/position.ts:106-109`).

This replaces, and deletes, the bespoke `caretRightPx` layout effect (`ShareHub.tsx:180-211`) and the `absolute right-0 top-full` / `max-w-[calc(100vw-2rem)]` positioning classes (`ShareHub.tsx:487`).

#### 2.1.3 Caret

The caret keeps its current **visual** — a 10px rotated square (`size-2.5 rotate-45`) with two borders (`ShareHub.tsx:687`) — because it is the shipped hub look and is not what this fix is about.

It does NOT consume `placement.caret`. That field is specified against a 12px-base triangle (`CARET_WIDTH = 12`, `lib/popover/position.ts:18`, `lib/popover/position.ts:60-62`), and feeding a 10px rotated square those coordinates would misalign it. Instead the caret is positioned from the returned popover box plus the existing opener-centre logic, which is unchanged in intent:

- horizontal: opener centre minus half the caret, clamped so the caret stays on the popover's straight edge run rather than a rounded corner (the constraint `CARET_EDGE_INSET` encodes at `lib/popover/position.ts:23`)
- vertical: `popoverTop - 5` when `side === "bottom"`; `popoverBottom - 5` when `side === "top"`

Border faces flip with the side so the diamond always points at the trigger:

| `side` | caret borders |
| ------ | ------------- |
| `"bottom"` (popover below trigger) | `border-t border-l` — unchanged from today |
| `"top"` (popover above trigger) | `border-b border-r` |

The caret remains a **sibling** of the popover box inside the portal, never a child: the body is `overflow-y-auto` and a child caret would be clipped away and silently invisible (`ShareHub.tsx:667-671`). It keeps `pointer-events-none` for the reason documented there — `aria-hidden` hides it from assistive tech but does not disable hit-testing, and a caret painted over the body would swallow clicks and make `panelRef.current.contains(target)` classify them as outside the dialog.

#### 2.1.4 Stacking

The elaborate `z-30`-only-while-open dance on the hub root (`ShareHub.tsx:40-52`) exists because the non-portaled popover shared a stacking context with the header attention menu's `z-20` panel, and an unconditional `z-30` painted the hub's two non-positioned trigger buttons above that menu and stole its clicks.

Once the popover portals to the panel, the hub root no longer needs to raise itself at all: the popover is not its descendant. The root's `open ? "z-30" : ""` is therefore **removed**, and the popover carries its own z-index within the portal host. The T-HUB-ZORDER real-browser test named at `ShareHub.tsx:51` is the regression proof and must still pass; §5.3 adds the attention-menu interaction case explicitly.

#### 2.1.5 The arming scroll handler is retained

The `onClick` + `requestAnimationFrame` + `scrollIntoView(confirm, { block: "end" })` handler (`ShareHub.tsx:608-622`) is unchanged. Its contract was always "scroll the popover's own scroller so the armed confirm sits at block-end", and §9 confirms it does exactly that (`after == offsetTop + offsetHeight - clientHeight`). It was never the defect — the scrollport it correctly scrolled was itself off-screen. Once §2.1.2 places the body inside `bounds`, the handler produces a visible result.

The `typeof target.scrollIntoView !== "function"` guard (`ShareHub.tsx:619`) stays: jsdom implements neither layout nor `scrollIntoView`, and this runs inside a rAF where a throw is an uncaught exception that fails the run without failing a test.

### 2.2 State-conditional Archive row copy

`ShareHub.tsx:636` becomes a `published`-conditional expression. The Archive row renders only in the `!archived` arm (`ShareHub.tsx:581`, `ShareHub.tsx:630-637`), so `archived` is always `false` here and `published` is the only live axis.

| `published` | strip state | `rowDescription` |
| ----------- | ----------- | ---------------- |
| `true` | Live; crew link active | `Ends crew access and clears it off the dashboard` |
| `false` | Held - not published; popover already says the link is paused (`ShareHub.tsx:543-548`) | `Clears this wrapped show off the dashboard` |

`rowLabel` stays `"Archive show"` (`ShareHub.tsx:635`).

Guard conditions: `published` is a required non-optional `boolean` (`ShareHub.tsx:97`), so there is no undefined branch; both arms yield a non-empty string, keeping `aria-describedby` wired (`ArchiveShowButton.tsx:257` gates on `rowDescription?.trim()`; `ArchiveShowButton.tsx:263-267` renders the `<span id={descId}>`).

Mechanical copy gates (pre-code checklist per the 2026-07-19 retrospective): no em-dash in either string; no apostrophe literals; sentence case, no terminal period, matching the sibling rotate row (`ShareHub.tsx:564`).

`Ends crew access and clears it off the dashboard` is 47 characters and wraps to two lines at `text-xs` in the row's ~250px text column, growing the row ~16px. Before §2.1 that worsened the clipping; after §2.1 the body is placed within `bounds` and internally scrollable, so the growth is absorbed. **§2.1 must land with or before §2.2.**

### 2.3 Ledger corrections

Landed in the same commit as the fix:

- `BACKLOG.md` `BL-SHAREHUB-ARM-VIEWPORT-REVEAL`: strike "The user CAN reach them by scrolling the modal panel manually (band and popover move up with it)"; record that the panel is `overflow-clip` and cannot scroll; record that the defect reaches every phone height; raise severity MEDIUM -> HIGH; mark CLOSED by this branch. Cross-reference `BL-HOVERHELP-PORTAL` as the same class, since the share hub was the unmigrated remainder.
- `DEFERRED.md` `SHAREHUB-ARM-VIEWPORT-REVEAL-1`: entry moves to `DEFERRED-archive.md` with the corrected finding and the shipping PR, per the queue's own rule (`DEFERRED.md`).
- `DEFERRED.md` `SHAREHUB-ARCHIVE-GRAVITY-CUE-1`: entry moves to `DEFERRED-archive.md` marked **REFUTED**, carrying §1.2's reasoning and citations so a future reviewer does not re-derive the premise, and noting the copy defect that shipped in its place.

### 2.4 Help copy correction

`app/help/admin/dashboard/page.mdx:49` reads *"open the show and use the **Archive show** row in its Overview section."* The control lives in the share hub, opened from the status strip's **Share link** button or its kebab (`ShareHub.tsx:394-446`), not the Overview section. Corrected to name the real path.

---

## 3. Dimensional invariants

Tailwind v4 here does not default `.flex` to `align-items: stretch`, and jsdom computes no layout, so each is verified in a real browser (§5.3).

| relationship | guarantee | test |
| ------------ | --------- | ---- |
| popover box -> `bounds` | popover rect lies entirely within `insetRect(intersect(panelRect, viewportRect), 8)`, both axes, 0.5px | T-FIT-1 |
| popover box -> visual viewport | popover rect entirely within the viewport at every swept height | T-FIT-2 |
| armed confirm + cancel -> viewport | at some reachable scroll of the popover's own scroller, both fully within the viewport | T-REACH-1 |
| idle Archive row -> viewport | reachable at some scroll with the popover idle (the 560 case where `maxScroll` is 0 today) | T-REACH-2 |
| `data-popover-side` -> available room | equals `computePopoverPlacement`'s `side` recomputed in-page from measured rects | T-SIDE-1 |
| caret -> popover near edge | abuts within 1px on whichever side is chosen; never overlaps the trigger | T-CARET-1 |
| caret -> popover corner | caret centre is at least `CARET_EDGE_INSET` from both popover corners (stays on the straight edge run) | T-CARET-2 |
| popover width | 308px at every viewport, unchanged by the migration | T-FIT-3 |
| hub triggers -> attention menu | the attention menu's panel remains clickable with the hub open (the `z-30` removal in §2.1.4) | T-HUB-ZORDER |

---

## 4. Transition inventory

Popover states: **closed**, **open-below**, **open-above**. Archive control: **idle**, **armed**. All pairs:

| transition | treatment |
| ---------- | --------- |
| closed -> open-below | instant; no animation today (`ShareHub.tsx:471` renders on `open`) — unchanged |
| closed -> open-above | instant; side is decided before paint (layout effect), so no flash at the wrong side |
| open-below -> closed | instant — unchanged |
| open-above -> closed | instant — unchanged |
| open-below -> open-above | only via viewport/host resize while open. Instant re-place, no animation: an animated flip would read as content moving under the operator's finger mid-action |
| open-above -> open-below | instant, same rationale |
| idle -> armed (either side) | instant morph, then the retained `scrollIntoView(confirm, { block: "end" })` in a rAF (`ShareHub.tsx:608-622`) |
| armed -> idle (Cancel) | instant; focus restored to the trigger (`ArchiveShowButton.tsx:175-180`) |

Compound transitions:

| compound case | treatment |
| ------------- | --------- |
| viewport resize while **armed** | placement re-runs; may flip. Armed state preserved, confirm stays mounted, re-place instant |
| host (panel) resizes while **armed** | same, via the host observer. Feature-detected — jsdom has no `ResizeObserver` and an unguarded construction takes the component down (`ReSyncButton.tsx:137-141` documents this exact trap) |
| lifecycle flip (`published`/`archived`) while open | unchanged: popover closes, focus restored (`ShareHub.tsx:290-310`); portal unmounts with it |
| child action mid-flight (`busy`) while viewport resizes | placement re-runs; dismissal stays gated (`ShareHub.tsx:262`). Resizing must not close the popover |
| dev-capture `preCapture` closes the popover | unchanged (`ShareHub.tsx:244-252`). Note: capture targets `[data-review-modal-panel]` (`ShareHub.tsx:240`) and the portal host IS that panel, so an open popover would appear in the capture — `preCapture` already closes it first and waits two frames |
| Escape while open-above | identical to open-below: capture-phase document handler stops propagation so the shell does not close the whole modal (`ShareHub.tsx:326-344`) |

---

## 5. Tests

Anti-tautology posture: assertions are scoped so the thing under test cannot pass by accident, and expected values are derived from measured geometry, never hardcoded to a viewport that might stop overflowing.

### 5.1 Unit — placement adoption (`tests/lib/popover/position.test.ts`, extended)

`computePopoverPlacement` is already covered by its decision table. Added: **the real measured 390x560 hub geometry from §9** (`trigger` = the hub group at `381.3 -> 425.3`, `bounds` from the panel at `84 -> 560` inset 8, natural body height 578, cap 390) asserting `side === "top"`. This grounds the adoption in the probe rather than in invented figures, and fails if the module's tie/flip ordering ever regresses under the hub's real numbers.

### 5.2 Unit — copy branch (`tests/components/admin/showpage/shareHub.test.tsx`)

1. `published: true, archived: false` -> Archive row description is `Ends crew access and clears it off the dashboard`.
2. `published: false, archived: false` -> `Clears this wrapped show off the dashboard`.
3. The description node is the one the button's `aria-describedby` resolves to — assert via the IDREF, not a text query. A container-scoped text query would also match the paused note and pass on either branch.
4. Rotate's description is unchanged in both arms — pins that the pair stopped rhyming by changing Archive only.

jsdom computes no layout, so §5.2 asserts copy and wiring only; no geometry claim is made here.

### 5.3 Real-browser (`tests/e2e/admin-lifecycle-layout.spec.ts`)

Sweep `390 x {844, 740, 667, 620, 560}` — the heights §9 measured, so a regression at any fails. Held show, hub open, Archive armed, real Playwright clicks (the §9 probe used `element.click()` to bypass actionability precisely because the control was unreachable; a reachability test keeping that bypass would assert nothing):

T-FIT-1, T-FIT-2, T-FIT-3, T-SIDE-1, T-REACH-1, T-REACH-2, T-CARET-1, T-CARET-2 per §3.

Containment is asserted with `elementFromPoint` at the confirm's centre, not `getBoundingClientRect` alone — `BL-HOVERHELP-PORTAL` records that a clipped popover still reports an unclipped box, "so a naive assertion passes". `tests/e2e/published-review-modal.interactions.spec.ts` T4a is the shipped template for this kill-shot.

The existing test at `admin-lifecycle-layout.spec.ts:305` is **retained and updated**: its causality assertion (the production `scrollIntoView` call, `block: "end"`, `after == offsetTop + offsetHeight - clientHeight`) still guards the handler, but its below-fold precondition must be re-derived — a placed popover has a different `clientHeight`, and the precondition must keep failing loudly if the armed morph stops overflowing.

### 5.4 Regression — stacking

T-HUB-ZORDER (`ShareHub.tsx:51`) must still pass after the `z-30` removal, plus an added case: with the hub popover open, the header attention menu's panel receives clicks.

---

## 6. Rollout

No migration, RPC, advisory lock, schema change, new §12.4 code, or new telemetry surface — invariants 9 and 10 and the `x1-catalog-parity` gate are not engaged. UI surface is touched, so **invariant 8 applies**: `/impeccable critique` and `/impeccable audit` both run on the diff, P0/P1 fixed or explicitly deferred.

CI: `.github/workflows/lifecycle-layout-e2e.yml` runs `admin-lifecycle-layout.spec.ts` and is the gate proving §5.3.

---

## 7. Out of scope

| item | reason |
| ---- | ------ |
| `PublishedToggle.tsx:59` overlay | No internal scroller and no cap, so no stranded-tail failure mode. Error-only and momentary (`PublishedToggle.tsx:55`). Filed as `BL-PUBLISHED-TOGGLE-OVERLAY-CLIP` |
| Migrating `ReSyncButton` to the portal stack | Its fit-in-place approach works; its overlay is full-width `inset-x-0` where flipping buys nothing. §1.1 |
| Bottom sheet below `sm` | Offered and declined, 2026-07-24 brainstorm |
| Any idle destructive cue on the Archive row | Refuted, §1.2 |
| The armed confirm's consequence sentence | Owner-ratified, §1.1 |
| `BL-HOVERHELP-VISUAL-VIEWPORT` (pinch-zoom bounds) | Open carve-out on the shared module; the hub inherits whatever that module does. Not this diff |
| `admin-lifecycle-transitions.spec.ts` CI wiring | Pre-existing dark spec, `BL-E2E-LIFECYCLE-SPECS-CI-DARK` |
| `BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP`, `BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE` | Pre-existing archive-path backlog items, untouched |

---

## 8. Files

| file | change |
| ---- | ------ |
| `components/admin/showpage/ShareHub.tsx` | portal + `computePopoverPlacement`; `data-popover-side`; side-conditional caret; remove `caretRightPx` effect and root `z-30`; state-conditional `rowDescription` |
| `tests/lib/popover/position.test.ts` | add the §9 hub-geometry case |
| `tests/components/admin/showpage/shareHub.test.tsx` | §5.2 |
| `tests/e2e/admin-lifecycle-layout.spec.ts` | §5.3; update the line-305 precondition |
| `app/help/admin/dashboard/page.mdx` | §2.4 |
| `BACKLOG.md`, `DEFERRED.md`, `DEFERRED-archive.md` | §2.3 |

No new source module is introduced: the placement core and the host context already exist.

---

## 9. Appendix - empirical probe (2026-07-24)

Throwaway Playwright probe (a `probe-admin-lifecycle-layout` spec under the e2e test directory, deleted before commit — measurement scaffolding, not a regression test; §5.3 carries the durable assertions). mobile-safari project, `E2E_PORT=3005`, loopback `TEST_DATABASE_URL`, Held show via `seedHeldShow()`, run against this branch's base (`origin/main` at `da33c6d7c`).

Operational note: the first two runs failed with the modal never mounting, because `/admin` rendered the onboarding wizard — a sibling session had wiped the Drive-folder connection out of `app_settings` (the known cross-session wipe from `tests/e2e/helpers/devCaptureStaged.ts:69`). Restored with `pnpm db:seed`. PR #573's spec §10 recorded the same interference.

### 9.1 Scroll-container analysis at 390x560

```json
{"panelOverflow":"clip/clip","panelIsScrollContainer":false,
 "panelRect":{"top":84,"bottom":560},
 "popRect":{"top":431.3,"bottom":823.3},
 "popClippedBelowPanel":true,
 "scrollersInsideModal":[
   {"testid":"share-hub-popover","scrollH":578,"clientH":390,"containsConfirm":true}]}
```

Candidate repairs trialled in-page, both scrollers reset before each — none reveals the confirm, because none can move a scroller that does not exist:

```json
{"baseline":                          {"panelScrollTop":0,"popScrollTop":81, "confirm":[778.4,822.4],"visible":false},
 "A_confirm_scrollIntoView_end_again":{"panelScrollTop":0,"popScrollTop":81, "confirm":[778.4,822.4],"visible":false},
 "B_confirm_scrollIntoView_center":   {"panelScrollTop":0,"popScrollTop":188,"confirm":[671.4,715.4],"visible":false},
 "C_popover_scrollIntoView_nearest":  {"panelScrollTop":0,"popScrollTop":81, "confirm":[778.4,822.4],"visible":false},
 "D_popover_scrollIntoView_end":      {"panelScrollTop":0,"popScrollTop":82, "confirm":[777.4,821.4],"visible":false},
 "E_manual_panel_scrollTop_delta":    {"panelScrollTop":0,"popScrollTop":81, "confirm":[778.4,822.4],"visible":false}}
```

Candidate E is decisive: assigning `panel.scrollTop += overshoot` left it at `0`. `overflow: clip` is not a scroll container.

Selected chain rows (confirm -> `<html>`):

| element | overflow x/y | position | scrollH / clientH | rect top/bottom |
| ------- | ------------ | -------- | ----------------- | --------------- |
| `share-hub-popover` | auto/auto | absolute | 578 / 390 | 431.3 / 823.3 |
| `share-hub-root` | visible/visible | relative | 442 / 44 | 381.3 / 425.3 |
| `show-status-strip` | visible/visible | static | 596 / 198 | 227.3 / 425.3 |
| `published-show-review-subheader` | visible/visible | relative | 604 / 214 | 219.3 / 434.3 |
| `[data-review-modal-panel]` | **clip/clip** | relative | 1854 / 476 | 84 / 560 |
| `published-show-review-modal` | visible/visible | **fixed** | 560 / 560 | 0 / 560 |
| `body` | **hidden**/hidden | static | 6456 / 6456 | 0 / 6455.6 |
| `html` | visible/visible | static | 6456 / 560 | 0 / 560 |

`panelContainsConfirm: true`, `popoverOffsetParent: "share-hub-root"`, `document.scrollingElement.scrollTop: 0`.

### 9.2 Reachability sweep

```
390x844 {popTop:474,popBottom:952,popClientH:478,popScrollH:578,maxScroll:100,confirm@max:[802,846],reachable:false}
390x740 {popTop:458,popBottom:938,popClientH:478,popScrollH:578,maxScroll:100,confirm@max:[786,830],reachable:false}
390x667 {popTop:447,popBottom:914,popClientH:465,popScrollH:578,maxScroll:113,confirm@max:[762,806],reachable:false}
390x620 {popTop:440,popBottom:872,popClientH:432,popScrollH:578,maxScroll:146,confirm@max:[722,766],reachable:false}
390x560 {popTop:431,popBottom:823,popClientH:390,popScrollH:578,maxScroll:188,confirm@max:[671,715],reachable:false}
```

`popTop - panelTop` is 347 at both 560 and 844 — the constant that makes §1.0's inequality structural.

### 9.3 Post-fix prediction (confirmed by §5.3, not asserted here)

At 390x560 with §2.1 applied: `bounds` = panel `84 -> 560` inset by `VIEWPORT_INSET` (8) = `92 -> 552`. `spaceBelow = 552 - 425.3 - 6 = 120.7`; `spaceAbove = 381.3 - 92 - 6 = 283.3`. The body's natural height (578) exceeds both, so `computePopoverPlacement` picks the larger side — `top` — and caps `maxHeight` at `283`, placing the body fully inside the panel with its own scroller reaching every control. Today's number for comparison: 390px of body, of which 129px is on screen.
