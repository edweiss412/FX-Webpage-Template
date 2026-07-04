# Edge-Case Preparedness Audit — 2026-07-04

**Question:** the fxav-test-shows corpus is a non-exhaustive, representative sample of how future show-bible sheets *could* look. How prepared is the ingestion pipeline (drive export → parser → sync/apply) for likely variation outside the canonical happy path?

**Method:** four parallel read-only investigations (parser failure-mode architecture; ingestion/sync pipeline resilience; test-coverage inventory; hardcoded-assumption brittleness sweep), synthesized against the 2026-06-18 grounding audit (`sheet-data-grounding-audit-2026-06-18.md`), which already established the corpus has no fixed tab set, a column-shifted structural outlier (East Coast), `#REF!` backend tabs, and one-sheet-two-shows bundling.

---

## 1. Overall verdict

**The architecture is genuinely variation-aware in its skeleton, but its defense posture is "hard failures are loud, soft failures are quiet" — and future variation will mostly produce soft failures.** The pipeline never crashes on weird input (the parser never throws by design), sections are label-anchored rather than positional, exports are tab-name-agnostic, and first-seen shows stage for human review fail-closed. But the two failure classes future variation is most likely to produce — *silent wrong parse* (novel template mis-classified, section quietly dropped, field regex missing a new format) and *silent destructive re-sync* (a degraded parse of a live show auto-applies with full-replace semantics) — both land in the quiet band: no admin alert, at most a passive Data-Quality badge a human sees only if they open that show.

The single human-in-the-loop gate (pending_syncs staging) fires only at first-seen and on MI-1..5b hard fails. Everything else — crew shrinkage, block disappearance, per-field losses — auto-applies to live shows.

---

## 2. What is already good (credit where due)

- **Content-based version detection, not tab/gid-based** (`lib/parser/schema.ts:21`); export iterates all tabs (`lib/drive/exportSheetToMarkdown.ts:214-227`); reordered sections are safe (block parsers scan the whole doc).
- **Parser never throws** — degrades to a minimal ParsedSheet + `hardErrors`/`warnings[]`/`raw_unrecognized[]` (`lib/parser/index.ts:486-526`).
- **Existing-show hard failure retains last-good + raises `PARSE_ERROR_LAST_GOOD`** admin alert (`lib/sync/runScheduledCronSync.ts:2773-2802`).
- **First-seen staging is fail-closed by default** (`getAutoPublishCleanFirstSeen.ts:8`); clean first-seen still stages for review.
- **Discovery is MIME + folder based** — no filename-pattern gate; renames are safe via `drive_file_id` key (`lib/drive/list.ts:78`, `runScheduledCronSync.ts:482,571`).
- **Anchors fail link-less, never wrong-cell** (`lib/drive/showDayTimeAnchors.ts:63`, `sourceAnchors.ts:205-211`).
- **Principled typo gate** (Damerau dist-1, minLen 5, tie-abort, cross-vocab exclusion) with exhaustive single-edit-neighborhood tests (`tests/parser/_typoGenerator.ts:5`).
- **Cardinality caps warn instead of failing silently** (MAX_HOTELS=4 `hotels.ts:28`, agenda MAX_ENTRIES=200 `agenda.ts:310`).
- Crew/dates/typo-gate domains have real synthetic-variation test coverage (calendar-invalid dates, restriction variants, malformed emails/phones).

---

## 3. Risk-ranked findings

### Tier 1 — silent wrong parse / silent data loss (high likelihood × high severity)

| # | Finding | Evidence | Plausible trigger | Failure behavior |
|---|---|---|---|---|
| 1 | **v1 is a catch-all: any markdown with a pipe-table row classifies as v1** | `lib/parser/schema.ts:83-85` | Doug adopts a new template layout | Whole show parsed with v1 rules — silent mis-parse, zero signal. `MI-1` fires only when there is *no table at all* |
| 2 | **v4/v2 detection each hinge on ONE label literal** ("Contact Office" / "Hotel Contact Info") | `schema.ts:39-134` (v4 marker at `:42`) | Doug renames the row ("Office Contact") or drops it | Silent downgrade to v2/v1 → wrong extraction rules for every field |
| 3 | **Re-sync shrinkage auto-clobbers live data — newest sheet always wins** | `lib/sync/phase1.ts:333-344` (MI-6..14 = notify-only); `applyParseResult.ts:128-200` (unconditional `deleteCrewMembersNotIn` + `replaceRooms/Hotels/...`) | Doug deletes/moves a block mid-edit; sync fires between keystrokes | Live show overwritten. `BLOCK_DISAPPEARED` is warn-only (`invariants.ts:234-313`); MI-6 crew shrink has no panel warning; only a passive `DataQualityBadge` |
| 4 | **Unrecognized section without a ≥2-field-header person-table band is dropped with zero signal** | Class-B post-scan threshold at `lib/parser/index.ts:655` | Any new non-roster section (e.g. "SHIPPING", "SECURITY", "AV NOTES") | Content silently absent from crew pages |
| 5 | **Short section headers (CREW/TECH/HOTEL/VENUE/DATES) have no typo tolerance** — only long headers auto-correct | `sectionHeaderNormalize.ts:16,66` | One typo: "HOTLE", "CRWE" | CREW/DATES/rooms typos trip MI-3/4/5 → loud; HOTEL/TRANSPORTATION typos → section silently vanishes (≤ warn-only MI-7) |
| 6 | **Venue-specific room names hardcoded into the room-header regex** (`MABEL`, `LAUDERDALE`) | `lib/parser/blocks/rooms.ts:687,881,818` | Every new venue has new room names; a bare proper-name GS header (`SALON ABCD\n60' x 45'`) | GS/rooms for that venue lost or mis-grouped |

### Tier 2 — per-field / per-crew silent degradation (moderate likelihood, contained blast radius)

| # | Finding | Evidence | Plausible trigger | Failure behavior |
|---|---|---|---|---|
| 7 | **Stage-restriction parsing recognizes exactly 3 hand-picked phrasings** | `lib/parser/personalization.ts:52-56` | `Set / Strike ONLY***`, reordered list, `Rehearsal ONLY***` | Falls to `unknown_asterisk` → crew member sees whole show + warning instead of filtered days |
| 8 | **Dates are M/D/YYYY-regex-only; 2-digit years pinned to 20XX** | `dates.ts:313`, `_helpers.ts:96` | "June 24, 2026", ISO, dash-dates | Dates missed → MI-3 hard fail (loud) or partial schedule |
| 9 | **US-only address shape** (closed street-suffix vocab + `[A-Z]{2} \d{5}`) | `hotels.ts:251,257`, `exportSheetToMarkdown.ts:61` | Canadian venue; "Crescent"/"Commons" street | hotel/venue address lost; also flips exporter newline heuristic |
| 10 | **Blank-row block segmentation** — stray value in a spacer fuses sections; blank row mid-section splits one | `exportSheetToMarkdown.ts:104` | Normal authoring noise | Sections mis-grouped downstream, silent |
| 11 | **Dims regex requires feet-mark + literal `x`** | `rooms.ts:839` | `50 x 40`, `50ft x 40ft`, `50′×40′` | dims field lost (room survives) |
| 12 | **`OLD` word-boundary tab skip** drops any tab containing "OLD" | `exportSheetToMarkdown.ts:222`, `crewRoleAnchors.ts:138` | "OLD MAIN BALLROOM" tab | Tab silently omitted from parse |
| 13 | **Closed typo vocabs can mis-correct a genuinely-new term** within edit-distance-1 of a member | `typoVocabRegistry.ts`, `aliases.ts:212` | New role name near an existing one | Wrong canonicalization, warn-level at best |

### Tier 3 — pipeline signal gaps (failure happens elsewhere; the problem is nobody is told)

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| 14 | **First-seen hard-fail raises no admin alert** — cron alert path guards on `show?.showId` (null for first-seen) | `runScheduledCronSync.ts:2784`; onboarding writes manifest `status:"hard_failed"` only (`runOnboardingScan.ts:724-747`) | A new show Doug adds that hard-fails is invisible unless someone opens the wizard |
| 15 | **`UNEXPECTED_PARENT` is fully silent** — no production caller wires `onWarning` | `lib/drive/list.ts:112` | Misfiled sheet dropped with zero telemetry |
| 16 | **Degraded-parse dataGaps never push an alert** — persisted to `shows_internal.parse_warnings`, rendered only on operator surfaces if opened; `severity:"info"` filtered everywhere | `runScheduledCronSync.ts:1463,898`; `dataGaps.ts:8-11,64,218` | A show can silently degrade across re-syncs with no push signal |
| 17 | **`parseSheet` call site unguarded** — a genuine throw (novel structure hitting an unanticipated code path) fails the whole sync | `runScheduledCronSync.ts:2582` | At least loud (`PARSE_ERROR_LAST_GOOD`), but fails sync instead of staging |

### Tier 4 — test-coverage gaps (the safety net has the same corpus bias as the code)

- **Zero property/fuzz testing** (`fast-check` absent). The primary net is golden-file replay of the 15 historical fixtures (`exporterFixtures.test.ts`) — a novel-but-valid shape has *no test analog by construction*.
- **No tests for realistic Sheets corruption**: `#REF!` cells (present in 3 of 7 live shows!), unicode/zero-width chars (seen live: fintech ZWNJ), merged-cell pipe shifts, column reordering, extra columns/rows.
- **MI-1 (garbage sheet → hardError) untested end-to-end** at `parseSheet` — `parseSheet.test.ts:207` deliberately avoids the early-return path.
- **Meals has no parser domain at all**; personalization variation coverage is thin (only 3-phrase restriction shapes, which is finding #7's blind spot mirrored in tests).
- **Transportation/agenda/event/venue/contacts lean fixture-replay** — malformed-row behavior unspecified.
- `_metaKnownSectionsRegistry.test.ts` is a hand-maintained pin, not a source walker (`BL-KNOWN-SECTIONS-WALKER` already filed) — a new block parser's header can drift in unregistered and pass green.

---

## 4. Structural diagnosis

Three cross-cutting patterns explain most of the table above:

1. **Single-literal anchors.** Version markers (one row label), room-header recognition (two venue names), stage restrictions (three exact phrasings) each hang a large behavior on one string Doug can vary in normal authoring. When they miss, the failure is *plausible-looking wrong output*, not an error.
2. **The quiet middle band.** Signals exist (warnings, dataGaps, BLOCK_DISAPPEARED, app_events) but are pull-only. The alert-pushing channels cover infra failures (fetch, watch, stall, total parse failure) — not semantic degradation. Future variation lands almost entirely in the semantic band.
3. **Corpus-shaped everything.** Regexes, vocabs, and the test suite are all tuned to the same 7-show sample. The tests can't catch what the code misses because they share its priors.

---

## 5. Recommendations (ranked, not yet actioned)

1. **Version-detection confidence gate.** Replace the v1 pipe-table catch-all with multi-marker scoring; below-threshold confidence → hard-flag `VERSION_AMBIGUOUS` and stage for review instead of silently parsing as v1. (Kills findings #1–#2, the highest-leverage fix in the audit.)
2. **Re-sync quality gate.** Promote MI-6/MI-7 shrinkage from notify-only to staged-for-review (or at minimum a pushed admin alert) on live shows; consider a "new parse materially worse than last-good" comparator before `applyParseResult` full-replace. (Kills #3, the highest-severity data-loss vector.)
3. **De-literalize the three Tier-1 anchors:** generalize room-header recognition beyond MABEL/LAUDERDALE (shape-based: label-less proper name + dims/floor); token-set grammar for stage restrictions instead of exact phrases; add short-header typo tolerance with tight gating.
4. **Wire the silent channels:** `onWarning` at `list.ts:112`; first-seen hard-fail alert; a dataGaps-threshold alert (e.g. new warnings on a published show since last sync).
5. **Mutation-testing harness over existing fixtures:** programmatic column-shift, blank-row injection/removal, `#REF!` substitution, unicode injection, merged-cell simulation, header typos — assert every mutation is either parsed correctly or *signaled*, never silently wrong. This is the structural answer to "the corpus is non-exhaustive"; it manufactures the missing corpus.
6. **Close the known small holes:** MI-1 e2e test, known-sections source walker (BL filed), guard the `parseSheet` call site, widen dims/address/date formats opportunistically.

---

*Sources: four subagent investigations 2026-07-04 (failure-mode architecture, pipeline resilience, test coverage, brittleness sweep); `sheet-data-grounding-audit-2026-06-18.md`; memory grounding `reference_parser_room_hotel_variance_grounding`. File:line citations verified by the investigating agents against HEAD `50b0ec2f`.*
