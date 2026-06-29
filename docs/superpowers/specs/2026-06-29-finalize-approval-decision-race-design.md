# Finalize Approval-Decision Race — Design Spec

**Status:** Draft → self-review → Codex adversarial-review (autonomous-ship; user-review gates waived per AGENTS.md brainstorming gate, user approved 2026-06-29).
**Scope:** Backend-only, single file (`app/api/admin/onboarding/finalize/route.ts`) + one new test file. No schema change, no new RPC, no new advisory-lock holder, no new §12.4 error code.
**Backlog item closed:** `BL-FINALIZE-APPROVAL-DECISION-RACE` (BACKLOG.md).

---

## 1. Problem

`finalize` decides each row's fate (publish vs Hold vs skip) from approval columns read at **select** time, BEFORE it takes that row's per-show advisory lock. A concurrent approve/unapprove that commits **after** the select but **before** finalize acquires the lock makes finalize act on **stale checkbox intent**: a row Doug just unchecked can publish (go Live), or a row he just checked can be created Held.

### 1.1 The two holders of the same `show:` lock

- **finalize:** `selectFinishableCleanRows` runs in the **outer** `deps.withTx` with **no lock** (`finalize/route.ts:372`), reading every decision column up front. Each row is then processed in `defaultWithRowTx`, which takes `pg_advisory_xact_lock(hashtext('show:' || driveFileId))` (`finalize/route.ts:176`).
- **approve / unapprove:** both serialize on the **same** `show:` key via `withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false })` (`staged/[…]/approve/route.ts:60`, `staged/[…]/unapprove/route.ts:45`), which resolves to `hashtext('show:' || $1)` (`lib/sync/lockedShowTx.ts:59,61`).

### 1.2 The window

```
finalize: selectFinishableCleanRows  ← reads wizard_approved=true (outer tx, NO lock)
                                       approve/unapprove commits here  ← flips wizard_approved
finalize: defaultWithRowTx acquires show: lock
finalize: processApprovedRow  ← acts on the STALE select-time wizard_approved
```

### 1.3 Why the existing §5.6 re-read does NOT catch it

The merged agenda feature added a locked re-read at `finalize/route.ts:769`, but it selects **only `parse_result`**:

```sql
select parse_result from public.pending_syncs
 where wizard_session_id=$1 and drive_file_id=$2 and staged_id=$3 and staged_modified_time=$4
```

and rebuilds the row as `const rereadRow = { ...row, parse_result: freshRead.rows[0].parse_result }` (`finalize/route.ts:791`) — so **every approval column still comes from the stale select**. Approve/unapprove change approval columns **without bumping `staged_modified_time`** (verified: approve writes `wizard_approved`, provenance, choices, `last_finalize_failure_code=null` — `approve/route.ts:133-147`; unapprove nulls the five approval columns — `unapprove/route.ts:73-79`; neither touches `staged_modified_time`), so the generation-scoped WHERE still matches the same row and the re-read returns it with the *new* approval columns that finalize then **ignores**.

### 1.4 Pre-existing

Verified at the agenda feature's merge-base: finalize always used select-time approval columns with no locked re-read. The agenda feature added the `parse_result`-only re-read; it did not introduce or worsen this race.

---

## 2. The decision columns at risk

`selectFinishableCleanRows` selects these columns (`finalize/route.ts:376-381`) into `PendingFinalizeRow` (type at `:96-113`):

| column | in `PendingFinalizeRow`? | mutated by approve | mutated by unapprove | drives |
|---|---|---|---|---|
| `wizard_approved` | yes (`:105`) | → `true` | → `false` | the 4-branch checked/unchecked split + `publish_intent` |
| `wizard_approved_by_email` | yes (`:108`) | → admin | → `null` | first-seen audit provenance (checked) |
| `wizard_approved_at` | yes (`:111`) | → `now()` | → `null` | applied-at instant (checked) |
| `wizard_reviewer_choices` | yes (`:106`) | → synthesized | → `null` | reviewer choices (checked) |
| `wizard_reviewer_choices_version` | yes (`:107`) | → `1` | → `null` | version gate (checked) |
| `last_finalize_failure_code` | **NO** — used only in the selector WHERE (`:390`), never read into the row | → `null` | (untouched) | finishable predicate |

`last_finalize_failure_code` is **not** currently a `PendingFinalizeRow` field (the type ends at `base_modified_time`, `:113`); the selector references it only in its WHERE. The widened re-read (§3.1) **adds** it to the re-read result specifically so the finishable re-validation (§3.2) can read the locked value.

`staged_id`, `staged_modified_time`, `triggered_review_items`, `base_modified_time` are **not** mutated by approve/unapprove within a generation (generation = fixed `(staged_id, staged_modified_time)`); they stay sourced from the select-time `row`. `parse_result` is already re-read for the agenda case and must continue to be.

---

## 3. Design

Extend the existing generation-scoped locked re-read from `select parse_result` to a **full decision-row re-read**, **move it to the top of `processApprovedRow`** (before the version gate, so the authoritative locked decision row exists before any decision is taken), and drive every checked/unchecked branch from the **locked** values.

### 3.0 Reorder: the re-read runs FIRST (resolves the version-gate ordering bug)

Today the order inside `processApprovedRow` is: version gate (`:702-715`, reads `row.wizard_approved` + `row.wizard_reviewer_choices_version`) → Drive metadata fence (`:717-753`) → locked re-read (`:769`) → `coercedRow` (`:806`) → 4-branch (`:843+`). The version gate runs **before** the re-read, so it currently keys on **stale** select-time values, and `coercedRow` does not yet exist there.

**Move the full-decision locked re-read + `rereadRow` + `coercedRow` construction to the very top of `processApprovedRow`** (immediately after `const { row, wizardSessionId, tx } = input;` at `:697`), so the order becomes:

1. **locked full-decision re-read** (§3.1) → 0 rows → existing generation-stale demote (`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`)
2. build `rereadRow` + `coercedRow` from locked values
3. **finishable re-validation** (§3.2) → non-finishable → typed per-row skip
4. **version gate** keyed on `coercedRow` (§3.3)
5. Drive metadata fence (unchanged — uses `row.drive_file_id` / `row.staged_modified_time`, both immutable)
6. `parsedItems` + the 4-branch (`coercedRow`)

The Drive fence reads only immutable columns off `row`, so moving the DB re-read above it is safe and slightly more efficient (a generation-superseded row is demoted before the Drive call). The re-read's WHERE params (`row.staged_id`, `row.staged_modified_time`) are immutable, so they are correct at the top.

### 3.1 The locked re-read (widen + relocate; replaces `finalize/route.ts:769-794`, moved per §3.0)

```sql
select parse_result,
       wizard_approved,
       wizard_reviewer_choices, wizard_reviewer_choices_version,
       wizard_approved_by_email, wizard_approved_at,
       last_finalize_failure_code
  from public.pending_syncs
 where wizard_session_id = $1::uuid
   and drive_file_id     = $2
   and staged_id         = $3::uuid
   and staged_modified_time = $4::timestamptz
```

- **Generation-scoped** (unchanged): the `(staged_id, staged_modified_time)` predicate means a mid-flight **rescan** that replaced the row (new `staged_id` or `modified_time`) returns 0 rows → the existing stale demote path (`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`) fires (`finalize/route.ts:777-789`, now relocated to the top). **Unchanged.**
- **Single SELECT** so all decision columns are mutually consistent under the lock (a half-applied approve cannot be observed — approve/unapprove each commit atomically while holding the same `show:` lock).
- `rereadRow` is rebuilt as `{ ...row, <each re-read column> }` so the immutable columns (`staged_id`, `staged_modified_time`, `triggered_review_items`, `base_modified_time`) stay from `row` and the decision columns + `parse_result` + `last_finalize_failure_code` come from the locked read. `PendingFinalizeRow` gains a `last_finalize_failure_code: string | null` field (it is consumed by §3.2 only, never written by finalize's apply path).

### 3.2 Re-validate the finishable predicate against locked values

After the re-read, re-check the approval-column part of the finishable predicate that `selectFinishableCleanRows` used (`finalize/route.ts:390`):

```
finishable = (lockedRow.wizard_approved === true) || (lockedRow.last_finalize_failure_code == null)
```

If **not** finishable, route to a **typed per-row skip** reusing `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` (no new §12.4 code) — demote + return the per-row code, exactly like the existing generation-stale branch. **No publish, no Held, on stale intent.**

**The full selector predicate also gates on manifest status** `m.status in ('staged','applied')` (`finalize/route.ts:385,390`). The locked re-read is `pending_syncs`-only and does **not** re-read manifest status, because every concurrent writer leaves the manifest in-set: approve → `applied` (`approve/route.ts:176-177`), unapprove → `staged` (`unapprove/route.ts:102-103`), rescan-demote → `staged`. So re-validating the approval-column part against the locked `pending_syncs` row is sufficient; the manifest component cannot flip the row out of the finishable set via any concurrent path. (Stated explicitly so the reviewer does not read §3.2's two-term predicate as the *whole* selector predicate.)

**Reachability of the non-finishable skip:** the non-finishable combo is `wizard_approved=false AND last_finalize_failure_code IS NOT NULL`. This is **NOT** unreachable — `last_finalize_failure_code` is written by finalize's own `demotePending` (`finalize/route.ts:444`) **and** by the per-sheet re-scan flow (`lib/onboarding/rescanWizardSheet.ts:367-370`, DIRTY branch: `wizard_approved=false` + `last_finalize_failure_code=RESCAN_REVIEW_REQUIRED`). Re-scan **also holds the same `show:` lock** (`rescanWizardSheet.ts:269`). So a concurrent rescan-demote that commits before finalize's locked re-read, leaving the same generation, yields a locked row that is genuinely non-finishable (the operator just re-scanned; it must go back to review, not publish). The skip is therefore **load-bearing**, not dead code — it correctly diverts such a row to the per-row skip instead of publishing/Holding stale intent. (The approve/unapprove vector *specifically* cannot produce this combo: the CHECK constraint `pending_syncs_approved_requires_full_payload` requires `wizard_approved=true → last_finalize_failure_code IS NULL` — `supabase/migrations/20260518010444_pending_syncs_last_finalize_failure_code.sql:23-30` — and unapprove never sets a failure code. So an approve→checked locked row always has `failure_code=null`, and an unapprove→unchecked locked row keeps `failure_code` whatever it was, which was `null` for a finishable-clean row.) Asserted by §8.4.

### 3.3 Drive every branch from the locked values

After the §3.0 reorder, `coercedRow` (`asParseResult` + `coerceJsonbArray` overlaid on `rereadRow`, currently `finalize/route.ts:806-810`) is constructed at the **top** of `processApprovedRow`, so it is in scope for every decision read, including the relocated version gate. Re-point the **six direct `row.<decisionCol>` reads** to `coercedRow`:

| current line | current | change to |
|---|---|---|
| `:704` (version gate; **moves** below the re-read per §3.0) | `row.wizard_approved && row.wizard_reviewer_choices_version !== …` | `coercedRow.wizard_approved && coercedRow.wizard_reviewer_choices_version !== …` |
| `:846` | `if (row.wizard_approved)` (existing-show split) | `if (coercedRow.wizard_approved)` |
| `:892` | `appliedByEmail = row.wizard_approved ? …` | `coercedRow.wizard_approved` |
| `:895-896` | `appliedAt = row.wizard_approved ? normalizeTimestamptz(row.wizard_approved_at) : …` | `coercedRow.wizard_approved` / `coercedRow.wizard_approved_at` |
| `:898` | `reviewerChoices = row.wizard_approved ? … : …` | `coercedRow.wizard_approved` |
| `:962` | `recordCreatedShowProvenance(…, row.wizard_approved)` | `coercedRow.wizard_approved` |

`stageExistingShowShadow` already receives `coercedRow` (`finalize/route.ts:850`) and reads `requireApprovedByEmail(row)` / `row.wizard_reviewer_choices` / `row.wizard_approved_at` off **its** param (`:607-611`) — so it picks up locked values automatically once `coercedRow` carries them. `requireApprovedByEmail` reads `wizard_approved_by_email` off whatever row it is handed (`:242-246`); it is called with `coercedRow` (`:893`), so it gets the locked email. The `parsedItems` parse from `row.triggered_review_items` (`:812-814`) stays from `row` (immutable within a generation; approve/unapprove never touch it).

**Net:** after the change, no decision column is read off the select-time `row` inside `processApprovedRow`; all flow from `coercedRow` (the locked re-read).

### 3.4 What this fixes (the two real transitions)

| transition | locked row | finishable? | re-driven as | outcome |
|---|---|---|---|---|
| **checked → unchecked** (concurrent unapprove) | `wizard_approved=false`, `last_finalize_failure_code=null` | yes (`false OR null-is-null`) | unchecked | existing-show D10 NO-OP / first-seen **Held** — the unchecked intent is honored, NOT published |
| **unchecked → checked** (concurrent approve) | `wizard_approved=true` | yes | checked | **published** — the checked intent is honored |

No demote is needed for either; the rows stay finishable and are simply re-driven from locked values. This is the key correctness argument the BACKLOG flagged ("a naive demote-on-change interacts badly with the predicate"): we **do not demote** on an approval change — we re-drive.

---

## 4. Guard conditions / edge cases

- **Re-read returns 0 rows** (rescan replaced the generation): existing stale demote (`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`). Unchanged from current behavior.
- **`wizard_approved=true` but `wizard_reviewer_choices_version !== REVIEWER_CHOICES_VERSION`** in the locked row: the existing version-gate demote (`finalize/route.ts:702-715`, `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED`) fires — now keyed on the **locked** version, which is correct (a row re-checked concurrently carries a fresh version=1; a row whose choices are genuinely unsupported is still demoted).
- **`wizard_approved=true` but `wizard_approved_by_email=null`** in the locked row: `requireApprovedByEmail(coercedRow)` throws (`:243`) → the route's never-empty-500 wrapper. This is corrupt-by-construction (the approve route always writes the email with `wizard_approved=true`, enforced by CHECK `pending_syncs_approved_requires_full_payload`), so a throw is the correct typed-500, unchanged in spirit from today.
- **postgres.js types:** `wizard_approved_at` comes back as a JS `Date`; `normalizeTimestamptz` already wraps every read of it (`:896`). `wizard_reviewer_choices` is jsonb → `coerceJsonbArray` already wraps it (`:809`). `last_finalize_failure_code` is `text | null` — compared with `== null` (covers SQL NULL → JS `null`). No new type-coercion surface.
- **Non-DB-touching columns unchanged:** `display_name` (added by #183 post-return, `:133`) is computed outside `processApprovedRow` from the per-row result; untouched.

---

## 5. Non-goals (explicit)

- **No client-side gating** of the Step-3 Finish button. The server-side locked re-read fully closes the race; client gating adds the impeccable invariant-8 UI dual-gate for no additional correctness. (User chose server-only, 2026-06-29.)
- **No new advisory-lock holder.** The re-read runs inside the **already-held** `show:` lock from `defaultWithRowTx` (`:176`); `adoptShowLockHeld` asserts-only (no acquire). The advisory-lock single-holder topology is **unchanged** — no edit to `tests/auth/advisoryLockRpcDeadlock.test.ts` is required, but the plan will confirm the topology is unchanged.
- **No schema change, no migration, no validation-project apply.**
- **No new §12.4 code** (reuses `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`), so no 3-way catalog lockstep and no x1 gate interaction.

---

## 6. Meta-test inventory

Per AGENTS.md, declare which structural meta-tests this change creates/extends:

- **Advisory-lock topology** (`tests/auth/advisoryLockRpcDeadlock.test.ts`): **unchanged** — no new lock holder (the re-read rides the existing `show:` lock). Declared, not edited.
- **Supabase call-boundary** (`tests/auth/_metaInfraContract.test.ts`): **N/A** — the re-read is a raw `tx.query` inside the existing finalize tx adapter (not a Supabase client call); no new helper subject to the `{data,error}` contract.
- **Catalog completeness** (`tests/messages/catalog.test.ts`): **N/A** — no new error code.
- **No new meta-test created.** The race is pinned by a behavioral test (§8), which is the appropriate guard for a logic change of this shape.

---

## 7. Watchpoints (disagreement-loop preempts for the reviewer)

- **The non-finishable skip (§3.2) is load-bearing, NOT dead code** — it is reachable via a concurrent **rescan-demote** (which holds the same `show:` lock and writes `last_finalize_failure_code` with `wizard_approved=false`, `rescanWizardSheet.ts:269,367-370`). The approve/unapprove vector specifically cannot produce the combo (CHECK `pending_syncs_approved_requires_full_payload`). Do not relitigate it as dead code, and do not relitigate the corrected reachability claim.
- **"Why not demote on approval change?"** — answered in §3.4: the two real transitions stay finishable; demoting would interact badly with the `wizard_approved=true OR last_finalize_failure_code is null` predicate (BACKLOG note). We re-drive, not demote.
- **`staged_modified_time` is intentionally NOT bumped by approve/unapprove** — this is why the generation-scoped re-read alone (parse_result-only) could not catch the race; the fix is the column-set widening, not a generation-key change. Do not propose bumping `staged_modified_time` on approve (it would spuriously invalidate the agenda generation guard).
- **Single SELECT, not per-column reads** — all decision columns must come from one re-read row for mutual consistency; do not split.

---

## 8. Test plan (TDD)

New file `tests/onboarding/finalizeApprovalRace.test.ts`, modeled on the FakeRaceDb harness in `tests/app/admin/finalizeAgendaRace.test.ts` (which already carries every decision column on its `PendingRow` and already special-cases the locked re-SELECT). The harness's re-SELECT handler is widened (matching the §9 update to the existing handlers) and configured so the re-SELECT returns decision columns that **differ** from the outer `selectFinishableCleanRows` result. The three existing-test handler updates (§9) must land in the same commit as the route change, or the existing finalize/agenda-race/revalidate suites break on the widened SQL.

- **8.1 checked→unchecked (unapprove wins the race):** outer select returns `wizard_approved=true`; locked re-read returns `wizard_approved=false, last_finalize_failure_code=null`. Assert: existing-show path → **D10 NO-OP** (manifest `applied`, `publish_intent=false`, NO shadow INSERT); first-seen path → created **Held** (`recordCreatedShowProvenance` called with `false`, `publish_intent` not flipped). The row is **not** published. *Failure mode caught:* finalize publishing a just-unchecked row.
- **8.2 unchecked→checked (approve wins the race):** outer select returns `wizard_approved=false`; locked re-read returns `wizard_approved=true` + email + choices + version=1. Assert: checked path → shadow INSERT (existing-show) / `publish_intent` stamped `true` (first-seen), provenance uses the **locked** approver email + applied-at. *Failure mode caught:* finalize Holding a just-checked row.
- **8.3 negative regression (no concurrent change):** outer select and locked re-read identical (`wizard_approved=true`). Assert checked path with the same values — proves the re-read is *used* and 8.1/8.2 are not passing by accident of always reading one source. (Anti-tautology: 8.1/8.2 assert against the **re-read** values; this proves the non-race case is unaffected.)
- **8.4 defensive non-finishable skip:** locked re-read returns `wizard_approved=false, last_finalize_failure_code='SOME_CODE'` (non-finishable). Assert: typed per-row skip (`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`), demote called, NO shadow INSERT, NO first-seen apply, NO publish. *Failure mode caught:* a row that became non-finishable under the lock being published/Held on stale intent.
- **8.5 locked email provenance:** in the 8.2 checked first-seen path, assert the audit provenance email is the **locked** `wizard_approved_by_email`, not the outer-select email (set them to different values). *Failure mode caught:* provenance attributed to a stale approver.

Each test derives its expected outcome from the configured re-read values, never a hardcoded constant. Negative-regression discipline: an implementation that ignores the widened re-read (reads decision columns off the outer-select `row`) fails 8.1, 8.2, and 8.5.

---

## 9. Files touched

- `app/api/admin/onboarding/finalize/route.ts` — move the locked re-read to the top of `processApprovedRow` (§3.0), widen its SELECT + add `last_finalize_failure_code` to `PendingFinalizeRow` (§3.1), add the finishable re-validation (§3.2), re-point six `row.<decisionCol>` reads to `coercedRow` (§3.3). ~35 lines net.
- `tests/onboarding/finalizeApprovalRace.test.ts` — **new** (§8.1-8.5).
- **`tests/app/admin/finalizeAgendaRace.test.ts`** — update the fake-DB re-read handler at `:232` (matches `select parse_result from public.pending_syncs where wizard_session_id`) so it still matches the **widened** SELECT and returns the new decision columns. Without this, the widened SQL falls through to `FakeRaceDb`'s "unhandled SQL" throw and the existing agenda-race tests break.
- **`tests/onboarding/finalize.test.ts`** — update the re-read handler(s) at `:255` and `:286` (same prefix-match break).
- **`tests/onboarding/finalizeRevalidate.test.ts`** — update the re-read handler at `:209` (same prefix-match break).

No `supabase/` (no schema change — `last_finalize_failure_code` already exists on the table), no `lib/messages/` (no new code), no `DESIGN.md`, no UI. The three existing-test updates are **mechanical handler-string widening**, not behavior changes; each existing assertion stays as-is.
