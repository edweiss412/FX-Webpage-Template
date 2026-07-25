# Plan — Secondary-name Drive-ID nonblank CHECKs + minimal coverage guard

**Spec:** `docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md`
(APPROVE at adversarial round 7; 45 findings across R1–R6, all accepted)
**Branch:** `fix/secondary-drive-id-nonblank` · **Implementer:** Opus / Claude Code

The spec is canonical. Where this plan and the spec disagree, the spec wins.

**Revision:** plan-review R1 returned BLOCKING with 10 findings, all accepted. The task ORDER changed
as a result — probes now precede the local apply so they can genuinely go RED, and the validation apply
is inside the task whose test it turns green. §"What R1 changed" records the rest.

---

## Declared applicability (per `docs/agents/writing-plans.md`)

| mandatory rule | applies? |
| -------------- | -------- |
| **Advisory-lock holder topology** | **N/A.** No task touches `pg_advisory_xact_lock` / `pg_advisory_lock`; verified by grep across every file this plan modifies. Pure DDL plus read-only introspection. |
| **Layout-dimensions task** | **N/A.** No UI surface. Invariant 8's impeccable dual-gate does not fire. |
| **Transition-audit task** | **N/A.** No component, no visual state. |
| **Meta-test inventory** | Declared below. |
| **e2e harness-readiness checklist** | **N/A.** No Playwright spec added or modified. |
| **`echo >>` discipline** | Applies to T6 — use `Edit`/`Write`, never `echo >>`. |

### Meta-test inventory

**CREATES:** none. T4's guard is an ordinary DB test, not a structural meta-test over the source tree.

**EXTENDS:** `tests/db/schema.test.ts` (T2) · `tests/db/driveFileIdNonblank.db.test.ts` (T3) ·
`tests/db/validation-schema-parity.test.ts` (T5).

**SUBJECT TO:** `tests/db/_metaLocalDbUrlGuard.test.ts` — its structural half AST-scans every
`tests/db/` file reading `process.env.LOCAL_TEST_DATABASE_URL` and requires `assertLocalDbUrl`
(scan key at `tests/db/_localDbUrlScan.ts:29`). T4's suite reads that variable and must route through
it. Invariant 9 (`tests/auth/_metaInfraContract.test.ts`) **N/A** — no Supabase client call added.
Invariant 10 **N/A** — no HTTP route, no `"use server"` action.

---

## Shell preamble (used by every task below)

R1 finding 4: `$LOCAL` was undefined and `$TEST_DATABASE_URL` unguarded. Every DB command in this plan
is run after this preamble, which fails loudly rather than falling through to libpq defaults:

```bash
LOCAL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$LOCAL" -v ON_ERROR_STOP=1 -qAtc 'select 1' >/dev/null \
  || { echo "FATAL: local Supabase unreachable at 127.0.0.1:54322"; exit 1; }
```

For any validation-targeted command:

```bash
: "${TEST_DATABASE_URL:?FATAL: TEST_DATABASE_URL unset — refusing to fall through to libpq defaults}"
```

Every `psql` invocation in this plan carries `-v ON_ERROR_STOP=1`, including the validation ones.

---

## Reconciliation sweeps — RUN at plan time

**Sweep A — the section to graduate (T6).** Corrected per R1 finding 10: the entries end at line 335,
but the section's trailing `---` separator is at line 337 of the root backlog queue. The movable range
is **321–337**.

```
$ grep -n "BL-OPENING-REEL-DRIVE-ID-NONBLANK\|BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK\|Secondary-name Drive-ID" ./BACKLOG.md
321:## Secondary-name Drive-ID columns — deferred from the drive_file_id nonblank CHECK (2026-07-02)
325:### BL-OPENING-REEL-DRIVE-ID-NONBLANK — nonblank CHECK on `shows.opening_reel_drive_file_id`
331:### BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK — nonblank CHECK on `wizard_finalize_checkpoints.last_processed_drive_file_id`
$ sed -n '337p' ./BACKLOG.md
---
```

**Sweep B — archive conventions.** `BACKLOG-archive.md:1-8`: order follows the original BACKLOG.md
layout, not resolution date; ids preserved verbatim. Entries are inserted at their layout position with
a resolution note appended.

**Sweep C — insertion point.** `tests/db/schema.test.ts:260-340` is the existing
`describe("drive_file_id nonblank CHECK migration", …)`; the next block starts at
`tests/db/schema.test.ts:342`. The new `describe` goes between.

**Sweep D — every count-bearing site in this class.** R1 finding 7: the first pass found only the two
assertions and missed three companion sites, one of which is a failure message asserting "exactly 14".
Complete list, each with its disposition:

| site | current | disposition |
| ---- | ------- | ----------- |
| `tests/db/driveFileIdNonblank.db.test.ts:24` | comment "All 14 public columns…" | → 15 (T3) |
| `tests/db/driveFileIdNonblank.db.test.ts:135` | test title "all 14 public *_…_nonblank…" | → 15 (T3) |
| `tests/db/driveFileIdNonblank.db.test.ts:147` | `expect(...length).toBe(14)` | → 15 (T3) |
| `tests/db/validation-schema-parity.test.ts:235-236` | comment "`14` is the spec §10 canonical public count" | → 17 (T5) |
| `tests/db/validation-schema-parity.test.ts:237` | assertion + message "exactly 14 public CHECK names" | → 17, **message included** (T5) |
| `tests/db/schema.test.ts:277` | historical: the parent migration's own 12+2 | **unchanged** — describes 20260702120200 |
| `supabase/migrations/20260702120200_…sql` header | historical scope comment | **unchanged** |

---

## Tasks

TDD per task: failing test → minimal implementation → passing test → commit. One task, one commit.
Update the ship-state marker's `tasksRemaining` / `next` in the same beat as each commit.

**Two tasks are honestly NOT test-driven** (R1 finding 2): T6 is a docs move and T7 is a verification
gate that produces no tracked change. They are labelled as such rather than dressed in a fake
RED/GREEN cycle, and T7 carries no commit.

### T1 — the pure auditor  *(TDD)*

**RED** — the DB-free auditor unit-test file (spec §0). One test per branch. Note the type carries a
`name` field (R1 finding 5: the previous draft's `DriveIdConstraint` had no `name`, which made two of
these cases unrepresentable — the field exists for diagnostics AND to make these tests possible, while
coverage matching still ignores it):

```ts
export type DriveIdConstraint = { schema: string; table: string; name: string; definition: string };
```

| branch | failure mode it catches |
| ------ | ----------------------- |
| nullable column + `IS NULL OR` form | the nullable CHECK shape is not recognized |
| NOT NULL column + bare form | the bare CHECK shape is not recognized |
| **nullable column + bare form** | nullability wrongly required to match form (§1.1 item 3) |
| **NOT NULL column + `IS NULL OR` form** | the other half of that cross-product (R1 finding 6 — one "other form" case leaves one combination untested) |
| uncovered | a column with no CHECK reported covered — the core false negative |
| name is `…_nonblank`, definition is `CHECK (true)` | a renamed-but-weakened constraint counts as coverage |
| right definition, **different table**, same column name | `shows.drive_file_id`'s CHECK satisfies `sync_log.drive_file_id` |
| **same constraint NAME, different table**, weak definition | matching by name instead of tuple+definition (§3.1.3) |
| exemption with reason | a legitimate exemption still reports a finding |
| exemption, empty/whitespace reason | an unexplained exemption passes silently |
| exemption, now covered | a stale exemption survives the repair and blinds that column forever |
| exemption, column absent | a dropped column leaves a live exemption |
| duplicate exemption key | two rows for one column, one stale |

**GREEN** — the auditor module (spec §0) with the §4.1 types and
`DRIVE_ID_COVERAGE_EXEMPTIONS: CoverageExemption[] = []`.

Anti-tautology: assertions are on `CoverageFinding[]` contents (kind + identifying tuple), never on
length alone and never on "the function was called."

Commit: `feat(db): add the Drive-ID coverage auditor`

### T2 — write the migration (file only, not applied)  *(TDD)*

**RED** — new `describe` in `tests/db/schema.test.ts` after `tests/db/schema.test.ts:340` (Sweep C),
statically parsing the migration file. Fails because the file does not exist:

- all four constraints as `drop constraint if exists <name>` then `add constraint <name> check (…)`
- the dev block uses `alter table if exists dev.shows` — mandatory `if exists`, same rationale as
  `tests/db/schema.test.ts:299-301` (a bare form errors on validation; a test accepting it ships that)
- the file opens `begin;` and closes `commit;`
- **AC-13 negative assertion** (R1 finding 9: "clean twice" does NOT imply it): the migration body
  contains no `_allowed_watermark_columns` insert. Asserted lexically over the file.
- **AC-12**: walk ALL of `supabase/migrations/`, assert every `add constraint <name>` ≤ 63 bytes

**GREEN** — write the migration per spec §3; U3's constraint is
`wizard_finalize_checkpoints_drive_file_id_nonblank` (50 bytes, suffix intact per §1.1 item 2).

**On the transaction wrapper:** the plan does NOT attempt to prove all-or-nothing empirically. R1
finding 3 showed the previous probe was invalid three ways (the appended failing statement ran after
the file's own `commit;`; `CHECK (false)` does not fail on an empty table; the constraints already
persisted from earlier applies). Postgres's transactional DDL is a documented engine guarantee, not
this repo's behavior to re-derive — the static assertion that the file opens `begin;` and closes
`commit;` is what this plan owns.

Commit: `feat(db): add nonblank CHECKs to the four uncovered Drive-ID columns`

### T3 — behavioral probes, THEN apply locally  *(TDD — order is load-bearing)*

R1 finding 2: in the previous draft T2 applied the migration, so these probes could never go RED. The
apply now lives here, after the probes are written and observed failing.

**RED** — extend `tests/db/driveFileIdNonblank.db.test.ts`. The local DB does not yet have the new
constraints, so every new probe fails on its `expectRejected` (the blank insert succeeds).
Insert shapes, verified against live DDL:

- `public.shows` — extend the existing insert with `opening_reel_drive_file_id`
- `public.wizard_finalize_checkpoints` — `(wizard_session_id uuid NOT NULL, last_processed_drive_file_id)`;
  `id` / `batches_completed` / `status` have defaults
- `public.onboarding_rebuild_attempts` — `(wizard_session_id uuid NOT NULL, drive_file_id NOT NULL)`;
  `attempts` / `escalation_logged` / `updated_at` have defaults
- `dev.shows` — mirror of the public `shows` shape

Each rejects `""`, `"   "`, `"\t"` with SQLSTATE 23514 and accepts a valid id; the three nullable ones
also accept `NULL`. Reuse `expectRejected` / `expectAccepted` so every probe rolls back (AC-2).

Apply Sweep D's three `driveFileIdNonblank` rows here (comment `tests/db/driveFileIdNonblank.db.test.ts:24`, title `tests/db/driveFileIdNonblank.db.test.ts:135`,
assertion `tests/db/driveFileIdNonblank.db.test.ts:147`).

**GREEN** — apply the migration locally, twice (AC-1 idempotency, AC-13 clean apply under the
`ddl_command_end` trigger):

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/<the migration>
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/<the migration>
```

Commit: `test(db): behaviorally prove the four new nonblank CHECKs reject blanks`

### T4 — the coverage guard suite  *(TDD)*

Two assertions, and R1 finding 1 corrected the rationale for both — the earlier draft said "if the
negative control passes before the audit exists, the audit is vacuous," which is backwards: a vacuous
auditor returning `[]` makes the negative control **fail**. That is exactly why it drives the
implementation.

1. **Production assertion** — `auditDriveIdCoverage(live census, live constraints, exemptions)` equals
   `[]` against the untouched schema. This is the regression guard that goes red when a future
   uncovered column lands. It passes as soon as T3's apply is in place; it is not what drives T4.
2. **Negative control** — inside a transaction: drop `shows_opening_reel_drive_file_id_nonblank`, run
   the audit, assert exactly one `uncovered` finding for
   `public.shows.opening_reel_drive_file_id`, roll back. **This is the RED**: against a stub auditor
   returning `[]` it fails, and it keeps failing until the auditor genuinely reads live constraints.

**GREEN** — the census-query module and local-DB guard suite (spec §0):

- one explicit transaction, one connection, `set local search_path = pg_catalog, public`, asserting
  `current_setting('search_path')` inside it before trusting any rendering (AC-7)
- predicate `~ 'drive_file_id'` — **never `LIKE`** — joined to `information_schema.tables` on
  `table_type = 'BASE TABLE'`, schemas `('public','dev')` (AC-5); a unit test pins `driveXfileYid` out
  of scope
- two canaries: `public.shows.drive_file_id` and `public.sync_log.drive_file_id` still render as the
  two module-constant templates (AC-8) — the canaries CHECK the constants, never derive them
- `assertLocalDbUrl` on `LOCAL_TEST_DATABASE_URL` (required by `_metaLocalDbUrlGuard`'s structural half)
- **CI fail-not-skip** (AC-6): skip only when `process.env.CI` is unset; under CI a failed probe throws,
  naming the redacted host and the underlying error. A unit test proves the CI branch throws.

Commit: `feat(db): fail CI when a Drive-ID column lands without a nonblank CHECK`

### T5 — validation parity: update the test, then apply to validation  *(TDD)*

R1 finding 2: previously the test change and the validation apply were in different tasks, so with
`TEST_DATABASE_URL` set the test committed red. They are one task now, RED before GREEN.

**RED** — change `tests/db/validation-schema-parity.test.ts:223-285` to parse BOTH nonblank migrations
and pin **17**, updating Sweep D's two sites including the failure message (R1 finding 7 — leaving the
message saying "exactly 14" would preserve a false count). With `TEST_DATABASE_URL` set this is RED:
validation does not yet carry the three new public constraints.

Plan-time verification of 17 (R1 finding 8 — the earlier paste was not executable; this is the real
command and its real output, run 2026-07-25 against the parent migration plus the drafted file):

```bash
$ python3 -c "
import re, pathlib
rx = re.compile(r'alter\s+table\s+public\.\w+\s+add\s+constraint\s+(\w+)\s+check', re.I)
for f in ['supabase/migrations/20260702120200_drive_file_id_nonblank.sql', '<drafted new migration>']:
    print(f.split('/')[-1], '->', len(set(rx.findall(pathlib.Path(f).read_text()))))"
20260702120200_drive_file_id_nonblank.sql -> 14
<drafted new migration>                   -> 3
```

14 + 3 = 17; `dev.shows` is excluded by the pattern's `public.` scoping. Re-run this against the
committed migration during T5 rather than trusting the number here.

**GREEN** — apply to validation, then re-run:

```bash
: "${TEST_DATABASE_URL:?FATAL: TEST_DATABASE_URL unset}"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<the migration>
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "notify pgrst, 'reload schema';"
```

(R1 finding 4: the `notify` is a `psql -c` invocation, not bare SQL, and both carry `ON_ERROR_STOP=1`.)
The `alter table if exists dev.shows` block is a no-op on validation. Everything else about the test —
superset assertion, unset/empty/unreachable postures — is untouched (AC-10).

Commit: `test(db): extend validation CHECK parity to the secondary Drive-ID migration`

### T6 — backlog graduation + follow-up filing  *(docs task — no RED/GREEN, declared)*

Move the root backlog queue's lines 321-337 (Sweep A's corrected range, separator included) into `BACKLOG-archive.md` at
its layout position, ids verbatim, each entry gaining a resolution note. The archive entry also records
the **U4 drift finding** — `onboarding_rebuild_attempts.drive_file_id` was inside the original scope
rule and sat uncovered for 16 days — as part of the closure, per AC-15, not as a new open item.

Then file spec §11's four follow-ups into the root backlog queue with review-round provenance:
`BL-DRIVEID-CENSUS-QUERY-SELF-CHECK`, `BL-VALIDATION-PARITY-DEFINITION-MATCH`,
`BL-VALIDATION-TARGET-BINDING`, `BL-DRIVEID-BEHAVIORAL-COVERAGE`.

`Edit`/`Write` only — never `echo >>`.

Verification (not a test, but must be checked): `grep -c "BL-OPENING-REEL-DRIVE-ID-NONBLANK" ./BACKLOG.md`
→ 0, and the same grep against `BACKLOG-archive.md` → 1.

Commit: `docs(backlog): graduate the two secondary Drive-ID entries, file the four deferrals`

### T7 — post-checklist verification  *(gate — no commit)*

R1 finding 2: this produces no tracked change, so it carries no commit rather than an empty one.

1. `pnpm gen:schema-manifest --check` → must report **fresh**. A constraint-only migration adds no
   column and the manifest records columns only (`scripts/schema-manifest/lib.ts:238-246`). If it
   reports stale, something unintended landed — **stop and investigate** (AC-14).
2. Confirm T5's validation apply landed: re-run the parity test with `TEST_DATABASE_URL` set, green.

If step 1 *does* produce a manifest change, that is a signal — not a thing to commit past.

---

## Pre-push gates

```
pnpm test          # full suite — scoped runs miss regressions
pnpm typecheck     # vitest strips types; this is the only type gate
pnpm lint
pnpm format:check  # --no-verify bypasses prettier
```

## What R1 changed

| finding | change |
| ------- | ------ |
| 1 | T4 gained the production assertion; the inverted anti-vacuity rationale corrected |
| 2 | probes moved before the local apply (T3); validation apply moved into T5; T6/T7 declared non-TDD; T7 lost its commit |
| 3 | the invalid all-or-nothing probe deleted; the static `begin;`/`commit;` assertion is the claim |
| 4 | shell preamble defines `$LOCAL`, guards `TEST_DATABASE_URL`, `ON_ERROR_STOP=1` everywhere, `notify` wrapped in `psql -c` |
| 5 | `DriveIdConstraint` gains `name`, making the two name-based cases representable |
| 6 | T1 pins all four nullability × form combinations |
| 7 | Sweep D extended from 2 sites to 7, with the "exactly 14" failure message included |
| 8 | T5's verification replaced with the real command and its real output |
| 9 | T2 gained the AC-13 negative assertion (no `_allowed_watermark_columns` insert) |
| 10 | Sweep A range corrected 321–335 → 321–337 |

## Checklist

- [ ] T1 auditor · [ ] T2 migration file · [ ] T3 probes + local apply · [ ] T4 guard suite · [ ] T5 validation parity · [ ] T6 backlog · [ ] T7 gate
- [ ] Pre-push gates green
- [ ] Self-review
- [ ] **Adversarial review (cross-model, Codex) — iterate to APPROVE**
- [ ] Push, real CI green, `gh pr merge --merge`, verify `0  0`
