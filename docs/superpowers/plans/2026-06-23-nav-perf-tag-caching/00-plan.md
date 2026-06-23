# Nav-perf tag-caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Cache `getShowForViewer`'s expensive data fan-out via `unstable_cache` keyed per-show-per-viewer and tagged `show-${showId}`, with `revalidateTag` at every show-data write path (near-zero staleness), so crew/preview load/reload/realtime-refresh skips the ~9-read DB fan-out.

**Architecture:** Split `getShowForViewer` into (a) `getShowDataForViewerCached` — the pure service-role reads wrapped in `unstable_cache({ tags:[show-${id}], revalidate:300 })` — and (b) a LIVE `viewerVersionToken` read (never cached; it drives the realtime bridge — caching it = infinite refresh loop). Every Next-runtime write to a `getShowForViewer`-read table calls `revalidateTag(show-${id})` POST-COMMIT. A discovery meta-test makes coverage CI-enforced.

**Tech Stack:** Next.js 16.2.4 `unstable_cache` + `revalidateTag` (NOT `use cache` — `cacheComponents` not enabled), postgres.js raw SQL writes, Jest.

**Spec:** `docs/superpowers/specs/2026-06-23-nav-perf-tag-caching.md` (Codex APPROVE R5).

## Global Constraints

- TDD per task: failing test → minimal impl → green → commit. Conventional commits, `--no-verify`, `prettier --write` before each commit.
- **viewerVersionToken stays LIVE** — never inside the cache (spec §3.1).
- **revalidateTag is POST-COMMIT** — after the outermost apply tx/lock commits, never inside it (spec §4.2).
- Tag string is exactly `` `show-${showId}` `` everywhere (one helper — see Task 2).
- Per-viewer key `["getShowForViewer", showId, viewer.kind, viewer.crewMemberId ?? "admin"]`.
- No rendered-UI change → invariant 8 N/A. If any `components/`/`app/**` (non-api) file changes a render, run the crew-e2e job.
- Supabase call-boundary discipline (invariant 9) preserved in any touched read/write.

---

### Task 1: Discovery scan → authoritative write-site registry

**Files:** Create `docs/superpowers/plans/2026-06-23-nav-perf-tag-caching/01-write-site-registry.md` (working doc).

- [ ] **Step 1: Run the discovery regex** (spec §6) and capture the full hit list:

```bash
rg -ln -e "insert into public\.(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)" \
      -e "update public\.(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)" \
      -e "delete from public\.(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)" \
      lib app | rg -v "\.test\.|/tests/|/audit/|noGlobalCursor|watermark"
# ALSO the supabase builder form:
rg -ln '\.from\("(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)"\)\s*\.\s*(insert|update|upsert|delete)' lib app | rg -v "\.test\.|/tests/"
```

- [ ] **Step 2: Classify each hit** in the registry doc as one of: `CHOKEPOINT` (sync — covered by Task 5's `processOneFile_unlocked`), `REVALIDATE` (own post-commit call — Tasks 6-9), or `EXEMPT` (with reason — e.g. clears only `pending_*`/session rows, or picker/auth columns not in the crew DATA projection). Expected starting set (spec §5 + §6 validation): `runScheduledCronSync.ts` (CHOKEPOINT), `runManualSyncForShow.ts` (CHOKEPOINT — confirm), `promoteSnapshot.ts`, `assetRecovery.ts`, `applyStaged.ts`, `finalize/route.ts`, `finalize-cas/route.ts`, `unpublishShow.ts` callers (REVALIDATE); `discardStaged.ts`, `lib/onboarding/sessionLifecycle.ts` (classify — likely EXEMPT if they only clear pending/session rows; VERIFY each writes no rendered crew data). For lifecycle/feed/picker/share-rotate/validation see spec §5.
- [ ] **Step 3: Commit** the registry doc. `git commit -m "docs(plan): nav-tag-caching write-site registry from discovery scan"`

**Interfaces produced:** the registry doc + the final tag-string `` `show-${showId}` `` + key shape, consumed by every later task and the meta-test (Task 4).

---

### Task 2: Split getShowForViewer — cached data + live version token

**Files:** Modify `lib/data/getShowForViewer.ts`. Create `lib/data/showCacheTag.ts`. Test `tests/data/getShowForViewer.cache.test.ts`.

**Interfaces produced:** `showCacheTag(showId): string` (= `` `show-${showId}` ``); `getShowForViewer(showId, viewer)` unchanged signature/return.

- [ ] **Step 1: Write the failing test.** `unstable_cache` needs an incremental-cache context Jest lacks (Codex plan-R1 HIGH) → DON'T rely on real caching. Instead **mock `next/cache`** so `unstable_cache(fn, keyParts, opts)` returns a wrapper that MEMOIZES on `JSON.stringify(keyParts)` (deterministic in-test caching) AND records `(keyParts, opts)`. Then: spy `createSupabaseServiceRoleClient` (count `.from(<table>)` + `.rpc("viewer_version_token")`). Call `getShowForViewer(SHOW, viewer)` twice. Assert: (a) data tables read ONCE (memoized by the mock — proves getShowForViewer routes data THROUGH unstable_cache with a stable key); (b) `viewer_version_token` rpc called TWICE (proves the token is read OUTSIDE the cache — the no-loop split); (c) the recorded `opts` = `{ tags:["show-"+SHOW], revalidate:300 }` and keyParts include show+kind+crewMemberId (proves correct wiring). This tests OUR usage; Next's real caching is the library's contract.

```ts
// mock shape — memoizes by keyParts AND evicts by tag, so both the hit/miss
// (Task 2) and the tag-bust (Task 3) tests are faithful.
jest.mock("next/cache", () => {
  const memo = new Map(); // key -> { value, tags }
  const recorded = [];
  return {
    __memo: memo, __recorded: recorded,
    unstable_cache: (fn, keyParts, opts) => {
      return async (...a) => { const k = JSON.stringify(keyParts);
        recorded.push({ keyParts, opts });
        if (!memo.has(k)) memo.set(k, { value: await fn(...a), tags: opts?.tags ?? [] });
        return memo.get(k).value; };
    },
    revalidateTag: jest.fn((tag) => {
      for (const [k, e] of memo) if (e.tags.includes(tag)) memo.delete(k);
    }),
  };
});
```

```ts
// tests/data/getShowForViewer.cache.test.ts (shape)
it("caches the data fan-out but re-reads the version token live", async () => {
  const counts = installSpyServiceClient(); // counts .from(table) + .rpc(name)
  await getShowForViewer(SHOW_ID, { kind: "crew", crewMemberId: CREW_ID });
  await getShowForViewer(SHOW_ID, { kind: "crew", crewMemberId: CREW_ID });
  expect(counts.from.shows).toBe(1);          // data cached
  expect(counts.rpc.viewer_version_token).toBe(2); // token LIVE (no loop)
});
```

- [ ] **Step 2: Run → FAIL** (`getShowForViewer` not yet split; data read twice).
- [ ] **Step 3: Implement the split.** Create `lib/data/showCacheTag.ts` (tag helper + the post-commit revalidate helper used by Tasks 5-9):

```ts
import { revalidateTag } from "next/cache";

export function showCacheTag(showId: string): string {
  return `show-${showId}`;
}

/** Revalidate the show's cache tag. Call ONLY post-commit (after the apply tx resolves). */
export function revalidateShow(showId: string): void {
  revalidateTag(showCacheTag(showId));
}

/** Sync convenience: revalidate iff a ProcessOneFileResult applied. Caller MUST be post-commit. */
export function revalidateOnApplied(result: { outcome?: string; showId?: string } | null | undefined): void {
  if (result && result.outcome === "applied" && result.showId) revalidateShow(result.showId);
}
```

In `getShowForViewer.ts`: extract everything EXCEPT the `viewer_version_token` RPC into `readShowDataForViewer(showId, viewer)`; wrap it:

```ts
import { unstable_cache } from "next/cache";
import { showCacheTag } from "@/lib/data/showCacheTag";

function cachedShowData(showId: string, viewer: Viewer) {
  return unstable_cache(
    () => readShowDataForViewer(showId, viewer),
    ["getShowForViewer", showId, viewer.kind, viewer.crewMemberId ?? "admin"],
    { tags: [showCacheTag(showId)], revalidate: 300 },
  )();
}

export async function getShowForViewer(showId: string, viewer: Viewer): Promise<ShowForViewer> {
  const data = await cachedShowData(showId, viewer);
  const viewerVersionToken = await readViewerVersionToken(showId); // LIVE — never cached
  return { ...data, viewerVersionToken };
}
```

`readViewerVersionToken` = the existing `viewer_version_token` RPC read (hard-fail preserved). Keep `readShowDataForViewer` pure (service-role client; no cookies/headers — already true).

**Cache profile (Codex plan-R3 MED):** `{ tags:[showCacheTag(showId)], revalidate: 300 }` — `revalidate: 300` is the TTL BACKSTOP (defense-in-depth per spec §4.3), NOT the primary mechanism. `revalidateTag(showCacheTag(id))` (Tasks 5-9) forces IMMEDIATE staleness on the next read (near-zero), independent of the TTL. `revalidateTag` is valid in Route Handlers + Server Functions (where Tasks 5-9 call it) — NOT inside the `unstable_cache` callback. Pass the 3rd `options` arg explicitly (omitting it is discouraged in Next 16).

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: JSON-roundtrip test** — assert `JSON.parse(JSON.stringify(await readShowDataForViewer(...)))` deep-equals the original (no `Date`/class instances; `DateRestriction`, `tileErrors`, nested rows are plain). Failure caught: a non-serializable field silently corrupting the cache.
- [ ] **Step 6: Run → PASS. Commit.** `feat(crew-page): cache getShowForViewer data via unstable_cache; keep version token live`

---

### Task 3: Per-viewer key isolation + tag-bust tests

**Files:** Test `tests/data/getShowForViewer.cache.test.ts` (extend).

- [ ] **Step 1: Failing test — per-viewer isolation.** Three viewers `{crew, crewA}`, `{crew, crewB}`, `{admin}` for the same show produce DISTINCT cached results (financials present only for lead/admin; hotel filtered by name). Assert crewB's result never contains crewA's `viewerName`/financials. **Security failure caught:** key collision leaking another viewer's financials.
- [ ] **Step 2: Failing test — tag bust.** `getShowForViewer(show,viewer)` → mutate the spy's backing data → `revalidateTag(showCacheTag(show))` → call again → fresh data (fan-out re-issued). Failure caught: wrong tag string / not wired.
- [ ] **Step 3: Run → PASS** (Task 2 already satisfies these if keyed correctly; if not, fix the key). **Commit.** `test(crew-page): per-viewer cache isolation + tag-bust`

---

### Task 4: Discovery + registry coverage meta-test (write FIRST; goes green as Tasks 5-9 land)

**Files:** Create `tests/db/showCacheRevalidateCoverage.test.ts`.

**Interfaces produced:** `REVALIDATE_REGISTRY` (array of `{file, siteCount, disposition: "revalidate"|"exempt", reason?}`) + `WRITING_RPCS` list.

- [ ] **Step 1: Write the meta-test (spec §6 — two layers).**
  - Registry layer: for each `disposition:"revalidate"` file, assert its source contains `revalidateTag(` with a `show-`/`showCacheTag(` argument; for `disposition:"exempt"`, assert a `// not-subject-to-revalidate:` comment is present.
  - Discovery layer (SITE-level, Codex plan-R1 MED): run the spec §6 regex (raw-SQL on the 7 read-tables + the `.from().{insert,update,upsert,delete}` form) over `lib`+`app` (minus tests/audit). Count the MATCHES per file (a write SITE = one matched line). The registry records `{file, siteCount, disposition}`; the test asserts the discovered match-count per file EQUALS the registered `siteCount` AND the file is registered. A NEW raw-SQL write added inside an already-registered file bumps the discovered count → MISMATCH → FAIL ("new show-data write site in <file>: registered N, found M — add a revalidateTag + bump siteCount or exempt"). An unregistered file → FAIL. This catches both new-file and new-write-in-existing-file (the file-level-registry gap).
  - RPC layer: for each `WRITING_RPCS` name, the wrapper call sites (`lib/showLifecycle/_shared.ts` callers / the `_actions/*`) must have a `revalidateTag`.
  - **Multi-branch files (Codex plan-R3 MED):** a file's `siteCount` counts write LINES, but presence of ONE `revalidateTag` doesn't prove every write BRANCH is covered (e.g. `runScheduledCronSync.ts` writes `public.shows` in BOTH the processOneFile apply AND `markMissingShow_unlocked`). The registry therefore records `revalidateBranches` (expected count of distinct `revalidateShow`/`revalidateOnApplied` call sites) per multi-write file, and the test asserts the file contains ≥ that many revalidate calls. The AUTHORITATIVE per-branch proof is the per-branch UNIT tests (Task 5 tests BOTH the applied and missingShows branches); the meta-test is the structural backstop (file registered + site-count + branch-count), not a substitute for the branch tests.
- [ ] **Step 2: Run → FAIL** (registry lists the sites but they don't yet call revalidateTag). Seed `REVALIDATE_REGISTRY` from Task 1's classification. **DO NOT COMMIT RED** (repo TDD invariant = commit only green; Codex plan-R2). Leave the file authored-but-uncommitted; Tasks 5-9 wire the sites (each its own red→green→commit per-site cycle), then Task 9's final step commits this meta-test GREEN.
- [ ] **Step 3:** (no commit here — see Task 9 final step). The per-site Tasks 5-9 are the TDD cycles; this meta-test is the structural guard committed once green.

---

### Task 5: revalidateTag at the sync CALLERS post-tx (R1+R2 fix — NOT in the generic lock wrapper, NOT inside the tx)

**Why caller-level (Codex plan-R1+R2 HIGH):** `processOneFile_unlocked` runs INSIDE the tx (pre-commit). `withPostgresSyncPipelineLock` (`runScheduledCronSync.ts:1432`, returns `R | ConcurrentSyncSkipped`) is GENERIC in `R` — it cannot inspect `outcome`/`showId`, so revalidate can't live there either. `runManualSyncForShow_unlocked` (`runManualSyncForShow.ts:261`) takes the `tx` as a PARAM (caller owns the tx) → revalidate inside it is pre-commit. **Post-commit owners are the top-level callers, each after its own lock/tx fully resolves**, using `revalidateOnApplied(result)` (Task 2). Four sites:
- **Cron:** `runScheduledCronSync` has TWO post-lock write branches (Codex plan-R3 HIGH): (a) the processOneFile apply tail (~`:1783-1825`, where `args.result` is available + `publishShowInvalidation?.()` already fires at `:1813`) → `revalidateOnApplied(args.result)` there; (b) the `missingShows` loop (`:2679-2681`) → after `lockMissingShow(show.driveFileId, markMissingShow_unlocked)` resolves, `markMissingShow_unlocked` (`:1959`) wrote `update public.shows`, so `revalidateShow(show.id)` per missing show (post-resolve). BOTH branches must revalidate.
- **Webhook:** `runPushSyncForShow.ts` — after its `withPipelineLock`/`processOneFile` resolves.
- **Manual sync:** `runManualSyncForShow` (`:273`) — after its `deps.withPipelineLock` resolves the `ProcessOneFileResult`.
- **Retry:** the retry ROUTE(s) (`app/api/admin/pending-ingestions/[id]/retry/route.ts`, `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts`) — they own the tx (`withRow*`) and return a `Response`; capture the applied `showId` from the `runManualSyncForShow_unlocked` result, and call `revalidateShow(showId)` AFTER the `withRow*`/tx resolves (post-commit), before building the Response.

**Files:** `lib/sync/runScheduledCronSync.ts`, `lib/sync/runPushSyncForShow.ts`, `lib/sync/runManualSyncForShow.ts`, both retry routes. Test `tests/sync/syncRevalidate.test.ts`.

- [ ] **Step 1: Failing test (locked callers + missingShows)** — inject a `withPipelineLock`/`lockMissingShow` that records a `committed` marker on resolve; (a) applied path returns `{outcome:"applied", showId}` → assert `revalidateTag(showCacheTag(showId))` fires AFTER `committed`, once per applied show; (b) `missingShows` path → assert `revalidateShow(missingShow.id)` fires after `lockMissingShow` resolves. Cover cron (BOTH branches), push runner, manual sync. Non-applied (skip/error/ConcurrentSyncSkipped) → NO revalidate.
- [ ] **Step 2: Run → FAIL. Step 3: Implement** `revalidateOnApplied(args.result)` in the cron apply tail + `revalidateShow(show.id)` in the cron `missingShows` loop + `revalidateOnApplied` at the push runner and `runManualSyncForShow` post-`withPipelineLock`. **Step 4: PASS. Commit.** `feat(sync): revalidate show cache tag post-commit at locked sync callers (apply + missing)`
- [ ] **Step 5: Failing test (retry route)** — drive the retry route with a tx wrapper that records `committed` on resolve + an unlocked runner returning applied; assert `revalidateShow(showId)` fires AFTER `committed` and BEFORE the Response is returned. **Step 6: FAIL → implement (capture showId, revalidate post-`withRow*`) → PASS. Commit.** `feat(sync): revalidate show cache tag post-commit in pending-ingestion retry routes`

---

### Task 6: revalidateTag at onboarding finalize + finalize-cas (post-withTx-commit)

**Files:** Modify `app/api/admin/onboarding/finalize/route.ts`, `.../finalize-cas/route.ts`. Tests alongside each route's existing test.

- [ ] **Step 1: Failing tests** — finalize applies via `applyStagedCore` then commits `deps.withTx`; assert `revalidateTag(showCacheTag(showId))` fires after the withTx commit. finalize-cas: collect the affected show id(s) (incl. the `shows.published` flip) and assert revalidate after `withTx` commit (`:713-716`), NOT inside inner txns.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the post-commit revalidate in each route (collect affected show id(s) during apply; revalidate each after the outer commit).
- [ ] **Step 4: Run → PASS** + meta-test green for these files. **Commit.** `feat(onboarding): revalidate show cache tag post-finalize`

---

### Task 7: revalidateTag at diagram promote + assetRecovery + applyStaged

**Files:** Modify `lib/sync/promoteSnapshot.ts`, `lib/sync/assetRecovery.ts`, `lib/sync/applyStaged.ts` (per Task 1 classification — only those that mutate RENDERED crew data: diagrams, crew/show rows). Tests alongside.

- [ ] **Step 1: Failing tests** — each writer, after its commit, calls `revalidateTag(showCacheTag(showId))`. (assetRecovery writes `shows.diagrams` — projected at `getShowForViewer.ts:709-731` — so it MUST revalidate.)
- [ ] **Step 2-4: FAIL → implement post-commit revalidate → PASS.** For any classified EXEMPT (e.g. a writer that only touches `pending_*`), add `// not-subject-to-revalidate: <reason>` instead. **Commit.** `feat(sync): revalidate show cache tag on diagram promote + asset recovery + staged apply`

---

### Task 8: revalidateTag at lifecycle actions (publish/archive/unarchive/undo)

**Files:** Modify `app/admin/show/[slug]/_actions/{publish,archive,unarchive,undoAutoPublish}.ts` (add `revalidateTag(showCacheTag(showId))` beside the existing `revalidatePath`). Tests alongside.

- [ ] **Step 1-4: TDD** — each action, on success, calls `revalidateTag`. unarchive triggers a catch-up sync (covered by Task 5 too — that's fine, idempotent). **Commit.** `feat(admin): revalidate show cache tag on lifecycle actions`

---

### Task 9: revalidateTag at feed + unpublish + validation-reset; exemptions

**Files:** Modify `app/admin/show/[slug]/_actions/feed.ts`, the unpublish API route + in-app undo action (`lib/sync/unpublishShow.ts` caller), `app/admin/settings/_actions/validationReset.ts`. Add exemption comments to picker (`selectIdentity`/`clearIdentity`), share-token-rotate / picker-epoch-reset callers, and any Task-1 EXEMPT (discardStaged, sessionLifecycle).

- [ ] **Step 1-4: TDD** the revalidate sites; add `// not-subject-to-revalidate: <reason>` to the exempt sites. **Commit.** `feat(crew-page): complete show-cache revalidate coverage + exemptions`
- [ ] **Step 5: Commit the meta-test GREEN (the Task-4 file, now satisfied).** Run `tests/db/showCacheRevalidateCoverage.test.ts` → all three layers PASS (every registered site has revalidate/exemption; discovery site-counts match; RPC wrappers covered). Reconcile any `siteCount` against the final discovery output. **Commit.** `test(crew-page): show-cache revalidate coverage meta-test (discovery + registry, green)`

---

### Task 10: Full verification

- [ ] **Step 1:** `pnpm exec tsc --noEmit` → clean.
- [ ] **Step 2:** `pnpm lint` (repo-wide; must be 0 errors) + `pnpm exec prettier --check` the touched files.
- [ ] **Step 3:** `pnpm test` (full suite) → green, including the new cache + meta-test + per-site tests.
- [ ] **Step 4:** Confirm NO rendered-UI file changed (data + sync + actions only) → invariant 8 N/A. If `getShowForViewer`'s call sites or any `components/` render changed, run the crew-e2e job (`gh workflow run crew-e2e.yml --ref <branch>`).
- [ ] **Step 5: Commit** any formatting. `chore(crew-page): tsc/lint/format clean for nav-tag-caching`

---

## Self-Review (run before adversarial review)
- Spec coverage: every §5/§6 site has a task (Tasks 5-9) or an exemption; the meta-test (Task 4) enforces it.
- Anti-tautology: the cache hit/miss test asserts the token RPC fires BOTH times (not just "function called") — proves the live-token split. The per-viewer test asserts no cross-viewer financial leak (derived from fixture role_flags, not hardcoded). The meta-test discovery layer is derived from the live regex, not a static list.
- Placeholder scan; type consistency (`showCacheTag`, `Viewer`, `ShowForViewer` used consistently).
- Post-commit ordering asserted in Tasks 5-6 (commit-marker), not assumed.

## Adversarial review (cross-model) — MANDATORY, between self-review and execution handoff
Invoke Codex adversarial-review on this plan; iterate to APPROVE (no round budget). Then execution handoff.

## Execution Handoff
Subagent-driven or inline TDD per task. Per AGENTS.md autonomous-ship: drive to whole-diff Codex review → real CI green → merge → ff main.
