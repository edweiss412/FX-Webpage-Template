# RightNow §8.2 — 12-state transition matrix (66 pairs)

**Source of truth**: `lib/time/rightNowTransitions.ts` (`RIGHT_NOW_TRANSITION_MATRIX`).

This document is a human-readable rendering of the same matrix the
audit tests drive from. Any drift between this file and the TypeScript
constant is a bug in this file — the TS constant is canonical.

---

## States (12)

| #   | Kind                    | Notes                                                                     |
| --- | ----------------------- | ------------------------------------------------------------------------- |
| 1   | `pre_travel`            | today < travelIn − 1 day (and viewer unrestricted or pre-first-day)       |
| 2   | `travel_in_day`         | today === travelIn                                                        |
| 3   | `set_day`               | today === setDay                                                          |
| 4   | `show_day_n`            | today === showDays[n]                                                     |
| 5   | `travel_out_day`        | today === travelOut                                                       |
| 6   | `post_show`             | today > travelOut                                                         |
| 7   | `viewer_off_day`        | viewer explicit days, today not in days, today in span                    |
| 8   | `viewer_off_day_pre`    | viewer explicit days, today < travelIn AND today < first viewer day       |
| 9   | `viewer_unconfirmed`    | viewer.date_restriction.kind === 'unknown_asterisk'                       |
| 10  | `viewer_after_last_day` | viewer explicit days, today > max(viewer.days)                            |
| 11  | `dateless`              | no parseable show date at all                                             |
| 12  | `unknown`               | one or more parseable but not all (gate: travelIn AND travelOut required) |

---

## Treatments (4)

| Treatment            | When applied                                          | Visual                                                                                                                          |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `crossfade-body`     | Date rollover OR data-edit recovery                   | Card body crossfades; container `min-h-[X]` preserves height                                                                    |
| `morph-to-last-good` | Sync error (Any → unknown) OR fall-back to `dateless` | Card snaps to last-good payload; stale tint applied; no animation                                                               |
| `instant`            | User-initiated state change (currently no entry)      | Card swaps payload instantly; no tint                                                                                           |
| `unreachable`        | No natural code path on the 60-second tick            | Regression-guarded; assertion that the production state machine never produces this transition (sync skips route via `unknown`) |

---

## Pairwise grid (66 unordered pairs)

`C` = `crossfade-body` · `M` = `morph-to-last-good` · `U` = `unreachable` · `—` = self / lower triangle (matrix is symmetric).

|                           | pre_t | tr_in | set | show_n | tr_out | post | v_off | v_off_pre | v_unconf | v_after | datel | unkn |
| ------------------------- | :---: | :---: | :-: | :----: | :----: | :--: | :---: | :-------: | :------: | :-----: | :---: | :--: |
| **pre_travel**            |   —   |   C   |  U  |   U    |   U    |  U   |   C   |     C     |    C     |    C    |   M   |  M   |
| **travel_in_day**         |   —   |   —   |  C  |   U    |   U    |  U   |   C   |     C     |    C     |    C    |   M   |  M   |
| **set_day**               |   —   |   —   |  —  |   C    |   U    |  U   |   C   |     C     |    C     |    C    |   M   |  M   |
| **show_day_n**            |   —   |   —   |  —  |   —    |   C    |  U   |   C   |     U     |    C     |    C    |   M   |  M   |
| **travel_out_day**        |   —   |   —   |  —  |   —    |   —    |  C   |   C   |     U     |    C     |    C    |   M   |  M   |
| **post_show**             |   —   |   —   |  —  |   —    |   —    |  —   |   C   |     U     |    C     |    C    |   M   |  M   |
| **viewer_off_day**        |   —   |   —   |  —  |   —    |   —    |  —   |   —   |     C     |    C     |    C    |   M   |  M   |
| **viewer_off_day_pre**    |   —   |   —   |  —  |   —    |   —    |  —   |   —   |     —     |    C     |    U    |   M   |  M   |
| **viewer_unconfirmed**    |   —   |   —   |  —  |   —    |   —    |  —   |   —   |     —     |    —     |    C    |   M   |  M   |
| **viewer_after_last_day** |   —   |   —   |  —  |   —    |   —    |  —   |   —   |     —     |    —     |    —    |   M   |  M   |
| **dateless**              |   —   |   —   |  —  |   —    |   —    |  —   |   —   |     —     |    —     |    —    |   —   |  C   |
| **unknown**               |   —   |   —   |  —  |   —    |   —    |  —   |   —   |     —     |    —     |    —    |   —   |  —   |

(Read row → column. The grid is symmetric: `(a, b)` and `(b, a)` carry
the same treatment, so only the upper triangle is filled.)

---

## Rationale (per heuristic rule)

### Rule 4 — adjacent time-driven (5 pairs, `crossfade-body`)

Show-day sequence: `pre_travel → travel_in_day → set_day → show_day_n → travel_out_day → post_show`.

- `pre_travel ↔ travel_in_day` — date rollover travelIn-1 → travelIn (spec line 2420)
- `travel_in_day ↔ set_day` — date rollover travelIn → setDay
- `set_day ↔ show_day_n` — date rollover setDay → showDays[0]
- `show_day_n ↔ travel_out_day` — date rollover last show day → travelOut
- `travel_out_day ↔ post_show` — date rollover travelOut → travelOut+1

(Same-day `show_day_n → show_day_n+1` is a self-transition handled
inside the `show_day_n` payload — `n` increments, kind stays — and is
NOT a kind-pair entry in the matrix.)

### Rule 5 — non-adjacent time-driven (10 pairs, `unreachable`)

The 60-second clock tick advances state one day at a time; sync skips
route through `unknown`. Direct kind-to-kind jumps that would skip
intermediates cannot occur naturally:

`pre_travel ↔ {set_day, show_day_n, travel_out_day, post_show}` (4)
`travel_in_day ↔ {show_day_n, travel_out_day, post_show}` (3)
`set_day ↔ {travel_out_day, post_show}` (2)
`show_day_n ↔ post_show` (1)

(`post_show ↔ pre_travel` is a special case of this rule: show wraps
then "starts over" implies a fresh `show.id`, never the same row.)

### Rule 1 — `unknown` ↔ time-driven / viewer-aware (10 pairs, `morph-to-last-good`)

Sync error mid-show collapses to `unknown`; spec line 2424. Recovery
unwinds the stale tint without crossfading body content.

### Rule 2 — `dateless` ↔ time-driven / viewer-aware (10 pairs, `morph-to-last-good`)

`dateless` is the more degenerate fallback than `unknown`; same
stale-tint treatment.

### Rule 3 — `unknown ↔ dateless` (1 pair, `crossfade-body`)

Both are date-data fallbacks. Recovery moves `dateless → unknown →
time-driven`; this single hop is recovery, not stale-on-stale.

### Rule 6 — viewer-aware ↔ time-driven (24 pairs)

`viewer_off_day` ↔ each of 6 time-driven (6 plausible, all `crossfade-body`).
`viewer_off_day_pre` ↔ each of 6 time-driven (3 plausible `crossfade-body`,
3 `unreachable` because viewer_off_day_pre requires today < travelIn
and the partner requires today ≥ travelIn with intermediates skipped).
`viewer_unconfirmed` ↔ each of 6 time-driven (6 plausible `crossfade-body`
per spec line 2425).
`viewer_after_last_day` ↔ each of 6 time-driven (6 plausible `crossfade-body`
via Doug data edits OR date rollover).

### Rule 7 — viewer-aware ↔ viewer-aware (6 pairs)

5 plausible `crossfade-body`; 1 `unreachable`:
`viewer_off_day_pre ↔ viewer_after_last_day` is a calendrical paradox
(viewer's last day BEFORE viewer's first day) — sorted explicit days
cannot satisfy both gates simultaneously.

---

## Tally

- `crossfade-body`: **32**
  - Rule 4 (adjacent time-driven): 5
  - Rule 3 (unknown ↔ dateless): 1
  - Rule 6 (viewer-aware ↔ time-driven, plausible): 21
  - Rule 7 (viewer-aware ↔ viewer-aware, plausible): 5
- `morph-to-last-good`: **20**
  - Rule 1 (unknown ↔ {time-driven, viewer-aware}): 10
  - Rule 2 (dateless ↔ {time-driven, viewer-aware}): 10
- `unreachable`: **14**
  - Rule 5 (non-adjacent time-driven): 10
  - Rule 6 (viewer_off_day_pre ↔ {show_day_n, travel_out_day, post_show}): 3
  - Rule 7 (viewer_off_day_pre ↔ viewer_after_last_day): 1
- `instant`: **0** (treatment retained in the type for future extensions)

**Total: 66.**

---

## Compound transitions (plan Step 3 — 6 cases)

Documented as `test.fixme` scaffolds in
`tests/e2e/right-now-transitions.spec.ts`. Each is named to the
plan's enumeration:

1. `Any → unknown` mid-`pre_travel → travel_in_day` crossfade.
2. `viewer_off_day → show_day_n` mid-`show_day_n → show_day_n+1` race.
3. `viewer_unconfirmed → viewer_off_day` mid-`pre_travel → travel_in_day`.
4. `Any → unknown` then `unknown → recovered` while role demotion pending (Task 4.13 cross-test).
5. Date prop + `viewer.date_restriction` + `role_flags` change in same render cycle.
6. Sync field-level pulse during state-level crossfade — verify no conflict.

The audit tests' bodies are deferred to Batch 2 (after `framer-motion`
lands). Batch 1's deliverable is the matrix + the contract-pinning
vitest suite + the scaffolded e2e file.
