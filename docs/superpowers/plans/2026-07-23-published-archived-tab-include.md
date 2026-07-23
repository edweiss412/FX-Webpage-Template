# Published-Show Archived-Tab Gear Include Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click include/undo of an archived-tab pull sheet on the published show review modal, per spec `docs/superpowers/specs/2026-07-23-published-archived-tab-include.md` (all § refs below are that spec).

**Architecture:** New SECURITY DEFINER RPC `set_published_pull_sheet_override` writes `shows.pull_sheet_override` (in-RPC advisory lock, two-field CAS). New admin route scans the sheet at click time for the fingerprint, calls the RPC, audits, then chains `runManualSyncForShow`. Published modal derives offer state from the active-warning partition + the adapter-projected override snapshot; a new client card renders P2/P3/busy/err. StagedReviewCard surfaces are untouched (the warning never renders there; a pin test guards the filter fact).

**Tech Stack:** Next.js 16 route handlers, Supabase (postgres-js for db tests), Vitest + Testing Library, existing Tailwind v4 token classes.

## Global Constraints

- TDD per task; commit per task; conventional commits (invariants 1, 6).
- Advisory-lock single holder = the new RPC; JS never locks this key (invariant 2). Register topology in `tests/auth/advisoryLockRpcDeadlock.test.ts`.
- Actor email only via `requireAdminIdentity()` (canonicalized at `lib/auth/requireAdmin.ts:208`) — invariant 3.
- No raw status/code tokens in DOM; inline copy per §7 table verbatim (invariant 5).
- Supabase calls destructure `{ data, error }`; infra faults are typed results (invariant 9).
- Audit emits post-commit, before chained sync; never sheet contents; fingerprint prefix ≤ 12 chars (§6, invariant 10).
- UI copy: no em-dash, curly apostrophes in literals, `min-h-tap-min` tap targets, canonical token classes (pre-code mechanical gate).
- UI tasks are Opus-owned; impeccable dual-gate before close-out (invariant 8).
- Post-migration checklist: local apply → `pnpm gen:schema-manifest` commit → surgical validation apply (Task 1 + Task 8).

---

### Task 1: Migration — `set_published_pull_sheet_override` RPC

**Files:**
- Create: supabase/migrations/20260723090000_published_pull_sheet_override.sql
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts` (add topology entry; pattern at `tests/auth/advisoryLockRpcDeadlock.test.ts:69-72`)
- Test: tests/admin/publishedPullSheetOverrideRpc.db.test.ts
- Regen: `supabase/__generated__/schema-manifest.json` (via `pnpm gen:schema-manifest`)

**Interfaces:**
- Produces: RPC `set_published_pull_sheet_override(p_drive_file_id text, p_tab_name text, p_fingerprint text, p_accepted_by text, p_expected_override_snapshot jsonb) returns jsonb` — returns `jsonb_build_object('override', v_override)`. Raises: `40001` CAS mismatch; `P0002` row missing; `55000` lifecycle guard (unpublished/archived); `22023` arg guard (empty drive_file_id/fingerprint/actor). Route mapping: `P0002`+`55000` → 409 `lifecycle_conflict`; `40001` → 409 `stale_review`; `22023`/other → 502 `sync_infra`.
- Consumes: existing `shows.pull_sheet_override` column (`supabase/migrations/20260706000000_pull_sheet_override.sql:8-9`).

- [ ] **Step 1: Write the failing db test** (loopback-guarded like sibling `*.db.test.ts` suites; runs as service role via `TEST_DATABASE_URL`):

```ts
// tests/admin/publishedPullSheetOverrideRpc.db.test.ts
// Failure modes caught: lifecycle guard bypass (archived/unpublished/missing rows writable),
// CAS lost-update, wrong projection (full-object CAS), grant leak to authenticated.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL ?? "";
const loopback = /127\.0\.0\.1|localhost/.test(url);
const d = loopback ? describe : describe.skip;

d("set_published_pull_sheet_override", () => {
  let sql: postgres.Sql;
  const DFID = "test-pso-dfid-1";
  beforeAll(async () => {
    sql = postgres(url, { max: 1 });
    await sql`delete from shows where drive_file_id = ${DFID}`;
    await sql`insert into shows (id, drive_file_id, slug, title, client_label, template_version, published, archived)
              values (gen_random_uuid(), ${DFID}, 'test-pso-slug-1', 'PSO Test', 'PSO Client', 'v2', true, false)`;
  });
  afterAll(async () => { await sql`delete from shows where drive_file_id = ${DFID}`; await sql.end(); });

  it("accepts with null expected snapshot and writes the 4-field override", async () => {
    const [{ set_published_pull_sheet_override: out }] = await sql`
      select set_published_pull_sheet_override(${DFID}, 'OLD PULL SHEET', 'fp1', 'a@b.com', null)`;
    expect(out.override.tabName).toBe("OLD PULL SHEET");
    expect(out.override.fingerprint).toBe("fp1");
    expect(out.override.acceptedBy).toBe("a@b.com");
    expect(typeof out.override.acceptedAt).toBe("string");
  });

  it("CAS: stale null snapshot after an accept raises 40001", async () => {
    await expect(sql`
      select set_published_pull_sheet_override(${DFID}, 'OLD PULL SHEET', 'fp2', 'a@b.com', null)`)
      .rejects.toMatchObject({ code: "40001" });
  });

  it("CAS compares the two-field projection, not the stored 4-field object", async () => {
    const [{ set_published_pull_sheet_override: out }] = await sql`
      select set_published_pull_sheet_override(${DFID}, null, null, 'a@b.com',
        ${sql.json({ tabName: "OLD PULL SHEET", fingerprint: "fp1" })})`;
    expect(out.override).toBeNull(); // revoke succeeded against 2-field snapshot
  });

  it("rejects archived rows (legacy archived && published) with 55000", async () => {
    await sql`update shows set archived = true where drive_file_id = ${DFID}`;
    await expect(sql`
      select set_published_pull_sheet_override(${DFID}, 'T', 'fp', 'a@b.com', null)`)
      .rejects.toMatchObject({ code: "55000" });
    await sql`update shows set archived = false where drive_file_id = ${DFID}`;
  });

  it("rejects unpublished rows with 55000 and missing rows with P0002", async () => {
    await sql`update shows set published = false where drive_file_id = ${DFID}`;
    await expect(sql`select set_published_pull_sheet_override(${DFID}, 'T', 'fp', 'a@b.com', null)`)
      .rejects.toMatchObject({ code: "55000" });
    await sql`update shows set published = true where drive_file_id = ${DFID}`;
    await expect(sql`select set_published_pull_sheet_override('no-such-dfid', 'T', 'fp', 'a@b.com', null)`)
      .rejects.toMatchObject({ code: "P0002" });
  });

  it("accept path rejects empty fingerprint/actor with 22023", async () => {
    await expect(sql`select set_published_pull_sheet_override(${DFID}, 'T', '', 'a@b.com', null)`)
      .rejects.toMatchObject({ code: "22023" });
    await expect(sql`select set_published_pull_sheet_override(${DFID}, 'T', 'fp', '', null)`)
      .rejects.toMatchObject({ code: "22023" });
  });

  it("EXECUTE is revoked from authenticated/anon (grant posture)", async () => {
    const rows = await sql`
      select has_function_privilege('authenticated',
        'set_published_pull_sheet_override(text,text,text,text,jsonb)', 'EXECUTE') as a,
      has_function_privilege('anon',
        'set_published_pull_sheet_override(text,text,text,text,jsonb)', 'EXECUTE') as b`;
    expect(rows[0]).toEqual({ a: false, b: false });
  });
});
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/admin/publishedPullSheetOverrideRpc.db.test.ts` → FAIL: `function set_published_pull_sheet_override(...) does not exist`.

- [ ] **Step 3: Write the migration** (mirror `20260706000000_pull_sheet_override.sql:21-93`; §3.2 differences):

```sql
-- Published-show archived-tab override writer (spec 2026-07-23 §3.2). Sole writer of
-- shows.pull_sheet_override outside cron auto-clear. In-RPC advisory lock = single holder.
create or replace function public.set_published_pull_sheet_override(
  p_drive_file_id text,
  p_tab_name text,
  p_fingerprint text,
  p_accepted_by text,
  p_expected_override_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_published boolean;
  v_archived boolean;
  v_current jsonb;
  v_current_snapshot jsonb;
  v_override jsonb;
begin
  if coalesce(p_drive_file_id, '') = '' then
    raise exception 'drive_file_id required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id));

  select published, archived, pull_sheet_override
    into v_published, v_archived, v_current
    from public.shows where drive_file_id = p_drive_file_id;
  if not found then
    raise exception 'no shows row for drive_file_id' using errcode = 'P0002';
  end if;
  if v_published is distinct from true or v_archived is distinct from false then
    raise exception 'show is not published-active (lifecycle guard)' using errcode = '55000';
  end if;
  if p_tab_name is not null
     and (coalesce(p_fingerprint, '') = '' or coalesce(p_accepted_by, '') = '') then
    raise exception 'accept requires fingerprint and actor' using errcode = '22023';
  end if;

  -- Structural CAS (spec §3.2): single-arrow keeps jsonb values as jsonb; no text projection.
  v_current_snapshot := case when v_current is null then null
    else jsonb_build_object('tabName', v_current->'tabName', 'fingerprint', v_current->'fingerprint') end;
  -- Well-formed: each field absent, JSON null, or JSON string.
  if v_current is not null and (
       (v_current->'tabName' is not null and jsonb_typeof(v_current->'tabName') not in ('null','string'))
    or (v_current->'fingerprint' is not null and jsonb_typeof(v_current->'fingerprint') not in ('null','string'))
  ) then
    -- Malformed stored row: client cannot represent it. Revoke skips CAS (only possible
    -- transition is to null; advisory lock serializes; double-revoke idempotent).
    if p_tab_name is not null then
      raise exception 'stale override snapshot (malformed row accepts nothing)' using errcode = '40001';
    end if;
  elsif v_current_snapshot is distinct from p_expected_override_snapshot then
    raise exception 'stale override snapshot (row changed since review)' using errcode = '40001';
  end if;

  if p_tab_name is null then
    v_override := null;
  else
    v_override := jsonb_build_object(
      'tabName', p_tab_name,
      'fingerprint', p_fingerprint,
      'acceptedBy', p_accepted_by,
      'acceptedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end if;

  update public.shows set pull_sheet_override = v_override
   where drive_file_id = p_drive_file_id;

  return jsonb_build_object('override', v_override);
end;
$$;

revoke all on function public.set_published_pull_sheet_override(text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_published_pull_sheet_override(text, text, text, text, jsonb)
  to service_role;
```

- [ ] **Step 4: Apply locally + run test.** `supabase db query --local "$(cat supabase/migrations/20260723090000_published_pull_sheet_override.sql)"` (or the repo's standard local apply); rerun test → PASS. (Test connects as superuser via TEST_DATABASE_URL; grant-posture assertions use `has_function_privilege`.)

- [ ] **Step 5: Register lock topology in BOTH meta-tests.** (a) `tests/auth/advisoryLockRpcDeadlock.test.ts` (mirroring the `set_pull_sheet_override` entry at `tests/auth/advisoryLockRpcDeadlock.test.ts:69-72`); (b) `tests/sync/_advisoryLockSingleHolderContract.test.ts` — add the RPC holder row to the hard-coded registry (`tests/sync/_advisoryLockSingleHolderContract.test.ts:127`) AND a route negative check that app/api/admin/show/pull-sheet-override/route.ts never JS-locks (pattern at `tests/sync/_advisoryLockSingleHolderContract.test.ts:611`; add in Task 2 once the route exists if the meta requires the file present). Run both suites → PASS.

- [ ] **Step 6: Malformed-row carve-out db tests.** (a) UPDATE the row's `pull_sheet_override` to `{"tabName":123,"fingerprint":false}` directly via SQL, then call the RPC with `p_tab_name = null` and `p_expected_override_snapshot = '{"tabName": null, "fingerprint": null}'::jsonb` → succeeds, override null (revoke skips CAS on malformed). (b) Same malformed row, ACCEPT call → 40001. (c) Well-formed row `{"tabName":"x"}` (missing fingerprint): revoke with expected `{"tabName":"x","fingerprint":null}` → succeeds (structural match: absent key projects to JSON null via single-arrow build). Failure mode caught: permanent 40001 lock-out on malformed rows.

- [ ] **Step 7: Manifest regen.** `pnpm gen:schema-manifest`; commit regenerated `supabase/__generated__/schema-manifest.json` with this task.

- [ ] **Step 8: Commit.** `git add -A && git commit -m "feat(db): set_published_pull_sheet_override RPC with lifecycle guard and two-field CAS"`

### Task 2: Route — app/api/admin/show/pull-sheet-override/route.ts

**Files:**
- Create: app/api/admin/show/pull-sheet-override/route.ts
- Test: tests/admin/publishedPullSheetOverrideRoute.test.ts

**Interfaces:**
- Consumes: RPC from Task 1 (via service client `.rpc("set_published_pull_sheet_override", {...})`); `requireAdminIdentity` (`lib/auth/requireAdmin.ts:279`); `fetchCurrentSheetXlsxBytes` (`lib/drive/fetch.ts:536`); `synthesizeMarkdownFromXlsx` (`lib/drive/exportSheetToMarkdown.ts:301-304`); `runManualSyncForShow` (`lib/sync/runManualSyncForShow.ts:297`); `logAdminOutcome` (same helper the onboarding route uses at `app/api/admin/onboarding/pull-sheet-override/route.ts:242-249`).
- Produces: POST contract exactly per §3.4: 200 `{ok:true,status:"override_set"|"override_cleared",sync:{ok:boolean,kind:string}}` with the TOTAL sync classifier (`applied` → ok:true; every other ProcessOneFileResult outcome verbatim, plus `finalize_owned` | `archived_immutable` | `concurrent_skip` | `threw` → ok:false); 409 `stale_review` (40001) | `lifecycle_conflict` (P0002/55000); 422 `no_pull_sheet_region`; 502 `sync_infra` (22023/transport/null-payload/scan failure); 400 `bad_request` per §2.3 body-validation rows (exact-shape snapshot with null-tolerant string fields; whitespace-only strings rejected; tabName key REQUIRED, null = revoke). Exported for tests: `POST` plus `__testDeps` injection following the onboarding route's dependency-injection pattern (read that file first and mirror its DI mechanism; if it has none, export a `handlePullSheetOverride(body, deps)` core called by `POST` with production deps).

- [ ] **Step 1: Failing tests** — one `it` per §3.4 row plus each §10 boundary. Mock deps (no DB): identity ok/reject; scan returns tabs (incl. a tab with edge-whitespace name asserting EXACT raw-string match + verbatim storage per §2.3) / throws; RPC resolves `{data:{override:{...}},error:null}` / error 40001 / error P0002 / error 55000 / error 22023 / other error / `{data:null,error:null}` (502) / throws; sync: one case per classifier kind (`applied`, `stage`, `shrink_held`, `skipped`, `hard_fail`, `finalize_owned`, `archived_immutable`, `concurrent_skip`, `threw` — assert exact `{ok,kind}`); audit sink throws (response unchanged); body-validation: every §2.3 route-body row (absent/non-string/empty/whitespace driveFileId; tabName key missing vs null vs whitespace; snapshot scalar/array/extra-keys/missing-keys/non-string values). Assert exact status+body rows and that: audit called AFTER rpc success and BEFORE sync (call-order via a shared array the mocks push into); no audit on non-commit paths; fingerprint in audit payload truncated to 12 chars; revoke path skips scan entirely.

```ts
// Failure modes caught: wrong status mapping, audit ordering violation (invariant 10),
// audit on failed commit, scan run on revoke, raw error leak, sync failure masking commit.
import { describe, it, expect, vi } from "vitest";
// import { handlePullSheetOverride } from "@/app/api/admin/show/pull-sheet-override/route";
// deps: { identity, fetchBytes, synthesize, rpc, sync, audit } with full doubles per case.
```

(Write the full suite in-task following `tests/admin/` sibling patterns; every case's expected body copied verbatim from §3.4.)

- [ ] **Step 2: Run → FAIL (module not found).**
- [ ] **Step 3: Implement route** per §3.1 flow 1-6 (accept) and revoke variant; `export const dynamic = "force-dynamic"`. Body validation: `driveFileId` non-empty string; `tabName` string|null; `expectedOverrideSnapshot` null or `{tabName:string,fingerprint:string}` — anything else 400. Trimmed exact-match tab lookup. All Supabase calls destructure `{data,error}`; the RPC callsite carries the §10 inline annotation `// not-subject-to-meta: auth-helper registry scope does not cover API routes (tests/auth/_metaInfraContract.test.ts:69-78); this route's typed-result tests assert every §3.4 row (precedent: app/api/admin/onboarding/pull-sheet-override/route.ts)`.
- [ ] **Step 4: Run → PASS.** Also run `pnpm typecheck`.
- [ ] **Step 5: Commit.** `feat(admin): published pull-sheet-override route with scan-at-click and chained sync`

### Task 3: Telemetry registry + behavioral proof

**Files:**
- Modify: `tests/log/_auditableMutations.ts` (two rows, precedent `tests/log/_auditableMutations.ts:324-333`), `tests/log/adminOutcomeBehavior.test.ts`

**Interfaces:**
- Consumes: Task 2's route file path + `POST`.
- Produces: registry rows `{file:"app/api/admin/show/pull-sheet-override/route.ts", fn:"POST", code:"PULL_SHEET_OVERRIDE_SET"}` and `..._CLEARED`; behavioral cases proving the sink records the code on the committed-success branch for BOTH sync-ok and sync-failed sub-branches (§6).

- [ ] **Step 1:** Run `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts` → expect FAIL (new surface discovered, unregistered). This is the failing test.
- [ ] **Step 2:** Add the two registry rows; extend `adminOutcomeBehavior.test.ts` with FOUR cases (per-tuple completeness, `tests/log/adminOutcomeBehavior.test.ts:4462`): `PULL_SHEET_OVERRIDE_SET` × (sync-ok, sync-rejects) and `PULL_SHEET_OVERRIDE_CLEARED` × (sync-ok, sync-rejects); the sync-rejects cases assert the sink already saw the code BEFORE the sync mock ran (push-order array).
- [ ] **Step 3:** `pnpm vitest run tests/log` → PASS.
- [ ] **Step 4: Commit.** `test(log): register published pull-sheet-override surface with partial-success behavioral proof`

### Task 4: Adapter projection (read side)

**Files:**
- Modify: `components/admin/review/publishedAdapter.ts:82`
- Test: extend `tests/components/admin/review/publishedAdapter.test.ts`

**Interfaces:**
- Produces: `PublishedSectionData.pullSheetOverrideWire: null | { tabName: string | null, fingerprint: string | null }` — per field: absent/JSON-null → null; string verbatim; ANY non-string → null (representation stays database-owned; §3.2 malformed revoke carve-out makes the round trip safe). Adapter's generic `str()` helper (`publishedAdapter.ts:241`) NOT used. Do NOT reuse strict `OverrideSnapshot`. Type also declares `archivedTabOffer: {tabNames,slug}|null`, adapter ALWAYS emits null (modal attaches — Task 6).

- [ ] **Step 1: Failing tests** (spec §4 strings-only wire): stored 4-field object → `{tabName,fingerprint}` (acceptedBy/At dropped); null → null; `{tabName:"x"}` → `{tabName:"x", fingerprint:null}`; `"garbage"` string root → `{tabName:null, fingerprint:null}`; `{tabName:"  x ", fingerprint:""}` → verbatim; `{tabName:123, fingerprint:false}` → `{tabName:null, fingerprint:null}`; `{tabName:{a:1}, fingerprint:[1,2]}` → `{tabName:null, fingerprint:null}`. Derive expectations from fixture values.
- [ ] **Step 2: Run → FAIL** (adapter returns hard-coded null; the 4-field case fails).
- [ ] **Step 3: Implement** small `projectOverrideWire(raw: unknown)` in the adapter file returning the null-tolerant wire shape; replace line 82.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `feat(admin): published adapter projects pull_sheet_override snapshot`

### Task 5: StagedReviewCard filter-fact pin (spec §2.2)

**Files:**
- Test: extend the suite covering `lib/parser/dataGaps.ts` exports (locate via `rg -l "OPERATOR_ACTIONABLE_ANCHORED" tests/`)

**Interfaces:**
- Consumes: `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:370`).
- Produces: a pin test asserting `PULL_SHEET_ON_ARCHIVED_TAB` is NOT in `OPERATOR_ACTIONABLE_ANCHORED`, with a comment citing spec §2.2 (the published-offer surface decision depends on StagedReviewCard never rendering this warning; a future filter change must resurface that decision).

- [ ] **Step 1:** Write the pin test (it PASSES against current code by design — this is a decision pin, not TDD red/green; state that in the test comment). Concrete failure mode caught: someone adds the code to the anchored filter, silently making the catalog helpfulContext sentence render (and lie) on StagedReviewCard surfaces.
- [ ] **Step 2:** Run the suite → PASS.
- [ ] **Step 3: Commit.** `test(admin): pin PULL_SHEET_ON_ARCHIVED_TAB out of staged actionable filter`

### Task 6: Published offer UI (Opus-owned)

**Files:**
- Create: components/admin/review/publishedArchivedTabOffer.tsx (client component: offer card P2, override note P3, busy/err lines)
- Modify: `components/admin/wizard/archivedTabOffer.tsx` (export `ARCHIVED_TAB_BTN`, `ARCHIVED_TAB_GHOST_BTN`, `ARCHIVED_TAB_ERROR`), `components/admin/review/sectionData.ts` (published variant gains `archivedTabOffer` input field), `components/admin/review/publishedAdapter.ts` (accept `activeArchivedTabNames` via its options arg; build `archivedTabOffer: { tabNames: string[], slug: string } | null` honoring §2.3 guards: published && !archived && driveFileId non-null; raw-name exact dedupe; drop blank/whitespace-only names), `app/admin/_showReviewModal.tsx:328` area (POST-AUGMENT (NO reorder — live order is adapter→renderedSectionIds→model, app/admin/_showReviewModal.tsx:286,327-333): keep `buildPublishedSectionData(snapshot, {slug})` where it is; after `buildSectionWarningModel`, compute `activeArchivedTabNames` (raw `blockRef.name`, blanks dropped, exact-string dedupe, NO trimming) from the active partition and attach via `const dataForSurface = { ...publishedData, archivedTabOffer }` (guards: null unless published && !archived && driveFileId != null && names.length > 0); pass `dataForSurface` everywhere `publishedData` was passed to the surface), `components/admin/wizard/step3ReviewSections.tsx:4086-4093` (pass new props to `PackListBreakdown` in published mode), `components/admin/wizard/step3ReviewSections.tsx:2267` (`PackListBreakdown` renders the published offer/note when the new prop present; cap 3 + overflow line; S1 empty-state suppression per §2.3)
- Test: tests/components/admin/review/publishedArchivedTabOffer.test.tsx + extend `tests/components/admin/review/sectionData.test.ts`

**Interfaces:**
- Consumes: Task 2 route (`POST /api/admin/show/pull-sheet-override`), Task 4 projection, exported button classes.
- Produces: `PackListBreakdown` gains ONE optional prop `publishedGear?: { offer: { tabNames: string[]; slug: string } | null; wire: { tabName: string | null; fingerprint: string | null } | null; slug: string; driveFileId: string | null }` (presence gates published rendering; wizard path untouched). `<PublishedArchivedTabOffer>` renders from it: mode offer (P2) per tabName; mode note (P3) from `wire` (generic label "an archived tab" when `wire.tabName` null; Undo hidden when `driveFileId` null — read-only note per §2.3). POST accept `{driveFileId, tabName: RAW, expectedOverrideSnapshot: wire}` / revoke `{driveFileId, tabName: null, expectedOverrideSnapshot: wire}`; on `ok || status === 409` → exactly one `router.refresh()` (§2.4 P-err lifetime rule; 409 also shows the stale line); copy per §7 with the TOTAL generic bucket (any unrecognized status / non-JSON / 401 / 403 / network → generic line — test with a text/html 500 response and a 403); busy disables only own card.

- [ ] **Step 1: Failing component tests.** Cover: P2 renders offer with tab name; Include click POSTs exact body + disables own buttons only; success → router.refresh called (mock `next/navigation` `useRouter`); each §7 status → its verbatim copy line (assert full string equality against a constants export, and assert constants match §7 by literal in-test copies); P3 note + Undo POSTs revoke body; Skip collapses card and moves focus to section fallback; cap: 4 active names → 3 cards + overflow line "and 1 more archived tabs. Resolve these in the sheet."; POST body carries the RAW name verbatim (fixture name with edge whitespace, assert exact); guards: archived/unpublished/driveFileId-null → adapter builds null offer (sectionData test); raw-name dedupe + blank-drop (sectionData test); P3-degraded: wire override `{tabName:null,fingerprint:null}` renders note with "an archived tab" label and Undo posts that snapshot verbatim; per-kind copy: one assertion per §7 row incl. both stage-held lines. jsdom limits respected: assert `disabled` attributes and text, never `toBeVisible`.
- [ ] **Step 2: FAIL → implement → PASS.** Run scoped: `pnpm vitest run tests/components/admin/review`.
- [ ] **Step 3: Registry fan-out check.** Run `pnpm vitest run tests/components tests/styles tests/log tests/messages` — source-scanning registries (sentinel-hiding, copy scanners) walk component trees; new files must satisfy them.
- [ ] **Step 4: Commit.** `feat(admin): published pack-list archived-tab include offer and override note`

### Task 7: Full verification battery

- [ ] `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts tests/log tests/admin tests/components/admin/review` → PASS
- [ ] `pnpm test` (full suite; env-bound/e2e excluded by config) → PASS; check `$?` not the Tests line
- [ ] `pnpm typecheck && pnpm lint && pnpm format:check` → PASS
- [ ] DML lockdown posture: `pnpm vitest run` the suite matching `rg -l "postgrest" tests/db tests/admin` (verify `shows` direct DML still revoked; §10)
- [ ] Wizard regression: `pnpm vitest run tests/components/step3SheetCard.test.tsx tests/onboarding` → PASS
- [ ] Commit any straggler fixes as `fix(scope): ...`

### Task 8: Validation project apply

- [ ] Apply migration surgically: `psql "$VALIDATION_DB_URL" -f supabase/migrations/20260723090000_published_pull_sheet_override.sql` (resolve creds per AGENTS.md validation triple; then `notify pgrst, 'reload schema';`)
- [ ] `pnpm vitest run tests/db/validation-schema-parity.test.ts` (or its documented invocation) → PASS

### Task 9: Impeccable dual-gate (UI invariant 8)

- [ ] `/impeccable critique` on the diff's UI surfaces; fix P0/P1 or defer via `DEFERRED.md`
- [ ] `/impeccable audit` same scope; same disposition rule
- [ ] Commit fixes `fix(admin): impeccable findings ...`

### Task 10: Ship

- [ ] Whole-diff cross-model review (split tight-scope briefs if > a handful of files: brief A = migration+route+telemetry, brief B = UI+adapter) → APPROVE
- [ ] Push branch; open PR (body per repo conventions); real CI green; `gh pr merge --merge`
- [ ] Fast-forward local main; verify `git rev-list --left-right --count main...origin/main` = `0  0`
- [ ] `CronDelete` the ship nudge; mark ship-state `done`

## Self-review notes

- Spec coverage: §2.1/2.3/2.4 → Task 6; §2.2 → Task 5; §3.1/3.4/§7 statuses → Task 2; §3.2 → Task 1; §4 → Task 4; §6 → Task 3; §8 sweep → Task 7 (copy assertions in Tasks 5/6); §9 matrix rows → guard tests across Tasks 1/2/4/6; §10 → Tasks 1/3/7.
- Anti-tautology: route tests assert exact bodies vs §3.4, not "handler called"; adapter tests derive from fixture objects; copy tests assert full-string equality; cap test derives overflow count from fixture length.
- Snippet typecheck: Task 1 SQL mirrors shipped RPC; TS snippets use only verified imports/signatures (verification transcript in session log).
