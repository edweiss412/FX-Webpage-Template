# ONBOARDING_SHEET_UNREADABLE Hybrid Lifecycle + Names-in-Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `ONBOARDING_SHEET_UNREADABLE` admin alert name the failed sheets on its card and auto-clear when the condition heals (cron + clean-scan observers), while keeping the manual Resolve button.

**Architecture:** Producer adds sheet names to alert context; identity projection renders them (capped) on the card; a new silent `recoveryResolution`-style helper conditionally UPDATEs `resolved_at`, called from two post-commit observers (onboarding scan route + cron tick epilogue); a new `"hybrid"` lifecycle class maps to catalog `resolution:"manual"` so the button and routes are unchanged.

**Tech Stack:** Next.js 16, TypeScript, Supabase/Postgres (`postgres` client), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-onboarding-sheet-unreadable-hybrid-lifecycle.md` (Codex-APPROVED, 5 rounds).

## Global Constraints

- **TDD per task**: failing test → run-fail → minimal impl → run-pass → commit. Never impl before its test.
- **Commit per task**, conventional-commits: `feat(...)` / `test(...)` / `docs(...)`. One task per commit; `--no-verify` (shared hooks live in main checkout).
- **No advisory lock**: `admin_alerts` is NOT an invariant-2 table; observers are post-commit, outside any tx.
- **Supabase call-boundary (invariant 9)**: the resolve helper uses direct `postgres` (not a Supabase client) — mirrors `recoveryResolution.ts`; typed `{kind:"ok";resolved}|{kind:"infra_error"}`, never throws. Not subject to `tests/auth/_metaInfraContract.test.ts` (same class as recoveryResolution — note inline).
- **Forensic code**: the only durable emit is `log.info` `code:"ONBOARDING_ALERT_AUTO_RESOLVED"` — `info`-level ⇒ exempt from the `log.error`/`log.warn` AST guard and stripped by `stripLogEmissionCalls` ⇒ NO forensic-registry row, NO internal-code-enum diff. Do NOT add any `log.warn`/`log.error` code.
- **§12.4 lockstep** (Task 7b): master spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` in ONE commit. Never prettier the master spec.
- **No UI files** touched — no impeccable gate. All identity rendering is via the existing generic segment renderer.
- **Before push**: `pnpm test` (full), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

---

## File Structure

- `lib/sync/runOnboardingScan.ts` — MODIFY: `processed` element type + 6 push sites gain `name`.
- `app/api/admin/onboarding/scan/route.ts` — MODIFY: emit `failed_sheet_names`; add clean-scan resolve observer + info emit.
- `lib/adminAlerts/resolveOnboardingSheetUnreadable.ts` — CREATE: two silent resolve functions.
- `lib/sync/runScheduledCronSync.ts` — MODIFY: hoist `listedDriveFileIds`, add injectable observer dep, call healed-predicate in epilogue.
- `lib/adminAlerts/identityTypes.ts` — MODIFY: `display.failed_sheet_names?: string[]` + a count field.
- `lib/adminAlerts/projectIdentityContext.ts` — MODIFY: clone the role-change extraction block for `failed_sheet_names` (cap 3 + count).
- `lib/adminAlerts/resolveAlertIdentities.ts` — MODIFY: overflow "+N more" count wiring keyed for the new field.
- `lib/adminAlerts/alertIdentityMap.ts` — MODIFY: flip entry to a `contextField` segment.
- `lib/messages/catalog.ts` + master spec §12.4 — MODIFY: copy rewrite (Task 7b).
- `tests/messages/_metaAdminAlertCatalog.test.ts` — MODIFY: `"hybrid"` lifecycle class (Task 7a).
- `tests/adminAlerts/alertIdentityMatrix.test.ts` — MODIFY: fixture gains `failed_sheet_names` (Task 3).

---

## Task 1: Add `name` to onboarding scan `processed` entries

**Files:**
- Modify: `lib/sync/runOnboardingScan.ts` (type `:129-132` + `:142-145`; push sites `:737,:823,:860,:893,:919,:1100`)
- Test: `tests/sync/onboarding.test.ts` (add a case) OR a focused new test if that file has no processed-shape assertion.

**Interfaces:**
- Produces: `OnboardingScanResult.processed[]` element `{ driveFileId: string; name: string; outcome: "staged"|"hard_failed"|"skipped_non_sheet"|"live_row_conflict" }` (and the `superseded` variant's `processed[]` identically). Consumed by Task 2 + Task 5.

- [ ] **Step 1: Write the failing test.** In `tests/sync/onboarding.test.ts`, add a test that runs a scan fixture producing ≥1 hard_failed + ≥1 staged file and asserts each `result.processed[i]` has a non-empty `name` equal to the fixture file's Drive name. Derive expected names from the fixture inputs (anti-tautology — do not hardcode). If the harness can't easily reach `processed`, assert at the smallest reachable seam (e.g. the mapped array feeding `processed`).

```ts
// pseudocode shape — adapt to the file's existing harness
const result = await runOnboardingScanFixture([
  { driveFileId: "d-fail", name: "Bad Sheet", outcome: "hard_failed" },
  { driveFileId: "d-ok", name: "Good Sheet", outcome: "staged" },
]);
expect(result.processed).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ driveFileId: "d-fail", name: "Bad Sheet", outcome: "hard_failed" }),
    expect.objectContaining({ driveFileId: "d-ok", name: "Good Sheet", outcome: "staged" }),
  ]),
);
```

- [ ] **Step 2: Run test to verify it fails.** `pnpm vitest run tests/sync/onboarding.test.ts -t "name"` → FAIL (`name` undefined on processed elements / type error).

- [ ] **Step 3: Add `name` to the type + 6 push sites.** In the two `processed` element type literals (`:129-132`, `:142-145`), add `name: string;`. At each push site add `name`:
  - `:737` → `{ driveFileId: file.driveFileId, name: file.name, outcome: "skipped_non_sheet" }`
  - `:823` → `{ driveFileId: file.driveFileId, name: file.name, outcome: "hard_failed" }`
  - `:860` → `{ driveFileId: file.driveFileId, name: file.name, outcome: "staged" }`
  - `:893` → `{ driveFileId: file.driveFileId, name: file.name, outcome: "hard_failed" }`
  - `:919` → `{ driveFileId: file.driveFileId, name: file.name, outcome: "hard_failed" }`
  - `:1100` → `{ driveFileId: prepared.file.driveFileId, name: prepared.file.name, outcome: "live_row_conflict" }`

  (`file` / `prepared.file` carry `.name` — verified `:902-905`.)

- [ ] **Step 4: Run test to verify it passes.** `pnpm vitest run tests/sync/onboarding.test.ts -t "name"` → PASS. Also `pnpm typecheck` locally (the type change touches consumers).

- [ ] **Step 5: Commit.**
```bash
git add lib/sync/runOnboardingScan.ts tests/sync/onboarding.test.ts
git commit --no-verify -m "feat(onboarding): carry sheet name on scan processed entries"
```

---

## Task 2: Emit `failed_sheet_names` (index-aligned) in the hard-fail alert

**Files:**
- Modify: `app/api/admin/onboarding/scan/route.ts` (`:292-310`)
- Test: `tests/api/admin/onboardingMutations-telemetry.test.ts` or the scan-route test file (find the one exercising the `ONBOARDING_SHEET_UNREADABLE` emit; add a case)

**Interfaces:**
- Consumes: `result.processed[].name` (Task 1).
- Produces: alert context `{ folder_id, wizard_session_id, failed_drive_file_ids: string[], failed_sheet_names: string[] }` where `failed_sheet_names[i]` names `failed_drive_file_ids[i]`, both sorted by drive file id.

- [ ] **Step 1: Write the failing test.** Assert that when the scan produces hard-failed files (names given in a deliberately different order than sorted id order), the `upsertAdminAlert` call's context has `failed_sheet_names` index-aligned to `failed_drive_file_ids` (both sorted by id). Spy on `upsertAdminAlert` (mock the module). Derive expected arrays from fixture inputs.

```ts
// expected: ids sorted, names follow the same pair-sort
expect(upsertAdminAlertSpy).toHaveBeenCalledWith(
  expect.objectContaining({
    code: "ONBOARDING_SHEET_UNREADABLE",
    context: expect.objectContaining({
      failed_drive_file_ids: ["d-a", "d-b"],
      failed_sheet_names: ["Alpha", "Bravo"], // d-a→Alpha, d-b→Bravo regardless of processed order
    }),
  }),
);
```

- [ ] **Step 2: Run test to verify it fails.** Run the file with `pnpm vitest run <path> -t "failed_sheet_names"` → FAIL (`failed_sheet_names` absent).

- [ ] **Step 3: Build id→name pairs and emit both arrays.** Replace the `failedIds` construction (`:292-296`) + emit context (`:302-306`):

```ts
const failedPairs = Array.from(
  new Map(
    result.processed
      .filter((p) => p.outcome === "hard_failed")
      .map((p) => [p.driveFileId, p.name] as const),
  ), // Map dedupes by driveFileId, first name wins
).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const failedIds = failedPairs.map(([id]) => id);
const failedNames = failedPairs.map(([, name]) => name);
if (failedIds.length > 0) {
  try {
    await upsertAdminAlert({
      showId: null,
      code: "ONBOARDING_SHEET_UNREADABLE",
      context: {
        folder_id: folder.folderId,
        wizard_session_id: wizardSessionId,
        failed_drive_file_ids: failedIds,
        failed_sheet_names: failedNames,
      },
    });
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 4: Run test to verify it passes.** `pnpm vitest run <path> -t "failed_sheet_names"` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add app/api/admin/onboarding/scan/route.ts tests/api/admin/<file>.test.ts
git commit --no-verify -m "feat(onboarding): emit failed_sheet_names aligned with failed ids"
```

---

## Task 3: Render sheet names on the alert card (identity projection + segment)

**Files:**
- Modify: `lib/adminAlerts/identityTypes.ts` (`:22-33` display block)
- Modify: `lib/adminAlerts/projectIdentityContext.ts` (add block near `:87-97`; new cap const near `:30`)
- Modify: `lib/adminAlerts/resolveAlertIdentities.ts` (overflow count wiring `:92-102`)
- Modify: `lib/adminAlerts/alertIdentityMap.ts` (`ONBOARDING_SHEET_UNREADABLE` entry, currently `{ kind: "global" }`)
- Modify: `tests/adminAlerts/alertIdentityMatrix.test.ts` (fixture `:360-368`)
- Test: `tests/adminAlerts/` identity resolution test (co-locate with existing projection/resolve tests)

**Interfaces:**
- Consumes: context `failed_sheet_names: string[]`, `failed_sheet_names_count: number` (Task 2 emits names; the count derives from array length at projection time — see Step 3).
- Produces: alert card segment "Sheet: N1, N2, N3 +K more" via the generic `contextField` renderer.

- [ ] **Step 1: Write the failing test.** In a new/existing identity test: build an `ONBOARDING_SHEET_UNREADABLE` context with 5 `failed_sheet_names` (one containing a 30-char hex token substring) and assert the resolved identity segment string equals `"<n1>, <n2>, <n3> +2 more"` with the token-bearing name redacted (`[redacted-token]`). Derive the first-3 + "+2 more" from the 5-element input, not hardcoded.

- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/adminAlerts/<file> -t "failed_sheet_names"` → FAIL (map still `global`; no projection block; no overflow count).

- [ ] **Step 3: Add the display type + count.** In `identityTypes.ts` `display` block add:
```ts
failed_sheet_names?: string[];
```
and in the `counts` block (same file — mirror `role_change_count`) add:
```ts
failed_sheet_names_count?: number;
```

- [ ] **Step 4: Add the projection block.** In `projectIdentityContext.ts`, near `:30` add `const FAILED_SHEET_NAMES_CAP = 3;` and near the role-change block (`:87-97`) add (guarded by the code being `ONBOARDING_SHEET_UNREADABLE` / presence of the key):
```ts
if (Array.isArray(ctx.failed_sheet_names)) {
  const names = ctx.failed_sheet_names.filter(isPlainString);
  display.failed_sheet_names = names
    .slice(0, FAILED_SHEET_NAMES_CAP)
    .map((n) => sanitizeIdentityString(n, opts));
  counts.failed_sheet_names_count = names.length;
}
```
(Reuse the exact `isPlainString` / `sanitizeIdentityString` helpers the role-change block uses.)

- [ ] **Step 5: Wire the overflow count.** In `resolveAlertIdentities.ts` `:92-102`, the `total` is currently hardcoded to `counts.role_change_count`. Generalize it to pick the count matching the segment's field. Minimal change: map the segment `key` to its count key:
```ts
const COUNT_KEY_FOR_FIELD: Record<string, string> = {
  role_change_crew_names: "role_change_count",
  failed_sheet_names: "failed_sheet_names_count",
};
// ...
const total = counts[COUNT_KEY_FOR_FIELD[fieldKey] ?? ""] ?? names.length;
```
(Keep the existing `ROLE_CHANGE_NAMES_CAP` local behavior; `names` is already the capped slice from projection.)

- [ ] **Step 6: Flip the identity map entry.** In `alertIdentityMap.ts`:
```ts
ONBOARDING_SHEET_UNREADABLE: {
  segments: [{ kind: "contextField", key: "failed_sheet_names", label: "Sheet" }],
},
```

- [ ] **Step 7: Update the matrix fixture.** In `alertIdentityMatrix.test.ts` `:360-368`, add `failed_sheet_names: ["Sheet A", "Sheet B"]` to the fixture context (aligned with the two ids).

- [ ] **Step 8: Run to verify pass.** `pnpm vitest run tests/adminAlerts/` → PASS (new test + `alertIdentityMatrix` + `_metaAlertIdentityMap`).

- [ ] **Step 9: Commit.**
```bash
git add lib/adminAlerts/identityTypes.ts lib/adminAlerts/projectIdentityContext.ts lib/adminAlerts/resolveAlertIdentities.ts lib/adminAlerts/alertIdentityMap.ts tests/adminAlerts/
git commit --no-verify -m "feat(admin): render failed sheet names on unreadable-sheet alert card"
```

---

## Task 4: Resolve helper (silent, `recoveryResolution`-style)

**Files:**
- Create: `lib/adminAlerts/resolveOnboardingSheetUnreadable.ts`
- Test: `tests/adminAlerts/resolveOnboardingSheetUnreadable.test.ts` (pure, `fakeSql`)

**Interfaces:**
- Produces:
  - `resolveOpenUnreadableAlertUnconditionally(sql?): Promise<{kind:"ok";resolved:boolean}|{kind:"infra_error"}>` — UPDATEs the one open global row's `resolved_at`.
  - `resolveUnreadableAlertIfHealed(input: HealInput, sql?): Promise<...same union...>` where `HealInput = { activeFolderId: string; listedFiles: ReadonlyMap<string, string> }` (map = drive_file_id → Drive `modifiedTime`). **The helper reads `app_settings.pending_wizard_session_id` ITSELF** (spec §3.4b) — the wizard-owned skip is NOT a caller-supplied boolean, so no call site can bypass it by passing `false` (review R2 finding 3).
- Consumes: `RecoveryResolutionSql`-shaped tagged-template client (clone the type or import it).

- [ ] **Step 1: Write failing unit tests (fakeSql).** Mirror `tests/notify/recovery-resolution.test.ts`'s `fakeSql` (a `vi.fn` implementing the tagged-template signature, returning seeded rows per-query and capturing `calls[].text`/`.values`). Cover:
  - `resolveOpenUnconditionally`: issues an UPDATE with `code = 'ONBOARDING_SHEET_UNREADABLE' AND show_id IS NULL AND resolved_at IS NULL`; returns `{kind:"ok",resolved:true}` when a row returns, `false` when none.
  - `resolveIfHealed` **pending wizard**: fakeSql returns a non-null `pending_wizard_session_id` on the first (app_settings) query → NO further query, returns `{kind:"ok",resolved:false}` (helper self-reads; assert the app_settings select fired and no UPDATE followed).
  - folder mismatch (`context.folder_id !== activeFolderId`) → UPDATE issued (resolve).
  - all ids removed / registered / current-revision-staged → resolve; one id still failing → no resolve.
  - **CAS-race (review R2 finding 2 — deterministic, at THIS layer)**: fakeSql returns an open row with `last_seen_at = T0` for the select, then the UPDATE (guarded `last_seen_at = T0`) returns ZERO rows (simulating an intervening upsert that bumped `last_seen_at`) → `{kind:"ok",resolved:false}`. Assert the UPDATE's captured `values` include the observed `last_seen_at` and the row was NOT resolved.
  - throw in sql → `{kind:"infra_error"}` (never throws).
  - Assert the staged predicate SQL requires `wizard_session_id IS NULL AND staged_modified_time = <listing modifiedTime>` (finding R1-1) and the CAS is on `last_seen_at` (R1-2).

- [ ] **Step 2: Run → FAIL** (module missing). `pnpm vitest run tests/adminAlerts/resolveOnboardingSheetUnreadable.test.ts`.

- [ ] **Step 3: Implement the helper.** Clone `recoveryResolution.ts` structure (databaseUrl, `db = sql ?? postgres(...)`, `ownsConnection`, `finally end`). No `log` import (silent). Sketch:

```ts
import postgres from "postgres";

export type ResolveSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray, ...values: unknown[]
  ): Promise<T[]>;
  end?: (o?: { timeout?: number }) => Promise<void>;
};
export type ResolveResult = { kind: "ok"; resolved: boolean } | { kind: "infra_error" };
export type HealInput = {
  activeFolderId: string;
  listedFiles: ReadonlyMap<string, string>; // drive_file_id → Drive modifiedTime
};

function databaseUrl(): string { /* copy from recoveryResolution.ts:27 */ }

export async function resolveOpenUnreadableAlertUnconditionally(sql?: ResolveSql): Promise<ResolveResult> {
  const db = sql ?? (postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as ResolveSql);
  const owns = !sql;
  try {
    const rows = await db<{ id: string }>`
      update public.admin_alerts set resolved_at = now()
       where code = 'ONBOARDING_SHEET_UNREADABLE' and show_id is null and resolved_at is null
      returning id`;
    return { kind: "ok", resolved: rows.length > 0 };
  } catch { return { kind: "infra_error" }; }
  finally { if (owns) await db.end?.({ timeout: 5 }); }
}

export async function resolveUnreadableAlertIfHealed(input: HealInput, sql?: ResolveSql): Promise<ResolveResult> {
  const db = sql ?? (postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as ResolveSql);
  const owns = !sql;
  try {
    // Wizard-owned skip — helper self-reads (spec §3.4b); no caller can bypass it.
    const settings = await db<{ pending_wizard_session_id: string | null }>`
      select pending_wizard_session_id from public.app_settings limit 1`;
    if ((settings[0]?.pending_wizard_session_id ?? null) !== null) {
      return { kind: "ok", resolved: false };
    }
    const open = await db<{ id: string; context: Record<string, unknown>; last_seen_at: string }>`
      select id, context, last_seen_at from public.admin_alerts
       where code = 'ONBOARDING_SHEET_UNREADABLE' and show_id is null and resolved_at is null
       limit 1`;
    if (open.length === 0) return { kind: "ok", resolved: false };
    const row = open[0]!;
    const ctx = row.context ?? {};
    const ids = Array.isArray(ctx.failed_drive_file_ids) ? (ctx.failed_drive_file_ids as string[]) : null;
    // folder mismatch or malformed folder_id → stale → resolve
    const folderMismatch = typeof ctx.folder_id !== "string" || ctx.folder_id !== input.activeFolderId;
    let shouldResolve = folderMismatch;
    if (!shouldResolve) {
      if (!ids || ids.length === 0) return { kind: "ok", resolved: false }; // empty ids → keep open
      const healed = await Promise.all(ids.map((id) => isIdHealed(db, id, input.listedFiles)));
      shouldResolve = healed.every(Boolean);
    }
    if (!shouldResolve) return { kind: "ok", resolved: false };
    const updated = await db<{ id: string }>`
      update public.admin_alerts set resolved_at = now()
       where id = ${row.id}::uuid and resolved_at is null and last_seen_at = ${row.last_seen_at}::timestamptz
      returning id`;
    return { kind: "ok", resolved: updated.length > 0 };
  } catch { return { kind: "infra_error" }; }
  finally { if (owns) await db.end?.({ timeout: 5 }); }
}

async function isIdHealed(db: ResolveSql, id: string, listed: ReadonlyMap<string, string>): Promise<boolean> {
  const listedModifiedTime = listed.get(id);
  if (listedModifiedTime === undefined) return true; // removed from folder → can't fail
  const registered = await db<{ one: number }>`select 1 as one from public.shows where drive_file_id = ${id} limit 1`;
  if (registered.length > 0) return true; // per-show cron path owns a registered file's freshness
  const staged = await db<{ one: number }>`
    select 1 as one from public.pending_syncs
     where drive_file_id = ${id} and wizard_session_id is null
       and staged_modified_time = ${listedModifiedTime}::timestamptz
     limit 1`;
  return staged.length > 0; // current-revision staged (revision-match, review R1-1)
}
```

- [ ] **Step 4: Run → PASS.** `pnpm vitest run tests/adminAlerts/resolveOnboardingSheetUnreadable.test.ts`.

- [ ] **Step 5: Commit.**
```bash
git add lib/adminAlerts/resolveOnboardingSheetUnreadable.ts tests/adminAlerts/resolveOnboardingSheetUnreadable.test.ts
git commit --no-verify -m "feat(admin): silent resolve helper for unreadable-sheet alert (clean + healed)"
```

---

## Task 5: Clean-scan observer + info emit (scan route)

**Files:**
- Modify: `app/api/admin/onboarding/scan/route.ts` (after `:311`, inside the `completed` block)
- Test: scan-route test file (extend Task 2's file)

**Interfaces:**
- Consumes: `resolveOpenUnreadableAlertUnconditionally` (Task 4).

- [ ] **Step 1: Write failing test.** Seed/mimic an open `ONBOARDING_SHEET_UNREADABLE` row; run a scan whose `processed` has ZERO hard_failed; assert `resolveOpenUnreadableAlertUnconditionally` is invoked (spy) and (in a DB-backed variant, or via the spy's fakeSql) the row's `resolved_at` is set. Also assert a `log.info` with `code:"ONBOARDING_ALERT_AUTO_RESOLVED"` fires on a successful resolve.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Wire the else-branch.** After the `if (failedIds.length > 0) { ... }` block, add its sibling (own best-effort try/catch, post-commit, before the terminal result emit):
```ts
} // end if failedIds.length > 0
else {
  try {
    const r = await resolveOpenUnreadableAlertUnconditionally();
    if (r.kind === "ok" && r.resolved) {
      await log.info("onboarding unreadable-sheet alert auto-resolved (clean scan)", {
        source: "admin.onboarding.scan",
        code: "ONBOARDING_ALERT_AUTO_RESOLVED",
      });
    }
  } catch {
    /* best-effort */
  }
}
```
(Import `resolveOpenUnreadableAlertUnconditionally` and `log`.)

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit.**
```bash
git add app/api/admin/onboarding/scan/route.ts tests/api/admin/<file>.test.ts
git commit --no-verify -m "feat(onboarding): auto-resolve unreadable-sheet alert on clean scan"
```

---

## Task 6: Cron epilogue observer

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (deps `:566`; hoist `listedDriveFileIds` `:3733`; epilogue before `:3882`)
- Test: `tests/sync/runScheduledCronSync.test.ts` (pure-DI) + `tests/sync/onboarding-alert-heal.db.test.ts` (CREATE, DB-backed matrix)

**Interfaces:**
- Consumes: `resolveUnreadableAlertIfHealed(input, sql?)` (Task 4) — the helper self-reads `app_settings.pending_wizard_session_id`, so the cron caller passes ONLY `{ activeFolderId, listedFiles }` (no `wizardSessionPending`, no `getPendingWizardSessionId` dep — review R2 finding 3).

- [ ] **Step 1: Write failing tests.**
  - Pure-DI (`runScheduledCronSync.test.ts`): inject a `resolveUnreadableAlertIfHealed` spy; assert it's called once per tick in the epilogue with `{ activeFolderId, listedFiles }` (id→modifiedTime map) derived from the injected `listFolder`; assert it is NOT called on the folder-resolve early-return paths (`no_folder_configured` / infra fault). The wizard-pending skip is NOT asserted here (it lives inside the real helper, exercised in the DB test).
  - DB-backed (`onboarding-alert-heal.db.test.ts`, mirror `def1-cron-resync-clear.db.test.ts`: module-top probe, `it.skipIf(!dbUp)`, `inRollback`): drive the REAL helper via the cron path (or call it directly with the ambient `sql`) and seed rows to exercise the matrix — all-removed / all-registered / all-current-revision-staged → `resolved_at` set; one-still-failing → NULL; **stale-staged** (live pending row with OLDER `staged_modified_time` than listing) → NULL (R1-1); folder-mismatch → set; **wizard-pending** (seed `app_settings.pending_wizard_session_id` non-null) → NULL even when all ids satisfied; empty ids → NULL. Assert on `resolved_at` in the row, never on "helper called". (The deterministic CAS-race is covered at the helper's fakeSql layer in Task 4; add ONE optional DB smoke here only if convenient.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Hoist `listedDriveFileIds` + build the id→modifiedTime map.** At `:3733`, change the block-local `const listedDriveFileIds = new Set(...)` to also expose a hoisted `listedFiles` map visible at the epilogue. Declare `let listedFiles: ReadonlyMap<string,string> = new Map()` before the `try`, and assign inside: `listedFiles = new Map(files.map((f) => [f.driveFileId, f.modifiedTime]))`. Keep `listedDriveFileIds` where still used.

- [ ] **Step 4: Add the observer dep.** In `RunScheduledCronSyncDeps` (`:566`) add only:
```ts
resolveUnreadableAlertIfHealed?: typeof import("@/lib/adminAlerts/resolveOnboardingSheetUnreadable").resolveUnreadableAlertIfHealed;
```
(No pending-wizard dep — the helper owns that read.)

- [ ] **Step 5: Call in the epilogue (fail-open).** Immediately before `return await finishCompletedRun({ processed })` (`:3882`), inside a try/catch that swallows all faults (never fail the tick):
```ts
try {
  const r = await (deps.resolveUnreadableAlertIfHealed ?? resolveUnreadableAlertIfHealed)({
    activeFolderId: resolvedFolderId,
    listedFiles,
  });
  if (r.kind === "ok" && r.resolved) {
    await log.info("onboarding unreadable-sheet alert auto-resolved (cron heal)", {
      source: "cron/sync",
      code: "ONBOARDING_ALERT_AUTO_RESOLVED",
    });
  }
} catch {
  /* fail-open: never fail the tick */
}
```
The helper self-reads the ambient DB via its default `postgres` client; in pure-DI tests the injected spy replaces it entirely (no ambient DB hit). No extra `listFolder`-injection guard needed since the real helper only runs on the un-injected path.

- [ ] **Step 6: Run → PASS.** `pnpm vitest run tests/sync/runScheduledCronSync.test.ts tests/sync/onboarding-alert-heal.db.test.ts`.

- [ ] **Step 7: Commit.**
```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/runScheduledCronSync.test.ts tests/sync/onboarding-alert-heal.db.test.ts
git commit --no-verify -m "feat(sync): cron epilogue auto-resolves healed unreadable-sheet alert"
```

---

## Task 7a: Hybrid lifecycle class (meta-test contract)

**Files:**
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts` (`Lifecycle` union `:280-284`; entry `:456`; auto-existence iteration `:676-706`; comment `:271-277`)

- [ ] **Step 1: Write/adjust the failing assertion.** Add a `"hybrid"` count assertion (expect exactly 1 hybrid code) and extend the resolveSites existence check to iterate `class==="auto" || class==="hybrid"` (so hybrid's two `resolveSites` are grep-verified). Run → FAIL (union has no hybrid; entry still event-manual).

- [ ] **Step 2: Extend the union + entry.** In `Lifecycle`:
```ts
| { class: "hybrid"; resolveSites: [ResolveSite, ...ResolveSite[]] }
```
Change the `ONBOARDING_SHEET_UNREADABLE` entry to:
```ts
ONBOARDING_SHEET_UNREADABLE: {
  class: "hybrid",
  resolveSites: [
    { file: "app/api/admin/onboarding/scan/route.ts", pattern: /resolveOpenUnreadableAlertUnconditionally/ },
    { file: "lib/sync/runScheduledCronSync.ts", pattern: /resolveUnreadableAlertIfHealed/ },
  ],
},
```
Update the counts comment (`:271-277`): 26 auto / 17 event-manual / 1 hybrid / 1 state-manual-justified = 45. Keep the auto count assertion at 26 (hybrid is not auto); the resolveSites iteration now also covers hybrid.

- [ ] **Step 3: Run → PASS.** `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts`.

- [ ] **Step 4: Commit.**
```bash
git add tests/messages/_metaAdminAlertCatalog.test.ts
git commit --no-verify -m "test(messages): add hybrid lifecycle class for unreadable-sheet alert"
```

---

## Task 7b: Copy rewrite + §12.4 lockstep + copy-ban EXEMPT

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 row `:2959` + appendix `:3189`)
- Modify: `lib/messages/catalog.ts` (`:2008-2021`)
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts` (copy-ban EXEMPT `:729`)
- Generated: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`

- [ ] **Step 1: Write the failing test.** The x1 gate `tests/cross-cutting/codes.test.ts:68-90` (catalog↔§12.4 deep-match) will fail once catalog copy changes without the §12.4 prose; and the copy-ban test (`_metaAdminAlertCatalog.test.ts:727`) will fail once copy says "clears automatically" without the EXEMPT entry. Write the new copy into the master spec §12.4 FIRST (so the parity target is the new copy), run x1 → FAIL (catalog still old), confirming lockstep is exercised.

- [ ] **Step 2: Edit master spec §12.4** — the table row (`:2959`) `dougFacing`/`followUp` and the helpfulContext appendix entry (`:3189`) to the exact strings from spec §3.5. Do NOT prettier the master spec.

- [ ] **Step 3: Regen spec-codes.** `pnpm gen:spec-codes` → updates `lib/messages/__generated__/spec-codes.ts`.

- [ ] **Step 4: Edit catalog.ts** (`:2008-2021`) `dougFacing`, `followUp`, `helpfulContext` to the identical new strings; `resolution` stays `"manual"`.

- [ ] **Step 5: Add copy-ban EXEMPT.** In `_metaAdminAlertCatalog.test.ts:729`, add `"ONBOARDING_SHEET_UNREADABLE"` to the `EXEMPT` set with a comment: hybrid class — copy truthfully promises self-clear while the manual button legitimately stays.

- [ ] **Step 6: Run → PASS.** `pnpm vitest run tests/cross-cutting/codes.test.ts tests/messages/_metaAdminAlertCatalog.test.ts`.

- [ ] **Step 7: Commit (all lockstep files together).**
```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts tests/messages/_metaAdminAlertCatalog.test.ts
git commit --no-verify -m "docs(messages): rewrite unreadable-sheet copy for hybrid self-clear (§12.4 lockstep)"
```

---

## Task 8: Full verification sweep + regens

**Files:** none new (verification + defensive regen)

- [ ] **Step 1: Defensive enum regen.** `pnpm gen:internal-code-enums` → expect NO diff (info-level forensic code stripped; existing code unchanged). If a diff appears, investigate before committing.

- [ ] **Step 2: Full suite.** `pnpm test` → all green (DB tests skip if no local DB; ensure local DB up so `.db.test.ts` actually run — preflight showed local DB ✓).

- [ ] **Step 3: Typecheck / lint / format.** `pnpm typecheck && pnpm lint && pnpm format:check` → all green.

- [ ] **Step 4: Grep sweep** for stray `failedKeys` misuse and confirm no `log.warn`/`log.error` forensic code was added:
```bash
rg -n "ONBOARDING_ALERT_AUTO_RESOLVED" lib app | rg -v "log.info" # expect empty
```

- [ ] **Step 5: Commit any regen diffs** (only if Step 1 produced one).

---

## Self-Review notes (author)

- **Spec coverage**: §3.1→T1/T2, §3.2→T3, §3.3→T7a, §3.4→T4/T5/T6, §3.5→T7b, §5/§6 meta+tests folded into T3/T6/T7. ✅
- **Anti-tautology**: T1/T2/T3 derive expected values from fixture inputs; T6 asserts DB `resolved_at`, not "helper called"; stale-staged + CAS-race negatives pinned (R1). ✅
- **Meta-test inventory**: EXTENDS `_metaAdminAlertCatalog` (hybrid class), `alertIdentityMatrix` (fixture); forensic registries deliberately UNTOUCHED (info-level). No advisory-lock topology (no `pg_advisory*`). ✅
- **Type consistency**: helper fn names `resolveOpenUnreadableAlertUnconditionally` / `resolveUnreadableAlertIfHealed` used identically in T4 (def), T5/T6 (call), T7a (resolveSites patterns). `HealInput = { activeFolderId, listedFiles: ReadonlyMap<string,string> }` consistent across T4 def + T6 caller; wizard-pending read lives INSIDE the helper (no caller boolean), closing the bypass vector (review R2 finding 3). CAS-race pinned deterministically at T4 fakeSql layer (review R2 finding 2). ✅
