# Missing-pack-list notice — design

**Status:** Approved (spec review round 4, 2026-10-26)
**Date:** 2026-10-26
**Branch:** `feat/pack-list-missing-warning` (no ledger row; found live on the FinTech Forum CTO Summit 2026 review)
**Template:** `docs/superpowers/specs/parser/2026-10-25-nearmiss-read-blocks-and-venue-address-design.md` §4 (the `VENUE_ADDRESS_MISSING` notice). This notice copies its shape on purpose; where this document is silent on a mechanic, that spec's §4 governs.
**Evidence base:** `docs/superpowers/specs/parser/probes/2026-10-26-pack-list-missing-probe.ts`, output committed beside it as `2026-10-26-pack-list-missing-probe.out.txt`. Every corpus number below is printed by that script.

## 1. Problem

The FinTech Forum CTO Summit 2026 review shows a bare "No pack list parsed." in its Pack list section (`components/admin/wizard/step3ReviewSections.tsx`, `PackListBreakdown`, the `isEmpty` branch). The parser is right: neither the live test copy (`1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY`) nor Doug's original (`1DlzndW4hgK673PvLjBIW45eOb9z6C1oy3cJem64y5OE`) has a tab whose name contains `PULL SHEET`, or any `PULL SHEET` heading at all. How a pack list is found:

- **The heading is required.** The parser starts a pack-list case only at a header row whose every cell contains `PULL SHEET` (`lib/parser/pull-sheet.ts`, `parsePullSheet`). Probe from spec review round 1: renaming only `PULL SHEET!A1` in `east-coast.xlsx` to `PACK LIST` takes the parse from 1 case of 91 items to `pullSheet: null`, with the tab still named `PULL SHEET`.
- **The tab name helps but is not required.** On a tab whose name matches `/PULL SHEET/i`, the exporter joins the cells above the first gear row (a numeric QTY in column A with an item beside it) into one header row, which is what makes a multi-row title read as a heading (`lib/drive/exportSheetToMarkdown.ts`, `normalizePullSheetGrid`). Probe from spec review round 3: renaming only the `east-coast.xlsx` tab to `PACK LIST` still parses 1 case of 91 items, because that sheet's heading row already reads `PULL SHEET` across every cell.

So the shape that reliably works is the corpus's own: a tab named PULL SHEET with PULL SHEET at the top, above the gear rows. The copy recommends exactly that (§4.6).

The empty section is silent. It reads the same whether the sheet has no pull sheet or a parse went wrong, it counts as nothing in review, and it gives Doug's team no hint that crew lose the one thing the pack list is for: looking up which case a piece of gear is packed in. The 2026 template sheets carry no pull sheet tab at all, so this is the common case, not an edge.

## 1.1 Resolved scope — do not relitigate

1. **A notice, modeled on `VENUE_ADDRESS_MISSING`.** Owner direction in session, 2026-10-26: "this should be a warning like the missing venue information".
2. **No pack list built from the GEAR quote.** Considered and killed by the owner in session, 2026-10-26: crew equipment is already parsed from the GEAR tab into the per-room scope cards (`lib/parser/index.ts`, `parseGearTab` then `mergeGearIntoRooms`; rendered by `components/crew/sections/GearSection.tsx`), and the quote carries no case information, so a quote-built pack list cannot answer "which case is it in".
3. **Quiet when an archived pull-sheet tab exists.** An `OLD …` tab holding a pull sheet already has its own warning and include offer (`PULL_SHEET_ON_ARCHIVED_TAB`, `lib/sync/pullSheetOverride.ts`, `emitArchivedTabWarnings`). A second notice about the same absence would compete with the offer that resolves it.
4. **No component change.** The routed notice reaches the Pack list section through the existing section callout (§4.5); the section's empty line stays as the body under it. My call, recorded in §4.5, because it matches the venue notice exactly and leaves a correct empty state after Ignore.
5. **Gate-exempt.** Same reason as the venue notice (§4.4). The real loss case still gets a signal: MI-8c's change-feed notification, and this notice itself on the show's review (§4.4).

## 2. Measurement

From the probe. TABLE-B runs the production exporter on each committed `.xlsx` (round-trip control: 0 mismatches against the committed `.md`), so it sees archived tabs the way sync does.

| Exporter fixture | `pullSheet` | Archived pull-sheet tabs | Verdict under §4.1 |
| --- | --- | --- | --- |
| `consultants.md` | null | none | FIRES |
| `east-coast.md` | 1 case, 91 items | none | QUIET |
| `fintech.md` | null | none | FIRES |
| `fixed-income.md` | null | none | FIRES |
| `redefining-fi.md` | null | `OLD PULL SHEET` | SUPPRESSED |
| `ria.md` | null | none | FIRES |
| `rpas.md` | null | none | FIRES |

TABLE-A (raw fixtures, parser only, no exporter and so no archived-tab knowledge): `pullSheet` is null on 8 of 10; the two that parse a pack list are the 2024-05 East Coast and 2025-05 Redefining Fixed Income sheets.

`parsePullSheet` returns `null` whenever it finds no `PULL SHEET` header, and never returns an empty array (`lib/parser/pull-sheet.ts`, the `pullSheetCases.length === 0` return). The crew pack list renders only when `pullSheet` is non-null and non-empty (`components/crew/sections/GearSection.tsx`, the `packVisible` predicate).

## 3. Why the parser, and why suppression lives in sync

The property the notice reports is "the crew page will have no pack list", a property of the parsed output. The parser is where that output exists, and the venue notice set the precedent of emitting from `parseSheet` after the relevant block parser returns (`lib/parser/index.ts`, `emitVenueAddressMissing` after `parseVenue`).

The archived-tab half of the condition is not visible to the parser. The pure parser never sees archived tabs (`lib/parser/index.ts`, `archivedPullSheetTabs: []` with the comment "pure parser never emits archived-tab regions"); the exporter discovers them, and `finalizeArchivedTabs` (`lib/sync/pullSheetOverride.ts`) is "the one shared step every scan" uses to attach them to the parse result. Both production scan paths call it: the cron sync (`lib/sync/runScheduledCronSync.ts`, both the main call and the `discardAndRerun` rerun closure) and the onboarding scan (`lib/sync/runOnboardingScan.ts`, both the same two). So suppression goes there, next to the archived-tab warnings it defers to.

Emitting from `finalizeArchivedTabs` alone was rejected: the parser's early-return stub (`lib/parser/index.ts`, `buildMinimalParsedSheet`, used on MI-1 version-detection failure and on hard errors) also has `pullSheet: null`, and a show the parser could not read at all has bigger problems than a pack list. Emitting from the parser's main path, after `parsePullSheet`, keeps the stub quiet by construction.

## 4. The notice (normative)

One new warn-severity, non-blocking `ParseWarning` code, `PULL_SHEET_MISSING`.

### 4.1 Condition

Two stages, both required for the notice to survive into a stored parse result:

1. **Parser.** `parseSheet` emits exactly one `PULL_SHEET_MISSING` when `parsePullSheet(markdown).pullSheet === null`, on its main path only (after `parsePullSheet`, never from `buildMinimalParsedSheet`).
2. **Sync.** `finalizeArchivedTabs(pr, tabs)` removes every `PULL_SHEET_MISSING` from `pr.warnings` when `tabs.length > 0`, whether or not any tab is `included`. It removes nothing when `tabs` is empty.

Stage 2 covers each archived-tab state: an offered tab (S2), a content-changed tab re-offered after `discardAndRerun` (S4, which re-runs `finalizeArchivedTabs` on the no-override parse), and an included tab whose region nonetheless parses to no cases (S3 with an empty preview). In every one the archived-tab warning, offer or note is the surface that speaks.

Not a condition: a pull sheet with cases but zero items. `parsePullSheet` keeps a case whose rows all drop as itemless (`parseDataRows`), so `pullSheet` is a non-empty array and the crew page renders the case labels. That is a malformed pull sheet, not a missing one (§7 item 1).

### 4.2 What the notice never does

- It never writes to the parsed show. With and without the notice, everything but `warnings` is byte-identical.
- It never builds, guesses or offers a pack list from any other tab (§1.1 item 2).
- It never blocks publishing, and never changes what crew see. Severity is warn; the crew page is unchanged.

### 4.3 The warning object

- `severity: "warn"`, `code: "PULL_SHEET_MISSING"` as a string LITERAL in the push (the code extractors read literals; the venue helper is the pattern).
- Emitted through a new exported helper in `lib/parser/warnings.ts`, `emitPullSheetMissing(agg)`, beside `emitVenueAddressMissing`, with an exported `PULL_SHEET_MISSING` constant beside `VENUE_ADDRESS_MISSING`. `finalizeArchivedTabs` filters on the code literal, not that export: `lib/sync/pullSheetOverride.ts` is imported by a client component (`components/admin/wizard/archivedTabOffer.tsx`, for `overrideSnapshotsEqual`), and `lib/parser/warnings.ts` imports `node:crypto` (through `lib/parser/useRawContentHash.ts`). Found at implementation.
- `blockRef: { kind: "pull_sheet" }`, no `field`, no `name`. `KIND_TO_SECTION` already maps `pull_sheet` to `packlist` (`lib/admin/step3SectionStatus.ts`), the same kind the other `PULL_SHEET_*` parse warnings carry (`lib/parser/pull-sheet.ts`).
- `rawSnippet: "no pack list"`, a fixed string. Ignore keys its fingerprint on code plus normalized `rawSnippet` (`lib/dataQuality/warningFingerprint.ts`) and is stored per show (`ignored_warnings`, `unique (show_id, fingerprint)`, `supabase/migrations/20260702120000_ignored_warnings.sql`). A blank snippet disables Ignore (`lib/dataQuality/ignorableSnippet.ts`, `hasIgnorableSnippet`). The notice is at most once per show and has no sheet text of its own to key on, so a constant is the whole identity. An Ignore holds for as long as the notice keeps firing on that show. Once an applied parse stops carrying the notice (a pack list appears, or an archived pull-sheet tab suppresses it), the orphan prune in the apply transaction deletes the Ignore (`lib/sync/runScheduledCronSync.ts`, the `DQIGNORE-3` comment above `delete from public.ignored_warnings … not (fingerprint = any($2))`), so if the pack list is later lost again the notice shows again. That is the behavior Doug would want. Because the snippet is never blank, the Ignore control always renders, which licenses a `controlsNote` naming Ignore (§4.6, §4.7 item 5).
- `message`: `We didn't find a pack list we could read in this sheet.` This string IS shown: the staged first-seen card joins the `.message` of every data-quality warning outside `OPERATOR_ACTIONABLE_ANCHORED` into its summary line (`app/admin/show/staged/[stagedId]/page.tsx`, `warningSummaryFor`; rendered as `staged-warning-summary` in `components/admin/StagedReviewCard.tsx`). So it is Doug-readable prose in the venue notice's style (`emitVenueAddressMissing`: `We read "<venue>" as the venue but found no address for it.`), with no code, no banned vocabulary from the copy contract, and no em dash.
- No `sourceCell`, and the code is NOT added to `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts`): there is no cell to point at.

### 4.4 Gap class and alert posture

`PULL_SHEET_MISSING` joins `GAP_CLASSES` (`lib/parser/dataGaps.ts`) with label `missing pack list` (the default plural, `missing pack lists`, is correct) and `gateExempt: true`.

Membership makes the review count it as needs-a-look. The exemption is load-bearing for the same reason as the venue entry: without it, the first cron sync after deploy compares each published show's prior warnings (no `PULL_SHEET_MISSING`) with the new ones and raises `RESYNC_QUALITY_REGRESSED` (`isQualityRegression`, `lib/parser/dataGaps.ts`) on nearly every published show, since most have no pull sheet tab (§2). That alert would be caused by the deploy, not by any sheet edit.

The exemption does not leave a lost pack list silent. A published show that HAD a pack list and loses it trips MI-8c (master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §6.8, row MI-8c: `prior.pull_sheet IS NOT NULL AND new.pull_sheet IS NULL`). That invariant does not stage the parse for approval: every non-MI-11 invariant auto-applies and becomes a change-feed notification row (`lib/sync/phase1.ts`, the "Phase 2 Task 2.1 decision rule" comment; pinned by `tests/sync/phase1.test.ts`). Probe from spec review round 2: `east-coast.xlsx` with only `PULL SHEET!A1` renamed to `PACK LIST` gives `runInvariants` MI-8c/collapse and `runPhase1` pass. So the loss applies, the change feed records it, and the applied parse carries this notice as a needs-a-look item on the show's review. What the exemption gives up is only the `RESYNC_QUALITY_REGRESSED` admin alert on that loss.

Flag lifecycle for `gateExempt` on this entry is identical to the venue entry's (template spec §4.4): **storage** the `GAP_CLASSES` row; **write path** source only; **read paths** `isGateExempt` inside `isQualityRegression` and `hasRecoveredToBaseline`, `buildRegressionPayload` (`lib/sync/runScheduledCronSync.ts`), `computeDrift` and `computeNewShowGaps` (`lib/notify/monitorDigest.ts`); **effect** left out of the published-show regression alert, its payload and baseline, and the monitor digest; still a needs-a-look gap in wizard review, the review modal's section warnings, and data-quality summaries. Losing the new-show digest line is the accepted cost, as for the venue notice.

### 4.5 Where it renders

No component changes. The existing routing places it, and the venue notice takes the same paths to the Venue section. `warningsBySection` (`lib/admin/step3SectionStatus.ts`) sends a warn-severity warning to its mapped section when that section is rendered, and the `packlist` section is always rendered (its registry entry in `components/admin/wizard/step3ReviewSections.tsx` has no visibility predicate). What the section shows then depends on the review mode:

| Surface | In the Pack list section | In the Warnings section | Source |
| --- | --- | --- | --- |
| Staged review (wizard) | Inline flag callout at the top: catalog title plus a jump to the full card | The full card, with Report and Ignore | `components/admin/review/ShowReviewSurface.tsx`, `calloutEntries` passed only under `isStaged(data)` |
| Published review | The full card, with Report and Ignore, rendered in the section | Not listed: published warn rows routed to a section are removed from the generic panel | `components/admin/showpage/sectionWarningExtras.tsx`; `lib/admin/visibleWarningRows.ts` |
| Staged first-seen card | Not a section view | The `.message` in the card's summary line (§4.3) | `app/admin/show/staged/[stagedId]/page.tsx`, `warningSummaryFor` |

In both review modes the Pack list section body keeps "No pack list parsed." as its empty state, under the callout or card. When the notice is ignored, the callout or card goes and the body line is still the correct thing to show. Replacing the line would need the section body to read the warning state, a new prop path through the section registry's `render: (s) => …` signature, for a duplicate-wording gain.

Because no file under `app/` (outside `app/api/**`) or `components/` changes, AGENTS.md invariant 8 (impeccable dual gate) does not apply: `impeccable-gate: N/A — no UI surface`.

### 4.6 Copy (canonical — implementation copies verbatim)

Written to the warning-card copy contract (`docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.1): reader knows only sheet in, crew page out; voice "we found / we didn't find"; popover opens "Appears when"; none of the banned vocabulary; no em dash; straight apostrophes. "Tab", "row" and "heading" are sheet-world vocabulary and legal.

The copy recommends the shape that reliably works (§1): a tab named PULL SHEET, with PULL SHEET at the top above the gear rows. The heading is the part the parser requires; the name is what lets a multi-row title read as that heading. A sheet that has the tab but lost the heading fires the notice too, and "add a tab" alone would send Doug to create a tab he already has. The copy says "a pack list we could read", not "no tab", for the same reason. The composed inline line (`helpfulContext`, a space, `controlsNote`) stays under the 300-character cap the copy meta-test enforces.

| Field | Text |
| --- | --- |
| `title` | No pack list found |
| `helpfulContext` (inline) | We didn't find a pack list we could read in this sheet, so crew can't look up which case their gear is packed in. If this show has one, put it on a tab named PULL SHEET with PULL SHEET at the top. |
| `triggerContext` (popover) | Appears when no tab in the sheet has a pack list we can read. |
| `dougFacing` (§12.4) | "We didn't find a pack list we could read in this sheet, so the crew page has no pack list and crew can't look up which case gear is packed in. If this show has one, put it on a tab named PULL SHEET with PULL SHEET at the top." |
| `crewFacing` | `null` (§12.4 cell `—`). Crew never see this notice. |
| `followUp` | Doug → add or fix the PULL SHEET tab (or Ignore) |
| `controlsNote` | Use Report to flag it to us, or Ignore to hide this notice. |
| `longExplanation` | We look for a show's pack list under a PULL SHEET heading at the top of a tab, above the gear rows, and a tab named PULL SHEET is the layout we read best. This sheet has no such heading, or the rows under it aren't ones we could read, so the crew page shows no pack list. Once it's in place, the pack list shows the next time this show checks its sheet. |
| `helpHref` | `/help/errors#PULL_SHEET_MISSING` |
| `warningClass` | `"parse_warning"` |

The `PULL` prefix already maps to a help-page family (`app/help/errors/_families.ts`), so no help-page edit is needed.

### 4.7 Registration, end to end

Template: the venue notice's §4.6 list. Every item lands in the same commit as the catalog row, per the AGENTS.md §12.4 lockstep rule:

1. Master spec §12.4 row in the parser soft-warnings group beside the other `PULL_SHEET_*` rows, plus its `helpfulContext` YAML appendix entry.
2. `pnpm gen:spec-codes` and `pnpm gen:internal-code-enums`, both generated files committed.
3. `lib/messages/catalog.ts` row (§4.6).
4. `lib/parser/dataGaps.ts` `GAP_CLASSES` entry (§4.4) and the count pins that follow from it (`tests/parser/dataGaps.test.ts`, `tests/parser/dataGapsClassCompleteness.test.ts`), each moved by exactly one.
5. Copy-restore spec §4.2 appended row and §3.1 registry count, plus `tests/messages/warningCardCopyRegistry.ts`: `WARNING_CARD_COPY_CODES`, `EXPECTED_TRIGGER_CONTEXT`, `EXPECTED_LONG_EXPLANATION`, `EXPECTED_CONTROLS_NOTE`, `EXPECTED_HELPFUL_CONTEXT`. The copy meta-test's set of codes whose `controlsNote` names Ignore grows by `PULL_SHEET_MISSING`, with its comment updated to say this code always writes a non-empty snippet (§4.3). `EXPECTED_CORPUS_WARN_CODES` DOES change: it is read from `fixtures/shows/raw/` through `parseSheet`, where the notice fires on 8 of 10 fixtures (TABLE-A).
6. `tests/parser/_warningCodeAnchor.ts` `WARNING_CODE_ANCHOR`.
7. Every corpus warning baseline that records full warning signatures from `parseSheet` (the venue spec's `tests/parser/venueSignalParity.test.ts` is one; the plan enumerates the rest by running the suite) is regenerated and reviewed row by row: the only new signature is one `PULL_SHEET_MISSING` per fixture whose `pullSheet` is null.
8. `tests/app/admin/attentionModalGallery.serverProps.test.ts` `RENDERED_IDS_BEFORE` gains the new code's warn scenario id (the dev attention gallery renders one scenario per warn-severity catalog code).

No migration: no CHECK or enum lists warning codes, and `parse_warnings` is `jsonb`.

## 5. Acceptance criteria

- **AC-1.** On every fixture under `fixtures/shows/raw/` and `fixtures/shows/exporter-xlsx/`, `parseSheet` emits exactly one `PULL_SHEET_MISSING` when its parsed `pullSheet` is null and none otherwise. The expectation is computed from the parsed result in the test, never typed. Premise: at least one fixture fires and at least one does not (TABLE-A/B).
- **AC-2.** The emitted warning carries `severity: "warn"`, `blockRef` deep-equal to `{ kind: "pull_sheet" }`, `rawSnippet === "no pack list"`, `message` equal to the §4.3 string, no `sourceCell`; `hasIgnorableSnippet` is true for it, and `sectionForWarning` (`lib/admin/step3SectionStatus.ts`) maps it to `packlist`.
- **AC-3.** `buildMinimalParsedSheet` output never carries the code: a sheet that fails version detection (MI-1) parses with `pullSheet: null` and no `PULL_SHEET_MISSING`.
- **AC-4.** `finalizeArchivedTabs` removes every `PULL_SHEET_MISSING` when given at least one archived tab, included or not, keeps every other warning in order, and still appends one `PULL_SHEET_ON_ARCHIVED_TAB` per non-included tab. With an empty tab list it leaves `pr.warnings` exactly as it was. Premise: the input `pr.warnings` contains the code and at least one other warning.
- **AC-5.** End to end through the exporter: synthesizing `fixtures/shows/exporter-xlsx/redefining-fi.xlsx` and finalizing its parse with the returned archived tabs leaves no `PULL_SHEET_MISSING`; the same flow on `fintech.xlsx` leaves exactly one. Both verdicts are read from the exporter's returned tab list, not typed.
- **AC-6.** The notice never changes the payload: on every firing fixture, the `parseSheet` result with the helper mocked to a no-op deep-equals the real result once `warnings` is removed from both. The emit helper takes only the aggregator.
- **AC-7.** `isQualityRegression(prior, current)` is false when `current` differs from `prior` only by one `PULL_SHEET_MISSING` (the `gateExempt` contract, §4.4).
- **AC-8.** The registration set of §4.7 is complete: x1 catalog parity (`tests/cross-cutting/codes.test.ts`), the card-copy meta-test (`tests/messages/_metaWarningCardCopy.test.ts`), the gap-class partition, the help-page grouping test, the warning-code anchor test, and the attention-gallery server-props test all pass.

## 6. Testing

- A new parser suite for the notice, beside the venue notice's suite under the parser tests directory, carries AC-1, AC-2, AC-3 and AC-6.
- AC-4 and AC-5 join the existing `finalizeArchivedTabs` tests (the suite that already covers `emitArchivedTabWarnings`; the plan names it after a grep).
- AC-7 joins whichever suite already exercises `isQualityRegression` with a `gateExempt` code (the venue notice added its case there).
- AC-8 is the existing registry and meta suites, green.

Anti-tautology: every suppression case pairs with a positive control that still fires (AC-4 empty-tabs case, AC-5 `fintech`), and every corpus verdict is computed from the parse or exporter output.

## 7. Documented limits

Filed here rather than as ledger rows, per the 2026-08-25 process freeze. Each names the condition that would make it a real finding.

1. **A pull sheet with cases but no items.** `pullSheet` is a non-empty array, so the notice stays quiet while crew see case labels with nothing under them. No corpus fixture produces it. Re-file trigger: a live sheet whose review shows pack-list cases with zero items.
2. **The ignored-list discriminator reads oddly.** The wizard's ignored list labels each row with its snippet as `Sheet row <snippet>` (`components/admin/wizard/step3ReviewSections.tsx`, `ignoredRowSnippet`), so this row reads "Sheet row no pack list". The venue notice has the same framing with a venue name. Re-file trigger: Doug or a UI review flags the line as confusing.
3. **Non-scan parse paths see the notice even beside an archived tab.** Suppression runs in `finalizeArchivedTabs`, which both production scan paths call. A parse that skips it (dev tooling such as `app/admin/dev/actions.ts`, probes) keeps the notice on a sheet whose only pull sheet is on an `OLD` tab. Re-file trigger: a production path that stores a parse result without calling `finalizeArchivedTabs`.
4. **No "Open in Sheet" link.** There is no cell to point at (§4.3). Re-file trigger: Doug reports he could not tell where to add the tab.

## 8. Non-goals

- Any pack list built from the GEAR quote or any other tab (§1.1 item 2).
- Any change to the crew page.
- Any component change, including rewording or removing the "No pack list parsed." empty line (§4.5).
- Detecting a pull sheet that is present but malformed beyond what the existing `PULL_SHEET_*` codes already report.

## Dimensional Invariants

None. No component, layout or style is touched.

## Transition Inventory

None. No component with multiple visual states is touched.
