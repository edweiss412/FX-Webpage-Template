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

- `_unpublish_show_core(p_show_id uuid)` — lockless, private (`revoke all` from everyone): 
  ```sql
  update public.shows
     set published = false,
         unpublish_token = null,
         unpublish_token_expires_at = null
   where id = p_show_id;
  perform public.upsert_admin_alert(p_show_id, 'SHOW_UNPUBLISHED',
          jsonb_build_object('drive_file_id', v_drive, 'sheet_name', v_title));
  perform public.publish_show_invalidation(p_show_id);
  ```
  Explicitly ABSENT (D1): `archived`/`archived_at`, `picker_epoch` bump, `show_share_tokens` rotation, scratch-table deletes.
- `unpublish_show(p_show_id uuid)` — admin-gated, self-locking: `is_admin()` gate → read `drive_file_id` (immutable, safe pre-lock) → `P0002 ADMIN_LINK_SHOW_NOT_FOUND` when missing → `pg_advisory_xact_lock(hashtext('show:'||v_drive))` → **post-lock re-read** of `archived`/`published` → `archived` raises `P0001 SHOW_ARCHIVED_IMMUTABLE` → already-unpublished returns (idempotent no-op, no alert spam) → `_unpublish_show_core`. `revoke all` + `grant execute to authenticated`.
- Clearing the token pair satisfies `shows_unpublish_token_pair_check` (both null) and kills any outstanding emailed undo link the moment an admin manually unpublishes — a later manual re-publish does NOT re-mint a token (minting stays exclusive to the auto-publish tails, §2).
- No `readfinalizeowned_b2` refusal needed in the OFF direction: a finalize-owned show is by definition `published=false` (`20260601000000_b2_show_lifecycle.sql:23` predicate), so it lands on the idempotent no-op branch.

**DDL idempotency:** `create or replace function` throughout; migration is safe to re-apply. Post-migration checklist (AGENTS.md): local apply + tests → `pnpm gen:schema-manifest` (commit if the manifest changes — RPC-only migrations may be a manifest no-op; run it regardless) → surgical apply to validation project (`supabase db query --linked` or psql `$TEST_DATABASE_URL`) + `notify pgrst, 'reload schema'`.

### 3.2 Lifecycle caller + server action

- New `lib/showLifecycle/unpublishShow.ts` exporting `unpublishShow(showId, deps?)` via `callLifecycleRpc(rpc, "unpublish_show", …)` — identical shape to `lib/showLifecycle/publishShow.ts`. (Deliberate name collision with `lib/sync/unpublishShow.ts`'s token-flow export; the modules serve different paths and imports disambiguate. Register in `tests/showLifecycle/callers.test.ts`.)
- New server action `app/admin/show/[slug]/_actions/setPublished.ts` exporting `setShowPublishedAction(slug: string, next: boolean): Promise<LifecycleResult>`: `requireAdmin()` → `resolveShowBySlug(slug)` (infra_error / SHOW_NOT_FOUND exactly as `publish.ts`) → `next ? publishShow(id) : unpublishShow(id)` → on `ok`: `revalidateShow(id)` + `revalidatePath('/admin/show/${slug}')` + `revalidatePath('/admin')`. Exported from the `_actions/index.ts` barrel.
- **Deleted:** `_actions/undoAutoPublish.ts` (`undoAutoPublishAction` + its barrel export). `readUnpublishTokenForSlug` (`lib/sync/unpublishShow.ts:341-352`) loses its only caller and is deleted too.
- **Kept (R1 finding):** `_actions/publish.ts` (`publishShowAction`) and `components/admin/PublishShowButton.tsx` remain — they are the per-row publish affordance on the Unpublished queue page (`app/admin/unpublished/page.tsx:23-24,79-80`), which is OUT of scope (D2 replaces the button on the SHOW page only). Duplication is two thin callers of the same `publish_show` RPC; acceptable.

### 3.3 Admin UI (invariant 8: impeccable dual-gate; Opus-only)

New client island `components/admin/PublishedToggle.tsx`, modeled line-for-line on the `AutoPublishToggle` React-19 dispatch pattern (switch is the form SUBMITTER; disables only on `useFormStatus().pending`; hidden-input-free — the bound action receives `next` as an argument closure like `AutoPublishToggle`'s `setAutoPublish(!on)`; `router.refresh()` on `ok`).

Props: `{ slug, published: boolean, finalizeOwned: boolean, setPublished: (next: boolean) => Promise<LifecycleResult> }`.

**Mode boundaries (explicit):**

| Page state | Toggle renders | Notes |
|---|---|---|
| Live (`published && !archived`) | ON, enabled | Sub-line: "Crew link is active." |
| Held (`!published && !archived && !finalizeOwned`) | OFF, enabled | Sub-line: "Crew link is off — nobody can open this show." |
| Publishing… (`finalizeOwned && !published`) | OFF, **disabled** | Explainer: publish is finishing; the switch unlocks when it's done. |
| Archived | **Not rendered** | Archived surface keeps its existing disclosure + Unarchive (`page.tsx:498-527`). |

**Guard conditions:** `published`/`finalizeOwned` are server-computed booleans (`page.tsx:331,350-356`) — never null/undefined at the callsite; the island takes plain booleans, no degraded read state exists (unlike `AutoPublishToggle`'s `infra_error` initial — the page 404s before rendering if the show read fails).

**Failure rendering (invariant 5 — all copy via `messageFor`):** a non-`ok` action result renders inline below the switch: `PUBLISH_BLOCKED_PENDING_REVIEW` → its catalog `dougFacing` (the Re-sync CTA already lives in the same footer); `FINALIZE_OWNED_SHOW` / `SHOW_ARCHIVED_IMMUTABLE` (race with a concurrent finalize/archive) → their catalog copy + `router.refresh()`; `ADMIN_LINK_SHOW_NOT_FOUND` / `infra_error` → plain retry copy (mirror `UndoAutoPublishButton.tsx:93-102`'s uncataloged retry pattern).

**Placement:** top of the Share & access column (`page.tsx:659-672`), directly under the `<h2>`+intro, above `CurrentShareLinkPanel`. The section already renders in every non-archived state, so the toggle is reachable for Held shows.

**Removed from the page:** footer undo render + `undoWindowOpen` computation (`page.tsx:338-340,855-861`), `PerShowAlertSection`'s `undoWindowOpen`/`undoAutoPublishAction` props and alert-row undo wiring (`page.tsx:480-489`, `components/admin/PerShowAlertSection.tsx`), Held-section `PublishShowButton` (`page.tsx:528-531`; the `held-disclosure` copy repoints at the toggle: "Held — not published. Turn on Published in Share & access to make it live."). **Deleted components:** `UndoAutoPublishButton.tsx` only. `PublishShowButton.tsx` survives for `/admin/unpublished` (see §3.2) but loses its show-page callsite; the e2e lifecycle-surface registry (`tests/e2e/admin-lifecycle-transitions.spec.ts:55`) keeps its row and gains the toggle's. `ArchiveShowButton`, `UnarchiveShowButton`, Re-sync, rotate/reset all unchanged.

**Transition inventory** (4 render states; N·(N−1)/2 = 6 pairs — ALL instant, no animation; the switch keeps `AutoPublishToggle`'s built-in knob `transition-transform` only): ON↔OFF (instant re-render via `router.refresh`), ON↔disabled (server state change, instant), ON↔hidden (archive action navigates/refreshes, instant), OFF↔disabled (instant), OFF↔hidden (instant), disabled↔hidden (instant). Compound: flipping the switch while an archive/finalize lands concurrently → the action returns the typed refusal, inline copy renders, `router.refresh()` reconciles. No `AnimatePresence` anywhere in scope; register the new conditionals in `tests/components/admin/transitionAudit.test.tsx`.

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

**Lock-holder topology (invariant 2, declared here for the plan):** `hashtext('show:'||drive_file_id)` acquires at exactly one layer per path — admin toggle OFF → in-RPC (`unpublish_show`), admin toggle ON → in-RPC (`publish_show`, existing), emailed link → JS-side `withShowLock` (existing, mutation stays inline SQL — it does NOT call the new RPC, precisely so no second layer ever acquires). Register `unpublish_show` in `tests/sync/_advisoryLockSingleHolderContract.test.ts`. (`tests/auth/advisoryLockRpcDeadlock.test.ts` guards finalize-lock handlers — `tryFinalizeLock` call sites, `:291-319` — and is NOT in scope.)

**Parity contract:** `tests/sync/unpublishArchiveParity.test.ts` is rewritten as `unpublishParity`: token-consume path ↔ `unpublish_show` RPC reach the SAME end-state (published=false, token pair null, share_token UNrotated, picker_epoch UNbumped, scratch rows intact, archived untouched, SHOW_UNPUBLISHED alert present).

**Confirm-page copy** (`app/show/[slug]/unpublish/copy.ts`): `CONFIRM_CONSEQUENCE`, `NEUTRAL_BODY`, `SUCCESS_*` lines currently describe archive-flavored recovery ("archive it from the admin", "republish"); reword to toggle-flavored ("turn Published back on from the show's page"). Same for `lib/notify/templates/autoPublishUndo.ts` body copy and `lib/sync/unpublishConfirmPage.ts` strings if they restate the effect. The action-state machine, statuses, and neutral-oracle rules (`copy.ts:10-16`) are unchanged.

### 3.5 Crew "unavailable" page (D5)

- `app/show/[slug]/[shareToken]/page.tsx:94-95`: the `unpublished` case stops calling `notFound()` and renders a new server component `ShowUnavailable` (colocated `app/show/[slug]/[shareToken]/ShowUnavailable.tsx`), modeled on `not-found.tsx`'s structure (FXAV brand strip, heading, body) — served HTTP 200. It renders **no show data** (no title, no dates — the component takes no show props at all). `archived` (:88-92) and `show_unavailable` (:98-102) keep `notFound()`.
- New §12.4 code `CREW_SHOW_PAUSED` (crewFacing-only, modeled on `CREW_LINK_UNAVAILABLE`): crewFacing ≈ "This show isn't available right now. Check back soon — if you think this is a mistake, contact your show lead." Copy routes through `messageFor` (invariant 5).
- `resolveShowPageAccess` itself is unchanged — it already returns `{kind:"unpublished"}` only after the slug+token pair resolved (:162-171), so the page leaks "link is real" only to holders of a currently-valid share token (user-accepted, D5). `getShowForViewer.ts:319`'s defense-in-depth throw is unreachable from this render path (no viewer data is fetched) and stays.
- Freshness both directions: unpublish → `publish_show_invalidation` bumps the version → `ShowRealtimeBridge` refreshes live crew sessions into the unavailable page; republish → same bridge is NOT mounted on the unavailable page (it renders outside `_CrewShell`), so recovery is a manual reload — acceptable (D5's page says "check back soon"). No polling added (YAGNI).

### 3.6 §12.4 catalog changes — three-way lockstep ×2 gens

One commit carries: master-spec §12.4 prose edits (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — NEVER prettier this file) + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` rows. New code additionally: `pnpm gen:internal-code-enums` (x2 gate), `app/help/errors/_families.ts` family row, full-suite run.

| Code | Change |
|---|---|
| `SHOW_FIRST_PUBLISHED` (:948) | REWRITE — drop the entire 24 h/undo-window framing. New framing: live at its share-token URL; "Made a mistake? Flip the Published toggle off on the show's page — the crew link switches off until you turn it back on. When email is set up, the published notice also carries a 24-hour undo link." Placeholders `<sheet-name>`, `<crew-count>`, `<show-date>` retained (context is supplied by the existing emitter, `runScheduledCronSync.ts:1855-1880`). |
| `SHOW_UNPUBLISHED` (:961) | REWRITE — the show is NOT archived anymore. New: unpublished; crew link stops resolving; sheet untouched and still syncing; turn Published back on from the show's page when ready. Emitted by both the RPC (§3.1) and the emailed-link path (§3.4) — copy must fit both. |
| `UNPUBLISH_TOKEN_CONSUMED` (:974) | Copy tweak only: "the show is already unpublished / someone got there first" stands; replace "check show status in admin" framing's archive implication if present. |
| `UNPUBLISH_TOKEN_EXPIRED` (:987) | Copy tweak: "to take this show offline now, archive it from the admin dashboard" → "flip the Published toggle off on the show's page." |
| `PUBLISH_BLOCKED_PENDING_REVIEW` (:1612) | Unchanged (reused verbatim by the toggle's blocked rendering). |
| `SHOW_AWAITING_PUBLISH_APPROVAL` (:1625) | Copy tweak: "Review it in the inbox and publish when you're ready" → point at the Published toggle on the show's page. |
| `CREW_SHOW_PAUSED` | NEW (crewFacing-only), §3.5. |
| `CREW_LINK_UNAVAILABLE` | Unchanged. |

### 3.7 Help docs + screenshots

`rg -i "undo auto-publish"` hits 4 mdx pages (`app/help/admin/{per-show-panel,review-queues,dashboard,settings}/page.mdx`) + `app/help/_affordanceMatrix.ts`; sweep all mentions to the toggle model. `AutoPublishToggle.tsx:68-71` settings copy "You can still undo within 24 hours" → "You can turn any show off later with its Published toggle." Help screenshots of the admin show page will drift → regenerate from the CI artifact ONLY (never local arm64 bytes; byte-gate discipline).

## 4. Flag lifecycle table

| Flag | Storage | Write paths | Read paths | Effect |
|---|---|---|---|---|
| `shows.published` | initial schema :26 | `publish_show` RPC (ON); **new** `unpublish_show` RPC + softened token-consume UPDATE (OFF); `_archive_show_core` (OFF, unchanged); first-seen insert (`runScheduledCronSync.ts:1176-1183`) | `resolveShowPageAccess.ts:182`, `getShowForViewer.ts:319`, admin page pill/gating (`page.tsx:331,362,368`), `_publish_show_core` idempotency, `readfinalizeowned_b2` | Crew-link liveness; drives toggle state |
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
| Propagation/trigger | N/A — no triggers touch `published` |
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

1. **DB (`tests/db/`)**: `unpublish_show` — admin gate (42501 non-admin), P0002 unknown id, archived → `SHOW_ARCHIVED_IMMUTABLE`, idempotent no-op on already-unpublished (asserting NO duplicate `SHOW_UNPUBLISHED` alert row), happy path asserts the FULL negative set from D1 (share_token byte-identical pre/post, picker_epoch unchanged, pending_syncs row survives, archived=false, archived_at null, token pair null) — derived from seeded fixture state, not hardcoded. Register in `tests/db/b2-lifecycle-rpc-meta.test.ts`.
2. **Parity**: rewritten `unpublishParity` test (§3.4) comparing RPC vs token-consume end-state snapshots (`tests/db/_b2Helpers.ts` gains an `unpublishedStateSnapshot`).
3. **Lock topology**: `_advisoryLockSingleHolderContract` row for `unpublish_show` (in-RPC holder); emailed path stays JS-holder — the test proves the softened mutation still runs under `assertShowLockHeld` (`unpublishShow.ts:278,316`).
4. **Lifecycle caller**: register `lib/showLifecycle/unpublishShow.ts` in `tests/showLifecycle/callers.test.ts` (chokepoint + infra_error mapping).
5. **Action**: `setShowPublishedAction` — requireAdmin ordering, infra_error vs SHOW_NOT_FOUND resolution, direction dispatch, post-commit revalidation calls (mirror `tests/app/admin/show-lifecycle-actions.test.ts`; delete `tests/app/admin/undo-auto-publish-action.test.ts` + the three `undo-auto-publish-*` component tests). `tests/admin/unpublishedView.test.tsx` must stay green untouched — it pins the kept queue-page affordance.
6. **Toggle component**: four mode-boundary states (§3.3 table) + pending-disable via `useFormStatus` + blocked-outcome copy rendering. Anti-tautology: assert the blocked copy inside the toggle's own `data-testid` subtree after removing sibling nodes that render catalog copy (`PerShowAlertSection`); expected copy read from `messageFor("PUBLISH_BLOCKED_PENDING_REVIEW")`, not string-duplicated.
7. **Crew route**: `unpublished` → HTTP 200 unavailable page asserting (a) `CREW_SHOW_PAUSED` crewFacing text present, (b) show title ABSENT from the document (fixture-derived title string, not hardcoded), (c) `archived` and bad-token still 404. Extend `tests/show/` route tests + `unpublishRoutePrecedence.test.ts` if the precedence chain is asserted there.
8. **Transition audit**: new conditionals registered in `tests/components/admin/transitionAudit.test.tsx` with explicit "instant" declarations (§3.3 inventory).
9. **E2E (Playwright, real browser)**: seed live show → toggle OFF → share URL renders unavailable page (assert on crew DOM, not admin) → toggle ON → same URL renders crew page. Reuses the picker-flow e2e harness seeding.
10. **Meta/CI gates expected to move**: x1 catalog parity, x2 internal-code-enums, spec-codes gen, help `_families`, `_metaAdminAlertCatalog` (new RPC-side `SHOW_UNPUBLISHED` upsert caller — add registry row/exemption per its `:411` union rule), validation-schema-parity, help-screenshot byte gate (CI-artifact regen).
11. **Full `vitest run` in the worktree is DB-polluting** — run `.db` suites in isolation per the Step-3 lesson (memory: shared-DB pollution).

## 8. Meta-test inventory (declared per AGENTS.md writing-plans rule)

EXTENDS: `tests/sync/_advisoryLockSingleHolderContract.test.ts`, `tests/db/b2-lifecycle-rpc-meta.test.ts`, `tests/showLifecycle/callers.test.ts`, `tests/components/admin/transitionAudit.test.tsx`, `tests/messages/_metaAdminAlertCatalog.test.ts` (registry⊆union scan, `:411` — confirm the SQL-side upsert caller is either covered or exempted). CREATES: none — every touched surface already has a registry.

## 9. Watchpoints / do-not-relitigate (for adversarial review)

- **D1–D6 are user-ratified product decisions** — do not relitigate pure-unpublish vs archive, the kept email link, instant flip, or the 200-status unavailable page (information-leak trade-off explicitly accepted by the user).
- The emailed-link path deliberately does NOT call the new RPC (single-holder rule, §3.4) — two mutation sites with a parity test is the ESTABLISHED pattern (`unpublishArchiveParity.test.ts` precedent).
- `lib/showLifecycle/unpublishShow.ts` vs `lib/sync/unpublishShow.ts` name collision is deliberate (§3.2).
- Master spec §12.4 edits must never be prettier-formatted (memory + x1 gate precedent).
- The unavailable page renders zero show data by construction (component takes no show props) — that IS the leak-minimization mechanism.
- `PublishShowButton`/`publishShowAction` survive deliberately for `/admin/unpublished` (R1 finding, resolved keep) — do not re-flag their retention as dead code.
