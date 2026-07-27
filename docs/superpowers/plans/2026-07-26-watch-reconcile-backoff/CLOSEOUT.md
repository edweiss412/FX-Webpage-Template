# Watch Reconcile Backoff — close-out record

Branch `feat/watch-reconcile-backoff`. Spec: `docs/superpowers/specs/observability/2026-07-26-watch-reconcile-backoff-v2-design.md` (Codex APPROVE R6). Plan: `00-plan.md` (Codex APPROVE R9).

## §12 Impeccable dual-gate findings + dispositions (invariant 8)

Run 2026-07-27, dual-agent critique (Assessment A design review 31/40; Assessment B detector: zero findings, tokens all house-style) + audit agent, on the full invariant-8 surface of the branch diff (`components/admin/BellPanel.tsx`, `components/admin/settings/DriveConnectionPanel.tsx`, `app/admin/settings/page.tsx`, `app/admin/actions.ts`).

| # | Tier | Finding | Disposition |
|---|---|---|---|
| C1 | P1 | Drive sentence rendered INSIDE the `min-[720px]:justify-between` row: at desk width the buttons were shoved to center, sentence hung right | **FIXED** — sentence moved to a column-flow sibling below the row (`fix(admin)` commit) |
| C2 | P1 | Reconnect count violated the DESIGN.md tabular-figures mandate (bare text; the `<time>` was covered by the global `time` selector but the count was not) | **FIXED** — count wrapped in `span.tabular-nums` on both surfaces, pinned by tests |
| A1 | P1 | `DriveConnectionPanel` is a SERVER component: `toLocaleString(undefined, …)` rendered the SERVER's timezone permanently; `suppressHydrationWarning` inert with no client render | **FIXED** — Settings sentence now renders the wait RELATIVE to the page's injected `now` (`Trying again in 15 min`); spec §3.6 amended in the same commit. Bell keeps absolute local time (client-fetched rows) |
| A2 | P2 | `Date.now()` in the Settings future/past branch bypassed the injected `now` prop (test nondeterminism) | **FIXED** — same change as A1 (formatWaitUntil takes `now`) |
| C3 | P2 | 4px `gap-y-1` made the bell line read as a wrapped fragment of the button row | **FIXED** — `mt-1` added (8px total) |
| C4 | P2 | Missing `min-w-0` on the Drive `<p>` (its sibling helper carries it) | **FIXED** |
| C5 | P2 | Hierarchy: retry-context sentence renders AFTER Retry/Dismiss in DOM/reading order | **DEFERRED** — placement is the spec-ratified shape (§3.6 render contract, w-full last child); reordering would put a conditional line between the actions and their row across every non-watch alert. Revisit only if Doug reports confusion |
| A3 | P3 | Bell line `text-sm` vs row siblings' `text-[13px]` | **DEFERRED** — classes are the spec-ratified copy of the auto-resolve note's typography (`text-sm text-text-subtle`), the closest semantic sibling |
| A4 | P3 | Unparseable ISO minted an invalid `dateTime` attribute | **FIXED** — bell renders the raw string without a `<time>` wrapper on NaN parse |
| C6 | P3 | Copy register: "Trying again at…" subjectless vs neighboring full sentences | **DEFERRED** — §3.6 canonical literal, matches the auto-resolve note's fragment register in the same cell |

Convergence: after the fix commits, BOTH gates re-ran against the resulting diff (detector exit 0; audit fix-verifications confirmed; full `tests/components` + `tests/app` green, typecheck clean).

## Notes for reviewers

- **Pre-existing parallel-run flake, not this diff:** running `tests/components/admin/settings` + `tests/app` in ONE vitest invocation intermittently times out unrelated dashboard suites (5s timeouts under parallel load; duplicate-h1 from a leaked render). Reproduced on origin/main tree at HIGHER failure counts (9 vs 3–5). Each directory green in isolation; CI runs the projects separately.
- **Pre-existing, not this diff (baseline-verified on origin/main @ 6a11b4a3f):** running `tests/cross-cutting/pg-cron-coverage.test.ts` and `tests/cross-cutting/pgCronCiVacuity.test.ts` in ONE local vitest invocation reports a suite-level FAIL on pg-cron-coverage carrying the vacuity harness's injected child env (`CI=true`, dead-DB `127.0.0.1:59999`). Reproduced identically on the origin/main baseline worktree. pg-cron-coverage passes in isolation on this branch (8/8, including the live SAMPLING_PERIOD_MS / cron.job parity cases against the rescheduled local DB). Real CI partitions these; CI is the adjudicator.
- The §3.7 cadence-copy sweep dispositions (incl. frozen dated artifacts) live in the spec; re-grep at close-out returned zero undispositioned watch-relevant hits.

## Class-21 live validation probe (2026-07-27)

- Both migrations applied surgically to `vzakgrxqwcalbmagufjh` + `notify pgrst, 'reload schema'` (the reschedule needed the session GUC `set app.fxav_vercel_url = 'https://fxav-crew-pages-validation.vercel.app'` — the pooler connection does not carry a database-level GUC, and none is set there).
- `select public.watch_backoff_ms(3)` → `3600000` on validation.
- `cron.job` shows `fxav_cron_refresh_watch` at `7,22,37,52 * * * *`.
- `pnpm observe watch --env validation --json`: newest channel `createdAt 2026-07-27T02:00:02 / expiresAt 2026-07-28T02:00:02` (24h lease); the historical hourly-churn rows end at the lease-slack deploy; no 15-minute churn. Zero `drive_watch_reconcile_state` rows yet (no reconnect attempt has occurred), so the CLI emits the legacy array shape by design — the state table read executed against validation without error.
