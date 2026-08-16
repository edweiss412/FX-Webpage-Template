# Field Near-Miss Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the governing spec first: `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md` (§1.1 is do-not-relitigate).

**Goal:** Replace the positional `UNKNOWN_FIELD` sweep with a content-keyed near-miss detector (spec AC-N1..N7), landing the 65-row calibrated baseline (r4-recalibrated, spec §3.2) and closing `BL-MUTATION-SECTION-ORDER`.

**Architecture:** A consumption ledger on `ParseAggregator` records curated row resolutions; a new lib/parser/fieldNearMiss.ts (created by this plan) document pass matches unresolved rows against the derived vocabulary (v3 normalization + three guards) and becomes the sole `UNKNOWN_FIELD` emitter; the venue scope-window and event fallback emissions are retired. (No entity-decode repair ships - the encoded rooms header is already recognized and deliberately stub-gated; see the retired-task note.)

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, parser mutation harness (8 shards), source-mutation guard registry.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md`; its §1.1 items 1–8 are user-ratified, do-not-relitigate.
- Warn, never hard-fail: severity `"warn"`, parse output preserved (NO payload change anywhere - spec 2.3 resolved as no-change).
- `UNKNOWN_FIELD` code kept — no new warn code, no enum churn.
- Copy rules: no raw error codes in UI copy, NO em-dashes in user-visible copy, apostrophes as `'`.
- §12.4 lockstep: catalog `dougFacing` is text-compared by `tests/cross-cutting/codes.test.ts:78-79` — master-spec §12.4 row + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` + card copy land in ONE commit (Task 5).
- Commit per task, `feat(parser):` / `test(parser):` conventions. TDD per task.
- Heavy phases under `pnpm heavy` (full suite, mutation harness, build).
- Baseline discipline: committed JSON + env-var regen, never `toMatchSnapshot` (pattern: `tests/parser/venueSignalParity.test.ts`).
- Premise guards from `tests/_shared/premise.ts:36` on boundary-dependent assertions.
- Anti-tautology four-mutant check (writing-plans rule; plan-r1 finding 5) on EVERY string-presence assertion before its task is declared done - empty-value, suffix, dead-string, and discriminating-parameter mutants, each observed to flip the assertion: applies to Task 1's ledger-key assertions (`hasEntry`/`split` checks), Task 2's `vocab.has(...)` premises, Task 4's filesystem single-call-site count, and Task 6's `GUARD_SURFACES` id-membership assertion. Record the four observations in each task's commit body.

## Meta-test inventory

- **CREATES:** tests/parser/fieldNearMiss.test.ts (created) (detector unit suite), tests/parser/fieldNearMissBaseline.test.ts (created) (65-row corpus pin), single-call-site structural pin (inside fieldNearMiss.test.ts), tests/parser/consumptionLedger.test.ts (created).
- **EXTENDS:** `tests/mutation/source/registry.ts` (+1 `GuardSurface` row, Task 6), `tests/parser/mutation/knownHoles.ts` (−10 rows, Task 6), `tests/parser/venueSignalParity.test.ts` baseline (deliberate regen, Task 4).
- Advisory-lock topology: N/A — no `pg_advisory*` surface. Supabase call-boundary registry: N/A — no Supabase calls.

## Mutation-operator family enumeration (closure set for review)

The `fieldNearMiss` enrollment (Task 6) declares the registry's standard `OPERATOR_NAMES` set (`tests/mutation/source/registry.ts` — same set as the `ledgerClaimsCore` row at `registry.ts:329-334`). Convergence on "does the suite pin the detector" is the mutation score + empty unaccepted-survivor set; a new operator family is admissible only with a live escaping mutant against the shipped guard.

## Retired task: entity-decode repair (numbering gap Task 3 is deliberate)

The r2 re-review probed all three proposed sites: isKnownSectionHeader and canonicalSectionKind already recognize the raw entity text; parseAdditionalRoom (lib/parser/blocks/rooms.ts:1463) already decodes at rooms.ts:1478 and matches; the block is then dropped by rooms' deliberate anti-phantom stub gate (rooms.ts:1491). Spec 2.3 (as amended) ratifies NO CHANGE: the rows are already excluded from candidacy and the stub gate is a prior design decision this arc does not reopen. AC-N4 is N/A. No steps.

<!-- tasks: depth=3 -->

### Task 1: Consumption ledger on the aggregator

<!-- task: red=`pnpm exec vitest run tests/parser/consumptionLedger.test.ts` ac=AC-N1 -->

**Files:**
- Modify: `lib/parser/warnings.ts` (ParseAggregator type, newAggregator - lib/parser/warnings.ts:17-24)
- Modify: `lib/parser/blocks/event.ts` (curated exact-match branch, CANONICAL_KEY_MAP hit, lib/parser/blocks/event.ts:186)
- Modify: `lib/parser/blocks/contacts.ts` (regex resolution acceptance path, hasContactSignal usage, lib/parser/blocks/contacts.ts:63-66)
- Modify: `lib/parser/blocks/transport.ts` (V2_SCHEDULE_LABELS membership at lib/parser/blocks/transport.ts:108 AND the v4 driver regex path at lib/parser/blocks/transport.ts:217 - plan-r1 finding 2)
- Create: tests/parser/consumptionLedger.test.ts (created)

**Interfaces:**
- Produces: `ParseAggregator.consumed: Map<string, number>` (key = `` `${blockOpener.trim()}\u0000${col0.trim()}\u0000${value.trim()}` ``, value = count) and `markConsumed(agg: ParseAggregator | undefined, blockOpener: string, col0: string, value: string): void` exported from `lib/parser/warnings.ts`. `blockOpener` = the raw first-cell text of the section-opening row the resolving parser matched (plan-r1 finding 1: three fixtures carry byte-identical `Room Diagram` empty-value rows in BOTH a DETAILS-family block and the Timestamp block - a label+value key cannot separate the consumed DETAILS occurrence from the must-warn Timestamp occurrence, and count depletion is document-order-dependent; the opener-keyed triple is swap-invariant because the opener moves with its rows - probe record `docs/superpowers/specs/parser/probes/2026-08-15-plan-r1-sweeps.md` section 4). The detector checks membership with the candidate row's own physical block opener. CURATED resolutions only call it: `event.ts` exact-branch (NOT the `toCanonicalKey` fallback at `event.ts:222` — spec §3.3), `contacts.ts` regex-accepted rows, `transport.ts` BOTH resolution paths - the `V2_SCHEDULE_LABELS` membership AND the v4 driver regex `/^(?:equipment transporter|load in:?|driver)$/i` at lib/parser/blocks/transport.ts:217, which is the path that actually resolves the corpus `Load In:` row (plan-r1 finding 2; without it the baseline lands at 66, not 65). Alias-resolved rows (`resolveAlias` non-null) need no ledger mark — the detector's candidate check already excludes them statically.

- [ ] **Step 1: Write the failing test.** RED because `ParseAggregator` has no `consumed` field on the live tree (verified absent): the test imports only existing symbols (`newAggregator`, `parseEventDetails`), so the failure is the runtime `TypeError` at `[...agg.consumed.keys()]` — not an import error (r5 correction).

```ts
// tests/parser/consumptionLedger.test.ts
// Spec §3.3 (resolution-site): curated RESOLUTIONS mark rows consumed - including
// resolved rows whose value is empty/filtered; fallback self-slug storage does NOT.
// Failure modes caught: fallback rows wrongly ledgered (would silence Stage/Storage, the
// corpus's most-confirmed true positives); curated rows not ledgered (Room Diagram would
// self-report as a near-miss); write-site marking regression (empty-value Room Diagram
// unledgered would resurrect the r4 self-near-miss false-positive class).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { newAggregator } from "@/lib/parser/warnings";
import { parseEventDetails } from "@/lib/parser/blocks/event";
import { parseTransportation, TRANSPORT_SCHEDULE_VOCAB } from "@/lib/parser/blocks/transport";
import { premiseHolds } from "@/tests/_shared/premise";

const hasEntry = (keys: string[], opener: string, c0: string) =>
  keys.some((k) => k.startsWith(`${opener}\u0000${c0}\u0000`));

describe("consumption ledger (spec §3.3)", () => {
  const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");

  it("curated event resolution marks consumed; fallback self-slug does not", () => {
    premiseHolds("fixture has a DETAILS section with Stage row", /\|\s*Stage\s*\|/.test(md));
    const agg = newAggregator();
    parseEventDetails(md, "v4", agg);
    const consumedKeys = [...agg.consumed.keys()];
    // "Stage"/"Storage" take event.ts's unknown-label fallback (self-slug storage), NOT consumed
    // (label position 2 of the opener\u0000label\u0000value triple - no key carries them)
    expect(consumedKeys.some((k) => k.split("\u0000")[1] === "Stage")).toBe(false);
    expect(consumedKeys.some((k) => k.split("\u0000")[1] === "Storage")).toBe(false);
    // At least one curated CANONICAL_KEY_MAP row from the fixture IS consumed
    expect(agg.consumed.size).toBeGreaterThan(0);
    // Resolution-site: the fixture's EMPTY-value "Room Diagram" row (DETAILS block) is
    // consumed even though presence() suppresses its write - the r4 semantics distinction.
    // Keyed under the DETAILS opener; an identical Timestamp-block row stays unledgered
    // (plan-r1 finding 1 occurrence identity).
    expect(hasEntry(consumedKeys, "DETAILS", "Room Diagram")).toBe(true);
  });

  it("transport driver-regex resolution marks consumed (plan-r2 finding 1)", () => {
    // fintech's Load In: row resolves via the v4 driver regex (transport.ts:217), the
    // path Part C proved consumes it (CONSUMED_OTHER_KEY, changed=[transportation.driver_name]).
    // Failure mode caught: a transport file left unmarked lets Load In: warn -> baseline 66.
    const tmd = readFileSync("fixtures/shows/exporter-xlsx/fintech.md", "utf8");
    premiseHolds("fixture has the Load In: driver row", /\|\s*Load In:\s*\|\s*Carlos Pineda\s*\|/.test(tmd));
    const agg = newAggregator();
    parseTransportation(tmd, "v4", undefined, agg); // agg is the 4th param (transport.ts:134-140)
    const keys = [...agg.consumed.keys()];
    expect(hasEntry(keys, "TRANSPORTATION", "Load In:")).toBe(true);
  });

  it("V2 schedule-label membership marks consumed (plan-r3 finding 1)", () => {
    // The fintech v4 fixture resolves its stage rows via seenDateHeader, so membership
    // needs its own witness: a constructed v2 doc where V2_SCHEDULE_LABELS.has(label)
    // is the resolving condition (transport.ts:306 OR-branch and :400 both mark).
    // Failure mode caught: driver-regex mark alone turns the suite green with the
    // membership mark absent (plan-r3 finding).
    premiseHolds(
      "schedule vocabulary contains RENTAL PICKUP",
      TRANSPORT_SCHEDULE_VOCAB.includes("RENTAL PICKUP"),
    );
    // Header MUST match the live v2 matcher /^\|\s*TRANSPORTATION\s*\|\s*(?:NAME|TRANSPORTATION)\s*\|\s*PHONE\s*\|/im
    // (transport.ts:353 - a two-column header returns null before any membership branch; plan-r4 finding).
    const v2md = ["| TRANSPORTATION | TRANSPORTATION | PHONE |", "| Rental Pickup | 5/12 @ 8:00 AM |  |"].join("\n");
    const agg = newAggregator();
    parseTransportation(v2md, "v2", undefined, agg);
    expect(hasEntry([...agg.consumed.keys()], "TRANSPORTATION", "Rental Pickup")).toBe(true);
  });
});
```

- [ ] **Step 2: FAIL:** `pnpm exec vitest run tests/parser/consumptionLedger.test.ts` — both cases fail on the missing `agg.consumed` Map (`TypeError`), and after the aggregator field exists the two transport cases each stay RED until THEIR mark lands - the driver-regex case pins transport.ts:217 and the constructed-v2 case pins V2_SCHEDULE_LABELS membership (both usage sites, transport.ts:306/:400), so the marker command cannot go green with either transport path unmarked (plan-r2/r3 findings).
- [ ] **Step 3: Implement.** In `lib/parser/warnings.ts`: add `consumed: new Map<string, number>()` to `newAggregator()`, extend the `ParseAggregator` type, export `markConsumed` (increments the count; no-op on undefined agg). Mark AT THE RESOLUTION SITE, BEFORE any presence()/sentinel write filter (spec 3.3 resolution-site semantics, r4 recalibration): in `event.ts` both the curated exact-match branch AND the gated fuzzy correction (`gatedVocabCorrect`, lib/parser/blocks/event.ts:200-212 and event.ts:292-298) mark the moment the label RESOLVES to a curated key — a resolved row whose value is then empty/filtered still marks (that is exactly the r4 false-positive class the semantics exist to exclude). In `contacts.ts`: mark where the regex resolves a row. In `transport.ts`: mark at BOTH resolution paths (`V2_SCHEDULE_LABELS` membership and the transport.ts:217 driver regex - the corpus `Load In:` row resolves via the regex). Every mark passes the section opener text the parser matched for the enclosing block. Do NOT touch the `toCanonicalKey` fallback. The 11-file resolver walk was RUN AT PLAN TIME (plan-r1 finding 8): per-file dispositions with evidence are in `docs/superpowers/specs/parser/probes/2026-08-15-plan-r1-sweeps.md` section 1 (MARK: event x2 sites, transport x2 sites, contacts x1; NO-MARK: the other eight, each justified). Re-verify the table against the tree in-task and cite it in the commit body; the committed baseline remains the executable arbiter for drift.
- [ ] **Step 4: PASS** the new test; also `pnpm exec vitest run tests/parser/blocks/event.test.ts tests/parser/blocks/venue.test.ts` (payload untouched).
- [ ] **Step 5: Commit** `feat(parser): consumption ledger on ParseAggregator (curated resolutions only)`

### Task 2: The detector module

<!-- task: red=`pnpm exec vitest run tests/parser/fieldNearMiss.test.ts` ac=AC-N1,AC-N2 -->

**Files:**
- Create: lib/parser/fieldNearMiss.ts (created by this plan)
- Modify: `lib/parser/warnings.ts` (`emitUnknownField` gains `candidate?: string` opt; message appends "looks like '<candidate>'" when present — spec §5's decided carrier, landed HERE so Task 4's baseline can read `warning.candidate` and Task 5 touches copy only)
- Modify: `lib/parser/types.ts` (the `ParseWarning` type at lib/parser/types.ts:67 gains the optional structured `candidate?: string` field — r5 finding 2: the type lives here, not in warnings.ts)
- Modify: `lib/parser/sectionKind.ts` (export `LABEL_TO_KIND_KEYS` — Step 3)
- Create: lib/parser/sectionHeaderTokens.ts (created — barrel, Step 3)
- Create: tests/parser/fieldNearMiss.test.ts (created)

**Interfaces:**
- Consumes: `FIELD_ALIASES` (`lib/parser/aliases.ts:19`), `resolveAlias` (`aliases.ts:166`), `isKnownSectionHeader` (`lib/parser/knownSections.ts:202`), `canonicalSectionKind` (`lib/parser/sectionKind.ts:82`), `decodeEntities` (`lib/parser/blocks/_helpers.ts:65`), `parseTableRows` (`_helpers.ts:20`), `ParseAggregator.consumed` (Task 1).
- Produces: `detectFieldNearMisses(markdown: string, agg: ParseAggregator): void` — emits `UNKNOWN_FIELD` warnings via `emitUnknownField` with the new `candidate` opt (the matched vocabulary entry's RAW spelling, spec §3.1 tie-break). Also exports `buildVocabulary(): Map<string, VocabEntry>` where `VocabEntry = { tokens: Set<string>; raw: string }` (insertion order = derivation order; first raw spelling wins — spec §3.1) and `normalizeV3(raw: string): string` / `fusedForm(raw: string): string` for the test suite and mutation operators. `ParseWarning.candidate?: string` is readable by Task 4's baseline generator.

Spec §3.1 is the normative rule; transcribe it exactly:

```ts
// lib/parser/fieldNearMiss.ts - spec §2.2/§3.1 (calibrated 2026-08-15, probe record under docs/superpowers/specs/parser/probes/)
import { FIELD_ALIASES, resolveAlias } from "./aliases";
import { isKnownSectionHeader } from "./knownSections";
import { canonicalSectionKind, LABEL_TO_KIND_KEYS } from "./sectionKind"; // export the keys (see Step 3)
import { decodeEntities, parseTableRows } from "./blocks/_helpers";
import { emitUnknownField, type ParseAggregator } from "./warnings";
import { SECTION_HEADER_TOKEN_SETS } from "./sectionHeaderTokens"; // new barrel (Step 3)

export const normalizeV3 = (raw: string): string =>
  decodeEntities(raw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const fusedForm = (raw: string): string =>
  normalizeV3(decodeEntities(raw).replace(/([A-Za-z0-9])-([A-Za-z0-9])/g, "$1$2"));

const tokens = (s: string): Set<string> => new Set(s.split(" ").filter(Boolean));

export type VocabEntry = { tokens: Set<string>; raw: string };

// Insertion order IS the spec §3.1 tie-break: derivation order, first raw spelling wins,
// first matching entry selected, candidate reported as that entry's raw spelling.
export function buildVocabulary(): Map<string, VocabEntry> {
  const raw: string[] = [
    ...Object.values(FIELD_ALIASES).flat(),
    ...SECTION_HEADER_TOKEN_SETS.flat(),
    ...LABEL_TO_KIND_KEYS,
  ];
  const vocab = new Map<string, VocabEntry>();
  for (const r of raw) {
    const n = normalizeV3(r);
    if (n && !vocab.has(n)) vocab.set(n, { tokens: tokens(n), raw: r });
  }
  return vocab;
}

const DISTINCTIVENESS_MAX = 4; // = vocab doc-frequency of "address", the least-distinctive required TP (spec §3.1)
const MIN_LEN = 5;
// ALL-CAPS single-token guard, EXACTLY the calibration executable's form (r4 finding 6):
// raw label matches /^[A-Z0-9&/#'.\-]+$/ AND its normalized token set has size 1.
const ALL_CAPS_RAW = /^[A-Z0-9&/#'.\-]+$/;
const isAllCapsSingle = (rawLabel: string, normTokens: Set<string>): boolean =>
  ALL_CAPS_RAW.test(rawLabel) && normTokens.size === 1;

// ... subset-or-equal match over plain + fused forms (first matching entry in insertion
// order wins), guards per spec §3.1, then for each unresolved candidate row (not
// alias/section-resolved, not in agg.consumed):
//   emitUnknownField(agg, { block, kind, key: col0, value, candidate: entry.raw })
//   where kind/block follow the spec 2.2 anchor-namespace mapping: "venue" for the venue
//   block, "details" for DETAILS-family blocks, else the normalized block-opener label.
```

(The elided match/guard body is fully specified by spec §3.1 plus the follow-up probe's Part B v3 rule implementation (`docs/superpowers/specs/parser/probes/2026-08-15-near-miss-followup-probe.ts`, the `firingsV3` computation — the measured artifact; the calibration probe's earlier rule is the retired v0). Both probes are runnable from their committed paths: `pnpm exec tsx --tsconfig tsconfig.json <path>`. The `emitUnknownField` `candidate?: string` opt + `ParseWarning.candidate` structured field land in THIS task (see Files); Task 5 aligns catalog copy only.)

- [ ] **Step 0: Create the module SKELETON first** so the RED is behavioral, never an unresolved import (plan-r1 finding 3: import-failure REDs are test-local and invalid): lib/parser/fieldNearMiss.ts with the full typed export surface (`normalizeV3`/`fusedForm` returning the v3 forms - they are two lines and not the behavior under test; `buildVocabulary` returning an EMPTY map; `detectFieldNearMisses` as a no-op). Commit boundary is still one commit for the task.
- [ ] **Step 1: Write the failing test** — RED behaviorally: the empty vocabulary and no-op detector make every TP assertion fail (`vocab.has("stage size")` premise fails loudly first, naming the gap). Cases, each naming its failure mode:
  - TP fixtures fire: `Stage`→`Stage Size`, `Storage`→`Equipment Storage`, `Address:`→`VENUE ADDRESS`-family, `Phone:`→`Client Phone`, `Client:/Contact:`→`Client Contact` (v3 punctuation collapse), `E-mail:`→email aliases (fused form). Derive inputs from real fixture lines, not invented strings.
  - Guard-suppressed classes stay silent (one case each): crew-roster name row, agenda time row (`8:00 AM`), gear pull-sheet item row (`DIGITAL AUDIO CONSOLE- QU32 CONSOLE`), `NO_HEADER` artifact row, `#REF!` residue row, the ALL-CAPS guard witness `ADDRESS` (NOT `INTERNAL` - plan-r1 finding 4: `INTERNAL` has no vocabulary match and never reaches the guard; `ADDRESS` matches the `VENUE ADDRESS` family and is suppressed ONLY by the all-caps guard - probe record section 5), the min-length witness `NAME` (matches `VENUE NAME`, suppressed only by MIN_LEN), `Details?`, and an `agg.consumed`-ledgered row (Task 1 integration).
  - EVERY negative/suppression case carries a CASE-LOCAL executable premise on its own input (plan-r1 finding 4 - not just the positive TPs): a suppression case first proves its input matches vocabulary absent the guard under test (e.g. for `ADDRESS`: `premiseHolds("ADDRESS matches vocabulary sans guard", matchesSansGuards("ADDRESS"))` via an exported guard-free matcher or an equivalent probe through `buildVocabulary`); a ledger-silence case first proves the row IS ledgered; Task 4's outside-block TYPO/null-anchor negatives first prove the row exists in the fixture at the asserted block.
  - Pinned residual classes fire exactly as baselined (spec 3.2 authority): a Timestamp-block forms-echo row, `Speaker`, `Diagrams?`.
  - Consumption-excluded classes stay silent BOTH ways (spec 3.3 resolution-site semantics): a curated row with a written value (consultants `Notes`) AND a curated row with an EMPTY value (east-coast DETAILS-block `Room Diagram`) — the empty case is the r4 false-positive class; Stage/Storage in the same block still fire (fallback self-slug is not resolution).
  - Guard premises: `premiseHolds("vocabulary contains the target alias", vocab.has("stage size"))` before each TP assertion.
  - (The single-call-site structural pin is NOT in this task's suite — Task 2 would otherwise commit a RED test, violating TDD-per-task. Task 4 adds it after the legacy emitters are removed.)
- [ ] **Step 2: FAIL:** `pnpm exec vitest run tests/parser/fieldNearMiss.test.ts`.
- [ ] **Step 3: Implement** fieldNearMiss.ts; export `LABEL_TO_KIND_KEYS` from `sectionKind.ts` (currently unexported — calibration §1 transcribed them; export ends that duplication); create lib/parser/sectionHeaderTokens.ts (created) barrel re-exporting each block parser's `SECTION_HEADER_TOKENS` (grep-verified list: client, dates, dress, crew, event, venue, transport, rooms, hotels — calibration §1). All Task 2 tests GREEN at this task's commit boundary (the structural pin belongs to Task 4).
- [ ] **Step 4: Commit** `feat(parser): field near-miss detector module (v3 normalization, calibrated guards)`

### Task 4: Wire the detector, retire both legacy emitters, land the baseline

<!-- task: red=`pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts tests/parser/venueSwapInvariance.test.ts tests/parser/fieldNearMiss.test.ts` ac=AC-N1,AC-N2,AC-N3,AC-N5,AC-N8,AC-N9 -->

**Files:**
- Modify: `lib/parser/index.ts` (call `detectFieldNearMisses` at the block-parsers-finished seam — same family as the `normalizeLeadingColumn` call)
- Modify: `lib/parser/blocks/venue.ts` (remove `inVenueFieldScope` unknown-field machinery + its `emitUnknownField` call; RE-GATE `TYPO_NORMALIZED` at venue.ts:135 to venue-block membership per spec 2.1 - emit iff the row's typo alias resolves (isTypo) AND the row's physical block is the venue block; venue FIELD parsing unchanged)
- Modify: `lib/drive/unknownFieldAnchors.ts` (refresh the :16 rationale comment; BLOCKS array unchanged - spec 2.1)
- Modify: `lib/parser/blocks/event.ts` (remove the fallback-branch emitUnknownField call at lib/parser/blocks/event.ts:225; keep the `toCanonicalKey` self-slug storage)
- Modify: `tests/parser/warnings.test.ts` (the two direct-`parseVenue` UNKNOWN_FIELD/raw-unrecognized cases at tests/parser/warnings.test.ts:213 and the :233 region — r5 finding 3)
- Modify: `tests/parser/blocks/venue.test.ts` (the out-of-scope-alias UNKNOWN_FIELD assertion at tests/parser/blocks/venue.test.ts:301; payload assertions untouched)
- Modify: `tests/parser/blocks/event.test.ts` (the direct-`parseEventDetails` unknown-label emission cases at tests/parser/blocks/event.test.ts:403 region)
- Create: tests/parser/fieldNearMissBaseline.test.ts (created) + tests/parser/__fixtures__/fieldNearMiss.baseline.json (created)

- [ ] **Step 1: Write the failing tests** - the baseline test AND the single-call-site pin (both observed RED; the pin is RED because three emitUnknownField call sites exist pre-removal). Baseline test: (explicit committed JSON, `UPDATE_NEAR_MISS_BASELINE=1` regen path; each baseline row carries FULL emission identity per spec AC-N1: `{fixture, key, block, kind, candidate}` - not a bare key multiset, so a wrong block/kind mapping or drifted candidate fails the pin). RED because the detector is not yet wired into `parseSheet` (production line: the missing `detectFieldNearMisses` call in `lib/parser/index.ts`) — corpus emissions are still the positional sweep's.
- [ ] **Step 2: FAIL**, then wire the detector, remove both legacy emit sites, re-gate TYPO_NORMALIZED to venue-block membership (spec 2.1), and emit kind/block by the spec 2.2 anchor-namespace mapping ("venue" for the venue block, "details" for DETAILS-family blocks, else normalized block-opener label). The single-call-site structural pin is added to fieldNearMiss.test.ts in STEP 1 of this task, BEFORE the removals, and observed RED (three call sites exist at that point: detector + the two legacy emitters - plan-r1 finding 3 demanded an observed red for this pin); this step's removals flip it GREEN. The pin: exactly one emitUnknownField call site under lib/parser/ outside warnings.ts, filesystem grep in-test.
- [ ] **Step 2a (r5 finding 3): update the four direct block-parser emission tests in this same commit** — they assert emissions the removed call sites produced and CANNOT go green otherwise (the detector runs only at the `lib/parser/index.ts` seam, so direct `parseVenue`/`parseEventDetails` calls receive no replacement emissions). New contract per site: `tests/parser/warnings.test.ts:213` ("emits UNKNOWN_FIELD for unrecognized label in venue block") flips to assert ZERO `UNKNOWN_FIELD` from direct `parseVenue`, with TWO companion parseSheet-level cases in the same describe (r6 correction - `FOO BAR` has no vocabulary match, so full-parse silence on it is the DESIGNED outcome, not a regression): (i) the same `FOO BAR` doc emits ZERO `UNKNOWN_FIELD` through the full parse (designed silence on office-side junk, spec 1.1.8), and (ii) a constructed doc with a genuine near-miss row in an unrecognized block (e.g. `| Address: | 123 Main St |`, the corpus's own colon-contact shape) emits exactly one `UNKNOWN_FIELD` through the full parse with `candidate` = the `VENUE ADDRESS` raw spelling - proving the document-seam wiring replaced, not merely deleted, the emission path; the `tests/parser/warnings.test.ts:233` raw-unrecognized case flips to assert `agg.rawUnrecognized` stays EMPTY on direct `parseVenue` (the push lives inside `emitUnknownField`, warnings.ts:365, and moves with it); `tests/parser/blocks/venue.test.ts:301` keeps its FIELD_LABEL_AUTOCORRECTED-absent assertion and flips the UNKNOWN_FIELD-present assertion to absent; `tests/parser/blocks/event.test.ts:403` region keeps its payload/self-slug assertions (`ed.rigging` still stored) and flips the emission assertions to zero-warnings, its "sensitive labels stay silent" cases now trivially green. Also DELETE the now-vacuous negative case at `tests/parser/warnings.test.ts:252` ("does NOT emit before any venue field is seen") — it pins the removed window guard and passes vacuously once no direct emission exists. This inventory was swept at plan time across ALL of tests/ (69 files reference UNKNOWN_FIELD; exactly three also call a block parser directly - full record in `docs/superpowers/specs/parser/probes/2026-08-15-plan-r1-sweeps.md` section 2). Derived cover: re-run `rg -n "UNKNOWN_FIELD" tests/parser/warnings.test.ts tests/parser/blocks/venue.test.ts tests/parser/blocks/event.test.ts` in-task and disposition every POSITIVE emission assertion reachable from a direct block-parser call (negative assertions like venue.test.ts:267/:394 stay green and stay). The `emitUnknownField` unit case at warnings.test.ts:129 calls the emitter directly and is unaffected.
- [ ] **Step 2b (AC-N8/AC-N9):** extend the baseline test file: TYPO_NORMALIZED census pinned at 0 across the corpus; unit tests for the re-keyed membership gate both directions (constructed fixture with a Hotal Contact Info row inside the venue block fires once; the corpus Hotal Contact Info rows in hotel blocks and the Virtaul Audience row stay silent, incl. under the B16/B17 swap); anchor assertions - the four Stage/Storage baseline rows resolve non-null sourceCell via resolveUnknownFieldCell (kind "details"), one Timestamp-block row asserts null (documented-safe).
- [ ] **Step 3: Generate the baseline** (`UPDATE_NEAR_MISS_BASELINE=1 pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts`), verify GREEN without the env var, and verify the count: 65 rows total (spec §3.2). If the implementation's count differs from 65, STOP and reconcile against the follow-up probe's Part D (resolution-site definitive set) before committing — the probe is rerunnable from its committed path (`pnpm exec tsx --tsconfig tsconfig.json docs/superpowers/specs/parser/probes/2026-08-15-near-miss-followup-probe.ts`; Part D prints the per-fixture set and `SUMMARY-D ... new_total=65`).
- [ ] **Step 4:** Regenerate `tests/parser/__fixtures__/venueSignalParity.baseline.json` (`UPDATE_VENUE_PARITY_BASELINE=1 ...`) — the ratified §7.2(a) delta, same commit. `tests/parser/venueSwapInvariance.test.ts` flips RED→GREEN (10/10); `tests/parser/blocks/venue.test.ts` green with payload assertions untouched (AC-N3; the one emission assertion was updated in Step 2a).
- [ ] **Step 5:** Exhaustive sweep GREEN: `pnpm heavy sh -c 'VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run tests/parser/mutationHarness.venueSwapSweep.test.ts --project mutation'`.
- [ ] **Step 6: Commit** `feat(parser): content-keyed near-miss detector replaces positional sweep (65-row baseline, ratified quieting)`

### Task 5: Copy + §12.4 fan-out (one commit)

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/codes.test.ts tests/messages/_metaWarningCardCopy.test.ts` ac=AC-N6 -->

**Files:**
- Modify: master spec §12.4 `UNKNOWN_FIELD` row (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`), `lib/messages/catalog.ts:1307-1321`, `tests/messages/warningCardCopyRegistry.ts:232-233` and `tests/messages/warningCardCopyRegistry.ts:102`, the card-copy canonical doc row (`docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:147`) — catalog/doc/registry copy ONLY; the `emitUnknownField` `candidate` carrier already landed in Task 2

- [ ] **Step 1:** Draft the near-miss copy for the SIX non-null catalog strings (title, dougFacing, followUp, helpfulContext, triggerContext, longExplanation; crewFacing is null and stays null - spec 5 enumerates why each currently asserts the retired framing; apostrophes `'`, no em-dashes, no raw codes). Update the master-spec 12.4 prose rows FIRST (dougFacing at docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2897, helpfulContext at :3253 - drafting-time locators; codes.test.ts:81-96 deep-matches four fields), run `pnpm gen:spec-codes`, then mirror in `catalog.ts`, the card-copy CANONICAL doc row (docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:147 - byte-compared by tests/messages/_metaWarningCardCopy.test.ts:94-128), the registry EXPECTED_HELPFUL_CONTEXT row (tests/messages/warningCardCopyRegistry.ts:232-233) AND the registry triggerContext fixture (warningCardCopyRegistry.ts:102). Interpolation: if the copy carries a `_<candidate>_` placeholder, wire its param through the lookup surface (lib/messages/lookup.ts:12-34); otherwise omit the placeholder deliberately and keep the candidate in the warning message only - decide and record in the commit body. RED going in: `tests/cross-cutting/codes.test.ts` fails while spec and catalog disagree mid-edit — the task's red observation point is after the spec-row edit and before the catalog edit; both land in this one commit.
- [ ] **Step 1b (plan-r1 finding 6): close the two untested copy fields.** `title` is NOT governed by any live check (`UNKNOWN_FIELD` is absent from `EXPECTED_TITLE_CHANGES`, tests/messages/warningCardCopyRegistry.ts:132) - add an `UNKNOWN_FIELD: "<new title>"` row there so the registry byte-compares it. `longExplanation` has no independent expected value - add an explicit expected-string assertion for the new `/help/errors` body to the registry fixture set (same pattern as the triggerContext fixture at warningCardCopyRegistry.ts:102). Both land in this same lockstep commit; without them the marker suites pass with those two strings stale.
- [ ] **Step 2:** All marker suites green: the two named suites + `pnpm exec vitest run tests/parser/operatorActionableWarnings.test.ts tests/parser/dataGapsClassCompleteness.test.ts` (counts UNCHANGED — same code, same buckets).
- [ ] **Step 3: Commit** `feat(parser): near-miss copy fan-out for UNKNOWN_FIELD (spec 12.4 lockstep)`

### Task 6: Registry enrollment + ledger shrink

<!-- task: red=`pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts tests/parser/fieldNearMiss.test.ts` ac=AC-N5,AC-N7 -->

- [ ] **Step 1: Write the failing tests FIRST (r4 finding 7 — this task's genuine RED).** (a) In `tests/parser/mutation/knownHoles.test.ts`: add a case asserting the 10 closed `section-reorder:` ids (the exact ids in Step 3's perl command) are ABSENT from `knownHoles.ts` — RED while the rows exist (plan-time reconciliation, SUPERSEDED 2026-08-16 by the collected harness run: the authored id-set of 10 is a strict subset of the measured 24 closures, and 59 remain, not 72 — the shipped test asserts the measured set. Original plan-time text: 82 `section-reorder:` rows live, the perl id-set matches exactly 10, 72 remain post-deletion - probe record `docs/superpowers/specs/parser/probes/2026-08-15-plan-r1-sweeps.md` section 3). (b) In the Task 2 detector suite (tests/parser/fieldNearMiss.test.ts (created)): add a case asserting the `GUARD_SURFACES` export (tests/mutation/source/registry.ts:151 - the live export name, plan-r1 finding 3) contains a row with `id: "fieldNearMiss"` — RED before enrollment (probe record section 3: no such row exists on the live tree).
- [ ] **Step 2:** Enroll: add the `GuardSurface` row to `tests/mutation/source/registry.ts` matching the LIVE type (`registry.ts:12-37`): `id: "fieldNearMiss"`, `sourcePath: "lib/parser/fieldNearMiss.ts"`, `suitePaths: ["tests/parser/fieldNearMiss.test.ts", "tests/parser/fieldNearMissBaseline.test.ts"]`, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95`, `control: { from: "const DISTINCTIVENESS_MAX = 4", to: "const DISTINCTIVENESS_MAX = 0" }` (kills every type-b TP, the suite MUST notice), `accepted: []`. Run `pnpm heavy pnpm mutation:guards`; record score + survivor dispositions in the commit body; unaccepted-survivor set must be empty (a survivor is either killed by a strengthened test or added to `accepted` with a reason, in this same commit).
- [ ] **Step 3:** `perl -ni -e 'print unless /^section-reorder:(2025-03-dci-rpas-central:B1[459]|2025-04-asset-mgmt-cfo-coo:B1[45]|2025-06-ria-investment-forum:B[3478]|2025-10-consultants-roundtable:B22):/' tests/parser/mutation/knownHoles.ts` (wave plan Task 4 Step 1's exact command); both Step 1 tests now GREEN; `knownHoles.test.ts` fully green; `OPERATOR_FINDING_MAP` comment updated per wave plan Task 4 Step 2 (map VALUE unchanged).
- [ ] **Step 4:** Full harness (8 shards): `pnpm heavy sh -c 'VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation'` — four buckets empty. Drifted fingerprints (the detector changes emission multisets on mutated docs) are regenerated in this same commit per the wave's drift rule.
- [ ] **Step 5:** BACKLOG archive move is NOT done here - tests/docs/_metaLedgerInProgress.test.ts:77-81 rejects any archived entry still carrying IN PROGRESS. The move happens in Task 7's LAST commit, in the same commit that removes the IN PROGRESS marker (invariant 12: a graduating entry's marker comes off in the same commit that archives it).
- [ ] **Step 6: Commit** `test(mutation): enroll fieldNearMiss guard; close BL-MUTATION-SECTION-ORDER (-10 rows)`

### Task 7: Close-out: gates, PR, merge

<!-- task: red=`none (closeout gate task)` ac=AC-N1,AC-N2,AC-N3,AC-N4,AC-N5,AC-N6,AC-N7 -->

(Closeout task - gates, review, PR, merge. No new production behavior, hence no red-then-green cycle; `red=none` is the honest marker (plan-r1 finding 3). The full-suite command in Step 2 is a GATE, not a TDD red.)

- [ ] **Step 1:** Impeccable dual gate on the help/warning-copy diff (`/impeccable critique` + `/impeccable audit`, canonical v3 setup gates); disposition P0/P1; record findings in section 12 below and REPLACE its impeccable-gate line with the filled form (this arc's UI touch is copy-only).
- [ ] **Step 2:** `pnpm heavy pnpm test` + `pnpm typecheck` + `pnpm exec eslint .` + `pnpm format:check` — all green.
- [ ] **Step 2b (plan-r1 finding 7): whole-diff cross-model review to APPROVE, BEFORE merge.** `node scripts/codex-guard.mjs review --brief <whole-diff brief> --cwd <worktree> --out <fresh dir> --stage diff --round <n> --attempt-max-secs 1380 --stall-secs 1370 --max-attempts 1 --total-max-secs 1450` (backgrounded; brief carries REVIEWER ONLY + VERDICT/FINDINGS contract, fresh-eyes posture, do-not-relitigate list incl. spec §1.1 and the ratified 65-row baseline, and the enrolled fieldNearMiss mutation score + empty unaccepted-survivor set as the §AC-N7 convergence statement). Findings are triaged/repaired and re-reviewed to APPROVE before Step 3's merge; substitute-mechanism fallback only on a 0-byte-transcript death at the cap, recorded as such.
- [ ] **Step 3:** PR: body carries the quieting stats (394→65), parity-supersession ratification cite, calibration probe pointer, review-mechanism record (the MIXED train: substitute independent-Claude rounds while codex was budget-misfit, then genuine codex rounds — substitute rounds NEVER claimed as cross-model APPROVE), and the wave AC-W1 arithmetic. In the PR's LAST commit: remove the BACKLOG IN PROGRESS marker AND move BL-MUTATION-SECTION-ORDER to BACKLOG-archive.md with the section-7 ratification + 72-ratified-ledger-rows documented-limit note + pointer to this spec (same commit - invariant 12 graduation shape; meta-test green). Real CI green (incl. `mutation-harness.yml` via path filter + `workflow_dispatch` verify). `gh pr merge --merge`; fast-forward main; `git rev-list --left-right --count main...origin/main` = `0  0`.

<!-- tasks: end -->

## Acceptance criteria index (from spec, for task-marker resolution)

- **AC-N1:** corpus emits exactly the 65-row calibrated baseline (committed JSON + env regen).
- **AC-N2:** emission multiset invariant under every adjacent-block swap (10 named + 497-swap sweep GREEN).
- **AC-N3:** venue payload byte-identical on the corpus.
- **AC-N4:** N/A - retired; entity-encoded block already recognized and deliberately stub-gated (spec 2.3).
- **AC-N5:** full harness four buckets empty; the ledger regenerated from the harness's own collected alarms. (Originally "10 section-reorder rows deleted; 72 ratified ledger rows remain" — both numbers were authored, and the collected run refutes both: 86 holes close, 17 open, 1,002 fingerprints drift, and the ledger lands at 1,019 rows with 59 `section-reorder`. Spec AC-N5 carries the amendment and `probes/2026-08-16-newhole-mechanism.md` the evidence.)
- **AC-N6:** §12.4 lockstep + card copy + help + impeccable dual gate green.
- **AC-N7:** fieldNearMiss enrolled in source-mutation registry, score ≥ floor, unaccepted-survivor set empty.
- **AC-N8:** TYPO_NORMALIZED census pinned at 0 on the unreordered corpus; venue-block-membership gate unit-tested both directions.
- **AC-N9:** the four Stage/Storage baseline rows keep a non-null sourceCell (kind "details"); a non-anchor-block row asserts null.

## 12. Invariant-8 closeout

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded

Full report: `.superpowers/sdd/2026-08-15-field-near-miss-detector/impeccable-gate.md` (workspace-local, git-ignored). Both halves ran against the `UNKNOWN_FIELD` copy diff — `lib/messages/catalog.ts` plus its §12.4 and card-copy rows. No P0. Eight findings, dispositioned here:

| # | Tier | Finding | Disposition |
|---|---|---|---|
| F1 | P1 | `helpfulContext` and `longExplanation` asked Doug to Report "if we've guessed wrong" / "if our suggestion is wrong" — but **nothing renders the guess**. The detector computes the matched candidate and attaches it (`lib/parser/warnings.ts:427`), and `grep -rn "\.candidate" components/ app/` finds zero render sites. Doug was invited to judge a suggestion he is never shown. | **Split.** Copy half FIXED here: both clauses removed, so the copy names only what is on screen. Render half DEFERRED as `BL-NEARMISS-CANDIDATE-RENDER` — it is a `components/` change this arc does not otherwise touch (class-sweep disposition exception (c)). |
| F2 | P2 | The worked example `(like 'Stage' for 'Stage Size')` was authored in three strings; only two are byte-frozen, so `dougFacing` could drift out of agreement unnoticed. On-screen duplication does not occur (no surface renders two of these together). | FIXED by removing the example from `dougFacing`, the one unfrozen copy — the drift vector, not the duplication, was the real residue. |
| F3 | P2 | `title: "Row label that looks misnamed"` deleted the agent and handed down a verdict on a sheet Doug authored, unlike siblings such as `UNKNOWN_SECTION_HEADER` → "Section we didn't recognize". | FIXED: `"Row we couldn't match"`. The gate's own suggested wording ("Row we couldn't match to a field", 32 chars) was LONGER than the 29 it replaced and would have worsened F8; the shipped form is 21 and settles both. |
| F4 | P2 | The retired copy named both card controls; the rewrite named Report only, while the Ignore button still renders for this code (`DataQualityWarningControls.tsx:108`, gated on the always-present `rawSnippet`). | FIXED: `helpfulContext` documents both again. |
| F5 | P3 | Both action strings spent ~25 words on system state before reaching the imperative. | FIXED: `dougFacing` and `helpfulContext` now lead with "Rename". |
| F6 | P3 | `components/admin/wizard/step3ReviewSections.tsx:3065` quoted the retired title `"Unrecognized row in sheet"` in a comment whose premise ("the catalog title is generic") is the thing this arc changed. | FIXED. |
| F7 | P3 | Eleven test-fixture sites hard-code the retired title. | NOT CHANGED, and deliberately: every one passes the label in as a component prop rather than reading the catalog, so the value is arbitrary by design and none of them can fail. This is not an instance of F6's defect — F6 asserted a false premise about live behavior; a fixture asserts nothing. Changing them would add three `components/` test files to the diff for no behavioral gain. |
| F8 | P3 | The group eyebrow (`BulkIgnoreControls.tsx:194-199`) has `min-w-0` but no `truncate`, so a longer title wraps rather than clips. Rendered wrap UNVERIFIED (no browser). | RESOLVED by F3's shorter title — 21 chars, below both the 25-char original and the 29-char intermediate. |

Two pre-existing `broken-image` hook findings at `step3ReviewSections.tsx:3705,3736` are outside this arc's diff (the only edit to that file is a comment) and are left alone.
