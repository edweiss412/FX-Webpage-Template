# Implementation plan — warning card identity and placement

**Spec:** `docs/superpowers/specs/2026-07-21-warning-card-identity-placement.md` (APPROVED, Codex R5, 2026-07-21).
**Base:** `origin/main` @ `2a868b132` (post-#531, post-#532).
**Branch:** `feat/warning-card-identity-placement`.
**Implementer:** Opus / Claude Code (UI surface — invariant 8 + routing hard rule).

Every task is TDD: failing test → minimal implementation → passing test → commit (`<type>(<scope>): <summary>`). No implementation precedes its test. Every task ends with the full relevant suite green, `pnpm typecheck`, and a commit.

## Plan-wide notes

- **Meta-test inventory (declared, spec §12):** this milestone CREATES one structural meta-test — `tests/parser/_metaAutocorrectProducers.test.ts (new)` (Task 2). It EXTENDS none. `bucketAttention` conservation and `_metaPopoverContextCoverage` are asserted UNAFFECTED (Task 9), not extended. No advisory-lock surface (invariant 2 N/A — declared). No Supabase call boundary added (invariant 9 N/A). No mutation surface added (invariant 10 N/A — this is a read/render change; the parser field rides existing persistence).
- **Anti-tautology (every test task):** expected strings derive from fixture correction arrays and `MESSAGE_CATALOG[code]`, never hardcoded beside the assertion; DOM label scans clone-and-strip sibling nodes; expected identity sets derive from fixture INPUT, not from the model under change (spec §10.3).
- **Strict tsconfig:** every embedded snippet typechecks under `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` before dispatch. `autocorrect` is `exactOptional` — emitters set it explicitly or omit the key, never `undefined`.
- **Published-only vs universal (spec §7):** Tasks 1-3 (parser field, composer, card copy) are UNIVERSAL. Tasks 4-8 (placement, nesting, bulk) are published-only, gated by caller context. Task 11 pins that split.

---

## Task 1 — `ParseWarning.autocorrect` field + STAGE_WORD emitter

**Test** (`tests/parser/autocorrectField.test.ts (new)`): parse a crew fixture whose role cell is `Load In/Set/Strke/Load Out - A1` for a member named `Eric Weiss`; assert the emitted `STAGE_WORD_AUTOCORRECTED` warning carries `autocorrect: { subject: "Eric Weiss", corrections: [{ detected: "Strke", corrected: "Strike" }] }` AND that `message` is byte-identical to the pre-change string (snapshot captured against `git show origin/main:` output for the same fixture, not hand-transcribed). Failure mode: field absent, wrong subject, or message mutated.

**Impl:** add the optional to `ParseWarning` (`lib/parser/types.ts`), mirroring `roleToken`/`resolution` doc-comment style; populate at `lib/parser/blocks/crew.ts:345` from `displayName` + `stageNorm.corrections`. `message` untouched.

**Commit:** `feat(parser): autocorrect field on ParseWarning + stage-word subject`

## Task 2 — remaining 12 emitters + ROLE stamp + producer meta-test

**Test A** (extend Task 1's `autocorrectField.test.ts (new)`): one case per remaining code — ROLE_TOKEN (subject stamped, not null on exit from `parseCrewBlock`), SECTION_HEADER/COLUMN_HEADER/FIELD_LABEL (subject null, corrections populated). The ROLE case asserts the **boundary invariant** (spec §3.2 no-escape): every `ROLE_TOKEN_AUTOCORRECTED` warning exiting `parseCrewBlock` has non-null `subject`. `message` byte-identical at all 13 sites (snapshot oracle).

**Test B — the meta-test this milestone CREATES** (`tests/parser/_metaAutocorrectProducers.test.ts (new)`): filesystem-walk `lib/parser/**` for every `code: "<X>_AUTOCORRECTED"` literal (13 expected); assert each producing site's emitted warning carries `autocorrect`. Registry-with-inline-exemption style (`tests/log/_metaMutationSurfaceObservability.test.ts`). The walk keys on the literal — state that limitation in a header comment so a non-literal producer is added deliberately. Also assert `CREW_SCOPED_WARNING_CODES` (Task 4) classification: exactly `{STAGE_WORD, ROLE_TOKEN}`.

**Impl:** populate `autocorrect` at the 12 remaining sites (spec §3.2 table rows 2-13); ROLE_TOKEN emits `subject: null` and the `stampedRoleWarnings` map at `crew.ts:367-373` fills `subject` from `displayName` in the same pass that attaches `blockRef`.

**Commit:** `feat(parser): populate autocorrect at all 13 producers + producer meta-test`

## Task 3 — `autocorrectGuidance` composer (pure, universal)

**Test** (`tests/messages/autocorrectGuidance.test.ts (new)`): every row of spec §4.2 (per-code sentence + phrase joins for 1/2/3/4+ corrections, remainder `N` on surviving pairs) and every row of §4.3 guard table. Include: possessive on a name ending in `s` (`Chris's`); `subject` null → `helpfulContext` fallback (returns null); a pair with empty `corrected` dropped; ALL pairs invalid → null; equal-after-full-normalization pair (`Load  In`/`Load In`) dropped (normalize-before-compare, spec §4.3 R4 fix); interior tab/newline collapsed. Expected strings derive from the fixture pairs, not literals.

**Impl:** `lib/messages/autocorrectGuidance.ts (new)` (new, pure, client-safe): `autocorrectGuidance(code, autocorrect): string | null`. Normalize each pair (`trim().replace(/\s+/g," ")`), drop empty and self-equal pairs, then compose per §4.2; return null on any fallback condition.

**Commit:** `feat(messages): autocorrectGuidance pure composer`

## Task 4 — `warningsByCrewKey` + `CREW_SCOPED_WARNING_CODES` in the section model

**Test** (`tests/admin/sectionWarningModel.autocorrect.test.ts (new)`): fixture with crew-scoped warnings across matched, over-`CREW_CAP`, and blank-subject members. Assert `warningsByCrewKey` (active only) maps each non-blank subject's canonical key to its cards; blank-subject and over-cap warnings are NOT in the map (they route to the group fallback). Expected identity set derived from fixture input + hardcoded crew-scoped list (spec §10.3 independent oracle).

**Impl:** export `CREW_SCOPED_WARNING_CODES = new Set(["STAGE_WORD_AUTOCORRECTED","ROLE_TOKEN_AUTOCORRECTED"])`; in `buildSectionWarningModel` build `warningsByCrewKey: Map<string, SectionWarningItem[]>` from the ACTIVE partition, keyed `canonicalCrewKey(subject)`, excluding blank/empty keys; partition crew-scoped active items into under-row (matched at render) vs group-fallback is deferred to the render layer (the model exposes both the map and the full active list; the row host consumes the map, the group consumes the remainder). Keep `active`/`ignored`/`activeGroups` shape intact.

**Commit:** `feat(admin): warningsByCrewKey in section model + crew-scoped code set`

## Task 5 — under-row merged stack: cap, disclosure, conservation (published-only)

**Test** (`tests/admin/wizard/step3ReviewSections.crewWarnStack.test.tsx (new)`): render the crew section with `crewAttention` + `warningsByCrewKey` context. Cover tests 3, 4, 11, 11b from spec §10: conservation (each active crew-scoped warning once, under-row ∪ group); cap of 2 on the merged stack; `N more` count; alerts-first deterministic order (§5.3); duplicate non-blank names → both under first row; blank names → group fallback. Independent-oracle identity assertions.

**Impl:** at the row host (`step3ReviewSections.tsx:1376` region) merge alert banners (existing) + `warningsByCrewKey.get(key)` cards into one `crew-warn-stack-<key>` container (`flex flex-col items-stretch w-full`); cap 2 visible, remainder in a native `<details data-testid="crew-warn-more-<key>">` (`N more`), matching the `Ignored (N)` idiom. `consumedAttentionKeys` extended to warnings so a duplicate key's second row renders none. Empty-wrapper contract: no container when zero alerts+warnings.

**Commit:** `feat(admin): under-row merged alert+warning stack with cap`

## Task 6 — group nesting into section body + delete wrapper border-t

**Test** (`tests/admin/review/sectionGroupNesting.test.tsx (new)`): the all-section no-drop gate (spec §10.3b) with the HARDCODED section-id oracle (`venue,event,crew,contacts,schedule,agenda,hotels,transport,rooms,diagrams,packlist,billing,report`). Fixture gives each an active group; after threading, assert each named section still renders its group exactly once. A section that omits the context field fails.

**Impl:** thread warning groups into the section body via `Step3SectionChromeContext` (as `parseNotes`/`diagramAttention` do, `ShowReviewSurface.tsx:1020-1031`); stop mounting them as the sibling at `components/admin/review/ShowReviewSurface.tsx:1055`. Delete the wrapper `border-t border-border pt-3` (`sectionWarningExtras.tsx:127`). Applies to every section.

**Commit:** `feat(admin): nest warning groups inside section body`

## Task 7 — bulk-ignore: fallback cards in slot, chip counts all N

**Test** (`tests/admin/showpage/bulkIgnoreCrewScoped.test.tsx (new)`): spec §10 tests 5, 5b, 5c, 5d, 5e. Scattered case (`N≥2` all under rows → eyebrow+chip, empty cards, ignore clears under-row + all N in Ignored disclosure); mixed (fallback card + under-row, one chip `Ignore all N`, clears both); N=1-under-row emits no group; individual ignore crossing N=2→1 removes the chip; ignored under-row card lands once in the disclosure.

**Impl:** for crew-scoped codes, the `activeGroups` entry's `items` slot receives only the fallback subset; `bulk.items` counts all N active fingerprints (matched + fallback), so the chip reads `Ignore all N`. Group emitted iff `fallbackCards≥1 OR N≥2`. No new BulkIgnoreControls mode — uses the existing optional-`bulk`/any-`cards` shape.

**Commit:** `feat(admin): crew-scoped bulk-ignore over scattered cards`

## Task 8 — card instance-copy render + injection safety (universal)

**Test** (`tests/components/perShowActionableWarnings.autocorrect.test.tsx (new)`): spec §10 tests 1-at-render, 9. A crew-scoped warning renders the composed instance line (not the generic catalog line); a code with no `autocorrect` renders `helpfulContext` unchanged. Injection safety (test 9): `subject = "Foo *draft*"` and a `detected` with `_` render LITERALLY (plain text node), no `<em>`/`<strong>` introduced by the param — the differential guard failing under `renderEmphasis(instanceLine)`.

**Impl:** `warningCardCopyFields` (`PerShowActionableWarnings.tsx:39`) returns `{kind:"instance", text}` when `autocorrectGuidance` is non-null, else `{kind:"catalog", markup}`. Render site (`components/admin/PerShowActionableWarnings.tsx:199-205`) renders `instance` as a plain `{text}` node (no `renderEmphasis`), `catalog` via `renderEmphasis` as today. `trigger`/`followUpCopy` untouched.

**Commit:** `feat(admin): render autocorrect instance copy on the card`

## Task 9 — transition audit (§9) + registry stability

**Test** (`tests/admin/wizard/crewWarnStackTransitions.test.tsx (new)`): spec §10 tests 4b-4f — every compound case (disclosed-card ignore keeps open; visible-card ignore promotes; 3→2 unmounts disclosure; live-add re-derives per model order; bulk-while-open cleans up). Assert no `AnimatePresence`, chevron `rotate-90` only, `<details>` open state persists across content re-derivation. Plus spec §10.8: `warningCardCopyRegistry` frozen strings still match; `_metaPopoverContextCoverage` still green; `bucketAttention` conservation still green (run those suites, assert unaffected).

**Impl:** none beyond Tasks 5/7 if correct; this task is the audit that proves it. Any gap found is fixed here.

**Commit:** `test(admin): transition audit for the under-row stack`

## Task 10 — layout dimensions (real browser, Playwright)

**Test** (`tests/e2e/crewWarnStack.layout.spec.ts (new)`): spec §8 five dimensional rows via `getBoundingClientRect()`/computed style at ≤0.5px, at 375px AND 1280px, against a HYDRATED harness (the disclosure is click-dependent). Boot: prod build, readiness gate awaited before first assertion (`waitForRowHydration`-class, not `networkidle`), detach-safe samplers. Assert warning-card, alert-child, disclosure, disclosed-child (after click-expand), and row-wrapper content-width equalities.

**Impl:** ensure the container/disclosure carry the exact `data-testid`s (`crew-warn-stack-<key>`, `crew-warn-more-<key>`) and `items-stretch`/`w-full` classes from §8. Wire the spec's `testMatch` + workflow path-filter for the new e2e file.

**Commit:** `test(e2e): under-row stack dimensional invariants`

## Task 11 — staged scope split parity

**Test** (`tests/admin/stagedCrewWarn.parity.test.tsx (new)`): spec §10 test 7 — staged rows grow NO `crew-warn-stack` (placement published-only); a staged autocorrect card renders the SAME `autocorrectGuidance` line as the published card for the same fixture warning (copy universal); empty-wrapper contract on published.

**Impl:** none expected (the split falls out of Tasks 5/8 gating); this task proves it and fixes any leak.

**Commit:** `test(admin): staged scope-split parity`

## Task 12 — impeccable dual-gate (invariant 8)

Run `/impeccable critique` AND `/impeccable audit` on the affected UI diff with the v3 setup gates (the context.mjs context load then register read). Fix P0/P1 or defer via `DEFERRED.md`. Findings + dispositions into the milestone handoff. Pre-code mechanical gate already honored in tasks (em-dash ban, 44px tap targets, canonical tokens). **Before** the whole-diff Codex review and milestone close.

**Commit:** `chore(admin): impeccable dual-gate dispositions` (+ any fix commits)

---

## Sequencing

1-3 (data + composer + copy) are independent of 4-8 (placement) and can land first; 8 depends on 3. 4→5→7 chain (model→stack→bulk). 6 is independent (nesting). 9-11 are audits over 5/7/8. 10 needs 5. 12 last. Each task commits independently; no batching.

## Verification before push (green ≠ green)

Full `pnpm test`, `pnpm typecheck`, `pnpm lint` (canonical Tailwind), `pnpm format:check`, the e2e task, and the env-bound suites. Then whole-diff Codex review to APPROVE → real CI green → merge.
