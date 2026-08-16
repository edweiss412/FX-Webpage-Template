# Plan-r1 reconciliation sweeps (authored and run at plan time)

Cross-model plan review r1 (finding 8) required three deferred sweeps to be executed at plan
time with captured output. Run 2026-08-15 on the live tree at commit `c4a399c60`.

## 1. Task 1 resolver walk — every `lib/parser/blocks/*.ts` taking a `ParseAggregator`

Mechanical scan (`grep -c "ParseAggregator"` per file; files with `agg=0` take no aggregator and
cannot mark): 11 files take the aggregator: client, contacts, crew, dates, event, hotels, ops,
rooms, transport, travelFlights, venue.

Consumption-relevance arbiter: the follow-up probe's Part A/Part D corpus measurement — a file
needs a `markConsumed` site iff it RESOLVES a row that the detector would otherwise treat as a
vocabulary-matching candidate. Measured corpus consumption events map to exactly two files, with
contacts carrying a specified-but-zero-corpus-hits path:

| file | disposition | evidence |
| --- | --- | --- |
| event.ts | MARK (2 sites: `CANONICAL_KEY_MAP` exact branch, `gatedVocabCorrect` acceptance) | Part D drops: 6× empty `Room Diagram` + 1× `Notes`, plus Part C's 3 written `Room Diagram` + 1 written `Notes` |
| transport.ts | MARK (2 sites: `V2_SCHEDULE_LABELS` membership AND the v4 driver regex `/^(?:equipment transporter\|load in:?\|driver)$/i` at `lib/parser/blocks/transport.ts:217` — plan-r1 finding 2: the corpus `Load In:` exclusion resolves through the REGEX, verified live: `driver_name="Carlos Pineda"`) | Part C drop: 1× `Load In:` |
| contacts.ts | MARK (regex acceptance path) | zero corpus consumption events; marked for future docs, cost-free |
| client, crew, dates, dress*, hotels, ops, rooms, travelFlights, venue | NO-MARK | zero corpus consumption events in Part A/C/D; their row shapes (roster names, date rows, hotel/conf tokens, room dims, alias-resolved fields) either resolve via `FIELD_ALIASES` (statically excluded from candidacy) or never vocabulary-match; the committed 65-row baseline is the executable arbiter — a missed site surfaces as a baseline mismatch, not silence |

(*dress takes no aggregator; listed for completeness.)

## 2. Task 4 direct-parser `UNKNOWN_FIELD` assertion sweep

`rg -n "UNKNOWN_FIELD" tests/` cross-joined with direct `parseVenue`/`parseEventDetails` calls:
exactly three files have both. Full positive-assertion inventory:

- `tests/parser/warnings.test.ts:213` (positive, direct parseVenue) — flips per plan Task 4 Step 2a.
- `tests/parser/warnings.test.ts:233` region (raw-unrecognized positive) — flips.
- `tests/parser/warnings.test.ts:252` (window-guard negative) — deleted (vacuous after removal).
- `tests/parser/blocks/venue.test.ts:301` (positive) — flips; `:267`/`:394` are negatives, stay.
- `tests/parser/blocks/event.test.ts:403` region (positive at `:414`; negatives `:425`/`:437` stay).
- `tests/parser/warnings.test.ts:129` calls `emitUnknownField` directly — unaffected.

All other `UNKNOWN_FIELD` test references (69 files) have zero direct block-parser calls and
consume warnings through fixtures/parseSheet — unaffected by the emitter move.

## 3. Task 6 registry / ledger reconciliation

- `tests/parser/mutation/knownHoles.ts`: 82 `section-reorder:` rows on the live tree; the Task 6
  perl command's id set matches exactly 10 of them; 72 remain post-deletion (the wave's ratified
  ledger arithmetic).
- `tests/mutation/source/registry.ts`: the exported array is `GUARD_SURFACES`
  (`registry.ts:151`) — NOT `SURFACES` (plan-r1 finding 3 rename). Live ids: taskContract,
  ledgerClaimsCore, ledgerGit, reviewRoundCount, reviewRoundCorpus, phantomGapExecuted,
  popoverOverlayExtract, renderedTextHaystack, interactionTimingScan (+ others below line 603);
  no `fieldNearMiss` row exists — the Task 6 membership test is genuinely RED before enrollment.

## 4. Ledger occurrence-identity probe (plan-r1 finding 1)

`fixtures/shows/raw/2025-06-ria-investment-forum.md` lines 219 and 343: byte-identical
single-cell `Room Diagram` rows (empty value) in the DETAILS block AND the Timestamp block.
Same shape in `2025-03-dci-rpas-central.md` (GS DETAILS (FOR BOTH) | Timestamp) and
`2025-04-asset-mgmt-cfo-coo.md`. A `(label, value)`-keyed ledger cannot distinguish the consumed
DETAILS occurrence from the must-warn Timestamp occurrence: membership suppresses both, count
depletion is document-order-dependent (position-keyed, the exact defect this spec removes).
Repair: the ledger key includes the BLOCK-OPENER first-cell text (trimmed) of the section the
resolving parser is consuming — `${blockOpener}\u0000${col0}\u0000${value}` — and the detector
checks membership with the candidate row's own physical block opener. Swap-invariant by
construction: the opener text moves with its rows.

## 5. Guard-witness probe (plan-r1 finding 4, reviewer's live-vocabulary probe, reproduced claim)

`INTERNAL` normalizes to `internal` with NO vocabulary match — it never reaches the all-caps
guard (vacuous witness). Valid constructed witnesses that MATCH vocabulary and are suppressed
ONLY by the named guard: `ADDRESS` (all-caps single token, matches `VENUE ADDRESS` family — the
all-caps guard is the sole suppressor) and `NAME` (matches `VENUE NAME`, suppressed by the
min-length guard). Corpus all-caps-only suppressions = 0, so constructed rows are the only
witnesses; each suppression test carries a case-local premise proving its input matches
vocabulary absent the guard under test.
