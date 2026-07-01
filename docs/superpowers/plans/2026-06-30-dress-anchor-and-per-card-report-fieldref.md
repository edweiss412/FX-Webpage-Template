# Dress-code deep-link fix + per-card report `fieldRef` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point the crew "Dress code" card's "In sheet" link at the DRESS block (not DETAILS), and let source-backed crew cards file bug reports stamped with `fieldRef = { cardId, region }`.

**Architecture:** Part A is a purely additive anchor-spec change (`buildSheetDeepLink.ts`): a new `dress` `header-block` region + repointing `CARD_REGION_MAP["today-dress"]`. Part B adds two crew primitives — a recessive client `CardReportTrigger` and a `CardHeaderActions` wrapper that renders the unchanged `SourceLink` plus the trigger — wired into all 23 source-backed card headers, with a preview-aware `cardReport` bundle computed once in `_CrewShell`.

**Tech Stack:** Next.js 16 App Router, React Server + Client Components, TypeScript, `xlsx` (SheetJS), Tailwind v4, Vitest (jsdom + node), Playwright (real-browser layout).

Spec: `docs/superpowers/specs/2026-06-30-dress-anchor-and-per-card-report-fieldref.md`.

## Global Constraints

- **TDD per task:** failing test → minimal impl → green → commit. One task per commit, conventional-commits (`feat(scope): …` / `test(scope): …`).
- **No raw error codes in UI** (invariant 5): reuse `ReportModal`; route all copy through the existing catalog. No new §12.4 code.
- **Invariant 8 (UI quality gate):** Part B touches `components/` + `app/` — run `/impeccable critique` AND `/impeccable audit` on the diff; HIGH/CRITICAL fixed or deferred via `DEFERRED.md` before close-out.
- **Tailwind v4 has no default `items-stretch`:** the card-header dimensional invariant is verified in a **real browser** (Playwright), not jsdom.
- **Anti-tautology:** DOM scans scoped to the card's own subtree; expected hrefs computed from `buildSheetDeepLink` (never string literals); expected dimensions derived from a measured baseline.
- **Meta-test inventory:** EXTENDS `tests/components/crew/sourceLinkCoverage.test.tsx` (adds report-trigger coverage assertion; `dress` becomes a referenced region → no-zombie-region contract still holds). N/A: advisory-lock topology, Supabase call-boundary, admin-alert catalog (no such surface touched). No DB migration (`source_anchors` is an existing `jsonb` column) → `validation-schema-parity` N/A.

---

## File structure

- `lib/sheet-links/buildSheetDeepLink.ts` — **modify**: add `"dress"` to `REGION_IDS`; add `dress` to `REGION_ANCHOR_SPEC`; repoint `CARD_REGION_MAP["today-dress"]`.
- `components/crew/primitives/CardReportTrigger.tsx` — **create** (client): recessive report button + `ReportModal` mount; exports `CardReportContext` type + `DEFAULT_CARD_REPORT`.
- `components/crew/primitives/CardHeaderActions.tsx` — **create** (server): renders `SourceLink` + `CardReportTrigger`.
- `components/crew/sections/{Today,Venue,Gear,Travel,Schedule,Budget,Crew}Section.tsx` — **modify**: swap `action={<SourceLink…/>}` → `action={<CardHeaderActions…/>}`; add optional `cardReport?: CardReportContext` prop (default `DEFAULT_CARD_REPORT`), forward to each `CardHeaderActions`.
- `app/show/[slug]/[shareToken]/_CrewShell.tsx` — **modify**: compute the `cardReport` bundle once in `renderOne` (crew vs admin-preview), pass to each section.
- `app/admin/dev/source-link-dim/page.tsx` — **modify**: add a third control card whose header `action` is a `CardHeaderActions` (for the real-browser layout spec).
- Tests: `tests/parser/sourceAnchorsCorpus.test.ts` (extend), `tests/components/crew/CardReportTrigger.test.tsx` (create), `tests/components/crew/CardHeaderActions.test.tsx` (create), `tests/components/crew/sourceLinkCoverage.test.tsx` (extend), `tests/reports/issueBody.test.ts` (extend), `tests/e2e/source-link-dimensional.spec.ts` (extend).

---

### Task 1: Part A — `dress` region + card-map repoint

**Files:**
- Modify: `lib/sheet-links/buildSheetDeepLink.ts`
- Test: `tests/parser/sourceAnchorsCorpus.test.ts`

**Interfaces:**
- Produces: `REGION_IDS` includes `"dress"`; `RegionId` union gains `"dress"`; `REGION_ANCHOR_SPEC.dress` (`header-block`, header `/^DRESS$/i`, terminators `BLOCK_TERMINATORS`); `CARD_REGION_MAP["today-dress"] === "dress"`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/parser/sourceAnchorsCorpus.test.ts` a `describe("dress region (deep-link fix)")` block. Build an INFO workbook with a DRESS block ABOVE a DETAILS block and assert the two anchors are distinct and correctly bounded. Derive expected rows from the fixture (anti-hardcode).

```ts
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";

describe("dress region (deep-link fix, spec §3)", () => {
  // INFO tab mirroring the live sheet shape: DRESS block, a blank row, then
  // later a DETAILS block. Row indices are 0-based in this array.
  const ROWS: unknown[][] = [
    ["CREW", "PHONE"], // 0
    ["Doug", "917"], // 1
    [], // 2  (blank ends CREW block)
    ["DRESS", "Set/Strike: Black Pants"], // 3  <- dress header row
    ["", "Show: Black Long Sleeve"], // 4  <- dress continuation
    [], // 5  (blank ends DRESS block)
    ["DETAILS"], // 6  <- details header row
    ["LED", "NO LED WALL"], // 7
    ["Stage Size", "8x24"], // 8
  ];
  const buf = makeWorkbookBuffer([{ name: "INFO", rows: ROWS }]);
  const titleToGid = new Map<string, number>([["INFO", 0]]);
  const anchors = extractSourceAnchors(buf, titleToGid);

  it("emits a dress anchor bounded to the DRESS rows (3-4), not the DETAILS rows", () => {
    expect(anchors.dress).toBeDefined();
    const r = XLSX.utils.decode_range(anchors.dress!.a1!);
    expect(r.s.r).toBe(3); // starts at DRESS header row
    expect(r.e.r).toBe(4); // ends at the continuation row (blank row 5 terminates)
  });

  it("keeps details anchored to the DETAILS block, disjoint from dress", () => {
    const d = XLSX.utils.decode_range(anchors.details!.a1!);
    expect(d.s.r).toBe(6); // DETAILS header
    expect(d.e.r).toBeGreaterThanOrEqual(8);
    const dress = XLSX.utils.decode_range(anchors.dress!.a1!);
    expect(dress.e.r).toBeLessThan(d.s.r); // dress fully above details
  });

  it("maps the today-dress card to the dress region (was details)", () => {
    expect(CARD_REGION_MAP["today-dress"]).toBe("dress");
    // details stays the region for the gear DETAILS-block cards
    expect(CARD_REGION_MAP["gear-keynote"]).toBe("details");
    expect(CARD_REGION_MAP["gear-opening-reel"]).toBe("details");
    expect(CARD_REGION_MAP["gear-tech-specs"]).toBe("details");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `cd /Users/ericweiss/fxav-dress-anchor && pnpm vitest run tests/parser/sourceAnchorsCorpus.test.ts` → FAIL (`anchors.dress` undefined; `CARD_REGION_MAP["today-dress"]` is `"details"`).

- [ ] **Step 3: Implement.** In `lib/sheet-links/buildSheetDeepLink.ts`:
  1. Add `"dress"` to the `REGION_IDS` array (place after `"details"`).
  2. Add to `REGION_ANCHOR_SPEC`:
     ```ts
     dress: {
       tabs: ["INFO"],
       strategy: "header-block",
       header: /^DRESS$/i,
       terminators: BLOCK_TERMINATORS,
     },
     ```
  3. Change `CARD_REGION_MAP["today-dress"]` from `"details"` to `"dress"`.

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/parser/sourceAnchorsCorpus.test.ts` → PASS. Also run the coverage walker to confirm no-zombie-region still holds: `pnpm vitest run tests/components/crew/sourceLinkCoverage.test.tsx` → PASS (dress is now referenced by today-dress; details still referenced by gear cards).

- [ ] **Step 5: Commit.** `git add -A && git commit --no-verify -m "fix(crew-page): anchor dress-code deep link to the DRESS block, not DETAILS (#207)"`

---

### Task 2: Part B — `CardReportTrigger` + `CardReportContext`

**Files:**
- Create: `components/crew/primitives/CardReportTrigger.tsx`
- Test: `tests/components/crew/CardReportTrigger.test.tsx`

**Interfaces:**
- Consumes: `ReportModal`, `ReportAutocapture`, `ReportSurface` from `@/components/shared/ReportModal`; `CardId`, `RegionId`, `CARD_REGION_MAP` from `@/lib/sheet-links/buildSheetDeepLink`.
- Produces:
  - `type CardReportContext = { surface: ReportSurface; surfaceIdScope: string; extraContext: ReportAutocapture }`.
  - `const DEFAULT_CARD_REPORT: CardReportContext = { surface: "crew", surfaceIdScope: "crew-card", extraContext: {} }`.
  - `function CardReportTrigger(props: { cardId: CardId; region: RegionId; showId: string; cardReport?: CardReportContext }): ReactNode`.

- [ ] **Step 1: Write the failing test** `tests/components/crew/CardReportTrigger.test.tsx`. Mirror the fetch-body pattern in `tests/components/report/ReportButton.test.tsx`.

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardReportTrigger } from "@/components/crew/primitives/CardReportTrigger";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, status: "created" }), { status: 201 }),
  );
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders a recessive report trigger with an accessible label", () => {
  render(<CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} />);
  const btn = screen.getByRole("button", { name: /report a problem with this card/i });
  expect(btn.getAttribute("data-slot")).toBe("card-report-trigger");
});

it("files a crew report stamped with fieldRef {cardId, region}", async () => {
  render(<CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} />);
  fireEvent.click(screen.getByTestId("card-report-trigger"));
  fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "wrong link" } });
  fireEvent.click(screen.getByTestId("report-modal-submit"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
  expect(body).toMatchObject({
    surface: "crew",
    show_id: SHOW_ID,
    fieldRef: { cardId: "today-dress", region: "dress" },
  });
});

it("honors an admin-preview cardReport: admin surface + crewPreview alongside fieldRef", async () => {
  const cardReport = {
    surface: "admin" as const,
    surfaceIdScope: "admin-preview-card",
    extraContext: { crewPreview: { crewMemberId: "c1", name: "Jo", role: "A1" } },
  };
  render(
    <CardReportTrigger cardId="venue-where" region="venue" showId={SHOW_ID} cardReport={cardReport} />,
  );
  fireEvent.click(screen.getByTestId("card-report-trigger"));
  fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "x" } });
  fireEvent.click(screen.getByTestId("report-modal-submit"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
  expect(body).toMatchObject({
    surface: "admin",
    fieldRef: { cardId: "venue-where", region: "venue" },
    crewPreview: { crewMemberId: "c1", name: "Jo", role: "A1" },
  });
});

it("scopes sessionStorage by surfaceIdScope + cardId + showId", () => {
  render(<CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} />);
  fireEvent.click(screen.getByTestId("card-report-trigger"));
  fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
  expect(
    JSON.parse(sessionStorage.getItem(`fxav-report-attempt-crew-card-today-dress-${SHOW_ID}`)!).draft,
  ).toBe("draft");
});

it("renders nothing when showId is empty (defense-in-depth)", () => {
  const { container } = render(<CardReportTrigger cardId="today-dress" region="dress" showId="" />);
  expect(container.querySelector('[data-slot="card-report-trigger"]')).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/components/crew/CardReportTrigger.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement** `components/crew/primitives/CardReportTrigger.tsx`:

```tsx
"use client";
import { useState, type ReactNode } from "react";
import {
  ReportModal,
  type ReportAutocapture,
  type ReportSurface,
} from "@/components/shared/ReportModal";
import type { CardId, RegionId } from "@/lib/sheet-links/buildSheetDeepLink";

export type CardReportContext = {
  surface: ReportSurface;
  surfaceIdScope: string;
  extraContext: ReportAutocapture;
};

export const DEFAULT_CARD_REPORT: CardReportContext = {
  surface: "crew",
  surfaceIdScope: "crew-card",
  extraContext: {},
};

/** Flag glyph — thin-stroke family matching SheetIcon; ~14px. */
function FlagIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V4M4 4h11l-2 4 2 4H4" />
    </svg>
  );
}

export function CardReportTrigger({
  cardId, region, showId, cardReport = DEFAULT_CARD_REPORT,
}: {
  cardId: CardId; region: RegionId; showId: string; cardReport?: CardReportContext;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!showId) return null; // defense-in-depth (mirrors Footer's showId guard)

  const surfaceId = `${cardReport.surfaceIdScope}-${cardId}-${showId}`;
  const autocapture: ReportAutocapture = {
    ...cardReport.extraContext,
    fieldRef: { cardId, region },
  };

  return (
    <>
      <button
        type="button"
        data-slot="card-report-trigger"
        data-testid="card-report-trigger"
        aria-label="Report a problem with this card"
        onClick={() => setOpen(true)}
        className="inline-flex h-fit shrink-0 items-center text-text-faint transition-colors hover:text-text-subtle focus-visible:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&_svg]:size-3.5 [&_svg]:opacity-70"
      >
        <FlagIcon />
      </button>
      {open ? (
        <ReportModal
          open={open}
          onOpenChange={setOpen}
          surface={cardReport.surface}
          surfaceId={surfaceId}
          showId={showId}
          autocapture={autocapture}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/components/crew/CardReportTrigger.test.tsx` → PASS.

- [ ] **Step 5: Commit.** `git add -A && git commit --no-verify -m "feat(crew-page): CardReportTrigger — per-card report with fieldRef autocapture"`

---

### Task 3: Part B — `CardHeaderActions` wrapper

**Files:**
- Create: `components/crew/primitives/CardHeaderActions.tsx`
- Test: `tests/components/crew/CardHeaderActions.test.tsx`

**Interfaces:**
- Consumes: `SourceLink`, `CardReportTrigger`, `CardReportContext`, `DEFAULT_CARD_REPORT`, `buildSheetDeepLink`, `CARD_REGION_MAP`, `CardId`, `SourceAnchor`.
- Produces: `function CardHeaderActions(props: { cardId: CardId; driveFileId: string | null; anchor?: SourceAnchor | null; showId: string; cardReport?: CardReportContext }): ReactNode`.

- [ ] **Step 1: Write the failing test** `tests/components/crew/CardHeaderActions.test.tsx`. Assert the **anchor is passed through verbatim** (the gear-scope non-regression at the primitive level) and both affordances render.

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { buildSheetDeepLink, type SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

afterEach(cleanup);
const DRIVE = "drive-1";

it("renders the SourceLink <a> with the EXACT passed-in anchor (not a CARD_REGION_MAP-derived one)", () => {
  // gear-scope passes a dynamic gear_scope anchor even though its region is `rooms`.
  const gearScope: SourceAnchor = { title: "GEAR", gid: 7, a1: "A1:D9" };
  const { container } = render(
    <CardHeaderActions cardId="gear-scope-audio" driveFileId={DRIVE} anchor={gearScope} showId="s1" />,
  );
  const a = container.querySelector('a[data-slot="source-link"]')!;
  expect(a.getAttribute("href")).toBe(buildSheetDeepLink(DRIVE, gearScope));
});

it("renders both the source link and the report trigger in the cluster", () => {
  const { container } = render(
    <CardHeaderActions cardId="today-dress" driveFileId={DRIVE}
      anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }} showId="s1" />,
  );
  expect(container.querySelector('[data-slot="source-link"]')).not.toBeNull();
  expect(container.querySelector('[data-slot="card-report-trigger"]')).not.toBeNull();
});

it("still renders the report trigger when there is no source sheet (SourceLink null)", () => {
  const { container } = render(
    <CardHeaderActions cardId="today-dress" driveFileId={null} anchor={null} showId="s1" />,
  );
  expect(container.querySelector('[data-slot="source-link"]')).toBeNull();
  expect(container.querySelector('[data-slot="card-report-trigger"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/components/crew/CardHeaderActions.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement** `components/crew/primitives/CardHeaderActions.tsx`:

```tsx
import type { ReactNode } from "react";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import {
  CardReportTrigger,
  DEFAULT_CARD_REPORT,
  type CardReportContext,
} from "@/components/crew/primitives/CardReportTrigger";
import {
  CARD_REGION_MAP,
  type CardId,
  type SourceAnchor,
} from "@/lib/sheet-links/buildSheetDeepLink";

export function CardHeaderActions({
  cardId, driveFileId, anchor, showId, cardReport = DEFAULT_CARD_REPORT,
}: {
  cardId: CardId;
  driveFileId: string | null;
  anchor?: SourceAnchor | null;
  showId: string;
  cardReport?: CardReportContext;
}): ReactNode {
  const region = CARD_REGION_MAP[cardId];
  return (
    <span data-slot="card-header-actions" className="inline-flex h-fit shrink-0 items-center gap-2">
      <SourceLink driveFileId={driveFileId} anchor={anchor} />
      <CardReportTrigger cardId={cardId} region={region} showId={showId} cardReport={cardReport} />
    </span>
  );
}
```

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/components/crew/CardHeaderActions.test.tsx` → PASS.

- [ ] **Step 5: Commit.** `git add -A && git commit --no-verify -m "feat(crew-page): CardHeaderActions — SourceLink + report trigger cluster"`

---

### Task 4: Part B — wire all 23 card headers + thread `cardReport` through sections

**Files:**
- Modify: `components/crew/sections/{Today,Venue,Gear,Travel,Schedule,Budget,Crew}Section.tsx`
- Test: `tests/components/crew/sourceLinkCoverage.test.tsx`

**Interfaces:**
- Consumes: `CardHeaderActions`, `CardReportContext`, `DEFAULT_CARD_REPORT`.
- Produces: every `*SectionProps` gains `cardReport?: CardReportContext`; every source-backed card header renders `CardHeaderActions` (anchor expression copied verbatim from the old `SourceLink`).

- [ ] **Step 1: Write the failing test** — extend `sourceLinkCoverage.test.tsx` with assertion (d): every in-scope card exposes a `card-report-trigger` in its header subtree; OUT_OF_SCOPE cards do not. Add inside the existing walker `describe`, scoping every query to the card's own `[data-card-id]` element (anti-tautology).

Note: the walker's existing render helper is `renderAllSections(data: ShowForViewer)` (`sourceLinkCoverage.test.tsx:187`); reuse the same fully-populated `data` fixture the file already builds (its `data.sourceAnchors` = `fullSourceAnchors()`, which assigns a distinct anchor to EVERY `REGION_ID` including `gear_scope`).

```tsx
it("(d) every source-backed card exposes a report trigger; out-of-scope cards do not", () => {
  const { container } = renderAllSections(data); // `data` = the file's populated fixture
  container.querySelectorAll("[data-card-id]").forEach((cardEl) => {
    const id = cardEl.getAttribute("data-card-id")!;
    const hasTrigger = cardEl.querySelector('[data-slot="card-report-trigger"]') !== null;
    if ((CARD_REGION_MAP as Record<string, string>)[id]) {
      expect(hasTrigger, `${id} (source-backed) must expose a report trigger`).toBe(true);
    } else if ((OUT_OF_SCOPE_CARDS as readonly string[]).includes(id)) {
      expect(hasTrigger, `${id} (out-of-scope) must NOT expose a report trigger`).toBe(false);
    }
  });
});
```

  Also add a gear-scope non-regression assertion in the SAME file. `fullSourceAnchors()` DOES populate `gear_scope`, so the gear-scope card must resolve to the DYNAMIC `gear_scope` anchor (not `rooms`) — proving `CardHeaderActions` passes the call site's anchor expression through verbatim rather than collapsing it to `CARD_REGION_MAP["gear-scope-audio"]` (`= "rooms"`):

```tsx
it("gear-scope card keeps its dynamic gear_scope link after the CardHeaderActions migration", () => {
  const { container } = renderAllSections(data);
  const card = container.querySelector('[data-card-id="gear-scope-audio"]')!;
  const href = card.querySelector('a[data-slot="source-link"]')!.getAttribute("href");
  // gear_scope present in the fixture → the card must use it, NOT rooms.
  expect(href).toBe(buildSheetDeepLink(DRIVE_FILE_ID, data.sourceAnchors["gear_scope"]));
  expect(href).not.toBe(buildSheetDeepLink(DRIVE_FILE_ID, data.sourceAnchors["rooms"]));
});
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/components/crew/sourceLinkCoverage.test.tsx` → FAIL on assertion (d) (no trigger yet).

- [ ] **Step 3: Implement.** In each of the 7 section files:
  1. Import `CardHeaderActions` and the type: `import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions"; import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/components/crew/primitives/CardReportTrigger";`
  2. Add `cardReport?: CardReportContext` to the section's `Props` type and destructure it with `cardReport = DEFAULT_CARD_REPORT`.
  3. Replace each `action={<SourceLink driveFileId={X} anchor={Y} />}` with `action={<CardHeaderActions cardId="<the literal already used in CARD_REGION_MAP[...] at this site>" driveFileId={X} anchor={Y} showId={showId} cardReport={cardReport} />}`. **Copy `X` (driveFileId) and `Y` (anchor) verbatim** — including GearSection's gear-scope ternary (`GearSection.tsx:319-328`). Remove the now-unused `SourceLink` import if no longer referenced (keep it if any non-card SourceLink remains — there are none, so drop it).
  4. The 23 sites: BudgetSection ×1 (`budget-main`), CrewSection ×2 (`crew-roster`, `crew-contacts`), GearSection ×6 (`gear-scope-<id>`, `gear-pack-list`, `gear-tech-specs`, `gear-room-details`, `gear-keynote`, `gear-opening-reel`), ScheduleSection ×2 (`schedule-days`, `schedule-call-times`), TodaySection ×6 (`today-tonight`, `today-where`, `today-contact`, `today-key-times`, `today-dress`, `today-run-of-show`), TravelSection ×3 (`travel-getting-there`, `travel-hotels`, `travel-flight`), VenueSection ×3 (`venue-where`, `venue-facilities`, `venue-status`). The `cardId` at each site is the literal already inside the existing `CARD_REGION_MAP[...]` lookup.

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/components/crew/sourceLinkCoverage.test.tsx` → PASS (assertions a–d + gear-scope non-regression). Then typecheck the touched sections: `pnpm tsc --noEmit` → no errors.

- [ ] **Step 5: Commit.** `git add -A && git commit --no-verify -m "feat(crew-page): wire CardHeaderActions into all source-backed crew cards"`

---

### Task 5: Part B — preview-aware `cardReport` in `_CrewShell`

**Files:**
- Modify: `app/show/[slug]/[shareToken]/_CrewShell.tsx`
- Test: `tests/components/crew/CardReportTrigger.test.tsx` (the admin-preview parity case from Task 2 already pins the trigger's behavior given a bundle; this task pins that `_CrewShell` BUILDS the right bundle).

**Interfaces:**
- Consumes: `CardReportContext`, existing `viewer`, `ctx.viewerName`, `ctx.viewerCrew`.
- Produces: each section instantiated with `cardReport={cardReportCtx}`.

- [ ] **Step 1: Write the failing test.** Add `tests/app/crewShellCardReport.test.tsx` (jsdom) asserting the pure bundle-builder. Extract the branch into an exported helper `buildCardReportContext(viewer, viewerName, viewerRole): CardReportContext` in `_CrewShell.tsx` (or a small sibling `lib/crew/cardReportContext.ts`) so it is unit-testable without rendering the whole shell.

```tsx
import { describe, expect, it } from "vitest";
import { buildCardReportContext } from "@/lib/crew/cardReportContext";

it("crew viewer → crew surface, crew-card scope, no extra context", () => {
  const c = buildCardReportContext({ kind: "crew" } as any, "Jo", "A1");
  expect(c).toEqual({ surface: "crew", surfaceIdScope: "crew-card", extraContext: {} });
});

it("admin_preview → admin surface, admin-preview-card scope, crewPreview context", () => {
  const c = buildCardReportContext(
    { kind: "admin_preview", crewMemberId: "c9" } as any, "Jo Preview", "V1",
  );
  expect(c).toEqual({
    surface: "admin",
    surfaceIdScope: "admin-preview-card",
    extraContext: { crewPreview: { crewMemberId: "c9", name: "Jo Preview", role: "V1" } },
  });
});
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/app/crewShellCardReport.test.tsx` → FAIL (helper missing).

- [ ] **Step 3: Implement.** Create `lib/crew/cardReportContext.ts`:

```ts
import type { CardReportContext } from "@/components/crew/primitives/CardReportTrigger";
import type { Viewer } from "@/lib/data/getShowForViewer";

export function buildCardReportContext(
  viewer: Viewer, viewerName: string | null, viewerRole: string | null,
): CardReportContext {
  if (viewer.kind === "admin_preview") {
    return {
      surface: "admin",
      surfaceIdScope: "admin-preview-card",
      extraContext: {
        crewPreview: { crewMemberId: viewer.crewMemberId, name: viewerName, role: viewerRole },
      },
    };
  }
  return { surface: "crew", surfaceIdScope: "crew-card", extraContext: {} };
}
```

  In `_CrewShell.tsx` `renderOne` (around lines 284-300), compute once above the `switch` and pass to every section:
  ```ts
  const cardReport = buildCardReportContext(viewer, ctx.viewerName, ctx.viewerCrew?.role ?? null);
  // ...
  return <TodaySection data={data} viewer={viewer} today={today} showId={showId} cardReport={cardReport} />;
  // (add `cardReport={cardReport}` to all 7 section instantiations)
  ```
  Verify `ctx.viewerName` / `ctx.viewerCrew` are the exact identifiers already used by the footer override at `_CrewShell.tsx:362-366`; reuse them verbatim.

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/app/crewShellCardReport.test.tsx` → PASS. `pnpm tsc --noEmit` → clean.

- [ ] **Step 5: Commit.** `git add -A && git commit --no-verify -m "feat(crew-page): preview-aware cardReport context threaded from _CrewShell"`

---

### Task 6: Part B — issue-body renders `fieldRef {cardId, region}`

**Files:**
- Test: `tests/reports/issueBody.test.ts`

**Interfaces:** Consumes existing `buildAdminIssueBody`. No implementation change (characterization test — `formatValue` already JSON-prints `fieldRef`).

- [ ] **Step 1: Write the test.** Add a case to `tests/reports/issueBody.test.ts` asserting a `{ cardId, region }` fieldRef renders both values under "Field/section ref:".

```ts
it("renders a card-scoped fieldRef {cardId, region} in the admin issue body", () => {
  const body = buildAdminIssueBody(
    { kind: "admin", email: "e@x.com" },
    { idempotency_key: "k", show_id: "s", fieldRef: { cardId: "today-dress", region: "dress" } } as any,
    null,
  );
  expect(body).toContain("Field/section ref:");
  expect(body).toContain("today-dress");
  expect(body).toContain("dress");
});
```

- [ ] **Step 2: Run.** `pnpm vitest run tests/reports/issueBody.test.ts` → PASS (no impl change needed; this pins the contract so a future `formatValue` change can't silently drop card context).

- [ ] **Step 3: Commit.** `git add -A && git commit --no-verify -m "test(report): pin card-scoped fieldRef rendering in the issue body"`

---

### Task 7: Part B — real-browser layout dimensions (Playwright)

**Files:**
- Modify: `app/admin/dev/source-link-dim/page.tsx` (extend the existing dev harness)
- Modify: `tests/e2e/source-link-dimensional.spec.ts`

**Interfaces:** Consumes `CardHeaderActions`. No new route (extends the existing build-gated harness → no `scripts/with-admin-dev-flag.mjs` change).

- [ ] **Step 1: Write the failing test.** In `source-link-dimensional.spec.ts` add a test asserting (a) each measured data row's height is unchanged in a card whose header is a `CardHeaderActions` vs. the `card-no-link` control (the trigger must not perturb body rows), and (b) the header affordances (`source-link`, `card-report-trigger`) do not exceed the header row height. Derive expected heights from the measured baseline (anti-hardcode); ±0.5px tolerance.

```ts
test("CardHeaderActions (source link + report trigger) does not change data-row heights", async ({ page }) => {
  await expect(page.getByTestId("card-with-actions")).toBeVisible();
  for (const id of ROW_TESTIDS) {
    const base = await heightOf(page.getByTestId("card-no-link").getByTestId(id));
    const withActions = await heightOf(page.getByTestId("card-with-actions").getByTestId(id));
    expect(Math.abs(withActions - base), `${id} row height perturbed by header actions`).toBeLessThanOrEqual(TOL);
  }
  // header affordances sit within the header band (do not stretch it)
  const header = await page.getByTestId("card-with-actions").locator("header").boundingBox();
  for (const slot of ["source-link", "card-report-trigger"]) {
    const el = await page.getByTestId("card-with-actions").locator(`[data-slot=${slot}]`).boundingBox();
    expect(el!.height).toBeLessThanOrEqual(header!.height + TOL);
  }
});
```

- [ ] **Step 2: Run to verify failure.** Start the dev-flag webServer implicitly via Playwright: `pnpm exec playwright test tests/e2e/source-link-dimensional.spec.ts --project=desktop-chromium` → FAIL (`card-with-actions` not found).

- [ ] **Step 3: Implement.** In `app/admin/dev/source-link-dim/page.tsx`, add a third `SectionCard` copy with `data-testid="card-with-actions"` whose `action` is `<CardHeaderActions cardId="today-dress" driveFileId="harness-drive" anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }} showId="harness-show" />`, wrapping the SAME `<MeasuredBody />` children as the other two cards. Import `CardHeaderActions`. Keep the card visually identical to `card-with-link` except the header action.

- [ ] **Step 4: Run to verify pass.** `pnpm exec playwright test tests/e2e/source-link-dimensional.spec.ts --project=desktop-chromium` → PASS. (If the local run cannot boot the webServer, note it and rely on real CI for this spec — but attempt locally first.)

- [ ] **Step 5: Commit.** `git add -A && git commit --no-verify -m "test(crew-page): real-browser dimensional gate for CardHeaderActions header cluster"`

---

### Task 8: Invariant-8 UI quality gate (impeccable dual-gate)

**Files:** none (evaluation) unless findings require fixes; `DEFERRED.md` for any deferred HIGH/CRITICAL.

- [ ] **Step 1:** Run `/impeccable critique` on the Part-B diff (the new primitives + the 23 wired card headers), with the canonical preflight gates (PRODUCT.md / DESIGN.md / register / preflight signal).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Triage findings. Fix HIGH/CRITICAL (the most likely note: report-glyph noise on every card — RD6 fallback is a hover/focus-revealed trigger or per-section grouping). Record findings + dispositions; defer anything out-of-scope via a `DEFERRED.md` entry.
- [ ] **Step 4:** Commit any fixes: `git add -A && git commit --no-verify -m "fix(crew-page): address impeccable critique/audit findings on per-card report affordance"`

---

## Self-review (run after drafting, before adversarial review)

1. **Spec coverage:** §3 dress region → Task 1. §4.1 CardReportTrigger → Task 2. §4.2 CardHeaderActions (explicit anchor) → Task 3. §4.2a cardReport bundle → Task 5. §4.3 data availability → Tasks 4/5. §4.4 issue body → Task 6. §5 dimensional invariants → Task 7. §8 meta-test (coverage walker + gear-scope + preview parity) → Tasks 4/2. §7 no-migration → N/A confirmed. Invariant 8 → Task 8.
2. **Placeholder scan:** none — every step has concrete code/commands.
3. **Type consistency:** `CardReportContext`, `DEFAULT_CARD_REPORT`, `CardHeaderActions` prop names identical across Tasks 2/3/4/5. `fieldRef: { cardId, region }` shape identical across Tasks 2/6. `data-slot="card-report-trigger"` identical across Tasks 2/4/7.
4. **Anti-tautology:** Task 4 (d) scopes to each `[data-card-id]` subtree; gear-scope test derives href from `buildSheetDeepLink`; Task 7 derives heights from a measured baseline.
