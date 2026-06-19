# Crew Page Redesign — Phase 2 (AGENDA run-of-show enrichment) Implementation Plan — Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read THIS overview first — it locks the cross-task interfaces, global constraints, and meta-test inventory every task implicitly depends on. Then execute `01-parser-types.md` → `02-migration-projection.md` → `03-schedule-enrichment-closeout.md` in order.

**Goal:** Parse the sheet's AGENDA run-of-show grid into a per-day timeline and enrich the Phase-1 crew Schedule section: a day with confirmed agenda entries renders a rich run-of-show list, every other day falls back to the always-correct Phase-1 anchor strip.

**Architecture:** One new fail-soft parser block (`parseAgenda`) → one new admin-only JSONB column (`shows_internal.run_of_show`) → one new top-level projection field (`ShowForViewer.runOfShow`, **CONFIRMED-ONLY** retention) → one per-day branch in the existing Phase-1 Schedule Server Component. No new route, auth surface, shell change, hero change, or `admin_alerts` code. Strictly additive over merged Phase 1 (`main` @ `eac6bd11`).

**Tech Stack:** Next.js 16 RSC, Supabase (service-role projection + `shows_internal` admin-only RLS), Vitest (node default + `// @vitest-environment jsdom` per component test), Playwright (screenshots-help for the live-fixture regen), strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-17-crew-page-redesign-phase2-agenda.md` (adversarial-APPROVED R24). The spec is canonical; this plan only supersedes it where a **Pre-draft correction** below cites live code the spec got wrong (spec written pre-merge).

---

## Global Constraints (every task implicitly includes these — values verbatim from spec + live code)

1. **TDD per task** (invariant 1): failing test → minimal impl → passing test → commit. One commit per task; conventional-commits (`feat(parser|db|crew-page|sync):` / `test(...)`).
2. **Fail-soft is the contract** (wp-1): a malformed/`#REF!`/ragged AGENDA never throws a `hardError` or blocks ingest — it yields a `ParseWarning` + `undefined`/partial. The Phase-1 anchor strip is the floor and is NEVER removed by a Phase-2 fault.
3. **CONFIRMED-ONLY retention** (D-2 / wp-12, the settled R17→R21→R22 rule — **do-not-relitigate**): crew see a day's run-of-show **iff the latest sync produced non-empty entries for it**. Every non-confirmed outcome — read-empty `[]`, unresolved block, unlocatable grid — is **NOT stored → the anchor strip** + the matching warning. No preserve-and-show path exists. No permanent loss (sheet is source of truth; transient faults re-confirm next sync).
4. **`run_of_show` lives ONLY on admin-only `shows_internal`, NEVER `public.shows`/`ShowRow`** (D-3 / R18 / wp-8). `public.shows` is crew-readable via `crew_read` (`is_admin() or (can_read_show(id) and published = true)` — `20260501002000_rls_policies.sql:230-232`; **note the `published=true` conjunct**), no per-day gate; a `shows.run_of_show` column would be directly PostgREST-readable, bypassing the projection gate.
5. **Per-show advisory lock** (invariant 2): the sync `run_of_show` write rides the EXISTING per-show lock (`withShowLock` → `pg_try_advisory_xact_lock(hashtext('show:'||drive_file_id))`, `lib/sync/lockedShowTx.ts:59`); **no new lock holder** (topology in `tests/auth/advisoryLockRpcDeadlock.test.ts` unchanged).
6. **No raw error codes in crew UI** (invariant 5): `ParseWarning.code` is a free-string parser-internal code (admin-only, → `shows_internal.parse_warnings`), NEVER crew-facing. Crew never see `AGENDA_*`.
7. **UI quality gate** (invariant 8): the §03 Schedule enrichment is a UI surface → impeccable dual-gate (critique + audit) before close-out, HIGH/CRITICAL fixed or DEFERRED.md'd.
8. **Supabase call-boundary discipline** (invariant 9): the new `shows_internal.run_of_show` read destructures `{ data, error }`, distinguishes returned-error from thrown, surfaces either as `tileErrors["run_of_show"]` (fail-soft → Phase-1 projection alert), never leaks raw infra text to crew.
9. **UI work is Opus** (routing hard rule): §03 (and any `components/`/`app/` non-api file) is Opus-implemented.

---

## Binding cross-task interfaces (LIVE-verified locations — use THESE, all spec lines shifted post-merge)

**New types (authored in §01, consumed everywhere):**
```ts
// lib/parser/types.ts  (insert AgendaEntry near the other block row types;
// add `runOfShow?` to BOTH ParsedSheet (types.ts:315-332, between `warnings` and
// `hardErrors`) AND ParseResult (types.ts:338-355) so it survives sync enrichment)
export type AgendaEntry = {
  start: string;          // required display string, never re-parsed to Date
  finish?: string;
  trt?: string;
  title: string;          // REQUIRED + the "filled" signal — must be REAL
  room?: string;
  av?: string;
};
// ParsedSheet.runOfShow / ParseResult.runOfShow:
runOfShow?: Record<string, AgendaEntry[]>;   // ISODate -> entries; undefined = grid unlocatable
```
- `parseAgenda(markdown: string): { runOfShow: Record<string, AgendaEntry[]> | undefined; warnings: ParseWarning[] }` — new file `lib/parser/blocks/agenda.ts`. Called in `parseSheet` (`lib/parser/index.ts:315`) in the sequential block list (`:363-383`), result folded into the return literal (`:407-420`). Reconciles day banners against `parseDates`'s `dates.showDays[]` (`lib/parser/blocks/dates.ts:48`; **`dates` also has a 5th `loadIn?` field** — `dates.ts:59`).
- **CRITICAL data-flow bridge:** the sync pipeline consumes `ParseResult`, NOT `ParsedSheet` — `enrichWithDrivePins(parsed: ParsedSheet): Promise<ParseResult>` (`lib/sync/enrichWithDrivePins.ts:211`) builds the `ParseResult` via a **field-by-field return literal (`:262-279`)** that copies 12 named fields and does NOT spread `parsed`. §01 MUST add `runOfShow` to that copy (conditional-spread `...(parsed.runOfShow !== undefined ? { runOfShow: parsed.runOfShow } : {})`, exactOptional) + a test, or a parsed agenda is **silently dropped** before the §02 sync write reads it (the sync would see `undefined` → write `null` → run-of-show never reaches crew). This is the single most important plumbing step.
- `ParseWarning` (`lib/parser/types.ts:1-7`): `{ severity: "info"|"warn"; code: string; message: string; blockRef?: { kind: string; index?: number }; rawSnippet?: string }`. New codes (all `severity:"warn"`, `blockRef:{kind:"agenda", index}`): `AGENDA_GRID_MALFORMED`, `AGENDA_BLOCK_UNRESOLVED`, `AGENDA_DAY_AMBIGUOUS`, `AGENDA_DAY_TRUNCATED`, `AGENDA_DAY_EMPTIED`.

**DB (authored in §02):** `shows_internal.run_of_show jsonb` (nullable default null) — CREATE table at `20260501001000_internal_and_admin.sql:1-6` (currently `financials`/`parse_warnings`/`raw_unrecognized` + `show_id` PK). New migrations timestamp **`20260619000000…`+** (latest is `20260618000000_upsert_admin_alert_failedkeys_merge.sql`).

**Projection (authored in §02, consumed by §03):**
```ts
// lib/data/getShowForViewer.ts — ShowForViewer type (:95-198); add sibling of `show:` (:96) / `financials?:` (:170):
runOfShow: Record<string, AgendaEntry[]> | null;
// read shows_internal.run_of_show via the service-role client (:201) UNCONDITIONALLY
//   (NOT if(isLead) — that gate at :481 is financials-only); inside a new try/catch
//   alongside hotel/rooms (:342-469); destructure { data, error }; on error/throw/
//   decode-corruption set tileErrors["run_of_show"] (tileErrors built :336, the 5
//   existing domains hotel/rooms/transportation/contacts/financials).
// emit in the return object (:539-555).
```
- `decodeRunOfShow(raw: unknown): { value: Record<string, AgendaEntry[]> | null; corrupt: boolean }` — new total decoder (§02), deep per-layer validation (D-2/R14). Intersect emitted keys with **current `dates.showDays` ∩ viewer `DateRestriction`** (D-4).
- `stripAgendaUrls(value: string): string` — new helper `lib/visibility/agendaUrls.ts` (§03), strips schemed `https?://\S+` AND scheme-less `(drive|docs)\.google\.com/\S+`, reuses the orphan-connector/whitespace cleanup pattern from `lib/visibility/openingReelText.ts:63-67`.

**UI (authored in §03):** the Phase-1 Schedule `*Section` (`components/crew/sections/ScheduleSection.tsx`) gains a per-day branch: `runOfShow[isoDate]?.length > 0` → run-of-show list (`data-testid="run-of-show-<isoDate>"`), else the existing `resolveKeyTimes` anchor strip (`lib/crew/resolveKeyTimes.ts:43`). Sentinel hiding via `shouldHideGenericOptional` (`lib/visibility/emptyState.ts:75` — hides `""`/`TBD`/`N/A`/`TBA`). Display cap 20 + `+N more`; title display-truncate 80 + `<details>`.

---

## Meta-test inventory (declared per the writing-plans mandate — with pre-draft corrections)

- **CREATES** the `shows_internal` row in `RPC_GATED_TABLES` (`tests/db/postgrest-dml-lockdown.test.ts:124`) + the matching `revoke insert,update,delete on public.shows_internal from anon,authenticated` migration **in the same commit** (§02). `shows_internal` is currently ABSENT from the 16-entry registry + has no existing REVOKE → Phase 2 is its first lockdown. The bidirectional meta-test (REVOKE→row at `:714`, row→REVOKE at `:738`) fails if they don't move together. **`rowFilter` is a REQUIRED registry field** (spec wrongly called it optional). Row template = the `crew_members` entry (`{ table, closed_at:"<this migration>:<line>", selectAnon:true, selectAuthenticated:true, postBody:{show_id:<uuid>, run_of_show:{} }, rowFilter:"?show_id=eq.<uuid>" }`).
- **EXTENDS** `_metaSentinelHidingContract` coverage (`tests/components/tiles/_metaSentinelHidingContract.test.ts`, CREW_DIRS `:100`, asserts import + `shouldHideGenericOptional(` call) — already walks `components/crew/`; the §03 new field reads (`room`/`av`/`finish`/`trt`) must import+call it.
- **EXTENDS** the `CardinalityCapBoundary` TEST matrix (`tests/components/tiles/CardinalityCapBoundary.test.tsx`) — **NOT a reusable component** (spec implied one; it's a boundary test, caps are per-section consts). Add the run-of-show row/overflow-stub `data-testid` pair (cap 20, stub `count = length − 20`, rendered at `> cap` never `>= cap`).
- **REGEN `internal-code-enums`** (R10): the new `AGENDA_*` `ParseWarning` `code:` literals are extracted by `scripts/extract-internal-code-enums.ts` (scans ParseWarning `code:` literals → `lib/messages/__generated__/internal-code-enums.ts:13`); run `pnpm gen:internal-code-enums` and commit the regen **in the same commit** that adds the codes, else `tests/cross-cutting/no-raw-codes.test.ts` (x2) fails.
- **`validation-schema-parity`** covers the migration: `pnpm gen:schema-manifest` → `supabase/__generated__/schema-manifest.json` (NOT `**generated**`) regenerated + committed, AND the migration applied surgically to the validation project, else `tests/db/validation-schema-parity.test.ts` fails.
- **Supabase call-boundary (invariant 9):** the new `getShowForViewer` `shows_internal.run_of_show` read is a new Supabase call site, so per invariant 9 it MUST **either** be registered in a structural meta-test **or** carry an inline `// not-subject-to-meta: <reason>` comment. **§02 adds the inline waiver** at the read (e.g. `// not-subject-to-meta: lib/data is outside _metaInfraContract's auth-domain scan (tests/auth/_metaInfraContract.test.ts:259 walks lib/auth/app/auth/app/api/auth/app/api/show only); boundary is pinned by the behavioral returned-error + thrown-exception tests in 02 Task 02.5`). **Correction to the spec:** the spec implied registering in `_metaInfraContract` — that meta-test does NOT scan `lib/data`, so the inline-waiver branch of invariant 9 is the applicable option (the comment documents intent + flags the site for human review even though it isn't machine-enforced in `lib/data` today). The waiver is paired with §02's behavioral tests (returned-error AND thrown-exception each → `tileErrors["run_of_show"]`, no raw infra text). A dedicated `lib/data` Supabase-call-boundary registry meta-test is a future improvement (file to `BACKLOG.md` as `BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST` — out of Phase-2 scope; do NOT treat the absence as removing the invariant-9 requirement).
- **NO `_metaAdminAlertCatalog` change, NO §12.4 catalog change, NO `upsert_admin_alert` RPC change** (wp-2): `run_of_show` rides the existing `TILE_PROJECTION_FETCH_FAILED` code (domain-agnostic copy); the DB-side union-merge in the `upsert_admin_alert` RPC already accepts arbitrary domains. **CORRECTION:** there is NO existing test enumerating the 5 `failedKeys` domains to "extend to 6" — the domain set is implicit in the 5 `tileErrors[...]` keys in `getShowForViewer.ts`. §02 instead ADDS a new per-domain case (`tileErrors:{run_of_show:"boom"}` → `failedKeys` includes `run_of_show`) to `tests/components/crew/crewShell.test.tsx` (~:441-462).
- **Advisory-lock topology unchanged** (invariant 2): the read-modify-replace runs inside the existing per-show lock on the sync's `shows_internal` write — no new holder.

---

## Task-file index

| File | Phase (spec §8) | Deliverable | Implementer |
|---|---|---|---|
| `01-parser-types.md` | 1. Parser + types | regen filled fixtures (East Coast, RIA) from the current converter; `AgendaEntry`; `parseAgenda` block (token-header-anchored, fail-soft, CONFIRMED-ONLY encoding, storage caps); top-level `ParsedSheet/ParseResult.runOfShow`; the 5 `AGENDA_*` codes + `gen:internal-code-enums` regen. No DB, no UI. | Sonnet/Opus (pure data) |
| `02-migration-projection.md` | 2. Migration + projection | `shows_internal.run_of_show` migration (+ validation apply + manifest regen); the `revoke … from anon,authenticated` lockdown migration + `RPC_GATED_TABLES` row (same commit); sync CONFIRMED-ONLY full-replace write under the existing lock; `decodeRunOfShow`; `getShowForViewer.runOfShow` (unconditional service-role read + current-date ∩ DateRestriction intersection + `tileErrors["run_of_show"]`); the new `failedKeys` per-domain test. | Opus (Supabase boundary) |
| `03-schedule-enrichment-closeout.md` | 3. Schedule enrichment + close-out | the per-day run-of-show branch in `ScheduleSection` (sentinel hiding, 20-cap + `+N more`, 80-char title `<details>`, `stripAgendaUrls`, per-day mutual-exclusivity); extend `_metaSentinelHidingContract` + `CardinalityCapBoundary`; impeccable dual-gate + adversarial review + real CI; merge. | **Opus** (UI) |

**Execution order is strict** (01 → 02 → 03): the projection field depends on the parser type; the UI depends on the projection field. Each file's tasks are independently red→green→commit. Final task in `03` is the cross-model adversarial review (between self-review and execution handoff) → iterate to APPROVE → impeccable dual-gate → real CI → merge.
