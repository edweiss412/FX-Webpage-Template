# Published toggle — persistent publish control on the admin show page

**Date:** 2026-07-01 · **Status:** Draft (autonomous-ship pipeline) · **Mode:** brainstormed with user; all Resolved Decisions below are user-ratified.

Replaces the window-gated "Undo auto-publish" actions and the Held-show Publish button with one persistent **Published** toggle in the Share & access panel of `/admin/show/[slug]`. Toggle-off is a *pure unpublish* (crew link deactivates, nothing else changes); toggle-on republishes through the existing gates. Crew hitting the share URL of an unpublished show see a minimal "not available right now" page instead of a 404.

---

## 1. Resolved decisions (user-ratified 2026-07-01)

| # | Decision |
|---|----------|
| D1 | Toggle-off = **pure unpublish**: only `shows.published=false` (plus clearing the pending undo-token pair, §3.1). Share token NOT rotated; pending_syncs/pending_ingestions/deferred_ingestions NOT deleted; `picker_epoch` NOT bumped; show keeps syncing; archive stays a separate action. |
| D2 | **One toggle everywhere**: it replaces both the in-app Undo auto-publish affordances and the Held-show Publish button. Disabled with explanation while finalize-owned ("Publishing…"); hidden on archived shows. |
| D3 | Placement: **top of the Share & access panel**, modeled on the `AutoPublishToggle` form-submitter switch (`components/admin/settings/AutoPublishToggle.tsx:48-138`). The title status pill (`app/admin/show/[slug]/page.tsx:393-399`) stays read-only. |
| D4 | The **24 h emailed undo link is KEPT** (single-use, recipient-bound, M12.13 contract intact) but its effect becomes pure unpublish + consume — no archive, no share-token rotation, no scratch deletes. The in-app `UndoAutoPublishButton` and `undoAutoPublishAction` are deleted. |
| D5 | Crew hitting the share URL of an **unpublished** show get a minimal friendly page ("This show isn't available right now") with NO show data. Archived and never-resolved links still 404. |
| D6 | Toggle flips **instantly** — no confirm dialog in either direction. Flipping back is the undo. |

## 2. Current state (live-code citations)

- `shows.published boolean not null default true`, `shows.archived boolean not null default false` — `supabase/migrations/20260501000000_initial_public_schema.sql:25-26`. Two independent booleans; no status enum.
- Undo-token pair: `unpublish_token uuid` + `unpublish_token_expires_at timestamptz`, CHECK `shows_unpublish_token_pair_check` (both null or both non-null) — `supabase/migrations/20260512082710_add_show_unpublish_token.sql`.
- Lifecycle RPCs — `supabase/migrations/20260601000000_b2_show_lifecycle.sql`: `readfinalizeowned_b2` (:13), `_archive_show_core` (:37), `archive_show` (:58, in-RPC `pg_advisory_xact_lock(hashtext('show:'||v_drive))` at :70, post-lock re-read + idempotent early-return), `unarchive_show` (:84, lock at :93), `_publish_show_core` (:115 — idempotent `if v_pub then return`, `SHOW_ARCHIVED_IMMUTABLE`, `FINALIZE_OWNED_SHOW`, `PUBLISH_BLOCKED_PENDING_REVIEW` on `requires_resync` or live non-wizard scratch rows, then `published=true` + `publish_show_invalidation`), `publish_show` (:134, lock at :141). All `revoke all` + `grant execute … to authenticated`, gated on `is_admin()`.
- JS lifecycle callers: `lib/showLifecycle/{publishShow,archiveShow,unarchiveShow}.ts` through the single chokepoint `callLifecycleRpc` (`lib/showLifecycle/_shared.ts:51-64`); RAISE-message→typed-code map `KNOWN` (`_shared.ts:14-19`); callers pinned by `tests/showLifecycle/callers.test.ts`.
- Admin actions: `app/admin/show/[slug]/_actions/publish.ts` (`publishShowAction` — requireAdmin → `resolveShowBySlug` → `publishShow(id)` → `revalidateShow` + `revalidatePath` ×2), barrel `_actions/index.ts` also exporting `undoAutoPublishAction`.
- In-app undo: `app/admin/show/[slug]/_actions/undoAutoPublish.ts` (reads stored token via `readUnpublishTokenForSlug`, `lib/sync/unpublishShow.ts:341-352`, then `unpublishShow({slug, token})`); button island `components/admin/UndoAutoPublishButton.tsx`; rendered in the sync footer iff `undoWindowOpen && published && !archived` (`page.tsx:855-861`, window computed at :340) and on `SHOW_FIRST_PUBLISHED` alert rows via `PerShowAlertSection` props `undoWindowOpen` / `undoAutoPublishAction` (`page.tsx:480-489`).
- Emailed-link flow (M12.13, KEPT): confirm page `app/show/[slug]/unpublish/{page.tsx,actions.ts,ConfirmUnpublishForm.tsx,copy.ts,blocks.tsx}`, API `app/api/show/[slug]/unpublish/route.ts`, engine `lib/sync/unpublishShow.ts` — JS-side lock holder via `withShowLock` (:373-380, :400-409; single-holder, no RPC), shared `compareExpireConsume_lockHeld` (:223-263), mutation `archiveAndConsumeUnpublishToken` (:146-190) which today mirrors the FULL `archive_show` set inline (archived_at, picker_epoch, share-token rotation, scratch deletes) with the `and unpublish_token = $2` consume guard. Parity pinned by `tests/sync/unpublishArchiveParity.test.ts`.
- Held-show publish UI: lifecycle section (`page.tsx:498-536`) renders `held-disclosure` + `PublishShowButton` + `ArchiveShowButton` when `isHeld = !published && !archived && !finalizeOwned` (:362).
- Crew gate: `lib/auth/picker/resolveShowPageAccess.ts` — `resolve_show_by_slug_and_token` RPC (:162), `archived → {kind:"archived"}` (:175), admin bypass (:178-180), `!published → {kind:"unpublished"}` (:182). Crew page dispatch: `app/show/[slug]/[shareToken]/page.tsx:88-103` — `archived`/`unpublished`/`show_unavailable` all `notFound()`; boundary `not-found.tsx` renders `CREW_LINK_UNAVAILABLE` via `messageFor`. Defense-in-depth: `lib/data/getShowForViewer.ts:319` throws for non-admin when `published !== true`.
- Auto-publish mint: `lib/sync/runScheduledCronSync.ts:2601-2605` (cron ON path) and `lib/sync/applyStaged.ts:1247-1256` (staged path) mint the token + 24 h expiry; `SHOW_FIRST_PUBLISHED` emitted via the shared first-published tail (`runScheduledCronSync.ts:1855-1880`). Undo email template: `lib/notify/templates/autoPublishUndo.ts`.
- §12.4 catalog rows (`lib/messages/catalog.ts`): `SHOW_FIRST_PUBLISHED` (:948), `SHOW_UNPUBLISHED` (:961), `UNPUBLISH_TOKEN_CONSUMED` (:974), `UNPUBLISH_TOKEN_EXPIRED` (:987), `PUBLISH_BLOCKED_PENDING_REVIEW` (:1612), `SHOW_AWAITING_PUBLISH_APPROVAL` (:1625).
- Cache/realtime: `revalidateShow` (`lib/data/showCacheTag.ts`), DB-side `publish_show_invalidation`, crew freshness via `components/realtime/ShowRealtimeBridge.tsx` + `app/api/show/[slug]/version/route.ts`.

## 3. What ships

### 3.1 New RPC: `unpublish_show` (one migration, no new columns)

New migration `supabase/migrations/<ts>_published_toggle_unpublish_show.sql` mirroring the `archive_show` shape exactly (same file even documents the pattern):

- `_unpublish_show_core(p_show_id uuid)` — lockless, private (`revoke all` from everyone); declares its own locals (R2 finding — wrapper locals are not visible here):
  ```sql
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
  end
  ```
  Explicitly ABSENT (D1): `archived`/`archived_at`, `picker_epoch` bump, `show_share_tokens` rotation, scratch-table deletes.
- `unpublish_show(p_show_id uuid)` — admin-gated, self-locking: `is_admin()` gate → read `drive_file_id` (immutable, safe pre-lock) → `P0002 ADMIN_LINK_SHOW_NOT_FOUND` when missing → `pg_advisory_xact_lock(hashtext('show:'||v_drive))` → **post-lock re-read** of `archived`/`published` → `archived` raises `P0001 SHOW_ARCHIVED_IMMUTABLE` → already-unpublished returns (idempotent no-op, no alert spam) → **finalize-owned refusal**: `if public.readfinalizeowned_b2(p_show_id) then raise P0001 FINALIZE_OWNED_SHOW` (R2 finding — the predicate's `shows_pending_changes` branch, `20260601000000_b2_show_lifecycle.sql:28-34`, is NOT constrained to unpublished shows, so a live show can be finalize-owned mid-pending-changes-finalize; matches `archive_show:75-77`) → `_unpublish_show_core`. `revoke all` + `grant execute to authenticated`.
- Clearing the token pair satisfies `shows_unpublish_token_pair_check` (both null) and kills any outstanding emailed undo link the moment an admin manually unpublishes — a later manual re-publish does NOT re-mint a token (minting stays exclusive to the auto-publish tails, §2).
- Ordering note: the idempotent already-unpublished early-return sits BEFORE the finalize-owned refusal (matching `archive_show`'s idempotency-first shape) — a finalize-owned Held show no-ops rather than erroring.

**Missed-broadcast durability (R6, corrected R9):** the primary durable path for a CREW session already exists: the version route authorizes through `resolvePickerSelection` BEFORE reading the token, and an unpublished show resolves `show_unavailable` → HTTP 410 (`app/api/show/[slug]/version/route.ts:89-94`); the bridge maps 401/403/410 to `auth_denied` (`ShowRealtimeBridge.tsx:151-152`) and FORCES `router.refresh()` (`:305-309`). So a crew page that misses the broadcast still lands on the unavailable page at the next catch-up (reconnect/SSR-gap), with no schema change required. Belt-and-suspenders in the SAME migration: redefine `viewer_version_token` (`20260523000006_viewer_version_token_rewrite.sql:5-23` — built only from `last_synced_at` / crew `last_changed_at` / `picker_epoch(_bumped_at)`) to append `|| ':' || coalesce((select published::text from public.shows where id = p_show_id), 'false')`, covering equality-only consumers that DO receive a token across a publish flip (admin-session viewers, the SSR fence in `lib/data/getShowForViewer.ts:750-766`). Consumers compare tokens for equality only (`ShowRealtimeBridge.tsx:648`), so appending a component is shape-safe.

**DDL idempotency:** `create or replace function` throughout; migration is safe to re-apply. Post-migration checklist (AGENTS.md): local apply + tests → `pnpm gen:schema-manifest` (commit if the manifest changes — RPC-only migrations may be a manifest no-op; run it regardless) → surgical apply to validation project (`supabase db query --linked` or psql `$TEST_DATABASE_URL`) + `notify pgrst, 'reload schema'`.

### 3.2 Lifecycle caller + server action

- New `lib/showLifecycle/unpublishShow.ts` exporting `unpublishShow(showId, deps?)` via `callLifecycleRpc(rpc, "unpublish_show", …)` — identical shape to `lib/showLifecycle/publishShow.ts`. (Deliberate name collision with `lib/sync/unpublishShow.ts`'s token-flow export; the modules serve different paths and imports disambiguate. Register in `tests/showLifecycle/callers.test.ts`.)
- New server action `app/admin/show/[slug]/_actions/setPublished.ts` exporting `setShowPublishedAction(slug: string, next: boolean): Promise<LifecycleResult>`: `requireAdmin()` → `resolveShowBySlug(slug)` (infra_error / SHOW_NOT_FOUND exactly as `publish.ts`) → `next ? publishShow(id) : unpublishShow(id)` → on `ok`: `revalidateShow(id)` + `revalidatePath('/admin/show/${slug}')` + `revalidatePath('/admin')`. Exported from the `_actions/index.ts` barrel.
- **Deleted:** `_actions/undoAutoPublish.ts` (`undoAutoPublishAction` + its barrel export). With it die its exclusive engine legs in `lib/sync/unpublishShow.ts`: `readUnpublishTokenForSlug` (:341-352), plain `unpublishShow` (:367-384) and `unpublishShow_unlocked` (:271-290) — verified sole-caller via grep; only the `unpublishShowViaEmailedLink` pair (called by `app/show/[slug]/unpublish/actions.ts:52` and `app/api/show/[slug]/unpublish/route.ts:41`) survives. `UNPUBLISH_TOKEN_CONSUMED` stays cataloged (the emailed path still produces the outcome internally and maps it to the neutral page, existing behavior `unpublishShow.ts:293-307`); its only in-app renderer disappears.
- **Kept (R1 finding):** `_actions/publish.ts` (`publishShowAction`) and `components/admin/PublishShowButton.tsx` remain — they are the per-row publish affordance on the Unpublished queue page (`app/admin/unpublished/page.tsx:23-24,79-80`), which is OUT of scope (D2 replaces the button on the SHOW page only). Duplication is two thin callers of the same `publish_show` RPC; acceptable.

### 3.3 Admin UI (invariant 8: impeccable dual-gate; Opus-only)

New client island `components/admin/PublishedToggle.tsx`, modeled line-for-line on the `AutoPublishToggle` React-19 dispatch pattern (switch is the form SUBMITTER; disables only on `useFormStatus().pending`; hidden-input-free — the bound action receives `next` as an argument closure like `AutoPublishToggle`'s `setAutoPublish(!on)`; `router.refresh()` on `ok`).

Props: `{ slug, published: boolean, finalizeOwned: boolean, setPublished: (next: boolean) => Promise<LifecycleResult> }`.

**Mode boundaries (explicit):**

| Page state | Toggle renders | Notes |
|---|---|---|
| Live (`published && !archived && !finalizeOwned`) | ON, enabled | Sub-line: "Crew link is active." |
| Held (`!published && !archived && !finalizeOwned`) | OFF, enabled | Sub-line: "Crew link is off — nobody can open this show." |
| Publishing… (`finalizeOwned && !published && !archived`) | OFF, **disabled** | Explainer: publish is finishing; the switch unlocks when it's done. |
| Live + finalize-owned (`finalizeOwned && published && !archived`) | ON, **disabled** | R2 finding: a pending-changes finalize can own a LIVE show. Explainer: changes are being finalized; the switch unlocks when it's done. |
| Archived | **Not rendered** | Archived surface keeps its existing disclosure + Unarchive (`page.tsx:498-527`). |

The disable condition is `finalizeOwned` alone — never `finalizeOwned && !published`.

**Guard conditions:** `published`/`finalizeOwned` are server-computed booleans (`page.tsx:331,350-360`) — never null/undefined at the callsite; the island takes plain booleans, no degraded read state exists (unlike `AutoPublishToggle`'s `infra_error` initial — the page 404s before rendering if the show read fails).

**Page-side computation change (R3):** `page.tsx:350-360` currently queries `readfinalizeowned_b2` ONLY when `!published && !archived` (its comment "a published row is never finalize-owned" is contradicted by the predicate's `shows_pending_changes` branch). The condition widens to `!archived` so a LIVE finalize-owned show reaches the ON-disabled row above. The existing fail-toward-false posture on RPC error stays — for a published show that yields a transiently-enabled toggle, and the RPC's hard `FINALIZE_OWNED_SHOW` refusal is the backstop (defense in depth, same posture as today's Held/Publishing… split). `isHeld` (:362) is unchanged by the widened query (`!published` still guards it).

**Failure rendering (invariant 5 — all copy via `messageFor`):** a non-`ok` action result renders inline below the switch: `PUBLISH_BLOCKED_PENDING_REVIEW` → its catalog `dougFacing` (the Re-sync CTA already lives in the same footer); `FINALIZE_OWNED_SHOW` / `SHOW_ARCHIVED_IMMUTABLE` (race with a concurrent finalize/archive) → their catalog copy + `router.refresh()`; `ADMIN_LINK_SHOW_NOT_FOUND` / `infra_error` → plain retry copy (mirror `UndoAutoPublishButton.tsx:93-102`'s uncataloged retry pattern).

**Placement:** top of the Share & access column (`page.tsx:659-672`), directly under the `<h2>`+intro, above `CurrentShareLinkPanel`. The section already renders in every non-archived state, so the toggle is reachable for Held shows.

**Removed from the page:** footer undo render + `undoWindowOpen` computation (`page.tsx:338-340,855-861`), `PerShowAlertSection`'s `undoWindowOpen`/`undoAutoPublishAction` props and alert-row undo wiring (`page.tsx:480-489`, `components/admin/PerShowAlertSection.tsx`), Held-section `PublishShowButton` (`page.tsx:528-531`; the `held-disclosure` copy repoints at the toggle: "Held — not published. Turn on Published in Share & access to make it live."). **Deleted components:** `UndoAutoPublishButton.tsx` only. `PublishShowButton.tsx` survives for `/admin/unpublished` (see §3.2) but loses its show-page callsite; the e2e lifecycle-surface registry (`tests/e2e/admin-lifecycle-transitions.spec.ts:55`) keeps its row and gains the toggle's. `ArchiveShowButton`, `UnarchiveShowButton`, Re-sync, rotate/reset all unchanged.

**Transition inventory** (5 render states; N·(N−1)/2 = 10 pairs — ALL instant, no animation; the switch keeps `AutoPublishToggle`'s built-in knob `transition-transform` only): every pair among {ON-enabled, OFF-enabled, OFF-disabled, ON-disabled, hidden} is an instant server re-render (`router.refresh` / navigation) — no pair animates. Compound: flipping the switch while an archive/finalize lands concurrently → the action returns the typed refusal, inline copy renders, `router.refresh()` reconciles. No `AnimatePresence` anywhere in scope; register the new conditionals in `tests/components/admin/transitionAudit.test.tsx`.

**Dimensional invariants:** none — the toggle row is auto-height in a flex column; no fixed-dimension parent (the two-col split's equal-height stretch at `page.tsx:539-545` is unaffected). No real-browser layout task required.

### 3.4 Emailed undo link (M12.13 surface, semantics softened)

`lib/sync/unpublishShow.ts` — `archiveAndConsumeUnpublishToken` (:146-190) is replaced by `unpublishAndConsumeUnpublishToken`: 
```sql
update public.shows
   set published = false, unpublish_token = null, unpublish_token_expires_at = null
 where id = $1::uuid and unpublish_token = $2::uuid
 returning id, drive_file_id
```
— consume guard preserved; the share-token rotation, scratch deletes, `archived`/`archived_at`/`picker_epoch` statements are removed. Everything else in the M12.13 contract is untouched: JS-side `withShowLock` single-holder topology, recipient binding + `FOR SHARE` admin read, neutral vs CONSUMED split, expiry clear, `SHOW_UNPUBLISHED` alert + `publish_show_invalidation` in `compareExpireConsume_lockHeld` (:252-260).

**Finalize-owned refusal on the emailed path (R3 — closes a PRE-EXISTING gap):** today's archive-mirror consume has NO finalize-owned check even though `archive_show` refuses it; the softened path gets the same guard as the new RPC. Inside the locked transaction, AFTER binding validation + token compare + expiry handling and BEFORE the consume UPDATE, the flow checks finalize ownership via the EXISTING JS-side lock-held predicate `readFinalizeOwnershipGuard_unlocked` (`lib/sync/runManualSyncForShow.ts:113-146`) called with the already-read `show.driveFileId` — NOT the `readfinalizeowned_b2` RPC (R8: the live redefinition `20260602000000_b2_r4_unarchive_held_and_finalize_admin_guard.sql` raises 42501 for non-admin callers, and this raw-postgres path carries no admin JWT). The JS predicate is the established lockstep mirror of the DB predicate (`20260601000000:10-12` comment) and needs only the `queryOne` seam `PostgresUnpublishTx` already implements (`unpublishShow.ts:84-86`); the plan may widen its tx parameter type structurally if needed. When true, return a new engine outcome `{ outcome: "finalize_owned", status: 409, showId }` — token NOT consumed, nothing mutated. The confirm page renders it as a new `busy` action state with uncataloged plain copy (`BUSY_HEADING`/`BUSY_BODY` ≈ "This show is being updated right now. Nothing has changed — try again in a few minutes.") following `copy.ts:20`'s existing `not-subject:M5-D8` waiver pattern for transient non-catalog copy; the API route maps it to HTTP 409.

**Finalize-owned × published-mutation matrix (vector closure — every path that can flip `shows.published`):**

| Path | Finalize-owned guard |
|---|---|
| `publish_show` RPC | refuses, existing (`20260601000000:123`) |
| `archive_show` RPC | refuses, existing (`:75-77`) |
| `unpublish_show` RPC (new) | refuses (§3.1) |
| Emailed-link consume (JS) | refuses via `readFinalizeOwnershipGuard_unlocked` JS mirror — NOT the admin-gated RPC (this section — NEW, was missing pre-feature) |
| `_archive_show_core` via token path | path deleted (the archive-mirror consume is replaced) |
| Auto-publish tails (cron first-seen / staged apply) | upstream-owned: only fire on wizard/cron flows that themselves own or exclude the finalize checkpoint — untouched |
| `unarchive_show` | DOES write `published = false` (archived→Held transition, `20260602000002_b2_r8_unarchive_returns_transition_flag.sql:36-39` — the live redefinition, NOT the older `20260601000000:84` body). No finalize-owned refusal needed because archived∧finalize-owned is structurally unreachable: `archive_show` refuses finalize-owned shows (`20260601000000:75-77`) and the finalize-CAS path refuses archived shows (WM-R9 guard, `app/api/admin/onboarding/finalize-cas/route.ts:397`, pinned by `tests/onboarding/finalizeCasArchivedGuard.db.test.ts`). Untouched by this feature; invariant already test-pinned |

**Lock-holder topology (invariant 2, declared here for the plan):** `hashtext('show:'||drive_file_id)` acquires at exactly one layer per path — admin toggle OFF → in-RPC (`unpublish_show`), admin toggle ON → in-RPC (`publish_show`, existing), emailed link → JS-side `withShowLock` (existing, mutation stays inline SQL — it does NOT call the new RPC, precisely so no second layer ever acquires). Register `unpublish_show` in `tests/sync/_advisoryLockSingleHolderContract.test.ts`. (`tests/auth/advisoryLockRpcDeadlock.test.ts` guards finalize-lock handlers — `tryFinalizeLock` call sites, `:291-319` — and is NOT in scope.)

**Parity contract:** `tests/sync/unpublishArchiveParity.test.ts` is rewritten as `unpublishParity`: token-consume path ↔ `unpublish_show` RPC reach the SAME end-state (published=false, token pair null, share_token UNrotated, picker_epoch UNbumped, scratch rows intact, archived untouched, SHOW_UNPUBLISHED alert present) — AND the same refusal: live+finalize-owned show → RPC raises `FINALIZE_OWNED_SHOW` / emailed path returns `finalize_owned` with token intact (R3).

**`finalize_owned` is a first-class public contract (R4)** — every layer names it explicitly; no default-case fallthrough:

| Layer | Change |
|---|---|
| Engine union | `UnpublishShowResult` (`lib/sync/unpublishShow.ts:42-46`) gains `{ outcome: "finalize_owned"; status: 409; showId: string }` |
| Confirm action | `app/show/[slug]/unpublish/actions.ts` switch gains an explicit `finalize_owned` case → new `{ status: "busy" }` member of `ConfirmUnpublishActionState` (`copy.ts:10-16`) |
| Confirm form | `ConfirmUnpublishForm.tsx` renders the `busy` state with `BUSY_HEADING`/`BUSY_BODY` |
| API route | `app/api/show/[slug]/unpublish/route.ts` maps `finalize_owned` → HTTP 409 with the busy body (today it collapses non-success/non-expired to 404 — that collapse must NOT swallow the new outcome) |
| Tests | engine (token intact, nothing mutated; PLUS a non-admin-connection success test — a valid emailed link consumes fine when NOT finalize-owned, proving no 42501 from the guard, R8), action (busy state returned), form (busy copy rendered), route (409 + token intact re-read) — `tests/show/unpublishConfirmAction.test.ts`, `tests/api/show-unpublish-route*.test.ts` extended |

The neutral-oracle rules are otherwise unchanged: `busy` renders only AFTER recipient binding + token compare succeed (same position as `expired`), so it discloses nothing to unbound holders — pre-binding failures stay neutral 404.

**Confirm-page copy** (`app/show/[slug]/unpublish/copy.ts`): `CONFIRM_CONSEQUENCE`, `NEUTRAL_BODY`, `SUCCESS_*` lines currently describe archive-flavored recovery ("archive it from the admin", "republish"); reword to toggle-flavored ("turn Published back on from the show's page"). Same for `lib/notify/templates/autoPublishUndo.ts` body copy and `lib/sync/unpublishConfirmPage.ts` strings if they restate the effect.

### 3.5 Crew "unavailable" page (D5)

- `app/show/[slug]/[shareToken]/page.tsx:94-95`: the `unpublished` case stops calling `notFound()` and renders a new server component `ShowUnavailable` (colocated `app/show/[slug]/[shareToken]/ShowUnavailable.tsx`), modeled on `not-found.tsx`'s structure (FXAV brand strip, heading, body) — served HTTP 200. It renders **no show data** (no title, no dates — the component takes no show props at all). `archived` (:88-92) and `show_unavailable` (:98-102) keep `notFound()`.
- New §12.4 code `CREW_SHOW_PAUSED` (crewFacing-only, modeled on `CREW_LINK_UNAVAILABLE`): crewFacing ≈ "This show isn't available right now. Check back soon — if you think this is a mistake, contact your show lead." Copy routes through `messageFor` (invariant 5).
- `resolveShowPageAccess` itself is unchanged — it already returns `{kind:"unpublished"}` only after the slug+token pair resolved (:162-171), so the page leaks "link is real" only to holders of a currently-valid share token (user-accepted, D5). `getShowForViewer.ts:319`'s defense-in-depth throw is unreachable from this render path (no viewer data is fetched) and stays.
- Freshness both directions: unpublish → `publish_show_invalidation` broadcasts (fast path) AND the version route's 410/`auth_denied` forced refresh (§3.1, R6/R9) guarantees missed-broadcast catch-up (durable path) → live crew sessions refresh into the unavailable page; republish → the bridge is NOT mounted on the unavailable page (it renders outside `_CrewShell`), so recovery is a manual reload — acceptable (D5's page says "check back soon"). No polling added (YAGNI).

### 3.6 §12.4 catalog changes — three-way lockstep ×2 gens

One commit carries: master-spec §12.4 prose edits (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — NEVER prettier this file) + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` rows. New code additionally: `pnpm gen:internal-code-enums` (x2 gate), `app/help/errors/_families.ts` family row, full-suite run.

| Code | Change |
|---|---|
| `SHOW_FIRST_PUBLISHED` (:948) | REWRITE — drop the entire 24 h/undo-window framing. New framing: live at its share-token URL; "Made a mistake? Flip the Published toggle off on the show's page — the crew link switches off until you turn it back on. When email is set up, the published notice also carries a 24-hour undo link." Placeholders `<sheet-name>`, `<crew-count>`, `<show-date>` retained (context is supplied by the existing emitter, `runScheduledCronSync.ts:1855-1880`). |
| `SHOW_UNPUBLISHED` (:961) | REWRITE — the show is NOT archived anymore, and the link does NOT stop resolving (R5): the crew link is paused/off — crew who open it see a "not available right now" page with no show details until Published is turned back on; the sheet is untouched and still syncing. Emitted by both the RPC (§3.1) and the emailed-link path (§3.4) — copy must fit both. |
| `UNPUBLISH_TOKEN_CONSUMED` (:974) | Copy tweak only: "the show is already unpublished / someone got there first" stands; replace "check show status in admin" framing's archive implication if present. |
| `UNPUBLISH_TOKEN_EXPIRED` (:987) | Copy tweak: "to take this show offline now, archive it from the admin dashboard" → "flip the Published toggle off on the show's page." |
| `PUBLISH_BLOCKED_PENDING_REVIEW` (:1612) | Unchanged (reused verbatim by the toggle's blocked rendering). |
| `FINALIZE_OWNED_SHOW` (:1551) | Copy REWRITE (R9): current copy is first-seen-wizard-only and claims "the row is held with `published = false`" — false for the live + pending-changes finalize case the toggle now surfaces. Reword dougFacing/helpfulContext/longExplanation to cover BOTH finalize shapes ("being published by a setup wizard, or having staged changes finalized") and drop the published=false claim. |
| `SHOW_AWAITING_PUBLISH_APPROVAL` (:1625) | Copy tweak: "Review it in the inbox and publish when you're ready" → point at the Published toggle on the show's page. |
| `CREW_SHOW_PAUSED` | NEW (crewFacing-only), §3.5. |
| `CREW_LINK_UNAVAILABLE` | Unchanged. |

### 3.7 Help docs + screenshots

The sweep is BROAD (R5): `rg -i "undo auto-publish|undo within|24 hours|republish"` across `app/`, `components/`, `lib/messages/`, `lib/notify/`, `docs/` help prose, and test assertions — every user-visible promise of the in-app undo window or archive-flavored recovery gets repointed at the toggle model. Known sites: 4 mdx pages (`app/help/admin/{per-show-panel,review-queues,dashboard,settings}/page.mdx`), `app/help/_affordanceMatrix.ts`, `AutoPublishToggle.tsx:68-71` settings copy ("You can still undo within 24 hours" → "You can turn any show off later with its Published toggle."), and **`components/admin/StagedReviewCard.tsx:140`** ("Apply to publish it (you can still undo within 24 hours)." → toggle-flavored, e.g. "Apply to publish it — you can turn it off anytime with the show's Published toggle.") plus that card's test assertions. Mentions of the 24 h window may survive ONLY where they describe the emailed undo link specifically. Help screenshots of the admin show page will drift → regenerate from the CI artifact ONLY (never local arm64 bytes; byte-gate discipline).

## 4. Flag lifecycle table

| Flag | Storage | Write paths | Read paths | Effect |
|---|---|---|---|---|
| `shows.published` | initial schema :26 | `publish_show` RPC (ON); **new** `unpublish_show` RPC + softened token-consume UPDATE (OFF); `_archive_show_core` (OFF, unchanged); `unarchive_show` (OFF on archived→Held, `20260602000002:36-39`, unchanged); first-seen insert (`runScheduledCronSync.ts:1176-1183`) | `resolveShowPageAccess.ts:182`, `getShowForViewer.ts:319`, admin page pill/gating (`page.tsx:331,362,368`), `_publish_show_core` idempotency, `readfinalizeowned_b2` | Crew-link liveness; drives toggle state |
| `shows.unpublish_token(+_expires_at)` | 20260512082710 | minted: cron :2601-2605 / applyStaged :1247-1256 (unchanged); cleared: expiry-clear, consume, `_archive_show_core`, **new** `_unpublish_show_core` | emailed-link flow; ~~admin page `undoWindowOpen`~~ (removed) | emailed 24 h undo only — no longer renders any in-app affordance |
| `app_settings.auto_publish_clean_first_seen` | 20260601000000:6 | unchanged | unchanged | unchanged (settings copy tweak only) |

No zombie flags introduced: every write path above has a live read path, and `undoWindowOpen`'s removal deletes the read together with the UI it fed.

## 5. Change matrix (tier×layer, DB-touching)

Single-domain feature — matrix is layer×surface:

| Layer | Action |
|---|---|
| Table DDL | N/A — no new/altered columns |
| Inline CHECK | N/A — `shows_unpublish_token_pair_check` already accepts both-null |
| RPC read | `unpublish_show`: pre-lock `drive_file_id`, post-lock `archived`/`published` re-read |
| RPC write | `_unpublish_show_core` (§3.1) |
| Propagation/trigger | `viewer_version_token` redefinition appends `published` component (R6) |
| Cleanup fns | N/A |
| PostgREST lockdown | already in force on `shows` (B2/Phase-0.B); new RPC follows revoke/grant recipe |
| Frontend | §3.3, §3.5 |
| Audit/help | §3.7 |
| Tests | §7 |
| Validation project | surgical apply + pgrst reload + manifest regen (§3.1) |

## 6. Out of scope

- Archive/Unarchive semantics, share-token rotation, picker reset — untouched.
- Auto-publish minting, first-published email delivery, notify pipeline — untouched (copy only).
- No auto-refresh/polling on the crew unavailable page.
- No bulk publish controls on the dashboard shows table (`Status` column stays read-only).
- `SHOW_UNPUBLISHED` alert auto-resolution on republish — not added (alerts keep manual Mark-resolved, matching `publish_show`'s existing behavior).

## 7. Testing (anti-tautology notes inline)

1. **DB (`tests/db/`)**: `unpublish_show` — admin gate (42501 non-admin), P0002 unknown id, archived → `SHOW_ARCHIVED_IMMUTABLE`, **published show with finalize-owned `shows_pending_changes` → `FINALIZE_OWNED_SHOW`** (R2), idempotent no-op on already-unpublished (asserting NO duplicate `SHOW_UNPUBLISHED` alert row), happy path asserts the FULL negative set from D1 (share_token byte-identical pre/post, picker_epoch unchanged, pending_syncs row survives, archived=false, archived_at null, token pair null) — derived from seeded fixture state, not hardcoded. Register in `tests/db/b2-lifecycle-rpc-meta.test.ts`.
2. **Missed-broadcast durability (R6/R9)**: DB test — `viewer_version_token(show)` changes across `unpublish_show`/`publish_show` flips (inequality, not format); route test — version route returns 410 for a crew viewer on an unpublished show (extends the existing route tests); bridge test — catch-up receiving `auth_denied` forces `router.refresh()` is ALREADY pinned (`ShowRealtimeBridge.tsx:305-309` behavior — verify existing bridge test coverage and extend only if the 410-after-unpublish shape is missing). NO loosening of the version route's auth gate.
2b. **Parity**: rewritten `unpublishParity` test (§3.4) comparing RPC vs token-consume end-state snapshots (`tests/db/_b2Helpers.ts` gains an `unpublishedStateSnapshot`).
3. **Lock topology**: `_advisoryLockSingleHolderContract` row for `unpublish_show` (in-RPC holder); emailed path stays JS-holder — the test proves the softened mutation still runs under `assertShowLockHeld` (`unpublishShow.ts:278,316`).
4. **Lifecycle caller**: register `lib/showLifecycle/unpublishShow.ts` in `tests/showLifecycle/callers.test.ts` (chokepoint + infra_error mapping).
5. **Action**: `setShowPublishedAction` — requireAdmin ordering, infra_error vs SHOW_NOT_FOUND resolution, direction dispatch, post-commit revalidation calls (mirror `tests/app/admin/show-lifecycle-actions.test.ts`; delete `tests/app/admin/undo-auto-publish-action.test.ts` + the three `undo-auto-publish-*` component tests). `tests/admin/unpublishedView.test.tsx` must stay green untouched — it pins the kept queue-page affordance.
6. **Toggle component**: five mode-boundary states (§3.3 table) + pending-disable via `useFormStatus` + blocked-outcome copy rendering. Anti-tautology: assert the blocked copy inside the toggle's own `data-testid` subtree after removing sibling nodes that render catalog copy (`PerShowAlertSection`); expected copy read from `messageFor("PUBLISH_BLOCKED_PENDING_REVIEW")`, not string-duplicated.
7. **Crew route**: `unpublished` → HTTP 200 unavailable page asserting (a) `CREW_SHOW_PAUSED` crewFacing text present, (b) show title ABSENT from the document (fixture-derived title string, not hardcoded), (c) `archived` and bad-token still 404. Extend `tests/show/` route tests + `unpublishRoutePrecedence.test.ts` if the precedence chain is asserted there.
8. **Admin page render**: published show owned via `shows_pending_changes` (seeded checkpoint `in_progress`) renders the ON-**disabled** toggle BEFORE any action fires (R3 — pins the widened `finalizeOwned` computation; extend `tests/components/admin/per-show-lifecycle.test.tsx`'s page-render pattern).
9. **Transition audit**: new conditionals registered in `tests/components/admin/transitionAudit.test.tsx` with explicit "instant" declarations (§3.3 inventory).
10. **E2E (Playwright, real browser)**: seed live show → toggle OFF → share URL renders unavailable page (assert on crew DOM, not admin) → toggle ON → same URL renders crew page. Reuses the picker-flow e2e harness seeding.
11. **Meta/CI gates expected to move**: x1 catalog parity, x2 internal-code-enums, spec-codes gen, help `_families`, `_metaAdminAlertCatalog` (new RPC-side `SHOW_UNPUBLISHED` upsert caller — add registry row/exemption per its `:411` union rule), validation-schema-parity, help-screenshot byte gate (CI-artifact regen).
12. **Full `vitest run` in the worktree is DB-polluting** — run `.db` suites in isolation per the Step-3 lesson (memory: shared-DB pollution).

## 8. Meta-test inventory (declared per AGENTS.md writing-plans rule)

EXTENDS: `tests/sync/_advisoryLockSingleHolderContract.test.ts`, `tests/db/b2-lifecycle-rpc-meta.test.ts`, `tests/showLifecycle/callers.test.ts`, `tests/components/admin/transitionAudit.test.tsx`, `tests/messages/_metaAdminAlertCatalog.test.ts` (registry⊆union scan, `:411` — confirm the SQL-side upsert caller is either covered or exempted). CREATES: none — every touched surface already has a registry.

## 9. Watchpoints / do-not-relitigate (for adversarial review)

- **D1–D6 are user-ratified product decisions** — do not relitigate pure-unpublish vs archive, the kept email link, instant flip, or the 200-status unavailable page (information-leak trade-off explicitly accepted by the user).
- The emailed-link path deliberately does NOT call the new RPC (single-holder rule, §3.4) — two mutation sites with a parity test is the ESTABLISHED pattern (`unpublishArchiveParity.test.ts` precedent).
- `lib/showLifecycle/unpublishShow.ts` vs `lib/sync/unpublishShow.ts` name collision is deliberate (§3.2).
- Master spec §12.4 edits must never be prettier-formatted (memory + x1 gate precedent).
- The unavailable page renders zero show data by construction (component takes no show props) — that IS the leak-minimization mechanism.
- `PublishShowButton`/`publishShowAction` survive deliberately for `/admin/unpublished` (R1 finding, resolved keep) — do not re-flag their retention as dead code.
- The emailed-path finalize-owned guard (R3) closes a gap that PRE-DATES this feature; the `busy` state is deliberately uncataloged transient copy per the `copy.ts:20-23` waiver precedent — do not demand a §12.4 code for it.
- The page's fail-toward-false `finalizeOwned` read is the EXISTING posture (`page.tsx:344-360`); the RPC refusal is the hard gate. Do not demand fail-closed rendering.
