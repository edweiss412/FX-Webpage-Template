# Phase 1 — Shared-surface extraction (zero visible change)

Spec sections: §3.1, §3.2, §14.1. The wizard test suite is the behavior pin: `tests/components/admin/wizard/*` + `tests/components/step3*` pass UNMODIFIED (imports/type names may change only in Task 4's codemod commit).

Worktree: `/Users/ericweiss/FX-Webpage-Template-worktrees/consolidated-admin-show-page`. All paths relative to it. Run tests with `pnpm vitest run <path>`.

---

### Task 1: `sectionData.ts` — SectionCore + mode extensions

**Files:**
- Create: `components/admin/review/sectionData.ts`
- Test: `tests/components/admin/review/sectionData.test.ts`

**Interfaces (Produces):**
```ts
export type SectionCore = { /* exact fields: spec §3.2 code block — copy verbatim */ };
export type StagedSectionData = SectionCore & { mode: "staged"; pr: ParseResult; row: Step3Row; dfid: string; wizardSessionId: string };
export type PublishedSectionData = SectionCore & { mode: "published"; showId: string; slug: string; archived: boolean; published: boolean };
export type SectionData = StagedSectionData | PublishedSectionData;
export function isStaged(d: SectionData): d is StagedSectionData;
export function isPublished(d: SectionData): d is PublishedSectionData;
```
Field types come from existing imports used today by `step3ReviewSections.tsx:2952` (`ParseResult`, `Step3Row`, `CrewMemberRow`, `RoomRow`, `HotelReservationRow`, `PullSheetCase`, `ArchivedPullSheetTab`, `RunOfShow`, `ParseWarning`, `AdminAgendaItem`, `UseRawDecision`) — re-export from their current modules, do NOT redeclare shapes. `billing` is the 5-field object from spec §3.2; `rawUnrecognized` reuses the type feeding `RawUnrecognizedCallout` (`step3ReviewSections.tsx` export near `:1313` consumer, grep `RawUnrecognizedCallout` for the prop type); `sourceAnchors` reuses the type of `Step3Row["sourceAnchors"]`.

- [ ] **Step 1: failing test**
```ts
// tests/components/admin/review/sectionData.test.ts
import { describe, expect, it } from "vitest";
import { isPublished, isStaged, type SectionData } from "@/components/admin/review/sectionData";

const core = {
  title: "T", clientLabel: null, dates: null, venue: null, eventDetails: null,
  clientContact: null, contacts: [], ros: { days: [] } as never, agendaBaseline: [],
  hotels: [], transportation: null, rooms: [], diagrams: null, crewMembers: [],
  pullSheet: [], archivedPullSheetTabs: [],
  billing: { coiStatus: null, proposal: null, po: null, invoice: null, invoiceNotes: null },
  warnings: [], useRawDecisions: [], rawUnrecognized: null, sourceAnchors: {}, driveFileId: null,
};
// If `ros`'s minimal literal differs, build it from the real RunOfShow type — no `as never` in the final test.

describe("sectionData mode guards", () => {
  it("narrows published", () => {
    const d = { ...core, mode: "published", showId: "s", slug: "x", archived: false, published: true } as SectionData;
    expect(isPublished(d)).toBe(true);
    expect(isStaged(d)).toBe(false);
  });
  it("narrows staged", () => {
    const d = { ...core, mode: "staged", pr: {} as never, row: {} as never, dfid: "d", wizardSessionId: "w" } as SectionData;
    expect(isStaged(d)).toBe(true);
  });
});
```
- [ ] **Step 2:** `pnpm vitest run tests/components/admin/review/sectionData.test.ts` → FAIL (module not found)
- [ ] **Step 3:** implement `components/admin/review/sectionData.ts` per Interfaces block; guards are `d.mode === "staged"` / `"published"`.
- [ ] **Step 4:** rerun → PASS. `pnpm exec tsc --noEmit` clean.
- [ ] **Step 5:** commit `feat(admin): add SectionCore + mode-discriminated SectionData types`

---

### Task 2: Rewire section panels onto SectionCore

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (panel/render sites only; registry ids/labels/order unchanged)
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (header + RawUnrecognizedCallout + sourceAnchors sites)

**Consumes:** Task 1 types. **Produces:** every panel renders from `SectionCore` fields; staged-only reads live behind `isStaged(d)`.

Per-site rewiring table (spec §3.2 is canonical; verify each line still matches before editing — cheap `rg` pass, ~5 min):

| Site | Old | New |
| --- | --- | --- |
| `step3ReviewSections.tsx:3458` | `s.pr.show.venue` | `s.venue` |
| `:3466` | `s.pr.show.event_details` | `s.eventDetails` |
| `:3483,:3487,:3488` | `s.pr.show.client_contact` / `arr(s.pr.contacts)` | `s.clientContact` / `s.contacts` |
| `:3500` | `s.pr.show.dates` | `s.dates` |
| `:3515` | `s.row.agendaStateKey ?? s.dfid` | staged-only: `isStaged(s) ? (s.row.agendaStateKey ?? s.dfid) : ...` — Phase 1 keeps AgendaBreakdown staged-only; render the agenda section body via `isStaged(s)` and a `null` else-branch (Phase 2 Task 9 fills the published branch) |
| `:3536` | `s.pr.transportation` | `s.transportation` |
| `:3557,:3566` | `s.pr.diagrams` | `s.diagrams` |
| `:3598` | `<OpsBreakdown dfid={s.dfid} show={s.pr.show} />` | `<OpsBreakdown dfid={s.driveFileId} billing={s.billing} />` — change `OpsBreakdown` props from `show` to the 5-field `billing` object (`:1203-1207` rows read from it) |
| `Step3ReviewModal.tsx:831-833` | `data.pr.show.title \|\| data.row.driveFileName` etc. | `data.title` / `data.clientLabel` / `dateSummarySegments(data.dates)` — title fallback composition moves into the STAGED builder (Task 4) |
| `:838` | `data.row.lastFinalizeFailureCode` | `isStaged(data) ? data.row.lastFinalizeFailureCode : null` |
| `:1294` | `data.row.sourceAnchors ?? {}` | `data.sourceAnchors` |
| `:1313` | `data.pr?.raw_unrecognized` | `data.rawUnrecognized` |
| every `dfid={s.dfid}` in panel renders | staged-only field | `dfid={s.driveFileId}` where the child only builds sheet deep links (nullable-safe: `buildSheetDeepLink` callers already accept the modal's dfid; make prop `string \| null` and hide the link when null — matches spec §11 driveFileId guard) |

`SectionData` import in both files switches to `@/components/admin/review/sectionData` — but hold the tree-wide rename of OTHER files for Task 4's codemod.

- [ ] **Step 1 (pin):** `pnpm vitest run tests/components/admin/wizard tests/components/step3SheetCard.test.tsx tests/components/step3SheetCard.transitions.test.tsx` → PASS (baseline green, record count)
- [ ] **Step 2:** apply the table. Keep `SectionData` in `step3ReviewSections.tsx` as a re-export alias so untouched callers still compile this task.
- [ ] **Step 3:** update the two in-file builders/fixtures that construct `SectionData` for tests (`step3ReviewSections.test.tsx` fixtures construct via helpers — only helper internals change, not assertions).
- [ ] **Step 4:** rerun Step-1 command → PASS with same test count. `tsc --noEmit` clean.
- [ ] **Step 5:** commit `refactor(admin): section panels consume SectionCore fields`

---

### Task 3: Extract ShowReviewSurface; modal wraps it

**Files:**
- Create: `components/admin/review/ShowReviewSurface.tsx`
- Modify: `components/admin/wizard/Step3ReviewModal.tsx`

**Produces:**
```ts
export function ShowReviewSurface(props: {
  data: SectionData;
  scrollerRef: React.RefObject<HTMLElement | null>; // the scroll container the SHELL owns
  layout: "modal" | "page";       // modal: current <lg chip rail + ≥lg two-pane inside dialog; page: full-page two-pane
  renderSectionExtras?: (id: SectionId, d: SectionData) => React.ReactNode; // Phase 2 hook: per-section warning controls
  bottomSlot?: React.ReactNode;   // Phase 2 hook: RawUnrecognizedCallout + Changes section
}): JSX.Element;
```
What moves (from `Step3ReviewModal.tsx`): the side-rail nav, chip rail (twin navs), the pure scroll-spy rule (`:130-148` region) + its wiring effect + `handleNavClick` single-accessor (`:159-165` region), section panel column rendering via `step3Sections(d)` + `Step3SectionChromeContext`, `warningsBySection`/`deriveSectionStatuses` chips. What STAYS in the modal: dialog topology (scrim, `useDialogFocus`, Esc, body scroll lock, drag-to-dismiss, entrance hooks), result-bearing publish footer, freeze contract, header (title/deep-link/date segments).

- [ ] **Step 1 (pin):** same wizard suite command as Task 2 Step 1 → PASS baseline.
- [ ] **Step 2:** move the enumerated pieces into `ShowReviewSurface.tsx`; modal renders `<ShowReviewSurface data={data} scrollerRef={panelRef} layout="modal" />`. Preserve every `data-*` attribute, class string, and constant (SCROLL_SPY_OFFSET_PX etc.) byte-for-byte — geometry is test-pinned.
- [ ] **Step 3:** rerun wizard suite → PASS, same count, ZERO assertion edits. If any test needs an assertion change, the extraction changed behavior: fix the extraction, not the test.
- [ ] **Step 4:** `tsc --noEmit`, `pnpm lint` on touched files.
- [ ] **Step 5:** commit `refactor(admin): extract ShowReviewSurface from Step3ReviewModal`

---

### Task 4: Staged builder emits StagedSectionData + codemod commit

**Files:**
- Modify: `components/admin/wizard/Step3SheetCard.tsx` (the SectionData build site, `:16` comment + construction near `:602`)
- Modify (codemod): every remaining importer of the old `SectionData` path (`rg -l "from \"@/components/admin/wizard/step3ReviewSections\"" | xargs rg -l "SectionData"`)

- [ ] **Step 1:** extend the card's builder to add `mode: "staged"`, `driveFileId: dfid`, `title` (the `pr.show.title || row.driveFileName || dfid` composition from old modal `:831`), `clientLabel`, `dates`, `venue`, `eventDetails`, `clientContact`, `contacts`, `transportation`, `diagrams`, `billing` (from `pr.show.{coi_status,proposal,po,invoice,invoice_notes}`), `rawUnrecognized: pr.raw_unrecognized ?? null`, `sourceAnchors: row.sourceAnchors ?? {}`.
- [ ] **Step 2:** wizard suite → PASS unchanged.
- [ ] **Step 3:** commit `refactor(admin): Step3SheetCard builds StagedSectionData`
- [ ] **Step 4 (codemod commit):** mechanical import/type renames across remaining files (old alias removed from `step3ReviewSections.tsx`). `tsc --noEmit` + full `pnpm vitest run tests/components` green.
- [ ] **Step 5:** commit `refactor(admin): codemod SectionData imports to components/admin/review`

---

### Task 5: Phase-1 close-out

- [ ] **Step 1:** `tests/components/tiles/_metaSentinelHidingContract.test.ts` — update registry file paths if any panel moved files (contract semantics unchanged); run it.
- [ ] **Step 2:** re-run the two admin meta-tests (comment/format-fragile — standing lesson): `pnpm vitest run tests/admin/_metaInfraContract.test.ts tests/admin/_metaBoundedReads.test.ts` → PASS.
- [ ] **Step 3:** FULL gates: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm build` → all green. (Full suite, not scoped — shared-chokepoint lesson.)
- [ ] **Step 4:** grep proof: `rg "pg_advisory" --type ts -l` diff vs main = no new hits; `rg "/api/admin/onboarding" components/admin/review/` = zero.
- [ ] **Step 5:** commit `test(admin): phase-1 close-out — meta-test paths + gates` (only if files changed; otherwise no-op).

Phase-1 exit criteria: wizard suite unmodified & green; full gates green; zero visual change (no screenshot deltas — CI screenshot job will confirm; do NOT locally regenerate baselines).
