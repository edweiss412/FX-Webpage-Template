# Warning-trim un-defer bundle — Sheet warnings panel unification, rename, dedup, wizard snapshot, crew-row alert producer

**Date:** 2026-07-23
**Status:** Ratified (owner decisions 2026-07-23, this session; autonomous-ship approved)
<!-- spec-lint: ignore — bare DEFERRED.md means the repo-root file; plan-dir DEFERRED.md files shadow the basename -->
**Supersedes:** the six parked entries under "warning-surface-trim (2026-07-21)" in `DEFERRED.md:71-115`.

## 1. Scope

Six previously deferred items, owner-decided 2026-07-23:

| # | Item | Decision |
|---|------|----------|
| 1 | Silent-state "(0)" suppression | **Option D + ii**: panel box returns; warnings-homed cards render inside it; notes become white cards; heading + rail count include the panel's own ACTIVE cards (ignored stay uncounted, as today) |
| 2 | Panel title | Rename **"Parse warnings" → "Sheet warnings"** (title only; help slug and error-code URLs unchanged) |
| 3 | Correction-sentence double-reach | **Popup wins**: published callout strip retired; sentence lives once per card "?" popover (notes included) |
| 4 | Staged byte-identical blind spot | New **wizard Step-3 composition test** (ParsePanel-level), landing in this PR as the wizard-unchanged proof |
| 5 | First-publish data-gaps digest | **Re-parked bell-only** with rationale recorded in the repo-root deferred ledger (no code change) |
| 6 | Dormant §5.4 crew-row alert slot | **Activate in-row fan-out**: `AMBIGUOUS_EMAIL_BINDING`'s existing `crew_member_ids` context matches rendered roster rows by id; one alert fans out to a banner inside each involved row; parked e2e un-skips |

### 1.1 Resolved scope — do not relitigate

- **Option D layout (cards inside the panel box) overrides the crew-warning-attachment §1.1 "extras always sibling" contract for the `warnings` section only.** Ratified by owner 2026-07-23 after mockup comparison (decision 1). Other sections keep the sibling contract verbatim.
- **All-cards interior (option ii) with two-tone color** — amber = actionable, white/neutral = note, grey/muted = ignored — ratified over "group headers only" and "keep mixed" alternatives. Color is deliberately NOT homogenized: once every item is a card, tone is the only remaining act-vs-FYI signal (owner shown the all-amber and all-white failure mockups and chose two-tone).
- **Rename is title-only.** The help route slug `/help/admin/parse-warnings` (`app/help/_nav.ts:24`) and every `helpHref` (`/help/errors#…`) are unchanged; only display strings change. Ratified to avoid link churn.
- **Decision 3 removes the published `CorrectionLoopCallout` outright** (`components/admin/wizard/step3ReviewSections.tsx:2879-2885`, published branch only). The wizard branch stays unconditional — the staged surface's render is contractually unchanged (trim spec `2026-07-20-warning-surface-trim-design.md` staged contract).
- **Item 5 is an explicit re-park, not an omission.** The digest (`SHOW_FIRST_PUBLISHED` `context.data_gaps`) is a frozen publish-time count of the same warn-severity warnings the modal already renders live as cards; a modal banner would duplicate stale counts. Owner chose bell-only 2026-07-23. The only code artifact is the `DEFERRED.md` entry rewrite.
- **Item 6 keeps the §12.4 catalog row for `AMBIGUOUS_EMAIL_BINDING` byte-identical** (`lib/messages/catalog.ts:73-88`). The mockup showed per-row personalized copy; the ratified build is **placement-only enrichment** — the existing `dougFacing` template renders in each involved row. No catalog edit, no `pnpm gen:spec-codes`, no §12.4 lockstep. Recorded as a deliberate simplification.
- **The wizard (staged) surface is byte-identical across this whole bundle** except the rename literal it shares (§3). Item 4's new test is the proof mechanism and lands BEFORE the panel rebuild in plan order.
- **No DB migration and no producer change.** Item 6 consumes the `crew_member_ids` + `email` the producer already writes (`lib/auth/validateGoogleSession.ts:40-47`); matching is by crew-member id against the published roster's index-aligned `crewIds`, never by display name.

## 2. Item 1 — Sheet warnings panel unification (published modal only)

### 2.1 Current mechanics (verified)

- Heading chrome: `ModalSectionChrome` (`step3ReviewSections.tsx:853-985`); count chip at `components/admin/wizard/step3ReviewSections.tsx:922-926`; `hasBody = chrome.suppressPanelCard !== true` at `components/admin/wizard/step3ReviewSections.tsx:876`; Silent state suppresses the panel card (comment `components/admin/wizard/step3ReviewSections.tsx:866-876`) and cards render as siblings via the extras block (`components/admin/showpage/sectionWarningExtras.tsx:243-251`, seam `border-t`).
- Count carve-out: `shouldShowSectionCount` returns `!(count === 0 && flagged)` (`step3ReviewSections.tsx:712-719`); counted subset `COUNT_SECTIONS` at `components/admin/wizard/step3ReviewSections.tsx:701`.
- Body matrix (`components/admin/wizard/step3ReviewSections.tsx:2803-2840`): rows==0 & gate on → Silent (`here > 0` → `null`) / Elsewhere (pointer sentence) / Clean. `here`/`elsewhere` from `chrome.routedWarnings` (`components/admin/wizard/step3ReviewSections.tsx:2771-2772`); rows = `visibleWarningRows(warnings, gate)` (`components/admin/wizard/step3ReviewSections.tsx:2764`), info-only when the gate is on.
- Cards: `PerShowActionableWarnings` items (`components/admin/PerShowActionableWarnings.tsx:213`) wrap `CompactAlertCard` (`components/admin/CompactAlertCard.tsx:96-112`), tones at `components/admin/CompactAlertCard.tsx:51-54` (`warning` / `muted` / `neutral`), controls band at `components/admin/PerShowActionableWarnings.tsx:198-211` ("Open in Sheet ↗" left, per-item controls right).
- Routing: warn rows with unmapped/missing `blockRef.kind` (or unrendered target section) fall back to the `warnings` bucket (`lib/admin/step3SectionStatus.ts:84-98`); info rows are never routed (`lib/admin/step3SectionStatus.ts:90`).

### 2.2 New layout

For the published surface (`routedWarningsRenderElsewhere === true`):

1. **The panel card box ALWAYS renders** on the published surface (floor = Clean row; total matrix in §2.3a). `suppressPanelCard` and the Silent null-body row are deleted.
2. **Interior composition, in order:**
   1. Parse-notes banner lines (`parse-attention-notes`, `components/admin/wizard/step3ReviewSections.tsx:2779-2802`) — unchanged, first child.
   2. **Notes group**: eyebrow-labeled group ("Notes") containing every visible info row rendered as a **neutral-tone card**: `CompactAlertCard` `tone="neutral"` (`CompactAlertCard.tsx:54` — no stripe, no severity glyph by `components/admin/CompactAlertCard.tsx:88-89`), message = existing row title via `reviewWarningTitle`, guidance line = the row's `helpfulContext`-derived context, a `?` help popover (§2.4), and a controls band containing only the existing "Open in Sheet ↗" link when `sourceCell` resolves (same gate as `components/admin/wizard/step3ReviewSections.tsx:2960-2977` today). No Report/Ignore/severity-tag — notes carry no mutate controls today and gain none.
   3. **Actionable groups**: the existing extras-block content — group eyebrows, bulk "Ignore all N" chips, amber cards, and the ignored-warnings disclosure (`sectionWarningExtras.tsx:263-277`) — rendered INSIDE the panel card as its children instead of as a sibling. The `seamless`/`border-t` seam variant is retired for the warnings section (the box supplies the boundary).
   4. Pointer sentence / clean row: when rows==0 & here==0, the box renders the Elsewhere pointer (`ElsewherePointerSentence`, `components/admin/wizard/step3ReviewSections.tsx:2817-2821`) or the Clean row (`components/admin/wizard/step3ReviewSections.tsx:2826-2831`) exactly as today, inside the box.
3. **Sub-severity ordering** inside the box: notes group first, then actionable groups, then ignored disclosure — matching today's visual order (info rows above extras).
4. **The wizard branch renders exactly as today** — full list rows, unconditional callout, no cards. Every change in this section is gated on the published gate that already exists (`components/admin/wizard/step3ReviewSections.tsx:2763`).

**Mode boundary statement:** notes-as-cards, in-box extras, the group eyebrow / bulk-chip / ignored-disclosure machinery, and the retired callout exist ONLY in published mode (that machinery is published-only today and stays published-only). Wizard mode keeps: list rows (both severities), unconditional `CorrectionLoopCallout`, non-blocking line (`components/admin/wizard/step3ReviewSections.tsx:2886-2894`), per-row use-raw/recognize controls. Shared between modes (same code, both render): heading chrome (`ModalSectionChrome`), catalog copy, and the `correctionLoopCopy` source.

### 2.3 Count semantics (replaces trim spec §3.3 for the published surface)

- `panelCount = visibleInfoRows + activeHere`, where `visibleInfoRows = visibleWarningRows(warnings, gate).length` (info-only under the gate) and `activeHere = routedWarnings.here` (ACTIVE warnings-homed cards; the extras model's active/ignored partition means `here` counts active only — ignored cards are excluded, matching today's rail semantics of counting visible list rows and the ignored disclosure being collapsed).
- Heading chip and `railCount` (`step3ReviewSections.tsx:4218-4225`) both read this via one exported helper (single-predicate rule from trim spec §3.2 preserved: one function, two readers).
- `elsewhere` is NEVER counted here — the pointer sentence names those sections (unchanged).
- **`shouldShowSectionCount` is byte-identical — the carve-out is RETAINED** (`components/admin/wizard/step3ReviewSections.tsx:712-719`). It serves every `COUNT_SECTIONS` member, and `sectionStatus` (`lib/admin/step3SectionStatus.ts:110-114`) does not filter ignored warnings, so `flagged` with `panelCount === 0` remains reachable in exactly one state: every routed warn ignored (ignored-only). There the suppression stays correct — an amber pill beside "(0)" over a collapsed ignored disclosure is the same self-contradiction the carve-out exists for. In every other flagged state `activeHere > 0` so the chip shows. Other sections and the wizard are untouched by construction, not by luck. Wizard count unchanged (`rows.length`, both severities, `components/admin/wizard/step3ReviewSections.tsx:2777`).
- **Guard conditions:** `routedWarnings` undefined (gate off) → wizard semantics, unchanged. `here`/`elsewhere` total non-negative integers when the gate is on (trim spec §3.2). All-zero → Clean row with "(0)" chip (unchanged behavior: `shouldShowSectionCount(0, "warnings", false)` → true today).

### 2.3a Panel state matrix (total over the published gate)

Inputs: `notes` = parse-note lines, `info` = visibleInfoRows, `act` = activeHere cards, `ign` = ignored-here count, `elsewhere` = routed-elsewhere active count. Box renders ALWAYS on the published surface (the section is in the registry; a box with only the Clean row is the floor). Interior rows, top to bottom, each present iff its predicate holds:

| Block | Present iff |
|---|---|
| Parse-notes lines | `notes > 0` |
| Notes group (eyebrow + white cards) | `info > 0` |
| Actionable groups (eyebrows, bulk chips, amber cards) | `act > 0` |
| Ignored disclosure | `ign > 0` |
| Elsewhere pointer sentence | `info == 0 && act == 0 && elsewhere > 0` |
| Clean row | `info == 0 && act == 0 && elsewhere == 0` |

Consequences the matrix pins: ignored-only (`info==act==elsewhere==0, ign>0`) renders Clean row + ignored disclosure together (today's semantics — "nothing NEEDS a look" stays true); the pointer never coexists with ACTIVE local content (G or A) but CAN coexist with parse-notes and the ignored disclosure (`elsewhere>0, ign>0`) — the pointer's claim is about warnings that need a look, which ignored items are not; Clean and pointer are mutually exclusive; empty-everything renders Clean row alone. Exactly one of {pointer, Clean} renders whenever `info==0 && act==0`; neither renders otherwise.

### 2.4 Note popovers

Notes gain the same `?` popover affordance cards carry (`CompactAlertHelp` path, `PerShowActionableWarnings.tsx:240-247`). Assembly rule (total truth table):

- `copy` = the FIRST NON-BLANK of catalog `longExplanation`, then `helpfulContext` (blank = `null`, empty, or whitespace-only; a blank `longExplanation` falls through to `helpfulContext` — this is NOT nullish coalescing); a missing catalog row or both blank → copy ABSENT. The §5/§6.4-adjacent unit scope adds this boundary case (blank longExplanation + present helpfulContext → trigger with helpfulContext).
- `sentence` = `correctionLoopCopy("resync")` iff `w.sourceCell` is non-null (same gate as cards, `components/admin/PerShowActionableWarnings.tsx:125-138`).
- Popover body = the present members of `[copy, sentence]` in that order; trigger renders iff the body is non-empty.

| copy | sourceCell | trigger | body |
|---|---|---|---|
| present | present | yes | copy + sentence |
| present | absent | yes | copy only |
| absent | present | yes | sentence only |
| absent | absent | no | — |

**Note-card guards:** `reviewWarningTitle` (`components/admin/wizard/step3ReviewSections.tsx:2701-2715`) already satisfies the no-raw-error-codes contract: catalog title first, then the warning's own message ONLY when it is neither code-containing nor code-shaped (`^[A-Z0-9_]{2,}$` rejected), else the generic "A parse issue was recorded for this sheet." — it can never return a raw code, and this bundle reuses it unchanged, so a note card's message line is always non-empty and always user-safe. The guidance line renders iff the row's context string is present (null/empty/whitespace → omitted, no empty element). The Notes group (eyebrow included) renders iff `info > 0` (§2.3a) — no empty group chrome. "Open in Sheet ↗" renders iff `buildSheetDeepLink` yields a href (result-gated, never `sourceCell`-gated alone — `components/admin/PerShowActionableWarnings.tsx:150-152` precedent).

### 2.5 Cap behavior

**Explicit no-cap decision.** The warnings list is uncapped today (`rows.map`, `components/admin/wizard/step3ReviewSections.tsx:2895-2896`) and the card lists are uncapped; this bundle keeps both uncapped. Rationale: the operator must see every warning, and §2.3 pins count == rendered NON-IGNORED cards (notes + active amber; the collapsed ignored disclosure is deliberately outside the count, exactly as its list rows are outside today's rail count) — a cap would break that identity. Boundary behavior = the review modal's existing vertical scroll. `CREW_CAP` (crew section, `components/admin/wizard/step3ReviewSections.tsx:158`) is untouched. Parse-note lines: bounded upstream (two codes max, attention-alert-routing §3.2), unchanged.

### 2.6 Transition inventory

Interior blocks (§2.3a): parse-notes (N), notes group (G), actionable groups (A), ignored disclosure (I), pointer (P), clean row (C). Six blocks → 15 pairs. Coexistence is governed by the §2.3a predicates: P and C are mutually exclusive with each other AND with G and A (both require `info == 0 && act == 0`); every other combination can occur. For each pair, the table states the treatment of any transition that changes which of the two renders (mount, unmount, or swap). ALL are **instant — deliberate**: the panel is a data-driven re-render, the touched tree carries no transition classes today (`components/admin/wizard/step3ReviewSections.tsx:2754-2895`), and this bundle adds none.

| Pair | Coexist? | Transition treatment |
|---|---|---|
| N–G | yes | instant |
| N–A | yes | instant |
| N–I | yes | instant |
| N–P | yes | instant |
| N–C | yes | instant |
| G–A | yes | instant |
| G–I | yes | instant |
| G–P | never (matrix) | swap instant |
| G–C | never (matrix) | swap instant |
| A–I | yes | instant |
| A–P | never (matrix) | swap instant |
| A–C | never (matrix) | swap instant |
| I–P | yes | instant |
| I–C | yes | instant |
| P–C | never (matrix) | swap instant |

Single-block mount/unmount (N±, G±, A±, I±, P±, C±): instant. Simultaneous multi-block change on one refresh: single React commit, no intermediate frame — instant by construction. Popover open/close (note or amber card): existing HoverHelp fade, unchanged. Compound: background refresh while ANY popover (note or actionable) is open — existing PopoverHostContext teardown/reposition rules (HoverHelp specs 2026-07-22/23), unchanged; a refresh that unmounts the popover's card tears the popover down with it (existing portal-host contract). Ignore/bulk-ignore actions: existing announcer + list re-render semantics (warning-announcer spec), unchanged. No `AnimatePresence` anywhere in the touched tree.

### 2.7 Dimensional invariants

### DELETED-26

None. The panel box and cards are auto-height flex columns with no fixed-dimension parent → no invariant table required (declared per project rule).

## 3. Item 2 — Rename "Parse warnings" → "Sheet warnings"

- Display literals only. Sweep (verified 2026-07-23, `rg -n '"Parse warnings"|Parse warnings' --glob '!node_modules' --glob '!docs' --glob '!*.md' -l`, 20 files): rail label `step3ReviewSections.tsx:4219`; help nav title `app/help/_nav.ts:24`; help page H1 + mdx body `app/help/admin/parse-warnings/page.mdx`; cross-references in `app/help/admin/per-show-panel/page.mdx`, `app/help/tour/page.mdx`; dev gallery labels (`app/admin/dev/page.tsx`, `buildSwitcherScenarios.ts`); `app/admin/_showReviewModal.tsx`; `components/admin/review/ShowReviewSurface.tsx`; `lib/reports/submit.ts` (report subject line — user-visible, rename); test pins (`tests/help/page-parse-warnings.test.tsx:51` and `tests/help/page-parse-warnings.test.tsx:55` and the remaining listed test files).
- **Unchanged:** route slug `/help/admin/parse-warnings`, `helpHref` anchors, message-catalog codes and §12.4 (no catalog row names the panel), `data-testid` strings (`…-breakdown-warnings` etc. are ids, not copy).
- The plan runs the sweep command again at implementation time and dispositions every hit (grep-driven sweep rule).

## 4. Item 3 — Correction sentence: popup wins

- `correctionLoopCopy(mode)` (`components/admin/CorrectionLoopCallout.tsx:32-34`) remains the single exported source.
- **Published branch:** the callout render (`step3ReviewSections.tsx:2879-2882`) is removed; `infoRowInvitesCorrection` (`lib/admin/infoCodeActionability.ts:16`) loses its only published consumer and is retired with its import (`components/admin/wizard/step3ReviewSections.tsx:107`) if no other consumer remains (plan verifies; the INFO_CODE_ACTIONABILITY scanner contract from `2026-07-22-warning-panel-polish` §3.4 is updated in the same commit).
- **Sentence home:** every card popover — amber cards keep `followUpCopy={correctionLoopCopy("resync")}` (`sectionWarningExtras.tsx:216-218`); note popovers (§2.4) add the same, same `sourceCell` gate (`PerShowActionableWarnings.tsx:125-138`).
- **Wizard branch:** unconditional callout stays (`components/admin/wizard/step3ReviewSections.tsx:2883-2885`); non-blocking line stays.
- Cards rendered by OTHER sections keep their popover sentence (no callout exists there) — unchanged.

## 5. Item 4 — Wizard-unchanged proof (two tests)

- **Blind spot being closed:** `tests/components/admin/stagedCardBaseline.test.tsx` renders the `PerShowActionableWarnings` leaf only; wizard chrome, card ordering, wizard-only props, AND the wizard warnings-body branch are invisible to it (deferral text, repo-root deferred ledger 2026-07-21 section).
- **Test A — ParsePanel composition** (new file tests/components/admin/parsePanelComposition.test.tsx — created by this bundle, path in prose deliberately uncited): renders `ParsePanel` (`components/admin/ParsePanel.tsx:65-77`) with a staged multi-row fixture; asserts one `StagedReviewCard` per input row in input order, each mounting the actionable-warnings leaf (`components/admin/StagedReviewCard.tsx:519-520`); serialized-structure snapshot of the wizard chrome around the first card with the (already leaf-snapshotted) card interiors pruned. Failure mode caught: wizard-chrome or ordering change that leaves the shared leaf untouched.
- **Test B — wizard warnings-branch pin** (same new file, second describe block): renders `WarningsBreakdown` with the gate OFF (no `routedWarnings`/`renderSectionExtras` in context — the wizard mount shape) and a fixture holding warn + info rows; asserts by rendered markers: every fixture row renders as a list row (both severities, count derived from fixture), the `CorrectionLoopCallout` is present unconditionally, the non-blocking line (`…-warnings-nonblocking` testid) is present, NO group eyebrow / bulk chip / `per-show-actionable-item` card exists in the tree, AND the per-row wizard controls render non-vacuously: the fixture threads `wizardSessionId` + `dfid` and includes one `UNKNOWN_ROLE_TOKEN` row and one use-raw-eligible structural row (the trim spec's §12 fixture rule), and the test asserts each of those rows renders its control boundary (recognize-role and use-raw respectively, `components/admin/wizard/step3ReviewSections.tsx:2984-2995` mount site) with an enabled, accessibly-named control. This pins the wizard branch of `components/admin/wizard/step3ReviewSections.tsx:2754-2995` directly — including the wizard-only control wiring §2.2 promises unchanged — the branch §2 edits sit next to. (The prior draft's "published-only props absent" claim is dropped: not executable from rendered DOM; the marker assertions above are the executable equivalent.)
- **Anti-tautology:** expected row/card counts derive from the fixture; Test B's absence assertions are scoped to the rendered `BreakdownSection` subtree, cloned with independently-rendering siblings removed.
- **Ordering within this PR:** both tests land and pass BEFORE the §2 panel rebuild commits, then must still pass unmodified after them.

## 6. Item 6 — Crew-row alert banner: id-matched fan-out

### 6.1 No producer change

`upsertAmbiguousEmailAlert` already stores everything placement needs: `context.crew_member_ids` (the involved rows' DB ids) and canonical `email` (`lib/auth/validateGoogleSession.ts:35-48`). **No producer edit, no new context keys, no names in context** — display names are unstable (renames, collisions) and are NOT used for matching. The `AMBIGUOUS_EMAIL_BINDING_DETECTED` forensic emit (`lib/auth/validateGoogleSession.ts:240-246`) is untouched.

### 6.2 Derivation

- `projectIdentityContext` already validates `crew_member_ids` (`lib/adminAlerts/projectIdentityContext.ts:100-102` reads it for counts; the projection's resolution group carries id arrays shape-validated, never sanitized). The derivation exposes, for this code only, `crewMatch: { crewMemberIds: string[]; expectedCount: number } | null` on `AttentionAlertInput` — ids UUID-validated (`UUID_RE` precedent `lib/adminAlerts/projectIdentityContext.ts:16`), deduplicated, order-irrelevant; `expectedCount = crewMemberIds.length` after dedup. Malformed/missing/empty ids, or any non-UUID member → `crewMatch: null`.
- **`crewKey`/`crewKeys` question resolved: neither.** The existing singular `crewKey` field and the name-keyed `byCrewKey` merge (`components/admin/review/ShowReviewSurface.tsx:151`) are UNCHANGED (still zero name-keyed producers). Fan-out uses a NEW, parallel, id-keyed path; nothing consumes `crewKey` differently.

### 6.3 Placement contract (activates published-show-alerts §5.4 by id)

- `CrewBreakdown` in published mode already receives `actions.crewIds`, index-aligned with `members` (`components/admin/wizard/step3ReviewSections.tsx:1520-1523`). `ShowReviewSurface` computes, per alert item with non-null `crewMatch`, the matched rendered indexes: `matched = shownIndexes.filter(i => crewMatch.crewMemberIds.includes(crewIds[i]))` over the SHOWN slice (`members.slice(0, CREW_CAP)`, `components/admin/wizard/step3ReviewSections.tsx:1525`).
- **Completeness rule (total, set-correspondence — NOT a count comparison):** for each expected id, `hits(id) = |{ shown index i : crewIds[i] === id }|`. The banner fans out in-row — one banner inside each matched row's `<li>`, below row content, per the §5.4 DOM contract (`docs/superpowers/specs/2026-07-19-published-show-alerts.md:156-172`) — iff `hits(id) === 1` for EVERY id in `crewMatch.crewMemberIds` (unique one-to-one correspondence). Any other outcome — some `hits(id) === 0` (row beyond `CREW_CAP`, roster drift, id not in roster) or some `hits(id) > 1` (degenerate duplicate rendered ids) — renders ONE section-top banner exactly as today. Also section-top: staged mode with no `actions`, `crewMatch` null. Never both placements; never a partial fan-out; a duplicate rendered id can never double-place (the `[A,B]`-expected vs `[A,A]`-rendered case fails `hits(B) === 0` AND `hits(A) === 2`).
- Same alert content in every placement: existing `dougFacing` template + params, byte-identical catalog (§1.1). Menu/bell rendering unchanged (single item, single menu row).
- **Guard table:** old alert rows lacking ids → `crewMatch` null → section-top. Duplicate ids in context → deduped before `expectedCount`. Two roster rows with identical display names → irrelevant (matching is by id). A crew member renamed in the sheet → id unchanged → still matches. `crewIds` absent (staged/archived: `actions` undefined) → section-top. Empty roster → section-top.

### 6.4 Tests

- `tests/e2e/published-show-attention.spec.ts:126` un-skips; assertions: banner inside EACH matched row's `<li>` (2 rows, id-seeded fixture), absent at section-top when fanned out, section-top fallback when one involved id is absent from the roster.
- Unit (new file tests/admin/crewMatchFanout.test.ts — created by this bundle, path in prose deliberately uncited): derivation guards (missing/malformed/empty/non-UUID/duplicate ids → null or dedup as specified); completeness rule (some hits(id)==0 → section-top; all hits==1 → fan-out; duplicate RENDERED ids — expected [A,B], rendered [A,A] — → section-top; expected 0 impossible by null-guard); same-name-different-id rows get exactly one banner on the involved row; involved row beyond CREW_CAP → section-top; conservation (never in-row AND section-top; banner count == matched count when fanned out).

## 7. Item 5 — DEFERRED.md reconcile

Rewrite the "warning-surface-trim (2026-07-21)" section: items 1, 2, 3, 4, 6 graduate to `DEFERRED-archive.md` as RESOLVED-by-this-bundle entries; item 5 (bell-only alert cut) is re-parked in place with the new rationale: *digest = frozen publish-time count of warnings already rendered live by the modal; banner would add only the publish-event notice; owner re-confirmed bell-only 2026-07-23.* Un-defer trigger: owner asks for a publish-event banner (with or without digest).

## 8. Flag lifecycle / zombie audit

No new boolean flags. `suppressPanelCard` (storage: chrome object; write: ShowReviewSurface; read: `components/admin/wizard/step3ReviewSections.tsx:876`) is **deleted** — write and read removed together, no zombie half. `routedWarningsRenderElsewhere` unchanged.

## 9. Meta-test inventory (declared per project rule)

- **Extends:** `tests/admin/visibleWarningRows.test.ts` (count helper), routed-warnings gate tests (`tests/components/admin/review/routedWarningsGate.test.tsx`), `publishedWarningNoLoss.test.tsx` (no-warning-lost identity union — must hold across the in-box move), attention-routes/alert-catalog meta-tests (item 6), INFO_CODE_ACTIONABILITY scanner (item 3), stagedCardBaseline (kept; item 4 adds the composition layer above it).
- **Creates:** the §5 parsePanelComposition test file and the §6.4 crewMatchFanout test file (both new). <!-- spec-lint: ignore — files are created by this bundle -->
- **Not applicable:** advisory-lock topology (no lock surface touched — `upsertAdminAlert` call shape unchanged inside the existing auth path); Supabase call-boundary registry (NO Supabase read or write path changes anywhere in this bundle — item 6's producer and its select are byte-identical, §6.1); §12.4 catalog parity (no catalog edits); email canonicalization (producer already canonicalizes, `validateGoogleSession.ts:44`).

## 10. Test strategy summary

TDD per task. Real-browser assertions where geometry/placement matters (crew-row banner e2e); jsdom for derivation/composition units; impeccable critique + audit dual-gate on the UI diff (invariant 8); pre-code mechanical checklist (tap targets, canonical tokens, no em-dash in copy) before implementation.

## 11. Numeric self-check

Six items; two options (D, ii) for item 1; three body states post-rebuild; 20-file rename sweep (non-docs, re-run at plan time); zero DB migrations; zero §12.4 edits; two new test files (§5 composition+branch pin; §6.4 fan-out unit), matching §9's Creates list.
