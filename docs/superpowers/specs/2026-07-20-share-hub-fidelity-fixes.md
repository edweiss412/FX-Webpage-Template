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
| The confirm-state renders are OUT OF SCOPE. They are an **accepted divergence** from the mock, NOT verified conformity: the mock draws a bordered amber card with a warning icon and a question heading, and the shipped compact confirms lack several of those structural elements. Tokens (`bg-warning-bg` / `text-warning-text`) are the ratified equivalents of the mock's raw hexes and stay. Closing the structural gap is deferred, not done. | `app/admin/show/[slug]/RotateShareTokenButton.tsx:301-325` |
| `RotateShareTokenButton`'s **non-compact** render has no production consumer left (only `tests/components/RotateShareTokenButton.test.tsx` and `tests/app/admin/rotateShareToken.test.tsx` mount it). Removing it is explicitly OUT OF SCOPE for this spec — it is dead-code cleanup, not a defect. | `grep -rn --include='*.tsx' '<RotateShareTokenButton' app components` returns only `ShareHub.tsx:353` |
| Mutual exclusion between the attention menu and the share hub (one closing the other) is OUT OF SCOPE — they are sibling components with no shared state. §3.3 states what happens when both are open instead. | this spec §3.3 |
| No new `§12.4` error code, no new `admin_alerts` code, no `logAdminOutcome` surface. Nothing in this diff mutates state. | this spec §6 |

### 1.2 Defect A — the share hub paints over the open attention menu

`ShareHub`'s root is `relative z-30` **unconditionally**
(`components/admin/showpage/ShareHub.tsx:221`). The attention pill's wrapper is a bare
`relative` with no z-index (`components/admin/showpage/PublishedReviewModal.tsx:510`),
and the `AttentionMenu` panel inside it is `z-20`
(`components/admin/showpage/AttentionMenu.tsx:99`).

`z-30` establishes a stacking context at level 30 on the hub's root, which paints the
ENTIRE hub subtree — the two trigger buttons included — above the attention panel's level
20. (The `z-auto` wrapper is NOT part of the cause: `z-index: auto` establishes no stacking
context, so the panel's `z-20` participates directly in the shared ancestor context. See
§3.1.) So the **closed** share hub's "Share link" button and kebab render on top of the
open attention menu, obscuring a menu row and stealing its clicks.

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

### 3.1 Root cause, corrected

An earlier draft of this section asserted that the attention panel's `z-20` was "trapped"
inside its `z-auto` wrapper. **That is wrong and the correction changes the fix.** A
positioned element with `z-index: auto` does NOT establish a stacking context, so the
`z-20` panel participates directly in the nearest ancestor stacking context at level 20.

The panel therefore loses today for exactly one reason: `ShareHub`'s root carries
`z-30` unconditionally (`components/admin/showpage/ShareHub.tsx:221`), which DOES establish
a stacking context at level 30 and paints the whole hub — triggers included — above level
20.

### 3.2 The fix is one line, in one file

`ShareHub` root: `relative` always; `z-30` **only when `open`**
(`components/admin/showpage/ShareHub.tsx:221`).

Once the closed hub drops to `z-index: auto`, its two trigger buttons are ordinary
**non-positioned** in-flow content (`components/admin/showpage/ShareHub.tsx:251-255`,
`components/admin/showpage/ShareHub.tsx:270-272` — neither carries `relative`, `absolute`,
or `fixed`). A positioned `z-20` element paints above non-positioned in-flow content
unconditionally, so the attention menu covers the triggers with no change to
`PublishedReviewModal.tsx` at all.

**`components/admin/showpage/PublishedReviewModal.tsx:510` is therefore NOT modified by
this spec.** An earlier draft changed it; that change was unnecessary and has been dropped.

When the hub IS open, the root's `z-30` beats the panel's `z-20`, so the share popover
covers the attention menu — deterministic, and independent of DOM order.

### 3.2b Ancestor stacking contexts do not change the analysis

Verified with tooling by the implementer (the adversarial reviewer worked from an inlined
excerpt and correctly flagged that the excerpt alone could not establish this; the
verification below is the missing evidence, recorded so it is not re-derived).

The modal panel takes an **inline** `transform` during the entrance, the exit, and an
active sheet drag (`components/admin/review/ReviewModalShell.tsx:377`,
`components/admin/review/ReviewModalShell.tsx:452`,
`components/admin/review/ReviewModalShell.tsx:482`), which creates a stacking context while
set, and is cleared back to `""` at rest (`components/admin/review/ReviewModalShell.tsx:294`).
Either way the panel is a **common ancestor** of both the attention pill and the share hub,
so a stacking context on it contains both equally. The scrim container is
`fixed inset-0 z-50` (`components/admin/review/ReviewModalShell.tsx:582`) and is likewise a
shared ancestor. Between the panel and either subtree there is no `isolation`, `filter`,
`will-change`, or non-`1` `opacity`.

Because the corrected §3.1 no longer depends on the relative DOM order of the two subtrees
— only on positioned-beats-non-positioned within one shared context — the analysis holds
regardless of which subtree comes first.

### 3.3 Guard: both open at once

Reachable only by keyboard. Pointer input cannot produce it: `AttentionMenu` closes on any
document `pointerdown` outside its panel and pill
(`components/admin/showpage/AttentionMenu.tsx:71-80`), and while the share hub is open its
`fixed inset-0 z-20` backdrop sits above the pill and swallows the click
(`components/admin/showpage/ShareHub.tsx:222-233`).

When both are open the share hub's root is `z-30` and the attention panel is `z-20`, so
**the share popover paints above the attention menu — by z-index, not by DOM order, and
regardless of which was opened last.** This is the declared, accepted behavior. No
mutual-exclusion logic is added (§1.1).

(An earlier draft justified this as "the surface most recently interacted with." That
rationale was unsound — a keyboard user can open the hub, Shift+Tab to the pill, and open
the menu second — and it is withdrawn. The behavior is justified by the z-index contract
alone.)

### 3.4 Guard conditions

`hasAttentionWrapper` below means the first ternary branch at
`components/admin/showpage/PublishedReviewModal.tsx:509` is taken, i.e.
`actionable.length > 0`. Note that branch wins **whenever `actionable.length > 0`**,
irrespective of `alertsDegraded` — the degraded branch is reachable only when
`actionable.length === 0 && alertsDegraded && clearingCount === 0`.

| State | ShareHub root | Attention subtree | Result |
| --- | --- | --- | --- |
| Both closed | `z-auto` | wrapper `z-auto`, no panel | No overlap possible. |
| Attention open (`entered = true`), hub closed | `z-auto` | panel `z-20`, positioned | Menu above the hub's non-positioned triggers. **Defect A fixed.** |
| Attention open, entrance frame (`menuOpen = true`, `entered = false`, `components/admin/showpage/AttentionMenu.tsx:59-63`) | `z-auto` | panel `z-20`, `opacity-0 scale-95` | Same stacking result as above — the panel is elevated and hit-testable for that one frame even while visually transparent. Deliberate: it is the frame before the rAF flip, and the paint order is already correct there. |
| Hub open, attention closed | `z-30` | wrapper `z-auto`, no panel | Popover above the pill; the backdrop intercepts pill clicks. Unchanged. |
| Both open (keyboard only) | `z-30` | panel `z-20` | Share popover wins by z-index (§3.3). |
| **Any branch other than the first** — i.e. `actionable.length === 0`, whatever `alertsDegraded` / `clearingCount` are | per `open` | a bare `<span>` pill: **no `relative` wrapper and no menu**. The chain is four branches — `actionable.length > 0` (`components/admin/showpage/PublishedReviewModal.tsx:509`), then degraded (`components/admin/showpage/PublishedReviewModal.tsx:558`), then clearing (`components/admin/showpage/PublishedReviewModal.tsx:567`), then in-sync (`components/admin/showpage/PublishedReviewModal.tsx:578`) — and ONLY the first renders a wrapper or a menu. | No menu exists in any of the three; nothing to collide with. Stated as one row deliberately: enumerating the three separately invites a stale row the next time a branch is added, and the invariant that matters is "only branch 1 has a menu." |
| `menuOpen` still true while `actionable` falls to zero (live data refresh) | per `open` | the whole first branch unmounts, taking the wrapper, the pill, and the menu with it | The menu disappears. `menuOpen` remains `true` in `PublishedReviewModal` state, so if actionable items return the menu re-mounts already-open. Pre-existing behavior, NOT introduced or changed here, and out of scope — recorded so it is not re-derived as a finding. |


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
| `padding:8px` | `px-2 py-2` | **Both axes are explicit.** `min-h-tap-min` supplies breathing room ONLY while the content is shorter than 44px; once the description wraps, the row grows to content height and an unpadded row would let text touch the edges. `py-2` (8px) matches the mock and holds at every content height. |
| `border-radius:7px` | `rounded-sm` | Codebase token. |
| `background:transparent`, hover `#f4f3f1` | (no bg class) + `hover:bg-surface-sunken` | Matches the mailto row. |
| `text-align:left` | `text-left` | Needed because the row is a `<button>` (which centers by default). |
| icon `16px`, `color:#5a5b62` | `size={16}` + `shrink-0 text-text-subtle` | Matches the mailto row's `<Mail size={16} className="shrink-0 text-text-subtle" />`. |
| label 13px weight 500, `#0e0f12` | `text-sm font-medium text-text-strong` | 14px, the codebase row idiom (`components/admin/showpage/AttentionMenu.tsx:125`). |
| description 11px line-height 1.3, `#8b8c92` | `text-xs text-text-subtle` | Matches `components/admin/showpage/AttentionMenu.tsx:129`. |

**Focus ring — per control, NOT a shared literal.** The two controls do not ship the same
ring today and this spec does not homogenize them:

- Rotate keeps `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`
  (`app/admin/show/[slug]/RotateShareTokenButton.tsx:223`).
- Reset keeps that PLUS `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`
  (`app/admin/show/[slug]/PickerResetControl.tsx:266`).

Dropping reset's offset pair would be an unacknowledged focus-presentation change on a
destructive control. It is retained verbatim. Reset also retains
`disabled:cursor-not-allowed disabled:opacity-60`, and ADDS `disabled:hover:bg-transparent`
— a `disabled` button still matches the CSS hover pseudo-class, so without the override the disabled row
would light up on hover and imply an affordance it does not have (§4.7).

The label/description pair is wrapped in a `min-w-0` flex column so a long description
cannot force the row wider than the 308px panel.

### 4.2 Accessible name — rotate's wiring is RETAINED, reset's is ADDED

An earlier draft proposed dropping both so the accessible name would become
label + description. **That is withdrawn.** The existing pairing is deliberately correct:
`aria-label` supplies a short, stable NAME and `aria-describedby` exposes the warning as a
DESCRIPTION (`app/admin/show/[slug]/RotateShareTokenButton.tsx:219-220`). Flattening them
would destroy the name/description distinction and produce a long, state-dependent control
name. Assistive tech announces a description; it is not suppressed.

This defect is purely **visual layout** — no a11y AFFORDANCE is removed anywhere. But the
two controls are not symmetric, and the table below is the precise statement (any earlier
blanket phrasing that both controls' wiring is merely "retained" is superseded by it):

| Control | `aria-label` | `aria-describedby` | Accessible name |
| --- | --- | --- | --- |
| Rotate | **`{rowLabel}` — bound to the same prop the row renders**, never a hardcoded literal | → the description span | whatever `rowLabel` is |
| Reset | `"Reset everyone's pick"` — the component's own literal, which it also renders | → the description span | `"Reset everyone's pick"` |

**The rotate binding must be `aria-label={rowLabel}`.** Hardcoding `"Rotate share link"`
while rendering `{rowLabel}` would silently violate WCAG 2.5.3 (Label in Name) for any
caller passing a different `rowLabel` — the accessible name would not contain the visible
label. Binding them to one value makes the invariant hold by construction for every value,
including ones this spec never anticipated. Reset has no such prop; its label is a literal
in the component, so the same string is used for both.

Guard, `rowLabel` empty or whitespace-only: an empty `aria-label` is worse than none (it
strips the name entirely), so the attribute is applied only when `rowLabel.trim()` is
non-empty; otherwise it is omitted and the accessible name falls back to the button's text
content. Same rule for `aria-describedby` against `rowDescription`.

**The two controls are NOT symmetric here, and earlier wording that said the wiring is
"retained on both rows" was wrong:**

- **Rotate — RETAINED.** It already has both attributes
  (`app/admin/show/[slug]/RotateShareTokenButton.tsx:219-220`); only the `aria-label` value
  changes from a literal to `{rowLabel}` (above).
- **Reset — NEWLY ADDED.** It has NEITHER attribute today. Its `descId` is rendered on the
  description paragraph but never referenced by the button
  (`app/admin/show/[slug]/PickerResetControl.tsx:217`). So `descId` must stay alive and
  becomes the `aria-describedby` target.

Consequence for tests: rotate's existing exact-name assertions
(`tests/components/admin/showpage/shareHub.test.tsx:296`,
`tests/components/RotateShareTokenButton.test.tsx:71`) **continue to pass unchanged**.
Reset has no such assertion today, so its wiring needs a NEW test — it cannot be described
as "staying as-is." §7.2 says so explicitly.

### 4.3 Deliberate reversal: PCR-1 (b) heading

`PickerResetControl` renders `Reset everyone's pick` as an `<h4>`
(`app/admin/show/[slug]/PickerResetControl.tsx:216`), ratified as "PCR-1 (b): heading
(under the panel's `<h3>`) so the control is reachable in the screen-reader heading
outline" (`app/admin/show/[slug]/PickerResetControl.tsx:214-215`). That contract was written
when the control lived in a full-width **panel section**.

Correcting an earlier draft's description of the DOM: the mailto rows sit under the
`Crew link` `<h3>` and BEFORE the divider (`components/admin/showpage/ShareHub.tsx:315-327`,
divider at `components/admin/showpage/ShareHub.tsx:348`); only rotate and reset sit under
the `Careful` `<h3>` (`components/admin/showpage/ShareHub.tsx:349-363`). There are also
zero-to-many mailto rows, not exactly one. And a heading and a button label CAN coexist as
separate elements — the live control does exactly that today.

So the reversal does not rest on "impossible" or on sibling symmetry. It rests on this:
under `Careful` there are exactly two peer actions; rotate contributes no heading, so an
`<h4>` on reset alone makes the outline claim an asymmetry the UI does not have, and the
heading text would duplicate the button's `aria-label` verbatim, announcing the same string
twice in sequence. **Resolution: the `<h4>` becomes a plain `<span>` inside the row
button.** The `Careful` `<h3>` still names the group in the outline.

**Consumer check (a BLOCKING review finding, refuted with evidence):** the reviewer read
`PickerResetControl`'s own doc comment
(`app/admin/show/[slug]/PickerResetControl.tsx:46-47`) as naming
`components/admin/wizard/step3ReviewSections.tsx` a consumer. It is not one.
`grep -rn --include='*.tsx' '<PickerResetControl' app components` returns exactly one hit,
`components/admin/showpage/ShareHub.tsx:363`; `step3ReviewSections.tsx` only MENTIONS the
component in two comments (`components/admin/wizard/step3ReviewSections.tsx:1263`,
`components/admin/wizard/step3ReviewSections.tsx:1284`) and carries its own parallel
implementation. Every other import of the module is `import type { PickerResetCrewRow }`.
**The stale comment is corrected in the same commit** so it cannot mislead a future reader
or reviewer the same way.


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
| `compact=false` | Non-compact branch, unchanged. | n/a (component has no compact flag). |
| `compact=true` but `rowLabel` empty / whitespace-only / absent | **The MENU ROW IS NOT RENDERED AT ALL.** The outer return keys on `compact && rowLabel`, so a falsy `rowLabel` takes the pre-existing hybrid path (non-compact container + compact-styled `idleButton`, which keeps its own hardcoded `aria-label`) — `app/admin/show/[slug]/RotateShareTokenButton.tsx:222`, `app/admin/show/[slug]/RotateShareTokenButton.tsx:279`. **The `.trim()` guard in §4.2 therefore governs only the row variant**, i.e. the whitespace-only case, which reaches the row (truthy string) but must not emit an empty `aria-label`. This spec does NOT change the hybrid path: it is pre-existing, has no production caller (ShareHub always passes `rowLabel`), and altering it is out of scope. Recorded so the asymmetry is not mistaken for a regression. | n/a — reset's label is a component literal, always non-empty. |
| `rowDescription` empty or whitespace-only | Treated as fully absent: **no description span is rendered AND no `aria-describedby` is emitted.** Both the render condition and the attribute condition use `rowDescription?.trim()` — using a bare truthiness check for the render would leave an empty span with an id nothing points at. | n/a — reset's description is always one of two non-empty literals. |
| Description is one unbreakable token (a long URL-like string) | `min-w-0` lets the column shrink but cannot break an unbreakable word; the row would overflow. Rotate's description is a fixed literal, so this is unreachable in production. Recorded, not defended against. | Same; reset's descriptions are fixed literals. |
| `crew` empties WHILE reset is in `confirm` or `resolving` | n/a | `hasCrew` gates only the IDLE trigger's `disabled`, so an already-armed confirm stays actionable and the reset can still fire against an empty roster. Pre-existing (`app/admin/show/[slug]/PickerResetControl.tsx:264`), harmless (an epoch bump with no crew is a no-op), and out of scope. |
| `rowDescription` absent | Row renders label only; no empty description node. | n/a (description is always one of two literals). |
| `crew.length === 0` | n/a | Row is `disabled`, description reads `"No crew to reset yet."`, `disabled:opacity-60 disabled:cursor-not-allowed` retained. |
| `isCrewLinkActive=false` (unpublished show) | Row renders and is enabled — rotating an unpublished show is supported (`components/admin/showpage/ShareHub.tsx:343-344`). | Unaffected. |
| `ui !== "idle"` | Confirm/resolving render, unchanged. | Confirm/resolving render, unchanged. |
| Description long enough to wrap | `min-w-0` column wraps inside 308px; row grows past `min-h-tap-min`. | Same. |

### 4.6 Dimensional Invariants

This project's Tailwind v4 does NOT default `.flex` to `align-items: stretch`, so every
parent→child dimension relationship is named here with the exact class that guarantees it.

**The width chain is three links, not two.** Each row `<button>` is NOT a direct child of
the popover's flex column — it sits inside its component's own wrapper `<div>`
(`app/admin/show/[slug]/RotateShareTokenButton.tsx:280` for rotate,
`app/admin/show/[slug]/PickerResetControl.tsx:212` for reset). Those wrappers are the flex
children. Without stretch, a wrapper shrink-wraps and `w-full` on the button then resolves
against a too-narrow parent. **Both wrappers therefore take `w-full` in this change**, and
the assertion in §7.4 measures the button against the panel, not against its wrapper — so
a missing link fails the test rather than hiding inside it.

| Parent | Child | Invariant | Guaranteed by |
| --- | --- | --- | --- |
| Popover panel `w-[308px]` (`components/admin/showpage/ShareHub.tsx:289`) | each control wrapper `<div>` | wrapper width === panel content width | `w-full` added to BOTH wrappers (NOT inherited — no `items-stretch`) |
| Control wrapper `<div>` | row `<button>` | button width === wrapper width | `w-full` on the button |
| Popover panel | row `<button>` (transitively) | button width === panel content width | the two links above, asserted end-to-end in §7.4 |
| Row `<button>` | leading icon | icon stays 16px when the label wraps | `shrink-0` on the icon |
| Row `<button>` | label/description column | the column may shrink BELOW its min-content width, so long text wraps instead of widening the row (`min-w-0` overrides the flex item's `min-width: auto`; it does not set a zero flex-basis) | `min-w-0` on the column |
| Row `<button>` | label + description | stacked vertically as one block | `flex` AND `flex-col` TOGETHER on the column — `flex-col` alone only sets `flex-direction` and establishes no flex formatting context, so the column's class list is exactly `flex min-w-0 flex-col` |
| Row `<button>` | its two children (icon, then column) | both vertically centred on the row's cross axis | `items-center` on the row |
| ShareHub root bottom edge | caret untransformed top | 4px | `top-full mt-1` |
| ShareHub root bottom edge | panel top | 6px | `top-full mt-1.5` |
| Caret box | itself | 10 × 10px untransformed — the value both the 17px horizontal offset and the straddle arithmetic are derived from | `size-2.5` |
| Caret box | its rotation | rotates about its own CENTRE, which is what both the horizontal centring and the straddle bounds assume | CSS `transform-origin` defaults to `50% 50%` and nothing overrides it; Tailwind's `origin-center` is the explicit spelling. **The row asserting caret centring in §7.4 measures the RESOLVED rect, so it fails if any future `origin-*` class changes this** |
| Panel top edge | caret | the rotated diamond straddles it (≈1.93–16.07px against an edge at 6px) | ALL of: `top-full`, `mt-1` vs the panel's `mt-1.5`, `size-2.5`, and `rotate-45` about the centre — remove any one and the straddle no longer holds |
| Row `<button>` | its own content at any height | ≥8px padding on all sides even when the description wraps past 44px | `px-2 py-2` (explicit both axes — see §4.1) |
| Trigger group root (`relative`) | popover panel | panel right edge === group right edge | `right-0` on the panel |
| Trigger group root | caret | caret horizontal center === kebab horizontal center | `right-[17px]` on the caret, measured from the same right edge (§5) |

Rows are NOT fixed-height (`min-h-`), so no child must match a row's height — deliberate,
so a wrapped description can grow the row.

### 4.7 Transition inventory

Enumerated across every reachable visual state of a Careful row, not only the three
state-machine values. An earlier draft's final row contradicted itself ("Prevented" and
then "the popover DOES close"); it is corrected below.

| Pair | Treatment |
| --- | --- |
| idle rest → idle hover | `hover:bg-surface-sunken`, `transition-colors duration-fast` |
| idle rest → idle focus-visible | Instant — focus rings are never animated here |
| idle focus-visible + hover (compound) | Both apply; ring and background are independent properties, no conflict |
| idle enabled → idle disabled (reset only, `crew` empties), NOT hovered | Instant. The description text swaps in the same beat (`Make everyone pick…` ↔ `No crew to reset yet.`); no crossfade — a silently animated copy swap on a destructive control would be worse than an instant one |
| idle enabled → idle disabled WHILE HOVERED | **Not instant.** The applicable background flips from `hover:bg-surface-sunken` to `disabled:hover:bg-transparent`, and `transition-colors duration-fast` animates that change. Accepted: a `duration-fast` fade out of the hover tint as the control becomes unavailable reads as the affordance withdrawing, which is the correct signal. The override decides the TERMINAL background; it does not make the change instantaneous |
| idle disabled + hovered → idle enabled (crew repopulates under the cursor) | The reverse of the row above, and likewise animated over `duration-fast` — the hover tint fades IN as the control becomes available. Accepted for the same reason |
| idle disabled + hover | **A `disabled` button DOES still match the CSS hover pseudo-class** — `disabled` blocks activation, not matching. Unguarded, `hover:bg-surface-sunken` would light the disabled reset row and imply an affordance that does not exist. The reset row therefore carries an explicit `disabled:hover:bg-transparent` override; the rest background holds because that override says so, NOT by browser default |
| idle without banner → idle with success banner | Banner mounts instantly below the row; the `sr-only` live region announces (`app/admin/show/[slug]/PickerResetControl.tsx:178-180`) |
| idle without banner → idle with error banner | Instant; `role="alert"` |
| idle success banner → dismissed (5s `SUCCESS_DISMISS_MS`) | Instant unmount. Errors are NEVER auto-dismissed |
| idle-with-banner → confirm | Instant; entering confirm CLEARS the outcome first (`app/admin/show/[slug]/PickerResetControl.tsx:134`, `app/admin/show/[slug]/RotateShareTokenButton.tsx:137`) |
| idle → confirm | Instant swap; no `AnimatePresence`, no exit |
| confirm → resolving | Instant; same node, label text swaps |
| resolving → idle | Instant remount of the row + banner |
| confirm → idle (cancel / 4s auto-revert) | Instant; focus restores to the row button (C5) |
| `rowDescription` present ↔ absent (rotate) | Instant; the description span is conditionally rendered, so the row height changes in one frame |
| ShareHub closed ↔ open (root elevation) | Instant — `z-30` toggles with `open`; z-index is not a transitionable property here and no fade is added |
| AttentionMenu closed → entering → entered | Existing `transition-[opacity,transform] duration-fast` fade+scale, `motion-reduce` instant (`components/admin/showpage/AttentionMenu.tsx:99-101`). Untouched by this spec |
| AttentionMenu entered → closed | Instant unmount — the component returns `null` when `open` is false (`components/admin/showpage/AttentionMenu.tsx:43`); no exit animation. Untouched |
| AttentionMenu entering → closed (before the rAF flip) | Instant unmount; the `cancelAnimationFrame` cleanup (`components/admin/showpage/AttentionMenu.tsx:84`) drops the pending flip so nothing is written after unmount. Untouched |
| Popover + caret unmounted → mounted (hub opens) | Both mount in the same commit under the same `open` guard. No entrance animation, so no frame exists in which one is present without the other |
| Popover + caret mounted → unmounted (hub closes) | Both unmount together, instantly |
| idle focus-visible → confirm (keyboard) | Instant, and focus moves to the confirm row's Cancel button (C3, `app/admin/show/[slug]/PickerResetControl.tsx:84-86`) — the keyboard parallel of the hover-held row below |
| Compound: hover held while idle → confirm | Idle row unmounts mid-hover; the hover style is a CSS pseudo-class, so nothing is stranded |
| Compound: popover close attempted while row is in `confirm` (pre-submit) | The popover **DOES close** — `confirm` is not `busy`, and only `busy` makes dismissal inert. Unchanged from today and out of scope |
| Compound: popover close attempted while `resolving` | Inert — all four dismissal paths are gated on `busy` |
| Compound: `resolving` still in flight when the 15s `BUSY_GATE_MAX_MS` expires | `busyStuck` flips, `busy` goes false, dismissal becomes possible again while the action is still notionally in flight. Existing, deliberate (`components/admin/showpage/ShareHub.tsx:86-93`); unchanged |

The caret (§5) is static and has no transitions.

## 5. Design — Defect C (caret notch)

A 10px square rotated 45°, rendered as a **sibling of the popover inside the ShareHub
root**, NOT as a child of the popover.

An earlier draft placed it inside the panel and split the panel into an un-clipped outer
plus a scrolling inner. **That is withdrawn** — the split moved `overflow-y-auto` off the
focused `role="dialog"` (regressing keyboard PageDown/Arrow scrolling, which belongs to the
focused element), left the padding's participation in the height cap ambiguous, stopped
clipping child hover backgrounds to the rounded corners, and left caret-vs-content stacking
unspecified. Rendering the caret as a sibling avoids all four: **the popover keeps its
current classes byte-for-byte**, including `max-h-[min(70vh,32rem)] overflow-y-auto p-2.5`.

- Element: `<span aria-hidden="true" data-testid="share-hub-caret">`, purely decorative.
- Placement: inside the ShareHub root (`components/admin/showpage/ShareHub.tsx:221`, the
  same `relative` ancestor the popover is positioned against), rendered under the same
  `open` guard as the popover.
- Classes: `pointer-events-none absolute top-full right-[17px] z-40 mt-1 size-2.5 rotate-45 border-l border-t border-border bg-surface`.
- **DOM order is load-bearing: the caret is rendered AFTER the popover.** The two are
  sibling positioned elements at the SAME `z-40`; equal z-index does not decide paint
  order — tree order does. Rendering the caret last is what puts it above the panel so the
  notch is not cut by the panel's top border. A future edit that reorders them is a visual
  regression; §7.1 pins the order.
- **`pointer-events-none` is load-bearing too.** `aria-hidden` hides the caret from
  assistive tech but does NOT disable hit-testing. Painted above the panel and overlapping
  it, the caret would otherwise intercept clicks in that overlap, and any logic keyed on
  `panelRef.current.contains(target)` would classify such a click as OUTSIDE the dialog.
  With `pointer-events-none` the caret is never an event target and the overlap is inert.
- Geometry: the kebab is `size-tap-min` (44px) and is the rightmost element of the trigger
  group; the panel is `right-0` against that group, so the kebab's horizontal center sits
  22px from the group's right edge. A 10px square centered there needs
  `right: 22 − 5 = 17px`.
- Vertical: the popover is `mt-1.5` (6px) below the group; `mt-1` (4px) puts the caret's
  UNTRANSFORMED 10px box spanning 4px–14px below the group. The panel's top edge is at 6px,
  so the box straddles it. After `rotate-45` about the box centre (9px) the diamond's visual
  bounds are ≈1.93px–16.07px: its upper tip sits ABOVE the panel edge and its two drawn
  sides cross that edge, which is what produces the notch. Precisely: the tip protrudes and
  the body overlaps — not "the tip overlaps".
- Only `border-l` + `border-t` are drawn: after the 45° rotation those two form the
  outward-facing V; the other two edges sit under the panel body.
- `bg-surface` matches the panel fill; `z-40` matches the panel, and tree order (above) is
  what actually resolves the tie between them.

**Guard:** at `max-w-[calc(100vw-2rem)]` on a 390px viewport the panel is still `right-0`
against the same group, and the caret's offset is measured from that same right edge, so
the alignment holds at every width.


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

### 7.0 Assertion mechanics — a SHARED HELPER, not per-test discipline

Three consecutive review rounds found the same class of defect: an assertion form that a
wrong implementation could still satisfy. Each round patched the instances it found, and
the next round found more. Per the structural-defense rule, the fix is not another pass of
instance patches — it is **one shared helper used by every row assertion**, so the rigor is
structural instead of remembered.

A NEW module at tests/components/admin/showpage/_rowAssertions.ts (created by Task 2;
not yet tracked, hence written here as plain prose rather than a citation):

```ts
import { within } from "@testing-library/react";
import { expect } from "vitest";

/** Class tokens as a Set. NEVER assert against `className` directly:
 *  `.toContain("w-full")` also passes for `sm:w-full` / `max-w-full`. */
/** Class-based hiding mechanisms, matched AFTER any variant prefix. `sm:hidden`
 *  and `md:invisible` hide the row just as thoroughly as the bare tokens do at
 *  their breakpoint, and a bare-token check misses every one of them. */
const HIDING_TOKENS = ["sr-only", "hidden", "invisible", "collapse"] as const;
const HIDING_RE = new RegExp(`(?:^|:)(?:${HIDING_TOKENS.join("|")})$`);
const hidingTokensOf = (el: Element): string[] =>
  [...tokensOf(el)].filter((t) => HIDING_RE.test(t));

export const tokensOf = (el: Element): Set<string> =>
  new Set(el.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? []);

/** Anchored to the token start OR just past a variant prefix, so `sm:border`
 *  and `hover:border-accent` are caught alongside a bare `border`. An unanchored
 *  /^border/ misses every variant-prefixed form. The negative lookahead excludes
 *  the table utilities that merely SHARE the prefix (`border-spacing-*`,
 *  `border-collapse`, `border-separate`) that declare no border of their own.
 *  A probe caught this helper flagging `border-spacing-0`. */
export const NO_BORDER = /(?:^|:)border(?!-(?:spacing|collapse|separate))(?:-|$)/;
/** No `bg-*` at REST. A variant-prefixed `hover:bg-*` is allowed by design; a
 *  regex over the whole class string cannot tell the two apart. */
export const NO_REST_BACKGROUND = /^bg-/;

export function expectClasses(
  el: Element,
  spec: { has?: readonly string[]; forbids?: readonly RegExp[]; exactly?: readonly string[] },
): void {
  const t = tokensOf(el);
  for (const c of spec.has ?? []) expect([...t], `missing token ${c}`).toContain(c);
  for (const re of spec.forbids ?? []) {
    expect(
      [...t].filter((x) => re.test(x)),
      `forbidden token matching ${re}`,
    ).toEqual([]);
  }
  // `exactly` is what stops a conflicting extra (sm:w-auto, items-start, px-0)
  // from overriding a token that `has` already matched.
  if (spec.exactly) expect([...t].sort()).toEqual([...spec.exactly].sort());
}

/** Whitespace-normalized text of an element and all its descendants, with a
 *  SEPARATOR inserted at every element boundary. Plain `textContent` concatenates
 *  with no gap, so `<span>Old link</span><span>stops working</span>` yields
 *  "Old linkstops working": a duplicate that reads identically on screen, with
 *  the gap supplied by `gap-1` rather than a text node, would go uncounted. */
const composedText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  return [...node.childNodes].map(composedText).join(" ");
};
const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

/** jsdom loads no CSS, so real visibility belongs to the Playwright specs. What
 *  IS provable here: the carrier is not deliberately hidden from sight or from
 *  the a11y tree. Without this, `sr-only` / `hidden` text satisfies every
 *  containment assertion while rendering nothing a sighted user sees. */
function expectNotHidden(el: Element, root: Element, what: string): void {
  // Walk from the carrier UP THROUGH the root INCLUSIVE. Two escapes this
  // closes, both found by review: checking the carrier alone lets a `hidden`
  // row BUTTON hide everything, and stopping AT the button lets a hidden
  // wrapper ABOVE it do the same while every token, containment, and composed
  // -text assertion still passes. `root` is therefore the popover scope, not
  // the button.
  let cur: Element | null = el;
  while (cur) {
    const where = cur === el ? what : `${what} ancestor <${cur.tagName.toLowerCase()}>`;
    // Class-based hiding, variant-prefixed forms included.
    expect(hidingTokensOf(cur), `${where} must not carry a hiding class`).toEqual([]);
    expect(cur.hasAttribute("hidden"), `${where} must not carry the hidden attribute`).toBe(false);
    expect(cur.getAttribute("aria-hidden"), `${where} must not be aria-hidden`).not.toBe("true");
    // INLINE style hiding. jsdom cannot resolve stylesheets, but it parses the
    // style attribute perfectly well, so `style={{ display: "none" }}` is
    // decidable here and must not be waved off as "a rendering property".
    const style = (cur as HTMLElement).style;
    expect(style?.display, `${where} must not be display:none`).not.toBe("none");
    expect(style?.visibility, `${where} must not be visibility:hidden`).not.toBe("hidden");
    expect(style?.visibility, `${where} must not be visibility:collapse`).not.toBe("collapse");
    if (cur === root) break;
    cur = cur.parentElement;
  }
}

/** Counts occurrences of `needle` in the scope's COMPOSED text. Testing
 *  Library's exact getAllByText only matches text held by a single element, so
 *  a duplicate split across siblings (<p><span>Old link</span><span> stops…</span></p>)
 *  slips past it. Composed counting catches that. */
function countComposed(scope: HTMLElement, needle: string): number {
  return normalize(composedText(scope)).split(normalize(needle)).length - 1;
}

/**
 * The label/description contract, in ONE place. Proves, for a row button:
 * the text is rendered INSIDE the button (not left outside in a surviving old
 * block), is not hidden, the `aria-describedby` target is a DESCENDANT of the
 * button, its text matches EXACTLY, and each string appears exactly once in the
 * scope, counted over composed text.
 */
/** The row's prescribed typography (spec §4.1). Asserted with `exactly` so a
 *  row that renders the right STRINGS at the wrong size/weight/colour fails. */
export const LABEL_CLASSES = ["text-sm", "font-medium", "text-text-strong"] as const;
export const DESCRIPTION_CLASSES = ["text-xs", "text-text-subtle"] as const;
/** The stacked label/description column (spec §4.6). `flex` AND `flex-col`:
 *  `flex-col` alone sets flex-direction but establishes no flex context. */
export const COLUMN_CLASSES = ["flex", "min-w-0", "flex-col"] as const;

/** The prescribed row topology: an icon, then the column, and nothing else.
 *  Asserting the pieces individually is not enough: label and description can
 *  each be correct while sitting as DIRECT children of the button, an unstacked
 *  flex row that satisfies every per-element check. */
function expectRowTopology(button: HTMLElement, column: Element): void {
  expect(
    [...button.children].map((c) => c.tagName.toLowerCase()),
    "row children must be exactly [icon, column]",
  ).toEqual(["svg", "span"]);
  expect(button.children[1], "the column must be the row's second child").toBe(column);
  expectClasses(column, { exactly: COLUMN_CLASSES });
}

export function expectRowText(
  button: HTMLElement,
  scope: HTMLElement,
  { label, description }: { label: string; description: string },
): void {
  // The button must itself be inside the scope, or the visibility walk below
  // would terminate without ever reaching the scope boundary.
  expect(scope.contains(button), "row button must be inside the asserted scope").toBe(true);
  const labelEl = within(button).getByText(label);
  expect(button.contains(labelEl)).toBe(true);
  expectNotHidden(labelEl, scope, "row label");
  expect(button.getAttribute("aria-label")).toBe(label);
  expect(countComposed(scope, label), `label "${label}" must appear exactly once`).toBe(1);
  expectClasses(labelEl, { exactly: LABEL_CLASSES });

  const descEl = document.getElementById(button.getAttribute("aria-describedby") ?? "");
  expect(descEl, "aria-describedby must resolve").not.toBeNull();
  expect(button.contains(descEl)).toBe(true);
  expectNotHidden(descEl!, scope, "row description");
  expect(normalize(composedText(descEl!))).toBe(description);
  expect(
    countComposed(scope, description),
    `description "${description}" must appear exactly once`,
  ).toBe(1);
  expectClasses(descEl!, { exactly: DESCRIPTION_CLASSES });

  // Both strings must be STACKED IN THE COLUMN, not merely present. As direct
  // children of the button they would be flex ROW siblings of the icon and read
  // as one line, while satisfying every assertion above.
  expect(labelEl.parentElement, "label and description must share one parent").toBe(
    descEl!.parentElement,
  );
  expect(labelEl.parentElement, "label must not be a direct child of the row").not.toBe(button);
  expectRowTopology(button, labelEl.parentElement!);
}

/**
 * Asserts a row renders NO description carrier at all: the §4.5 contract for an
 * absent or whitespace-only `rowDescription`.
 *
 * Structural and TAG-AGNOSTIC by design. A span count is neither: an empty
 * `<p id={descId} class="text-xs text-text-subtle">` survives a
 * `querySelectorAll("span")` check while still leaving the forbidden empty
 * described node in the tree. The column holds the label and nothing else, so
 * `childElementCount === 1` is the contract regardless of what tag the escape
 * reaches for.
 */
export function expectNoDescriptionNode(
  button: HTMLElement,
  scope: HTMLElement,
  label: string,
): void {
  expect(button.getAttribute("aria-describedby"), "no described node when absent").toBeNull();

  const labelEl = within(button).getByText(label);

  // The LABEL's own contract must survive the description being absent. Without
  // this, `aria-label={rowDescription?.trim() ? rowLabel : undefined}` passes:
  // the normal-description tests still see the right name, while a row with no
  // description silently loses its accessible name entirely.
  expect(button.getAttribute("aria-label"), "label survives an absent description").toBe(label);
  expectNotHidden(labelEl, scope, "row label");
  expectClasses(labelEl, { exactly: LABEL_CLASSES });

  // The label must still be unique in the scope: a conditional
  // absent-description branch could leave a duplicate label outside the button.
  expect(countComposed(scope, label), `label "${label}" must appear exactly once`).toBe(1);

  const column = labelEl.parentElement;
  expect(column, "label must sit in the row column").not.toBeNull();
  expect(
    column!.childElementCount,
    "the column must hold the label and NOTHING else - any tag, not just a span",
  ).toBe(1);

  // Same topology as the with-description case, including the column's own
  // prescribed classes: an absent-description branch must not quietly drop
  // `flex min-w-0 flex-col` just because there is nothing left to stack.
  expectRowTopology(button, column!);

  // Belt and braces: nothing anywhere in the row carries the description
  // styling, in whole or in part.
  expect(
    [...button.querySelectorAll("*")].filter((el) =>
      DESCRIPTION_CLASSES.some((c) => tokensOf(el).has(c)),
    ),
    "no element may carry any description class",
  ).toEqual([]);
}
```

**Binding rules, enforced by using the helper rather than by remembering them:**

1. No test may assert a class via `className.toContain(...)`. Token-exact only.
2. "No rest background" and "borderless" are `forbids` patterns, never bare regexes over
   the class string. The border pattern is anchored to allow a variant prefix, so
   `sm:border` and `hover:border-accent` are caught too, while the table utilities that
   merely share the prefix (`border-spacing-*`, `border-collapse`, `border-separate`) are
   not — a probe caught the helper flagging `border-spacing-0`.
3. Every label/description assertion goes through `expectRowText`, which is the only place
   the containment + not-hidden-ANYWHERE-UP-TO-THE-SCOPE + exact-text +
   composed-uniqueness + prescribed-typography quintuple is written. Two subtleties, each
   found by review and each closed by a probe: the not-hidden walk must cover ANCESTORS ALL
   THE WAY TO THE SCOPE (a `hidden` on the row button hides everything, and so does a
   `hidden` wrapper ABOVE the button — stopping at the button leaves that second escape
   open), and composed text must insert a SEPARATOR at element
   boundaries (`textContent` concatenates, so a duplicate whose gap is supplied by
   `gap-1` rather than a text node reads identically on screen yet goes uncounted).
4. Absence is proved by `expectNoDescriptionNode`, which is TAG-AGNOSTIC and ALSO re-asserts
   the LABEL's full contract (name, not-hidden, typography) — otherwise
   `aria-label={rowDescription?.trim() ? rowLabel : undefined}` passes, and a row with no
   description silently loses its accessible name while the normal-description tests stay
   green. It also pins the row's exact child topology (`[svg, span]`), because an empty
   `<p id={descId} class="text-xs">` placed OUTSIDE the column carries only part of the
   description class set and otherwise survives every other check. A count of
   `<span>` elements is not: an empty `<p id={descId} class="text-xs text-text-subtle">`
   passes a span count while leaving the forbidden empty described node in the tree.
5. **`exactly` is the default posture for every class list this spec fully prescribes** —
   both row buttons AND the label/description column. `has` alone lets a conflicting extra
   ride along and OVERRIDE a token that was just asserted (`sm:w-auto` beside `w-full`,
   `items-start` beside `items-center`, `px-0` beside `px-2`), which is exactly the
   wrong-implementation class this helper exists to close. `has` is reserved for lists the
   spec does not claim to enumerate completely (e.g. the icon's classes).


### 7.1 jsdom (unit) — `tests/components/admin/showpage/shareHub.test.tsx`

jsdom loads no CSS, so these are structure and class-token assertions; every geometric
claim is proved in §7.4 instead.

1. **Z-order class contract.** Closed hub: tokens include `relative`, exclude `z-30`. Open:
   include both. Catches the shipped unconditional `z-30`.
2. **Triggers stay non-positioned.** Neither trigger's tokens include `relative`,
   `absolute`, `fixed`, or `sticky` — a positioned trigger at `z-auto` would beat the
   menu's `z-20` by tree order and reintroduce the defect in a subtler form.
3. **Attention wrapper is NOT touched.** It still carries no `z-` token — §3.2 says it must
   not need one, so an elevation appearing there is a regression against the analysis.
4. **Both-open ordering.** Open the menu AND the hub; assert the hub root has `z-30` while
   the menu panel has `z-20` (the §3.3 contract; no other test covers it).
All row assertions below use the §7.0 helper. Where an item says "token set", it means
`expectClasses`; where it says "label/description contract", it means `expectRowText`.

5. **Rotate row shape.** ONE `<button>` whose token set is asserted with `exactly` (the
   spec prescribes this list completely, so an overriding extra must fail) — `flex`, `w-full`,
   `items-center`, `gap-2`, `rounded-sm`, `min-h-tap-min`, `px-2`, `py-2`, `text-left`,
   `hover:bg-surface-sunken`, `transition-colors`, `duration-fast`, and all three ring
   tokens (`focus-visible:outline-none`, `focus-visible:ring-2`,
   `focus-visible:ring-focus-ring`); and includes NO token matching `/^border/` and none
   matching `/^bg-/` (rule 7.0.2).
6. **Rotate row internals.** The column, its exact class set, and the `[icon, column]` row
   topology are all asserted INSIDE `expectRowText` — including that the label and
   description are STACKED IN the column rather than being direct children of the button,
   which would make them flex-ROW siblings of the icon reading as one line while satisfying
   every per-element check. The `<svg>` has `width` AND `height` `"16"` and tokens
   `shrink-0`, `text-text-subtle`.
7. **Rotate label/description contract.** `expectRowText(rotate, popover(), {...})` — one
   call covering: the label is rendered INSIDE the button, `aria-label` equals it, the
   `aria-describedby` target is a DESCENDANT of the button, its text matches the
   description EXACTLY, and both strings appear exactly once in the popover. Uniqueness
   alone would not catch an implementation that left the label outside and omitted the
   internal one; containment alone would not catch a surviving duplicate. The helper
   asserts both, for both strings.
8. **Old shape is GONE.** No button named exactly `Rotate` in the popover.
9. **Reset row shape and internals.** Same `exactly` posture as 5 + 6, over the same list PLUS
   `focus-visible:ring-offset-2`, `focus-visible:ring-offset-surface`,
   `disabled:cursor-not-allowed`, `disabled:opacity-60`, and
   `disabled:hover:bg-transparent` (§4.7). The icon gets the SAME full assertion set as
   rotate's — `width` and `height` `"16"`, tokens `shrink-0` and `text-text-subtle` — plus
   an identity check that it is `RefreshCw` and not another glyph (assert the rendered
   `<svg>`'s `class` carries `lucide-refresh-cw`, the identity Lucide stamps on each icon).
   Dimension-only assertions would let all three of those regress silently.
10. **Reset label/description contract.** The same `expectRowText` call, against
    `"Reset everyone's pick"` and its exact description. This is a NEW assertion — reset
    has NEITHER attribute today (§4.2), so unlike rotate this one starts red.
11. **Reset heading removed.** Popover has no `<h4>`; the `Careful` `<h3>` is still there.
12. **Reset empty-crew guard.** `disabled` is true, and `expectRowText` passes against
    the description `"No crew to reset yet."` — the same containment + exactness +
    uniqueness triple, so the empty-roster copy cannot be duplicated or left outside
    either.
13. **Width chain.** Both control wrapper `<div>`s have the `w-full` token (§4.6) — the
    link a button-only assertion misses.
14. **Row family.** Scope to the popover; for the mailto assertion, first exclude the two
    Careful rows by testid so it cannot pass on the wrong node, and derive the expected
    mailto row count from the fixture (zero-to-many is the live reality — never assume one).
15. **Caret.** Present when open, `aria-hidden="true"`, tokens include
    `pointer-events-none`; `popover().contains(caret) === false` (the §5 sibling contract);
    and **the caret follows the popover in DOM order** — assert
    `popover().compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING`, which is
    what actually decides paint order between two `z-40` siblings (§5) — AND that they are
    genuinely siblings under the same positioned parent
    (`caret.parentElement === popover().parentElement`, that parent carrying `relative`).
    Order and classes alone do not prove it: a caret rendered outside the ShareHub root,
    as a sibling of the ROOT rather than of the popover, satisfies every other assertion
    while being positioned against the wrong ancestor. The popover's own
    tokens still include `overflow-y-auto` and `max-h-[min(70vh,32rem)]` — asserted through
    `expectClasses`, NOT `className.toContain`, per rule 7.0.1 (proving the withdrawn
    outer/inner split did not sneak back). Unmounts with the popover.

### 7.2 jsdom — the two control test files

`tests/components/RotateShareTokenButton.test.tsx` — its existing accessible-name and
`aria-describedby` assertions must keep passing unchanged, because rotate's wiring is
RETAINED (§4.2). The one addition: with `rowLabel` set to a non-default string, assert
`aria-label` equals THAT string, pinning the `aria-label={rowLabel}` binding rather than a
re-hardcoded literal.

`tests/admin/pickerResetControl.test.tsx` — the `getByRole("heading", …)` assertion at
`tests/admin/pickerResetControl.test.tsx:38` is replaced
by the row-button assertions (label as visible descendant text, `aria-label` equal to it).
Reset's `aria-describedby` wiring is NEW, so it gets a NEW assertion here; §4.2 corrects
the earlier claim that this file's a11y assertions "stay as-is." Every state-machine,
focus, busy-contract, and banner assertion IS untouched — if any of those needs changing,
the change is wrong.


### 7.3 Real browser — z-order, `tests/e2e/published-review-modal.interactions.spec.ts`

**T-HUB-ZORDER.** The hydrated app (this spec's harness clicks; the layout spec is static
and cannot open a menu).

1. Seed a show whose derived attention list has ≥1 actionable item; open the modal.
2. Open the attention menu via the pill.
3. Read `getBoundingClientRect()` for the menu panel and for
   `[data-testid="share-hub-primary"]`.
4. **Precondition (fails loud, never skips):** the rects intersect. If they stop
   intersecting the test no longer exercises the defect and must say so.
5. At the intersection's center, `document.elementFromPoint(x, y)` returns a node contained
   by the menu panel and NOT by the share hub.

A computed-style or class assertion would pass against a wrapper that is elevated but still
loses in paint order, which is why this is `elementFromPoint`.

Detach-safety: every rect is resolved in the step that uses it; no sampler outlives its
element and the `evaluate` receives plain numbers, not element handles.

### 7.4 Real browser — dimensional invariants and caret

§4.6 claims real-browser verification; this section delivers it. With the popover open:

1. **Row width chain (end-to-end).** For BOTH rows: `row.width === panel.clientWidth − 2 × panel padding`
   within 0.5px, measured against the PANEL — not the wrapper — so a missing `w-full` on
   either link fails here.
2. **Row height floor.** Both rows `height >= 44` (the tap invariant, in resolved pixels).
3. **Padding under wrap.** Force a long description (narrow viewport / long fixture); assert
   the row's height exceeds 44px AND the label's top is ≥8px below the row's top — the §4.5
   wrap guard and the §4.1 `py-2` decision.
4. **Icon dimensions.** Both leading icons resolve 16×16 and do not shrink when the label
   wraps.
5. **Column shrink.** The label/description column's width is ≤ the row's content width
   (no horizontal overflow of the 308px panel; assert `panel.scrollWidth <= panel.clientWidth`).
6. **Scroll ownership.** The `role="dialog"` element itself is the scroller: assert its
   `scrollHeight`/`clientHeight` relationship with a tall fixture and that it is the focused
   element on open — the regression the withdrawn outer/inner split would have caused.
7. **Panel right edge === trigger-group right edge** within 0.5px.
8. **Caret**, all derived from measured rects, never hardcoded:
   - horizontal center within 0.5px of the kebab's horizontal center;
   - `width === height === 10` (±0.5px) — catches a wrong size;
   - it is **visible and not clipped**: its rect is fully inside the viewport and
     `elementFromPoint` at its outer tip returns the caret (or the panel), not a node behind
     it — catches the clipped-invisible failure the sibling placement exists to prevent;
   - its vertical box overlaps the panel's top edge — catches a detached or misplaced caret;
   - resolved `background-color` equals the panel's, and the two drawn borders are non-zero
     — catches a borderless or wrong-colored caret.
   Stable locator: `[data-testid="share-hub-caret"]`.

### 7.5 Existing gates that must stay green

`T-NO-ORANGE` (the caret is `bg-surface`; the rows carry no accent), `T-HUB-FLUSH`,
`tests/styles` (canonical Tailwind + the destructive-confirm registry — the confirm-button
class literals are NOT edited, so no registry row or occurrence index may shift),
`tests/help` (UI-label crosswalk, em-dash ban — row copy is unchanged, so no new label
enters the crosswalk).

---

## 8. Numeric sweep

Every literal in this document, cross-checked against the body it describes.

| Value | Where | Cross-check |
| --- | --- | --- |
| 44px tap floor | §4.1 `min-h-tap-min`, §7.4.2 | `app/globals.css:162` `--spacing-tap-min: 44px` |
| 40px | §4.1 | the mock's row height, explicitly OVERRIDDEN by the 44px floor |
| 8px | §4.1 `px-2 py-2`, §4.1 `gap-2`, §7.4.3 | mock `padding:8px`; `gap-2` is 8px |
| 11px | §4.1 | mock `gap:11px`, mapped DOWN to `gap-2` (8px) to match the mailto row |
| 7px | §4.1 | mock `border-radius:7px`, mapped to `rounded-sm` |
| 16px | §4.1, §7.4.4 | icon size, matching the mailto row's `<Mail size={16} />` |
| 13px / 500 | §4.1 | mock label, mapped UP to `text-sm` (14px) `font-medium` |
| 14px | §4.1 | resolved `text-sm` |
| 11px / 1.3 | §4.1 | mock description, mapped to `text-xs text-text-subtle` |
| `ring-2` | §4.1 | existing focus ring on both controls; unchanged |
| `ring-offset-2` | §4.1 | reset ONLY (`app/admin/show/[slug]/PickerResetControl.tsx:266`); retained |
| 308px | §4.6, §5 guard, §7.4.5 | `components/admin/showpage/ShareHub.tsx:289` `w-[308px]` — unchanged |
| `max-h-[min(70vh,32rem)]` | §5, §7.1.9 | `components/admin/showpage/ShareHub.tsx:289` — unchanged; the withdrawn split would have moved it |
| `max-w-[calc(100vw-2rem)]` | §5 guard | `components/admin/showpage/ShareHub.tsx:289` — unchanged |
| 10px caret (`size-2.5`) | §5, §7.4.8 | drives the 17px and 5px values below |
| 45° | §5 | `rotate-45` |
| 44px kebab | §5 | `components/admin/showpage/ShareHub.tsx:270` `size-tap-min` |
| 22px | §5 | 44 ÷ 2 — kebab center from the group's right edge |
| 17px | §5 | 22 − (10 ÷ 2) |
| 5px | §5 | 10 ÷ 2 — half the caret box |
| 6px (`mt-1.5`) | §5 | the popover's existing top margin |
| 4px (`mt-1`) | §5 | the caret's top margin, chosen so its box spans the panel's top edge at 6px |
| `z-30` | §3.2, §3.4 | the ONLY elevation value this spec changes |
| `z-20` | §3.1, §3.4 | AttentionMenu panel + ShareHub backdrop — both unchanged |
| `z-40` | §5 | popover and caret — the caret matches the popover so it is never painted under it |
| 390px | §5 guard | narrow-viewport clamp check |
| 0.5px | §7.4 | project standard for real-browser geometry |
| ≥1 actionable item | §7.3.1 | the T-HUB-ZORDER fixture requirement |
| 1900 chars | §1.1 (by reference) | the existing mailto batching cap; NOT changed here |
| 4s / 15s / 5s | §1.1, §4.7 | `ARM_REVERT_MS` / `BUSY_GATE_MAX_MS` / `SUCCESS_DISMISS_MS`, all referenced as unchanged |
| 3 links | §4.6 | the width chain: panel → wrapper → button |

---

## 9. Files touched

| File | Change |
| --- | --- |
| `components/admin/showpage/ShareHub.tsx` | conditional `z-30` on the root; caret span as a sibling of the popover. **Popover classes unchanged.** |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx` | compact idle render → menu row; wrapper gains `w-full`; `aria-label` + `aria-describedby` retained |
| `app/admin/show/[slug]/PickerResetControl.tsx` | idle render → menu row; `<h4>` → `<span>` in the row; wrapper gains `w-full`; gains the `aria-label` + `aria-describedby` pair; stale `step3ReviewSections` doc comment corrected |
| `tests/components/admin/showpage/shareHub.test.tsx` | §7.1 |
| `tests/admin/pickerResetControl.test.tsx` | §7.2 (heading assertion only) |
| `tests/e2e/published-review-modal.interactions.spec.ts` | §7.3 + §7.4 |

**`components/admin/showpage/PublishedReviewModal.tsx` is NOT modified** (§3.2), and
`tests/components/RotateShareTokenButton.test.tsx` needs no edit (§7.2).

UI surface throughout ⇒ invariant 8 applies: `/impeccable critique` + `/impeccable audit`
before cross-model review.
