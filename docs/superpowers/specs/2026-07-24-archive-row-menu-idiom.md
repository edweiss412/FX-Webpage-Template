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
| The row variant's ARMED state MARKUP AND BEHAVIOR (label header + consequence prose + Confirm/Cancel, **no 4s timer**, focus rules C3/C5) are owner-ratified and unchanged. The armed state's OUTER spacing is the one deliberate exception, ratified by this spec: the outer wrapper's `py-3` was stacking on the armed group's own `py-3` — 24px of accidental double padding the rotate armed row does not have — and dropping the outer copy lands the armed row on the rotate armed row's exact class list and rhythm (`RotateShareTokenButton.tsx:364` vs `ArchiveShowButton.tsx:265`, identical `flex flex-col gap-2 py-3`). Matching that rhythm is this feature's stated goal; §6 pins it with a both-states wrapper-class test. (R2 adversarial finding; resolved in-scope, not silently.) | `components/admin/ArchiveShowButton.tsx:72-85` (owner-ratified 2026-07-20 amendment to destructive-confirm-pass §R7 / m12.2-phase-b2 §2.2); this spec §2.2 for the spacing exception |
| The armed confirm keeps the destructive recipe (inverted amber, tier-2 focus ring) and its registry row. | `tests/styles/_metaDestructiveConfirm.test.ts:39-45` (row 2); `tests/components/admin/showpage/shareHub.test.tsx:1030-1038` (tier-2 archive confirm) |
| Legacy non-row variants (Overview zero-shift box, footer compact) are unchanged, including their 4s auto-revert. | `ArchiveShowButton.tsx:312-346`; `ARM_REVERT_MS` at `ArchiveShowButton.tsx:45` |
| `UnarchiveShowButton` stays a plain single-tap button — it is non-destructive (`components/admin/UnarchiveShowButton.tsx:69`) and is not a "Careful"-idiom row. Out of scope. | Feature request; per-show-lifecycle contract `tests/components/admin/per-show-lifecycle.test.tsx:185-231` |
| A whole-row destructive trigger is acceptable: arming is reversible (explicit Cancel), and Rotate/Reset — equally destructive — already use whole-row triggers under the same §4.1 idiom. | fidelity-fixes §4.1 precedent; the two-tap contract itself (`ArchiveShowButton.test.tsx:99-120`) |
| Viewport-level auto-reveal of the armed confirm on short phones is a PRE-EXISTING gap, measured on live pre-restyle code (R9 probe, §10: handler scrolls the popover scroller exactly right — `scrollTop` 93 = 483−390 — but the scrollable modal panel stays at 0, leaving confirm at viewport y 676-720 in a 560px viewport; the user reaches it by scrolling the panel manually). Out of scope: this diff strictly reduces armed height (−24px). Tracked as `BL-SHAREHUB-ARM-VIEWPORT-REVEAL` in BACKLOG.md with paired deferral `SHAREHUB-ARM-VIEWPORT-REVEAL-1` in DEFERRED.md. The §5 test asserts the ratified handler's own contract (popover content coordinates), not the deferred viewport reveal. |
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
- The armed group keeps its own `flex flex-col gap-2 py-3` (`ArchiveShowButton.tsx:265`) — unchanged, and now matching the rotate armed row exactly (`RotateShareTokenButton.tsx:364`, same class list). Net armed-state spacing change (ratified in §1.1): the doubled `py-3` (outer + inner) collapses to the single inner `py-3`, i.e. the armed row loses 12px top+bottom of accidental double padding and lands on the rotate armed row's exact rhythm. No other armed change. Guards: the §6 both-states wrapper test pins the outer wrapper at exactly `WRAPPER_CLASS_VALUE` while idle AND while armed (a branch-conditional `py-3` reintroduction fails it); the armed-morph containment assertions in `admin-lifecycle-layout.spec.ts:230-260` run against the changed code across the suite's width sweep (600-1280px, `admin-lifecycle-layout.spec.ts:51`); arming-scroll behavior on a phone-height viewport gets NEW coverage per §5 item 3 — the existing suite runs at height 1000 and never forces the scrollport case.
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

Real-browser proof (a fixed-WIDTH parent with flex children IS in the layout-dimensions rule's scope, so jsdom class checks are not sufficient): extend `tests/e2e/admin-lifecycle-layout.spec.ts` — its hub-popover test opens the popover across the suite's width sweep `[600, 719, 720, 860, 1024, 1280]` at height 1000 (`tests/e2e/admin-lifecycle-layout.spec.ts:51` and `admin-lifecycle-layout.spec.ts:215-260`; it does NOT currently include a phone width or a constrained height) — with IDLE-state assertions, before the arming click, at every swept viewport:

1. **Primary — anchor to the parent, not a sibling** (R3 adversarial finding; formula corrected R4): compute the popover's CONTENT width as `clientWidth` minus `getComputedStyle` `paddingLeft` + `paddingRight` on `share-hub-popover` — `clientWidth` already excludes the panel's `border border-border` (`ShareHub.tsx:479`), whereas `getBoundingClientRect().width` is the border box and would over-state the target by the two 1px borders — and assert the `archive-show-button` `getBoundingClientRect()` width equals it within 0.5px. A shared regression that narrows every row equally cannot pass this; it restates the parent fidelity-fixes contract's rows-measure-against-the-panel-content-box posture.
2. **Secondary — sibling equality**: archive row width equals `admin-rotate-share-token-button` width within 0.5px (rendered in the same popover for a held/unpublished show — the Careful section renders whenever the show is not archived, `ShareHub.tsx:484` and `ShareHub.tsx:543-558`). This is the "one idiom" statement, kept as an additional check only.

The existing armed-morph containment assertions (`admin-lifecycle-layout.spec.ts:230-260`) continue unchanged.

3. **New phone-height scrollport case** (R5 adversarial finding; hardened R6, corrected R7, empirically grounded R8): a new test in the same spec at **390x560**. Viewport chosen from the R8 probe (appendix §10, run on live code at 390x700): at height 700 the armed popover overflows (`scrollHeight` 602 > `clientHeight` 488) but the confirm still fits the first scrollport page (`offsetTop + offsetHeight` = 483 < 488), so 700 CANNOT force the below-fold case; at height 560 (R9 re-probe, measured): cap = 70vh = 392, popover `clientHeight` 390, armed `scrollHeight` 602, confirm `offsetTop + offsetHeight` = 483 > 390 (below fold by 93px), and the handler scrolled the popover to exactly `scrollTop` 93 = 483 − 390 with a single `block: "end"` call on the confirm. After this spec's −24px armed-padding collapse the below-fold margin is still ~69px — the premise survives the restyle. The probe also showed ancestor scrolling does NOT lift the band-anchored popover into the viewport (confirm viewport-bottom stayed at 834 in a 700px viewport after the handler ran), so all containment is asserted in POPOVER CONTENT COORDINATES, never as viewport intersection. Sequence:
   1. Register the instrumentation with `page.addInitScript` BEFORE `signInAs`/`page.goto` (probe-validated ordering — init scripts attach on navigation): wrap `Element.prototype.scrollIntoView`, preserving the original via `orig.call(this, opts)`, recording each call's `data-testid` + options into a window array; after `goto`, assert the sentinel array exists before opening the hub.
   2. Open the hub; assert `scrollTop === 0` on the popover (fresh open, untouched scroller). Idle MAY already overflow at this height (probe: idle content 477 > 392 cap) — no idle-overflow assertion either way; the arm row (measured `offsetTop` 315 + 44 < 392) is inside the first page, and the arming click is an `locator.evaluate((el) => el.click())` direct DOM click anyway, so Playwright actionability scrolling never enters.
   3. After the confirm mounts and the handler's `requestAnimationFrame` settles, assert: (a) BELOW-FOLD PRECONDITION, in content coordinates: popover `scrollHeight > clientHeight` AND confirm `offsetTop + offsetHeight > clientHeight` (measured 483 vs 390 pre-restyle, ~459 vs 390 after the −24px collapse; the probe confirmed `offsetParent` is the popover itself, so `offsetTop` IS the content coordinate) — fails loudly if the armed morph stops overflowing at 390x560; (b) CAUSALITY: the instrumented record contains a `scrollIntoView` call whose element testid is `archive-show-confirm-button` with `block: "end"` (both probes observed exactly this single call on live code; `ShareHub.tsx:596-605`); (c) GEOMETRY: the confirm is fully inside the popover's scroll window — `offsetTop >= scrollTop` and `offsetTop + offsetHeight <= scrollTop + clientHeight`, within 0.5px. `scrollTop` is never used as proof of WHO scrolled (the arming `cancelRef.current?.focus()` at `ArchiveShowButton.tsx:166-168` can also scroll); causality comes only from (b). No viewport-coordinate assertion: the R9 probe measured the auto-reveal stopping at the popover scroller on LIVE pre-restyle code — a pre-existing gap deferred as `BL-SHAREHUB-ARM-VIEWPORT-REVEAL` + DEFERRED.md `SHAREHUB-ARM-VIEWPORT-REVEAL-1` (§1.1); asserting it here would fail current production behavior this diff does not touch.

   This covers the armed-spacing change (§1.1 exception) at exactly the venue-floor geometry the scroll handler exists for; no existing suite exercises it (the current sweep is width-only at height 1000).

## 6. Tests (TDD)

1. **`tests/components/admin/ArchiveShowButton.test.tsx`** — rewrite the one idle-layout test (`tests/components/admin/ArchiveShowButton.test.tsx:71-82`, "resting: titled row + SHORT trigger…") into the §4.1/§7.0 contract, failing first: `expectClasses(trigger, { exactly: ROW_TOKENS, forbids: [NO_BORDER, NO_REST_BACKGROUND, /(?:^|:)focus-visible:ring-offset-/] })`; `expectRowText(trigger, container, { label: "Archive show", description: "Crew links stop working immediately" })`; icon identity `lucide-archive`, 16×16, `shrink-0 text-text-subtle`; `expectRowBoundary(trigger, { scope: container, descriptionId, container })` (standalone render → the component emits exactly one wrapper); old shape gone: no button with accessible name `"Archive"` (`queryByRole`). Add an absent-description guard test via `expectNoDescriptionNode`. Add a NON-DEFAULT-label test (R1 finding 3 — anti-tautology): render with `rowLabel="Retire this show"` and assert the visible label span text AND the accessible name both equal that value, and that no element in the container carries the string "Archive show" — an implementation that keeps the hardcoded `aria-label="Archive show"` while rendering the prop must fail. Add blank-gate tests (R1 finding 2): `rowLabel=""` and `rowLabel="   "` with `compact` render the LEGACY compact button (visible text "Archive show", no row wrapper, no unnamed button — assert via `getByRole("button", { name: "Archive show" })` and absence of the `WRAPPER_CLASS_VALUE` wrapper). Add a both-states wrapper test (R2 finding): in the row variant, the OUTER wrapper's class list is exactly `WRAPPER_CLASS_VALUE` while idle and STILL exactly `WRAPPER_CLASS_VALUE` after arming, and the armed group's own class list is exactly `flex flex-col gap-2 py-3` — pinning the ratified armed rhythm (§1.1) against both a `py-3` reintroduction on the wrapper and a drop of the armed group's inner padding. ROW_TOKENS/helpers import from `tests/components/admin/showpage/_rowAssertions.ts` — ROW_TOKENS itself is file-local to `shareHub.test.tsx:421`, so the plan either exports it from `_rowAssertions.ts` or duplicates the literal; **decision: move `ROW_TOKENS` into `_rowAssertions.ts` and re-import in `shareHub.test.tsx`** (single source, same tokens, no behavior change). All armed-branch tests (`ArchiveShowButton.test.tsx:84-218`) stay byte-identical and green.
2. **`tests/components/admin/showpage/shareHub.test.tsx`** — add an archive-row §4.1 test mirroring the rotate one (`shareHub.test.tsx:438-472`): scope = popover, `ROW_TOKENS` exactly, `expectRowText`, icon identity, `expectRowBoundary`. Existing focus-contract (`shareHub.test.tsx:1030-1038`), Show-section (`shareHub.test.tsx:547-558`), and busy-gate tests unchanged.
3. **`tests/components/admin/showpage/_metaRowWrapperInert.test.ts`** — extend `FILES` (`_metaRowWrapperInert.test.ts:25-28`) with `components/admin/ArchiveShowButton.tsx`; the new wrapper is a literal-class plain div, so the AST scan finds it and proves it inert.
4. **`tests/styles/_metaDestructiveConfirm.test.ts`** — no registry change: the diff adds/removes no `bg-warning-text`+`text-warning-bg` literal; occurrence indices 0/1/2 for this file are stable (armed confirm literal untouched).
5. **e2e** — `admin-lifecycle-layout.spec.ts` gains the idle-width assertions AND the 390x560 phone-height scrollport case (§5 items 1-3); `admin-lifecycle-transitions.spec.ts` keys on testids that don't change — run to confirm, don't edit.
6. **CI wiring (R11 adversarial finding — verified: no workflow invokes `admin-lifecycle-layout.spec.ts`; it is matched only by the `mobile-safari` project regex, and every e2e workflow runs an explicit spec list).** The implementation adds a workflow job — a new workflow file named lifecycle-layout-e2e.yml following the established shape (`crew-e2e.yml:105` is the mobile-safari template) — that runs `pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-layout.spec.ts`, with `workflow_dispatch:` enabled (repo close-out rule) and path filters covering `components/admin/ArchiveShowButton.tsx`, `components/admin/showpage/ShareHub.tsx`, `app/admin/show/[slug]/RotateShareTokenButton.tsx`, `tests/e2e/admin-lifecycle-layout.spec.ts`, and the workflow file itself. Real-CI green on this job is part of the branch's close-out gate. Class-sweep note: `admin-lifecycle-transitions.spec.ts` is equally dark in CI; wiring it is out of this restyle's scope and is recorded as `BL-E2E-LIFECYCLE-SPECS-CI-DARK` in BACKLOG.md (this spec wires only the file carrying its load-bearing assertions).

Anti-tautology: every idle assertion goes through the §7.0 helpers, which were built precisely to close the assert-the-container escapes (four review rounds of history in `_rowAssertions.ts:6-23`); expected strings come from the ShareHub call-site literals, not re-derived.

## 7. Meta-test inventory

- **EXTENDS** `tests/components/admin/showpage/_metaRowWrapperInert.test.ts` (FILES += ArchiveShowButton).
- **EXTENDS (mechanical move)** `_rowAssertions.ts` gains the exported `ROW_TOKENS` constant (moved from `shareHub.test.tsx`).
- No advisory locks, no DB, no Supabase calls, no new mutation surfaces, no §12.4 codes — invariants 2/3/4/5/9/10 not in scope (pure client-render restyle of an existing instrumented flow; the archive server action is untouched).

## 8. UI gate

UI surface (components/). Invariant 8 applies: `/impeccable critique` + `/impeccable audit` on the diff before cross-model review. Pre-code mechanical checklist: no em-dash in user-visible copy added (none added — label/description strings are the existing ShareHub literals); tap target ≥44px (`min-h-tap-min` in ROW_TOKENS); canonical tokens only (all tokens already in DESIGN.md's ratified row recipe).

## 9. Numeric sweep

308px popover (`w-[308px]`, `ShareHub.tsx:479`) — cited twice, both from the same class. Icon 16px (three §4.1 rows precedent; was 14). `py-3` armed padding — kept once (inner), dropped once (outer). 2px = `px-0.5` inset dropped in §2.3. 4s/`ARM_REVERT_MS` — legacy variants only, unchanged.

## 10. Appendix — R8 empirical probe (2026-07-24)

Throwaway Playwright probe (file "probe-admin-lifecycle-layout.spec.ts" under tests/e2e/, since deleted — see below; mobile-safari project, E2E_PORT=3005, loopback TEST_DATABASE_URL, held show via `seedHeldShow()`), viewport 390x700, run against LIVE pre-restyle code; 1 passed. Raw result:

```json
{"idle":{"scrollHeight":477,"clientHeight":477,"clientWidth":306,"scrollTop":0},
 "idleRow":{"offsetTop":315,"offsetHeight":44},
 "armed":{"scrollHeight":602,"clientHeight":488,"clientWidth":306,"scrollTop":0},
 "armedConfirm":{"offsetTop":439,"offsetHeight":44,"offsetParentTestid":"share-hub-popover",
   "rect":{"top":790.36,"bottom":834.36}},
 "sivCalls":[{"testid":"archive-show-confirm-button","opts":{"block":"end"}}]}
```

Second run (R9), identical probe at **390x560**:

```json
{"idle":{"scrollHeight":474,"clientHeight":390,"scrollTop":0,"rect":{"top":329.3,"bottom":721.3}},
 "idleRow":{"offsetTop":313,"offsetHeight":44},
 "armed":{"scrollHeight":602,"clientHeight":390,"scrollTop":93},
 "armedConfirm":{"offsetTop":439,"offsetHeight":44,"rect":{"top":676.36,"bottom":720.36}},
 "sivCalls":[{"testid":"archive-show-confirm-button","opts":{"block":"end"}}],
 "panel":{"scrollHeight":1752,"clientHeight":476,"scrollTop":0,"rect":{"top":84,"bottom":560}},
 "band":{"top":227.3,"bottom":323.3}}
```

Readings used by §5 item 3: at 700, idle no-overflow (477 = 477) and armed confirm within the first page (483 < 488, `scrollTop` stayed 0) — 700 cannot force the below-fold case; at 560, armed overflow (602 > 390), confirm below fold (483 > 390), handler scrolled the popover to exactly `scrollTop` 93 = 483 − 390; both runs recorded exactly one `scrollIntoView` call, on the confirm, `block: "end"`; `offsetParent` = the popover (offsets are content coordinates); the scrollable modal panel (`1752 > 476`) stayed at `scrollTop` 0 in both runs, so the confirm settled below the viewport (bottom 720 in a 560 viewport) — the pre-existing auto-reveal gap now tracked as `BL-SHAREHUB-ARM-VIEWPORT-REVEAL`. The probe file is deleted (R9 finding 2 — it was measurement scaffolding, not a regression test; its seed/teardown copied the established `admin-lifecycle-layout.spec.ts` afterAll pattern, so the advisory-lock claim against it is refuted by that precedent, recorded here per triage discipline); this appendix is the durable record.
