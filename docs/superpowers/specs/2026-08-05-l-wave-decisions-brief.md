# L-wave: ratified decisions + kickoff contract (2026-08-05)

Self-contained brief for the fresh Fable session that authors the L-wave spec + plan.
All decisions below were answered by the user (Eric) on 2026-08-05 via AskUserQuestion
batches (with a plain-English artifact memo at claude.ai/code/artifact/e1a21217-f846-46f8-a1ab-4c6a95d3eadc).
They are PRE-RATIFIED: put them in the wave spec's §1.1 (do-not-relitigate) and §4.5
(ratified answers). Do not re-ask.

## Trigger + routing

- **Wave starts IMMEDIATELY (user-ratified 2026-08-05): spec + plan authoring begins now,
  concurrent with the still-open M-wave W-UI branch.** Staging rule, not a wait: any
  implementation branch that edits BACKLOG.md / DEFERRED.md or user-visible copy (the
  em-dash sweep, entry dispositions, archives) forks only AFTER `feat/m-wave-ui` merges —
  its wave-close archives 19 entries in those same files, and U8 reconciles copy strings.
  Conflict-free branches (PUSH-NOTIFICATIONS templates link, coverage-claims doc sweep in
  docs/, new spec/plan files) may fork any time. The orchestrator pane (wF:p2) holds a
  merge Monitor on `feat/m-wave-ui` and will relay the merge; poll `gh pr list --head
  feat/m-wave-ui --state merged` yourself before forking a ledger-touching branch.
- FULLY AUTONOMOUS (Call H): spec + plan in a NEW Fable pane in the SAME workspace (wF,
  label ericweiss833 — splits inherit account2 via the zshrc hook), then that pane opens a
  NEW Opus pane for implementation + closeout. Both user review gates WAIVED. Stops only
  for a genuinely new question — an ambiguity that maps to a ratified answer below is NOT
  a stop.
- Pipeline per AGENTS.md autonomous-ship gate: worktree first (invariant 11), ledger
  claims + markers + push (invariant 12), TDD (1), conventional commits (6), impeccable
  dual-gate on any UI surface (8). codex-guard dispatches need `--stage` AND `--round`
  flags; briefs need the canonical numbered "CONSEQUENCE BOUND —" / "THREAT MODEL FENCE —"
  block with the literal phrase "never silently wrong" (the hook greps for it), REVIEWER
  ONLY, VERDICT line, round cap 4.

## Ratified decisions (2026-08-05)

1. **BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES (L): DELETE the sentence class.** Prose
   coverage claims are unguardable; sweep them out of docs. Docs-only task, closes the L.
2. **BL-WATCH-PROMOTION-ACTIVATION-RACE (L): PARKED for its own future design session.**
   NOT in this wave. Real defect per the 2026-08-04 screen ruling (stale active channel,
   wrong live state); fix needs a lock-topology redesign (M5-R20 nested-holder class).
   Stamp the entry with this disposition; do not archive, do not patch.
3. **BL-EM-DASH-POLICY (M): ENFORCE — lockstep sweep + structural guard.** Long dashes out
   of all user-visible copy, guard prevents return. Joins wave. Copy/DESIGN.md work =
   Opus-owned under the dual gate where UI files are touched.
4. **BL-ATTENTION-PANEL-NAME-LEADING-SECTION (S): KEEP the deliberate name, close.**
   Record the owner ruling on the entry, archive. Zero code.
5. **BL-RESYNC-STAGED-REVIEW-UI (M): ARCHIVE.** Owner never asked for the diff-review
   workflow; entry's own text says promote only if wanted. Re-open trigger: an operator
   asks for diff review.
6. **BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE (M): LEAVE OPEN, untouched.** User
   explicitly declined both archive and build. Not in wave; no disposition stamp beyond
   what exists.
7. **BL-STEP3-FULL-CREW-PREVIEW (M): LEAVE PARKED.** Waits for its own focused design
   conversation (adapter semantics: viewer aliases, visibility filters, admin branch).
8. **NEW FILING: per-field provenance model — file as an honest L entry** (suggested id
   BL-PARSER-FIELD-PROVENANCE-MODEL). Cite
   `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §7 item 5 + the
   cross-flow note (P0-2 structural fix); record what already shipped (ambiguity-warnings
   #367, property-fuzz #379) and that the row is the REMAINDER (full provenance model).
   Filed by this wave's docs branch; NOT implemented this wave. Satisfies the filing bar
   via the audit's named reachable surface.

## Reader classifications (2026-08-05, 15 BACKLOG L entries)

DEMOTE per ratified filing bar — no user ask needed, wave executes with probe evidence:
- BL-ROLEFLAGSNOTICE-DROP-GUARD — guards a hypothetical fifth site via an unbuilt
  static-analysis surface; all four known sites closed.
- BL-CI-OVERLAP-BOOT-WITH-SETUP — built, MEASURED, reverted (cost 6s vs saving 16s);
  answered-negative but never archived. Archive.
- BL-CI-PARALLEL-DB-FALLBACK-AUDIT — INFERRED NOT PROBED, names zero instances; its own
  sizing self-contradicts (691 vs 875 files). One assertion-count diff probe settles it:
  probe first, then demote or keep per result.
- BL-CI-RECLASSIFY-PARALLEL-STABILITY — shelved by its own text (~17s win under its own
  30s gate).
- BL-ACCENT-BUTTON-ATOM-SWEEP — "no correctness bug", census rotted (8 baseline sites →
  3 live). Archive or refile at honest scope.

DECOMPOSE — wave spec names shippable sub-units, converts each L into sized children:
- BL-MUTATION-HARNESS-OPEN-HOLES (per operator class: #REF!, ZWNJ, column-shift,
  merged-cell fusion, section-order)
- BL-E2E-LIFECYCLE-SPECS-CI-DARK (heading premise stale — layout + transitions specs
  already wired; residual is the ~60-spec umbrella in batches + owner-added required
  contexts)
- BL-OPS-LOG (body contradicts scope: durable sink already built at lib/log/persist.ts;
  residual = OAuth-callback emits, ONBOARDING_OPERATOR_ERROR producer, dashboard banner.
  UI part Opus-owned.)
- BL-RESURRECT-MOBILE-SAFARI-E2E (premise partially refuted — lifecycle-layout-e2e runs
  mobile-safari; residual = incremental green batches)

SHIP (with staleness repair): BL-PUSH-NOTIFICATIONS — prerequisites (a) and (c) refuted by
its own body (Resend provider ratified + delivery LIVE); residual is ONE "Report a
problem" link in four notify templates. Resize L→S in the same commit, ship it.

PREREQ — stay fenced: BL-HEALTH-RESOLVE-DB-LOCKDOWN (closes only inside
BL-ADMIN-POSTGREST-DML-LOCKDOWN), BL-HELP-NON-SHOW-REPORT-SURFACE (operator feedback),
BL-TWO-WAY-SHEET-SYNC (Doug asks for it).

DEFERRED L: DESTRUCT-FOCUSRING-1 already archived by the sizing sweep (PR #718). None left.

## Newly-L entries (sizing sweep 2026-08-05, PR #718) — classify at spec time

The sweep stamped 14 entries L that no reader has classified: TASK-ENROLLMENT-SINGLE-DEPTH,
ADOPTION-PIN-REACHABILITY-BLIND, PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE, PG-CRON-COVERAGE-UNRUN,
EXPORT-BLANK-ROW-SEGMENTATION, TRANSPORT-ID-RESOLUTION, NON-CREW-UNDO, PRIVATE-IMAGE-PIPELINE
(scope floor), ADMIN-PER-SHOW-HISTORY (scope floor), CREW-SHEET-TEMPLATE-V2 (scope floor),
plus DEFERRED: SHARELINK-COPY-REF-ORDERING-PROOF, SHARELINK-CUE-FORCED-COLORS-1,
ATTENTION-INDEX-JUMP-FOCUS-1, UNDO-FAILURE-REANNOUNCE-1. Re-census at spec time
(`pnpm ledger:mass --json`); classify these with the same DECOMPOSE/DEMOTE/SHIP/DECISION/
PREREQ screen; scope-floor entries are design-gated and almost certainly PREREQ.

## Remaining fenced M-tier (unchanged today)

BL-SERVER-ACTION-ORIGIN-GATE (trusted-proxy policy — wave spec MAY settle technically or
leave fenced), BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH (schema choice — same).

## Baseline at contract time

2026-08-05 ~16:45 EDT, main post-#718: 83 entries, mass 474 (XS 3 / S 14 / M 37 / L 29),
unsized 0, severityUnrecognized 0. M-wave W-UI close will archive its remaining entries
before this wave starts — re-census.
