# Step-3 "Review & publish" Page Redesign (Variant B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Step-3 onboarding-wizard "Review & publish" page shell to the ratified Variant-B mock — new stepper, "Review what we found" header, single-column compact sheet list, and a sticky publish bar — without changing the already-shipped review modal or any backend/finalize contract.

**Architecture:** View-layer only. Restyle the shared `StepIndicator`; rewrite `Step3Review`'s header + list + edge sections; turn `Step3SheetCard` from a grid tile into a compact list row; add a new `Step3PublishBar` that re-homes the existing `FinalizeButton` (behavior preserved, one layout-only prop added); extend `Step3PublishCounts` with selectable totals. No DB / advisory-lock / RPC / streaming change.

**Tech Stack:** Next.js 16 (App Router, RSC + client components), React 18, TypeScript (strict), Tailwind v4 (`@theme` tokens), Vitest + Testing Library (jsdom), Playwright (real-browser layout assertions), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-07-04-step3-review-page-variant-b.md` (Codex-APPROVED, 3 rounds). **Design mock:** `docs/superpowers/specs/2026-07-04-step3-review-page-variant-b-mock/`.

## Global Constraints

- **TDD per task:** failing test → run-fail → minimal impl → run-pass → commit. Never impl before its test. (AGENTS.md invariant 1.)
- **Commit per task**, conventional-commits (`feat(crew-page):` / `test(crew-page):` / `refactor(...)`). One task per commit; `--no-verify` (worktree hooks) but run `pnpm format:check` before push.
- **No raw error codes in UI** (invariant 5) — all copy plain English or via `lib/messages/lookup.ts` (unchanged paths).
- **Token discipline:** only sanctioned `@theme` utilities. Canonical **`shadow-tile`** (NOT `shadow-(--shadow-tile)` — eslint-enforced, globals.css:223-227). No success/green token exists; done/ready are neutral. Needs-a-look = `bg-status-review` dot + `bg-warning-bg text-warning-text` pill. Warn border = `border-border-strong` (no warn-border token). Accent (`bg-accent`) only on the one active step pill, the single bar Publish CTA, and checked checkboxes (≤10% coverage, DESIGN.md:11).
- **Preserve every FinalizeButton behavior**: state machine, `runLoop`/`readFinalize*`, NDJSON streaming, `completedRef`/`grandTotalRef`, focus effects (`panelRef`/`alertRef`), soft-confirm + focus trap, all `role`/`aria`/`data-testid`. Only add a layout-only `panelPlacement` prop.
- **Meta-test inventory:** none created or extended — no auth boundary, DB write, admin-alert catalog, advisory-lock, or sentinel-hiding surface is touched (spec §13). Declared explicitly per writing-plans additions.
- **Advisory-lock topology:** N/A — no `pg_advisory*` path is touched (view layer only). Declared.
- **Run before push:** `pnpm typecheck` (vitest strips types), the FULL affected vitest suite (not just touched files — structural/meta tests), `pnpm format:check`, and the Playwright layout spec.
- **UI quality gate (invariant 8):** `/impeccable critique` AND `/impeccable audit` on the diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`.

---

## File structure

| File | Change | Responsibility |
| --- | --- | --- |
| `components/admin/wizard/Step3Review.tsx` | modify | `StepIndicator` is NOT here (it's in OnboardingWizard). Header (h1 + summary), row-partition helpers (`rowNeedsLook`, ready/needsLook counts), single-column list, edge sections, extended `Step3PublishCounts`, `Step3PublishHeader` select-all-without-count. |
| `components/admin/OnboardingWizard.tsx` | modify | `StepIndicator` redesign; drop top `BackLink` for step 3; narrow Step-3 container to `max-w-3xl`. |
| `components/admin/wizard/Step3SheetCard.tsx` | modify | Grid tile → compact list row: selectable View/Review + chip + meta line; demoted variant; no-details variant; drop inline expansion. |
| `components/admin/wizard/Step3ReviewWithFinalize.tsx` | modify | Page frame: relative positioning context; render `Step3PublishBar` (count + Back + FinalizeButton) instead of a bare FinalizeButton. |
| `components/admin/wizard/Step3PublishBar.tsx` | **create** | Presentational sticky bottom bar: layout + stickiness only. |
| `components/admin/FinalizeButton.tsx` | modify | Add optional `panelPlacement?: "above" \| "below"` (default `"below"` = current) — layout-only. |
| `tests/components/admin/wizard/Step3Review.test.tsx` | modify | Header/summary branches, list, publish-count relocation, edge sections. |
| `tests/components/step3SheetCard.test.tsx` | modify | Compact-card DOM delta (largest). |
| `tests/components/step3SheetCard.transitions.test.tsx` | modify | Transition/live-region coverage under new DOM. |
| `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` | modify | Bar composition + count wiring. |
| `tests/components/admin/wizard/step3PublishSettlement.test.tsx` | modify | Settlement under new card DOM. |
| `tests/components/onboardingWizardNav.test.tsx` | modify | Stepper redesign + step-3 Back relocation. |
| `tests/components/admin/FinalizeButton.test.tsx` | modify | `panelPlacement` prop + behavior-unchanged assertions. |
| `tests/e2e/step3-review-page.layout.spec.ts` | **create** | Standalone static-harness real-browser DI-1…DI-4 assertions (stepper no-overflow, card centering, sticky-bar width + publish-in-viewport + no-occlusion, mobile wrap). |
| `tests/e2e/step3-grid-layout.spec.ts` | **delete (obsolete)** | Asserts a multi-column grid that "stays multi-column" / "two cells share a row" — the redesign is single-column (spec §5). Superseded by the new layout spec. |
| `tests/e2e/step3-card-dimensions.spec.ts` | **delete (obsolete)** | Transcribes the old grid-tile card DOM (`-summary-block`, `-badge-diagrams`, `-warnings`, fixed-width column) that the compact card removes. Its DI intent (child ≤ card width) is re-covered by the new layout spec's DI-2. |

---

### Task 1: Extend `Step3PublishCounts` with selectable totals

The sticky bar's "N of M selected to publish" must count **selectable** rows, not `publishRows` (which includes demoted/no-details). Add two fields sourced from the already-computed `selectableRows` counts (`Step3Review.tsx:805-806`), leaving `publishCount`/`uncheckedCleanCount` (over `publishRows`, consumed by FinalizeButton) untouched.

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (`Step3PublishCounts` type ~:104-108; the `onCountsChange` effect ~:818-823)
- Test: `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx`

**Interfaces:**
- Produces: `type Step3PublishCounts = { publishCount: number; uncheckedCleanCount: number; selectableTotal: number; selectedCount: number }`. `selectableTotal = selectableRows.length`; `selectedCount = selectableRows.filter(isChecked).length` (== the existing `appliedCount`).

- [ ] **Step 1: Write the failing test** — assert the counts callback reports selectable totals that EXCLUDE a demoted clean row. Add to `Step3ReviewWithFinalize.test.tsx` (fixtures already build rows there):

```tsx
it("onCountsChange reports selectableTotal excluding demoted/no-details clean rows", () => {
  const onCounts = vi.fn();
  // 2 clean+selectable (1 applied → checked), 1 clean-but-demoted (lastFinalizeFailureCode set)
  const rows: Step3Row[] = [
    cleanRow("a", "applied"),
    cleanRow("b", "staged"),
    { ...cleanRow("c", "staged"), lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED" },
  ];
  render(<Step3Review wizardSessionId={WSID} rows={rows} onCountsChange={onCounts} />);
  const last = onCounts.mock.calls.at(-1)![0];
  expect(last.selectableTotal).toBe(2);           // demoted 'c' excluded
  expect(last.selectedCount).toBe(1);             // only 'a' applied/checked
  expect(last.publishCount).toBe(1);              // unchanged (over publishRows)
  expect(last.uncheckedCleanCount).toBe(2);       // unchanged: 'b' + demoted 'c'
});
```
(Reuse/duplicate the file's existing `cleanRow`/`Step3Row` fixture builder; derive expectations from the fixture, not literals baked elsewhere.)

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx -t "selectableTotal"` → FAIL (`selectableTotal` undefined).

- [ ] **Step 3: Implement** — extend the type and the effect payload:

Because the two new fields are **required**, EVERY producer/seed of `Step3PublishCounts` must set them in THIS task or the tree won't typecheck at commit (the seed in `Step3ReviewWithFinalize.tsx:45-48` is `{ publishCount, uncheckedCleanCount }` only). So this task touches BOTH files:

`components/admin/wizard/Step3Review.tsx` — extend the type, export a pure helper, update the effect:

```tsx
export type Step3PublishCounts = {
  publishCount: number;
  uncheckedCleanCount: number;
  selectableTotal: number; // selectableRows.length
  selectedCount: number; // selectableRows checked
};

// Exported so the client wrapper can seed first paint with NO flash (same
// predicate the component uses for selectableRows / Select-all).
export function computeSelectableCounts(rows: Step3Row[]): {
  selectableTotal: number;
  selectedCount: number;
} {
  const selectable = rows.filter(
    (r) => isCleanRow(r.status) && hasReviewablePreview(r) && !r.lastFinalizeFailureCode,
  );
  return {
    selectableTotal: selectable.length,
    selectedCount: selectable.filter((r) => r.status === "applied").length,
  };
}
// … in the onCountsChange effect, add (cleanCount = selectableRows.length :806, appliedCount :805):
onCountsChange?.({
  publishCount: optimisticPublishCount,
  uncheckedCleanCount: optimisticUncheckedCleanCount,
  selectableTotal: cleanCount,
  selectedCount: appliedCount,
});
```

Add `cleanCount, appliedCount` to the effect deps. (`hasReviewablePreview`/`isCleanRow` are already defined in this file; `computeSelectableCounts` reuses them so the predicate is single-sourced.)

`components/admin/wizard/Step3ReviewWithFinalize.tsx` — seed the two new fields from the server `rows` so first paint is correct (matches the existing "seeded from server, no flash" contract):

```tsx
import { Step3Review, computeSelectableCounts, type Step3PublishCounts, type Step3Row } from "@/components/admin/wizard/Step3Review";
// …
const [counts, setCounts] = useState<Step3PublishCounts>({
  publishCount: initialPublishCount,
  uncheckedCleanCount: initialUncheckedCleanCount,
  ...computeSelectableCounts(rows),
});
```

- [ ] **Step 4: Run to verify it passes** — same `-t` command → PASS. Then the whole file + a **typecheck** (the seed change is type-load-bearing): `pnpm vitest run tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx && pnpm typecheck`.

- [ ] **Step 5: Commit** — `git add -A && git commit --no-verify -m "feat(crew-page): add selectableTotal/selectedCount to Step3PublishCounts"`

---

### Task 2: Redesign the shared `StepIndicator` (pills + labels + connectors + done-check)

**Files:**
- Modify: `components/admin/OnboardingWizard.tsx` (`StepIndicator` :94-153)
- Test: `tests/components/onboardingWizardNav.test.tsx`

**Interfaces:**
- Consumes: unchanged props `{ step: 1|2|3; maxReachedStep: 1|2|3 }`.
- Produces: same testids (`wizard-step-indicator`, `wizard-step-indicator-${n}`), same Link/span reachability, plus visible labels `["Share folder","Verify","Review & publish"]` and connector lines. Adds a lucide `Check` glyph on done steps (`n < step`).

- [ ] **Step 1: Write the failing tests** — add to `onboardingWizardNav.test.tsx`:

```tsx
it("StepIndicator shows visible step labels", () => {
  render(<StepIndicator step={3} maxReachedStep={3} />);
  expect(screen.getByText("Share folder")).toBeInTheDocument();
  expect(screen.getByText("Verify")).toBeInTheDocument();
  expect(screen.getByText("Review & publish")).toBeInTheDocument();
});
it("done steps (n < step) render a check, active step uses accent", () => {
  const { container } = render(<StepIndicator step={3} maxReachedStep={3} />);
  // steps 1,2 done → their pills contain an svg (Check); step 3 active → bg-accent
  const active = screen.getByTestId("wizard-step-indicator-3");
  expect(active.className).toContain("bg-accent");
  const done1 = screen.getByTestId("wizard-step-indicator-1");
  expect(done1.querySelector("svg")).not.toBeNull();
});
it("preserves reachability: reached=link, unreached=disabled span", () => {
  render(<StepIndicator step={1} maxReachedStep={1} />);
  expect(screen.getByTestId("wizard-step-indicator-1").tagName).toBe("A");
  expect(screen.getByTestId("wizard-step-indicator-3").getAttribute("aria-disabled")).toBe("true");
});
it("renders 2 connector lines between the 3 pills, filled after a done step", () => {
  render(<StepIndicator step={3} maxReachedStep={3} />);
  const connectors = screen.getAllByTestId("wizard-step-connector");
  expect(connectors).toHaveLength(2);                       // between 1-2 and 2-3
  expect(connectors[0].className).toContain("bg-border-strong"); // left pill (1) is done → filled
});
```
(`StepIndicator` is not exported today — export it from `OnboardingWizard.tsx`, or if the file's test imports the whole wizard, assert via the wizard render. Simplest: `export function StepIndicator` so the unit test imports it directly. Confirm no name clash.)

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/components/onboardingWizardNav.test.tsx` → FAIL (labels absent / not exported).

- [ ] **Step 3: Implement** — rewrite `StepIndicator`. Keep the map over `[1,2,3]`, the `isVisited`/`isActive` logic, testids, aria, and Link/span split. Add: a `LABELS` array; render each step as `<div class="flex items-center gap-2">[pill][label]</div>`; a connector `<span data-testid="wizard-step-connector" className="h-px flex-1 max-w-[60px] {leftPillDone?'bg-border-strong':'bg-border'}" aria-hidden>` between steps (2 total, rendered when `n < 3` inside the map — `leftPillDone = n < step`); on done steps render `<Check aria-hidden className="size-3.5"/>` in place of the number; done pill classes `bg-surface border border-border-strong text-text-subtle`, active `bg-accent text-accent-text`, reachable-todo `bg-surface-sunken text-text-subtle hover:text-text-strong`, unreached `bg-surface-sunken text-text-faint`; labels `hidden sm:inline` for non-active steps, active label always visible + `text-text-strong font-semibold`. Wrap in the same `<nav aria-label="Onboarding progress">` and keep the sr-only "Step {step} of 3". Import `Check` from `lucide-react`.

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/components/onboardingWizardNav.test.tsx` → PASS. Then the wizard render suite: `pnpm vitest run tests/components/admin/OnboardingWizard.test.tsx`.

- [ ] **Step 5: Commit** — ONE commit for the task (TDD: the failing tests + the implementation that greens them land together; AGENTS.md invariant 1 + 6 — one task, one commit): `feat(crew-page): redesign shared StepIndicator (labels + connectors + done-check)`.

---

### Task 3: Step-3 header — "Review what we found" + composed summary

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (header block :929-993; add `rowNeedsLook` + count helpers near :644-660)
- Test: `tests/components/admin/wizard/Step3Review.test.tsx`

**Interfaces:**
- Produces: `function rowNeedsLook(row): boolean` = `!hasReviewablePreview(row) || row.lastFinalizeFailureCode != null || summarizeDataGaps(stripLegacyUnknownFieldAnchors(arr(row.parseResult?.warnings))).total > 0`. Counts: `readyCount = cleanRows.filter(r => !rowNeedsLook(r)).length`, `needsLookCount = cleanRows.length - readyCount`, `sheetCount = rows.length - skippedRows.length`. New testid `wizard-step3-summary`; `wizard-step3-eyebrow` removed; `wizard-step3-heading` becomes an `h1` with text "Review what we found".

- [ ] **Step 1: Write the failing tests** — cover every copy branch, derived from fixture composition (anti-tautology: assert the composed string, not a literal echoed by a sibling). Add to `Step3Review.test.tsx`:

```tsx
it('header reads "Review what we found"', () => {
  render(<Step3Review wizardSessionId={WSID} rows={[cleanRow("a","staged")]} />);
  expect(screen.getByTestId("wizard-step3-heading")).toHaveTextContent("Review what we found");
  expect(screen.queryByTestId("wizard-step3-eyebrow")).toBeNull();
});
it("summary: all ready, plural", () => {
  const rows = [cleanRow("a","staged"), cleanRow("b","staged")]; // both clean, no warnings
  render(<Step3Review wizardSessionId={WSID} rows={rows} />);
  expect(screen.getByTestId("wizard-step3-summary")).toHaveTextContent(
    "2 sheets parsed from your Drive folder. All 2 are ready to publish. Nothing publishes until you say so.");
});
it("summary: single ready avoids 'All 1'", () => {
  render(<Step3Review wizardSessionId={WSID} rows={[cleanRow("a","staged")]} />);
  expect(screen.getByTestId("wizard-step3-summary")).toHaveTextContent(
    "1 sheet parsed from your Drive folder. It's ready to publish. Nothing publishes until you say so.");
});
it("summary: one needs a look uses singular 'needs' + 'it goes'", () => {
  const rows = [cleanRow("a","staged"), warnRow("b")]; // warnRow → data-gap total 1
  render(<Step3Review wizardSessionId={WSID} rows={rows} />);
  expect(screen.getByTestId("wizard-step3-summary")).toHaveTextContent(
    "2 sheets parsed from your Drive folder. 1 ready to publish — 1 needs a quick look before it goes live. Nothing publishes until you say so.");
});
it("summary: readyCount===0, needsLookCount>1 → no 'ready' lead, plural 'need … they go'", () => {
  const rows = [warnRow("a"), warnRow("b")]; // both need a look, none ready
  render(<Step3Review wizardSessionId={WSID} rows={rows} />);
  expect(screen.getByTestId("wizard-step3-summary")).toHaveTextContent(
    "2 sheets parsed from your Drive folder. 2 need a quick look before they go live. Nothing publishes until you say so.");
});
it("summary: only blocking rows → no readiness clause", () => {
  render(<Step3Review wizardSessionId={WSID} rows={[hardFailRow("a")]} />);
  const s = screen.getByTestId("wizard-step3-summary");
  expect(s).toHaveTextContent("1 sheet parsed from your Drive folder.");
  expect(s).not.toHaveTextContent("ready to publish");
});
it("summary: empty (rows = []) renders NO summary paragraph (empty card handles it)", () => {
  render(<Step3Review wizardSessionId={WSID} rows={[]} />);
  expect(screen.queryByTestId("wizard-step3-summary")).toBeNull();
  expect(screen.getByTestId("wizard-step3-empty")).toBeInTheDocument();
});
```
(Add fixture builders `warnRow` (clean row whose `parseResult.warnings` yields `summarizeDataGaps().total===1`) and `hardFailRow` if not present — mirror the existing `cleanRow` builder. `summarizeDataGaps` classes: `FIELD_UNREADABLE`/`UNKNOWN_SECTION_HEADER`/`BLOCK_DISAPPEARED` — build a warning of one of those.)

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx -t "summary"` → FAIL.

- [ ] **Step 3: Implement** — add `rowNeedsLook` + counts; replace the header eyebrow/h2/subhead with `<h1 data-testid="wizard-step3-heading" id="wizard-step3-heading" className="text-2xl font-semibold text-text-strong">Review what we found</h1>` + the existing `HelpTooltip`. Render the summary paragraph **only when `rows.length > 0`** (spec §4.2/§4.5 — the empty state's card is the sole content when `rows = []`, no summary): `{rows.length > 0 ? <p data-testid="wizard-step3-summary" className="max-w-prose text-base text-text-subtle">…</p> : null}`. `summaryText` is therefore never called with `sheetCount === 0` from an all-empty page (it still degrades gracefully — see below), but the render guard is what satisfies the "no summary paragraph when empty" contract. Compose with a helper:

```tsx
function summaryText(sheetCount, readyCount, needsLookCount) {
  const cleanCount = readyCount + needsLookCount;
  const sheets = `${sheetCount} sheet${sheetCount === 1 ? "" : "s"} parsed from your Drive folder.`;
  if (cleanCount === 0) return sheets;                       // blocking/set-aside only
  const tail = "Nothing publishes until you say so.";
  if (needsLookCount === 0) {
    const ready = readyCount === 1 ? "It's ready to publish." : `All ${readyCount} are ready to publish.`;
    return `${sheets} ${ready} ${tail}`;
  }
  const verb = needsLookCount === 1 ? "needs" : "need";
  const pron = needsLookCount === 1 ? "it goes" : "they go";
  const look = `${needsLookCount} ${verb} a quick look before ${pron} live.`;
  const lead = readyCount > 0 ? `${readyCount} ready to publish — ${look}` : look;
  return `${sheets} ${lead} ${tail}`;
}
```
Render the emphasis (`<b>`, the warn `<span className="text-warning-text">…needs a quick look…</span>`) via spans; the plain-text form above is what `toHaveTextContent` matches. Keep the `wizard-step3-resolution-status` paragraph and its data-attrs verbatim.

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx` → PASS (fix any pre-existing eyebrow/subhead assertions to the new copy).

- [ ] **Step 5: Commit** — `feat(crew-page): Step-3 header "Review what we found" + composed summary`.

---

### Task 4: `Step3SheetCard` → compact list row (View / Review / demoted / no-details)

Turn the grid tile into a one-row card. Selectable rows: checkbox + [title + meta line] + right cluster (chip? + View/Review button). Drop the inline `<dl>` summary, data-gap chips, diagrams/reel badges, `-publish-live`, and the `-title-link` on the selectable card (title → plain `-title`). Preserve the demoted (banner + rescan, no checkbox) and no-details (`data-no-details`, `SheetTitleLink`/`-title-link`, no button) variants.

**Files:**
- Modify: `components/admin/wizard/Step3SheetCard.tsx`
- Test: `tests/components/step3SheetCard.test.tsx`, `tests/components/step3SheetCard.transitions.test.tsx`

**Interfaces:**
- Consumes: `venueDisplay` (`@/lib/venue/venueLocation`), `dateSummarySegments`, `summarizeDataGaps`/`dataGapClassDetails` (`@/lib/parser/dataGaps`), `pr.show.client_label` — all already imported.
- Produces: selectable card testids `wizard-step3-card-${dfid}` + `-title` + `-client` + `-dates` + `-venue` + `-review-chip` (warn/demoted only) + `-more` (button). No-details keeps `-summary` + `-title-link` + `data-no-details`. Demoted keeps `wizard-step3-rescan-review-${dfid}` + banner. Button opens `Step3ReviewModal` unchanged.

- [ ] **Step 1: Write the failing tests** — the largest delta. Rewrite the relevant `step3SheetCard.test.tsx` describe blocks; derive expectations from fixture dimensions:

```tsx
it("clean, no warnings → View button, no chip, plain title (no -title-link)", () => {
  const q = render(<Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />);
  expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-more`)).toHaveTextContent("View");
  expect(q.queryByTestId(`wizard-step3-card-${DFID}-review-chip`)).toBeNull();
  expect(q.queryByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeNull();
  expect(q.getByTestId(`wizard-step3-card-${DFID}-title`)).toBeInTheDocument();
});
it("clean, N data-gap warnings → Review button + chip 'N need a look' (verb-agreed)", () => {
  const q = render(<Step3SheetCard row={stagedRow(parseResult({ warnings: twoFieldUnreadable() }))} wizardSessionId={WSID} />);
  const chip = within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`);
  expect(chip).toHaveTextContent("2 need a look");   // total===2 from fixture
  expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-more`)).toHaveTextContent("Review");
});
it("single warning → 'needs' singular", () => {
  const q = render(<Step3SheetCard row={stagedRow(parseResult({ warnings: oneFieldUnreadable() }))} wizardSessionId={WSID} />);
  expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`)).toHaveTextContent("1 needs a look");
});
it("meta line shows client · dates · venue from parseResult.show, omitting absent segments", () => {
  const q = render(<Step3SheetCard row={stagedRow(parseResult({ warnings: [], clientLabel: "Acme" }))} wizardSessionId={WSID} />);
  expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-client`)).toHaveTextContent("Acme");
  // a fixture with no client renders no -client node:
  const q2 = render(<Step3SheetCard row={stagedRow(parseResult({ warnings: [], clientLabel: null }))} wizardSessionId={WSID} />);
  expect(q2.queryByTestId(`wizard-step3-card-${DFID}-client`)).toBeNull();
});
// Demoted has TWO live sub-branches (Step3SheetCard.tsx:325-373): RESCAN_REVIEW_REQUIRED →
// RescanReviewBanner (`-rescan-review`), every OTHER non-null code → NotPublishableNote
// (`-not-publishable`). BOTH suppress the checkbox and are non-selectable. Cover both.
it("demoted RESCAN → no checkbox, 'Needs another look' chip, rescan banner, title-link, AND a Review (-more) modal trigger", () => {
  const q = render(<Step3SheetCard row={{ ...stagedRow(parseResult({ warnings: [] })), lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED" }} wizardSessionId={WSID} />);
  expect(q.queryByTestId(`wizard-step3-checkbox-${DFID}`)).toBeNull();
  expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`)).toHaveTextContent("Needs another look");
  expect(q.getByTestId(`wizard-step3-rescan-review-${DFID}`)).toBeInTheDocument();
  expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeInTheDocument(); // §4.3/§9
  // §4.3: demoted keeps the modal trigger (the shared `-more` button, label "Review").
  const more = q.getByTestId(`wizard-step3-card-${DFID}-more`);
  expect(more).toHaveTextContent("Review");
  fireEvent.click(more);
  return waitFor(() => expect(q.getByRole("dialog")).toBeInTheDocument());
});
it("demoted NON-RESCAN (WIZARD_SESSION_SUPERSEDED) → no checkbox, chip, NotPublishableNote (not rescan), title-link, Review (-more) trigger", async () => {
  const q = render(<Step3SheetCard row={{ ...stagedRow(parseResult({ warnings: [] })), lastFinalizeFailureCode: "WIZARD_SESSION_SUPERSEDED" }} wizardSessionId={WSID} />);
  expect(q.queryByTestId(`wizard-step3-checkbox-${DFID}`)).toBeNull();
  expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`)).toHaveTextContent("Needs another look");
  expect(q.getByTestId(`wizard-step3-card-${DFID}-not-publishable`)).toBeInTheDocument();
  expect(q.queryByTestId(`wizard-step3-rescan-review-${DFID}`)).toBeNull(); // non-RESCAN → no rescan link
  expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeInTheDocument();
  fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));       // modal trigger preserved
  await waitFor(() => expect(q.getByRole("dialog")).toBeInTheDocument());
});
it("no-details (parseResult null) → couldn't-read card, no checkbox/chip/button, keeps -title-link", () => {
  const q = render(<Step3SheetCard row={stagedRow(null, { driveFileName: "broken.sheet" })} wizardSessionId={WSID} />);
  expect(card(q)).toHaveAttribute("data-no-details", "true");
  expect(card(q).textContent).toContain("broken.sheet");
  expect(q.queryByTestId(`wizard-step3-card-${DFID}-more`)).toBeNull();
  expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeInTheDocument();
});
it("Review/View opens the modal (mounts on click)", async () => {
  const q = render(<Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />);
  fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
  await waitFor(() => expect(q.getByRole("dialog")).toBeInTheDocument());
});
```
Fixture helpers to add (mirror existing builders; each warning is `{ code: "FIELD_UNREADABLE", … }` so `summarizeDataGaps().total` = its length): `oneFieldUnreadable()`, `twoFieldUnreadable()`, and `parseResult({ clientLabel })` threading `pr.show.client_label`.

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/components/step3SheetCard.test.tsx` → FAIL (old DOM).

- [ ] **Step 3: Implement** — restructure the selectable render path. **All three variant roots must be `<article data-testid={`wizard-step3-card-${dfid}`}>`** (so the Playwright `article[data-testid^="wizard-step3-card-"]` selectors resolve exactly one element per card). Keep the top guards in order: no-details (`!pr || !pr.show`) returns the existing `data-no-details` card (restyle to compact, keep `-summary` + `SheetTitleLink`/`-title-link`); demoted (`isFinalizeDemoted`, `Step3SheetCard.tsx:237`) returns a non-selectable card with the non-numeric "Needs another look" chip and NO checkbox, keeping BOTH existing sub-branches: `isDirtyRescan` (`=== "RESCAN_REVIEW_REQUIRED"`) → `RescanReviewBanner` (`-rescan-review`); `!isDirtyRescan && isFinalizeDemoted` (any other code) → `NotPublishableNote` (`-not-publishable`, `Step3SheetCard.tsx:373`). Both demoted sub-branches **must keep `SheetTitleLink` (`-title-link`)** (already at `Step3SheetCard.tsx:397`; do not replace it with the plain `-title`) **and the shared `-more` modal trigger** (label "Review" since demoted ⇒ needsLook) — the `-more` button + `Step3ReviewModal` live in the shared render body (`Step3SheetCard.tsx:519-570`, NOT variant-gated), so a demoted row keeps read-only modal access alongside its banner/note; do not drop it. Otherwise the compact selectable card (plain `-title`, checkbox with centered `-checkbox-box`, meta line, chip when `needsLook`, View/Review):

```tsx
// selectable compact row
const gaps = summarizeDataGaps(stripLegacyUnknownFieldAnchors(arr(pr.warnings)));
const needsLook = gaps.total > 0;
const client = pr.show.client_label || null;
const segs = dateSummarySegments(pr.show.dates);
const { name: venueName } = venueDisplay(pr.show.venue);
return (
  {/* spec §5 mobile: the row WRAPS below `sm` — checkbox+text on row 1, the
      right cluster becomes a full-width second row (justify-between) so a long
      title never wraps per-word. `flex-wrap` + the cluster's `max-sm:w-full`
      (basis 100% → own line). DI-4 (Task 7) pins the wrap + no-overflow at 360px. */}
  <article data-testid={`wizard-step3-card-${dfid}`} className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border ${needsLook ? "border-border-strong" : "border-border"} bg-surface p-tile-pad shadow-tile`}>
    <PublishCheckbox … />
    <div className="min-w-0 flex-1">
      <p data-testid={`wizard-step3-card-${dfid}-title`} className="truncate text-base font-semibold text-text-strong">{pr.show.title || titleFallback}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle">
        {client && <span data-testid={`wizard-step3-card-${dfid}-client`}>{client}</span>}
        {segs.length > 0 && <span data-testid={`wizard-step3-card-${dfid}-dates`}>{segs.join(" · ")}</span>}
        {venueName && <span data-testid={`wizard-step3-card-${dfid}-venue`}>{venueName}</span>}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:justify-between">
      {needsLook && (
        <span data-testid={`wizard-step3-card-${dfid}-review-chip`} className="inline-flex items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-text">
          <span aria-hidden className="size-1.5 rounded-full bg-status-review" />
          {gaps.total} {gaps.total === 1 ? "needs" : "need"} a look
        </span>
      )}
      <MoreButton label={needsLook ? "Review" : "View"} … />
    </div>
  </article>
);
```
Demoted chip: same markup, non-numeric `"Needs another look"`, no count. Keep the `MoreButton`/modal mount logic (`detailsOpen`) unchanged; only its visible label + styling change (ghost for View, outline for Review — NOT accent). Remove the collapsed `<dl>`, data-gap chips, badges, `-publish-live`. Insert `·` separators via `gap-x-2` + a CSS `·` pseudo, OR render the dot as a styled `<span>` between segments (keep it out of the text nodes so `-dates`/`-venue` assertions stay clean).

**Re-center the checkbox for the single-row card (load-bearing for DI-2).** `PublishCheckbox` (`Step3SheetCard.tsx:108-137`) is currently top-aligned for the wrapping-title grid tile: its `<label>` uses `-m-3 -mt-2.5 items-start`, and its **only testid is on the `sr-only <input>`** — the *visible* box is the `<span aria-hidden>`. In the compact `items-center` row this top offset leaves the visible box above the row's vertical center. Change the label to center: `className="relative -m-3 inline-flex shrink-0 cursor-pointer items-center justify-center p-3"` (drop `-mt-2.5`, `items-start`→`items-center`, `justify-start`→`justify-center`) — `PublishCheckbox` is only consumed by this card, so this is safe. AND add a measurable testid to the visible box so the real-browser DI-2 assertion targets what the eye sees: on the `<span aria-hidden>` add `data-testid={`wizard-step3-card-${driveFileId}-checkbox-box`}`. (The `sr-only` input keeps its `wizard-step3-checkbox-${driveFileId}` testid for interaction tests.)

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/components/step3SheetCard.test.tsx tests/components/step3SheetCard.transitions.test.tsx` → PASS. Update `transitions.test.tsx` live-region assertions to the new DOM.

- [ ] **Step 4b: Delete the obsolete card-dimensions e2e** — the compact card removes the `-summary-block`/`-badge-diagrams`/`-warnings` DOM and the fixed-width grid column that `tests/e2e/step3-card-dimensions.spec.ts` transcribes and measures. `git rm tests/e2e/step3-card-dimensions.spec.ts` (its DI intent is re-covered by Task 7's DI-2). Confirm nothing else imports it: `grep -rn "step3-card-dimensions" tests` → none.

- [ ] **Step 5: Commit** — `feat(crew-page): compact Step-3 sheet card (View/Review/demoted/no-details)` (includes the obsolete-spec deletion).

---

### Task 5: `Step3Review` single-column list + edge-section restyle + move publish-count out of header

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (list `:1054-1078`; `Step3PublishHeader` `:519-561`; needs-attention `:1016-1044`; set-aside `:1083-1108`; empty `:995-1005`), `components/admin/OnboardingWizard.tsx` (container width `:485`)
- Test: `tests/components/admin/wizard/Step3Review.test.tsx`, `tests/components/admin/wizard/step3PublishSettlement.test.tsx`

**Interfaces:**
- Consumes: extended `Step3PublishCounts` (Task 1).
- Produces: `wizard-step3-card-grid` kept (now a `flex flex-col gap-3` list); `wizard-step3-publish-count` **removed** from the header (moves to the bar, Task 6); `wizard-step3-select-all` stays; needs-attention/set-aside/empty testids unchanged.

- [ ] **Step 1: Write the failing tests**:

```tsx
it("clean rows render as a single-column list (not a multi-col grid)", () => {
  render(<Step3Review wizardSessionId={WSID} rows={[cleanRow("a","staged"), cleanRow("b","staged")]} />);
  const list = screen.getByTestId("wizard-step3-card-grid");
  expect(list.className).not.toMatch(/grid-cols-2|lg:grid-cols|xl:grid-cols/);
  expect(list.className).toMatch(/flex-col/);
});
it("publish-count no longer renders inside the header select-all block", () => {
  render(<Step3Review wizardSessionId={WSID} rows={[cleanRow("a","staged")]} />);
  // select-all remains; the count testid is gone from Step3Review (it lives in the bar)
  expect(screen.getByTestId("wizard-step3-select-all")).toBeInTheDocument();
  expect(screen.queryByTestId("wizard-step3-publish-count")).toBeNull();
});
it("needs-attention + set-aside + empty testids preserved", () => {
  render(<Step3Review wizardSessionId={WSID} rows={[hardFailRow("a"), ignoredRow("b")]} />);
  expect(screen.getByTestId("wizard-step3-needs-attention")).toBeInTheDocument();
  expect(screen.getByTestId("wizard-step3-ignored")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx -t "single-column|publish-count no longer"` → FAIL.

- [ ] **Step 3: Implement** — change the list `<ul>` classes from `grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-3` to `flex flex-col gap-3`; rewrite its comment. Refactor `Step3PublishHeader` to render select-all WITHOUT the count (remove both `wizard-step3-publish-count` sites `:530,561`; keep the checkbox + label). Restyle the needs-attention plate, set-aside `SetAsideSection` cards, and empty card to the new compact idiom (keep testids + copy). In `OnboardingWizard.tsx:485`, change `step === 3 ? "max-w-2xl lg:max-w-6xl"` → `"max-w-3xl"` and update the adjacent comment.

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx tests/components/admin/wizard/step3PublishSettlement.test.tsx tests/components/admin/OnboardingWizard.test.tsx` → PASS.

- [ ] **Step 4b: Delete the obsolete grid-layout e2e** — `tests/e2e/step3-grid-layout.spec.ts` asserts the list "stays multi-column" / "at least two cells share a row"; the redesign is single-column, so those assertions are now false by design. `git rm tests/e2e/step3-grid-layout.spec.ts` (superseded by Task 7's DI assertions). Confirm no importers: `grep -rn "step3-grid-layout" tests` → none.

- [ ] **Step 5: Commit** — `feat(crew-page): single-column Step-3 list + edge-section restyle` (includes the obsolete grid-layout spec deletion).

---

### Task 6: Sticky `Step3PublishBar` + `FinalizeButton` `panelPlacement` + Back-in-bar

**Files:**
- Create: `components/admin/wizard/Step3PublishBar.tsx`
- Modify: `components/admin/wizard/Step3ReviewWithFinalize.tsx`, `components/admin/FinalizeButton.tsx`, `components/admin/OnboardingWizard.tsx` (drop top Back for step 3)
- Test: `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx`, `tests/components/admin/FinalizeButton.test.tsx`, `tests/components/onboardingWizardNav.test.tsx`

**Interfaces:**
- Consumes: `Step3PublishCounts` (Task 1); the unchanged `FinalizeButton` props.
- Produces: `Step3PublishBar` (presentational). New testids `wizard-step3-back` (bar), `wizard-step3-publish-count` (now in bar). `FinalizeButton` gains `panelPlacement?: "above" | "below"` (default `"below"`).

- [ ] **Step 1: Write the failing tests**:

```tsx
// Step3ReviewWithFinalize.test.tsx
it("sticky bar shows selected count + Back(→step 2) + FinalizeButton", () => {
  render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[cleanRow("a","applied"), cleanRow("b","staged")]} finishable initialPublishCount={1} initialUncheckedCleanCount={1} />);
  expect(screen.getByTestId("wizard-step3-publish-count")).toHaveTextContent("1 of 2 selected to publish");
  const back = screen.getByTestId("wizard-step3-back");
  expect(back.getAttribute("href")).toBe("/admin?step=2");
  expect(screen.getByTestId("wizard-finalize-button")).toBeInTheDocument();
});
it("selectableTotal===0 (only a no-details clean row) but finishable → '0 of 0', Publish stays ENABLED (finish-with-nothing is reachable)", () => {
  // a clean 'staged' row with parseResult null → no-details → not selectable; finishable (no blocking row).
  render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[noDetailsRow("a")]} finishable initialPublishCount={0} initialUncheckedCleanCount={1} />);
  expect(screen.getByTestId("wizard-step3-publish-count")).toHaveTextContent("0 of 0 selected to publish");
  expect(screen.getByTestId("wizard-finalize-button")).toBeEnabled(); // existing finishable gate, NOT selectable-count
});
it("a blocking row → finishable=false → Publish DISABLED (unchanged finishable gate)", () => {
  render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[hardFailRow("a")]} finishable={false} initialPublishCount={0} initialUncheckedCleanCount={0} />);
  expect(screen.getByTestId("wizard-step3-publish-count")).toHaveTextContent("0 of 0 selected to publish");
  expect(screen.getByTestId("wizard-finalize-button")).toBeDisabled();
});
// FinalizeButton.test.tsx
it("panelPlacement='above' renders panels before the trigger; behavior/testids unchanged", () => {
  render(<FinalizeButton wizardSessionId={WSID} publishCount={0} uncheckedCleanCount={1} panelPlacement="above" />);
  const root = screen.getByTestId("wizard-finalize");
  expect(root.className).toContain("flex-col-reverse");   // layout-only marker
  expect(screen.getByTestId("wizard-finalize-button")).toBeInTheDocument(); // still present
});
it("default (no panelPlacement) keeps the current order", () => {
  render(<FinalizeButton wizardSessionId={WSID} publishCount={1} uncheckedCleanCount={0} />);
  expect(screen.getByTestId("wizard-finalize").className).not.toContain("flex-col-reverse");
});
// Fixture note: add `noDetailsRow(dfid)` (a `staged` clean row with `parseResult: null`)
// alongside the existing cleanRow/hardFailRow builders.
// HARNESS + FILE PLACEMENT: `fetchStep3Data` is a module-lexical function in
// OnboardingWizard.tsx and CANNOT be spied, so a step-3 render must AVOID Step3Container.
// `tests/components/onboardingWizardNav.test.tsx` already solves this and OWNS the chrome
// contract: it renders OnboardingWizard with `settings.pending_wizard_session_id === null`,
// so step 3 hits the NO-SESSION empty state (`wizard-step3-no-session`) instead of
// Step3Container → ZERO Supabase, while the stepper + top Back still render. It defines
// `FRESH_SETTINGS` as a FILE-LOCAL const (NOT exported). Therefore ADD these two
// OnboardingWizard-render tests TO `onboardingWizardNav.test.tsx` (where FRESH_SETTINGS is
// in scope), NOT to the Step3ReviewWithFinalize file. The *bar* Back (needs a live session)
// is asserted separately by the Step3ReviewWithFinalize render above (no OnboardingWizard).
it("step 3 renders no top Back link (top Back removed) — onboardingWizardNav.test.tsx", async () => {
  render(await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "3" } }));
  expect(screen.queryByTestId("wizard-back-link")).toBeNull();              // top Back gone on step 3
  expect(screen.getByTestId("wizard-step3-no-session")).toBeInTheDocument(); // no-session state (no Supabase)
});
it("step 2 STILL renders the top Back link (only step 3 loses it) — onboardingWizardNav.test.tsx", async () => {
  render(await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "2" } }));
  expect(screen.getByTestId("wizard-back-link").getAttribute("href")).toBe("/admin?step=1");
});
```

- [ ] **Step 2: Run to verify it fails** — run the three test files → FAIL.

- [ ] **Step 3: Implement**:
  - `FinalizeButton`: root `className={`flex ${panelPlacement === "above" ? "flex-col-reverse" : "flex-col"} gap-3`}`; nothing else changes (sr-announcer stays first child → visually last under reverse, immaterial). Add the prop to the type with default `"below"`.
  - `Step3PublishBar.tsx` (`"use client"`, presentational): `<div data-testid="wizard-step3-publish-bar" className="sticky bottom-0 z-10 flex w-full flex-wrap items-end gap-x-3 gap-y-2 border-t border-border bg-surface/90 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">{children}</div>` — accepts `{ children }`. Notes: **`w-full` is load-bearing** — the bar's parent is the `flex flex-col` frame and this project's Tailwind v4 does NOT default `align-items: stretch`, so without `w-full` the bar shrinks to its content width and DI-3 fails (spec §7). **`flex-wrap`** lets the count/Back/Publish stack on very narrow widths (spec §5 mobile) instead of overflowing. **`pb-[calc(env(safe-area-inset-bottom)+0.75rem)]`** clears the iOS home indicator (spec §5). The `data-testid` is what DI-3/DI-4 target. (Layout only.)
  - `Step3ReviewWithFinalize`: wrap the content in `<div className="relative flex min-h-full flex-col">`; add bottom padding on the scroll body so the last card isn't occluded (`pb-24`); render, when `rows.length > 0`, `<Step3PublishBar>` containing: `<p data-testid="wizard-step3-publish-count" className="text-sm tabular-nums text-text-subtle"><b>{counts.selectedCount}</b> of {counts.selectableTotal} selected to publish</p>`, a `flex-1` spacer, `<Link data-testid="wizard-step3-back" href="/admin?step=2" className="…ghost…">Back</Link>`, and `<FinalizeButton wizardSessionId={…} disabled={!finishable} publishCount={counts.publishCount} uncheckedCleanCount={counts.uncheckedCleanCount} panelPlacement="above" />`. **The `disabled={!finishable}` gate is UNCHANGED** — it is NOT tied to `selectableTotal`; a finishable page with `selectableTotal === 0` keeps Publish enabled (finish-with-nothing stays reachable, spec §4.4/§10). Seed `selectableTotal`/`selectedCount` in the initial `useState` via `computeSelectableCounts(rows)` (Task 1's exported helper — no new props, no flash).
  - `OnboardingWizard`: change the top `{step !== 1 ? <BackLink step={step} /> : null}` (`:494`) → `{step === 2 ? <BackLink step={2} /> : null}` so step 3 shows no top Back.

- [ ] **Step 4: Run to verify it passes** — run the three files + the FULL FinalizeButton suite to prove the state machine is intact: `pnpm vitest run tests/components/admin/FinalizeButton.test.tsx tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx tests/components/onboardingWizardNav.test.tsx` → PASS.

- [ ] **Step 5: Commit** — `feat(crew-page): sticky Step-3 publish bar re-homing FinalizeButton + Back`.

---

### Task 7: Real-browser layout-dimensions assertions (DI-1…DI-4, standalone static harness)

jsdom does not compute layout; a fixed-dimension parent collapse (Tailwind v4 has no default `align-items: stretch`) passes unit tests. **This repo has NO live-app step-3 seed** — every existing step-3 layout spec (`step3-grid-layout` [deleted], `step3-card-dimensions` [deleted], `step3-schedule-bookend-layout`, `step3-review-modal.layout`) is a **standalone static-HTML harness**: compile the real `app/globals.css` via `@tailwindcss/cli`, write a static page that transcribes the component's rendered markup (real class names), serve it over `http.createServer`, and measure with Playwright. Follow that exact pattern.

**Files:**
- Create: `tests/e2e/step3-review-page.layout.spec.ts`

**Interfaces:** a self-contained static harness (no auth, no Supabase, no seed). The transcribed HTML must include: the redesigned stepper (`wizard-step-indicator` + 3 pills with labels + connectors), the header, a `flex flex-col` list (`wizard-step3-card-grid`) with **≥2 selectable cards** (`<article data-testid="wizard-step3-card-<dfid>">` each containing `-checkbox-box`, `-title`, `-more`) plus **enough cards to exceed the viewport height** (so DI-3's occlusion scroll is meaningful) and at least one needs-a-look card, and the sticky `wizard-step3-publish-bar` (count `wizard-step3-publish-count` + `wizard-step3-back` + `wizard-finalize-button`), all inside `wizard-step3-onboarding`/`onboarding-wizard` container markup. **The transcription must copy the EXACT class strings from the Task 2/4/5/6 components** (that is what makes the CSS/layout assertion faithful) — a comment in the spec must point at the source components so a future class change is kept in sync.

- [ ] **Step 1: Write the failing spec** — mirror `step3-schedule-bookend-layout.spec.ts`'s scaffold (`beforeAll` compiles CSS + writes HTML + starts the server into `baseUrl`; `afterAll` closes it), then assert the four dimensional invariants from spec §7, reading `getBoundingClientRect()` in the real browser:

```ts
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";

let baseUrl: string;
let server: Server;
test.beforeAll(async () => {
  // 1) compile the real token CSS (mirrors step3-schedule-bookend-layout.spec.ts):
  //    dlx @tailwindcss/cli@<pinned> -i <globals.css entry> -o out.css
  // 2) write page.html transcribing the redesigned shell markup (classes copied
  //    VERBATIM from Step3SheetCard / Step3Review / StepIndicator / Step3PublishBar).
  // 3) serve the dir via http.createServer; set baseUrl = `http://127.0.0.1:${port}/page.html`.
});
test.afterAll(() => server?.close());

test.describe("Step-3 review page — layout dimensions", () => {
  test("DI-1: stepper does not overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(baseUrl);
    const nav = page.getByTestId("wizard-step-indicator");
    const { scrollW, clientW } = await nav.evaluate((n) => ({ scrollW: n.scrollWidth, clientW: n.clientWidth }));
    expect(scrollW).toBeLessThanOrEqual(clientW + 0.5);
  });
  test("DI-2: card checkbox + button are vertically centered within the card", async ({ page }) => {
    await page.goto(baseUrl);
    // Use a selectable (View/Review) card — it has both the visible checkbox box
    // and the -more button. Its data-testid is exactly `wizard-step3-card-<dfid>`.
    // Scope to the card ARTICLE (not a descendant testid like -more/-title), and to a
    // SELECTABLE card (one that actually has the visible checkbox box) via :has().
    const card = page
      .locator('article[data-testid^="wizard-step3-card-"]:has([data-testid$="-checkbox-box"])')
      .first();
    const rects = await card.evaluate((el) => {
      const c = el.getBoundingClientRect();
      // Measure the VISIBLE checkbox box (the sr-only input has 0 layout size).
      const box = el.querySelector('[data-testid$="-checkbox-box"]')!.getBoundingClientRect();
      const btn = el.querySelector('[data-testid$="-more"]')!.getBoundingClientRect();
      const mid = (r: DOMRect) => r.top + r.height / 2;
      return { cardMid: mid(c), boxMid: mid(box), btnMid: mid(btn) };
    });
    expect(Math.abs(rects.boxMid - rects.cardMid)).toBeLessThanOrEqual(1);
    expect(Math.abs(rects.btnMid - rects.cardMid)).toBeLessThanOrEqual(1);
  });
  test("DI-3: sticky bar spans the container width and does not occlude the last card", async ({ page }) => {
    await page.goto(baseUrl);
    const bar = page.getByTestId("wizard-step3-publish-bar");
    const container = page.getByTestId("onboarding-wizard");
    const [barW, contW] = await Promise.all([
      bar.evaluate((b) => b.getBoundingClientRect().width),
      container.evaluate((c) => c.getBoundingClientRect().width),
    ]);
    expect(Math.abs(barW - contW)).toBeLessThanOrEqual(0.5);
    // Not-occluded: SCROLL the last card into view first (the list is unbounded,
    // so the last card starts below the fold). The body's bottom padding must keep
    // it clear of the sticky bar even at the very bottom of the scroll.
    // The card ARTICLE only (descendant testids share the prefix); every variant's
    // root is <article data-testid="wizard-step3-card-<dfid>">.
    const lastCard = page.locator('article[data-testid^="wizard-step3-card-"]').last();
    await lastCard.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // settle at absolute bottom
    const lastCardBottom = await lastCard.evaluate((el) => el.getBoundingClientRect().bottom);
    const barTop = await bar.evaluate((b) => b.getBoundingClientRect().top);
    expect(lastCardBottom).toBeLessThanOrEqual(barTop + 0.5);
    // spec §7 DI-3: the idle bar's Publish button is fully within the viewport…
    const vh = page.viewportSize()!.height;
    const pubRect = await page.getByTestId("wizard-finalize-button").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { bottom: r.bottom, mid: r.top + r.height / 2 };
    });
    expect(pubRect.bottom).toBeLessThanOrEqual(vh + 0.5);
    // …and the idle-row items (count · Back · Publish) share the bar's baseline row
    // (bar is items-end): each item's vertical mid sits within the bar's own box.
    const barBox = await bar.evaluate((b) => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const backMid = await page.getByTestId("wizard-step3-back").evaluate((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    const countMid = await page.getByTestId("wizard-step3-publish-count").evaluate((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    for (const m of [pubRect.mid, backMid, countMid]) {
      expect(m).toBeGreaterThanOrEqual(barBox.top - 0.5);
      expect(m).toBeLessThanOrEqual(barBox.bottom + 0.5);
    }
  });
  test("DI-4: at 360px the card does not overflow and its right cluster wraps below the title (spec §5 mobile)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(baseUrl);
    const card = page
      .locator('article[data-testid^="wizard-step3-card-"]:has([data-testid$="-checkbox-box"])')
      .first();
    // No horizontal overflow within the card at mobile width.
    const { scrollW, clientW } = await card.evaluate((el) => ({ scrollW: el.scrollWidth, clientW: el.clientWidth }));
    expect(scrollW).toBeLessThanOrEqual(clientW + 0.5);
    // The right cluster (the -more button) has wrapped to its own row: its top is
    // at/below the title's bottom (not on the same line as the title).
    const { titleBottom, btnTop } = await card.evaluate((el) => ({
      titleBottom: el.querySelector('[data-testid$="-title"]')!.getBoundingClientRect().bottom,
      btnTop: el.querySelector('[data-testid$="-more"]')!.getBoundingClientRect().top,
    }));
    expect(btnTop).toBeGreaterThanOrEqual(titleBottom - 0.5);
  });
});
```
`baseUrl` is set by `beforeAll` (the served static harness). `Step3PublishBar`'s root carries `data-testid="wizard-step3-publish-bar"` (Task 6), which the transcribed HTML reproduces verbatim. The `beforeAll` CSS-compile + `createServer` scaffold is copied from `tests/e2e/step3-schedule-bookend-layout.spec.ts` (the pinned `@tailwindcss/cli` version + the globals.css entry pattern it uses).

- [ ] **Step 2: Prove each assertion BITES (negative-regression red).** A real-browser layout assertion is only meaningful if it FAILS when the invariant is violated — run it green against the built page, then, one at a time, temporarily break each invariant and confirm the matching assertion goes RED, then restore:
  - DI-1: remove the stepper's `hidden sm:inline` on non-active labels → re-run at 320px → DI-1 FAILS (overflow) → restore.
  - DI-2: restore `PublishCheckbox`'s old `-mt-2.5 items-start` (top-align) on the label → DI-2 FAILS (the visible checkbox box sits above the card's vertical center) → restore the centered version. (Also verify removing `items-center` from the card row itself fails DI-2.)
  - DI-3: remove the bar's `w-full` class → DI-3 FAILS (bar shrinks to content width in the non-stretch flex parent) → restore. (Also confirm removing the body's bottom padding makes the occlusion half of DI-3 fail.)
  - DI-4: remove the card's `flex-wrap` (or the right cluster's `max-sm:w-full`) → DI-4 FAILS (the cluster stays on the title's row / the card overflows at 360px) → restore.
  Record the four red runs (DI-1 … DI-4). This is the TDD-red step for a layout gate (per the negative-regression discipline — a layout assertion that can't fail is tautological).

- [ ] **Step 3: Implement** — the deliverable is the spec + its transcribed static HTML (real compiled CSS). The only product-code touch is `data-testid="wizard-step3-publish-bar"` on the `Step3PublishBar` root (folded into Task 6) so DI-3's selector is stable. This spec **supersedes** the two obsolete step3 layout specs deleted in Tasks 4b/5b (`step3-card-dimensions.spec.ts`, `step3-grid-layout.spec.ts`) — confirm they are gone (`ls tests/e2e/step3-*.spec.ts` shows only this new one plus the still-valid `step3-review-modal.*` and `step3-schedule-bookend-layout.spec.ts`). **Fidelity note:** because the harness transcribes the shell markup, its class strings MUST match the Task 2/4/5/6 components; the spec carries a comment pointing at each source component so a future class change is caught in review. Confirm the compiled CSS makes the bar full-width, the checkbox/`-more` vertically centered, and the body bottom-padding clear the bar.

- [ ] **Step 4: Run to verify it passes (all invariants restored)** — `pnpm exec playwright test tests/e2e/step3-review-page.layout.spec.ts` → PASS. (Runs in the pinned Playwright Docker image on CI per the byte-comparison/runner discipline; locally validate then let CI confirm.)

- [ ] **Step 5: Commit** — `test(crew-page): real-browser layout assertions for Step-3 page (DI-1…DI-4)`.

---

### Task 8: Transition audit

Enumerate every `AnimatePresence`, ternary render, and conditional block introduced/changed by this redesign and assert each is animated or **deliberately instant**, per spec §8. This redesign introduces **NO** `framer-motion`/`AnimatePresence` — every new conditional is a deliberately-instant mount/unmount or class swap (owned by existing components where it animates, e.g. the modal + the native `<progress>`). The audit both (a) documents each conditional's treatment and (b) proves it renders correctly and without an animation wrapper.

**Complete conditional inventory (every changed surface):**

| # | Conditional (component) | Kind | Treatment | Asserted by |
| --- | --- | --- | --- | --- |
| 1 | Summary paragraph `{rows.length > 0 ? … : null}` (Step3Review) | guard | instant; absent when empty | Task 3 empty test + T8-c |
| 2 | Sticky bar `{rows.length > 0 ? <Step3PublishBar/> : null}` (Step3ReviewWithFinalize) | guard | instant; absent when empty | T8-c |
| 3 | Card variant select: no-details / demoted / selectable (Step3SheetCard) | ternary chain | instant swap (data-fetched per render, no in-place transition) | T8-d |
| 4 | Chip `{needsLook && <chip/>}` + View↔Review label (Step3SheetCard) | conditional | instant | Task 4 tests + T8-d |
| 5 | Checkbox present `{!isFinalizeDemoted && !noDetails}` (Step3SheetCard) | conditional | instant | Task 4 demoted/no-details tests |
| 6 | Publish count text swap (tabular-nums) (bar) | value | instant, no layout shift | T8-a |
| 7 | Stepper pill state done/active/todo + `Check` swap (StepIndicator) | ternary | instant (full page nav; class/glyph swap) | Task 2 tests |
| 8 | Top Back present `{step === 2 …}` — absent on step 3 (OnboardingWizard) | guard | instant | Task 6 no-top-Back test + T8-e |
| 9 | FinalizeButton `panelPlacement` order (flex-col ↔ flex-col-reverse) | layout | instant, no enter/exit anim | T8-f |
| 10 | Modal open/close from Review/View | owned by shipped modal | modal's own transition (unchanged) | Task 4 modal test |
| 11 | **Compound:** open modal while publish `running` | reachable | independent surfaces, no new anim | T8-b |
| 12 | FinalizeButton running/terminal panels (progress/confirm/race/cas/error/complete) | owned by existing FinalizeButton | unchanged (native `<progress>`, instant swaps) | FinalizeButton.test.tsx (Task 6) |

**Files:**
- Create/extend: `tests/components/admin/wizard/step3Page.transitions.test.tsx` (or extend `step3SheetCard.transitions.test.tsx`)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests** — one per inventory row that this redesign owns (rows owned by the shipped modal / existing FinalizeButton are covered by their own suites, cited above). All are deliberately instant:

```tsx
it("checkbox flip updates the bar count instantly, tabular-nums (no layout shift)", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const q = render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[cleanRow("a","staged")]} finishable initialPublishCount={0} initialUncheckedCleanCount={1} />);
  const count = q.getByTestId("wizard-step3-publish-count");
  expect(count.className).toContain("tabular-nums");   // no digit-width jitter
  expect(count).toHaveTextContent("0 of 1 selected to publish");
  // toggling the box optimistically flips the count with no async wait (instant).
  fireEvent.click(q.getByTestId(`wizard-step3-checkbox-a`));
  expect(count).toHaveTextContent("1 of 1 selected to publish");
});
// Helper: a 200 NDJSON response that emits one "listed" event and NEVER sends a
// terminal "result" / closes → FinalizeButton enters `running` and stays there.
import { FINALIZE_STREAM_CONTENT_TYPE } from "@/lib/onboarding/finalizeProgress";
function hangingFinalizeResponse(): Response {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(JSON.stringify({ type: "listed", total: 1 }) + "\n"));
      // no result, no close → the reader awaits forever, state = running
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": FINALIZE_STREAM_CONTENT_TYPE } });
}
it("compound: card modal is reachable while a publish is ACTUALLY RUNNING (both surfaces independent)", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(hangingFinalizeResponse());
  // one applied row → clicking Publish runs the loop directly (no soft-confirm).
  const q = render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[cleanRow("a","applied")]} finishable initialPublishCount={1} initialUncheckedCleanCount={0} />);
  fireEvent.click(q.getByTestId("wizard-finalize-button"));
  // FinalizeButton is now in `running` (its progress panel is mounted).
  await waitFor(() => expect(q.getByTestId("wizard-finalize-progress")).toBeInTheDocument());
  // The card's Review/View button is STILL enabled mid-publish and opens the modal.
  const more = q.getByTestId(/wizard-step3-card-.*-more/);
  expect(more).toBeEnabled();
  fireEvent.click(more);
  await waitFor(() => expect(q.getByRole("dialog")).toBeInTheDocument());
  fetchMock.mockRestore();
});
it("FinalizeButton panelPlacement='above' does not add exit/enter animation (instant swap)", () => {
  const q = render(<FinalizeButton wizardSessionId={WSID} publishCount={0} uncheckedCleanCount={0} panelPlacement="above" />);
  // no AnimatePresence wrapper introduced — the region swaps instantly
  expect(q.getByTestId("wizard-finalize").innerHTML).not.toContain("data-framer");
});
// T8-c: summary + bar guards — present when rows exist, absent when empty (instant, no anim wrapper).
it("T8-c: summary + sticky bar are guarded on rows.length (instant mount/unmount)", () => {
  const full = render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[cleanRow("a","staged")]} finishable initialPublishCount={0} initialUncheckedCleanCount={1} />);
  expect(full.getByTestId("wizard-step3-summary")).toBeInTheDocument();
  expect(full.getByTestId("wizard-step3-publish-bar")).toBeInTheDocument();
  cleanup();
  const empty = render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[]} finishable initialPublishCount={0} initialUncheckedCleanCount={0} />);
  expect(empty.queryByTestId("wizard-step3-summary")).toBeNull();
  expect(empty.queryByTestId("wizard-step3-publish-bar")).toBeNull();
  expect(empty.getByTestId("wizard-step3-empty")).toBeInTheDocument();
});
// T8-d: card variant selection is an instant ternary swap — each variant renders its
// own DOM with no shared-element transition / framer wrapper.
it("T8-d: card variants (selectable / demoted / no-details) swap instantly, no anim wrapper", () => {
  for (const [row, marker] of [
    [stagedRow(parseResult({ warnings: [] })), (q) => q.getByTestId(`wizard-step3-card-${DFID}-more`)],
    [{ ...stagedRow(parseResult({ warnings: [] })), lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED" }, (q) => q.getByTestId(`wizard-step3-rescan-review-${DFID}`)],
    [stagedRow(null, { driveFileName: "x.sheet" }), (q) => q.getByTestId(`wizard-step3-card-${DFID}`)],
  ] as const) {
    const q = render(<Step3SheetCard row={row} wizardSessionId={WSID} />);
    expect(marker(q)).toBeInTheDocument();
    expect(q.getByTestId(`wizard-step3-card-${DFID}`).innerHTML).not.toContain("data-framer");
    cleanup();
  }
});
// T8-e: Back relocation. The top-Back ABSENCE assertion lives in onboardingWizardNav.test.tsx
// (Task 6, null-session OnboardingWizard render — no Supabase). Here in the transitions file
// we only assert the BAR Back via a Step3ReviewWithFinalize render (no OnboardingWizard →
// no FRESH_SETTINGS dependency, no fetch).
it("T8-e: the bar renders its own Back (→ ?step=2), instantly present with the bar", () => {
  const q = render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[cleanRow("a","staged")]} finishable initialPublishCount={0} initialUncheckedCleanCount={1} />);
  expect(q.getByTestId("wizard-step3-back").getAttribute("href")).toBe("/admin?step=2");
});
```

- [ ] **Step 2: Run to verify it fails / passes appropriately** — `pnpm vitest run tests/components/admin/wizard/step3Page.transitions.test.tsx`. These assert the *absence* of unintended animation + presence of the reachable compound path; they should pass once Tasks 4/6 land (write them first as red where the DOM doesn't yet exist).

- [ ] **Step 3: Implement** — no new animation; ensure the compound path stays reachable (do NOT disable the card button during publish). If any assertion fails because a button got disabled, that's the bug to fix.

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit** — `test(crew-page): Step-3 page transition audit (instant swaps + reachable compound modal)`.

---

### Task 9: Impeccable v3 dual-gate (invariant 8)

**Files:** Create `docs/superpowers/plans/2026-07-04-step3-review-page-variant-b-closeout.md` — this standalone feature has no milestone handoff doc, so this close-out doc IS the handoff record required by AGENTS.md invariant 8. Its **§12 "UI quality gate"** section records BOTH commands' findings + dispositions (fixed / deferred-with-rationale). HIGH/CRITICAL deferrals ALSO get a `DEFERRED.md` entry; the PR body links to this §12.

- [ ] **Step 1** — run `/impeccable critique` on the diff (PRODUCT.md → DESIGN.md → register → preflight gates), affected surfaces = all changed `components/**` + the design-token usage.
- [ ] **Step 2** — run `/impeccable audit` on the same diff.
- [ ] **Step 3** — record every finding from BOTH commands in the close-out doc's **§12 "UI quality gate"** with a disposition; fix every HIGH/CRITICAL (re-run the affected task's tests after each fix) OR add an explicit `DEFERRED.md` entry + a §12 line with rationale. Common watch: accent-budget on the Review buttons (must stay non-accent), warn contrast in dark mode, stepper label overflow, sticky-bar occlusion, focus-visible on the new Back link + Review buttons, the double-"Review" affordance on demoted RESCAN cards (banner reapply-link + modal button).
- [ ] **Step 4** — re-run `pnpm vitest run` on all changed component suites to confirm fixes didn't regress.
- [ ] **Step 5: Commit** — `docs(handoff): impeccable UI-gate findings §12` + (if code fixes were made) `fix(crew-page): impeccable critique+audit findings`.

---

### Task 10: Full verification pass (pre-review gate)

- [ ] **Step 1** — `pnpm typecheck` (vitest strips types; catches TS errors that pass vitest but fail `next build`).
- [ ] **Step 2** — FULL affected vitest suite, not just touched files (structural/meta tests): `pnpm vitest run tests/components` (or the repo's canonical `pnpm test` scoping). Grep the vitest SUMMARY line for real failures amid stderr noise. (The Playwright e2e file is NOT a vitest target — it runs under its own runner in Step 4.)
- [ ] **Step 3** — `pnpm format:check` (— `--no-verify` commits skip the prettier hook; CI `quality` fails otherwise). Run `pnpm exec prettier --write` on changed files if needed, then re-stage.
- [ ] **Step 4** — `pnpm exec playwright test tests/e2e/step3-review-page.layout.spec.ts` locally (CI runs it in the pinned image).
- [ ] **Step 5: Commit** — fold any formatting/type fixes into the relevant task commit or a `chore(crew-page): format + typecheck` commit.

---

### Task 11: Plan self-review + Adversarial review (cross-model)

- [ ] **Step 1: Self-review** — re-check this plan against the spec: every spec section (§4.1–§4.5, §6–§11) maps to a task; no placeholders; type/name consistency (`Step3PublishCounts` fields, `panelPlacement`, `rowNeedsLook`, testids) matches across tasks.
- [ ] **Step 2: Adversarial review** — invoke the `adversarial-review` skill → Codex, REVIEWER ONLY, fresh-eyes, iterate until **APPROVE** (no round budget per the ship pipeline). Apply the response ladder: class-sweep each finding; structural defense if a vector recurs 3+ rounds.
- [ ] **Step 3** — On APPROVE, advance to execution (Stage 3 of the ship pipeline). Do NOT pause for user plan review (waived).

---

## Self-review checklist (run by the author before Task 11's Codex round)

1. **Spec coverage:** §4.1 stepper→T2; §4.2 header/summary→T3; §4.3 card variants→T4; §4.4 bar+counts→T1+T6; §4.5 edge→T5; §5 layout→T5+T7; §6 tokens→all (global constraints); §7 dimensional invariants→T7; §8 transitions→T8; §9 DOM/test delta→T2-T6 tests; §10 guards→T3/T4 tests; §11 a11y→T2/T4/T6; §12 non-goals→respected; §13 invariants→global constraints + declarations. No gap.
2. **Placeholder scan:** every code step shows code; no "TBD"/"similar to".
3. **Type consistency:** `Step3PublishCounts { publishCount, uncheckedCleanCount, selectableTotal, selectedCount }` (T1) consumed in T6; `panelPlacement?: "above"|"below"` (T6) used in T7/T8; `rowNeedsLook` (T3) reused conceptually by T4's per-card `needsLook`; testids consistent across tasks and the spec §9 delta.
