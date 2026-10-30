# Warning card fixes — Tasks 10-15: the reading, Accept, Accepted, the archived card, Save

Read 00-overview.md first. Task 14 is the transition-audit task; it pastes spec §14 and §14.1.

<!-- tasks: depth=2 red-contract -->

## Task 10 — Read-only "Sheet says / We read" comparison

<!-- task: red=`pnpm exec vitest run tests/components/UseRawControl.test.tsx` red-state=authored red-target=`components/admin/UseRawControl.tsx:439` why=`the disabled branch starting on this line renders only the DISABLED_REASON sentence, so the new inline guest split cases expecting a use-raw-reading grid with Sheet says and We read above that sentence fail until the branch renders the comparison` ac=AC-4 -->

What is red and why: the `disabled` branch shows one sentence; nothing shows what was read.

Claims AC-4 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/UseRawControl.tsx:380-394` (`warning` prop widens to `Pick<ParseWarning, "code" | "resolution" | "rawSnippet">`), `components/admin/UseRawControl.tsx:439-453` (comparison block, spec §5.3 markup)
- Modify: `tests/components/UseRawControl.test.tsx`

**Interfaces:** consumes Task 4 `sheetSaysText`, `weReadGuestsText`; Task 1 `readAs`. Testids `use-raw-reading`, `use-raw-sheet-says`, `use-raw-we-read` through the existing `tid()` suffixing.

- [ ] **Step 1: RED.** New `describe("inline guest split comparison (warning-card-fixes §5.3)")`:
  - From a real parse (a producing exit from `tests/parser/blocks/hotels.inlineGuestAmbiguity.test.ts`), cross-checked against the reservation, not the helper alone (strict-TS checked at plan time):

```tsx
import { expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { newAggregator } from "@/lib/parser/warnings";
import { UseRawControl } from "@/components/admin/UseRawControl";
import { sheetSaysText, weReadGuestsText } from "@/lib/admin/warningReadingDisplay";
import { premiseHolds } from "@/tests/_shared/premise";

const agg = newAggregator();
const hotels = parseHotels("| Hotel Reservations | Hyatt Regency Eric Weiss - 110525 |", "v2", agg);
const w = agg.warnings.find((x) => x.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS");
if (w === undefined) throw new Error("no inline guest split warning");
const reservation = hotels[0];
if (reservation === undefined) throw new Error("no reservation");
premiseHolds("the parse yields at least one name", reservation.names.length > 0);
const r = w.resolution;
if (r === undefined || r.resolvable !== false) throw new Error("expected the disabled variant");
const readAs: unknown = "readAs" in r ? r.readAs : undefined;

render(<UseRawControl warning={w} decision={undefined} onToggle={() => {}} site="list" />);
expect(screen.getByTestId("use-raw-sheet-says-list").textContent).toBe(sheetSaysText(w.rawSnippet));
const weRead = screen.getByTestId("use-raw-we-read-list").textContent ?? "";
expect(weRead).toBe(weReadGuestsText(readAs));
for (const name of reservation.names) expect(weRead).toContain(name);
```

  **Probe P-T10** (plan time, live tree, run from the worktree root; the cell parses to one reservation whose `names` is `["Hyatt Regency Eric Weiss"]`, with today's two-field resolution, so the We read line is `1 guest: Hyatt Regency Eric Weiss` once Tasks 1 and 4 land):

```sh
node --import tsx -e 'const {parseHotels}=require("./lib/parser/blocks/hotels.ts"),{newAggregator}=require("./lib/parser/warnings.ts");const a=newAggregator(),h=parseHotels("| Hotel Reservations | Hyatt Regency Eric Weiss - 110525 |","v2",a),w=a.warnings.find(x=>x.code==="HOTEL_GUEST_SPLIT_AMBIGUOUS");console.log(!!w,w.blockRef.index,JSON.stringify(h[0].names),JSON.stringify(w.resolution))'
```

```text
true 0 ["Hyatt Regency Eric Weiss"] {"resolvable":false,"reason":"raw-not-guest-scoped"}
```

  - Caps through the render path (`B-SHEET`, `B-NAMES`), literal expectations: a constructed `HOTEL_GUEST_SPLIT_AMBIGUOUS` (`resolution: { resolvable: false, reason: "raw-not-guest-scoped", readAs: { kind: "hotels", names: ["A","B","C","D","E","F","G"] } }`, `rawSnippet: "x".repeat(160) + "y"`) renders `use-raw-sheet-says-list` = `"x".repeat(160) + "…"` and `use-raw-we-read-list` = `7 guests: A, B, C, D, E, F, and 1 more`.
  - The comparison grid precedes the reason sentence in document order; the sentence still renders.
  - Legacy (no `readAs`): Sheet says renders, no `use-raw-we-read`. Blank `rawSnippet` and no `readAs`: no `use-raw-reading` at all.
  - `ROOM_HEADER_SPLIT_AMBIGUOUS` with `{ resolvable: false, reason: "empty-raw" }`: no comparison (L12).
  Failure modes: comparison on the wrong code; a blank raw cell rendered as an empty "Sheet says".
- [ ] **Step 2: GREEN.** Widen the prop (both boundaries already pass the full warning, `components/admin/UseRawControlBoundary.tsx:84-89`); render the block when `warning.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS"` and at least one of the two values is non-null.
- [ ] **Step 3: green.** Red command; `pnpm exec vitest run tests/components/admin/parsePanelComposition.test.tsx tests/admin/warningFixAffordance.test.tsx`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key whichever of the four `UseRawControl.tsx` rows of Task 4 the suites report (S1b, Task 10 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 4: commit** `feat(admin): show what the sheet says and what we read on the inline hotel split card`.

## Task 11 — Accept wording on judgment rows and bulk chips

<!-- task: red=`pnpm exec vitest run tests/components/admin/dataQualityWarningControls.test.tsx tests/components/admin/bulkIgnoreControls.test.tsx` red-state=authored red-target=`components/admin/DataQualityWarningControls.tsx:250` why=`the button label on this line is Ignore for every active row whatever its code, and the bulk chip text is Ignore for every group, so the new judgment-row cases expecting Accept, Accepting, Undo accept, the accepted announcements and the accept error copy fail until both components branch on isJudgmentCall` ac=AC-5 -->

What is red and why: labels, announcements and error copy do not depend on the code.

Claims AC-5 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/DataQualityWarningControls.tsx:116-121` (fail copy), `components/admin/DataQualityWarningControls.tsx:179` (announce), `components/admin/DataQualityWarningControls.tsx:247-253` (labels)
- Modify: `components/admin/BulkIgnoreControls.tsx:110` (fail), `components/admin/BulkIgnoreControls.tsx:135` (announce), `components/admin/BulkIgnoreControls.tsx:146` (partial), `components/admin/BulkIgnoreControls.tsx:173-178` (chip text and name)
- Modify: `tests/components/admin/dataQualityWarningControls.test.tsx`, `tests/components/admin/bulkIgnoreControls.test.tsx`

**Interfaces:** consumes Task 4 `isJudgmentCall`; bulk groups use `isAmbiguityCode(group.code)` (a bulk group is one active warn code). Every string is spec §6.2 verbatim; ASCII apostrophes in both files (D7). Partial-success for a judgment group: `Accepted ${ok} of ${n}. Refresh to see the rest.` (builder's call 2).

- [ ] **Step 1: RED.** In each suite, one table-driven case per (kind × mode × state) with a needs-look control row in the SAME test (differential): judgment active `Accept` / `Accepting…`, announce `Judgment call accepted.`, error `Couldn't accept that judgment call. Refresh and try again.`; judgment `mode="ignored"` `Undo accept` / `Undoing…`, announce `Judgment call restored.`, error `Couldn't undo that. Refresh and try again.`; needs-look unchanged; testids `dq-ignore-<id>` / `dq-unignore-<id>` unchanged for both kinds. Bulk: judgment group chip text `Accept` → `Are you sure?` → `Accepting…`, accessible names `Accept <n>` / `Are you sure? Accept <n>` / `Accepting…`, announce `1 accepted.` (group of 1), `2 accepted.` (group of 2), `3 accepted.` (group of 3), each a literal for its fixture size (`B-BULK`), fail `Couldn't accept those judgment calls. Refresh and try again.`, partial `Accepted 1 of 2. Refresh to see the rest.`; testid `dq-bulk-ignore-<code>` unchanged. `<n>` comes from the fixture group size.
- [ ] **Step 2: GREEN.** Branch each string on the row's kind.
- [ ] **Step 3: green.** Red command; `pnpm exec vitest run tests/components/admin/showpage/sectionWarningControls.test.tsx tests/components/admin/showpage/crewWarningAttachment.test.tsx tests/components/admin/dataQualityTransitionAudit.test.ts tests/styles/_metaEmDashCopy.test.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key tap-target `DataQualityWarningControls.tsx:239` (`tests/styles/tapTargetCensus.ts`, the main `<button>`) if reported (S1b, Task 11 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 4: commit** `feat(admin): say Accept, not Ignore, on judgment calls`.

## Task 12 — Accepted (N) disclosures on both surfaces

<!-- task: red=`pnpm exec vitest run tests/components/admin/acceptedDisclosure.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:3115` why=`ignoredItems on this line is the whole ignored partition, rendered as one Ignored disclosure, and the published extras read model.ignored by position in one list, so the new suite expecting judgment rows only under the accepted testids, each row carrying its own record's report id, fails until both surfaces split the partition at render` ac=AC-8 -->

What is red and why: one disclosure holds every dismissed row on each surface.

Claims AC-8 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:3083-3089` (split `ignoredItems`, its keys) and `components/admin/wizard/step3ReviewSections.tsx:3509-3604` (two `<details>`, spec §6.4)
- Modify: `components/admin/showpage/sectionWarningExtras.tsx:168` and `components/admin/showpage/sectionWarningExtras.tsx:283-317` (split the RECORDS, two `<details>`)
- Create: tests/components/admin/acceptedDisclosure.test.tsx
- Re-run (sweep S3): `tests/components/admin/showpage/sectionWarningControls.test.tsx`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`, consumers of `tests/helpers/publishedSurfaceProps.tsx`

**Interfaces:** new testids per spec §6.4 (`wizard-step3-card-${dfid}-accepted-warnings` / `-accepted-summary` / `-accepted-list`; `section-accepted-warnings-${id}` / `section-accepted-summary-${id}` / `section-accepted-list-${id}`). Summary text `Accepted (<n>)`. Partition by `isJudgmentCall` (Task 4).

- [ ] **Step 1: RED.** tests/components/admin/acceptedDisclosure.test.tsx (`// @vitest-environment jsdom`):
  - Wizard: `WarningsBreakdown` with a `dq` model whose `ignored` holds one needs-look and one judgment item (plus one active row): the Ignored list holds exactly the needs-look row, the Accepted list exactly the judgment row; the Accepted row's button reads `Undo accept`; DOM order Ignored then Accepted; with zero judgment ignored the Accepted disclosure is absent, with zero needs-look ignored the Ignored disclosure is absent, with both zero neither renders and the all-clean copy is unchanged; the two count CONSUMERS agree with an independently derived expectation: derive `expectedActive` from the fixture arrays (its active visible warn rows, here 1; never by calling `wizardPanelCount`), then assert (a) the rendered Sheet warnings heading count chip, read the way `headingCount()` reads it (`tests/components/admin/sheetWarningsPanel.test.tsx:296-306`), equals `expectedActive`, and (b) the warnings section's rail count, obtained by calling the `railCount` closure of the `id: "warnings"` entry in `step3Sections` (`components/admin/wizard/step3ReviewSections.tsx`, type at :4153) with the SAME `SectionData` the render used, equals `expectedActive`. Each fails if its consumer counts the accepted (or ignored) row as active, because the fixture's accepted and ignored rows make the wrong count `expectedActive + 1` or `+ 2`.

  **Probe P-T12** (plan time, live tree, run from the worktree root; the rail-count consumer on the same shape, 3 warn rows with 1 active and 2 ignored, returns 1 = `expectedActive` on today's tree (the split is display-only, so it must still return 1); set the other placeholder env values `tests/e2e/standalone.config.ts` sets if the import chain asks for them):

```sh
HASH_FOR_LOG_PEPPER=fxav-r41-test-pepper-32-chars-min-deterministic node --import tsx -e 'const {step3Sections:S}=require("./components/admin/wizard/step3ReviewSections.tsx"),{buildStagedSectionData:B}=require("./components/admin/review/sectionData.ts"),F=require("./tests/components/admin/wizard/_step3ReviewFixture.ts");const ws=[{severity:"warn",code:"UNKNOWN_FIELD",message:"m",blockRef:{kind:"crew",name:"A"},rawSnippet:"A | 1"},{severity:"warn",code:"UNKNOWN_FIELD",message:"m",blockRef:{kind:"crew",name:"B"},rawSnippet:"B | 2"},{severity:"warn",code:"CREW_COLUMN_POSITIONAL_FALLBACK",message:"m",blockRef:{kind:"crew"},rawSnippet:"C | 3"}];const pr=F.buildParseResult({warnings:ws}),row=F.stagedRow(pr);const d={...B({pr,row,dfid:"drive-abc-123",wizardSessionId:"s",crewMembers:pr.crewMembers,rooms:pr.rooms,hotels:pr.hotelReservations,pullSheet:[],archivedPullSheetTabs:[],pullSheetOverride:null,ros:{},warnings:ws,agendaBaseline:[],useRawDecisions:[]}),dq:{target:{kind:"staged",wizardSessionId:"s",driveFileId:"drive-abc-123"},model:{active:[{index:0,reportSurfaceId:"a"}],ignored:[{index:1,reportSurfaceId:"b"},{index:2,reportSurfaceId:"c"}]}}};const w=S(d).find(x=>x.id==="warnings");console.log("railCount",w.railCount(d,{routedWarningsRenderElsewhere:false}))'
```

```text
railCount 1
```
  - Published: `buildSectionWarningExtras` with `model.ignored = [needsLookA, judgmentJ, needsLookB]` (judgment between two needs-look, distinct `reportSurfaceId`s): each rendered row's `dq-unignore-<id>` uses ITS record's id; J under `section-accepted-list-<id>`, A and B under `section-ignored-list-<id>`; a section with only an accepted row still renders (empty-seam guard tests the union).
  Failure modes: report ids misaligned by the split; a disclosure rendering at 0; the heading or the rail counting an accepted or ignored row as active.
- [ ] **Step 2: GREEN.** Spec §6.4 for both surfaces, same classes as today's Ignored disclosure on each.
- [ ] **Step 3: green.** Red command and the re-run list; a re-run failure is repaired only where a judgment row was expected under Ignored (it moves to Accepted), each repair citing spec §6.4.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key the six `step3ReviewSections.tsx` rows and subtle `sectionWarningExtras.tsx:285`; ADD two `tests/styles/subtleInteractiveExemptions.ts` rows for the Accepted `<summary>` in `step3ReviewSections.tsx` and in `sectionWarningExtras.tsx`, each reason copied from its Ignored twin (spec §16.3) (S1b, Task 12 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 4: commit** `feat(admin): give accepted judgment calls their own disclosure`.

## Task 13 — The archived pull sheet card: one include button, row locks

<!-- task: red=`pnpm exec vitest run tests/components/admin/wizard/archivedTabWarningCard.test.tsx` red-state=authored red-target=`components/admin/wizard/archivedTabOffer.tsx:183` why=`the include button is inline in ArchivedTabOffer on this line with its own label and its own pending flag, so there is no extracted button, no shared label, no card body and no row lock, and the new suite expecting the Tab and Cases lines, Use this pull sheet on every placement and include and Ignore locking each other fails until the button is extracted and mounted on the card` ac=AC-6 -->

What is red and why: the archived card shows only the generic row; the include action lives only in `ArchivedTabOffer`; `DataQualityWarningControls` has no lock props.

Claims AC-6 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/wizard/archivedTabOffer.tsx:107-210` (export `ARCHIVED_TAB_INCLUDE_LABEL`, `ARCHIVED_TAB_INCLUDE_PENDING`, `ArchivedTabIncludeButton`, `ArchivedTabWarningActions`; `ArchivedTabOffer` renders its button through the extracted one and keeps its single `pending`)
- Modify: `components/admin/review/PublishedArchivedTabOffer.tsx:167-176` (label, pending text, sr suffix replaces `aria-label`)
- Modify: `components/admin/DataQualityWarningControls.tsx:24-62` (props `blocked`, `onRunningChange`), `components/admin/DataQualityWarningControls.tsx:150-151` (report running), the main button's `disabled`
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`WarningsBreakdown` props `archivedPullSheetTabs`, `pullSheetOverride` via the `isStaged(s)` spread at `components/admin/wizard/step3ReviewSections.tsx:5332-5344`; card body lines in the row-label slot; `ArchivedTabWarningActions` replaces the row's `DataQualityWarningControls` for `PULL_SHEET_ON_ARCHIVED_TAB`)
- Create: tests/components/admin/wizard/archivedTabWarningCard.test.tsx
- Modify: `tests/components/admin/wizard/archivedTabOffer.render.test.tsx:27`, `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx:166` and lines 218, 242, 259, 272, 286, `tests/components/admin/review/publishedArchivedTabOffer.test.tsx` (ten label assertions)
- Modify: `tests/e2e/_step3ReviewModalHarness.tsx`, tests/e2e/_warningCardLiveEntry.tsx (`?scenario=archived`), tests/e2e/warning-card-layout.spec.ts (include tap floor), `tests/e2e/standalone-baseline.json`

**Interfaces (typechecked at plan time):**

```ts
import type { ReactNode } from "react";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

export type ArchivedTabIncludeButtonProps = {
  dfid: string | null;
  wizardSessionId: string;
  tab: ArchivedPullSheetTab;
  plate: "tinted" | "surface";
  pending: boolean;
  onPendingChange: (next: boolean) => void;
  blocked?: boolean;
  onBeforeRefresh?: () => void;
  testId?: string;
};
export type ArchivedTabWarningActionsProps = {
  dfid: string;
  wizardSessionId: string;
  offeredTab: ArchivedPullSheetTab | null;
  includeTestId: string;
  onBeforeRefresh: () => void;
  jump: ReactNode; // null until Task 17
  renderControls: (lock: { blocked: boolean; onRunningChange: (running: boolean) => void }) => ReactNode;
};
// DataQualityWarningControls gains these two optional props:
export type DqLockProps = { blocked?: boolean; onRunningChange?: (running: boolean) => void };
```

`ArchivedTabWarningActions` owns `includePending` and `ignoreRunning`, renders the include button (when `offeredTab` is non-null), then `jump`, then `renderControls({ blocked: includePending, onRunningChange: setIgnoreRunning })`, and passes `blocked={ignoreRunning}` to the button: the §7.3 bullet order (builder's call 4). The include button is `plate="surface"` with `onBeforeRefresh={holdFocusInPanel}`. Report is never locked (E10).

- [ ] **Step 0: stub.** In `archivedTabOffer.tsx` export `ARCHIVED_TAB_INCLUDE_LABEL = ""` and `ARCHIVED_TAB_INCLUDE_PENDING = ""`, and `ArchivedTabIncludeButton` and `ArchivedTabWarningActions` with the Interfaces props, each declared `(props) => ReactElement | null` (the return type both keep after Step 2) and returning `null` (the documented wrong answers; `null` is assignable to that declared type). `DataQualityWarningControls` accepts `blocked` / `onRunningChange` in its props type and ignores them. Nothing mounts the stubs yet; the suite collects and fails on assertions.
- [ ] **Step 1: RED.** tests/components/admin/wizard/archivedTabWarningCard.test.tsx (`// @vitest-environment jsdom`; `vi.mock` of `next/navigation`, of `@/app/admin/onboarding/_actions/stagedWarningIgnore` as `tests/components/admin/dataQualityWarningControls.test.tsx:156` does, and one `fetch` spy that holds each POST in a controlled promise and records its URL and body: the staged `/api/admin/onboarding/pull-sheet-override` route for `ArchivedTabIncludeButton`, and the published `/api/admin/show/pull-sheet-override` route `PublishedArchivedTabOffer` posts to (`components/admin/review/PublishedArchivedTabOffer.tsx:59`); each case asserts the URL it expects, so a placement posting to the other surface's route fails). Fixture: a staged `WarningsBreakdown` with one `PULL_SHEET_ON_ARCHIVED_TAB` (`blockRef: { kind: "pull_sheet_archived_tab", name: "OLD GEAR" }`, `rawSnippet` the previews joined by ` | `), `archivedPullSheetTabs` holding the matching tab (four previews, one blank) and `pullSheetOverride: null`. Cases, one per spec §16.1 row:

  **Probe P-T13** (plan time, live tree, run from the worktree root; the fixture tab is offered with no override and not offered with one; the published offer posts to `/api/admin/show/pull-sheet-override`):

```sh
node --import tsx -e 'const {deriveArchivedOffers:d}=require("./components/admin/wizard/archivedTabOffer.tsx");const t={tabName:"OLD GEAR",headerPreviews:["AUDIO 1","VIDEO RACK","","LX 4"],fingerprint:"fp",included:false,contentChangedSinceAccept:false};console.log(JSON.stringify(d([t],true,null).offers.map(x=>x.tabName)),d([t],true,{tabName:"OTHER",fingerprint:"x"}).offers.length,require("fs").readFileSync("components/admin/review/PublishedArchivedTabOffer.tsx","utf8").includes("\"/api/admin/show/pull-sheet-override\""))'
```

```text
["OLD GEAR"] 0 true
```
  1. Lines (`B-CASES`, `B-PRESENCE`, `B-CHARS`), expectations literal, never `casePreviewsText`: the fixture tab's previews are `["AUDIO 1", "VIDEO RACK", "", "LX 4"]`, so `…-archived-tab` reads `Tab OLD GEAR` and `…-archived-cases` reads `Cases ‘AUDIO 1’, ‘VIDEO RACK’, ‘(no header text)’ and 1 more`; a three-preview tab `["AUDIO 1", "VIDEO RACK", ""]` reads `Cases ‘AUDIO 1’, ‘VIDEO RACK’, ‘(no header text)’`; a tab with `headerPreviews: []` and an empty `rawSnippet` renders no `…-archived-cases`; a one-preview tab whose preview is `"a".repeat(40) + "b"` reads `Cases ‘` + `"a".repeat(40)` + `…’`; with no matching tab, previews come from `rawSnippet` (`"AUDIO 1 | VIDEO RACK"` → `Cases ‘AUDIO 1’, ‘VIDEO RACK’`, L7).
  2. Include presence: present when the tab is in `deriveArchivedOffers(tabs, true, override).offers`; absent when `pullSheetOverride` is non-null; absent without `wizardSessionId`; a warning with no or blank `blockRef.name` renders no `Tab` line and no include; Report and Ignore still render in every case. (The jump between include and Report is Task 17's, asserted there.)
  3. Label on every placement: card, `ArchivedTabOffer` (Pack list), `ArchivedTabOffer showDismiss={false}` (Resolve box) and `PublishedArchivedTabOffer` render `ARCHIVED_TAB_INCLUDE_LABEL`, accessible name `Use this pull sheet from tab OLD GEAR` (`getByRole("button", { name })`), pending `ARCHIVED_TAB_INCLUDE_PENDING`; a blank tab name drops the suffix; and one literal pin of the two constants to spec §11's strings (`Use this pull sheet`, `Including…`), so the stub's empty strings cannot satisfy the comparisons above.
  4. POST body: the card's include body deep-equals `ArchivedTabOffer`'s for the same tab (both captured from the `fetch` spy).
  5. Shared pending in `ArchivedTabOffer` (regression guard, round-2 defect): hold the POST, click include, `Keep skipped` is disabled and clicking it does not dismiss; reject the POST, both re-enable and the error region shows `ARCHIVED_TAB_ERROR`'s text.
  6. Row lock, `it("§14.1 row lock: include and Ignore lock each other")`: hold the include POST → card Ignore disabled, Report enabled, an Ignore click calls `setStagedWarningIgnore` 0 times; release; hold the Ignore request → include disabled with its idle label, an include click issues no second `fetch`. Assert each held state's request count after an attempted click on the other control (N → G and G → N unreachable).
  7. `ArchivedTabIncludeButton` driven by props: `pending` true → disabled, `Including…`, click is a no-op; `blocked` true and `pending` false → disabled, idle label; `onPendingChange` called `true` then `false` on success and on failure; re-rendering with `pending={false}` mid-request re-enables it (it holds no flag).
  8. `DataQualityWarningControls`: `blocked` disables the main button only (Report enabled); `onRunningChange` called `true` at request start and `false` at end, success and failure; absent props change nothing (existing suite stays green).
  9. **§14.1 compound 2, `it("§14.1 c2: an archived Ignore success hands focus to the panel before the refresh")`:** through `ArchivedTabWarningActions` (its `renderControls` passes the row's `onBeforeRefresh`), click Ignore and resolve `setStagedWarningIgnore` with `{ ok: true, state: "ignored" }`; the `router.refresh` spy records `document.activeElement` when it is called, and that element carries `wizard-step3-card-<dfid>-warnings-focus-anchor`. Then re-render with the warning in `dq.model.ignored`: the card is gone from the active list and focus is still on the anchor. Fails on: the wrapper dropping `onBeforeRefresh`, or the refresh firing before the hand-off.
  10. **§14.1 compound 4, `it("§14.1 c4: Report stays usable during N and G and unmounts with the row")`:** hold the include POST (N), click `report-button-trigger`: `report-modal-textarea` appears (Report is not locked); resolve the POST as success, then re-render without the warning (the refresh): no `report-modal-textarea` remains in the document and `console.error` was never called. Repeat from G (Ignore request held, then resolved `ignored`, then the re-render moving the row to the Ignored list): same result. Fails on: Report locked during a write, or the modal surviving its row's unmount.
- [ ] **Step 2: GREEN.** Extract per spec §7.3 ("It owns no pending state", "Pending ownership, per placement"), add the lock props, mount on the card, thread the two staged props. `PublishedArchivedTabOffer` keeps its own POST, its `Skip` and its one `pending`.
- [ ] **Step 3: real-browser tap floor.** Add `archivedTabs` to the harness, `?scenario=archived` to the live entry, and one case to tests/e2e/warning-card-layout.spec.ts: the include button's rect height ≥ 44 at 375 and 1280. Regenerate the standalone baseline.
- [ ] **Step 4: repair label pins** (the three suites under Files) to the new label and name; nothing else in them changes.
- [ ] **Step 5: green.** Red command; `pnpm exec vitest run tests/components/admin/wizard/archivedTabOffer.render.test.tsx tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx tests/components/admin/review/publishedArchivedTabOffer.test.tsx tests/components/admin/dataQualityWarningControls.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/ci/_metaSpecRegistration.test.ts`; `pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/warning-card-layout.spec.ts tests/e2e/packlist-rescan-recovery.spec.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key the six `step3ReviewSections.tsx` rows and tap-target `DataQualityWarningControls.tsx:239`; ADD a row only if a scanner reports the include button as new and unprovable (S1b, Task 13 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 6: commit** `feat(onboarding): resolve the archived pull sheet from its own warning card`.

## Task 14 — Transition audit: the deferred reading choice

<!-- task: red=`pnpm exec vitest run tests/components/admin/useRawDraft.transitions.test.tsx` red-state=authored red-target=`components/admin/UseRawControl.tsx:552` why=`ChoiceRow onSelect on this line calls fire, which writes the reading the moment a row is tapped, and no provider, Save, Cancel or reconciliation exists, so every pair of the spec 14 inventory and every deferred-response sequence in the new suite fails until selection is a local draft and the action bar owns Save` ac=AC-5,AC-11 -->

What is red and why: selecting a reading writes immediately; there is no draft, no Save, no Cancel, no reconciliation.

Claims AC-5, AC-11 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Create: components/admin/useRawDraft.tsx (`"use client"`)
- Modify: `components/admin/UseRawControlBoundary.tsx:56-82` (its `onToggle` calls `callUseRawAction`, throws on `"failed"`, refreshes on `"ok"`)
- Modify: `components/admin/UseRawControl.tsx:300-373` (`ChoiceRow` takes a per-row `marker`), `components/admin/UseRawControl.tsx:380-607` (provider path: rows select through the draft, soft-disable while busy or `submitted !== null`, no in-control error, retry or `Saving…` inside a provider)
- Modify: `components/admin/DataQualityWarningControls.tsx:197-266` (inside a provider: one morphing main button, Cancel, hint, Save sequence)
- Create: tests/components/admin/useRawDraft.transitions.test.tsx

**Interfaces (components/admin/useRawDraft.tsx; typechecked at plan time):**

```ts
import type { ReactElement, ReactNode } from "react";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

export type UseRawSurface =
  | { surface: "show"; showId: string }
  | { surface: "wizard"; wizardSessionId: string; driveFileId: string };
export declare function callUseRawAction(surface: UseRawSurface, warning: ParseWarning, useRaw: boolean): Promise<"ok" | "failed">;
export type UseRawDraftValue = {
  persistedRaw: boolean;
  displayedRaw: boolean;   // submitted ?? draft ?? persistedRaw
  dirty: boolean;          // submitted === null && draft !== null
  submitted: boolean | null;
  busy: boolean;
  error: string | null;
  select: (useRaw: boolean) => void;          // rule 1
  cancel: () => void;                         // rule 6
  save: () => Promise<"ok" | "failed">;       // rules 2-3
  setBusy: (busy: boolean) => void;
  setError: (copy: string | null) => void;
};
export declare function UseRawDraftProvider(props: { warning: ParseWarning; decision: UseRawDecision | undefined; children: ReactNode } & UseRawSurface): ReactElement;
export declare function useUseRawDraft(): UseRawDraftValue | null;
export declare function offersReadingChoice(warning: ParseWarning, decision: UseRawDecision | undefined): boolean; // deriveUseRawControlState(w, decision, false) is one of the four radio states
```

The model is spec §6.3 exactly ("The reading model (exact)", rules 1-6); reconciliation uses the store-the-previous-prop pattern during render, never an effect, and keys on nothing but a change of `persistedRaw` (§6.3 rule 5; `router.refresh()` has no completion signal). The action-bar table, Cancel classes, hint id and error copy are spec §6.3 "Action bar" verbatim. Busy is the action bar's `running`, reported through `onRunningChange` (Task 13) to `setBusy`. The accept leg of rule 4 lives in `DataQualityWarningControls`: after `save()` resolves `"ok"`, if `mode === "active"` and the row is ignorable it runs today's accept request; on accept success announce `Reading saved. Judgment call accepted.` (§11, builder's call 5), `onBeforeRefresh?.()`, `router.refresh()`; on accept failure `router.refresh()` and show `Your reading is saved, but we couldn't accept the judgment call. Refresh and try again.`, main button `Accept` (retries accept only); not ignorable or `mode === "ignored"`: announce `Reading saved.`, `router.refresh()`.

**The inventory this task audits (spec §14, verbatim):**

| State | Definition | Displayed reading | Main button |
|---|---|---|---|
| **C** clean | `submitted === null && draft === null`, not busy | `P` | `Accept` / `Undo accept` |
| **D** dirty | `submitted === null && draft !== null`, not busy | `draft` | `Save` (+ Cancel, hint) |
| **S** saving | busy (a reading or accept request in flight) | `submitted ?? draft ?? P` | `Saving…` / `Accepting…` / `Undoing…`, disabled |
| **V** saved, not yet reconciled | `submitted !== null`, not busy | `submitted` | `Accept` (retry accept only) or `Undo accept` |
| **E** error | an error is shown, over D (failed Save), over V (accept failed after a saved reading), or over C (failed plain Accept) | as the underlying state | as the underlying state |

| Pair | Reachable as | Treatment |
|---|---|---|
| C → D | select the non-persisted reading (rule 1) | instant, local state |
| D → C | Cancel (rule 6); select the persisted reading (rule 1); reconciliation with `draft === P` (rule 5) | instant; Cancel moves focus to the main button |
| C → S | Accept | instant label swap `Accepting…` |
| S → C | plain Accept succeeds and the row stays (refresh keeps it) | instant |
| D → S | Save (rule 2) | instant label swap `Saving…`; radio rows and Cancel disabled |
| S → D | unreachable directly: a failed Save goes S → E (over D) | n/a |
| C → V | unreachable: `submitted` is only set from D | n/a |
| V → C | reconciliation clears `submitted` (rule 5) | instant; the displayed reading becomes `P`, which after a successful save equals `submitted` |
| D → V | only through S | n/a |
| V → D | unreachable: radio rows are soft-disabled while `submitted !== null` | n/a |
| S → V | reading request succeeds (rule 4) | instant; the acknowledged reading stays checked |
| V → S | Accept retry after a partial success | instant label swap `Accepting…` |
| C → E / D → E / V → E | only through S | n/a |
| S → E | any failure (rules 3 and 4) | instant; `role="alert"` paragraph appears |
| E → C | Cancel from E over D; selecting the persisted reading from E over D (rule 1); reconciliation from E over V | instant; error cleared by the next action |
| E → D | select the non-persisted reading from E over C (from E over D the only unchecked row is the persisted reading, so a select there returns to C by rule 1) | instant; error cleared |
| E → S | retry Save or Accept | instant |
| E → V | unreachable directly | n/a |

**And the archived row it re-asserts (spec §14.1, verbatim; built in Task 13):** states I idle, N include pending, G Ignore pending; Report enabled in all three.

| Pair | Reachable as | Treatment |
|---|---|---|
| I → N | include pressed | instant; include shows `Including…`, Ignore disabled |
| N → I | include ends: failure (error in the include's status region), or success (the existing code clears the flag in `finally` after requesting a refresh, `archivedTabOffer.tsx:129-137`) | instant |
| I → G | Ignore pressed | instant; Ignore shows `Ignoring…`, include disabled with its idle label |
| G → I | Ignore ends: failure (the existing `dq-error` alert) or success | instant |
| N → G | unreachable: Ignore is disabled during N | n/a |
| G → N | unreachable: include is disabled during G | n/a |

No state animates (spec §14, §14.2): every change is a text or presence swap, so the audit asserts presence and labels only, and no `prefers-reduced-motion` branch exists. Conditional blocks to enumerate in the audit (each asserted present or absent per state): the Cancel button, the `Not saved yet` hint, the `role="alert"` error paragraph, the in-control `Saving…` text (absent inside a provider), the in-control error and `Try again` (absent inside a provider), the `In use` / `Selected` markers, the pending-apply notes.

- [ ] **Step 0: stub.** Create components/admin/useRawDraft.tsx (`"use client"`) with every Interfaces export and the documented wrong answers: `callUseRawAction` resolves `"failed"`, `UseRawDraftProvider` renders its children unchanged (an element, so it compiles against its declared `ReactElement`), `useUseRawDraft` returns `null`, `offersReadingChoice` returns `false`. No component reads it yet, so every row still saves on tap and the suite fails on its assertions, not on an import. Strict-TS checked at plan time:

```tsx
"use client";
import type { ReactElement, ReactNode } from "react";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

export type UseRawSurface =
  | { surface: "show"; showId: string }
  | { surface: "wizard"; wizardSessionId: string; driveFileId: string };
export async function callUseRawAction(_surface: UseRawSurface, _warning: ParseWarning, _useRaw: boolean): Promise<"ok" | "failed"> {
  return "failed";
}
export function UseRawDraftProvider(props: { warning: ParseWarning; decision: UseRawDecision | undefined; children: ReactNode } & UseRawSurface): ReactElement {
  return <>{props.children}</>;
}
export type UseRawDraftValue = {
  persistedRaw: boolean;
  displayedRaw: boolean;
  dirty: boolean;
  submitted: boolean | null;
  busy: boolean;
  error: string | null;
  select: (useRaw: boolean) => void;
  cancel: () => void;
  save: () => Promise<"ok" | "failed">;
  setBusy: (busy: boolean) => void;
  setError: (copy: string | null) => void;
};
export function useUseRawDraft(): UseRawDraftValue | null {
  return null;
}
export function offersReadingChoice(_warning: ParseWarning, _decision: UseRawDecision | undefined): boolean {
  return false;
}
```

- [ ] **Step 1: RED.** tests/components/admin/useRawDraft.transitions.test.tsx (`// @vitest-environment jsdom`). Mount `UseRawDraftProvider` (wizard surface) around `UseRawControlBoundary` and `DataQualityWarningControls` (`mode="active"`, an ignorable `ROOM_HEADER_SPLIT_AMBIGUOUS` with a resolvable resolution, `ground="surface"`). `vi.mock` `@/app/admin/onboarding/_actions/useRawStaged` and `@/app/admin/onboarding/_actions/stagedWarningIgnore` with functions returning test-controlled promises; `vi.mock("next/navigation")` with a plain `refresh` spy (asserted called, never "completed"); re-render with a new `decision` prop to model a refresh landing. Cases:

  **Probe P-T14** (plan time, live tree, run from the worktree root; the fixture warning (`rawSnippet: "Ballroom A / B"`, resolvable) derives `transform-active`, `apply-pending`, `raw-active`, `clear-pending` for no decision, raw unapplied, raw applied, transform; it is ignorable, so Save takes the accept leg):

```sh
node --import tsx -e 'const {deriveUseRawControlState:f}=require("./components/admin/UseRawControl.tsx"),{hasIgnorableSnippet:h}=require("./lib/dataQuality/ignorableSnippet.ts");const w={code:"ROOM_HEADER_SPLIT_AMBIGUOUS",resolution:{resolvable:true,contentHash:"h",parsed:{kind:"rooms",name:"Ballroom",dimensions:null,floor:null},replacement:{kind:"rooms",name:"Ballroom A / B",dimensions:null,floor:null}}};console.log(f(w,undefined,false),f(w,{preference:"raw",applied:false},false),f(w,{preference:"raw",applied:true},false),f(w,{preference:"transform",applied:false},false),h({rawSnippet:"Ballroom A / B"}))'
```

```text
transform-active apply-pending raw-active clear-pending true
```
  - **States and pairs** (each its own `it("§14 pair <X> → <Y>")`, the state a pair enters asserted in that case): one case per reachable pair in the §14 table (reach it, assert the checked radio via `aria-checked`, the main button label, presence of `Not saved yet`, Cancel and the alert); one case per unreachable pair asserting the attempt changes nothing (S → D: a select while busy is ignored; V → D: rows `aria-disabled` while `submitted !== null`; C → V: `submitted` never set from C).
  - **Deferred-response probe**, each sequence its own `it("§14 seq <n>: <its §14 title>")`, sequences 1 to 7 and 13 of spec §14 (1 full success with delayed refresh; 2 accept fails after the reading saved; 3 retained rows: `mode="ignored"` announces `Reading saved.` and sends no accept request; 4 select back then an external save; 5 failed save, refresh equal to the draft, then an external revert; 6 refresh during D with no change to `P`; 7 select attempted during V; 13 refresh lands without moving `P`), asserting checked radio, main button label and `Not saved yet` presence after EACH step. Sequence 1 asserts the checked row is `r` after reading ok, after accept ok, and during the delayed refresh; 4 and 5 assert no `Save` after the external change; 13 asserts V (checked `r`, rows `aria-disabled`, no `Save`) after a re-render with an unchanged `persistedRaw`, then C on the next change.
  - **Rules (§16.1 "Deferred choice rules")**: select non-persisted calls no action (spy count 0); arrow keys move focus and select without calling; Save failure restores `draft` and shows `That didn’t save. The cell may have changed.` (apostrophe-agnostic match); Cancel moves focus to the main button; the hint's `id` equals the main button's `aria-describedby`; Report stays enabled while busy.
  - **§14 sequence 8, `it("§14 seq 8: the row unmounting during D or V writes nothing more")`:** reach D, unmount the row (re-render the parent without it, the re-scan shape), then flush timers and microtasks: both action spies keep their pre-unmount call counts (0 in D) and `console.error` is never called; repeat from V (after the reading request resolved, before any re-render with a new `decision`): the counts stay where V left them. Fails on: a cleanup that flushes the draft or retries an accept on unmount.
  - **§14 sequence 9, `it("§14 seq 9: opening Report during D keeps the draft")`:** reach D (raw row checked, `Save` and `Not saved yet` shown), click the real `report-button-trigger` (the `ReportButton` inside the action bar, as `tests/components/admin/dataQualityWarningControls.test.tsx:357` opens it), assert `report-modal-textarea` is present AND the raw row is still `aria-checked="true"` with `Save` and `Not saved yet` still shown; close the modal; still D. Fails on: a Report open that re-keys the row or clears provider state.
  - **§14 sequence 10, `it("§14 seq 10: closing the modal during S lets the in-flight request complete")`:** press Save (S, reading request held), unmount the whole tree, then resolve the reading promise: the use-raw spy was called exactly once, its promise settles with no unhandled rejection (vitest fails the run on one) and no `console.error`. What §14 does not decide, and this case therefore does not assert: whether the accept request starts after the tree is gone (spec ambiguity recorded in 00-overview.md). Fails on: an unmount that throws in the continuation or reports a state error.
  - **§14 sequence 12, `it("§14 seq 12: the pending-apply note follows persisted state only")`** (states checked against the round-5 oracle, 00-overview.md): with `decision = { preference: "raw", applied: false }` (`apply-pending`, so `persistedRaw` is true), select ours: D, ours checked, `Save` shown, and `use-raw-pending-note-list` still reads the apply-pending sentence (persisted, not the draft). Re-render with `decision = { preference: "raw", applied: true }` (`raw-active`): `persistedRaw` is still true, so this is NOT a reconciliation event and the row stays D (ours checked, `Save`, `Not saved yet`) while the note disappears, because the persisted state no longer has a pending apply. V half, on an Accepted-list row (`mode="ignored"`, so no accept leg): from the same `apply-pending` decision, select ours, Save, resolve the reading request: V (ours checked, rows `aria-disabled`) and the note still reads the apply-pending sentence; then re-render with `decision = { preference: "transform", applied: false }` (`clear-pending`, `persistedRaw` false): reconciliation clears `submitted`, the row is C with ours checked, and the note reads the reverting sentence. Fails on: a note derived from the draft or the displayed reading. (Clearing `decision` to undefined while in D would move `persistedRaw` to false, equal to the draft, and rule 5 would correctly return the row to C; that is why this case changes `applied` instead.)
  - **Provider absent:** the boundary alone still saves on tap (spy called once).
  - **§14.1 re-assertion** (each its own `it("§14.1 pair <X> → <Y>")` / `it("§14.1 c<n>: …")`): render the Task 13 card row (wizard surface: the staged-ignore mock above plus Task 13's `fetch` spy holding the staged `/api/admin/onboarding/pull-sheet-override` POST, asserted by URL) and assert each reachable pair, N → G and G → N refused, and compound transitions 1 and 3 (include success before refresh re-enables both controls; a second placement's POST is its own request).
- [ ] **Step 2: GREEN.** Build the provider and wire the two components per the Interfaces paragraph.
- [ ] **Step 3: green.** Red command; `pnpm exec vitest run tests/components/UseRawControl.test.tsx tests/components/admin/parsePanelComposition.test.tsx tests/components/admin/dataQualityWarningControls.test.tsx tests/components/admin/wizard/archivedTabWarningCard.test.tsx tests/styles/_metaEmDashCopy.test.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key the four `UseRawControl.tsx` rows and tap-target `DataQualityWarningControls.tsx:239`; ADD a row only if a scanner reports the Cancel button (S1b, Task 14 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 4: commit** `feat(admin): make a reading change wait for Save`.

## Task 15 — Mount the deferred choice on both surfaces; Save flow in a real browser

<!-- task: red=`pnpm exec vitest run tests/components/admin/deferredChoiceMount.test.tsx` red-state=authored red-target=`components/admin/showpage/sectionWarningExtras.tsx:123` why=`SectionWarningItemControls renders DataQualityWarningControls first on this line with no provider around it, and the wizard row renders its choice control with no provider either, so the new suite expecting no action on select, Save in the action bar, and the choice control before the controls on published fails until both surfaces mount UseRawDraftProvider` ac=AC-5 -->

What is red and why: neither surface mounts the provider, so production rows still save on tap.

Claims AC-5 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:3445-3497` (wrap the row's controls block in `UseRawDraftProvider` when `wizardSessionId && dfid && dq && isWarn && offersReadingChoice(w, decision)`)
- Modify: `components/admin/showpage/sectionWarningExtras.tsx:119-147` (`SectionWarningItemControls` wraps its fragment the same way and, for those rows only, renders the choice control BEFORE `DataQualityWarningControls`)
- Create: tests/components/admin/deferredChoiceMount.test.tsx
- Create: tests/e2e/warning-card-flows.spec.ts, tests/e2e/_warningCardActionStub.ts
- Modify: `tests/e2e/_step3ReviewModalBundle.mjs` (optional fourth argv: a JSON alias map passed as esbuild `alias`; absent → `{}`, a byte-identical bundle for every existing caller), tests/e2e/_warningCardLiveEntry.tsx (`?scenario=save`), `tests/e2e/standalone.config.ts:85` (`warning-card-flows`), `tests/e2e/standalone-baseline.json`

- [ ] **Step 1: RED (unit).** tests/components/admin/deferredChoiceMount.test.tsx (`// @vitest-environment jsdom`). Mocks per surface, never inherited across surfaces: the wizard cases mock `@/app/admin/onboarding/_actions/useRawStaged` and `@/app/admin/onboarding/_actions/stagedWarningIgnore`; the published cases mock `@/app/admin/show/[slug]/_actions/useRaw` (`setUseRawDecisionAction`, the action `components/admin/UseRawControlBoundary.tsx:69-77` routes `surface === "show"` to) with a controlled promise, and spy `fetch` for the published ignore and unignore routes (`/api/admin/show/<slug>/data-quality/{ignore,unignore}`, `components/admin/DataQualityWarningControls.tsx:124-133`). Wizard row with a resolvable `ROOM_HEADER_SPLIT_AMBIGUOUS` and a `dq` model: clicking the other reading calls the staged use-raw action 0 times and the row's main button reads `Save`; a non-judgment row is unchanged (no provider: its controls render exactly as before). Published active and Accepted-list cards: the choice control precedes `dq-controls` in document order for a use-raw row and follows it for none (other codes render no choice control); **§14 sequence 11, `it("§14 seq 11: a published bulk accept during D drops the unsaved draft")`:** render the published Rooms section through `buildSectionWarningExtras`, its model built by `buildSectionWarningModel` from two active `ROOM_HEADER_SPLIT_AMBIGUOUS` warnings with resolvable resolutions and the distinct `rawSnippet`s `"Ballroom A / B"` and `"Salon 1 / 2"` (a bulk group of 2, so `BulkIgnoreControls` shows `Accept 2`; Probe P-T15 below); put card A in D (raw row checked, `Save` shown); click the chip, confirm, resolve both data-quality `fetch` calls; re-render with both records moved to `model.ignored` (the refresh). Card A now sits in `section-accepted-list-rooms` showing the PERSISTED reading (ours checked), no `Save`, no `Not saved yet`, and `setUseRawDecisionAction` was called 0 times. Fails on: bulk accept persisting the draft, or the draft surviving into the Accepted list (L8). Save on an Accepted-list (published) row calls `setUseRawDecisionAction` exactly once, `fetch` for either data-quality route 0 times, `setStagedWarningIgnore` 0 times (neither ignore backend runs for an already-accepted row), and announces `Reading saved.`; the staged use-raw action is never called from a published card.

  **Probe P-T15** (plan time, live tree, run from the worktree root; two distinct-snippet room warnings make one bulk-eligible group of 2):

```sh
node --import tsx -e 'const {buildSectionWarningModel:b}=require("./lib/admin/sectionWarningModel.ts");const mk=s=>({severity:"warn",code:"ROOM_HEADER_SPLIT_AMBIGUOUS",message:"m",blockRef:{kind:"rooms"},rawSnippet:s});const m=b({slug:"s",warnings:[mk("Ballroom A / B"),mk("Salon 1 / 2")],ignoredFingerprints:new Set(),renderedSectionIds:new Set(["rooms","warnings"])});console.log(JSON.stringify(m.rooms.activeGroups.map(g=>({code:g.code,bulk:g.bulk&&g.bulk.items.length,items:g.items.length}))))'
```

```text
[{"code":"ROOM_HEADER_SPLIT_AMBIGUOUS","bulk":2,"items":2}]
```
- [ ] **Step 2: RED (real browser).** tests/e2e/_warningCardActionStub.ts exports `setStagedUseRawDecisionAction` and `setStagedWarningIgnore`, each resolving `window.__warningCardActions?.[name] ?? { ok: true }` (the ignore stub's default `{ ok: true, state: "ignored" }`), and recording calls on `window.__warningCardCalls`. The live entry's `save` scenario mounts the real `Step3ReviewModal` under its own `AppRouterContext.Provider` whose `refresh()` calls `window.__onRefresh`, which swaps harness state so the row's index moves from `dq.model.active` to `dq.model.ignored` and the decision persists. The spec bundles with `_step3ReviewModalBundle.mjs` and the alias map `{ "@/app/admin/onboarding/_actions/useRawStaged": <stub>, "@/app/admin/onboarding/_actions/stagedWarningIgnore": <stub> }` (plan-time probe: esbuild substitutes `@/` specifiers). One test: pick the other reading, assert `Save` and `Cancel` ≥ 44px tall by rect, press Save, wait for the row's testid to reach count 0 (detach-safe), assert `document.activeElement` carries `wizard-step3-card-${dfid}-warnings-focus-anchor` and `__warningCardCalls` holds exactly one use-raw call then one ignore call, in that order. Register `warning-card-flows`; regenerate the baseline.
- [ ] **Step 3: GREEN.** The two mounts.
- [ ] **Step 4: green.** Both red commands (`pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/warning-card-flows.spec.ts` for the browser one); `pnpm exec vitest run tests/components/admin/showpage/sectionWarningControls.test.tsx tests/components/admin/parsePanelComposition.test.tsx tests/components/admin/useRawDraft.transitions.test.tsx tests/components/admin/acceptedDisclosure.test.tsx tests/ci/_metaSpecRegistration.test.ts`; `pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/packlist-rescan-recovery.spec.ts` (the bundler change is byte-identical for them).
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key the six `step3ReviewSections.tsx` rows and subtle `sectionWarningExtras.tsx:285` (S1b, Task 15 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 5: commit** `feat(admin): mount the Save-gated reading choice on the wizard and the show page`.

<!-- tasks: end -->
