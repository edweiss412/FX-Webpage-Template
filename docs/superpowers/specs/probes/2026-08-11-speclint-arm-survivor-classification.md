# Prose-count arms — survivor classification (AC-3)

**Measured:** 2026-08-11 on `feat/speclint-prose-count-parity`, over the SHIPPED recognizers'
own populations, and re-derived at merge time. Source record:
`2026-08-11-speclint-corpus-scan.survivors.txt` (1082 of 1083 corpus documents; one tracked
symlink the CLI refuses by design, named there).

**What this record is for, and what it is NOT.** Per spec §3.2/§3.3 ship posture and AC-3,
this classification informs **severity copy and documented limits ONLY**. The contract's
gates are FROZEN at ship time. Nothing below retunes an accept-set, and no finding here is
a reason to reopen one — a later arc that wants to move a gate brings its own evidence and
its own spec.

**Every citation below has been checked against the committed record.** Each cited
`file:line` was grepped out of `…-corpus-scan.survivors.txt` and its claim/count pair
compared to the prose here; the sweep found exactly one mismatch, corrected in M-b1 and
promoted to M-b6. Doing that sweep is the point — a classification record that
misdescribes its own measurements is worse than no record.

**Method, stated so the sample is not mistaken for a census.** Every row in both
populations is classified MECHANICALLY, by the structural signature the record already
carries (claim value, counted value, their delta, and the quantity lists). Within each
stratum a subset was HAND-READ against the source document to name the mechanism:
**18 of 177** shape-(b) rows and **8 of 84** shape-(c) rows. The per-stratum mechanisms
below are therefore named from hand-reading and counted mechanically; they are not a
per-row verdict on all 261. No row is dropped or summarised away.

---

## Shape (b) — `SIBLING_LIST_CARDINALITY`, 177 advisories

Distribution over `delta = counted - claimed`. Every row falls in exactly one bucket and
the buckets sum to 177.

| delta | rows | delta | rows |
| --- | --- | --- | --- |
| +12 | 1 | -1 | 14 |
| +7 | 1 | -2 | 12 |
| +6 | 1 | -3 | 10 |
| +5 | 3 | -4 | 5 |
| +4 | 7 | -5 | 6 |
| +3 | 8 | -6 | 4 |
| +2 | 21 | -7 | 5 |
| +1 | 66 | -8 | 1 |
| | | -9 | 2 |
| | | -10 | 1 |
| | | -13 | 4 |
| | | -14 | 1 |
| | | -17 | 1 |
| | | -23 | 1 |
| | | -29 | 1 |
| | | -36 | 1 |

108 rows where the list is LONGER than the claim, 69 where it is shorter. By document
class: 88 specs, 82 plans, 3 `BACKLOG.md`, 2 handoffs, 2 review-round filings — i.e. the
arm fires where this repo's counted prose lives, not in one hot file.

### The mechanisms, named

**M-b1 — the claim is not an enumeration header for the adjacent list (the dominant
class).** The number counts one thing and the list enumerates another, at a different
grain. Hand-read instances:

- `docs/superpowers/handoffs/2026-07-03-nullcode-batch2-handoff.md:14` — "**Scope:** 10
  sites across **3 `app/` non-api files**:" over a 3-item list, reported as
  `claim of 10 sites over an adjacent list of 3 items`. The list enumerates the FILES,
  and the claim the arm reads is the SITES — a different noun at a different grain. See
  M-b6 for why the `3` is not the cardinality the arm picks up.

  (Corrected after whole-diff review R3: an earlier draft of this bullet said the arm
  reads `3 files`. It does not, and the committed record says so — the mechanism is
  M-b6, not a noun the arm resolved.)
- `BACKLOG.md:916` — "Six rounds of work, preserved:" over 8 design bullets. The bullets
  are the design, not the rounds.
- `docs/superpowers/plans/observability/2026-07-05-.../00-overview.md:17` — "remove 6
  grandfather rows + flip pin" over 4 task steps. The 6 rows live in a source file.
- `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M11.5-crew-auth-pivot.md:439`
  — "recorded across 45 spec rounds + 36 plan rounds:" over 7 surface bullets.

**M-b2 — an ordinal or label number read as a cardinality.** `Phase 4 UI tests`,
`Task 2 tests`, `Step 5 ... tests` all present as "<digit> <plural noun>" and clear every
gate, because the lexical guards reject decimal tails, section refs and milestone ids but
NOT an ordinal followed by a plural. Hand-read:
`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M9.5-plan.md:3132`
("4. **Anti-tautology rule** (Phase 4 UI tests):"). This is the largest single mechanical
FP class after M-b1 and the clearest candidate for a later arc.

**M-b3 — grain mismatch inside one bullet.** One bullet covers two of the claimed units,
so a truthful claim reads as off-by-one. Hand-read:
`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md:486` — "Four review
rounds converged the dead-href class:" over 3 bullets, one of which is "R12/R13". The
prose is correct; the counter cannot see that.

**M-b4 — the counted list is not the whole enumeration.** The claim's list continues past
something the sibling counter stops at, or is nested one level deeper than the level the
counter locked onto. Hand-read:
`docs/superpowers/plans/2026-07-19-crew-row-controls/plan.md:897`.

The population moved 179 -> 174 here, and only here, when whole-diff review R20's class
sweep repaired the counter's list-extent reading (CommonMark thematic breaks, marker-type
changes, lazy continuations, empty markers). Five M-b4 rows left the population because the
counter now REFUSES a list whose extent it cannot decide, and one changed its count. The
second hand-read instance this bullet used to cite,
`docs/superpowers/plans/2026-07-20-warning-surface-trim/plan.md:168` ("Five states, six
fixtures:"), is one of the five: it stopped at a lazy continuation and reported four items.
No row entered the population, and every other mechanism's rows are untouched. Merging `main`
before the PR then brought 30 more corpus documents, which added three shape-(b) rows and
carried the population to 177; the buckets and class counts above are re-derived from the
survivors file as committed.

**M-b6 — markup interrupts noun extraction, moving which cardinality is "last".** A
cardinality is only recognized when a WORD follows it, so inline code or emphasis right
after a number takes that number out of the running entirely — and the arm then reads a
DIFFERENT number on the line as the claim. Hand-read:
`docs/superpowers/handoffs/2026-07-03-nullcode-batch2-handoff.md:14`, where the `3` in
"**3 `app/` non-api files**" is followed by a backtick rather than a word, so the
recognized claim is the line's earlier `10 sites`. Surfaced by whole-diff review R3
against an earlier draft of this record; it is a mechanism in its own right, not a
sub-case of M-b1, because it changes WHICH cardinality is compared rather than what the
list enumerates.

**DOCUMENTED LIMIT (b-L3).** A number followed immediately by markup is invisible to the
arm, so on a line carrying several cardinalities the one it reports may not be the one a
reader would call the claim.

**M-b5 — a counted value of 0 (18 rows).** The claim sits directly above a CHECKLIST list
(`- [ ] …`, `1. **Task …`), so the stop-at-break counter halts at the first item and
reports `an adjacent list of 0 items`. All 18 are structural false positives by
construction — the claim was never about task scaffolding. Hand-read 3 of 18, all three
that shape:
`.../handoffs/M12.1-pg-cron-pivot.md:152`, `.../handoffs/M8-bug-report.md:170`,
`docs/superpowers/plans/admin/2026-08-03-undo-success-announcement.md:150`.

**DOCUMENTED LIMIT (b-L1).** A counted value of 0 is the counter refusing to count task
scaffolding, NOT an empty list, and the message says "list of 0 items" either way. Reading
it as an empty list is the wrong inference. The frozen contract keeps it (the calibrated
ladder's final counter is stop-at-break and its flag condition is plain inequality), so it
is recorded rather than repaired.

**DOCUMENTED LIMIT (b-L2).** An ordinal followed by a plural noun (`Phase 4 UI tests`) is
indistinguishable from a cardinality under the shipped gates (M-b2).

### Genuine drift: one hand-verified instance, and it is worth the arm

`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md:122` — "**FULL-MIGRATE to
jsdom + RTL** (10 suites — …)" over a 12-bullet list. Counting distinct suite FILES in that
list gives SEVEN (`right-now`, `right-now-transitions`, `theme-toggle`,
`status-financials`, `crew-page`, `schedule-tile`, `notes-tile`); counting bullets gives
twelve. The claim of 10 matches neither, so it is stale on any reading — a real numeric
defect, surfaced mechanically. The same entry carries a second-order instance four lines
below (`~34h` in the claim, `~36h` in the "Why deferred" paragraph), which is the drift
shape the RULE half of the originating filing exists for.

`BACKLOG.md:1086` — "verified across the 7 real sheets" over an 11-item list — is **NOT**
drift. The list enumerates candidate FIELDS, not sheets, so it is M-b1. The spec's §3.2
named this row as a genuine-drift CANDIDATE at draft time; running the shipped recognizer
and reading the source resolves that candidate as a false positive. Recorded here because
layer 3 is the arc's own record and a candidate that does not survive measurement should
not keep circulating as an example.

**So: 1 of the 18 hand-read shape-(b) rows is genuine drift.** That ratio is NOT the
population's FP rate and no such rate is claimed here — the hand-read set was chosen to
cover every delta stratum, which deliberately over-samples the large deltas where M-b1
lives. What the record does establish is that both genuine drift and every mechanism
M-b1..M-b5 are present in the same 177, which is exactly why the arm stays ADVISORY.

**Severity copy: unchanged.** Advisory, one line, both quantities in the message. Nothing
in the above argues for promotion, and the two documented limits argue against it.

---

## Shape (c) — `TEMPLATE_QUANTITY_DRIFT`, 84 advisories

50 in plans, 33 in specs, 1 in `BACKLOG.md`. (The population was 85 until whole-diff review
R7 excluded comma-joined digit runs from all three arms: one row compared the citation list
`recoveryResolution.ts:4,58` against `:4-8, 58-62`, and `4,58` is no longer a readable
quantity. The row is dropped from this record with the count, not re-classified.) Three documents contribute clusters
(15 / 14 / 10 pairs) — expected, and the direct consequence of the ratified ALL-PAIRS
pairing: a family of N near-identical lines contributes N*(N-1)/2 rows, where the
instrument's greedy anchor would have reported one group. That is the divergence spec §3
ratified, visible in the numbers.

### The mechanisms, named

**M-c1 — token-blind digit extraction (the dominant class).** Quantity extraction is
`\d+` over the whole trimmed line, so digits inside IDENTIFIERS and LABELS become
quantities: `e2e` yields `2`, `invariant-8` yields `8`, HTTP codes yield `501/404/400/500`,
milestone ids yield `M6` → `6`, `Task 2` yields `2`. Hand-read instances:

- `docs/superpowers/plans/2026-07-19-crew-row-controls/plan.md:44` vs `:1619` —
  `[2]` vs `[2, 2, 2]`. Every one of those digits is the `2` in `tests/e2e/…`; the second
  line simply names three e2e specs. No quantity drifted.
- `BACKLOG.md:159` vs `:175` — `[8]` vs `[8, 11]`, where the `8` is `invariant-8` in both
  status lines.
- `.../handoffs/M6-drive-sync.md:455` vs `:529` — `[501, 404, 400, 500, 409]` vs
  `[404, 400, 500, 409]`: two response-code inventories, one carrying an extra code. This
  is a real content difference and arguably useful, but it is not a quantity.

**M-c2 — deliberately parameterized near-duplicates.** Two lines are near-identical
BECAUSE they are the same template instantiated for different subjects, and the differing
digit is the subject id. Hand-read:
`docs/superpowers/plans/2026-07-22-monitoring-badge-expand.md:306` vs `:316` —
`[4, 2, 4, 2]` vs `[4, 1, 4, 1]`: "Step 4: Green — covered by Task 2 Step 4" against the
same sentence for Task 1. Both are correct; the arm cannot tell a subject id from a count.

**M-c3 — quantity LISTS of different length.** Where one line carries more digit runs than
the other, the join-comparison differs even when every shared quantity agrees
(`[2]` vs `[2, 2, 2]`). This is the comparison the contract specifies (digit-list
inequality, not per-slot comparison), and it is the mechanical reason M-c1 and M-c2 surface
as often as they do.

**DOCUMENTED LIMIT (c-L1).** Shape (c)'s quantities are digit RUNS, not semantic
quantities: an identifier, an HTTP status, a task ordinal and a count are all the same
thing to it. This is the instrument's own extraction, adopted as contract, and it is the
single largest driver of shape (c)'s advisory volume.

**DOCUMENTED LIMIT (c-L2).** A near-identical-line family of size N reports N*(N-1)/2
advisories rather than one. A reader triaging a cluster is triaging one family, not N*(N-1)/2
independent findings.

**No hand-read shape-(c) row is genuine quantity drift.** Both rows that looked like it
resolve to M-c1 once the source is read:

- `.../handoffs/M6-drive-sync.md:1096` vs `:1111` (`[3, 6, 8]` vs `[3, 6, 9]`) is a pair of
  review-round records whose only differing digit is the ROUND number inside a filename
  (`m6-r8-verdict.json` vs `m6-r9-verdict.json`). Neither line is ISO-dated, so exclusion
  (iii) does not reach it — this is precisely the residual spec §1.1 predicted and accepted
  ("an UNDATED historical line can still draw an advisory — one glance, documented limit").
- `.../11-cross-cutting.md:2005` vs `:2020` (`[6, 8, 6, 8]` vs `[6, 8]`) differs only
  because one line spells `section-6-8` AND `§6.8` while the other spells it once.

**8 of 84 hand-read; 0 genuine drift among them, and the record says so rather than
inventing a win.** Shape (c)'s ratified population is the one the committed record shows it
CAN serve, and on this corpus snapshot that population is dominated by c-L1. That is a
measurement, not a verdict on the shape: the arm is advisory, its cost is a glance, and a
later arc holding evidence for a semantic-quantity extractor has a documented starting
point here.

**The wedge-remeasure anchor does NOT appear in this population**, as spec §3.3 states —
that instance is the mechanical arm's documented limit and stays covered by the rule half
of the originating filing. `tests/specLint/numerics.test.ts` pins it as an explicit
NO-FLAG fixture so the three refuted designs are not re-proposed.

**Severity copy: unchanged.** Advisory, with both quantity lists and the similarity in the
detail line, so c-L1 and c-L2 are dismissible at a glance.

---

## Reconciliation

| population | emitted by the scan | classified here |
| --- | --- | --- |
| `SCRIPT_CONSTANT_PARITY` | 0 | 0 |
| `SIBLING_LIST_CARDINALITY` | 177 | 177 |
| `TEMPLATE_QUANTITY_DRIFT` | 84 | 84 |
| total | 261 | 261 |

Emitted equals classified in every row of that table, diffed mechanically from the record
rather than asserted. Shape (a)'s zero is the expected result and not a dud: both live
qualifying occurrences agree with `EXPECTED_SITE_TOTAL = 37`, and the arm is the tripwire
that notices when they stop agreeing.
