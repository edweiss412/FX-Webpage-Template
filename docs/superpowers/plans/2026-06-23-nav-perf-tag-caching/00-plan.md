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
- [ ] **Step 3: Implement the split.** Create `lib/data/showCacheTag.ts`:

```ts
export function showCacheTag(showId: string): string {
  return `show-${showId}`;
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
- [ ] **Step 2: Run → FAIL** (registry lists the sites but they don't yet call revalidateTag). This is expected; Tasks 5-9 turn it green. Seed `REVALIDATE_REGISTRY` from Task 1's classification.
- [ ] **Step 3: Commit** the meta-test (red is OK here — it's the coverage spec). `test(crew-page): show-cache revalidate coverage meta-test (discovery + registry)`

---

### Task 5: revalidateTag at the sync post-commit OWNERS (R1 fix — NOT inside processOneFile_unlocked)

**Why two owners (Codex plan-R1 HIGH):** `processOneFile_unlocked` runs INSIDE the tx — it has no post-commit point. The tx is owned by the WRAPPER:
- **Locked path** (cron, webhook, manual sync): `withPostgresSyncPipelineLock` (`runScheduledCronSync.ts:1432`) owns the tx (`sql.begin:1444`); `runManualSyncForShow:279` calls through it. Post-commit = AFTER `withPostgresSyncPipelineLock` resolves. → revalidate HERE covers all 3 locked callers.
- **Unlocked path** (retry): `runManualSyncForShow_unlocked` (`runManualSyncForShow.ts:261`) calls `processOneFile_unlocked` directly (no lock wrapper); the tx is owned by its caller. Post-commit = after that apply resolves. → revalidate at the unlocked runner's post-commit (confirm exact boundary in impl).

**Files:** Modify `lib/sync/runScheduledCronSync.ts` (`withPostgresSyncPipelineLock` post-resolve), `lib/sync/runManualSyncForShow.ts` (`runManualSyncForShow_unlocked` post-apply). Test `tests/sync/syncRevalidate.test.ts`.

- [ ] **Step 1: Failing test** — for the locked wrapper: inject a tx (`sql.begin`) that records a `committed` marker on resolve + returns `{outcome:"applied", showId}`; assert `revalidateTag(showCacheTag(showId))` fires AND the spy records it AFTER `committed` (post-commit ordering). Repeat for the unlocked runner. Non-applied outcomes (skip/error) → NO revalidate.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — in `withPostgresSyncPipelineLock`, after `sql.begin(...)` resolves, if the result `outcome==="applied"` call `revalidateTag(showCacheTag(result.showId))`. In `runManualSyncForShow_unlocked`, after its apply resolves, same. Do NOT use the injected publisher; do NOT place inside the `sql.begin` callback.
- [ ] **Step 4: Run → PASS** + meta-test passes for `runScheduledCronSync.ts` AND `runManualSyncForShow.ts`. **Commit.** `feat(sync): revalidate show cache tag post-commit (lock wrapper + unlocked runner)`

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

- [ ] **Step 1-4: TDD** the revalidate sites; add `// not-subject-to-revalidate: <reason>` to the exempt sites. Run the meta-test → FULLY GREEN (registry + discovery + RPC layers). **Commit.** `feat(crew-page): complete show-cache revalidate coverage + exemptions`

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
