# Navigation Performance — Phase 1 (data-fetch parallelization + admin auth gate) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut per-navigation server latency by fanning out independent server reads with `Promise.all` and removing/deduping the admin auth gate's network hops — without changing the always-fresh (`force-dynamic`) data model.

**Architecture:** (A) Replace serial `await` chains in `getShowForViewer`, the admin dashboard, the settings page, and the per-show page (plus the N+1 `readfinalizeowned_b2` loop and `readShowChangeFeed`'s 3 reads) with `Promise.all` waves, preserving the per-read `{data,error}` discrimination (invariant 9). (B) In `lib/auth/requireAdmin.ts`, swap `supabase.auth.getUser()` (Auth-server round-trip) for `getClaims()` (local ES256 verify), keep the DB-backed `is_admin()` RPC, and wrap the resolution in a no-arg `React.cache()` core so the layout + page gates share one resolution per request.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19 (`cache()`), `@supabase/supabase-js`/`auth-js` 2.105.1 (`getClaims`), vitest 4 (node + jsdom), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-22-nav-perf-phase1-data-auth.md` (Codex-approved, 4 rounds).

## Global Constraints

- **Invariant 9 (Supabase call-boundary):** every parallelized read keeps `{ data, error }` destructure + infra-error discrimination. `Promise.all` the **query promises** (they resolve, not reject); **never `Promise.allSettled`**. Client construction stays in `try/catch`. New Supabase call sites get a registry row in the relevant `_metaInfraContract` test.
- **Invariant 8 (impeccable UI gate) — APPLIES (path-based):** diff touches `app/` (non-api) + `components/admin/Dashboard.tsx`; `/impeccable critique` + `/impeccable audit` (external attestation) run at close-out before the whole-diff cross-model review. Expected clean (no rendered-output change).
- **Invariant 3 (email canonicalization):** `canonicalize()` is the only normalization surface; no inline `.toLowerCase()/.trim()`.
- **Auth freshness (spec §B-SEC):** `getClaims` is freshness-bounded by token TTL for the deleted-user/revoked-session case ONLY; `is_admin()` keeps authorization live. Accepted + bounded — do not re-add a session-freshness RPC (BACKLOG).
- **No migrations** in Phase 1. **TDD per task; one task per commit;** conventional commits (`perf(...)`, `refactor(...)`, `test(...)`), `--no-verify` (shared hooks), trailers: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_012UbLmBoAmaFbndpRpLNwdp`.
- **Test runner:** `pnpm exec vitest run <file>` (globals off — `import { describe, test, expect, vi, beforeEach } from "vitest"`); `fileParallelism:false`; node env by default, add `// @vitest-environment jsdom` only for React-render tests. `forbidden()`/`redirect()` are mocked to throw strings (`"forbidden()"`, `"redirect(/auth/sign-in?next=...)"`); `AdminInfraError` asserted via `rejects.toBeInstanceOf`.

## File Structure

- `lib/appSettings/readAppSettingsRow.ts` — **new.** `(client?) → Promise<{kind:'value'; settings: AppSettingsRow} | {kind:'infra_error'}>`. Single full-row `app_settings` select. Used by A2.
- `lib/appSettings/getSettingsPageFlags.ts` — **new.** `(client?) → Promise<{kind:'value'; autoPublishCleanFirstSeen:boolean; alertOnSyncProblems:boolean; dailyReviewDigest:boolean; alertOnAutoPublish:boolean} | {kind:'infra_error'}>`. Single 4-column select. Used by A3.
- `lib/auth/requireAdmin.ts` — **modify.** getClaims + no-arg `cache()` core (B).
- `lib/data/getShowForViewer.ts` — **modify.** Parallel wave (A1).
- `lib/sync/feed/readShowChangeFeed.ts` — **modify.** Parallel 3 reads (A4).
- `components/admin/Dashboard.tsx` — **modify.** fetchDashboardData parallelize + nowDate once + A5 Promise.all (A2/A5).
- `app/admin/page.tsx` — **modify.** Gate `purgeAndRotateIfStale` via `readAppSettingsRow` (A2).
- `app/admin/settings/page.tsx` — **modify.** Use `getSettingsPageFlags` + Promise.all 3 loaders (A3).
- `app/admin/show/[slug]/page.tsx` — **modify.** Promise.all feed+crew+token; nowDate once (A4).
- `tests/admin/_metaInfraContract.test.ts` — **modify.** Register the two new helpers.
- New test files per task (below).

---

### Task 1: `readAppSettingsRow` helper (A2 dependency)

**Files:**
- Create: `lib/appSettings/readAppSettingsRow.ts`
- Test: `tests/appSettings/readAppSettingsRow.test.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts` (registry row)

**Interfaces:**
- Produces: `readAppSettingsRow(client?: SupabaseLike): Promise<{ kind: "value"; settings: AppSettingsRow } | { kind: "infra_error" }>`. `AppSettingsRow` imported from `@/lib/onboarding/sessionLifecycle`.

- [ ] **Step 1: Failing test** (`tests/appSettings/readAppSettingsRow.test.ts`)

```typescript
import { describe, test, expect, vi } from "vitest";
import { readAppSettingsRow } from "@/lib/appSettings/readAppSettingsRow";

function mockClient(result: { data: unknown; error: { message: string } | null }, opts?: { throwFrom?: boolean }) {
  const builder = { select() { return builder; }, eq() { return builder; }, async maybeSingle() { return result; } };
  return { from: () => { if (opts?.throwFrom) throw new Error("boom"); return builder; } } as never;
}

describe("readAppSettingsRow", () => {
  test("returns {kind:value, settings} on a row", async () => {
    const row = { id: "default", pending_wizard_session_at: null } as never;
    const r = await readAppSettingsRow(mockClient({ data: row, error: null }));
    expect(r).toEqual({ kind: "value", settings: row });
  });
  test("returned Supabase error → infra_error", async () => {
    const r = await readAppSettingsRow(mockClient({ data: null, error: { message: "timeout" } }));
    expect(r).toEqual({ kind: "infra_error" });
  });
  test("missing default row (data null, no error) → infra_error", async () => {
    const r = await readAppSettingsRow(mockClient({ data: null, error: null }));
    expect(r).toEqual({ kind: "infra_error" });
  });
  test("thrown from .from() → infra_error (not a crash)", async () => {
    const r = await readAppSettingsRow(mockClient({ data: null, error: null }, { throwFrom: true }));
    expect(r).toEqual({ kind: "infra_error" });
  });
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm exec vitest run tests/appSettings/readAppSettingsRow.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** (`lib/appSettings/readAppSettingsRow.ts`)

```typescript
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";

type Result = { kind: "value"; settings: AppSettingsRow } | { kind: "infra_error" };

// Single full-row read of the app_settings singleton so a caller can decide
// whether to invoke the heavier purgeAndRotateIfStale postgres.js tx.
export async function readAppSettingsRow(
  client?: ReturnType<typeof createSupabaseServiceRoleClient>,
): Promise<Result> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return { kind: "infra_error" };
    return { kind: "value", settings: data as AppSettingsRow };
  } catch {
    return { kind: "infra_error" };
  }
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Register in `tests/admin/_metaInfraContract.test.ts`** — add a registry row mirroring existing service-role getter rows:

```typescript
{ helper: "readAppSettingsRow", path: "lib/appSettings/readAppSettingsRow.ts", contract: "client construction + .from() throw OR returned error OR missing row → { kind: 'infra_error' }" },
```

Run the meta-test: `pnpm exec vitest run tests/admin/_metaInfraContract.test.ts` → PASS (grep-shape: `{ data, error }` destructure present; construction in try).
- [ ] **Step 6: Commit** — `perf(admin): add readAppSettingsRow single-row helper (A2 gate dependency)`

---

### Task 2: `getSettingsPageFlags` helper (A3 dependency)

**Files:**
- Create: `lib/appSettings/getSettingsPageFlags.ts`
- Test: `tests/appSettings/getSettingsPageFlags.test.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts` (registry row)

**Interfaces:**
- Produces: `getSettingsPageFlags(client?): Promise<{ kind:"value"; autoPublishCleanFirstSeen:boolean; alertOnSyncProblems:boolean; dailyReviewDigest:boolean; alertOnAutoPublish:boolean } | { kind:"infra_error" }>`.

- [ ] **Step 1: Failing test** — mirror Task 1's `mockClient`, asserting the 4 columns map correctly (a missing/null column coerces to `false`, matching the existing single getters' fail-closed default), returned-error → `infra_error`, thrown → `infra_error`.

```typescript
test("maps 4 columns → flags", async () => {
  const row = { auto_publish_clean_first_seen: true, alert_on_sync_problems: false, daily_review_digest: true, alert_on_auto_publish: null };
  const r = await getSettingsPageFlags(mockClient({ data: row, error: null }));
  expect(r).toEqual({ kind: "value", autoPublishCleanFirstSeen: true, alertOnSyncProblems: false, dailyReviewDigest: true, alertOnAutoPublish: false });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — single `.select("auto_publish_clean_first_seen, alert_on_sync_problems, daily_review_digest, alert_on_auto_publish").eq("id","default").maybeSingle()`; `Boolean(col ?? false)` per flag; `error || !data → infra_error`; `try/catch → infra_error`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Register row in `tests/admin/_metaInfraContract.test.ts`**; run meta-test → PASS.
- [ ] **Step 6: Commit** — `perf(admin): add getSettingsPageFlags single-read helper (A3)`

---

### Task 3: Admin auth gate — getClaims + is_admin + React.cache (B)

**Files:**
- Modify: `lib/auth/requireAdmin.ts`
- Test: `tests/auth/requireAdmin.getClaims.test.ts` (new; keeps the existing `tests/auth/requireAdmin.test.ts` patterns) + verify `tests/auth/_metaInfraContract.test.ts` still passes.

**Interfaces:**
- Consumes: `getClaims()` from the cookie-bound client; `isAuthSessionMissingError` from `@/lib/auth/supabaseAuthError`; `canonicalize` from `@/lib/email/canonicalize`; `cache` from `react`.
- Produces: unchanged public signatures `requireAdminIdentity(opts?): Promise<AdminIdentity>`, `requireAdmin(opts?): Promise<void>`.

- [ ] **Step 1: Failing tests** (`tests/auth/requireAdmin.getClaims.test.ts`) — mirror `tests/auth/requireAdmin.test.ts`'s `vi.hoisted`/`vi.mock("@/lib/supabase/server")` + `vi.mock("next/navigation")` (forbidden/redirect throw strings). Stub `client.auth.getClaims` + `client.rpc`:

```typescript
const server = vi.hoisted(() => ({
  client: { auth: { getClaims: vi.fn() }, rpc: vi.fn() },
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: server.createSupabaseServerClient }));
// (reuse the existing test's next/navigation + headers mocks)

beforeEach(() => {
  server.createSupabaseServerClient.mockResolvedValue(server.client);
  server.client.auth.getClaims.mockResolvedValue({ data: { claims: { email: "Admin@FXAV.Test " } }, error: null });
  server.client.rpc.mockResolvedValue({ data: true, error: null });
});

test("getClaims is used, getUser is not on the gate path", async () => {
  await requireAdminIdentity();
  expect(server.client.auth.getClaims).toHaveBeenCalledTimes(1);
  expect((server.client.auth as Record<string, unknown>).getUser).toBeUndefined();
});
test("valid admin claims + is_admin=true → returns canonical email", async () => {
  await expect(requireAdminIdentity()).resolves.toEqual({ email: "admin@fxav.test" });
});
test("getClaims AuthSessionMissingError → redirectToSignIn, NOT AdminInfraError", async () => {
  server.client.auth.getClaims.mockResolvedValue({ data: null, error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 } });
  await expect(requireAdminIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
});
test("getClaims non-session returned error → AdminInfraError", async () => {
  server.client.auth.getClaims.mockResolvedValue({ data: null, error: { name: "AuthApiError", message: "jwks fetch failed" } });
  await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
});
test("getClaims throws → AdminInfraError", async () => {
  server.client.auth.getClaims.mockRejectedValue(new Error("network"));
  await expect(requireAdminIdentity()).rejects.toBeInstanceOf(AdminInfraError);
});
test("no claims / null data, no error → redirectToSignIn", async () => {
  server.client.auth.getClaims.mockResolvedValue({ data: null, error: null });
  await expect(requireAdminIdentity()).rejects.toThrow(/^redirect\(\/auth\/sign-in\?next=/);
});
test("live-authorization: valid claims but is_admin=false → forbidden()", async () => {
  server.client.rpc.mockResolvedValue({ data: false, error: null });
  await expect(requireAdminIdentity()).rejects.toThrow("forbidden()");
});
test("React.cache dedup: layout + page gate in one request → 1 getClaims + 1 is_admin", async () => {
  await requireAdminIdentity({ layer: "layout" });
  await requireAdminIdentity({ layer: "page" });
  expect(server.client.auth.getClaims).toHaveBeenCalledTimes(1);
  expect(server.client.rpc).toHaveBeenCalledTimes(1);
});
```

> **Dedup-test note:** React `cache()` scopes to a request. In a unit test there is no RSC request scope, so two calls would normally NOT dedup. To make the dedup assertion meaningful and deterministic, the implementation's cached core must be reachable through `React.cache`, AND the test must run the two calls inside a shared cache scope. Use the documented test seam: import `cache` is a no-op-per-call outside a request — therefore assert dedup via an **`unstable_expectedLoad`-free** approach: wrap the two calls with React's `cache` test scope if available, OR (fallback, deterministic) assert dedup at the integration layer by rendering a tiny RSC tree (`// @vitest-environment` not needed; use `react`'s server entry). **Implementer decision point:** if a reliable request scope can't be established in a unit test, mark this single assertion with an integration test under `tests/app/admin/` that renders the admin layout+page and counts the spy calls; do NOT weaken the other assertions. The dedup behavior is also covered structurally by the no-arg-core design (Step 3) which a reviewer can verify by inspection.

- [ ] **Step 2: Run, verify fail** (getClaims not yet used).
- [ ] **Step 3: Implement** (`lib/auth/requireAdmin.ts`) — extract the resolution into a no-arg cached core; map getClaims outcomes:

```typescript
import { cache } from "react";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
// ... existing imports (canonicalize, redirectToSignIn, forbidden, AdminInfraError, createSupabaseServerClient)

const resolveAdminIdentity = cache(async (): Promise<AdminIdentity> => {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    throw new AdminInfraError(`requireAdmin: createSupabaseServerClient threw: ${String(err)}`);
  }

  let claimsData: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"];
  let claimsError: Awaited<ReturnType<typeof supabase.auth.getClaims>>["error"];
  try {
    const r = await supabase.auth.getClaims();
    claimsData = r.data;
    claimsError = r.error;
  } catch (err) {
    throw new AdminInfraError(`requireAdmin: getClaims threw: ${String(err)}`);
  }
  if (claimsError) {
    if (isAuthSessionMissingError(claimsError)) await redirectToSignIn(); // unauthenticated
    throw new AdminInfraError(`requireAdmin: getClaims error: ${String((claimsError as { message?: string }).message)}`);
  }
  const email = canonicalize((claimsData as { claims?: { email?: string } } | null)?.claims?.email);
  if (!email) await redirectToSignIn();

  let isAdmin: unknown;
  try {
    const r = await supabase.rpc("is_admin");
    if (r.error) throw new AdminInfraError(`requireAdmin: is_admin error: ${String(r.error.message)}`);
    isAdmin = r.data;
  } catch (err) {
    if (err instanceof AdminInfraError) throw err;
    throw new AdminInfraError(`requireAdmin: is_admin threw: ${String(err)}`);
  }
  if (isAdmin !== true) forbidden();
  return { email };
});

export async function requireAdminIdentity(opts?: RequireAdminOpts): Promise<AdminIdentity> {
  const layer = opts?.layer ?? "page";
  // layer-specific test-infra hook stays OUTSIDE the cache (must fire per-layer)
  let forceHeaders: Headers | undefined;
  try { forceHeaders = await headers(); } catch { /* no-op */ }
  maybeForceTestInfraFail(forceHeaders, layer);
  return resolveAdminIdentity();
}
// requireAdmin() unchanged: own hooks + `await requireAdminIdentity()` (no opts forwarding — preserved latent behavior).
```

> Preserve EXACT redirect/forbidden semantics: `redirectToSignIn()` and `forbidden()` throw (they are `Promise<never>` / never) — keep `await` on `redirectToSignIn()` and bare `forbidden()` exactly as today. Keep `{ data, error }` destructure on getClaims and the client construction in `try` so the auth meta-test grep-shape keeps matching.

- [ ] **Step 4: Run new tests + existing `tests/auth/requireAdmin.test.ts` + `tests/auth/_metaInfraContract.test.ts`** → all PASS. (The old getUser test file may need its mock updated to `getClaims`; update it in this commit, keeping its assertions.)
- [ ] **Step 5: Commit** — `perf(auth): getClaims local verify + React.cache dedup on admin gate (keep is_admin RPC)`

---

### Task 4: Parallelize `getShowForViewer` reads (A1)

**Files:**
- Modify: `lib/data/getShowForViewer.ts`
- Test: `tests/data/getShowForViewer.parallel.test.ts` (new unit test with a mocked client; the existing integration test `tests/data/getShowForViewer.test.ts` must still pass).

**Interfaces:** signature unchanged: `getShowForViewer(showId, viewer): Promise<ShowForViewer>`.

- [ ] **Step 1: Failing concurrency + correctness test.** Mock the supabase client with a per-table dispatcher whose tile reads return **deferred** promises (resolve on manual trigger). Assert: after `getShowForViewer` is invoked (not awaited), all independent-wave `.from(table)` calls (hotel/rooms/transportation/contacts/run_of_show + version RPC) are recorded **before** any of them resolves (proves concurrency); a serial implementation records them one-after-resolve. Also: injecting `{data:null,error}` into ONE tile read sets only that `tileErrors[id]` and leaves siblings populated (preserves discrimination); `!isLead` viewer issues **zero** financials reads.

```typescript
// Sketch: a deferred dispatcher
function deferredClient(seed) {
  const started: string[] = []; const gates: Record<string, () => void> = {};
  const read = (table: string) => { started.push(table); return new Promise(res => { gates[table] = () => res(seed[table]); }); };
  // from(table) returns a thenable whose await calls read(table); rpc(name) similar.
  return { client, started, releaseAll: () => Object.values(gates).forEach(g => g()) };
}
// assert: after kicking off getShowForViewer, `started` contains all wave-2 tables BEFORE releaseAll().
```

- [ ] **Step 2: Run, verify fail** (serial impl initiates reads one at a time).
- [ ] **Step 3: Implement** — keep crew-identity lookup (L262) + show validation (L283) sequential (fail-closed guards + role/showId). After `isLead` derived, build the wave:

```typescript
const [hotelRes, roomRes, transRes, contactsRes, rosRes, versionRpc, finRes] = await Promise.all([
  readHotel(), readRooms(), readTransportation(), readContacts(), readRunOfShow(), readVersionToken(),
  isLead ? readFinancials() : Promise.resolve(null),
]);
```

Each `readX()` keeps its existing `try/catch + tileErrors[id]` (soft) or throw (hard, version RPC). Post-fetch in-memory filtering (hotel by viewerName, run_of_show by date) unchanged. The crew roster read (L346) joins the wave too. **Do not** await-then-discard financials when `!isLead` — pass `Promise.resolve(null)` so zero reads issue.

- [ ] **Step 4: Run new unit test + existing integration test** (`pnpm exec vitest run tests/data/getShowForViewer.parallel.test.ts tests/data/getShowForViewer.test.ts`) → PASS. (Integration test requires local Supabase running — boot it if needed.)
- [ ] **Step 5: Commit** — `perf(crew): parallelize getShowForViewer independent reads (preserve tileErrors + LEAD gate)`

---

### Task 5: Parallelize `readShowChangeFeed` 3 reads (A4 part 1)

**Files:**
- Modify: `lib/sync/feed/readShowChangeFeed.ts`
- Test: existing `tests/sync/feed/readShowChangeFeed.test.ts` + `tests/sync/feed/readShowChangeFeed.infra.test.ts` must still pass; add a concurrency assertion to the unit test.

- [ ] **Step 1: Failing concurrency test** — extend the existing test with a deferred mock asserting the 3 reads (`show_change_log` rows, count, `sync_holds`) are initiated before any resolves.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `Promise.all([runFeedRead(log), runFeedRead(count), runFeedRead(holds)])`; preserve each `runFeedRead`'s typed `SyncInfraError` mapping (a returned `{error}` or thrown still maps to `SyncInfraError` with its `source`).
- [ ] **Step 4: Run** `tests/sync/feed/readShowChangeFeed.test.ts` + `.infra.test.ts` → PASS (infra test injects error on a call index; with Promise.all all 3 fire and the error still maps to SyncInfraError).
- [ ] **Step 5: Commit** — `perf(sync): parallelize readShowChangeFeed's 3 reads (preserve SyncInfraError)`

---

### Task 6: Per-show admin page parallelization (A4 part 2)

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx`
- Test: existing `tests/app/admin/perShowPage.test.tsx` must still pass; add an assertion that feed+crew+token are issued concurrently if the test harness supports it, else rely on the existing behavioral coverage + the readShowChangeFeed unit test.

- [ ] **Step 1: Failing/guard test** — assert the per-show page still renders identical data and still degrades to the calm notice on `SyncInfraError` (existing test at `perShowPage.test.tsx`). Add: feed + crew + token reads all occur (spy) and an injected feed `SyncInfraError` still yields the degraded notice (not a crash) — preserving today's behavior.
- [ ] **Step 2: Run** existing suite → confirm current green baseline.
- [ ] **Step 3: Implement** — after `show.id` is known, `const [feed, crewRes, token] = await Promise.all([readShowChangeFeed(show.id), supabase.from("crew_members")…, loadShowShareToken(show.id)])`; resolve `nowDate()` once. Preserve each result's existing error handling (feed → degraded notice; crew `{data,error}`; token).
- [ ] **Step 4: Run** `tests/app/admin/perShowPage.test.tsx` → PASS.
- [ ] **Step 5: Commit** — `perf(admin): parallelize per-show page feed+crew+token reads`

---

### Task 7: Dashboard parallelization + A5 + purge gate (A2/A5)

**Files:**
- Modify: `components/admin/Dashboard.tsx`, `app/admin/page.tsx`
- Test: existing `tests/admin/fetchDashboardData.test.ts` + a new gate test `tests/app/admin/purgeGate.test.ts`.

- [ ] **Step 1a: Failing dashboard test** — extend `fetchDashboardData.test.ts` with a deferred mock asserting `shows`-list + `activeCount` + `archivedCount` are initiated concurrently (wave 1), and `crewTotal` + `loadNeedsAttention` run concurrently once `activeShowIds` known (wave 2); assert `nowDate()` resolved once (spy count 1 across the render path). For A5: with a fixture of **20** in-flight (unpublished) shows and `FINALIZE_OWNED_CONCURRENCY=8`, a deferred `rpc` mock tracks concurrent in-flight calls; assert **max simultaneous in-flight `readfinalizeowned_b2` ≤ 8** (NOT all 20 at once — Codex plan R1 MEDIUM bounded-fanout guard) AND that all 20 eventually resolve with correct `!q.error && q.data===true` discrimination and per-call `catch → fail toward Held`.
- [ ] **Step 1b: Failing gate test** (`tests/app/admin/purgeGate.test.ts`) — mock `readAppSettingsRow` + spy `purgeAndRotateIfStale`: (i) `pending_wizard_session_at=null` → `purgeAndRotateIfStale` NOT called, page uses pre-read settings; (ii) non-null → IS called, behavior unchanged; (iii) pre-read `infra_error` → falls back to calling `purgeAndRotateIfStale` (no false settled render).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3a: Implement Dashboard.tsx** — resolve `nowDate()` once and thread the `Date`; `Promise.all` wave 1 (shows list, activeCount, archivedCount); after `activeShowIds`, `Promise.all` wave 2 (crewTotal + loadNeedsAttention; crew paginate loop stays internally sequential but runs concurrently with these). A5 → **bounded-concurrency chunking** (NOT unbounded Promise.all):

```typescript
const FINALIZE_OWNED_CONCURRENCY = 8;
for (let i = 0; i < inFlightIds.length; i += FINALIZE_OWNED_CONCURRENCY) {
  const batch = inFlightIds.slice(i, i + FINALIZE_OWNED_CONCURRENCY);
  const owned = await Promise.all(
    batch.map((id) =>
      supabase
        .rpc("readfinalizeowned_b2", { p_show_id: id })
        .then((q) => (!q.error && q.data === true ? id : null))
        .catch(() => null), // fail toward "Held"
    ),
  );
  for (const id of owned) if (id) finalizeOwnedIds.add(id);
}
```

Keep every supabase await inside try/catch (admin meta-test grep-shape).
- [ ] **Step 3b: Implement app/admin/page.tsx** — call `readAppSettingsRow()`; if `kind==='value' && settings.pending_wizard_session_at===null` → use `settings`, skip `purgeAndRotateIfStale`; else (non-null OR `infra_error`) → `await purgeAndRotateIfStale()` and use its `result.settings`. Thread the resulting `settings` into the existing dispatch unchanged.
- [ ] **Step 4: Run** `tests/admin/fetchDashboardData.test.ts` + `tests/app/admin/purgeGate.test.ts` + `tests/admin/_metaInfraContract.test.ts` → PASS.
- [ ] **Step 5: Commit** — `perf(admin): parallelize dashboard reads, dedupe nowDate, gate purgeAndRotateIfStale, fan out finalize-owned RPC`

---

### Task 8: Settings page single-read + parallel loaders (A3)

**Files:**
- Modify: `app/admin/settings/page.tsx`
- Test: existing settings-page test (if any) + a guard test asserting the four toggle initial values still render and the three top-level loaders run concurrently.

- [ ] **Step 1: Failing test** — assert the settings page derives the 4 toggle initial shapes from `getSettingsPageFlags` (one read) and `Promise.all`s flags + `fetchDriveConnectionHealth` + `fetchEmbeddedAdminEmails`; an `infra_error` from flags degrades the toggles exactly as the prior per-getter `infra_error` did (no crash).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — replace the 4 sequential getter awaits (L80/88/89/90) with one `getSettingsPageFlags()` call mapped to the 4 initial shapes; `const [flags, driveHealth, adminEmails] = await Promise.all([getSettingsPageFlags(), fetchDriveConnectionHealth(), fetchEmbeddedAdminEmails()])`. Map `flags.kind==='infra_error'` to the same degraded initial each toggle used before.
- [ ] **Step 4: Run** the settings test(s) → PASS.
- [ ] **Step 5: Commit** — `perf(admin): collapse settings app_settings reads to one + parallelize loaders`

---

### Task 9: Full verification (suite + typecheck + lint)

- [ ] **Step 1:** `pnpm exec vitest run` (full suite) → all green. Capture output.
- [ ] **Step 2:** `pnpm exec tsc --noEmit` (or the repo's typecheck script) → no errors.
- [ ] **Step 3:** `pnpm exec eslint .` (or repo lint script) on changed files → clean.
- [ ] **Step 4:** If any meta-test (`tests/auth/_metaInfraContract`, `tests/admin/_metaInfraContract`, `tests/sync/_metaInfraContract`, `tests/admin/no-inline-email-normalization`) fails, fix per its message (registry row / grep-shape). Commit fixes as `test(...)`.
- [ ] **Step 5: Commit** any incidental fixes — `test(perf): green full suite + typecheck + lint for nav phase 1`

---

### Task 10: Invariant 8 close-out — impeccable critique + audit (external attestation)

- [ ] **Step 1:** Compute the app/components diff (`git diff origin/main...HEAD -- app components`).
- [ ] **Step 2:** Run `/impeccable critique` on that diff (canonical v3 preflight: PRODUCT.md / DESIGN.md / register / preflight signal), via a fresh subagent (external attestation — not self-attested).
- [ ] **Step 3:** Run `/impeccable audit` on the same diff, fresh subagent.
- [ ] **Step 4:** Triage findings: expected clean (no rendered-output change). Any HIGH/CRITICAL → fix (it indicates an unintended render-branch change) or defer via `DEFERRED.md` with rationale. Record findings + dispositions in the PR body.
- [ ] **Step 5: Commit** any fixes — `fix(admin): impeccable close-out fixups (nav phase 1)` (only if findings).

---

### Task 11: Plan/diff self-review

- [ ] Re-read the spec §1-§10; confirm every workstream item (A1-A5, B1-B3, B-SEC, A2 gate) has a landed task + passing test. List any gap; add a task if missing.
- [ ] Grep the diff for `allSettled` (must be ZERO), for bare `data` without `error` destructure on new reads, for inline `.toLowerCase()/.trim()`. Confirm no migration files added.

---

### Task 12: Close-out — cross-model whole-diff review + CI + merge (Stage 4)

- [ ] **Step 1:** Whole-diff cross-model adversarial review (Codex, fresh-eyes, REVIEWER ONLY), iterate to APPROVE (no round budget). Triage via deferral discipline.
- [ ] **Step 2:** Push branch; open PR (base `main`). Body: summary, spec/plan links, impeccable findings+dispositions, "no migration" note.
- [ ] **Step 3:** Watch real GitHub Actions CI to green (unit-suite + meta/audit gates). Reconcile if behind base (DIRTY).
- [ ] **Step 4:** `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review (run after drafting — checklist)

1. **Spec coverage:** A1→T4, A2→T7+T1, A3→T8+T2, A4→T5+T6, A5→T7, B1/B2/B3→T3, B-SEC→T3 tests, §6 meta-test→T1/T2/T3, §7-closeout→T10. ✓ no gaps.
2. **Placeholder scan:** the only soft spot is the Task 3 dedup-test request-scope seam — explicitly flagged with an implementer decision point + structural fallback (not a silent TODO). All code steps show code.
3. **Type consistency:** `readAppSettingsRow`/`getSettingsPageFlags` return `{kind:'value'|'infra_error'}` (matches house getters); `AppSettingsRow` from `@/lib/onboarding/sessionLifecycle`; `requireAdminIdentity` signature unchanged.
4. **Anti-tautology:** concurrency tests use deferred promises (a serial impl fails); auth tests assert against spy call-counts; settings/dashboard derive expectations from injected fixtures.
