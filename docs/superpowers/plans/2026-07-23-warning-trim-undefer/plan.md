# Warning-Trim Un-Defer Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md` (APPROVED, adversarial R5): unify the published Sheet-warnings panel (box always renders, notes become white cards, actionable cards move inside), rename "Parse warnings" → "Sheet warnings", retire the published correction callout (popup wins), pin the wizard branch with two new tests, activate the crew-row alert banner via id-matched fan-out, and reconcile DEFERRED.md.

**Architecture:** All UI work rides the existing published gate (`routedWarningsRenderElsewhere`); the wizard branch is byte-identical (proven by tests landed FIRST). Crew fan-out extends the existing `bucketAttention` placement seam with an index-keyed channel (`byRowIndex`) so id-exactness never depends on display names.

**Tech Stack:** Next.js 16 / React, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + Testing Library (jsdom), Playwright e2e, Tailwind v4 tokens.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md`. §1.1 decisions are ratified — do not relitigate.
- Worktree `/Users/ericweiss/FX-worktrees/warning-trim-undefer`, branch `feat/warning-trim-undefer`. Never edit the main checkout.
- TDD per task: failing test → minimal implementation → pass → commit (conventional commits, one task per commit).
- No raw error codes in UI (invariant 5). No em-dash in user-visible copy; apostrophes as `&rsquo;` or `'` per file convention; 44px tap targets (`min-h-tap-min`); canonical tokens (`text-xs/relaxed`, `text-text-subtle`, etc.).
- No DB migrations, no §12.4 catalog edits, no Supabase read/write path changes (spec §1.1, §6.1, §9).
- Wizard (staged) surface byte-identical except the shared rename literal (spec §1.1).
- exactOptionalPropertyTypes discipline: optional context/prop fields inserted by spread, never explicit `undefined`.
- All new user-visible copy: plain language, no jargon.
- Run `pnpm typecheck && pnpm lint && pnpm format:check` before push; full `pnpm test` before push (scoped runs insufficient).

## File Structure

| File | Role |
|---|---|
| tests/components/admin/parsePanelComposition.test.tsx (NEW) | NEW — Test A (ParsePanel composition) + Test B (wizard warnings-branch pin) |
| tests/components/admin/sheetWarningsPanel.test.tsx (NEW) | NEW — §2.3a state matrix, §2.3 count rule, §2.4 popover truth table + boundary |
| tests/admin/crewMatchFanout.test.ts (NEW) | NEW — §6 derivation guards + completeness rule + conservation |
| `components/admin/wizard/step3ReviewSections.tsx` | Modify — rail label, count helper wiring, WarningsBreakdown published branch, `Step3SectionChrome` (drop `suppressPanelCard`), CrewBreakdown `byIndex` consumption |
| `components/admin/PerShowActionableWarnings.tsx` | Modify — accept a `noteItems` mode is NOT added; unchanged. (Notes use a new leaf, below.) |
| components/admin/NoteWarningCard.tsx (NEW) | NEW — white neutral note card (CompactAlertCard tone="neutral") + popover assembly per §2.4 |
| `components/admin/showpage/sectionWarningExtras.tsx` | Modify — retire `seamless` for warnings (extras thread through chrome) |
| `components/admin/review/ShowReviewSurface.tsx` | Modify — thread warnings extras via chrome `sectionExtras`; drop sibling render + `suppressWarningsPanelCard`; `CrewAttention` gains `byIndex` |
| lib/admin/sheetWarningsCount.ts (NEW) | NEW — `sheetWarningsPanelCount` single-predicate helper |
| `lib/admin/attentionItems.ts` | Modify — `AttentionItem.crewMatch`; `AttentionAlertInput.crewMatch` |
| `lib/adminAlerts/deriveAlertRowFields.ts` | Modify — derive `crewMatch` for `AMBIGUOUS_EMAIL_BINDING` |
| `lib/admin/sectionAttention.ts` | Modify — `byRowIndex` channel + id-placement rule |
| `lib/admin/infoCodeActionability.ts` | Modify or retire — per remaining consumers |
| `app/admin/_showReviewModal.tsx` | Modify — compute `hits(id)` against roster `crewIds`, feed placement |
| `tests/e2e/published-show-attention.spec.ts` | Modify — un-skip line 126 block, extend |
| Rename sweep files (Task 2 list) | Modify — display literals only |
| `DEFERRED.md`, `DEFERRED-archive.md` | Modify — Task 9 |

Interfaces produced (used across tasks):

- `sheetWarningsPanelCount(args: { visibleInfoRows: number; activeHere: number }): number` — Task 3; consumed by heading chip + railCount in Task 5.
- `NoteWarningCard({ warning, driveFileId }: { warning: ParseWarning; driveFileId: string | null }): JSX.Element | null` — Task 4; consumed by WarningsBreakdown in Task 5.
- `notePopoverParts(w: ParseWarning): { copy: string | null; sentence: string | null }` — Task 4 (exported from the new NoteWarningCard file).
- `AttentionItem.crewMatch?: { crewMemberIds: string[]; expectedCount: number }` and `AttentionAlertInput.crewMatch?: …` (same shape) — OPTIONAL fields, spread-inserted only when derived (exactOptionalPropertyTypes; absent == no match, there is no explicit null). Every existing constructor/fixture compiles unchanged (optional). — Task 6.
- `SectionAttentionBucket.byRowIndex?: Map<number, ReactNode[]>` and `BucketOpts.crewRowIndexesForIds?: (ids: readonly string[]) => number[] | null` — Task 6.
- `CrewAttention.byIndex?: ReadonlyMap<number, ReactNode[]>` — Task 7.

Pre-flight for EVERY task: `cd /Users/ericweiss/FX-worktrees/warning-trim-undefer` (shell resets cwd between commands — prefix every command).

---

### Task 1: Wizard-unchanged proof tests (spec §5) — MUST LAND FIRST

**Files:**
- Create: tests/components/admin/parsePanelComposition.test.tsx (new)
- Reference (read-only): `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx:519-520`, `components/admin/wizard/step3ReviewSections.tsx:2754-2995`, `tests/components/admin/stagedCardBaseline.test.tsx` (fixture conventions), trim-spec fixture rule (`docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md:316`)

**Interfaces:** Produces nothing; pins existing behavior. Both describe blocks MUST pass unmodified after Tasks 4-5.

- [ ] **Step 1: Read the two harness precedents** — `tests/components/admin/stagedCardBaseline.test.tsx` (how staged fixtures + ParseWarning rows are built, jsdom setup pragma) and `tests/components/admin/wizard/step3ReviewSections.test.tsx` (how `WarningsBreakdown` mounts standalone: no chrome provider = gate off). Copy their fixture builders; do not invent new shapes.
- [ ] **Step 2: Write Test A (ParsePanel composition), verify it fails only for the right reason** (it should PASS immediately — it pins current behavior; "fail first" here = temporarily assert wrong count to prove the assertion bites, then restore). Shape:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { ParsePanel } from "@/components/admin/ParsePanel";

// Fixture: 3 staged rows (order A,B,C) built with the stagedCardBaseline builders.
test("ParsePanel renders one StagedReviewCard per row, in input order, mounting the actionable-warnings leaf", () => {
  render(<ParsePanel {...panelProps(fixtureRows)} />);
  // Exact-id selector per row: nested warning testids share the prefix, so match card ROOTS only
  const cards = fixtureRows.map((r) => screen.getByTestId(`wizard-step3-card-${r.dfid}`));
  // Exact COUNT via a root-only structural discriminator: a card ROOT is a
  // prefix-matching element with no prefix-matching ancestor (nested warning
  // testids share the prefix but live inside a root). Multiset of root ids
  // must equal the fixture id set, so an extra or unexpected root FAILS.
  const allRoots = Array.from(document.querySelectorAll('[data-testid^="wizard-step3-card-"]'))
    .filter((el) => !el.parentElement?.closest('[data-testid^="wizard-step3-card-"]'));
  expect(allRoots.map((el) => el.getAttribute("data-testid")).sort()).toEqual(
    fixtureRows.map((r) => `wizard-step3-card-${r.dfid}`).sort(),
  );
  // DOM ORDER matches input order (compareDocumentPosition, pairwise)
  for (let i = 1; i < cards.length; i++) {
    expect(cards[i - 1]!.compareDocumentPosition(cards[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  fixtureRows.forEach((row, i) => {
    expect(within(cards[i]!).getByText(row.sheetName)).toBeInTheDocument();
    // Leaf mounted in EVERY row (not just the first)
    expect(cards[i]!.querySelectorAll('[data-testid="per-show-actionable-item"]').length).toBeGreaterThan(0);
  });
  // Wizard-chrome snapshot with card interiors pruned (leaf already snapshotted
  // by stagedCardBaseline): clone, strip per-show-actionable-item subtrees.
  const clone = cards[0]!.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-testid="per-show-actionable-item"]').forEach((n) => n.remove());
  expect(clone.outerHTML).toMatchSnapshot("wizard-chrome-around-first-card");
});
```

Adapt selectors to ParsePanel's real DOM (read the component first; `panelProps` mirrors `app/admin/_showReviewModal.tsx`'s call at `components/admin/ParsePanel.tsx:65-77`).

- [ ] **Step 3: Write Test B (wizard warnings-branch pin).** Mount `WarningsBreakdown` with NO chrome provider (gate off) and a fixture holding: 1 info row, 1 `UNKNOWN_ROLE_TOKEN` warn row, 1 use-raw-eligible structural warn row (trim-spec §12 fixture rule — non-vacuous controls), threading `wizardSessionId` + `dfid`. Assert (counts derived from fixture):
  - every fixture row renders a list row (`wizard-step3-card-<dfid>-warning-<i>` testids, both severities);
  - `correction-loop-callout` present; `…-warnings-nonblocking` present;
  - NO `per-show-actionable-item`, no group eyebrow (`section-warning-controls-*` absent), no bulk chip;
  - the `UNKNOWN_ROLE_TOKEN` row renders an enabled, accessibly-named recognize-role control and the structural row an enabled use-raw control (query within each row's `li`; mock the control boundaries' server dependencies the same way `step3ReviewSections.test.tsx` does).
  - Absence assertions scoped to the rendered `BreakdownSection` subtree, cloned with independently-rendering siblings removed (anti-tautology).
  - **Unconditional-callout proof (spec §4):** a SECOND fixture with warn rows only (zero info rows, zero correction-inviting rows) still renders `correction-loop-callout` — pins "wizard unconditional" rather than "callout when rows invite correction".
- [ ] **Step 4: Run both; verify green.** `pnpm vitest run tests/components/admin/parsePanelComposition.test.tsx` → all pass.
- [ ] **Step 5: Commit** — `test(admin): pin ParsePanel composition and wizard warnings branch (warning-trim-undefer spec §5)`

### Task 2: Rename "Parse warnings" → "Sheet warnings" (spec §3)

**Files:** run `rg -n '"Parse warnings"|Parse warnings' --glob '!node_modules' --glob '!docs' -l` and disposition EVERY hit. Known list (re-verify): `components/admin/wizard/step3ReviewSections.tsx:4219` (rail label), `app/help/_nav.ts:24` (nav title), `app/help/admin/parse-warnings/page.mdx` (H1 + body), `app/help/admin/per-show-panel/page.mdx`, `app/help/tour/page.mdx`, `app/admin/dev/page.tsx`, `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`, `app/admin/_showReviewModal.tsx`, `components/admin/review/ShowReviewSurface.tsx`, `lib/reports/submit.ts` (report subject — user-visible), test pins: `tests/help/page-parse-warnings.test.tsx:51` + `tests/help/page-parse-warnings.test.tsx:55`, `tests/help/page-per-show-panel.test.tsx`, `tests/admin/visibleWarningRows.test.ts`, `tests/adminAlerts/audience.test.ts`, `tests/components/admin/**` + `tests/e2e/_step3ReviewModalHarness.tsx` hits.

**NOT renamed:** route slug `/help/admin/parse-warnings`, `helpHref` anchors, any `data-testid` (`…-breakdown-warnings` etc.), message-catalog codes, `docs/` history.

- [ ] **Step 1:** Update the test pins FIRST to expect "Sheet warnings" (title assertions); run → FAIL.
- [ ] **Step 2:** Apply the display-literal sweep (every hit above; keep slug/testids/hrefs). Help mdx H1 becomes `# Sheet warnings`; body prose updated; nav `title: "Sheet warnings"` with `slug` unchanged.
- [ ] **Step 3:** `pnpm vitest run tests/help tests/admin/visibleWarningRows.test.ts tests/adminAlerts/audience.test.ts tests/components/admin/parsePanelComposition.test.tsx` → PASS (Test A snapshot updates only if the rail label string appears inside it — regenerate deliberately, inspect diff is label-only).
- [ ] **Step 4:** Re-run the sweep command; assert remaining hits are only `docs/`, slugs, and testids. Paste output into commit body.
- [ ] **Step 5: Commit** — `feat(admin): rename Parse warnings panel to Sheet warnings (display literals only)`

### Task 3: Count helper (spec §2.3)

**Files:**
- Create: lib/admin/sheetWarningsCount.ts (new)
- Test: tests/components/admin/sheetWarningsPanel.test.tsx (new; first describe)

**Interfaces:** Produces `export function sheetWarningsPanelCount(args: { visibleInfoRows: number; activeHere: number }): number` (returns the sum; single predicate for heading chip + rail).

- [ ] **Step 1: Failing test** (new file, plain node env for this describe):

```ts
import { sheetWarningsPanelCount } from "@/lib/admin/sheetWarningsCount";

describe("sheetWarningsPanelCount (spec §2.3)", () => {
  it("sums visible info rows and active here-cards; ignored and elsewhere excluded by construction", () => {
    expect(sheetWarningsPanelCount({ visibleInfoRows: 2, activeHere: 3 })).toBe(5);
    expect(sheetWarningsPanelCount({ visibleInfoRows: 0, activeHere: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2:** Run → FAIL (module missing). **Step 3:** Implement (sum; JSDoc citing spec §2.3 and the two readers). **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat(admin): sheetWarningsPanelCount single-predicate helper (spec §2.3)`

### Task 4: NoteWarningCard + popover assembly (spec §2.2.2, §2.4)

**Files:**
- Create: components/admin/NoteWarningCard.tsx (new)
- Create: lib/admin/reviewWarningTitle.ts (new — `reviewWarningTitle` MOVES here verbatim from `components/admin/wizard/step3ReviewSections.tsx:2701-2715`, which re-exports it for its existing four test consumers; this breaks the otherwise-circular import step3ReviewSections → NoteWarningCard → step3ReviewSections that Task 5 would create). `correctionLoopCopy` is already exported from `components/admin/CorrectionLoopCallout.tsx:32` (no cycle — that module imports nothing from this chain).
- Test: tests/components/admin/sheetWarningsPanel.test.tsx (second describe, `@vitest-environment jsdom` pragma at file top since it mixes — if mixing environments is awkward, move Task 3's describe into this jsdom file; both are fine under jsdom)
- Reference: `components/admin/CompactAlertCard.tsx` (tone="neutral"), `components/admin/PerShowActionableWarnings.tsx:125-152` + `components/admin/PerShowActionableWarnings.tsx:240-247` (popover + link gating precedents), `components/admin/CorrectionLoopCallout.tsx:32-34` (`correctionLoopCopy`), `components/admin/wizard/step3ReviewSections.tsx:2701-2715` (`reviewWarningTitle`)

**Interfaces:** Produces `NoteWarningCard({ warning, driveFileId })` and exported pure `notePopoverParts(w: ParseWarning): { copy: string | null; sentence: string | null }`.

- [ ] **Step 1: Failing tests — §2.4 truth table + boundary + guards** (fixture-derived, no hardcoded copy where catalog supplies it):

```tsx
describe("notePopoverParts (spec §2.4 truth table)", () => {
  // copy = FIRST NON-BLANK of longExplanation, then helpfulContext (NOT ??).
  // EXACT-VALUE assertions (anti-tautology): expected strings derive from the
  // catalog and correctionLoopCopy, never re-authored literals.
  const CASES: ReadonlyArray<
    [label: string, w: ParseWarning, copy: string | null, sentence: string | null]
  > = [
    ["copy+cell", warnWith({ code: KNOWN_INFO_CODE, sourceCell: CELL }),
      expectedCopyFor(KNOWN_INFO_CODE), correctionLoopCopy("resync")],
    ["copy only", warnWith({ code: KNOWN_INFO_CODE, sourceCell: null }),
      expectedCopyFor(KNOWN_INFO_CODE), null],
    ["cell only", warnWith({ code: "NOT_A_CODE", sourceCell: CELL }),
      null, correctionLoopCopy("resync")],
    ["neither", warnWith({ code: "NOT_A_CODE", sourceCell: null }), null, null],
  ];
  it.each(CASES)("%s", (_l, w, copy, sentence) => {
    expect(notePopoverParts(w)).toEqual({ copy, sentence });
  });
  it("blank longExplanation falls through to helpfulContext (first-non-blank, not ??)", () => {
    const p = notePopoverParts(warnWith({ code: BLANK_LONG_CODE, sourceCell: null }));
    expect(p.copy).toBe(messageFor(BLANK_LONG_CODE).helpfulContext);
  });
});
describe("NoteWarningCard rendered popover (all four truth-table rows)", () => {
  // For EACH of the four rows: render the card, open the ? trigger (absent-trigger
  // row asserts NO trigger), and assert the popover body holds exactly the expected
  // paragraphs IN ORDER (copy paragraph before sentence paragraph when both present),
  // with textContent equal to the derived expected strings.
  it("copy+cell: two paragraphs, copy first, sentence second", () => { /* … */ });
  it("copy only: single copy paragraph", () => { /* … */ });
  it("cell only: single sentence paragraph", () => { /* … */ });
  it("neither: no ? trigger rendered", () => { /* … */ });
  it("blank-longExplanation fallthrough renders helpfulContext paragraph", () => { /* … */ });
  it("neutral tone, title, guidance; no severity glyph, no Report/Ignore buttons", () => { /* … */ });
  it("no guidance element when context blank", () => { /* … */ });
  it("Open in Sheet renders iff buildSheetDeepLink yields href (null driveFileId + cell → absent)", () => { /* … */ });
});
```

`expectedCopyFor(code)` = `firstNonBlank(messageFor(code).longExplanation, messageFor(code).helpfulContext)` computed in the test from the live catalog — the test cannot pass on a re-authored string.

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `NoteWarningCard`: `CompactAlertCard tone="neutral" stripe="none"`, message = `reviewWarningTitle(w)` + guidance line (`helpfulContext`-derived, omit when blank), helpTrigger = `CompactAlertHelp`-style popover fed by `notePopoverParts` (copy then sentence paragraphs), controls band = Open-in-Sheet link only (result-gated). `notePopoverParts`: `firstNonBlank(longExplanation, helpfulContext)`; sentence = `w.sourceCell ? correctionLoopCopy("resync") : null`. **Step 4:** PASS. **Step 5: Commit** — `feat(admin): NoteWarningCard neutral card with popover assembly (spec §2.4)`

### Task 5: Published panel rebuild (spec §2.2, §2.3a, §4)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (WarningsBreakdown published branch `2754-2895`; `ModalSectionChrome` `hasBody`; `Step3SectionChrome.suppressPanelCard` removal; heading count wiring `884-926`; railCount `4218-4225`)
- Modify: `components/admin/review/ShowReviewSurface.tsx` (`suppressWarningsPanelCard` computation + spread `1074-1076`; warnings extras: thread via chrome `sectionExtras` — drop the `s.id !== "warnings"` exclusion at `1105-1107`; delete the sibling render at `1160`; drop `seamless` opt)
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` (retire `seamless` variant — extras root becomes plain `flex flex-col gap-3`, no `border-t`, since the box supplies the boundary)
- Modify: `lib/admin/infoCodeActionability.ts` + `tests/admin/_metaInfoCodeActionability.test.ts` — VERIFIED (2026-07-23 grep): `infoRowInvitesCorrection`'s ONLY consumer is the published callout gate (`components/admin/wizard/step3ReviewSections.tsx:2880` + import `components/admin/wizard/step3ReviewSections.tsx:107`); after §4 removal the export is dead. Action: RETIRE the export + import; the `INFO_CODE_ACTIONABILITY` registry map stays (the meta-test's two-layer scanner pins info-code coverage independently of the gate) — update `tests/admin/_metaInfoCodeActionability.test.ts` in the SAME commit to drop only its `infoRowInvitesCorrection` consumer-existence assertion (read the file first; keep the registry-completeness layer verbatim)
- Test: tests/components/admin/sheetWarningsPanel.test.tsx (third describe — state matrix)

**Interfaces:** Consumes `NoteWarningCard`, `sheetWarningsPanelCount`. The chrome no longer has `suppressPanelCard`; count for warnings = `sheetWarningsPanelCount({ visibleInfoRows: rows.length, activeHere: here })` when the gate is on, else `rows.length` (wizard, unchanged).

- [ ] **Step 1: Failing tests — §2.3a matrix, FULL six-block assertion per row.** Define one assertion helper `expectBlocks(container, { notes, notesGroup, actionable, ignored, pointer, clean }: Record<BlockName, boolean>)` that asserts presence AND absence of ALL six blocks (parse-notes lines, Notes group eyebrow, actionable groups, ignored disclosure, pointer sentence, Clean row) by their testids/markers — every matrix row calls it with its full boolean vector, so a stale or mutually-exclusive block co-rendering fails the row. Rows (expectations fixture-derived):
  - notes-only → `{notes:false, notesGroup:true, actionable:false, ignored:false, pointer:false, clean:false}`; count == info count;
  - here-cards-only (Silent-was) → notesGroup false, actionable true, others false; extras cards INSIDE the panel-card element; heading count == here; NO seam `border-t` on extras root;
  - both → notesGroup+actionable true, others false; Notes group before actionable groups (DOM order); heading count == info + here (SUMMED, fixture-derived — catches an argument bug that survives the single-source states);
  - ignored-only → ignored+clean true, others false; count 0; carve-out: NO count chip when `flagged` true;
  - elsewhere-only + ign>0 → pointer+ignored true, others false;
  - empty → clean true, all others false; "(0)" chip when not flagged.
  - Box (panel-card element with `border`) present in EVERY row.
  - **§4 published retirement:** every row ALSO asserts `correction-loop-callout` testid absent (folded into `expectBlocks`).
  - **§2.5 no-cap:** one row with a 40-warning fixture (25 info + 15 here-routed) asserting rendered note-card count == 25 and amber-card count == 15 (count equality == no truncation).
- [ ] **Step 2:** Run → FAIL. 
- [ ] **Step 3: Implement.** In `WarningsBreakdown` published branch: replace the info-row `<li>` list with `NoteWarningCard`s under a "Notes" group eyebrow (reuse the eyebrow recipe from `sectionWarningExtras.tsx:160-165` classes); remove the published `CorrectionLoopCallout` render + `infoRowInvitesCorrection` import (wizard branch untouched); Silent `null` row replaced by nothing (cards render via extras inside box); count wiring: `BreakdownSection count={gateOn ? sheetWarningsPanelCount({ visibleInfoRows: rows.length, activeHere: here }) : rows.length}`; railCount for warnings row mirrors the same helper. In `ShowReviewSurface`: delete `suppressWarningsPanelCard` + its chrome spread; thread warnings `extrasNode` through chrome `sectionExtras` (remove exclusion), delete sibling render, drop `seamless` opt from the callback type + call. In `sectionWarningExtras.tsx`: remove `seamless` branch (single class list, no border-t). In `step3ReviewSections.tsx`: delete `Step3SectionChrome.suppressPanelCard` + `hasBody` (body always renders); pointer/clean rows unchanged inside the box. Delete `RailCountOpts` only if unused after wiring (grep).
- [ ] **Step 4:** `pnpm vitest run tests/components/admin/sheetWarningsPanel.test.tsx tests/components/admin/parsePanelComposition.test.tsx tests/components/admin/stagedCardBaseline.test.tsx tests/components/admin/review/routedWarningsGate.test.tsx tests/components/admin/showpage/publishedWarningNoLoss.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx` → Task 1's two tests MUST pass UNMODIFIED (the wizard-unchanged proof). Fix published-surface test fallout (routedWarningsGate/publishedWarningNoLoss assert against the new in-box DOM — update their selectors, NOT their conservation semantics; identity-union assertions must still pass).
- [ ] **Step 5: Transition audit (spec §2.6).** In sheetWarningsPanel.test.tsx, add a source-scan test: read the `WarningsBreakdown` + `NoteWarningCard` + extras-subtree sources and assert no `AnimatePresence`, no `motion.`, and no `transition-`/`duration-`/`animate-` class literals were introduced in the published-branch block (allowlist: the pre-existing HoverHelp classes — pin by exact-match list). Plus a render-level check: toggling a matrix row's props across one rerender leaves no element carrying a transition class in the N/G/A/I/P/C state containers (scoped to those containers, SAME HoverHelp allowlist as the source scan — a rendered allowlisted help affordance is not a failure). Enumerate the conditional blocks (N/G/A/I/P/C render sites) in a comment mapping to the spec §2.6 table.
- [ ] **Step 6: One-helper structural proof (spec §2.3).** Source-scan test: the heading-count read site and the `warnings` row's `railCount` closure BOTH contain a `sheetWarningsPanelCount(` call, and `visibleWarningRows(` appears in NO OTHER count expression for the warnings section (regex over the two extracted function bodies). Plus behavior: invoke the registry's warnings `railCount(fixtureData, { routedWarningsRenderElsewhere: true })` directly and assert it equals the heading count rendered for the same fixture.
- [ ] **Step 7:** Class-sweep: `rg -n 'suppressPanelCard|suppressWarningsPanelCard|seamless' --glob '!node_modules' --glob '!docs'` → zero code hits.
- [ ] **Step 8: Discovery check.** All three new test files match `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts`) — verify with `pnpm vitest list 2>/dev/null | rg 'parsePanelComposition|sheetWarningsPanel|crewMatchFanout'` → parsePanelComposition + sheetWarningsPanel listed NOW; the check REPEATS in Task 7 Step 6 for the two fan-out test files once they exist. No CI path-filter change needed: the unit workflows glob `tests/**` (confirm with `rg -n -A6 'paths:' .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | rg -B2 'tests/'` — multiline-aware: shows each `paths:` block's tests globs; paste output into the commit body; if any filter excludes the new dirs, extend it in the same commit).
- [ ] **Step 9: Commit** — `feat(admin): Sheet warnings panel unification — box always renders, notes as cards, extras in-box, callout retired (spec §2, §4)`

### Task 6: Crew-match derivation (spec §6.2)

**Files:**
- Modify: `lib/adminAlerts/deriveAlertRowFields.ts` (derive `crewMatch`), `lib/admin/attentionItems.ts` (types + `toAlertItem` passthrough)
- Test: tests/admin/crewMatchFanout.test.ts (new; derivation describe)

**Interfaces:** Produces OPTIONAL `AttentionAlertInput.crewMatch?: { crewMemberIds: string[]; expectedCount: number }` and AttentionItem crewMatch (optional, same shape) — absent unless derived; spread-inserted (exactOptional). Derivation: for `code === "AMBIGUOUS_EMAIL_BINDING"` read the PROJECTED resolution ids (`projectIdentityContext` already shape-validates `crew_member_ids`); UUID-validate each member (`UUID_RE` precedent), dedupe, `expectedCount = ids.length` post-dedup (the invariant `expectedCount === crewMemberIds.length` holds by construction — it is carried so the placement layer never re-derives it); anything malformed/missing/empty/non-array/non-UUID → ABSENT. Every other code → ABSENT.

- [ ] **Step 1: Failing tests** — table: valid 2 ids → `crewMatch` present with deep-equal shape; duplicate context ids → deduped, expectedCount 2 for 3 raw entries with 1 dup; missing key / `[]` / non-UUID member / non-array / other codes → assert PROPERTY ABSENT (`expect(row).not.toHaveProperty("crewMatch")`; never an explicit null).
- [ ] **Step 1b: Failing passthrough test** (same describe): call `deriveAttentionItems` (`lib/admin/attentionItems.ts:321` — the module's only exported derivation entry point; `toAlertItem` is internal to it) with an `AMBIGUOUS_EMAIL_BINDING` input carrying valid ids and assert the returned item's `crewMatch` deep-equals the input's — a dropped passthrough fails HERE, not in the e2e.
- [ ] **Step 1c: Failing validator tests** (same file): `validate` accepts a scenario carrying a well-formed optional `crewMatch`; rejects present-but-malformed (non-UUID member, non-number expectedCount); accepts a scenario omitting it entirely.
- [ ] **Step 2:** FAIL. **Step 3:** Implement in `deriveAlertRowFields` (single derivation, both consumers — `fetchPerShowAlerts` and the dev gallery — inherit). `toAlertItem` copies `crewMatch` onto the item (spread-inserted, exactOptional). Dev-gallery scenario validator (`lib/dev/attentionScenarios/validate.ts`): add `crewMatch` as an OPTIONAL validated field mirroring the derived shape (ids array of UUID strings + expectedCount number). RED-FIRST like everything else: Step 1c (below) lands its failing tests before this edit. **Step 4:** PASS + `pnpm vitest run tests/admin tests/adminAlerts` (registry meta-tests green — `_metaAttentionRoutes` unaffected: no new codes). **Step 5: Commit** — `feat(admin): derive crewMatch ids for AMBIGUOUS_EMAIL_BINDING (spec §6.2)`

### Task 7: Fan-out placement (spec §6.3)

**Files:**
- Create: lib/admin/crewRowMatch.ts (new) — the REAL resolver, exported pure: `crewRowIndexesForIds(expected: { crewMemberIds: readonly string[]; expectedCount: number }, shownCrewIds: readonly string[]): number[] | null` — degenerate-input guards FIRST: empty `crewMemberIds`, duplicate members within `crewMemberIds`, or `expectedCount !== crewMemberIds.length` → null (malformed caller; conservation demands section-top, never a silent no-placement or a doubled index). Then `hits(id)` over `shownCrewIds`; matched indexes iff `hits(id) === 1` for EVERY id AND `matchedIndexes.length === expected.expectedCount`; else null. (`expectedCount` is CONSUMED here — the placement layer never re-derives it from the ids array.)
- Modify: `lib/admin/sectionAttention.ts` — `SectionAttentionBucket.byRowIndex?: Map<number, ReactNode[]>`; `BucketOpts.crewRowIndexesForIds?: (m: { crewMemberIds: readonly string[]; expectedCount: number }) => number[] | null` (the modal partially applies the pure resolver over its roster); placement branch: crew section + `item.crewMatch` + resolver returns indexes → one card per index into `byRowIndex`; null/absent resolver or null result → `sectionTop` (existing branch). Never both channels for one item.
- Modify: `components/admin/review/ShowReviewSurface.tsx` — `CrewAttention` gains `byIndex?: ReadonlyMap<number, ReactNode[]>`; thread `crewBucket?.byRowIndex`.
- Modify: `components/admin/wizard/step3ReviewSections.tsx` `CrewBreakdown` — row `i` renders `[...(crewAttention?.byIndex?.get(i) ?? []), …existing byCrewKey stack]` inside the `<li>` below row content (same wrapper as the byCrewKey stack at `components/admin/wizard/step3ReviewSections.tsx:1596-1600`).
- Modify: `app/admin/_showReviewModal.tsx` — one-liner: `crewRowIndexesForIds: buildCrewRowResolver(crewIds)` where `buildCrewRowResolver(crewIds: readonly string[])` is ALSO exported from lib/admin/crewRowMatch.ts (applies the CREW_CAP slice internally, unit-tested directly — the modal contributes no logic beyond the import, and the e2e covers the wiring line itself).
- Test: tests/admin/crewMatchFanout.test.ts (resolver + placement describes, node env) AND a SEPARATE jsdom file tests/components/admin/crewRowBannerIntegration.test.tsx (new; `// @vitest-environment jsdom` pragma — JSX cannot live in the .ts file) for the CrewBreakdown integration describe. Both match BASE_INCLUDE.

- [ ] **Step 1: Failing resolver tests (the REAL function, not a fake):** expected `[A,B]` vs shown `[A,B,C]` → `[0,1]`; vs `[A,A,B]` → null (`hits(A)==2`); vs `[A,C]` → null (`hits(B)==0`); vs `[]` → null; expectedCount mismatch (ids `[A,B]`, expectedCount 3) → null; empty ids + expectedCount 0 → null (NOT `[]` — no silent no-placement); duplicate ids IN EXPECTED (`[A,A]`, expectedCount 2) → null; same-name-different-id is inexpressible here (resolver sees only ids) — noted as the reason names cannot mis-place.
- [ ] **Step 2: Failing placement tests:** drive `bucketAttention` with the REAL resolver partially applied over a fixture roster; assert: fan-out → `byRowIndex` has exactly one node per matched index and `sectionTop` gained nothing for the item; null-result → sectionTop only; resolver absent (staged) → sectionTop; conservation (never both; node count == matched count).
- [ ] **Step 3: Failing jsdom integration test** (tests/components/admin/crewRowBannerIntegration.test.tsx): TWO layers. (a) `CrewBreakdown` inside a chrome provider whose `crewAttention.byIndex` maps index 1 to a marker node; marker renders inside the SECOND row's `<li>` below row content and in no other row; a `byCrewKey`-only control case still renders (regression). (b) SURFACE THREADING: render `ShowReviewSurface` (published fixture, minimal registry) with a `sectionAttention` map whose crew bucket carries `byRowIndex` = {1: [marker]}; assert the marker lands in the second crew row's `<li>` — pins the `byRowIndex` to `CrewAttention.byIndex` threading that (a) bypasses. `buildCrewRowResolver` unit rows (CREW_CAP slice behavior: involved index beyond cap → null) live in the resolver describe.
- [ ] **Step 4:** All three describes FAIL. **Step 5:** Implement (lib resolver → sectionAttention branch → surface threading → CrewBreakdown consumption → modal wiring). **Step 6:** PASS + rerun Task 5 suite + repeat discovery: `pnpm vitest list 2>/dev/null | rg 'crewMatchFanout|crewRowBannerIntegration'` → both listed. **Step 7: Commit** — `feat(admin): id-matched crew-row alert fan-out with all-or-nothing placement (spec §6.3)`

### Task 8: e2e un-skip + extend (spec §6.4)

**Files:** Modify `tests/e2e/published-show-attention.spec.ts:120-135` — un-skip; seed an `AMBIGUOUS_EMAIL_BINDING` alert whose `crew_member_ids` match two seeded roster rows (reuse the file's existing seeding helpers; loopback `TEST_DATABASE_URL` override per e2e harness memory).

This task is a cross-layer VERIFICATION pass over units already TDD'd in Tasks 6-7 (declared exemption from red-first: the e2e exercises a live server, so its red phase is proven by bite-check, not by pre-implementation failure).
- [ ] **Step 1:** Un-skip; extend to three assertions: banner inside EACH matched row's `<li>` below row content (2 rows); NOT at section-top when fanned out; re-seed with one id absent from roster → single section-top banner. Await the harness's row-hydration gate before asserting (never `networkidle` alone).
- [ ] **Step 2: Bite-check (red proof):** temporarily invert the in-row assertion (expect section-top in the fan-out case) → run → FAIL; restore → run → PASS. Both runs pasted into the commit body.
- [ ] **Step 3:** `pnpm exec playwright test tests/e2e/published-show-attention.spec.ts` (prod-posture project per file header; `--no-deps` if dependency projects interfere) → PASS.
- [ ] **Step 4: Commit** — `test(e2e): un-skip crew-row banner placement, id-matched fan-out (spec §6.4)`

### Task 9: DEFERRED.md reconcile (spec §7)

Docs-only task — declared TDD exemption (validation = prettier + the Step-2 grep, no test artifact).
- [ ] **Step 1:** Move items 1,2,3,4,6 full entries from `DEFERRED.md` "warning-surface-trim (2026-07-21)" to `DEFERRED-archive.md` as RESOLVED-by `feat/warning-trim-undefer` (cite spec). Item 5 re-parked in place with the frozen-digest rationale + un-defer trigger (spec §7 text). Update the "Last reconciled" header line.
- [ ] **Step 2:** `pnpm prettier --write DEFERRED.md DEFERRED-archive.md`. **Step 3: Commit** — `docs(plan): reconcile DEFERRED.md — five warning-trim items resolved, digest re-parked with rationale`

### Task 10: Full gates

Gate task — declared TDD exemption (it RUNS the suites; any behavioral fix it produces must itself land red-first as a targeted test + fix within this task's commit).
- [ ] **Step 1:** `pnpm test` (full local suite — scoped gates miss registry suites), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Fix everything.
- [ ] **Step 2:** Impeccable dual-gate on the UI diff: `/impeccable critique` then `/impeccable audit` with canonical v3 setup (context.mjs → register read). Fix P0/P1 or DEFERRED.md-entry them. Findings + dispositions recorded in the handoff notes.
- [ ] **Step 3: Commit** any fixes — `fix(admin): impeccable dual-gate findings (warning-trim-undefer)`

### Task 11: Whole-diff review + ship

- [ ] **Step 1:** Split tight-scope Codex reviews (per AGENTS.md default for large diffs): brief A = panel rebuild files (step3ReviewSections, ShowReviewSurface, sectionWarningExtras, NoteWarningCard, sheetWarningsCount, reviewWarningTitle move, infoCodeActionability retirement + _metaInfoCodeActionability edit + their tests); brief B = fan-out files (attentionItems, deriveAlertRowFields, `lib/dev/attentionScenarios/validate.ts`, sectionAttention, crewRowMatch, _showReviewModal, the CrewBreakdown + CrewAttention slices of the two SHARED files, crewMatchFanout, crewRowBannerIntegration, e2e) + rename/DEFERRED. The two shared files (`components/admin/wizard/step3ReviewSections.tsx`, `components/admin/review/ShowReviewSurface.tsx`) appear in BOTH briefs, each annotated with its partition's slice. Each brief: REVIEWER ONLY, fresh-eyes, do-not-relitigate §1.1, verdict line. Iterate to APPROVE both.
- [ ] **Step 1b: Holistic integration pass** (after A and B APPROVE): a THIRD fresh-eyes brief over the cross-partition seams — the two files both partitions touch (`components/admin/wizard/step3ReviewSections.tsx`, `components/admin/review/ShowReviewSurface.tsx`), the full diff stat, the rename snapshot updates, and the combined test-inventory — explicitly hunting interactions the scoped briefs could not see; EVERY changed file must appear in at least one of A/B, and the two shared files are reviewed WHOLE here (the scoped briefs saw slices); assert coverage with `git diff --stat origin/main` cross-checked against the briefs' file lists — an unassigned file is a brief defect. Iterate to APPROVE.
- [ ] **Step 2:** Push; `gh pr create` (body per repo conventions, 🤖 footer); real CI green (`gh pr checks <PR#> --watch`; DIRTY/behind → merge-ref rebuild rules).
- [ ] **Step 3:** `gh pr merge --merge`; then in MAIN checkout `git pull --ff-only` and verify `git rev-list --left-right --count main...origin/main` == `0  0`. CronDelete job `65c4c568`. Mark ship-state stage `done`.

## Self-review notes

- Spec coverage: §2→Tasks 3-5; §3→Task 2; §4→Task 5 (callout retirement folded — same file, same gate); §5→Task 1; §6→Tasks 6-8; §7→Task 9; §8 zombie deletion→Task 5 step 5 sweep; §9 meta-tests→Tasks 1,4,5,6 explicitly extend/create; §10 gates→Task 10.
- Type consistency: `crewMatch` shape identical in Tasks 6-7; `sheetWarningsPanelCount` args named identically in Tasks 3/5; `byRowIndex` (bucket) vs `byIndex` (CrewAttention) is deliberate — two layers, names follow their owners' conventions.
- Snippets are shapes-with-real-names, not paste-ready files; every named symbol verified against the worktree during the pre-draft pass (2026-07-23). Implementer typechecks per task via `pnpm typecheck`.
