# M-wave 2 — per-unit closeout

Per-unit gate markers and the AC-PROG arithmetic land here as units merge
(HANDOFF.md wave-closeout contract; plan §12 covers the docs branch itself).

## W-PARSE (`feat/m2-payload-hygiene`, PR #766, merged 2026-08-10)

impeccable-gate: N/A — no UI surface

Cross-model review: diff round 1 APPROVE, 0 findings (corpus row
`docs/review-rounds/feat/m2-payload-hygiene/bdcd336f3f9c.jsonl`).

## W-SYNC (`feat/m2-sync-fault-codes`)

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=0 dispositions=none

Scoped run on `/help/errors` (the unit's only invariant-8 surface: the
`ONBOARDING_INTERNAL_ERROR` help-family row). Snapshot:
`.impeccable/critique/2026-08-10T16-11-49Z__app-help-errors-page-tsx.md` —
detector exit 0 over `app/help/errors`, no em dashes / raw codes in the new
copy, heuristics 34/40, zero P0/P1 findings, nothing deferred. `RAN-DEGRADED`
because the two assessment sub-agents went unresponsive and both assessments
re-ran inline (single-context), declared per the critique contract's banner
rule.

Cross-model review, split tight-scope (large diff): brief A (fault kinds +
cron workbook code) round 1 NEEDS-ATTENTION with 2 findings — F1 (P1,
probe-backed): the existing-pending early return bypassed the first-seen
carve; repaired by hoisting the show read, with both signs pinned. F2 (P3):
stale suite header; rewritten to the three-kind contract. Round 2 APPROVE, 0
findings. Brief B (source-anchors stamp) round 1 APPROVE, 0 findings. Corpus
rows: `docs/review-rounds/feat/m2-sync-fault-codes/196334d5ef61.jsonl`.

## W-E2E (`feat/m2-e2e-infra`)

impeccable-gate: N/A — no UI surface

Cross-model review, whole-diff, four rounds (round cap reached, converged
APPROVE): r1 BLOCKING 4 findings (E1 lock-topology unpinned by the walker
guard → exported `lockedSeedTxSql` builder + DB-free unit pins;
`honorRemoteOptIn` flipped to false; recovery test gained an in-session
transition leg; 83-behind merge). r2 BLOCKING 2 (firing smoke tightened from
newest-row substring to ALL-xid-rows / exactly-one / parsed path+query
equality; five stale right-now prose sites class-swept, census restated
UNSEEN=24). r3 BLOCKING 2 (`judgeSample` swallowed FACES_UNREADABLE on
textless live documents — RED row 5 then fix; second merge with
`check-crew-e2e-executed.mjs` thresholds taken from main verbatim plus the
right-now row). r4 APPROVE, 0 findings. Corpus rows:
`docs/review-rounds/feat/m2-e2e-infra/` (`6b1f3bf2dea8`, `4cc9251c0312`,
`cdab62b8054f` — merge-base moved twice mid-arc; per-base round numbering per
the crew-field-enrichment precedent).

E2's five-consecutive-green crew-e2e bar (wave spec §4 limit 8) is tracked
post-merge, not a pre-merge gate.
