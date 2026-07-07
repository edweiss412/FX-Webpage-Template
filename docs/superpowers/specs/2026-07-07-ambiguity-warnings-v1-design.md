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
  "AGENDA_DAY_AMBIGUOUS",            // existing (catalog.ts:1346) — joins retroactively
  "ROOM_HEADER_SPLIT_AMBIGUOUS",     // new, §4.1
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",     // new, §4.2
  "DATE_ORDER_SUGGESTS_DMY",         // new, §4.3
]);
export function isAmbiguityCode(code: string): boolean {
  return AMBIGUITY_CODES.has(code);
}
```

Location rationale: the class is a parser-emission concept consumed by UI; `lib/parser/` keeps it importable by both without `lib/messages` gaining a parser dependency. `HOTEL_CARDINALITY_EXCEEDED` (§4.2b) is NOT in the registry — it reports a detected problem (truncation), not a judgment call.

### 3.3 Routing

`severity:"warn"` + membership in `GAP_CLASSES` (`lib/parser/dataGaps.ts:30-56`; precedent: `CREW_COLUMN_POSITIONAL_FALLBACK` at line 55). All four new codes (three ambiguity sites + the promoted `HOTEL_CARDINALITY_EXCEEDED`, §9) are appended to `GAP_CLASSES`, so they flow to the dashboard chip, per-show panel, and the `isQualityRegression` gate (`dataGaps.ts:110-118`) exactly like the shipped precedent. Nothing dark: no new severity band, no filter changes.

## 4. Warning sites

All emissions go through the `ParseAggregator` (`lib/parser/warnings.ts:15` — `{ warnings: ParseWarning[]; rawUnrecognized[] }`), following the existing emit-helper pattern in `warnings.ts`. Each site's helper lives in `warnings.ts` (or the block's local warnings module, matching `agendaWarnings.ts` precedent) and stamps `blockRef` with the new `field` member (§5).

### 4.1 `ROOM_HEADER_SPLIT_AMBIGUOUS` — rooms name/dims split

`splitRoomHeader(raw, kind)` (`lib/parser/blocks/rooms.ts:1439`) separates a raw header cell into room name + dims. Emit when the split had to choose between plausible alternatives:

- more than one dims-shaped token present in the raw header (which one is THE dims?);
- the raw header is dims-leading (name reconstruction is inferential);
- the residual name after strip is empty or degenerate (single char / punctuation only) while the raw was non-trivial — the strip consumed what may have been the name.

Exact branch enumeration happens at plan time against `splitRoomHeader`'s real structure (writing-plans pre-draft verification); the spec contract is: **every branch of `splitRoomHeader` where two readings were possible and one was picked emits exactly one warning** with `blockRef: { kind: "rooms"|<breakout kind>, name: <parsed room name>, field: "dims" | "name" }` and `rawSnippet` = the raw header cell.

Non-goals at this site: the placeholder-drop path (`rooms.ts:815`) stays silent — that is a coverage gap (audit #10/#4 family), not an ambiguity, and is out of scope here.

### 4.2 `HOTEL_GUEST_SPLIT_AMBIGUOUS` — hotels guest glue/split

`parseGuestCell(cell)` (`lib/parser/blocks/hotels.ts:117`) splits a guest cell into names + conf numbers. Emit when:

- the no-token fallback (`hotels.ts:147` — whole segment treated as one guest name) fires on a segment whose shape suggests multiple glued guests (≥ 4 name-like tokens, or an interior conf-number-shaped digit run that the token regex did not consume);
- a trailing un-numbered tail was appended as a guest (the `tail` branch) — the tail may be a guest or may be trailing noise.

`blockRef: { kind: "hotels", name: <hotel name>, field: "guests" }`, `rawSnippet` = the raw cell.

**4.2b — thread the aggregator into hotels.** The local `warn()` helper (`hotels.ts:40-44`) is log-only (`HOTELS_PARSE_WARNING` telemetry — audit §4 "dark" class). This spec threads `ParseAggregator` into the hotels parse path and converts the one call site (`hotels.ts:84`, cardinality overflow) into a real ParseWarning with code `HOTEL_CARDINALITY_EXCEEDED`, `severity:"warn"`, `blockRef: { kind: "hotels" }`. The `HOTELS_PARSE_WARNING` telemetry emit may remain alongside (log + aggregator are not mutually exclusive); the local `warn()` helper is deleted if no call sites remain. `HOTEL_CARDINALITY_EXCEEDED` joins `GAP_CLASSES` but NOT `AMBIGUITY_CODES` (§3.2).

### 4.3 `DATE_ORDER_SUGGESTS_DMY` — dates block sequence check

Numeric slash/dash dates are always read MDY (`lib/parser/blocks/_helpers.ts:154-155`; precedence chain ISO→slash→dash→lfMDY→lfDMY at `:149`). A per-date "day ≤ 12 is ambiguous" warning would fire on nearly every US sheet — fatigue, rejected.

Instead, a **block-level sequence check** after the DATES section parses: if the parsed date sequence is non-monotonic under the MDY reading, AND re-interpreting every numeric slash/dash date as DMY yields a monotonic (non-decreasing) sequence, emit ONE warning: `blockRef: { kind: "dates", field: "order" }`, `rawSnippet` = the first out-of-order raw date. This fires exactly in the real mis-read scenario (coordinator wrote DMY) and never on a well-ordered US sheet.

Guard conditions: fewer than 2 parseable dates → no check (vacuously ordered). Dates equal under both readings (e.g. 5/5) contribute to neither violation nor rescue. If BOTH readings are non-monotonic → no warning (sheet is just out of order; existing behavior unchanged). Longform/ISO dates are fixed points (only numeric slash/dash re-interpret).

### 4.4 Copy + catalog obligations (all four codes)

Each new code is admin-visible: full §12.4 three-way lockstep (AGENTS.md rule 5 + §12.4 discipline) — master-spec table row (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2768-2853`) + helpfulContext YAML appendix entry + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` row (8-field shape; copy template: `CREW_COLUMN_POSITIONAL_FALLBACK` at `catalog.ts:1242-1254`) + `pnpm gen:internal-code-enums`, all in the same commit. Doug-facing copy is action-first, names the sheet location, no raw codes (rule 5). crewFacing: null for all four (crew never sees parse internals). Copy drafts land at plan time; the master spec is NEVER prettier-formatted (memory: prettier mangles §12.4 cells).

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

Walker asserts: (1) export present on every file (no allowlist analog to `NO_SECTION_OPENER` — a block with zero transform sites exports `[]`); (2) every `code` value exists in the catalog (`isMessageCode`, `lib/messages/lookup.ts:91`) AND is `severity:"warn"`-cataloged; (3) every `code` claimed as ambiguity-class is in `AMBIGUITY_CODES`; (4) the four sites named in this spec appear with their codes (pins this spec's deliverable against silent removal).

**Honest limit (stated, not hidden):** the walker enforces declaration, not detection — a NEW undeclared transform inside an EXISTING file is caught at review, not by CI. The fails-by-default property covers new block files and any drift in declared sites. Optional hardening (grep-guard on suspicious patterns à la the no-inline-email guard) was considered and deferred: transform-shaped code (`.split`/`.replace`/regex exec) is ubiquitous in a parser; a grep-guard would drown in exemption comments. This is a deliberate calibration, not an oversight — do not relitigate without a concrete escaped-bug instance.

Deferred-exemption seeds (documented at plan time after per-file enumeration): expected entries include stage-clause extraction (`personalization.ts` — already warns via `UNKNOWN_STAGE_RESTRICTION` family), dims normalization (`_dimsToken.ts` consumers — deterministic), name canonicalization sites, address parsing (`hotels.ts` — `deferred:BACKLOG`).

## 7. Wizard Step 3 — third state

UI surface ⇒ Opus-owned, impeccable v3 critique + audit dual-gate (AGENTS.md invariant 8).

### 7.1 Section status derivation

`sectionForWarning()` / section-status logic (`step3SectionStatus.ts:69-81`, `KIND_TO_SECTION` at `:21-44`) currently yields flagged/clean. New derivation per section:

- **flagged** — has ≥1 warning that is NOT ambiguity-class (unchanged semantics);
- **judgment** (new) — has ≥1 warning, ALL of them `isAmbiguityCode`;
- **clean** — zero warnings (unchanged).

Null/unmapped `blockRef.kind` routing is untouched (audit item 2.3 is separate scope).

### 7.2 Summary counts

`renderSummary()` (`Step3Review.tsx:845-918`, `rowNeedsLook()` at `:828-836`): replace the two-bucket derivation with three counts — **"N clean · M parsed with judgment — spot-check · K flagged."** Exact copy is an impeccable-gate deliverable; the contract here is: three distinct counts, judgment-count wording prompts a glance without implying error, and the sum N+M+K equals the section total. Ambiguity-only sections do NOT join `rowNeedsLook`'s blocking styling and do NOT block publish.

Guard conditions: M=0 renders the existing two-state summary (no empty "0 parsed with judgment" chrome). All-zero (no sections) is the existing empty-wizard state, unchanged. A section with ambiguity + non-ambiguity warnings is **flagged** (K), counted once.

### 7.3 Section chrome

`SectionFlagCallout` (`step3ReviewSections.tsx:469-514`): judgment sections get a visually distinct callout variant — "We made a judgment call reading this — worth a glance" + the entry list (existing `CALLOUT_MAX_ENTRIES` cap at `:480` applies unchanged) + the existing "In sheet ↗" deep-link (`:548-559`) which is the spot-check affordance. Entry text includes the `blockRef.field` when present ("dims for ROOM A"). Visual treatment (color/token choice distinct from flagged amber and from clean) is an impeccable-gate deliverable within existing `DESIGN.md` tokens.

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

Existing registry joiners (`CREW_COLUMN_POSITIONAL_FALLBACK`, `AGENDA_DAY_AMBIGUOUS`): no emission change; their wizard rendering shifts from flagged to judgment when they are a section's only warnings. This is an intentional, disclosed behavior change (they are judgment calls — the new rendering is the truthful one).

## 10. Testing contract

TDD per task (invariant 1). Per site: fixture-derived ambiguous inputs (a multi-dims room header; a glued guest cell with interior digit run; a DMY-ordered numeric date sequence) asserting against the **warnings array + blockRef.field** (anti-tautology: never scan a container that renders both the value and the flag; expected values derived from the fixture, not hardcoded). Negative tests: well-formed inputs at each site emit nothing; both-readings-unordered dates emit nothing. Guard/NaN/empty inputs per §4.3 guards. Walker meta-test per §6. Wizard: derivation unit tests for §7.1/§7.2 including the mixed-warning and M=0 guards. Class-sweep before push: warning-shape `toEqual` assertions (§5), `pnpm test` full suite + typecheck + eslint + format:check (memory: scoped gates miss regressions; vitest strips types; canonical Tailwind; --no-verify bypasses prettier).

**Meta-test inventory (writing-plans rule):** CREATES `tests/parser/_metaTransformSitesWalker.test.ts`; EXTENDS none. Advisory-lock topology: untouched (no mutation-path changes — parser + UI only). Mutation harness: `SECTION_DOMAIN_MAP` (`tests/parser/mutation/classify.ts:36-72`) is section-keyed, not warning-code-keyed — no registration needed; confirmed at citation pass.

## 11. Do-not-relitigate register

1. Full per-field confidence model: evaluated, rejected, no re-evaluate commitment (user decision 2026-07-07).
2. Site scope = the four named (one shipped); other transform sites get documented walker exemptions (user decision).
3. `severity:"warn"` + registry class, no new severity band (user decision; audit's dark-`info` finding is the counter-evidence to any "use info" proposal).
4. Ambiguity never blocks publish; third count is publishable (user decision; matches audit's "signal-to-look, not gate" framing at §6 cross-flow note).
5. Walker enforces declaration not detection — calibrated limit, §6.
6. Per-date numeric ambiguity warning rejected for fatigue; sequence check is the deliberate replacement (§4.3).
7. Placeholder room-drop silence (`rooms.ts:815`) is out of scope — coverage class, not ambiguity class.
