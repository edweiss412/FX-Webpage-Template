# Plan — Secondary-name Drive-ID nonblank CHECKs + minimal coverage guard

**Spec:** `docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md`
(APPROVE at adversarial round 7; R1–R4 BLOCKING, R5–R6 NEEDS-ATTENTION, 45 findings total, all accepted)
**Branch:** `fix/secondary-drive-id-nonblank` · **Implementer:** Opus / Claude Code

The spec is canonical. Where this plan and the spec disagree, the spec wins — open a question rather
than silently fixing.

---

## Declared applicability (per `docs/agents/writing-plans.md`)

| mandatory rule | applies? |
| -------------- | -------- |
| **Advisory-lock holder topology** | **N/A.** No task touches `pg_advisory_xact_lock` / `pg_advisory_lock`. Verified: `rg 'pg_advisory' --glob '!*.md'` returns no hit in any file this plan modifies. The migration is pure DDL and the guard is read-only introspection. |
| **Layout-dimensions task** | **N/A.** No UI surface: nothing under `app/` (except none), `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`. Invariant 8's impeccable dual-gate therefore does not fire either. |
| **Transition-audit task** | **N/A.** No component, no visual state. |
| **Meta-test inventory** | **Declared below.** |
| **e2e harness-readiness checklist** | **N/A.** No Playwright spec is added or modified. |
| **`echo >>` discipline** | Applies to T6 (`BACKLOG.md` edits) — use `Edit`/`Write`, never `echo >>`. |

### Meta-test inventory (mandatory declaration)

**CREATES:** none. The guard suite (T4) is an ordinary DB test, not a structural meta-test over the
source tree.

**EXTENDS:**

- `tests/db/schema.test.ts` — a new `describe` block statically parsing the new migration (T2).
- `tests/db/driveFileIdNonblank.db.test.ts` — four behavioral probes + the 14→15 list (T3).
- `tests/db/validation-schema-parity.test.ts` — parse both nonblank migrations, pinned count 14→17 (T5).

**SUBJECT TO (no new row needed, but verified):**

- `tests/db/_metaLocalDbUrlGuard.test.ts` — its structural half AST-scans every `tests/db/` file that
  reads `process.env.LOCAL_TEST_DATABASE_URL` and requires it to route through `assertLocalDbUrl`
  (scan key at `tests/db/_localDbUrlScan.ts:29`). T4's suite reads that variable and MUST route through
  the guard. It does not read `TEST_DATABASE_URL`, so the scan has nothing else to say about it.
- `tests/auth/_metaInfraContract.test.ts` (invariant 9) — **N/A**: no Supabase client call is added.
  The guard uses the postgres-js client directly, as every `tests/db/*.db.test.ts` does.
- Invariant 10 (mutation-surface observability) — **N/A**: no HTTP route, no `"use server"` action.

---

## Reconciliation sweeps — RUN at plan time, not described

Per the writing-plans rule, each sweep below was executed 2026-07-25 and its real output recorded.

**Sweep A — backlog entries to graduate (T6).**

```
$ grep -n "BL-OPENING-REEL-DRIVE-ID-NONBLANK\|BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK\|Secondary-name Drive-ID" BACKLOG.md
321:## Secondary-name Drive-ID columns — deferred from the drive_file_id nonblank CHECK (2026-07-02)
325:### BL-OPENING-REEL-DRIVE-ID-NONBLANK — nonblank CHECK on `shows.opening_reel_drive_file_id`
331:### BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK — nonblank CHECK on `wizard_finalize_checkpoints.last_processed_drive_file_id`
```

Disposition: lines 321–335 form ONE section with a shared heading and two `###` entries. The whole
section (heading + both entries + its trailing `---`) moves to `BACKLOG-archive.md`. The heading text
is retained verbatim there so a grep for either id still lands on its context.

**Sweep B — archive conventions.** `BACKLOG-archive.md:1-8` states: "Order follows the original
BACKLOG.md layout, not resolution date — **grep by id**. Ids are preserved verbatim." So the entries
are inserted at the position matching their original BACKLOG.md order, ids unchanged, with a resolution
note appended to each rather than rewritten prose.

**Sweep C — insertion point for T2's static-parse block.** `tests/db/schema.test.ts:260-340` is the
existing `describe("drive_file_id nonblank CHECK migration", …)`; the next block starts at `tests/db/schema.test.ts:342`. The new `describe` goes between them.

**Sweep D — every hardcoded count in the class.**

```
$ grep -rn "toBe(14)" tests/db/
tests/db/driveFileIdNonblank.db.test.ts:147:    expect(PUBLIC_NONBLANK_TABLES.length).toBe(14);
tests/db/validation-schema-parity.test.ts:237:    expect(expected.size, "migration parse must yield exactly 14 public CHECK names").toBe(14);
```

Both move: `tests/db/driveFileIdNonblank.db.test.ts:147` → 15 (T3), `tests/db/validation-schema-parity.test.ts:237` → 17 (T5). These are the only two.

---

## Tasks

Every task: **failing test → minimal implementation → passing test → commit.** One task, one commit,
conventional-commits style. Update the gitignored ship-state marker's `tasksRemaining` / `next` in the same beat
as each commit.

### T1 — the pure auditor

**RED** — the DB-free auditor unit-test file (spec §0; DB-free, runs in the parallel/serial split like any unit
test). One test per branch, each stating the failure mode it catches:

| branch | failure mode it catches |
| ------ | ----------------------- |
| covered, bare form | a column with the NOT NULL-style CHECK is reported uncovered |
| covered, `IS NULL OR` form | a nullable column's CHECK shape is not recognized |
| covered, other form accepted | nullability is wrongly required to match the form (§1.1 item 3) |
| uncovered | a column with no CHECK is reported covered — the core false-negative |
| **name matches, definition differs** | a constraint renamed `…_nonblank` but weakened to `CHECK (true)` counts as coverage |
| **same column name, different table** | `shows.drive_file_id`'s CHECK satisfies `sync_log.drive_file_id` |
| **same constraint NAME, different table** | per §3.1.3 names are unique per table, not per schema |
| exemption with reason | a legitimate exemption still reports a finding |
| exemption, empty/whitespace reason | an unexplained exemption silently passes |
| exemption, now covered | a stale exemption survives the repair and blinds the column forever |
| exemption, column absent | a dropped column leaves a live exemption |
| duplicate exemption key | two rows for one column, one of them stale |

**GREEN** — the auditor module (spec §0) with the §4.1 types and
`DRIVE_ID_COVERAGE_EXEMPTIONS: CoverageExemption[] = []`.

Anti-tautology: every assertion is on the returned `CoverageFinding[]` contents (kind + identifying
tuple), never on "the function was called" or on array length alone.

Commit: `feat(db): add the Drive-ID coverage auditor`

### T2 — the migration

**RED** — extend `tests/db/schema.test.ts` (insert after the block ending at `tests/db/schema.test.ts:340`, per Sweep C) with
`describe("secondary Drive-ID nonblank CHECK migration", …)` statically parsing the new file:

- all four constraints present as `drop constraint if exists <name>` + `add constraint <name> check (…)`
- the dev block uses `alter table if exists dev.shows` (mandatory `if exists`; a bare form errors on
  validation, and a test accepting it would let that ship — same rationale as `tests/db/schema.test.ts:299-301`)
- the file opens `begin;` and closes `commit;`
- **AC-12**: walk ALL of `supabase/migrations/`, assert every `add constraint <name>` is ≤ 63 bytes

**GREEN** — write the migration (spec §0 names the path) per spec §3,
constraint names per §3's table (U3 = `wizard_finalize_checkpoints_drive_file_id_nonblank`, 50 bytes,
suffix intact per §1.1 item 2).

**Then apply locally and prove it:**

```
psql "$LOCAL" -v ON_ERROR_STOP=1 -f <the migration>
psql "$LOCAL" -v ON_ERROR_STOP=1 -f <the migration>   # AC-1 idempotency — clean twice
```

Clean twice ⇒ AC-1 and AC-13 (the `ddl_command_end` event trigger does not reject it). **Note the
wrapper caveat from spec §3.1.2:** because the file carries its own `commit;`, it cannot be probed
inside an outer `BEGIN/ROLLBACK`. Verify all-or-nothing separately by running a deliberately-failing
variant (append an `alter table public.shows add constraint … check (false);` to a COPY of the file in
the scratchpad, never the real file) against local and confirming none of its constraints persist.

Commit: `feat(db): add nonblank CHECKs to the four uncovered Drive-ID columns`

### T3 — behavioral probes

**RED** — extend `tests/db/driveFileIdNonblank.db.test.ts`. Insert shapes verified against live DDL:

- `public.shows` — extend the existing insert with `opening_reel_drive_file_id`
- `public.wizard_finalize_checkpoints` — `(wizard_session_id uuid NOT NULL, last_processed_drive_file_id)`;
  `id`, `batches_completed`, `status` all have defaults
- `public.onboarding_rebuild_attempts` — `(wizard_session_id uuid NOT NULL, drive_file_id NOT NULL)`;
  `attempts`, `escalation_logged`, `updated_at` have defaults
- `dev.shows` — mirror of the public shows shape

Each: reject `""`, `"   "`, `"\t"` with SQLSTATE 23514; accept a valid id; the three nullable ones also
accept `NULL`. Reuse `expectRejected` / `expectAccepted` so every probe rolls back (AC-2, zero residue).

Also per Sweep D: `PUBLIC_NONBLANK_TABLES` gains `onboarding_rebuild_attempts` and `tests/db/driveFileIdNonblank.db.test.ts:147`
becomes `toBe(15)`.

Commit: `test(db): behaviorally prove the four new nonblank CHECKs reject blanks`

### T4 — the coverage guard suite

**RED first** — write the negative control BEFORE the passing assertion: a test that drops
`shows_opening_reel_drive_file_id_nonblank` inside a transaction, runs the audit, asserts the finding
is `uncovered` for that exact tuple, and rolls back. **If this test passes before the audit exists, the
audit is vacuous** — that is precisely what it catches (AC-4).

**GREEN** — the census-query module and the local-DB guard suite (both named in spec §0):

- one explicit transaction, one connection, `set local search_path = pg_catalog, public`, asserting
  `current_setting('search_path')` inside it before trusting any rendering (AC-7)
- census predicate `~ 'drive_file_id'` — **never `LIKE`** — joined to `information_schema.tables` on
  `table_type = 'BASE TABLE'`, schemas `('public','dev')` (AC-5); a unit test pins that `driveXfileYid`
  is out of scope
- two canaries asserting the parent migration's `public.shows.drive_file_id` and
  `public.sync_log.drive_file_id` still render as the two module-constant templates (AC-8) — the
  canaries CHECK the constants, they never derive them
- `assertLocalDbUrl` on `LOCAL_TEST_DATABASE_URL` (required by `_metaLocalDbUrlGuard`'s structural half)
- **CI fail-not-skip** (AC-6): skip only when `process.env.CI` is unset; under CI a failed probe throws,
  naming the redacted host and the underlying error. A unit test proves the CI branch throws.

Commit: `feat(db): fail CI when a Drive-ID column lands without a nonblank CHECK`

### T5 — validation parity extension

**RED** — the existing test at `tests/db/validation-schema-parity.test.ts:223-285` currently reads ONE
migration and pins 14. Change it to read both nonblank migrations and pin **17**, verified at plan time
by running the test's own regex:

```
$ python3 - <<'EOF'   # the test's pattern, verbatim
rx = re.compile(r'alter\s+table\s+public\.\w+\s+add\s+constraint\s+(\w+)\s+check', re.I)
EOF
20260702120200_drive_file_id_nonblank.sql -> 14 public names
new migration                             -> 3 public names
```

14 + 3 = 17; the `dev.shows` constraint is correctly excluded by the `public.` scoping. Everything else
about that test — superset assertion, failure message, unset/empty/unreachable postures — is untouched
(AC-10).

Commit: `test(db): extend validation CHECK parity to the secondary Drive-ID migration`

### T6 — backlog graduation + follow-up filing

Per Sweep A/B, move the whole 2026-07-02 section (lines 321-335 of the root `BACKLOG.md`) into `BACKLOG-archive.md` at its layout position, ids
verbatim, each entry gaining a resolution note. The archive entry also records the **U4 drift finding**
(`onboarding_rebuild_attempts.drive_file_id` was inside the original scope rule and uncovered for 16
days) as part of the closure, per AC-15 — not as a new open item.

Then file spec §11's four follow-ups into the root backlog queue, each with its review-round provenance:
`BL-DRIVEID-CENSUS-QUERY-SELF-CHECK`, `BL-VALIDATION-PARITY-DEFINITION-MATCH`,
`BL-VALIDATION-TARGET-BINDING`, `BL-DRIVEID-BEHAVIORAL-COVERAGE`.

Use `Edit`/`Write` only — never `echo >>` (writing-plans `echo >>` discipline).

Commit: `docs(backlog): graduate the two secondary Drive-ID entries, file the four deferrals`

### T7 — migration post-checklist

1. `pnpm gen:schema-manifest --check` → assert it reports **fresh**. Constraint-only migration adds no
   column, and the manifest records columns only (`scripts/schema-manifest/lib.ts:238-246`). If it
   reports stale, something unintended landed — stop (AC-14).
2. Apply the migration surgically to the validation project:
   `psql "$TEST_DATABASE_URL" -f <the migration>`
   then `notify pgrst, 'reload schema';`. Public only; the `alter table if exists dev.shows` block is a
   no-op there.
3. Re-run T5's test against validation and confirm green before pushing.

Commit: `chore(db): apply the secondary Drive-ID migration to the validation project`

---

## Pre-push gates (all must pass, in this order)

Scoped runs miss regressions, so the full suite runs:

```
pnpm test          # full suite (db tests included; local stack must be up)
pnpm typecheck     # vitest strips types — this is the only type gate
pnpm lint
pnpm format:check  # --no-verify bypasses prettier, so this is not optional
```

## Checklist

- [ ] T1 auditor · [ ] T2 migration · [ ] T3 probes · [ ] T4 guard suite · [ ] T5 parity · [ ] T6 backlog · [ ] T7 post-checklist
- [ ] Pre-push gates green
- [ ] Self-review
- [ ] **Adversarial review (cross-model, Codex) — iterate to APPROVE**
- [ ] Push, real CI green, `gh pr merge --merge`, verify `0  0`
