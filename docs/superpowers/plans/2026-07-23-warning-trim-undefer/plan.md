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
- `AttentionItem.crewMatch: { crewMemberIds: string[]; expectedCount: number } | null` — Task 6.
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
  const cards = screen.getAllByTestId(/wizard-step3-card-/); // outer card roots
  expect(cards).toHaveLength(fixtureRows.length); // derived, not hardcoded
  fixtureRows.forEach((row, i) => {
    expect(within(cards[i]!).getByText(row.sheetName)).toBeInTheDocument();
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
- Test: tests/components/admin/sheetWarningsPanel.test.tsx (second describe, `@vitest-environment jsdom` pragma at file top since it mixes — if mixing environments is awkward, move Task 3's describe into this jsdom file; both are fine under jsdom)
- Reference: `components/admin/CompactAlertCard.tsx` (tone="neutral"), `components/admin/PerShowActionableWarnings.tsx:125-152` + `components/admin/PerShowActionableWarnings.tsx:240-247` (popover + link gating precedents), `components/admin/CorrectionLoopCallout.tsx:32-34` (`correctionLoopCopy`), `components/admin/wizard/step3ReviewSections.tsx:2701-2715` (`reviewWarningTitle`)

**Interfaces:** Produces `NoteWarningCard({ warning, driveFileId })` and exported pure `notePopoverParts(w: ParseWarning): { copy: string | null; sentence: string | null }`.

- [ ] **Step 1: Failing tests — §2.4 truth table + boundary + guards** (fixture-derived, no hardcoded copy where catalog supplies it):

```tsx
describe("notePopoverParts (spec §2.4 truth table)", () => {
  // copy = FIRST NON-BLANK of longExplanation, then helpfulContext (NOT ??)
  it.each([
    ["copy+cell", warnWith({ code: KNOWN_INFO_CODE, sourceCell: CELL }), true, true],
    ["copy only", warnWith({ code: KNOWN_INFO_CODE, sourceCell: null }), true, false],
    ["cell only", warnWith({ code: "NOT_A_CODE", sourceCell: CELL }), false, true],
    ["neither", warnWith({ code: "NOT_A_CODE", sourceCell: null }), false, false],
  ])("%s", (_l, w, hasCopy, hasSentence) => {
    const p = notePopoverParts(w);
    expect(p.copy !== null).toBe(hasCopy);
    expect(p.sentence !== null).toBe(hasSentence);
  });
  it("blank longExplanation falls through to helpfulContext (first-non-blank, not ??)", () => {
    // pick/mock a code whose longExplanation is "" or whitespace but helpfulContext present
    const p = notePopoverParts(warnWith({ code: BLANK_LONG_CODE, sourceCell: null }));
    expect(p.copy).toBe(messageFor(BLANK_LONG_CODE).helpfulContext);
  });
});
describe("NoteWarningCard", () => {
  it("renders neutral tone, title, guidance; no severity glyph, no Report/Ignore", () => { /* query card, assert no bang glyph, no buttons besides ? and Open in Sheet */ });
  it("no ? trigger when both parts absent; no guidance element when context blank", () => { /* … */ });
  it("Open in Sheet renders iff buildSheetDeepLink yields href (result-gated)", () => { /* null driveFileId + present cell → absent */ });
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `NoteWarningCard`: `CompactAlertCard tone="neutral" stripe="none"`, message = `reviewWarningTitle(w)` + guidance line (`helpfulContext`-derived, omit when blank), helpTrigger = `CompactAlertHelp`-style popover fed by `notePopoverParts` (copy then sentence paragraphs), controls band = Open-in-Sheet link only (result-gated). `notePopoverParts`: `firstNonBlank(longExplanation, helpfulContext)`; sentence = `w.sourceCell ? correctionLoopCopy("resync") : null`. **Step 4:** PASS. **Step 5: Commit** — `feat(admin): NoteWarningCard neutral card with popover assembly (spec §2.4)`

### Task 5: Published panel rebuild (spec §2.2, §2.3a, §4)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (WarningsBreakdown published branch `2754-2895`; `ModalSectionChrome` `hasBody`; `Step3SectionChrome.suppressPanelCard` removal; heading count wiring `884-926`; railCount `4218-4225`)
- Modify: `components/admin/review/ShowReviewSurface.tsx` (`suppressWarningsPanelCard` computation + spread `1074-1076`; warnings extras: thread via chrome `sectionExtras` — drop the `s.id !== "warnings"` exclusion at `1105-1107`; delete the sibling render at `1160`; drop `seamless` opt)
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` (retire `seamless` variant — extras root becomes plain `flex flex-col gap-3`, no `border-t`, since the box supplies the boundary)
- Modify: `lib/admin/infoCodeActionability.ts` + its scanner/meta-test — the published callout consumer dies (§4); if `infoRowInvitesCorrection` has no remaining consumer, retire the export and update `tests/admin/_metaInfoCodeActionability.test.ts` (read it first; its two-layer scanner contract from polish spec §3.4 must be adjusted in the SAME commit, not deleted blind)
- Test: tests/components/admin/sheetWarningsPanel.test.tsx (third describe — state matrix)

**Interfaces:** Consumes `NoteWarningCard`, `sheetWarningsPanelCount`. The chrome no longer has `suppressPanelCard`; count for warnings = `sheetWarningsPanelCount({ visibleInfoRows: rows.length, activeHere: here })` when the gate is on, else `rows.length` (wizard, unchanged).

- [ ] **Step 1: Failing tests — §2.3a matrix.** Render `WarningsBreakdown` inside a chrome provider (published gate on) across the matrix rows; fixture-derived expectations:
  - notes-only → box + Notes group (eyebrow "Notes") + NoteWarningCards; count == info count;
  - here-cards-only (Silent-was) → box + extras cards INSIDE the panel-card element; heading count == here; NO seam `border-t` on extras root;
  - both → notes group first, then actionable groups (DOM order assertion);
  - ignored-only → box + Clean row + ignored disclosure together; count 0 + carve-out suppression when flagged (assert NO count chip when `flagged` true and count 0);
  - elsewhere-only (+ ign>0) → pointer sentence + ignored disclosure coexist; no G/A;
  - empty → Clean row alone; "(0)" chip when not flagged.
  - Assert box (panel-card element with `border`) present in EVERY row above.
- [ ] **Step 2:** Run → FAIL. 
- [ ] **Step 3: Implement.** In `WarningsBreakdown` published branch: replace the info-row `<li>` list with `NoteWarningCard`s under a "Notes" group eyebrow (reuse the eyebrow recipe from `sectionWarningExtras.tsx:160-165` classes); remove the published `CorrectionLoopCallout` render + `infoRowInvitesCorrection` import (wizard branch untouched); Silent `null` row replaced by nothing (cards render via extras inside box); count wiring: `BreakdownSection count={gateOn ? sheetWarningsPanelCount({ visibleInfoRows: rows.length, activeHere: here }) : rows.length}`; railCount for warnings row mirrors the same helper. In `ShowReviewSurface`: delete `suppressWarningsPanelCard` + its chrome spread; thread warnings `extrasNode` through chrome `sectionExtras` (remove exclusion), delete sibling render, drop `seamless` opt from the callback type + call. In `sectionWarningExtras.tsx`: remove `seamless` branch (single class list, no border-t). In `step3ReviewSections.tsx`: delete `Step3SectionChrome.suppressPanelCard` + `hasBody` (body always renders); pointer/clean rows unchanged inside the box. Delete `RailCountOpts` only if unused after wiring (grep).
- [ ] **Step 4:** `pnpm vitest run tests/components/admin/sheetWarningsPanel.test.tsx tests/components/admin/parsePanelComposition.test.tsx tests/components/admin/stagedCardBaseline.test.tsx tests/components/admin/review/routedWarningsGate.test.tsx tests/components/admin/showpage/publishedWarningNoLoss.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx` → Task 1's two tests MUST pass UNMODIFIED (the wizard-unchanged proof). Fix published-surface test fallout (routedWarningsGate/publishedWarningNoLoss assert against the new in-box DOM — update their selectors, NOT their conservation semantics; identity-union assertions must still pass).
- [ ] **Step 5:** Class-sweep: `rg -n 'suppressPanelCard|suppressWarningsPanelCard|seamless' --glob '!node_modules' --glob '!docs'` → zero code hits. 
- [ ] **Step 6: Commit** — `feat(admin): Sheet warnings panel unification — box always renders, notes as cards, extras in-box, callout retired (spec §2, §4)`

### Task 6: Crew-match derivation (spec §6.2)

**Files:**
- Modify: `lib/adminAlerts/deriveAlertRowFields.ts` (derive `crewMatch`), `lib/admin/attentionItems.ts` (types + `toAlertItem` passthrough)
- Test: tests/admin/crewMatchFanout.test.ts (new; derivation describe)

**Interfaces:** Produces `AttentionAlertInput.crewMatch: { crewMemberIds: string[]; expectedCount: number } | null` and `AttentionItem.crewMatch` (same shape). Derivation: for `code === "AMBIGUOUS_EMAIL_BINDING"` read the PROJECTED resolution ids (`projectIdentityContext` already shape-validates `crew_member_ids`); UUID-validate each member (`UUID_RE` precedent), dedupe, `expectedCount = ids.length`; anything malformed/missing/empty/non-array/non-UUID → `null`. Every other code → `null`.

- [ ] **Step 1: Failing tests** — table: valid 2 ids → match; duplicate context ids → deduped, expectedCount 2 for 3 raw entries with 1 dup; missing key → null; `[]` → null; non-UUID member → null; non-array → null; other codes with valid ids → null.
- [ ] **Step 2:** FAIL. **Step 3:** Implement in `deriveAlertRowFields` (single derivation, both consumers — `fetchPerShowAlerts` and the dev gallery — inherit; check `lib/dev/attentionScenarios/validate.ts` for scenario-shape validators to extend). `toAlertItem` copies `crewMatch` onto the item (spread-inserted, exactOptional). **Step 4:** PASS + `pnpm vitest run tests/admin tests/adminAlerts` (registry meta-tests green — `_metaAttentionRoutes` unaffected: no new codes). **Step 5: Commit** — `feat(admin): derive crewMatch ids for AMBIGUOUS_EMAIL_BINDING (spec §6.2)`

### Task 7: Fan-out placement (spec §6.3)

**Files:**
- Modify: `lib/admin/sectionAttention.ts` — `SectionAttentionBucket.byRowIndex?: Map<number, ReactNode[]>`; `BucketOpts.crewRowIndexesForIds?: (ids: readonly string[]) => number[] | null` (returns shown-row indexes iff `hits(id) === 1` for EVERY id, else null); placement branch: crew section + `item.crewMatch` + resolver returns indexes → one card per index into `byRowIndex`; resolver null/absent → `sectionTop` (existing branch).
- Modify: `components/admin/review/ShowReviewSurface.tsx` — `CrewAttention` gains `byIndex?: ReadonlyMap<number, ReactNode[]>`; thread `crewBucket?.byRowIndex`.
- Modify: `components/admin/wizard/step3ReviewSections.tsx` `CrewBreakdown` — row `i` renders `[...(crewAttention?.byIndex?.get(i) ?? []), …existing byCrewKey stack]` inside the `<li>` below row content (same wrapper the byCrewKey stack uses at `1596-1600`).
- Modify: `app/admin/_showReviewModal.tsx` — supply `crewRowIndexesForIds`: over the SHOWN roster slice (`members.slice(0, CREW_CAP)` order, index-aligned `crewIds`), compute `hits(id)`; return indexes iff all `hits === 1`.
- Test: tests/admin/crewMatchFanout.test.ts (placement describe — drive `bucketAttention` directly with a fake resolver + items)

- [ ] **Step 1: Failing tests** — all-hit-1 → `byRowIndex` has one node per index, `sectionTop` empty for the item; some `hits==0` → sectionTop only; duplicate rendered ids (`hits==2`) → sectionTop; resolver absent (staged) → sectionTop; conservation: never both channels for one item, node count == matched indexes when fanned out; same-name different-id rows: resolver keyed by id so only the involved index appears.
- [ ] **Step 2:** FAIL. **Step 3:** Implement the three seams + modal resolver. **Step 4:** PASS + rerun Task 5 suite (crew section untouched for non-match path). **Step 5: Commit** — `feat(admin): id-matched crew-row alert fan-out with all-or-nothing placement (spec §6.3)`

### Task 8: e2e un-skip + extend (spec §6.4)

**Files:** Modify `tests/e2e/published-show-attention.spec.ts:120-135` — un-skip; seed an `AMBIGUOUS_EMAIL_BINDING` alert whose `crew_member_ids` match two seeded roster rows (reuse the file's existing seeding helpers; loopback `TEST_DATABASE_URL` override per e2e harness memory).

- [ ] **Step 1:** Un-skip; extend to three assertions: banner inside EACH matched row's `<li>` below row content (2 rows); NOT at section-top when fanned out; re-seed with one id absent from roster → single section-top banner. Await the harness's row-hydration gate before asserting (never `networkidle` alone).
- [ ] **Step 2:** `pnpm exec playwright test tests/e2e/published-show-attention.spec.ts` (prod-posture project per file header; `--no-deps` if dependency projects interfere) → PASS.
- [ ] **Step 3: Commit** — `test(e2e): un-skip crew-row banner placement, id-matched fan-out (spec §6.4)`

### Task 9: DEFERRED.md reconcile (spec §7)

- [ ] **Step 1:** Move items 1,2,3,4,6 full entries from `DEFERRED.md` "warning-surface-trim (2026-07-21)" to `DEFERRED-archive.md` as RESOLVED-by `feat/warning-trim-undefer` (cite spec). Item 5 re-parked in place with the frozen-digest rationale + un-defer trigger (spec §7 text). Update the "Last reconciled" header line.
- [ ] **Step 2:** `pnpm prettier --write DEFERRED.md DEFERRED-archive.md`. **Step 3: Commit** — `docs(plan): reconcile DEFERRED.md — five warning-trim items resolved, digest re-parked with rationale`

### Task 10: Full gates

- [ ] **Step 1:** `pnpm test` (full local suite — scoped gates miss registry suites), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Fix everything.
- [ ] **Step 2:** Impeccable dual-gate on the UI diff: `/impeccable critique` then `/impeccable audit` with canonical v3 setup (context.mjs → register read). Fix P0/P1 or DEFERRED.md-entry them. Findings + dispositions recorded in the handoff notes.
- [ ] **Step 3: Commit** any fixes — `fix(admin): impeccable dual-gate findings (warning-trim-undefer)`

### Task 11: Whole-diff review + ship

- [ ] **Step 1:** Split tight-scope Codex reviews (per AGENTS.md default for large diffs): brief A = panel rebuild files (step3ReviewSections, ShowReviewSurface, sectionWarningExtras, NoteWarningCard, sheetWarningsCount + their tests); brief B = fan-out files (attentionItems, deriveAlertRowFields, sectionAttention, _showReviewModal, CrewBreakdown slice, crewMatchFanout, e2e) + rename/DEFERRED. Each brief: REVIEWER ONLY, fresh-eyes, do-not-relitigate §1.1, verdict line. Iterate to APPROVE both.
- [ ] **Step 2:** Push; `gh pr create` (body per repo conventions, 🤖 footer); real CI green (`gh pr checks <PR#> --watch`; DIRTY/behind → merge-ref rebuild rules).
- [ ] **Step 3:** `gh pr merge --merge`; then in MAIN checkout `git pull --ff-only` and verify `git rev-list --left-right --count main...origin/main` == `0  0`. CronDelete job `65c4c568`. Mark ship-state stage `done`.

## Self-review notes

- Spec coverage: §2→Tasks 3-5; §3→Task 2; §4→Task 5 (callout retirement folded — same file, same gate); §5→Task 1; §6→Tasks 6-8; §7→Task 9; §8 zombie deletion→Task 5 step 5 sweep; §9 meta-tests→Tasks 1,4,5,6 explicitly extend/create; §10 gates→Task 10.
- Type consistency: `crewMatch` shape identical in Tasks 6-7; `sheetWarningsPanelCount` args named identically in Tasks 3/5; `byRowIndex` (bucket) vs `byIndex` (CrewAttention) is deliberate — two layers, names follow their owners' conventions.
- Snippets are shapes-with-real-names, not paste-ready files; every named symbol verified against the worktree during the pre-draft pass (2026-07-23). Implementer typechecks per task via `pnpm typecheck`.
