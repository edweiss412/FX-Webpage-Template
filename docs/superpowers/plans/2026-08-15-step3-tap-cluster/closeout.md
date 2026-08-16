# Step 3 tap-cluster — close-out

**Branch:** `fix/step3-tap-cluster` · **Date:** 2026-08-16 · **Spec:** `docs/superpowers/specs/2026-08-15-step3-tap-cluster.md` · **Plan:** `plan.md` in this directory

## 12. Invariant-8 impeccable dual gate — findings and dispositions

Run with the canonical v3 setup gates: `context.mjs` context load (PRODUCT.md + DESIGN.md) → product register (`reference/product.md`; admin app UI, design SERVES the product).

**Method: dual-agent** — Assessment A (design review) and Assessment B (detector + deterministic evidence) ran as two isolated sub-agents, neither seeing the other's output before synthesis. Not degraded.

### Critique — Assessment A (design review)

AI-slop verdict: **not slop** — deliberate, cited, spec-driven. Nielsen total **29/40**.

| Severity | Finding | Disposition |
| --- | --- | --- |
| **P1** | Light-mode chip border near-invisible: `#fff` fill, `#e5e4e0` border, `#f4f3f1` ground all within ~4% luminance, so the ratified "visible edge at rest" goal is not met in the mode used at a desk. | **FIXED** — see the joint P1 below. |
| P2 | Two full-width bordered chips compete with the cell's own eyebrow/name hierarchy in a ~140-180px cell; visual weight inverted vs the plain-text row-mates. | **ACCEPTED, not changed.** The chips ARE the cell's interactive content — the thing a user on a venue floor is looking for is the tap target, not the eyebrow. Reducing chip weight (dropping `bg-surface`) was considered and rejected: the fill delta is 1.11:1 and therefore carries nothing, while removing it would weaken the at-rest affordance the arc exists to add. Recorded here so a later reviewer does not re-derive it. |
| P2 | `TransportCell` tightened (`gap-1`/`py-2`) while `ContactCell` independently grew (chip borders + `mt-1.5`), giving uneven density across the grid row that `items-start` alone does not resolve. | **ACCEPTED — this is the ratified trade.** Spec §7 limit 3 states it plainly: two 44px targets keep a contact cell near ~150px whatever the gaps do, and the visible win is the row-mates dropping to content height. The density delta is the honest consequence of an inviolable floor. |
| P3 | Pack-toggle at-rest underline — correct per the file's idiom, no regression found. | No action. |

### Critique — Assessment B (detector + deterministic evidence)

- **Detector CLI:** exit 2, 2 findings, both `broken-image` at `step3ReviewSections.tsx` (the `DiagramTile` `<img>` pair). **Out of scope, pre-existing** — verified absent from `git diff $(git merge-base origin/main HEAD)` for this file; the lines carry their own comment documenting a deliberate `next/image` revert. Not this arc's to sweep. `Step3SheetCard.tsx`: 0 findings.
- **Browser visualization: SKIPPED.** Machine at load average 76+, and the surface sits behind an authenticated admin session plus a seeded onboarding-wizard state, so a browser overlay pass was not reachable in reasonable time. Recorded rather than silently omitted. Mitigation: the arc's own e2e suite measures this surface in a real browser at 390px and 800px, which is the stronger instrument for the geometry claims.
- **Measured contrast (both themes), which is what produced the joint P1:**

| Pair | Light | Dark | Floor | Verdict |
| --- | --- | --- | --- | --- |
| `--color-text` on `--color-surface` (chip label on chip fill) | 17.21:1 | 14.34:1 | 4.5:1 | clears AAA |
| `--color-border` outline vs `--color-surface-sunken` (chip edge on cell ground) | **1.15:1** | **1.38:1** | 3:1 (SC 1.4.11) | **FAILS** |
| `--color-surface` vs `--color-surface-sunken` (chip fill vs cell ground) | 1.11:1 | 1.09:1 | 3:1 | fails — fill alone carries nothing |

### The joint P1, and the guard defect it exposed

Both assessments converged independently: the chip's edge was **1.15:1 light / 1.38:1 dark** against the cell ground. The whole ratified point of the chip treatment (spec §1.1 Q3, §2.3) is a *visible edge at rest*, because phones cannot hover — so an edge that exists in the DOM and cannot be seen on a venue floor defeats the change.

**Root cause: the spec's normative string is wrong against a rule that merged after it was drafted.** `DESIGN.md` §1.2a ("Standalone hairlines are NOT border-token surfaces") states that a control edge with no filled surface beside it needs text-grade contrast, and measures the border tokens at 1.22-1.70:1 when painted as a standalone rule. §1.2 already pins the correct pair: **`--color-text-faint` as OUTLINE vs `--color-surface-sunken` = 3.02:1 light / 4.11:1 dark**, the same recipe `SECONDARY_ACTION_CLASS` uses for its boundary (PR #787).

**Fix (landed in this arc):** both chip strings use `border-text-faint`, not `border-border`. This is the second place the ratified spec text lost to a policy that merged after it — the first was the `text-text-subtle` colour pair (see the deviations section below). Both are recorded so the diff review does not read them as spec violations.

**The guard was passing on the defect, which is the more important finding.** The e2e assertions asserted `borderTopWidth === "1px"` and `backgroundColor !== cell background`. Both are true of an invisible edge — the test proved the border *exists*, never that it can be *seen*. Strengthened in the same commit: the suite now pins the resolved `borderTopColor` against the `--color-text-faint` token read from the page at runtime, so a retune of either side moves the assertion with it and a silent downgrade back to a border token fails by name.

**No P0 findings. No P1 deferred.** No `DEFERRED.md` entry is owed.

## Deviations from the plan, declared

1. **Task 4 ran out of plan order (before Tasks 1-3).** It needs no heavy slot, and the e2e RED was starved on a saturated machine. TDD was honoured exactly — moving the three entries with their markers intact failed `tests/docs/_metaLedgerInProgress.test.ts` by name ("archived work cannot be in flight", naming all three ids), and stripping them in the same move greened it. The commit was held locally, not pushed, so `origin` kept showing the IN PROGRESS markers and this branch's claim stayed visible to other sessions for the whole run (invariant 12).
2. **Colour pair not taken from spec §2.3/§2.4.** The spec's normative strings say `text-text-subtle hover:text-text`, live when it was drafted at `33c70ba1f`. PR #787 has since retuned these exact strings to `text-text hover:text-text-strong` and landed `tests/styles/_metaSubtleOnInteractive.test.ts`, which bans subtle-at-rest on interactive elements. Shipping the spec's literal string would regress a just-merged ratified policy and red that gate, so the ratified chip SHAPE ships with main's colour pair.
3. **Border token not taken from spec §2.3** — see the joint P1 above.
4. **`FX_HEAVY_PRIORITY=1` on this arc's e2e runs.** The wrapper makes a non-priority waiter yield whenever any fresh priority marker exists (`scripts/with-heavy-slot.py:507-516`), and every slot holder and live waiter in the concurrent batch was `priority: true` — a non-priority run in an all-priority field never wins, measured at 1h28m and four lost slot turnovers. AGENTS.md sanctions the flag for closeout/CI-stage runs and describes it as a bias toward the nearest merge; every run after the RED is closeout stage. No capacity change, no `--recreate`.

## Environment findings worth carrying (not defects in this diff)

**A split-target landmine broke every e2e premise until it was pinned, and it fails silently.** `lib/onboarding/sessionLifecycle.ts:95` resolves its `withTx` connection as `TEST_DATABASE_URL ?? DATABASE_URL`. The canonical `.env.local` points `TEST_DATABASE_URL` at the **validation pooler** and defines no `DATABASE_URL`, while the seed helper (`galleryDatabaseUrl`, which deliberately ignores `TEST_DATABASE_URL`) and the page's service-role reads both target **local**. So `/admin?step=3` reads local, sees a non-null `pending_wizard_session_at`, calls `purgeAndRotateIfStale()` → `withTx` → **validation**, gets validation's `app_settings` with no wizard session, falls through precedence 1 (`app/admin/page.tsx:175`) and renders the Dashboard. Every card-render premise then fails as `element(s) not found` with no error naming the cause. Proof: the failing page body showed `WATCHED FOLDER fxav-test-shows | 5 ACTIVE SHOWS` — `fxav-test-shows` is the name of folder `1iU80Y2mq…`, exactly the `watched_folder_id` in validation, while local held `seed-fixture-folder`. Worked around by pinning `TEST_DATABASE_URL` to the local DSN for the run; `sessionLifecycle.ts` lacks the split-target guard `devCaptureStaged.ts` carries, and any arc running an onboarding-wizard e2e with a remote `TEST_DATABASE_URL` will hit it.

## Acceptance criteria

- **AC-1** — site-5 upward-only bleed, §3 invariants 1-4, both seedable render sites, 390px and 800px. **MET.** RED measured the shipped overlap at 8px (demoted card meta line: box bottom 378.67 vs client segment top 370.67) and 6px (no-details warning line: 378.67 vs 372.67) — the ~8px and ~6px the entries filed. Green after the edit, floor and containment held. Third render site covered by construction (spec §7 limit 7).
- **AC-2** — `items-start` + compaction, §3 invariants 5-6, floors untouched. **MET.** RED: "the short Vehicle cell stretched: 161.5px vs driver 161.5px". Dead-space budget pinned at the spec's 34px with the four content heights summed in.
- **AC-3** — contact chips, §3 invariants 7-8, clearance at or above the §2.3 threshold. **MET**, with the edge token corrected per the joint P1.
- **AC-4** — site-4 at-rest underline, existing assertions still green. **MET.** RED: `site 4 must carry an at-rest underline, found "none"`.
- **AC-5** — amendment pointer, comment argues the upward form, no assertion of the superseded symmetric recipe. **MET.**
- **AC-6** — three entries graduated with dated resolution paragraphs, flight markers stripped in the move, `tests/docs/` green. **MET** (515 passed).
- **AC-7** — impeccable dual gate with P0/P1 fixed or deferred, `lifecycle-layout-e2e.yml` green on the PR. **Gate MET** (this section); CI is the proof and is recorded at merge.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded
