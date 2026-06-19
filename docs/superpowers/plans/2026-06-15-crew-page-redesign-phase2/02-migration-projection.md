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
  it("is total over JSONB SHAPES — never throws on plain-data adversarial input", () => {
    // jsonb deserializes to PLAIN data (no getters/accessors), so totality is over malformed SHAPES,
    // not throwing accessors. These are the realistic adversarial inputs:
    expect(() => decodeRunOfShow({ "2026-01-01": [undefined, true, [], 0, { title: {} }] })).not.toThrow();
    expect(() => decodeRunOfShow({ "": [], "2026-13-99": [good], nested: { a: 1 } })).not.toThrow();
  });
});
```

**Run-fails:** `pnpm vitest run tests/data/decodeRunOfShow.test.ts` → red (module missing). _Failure this catches: corrupt JSONB reaching the `length > 0` UI branch as a render crash instead of a fail-soft anchor fallback + admin alert._

**Minimal impl:** write `lib/data/decodeRunOfShow.ts` implementing the contract above (plain-object check excludes arrays; `Array.isArray` for the day; per-entry validation with a try-free guard reading each field once; ISO key = `/^\d{4}-\d{2}-\d{2}$/`). Re-use the project's `shouldHideGenericOptional` import. Do NOT re-truncate field lengths (the decoder validates type; the UI caps length — §03/D-6). **Totality scope (R16):** `decodeRunOfShow` operates on **JSONB-shaped plain data** — the `shows_internal.run_of_show` column is `jsonb`, which postgres.js/Supabase-JS deserialize into plain objects/arrays/primitives with NO getters or throwing accessors. Its totality is therefore over malformed JSONB SHAPES (non-object top level, non-ISO key, non-array day, non-string/sentinel field — all covered above), NOT over throwing property reads (an impossible input). So the try-free per-field read is correct and consistent — there is no escaping throw to guard. (If a future caller ever passes non-JSONB data with live accessors, that is out of this decoder's contract.)

**Run-passes:** `pnpm vitest run tests/data/decodeRunOfShow.test.ts` → green. `pnpm typecheck` clean.

**Commit:** `feat(crew-page): add total deep-validating decodeRunOfShow JSONB decoder`

---

## Task 02.4 — Sync write: CONFIRMED-ONLY full-replace under the existing per-show lock

**Files:**
- EDIT `lib/sync/applyParseResult.ts` — the `ApplyParseResultSnapshot` type (`:13-17`, add `priorRunOfShow`), the `Phase2Tx.upsertShowsInternal` payload type (`:28-40`, add `run_of_show`), and the apply body (`:80-130`) where the `AGENDA_DAY_EMPTIED` computation + the `upsertShowsInternal` payload (`:121-130`) live.
- EDIT `lib/sync/phase2.ts` — the `Phase2Tx.applyShowSnapshot` RETURN type (`:49-59`, add `priorRunOfShow` to the `"updated"` branch) so the prior `shows_internal.run_of_show` reaches `ApplyParseResultSnapshot`. The snapshot is produced at `:264` and passed to `applyParseResult(tx, { …, snapshot })` at `:343-350`.
- EDIT `lib/sync/runScheduledCronSync.ts` — the **Postgres `applyShowSnapshot` implementation** (`:938-1165`): add a prior `shows_internal.run_of_show` SELECT keyed on the resolved `existing.id` (the existing-show lookup is at `:939-942`) and RETURN it as `priorRunOfShow` in the `"updated"` return object (`:1146-1164`). Also the `PostgresPipelineTx.upsertShowsInternal` SQL (`:1318-1334`) — add `run_of_show` to the upsert.
- EDIT `lib/sync/phase2.ts` for the **FIX-3 warning propagation out of `runPhase2`**: the `Phase2Result.applied` branch (`:114-118`, add optional `parseWarnings`) populated at the applied return (`:406-412`) — the apply-appended `AGENDA_DAY_EMPTIED` is on a LOCAL `parseResult` copy and is otherwise LOST at this boundary (see the FIX-3 re-analysis below).
- EDIT `lib/sync/runScheduledCronSync.ts` for the **FIX-3 dual-channel sync_log wiring** (D-7) + the **R16 STRUCTURAL DEFENSE**: make `parseWarnings` a **REQUIRED** field on the applied `ProcessOneFileResult` variant (`:165-170`) so `tsc` forces EVERY caller that constructs `{ outcome: "applied", … }` to supply it (a future 4th caller cannot silently drop it — see the R16 multi-caller note below). Populate it on the `result` built at `:2469-2474` (from `phase2.parseWarnings`); `emitSuccessfulPhase2Tail` (`:1724-1751`) — pass the warnings into the `logSync` call at `:1750` (the applied/success row logs HERE, NOT at `:2309` which is the SKIP branch); the `logSync` builder (`:1608-1623` — set `entry.parseWarnings` for the applied outcome only); the `SyncLogEntry` type (`:187-192`, add optional `parseWarnings`); the `insertSyncLog` impl (`:794-808` — union `entry.parseWarnings` into the `$5` `parse_warnings` array). See the FIX-3 re-analysis + the R16 caller-surface subsection below.
- EDIT `lib/sync/runManualStageForFirstSeen.ts` (R16 — 2nd `emitSuccessfulPhase2Tail` caller): the applied result built at `:113-116` (`const applied: Extract<ProcessOneFileResult,{outcome:"applied"}> = { outcome:"applied", showId }`) must add `parseWarnings: phase2.parseWarnings` before the tail call at `:119`. With the required-field defense (above) this is `tsc`-FORCED, not optional.
- EDIT `lib/sync/applyStagedCore.ts` (R16/R17 — the staged apply core that runs `runPhase2`): `applyStagedCore` calls `runPhase2` at `:514` and builds its applied result at `:574-581` (copying `roleFlagsNotice`/`snapshotRevisionId` from `phase2` but NOT warnings). Add `parseWarnings` to the `ApplyStagedCoreResult` applied variant (`:434-441`) and **populate it from `phase2.parseWarnings ?? []`** at `:574-581` (the staged analogue of the cron `Phase2Result.applied.parseWarnings` thread). This is the SURFACING SOURCE — without it `coreResult` has no warnings to thread.
- EDIT `lib/sync/applyStaged.ts` (R16/R17 — 3rd `emitSuccessfulPhase2Tail` caller): the inline applied result passed to the tail at `:1280` (`result: { outcome: "applied", showId: coreResult.showId }`) must add **`parseWarnings: coreResult.parseWarnings`** (the field `applyStagedCore` now surfaces — above). **EXACT source field = `coreResult.parseWarnings`** — NOT a literal `[]`. The R16 required field forces SOME value, but `[]` typechecks while silently LOSING `AGENDA_DAY_EMPTIED` on the staged first-published sync_log path; the R17 runtime-sourcing test below pins the correct source.
- NEW `tests/sync/runOfShowConfirmedReplace.test.ts` (apply-core: `shows_internal.parse_warnings` + the R6 live-snapshot plumbing).
- NEW `tests/sync/runOfShowSyncLogChannel.test.ts` (the D-7 `sync_log` channel — driven through `emitSuccessfulPhase2Tail`/`processOneFile`, the REAL logging surface; + a focused `insertSyncLog` structural pin; **+ the R16 manual-first-seen-path test + the R17 staged-first-published runtime-sourcing test**). See the retargeted tests below.

> **Snapshot-surface correction (R6 HIGH — the prior-run_of_show source).** The prior stored `run_of_show` MUST come through the **apply snapshot** (`ApplyParseResultSnapshot`, `applyParseResult.ts:13-17`), which `applyParseResult` actually consumes as `args.snapshot`. That snapshot is built by **`Phase2Tx.applyShowSnapshot`** (interface `phase2.ts:33-59`; Postgres impl `runScheduledCronSync.ts:938-1165`), which already resolves the existing show row and reads `previousCrew`. **The earlier plan pointed at `runScheduledCronSync.ts:532-543` — that is WRONG: that read populates the Phase-1 parse snapshot (`readShowForPhase1` → `priorParseResult`), a DIFFERENT surface that never reaches `applyParseResult`.** Wiring the prior `run_of_show` there would leave `AGENDA_DAY_EMPTIED` permanently undetectable on the live cron path (it would only ever fire in a fake unit-snapshot test). The correct seam is `applyShowSnapshot` → its return → `ApplyParseResultSnapshot.priorRunOfShow` → consumed in `applyParseResult`. **Do NOT touch `:532-543` for this.**

**Interfaces + the CONFIRMED-ONLY rule (D-2 / spec §4.2 "Sync write path" / test 4b):** the sync write rides the EXISTING per-show advisory lock — `upsertShowsInternal` runs inside the locked apply transaction (`withShowLock` → `pg_try_advisory_xact_lock(hashtext('show:'||drive_file_id))`, `lib/sync/lockedShowTx.ts:59`). NO new lock holder; topology in `tests/auth/advisoryLockRpcDeadlock.test.ts` unchanged. The stored `shows_internal.run_of_show` becomes **exactly the latest parse's confirmed (non-empty) days** — there is NO per-day preserve/merge of prior entries.

**Warning ownership (single-owner per code — do-not-relitigate):** the PARSER (`parseAgenda`, §01) owns `AGENDA_GRID_MALFORMED` / `AGENDA_BLOCK_UNRESOLVED` / `AGENDA_DAY_AMBIGUOUS` / `AGENDA_DAY_TRUNCATED` — it emits them at parse time into `parseResult.warnings`. The SYNC owns **`AGENDA_DAY_EMPTIED` ONLY** (it alone needs prior-stored state the parser lacks). The sync **carries the parser's warnings through to both channels but NEVER re-emits any of the parser-owned codes** — re-emitting `AGENDA_GRID_MALFORMED` for an `undefined` `runOfShow` would DUPLICATE the entry `parseAgenda` already produced.

Compute the write value from `parseResult.runOfShow` (camelCase parser field) + the prior stored `run_of_show` (carried on `args.snapshot.priorRunOfShow` — see the **Prior-run_of_show snapshot plumbing** subsection below; NOT the Phase-1 `:532-543` read):
- **`parsed.runOfShow === undefined` (grid UNLOCATABLE — converter/header failure)** → write **`null`** and **emit NO warning**. `AGENDA_GRID_MALFORMED` is ALREADY in `parseResult.warnings` (produced by `parseAgenda`/§01 via `agendaGridMalformed(0)` when it returns `undefined`); the sync simply carries it through to both channels. **Emit NO `AGENDA_DAY_EMPTIED`** — even if the prior stored value held days. An unlocatable grid is a distinct conversion-fault state (spec §4.4 retention matrix row "Grid not locatable" → `AGENDA_GRID_MALFORMED`; §6 test 4b(ii)); the sync adding `AGENDA_DAY_EMPTIED` here would falsely tell the admin the SOURCE day was blanked, masking the real conversion/removed-tab fault mode and weakening the R22 observability contract. (Crew still see anchors for all days — CONFIRMED-ONLY; the difference is purely which warning the admin gets, and that warning came from the parser.)
- else (a **LOCATED** parsed `Record`) `merged = Object.fromEntries(Object.entries(parsed.runOfShow).filter(([, e]) => e.length > 0))`; if `merged` has no keys → write **`null`**, else write `merged`. A read-empty `[]` day and an unresolved/absent block are simply NOT written (→ they render anchors).
- **`AGENDA_DAY_EMPTIED` ONLY on the LOCATED-grid read-empty shape:** for each day that **was in the prior stored value** AND is **present-as-`[]` in `parsed.runOfShow`** (read-empty / blank titles in a located grid) but is NOT in the write value. Do NOT emit it for a day that is merely absent from the parsed `Record` (unresolved block — that gets `AGENDA_BLOCK_UNRESOLVED` from the parser), and do NOT emit it on the unlocatable-grid path (above). Use the prior stored value ONLY to decide which `AGENDA_DAY_EMPTIED` warnings to emit (observability) — NOT to preserve content. (Spec §4.4 retention matrix row "previously stored … read-empty" → `AGENDA_DAY_EMPTIED`; §6 test 4b(iv) all-read-empty emits it per dropped day.)
- **NO write-time date prune (R12):** do NOT intersect against `dates.showDays` at write; date-domain hiding is at PROJECTION read (D-4). A confirmed day stays stored even if its date transiently drops.

The `run_of_show` warnings flow through the existing `parse_warnings` channel and persist to `shows_internal.parse_warnings` (existing plumbing — the `upsertShowsInternal` upsert at `runScheduledCronSync.ts:1324` writes `payload.parse_warnings`, sourced from `parseResult.warnings` at `applyParseResult.ts:128`). `AGENDA_GRID_MALFORMED` / `AGENDA_BLOCK_UNRESOLVED` / `AGENDA_DAY_AMBIGUOUS` / `AGENDA_DAY_TRUNCATED` are ALREADY present in `parseResult.warnings` when the apply runs (emitted by `parseAgenda` in §01) — the sync **carries them through, it does NOT re-emit them**. The **ONLY warning the SYNC appends** is `AGENDA_DAY_EMPTIED` (it alone needs prior-stored knowledge the parser lacks), constructed via the **`agendaDayEmptied(index, iso)` helper imported from `@/lib/parser/blocks/agendaWarnings`** (the concrete §01 module — defined there so its `code:"AGENDA_DAY_EMPTIED"` literal is extracted by `scripts/extract-internal-code-enums.ts:70`, which scans `lib/parser` only). **Do NOT inline a fresh `code:"AGENDA_DAY_EMPTIED"` literal in `lib/sync`** (it would not be extracted → `x2-no-raw-codes` fails), and **do NOT have the sync emit `agendaGridMalformed`/`agendaBlockUnresolved`/`agendaDayAmbiguous`/`agendaDayTruncated`** — those are parser-owned and already in the array.

**Ordering invariant (load-bearing — spans TWO boundaries):** the `AGENDA_DAY_EMPTIED` append must happen BEFORE both persisted-channel writes. (a) **shows_internal channel:** append BEFORE `applyParseResult` builds the `upsertShowsInternal` payload from `args.parseResult.warnings` (`applyParseResult.ts:121-128`) — do the append first, then build the payload. (b) **sync_log channel (R7):** the same warning must be SURFACED OUT of `applyParseResult`/`runPhase2` so it rides `Phase2Result.applied.parseWarnings` → the tail's `logSync` — see the FIX-3 re-analysis. **CAUTION:** `runPhase2` works on LOCAL rebound `parseResult` copies (`phase2.ts:228/254/299`) with fresh `warnings` arrays, so you CANNOT assume the apply-time array is the same object the tail later reads; the warning must be propagated through the explicit `parseWarnings` return field, not via shared-array mutation across the `runPhase2` boundary. Assert in BOTH tests (CHANNEL-1 apply-core for shows_internal; PART C for sync_log).

**FIX-3 — D-7 dual-channel (`shows_internal.parse_warnings` AND `sync_log.parse_warnings`); COMPREHENSIVE re-analysis of the live cron-success logging path (R7 — 3rd touch of this vector).** Spec D-7 says parser warnings persist to BOTH channels. The live cron-success logging path, traced end-to-end:

- **The applied/success outcome is logged ONLY via `emitSuccessfulPhase2Tail`** (`runScheduledCronSync.ts:1724-1751`), invoked at `:2475-2486` after `phase2.outcome === "applied"`. The tail receives `parseResult: pipeline.parseResult` (`:2484`, `:1730`) but calls **`logSync(args.deps, args.driveFileId, args.result)` at `:1750` with NO `payload` and NO parse warnings.** So the applied row carries `entry.payload === undefined` today.
- **`:2309`'s `logSync(..., pipeline.payload)` is the SKIP branch** (`pipeline.kind === "skip"`, `:2308`), NOT the applied path — the earlier plan wrongly targeted it. `logSync` (`:1608-1623`) early-returns on `"skipped" in result` (`:1614`) and otherwise builds a `SyncLogEntry` (`:187-192`) from `result` + optional `payload`; `deps.logSync` → `insertSyncLog` (`:794-808`) writes `$5` `parse_warnings` from `entry.payload` wrapped in a single-element array (`:805`). There is no `parseWarnings` field today, and **the applied path never reaches a `logSync` call carrying it.**
- **The deeper blocker (verified — the reason a naive append fails):** the `AGENDA_DAY_EMPTIED` warning is appended inside `applyParseResult`, but `runPhase2` (`phase2.ts:212`) operates on **LOCAL rebound copies** of `parseResult` with FRESH `warnings` arrays (`phase2.ts:228-233`, `:254-260`, `:299-305`) — `applyParseResult` mutates/reads THAT local copy, which is a **different object** from `pipeline.parseResult` that the tail passes at `:2484`. And `Phase2Result.applied` (`phase2.ts:114-118`) carries `{ outcome, showId, roleFlagsNotice?, snapshotRevisionId? }` — **NO warnings.** So the apply-appended warning reaches `shows_internal.parse_warnings` (via `applyParseResult`'s own `:128` payload build) but is **LOST at the `runPhase2` boundary** — it never reaches the tail's `pipeline.parseResult`. A shared-object-mutation assumption is unsound here.

**Correct wiring (the full cross-boundary thread — additive, applied-outcome only):**
  1. **Carry the warnings out of `runPhase2`:** add `parseWarnings?: ParseResult["warnings"]` to the `Phase2Result.applied` branch (`phase2.ts:114-118`) and populate it at the applied return (`phase2.ts:406-412`) from the LOCAL `parseResult.warnings` (the array `applyParseResult` appended `AGENDA_DAY_EMPTIED` to — confirm `applyParseResult` either mutates this exact array or that `runPhase2` reads the post-apply value; if `applyParseResult` appends to its OWN local copy, have it RETURN the appended warnings or accept a shared array — see step 1a).
  1a. **Ordering across the apply→runPhase2 boundary (load-bearing, R6-adjacent):** `applyParseResult` must surface its appended `AGENDA_DAY_EMPTIED` to `runPhase2` so the applied return can carry it. Simplest: have `applyParseResult` push the warning onto the SAME `parseResult.warnings` array reference `runPhase2` holds (it already passes `parseResult` in — confirm no defensive clone between `phase2.ts`'s local `parseResult` and `applyParseResult`'s `args.parseResult`), OR have `applyParseResult` return `{ appendedWarnings }` that `runPhase2` folds into `applied.parseWarnings`. The append MUST happen before `runPhase2` reads `parseResult.warnings` for the applied return.
  2. **Thread through the tail — `parseWarnings` is REQUIRED on the applied variant (R16 structural defense):** extend the applied `ProcessOneFileResult` variant (`:165-170`) with **required** `parseWarnings: ParseResult["warnings"]` (NOT optional). This makes `tsc` force EVERY caller that builds `{ outcome: "applied", … }` to supply it — see the **R16 caller-surface** subsection. Populate `result.parseWarnings = phase2.parseWarnings ?? []` at `:2469-2474`, then in `emitSuccessfulPhase2Tail` pass it to `logSync` — change the `:1750` call to `logSync(args.deps, args.driveFileId, args.result, undefined, args.result.parseWarnings)`. (Do NOT read from `args.parseResult.warnings` given the `runPhase2` rebind; thread it through `result`.)
  3. **`logSync` builder (`:1608-1623`):** add a `parseWarnings?` parameter (or read `("parseWarnings" in result) ? result.parseWarnings : undefined`); set `entry.parseWarnings` ONLY for the applied outcome; keep the `"skipped" in result` early-return (`:1614`) and do NOT set it on skip/error/stale/stage outcomes.
  4. **`insertSyncLog` (`:794-808`):** union the warnings into `$5`: `[...(entry.payload ? [{ ...entry.payload, outcome: entry.outcome }] : []), ...(entry.parseWarnings ?? [])]` — preserves the per-outcome payload row AND appends the parse warnings.

**R16 caller-surface — `emitSuccessfulPhase2Tail` has THREE applied-result callers; ship a tsc-enforced structural defense, not a 4th point-add (4th touch of this vector — R3/R6/R7/R16).** The R7 thread wired only the cron caller; the tail is shared. **Verified callers** (each builds its OWN applied `ProcessOneFileResult` that reaches the tail):
  1. `runScheduledCronSync.ts:2475` (cron) — result built at `:2469-2474` (the R7 thread).
  2. `runManualStageForFirstSeen.ts:119` (manual first-seen `auto_publish_ready`) — `applied` built at `:113-116`, does NOT copy `parseWarnings` today.
  3. `applyStaged.ts:1280` (staged apply, first-published path) — passes inline `result: { outcome: "applied", showId: coreResult.showId }`, no `parseWarnings` today. Its source must be **`coreResult.parseWarnings`**, which `applyStagedCore` surfaces from `phase2.parseWarnings` (`applyStagedCore.ts:574-581` + the applied-variant type `:434-441`).

  **Structural choice = REQUIRED field (the robust floor) + a per-caller RUNTIME SOURCING test (R17).** Making `parseWarnings` REQUIRED on the applied `ProcessOneFileResult` variant means a caller that omits it FAILS `pnpm typecheck` — so all three current callers MUST be fixed AND a future 4th caller cannot silently drop the channel. **BUT the required field proves a value is SUPPLIED, not correctly SOURCED:** a literal `parseWarnings: []` (or a wrongly-sourced array) typechecks while losing `AGENDA_DAY_EMPTIED`. So each caller ALSO needs a runtime test asserting its real source flows the warning through — cron (PART C suite 1, drives `emitSuccessfulPhase2Tail` directly), manual (R16 test, drives `runManualStageForFirstSeen`), staged (R17 test, drives `applyStaged_unlocked`); each with a negative-regression that FAILS if the source is `[]`. (Centralizing inside `emitSuccessfulPhase2Tail`/`logSync` was the alternative, but the tail receives `parseResult` as a *separate* arg from `result` and — per the `runPhase2` rebind blocker above — the warnings the applied result must carry are NOT reliably on the tail's `parseResult`, so there is no single trustworthy shared source inside the tail; the required-field-on-result approach is the one tsc can enforce.) The callers source from their own apply outcome: `phase2.parseWarnings ?? []` (cron/manual), `coreResult.parseWarnings` (staged). **This structural defense + the 3 runtime tests ship in THIS round's repair commit** (structural-defense-calibration rule — do not wait for another adversarial round).

  **Scope caution + escalation gate (flag in the commit body).** `Phase2Result`, `ProcessOneFileResult`, `SyncLogEntry`, `logSync`, `emitSuccessfulPhase2Tail`, `insertSyncLog` are shared cron/push/manual plumbing. Making the applied `parseWarnings` REQUIRED is the intended forcing function, but verify it does not break unrelated applied-result constructions elsewhere (grep `outcome: "applied"` across `lib/sync` + tests; every construction site either supplies `parseWarnings` or is updated). If a non-Phase2 applied construction is genuinely unable to source warnings, fall back to optional `parseWarnings` + a CI grep-guard test asserting all three tail callers set it (weaker, but still structural) — state which you shipped. `shows_internal.parse_warnings` remains the PRIMARY admin observability surface (rendered on `/admin/dev`); `sync_log.parse_warnings` is the SECONDARY D-7 channel, so if the cross-boundary thread is deemed too invasive for Phase 2 the documented fallback is to scope it to DEFERRED.md (citing D-7) — but the default is to wire all three callers per the required-field defense.

> **Layer decision (state in the apply code comment):** the confirmed-replace + `AGENDA_DAY_EMPTIED` computation lives in `applyParseResult.ts` (the harness-agnostic apply core, which already builds the `upsertShowsInternal` payload at `:121-130`) so the in-memory harness exercises the COMPUTATION without Postgres. But the prior stored `run_of_show` it compares against MUST be plumbed from the real `applyShowSnapshot` (see the next subsection) — a fake-snapshot-only unit test would pass while the live path silently never populates `priorRunOfShow`. The Postgres `upsertShowsInternal` impl just persists the computed `run_of_show` in the upsert `do update set`.

**Prior-run_of_show snapshot plumbing (the FULL live path — R6 HIGH; this subsection owns it end-to-end so the vector does not recur):**
1. **Type:** extend `ApplyParseResultSnapshot` (`applyParseResult.ts:13-17`) with `priorRunOfShow?: Record<string, AgendaEntry[]> | null` (import `AgendaEntry` from `@/lib/parser/types`).
2. **Producer interface:** extend the `Phase2Tx.applyShowSnapshot` return `"updated"` branch (`phase2.ts:49-59`) with `priorRunOfShow?: Record<string, AgendaEntry[]> | null` (sibling of `previousCrewNames`/`previousCrewMembers`). The `snapshot` built at `phase2.ts:264` then carries it, and it flows into `applyParseResult(tx, { …, snapshot })` (`phase2.ts:343-350`) as `args.snapshot.priorRunOfShow`.
3. **Postgres producer:** in the `applyShowSnapshot` impl (`runScheduledCronSync.ts:938-1165`), after the existing-show lookup (`:939-942`, `existing.id`), add a prior-row read — `existing ? await this.one<{ run_of_show: Record<string, AgendaEntry[]> | null }>("select run_of_show from public.shows_internal where show_id = $1 limit 1", [existing.id]) : null` — and add `priorRunOfShow: prior?.run_of_show ?? null` to the `"updated"` return (`:1146-1164`). (A first-seen show has no prior `shows_internal` row → `priorRunOfShow: null`, the correct "nothing previously stored" signal.) Decode defensively if the column could be a double-encoded string (reuse the project's `decodeJsonbColumn` if the postgres.js driver returns a string for this jsonb; for the in-lock raw-tx path it typically returns the parsed object — match the existing `parse_warnings`/`financials` read shape at `:532-543`/`:485` for the decode convention).
4. **Consumer:** in `applyParseResult` (`:80-128`), compute the `AGENDA_DAY_EMPTIED` set by comparing `parseResult.runOfShow` against `args.snapshot.priorRunOfShow` (a day is "previously stored" iff `priorRunOfShow?.[d]?.length > 0`), emit via the `agendaDayEmptied(index, iso)` helper, and **append to `parseResult.warnings` BEFORE the `upsertShowsInternal` payload is built at `:128`** (the ordering invariant above). On the unlocatable-grid path (`runOfShow === undefined`) the sync appends NOTHING — `AGENDA_GRID_MALFORMED` is already in `parseResult.warnings` from the parser; the sync never re-emits it and never adds EMPTIED there (keep the R1 split + the R10 single-owner rule).
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

**Failing test (CODE) — `tests/sync/runOfShowConfirmedReplace.test.ts`. Drives the REAL `runPhase2` → `applyShowSnapshot` → `applyParseResult` path against an in-memory `FakePhase2Tx` (modeled on the existing `tests/sync/phase2.test.ts` `FakePhase2Tx` + `parseResult()` + `runWith()` harness — `:63-120`, `:132-280`). The fake's `applyShowSnapshot` returns a SEEDED `priorRunOfShow` (mirroring the new Postgres `select run_of_show from shows_internal`), so this single suite proves BOTH the CONFIRMED-ONLY computation AND that `priorRunOfShow` is plumbed end-to-end (interface → snapshot → applyParseResult → out via `Phase2Result.applied.parseWarnings`). Complete, executable:**
```ts
import { describe, it, expect, vi } from "vitest";
import type { AgendaEntry, ParseResult } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";
// §01 parser-owned warning factory — what parseAgenda ACTUALLY produces when runOfShow is undefined.
// (Parser owns GRID_MALFORMED/BLOCK_UNRESOLVED/DAY_AMBIGUOUS/DAY_TRUNCATED; the sync owns DAY_EMPTIED only.)
// Import from the concrete §01 module (lib/parser/blocks/agendaWarnings — where the 5 code: literals live;
// the @/lib/parser barrel is NOT guaranteed to re-export them).
import { agendaGridMalformed } from "@/lib/parser/blocks/agendaWarnings";

const d1 = "2026-05-09";          // a showDay in the base fixture below
const d2 = "2026-05-10";          // a 2nd showDay
const e1: AgendaEntry[] = [{ start: "9:00 AM", title: "Keynote A" }];
const e1b: AgendaEntry[] = [{ start: "9:00 AM", title: "Keynote A v2" }];
const e2: AgendaEntry[] = [{ start: "1:00 PM", title: "Panel B" }];

// Minimal ParseResult factory (mirror tests/sync/phase2.test.ts parseResult(); only the fields the apply reads).
function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "T", client_label: "c", client_contact: null, template_version: "v4", venue: null,
      dates: { travelIn: "2026-05-07", set: "2026-05-08", showDays: [d1, d2], travelOut: "2026-05-11" },
      schedule_phases: {}, event_details: {}, agenda_links: [], coi_status: "Pending",
      po: null, proposal: null, invoice: null, invoice_notes: null,
    },
    crewMembers: [], hotelReservations: [], rooms: [], transportation: null, contacts: [],
    pullSheet: null, diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [],
    ...overrides,
  };
}

function fileMeta(modifiedTime = "2026-05-08T12:00:00.000Z"): DriveListedFile {
  return { driveFileId: "file-1", name: "S", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime, parents: ["f"] };
}

// FakePhase2Tx: captures the upsertShowsInternal payload; applyShowSnapshot returns a SEEDED priorRunOfShow.
function makeFakeTx(priorRunOfShow: Record<string, AgendaEntry[]> | null) {
  const captured: { payload?: { run_of_show: unknown; parse_warnings: ParseResult["warnings"] } } = {};
  const tx = {
    async applyShowSnapshot() {
      return {
        outcome: "updated" as const,
        showId: "show-1",
        previousCrewNames: [] as string[],
        previousCrewMembers: [],
        priorRunOfShow, // the field under test — modeled on the new shows_internal SELECT
      };
    },
    async deleteCrewMembersNotIn() {}, async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {}, async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {}, async replaceRooms() {},
    async replaceTransportation() {}, async replaceContacts() {},
    async upsertShowsInternal(_showId: string, payload: { run_of_show: unknown; parse_warnings: ParseResult["warnings"] }) {
      captured.payload = payload;
    },
    async deleteLivePendingIngestion() {},
  };
  return { tx, captured };
}

async function runWith(
  tx: ReturnType<typeof makeFakeTx>["tx"],
  runOfShow: ParseResult["runOfShow"],
  // `seedWarnings` models the PARSER-OWNED warnings parseAgenda already put in parseResult.warnings
  // before the apply runs (e.g. agendaGridMalformed(0) when runOfShow is undefined). The sync must
  // CARRY these through unchanged and only ADD AGENDA_DAY_EMPTIED.
  opts: { showDays?: string[]; seedWarnings?: ParseResult["warnings"] } = {},
) {
  const { showDays = [d1, d2], seedWarnings = [] } = opts;
  vi.resetModules();
  const { runPhase2 } = await import("@/lib/sync/phase2");
  const base = parseResult();
  const pr = parseResult({
    runOfShow,
    warnings: seedWarnings,
    show: { ...base.show, dates: { ...base.show.dates, showDays } },
  });
  const result = await runPhase2(tx as never, {
    driveFileId: "file-1", mode: "cron" as const, fileMeta: fileMeta("2026-05-08T11:59:00.000Z"),
    binding: { bindingToken: "tok", modifiedTime: "2026-05-08T12:00:00.000Z" }, parseResult: pr,
  });
  return result;
}

function codes(captured: ReturnType<typeof makeFakeTx>["captured"]): string[] {
  return (captured.payload?.parse_warnings ?? []).map((w) => w.code);
}

describe("sync run_of_show CONFIRMED-ONLY full replace + AGENDA_DAY_EMPTIED live plumbing (D-2 / R6 / R17/R21/R22)", () => {
  it("(i) one block unresolved (d2 absent from parse) → stored {d1:e1}, d2 NOT preserved, NO AGENDA_DAY_EMPTIED", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: e1b }); // d2 absent (unresolved block → parser already emitted AGENDA_BLOCK_UNRESOLVED)
    expect(captured.payload!.run_of_show).toEqual({ [d1]: e1b });
    expect(captured.payload!.run_of_show).not.toHaveProperty(d2);
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED"); // d2 absent, not read-empty
  });
  it("(ii) grid unlocatable (runOfShow === undefined) → stored null; the PARSER's AGENDA_GRID_MALFORMED is carried through UNCHANGED (sync adds nothing), ZERO AGENDA_DAY_EMPTIED", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 }); // both previously stored — makes the no-EMPTIED load-bearing
    // parseAgenda already emitted GRID_MALFORMED into parseResult.warnings when it returned undefined — SEED it.
    await runWith(tx, undefined, { seedWarnings: [agendaGridMalformed(0)] });
    expect(captured.payload!.run_of_show).toBeNull();
    // EXACTLY ONE GRID_MALFORMED — unchanged by the sync (proves the sync CARRIES, never RE-EMITS the parser-owned code;
    // a sync-side duplicate emit would make this 2).
    expect(codes(captured).filter((c) => c === "AGENDA_GRID_MALFORMED")).toHaveLength(1);
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED"); // conversion fault, not per-day blanking (R22)
  });
  it("(iii) previously-stored day goes read-empty → dropped + AGENDA_DAY_EMPTIED for that day", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: e1b, [d2]: [] });
    expect(captured.payload!.run_of_show).toEqual({ [d1]: e1b });
    expect(codes(captured)).toContain("AGENDA_DAY_EMPTIED");
  });
  it("(iv) all read-empty → stored null + AGENDA_DAY_EMPTIED for every previously-stored day", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: [], [d2]: [] });
    expect(captured.payload!.run_of_show).toBeNull();
    expect(codes(captured).filter((c) => c === "AGENDA_DAY_EMPTIED")).toHaveLength(2);
  });
  it("(vi) first-time read-empty (no prior) → stored null, NO AGENDA_DAY_EMPTIED", async () => {
    const { tx, captured } = makeFakeTx(null);
    await runWith(tx, { [d1]: [], [d2]: [] });
    expect(captured.payload!.run_of_show).toBeNull();
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED");
  });
  it("(vii) self-heal: a later confirmed re-sync re-stores the day", async () => {
    const { tx, captured } = makeFakeTx(null); // prior dropped
    await runWith(tx, { [d2]: e2 });
    expect(captured.payload!.run_of_show).toEqual({ [d2]: e2 });
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED");
  });
  it("NO write-time date prune (R12): a confirmed day absent from dates.showDays is STILL stored", async () => {
    const { tx, captured } = makeFakeTx(null);
    await runWith(tx, { [d2]: e2 }, { showDays: [d1] }); // showDays = [d1] only; d2 confirmed by AGENDA
    expect(captured.payload!.run_of_show).toEqual({ [d2]: e2 }); // storage NOT gated by dates (hidden at read, not write)
  });
  it("CHANNEL 1 (shows_internal) — an AGENDA_DAY_EMPTIED-emitting apply puts it in the upsertShowsInternal payload (NOT proof of sync_log — see runOfShowSyncLogChannel.test.ts)", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: e1b, [d2]: [] });
    expect((captured.payload!.parse_warnings).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
  });
  it("R6 cross-boundary: Phase2Result.applied.parseWarnings carries the apply-appended AGENDA_DAY_EMPTIED OUT of runPhase2", async () => {
    const { tx } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    const result = await runWith(tx, { [d1]: e1b, [d2]: [] });
    expect(result.outcome).toBe("applied");
    // the applied result must surface the warning so the tail (PART C) can log it to sync_log
    expect((result as { parseWarnings?: ParseResult["warnings"] }).parseWarnings?.some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
  });
});
```
> **Negative-regression check (mandatory):** temporarily make the fake `applyShowSnapshot` return OMIT `priorRunOfShow` (return `priorRunOfShow: undefined`) and confirm cases (iii)/(iv)/CHANNEL-1/R6-cross-boundary FAIL — proving the suite exercises the live `priorRunOfShow` plumbing, not a hand-built snapshot. Restore, then commit. (R6 class: a test green with the plumbing dead is worse than no test.)

**Failing test (CODE) — `tests/sync/runOfShowSyncLogChannel.test.ts`: the D-7 `sync_log.parse_warnings` channel, driven through the REAL logging surface (R7).** The CONFIRMED-replace suite above does NOT write sync_log (the apply core + `runPhase2` are upstream of logging). The cron-success row is written by `emitSuccessfulPhase2Tail` → `logSync` → `deps.logSync`, and persisted by `insertSyncLog`. So suite 1 drives `emitSuccessfulPhase2Tail` (exported, `runScheduledCronSync.ts:1724`) with a SPY `deps.logSync` and asserts the captured `SyncLogEntry.parseWarnings` includes `AGENDA_DAY_EMPTIED`; suite 2 is a structural pin on `insertSyncLog` via `makeSyncPipelineTx` (exported, `:1343`) with a fake `PostgresTransaction` (`{ unsafe }`, `:295-297`) capturing the `$5` param. **NOTE:** `insertSyncLog` is a concrete-class method surfaced only via the UNEXPORTED `CronRecoveryTx` type (`:214-229`); `makeSyncPipelineTx` declares the `SyncPipelineTx` return type (`:124-129`) which OMITS it, so suite 2 narrows the runtime instance back with a documented TEST-ONLY local interface cast (the method exists at runtime — the cast is sound). Complete, executable:**
```ts
import { describe, it, expect, vi } from "vitest";
import {
  emitSuccessfulPhase2Tail,
  makeSyncPipelineTx,
  type ProcessOneFileResult,
  type SyncLogEntry,
} from "@/lib/sync/runScheduledCronSync";
import type { DriveListedFile } from "@/lib/drive/list";

const EMPTIED = { severity: "warn" as const, code: "AGENDA_DAY_EMPTIED", message: "d2 went read-empty" };

function fileMeta(): DriveListedFile {
  return { driveFileId: "file-1", name: "S", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2026-05-08T12:00:00.000Z", parents: ["f"] };
}
// emitSuccessfulPhase2Tail only calls tx.deleteRevisionRaceCooldowns?(); a no-op stub satisfies the Pick<> param.
const fakeTailTx = { deleteRevisionRaceCooldowns: async () => {} };
// minimal parseResult — the tail forwards it but logSync(result) is the channel under test.
const parseResult = { warnings: [EMPTIED] } as unknown as Parameters<typeof emitSuccessfulPhase2Tail>[0]["parseResult"];

describe("D-7 sync_log channel — AGENDA_DAY_EMPTIED reaches sync_log via emitSuccessfulPhase2Tail (R7)", () => {
  it("the applied-success tail logs an entry whose parseWarnings INCLUDES AGENDA_DAY_EMPTIED", async () => {
    const logSync = vi.fn(async () => {});
    const result: Extract<ProcessOneFileResult, { outcome: "applied" }> = {
      outcome: "applied", showId: "show-1", parseWarnings: [EMPTIED],
    };
    await emitSuccessfulPhase2Tail({
      tx: fakeTailTx, result,
      deps: { logSync, upsertAdminAlert: vi.fn(async () => undefined) },
      driveFileId: "file-1", fileMeta: fileMeta(), parseResult,
    });
    const entry = logSync.mock.calls.at(-1)![0] as SyncLogEntry;
    expect(entry.outcome).toBe("applied");
    expect((entry.parseWarnings ?? []).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
    // RED before impl: the :1750 logSync call passes no warnings → entry.parseWarnings is undefined.
  });
  it("a clean applied tail (no AGENDA_* warnings) logs an entry whose parseWarnings has NO AGENDA_DAY_EMPTIED", async () => {
    const logSync = vi.fn(async () => {});
    const result: Extract<ProcessOneFileResult, { outcome: "applied" }> = { outcome: "applied", showId: "show-1", parseWarnings: [] };
    await emitSuccessfulPhase2Tail({
      tx: fakeTailTx, result,
      deps: { logSync, upsertAdminAlert: vi.fn(async () => undefined) },
      driveFileId: "file-1", fileMeta: fileMeta(), parseResult: { warnings: [] } as unknown as typeof parseResult,
    });
    const entry = logSync.mock.calls.at(-1)![0] as SyncLogEntry;
    expect((entry.parseWarnings ?? []).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(false);
  });
});

describe("R16 — the MANUAL first-seen caller of emitSuccessfulPhase2Tail also threads parseWarnings to sync_log", () => {
  // Proves caller #2 (runManualStageForFirstSeen.ts:113-121) copies parseWarnings onto its applied result before the
  // tail — the R16 structural-defense forces this at tsc, this test pins the runtime behavior. Model the deps shape on
  // tests/sync/runManualStageForFirstSeen.test.ts (FakeManualStageTx + injected deps.runPhase1/runPhase2/logSync).
  it("a manual first-seen auto_publish_ready apply whose runPhase2 returns AGENDA_DAY_EMPTIED logs it to sync_log", async () => {
    const { runManualStageForFirstSeen } = await import("@/lib/sync/runManualStageForFirstSeen");
    const logSync = vi.fn(async () => {});
    // Drive the auto_publish_ready → applied path; inject runPhase1 (auto_publish_ready) + runPhase2 (applied + parseWarnings).
    // Reuse the FakeManualStageTx + parseResult/fileMeta fixtures from tests/sync/runManualStageForFirstSeen.test.ts.
    const result = await runManualStageForFirstSeen(makeManualStageTx() as never, "file-1", {
      fileMeta: fileMeta(),
      parseResult: firstSeenParseResult(),
      runPhase1: vi.fn(async () => ({ outcome: "auto_publish_ready" as const })),
      runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1", parseWarnings: [EMPTIED] })),
      logSync,
      // stub the remaining injectable deps (createUnpublishToken/now/publishShowInvalidation/upsertAdminAlert) per the existing test.
      createUnpublishToken: () => "tok", now: () => new Date("2026-05-08T12:00:00.000Z"),
      upsertAdminAlert: vi.fn(async () => undefined),
    } as never);
    expect((result as { outcome: string }).outcome).toBe("applied");
    const entry = logSync.mock.calls.at(-1)![0] as SyncLogEntry;
    expect((entry.parseWarnings ?? []).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
    // RED before impl: the manual caller's `applied` (runManualStageForFirstSeen.ts:113-116) omits parseWarnings →
    //   the tail logs an entry with no AGENDA_DAY_EMPTIED. (Helpers makeManualStageTx/firstSeenParseResult/fileMeta are
    //   lifted from tests/sync/runManualStageForFirstSeen.test.ts — keep them local or import a shared test kit.)
  });
});

describe("R17 — the STAGED first-published caller threads coreResult.parseWarnings to the tail (correct SOURCING, not just a supplied value)", () => {
  // Caller #3: applyStaged.ts:1280. The R16 required field forces SOME value; this proves the value is the REAL
  // source (coreResult.parseWarnings ← phase2.parseWarnings), NOT a literal []. Model the harness on the existing
  // first-published test tests/sync/applyStaged.test.ts:339-384 (fakeTx + injected runPhase2 + emitSuccessfulPhase2Tail spy).
  const EMPTIED2 = { severity: "warn" as const, code: "AGENDA_DAY_EMPTIED", message: "d went read-empty" };

  it("a staged first-seen auto-publish apply whose runPhase2 returns AGENDA_DAY_EMPTIED passes it to the tail's applied result", async () => {
    const { applyStaged_unlocked } = await import("@/lib/sync/applyStaged");
    const tail = vi.fn(async () => undefined);
    // runPhase2 returns the applied Phase2Result CARRYING parseWarnings (what applyStagedCore must surface onto coreResult).
    const syncDeps = stagedDeps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [{ id: "fs-1", invariant: "FIRST_SEEN_REVIEW" }], baseModifiedTime: null }),
      ),
      readShowForApply: vi.fn(async () => null), // first-seen: no show row yet
      liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
      runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-new", parseWarnings: [EMPTIED2] })),
      emitSuccessfulPhase2Tail: tail,
      createUnpublishToken: () => "tok-1",
      now: () => new Date("2026-05-08T12:00:00.000Z"),
    });
    await applyStaged_unlocked(
      stagedFakeTx() as never,
      { driveFileId: "drive-file-1", sourceScope: "live", stagedId: "staged-live",
        reviewerChoices: [{ item_id: "fs-1", action: "apply" }], appliedByEmail: "doug@fxav.test" },
      syncDeps as never,
    );
    expect(tail).toHaveBeenCalledTimes(1);
    const tailArg = tail.mock.calls[0]![0] as { result: { parseWarnings?: Array<{ code: string }> } };
    expect((tailArg.result.parseWarnings ?? []).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
    // RED before impl: applyStaged.ts:1280 builds `result: { outcome:"applied", showId }` with no parseWarnings
    //   (and applyStagedCore drops phase2.parseWarnings) → tailArg.result.parseWarnings is undefined.
    // (stagedDeps/stagedFakeTx/pending/driveMeta are the applyStaged.test.ts fixtures — lift or share a kit.)
  });
});

describe("D-7 sync_log structural pin — insertSyncLog unions entry.parseWarnings into the persisted $5 JSONB (R7)", () => {
  // insertSyncLog is a METHOD on the concrete PostgresPipelineTx (runScheduledCronSync.ts:794), surfaced only via
  // the UNEXPORTED CronRecoveryTx type (:214-229). makeSyncPipelineTx returns the concrete instance but DECLARES
  // SyncPipelineTx (:124-129), which OMITS insertSyncLog — so a plain pipe.insertSyncLog(...) fails tsc
  // (property-does-not-exist). The method exists at runtime; a test-only local interface narrows it back for the cast.
  // (CronRecoveryTx is not exported, so we re-declare just the surface this pin needs.)
  type SyncLogWriter = { insertSyncLog(entry: SyncLogEntry, showId?: string | null): Promise<void> };

  function capturingTx() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
      tx: { unsafe: async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return []; } },
      calls,
    };
  }
  it("insertSyncLog writes entry.parseWarnings into the parse_warnings $5 array", async () => {
    const { tx, calls } = capturingTx();
    const pipe = makeSyncPipelineTx(tx) as unknown as SyncLogWriter; // test-only cast: method exists at runtime, hidden by SyncPipelineTx
    await pipe.insertSyncLog({ driveFileId: "file-1", outcome: "applied", parseWarnings: [EMPTIED] }, "show-1");
    const syncLogCall = calls.find((c) => c.sql.includes("insert into public.sync_log"))!;
    const fifth = syncLogCall.params[4] as Array<{ code?: string }>;
    expect(fifth.some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
    // RED before impl: insertSyncLog does NOT union entry.parseWarnings → $5 omits AGENDA_DAY_EMPTIED (the real behavior under test).
  });
  it("insertSyncLog keeps the per-outcome payload row when BOTH payload and parseWarnings are present", async () => {
    const { tx, calls } = capturingTx();
    const pipe = makeSyncPipelineTx(tx) as unknown as SyncLogWriter; // test-only cast (see note above)
    await pipe.insertSyncLog(
      { driveFileId: "file-1", outcome: "applied", payload: { kind: "x" }, parseWarnings: [EMPTIED] },
      "show-1",
    );
    const fifth = calls.find((c) => c.sql.includes("insert into public.sync_log"))!.params[4] as Array<Record<string, unknown>>;
    expect(fifth.some((e) => e.kind === "x")).toBe(true); // the payload row survives
    expect(fifth.some((e) => e.code === "AGENDA_DAY_EMPTIED")).toBe(true); // and the warning is unioned
  });
});
```
> **Negative-regression checks (mandatory — all three caller paths + the structural pin; run each stash, confirm RED, restore):**
> - **PART C (cron):** revert the `:1750` `logSync` call to not pass warnings → the cron tail test FAILS.
> - **R16 (manual):** make `runManualStageForFirstSeen`'s applied result (`:113-116`) omit `parseWarnings` (or source `[]`) → the R16 manual test FAILS.
> - **R17 (staged) — pins correct SOURCING, not just a supplied value:** make `applyStaged.ts:1280` source a literal `parseWarnings: []` instead of `coreResult.parseWarnings` (OR drop `parseWarnings` from `applyStagedCore`'s applied result) → the R17 staged test FAILS (`tailArg.result.parseWarnings` has no `AGENDA_DAY_EMPTIED`). This is the load-bearing one — it proves the test catches a wrongly-SOURCED-but-typechecking value, which the R16 required field alone does NOT.
> - **`insertSyncLog` pin:** stash the `$5` union → the structural-pin test FAILS (the durable CI guard — fails if any future refactor drops `entry.parseWarnings` from the column write, independent of the tail).
> Each stash-and-confirm-red proves the test exercises its real runtime surface, not just the type. (4th-touch structural-defense discipline.)

**Run-fails:** `pnpm vitest run tests/sync/runOfShowConfirmedReplace.test.ts tests/sync/runOfShowSyncLogChannel.test.ts` → red. _Failure this catches: ANY non-confirmed shape (unresolved/unlocatable/read-empty) preserving-and-showing stale agenda (R17/R21/R22); a confirmed day wrongly dropped by a transient DATES drop (R12); a missing/spurious `AGENDA_DAY_EMPTIED`; **the unlocatable-grid path mis-emitting `AGENDA_DAY_EMPTIED` for prior-stored days** (case (ii)); **(PART B) the prior `run_of_show` never reaching `applyParseResult` because `applyShowSnapshot` didn't populate `priorRunOfShow` — the R6 dead-live-path class**; **(PART C) the D-7 `sync_log` channel being dead because the warning is lost at the `runPhase2`→tail boundary or `insertSyncLog` drops `parseWarnings` — the R7 wrong-surface class**; **and (R16) the MANUAL first-seen caller dropping `parseWarnings` from its applied result — the multi-caller class the required-field tsc defense + the manual-path test close**._

**Minimal impl (the full live path):** (1) extend `ApplyParseResultSnapshot` (`applyParseResult.ts:13-17`) with `priorRunOfShow`; (2) extend `Phase2Tx.applyShowSnapshot`'s `"updated"` return (`phase2.ts:49-59`) with `priorRunOfShow`; (3) in the Postgres `applyShowSnapshot` impl (`runScheduledCronSync.ts:938-1165`) add the `select run_of_show from public.shows_internal where show_id = existing.id` read + return `priorRunOfShow`; (4) in `applyParseResult` compute the confirmed-replace value and append `AGENDA_DAY_EMPTIED` (via the **`agendaDayEmptied` helper imported from `lib/parser`** — the ONLY warning the sync emits) ONLY for prior-stored days (`args.snapshot.priorRunOfShow?.[d]?.length > 0`) that parsed read-empty `[]` in a LOCATED grid; on the `parsed.runOfShow === undefined` path the sync appends NOTHING (the parser already put `AGENDA_GRID_MALFORMED` in `parseResult.warnings`; the sync carries it, never re-emits) — surfacing the appended warning to `runPhase2` (step 1a of the FIX-3 re-analysis) BEFORE building the `:128` `shows_internal.parse_warnings` payload; (5) thread `run_of_show` through the `upsertShowsInternal` payload + the SQL upsert (`:1318-1334`); (6) **the FIX-3 sync_log cross-boundary thread:** `Phase2Result.applied.parseWarnings` (`phase2.ts:114-118`/`:406-412`) → the applied `ProcessOneFileResult` + `result` (`:2469-2474`) → `emitSuccessfulPhase2Tail`'s `logSync` call (`:1750`) → `logSync` builder (`:1608-1623`, applied-only) → `SyncLogEntry.parseWarnings` (`:187-192`) → `insertSyncLog` `$5` union (`:794-808`). Keep everything inside the existing locked apply tx — add NO `pg_advisory*` call. **Do NOT touch `runScheduledCronSync.ts:532-543` (the Phase-1 parse snapshot — wrong surface) and do NOT wire warnings at `:2309` (the SKIP branch, not applied).**

**Run-passes:** `pnpm vitest run tests/sync/runOfShowConfirmedReplace.test.ts tests/sync/runOfShowSyncLogChannel.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` → green (topology unchanged). `pnpm typecheck` clean.

**Commit:** `feat(sync): CONFIRMED-ONLY run_of_show write + AGENDA_DAY_EMPTIED dual-channel (shows_internal + sync_log) under the per-show lock`
> Commit body must note the cross-boundary `Phase2Result`/`ProcessOneFileResult`/`SyncLogEntry` additive thread + the escalation gate outcome (wired, or scoped-to-DEFERRED if too invasive — see the FIX-3 escalation gate).

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

**Failing test (CODE) — `tests/data/getShowForViewerRunOfShow.test.ts`. Mocks `createSupabaseServiceRoleClient` (modeled EXACTLY on `tests/data/getShowForViewer-rooms-projection.test.ts:97-157` — per-table `tableResponses`, `vi.hoisted`, `vi.mock`, chainable stub) so each `shows_internal` fixture drives a real `getShowForViewer(...)` call. Anti-tautology: the date-intersection case asserts the STORED row still carries the dropped key (storage untouched) while the projection hides it. Complete, executable:**
```ts
import { beforeEach, describe, it, expect, vi } from "vitest";

const SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const d1 = "2026-06-24", d2 = "2026-06-25";
const e = [{ start: "9:00 AM", title: "Keynote" }];

// Minimal shows row — only the fields getShowForViewer dereferences. dates.showDays is the current-date domain.
function showRow(showDays: string[]) {
  return {
    id: SHOW_ID, title: "S", client_label: "c", template_version: "v4", published: true, coi_status: null,
    client_contact: null, venue: null, dates: { travelIn: null, set: null, showDays, travelOut: null },
    schedule_phases: null, event_details: {}, agenda_links: null, pull_sheet: null, diagrams: null,
    opening_reel_drive_file_id: null, opening_reel_drive_modified_time: null,
    opening_reel_head_revision_id: null, opening_reel_mime_type: null, last_synced_at: null, last_sync_status: null,
  };
}
// A crew row that satisfies BOTH the role_flags lookup (.maybeSingle) and the all-crew (.eq) read.
function crewRow(dateRestriction: unknown) {
  return {
    id: CREW_ID, name: "Hank", email: null, phone: null, role: "A2", role_flags: ["A2"], // non-lead
    date_restriction: dateRestriction, stage_restriction: { kind: "none" },
  };
}

type Resp = { data: unknown; error: unknown };
const mockState = vi.hoisted(() => ({
  responses: {} as Record<string, Resp>,
  showsInternalThrows: false,
  writeCalls: [] as string[], // captures any insert/update/delete/upsert method names (must stay empty)
}));

function makeChain(table: string) {
  const response = mockState.responses[table] ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  // .maybeSingle()/.single() resolve to a SINGLE row: if data is an array, unwrap [0] (mirrors PostgREST).
  // The non-terminal await (.eq() then awaited) resolves to the array as-is. This lets crew_members serve
  // BOTH the role-flags .maybeSingle() lookup (:217-222) and the all-crew .eq() read (:299-302) from one array.
  const single = (): Promise<Resp> => {
    if (table === "shows_internal" && mockState.showsInternalThrows) return Promise.reject(new Error("network boom"));
    const d = response.data;
    return Promise.resolve({ data: Array.isArray(d) ? (d[0] ?? null) : d, error: response.error });
  };
  chain.select = self; chain.eq = self; chain.order = self; chain.limit = self; chain.like = self;
  for (const w of ["insert", "update", "delete", "upsert"]) {
    chain[w] = () => { mockState.writeCalls.push(`${table}.${w}`); return chain; };
  }
  chain.maybeSingle = single;
  chain.single = single;
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    if (table === "shows_internal" && mockState.showsInternalThrows) return Promise.reject(new Error("network boom")).then(res, rej);
    return Promise.resolve(response).then(res, rej);
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (t: string) => makeChain(t),
    rpc: () => Promise.resolve({ data: "1000", error: null }),
  }),
}));

const { getShowForViewer } = await import("@/lib/data/getShowForViewer");

function setup(opts: {
  showDays: string[];
  showsInternal: Resp;
  crew?: Resp; // when present, drives a crew viewer's lookup + restriction
  throws?: boolean;
}) {
  mockState.responses = {
    shows: { data: showRow(opts.showDays), error: null },
    crew_members: opts.crew ?? { data: [], error: null },
    hotel_reservations: { data: [], error: null },
    rooms: { data: [], error: null },
    transportation: { data: null, error: null },
    contacts: { data: [], error: null },
    shows_internal: opts.showsInternal,
  };
  mockState.showsInternalThrows = opts.throws ?? false;
  mockState.writeCalls = [];
}

const ADMIN = { kind: "admin" as const };
const CREW = { kind: "crew" as const, crewMemberId: CREW_ID };

describe("getShowForViewer.runOfShow projection (D-4)", () => {
  beforeEach(() => { mockState.responses = {}; mockState.showsInternalThrows = false; mockState.writeCalls = []; });

  it("reads UNCONDITIONALLY (not lead-gated) — a non-lead crew viewer still gets runOfShow", async () => {
    setup({ showDays: [d1], showsInternal: { data: { run_of_show: { [d1]: e } }, error: null }, crew: { data: [crewRow({ kind: "none" })], error: null } });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.runOfShow).toEqual({ [d1]: e });
  });

  it("no shows_internal row ({data:null,error:null}) → runOfShow null, NO tileErrors (legitimate empty — ?? null coercion)", async () => {
    setup({ showDays: [d1], showsInternal: { data: null, error: null } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors).not.toHaveProperty("run_of_show"); // catches a FALSE alert on every no-row show
  });

  it("explicit DateRestriction → only assigned-day keys", async () => {
    setup({ showDays: [d1, d2], showsInternal: { data: { run_of_show: { [d1]: e, [d2]: e } }, error: null },
            crew: { data: [crewRow({ kind: "explicit", days: [d2] })], error: null } });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.runOfShow).toEqual({ [d2]: e });
  });

  it("unknown_asterisk → no keys", async () => {
    setup({ showDays: [d1, d2], showsInternal: { data: { run_of_show: { [d1]: e } }, error: null },
            crew: { data: [crewRow({ kind: "unknown_asterisk" })], error: null } });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.runOfShow).toBeNull();
  });

  it("none viewer (admin) → all CURRENT show days", async () => {
    setup({ showDays: [d1, d2], showsInternal: { data: { run_of_show: { [d1]: e, [d2]: e } }, error: null } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toEqual({ [d1]: e, [d2]: e });
  });

  it("current-date intersection: a stored key NOT in dates.showDays is dropped at READ while STORAGE is untouched (R10/R12)", async () => {
    const storedRow = { run_of_show: { [d1]: e, [d2]: e } };
    setup({ showDays: [d1], showsInternal: { data: storedRow, error: null } }); // d2 removed from showDays
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toEqual({ [d1]: e });            // d2 hidden at read
    expect(storedRow.run_of_show).toHaveProperty(d2);      // storage object UNCHANGED (non-destructive)
    expect(mockState.writeCalls).toEqual([]);              // no insert/update/delete/upsert — read-only
  });

  it("returned error → runOfShow null + tileErrors.run_of_show set, no raw infra text leaked as runOfShow", async () => {
    setup({ showDays: [d1], showsInternal: { data: null, error: { message: "db boom" } } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("thrown exception (network) → runOfShow null + tileErrors.run_of_show set (fail-soft, no throw)", async () => {
    setup({ showDays: [d1], showsInternal: { data: null, error: null }, throws: true });
    const out = await getShowForViewer(SHOW_ID, ADMIN); // must not reject
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("corrupt stored shape ([null]) → runOfShow null + tileErrors.run_of_show set (decode fail-soft, no throw)", async () => {
    setup({ showDays: [d1], showsInternal: { data: { run_of_show: { [d1]: [null] } }, error: null } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("corrupt: non-ISO key dropped, non-array day dropped, valid sibling still projects, tileErrors set", async () => {
    setup({ showDays: [d1], showsInternal: { data: { run_of_show: { garbage: [e[0]], [d1]: e, "2026-06-26": 5 } }, error: null } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toEqual({ [d1]: e }); // only the well-formed, in-domain day survives
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("D-3 boundary: result.show (ShowRow) carries NO run_of_show / runOfShow key", async () => {
    setup({ showDays: [d1], showsInternal: { data: { run_of_show: { [d1]: e } }, error: null } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    const showKeys = Object.keys(out.show);
    expect(showKeys).not.toContain("run_of_show");
    expect(showKeys).not.toContain("runOfShow");
  });
});
```
> **Crew-viewer mock — dual-read handled:** `crew_members` is read TWICE — the role-flags lookup (`getShowForViewer.ts:217-222`, `.maybeSingle()`) and the all-crew projection (`:299-302`, awaited `.eq()`). Supplying `crew` as an ARRAY `[crewRow(...)]` serves both: the chain's `.maybeSingle()` unwraps `[0]` (PostgREST-style), the awaited `.eq()` resolves the array as-is. Single-object reads (`shows_internal`, `transportation`, `shows`) pass their object through `.maybeSingle()` unchanged (non-array → returned as-is). When writing, confirm the unwrap against the live `getShowForViewer` query shapes; the assertions are the contract regardless. The `none`/admin cases skip the crew lookup entirely (admin → all current showDays).

**Run-fails:** `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts` → red. **RED-before-impl reason:** `ShowForViewer` has no `runOfShow` field yet, so the file fails to typecheck and every `out.runOfShow` assertion is `undefined`/absent (the read block + return-literal emission don't exist). _Failure this catches: a lead-gated (wrong) read; an ungated projection leaking other-day session content to restricted crew; the new internal-table read swallowing an error (missing `tileErrors`) or leaking raw infra text; a corrupt shape crashing the projection; a no-row FALSE alert (missing `?? null`); `run_of_show` accidentally riding `ShowRow`/`public.shows`._

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
- [ ] **Projection + decoder + gating + sync + failedKeys green:** `pnpm vitest run tests/data/decodeRunOfShow.test.ts tests/data/getShowForViewerRunOfShow.test.ts tests/sync/runOfShowConfirmedReplace.test.ts tests/sync/runOfShowSyncLogChannel.test.ts tests/components/crew/crewShell.test.tsx`.
- [ ] **AGENDA_DAY_EMPTIED live-path plumbing (R6):** `priorRunOfShow` is threaded `ApplyParseResultSnapshot` (`applyParseResult.ts:13-17`) ← `Phase2Tx.applyShowSnapshot` return (`phase2.ts:49-59`) ← the Postgres `applyShowSnapshot` `select run_of_show from public.shows_internal` (`runScheduledCronSync.ts:938-1165`); the PART-B live-path test asserts an emptied prior day fires `AGENDA_DAY_EMPTIED` through the REAL `runPhase2`→`applyParseResult` path, and the negative-regression check (omit `priorRunOfShow` → PART-B fails) was run. NO `priorRunOfShow` wiring at the Phase-1 `:532-543` read.
- [ ] **D-7 sync_log channel (R7) + multi-caller structural defense (R16) + per-caller runtime SOURCING (R17):** `parseWarnings` is a **REQUIRED** field on the applied `ProcessOneFileResult` variant (`:165-170`) — `pnpm typecheck` PASSES only because ALL THREE `emitSuccessfulPhase2Tail` callers supply it: `runScheduledCronSync.ts:2469-2474` (cron, source `phase2.parseWarnings`), `runManualStageForFirstSeen.ts:113-116` (manual, source `phase2.parseWarnings`), `applyStaged.ts:1280` (staged, source **`coreResult.parseWarnings`** ← `applyStagedCore.ts:574-581` surfaces `phase2.parseWarnings`). **Each caller has a RUNTIME SOURCING test** (required field proves supplied, not correctly sourced): PART-C suite-1 (cron, drives `emitSuccessfulPhase2Tail`), R16 test (manual, drives `runManualStageForFirstSeen`), **R17 test (staged, drives `applyStaged_unlocked` — asserts `tail`'s `result.parseWarnings` includes `AGENDA_DAY_EMPTIED`)** — each with a stash-source-to-`[]`→confirm-RED negative-regression. The `insertSyncLog` structural pin is green; the apply-core test is RELABELED CHANNEL-1-only. A `grep "outcome: \"applied\"" lib/sync` confirms no construction site omits `parseWarnings`. NO warning wiring at `:2309` (the SKIP branch). _(Escalation-gate fallbacks unchanged: optional field + CI grep-guard, or DEFERRED.md citing D-7, if the thread proved too invasive.)_
- [ ] **Advisory-lock topology unchanged:** `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` green; no new `pg_advisory*` holder added.
- [ ] **Validation-parity green:** `pnpm vitest run tests/db/validation-schema-parity.test.ts`.
- [ ] **Typecheck clean:** `pnpm typecheck`.
- [ ] **Boundary invariants:** `result.show` (`ShowRow`) carries NO `run_of_show`/`runOfShow` key; the `shows_internal.run_of_show` read is unconditional (every viewer), destructures `{ data, error }`, distinguishes returned-error from thrown, and surfaces both as `tileErrors["run_of_show"]` with no raw infra text in the crew DOM; the sync write is CONFIRMED-ONLY full-replace inside the existing per-show lock with no write-time date prune.

Hand off to `03-schedule-enrichment-closeout.md` (the per-day Schedule branch consuming `ShowForViewer.runOfShow`).
