# Phase 2 — §02 Migration + Projection

**Goal:** Land the storage + sync + read-projection half of the AGENDA run-of-show enrichment: the admin-only `shows_internal.run_of_show jsonb` column (+ validation apply + manifest regen), the PostgREST DML lockdown of `shows_internal` (REVOKE migration + `RPC_GATED_TABLES` registry row, **same commit**), the CONFIRMED-ONLY full-replace sync write under the existing per-show advisory lock, the total `decodeRunOfShow` decoder, the unconditional service-role `getShowForViewer.runOfShow` read with the `current dates.showDays ∩ DateRestriction` intersection + `tileErrors["run_of_show"]` fail-soft, and the new first-class `failedKeys` per-domain test. **No UI** (that is §03).

> Execute after §01. This file depends on §01's `AgendaEntry` type and the top-level `ParsedSheet.runOfShow` / `ParseResult.runOfShow` field (`lib/parser/types.ts`). Do **not** start until §01's tasks are committed and `pnpm typecheck` is clean on the parser surface.

**Read first:** `00-overview.md` (binding interfaces, global constraints, meta-test inventory — esp. the `_metaInfraContract`-scope correction, the unconditional-read correction, the union-merge-is-DB-RPC correction, and the no-existing-5-domain-enumeration correction). Cite the overview's `file:line`, not the spec's (spec written pre-merge).

**Global constraints (every task inherits these — from `00-overview.md`):** TDD per task (failing test → minimal impl → passing test → one commit, conventional-commits `feat(db|sync|crew-page):` / `test(...)`); fail-soft is the contract; **CONFIRMED-ONLY** retention (D-2 — do-not-relitigate); `run_of_show` lives ONLY on `shows_internal`, NEVER `public.shows`/`ShowRow`; the sync write rides the **existing** per-show lock (no new holder); Supabase call-boundary discipline (`{ data, error }` destructure, returned-error vs thrown distinguished, surfaced as `tileErrors["run_of_show"]`, never raw infra text to crew).

---

## Pre-execution verification (do this once, before Task 1)

Confirm §01 landed the cross-task interfaces this file consumes. These MUST already exist; if any is missing, STOP and finish §01:

- [ ] `AgendaEntry` exported from `lib/parser/types.ts` = `{ start: string; finish?: string; trt?: string; title: string; room?: string; av?: string }`.
- [ ] `ParsedSheet.runOfShow?: Record<string, AgendaEntry[]>` (between `warnings` and `hardErrors`, `lib/parser/types.ts:315-332`) AND `ParseResult.runOfShow?: Record<string, AgendaEntry[]>` (`lib/parser/types.ts:338-355`) — both present so the field survives sync enrichment.
- [ ] **All 5 `AGENDA_*` `ParseWarning` codes already exist in `internal-code-enums` after §01** — §01 defines ALL five as `code:`-literal helper functions in `lib/parser` (e.g. `lib/parser/blocks/agendaWarnings.ts`) and regenerates `lib/messages/__generated__/internal-code-enums.ts` with all five. Four (`AGENDA_GRID_MALFORMED`, `AGENDA_BLOCK_UNRESOLVED`, `AGENDA_DAY_AMBIGUOUS`, `AGENDA_DAY_TRUNCATED`) are **emitted by the parser**; **`AGENDA_DAY_EMPTIED` is defined-in-parser (helper `agendaDayEmptied`) but emitted by the SYNC** (Task 02.4) — it needs prior-stored knowledge the parser lacks. The extractor's `parse_warnings` pass scans `lib/parser` only (`scripts/extract-internal-code-enums.ts:70`), so the helper MUST live in `lib/parser` for `AGENDA_DAY_EMPTIED` to be extracted even though the sync is its only emitter.
  - **§02 does NOT regenerate `internal-code-enums` for codes** (§01 did all five). §02 only USES the `agendaDayEmptied` helper imported from `lib/parser`. (§02 still regenerates the SCHEMA manifest for the new column/grants — that is `gen:schema-manifest`, a different generator.)

Run `pnpm typecheck` and the §01 parser suite green before proceeding.

---

## Task 02.1 — Migration: `shows_internal.run_of_show jsonb` (+ dev mirror) + manifest regen + validation apply

**Files:**
- NEW `supabase/migrations/20260619000000_shows_internal_run_of_show.sql` (timestamp **after** the latest `20260618000000_upsert_admin_alert_failedkeys_merge.sql`).
- EDIT `supabase/migrations/20260502000000_dev_schema_clone.sql:178-183` (the `dev.shows_internal` create — add the mirror column so the dev shadow schema stays a structural clone).
- EDIT (regen, do not hand-edit) `supabase/__generated__/schema-manifest.json`.
- NEW `tests/db/runOfShowColumn.test.ts` (DB-free manifest tripwire — Layer 1 of `validation-schema-parity`).

**Interfaces:** the column is `run_of_show jsonb` nullable default `null` on the admin-only `public.shows_internal` (created at `20260501001000_internal_and_admin.sql:1-6`; `admin_only` RLS `using (is_admin())` at `20260501002000_rls_policies.sql:62-65` — a new column inherits it, no RLS change). Idempotent via `add column if not exists` (template `20260611000000_onboarding_manifest_created_show_id.sql:14-17`).

**Dev-mirror decision (state it in the migration header):** YES, mirror into `dev.shows_internal`. The `dev.*` shadow schema is a structural clone used by local seed infra; `dev.shows_internal` (`20260502000000_dev_schema_clone.sql:178-183`) already mirrors `financials`/`parse_warnings`/`raw_unrecognized`. Adding the column there keeps the clone faithful and avoids a future local-seed shape divergence. `dev` is NOT a deploy target (the validation-parity gate is public-schema only — `tests/db/validation-schema-parity.test.ts`), so the dev edit needs no validation apply.

**Failing test (CODE):** add to `tests/db/runOfShowColumn.test.ts` a DB-free assertion that the regenerated manifest carries the column on `shows_internal` and NOT on `shows` (this fails before the migration + `pnpm gen:schema-manifest`):
```ts
import { describe, it, expect } from "vitest";
import manifest from "@/supabase/__generated__/schema-manifest.json";

describe("shows_internal.run_of_show manifest tripwire (Layer 1 of validation-schema-parity)", () => {
  const cols = (table: string): string[] => {
    const t = (manifest as { tables: Record<string, { columns: Record<string, unknown> }> }).tables[table];
    return t ? Object.keys(t.columns) : [];
  };
  it("run_of_show exists on public.shows_internal", () => {
    expect(cols("public.shows_internal")).toContain("run_of_show");
  });
  it("run_of_show is NOT on public.shows (D-3 — admin-only home, never crew-readable)", () => {
    expect(cols("public.shows")).not.toContain("run_of_show");
  });
});
```
> NOTE: confirm the manifest's table-key shape (`public.shows_internal` vs `shows_internal`) and column container by reading the existing `supabase/__generated__/schema-manifest.json` before writing the test; match its exact key form. The two assertions above are the contract regardless of key spelling.

**Run-fails:** `pnpm vitest run tests/db/runOfShowColumn.test.ts` → red (`run_of_show` absent from the committed manifest). _Failure this catches: a migration that never reached the manifest (the silent-drift class — a committed migration whose column is missing live)._

**Minimal impl (migration SQL — verbatim):**
```sql
-- Phase 2 §02 (crew-page-redesign): AGENDA run-of-show storage.
--
-- shows_internal.run_of_show: per-day parsed run-of-show, keyed ISODate -> AgendaEntry[],
-- nullable default null. Lives on the ADMIN-ONLY shows_internal table (admin_only RLS
-- using(is_admin()), 20260501002000_rls_policies.sql:62-65), NEVER public.shows: shows is
-- crew-readable via crew_read (can_read_show membership, NO per-day gate), so a shows.run_of_show
-- column would be directly PostgREST-readable and bypass the projection's DateRestriction gate (D-3).
-- The only read path is the service-role projection in getShowForViewer (per-day + current-date gate).
--
-- Written CONFIRMED-ONLY full-replace by the service-role sync under the per-show advisory lock (D-2).
--
-- Apply-twice idempotent: add column if not exists.
alter table public.shows_internal
  add column if not exists run_of_show jsonb;
```

**Dev-clone edit:** in `20260502000000_dev_schema_clone.sql`, add `run_of_show jsonb` to the `create table if not exists dev.shows_internal (...)` body (alongside `raw_unrecognized jsonb default '[]'::jsonb`). Because the create is `if not exists`, also note in a comment that a pre-existing local dev DB needs the column added manually (or a clean re-seed) — but do NOT add a second `alter` in the dev file (keep the dev clone declarative).

**Apply + regen (run these, commit the artifacts):**
1. Apply locally: `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260619000000_shows_internal_run_of_show.sql` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`.
2. `pnpm gen:schema-manifest` → regenerates `supabase/__generated__/schema-manifest.json` (introspects the LOCAL all-migrations-applied DB). Stage the regenerated manifest.
3. Apply surgically to the validation project (db push is BLOCKED there — Phase-0 divergence): `supabase db query --linked "alter table public.shows_internal add column if not exists run_of_show jsonb; notify pgrst, 'reload schema';"`. (The `validation-schema-parity` Layer 2 — `psql` vs `TEST_DATABASE_URL` / validation — then asserts validation ⊇ manifest.)

**Run-passes:** `pnpm vitest run tests/db/runOfShowColumn.test.ts` → green; `pnpm vitest run tests/db/validation-schema-parity.test.ts` → green (Layer 1 manifest tripwire + Layer 2 live-parity both pass).

**Commit:** `feat(db): add admin-only shows_internal.run_of_show jsonb column (+ dev mirror, manifest regen)`

---

## Task 02.2 — PostgREST DML lockdown: REVOKE migration + `RPC_GATED_TABLES` row (SAME COMMIT)

**Files:**
- NEW `supabase/migrations/20260619000001_lockdown_shows_internal.sql`.
- EDIT `tests/db/postgrest-dml-lockdown.test.ts:124` (`RPC_GATED_TABLES` array — add the `shows_internal` row).
- EDIT `supabase/__generated__/schema-manifest.json` (regen — grants are captured by the manifest).

**Interfaces (from `00-overview.md` meta-test inventory + spec §4.2 R16-HIGH):** `shows_internal` is currently ABSENT from the 16-entry `RPC_GATED_TABLES` registry and has NO existing REVOKE → Phase 2 is its first lockdown. The bidirectional meta-test fails if REVOKE and registry row don't land together: `postgrest-dml-lockdown.test.ts:714` (every live REVOKE has a registry row) + `:738` (every registry row has a live REVOKE). The live grant being revoked is `grant select, insert, update, delete on public.shows_internal to anon, authenticated` (`20260501002000_rls_policies.sql:59`). **SELECT grant + `admin_only` RLS stay intact; `service_role` keeps `all privileges` (`:60`).** Template = `20260611000002_lockdown_wizard_staging_tables.sql` (`begin; revoke …; grant all privileges … to service_role; commit;`).

**Verified-safe blast radius (do-not-relitigate, wp-10):** the ONLY writer of `shows_internal` is the service-role sync (`runScheduledCronSync.ts:1318-1334` upsert); `getShowForViewer.ts:483-487` only **reads** (service-role). No authenticated/anon app code mutates the table → the whole-table REVOKE has zero functional impact, it only removes the racy unlocked PostgREST DML path. This makes the locked service-role sync the single serialized writer of the CONFIRMED-ONLY read-modify-replace.

**`RPC_GATED_TABLES` row template (all 6 fields — `rowFilter` is REQUIRED; the type is `RpcGatedTable` at `:115-122`; model on the `crew_members` row at `:125-137`):**
```ts
{
  table: "shows_internal",
  closed_at:
    "supabase/migrations/20260619000001_lockdown_shows_internal.sql:<REVOKE line>",
  selectAnon: true,
  selectAuthenticated: true,
  postBody: {
    show_id: "00000000-0000-0000-0000-000000000000",
    run_of_show: {},
  },
  rowFilter: "?show_id=eq.00000000-0000-0000-0000-000000000000",
},
```
> `closed_at` must cite the EXACT line of the `revoke insert, update, delete on table public.shows_internal …` statement in the new migration (read the file after writing it and fill the real line number). The `postBody` is a structurally-valid INSERT body that mutates nothing once the lockdown holds; `rowFilter` is the no-match filter PATCH/DELETE need to avoid a 400-from-missing-filter (sentinel UUID matches no row).

**Failing test (CODE):** the bidirectional meta-test already exists and will go red the moment the REVOKE migration lands WITHOUT the registry row (and vice versa). To make the lockstep explicit, first write the migration (Step below) and run the suite to observe `postgrest-dml-lockdown.test.ts:714` red ("Tables with table-level REVOKE blocks but no entry in RPC_GATED_TABLES: shows_internal"). Then add the registry row. (TDD here = "migration first, watch the bidirectional meta-test fail, add the row to green it" — the test is pre-existing, the new code is the migration + row.)

**Run-fails (after writing the migration, before the registry row):** `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` → `:714` red. _Failure this catches: a REVOKE shipped without its registry row (or a row without a REVOKE) — the lockstep that keeps the DML-rejection matrix honest._

**Minimal impl (migration SQL — verbatim):**
```sql
-- Phase 2 §02 (crew-page-redesign R16-HIGH): PostgREST DML lockdown for shows_internal.
--
-- The sync's run_of_show write is a read-modify-replace (CONFIRMED-ONLY, D-2) under the
-- per-show advisory lock. A signed-in admin could otherwise `update shows_internal set
-- run_of_show = …` directly via PostgREST behind only the admin_only RLS — that path does
-- NOT take the advisory lock and could race/corrupt the merge. REVOKE makes the locked
-- service-role sync the single serialized writer.
--
-- The ONLY writer is the service-role sync (runScheduledCronSync.ts:1318-1334); getShowForViewer
-- only reads (service-role). So this whole-table REVOKE has zero functional impact — it removes
-- only the racy manual path (financials/parse_warnings/raw_unrecognized are locked down too, intended;
-- closes the shows_internal portion of BL-ADMIN-POSTGREST-DML-LOCKDOWN).
--
-- SELECT grant + admin_only RLS retained; service_role keeps all privileges.
-- Registry: tests/db/postgrest-dml-lockdown.test.ts RPC_GATED_TABLES (bidirectional meta-test :714/:738).
-- Idempotent: REVOKE/GRANT are no-ops when already applied.
begin;
revoke insert, update, delete on table public.shows_internal from anon, authenticated;
grant all privileges on table public.shows_internal to service_role;
commit;
```

**Minimal impl (registry):** add the row above to `RPC_GATED_TABLES` (`:124`), with `closed_at` citing the real REVOKE line.

**Apply + regen:** `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260619000001_lockdown_shows_internal.sql`; `supabase db query --linked "revoke insert, update, delete on table public.shows_internal from anon, authenticated; grant all privileges on table public.shows_internal to service_role; notify pgrst, 'reload schema';"`; `pnpm gen:schema-manifest` (regen, stage).

**Run-passes:** `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` → green (both `:714` and `:738`, plus the `describe.each` DML-rejection matrix now exercises `shows_internal`: anon/authenticated INSERT/UPDATE/DELETE are rejected, SELECT still permitted). `pnpm vitest run tests/db/validation-schema-parity.test.ts` → green.

**Commit:** `feat(db): lock down shows_internal PostgREST DML + register in RPC_GATED_TABLES`

---

## Task 02.3 — `decodeRunOfShow`: total, deep per-layer JSONB decoder

**Files:**
- NEW `lib/data/decodeRunOfShow.ts`.
- NEW `tests/data/decodeRunOfShow.test.ts`.

**Interfaces:** `decodeRunOfShow(raw: unknown): { value: Record<string, AgendaEntry[]> | null; corrupt: boolean }` (signature from `00-overview.md` line 63). The column is schemaless JSONB written by the sync; a buggy sync / manual admin PostgREST edit (pre-lockdown rows) / migration drift could store `{ "2026-01-01": [null] }`, a non-array day, a non-ISO key, or non-string entry fields. Because §03's UI keys off `runOfShow[isoDate]?.length > 0`, an under-validated value turns corrupt storage into a Schedule render crash instead of the anchor-strip fallback (R14-MEDIUM). The decoder is **total** (never throws) and validates structurally per layer. Reuse `shouldHideGenericOptional` (`lib/visibility/emptyState.ts:75`) for the `title`-is-REAL gate (mirrors the parser's step-4 emit gate so a corrupt `""`/`TBD` title can't render).

**Decoder contract (per spec §4.2 `decodeRunOfShow` + test 4 deep-decoder cases):**
- `null` → `{ value: null, corrupt: false }` (legitimate empty — the common case; NO corruption flag).
- Top-level not a plain object (array, string, number, boolean) → `{ value: null, corrupt: true }`.
- Per key: not a `YYYY-MM-DD` ISO date → that key dropped, `corrupt = true`.
- Per day value: not an array → that day dropped, `corrupt = true`.
- Per entry: must be a plain object whose `title` is a REAL string (non-empty string AND `!shouldHideGenericOptional(title)`) AND every PRESENT optional field (`start`/`finish`/`trt`/`room`/`av`) is a string → else the entry is dropped + `corrupt = true`. (`start` is also required-string by the type; treat a missing/non-string `start` as a drop.)
- A day left with ZERO valid entries after filtering → that key is OMITTED from `value` (→ that day falls back to the anchor strip).
- `{}` (empty object) and an all-empty-after-filter object → `{ value: null, corrupt: <as accumulated> }` (treat "no surviving days" as `null` so §03's UI and §4.5 guard both see `null`). Keep `corrupt` reflecting whether anything was dropped.

**Failing test (CODE) — anti-tautology: each case names the failure it catches:**
```ts
import { describe, it, expect } from "vitest";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";

const good = { start: "7:15 AM", finish: "7:30 AM", trt: "0:15", title: "Opening Keynote", room: "Mabel 1", av: "POD" };

describe("decodeRunOfShow — total, deep per-layer validation (R14)", () => {
  it("null → null, not corrupt (legitimate empty — the common case; must NOT fire tileErrors)", () => {
    expect(decodeRunOfShow(null)).toEqual({ value: null, corrupt: false });
  });
  it("non-object top level → null + corrupt (array / string / number)", () => {
    // catches: a non-object stored value crashing the UI's runOfShow[d] access
    expect(decodeRunOfShow([])).toEqual({ value: null, corrupt: true });
    expect(decodeRunOfShow("x")).toEqual({ value: null, corrupt: true });
    expect(decodeRunOfShow(42)).toEqual({ value: null, corrupt: true });
  });
  it("non-ISO key → dropped, sibling valid day still projected, corrupt set", () => {
    const r = decodeRunOfShow({ garbage: [good], "2026-01-02": [good] });
    expect(Object.keys(r.value ?? {})).toEqual(["2026-01-02"]);
    expect(r.corrupt).toBe(true);
  });
  it("non-array day value → that day dropped + corrupt", () => {
    const r = decodeRunOfShow({ "2026-01-01": 5, "2026-01-02": [good] });
    expect(r.value).toEqual({ "2026-01-02": [good] });
    expect(r.corrupt).toBe(true);
  });
  it("entry = null / non-object / non-string optional field → dropped + corrupt", () => {
    // catches: a shallow typeof==='object' guard letting [null] reach the length>0 UI branch and crash
    expect(decodeRunOfShow({ "2026-01-01": [null] })).toEqual({ value: null, corrupt: true });
    expect(decodeRunOfShow({ "2026-01-01": [{ title: "x", room: 7 }] })).toEqual({ value: null, corrupt: true });
  });
  it("entry whose title is empty-or-sentinel → dropped (mirrors parser emit gate)", () => {
    expect(decodeRunOfShow({ "2026-01-01": [{ start: "1", title: "" }] })).toEqual({ value: null, corrupt: true });
    expect(decodeRunOfShow({ "2026-01-01": [{ start: "1", title: "TBD" }] })).toEqual({ value: null, corrupt: true });
  });
  it("well-formed day alongside malformed sibling → valid day still projects, corrupt set", () => {
    const r = decodeRunOfShow({ "2026-01-01": [good], "2026-01-02": [{ title: 9 }] });
    expect(r.value).toEqual({ "2026-01-01": [good] });
    expect(r.corrupt).toBe(true);
  });
  it("a day left with zero valid entries after filtering is omitted (→ anchor strip)", () => {
    const r = decodeRunOfShow({ "2026-01-01": [{ title: "" }], "2026-01-02": [good] });
    expect(r.value).toEqual({ "2026-01-02": [good] });
    expect(r.corrupt).toBe(true);
  });
  it("is total — never throws on adversarial input", () => {
    expect(() => decodeRunOfShow({ "2026-01-01": [{ get title() { throw new Error("x"); } }] })).not.toThrow();
  });
});
```

**Run-fails:** `pnpm vitest run tests/data/decodeRunOfShow.test.ts` → red (module missing). _Failure this catches: corrupt JSONB reaching the `length > 0` UI branch as a render crash instead of a fail-soft anchor fallback + admin alert._

**Minimal impl:** write `lib/data/decodeRunOfShow.ts` implementing the contract above (plain-object check excludes arrays; `Array.isArray` for the day; per-entry validation with a try-free guard reading each field once; ISO key = `/^\d{4}-\d{2}-\d{2}$/`). Re-use the project's `shouldHideGenericOptional` import. Do NOT re-truncate field lengths (the decoder validates type; the UI caps length — §03/D-6).

**Run-passes:** `pnpm vitest run tests/data/decodeRunOfShow.test.ts` → green. `pnpm typecheck` clean.

**Commit:** `feat(crew-page): add total deep-validating decodeRunOfShow JSONB decoder`

---

## Task 02.4 — Sync write: CONFIRMED-ONLY full-replace under the existing per-show lock

**Files:**
- EDIT `lib/sync/applyParseResult.ts` — the `ApplyParseResultSnapshot` type (`:13-17`, add `priorRunOfShow`), the `Phase2Tx.upsertShowsInternal` payload type (`:28-40`, add `run_of_show`), and the apply body (`:80-130`) where the `AGENDA_DAY_EMPTIED` computation + the `upsertShowsInternal` payload (`:121-130`) live.
- EDIT `lib/sync/phase2.ts` — the `Phase2Tx.applyShowSnapshot` RETURN type (`:49-59`, add `priorRunOfShow` to the `"updated"` branch) so the prior `shows_internal.run_of_show` reaches `ApplyParseResultSnapshot`. The snapshot is produced at `:264` and passed to `applyParseResult(tx, { …, snapshot })` at `:343-350`.
- EDIT `lib/sync/runScheduledCronSync.ts` — the **Postgres `applyShowSnapshot` implementation** (`:938-1165`): add a prior `shows_internal.run_of_show` SELECT keyed on the resolved `existing.id` (the existing-show lookup is at `:939-942`) and RETURN it as `priorRunOfShow` in the `"updated"` return object (`:1146-1164`). Also the `PostgresPipelineTx.upsertShowsInternal` SQL (`:1318-1334`) — add `run_of_show` to the upsert.
- EDIT `lib/sync/runScheduledCronSync.ts` for the **FIX-3 dual-channel sync_log wiring** (D-7): the `SyncLogEntry` type (`:187-192`, add an optional `parseWarnings`), the `logSync` builder (`:1608-1623` — populate `entry.parseWarnings` from the applied result's `parseResult.warnings`), and the `insertSyncLog` impl (`:794-808` — union `entry.parseWarnings` into the `$5` `parse_warnings` array). See the FIX-3 paragraph below for the exact shape + scope caution.
- NEW `tests/sync/runOfShowConfirmedReplace.test.ts`.

> **Snapshot-surface correction (R6 HIGH — the prior-run_of_show source).** The prior stored `run_of_show` MUST come through the **apply snapshot** (`ApplyParseResultSnapshot`, `applyParseResult.ts:13-17`), which `applyParseResult` actually consumes as `args.snapshot`. That snapshot is built by **`Phase2Tx.applyShowSnapshot`** (interface `phase2.ts:33-59`; Postgres impl `runScheduledCronSync.ts:938-1165`), which already resolves the existing show row and reads `previousCrew`. **The earlier plan pointed at `runScheduledCronSync.ts:532-543` — that is WRONG: that read populates the Phase-1 parse snapshot (`readShowForPhase1` → `priorParseResult`), a DIFFERENT surface that never reaches `applyParseResult`.** Wiring the prior `run_of_show` there would leave `AGENDA_DAY_EMPTIED` permanently undetectable on the live cron path (it would only ever fire in a fake unit-snapshot test). The correct seam is `applyShowSnapshot` → its return → `ApplyParseResultSnapshot.priorRunOfShow` → consumed in `applyParseResult`. **Do NOT touch `:532-543` for this.**

**Interfaces + the CONFIRMED-ONLY rule (D-2 / spec §4.2 "Sync write path" / test 4b):** the sync write rides the EXISTING per-show advisory lock — `upsertShowsInternal` runs inside the locked apply transaction (`withShowLock` → `pg_try_advisory_xact_lock(hashtext('show:'||drive_file_id))`, `lib/sync/lockedShowTx.ts:59`). NO new lock holder; topology in `tests/auth/advisoryLockRpcDeadlock.test.ts` unchanged. The stored `shows_internal.run_of_show` becomes **exactly the latest parse's confirmed (non-empty) days** — there is NO per-day preserve/merge of prior entries.

Compute the write value from `parseResult.runOfShow` (camelCase parser field) + the prior stored `run_of_show` (carried on `args.snapshot.priorRunOfShow` — see the **Prior-run_of_show snapshot plumbing** subsection below; NOT the Phase-1 `:532-543` read):
- **`parsed.runOfShow === undefined` (grid UNLOCATABLE — converter/header failure)** → write **`null`** + emit **`AGENDA_GRID_MALFORMED` ONLY**. **Emit NO per-day `AGENDA_DAY_EMPTIED`** — even if the prior stored value held days. An unlocatable grid is a distinct conversion-fault state (spec §4.4 retention matrix row "Grid not locatable" → `AGENDA_GRID_MALFORMED`; §6 test 4b(ii)); emitting `AGENDA_DAY_EMPTIED` here would falsely tell the admin the SOURCE day was blanked, masking the real conversion/removed-tab fault mode and weakening the R22 observability contract. (Crew still see anchors for all days — CONFIRMED-ONLY; the difference is purely which warning the admin gets.)
- else (a **LOCATED** parsed `Record`) `merged = Object.fromEntries(Object.entries(parsed.runOfShow).filter(([, e]) => e.length > 0))`; if `merged` has no keys → write **`null`**, else write `merged`. A read-empty `[]` day and an unresolved/absent block are simply NOT written (→ they render anchors).
- **`AGENDA_DAY_EMPTIED` ONLY on the LOCATED-grid read-empty shape:** for each day that **was in the prior stored value** AND is **present-as-`[]` in `parsed.runOfShow`** (read-empty / blank titles in a located grid) but is NOT in the write value. Do NOT emit it for a day that is merely absent from the parsed `Record` (unresolved block — that gets `AGENDA_BLOCK_UNRESOLVED` from the parser), and do NOT emit it on the unlocatable-grid path (above). Use the prior stored value ONLY to decide which `AGENDA_DAY_EMPTIED` warnings to emit (observability) — NOT to preserve content. (Spec §4.4 retention matrix row "previously stored … read-empty" → `AGENDA_DAY_EMPTIED`; §6 test 4b(iv) all-read-empty emits it per dropped day.)
- **NO write-time date prune (R12):** do NOT intersect against `dates.showDays` at write; date-domain hiding is at PROJECTION read (D-4). A confirmed day stays stored even if its date transiently drops.

The `run_of_show` warnings flow through the existing `parse_warnings` channel — append them to `parseResult.warnings` so they persist to `shows_internal.parse_warnings` (existing plumbing — the `upsertShowsInternal` upsert at `runScheduledCronSync.ts:1324` writes `payload.parse_warnings`, sourced from `parseResult.warnings` at `applyParseResult.ts:128`). `AGENDA_GRID_MALFORMED` / `AGENDA_BLOCK_UNRESOLVED` / `AGENDA_DAY_AMBIGUOUS` / `AGENDA_DAY_TRUNCATED` are emitted by `parseAgenda` in §01; **`AGENDA_DAY_EMPTIED` is the one the SYNC emits** (it needs prior-stored knowledge the parser lacks), so the sync constructs it via the **`agendaDayEmptied(index, iso)` helper imported from `lib/parser`** (defined in §01 so its `code:"AGENDA_DAY_EMPTIED"` literal is extracted by `scripts/extract-internal-code-enums.ts:70`, which scans `lib/parser` only) and appends the returned `ParseWarning`. **Do NOT inline a fresh `code:"AGENDA_DAY_EMPTIED"` literal in `lib/sync`** — it would not be extracted and `x2-no-raw-codes` would fail.

**Ordering invariant (load-bearing):** the sync MUST append `AGENDA_DAY_EMPTIED` to `parseResult.warnings` **BEFORE** the apply builds the `upsertShowsInternal` payload (`applyParseResult.ts:121-128` reads `args.parseResult.warnings`) AND before any sync_log write of warnings (below) — otherwise the warning lands in neither persisted channel. Since the `AGENDA_DAY_EMPTIED` computation lives in `applyParseResult` (the Layer decision below) and it both mutates `parseResult.warnings` and builds the payload from the same array, do the append first, then build the payload — assert this in the test (the captured `parse_warnings` includes `AGENDA_DAY_EMPTIED`).

**FIX-3 — D-7 requires BOTH `shows_internal.parse_warnings` AND `sync_log.parse_warnings`; the live cron path writes only the former (branch b).** Spec D-7 says parser warnings persist to BOTH channels. **Live finding (verified):** on the scheduled-cron/applied-sync path, `sync_log.parse_warnings` is populated from `SyncLogEntry.payload` (`runScheduledCronSync.ts:794-808` — `insertSyncLog` wraps `entry.payload` into a single-element array at `:805`; the column type is at `:191`), a per-OUTCOME diagnostic object — **NOT** from `parseResult.warnings`. A grep for `parseResult.warnings` / `.warnings` against `runScheduledCronSync.ts` finds NO caller threading the parser warnings into the cron success-path sync_log row. So today the parser's `warnings` array reaches `shows_internal.parse_warnings` ONLY (via the `:1324` upsert). (Other paths DO carry warnings to sync_log — `runOnboardingScan.ts:457`, `applyStaged.ts:1503`, `syncLog.ts:36` — but the cron applied-sync success row does not.) **This is branch (b): add the wiring + a test.** The cron success sync_log row flows through the `logSync(...)` wrapper (`runScheduledCronSync.ts:1608-1623`), called for the applied outcome at `:2309` (and `:2051`); it builds a `SyncLogEntry` (`:187-192`) from `result` + an optional per-outcome `payload`, then `deps.logSync` → `insertSyncLog` (`:794-808`) writes `$5` `parse_warnings` from `entry.payload` wrapped in a single-element array (`:805`). There is currently NO `parseWarnings` field on the entry. Wiring (additive, applied-outcome only):
  1. Extend `SyncLogEntry` (`:187-192`) with `parseWarnings?: ParseResult["warnings"]`.
  2. In `logSync` (`:1608-1623`), for `result.outcome === "applied"` ONLY, set `entry.parseWarnings = <the applied result's parseResult.warnings>` (the already-`AGENDA_DAY_EMPTIED`-appended array — thread it onto the `applied` `ProcessOneFileResult` if not already carried, or read it from the pipeline result; do NOT set it on skip/error outcomes). Guard `if ("skipped" in result) return;` stays as-is (`:1614`).
  3. In `insertSyncLog` (`:794-808`), union the warnings into `$5`: `[...(entry.payload ? [{ ...entry.payload, outcome: entry.outcome }] : []), ...(entry.parseWarnings ?? [])]`. This preserves the existing per-outcome payload row AND appends the parse warnings.
  **Scope caution (flag in the commit body):** `SyncLogEntry`/`logSync`/`insertSyncLog` are shared cron-path plumbing. The change MUST be additive (a new optional field, populated only for the `applied` outcome) and MUST NOT alter the skip/error/source_gone sync_log shapes (which carry no parse). If wiring `parseResult.warnings` onto the `applied` `ProcessOneFileResult` proves to widen the blast radius beyond run-of-show (e.g. forces a signature change across `processOneFile`), STOP and raise it rather than reshaping the shared sync-log contract — the `shows_internal.parse_warnings` channel already carries the warning, so this is the secondary D-7 channel, not the primary observability path.
  **Test** (in `tests/sync/runOfShowConfirmedReplace.test.ts`, via the in-memory harness capturing BOTH the `upsertShowsInternal` payload AND the `logSync`/`insertSyncLog` entry): a sync that emits `AGENDA_DAY_EMPTIED` writes it to **BOTH** `shows_internal.parse_warnings` (the `upsertShowsInternal` payload — already asserted) AND the applied-outcome `sync_log.parse_warnings` row — assert the captured sync_log `parse_warnings` array contains an entry with `code === "AGENDA_DAY_EMPTIED"`, and assert a NON-emitting (clean) sync's applied sync_log row does NOT carry it. _Catches: D-7's dual-channel persistence silently degraded to single-channel on the cron path (admin loses the sync_log freshness trail)._

> **Layer decision (state in the apply code comment):** the confirmed-replace + `AGENDA_DAY_EMPTIED` computation lives in `applyParseResult.ts` (the harness-agnostic apply core, which already builds the `upsertShowsInternal` payload at `:121-130`) so the in-memory harness exercises the COMPUTATION without Postgres. But the prior stored `run_of_show` it compares against MUST be plumbed from the real `applyShowSnapshot` (see the next subsection) — a fake-snapshot-only unit test would pass while the live path silently never populates `priorRunOfShow`. The Postgres `upsertShowsInternal` impl just persists the computed `run_of_show` in the upsert `do update set`.

**Prior-run_of_show snapshot plumbing (the FULL live path — R6 HIGH; this subsection owns it end-to-end so the vector does not recur):**
1. **Type:** extend `ApplyParseResultSnapshot` (`applyParseResult.ts:13-17`) with `priorRunOfShow?: Record<string, AgendaEntry[]> | null` (import `AgendaEntry` from `@/lib/parser/types`).
2. **Producer interface:** extend the `Phase2Tx.applyShowSnapshot` return `"updated"` branch (`phase2.ts:49-59`) with `priorRunOfShow?: Record<string, AgendaEntry[]> | null` (sibling of `previousCrewNames`/`previousCrewMembers`). The `snapshot` built at `phase2.ts:264` then carries it, and it flows into `applyParseResult(tx, { …, snapshot })` (`phase2.ts:343-350`) as `args.snapshot.priorRunOfShow`.
3. **Postgres producer:** in the `applyShowSnapshot` impl (`runScheduledCronSync.ts:938-1165`), after the existing-show lookup (`:939-942`, `existing.id`), add a prior-row read — `existing ? await this.one<{ run_of_show: Record<string, AgendaEntry[]> | null }>("select run_of_show from public.shows_internal where show_id = $1 limit 1", [existing.id]) : null` — and add `priorRunOfShow: prior?.run_of_show ?? null` to the `"updated"` return (`:1146-1164`). (A first-seen show has no prior `shows_internal` row → `priorRunOfShow: null`, the correct "nothing previously stored" signal.) Decode defensively if the column could be a double-encoded string (reuse the project's `decodeJsonbColumn` if the postgres.js driver returns a string for this jsonb; for the in-lock raw-tx path it typically returns the parsed object — match the existing `parse_warnings`/`financials` read shape at `:532-543`/`:485` for the decode convention).
4. **Consumer:** in `applyParseResult` (`:80-128`), compute the `AGENDA_DAY_EMPTIED` set by comparing `parseResult.runOfShow` against `args.snapshot.priorRunOfShow` (a day is "previously stored" iff `priorRunOfShow?.[d]?.length > 0`), emit via the `agendaDayEmptied(index, iso)` helper, and **append to `parseResult.warnings` BEFORE the `upsertShowsInternal` payload is built at `:128`** (the ordering invariant above). The unlocatable-grid path stays `AGENDA_GRID_MALFORMED`-only (no EMPTIED) — keep the R1 split.
5. **Single concrete impl (verified):** there is exactly ONE `applyShowSnapshot` IMPLEMENTATION — the Postgres `PostgresPipelineTx.applyShowSnapshot` at `runScheduledCronSync.ts:938` (the staged/onboarding paths in `applyStaged.ts`/`applyStagedCore.ts` route through the SAME shared `Phase2Tx` via `makeSyncPipelineTx`, they do not re-implement it). So the step-3 edit covers all live apply paths. Still run `rg "applyShowSnapshot" lib/sync/` during execution to confirm no second impl was added since plan time; if one exists, add `priorRunOfShow` there too (a return that omits it makes `priorRunOfShow` `undefined` → treated as "nothing prior" → no EMPTIED on that path; populate it wherever a `shows_internal` row is readable to keep observability complete). State what the grep found in the commit body.

**Payload type edit (`applyParseResult.ts:28-40`):** add `run_of_show: Record<string, import("@/lib/parser/types").AgendaEntry[]> | null;` to the `upsertShowsInternal` payload object type.

**SQL edit (`runScheduledCronSync.ts:1324-1331`) — verbatim target shape:**
```sql
insert into public.shows_internal (show_id, financials, parse_warnings, raw_unrecognized, run_of_show)
values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
on conflict (show_id)
do update set
  financials = excluded.financials,
  parse_warnings = excluded.parse_warnings,
  raw_unrecognized = excluded.raw_unrecognized,
  run_of_show = excluded.run_of_show
```
> Pass the computed `run_of_show` object (or `null`) as `$5` — do NOT `JSON.stringify` it (postgres.js serializes `$N::jsonb` itself; a manual stringify double-encodes — see the postgres.js jsonb param trap). (The prior `run_of_show` is read by `applyShowSnapshot` per the snapshot-plumbing subsection — NOT in this upsert and NOT at the Phase-1 `:532-543` read.)

**Failing test (CODE) — PART A: the in-memory COMPUTATION harness (proves the confirmed-replace + EMPTIED logic given a snapshot), derives nothing from hardcoded counts:**
```ts
// drives applyParseResult with a fake Phase2Tx capturing the upsertShowsInternal payload + warnings,
// passing a snapshot whose priorRunOfShow is set directly (model on the existing applyParseResult unit tests).
// NOTE: this PART proves the computation only; PART B (below) proves applyShowSnapshot actually POPULATES
// priorRunOfShow on the live path — a fake-snapshot test alone would pass even if the live plumbing were dead (R6).
import { describe, it, expect } from "vitest";
import { applyParseResult } from "@/lib/sync/applyParseResult";
// ... build a baseParseResult + a fakeTx capturing upsertShowsInternal args + a snapshot carrying priorRunOfShow

const d1 = "2026-06-24", d2 = "2026-06-25";
const e1 = [{ start: "9:00 AM", title: "Keynote A" }];
const e1b = [{ start: "9:00 AM", title: "Keynote A v2" }];
const e2 = [{ start: "1:00 PM", title: "Panel B" }];

describe("sync run_of_show CONFIRMED-ONLY full replace (D-2 / R17/R21/R22)", () => {
  it("(i) one block unresolved (d2 absent) → stored {d1:e1}, d2 NOT preserved", async () => {
    // prior {d1:[old], d2:e2}; parsed {d1:e1}  → write {d1:e1}; AGENDA_DAY_EMPTIED NOT emitted (d2 absent, not read-empty)
    // → assert captured payload.run_of_show === { [d1]: e1 } and does NOT contain d2
  });
  it("(ii) grid unlocatable (parsed.runOfShow === undefined) → stored null + AGENDA_GRID_MALFORMED ONLY (zero AGENDA_DAY_EMPTIED)", async () => {
    // prior {d1:e1, d2:e2} (BOTH previously stored — makes the no-EMPTIED assertion load-bearing);
    // parsed.runOfShow=undefined → payload.run_of_show === null;
    // warnings: EXACTLY ONE AGENDA_GRID_MALFORMED, and ZERO AGENDA_DAY_EMPTIED for d1/d2 (an unlocatable grid
    // is a conversion fault, NOT a per-day blanking — emitting AGENDA_DAY_EMPTIED here would mask the fault mode, R22).
    // const codes = captured.parse_warnings.map(w => w.code);
    // expect(codes.filter(c => c === "AGENDA_GRID_MALFORMED")).toHaveLength(1);
    // expect(codes).not.toContain("AGENDA_DAY_EMPTIED");
  });
  it("(iii) previously-stored day goes read-empty → dropped + AGENDA_DAY_EMPTIED for that day", async () => {
    // prior {d1:e1, d2:e2}; parsed {d1:e1b, d2:[]} → payload === {d1:e1b}; warnings include AGENDA_DAY_EMPTIED (d2)
  });
  it("(iv) all read-empty → stored null + AGENDA_DAY_EMPTIED for every previously-stored day", async () => {
    // prior {d1:e1, d2:e2}; parsed {d1:[], d2:[]} → payload === null; warnings include AGENDA_DAY_EMPTIED x2
  });
  it("(vi) first-time read-empty (no prior) → stored null, NO AGENDA_DAY_EMPTIED", async () => {
    // prior null; parsed {d1:[], d2:[]} → payload === null; warnings has NO AGENDA_DAY_EMPTIED
  });
  it("(vii) self-heal: a later confirmed re-sync re-stores the day", async () => {
    // prior null (post-drop); parsed {d2:e2} → payload === {d2:e2} (no permanent loss)
  });
  it("NO write-time date prune (R12): a confirmed day whose date is absent from dates.showDays is still stored", async () => {
    // parsed {d2:e2} but snapshot dates.showDays = [d1] → payload STILL contains d2 (date hiding is at read, not write)
  });
  it("FIX-3 / D-7 dual-channel: an AGENDA_DAY_EMPTIED-emitting sync writes it to BOTH shows_internal.parse_warnings AND the applied sync_log.parse_warnings", async () => {
    // prior {d1:e1, d2:e2}; parsed {d1:e1b, d2:[]} (read-empty d2 → AGENDA_DAY_EMPTIED)
    // → captured upsertShowsInternal.parse_warnings includes AGENDA_DAY_EMPTIED (already covered by (iii))
    // → captured applied-outcome logSync/insertSyncLog entry's parse_warnings array ALSO includes an entry with code "AGENDA_DAY_EMPTIED"
    //   (the same already-appended parseResult.warnings reaches both sinks; the append happens BEFORE both writes)
    // expect(syncLogEntry.parse_warnings.some(w => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
  });
  it("FIX-3 negative: a clean confirmed sync's applied sync_log row carries NO AGENDA_* warning", async () => {
    // prior {d1:e1}; parsed {d1:e1b} (confirmed, no empties) → applied sync_log parse_warnings has no AGENDA_DAY_EMPTIED
    // catches: a wiring that unconditionally floods sync_log, or that touches skip/error rows
  });
});
```

**Failing test (CODE) — PART B: the LIVE-PATH plumbing test (proves `applyShowSnapshot` actually populates `priorRunOfShow`, R6).** This is the load-bearing addition: a fake-`applyParseResult`-snapshot test (PART A) passes even if the Postgres `applyShowSnapshot` never reads `shows_internal.run_of_show`. PART B drives the REAL `runPhase2` → `applyShowSnapshot` → `applyParseResult` path against a fake `Phase2Tx` whose `applyShowSnapshot` impl reads a SEEDED prior `run_of_show` (mirroring the Postgres SELECT) and returns it as `priorRunOfShow`, capturing the `upsertShowsInternal` payload AND the `logSync` entry. It asserts the prior value actually FLOWED through the snapshot into the EMPTIED computation:
```ts
// Model on the existing runPhase2 / phase2.ts integration tests under tests/sync/ (a fake Phase2Tx covering
// applyShowSnapshot + the apply-core methods). The fake applyShowSnapshot MUST return priorRunOfShow from a
// seeded prior store — proving the field is plumbed end-to-end (interface → snapshot → applyParseResult).
import { describe, it, expect } from "vitest";
import { runPhase2 } from "@/lib/sync/phase2"; // confirm the real entry export name when writing

describe("run_of_show AGENDA_DAY_EMPTIED — LIVE snapshot plumbing (R6)", () => {
  it("a seeded prior day that parses read-empty emits AGENDA_DAY_EMPTIED via the REAL applyShowSnapshot→applyParseResult path", async () => {
    // fakeTx.applyShowSnapshot returns { outcome:"updated", showId, previousCrewNames:[], priorRunOfShow: { [d2]: e2 } }
    //   (this models the Postgres impl's new `select run_of_show from shows_internal` — the SEED is the prior store)
    // parseResult.runOfShow = { [d1]: e1, [d2]: [] }  (d2 read-empty in a LOCATED grid)
    // run the real runPhase2(args) so applyParseResult consumes args.snapshot.priorRunOfShow (NOT a hand-built snapshot)
    // → captured upsertShowsInternal.run_of_show === { [d1]: e1 }  (d2 dropped — CONFIRMED-ONLY)
    // → captured upsertShowsInternal.parse_warnings includes an AGENDA_DAY_EMPTIED for d2
    // → captured applied logSync entry's parse_warnings ALSO includes AGENDA_DAY_EMPTIED (dual-channel)
    // FAILS if applyShowSnapshot's return omits priorRunOfShow (the field never reaches applyParseResult → no EMPTIED).
  });
  it("self-heal on the live path: a later sync re-confirming d2 re-stores it (no permanent loss)", async () => {
    // applyShowSnapshot returns priorRunOfShow: null (post-drop); parseResult.runOfShow = { [d2]: e2 }
    // → captured upsertShowsInternal.run_of_show === { [d2]: e2 }, NO AGENDA_DAY_EMPTIED
  });
});
```
> **Negative-regression check (mandatory, per the project's tautology rule):** before committing, temporarily make the new `applyShowSnapshot` return OMIT `priorRunOfShow` (or return `priorRunOfShow: undefined`) and confirm the PART-B "emits AGENDA_DAY_EMPTIED" test FAILS — proving the test actually exercises the live plumbing, not just the in-memory computation. Restore, then commit. (This is the discipline that catches the R6 class: a test that passes with the plumbing dead is worse than no test.)

**Run-fails:** `pnpm vitest run tests/sync/runOfShowConfirmedReplace.test.ts` → red. _Failure this catches: ANY non-confirmed shape (unresolved/unlocatable/read-empty) preserving-and-showing stale agenda (R17/R21/R22); a confirmed day wrongly dropped by a transient DATES drop (R12); a missing/spurious `AGENDA_DAY_EMPTIED`; **the unlocatable-grid path mis-emitting `AGENDA_DAY_EMPTIED` for prior-stored days** (case (ii)); **and (PART B) the prior `run_of_show` never reaching `applyParseResult` because `applyShowSnapshot` didn't populate `priorRunOfShow` — the R6 dead-live-path class**._

**Minimal impl (the full live path — per the snapshot-plumbing subsection):** (1) extend `ApplyParseResultSnapshot` (`applyParseResult.ts:13-17`) with `priorRunOfShow`; (2) extend `Phase2Tx.applyShowSnapshot`'s `"updated"` return (`phase2.ts:49-59`) with `priorRunOfShow`; (3) in the Postgres `applyShowSnapshot` impl (`runScheduledCronSync.ts:938-1165`) add the `select run_of_show from public.shows_internal where show_id = existing.id` read + return `priorRunOfShow`; (4) in `applyParseResult` compute the confirmed-replace value and emit `AGENDA_DAY_EMPTIED` (via the **`agendaDayEmptied` helper imported from `lib/parser`**) ONLY for prior-stored days (`args.snapshot.priorRunOfShow?.[d]?.length > 0`) that parsed read-empty `[]` in a LOCATED grid — never on the `parsed.runOfShow === undefined` path (`AGENDA_GRID_MALFORMED` only) — appending to `parseResult.warnings` BEFORE the `:128` payload build; (5) thread `run_of_show` through the `upsertShowsInternal` payload + the SQL upsert (`:1318-1334`); (6) the FIX-3 dual-channel sync_log wiring. Keep everything inside the existing locked apply tx — add NO `pg_advisory*` call. **Do NOT touch `runScheduledCronSync.ts:532-543` (the Phase-1 parse snapshot — wrong surface).**

**Run-passes:** `pnpm vitest run tests/sync/runOfShowConfirmedReplace.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` → green (topology unchanged). `pnpm typecheck` clean.

**Commit:** `feat(sync): CONFIRMED-ONLY full-replace write of shows_internal.run_of_show under the per-show lock`

---

## Task 02.5 — Projection: `getShowForViewer.runOfShow` (unconditional read + date∩DateRestriction intersection + tileErrors)

**Files:**
- EDIT `lib/data/getShowForViewer.ts` — the `ShowForViewer` type (`:95-198`, add `runOfShow`), the read block (NEW try/catch alongside hotel/rooms, `:342-469`), and the return literal (`:539-555`).
- EDIT `tests/fixtures/showForViewer.ts` — the typed `makeShowForViewer` builder's `DEFAULT: ShowForViewer` object (`tests/fixtures/showForViewer.ts:60-106`). **Adding `runOfShow` as a NON-optional `ShowForViewer` field breaks this builder** — its `DEFAULT` constructs a complete `ShowForViewer`, so `tsc` fails on the missing required key (and §03's planned `makeShowForViewer({ runOfShow })` overrides won't typecheck) unless updated in THIS task. Add `runOfShow: null,` to `DEFAULT` (after `tileErrors: {}` at `:103`, before `viewerName`). `runOfShow` is NOT a special-cased key in the builder (`rooms`/`financials` are the only ones — `:166`), so the generic `deepMergeObjects` path handles a `{ runOfShow }` override; per the `DeepPartial` array-leaf rule each day's `AgendaEntry[]` is REPLACED wholesale (correct for a `Record` of arrays). No new import needed (`AgendaEntry` flows transitively through `ShowForViewer`).
- NEW `tests/data/getShowForViewerRunOfShow.test.ts`.

**Interfaces (from `00-overview.md` line 52-63; verified live):**
- Add to `ShowForViewer` (sibling of `show:` at `:96` / `financials?:` at `:170`): `runOfShow: Record<string, AgendaEntry[]> | null;` (NON-optional — always emitted, `null` when empty/no-agenda).
- Read `shows_internal.run_of_show` via the service-role client (`createSupabaseServiceRoleClient()`, `:201`) **UNCONDITIONALLY for every viewer** — NOT `if (isLead)` (that gate at `:481` is financials-only; `run_of_show` is date-gated, not lead-gated). Put it in a NEW `try/catch` alongside hotel (`:342-366`) / rooms (`:374-403`): `const r = await supabase.from("shows_internal").select("run_of_show").eq("show_id", showId).maybeSingle();` then `if (r.error) tileErrors["run_of_show"] = r.error.message; else { decode … }`, with `catch (e) { tileErrors["run_of_show"] = e instanceof Error ? e.message : String(e); }`. `tileErrors` is built at `:336` (the existing 5 domains hotel/rooms/transportation/contacts/financials).
- **Invariant 9 (Supabase call-boundary) — inline waiver REQUIRED.** This is a NEW Supabase call site, so invariant 9 demands EITHER a structural-meta-test registry row OR an inline `// not-subject-to-meta: <reason>` comment. The registry branch does NOT apply (`_metaInfraContract` is auth-domain-scoped — its orphan scan at `tests/auth/_metaInfraContract.test.ts:258-259` walks only `lib/auth`/`app/auth`/`app/api/auth`/`app/api/show`, NOT `lib/data`), so the **inline-waiver branch is the applicable option** — it is NOT exempt. Place the waiver comment immediately above the `.from("shows_internal").select("run_of_show")` read (verbatim):
  ```ts
  // not-subject-to-meta: lib/data is outside _metaInfraContract's auth-domain scan
  // (tests/auth/_metaInfraContract.test.ts:258-259 walks lib/auth/app/auth/app/api/auth/app/api/show only);
  // the { data, error } boundary is pinned by the behavioral returned-error + thrown-exception tests below.
  ```
  The behavioral tests below (returned `error` AND thrown exception each → `runOfShow=null` + `tileErrors["run_of_show"]`, no raw infra text in the crew DOM) are the ENFORCEMENT; the comment is the invariant-9 marker. NOTE: file `BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST` in `docs/superpowers/plans/BACKLOG.md` as a future structural guard for `lib/data` Supabase reads (out of Phase-2 scope — the waiver is the in-scope discharge).
- Decode via **`decodeRunOfShow(r.data?.run_of_show ?? null)`** (Task 02.3) — the `?? null` is LOAD-BEARING: the read uses `.maybeSingle()`, so a legitimate NO-ROW result (a show with no `shows_internal` row yet — the common no-agenda case) returns `{ data: null, error: null }`, making `r.data?.run_of_show` `undefined`. The decoder treats a non-null non-object top level (incl. `undefined`) as CORRUPT → without the coercion it would set `tileErrors["run_of_show"]` and fire a FALSE projection alert on the common no-row case. Coercing `undefined → null` hits the decoder's `null → { value: null, corrupt: false }` branch (Task 02.3 contract — `null` input is the legitimate empty state, NO `tileErrors`). `corrupt === true` → also set `tileErrors["run_of_show"]` (a fixed string like `"run_of_show decode: corrupt stored shape"` — NOT raw infra text); `value` is the decoded `Record | null`.
- **Intersection (D-4):** emit `runOfShow` = decoded keys ∩ **current `dates.showDays`** ∩ **viewer `DateRestriction`**. Compute the allowed-ISO-day set from the show's `dates.showDays` (the decoded `show.dates`, `:251-256`) and the ACTIVE viewer's normalized `DateRestriction`:
  - `unknown_asterisk` → allowed = `∅` (cannot infer show days) → `runOfShow` keys all dropped.
  - `explicit` → allowed = `restriction.days` (already ISO via `normalizeDateRestriction`, `lib/data/normalizeDateRestriction.ts:119-157`) ∩ `dates.showDays`.
  - `none` → allowed = all current `dates.showDays`.
  Drop any `run_of_show` key NOT in `allowed`. If nothing survives → `runOfShow = null`.
  > The active viewer's normalized `DateRestriction` is the one already computed for the matching `crewMembers[]` row (`:319-325`); for an `admin` / `admin_preview` viewer with no per-day restriction, treat as `none` (all current show days) — match the Schedule day-set behavior. Confirm the active-viewer resolution against how `viewerName` / the crew lookup resolves the active row (`:204` onward) and reuse it; do NOT re-query.
- Emit in the return literal (`:539-555`): add `runOfShow,` (always present). NEVER add `run_of_show`/`runOfShow` to `ShowRow` or `public.shows`.

**Failing test (CODE) — anti-tautology: the date-intersection case asserts storage is unaffected while the key is hidden at read:**
```ts
import { describe, it, expect, vi } from "vitest";
import { getShowForViewer } from "@/lib/data/getShowForViewer";
// mock createSupabaseServiceRoleClient so .from("shows_internal").select("run_of_show") returns a controllable
// { data, error }; model on the existing getShowForViewer unit tests' supabase mock.

const d1 = "2026-06-24", d2 = "2026-06-25";
const e = [{ start: "9:00 AM", title: "Keynote" }];

describe("getShowForViewer.runOfShow projection (D-4)", () => {
  it("reads UNCONDITIONALLY (not lead-gated) — a non-lead crew viewer still gets runOfShow", async () => {
    // stored {d1:e}; dates.showDays=[d1]; viewer = non-lead crew, DateRestriction none → result.runOfShow === {d1:e}
  });
  it("no shows_internal row (maybeSingle → { data:null, error:null }) → runOfShow null, NO tileErrors (legitimate empty)", async () => {
    // the common no-agenda case: .maybeSingle() returns { data:null, error:null } → r.data?.run_of_show is undefined
    // → decodeRunOfShow(undefined ?? null) → null/not-corrupt → result.runOfShow===null AND result.tileErrors has NO run_of_show key.
    // catches: a FALSE projection alert on every show without a shows_internal row (the ?? null coercion regression).
    // expect(result.runOfShow).toBeNull(); expect(result.tileErrors).not.toHaveProperty("run_of_show");
  });
  it("explicit DateRestriction → only assigned-day keys", async () => {
    // stored {d1:e, d2:e}; explicit days=[d2] → result.runOfShow === {d2:e}
  });
  it("unknown_asterisk → no keys", async () => {
    // stored {d1:e}; unknown_asterisk → result.runOfShow === null
  });
  it("current-date intersection: a key NOT in dates.showDays is dropped at read while STORAGE is unaffected (R10/R12)", async () => {
    // stored {d1:e, d2:e}; dates.showDays=[d1] (d2 removed); viewer none
    // → result.runOfShow === {d1:e}  AND  the mock's returned stored row STILL contains d2
    //   (assert the read query was a plain select with no write/delete — storage untouched)
  });
  it("returned error → runOfShow null + tileErrors.run_of_show set, no raw infra text in result", async () => {
    // .select returns { data:null, error:{ message:"db boom" } } → result.runOfShow===null; result.tileErrors.run_of_show is set
  });
  it("thrown exception (network) → runOfShow null + tileErrors.run_of_show set", async () => {
    // .select rejects → caught → same fail-soft
  });
  it("corrupt stored shape ([null]) → runOfShow null + tileErrors.run_of_show set (decode failsoft, no throw)", async () => {
    // stored { d1: [null] } → decodeRunOfShow corrupt → tileErrors.run_of_show set, result.runOfShow===null, no throw
  });
  it("ShowRow / result.show carries NO run_of_show key (D-3 boundary)", async () => {
    expect(Object.keys((await /* render */ ({} as any)).show ?? {})).not.toContain("run_of_show");
    // (fill via the real render; the load-bearing assertion is result.show has no run_of_show/runOfShow key)
  });
});
```

**Run-fails:** `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts` → red. _Failure this catches: a lead-gated (wrong) read; an ungated projection leaking other-day session content to restricted crew; the new internal-table read swallowing an error (missing `tileErrors`) or leaking raw infra text; a corrupt shape crashing the projection; `run_of_show` accidentally riding `ShowRow`/`public.shows`._

**Minimal impl:** add the type field, the unconditional service-role read block + decode (`decodeRunOfShow(r.data?.run_of_show ?? null)` — the `?? null` coercion, FIX-2) + `tileErrors` hook, the date∩DateRestriction intersection, and the return-literal emission as specified. Import `decodeRunOfShow`. Update `tests/fixtures/showForViewer.ts` `DEFAULT` with `runOfShow: null` IN THIS TASK (else `tsc` breaks). **Add the inline `// not-subject-to-meta:` waiver comment (verbatim above) immediately above the `.from("shows_internal").select("run_of_show")` read — invariant 9 requires the marker even though `lib/data` is outside `_metaInfraContract`'s scan.** The behavioral returned-error + thrown-exception tests are the boundary enforcement.

**Fixture typecheck note:** after adding `runOfShow: null` to `DEFAULT`, confirm `makeShowForViewer({ runOfShow: { "2026-05-14": [{ start: "8:00 AM", title: "X" }] } })` typechecks (the override is a valid `DeepPartial<ShowForViewer>` and merges as a `Record` replacement). A `pnpm typecheck` over the fixtures + any test that exercises this override is the assertion; no separate runtime test is required (the builder is type-only infrastructure).

**Run-passes:** `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts` → green. `pnpm typecheck` clean (fixtures included).

**Commit:** `feat(crew-page): project shows_internal.run_of_show with date∩DateRestriction gate + fail-soft tileErrors`

---

## Task 02.6 — `run_of_show` as a first-class `failedKeys` domain (CrewShell alert test)

**Files:** EDIT `tests/components/crew/crewShell.test.tsx` (the `failedKeys` describe block, ~`:441-462`).

**Interfaces (from `00-overview.md` line 78 CORRECTION + spec §4.4 R20):** there is NO existing test enumerating the 5 `failedKeys` domains "to extend to 6" — the domain set is implicit in the 5 `tileErrors[...]` keys in `getShowForViewer.ts`, and `CrewShell` sends the render's OWN unfiltered `tileErrors` keys as `context.failedKeys` (`crewShell.test.tsx:437-462` pins this with `financials`/`transportation`). The `upsert_admin_alert` DB-side union-merge already accepts arbitrary domains; `TILE_PROJECTION_FETCH_FAILED` copy is domain-agnostic. So Phase 2 needs NO `_metaAdminAlertCatalog` change, NO §12.4 change, NO `upsert_admin_alert` change — only a NEW per-domain case asserting `run_of_show` flows into `failedKeys`. Do NOT edit the existing `["financials", "transportation"]` enumeration test to expect a 6th element — ADD a focused case.

**Failing test (CODE) — add to the `failedKeys` describe block:**
```ts
it("run_of_show is a first-class failedKeys domain (viewer-independent — present on a plain crew render)", async () => {
  upsertAdminAlert.mockResolvedValue("alert-ros");
  await renderShell({
    data: makeData({ tileErrors: { run_of_show: "boom" } }),
    viewer: { kind: "crew", crewMemberId: HAND_ID }, // a NON-lead crew member
    showId: "show-ros-keys",
  });
  const arg = upsertAdminAlert.mock.calls[0]![0] as { context: { failedKeys: string[] } };
  expect(arg.context.failedKeys).toContain("run_of_show");
});
```

**Run-fails:** run BEFORE Tasks 02.3/02.5 are wired into the render? No — this test is purely about `CrewShell`'s `tileErrors → failedKeys` pass-through, which already exists. The test goes green immediately IF the pass-through already forwards arbitrary keys. To prove it is a real regression guard (not tautological): temporarily stub `CrewShell` to filter `failedKeys` to a hardcoded 5-domain allowlist and confirm THIS test fails (negative-regression check, then revert the stub). Document that in the test comment. _Failure this catches: a future allowlist that drops `run_of_show` from the admin alert (split-brain — produced domain left unasserted)._

**Run-passes:** `pnpm vitest run tests/components/crew/crewShell.test.tsx` → green.

**Commit:** `test(crew-page): pin run_of_show as a first-class failedKeys alert domain`

---

## §02 exit checklist

Run the full set; every item must be true before handing off to §03:

- [ ] **Column live in validation:** `run_of_show` exists on `public.shows_internal` in the validation project (applied surgically via `supabase db query --linked`) AND locally on `$TEST_DATABASE_URL`; NOT on `public.shows`.
- [ ] **Manifest committed:** `supabase/__generated__/schema-manifest.json` regenerated (`pnpm gen:schema-manifest`) with `run_of_show` on `shows_internal` and the `shows_internal` DML grants reflecting the REVOKE; staged + committed.
- [ ] **REVOKE + registry same commit:** `20260619000001_lockdown_shows_internal.sql` (REVOKE insert/update/delete from anon,authenticated; SELECT + admin_only RLS + service_role all-privileges intact) AND the `shows_internal` row in `RPC_GATED_TABLES` landed in ONE commit; the bidirectional meta-test (`postgrest-dml-lockdown.test.ts:714`/`:738`) is green.
- [ ] **Lockdown DML-rejection green:** `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` — `shows_internal` anon/authenticated INSERT/UPDATE/DELETE rejected, SELECT permitted.
- [ ] **Projection + decoder + gating + failedKeys green:** `pnpm vitest run tests/data/decodeRunOfShow.test.ts tests/data/getShowForViewerRunOfShow.test.ts tests/sync/runOfShowConfirmedReplace.test.ts tests/components/crew/crewShell.test.tsx`.
- [ ] **AGENDA_DAY_EMPTIED live-path plumbing (R6):** `priorRunOfShow` is threaded `ApplyParseResultSnapshot` (`applyParseResult.ts:13-17`) ← `Phase2Tx.applyShowSnapshot` return (`phase2.ts:49-59`) ← the Postgres `applyShowSnapshot` `select run_of_show from public.shows_internal` (`runScheduledCronSync.ts:938-1165`); the PART-B live-path test asserts an emptied prior day fires `AGENDA_DAY_EMPTIED` through the REAL `runPhase2`→`applyParseResult` path, and the negative-regression check (omit `priorRunOfShow` → PART-B fails) was run. NO `priorRunOfShow` wiring at the Phase-1 `:532-543` read.
- [ ] **Advisory-lock topology unchanged:** `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` green; no new `pg_advisory*` holder added.
- [ ] **Validation-parity green:** `pnpm vitest run tests/db/validation-schema-parity.test.ts`.
- [ ] **Typecheck clean:** `pnpm typecheck`.
- [ ] **Boundary invariants:** `result.show` (`ShowRow`) carries NO `run_of_show`/`runOfShow` key; the `shows_internal.run_of_show` read is unconditional (every viewer), destructures `{ data, error }`, distinguishes returned-error from thrown, and surfaces both as `tileErrors["run_of_show"]` with no raw infra text in the crew DOM; the sync write is CONFIRMED-ONLY full-replace inside the existing per-show lock with no write-time date prune.

Hand off to `03-schedule-enrichment-closeout.md` (the per-day Schedule branch consuming `ShowForViewer.runOfShow`).
