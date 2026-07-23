# Plan — crew warning attachment

**Spec:** `docs/superpowers/specs/2026-07-23-crew-warning-attachment.md` (canonical; this plan implements it verbatim).
**Branch:** `feat/crew-warning-attachment` (worktree, off `origin/main` @ `12735199a`).
**Mode:** Autonomous ship. TDD per task; commit per task (invariant 6).

## Pre-draft code-verification pass (run this session)

All file:line claims verified by direct read at HEAD:

- `lib/parser/autocorrectCodes.ts:10-13` — `CREW_SCOPED_WARNING_CODES` = exactly `STAGE_WORD_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED`; pinned by `tests/parser/_metaAutocorrectProducers.test.ts`.
- `lib/admin/attentionItems.ts:231-233` — `canonicalCrewKey(name) = name.trim().toLowerCase()`.
- `lib/parser/types.ts:60` — `blockRef?: { kind: string; index?: number; iso?: string; name?: string; field?: string }`.
- `lib/admin/sectionWarningModel.ts:126-136` — crewKeyMap loop (Map accumulation, prototype-safe), gate `CREW_SCOPED_WARNING_CODES.has` + `autocorrect.subject`.
- `components/admin/showpage/sectionWarningExtras.tsx` — `renderCrewUnderRowCards` :27-69 (one node PER warning); `underRowKeys` :73-78; exclusion filter :168-191; orphan-group rule :181-183; extras root classes :219-230 (`mt-3 flex flex-col gap-3 border-t border-border pt-3`, seamless variant `flex flex-col gap-3`); Ignored details :241-275.
- `components/admin/wizard/step3ReviewSections.tsx` — `Step3SectionChrome` type :437+; `ModalSectionChrome` :840-961, `hasBody` card div :935-957 (callout first child, then `{children}`); crew row host attention merge :1571-1577 (`consumedAttentionKeys`).
- `components/admin/review/ShowReviewSurface.tsx` — section loop :1041; chrome provider value :1054-1131; extras sibling render :1140-1142 with `seamless: s.id === "warnings" && suppressWarningsPanelCard`; staged wizard passes no `renderSectionExtras` :204.
- `components/admin/showpage/PublishedReviewModal.tsx:255-282` — `renderedCrewKeys` (CREW_CAP slice), `buildSectionWarningExtras`, `renderCrewUnderRowCards` wiring. Sole caller of both factories (rg over `app/ components/`).
- `lib/dataQuality/bulkIgnoreGroups.ts:20-40` — bulk eligibility: `hasIgnorableSnippet` + ≥2 distinct normalized snippets.
- Existing tests to extend: `tests/admin/sectionWarningModel.autocorrect.test.ts`, `tests/admin/showpage/crewUnderRowCards.test.tsx` (`@vitest-environment jsdom` pragma pattern), `tests/components/admin/showpage/publishedReviewModal.test.tsx`.
- e2e template: `tests/e2e/published-review-modal.layout.spec.ts` + `tests/e2e/_publishedReviewModalHarness.tsx` (standalone static harness — tsx out-of-process render, Tailwind CLI compile, node:http serve, reduced-motion emulation, ±0.5px). Harness currently passes an EMPTY `bySection` (`_publishedReviewModalHarness.tsx:253`).

## Meta-test inventory (mandatory declaration)

- **Extends none, touches none structurally.** No Supabase call boundaries (no new client calls), no mutation surfaces, no §12.4 codes, no advisory locks, no admin_alerts. `tests/parser/_metaAutocorrectProducers.test.ts` continues to pin `CREW_SCOPED_WARNING_CODES` membership — the set's DOC comment is updated (meaning narrows to "keyed by autocorrect.subject") but membership and the meta-test are untouched.
- Declared explicitly: **none applies** because the diff is pure client render placement + one pure keying helper.

## e2e harness-readiness (mandatory for Playwright task)

- **Server boot:** none — standalone static harness via `tests/e2e/standalone.config.ts` (no webServer, no Supabase), same as the template spec.
- **Readiness gate:** static markup served over node:http; geometry stable under `prefers-reduced-motion: reduce` emulation (entrance animation collapsed) — the template's documented flake-avoidance choice. No hydration to await (static render, no client mount needed for geometry).
- **Detach safety:** all measurements via one-shot `locator.evaluate` on elements present in static markup; no samplers that can outlive nodes.
- **Static-render caveat check:** under-row cards and section extras are server-node props rendered by `PerShowActionableWarnings`/`BulkIgnoreControls` — present in `renderToStaticMarkup` output (no client-only mount gates them; verified: extras render in the existing static harness path when bySection is non-empty).

## Task ordering — red-first discipline (plan-R1 F2)

- **T3b lives in T3's test-first batch** (not T4): before T3's impl, T2 has keyed the item but the extras filter has not landed, so the rerender-conservation test is RED (double-render across the flip); T3's impl turns it green.
- **T5's e2e assertions are authored and run RED immediately after T1** (helper exists; under-row stack absent, extras outside card → both assertion families fail), BEFORE T2-T4 implementation. T2-T4 turn them green progressively; T5's close-out is the green re-run + commit of the spec/harness additions. The red-run transcript is noted in the T5 commit body.
- **T6 fixes follow TDD where testable:** each P0/P1 finding that is assertable gets a failing assertion first; pure copy/token fixes commit directly with the gate re-run as verification.

## Tasks (TDD each: failing test → minimal impl → pass → commit)

### T1 — `crewRowKeyForWarning` helper

- **Test first** (`tests/admin/crewRowKey.test.ts`, node env, no jsdom): cases per spec §5.1 — autocorrect code + subject → `canonicalCrewKey(subject)`; autocorrect code + blank subject + crew blockRef → **null** (backward-compat pin; concrete failure mode: helper silently widens legacy-code keying to blockRef and changes shipped placement); `FIELD_UNREADABLE` + `{kind:"crew", name:"John Redcorn"}` → `"john redcorn"`; **raw day-restriction name (spec R3-F1):** `"Calvin Saller (6/24 and 6/26 ONLY)"` → `"calvin saller"` (failure mode: raw blockRef name never matches the stripped rendered name, silently disabling under-row placement for every day-restricted row); paren-only name strips to empty → null; `kind:"hotel"` → null; blank/whitespace name → null; no blockRef → null; **missing `autocorrect` object entirely AND `autocorrect` present with missing `subject` — both → null for the 2 legacy codes (plan-R1 F5, distinct runtime shapes)**; trims. Parity pin: `extractDayRestriction({nameCell, roleCell:""}).cleanedNameCell === stripDayRestrictionParen(nameCell)` over corpus name forms.
- **Impl:** export `stripDayRestrictionParen` from `lib/parser/personalization.ts` (`cell.replace(PAREN_ONLY_PATTERN, "").trim()`, pattern at `personalization.ts:29`) and refactor the three existing strip sites (`:79`, `:85`, `:91`) to call it (pure refactor — existing personalization/crew parser tests pin behavior); new `lib/admin/crewRowKey.ts` exactly as spec §2A code block (keys blockRef names through the strip). **Comment ownership (plan-R1 F6):** this task also narrows the `CREW_SCOPED_WARNING_CODES` doc comment in `lib/parser/autocorrectCodes.ts:1-9` ("the codes keyed by autocorrect.subject" — membership unchanged).
- Commit `feat(admin): crewRowKeyForWarning helper for under-row warning placement`.

### T2 — model keying via helper

- **Test first** (extend `tests/admin/sectionWarningModel.autocorrect.test.ts` or sibling): active `FIELD_UNREADABLE` with crew blockRef lands in `warningsByCrewKey["john redcorn"]`; a raw day-restriction fixture name `"Calvin Saller (6/24 and 6/26 ONLY)"` lands under `"calvin saller"` (spec R4-F1 — the STRIPPED key, same expression as the production helper); blank-name blockRef item does NOT; legacy autocorrect-subject case unchanged (existing assertions keep passing). Failure mode caught: model still gated to the 2 codes, or keyed on the raw name → new test red.
- **Impl:** `sectionWarningModel.ts:126-136` loop body → `const key = crewRowKeyForWarning(it.warning); if (key === null) continue; …` (Map accumulation unchanged). **Comment ownership (plan-R1 F6):** update the two now-stale autocorrect-subject-only comments at `sectionWarningModel.ts:57` and `:119` to describe the widened keying.
- Commit `feat(admin): key blockRef-crew warnings into warningsByCrewKey`.

### T3 — extras exclusion filter + generalized orphan-group rule

- **Test first** (extend extras/`crewUnderRowCards` test area, jsdom): build `activeGroups` render with a `FIELD_UNREADABLE` group whose sole item's key is rendered → group emits nothing (no orphan eyebrow, no bulk) and the under-row map carries the card (conservation: exactly one placement); same fixture with key NOT rendered → group keeps the item; bulk case: 2 distinct-snippet items, one moved under row → group still emits chip (`bulk` non-null) with 1 remaining card; **fully-emptied bulk group (plan-R1 F3):** BOTH bulk-eligible items moved under rows → group STILL emits (chip present, empty cards slot) — pins `groupItems.length === 0 && g.bulk !== null` exactly (an impl discarding every empty group regardless of bulk fails here); **empty-seam guard (spec R1-F3)**: all groups emptied + no bulk + no ignored → `renderSectionExtras` returns null (no `border-t` wrapper); ignored-only → wrapper renders with the Ignored disclosure. **T3b (spec R2-F2, red before T3 impl):** matched↔fallback rerender — flip a key out of/into the rendered set across a rerender; assert conservation on both sides each way. Failure modes: double-render, silent drop, orphan bordered seam, bulk chip lost with its emptied group.
- **Impl:** `sectionWarningExtras.tsx:168-191` — per-item filter via `crewRowKeyForWarning`; emission rule → `if (groupItems.length === 0 && !g.bulk) return null;` (drop the code-set gate); after building `activeGroups`: `if (activeGroups.length === 0 && ignoredWarnings.length === 0) return null;`. `underRowKeys` unchanged (reads model keys). Update the §5/§6.2 comments to cite this spec.
- Commit `feat(admin): route blockRef-crew warning cards under crew rows`.

### T4 — `sectionExtras` inside the panel card

- **Test first** (jsdom, `tests/components/admin/` area): render `ModalSectionChrome` (via a section body through the provider, following `publishedReviewModal.test.tsx` harness patterns): with `sectionExtras` present → the extras node is a DESCENDANT of the panel-card div (locate card as the `hasBody` bordered div; assert `card.contains(extras)`); ABSENT field → markup byte-identical to a render without the field (DOM-shape equality); warnings section → extras render as SIBLING in BOTH suppression states (spec R1-F1 — no reparenting; existing `warningsPanelTransitions.test.tsx:315` same-node contract must keep passing unmodified). **T4b all-sections presence (spec R1-F2):** full published surface with a routed warning for EVERY non-warnings SectionId (fixture via `tests/helpers/publishedSurfaceProps.tsx`); per section assert `section-warning-controls-<id>` exists and `panelCard.contains(extras)`. Anti-tautology: containment asserted against the card element, not a shared ancestor; presence asserted per-id so one passing section cannot mask another's drop.
- **Impl:** `Step3SectionChrome` gains optional `sectionExtras?: ReactNode` (needs `import type { ReactNode } from "react"` — not currently imported, spec R1-F4); `ModalSectionChrome` renders `{chrome.sectionExtras}` after `{children}` inside the `hasBody` div; `ShowReviewSurface.tsx` computes `extrasNode` before the provider, spreads `...(extrasNode != null ? { sectionExtras: extrasNode } : {})` (NULLISH guard, spec R2-F3) for every section EXCEPT `warnings`, keeps the sibling render for `warnings` in both states. exactOptional: spread-insert, never explicit `undefined`.
- **Nullish-guard proof (plan-R1 F4 — the ABSENT-vs-ABSENT comparison was tautological):** two-part replacement: (a) behavioral — surface render where the factory returns null for section X and an element for section Y → Y's card contains its extras node, X renders NO extras node anywhere (in-card or sibling); (b) guard-shape pin — a source-scan assertion (project AST/regex-guard pattern) that `ShowReviewSurface.tsx` threads `sectionExtras` through an `extrasNode != null ?` conditional spread, pinning the nullish (not truthiness, not unconditional) guard. Together these prove null-not-threaded without unobservable context introspection.
- **T4b domain (spec R2-F1):** the 11 routing-target sections (`KIND_TO_SECTION` distinct values); `report`/`diagrams`/`warnings` excluded per spec §1.1. **Helper extension (plan-R1 F1, named edits):** `tests/helpers/publishedSurfaceProps.tsx` gains (1) SECTION_WARN emitters for the six missing targets `venue`, `event`, `schedule`, `agenda`, `packlist`, `billing` (blockRef kinds per `KIND_TO_SECTION`: `venue`, `details`/`dress`, `schedule`/`dates`, `agenda`, `pull_sheet`/`gear_packlist`, `financials`); (2) an `agendaLinks` opt threaded into the snapshot's `agenda_links` (currently hardcoded `[]` at :152) so `agendaBaseline` is non-empty; (3) the section-id set derived from the SAME non-empty `agendaBaseline` (currently pinned empty at :179) — via an opts-aware `renderedSectionIds` call — so agenda mounts and receives its routed model entry.
- Commit `feat(admin): render section warning extras inside the section panel card`.

### T5 — real-browser layout assertions (authored + run RED after T1, per the ordering section; green re-run + commit after T4)

- **Test first** (extend `tests/e2e/published-review-modal.layout.spec.ts` + harness): harness `bySection` gains a crew model with (a) one `FIELD_UNREADABLE` crew-blockRef warning matching a rendered crew name, (b) one with an unmatched name (fallback group). Assertions (±0.5px):
  - under-row stack `[data-testid="crew-warn-stack-<key>"]` (`step3ReviewSections.tsx:1461`, `CrewUnderRowStack` :1455) sits below its row's `rowInner` rect and above the next row's rect, inside the crew panel card rect;
  - fallback group block `[data-testid="section-warning-controls-crew"]` rect fully contained in the crew panel card rect (left/right/top/bottom);
  - crew card bottom ≥ extras bottom (no overflow out of the border).
- Dimensional invariants list (spec §2 Dimensional invariants) inlined in the spec file header comment.
- Commit `test(admin): real-browser containment assertions for crew warning placement`.

### T6 — impeccable dual-gate

- Run `/impeccable critique` + `/impeccable audit` on the affected diff (canonical v3 setup gates: context.mjs PRODUCT.md + DESIGN.md load → register reference read). Fix P0/P1 (TDD where assertable, per the ordering section) or record deferrals in `DEFERRED.md`. Findings + dispositions recorded in this plan's close-out notes. **Commit (plan-R1 F7):** every tracked change this task produces (fixes, `DEFERRED.md` rows, close-out notes in this plan file) lands as its own commit(s) — `fix(admin): impeccable <finding>` per fix, `docs(plan): impeccable gate dispositions` for the notes.

### T7 — whole-diff review, gates, ship

- **T7a (plan-R1 F8):** whole-diff cross-model review to APPROVE (codex-guard; tight-scope split per surface if the file count warrants) BEFORE push — the autonomous-ship contract's mandatory implementation review.
- **T7b:** `pnpm test` (full suite — scoped gates miss registry suites), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, standalone playwright spec run. Push, PR, real CI green, merge (`gh pr merge --merge`) in the same turn, ff-sync main checkout, verify `0  0`. Stage 4.4: CronDelete nudge job.

## Anti-tautology statements (per test task)

- T1: pins the null-fallback for legacy codes — catches silent widening of shipped keying.
- T2: asserts against `warningsByCrewKey` (the data source), not rendered output.
- T3: conservation asserted from BOTH sides (group content and under-row map) on the same fixture — catches double-render and silent drop, which a one-sided assertion misses.
- T4: containment asserted on the card node itself; ABSENT-field byte-identity catches accidental markup drift for every section without warnings (the overwhelmingly common case).
- T5: expected geometry derived from measured row/card rects, not hardcoded pixels; jsdom cannot pass it vacuously (real browser only).

## Snippet typecheck note

Spec §2A helper block typechecks against strict tsconfig (optional-chain reads on optional fields; no indexed access). New test files: `tests/admin/crewRowKey.test.ts` matches existing `tests/admin/**` vitest include (BASE_INCLUDE covers `tests/**`); e2e spec extends an EXISTING file already wired into the standalone config + workflow path filters — no new testMatch/workflow wiring needed. T3/T4 extend existing wired files.
