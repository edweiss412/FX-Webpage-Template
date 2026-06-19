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
- EDIT `lib/sync/applyParseResult.ts:28-40` (the `Phase2Tx.upsertShowsInternal` payload type) + `:121-130` (the apply call site that builds the payload).
- EDIT `lib/sync/runScheduledCronSync.ts:1318-1334` (the `PostgresPipelineTx.upsertShowsInternal` SQL — add `run_of_show`) + `:532-543` (the snapshot read inside the locked tx — also `select run_of_show` so prior-stored days are known for `AGENDA_DAY_EMPTIED`).
- NEW `tests/sync/runOfShowConfirmedReplace.test.ts`.

**Interfaces + the CONFIRMED-ONLY rule (D-2 / spec §4.2 "Sync write path" / test 4b):** the sync write rides the EXISTING per-show advisory lock — `upsertShowsInternal` runs inside the locked apply transaction (`withShowLock` → `pg_try_advisory_xact_lock(hashtext('show:'||drive_file_id))`, `lib/sync/lockedShowTx.ts:59`). NO new lock holder; topology in `tests/auth/advisoryLockRpcDeadlock.test.ts` unchanged. The stored `shows_internal.run_of_show` becomes **exactly the latest parse's confirmed (non-empty) days** — there is NO per-day preserve/merge of prior entries.

Compute the write value from `parseResult.runOfShow` (camelCase parser field) + the prior stored `run_of_show` (read at `:532-543`):
- **`parsed.runOfShow === undefined` (grid UNLOCATABLE — converter/header failure)** → write **`null`** + emit **`AGENDA_GRID_MALFORMED` ONLY**. **Emit NO per-day `AGENDA_DAY_EMPTIED`** — even if the prior stored value held days. An unlocatable grid is a distinct conversion-fault state (spec §4.4 retention matrix row "Grid not locatable" → `AGENDA_GRID_MALFORMED`; §6 test 4b(ii)); emitting `AGENDA_DAY_EMPTIED` here would falsely tell the admin the SOURCE day was blanked, masking the real conversion/removed-tab fault mode and weakening the R22 observability contract. (Crew still see anchors for all days — CONFIRMED-ONLY; the difference is purely which warning the admin gets.)
- else (a **LOCATED** parsed `Record`) `merged = Object.fromEntries(Object.entries(parsed.runOfShow).filter(([, e]) => e.length > 0))`; if `merged` has no keys → write **`null`**, else write `merged`. A read-empty `[]` day and an unresolved/absent block are simply NOT written (→ they render anchors).
- **`AGENDA_DAY_EMPTIED` ONLY on the LOCATED-grid read-empty shape:** for each day that **was in the prior stored value** AND is **present-as-`[]` in `parsed.runOfShow`** (read-empty / blank titles in a located grid) but is NOT in the write value. Do NOT emit it for a day that is merely absent from the parsed `Record` (unresolved block — that gets `AGENDA_BLOCK_UNRESOLVED` from the parser), and do NOT emit it on the unlocatable-grid path (above). Use the prior stored value ONLY to decide which `AGENDA_DAY_EMPTIED` warnings to emit (observability) — NOT to preserve content. (Spec §4.4 retention matrix row "previously stored … read-empty" → `AGENDA_DAY_EMPTIED`; §6 test 4b(iv) all-read-empty emits it per dropped day.)
- **NO write-time date prune (R12):** do NOT intersect against `dates.showDays` at write; date-domain hiding is at PROJECTION read (D-4). A confirmed day stays stored even if its date transiently drops.

The `run_of_show` warnings flow through the existing `parse_warnings` channel — append them to `parseResult.warnings` so they persist to `shows_internal.parse_warnings` (existing plumbing). `AGENDA_GRID_MALFORMED` / `AGENDA_BLOCK_UNRESOLVED` / `AGENDA_DAY_AMBIGUOUS` / `AGENDA_DAY_TRUNCATED` are emitted by `parseAgenda` in §01; **`AGENDA_DAY_EMPTIED` is the one the SYNC emits** (it needs prior-stored knowledge the parser lacks), so the sync constructs it via the **`agendaDayEmptied(index, iso)` helper imported from `lib/parser`** (defined in §01 so its `code:"AGENDA_DAY_EMPTIED"` literal is extracted by `scripts/extract-internal-code-enums.ts:70`, which scans `lib/parser` only) and appends the returned `ParseWarning`. **Do NOT inline a fresh `code:"AGENDA_DAY_EMPTIED"` literal in `lib/sync`** — it would not be extracted and `x2-no-raw-codes` would fail.

> **Layer decision (state in the apply code comment):** the confirmed-replace + `AGENDA_DAY_EMPTIED` computation lives in `applyParseResult.ts` (the harness-agnostic apply core, which already builds the `upsertShowsInternal` payload at `:121-130`) so the in-memory test harness exercises it without Postgres. `applyParseResult` is handed the prior stored `run_of_show` via the snapshot (extend `ApplyParseResultSnapshot` / the snapshot read at `runScheduledCronSync.ts:532-543` to carry `priorRunOfShow: Record<string, AgendaEntry[]> | null`). The Postgres `upsertShowsInternal` impl just persists the computed `run_of_show` in the upsert `do update set`.

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
> Pass the computed `run_of_show` object (or `null`) as `$5` — do NOT `JSON.stringify` it (postgres.js serializes `$N::jsonb` itself; a manual stringify double-encodes — see the postgres.js jsonb param trap). The snapshot read at `:537` adds `, run_of_show` to its `select`.

**Failing test (CODE) — uses the in-memory apply harness, derives nothing from hardcoded counts:**
```ts
// drives applyParseResult with a fake Phase2Tx capturing the upsertShowsInternal payload + warnings
// (model on the existing applyParseResult unit tests under tests/sync/).
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
});
```

**Run-fails:** `pnpm vitest run tests/sync/runOfShowConfirmedReplace.test.ts` → red. _Failure this catches: ANY non-confirmed shape (unresolved/unlocatable/read-empty) preserving-and-showing stale agenda (R17/R21/R22); a confirmed day wrongly dropped by a transient DATES drop (R12); a missing/spurious `AGENDA_DAY_EMPTIED`; **the unlocatable-grid path mis-emitting `AGENDA_DAY_EMPTIED` for prior-stored days** (conflating the conversion-fault state with per-day blanking, masking the real fault mode — case (ii))._

**Minimal impl:** extend `ApplyParseResultSnapshot` + the snapshot read with `priorRunOfShow`; in `applyParseResult` compute the confirmed-replace value, and emit `AGENDA_DAY_EMPTIED` (via the **`agendaDayEmptied` helper imported from `lib/parser`**) ONLY for prior-stored days that parsed read-empty `[]` in a LOCATED grid — never on the `parsed.runOfShow === undefined` path (that emits `AGENDA_GRID_MALFORMED` only); thread `run_of_show` through the `upsertShowsInternal` payload; add `run_of_show` to the SQL upsert + the snapshot `select`. Keep everything inside the existing locked apply tx — add NO `pg_advisory*` call.

**Run-passes:** `pnpm vitest run tests/sync/runOfShowConfirmedReplace.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` → green (topology unchanged). `pnpm typecheck` clean.

**Commit:** `feat(sync): CONFIRMED-ONLY full-replace write of shows_internal.run_of_show under the per-show lock`

---

## Task 02.5 — Projection: `getShowForViewer.runOfShow` (unconditional read + date∩DateRestriction intersection + tileErrors)

**Files:**
- EDIT `lib/data/getShowForViewer.ts` — the `ShowForViewer` type (`:95-198`, add `runOfShow`), the read block (NEW try/catch alongside hotel/rooms, `:342-469`), and the return literal (`:539-555`).
- NEW `tests/data/getShowForViewerRunOfShow.test.ts`.

**Interfaces (from `00-overview.md` line 52-63; verified live):**
- Add to `ShowForViewer` (sibling of `show:` at `:96` / `financials?:` at `:170`): `runOfShow: Record<string, AgendaEntry[]> | null;` (NON-optional — always emitted, `null` when empty/no-agenda).
- Read `shows_internal.run_of_show` via the service-role client (`createSupabaseServiceRoleClient()`, `:201`) **UNCONDITIONALLY for every viewer** — NOT `if (isLead)` (that gate at `:481` is financials-only; `run_of_show` is date-gated, not lead-gated). Put it in a NEW `try/catch` alongside hotel (`:342-366`) / rooms (`:374-403`): `const r = await supabase.from("shows_internal").select("run_of_show").eq("show_id", showId).maybeSingle();` then `if (r.error) tileErrors["run_of_show"] = r.error.message; else { decode … }`, with `catch (e) { tileErrors["run_of_show"] = e instanceof Error ? e.message : String(e); }`. `tileErrors` is built at `:336` (the existing 5 domains hotel/rooms/transportation/contacts/financials).
- Decode via `decodeRunOfShow(r.data?.run_of_show)` (Task 02.3): `corrupt === true` → also set `tileErrors["run_of_show"]` (a fixed string like `"run_of_show decode: corrupt stored shape"` — NOT raw infra text); `value` is the decoded `Record | null`.
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

**Minimal impl:** add the type field, the unconditional service-role read block + decode + `tileErrors` hook, the date∩DateRestriction intersection, and the return-literal emission as specified. Import `decodeRunOfShow`.

**Run-passes:** `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts` → green. `pnpm typecheck` clean.

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
- [ ] **Advisory-lock topology unchanged:** `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` green; no new `pg_advisory*` holder added.
- [ ] **Validation-parity green:** `pnpm vitest run tests/db/validation-schema-parity.test.ts`.
- [ ] **Typecheck clean:** `pnpm typecheck`.
- [ ] **Boundary invariants:** `result.show` (`ShowRow`) carries NO `run_of_show`/`runOfShow` key; the `shows_internal.run_of_show` read is unconditional (every viewer), destructures `{ data, error }`, distinguishes returned-error from thrown, and surfaces both as `tileErrors["run_of_show"]` with no raw infra text in the crew DOM; the sync write is CONFIRMED-ONLY full-replace inside the existing per-show lock with no write-time date prune.

Hand off to `03-schedule-enrichment-closeout.md` (the per-day Schedule branch consuming `ShowForViewer.runOfShow`).
