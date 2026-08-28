# Review Modal Attention Pills + Warning Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both review-modal header pills count warn-severity parse warnings in the unit the modal body lists them, and open an index whose rows jump to each warning.

**Architecture:** One predicate (`isWarnSeverity`) and one pure derivation (`deriveWarningAttention`) feed both modals. The published `AttentionMenu` is split in place into an exported frame + row so the new `WizardAttentionMenu` renders no overlay markup of its own. Jumps reuse the surface's existing `attentionJump` effect against new `data-attention-anchor` attributes: wizard list `<li>`s and published warning cards. Byte identity of untouched states is proven by committed baselines captured BEFORE any component change.

**Tech Stack:** Next.js 16 app, React 19, Tailwind v4 tokens (DESIGN.md), Vitest (jsdom) unit/component suites, Playwright e2e over a static-markup harness.

**Spec:** `docs/superpowers/specs/2026-08-27-wizard-review-attention-menu-design.md` (spec sections cited as §N below).

## Global Constraints

- Merge policy for this arc: **the arc never merges**. bl-orch merges after its own gates; Task 12 ends with a chunked readiness line to pane `w15:p2`, no `gh pr merge`, no auto-merge.
- Local Postgres is a named single slot: no DB-touching run (Task 9's published e2e) until bl-orch names this arc holder. Unit/component suites with no DB are unaffected; say so in the commit when a DB suite is skipped.
- Pre-push set is derived from `.github/workflows/quality.yml` (read it; at drafting time: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`).
- CI pollers run detached (`nohup`), never as a harness task child; sweep by `ps` + `lsof`.
- Review cap: four rounds per stage; at the cap, file docs/review-rounds/feat/wizard-review-attention-menu/<baseSha12>.md and report to bl-orch before any further round. `--round` restarts at 1 after anything that moves the merge base.
- A mutant is VALID only when proven (1) applied: applied by line, hash of the target file changed, diff non-empty; (2) observable within the window: its effect lands before the assertion reads, by construction (same tick, `setTimeout(0)` not a later frame); (3) on the branch the test executes: coverage evidence that the mutated line ran (an `istanbul` line hit, or a sentinel log on the branch), since jsdom's stubbed geometry pushes placement code down fallback branches. Only a green that passes all three checks is a non-discriminating assertion; every other green is an invalid mutant (fleet taxonomy 2026-08-27, four modes).
- Line-keyed registry rows: the inventory below was EXECUTED at plan time; every task that edits one of those files ends by running the named scanners and re-keying each failing row to the line the scanner reports, quoting the scanner output in the commit.
- Copy: no em dash in any user-visible string (`tests/styles/_metaEmDashCopy.test.ts`); strings come from spec §6 verbatim.
- Invariant 8: every file under `components/` is a UI surface; `/impeccable critique` + `/impeccable audit` run on the diff (Task 11) before the whole-diff Codex review.
- Commits: conventional style, one task per commit, `--no-verify` (shared lint-staged hook contends with the main checkout).
- Heavy runs (`pnpm test`, any `playwright test`, `pnpm build`) go through `pnpm heavy …`; scoped vitest file lists stay unwrapped.
- Every registry row re-keyed by line is re-measured by RUNNING the scanner and quoting its output in the commit, never predicted.

## Acceptance criteria

- AC-1: wizard header chip counts warn-severity warnings partitioned needs-look/judgment; two warnings in one section read "2 need a look" (§3.1, §3.2).
- AC-2: judgment-only sheet renders the quiet "N judgment calls" pill, never "All clean" (§3.2).
- AC-3: the wizard chip is a button that opens `WizardAttentionMenu`; a row click closes the menu and flashes the `<li data-attention-anchor="warning:<index>">` (§3.3, §3.4).
- AC-4: footer note mirrors the same counts (§3.5).
- AC-5: dirty rescan and count-0 close the menu with focus kept inside the dialog; auto-open fires once per mount only while the pill is interactive and `n > 0` (§3.5).
- AC-6: published pill shows "{k} sheet warnings" as a wrap-unit segment; "In sync" only when issues, warnings and monitoring are all 0 (§4.1, §4.2).
- AC-7: `AttentionMenu` renders a Sheet warnings group from `warningIndex` and is byte-identical without it (§4.3, §5).
- AC-8: published row click jumps to the warning's card via `data-attention-anchor="warning:<reportSurfaceId>"` on both render paths; a missing card falls back to the section top (§4.4).
- AC-9: `isWarnSeverity` is the only severity predicate at the seven review-surface sites; a severity-less warning counts as warn everywhere the badge counts it (§2.1, I-1).
- AC-10: committed baselines prove the untouched states byte-identical: step3 clean + dirty headers, published pill + open menu (§1.1, §12.15, §12.19a) (discharged by Task 1)
- AC-11: every line-keyed registry row that moved is re-keyed with the scanner's measured value; WizardAttentionMenu.tsx is enrolled in `PAGE_COMPONENT_COUNTS` and `SERVER_RENDERED` (§5).
- AC-12: real-browser: pill hit band ≥ 44px, every menu row ≥ 44px, panel inside the shell clip at 375×667 and 1280×800 (§9) (discharged by Task 9)
- AC-13: impeccable critique + audit ran on the diff; P0/P1 fixed or deferred with a `DEFERRED.md` entry; closeout marker present (discharged by the closeout)

## File structure

Create:
- lib/admin/warningAttention.ts — `deriveWarningAttention` (§2).
- components/admin/wizard/WizardAttentionMenu.tsx — wizard menu, frame consumer only (§3.3).
- tests/lib/admin/warningAttention.test.ts, tests/lib/admin/isWarnSeverity.test.ts.
- tests/components/admin/wizard/wizardAttentionMenu.test.tsx.
- tests/components/admin/showpage/__fixtures__/published-attention-pill-baseline.html, published-attention-menu-baseline.html; tests/components/admin/review/__fixtures__/step3-header-dirty-baseline.html.
- tests/components/admin/showpage/publishedAttentionBaseline.test.tsx (capture mode + invariant), tests/helpers/publishedAttentionBaseline.ts, tests/components/admin/showpage/_attentionItemFixture.ts.
- tests/e2e/wizard-attention-menu.spec.ts.
- docs/superpowers/plans/2026-08-27-wizard-review-attention-menu-closeout.md (Task 11).

Modify:
- `lib/parser/dataGaps.ts` (`isWarnSeverity`, `summarizeDataGaps`), `lib/admin/step3SectionStatus.ts`, `lib/admin/visibleWarningRows.ts`, `lib/admin/step3Buckets.ts`, `components/admin/review/ShowReviewSurface.tsx` (`hasWarnRow` only), `components/admin/wizard/step3ReviewSections.tsx` (`isWarn`, `<li>` anchor).
- `components/admin/showpage/AttentionMenu.tsx` (frame/row split, `warningIndex`).
- `components/admin/PerShowActionableWarnings.tsx` (`anchorIds`).
- `components/admin/showpage/sectionWarningExtras.tsx` (anchor ids at both mounts).
- `components/admin/showpage/PublishedReviewModal.tsx` (counts, segment, menu prop, jump).
- `components/admin/wizard/Step3ReviewModal.tsx` (counts, pill, menu, jump, footer, effects).
- `scripts/captureStep3HeaderBaseline.ts` (dirty variant), `tests/helpers/step3HeaderBaseline.ts` (dirty path const), `tests/components/admin/review/reviewModalShell.test.tsx` (dirty invariant).
- Registries: `tests/styles/controlOutlineScan.ts`, `tests/styles/controlOutlineResidue.ts`, `tests/styles/_metaControlOutlineResidue.test.ts`, `tests/styles/_metaControlOutlineFill.test.ts`, `tests/styles/tapTargetCensus.ts`, `tests/components/admin/showpage/pageTransitions.test.tsx`, `tests/components/admin/transitionAudit.test.tsx`, `tests/components/admin/wizard/step3JudgmentChrome.test.tsx`, `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`.
- Tests extended: `tests/components/admin/wizard/Step3ReviewModal.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx`, `tests/components/admin/perShowActionableWarnings*.test.tsx` (or new file if none), `tests/e2e/_step3ReviewModalLiveEntry.tsx`, `tests/e2e/published-show-attention.spec.ts`, `playwright.config.ts`, `.github/workflows/step3-live-bundle.yml`.

## Meta-test inventory

- EXTENDS `tests/components/admin/review/reviewModalShell.test.tsx` (T-STEP3-DIRTY-INVARIANT) and CREATES publishedAttentionBaseline.test.tsx (byte baselines).
- EXTENDS `pageTransitions.test.tsx` (WizardAttentionMenu.tsx row), `transitionAudit.test.tsx` (`SERVER_RENDERED` row), `step3JudgmentChrome.test.tsx` (count 10 → 11), `step3ReviewModal.transitions.test.tsx` (site count re-measured).
- Re-keys rows in `controlOutlineScan.ts`, `controlOutlineResidue.ts`, `_metaControlOutlineResidue.test.ts`, `_metaControlOutlineFill.test.ts`, `tapTargetCensus.ts` (moved lines only; `CENSUS`/`HOVER_SUBTLE` are closed lists, nothing added).
- `popoverOverlayRegistry.ts`: unchanged (overlay stays in `AttentionMenu.tsx`); `_metaPopoverPlacementContract` must stay green with NO new row.
- Advisory locks, Supabase call boundaries, DB matrices: none apply — no server or DB code in this arc.
- Mutation registry: no guard surface; not enrolled.

## Pre-draft verification transcript (2026-08-27, worktree at `66c9857f5`)

- `rg -n "export function summarizeDataGaps" lib/parser/dataGaps.ts` → line 266; body skips `severity === "info"` only.
- `rg -n 'severity (===|!==) "warn"' lib/admin components/admin` → 7 hits: `ShowReviewSurface.tsx:342`, `step3SectionStatus.ts` lines 83, 95, 116, `step3ReviewSections.tsx:3059`, `visibleWarningRows.ts:23`, `step3Buckets.ts:95`.
- `rg -n "export type AttentionJump" components/admin/review/ShowReviewSurface.tsx` → line 172; effect at line 557-583 queries `[data-attention-anchor="…"]`, falls back to `handleNavClick(jump.sectionId)`.
- `rg -n "data-warning-index" components/admin/wizard/step3ReviewSections.tsx` → line 3069 on the wizard `<li>`.
- `rg -n 'data-testid="per-show-actionable-item"' components/admin/PerShowActionableWarnings.tsx` → line 372, inside `items.map((w, i) =>` at line 135.
- `rg -n "reportSurfaceId" components/admin/showpage/sectionWarningExtras.tsx` → line 60 (crew under-row mount), line 227 (grouped mount).
- `rg -n "menuWasEffectivelyOpenRef" components/admin/showpage/PublishedReviewModal.tsx` → line 373-398.
- `rg -n "PREEXISTING_TRANSITION_COUNTS" tests/components/admin/wizard/step3JudgmentChrome.test.tsx` → line 104; modal+surface entry pinned at 10 (line 168 regex `transition-(?:all|colors|opacity)`).
- `rg -n "expect(hits.length).toBe(18)" tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` → present; marker rule `§11` + `instant — deliberate` on the preceding line.
- `rg -n "AttentionMenu.tsx" tests/styles/*.ts tests/styles/*.test.ts` → `controlOutlineScan.ts:210` (line 189), `controlOutlineResidue.ts:933`, `_metaControlOutlineResidue.test.ts` lines 764, 925, 1088, 1542.
- `rg -n "Step3ReviewModal.tsx" tests/styles/*.ts` → `controlOutlineScan.ts:104` (line 604), line 106 (line 688), `tapTargetCensus.ts:205`.
- `rg -n "PublishedReviewModal.tsx:979" tests/styles` → `controlOutlineScan.ts:181`, `_metaControlOutlineFill.test.ts:469`.
- `rg -n "tests/lib" vitest.projects.ts` → line 117 `tests/lib/**/*.test.{ts,tsx}` (parallel project).
- `rg -n "step3-review-modal" playwright.config.ts .github/workflows/step3-live-bundle.yml` → desktop-chromium `testMatch` alternation line 96; workflow paths line 19-20, run line 75.
- `rg -n "premise|premiseHolds" tests/_shared/premise.ts` → `premise(description, actual, mustExceed)`, `premiseHolds(description, condition)`.
- `tests/parser/dataGapsClassCompleteness.test.ts` → `BENIGN_WARN_CODES:40`, `ASSET_WARN_CODES:55`, `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` in `NON_GAP_CATALOG_CODES:163`; these consts are module-local (Task 3 exports them via a fixture module).

## Line-keyed pin inventory (executed 2026-08-27 on the plan's base)

Command (run, not described):

```
rg -n --no-heading -o -e '(?:file: "|")(components/admin/(?:review/ShowReviewSurface|wizard/step3ReviewSections|wizard/Step3ReviewModal|showpage/PublishedReviewModal|showpage/AttentionMenu|showpage/sectionWarningExtras|PerShowActionableWarnings)\.tsx)(?:", line: |:)(\d+)' tests scripts | rg -v '^tests/e2e/'
rg -n -A2 'step3ReviewSections|sectionWarningExtras|Step3ReviewModal|AttentionMenu' tests/styles/tapTargetCensus.ts tests/styles/subtleInteractiveExemptions.ts tests/styles/controlOutlineResidue.ts | rg 'line:'
```

Output (registry → pinned file:line → the task whose edit moves it → re-key action):

| Registry row | Pin | Moved by | Action |
|---|---|---|---|
| `tests/styles/controlOutlineScan.ts:104` CENSUS | `Step3ReviewModal.tsx` 604 | T8 | re-key |
| `tests/styles/controlOutlineScan.ts:106` CENSUS | `Step3ReviewModal.tsx` 688 | T8 | re-key |
| `tests/styles/controlOutlineScan.ts:114` CENSUS | `step3ReviewSections.tsx` 4201 | T2 (import), T8 (anchor) | re-key twice |
| `tests/styles/controlOutlineScan.ts:117` CENSUS | `step3ReviewSections.tsx` 4258 | T2, T8 | re-key twice |
| `tests/styles/controlOutlineScan.ts:179` CENSUS | `ShowReviewSurface.tsx` 814 | T2 (import) | re-key |
| `tests/styles/controlOutlineScan.ts:180` CENSUS | `ShowReviewSurface.tsx` 993 | T2 | re-key |
| `tests/styles/controlOutlineScan.ts:181` CENSUS | `PublishedReviewModal.tsx` 979 | T6 | re-key |
| `tests/styles/controlOutlineScan.ts:210` DIVIDERS | `AttentionMenu.tsx` 189 | T4 | re-key |
| `tests/styles/_metaControlOutlineFill.test.ts:469` HOVER_SUBTLE | `PublishedReviewModal.tsx:979` | T6 | re-key (closed list: no additions) |
| `tests/styles/_metaControlOutlineResidue.test.ts:1542` blind oracle | `AttentionMenu.tsx:189` | T4 | re-key |
| `tests/styles/_metaControlOutlineResidue.test.ts:1544` blind oracle | `step3ReviewSections.tsx:2432` | T2 | re-key |
| `tests/styles/controlOutlineResidue.ts:933` | `AttentionMenu.tsx` row: keyed by file + tag + paint, NO `line` field | T4 | no re-key expected; run the suite to confirm the residue set is unchanged |
| `tests/styles/controlOutlineResidue.ts:1038` | `step3ReviewSections.tsx` row: same file+tag+paint key | T2 | no re-key expected; confirm by running |
| `tests/styles/tapTargetCensus.ts:205` | `Step3ReviewModal.tsx` row | T8 | re-key |
| `tests/styles/tapTargetCensus.ts:304` | `step3ReviewSections.tsx` 3820 | T2 | re-key |
| `tests/styles/subtleInteractiveExemptions.ts:73` | `step3ReviewSections.tsx` 1624 | T2 | re-key |
| `tests/styles/subtleInteractiveExemptions.ts` (sectionWarningExtras row) | `sectionWarningExtras.tsx` 272 | T6 (anchor ids above it? verify: the anchors are at lines 60 and 227, both ABOVE 272) | re-key |
| `tests/help/_metaRenderFaultMarking.test.ts:46` REPORTED_RESIDUE | `step3ReviewSections.tsx:3800` | T2 | re-key |
| `tests/specLint/claimSweepNamed.test.ts:125` | `PublishedReviewModal.tsx:964` | T6 | READ FIRST: if it is a fixture string inside a specLint test rather than a pin on the live file, leave it; state which in the commit |
| `tests/components/admin/showpage/pageTransitions.test.tsx` PAGE_COMPONENT_COUNTS | `PublishedReviewModal.tsx` 8, `AttentionMenu.tsx` 3 | T4, T6, T7 (new row) | re-measure |
| `tests/components/admin/wizard/step3JudgmentChrome.test.tsx` PREEXISTING_TRANSITION_COUNTS | modal+surface 10 | T8 | 10 → 11, re-measure |
| `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` | 18 sites | T8 | re-measure |

Scanner set, run at the end of T2, T4, T6, T7, T8: `pnpm exec vitest run tests/styles tests/help/_metaRenderFaultMarking.test.ts tests/specLint/claimSweepNamed.test.ts tests/components/admin/showpage/pageTransitions.test.tsx tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/wizard/step3JudgmentChrome.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`. These are DB-free jsdom/source scanners.

---

### Task 1: Baselines captured from the pre-change tree (capture, not TDD; outside the red-contract region)

**Files:**
- Modify: `scripts/captureStep3HeaderBaseline.ts` (dirty variant), `tests/helpers/step3HeaderBaseline.ts` (export `STEP3_DIRTY_BASELINE_FIXTURE_PATH`), `tests/components/admin/review/reviewModalShell.test.tsx` (T-STEP3-DIRTY-INVARIANT).
- Create: tests/helpers/publishedAttentionBaseline.ts, tests/components/admin/showpage/_attentionItemFixture.ts, tests/components/admin/showpage/publishedAttentionBaseline.test.tsx, and the three fixture files.

**Interfaces:**
- Produces: fixtures at tests/components/admin/review/__fixtures__/step3-header-dirty-baseline.html, tests/components/admin/showpage/__fixtures__/published-attention-pill-baseline.html and published-attention-menu-baseline.html; `PUBLISHED_ATTENTION_PILL_FIXTURE_PATH`, `PUBLISHED_ATTENTION_MENU_FIXTURE_PATH`; `item()`, `needsLookItem()`, `selfHealItem()` from the shared fixture module.

This task runs FIRST and touches no component. It has NO red→green cycle of its own and carries no task marker: a baseline capture cannot be red for a production reason (the fixtures it writes are the test's own inputs), which is exactly the test-local RED `docs/agents/writing-plans.md` forbids. Its discriminating power is proven differently: after capture, mutate one byte of the rendered header (temporarily change the "All clean" text in `Step3ReviewModal.tsx`, run, confirm the invariant fails, revert; same for the published pill's "issue" noun (the two-group fixture renders "1 issue · 1 monitoring", never "In sync") and the menu's needs-you heading) and quote the three failures in the commit body. The published modal cannot be rendered by a standalone script the way the Step 3 header can: `publishedReviewModal.test.tsx` `baseProps` builds `vi.fn()` actions, and the component needs the `ShareTokenProvider` wrapper (`app/admin/show/[slug]/ShareTokenContext.tsx` `useShareToken`) plus the `next/navigation` `vi.mock` for `useRouter`/`useSearchParams` (`components/admin/useShowModalNav.ts`). So the published baselines are captured IN VITEST by the invariant test itself in capture mode (`PUBLISHED_ATTENTION_CAPTURE=1` writes the fixtures instead of comparing), run once on this pre-change tree; the same module graph that renders the component captures it. What is red and why: the three fixture files do not exist, so each invariant test's `readFileSync` throws.

- [ ] **Step 1: Add the dirty path constant**

In `tests/helpers/step3HeaderBaseline.ts`, next to `STEP3_BASELINE_FIXTURE_PATH`:

```ts
/** Sibling of the clean baseline: the same fixture rendered with isDirtyRescan: true,
 *  so the "Sheet changed" span has the same byte-level proof (spec §12.15). */
export const STEP3_DIRTY_BASELINE_FIXTURE_PATH =
  "tests/components/admin/review/__fixtures__/step3-header-dirty-baseline.html";
```

- [ ] **Step 2: Write the failing dirty invariant**

Append to the T-STEP3-INVARIANT describe in `tests/components/admin/review/reviewModalShell.test.tsx`:

```tsx
  it("Step 3 DIRTY header markup matches the pre-change baseline byte-for-byte (T-STEP3-DIRTY-INVARIANT)", () => {
    render(
      <Step3ReviewModal
        data={buildStep3BaselineData()}
        checked={false}
        isDirtyRescan={true}
        onRequestSetChecked={async () => true}
        onClose={() => {}}
      />,
    );
    const header = screen.getByTestId(`wizard-step3-card-${STEP3_BASELINE_DFID}-review-header`);
    const expected = readFileSync(join(process.cwd(), STEP3_DIRTY_BASELINE_FIXTURE_PATH), "utf8").trim();
    expect(expected.length).toBeGreaterThan(500);
    expect(expected).toContain("Sheet changed");
    expect(normalizeIds(header.innerHTML)).toBe(expected);
  });
```

Add `STEP3_DIRTY_BASELINE_FIXTURE_PATH` to the existing import from `@/tests/helpers/step3HeaderBaseline`.

- [ ] **Step 3: Shared item fixture + the published baseline test with capture mode**

tests/components/admin/showpage/_attentionItemFixture.ts: move `item()`, `needsLook()` and `selfHeal()` verbatim out of `attentionMenuGroups.test.tsx` (which imports them back; run it to prove nothing changed), exported as `item`, `needsLookItem`, `selfHealItem`.

tests/helpers/publishedAttentionBaseline.ts:

```ts
export const PUBLISHED_ATTENTION_PILL_FIXTURE_PATH =
  "tests/components/admin/showpage/__fixtures__/published-attention-pill-baseline.html";
export const PUBLISHED_ATTENTION_MENU_FIXTURE_PATH =
  "tests/components/admin/showpage/__fixtures__/published-attention-menu-baseline.html";
```

tests/components/admin/showpage/publishedAttentionBaseline.test.tsx: first line `// @vitest-environment jsdom` (the root `vitest.config.ts` environment is `node`; every DOM-rendering peer declares the directive), then the same `vi.mock` set and `ShareTokenProvider` wrapper as `publishedReviewModal.test.tsx` (copy its module-top mocks verbatim; the `renderModal`/`baseProps` helpers are duplicated into this file rather than lifted, because they close over `vi.fn()` and the test module graph). Two cases, each:

```ts
const CAPTURE = process.env.PUBLISHED_ATTENTION_CAPTURE === "1";
function check(path: string, html: string) {
  const abs = join(process.cwd(), path);
  if (CAPTURE) { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, `${html}\n`); }
  const expected = readFileSync(abs, "utf8").trim();
  expect(expected.length).toBeGreaterThan(300);
  expect(html).toBe(expected);
}
```

Case A (menu): render `<AttentionMenu items={[needsLookItem("a1"), selfHealItem("s1", "Sync stalled")]} open onClose={vi.fn()} onNavigate={vi.fn()} pillRef={pillRef} />` with the pill-ref scaffold from `attentionMenu.test.tsx` `renderMenu`; `check(PUBLISHED_ATTENTION_MENU_FIXTURE_PATH, normalizeIds(screen.getByTestId("published-show-review-attention-menu").outerHTML))`. Case B (pill cluster): render the modal via the duplicated `renderModal({ attentionItems: [needsLookItem("a1"), selfHealItem("s1", "Sync stalled")] })` with no warnings; `check(PUBLISHED_ATTENTION_PILL_FIXTURE_PATH, normalizeIds(screen.getByTestId("published-show-review-header").innerHTML))` (the whole header, which contains the trailing cluster: pill, menu mount point and `ModalCloseButton`; the same grain as the Step 3 header baseline). `normalizeIds` from `@/tests/helpers/step3HeaderBaseline`.

- [ ] **Step 4: Run once before capture (expected ENOENT, a scaffolding check, not a RED)**

Run: `pnpm exec vitest run tests/components/admin/review/reviewModalShell.test.tsx tests/components/admin/showpage/publishedAttentionBaseline.test.tsx`
Expected: `ENOENT` on all three fixture paths, proving the tests read the committed paths and nothing else.

- [ ] **Step 5: Extend the Step 3 capture script**

In `scripts/captureStep3HeaderBaseline.ts`, wrap the render in a loop over `[{ dirty: false, path: STEP3_BASELINE_FIXTURE_PATH }, { dirty: true, path: STEP3_DIRTY_BASELINE_FIXTURE_PATH }]`, passing `isDirtyRescan: dirty` and writing each path.

- [ ] **Step 6: Capture, verify GREEN, verify the clean baseline did not move**

Run: `pnpm exec tsx scripts/captureStep3HeaderBaseline.ts && PUBLISHED_ATTENTION_CAPTURE=1 pnpm exec vitest run tests/components/admin/showpage/publishedAttentionBaseline.test.tsx`
Then: `git diff --stat tests/components/admin/review/__fixtures__/step3-header-baseline.html` → Expected: no diff (if it moved, STOP: this is not the pre-change tree).
Run: `pnpm exec vitest run tests/components/admin/review/reviewModalShell.test.tsx tests/components/admin/showpage/publishedAttentionBaseline.test.tsx tests/components/admin/showpage/attentionMenuGroups.test.tsx` (capture env UNSET)
Expected: PASS.

- [ ] **Step 7: Mutant proof of the three baselines** — for each of: `Step3ReviewModal.tsx` "All clean" text, the published pill's "issue"/"issues" noun (`PublishedReviewModal.tsx`; the fixture renders "1 issue · 1 monitoring"), the needs-you heading text (`AttentionMenu.tsx`): edit the string by one character, run the two invariant files, confirm the matching invariant FAILS, `git checkout -- <file>`; a mutant whose diff is empty or whose invariant stays green is a broken baseline, not a pass. Quote the three failure lines in the commit body.

- [ ] **Step 8: Commit**

```bash
git add scripts tests/helpers tests/components/admin/review tests/components/admin/showpage
git commit --no-verify -m "test(admin): capture dirty step3 and published attention baselines before the header change"
```

<!-- tasks: depth=3 red-contract -->

### Task 2: `isWarnSeverity` at the seven sites

**Files:**
- Modify: `lib/parser/dataGaps.ts`, `lib/admin/step3SectionStatus.ts`, `lib/admin/visibleWarningRows.ts`, `lib/admin/step3Buckets.ts`, `components/admin/review/ShowReviewSurface.tsx:342`, `components/admin/wizard/step3ReviewSections.tsx:3059`.
- Create: tests/lib/admin/isWarnSeverity.test.ts.

**Interfaces:**
- Produces: `export function isWarnSeverity(w: Pick<ParseWarning, "severity">): boolean` from `@/lib/parser/dataGaps`.

What is red and why: a severity-less fixture (`{ code: "UNKNOWN_FIELD", message: "" }` cast through `unknown`) is counted by `summarizeDataGaps` today but dropped by `warningsBySection` (`step3SectionStatus.ts:95` returns on `!== "warn"`), so the new routing assertion fails.

<!-- task: red=`pnpm exec vitest run tests/lib/admin/isWarnSeverity.test.ts` red-state=authored red-target=`lib/parser/dataGaps.ts:274` why=`the severity test is inlined here as w.severity === "info" and no isWarnSeverity export exists, so case (i)'s typeof assertion is red (the namespace import keeps module load green); and warningsBySection at lib/admin/step3SectionStatus.ts:95 returns early unless severity is exactly "warn", so cases (ii) through (vi) are red on their own sites` ac=AC-9 -->

- [ ] **Step 1: Write the failing per-site tests**

tests/lib/admin/isWarnSeverity.test.ts (one `it` per site, §12.5a i–vi; vii is rendered, in Task 8):

```ts
import { describe, expect, it } from "vitest";
import { premiseHolds } from "@/tests/_shared/premise";
import * as gaps from "@/lib/parser/dataGaps"; // namespace import: the export does not exist yet, and a missing NAMED import would fail at module load instead of at the assertion
const { summarizeDataGaps } = gaps;
const isWarnSeverity = (w: Pick<ParseWarning, "severity">) => gaps.isWarnSeverity(w);
import { sectionForWarning, sectionStatus, warningsBySection } from "@/lib/admin/step3SectionStatus";
import { visibleWarningRows } from "@/lib/admin/visibleWarningRows";
import { rowIsJudgment } from "@/lib/admin/step3Buckets";
import { isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import type { ParseWarning } from "@/lib/parser/types";
import { buildParseResult, stagedRow } from "@/tests/components/admin/wizard/_step3ReviewFixture";

/** A persisted legacy row: the severity KEY is absent, not undefined-valued. */
function legacy(code: string, extra: Partial<ParseWarning> = {}): ParseWarning {
  const w = { code, message: "", ...extra } as unknown as ParseWarning;
  premiseHolds("fixture has no severity key", !("severity" in w));
  return w;
}

describe("isWarnSeverity: one predicate, seven sites (spec §2.1)", () => {
  it("(i) the predicate is exported and summarizeDataGaps counts a severity-less gap code", () => {
    expect(typeof gaps.isWarnSeverity).toBe("function"); // red today: the predicate is inlined in summarizeDataGaps
    expect(summarizeDataGaps([legacy("UNKNOWN_FIELD")]).total).toBe(1);
    expect(isWarnSeverity(legacy("UNKNOWN_FIELD"))).toBe(true);
    expect(isWarnSeverity({ severity: "info" })).toBe(false);
  });
  it("(ii) warningsBySection routes it", () => {
    const m = warningsBySection([legacy("UNKNOWN_FIELD")], new Set(["warnings"]));
    expect(m.get("warnings")?.map((e) => e.index)).toEqual([0]);
  });
  it("(iii) sectionStatus flags it", () => {
    expect(sectionStatus([legacy("UNKNOWN_FIELD")])).toBe("flagged");
  });
  it("(iv) sectionForWarning header-guesses a severity-less UNKNOWN_SECTION_HEADER", () => {
    const w = legacy("UNKNOWN_SECTION_HEADER", { rawSnippet: "CREW" });
    expect(sectionForWarning(w)).toBe("crew");
  });
  it("(v) visibleWarningRows excludes it from the info rows", () => {
    expect(visibleWarningRows([legacy("UNKNOWN_FIELD")], true)).toEqual([]);
  });
  it("(vi) rowIsJudgment is true for a severity-less ambiguity gap", () => {
    premiseHolds("ROOM_HEADER_SPLIT_AMBIGUOUS is an ambiguity code", isAmbiguityCode("ROOM_HEADER_SPLIT_AMBIGUOUS"));
    // A REAL staged row (parseResult.show present, so hasReviewablePreview is true and
    // rowNeedsLookPure does not short-circuit): the shared fixture builders.
    const row = stagedRow(buildParseResult({ warnings: [legacy("ROOM_HEADER_SPLIT_AMBIGUOUS")] }));
    premiseHolds("row has a reviewable preview", row.parseResult?.show != null);
    expect(rowIsJudgment(row)).toBe(true);
  });
});
```

`Step3RowLike` (`lib/admin/step3Buckets.ts`) needs `parseResult.show` for `hasReviewablePreview`; `stagedRow(buildParseResult(...))` supplies a full `Step3Row`, so no cast is needed.

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run tests/lib/admin/isWarnSeverity.test.ts`
Expected: (i) FAILS on the `typeof` assertion (no export), (ii) through (vi) FAIL on their sites; the file loads (namespace import).

- [ ] **Step 3: Implement**

`lib/parser/dataGaps.ts`, above `summarizeDataGaps`:

```ts
/** The #289 contract in one place: a warning is warn-severity unless it says "info".
 *  Persisted legacy rows can lack the field entirely; they count as warn (spec 2026-08-27 §2.1). */
export function isWarnSeverity(w: Pick<ParseWarning, "severity">): boolean {
  return w.severity !== "info";
}
```

and in `summarizeDataGaps` replace `if (w.severity === "info") continue;` with `if (!isWarnSeverity(w)) continue;` (comment kept).

Then the other six sites (seven including `summarizeDataGaps` above), each a one-line swap, importing `isWarnSeverity` from `@/lib/parser/dataGaps`:
- `step3SectionStatus.ts` `sectionForWarning`: `if (isWarnSeverity(w) && w.code === "UNKNOWN_SECTION_HEADER")`.
- `step3SectionStatus.ts` `warningsBySection`: `if (!isWarnSeverity(warning)) return;`.
- `step3SectionStatus.ts` `sectionStatus`: `const warns = warnings.filter(isWarnSeverity);`.
- `ShowReviewSurface.tsx` `hasWarnRow` fallback: `return data.warnings.some(isWarnSeverity);`.
- `step3ReviewSections.tsx` list row: `const isWarn = isWarnSeverity(w);`.
- `visibleWarningRows.ts`: `return warnings.filter((w) => !isWarnSeverity(w));`.
- `step3Buckets.ts` `rowIsJudgment`: `.some((w) => isWarnSeverity(w) && isAmbiguityCode(w.code))`.

- [ ] **Step 4: Verify GREEN and sweep**

Run: `pnpm exec vitest run tests/lib/admin/isWarnSeverity.test.ts tests/parser/dataGaps.test.ts tests/lib/admin tests/components/admin/wizard/Step3ReviewModal.test.tsx`
Expected: PASS.
Run: `rg -n 'severity (===|!==) "warn"' lib/admin components/admin lib/parser` → Expected: no hits (paste the empty output in the commit body).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts lib/admin components/admin/review/ShowReviewSurface.tsx components/admin/wizard/step3ReviewSections.tsx tests/lib/admin/isWarnSeverity.test.ts
git commit --no-verify -m "fix(admin): one isWarnSeverity predicate across the seven review-surface sites"
```

### Task 3: `deriveWarningAttention`

**Files:**
- Create: lib/admin/warningAttention.ts, tests/lib/admin/warningAttention.test.ts, tests/parser/_dataGapBuckets.ts (exports the three code sets, imported by `dataGapsClassCompleteness.test.ts` in place of its local consts).

**Interfaces:**
- Produces (spec §2, verbatim types): `WarningTone`, `WarningAttentionInput`, `WarningAttentionEntry<T>`, `WarningAttention<T>`, `deriveWarningAttention<T extends WarningAttentionInput>(entries, sections)`.

<!-- task: red=`pnpm exec vitest run tests/lib/admin/warningAttention.test.ts` red-state=authored red-target=`lib/admin/warningAttention.ts` why=`the module does not exist (an untracked path is the legal red-target for a module the task creates, lib/specLint/redContract.ts targetProblem), so the import fails; nothing in lib/admin derives a per-warning partition today, only the per-section sectionStatus` ac=AC-1,AC-9 -->

Path-only citation discipline: this red-target is legal only while the path is untracked. Step 5's commit re-cites it as `lib/admin/warningAttention.ts:<line of export function deriveWarningAttention>` in the SAME commit (the lint reads the whole plan at any later time; precedent `docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { deriveWarningAttention } from "@/lib/admin/warningAttention";
import { GAP_CLASSES, summarizeDataGaps } from "@/lib/parser/dataGaps";
import { AMBIGUITY_CODES, isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import { KIND_TO_SECTION, sectionStatus, warningsBySection } from "@/lib/admin/step3SectionStatus";
import { ASSET_WARN_CODES, BENIGN_WARN_CODES } from "@/tests/parser/_dataGapBuckets";
import type { ParseWarning } from "@/lib/parser/types";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { buildStagedSectionData } from "@/components/admin/review/sectionData";
import { sectionDataArgs } from "@/tests/components/admin/wizard/_step3ReviewFixture"; // add: the arg object Step3ReviewModal.test.tsx's sectionData() passes to buildStagedSectionData, exported so tests share one shape

// The REAL registry, so labels are read from production, never restated here.
const DEFS = step3Sections(buildStagedSectionData({ /* the shared wizard fixture: */ ...sectionDataArgs() }));
const SECTIONS = DEFS.map((d) => ({ id: d.id, label: d.label }));
const labelOf = (id: SectionId) => DEFS.find((d) => d.id === id)!.label;
const warn = (code: string, kind = "crew"): ParseWarning => ({ severity: "warn", code, message: "", blockRef: { kind } });
const route = (ws: ParseWarning[]) =>
  [...warningsBySection(ws, new Set(SECTIONS.map((s) => s.id)))].flatMap(([sectionId, list]) =>
    list.map((e) => ({ id: `warning:${e.index}`, sectionId, warning: e.warning, index: e.index })),
  ).sort((a, b) => a.index - b.index);

describe("deriveWarningAttention", () => {
  it("partitions by isAmbiguityCode and keeps input order", () => {
    premiseHolds("ROOM_HEADER_SPLIT_AMBIGUOUS is ambiguity", isAmbiguityCode("ROOM_HEADER_SPLIT_AMBIGUOUS"));
    const r = deriveWarningAttention(route([warn("UNKNOWN_FIELD"), warn("ROOM_HEADER_SPLIT_AMBIGUOUS", "rooms"), warn("UNKNOWN_FIELD")]), SECTIONS);
    expect(r.needsLook.map((e) => e.index)).toEqual([0, 2]);
    expect(r.judgment.map((e) => e.index)).toEqual([1]);
    expect(r.all.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(r.all[1]!.sectionLabel).toBe(labelOf(r.all[1]!.sectionId)); // label READ from the registry
    // the function reads the SUPPLIED registry, not a hardcoded string: a synthetic registry proves it
    const synthetic = SECTIONS.map((x) => ({ ...x, label: `Zz ${x.id}` }));
    // an UNMAPPED kind routes to the warnings bucket (KIND_TO_SECTION has no "nope"), so the label proves both the registry read AND the spec's unmapped case
    premiseHolds("kind is unmapped", !("nope" in KIND_TO_SECTION));
    expect(deriveWarningAttention(route([warn("UNKNOWN_FIELD", "nope")]), synthetic).all[0]!.sectionLabel).toBe("Zz warnings");
    expect(deriveWarningAttention(route([warn("UNKNOWN_FIELD", "nope")]), SECTIONS).all[0]!.sectionLabel).toBe(labelOf("warnings" as SectionId));
  });
  it("I-1: never counts fewer than the badge, across every known code, typed and severity-less", () => {
    const codes = [
      ...GAP_CLASSES.map((g) => g.code),
      ...AMBIGUITY_CODES,
      ...BENIGN_WARN_CODES,
      ...ASSET_WARN_CODES,
      "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
    ];
    premise("non-gap warn corpus", BENIGN_WARN_CODES.size + ASSET_WARN_CODES.size, 0);
    for (const code of codes) {
      const typed = warn(code);
      const { severity: _s, ...legacy } = typed;
      premiseHolds("legacy has no severity key", !("severity" in legacy));
      for (const w of [typed, legacy as unknown as ParseWarning]) {
        const r = deriveWarningAttention(route([w]), SECTIONS);
        expect(r.all.length, code).toBeGreaterThanOrEqual(summarizeDataGaps([w]).total);
      }
    }
  });
  it("I-2: per section and per shape, flagged iff a needsLook entry, judgment iff only judgment entries, clean iff none", () => {
    // Every registry section that a warning can route to (KIND_TO_SECTION keys), times
    // four shapes: needs-look only, judgment only, mixed, none. A mutant that always
    // returns "flagged" fails on the judgment-only and clean shapes; one that never
    // returns "judgment" fails on judgment-only.
    const kinds = Object.entries(KIND_TO_SECTION) as Array<[string, SectionId]>;
    premise("routable kinds", kinds.length, 3);
    const shapes = {
      needs: (k: string) => [warn("UNKNOWN_FIELD", k)],
      judg: (k: string) => [warn("ROOM_HEADER_SPLIT_AMBIGUOUS", k)],
      mixed: (k: string) => [warn("UNKNOWN_FIELD", k), warn("ROOM_HEADER_SPLIT_AMBIGUOUS", k)],
      none: (_k: string) => [] as ParseWarning[],
    };
    for (const [kind, sid] of kinds) for (const [name, make] of Object.entries(shapes)) {
      const ws = make(kind);
      const rendered = new Set(SECTIONS.map((x) => x.id));
      const by = warningsBySection(ws, rendered);
      const r = deriveWarningAttention(route(ws), SECTIONS);
      const target = rendered.has(sid) ? sid : ("warnings" as SectionId);
      const st = sectionStatus((by.get(target) ?? []).map((e) => e.warning));
      const hasNeeds = r.needsLook.some((e) => e.sectionId === target);
      const hasJudg = r.judgment.some((e) => e.sectionId === target);
      expect(st, `${kind}/${name}`).toBe(hasNeeds ? "flagged" : hasJudg ? "judgment" : "clean");
      expect(r.all.length, `${kind}/${name}`).toBe(ws.length);
    }
  });
  it("I-3: any warn-severity input yields a non-empty `all`", () => {
    expect(deriveWarningAttention(route([warn("SOME_UNKNOWN_CODE")]), SECTIONS).all).toHaveLength(1);
  });
  it("throws on an info entry and on an unlabelable section", () => {
    const info = { ...warn("UNKNOWN_FIELD"), severity: "info" as const };
    expect(() => deriveWarningAttention([{ id: "x", sectionId: "crew" as SectionId, warning: info }], SECTIONS)).toThrow();
    expect(() => deriveWarningAttention(route([warn("UNKNOWN_FIELD")]), [])).toThrow();
  });
});
```

tests/parser/_dataGapBuckets.ts exports `BENIGN_WARN_CODES`, `BENIGN_INFO_CODES`, `ASSET_WARN_CODES`, `NON_GAP_CATALOG_CODES` moved verbatim out of `dataGapsClassCompleteness.test.ts`, which imports them back (no behavior change; run it to prove it).

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run tests/lib/admin/warningAttention.test.ts`
Expected: FAIL, "Cannot find module '@/lib/admin/warningAttention'".

- [ ] **Step 3: Implement**

lib/admin/warningAttention.ts:

```ts
// lib/admin/warningAttention.ts. Spec: docs/superpowers/specs/2026-08-27-wizard-review-attention-menu-design.md §2
import { isWarnSeverity } from "@/lib/parser/dataGaps";
import { isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import type { ParseWarning } from "@/lib/parser/types";
import type { SectionId } from "@/lib/admin/step3SectionStatus";

export type WarningTone = "needsLook" | "judgment";
export type WarningAttentionInput = { id: string; sectionId: SectionId; warning: ParseWarning };
export type WarningAttentionEntry<T extends WarningAttentionInput = WarningAttentionInput> = T & {
  sectionLabel: string;
  tone: WarningTone;
};
export type WarningAttention<T extends WarningAttentionInput = WarningAttentionInput> = {
  needsLook: readonly WarningAttentionEntry<T>[];
  judgment: readonly WarningAttentionEntry<T>[];
  all: readonly WarningAttentionEntry<T>[];
};

export function deriveWarningAttention<T extends WarningAttentionInput>(
  entries: readonly T[],
  sections: ReadonlyArray<{ id: SectionId; label: string }>,
): WarningAttention<T> {
  const labels = new Map(sections.map((s) => [s.id, s.label] as const));
  const all: WarningAttentionEntry<T>[] = entries.map((entry) => {
    if (!isWarnSeverity(entry.warning)) {
      throw new Error(`deriveWarningAttention: info-severity entry ${entry.id}`);
    }
    const sectionLabel = labels.get(entry.sectionId);
    if (sectionLabel === undefined) {
      throw new Error(`deriveWarningAttention: no label for section ${entry.sectionId}`);
    }
    const tone: WarningTone = isAmbiguityCode(entry.warning.code) ? "judgment" : "needsLook";
    return { ...entry, sectionLabel, tone };
  });
  return {
    all,
    needsLook: all.filter((e) => e.tone === "needsLook"),
    judgment: all.filter((e) => e.tone === "judgment"),
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/lib/admin/warningAttention.test.ts tests/parser/dataGapsClassCompleteness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/warningAttention.ts tests/lib/admin/warningAttention.test.ts tests/parser/_dataGapBuckets.ts tests/parser/dataGapsClassCompleteness.test.ts
git commit --no-verify -m "feat(admin): deriveWarningAttention, the shared needs-look/judgment partition"
```

### Task 4: Split `AttentionMenu` into an exported frame + row, byte-identical

**Files:**
- Modify: `components/admin/showpage/AttentionMenu.tsx`; registries `tests/styles/controlOutlineScan.ts:210`, `tests/styles/controlOutlineResidue.ts:933`, `tests/styles/_metaControlOutlineResidue.test.ts:1542`, `tests/components/admin/showpage/pageTransitions.test.tsx` (`AttentionMenu.tsx` count).
- Test: tests/components/admin/showpage/publishedAttentionBaseline.test.tsx (Task 1) stays green; new cases in tests/components/admin/showpage/attentionMenuFrame.test.tsx.

**Interfaces:**
- Produces (spec §5): `export function AttentionMenuFrame({ testId, ariaLabel, scrollerLabel, pillRef, onClose, heading?, children })`, `export function AttentionMenuRow({ testId, dotClassName, srText, title, secondLine, truncateSecondLine, onSelect })`, both from `@/components/admin/showpage/AttentionMenu`.

<!-- task: red=`pnpm exec vitest run tests/components/admin/showpage/attentionMenuFrame.test.tsx` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:61` why=`AttentionMenuPanel is module-private and takes AttentionItem[]; the new test imports AttentionMenuFrame and AttentionMenuRow, which the module does not export` ac=AC-7 -->

- [ ] **Step 1: Write the failing frame tests**

attentionMenuFrame.test.tsx (first line `// @vitest-environment jsdom`): render `<AttentionMenuFrame testId="t-frame" ariaLabel="Needs you" scrollerLabel="Attention items" pillRef={pillRef} onClose={onClose}>` with two `<AttentionMenuRow>` children; assert (a) the panel has `role="group"` + `aria-label="Needs you"` and the scroller inside has `role="group"`, `aria-label="Attention items"`, `tabindex="0"`; (b) a capture-phase Escape calls `onClose` once and focuses the pill, and a bubble listener on `document` does NOT see the event; (c) `AttentionMenuRow` with `secondLine: null` renders no second-line span, with a string renders it, `truncateSecondLine: true` adds `truncate`; (d) `heading` renders between the panel edge and the scroller (heading element's `nextElementSibling` is the scroller). Reuse the `renderMenu` pill-ref scaffold from `attentionMenu.test.tsx`.

- [ ] **Step 2: RED** — Run: `pnpm exec vitest run tests/components/admin/showpage/attentionMenuFrame.test.tsx`. Expected: FAIL, no export `AttentionMenuFrame`.

- [ ] **Step 3: Refactor in place**

In `AttentionMenu.tsx`: rename `AttentionMenuPanel` to `AttentionMenuFrame` with the §5 props; move the `needsYou`/`monitoring` derivation and the group markup into `AttentionMenu` itself, which now renders `<AttentionMenuFrame testId="published-show-review-attention-menu" ariaLabel={hasNeedsYou ? "Needs you" : "Monitoring"} scrollerLabel="Attention items" pillRef={pillRef} onClose={onClose} heading={hasNeedsYou ? <div data-testid="attention-needsyou-heading" …>…</div> : undefined}>{rows}{monitoringGroup}</AttentionMenuFrame>`. Extract the row `<button>` (the block carrying `data-testid={\`attention-menu-row-${item.id}\`}`) into `export function AttentionMenuRow(...)` with the exact class string; the needs-you map becomes `<AttentionMenuRow key={item.id} testId={\`attention-menu-row-${item.id}\`} dotClassName={tone.dot} srText={tone.srText} title={item.menuTitle} secondLine={secondLine} truncateSecondLine={hint === null} onSelect={() => { onClose(); onNavigate(item); }} />`. Keep `if (!open) return null;` in `AttentionMenu`. Keep the `useFitWithinClip` import literal. Do not reorder listener registration.

- [ ] **Step 4: GREEN + byte identity + registries**

Run: `pnpm exec vitest run tests/components/admin/showpage/attentionMenuFrame.test.tsx tests/components/admin/showpage/attentionMenu.test.tsx tests/components/admin/showpage/attentionMenuGroups.test.tsx tests/components/admin/showpage/publishedAttentionBaseline.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/useFitWithinClip.test.tsx`
Expected: PASS (the baseline test proves byte identity).
Run: `pnpm exec vitest run tests/styles tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/pageTransitions.test.tsx`
Expected: FAIL on the moved divider line (`AttentionMenu.tsx:189` in `controlOutlineScan.ts` `DIVIDERS` and the `_metaControlOutlineResidue.test.ts:1542` blind-oracle string; `controlOutlineResidue.ts` is keyed by file + tag + paint and should stay green) and possibly the `AttentionMenu.tsx` conditional count. Re-key each to the line the scanner reports (`grep -n 'border-b border-border px-4 py-3' components/admin/showpage/AttentionMenu.tsx` is the divider), re-run, paste the scanner's before/after in the commit body. `_metaPopoverPlacementContract` must pass with NO registry edit.

- [ ] **Step 5: Commit** — `git commit --no-verify -m "refactor(admin): export AttentionMenuFrame and AttentionMenuRow from AttentionMenu, byte-identical"`

### Task 5: `PerShowActionableWarnings` `anchorIds`

**Files:**
- Modify: `components/admin/PerShowActionableWarnings.tsx` (props + the `<li>` at line 372).
- Test: tests/components/admin/perShowActionableWarnings.anchorIds.test.tsx (new).

<!-- task: red=`pnpm exec vitest run tests/components/admin/perShowActionableWarnings.anchorIds.test.tsx` red-state=authored red-target=`components/admin/PerShowActionableWarnings.tsx:372` why=`the item li renders no data-attention-anchor and the component accepts no anchorIds prop, so the aligned case's attribute assertion finds nothing` ac=AC-8 -->

- [ ] **Step 1: Failing tests** — file starts with `// @vitest-environment jsdom`; six cases (§12.19b): absent, `[]`, shorter, longer, aligned, `["", "b"]`; each renders three `warn`-severity items and asserts, per `[data-testid="per-show-actionable-item"]` by index, `getAttribute("data-attention-anchor")` equals the expected id or is `null`. Use `renderItemControls={() => null}`.
- [ ] **Step 2: RED** — Run the file. Expected: aligned/shorter/longer/empty-string cases FAIL (no attribute); absent and `[]` pass.
- [ ] **Step 3: Implement** — add `anchorIds?: readonly string[]` to the props type; in the map: `const anchor = anchorIds?.[i]; … <li … {...(anchor ? { "data-attention-anchor": anchor } : {})}>`.
- [ ] **Step 4: GREEN** — Run the new file plus `tests/components/admin` files that import `PerShowActionableWarnings` (`rg -l PerShowActionableWarnings tests`). Expected: PASS.
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): PerShowActionableWarnings takes optional per-item anchor ids"`

### Task 6: Published modal: sheet-warnings segment, menu group, card jumps

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/showpage/AttentionMenu.tsx` (`warningIndex` prop), `components/admin/showpage/sectionWarningExtras.tsx` lines 60, 227 (anchor ids).
- Registries: `tests/styles/controlOutlineScan.ts:181`, `tests/styles/_metaControlOutlineFill.test.ts:469` (pill line re-key), `pageTransitions.test.tsx` (`PublishedReviewModal.tsx`, `AttentionMenu.tsx` counts).
- Tests: `publishedReviewModal.test.tsx` (16, 17, 19, 20, cap 99/100), `attentionMenuGroups.test.tsx` (18).

**Interfaces:**
- Consumes: `deriveWarningAttention`, `AttentionMenuRow`, `anchorIds`.
- Produces: `AttentionMenu` prop `warningIndex?: { entries: readonly SheetWarningEntry[]; onNavigate: (entry: SheetWarningEntry) => void }`; `export type SheetWarningEntry`.

<!-- task: red=`pnpm exec vitest run tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/showpage/attentionMenuGroups.test.tsx` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:339` why=`interactive is needsYou.length > 0 || selfHeal.length > 0 with no warnings term, so zero items plus three active warn rows still renders the In sync span and the new test's "3 sheet warnings" button assertion fails` ac=AC-6,AC-7,AC-8 -->

- [ ] **Step 1: Failing tests**

In `publishedReviewModal.test.tsx` (helpers `renderModal(overrides, warnings)`, `pill()`, `visibleText`):

```tsx
const warnRow = (code: string, kind: string): ParseWarning => ({ severity: "warn", code, message: "", blockRef: { kind } });
/** The count under test, derived from the fixture through the production derivation,
 *  never restated: k = every active warn row the model routes. */
function expectedK(warnings: ParseWarning[]): number {
  const props = baseProps({}, warnings);
  return Object.values(props.bySection).reduce((n, m) => n + (m?.active.length ?? 0), 0);
}
it("sheet warnings alone: interactive '{k} sheet warnings' pill, never In sync (spec §4.2)", () => {
  const ws = [warnRow("UNKNOWN_FIELD", "crew"), warnRow("UNKNOWN_FIELD", "crew"), warnRow("FIELD_UNREADABLE", "rooms")];
  const k = expectedK(ws);
  premise("fixture routes more than one warning", k, 1);
  renderModal({ attentionItems: [] }, ws);
  const el = pill();
  expect(el.tagName).toBe("BUTTON");
  expect(visibleText(el)).toBe(`${k} sheet warnings`);
  expect(screen.queryByText("In sync")).toBeNull();
});
it("segments compose in order with separators only between present ones", () => {
  const items = [actionable("a1"), actionable("a2"), selfHealItem("s1")];
  const ws = [warnRow("UNKNOWN_FIELD", "crew")];
  const k = expectedK(ws);
  premiseHolds("exactly one warning so the singular noun is exercised", k === 1);
  renderModal({ attentionItems: items }, ws);
  const issues = items.filter((i) => i.actionable).length;
  const mon = items.filter((i) => !i.actionable && i.clearingKind === "self_heal").length;
  expect(visibleText(pill())).toBe(`${issues} issues · ${k} sheet warning · ${mon} monitoring`);
  const seg = screen.getByTestId("attention-pill-warnings-segment");
  expect(seg.textContent).toContain("·"); // separator lives INSIDE the wrap unit
});
it.each([99, 100])("cap boundary at %i sheet warnings", (count) => {
  const ws = Array.from({ length: count }, () => warnRow("UNKNOWN_FIELD", "crew"));
  const k = expectedK(ws);
  premiseHolds("fixture routes every warning", k === count);
  renderModal({ attentionItems: [] }, ws);
  const el = pill();
  const visible = k > 99 ? "99+" : String(k);
  expect(visibleText(el)).toBe(`${visible} sheet warnings`);
  const sr = el.querySelector(".sr-only");
  if (k > 99) expect(sr?.textContent).toBe(`(${k} sheet warnings)`); else expect(sr).toBeNull();
});
it("menu row click jumps to the card anchor on both render paths", async () => {
  // grouped: rooms warning renders in section-warning-active-rooms; crew: renders under the row for a crewKey the fixture renders
  // click attention-menu-row-warning:<id>-0 → the <li data-attention-anchor="warning:<id>"> gains data-step3-warning-flash
});
it("ignoring the last warning drops the pill to In sync and closes the menu", async () => { /* ignore via the card's Ignore control mock, then assert */ });
it("issues + warnings, no monitoring: two segments, one separator (spec §12.17)", () => {
  const items = [actionable("a1")]; const ws = [warnRow("UNKNOWN_FIELD", "crew"), warnRow("UNKNOWN_FIELD", "rooms")];
  const k = expectedK(ws); premise("plural warnings", k, 1);
  renderModal({ attentionItems: items }, ws);
  expect(visibleText(pill())).toBe(`1 issue · ${k} sheet warnings`);
  expect(screen.queryByTestId("attention-pill-monitoring-segment")).toBeNull();
});
it("a crew warning past the under-row cap has no card: the jump lands on the crew section top with no flash", async () => {
  // Fixture: more crew-scoped warnings for ONE rendered crew key than the row host's visible cap
  // (read CREW_CAP / the cap constant from sectionWarningExtras.tsx / the crew row host; premise that the fixture exceeds it).
  // Click the menu row for the over-cap warning (its reportSurfaceId derived via buildReportSurfaceId) →
  // no element in the scroller carries data-attention-anchor for it, the crew section is active, and
  // querySelector("[data-step3-warning-flash]") is null.
});
```

Derive `<id>` from `buildReportSurfaceId(SLUG, warning)` (`@/lib/dataQuality/warningFingerprint`), not from the DOM. In `attentionMenuGroups.test.tsx` add: with `warningIndex={{ entries, onNavigate }}` the Sheet warnings heading (`attention-sheetwarnings-heading`) sits between the needs-you rows and `attention-monitoring-group`; rows are `BUTTON`s with zero `<a>`; click order `["close", "navigate"]`; a judgment-code entry's dot has `bg-text-faint`, a gap-code entry's `bg-status-review`; without the prop the tree matches the Task 1 baseline (already pinned).

- [ ] **Step 2: RED** — run both files; Expected: the new cases FAIL as stated in the marker; every existing case PASSES.

- [ ] **Step 3: Implement**

`AttentionMenu.tsx`: add the `warningIndex` prop (§4.3) and, after the needs-you rows, when `sheetWarningRows.length > 0`, the group:

```tsx
<div data-testid="attention-sheetwarnings-group" className={hasNeedsYou ? "border-t border-border" : undefined}>
  <div data-testid="attention-sheetwarnings-heading" className={`bg-surface-sunken px-4 pt-2.5 pb-1.5 ${hasNeedsYou ? "" : "rounded-t-md"}`}>
    <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">Sheet warnings</span>
  </div>
  {sheetWarningRows.map((entry, i) => (
    <AttentionMenuRow key={`${entry.id}:${i}`} testId={`attention-menu-row-${entry.id}-${i}`}
      dotClassName={entry.tone === "judgment" ? "bg-text-faint" : "bg-status-review"}
      srText={entry.tone === "judgment" ? "judgment call: " : "needs review: "}
      title={reviewWarningTitle(entry.warning)} secondLine={entry.sectionLabel} truncateSecondLine
      onSelect={() => { onClose(); warningIndex!.onNavigate(entry); }} />
  ))}
</div>
```

Monitoring group's `className` becomes `hasNeedsYou || sheetWarningRows.length > 0 ? "border-t border-border" : undefined`; the panel `ariaLabel` is `hasNeedsYou ? "Needs you" : sheetWarningRows.length > 0 ? "Sheet warnings" : "Monitoring"`.

`PublishedReviewModal.tsx`: the `sheetWarnings` memo from spec §4.1 (from `bySection[s.id]?.active`, `step3Sections(data)` for labels — import from `@/components/admin/wizard/step3ReviewSections`); `k`; `interactive`/`monitoringOnly` per §4.1; the segment per §4.2 as a wrap unit (copy the monitoring segment's `<span className="inline-flex items-center gap-1.5">` shape, separator `{needsYou.length > 0 ? <span className="opacity-50">{" · "}</span> : null}`, text `{k > 99 ? "99+" : k} {k === 1 ? "sheet warning" : "sheet warnings"}`, sr-only `({k} sheet warnings)` when capped); monitoring segment separator condition `needsYou.length > 0 || k > 0`; `navigateWarning` sets `setJump({ itemId: entry.id, sectionId: entry.sectionId, nonce: ++jumpNonceRef.current })`; pass `{...(k > 0 ? { warningIndex: { entries: sheetWarnings.all, onNavigate: navigateWarning } } : {})}` to `AttentionMenu`.

`sectionWarningExtras.tsx`: `anchorIds={[\`warning:${it.reportSurfaceId}\`]}` at the crew mount and `anchorIds={g.items.map((it) => \`warning:${it.reportSurfaceId}\`)}` at the grouped mount.

- [ ] **Step 4: GREEN, baselines, registries**

Run: the two test files + publishedAttentionBaseline.test.tsx + `attentionMenu.test.tsx` + `pillFocusReconcile.test.tsx` + `clearingPillLabel.test.tsx` + `publishedPill.test.tsx`. Expected: PASS.
Run: `pnpm exec vitest run tests/styles tests/components/admin/showpage/pageTransitions.test.tsx tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts`. Re-key `PublishedReviewModal.tsx:979` rows (`controlOutlineScan.ts:181`, `_metaControlOutlineFill.test.ts:469`) to the line the scanner reports; re-measure the two `PAGE_COMPONENT_COUNTS` entries by running the scanner; nothing added to `CENSUS`/`HOVER_SUBTLE`. Paste outputs in the commit.

- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): published pill counts sheet warnings and the menu indexes them with card jumps"`

### Task 7: `WizardAttentionMenu`

**Files:**
- Create: components/admin/wizard/WizardAttentionMenu.tsx, tests/components/admin/wizard/wizardAttentionMenu.test.tsx.
- Registries: `pageTransitions.test.tsx` (WizardAttentionMenu.tsx measured count), `transitionAudit.test.tsx` `SERVER_RENDERED`.

**Interfaces:**
- Consumes: `AttentionMenuFrame`, `AttentionMenuRow`, `WarningAttention`, `reviewWarningTitle`.
- Produces: `WizardAttentionMenu` with spec §3.3 props; `export type WizardAttentionEntry = WarningAttentionEntry<{ id: string; sectionId: SectionId; warning: ParseWarning; index: number }>`.

<!-- task: red=`pnpm exec vitest run tests/components/admin/wizard/wizardAttentionMenu.test.tsx` red-state=authored red-target=`components/admin/wizard/WizardAttentionMenu.tsx` why=`the module does not exist (untracked path, the legal form for a module the task creates), so the import fails; no file under components/admin/wizard renders a warning index` ac=AC-3 -->

Path-only citation discipline: Step 5's commit re-cites this target as `components/admin/wizard/WizardAttentionMenu.tsx:<line of export function WizardAttentionMenu>` in the same commit, as Task 3 does.

- [ ] **Step 1: Failing tests** — file starts with `// @vitest-environment jsdom`. Build `attention` with `deriveWarningAttention` over a constructed entry list (two needs-look + one judgment) so every expected count below is read from `attention.needsLook.length` / `attention.judgment.length` / `attention.all.length`, never restated; render with `open: true`: panel testid `wizard-step3-card-<dfid>-review-attention-menu`, `aria-label="Needs a look"`, heading `wizard-attention-needslook-heading` outside the scroller (`aria-label="Warnings to review"`), rows `wizard-step3-card-<dfid>-attention-row-<index>` titled by `reviewWarningTitle`, second line = section label, judgment heading `wizard-attention-judgment-heading` with `border-t`, judgment row dot `bg-text-faint`; judgment-only → `aria-label="Judgment calls"`, heading `rounded-t-md`, no needs-look heading; click → `onClose` then `onNavigate(entry)`; `open: false` → nothing rendered; a large list: build `N = 100` entries, `premise("list exceeds the visible cap", attention.all.length, 99)`, and assert the rendered row count equals `attention.all.length` (no cap on rows).
- [ ] **Step 2: RED** — module missing.
- [ ] **Step 3: Implement** per spec §3.3, using the frame + row from Task 4; no overlay markup, no `useFitWithinClip` import here.
- [ ] **Step 4: GREEN + enrol** — run the file; then `pageTransitions.test.tsx` (add `"components/admin/wizard/WizardAttentionMenu.tsx": <measured>` with a comment naming each conditional) and `transitionAudit.test.tsx` (`SERVER_RENDERED` row); run both, paste the scanner output.
- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(wizard): WizardAttentionMenu, the Step 3 warning index over the shared frame"`

### Task 8: Wizard modal header, counts, jump, footer, effects

**Files:**
- Modify: `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/wizard/step3ReviewSections.tsx:3069` (`data-attention-anchor`).
- Registries: `step3ReviewModal.transitions.test.tsx` (site count), `step3JudgmentChrome.test.tsx` (10 → 11), `controlOutlineScan.ts` lines 104, 106, `tapTargetCensus.ts:205` (Step3ReviewModal line re-keys).
- Tests: `Step3ReviewModal.test.tsx` (§12 items 6–15, 5a-vii, 10a; `expectedFlagged` rewritten), `reviewModalShell.test.tsx` (both baselines stay green).

<!-- task: red=`pnpm exec vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:296` why=`flaggedCount counts sections with a flagged sectionStatus, so two crew warnings in one section render "1 needs a look" and the new case asserting "2 need a look" fails` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-9,AC-11 -->

The transition cases live in `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` (new describe "attention pill: §8 inventory") and are part of this task's RED (they fail for the marker's reason: no menu exists) and GREEN.

- [ ] **Step 1: Failing tests**

Rewrite `expectedFlagged` to count warnings:

```ts
function expectedCounts(d: StagedSectionData): { n: number; m: number } {
  const defs = step3Sections(d);
  const by = warningsBySection(d.warnings, new Set(defs.map((s) => s.id)));
  const entries = [...by].flatMap(([sectionId, l]) => l.map((e) => ({ id: `warning:${e.index}`, sectionId, warning: e.warning, index: e.index })));
  const a = deriveWarningAttention(entries, defs);
  return { n: a.needsLook.length, m: a.judgment.length };
}
```

**Transition audit (mandatory; the spec §8 inventory, tested inside this task's own red→green cycle because the menu state it exercises does not exist before this task):**

The spec's inventory, reproduced so the task is checkable against it. Wizard pill states: SheetChanged (S), AllClean (A), NeedsLook (N), Composite (C), JudgmentOnly (J).

| Pair | Treatment |
|---|---|
| S↔A | instant; no menu on either side |
| S↔N | instant; menu closed on both sides (S has none; entering N starts closed, auto-open may fire once if never consumed) |
| S↔C | instant; as S↔N |
| S↔J | instant; as S↔N, and J never auto-opens |
| A↔N | instant; A has no menu; entering N starts closed |
| A↔C | instant; as A↔N |
| A↔J | instant; as A↔N |
| N↔C | instant; menu state preserved (both interactive), rows re-render |
| N↔J | instant; menu state preserved, rows re-render |
| C↔J | instant; menu state preserved, rows re-render |

Compound rows: pill swaps while menu open (count > 0 keeps it open, count 0 unmounts); row click during entrance; auto-open rAF pending while modal closes; Escape during entrance; jump flash active on a second click; published: warning ignored while the menu lists it.

Cases (one `it` per pair, driven by `rerender` between `sectionData` fixtures): for S/A pairs assert no `[data-testid$="-review-attention-menu"]` before and after and the chip's tag flips span↔button with no `transition`/`animate` class on the chip's wrapper; for N/C/J pairs open the menu first (click the chip, flush the rAF), rerender, assert the menu is still mounted, `aria-expanded="true"`, and the row testids match the new fixture's `deriveWarningAttention` entries (count derived). Compound: (a) open on N, rerender to A → menu gone, `document.activeElement` inside the dialog; (b) open on N, rerender with `isDirtyRescan` → menu gone, span rendered; (c) click a row before the entrance rAF flushes → `onNavigate` fired, menu unmounted; (d) unmount the modal with the auto-open rAF pending → nothing opens, no state-update warning (spy `requestAnimationFrame`); (e) Escape during entrance → menu gone, pill focused, modal still open; (f) second click: click row 0 → `<li data-attention-anchor="warning:0">` carries the flash attribute; reopen and click row 1 → li 0 no longer carries it, li 1 does (one flash at a time). Published compound (in `publishedReviewModal.test.tsx`, Task 6): open the menu with one sheet warning, rerender with that warning ignored → row gone; with issues also 0 → menu closed, pill "In sync".

Every string expectation is BUILT from `expectedCounts(d)` plus the spec §6 noun forms; a `premise` pins the fixture's shape so the noun branch under test is the one exercised:

```ts
const look = (n: number) => (n === 1 ? "1 needs a look" : `${n} need a look`);
const judg = (m: number) => (m === 1 ? "1 judgment call" : `${m} judgment calls`);
// (6) the reported bug: two warnings, ONE section
const d6 = sectionData({ warnings: [warning("crew"), warning("crew")] });
const { n: n6, m: m6 } = expectedCounts(d6);
premise("two warnings route to one section", n6, 1); premiseHolds("no judgment", m6 === 0);
expect(chip.textContent).toBe(look(n6)); expect(chip.tagName).toBe("BUTTON");
// (7) judgment-only
const d7 = sectionData({ warnings: [judgmentWarning("rooms")] });
const { n: n7, m: m7 } = expectedCounts(d7);
premiseHolds("judgment-only", n7 === 0 && m7 >= 1);
expect(chip.textContent).toBe(judg(m7)); // + classes, footer `${m7} parsed with judgment · publishing isn't blocked`, no "All clean"
// (8) composite
const d8 = sectionData({ warnings: [warning("crew"), warning("crew"), judgmentWarning("rooms")] });
const { n: n8, m: m8 } = expectedCounts(d8);
premiseHolds("both segments present", n8 >= 1 && m8 >= 1);
expect(chip.textContent).toBe(`${look(n8)} · ${judg(m8)}`);
```

Then: (7) also asserts classes `bg-surface-sunken`, `border-text-faint` and `queryByText("All clean")` null; (8) also asserts the judgment segment element has `text-warning-text/80`; (9) `aria-expanded`/`aria-controls` on the button and the controlled element exists; All clean / Sheet changed spans have neither and `chip.parentElement` is the cluster div (no `relative` wrapper); (10)+(10a) auto-open + dirty + focus rescue (use `vi.useFakeTimers()` with `requestAnimationFrame` stubbed to run on `vi.runAllTimers()`, the pattern the published test uses); (11) row click → the `<li data-attention-anchor="warning:0">` has `data-step3-warning-flash`, menu unmounted; (12) Escape ×2; (13) outside pointerdown/focusin; (14) 99/100 for needs-look and judgment; (15) both baseline tests; (5a-vii) a severity-less unmapped warning → rail dot `wizard-step3-card-<dfid>-review-rail-dot-warnings` has `bg-status-review` and the `<li>`'s first child chip has `bg-warning-bg`. Every count in an assertion is derived from `expectedCounts`, never restated.

- [ ] **Step 2: RED** — run the marker command (both files); Expected: the new cases in BOTH files FAIL (the transition cases have no menu to open), existing cases pass except the two whose expectation was the section count (6 replaces them).

- [ ] **Step 3: Implement** spec §3.1–§3.5 in `Step3ReviewModal.tsx`: the `attention` memo; `n`, `m`, `pillInteractive`, `menuEffectivelyOpen`; the five-state header (button classes and segments verbatim from §3.2; the wrapper `<div className="relative min-w-0">` only around the button states, with `<div id={menuId}><WizardAttentionMenu … /></div>`); the reconciliation effect, the auto-open effect, the focus-rescue effect (§3.5, copied from the published `menuWasEffectivelyOpenRef` block with `interactive` → `pillInteractive`); `navigateTo` + `attentionJump={jump}` on `ShowReviewSurface`; footer per §3.5. Each new JSX conditional gets `{/* §11 …: instant — deliberate (…) */}` on the line above. `step3ReviewSections.tsx`: add `data-attention-anchor={\`warning:${i}\`}` beside `data-warning-index={i}`. Import `ChevronDown` from `lucide-react`.

- [ ] **Step 4: GREEN + baselines + registries**

Run: `pnpm exec vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/review/reviewModalShell.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx tests/components/admin/wizard/step3JudgmentChrome.test.tsx tests/components/admin/wizard tests/components/admin/review`
Expected: both baseline invariants PASS untouched; the transitions site count and the judgment-chrome transition count FAIL by exactly the measured delta → update the pinned numbers with the scanner's output and the "scan follows the code" note; re-run to PASS.
Run: `pnpm exec vitest run tests/styles` → re-key `Step3ReviewModal.tsx` rows (`controlOutlineScan.ts` lines 104, 106, `tapTargetCensus.ts:205`) to the lines reported; if a forward guard demands a row for the new pill or its rows, add exactly the row its message names and quote it.

- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(wizard): header pill counts warnings and opens the warning index with card jumps"`

<!-- tasks: end -->

### Task 9: Real-browser assertions (geometry pins; outside the red-contract region, mutant-proven)

**Files:**
- Create: tests/e2e/wizard-attention-menu.spec.ts.
- Modify: `tests/e2e/_step3ReviewModalLiveEntry.tsx` (an `attention=1` query param builds `warnings: attentionHarnessWarnings()`: two `UNKNOWN_FIELD` crew warnings + one `ROOM_HEADER_SPLIT_AMBIGUOUS` rooms warning), `playwright.config.ts` line 96 (add `wizard-attention-menu` to the desktop-chromium alternation), `.github/workflows/step3-live-bundle.yml` lines 19-20 and 75 (paths + run list).
- Published (conditional, see Step 5): `tests/e2e/published-show-attention.spec.ts`, `.github/workflows/published-modal-e2e.yml` (paths + the run list at line 152).

Harness readiness (writing-plans rule): there are NO shared `bundle()`/`serve()` helpers; `step3-review-modal.interactions.spec.ts` does the esbuild bundle, `compileEntryCss`, and the `node:http` server inline in its `test.beforeAll`, and `step3-review-modal.agenda.spec.ts` DUPLICATES that block (its own `beforeAll`). Follow the agenda precedent: copy the `beforeAll`/`afterAll` block verbatim into the new spec, pointing at `_step3ReviewModalLiveEntry.tsx` with `?attention=1`. Readiness gate: `await page.locator('[data-testid$="-review-chip"]').waitFor()` after `createRoot` hydration (never `networkidle` alone). Detach safety: every geometry read is ONE `page.evaluate` over selectors returning plain numbers, never a Locator held across a click. The config boots zero web servers for this spec only when `STEP3_LIVE_BUNDLE_ONLY=1` is set (`playwright.config.ts` webServer filter, line 461 region), so every run command below sets it, as the workflow does.

The wizard modal's clip element is `[data-step3-review-panel]` (`Step3ReviewModal.tsx` passes `dataAttrPrefix="step3-review"` to `ReviewModalShell`, which stamps `data-<prefix>-panel`); `[data-review-modal-panel]` is the PUBLISHED modal's and must not be used here (the interactions spec's `PANEL` selector is the precedent).

Why no RED marker: a geometry pin has no production-defect RED once Task 8 has landed (the dimensions it asserts are already true), and a "No tests found" collection failure is not an observed red (writing-plans rule). Discrimination is proven by mutants instead (Step 5), each checked for the three validity conditions (applied: file hash changed; in-window: Playwright reads after layout settles on a static page, so no timing window exists; on-branch: the mutated class is on the element the assertion measures, confirmed by `evaluate(() => el.className)` in the same pass).

Tailwind source coverage: the agenda spec's `beforeAll` passes raw source files to `compileEntryCss` because the static fixture cannot emit classes it never renders. Add `components/admin/wizard/Step3ReviewModal.tsx`, components/admin/wizard/WizardAttentionMenu.tsx, and `components/admin/showpage/AttentionMenu.tsx` to that source list in the new spec, and assert once in the spec that the compiled CSS contains the `min-h-tap-min` rule and the escaped `before:-inset-y-3` rule (match on the utility names as substrings of the CSS text) (a missing rule makes every geometry assertion measure unstyled markup).

- [ ] **Step 1: Wire first** — config alternation; `.github/workflows/step3-live-bundle.yml` paths gain the new spec AND its geometry owners `components/admin/wizard/WizardAttentionMenu.tsx`, `components/admin/showpage/AttentionMenu.tsx`, `components/admin/useFitWithinClip.ts` (a later edit to the frame, rows or clip helper must re-run this gate), and the run list at line 75 gains the spec; live-entry `attention=1` param; the Tailwind source list.
- [ ] **Step 2: Write the spec** — at 1280×800 and after `page.setViewportSize({ width: 375, height: 667 })`: (a) pill hit band: `document.elementFromPoint(cx, cy ± 20)` resolves to the chip button, and the computed before-pseudo-element `top`/`bottom` insets plus the box height sum to ≥ 44; (b) open the menu; every `[data-testid^="wizard-step3-card-"][data-testid*="-attention-row-"]` has `getBoundingClientRect().height >= 44`; (c) the panel's `left >= clip.left`, `right <= clip.right` and `bottom <= clip.bottom` where `clip = document.querySelector('[data-step3-review-panel]').getBoundingClientRect()` (a right-anchored panel overflows LEFT when too wide, so the left edge is the discriminating one at 375); (d) click the first row → the `<li data-attention-anchor="warning:0">` is inside the scroller viewport (`top >= scroller.top && bottom <= scroller.bottom`) and carries `data-step3-warning-flash`.
- [ ] **Step 3: Run** — `STEP3_LIVE_BUNDLE_ONLY=1 pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/wizard-attention-menu.spec.ts tests/e2e/step3-review-modal.interactions.spec.ts`. Expected: PASS.
- [ ] **Step 4: Mutant proofs (each must FAIL the named assertion; revert after each)** — (i) `min-h-tap-min` → `min-h-0` AND `py-3` → `py-0` together on `AttentionMenuRow` (the wizard rows always carry a two-line body, so padding alone keeps a one-mutant row above 44px and does not discriminate; the joint mutant leaves ~36px of text) → assertion (b) fails; (ii) `before:-inset-y-3` → `before:inset-y-0` on the wizard pill → assertion (a) fails; (iii) `w-[min(400px,calc(100vw-32px))]` → `w-[600px]` on the frame → assertion (c) fails at 375 on the `left >= clip.left` clause (the panel is right-anchored and `useFitWithinClip` caps only `max-height`); (iv) `data-attention-anchor` removed from the wizard `<li>` → assertion (d) fails (fallback lands on the section top, no flash). Record hash-changed + failure line for each in the commit body.
- [ ] **Step 5: Published e2e, gated on the DB slot** — `published-show-attention.spec.ts` seeds a show through the local Postgres (its `beforeAll` DB setup) and NO workflow runs it today: `rg -n "^\\s+run:.*published-show-attention" .github/workflows/*.yml` matches no `run:` step (a `paths:` mention would not count; anchor to the structural position, never a substring). Ask bl-orch for the slot in one chunked part: "feat/wizard-review-attention-menu: Task 9 needs the local Postgres slot for tests/e2e/published-show-attention.spec.ts (seeded show); may I take it?". If GRANTED: extend the spec with a seeded warn row (a `parse_warnings` entry on the seeded show's internal row) → assert the "sheet warnings" segment text derives from the seeded count and that its menu row's click flashes the card's `<li data-attention-anchor>`; it is a real-browser pin like the rest of Task 9 (a seed-controlled RED would be a test-local fixture RED): run it GREEN, then prove it by mutant: remove `anchorIds` at the crew under-row mount in `sectionWarningExtras.tsx` → the row click lands on the section top and the flash assertion fails; revert; add the spec to `published-modal-e2e.yml` paths AND the run list at line 152 so CI runs it; release the slot in a chunked part. If DECLINED: commit NO published e2e case; record in the closeout doc under "Documented limits" that the published card-jump is proven by the jsdom case (Task 6, test 19) and the shared surface effect (wizard e2e), not by a real-browser published run, with the re-file trigger "slot available".
- [ ] **Step 6: Commit** — `git commit --no-verify -m "test(e2e): wizard attention menu tap band, row floor, clip fit and card jump"` (the published case, when run, in its own commit).

### Task 10: Whole-tree verification

- [ ] **Step 1:** `pnpm heavy pnpm test` (the full suite; 192 walkers over `tests/` see the new files). Fix by class, not by instance, anything red; quote each guard's message in the commit.
- [ ] **Step 2:** derive the pre-push set from `.github/workflows/quality.yml` and run it (`pnpm lint`, `pnpm typecheck`, `pnpm format:check` at drafting time); fix.
- [ ] **Step 3:** `pnpm exec vitest run tests/docs` (invariant-8 closeout marker grammar, ledger, review-round gates).
- [ ] **Step 4: Commit** any fixes: `git commit --no-verify -m "chore: whole-tree fixes from the full suite"`.

### Task 11: Impeccable dual-gate and closeout doc

- [ ] **Step 1:** `/impeccable critique` then `/impeccable audit` on the diff (`git diff origin/main -- components app DESIGN.md`), with the canonical v3 setup (context load PRODUCT.md + DESIGN.md → register read). Fix every P0/P1 or file a `DEFERRED.md` entry naming the finding.
- [ ] **Step 2:** write docs/superpowers/plans/2026-08-27-wizard-review-attention-menu-closeout.md with the findings + dispositions and the marker line `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>`; `pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts` PASS.
- [ ] **Step 3: Commit** — `git commit --no-verify -m "docs(closeout): impeccable dual-gate record for the attention pills"`

### Task 12: Cross-model diff review, CI, readiness line (no merge)

- [ ] **Step 1:** whole-diff Codex review through `node scripts/codex-guard.mjs review --brief <file> --cwd <worktree> --out <fresh dir> --stage diff --round <n>` (nohup, detached; REVIEWER ONLY; fresh-eyes; do-not-relitigate list = spec §1.1 + §15; `GUARD SURFACE: none, CANNOT-EXPRESS: no guard or detector surface in this diff` on its own line). Repair by class; cap four rounds, then file the round record and report to bl-orch.
- [ ] **Step 2:** push; open the PR with `gh pr create` (body ends with the generated-with footer; declares no DB suites skipped or names them); poll CI detached via nohup + GraphQL (never `gh run view` in a loop).
- [ ] **Step 3:** on green, send bl-orch (`herdr agent send w15:p2 …`) numbered parts under 600 chars each, arc name in every part: PR number, head sha, CI run URL, impeccable marker line, review rounds per stage, DB suites run/skipped. Do NOT merge, do not arm auto-merge.

## Self-review notes

- Spec coverage: §2 → T2/T3; §3 → T7/T8; §4 → T5/T6; §5 → T4 (+ registries in T4/T6/T7/T8); §9 → T9; §12 → T1–T9 as numbered; §13 → meta-test inventory above.
- Type consistency: `WarningAttentionEntry<T>`, `SheetWarningEntry`, `WizardAttentionEntry` names used identically across T3/T6/T7/T8; `warningIndex` prop name identical in T6 and the spec.
- Anti-tautology: every count assertion derives from `expectedCounts`/`deriveWarningAttention` on the fixture; anchors are found by attribute, not text; baselines are captured from the pre-change tree in T1 before any component edit.
- Transition audit: T7/T8 enrol every new conditional in the two scanners and carry the `§11` markers; the spec §8 table is the inventory.
- Layout dimensions: T9 is the real-browser task for §9.
