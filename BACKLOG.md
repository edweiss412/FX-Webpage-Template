# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-09-01 — `fix/confirm-focus-restore` (PR #963) graduated `BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS`. The row's own first scheduled step is why the shipped scope is smaller than the filing: extending the probe to the derived sites REFUTED archive, which already restores focus, so the reachable class was three rather than four. Revoke needed a different mechanism from the other two — its success path replaces the row's subtree through RSC revalidation, leaving nothing to restore focus to — and took the container-level heading restore ShareHub §2.3 had already ratified for archive. Measured in a real browser, because jsdom cannot observe a server-driven subtree replacement at all.

---

## BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT — promote the visual gate into branch protection's required set after soak

**Status:** OPEN · **Severity:** low · **Class:** CI wiring · **Filed:** 2026-07-27 (reconciliation — the one live follow-up carried out of `BL-HEADER-PROBE-RESIDUAL-VACUITY` when it graduated to `BACKLOG-archive.md`) · **Effort:** XS

`section-header-visual` (`.github/workflows/section-header-visual.yml`) runs as an unfiltered PR gate, but it is NOT in branch protection's required-context set, so a red run is a visible failing check that does not block merge at the GitHub layer. Deliberate at ship time: the spec ratifies promotion as a follow-up after observed-green runs, not part of that branch (`docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md` §1.1). Same class as the required-set note in `BL-E2E-LIFECYCLE-SPECS-CI-DARK`: an owner GitHub-settings action, not repo code — the live required set held twelve contexts when last measured (2026-07-26). **Trigger:** observed-green soak of `section-header-visual` on merged PRs, then the owner adds the context.

## Descoped from the CI-dark coverage cluster (2026-07-26) — read before re-attempting any of these

Four items landed here when the cluster descoped them — **designed, built, and measured**, then
descoped after four cross-model review rounds (37 accepted findings, none disputed) on branch
`feat/ci-dark-coverage`. The owner chose to ship the provably-sound subset rather than keep
iterating. One of the four, `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC`, shipped 2026-07-27 on
`feat/ci-dark-descoped-guards` (with the separately-filed ceiling item
`BL-CI-ENV-DEPENDENT-CONFIG-NARROWING`) and graduated to
[BACKLOG-archive.md](./BACKLOG-archive.md), followed by `BL-CI-VITEST-EXCLUSION-COVERAGE` on `feat/ci-dark-vitest-exclusion` (2026-07-31, PR-B: the runner-as-oracle registry) and `BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION` on `test/pg-cron-mechanism-sabotage-probe` (2026-08-01, mechanism-sabotage probes); the one below remains open.

**Do not re-derive this analysis.** Each entry records what was tried and the measurement that
killed it. The reason each is open is that the obvious approach was implemented and shown not to
work, not that nobody thought about it. Full write-up with metafile traces and per-entry bundle
sizes: `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §10.

screen-disposition 2026-08-04: BOTH PRECONDITIONS VERIFIED, mutation BLOCKED on tooling permission.
Stays open, and the only work left is one command.

**Soak — green.** `gh run list --workflow section-header-visual.yml`, 60 runs since 2026-07-27:
57 success, 3 cancelled, **zero failures**. The §4.5 item 3 gate condition ("green → add the
context") is met.

**Second precondition, checked because the soak cannot show it.** A required context that never
REPORTS blocks every PR forever, so a path-filtered workflow must never be made required.
`section-header-visual.yml` is deliberately UNFILTERED on `pull_request` (its own header explains
why: path filters would make it invisible to the coverage scanner). It runs on every PR, so
requiring it cannot hang one.

**Blocked:** the `gh api -X POST .../required_status_checks/contexts` mutation was denied by this
session's tooling permission classifier — an environment limit, not a repo or GitHub one. Current
required set is 12 contexts; this adds the 13th. The exact command, unchanged from §4.5 item 3:

```
gh api -X POST repos/edweiss412/FX-Webpage-Template/branches/main/protection/required_status_checks/contexts \
  -f "contexts[]=section-header-visual"
```

Run it, confirm with `gh api repos/edweiss412/FX-Webpage-Template/branches/main/protection/required_status_checks --jq '.contexts'`,
then archive this entry. Nothing else is owed.

---

### BL-AGENDA-PROSE-SECOND-DAY — a day label can name a second day in free prose

**Status:** OPEN — known limit, accepted in PR #610 review R6 · **Severity:** low · **Class:** FEATURE REACH · **Effort:** S

`isAmbiguousLabel` (`lib/crew/agendaViewerDays.ts`) fires on SPECIFIC day-shaped signals — a second
date, a second weekday, a `Day N` count, a plural span, a spoken ordinal — judged by both count and
position. It does not require the rest of the label to be recognised, so free prose passes. Verified
still true at PR #610 close-out, after the rule was rewritten three times:

    "Tuesday, May 5, 2026 and the following day"   folds as a plain May 5 row
    "Tuesday, May 5, 2026 plus the next day"       folds
    "Tuesday, May 5, 2026 (two-day block)"         folds

A viewer assigned May 6 loses that row if a separate May 6 row exists.

**Why not closed.** A true whitelist — accepting only a remainder the code can parse — would reject
every heading carrying a venue, track, or session name, which is most real headings. Review R6
measured the over-fire side of that trade directly: month PREFIXES matched Marriott, Marketing,
Junior, Novel, Decision, Augusta and Octagon, which would have disabled folding for whole
extractions. The rule is deliberately positioned as the strictest thing that does not break ordinary
labels.

**Closed already, mechanically** — eleven distinct forms across rounds R2-R10, listed so nobody
re-reports one as new: a second full date; a second weekday name; an ordinal ("the 6th"); a
month-day without a year ("/ May 6"); the same month-day in two years, in ANY pairing of shapes;
slash, ISO and day-first dates; two ordinal-position phrases ("Day 1 / Day 2"); a plural day span
("Days 1-2"); the `Sat` abbreviation; and every one of those in LEADING position as well as
trailing. What remains is prose that names a day without any of those tokens.

**Fix (when prioritized):** only worth it if real corpus labels ever carry this prose. Check the
6-PDF corpus first; today every label there is a clean single date.

### BL-AGENDA-POSITIONAL-DAYSET-FALLBACK — the day-set matcher has no positional fallback

**Status:** OPEN — deliberate omission, ratified in-spec · **Severity:** low · **Class:** FEATURE COMPLETENESS · **Effort:** S

`lib/crew/agendaViewerDays.ts` fails open when labels do not parse, rather than mirroring
`agendaSessionsForToday`'s four-condition positional fallback. Deliberate: the trigger (`!someDateParsed`)
does not occur in the 6-PDF corpus, and folding on positional index means folding in the state of least
knowledge. Full reasoning ratified at
`docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` §3 under "RATIFIED AMENDMENT".

**Revisit if** the corpus gains documents with purely positional day labels ("Day 1" / "Day 2") AND a
viewer reports seeing the whole show expanded when they expected their day marked.

### BL-HEALTH-RESOLVE-DB-LOCKDOWN — DB-enforce developer-only health-alert resolution

**Status:** OPEN — ACCEPTED RISK, deliberately not scheduled (re-affirmed 2026-07-24) · **Severity:** low · **Class:** SECURITY / DEFENSE-IN-DEPTH · **Effort:** L

**Re-verified 2026-07-24:** the grant is still live — `supabase/migrations/20260501002000_rls_policies.sql:147` reads `grant select, insert, update, delete on table public.admin_alerts to anon, authenticated;`. The acceptance below is unchanged, and this item was explicitly reviewed and left open during the 2026-07-24 residual sweep rather than overlooked. Do not re-raise it as a finding on an unrelated diff; it closes only as part of `BL-ADMIN-POSTGREST-DML-LOCKDOWN`.

alert-audience-split (spec §6.7) makes health-alert resolution developer-gated at every PRODUCT surface (the dev-gated `resolveHealthAlertFormAction` plus HEALTH_CODES rejects on the three legacy user-facing resolve surfaces: `resolveAdminAlertFormAction`, `app/api/admin/admin-alerts/[id]/resolve`, `app/api/admin/show/[slug]/alerts/[id]/resolve`). This is app-surface defense-in-depth + UI coherence, NOT a DB-enforced trust boundary: `admin_alerts` still GRANTs UPDATE to `authenticated` and its RLS policy allows any `public.is_admin()` caller to update rows (`supabase/migrations/20260501002000_rls_policies.sql`), so a non-developer admin could in principle `PATCH admin_alerts.resolved_at` directly through PostgREST, bypassing the app layer. We ACCEPT this (Doug is the trusted business owner, not an adversary; role filtering is UX not security). **Fix (when prioritized):** revoke direct `admin_alerts` UPDATE from `authenticated`/`anon` and route ALL resolution — doug alerts included — through `SECURITY DEFINER` RPCs with an `is_developer()` check for health codes. Materially larger, whole-resolve-path change; deferred as a cross-reference of the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` admin_alerts-class DML lockdown item.

### BL-PARSER-FIELD-PROVENANCE-MODEL — per-field provenance/confidence for the P0-2 zero-signal residuals

**Status:** OPEN · **Severity:** medium · **Class:** PARSER ROBUSTNESS / DATA PROVENANCE · **Effort:** L · **Filed:** 2026-08-06 (L-wave, spec §2.1.5)

The 2026-07-07 e2e real-world-variation preparedness audit names a per-field provenance/confidence model as the structural fix for its P0-2 class (confident wrong values rendering as authoritative). It is listed as **§7 item 5, "Medium (structural, from prior audit, still the right long-term move)"** and carried in the §11 shipped-status table as item 4: _"Provenance model (§7 item 5 remainder) — the long-term move for the P0-2 zero-signal residuals; 9+ territory. — ⏳ still the open long-term move."_ This row is that remainder, filed honestly rather than left as a dangling audit reference.

**What already SHIPPED, so this entry is not re-litigated as unstarted.** The audit's §10.5 P0-2 row records the class as **BOUNDED, not closed**, by three layers that all landed: detection (`CREW_COLUMN_POSITIONAL_FALLBACK` #361, then ambiguity-warnings-v1 **#367** — four judgment-call warn codes with `blockRef.field` anchors and the wizard third state), monitoring (#366/#370), and a three-legged single-source correction layer (fix-in-sheet + Re-sync, use-raw reversal #388/#393/#394, role-token mapping #396). The `fast-check` property-fuzz layer (**#379**) is the other half-step toward provenance. The audit's own words: the structural fix is _"partway there."_

**The residual this entry actually covers — the audit's named zero-signal cases, the ones where NO warning fires by construction:**

- a **mis-read date that stays MDY-monotone**, because the DMY heuristic only trips on a strict sequence violation (`lib/parser/blocks/dates.ts:513-534`);
- a **wrong-but-`explicit` `date_restriction`** — the value is well-formed and marked explicit, so nothing downstream doubts it;
- **mis-splits that evade the heuristics** entirely.

Each is a value the system is confident about and wrong about, with no signal prompting Doug to look. That is precisely the gap detection cannot close by adding more warn codes: these parses emit none **by definition**.

**Why L.** A provenance model means every field carries where it came from and how confidently — a schema change, a parser-wide threading of provenance through every block reader, and a UI contract for surfacing confidence without drowning the operator in caveats. The audit sizes it "9+ territory". **It is explicitly NOT implemented by the L-wave** (spec §4 limit 5); this row exists so the remainder is schedulable rather than living only inside an audit document.

**Promotion prerequisite:** its own design session. The first question that session must settle is whether provenance is stored (a schema-carried per-field record) or derived (recomputed at read time from the parse), because that choice determines whether re-sync must preserve it — and the use-raw overlay (#388) is the worked precedent for a decision layer that survives a full-replace re-sync.

**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §7 item 5, §10.5 (P0-2 row), §11 item 4.

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** OPEN at residual scope (partial closure 2026-07-27, `fix/export-blank-row-segmentation` — spec `docs/superpowers/specs/2026-07-27-export-blank-row-segmentation.md`) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS · **Effort:** L
**l-wave-screen 2026-08-06:** PREREQ-trigger — the residuals have no corpus-clean discriminator (the generic orphan-block rule was probed and REFUTED at 30 false positives); the in-body promote trigger is a live mis-grouped show.
**Promotion prerequisite:** a live mis-grouped show — a spacer-row stray value or mid-section blank row mis-groups data with no operator signal (the in-body "Trigger to promote" line, hoisted to a recognized gate field 2026-08-07 so the ledger viewer classifies the row as gated (watch); the Status lead was reworded from "PARTIALLY CLOSED" in the same pass because the viewer's terminal-status matcher read it as archived).

**Partial closure (2026-07-27):** two of the three spec'd fix directions shipped. (b) **Header-aware segmentation** — `splitBlocks` now starts a new block at a mid-block row whose first non-blank cell is an uppercase known section header (`isMidBlockSectionStart`, `lib/parser/knownSections.ts`; `CLIENT` excluded on corpus evidence), closing the FUSE case structurally for uppercase-known headers with corpus-verified zero output drift (`tests/drive/round-trip-fixture.test.ts` byte-equality + archived-tab fingerprint golden). (c) **Crew-scoped orphan detection** — a new warn-severity `ORPHANED_CREW_ROWS` ParseWarning (operator card + crew-region deep link) fires when a table block's first row carries a crew-role cell (≥2 distinct Load In / Load Out / Strike / Set tokens on one line) with no section header — the SPLIT case for crew rosters, at 0 corpus false positives and 29/29 simulated-split recall (ratcheted by `tests/parser/orphanedCrewRowsCorpus.test.ts`). **The backlog entry's generic orphan-block rule ("no recognizable header adjacent to a recognized section") was probed and REFUTED: 30 false positives on the live corpus** (GEAR-tab gear lists under room headers, INFO free-text blocks, PULL SHEET title rows) — blocks starting with non-header rows are normal sheet layout. **Residuals (still open):** splits of non-crew sections (hotel/transport/details tails have no corpus-clean discriminator); fuses onto mixed-case or unknown headers; crew rows carrying fewer than two role tokens on one line of one cell (including role cells authored with literal pipes, which the parser's cell split decomposes); and the mutation harness cannot observe the exporter-level fuse fix (it mutates exported markdown, never the grid), so `blank-row:remove` ledger holes remain by construction.

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

---

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)

## Share hub follow-ups (2026-07-25, share-link-chrome-backlog)

## Merged from the plans backlog (2026-08-02)

`docs/superpowers/plans/BACKLOG.md` was a second, disjoint `BL-` registry: 53 entries under
this file's own id prefix, sharing exactly one id with it, cross-referenced from neither side.
Two registries under one namespace means a `BL-` citation has no single place to resolve, which is
what `tests/docs/_metaLedgerReferentialIntegrity.test.ts` now enforces against. The 41 open entries
follow verbatim; the 12 already-terminal ones went to BACKLOG-archive.md per the open-queue-only
rule above. Ids and bodies are unchanged — grep by id still works. Headings are normalized to `###`
so they nest here.

Promotion path these were filed under, retained: spec at `docs/superpowers/specs/<date>-<name>-design.md`,
plan tree at `docs/superpowers/plans/<date>-<name>/`, a milestone number, then list it in
`docs/superpowers/plans/README.md`. Promotion is gated like any milestone — brainstorming, spec
self-review, adversarial review, planning, adversarial review.

### BL-PICKER-LOCK-ICON-LUCIDIFY — replace U+1F512 emoji with lucide-react Lock in PickerInterstitial

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 1 — picker chain audit P2).

**Effort:** S

**Description:** `_PickerInterstitial.tsx:171` renders the claimed-row lock indicator as the U+1F512 emoji (🔒). The inline comment explicitly justifies the choice as a 16px glyph matching the type rhythm. Audit flagged cross-platform inconsistency: iOS Safari renders Apple Color Emoji, Android Chrome renders Noto, desktop varies. Crew on Android may see a heavier glyph than design intends.

**Why backlog, not deferred:** DESIGN.md §8 ratifies lucide-react for icons, so the structural answer is `<Lock size={16} aria-hidden="true" />` with `aria-label` migrating to the parent span. But the inline rationale is defensible — the lock is the only visual cue paired with the `data-claimed="true"` row treatment, not load-bearing. Picking this up requires a visual regression screenshot pass across iOS Safari + Android Chrome + desktop to confirm the lucide swap is an improvement, not a regression. Speculative until cross-platform screenshots ship.

**Promotion prerequisite:** EITHER (a) cross-platform visual regression suite lands and shows the emoji glyph as a real friction point, OR (b) M11 screenshots set is extended to include the picker page and a lucide swap is part of a broader claimed-row treatment iteration.

**Promotion mechanics:** Trivial swap once accepted: `<Lock size={16} aria-hidden="true" />` + thread the existing `aria-label="IDENTITY_DEACTIVATED_LOCK_HINT" lookup` to the parent `<span>`.

screen-disposition 2026-08-04: PREREQ-FENCED, stays open, NOT claimed by any branch of this arc. The fence is the entry's own, quoted: promotion requires "(a) cross-platform visual regression suite lands and shows the emoji glyph as a real friction point" — closing it now would violate the entry rather than honor it, and the suite does not exist. **Citation corrected in this pass:** the glyph is no longer at `_PickerInterstitial.tsx:171`; it moved to `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:134`, inside `<span data-testid="picker-row-lock" aria-hidden="true">` at `:130`, with the sr-only hint already a sibling at `:136` (fed `messageFor("IDENTITY_DEACTIVATED_LOCK_HINT")` from `_PickerInterstitial.tsx:212-215`). So the entry's proposed "thread the aria-label to the parent span" is already satisfied by a different mechanism; only the glyph swap remains, and it stays fenced.

---

### BL-IDENTITYCHIP-SUB390-COLLISION — IdentityChip + page title collision audit at 320px

**Filed:** 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 3 — post-pick header chrome critique P3).

**Effort:** S

**Description:** Header.tsx places the IdentityChip as the right-slot when present. The title column gets `min-w-0 flex-1`; the chip column gets `shrink-0 self-start`. At 320px viewport (sub-target), the title + chip could collide depending on title length + chip's name+role string length.

**Why backlog, not deferred:** 390px is the documented mobile primary target (PRODUCT.md "Indoor corporate event environments ... Devices are personal phones (Safari/Chrome, ~390px)"). 320px is out of spec. Crew on a 320px phone would see fold-down behavior or text truncation — annoying but not broken.

**Promotion prerequisite:** EITHER (a) Doug or a crew lead reports a 320px collision in the wild, OR (b) the project's mobile primary target widens to include sub-390px viewports.

**Promotion mechanics:** Likely solution is to allow the right slot to wrap below the title at narrow widths (`flex-col sm:flex-row` on the parent). Test pin via Playwright `setViewportSize({ width: 320 })` boundingbox assertion.

**Reachability:** INFERRED, NOT PROBED — the probe that settles it: Playwright `setViewportSize({ width: 320 })` against the post-pick crew header, asserting the bounding boxes of `components/layout/Header.tsx:68` (the `min-w-0 flex-1` title column) and `:118` (`data-testid="page-header-right-slot"`, `shrink-0 self-start`) do not overlap, using the longest name+role string the corpus actually contains. Run that BEFORE any layout change.

screen-disposition 2026-08-04: PREREQ-FENCED + ANNOTATED, stays open, NOT claimed. Two independent reasons to leave it: the entry's own words are hedged ("could collide depending on title length + chip's name+role string length", "320px is out of spec"), and its fence is external — "(b) the project's mobile primary target widens to include sub-390px viewports". The probe above is now the first scheduled step per the ledger filing bar, rather than the layout change.

---

### BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK — a leg with no displayable content beyond its date renders as an unlabeled raw line

**Status:** PARKED 2026-08-27, on a probed zero. Not withdrawn and not resolved: the defect is real and the raw branch is still reachable, but the row's own promotion prerequisite ran and found nothing to build for. The ruling is in "Why nothing was built" below, the measurement behind it is in the "Reachability" field, and the two conditions that reopen the row are in the "Re-file trigger" field. Read those three before scheduling this.
**Effort:** M

**Filed:** 2026-08-10, whole-diff review R2 F3 on `feat/crew-field-enrichment`, which refuted the claim that the unlabeled-leg render "no longer exists" while `BL-FLIGHT-LEG-ORIENTATION` was being archived. This row is that entry's successor: the archived one closed because the structured card became the DEFAULT render, and this one carries the residual it did not cover.

**Corrected diagnosis (review S5 R4, probed).** An earlier draft of this entry called these legs "unstructurable". That is wrong, and the distinction changes the repair direction: `parseFlightItinerary("3/22 Charter pending | 3/24 Return pending", 2026)` returns two segments with `structured: true` and both dates parsed (`2026-03-22`, `2026-03-24`). They take the raw branch because the segment carries no DISPLAYABLE content beyond the date — no flight number, route, times, or confirmation — so the structured renderer has nothing but a date to show and falls back to the operator's text. The parser is not failing; the card has nothing to lay out.

**Reachable live surface, with the branch already pinned by a test.** `components/crew/sections/TravelSection.tsx` renders structured fields only when a leg carries content beyond a bare date; otherwise it falls back to `seg.raw` under `data-testid="travel-flight-leg"`, deliberately, so an operator's text is never dropped. `tests/components/crew/sections/TravelSection.flight.test.tsx` pins that branch. An itinerary such as `3/22 Charter pending | 3/24 Return pending` produces TWO such legs, and a crew member then sees two unlabeled lines with no arrival/departure orientation — the shape the archived entry described, surviving in the narrow case.

**Why this is a different problem from the entry it succeeds.** That entry asked for labels once a structured source existed; the source exists and the labels ship. This one is about segments that ARE structured — `structured: true`, date parsed — but carry no other displayable field, so the structured card has only a date to lay out and hands them to the raw branch. Layout work on the card's populated fields therefore never reaches them: the gap is what to render when every field except the date is empty. The candidate direction is a RENDERER one — give the date-only segment a labeled treatment of its own — not parser widening, which an earlier draft of this row wrongly implied and which would find nothing to fix.

**Reachability:** PROBED 2026-08-27, 0 of 10 segments date-only. The corpus is 7 of the 8 sheets in the live `fxav-test-shows` folder; the eighth does not parse (`VERSION_AMBIGUOUS`) and is reported as unmeasured rather than counted as a zero. The validation deployment's `crew_members.flight_info` holds the same 5 itineraries, compared verbatim rather than by agreeing totals. Every segment on every real sheet carries a route and both times, so none reaches the raw branch. The classifier behind that zero is pinned rather than assumed: this entry's own `3/22 Charter pending | 3/24 Return pending` classifies date-only on both legs, and 5 of 6 hand-mutants of the renderer's predicate go red (the survivor is equivalent — `arrTime` is never set without `depTime`). Probe `scripts/probe-flight-date-only-legs.ts`, report `docs/superpowers/specs/crew/2026-08-27-flight-date-only-leg-probe.md`, suite `tests/scripts/probeFlightDateOnlyLegs.test.ts`.

**Re-file trigger:** the first date-only leg observed in a live sheet, or Doug adopting the pending-charter phrasing. Rerun the probe to settle it — it is one command and it prints the count.

**Why still open after PR #916, and what that PR did NOT cover.** #916 closes this row's PROMOTION PREREQUISITE and nothing else. It ships the probe, its committed output, the report, and the `**Reachability:**` field above; it ships no renderer change and no test of one. The residual is the entire defect as filed: a segment that parses with nothing displayable beyond its date still renders as an unlabeled raw line, and the labeled treatment this row asks for is not built. Read the row as unstarted work whose gating question is now answered, not as work that partly shipped.

**Why nothing was built:** the prerequisite returned zero, which is the answer that says do not build. A labeled treatment would be a renderer for a case the corpus does not contain; ruled RECORD AND PARK 2026-08-27. The entry keeps its place in the queue with the number attached, so the next reader inherits the measurement instead of re-deriving it.

**Why backlog, not now:** the fallback is truthful today — it shows exactly what the sheet says, and the date still drives sort and emphasis. Nothing is silently wrong; what is missing is orientation, in a case that turns out not to arise. **Promotion prerequisite (RUN 2026-08-27, returned zero):** a corpus probe over live `flight_info` values counting how often a segment parses but carries no displayable field beyond its date — see `**Reachability:**` above. Should it ever return non-zero, the direction is a renderer question, because the segments ARE structured: give the date-only segment a labeled treatment of its own, rather than the parser widening an earlier draft implied.

### BL-CREW-SHEET-TEMPLATE-V2 — Standardized downloadable show-spec template to capture redesign-required fields

**Effort:** L (scope floor — design-gated)
**l-wave-screen 2026-08-06:** PREREQ — scope floor — an owner product decision on whether a standardized template is adopted at all.

**Filed:** 2026-06-15, during the crew-show-page redesign audit (Claude Design handoff bundle `fxav-crew-pages`; design source at `/tmp/design_extract/...` ephemeral, intent recorded in milestone memory). Owner is considering a **downloadable, standardized sheet template** Doug (and future operators) would fill in, so the richer crew-page surfaces have a reliable source instead of depending on organic per-show sheet conventions.

**Context — why this exists:** The redesign assumes a data-rich show page (live run-of-show timeline, call/doors stat strip, full travel itinerary, structured venue/wifi). An audit of **all 7 distinct real sheets** in the `fxav-test-shows` Drive folder (FinTech CTO Summit, Consultants Roundtable, + the 5 other `II -` shows; the `VB##`/`DRILL` sheets are same-size test copies of Consultants Roundtable) showed the organic sheets **do not reliably carry** much of what the design wants. The chosen v1 reconciliation is **Blend**: build on reliably-present data, render honest empty states for the variable fields, drop the truly-absent mock stats. This BACKLOG entry captures the fields a v2 standardized template could promote from "absent / unreliable" to "reliably present," making the full-fidelity design viable.

**Scope — candidate fields for the v2 template (each tagged with its current source reality, verified across the 7 real sheets):**

- **Crew CALL TIME** (labeled) — GENUINELY ABSENT in every sheet today; only Load-in/Set times exist. A template field would make the design's "call" stat real instead of a Load-in remap.
- **DOORS time** (labeled) — GENUINELY ABSENT; only "Registration" prose appears. Template field needed for the doors stat.
- **Hotel room-type** — ABSENT everywhere.
- **Hotel check-in / check-out TIME-of-day** — ABSENT everywhere (only calendar DATES are ever present).
- **Reliably-FILLED AGENDA tab (run-of-show titles/rooms)** — **CORRECTION (2026-06-18, live gsheets-MCP verification):** the earlier "empty in all 7 sheets" claim was WRONG. The AGENDA run-of-show **IS filled in production** for locked shows (verified filled in East Coast + RIA; empty auto-time-skeleton in the not-yet-locked others). **The AGENDA-title PARSER is now SCHEDULED v1 work** — see the Phase-2 spec `specs/v1-pre-deployment-amendments/2026-06-17-crew-page-redesign-phase2-agenda.md` (banner-anchored `parseAgenda` + `shows_internal.run_of_show` + Schedule enrichment). What remains for the **v2 TEMPLATE** is only **standardizing the SOURCE** so the parser has less to fail-soft around: prompt Doug to fill the title cells consistently, a stable banner/column layout, and discrete cells — i.e. making a frequently-but-inconsistently-filled grid uniformly clean. The parser ships in Phase 2; the template just improves source reliability.
- **Per-crew FLIGHT details** (flight #, airport, arrive/depart time) — the AGENDA NAME/ARRIVAL/FLIGHT# columns are blank scaffolding; INFO-level flight data was filled in **exactly 1 of 7** sheets (East Coast SFO). `crew_members.flight_info` is already parsed (`lib/parser/types.ts:71`, `blocks/crew.ts:248`) but usually null and not projected to the crew page. A template field standardizes this.
- **Crew Wi-Fi SSID + password** — reliable in only 2 of 7 (others say "Wifi from Encore" / speed-note only). Already captured as raw free-text under `event_details.internet` (`lib/parser/blocks/event.ts:71`). A template field with discrete SSID/PW cells would make it structured + reliable.
- **Venue street address + loading dock** — present in the older INFO layout, **blank in the newer compact template**. Standardize so it's always filled.
- **Room-within-venue name** — lives in EVENT DETAILS / section headers, not a clean field.
- **Key contacts (client / venue / in-house AV) phone + email** — filled on the older template, blank on the newer compact one; the CONTACTS-tab NUMBER column is always empty. Standardize required contact fields.
- **Parking detail** — present in ~4 of 5; standardize.

**Why backlog, not deferred:** This is a likely-v2 product direction (a downloadable STANDARDIZED TEMPLATE), not committed v1 work. It requires (a) a template-design pass (what the downloadable sheet looks like, how Doug adopts it, migration from organic sheets), (b) a product decision about mandating a template vs tolerating organic sheets, and (c) parser changes to read any **genuinely-new** structured fields the template adds (labeled Call/Doors, hotel room-type/check-in-out time-of-day, discrete Wi-Fi SSID/PW, etc.). **NOTE:** the **AGENDA run-of-show parser is NOT part of this backlog** — it is scheduled v1 work (Phase-2 spec, see the corrected AGENDA bullet above); this entry covers only the TEMPLATE-standardization of the source + the fields that are genuinely absent today. The v1 Blend reconciliation ships without any of it; the design drops/empty-states the genuinely-unreliable fields and parses the AGENDA run-of-show where present. No spec/plan/milestone **for the template** (the AGENDA parser does have one — Phase 2).

**Promotion prerequisite:** EITHER (a) owner decides to formalize the downloadable template as a real v2 feature (template design + adoption plan), OR (b) the v1 redesign ships and operator feedback shows the empty-state surfaces (timeline, wifi, flights, contacts) are a real friction point worth closing at the source. Promotion starts with a brainstorming session on the template shape + the parser contract for any new structured tabs (the AGENDA run-of-show grid contract is already partially mapped in the redesign milestone's deep-read notes).

---

## BL-ROWACTIONS-SUBMENU-STALE-ON-ROW-MENU-REPLACE — the submenu is anchored inside the row menu, and does not follow when the row menu re-places

**Status:** PARKED 2026-08-28, on a probed zero. Not withdrawn, but REFUTED in the declared domain: the submenu already tracks its anchor with no repair. The measurement, the technique that corrects an earlier false positive, the traced mechanism and the two re-file conditions are in "Probe result" below; read that before scheduling this. · **Filed:** 2026-08-27 (`perf/anchoredportal-measure-convergence`, blast-radius pass) · **Facing:** product · **Severity:** LOW-MEDIUM (a visibly mis-anchored submenu on the shipped admin dashboard; narrow trigger, correct output everywhere else) · **Class:** cross-instance placement subscription · **Effort:** M · **Class-sweep exception:** (c) — the repair is a redesign of the placement subscription model across two `AnchoredPortal` instances, which is the SAME scope already fenced when `MutationObserver` was declined for that arc (`docs/superpowers/specs/admin/2026-08-27-anchoredportal-measure-convergence.md` §2.4), not a fresh or unexplained deferral. · **Reachability:** PROBED 2026-08-28, ZERO in the declared domain — see "Probe result".

`components/admin/ShowRowActions.tsx` renders two `AnchoredPortal` instances: the
row menu (`components/admin/ShowRowActions.tsx:661`) and the preview submenu
(`components/admin/ShowRowActions.tsx:961`). The submenu's anchor is
`previewItemRef`, a button that lives INSIDE the row menu's portal panel. So the
submenu is a portal whose anchor sits inside another portal.

When the row menu re-places, its panel moves and the submenu's anchor moves with
it, without changing size. The row menu's `applied` placement is state internal
to its own `AnchoredPortal` instance, so React re-renders that instance and its
children — `ShowRowActions` does not re-render, so the SUBMENU's instance does
not re-render either, and its ungated every-commit effect
(`components/admin/AnchoredPortal.tsx:261`, the ungated every-commit effect) never runs. The submenu's own
`ResizeObserver` watches its anchor and its panel for SIZE, and the anchor only
moved. Nothing re-places it.

**Most triggers are already covered, which is what makes this narrow rather than
broad.** A window resize and an ancestor scroll both reach the gated effect's own
listeners on BOTH instances (`components/admin/AnchoredPortal.tsx:222-223`), so
each re-places independently. The uncovered trigger is specifically the row menu
panel's own `ResizeObserver` firing on a content-size change — a busy state, an
error region appearing — which re-places the row menu alone.

**Reachability is INFERRED from React's re-render scope, not observed.** The
first scheduled step is therefore the probe, not the repair: open the submenu,
force a row-menu content-size change while it is open, and compare the submenu's
applied placement against its anchor's live rect. `tests/e2e/rowactions-geometry.spec.ts`
already drives both surfaces and is the natural home for it.

### Probe result 2026-08-28 — refuted, and the first probe was measuring the wrong thing

**The defect does not reproduce.** The submenu ends correctly attached to its anchor after the row menu re-places, with no code change. Branch `fix/rowactions-submenu-stale`, reduced to this entry once the repair proved unnecessary.

**An earlier run of this probe reported the defect confirmed, and that report was wrong.** It measured the top edge of the MENU element and found the anchor moving -77.5px while the menu moved 0px. Both numbers were real; the inference was not. The submenu panel is clamped against the viewport ceiling and height-capped — 586px of natural height in a 720px viewport, so it opens `side="top"` pinned 8px from the top with a `maxHeight` — and its top PHYSICALLY CANNOT MOVE. What tracks the anchor is the panel's height, and so its facing edge. A top that does not move is correct behaviour for a clamped panel, and it was read as a bug.

The locator was the second half of the error: `[data-testid^="row-action-preview-"]` also prefix-matches the portal, the menu, every crew row and the empty hint, so `.first()` resolving to the button was DOM-order luck rather than a selection.

**Corrected technique, for whoever runs this next.** Measure the PLACED PANEL (`row-action-preview-portal-<slug>`), never the menu inside it, whose natural height overflows the panel's cap and reports an edge the user never sees. Use exact testids, not prefixes. Assert the invariant the placement core actually maintains: the distance from the panel's facing edge to its anchor, which is `GAP` (`lib/popover/position.ts:16`). Measured that way the gap is **6px before and 6px after**, and 6 is exactly `GAP`.

**Mechanism, traced rather than inferred.** Instrumenting the submenu's `ResizeObserver` callback shows it firing with targets `row-action-preview-<slug>` — its OWN ANCHOR BUTTON — and its portal. The button's SIZE changes when the confirm region reflows the row menu panel under it, so the existing subscription already covers this trigger. That refutes the entry's load-bearing premise, "the anchor only moved": every trigger in the declared domain (`confirmingArchive`, `errorCode`, `staleOutcome`, `heldShrink`, `pendingAction`) is a `ShowRowActions` state change that reflows the panel's contents, so size coverage holds across all of them, not just the one probed.

**Proved by removal, which is the check that settles it.** With a candidate repair wired (a placement notification driving a re-render), removing that one line left the corrected probe GREEN, and `maxHeight` still moved 428.469px to 350.969px — exactly the 77.5px the anchor travelled. The repair discriminated nothing, so it was dropped rather than shipped.

**Re-file trigger, either one:** a mis-anchored submenu observed in live use, OR a demonstrated in-domain anchor move with ZERO size change, which is the one case the existing observer would genuinely miss. Constructing such a trigger outside the domain is not sufficient — that is recognizer-widening, and the fence declines it.

**Predates `perf/anchoredportal-measure-convergence` and is unchanged by it.**
That arc removes a duplicate measure inside a single commit; it does not touch
the cross-instance path, in either direction.

---

## BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES — site 2 shipped; the gesture-frame measure cadence is parked

**Status:** PARKED 2026-08-28 after six spec rounds. Site 2 SHIPPED (`perf/placement-measure-memo`); site 3 REFUTED; site 1 parked with the round corpus as its record. Not withdrawn and not refuted — the defect is real and reproduced. What is unresolved is whether a guard can decide to skip the second measurement SAFELY, and six rounds say the answer is harder than the saving. · **Filed:** 2026-08-27 · **Facing:** product · **Severity:** LOW-MEDIUM · **Class:** measure-path redundancy · **Effort:** M · **Reachability:** PROBED 2026-08-28 — see "Probe result".

### Probe result — the defect is real, measured, and unchanged by this arc

Site 1 reproduces exactly as filed. A placement-CHANGING gesture frame runs TWO
`withNaturalSize` passes and a placement-UNCHANGED frame runs one, on both the
ancestor-scroll and the window-resize trigger. The mutant-at-the-probe (gating the
ungated every-commit effect) took the changing-frame count from 2 to 1 and red the
case on the count rather than on a premise, so the instrument discriminates. Full
transcript in the spec's appendix A.1 at `3195d0d98`.

### Why it is parked rather than repaired

**The saving is one `withNaturalSize` pass per placement-changing frame. The cost
of taking it safely is a guard that must decide, without measuring, that
re-measuring is unnecessary — and six adversarial rounds each found an input for
which that decision was wrong.**

Two designs were carried to review and both were defeated on their own premise:

1. **Enumerate the causes** (rounds 1-4). The key grew one member per round —
   `align`/`preferredSide`, then `className`/`children`, then the applied `side`,
   then `style`/`data-testid`. An enumeration of causes fails OPEN on the cause
   nobody has thought of, and CSS supplies new ones indefinitely. Recorded at
   `docs/review-rounds/perf/placement-measure-memo/b608e71b32b5.md`.
2. **Observe the effect** (rounds 5-6). Strictly better and nearly right: read the
   panel's own geometry instead of predicting what moves it. It died on the
   boundary rather than on the idea — the placement core switches on strict
   comparisons (`lib/popover/position.ts:118`, `:128`), so a natural size that
   shrinks to EXACTLY its cap changes the applied tuple while the rendered box
   does not move. Sharpening the observation to the scroll extent answered that
   instance; the round that followed is what this park record is being written
   from.

**The honest summary is that the guard is a predicate over "did anything change
that the placement reads", evaluated without doing the read that would answer
it.** Every version of that predicate is refutable by construction, and the thing
it protects is one measurement per gesture frame on one admin surface.

### Re-file trigger — BOTH, not either

1. **A probe-domain measurement of the standing cost.** Gesture-frame jank
   observed on the dashboard row menu, with profiling attributing it to this path.
   That turns the saving from "one pass per frame" into a number, which is what
   would justify a guard's complexity.
2. **A design that closes the arithmetic class**, not another sharpening of the
   same predicate. The class: the placement core switches on strict comparisons
   over fractional geometry (`lib/popover/position.ts:118` and
   `lib/popover/position.ts:128`), so the applied tuple can change while every
   cheap observation of the panel stays equal. Round 6 killed the extent
   refinement on exactly this — `scrollWidth`/`scrollHeight` are integers per
   CSSOM View while `getBoundingClientRect` and `bounds` are fractional, so a
   natural width moving from just above `bounds.width` to exactly `bounds.width`
   is invisible to size AND extent while `maxWidth` flips from a number to
   `null`.

**Both, because either alone is what produced six rounds.** A measurement without
a class-closing design funds another predicate; a design without a measurement
spends real complexity on an unquantified saving. Constructing another key is
explicitly NOT a trigger: that is the axis these rounds closed, and this record
exists so a seventh attempt does not start over.

### What shipped instead

Site 2 (`lib/popover/naturalSize.ts:70-71`): the scroll-offset restore no longer
reads `scrollTop`/`scrollLeft` on the unscrolled path, where both reads follow the
cap-restore writes and both are provably no-ops. Every measurement of every
uncapped popover on every surface composing the helper takes that path. **No
review round in six ever faulted it.**
