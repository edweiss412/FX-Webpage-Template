# Published Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistent Published toggle on `/admin/show/[slug]` (pure unpublish / gated republish), replacing the in-app Undo-auto-publish affordances and the show-page Held Publish button; crew share URLs render a data-free "not available" page while off; the 24 h emailed undo link survives with softened (pure-unpublish) effect.

**Architecture:** New `unpublish_show` SECURITY DEFINER RPC (in-RPC advisory lock, mirrors `archive_show`) + one server action dispatching `publish_show`/`unpublish_show`; the emailed-link engine keeps its JS-side lock and inline mutation, softened and finalize-guarded; `viewer_version_token` gains a `published` component. Spec: `docs/superpowers/specs/2026-07-01-published-toggle.md` (Codex-APPROVED, 10 rounds — its §9 do-not-relitigate list binds reviewers).

**Tech Stack:** Next.js 16 App Router, Supabase (postgres.js raw tx for the emailed path), Vitest, Playwright.

## Global Constraints (AGENTS.md invariants + spec)

- TDD per task: failing test → minimal implementation → green → commit (`--no-verify`, worktree hook rule). Conventional commits with scopes shown per task.
- Advisory-lock single-holder: `unpublish_show` locks IN-RPC; the emailed path's ONLY holder stays `withShowLock` (JS). Never both.
- Supabase call-boundary: every new client call destructures `{ data, error }`; lifecycle RPCs only via `callLifecycleRpc`.
- No raw error codes in UI: catalog copy via `messageFor`/`ErrorExplainer` only. `BUSY_*`/retry copy are deliberate uncataloged plain-language (waiver precedent `app/show/[slug]/unpublish/copy.ts:20`).
- NEVER run prettier on `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.
- §12.4 lockstep: master-spec row + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` in ONE commit; new code additionally `pnpm gen:internal-code-enums` + `/help/errors` family coverage.
- `.db`/real-DB suites run in ISOLATION (shared local DB; a full `vitest run` in a worktree pollutes it).
- Migrations: local apply → `pnpm gen:schema-manifest` → surgical validation-project apply + `notify pgrst, 'reload schema'` (Task 11).
- UI files (`components/`, `app/` non-api) are invariant-8 surfaces → impeccable dual-gate at close-out (Task 11).
- KEEP: `publishShowAction` / `PublishShowButton` (used by `/admin/unpublished`). DELETE only the undo surfaces listed in Task 8.

## Meta-test inventory (EXTENDS)

`tests/db/b2-lifecycle-rpc-meta.test.ts` (T1) · `tests/showLifecycle/callers.test.ts` (T2) · `tests/sync/_advisoryLockSingleHolderContract.test.ts` (T2 — standalone in-RPC topology test for `unpublish_show`; T8 — plain-`unpublishShow` holder row removed) · `tests/components/admin/transitionAudit.test.tsx` (T8) · `tests/messages/_metaAdminAlertCatalog.test.ts` (T1 — its `SHOW_UNPUBLISHED` registry entry `:195-202` pins only the `lib/sync/unpublishShow.ts` producer; Task 1 Step 5 adds a documented second-producer note + a migration-file pattern assertion so the SQL-side `upsert_admin_alert` producer is structurally pinned, not silently exempt). CREATES: none.

## Advisory-lock holder topology (hashkey `show:<drive_file_id>`)

| Path | Holder | Layer |
|---|---|---|
| Admin toggle OFF | `unpublish_show` | in-RPC (new) |
| Admin toggle ON | `publish_show` | in-RPC (existing) |
| Emailed undo | `withShowLock` in `unpublishShowViaEmailedLink` | JS (existing; mutation stays inline SQL — never calls the RPC) |

---

### Task 1: `unpublish_show` RPC + `viewer_version_token` publication component

**Files:**
- Create: `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`
- Modify: `tests/db/_b2Helpers.ts:33-38` — add `"unpublish_show"` to the `AdminRpcFn` union (part of the failing-test setup; without it the new test fails typecheck before reaching the missing-RPC failure); add `callUnpublishShowAsNonAdmin` mirroring `callReadFinalizeOwnedAsNonAdmin` (`:369-376`)
- Test: `tests/db/unpublish_show_rpc.test.ts` (new), `tests/db/b2-lifecycle-rpc-meta.test.ts` (extend), `tests/messages/_metaAdminAlertCatalog.test.ts` (extend, Step 5)

**Interfaces:**
- Produces: RPC `public.unpublish_show(p_show_id uuid)` — raises `42501` non-admin, `P0002 ADMIN_LINK_SHOW_NOT_FOUND`, `P0001 SHOW_ARCHIVED_IMMUTABLE`, `P0001 FINALIZE_OWNED_SHOW`; idempotent no-op when already unpublished. `viewer_version_token` now ends with `:<true|false>` (published).
- Consumes: `_b2Helpers` seeds (`seedLiveShowWithToken`, `seedArchivedShow`, `readShow`, `readShareToken`, `scratchCount`, `pendingSyncCount`, `asAdminRpc`, `sqlClient`).

- [ ] **Step 1: Write the failing DB test** — `tests/db/unpublish_show_rpc.test.ts`. Model harness lines (imports, non-admin client) on `tests/db/archive_show_rpc.test.ts`. Cases:

```ts
import { describe, it, expect } from "vitest";
import {
  asAdminRpc, callUnpublishShowAsNonAdmin, readShow, readShareToken, scratchCount,
  pendingSyncCount, seedLiveShowWithToken, seedArchivedShow, sqlClient,
} from "@/tests/db/_b2Helpers";

async function versionToken(showId: string): Promise<string> {
  const rows = (await sqlClient.unsafe(
    "select public.viewer_version_token($1::uuid) as t", [showId],
  )) as Array<{ t: string }>;
  return rows[0].t;
}

describe("unpublish_show RPC", () => {
  it("pure unpublish: published=false + token pair null; NOTHING else moves; alert upserted; token flips", async () => {
    const s = await seedLiveShowWithToken({ withScratch: true });
    const before = await readShow(s.showId);
    const tokBefore = (await readShareToken(s.showId)).share_token;
    const vBefore = await versionToken(s.showId);
    await asAdminRpc("unpublish_show", { p_show_id: s.showId });
    const after = await readShow(s.showId);
    expect(after.published).toBe(false);
    expect(after.unpublish_token).toBeNull();
    expect(after.unpublish_token_expires_at).toBeNull();
    // D1 negative set — derived from the seeded row, never hardcoded:
    expect(after.archived).toBe(before.archived);           // still false
    expect(after.archived_at).toBeNull();
    expect(after.picker_epoch).toBe(before.picker_epoch);   // NOT bumped
    expect((await readShareToken(s.showId)).share_token).toBe(tokBefore); // NOT rotated
    expect(await scratchCount(s.driveFileId)).toEqual(await scratchCount(s.driveFileId)); // see Step 1a note
    expect(await pendingSyncCount(s.driveFileId)).toBeGreaterThan(0);     // scratch survives
    const alerts = (await sqlClient.unsafe(
      "select count(*)::int as n from public.admin_alerts where show_id=$1 and code='SHOW_UNPUBLISHED'",
      [s.showId],
    )) as Array<{ n: number }>;
    expect(alerts[0].n).toBe(1);
    expect(await versionToken(s.showId)).not.toBe(vBefore); // published component flipped
  });

  it("idempotent no-op on already-unpublished (no duplicate alert)", async () => {
    const s = await seedLiveShowWithToken();
    await asAdminRpc("unpublish_show", { p_show_id: s.showId });
    await asAdminRpc("unpublish_show", { p_show_id: s.showId }); // no throw
    const alerts = (await sqlClient.unsafe(
      "select count(*)::int as n from public.admin_alerts where show_id=$1 and code='SHOW_UNPUBLISHED'",
      [s.showId],
    )) as Array<{ n: number }>;
    expect(alerts[0].n).toBe(1);
  });

  it("archived show → SHOW_ARCHIVED_IMMUTABLE", async () => {
    const s = await seedArchivedShow();
    await expect(asAdminRpc("unpublish_show", { p_show_id: s.showId }))
      .rejects.toThrow(/SHOW_ARCHIVED_IMMUTABLE/);
  });

  it("LIVE show owned via shows_pending_changes → FINALIZE_OWNED_SHOW, nothing mutated", async () => {
    const s = await seedLiveShowWithToken();
    const w = crypto.randomUUID();
    await sqlClient.unsafe(
      `insert into public.wizard_finalize_checkpoints (wizard_session_id, status, batches_completed)
       values ($1::uuid, 'in_progress', 0)
       on conflict (wizard_session_id) do update set status = 'in_progress'`, [w]);
    await sqlClient.unsafe(
      `insert into public.shows_pending_changes
         (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
       values ($1::uuid, $2, $3::uuid, '{}'::jsonb, 'doug@example.com', now())`,
      [w, s.driveFileId, s.showId]);
    await expect(asAdminRpc("unpublish_show", { p_show_id: s.showId }))
      .rejects.toThrow(/FINALIZE_OWNED_SHOW/);
    expect((await readShow(s.showId)).published).toBe(true);
  });

  it("unknown id → ADMIN_LINK_SHOW_NOT_FOUND; non-admin → 42501", async () => {
    await expect(asAdminRpc("unpublish_show", { p_show_id: crypto.randomUUID() }))
      .rejects.toThrow(/ADMIN_LINK_SHOW_NOT_FOUND/);
  });

  it("non-admin caller → 42501", async () => {
    const s = await seedLiveShowWithToken();
    // Mirror callReadFinalizeOwnedAsNonAdmin (tests/db/_b2Helpers.ts:369-376): authenticated role
    // + non-admin JWT claims inside one tx. Add a sibling helper callUnpublishShowAsNonAdmin to
    // _b2Helpers.ts with this exact body (NON_ADMIN_CLAIMS is module-private there):
    //   await sql.begin(async (tx) => {
    //     await tx`select set_config('role', 'authenticated', true)`;
    //     await tx`select set_config('request.jwt.claims', ${NON_ADMIN_CLAIMS}, true)`;
    //     await tx.unsafe(`select public.unpublish_show($1::uuid)`, [showId]);
    //   });
    await expect(callUnpublishShowAsNonAdmin(s.showId)).rejects.toThrow(/forbidden|permission denied/);
    expect((await readShow(s.showId)).published).toBe(true); // gate fired before any mutation
  });

  it("publish_show → viewer_version_token flips back (inequality both directions)", async () => {
    const s = await seedLiveShowWithToken();
    await asAdminRpc("unpublish_show", { p_show_id: s.showId });
    const vOff = await versionToken(s.showId);
    await asAdminRpc("publish_show", { p_show_id: s.showId });
    expect(await versionToken(s.showId)).not.toBe(vOff);
  });
});
```

Step 1a note: the scratch-survival assertion must compare against a count captured BEFORE the RPC (fix the placeholder self-comparison above when writing the file: `const scratchBefore = await scratchCount(...)` pre-RPC, assert equal post-RPC). If seeding trips `_publish_show_core`'s pending-review gate on the re-publish case, use a scratch-free seed for that one case.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/db/unpublish_show_rpc.test.ts` → FAIL (`function public.unpublish_show(uuid) does not exist`).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`:

```sql
-- Published toggle (spec docs/superpowers/specs/2026-07-01-published-toggle.md §3.1).
-- Pure unpublish: published=false + undo-token pair cleared. Explicitly ABSENT (spec D1):
-- archived/archived_at, picker_epoch bump, share-token rotation, scratch deletes.

create or replace function public._unpublish_show_core(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_title text;
begin
  select drive_file_id, title into v_drive, v_title from public.shows where id = p_show_id;
  update public.shows
     set published = false,
         unpublish_token = null,
         unpublish_token_expires_at = null
   where id = p_show_id;
  perform public.upsert_admin_alert(p_show_id, 'SHOW_UNPUBLISHED',
          jsonb_build_object('drive_file_id', v_drive, 'sheet_name', v_title));
  perform public.publish_show_invalidation(p_show_id);
end $$;
revoke all on function public._unpublish_show_core(uuid) from public, anon, authenticated, service_role;

-- Admin wrapper: same shape as archive_show (20260601000000_b2_show_lifecycle.sql:58-81).
-- Idempotency-first, THEN finalize-owned refusal (spec §3.1 ordering note).
create or replace function public.unpublish_show(p_show_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean; v_published boolean;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'forbidden', hint = 'unpublish_show is admin-only';
  end if;
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then
    raise exception using errcode = 'P0002', message = 'ADMIN_LINK_SHOW_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));
  select archived, published into v_archived, v_published from public.shows where id = p_show_id;
  if v_archived then raise exception using errcode = 'P0001', message = 'SHOW_ARCHIVED_IMMUTABLE'; end if;
  if not v_published then return; end if;            -- idempotent no-op
  if public.readfinalizeowned_b2(p_show_id) then     -- nested SECURITY DEFINER keeps admin JWT (20260602000000 F2 note)
    raise exception using errcode = 'P0001', message = 'FINALIZE_OWNED_SHOW';
  end if;
  perform public._unpublish_show_core(p_show_id);
end $$;
revoke all on function public.unpublish_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unpublish_show(uuid) to authenticated;

-- viewer_version_token: append the publication component (spec §3.1 R6/R9 belt-and-suspenders).
-- Body copied from 20260523000006_viewer_version_token_rewrite.sql with ONE appended component.
create or replace function public.viewer_version_token(p_show_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select
    to_char(greatest(
      coalesce((select extract(epoch from last_synced_at) * 1000
                from public.shows where id = p_show_id), 0),
      coalesce((select extract(epoch from max(last_changed_at)) * 1000
                from public.crew_members where show_id = p_show_id), 0),
      coalesce((select extract(epoch from picker_epoch_bumped_at) * 1000
                from public.shows where id = p_show_id), 0)
    ), 'FM999999999999999')
    || ':'
    || coalesce((select picker_epoch::text from public.shows where id = p_show_id), '0')
    || ':'
    || coalesce((select published::text from public.shows where id = p_show_id), 'false');
$$;
```

Apply locally: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`

- [ ] **Step 4: Run tests to verify pass** — `pnpm vitest run tests/db/unpublish_show_rpc.test.ts` → PASS.

- [ ] **Step 5: Extend the meta-tests** — (a) `tests/db/b2-lifecycle-rpc-meta.test.ts`: add `unpublish_show`/`_unpublish_show_core` to the psql assertion set exactly parallel to `archive_show`/`_archive_show_core` (wrapper takes lock + authenticated-only; core lockless + revoked from all). (b) `tests/messages/_metaAdminAlertCatalog.test.ts`: extend the `SHOW_UNPUBLISHED` registry entry (`:195-202`) with a second producer — a `readFileSync` pattern assertion that `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql` contains `upsert_admin_alert(p_show_id, 'SHOW_UNPUBLISHED'` — plus a comment documenting the two-producer topology (JS emailed path + SQL RPC core). Run: `pnpm vitest run tests/db/b2-lifecycle-rpc-meta.test.ts tests/messages/_metaAdminAlertCatalog.test.ts` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit --no-verify -m "feat(db): unpublish_show RPC (pure unpublish) + published component in viewer_version_token"`

---

### Task 2: Lifecycle caller `lib/showLifecycle/unpublishShow.ts`

**Files:**
- Create: `lib/showLifecycle/unpublishShow.ts`
- Test: `tests/showLifecycle/callers.test.ts` (extend), `tests/sync/_advisoryLockSingleHolderContract.test.ts` (extend — see Step 3a)

**Interfaces:**
- Produces: `unpublishShow(showId: string, deps?: { rpc?: LifecycleRpc }): Promise<LifecycleResult>` (NOTE: deliberate name twin of `lib/sync/unpublishShow.ts`'s token-flow export — different module, different path; spec §3.2).

- [ ] **Step 1: Failing tests** — in `callers.test.ts`, add (mirroring the existing `archiveShow` cases): default-binding test (`sessionRpc` called with `"unpublish_show", { p_show_id: "show-1" }`, service_role never), `{ok:true}` success, `FINALIZE_OWNED_SHOW` + `SHOW_ARCHIVED_IMMUTABLE` typed refusals, unmapped-error → `infra_error`, thrown → `infra_error`.
- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/showLifecycle/callers.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** — copy `lib/showLifecycle/publishShow.ts` verbatim, rename fn/RPC string:

```ts
import { callLifecycleRpc, defaultRpc, type LifecycleRpc, type LifecycleResult } from "@/lib/showLifecycle/_shared";
export type { LifecycleResult } from "@/lib/showLifecycle/_shared";

/** Admin server-action backing for unpublish_show. The RPC self-locks + gates atomically. */
export async function unpublishShow(
  showId: string,
  deps?: { rpc?: LifecycleRpc },
): Promise<LifecycleResult> {
  const rpc = deps?.rpc ?? defaultRpc();
  return (await callLifecycleRpc(rpc, "unpublish_show", { p_show_id: showId })).result;
}
```

- [ ] **Step 3a: Register the in-RPC holder topology (spec §3.4/§8).** The contract test's file-walk registry covers only `lib/**` JS holders (`_advisoryLockSingleHolderContract.test.ts:158`), so the RPC gets an explicit standalone test in that file (alongside the existing topology tests at `:448-474`):

```ts
test("unpublish_show admin path holds the lock in-RPC only (single-holder)", () => {
  const migration = read("supabase/migrations/20260701000000_published_toggle_unpublish_show.sql");
  // Wrapper takes the show lock; the private core takes none.
  expect(migration).toMatch(/create or replace function public\.unpublish_show[\s\S]*?pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'show:'/);
  expect(migration.split("_unpublish_show_core")[1]).not.toBeUndefined();
  // JS caller must NOT add a second layer: no advisory SQL, no withShowLock.
  const caller = read("lib/showLifecycle/unpublishShow.ts");
  expect(caller).not.toMatch(/pg_(?:try_)?advisory_xact_lock|withShowLock/);
});
```

(Use the file's existing `read()` helper; if `read` resolves relative to `lib/`, inline `readFileSync(join(root, ...))` the way the neighboring topology tests do. The core-lockless assertion stays in `tests/db/b2-lifecycle-rpc-meta.test.ts` (Task 1 Step 5a) — this test pins the LAYERING, the psql test pins the DB truth.)
- [ ] **Step 4: Verify pass** — `pnpm vitest run tests/showLifecycle/callers.test.ts tests/sync/_advisoryLockSingleHolderContract.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(admin): unpublishShow lifecycle caller`

---

### Task 3: `setShowPublishedAction` server action

**Files:**
- Create: `app/admin/show/[slug]/_actions/setPublished.ts`
- Modify: `app/admin/show/[slug]/_actions/index.ts` (add export; leave `publishShowAction`/`undoAutoPublishAction` exports for now — removals happen in Task 8)
- Test: `tests/app/admin/set-published-action.test.ts` (new; mirror `tests/app/admin/show-lifecycle-actions.test.ts` mocking style)

**Interfaces:**
- Produces: `setShowPublishedAction(slug: string, next: boolean): Promise<LifecycleResult>`; result codes: `ok:true` | `show_not_found` | `infra_error` | `PUBLISH_BLOCKED_PENDING_REVIEW` | `FINALIZE_OWNED_SHOW` | `SHOW_ARCHIVED_IMMUTABLE` | `ADMIN_LINK_SHOW_NOT_FOUND`.
- Consumes: `publishShow` (`lib/showLifecycle/publishShow.ts`), `unpublishShow` (Task 2), `resolveShowBySlug`/`SHOW_NOT_FOUND` (`_actions/shared.ts:29-35`), `requireAdmin`, `revalidateShow`.

- [ ] **Step 1: Failing tests** — assert: `requireAdmin` awaited BEFORE resolution; `next=true` dispatches `publishShow(id)`, `next=false` dispatches `unpublishShow(id)`; `infra_error`/`not_found` resolution short-circuits with NO lifecycle call; on `ok` → `revalidateShow(id)` + `revalidatePath('/admin/show/<slug>')` + `revalidatePath('/admin')`; on refusal → NO revalidation.
- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/app/admin/set-published-action.test.ts`.
- [ ] **Step 3: Implement** — copy `_actions/publish.ts` structure:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { publishShow, type LifecycleResult } from "@/lib/showLifecycle/publishShow";
import { unpublishShow } from "@/lib/showLifecycle/unpublishShow";
import { resolveShowBySlug, SHOW_NOT_FOUND } from "./shared";

export async function setShowPublishedAction(slug: string, next: boolean): Promise<LifecycleResult> {
  await requireAdmin();
  const resolved = await resolveShowBySlug(slug);
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return SHOW_NOT_FOUND;
  const result = next ? await publishShow(resolved.show.id) : await unpublishShow(resolved.show.id);
  if (result.ok) {
    revalidateShow(resolved.show.id);
    revalidatePath(`/admin/show/${slug}`);
    revalidatePath("/admin");
  }
  return result;
}
```

Barrel: add `export { setShowPublishedAction } from "./setPublished";` to `_actions/index.ts`.
- [ ] **Step 4: Verify pass.** Also `pnpm tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(admin): setShowPublishedAction dispatching publish_show/unpublish_show`

---

### Task 4: Soften the emailed-link engine + finalize-owned guard + ALL public-surface mappings (one commit)

> Task 5's surfaces are folded in here (plan R4): the `finalize_owned` outcome and EVERY live consumer of `UnpublishShowResult` land in ONE commit — otherwise the Task-4 commit leaves `confirmUnpublishAction` returning `undefined` (`app/show/[slug]/unpublish/actions.ts:57-74` switches only success/expired/consumed/not_found) and the API route emitting 404 instead of the spec's 409 (`route.ts:56` fallthrough).

**Files:**
- Modify: `app/show/[slug]/unpublish/copy.ts` — `ConfirmUnpublishActionState` gains `{ status: "busy" }`; new constants (exact copy):

```ts
export const BUSY_HEADING = "This show is being updated";
export const BUSY_BODY =
  "Changes are being finalized right now. Nothing has changed — try again in a few minutes.";
```

- Modify: `app/show/[slug]/unpublish/actions.ts` (explicit `finalize_owned` case → `{ status: "busy" }`), `app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx` (busy render — same block shape as the existing `infra` state, BUSY constants), `app/api/show/[slug]/unpublish/route.ts` (insert the finalize_owned → 409 mapping (exact body defined below) ABOVE the trailing 404 return at `:56`)
- Route 409 body (exact, spec §3.4 'busy body'): `return NextResponse.json({ ok: false, busy: true, message: BUSY_BODY }, { status: 409 });` (import `BUSY_BODY` from the copy module — route tests assert `busy === true` AND `message === BUSY_BODY`)
- Modify: `lib/sync/unpublishShow.ts`, `lib/sync/runManualSyncForShow.ts:113` (widen one param type), `tests/sync/_secondCopyApplyTripwire.test.ts:71-72` — the allowlist names `async archiveAndConsumeUnpublishToken(` and THROWS on a missing allowlisted symbol (`:87-89`); rename the entry to `async unpublishAndConsumeUnpublishToken(` (the softened body still contains `update public.shows`, so the allowlist row must survive, not be dropped)
- Test: `tests/sync/unpublishShow.test.ts` + `tests/sync/unpublishShowViaEmailedLink.concurrency.test.ts` (update fakes/assertions), `tests/sync/unpublishArchiveParity.test.ts` → REWRITE as unpublish parity, `tests/sync/_secondCopyApplyTripwire.test.ts` (run with the sync suites), `tests/show/unpublishConfirmAction.test.ts` (busy state), `tests/api/show-unpublish-route.test.ts` (+realdb variant: 409 + token-intact re-read)

**Interfaces:**
- Produces: `UnpublishShowResult` gains `{ outcome: "finalize_owned"; status: 409; showId: string }`; tx method renamed `unpublishAndConsumeUnpublishToken(showId, token): Promise<boolean>`. Plain `unpublishShow`/`unpublishShow_unlocked`/`readUnpublishTokenForSlug` remain ALIVE until Task 8 (the in-app action still imports them) — and BECAUSE the shared consume path can now return `finalize_owned`, the still-live `undoAutoPublishAction` gets an interim mapping in THIS task (its switch at `app/admin/show/[slug]/_actions/undoAutoPublish.ts:74-81` covers only success/expired/consumed/not_found and would return `undefined`): map `finalize_owned` → the action's existing `infra_error`-shaped retry outcome (transient, retryable — honest copy for the ~one-task window; the whole action dies in Task 8). Extend `tests/app/admin/undo-auto-publish-action.test.ts` with that case in Step 1.
- Consumes: `readFinalizeOwnershipGuard_unlocked` — widen its tx param from `LockedShowTx<SyncPipelineTx>` to `LockedShowTx<{ queryOne<T>(sql: string, params: unknown[]): Promise<T> }>` (both `SyncPipelineTx` and `UnpublishShowTx` satisfy it; `PostgresUnpublishTx.queryOne` at `unpublishShow.ts:84-86`).

- [ ] **Step 1: Failing tests.** (a) In the engine unit tests: emailed-link consume on a NON-finalize-owned show still succeeds via a fake whose `queryOne` returns `{first_seen_owned:false, existing_show_owned:false}` (pins R8: no admin-RPC dependency); finalize-owned fake (`existing_show_owned:true`) → `{outcome:"finalize_owned", status:409}` AND `unpublishAndConsumeUnpublishToken` never called AND token untouched. (b) Parity rewrite:

```ts
// tests/sync/unpublishArchiveParity.test.ts → token Unpublish ↔ admin unpublish_show parity
it("token Unpublish reaches the same UNPUBLISHED end-state as admin unpublish_show", async () => {
  const a = await seedAutoPublishedShowWithUnpublishToken({ withScratch: true }); // RPC path
  const b = await seedAutoPublishedShowWithUnpublishToken({ withScratch: true }); // token path
  await asAdminRpc("unpublish_show", { p_show_id: a.showId });
  const res = await unpublishShowViaEmailedLink({ slug: b.slug, token: b.unpublishToken, r: bindingFor(b) });
  expect(res.outcome).toBe("success");
  // Snapshot compares: published=false, token pair null, archived=false, archived_at null,
  // picker_epoch UNbumped, share_token UNrotated, scratch counts intact, SHOW_UNPUBLISHED alert present.
  expect(await unpublishedStateSnapshot(b)).toEqual(await unpublishedStateSnapshot(a));
});
```

Add `unpublishedStateSnapshot` to `tests/db/_b2Helpers.ts` (mirror `archivedStateSnapshot:254` but asserting the D1 negative set). For `bindingFor`, reuse the r-derivation already used by `tests/sync/unpublishShowViaEmailedLink.concurrency.test.ts` (`mintIdFor` + binding builder from `lib/sync/unpublishBinding.ts`). Add a second parity case: live+finalize-owned seed → RPC rejects `FINALIZE_OWNED_SHOW` and emailed path returns `finalize_owned` with token still present. (c) Public-surface cases (from folded Task 5): `confirmUnpublishAction` returns `{status:"busy"}` for `finalize_owned`; `ConfirmUnpublishForm` renders `BUSY_HEADING`+`BUSY_BODY` (query scoped inside the form's own container testid); route returns 409 (not the 404 fallthrough) with token surviving (realdb re-read).
- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/sync/unpublishShow.test.ts tests/sync/unpublishArchiveParity.test.ts tests/show/unpublishConfirmAction.test.ts tests/api/show-unpublish-route.test.ts tests/app/admin/undo-auto-publish-action.test.ts` (each newly-written case red).
- [ ] **Step 3: Implement.** In `lib/sync/unpublishShow.ts`: (a) add the union member; (b) rename + soften the mutation:

```ts
async unpublishAndConsumeUnpublishToken(showId: string, token: string): Promise<boolean> {
  // Pure unpublish (spec D1): NO archive, NO share-token rotation, NO scratch deletes,
  // NO picker_epoch bump. Consume guard preserved.
  const row = await this.one<{ id: string }>(
    `
      update public.shows
         set published = false,
             unpublish_token = null,
             unpublish_token_expires_at = null
       where id = $1::uuid
         and unpublish_token = $2::uuid
       returning id
    `,
    [showId, token],
  );
  return row !== null;
}
```

(c) in `compareExpireConsume_lockHeld`, after the expiry branch and before the consume:

```ts
if (await readFinalizeOwnershipGuard_unlocked(tx, show.driveFileId)) {
  return { outcome: "finalize_owned", status: 409, showId: show.id };
}
```

(import from `@/lib/sync/runManualSyncForShow`; widen that function's tx param as noted in Interfaces). Update interface member name + all fakes.
- [ ] **Step 4: Verify pass** — engine + concurrency + parity + tripwire + `tests/show/unpublishConfirmAction.test.ts` + `tests/api/show-unpublish-route*.test.ts` + `tests/app/admin/undo-auto-publish-action.test.ts`, run individually.
- [ ] **Step 5: Commit (ONE commit — engine + every consumer)** — `feat(sync): emailed undo becomes pure unpublish; finalize-owned refusal through confirm page + API`

---

### Task 5: (folded into Task 4 — plan R4)

The `finalize_owned` public-surface mappings ship in Task 4's single commit; no separate task remains.

---

### Task 6: §12.4 lockstep — copy rewrites + new `CREW_SHOW_PAUSED`

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (rows `:2862` SHOW_FIRST_PUBLISHED, `:2875` SHOW_UNPUBLISHED, `:2877` UNPUBLISH_TOKEN_EXPIRED, `:2929` FINALIZE_OWNED_SHOW, `:3060` SHOW_AWAITING_PUBLISH_APPROVAL; context blocks `:3085`, `:3132`, `:3144`, `:3146` + FINALIZE_OWNED context; NEW row for CREW_SHOW_PAUSED near `:3038`) — **hand-edit, never prettier**
- Modify: `lib/messages/catalog.ts` (same codes; NEW `CREW_SHOW_PAUSED` row modeled on `CREW_LINK_UNAVAILABLE:2746-2756`)
- Modify: `scripts/extract-spec-codes.ts:73-81` — DELETE the `SHOW_UNPUBLISHED` entry from `M115_SPEC_CODE_OVERRIDES` (the override is applied AFTER spec parsing at `:377-381` and would pin the stale archive-era prose, failing x1 against the rewritten catalog row)
- Regen: `pnpm gen:spec-codes`, `pnpm gen:internal-code-enums`
- Test: `pnpm test:audit:x1-catalog-parity`, `pnpm test:audit:x2-no-raw-codes`, `pnpm vitest run tests/help/errors-grouping.test.tsx` (if CREW-prefixed codes land in "Other", add `"CREW"` to the sign-in family's `prefixes` in `app/help/errors/_families.ts`)

**Interfaces:** Produces `MessageCode` `"CREW_SHOW_PAUSED"` consumed by Task 7. Exact copy (single source; spec row cells must equal catalog fields — that IS the x1 contract):

| Code | dougFacing | crewFacing | followUp |
|---|---|---|---|
| SHOW_FIRST_PUBLISHED | "_\<sheet-name\>_ is now live for crew at its share-token URL. _\<crew-count\>_ crew, _\<show-date\>_. **Made a mistake?** Flip the Published toggle off on the show's page — crew can't open the show until you turn it back on. When email is set up, the published notice also carries a 24-hour undo link." | — | — |
| SHOW_UNPUBLISHED | "_\<sheet-name\>_ has been unpublished. Its crew link is paused — crew who open it see a 'not available right now' page with no show details. Turn Published back on from the show's page when you're ready." | — | "Doug → republish from the show's page when ready" |
| UNPUBLISH_TOKEN_EXPIRED | "This unpublish link expired. Links stay valid for 24 hours; to take this show offline now, flip the Published toggle off on the show's page." | — | "Doug → toggle Published off from the show's page" |
| FINALIZE_OWNED_SHOW | "This show is busy with a setup-wizard publish or a staged-changes finalize. Wait for it to finish, then try again." | — | "Doug → wait for the finalize to complete" |
| CREW_SHOW_PAUSED (NEW) | — | "This show isn't available right now. Check back soon — if you're expecting it, text Doug." | "Crew → check back later" |

helpfulContext/longExplanation rewrites follow the same semantics (no archive framing; no "stops resolving"; FINALIZE_OWNED covers BOTH finalize shapes and drops the `published = false` claim; SHOW_AWAITING_PUBLISH_APPROVAL helpfulContext gains "or flip Published on from the show's page"). UNPUBLISH_TOKEN_CONSUMED verified — no archive implication, unchanged. CREW_SHOW_PAUSED master-spec row trigger text: "crew share-token URL opened while the show is unpublished (valid slug+token, `published=false`, not archived). Renders under HTTP 200 with zero show data on the crew route's ShowUnavailable surface; archived/unresolved links keep the 404 CREW_LINK_UNAVAILABLE boundary."

- [ ] **Step 1: Failing gate** — add `CREW_SHOW_PAUSED` to `catalog.ts` FIRST, run `pnpm test:audit:x1-catalog-parity` → FAIL (spec row missing).
- [ ] **Step 2: Edit the master spec rows + context blocks** (hand-edit; verify with `git diff --stat` that ONLY intended lines moved).
- [ ] **Step 3: Regen + apply catalog rewrites** — `pnpm gen:spec-codes && pnpm gen:internal-code-enums`, rewrite the five catalog rows.
- [ ] **Step 4: Verify pass** — x1, x2, errors-grouping, `pnpm vitest run tests/messages` (catalog shape suites).
- [ ] **Step 5: Commit (ONE commit for the whole lockstep)** — `feat(messages): published-toggle copy model + CREW_SHOW_PAUSED`

---

### Task 7: Crew "unavailable" page (HTTP 200, zero show data)

**Files:**
- Create: `app/show/[slug]/[shareToken]/ShowUnavailable.tsx`
- Modify: `app/show/[slug]/[shareToken]/page.tsx:94-95` (`unpublished` case renders instead of `notFound()`)
- Test: `tests/show/unpublishRoutePrecedence.test.ts` (update the unpublished expectation), crew-route render test alongside existing route tests, `tests/api/show-version.test.ts` (add: unpublished crew viewer → 410)

**Interfaces:** Consumes `CREW_SHOW_PAUSED` (Task 6). Component (Server Component; NO show props — that is the leak-minimization mechanism, spec §3.5):

```tsx
import { messageFor } from "@/lib/messages/lookup";

export function ShowUnavailable() {
  const body = messageFor("CREW_SHOW_PAUSED").crewFacing;
  return (
    <main
      data-testid="crew-show-paused-root"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      <span
        data-testid="crew-show-paused-brand-strip"
        className="text-xs font-bold uppercase tracking-eyebrow-strong text-accent-on-bg"
      >
        FXAV
      </span>
      <h1 className="mt-2 text-2xl font-bold text-text-strong">This show isn&rsquo;t available right now</h1>
      <p data-testid="crew-show-paused-body" className="mt-4 text-base text-text-subtle">
        {body}
      </p>
    </main>
  );
}
```

Page dispatch: `case "unpublished": return <ShowUnavailable />;` (replace `notFound()`; `archived` and `show_unavailable` keep `notFound()`).

- [ ] **Step 1: Failing tests** — (a) unpublished + valid token → rendered output contains `CREW_SHOW_PAUSED` crewFacing text AND does NOT contain the seeded show title (derive the title string from the fixture); (b) archived → still `notFound()`; (c) version route: unpublished show + crew picker cookie → 410 (mirror the `session_mismatch` case at `tests/api/show-version.test.ts:111-123`). The bridge's `auth_denied → router.refresh()` behavior (`ShowRealtimeBridge.tsx:305-309`) is already pinned by existing bridge tests — verify coverage exists and extend ONLY if the 410 shape is missing.
- [ ] **Step 2: Verify fail.** — [ ] **Step 3: Implement** (code above). — [ ] **Step 4: Verify pass** + `pnpm tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(crew-page): unavailable page for unpublished shows (CREW_SHOW_PAUSED)`

---

### Task 8: Admin UI — `PublishedToggle` + undo-surface removals

**Files:**
- Create: `components/admin/PublishedToggle.tsx`
- Modify: `app/admin/show/[slug]/page.tsx` — (1) widen `finalizeOwned` computation gate `:351` from `if (!published && !archived)` to `if (!archived)` and update its comment; (2) mount toggle at top of Share & access section (after the intro `<p>`, `:667`); (3) Held lifecycle section `:528-531`: drop `PublishShowButton`, repoint `held-disclosure` copy to "Held — not published. Turn on Published in Share &amp; access to make it live."; (4) delete footer undo block `:855-861` + `undoWindowOpen` computation `:338-340`; (5) drop `undoWindowOpen`/`undoAutoPublishAction` props from `PerShowAlertSection` usage `:480-489`
- Modify: `components/admin/PerShowAlertSection.tsx` (remove props `:64-65,166-167`, import `:21`, render block `:300-303`)
- Delete: `components/admin/UndoAutoPublishButton.tsx`, `app/admin/show/[slug]/_actions/undoAutoPublish.ts` (+ barrel export), `lib/sync/unpublishShow.ts` plain legs (`unpublishShow` `:367-384`, `unpublishShow_unlocked` `:271-290`, `readUnpublishTokenForSlug` `:341-352`), tests `tests/app/admin/undo-auto-publish-action.test.ts`, `tests/components/admin/UndoAutoPublishButton.test.tsx`, `tests/components/admin/undo-auto-publish-alert-row.test.tsx`, `tests/components/admin/undo-auto-publish-affordances.test.tsx`
- Modify: `tests/sync/_advisoryLockSingleHolderContract.test.ts` (remove the plain-`unpublishShow` holder row; keep `unpublishShowViaEmailedLink`), `tests/components/admin/transitionAudit.test.tsx` (in the `SERVER_RENDERED`/scanned file registry `:32-40`: REMOVE the `components/admin/UndoAutoPublishButton.tsx` row — the file is deleted and the registry `readFileSync`s every entry — and ADD `components/admin/PublishedToggle.tsx`), `tests/e2e/admin-lifecycle-transitions.spec.ts:55` surface registry (keep `PublishShowButton.tsx`, add `PublishedToggle.tsx`)
- Test: `tests/components/admin/PublishedToggle.test.tsx` (new), `tests/components/admin/per-show-lifecycle.test.tsx` (update Held expectations + ADD the R3 page-level case: published + `shows_pending_changes` finalize-owned → toggle rendered ON-disabled)

**Interfaces:**
- Produces `PublishedToggleProps`:

```ts
export type PublishedToggleProps = {
  slug: string;
  published: boolean;
  finalizeOwned: boolean;
  /** Pre-bound (to this show's slug) setShowPublishedAction. */
  setPublished: (next: boolean) => Promise<LifecycleResult>;
};
```

- Component behavior (React-19 dispatch safety per `AutoPublishToggle.tsx:21-27`: the switch is the form SUBMITTER, disables ONLY on `useFormStatus().pending` or `finalizeOwned` — never synchronously in its own onClick):

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

type LifecycleResult = { ok: true } | { ok: false; code: string };
const KNOWN_REFUSAL_CODES = new Set([
  "PUBLISH_BLOCKED_PENDING_REVIEW", "SHOW_ARCHIVED_IMMUTABLE", "FINALIZE_OWNED_SHOW",
]);

export function PublishedToggle({ slug, published, finalizeOwned, setPublished }: PublishedToggleProps) {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [genericError, setGenericError] = useState(false);
  // Mode boundaries (spec §3.3): archived pages never mount this component.
  const subline = finalizeOwned
    ? published
      ? "Changes are being finalized — the switch unlocks when they commit."
      : "A publish is finishing — the switch unlocks when it's done."
    : published
      ? "Crew link is active."
      : "Crew link is off — nobody can open this show.";
  return (
    <div data-testid="published-toggle-row" className="flex items-start justify-between gap-3 rounded-sm border border-border bg-surface-sunken p-tile-pad">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-text-strong">Published</h3>
        <p data-testid="published-toggle-subline" className="mt-1 max-w-prose text-sm text-text-subtle">{subline}</p>
        {errorCode ? (
          <div role="alert" data-testid="published-toggle-error" className="mt-2 rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text">
            <ErrorExplainer code={errorCode} surface="admin" />
            <HelpAffordance code={errorCode} />
          </div>
        ) : null}
        {genericError ? (
          <p role="alert" data-testid="published-toggle-retry" className="mt-2 rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text">
            That didn&rsquo;t go through. Refresh and try again.
          </p>
        ) : null}
      </div>
      <form
        action={async () => {
          setErrorCode(null); setGenericError(false);
          const result = await setPublished(!published);
          if (result.ok) { router.refresh(); return; }
          if (KNOWN_REFUSAL_CODES.has(result.code)) { setErrorCode(result.code); router.refresh(); }
          else setGenericError(true);
        }}
        className="shrink-0 self-center"
      >
        <SwitchButton on={published} disabled={finalizeOwned} />
      </form>
    </div>
  );
}
```

`SwitchButton` is copied from `AutoPublishToggle.tsx:112-138` with `aria-label="Published"` and `data-testid="published-toggle"`. Page mounts it inside the Share & access `<section>` right after the intro paragraph, gated `{!archived ? <PublishedToggle slug={show.slug} published={published} finalizeOwned={finalizeOwned} setPublished={setShowPublishedAction.bind(null, show.slug)} /> : null}` (the section itself renders for archived shows; only the toggle hides).

- [ ] **Step 1: Failing component tests** — five mode-boundary states (spec §3.3 table: ON-enabled/OFF-enabled/OFF-disabled/ON-disabled sublines + disabled attr; archived = not-mounted is asserted at the page level); pending-disable; blocked outcome renders `messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing` INSIDE `[data-testid="published-toggle-row"]` (clone tree, strip `PerShowAlertSection` siblings first — anti-tautology); success → `router.refresh` called.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement component + all page/PerShowAlertSection modifications + deletions listed in Files.** `rg -n "undoAutoPublish|UndoAutoPublishButton|readUnpublishTokenForSlug" app components lib` must return ZERO product-code hits afterward.
- [ ] **Step 4: Verify pass** — `pnpm vitest run tests/components/admin tests/app/admin tests/sync/_advisoryLockSingleHolderContract.test.ts tests/show tests/showLifecycle` + `pnpm tsc --noEmit` + `pnpm lint`.
- [ ] **Step 5: Commit** — `feat(admin): Published toggle replaces undo auto-publish + Held publish button`

---

### Task 9: Copy sweep (broad — spec §3.7)

**Files:**
- Modify: `components/admin/StagedReviewCard.tsx:140` → `"New show, parsed clean. Apply to publish it — you can turn it off anytime with the show's Published toggle."` (+ its test assertion; find via `rg -l "undo within 24 hours" tests/`)
- Modify: `components/admin/settings/AutoPublishToggle.tsx:68-71` description → `"Publish brand-new sheets automatically when they parse with no warnings. You can turn any show off later with its Published toggle."`
- Modify: `lib/notify/templates/autoPublishUndo.ts` body copy (describe pure unpublish: link pauses the show, same crew link resumes on republish) + its tests (`tests/notify/deliver-auto-publish-undo*.test.ts` assert copy fragments)
- Modify: `app/show/[slug]/unpublish/copy.ts` — `NEUTRAL_BODY` ("…you can always archive it from the admin" → "…you can always turn it off from its page in the admin"), `CONFIRM_CONSEQUENCE` → `"Crew links pause until you turn Published back on from the admin."`, `SUCCESS_BODY_AFTER_TITLE` republish framing; sync `lib/sync/unpublishConfirmPage.ts` if it restates any of these
- Modify: 4 help pages `app/help/admin/{per-show-panel,review-queues,dashboard,settings}/page.mdx` + `app/help/_affordanceMatrix.ts` — undo-auto-publish affordance entries become Published-toggle entries

- [ ] **Step 1: Write the gate first** — run and record current hits: `rg -in "undo auto-publish|undo within|you can still undo" app components lib docs --glob '!docs/superpowers/**'`.
- [ ] **Step 2: Apply all copy edits.** Mentions of "24 hours" may survive ONLY where describing the emailed link itself.
- [ ] **Step 3: Verify** — the Step-1 `rg` returns zero stale hits; affected test suites pass (`pnpm vitest run tests/notify tests/components/admin/StagedReviewCard* tests/show tests/help`).
- [ ] **Step 4: Commit** — `fix(admin): repoint undo-window copy at the Published toggle`

---

### Task 10: E2E round-trip (real browser)

**Files:**
- Modify: `tests/e2e/admin-lifecycle-transitions.spec.ts` (reuse its seeding/login harness)

- [ ] **Step 1: Add the spec** — seed a live show; admin page → flip `[data-testid="published-toggle"]` OFF → open the crew share URL in a fresh context → assert `[data-testid="crew-show-paused-root"]` visible AND the show title absent from the crew DOM (title string read from the seed, not hardcoded; assert on the CREW page's DOM only — anti-tautology) → flip ON → same URL renders the crew page (title visible). Assert the admin pill reads "Held — not published" while off.
- [ ] **Step 2: Run** — `pnpm playwright test tests/e2e/admin-lifecycle-transitions.spec.ts` → PASS (note: this e2e project is NOT part of PR CI; run locally).
- [ ] **Step 3: Commit** — `test(e2e): published toggle round-trip through the crew URL`

---

### Task 11: Ops + close-out gates

- [ ] **Step 1: Schema manifest** — `pnpm gen:schema-manifest`; commit the regenerated `supabase/__generated__/schema-manifest.json` if it changed (RPC-only migration may be a no-op — run regardless).
- [ ] **Step 2: Validation project apply** — from the MAIN checkout's `.env.local` credentials (memory: validation creds live there): `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260701000000_published_toggle_unpublish_show.sql` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. This must land before the `validation-schema-parity` + PostgREST CI gates run.
- [ ] **Step 3: Local gate battery** — `pnpm tsc --noEmit && pnpm lint && prettier --check .` (prettier scope excludes the master spec by repo config — verify no master-spec reformat in the diff); unit suites per-directory; `.db` suites in isolation; x1/x2 audits.
- [ ] **Step 4: Impeccable dual-gate (invariant 8)** — run `/impeccable critique` AND `/impeccable audit` on the UI diff (PublishedToggle, page.tsx, PerShowAlertSection, ShowUnavailable, ConfirmUnpublishForm); fix or DEFERRED.md every HIGH/CRITICAL. Help screenshots: if `/admin/show` screenshots drift, regenerate from the CI artifact ONLY (never local arm64 bytes).
- [ ] **Step 5: Commit any residue** — `chore(infra): schema manifest + validation apply for unpublish_show`

## Fix-round regression budget

Any adversarial/review fix touching the finalize-owned vector re-runs: `pnpm vitest run tests/db/unpublish_show_rpc.test.ts tests/sync/unpublishArchiveParity.test.ts tests/sync/unpublishShow.test.ts` and re-greps the vector (`rg -n "readfinalizeowned_b2|readFinalizeOwnershipGuard" lib app supabase/migrations`) before closing the round.
