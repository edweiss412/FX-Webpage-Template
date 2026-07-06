# Wizard step-3 per-section deep-link anchors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the admin onboarding wizard step-3 review modal, make each per-section "In sheet" heading link open the source Google Sheet at that section's real cell range instead of INFO!A1, by threading the already-persisted `pending_syncs.source_anchors` to the client and using each section's region anchor.

**Architecture:** Two halves. (A) Data flow — add `source_anchors` to the `pending_syncs` SELECT in `fetchStep3Data`, coerce it defensively, thread it onto `Step3Row.sourceAnchors`. (B) Render — a new `SECTION_REGION_MAP` (SectionId→RegionId) + a `sourceAnchors` field on the section chrome context; the per-section heading link resolves its region's anchor and passes it to `buildSheetDeepLink`. Graceful degradation: any missing anchor falls back to `#gid=0` (today's behavior).

**Tech Stack:** Next.js 16 (React Server Component fetch + client modal), TypeScript (`exactOptionalPropertyTypes` ON), Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/step3-onboarding/2026-07-05-wizard-step3-deeplink-anchors.md`

## Global Constraints

- `exactOptionalPropertyTypes` is ON: optional fields are present-or-absent, never assigned `undefined`.
- Scope is ratified: **per-section heading links only**. The modal header link (`Step3ReviewModal.tsx:677`, testid `…-review-sheetlink`) and the agenda-error link (`step3ReviewSections.tsx:1851`) stay `#gid=0` — do NOT touch them.
- `buildSheetDeepLink(driveFileId, anchor?)` (`lib/sheet-links/buildSheetDeepLink.ts:9`) already returns `` `${base}#gid=0` `` when `anchor` is absent / title not allowlisted / `gid` non-number, and appends `&range=` only when `anchor.a1` is truthy. Do not re-implement its guards.
- TDD per task: failing test → run-fail → minimal impl → run-pass → commit. Conventional-commits (`fix(admin):` / `test(admin):`). One task per commit.
- Do NOT modify the crew route `app/show/[slug]/[shareToken]/page.tsx` — it already threads `sourceAnchors` and is the reference pattern.

## File structure

- **Modify** `lib/admin/step3SectionStatus.ts` — add exported `SECTION_REGION_MAP`. (Task 1)
- **Modify** `tests/admin/step3SectionStatus.test.ts` — completeness test. (Task 1)
- **Modify** `components/admin/wizard/Step3Review.tsx` — add `sourceAnchors?` to `Step3Row` (type at :78). (Task 2)
- **Modify** `components/admin/OnboardingWizard.tsx` — SELECT (:259), coerce (:~313), thread into `withParse` (:365). (Task 2)
- **Modify** `tests/components/onboardingWizard.fetchStep3.test.ts` — threading test. (Task 2)
- **Modify** `components/admin/wizard/step3ReviewSections.tsx` — `Step3SectionChrome` type (:278) + `ModalSectionChrome` link build (:419-421) + stale comment (:414-418). (Task 3)
- **Modify** `components/admin/wizard/Step3ReviewModal.tsx` — chrome provider value (:1037-1054). (Task 3)
- **Modify** `tests/components/admin/wizard/Step3ReviewModal.test.tsx` — anchored + fallback + regression tests. (Task 3)

---

### Task 1: `SECTION_REGION_MAP` (SectionId → RegionId)

**Files:**
- Modify: `lib/admin/step3SectionStatus.ts`
- Test: `tests/admin/step3SectionStatus.test.ts`

**Interfaces:**
- Consumes: `SectionId` (`lib/admin/step3SectionStatus.ts:3`), `RegionId` + `REGION_IDS` (`lib/sheet-links/buildSheetDeepLink.ts:28,44`).
- Produces: `export const SECTION_REGION_MAP: Record<SectionId, RegionId | null>` — Task 3 reads it.

- [ ] **Step 1: Write the failing test.** Append to `tests/admin/step3SectionStatus.test.ts`. This file already imports `type SectionId` from `@/lib/admin/step3SectionStatus` (`:14`), so add `SECTION_REGION_MAP` to that existing import (or a new import line); do NOT re-import `SectionId`. Add the `REGION_IDS` import:

```ts
// add SECTION_REGION_MAP to the existing "@/lib/admin/step3SectionStatus" import (SectionId already imported there)
import { SECTION_REGION_MAP } from "@/lib/admin/step3SectionStatus";
import { REGION_IDS } from "@/lib/sheet-links/buildSheetDeepLink";

// Canonical list of every SectionId — kept in lockstep with the union at
// step3SectionStatus.ts:3. If a SectionId is added without a SECTION_REGION_MAP
// entry, the completeness assertion below fails.
const ALL_SECTION_IDS: SectionId[] = [
  "venue", "event", "crew", "contacts", "schedule", "agenda", "hotels",
  "transport", "rooms", "diagrams", "packlist", "billing", "warnings", "report",
];

describe("SECTION_REGION_MAP", () => {
  test("maps every SectionId member", () => {
    for (const id of ALL_SECTION_IDS) {
      expect(Object.prototype.hasOwnProperty.call(SECTION_REGION_MAP, id)).toBe(true);
    }
    // No stray keys beyond the 14 SectionId members.
    expect(Object.keys(SECTION_REGION_MAP).sort()).toEqual([...ALL_SECTION_IDS].sort());
  });

  test("every non-null target is a real RegionId", () => {
    const regions = new Set<string>(REGION_IDS);
    for (const [id, region] of Object.entries(SECTION_REGION_MAP)) {
      if (region !== null) {
        expect(regions.has(region), `${id} → ${region}`).toBe(true);
      }
    }
  });

  test("content sections resolve to their primary region", () => {
    expect(SECTION_REGION_MAP.crew).toBe("crew");
    expect(SECTION_REGION_MAP.event).toBe("details"); // primary region (dress is a shared sub-block)
    expect(SECTION_REGION_MAP.schedule).toBe("schedule");
    expect(SECTION_REGION_MAP.agenda).toBe("schedule");
    expect(SECTION_REGION_MAP.transport).toBe("transportation");
    expect(SECTION_REGION_MAP.billing).toBe("financials");
    expect(SECTION_REGION_MAP.packlist).toBe("gear_packlist");
    // Non-region sections fall back to whole-sheet.
    expect(SECTION_REGION_MAP.diagrams).toBeNull();
    expect(SECTION_REGION_MAP.warnings).toBeNull();
    expect(SECTION_REGION_MAP.report).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `cd /Users/ericweiss/FX-Webpage-Template-wt/fix-wizard-step3-deeplink-anchors && pnpm vitest run tests/admin/step3SectionStatus.test.ts`
Expected: FAIL — `SECTION_REGION_MAP` is not exported.

- [ ] **Step 3: Write minimal implementation.** In `lib/admin/step3SectionStatus.ts`, add the import at top and the map after `KIND_TO_SECTION` (after line 42):

```ts
import type { RegionId } from "@/lib/sheet-links/buildSheetDeepLink";

// SectionId → the parser RegionId whose source_anchors range the section's
// "In sheet" heading link should target (bug #316 item 3). A wizard section is
// coarser than a region (KIND_TO_SECTION folds details/event_details/dress into
// `event`), so each section maps to its PRIMARY region; `null` = no single region
// → whole-sheet #gid=0 fallback (diagrams sub-block has no dfid; warnings spans the
// sheet; report is not a parsed region).
export const SECTION_REGION_MAP: Record<SectionId, RegionId | null> = {
  venue: "venue",
  event: "details",
  crew: "crew",
  contacts: "contacts",
  schedule: "schedule",
  agenda: "schedule",
  hotels: "hotels",
  transport: "transportation",
  rooms: "rooms",
  diagrams: null,
  packlist: "gear_packlist",
  billing: "financials",
  warnings: null,
  report: null,
};
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `cd /Users/ericweiss/FX-Webpage-Template-wt/fix-wizard-step3-deeplink-anchors && pnpm vitest run tests/admin/step3SectionStatus.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit.**

```bash
git add lib/admin/step3SectionStatus.ts tests/admin/step3SectionStatus.test.ts
git commit --no-verify -m "feat(admin): SECTION_REGION_MAP for wizard step-3 deep links"
```

---

### Task 2: Thread `source_anchors` → `Step3Row.sourceAnchors`

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (Step3Row type, :78-103)
- Modify: `components/admin/OnboardingWizard.tsx` (SELECT :259, coerce loop :~307-335, `withParse` :365)
- Test: `tests/components/onboardingWizard.fetchStep3.test.ts`

**Interfaces:**
- Consumes: `SourceAnchor` (`lib/sheet-links/buildSheetDeepLink.ts:3`).
- Produces: `Step3Row.sourceAnchors?: Record<string, SourceAnchor>` — an OPTIONAL field, threaded only inside the `if (staged)` clean-row branch (`OnboardingWizard.tsx:356-374`); base/non-staged rows carry no `sourceAnchors`. When threaded it is at least `{}` (never `undefined`, per `exactOptionalPropertyTypes`). Task 3 reads it via `SectionData.row.sourceAnchors` and MUST treat it as optional (`?? {}`).

- [ ] **Step 1a: Make the harness capture the SELECT column string.** The mock's
  `select` is a passthrough that ignores its argument (`onboardingWizard.fetchStep3.test.ts:44`),
  so a threading test alone CANNOT catch a forgotten `source_anchors` column in the
  production SELECT (the mock returns the whole seeded row regardless). Extend the harness
  to record the select string per table. In `tests/components/onboardingWizard.fetchStep3.test.ts`:

  (1) Add a capture bucket to the hoisted `seed` (`:21-23`):
```ts
const seed = vi.hoisted(() => ({
  dataByTable: {} as Record<string, unknown>,
  selectByTable: {} as Record<string, string>,
}));
```
  (2) Replace `builder.select = passthrough;` (`:44`) with a recorder:
```ts
    builder.select = (...args: unknown[]) => {
      if (typeof table === "string" && typeof args[0] === "string") {
        seed.selectByTable[table] = args[0];
      }
      return builder as AwaitableQuery;
    };
```
  (3) Reset it in `beforeEach` (`:85-89`), next to the `dataByTable` reset:
```ts
  seed.selectByTable = {};
```

- [ ] **Step 1b: Write the failing tests.** Add to `tests/components/onboardingWizard.fetchStep3.test.ts` a new describe mirroring the existing "parse_result threading" block (which seeds `dataByTable["pending_syncs"]` and asserts `row.parseResult`). The FIRST test pins the production SELECT string (fails if the column is missing even though the mock returns the row anyway):

```ts
  test("the pending_syncs SELECT requests the source_anchors column", async () => {
    seedManifest([{ drive_file_id: "dfid-1", name: "One.xlsx", status: "staged" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-1", drive_file_id: "dfid-1", parse_result: PARSE_RESULT_FIXTURE, source_anchors: ANCHORS },
    ];
    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    await fetchStep3Data(SESSION_ID);
    // Catches the "coercion/threading added but production SELECT column forgotten" gap:
    // the passthrough mock would otherwise return the row regardless of the projection.
    expect(seed.selectByTable["pending_syncs"]).toContain("source_anchors");
  });
```

```ts
describe("fetchStep3Data — source_anchors threading (bug #316 item 3)", () => {
  const ANCHORS = {
    crew: { title: "INFO", gid: 0, a1: "A25:E25" },
    schedule: { title: "AGENDA", gid: 1490737099, a1: "A1:X999" },
  };

  test("a staged row's Step3Row.sourceAnchors equals the seeded source_anchors object", async () => {
    // seedManifest FIRST — fetchStep3Data builds rows from manifestRows.map and only
    // joins pending_syncs by drive_file_id when a manifest row exists (a pending_syncs
    // row with no manifest row → the dfid is never in result.rows). This mirrors the
    // passing "parse_result threading" test at onboardingWizard.fetchStep3.test.ts:151.
    seedManifest([{ drive_file_id: "dfid-1", name: "One.xlsx", status: "staged" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-1", drive_file_id: "dfid-1", parse_result: PARSE_RESULT_FIXTURE, source_anchors: ANCHORS },
    ];
    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const stagedRow = result.rows.find((r) => r.driveFileId === "dfid-1");
    expect(stagedRow?.sourceAnchors).toEqual(ANCHORS);
  });

  test("a non-object source_anchors coerces to {} (defensive, mirrors parse_result guard)", async () => {
    seedManifest([{ drive_file_id: "dfid-1", name: "One.xlsx", status: "staged" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-1", drive_file_id: "dfid-1", parse_result: PARSE_RESULT_FIXTURE, source_anchors: "corrupt" },
    ];
    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const stagedRow = result.rows.find((r) => r.driveFileId === "dfid-1");
    expect(stagedRow?.sourceAnchors).toEqual({});
  });

  test("an APPLIED clean row also threads sourceAnchors (pending_syncs survives approval)", async () => {
    // isCleanReviewRow(status) covers BOTH 'staged' and 'applied' (OnboardingWizard.tsx:351-357):
    // a checked/applied card keeps its pending_syncs row, so its links must anchor too. A
    // status==='staged'-only implementation would regress applied cards to #gid=0.
    seedManifest([{ drive_file_id: "dfid-applied", name: "Applied.xlsx", status: "applied" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-a", drive_file_id: "dfid-applied", parse_result: PARSE_RESULT_FIXTURE, source_anchors: ANCHORS },
    ];
    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const appliedRow = result.rows.find((r) => r.driveFileId === "dfid-applied");
    expect(appliedRow?.sourceAnchors).toEqual(ANCHORS);
  });
});
```

> **Implementer note:** `seedManifest(...)` (test helper at `onboardingWizard.fetchStep3.test.ts:79`, writes `seed.dataByTable["onboarding_scan_manifest"]`) MUST be called before the `pending_syncs` seed — without a manifest row for the dfid, the row never appears in `result.rows`. No `app_settings` seed is needed (the harness stubs the query builder). `PARSE_RESULT_FIXTURE`, `seedManifest`, `seed`, and `SESSION_ID` already exist in this test file.

- [ ] **Step 2: Run test to verify it fails.**

Run: `cd /Users/ericweiss/FX-Webpage-Template-wt/fix-wizard-step3-deeplink-anchors && pnpm vitest run tests/components/onboardingWizard.fetchStep3.test.ts`
Expected: FAIL — `stagedRow.sourceAnchors` is `undefined` (column not selected/threaded).

- [ ] **Step 3a: Add the `Step3Row` field.** In `components/admin/wizard/Step3Review.tsx`, import `SourceAnchor` (with the other `@/lib/sheet-links/buildSheetDeepLink` imports if present, else add an `import type`) and add to the `Step3Row` type (after `lastFinalizeFailureCode`, before the closing `}` at :103):

```ts
  // Bug #316 item 3: per-region source-sheet deep-link anchors, coerced from the
  // pending_syncs.source_anchors jsonb in fetchStep3Data. Absent/malformed → `{}`.
  // Consumed by the step-3 modal's per-section "In sheet" heading links.
  sourceAnchors?: Record<string, SourceAnchor>;
```

- [ ] **Step 3b: Select + coerce + thread in `OnboardingWizard.tsx`.**

(1) Add `source_anchors` to the SELECT (:259):
```ts
        "staged_id, drive_file_id, staged_modified_time, parse_result, source_anchors, last_finalize_failure_code",
```

(2) Import `SourceAnchor` from `@/lib/sheet-links/buildSheetDeepLink` (add to existing imports).

(3) In the `stagedByDfid` map value type (the object literal type around :296-306), add:
```ts
      sourceAnchors: Record<string, SourceAnchor>;
```

(4) In the `for (const ps of pendingSyncsRows)` loop (near the `parseResult` coercion at :313-315), add the same-shaped guard and include it in the `stagedByDfid.set(...)` object (:327-335):
```ts
    const rawAnchors = ps.source_anchors;
    const sourceAnchors =
      rawAnchors !== null && typeof rawAnchors === "object"
        ? (rawAnchors as Record<string, SourceAnchor>)
        : {};
```
```ts
    stagedByDfid.set(driveFileId, {
      stagedId,
      title: parseResult?.show?.title ?? null,
      parseResult,
      sourceAnchors,
      adminAgendaPreview,
      agendaStateKey,
      lastFinalizeFailureCode: (ps.last_finalize_failure_code as string | null) ?? null,
    });
```

(5) Thread into the `withParse` object (:365-371):
```ts
        const withParse: Step3Row = {
          ...base,
          parseResult: staged.parseResult,
          sourceAnchors: staged.sourceAnchors,
          adminAgendaPreview: staged.adminAgendaPreview,
          agendaStateKey: staged.agendaStateKey,
          lastFinalizeFailureCode: staged.lastFinalizeFailureCode,
        };
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `cd /Users/ericweiss/FX-Webpage-Template-wt/fix-wizard-step3-deeplink-anchors && pnpm vitest run tests/components/onboardingWizard.fetchStep3.test.ts`
Expected: PASS (new describe) and the existing "parse_result threading" tests still PASS.

- [ ] **Step 5: Commit.**

```bash
git add components/admin/wizard/Step3Review.tsx components/admin/OnboardingWizard.tsx tests/components/onboardingWizard.fetchStep3.test.ts
git commit --no-verify -m "feat(admin): thread pending_syncs.source_anchors to Step3Row"
```

---

### Task 3: Use the region anchor at the per-section heading link

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`Step3SectionChrome` :278-322; `ModalSectionChrome` sheetHref :414-422)
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (chrome provider value :1037-1054)
- Test: `tests/components/admin/wizard/Step3ReviewModal.test.tsx`

**Interfaces:**
- Consumes: `SECTION_REGION_MAP` (Task 1), `Step3Row.sourceAnchors` (Task 2, via `SectionData.row`), `buildSheetDeepLink` + `SourceAnchor` (`lib/sheet-links/buildSheetDeepLink.ts`).
- Produces: per-section heading link `href = buildSheetDeepLink(dfid, sourceAnchors[SECTION_REGION_MAP[sectionId]])`.

- [ ] **Step 1: Write the failing tests.** Add to `tests/components/admin/wizard/Step3ReviewModal.test.tsx` (this file already imports `buildSheetDeepLink`, `step3Sections`, `DFID`, `stagedRow`, `sectionData`):

```ts
describe("Step3ReviewModal — per-section deep link anchors (bug #316 item 3)", () => {
  const CREW_ANCHOR = { title: "INFO", gid: 0, a1: "A25:E25" };
  const TRANSPORT_ANCHOR = { title: "INFO", gid: 0, a1: "A49:D61" };
  // sourceAnchors keyed by RegionId. `crew` + `transportation` present; `hotels` absent.
  // NOTE: `transportation` (not `transport`) is deliberate — it is the RegionId, while
  // `transport` is the SectionId. This pair PROVES SECTION_REGION_MAP is consulted: a
  // buggy `sourceAnchors[chrome.sectionId]` would look up `sourceAnchors["transport"]`
  // (undefined) and fall back to #gid=0, failing the transport assertion below.
  const ANCHORS = { crew: CREW_ANCHOR, transportation: TRANSPORT_ANCHOR };

  function withAnchors() {
    const pr = buildParseResult();
    return sectionData({}, { row: stagedRow(pr, { sourceAnchors: ANCHORS }) });
  }

  test("crew section link targets the crew region's range (derived from the fixture anchor)", () => {
    const d = withAnchors();
    const { q } = renderModal({ d });
    const link = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-sheetlink`) as HTMLAnchorElement;
    // Expected href DERIVED from the fixture anchor via the real builder — not hardcoded.
    expect(link.getAttribute("href")).toBe(buildSheetDeepLink(DFID, CREW_ANCHOR));
    // Concrete failure mode: the wizard passing NO anchor → href would be `${base}#gid=0`
    // with no range. Pin the range from the fixture so that bug fails this assertion.
    expect(link.getAttribute("href")).toContain("range=A25%3AE25");
    expect(link.getAttribute("href")).not.toBe(buildSheetDeepLink(DFID));
  });

  test("transport section (non-identity SectionId→RegionId) uses SECTION_REGION_MAP", () => {
    // transport → transportation: proves the map is consulted (not sourceAnchors[sectionId]).
    const d = withAnchors();
    const { q } = renderModal({ d });
    const link = q.getByTestId(`wizard-step3-card-${DFID}-section-transport-sheetlink`) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(buildSheetDeepLink(DFID, TRANSPORT_ANCHOR));
    expect(link.getAttribute("href")).toContain("range=A49%3AD61");
    // A `sourceAnchors[chrome.sectionId]` bug → sourceAnchors["transport"] undefined → #gid=0.
    expect(link.getAttribute("href")).not.toBe(buildSheetDeepLink(DFID));
  });

  test("a section whose region has no anchor falls back to #gid=0", () => {
    const d = withAnchors(); // `hotels` region absent from ANCHORS
    const { q } = renderModal({ d });
    const link = q.getByTestId(`wizard-step3-card-${DFID}-section-hotels-sheetlink`) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(buildSheetDeepLink(DFID)); // #gid=0 fallback
  });

  test("regression: the modal HEADER link stays whole-sheet (#gid=0) even with anchors present", () => {
    const d = withAnchors();
    const { q } = renderModal({ d });
    // tid() = `wizard-step3-card-${DFID}-review-sheetlink` (the header link, out of scope)
    const header = q.getByTestId(tid("sheetlink")) as HTMLAnchorElement;
    expect(header.getAttribute("href")).toBe(buildSheetDeepLink(DFID));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `cd /Users/ericweiss/FX-Webpage-Template-wt/fix-wizard-step3-deeplink-anchors && pnpm vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx -t "per-section deep link anchors"`
Expected: FAIL — the crew link href is `${base}#gid=0` (no anchor passed), so the `range=A25%3AE25` and `not.toBe(#gid=0)` assertions fail.

- [ ] **Step 3a: Add the chrome field.** In `components/admin/wizard/step3ReviewSections.tsx`, import `SourceAnchor` (with the existing `buildSheetDeepLink` import) and add to `Step3SectionChrome` (after `sectionId?` at :321):

```ts
  /**
   * Bug #316 item 3: the staged row's per-region source-sheet anchors
   * (`Step3Row.sourceAnchors`). The modal (sole provider) passes `row.sourceAnchors
   * ?? {}`; each section's heading link resolves its region via SECTION_REGION_MAP.
   * Optional/ABSENT in section-test provider mounts (exactOptionalPropertyTypes) →
   * lookup yields undefined → buildSheetDeepLink #gid=0 fallback.
   */
  sourceAnchors?: Record<string, SourceAnchor>;
```

- [ ] **Step 3b: Resolve the anchor at the link.** Replace the sheetHref block (:414-422) — import `SECTION_REGION_MAP` from `@/lib/admin/step3SectionStatus` — with:

```ts
  // Per-section "In sheet" deep link (bug #316 item 3): resolve the section's
  // parser region via SECTION_REGION_MAP and pass its persisted source_anchors
  // range to buildSheetDeepLink, so the link opens the sheet AT that section's
  // cells instead of INFO!A1. Absent anchor / null region / missing key →
  // buildSheetDeepLink falls back to `#gid=0` (whole first tab). Excluded: the
  // Diagrams sub-block (no dfid) and the "Report an issue" section (not a region).
  const sheetRegion =
    chrome.sectionId !== undefined ? SECTION_REGION_MAP[chrome.sectionId] : null;
  const sheetAnchor = sheetRegion ? chrome.sourceAnchors?.[sheetRegion] : undefined;
  const sheetHref =
    chrome.dfid && chrome.sectionId !== undefined && chrome.sectionId !== "report"
      ? buildSheetDeepLink(chrome.dfid, sheetAnchor)
      : null;
```

- [ ] **Step 3c: Provide anchors from the modal.** In `components/admin/wizard/Step3ReviewModal.tsx`, at the `Step3SectionChromeContext.Provider` value (:1037-1054, which already passes `sectionId: s.id`), add:

```ts
                    sourceAnchors: data.row.sourceAnchors ?? {},
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `cd /Users/ericweiss/FX-Webpage-Template-wt/fix-wizard-step3-deeplink-anchors && pnpm vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx`
Expected: PASS — new anchored/fallback/regression tests pass AND the existing "every sheet-backed section heading carries an 'In sheet' deep link" test (default fixture, no anchors → `#gid=0`) still passes.

- [ ] **Step 5: Commit.**

```bash
git add components/admin/wizard/step3ReviewSections.tsx components/admin/wizard/Step3ReviewModal.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx
git commit --no-verify -m "fix(admin): wizard step-3 per-section deep links target region ranges (#316)"
```

---

### Task 4: Full verification + invariant gates

**Files:** none (verification only).

- [ ] **Step 1: Typecheck.** `pnpm typecheck` — Expected: clean (catches any `exactOptionalPropertyTypes` violation from the new optional fields).
- [ ] **Step 2: Lint + format.** `pnpm lint && pnpm format:check` — Expected: clean (CI `quality` runs both; `--no-verify` commits skip the pre-commit prettier hook).
- [ ] **Step 3: Supabase call-boundary meta-test.** `pnpm vitest run tests/admin/_metaInfraContract.test.ts` — Expected: PASS. The SELECT edit adds a column to an existing `{data,error}`-destructured call; no new boundary. If the meta-test scans and flags it, add a registry row or an inline `// not-subject-to-meta:` per invariant 9 — but no change is expected.
- [ ] **Step 4: Full touched-area suite.** `pnpm vitest run tests/admin tests/components/admin/wizard tests/components/onboardingWizard.fetchStep3.test.ts` — Expected: all PASS.
- [ ] **Step 5: Full suite.** `pnpm test` — Expected: PASS (shared-chokepoint safety per the "full suite before push" rule).
- [ ] **Step 6: Invariant-8 impeccable dual-gate.** Run `/impeccable critique` and `/impeccable audit` on the diff (touches `components/admin/**`). The change is behaviorally-invisible (link `href` target only — no visual/DOM-shape change), so no HIGH/CRITICAL findings are expected; record dispositions. Any HIGH/CRITICAL is fixed or deferred via `DEFERRED.md` before the whole-diff cross-model review.
- [ ] **Step 7: No commit** (verification task). Any fixes from steps 1-6 are committed under their originating task's scope.

## Self-review (author)

- **Spec coverage:** §A (data flow) → Task 2; §B (map + render) → Tasks 1 & 3; guard conditions → Task 3 fallback test + Task 2 coercion test; testing (anti-tautology) → derived-from-fixture assertions in Tasks 1-3; invariants → Task 4. All spec sections covered.
- **Type consistency:** `SECTION_REGION_MAP` (Task 1) is `Record<SectionId, RegionId | null>`, consumed in Task 3 as `SECTION_REGION_MAP[chrome.sectionId]`. `Step3Row.sourceAnchors` (Task 2) `Record<string, SourceAnchor>`, read as `data.row.sourceAnchors` (Task 3). `Step3SectionChrome.sourceAnchors` matches. Consistent.
- **Placeholder scan:** none — every step carries real code + real run commands.
- **Meta-test inventory:** creates no structural meta-test; the `SECTION_REGION_MAP` completeness test is a targeted unit test (declared per the writing-plans rule). `_metaInfraContract` re-run in Task 4.
- **Anti-tautology:** Task 3's anchored test derives expected href from the fixture anchor via the real `buildSheetDeepLink`, and pins `range=A25%3AE25` from the fixture so the "no anchor passed" bug fails it; not self-satisfying (a broken impl → `#gid=0`, which the `not.toBe` + `toContain` assertions reject).
- **No layout/transition tasks:** the change has no visual/DOM-shape delta (link `href` only), so no fixed-dimension-parent layout task and no transition-audit task apply.
