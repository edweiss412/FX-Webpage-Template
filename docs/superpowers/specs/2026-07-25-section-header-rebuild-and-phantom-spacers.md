# Section-header rebuild + childless-spacer sweep (2026-07-25)

**Status:** spec, awaiting adversarial review.
**Branch:** `feat/section-header-rebuild-phantom-spacers`.
**Backlog items closed:** `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`, `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET`.

---

## 1. Why

`BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW` was filed as a 20px wasted-gap item: `ModalSectionChrome`'s header row holds a childless `<span className="flex-1" />` (`components/admin/wizard/step3ReviewSections.tsx:916`) that collapses to zero width in a crowded row while the row still charges `gap-2.5` on both sides of it.

**Measurement refutes the framing and finds something worse.** Only one of those two gaps is waste (the other is legitimate separation between the count and the pill), so the gap cost is **10px, not 20px**. The real defect is that on a flagged section at phone width the row runs out of space and the *section name* is what yields:

| viewport | header row content box | header height | section name |
| -------- | --------------------- | ------------- | ------------ |
| 320px    | 280px                 | **124px**     | **26.7px across 5 lines** |
| 360px    | 320px                 | 49.6px        | 66.8px, 2 lines |
| 375px    | 335px                 | 49.6px        | 81.8px, 2 lines |
| 390px    | 350px                 | 49.6px        | 96.8px, 2 lines |
| 430px    | 390px                 | 44px          | 116.2px, 1 line |
| 1280px   | 561px                 | 44px          | 116.2px, 1 line |

At 320px the row is **2.8× its normal height** and the name is unreadable. Every number in this spec was measured in Chromium against the real component via the DB-free static harness (`tests/e2e/_step3ReviewModalHarness.tsx`, driven under the pattern that `tests/e2e/step3-review-modal.layout.spec.ts:118-190` establishes), at the header row's real content-box widths — never estimated. §11 records the measurement method so the plan can reproduce it.

Repairing only the 10px gap does **not** fix this: measured, it buys the name 10px and leaves 5 lines at 320px and 2 lines at 375px. The header content itself has to change.

## 1.1 Resolved scope — do not relitigate

Each row is a decision already taken, with its ratification. Verify the citation; do not re-derive.

| # | Decision | Ratified |
| - | -------- | -------- |
| 1 | **Layout is D1: name + count centered, sheet link in the right corner.** Owner-selected 2026-07-25 from a measured 4-way comparison (C1 name+link centered / D1 / D2 all-centered / D3 balanced-gutter). | Owner decision, this session. §3.1 carries the measurements. |
| 2 | **The pill gets its own centered line; it does NOT stay inline.** A centered name and an inline pill cannot share a row: measured, the inline variant reintroduces a 2-line name at 320px (the original bug) and lands the name 48–60px off the row's axis. | §3.1.4, measured. |
| 3 | **Flagged/judgment sections therefore cost 72.8px instead of 44px, at every width.** Accepted. Only sections that need attention pay it; every ordinary section stays a single 44px row. This is the trade the centered layout forces — not an oversight. | §3.1.4. |
| 4 | **Sheet link is a 20px glyph with a `before:inset-[-12px]` expanded hit area, NOT the `size-tap-min` box the card header uses.** Deliberate deviation from `components/admin/wizard/Step3ReviewModal.tsx:409`. Measured: a 44px corner box outweighs the 28px status icon and drags the name 8–29px left; the 20px glyph holds it within 4–17px. The 44px touch target is fully preserved (20 + 2×12 = 44). Hit-area idiom precedent: `components/admin/HoverHelp.tsx:537`. | §3.1.3, measured. |
| 5 | **The name's residual off-centre spread across states (+4px to −17px) is accepted.** It follows from putting the count inside the centered group, which is decision 1. Not a defect to be engineered away with a compensating spacer. | §3.1.5. |
| 6 | **The empty right corner is compensated with padding on the group, NOT a reserved spacer element.** Measured identical geometry (+4px / +2px) both ways; padding adds no element to a gapped row, which is this batch's whole point. | §3.1.5, measured. |
| 7 | **`components/admin/showpage/ShowReviewModalSkeleton.tsx:152` keeps its `flex-1` Skeleton.** Its row is `flex w-full items-center gap-2` with one sibling and a `w-full` parent, so the bar always has width — it is not a collapsing pusher. It is the single allowlisted row in the §6 guard registry. | §6. |
| 8 | **`components/crew/sections/TravelSection.tsx:588` needs no fix — REFUTED, do not re-raise.** It looks like a second blank-eyebrow instance (identical classes) but its `<p>` always contains a `<span>` child, so the empty-element selector can never match. More importantly it is unreachable-blank: it renders only under `showStructured = seg.structured && hasContent` (`components/crew/sections/TravelSection.tsx:572`), and the `dateRaw: null` construction sets `structured: false` (`lib/crew/flightDisplay.ts:184`); structured segments always carry a `dateRaw` (`lib/crew/flightDisplay.ts:152`). | §3.3. |
| 9 | **No new error codes, no §12.4 catalog edits, no migrations.** This batch is presentational plus test wiring. The three-way §12.4 lockstep and the `validation-schema-parity` gate are therefore N/A. | §7. |

## 2. Current state (cited)

| Site | Shape | Flattens today? |
| ---- | ----- | --------------- |
| `components/admin/wizard/step3ReviewSections.tsx:916` | childless `<span className="flex-1" />`, pushes pill + sheet link right | **Yes** — 0px wide, charging 10px each side, on flagged sections at ≤390px |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | `<span aria-hidden className="h-px flex-1 bg-border" />` — decorative hairline | Not measured (no probe mounts this surface) |
| `components/admin/BellPanel.tsx:323` | childless `<span className="flex-1" />` in `flex flex-wrap items-center gap-x-2 gap-y-1` | Not measured |
| `components/admin/nav/AdminNav.tsx:144` | childless `<div className="flex-1" />` | Not measured |
| `components/admin/nav/OnboardingTopBar.tsx:67` | childless `<div className="flex-1" />` | Not measured |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` | `<Skeleton className="h-11 flex-1 rounded-sm" />` | No — never crowded (§1.1 item 7) |

Ledgered debt to be repaid (both assert exact occurrence counts, and both files' stale-row assertions fail if a row outlives its repair):

- `tests/e2e/admin-layout-dimensions.spec.ts:500` — `KNOWN_SHOW_MODAL_PHANTOM_ITEMS`, 2 rows (`rooms`, `warnings`), width 375, `axis: "column-gap"`, `gap: 10`, `count: 1`.
- `tests/e2e/crew-layout-dimensions.spec.ts:1037` — `KNOWN_CREW_PHANTOM_ITEMS`, 2 rows (widths 390 and 1000), `axis: "row-gap"`, `gap: 2`, `count: 2`.

`ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:850`) is the component under change. Its header row is at `components/admin/wizard/step3ReviewSections.tsx:892` (`flex items-center gap-2.5`, with `mb-2`/`mb-3` by variant).

## 3. The change

### 3.1 `ModalSectionChrome` header (`step3ReviewSections.tsx:850-941`)

#### 3.1.1 Target structure

The outer element becomes a column; the header line and the pill line are its two children.

```
<div className={`${sub ? "mb-2" : "mb-3"} flex flex-col gap-1.5`}>
  <div className="flex min-h-tap-min items-center gap-2.5">     ← header line
    {statusIcon}                                                 ← unchanged tones
    <div className={`flex min-w-0 flex-1 items-center justify-center gap-1.5${sheetHref === null ? " pr-[30px]" : ""}`}>
      <Heading …>{label}</Heading>
      {showCount ? <span …>({count})</span> : null}
    </div>
    {sheetHref !== null ? <a … /> : null}                        ← 20px glyph, corner
  </div>
  {pill !== null ? <div className="flex justify-center">{pill}</div> : null}
</div>
```

The childless `flex-1` spacer at `components/admin/wizard/step3ReviewSections.tsx:916` is **deleted**, not repurposed.

#### 3.1.2 Count placement

The count moves from a right-hand sibling into the centered group, immediately after the heading. It stays **outside** the `<Heading>` element so the heading's accessible name remains the section name alone. `showCount` logic is unchanged — it still comes from `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708`), which returns false unless the section is in `COUNT_SECTIONS` (`components/admin/wizard/step3ReviewSections.tsx:697` — `crew`, `contacts`, `rooms`, `warnings`) with a non-null count and a real `sectionId`, and additionally suppresses a flagged `(0)`.

**Consequence worth stating:** only 4 of the ~13 rendered sections ever show a count, so the name-only geometry is the common case, not the exception. Both are specified below.

#### 3.1.3 Sheet link

Becomes icon-only, in the right corner:

```
className="relative inline-grid size-5 shrink-0 place-items-center rounded-sm text-text-subtle
           transition-colors duration-fast hover:text-text
           before:absolute before:inset-[-12px] before:content-['']
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
           focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
```

with `<ExternalLink aria-hidden="true" className="size-4" />` inside. The existing `aria-label={`Open the source sheet for ${label}`}` and the `target="_blank" rel="noopener noreferrer"` pair are **unchanged**, so removing the visible words "In sheet" costs nothing to assistive tech. Touch target: 20 + 2×12 = **44px**, satisfying the `min-h-tap-min` floor without a 44px visual box. See §1.1 item 4 for why this deviates from the card header.

`sheetHref` remains null for the Diagrams sub-block (no `dfid`) and for "Report an issue" (`sectionId === "report"`), per the existing derivation at `components/admin/wizard/step3ReviewSections.tsx:884-888`.

#### 3.1.4 Pill line

The flag pill ("Needs a look") and the judgment pill ("Parsed with judgment") are mutually exclusive (`judgment = chrome.judgment === true && !flagged`, `components/admin/wizard/step3ReviewSections.tsx:871`). Whichever renders moves to its own line, centered. When neither renders, **no second line and no wrapper element is emitted** — the header collapses to a single 44px row. This is a real requirement, not a nicety: an always-rendered empty wrapper inside the new `flex flex-col gap-1.5` would charge 6px and recreate exactly the class this batch removes.

Measured heights: **72.8px** with a pill, **44px** without, at every width from 320px to 1280px.

#### 3.1.5 Centring geometry (measured)

Distance of the name's text from the header row's true horizontal centre, at 375px (row 335px). Negative = left of centre.

| State | Sections | Offset |
| ----- | -------- | ------ |
| no count, link present | venue, event details, crew schedule, hotels, transport, pack list, billing & docs | **+4px** |
| count present, link present | crew, contacts, rooms, warnings | **−8.4px** |
| count present, link, longest real name + 3-digit count | `Sheet warnings (128)` | **−17px** |
| no count, no link, `pr-[30px]` | report an issue | **+4px** |
| sub-block, no count, no link, `pr-[30px]` | diagrams | **+2px** |

`pr-[30px]` = the link's 20px footprint + the row's 10px `gap-2.5`. Without it those two sections drift to **+19px** and **+17px** — visibly off-axis against neighbouring sections. With it they match the common case. Measured identical to a reserved 20px spacer element; padding is chosen because it adds no element (§1.1 item 6).

### 3.2 The four childless pushers

| Site | Change |
| ---- | ------ |
| `components/admin/BellPanel.tsx:323` | Delete the spacer; add `ml-auto` to the right-hand content. Right content is present iff `!entry.isHealth`, and is either the auto-note `<p>` or the resolve `<button>` — **both** get it. |
| `components/admin/nav/AdminNav.tsx:144` | Delete the spacer; add `ml-auto` to the following action-cluster `<div>` (`components/admin/nav/AdminNav.tsx:146`). Always rendered, so no empty-state case. |
| `components/admin/nav/OnboardingTopBar.tsx:67` | Delete the spacer; add `ml-auto` to the following action-cluster `<div>` (`components/admin/nav/OnboardingTopBar.tsx:69`). Always rendered. |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | **Not a pusher** — a decorative hairline. Apply the settled `DESIGN.md` §7a rule: `hidden min-[N]:block` plus a `min-w-*` floor, `N` **measured**, not assumed. |

`ml-auto` (not `justify-between`) is the established idiom here: `components/admin/CompactAlertCard.tsx:138` records why — "a lone child under `justify-between` sits at the START edge". Nothing moves visually on any of these three; they are not crowded today.

For `components/admin/wizard/step3ReviewSections.tsx:2150`, the plan measures the width at which the hairline first draws non-zero and uses that as `N`, mirroring how `components/admin/BulkIgnoreControls.tsx:202` arrived at `min-[480px]:block` with a `min-w-6` floor. **`N` is an output of the plan's measurement task, not a value this spec asserts.**

### 3.3 TravelRow eyebrow (`components/crew/sections/TravelSection.tsx:121`)

Add `empty:hidden` to the eyebrow `<p>`. A ground leg whose stage was promoted to the primary line passes `label=""` (`components/crew/sections/TravelSection.tsx:403`), and `label` is typed `string` (`components/crew/sections/TravelSection.tsx:92`), so React renders no child node at all and the empty-element selector matches. The element keeps its documented slot and costs nothing when blank — the `DESIGN.md` §7a idiom.

**Caveat to carry into the plan:** a literal space or `{" "}` inside that `<p>` silently re-enables the 2px gap. The test must assert rendered geometry, not the class.

`components/crew/sections/TravelSection.tsx:588` is **not** a second instance — see §1.1 item 8.

### 3.4 Archived-bucket probe

`T-NOPHANTOM-DASH` measures `/admin` in its active bucket only; `tests/e2e/admin-layout-dimensions.spec.ts:362-367` records why the archived bucket was left out — `pnpm db:seed` seeds no archived shows, so a probe there would anchor on nothing and be vacuously green.

The archived fixture already exists: `supabase/seedWalkerFixtures.ts` seeds `walker-archived-2026` with `archived: true` (`supabase/seedWalkerFixtures.ts:117-123`). So this is wiring, not a new fixture.

1. In `.github/workflows/phantom-gap-e2e.yml`, run `pnpm dlx tsx supabase/seedWalkerFixtures.ts` after the existing `pnpm db:seed` step.
2. Add a `T-NOPHANTOM-DASH [archived]` case at both existing widths (390, 1280) navigating `/admin?bucket=archived`.
3. Anchor non-vacuity on `archived-show-row-walker-archived-2026` (`components/admin/ArchivedShowRow.tsx:48` is the testid template). The anchor must be **captured from a live `visited` dump**, not guessed — `tests/e2e/admin-layout-dimensions.spec.ts:370-376` records that the active-bucket anchors had to be, because a container whose children carry testids never enters `visited` under its own name.

`supabase/seed*` is already a workflow path trigger, so no trigger edit is needed for the seed change; `.github/workflows/phantom-gap-e2e.yml` triggers on itself.

### 3.5 Ledger deletions

Delete all four rows named in §2. The stale-row assertion in each file fails if a repaired row is kept, so these deletions are load-bearing and cannot be deferred.

## 4. Mode boundaries and guard conditions

`ModalSectionChrome` state space, and what each state renders:

| Input | Values | Effect on the new header |
| ----- | ------ | ------------------------ |
| `headingLevel` (`components/admin/wizard/step3ReviewSections.tsx:870`) | 3 (default) / 4 | 4 ⇒ `sub`: `<h4>`, `text-sm`, `size-6` icon, `mb-2`. 3 ⇒ `<h3>`, `text-base`, `size-7` icon, `mb-3`. Both use the same three-slot row and the same `gap-2.5`. |
| `flagged` | boolean | true ⇒ amber icon chip + "Needs a look" pill on line 2 |
| `chrome.judgment` | boolean | true **and** `!flagged` ⇒ info-tone icon chip + "Parsed with judgment" pill on line 2 |
| neither | — | sunken icon chip, **no line 2** |
| `count` | `number \| null` | rendered only when `shouldShowSectionCount` is true; `null`, a non-`COUNT_SECTIONS` id, an absent `sectionId`, or flagged-zero ⇒ omitted, and the group holds the name alone |
| `sheetHref` | `string \| null` | null ⇒ no corner element **and** `pr-[30px]` on the group |
| `label` | `string` | Empty string is not a reachable input for this component (every caller passes a literal — e.g. `label="Rooms"` at `components/admin/wizard/step3ReviewSections.tsx:1929`, `label="Warnings"` at `components/admin/wizard/step3ReviewSections.tsx:2759`). If it were empty the row would render icon + empty group + link; no crash, no layout break. |

Empty/zero/null sweep: `count === 0` renders `(0)` only when not flagged; `count === null` omits the chip; `label === ""` is unreachable but degrades safely; `sheetHref === null` is the padded case; `chrome.sectionId === undefined` (sub-block) forces both count and link off, which is the `pr-[30px]` + `sub` combination — the **narrowest** geometry, and the one §3.1.5 measures at +2px.

## 5. Dimensional invariants

Tailwind v4 does not default `.flex` to `align-items: stretch`, so every relationship below is stated explicitly and must be asserted in a real browser (jsdom computes no layout).

| Parent | Child | Invariant | Guaranteed by |
| ------ | ----- | --------- | ------------- |
| header line | status icon | icon keeps its intrinsic 28px (sub: 24px); never shrinks | `shrink-0` + `size-7`/`size-6` on the icon |
| header line | centered group | group absorbs all free width | `flex-1` + `min-w-0` on the group |
| header line | sheet link | link keeps 20px; never shrinks or grows | `shrink-0` + `size-5` |
| header line | itself | line is ≥44px tall in every state | `min-h-tap-min` on the line |
| centered group | heading | heading may shrink and wrap-break; never forces overflow | `min-w-0` + `wrap-break-word` on the heading |
| centered group | count | count keeps intrinsic width | `shrink-0` |
| outer column | pill line | pill line spans the column; pill centres within it | `flex justify-center` on the pill line |
| sheet link | its hit area | ≥44×44 despite a 20px box | `relative` + `before:absolute before:inset-[-12px]` |

Height invariants to assert: header line 44px in every state; whole header 44px with no pill and 72.8px with one, at 320/375/430/1280.

## 6. Static guard — childless growable elements

A set-equality structural guard, allowlist-shaped rather than leak-hunting (the `#592` lesson: three rounds and 22 findings went to fail-open shapes a detector kept missing).

- **Walk** every `.tsx` under `components/` and `app/` from the filesystem, so a new file fails by default.
- **Collect** every self-closing JSX element (and every element with no JSX children) whose `className` contains a growable token — `flex-1`, `grow`, `flex-auto`, or an arbitrary `flex-[…]` whose grow component is non-zero.
- **Assert set equality** against a registry with exactly one row: `components/admin/showpage/ShowReviewModalSkeleton.tsx` → the `h-11 flex-1` Skeleton bar, justified per §1.1 item 7.
- A new occurrence fails the test naming the file and the class string; the fix is either a repair or a reviewed registry row.

Why set equality and not a "no matches" assertion: the legitimate case exists, so a bare ban would be permanently red, and a per-site suppression comment is the fail-open shape `#592` was about. The registry is one reviewable place.

The guard must **not** flag fixed-size childless elements (`size-5`, `h-px`, `w-6`): those always have extent and cannot produce the invisible seam. Scope is growable tokens only — stated so a reviewer does not read the omission as a hole.

## 7. Not in scope

- No new §12.4 error codes, no `lib/messages/catalog.ts` edits, no `pnpm gen:spec-codes` run. Nothing here surfaces a code to a user.
- No migrations, so `pnpm gen:schema-manifest` and the validation-project apply are N/A, and `validation-schema-parity` is unaffected.
- No change to `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708`), `COUNT_SECTIONS` (`components/admin/wizard/step3ReviewSections.tsx:697`), or `buildSheetDeepLink` behaviour — the count and link *placement* changes, their *derivation* does not.
- `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` unchanged (§1.1 item 7).
- `components/crew/sections/TravelSection.tsx:588` unchanged (§1.1 item 8).
- The three unmeasured pusher sites get `ml-auto` but **no new probe mount**. The §6 static guard is what closes the class repo-wide; adding three e2e mounts for surfaces with no observed defect is not paid for by this batch.

## 8. Transition inventory

The header has 3 pill states (flag / judgment / none) × 2 count states × 2 link states × 2 heading levels. Presence of each element follows **data**, not a user-driven state change, and the modal remounts per show (`key={showId}`), so no element animates in or out within one mounted header.

| Transition | Treatment |
| ---------- | --------- |
| none → flag pill | **instant — deliberate.** Matches the existing contract comment at `components/admin/wizard/step3ReviewSections.tsx:927` and `Step3ReviewModal.tsx:401` (the comment reads "instant / deliberate", noting that link presence follows data rather than a state transition). |
| none → judgment pill | instant — deliberate, same reason |
| flag ↔ judgment | instant — deliberate; mutually exclusive and data-derived (`components/admin/wizard/step3ReviewSections.tsx:871`) |
| count shown ↔ hidden | instant — deliberate; derived from `shouldShowSectionCount` |
| link present ↔ absent | instant — deliberate; existing ratified contract at `components/admin/wizard/step3ReviewSections.tsx:927` |
| sub ↔ top-level | not a transition — fixed per call site |
| Compound: pill appears while a re-sync mutates the count | instant on both; no animation to interleave, so no compound case exists |
| Hover/focus on the sheet link | `transition-colors duration-fast` on colour only — preserved from the current link |

No `AnimatePresence`, no ternary-rendered animated block is introduced. The one *layout* change that could be animated — the header growing 44px → 72.8px when a pill appears — is instant, because it only ever happens across a remount.

## 9. Tests

All layout assertions run in a real browser. jsdom computes no layout, and a class-presence assertion only restates the fix.

1. **Name line count + row height**, real browser, `ModalSectionChrome` at 320/375/430/1280 across the five §3.1.5 states. Assert the name occupies exactly **one** text line box in every state, header height 44px without a pill and 72.8px with one. Anti-tautology: derive the expected line count by measuring `Range.getClientRects()` on the name's own text node — **not** the heading's bounding box, which the 44px-hit-area link inflates and which reports "1 line" even when the text wraps. This exact mistake produced a wrong reading during spec measurement.
2. **Centring**, real browser: the name's text centre sits within the §3.1.5 tolerance of the row centre in each state, and the two link-less states match the common case rather than drifting +19px/+17px. Derive expected values from measured fixture geometry, never hardcoded — a fixture whose name is short enough not to crowd cannot demonstrate the fix.
3. **Touch target**: the sheet link's hit area is ≥44×44 despite its 20px box, asserted by geometry (including the `before:` pseudo-element overlay), not by class.
4. **Accessible name preserved**: the link's accessible name still resolves to `Open the source sheet for <label>` after the visible text is removed, and the heading's accessible name is the section name **without** the count.
5. **No pill ⇒ no wrapper**: assert the header emits exactly one child line when unflagged — guards §3.1.4's empty-wrapper trap.
6. **`empty:hidden` eyebrow**, real browser: on a stage-promoted ground leg the eyebrow contributes **zero** height to the `.tcol` stack, and on a labelled leg it contributes its normal height. Asserting geometry catches the `{" "}` regression that a class assertion cannot.
7. **Phantom-gap probes** re-run green with all four ledger rows deleted; the stale-row assertion proves the debt is actually repaid rather than re-ledgered.
8. **Archived-bucket probe** per §3.4, with the anchor captured live.
9. **Static guard** per §6, including a negative control: a fixture with a childless `flex-1` element is detected, and a fixed-size childless element is not.

## 10. Invariant checklist

- **Invariant 1 (TDD):** every task is failing test → minimal implementation → passing test → commit.
- **Invariant 5 (no raw codes in UI):** no user-visible copy changes except removing the words "In sheet"; no codes involved.
- **Invariant 8 (UI quality gate):** `components/**` and `DESIGN.md` are touched, so `/impeccable critique` **and** `/impeccable audit` both run on the diff before close-out, with findings and dispositions recorded. Pre-code mechanical sweep: em-dash ban in user-visible copy, apostrophe literals, 44px tap targets, canonical type/token classes.
- **Invariant 10 (mutation-surface telemetry):** no mutating route, action, or admin surface is added or changed. N/A.
- **Invariant 11 (worktree):** all work in `../FX-worktrees/section-header-rebuild`, branched off `origin/main`, with `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` completed before any test run.
- **`DESIGN.md`:** §7a gains (a) the centered-section-header pattern with its measured offsets, and (b) an explicit note that a childless *growable* element used as a right-pusher is replaced by `ml-auto` rather than hidden at a breakpoint — the decorative-hairline rule already there does not cover pushers, which is why five sites drifted.

## 11. Measurement method (reproducible)

So the plan can regenerate every number rather than trusting this document:

1. `node_modules/.bin/tsx tests/e2e/_step3ReviewModalHarness.tsx <out.json>` renders the real component tree to static markup outside Playwright's JSX transform. Requires `HASH_FOR_LOG_PEPPER` and `JWT_SIGNING_SECRET` in the environment or the harness throws at import (`lib/email/hashForLog.ts:9`).
2. Compile the real token CSS: prepend `@source "<harness.html>"` to a copy of `app/globals.css`, then `pnpm dlx @tailwindcss/cli@4.2.4`.
3. Serve over `node:http` and measure with `getBoundingClientRect` plus `Range.getClientRects()` for text line boxes.
4. **Set `box-sizing: content-box` on the width-pinned wrapper.** Tailwind's preflight sets `border-box` globally, so a padded wrapper measured at "335px" is really 319px of content. Every number in this spec's first draft was 16px narrow until this was fixed; the plan must not repeat it.
5. Header row content-box widths per viewport: 320→280, 360→320, 375→335, 390→350, 430→390, 1280→561.

## 12. Citations

| Claim | Location |
| ----- | -------- |
| `ModalSectionChrome` definition | `components/admin/wizard/step3ReviewSections.tsx:850` |
| header row today | `components/admin/wizard/step3ReviewSections.tsx:892` |
| childless spacer to delete | `components/admin/wizard/step3ReviewSections.tsx:916` |
| link-presence instant/deliberate contract | `components/admin/wizard/step3ReviewSections.tsx:927` |
| decorative hairline | `components/admin/wizard/step3ReviewSections.tsx:2150` |
| `COUNT_SECTIONS` | `components/admin/wizard/step3ReviewSections.tsx:697` |
| `shouldShowSectionCount` | `components/admin/wizard/step3ReviewSections.tsx:708` |
| `sub` / `judgment` derivation | `components/admin/wizard/step3ReviewSections.tsx:870-871` |
| `sheetHref` derivation | `components/admin/wizard/step3ReviewSections.tsx:884-888` |
| card-header icon-only sheet link (44px box) | `components/admin/wizard/Step3ReviewModal.tsx:403-412` |
| expanded hit-area idiom | `components/admin/HoverHelp.tsx:537` |
| `ml-auto` over `justify-between` | `components/admin/CompactAlertCard.tsx:138` |
| hairline breakpoint + `min-w` precedent | `components/admin/BulkIgnoreControls.tsx:202` |
| BellPanel pusher | `components/admin/BellPanel.tsx:323` |
| AdminNav pusher | `components/admin/nav/AdminNav.tsx:144` |
| OnboardingTopBar pusher | `components/admin/nav/OnboardingTopBar.tsx:67` |
| allowlisted Skeleton bar | `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` |
| TravelRow eyebrow | `components/crew/sections/TravelSection.tsx:121` |
| `label` typed `string` | `components/crew/sections/TravelSection.tsx:92` |
| stage-promoted empty label | `components/crew/sections/TravelSection.tsx:403` |
| flight eyebrow render gate | `components/crew/sections/TravelSection.tsx:572` |
| flight eyebrow (refuted sibling) | `components/crew/sections/TravelSection.tsx:588` |
| `dateRaw` type | `lib/crew/flightDisplay.ts:24` |
| structured segment always has `dateRaw` | `lib/crew/flightDisplay.ts:152` |
| `structured: false` when no date | `lib/crew/flightDisplay.ts:184` |
| show-modal phantom ledger | `tests/e2e/admin-layout-dimensions.spec.ts:500` |
| archived-bucket coverage boundary | `tests/e2e/admin-layout-dimensions.spec.ts:362-367` |
| live-captured anchor requirement | `tests/e2e/admin-layout-dimensions.spec.ts:370-376` |
| crew phantom ledger | `tests/e2e/crew-layout-dimensions.spec.ts:1037` |
| archived fixture | `supabase/seedWalkerFixtures.ts:117-123` |
| archived row testid | `components/admin/ArchivedShowRow.tsx:48` |
| harness env requirement | `lib/email/hashForLog.ts:9` |
| harness bootstrap pattern | `tests/e2e/step3-review-modal.layout.spec.ts:118-190` |
| `empty:hidden` idiom + zero-width sibling rule | `DESIGN.md` §7a |
