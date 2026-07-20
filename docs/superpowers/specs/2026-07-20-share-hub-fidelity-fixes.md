# Share-hub fidelity fixes — z-order + Careful menu rows

**Date:** 2026-07-20
**Slug:** `2026-07-20-share-hub-fidelity-fixes`
**Follows:** `docs/superpowers/specs/2026-07-20-share-hub-design.md` (#511, merged)
**Design mock:** `docs/superpowers/specs/2026-07-20-share-hub-mock/ActionBarMenu-1d.dc.html`
**Surface:** admin published review modal (`/admin?show=<slug>`) — status band share hub.

Two operator-reported defects on the shipped share hub, plus one mock-fidelity gap
surfaced while diagnosing them. All three are presentation-layer; no server action,
RPC, migration, advisory lock, telemetry code, or `§12.4` catalog row changes.

---

## 1. Problem

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Share-link button stays **non-accent** (no orange fill) even though the mock draws it orange. The band's accent set is contractually EXACTLY {published-toggle, status-dot-live}. | `components/admin/showpage/ShareHub.tsx:243-250`; `tests/e2e/published-review-modal.layout.spec.ts:765` (T-NO-ORANGE) |
| Popover anchoring stays `absolute right-0 top-full` against ShareHub's OWN `relative` root — NOT the strip row, which deliberately has no `relative`. | `components/admin/showpage/ShareHub.tsx:15-23`; `components/admin/showpage/StatusStrip.tsx:175` |
| The busy/dismissal contract (`onBusyChange` per child, 15s `BUSY_GATE_MAX_MS`, deferred-close CANCELLED on settle) is unchanged by this spec. Row restyling must not alter a single dismissal path. | `components/admin/showpage/ShareHub.tsx:55`, `components/admin/showpage/ShareHub.tsx:127-177` |
| The two-tap `idle → confirm → resolving` state machine, its 4s `ARM_REVERT_MS` auto-revert, C3 open-focus and C5 close-focus contracts are unchanged. Only the **idle** render changes. | `app/admin/show/[slug]/RotateShareTokenButton.tsx:30`, `app/admin/show/[slug]/RotateShareTokenButton.tsx:111-125`; `app/admin/show/[slug]/PickerResetControl.tsx:24`, `app/admin/show/[slug]/PickerResetControl.tsx:82-98` |
| The confirm-state renders are already mock-conformant in structure and are OUT OF SCOPE. The mock's amber confirm card uses raw hexes (`#fff3d6` / `#5c3f00`); the shipped `bg-warning-bg` / `text-warning-text` tokens are the ratified equivalents and stay. | `app/admin/show/[slug]/RotateShareTokenButton.tsx:301-325` |
| `RotateShareTokenButton`'s **non-compact** render has no production consumer left (only `tests/components/RotateShareTokenButton.test.tsx` and `tests/app/admin/rotateShareToken.test.tsx` mount it). Removing it is explicitly OUT OF SCOPE for this spec — it is dead-code cleanup, not a defect. | `grep -rn --include='*.tsx' '<RotateShareTokenButton' app components` returns only `ShareHub.tsx:353` |
| Mutual exclusion between the attention menu and the share hub (one closing the other) is OUT OF SCOPE — they are sibling components with no shared state. §3.3 states what happens when both are open instead. | this spec §3.3 |
| No new `§12.4` error code, no new `admin_alerts` code, no `logAdminOutcome` surface. Nothing in this diff mutates state. | this spec §6 |

### 1.2 Defect A — the share hub paints over the open attention menu

`ShareHub`'s root is `relative z-30` **unconditionally**
(`components/admin/showpage/ShareHub.tsx:221`). The attention pill's wrapper is a bare
`relative` with no z-index (`components/admin/showpage/PublishedReviewModal.tsx:510`),
and the `AttentionMenu` panel inside it is `z-20`
(`components/admin/showpage/AttentionMenu.tsx:99`).

Both wrappers are positioned elements in the same stacking context (the modal panel).
A positioned element with `z-index: 30` paints above a positioned element with
`z-index: auto` regardless of DOM order and regardless of the descendant's own z-index —
`z-20` inside a `z-auto` wrapper cannot escape its parent's paint order. So the **closed**
share hub's "Share link" button and kebab render on top of the open attention menu,
obscuring a menu row and stealing its clicks.

Observed: the "Share link" button drawn over the "Role change applied" row of the open
"NEEDS YOUR CONFIRMATION" menu.

### 1.3 Defect B — the Careful rows do not match the mock

The mock's idle state for both destructive controls is **one full-width borderless menu
row**: a 16px leading icon, then a stacked label + description, with the whole row as the
button (`docs/superpowers/specs/2026-07-20-share-hub-mock/ActionBarMenu-1d.dc.html:111`
rotate, `docs/superpowers/specs/2026-07-20-share-hub-mock/ActionBarMenu-1d.dc.html:123` reset).

Shipped instead:

- **Rotate** — label + description on the left, a separate bordered `Rotate` button on the
  right (`app/admin/show/[slug]/RotateShareTokenButton.tsx:279-286`, button at `app/admin/show/[slug]/RotateShareTokenButton.tsx:213-234`).
- **Reset** — an `<h4>` + description, then a full-width bordered
  `Reset everyone's pick` button on the line below
  (`app/admin/show/[slug]/PickerResetControl.tsx:211-271`).

Neither matches the mock, and neither matches the popover's own already-shipped mailto row
(`components/admin/showpage/ShareHub.tsx:315-327`), which IS a borderless icon+label menu
row. The popover currently renders three rows in three different shapes.

### 1.4 Defect C — no caret notch

The mock draws a caret notch on the panel's top edge pointing at the kebab
(visible in the mock render; the panel is anchored to the trigger group). The shipped
popover has none, so it reads as a detached card rather than an attached popover.

---

## 2. Goals / non-goals

**Goals**

1. An open attention menu is never obscured by the closed share hub's controls.
2. The two Careful rows render as menu rows matching the mock and the popover's existing
   mailto row.
3. The popover carries a caret notch pointing at the kebab.

**Non-goals** — everything in §1.1, plus: no change to the mailto rows, the crew-link code
block, the Copy button, the paused note, the unavailable note, or the `Crew link` /
`Careful` eyebrow headings.

---

## 3. Design — Defect A (z-order)

### 3.1 Rule

**Elevation is a property of an OPEN popover, never of a trigger.** Each popover's wrapper
elevates itself only while its own disclosure state is open, and drops back to `z-auto`
when closed.

- `ShareHub` root: `relative` always; `z-30` **only when `open`**
  (`components/admin/showpage/ShareHub.tsx:221`).
- Attention pill wrapper: `relative` always; `z-30` **only when `menuOpen`**
  (`components/admin/showpage/PublishedReviewModal.tsx:510`).

The inner z-indexes are unchanged: ShareHub backdrop `z-20`, ShareHub popover `z-40`
(both scoped inside the elevated root), AttentionMenu panel `z-20`.

### 3.2 Why the attention wrapper also changes

Fixing only ShareHub leaves both wrappers at `z-auto` when the share hub is closed, so
paint order falls back to DOM order — and `StatusStrip` (which hosts `ShareHub`) renders
AFTER the header that hosts the attention pill, so the share hub's controls would STILL
paint over the open menu. The attention wrapper must positively elevate while its menu is
open. Both halves are required; neither alone fixes the defect.

### 3.3 Guard: both open at once

Reachable only by keyboard. Pointer input cannot produce it: `AttentionMenu` closes on any
document `pointerdown` outside its panel and pill
(`components/admin/showpage/AttentionMenu.tsx:71-80`), and while the share hub is open its
`fixed inset-0 z-20` backdrop sits above the pill and swallows the click
(`components/admin/showpage/ShareHub.tsx:222-233`).

When both are open, both wrappers are `z-30` and DOM order decides: the share hub's popover
(later in the DOM) paints above the attention menu. **This is the declared, accepted
behavior** — the share hub is the surface the operator most recently interacted with in the
keyboard sequence that produces the overlap. No mutual-exclusion logic is added (§1.1).

### 3.4 Guard conditions

| State | ShareHub wrapper | Attention wrapper | Result |
| --- | --- | --- | --- |
| Both closed | `z-auto` | `z-auto` | No overlap possible (no panel rendered). |
| Attention open, hub closed | `z-auto` | `z-30` | Menu above the Share link button. **Defect A fixed.** |
| Hub open, attention closed | `z-30` | `z-auto` | Popover above the pill; backdrop intercepts pill clicks. Unchanged from today. |
| Both open (keyboard only) | `z-30` | `z-30` | Share hub popover wins by DOM order (§3.3). |
| `actionable.length === 0` | `z-auto` / `z-30` per `open` | wrapper not rendered at all (`components/admin/showpage/PublishedReviewModal.tsx:509` ternary) | No attention wrapper exists; nothing to collide with. |
| Degraded-alerts branch (`alertsDegraded && clearingCount === 0`) | per `open` | renders a `<span>` pill with NO wrapper and NO menu (`components/admin/showpage/PublishedReviewModal.tsx:558-564`) | No menu exists; nothing to collide with. |

---

## 4. Design — Defect B (Careful menu rows)

### 4.1 Row anatomy (idle state only)

One `<button type="button">` per control, full width, borderless, transparent background:

```
[ 16px icon ][ label            ]
             [ description      ]
```

Token mapping from the mock (mock hexes are never used directly — DESIGN.md tokens are):

| Mock | Shipped class | Note |
| --- | --- | --- |
| `display:flex;align-items:center;gap:11px;width:100%` | `flex w-full items-center gap-2` | `gap-2` (8px) matches the popover's existing mailto row (`components/admin/showpage/ShareHub.tsx:320`), which is the row family this joins. |
| `min-height:40px` | `min-h-tap-min` (44px) | **The 44px tap floor wins over the mock's 40px.** Same precedent as T-NO-ORANGE: project invariants beat mock geometry. |
| `padding:8px` | `px-2` | Vertical padding is supplied by `min-h-tap-min`; `py` would compound it. Matches the mailto row. |
| `border-radius:7px` | `rounded-sm` | Codebase token. |
| `background:transparent`, hover `#f4f3f1` | (no bg class) + `hover:bg-surface-sunken` | Matches the mailto row. |
| `text-align:left` | `text-left` | Needed because the row is a `<button>` (which centers by default). |
| icon `16px`, `color:#5a5b62` | `size={16}` + `shrink-0 text-text-subtle` | Matches the mailto row's `<Mail size={16} className="shrink-0 text-text-subtle" />`. |
| label 13px weight 500, `#0e0f12` | `text-sm font-medium text-text-strong` | 14px, the codebase row idiom (`components/admin/showpage/AttentionMenu.tsx:125`). |
| description 11px line-height 1.3, `#8b8c92` | `text-xs text-text-subtle` | Matches `components/admin/showpage/AttentionMenu.tsx:129`. |

Plus the codebase-standard focus ring, carried over verbatim from the existing controls:
`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`.

The label/description pair is wrapped in a `min-w-0` flex column so a long description
cannot force the row wider than the 308px panel.

### 4.2 Accessible name

The row follows the shipped `AttentionMenu` row precedent
(`components/admin/showpage/AttentionMenu.tsx:112-137`): **no `aria-label`, no
`aria-describedby`** — both label and description are visible text inside the button, so
the accessible name is the concatenation.

- Rotate: `"Rotate share link Old link stops working immediately"`
- Reset (crew present): `"Reset everyone's pick Make everyone pick their name again on their next visit."`
- Reset (no crew): `"Reset everyone's pick No crew to reset yet."`

This REPLACES the compact-mode `aria-label="Rotate share link"` +
`aria-describedby={descId}` pair at `app/admin/show/[slug]/RotateShareTokenButton.tsx:219-220`. An `aria-label`
would suppress the description from assistive tech, which is exactly the warning the row
exists to deliver. Tests must therefore assert the accessible name with an **anchored
prefix regex** (`/^Rotate share link/`), not an exact string.

### 4.3 Deliberate reversal: PCR-1 (b) heading

`PickerResetControl` renders `Reset everyone's pick` as an `<h4>`
(`app/admin/show/[slug]/PickerResetControl.tsx:216`), ratified as "PCR-1 (b): heading
(under the panel's `<h3>`) so the control is reachable in the screen-reader heading
outline" (`app/admin/show/[slug]/PickerResetControl.tsx:214-215`). That contract was written when the control lived in a full-width
**panel section** with multiple sibling headings.

In the popover it is one of three sibling **rows** under the `Careful` `<h3>`
(`components/admin/showpage/ShareHub.tsx:349-351`), alongside the mailto row — which is a plain `<a>` with no
heading. A heading per row is inconsistent with its siblings and cannot be a heading and a
button label at the same time.

**Resolution: the `<h4>` is removed.** The row is reachable via the button list and the
`Careful` `<h3>` above it; the heading outline still names the group. This is a deliberate,
scoped reversal of PCR-1 (b) for the ONLY consumer of the component, recorded here so a
reviewer verifies the trade rather than re-deriving it.

### 4.4 What does NOT change

- Every `data-testid`: `admin-rotate-share-token-button`, `picker-reset-all-button`,
  `picker-reset-control`, both `*-confirm-row`, both `*-confirm-button`,
  both `*-cancel-button`, and every banner testid.
- `triggerRef` stays on the idle row button, so the C5 close-focus restore
  (`app/admin/show/[slug]/RotateShareTokenButton.tsx:120-125`, `app/admin/show/[slug]/PickerResetControl.tsx:93-98`) still lands on a
  mounted node.
- `disabled={!hasCrew}` on the reset row, and its `"No crew to reset yet."` description
  swap (`app/admin/show/[slug]/PickerResetControl.tsx:218-221`,
  `app/admin/show/[slug]/PickerResetControl.tsx:264`).
- Both banner blocks and the `sr-only` live region (`app/admin/show/[slug]/PickerResetControl.tsx:170-207`).
- The confirm-state renders (§1.1).
- `RotateShareTokenButton`'s non-compact branch — untouched, still exercised by its
  existing tests.

### 4.5 Guard conditions

| Input | Rotate row | Reset row |
| --- | --- | --- |
| `compact=false` or `rowLabel` absent | Non-compact branch, unchanged. | n/a (component has no compact flag). |
| `rowDescription` absent | Row renders label only; no empty description node. | n/a (description is always one of two literals). |
| `crew.length === 0` | n/a | Row is `disabled`, description reads `"No crew to reset yet."`, `disabled:opacity-60 disabled:cursor-not-allowed` retained. |
| `isCrewLinkActive=false` (unpublished show) | Row renders and is enabled — rotating an unpublished show is supported (`components/admin/showpage/ShareHub.tsx:343-344`). | Unaffected. |
| `ui !== "idle"` | Confirm/resolving render, unchanged. | Confirm/resolving render, unchanged. |
| Description long enough to wrap | `min-w-0` column wraps inside 308px; row grows past `min-h-tap-min`. | Same. |

### 4.6 Dimensional Invariants

This project's Tailwind v4 does NOT default `.flex` to `align-items: stretch`, so every
parent→child dimension relationship on the changed nodes is named here with the exact class
that guarantees it. All of these are verified in a real browser (§7.3, §7.4) — jsdom
computes no layout and can only see the class strings.

| Parent (fixed dimension) | Child | Invariant | Guaranteed by |
| --- | --- | --- | --- |
| Popover panel, `w-[308px]` (`components/admin/showpage/ShareHub.tsx:289`) | each Careful row `<button>` | row width === panel content width | `w-full` on the row + the panel's `flex-col` (cross-axis is width; `w-full` is explicit, not inherited from stretch) |
| Careful row `<button>`, `min-h-tap-min` | leading icon `<span>` | icon never shrinks below 16px when the label wraps | `shrink-0` on the icon |
| Careful row `<button>` | label/description `<span>` column | column may shrink to zero basis so long text wraps instead of widening the row | `min-w-0` on the column |
| Careful row `<button>` | label + description | both are vertically centered as one block, not baseline-split | `items-center` on the row + `flex-col` on the column |
| Popover outer wrapper (positioned, un-clipped) | inner scroll container | inner container owns `max-h-[min(70vh,32rem)] overflow-y-auto`; the outer owns position/border/background so the caret is NOT clipped | classes split per §5; the caret is a sibling of the inner container |
| Popover outer wrapper | caret `<span>` | caret's horizontal center === kebab's horizontal center (±0.5px) | `right-[17px]` measured from the panel's right edge, which is the trigger group's right edge via `right-0` |
| Trigger group root (`relative`) | popover panel | panel's right edge === group's right edge | `right-0` on the panel against the group's `relative` |

Rows are NOT fixed-height (they are `min-h-`), so no child is required to match a row's
height; that is deliberate — a wrapped description must be allowed to grow the row.

### 4.7 Transition inventory

The idle row has two visual states; the control has three (`idle`, `confirm`,
`resolving`). All pairs:

| Pair | Treatment |
| --- | --- |
| idle rest → idle hover | `hover:bg-surface-sunken`, `transition-colors duration-fast` (carried from the existing controls). |
| idle rest → idle focus-visible | Instant — focus rings are never animated in this codebase. |
| idle → confirm | Instant swap (no `AnimatePresence`, no exit). Unchanged from today; the confirm row simply replaces the idle row. |
| confirm → resolving | Instant — same node, label text swaps (`"Confirm rotate"` → `"Rotating…"`). Unchanged. |
| resolving → idle | Instant remount of the idle row + banner. Unchanged. |
| confirm → idle (cancel / 4s auto-revert) | Instant. Unchanged. |
| Compound: hover held while idle → confirm fires | The idle row unmounts mid-hover; no stranded hover style (the class is a CSS hover pseudo-class, not JS state). |
| Compound: popover closes while row is in confirm | Prevented — dismissal is inert while `busy`, and `confirm` (pre-submit) is NOT busy, so the popover DOES close and the confirm row unmounts. Unchanged from today and out of scope. |

The caret notch (§5) is a static decoration with no state and therefore no transitions.
The popover's own open/close remains instant (no entrance animation) — unchanged.

---

## 5. Design — Defect C (caret notch)

A 10px square rotated 45°, positioned on the panel's top edge, centered under the kebab:

- Element: `<span aria-hidden="true">`, purely decorative.
- Classes: `absolute -top-[5px] right-[17px] size-2.5 rotate-45 border-l border-t border-border bg-surface`.
- Geometry: the kebab is `size-tap-min` (44px) and is the rightmost element of the trigger
  group; the panel is `right-0` against that same group, so the kebab's horizontal center
  sits 22px from the panel's right edge. A 10px square centered there needs
  `right: 22 − 5 = 17px`. `-top-[5px]` puts half the square above the panel edge.
- Only `border-l` + `border-t` are drawn: after the 45° rotation those two edges form the
  outward-facing V, and the untouched edges stay hidden behind the panel body.
- `bg-surface` matches the panel fill so the notch reads as continuous with it.
- The panel keeps `overflow-y-auto`; the notch is a child of the panel and would be clipped
  by it, so the notch is rendered as a sibling INSIDE the popover's positioned wrapper —
  i.e. the popover gains an inner scroll container so the caret can live outside the
  clipped region. Concretely: the existing `max-h`/`overflow-y-auto`/`flex-col gap-2`
  classes move to an inner `<div>`, and the outer popover keeps position, width, border,
  background, radius, shadow, and the caret.

**Guard:** at `max-w-[calc(100vw-2rem)]` on a 390px viewport the panel is still anchored
`right-0`, so the caret's 17px right offset remains correct at every width — it is measured
from the panel's right edge, not its center.

---

## 6. Out-of-scope surfaces (explicit N/A)

| Layer | Action |
| --- | --- |
| DB / migrations / schema manifest | N/A — no schema change. |
| RPC / advisory locks | N/A — no code path in this diff mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions`. No `pg_advisory*` call is added or moved. |
| Email canonicalization | N/A — no raw email crosses a boundary; the mailto builder is untouched. |
| Supabase call boundaries (invariant 9) | N/A — no Supabase client call is added. No `_metaInfraContract` row needed. |
| Mutation-surface observability (invariant 10) | N/A — no route handler and no `"use server"` action is added or modified. `rotateShareToken` / `resetPickerEpoch` call sites are unchanged; their existing `AUDITABLE_MUTATIONS` rows still apply. |
| §12.4 catalog / `admin_alerts` | N/A — no new code. |
| Help screenshots | Deferred check: `public/help/screenshots/` baselines are byte-pinned. The plan must confirm whether the share popover appears in any captured route and, if so, that the capture manifest is regenerated from the pinned x64 Docker image — never from this arm64 host. |

---

## 7. Test plan

### 7.1 jsdom (unit) — `tests/components/admin/showpage/shareHub.test.tsx`

1. **Z-order class contract.** Closed hub: root element has `relative` and NOT `z-30`.
   Open hub: root has both. Failure caught: an unconditional `z-30` regressing in.
   (jsdom loads no CSS, so this is a class assertion, deliberately — real paint order is
   proved in §7.3.)
2. **Rotate row shape.** Open the hub; the rotate control is a single `<button>` whose
   accessible name matches `/^Rotate share link/` AND contains
   `Old link stops working immediately`. Assert there is NO separate button whose name is
   exactly `Rotate`. Failure caught: the split label/button layout regressing in.
3. **Reset row shape.** Same, name matches `/^Reset everyone's pick/`; assert the popover
   contains NO `<h4>`. Failure caught: the PCR-1 (b) heading returning.
4. **Reset row disabled with empty crew**, description reads `No crew to reset yet.`
5. **Row family consistency.** All three interactive rows under the panel (mailto, rotate,
   reset) resolve `min-h-tap-min`. Scope the query to the popover and, for the mailto
   assertion, exclude the two Careful rows so the assertion cannot pass on the wrong node
   (anti-tautology).

### 7.2 jsdom — the two control test files

`tests/components/RotateShareTokenButton.test.tsx` and
`tests/admin/pickerResetControl.test.tsx` are updated where they assert the OLD idle shape
(exact accessible name `Rotate`, the `<h4>`, the `aria-describedby` wiring). Every
state-machine, focus, busy-contract, and banner assertion stays untouched — if any of those
needs to change, the change is wrong.

### 7.3 Real browser — `tests/e2e/published-review-modal.interactions.spec.ts`

**T-HUB-ZORDER.** The hydrated app (this test clicks; the layout spec is a static harness
and cannot open a menu — memory: static-vs-hydrated harness).

1. Seed a show whose derived attention list has ≥1 actionable item; open the modal.
2. Open the attention menu via the pill.
3. Read `getBoundingClientRect()` for the menu panel and for
   `[data-testid="share-hub-primary"]`.
4. **Precondition assertion (fails loud, never skips):** the two rects intersect. If they
   do not, the test is not exercising the defect and must fail so the geometry change is
   noticed.
5. At the intersection's center point, `document.elementFromPoint(x, y)` returns a node
   contained by the menu panel — not by the share-hub root.

Failure caught: exactly the reported defect. A class-only assertion would pass against a
wrapper that is elevated but still loses to DOM order, which is why this is
`elementFromPoint` and not a computed-style read.

Detach-safety: every `evaluate` runs against a handle resolved in the same step, with no
sampler outliving its element.

### 7.4 Real browser — caret geometry

Extends the existing share-hub geometry block in
`tests/e2e/published-review-modal.layout.spec.ts` (near T-HUB-FLUSH, `tests/e2e/published-review-modal.layout.spec.ts:299`): with the
popover open, the caret's horizontal center sits within 0.5px of the kebab's horizontal
center. Derived from the measured kebab rect, never hardcoded to 22px.

Note: T-HUB-FLUSH itself clicks nothing today; if opening the popover is not available in
that harness, the caret assertion moves to `tests/e2e/published-review-modal.interactions.spec.ts` alongside T-HUB-ZORDER.
The plan resolves this by reading the harness, not by guessing.

### 7.5 Existing gates that must stay green

`T-NO-ORANGE` (the caret uses `bg-surface`, the rows use no accent), `T-HUB-FLUSH`,
`tests/styles` (canonical Tailwind classes), `tests/help` (UI-label crosswalk, em-dash ban
— the row copy is unchanged, so no new labels enter the crosswalk).

---

## 8. Numeric sweep

| Value | Where | Cross-check |
| --- | --- | --- |
| 44px tap floor | §4.1 `min-h-tap-min` | project invariant; overrides the mock's 40px, stated once in §4.1 |
| 308px panel width | §4.1, §5 guard | `components/admin/showpage/ShareHub.tsx:289` `w-[308px]` — unchanged by this spec |
| 10px caret | §5 (`size-2.5`) | drives the 17px offset below |
| 44px kebab | §5 | `components/admin/showpage/ShareHub.tsx:270` `size-tap-min` |
| 22px kebab center from panel right edge | §5 | 44 ÷ 2 |
| 17px caret right offset | §5 | 22 − (10 ÷ 2) |
| 5px caret top overhang | §5 | 10 ÷ 2 |
| `z-30` | §3.1, §3.4 | the only elevation value this spec introduces; inner `z-20` / `z-40` unchanged |
| 0.5px tolerance | §7.4 | project standard for real-browser geometry |
| 4s `ARM_REVERT_MS`, 15s `BUSY_GATE_MAX_MS`, 5s `SUCCESS_DISMISS_MS` | §1.1 | referenced only as unchanged constants |

No other literal appears in this document.

---

## 9. Files touched

| File | Change |
| --- | --- |
| `components/admin/showpage/ShareHub.tsx` | conditional `z-30`; split popover into positioned outer + scrolling inner; add caret |
| `components/admin/showpage/PublishedReviewModal.tsx` | conditional `z-30` on the attention pill wrapper (`components/admin/showpage/PublishedReviewModal.tsx:510`) |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx` | compact idle render → menu row |
| `app/admin/show/[slug]/PickerResetControl.tsx` | idle render → menu row; `<h4>` removed |
| `tests/components/admin/showpage/shareHub.test.tsx` | new assertions (§7.1) |
| `tests/components/RotateShareTokenButton.test.tsx` | old-shape assertions updated (§7.2) |
| `tests/admin/pickerResetControl.test.tsx` | old-shape assertions updated (§7.2) |
| `tests/e2e/published-review-modal.interactions.spec.ts` | T-HUB-ZORDER (§7.3) |
| `tests/e2e/published-review-modal.layout.spec.ts` | caret geometry (§7.4), harness permitting |

UI surface throughout ⇒ invariant 8 applies: `/impeccable critique` + `/impeccable audit`
before cross-model review.
