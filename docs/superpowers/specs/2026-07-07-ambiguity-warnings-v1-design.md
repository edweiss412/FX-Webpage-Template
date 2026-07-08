# Ambiguity Warnings v1 — lean per-field confidence via the warning machinery

**Date:** 2026-07-07
**Status:** Draft (pending adversarial review)
**Provenance:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §7 item 5 (per-field provenance/confidence model), reframed lean per the 2.1 investigation findings (§6 Flow 2 of the audit). Chosen shape ratified in brainstorming 2026-07-07: lean form, no re-evaluate commitment; four named sites (one already shipped); `severity:"warn"` + distinct code class; third readiness count, publishable.

---

## 1. Problem

P0-2 class (audit §5): parses that succeed with no warning render wrong values as authoritative end-to-end. The 2.1 investigation established that identity fields are stored verbatim and every rewrite the parser makes already warns — the residual gap is the transform-heavy blocks (rooms / hotels / dates) where the parser makes **judgment calls with zero signal**, plus the wizard's binary flagged/clean rendering that cannot distinguish "known problem" from "parsed with judgment — glance here."

The full per-field provenance/confidence model was evaluated and **rejected** (no re-evaluate commitment): provenance is redundant (values verbatim + source anchors + "In sheet ↗" deep-links exist), and confidence can only encode the same detectable-ambiguity events warnings capture. What survives as structural is: (a) per-field warning anchoring, (b) completeness-by-construction enforcement, (c) a third visual state in the wizard.

## 2. Scope

**In:** three new ambiguity warning sites (rooms split, hotels guest split, dates order), one telemetry-only code promoted to a real ParseWarning (`HOTEL_CARDINALITY_EXCEEDED`), `blockRef.field` type extension, `AMBIGUITY_CODES` registry + `isAmbiguityCode()`, transform-sites walker meta-test, wizard Step 3 third state + three-count summary.

**Out (explicitly):** crew-page uncertainty rendering; DB migrations (warnings already persist via `shows_internal.parse_warnings`, written at `lib/sync/runScheduledCronSync.ts:1726-1743` as `$3::jsonb`); admin overrides (audit 3.2); digest email (audit 6.2); full sweep of every parser transform site (deferred sites get documented walker exemptions); any change to publish gating — ambiguity warnings never block publish.

## 3. The ambiguity class

### 3.1 Definition

An **ambiguity warning** means: "the parser produced a value by making a judgment call between plausible alternatives, with no error detected." Distinct from existing warn semantics ("the parser found a problem"). Both are `severity:"warn"`; the class is distinguished by **registry membership, not name pattern** (name-regex scanners are fragile — M8 lesson).

### 3.2 Registry

New file `lib/parser/ambiguityCodes.ts`:

```ts
export const AMBIGUITY_CODES = new Set<string>([
  "CREW_COLUMN_POSITIONAL_FALLBACK", // shipped 7c00c40cb — joins retroactively
  "ROOM_HEADER_SPLIT_AMBIGUOUS",     // new, §4.1
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",     // new, §4.2
  "DATE_ORDER_SUGGESTS_DMY",         // new, §4.3
]);
export function isAmbiguityCode(code: string): boolean {
  return AMBIGUITY_CODES.has(code);
}
```

Location rationale: the class is a parser-emission concept consumed by UI; `lib/parser/` keeps it importable by both without `lib/messages` gaining a parser dependency. `HOTEL_CARDINALITY_EXCEEDED` (§4.2b) is NOT in the registry — it reports a detected problem (truncation), not a judgment call. `AGENDA_DAY_AMBIGUOUS` (`catalog.ts:1346`) is likewise NOT in the registry, despite its name: its copy says "we didn't guess" — it is a fail-closed no-value-produced code, i.e. a detected problem, outside the §3.1 definition (judgment call that PRODUCED a value). Membership is semantic, not lexical — this exclusion is the proof case.

### 3.3 Routing

`severity:"warn"` + membership in `GAP_CLASSES` (`lib/parser/dataGaps.ts:30-56`; precedent: `CREW_COLUMN_POSITIONAL_FALLBACK` at line 55). All four new codes (three ambiguity sites + the promoted `HOTEL_CARDINALITY_EXCEEDED`, §9) are appended to `GAP_CLASSES`, so they flow to the dashboard chip, per-show panel, and the `isQualityRegression` gate (`dataGaps.ts:110-118`) exactly like the shipped precedent. Nothing dark: no new severity band, no filter changes.

### 3.4 Gap-class consumer sweep (complete — every `summarizeDataGaps` / `GAP_CLASSES` / `DATA_GAP_CODES` / `isQualityRegression` consumer, grep-derived)

Joining `GAP_CLASSES` feeds MORE than the chip/panel/gate. Full non-test consumer list with the required action per surface — the rule: **surfaces that GATE or STYLE-AS-PROBLEM partition by `isAmbiguityCode`; surfaces that merely COUNT/DISPLAY do not**:

| Consumer | Role | Action |
|---|---|---|
| `components/admin/wizard/Step3Review.tsx` (`rowNeedsLook`) | gates needs-look bucket | PARTITION (§7.2) |
| `components/admin/wizard/Step3SheetCard.tsx:470-471` (`needsLook = gaps.total > 0`) | card-face warn border / "N need a look" chip / Review button | PARTITION — card `needsLook` uses non-ambiguity gap count; ambiguity-only rows get the judgment card chrome (§7.3a), not the warn border. In-scope, tested |
| `lib/onboarding/rescanDecision.ts:40-48` (`computeRescanDecision` — `gapRegressed`: any class-count increase ⇒ `dirty`) | gates re-review on rescan | PARTITION — `gapRegressed` compares NON-ambiguity classes only; an ambiguity-only count increase does not force dirty (else "never blocks publish" is violated via the rescan side door). Invariant-triggered dirty (`decisionItems`) unchanged. Tested both ways |
| `lib/onboarding/applyRescanDecisionUnderLock.ts:115,134` | passes prior/new summaries into the decision | inherits the partition via `computeRescanDecision`; no local change |
| `components/admin/Dashboard.tsx:332` + `DataQualityBadge` | amber glance count | NO partition — deliberate: dashboard badge is "glance here" aggregate (§3.3); ambiguity counts belong in it |
| `components/admin/PerShowAlertSection.tsx:91` (`formatDataGapBreakdown`) | per-class breakdown display | NO partition — display-only |
| `components/admin/StagedReviewCard.tsx` (`dataGaps` prop) | staged-row breakdown display | NO partition — display-only |
| `app/admin/show/staged/[stagedId]/page.tsx:199`, `app/admin/show/[slug]/page.tsx` | page-level summary derivation | NO partition — feeds the display surfaces above |
| `lib/sync/runScheduledCronSync.ts` (`isQualityRegression`, `GAP_CLASSES` iteration at `:266`) | push-alert threshold gate | NO partition — deliberate: a jump in ambiguity warnings on a published show SHOULD alert (§3.3) |
| `lib/parser/dataGaps.ts:125-133` (`hasRecoveredToBaseline` — per-class ≤ baseline check) | alert auto-recovery gate | NO partition — symmetric with the regression gate above (ambiguity classes count toward regression, so they must count toward recovery, else an alert opened by an ambiguity jump could auto-close while the jump persists — or never close). New codes participate automatically via the `GAP_CLASSES` iteration; a test pins an ambiguity-class regression blocking recovery |
| `lib/parser/dataGaps.ts` (`DATA_GAP_CLASS_LABELS`, built from `GAP_CLASSES`) | plain-language class labels | NO partition — each new `GAP_CLASSES` entry supplies its `label` (invariant-5 plain language), covered by the extended `dataGapsClassCompleteness` test |

Any NEW `GAP_CLASSES` consumer added later chooses a side explicitly; the plan adds this table to the walker-adjacent test docs.

## 4. Warning sites

All emissions go through the `ParseAggregator` (`lib/parser/warnings.ts:15` — `{ warnings: ParseWarning[]; rawUnrecognized[] }`), following the existing emit-helper pattern in `warnings.ts`. Each site's helper lives in `warnings.ts` (or the block's local warnings module, matching `agendaWarnings.ts` precedent). The three AMBIGUITY sites stamp `blockRef` with the new `field` member (§5); `HOTEL_CARDINALITY_EXCEEDED` (§4.2b) intentionally omits `field` — it is section-scoped truncation, not a per-field judgment.

### 4.1 `ROOM_HEADER_SPLIT_AMBIGUOUS` — rooms name/dims split

`splitRoomHeader(raw, kind)` (`lib/parser/blocks/rooms.ts:1439`) separates a raw header cell into room name + dims. Emit when the split had to choose between plausible alternatives:

- more than one COMPLETE dims group present in the raw header (a full `dimsFullRe`-shaped match — which one is THE dims?). A single multi-operand dimension (`75' x 37' x 16'`) is ONE group, never a trigger; the definition counts full groups, not `DIMS_START_SRC` operand starts (over-warning ordinary 3-operand headers is the failure mode this wording exists to prevent);
- the raw header is dims-leading (name reconstruction is inferential);
- the residual name after strip is empty or degenerate (single char / punctuation only) while the raw was non-trivial — the strip consumed what may have been the name.

**Emit ownership:** `splitRoomHeader` (`rooms.ts:1439`) stays a pure helper — it gains an `ambiguity?: { field: "dims" | "name"; reason: string }` member on its return value (set by the internal branch that made the judgment call), and each CALLER that feeds a room that actually lands in parsed output (the call sites at `rooms.ts:752`, `:957`, `:968`, `:1140`, `:1187`, `:1247`, `:1404` — plan enumerates which of these produce persisted rooms vs. rejected candidates) emits exactly one warning when `ambiguity` is present AND the room is kept. Exact-once is testable at both layers: unit tests on the helper's `ambiguity` metadata per branch, and aggregator tests per persisting call site. Exact branch enumeration happens at plan time against `splitRoomHeader`'s real structure (writing-plans pre-draft verification); the spec contract is: **every branch where two readings were possible and one was picked yields exactly one warning for a kept room** with `blockRef: { kind: "rooms", name: <parsed room name>, field: "dims" | "name" }` and `rawSnippet` = the raw header cell. `kind` is ALWAYS the literal `"rooms"` regardless of `RoomKind` (gs/breakout/additional) — `KIND_TO_SECTION` (`lib/admin/step3SectionStatus.ts:21-44`) maps `"rooms"` only; a RoomKind-valued `kind` would silently misroute to the generic bucket.

Non-goals at this site: the placeholder-drop path (`rooms.ts:815`) stays silent — that is a coverage gap (audit #10/#4 family), not an ambiguity, and is out of scope here.

### 4.2 `HOTEL_GUEST_SPLIT_AMBIGUOUS` — hotels guest glue/split

`parseGuestCell(cell)` (`lib/parser/blocks/hotels.ts:117`) splits a guest cell into names + conf numbers. Emit when:

- the no-token fallback (`hotels.ts:147` — whole segment treated as one guest name) fires on a segment whose shape suggests multiple glued guests. Exact predicate, on the trimmed segment the fallback consumed: (i) **≥ 4 name-like tokens** — a name-like token is a maximal run matching `/^[\p{L}][\p{L}\p{M}.'-]*$/u` after splitting the segment on whitespace (same character class as the existing `tokenRe` name grammar at `hotels.ts:138`, minus the space; pure-punctuation/digit fragments are not name-like); OR (ii) **an interior conf-shaped digit run** — a `/\d{4,}/` match (the `tokenRe` conf grammar: 4+ digits) whose match neither starts at index 0 nor ends at the segment end. Negative examples (no warn): "Mary Anne St. Claire" (3 tokens), "José Núñez-Marín" (2), a segment that IS just a 5-digit number at either boundary;
- a trailing un-numbered tail was appended as a guest (the `tail` branch) — the tail may be a guest or may be trailing noise.

**Site scope (strict):** this site covers the STRUCTURED guest-cell path only — `parseGuestCell`'s two call sites at `hotels.ts:446` and `:449`. The inline shapes (v1 "Hotel Stays" / v2 inline "Hotel Reservations" rows) parse guest lines through separate code and are NOT in v1 scope; those paths get a `deferred:BACKLOG` walker exemption (§6).

`blockRef: { kind: "hotels", name?: <hotel name>, field: "guests" }`, `rawSnippet` = the raw cell. **Emit ownership:** `parseGuestCell` stays pure (it has no hotel context and no aggregator) — it returns split metadata (which branch fired) alongside `names`/`confs`, and the CALLER emits. `name` is the caller's parsed `hotel_name` when already resolved at emit time (structured left/right-slot path, `hotels.ts:348-430`); when the slot's `hotel_name` is null/unresolved/inherited at emit time, `name` is OMITTED — `kind: "hotels"` alone routes the warning correctly (`KIND_TO_SECTION`), `name` only sharpens the callout text. (All emission is on the structured path per the strict site scope above; inline paths emit nothing in v1.)

**4.2b — thread the aggregator into hotels.** The local `warn()` helper (`hotels.ts:40-44`) is log-only (`HOTELS_PARSE_WARNING` telemetry — audit §4 "dark" class). This spec threads `ParseAggregator` into the hotels parse path and converts the one call site (`hotels.ts:84`, cardinality overflow) into a real ParseWarning with code `HOTEL_CARDINALITY_EXCEEDED`, `severity:"warn"`, `blockRef: { kind: "hotels" }`. The `HOTELS_PARSE_WARNING` telemetry emit may remain alongside (log + aggregator are not mutually exclusive); the local `warn()` helper is deleted if no call sites remain. `HOTEL_CARDINALITY_EXCEEDED` joins `GAP_CLASSES` but NOT `AMBIGUITY_CODES` (§3.2).

### 4.3 `DATE_ORDER_SUGGESTS_DMY` — dates block sequence check

Numeric slash/dash dates are always read MDY (`lib/parser/blocks/_helpers.ts:154-155`; precedence chain ISO→slash→dash→lfMDY→lfDMY at `:149`). A per-date "day ≤ 12 is ambiguous" warning would fire on nearly every US sheet — fatigue, rejected.

Instead, a **block-level sequence check** over the DATES section's dates **in sheet encounter order, captured BEFORE the `result.showDays.sort()` calls** (`lib/parser/blocks/dates.ts:183`, `:281` — both parser versions sort before return, erasing row order). The sequence is **token-level**, produced by a NEW dedicated pure collector — `collectDateTokens(rows): Array<{ raw: string; mdyIso: string | null; dmyIso: string | null }>` — because the existing `extractAllDates` (`dates.ts:322`) cannot prove this contract: it returns normalized ISO strings (no raw tokens), scans per regex family rather than in true within-cell offset order, and has no numeric-dash family. On multi-token (`extractAllDates`-path) cells the collector runs ONE combined-alternation regex pass so matches come out in genuine within-cell offset order; on prefix-only rows it evaluates the leading token only. **Parser parity (binding, per row kind):** the collector mirrors exactly what the row's ACTUAL parser consumes, in cardinality as well as family. `normalizeDate` rows (TRAVEL / SET / travel_set) are PREFIX-only parses — such a row contributes AT MOST ONE token: the leading date token `normalizeDate` would read (all families eligible: ISO / numeric slash / numeric dash / longform); trailing or secondary dates in the same cell are NOT collected (the parser never read them — phantom). Multi-token cells exist only on `extractAllDates` paths (v1 SHOW rows, `dates.ts:174`, `:322-331`), which contribute every match in within-cell offset order but have NO numeric-dash family, so numeric-dash tokens in SHOW cells are NOT collected. Alternation order and grammar mirror `normalizeDate` precedence (`_helpers.ts:149` — ISO first, then numeric slash, then numeric dash with its 4-digit-year requirement; 2-digit dash years are NOT tokens, matching the parser), then longform; rows are visited in DATES-block encounter order (ALL row kinds — travel-in / set / show / travel-out, INCLUDING the combined `travel_set` kind (`dates.ts:35-40`), whose cell's date tokens enter the sequence in within-cell order like any other row), in BOTH parser-version walkers, on the same raw `(label, value)` rows they already iterate, before any sort. **Dual-read rule (stated once, authoritative):** per token — ISO/longform tokens contribute their parsed value to BOTH hypotheses (fixed points). A numeric slash/dash token `a/b/y` gets `mdyIso` = the `a`-as-month reading if calendar-valid else null, and `dmyIso` = the `b`-as-month reading if calendar-valid else null; either, both, or neither may be non-null. The check emits iff BOTH hold: (a) **MDY hypothesis violated** — the `mdyIso` sequence, nulls skipped, strictly decreases at some adjacent pair; (b) **DMY hypothesis intact** — NO numeric token has `dmyIso = null` (one DMY-invalid numeric kills the whole hypothesis — no emit) AND the full `dmyIso` sequence is non-decreasing. The collector is read-only relative to parsing — parsed values still come from the existing code paths; it feeds ONLY this check. `rawSnippet` at a violation = the `raw` token at the first out-of-order position: if that encounter-order sequence is non-monotonic (strictly decreasing at any adjacent pair) under the MDY reading, AND re-interpreting every numeric slash/dash date as DMY yields a non-decreasing sequence, emit ONE warning: `blockRef: { kind: "dates", field: "order" }`, `rawSnippet` = the first out-of-order raw date. This fires exactly in the real mis-read scenario (coordinator wrote DMY) and never on a well-ordered US sheet.

Guard conditions: fewer than 2 parseable dates → no check (vacuously ordered). Symmetric numeric tokens (e.g. `5/5/2026`, where `mdyIso === dmyIso`) are INCLUDED as ordinary tokens — the identical reading lands in both hypotheses, making them de-facto fixed points; a test covers this case. If BOTH readings are non-monotonic → no warning (sheet is just out of order; existing behavior unchanged). Longform/ISO dates are fixed points (only numeric slash/dash re-interpret).

**Worked examples of the dual-read rule:** `25/3/2026` — `mdyIso` null (skipped by scan (a)), `dmyIso` valid (participates in (b)) — a DMY sheet whose MDY-valid readings decrease somewhere emits this code. **Corrected claim (R8):** MDY-invalid date rows are SILENT today — `dates.ts` emits only `emitEmptySection` (`dates.ts:98`); an individual `normalizeDate(...) === null` row is skipped with no warning (audit #16 silent-drop family, out of scope here). Therefore: a DMY sheet where every numeric token is MDY-invalid, or whose MDY-valid subset is non-decreasing, emits NOTHING from this check — condition (a) is unsatisfiable there. Accepted as a known limit of v1: this check targets the plausible-mis-read case (dates parse fine but in the wrong convention), not the unparseable-date case; per-row unreadable-date warnings are a separate backlog item, deliberately not smuggled into this spec. `3/25/2026` — `mdyIso` valid, `dmyIso` null — its presence kills the DMY hypothesis outright, so a normal US sheet with a typo'd out-of-order date does NOT emit this code.

### 4.4 Copy + catalog obligations (all four codes)

Each new code is admin-visible: full §12.4 three-way lockstep (AGENTS.md rule 5 + §12.4 discipline) — master-spec table row in the parser-warning band (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — precedent rows `CREW_COLUMN_POSITIONAL_FALLBACK` at `:2893`, `AGENDA_DAY_AMBIGUOUS` at `:2899`; new rows insert in that band) + helpfulContext YAML appendix entry (appendix opens at `:3083`) + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` row (8-field shape; copy template: `CREW_COLUMN_POSITIONAL_FALLBACK` at `catalog.ts:1242-1254`) + `pnpm gen:internal-code-enums`, all in the same commit. Doug-facing copy is action-first, names the sheet location, no raw codes (rule 5). crewFacing: null for all four (crew never sees parse internals). Copy drafts land at plan time; the master spec is NEVER prettier-formatted (memory: prettier mangles §12.4 cells).

## 5. `blockRef.field`

`lib/parser/types.ts:15` today:

```ts
blockRef?: { kind: string; index?: number; iso?: string; name?: string };
```

becomes

```ts
blockRef?: { kind: string; index?: number; iso?: string; name?: string; field?: string };
```

Optional — zero consumer breakage (grep-verified: all consumers destructure named members or read `.kind`). `field` names the parsed-output field the judgment landed on (`"dims"`, `"name"`, `"guests"`, `"order"`). Persisted transparently through the existing `parse_warnings` jsonb write (`runScheduledCronSync.ts:1726-1743`) — no migration. Wizard MAY use it for field-level highlight (v1 uses it in the callout entry text, §7.3; deeper per-field chrome is a UI-plan decision under the impeccable gate). Shape-sensitive tests: enriching an object that flows into exact `toEqual` assertions breaks them (memory: optional-field lesson) — plan includes a class-sweep of warning-shape assertions.

## 6. Transform-sites walker meta-test

`tests/parser/_metaTransformSitesWalker.test.ts`, patterned on `tests/parser/_metaKnownSectionsWalker.test.ts` (filesystem-walked, fails-by-default for NEW files — its line 4 contract).

Every `lib/parser/blocks/*.ts` MUST export:

```ts
export const TRANSFORM_SITES: ReadonlyArray<
  | { site: string; code: string }                 // emits this ambiguity/warn code
  | { site: string; exempt: string }               // documented reason: deterministic | deferred:<backlog-ref> | verbatim
> = [...];
```

Walker asserts: (1) export present on every file (no allowlist analog to `NO_SECTION_OPENER` — a block with zero transform sites exports `[]`); (2) every `code` value exists in the catalog (`isMessageCode`, `lib/messages/lookup.ts:91`) — catalog `severity` is optional and uses `"warning"` values, so the walker makes NO catalog-severity assertion; the emitted `ParseWarning.severity === "warn"` is proven by each site's emit unit tests (§10), not the walker; (3) RETIRED (R8) — the entry shape has no independent "ambiguity-class" claim field, so a forward assertion would be circular; class membership is derived solely from `AMBIGUITY_CODES` and enforced by the inverse assertion (5); (4) the four sites named in this spec appear with their codes (pins this spec's deliverable against silent removal); (5) **inverse completeness** — every member of `AMBIGUITY_CODES` appears as some file's declared `TRANSFORM_SITES` code (so the retroactive `CREW_COLUMN_POSITIONAL_FALLBACK` must be declared in `crew.ts`'s inventory; a registry entry with no declared site fails).

**Honest limit (stated, not hidden):** the walker enforces declaration, not detection — a NEW undeclared transform inside an EXISTING file is caught at review, not by CI. The fails-by-default property covers new block files and any drift in declared sites. Optional hardening (grep-guard on suspicious patterns à la the no-inline-email guard) was considered and deferred: transform-shaped code (`.split`/`.replace`/regex exec) is ubiquitous in a parser; a grep-guard would drown in exemption comments. This is a deliberate calibration, not an oversight — do not relitigate without a concrete escaped-bug instance.

Deferred-exemption seeds (documented at plan time after per-file enumeration): expected entries include stage-clause extraction (`personalization.ts` — already warns via `UNKNOWN_STAGE_RESTRICTION` family), dims normalization (`_dimsToken.ts` consumers — deterministic), name canonicalization sites, address parsing (`hotels.ts` — `deferred:BACKLOG`).

## 7. Wizard Step 3 — third state

UI surface ⇒ Opus-owned, impeccable v3 critique + audit dual-gate (AGENTS.md invariant 8).

### 7.1 Section status derivation

`sectionForWarning()` / section-status logic (`lib/admin/step3SectionStatus.ts:69-81`, `KIND_TO_SECTION` at `:21-44`) currently yields flagged/clean. New derivation per section:

- **flagged** — has ≥1 warning that is NOT ambiguity-class (unchanged semantics); a section with BOTH ambiguity and non-ambiguity warnings is flagged;
- **judgment** (new) — has ≥1 warning, ALL of them `isAmbiguityCode`;
- **clean** — zero warnings (unchanged).

This section-level status governs the per-section chrome inside a show's review modal (§7.3). It is distinct from the row-level counting in §7.2 — the two levels apply the same `isAmbiguityCode` partition, but over DIFFERENT warning universes, and this divergence is pre-existing and preserved: section status derives from ALL `warn`-severity warnings routed to the section, while row-level needs-look/judgment derives ONLY from `GAP_CLASSES`-member warnings (`summarizeDataGaps` semantics — exactly what `rowNeedsLook` consumes today). Consequence, stated explicitly: a row can render clean or judgment at the summary while one of its sections is flagged by a non-gap warn — that asymmetry exists today and this spec does not change it. A test covers the mixed case (non-gap warn + ambiguity gap in one row: row = judgment, section = flagged).

Null/unmapped `blockRef.kind` routing is untouched (audit item 2.3 is separate scope).

### 7.2 Summary counts

`renderSummary()` (`components/admin/wizard/Step3Review.tsx:845-918`, `rowNeedsLook()` at `:828-836`): replace the two-bucket derivation with three counts — **"N clean · M parsed with judgment — spot-check · K need a look."** K keeps today's needs-look semantics INCLUDING the non-warning operational branches (missing preview, finalize failure) — so its copy must say "need a look," NOT "flagged" (a missing-preview row has no warning to be "flagged" by). **Counting unit: publish-grid rows.** Step 3's real row model (`Step3Review.tsx:940-967`) partitions rows into `publishRows` (`isCleanRow`: staged/applied — the publish grid), `blockingRows` (`isBlocking`: hard-fail / live-conflict / discard — "Needs your attention"), and set-aside rows (`permanent_ignore` / `defer_until_modified` / `skipped_non_sheet` — de-emphasized sections). **The three-count summary applies WITHIN `publishRows` only**: today `readyCount = publishRows.filter(r => !rowNeedsLook(r)).length` and `needsLookCount = publishRows.length − readyCount` (`:965-966`); the new derivation splits `readyCount`'s complement further — N (clean) + M (judgment) + K (needs-look) = `publishRows.length`. `blockingRows`, set-aside sections, `sheetCount`, and the selectable/checkbox logic (`:953`) are UNTOUCHED — blocking and set-aside rows never enter the three counts. Exact copy is an impeccable-gate deliverable; the contract here is: three distinct counts and judgment-count wording that prompts a glance without implying error.

**Derivation change (required, not optional):** `rowNeedsLook()` today ORs several conditions — `summarizeDataGaps(...).total > 0` plus non-gap branches (missing preview, finalize failure). ONLY the gap-total clause is partitioned by `isAmbiguityCode`: it contributes true only when the row's NON-ambiguity gap count is > 0. **All other OR branches are preserved unchanged** — a row with a missing preview or finalize failure stays needs-look regardless of warning classes. Precedence: needs-look (any surviving branch true) > judgment (not needs-look AND ≥1 ambiguity-class warning) > clean. Ambiguity-only sections do NOT join `rowNeedsLook`'s blocking styling and do NOT block publish. Dashboard chip and regression gate are deliberately NOT partitioned — ambiguity codes count there like any gap class (§3.3; the chip is a "glance here" aggregate, same intent).

Guard conditions: M=0 renders the existing two-state summary (no empty "0 parsed with judgment" chrome). Zero rows is the existing empty-wizard state, unchanged. Row classification, precise: only non-ambiguity **GAP** warnings (plus the preserved operational branches) force needs-look — a row with a non-ambiguity gap warning + ambiguity warnings is **needs-look** (K), counted once; a row with only benign NON-gap warns + ambiguity gaps is **judgment** (`rowNeedsLook` consumes `summarizeDataGaps`, which never counted non-gap warns — §7.1's universe note). The row-level judgment predicate: NOT needs-look AND ≥1 ambiguity-class GAP warning (i.e. `isAmbiguityCode(code) && DATA_GAP_CODES.has(code)` — same universe as `rowNeedsLook`). Supporting invariant, enforced by a unit test: **`AMBIGUITY_CODES ⊆ GAP_CLASSES` codes** — every ambiguity code is a gap class (all four `AMBIGUITY_CODES` members satisfy it — `HOTEL_CARDINALITY_EXCEEDED` in §9 is a gap class but deliberately NOT an ambiguity code, so it is outside this subset check; a future ambiguity code outside `GAP_CLASSES` would silently drop out of row judgment, so the test makes that impossible).

### 7.3a Card-face chrome (Step3SheetCard)

The compact card independently derives `needsLook = summarizeDataGaps(warnings).total > 0` (`Step3SheetCard.tsx:470-471`) — partitioned per §3.4: the needs-look treatment — warn border (`border-border-strong`) + Review button (the selectable card's actual chrome today; the only literal chip is the demoted "Needs another look" branch — no new chip is added in v1) — appears only for non-ambiguity gaps (or operational branches). An ambiguity-only row gets a **judgment card variant**: distinct border/affordance treatment (impeccable-gate deliverable), still opens the same review modal. `DataQualityBadge` on the title keeps the FULL gap count (no partition — §3.4 dashboard rule). Three card states (plain / judgment / needs-look) mirror the §7.2 row buckets; a test pins each derivation.

### 7.3 Section chrome

`SectionFlagCallout` (`components/admin/wizard/step3ReviewSections.tsx:469-514`): judgment sections get a visually distinct callout variant — "We made a judgment call reading this — worth a glance" + the entry list (existing `CALLOUT_MAX_ENTRIES` cap at `:480` applies unchanged) with its existing per-entry "View details" affordance. The "In sheet ↗" deep-link (`:548-559`) lives in `ModalSectionChrome` at the section heading, NOT inside the callout — it stays there, unchanged, and serves as the judgment state's spot-check affordance. No new per-entry sheet link in v1 (a per-entry link is an impeccable-gate option, not a spec requirement). Entry text includes the `blockRef.field` when present ("dims for ROOM A") — rendered through a small FIELD_LABELS map (`dims` → "dimensions", `name` → "room name", `guests` → "guest list", `order` → "date order"); an empty/unknown/unmapped `field` value falls back to omitting the field phrase entirely (persisted historical warnings may carry values this build doesn't know — raw internal tokens never leak into UI copy). Visual treatment (color/token choice distinct from flagged amber and from clean) is an impeccable-gate deliverable within existing `DESIGN.md` tokens.

### 7.4 Transition inventory

Section status (clean / judgment / flagged) is computed per parse snapshot; it changes only on re-parse (page data refresh), never live within a mounted view. All 3 pairs (clean↔judgment, clean↔flagged, judgment↔flagged) and the summary count changes: **instant — no animation needed.** No compound transitions: no other animated state co-occupies the section card; `AnimatePresence` is not introduced. Callout expand/collapse (if the existing callout has one) keeps its current behavior — no new animated states are added by this spec.

### 7.5 Dimensional invariants

None — no fixed-height/width parent with flex/grid children is introduced or modified; the callout variant reuses the existing callout layout. (Declared explicitly per project spec rules: N/A.)

## 8. Completeness matrices (project spec rules)

- **Tier × domain DB matrix:** N/A — zero DDL, zero CHECK, zero RPC, zero trigger changes. `parse_warnings` jsonb schema is opaque to the DB layer; `blockRef.field` rides through.
- **CHECK/enum migration matrix:** N/A — no CHECK or enum changes.
- **Flag lifecycle table:** no boolean config flags introduced. The nearest analog, `AMBIGUITY_CODES` membership: storage = `lib/parser/ambiguityCodes.ts` literal | write = parser emit sites | read = `step3SectionStatus` derivation + walker meta-test | effect = wizard third state. No zombie columns.
- **Build-vs-runtime gates:** N/A — no env-gated behavior.

## 9. Signal-routing completeness (per new code)

| Code | Aggregator | parse_warnings persist | GAP_CLASSES / chip | Regression gate | Wizard | §12.4 + catalog | AMBIGUITY_CODES |
|---|---|---|---|---|---|---|---|
| ROOM_HEADER_SPLIT_AMBIGUOUS | yes | yes (existing path) | yes | yes (as gap class) | judgment state | yes | yes |
| HOTEL_GUEST_SPLIT_AMBIGUOUS | yes | yes | yes | yes | judgment state | yes | yes |
| DATE_ORDER_SUGGESTS_DMY | yes | yes | yes | yes | judgment state | yes | yes |
| HOTEL_CARDINALITY_EXCEEDED | yes (promoted from log-only) | yes | yes | yes | flagged state (not ambiguity) | yes | **no** |

Existing registry joiner (`CREW_COLUMN_POSITIONAL_FALLBACK`): no emission change; its wizard rendering shifts from flagged to judgment when it is a section's only warning. This is an intentional, disclosed behavior change (it is a judgment call — the new rendering is the truthful one). `AGENDA_DAY_AMBIGUOUS` stays outside the registry (§3.2) and renders flagged, unchanged.

## 10. Testing contract

TDD per task (invariant 1). Per site: fixture-derived ambiguous inputs (a multi-dims room header; a glued guest cell with interior digit run; a DMY-ordered numeric date sequence) asserting against the **warnings array + blockRef.field** (anti-tautology: never scan a container that renders both the value and the flag; expected values derived from the fixture, not hardcoded). Negative tests: well-formed inputs at each site emit nothing; both-readings-unordered dates emit nothing; a DMY-invalid numeric anywhere in the block suppresses the date code. **Date-collector placement proof (required):** tests for BOTH the v1 walker and the v2/v4 walker using an encounter-order fixture whose dates SORT clean but ENCOUNTER dirty (e.g. rows 4/3, 3/4 — sorted ascending masks the violation) — proving the collector runs pre-`showDays.sort()` in each version; a post-sort implementation fails these tests. Guard/NaN/empty inputs per §4.3 guards. Walker meta-test per §6. Wizard: derivation unit tests for §7.1/§7.2 including the mixed-warning and M=0 guards. Class-sweep before push: warning-shape `toEqual` assertions (§5), `pnpm test` full suite + typecheck + eslint + format:check (memory: scoped gates miss regressions; vitest strips types; canonical Tailwind; --no-verify bypasses prettier).

**Meta-test inventory (writing-plans rule):** CREATES `tests/parser/_metaTransformSitesWalker.test.ts`; EXTENDS `tests/parser/dataGapsClassCompleteness.test.ts` (pins `GAP_CLASSES` counts/partition — the four new `GAP_CLASSES` entries update its expected counts and classification rows). Advisory-lock topology: untouched (no mutation-path changes — parser + UI only). Mutation harness: `SECTION_DOMAIN_MAP` (`tests/parser/mutation/classify.ts:36-72`) is section-keyed, not warning-code-keyed — no registration needed; confirmed at citation pass.

## 11. Do-not-relitigate register

1. Full per-field confidence model: evaluated, rejected, no re-evaluate commitment (user decision 2026-07-07).
2. Site scope = the four named (one shipped); other transform sites get documented walker exemptions (user decision).
3. `severity:"warn"` + registry class, no new severity band (user decision; audit's dark-`info` finding is the counter-evidence to any "use info" proposal).
4. Ambiguity never blocks publish; third count is publishable (user decision; matches audit's "signal-to-look, not gate" framing at §6 cross-flow note).
5. Walker enforces declaration not detection — calibrated limit, §6.
6. Per-date numeric ambiguity warning rejected for fatigue; sequence check is the deliberate replacement (§4.3).
7. Placeholder room-drop silence (`rooms.ts:815`) is out of scope — coverage class, not ambiguity class.
