# Retire the duplicate "Content we couldn't read" callout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicate read-only "Content we couldn't read" bottom callout so each unparsed sheet row renders once (as its routed anchored card), suppress the contradictory `(0)` count on flagged section headers, and give the header "N clearing" pill an accessible label.

**Architecture:** Pure UI change in the admin show-review modal. Fix A deletes the `RawUnrecognizedCallout` component, its two `bottomSlot` call-sites, the now-dead `ShowReviewSurface.bottomSlot` prop, and the dead lib/admin/rawUnrecognized.ts; the routed warnings surface (anchored cards / Ignored disclosure) already renders every unrecognized row (proven no-drop, see Empirical grounding). Fix B extracts an exported `shouldShowSectionCount(count, sectionId, flagged)` helper adding a `!(count === 0 && flagged)` guard and wires `ModalSectionChrome` to it. Fix C adds static-shaped, count-interpolating `title`/`aria-label` to the clearing pill.

**Tech Stack:** Next.js 16, React, TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + @testing-library/react (jsdom), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-21-unread-callout-dedup.md` (APPROVED, 4 adversarial rounds).

## Empirical grounding (measured, not assumed)

The routing and no-drop claims below were verified against the live code with a running spike (jsdom render of the real `PublishedReviewModal`), not reasoned from prose. Load-bearing facts:

- `emitUnknownField` (`lib/parser/warnings.ts:323-338`) is the SOLE producer of `raw_unrecognized` entries and pushes, per row, BOTH a `UNKNOWN_FIELD` warn (`.warnings.push`, lines 330-336) AND a `raw_unrecognized` entry (`.rawUnrecognized.push`, line 337) in the same call. 1:1, no path pushes one without the other.
- `sectionForWarning` (`lib/admin/step3SectionStatus.ts:70-82`) routes a warn by `blockRef.kind` through `KIND_TO_SECTION` (`lib/admin/step3SectionStatus.ts:22-45`): `crew`→`crew`, `rooms`→`rooms`, etc. `warningsBySection` (`lib/admin/step3SectionStatus.ts:84-98`) folds an UNMAPPED kind into the `"warnings"` fallback bucket (line 92) — never a drop branch. So a UNKNOWN_FIELD warn whose `blockRef.kind` is a mapped content kind renders under THAT section's cards, not the warnings bucket. (The stale prior plan's "anchors to the event section" claim was wrong; the fixture's rows route to `crew`/`rooms`.)
- The routed card is `PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx`); for a UNKNOWN_FIELD warn it renders the row label (the `<label>` before `" | "` in `rawSnippet`) at testid `per-show-actionable-row-label-value` (lines 142-158). One such testid per routed row.
- The published surface's per-section extras (active + Ignored disclosure) come from `buildSectionWarningExtras` (`components/admin/showpage/sectionWarningExtras.tsx`): active cards under `section-warning-active-<id>` (line 133), ignored cards under `section-ignored-list-<id>` (line 150). An ignored row is NOT dropped — it moves to that disclosure.
- The retired callout capped its list at `RAW_UNRECOGNIZED_CAP = 50` (lib/admin/rawUnrecognized.ts:8). The warnings surface is UNCAPPED → a strict superset.
- The wizard (`Step3ReviewModal`) renders warnings via `ShowReviewSurface`'s own §E3 warning map (`routedWarningsRenderElsewhere === false`, `components/admin/review/ShowReviewSurface.tsx:229-230`); the `bottomSlot` callout there was ADDITIVE, so removing it drops nothing.

## Global Constraints

- **No em-dash in user-visible copy** (`DESIGN.md` section 9). The clearing-pill label uses a comma. spec:lint scans fences.
- **No raw error codes in UI** (invariant 5) — not touched (no new copy beyond the pill label; `UNKNOWN_FIELD` rows already route through the catalog title "Unrecognized row in sheet", `lib/messages/catalog.ts:1194`).
- **UI quality gate (invariant 8):** `/impeccable critique` AND `/impeccable audit` on the diff before cross-model review; P0/P1 fixed or `DEFERRED.md`-logged. Task 4.
- **Commit per task**, conventional-commits (`<type>(admin): <summary>`), `--no-verify` (shared hook belongs to the main checkout).
- **TDD per task:** failing test → minimal change → green → commit. Fix A's regression tests are red while the callout exists, green after removal.
- **Meta-test inventory:** none created or extended — no registry-guarded surface (auth boundary, alert catalog, advisory lock, mutation surface, email normalization) is touched. No `pg_advisory*`. A new structural SOURCE-scan test (unreadCalloutSourceRemoval.test.ts) is added, but it is a plain filesystem-read guard, not a registry meta-test.
- **Anti-tautology:** every no-drop assertion is scoped to a warning-surface testid (`section-warning-active-<id>` / `section-ignored-list-<id>` / `per-show-actionable-row-label-value`), never a whole-tree `getByText`; expected row labels derive from the `RAW_ROWS` fixture.
- **Typing-bypass scope (finding-5 disposition):** the "no `as unknown as`" guarantee applies to the modal PROPS OBJECT — `baseProps` returns a fully-typed `PublishedReviewModalProps` with every required field, so a missing/mistyped field fails at compile. The only casts in the harness are on jsdom test infrastructure (`HTMLElement.prototype.scrollIntoView`/`scrollTo` stubs and the mock `fetch` `Response`), which the existing `publishedReviewModal.test.tsx` uses identically — standard jsdom stubbing, not a props-shape bypass.
- **Unit-test RED shape (finding-6 disposition):** the Task-2 pure test's RED is a module-resolution failure (importing `shouldShowSectionCount` before it exists) — a legitimate RED for a not-yet-existing export. The Task-2 INTEGRATION test carries the assertion-shaped RED (a rendered "(0)" beside "Needs a look"). Both are required; the pair is the task's RED.

---

## File Structure

**Production files modified:**
- `components/admin/showpage/PublishedReviewModal.tsx` — drop the `RawUnrecognizedCallout` import member (import block at `components/admin/showpage/PublishedReviewModal.tsx:58-62`), the `bottomSlot` prop line (`components/admin/showpage/PublishedReviewModal.tsx:745`), reword the stale comment (`components/admin/showpage/PublishedReviewModal.tsx:242-247`); Fix C adds `aria-label`/`title` to the clearing pill span (`components/admin/showpage/PublishedReviewModal.tsx:680-691`).
- `components/admin/wizard/Step3ReviewModal.tsx` — drop the `RawUnrecognizedCallout` import member (import block at `components/admin/wizard/Step3ReviewModal.tsx:46-51`) and the `bottomSlot` prop line (`components/admin/wizard/Step3ReviewModal.tsx:615`).
- `components/admin/wizard/step3ReviewSections.tsx` — delete the `RawUnrecognizedCallout` component (`components/admin/wizard/step3ReviewSections.tsx:3551-3611`) and its `buildRawUnrecognizedView` import (`components/admin/wizard/step3ReviewSections.tsx:107`); Fix B adds an exported `shouldShowSectionCount` helper after `COUNT_SECTIONS` (`components/admin/wizard/step3ReviewSections.tsx:677`) and rewires `ModalSectionChrome.showCount` (`components/admin/wizard/step3ReviewSections.tsx:707-709`).
- `components/admin/review/ShowReviewSurface.tsx` — remove the `bottomSlot` prop: destructure (`components/admin/review/ShowReviewSurface.tsx:164`), type member (`components/admin/review/ShowReviewSurface.tsx:186`), render + comment (`components/admin/review/ShowReviewSurface.tsx:1057-1062`), header doc-comment mention (`components/admin/review/ShowReviewSurface.tsx:20`).

**Production files deleted:**
- lib/admin/rawUnrecognized.ts (dead after the callout is gone).

**Tests deleted:**
- tests/admin/rawUnrecognized.test.ts (tests the deleted lib).
- tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx (tests the deleted component).

**Tests edited:**
- `tests/components/admin/showpage/changesSection.test.tsx` — drop the callout import (`tests/components/admin/showpage/changesSection.test.tsx:35`), the `bottomSlot` harness prop (`tests/components/admin/showpage/changesSection.test.tsx:197`), and the callout-ordering assertions; keep Overview-precedes-warnings and Changes-is-last; reword the header doc comment.
- `tests/components/admin/review/publishedNoStagedTraffic.test.tsx` — drop the callout import member and the `<div data-testid="modal-callout">` render block (no assertion referenced the callout).

**Tests created (do not exist yet):**
- tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx (Task 1) — shared render harness (props boilerplate, `unknownFieldWarn`, `clearingAlertItem`, `installModalDomStubs`).
- tests/components/admin/showpage/unreadCalloutRemoved.test.tsx (Task 1) — tests 1-4 (dedup / no-drop / ignored / cap).
- tests/components/admin/showpage/unreadCalloutSourceRemoval.test.ts (Task 1) — Fix A deletion accounting + staged/wizard no-drop guard (test 9).
- tests/components/admin/wizard/sectionCountChip.test.ts (Task 2) — pure `shouldShowSectionCount` decision table (test 7 unit).
- tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx (Task 2) — Fix B integration on the real modal (test 7 integration).
- tests/components/admin/showpage/clearingPillLabel.test.tsx (Task 3) — Fix C accessible pill (test 8).

---

### Task 1: Retire the duplicate callout (Fix A)

Atomic removal: the component, both call-sites, the prop, and the dead lib are interdependent — removing any one alone leaves a broken import or an unused symbol, so they land in one commit. The regression tests are written first (red while the callout renders), then the removal turns them green. The shared harness lands in this commit too (its first consumers are the Task 1 tests).

**Files:**
- Create: tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx, tests/components/admin/showpage/unreadCalloutRemoved.test.tsx, tests/components/admin/showpage/unreadCalloutSourceRemoval.test.ts
- Modify: `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/review/ShowReviewSurface.tsx`, `tests/components/admin/showpage/changesSection.test.tsx`, `tests/components/admin/review/publishedNoStagedTraffic.test.tsx`
- Delete: lib/admin/rawUnrecognized.ts, tests/admin/rawUnrecognized.test.ts, tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx

**Interfaces:**
- Consumes: `PublishedReviewModal` + `PublishedReviewModalProps` (`@/components/admin/showpage/PublishedReviewModal`); `ShareTokenProvider` with `initialToken`/`initialEpoch` props (`@/app/admin/show/[slug]/ShareTokenContext`); `buildPublishedSectionData` (`@/components/admin/review/publishedAdapter`); `buildSectionWarningModel` (`@/lib/admin/sectionWarningModel`); `step3Sections` (`@/components/admin/wizard/step3ReviewSections`); `warningFingerprint` (`@/lib/dataQuality/warningFingerprint`); testids `per-show-actionable-row-label-value`, `section-warning-active-<id>`, `section-ignored-list-<id>`.
- Produces: shared harness exports `renderPublishedModal(rawRows, opts)`, `unknownFieldWarn(row)`, `clearingAlertItem(id)`, `installModalDomStubs()`, `type RawRow` — reused by Tasks 2 and 3.

- [ ] **Step 1: Write the shared harness.**

Create tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx. It builds a fully-typed `PublishedReviewModalProps` (NO `as unknown as` cast — every required field present) from a `RawRow[]` fixture, and exports the render entry point plus fixtures. The full field set is copied from the existing `baseProps()` in `tests/components/admin/showpage/publishedReviewModal.test.tsx:214-256` (verbatim required props), with two additions: an `ignoredFingerprints` option (threaded into `buildSectionWarningModel`) and an `attentionItems` option (for the Fix C clearing state).

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { vi } from "vitest";
import {
  PublishedReviewModal,
  type PublishedReviewModalProps,
} from "@/components/admin/showpage/PublishedReviewModal";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";

export const SHOW_ID = "22222222-2222-2222-2222-222222222222";
export const SLUG = "published-fixture-show";
export const DRIVE_FILE_ID = "DRIVE_PUB";
export const TITLE = "Published Fixture Show";
export const NOW = new Date("2026-07-16T12:00:00.000Z");

export type RawRow = { block: string; key: string; value: string };

// Byte-for-byte the warn emitUnknownField pushes (lib/parser/warnings.ts:330-336).
export function unknownFieldWarn(row: RawRow): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `Unrecognized ${row.block} row label: '${row.key}'`,
    blockRef: { kind: row.block, name: row.key },
    rawSnippet: `${row.key} | ${row.value}`,
  };
}

function snapshot(rawRows: readonly RawRow[]): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID, title: TITLE, client_label: "Acme", client_contact: null,
      dates: { travelIn: "2026-05-01", set: null, showDays: ["2026-05-02"], travelOut: "2026-05-03" },
      venue: { name: "Hall A", address: "1 Main St" }, event_details: null, agenda_links: [],
      coi_status: "received", diagrams: null, pull_sheet: [], source_anchors: {},
      drive_file_id: DRIVE_FILE_ID, archived: false, published: true,
    },
    internal: {
      financials: null, parse_warnings: rawRows.map(unknownFieldWarn), raw_unrecognized: [...rawRows],
      run_of_show: {}, use_raw_decisions: [], show_id: SHOW_ID,
    },
    crew_members: [{ id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alice Anders", role: "PM" }],
    rooms: [], hotel_reservations: [], transportation: [], contacts: [],
  };
}

function renderedSectionIds(d: PublishedSectionData): Set<SectionId> {
  return new Set(step3Sections(d).map((s) => s.id));
}

export type HarnessOpts = {
  ignoredFingerprints?: ReadonlySet<string>;
  attentionItems?: PublishedReviewModalProps["attentionItems"];
};

function baseProps(rawRows: readonly RawRow[], opts: HarnessOpts = {}): PublishedReviewModalProps {
  const data = buildPublishedSectionData(snapshot(rawRows), { slug: SLUG });
  const bySection = buildSectionWarningModel({
    slug: SLUG, warnings: data.warnings,
    ignoredFingerprints: opts.ignoredFingerprints ?? new Set<string>(),
    renderedSectionIds: renderedSectionIds(data),
  });
  return {
    data, bySection, slug: SLUG, showId: SHOW_ID, title: TITLE, archived: false, published: true,
    finalizeOwned: false, setPublished: vi.fn(async () => ({ ok: true }) as const), isLive: false,
    lastSyncedAt: "2026-07-16T11:48:00.000Z", lastCheckedAt: "2026-07-16T11:58:00.000Z",
    lastSyncStatus: "ok", now: NOW, attentionItems: opts.attentionItems ?? [], alertsDegraded: false,
    openSheetHref: "https://docs.google.com/spreadsheets/d/DRIVE_PUB/edit",
    archiveAction: vi.fn(async () => ({ ok: true }) as const), unarchiveAction: vi.fn(async () => {}),
    crewEmails: [], pickerCrew: [], feed: { entries: [], truncated: false }, undoAction: vi.fn(),
    acceptAction: vi.fn(), acceptAllAction: vi.fn(), approveAction: vi.fn(), rejectAction: vi.fn(),
    alertId: null,
  };
}

export function renderPublishedModal(rawRows: readonly RawRow[], opts: HarnessOpts = {}) {
  return render(
    <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
      <PublishedReviewModal {...baseProps(rawRows, opts)} />
    </ShareTokenProvider>,
  );
}

export function clearingAlertItem(id: string): PublishedReviewModalProps["attentionItems"][number] {
  return {
    id: `alert:${id}`, kind: "alert", tone: "notice", sectionId: "overview", crewKey: null,
    actionable: false, menuTitle: "Sheet unavailable", menuSubtitle: "Crew",
    alert: {
      alertId: id, code: "TEST_FAKE_ATTENTION_CODE", template: null, params: {}, action: null,
      helpHref: null, raisedAt: "2026-07-16T09:00:00.000Z", occurrenceCount: 1,
      autoClearNote: "Clears automatically once the sheet is back or re-parses.",
      failedKeys: null, dataGaps: null, errorCode: null,
    },
  };
}

export function installModalDomStubs() {
  (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
  (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  );
}
```

Typecheck the harness alone before writing the tests (it is the anti-crash gate — a real typed props object, so a missing required field fails at compile, not at render): `pnpm typecheck`.

- [ ] **Step 2: Write the failing dedup / no-drop tests (tests 1-4).**

Create tests/components/admin/showpage/unreadCalloutRemoved.test.tsx. The `next/navigation` mock is hoisted per-file (the harness assumes it). Fixture: two DISTINCT rows whose `block` is a mapped content kind, so each routes to that section (`crew`→`crew`, `rooms`→`rooms`).

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import {
  installModalDomStubs, renderPublishedModal, unknownFieldWarn, type RawRow,
} from "./__fixtures__/publishedModalHarness";

const RAW_ROWS: readonly RawRow[] = [
  { block: "crew", key: "Gaffer", value: "Jane Doe" },
  { block: "rooms", key: "Suite 5", value: "King bed" },
];

beforeEach(installModalDomStubs);
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("PublishedReviewModal - unread-callout dedup (section 3 Fix A)", () => {
  it("test 1: renders NO 'Content we couldn't read' bottom callout", () => {
    renderPublishedModal(RAW_ROWS);
    expect(screen.queryByText(/Content we couldn't read/i)).toBeNull();
  });

  it("test 2: every raw row still surfaces exactly once, as its routed UNKNOWN_FIELD card", () => {
    renderPublishedModal(RAW_ROWS);
    const labels = screen
      .getAllByTestId("per-show-actionable-row-label-value")
      .map((el) => el.textContent?.trim())
      .sort();
    expect(labels).toEqual([...RAW_ROWS.map((r) => r.key)].sort());
  });

  it("test 3: an ignored raw row is NOT dropped, it moves to the section's Ignored disclosure", () => {
    const ignoredFp = warningFingerprint(unknownFieldWarn(RAW_ROWS[0]!));
    expect(ignoredFp).not.toBeNull();
    renderPublishedModal(RAW_ROWS, { ignoredFingerprints: new Set([ignoredFp!]) });
    expect(screen.queryByText(/Content we couldn't read/i)).toBeNull();
    const labelIn = (root: HTMLElement) =>
      within(root).queryAllByTestId("per-show-actionable-row-label-value")
        .map((el) => el.textContent?.trim());
    // In ITS section's Ignored disclosure.
    const ignoredList = screen.getByTestId(`section-ignored-list-${RAW_ROWS[0]!.block}`);
    expect(labelIn(ignoredList)).toEqual([RAW_ROWS[0]!.key]);
    // Second (active) row stays in its own section's active list.
    const activeList = screen.getByTestId(`section-warning-active-${RAW_ROWS[1]!.block}`);
    expect(labelIn(activeList)).toEqual([RAW_ROWS[1]!.key]);
    // Mount-agnostic no-drop / no-dup: each label appears exactly once, and the
    // ignored key's single occurrence lives INSIDE the Ignored disclosure (moved,
    // not duplicated into any active list). Does NOT assume an empty active
    // wrapper is mounted for the ignored section (finding-4 safety).
    const labelEls = screen.getAllByTestId("per-show-actionable-row-label-value");
    const elsFor = (key: string) => labelEls.filter((el) => el.textContent?.trim() === key);
    expect(elsFor(RAW_ROWS[0]!.key)).toHaveLength(1);
    expect(elsFor(RAW_ROWS[1]!.key)).toHaveLength(1);
    expect(ignoredList.contains(elsFor(RAW_ROWS[0]!.key)[0]!)).toBe(true);
  });

  it("test 4: more than the 50-row callout cap all surface as cards (warnings is a superset)", () => {
    // Identity, not cardinality: a missing row + a duplicated row would pass a
    // bare length check. Compare the multiset of rendered labels to fixture keys.
    const many: RawRow[] = Array.from({ length: 51 }, (_, i) => ({
      block: "crew", key: `Row ${i}`, value: `Value ${i}`,
    }));
    renderPublishedModal(many);
    expect(screen.queryByText(/Content we couldn't read/i)).toBeNull();
    const labels = screen.getAllByTestId("per-show-actionable-row-label-value")
      .map((el) => el.textContent?.trim()).sort();
    expect(labels).toEqual(many.map((r) => r.key).sort());
  });
});
```

- [ ] **Step 3: Run, verify RED.**

Run: `pnpm vitest run tests/components/admin/showpage/unreadCalloutRemoved.test.tsx`
Expected: test 1 and test 3 FAIL on the assertion (the modal still passes `bottomSlot={<RawUnrecognizedCallout .../>}`, so "Content we couldn't read" is present). Tests 2/4 may already pass (the routed cards exist alongside the callout) — that is fine; test 1's absence assertion is the dedup pin. The RED must be an assertion failure, NOT a render crash (the harness props are fully typed).

- [ ] **Step 4: Write the failing source-removal + deletion-accounting guard (test 9).**

Create tests/components/admin/showpage/unreadCalloutSourceRemoval.test.ts. A filesystem source scan (not a render): it pins that the callout leaves no residue on either modal, its dead lib is gone, AND — as a positive pin — that the surface's OWN warning-rendering path (the §E3 map) is still present, so the file cannot pass while that path is accidentally gutted. It uses `readFileSync`/`existsSync` on repo-relative paths (`join(__dirname, "..", "..", "..", "..")` → repo root).

Scope note (finding-1/2 disposition): this file does NOT prove the wizard no-drop by itself, and its `toMatch` pins are deliberately NOT the structural proof — a substring match only establishes token presence, which is why the BEHAVIORAL guarantee is the existing `tests/components/admin/wizard/Step3ReviewModal.test.tsx` (14 flag-callout / "Needs a look" assertions rendering the staged surface WITHOUT the callout), run in Task 1 Step 6 before this task commits. The `toMatch` pins here are only a cheap tripwire that fails loudly if someone deletes the §E3 identifiers wholesale; correctness rests on the behavioral suite, not on the token check. This file's own job is deletion accounting.

```ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("unread-callout source removal (Fix A)", () => {
  it("ShowReviewSurface no longer declares or renders a bottomSlot", () => {
    expect(read("components/admin/review/ShowReviewSurface.tsx")).not.toMatch(/bottomSlot/);
  });
  it("neither modal imports or renders RawUnrecognizedCallout", () => {
    for (const rel of [
      "components/admin/showpage/PublishedReviewModal.tsx",
      "components/admin/wizard/Step3ReviewModal.tsx",
    ]) {
      expect(read(rel)).not.toMatch(/RawUnrecognizedCallout/);
    }
  });
  it("step3ReviewSections no longer defines the callout or imports its dead view builder", () => {
    const src = read("components/admin/wizard/step3ReviewSections.tsx");
    expect(src).not.toMatch(/RawUnrecognizedCallout/);
    expect(src).not.toMatch(/buildRawUnrecognizedView/);
  });
  it("the dead rawUnrecognized lib and its tests are deleted", () => {
    expect(existsSync(join(ROOT, "lib/admin/rawUnrecognized.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "tests/admin/rawUnrecognized.test.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx"))).toBe(false);
  });
  it("the wizard's own warning-rendering path (the §E3 map) is still present", () => {
    // Positive pin: the callout was ADDITIVE, not the warnings home. Behavioral
    // coverage is Step3ReviewModal.test.tsx; this guards its structural anchors.
    const surface = read("components/admin/review/ShowReviewSurface.tsx");
    expect(surface).toMatch(/warningsBySection/);
    expect(surface).toMatch(/routedWarningsRenderElsewhere/);
  });
});
```

Run: `pnpm vitest run tests/components/admin/showpage/unreadCalloutSourceRemoval.test.ts` → RED (bottomSlot + RawUnrecognizedCallout still present; the lib still exists). The positive §E3 pins pass at RED too (that path already exists) — they are a regression backstop, not part of the RED transition.

- [ ] **Step 5: Perform the removals (Fix A).**

`components/admin/showpage/PublishedReviewModal.tsx`:
- Import block `components/admin/showpage/PublishedReviewModal.tsx:58-62`: collapse to `import { CREW_CAP, dateSummarySegments } from "@/components/admin/wizard/step3ReviewSections";` (drop `RawUnrecognizedCallout`).
- Delete the `bottomSlot={<RawUnrecognizedCallout raw={data.rawUnrecognized} />}` line (`components/admin/showpage/PublishedReviewModal.tsx:745`).
- Reword the comment at `components/admin/showpage/PublishedReviewModal.tsx:242-247` so it cites `CREW_CAP` (still imported from that module) as the established cross-domain import instead of `RawUnrecognizedCallout`.

`components/admin/wizard/Step3ReviewModal.tsx`:
- Import block `components/admin/wizard/Step3ReviewModal.tsx:46-51`: drop `RawUnrecognizedCallout,` (keep `dateSummarySegments`, `NotPublishableNote`, `step3Sections`).
- Delete the `bottomSlot={<RawUnrecognizedCallout raw={data.rawUnrecognized} />}` line (`components/admin/wizard/Step3ReviewModal.tsx:615`).

`components/admin/wizard/step3ReviewSections.tsx`:
- Delete `import { buildRawUnrecognizedView } from "@/lib/admin/rawUnrecognized";` (`components/admin/wizard/step3ReviewSections.tsx:107`).
- Delete the entire `export function RawUnrecognizedCallout(...) { ... }` block INCLUDING its doc comment (`components/admin/wizard/step3ReviewSections.tsx:3542-3611`), leaving the following `export function ReportIssueSection` intact.

`components/admin/review/ShowReviewSurface.tsx`:
- Remove `bottomSlot,` from the destructure (`components/admin/review/ShowReviewSurface.tsx:164`).
- Remove the `bottomSlot?: ReactNode; // Phase 2 hook: ...` type member + its trailing comment line (`components/admin/review/ShowReviewSurface.tsx:186-187`).
- Remove the `{/* Shell-owned BOTTOM slot ... */}` comment and the `{bottomSlot}` render (`components/admin/review/ShowReviewSurface.tsx:1057-1062`).
- Drop `bottomSlot` from the header doc comment (`components/admin/review/ShowReviewSurface.tsx:20`).

Delete files:
```bash
git rm lib/admin/rawUnrecognized.ts \
       tests/admin/rawUnrecognized.test.ts \
       tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx
```

`tests/components/admin/showpage/changesSection.test.tsx`:
- Remove `import { RawUnrecognizedCallout } from "@/components/admin/wizard/step3ReviewSections";` (`tests/components/admin/showpage/changesSection.test.tsx:35`).
- Remove the `bottomSlot={<RawUnrecognizedCallout raw={data.rawUnrecognized} />}` harness prop (`tests/components/admin/showpage/changesSection.test.tsx:197`).
- Replace the `const callout = ...` lookup and its two ordering assertions (`before(warnings!, callout)`, `before(callout, changes)`) with a single `expect(before(warnings!, changes)).toBe(true);`. Keep `before(overview, warnings!)` and the Changes-is-last loop. Rename the `it(...)` and doc comment to drop the raw-unrecognized placement clause (it no longer asserts it).
- Drop the `// Non-empty so the RawUnrecognizedCallout renders ...` comment on the fixture's `raw_unrecognized` line (the row itself stays — it is harmless data).

`tests/components/admin/review/publishedNoStagedTraffic.test.tsx`:
- Collapse the import to `import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";` (drop `RawUnrecognizedCallout`).
- Remove the `<div data-testid="modal-callout"><RawUnrecognizedCallout .../></div>` block from `renderPublished()` (no assertion references it) and reword the function's doc comment to drop "+ the modal-level callout".

- [ ] **Step 6: Run the full affected set, verify GREEN + typecheck.**

The affected set INCLUDES the existing wizard behavioral suite `Step3ReviewModal.test.tsx` — the wizard no-drop argument depends on it (the callout was additive; warnings render via the §E3 map), so it MUST run and pass BEFORE this task's commit, satisfying the per-task RED/GREEN invariant for the wizard removal (finding-3). It is the behavioral guarantee; test 9's `toMatch` pins are only a cheap regression tripwire, not the structural proof.

```bash
pnpm vitest run \
  tests/components/admin/showpage/unreadCalloutRemoved.test.tsx \
  tests/components/admin/showpage/unreadCalloutSourceRemoval.test.ts \
  tests/components/admin/showpage/changesSection.test.tsx \
  tests/components/admin/review/publishedNoStagedTraffic.test.tsx \
  tests/components/admin/wizard/Step3ReviewModal.test.tsx
pnpm typecheck
git diff --name-status origin/main
rg -n "RawUnrecognizedCallout|buildRawUnrecognizedView|bottomSlot" components app lib || echo "no residue"
```
Expected: all PASS (incl. `Step3ReviewModal.test.tsx` — the wizard staged surface still renders its warnings without the callout); typecheck clean; the `rg` prints "no residue"; `git diff --name-status` shows the deletes (`D lib/admin/rawUnrecognized.ts`, etc.) and the modifies. The residue scan is scoped to PRODUCTION dirs (`components app lib`) ONLY — the test dirs legitimately name the retired symbols (the `unreadCalloutSourceRemoval.test.ts` guard scans for them by design, and other tests' doc comments describe what they guard), so scanning `tests` would deterministically false-fail. The `rg` is UNCONDITIONAL (not gated on typecheck) — a lingering PRODUCTION comment reference would slip past typecheck.

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit --no-verify -m "fix(admin): retire the duplicate 'Content we couldn't read' callout

The unparsed raw_unrecognized rows already render once as routed UNKNOWN_FIELD
cards ('Unrecognized row in sheet'); the bottomSlot callout was a duplicate
read-only echo. Remove the component, both call-sites, the dead ShowReviewSurface
bottomSlot prop, and the now-dead lib/admin/rawUnrecognized.ts. No-drop proven
(spec 1.1): sole producer co-emits, atomic co-persistence, total routing
fallback, uncapped superset surface, distinct rows never deduped; ignored rows
move to the section's Ignored disclosure.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Suppress the contradictory zero-count (Fix B)

**Files:**
- Create: tests/components/admin/wizard/sectionCountChip.test.ts (pure unit), tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx (integration)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (add `shouldShowSectionCount` after `COUNT_SECTIONS` at `components/admin/wizard/step3ReviewSections.tsx:677`; rewire `ModalSectionChrome.showCount` at `components/admin/wizard/step3ReviewSections.tsx:707-709`)

**Interfaces:**
- Consumes: `SectionId` (`@/lib/admin/step3SectionStatus`); `COUNT_SECTIONS = new Set(["crew","contacts","rooms","warnings"])` (`components/admin/wizard/step3ReviewSections.tsx:676`); `flagged` (destructured from `chrome` at `components/admin/wizard/step3ReviewSections.tsx:690`); the shared harness `renderPublishedModal` (Task 1).
- Produces: exported `shouldShowSectionCount(count: number | null, sectionId: SectionId | undefined, flagged: boolean): boolean`.

- [ ] **Step 1: Write the failing pure decision-table test (test 7 unit).**

Create tests/components/admin/wizard/sectionCountChip.test.ts. Exhaustive over the decision variables — every branch pinned, not just the motivating bug.

```ts
import { describe, expect, it } from "vitest";
import { shouldShowSectionCount } from "@/components/admin/wizard/step3ReviewSections";
import type { SectionId } from "@/lib/admin/step3SectionStatus";

describe("shouldShowSectionCount (Fix B count-suppression)", () => {
  it("suppresses the chip for a counted section flagged with zero body rows", () => {
    expect(shouldShowSectionCount(0, "rooms", true)).toBe(false);
  });
  it("keeps the chip for a counted section with a zero count that is NOT flagged", () => {
    expect(shouldShowSectionCount(0, "contacts", false)).toBe(true);
  });
  it("keeps the chip for a counted section flagged with a non-zero count", () => {
    expect(shouldShowSectionCount(3, "crew", true)).toBe(true);
    expect(shouldShowSectionCount(3, "crew", false)).toBe(true);
  });
  it("never shows a chip for a non-counted section, regardless of count/flag", () => {
    expect(shouldShowSectionCount(0, "event", true)).toBe(false);
    expect(shouldShowSectionCount(5, "venue", false)).toBe(false);
  });
  it("never shows a chip for a null count (agenda) or a sub-block with no sectionId", () => {
    expect(shouldShowSectionCount(null, "agenda", false)).toBe(false);
    expect(shouldShowSectionCount(5, undefined, false)).toBe(false);
  });
  it("covers every counted section under the flagged-zero carve-out", () => {
    const counted: SectionId[] = ["crew", "contacts", "rooms", "warnings"];
    for (const id of counted) {
      expect(shouldShowSectionCount(0, id, true)).toBe(false);
      expect(shouldShowSectionCount(2, id, true)).toBe(true);
    }
  });
});
```

Run: `pnpm vitest run tests/components/admin/wizard/sectionCountChip.test.ts` → RED (`shouldShowSectionCount` does not exist yet — import error / not-a-function).

- [ ] **Step 2: Write the failing integration test (test 7 integration).**

Create tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx. Drives the REAL modal via the Task-1 harness; a single `rooms` UNKNOWN_FIELD warn with zero room rows → the rooms header is flagged, count 0. Assertion scoped to the rooms section container (anti-tautology).

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { installModalDomStubs, renderPublishedModal, type RawRow } from "./__fixtures__/publishedModalHarness";

const RAW_ROWS: readonly RawRow[] = [{ block: "rooms", key: "Suite 5", value: "King bed" }];

beforeEach(installModalDomStubs);
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("PublishedReviewModal - flagged zero-count header (section 3 Fix B)", () => {
  it("a counted section flagged with zero body rows shows the flag, never a contradicting count chip", () => {
    renderPublishedModal(RAW_ROWS);
    const rooms = document.querySelector<HTMLElement>('[data-testid$="review-section-rooms"]')!;
    expect(rooms).not.toBeNull();
    // Independently establish a COUNTED section with ZERO body rows (no room-row
    // headers → true count 0, not a fixture drift to 1).
    expect(rooms.querySelector('[data-testid*="-room-0-header"]')).toBeNull();
    // It IS flagged (otherwise the suppression would be vacuous)...
    expect(within(rooms).getByText("Needs a look")).toBeInTheDocument();
    // ...and NO parenthetical count chip of ANY digit renders, catches both the
    // contradicting "(0)" and a drift to "(1)".
    expect(within(rooms).queryByText(/^\(\d+\)$/)).toBeNull();
  });
});
```

Run: `pnpm vitest run tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx` → RED. Today `showCount` is true whenever the section is counted, so "(0)" renders beside "Needs a look".

- [ ] **Step 3: Add the helper + rewire the chrome.**

In `components/admin/wizard/step3ReviewSections.tsx`, immediately after `const COUNT_SECTIONS = ...` (`components/admin/wizard/step3ReviewSections.tsx:676`):

```ts
/**
 * Whether the section heading shows its `(count)` chip. The chip appears only for
 * the counted subset (COUNT_SECTIONS) with a non-null count and a real sectionId
 * (a sub-block like Diagrams has none). The `count === 0 && flagged` carve-out
 * suppresses the self-contradicting "(0)" beside a "Needs a look" badge.
 */
export function shouldShowSectionCount(
  count: number | null,
  sectionId: SectionId | undefined,
  flagged: boolean,
): boolean {
  if (count === null || sectionId === undefined || !COUNT_SECTIONS.has(sectionId)) return false;
  return !(count === 0 && flagged);
}
```

Then replace the `showCount` computation inside `ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:707-709`) with:

```ts
const showCount = shouldShowSectionCount(count, chrome.sectionId, flagged);
```

(`flagged` is already destructured from `chrome` at `components/admin/wizard/step3ReviewSections.tsx:690`; `count` is the `number | null` param; `chrome.sectionId` is `SectionId | undefined`.)

- [ ] **Step 4: Run, verify GREEN.**

```bash
pnpm vitest run tests/components/admin/wizard/sectionCountChip.test.ts \
  tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx
```
Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add tests/components/admin/wizard/sectionCountChip.test.ts \
  tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx \
  components/admin/wizard/step3ReviewSections.tsx
git commit --no-verify -m "fix(admin): suppress the contradictory (0) count on flagged section headers

A zero count beside a 'Needs a look' badge is self-contradictory; the badge is
the signal. Extract shouldShowSectionCount with a !(count === 0 && flagged)
carve-out and wire ModalSectionChrome to it. Non-flagged zero counts (a clean
'Crew (0)') are unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Accessible clearing pill (Fix C)

**Files:**
- Create: tests/components/admin/showpage/clearingPillLabel.test.tsx
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (the clearing-state pill span at `components/admin/showpage/PublishedReviewModal.tsx:680-691`)

**Interfaces:**
- Consumes: the shared harness `renderPublishedModal` + `clearingAlertItem` (Task 1). `clearingCount = live.length − actionable.length` (`components/admin/showpage/PublishedReviewModal.tsx:273`); a non-actionable attention item raises it. Pill testid `published-show-review-alert-pill`.
- Produces: the clearing pill carries `title` and `aria-label` = `"<n> clearing on their own, no action needed"`; visible text unchanged.

- [ ] **Step 1: Write the failing test (test 8).**

Create tests/components/admin/showpage/clearingPillLabel.test.tsx. Two non-actionable attention items → `clearingCount === 2`, no actionable items so the clearing branch renders.

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { clearingAlertItem, installModalDomStubs, renderPublishedModal } from "./__fixtures__/publishedModalHarness";

beforeEach(installModalDomStubs);
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("PublishedReviewModal - clearing pill accessible label (section 3 Fix C)", () => {
  it("the 'N clearing' pill carries an aria-label/title, visible text stays terse", () => {
    renderPublishedModal([], { attentionItems: [clearingAlertItem("c1"), clearingAlertItem("c2")] });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(pill).toHaveTextContent("2 clearing");
    expect(pill).toHaveAttribute("aria-label", "2 clearing on their own, no action needed");
    expect(pill).toHaveAttribute("title", "2 clearing on their own, no action needed");
  });
});
```

Run: `pnpm vitest run tests/components/admin/showpage/clearingPillLabel.test.tsx` → RED (the pill has no `aria-label`/`title` today; `toHaveTextContent` may pass, the attribute assertions fail).

- [ ] **Step 2: Add the attributes.**

`components/admin/showpage/PublishedReviewModal.tsx`, the clearing-state pill `<span>` (the branch guarded by `clearingCount > 0`, `components/admin/showpage/PublishedReviewModal.tsx:680-691`). Add to that span alongside its existing `data-testid` and `className`:

```tsx
aria-label={`${clearingCount} clearing on their own, no action needed`}
title={`${clearingCount} clearing on their own, no action needed`}
```

Leave the visible children (`{clearingCount} clearing` and the status dot) unchanged. Comma, not em-dash.

- [ ] **Step 3: Run, verify GREEN.**

Run: `pnpm vitest run tests/components/admin/showpage/clearingPillLabel.test.tsx` → PASS.

- [ ] **Step 4: Commit.**

```bash
git add tests/components/admin/showpage/clearingPillLabel.test.tsx \
  components/admin/showpage/PublishedReviewModal.tsx
git commit --no-verify -m "fix(admin): give the 'N clearing' pill an accessible label

The header clearing pill read a bare 'N clearing' with no explanation. Add a
count-interpolating title + aria-label ('N clearing on their own, no action
needed'), comma not em-dash. Visible text unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Close-out — mechanical gate, impeccable dual-gate, full local suite, cross-model review

No new production code; this task verifies the whole diff against the invariants and the UI quality gate, then runs the mandatory whole-diff cross-model review before Stage 4 ship.

**Gate fixed-point rule (finding-1/2/7 disposition):** the ship is released only from a diff that has passed a COMPLETE cycle — impeccable to ITS OWN fixed point (Step 4: re-run critique/audit until a pass needs no further code change, so the final UI shape is always critiqued), then cross-model APPROVE (Step 5), then the automated battery (Step 6) — with ZERO SHIPPABLE-FILE mutations across that cycle. "Shippable file" = any `components/**`, `app/**`, `lib/**`, `tests/**`, or other code/config file in the merge diff; it EXCLUDES the standalone disposition-record file (a docs-only note about the review, committed separately in Step 7, not part of the reviewed code diff). Steps 4→5→6 form a LOOP, not a line (Step 6 enumerates the exact go-back conditions): any shippable mutation at any step re-arms the affected gates — a UI change re-arms impeccable AND cross-model; a non-UI code/test change re-arms cross-model. Iterate until one full cycle completes with no shippable-file change. Only that fixed point ships; the docs-only disposition note never re-arms the code loop.

**Files:** none modified unless a gate finding requires it (fix inline, amend the owning task's commit or add a `fix(admin):` follow-up).

- [ ] **Step 1: Mechanical UI sweep — ADDED lines only.**

The diff DELETES comments that contain em-dashes, so a naive whole-diff em-dash grep false-positives on removals. Scan ADDED lines only:

```bash
git diff origin/main -- components app tests | rg '^\+' | rg -v '^\+\+\+' | rg -- '—' || echo "no em-dash in added lines"
```
Expected: "no em-dash in added lines". Confirm the clearing-pill label is comma-form. Confirm no new `text-xs`/token drift (the pill reuses its existing span classes; Fix B/C add no new Tailwind classes).

- [ ] **Step 2: Full local suite + typecheck + lint + format.**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```
Expected: all green. (`pnpm test` excludes env-bound/e2e per repo config.) If `format:check` flags the new files, run `pnpm format` and fold into the owning task commit (amend) or a `style(admin):` follow-up. Pre-existing `Link is defined but never used` in `step3ReviewSections.tsx` is an origin/main lint warning (not an error, not introduced here) — leave it.

- [ ] **Step 3: spec:lint stays green.**

Run: `pnpm spec:lint docs/superpowers/specs/2026-07-21-unread-callout-dedup.md`
Expected: `0 hard`.

- [ ] **Step 4: Impeccable dual-gate — run to a fixed point (invariant 8, finding-2).**

Run `/impeccable critique` then `/impeccable audit` on the diff (canonical v3 setup: context.mjs load of PRODUCT.md + DESIGN.md, register reference read). Surfaces changed: the published + wizard review modals (removed callout, suppressed count chip, pill label). If a P0/P1 finding requires a code fix, apply it (amend the owning task commit) or record a `DEFERRED.md` entry with justification — THEN RE-RUN `/impeccable critique` + `/impeccable audit` on the fixed tree. Repeat until a full impeccable pass produces NO P0/P1 requiring a further code change: the impeccable gate is itself a fixed point, so the tree that leaves Step 4 has been critiqued/audited in its FINAL shape, never one revision behind. (The pre-existing `broken-image` hook finding at step3ReviewSections.tsx lines 3225 and 3243 predates this change and is out of scope — note it as a false positive for this diff.)

- [ ] **Step 5: Whole-diff cross-model review (Stage 4.1).**

Dispatch the Codex adversarial review of the whole implementation diff (fresh-eyes, REVIEWER ONLY, inline-artifact per the codex-guard contract). Iterate until APPROVE; triage findings via deferral discipline (land-now / `DEFERRED.md` / `BACKLOG.md`). Commit any land-now fix.

- [ ] **Step 6: Ship fixed-point loop (finding-1/2/7).**

The gates in Steps 4-5 each may mutate a SHIPPABLE file (`components/**`, `app/**`, `lib/**`, `tests/**`, config). A shippable mutation invalidates every prior gate pass. So run this loop:

1. Re-run the full battery on the current tree:
   ```bash
   git diff origin/main -- components app tests | rg '^\+' | rg -v '^\+\+\+' | rg -- '—' || echo "no em-dash in added lines"
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
   pnpm spec:lint docs/superpowers/specs/2026-07-21-unread-callout-dedup.md
   ```
2. If any shippable file changed since the last impeccable pass AND it is a UI file (invariant 8's UI-surface definition), GO BACK to Step 4 (impeccable to its fixed point).
3. If any shippable file changed since the last cross-model APPROVE, GO BACK to Step 5 (cross-model on the new diff).
4. When a complete pass — impeccable fixed point (if UI touched), cross-model APPROVE, green battery — runs with ZERO shippable-file mutation, the fixed point is reached and the ship is released.

- [ ] **Step 7: Record dispositions durably, then ship (Stage 4.2-4.4).**

1. **Disposition record as a STANDALONE file (finding-3/5).** Write the impeccable findings + dispositions to a NEW standalone doc docs/superpowers/plans/2026-07-21-unread-callout-dedup-dispositions.md (write "No P0/P1 findings; the diff passed critique + audit clean." explicitly if so). A standalone file — NOT an append to the plan — so the linted plan artifact stays byte-identical to the version reviewed here (closes finding-5: the merged plan == the linted plan). Then stage + commit it TOGETHER WITH any review-ledger edits made in Steps 4-5, so no permitted `DEFERRED.md`/`BACKLOG.md` mutation is left uncommitted (finding-4):
   ```bash
   DISPO=docs/superpowers/plans/2026-07-21-unread-callout-dedup-dispositions.md
   # (author $DISPO now — one "### <finding>: <disposition>" line each, or the
   #  explicit "No P0/P1 findings" sentence)
   git add "$DISPO"
   # Stage each ledger ONLY if it exists (a missing optional ledger must not abort
   # the stage, and a PRESENT-but-modified ledger must never be silently skipped).
   for f in DEFERRED.md BACKLOG.md; do [ -f "$f" ] && git add "$f"; done
   git commit --no-verify -m "docs(admin): record unread-callout-dedup impeccable dispositions"
   # Clean-tree guard: NOTHING tracked may be left uncommitted after this — a
   # dirty ledger here means a required disposition would ship uncommitted.
   git diff --quiet && git diff --cached --quiet || { echo "ERROR: uncommitted changes remain"; git status --short; exit 1; }
   ```
   These are docs/ledger-only changes (not shippable code per Step 6's carve-out), so they do NOT re-arm the code loop. Rationale for location: invariant 8 names §12 of the MILESTONE handoff doc, but this is a standalone `/ship-feature` change with no milestone handoff doc — this dispositions file is its handoff-record equivalent.
2. **Build the PR body from real content, then push + create-or-edit the PR.** The body is a fixed Fix A/B/C summary plus the standalone dispositions file, verbatim (no awk slicing, no placeholders — the file IS the section). Create-or-edit is idempotent (safe on a re-run where the PR already exists):
   ```bash
   DISPO=docs/superpowers/plans/2026-07-21-unread-callout-dedup-dispositions.md
   BODY="$(mktemp)"
   cat > "$BODY" <<'SUMMARY'
   Retire the duplicate read-only "Content we couldn't read" bottom callout so each
   unparsed sheet row renders once as its routed "Unrecognized row in sheet" card
   (Fix A); suppress the self-contradicting "(0)" count on flagged section headers
   via `shouldShowSectionCount` (Fix B); add an aria-label/title to the header
   "N clearing" pill (Fix C). UI-only; no-drop proven (spec 1.1). Plan converged
   with Codex over multiple adversarial rounds.

   ## Impeccable dual-gate
   SUMMARY
   cat "$DISPO" >> "$BODY"
   printf '\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n' >> "$BODY"
   git push -u origin fix/unread-callout-dedup
   # Idempotent create-or-edit: edit if a PR already exists on this branch, else create.
   if gh pr view --json number >/dev/null 2>&1; then
     gh pr edit --body-file "$BODY"
   else
     gh pr create \
       --title "fix(admin): retire duplicate 'Content we couldn't read' callout + count/pill fixes" \
       --body-file "$BODY"
   fi
   ```
   The PR body's `## Impeccable dual-gate` content is the committed `$DISPO` file verbatim — a byte-faithful mirror, not a hand-retyped copy.
3. **Real CI green** (not local-only) → `gh pr merge --merge` → fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` == `0  0` → set the marker's `stage` to `"done"` → `CronDelete` the marker's `cronJobId`.

---

## Self-Review

**1. Spec coverage.**
- Fix A (retire callout) → Task 1. Fix B (count suppression) → Task 2. Fix C (pill) → Task 3. Fix D (vocabulary) → no code, satisfied by Fix A's deletion of "Content we couldn't read".
- Spec §3 tests: test 1 (no callout) + test 2 (routed once) + test 3 (ignored no-drop) + test 4 (cap superset) → Task 1 unreadCalloutRemoved.test.tsx. Test 7 (count suppression) → Task 2 (sectionCountChip.test.ts unit + flaggedZeroCountHeader.test.tsx integration). Test 8 (pill) → Task 3. Test 9 (deletion accounting + a cheap §E3-token tripwire) → Task 1 unreadCalloutSourceRemoval.test.ts; the wizard no-drop BEHAVIOR is covered by the existing `Step3ReviewModal.test.tsx` (14 staged flag-callout assertions), which is now in Task 1 Step 6's affected set so it runs and passes BEFORE the wizard-removal commit (per-task GREEN). (The prior draft's "tests 5/6" — a separate staged-render test and a type-level `expectTypeOf` prop test — are SUBSUMED here: `expectTypeOf` does not fail at Vitest runtime, and a duplicate staged-render fixture adds nothing over the existing 14 assertions.)
- Invariant 8 dual-gate → Task 4 Step 4 (run to a fixed point); disposition record → Task 4 Step 7 (a standalone committed dispositions file, mirrored verbatim in the PR body — so the linted plan stays byte-identical to the reviewed version). Whole-diff cross-model → Task 4 Step 5; ship fixed-point loop → Task 4 Step 6. Meta-test inventory (none) → declared in Global Constraints.

**2. Placeholder scan.** Every test/impl body is complete, typechecked code (verified against the strict tsconfig via a running spike). No "TBD"/"copy the fields yourself"/vague-validation placeholders. The harness field set is shown in full in Task 1 Step 1, not deferred to "copy from elsewhere".

**3. Type consistency.** `shouldShowSectionCount(count: number | null, sectionId: SectionId | undefined, flagged: boolean)` — one signature, used identically in sectionCountChip.test.ts, flaggedZeroCountHeader.test.tsx (via render), and the `ModalSectionChrome` call site. Harness exports (`renderPublishedModal`, `unknownFieldWarn`, `clearingAlertItem`, `installModalDomStubs`, `RawRow`) are defined once (Task 1) and imported by Tasks 2-3. Pill `aria-label`/`title` strings byte-identical across Task 3 test and impl. Testids (`per-show-actionable-row-label-value`, `section-warning-active-<id>`, `section-ignored-list-<id>`, `published-show-review-alert-pill`, `[data-testid$="review-section-rooms"]`) verified live.

**4. RED-before / GREEN-after.** Every task's test is RED before its impl and GREEN after (verified by spike: reverting the four production files with the tests+deletions in place fails the source-scan (3), the dedup file, and `sectionCountChip` on `shouldShowSectionCount` being undefined). Fix A tests 2/4 may pass pre-removal (cards coexist with the callout) — the dedup PIN is test 1's absence assertion + test 9's source scan, both RED pre-removal.
