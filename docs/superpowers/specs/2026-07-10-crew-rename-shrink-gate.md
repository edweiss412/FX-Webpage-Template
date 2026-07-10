# Crew rename (drop+add) seam in the published-show shrink gate — BL-CREW-RENAME-SILENT-REPLACEMENT

**Date:** 2026-07-10 · **Status:** ratified (Option A, tiered — user-approved autonomous ship) · **Backlog:** `BACKLOG.md:19-23` · **Origin:** e2e preparedness re-rating (`docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §10)

## 1. Problem

The publish-state crew-shrink gate keys on the **net** crew count delta. `lib/sync/phase1.ts:441-446` synthesizes a hold item only when `crewDrop === 1` (prior length minus next length); MI-6 proper fires only at `crewDrop > 1` (`lib/parser/invariants.ts:250-252`). A **rename** (Doug fixes "Jon Smith" → "John Smith") arrives as drop+add in one sync — net delta 0 — so neither fires. The old `crew_members` row is silently replaced on a published show. The same blindness covers a genuine **swap** (remove Sally, add Bob, one sync).

Two consequences:

1. **Silent removal on a published show** — the exact class the P0-1 fix (#359) was meant to close. Doug's only trace is a `crew_renamed` / `crew_removed` changes-feed row he does not routinely see.
2. **Picker continuity loss.** The apply path is delete+insert (`lib/sync/applyParseResult.ts:135-136`: `deleteCrewMembersNotIn` then `upsertCrewMembers`), so a rename mints a fresh `crew_members.id`. The picker cookie stores that UUID per show (`lib/auth/picker/cookieEnvelope.ts:9` — `PickerEntry.id`; validated against `crew_members.id` at `lib/auth/picker/resolvePickerSelection.ts:94-97`). The renamed member's phone stops resolving → `removed_from_roster` → re-pick banner. Fail-safe but avoidable.

Rename **detection** already exists and runs on every re-sync (`lib/parser/invariants.ts:596-800`):

- **MI-12** — removed and added share the same canonicalized email (`types.ts:492`: `{ removed_name, added_name, email }`). High confidence.
- **MI-13** — both sides have (different) emails; names paired by Levenshtein within `levenshteinThreshold` (`invariants.ts:60`). Medium.
- **MI-14** — both sides have null email; Levenshtein pairing only. Lowest.
- Unpaired removals emit **MI-13-orphan-remove** / **MI-14-orphan-remove** (`types.ts:495-500`); unpaired additions emit orphan-add variants.

Today all of these are notifications: they auto-apply and only produce feed rows (`lib/sync/phase1.ts:475-478` comment; `lib/sync/changeLog/writeAutoApplyChanges.ts:45,77-123` already derives `crew_renamed` rows from MI-12/13/14 pairs).

### Removal-coverage lemma (load-bearing)

Every name removed between prior and next lands in **exactly one** of: MI-12 pair, MI-13 pair, MI-14 pair, MI-13-orphan-remove, MI-14-orphan-remove. Proof by the pairing cascade in `invariants.ts:608-800`: removed names with email enter MI-12 matching, then MI-13 candidates, unpaired → MI-13-orphan-remove; removed names without email enter MI-14 candidates, unpaired → MI-14-orphan-remove. Therefore gating on {MI-13, MI-14, both orphan-removes} (with MI-12 deliberately exempt) covers **every** removal that is not an email-anchored rename — including the single-drop case the #359 synthetic block covered, and the net-zero swap case it missed.

## 2. Resolved decisions (ratified with user, 2026-07-10)

**Option A — tiered:**

- **MI-12 (email-anchored) auto-links.** Applies as an identity-preserving UPDATE (same `crew_members.id`); no hold; existing `crew_renamed` feed row is the trace. Rationale: same canonical email = same person; picker continuity and any OAuth claim survive.
- **MI-13 / MI-14 (heuristic) hold on published shows.** Routed through the existing `shrink_held` confirm (`phase1.ts:447-472`). On Doug's version-bound confirm (`acceptShrink` + matching `expectedModifiedTime`, `phase1.ts:450-451`), the pair applies as an identity-preserving UPDATE — the confirm is the vouch. An **unconfirmed** heuristic pair is never identity-linked: a false-positive UPDATE would silently point the wrong person's picker cookie at the new identity (the wrong schedule), whereas delete+insert fails safe to the re-pick banner.
- **Orphan-removes hold on published shows** — closes the swap/net-zero seam, not just renames.
- The `crewDrop === 1` synthetic block at `phase1.ts:441-446` is **replaced** (subsumed per the lemma above). Single-drop-still-holds is pinned by test.
- **Existing carve-outs stay:** unpublished shows auto-apply (no new holds), `onboarding_scan` excluded (`phase1.ts:430-432` — `readShowForPhase1` blinded, no diffs), first-seen has no prior so no MI-6..14 at all (`invariants.ts:239-241`).

Net effect vs #359: the gate strictly widens. No case that held before stops holding (a rename nets delta 0, so it never reached the `crewDrop === 1` block; it silently replaced). Email-anchored renames go from silent replacement to identity-preserving auto-link; every other removal shape on a published show now holds.

## 3. Behavior specification

### 3.1 Gate re-key (`lib/sync/phase1.ts`)

Replace the synthetic block at `phase1.ts:441-446` with:

```
if (show && args.mode !== "onboarding_scan" && show.published) {
  materialShrinkItems.push(
    ...reviewItems.filter(isCrewRemovalClassItem)   // MI-13 | MI-14 | MI-13-orphan-remove | MI-14-orphan-remove
  );
}
```

- MI-12 items are **excluded** — that is the auto-link tier.
- Orphan-**add** items are **excluded** — pure additions never gate (unchanged).
- The existing MI-6/MI-7 filter at `phase1.ts:430-435` is untouched (it applies to existing shows in re-sync modes regardless of publish state; the new removal-class items are published-only, mirroring the scope of the #359 synthetic they replace).
- The version-bound confirm bypass (`acceptedThisVersion`, `phase1.ts:450-451`) and the re-hold-on-modifiedTime-drift behavior are unchanged.
- Item **ordering** within `materialShrinkItems`: existing MI-6/MI-7 first (from the 430-435 filter), then removal-class items in `reviewItems` order. `describeShrink` output order follows.

MI-6 (`crewDrop > 1`) can now co-occur with removal-class items for the same sync; `describeShrink` renders both (count line + per-name lines) — complementary, not double-counting (MI-6 carries no names; removal-class items carry no counts).

### 3.2 `describeShrink` extension (`lib/sync/phase1.ts:220-237`)

New cases in the item loop:

- `MI-13` / `MI-14`: `possible rename: "<removed_name>" → "<added_name>"`
- `MI-13-orphan-remove` / `MI-14-orphan-remove`: `crew removed: "<removed_name>"`

Joined with the existing `"; "` separator. The message flows to the admin alert `detail` and the ReSyncButton confirm as today — human words, never a raw code or internal token (invariant 5; the names come from Doug's own sheet). MI-12 items never enter `materialShrinkItems`, so no case is needed for them.

Cap/truncation: a pathological sheet edit could produce many removal-class items. `describeShrink` renders at most **8** parts; if more, append `; +N more`. (Existing MI-6/MI-7 parts count toward the cap; today's code has no cap but today's inputs are ≤5 section items — the new per-name items make the unbounded case real.)

### 3.3 Identity-link set (orchestrator, `lib/sync/runScheduledCronSync.ts`)

At the seam where `notableItems` is computed and Phase-2 args are built (`runScheduledCronSync.ts:3329-3400`):

```
identityLinkRenames = notableItems MI-12 pairs (always)
                    + notableItems MI-13/MI-14 pairs IFF acceptedThisVersion
```

where `acceptedThisVersion` = `deps.acceptShrink === true && deps.expectedModifiedTime === binding.modifiedTime` — the same predicate phase1 uses to fall through the hold (`phase1.ts:450-451`), recomputed at the orchestrator (both inputs are in scope: `deps.acceptShrink` / `deps.expectedModifiedTime` at `runScheduledCronSync.ts:543-544`, threaded from the admin confirm via `runManualSyncForShow.ts:74-75,285-287`).

Each pair maps to `{ removedName: item.removed_name, addedName: item.added_name }`. The list is passed on Phase-2 args as `identityLinkRenames?: Array<{ removedName: string; addedName: string }>` and threaded to `applyParseResult` (call site `lib/sync/phase2.ts:369`).

Notes:

- `notableItems` is only computed for `pass` / `auto_apply_with_holds` outcomes (`runScheduledCronSync.ts:3329-3333`) — exactly the outcomes that reach apply. A held sync returns `shrink_held` before Phase 2, so no link set exists for it (correct).
- MI-12 pairs are unique per email: duplicate crew emails in a parse are a hard-fail before MI-6..14 evaluate (`invariants.ts:196-231`), and the pairing loop marks `pairedAdded` (`invariants.ts:640-648`).
- An unpublished show never holds on MI-13/14, and its admin UI never offers a shrink confirm, so `acceptShrink` is absent → heuristic pairs stay delete+insert there. If an admin nonetheless sends `acceptShrink` on a manual sync, linking is acceptable (explicit admin action).
- First-seen / onboarding_scan: `notableItems` empty → no linking.

### 3.4 Identity-preserving apply (`lib/sync/applyParseResult.ts`)

New optional arg `identityLinkRenames` (default `[]`). Immediately **before** `deleteCrewMembersNotIn` (`applyParseResult.ts:135` — order is load-bearing: delete-first would drop the old-name row and leave nothing to rename):

For each pair, **skip** unless all of:

- `removedName ∈ args.snapshot.previousCrewNames` (row actually exists to rename),
- `addedName ∈ nextCrewNames` (post-hold-plan crew list, `applyParseResult.ts:121` — a hold-suppressed addition must not be linked),
- neither name ∈ `heldNames` and `removedName ∉ deleteProtectedNames` (`applyParseResult.ts:103-118` — never mutate a hold-protected row behind its hold),

then call the new tx method:

```ts
renameCrewMember(showId: string, removedName: string, addedName: string): Promise<void>
```

Contract: a guarded, idempotent, at-most-one-row UPDATE:

```sql
update public.crew_members
   set name = $3
 where show_id = $1 and name = $2
   and not exists (
     select 1 from public.crew_members where show_id = $1 and name = $3
   )
```

- The `not exists` guard makes a target-name collision (or a re-run) a no-op instead of a `unique (show_id, name)` violation (`supabase/migrations/20260501000000_initial_public_schema.sql:43`).
- A no-op rename (source row missing, or guard blocked) degrades exactly to today's delete+insert: `deleteCrewMembersNotIn` removes the old row (if present), `upsertCrewMembers` inserts the new name fresh. No error surfaced; the behavior is fail-safe by construction.
- After the rename, `upsertCrewMembers` (`runScheduledCronSync.ts:1577-1609`) hits `on conflict (show_id, name)` on the renamed row and refreshes every parsed field (email, phone, role, flags, restrictions, flight_info) from the added-side parse row — the linked row carries the new identity's full data.
- `crew_members.last_changed_at` bumps via trigger (`supabase/migrations/20260501001000_internal_and_admin.sql:53-57`), so `viewer_version_token` (`...:18-28`) rolls and crew-page caches invalidate. No manual timestamp write.
- `appliedCrewMembers` (the post-hold parse list, `applyParseResult.ts:134`) is unchanged — the feed writer keeps deriving `crew_renamed` from `triggeredItems` + prev/next lists (`writeAutoApplyChanges.ts:77-123`); a linked rename produces the same feed row a replaced rename does today.

Tx interface: `renameCrewMember` is added as a **required** method on `ApplyParseResultTx` (`applyParseResult.ts:33` region) and implemented once in the shared Postgres tx (`runScheduledCronSync.ts:1577` region, same `this.rows` style). Plan must grep test fakes implementing the interface and update each (fail-loud beats an optional method silently skipped).

### 3.5 Undo becomes identity-link aware (`undo_change` migration)

The existing `crew_renamed` undo is a true reversal of the delete+insert model: it deletes the successor row by name, then reinserts the `before_image` (restoring the original `id` + `claimed_via_oauth_at`) (`supabase/migrations/20260608000003_undo_change_rpc.sql:173-262`). For an **identity-linked** rename the successor row **is** the prior row (`before_image.id` == the live successor's `id`), so delete+reinsert of the same UUID is semantically wrong and fires `ON DELETE SET NULL` on anything referencing `crew_members(id)`.

Corruption-severity check (adversarial R1): the only such FK is `link_sessions.crew_member_id` (`supabase/migrations/20260501001000_internal_and_admin.sql:120`), and `link_sessions` has **zero references anywhere in `lib/` or `app/`** (retired with the M9.5 auth teardown) — so there is no *live* session-corruption path today. The picker cookie is client-side (no FK) and the reinsert restores the same UUID, so even the unfixed path resolves. We fix it anyway: the delete is a latent hazard for any future FK and the wrong semantics for a linked rename.

**Fix (new migration, function-only, no DDL):** in `undo_change`'s `crew_renamed` branch, after the existing guards and the `select id into v_succ_id ... for update`, branch on identity:

- `v_succ_id = (v_before->>'id')::uuid` (linked rename) → **UPDATE in place**: set the successor row's `name`, `email`, `phone`, `role`, `role_flags`, `date_restriction`, `stage_restriction`, `flight_info`, `claimed_via_oauth_at` back from `before_image` (same field list + casts as the existing restore INSERT; `last_changed_at = clock_timestamp()`), skip the delete and skip the restore INSERT. Same ROW_COUNT = 1 fail-safe.
- Otherwise (replaced rename, the only shape that exists in historical rows) → existing delete + reinsert, byte-for-byte unchanged.

Everything downstream of the restore (held-present override insert, undo log row, status flip) is shared and unchanged. All guards (email-collision, name-collision, status, lock) run before either branch, preserving the zero-mutation-on-reject contract. `crew_removed` / `crew_added` directions untouched. The branch is self-selecting from data — no new `change_kind`, no feed or catalog fan-out.

Migration checklist (per AGENTS.md validation-parity rule): apply locally + DB tests; `pnpm gen:schema-manifest` + commit (function bodies aren't manifest content — expect a no-op regen, commit if changed); apply surgically to the validation project + `notify pgrst, 'reload schema'`.

### 3.6 What does NOT change

- No DB **schema** change (one function-body migration per §3.5; no DDL, no new RPC, no PostgREST surface). The apply-path UPDATE rides the existing service-role postgres.js tx inside the existing per-show advisory lock (invariant 2: no new lock holder at any layer; `undo_change` keeps its existing in-RPC lock — its single-holder topology is untouched).
- No UI files. The hold message is a string through the existing shrink surface (admin alert detail + ReSyncButton confirm at `tests/components/ReSyncButton.test.tsx`'s subject). Invariant 8 (impeccable) not triggered.
- No new §12.4 code. The existing `RESYNC_SHRINK_HELD` alert producer at the caller is untouched; only the `message` text gains rename/removal parts.
- No new mutation surface (invariant 10): no new route or server action; existing instrumented paths.
- `writeAutoApplyChanges`, MI-11 holds (`phase2.ts:341-366`), MI-8 debounce, sentinel/staging branches: untouched.
- Email canonicalization: no new raw-email handling; MI-12 matching already uses `canonicalize` (`invariants.ts:628-640`); `upsertCrewMembers` already canonicalizes at the write (`runScheduledCronSync.ts:1600`).

## 4. Guard conditions

| Input / state | Behavior |
| --- | --- |
| `identityLinkRenames` absent / empty | Exactly today's apply path (delete+insert). |
| Pair's `removedName` not in previous crew (already gone, hold-suppressed, or stale) | Skip link; upsert inserts added name fresh. |
| Pair's `addedName` not in post-hold `nextCrewNames` (suppressed/folded by hold plan) | Skip link; no rename occurs. |
| Either name held (`heldNames`) or removed name delete-protected | Skip link — a hold owns that row's fate. |
| Target name already exists as a row (race / duplicate) | SQL guard makes rename a no-op; upsert updates the existing target row; old row deleted. Net = today's replace. |
| Same pair applied twice (retry inside new tx attempt) | Second UPDATE matches 0 rows (source name gone) — idempotent. |
| Renamed member had claimed via OAuth (`claimed_via_oauth_at`) with an email that no longer matches (confirmed MI-13: email changed too) | `resolvePickerSelection` `session_mismatch` → `identity_invalidated` → re-pick (`resolvePickerSelection.ts:133-150`). Fail-safe, correct. |
| MI-12 rename (email preserved) with OAuth claim | id + email both survive → session still resolves. Continuity preserved. |
| `crewDrop > 1` plus rename pairs in one sync | MI-6 + removal-class items all hold together; one confirm applies all (as today for MI-6+MI-7 combos). |
| >8 shrink parts | Message truncates with `+N more`. |
| Published flips between hold and confirm | `expectedModifiedTime` mismatch re-holds with fresh counts (`phase1.ts:448-452`, unchanged). |
| Unpublished / first-seen / onboarding_scan | No new holds; MI-12 linking still applies on unpublished (same-person evidence), never on first-seen/onboarding (no prior). |

## 5. Tier × layer completeness matrix (DB-touching change, no DDL)

| Layer | Action |
| --- | --- |
| Table DDL / CHECKs / migrations | No DDL. One function-only migration re-creating `undo_change` (§3.5) — apply local + validation, regen manifest. `unique (show_id, name)` already guards rename collisions. |
| Write path | New `renameCrewMember` on the shared tx (`runScheduledCronSync.ts`); ordered rename → delete → upsert in `applyParseResult`. |
| RPC / PostgREST | N/A — no new RPC; table already RPC-free service-role-written on this path. |
| Triggers | Existing `crew_members_bump_last_changed_at` covers the UPDATE. |
| Cleanup | N/A — `cleanup_superseded_before_images` path unchanged (feed writer unchanged). |
| Frontend | N/A — message string only, through existing surfaces. |
| Telemetry | Existing RESYNC_SHRINK_HELD producer; no new codes. |
| Tests | §6. |

## 6. Test plan (TDD, all under existing harnesses)

Unit — `tests/sync/phase1.test.ts` (+ siblings as the plan lays out):

1. **Net-zero rename, MI-13 shape, published** → `shrink_held`; message contains `possible rename: "Jon Smith" → "John Smith"`. (Concrete failure caught: the original seam — net-zero bypass.)
2. **Net-zero rename, MI-12 shape (same email), published** → NOT held; outcome passes through. (Catches over-gating the auto-link tier.)
3. **Net-zero swap (dissimilar names, different emails), published** → `shrink_held` with `crew removed: "Sally …"`. (Catches lemma gap: orphan-remove must gate.)
4. **Single drop, no add, published** → still `shrink_held` (regression pin for #359 after the synthetic block is removed; derive from fixture, don't hardcode counts).
5. **Unpublished show, same edits** → no hold (carve-out pinned).
6. **onboarding_scan** → no hold, no link (blinded prior).
7. **acceptShrink + matching modifiedTime with MI-13 pair** → falls through; identity-link set includes the pair. **Mismatched modifiedTime** → re-hold, no link.
8. **describeShrink cap** → 9+ items renders 8 + `+N more`.

Apply — `tests/sync/` applyParseResult coverage:

9. **MI-12 link:** prior row id captured; apply with pair → same id, new name, refreshed fields, old name absent. Assert against the DB row id (data source), not the feed (anti-tautology).
10. **Skip guards:** held removedName → no rename call; suppressed addedName → no rename call; missing source row → upsert-only.
11. **Collision:** pre-existing target-name row → rename no-ops, no unique violation, apply completes.
12. **Feed parity:** linked rename still yields exactly one `crew_renamed` row (no `crew_removed`/`crew_added` for the pair).

DB — `tests/sync/resyncShrinkHold.db.test.ts` extension: end-to-end rename-hold → confirm → row id preserved (real Postgres; loopback-guarded like siblings).

Undo (real Postgres, alongside existing undo DB tests):

13. **Linked-rename undo, update-in-place:** seed crew row (capture id), write an applied `crew_renamed` change row whose `before_image.id` equals the live row's id (linked shape), seed a `link_sessions` row pointing at the id, call `undo_change` → prior name/email restored, `crew_members.id` unchanged, `link_sessions.crew_member_id` still set (proves no delete fired — the assertion that cannot pass under delete+reinsert), held-present override + undone flip written as today.
14. **Replaced-rename undo regression:** historical shape (`before_image.id` differs from successor id) → existing delete+reinsert path byte-identical: successor gone, prior id restored, guards still zero-mutation on reject (`UNDO_EMAIL_CLAIMED` / `UNDO_SUPERSEDED` paths re-run green).

Anti-tautology notes: expected names/ids derive from fixtures; id-preservation asserts on `crew_members.id` equality across the apply, which cannot pass under delete+insert; hold assertions check the `outcome` discriminant, not message substrings alone (message asserted separately).

## 7. Meta-test inventory (declared per plan rules)

- `tests/auth/_metaInfraContract.test.ts`: **N/A** — no new Supabase `{data,error}` call sites (postgres.js tx only). `resolvePickerSelection` untouched.
- `tests/auth/advisoryLockRpcDeadlock.test.ts`: **unchanged** — no new advisory-lock holder; every touched write runs inside the already-held JS-side show lock. Holder enumeration: cron/manual paths acquire via the JS wrapper in `runScheduledCronSync`; `renameCrewMember` is a plain tx statement under it (same layer as `upsertCrewMembers`).
- `tests/log/_metaMutationSurfaceObservability.test.ts`: **no new surface** — no new route/action files.
- `tests/admin/no-inline-email-normalization.test.ts`: **no new normalization** — rename touches `name` only.
- No new meta-test created: the removal-coverage lemma is pinned behaviorally (tests 1–4) rather than structurally; a structural walker over invariant variants would duplicate the type union with no drift vector (the union and the filter live in the same PR-reviewed files).

## 8. Out of scope / deferred

- Surfacing the changes feed to Doug (the "unsurfaced feed row" half of the backlog note) — separate surface, unchanged here.
- Room/contact rename identity (MI-7b class) — rooms have no picker identity; existing re-stage behavior stands.
- Any UI affordance that itemizes rename pairs in the ReSyncButton confirm beyond the message string — the string is the ratified scope.
