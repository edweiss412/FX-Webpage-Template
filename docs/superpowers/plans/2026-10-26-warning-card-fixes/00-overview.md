# Warning card fixes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Sheet warnings cards show judgment calls as judgment calls, show what we read, reach the cell / section / reservation they talk about in one tap, defer a reading change behind an explicit Save, and resolve the archived pull sheet from its own card.

**Architecture:** Pure pieces land first (parser `readAs`, the venue value-cell anchor, the archived-tab routing key, one display module, the catalog rows). Then the two sheet-icon host rows (wizard title row, the compact card's message row), the published adapters, the reading comparison, Accept wording, the Accepted disclosure, the archived card, and the deferred reading choice (one provider per row over the existing pure derivation). Hotel and section jumps come last, then a census reconciliation after every component edit has landed.

**Tech Stack:** Next.js 16 client components, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + Testing Library (jsdom), Playwright standalone harnesses (esbuild-bundled live entries, Tailwind CLI CSS).

**Spec:** `docs/superpowers/specs/2026-10-26-warning-card-fixes-design.md` (Codex spec review APPROVE, round 3). Executors read both. Section numbers below (§N) are the spec's.

**Branch / worktree:** `feat/warning-card-fixes` at `/Users/ericweiss/FX-worktrees/warning-card-fixes` (invariant 11 satisfied). No ledger entry matches (spec §1.5), so invariant 12 does nothing here.

## Files in this unit

| File | Contents |
|---|---|
| 00-overview.md | this file: constraints, review focus, meta-test inventory, plan-time sweeps, harness readiness, spec ambiguities |
| 01-lib.md | Tasks 1-5: parser, anchors, routing, display module, catalog lockstep |
| 02-chrome.md | Tasks 6-9: sheet icon backdrops, the two host rows (layout-dimensions tasks), wizard row kinds, published adapters |
| 03-accept-archived-reading.md | Tasks 10-15: comparison, Accept wording, Accepted disclosure, archived card, transition audit + deferred choice, mounts |
| 04-jumps-and-finish.md | Tasks 16-22: reservation marker, section jumps, census reconciliation, the UI quality gate, local verification, the final cross-model review, ship |
| closeout.md | the closeout record, §12 filled at gate time |

## Global Constraints

- No visible severity word on any wizard card; no em dash in any new user-visible string (spec §11, `tests/styles/_metaEmDashCopy.test.ts`).
- Every new interactive element is ≥ 44px tall by rect (`min-h-tap-min`, `--spacing-tap-min: 44px`, `app/globals.css:224`), except the icon link, whose floor is its host row (§13).
- Copy is verbatim from spec §11; apostrophes follow the host file (Builder's call D7): ASCII `'` in `DataQualityWarningControls.tsx` and `BulkIgnoreControls.tsx`, `&rsquo;` in `UseRawControl.tsx` JSX, `’` in `archivedTabOffer.tsx`. Copy assertions are apostrophe-agnostic (precedent `tests/components/step3SheetCard.test.tsx:491`).
- Named values have one definition (§20): `SHEET_SAYS_CAP = 160`, `WE_READ_NAMES_CAP = 6`, `CASE_PREVIEWS_CAP = 3`, `CASE_PREVIEW_CHARS = 40` in lib/admin/warningReadingDisplay.ts; `ARCHIVED_TAB_INCLUDE_LABEL = "Use this pull sheet"`, `ARCHIVED_TAB_INCLUDE_PENDING = "Including…"` in `components/admin/wizard/archivedTabOffer.tsx`. Tests import these for inputs and set logic; a cap's BOUNDARY rows instead pin the constant once to its spec value (`expect(SHEET_SAYS_CAP).toBe(160)`) and write each expected string as a literal derived from the fixture, never from the helper under test (plan round 4), so a drifted constant or an off-by-one cut fails rather than moving the boundary with it.
- Set sizes and memberships in tests derive from the named sets (`AMBIGUITY_CODES`, `USE_RAW_CODES`, `HOTEL_RESERVATION_JUDGMENT_CODES`); a stated size is pinned once against its spec count (`HOTEL_RESERVATION_JUDGMENT_CODES.size === 4`). Cap boundaries follow the bullet above.
- Invariant 5: no code string renders; `callUseRawAction` returns `"ok" | "failed"`.
- Invariant 10: no new `"use server"` file or export, no new route, no inline server action (spec §10, R10). components/admin/useRawDraft.tsx is `"use client"`. `tests/log/_metaMutationSurfaceObservability.test.ts` is re-run in Task 20 to confirm.
- Invariant 2: each Save runs two existing endpoints one after the other from the client; no lock nests.
- Invariant 1 and 6: one task, one commit, conventional-commit message, and **every commit leaves the full suite green**. A task whose edits move a registry (count-keyed or line-keyed) reconciles it in its OWN commit, in a Reconcile step before the commit ("Registry reconciliation per task" below), and its green command runs the full walker set, the six line-keyed census suites included. No suite is expected red between tasks.
- Heavy phases: any full-suite vitest, non-interactive Playwright, or build runs as `pnpm heavy <cmd>` (outermost only). Scoped vitest with explicit files runs unwrapped.
- New `.tsx` test files never quote the sheet icon's accessible-name phrase verbatim (it is counted repo-wide by `tests/components/admin/sheetIconLinkContainment.test.ts:46`); they assert the `aria-label` CONTAINS the card title.
- New jsdom suites start with `// @vitest-environment jsdom`.
- No file under `docs/superpowers/specs/` dated before 2026-10-26 is edited except the two §9 lockstep files.

## Review Focus

1. **Inline guest names on the warning vs on the reservation.** `readAs.names` is `row.names` at `lib/parser/blocks/hotels.ts:933`; if any later step rewrites the reservation's names, "We read" would show names the Hotels section does not. Pinned in Task 1 by asserting `readAs.names` deep-equals `hotels[blockRef.index].names` on every producing exit, derived from the parse output, never a literal.
2. **A warning persisted before this change** (spec L5): two different legacy shapes, which must not be conflated. An inline guest-split warning with `resolution: { resolvable: false, reason: "raw-not-guest-scoped" }` but no `readAs` still shows a reading: `readingShown` is TRUE when its `rawSnippet` is non-blank (§5.6), the card shows Sheet says and no We read line, and the callout reads `See how we read it` (Task 4 row `rawSnippet: "Hyatt Eric"`; Task 10 legacy case). A use-raw warning with NO `resolution` at all derives `legacy-unavailable`: `readingShown` is false and the callout keeps `Review in Sheet warnings` (Task 4 legacy row; Task 16 callout case). A venue warning with no `sourceCell` stays link-less until its next scan.
3. **A refreshed reading that differs from what this tab sent** (another tab saved in between): the refreshed value wins and nothing resurrects "Not saved yet". Pinned in Task 14 by deferred-response sequences 4, 5 and 13.
4. **An archived tab whose include is pressed in Pack list while the card's own include is pending**: two independent flags; the later POST takes the existing 409 refresh path. Pinned in Task 14's §14.1 re-assertion (compound transition 3: two placements, two POSTs, each observed as its own request) on top of Task 13's row-lock case.
5. **A `blockRef.index` that is `NaN`, negative, non-integer or ≥ the rendered hotel count**: no reservation marker and the card jump falls back to `Go to Hotels`. Pinned in Task 16 (marker) and Task 17 (jump) with one case per bad value.

## Acceptance criteria

Derived from the spec's ratified decisions (§1.1) and its two mandatory inventories; each is claimed by the `ac=` field of the task markers in the task files.

- AC-1 — no wizard card shows a severity word; needs-a-look, judgment and info rows are told apart by chip, dot, tag and sr-only prefix; the published card carries the tag for judgment codes (R1, B2) (discharged by Task 7, Task 8 and Task 9)
- AC-2 — the warning sheet link is the shared icon at the end of the wizard title row and of the compact card message row, on every warning-card surface (R2, R11) (discharged by Task 6, Task 7 and Task 9)
- AC-3 — Venue with no address links the empty value cell when one is uniquely found, else the venue region, and never gets a section jump (R3, R4) (discharged by Task 2 and Task 17)
- AC-4 — the inline hotel guest split shows Sheet says and We read; the reservation carries the tag, a Sheet says line and a jump to its card, and the card jumps back (R5) (discharged by Task 1, Task 4, Task 10 and Task 16)
- AC-5 — judgment rows read Accept; the reading choice waits for Save, Save persists the reading and accepts the card, Cancel restores it, on both surfaces (R6) (discharged by Task 11, Task 14 and Task 15)
- AC-6 — the archived pull sheet card shows tab and case previews, the one `Use this pull sheet` include, keeps Ignore as keep-skipped, jumps to Pack list, and its help names Pack list (R7, R13) (discharged by Task 3, Task 5 and Task 13)
- AC-7 — every staged-wizard warn card whose warning routes to a rendered section gets one Go to jump (R8) (discharged by Task 17)
- AC-8 — accepted judgment rows sit in their own Accepted (N) disclosure on both surfaces; counts and the ignore store are unchanged (R12) (discharged by Task 12)
- AC-9 — the three helpfulContext rows land in all six lockstep places in one commit (spec §9) (discharged by Task 5)
- AC-10 — no new mutation surface; every write reuses a registered action or route (R10) (discharged by Task 20)
- AC-11 — the §13 Dimensional Invariants hold in a real browser and every §14 / §14.1 transition is reached or proven unreachable (discharged by Task 7, Task 9 and Task 14)

## Meta-test inventory

EXTENDS (a registry row or a new case lands in the named task):

- `tests/messages/_metaWarningCardCopy.test.ts` — §9 rows; new case "no `AMBIGUITY_CODES` member's `controlsNote` mentions Ignore" (Task 5).
- `tests/cross-cutting/codes.test.ts` (x1 catalog parity) — exercised by the §9 lockstep (Task 5).
- `tests/components/admin/sheetIconLinkContainment.test.ts` — its render-site counts (`EXPECTED` at `tests/components/admin/sheetIconLinkContainment.test.ts:46`, the builder-token counts at `tests/components/admin/sheetIconLinkContainment.test.ts:1111`, the icon-anchor counts at `tests/components/admin/sheetIconLinkContainment.test.ts:1266`) move with each new `SheetIconLink` call site (Tasks 7, 9).
- `tests/styles/_metaNewTabAnnouncement.test.ts` — three `NewTabHint` text links leave, two `SheetIconLink` sites arrive (Tasks 7, 9).
- `tests/styles/noBareRingOffset.test.ts` — re-run; `BACKDROP_SKIN` registration (`tests/styles/noBareRingOffset.test.ts:28`) covers the two new keys (Task 6).
- `tests/components/admin/attentionMarkParity.test.ts` — re-run; `JudgmentCallTag` routes its ring through `attentionMarkClass("judgment", "sunken")`, so no exemption row (Task 7).
- `tests/ci/_metaSpecRegistration.test.ts` via `tests/e2e/standalone-baseline.json` — every task adding Playwright tests regenerates the baseline (Tasks 7, 9, 13, 15, 16, 17).
- Line-keyed censuses, reconciled by each task that moves a row (per-task table below) and re-verified whole-tree by Task 18: `tests/styles/tapTargetCensus.ts`, `tests/styles/forcedColorsCensus.ts` (its `site:` keys), `tests/styles/controlOutlineScan.ts`, `tests/styles/subtleInteractiveExemptions.ts`, `tests/styles/_metaControlOutlineResidue.test.ts` (its inline `RESIDUE_CENSUS`), `tests/help/_metaRenderFaultMarking.test.ts` (`REPORTED_RESIDUE`).

- `tests/admin/no-inline-email-normalization.test.ts` — scans every `lib/drive` and `lib/sync` file (`tests/admin/no-inline-email-normalization.test.ts:95-96`) and rejects unexempted `.trim()` / `.toLowerCase()`. Task 2's new lib/drive/venueAddressAnchor.ts uses `/\S/` and `resolveAlias` instead, so it needs no `canonicalize-exempt:` line; the suite is in Task 2's green command.

CREATES: none. No new registry-style meta-test: every new surface reuses an enrolled one.

### Walker cover (every new file is scanned by existing walking guards)

Every file this plan creates is scanned by guards that walk the tree. The cover is DERIVED, not listed: a DB-free test file is in it when its import closure (over `tests/**` and `lib/**`) reaches a filesystem walk (`readdirSync`, `globSync`, `opendirSync`, `git ls-files`, `walkSourceFiles(`). Derivation script (save to the session scratchpad as `walker-cover.py`; run from the worktree root):

```python
import os,re,subprocess,sys
out_path=sys.argv[1]
tracked=set(subprocess.run(["git","ls-files"],capture_output=True,text=True).stdout.split())
WALK=re.compile(r"readdirSync|globSync|opendirSync|[\"']ls-files[\"']|walkSourceFiles\(")
IMP=re.compile(r"(?:from|import)\s*\(?\s*[\"']([^\"']+)[\"']")
EXTS=[".ts",".tsx",".mjs",".js","/index.ts","/index.tsx"]
def resolve(src,spec):
    if spec.startswith("@/"): base=spec[2:]
    elif spec.startswith("."): base=os.path.normpath(os.path.join(os.path.dirname(src),spec))
    else: return None
    for e in [""]+EXTS:
        if base+e in tracked: return base+e
    return None
memo={}
def walks(p,seen):
    if p in memo: return memo[p]
    if p in seen: return False
    seen.add(p)
    if not (p.startswith("tests/") or p.startswith("lib/")): memo[p]=False; return False
    s=open(p,errors="ignore").read()
    r=bool(WALK.search(s)) or any(walks(q,seen) for q in (resolve(p,m) for m in IMP.findall(s)) if q)
    memo[p]=r; return r
tests=sorted(p for p in tracked if re.search(r"^tests/.*\.test\.tsx?$",p) and not p.endswith(".db.test.ts") and "realdb" not in p)
cover=[t for t in tests if walks(t,set())]
open(out_path,"w").write("\n".join(cover)+"\n")
```

Run as `git add <the task's new files> && python3 "$SCRATCH/walker-cover.py" "$SCRATCH/walker-cover.txt" && pnpm heavy pnpm exec vitest run $(cat "$SCRATCH/walker-cover.txt")`, re-derived each time (earlier tasks add test files). **Stage new files first:** `tests/admin/_metaInfraEmitCover.test.ts` asserts its filesystem walk agrees with `git ls-files`, so an untracked new file fails its premise (measured below). Measured 2026-10-26: 294 walker suites, the six line-keyed census suites among them (so the derivation reaches helper-module walks). Baseline on the plan commit: green (the 286 non-census suites `270 passed | 2 skipped` in 404s; the two `tests/e2e` vitest suites and the six census suites in separate green runs), DB-free.

**New-file probe, run at plan time.** The four new source files, written in their planned shape (Task 2's module with its planned imports and rule, Task 4's module with its planned imports, `JudgmentCallTag` with spec §3.3's markup verbatim, useRawDraft.tsx with both action imports), untracked, then the full 294-suite walker set: `3 failed | 275 passed | 2 skipped (280 files)`. The three, and who owns each: `tests/components/admin/sheetIconLinkContainment.test.ts` builder census wants a new row `"lib/drive/venueAddressAnchor.ts": 1` (Task 2 adds it); `tests/components/_metaOrphanedComponents.test.ts` reports JudgmentCallTag.tsx and useRawDraft.tsx until something imports them (Tasks 7 and 14 wire them in the same commit that creates them, so no allowlist row); `tests/admin/_metaInfraEmitCover.test.ts` failed its walk-versus-git premise for the untracked `lib/admin` file (staging, above). No census suite reported a new element from the four files. Probe files deleted; the worktree held only `docs/` changes afterwards.

Not applicable, with reason: Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`) — no new Supabase call (§10). Sentinel hiding (`tests/components/tiles/_metaSentinelHidingContract.test.ts`) — no crew tile changes. Admin-alert catalog — no admin alert. Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no lock surface; each endpoint keeps its own single holder. Mutation-surface registry (`tests/log/_auditableMutations.ts`) — no new surface (R10); exercised, not extended.

## Registry reconciliation (run at plan time)

Measured 2026-10-26 on the branch tip by a throwaway `tsx` script importing each registry.

| Registry | Now | After | Moved by |
|---|---|---|---|
| `LINK_ONLY_ANCHORED` size (`lib/drive/showDayTimeAnchors.ts:65`) | 13 | 14 (`VENUE_ADDRESS_MISSING`) | Task 2 |
| `KIND_TO_SECTION` keys (`lib/admin/step3SectionStatus.ts:28`) | 22 | 23 (`pull_sheet_archived_tab`) | Task 3 |
| `AMBIGUITY_CODES` size | 7 | 7 | none |
| `AMBIGUITY_CODES` members with a `controlsNote` | `[]` | `[]` (new guard keeps it so) | none |
| `EXPECTED_HELPFUL_CONTEXT` keys (`tests/messages/warningCardCopyRegistry.ts`) | 49 | 49 (three values change) | Task 5 |
| `MESSAGE_CATALOG` / `SPEC_CODES` keys | unchanged | unchanged | none (no new code) |
| `USE_RAW_CODES` (today `IN_SCOPE`, `components/admin/UseRawControl.tsx:55`) | 4 | 4, moved to lib/admin/warningReadingDisplay.ts | Task 4 |

## Pre-draft code-verification pass

Run 2026-10-26 on the branch tip (`f9fe5c0ec`), `grep -c -F <symbol> <file>` per row; every count ≥ 1, no MISSING. Abridged to the symbols tasks name:

```
1  lib/parser/ambiguityCodes.ts :: export function isAmbiguityCode
1  components/admin/SheetIconLink.tsx :: export function SheetIconLink
3  components/admin/SheetIconLink.tsx :: BACKDROP_SKIN
1  lib/messages/collapsedSummary.ts :: export function stripEmphasis
1  components/admin/wizard/step3ReviewSections.tsx :: function WarningsBreakdown
1  components/admin/wizard/step3ReviewSections.tsx :: -warning-${i}-open
1  components/admin/wizard/step3ReviewSections.tsx :: function HotelsBreakdown
1  components/admin/wizard/step3ReviewSections.tsx :: function HotelCard
1  components/admin/wizard/step3ReviewSections.tsx :: function SectionFlagCallout
3  components/admin/wizard/step3ReviewSections.tsx :: HOTELS_CAP   (exported, :192)
2  components/admin/review/ShowReviewSurface.tsx :: jumpToRoom
5  components/admin/review/ShowReviewSurface.tsx :: jumpToWarning
13 components/admin/review/ShowReviewSurface.tsx :: handleNavClick
1  components/admin/UseRawControl.tsx :: export function deriveUseRawControlState
2  components/admin/UseRawControl.tsx :: IN_SCOPE
1  components/admin/UseRawControl.tsx :: function ChoiceRow
1  components/admin/DataQualityWarningControls.tsx :: export function DataQualityWarningControls
1  components/admin/BulkIgnoreControls.tsx :: export function BulkIgnoreControls
1  components/admin/CompactAlertCard.tsx :: compact-alert-message
2  components/admin/PerShowActionableWarnings.tsx :: linkOffsetClass
1  components/admin/NoteWarningCard.tsx :: note-warning-sheet-link
4  components/admin/showpage/sectionWarningExtras.tsx :: SectionWarningItemControls
1  components/admin/wizard/archivedTabOffer.tsx :: deriveArchivedOffers
3  components/admin/wizard/archivedTabOffer.tsx :: postPullSheetOverride
1  components/admin/review/PublishedArchivedTabOffer.tsx :: Include this gear
1  lib/admin/step3SectionStatus.ts :: export function sectionForWarning
1  lib/drive/showDayTimeAnchors.ts :: export function attachSourceCellAnchors
2  lib/drive/unknownFieldAnchors.ts :: resolveUnknownFieldCell
1  lib/parser/warnings.ts :: emitInlineHotelGuestAmbiguity
1  lib/dataQuality/ignorableSnippet.ts :: export function normalizeSnippet (2 matches incl. use)
1  components/admin/review/attentionMark.ts :: export function attentionMarkClass
1  lib/sheet-links/buildSheetDeepLink.ts :: export const REGION_ANCHOR_SPEC
1  lib/sheet-links/buildSheetDeepLink.ts :: export const SOURCE_LINK_ALLOWLIST
1  lib/drive/exportSheetToMarkdown.ts :: export function synthesizeBlocksFromXlsx
1  lib/drive/showDayTimeAnchors.ts :: export type WarningAnchorSources
1  lib/sync/attachWarningAnchors.ts :: export async function attachWarningAnchors
```

Test paths, harnesses and scripts each confirmed present with `test -e` (43 paths, 0 missing), including `tests/e2e/standalone.config.ts`, `tests/e2e/_step3ReviewModalHarness.tsx`, `tests/e2e/_step3ReviewModalBundle.mjs`, `tests/e2e/_compactAlertCardLiveEntry.tsx`, `tests/e2e/helpers/liveEntryToolchain.ts`, `scripts/check-standalone-baseline.mjs`, `tests/_shared/premise.ts`.

**Strict-TS snippet probe (plan round 1 repair).** Every fenced code block in this unit was extracted and checked: the seven `ts`/`tsx` blocks (Task 1 loop, Task 5 guard, Task 7 stub, Task 10 render, Task 13 props, Task 14 interfaces, Task 14 stub; re-run after plan round 2) each written to a scratch file that imports the real modules, compiled by `pnpm exec tsc -p <scratch tsconfig extending tsconfig.json>` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), with one path override mapping `@/lib/admin/warningReadingDisplay` to a declaration stub of Task 4's Interfaces (the module does not exist before Task 4): exit 0. Negative controls in the same configuration: the round-1 shapes (`messageFor` over a `Set<string>`, an unguarded `arr[0]`) produced `TS2345` and `TS2532`, and the round-2 shape (a `ReactElement` stub returning `null`) produced `TS2322`, so the probe discriminates. Every stub-first step (Tasks 2, 4, 7, 13, 14) declares its return type: the lib stubs return `null` or `false` into `T | null` / `boolean`, `ArchivedTabIncludeButton` / `ArchivedTabWarningActions` are declared `ReactElement | null`, and the two `ReactElement` stubs (`JudgmentCallTag`, `UseRawDraftProvider`) return elements. The `js` census script passed `node --check`, the `python` walker-cover script `py_compile`. Earlier, every signature the tasks introduce (the `readAs` variant, the venue anchor pair, `CompactAlertCard.sheetLink`, `JudgmentCallTag` props, the archived props, the lock props, `UseRawSurface`, `callUseRawAction`, `UseRawDraftValue`, `offersReadingChoice`) compiled the same way. Scratch removed.

**Plan-time probes** (throwaway `node --import tsx` scripts, removed):

- Venue anchors on every committed workbook. `VENUE_ADDRESS_MISSING` fires on `fintech.xlsx`, `rpas.xlsx`, `fixed-income.xlsx`, all the 3-column scope layout (`| VENUE | VENUE NAME | Kimpton Gray |` / `|  | VENUE ADDRESS |  |`), which the UNKNOWN_FIELD scan cannot see (blank col 0, `lib/drive/unknownFieldAnchors.ts:81`). The spec's R14 venue-block rule (§4.2 item 3), run as a throwaway script over all seven workbooks: the three emitting workbooks each resolve to `INFO!C14`; `east-coast.xlsx` (the only 2-column block, `INFO!A8` `Hotel Address`) with `INFO!B8` deleted resolves to `INFO!B8` and then emits the warning once; unedited east-coast, `ria.xlsx`, `consultants.xlsx`, `redefining-fi.xlsx` each have one address row with a value, resolve to `null`, and emit nothing. Task 2 tests exactly these shapes.
- `esbuild` `alias` on an `@/app/admin/onboarding/_actions/useRawStaged` specifier substitutes the stub module in a bundle (`ALIAS-OK`), so the Save-flow live entry can stub both staged actions (Task 15).
- Token contrast from `app/globals.css` (light / dark): `surface` vs `warning-bg` 1.103 / 1.347; `surface` vs `surface-sunken` 1.109 / 1.092; `text` on `warning-bg` 15.60 / 10.64; `text-subtle` on `info-bg` 5.79 / 5.89. Matches §3.6.

## Plan-time sweeps (authored AND run; per-hit dispositions)

### S1. Line-keyed census rows pointing into files this arc edits

Command (script kept at the arc's scratchpad; reproduced in full in Task 18 so the executor re-runs the same derivation): walk every `tests/**/*.ts(x)` file, match `file: "<touched>", … line: N` and `"<touched>:N"` keys for the 14 touched component files, print the live source text at that line.

Output 2026-10-26 (`TOTAL 30`):

```
tests/help/_metaRenderFaultMarking.test.ts | UseRawControl.tsx:428 | if (state === "legacy-unavailable") {
tests/styles/_metaControlOutlineResidue.test.ts | step3ReviewSections.tsx:2500 | <span className="shrink-0 rounded-pill border border-border bg-surface
tests/styles/controlOutlineScan.ts | ShowReviewSurface.tsx:1025 | <button
tests/styles/controlOutlineScan.ts | ShowReviewSurface.tsx:844 | <button
tests/styles/controlOutlineScan.ts | Step3ReviewModal.tsx:894 | <button
tests/styles/controlOutlineScan.ts | Step3ReviewModal.tsx:980 | <button
tests/styles/controlOutlineScan.ts | step3ReviewSections.tsx:4975 | <button
tests/styles/controlOutlineScan.ts | step3ReviewSections.tsx:5057 | <button
tests/styles/forcedColorsCensus.ts | PerShowActionableWarnings.tsx:458 | <a
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:1025 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:811 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:825 | <extra.Icon
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:829 | <span
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:844 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:932 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:945 | <s.Icon
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:951 | <span
tests/styles/forcedColorsCensus.ts | Step3ReviewModal.tsx:590 | <button
tests/styles/forcedColorsCensus.ts | Step3ReviewModal.tsx:662 | <span
tests/styles/forcedColorsCensus.ts | Step3ReviewModal.tsx:729 | <ChevronDown
tests/styles/forcedColorsCensus.ts | UseRawControl.tsx:329 | <button
tests/styles/forcedColorsCensus.ts | UseRawControl.tsx:355 | <span
tests/styles/forcedColorsCensus.ts | UseRawControl.tsx:367 | <span className={`text-xs font-semibold ${checked ? "text-text-strong"
tests/styles/subtleInteractiveExemptions.ts | sectionWarningExtras.tsx:285 | <summary
tests/styles/subtleInteractiveExemptions.ts | step3ReviewSections.tsx:1692 | <summary className="flex min-h-tap-min cursor-pointer list-none items-
tests/styles/subtleInteractiveExemptions.ts | step3ReviewSections.tsx:3511 | <summary
tests/styles/tapTargetCensus.ts | DataQualityWarningControls.tsx:239 | <button
tests/styles/tapTargetCensus.ts | SheetIconLink.tsx:91 | <a
tests/styles/tapTargetCensus.ts | Step3ReviewModal.tsx:1084 | <input
tests/styles/tapTargetCensus.ts | step3ReviewSections.tsx:4375 | <a
```

Dispositions (applied by the task whose edit moves the row, by element identity, never by line arithmetic; Task 18 re-verifies the whole tree):

- `forcedColorsCensus.ts` `PerShowActionableWarnings.tsx:458` `<a` — **DELETE** (the text link is removed in Task 9; spec §16.3).
- `Step3ReviewModal.tsx` rows (6) — **no change expected**: no task edits `Step3ReviewModal.tsx`. Task 18 re-runs the sweep; a Step3ReviewModal row that moved is a defect to investigate, not a re-key.
- Every other row (23) — **RE-KEY**: same element, new line, located by its tag + class string on the final tree.
- **ADD**: the task that adds an element adds its row, only when a scanner reports it as new and unprovable (expected candidates: the Accepted `<summary>` on both surfaces in `subtleInteractiveExemptions.ts`, per §16.3). Each added row's reason is copied from its Ignored twin.

The baseline run of all ten census and count-pin suites on this tip was green (`10 passed, 644 tests`), so any red after Task 18 is this arc's.

**Two registries §16.3 does not list, found by this sweep:** `tests/help/_metaRenderFaultMarking.test.ts` (`UseRawControl.tsx:428`, edited by Tasks 4, 10, 14) and the inline census in `tests/styles/_metaControlOutlineResidue.test.ts` (`step3ReviewSections.tsx:2500`, shifted by Tasks 7, 8, 12, 13, 16, 17). Both are reconciled per task (table below).

### S1b. Registry reconciliation per task (derived: S1 rows in the files each task edits, plus the count registries keyed by those files and the new-file probe)

Every task's **Reconcile** step, before its commit: stage the task's files, run the full walker set (the walker-cover command above, censuses included), and for each red registry update the rows FROM THE OBSERVED OUTPUT. Procedure (house form; there is no census update script): locate the SAME element on the edited tree by its tag plus its class string or testid, confirm the row's stated reason still describes it, change only its `line` / `site` coordinate, and append a one-line provenance comment ("<old> -> <new> on feat/warning-card-fixes Task N; located by its own element"), as `tests/styles/controlOutlineScan.ts:168-178`, `tests/styles/tapTargetCensus.ts:221-225` and `tests/help/_metaRenderFaultMarking.test.ts:46-50` do; never add a delta to a retyped number. Count registries take the count the suite reports, only when the change is the one this table names; any other movement stops the task. Re-run after commit hooks (prettier can move lines) and amend nothing: a post-hook fix is a new commit of the same task.

| Task | Files it edits that a census keys | Line-keyed rows it can move (S1) | Count-keyed rows it moves |
|---|---|---|---|
| 1 | none | 0 | 0 |
| 2 | none | 0 | 1 ADD: builder census `"lib/drive/venueAddressAnchor.ts": 1` (`tests/components/admin/sheetIconLinkContainment.test.ts:1093`, probed) |
| 3 | none | 0 | 0 |
| 4 | `UseRawControl.tsx` | 4: render-fault line 433; forced-colors line 334, line 360, line 372 | 0 |
| 5 | none | 0 | 0 |
| 6 | `SheetIconLink.tsx` | 1: tap-target line 91 | 0 (phrase count 2 and icon-anchor count 1 unchanged) |
| 7 | `step3ReviewSections.tsx` | 6: residue line 2500; control-outline line 4975, line 5057; subtle line 1692, line 3511; tap-target line 4375 | 0 (the file's phrase 1, builder 8, `sheetHref` 7 and icon-anchor 4 counts and its adopter row are unchanged: the href is rebuilt in the title row, and the deleted link was a text anchor) |
| 8 | `step3ReviewSections.tsx` | 6 (same rows) | 0 |
| 9 | `PerShowActionableWarnings.tsx` | 1 DELETE: forced-colors `PerShowActionableWarnings.tsx:458` (the text link leaves) | 1 ADD: adopter set `components/admin/CompactAlertCard.tsx` (`tests/components/admin/sheetIconLinkContainment.test.ts:2166`) |
| 10 | `UseRawControl.tsx` | 4 (as Task 4) | 0 |
| 11 | `DataQualityWarningControls.tsx` | 1: tap-target line 239 | 0 |
| 12 | `step3ReviewSections.tsx`, `sectionWarningExtras.tsx` | 7: the six of Task 7, subtle `sectionWarningExtras.tsx:285`; 2 ADD: subtle rows for the Accepted `<summary>` on both surfaces (spec §16.3) | 0 |
| 13 | `step3ReviewSections.tsx`, `DataQualityWarningControls.tsx` | 7: the six, tap-target line 239; ADD only if a scanner reports the include button | 0 |
| 14 | `UseRawControl.tsx`, `DataQualityWarningControls.tsx` | 5: the four of Task 4, tap-target line 239; ADD only if a scanner reports the Cancel button | 0 |
| 15 | `step3ReviewSections.tsx`, `sectionWarningExtras.tsx` | 7 (as Task 12, minus its ADDs) | 0 |
| 16 | `step3ReviewSections.tsx` | 6 | 0 |
| 17 | `step3ReviewSections.tsx`, `ShowReviewSurface.tsx` | 16: the six, control-outline `ShowReviewSurface.tsx:844` and line 1025, forced-colors line 811, line 825, line 829, line 844, line 932, line 945, line 951, line 1025 | 0 |

The line-keyed column is the CEILING (every row in a file the task edits); the suites report which of them actually moved. Totals: 70 possible re-keys (ceiling), 1 delete and 2 to 4 adds line-keyed; 2 count-keyed rows. Every task (1 to 17) runs the walker set in its Reconcile step, before its commit; tasks that create files stage them first. `Step3ReviewModal.tsx` rows: none, since no task edits it.

### S2. Tests pinning what this arc removes or renames

Command: `grep -rlE "warning-[^\"']*-open|Open in Sheet" tests` plus `grep -rnE 'toContain\("(warn|info)"\)' tests`, then each hit read.

| Hit | Disposition |
|---|---|
| `tests/components/step3SheetCard.test.tsx:690` and lines 758, 766, 784, 1162, 1165 (`…-warning-N-open`) | Task 7: testid becomes `…-sheetlink`; assertions keep the href checks |
| `tests/components/admin/parsePanelComposition.test.tsx:103-105` (`textContent` contains `info` / `warn`) | Task 8: replaced by the row-kind assertions (chip glyph, dot, tag, sr prefix) |
| `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/components/admin/sheetWarningsPanel.test.tsx`, `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx` (warning text link) | Task 9 (published) and Task 7 (wizard row in `newTabAnnouncementBehavior`) |
| `tests/parser/parseWarningDeepLinkRender.test.tsx` | Task 2 (membership pin) and Task 7 (wizard link render, if it reads the wizard testid) |
| `tests/admin/attentionClearingKind.test.ts`, `tests/admin/bellFeed.test.ts`, `tests/adminAlerts/alertActions.test.ts`, `tests/components/admin/review/attentionBanner.test.tsx`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx`, `tests/components/bellPanelRedesign.test.tsx`, `tests/dev/fullSplitComposite.test.ts`, `tests/e2e/_compactAlertCardLiveEntry.tsx`, `tests/e2e/_pillFocusLiveEntry.tsx`, `tests/components/shared/newTabHint.test.tsx` | **No change**: alert-action labels / `NewTabHint` unit, out of class (spec §2, B9) |
| `tests/drive/unknownFieldAnchors.test.ts:222` | comment only; no change |
| `tests/components/telemetry/activeFilterChips.test.tsx:49` | unrelated (`href` query); no change |
| Old include labels: `tests/components/admin/review/publishedArchivedTabOffer.test.tsx` (10), `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx` (6), `tests/components/admin/wizard/archivedTabOffer.render.test.tsx` (1) | Task 13 (R13) |
| `Gear section`: `lib/messages/catalog.ts`, generated spec codes, `tests/messages/warningCardCopyRegistry.ts`; `components/crew/icons/sectionIcons.tsx:122`, `tests/e2e/crew-page.spec.ts:885` | first three Task 5; the crew-page pair names the crew Gear section, out of class |
| `raw-not-guest-scoped` resolution equality: `tests/parser/blocks/hotels.inlineGuestAmbiguity.test.ts` (fires-once `it.each`) | Task 1 (now carries `readAs`); `tests/components/UseRawControl.test.tsx` renders the sentence, re-run in Task 10 |

### S3. Ignored-list fixtures holding judgment rows (spec §16.3 last bullet)

Command: `grep -rlE "ignored-summary|ignored-warnings|Ignored \(" tests`, then per file `grep -cE "<the seven AMBIGUITY_CODES>"`. 19 files; judgment codes appear in three:

| File | Disposition |
|---|---|
| `tests/components/admin/showpage/sectionWarningControls.test.tsx` (`tests/components/admin/showpage/sectionWarningControls.test.tsx:68` ROOM_HEADER, active list only; ignored assertions use `FIELD_UNREADABLE`) | re-run in Task 12; expected unchanged |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx:1902` (HOTEL_GUEST fixture) | re-run in Task 12; if it lands in an ignored partition, its expectation moves to `…-accepted-…` |
| `tests/helpers/publishedSurfaceProps.tsx:58` (Rooms factory makes ROOM_HEADER) | re-run consumers in Task 12; any consumer that ignores a Rooms-factory warning now finds it under Accepted |

The other 16 files carry no judgment code; no change.

## e2e harness-readiness checklist (applies to every Playwright task)

- **Boot:** standalone, no dev server, no Supabase. `test.beforeAll` (a) bundles a live entry: the wizard entry tests/e2e/_warningCardLiveEntry.tsx through `tests/e2e/_step3ReviewModalBundle.mjs` (the bundler already proven on the real `Step3ReviewModal` tree: empties node builtins, stubs `"use server"` modules), the compact-card entry `tests/e2e/_compactAlertCardLiveEntry.tsx` through `bundleLiveEntry` exactly as `tests/e2e/compact-alert-card-layout.spec.ts:64-71` does; (b) compiles real CSS with `compileEntryCss` over `app/globals.css` with explicit `@source` lines for every component file whose classes the spec measures (listed per task), because a static render of the default fixture does not contain the new classes; (c) serves the work dir over `node:http` on port 0 (`127.0.0.1`). Config: `tests/e2e/standalone.config.ts`, project `standalone-chromium`.
- **Readiness gate:** `page.goto(live.html?scenario=…)`, `await page.evaluate(() => document.fonts.ready)`, `await expect(<first fixture testid>).toBeVisible()`, then a CSS premise: a known padded element's computed padding is > 0 (real Tailwind emitted). Never `networkidle`.
- **Detach safety:** geometry reads use `page.evaluate` with `document.querySelector` and an explicit null check that throws a named error, never `locator.evaluate` on an element a step can unmount (the Save flow unmounts its row). Waits on unmount use `expect(locator).toHaveCount(0)`.
- **Registration:** the spec file name joins the `testMatch` alternation in `tests/e2e/standalone.config.ts:85`, and every task that adds or renames a Playwright test runs `node scripts/check-standalone-baseline.mjs --write` and commits `tests/e2e/standalone-baseline.json` in the same commit (the PR #977 failure, `3b1fd2fa0`). The standalone CI job (`.github/workflows/standalone-e2e.yml:71`) runs the whole config on every PR, so no path filter needs wiring.
- **Run:** `pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts <spec>`.

## Why the layout and transition-audit tasks are the implementing tasks

writing-plans requires a layout-dimensions task (§13) and a transition-audit task (§14, §14.1). Written after the code they measure, both would pass the moment they are authored, which the red-contract rejects. So the real-browser DI assertions are the RED of the two tasks that build the host rows (Task 7: wizard title row, DI-1 to DI-11; Task 9: compact card message row, DI-C1 to DI-C9), and the §14 transition audit with its deferred-response probe is the RED of the task that builds the reading model (Task 14), which also pastes and re-asserts §14.1 over the archived row Task 13 built. Each of those task bodies pastes its spec table verbatim.

## Round-5 re-analysis: fixture reachability and a state-machine oracle

Plan rounds 3, 4 and 5 all found the same vector (a planned test whose fixture cannot reach its claimed state, or whose expected value is not what the rules produce), so this section replaces per-instance patching with two mechanical checks.

**Fixture reachability.** Every fixture fact a test takes from EXISTING production code (parser output, anchors, emitted warnings, derived states, rendered counts) was run against the live tree with a `node --import tsx -e` probe from the worktree root; each probe's command and output sits inline beside its fixture: P-T1 (Task 1), P-T2a, P-T2b, P-T2c (Task 2), P-T4T5 (Tasks 4 and 5), P-T7 (Task 7, reused by Task 9), P-T10 (Task 10), P-T12 (Task 12), P-T13 (Task 13), P-T14 (Task 14), P-T15 (Task 15), P-T16 (Task 16): 13 probes, plus a scratch shim of `lib/parser/blocks/hotels.ts` for Task 1's names claim. Three fixtures did not reach their claim and were fixed: Task 16's cap fixture (five inline lines parse to ONE reservation; now the v4 five-slot block, which parses to four), Task 7's long-title row (an all-caps 120-character message falls back to the 42-character generic title; now a prose message, 120 characters), and Task 9's condensed long card (same title rule; same prose message). Facts that depend on code a task creates are not probed and say which task creates them (Task 2's anchor, Task 4's helpers, Task 13's wrapper, Task 14's provider).

**State-machine oracle.** A reference model of spec §6.3 rules 1-6 (draft, submitted, persisted; select, Save, reading ok or fail, accept ok or fail, reconcile, Cancel; the action bar's label, hint and soft-disable) and of §14.1 (include and Ignore locks) drove every numbered §14 sequence (1 to 13, both halves of 3 and of 12), the pairs whose reachability the plan asserts by a sequence (S → C, V → S, S → D, E → D twice) and every §14.1 compound transition (1 to 5) plus its four pair paths, comparing the model's state, displayed reading, main-button label, hint and soft-disable after each step with the plan's expectations. Script: oracle.mjs in the session scratchpad, at /private/tmp/claude-501/-Users-ericweiss-FX-Webpage-Template/9303137b-686f-4960-9915-a373f5b32f50/scratchpad/probes/oracle.mjs (session-local; its rules are §6.3 and §14.1 verbatim; the as-written variant beside it is oracle-as-written.mjs). Result on the plan as repaired: **30 sequences, 0 mismatches**. On the expectations as written before this round: 3 mismatches: Task 14 sequence 12 expected D (twice: state and `Save`) where rule 5 returns C, and the spec's E → D row claimed a select from E over D stays D where rule 1 returns C. Task 14 now uses a decision change that keeps `persistedRaw`, and the spec's E → C / E → D rows are amended (spec §14, §20 sweep note).

## Spec coverage: §14, §14.1 and every named boundary (derived, no empty cell)

Rows are derived from the spec text, never typed from memory. With the shell variable S set to `docs/superpowers/specs/2026-10-26-warning-card-fixes-design.md`:

```
sed -n '/^## 14\. /,/^### 14\.1 /p' $S | grep -cE '^\| \*\*[A-Z]\*\* '      # §14 states             -> 5
sed -n '/^## 14\. /,/^### 14\.1 /p' $S | grep -cE '^\| [A-Z] → '            # §14 pair rows          -> 18
sed -n '/^## 14\. /,/^### 14\.1 /p' $S | grep -cE '^[0-9]+\. \*\*'          # §14 sequences          -> 13
sed -n '/^### 14\.1 /,/^### 14\.2 /p' $S | grep -oE '\*\*[A-Z]\*\* [A-Za-z]' | wc -l   # §14.1 states -> 3
sed -n '/^### 14\.1 /,/^### 14\.2 /p' $S | grep -cE '^\| [A-Z] → '         # §14.1 pairs            -> 6
sed -n '/^### 14\.1 /,/^### 14\.2 /p' $S | grep -cE '^[0-9]+\. \*\*'       # §14.1 compounds        -> 5
sed -n '/^## 20\. /,$p' $S | grep -E '^\| ' | grep -vcE '^\| (Name|---)'      # §20 named values       -> 13
grep -cE '0 <= index|>= hotelCount|i < shown.length|cap\+1|more than three|at most|n > cap|n ≤ cap|longer than|0 →|1 →|`1 accepted.`|isSafeInteger' $S   # boundary lines -> 9
sed -n '/^Counts stated in prose/p' $S | grep -oE '(seven|six|five|four|three|two) ' | wc -l   # §20 prose counts -> 9
```

81 rows. Each names the task, the test (by its `it(...)` title or case label) and the new code path it goes through: the reading provider (P), the archived-row wrapper (W), the published bulk path (B), or the module or component named.

| # | Spec row | Task | Test that exercises it | Path |
|---|---|---|---|---|
| 1 | §14 state C | 14 | `§14 pair D → C`, `§14 pair V → C` (C asserted: persisted row checked, `Accept`) | P |
| 2 | §14 state D | 14 | `§14 pair C → D` (draft checked, `Save`, `Cancel`, `Not saved yet`) | P |
| 3 | §14 state S | 14 | `§14 pair C → S`, `§14 pair D → S` (`Accepting…` / `Saving…`, disabled, rows `aria-disabled`) | P |
| 4 | §14 state V | 14 | `§14 pair S → V` (submitted row checked, `Selected` marker, rows `aria-disabled`) | P |
| 5 | §14 state E | 14 | `§14 pair S → E` (`role="alert"` copy) | P |
| 6 | §14 pair C → D | 14 | `§14 pair C → D` | P |
| 7 | §14 pair D → C | 14 | `§14 pair D → C` (Cancel; select persisted; reconciliation), focus on main button | P |
| 8 | §14 pair C → S | 14 | `§14 pair C → S` | P |
| 9 | §14 pair S → C | 14 | `§14 pair S → C` (plain Accept, row stays) | P |
| 10 | §14 pair D → S | 14 | `§14 pair D → S` | P |
| 11 | §14 pair S → D (unreachable) | 14 | `§14 pair S → D` (select while busy changes nothing) | P |
| 12 | §14 pair C → V (unreachable) | 14 | `§14 pair C → V` (`submitted` never set from C) | P |
| 13 | §14 pair V → C | 14 | `§14 pair V → C` (reconciliation) | P |
| 14 | §14 pair D → V (only through S) | 14 | `§14 pair D → V` (no V without an S step) | P |
| 15 | §14 pair V → D (unreachable) | 14 | `§14 pair V → D` (rows `aria-disabled`) | P |
| 16 | §14 pair S → V | 14 | `§14 pair S → V` | P |
| 17 | §14 pair V → S | 14 | `§14 pair V → S` (accept retry) | P |
| 18 | §14 pairs C/D/V → E (only through S) | 14 | `§14 pair C/D/V → E` (no alert without an S step) | P |
| 19 | §14 pair S → E | 14 | `§14 pair S → E` (failed Save; failed accept) | P |
| 20 | §14 pair E → C | 14 | `§14 pair E → C` (Cancel from E over D; selecting the persisted reading from E over D; reconciliation from E over V) | P |
| 21 | §14 pair E → D | 14 | `§14 pair E → D` (from E over C only, per the amended spec row) | P |
| 22 | §14 pair E → S | 14 | `§14 pair E → S` | P |
| 23 | §14 pair E → V (unreachable directly) | 14 | `§14 pair E → V` | P |
| 24 | §14 seq 1 full success, delayed refresh | 14 | `§14 seq 1` (checked `r` after reading ok, after accept ok, during delayed refresh) | P |
| 25 | §14 seq 2 accept fails after the reading saved | 14 | `§14 seq 2` | P |
| 26 | §14 seq 3 retained rows | 14 | `§14 seq 3` (`mode="ignored"`: `Reading saved.`, no accept request) | P |
| 27 | §14 seq 4 select back, then an external save | 14 | `§14 seq 4` (no `Save` after the external change) | P |
| 28 | §14 seq 5 failed save, refresh equals draft, external revert | 14 | `§14 seq 5` | P |
| 29 | §14 seq 6 refresh during D, `P` unchanged | 14 | `§14 seq 6` | P |
| 30 | §14 seq 7 select attempted during V | 14 | `§14 seq 7` | P |
| 31 | §14 seq 8 warning disappears during D or V | 14 | `§14 seq 8: the row unmounting during D or V writes nothing more` | P |
| 32 | §14 seq 9 Report modal opened during D | 14 | `§14 seq 9: opening Report during D keeps the draft` | P |
| 33 | §14 seq 10 modal closes during S | 14 | `§14 seq 10: closing the modal during S lets the in-flight request complete` (accept continuation unasserted, ambiguity 8) | P |
| 34 | §14 seq 11 published bulk accept during D | 15 | `§14 seq 11: a published bulk accept during D drops the unsaved draft` | B + P |
| 35 | §14 seq 12 pending-apply note during D or V | 14 | `§14 seq 12: the pending-apply note follows persisted state only` (D: `apply-pending` to `raw-active` keeps `persistedRaw`, stays D, note gone; V: Accepted list, note stays until `clear-pending` reconciles to C) | P |
| 36 | §14 seq 13 refresh lands without moving `P` | 14 | `§14 seq 13` (stays V, rows `aria-disabled`, then C on the next change) | P |
| 37 | §14.1 state I | 13, 14 | `§14.1 row lock` (both enabled before any press); `§14.1 pair N → I` | W |
| 38 | §14.1 state N | 13, 14 | `§14.1 row lock` (include `Including…`, Ignore disabled, Report enabled); `§14.1 pair I → N` | W |
| 39 | §14.1 state G | 13, 14 | `§14.1 row lock` (include disabled with idle label); `§14.1 pair I → G` | W |
| 40 | §14.1 pair I → N | 14 | `§14.1 pair I → N` | W |
| 41 | §14.1 pair N → I | 14 | `§14.1 pair N → I` (failure; success re-enables before refresh) | W |
| 42 | §14.1 pair I → G | 14 | `§14.1 pair I → G` | W |
| 43 | §14.1 pair G → I | 14 | `§14.1 pair G → I` | W |
| 44 | §14.1 pair N → G (unreachable) | 13, 14 | `§14.1 row lock` (Ignore click sends 0 requests during N); `§14.1 pair N → G` | W |
| 45 | §14.1 pair G → N (unreachable) | 13, 14 | `§14.1 row lock` (include click sends no `fetch` during G); `§14.1 pair G → N` | W |
| 46 | §14.1 c1 include succeeds, refresh not landed | 14 | `§14.1 c1` | W |
| 47 | §14.1 c2 Ignore succeeds, refresh not landed | 13 | `§14.1 c2: an archived Ignore success hands focus to the panel before the refresh` | W |
| 48 | §14.1 c3 same tab included from another placement during N | 14 | `§14.1 c3` (two POSTs, each its own request, asserted by URL) | W |
| 49 | §14.1 c4 Report opened during N or G | 13 | `§14.1 c4: Report stays usable during N and G and unmounts with the row` | W |
| 50 | §14.1 c5 `ArchivedTabOffer` during an include | 13 | case 5, shared pending (`Keep skipped` disabled for the whole request) | `ArchivedTabOffer` via `ArchivedTabIncludeButton` |
| 51 | §20 `SHEET_SAYS_CAP` 160 | 4, 10 | `B-SHEET` rows 159 / 160 / 160+`y`; Task 10 render of 160+`y` | module; `UseRawControl` |
| 52 | §20 `WE_READ_NAMES_CAP` 6 | 4, 10 | `B-NAMES` rows 5 / 6 / 7 names; Task 10 render of 7 names | module; `UseRawControl` |
| 53 | §20 `CASE_PREVIEWS_CAP` 3 | 4, 13 | `B-CASES` rows 2 / 3 / 4 / 5 previews; Task 13 case 1 card with 3 and 4 previews (literals) | module; W |
| 54 | §20 `CASE_PREVIEW_CHARS` 40 | 4, 13 | `B-CHARS` rows 39 / 40 / 40+`b`; Task 13 case 1 card with 40+`b` | module; W |
| 55 | §20 `HOTELS_CAP` 12 | 16, 17 | `B-HOTELS-CAP` (13-hotel list: index 11 marked, 12 not); `B-JUMP-INDEX` via the real spread (11 → reservation, 12 → `Go to Hotels`) | marker; staged spread |
| 56 | §20 `MAX_HOTELS` 4 | 16 | `B-MAX-HOTELS` (the five-slot v4 block parses to four reservations plus one `HOTEL_CARDINALITY_EXCEEDED`, Probe P-T16; parsed indices stay below `HOTELS_CAP`) | parser feeding the marker |
| 57 | §20 `--spacing-tap-min` 44px | 7, 9, 13, 15, 16, 17 | DI-1, DI-C1; e2e rect height ≥ 44 for include, Save, Cancel, marker jump, card jumps | real browser |
| 58 | §20 `--spacing-tile-pad` 20px | 7 | CSS premise (panel `padding-left` 20px) and DI-8 | real browser |
| 59 | §20 compact row link spacing 22 / 14 px | 9 | DI-C6, DI-C7, DI-C8 | `CompactAlertCard` |
| 60 | §20 help trigger overlay 11px | 9 | DI-C6 hit tests | `CompactAlertCard` |
| 61 | §20 venue label columns `i` in [0, 1] | 2 | cases 1 (`i = 1`, 3-column), 2 (`i = 0`, 2-column), 4 (both resolve → `i = 0`) | venue anchor |
| 62 | §20 venue block header | 2 | case 4 (no `VENUE` header row → `null`); case 1 (header found) | venue anchor |
| 63 | §20 include label / pending constants | 13 | case 3 literal pin and every-placement labels | W, `ArchivedTabOffer`, published offer |
| 64 | spec line 337: marker index rule | 16 | `B-INDEX` (0, `shown.length - 1` marked; `shown.length`, -1, NaN, 1.5, absent not) | marker |
| 65 | spec line 382: `sheetSaysText` definition | 4 | `B-SHEET` | module |
| 66 | spec line 383: `weReadGuestsText` definition | 4 | `B-NAMES` (0, 1, cap-1, cap, cap+1; blanks; non-strings) | module |
| 67 | spec line 420: bulk chip copy | 11 | judgment group chip text and accessible names per state | B |
| 68 | spec line 541: `Cases` line only with at least one preview | 13 | `B-PRESENCE` (no previews → no line; one → line) | W |
| 69 | spec line 608: card jump index range | 17 | `B-JUMP-INDEX` (0 and `hotelCount - 1` → reservation; `hotelCount`, -1, NaN, 1.5 → Hotels) | card jump |
| 70 | spec line 670: `1 accepted.` / `<n> accepted.` | 11 | `B-BULK` groups of 1, 2, 3 | B |
| 71 | spec line 833: `blockRef.index` guard row | 16, 17 | `B-INDEX`, `B-JUMP-INDEX` | marker; card jump |
| 72 | spec line 869: §16.1 cap table row | 4 | `B-SHEET`, `B-NAMES`, `B-CASES` | module |
| 73 | §20 count: seven judgment codes | 4, 5 | `isJudgmentCall` rows; Task 5 guard iterates all of `AMBIGUITY_CODES` | module; catalog |
| 74 | §20 count: four radio codes | 4 | `USE_RAW_CODES` size 4, each in `AMBIGUITY_CODES` | module |
| 75 | §20 count: four hotel reservation codes | 4 | `HOTEL_RESERVATION_JUDGMENT_CODES` size 4, each in `AMBIGUITY_CODES` | module |
| 76 | §20 count: three catalog rows | 5 | the three `EXPECTED_HELPFUL_CONTEXT` rows and the hotel pin | catalog |
| 77 | §20 count: six lockstep places | 5 | one commit carrying all six files; x1 parity, `_metaWarningCardCopy`, the hotel pin | catalog |
| 78 | §20 count: three warning text-link sites | 7, 9 | no `Open in Sheet` text on the wizard row (Task 7), `PerShowActionableWarnings` and `NoteWarningCard` (Task 9) | wizard row; adapters |
| 79 | §20 count: four `CompactAlertCard` consumers | 9 | two adapters pass `sheetLink`; DI-C2 literal class on `HealthAlertsPanel` and `AttentionBanner` | `CompactAlertCard` |
| 80 | §20 count: two disclosures per surface | 12 | wizard and published split cases | both surfaces |
| 81 | §20 count: five transition states | 14 | rows 1 to 5 above | P |

No spec row lacked a feasible test. One row is only partly decidable: §14 sequence 10 does not say whether the accept request may start after the tree unmounts, so row 33 pins completion and no-throw only (ambiguity 8).

## Spec ambiguities, resolutions and builder's calls

1. **RESOLVED by spec R14 (orchestrator relaying Eric, 2026-10-26).** The round-0 venue lookup went through the UNKNOWN_FIELD scan and reached no committed workbook that raises the warning (all 3-column). The spec now derives the anchor from the venue grid block itself, at label column 0 or 1, so the 3-column layout links its empty value cell; the generic scan is unchanged. Remaining limits (combined `VENUE NAME/VENUE ADDRESS` label row, horizontal header-table layout, a venue table with no `VENUE` header row, unread labels) fall back to the region (spec §17 L1-L3). Task 2 implements and tests it.

**Builder's calls (they stand; recorded so review does not re-derive them):**

2. **Bulk accept partial-success copy** is not in the spec. Today `Ignored ${ok} of ${n}. Refresh to see the rest.` (`components/admin/BulkIgnoreControls.tsx:146`); judgment groups get `Accepted ${ok} of ${n}. Refresh to see the rest.` (Task 11), the spec's verb swap applied to the one string §6.2 does not list.
3. **Home of `HOTEL_RESERVATION_JUDGMENT_CODES`** (unstated in §5.4): lib/admin/warningReadingDisplay.ts beside `USE_RAW_CODES`, with `isJudgmentCall` as the one spelling of the kind test (Task 4).
4. **Archived card order:** Tab and Cases lines in the row-label slot, then help text, then include, jump, Report + Ignore. This satisfies §7.3's bullet order and §8.3's "after the help text" (Task 13 `ArchivedTabWarningActions` takes the jump as a slot).
5. **Save + accept announcement** is `Reading saved. Judgment call accepted.`, from §11 (§6.3 rule 4 only says "announce").
6. **Census coverage beyond §16.3** (sweep S1, S2): `tests/help/_metaRenderFaultMarking.test.ts` and the inline census in `tests/styles/_metaControlOutlineResidue.test.ts` also key on moved lines; `tests/components/step3SheetCard.test.tsx` and `tests/components/admin/parsePanelComposition.test.tsx` pin the removed link and word. All are in tasks.
7. **`ArchivedTabIncludeButton` gets an optional `testId` prop** (§7.3 names the card's testid, not the prop); Pack list and the Resolve box keep their testids on the wrapping `ArchivedTabOffer`.
8. **§14 sequence 10 is silent on one point (an open question, not decided here):** it says the in-flight requests complete when the modal closes during S, but not whether the ACCEPT request that follows a successful reading may still start once the tree is gone. Task 14's case pins completion and no-throw only; deciding the accept continuation is the spec author's call.

## Task index

| # | Task | File | Commit type(scope) |
|---|---|---|---|
| 1 | Inline guest emitter keeps its names (`readAs`) | 01 | `feat(parser)` |
| 2 | Venue-with-no-address links the empty value cell | 01 | `feat(sync)` |
| 3 | Route archived-tab warnings to Pack list | 01 | `feat(onboarding)` |
| 4 | The reading-display module | 01 | `feat(admin)` |
| 5 | §12.4 catalog lockstep: three helpfulContext rows | 01 | `fix(onboarding)` |
| 6 | Sheet icon link: two new backdrops | 02 | `feat(admin)` |
| 7 | Layout dimensions I: wizard title row with the icon link and the tag | 02 | `feat(onboarding)` |
| 8 | Wizard row kinds: chip, dot, sr prefix, no severity word | 02 | `feat(onboarding)` |
| 9 | Layout dimensions II: compact card icon link, published adapters, published tag | 02 | `feat(admin)` |
| 10 | Read-only "Sheet says / We read" comparison | 03 | `feat(admin)` |
| 11 | Accept wording on judgment rows and bulk chips | 03 | `feat(admin)` |
| 12 | Accepted (N) disclosures | 03 | `feat(admin)` |
| 13 | Archived pull sheet card: one include button, row locks | 03 | `feat(onboarding)` |
| 14 | Transition audit: the deferred reading choice | 03 | `feat(admin)` |
| 15 | Mount the deferred choice on both surfaces; Save flow in a real browser | 03 | `feat(admin)` |
| 16 | Hotels reservation marker and the two-way jump | 04 | `feat(onboarding)` |
| 17 | Section jumps on staged wizard cards | 04 | `feat(onboarding)` |
| 18 | Line-keyed census reconciliation | 04 | `test(admin)` |
| 18b | Unsaved reading guard (spec §6.5, R15; added 2026-10-30) | 04 | `feat(admin)` |
| 19 | Invariant-8 UI quality gate, before verification and review — orchestrator | 04 | fixes + `docs(onboarding)` gate record |
| 20 | Full local verification | 04 | none unless a fix lands |
| 21 | Adversarial review (cross-model), final — orchestrator | 04 | its review-round corpus row only |
| 22 | Ship | closeout.md | none |
