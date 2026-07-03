# Admin-Alert Auto-Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** State-based admin alerts resolve themselves when their condition clears, per spec `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md` (Codex-APPROVE'd R7).

**Architecture:** Point-of-recovery resolution at six surfaces (S1–S6). S1 is a DB trigger on the `shows.published` false→true flip plus a one-time data repair; S2–S6 are per-surface resolve calls using the transaction machinery native to each site (postgres.js in-tx SQL for sync/cron; the Supabase service-role helper for JS post-commit paths). A new bulk helper `resolveAdminAlerts` is the JS chokepoint; a new `ADMIN_ALERTS_LIFECYCLE` registry in the catalog meta-test pins every code's lifecycle class and resolve site.

**Tech Stack:** Next.js 16 / TypeScript / Supabase (postgres.js + supabase-js) / vitest / psql-based DB tests.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md`. AGENTS.md plan-wide invariants 1–9 all apply.
- Auto-resolution sets `resolved_at = now()` and **never** `resolved_by` (spec §2). Every resolve filters `resolved_at IS NULL`.
- No new §12.4 codes, no catalog rows, no copy changes (spec §5).
- TDD per task: failing test → minimal implementation → green → commit (`--no-verify`; run `pnpm format:check` before push).
- Commit format: `<type>(<scope>): <summary>`; scopes here are `db`, `sync`, `drive`, `crew-page`, `admin`, `plan`, `infra`.
- **Advisory-lock topology (invariant 2):** NO new lock holders at any layer. The S1 trigger runs inside whichever transaction flips `published` (publish_show's in-RPC lock `b2_show_lifecycle.sql:141`; finalize-cas's JS-side locks `finalize-cas/route.ts:534`; mint RPC's in-RPC lock). S2–S6 resolves ride existing transactions or standalone service-role calls; `admin_alerts` is not in the invariant-2 lock-gated table set. `tests/auth/advisoryLockRpcDeadlock.test.ts` needs no new registry rows — the new migration adds no `pg_advisory*` call (its generic body scan confirms).
- **Meta-test inventory (declared per AGENTS.md):** EXTENDS `tests/messages/_metaAdminAlertCatalog.test.ts` (new `ADMIN_ALERTS_LIFECYCLE` registry, Task 8); EXTENDS `tests/notify/_metaInfraContract.test.ts` behavioral coverage (bulk helper, Task 1); CREATES `tests/db/admin-alert-auto-resolution.test.ts` (Task 2). Not applicable: sentinel-hiding, admin-alert-catalog §12.4 rows (no new codes), no-inline-email (no email surfaces), PostgREST DML lockdown (no new RPC-gated table).
- **Anti-tautology:** every resolve assertion reads `admin_alerts` rows (via the mocked client's recorded calls or psql), never UI/log output. Expected values derive from fixture state, never hardcoded copies of implementation constants.

## File Structure

| File | Change | Surface |
|---|---|---|
| `lib/adminAlerts/resolveAdminAlert.ts` | add `resolveAdminAlerts` bulk export | helper |
| `supabase/migrations/20260703210000_admin_alert_auto_resolution.sql` | new: trigger fn + trigger + data repair | S1 |
| `lib/sync/applyStaged.ts` | live post-commit reconcile (S2 family + S3-on-complete) | S2/S3 |
| `lib/sync/assetRecovery.ts` | resolve at cooldown-gate-pass + complete branch | S3 |
| `lib/sync/diagramGc.ts` | `resolveClearedStuckAlerts` anti-join reconcile | S4 |
| `lib/sync/promoteSnapshot.ts` | resolve at `clearRolledBack` + `repairSnapshotRollback` repaired branch | S4 |
| `app/api/drive/webhook/route.ts` | resolve on verified delivery (matching channel) | S5 |
| `lib/drive/watch.ts` | no-folder resolve-all; healthy-path stale-channel resolve | S5 |
| `app/show/[slug]/[shareToken]/_CrewShell.tsx` | healthy-render resolve via `after()` | S6 (UI-surface file — invariant 8) |
| `tests/…` | per-surface tests as listed in tasks | — |
| `BACKLOG.md` | DEFER entries | — |
| `supabase/__generated__/schema-manifest.json` | regen (no table changes expected → likely no diff) | S1 |

---

### Task 1: Bulk helper `resolveAdminAlerts` (AC12)

**Files:**
- Modify: `lib/adminAlerts/resolveAdminAlert.ts`
- Test: `tests/adminAlerts/resolveAdminAlert.test.ts` (extend), `tests/notify/_metaInfraContract.test.ts` (extend behavioral test at :177)

**Interfaces:**
- Produces: `resolveAdminAlerts(input: { showId: string | null; codes: readonly AdminAlertCode[] }, client?: SupabaseClient): Promise<void>` — early no-op on `codes.length === 0`; throws on returned DB error and on thrown fault; sets only `resolved_at`.

- [ ] **Step 1: Write failing tests** in `tests/adminAlerts/resolveAdminAlert.test.ts` (follow the existing mocked-client pattern in that file):

```ts
describe("resolveAdminAlerts (bulk)", () => {
  test("codes: [] is a no-op — zero client invocations", async () => {
    const client = makeMockClient(); // reuse the file's existing mock factory
    await resolveAdminAlerts({ showId: "s-1", codes: [] }, client as never);
    expect(client.from).not.toHaveBeenCalled();
  });
  test("filters: code IN codes, show_id exact (null → .is), resolved_at null; sets only resolved_at", async () => {
    const client = makeMockClient();
    await resolveAdminAlerts({ showId: null, codes: ["REEL_DRIFTED", "EMBEDDED_ASSET_DRIFTED"] }, client as never);
    // assert .update({resolved_at: <iso>}) with NO resolved_by key, .in("code", [...]), .is("show_id", null), .is("resolved_at", null)
  });
  test("returned DB error throws", async () => { /* mock update chain returning { error: {...} } → await expect(...).rejects.toThrow() */ });
  test("thrown query fault throws", async () => { /* mock chain rejecting → rejects.toThrow() */ });
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/adminAlerts/resolveAdminAlert.test.ts` — expect FAIL (`resolveAdminAlerts` not exported).
- [ ] **Step 3: Implement** in `lib/adminAlerts/resolveAdminAlert.ts`, mirroring `resolveAdminAlert` (:11-29) exactly:

```ts
export async function resolveAdminAlerts(
  input: { showId: string | null; codes: readonly AdminAlertCode[] },
  client?: Client,
): Promise<void> {
  if (input.codes.length === 0) return; // empty .in() must never reach PostgREST (spec §4)
  const supabase = client ?? createSupabaseServiceRoleClient();
  let query = supabase
    .from("admin_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .in("code", [...input.codes])
    .is("resolved_at", null);
  query = input.showId === null ? query.is("show_id", null) : query.eq("show_id", input.showId);
  const { error } = await query.select("id"); // execution shape mirrors resolveAdminAlert.ts:24 (mocks are select-terminated)
  if (error) throw new Error(`admin alert bulk resolve failed: ${error.message ?? String(error)}`);
}
```

Test mocks MUST be `.select("id")`-terminated thenables, exactly like the existing
`resolveAdminAlert` mocks in `tests/adminAlerts/resolveAdminAlert.test.ts` — do not await the
builder directly.

- [ ] **Step 4: Extend** `tests/notify/_metaInfraContract.test.ts` behavioral test (:177 block): add the same returned-error/thrown-fault assertions for `resolveAdminAlerts` (registry row `lib/adminAlerts/resolveAdminAlert.ts` already exists at :16 — no registry change).
- [ ] **Step 5: Run** both test files — expect PASS. Also `pnpm typecheck`.
- [ ] **Step 6: Commit** `feat(admin): add resolveAdminAlerts bulk helper with empty-codes guard`

### Task 2: S1 migration — published-flip trigger + data repair (AC1, AC2, AC9)

**Files:**
- Create: `supabase/migrations/20260703210000_admin_alert_auto_resolution.sql`
- Test: `tests/db/admin-alert-auto-resolution.test.ts` (new, `runPsql` pattern from `tests/db/b2-lifecycle-rpc-meta.test.ts:1-16`)

**Interfaces:**
- Produces: trigger `shows_resolve_unpublished_alert_on_publish` on `public.shows`; function `public.resolve_show_unpublished_alert_on_publish()`.

- [ ] **Step 1: Write failing DB tests** (`tests/db/admin-alert-auto-resolution.test.ts`). Fixtures: INSERT a show (published=false) + open SHOW_UNPUBLISHED alert via `upsert_admin_alert`; derive expectations from the inserted rows. Cases:

```ts
// 1. raw UPDATE shows SET published=true → alert resolved_at NOT NULL, resolved_by NULL (trigger-level coverage)
// 2. publish_show RPC on unpublished show with open alert → published AND resolved (same tx durability: assert post-call)
// 3. refused publish (archived=true show) → RPC raises SHOW_ARCHIVED_IMMUTABLE, alert still open
// 4. flip on show with no open alert → no rows touched, no error
// 5. DATA-REPAIR (non-tautological — must prove the repair block, not the trigger): INSERT a show
//    directly with published=true (an INSERT never fires the after-UPDATE trigger) + open
//    SHOW_UNPUBLISHED alert via upsert_admin_alert → re-run the migration file (psql -f) → alert
//    resolved by the repair UPDATE alone. Also: unpublished show + open alert → repair re-run leaves
//    it open. Run the file twice overall → no error (apply-twice idempotency).
// 6. resolved_by stays NULL for every trigger/repair resolution; manual-resolve regression is covered by existing route tests (do not duplicate)
```

- [ ] **Step 2: Run** `pnpm vitest run tests/db/admin-alert-auto-resolution.test.ts` — expect FAIL (trigger absent).
- [ ] **Step 3: Write the migration** exactly as spec S1 (trigger function + `drop trigger if exists` + `create trigger after update of published ... when (old.published is distinct from new.published and new.published)`) plus the data repair:

```sql
-- One-time data repair: heal alerts stranded before the trigger existed.
update public.admin_alerts a
   set resolved_at = now()
  from public.shows s
 where s.id = a.show_id
   and a.code = 'SHOW_UNPUBLISHED'
   and a.resolved_at is null
   and s.published = true;
```

- [ ] **Step 4: Apply locally**: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/20260703210000_admin_alert_auto_resolution.sql` (twice — idempotency), then re-run the DB tests — expect PASS.
- [ ] **Step 5: Commit** `feat(db): trigger-resolve SHOW_UNPUBLISHED on published flip + data repair`

### Task 3: S2 live-apply family reconcile (AC3)

**Files:**
- Modify: `lib/sync/applyStaged.ts` (post-commit block :1798-1825; deps type; live effects)
- Test: `tests/sync/applyStaged.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveAdminAlerts` (Task 1).
- Produces: `LIVE_VERIFY_ALERT_FAMILY = ["REEL_DRIFTED","OPENING_REEL_PERMISSION_DENIED","OPENING_REEL_NOT_VIDEO","EMBEDDED_ASSET_DRIFTED"] as const` (exported from `lib/sync/applyStaged.ts`); `ApplyStagedDeps.resolveAdminAlerts?: typeof resolveAdminAlerts`.

- [ ] **Step 1: Failing tests** in `tests/sync/applyStaged.test.ts` (reuse its live-apply fixtures + injected `deps.upsertAdminAlert` pattern; inject `deps.resolveAdminAlerts` spy):
  - clean live apply (no drift, reel verifies null) → `resolveAdminAlerts` called once with `{ showId: <result.showId>, codes: [all four family codes] }`;
  - apply raising exactly `REEL_DRIFTED` → resolve called with the other three only;
  - wizard-scope apply → resolve NOT called;
  - `outcome !== "applied"` → resolve NOT called.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** in the existing live post-commit block (after the `adminAlertCodes` upsert loop, same guards `!("skipped" in result) && result.outcome === "applied"`):

```ts
const raised = new Set([result.adminAlertCode, ...(result.adminAlertCodes ?? [])].filter(Boolean));
const toResolve = LIVE_VERIFY_ALERT_FAMILY.filter((c) => !raised.has(c));
const resolveAlerts = deps.resolveAdminAlerts ?? resolveAdminAlerts;
await resolveAlerts({ showId: result.showId, codes: toResolve });
```

  Error posture: awaited, un-caught — identical to the adjacent upserts (invariant 9; a resolve fault surfaces like an upsert fault).
- [ ] **Step 4: Run** — PASS. `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(sync): live-apply reconciles reel/drift alert family (resolve on clean verify)`

### Task 4: S3 recovery-complete resolution (AC4)

**Files:**
- Modify: `lib/sync/assetRecovery.ts` (deps + tx + two call sites), `lib/sync/applyStaged.ts` (extend Task 3 block with S3-on-complete)
- Test: `tests/sync/assetRecovery.test.ts`, `tests/sync/applyStaged.test.ts` (extend)

**Interfaces:**
- Produces: `ASSET_RECOVERY_ALERT_FAMILY = ["ASSET_RECOVERY_BYTES_EXCEEDED","ASSET_RECOVERY_REVISION_DRIFT","ASSET_RECOVERY_DRIFT_COOLDOWN","EMBEDDED_RECOVERY_REQUIRES_RESTAGE"] as const` (exported from `lib/sync/assetRecovery.ts`); `AssetRecoveryTx.resolveAdminAlerts(showId: string, codes: readonly string[]): Promise<void>` (in-tx SQL default impl beside the existing `tx.upsertAdminAlert` impl); optional dep `AssetRecoveryDeps.resolveDriftCooldownAlert?(showId: string): Promise<void>`.

- [ ] **Step 1: Failing tests** in `tests/sync/assetRecovery.test.ts` (reuse its deps-mock fixtures):
  - run that passes the cooldown gate (no active cooldown) → `resolveDriftCooldownAlert` called with showId, even when the run later returns `bytes_exceeded`;
  - run reaching `recovered.snapshot_status === "complete"` → `tx.resolveAdminAlerts(showId, ASSET_RECOVERY_ALERT_FAMILY)` called inside the locked tx (assert against the mock tx recorder);
  - run ending `partial_failure` → NOT called.
  In `tests/sync/applyStaged.test.ts`: live apply landing `snapshot_status === "complete"` → resolve also called with the S3 family; landing `partial_failure` → S3 family NOT resolved (S2 family still reconciled).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**:
  - `assetRecovery.ts`: after the cooldown check concludes "inactive/absent" (immediately before `collectVerifiedAssets`), `await deps.resolveDriftCooldownAlert?.(showId)` (default impl: `resolveAdminAlert({ showId, code: "ASSET_RECOVERY_DRIFT_COOLDOWN" })`); in the locked-tx `'complete'` branch (`:574`, beside `deleteRecoveryCooldown` `:571`), `await tx.resolveAdminAlerts(showId, ASSET_RECOVERY_ALERT_FAMILY)` with the default SQL impl:

```sql
update public.admin_alerts
   set resolved_at = now()
 where show_id = $1::uuid and code = any($2::text[]) and resolved_at is null
```

  - `applyStaged.ts`: the live boundary does NOT surface `snapshot_status` (`Phase2Result` /
    `ApplyStagedCoreResult` return only `snapshotRevisionId`) — do NOT thread it through those
    result types. Instead the post-commit block re-reads the committed status: add
    `ApplyStagedDeps.readLandedSnapshotStatus?: (showId: string) => Promise<string | null>` with a
    default impl on the service-role client:

```ts
const { data, error } = await client.from("shows").select("diagrams").eq("id", showId).single();
if (error) throw new Error(`landed snapshot status read failed: ${error.message}`);
const raw = data?.diagrams as
  | ({ snapshot_status?: string } & { current?: { snapshot_status?: string } | null })
  | null;
// "Landed" means the LIVE snapshot: mirror resolveCurrentDiagrams (lib/data/diagrams.ts:54-58),
// which accepts the {current} wrapper OR a bare PersistedDiagrams root and IGNORES `pending` —
// a pending payload is pre-promotion (promoteSnapshot may still fail/roll back), so pending
// status must NEVER resolve S3 alerts. Precedence: current → root.
return raw?.current?.snapshot_status ?? raw?.snapshot_status ?? null;
```

  Unit tests cover: current wins; bare root; **pending-complete with current-partial → returns
  "partial_failure" (S3 family NOT resolved — promotion not landed)**; null → null. The psql case
  in `tests/db/admin-alert-auto-resolution.test.ts` seeds a wrapped row, a bare row, AND a
  pending-complete/current-partial row and asserts the extraction for each.

    In the Task-3 block, when `await readLanded(result.showId) === "complete"`, append
    `ASSET_RECOVERY_ALERT_FAMILY` to `toResolve`. Tests: unit-test the default impl against the
    standard mocked client (precedence current → root with `pending` IGNORED —
    pending-complete/current-partial returns `"partial_failure"`; null diagrams → null); the
    `applyStaged` live test injects `readLandedSnapshotStatus` returning `"complete"` /
    `"partial_failure"` and asserts the S3 family is appended / omitted; PLUS one case in
    `tests/db/admin-alert-auto-resolution.test.ts` seeding a real `shows.diagrams` JSONB and
    asserting the same extraction expression via psql (proves the default's path shape against a
    real row, not just mocks).
- [ ] **Step 4: Run** — PASS. `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(sync): resolve asset-recovery alert family on snapshot completion + cooldown expiry`

### Task 5: S4 stuck-snapshot reconcile + rollback completion (AC5)

**Files:**
- Modify: `lib/sync/diagramGc.ts` (factory + gc run), `lib/sync/promoteSnapshot.ts` (`clearRolledBack` + `repairSnapshotRollback`)
- Test: `tests/sync/diagramGc.test.ts`, `tests/sync/promoteSnapshot.test.ts` (extend)

- [ ] **Step 1: Failing tests**:
  - `diagramGc.test.ts`: show with open PROMOTE_STUCK alert whose pending row has since `promoted_at IS NOT NULL` → gc run resolves it; row still matching the stuck predicate (derive timestamps from the fixture's `now` minus >15min) → stays open; same pair for DELETE_STUCK.
  - `promoteSnapshot.test.ts`: successful `clearRolledBack` → ROLLBACK_STUCK resolved via promoteTx; `repairSnapshotRollback` repaired branch → same; failed rollback (throw) → not resolved.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**:
  - `diagramGc.ts` factory: add `resolveClearedStuckAlerts(now)` beside `emitStuckAlerts` (:295), and call it immediately after every `emitStuckAlerts` call site in the gc run:

```sql
update public.admin_alerts a
   set resolved_at = now()
 where a.code = 'PENDING_SNAPSHOT_PROMOTE_STUCK' and a.resolved_at is null
   and not exists (
     select 1 from public.pending_snapshot_uploads p
      where p.show_id = a.show_id
        and p.promote_started_at is not null and p.promoted_at is null
        and p.promote_started_at < $1::timestamptz - interval '15 minutes')
```

  (second statement identical for DELETE_STUCK with the `delete_started_at`/`claim_expires_at` predicate from `diagramGc.ts:323-327`).
  - `promoteSnapshot.ts`: in `clearRolledBack` after its UPDATE succeeds, and in the `repairSnapshotRollback` `repaired` branch (`:410-440`) before returning:

```ts
await promoteTx.queryOne(
  `update public.admin_alerts set resolved_at = now()
    where show_id = $1::uuid and code = 'PENDING_SNAPSHOT_ROLLBACK_STUCK' and resolved_at is null`,
  [row.show_id],
);
```

- [ ] **Step 4: Run** — PASS. `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(sync): gc reconciles stuck-snapshot alerts; rollback completion resolves rollback-stuck`

### Task 6: S5 webhook-token recovery (AC6)

**Files:**
- Modify: `app/api/drive/webhook/route.ts`, `lib/drive/watch.ts`
- Test: `tests/drive/webhook.test.ts`, `tests/drive/watch.test.ts` (extend)

- [ ] **Step 1: Failing tests**:
  - `webhook.test.ts`: delivery passing token (:274) AND resource (:284) checks with an open WEBHOOK_TOKEN_INVALID alert whose `context->>'channel_id'` equals the delivering channel → resolved (including for a non-dispatching resourceState like `sync`); open alert naming a DIFFERENT channel_id → untouched; invalid delivery → still raises, never resolves.
  - `watch.test.ts`: no-folder-configured reconcile → open WEBHOOK_TOKEN_INVALID (global, single row by dedup) resolved alongside WATCH_CHANNEL_ORPHANED; healthy reconcile with alert naming a channel that is NOT a live active channel for the folder → resolved; alert naming the CURRENT live channel → untouched.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**:
  - `webhook/route.ts`: after the resource check passes (immediately before the `isDispatchingState` branch at :294), inside the existing webhook tx pattern:

```ts
await callWebhookTx("admin_alerts.resolve_webhook_token_invalid", () =>
  tx.resolveWebhookTokenInvalidForChannel(channelId),
);
```

  with the tx method:

```sql
update public.admin_alerts
   set resolved_at = now()
 where show_id is null and code = 'WEBHOOK_TOKEN_INVALID' and resolved_at is null
   and context->>'channel_id' = $1
```

  - `watch.ts`: (a) no-folder vacuous branch (:655-667): add `await resolve({ showId: null, code: "WEBHOOK_TOKEN_INVALID" })` in the same try/catch (`alert_resolve_write` fault posture); (b) healthy (:692) and recovered (:720) branches: call a new tx method `resolveStaleWebhookTokenInvalid(folderId, nowIso)`:

```sql
update public.admin_alerts a
   set resolved_at = now()
 where a.show_id is null and a.code = 'WEBHOOK_TOKEN_INVALID' and a.resolved_at is null
   and not exists (
     select 1 from public.drive_watch_channels c
      where c.id = a.context->>'channel_id'
        and c.watched_folder_id = $1 and c.status = 'active' and c.expires_at > $2::timestamptz)
```

  (predicate mirrors `hasLiveActiveChannel`, `watch.ts:268-278`; same try/catch fault posture as the adjacent WATCH_CHANNEL_ORPHANED resolves).
- [ ] **Step 4: Run** — PASS. `pnpm typecheck`. Note: any new `.toLowerCase()`/`.trim()` in lib/drive would need `// canonicalize-exempt` — none expected; run `pnpm vitest run tests/admin/no-inline-email-normalization.test.ts` to confirm.
- [ ] **Step 5: Commit** `feat(drive): verified webhook + watch reconcile resolve WEBHOOK_TOKEN_INVALID`

### Task 7: S6 crew-shell projection recovery (AC7) — UI-surface file

**Files:**
- Modify: `app/show/[slug]/[shareToken]/_CrewShell.tsx` (:151-176 producer block)
- Test: `tests/components/crew/crewShellAlert.test.tsx` (extend)

- [ ] **Step 1: Failing tests.** `_CrewShell` has no resolver prop — use module mocks:
  `vi.mock("@/lib/adminAlerts/resolveAdminAlert", ...)` for the resolve spy (matching how the file
  mocks the upsert module) AND `vi.mock("next/server", ...)` where `after` is mocked to capture its
  callback into an array; the test flushes captured callbacks (`for (const cb of afterCallbacks) await cb()`)
  BEFORE asserting. Cases:
  - render with empty `data.tileErrors` → after-callback flush → resolve spy called once with `{ showId, code: "TILE_PROJECTION_FETCH_FAILED" }`; no upsert call;
  - render with `tileErrors` non-empty → upsert called (existing behavior), resolve NOT called;
  - resolve spy throws → render still succeeds (fail-quiet, `log.warn` with a `code:`-stamped payload mirroring `CREW_PROJECTION_ALERT_UPSERT_FAILED` — reuse that exact code? No: stamp `code: "CREW_PROJECTION_ALERT_RESOLVE_FAILED"` is a NEW internal code → NOT allowed without §12.4 work. Reuse the existing `CREW_PROJECTION_ALERT_UPSERT_FAILED` code with `phase: "resolve"` in the payload instead — zero catalog impact.)
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** in the `else` arm of the `failedKeys.length > 0` check, scheduled via `after()` (import from `next/server`; precedent PR #228 C8):

```tsx
} else {
  after(async () => {
    try {
      await resolveAdminAlert({ showId, code: "TILE_PROJECTION_FETCH_FAILED" });
    } catch (e) {
      void log.warn("projection-alert resolve failed (fail-quiet):", {
        source: "crew.shell",
        code: "CREW_PROJECTION_ALERT_UPSERT_FAILED",
        phase: "resolve",
        error: e,
      });
    }
  });
}
```

  Add the `// not-subject-to-meta: best-effort observability write, fail-quiet` comment matching the raise path (:156).
- [ ] **Step 4: Run** — PASS. `pnpm typecheck`. **No JSX/rendered-output change** (assert existing snapshot tests unchanged).
- [ ] **Step 5: Commit** `feat(crew-page): healthy shell render resolves TILE_PROJECTION_FETCH_FAILED`

### Task 8: `ADMIN_ALERTS_LIFECYCLE` structural registry (AC8)

**Files:**
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts`

- [ ] **Step 1: Write the registry + assertions (this test IS the deliverable — it must fail if a code is unclassified):**

```ts
type Lifecycle =
  | { class: "auto"; resolveSites: Array<{ file: string; pattern: RegExp }> }
  | { class: "event-manual" } | { class: "state-manual-justified" } | { class: "deferred" };
const ADMIN_ALERTS_LIFECYCLE: Record<(typeof ADMIN_ALERTS_CODES)[number], Lifecycle> = {
  // 7 precedent AUTO codes + 14 NEW codes → class "auto" with their resolve site(s), e.g.:
  SHOW_UNPUBLISHED: { class: "auto", resolveSites: [{ file: "supabase/migrations/20260703210000_admin_alert_auto_resolution.sql", pattern: /shows_resolve_unpublished_alert_on_publish/ }] },
  REEL_DRIFTED: { class: "auto", resolveSites: [{ file: "lib/sync/applyStaged.ts", pattern: /LIVE_VERIFY_ALERT_FAMILY/ }] },
  // … (full 42-code table per spec §3: 21 auto, 18 event-manual, TILE_SERVER_RENDER_FAILED state-manual-justified, 3 deferred)
};
test("every registry code declares a lifecycle", () => { /* keys(ADMIN_ALERTS_LIFECYCLE) === ADMIN_ALERTS_CODES set-equality */ });
test("every auto code's resolve site exists on disk and matches", () => { /* readFileSync(file) → pattern.test(content) */ });
```

  (Counts cross-check spec §3: 7 AUTO + 14 NEW = 21 `auto`; 18 `event-manual`; 1 `state-manual-justified`; 3 `deferred`; total 42.)
- [ ] **Step 2 (RED — mandatory, run before green):** author the registry with a deliberately wrong
  resolve-site pattern for ONE new code (e.g. `SHOW_UNPUBLISHED: pattern: /nonexistent_trigger_name/`)
  and one code deliberately omitted from the map. Run
  `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts` — expect BOTH new tests to FAIL
  (site-pattern miss + set-inequality). This proves the meta-test can catch a missing site and an
  unclassified code (invariant-1 red phase; the resolve sites themselves already landed in Tasks
  1–7, so the red phase is seeded through the registry, not the implementation).
- [ ] **Step 3 (GREEN):** correct the pattern and restore the omitted code → run again → PASS.
- [ ] **Step 4: Commit** (single commit at green) `test(admin): ADMIN_ALERTS_LIFECYCLE registry pins per-code lifecycle + resolve sites`

### Task 9: BACKLOG entries + spec status flip

**Files:**
- Modify: `BACKLOG.md`, `docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md` (Status → Implemented)

- [ ] **Step 1:** Append BACKLOG.md entries (follow its existing entry format): `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE`, `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE`, `BL-ALERT-REPORT-FAMILY-AUTORESOLVE`, `BL-ALERT-TILE-RENDER-PER-TILE-KEYING` — each citing spec §3's DEFER/justified rows.
- [ ] **Step 2: Commit** `docs(plan): BACKLOG entries for deferred alert auto-resolution families`

### Task 10: Schema manifest + validation-project apply (AC10 gate)

**Files:**
- Modify: `supabase/__generated__/schema-manifest.json` (regen; trigger-only migration → expect no diff, commit only if changed)

- [ ] **Step 1:** `pnpm gen:schema-manifest` against the local all-migrations-applied DB; `git diff --stat supabase/__generated__/` (expect empty — the migration adds no tables/columns).
- [ ] **Step 2:** Apply the migration surgically to the validation project. Source the env from the MAIN checkout (`TEST_DATABASE_URL` lives in `/Users/ericweiss/FX-Webpage-Template/.env.local`, NOT the worktree) but run against the WORKTREE's migration file (main doesn't contain it pre-merge): `TEST_DATABASE_URL=$(grep '^TEST_DATABASE_URL=' /Users/ericweiss/FX-Webpage-Template/.env.local | cut -d= -f2-) psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f /Users/ericweiss/FX-Webpage-Template/.claude/worktrees/alert-auto-resolution/supabase/migrations/20260703210000_admin_alert_auto_resolution.sql` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. **This also executes the data repair on validation — verify the live stale East Coast alert resolves** (`select resolved_at from admin_alerts where code='SHOW_UNPUBLISHED'`).
- [ ] **Step 3:** `pnpm vitest run tests/db/validation-schema-parity.test.ts` (needs TEST_DATABASE_URL env) — PASS.
- [ ] **Step 4: Commit** (only if manifest changed) `infra: regen schema manifest for alert auto-resolution migration`

### Task 11: Invariant-8 impeccable dual-gate on the S6 diff (AC11)

- [ ] **Step 1:** Run `/impeccable critique` on the diff touching `_CrewShell.tsx`; then `/impeccable audit` on the same diff (canonical v3 preflight gates: PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2:** Fix HIGH/CRITICAL findings or defer via `DEFERRED.md` entry. Record findings + dispositions in the plan-dir handoff notes (`docs/superpowers/plans/2026-07-03-admin-alert-auto-resolution/handoff.md` §12).
- [ ] **Step 3: Commit** any fixes `fix(crew-page): impeccable dual-gate dispositions for S6`

### Task 12: Full-suite close-out (AC10)

- [ ] **Step 1:** `pnpm typecheck` (vitest strips types — a TS error passes vitest but fails CI), `pnpm format:check` (+ `prettier --write` any offenders — `--no-verify` commits skipped the hook; NEVER prettier the master spec), full `pnpm test`. Fix fallout (exactOptional shape breaks, meta-test catch-windows).
- [ ] **Step 2:** Verify pre-existing failures (if any) at merge-base before attributing.
- [ ] **Step 3: Commit** fixes `test(sync): full-suite fallout fixes` (or scoped equivalents).

## Pre-execution gate: Adversarial review (cross-model) — NOT an implementation task

Per AGENTS.md, the plan-level cross-model review sits between plan self-review and execution
handoff — i.e. BEFORE Task 1 runs, not after Task 12. This plan does not execute until Codex
returns APPROVE on the plan itself (fresh-eyes, REVIEWER ONLY, no round budget; class-sweep every
finding). A SEPARATE whole-diff cross-model review happens at milestone close-out (pipeline Stage
4), after Task 12.

---

## Self-review notes (completed)

- **Spec coverage:** S1→T2, S2→T3, S3→T4, S4→T5, S5→T6, S6→T7, helper→T1, meta-test→T8, BACKLOG→T9, migration parity→T10, AC11→T11, AC10→T12. All 12 ACs mapped.
- **Type consistency:** `resolveAdminAlerts({showId, codes})` (T1) consumed by T3/T4; `LIVE_VERIFY_ALERT_FAMILY` (T3) referenced by T8's registry pattern; `ASSET_RECOVERY_ALERT_FAMILY` (T4) likewise.
- **No new internal log codes** (T7 reuses `CREW_PROJECTION_ALERT_UPSERT_FAILED` with a `phase` discriminator) — zero §12.4 surface.
