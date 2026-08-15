# FIELD NEAR-MISS detector — rule calibration against the 17-fixture corpus

Probe script: `.claude/tmp/near-miss-calibration-probe.ts`.
Rerun: `pnpm exec tsx --tsconfig tsconfig.json .claude/tmp/near-miss-calibration-probe.ts`
(writes full detail to `.claude/tmp/near-miss-calibration.json`; the console transcript used to
build this report is saved at `.claude/tmp/near-miss-full-output.txt`).

Two independent process runs (plus one in-process rerun the script performs itself) produced
**identical** candidate-row totals (5736) and firing counts at every guard level — the numbers
below are stable, not a single-run snapshot.

---

## 1. Rule v0 (as specified, no guards)

**Candidate rows** — every pipe row (`parseTableRows` over the whole document, i.e.
`lib/parser/blocks/_helpers.ts:20`) whose col-0 (already `.trim()`'d by `parseTableRows`) is
non-empty AND fails all three of:

- `resolveAlias(col0) !== null` — `lib/parser/aliases.ts:166` (exact alias, case/whitespace-insensitive)
- `isKnownSectionHeader(col0)` — `lib/parser/knownSections.ts:202` (`KNOWN_SECTION_HEADERS` exact +
  `PREFIX_SECTION_FAMILIES` whole-token prefix)
- `canonicalSectionKind(col0) !== null` — `lib/parser/sectionKind.ts:82` (`LABEL_TO_KIND` exact +
  `ROOM_FAMILY_PREFIXES` whole-token prefix, trailing-colon tolerant)

Position never enters — no block/scope awareness in candidate selection.

**Vocabulary** (DERIVED, not curated):
1. every string in every `FIELD_ALIASES` value array (`lib/parser/aliases.ts:19-132`)
2. the union of every block parser's exported `SECTION_HEADER_TOKENS` — confirmed by
   `grep -n "SECTION_HEADER_TOKENS" lib/parser/blocks/*.ts` to be exactly: `client.ts`, `dates.ts`,
   `dress.ts`, `crew.ts`, `event.ts`, `venue.ts`, `transport.ts`, `rooms.ts`, `hotels.ts`
3. `LABEL_TO_KIND`'s 21 keys (`lib/parser/sectionKind.ts:33-55`) — **not exported** by that module
   (only `canonicalSectionKind`/`EMITTABLE_KINDS`/`isRoutingKey` are), so the probe transcribes them
   verbatim and asserts at runtime that every transcribed key still round-trips through the real
   `canonicalSectionKind()` to a non-null kind (would throw loudly on drift).

Also verified at runtime (throws if false): the union of every block's `SECTION_HEADER_TOKENS` is a
strict subset of `KNOWN_SECTION_HEADERS`, so `isKnownSectionHeader` safely stands in for "any block
parser's SECTION_HEADER_TOKENS" in the exclusion check.

**Vocabulary size** — declared vs actual:

| | count |
|---|---:|
| raw `FIELD_ALIASES` value strings (pre-dedup) | 131 |
| raw block `SECTION_HEADER_TOKENS` (pre-dedup, union) | 22 |
| raw `LABEL_TO_KIND` keys (pre-dedup) | 21 |
| **raw total, pre-dedup** | **174** |
| **distinct normalized vocabulary entries (actual, post-dedup)** | **138** |

(36 raw strings collapse into an existing normalized entry — e.g. `"VENUE NAME"` and `"Venue Name"`
both normalize to `venue name`.)

**Normalization** (both candidate col0 and vocabulary strings): decode `&#10;`/`&#9;` entities to
space (reuses `decodeEntities`, `lib/parser/blocks/_helpers.ts:65` — the same function the real
parser uses at value-storage time) → collapse internal whitespace → strip **one** trailing colon →
casefold → trim.

**Match**: (a) normalized-string-equal to a vocabulary entry, or (b) candidate's token set (split
normalized string on `[^a-z0-9]+`) is a non-empty **proper** subset of some vocabulary entry's token
set (strictly fewer tokens — an equal-size, equal-content token set is not "proper" and is left to
type (a); the probe never silently drops that edge case).

### v0 corpus result

- Total candidate rows: **5736** (stable across 3 independent measurements — 2 process runs + 1
  in-process rerun).
- Total firings: **121**.
- TP = **6**, EXTRA = **16**, FP = **99** (definitions below).

---

## 2. Expected TRUE POSITIVE set (from the prior audit, `.claude/tmp/unknown-field-narrowing-audit.md`)

14 specific rows, located precisely (fixture + verbatim col-0) by grepping the corpus and
cross-checking the audit's dropped-key JSON:

| # | fixture | col0 |
|---|---|---|
| 1 | raw/2025-10-consultants-roundtable.md | `Client:/Contact:` (fused; **not** bare `Client:` — corrected during this calibration, see below) |
| 2 | raw/2025-10-consultants-roundtable.md | `Address:` |
| 3 | raw/2025-10-consultants-roundtable.md | `Phone:` |
| 4 | raw/2025-10-consultants-roundtable.md | `Cell Phone:` |
| 5 | raw/2025-10-consultants-roundtable.md | `Fax:` |
| 6 | raw/2025-10-consultants-roundtable.md | `E-mail:` |
| 7 | raw/2025-10-consultants-roundtable.md | `ALT. E-mail:` |
| 8 | raw/2025-10-consultants-roundtable.md | `Event Name:` |
| 9 | raw/2024-05-east-coast-family-office.md | `Stage` |
| 10 | raw/2024-05-east-coast-family-office.md | `Storage` |
| 11 | exporter-xlsx/east-coast.md | `Stage` |
| 12 | exporter-xlsx/east-coast.md | `Storage` |
| 13 | raw/2025-03-dci-rpas-central.md | `ADDITIONAL ROOM&#10;Dimensions&#10;Floor` (+ `Other`, same block) |
| 14 | raw/2025-04-asset-mgmt-cfo-coo.md | `ADDITIONAL ROOM&#10;Dimensions&#10;Floor` (+ `Other`, same block) |

**Correction found during calibration**: my first pass hardcoded `col0: "Client:"` for row 1 and it
came back "row not found" — the roundtable fixture's actual col0 for that row is the *fused*
`Client:/Contact:` (confirmed with `grep -n "^| *Client:" fixtures/shows/raw/2025-10-consultants-roundtable.md`
and cross-checked against the original audit JSON key, which is literally `"Client:/Contact:"`, not
`"Client:"`). Fixed before the reported numbers below.

---

## 3. v0 classification (against the corrected 14)

**TP = 6 / 14** (43% recall at v0, before any guards):

```
TP  exporter-xlsx/east-coast.md          col0="Stage"   -> b -> "Stage Size" [event.stage_size]
TP  exporter-xlsx/east-coast.md          col0="Storage" -> b -> "Equipment Storage" [event.equipment_storage]
TP  raw/2024-05-east-coast-family-office.md col0="Stage"   -> b -> "Stage Size" [event.stage_size]
TP  raw/2024-05-east-coast-family-office.md col0="Storage" -> b -> "Equipment Storage" [event.equipment_storage]
TP  raw/2025-10-consultants-roundtable.md col0="Address:" -> b -> "VENUE ADDRESS" [venue.address]
TP  raw/2025-10-consultants-roundtable.md col0="Phone:"   -> b -> "Client Phone" [client.contact_phone]
```

**MISSES = 8 / 14**, each with a concrete, verified reason:

| col0 | reason |
|---|---|
| `Client:/Contact:` | candidate, but no vocabulary match. Normalizing strips only the **trailing** colon (`client:/contact`), leaving the internal colon+slash intact; that string doesn't equal `client contact` (type a), and the two token sets are the same size ({client,contact} vs {client,contact}) so it's not a *proper* subset either (type b, by design). |
| `Cell Phone:` | candidate, no vocab match. Tokens `{cell,phone}`; no single vocab entry's token set is a *superset* of both — `Contact Cell`→`{contact,cell}` and `Client Phone`→`{client,phone}` each cover only one of the two tokens. |
| `Fax:` | candidate, no vocab match. "fax" is not a token anywhere in the derived vocabulary — no `FIELD_ALIASES` entry covers it at all. |
| `E-mail:` | candidate, no vocab match. The hyphen splits it into tokens `{e,mail}`; "email" (no hyphen, as in `Client Email`/`Contact Email`) tokenizes as a single token `{email}` — `{e,mail}` is not a subset of `{client,email}`. |
| `ALT. E-mail:` | same hyphen-tokenization problem, plus an extra "alt" token. |
| `Event Name:` | candidate, no vocab match. "Event Name" is not a `FIELD_ALIASES` entry — nothing in the vocabulary contains both "event" and "name". |
| `ADDITIONAL ROOM&#10;Dimensions&#10;Floor` (×2 fixtures) | **excluded pre-candidacy**: `isKnownSectionHeader` AND `canonicalSectionKind` both prefix-match "ADDITIONAL ROOM" through the literal, un-decoded `&#10;` text (their whole-token-prefix check only requires the next char be non-alphanumeric, and `&` qualifies) — so the row is judged "already resolves to `rooms`" **before** the near-miss detector's own entity-decoding normalization ever runs. This is a genuine sequencing gap: the exclusion check and the match-normalization step disagree about whether `&#10;` counts as a token boundary. |
| `Other` (×2 fixtures, same ADDITIONAL ROOM block) | candidate, no vocab match. "other" has zero lexical relationship to any vocabulary entry — this is a **contextual** near-miss (it only "means" anything because of its position inside the additional-rooms block), and rule v0 is explicitly position-blind by design, so no col0-text rule can catch it. |

**EXTRA = 16** — the *same* `Client:`/`Address:`/`Phone:`/etc. colon-suffixed shape recurring in
**8 more fixtures** beyond the one the original audit covered (exporter-xlsx/consultants, fintech,
fixed-income, rpas; raw/2025-10-fixed-income-trading-summit, 2026-03-rpas-central-four-seasons,
2026-04-asset-mgmt-cfo-coo-waldorf, 2026-05-fintech-forum-cto-summit — each contributing an
`Address:`+`Phone:` pair). These are lexically identical near-misses to the confirmed TPs, but they
sit **outside** the audited 14 because the original audit's population was every fixture's actual
live `UNKNOWN_FIELD` parser warnings — in these 8 fixtures the real parser evidently already
resolves these rows some other way (`aliases.ts`'s own comment notes `contacts.venue` is "resolved
programmatically in `parseContacts` via regex", outside `FIELD_ALIASES`), so no warning was ever
emitted there, and the original audit never looked at them. Tracked as a separate bucket rather than
forced into TP or FP — they are real near-misses by the same criterion, just not part of the
originally-scoped 14.

**FP = 99** — see §5 for the full breakdown (dominated by one shape: bare `NAME` matching
`VENUE NAME`, 39 of the 99).

---

## 4. Guard iteration record

| variant | guards added | firings | TP | EXTRA | FP | verdict |
|---|---|---:|---:|---:|---:|---|
| v0 | none | 121 | 6 | 16 | 99 | baseline |
| v1 | `minNormalizedLen >= 5` | 82 | 6 | 16 | 60 | **kept** — kills all 39 `NAME` (4 chars) occurrences, zero TP/EXTRA loss |
| v2 | + `excludeAllCapsGenericSingleWord` | 82 | 6 | 16 | 60 | **kept** (no-op on this corpus: `NAME` was already killed by v1; retained as an independent, corpus-general defense — a future all-caps single-word match ≥5 chars would only be caught by this guard, not the length one) |
| v3-rejected | + `requireBlockOpenerRecognized` (only scan blocks whose own opening col0 already resolves) | 47 | **4** | 16 | 27 | **rejected** — cuts FP hard (Room-Diagram-in-Timestamp, Backdrop, Speaker, Details? all drop), but the roundtable fixture's block opener is itself the fused, unresolved `Client:/Contact:` label (same root cause as the ADDITIONAL ROOM miss above), so the whole block gets treated as "unstructured" and **both required TPs inside it (`Address:`, `Phone:`) get suppressed too**. Net TP regression — not shipped. |
| v-rejected-multitoken | v2 + `requireMultiTokenForSubset` (task-suggested: require ≥2 tokens for any type-b match) | 25 | **0** | **0** | 25 | **rejected, catastrophically** — every confirmed TP and every EXTRA is a *single-token* subset match (`Stage`→`{stage}`, `Storage`→`{storage}`, `Address:`→`{address}`, `Phone:`→`{phone}`); this guard blocks the exact match shape the real near-misses use. |
| v-rejected-distinctive1 | v2 + `requireDistinctiveToken<=1` (task-suggested: candidate token must appear in ≤1 vocab entry) | 39 | **5** | **8** | 26 | **rejected** — `address` has vocab doc-frequency 4 (it appears in `venue.address`'s 2 normalized forms + `hotels.name`'s 2 "Hotel Name/Address" forms), so threshold 1 suppresses the confirmed TP `Address:` (and half the EXTRA rows using the same shape). |
| **v-rejected-distinctive4 (v2 + `requireDistinctiveToken<=4`)** | threshold raised to 4 — the *exact* vocab doc-frequency of `address`, the least-distinctive required-TP token (`max(freq(stage)=1, freq(storage)=1, freq(phone)=1, freq(address)=4) = 4`) | **66** | **6** | **16** | **44** | **ADOPTED AS FINAL** — strictly dominates v2: identical TP (6/6) and EXTRA (16/16), FP cut from 60→44 by removing 16 `Contact`/`Contact:`/`Details?` rows for free. |

Two guards from the task's suggestion list were tried, measured, and **not adopted** because they
cost required TPs on this exact corpus (not theoretical — both were run, not just reasoned about):
`requireMultiTokenForSubset` and `requireDistinctiveToken<=1`. The threshold-4 variant of the same
distinctiveness idea, calibrated to the corpus's own required-TP frequencies rather than an arbitrary
round number, is the one piece of the "distinctiveness" family that actually pays off.

---

## 5. FINAL rule (v2 + `requireDistinctiveToken<=4`)

Exact guard definitions (`.claude/tmp/near-miss-calibration-probe.ts:180-232`):

```ts
minNormalizedLen: 5                 // candidate's normalized string must be >= 5 chars
excludeAllCapsGenericSingleWord: true  // reject if raw col0 is ALL-CAPS (allowing &/#'.- ) AND single-token
requireDistinctiveToken: 4          // for type-b (subset) matches, candidate must contain >=1 token
                                     // whose vocab doc-frequency (# of distinct normalized vocab
                                     // entries containing that token) is <= 4
requireMultiTokenForSubset: false   // NOT applied — breaks every real single-token near-miss
requireBlockOpenerRecognized: false // NOT applied — breaks the roundtable fixture's TPs
```

**Corpus result: TP = 6/6 (all catchable TPs kept), EXTRA = 16/16 kept, FP = 44** (down from 99 at
v0, a 55% cut, with zero loss anywhere it was measured against a known-good row).

### Full per-fixture hit table (final rule)

| fixture | candidates | firings | guard-suppressed |
|---|---:|---:|---:|
| exporter-xlsx/consultants.md | 207 | 6 | 3 |
| exporter-xlsx/east-coast.md | 119 | 3 | 1 |
| exporter-xlsx/fintech.md | 148 | 5 | 4 |
| exporter-xlsx/fixed-income.md | 90 | 4 | 3 |
| exporter-xlsx/redefining-fi.md | 312 | 3 | 3 |
| exporter-xlsx/ria.md | 506 | 4 | 3 |
| exporter-xlsx/rpas.md | 143 | 4 | 4 |
| raw/2024-05-east-coast-family-office.md | 245 | 2 | 2 |
| raw/2025-03-dci-rpas-central.md | 404 | 3 | 3 |
| raw/2025-04-asset-mgmt-cfo-coo.md | 314 | 3 | 3 |
| raw/2025-05-redefining-fixed-income-private-credit.md | 400 | 3 | 3 |
| raw/2025-06-ria-investment-forum.md | 501 | 4 | 3 |
| raw/2025-10-consultants-roundtable.md | 216 | 6 | 1 |
| raw/2025-10-fixed-income-trading-summit.md | 495 | 4 | 4 |
| raw/2026-03-rpas-central-four-seasons.md | 553 | 4 | 5 |
| raw/2026-04-asset-mgmt-cfo-coo-waldorf.md | 535 | 4 | 5 |
| raw/2026-05-fintech-forum-cto-summit.md | 548 | 4 | 5 |
| **TOTAL** | **5736** | **66** | **55** |

(66 firings = 6 TP + 16 EXTRA + 44 FP.)

### Residual 44 FP, grouped and judged honestly (not tuned to zero)

| col0 | count | judgment |
|---|---:|---|
| `Room Diagram` | 24 | **Structural false positive, out of scope by the task's own exclusion definition.** `lib/parser/blocks/event.ts:91` — `"room diagram": "room_diagram"` — is *already* a recognized key in `event.ts`'s own internal `CANONICAL_KEY_MAP`, kept as a legacy pre-2026-template alias (see the comment at `event.ts:84-89`). The task scoped the exclusion check to `aliases.ts` + the section-header registries only, not block-internal maps, so this row is correctly a "candidate" by the letter of the spec, but it is not a real gap in production — a real implementation would need to also exclude each block's own `CANONICAL_KEY_MAP`-style vocabulary. Resists every guard tried without also cutting TP-shaped rows, because it's 2 tokens (survives `requireMultiTokenForSubset`) and both tokens are individually rare in the vocab (survives distinctiveness). |
| `Backdrop` | 15 | **Plausible genuine near-miss, not noise — outside the audited 14 only because it apparently never emits a live `UNKNOWN_FIELD` warning today.** Appears with real paired values (`"Backdrop \| LED screen: 8.2' x 14.76'"`, consultants.md:287; similarly in fixed-income/fintech/rpas/redefining-fi/ria and their raw counterparts) in 6 of 7 xlsx fixtures. It is missing only `" / Scenic"` from `event.scenic`'s alias `"Backdrop / Scenic"` — and `event.ts`'s own `CANONICAL_KEY_MAP` only knows the full "backdrop / scenic" spelling, not bare "backdrop", so this looks like a real, currently-unrecognized field spelling, not a fixture artifact. |
| `Contact` / `Contact:` | 0 (suppressed by the final guard) | Sits inside `CLIENT`/`Client:` blocks alongside real aliases `Contact Cell`/`Contact Office`/`Contact Email` (e.g. `fixed-income.md:7`, `"Contact \| Ashley Morgan"`) — plausibly a near-miss of `client.contact` (`"Client Contact"`, missing "Client"). The final rule trades this away for the FP-volume win (see §4); flagging the trade explicitly rather than burying it. |
| `Speaker` | 2 | **Genuine noise, resists every deterministic guard tried.** Pull-sheet/gear equipment category row listing speaker models (`ria.md:964`, `"Speaker \| QSC KLA \| QSC K10 \| ..."`), not a field:value pair. Its sole token `speaker` has vocab doc-frequency **1** — identical to `stage` and `storage`, both required TPs — so no frequency/distinctiveness threshold can separate it from the true positives using vocabulary statistics alone. Distinguishing it needs the row's own shape (many populated columns vs. two) or block context, both of which rule v0 explicitly excludes ("position never enters"). |
| `Notes` | 2 | **Genuine noise, resists every deterministic guard tried for the same reason as `Speaker`.** `"Notes \| N/A"` inside a `DETAILS` block, matched against unrelated `VENUE NOTES`. `notes` has vocab doc-frequency **2**, *lower* than `address`'s frequency of 4 (a required TP) — proof, not assumption, that no single frequency threshold can keep `Address:` while dropping `Notes`. |
| `Load In:` | 1 | Plausible — `"Load In: \| Carlos Pineda"` inside `TRANSPORTATION`, a likely near-miss of `transport.load_in_at_venue` (`"Load In at Venue"`), missing "at Venue". |

**Total accounted for: 24 + 15 + 2 + 2 + 1 = 44.** (`Contact`/`Contact:`/`Details?` are already
suppressed by the final rule, not double-counted here.)

---

## 6. Summary

- **Vocabulary**: 174 raw strings → **138 distinct normalized entries** (aliases.ts + block
  `SECTION_HEADER_TOKENS` + `sectionKind.ts` `LABEL_TO_KIND` keys).
- **Candidate rows**: **5736** total across the 17-fixture corpus, verified stable across 3
  independent measurements.
- **Final rule** (v2 + `requireDistinctiveToken<=4`): **66 firings** = **6 TP** (all catchable
  members of the audited 14 — 8 of the 14 are misses for concrete, non-guard-fixable reasons listed
  in §3) + **16 EXTRA** (same shape, additional fixtures beyond the original audit's scope) + **44
  residual FP** (24 structural — already resolved elsewhere in the real parser; 15 + 1 plausible new
  near-misses, not true noise; 4 genuine noise that resists every deterministic guard tried without
  losing a required TP).
- No guard was tuned to force residual FP to zero; two guard families were tried and explicitly
  rejected with numbers (§4) because they cost confirmed true positives on this exact corpus.

---

# FOLLOW-UP: consumption check (A), normalization v3 (B), combined baseline (C)

Everything above (§1-6) is the original calibration record, unchanged. This section answers the
coordinator's two follow-up asks and combines them into the spec's committed baseline.

Probe: `.claude/tmp/near-miss-followup-probe.ts` (duplicates the original probe's verified
vocab/candidate/match/guard logic rather than refactoring it — kept the already-checked original
script untouched). Rerun: `pnpm exec tsx --tsconfig tsconfig.json .claude/tmp/near-miss-followup-probe.ts`
(writes `.claude/tmp/near-miss-followup.json`; console transcript at
`.claude/tmp/near-miss-followup-output.txt`). Numbers below are stable across independent reruns
(re-verified twice after the classifier fix in §7.1).

## 7. Part A — consumption check

**Method, exactly as specified**: for each of the final rule's 66 firing rows, delete that one
physical markdown line (a line-index-preserving parallel of `parseTableRows`,
`.claude/tmp/near-miss-followup-probe.ts:161-176`, verified to reproduce `parseTableRows`'s cell
output exactly on all 17 fixtures before being trusted), reparse with `parseSheet`, and compare
`payloadOf` (`tests/parser/mutation/oracle.ts:15-18`) against the unmodified parse.

### 7.1 A finding that overturns the naive binary rule — found empirically, not assumed

The literal instruction ("payload changed = CONSUMED = production FP, drop it") **would have wrongly
dropped `Stage` and `Storage` — the only two rows the original human-reviewed audit confirmed as
genuine near-miss typos.** Diagnosed with a deep key-path diff
(`.claude/tmp/diag-consumption3.ts`, then folded into the main probe):

```
east-coast.md "Stage"   deleted -> payload.show.event_details.stage:   "8' x 24' x 2'" -> undefined
east-coast.md "Storage" deleted -> payload.show.event_details.storage: "Back of house..." -> undefined
```

The payload **does** change — but under `event_details.stage`/`.storage`, never
`.stage_size`/`.equipment_storage` (the canonical fields the near-miss match implicated). Root cause,
confirmed by reading the source: `event.ts`'s "genuinely-unknown label" fallback
(`lib/parser/blocks/event.ts:211-224`) BOTH writes the value under a generic self-slug key
(`toCanonicalKey(col0)`, `event.ts:407-412`) AND emits `UNKNOWN_FIELD` — so an unresolved label
routinely changes the payload without ever reaching its intended canonical field. A binary
payload-diff rule cannot tell that apart from a row that's genuinely, correctly resolved.

**Refined 3-way verdict** (`consumptionCheck`, `.claude/tmp/near-miss-followup-probe.ts:277-327`):

| verdict | meaning | stays a candidate? |
|---|---|---|
| `UNCONSUMED` | payload literally unchanged — value is lost entirely | yes |
| `CONSUMED_OFFLABEL` | payload changed, but every changed leaf's final key equals the row's own self-slug (`toCanonicalKeyApprox`) — the generic fallback caught it, not a real field | **yes** |
| `CONSUMED_OTHER_KEY` | payload changed under a genuinely different key | no — drops |

`CONSUMED_OFFLABEL` needed one more refinement: a self-slug match is ambiguous by itself, because
`event.ts`'s OWN curated `CANONICAL_KEY_MAP` (`event.ts:68-116`) sometimes maps a label to a slug
string that happens to equal what the generic fallback would ALSO have produced (`"room diagram":
"room_diagram"`, `notes: "notes"`) — those never touch the fallback branch at all; they take the
curated exact-match branch (`event.ts:183-189`). The probe imports the real `CANONICAL_KEY_MAP`
(not a guess) and reclassifies any self-slug match that is ALSO an explicit curated entry as
`CONSUMED_OTHER_KEY`. Without this cross-check, "Room Diagram" and "Notes" would have been
miscounted as "still a candidate" when they are in fact genuinely, deliberately resolved.

### 7.2 Verdicts by group (66 v0-final firings)

| group | UNCONSUMED | CONSUMED_OFFLABEL | CONSUMED_OTHER_KEY | total | disposition |
|---|---:|---:|---:|---:|---|
| TP (Stage/Storage/Address:/Phone:) | 2 | 4 | **0** | 6 | **all 6 stay** — confirms the audit's judgment; the 4 OFFLABEL rows (Stage×2, Storage×2) are exactly the "silently siloed off-label" failure mode the detector should catch |
| EXTRA (Client-contact shape, other fixtures) | 16 | 0 | **0** | 16 | **all 16 stay** — refutes my earlier speculation that these might already be handled by `contacts.ts`'s regex path elsewhere; empirically none of them are |
| FP: Room Diagram | 21 | 0 | **3** | 24 | the 3 dropped are exactly the `DETAILS`-block instances (real rows with real values, `LINK`/etc.) — confirms §5's "structural FP, already resolved via `event.ts`'s own map" judgment with a live probe, not just a source-reading inference. The 21 `Timestamp`-block instances stay (Google-Forms echo text never reaches the `DETAILS` parser at all — deleting it changes nothing) |
| FP: Backdrop | 15 | 0 | **0** | 15 | **all 15 stay unconsumed** — strengthens §5's "plausible new near-miss, not noise" judgment; genuinely never captured anywhere today |
| FP: Speaker | 2 | 0 | **0** | 2 | stays — confirms genuine noise that is nonetheless never consumed (irrelevant to its FP status, but consistent) |
| FP: Notes | 1 | 0 | **1** | 2 | the consultants.md instance (value `"N/A"`) drops — `event.ts`'s `notes: "notes"` curated entry resolves it to its own real, unrelated field; the roundtable.md instance (empty value) stays UNCONSUMED (never written at all — `presence()` filters empty values before the write) |
| FP: Load In: | 0 | 0 | **1** | 1 | drops — resolves to `transportation.driver_name` via a mechanism in `transport.ts` unrelated to the near-miss vocab match |

**Total: 61 of 66 stay a candidate; 5 drop as genuine production false positives.**

## 8. Part B — normalization v3

**Upgrade 1** (full punctuation collapse): `normalizeV3(raw) = decodeEntities(raw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()` — replaces the v0 rule's "collapse whitespace, strip one trailing colon" with "collapse EVERY run of non-alphanumeric characters to one space." Match type (a) becomes v3-string-equality; type (b) becomes subset-**OR-equal** (previously proper-subset-only) token sets.

**Upgrade 2** (intra-word-hyphen fusion): `fusedForm(raw)` additionally deletes hyphens that sit
directly between two alphanumeric characters (regex `/([a-z0-9])-([a-z0-9])/g` → `"$1$2"`) *before*
the same punctuation-collapse — so `"E-mail:"` → `"email"` (single fused token) rather than `"e
mail"` (two tokens). Free-standing hyphens with non-alnum neighbors (`"9:00PM - LOAD IN"`) are
untouched, so this never widens match surface for punctuation that already reads as a real word
boundary. Both the plain and fused forms are tried against both match types; a hit on either counts.

Applied on top of the **unchanged** final guard set (minLen 5, all-caps-single-word exclusion,
distinctiveness ≤4 — recomputed against the v3 vocabulary's own doc-frequencies).

**Vocabulary size under v3**: 132 distinct normalized entries (down from 138 — full-punctuation
collapse merges a few more raw strings, e.g. `"Hotel Name / Address"` and `"Hotel Name/Address"` now
normalize identically).

**Result**: 77 firings (up from 66) = **TP 7** (up from 6) + **EXTRA 25** (up from 16) + **FP 45**
(up from 44). **Zero TP/EXTRA regressions** (`"lost vs v0-final"` is empty — checked explicitly, not
assumed).

**Named-miss verification** (roundtable.md, the fixture holding all six):

| col0 | v3 result | mechanism |
|---|---|---|
| `Client:/Contact:` | **RECOVERED** (type a) | full-punctuation normalize: `"client:/contact:"` → `"client contact"`, exact-equals the `"Client Contact"` alias's own v3 form |
| `E-mail:` | **RECOVERED** (type b, fused) | hyphen-fusion: `"e-mail:"` → fused `"email"` → subset of `{client,email}`/`{contact,email}`. Recovered in **all 9 fixtures** where the row occurs, not just roundtable.md |
| `ALT. E-mail:` | **still miss** | fused form is `"alt email"` — tokens `{alt,email}`; `"alt"` is not a token in `Client Email`/`Contact Email`, so it's not a subset of either. No vocabulary entry contains "alt" at all. |
| `Cell Phone:` | **still miss** | tokens `{cell,phone}`; no single vocab entry's token set is a superset of both (`Contact Cell`={contact,cell}, `Client Phone`={client,phone}) |
| `Fax:` | **still miss** | "fax" is not a token anywhere in the vocabulary |
| `Event Name:` | **still miss** | "Event Name" is not a `FIELD_ALIASES` entry; nothing in the vocabulary contains both "event" and "name" |

Confirmed exactly as anticipated: the two recoverable-by-normalization misses recover; the three
misses with no vocabulary counterpart (plus `ALT. E-mail:`, which fails for the same "extra token"
reason, not a normalization defect) stay misses.

**One incidental new FP**: `"Diagrams?"` (raw/2024-05-east-coast-family-office.md, block `JOANN`) —
under v3's subset-or-**equal** widening, tokens `{diagrams}` now equal-match the `"Diagrams"` alias's
token set (previously excluded as non-proper). Same shape as the already-documented `"Details?"` FP
in the same `JOANN` block (§5) — almost certainly a Google-Forms-style intake question, not a field
near-miss. Net FP growth is exactly this one row (44→45); every other FP from §5 is unchanged.

## 9. Part C — combined definitive expected-emission set

Consumption-aware candidacy (§7, drop only `CONSUMED_OTHER_KEY`) applied to the v3-normalized firing
set (§8, 77 rows): **5 drop** (the same 5 identified in §7.2 — v3 introduces no new
`CONSUMED_OTHER_KEY` rows; every newly-recovered row (`Client:/Contact:`, the 9 `E-mail:` rows,
`Diagrams?`) is `UNCONSUMED`).

**Definitive expected-emission set: 72 rows across 17 fixtures.**

| fixture | count |
|---|---:|
| exporter-xlsx/consultants.md | 5 |
| exporter-xlsx/east-coast.md | 3 |
| exporter-xlsx/fintech.md | 5 |
| exporter-xlsx/fixed-income.md | 5 |
| exporter-xlsx/redefining-fi.md | 2 |
| exporter-xlsx/ria.md | 3 |
| exporter-xlsx/rpas.md | 5 |
| raw/2024-05-east-coast-family-office.md | 3 |
| raw/2025-03-dci-rpas-central.md | 3 |
| raw/2025-04-asset-mgmt-cfo-coo.md | 3 |
| raw/2025-05-redefining-fixed-income-private-credit.md | 3 |
| raw/2025-06-ria-investment-forum.md | 4 |
| raw/2025-10-consultants-roundtable.md | 8 |
| raw/2025-10-fixed-income-trading-summit.md | 5 |
| raw/2026-03-rpas-central-four-seasons.md | 5 |
| raw/2026-04-asset-mgmt-cfo-coo-waldorf.md | 5 |
| raw/2026-05-fintech-forum-cto-summit.md | 5 |
| **TOTAL** | **72** |

Full per-row detail (col0, block, match type/via, vocab target) for all 72 rows is in
`.claude/tmp/near-miss-followup.json` under `partC.perFixture`, and printed in
`.claude/tmp/near-miss-followup-output.txt` (search `PART C`).

**Composition of the 72**: 7 TP (Stage×2, Storage×2, Address:/Phone:/`Client:/Contact:` in
roundtable.md) + 25 EXTRA (the Client-contact colon shape recurring in 9 fixtures beyond roundtable,
now including `E-mail:`) + 40 residual FP (24-3=21 `Room Diagram` in `Timestamp` blocks, 15
`Backdrop`, 2 `Speaker`, 1 `Notes` [roundtable's empty-value instance], 1 `Diagrams?`).

## 10. Updated bottom line

- The naive "payload changed ⇒ drop" reading of the consumption check would have silently removed
  the two most-confirmed true positives in the whole corpus (Stage/Storage) — settled empirically
  with a 3-way verdict cross-checked against `event.ts`'s real `CANONICAL_KEY_MAP`, not asserted.
- v3 normalization recovers `Client:/Contact:` and `E-mail:` (9 of the corpus's occurrences) with
  zero TP/EXTRA loss and exactly one incidental new FP, matching the same low-signal shape already
  documented in §5.
- The **committed baseline for the spec is 72 rows across 17 fixtures** (§9) — this is the number
  a structural meta-test pinning "expected near-miss emissions" should assert, not the 66 from the
  original v0-final calibration.

## 11. Addendum — r4 recalibration: resolution-site consumption (2026-08-15)

The cross-model r4 review counted the retained `Room Diagram` family per-row and found the §9
composition wrong in a way that exposed a semantics defect, not a tally slip: of the 21 retained
`Room Diagram` rows, only 15 are `Timestamp`-block Google-Forms echoes; 6 sit in DETAILS-family
blocks (incl. `GS DETAILS (FOR BOTH)`) as EXACT curated fields with EMPTY values. Under Part A's
deletion-diff verdict they read UNCONSUMED (deleting an empty row changes no payload), so the
write-site ledger kept them as candidates and the detector reported each correctly named field as
a near-miss of ITSELF. Same defect on the roundtable's empty-value `Notes` row.

Repair (spec §3.3, r4): the ledger marks at the RESOLUTION site — a row is consumed iff a block
parser resolves its label to a curated canonical key, regardless of whether a value is written.
Measured by Part D (appended to the follow-up probe; simulation = event `SECTION_HEADER_TOKENS`
scope + `CANONICAL_KEY_MAP` exact + `gatedVocabCorrect` with event.ts's replicated gate options):

- Resolution-site drops vs the 72-row Part C set: exactly 7, all `exact:` curated resolutions
  (6× `Room Diagram` in DETAILS-family blocks, 1× roundtable `Notes`). No fuzzy drops.
- All 7 audited TPs retained (Stage ×2, Storage ×2, Address:, Phone:, Client:/Contact: — the
  fallback self-slug path is not resolution). All 15 `Timestamp` forms echoes retained.
- **The committed baseline for the spec is now 65 rows across 17 fixtures**
  (`SUMMARY-D room_diagram_timestamp=15 room_diagram_details=0 new_total=65`), superseding §9/§10's
  72. Composition: 7 TP + 25 EXTRA + 33 residual FP (15 `Room Diagram` Timestamp echoes, 15
  `Backdrop`, 2 `Speaker`, 1 `Diagrams?`). `Notes` leaves the residual set entirely.
- Both probe scripts were made runnable from their committed paths in the same repair
  (`@/`-alias imports replacing the stale `.claude/tmp`-relative ones — r4 finding 5).
