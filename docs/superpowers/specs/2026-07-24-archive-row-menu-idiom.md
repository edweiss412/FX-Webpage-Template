# Archive row adopts the §4.1 menu-row idiom

**Date:** 2026-07-24
**Status:** Draft (autonomous /ship-feature run)
**Surface:** `components/admin/ArchiveShowButton.tsx` (row variant, idle branch only) + its tests
**Parent contracts:** `2026-07-20-share-hub-fidelity-fixes.md` §4.1/§4.6/§7.0 (row idiom + shared assertions), `2026-07-16-destructive-confirm-pass` §R7 as amended 2026-07-20 (row-variant Confirm/Cancel, no timer — `components/admin/ArchiveShowButton.tsx:72-85`).

## 1. Problem

The ShareHub popover renders four action rows. Three — Rotate share link (`app/admin/show/[slug]/RotateShareTokenButton.tsx:247-266`), Reset everyone's pick (`app/admin/show/[slug]/PickerResetControl.tsx:271-293`), Capture debug bundle (`components/admin/showpage/ShareHub.tsx:638-647`) — are borderless full-width menu rows: the whole row is the button, icon left, stacked label/description column. The Archive row is the odd one out: a non-interactive label/description block on the left and a separate small outlined "Archive" button on the right (`components/admin/ArchiveShowButton.tsx:241-259`).

This is drift, not design. Timeline (both commits 2026-07-20):

- **11:34** `23e5106ff` moved Archive into the hub, mirroring the rotate row *as it then existed* (titled row + short outlined trigger).
- **14:40** `9b00e728b` (fidelity-fixes §4.1) restyled Rotate — and Reset with it — into borderless full-width menu rows. Archive was never swept.
- The idle-branch comment at `ArchiveShowButton.tsx:251-253` still claims the outlined trigger is "Sized and weighted to match the rotate row directly above it … one idiom, not two" — it describes a rotate style that stopped existing three hours after it was written.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The row variant's ARMED state (label header + consequence prose + Confirm/Cancel, **no 4s timer**) is owner-ratified and out of scope. Only the IDLE render changes. | `components/admin/ArchiveShowButton.tsx:72-85` (owner-ratified 2026-07-20 amendment to destructive-confirm-pass §R7 / m12.2-phase-b2 §2.2) |
| The armed confirm keeps the destructive recipe (inverted amber, tier-2 focus ring) and its registry row. | `tests/styles/_metaDestructiveConfirm.test.ts:39-45` (row 2); `tests/components/admin/showpage/shareHub.test.tsx:1030-1038` (tier-2 archive confirm) |
| Legacy non-row variants (Overview zero-shift box, footer compact) are unchanged, including their 4s auto-revert. | `ArchiveShowButton.tsx:312-346`; `ARM_REVERT_MS` at `ArchiveShowButton.tsx:45` |
| `UnarchiveShowButton` stays a plain single-tap button — it is non-destructive (`components/admin/UnarchiveShowButton.tsx:69`) and is not a "Careful"-idiom row. Out of scope. | Feature request; per-show-lifecycle contract `tests/components/admin/per-show-lifecycle.test.tsx:185-231` |
| A whole-row destructive trigger is acceptable: arming is reversible (explicit Cancel), and Rotate/Reset — equally destructive — already use whole-row triggers under the same §4.1 idiom. | fidelity-fixes §4.1 precedent; the two-tap contract itself (`ArchiveShowButton.test.tsx:99-120`) |
| The hub's Show-section auto-scroll handler and `share-hub-show-section` testid stay. | `components/admin/showpage/ShareHub.tsx:590-610`; `tests/components/admin/per-show-lifecycle.test.tsx:214` |

## 2. Change

### 2.1 Idle render (the only visual change)

`ArchiveShowButton` row variant: the idle branch becomes one full-width borderless menu row, byte-for-byte the rotate recipe (`RotateShareTokenButton.tsx:246-266`). The `asRow` gate (`ArchiveShowButton.tsx:102`) TIGHTENS from `compact && rowLabel != null` to `compact && rowLabel != null && rowLabel.trim() !== ""` — a blank/whitespace `rowLabel` must not select a row whose only text carrier would be empty while the icon is `aria-hidden` (an unnamed destructive button). Blank falls back to the legacy compact render, whose visible text content "Archive show" (`ArchiveShowButton.tsx:325`) names it. (R1 adversarial finding 2.)

- **Button** (`data-testid="archive-show-button"` unchanged, `type="button"`, `ref={triggerRef}`, `onClick={onArmClick}` unchanged): literal class string
  `flex min-h-tap-min w-full items-center gap-2 rounded-sm p-2 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`
  — the exact token set pinned as `ROW_TOKENS` (`tests/components/admin/showpage/shareHub.test.tsx:421-436`). Tier-1 focus ring (no offset pair), per sharehub-focus-pass §2 — already asserted for this testid at `shareHub.test.tsx:1030-1035`.
- **Children exactly `[svg, span]`** (§7.0 topology, `_rowAssertions.ts` `expectRowTopology`):
  - Icon: `<Archive aria-hidden size={16} className="shrink-0 text-text-subtle" />` (was size 14 outlined-button glyph; 16 matches rotate/reset/dev-capture rows).
  - Column: `<span className="flex min-w-0 flex-col">` (`COLUMN_CLASSES`) holding a label `<span className="text-sm font-medium text-text-strong">{rowLabel}</span>` (`LABEL_CLASSES`) and, when `rowDescription?.trim()` is non-empty, `<span id={descId} className="text-xs text-text-subtle">{rowDescription}</span>` (`DESCRIPTION_CLASSES`). Spans, not `<p>` — the §7.0 contract requires plain spans with text-only content.
- **Accessible name bound, not hardcoded** (WCAG 2.5.3, mirroring `RotateShareTokenButton.tsx:252-253`): `aria-label={rowLabel}` — inside `asRow` the tightened gate guarantees a non-blank label, so no conditional omission is needed — and `aria-describedby={rowDescription?.trim() ? descId : undefined}`. Today's code hardcodes `aria-label="Archive show"` (`ArchiveShowButton.tsx:249`) and keys the description off bare truthiness (`ArchiveShowButton.tsx:250`); binding + trim replaces both.

### 2.2 Wrapper and header plumbing

- The row variant's outer wrapper changes from `flex flex-col gap-2 py-3` (`ArchiveShowButton.tsx:240`) to the literal `flex w-full flex-col gap-2` — `WRAPPER_CLASS_VALUE` (`tests/components/admin/showpage/_rowWrapperScan.ts:24`), written as a literal class string on a plain non-interactive `div` so `_metaRowWrapperInert` can parse it. It wraps `{!armed ? rowButton : armedGroup}` plus `{banners}`.
- The armed group keeps its own `flex flex-col gap-2 py-3` (`ArchiveShowButton.tsx:265`) — unchanged, and now matching the rotate armed row exactly (`RotateShareTokenButton.tsx:364`, same class list). Net armed-state spacing change: the doubled `py-3` (outer + inner) collapses to the single inner `py-3`, i.e. the armed row loses 12px top+bottom of accidental double padding and lands on the rotate armed row's exact rhythm. No other armed change.
- `labelHeader` (`ArchiveShowButton.tsx:186-195`) becomes **confirm-branch-only**, mirroring rotate's comment contract (`RotateShareTokenButton.tsx:205-207`): the idle row renders its own label/description inside the button. `labelHeader` keeps its current `<div>/<p>` markup in the armed branch (armed render is ratified; §1.1).
- The stale idle-branch comment (`ArchiveShowButton.tsx:233-237, 251-253`) is replaced with one stating the §4.1 recipe and citing fidelity-fixes §4.1 + this spec.

### 2.3 ShareHub host

`components/admin/showpage/ShareHub.tsx:591` — the Show-section wrapper's class becomes `w-full` (drops `px-0.5`, gains `w-full`; keeps testid + scroll handler + structure). `w-full` is load-bearing, not cosmetic: the div is a flex child of the fixed-width popover column (`ShareHub.tsx:479`), and this project's Tailwind v4 build does NOT default flex children to cross-axis stretch (AGENTS.md dimensional-invariants rule), so without it the section can shrink-wrap and the inner `w-full` chain would resolve against a narrower box — reintroducing the very defect this spec removes. (R1 adversarial finding 1.) Rationale: Careful rows' hover plane spans the popover's full content width; a 2px inset on the archive row alone would keep the idiom visibly off at the edges. The `px-0.5` on the two `<h3>` eyebrows (`ShareHub.tsx:544` and `ShareHub.tsx:576`) stays — headings are inset by design across all sections. Consequence for the archived state: `UnarchiveShowButton` loses the same 2px inset; imperceptible, and no test pins it.

No other ShareHub change. The scroll handler queries `archive-show-confirm-button` (`ShareHub.tsx:596-605`) — testid unchanged.

## 3. Guard conditions

| Input | Behavior |
| --- | --- |
| `rowLabel` absent (`undefined`) | `asRow` false (gate `compact && rowLabel != null`, `ArchiveShowButton.tsx:102`) — legacy compact render. Unchanged. |
| `rowLabel` empty/whitespace | `asRow` is FALSE (tightened gate, §2.1) — legacy compact render, self-named by its visible "Archive show" text (`ArchiveShowButton.tsx:325`). Never an unnamed row button. ShareHub itself always passes a fixed literal (`ShareHub.tsx:617-624`). |
| `rowDescription` absent, empty, or whitespace | No description span, no `aria-describedby`, column subtree is exactly the label (`expectNoDescriptionNode` contract, `_rowAssertions.ts`). |
| `onBusyChange` absent | Optional chaining throughout — unchanged (`ArchiveShowButton.tsx:181-184`). |
| Refusal/not-found/generic banners | Render as wrapper siblings below the row, unchanged (`banners`, `ArchiveShowButton.tsx:197-231`). |

## 4. Transition inventory

States: idle, armed, (unmounted-on-success). All transitions instant — no animation exists on this control today and none is added.

| Pair | Treatment |
| --- | --- |
| idle → armed (row click) | Instant swap; arming focuses Cancel (C3, `ArchiveShowButton.tsx:166-168`). Unchanged. |
| armed → idle (Cancel) | Instant swap; focus restored to re-mounted trigger (C5, `ArchiveShowButton.tsx:172-177`). Unchanged. |
| armed → gone (confirm success) | `router.refresh()` re-renders the surface (`ArchiveShowButton.tsx:143-147`). Unchanged. |
| idle hover/focus | `transition-colors duration-fast` on `hover:bg-surface-sunken` + tier-1 ring — the recipe's own tokens, identical to rotate. |
| Compound: banner visible while idle/armed toggles | Banners are wrapper siblings in both branches; no interaction. Unchanged. |

No timer in this variant (ratified; §1.1). The legacy variants keep theirs.

## 5. Dimensional invariants

No fixed-height parent is introduced; the popover is width-fixed (`w-[308px]`, `ShareHub.tsx:479`) with a max-height scroller it already owns. Width chain for the row (mirrors fidelity-fixes §4.6), every link carrying an explicit class per the dimensional-invariants rule:

| Parent → child | Guarantee |
| --- | --- |
| popover content box (`p-2.5`, `ShareHub.tsx:479`) → Show-section div | `w-full` on the section div (§2.3) — flex children do NOT stretch by default in this Tailwind v4 build |
| Show-section div → component wrapper | `w-full` in `WRAPPER_CLASS_VALUE` (`flex w-full flex-col gap-2`) |
| wrapper → row button | `w-full` in `ROW_TOKENS` |
| button → label/description column | `min-w-0` (`COLUMN_CLASSES`) — shrinkable, not stretched |

Real-browser proof (a fixed-WIDTH parent with flex children IS in the layout-dimensions rule's scope, so jsdom class checks are not sufficient): extend `tests/e2e/admin-lifecycle-layout.spec.ts` (which already opens the hub popover at 390px and desktop widths, `tests/e2e/admin-lifecycle-layout.spec.ts:215-260`) with an IDLE-state assertion, before the arming click: `getBoundingClientRect()` width of `archive-show-button` equals the width of `admin-rotate-share-token-button` (rendered in the same popover for a held/unpublished show — the Careful section renders regardless of published state, `ShareHub.tsx:543-558`) within 0.5px. Equality against the sibling row is the direct statement of "one idiom": both chains resolve against the same popover content box. The existing armed-morph containment assertions (`admin-lifecycle-layout.spec.ts:230-260`) continue unchanged.

## 6. Tests (TDD)

1. **`tests/components/admin/ArchiveShowButton.test.tsx`** — rewrite the one idle-layout test (`tests/components/admin/ArchiveShowButton.test.tsx:71-82`, "resting: titled row + SHORT trigger…") into the §4.1/§7.0 contract, failing first: `expectClasses(trigger, { exactly: ROW_TOKENS, forbids: [NO_BORDER, NO_REST_BACKGROUND, /(?:^|:)focus-visible:ring-offset-/] })`; `expectRowText(trigger, container, { label: "Archive show", description: "Crew links stop working immediately" })`; icon identity `lucide-archive`, 16×16, `shrink-0 text-text-subtle`; `expectRowBoundary(trigger, { scope: container, descriptionId, container })` (standalone render → the component emits exactly one wrapper); old shape gone: no button with accessible name `"Archive"` (`queryByRole`). Add an absent-description guard test via `expectNoDescriptionNode`. Add a NON-DEFAULT-label test (R1 finding 3 — anti-tautology): render with `rowLabel="Retire this show"` and assert the visible label span text AND the accessible name both equal that value, and that no element in the container carries the string "Archive show" — an implementation that keeps the hardcoded `aria-label="Archive show"` while rendering the prop must fail. Add blank-gate tests (R1 finding 2): `rowLabel=""` and `rowLabel="   "` with `compact` render the LEGACY compact button (visible text "Archive show", no row wrapper, no unnamed button — assert via `getByRole("button", { name: "Archive show" })` and absence of the `WRAPPER_CLASS_VALUE` wrapper). ROW_TOKENS/helpers import from `tests/components/admin/showpage/_rowAssertions.ts` — ROW_TOKENS itself is file-local to `shareHub.test.tsx:421`, so the plan either exports it from `_rowAssertions.ts` or duplicates the literal; **decision: move `ROW_TOKENS` into `_rowAssertions.ts` and re-import in `shareHub.test.tsx`** (single source, same tokens, no behavior change). All armed-branch tests (`ArchiveShowButton.test.tsx:84-218`) stay byte-identical and green.
2. **`tests/components/admin/showpage/shareHub.test.tsx`** — add an archive-row §4.1 test mirroring the rotate one (`shareHub.test.tsx:438-472`): scope = popover, `ROW_TOKENS` exactly, `expectRowText`, icon identity, `expectRowBoundary`. Existing focus-contract (`shareHub.test.tsx:1030-1038`), Show-section (`shareHub.test.tsx:547-558`), and busy-gate tests unchanged.
3. **`tests/components/admin/showpage/_metaRowWrapperInert.test.ts`** — extend `FILES` (`_metaRowWrapperInert.test.ts:25-28`) with `components/admin/ArchiveShowButton.tsx`; the new wrapper is a literal-class plain div, so the AST scan finds it and proves it inert.
4. **`tests/styles/_metaDestructiveConfirm.test.ts`** — no registry change: the diff adds/removes no `bg-warning-text`+`text-warning-bg` literal; occurrence indices 0/1/2 for this file are stable (armed confirm literal untouched).
5. **e2e** — `admin-lifecycle-layout.spec.ts` gains the idle-width equality assertion (§5); `admin-lifecycle-transitions.spec.ts` keys on testids that don't change — run to confirm, don't edit.

Anti-tautology: every idle assertion goes through the §7.0 helpers, which were built precisely to close the assert-the-container escapes (four review rounds of history in `_rowAssertions.ts:6-23`); expected strings come from the ShareHub call-site literals, not re-derived.

## 7. Meta-test inventory

- **EXTENDS** `tests/components/admin/showpage/_metaRowWrapperInert.test.ts` (FILES += ArchiveShowButton).
- **EXTENDS (mechanical move)** `_rowAssertions.ts` gains the exported `ROW_TOKENS` constant (moved from `shareHub.test.tsx`).
- No advisory locks, no DB, no Supabase calls, no new mutation surfaces, no §12.4 codes — invariants 2/3/4/5/9/10 not in scope (pure client-render restyle of an existing instrumented flow; the archive server action is untouched).

## 8. UI gate

UI surface (components/). Invariant 8 applies: `/impeccable critique` + `/impeccable audit` on the diff before cross-model review. Pre-code mechanical checklist: no em-dash in user-visible copy added (none added — label/description strings are the existing ShareHub literals); tap target ≥44px (`min-h-tap-min` in ROW_TOKENS); canonical tokens only (all tokens already in DESIGN.md's ratified row recipe).

## 9. Numeric sweep

308px popover (`w-[308px]`, `ShareHub.tsx:479`) — cited twice, both from the same class. Icon 16px (three §4.1 rows precedent; was 14). `py-3` armed padding — kept once (inner), dropped once (outer). 2px = `px-0.5` inset dropped in §2.3. 4s/`ARM_REVERT_MS` — legacy variants only, unchanged.
