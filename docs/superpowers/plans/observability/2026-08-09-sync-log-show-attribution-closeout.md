# Closeout — sync_log show attribution

Companion to `2026-08-09-sync-log-show-attribution.md`. Records the two steps whose
evidence lives outside the repo: the validation-project apply, and the invariant-8 UI
gate.

## Validation apply

`supabase db push` is blocked on the persistent validation project (Phase-0 history
divergence), so the migration is applied surgically.

| | |
| --- | --- |
| **Migration** | `supabase/migrations/20260809000000_sync_log_show_attribution.sql` |
| **Applied** | 2026-08-10, project `vzakgrxqwcalbmagufjh` |
| **Target proof** | `pg_control_system().system_identifier` = `7642734024280108049`, read BEFORE any DDL, matching `VALIDATION_SYSTEM_IDENTIFIER` (`tests/db/_validationTargetIdentity.ts:17`) |
| **psql exit** | `0`, run with `-v ON_ERROR_STOP=1` |
| **Statements** | `CREATE INDEX` ×2, `DO` (dev guard, no-op — validation has no `dev` schema), `CREATE FUNCTION`, `REVOKE`, `GRANT`, `DO` (cron schedule) |
| **Schema reload** | `notify pgrst, 'reload schema';` → `NOTIFY` |

**Why the identity check and not a hostname.** A pooler hostname identifies neither the
project nor the cluster — another Supabase project can sit behind the same regional
pooler, and its database is also called `postgres`, so neither the host nor
`current_database()` discriminates. `tests/db/_validationTargetIdentity.ts` exists
because a libpq DSN's authority is not its effective target: `?host=` / `hostaddr=` /
duplicate keyword fields override it. The identity fact is the connected cluster's
`system_identifier`, and it is checked **before** `psql -f`, because the parity run
happens after the DDL has already landed and so cannot prevent a wrong-project apply.

**Objects confirmed present on validation after the apply:** 2 indexes, 1 function, 1
cron row.

### The cron row is applied POST-MERGE, and that ordering is deliberate

`pg-cron-validation-parity` asserts snapshot EQUALITY on the validation project's
non-`fxav_cron_` job names against `EXPECTED_NON_FXAV_NON_ORPHAN_CRONS`. That constant
lives in the code, so during a PR that adds a cron row the two sides are momentarily
incompatible: main expects one name, the branch expects two, and whichever state
validation is in, one of them is red. Applying the row immediately turned **main** red.

So the row was unscheduled again (identity-guarded, same `system_identifier` check) and
is re-applied right after the merge, when main's own registry expects it:

```
psql -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL" -f supabase/migrations/20260809000000_sync_log_show_attribution.sql
```

The migration is idempotent — `create index if not exists`, `create or replace function`,
and a self-guarded `cron.unschedule` before `cron.schedule` — so re-running it whole is
the apply, not a special-cased fragment. The indexes and the function stay applied
throughout: `validation-schema-parity` is a SUPERSET check, so extra objects never break
it, and only the cron snapshot is equality-shaped. `pg-cron-validation-parity` is not one
of the twelve required merge contexts, so this branch's own red on that check does not
gate the merge that resolves it.

**Parity gate:** `pnpm vitest run tests/db/validation-schema-parity.test.ts` with
`TEST_DATABASE_URL` exported to the validation DSN — 8 passed. Exported once for the
whole task rather than inlined per command: an inline `VAR=… pnpm …` assignment reaches
only that child process, so the separate `psql` apply would have received an empty
string and fallen back to the local socket, which is exactly how an apply could target
the wrong database while the parity run reported the right one.

## 12 — Invariant-8 UI gate

Task 3c edits three non-API files under `app/`. `AGENTS.md:20` makes those UI surfaces by
LOCATION, not by visual apparency, so the gate applies even though each edit adds a
dependency argument and changes no rendered output:

- `app/admin/dev/actions.ts`
- `app/admin/show/[slug]/_actions/roleToken.ts`
- `app/admin/show/[slug]/_actions/useRaw.ts`

Setup gates ran first: `context.mjs` context load (PRODUCT.md + DESIGN.md), then the
product register (`reference/product.md` — admin tooling, design serves the task).

**impeccable critique** — dual-agent, two isolated sub-agents, not degraded.

**impeccable audit** — dimension scores below.

### The honest reading of a clean detector

`detect.mjs` returned `[]`, exit 0, on all three files. Assessment B did not report that
as a pass. It confirmed `.ts` is in `SCANNABLE_EXTENSIONS`, ran a bracket-path control
(the `[slug]` segment is not eating the argument), and ran a positive control (synthetic
CSS → exit 2, `gradient-text`), then concluded: all 37 rules are CSS/markup/typography
rules, these files carry neither, so **exit 0 is structurally guaranteed here and carries
no UI-quality signal.** It is "not applicable", not "passed" — a guard whose premise is
false where it runs states nothing, and reading it as a pass is the failure this project
already has a rule about.

### Findings and dispositions

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P2 | `app/admin/dev/actions.ts:617` asserted `runManualSyncForShow` "RESOLVES with non-success outcomes rather than throwing". The sink installed three lines below opens its own connection, so a transient DB fault at emit time DOES throw through — a new throw path the comment denied. | **FIXED in-branch.** A diff whose stated point was correcting untrue comments cannot leave a fresh untrue one adjacent to its own edit. |
| 2 | P2 | `useRaw.ts:163` over-claimed: "these failures were written nowhere". False for the RECOVERY outcomes, which `markManualDriveError_unlocked` / `markManualSheetUnavailable_unlocked` already wrote via `recoveryTx.insertSyncLog`. Only the `processOneFile` outcomes were dark. | **FIXED in-branch** — corrected to name which outcomes were actually unwritten. |
| 3 | P2 | A failed observability write can fail the sync it observes: `runScheduledCronSync.ts:2273` awaits `logSync` uncaught, from inside the lock callback (`:3339`, `:3346`), against a sink that opens its own connection. This branch widened the blast radius from two entry points to ten. | **FILED — `BL-SYNC-LOG-EMIT-UNGUARDED`.** Deferral reason (a): needs a product decision the PR cannot settle. Guarding makes an observability outage invisible, which is the exact failure this arc exists to remove; leaving it loud stops syncs on a DB fault. The likely-right middle (guard + a durable `log.error` code) needs a §12.4 code and its own scope. |
| 4 | P3 | Each emit opens and closes a dedicated connection while the per-show advisory lock is held, lengthening lock hold on every manual sync. | **FILED** — folded into the same entry, since reusing the transaction's connection changes the sink's isolation semantics (the row would roll back with a failed sync instead of recording it), which is a behavior decision rather than a refactor. |
| 5 | P3 | Out of scope, flagged not counted: `app/admin/dev/page.tsx:285` renders `— none —` (U+2014) in user-visible copy, against the em-dash ban. Not one of the three target files. | **NOT FILED** — outside this branch's diff; recorded here so a later reader has the pointer. |

### Mechanical invariants (the pre-code checklist, re-verified)

| Check | Result | Evidence |
| --- | --- | --- |
| Em-dash in user-visible copy | PASS | 43 U+2014, all in comments/JSDoc; quote-delimited-literal grep returns zero |
| Apostrophe literals | PASS | zero U+2019 across all three |
| 44px tap targets (`min-h-tap-min`) | n/a | no JSX, zero `className` |
| Canonical type/token classes | n/a | same |
| No raw error codes in user-visible UI (invariant 5) | PASS | `"stale"` / `"conflict"` / `"infra_error"` never reach the DOM — `UseRawControlBoundary.tsx:80` throws the code, and both consumers catch with a bare `catch {` binding no error (`UseRawControl.tsx:426`, `RoleRecognizeControl.tsx:184`); `RoleRecognizeControl` renders off a boolean. `actions.ts` `hardFailCodes` renders raw at `page.tsx:269` but that panel is `requireDeveloper()`-gated developer diagnostics. |
| ESLint on the three files | PASS | exit 0, no output |

### Scores

Critique — Nielsen, scoped to what the diff touches: Visibility of status 3 · Consistency 3 ·
Error prevention 3 · Error recovery 3 · Help/docs 3. Heuristics 2, 3, 6, 7, 8 are n/a
(nothing rendered). AI-slop verdict: not applicable — this is a dependency-injection diff.

Audit — Accessibility n/a · Performance 3 (finding 4) · Responsive n/a · Theming n/a ·
Anti-patterns n/a. Four of five dimensions are structurally inapplicable to markup-free
server actions; scoring them would be the same false-clean the detector reading avoids.

P0 = 0. P1 = 0. Two P2s fixed in-branch, one P2 and one P3 filed, one P3 recorded
out-of-scope.

The marker below reads `dispositions=none`, and that is the guard's own rule rather
than a claim that nothing was dispositioned. `parseMarkers` cross-checks the field
against the counts (`tests/docs/_invariant8Closeout.ts:139-141`): `recorded` is legal
only when `p0 + p1 > 0`, because the field tracks whether P0/P1 findings have
documented dispositions. There are none at that tier. The P2 and P3 dispositions are
in the table above regardless — the marker is a summary of the blocking tier, not of
the whole review. Writing `recorded` here was the first form attempted and the guard
correctly rejected it.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none
