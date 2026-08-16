# Substitute adversarial spec review — field near-miss detector design (round 1)

**Reviewer:** independent fresh-eyes Claude (substitute for cross-model Codex; recorded as a
substitute review, never as a cross-model APPROVE).
**Subject:** `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md`
**Worktree:** `/Users/ericweiss/FX-worktrees/mutation-section-order` @ `8327d1433`
**Role:** REVIEWER ONLY. No fixes proposed as commits; no nested reviews dispatched.

**FINDINGS: 9** (2 BLOCKING, 2 HIGH, 3 MEDIUM, 2 LOW)
**VERDICT: BLOCKING**

Probe scripts written for this review (all under `.claude/tmp/`, rerun with
`pnpm exec tsx --tsconfig tsconfig.json <file>`):
`rev-probe-kinds.ts`, `rev-probe-regression.ts`, `rev-probe-typo.ts`, `rev-probe-typo2.ts`,
`rev-probe-swap-consumption.ts`.

Scope honored: §1.1 items 1–8, the §3.1 calibrated rule and guards, the §3.2 72-row baseline,
§3.3 consumption-ledger semantics, and the wave amendment are treated as ratified and are not
relitigated. The §3.2 fenced rejections (multi-token-only, distinctiveness ≤1, block-opener
gating) are not re-proposed. No finding below asks for a matcher or guard tightening.

---

## F1 — BLOCKING. `inVenueFieldScope` has a second consumer the spec never mentions, and it makes AC-N2 unachievable as written

§2.1 instructs removal of "the `inVenueFieldScope` flag, the `VENUE_BLOCK_TERMINATORS`
scope-close behavior for unknown-field purposes, and the `emitUnknownField` call inside
`parseVenue`."

That flag has a **second** reader, gating a different warning code:

```
lib/parser/blocks/venue.ts:135
    // Emit TYPO_NORMALIZED if col0 matched a known-typo alias (only within venue scope)
    if (col0Full?.isTypo && agg && inVenueFieldScope) {
```

and its retention is a deliberate, documented decision from a prior review round
(`venue.ts:149-155`): "Gating on `inVenueFieldScope` ... silently suppressed the warn for a
misspelled FIRST venue field row (idx53) ... **The TYPO_NORMALIZED emit above keeps its scope
gate.**"

The spec does not mention `TYPO_NORMALIZED` anywhere. Both branches of §2.1 are wrong:

- **Keep the flag** → the positional artifact survives on a second code, and it is
  corpus-reachable inside the AC-N2 gate.
- **Delete the flag** → `TYPO_NORMALIZED` is silently un-gated, adding emissions with no
  baseline, no AC, no catalog review, and reversing a decision made against a named prior
  finding.

**Probe (`rev-probe-typo.ts`, `rev-probe-typo2.ts`).** `TYPO_NORMALIZED` is 0 across all 17
fixtures today, but exactly one adjacent-block swap flips it:

```
=== TYPO_NORMALIZED corpus census ===
TOTAL TYPO_NORMALIZED today: 0

=== exhaustive: adjacent swaps that change TYPO_NORMALIZED count ===
  fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md: 1 of 21 swaps change it (base=0)

base TYPO_NORMALIZED: 0
SWAP B16<->B17: 0 -> 1
    {"code":"TYPO_NORMALIZED","message":"Typo alias 'Virtaul Audience' normalized to canonical 'details.virtual_audience'","rawSnippet":"Virtaul Audience"}
   B16 head: |              Timestamp               |
   B17 head: |      DETAIL CHECKLIST       |       |
```

The `Virtaul Audience` row sits in the `DETAIL CHECKLIST` block, today outside the venue
window; moving that block one position earlier puts it inside the still-open window and the
warning appears. This is the identical positional artifact the parity probe documented for
`UNKNOWN_FIELD`, on a second code.

**Why this defeats AC-N2.** The sweep compares the whole signal multiset, not just
`UNKNOWN_FIELD` — `tests/parser/mutation/oracle.ts:56-63`:

```ts
export function signalKeys(p: ParsedSheet): Map<string, number> {
  ...
  for (const w of p.warnings) bump(`W:${w.code}`);
  for (const r of p.raw_unrecognized) bump(`R:${r.block}|${r.key}`);
```

So `W:TYPO_NORMALIZED` participates. The `2025-04-asset-mgmt-cfo-coo.md` B16↔B17 swap is inside
the 497-swap sweep (`tests/parser/mutationHarness.venueSwapSweep.test.ts:40`,
`EXPECTED_TOTAL_SWAPS = 497`) and will remain RED after removing only the `UNKNOWN_FIELD`
emission. AC-N2 ("the exhaustive 497-swap sweep goes GREEN") therefore cannot be met by the
mechanism §2 describes.

**Asked for:** an explicit §2.1 disposition for `TYPO_NORMALIZED` — either a stated,
baselined un-gating (with its own expected-emission delta and a copy check), or a stated
replacement gate that is content-keyed — plus an AC covering it. This is a spec-completeness
gap, not a request to widen the detector.

---

## F2 — BLOCKING. The emitted `block` / `blockRef.kind` contract is unspecified, and three live consumers depend on it

§2.2 says only: "`blockRef` derived from the row's own block." §5 says: "sourceCell anchoring
behavior (`lib/drive/showDayTimeAnchors.ts`, `resolveUnknownFieldCell`) **unchanged**." Those
two statements cannot both hold, and the spec never names the value the detector will emit.

Three consumers read it:

**(a) Anchor resolution.** `resolveUnknownFieldCell` matches on kind equality
(`lib/drive/unknownFieldAnchors.ts:171-182`):

```ts
const matches = anchors.filter((a) => a.kind === kind && a.label === lk && a.value === vk);
return matches.length === 1 ? matches[0]!.anchor : null;
```

and anchors exist for exactly two kinds (`unknownFieldAnchors.ts`, `BLOCKS`):
`{ kind: "venue", ... }`, `{ kind: "details", ... }`. Any other kind resolves to `null`.

**Probe (`rev-probe-kinds.ts`)** — today's emissions and, decisively, where the audited true
positives sit:

```
TOTAL UNKNOWN_FIELD today: 394
by blockRef.kind: [["details", 8], ["venue", 386]]

Audited-TP-label rows and their kind:
  fixtures/shows/exporter-xlsx/east-coast.md  key="Stage"    kind="details"
  fixtures/shows/exporter-xlsx/east-coast.md  key="Storage"  kind="details"
  fixtures/shows/raw/2024-05-east-coast-family-office.md  key="Stage"    kind="details"
  fixtures/shows/raw/2024-05-east-coast-family-office.md  key="Storage"  kind="details"
  fixtures/shows/raw/2025-10-consultants-roundtable.md  key="Client:/Contact:"  kind="venue"
  fixtures/shows/raw/2025-10-consultants-roundtable.md  key="Address:"  kind="venue"
  fixtures/shows/raw/2025-10-consultants-roundtable.md  key="Phone:"    kind="venue"
  fixtures/shows/raw/2025-10-consultants-roundtable.md  key="E-mail:"   kind="venue"
```

All four Stage/Storage true positives — the corpus's most-confirmed near-misses, the ones §5's
own worked copy example is written about — carry `kind: "details"` today and are therefore
anchorable. If the detector emits the physical block's own label (`Timestamp`,
`Client:/Contact:`, `JOANN`, `DETAIL CHECKLIST`), every one of the 72 resolves to `null` and
those four regress from anchored to link-less. `UNKNOWN_FIELD` is a member of
`OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:414`), whose entire contract is
cell-anchored operator rendering — so this is not a cosmetic loss.

**(b) The swap oracle.** `signalKeys` keys the third channel `R:${r.block}|${r.key}`
(`oracle.ts:61`), where `block` is `emitUnknownField`'s `opts.block`
(`lib/parser/warnings.ts:359-360`). AC-N2 therefore requires `block` itself to be
swap-invariant. A physical-block-derived label is content-keyed and probably fine, but the spec
asserts nothing and no AC pins it.

**(c) Persistence.** See F3's sibling point below — `block` lands in a persisted column.

**Asked for:** a normative statement of both `emitUnknownField`'s `block` argument and
`blockRef.kind` for detector emissions, plus an AC pinning that the four Stage/Storage rows keep
a resolvable `sourceCell`. Note the anchor scanner only builds anchors for rows inside `VENUE`
and `DETAILS`-family blocks, so rows in `Timestamp`/`Client:/Contact:` blocks degrade to `null`
regardless — that is safe (spec §5.1.1 "correct cell or null") and only needs saying, but the
Stage/Storage regression does not.

---

## F3 — HIGH. Copy lockstep is incomplete; AC-N6 as written cannot go green

**(a) The master-spec §12.4 prose edit is not named.** AC-N6 lists "catalog row updated
(title + dougFacing per §5), `pnpm gen:spec-codes` regen, card copy row, help entry." The regen
reads FROM §12.4 prose (`"gen:spec-codes": "tsx scripts/extract-spec-codes.ts"`, package.json:24),
and the parity test deep-matches four fields (`tests/cross-cutting/codes.test.ts:81-96`):

```ts
expect(catalogRow.dougFacing, ...).toEqual(specRow.dougFacing);
expect(catalogRow.crewFacing, ...).toEqual(specRow.crewFacing);
expect(catalogRow.followUp, ...).toEqual(specRow.followUp);
expect(catalogRow.helpfulContext, ...).toEqual(specRow.helpfulContext);
```

Editing `catalog.ts` and re-running the generator without editing the prose reproduces the OLD
`dougFacing` in `SPEC_CODES` and reds `x1-catalog-parity`. The prose rows live at
`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2897` (dougFacing) and `:3253`
(helpfulContext). AGENTS.md's own three-lockstep rule names this as item (a); AC-N6 omits it.

**(b) §5 enumerates 2 of 6 copy strings.** The live row (`lib/messages/catalog.ts:1307-1321`)
carries four more strings that all assert the retired framing:

- `helpfulContext`: "Your sheet has a row we didn't recognize…" — **parity-gated**, so this one
  also needs a §12.4 prose edit.
- `triggerContext`: "Appears when a row's label doesn't match anything we know how to show."
- `longExplanation`: "We found a row that doesn't match any section we read (CLIENT, DATES,
  CREW, and so on)…" — this is the `/help/errors` body.
- `title`: "Unrecognized row in sheet" (named in §5).

Under near-miss framing every one of these is now false: the whole point is that the row **does**
nearly match a known field. Leaving them makes the help page contradict the card that links to it.

**(c) Citation error.** §5 cites "`STAGE_WORD_AUTOCORRECTED` tone template at
`catalog.ts:1382-1397`". That range is `UNKNOWN_STAGE_RESTRICTION`
(`catalog.ts:1380-1395`); `STAGE_WORD_AUTOCORRECTED` is at `catalog.ts:1428-1443`.

**(d) Interpolation surface unnamed.** The row's `dougFacing` uses `_<key>_` and `_<sheet-name>_`
placeholders resolved by `interpolate`/`PLACEHOLDER_RE` (`lib/messages/lookup.ts:12-34`). §5
defers the matched-candidate shape to plan time, which is reasonable, but it should at least name
the renderer/param-supply surface that must change, since an unresolved `<candidate>` renders
literally.

---

## F4 — HIGH. §2.3's entity-decode repair cites a site that cannot deliver AC-N4

§2.3: "The header matcher's col-0 comparison path
(`lib/parser/blocks/_sectionHeaderMatch.ts:31-40`) gains entity-decoding so the `rooms.additional`
opener (`lib/parser/blocks/rooms.ts:108`) recognizes it."

Three problems, all verifiable:

1. **Lines 31-40 are not a comparison path.** They are `buildCol0HeaderRe`, a regex *builder*.
   The comparison function is `matchesSectionHeader` (`_sectionHeaderMatch.ts:44-47`).
2. **`rooms.ts` does not use that module at all.** `grep -rn "matchesSectionHeader|buildCol0HeaderRe|buildCol0HeaderAltRe" lib/parser/`
   returns `index.ts`, `crew.ts`, `venue.ts`, `dates.ts`, `dress.ts`, `client.ts`, `transport.ts`
   — never `rooms.ts`. `rooms.ts:100-107` documents why: its additional-room matcher is a raw
   allowlisted regex, "not buildable from the simple presence factory." Editing
   `_sectionHeaderMatch.ts` cannot make `parseAdditionalRoom` (`rooms.ts:535`) recognize the block.
3. **The calibration record diagnoses a different root cause entirely.** Calibration §3's miss
   table: "`isKnownSectionHeader` AND `canonicalSectionKind` both prefix-match 'ADDITIONAL ROOM'
   through the literal, un-decoded `&#10;` text … This is a genuine sequencing gap." Those are
   `lib/parser/knownSections.ts:202` and `lib/parser/sectionKind.ts:82`.

So there are up to three real repair sites (`rooms.ts`'s own regex to make the block parse;
`knownSections.ts` / `sectionKind.ts` to fix the candidate-exclusion sequencing) and the spec
names none of them. AC-N4 ("the entity-decode repair makes the `ADDITIONAL ROOM` block parse as
`rooms.additional` payload") is not reachable through the cited edit.

---

## F5 — MEDIUM. §3.3's ledger semantics are not equivalent to the mechanism that produced the 72-row baseline

§3.3 defines the ledger as recording "CURATED resolutions only (exact/alias matches in a block
parser's own map or regex path)" and §2.2 calls the probe's 3-way verdict "the normative
semantics of the ledger." But the 72 was produced by a *different* mechanism — delete the
physical line, reparse, diff `payloadOf` (calibration §7). The two diverge on two live
`event.ts` paths:

- **Gated fuzzy correction.** `gatedVocabCorrect` (`event.ts:200-212`, again at `:292-298`)
  resolves a misspelled label to a real canonical key. That is neither an exact match, an alias
  match, nor a regex path, so §3.3's literal wording leaves it *out* of the ledger — yet
  deletion-diff classifies it `CONSUMED_OTHER_KEY` and drops the row. A ledger built to §3.3's
  wording would emit rows the baseline does not contain.
- **Resolved-but-not-written.** A curated hit whose value is filtered — `presence()` returning
  null, or the sentinel-suppressed `writeField` (`event.ts:401-406`) — resolves the row while
  producing no payload delta: ledger says consumed, deletion-diff says `UNCONSUMED`.

Neither divergence bites on this corpus (checked: roundtable's surviving `Notes` row at
`fixtures/shows/raw/2025-10-consultants-roundtable.md:37` is single-column, so `if (col1)`
short-circuits before the curated lookup — the probe's `UNCONSUMED` verdict is right there).
So this is an implementability caveat, not a live defect — but §3.3 is *normative* text and, as
worded, does not reproduce its own baseline.

Related: §2.2 provides no derived cover of which block parsers own internal, non-`aliases.ts`
resolution vocabularies. The two it names were found incidentally by the calibration
(`event.ts:68` `CANONICAL_KEY_MAP`; `transport.ts:217`'s `/^(?:equipment transporter|load in:?|driver)$/i`),
and 11 files under `lib/parser/blocks/` take a `ParseAggregator`. Per the class-sweep-to-a-derivation
rule, this wants a walk, not a two-item list — otherwise the ledger's coverage is pinned only by
the baseline number happening to come out at 72.

---

## F6 — MEDIUM. §3.2 and §9 contradict the calibration record on the residual composition

Both §3.2 and §9 list `Details?` among the shipped residual:

- §3.2: "residual low-signal firings (21 Google-Forms-echo rows in `Timestamp` blocks,
  `Speaker` ×2, question-form labels `Details?`/`Diagrams?`, and peers…)"
- §9: "plus question-form labels (`Details?`, `Diagrams?`)"

The calibration says `Details?` is **suppressed by the adopted guard**, in three places:

- §4, adopted row: FP "cut from 60→44 by removing 16 `Contact`/`Contact:`/`Details?` rows for free."
- §5 table: `Contact` / `Contact:` at "0 (suppressed by the final guard)", and the closing note
  "(`Contact`/`Contact:`/`Details?` are already suppressed by the final rule, not double-counted here.)"
- §9 composition of the 72: "24-3=21 `Room Diagram` … 15 `Backdrop`, 2 `Speaker`, 1 `Notes`
  …, 1 `Diagrams?`" = 40 FP, with no `Details?`.

So the spec's normative §3.2 names a row the committed baseline does not contain. Two smaller
defects in the same sentence: the 1 `Notes` row is covered only by "and peers", and the 21 rows
are described as "Google-Forms-echo rows" without naming that their col0 is `Room Diagram` —
which matters because the *same sentence's* preceding clause excludes "3× 'Room Diagram' in
DETAILS blocks", leaving a reader unable to reconcile 24 against 3. As written §3.2 enumerates
7 + 25 + 15 + 21 + 2 = 70 of 72.

---

## F7 — MEDIUM. §9's "no regression against the pre-detector state" claim is refuted by probe

§9, final bullet: "a novel near-miss shape that evades it is silence on content that was already
silent today — no regression against the pre-detector state."

**Probe (`rev-probe-regression.ts`)** — every label §3.2 files as a "confirmed non-catch" is
surfaced *today*:

```
Label | surfaced TODAY as UNKNOWN_FIELD | #fixtures | kinds
  cell phone:    | YES x1 | 1 | venue
  fax:           | YES x1 | 1 | venue
  alt. e-mail:   | YES x1 | 1 | venue
  event name:    | YES x1 | 1 | venue
  e-mail:        | YES x1 | 1 | venue
  address:       | YES x1 | 1 | venue
  phone:         | YES x1 | 1 | venue
```

The first four are not in the 72-row baseline (calibration §8: "still miss"), so four rows that
the parser surfaces today go silent. The ratified quieting (§1.1.2) covers this in aggregate and
I am not relitigating it — the finding is the *categorization*.

§9's rationale is "**Targetless** unknowns are not near-misses … a near-miss requires a target
field." That is correct for `Fax:` and `Event Name:` (no vocabulary counterpart anywhere). It is
**not** correct for the other two, which have targets and are lost purely to rule mechanics:
the audit itself classes `Cell Phone:` a near-miss of `client.contact_cell` ("Contact Cell") and
`ALT. E-mail:` of `Contact Email` (`unknown-field-narrowing-audit.md:115-120`, citing
`aliases.ts:41-45`), and calibration §8 attributes the misses to "no single vocab entry's token
set is a superset of both" and "extra token" respectively. §9 already says as much for
`Cell Phone:` two sentences earlier, then the closing bullet asserts the opposite.

**Asked for:** split §9's bullet into "targetless — silent by design" and "has a target, lost to
a v1 rule mechanic, surfaced today, going silent" — the second list stated as a ratified,
enumerated loss (2 rows). No rule change requested; the fenced guard variants stay fenced.

---

## F8 — LOW. §1's problem statement and the audit's headline attribution are both incomplete

§1: "`UNKNOWN_FIELD` is emitted today by a positional sweep inside `parseVenue`."

**Probe (`rev-probe-kinds.ts`)**: `by blockRef.kind: [["details", 8], ["venue", 386]]`. Eight of
the 394 come from `event.ts:225` (kind `details`), whose emission is block-local, not positional
— and those eight include all four Stage/Storage true positives. §2.1 does acknowledge the
second call site, so the mechanism section is right; §1's framing and the evidence base are not.
The audit's per-fixture table (`unknown-field-narrowing-audit.md:28-56`, "394 of 394 (100%) would
be DROPPED") attributes all 394 to the venue window. Its conclusion survives (those 8 rows are
not in the venue block either), but the arithmetic is mis-attributed and §1 inherits it.

---

## F9 — LOW. A load-bearing downstream comment goes stale

`lib/drive/unknownFieldAnchors.ts:16`: "The two blocks whose parsers call `emitUnknownField`
(venue.ts, event.ts)." That comment is the stated rationale for the `BLOCKS` array's contents —
the exact array F2 turns on. §2.1's structural assertion pins "exactly one call site" within
`lib/parser/` only, so nothing catches this. Worth an explicit note in §2.1's removal list.

---

## Checked and found sound (recorded so a later round does not re-derive it)

- **AC-N5 arithmetic.** `tests/parser/mutation/knownHoles.ts` holds 82 `section-reorder:` rows
  (10 `signal_loss` + 14 `text_drift` + 58 `wrong`); 82 − 10 = 72. The 10 real-loss rows match
  the 10 named swaps in `venueSwapInvariance.test.ts` (3+2+4+1). `OPERATOR_FINDING_MAP["section-reorder"]
  = "BL-MUTATION-SECTION-ORDER"` at `knownHoles.ts:97`. The "numerical coincidence" note is
  correct and worth keeping.
- **§1.1.3 continuity claims** all verify: `dataGaps.ts:38` (GAP_CLASSES row), `dataGaps.ts:414`
  (`OPERATOR_ACTIONABLE_ANCHORED`), `dataGaps.ts:505` (`stripLegacyUnknownFieldAnchors`),
  `app/help/errors/_families.ts:82` (`"UNKNOWN"` prefix, crew-schedule family).
- **§2.1's two-call-site claim** is correct for `lib/parser/`: `venue.ts:314`, `event.ts:225`.
- **§2.2 candidate-definition citations** verify: `resolveAlias` `aliases.ts:166`,
  `resolveAliasFull` `:177`, `FIELD_ALIASES` `:19`, `TYPO_ALIASES` `:142`,
  `isKnownSectionHeader` `knownSections.ts:202`, `canonicalSectionKind` `sectionKind.ts:82`,
  `toCanonicalKey` `event.ts:407-412`.
- **ParseAggregator** (`warnings.ts:17-20`) is a plain two-field type threaded as an optional
  `agg?` through 11 block parsers — adding a ledger field is structurally straightforward.
  (The spec's "17-24" spans the type plus `newAggregator`; close enough.)
- **§3.1 vocabulary counts** reconcile: 174 raw / 132 distinct under v3 (calibration §1 and §8).
- **AC-N2's "497"** matches `mutationHarness.venueSwapSweep.test.ts:40`.
- **§8's premise-guard citation** `tests/_shared/premise.ts:36` resolves (`premiseHolds` sits
  just below; the swap test already uses it).
- **§9's edge-case-audit citation** `docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`
  is exact — the "parsed correctly or *signaled*, never silently wrong" line.
- **Wave amendment** is genuinely recorded at
  `docs/superpowers/plans/2026-08-08-parser-mutation-wave/00-overview.md:63-65`.
- **AC-N7 enrollability.** `GuardSurface` (`tests/mutation/source/registry.ts:12-37`) needs
  `sourcePath` + `suitePaths` + `operators` + `scoreFloor` + `control`. A `lib/parser/fieldNearMiss`
  module with the §8 detector suite satisfies the shape (importable module + referring suite),
  so the AGENTS.md enrollment precondition is met by construction.
- **Swap-invariance of the consumption ledger's upstream** — I probed the obvious failure mode
  (`parseEventDetails` uses `EVENT_DETAILS_HEADER_RE.exec(markdown)`, i.e. the FIRST header in
  document order, `event.ts:148`) and it is **not** corpus-reachable: `rev-probe-swap-consumption.ts`
  reports every fixture has exactly one DETAILS-header block, "Fixtures with >=2 DETAILS-header
  blocks: 0". §2.2's "swap-invariant by construction" is stronger than the evidence supports in
  general, but there is no escaping input on this corpus, so per the convergence criterion this
  is **not** filed as a finding. Recorded so it is not re-derived.

---

## Convergence note

Findings F1 and F2 are design-completeness gaps (an undisclosed second consumer; an unspecified
contract with three dependents), not "the guard does not pin what it claims" — neither asks for a
wider recognizer. F3–F6, F8, F9 are internal-consistency and citation defects settled by grep
against the live tree. F7 is a categorization fix backed by probe output. Every claim above cites
`file:line` or includes the probe transcript that settles it. I raised no finding resting on a
hypothetical input, and none proposing a matcher or guard change.

FINDINGS: 9
VERDICT: BLOCKING
