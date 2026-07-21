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

## Task 2 — remaining 12 emitters, ROLE stamp, per-site coverage, producer meta-test

**Test A — per SITE, not per code** (extend Task 1's `tests/parser/autocorrectField.test.ts (new)`): one fixture per PRODUCER SITE (13 total: STAGE x1, ROLE x1, SECTION x1, COLUMN x2, FIELD x8), each triggering that specific site and asserting the exact `corrections` array and `subject` it emits. FIELD_LABEL's eight sites (client x2, event x2, ops, rooms, transport, venue) each get their own fixture, because a static walk cannot prove an unexecuted site supplies the right value. The ROLE case asserts the **boundary invariant** (spec §3.2 no-escape): every `ROLE_TOKEN_AUTOCORRECTED` warning EXITING `parseCrewBlock` has non-null `subject`. `message` byte-identical at all 13 sites (snapshot oracle from `git show origin/main:` output, not hand-transcribed).

**Test B — the meta-test this milestone CREATES** (`tests/parser/_metaAutocorrectProducers.test.ts (new)`): filesystem-walk `lib/parser/**` for every `code: "<X>_AUTOCORRECTED"` literal (13 expected); assert the count is exactly 13 and that Test A covers each discovered site (cross-check the walk's site list against Test A's fixture registry, so a NEW site fails BOTH the count and the "covered by a runtime fixture" assertion). Header comment states the literal-only limitation. This is a STRUCTURAL presence+coverage guard; the VALUE correctness lives in Test A per site.

**Also in this task — `CREW_SCOPED_WARNING_CODES`** (moved here from Task 4 to remove a forward dependency): export `CREW_SCOPED_WARNING_CODES = new Set(["STAGE_WORD_AUTOCORRECTED","ROLE_TOKEN_AUTOCORRECTED"])` from a new `lib/parser/autocorrectCodes` module (parser-layer, importable by both the model and tests). Assert in Test B that it equals exactly the two crew-scoped codes and is a subset of the 13 discovered codes.

**Impl:** populate `autocorrect` at the 12 remaining sites (spec §3.2 table rows 2-13); ROLE_TOKEN emits `subject: null` and the `stampedRoleWarnings` map at `crew.ts:367-373` fills `subject` from `displayName` in the same pass that attaches `blockRef`. Add the `autocorrectCodes` module.

**Commit:** `feat(parser): populate autocorrect at all 13 producers + producer meta-test`

## Task 3 — `autocorrectGuidance` composer (pure, universal)

**Test** (`tests/messages/autocorrectGuidance.test.ts (new)`): the oracle is a HAND-AUTHORED `(code, autocorrect input) → expected exact string | null` table, each row transcribed by reading spec §4.2/§4.3 (NOT by re-running the composer's join logic — that would be tautological). Rows cover: each per-code sentence; phrase joins for 1/2/3/4+ corrections (with the `and N more` remainder computed by hand); possessive on a name ending in `s` (`Chris's`); every §4.3 guard row → `null` (absent field, non-crew code with subject ignored, empty-`corrected` pair dropped, all-pairs-invalid → null, blank subject on a crew code → null); the normalize-before-compare case (`Load  In`/`Load In` → dropped as self-equal); interior tab/newline collapsed to one space. Each expected string is a literal in the table, asserted against `autocorrectGuidance(...)`. The table doubles as the spec-example check: the §4.1 example (`'Strke' as 'Strike' in Eric Weiss's role`) is one row.

**Impl:** `lib/messages/autocorrectGuidance.ts (new)` (pure, client-safe): `autocorrectGuidance(code, autocorrect): string | null`. Per pair: normalize (`trim().replace(/\s+/g," ")`), THEN drop empty and self-equal pairs; compose per §4.2 over survivors; return null on any fallback condition (spec §4.3).

**Commit:** `feat(messages): autocorrectGuidance pure composer`

## Task 4 — `warningsByCrewKey` in the section model

**Test** (`tests/admin/sectionWarningModel.autocorrect.test.ts (new)`): fixture with active crew-scoped warnings for several named members plus a blank-subject one. Assert `warningsByCrewKey` (built from the ACTIVE partition) contains EVERY active crew-scoped warning with a non-blank canonical subject, keyed `canonicalCrewKey(subject)`, and EXCLUDES only blank/empty-subject ones. The model is render-agnostic: it does NOT know `CREW_CAP` or which rows render, so it applies NO cap exclusion — that is the render layer's concern (Task 5). Expected key/identity set derived from fixture input + `CREW_SCOPED_WARNING_CODES` (imported from Task 2), the independent oracle (spec §10.3).

**Impl:** import `CREW_SCOPED_WARNING_CODES` (Task 2). In `buildSectionWarningModel`, build `warningsByCrewKey: Map<string, SectionWarningItem[]>` from the active partition, keyed by `canonicalCrewKey(item.warning.autocorrect.subject)`, skipping empty keys. Add it to `SectionWarningModel`. `active`/`ignored`/`activeGroups` shapes unchanged. The map is a pure index; cap/fallback partitioning is decided at render (Task 5) so the model stays render-agnostic and the fallback ownership boundary lives in exactly one place.

**Commit:** `feat(admin): warningsByCrewKey index in section model`

## Task 5 — under-row placement: full partition, cap, disclosure, conservation (published-only)

This task owns the ENTIRE placement partition so conservation is provable within one commit (R1 HIGH): it both (a) places matched active crew-scoped cards under rows and (b) filters those SAME cards OUT of the section group, so nothing renders twice. Task 7 later adds only the bulk-chip count behavior on top; it does not own conservation.

**Test** (`tests/admin/wizard/step3ReviewSections.crewWarnStack.test.tsx (new)`): with `crewAttention` + `warningsByCrewKey` context, cover spec §10 tests 3, 4, 4b-4e (transitions overlap with Task 9), 11, 11b. Conservation: over a fixture with matched, over-`CREW_CAP`, duplicate-name, and blank-subject members, assert every active crew-scoped warning renders EXACTLY ONCE across {under-row ∪ group-fallback}, by identity, expected set from fixture input (independent oracle). Cap of 2 on the merged stack; `N more`; alerts-first deterministic order (§5.3); duplicate non-blank → both under first row, second row none; blank subject → group fallback; over-cap member (row not rendered) → group fallback.

**Impl:** at the row host (`components/admin/wizard/step3ReviewSections.tsx:1376` region) merge alert banners + `warningsByCrewKey.get(key)` into one `crew-warn-stack-<key>` container (`flex flex-col items-stretch w-full`); cap 2 visible, remainder in `<details data-testid="crew-warn-more-<key>">`. Extend `consumedAttentionKeys` to warnings (first row with a key consumes all its cards). A warning whose key is consumed by NO rendered row (over-cap / unmatched / blank) is the FALLBACK set. The section group's `items` are filtered to exclude keys placed under a row — this filtering ships HERE, in Task 5, so conservation is self-contained. Empty-wrapper contract: no container when a row has zero alerts+warnings.

**Commit:** `feat(admin): under-row merged stack + group-fallback partition`

## Task 6 — group nesting into section body + delete wrapper border-t

**Test** (`tests/admin/review/sectionGroupNesting.test.tsx (new)`): the all-section no-drop gate (spec §10.3b) with the HARDCODED section-id oracle (`venue,event,crew,contacts,schedule,agenda,hotels,transport,rooms,diagrams,packlist,billing,report`). Fixture gives each an active group. Assert, PER SECTION: (a) the group renders exactly once, AND (b) **DOM ancestry** — the group node is a DESCENDANT of that section's body element (the `s.render(data)` output), NOT a following sibling of it. Assertion (b) is what makes the test FAIL against today's sibling mount (`ShowReviewSurface.tsx:1055`) and pass only after threading; without it the test passes against the old placement (R1 HIGH). Also assert the wrapper no longer carries `border-t`.

**Impl:** thread warning groups into the section body via `Step3SectionChromeContext` (as `parseNotes`/`diagramAttention` do, `components/admin/review/ShowReviewSurface.tsx:1020-1031`); stop mounting them as the sibling at `components/admin/review/ShowReviewSurface.tsx:1055`. Delete the wrapper `border-t border-border pt-3` (`components/admin/showpage/sectionWarningExtras.tsx:127`). Applies to every section.

**Commit:** `feat(admin): nest warning groups inside section body`

## Task 7 — bulk-ignore chip counts all N over scattered cards

Task 5 already partitioned placement and conservation. Task 7 adds ONLY the crew-scoped bulk-chip behavior: the chip counts all N active instances even though most cards live under rows.

**Test** (`tests/admin/showpage/bulkIgnoreCrewScoped.test.tsx (new)`): spec §10 tests 5, 5b, 5c, 5d, 5e. Scattered (`N≥2` all under rows → eyebrow+chip `Ignore all N`, empty group `items`, click ignores all N and every identity lands EXACTLY ONCE in the `Ignored (N)` disclosure); mixed (fallback card in `items` + under-row cards, one chip `Ignore all N`, clears both, all N in disclosure); N=1-under-row → no group emitted; individual ignore crossing N=2→1 → chip disappears, survivor stays under row, ignored one in disclosure once; ignored under-row card lands once in the disclosure.

**Impl:** for a crew-scoped code, the `activeGroups` entry's `bulk.items` counts ALL N active fingerprints (under-row + fallback), so the chip reads `Ignore all N`; `items` (cards slot) holds only the fallback subset from Task 5. Group emitted iff `fallbackCards≥1 OR N≥2`. No new `BulkIgnoreControls` mode — the existing optional-`bulk` / any-`cards` shape (`components/admin/BulkIgnoreControls.tsx:127-195`) already supports it. Fingerprint-set ignore semantics unchanged, so one click clears both placements.

**Commit:** `feat(admin): crew-scoped bulk-ignore chip over scattered cards`

## Task 8 — card instance-copy render + injection safety (universal)

**Test** (`tests/components/perShowActionableWarnings.autocorrect.test.tsx (new)`): spec §10 tests 1-at-render, 7 (copy-universal half), 9. A crew-scoped warning renders the composed instance line (assert against Task 3's independent oracle for that fixture, NOT against the catalog line); a warning with no `autocorrect` renders `helpfulContext` unchanged. Injection safety (test 9): `subject = "Foo *draft*"` and a `detected` containing `_` render LITERALLY as text — assert NO `<em>`/`<strong>` element is introduced by the param (query the rendered guidance node for emphasis children and assert none), the differential guard that fails if the instance line is routed through `renderEmphasis`.

**Impl:** declare an EXPLICIT union return type (R1 HIGH — do not rely on inference, which widens `kind`):
```ts
type GuidanceResult = { kind: "instance"; text: string } | { kind: "catalog"; markup: string | null };
```
`warningCardCopyFields` returns `GuidanceResult`. When `autocorrectGuidance(w.code, w.autocorrect)` is non-null → `{ kind: "instance", text }`; else `{ kind: "catalog", markup: pick(entry?.helpfulContext) }`. The render site (`components/admin/PerShowActionableWarnings.tsx:199-205`) narrows on `kind`: `instance` → a plain `{result.text}` text node (NO `renderEmphasis`); `catalog` → `renderEmphasis(result.markup)` as today. `trigger`/`followUpCopy` untouched.

**Commit:** `feat(admin): render autocorrect instance copy on the card`

## Task 9 — transition audit (§9): source-scan + behavioral

**Test** (`tests/admin/wizard/crewWarnStackTransitions.test.tsx (new)`): two arms.
- **Source-scan guard** (R1 HIGH — `AnimatePresence` has no DOM signature): read the source of the touched components (`step3ReviewSections.tsx`, `sectionWarningExtras.tsx`, and any new stack module) and assert the crew-warn-stack region introduces NO `AnimatePresence`/`motion.` import or usage. A lexical scan scoped to the added region, matching the project's structural-meta-test idiom.
- **Behavioral** (spec §10 tests 4b-4f): disclosed-card ignore keeps `<details>` open + chevron rotated; visible-card ignore promotes a hidden card, disclosure stays open; 3→2 unmounts the disclosure (no orphaned open node); live-add re-derives per §5.3 model order; bulk-while-open cleans up. Assert `<details open>` state persists across content re-derivation and chevron uses `rotate-90` only.

Plus spec §10.8 registry stability: run `warningCardCopyRegistry` frozen-string test, `_metaPopoverContextCoverage`, and `bucketAttention` conservation; assert all still green (UNAFFECTED, not extended).

**Impl:** none beyond Tasks 5/7 if correct; this task is the audit that proves it and fixes any gap.

**Commit:** `test(admin): transition audit + source-scan for the under-row stack`

## Task 10 — layout dimensions (real browser, Playwright)

Task body carries the spec's EXACT five Dimensional Invariants (R1 HIGH — enumerate, do not summarize):

| # | Parent (testid) | Child (testid) | Asserted equality | Guaranteed by |
|---|---|---|---|---|
| 1 | `crew-warn-stack-<key>` | each `per-show-actionable-item` | child.width === parent.width (content-box) | container `flex flex-col items-stretch` |
| 2 | `crew-warn-stack-<key>` | each `attention-banner-<alertId>` | child.width === parent.width | `items-stretch` |
| 3 | `crew-warn-stack-<key>` | `crew-warn-more-<key>` | child.width === parent.width | `items-stretch` |
| 4 | `crew-warn-more-<key>` (open) | each disclosed child (warning OR alert) | child.width === parent.width | body `flex flex-col items-stretch` |
| 5 | crew row `<li>` inner content wrapper | `crew-warn-stack-<key>` | stack.width === wrapper.contentWidth (clientWidth − horizontal padding) | stack `w-full`, wrapper `min-w-0 flex-1` |

**Test** (`tests/e2e/crewWarnStack.layout.spec.ts (new)`): each of the five rows via `getBoundingClientRect()`/computed style at ≤0.5px, at 375px AND 1280px, against a HYDRATED harness. Boot: prod build; readiness/hydration gate awaited before the first assertion (`waitForRowHydration`-class, never `networkidle` alone); detach-safe samplers (no `locator.evaluate` that can outlive its node). Row 4 requires clicking the disclosure open first.

**Impl:** ensure the container/disclosure carry the exact test ids and `items-stretch`/`w-full` classes above. Wire the new e2e file's `testMatch` and the CI workflow path-filter (name the exact entries; create them in this task).

**Commit:** `test(e2e): under-row stack dimensional invariants`

## Task 11 — staged scope-split parity

**Test** (`tests/admin/stagedCrewWarn.parity.test.tsx (new)`): spec §10 test 7. Placement: staged rows grow NO `crew-warn-stack` (placement is published-only — StagedReviewCard is not threaded through `renderSectionExtras`). Copy: a staged autocorrect card renders the instance line, asserted against Task 3's INDEPENDENT oracle for that fixture (NOT merely equal to the published render — both could share a regression, R1 MED); additionally assert the staged and published renders agree, as a second, weaker check. Empty-wrapper contract on published.

**Impl:** none expected (the split falls out of Tasks 5/8 gating); this task proves it and fixes any leak.

**Commit:** `test(admin): staged scope-split parity`

## Task 12 — impeccable dual-gate (invariant 8)

Run `/impeccable critique` AND `/impeccable audit` on the affected UI diff with the v3 setup gates (the context.mjs context load then register read). Fix P0/P1 or defer via `DEFERRED.md`. Findings + dispositions into the milestone handoff. Pre-code mechanical gate already honored in tasks (em-dash ban, 44px tap targets, canonical tokens). **Before** the whole-diff Codex review and milestone close.

**Commit:** `chore(admin): impeccable dual-gate dispositions` (+ any fix commits)

---

## Sequencing

1→2→3 (data field, producers+`CREW_SCOPED_WARNING_CODES`, composer) land first; 8 depends on 3. 4 depends on 2 (imports the code set). 4→5 (model index → placement+conservation, self-contained in 5)→7 (bulk chip on top). 6 is independent (nesting). 9-11 are audits over 5/7/8; 10 needs 5. 12 last. Each task commits independently; no batching. Conservation is proven inside Task 5, not deferred to 7.

## Verification before push (green ≠ green)

Full `pnpm test`, `pnpm typecheck`, `pnpm lint` (canonical Tailwind), `pnpm format:check`, the e2e task, and the env-bound suites. Then whole-diff Codex review to APPROVE → real CI green → merge.
