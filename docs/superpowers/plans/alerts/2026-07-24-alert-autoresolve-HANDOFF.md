# Handoff — observer-keyed tile-render alert resolution

**Branch:** `feat/alert-autoresolve-tile-report`
**Spec:** `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md` (rev 5)
**Plan:** `docs/superpowers/plans/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md` (rev 4)
**Implementer:** Opus / Claude Code (UI work, per the AGENTS.md hard rule)

---

## 1. What shipped

`TILE_SERVER_RENDER_FAILED` is a crash catcher: it fires when a crew-page section throws while
rendering. It previously never cleared itself. It now self-clears, keyed on the **(tile, observer)**
pair.

- `components/crew/WrappedSection.tsx` records `{ message, error }` into a per-request ledger instead
  of writing the alert. It no longer writes the log either.
- `app/show/[slug]/[shareToken]/_CrewShell.tsx` creates ONE ledger, threads it to all 7 sections as a
  required prop, and registers a single post-response `after()` callback that returns its promise.
- `lib/crew/sweepTileRenderAlerts.ts` awaits a durable `log.error` per failed tile (handing the
  logger the real Error, so name and stack survive), upserts the alert, then resolves rows for tiles
  that rendered clean.
- `lib/adminAlerts/resolveTileAlertsForObserver.ts` filters on `context->>'tileId'` AND
  `context->>'viewerKey'`, sets `resolved_at` only, and no-ops on an empty tile list.

**No DDL.** The observer key rides in the existing `jsonb` context. The code is `hybrid`: catalog
`resolution` stays `"manual"`, so the manual Resolve button survives.

**Why the observer key.** Permission gates live INSIDE the wrapped seam
(`transportTileVisible`, `components/crew/sections/TravelSection.tsx:172-178`), so different viewers
execute different code for the same tile. Keying on `tileId` alone would let a viewer who skips the
failing path clear an alert still live for the viewer who reaches it.

## 2. Backlog entries closed

All four are moved to `BACKLOG-archive.md`; `BACKLOG.md` retains none.

| Entry | Outcome |
| --- | --- |
| `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE` | Already shipped (resolve-truthing spec §6). Record corrected. |
| `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE` | Already shipped (bell spec D6/§10); resolver dormant in CI by design. |
| `BL-ALERT-REPORT-FAMILY-AUTORESOLVE` | **Evaluated, no change.** Both rejected designs recorded. |
| `BL-ALERT-TILE-RENDER-PER-TILE-KEYING` | Shipped by this PR, with no schema change. |

## 3. Review record

| Gate | Rounds | Outcome |
| --- | --- | --- |
| Spec adversarial | 4 | R1–R3 BLOCKING, all accepted. R4 unobtainable (upstream Codex 503); self-certified and recorded in spec §13. |
| Plan adversarial | 3 | All BLOCKING, all 38 findings accepted and repaired. |
| Whole-diff adversarial | 3 | R1 BLOCKING, R2 NEEDS-ATTENTION, R3 BLOCKING. All accepted and fixed. |
| impeccable critique | 2 | Re-run after late UI edits; see §4. |
| impeccable audit | 1 | See §4. |

Deliberate process deviation, stated plainly: after 7 rounds without an APPROVE, implementation began
while plan review was still returning findings. The remaining findings had shifted from design to
test-scaffolding mechanics, which execution resolves definitively in minutes rather than a round each.
The whole-diff gate — the one that actually protects the merge — was kept and run to convergence.

## 4. §12 impeccable dual-gate dispositions

Both commands run with the canonical v3 setup gates (the skill context load, then the product
register reference), and both assessments run as isolated subagents, not inline.

**First critique run** (before the round-2/3 fixes):

| Finding | Severity | Disposition |
| --- | --- | --- |
| No-rendered-output claim | — | CONFIRMED line by line; success and throw paths byte-identical |
| `err.message` reaching the DOM | — | Proven impossible; every crew failure renders `TileErrorFallback` with catalog copy |
| Detector (impeccable bundled scanner) | — | 0 hits, verified live with a positive control |
| Em dash / apostrophes / tap targets / tokens / raw codes | — | All PASS (several vacuously: the diff adds no rendered markup) |
| `ledger.attempted.add` outside the `try` | P2 | **FIXED** — moved inside, then optional-chained after round 2 showed the catch also dereferenced the ledger |
| `showId` / `sheetName` dead with false docstrings | P3 | **FIXED** — dropped from the destructure, docstrings corrected, kept optional on the type |

**Re-run required and performed.** `WrappedSection.tsx` changed materially after the first run
(optional chaining, `TileFailure` shape, docstrings), so the first verdict was stale. Results of the
re-run are recorded in the PR body; both commands were re-run on the final UI state per invariant 8.

## 5. Known gaps, accepted deliberately

- **Conditionally-mounted seam.** `VenueSection.tsx:330` gates the whole `<WrappedSection>` behind
  `hasDiagrams`, so with zero diagrams the tile never enters `attempted` and an existing alert is not
  auto-cleared. Not a regression (pre-change it never cleared at all); the `hybrid` manual button is
  the operator path. Closing it means always mounting the seam, which changes the rendered tree.
  Documented in spec §8.
- **Concurrent-render race.** Two overlapping renders by the SAME observer can disagree if data
  changes between them, so a spurious resolve is possible. Accepted and self-healing: the condition,
  if still true, re-raises on that observer's next render. Pinned by a test, not asserted in prose.
- **Durability is likely, not guaranteed.** Awaiting `log.error` removes the dropped-promise failure
  mode but not persistence failure, because the logger deliberately swallows a failed `app_events`
  insert. Spec §4.8 states this precisely rather than overclaiming.

## 6. Verification

- Full suite: 17,432 passed. Two `validation-check-seed` failures were shared-local-DB contention
  from a concurrent sibling worktree, not this diff — both pass in isolation with the full working
  tree (47/47).
- `pnpm typecheck` 0 errors · `pnpm lint` 0 errors (44 pre-existing warnings, down from 46) ·
  `pnpm format:check` clean · `pnpm spec:lint` 0 hard on both spec and plan.
- Mutation-tested: the `viewerKey` filter, all four topology assertions, the report-family
  classification guard, and the Error-preservation assertion were each verified to FAIL against a
  named mutant.
