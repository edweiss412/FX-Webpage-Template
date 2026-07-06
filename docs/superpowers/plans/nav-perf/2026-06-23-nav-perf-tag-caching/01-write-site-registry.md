# Write-site registry — nav-perf tag-caching (Task 1 discovery output)

Authoritative list of every Next-runtime write to a `getShowForViewer`-read table
(`shows`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`,
`contacts`, `shows_internal`), produced by running the spec §6 discovery scan
over `lib` + `app` (minus tests/audit). Each hit is classified:

- **CHOKEPOINT** — write flows through the shared sync inner
  `processOneFile_unlocked`; covered by Task 5's caller-level post-commit
  `revalidateOnApplied(result)`.
- **REVALIDATE** — own post-commit `revalidateTag(showCacheTag(showId))` call
  (Tasks 6–9).
- **EXEMPT** — no rendered crew-DATA change (clears only `pending_*` / session /
  interim-unpublished rows, or writes picker/auth columns not in the crew DATA
  projection); carries a `// not-subject-to-revalidate: <reason>` comment.

## Discovery commands (spec §6)

```bash
# RAW postgres.js SQL form (the write idiom in this repo)
rg -ln -e "insert into public\.(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)" \
      -e "update public\.(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)" \
      -e "delete from public\.(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)" \
      --ignore-case lib app | rg -v "\.test\.|/tests/|/audit/|noGlobalCursor|watermark"
# supabase builder form (completeness — ZERO hits in this repo)
rg -ln '\.from\("(shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal)"\)\s*\.\s*(insert|update|upsert|delete)' lib app | rg -v "\.test\.|/tests/"
```

**Builder form:** 0 hits (this repo writes via raw `sql\`…\`` / `tx.unsafe`/`tx.query`).
**Raw-SQL form:** 10 files.

## siteCount note (word-boundary vs prefix)

The plain regex (no `\b`) over-counts: `public.shows_pending_changes` matches the
`shows` alternative by prefix. The spec §6 meta-test regex adds `\b` after the
table name, which excludes `shows_pending_changes` (an `_` is a word char → no
boundary after `shows`). The **`siteCount` column below is the `\b`-anchored
count** (true `getShowForViewer`-read-table write LINES), which is what the Task-4
discovery layer will assert. The "raw matches" note records what the non-`\b`
regex saw, for traceability.

## Registry

| File | siteCount (`\b`) | Disposition | Reason / lines |
|---|---|---|---|
| `lib/sync/runScheduledCronSync.ts` | 19 | **CHOKEPOINT** + REVALIDATE | The sync apply spine. `processOneFile_unlocked` writes crew_members/hotel_reservations/rooms/transportation/contacts/shows_internal/shows (lines 1171–1382) → covered by Task 5 caller-level `revalidateOnApplied(result)`. ALSO `markMissingShow_unlocked` `update public.shows` (the missing-show branch, ~:1959) → Task 5 second branch `revalidateShow(show.id)`. Lines 438/746/759/779/805/1097/1123 are other show-status/metadata updates inside the same apply/lock surface. Two revalidate branches expected (apply + missing). |
| `lib/sync/runManualSyncForShow.ts` | 1 | **CHOKEPOINT** | `update public.shows set requires_resync=false` (:405) fires on the applied path. The actual crew-data apply reaches `processOneFile_unlocked` directly (`runManualSyncForShow_unlocked`); covered by Task 5 at the manual-sync caller + retry routes post-`withPipelineLock`/`withRow*`. |
| `lib/sync/promoteSnapshot.ts` | 3 | **REVALIDATE** | `update public.shows s` (:159/:271/:400) writes `shows.diagrams` (the snapshot promote), which is projected at `getShowForViewer.ts:709` (`diagrams`). Task 7: post-commit `revalidateTag(showCacheTag(showId))` at its Next caller. |
| `lib/sync/assetRecovery.ts` | 1 | **REVALIDATE** | `update public.shows` (:522) writes `shows.diagrams` → projected (`getShowForViewer.ts:709`). Task 7: post-commit revalidate. |
| `lib/sync/applyStaged.ts` | 1 | **REVALIDATE** | `update public.shows` (:699) on the staged-apply path mutates rendered show data. Task 7: post-commit revalidate. |
| `app/api/admin/onboarding/finalize/route.ts` | 0 (`\b`); 1 raw | **REVALIDATE** | The `\b`-regex shows 0 (its only raw match, :453, is `insert into public.shows_pending_changes` — NOT a read table). The rendered crew-data write happens via `applyStagedCore` (`finalize/route.ts:162,682-734`) inside `deps.withTx`. Task 6: collect applied showId, post-`withTx`-commit `revalidateTag`. (Registry keeps this file even at `\b`-count 0 because its apply path mutates read tables through the imported core; Task 4 registry layer asserts the revalidate, discovery layer asserts the `\b`-count.) |
| `app/api/admin/onboarding/finalize-cas/route.ts` | 1 | **REVALIDATE** | `update public.shows s` (:468) is the `shows.published` flip; the shadow apply also writes crew_members/shows. (:288/:296 are `shows_pending_changes` cleanup — excluded by `\b`.) Task 6: collect affected showId(s), post-`withTx`-commit (`:713-716`) `revalidateTag` each. |
| `lib/sync/unpublishShow.ts` | 2 | **REVALIDATE** | `update public.shows` (:137/:153) — the unpublish/undo flip mutates `shows.published`, gating crew visibility. Task 9: post-commit `revalidateTag` at the unpublish API route + in-app undo action (NOT relying on the tx-side `publishShowInvalidation`). |
| `lib/sync/discardStaged.ts` | 1 | **REVALIDATE** | `update public.shows set last_sync_status/last_sync_error/requires_resync` (:234). `last_sync_status` IS projected (`getShowForViewer.ts:734` `lastSyncStatus`, rendered by StaleFooter), so this mutates rendered data. Task 9: post-commit revalidate at its Next caller. (Spec §5 hedged "likely EXEMPT"; the live projection of `last_sync_status` makes REVALIDATE the correct, staleness-safe classification.) |
| `lib/onboarding/sessionLifecycle.ts` | 2 | **EXEMPT** | `delete from public.shows s` (:406/:652) deletes only FIRST-SEEN INTERIM rows: provenance-keyed (`created_show_id` + drive binding + `wizard_created_session_id`) AND `s.published = false`. An unpublished interim show has no served cache (crew page gates on `published = true`, `getShowForViewer.ts:291`), so deleting it cannot leave a stale rendered entry. The other matches (:391/:667) are `shows_pending_changes` (excluded by `\b`). Reason: `// not-subject-to-revalidate: deletes only unpublished interim/session rows (published=false) — no served crew cache exists for them`. |

### EXEMPT sites added in later tasks (not raw-SQL discovery hits, documented per spec §5)

These are NOT raw-SQL writes to read tables (so they do not appear in the
discovery scan) but the spec §5 matrix flags them for an explicit exemption
comment in Task 9:

| Site | Disposition | Reason |
|---|---|---|
| `lib/auth/picker/{selectIdentity,clearIdentity}.ts` | EXEMPT | Writes `crew_member_auth` only (auth-only, bumps the version token). No show-DATA change; the LIVE `viewerVersionToken` (spec §3.1) handles freshness without a data-cache bust. |
| Share-token rotate / picker-epoch reset RPCs | EXEMPT | Mutate `shows.picker_epoch` / `share_token` (picker/auth columns NOT in the crew DATA projection). |

## Multi-branch files (for Task 4 `revalidateBranches`)

| File | revalidateBranches (expected) |
|---|---|
| `lib/sync/runScheduledCronSync.ts` | 2 (processOneFile apply tail + `missingShows` loop) |

## Tag string + key shape (consumed by every later task)

- Tag: `` `show-${showId}` `` — sole producer `showCacheTag(showId)` (`lib/data/showCacheTag.ts`, Task 2).
- Cache key parts: `["getShowForViewer", showId, viewer.kind, viewer.crewMemberId ?? "admin"]`.
- Cache opts: `{ tags: [showCacheTag(showId)], revalidate: 300 }`.
