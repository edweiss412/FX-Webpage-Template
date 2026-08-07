# Arc C — quick wins: closeout

Branch `feat/backlog-quick-wins`. Two backlog entries, two tasks, both closed by
executable evidence rather than by inspection.

## 12. Impeccable gate

impeccable-gate: N/A — no UI surface

The arc's diff is one library branch (`lib/sync/holds/holdAwareApply.ts`), its
caller's plumbing, two test files, and ledger prose. Nothing under `app/`
(outside `app/api/**`), nothing under `components/`, no `@theme` block, no
`DESIGN.md` or Tailwind config change. The plan predicted this at
`docs/superpowers/plans/2026-08-06-arc-c-quick-wins/plan.md:13` and made the prediction falsifiable — "if implementation
contradicts this, the gate flips before merge". It did not: verified against the
final diff below.

```
$ git diff --name-only origin/main...HEAD
BACKLOG-archive.md
BACKLOG.md
lib/sync/applyParseResult.ts
lib/sync/holds/holdAwareApply.ts
tests/docs/_metaDeferralLedgerGraduation.test.ts
tests/docs/_metaLedgerReferentialIntegrity.test.ts
tests/e2e/published-review-modal.realtime.spec.ts
tests/sync/capabilityLossReachability.probe.test.ts
```

`components/admin/showpage/PublishedReviewModal.tsx` was edited twice during Q2
and both edits were mutants, reverted before commit; it is absent from the diff,
which is the check that matters. The two `tests/docs/` files are registry rows
that move when an entry archives, not UI.

## 13. Observed-RED records

Both tasks are TDD per invariant 1, and in both cases the RED was observed
against the tree the fix had not yet touched. The two records differ in kind and
that difference is the arc's main lesson.

### Q1 — capability-loss false positive (`BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE`)

RED: the `undo_override/crew_email` row of
`tests/sync/capabilityLossReachability.probe.test.ts` flipped from
`reported: true` to `reported: false, reportedFlags: null, phaseAfter` pinned to
the LIVE phone, and failed against the unfixed tree. GREEN after the live-row
retain in `lib/sync/holds/holdAwareApply.ts`. The tombstone row still asserts
`reported: true` throughout — a counterweight, so the fix cannot pass by
suppressing the signal wholesale.

One defect found in the probe itself, before it could mislead: `LIVE_PHONE` and
`HELD_PHONE` are annotated `: string` because with literal types TypeScript
decided `LIVE_PHONE !== HELD_PHONE` at compile time (TS2367) and the premise
assertion became a tautology that could never fail.

Sibling filed with probe evidence: `BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE`.

### Q2 — aborted-close freshness (`BL-FRESHNESS-ABORTED-CLOSE-E2E`)

RED, with the `closing` arm of the clear-on-hide branch commented out
(`components/admin/showpage/PublishedReviewModal.tsx`, restored before commit):

```
Error: an aborted close must clear armed freshness cues; a survivor resumes its timer on reopen
Received: 1
```

GREEN with the branch restored, in the same run as the pre-existing scenario:

```
✓ an ABORTED close clears armed freshness cues (BL-FRESHNESS-ABORTED-CLOSE-E2E) (3.5s)
✓ realtime broadcast reconciles the open modal in place (12.6s)
2 passed (2.1m)
```

The second line is the harness refactor's own proof: the extraction of the
freshness recorder to module scope is behavior-preserving because the scenario
that consumed it in place still passes unchanged.

**Two false greens preceded that RED, and both are worth the reader's time**,
because neither is visible from a passing run and both are the same shape — an
assertion whose discriminating premise was absent where it ran:

1. Copying the reopen spec's 2500ms route throttle put the reopen **3931ms**
   after the cue armed. A cue clears itself on a 1600ms timer that keeps running
   while the modal is hidden, so `flashing === 0` is exactly what a fully
   neutered implementation reports. Repaired by making the budget executable:
   the case asserts, in the implementation's own `SECTION_FRESHNESS_FLASH_MS`,
   that the observation happened inside the window, so a slow drive fails loudly
   instead of passing vacuously.
2. A single mutation armed nothing. The first signature a modal sees becomes its
   BASELINE — the mechanism that stops a stale prefetch from flashing on open —
   so the abort was aborting over an empty cue set. The case now spends one
   mutation buying the baseline and arms with the second.

Two further repairs came out of the same measurements: the arm detector watched
`attributes` only and missed the shape where React inserts a card that already
carries the attribute (a childList record, no attributes record — the same
"arrives with its content" blind spot that makes a freshly-inserted live region
silent); and the case waits on the modal SHELL rather than the loaded modal,
whose title is gated on the deliberately throttled RSC fetch.

**Documented limit.** The case requires the production-build server CI uses
(`CI=true` webServer). Reopen renders in ~440ms there against ~1900ms under
`next dev`, over the 1600ms budget the observation must fit inside. On a dev
server it fails its own premise, with a message that says exactly that rather
than reporting anything about the modal.

## 14. Acceptance criteria

- [x] **AC-C1** — four probe rows green; false-loss row asserts `reported: false`;
      tombstone row still asserts `reported: true`; staleness assertion pins that
      the post-apply row keeps live non-identity fields; RED recorded (§13). Fix
      is the live-row retain with optional `previousCrewMembers` plumbing and a
      no-retain fallback when no live row matches; arm (c) unmodified;
      `BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE` filed with probe evidence.
- [x] **AC-C2** — new e2e case green under `MODAL_REALTIME_E2E=1` on
      `desktop-chromium`; observed-RED-against-mutant and restored-green both
      recorded (§13); nothing carries `data-section-freshness-flash` after the
      aborted close and reopen.
- [x] **AC-C3** — claim handoff per spec §3 with no undeclared instant; TDD per
      task; conventional commits; both entries archived to `BACKLOG-archive.md`;
      `impeccable-gate: N/A — no UI surface` (§12). Cross-model diff review
      APPROVE, real CI green including `published-modal-e2e.yml`, and main ff'd
      to `0 0` are recorded at merge.

## 15. Cross-model review train

**R1 — NEEDS-ATTENTION, 1 finding.** Whole final diff, `--stage diff`.

- **P2 — the new e2e case leaked its seeded show.** CONFIRMED and repaired. The
  `finally` closed the browser context but never dropped the show, so every pass
  and every CI retry left another published show with 25 crew members in the
  shared database; the drive id is random, so the helper's pre-seed cleanup
  cannot reach an earlier run's residue. Teardown is now nested exactly as
  `runScenario`'s is, so a failing earlier step cannot skip a later one. Both
  cases re-verified green after the change.

  **Class-sweep** over the shape "a seed with no matching teardown", across every
  `tests/e2e/*.spec.ts` that calls `seedShowWithCrew`: 16 files, and the new case
  was the only instance. `picker-flow.spec.ts` reads 6 seeds / 0
  `deleteSeededShow` calls but is NOT an instance — it accumulates drive file ids
  and deletes them in an `afterEach` (`tests/e2e/picker-flow.spec.ts:88-92`). No peer was deferred, because
  none was found.

The reviewer explicitly reported no wrong-and-silent Q1 input within the stated
fence, and judged the Q2 timing and oracles capable of detecting the specified
clear-on-hide mutant. It could not run vitest or the production-server e2e from
its sandbox and said so rather than inferring — recorded here so a later round
does not read that silence as a clean run.

