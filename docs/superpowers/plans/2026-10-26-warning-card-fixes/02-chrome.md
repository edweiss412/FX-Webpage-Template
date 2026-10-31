# Warning card fixes — Tasks 6-9: card chrome and the two sheet-icon host rows

Read 00-overview.md first. Tasks 7 and 9 are the layout-dimensions tasks (one per host row); their real-browser DI assertions are their RED (00-overview.md, "Why the layout and transition-audit tasks are the implementing tasks").

<!-- tasks: depth=2 red-contract -->

## Task 6 — Sheet icon link: two new backdrops

<!-- task: red=`pnpm exec vitest run tests/components/admin/sheetIconLink.test.tsx` red-state=authored red-target=`components/admin/SheetIconLink.tsx:72` why=`BACKDROP_SKIN ends at the surface entry on this line, so ringOffset warning-bg and surface-sunken index no key and render an undefined token, and the two new set-equality cases expecting their full-literal variant tokens fail until the two entries exist` ac=AC-2 -->

What is red and why: `BACKDROP_SKIN` has only `bg` and `surface`; the new cases render `undefined` in the class string.

Claims AC-2 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/SheetIconLink.tsx:58-59` (`ringOffset` union), `components/admin/SheetIconLink.tsx:70-73` (`BACKDROP_SKIN`)
- Modify: `tests/components/admin/sheetIconLink.test.tsx:120-148`, `tests/styles/status-token-contrast.test.ts:392-401`

**Interfaces:**
- Produces: `ringOffset: "bg" | "surface" | "warning-bg" | "surface-sunken"`, the two new entries exactly as spec §3.6's table (`focus-visible:ring-offset-warning-bg hover:bg-surface active:bg-surface`; `focus-visible:ring-offset-surface-sunken hover:bg-surface active:bg-surface`). Consumed by Task 9 (`LINK_PLATE`).

- [ ] **Step 1: RED.** In `sheetIconLink.test.tsx`, extend the literal first (the component header requires it, `components/admin/SheetIconLink.tsx:40-41`): `WARNING_BG_VARIANT_TOKENS` and `SURFACE_SUNKEN_VARIANT_TOKENS`, two `it`s asserting `tokensOf(link)` equals base + each set. In `status-token-contrast.test.ts`'s "SheetIconLink wash contrast" describe, add per mode: `contrast(surface, warning-bg) >= WASH_STEP_FLOOR` and `contrast(surface, surface-sunken) >= WASH_STEP_FLOOR` with `const WASH_STEP_FLOOR = 1.08` (below every measured pair, min 1.092 dark sunken; above the 1.03 "invisible" measurement the component header cites), and `contrast(text, warning-bg) >= 4.5` for the resting glyph. Failure caught: a token edit that makes the press wash vanish. The contrast cases are green at authoring (tokens exist; plan-time measurement in 00-overview.md); the RED is the token set.
- [ ] **Step 2: GREEN.** Widen the union, add the two full-literal entries.
- [ ] **Step 3: green.** Red command, plus `pnpm exec vitest run tests/styles/status-token-contrast.test.ts tests/styles/noBareRingOffset.test.ts tests/components/admin/sheetIconLinkContainment.test.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key tap-target `SheetIconLink.tsx:91` (`tests/styles/tapTargetCensus.ts`, the `<a>`) (S1b, Task 6 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 4: commit** `feat(admin): give the sheet icon link amber and sunken backdrops`.

## Task 7 — Layout dimensions I: the wizard title row with the icon link and the tag

<!-- task: red=`pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/warning-card-layout.spec.ts` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:3302` why=`the wizard title row is this baseline-aligned span with no title-row testid, no SheetIconLink and no Judgment call tag, and the deep link sits in its own row further down, so every DI-1 to DI-11 measurement of the new spec finds no row, link or tag until the row is rebuilt per spec 3.5` ac=AC-1,AC-2,AC-11 -->

What is red and why: no title-row element, no icon link in it, no tag; the e2e cannot find what it measures.

Claims AC-1, AC-2, AC-11 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Create: components/admin/JudgmentCallTag.tsx (markup verbatim from spec §3.3)
- Modify: `components/admin/wizard/step3ReviewSections.tsx:3301-3315` (title row per spec §3.5), delete `components/admin/wizard/step3ReviewSections.tsx:3422-3439` (standalone link)
- Create: tests/e2e/warning-card-layout.spec.ts, tests/e2e/_warningCardLiveEntry.tsx, tests/components/admin/wizard/warningCardChrome.test.tsx
- Modify: `tests/e2e/_step3ReviewModalHarness.tsx` (export `warningCardHarnessWarnings()`), `tests/e2e/standalone.config.ts:85` (`warning-card-layout` joins the alternation), `tests/e2e/standalone-baseline.json` (regenerated)
- Modify: `tests/components/step3SheetCard.test.tsx:690` and lines 758, 766, 784, 1162, 1165 (`-open` → `-sheetlink`); `tests/components/admin/parsePanelComposition.test.tsx:103-105` (severity word); `tests/components/a11y/newTabAnnouncementBehavior.test.tsx` and `tests/parser/parseWarningDeepLinkRender.test.tsx` where they read the wizard text link; count rows in `tests/components/admin/sheetIconLinkContainment.test.ts` and `tests/styles/_metaNewTabAnnouncement.test.ts` for `step3ReviewSections.tsx`

**Interfaces:**
- Produces: `export function JudgmentCallTag(props: { plate: "surface" | "surface-sunken" | "warning-bg"; testId: string }): ReactElement` in components/admin/JudgmentCallTag.tsx, `TAG_BORDER` full literals (`surface`, `surface-sunken` → `border-text-faint`; `warning-bg` → `border-control-outline-tinted`). Consumed by Tasks 9 and 16.
- Produces: testids `wizard-step3-card-${dfid}-warning-${i}-title-row`, `…-sheetlink`, `…-judgment-tag` (spec §3.5, B7).

- [ ] **Step 1: stub.** Create components/admin/JudgmentCallTag.tsx with the Interfaces signature and an EMPTY element of the right root, so it compiles against `ReactElement` (a `null` return does not: TS2322) while every behavioral assertion stays red (no `Judgment call` text, no border token, no ring child). Nothing renders it until Step 4, so the suites below fail on assertions, never on an unresolved import. Strict-TS checked at plan time:

```tsx
import type { ReactElement } from "react";

export function JudgmentCallTag({ testId }: { plate: "surface" | "surface-sunken" | "warning-bg"; testId: string }): ReactElement {
  return <span data-testid={testId} />;
}
```

- [ ] **Step 2: RED (unit).** tests/components/admin/wizard/warningCardChrome.test.tsx (`// @vitest-environment jsdom`), rendering `WarningsBreakdown` the way `tests/components/admin/parsePanelComposition.test.tsx` does, with one needs-look (`UNKNOWN_FIELD`), one judgment (`CREW_COLUMN_POSITIONAL_FALLBACK`) and one info row, each with a `sourceCell`:
  - per row: the `…-title-row` exists and its LAST element child is the `…-sheetlink` anchor; the anchor's `aria-label` contains `stripEmphasis(title)`; no `…-open` testid anywhere;
  - the severity word: clone the row, remove the title node, assert the clone's text matches neither `/\bwarn\b/i` nor `/\binfo\b/i` (title removed so a title containing "info" cannot satisfy or break it);
  - sr-only prefix: needs-look row contains an `.sr-only` node with text `Needs a look: `, info row `Note: `, judgment row none;
  - tag: present only on the judgment row (`…-judgment-tag`), not focusable (`tabIndex` absent, not a button/link);
  - `JudgmentCallTag` class contract: for each plate the root's class tokens include `TAG_BORDER[plate]`'s token and not the others'; its ring child's class equals `attentionMarkClass("judgment", "sunken")`;
  - a row with no `sourceCell`: no `…-sheetlink`, and the title row's class tokens exclude `min-h-tap-min`.
- [ ] **Step 3: RED (real browser).** Harness, per the 00-overview.md checklist:
  - `warningCardHarnessWarnings()` in `_step3ReviewModalHarness.tsx` returns: needs-look `UNKNOWN_FIELD` with `sourceCell`; judgment `CREW_COLUMN_POSITIONAL_FALLBACK` with `sourceCell`; info row (severity `"info"`) with `sourceCell`; a link-less needs-look row; and a warn row with the unknown code `HARNESS_LONG_TITLE` and the 120-character prose `message` `("A long warning title that wraps ".repeat(4)).slice(0, 120)` with `sourceCell` (its title is the message, `lib/admin/reviewWarningTitle.ts:22-36`; an all-caps message would match the code-shape rule there and fall back to the 42-character generic title, which is why the fixture is prose). Export the fixture's row indices so the spec derives testids from them.

  **Probe P-T7** (plan time, live tree, run from the worktree root; the fixture anchor builds a link; the prose message titles at 120 characters while an all-caps one falls back to 42; the judgment row's catalog title):

```sh
node --import tsx -e 'const {reviewWarningTitle:t}=require("./lib/admin/reviewWarningTitle.ts"),{buildSheetDeepLink:b}=require("./lib/sheet-links/buildSheetDeepLink.ts");const long=("A long warning title that wraps ".repeat(4)).slice(0,120);console.log(b("drive-abc-123",{title:"INFO",gid:0,a1:"A5",scope:"cell"})!==null,t({severity:"warn",code:"HARNESS_LONG_TITLE",message:long}).length,t({severity:"warn",code:"HARNESS_LONG_TITLE",message:"L".repeat(120)}).length,JSON.stringify(t({severity:"warn",code:"CREW_COLUMN_POSITIONAL_FALLBACK",message:"m"})))'
```

```text
true 120 42 "Guessed crew table columns by position"
```
  - tests/e2e/_warningCardLiveEntry.tsx mounts the real `Step3ReviewModal` with `buildSectionData({ warnings: warningCardHarnessWarnings() })` under the harness's `AppRouterContext` stub (the props `modalElement` passes, `tests/e2e/_step3ReviewModalHarness.tsx:291`). Scenario chosen by `?scenario=` (only `layout` in this task).
  - tests/e2e/warning-card-layout.spec.ts: bundle with `node tests/e2e/_step3ReviewModalBundle.mjs <entry> <out> tsconfig.json`; `compileEntryCss` over `app/globals.css` with `@source` lines for `components/admin/wizard/step3ReviewSections.tsx`, components/admin/JudgmentCallTag.tsx, `components/admin/SheetIconLink.tsx`, `components/admin/review/attentionMark.ts`, `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/DataQualityWarningControls.tsx`, and the entry. Readiness gate and detach safety per the checklist. Before measuring each row, `scrollIntoView` it inside the modal scroller.
  - Assertions, the spec §13.1 table verbatim (tolerance 0.5px):

  | ID | Relationship | Guaranteed by | Assertion (px, tolerance 0.5) |
  |---|---|---|---|
  | DI-1 | row height ≥ 44 when the link renders | `min-h-tap-min` on the row (`--spacing-tap-min: 44px`, `app/globals.css:224`) | `row.height >= 44` |
  | DI-2 | row has no 44px floor when the link is absent | conditional class | link-less single-line row `height < 44` |
  | DI-3 | anchor box is 20×20 | `size-5` in `BASE_CLASSES` (`components/admin/SheetIconLink.tsx:76`) | `link.width === 20 && link.height === 20` |
  | DI-4 | anchor vertically centred in the row | `items-center` on the row | `(link.top - row.top) === (row.bottom - link.bottom)` |
  | DI-5 | vertical overlay contained | DI-1 + DI-4 | `link.top - 12 >= row.top` and `link.bottom + 12 <= row.bottom` |
  | DI-6 | heading-side clearance ≥ 10 | `gap-2.5` on the row | `link.left - cluster.right >= 10` |
  | DI-7 | trailing edge free: anchor is the row's last box | DOM order + cluster `flex-1` | `link.right === row.right` |
  | DI-8 | trailing overlay inside the panel's padding | panel `p-tile-pad` (`--spacing-tile-pad: 20px`, `app/globals.css:240`) ≥ 14 | `document.elementFromPoint(link.right + 13, link.top + 10)` is the anchor |
  | DI-9 | row spans the content column | `w-full` on the row | `row.width === column.width` |
  | DI-10 | a long title wraps inside the cluster, never under the link | `min-w-0 flex-1` on the cluster | at 320, 375 and 430 widths with a 120-character title: `cluster.right <= link.left - 10` and `link.top >= row.top` |
  | DI-11 | the tag never splits | `whitespace-nowrap shrink-0` | tag `height` equals its single-line height at every width |

  DI-1 to DI-9 run at 320, 375, 430, 640 and 1280 widths on the needs-look, judgment and info rows; DI-10 on the long-title row; DI-11's single-line height is measured once at 1280 and compared at every width. **Premise, per fixture row and per width, before any DI assertion:** the row rendered its link (and, for the judgment row, its tag), so three copies of one row cannot pass as three kinds; and a CSS premise that the panel's computed `padding-left` is `20px` (real `p-tile-pad`). "Is the anchor" means `hit === link || link.contains(hit)`. Plus one tap-floor case: the link row's 44px band contains the anchor's overlay (DI-5 already) and `elementFromPoint(link.left - 9, link.top + 10)` is the anchor.
  - Register: add `warning-card-layout` to `tests/e2e/standalone.config.ts:85`; run `node scripts/check-standalone-baseline.mjs --write`.
  Run the red command: every DI case fails (no title row testid).
- [ ] **Step 4: GREEN.** Implement `JudgmentCallTag`; rebuild the title row exactly as spec §3.5 (cluster: existing dot, sr-only prefix (`Needs a look: ` / `Note: `, none for judgment), title, tag), the uppercase word span deleted; delete the standalone link block. `isJudgment = isJudgmentCall(w)` (Task 4). No `className` on the link (containment guard).
- [ ] **Step 5: repair pins** listed under Files: `step3SheetCard.test.tsx` reads `…-sheetlink` with the same href assertions; `parsePanelComposition.test.tsx:103-105` asserts the sr prefix per row instead of the word; count rows move by exactly one `SheetIconLink` site added and one `NewTabHint` text link removed in `step3ReviewSections.tsx` (any other movement stops the task).
- [ ] **Step 6: green.** Both red commands; `pnpm exec vitest run tests/components/admin/wizard/warningCardChrome.test.tsx tests/components/step3SheetCard.test.tsx tests/components/admin/parsePanelComposition.test.tsx tests/components/a11y/newTabAnnouncementBehavior.test.tsx tests/parser/parseWarningDeepLinkRender.test.tsx tests/components/admin/sheetIconLinkContainment.test.ts tests/styles/_metaNewTabAnnouncement.test.ts tests/components/admin/attentionMarkParity.test.ts tests/components/admin/wizard/step3ReviewSections.test.tsx tests/ci/_metaSpecRegistration.test.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key the six `step3ReviewSections.tsx` rows the new imports and the rebuilt row shift: residue line 2500 (`tests/styles/_metaControlOutlineResidue.test.ts`, the PackCountPill `<span>`), control-outline line 4975 and line 5057 (`tests/styles/controlOutlineScan.ts`, two `<button>`s), subtle line 1692 and line 3511 (`tests/styles/subtleInteractiveExemptions.ts`, two `<summary>`s), tap-target line 4375 (`tests/styles/tapTargetCensus.ts`, the `<a>`) (S1b, Task 7 row). No count row moves. Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 7: commit** `feat(onboarding): put the sheet icon and the judgment tag in the wizard card title row`.

## Task 8 — Wizard row kinds: chip and dot per kind, DESIGN.md addendum

<!-- task: red=`pnpm exec vitest run tests/components/admin/wizard/warningCardChrome.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:3308` why=`the chip glyph on this line is a two-way warn or info ternary, so a judgment row still renders the warm triangle chip and the filled warm dot, and the new kind-matrix cases expecting the info-bg Circle chip and the hollow text-subtle dot fail until the row computes three kinds` ac=AC-1 -->

What is red and why: chip and dot are two-way (`isWarn`), so the judgment row looks like needs-a-look.

Claims AC-1 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:3290-3298` (chip), the dot inside the title-row cluster
- Modify: `DESIGN.md:558` (one addendum line under the PILLMARK-1 corollary, spec §3.3)
- Modify: tests/components/admin/wizard/warningCardChrome.test.tsx

**Interfaces:** none new; three kinds per spec §3.2 table.

- [ ] **Step 1: RED.** Add the kind matrix to the Task 7 suite: needs-look chip classes include `bg-warning-bg text-warning-text` and it contains the lucide `AlertTriangle` svg; judgment chip includes `bg-info-bg text-text-subtle` and contains lucide `Circle` (match the svg's `lucide-circle` class); info chip `bg-info-bg text-text-subtle` with `Info`. Dots: needs-look `bg-warning-text`; judgment tokens include `border-[1.5px] border-text-subtle bg-transparent` and exclude any `bg-warning-text`; info `bg-text-faint`. Failure caught: tag or ring on the wrong kind.
- [ ] **Step 2: GREEN.** Three-way chip and dot per spec §3.2; DESIGN.md addendum text: the card tag reuses the judgment ring on its own sunken fill, and the card's 6px severity dot is a separate vocabulary (filled warm = needs a look, hollow subtle = judgment, filled faint = info).
- [ ] **Step 3: green.** Red command; `pnpm exec vitest run tests/components/admin/attentionMarkParity.test.ts tests/styles/_metaEmDashCopy.test.ts`; `pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/warning-card-layout.spec.ts` (still green with the new chip).
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key whichever of the same six `step3ReviewSections.tsx` rows the suites report (S1b, Task 8 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 4: commit** `feat(onboarding): tell judgment calls apart by chip and dot on wizard cards`.

## Task 9 — Layout dimensions II: the compact card's icon link, the published adapters and the published tag

<!-- task: red=`pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/compact-alert-card-layout.spec.ts` red-state=authored red-target=`components/admin/CompactAlertCard.tsx:101` why=`the message row on this line renders glyph, message and help only, with no sheetLink slot and a fixed class string, so every DI-C1 to DI-C9 case of the extended spec finds no anchor in compact-alert-message until the shell renders SheetIconLink last in that row with the tap floor` ac=AC-1,AC-2,AC-11 -->

What is red and why: the shell has no `sheetLink` prop; the published cards still use a text link in the controls band.

Claims AC-1, AC-2, AC-11 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/CompactAlertCard.tsx:27-44` (prop), `components/admin/CompactAlertCard.tsx:101-114` (message row per spec §3.6)
- Modify: `components/admin/PerShowActionableWarnings.tsx:22-30` (header comment, R11), delete `linkOffsetClass` (`components/admin/PerShowActionableWarnings.tsx:165-168`) and the text link (`components/admin/PerShowActionableWarnings.tsx:457-466`); title wrapped with the tag (`components/admin/PerShowActionableWarnings.tsx:496-498`)
- Modify: `components/admin/NoteWarningCard.tsx:48-53` (comment), `components/admin/NoteWarningCard.tsx:86-96` (link → `sheetLink`, no `controlsBand`)
- Modify: `tests/e2e/_compactAlertCardLiveEntry.tsx`, `tests/e2e/compact-alert-card-layout.spec.ts` (new `@source` lines: `components/admin/SheetIconLink.tsx`, components/admin/JudgmentCallTag.tsx, `components/admin/review/attentionMark.ts`, `components/admin/NoteWarningCard.tsx`), `tests/e2e/standalone-baseline.json`
- Modify: `tests/components/admin/compactAlertCard.test.tsx`, `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/components/admin/sheetWarningsPanel.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`, `tests/components/healthAlertsPanel.test.tsx`, `tests/components/admin/review/attentionBanner.test.tsx`; count rows in `tests/components/admin/sheetIconLinkContainment.test.ts` and `tests/styles/_metaNewTabAnnouncement.test.ts`
- Regenerate: `tests/components/admin/__snapshots__/stagedCardBaseline.test.tsx.snap`

**Interfaces:**
- Produces: `CompactAlertCardProps.sheetLink?: { href: string; subjectLabel: string; testId: string } | null` and module-local `LINK_PLATE = { warning: "warning-bg", muted: "surface-sunken", neutral: "surface" } as const`. The `SheetIconLink` call site is in the shell only (B8), `className="ml-3 mr-0.5"`.
- Produces: testids `per-show-actionable-sheetlink`, `per-show-actionable-judgment-tag`, and `note-warning-sheet-link` moved onto the icon (B7).
- Consumes: Task 6 `ringOffset` keys; Task 7 `JudgmentCallTag`.

- [ ] **Step 1: RED (unit).** `compactAlertCard.test.tsx`: per tone, with `sheetLink` the anchor is the LAST child of `compact-alert-message`, its class tokens include the `LINK_PLATE[tone]` ring-offset token, and the row tokens include `min-h-tap-min`; without `sheetLink` (absent, and explicitly `null`) the row's `className` equals the literal `flex gap-2.5 p-3 pb-2.5` (DI-C2). `healthAlertsPanel.test.tsx` and `attentionBanner.test.tsx`: the rendered `compact-alert-message` `className` equals that literal. `perShowActionableRenderControls.test.tsx`: no text `Open in Sheet`, no `NewTabHint` text, `per-show-actionable-sheetlink` inside `compact-alert-message`, `compact-alert-controls-band` holds only the controls; judgment code shows `per-show-actionable-judgment-tag` with `border-control-outline-tinted` on `tone="warning"` and `border-text-faint` on `tone="muted"`, a needs-look code shows none. `sheetWarningsPanel.test.tsx`: a note card has the icon and no `compact-alert-controls-band`. A card whose `stripEmphasis(title)` is whitespace-only passes that as `subjectLabel` and its icon's `aria-label` contains no ` for ` (the component's no-subject phrasing, `components/admin/SheetIconLink.tsx:96-100`; asserted without quoting the phrase).
- [ ] **Step 2: RED (real browser).** Extend `_compactAlertCardLiveEntry.tsx` with a `di-c` section: `CompactAlertCard` with `sheetLink` in all three tones, each with and without a `helpTrigger` (`CompactAlertHelp`, as the existing entry builds it), at 120-character prose and one-word messages (the condensed `PerShowActionableWarnings` card takes its title from `reviewWarningTitle`, so its long fixture message is the same prose string as Task 7's, never an all-caps one: Probe P-T7 there); a `PerShowActionableWarnings condensed` card inside a `pl-6` wrapper (the crew under-row shape, `components/admin/showpage/sectionWarningExtras.tsx:52`). Columns at 320, 375, 430 and 1280 widths. Assertions, spec §13.2 verbatim:

  | ID | Relationship | Guaranteed by | Assertion (px, tolerance 0.5) |
  |---|---|---|---|
  | DI-C1 | row height ≥ 44 when `sheetLink` is present | `min-h-tap-min` added on that branch | `row.height >= 44` |
  | DI-C2 | row unchanged when `sheetLink` is absent | conditional class | the row's `className` equals today's literal `flex gap-2.5 p-3 pb-2.5` on `HealthAlertsPanel` and `AttentionBanner` renders |
  | DI-C3 | anchor box is 20×20 | `size-5` | `link.width === 20 && link.height === 20` |
  | DI-C4 | anchor sits at the content-box top, so its overlay starts at the row top | default stretch row + definite anchor height + `p-3` | `link.top - row.top === 12` |
  | DI-C5 | vertical overlay contained | DI-C1 + DI-C4 | `link.bottom + 12 <= row.bottom` |
  | DI-C6 | no overlap with the help trigger's hit area | `gap-2.5` + `ml-3` = 22 ≥ 11 + 10 | with a help trigger: `link.left - help.right >= 22`; hit test `elementFromPoint(help.right + 10, help.top + 11)` is the help button and `elementFromPoint(link.left - 9, link.top + 10)` is the anchor |
  | DI-C7 | heading-side clearance without a help trigger | same classes | `link.left - message.right >= 22` |
  | DI-C8 | trailing overlay ends at the card's inner edge | `mr-0.5` + `p-3` right = 14 | `row.right - link.right === 14`; `elementFromPoint(link.right + 13, link.top + 10)` is the anchor |
  | DI-C9 | the message still takes the slack | message `min-w-0 flex-1` | at 320 and 375 with a 120-character title, `message.right <= link.left - 22` and the anchor's top stays at DI-C4 |

  DI-C1 to DI-C9 on every tone × help presence × width cell and on the condensed card. **Premise per fixture before measuring:** the card root carries its tone's skin class (`bg-warning-bg`, `bg-surface-sunken`, `bg-surface`) and the help trigger is present or absent as the cell says. DI-C2 on the entry's existing `mount-attention-banner`. Regenerate the baseline (`node scripts/check-standalone-baseline.mjs --write`). Run the red command: the DI-C cases fail.
- [ ] **Step 3: GREEN.** Shell per spec §3.6 (code block there is the shape; the help wrapper stays `<div className="shrink-0">`). Adapters per spec §3.6 "Adapters": `PerShowActionableWarnings` passes `sheetLink={href ? { href, subjectLabel: stripEmphasis(title), testId: "per-show-actionable-sheetlink" } : null}` and its `controlsBand` becomes the controls cluster alone (today's no-link branch); the title span wraps per spec §3.4 with `JudgmentCallTag plate={tone === "warning" ? "warning-bg" : "surface-sunken"}` when `isJudgmentCall(w)` (Task 4). `NoteWarningCard` passes `sheetLink` and no `controlsBand`. Rename the local `sheetLink` ReactNode variables away (they no longer exist). Rewrite the two header comments to record R11 and the superseded ratifications (spec §3.6 last paragraph).
- [ ] **Step 4: repair pins and regenerate.** Update the listed tests that read the text link to read the icon. Regenerate `stagedCardBaseline` with `pnpm exec vitest run tests/components/admin/stagedCardBaseline.test.tsx -u` and confirm the snapshot diff is only the text link → icon swap (and the tag, if the fixture has a judgment code); anything else stops the task. Count rows: `PerShowActionableWarnings.tsx` and `NoteWarningCard.tsx` each lose one text link; `CompactAlertCard.tsx` gains one `SheetIconLink` call site.
- [ ] **Step 5: green.** Both red commands; `pnpm exec vitest run tests/components/admin/compactAlertCard.test.tsx tests/admin/perShowActionableRenderControls.test.tsx tests/components/admin/sheetWarningsPanel.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/a11y/newTabAnnouncementBehavior.test.tsx tests/components/healthAlertsPanel.test.tsx tests/components/admin/review/attentionBanner.test.tsx tests/components/admin/stagedCardBaseline.test.tsx tests/components/admin/sheetIconLinkContainment.test.ts tests/styles/_metaNewTabAnnouncement.test.ts tests/components/perShowActionableWarnings.candidateBand.test.tsx tests/ci/_metaSpecRegistration.test.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); DELETE the forced-colors row `site: "components/admin/PerShowActionableWarnings.tsx:458"` (its text link is gone); ADD `components/admin/CompactAlertCard.tsx` to the adopter set at `tests/components/admin/sheetIconLinkContainment.test.ts:2166` (S1b, Task 9 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 6: commit** `feat(admin): move the published cards' sheet link into the message row as an icon`.

<!-- tasks: end -->
