# M-wave: ratified decisions + kickoff contract (2026-08-04)

Self-contained brief for the fresh Fable session that authors the M-wave spec + plan.
Every decision below was answered by the user (Eric) on 2026-08-04 via two AskUserQuestion
batches in the backlog-convergence Fable session. They are PRE-RATIFIED: put them in the
wave spec's §1.1 (do-not-relitigate) and §4.5 (ratified answers). Do not re-ask.

## Trigger + routing (user's words)

- Wave kicks off when **C-x5 merges** (branch `docs/x5-decided-by-boundary`, the
  backlog-convergence arc's final PR — X5 boundary amendment).
- "fully autonomous, spec + plan in new fable session pane, new opus session in new pane
  for implementation + closeout." Both new panes live in the SAME herdr workspace as the
  capturing session (the account-2 workspace, label ericweiss833) — user-stated 2026-08-04.
  Splits there inherit CLAUDE_CONFIG_DIR=~/.claude-account2 via the zshrc hook.
- Fully autonomous per AGENTS.md autonomous-ship gate: both user review gates (spec, plan)
  WAIVED. Stop only for genuine unresolvable ambiguity. All product decisions below are
  already settled — an ambiguity that maps to one of them is NOT a stop.
- Pipeline: spec → self-review → codex-guard adversarial review to APPROVE → plan → same →
  handoff to NEW Opus pane (implementation + closeout). Review briefs MUST carry the
  canonical labeled "CONSEQUENCE BOUND —" / "THREAT MODEL FENCE —" numbered block
  (`~/.claude/hooks/review-convergence-gate.sh` blocks dispatch otherwise), REVIEWER ONLY,
  VERDICT line, do-not-relitigate list, exhaust-the-vector. Round cap 4.
- All AGENTS.md invariants bind: worktree-only (11), ledger claims + push (12), TDD (1),
  conventional commits (6), impeccable dual-gate for UI surfaces (8), mutation-surface
  observability (10). UI entries are Opus-owned (hard rule).

## Pool: "READY + decision-unlocked" (user-selected, Recommended option)

### READY — implement (10)

UI (impeccable dual-gate, Opus):
1. BL-ADMIN-BADGE-CONTRAST-TOKEN — swap accent badge bg to ~#C25E00 token pair in
   NotifBell + attention tab; fold the 2 polish items the entry names.
2. BL-ANNOUNCE-REGION-UNMOUNT-CLASS — per surface: hoist live region above the branch its
   own success flips; AdminAnnounceProvider is the shipped pattern. (~19 sites; class entry.)
3. BL-BULK-UNDO-ANNOUNCE-UNMOUNT — instance of the class above (move bulkUndoOutcome to
   AdminAnnounceProvider or hoist). Spec must dedup these two — one task family, two entries closed.
4. BL-FRESHNESS-PROJECTION-NARROWING — per projection: byte-identical-HTML probe + D-row
   no-cue test, importing the shipped predicate.

Guards/tests:
5. BL-HARNESS-FIXTURE-ENFORCEMENT — fontFidelityFixture asserts collected families; kill
   impostor-face mutant; start from PR #705 vantage evidence.
6. BL-HEADER-REACT-RECONCILE-HARNESS — hydrated React harness, prop change under stable
   key, move Part 2 assertions.
7. BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH — **live bug** (its own 2026-08-04 screen shows
   `**Share**`/`**Viewer**` matching only import identifiers). Exact/word-boundary tier for
   labels <~6 chars; reconcile all failing labels same commit.
8. BL-LEDGER-DISCOVERY-FAMILY-SCOPED — probe fifth-family ledger file first, then widen
   discovery regex + hardcoded name list. NOTE: correct citation is
   `scripts/lib/ledger-fields.ts:42-45` (entry body already corrected inline).
9. BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE — replace 3 fixed waits with per-case toPass settle
   predicates; T-CONFIRM-SCROLL predicate already named in entry.
10. BL-CATALOG-PARTITION-WARNING-CLASS — add class field to MESSAGE_CATALOG rows, backfill,
    invert scanner into cross-check.

### Decision-unlocked — implement (4)

11. BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED — **RATIFIED: signature tier.** Compare
    function existence + signatures (name, args, return, security posture). NOT body hash.
12. BL-FONT-STYLESHEET-GRAPH-FIDELITY — **RATIFIED: assert against the BUILT artifact**
    (built CSS output), not a resolved module graph.
13. BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES — **RATIFIED: suppress.** unknown_asterisk crew
    get Tonight/Where date rows suppressed on Today view. UI entry (Opus, dual-gate).
14. BL-RESYNC-REGRESSED-JUMP-LINK — **RATIFIED: amend the §12.4 row and add the jump
    link.** This is the one place user chose the non-recommended option: overturn the
    ratified 'No action link.' prose. Requires the §12.4 lockstep triple (spec prose +
    `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` row, same commit) + UI link
    (Opus, dual-gate). Record the amendment as a ratified spec change in the wave spec.

### Decision-closed — docs-only closures (2)

15. BL-CREW-PII-DB-LOCKDOWN — **RATIFIED: crew-to-crew PII visibility acceptable.**
    Rationale: source Google Sheet already shared with whole crew. File as documented
    limit on the owning surface, archive entry. NO lockdown work.
16. BL-RESOLVE-INTENT-WRONG-VERB — **RATIFIED: keep + document.** Append-only audit
    contract stays absolute; wrong verb recorded as documented limit with correct reading
    noted. Archive entry. NO relabel migration.

### Filing-bar demotions — ride along, ratified policy covers them, no new ask (3)

17. BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE — consequence is its own body's words:
    "documentary, not behavioral"; no production consumer; drift pinned by parity test.
    Demote to documented limit / archive.
18. BL-CREW-AGENDA-ADMIN-CLEAR — body says R22 structurally closed the original problem
    ("no lingering-stale crew exposure to remediate"); only rare admin convenience remains.
    Archive with pointer; PREREQ trigger (operator request) noted in archive entry.
19. BL-ROOM-DIMS-ONLY-NOVEL-HEADER — partially resolved by 2026-07-06 BO-venue-header
    anchor; remaining bare `NAME\ndims` sub-case is declared out of scope in the entry
    itself. Archive with pointer.

## NOT in wave — stays open, fences intact

PREREQ (external trigger named in each entry): BL-ADMIN-DASHBOARD-ROW-ACTIONS,
BL-CREW-FIELD-ENRICHMENT, BL-FLIGHT-LEG-ORIENTATION, BL-PG-CRON-HOST-ASSERTION,
BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED, DEFERRED SHEETLINK-SUBTLE-ACTION-CLASS-1.

DECISION-fenced, deliberately NOT settled now (design-heavy, own pass later):
BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE, BL-RESYNC-STAGED-REVIEW-UI,
BL-SERVER-ACTION-ORIGIN-GATE (trusted-proxy policy), BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH
(schema choice), BL-STEP3-FULL-CREW-PREVIEW (preview semantics).

## Wave shape guidance

- ~14 implementation entries + 5 docs/demotion closures = expect themed branches like the
  backlog-convergence arc: a UI branch (entries 1-4, 13, 14 — dual-gate closeout), a
  guards/tests branch (5-10), a parity/guard branch (11, 12), a docs branch (15-19).
- 6 UI entries total → single impeccable dual-gate closeout per UI branch.
- Fresh census (`pnpm ledger:mass --json` in main checkout) at spec time = the wave's §0
  baseline; backlog-convergence spec `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md`
  is the template (weights, filing bar, screen table format).
- Effort fields: several M-tier entries have NO `**Effort:**` field at all (readers'
  exclusion lists) — the sizing guard from the convergence arc may have stamped them by
  wave time; re-census, don't trust this list's boundary.

## Fire-time census (2026-08-05 00:34 CDT, main @ post-C-x5 `0 0`)

`pnpm ledger:mass --json` totals: entries 93 (XS 1 / S 5 / M 31 / L 16), mass 290,
unsized 40, severityUnrecognized 2. Convergence-arc baseline was 110 / 321. Run your own
census at spec time — this is a reference point, not your §0 baseline.
