# Handoff — M7: Linked content (asset routes, snapshotting, recovery, GC)

**Handed off:** 2026-05-10 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md — M7 is single-implementer Codex)
**Adversarial reviewer:** Opus 4.7 / Claude Code (per ROUTING.md M7 row)
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/07-asset.md`

---

## 1. Spec sections in scope

Plan §M7 cites `Spec context: §6.11, §6.11.1, §7.3, §17.1 milestone 7` across Tasks 7.1–7.9. In practice every M7 task brushes one or more of:

- **§6.11** — `shows.diagrams` JSONB shape (`current` / `pending` sub-payload split per M7 batch-17 finding 1); embedded-image extraction; linked-folder freezing; immutable-pin contracts `(sheetsRevisionId, embeddedFingerprint)` for embedded + `(headRevisionId, md5Checksum)` for linked; per-Apply commit-aware snapshotting with temp prefix → canonical prefix promotion; `asset_recovery` mode (lock-free pre-pass + byte ceiling + drift cooldown); diagram GC (5-pass cron); §6.11's MAX_TOTAL_DIAGRAM_ITEMS = 60 cap upstream of persistence.
- **§6.11.1** — Opening-reel Drive URL substring extractor; reel pin tuple `(driveFileId, drive_modified_time, headRevisionId, mime_type)` four-column atomic-NULL invariant; Apply-time reel drift re-verify (`verifyReelOnApply`); MIME-type gate (non-video → drift); 403 / permission-denied classification.
- **§7.3** — `/api/asset/diagram/[show]/[rev]/[key]` signed-URL contract — bare-UUID rev segment (NO `r=` prefix); literal-equality compare against `current.snapshot_revision_id`; route NEVER reads `pending` sub-payload; single 410 contract for missing bytes (no temp-prefix fallback); `/api/asset/reel/[show]` parity. Idempotent Apply-promotion status endpoint `/api/admin/show/[slug]/apply/[applyId]/status` (Task 7.5b) returns 202-async polling outcomes.
- **§4.1** — `shows.opening_reel_*` four-column schema (`opening_reel_drive_file_id`, `opening_reel_drive_modified_time`, `opening_reel_head_revision_id`, `opening_reel_mime_type`) — Task 7.7 ships the migration that adds `opening_reel_head_revision_id` + `opening_reel_mime_type` if not already shipped by M2.
- **§4.5** — `pending_snapshot_uploads` ledger table (one row per Apply attempt, NOT one per asset; carries `claim_token`, `claimed_at`, `claim_expires_at`, `promote_started_at`, `delete_started_at`, `snapshot_revision_id`, `temp_prefix`, `asset_count`). `recovery_drift_cooldowns` table (composite PK `(show_id, preview_revision_id)`, `last_drift_at`, `retry_count`).
- **§4.6** — `admin_alerts` UPSERT contract for new M7 producer codes (`PENDING_SNAPSHOT_ROLLBACK_STUCK`, `PENDING_SNAPSHOT_PROMOTE_STUCK`, `PENDING_SNAPSHOT_DELETE_STUCK`, `ASSET_RECOVERY_BYTES_EXCEEDED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` if not already shipped by M6, `OPENING_REEL_PERMISSION_DENIED`).
- **§10** — Diagrams gallery rendering rules (Task 7.9 — note flagged in §6 watchpoints).
- **§12.4** — Error-code catalog: every M7-introduced producer code MUST appear in `lib/messages/catalog.ts` with verbatim §12.4 copy; new codes enumerated in Task 7.4 Step 3, Task 7.5 Step 2, Task 7.6 Step 2, Task 7.7 Step 3.
- **§17.1** — Per-milestone acceptance criteria AC-7.1..AC-7.25 (the plan covers AC-7.25 in Task 7.6 even though the §17 line range nominally caps at AC-7.24; see §2 below).

## 2. Acceptance criteria

Per plan file `07-asset.md` Task-header AC references. Every AC ID must have at least one passing assertion.

- **AC-7.1** — Drive PDF in `agenda_links` renders inline embed via PDF.js OR `<iframe>`. [Task 7.9]
- **AC-7.2** — linked folder URL → gallery (up to 12 initial; "Show more" reveals rest). [Task 7.9]
- **AC-7.2a** — embedded-image extraction inside `enrichWithDrivePins`; DIAGRAMS-tab case-insensitive lookup; combined cap upstream of persistence. [Task 7.1]
- **AC-7.2b** — merged gallery: linked folder + embedded → embedded first ordering. [Task 7.9]
- **AC-7.3** — opening reel inline `<video>` with `src="/api/asset/reel/<show>"`. [Task 7.9 + Task 7.6]
- **AC-7.4** — gallery image fetches go through `/api/asset/diagram/...`; never expose raw Drive URL in HTML. [Task 7.5]
- **AC-7.5** — linked-folder cap of 60: folder with 78 images → first 60 + admin warning. [Task 7.2 + Task 7.9]
- **AC-7.6** — embedded-image cap: 65-image sheet renders only 60 + `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` warning to admin. [Task 7.1 + Task 7.9]
- **AC-7.7** — embedded image with 4xx download URL → `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` warning; gallery renders placeholder slot (does NOT hide). [Task 7.9]
- **AC-7.8** — stage parse with embedded images → Apply (Phase 2 commits with `snapshotPath`s); EDIT image in Drive without re-syncing → crew page continues serving original bytes; after fresh re-sync + Apply, page reflects new image. [Task 7.3]
- **AC-7.9** — orphan blobs from prior revisions GC'd at 7 days (active) / 30 days (archived); suppressed when current revision is in `partial_failure` OR `partial_failure_restage_required`. [Task 7.8]
- **AC-7.10** — two manual applies of same `modifiedTime` produce DISTINCT `snapshot_revision_id` AND DISTINCT storage prefixes. [Task 7.3]
- **AC-7.11** — partial_failure → next cron pass enters `mode: 'asset_recovery'` (NOT Phase 2); retries only missing `snapshotPath`; flips status to `'complete'` on success. [Tasks 7.3 + 7.4]
- **AC-7.12** — auth gates: no signed-link cookie OR Google session → 401; cookie session whose crew_member is no longer in this show → 403; after "Issue New Link" → 410; no long-lived signed Storage URLs. [Task 7.5]
- **AC-7.13** — linked DIAGRAMS folder with 3 images → 3 entries in `linkedFolderItems[]`, each with the 6-tuple `(driveFileId, mimeType, alt, drive_modified_time, headRevisionId, md5Checksum)`. [Task 7.2]
- **AC-7.14** — synthesized `partial_failure` with one embedded + one linked unresolved → recovery retries BOTH; flips to `complete` on success. [Task 7.4]
- **AC-7.15** — revision-versioned URL — request with prior revision → 410. [Task 7.5]
- **AC-7.16** — in `partial_failure`, sheet edited (modtime advances) → next cron takes NORMAL Phase 2 path (NOT asset_recovery); broken diagram carried forward as NULL against new revision; non-diagram updates land within sync window. [Task 7.4]
- **AC-7.17** — cache revalidation propagates revocation: load image, click "Issue New Link" → reuse cached URL → server returns 410. [Task 7.5]
- **AC-7.18** — reel route auth + cache parity with diagram route. [Task 7.6]
- **AC-7.19** — between stage and Apply, add 4th file to linked DIAGRAMS folder → Apply commits with exactly 3 frozen images; 4th NOT included. [Task 7.2]
- **AC-7.20** — linked-folder image edited in place → version-pin mismatch → `snapshotPath` stays NULL + `LINKED_ASSET_DRIFTED` warning; asset_recovery does NOT silently download drifted bytes. [Tasks 7.3 + 7.4]
- **AC-7.21** — reel file edited after last Apply → page hits route → route compares modtime AND `headRevisionId` to `shows.opening_reel_*` → drift → 410 + placeholder. [Task 7.6]
- **AC-7.22** — cell with Drive URL → ALL FOUR reel pin columns NOT NULL after Apply. [Task 7.6 + Task 7.7]
- **AC-7.23** — cell `YES - LOOP VIDEO https://drive.google.com/file/d/<id>/view` → ALL FOUR reel pin columns NOT NULL AND crew page renders text+video. [Task 7.6 + Task 7.7]
- **AC-7.24** — stage with reel URL; EDIT reel between stage and Apply; click Apply → §6.11.1 detects drift → all reel pin columns persist NULL atomically + `REEL_DRIFTED` warning; route returns 410. [Task 7.6 + Task 7.7]
- **AC-7.25** — crew DOM `not.toContain('https://')` AND `not.toContain('drive.google.com')` for opening_reel across all four cases (mixed-value valid pin, pure-URL valid pin, text-only, drift). M7 counterpart to M4's AC-4.5. [Task 7.6 + Task 7.9]

Note: although the user-provided handoff brief named "AC-7.1..AC-7.24," Task 7.6 explicitly carries AC-7.25 — it is the URL-strip render contract from §10 extended into M7. Include AC-7.25 coverage in exit criteria.

## 3. Spec amendments in scope

- [ ] Amendment 1 — `listForRepo` recovery contract — **N/A — only M8.**
- [ ] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — only M8.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — only M8.**
- [ ] Amendment 4 — `{v1, v2, v4}` parser registry — **N/A — only M1.**
- [ ] Amendment 5 — v4 single-marker simplification — **N/A — only M1.**
- [ ] Amendment 6 — Sheets modtime-CAS binding — **N/A — applies at M6 sync layer; M7 consumes the binding contract but does not amend it.**
- [ ] Amendment 7 — MI-8 / MI-8b modtime-stable debounce — **N/A — only M6.**
- [ ] Amendment 8 — MI-9 LEAD-bit narrowing + `ROLE_FLAGS_NOTICE` — **N/A — only M6.**
- [ ] Amendment 9 — first-seen auto-publish + 24h unpublish undo — **N/A — deferred as M6-D12.**

**None of the nine ratified plan amendments apply to M7.** The three §13.2.3 amendments are explicitly M8-only. Amendment 6's modtime-CAS binding affects how M6's `runScheduledCronSync` captures the spreadsheet head; M7's `enrichWithDrivePins` (Task 7.1) extends that runtime with per-asset binary-asset binding (`sheetsRevisionId`, `embeddedFingerprint`, `headRevisionId`, `md5Checksum`) — but the per-asset binding contract is in spec §6.11, NOT in Amendment 6.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0, M1, M2, M3, M4, M5, M6 closed. Current `git log` head at handoff authoring is `ae6f0b8 docs(handoff): record M6 cross-model APPROVE (Claude + Codex)`. Working tree clean.
- [ ] **Pre-flight tests passing in isolation** (do NOT parallelize with Playwright):
  - `pnpm lint` exits 0.
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0 (M6 close-out baseline — re-verify at kickoff).
  - `pnpm test:e2e --project=mobile-safari` exits 0 (M6 close-out baseline).
  - `pnpm dlx supabase db reset && pnpm db:seed` applies cleanly.
- [x] **Specific files present from prior milestones**:
  - [x] All M0–M6 deliverables: parser modules, all schema migrations, tile components, validators, advisory-lock helper, message catalog, alert banner, error-explainer, requireAdmin, sync engine (`lib/drive/**`, `lib/sync/**`, `app/api/cron/sync/route.ts`, `app/api/drive/webhook/route.ts`, etc.), admin parse panel.
  - [x] `lib/sync/lockedShowTx.ts` — M6-shipped helper exposing `withShowLock` + branded `LockedShowTx<Tx>`. M7 consumes for `assetRecovery`, `applyStaged` (already consumed at M6), and the post-commit promoter's `promote:`-keyed lock (NEW key family; see §5 advisory-lock topology).
  - [x] `lib/db/advisoryLock.ts` — M5-shipped auth-side helper `withShowAdvisoryLock(showId, mode, fn)`. M7 does NOT touch.
  - [x] `lib/messages/catalog.ts` + `lib/messages/lookup.ts` — M5-shipped, M6-extended. M7 EXTENDS with the new producer codes listed in §1 above.
  - [x] `lib/sync/enrichWithDrivePins.ts` — M6-shipped at the spreadsheet-metadata-capture layer. M7 Task 7.1 EXTENDS with embedded-image extraction; Task 7.2 EXTENDS with linked-folder freezing. Phase boundary preserved: `parseSheet` stays pure-parser; all Drive/Sheets API calls live in `enrichWithDrivePins`.
  - [x] `lib/sync/applyStaged.ts`, `lib/sync/phase2.ts` — M6-shipped. M7 Task 7.3 modifies `phase2.ts` to call new `lib/sync/snapshotAssets.ts`; Task 7.7 modifies `applyStaged.ts` + `phase2.ts` to call new `lib/sync/verifyReelOnApply.ts`.
  - [x] `tests/sync/_metaInfraContract.test.ts` — M6-shipped. M7 EXTENDS with new helpers (`snapshotAssets`, `assetRecovery`, `verifyReelOnApply`, `diagramGc`, and every new route handler).
  - [x] `tests/sync/_advisoryLockSingleHolderContract.test.ts` — M6-shipped. M7 EXTENDS with the NEW `promote:` key family (post-commit promoter + admin repair endpoint) AND with `assetRecovery`'s `show:`-keyed lock acquisition.
  - [x] `tests/messages/_metaAdminAlertCatalog.test.ts` — M5-shipped, M6-extended. M7 EXTENDS with new admin_alerts codes (§1).
- [ ] **NEW M7 modules / routes that do NOT yet exist** (Codex creates):
  - `lib/sync/snapshotAssets.ts` (Task 7.3)
  - `lib/sync/assetRecovery.ts` (Task 7.4)
  - `lib/sync/diagramGc.ts` (Task 7.8)
  - `lib/sync/verifyReelOnApply.ts` (Task 7.7 — implied by the helper return-type contract)
  - `lib/crypto/sha256.ts` (shared streaming-hash helper for Task 7.1 / 7.3 / 7.4 — declare it once and reuse)
  - `app/api/asset/diagram/[show]/[rev]/[key]/route.ts` (Task 7.5)
  - `app/api/asset/reel/[show]/route.ts` (Task 7.6)
  - `app/api/cron/asset-recovery/route.ts` (Task 7.4)
  - `app/api/cron/diagram-gc/route.ts` (Task 7.8)
  - `app/api/admin/show/[slug]/apply/[applyId]/status/route.ts` (Task 7.5b)
  - `app/api/admin/snapshot-rollback/[id]/repair/route.ts` (Task 7.8 Step 3)
  - `components/tiles/DiagramsTile.tsx`, `components/diagrams/Gallery.tsx`, `components/agenda/AgendaEmbed.tsx` (Task 7.9 — **UI-rule conflict; see §6 watchpoints and §11**)
- [ ] **NEW migrations that do NOT yet exist** (Codex creates):
  - `pending_snapshot_uploads` table per spec §4.5 (one row per Apply attempt; columns per plan Task 7.3 step 2 sub-step 1). M7 extends Task 2.2's introspection matrix to include this table — same pattern M6 used for `revision_race_cooldowns`.
  - `recovery_drift_cooldowns` table (composite PK `(show_id, preview_revision_id)`). NOTE: M6 handoff §4 already lists this table as M6-or-M7 ownership; verify at kickoff whether M6 shipped it (check `supabase/migrations/` and `tests/db/schema-introspection.test.ts`). If M6 shipped, M7 only consumes; if not, M7 ships in Task 7.4's migration.
  - `shows.diagrams` JSONB shape migration enforcing the `current` / `pending` sub-payload split if not already shipped at M6. Per M6 handoff watchpoint 17, M6 wrote ONLY to `pending`; verify the column shape at kickoff.
  - `shows.opening_reel_head_revision_id` + `shows.opening_reel_mime_type` columns if not already shipped at M2 (Task 7.7 Step 3 documents this; verify against `supabase/migrations/`).
  - Partial index on `pending_snapshot_uploads` for the reclaim-expired sweep predicate (`pending_snapshot_uploads_claim_expiry_idx` per Task 7.8 Step 2 ii) — DDL with `WHERE promote_started_at IS NULL`.
- [x] **Env vars set in `.env.local`**: all M0–M6 vars present. M7 introduces NO new env vars — Drive + Storage credentials already in place from M6.
- [ ] **`vercel.json` cron schedules**: M6 added the 5 cron schedules (sync, keepalive, refresh-watch, gc-watch, diagram-gc). M7 ADDS `*/15 * * * * /api/cron/asset-recovery` (or per spec §5.2 cadence — verify at Task 7.4 close). Cron registry diff: ONE new entry.

If any required pre-flight command fails, do NOT start the next M7 task. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

Every invariant ticked here is exercised by M7's code paths.

- [x] **TDD per task** (always applies). Every task: failing test → minimal implementation → passing test → commit. Self-review runs after.

- [x] **Per-show advisory lock** (AGENTS.md §1.2). M7 mutates `shows` (Phase 2 writes the `pending` sub-payload at Task 7.3; post-commit promoter atomic-cutovers `current` ← `pending` at Task 7.3 step 6d; `asset_recovery` mutates `shows.diagrams` at Task 7.4 step 7; reel drift writes mutate the 4 reel pin columns at Task 7.7). Every M7 code path that mutates protected tables runs inside an advisory lock.

  **Single-holder rule enumeration (AGENTS.md §1.2 / M5 R20 / M6 §1.2 invariant table):** M7 introduces a NEW lock-key family (`promote:`) that is DISTINCT from the existing `show:` family. The two families never collide.

  | Code path | Hashkey source | Hashkey shape | Holder layer | Notes |
  | --------- | -------------- | ------------- | ------------ | ----- |
  | `applyStaged` Phase 2 commit (M6-shipped; M7 amends to write `pending`) | `drive_file_id` | `hashtext('show:' \|\| drive_file_id)` | JS-side via `withShowLock` (blocking) | Already pinned at M6 §5 invariant table. M7 only modifies the write target inside the lock (writes `diagrams.pending`, NOT `diagrams.current`). |
  | Post-commit promoter (Task 7.3 step 6) | `show_id` | `hashtext('promote:' \|\| show_id)` | **NEW** JS-side via `pg_advisory_xact_lock` (blocking; NOT try-variant — queue behind any in-flight promoter) | Runs OUTSIDE the Apply HTTP request (in `waitUntil` / background worker per §6.11). MUST NOT also acquire the `show:` key — the two key families are disjoint. |
  | `assetRecovery` (Task 7.4) | `drive_file_id` | `hashtext('show:' \|\| drive_file_id)` | JS-side via `pg_try_advisory_xact_lock` (try-variant; `CONCURRENT_SYNC_SKIPPED` on contention) | Lock held ONLY for DB writes (Step 1 onward). Lock-free pre-pass (Step 0) runs outside the lock — measured lock-hold window MUST be <1s even for 60-image / 3GB recovery runs. The `show:` key is shared with M6 cron/push/manual paths; the meta-test asserts single-holder under the existing topology. |
  | Diagram-GC cron pass (Task 7.8) | none (per-row work touches Storage + ledger, not `shows.diagrams` directly) | n/a | NO advisory lock at the cron-pass level | Per-row promotion-retry (iv-a) re-enters Task 7.3 step 6's promoter — the promoter acquires `promote:` at that point. DELETE-ORPHAN (iv-b) uses ledger-level claim discipline (claim_token + delete_started_at) instead of advisory locks. |
  | Admin repair endpoint `/api/admin/snapshot-rollback/[id]/repair` (Task 7.8 step 3) | `show_id` (then `drive_file_id`) | First `hashtext('promote:' \|\| show_id)` (blocking), then `hashtext('show:' \|\| drive_file_id)` (blocking) | JS-side via `pg_advisory_xact_lock` for BOTH | The repair endpoint queues behind any healthy in-flight promoter — the `promote:` lock is the byte-protection ; the `show:` lock serializes against any concurrent Phase-2 Apply / cron / push for the same show. Two locks acquired in a fixed order (promote-key first, show-key second) to avoid deadlock with the cron / Apply paths. |

  **Critical: M7 introduces the `promote:` key family. This is a NEW lock-key prefix DISTINCT from `show:`.** The single-holder rule applies WITHIN each key family — `show:` has one holder (already pinned by M6's enumeration); `promote:` has one holder (the post-commit promoter OR the admin repair endpoint, never both at once because the repair endpoint blocks on the same key). The two families never share a hashkey, so cross-family deadlock is structurally impossible. **`tests/sync/_advisoryLockSingleHolderContract.test.ts` MUST extend to register both families and assert per-family single-holder.**

  **Test command:** `pnpm test tests/sync/_advisoryLockSingleHolderContract.test.ts` (M6-shipped — M7 extends).

- [x] **Email canonicalization at boundary** (AGENTS.md §1.3). **Largely N/A for M7 — M7 deals with binary assets (image bytes, video bytes, PDF embeds) and asset metadata (driveFileId, modtime, headRevisionId, md5Checksum, mime_type, embeddedFingerprint).** M7 does NOT read emails from Drive parse output. The lone caveat: if Task 7.4's `assetRecovery` ever reads `pending_syncs.parse_result` for any reason (it MUST NOT per plan Task 7.4 explicit statement — recovery reads `shows.diagrams` only), the meta-test `tests/admin/no-inline-email-normalization.test.ts` glob (extended to `lib/sync/**` at M6) already covers `lib/sync/assetRecovery.ts`. No new email-canonicalization surfaces in M7.

- [x] **No global cursor** (AGENTS.md §1.4). M7 does NOT touch any sync cursor. `shows.last_seen_modified_time` is read but NEVER advanced by `asset_recovery` (plan Task 7.4 Step 8 explicit: "Asset recovery never advances watermarks"). Regression: `! rg "lastPollAt" lib app supabase tests` returns zero. M6 already passes this; M7 must NOT regress.

- [x] **No raw error codes in user-visible UI** (AGENTS.md §1.5). M7's asset routes return error codes (`REEL_NOT_AVAILABLE`, `REEL_DRIFTED`, `REPORT_HORIZON_EXPIRED`-style 410 bodies). These are machine-readable response bodies, NOT user-rendered UI strings — crew pages render placeholders, never the raw code. However, the admin status endpoint (Task 7.5b) returns codes in JSON (`PENDING_SNAPSHOT_NOT_STUCK`, `PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT`, `STORAGE_RENAME_FAILED`); the admin UI that polls this endpoint (if any — currently only operator polling; no UI surface in M7 per ROUTING.md) must route surface-visible codes through `lib/messages/lookup.ts` `messageFor(code, params?)`. **Task 7.9 gallery / agenda / tile components MUST route any error-state copy through `messageFor`** (e.g., `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` placeholder text for AC-7.7 — see §6 watchpoint about Task 7.9 UI-rule conflict).

- [x] **Commit per task** (AGENTS.md §1.6). One task per commit, conventional-commits format. Common scopes for M7: `sync`, `assets`, `crew-page`, `admin`, `db`. The plan's per-task Step 3 already names canonical commit subjects — use them verbatim. Don't batch tasks. Don't allow the format to drift across the milestone.

- [x] **Spec is canonical** (AGENTS.md §1.7). M7 introduces NO new amendments to the spec. The current/pending JSONB sub-payload split (Task 7.3 step 4) and the 4-column atomic-NULL reel pin tuple (Task 7.7) were already ratified into the spec at M6 review batches (per spec §6.11 / §6.11.1 / §4.1 internal amendments — verify against the spec file at kickoff).

- [x] **UI quality gate (impeccable v3 critique + audit pair)** (AGENTS.md §1.8). **See §12 — Task 7.9 is the M7 UI surface that triggers this gate, BUT per ROUTING.md M7 row, UI rendering "lives in M4 tiles." There is a documented contradiction between the plan and ROUTING.md; resolve at kickoff before starting Task 7.9.** If Task 7.9's components ship in M7 as written, the gate applies; if they're carved off to Opus per the UI hard rule, M7 §12 becomes N/A and a follow-up Opus milestone handles the gate.

- [x] **Supabase call-boundary discipline** (AGENTS.md §1.9). Every new Supabase client call in `lib/sync/snapshotAssets.ts` / `lib/sync/assetRecovery.ts` / `lib/sync/diagramGc.ts` / every M7 route handler destructures `{ data, error }`; returned-error and thrown-error paths are distinguished; infra faults surface as discriminable typed results (`{ kind: 'infra_error' }` or typed `*InfraError` thrown), never as silent `continue` or benign auth signals. Every helper subject to this contract is registered in `tests/sync/_metaInfraContract.test.ts` (M6-shipped, M7 extends — see §13 below). New call sites EITHER add a registry row OR carry an inline `// not-subject-to-meta: <reason>` comment. This is the M5 R3–R22 lesson distilled into structural test — M7 inherits the registry pattern from M6 and MUST add a row for every new helper / route on first commit, not at round 14.

## 6. Watchpoints from prior adversarial review

M7 has not yet been implemented; no prior M7 convergence log exists. Watchpoints below carry forward from M5 / M6 convergence logs plus the M7-specific failure modes the plan itself codifies. **Round-1 reviewer will scan the diff against this list first.**

### M5/M6-carry-forward classes (still active in M7)

1. **Single-holder advisory-lock rule (M5 R20 CRITICAL — DEADLOCK CLASS; M6 §1.2 invariant table).** M7 INTRODUCES the `promote:` key family. The §5 advisory-lock topology table above is the ground-truth enumeration. Whenever M7 touches `pg_advisory*` SQL — whether in JS-side wrappers, in `withShowLock` callers, in SECURITY DEFINER RPCs, or in raw migrations — the Fix-round regression budget rule applies (re-grep the class across the surface after each patch; confirm `_advisoryLockSingleHolderContract.test.ts` still passes; note both in round closure). **Specific M7 risk:** the post-commit promoter and the admin repair endpoint both acquire `promote:` — the meta-test must assert this is single-holder-per-key (the repair endpoint queues behind the promoter, never races it).

2. **Supabase call-boundary discipline (M5 R3–R22 — six consecutive bug-class rounds; M6 inherited).** M7's analogous registry is the existing `tests/sync/_metaInfraContract.test.ts` (M6-shipped). Every new Supabase call in `lib/sync/snapshotAssets.ts` / `lib/sync/assetRecovery.ts` / `lib/sync/diagramGc.ts` / `lib/sync/verifyReelOnApply.ts` / every M7 route handler MUST destructure `{ data, error }`; MUST distinguish returned-error vs thrown-error paths; MUST NOT mask infra faults as benign continue / skip / auth signals. Each helper either registers a row in the meta-test OR carries an inline `// not-subject-to-meta: <reason>` comment. Pre-emptive registration at task time eliminates the round-14 discovery class — codified in AGENTS.md §1.9 + memory `feedback_meta_test_at_plan_time_not_round_n.md`.

3. **`admin_alerts.upsert(...)` requires non-null `dougFacing` and returned-error inspection (M5 R21 F2 + R22 F1; M6 R10 extension).** Every catalog code used in production `admin_alerts.upsert` MUST have non-null `dougFacing`. M7 introduces multiple new admin_alerts producer codes (`PENDING_SNAPSHOT_ROLLBACK_STUCK`, `PENDING_SNAPSHOT_PROMOTE_STUCK`, `PENDING_SNAPSHOT_DELETE_STUCK`, `ASSET_RECOVERY_BYTES_EXCEEDED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `OPENING_REEL_PERMISSION_DENIED`, and any `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` references not already shipped by M6) — each MUST land in the catalog with non-null `dougFacing` AND a registered row in `tests/messages/_metaAdminAlertCatalog.test.ts`. Returned-error from `.upsert(...)` MUST throw and route to the cataloged 503 path, NOT silently continue.

4. **Class-sweep code-shape-based, not name-list-based (memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`).** When a reviewer surfaces a bug, grep the codebase for the same SHAPE BEFORE patching only the named instance. M6 R7, R9, R11 each surfaced parallel surfaces beyond the named one — fixing only the named instance burned rounds. M7 risk: the §6.11 / §6.11.1 protocols are dense with parallel surfaces (forward-rename + reverse-rename + reclaim-expired + initial-claim + commit-to-delete all touch `pending_snapshot_uploads` — a bug in one is likely a bug in all). Class-sweep mandates must specify the SHAPE + an explicit `rg` procedure, NOT just name entry points.

5. **Negative-regression verification (memory `feedback_negative_regression_verification.md`).** Every new test in M7 MUST have its production-side fix stashed and the test confirmed-failing before shipping. Tautological tests pass same-model spec+code-quality reviews; only stash-then-verify proves the contract is pinned. This applies especially to:
   - The TOCTOU drift tests in Task 7.2 / 7.3 / 7.6 (revision-id race vs md5 race).
   - The all-or-nothing promotion rollback regression (Task 7.3 step 6).
   - The cooldown-gate tests in Task 7.4 (drift UPSERTs cooldown row; successful recovery clears cooldown).
   - The streaming hard-stop tests (Task 7.4 — 51MB single-image, cumulative 3GB).
   - The `r=`-prefixed URL rejection (Task 7.5).
   - The 4-column atomic-NULL persistence (Task 7.7).

6. **Iterate adversarial review until APPROVE (memory `feedback_iterate_until_convergence.md`).** Round-3 cap is for value-judgment loops, NOT for halting when each round surfaces NEW bugs. M5 ran R3–R22 + SR-1..SR-9. M6 ran 14 rounds + cross-model verification. **M7 should expect 5–15 rounds — sync + storage + cron is the deepest invariant-density surface in the project, and M7 layers a 3-state ledger lifecycle + a separate lock-key family on top of M6's already-dense topology.** Plan accordingly; do NOT halt at round 3.

7. **Fix-round regression budget (memory `feedback_class_sweep_before_patch.md` + AGENTS.md "Writing-plans additions").** When a fix in round N patches surface S for class C, round (N+1) preparation must include: (a) re-grep class C across S after the patch, (b) confirm the relevant meta-test still passes, (c) note both in the round closure. M5 R19→R20 introduced a CRITICAL deadlock by patching an advisory-lock hole on a surface that already had a JS-side wrapper.

8. **Meta-tests at plan time, not round N (memory `feedback_meta_test_at_plan_time_not_round_n.md` + AGENTS.md §1.9).** §13 below pre-declares M7's meta-test extensions. Codex MUST land them in the first task that touches the relevant surface — not at round 14. Pre-declaring the registry at plan time eliminates the rounds before they happen.

9. **echo append discipline (memory `feedback_echo_append_newline_trap.md`).** Never use `echo "X" >> .gitignore` or similar — no trailing newline guarantee. Use `printf '\n%s\n'` and verify with `git check-ignore -v <path>`. M0 R1 + M4 R7 both shipped malformed gitignore entries this way; M7 introduces NO new gitignore entries (M0's `.next/` cache pattern covers Next.js dist; Storage objects are remote, not local; tempfiles under `os.tmpdir()` are auto-cleaned). If any gitignore touch is needed at M7, use `printf`.

10. **codex exec needs stdin closed (memory `feedback_codex_exec_needs_stdin_closed.md`).** `codex exec ... "$prompt"` hangs forever waiting on stdin EOF in non-interactive contexts; ALWAYS append `< /dev/null`. Monitor codex worker CPU% (0.0% for 2+ min = stdin hang). Already encoded in `/codex:adversarial-review` slash command and `/codex:rescue --resume-last`; do NOT raw-shell `node codex-companion.mjs` for M7 reviews.

### M7-specific watchpoints

11. **Storage-write vs DB-commit race (Task 7.3 — already addressed in plan, but watch for regression).** The pre-M7 protocol uploaded bytes to the canonical prefix BEFORE the DB transaction committed, leaving orphan blobs on rollback. M7's commit-aware protocol writes to a temp prefix `_pending/<run_uuid>/` under one ledger row (per-Apply, NOT per-asset) AND only the post-commit promoter renames to the canonical prefix AFTER the JSONB cutover commits. **Regression risk:** any new code path that writes to Storage MUST go through `snapshotAssets` (temp prefix) → promoter (rename to canonical). Direct writes to `diagram-snapshots/shows/<show_id>/<rev>/...` from any surface other than the promoter are a P0 bug. Class-sweep test: `! rg "diagram-snapshots/shows" lib app | rg -v "lib/sync/snapshotAssets|lib/sync/diagramGc|lib/sync/assetRecovery|app/api/asset|app/api/admin/snapshot-rollback"` returns zero matches.

12. **Revision-versioned URLs are bare UUIDs — NO `r=` prefix (Task 7.5).** The plan explicitly rejects any URL whose `params.rev` contains `r=` or `=` — even if the embedded UUID matches `current.snapshot_revision_id`. This is a hard-rejection marker to protect against legacy URLs leaked into browser caches. Regression: `! rg "r=\${" app/api/asset` returns zero matches; gallery render in Task 7.9 emits `/api/asset/diagram/<show>/<bare-uuid>/<key>` ONLY. Storage object key on the write side is also a bare UUID: `diagram-snapshots/shows/<show_id>/<snapshot_revision_id>/<assetKey>` (no `r=` prefix in the storage path either).

13. **`pending` sub-payload is NEVER read by asset routes (Task 7.5 — prior-revision-authoritative-until-promote-succeeds contract).** The route does literal equality on `(shows.diagrams->'current'->>'snapshot_revision_id')::uuid` ONLY. The `pending` sub-payload is the cutover staging slot for the post-commit promoter and is invisible to crew. Required regression: synthesize a state where `current.snapshot_revision_id = $priorRev` AND `pending.revision_id = $newRev`; request the route with `[rev] = $newRev` → assert 410 (the new revision is staged but not cutover; route NEVER falls through to `pending` lookup, even on miss).

14. **Embedded fingerprint MUST be content-derived SHA-256 of full bytes (Task 7.1).** NOT an HTTP ETag (server-controlled, can rotate without bytes changing). NOT a HEAD-derived token. NOT a positional/id hash. NOT a Last-Modified timestamp. The plan's "ETag-skew test" (Task 7.1 Step 1 sub-test c) is the canonical regression: server changes `ETag` response header WITHOUT changing the response body → assert `embeddedFingerprint` is unchanged across the two fetches (proves the derivation does NOT consume ETag). Cross-call-site equality: same bytes hashed at enrichment + Apply + asset_recovery produce the SAME `embeddedFingerprint`; all three call sites use the same `lib/crypto/sha256.ts` helper.

15. **TOCTOU drift gates on every byte-fetch surface (Tasks 7.1 / 7.2 / 7.3 / 7.6).** Drive provides two immutable identifiers: `headRevisionId` (per-revision token; downloadable via `revisions.get(fileId, revisionId, alt='media')`) and `md5Checksum` (content hash for binary files). The plan's Pattern A (preferred: `revisions.get` for exact-revision stream) and Pattern B (fallback: `files.get(alt='media')` + buffer-then-verify md5 BEFORE serving any bytes) close the TOCTOU window. **Anti-pattern to detect:** ANY code path that compares `headRevisionId` BEFORE the stream call and then trusts the bytes is broken — Drive can mutate between the comparison and the response stream. Class-sweep `rg "headRevisionId" lib/sync app/api` and verify every byte-fetch surface uses Pattern A (preferred) or Pattern B (buffer-then-verify after the fact, NOT before).

16. **Streaming hash invariant — never `Buffer.concat` the full body (Tasks 7.1 / 7.3 / 7.4 / 7.6).** Every byte fetch is read via a Node.js `Readable` stream piped into `crypto.createHash('sha256')` / `crypto.createHash('md5')` AND the Storage upload — bytes are NEVER fully buffered. This caps in-memory residency at the streaming-chunk size regardless of asset size. **Exception:** Task 7.6 Pattern B fallback (reel route) buffers the full reel body to recompute md5 BEFORE serving any bytes — the plan accepts this as v1 (reel videos are typically small to medium; fixture-defined sizes). For diagrams (which can be 50MB single + 3GB cumulative) the streaming hash is MANDATORY. Class-sweep: `rg "Buffer.concat" lib/sync` and verify no diagram byte-fetch surface buffers.

17. **Per-recovery-run byte ceiling (Task 7.4 streaming hard-stop).** The single-image cap is 50MB (mid-stream `stream.destroy` when `entryBytes` exceeds); the cumulative cap is 3GB (mid-stream abort when `cumulativeBytes` crosses). The metadata pre-flight cap (`metadata.size`) is unimplementable for embedded images (Drive doesn't return `size` for `drive.revisions.list` against `image.contentUrl`) — the streaming hard-stop is therefore the ONLY authoritative gate for embedded. Test the embedded 51MB mid-stream abort explicitly (Task 7.4 Step 1 — synthesize 51MB embedded fixture; assert `entryBytes` counter never reaches 51MB + epsilon; the abort fires AS SOON AS the cap is crossed, not after the full body buffers).

18. **Cooldown-gate exponential backoff (Task 7.4 Step 0a).** Backoff = `LEAST(60 * 2^retry_count, 600)` seconds. Composite-key isolation per `(show_id, preview_revision_id)` — a different `previewRev` against the same show is independent. Manual re-sync bypasses the gate; successful recovery DELETEs matching cooldown rows. The test matrix in Task 7.4 Step 1 covers all branches; ensure all are present in the first round's diff, not added later. The `recovery_drift_cooldowns` table mirrors M6's `revision_race_cooldowns` pattern (composite PK; UPSERT on drift) — Codex can lift the migration shape directly from M6's prior art.

19. **Diagram-gc cron coordination with asset-recovery cron (Task 7.8 step 2 — 5-pass per run).** Both crons take show-scoped locks at different times. The plan resolves the topology:
    - **GC pass (i) orphan-blob sweep** does NOT take advisory locks (Storage-only DELETEs); guarded by the predicate "blob's `<revision_id>` segment ≠ `current.snapshot_revision_id` AND ≠ `pending.revision_id` of any `pending_snapshot_uploads` row with `promote_started_at IS NOT NULL`."
    - **GC pass (ii) reclaim-expired** + **(iii) initial-claim** mutate `pending_snapshot_uploads` via the claim_token discipline (NOT advisory locks). The `delete_started_at IS NULL` and `promote_started_at IS NULL` predicates are the byte-protection invariants — reclaim REFUSES rows in either non-reclaimable state. **Class-sweep test:** every reclaim UPDATE must carry BOTH predicates AND the partial index `pending_snapshot_uploads_claim_expiry_idx` must include both predicates in its `WHERE` clause.
    - **GC pass (iv-a) RENAME-RETRY** re-enters the post-commit promoter (Task 7.3 step 6) — acquires `promote:` lock at that point.
    - **GC pass (iv-b) DELETE-ORPHAN** commits-to-delete via the `delete_started_at` UPDATE BEFORE Storage DELETE. Without the commit-to-delete state, a revived worker after expiry could double-delete.
    - **GC pass (v) post-promotion cleanup** + stuck-state recovery emit `admin_alerts` codes but NEVER auto-clear stuck rows — admin repair endpoint is the only path.

    **The 3-state lifecycle (claimed → committing_delete OR promote_started_at) is the byte-protection contract** — promote and reclaim-expired both refuse rows in either non-reclaimable state. A revived worker after the original claim's lease slipped CANNOT delete bytes another worker already committed to delete. This is the load-bearing invariant of M7's GC topology; round-1 review focuses here.

20. **Async 202 promotion contract (Task 7.5b).** Apply route returns 202 within 200ms of the Phase-2 DB COMMIT (NOT after the promoter completes); the promoter runs in `waitUntil` / background worker. The operator client polls the status endpoint to learn the eventual outcome. **Without this split**, an Apply landing while another Apply's promoter for the same show held the `promote:` lock would block the HTTP request indefinitely; if the client disconnected mid-block, the promoter outcome would be ambiguous. With the split, NO state mutation is lost — Phase-2 commit happened before the 202 was sent. The status endpoint is pure-read (no DB writes; no admin log entries per poll). **Idempotency under poll:** 100 GETs in 100ms produce identical response bodies and zero DB writes.

21. **Reel 4-column atomic-NULL invariant (Task 7.7).** Every code path that persists `shows.opening_reel_*` MUST persist ALL FOUR columns in the same SQL UPDATE. The `verifyReelOnApply` helper returns `SetReelColumnsArg = { driveFileId: string|null; drive_modified_time: string|null; headRevisionId: string|null; mimeType: string|null }` (exact-type) and the SQL site uses the helper's return verbatim. **Static-analysis test:** grep `lib/sync/` for `'opening_reel_'`; every `UPDATE shows SET ...` that touches any reel column MUST touch all four. Test fails with named diff if any `UPDATE` is missing one of the four column names.

22. **Pre-draft code-verification pass (AGENTS.md writing-plans rule).** Before Codex writes any test that names a specific table column, RPC argument, RLS policy, constraint, or fixture shape, grep against the live codebase. M2 schema defines column names; M5 defines the message catalog shape; M6 defines the advisory-lock helper interface. Don't invent.

23. **Self-consistency sweep at M7 close.** `! rg "lastPollAt" lib app supabase tests` returns zero. `! rg "WATCH_CHANNEL_CREATE_FAILED" lib app supabase tests` returns zero (canonical alert code is `WATCH_CHANNEL_ORPHANED`). `! rg "drive\.google\.com|docs\.google\.com" components app/show` returns zero (M4 invariant preserved). `! rg "viewerRole" lib app components` returns zero (M4 invariant preserved). `! rg "__Host-fxav_session" lib app components | rg -v "lib/auth/cookies.ts|lib/auth/constants.ts"` returns zero (M5 invariant preserved). M7 adds: `! rg "r=\\\$" app/api/asset` returns zero (no `r=`-prefixed URLs in code); `! rg "Buffer\\.concat" lib/sync/snapshotAssets.ts lib/sync/assetRecovery.ts` returns zero (streaming-hash invariant); every `UPDATE.*shows.*opening_reel_` touches all four reel columns.

24. **🚩 ROUTING.md vs Task 7.9 UI-rule conflict.** ROUTING.md M7 row says "rendering of these assets lives in M4 tiles" — implying M7 has zero UI deliverables. **BUT** Task 7.9 in `07-asset.md` creates `components/tiles/DiagramsTile.tsx`, `components/diagrams/Gallery.tsx`, `components/agenda/AgendaEmbed.tsx` — three new files under `components/`, which is UI surface per AGENTS.md hard rule ("every task whose primary deliverable is UI code is owned by Opus / Claude Code"). **Resolution required at M7 kickoff before starting Task 7.9.** Three options:
    - **(a) Carve Task 7.9 off to Opus.** Backend Tasks 7.1–7.8 ship under Codex; Task 7.9 ships in a follow-up split-mode coda with Opus + `/impeccable` v3 preflight. M7 closes with §12 §B-style impeccable evaluation on the Opus side only.
    - **(b) Amend ROUTING.md.** Update the M7 row to "split-mode: backend = Codex, UI = Opus" (mirrors M5 / M6 split). Task 7.9 owner shifts to Opus; this handoff converts to split-mode and §0 (currently deleted) is re-added.
    - **(c) Roll Task 7.9 into M9 polish.** Defer the gallery / agenda / tile components to M9 (where Opus already owns all UI). M7 ships backend-only; M9 picks up the UI components. AC-7.1 / AC-7.2 / AC-7.2b / AC-7.3 / AC-7.5 / AC-7.6 / AC-7.7 close at M9 instead of M7.

    **Recommended disposition: (a) — carve Task 7.9 to Opus as a coda within M7.** Backend tasks ship under Codex per ROUTING.md spirit; UI ships under Opus per the hard rule; the milestone closes when both sides converge. The user-provided handoff brief said "no UI surface in M7" — that brief was consistent with ROUTING.md's "lives in M4 tiles" wording but did NOT reflect the plan's Task 7.9 reality. Surface this at kickoff.

## 7. Test commands

- **Pre-flight and final gate**: `pnpm test && pnpm lint && pnpm typecheck`. Do NOT parallelize `pnpm test` with Playwright.
- **Vitest unit / sync / drive / assets tests** (new M7 patterns):
  - `pnpm test tests/sync/embeddedImages.test.ts` (Task 7.1)
  - `pnpm test tests/sync/snapshotAssets.test.ts` (Task 7.3)
  - `pnpm test tests/sync/assetRecovery.test.ts` (Task 7.4)
  - `pnpm test tests/sync/diagramGc.test.ts` (Task 7.8)
  - `pnpm test tests/sync/verifyReelOnApply.test.ts` (Task 7.7)
  - `pnpm test tests/api/admin/apply-status.test.ts` (Task 7.5b)
  - `pnpm test tests/api/admin/snapshot-rollback-repair.test.ts` (Task 7.8 step 3)
- **Existing meta-tests (M5/M6-shipped; M7 extends in §13)**:
  - `pnpm test tests/sync/_metaInfraContract.test.ts` (M7 extends)
  - `pnpm test tests/sync/_advisoryLockSingleHolderContract.test.ts` (M7 extends with `promote:` family)
  - `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts` (M7 extends with new codes)
  - `pnpm test tests/admin/no-inline-email-normalization.test.ts` (no new surfaces in M7; existing glob already covers `lib/sync/**`)
- **Playwright e2e**:
  - `pnpm test:e2e tests/e2e/diagram-asset.spec.ts --project=mobile-safari` (Task 7.5 — auth gates, revision-versioned URLs, prior-revision-authoritative, canonical-only contract)
  - `pnpm test:e2e tests/e2e/reel-asset.spec.ts --project=mobile-safari` (Task 7.6 — drift, MIME gate, URL-strip, AC-7.25)
  - `pnpm test:e2e tests/e2e/crew-page.spec.ts --project=mobile-safari` — re-run after Task 7.9 (if Task 7.9 ships in M7 per §6 watchpoint 24) to verify M4 AC-4.5 invariant preserved (no `https://` / `drive.google.com` in DOM)
- **DB schema introspection regression** (M2 baseline + M6 partial-index split + M7 new tables):
  - `pnpm test tests/db/schema-introspection.test.ts` — after Task 7.3's migration lands (`pending_snapshot_uploads`) and Task 7.4's migration lands (`recovery_drift_cooldowns` if not already shipped by M6), verify both tables are pinned by name AND definition.
- **Cron route smoke** (after backend ships routes; manual curl during demo):
  - `curl -X POST $NEXT_PUBLIC_SITE_ORIGIN/api/cron/asset-recovery` (with cron auth header) — expect 200 and `sync_log` rows.
  - `curl -X POST $NEXT_PUBLIC_SITE_ORIGIN/api/cron/diagram-gc` (with cron auth header) — expect 200 and (on a clean repo) zero blobs deleted.
- **Storage-write regression sweep** (Task 7.3 §11 watchpoint enforcement):
  - `rg "diagram-snapshots/shows" lib app | rg -v "lib/sync/snapshotAssets|lib/sync/diagramGc|lib/sync/assetRecovery|app/api/asset|app/api/admin/snapshot-rollback"` returns zero matches.
- **Supabase reset + seed**: `pnpm dlx supabase db reset && pnpm db:seed` (after all M7 migrations land).

## 8. Exit criteria

- [ ] Tasks 7.1–7.9 in `07-asset.md` all checked off (`- [x]` on every step).
- [ ] All AC-7.1..AC-7.25 each have at least one passing assertion (note: 7.25 is in plan even though spec line range nominally caps at 7.24).
- [ ] All M7 backend files exist with documented contracts (full list in §4 above).
- [ ] All M7 migrations applied via `pnpm dlx supabase db reset && pnpm db:seed`:
  - `pending_snapshot_uploads` table with full column set + claim discipline indexes.
  - `recovery_drift_cooldowns` table (if not already shipped by M6).
  - `shows.diagrams` JSONB shape verified to support `current` / `pending` sub-payload split.
  - `shows.opening_reel_head_revision_id` + `shows.opening_reel_mime_type` columns present.
- [ ] `vercel.json` cron registry adds `*/15 * * * * /api/cron/asset-recovery` (verify cadence at Task 7.4 close).
- [ ] `lib/messages/catalog.ts` extended with all M7 producer codes (verbatim §12.4 copy).
- [ ] `tests/sync/_metaInfraContract.test.ts` extended with M7 helpers + routes (every new Supabase call site registered or `// not-subject-to-meta: <reason>` commented).
- [ ] `tests/sync/_advisoryLockSingleHolderContract.test.ts` extended with `promote:` key family (post-commit promoter + admin repair endpoint).
- [ ] `tests/messages/_metaAdminAlertCatalog.test.ts` extended with new admin_alerts producer codes.
- [ ] `tests/db/schema-introspection.test.ts` extended to pin `pending_snapshot_uploads` and `recovery_drift_cooldowns` (if M7-shipped).
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0.
- [ ] Self-consistency sweep gates from §6 watchpoint 23 all pass.
- [ ] All commits follow `<type>(<scope>): <summary>` format. One commit per task per AGENTS.md §1.6.
- [ ] **Impeccable evaluation §12 closed** if Task 7.9 ships in M7 (per §6 watchpoint 24 resolution). If Task 7.9 carved off to Opus follow-up or M9, §12 is N/A for M7 — explicit dispositions of all UI-surface code recorded in §11 cross-milestone dependencies.
- [ ] Adversarial review (per `superpowers:adversarial-review` with Opus 4.7 / Claude Code per ROUTING.md) ran to convergence — recorded in convergence log below.
- [ ] Working tree clean except for intentionally uncommitted handoff convergence-log updates left for the adversarial reviewer.

## 9. Sandbox / git protocol

- [ ] **Codex CLI with relaxed sandbox:** commits run in-session. Verify before starting that the sandbox is actually relaxed — run `git status` first; if it errors with permission-denied, switch to the patch-then-commit-outside protocol per HANDOFF-TEMPLATE.md §9 bullet 2. M5 + M6 both ran successfully with the relaxed sandbox; M7 should inherit that working state.

Per AGENTS.md "Codex-specific notes": default reasoning level to high (matches the published 56-task benchmark). Don't narrate tool calls. Match output verbosity to the task. Codex's known strength is broader integration footprint; the risk is bigger patches than necessary — before declaring a task done, grep the repo for parallel surfaces the change should also touch (e.g., `lib/sync/applyStaged.ts` mirrors `lib/sync/phase2.ts` for the `pending` write; the asset route mirrors the reel route for the auth chain + drift gate).

## 10. Adversarial review handoff

After Codex finishes Tasks 7.1–7.8 (and, if applicable per §6 watchpoint 24, Task 7.9):

1. Codex summarizes what was built and confirms each per-task checklist is `- [x]`.
2. The adversarial reviewer (Opus 4.7 / Claude Code per ROUTING.md M7 row) is invoked via `/codex:adversarial-review --base ae6f0b8 --scope branch` (or whatever the milestone-base SHA is at kickoff — capture in §0 of the convergence log). Inputs: spec §6.11 + §6.11.1 + §7.3 + §17.1, the M7 plan (`07-asset.md`), this handoff, and the diff `git diff <M7-base-SHA>..HEAD -- 'lib/sync/**' 'lib/crypto/**' 'app/api/asset/**' 'app/api/cron/asset-recovery/**' 'app/api/cron/diagram-gc/**' 'app/api/admin/show/**' 'app/api/admin/snapshot-rollback/**' 'components/tiles/DiagramsTile.tsx' 'components/diagrams/**' 'components/agenda/**' 'lib/messages/catalog.ts' 'tests/sync/**' 'tests/api/admin/**' 'tests/e2e/diagram-asset.spec.ts' 'tests/e2e/reel-asset.spec.ts' 'tests/messages/_metaAdminAlertCatalog.test.ts' 'tests/db/schema-introspection.test.ts' 'supabase/migrations/20260510*' 'vercel.json'`. The path filter is exhaustive, not representative; if a path is missing here add it at kickoff.
3. Reviewer iterates with Codex until convergence (no new issues raised in a round) or until ambiguity requires a human decision. **Per the M5/M6 retrospective, expect 5–15 rounds.** M6 ran 14 rounds before APPROVE; M7 is invariant-dense (3-state ledger + dual lock-key families + 5-pass GC + streaming-hash invariant + content-derived fingerprint + 4-column atomic-NULL). The meta-test inventory in §13 below should reduce churn but won't eliminate it.
4. Each round's findings are routed by file path:
   - Backend (`lib/sync/**`, `lib/crypto/**`, `app/api/asset/**`, `app/api/cron/**`, `app/api/admin/show/**`, `app/api/admin/snapshot-rollback/**`, migrations) → Codex via `/codex:rescue --resume-last` (per `feedback_adversarial_review_repair_routing.md` — `--resume-last` continues the review thread, NOT a fresh spawn).
   - UI (`components/tiles/DiagramsTile.tsx`, `components/diagrams/**`, `components/agenda/**`) → Opus inline (this session). **See §6 watchpoint 24 — these files may be carved off to a separate Opus run depending on the kickoff decision.**
   - Cross-implementer findings get coordinated through this doc's convergence log.
5. **Adversarial review must keep full-milestone scope, not narrow per-round** (memory `feedback_adversarial_review_full_milestone_scope.md`). Each round anchors to the M7 milestone-base SHA, not the previous round's fix-base. The final APPROVE attests to the whole milestone, not just the latest fix.
6. **Every review round starts fresh-eyes.** Round-N review focus text leads with a fresh-eyes audit of the full current milestone diff against the spec / plan / watchpoints (memory `feedback_review_prompt_fresh_eyes_first.md`). Prior findings + commit SHAs are allowed only as a secondary regression checklist after the fresh-eyes instruction; never narrow a round to "verify the previous fixes only."
7. Convergence is logged at the bottom of this file (Convergence log section).
8. **Canonical invocation discipline.** Cross-CLI Codex reviews go through `/codex:adversarial-review` slash command with proper `CLAUDE_PLUGIN_DATA` per-session scoping. Do NOT raw-shell `node codex-companion.mjs`. (Per memory `feedback_adversarial_review_canonical_invocation.md`.)
9. **Class-sweep before patching findings; meta-contract test when bug class recurs.** Both rules are now load-bearing project invariants per AGENTS.md and the M5/M6 retrospectives. M7 §13 below pre-declares the meta-tests so the rule kicks in at plan time, not round 14.

## 11. Cross-milestone dependencies

**(a) M6 sync engine (`lib/sync/enrichWithDrivePins.ts`, `lib/sync/applyStaged.ts`, `lib/sync/phase2.ts`, `lib/sync/lockedShowTx.ts`).** M6 shipped the sync engine with `enrichWithDrivePins` doing spreadsheet-metadata capture. M7 Task 7.1 EXTENDS `enrichWithDrivePins` with embedded-image extraction; Task 7.2 EXTENDS with linked-folder freezing; Task 7.3 modifies `phase2.ts` to call new `snapshotAssets`; Task 7.7 modifies `applyStaged.ts` + `phase2.ts` to call new `verifyReelOnApply`.

> **Recommended disposition:** Codex extends `enrichWithDrivePins.ts` in Tasks 7.1 + 7.2 directly (no new module needed). Tasks 7.3 + 7.7 create new helper modules (`snapshotAssets.ts`, `verifyReelOnApply.ts`) and wire them from `phase2.ts` / `applyStaged.ts`. Per M6 watchpoint 17, M6 already wrote ONLY to `shows.diagrams.pending` (NOT `current`); M7's post-commit promoter does the atomic cutover. Verify M6's Phase 2 contract at kickoff.

**(b) M4 / M9 UI rendering for diagrams gallery + agenda PDF + opening reel `<video>`.** Per ROUTING.md M7 row "rendering of these assets lives in M4 tiles" — BUT Task 7.9 of the M7 plan creates NEW tile components (`DiagramsTile.tsx`, `Gallery.tsx`, `AgendaEmbed.tsx`). See §6 watchpoint 24 for the resolution options.

> **Recommended disposition:** Carve Task 7.9 off to Opus as a coda within M7 (option (a) in §6.24). Backend Tasks 7.1–7.8 ship under Codex per ROUTING.md spirit; Task 7.9 UI components ship under Opus per the AGENTS.md hard rule. This handoff converts to mixed-mode (single-implementer for Tasks 7.1–7.8; Opus coda for Task 7.9) at the kickoff decision.

**(c) M5 advisory-lock helpers.** `lib/sync/lockedShowTx.ts` (M6-shipped, exposing `withShowLock` + branded `LockedShowTx<T>`) is the sync-side helper. M7 consumes it for `assetRecovery`. The NEW `promote:` lock-key family in M7 is acquired directly via `pg_advisory_xact_lock(hashtext('promote:' || $showId))` — it does NOT go through `withShowLock` because the hashkey shape differs (`promote:` prefix vs `show:` prefix). Consider whether a sibling helper `withPromoteLock` is justified at Task 7.3 close-out — if multiple call sites use the `promote:` key (Task 7.3 promoter + Task 7.8 admin repair), extract.

> **Recommended disposition:** Add `lib/sync/lockedPromoteTx.ts` (or extend `lockedShowTx.ts` with a sibling export) for the `promote:` key family if ≥2 call sites converge. Otherwise inline the `pg_advisory_xact_lock` SQL at the call sites. Decide at Task 7.8 close.

**(d) M5 messages catalog.** `lib/messages/catalog.ts` (M5-shipped, M6-extended) and `lib/messages/lookup.ts` `messageFor(code, params?)` are reused. M7 EXTENDS the catalog with the new producer codes listed in §1. Each new admin_alerts code MUST also register in `tests/messages/_metaAdminAlertCatalog.test.ts` (M5-shipped, M6-extended).

> **Recommended disposition:** Codex extends the catalog in Tasks 7.3 / 7.4 / 7.5 / 7.6 / 7.7 / 7.8 in the same commits that produce each code (per M6's pattern). Test extends in the same commit.

**(e) M2 schema (`shows.diagrams` JSONB shape; `pending_syncs`; `shows.opening_reel_*`).** M2 shipped the base tables; M6 amended `shows.diagrams` to support the `current` / `pending` sub-payload split. M7 verifies this shape at kickoff AND adds `pending_snapshot_uploads` + `recovery_drift_cooldowns` per spec §4.5. Task 2.2's introspection matrix grows by 1–2 tables (depending on whether M6 already shipped `recovery_drift_cooldowns`).

> **Recommended disposition:** Codex ships the `pending_snapshot_uploads` migration AS PART of M7 Task 7.3 (NOT folded back into M2's migration file). Migration timestamp `2026051000000<n>_pending_snapshot_uploads.sql`. Task 2.2's introspection test gets new assertions in the same commit. If `recovery_drift_cooldowns` is M7-shipped, same pattern in Task 7.4. If `shows.opening_reel_head_revision_id` + `opening_reel_mime_type` were not already shipped by M2 / M6, Task 7.7 ships them.

**(f) Operator-log sink (M5-D9 / M5-D10 / M5-D11 deferrals).** Three M5 deferrals routed to M6 OR M8 per the M6 handoff §11. **Decision required at M7 kickoff: did M6 land the sink?** If yes, M7 inherits the sink and emits operator-log entries for relevant M7 failure modes (e.g., asset_recovery aborts, promoter rollback-stuck, reel drift). If no, leave deferred to M8 — M7 may emit operator-log calls behind a feature-flag stub (`if (operatorLog?.emit) operatorLog.emit({ code, payload })`) so the wiring is in place when M8 lands.

> **Recommended disposition:** Grep `lib/operatorLog/` at kickoff. If present (M6-shipped), M7 emits; if absent, M7 stubs behind the flag. Update DEFERRED.md M5-D9/D10/D11 accordingly.

**(g) M8 bug-report pipeline.** M7 ships no direct M8 dependencies. The `pending_snapshot_uploads.PENDING_SNAPSHOT_ROLLBACK_STUCK` admin_alerts row is a candidate to flow into M8's bug-report pipeline as an operator-actionable item — but the wiring is M8's problem.

**(h) M9 polish.** If §6 watchpoint 24 resolves to option (c) — defer Task 7.9 to M9 — then AC-7.1 / AC-7.2 / AC-7.2b / AC-7.3 / AC-7.5 / AC-7.6 / AC-7.7 close at M9 instead of M7. Track in DEFERRED.md as M7-D1 if option (c) chosen.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**Conditional — depends on §6 watchpoint 24 resolution.**

- **If Task 7.9 ships in M7 as written (option (a) or (b) in §6.24):** the §12 gate applies. UI surface ships in this milestone:
  - `components/tiles/DiagramsTile.tsx`
  - `components/diagrams/Gallery.tsx`
  - `components/agenda/AgendaEmbed.tsx`

  The dual run happens AFTER per-task implementation closes and BEFORE adversarial review. Both commands run with the canonical v3 preflight gates (`load-context.mjs` → product gate → command-reference gate → register identification → preflight signal).

  - [ ] `/impeccable critique <surface>` — UX heuristic scoring, persona walkthroughs, AI-slop test, absolute-ban scan. HIGH findings fixed OR logged in `DEFERRED.md` with target milestone.
  - [ ] `/impeccable audit <surface>` — Technical quality checks (a11y, performance, responsive, theming, anti-patterns). P0/P1 findings fixed before adversarial review.
  - [ ] DEFERRED.md updated with any retrospective deferrals.
  - [ ] Dispositions inline below or referenced by SHA.

- **If Task 7.9 carves off to a separate Opus run or defers to M9 (option (a) coda or option (c)):** **§12 is N/A for M7's backend-only convergence.** M7 closes when Tasks 7.1–7.8 + adversarial review converge; Task 7.9 ships separately with its own §12 evaluation in the coda's / M9's handoff.

**Default (per ROUTING.md spirit + user-provided handoff brief): N/A — no UI surface in M7's backend convergence.** Codex's M7 close-out runs adversarial review against the backend diff only; Task 7.9 is dispositioned at kickoff per §6 watchpoint 24.

The convergence log proper (below) appends ONLY after impeccable evaluation closes (if applicable) AND adversarial review begins. The milestone is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/P0/P1 findings (if applicable) AND adversarial review has converged.

### Task 7.9 Opus coda — §12 impeccable run (2026-05-11)

Per §6 watchpoint 24 option (a), Task 7.9 was carved to an Opus / Claude Code coda. The dual run executed AFTER per-task TDD implementation and BEFORE adversarial review.

**Preflight signal:** `context=pass product=pass command_reference=pass shape=pass image_gate=skipped:product-register-no-direction-probes-needed mutation=open`

**`/impeccable critique`** — LLM design review of `components/tiles/DiagramsTile.tsx`, `components/tiles/OpeningReelTile.tsx`, `components/diagrams/Gallery.tsx`, `components/diagrams/GalleryLightbox.tsx`, `components/agenda/AgendaEmbed.tsx`, `components/agenda/AgendaPdfViewer.tsx`. Findings table:

| Finding | Severity | Disposition | SHA / file:line |
| --- | --- | --- | --- |
| Em dash in user-visible "Open agenda" CTA label | P1 | Fixed (replaced with middle dot) | `3ff7a02` — `components/agenda/AgendaEmbed.tsx:80` |
| Lightbox prev/next hidden on mobile + no page counter | P1 | Fixed (always visible, disabled-at-edge, `1 of N` aria-live counter) | `3ff7a02` — `components/diagrams/GalleryLightbox.tsx` |
| AgendaPdfViewer eagerly renders all pages + no page counter | P1 | Fixed (sticky page counter + windowed render via IntersectionObserver, active ±1 gets rich text/annotation layers) | `3ff7a02` — `components/agenda/AgendaPdfViewer.tsx` |
| PDF width math wrong + never resizes | P2 | Fixed (ResizeObserver on container, drives width via state) | `3ff7a02` — `components/agenda/AgendaPdfViewer.tsx` |
| No motion on lightbox / sheet open/close | P2 | DEFERRED → M9 polish (M7-D1) | `c569c72` DEFERRED.md |
| DiagramsTile heading lies about contents when agenda-only | P2 | Fixed (heading reflects state: "Diagrams" / "Agenda" / "Diagrams & agenda" + 1px hairline divider when both present) | `3ff7a02` — `components/tiles/DiagramsTile.tsx` |
| Pinch-zoom inside lightbox (LD persona red flag) | P1 (UX) | DEFERRED → M9 polish (M7-D4) | `c569c72` DEFERRED.md |
| Dark-mode PDF rendering at 1am backstage (A1 persona red flag) | P1 (UX) | Fixed (auto-invert under `prefers-color-scheme: dark` + Sun/Moon toggle in sheet header) | `3ff7a02` — `components/agenda/AgendaPdfViewer.tsx` |

Critique verdict before fixes: clean on absolute bans, em dash present (now fixed). After fixes: clean across all DESIGN.md §9 bans.

**`/impeccable audit`** — technical quality (a11y, performance, responsive, tokens, types). Initial verdict: **BLOCK** on three P0 findings (no focus trap in either modal dialog) + 10 P1 findings. After hardening:

| Audit row | Initial score | Final score | SHA |
| --- | --- | --- | --- |
| A.4 / A.5 / B.3 Focus trap in modal dialogs | P0 | PASS | `3ff7a02` (`lib/a11y/dialogFocus.ts` + wires in both dialogs) |
| A.6 / A.7 Initial focus on dialog open | P1 | PASS | `3ff7a02` |
| A.8 Focus restoration on close | P1 | PASS | `3ff7a02` (saved-trigger ref pattern in shared hook) |
| A.9 aria-live on loading / error states | P1 | PASS | `3ff7a02` (`role="status"` + `aria-live="polite"`; `role="alert"` for the PDF error) |
| A.11 Dead `aria-label` on non-interactive placeholder div | P2 | PASS | `3ff7a02` (removed; `sr-only` span is the announce surface) |
| B.4 Lightbox prev/next reachable on 390px | P1 | PASS | `3ff7a02` (no more `sm:` gate; visible on mobile, disabled at edges) |
| C.1 "Show all N diagrams" tap target <44px | P1 | PASS | `3ff7a02` (`min-h-tap-min px-3 py-2`) |
| C.5 PDF width math wrong by 32px + no resize | P1 | PASS | `3ff7a02` (ResizeObserver + container-driven width) |
| D.3 Placeholder slot icon contrast borderline | P2 | PASS | `3ff7a02` (`text-text-faint` → `text-text-subtle`) |
| E.1 Embla `duration: 22` ignores `prefers-reduced-motion` | P1 | PASS | `3ff7a02` (matchMedia check at mount, instant snap on reduce) |
| F.2 Embla loaded in Gallery chunk (not lightbox-deferred) | P2 | ACCEPTED (Embla static import; the lightbox-conditional render still avoids hook execution. Module byte cost is acceptable v1; defer migration to `next/dynamic` for Embla until/if bundle-size budget pressure arises.) | — |
| F.6 Lightbox `<img>` lacks lazy/decoding | P2 | PASS | `3ff7a02` (`loading={i === startIndex ? "eager" : "lazy"}` + `decoding="async"`) |
| G.3 PDF error states collapse to one retry-able message | P2 | DEFERRED → M9 polish (M7-D2) | `c569c72` DEFERRED.md |
| G.5 DiagramsTile bypasses `lib/visibility/emptyState` sentinel helper | P1 → P2 (after audit re-read) | DEFERRED → M9 polish (M7-D5; not a strict sentinel-hide case, media presence check is correct as-is, but the meta-test coverage gap stands) | `c569c72` DEFERRED.md |
| I.1 Hardcoded `duration: 22` / `MAX_PAGE_WIDTH = 800` literals | P1 → P3 | ACCEPTED (`duration: 22` is Embla's own scrub unit, documented inline as "≈ `--duration-normal`" + reduced-motion gated; `MAX_PAGE_WIDTH = 800` is a layout cap, documented as the upper bound for the page width to avoid stretched A4 PDFs on tablets) | — |
| J.1 `as unknown as { ... }` casts in agenda route | P1 → P3 | ACCEPTED (the route's Supabase + Drive client surfaces are external; the cast pattern matches what the diagram + reel routes already use. Migrating all three routes to a shared typed wrapper is a separate refactor candidate.) | — |
| Misc P3 (figure caption, J.2 spread shorthand, `next/image` migration) | P3 | PASS / DEFERRED → M9 (M7-D3) | `3ff7a02` / `c569c72` |

**Audit final verdict: PASS.** Zero unresolved P0/P1 findings; all P2 residuals either fixed or formally deferred to M9 polish via `DEFERRED.md` entries M7-D1..M7-D5.

**Verification after hardening:**
- `pnpm test`: 165 files passed, 1 skipped; 2354 tests passed, 5 skipped.
- `pnpm lint`: 0 errors, 2 informational `<img>` warnings (M7-D3 deferral).
- `pnpm typecheck`: passed.

**Closure summary.** Task 7.9 UI surface ships clean of HIGH / CRITICAL impeccable findings. P2/P3 residuals are tracked in `DEFERRED.md` § "M7-D1..M7-D5" and routed to M9 polish. The handoff §6 watchpoint 24 option (a) is now fully discharged.

## 13. Meta-test inventory (AGENTS.md writing-plans rule — pre-declared at handoff time)

Per AGENTS.md §1.9 + the M5/M6 retrospectives: pre-declare the meta-tests at plan/handoff time, NOT round 14. M4 §8.3 (8 rounds), M5 R14–R18 (6 rounds), M6 R8–R13 (5 rounds) all became cheap once the meta-test landed; the rounds disappear when the registry exists from day 1.

For each candidate class below, **create / extend / N/A — <reason>**:

- [x] **Supabase call-boundary discipline** — **EXTEND `tests/sync/_metaInfraContract.test.ts`** (M6-shipped). Every new M7 helper subject to AGENTS.md §1.9 registers here. Initial M7 rows: `snapshotAssets`, `assetRecovery`, `diagramGc` (full GC pass logic), `verifyReelOnApply`, every M7 route handler (`app/api/asset/diagram/[show]/[rev]/[key]/route.ts`, `app/api/asset/reel/[show]/route.ts`, `app/api/cron/asset-recovery/route.ts`, `app/api/cron/diagram-gc/route.ts`, `app/api/admin/show/[slug]/apply/[applyId]/status/route.ts`, `app/api/admin/snapshot-rollback/[id]/repair/route.ts`). New call sites EITHER add a registry row OR carry `// not-subject-to-meta: <reason>`. The meta-test mocks Supabase to throw at construction / `getUser` / `rpc` / `from` / `select` / `update` / `insert` / `upsert` / `delete`, asserting each helper surfaces a discriminable infra-failure result.

- [x] **Advisory-lock topology** — **EXTEND `tests/sync/_advisoryLockSingleHolderContract.test.ts`** (M6-shipped). Add the NEW `promote:` lock-key family enumeration. Initial rows: post-commit promoter (Task 7.3 step 6 — `pg_advisory_xact_lock(hashtext('promote:' || show_id))`), admin repair endpoint (Task 7.8 step 3 — same key, blocking, queued behind any in-flight promoter). Also extend the `show:` family with `assetRecovery` (Task 7.4 — `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))`). The meta-test asserts single-holder PER KEY FAMILY — `show:` has one holder per hashkey; `promote:` has one holder per hashkey. Cross-family deadlock is structurally impossible because the keys never collide.

- [x] **`admin_alerts` catalog completeness** — **EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts`** (M5-shipped, M6-extended). New M7 rows: `PENDING_SNAPSHOT_ROLLBACK_STUCK`, `PENDING_SNAPSHOT_PROMOTE_STUCK`, `PENDING_SNAPSHOT_DELETE_STUCK`, `ASSET_RECOVERY_BYTES_EXCEEDED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `OPENING_REEL_PERMISSION_DENIED`, plus `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` if not already shipped by M6. Every code with non-null `dougFacing`. Producer enumeration in the registry; the test scans for unregistered `admin_alerts.upsert(...)` calls across `lib/sync/**` + new M7 route handlers.

- [x] **Storage-write surface containment** — **CREATE `tests/sync/_storageWriteSurfaceContract.test.ts`** (NEW M7-introduced class). Pins that every write to `diagram-snapshots/shows/<show_id>/...` Storage path originates from exactly four call sites: (1) `lib/sync/snapshotAssets.ts` (writes to temp prefix `_pending/<run_uuid>/`); (2) `lib/sync/diagramGc.ts` (renames temp → canonical OR temp → DELETE, never direct canonical writes); (3) `lib/sync/assetRecovery.ts` (writes recovered bytes to canonical `<lockedRev>/` AFTER the lock-free pre-pass verifies pin tuples); (4) `app/api/admin/snapshot-rollback/[id]/repair/route.ts` (reverse-renames canonical → temp during repair). The test scans `lib/**` + `app/**` for any `.from('diagram-snapshots')` Storage call and asserts the call site is in the allow-list. Any new write surface MUST register OR carry `// not-subject-to-meta: <reason>`.

- [x] **`pending_snapshot_uploads` state-transition discipline** — **CREATE `tests/sync/_pendingSnapshotUploadsContract.test.ts`** (NEW M7-introduced class). Pins the 3-state lifecycle (claimed → committing_delete OR promote_started_at; promote_started_at clears on success or 6e-success-rollback). Asserts every `UPDATE pending_snapshot_uploads SET ...` carries the correct guard predicates: reclaim-expired requires `claim_expires_at < now AND promoted_at IS NULL AND delete_started_at IS NULL AND promote_started_at IS NULL`; initial-claim requires `claim_token IS NULL AND uploaded_at < now - interval '1 hour' AND delete_started_at IS NULL AND promote_started_at IS NULL`; commit-to-delete requires `claim_token = $token AND promoted_at IS NULL AND delete_started_at IS NULL`; promote-success-transition requires `claim_token = $token AND delete_started_at IS NULL`. The test scans `lib/sync/diagramGc.ts` + `lib/sync/snapshotAssets.ts` + `app/api/admin/snapshot-rollback/**` for every UPDATE statement against the table and validates the WHERE clause shape against the lifecycle table.

- [x] **Reel 4-column atomic-NULL contract** — **CREATE `tests/sync/_reelColumnAtomicContract.test.ts`** (NEW M7-introduced class — corresponds to §6 watchpoint 21 / Task 7.7 "Partial-column write fails type check" test). Static-analysis test: grep `lib/sync/` for `'opening_reel_'`; every `UPDATE shows SET ...` that touches any reel column MUST touch all four (`opening_reel_drive_file_id`, `opening_reel_drive_modified_time`, `opening_reel_head_revision_id`, `opening_reel_mime_type`). Test fails with named diff if any `UPDATE` is missing one of the four column names. Helper return-type `SetReelColumnsArg = { driveFileId: string|null; drive_modified_time: string|null; headRevisionId: string|null; mimeType: string|null }` enforces at TypeScript level; this meta-test enforces at SQL-grep level (defense-in-depth).

- [x] **Streaming-hash invariant** — **CREATE `tests/sync/_streamingHashContract.test.ts`** (NEW M7-introduced class — corresponds to §6 watchpoint 16). Asserts every byte-fetch in `lib/sync/snapshotAssets.ts` / `lib/sync/assetRecovery.ts` uses `crypto.createHash(...)` piped via `Readable` stream, NEVER `Buffer.concat` of the full body. Class-sweep: `rg "Buffer.concat" lib/sync/snapshotAssets.ts lib/sync/assetRecovery.ts` returns zero matches; `rg "createHash" lib/sync/snapshotAssets.ts lib/sync/assetRecovery.ts | wc -l` matches the number of byte-fetch surfaces. **Exception:** Task 7.6 reel route Pattern B fallback (`app/api/asset/reel/[show]/route.ts`) IS allowed to buffer reel videos for md5 re-verify — this is the documented v1 trade-off (reels are small; diagrams up to 3GB cumulative are not). The meta-test allow-lists this single exception by file path.

- [x] **`r=`-prefixed URL rejection** — **CREATE `tests/api/asset/_revUrlShapeContract.test.ts`** (NEW M7-introduced class — corresponds to §6 watchpoint 12 / Task 7.5). Asserts every URL emitted by gallery / agenda / tile components AND every URL accepted by `/api/asset/diagram/[show]/[rev]/[key]` route uses a BARE UUID for `[rev]`. Two arms: (a) component-emission scan — grep `components/diagrams/**` + `components/tiles/DiagramsTile.tsx` + `components/agenda/**` for `/api/asset/diagram/` and verify the template literal interpolates a bare UUID (`${rev}`, not `r=${rev}`). (b) route-rejection runtime test — request `/api/asset/diagram/<show>/r=<uuid>/<key>` and assert 410.

- [N/A] **Sentinel hiding in optional text** — `tests/components/tiles/_metaSentinelHidingContract.test.ts`. **N/A — M7 backend doesn't render tile-shape optional text. If Task 7.9 ships in M7 (per §6.24 resolution), Opus's UI work owns this consideration; the existing M4 meta-test already covers the tile-render contract.**

- [N/A] **No-inline-email-normalization** — `tests/admin/no-inline-email-normalization.test.ts`. **N/A for M7's new surfaces — M7 does NOT read emails from any source.** The existing M6-extended glob covers `lib/sync/**`; M7's new files under `lib/sync/` are automatically covered, but they have no email-reading surface so the test passes trivially.

The seven create / extend rows above are mandatory at M7 close. Empty rows silently lie.

---

## Field discipline notes (carry-forward from M5 + M6 handoffs)

- **"Spec sections in scope" is exhaustive, not representative.** M7 brushes §6.11 + §6.11.1 + §7.3 + §4.1 + §4.5 + §4.6 + §10 + §12.4 + §17.1 — listed all nine.
- **"AC list" uses canonical AC IDs.** M7 covers AC-7.1..AC-7.25 (25 entries; AC-7.25 referenced in plan Task 7.6 — listed every one).
- **"Pre-handoff state" is verified by command, not assertion.** Every "tests passing" check has a command.
- **"Watchpoints" is the most valuable section.** M5/M6-carry-forward classes 1–10 + M7-specific 11–24 — preload the reviewer rather than discover at round N. Watchpoint 24 (ROUTING.md vs Task 7.9 conflict) is a kickoff-blocker.
- **"Exit criteria" includes the convergence step.** M7 is not done at "tests pass"; it's done at "tests pass AND adversarial review converged AND impeccable §12 closed (if applicable)."

---

## Convergence log

### Backend-only convergence — 2026-05-11

**Scope.** This log covers M7 backend work only: Tasks 7.1-7.8 plus backend repair/status/cron/asset routes and structural meta-tests. Task 7.9 UI remains carved off to the separate Opus/impeccable frontend session per §6 watchpoint 24 / §12. Review scope stayed anchored to the milestone base `ae6f0b8..HEAD` every round; no round was narrowed to only the previous round's fixes.

**Reviewer.** Cross-model adversarial review was run with Opus / Claude Code against the full current backend diff. Later rounds used a bounded Bash-only prompt because ordinary Claude invocations intermittently produced blank output; blank/malformed invocations were discarded and not counted as approvals.

**Final backend HEAD.** `d8394eb test(sync): harden M7 residual review risks`

**Backend closure commits after the initial implementation / exit-check sweep.**

| Round | Verdict | Main classes reviewed / repaired | Closure SHA |
| --- | --- | --- | --- |
| R1 | NEEDS_ATTENTION | Missing post-commit promotion, current/pending cutover breakage, cron no-ops, absent `promote:` lock family, repair endpoint gap, streaming/cap gaps, catalog/admin-alert gaps, infra-error masking. | `21dfd28` |
| R2 | NEEDS_ATTENTION | Promotion lock not held across the storage rename window, missing manifest pre/post checks and reverse rollback, blocking 202 path, malformed repair UUID/gates, cooldown/GC lifecycle collapse, GET status writes. | `44c330a` |
| R3 | NEEDS_ATTENTION | Production embedded byte fetching and recovery/snapshot fetch parity. | `2f70ec8`, `f43cd72` |
| R4 | NEEDS_ATTENTION | Bounded asset reads, durable async promoter scheduling, storage/ledger safety around promotion. | `8fa23c2` |
| R5 | NEEDS_ATTENTION | Drift/admin-alert emission and tighter ledger claim predicates. | `9240f73` |
| R6 | NEEDS_ATTENTION | Asset caps, pending-upload guard predicates, repair lock topology/meta coverage, cache-control and drift-code observability gaps. | `f0c9c37` |
| R7 | NEEDS_ATTENTION | Apply-status no-snapshot handling, embedded MIME preservation, delete-started recovery path, missing infra registry row. | `cf91480` |
| R8 | NEEDS_ATTENTION | RENAME-RETRY / stuck-pre-claim recovery, rolled-back status semantics, recovery cooldown deletion, recovery buffering and promoter/recovery races. | `46d4ce2` |
| R9 | NEEDS_ATTENTION | First-apply / first-cron snapshot creation, ledger-vs-current pending revision races, manifest-mismatch cleanup, reel fallback cap. | `4c0d59d` |
| R10 | NEEDS_ATTENTION | Rollback-stuck alerts being lost on transaction rollback, recursive Storage listing for GC, repair/GC claim predicates. | `4f3b0f6` |
| R11 | NEEDS_ATTENTION | `after()`/runtime lifetime scheduling, Drive work inside lock windows, infra-contract registry for promoter, status surfacing for rollback-stuck rows. | `2c3204d` |
| R12 | NEEDS_ATTENTION | Reel fallback fail-close on missing md5, rolled-back status exposure, catalog shape, handoff-vs-implementation lock-topology documentation. | `1d5d5f7` |
| R13 | NEEDS_ATTENTION | Recovery byte-cap exception containment, recovery uploads under the show lock, reel cap error mapping, per-show cron containment. | `a9a1bd0` |
| R14 | NEEDS_ATTENTION | Diagram-GC missing-`createdAt` retention, `runAssetRecoveryCron` per-show exception containment, default diagram-GC postgres pool close. | `430dd9f` |
| R15 | NEEDS_ATTENTION | Recovery drift uploads before lock/gate cleanup, missing M7 warning catalog rows, paginated Storage listing, admin route infra classification, pending-revision predicate parity. | `c844fe1` |
| R16 | NEEDS_ATTENTION | Apply-status Supabase call-boundary violation, recovery `no_op` uploaded-byte cleanup, cron reel reverify / Apply lock-window tradeoff documentation. | `9fa3e27` |
| R17 | APPROVED | No P0/P1 findings. Residual P2s requested for triage before final close. | No code commit |
| R18 | APPROVED | Fresh full-backend review after selected P2 hardening; no P0/P1 findings. | `d8394eb` |

**Selected P2 hardening before final approval.** The backend session addressed the actionable low-risk P2s before R18: apply-status no longer classifies GC-claimed never-promoted rows as `rolled_back` solely because `claim_token` is absent; `verifyReelOnApply` now has regression coverage for transient Drive metadata failures preserving reel pins; snapshot rollback repair now has functional API tests for success, not-stuck / promote-in-flight conflicts, and Supabase returned errors; `promoteSnapshotUpload` now has a functional test pinning lock order, temp-to-canonical moves, and cutover.

**Accepted/deferred P2 residuals after R18.**

- `lib/sync/assetRecovery.ts` cumulative byte accounting is conservative for stream-path entries and can trip roughly one 50 MB entry early.
- `lib/sync/promoteSnapshot.ts` contains an unreachable repair `promote_in_flight` defensive branch after the blocking `withShowLock` path.
- `repairSnapshotRollback` uses pre-lock row fields for branch selection; current predicates make the race non-corrupting, but a re-select inside the promote lock would be cleaner.
- `defaultListRecoverableShows` scans all show rows / `diagrams` JSONB on each recovery cron tick; acceptable for current scale, should become a DB-side JSONB filter or RPC before larger fan-out.
- Reel route responses do not support Range / Content-Length, and the fallback md5 path buffers up to the documented 512 MB cap.
- Snapshot rollback repair returns `APPLY_STATUS_NOT_FOUND` for a missing ledger UUID; cosmetic operator-code mismatch only.

**Final backend verification.**

- `pnpm test`: 158 files passed, 1 skipped; 2300 tests passed, 5 skipped.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `git diff --check`: passed.
- `git status --short`: clean before this convergence-log doc update.

**Backend result.** M7 backend is approved by cross-model adversarial review. Frontend/UI work remains pending in the separate Task 7.9 session and must run the impeccable v3 critique/audit gate before any UI closeout.

### Frontend convergence — 2026-05-11 (impeccable §12 complete, awaiting adversarial review)

**Scope.** Task 7.9 UI surface — `components/tiles/DiagramsTile.tsx`, `components/tiles/OpeningReelTile.tsx`, `components/diagrams/Gallery.tsx`, `components/diagrams/GalleryLightbox.tsx`, `components/agenda/AgendaEmbed.tsx`, `components/agenda/AgendaPdfViewer.tsx`, plus the supporting `app/api/asset/agenda/[show]/[id]/route.ts` proxy + `lib/data/diagrams.ts` + `lib/data/openingReel.ts` + `lib/a11y/dialogFocus.ts` helpers, page mount in `app/show/[slug]/page.tsx`, and structural meta-test extensions.

**Implementer.** Opus 4.7 / Claude Code, per ROUTING.md hard rule (UI work is always Opus).

**Frontend HEAD.** TBD on commit of this convergence-log entry (preceding commit is `c569c72 docs(deferred): record M7 Task 7.9 §12 P2/P3 residuals`).

**Frontend commits (in order, all on `main` branched from backend close-out `3034b5c`):**

| Commit SHA | Subject |
| --- | --- |
| `454e126` | feat(data): resolve current diagrams sub-payload via shared helper |
| `8799bc8` | refactor(assets): diagram route consumes shared resolveCurrentDiagrams helper |
| `abaeda9` | feat(data): project diagrams.current + opening_reel video gate into ShowForViewer |
| `b185736` | feat(assets): agenda PDF proxy route /api/asset/agenda/[show]/[id] |
| `63e6b08` | feat(crew-page): OpeningReelTile carries text + inline video (AC-7.3, AC-7.25) |
| `6863a9f` | feat(crew-page): Gallery + lightbox for diagrams (AC-7.2, AC-7.4, AC-7.7) |
| `5a1ee09` | feat(crew-page): AgendaEmbed inline PDF.js viewer (AC-7.1) |
| `e40b996` | feat(crew-page): DiagramsTile composes Gallery + AgendaEmbed (§10) |
| `95bd17f` | feat(crew-page): mount DiagramsTile + OpeningReelTile in show grid |
| `945adbd` | fix(M7): register agenda route in catalog + scope + infra meta contracts |
| `8efb72a` | test(crew-page): extend M7 rev-URL shape contract to component emission |
| `3ff7a02` | fix(crew-page): close M7 §12 impeccable audit P0/P1 findings |
| `c569c72` | docs(deferred): record M7 Task 7.9 §12 P2/P3 residuals |

**Acceptance criteria closed by the frontend session:**

- **AC-7.1** — Agenda PDF in `agenda_links` renders inline via PDF.js. `components/agenda/AgendaEmbed.tsx` + `components/agenda/AgendaPdfViewer.tsx` + `app/api/asset/agenda/[show]/[id]/route.ts`. Tested in `tests/components/agenda/AgendaEmbed.test.tsx` + `tests/api/agenda-asset-route.test.ts`.
- **AC-7.2** — Linked-folder + embedded gallery with up to 12 initial + "Show all" reveal. `components/diagrams/Gallery.tsx`. Tested in `tests/components/diagrams/Gallery.test.tsx`.
- **AC-7.2b** — Embedded-first ordering. `components/tiles/DiagramsTile.tsx` is the single ordering authority; Gallery is pass-through. Tested in `tests/components/tiles/DiagramsTile.test.tsx`.
- **AC-7.3** — Opening reel inline `<video>` with `src="/api/asset/reel/<show>"`. `components/tiles/OpeningReelTile.tsx`. Tested in `tests/components/tiles/OpeningReelTile.test.tsx`.
- **AC-7.4** — Gallery image fetches go through `/api/asset/diagram/...`; never expose raw Drive URL. Enforced by `tests/cross-cutting/noRawDriveHostsInCrewSurface.test.ts` (passes) + extended `tests/api/asset/_revUrlShapeContract.test.ts` (component-emission arm scans `components/**` for any `r=`-prefixed URL).
- **AC-7.5 / AC-7.6** — Linked-folder + embedded caps. Crew-side gallery renders within the persisted cap (cap enforcement lives in the M6/M7 sync layer, not the UI). The DiagramsTile cap-warning surfacing for admin is M7 backend's domain.
- **AC-7.7** — Embedded image with 4xx download URL surfaces placeholder slot (NOT hidden). `Gallery.tsx` maps `snapshotPath: null` → `available: false` → placeholder render. Tested in `tests/components/diagrams/Gallery.test.tsx` + `tests/components/tiles/DiagramsTile.test.tsx`.
- **AC-7.25** — Crew DOM contains no `https://` / `drive.google.com` for opening_reel. Preserved across all four cases (mixed-value valid pin, pure-URL valid pin, text-only, drift) by `lib/visibility/openingReelText.ts:stripOpeningReelText` (M4) + the OpeningReelTile (M7). Tested in `tests/components/tiles/OpeningReelTile.test.tsx`.

**Meta-test extensions:**

- `tests/api/asset/_revUrlShapeContract.test.ts` — added the component-emission arm so every `components/**` reference to `/api/asset/diagram/...` is verified bare-UUID. The route-rejection arm (shipped at backend close) is preserved.
- `tests/sync/_metaInfraContract.test.ts` — added a new registry row for the agenda route (Supabase + Drive call-boundary discipline per AGENTS.md §1.9).
- `tests/sync/_scopeCheckContract.test.ts` — added the agenda route as an intentional exception (it streams bytes for an already-bound fileId; does not admit / process sheets).
- `tests/components/tiles/_metaSentinelHidingContract.test.ts` — passes unchanged. OpeningReelTile uses `shouldHideOpeningReel` via the central predicate. DiagramsTile's emptiness check is a media-presence check, not a sentinel hide (formally deferred via M7-D5).
- `tests/messages/catalog.test.ts` — `AGENDA_ASSET_LOOKUP_FAILED` added to `lib/messages/catalog.ts`.

**Impeccable §12 dispositions:** see §12 above for the per-finding table. Zero unresolved P0/P1 findings. Five P2/P3 residuals deferred to M9 polish via `DEFERRED.md` (M7-D1..M7-D5).

**Frontend verification.**
- `pnpm test`: 165 files passed, 1 skipped; 2354 tests passed, 5 skipped.
- `pnpm lint`: 0 errors, 2 informational `<img>` warnings (M7-D3 deferral).
- `pnpm typecheck`: passed.
- `pnpm test:e2e --project=mobile-safari`: **NOT YET RUN** in this session (Playwright requires a running dev server; deferred to CI). The existing `tests/e2e/empty-state.spec.ts` opening-reel suite is expected to remain green because the inner `data-testid="opening-reel"` selector is preserved on the new OpeningReelTile text row. The new `[data-testid=opening-reel-tile]` outer scope element is what AC-7.25 was always specifying.

**Frontend result.** M7 Task 7.9 UI surface ships with the §12 quality gate closed (zero P0/P1). Awaiting cross-model adversarial review (Codex) per ROUTING.md M7 row's split-mode contract. Frontend HEAD will be `c569c72` plus this convergence-log doc commit; the adversarial-review base is `3034b5c` (backend close-out) so the diff covers the full Opus coda.

### Adversarial review convergence — 2026-05-11 (R20→R26, APPROVE/SHIP at R26)

**Outcome.** Cross-model adversarial review converged to SHIP at R26 (`review-mp1t5rch-2qik83`) after 7 rounds. Base for every round was `3034b5c` (backend close-out) per the full-milestone-scope rule. The chain surfaced 6 consecutive HTTP-semantics findings (R20-R25) on the asset proxy surface — twice triggering the AGENTS.md "Same-vector recurrence → comprehensive re-analysis" rule. Both structural passes were necessary to converge.

**Round-by-round commits:**

| Round | Codex job id | Verdict + summary | Fix commit |
| --- | --- | --- | --- |
| R20 | `review-mp1hgni7-htvzwd` | NO-SHIP: Drive 416 → 500 mapping (Range unsatisfiable not surfaced as 416). | (pre-R23 patches) |
| R21 | `review-mp1p370o-dq0tkq` | NO-SHIP: diagram 206 cap-bypass via piecemeal Range. | (pre-R23 patches) |
| R22 | `review-mp1pbiex-9yxdhm` | NO-SHIP: R21 fix didn't reach agenda + reel (class-sweep miss). | `9945396` |
| R23 | `review-mp1pk5us-5tttkp` | NO-SHIP: 206 fail-closed + HEAD + Cache-Control + Vary still missing across the surface. | `51ba0c8` (RFC 7233/9110/9111 comprehensive audit + patches; +41 tests) |
| R24 | `review-mp1sg3vh-c7xlh6` | NEEDS-ATTENTION: diagram HEAD reports 200 for storage-missing/over-cap objects (HEAD/GET parity violation). | `02dda36` (structural HEAD/GET parity contract + per-route parity test blocks for failure modes; +22 tests) |
| R25 | `review-mp1sqtcu-np9oo8` | NO-SHIP: HEAD-200 vs GET-206 on satisfiable Range (R24 parity block parametrized only over failure modes); reel post-Apply drift renders broken `<video>` instead of AC-7.21 placeholder. | `68bfa48` (HEAD computes 206 + Content-Range from known size; new `OpeningReelVideo` client component swaps to placeholder on media error; +12 tests) |
| R26 | `review-mp1t5rch-2qik83` | **SHIP / APPROVE** — no material findings. Branch ships. | — |

**Structural lessons (added to AGENTS.md):**

1. **AGENTS.md §1 line 75 — Same-vector recurrence rule.** 3 consecutive rounds on the same vector → comprehensive re-analysis required before next review fires. If the round AFTER the comprehensive pass still surfaces the same-vector class, the analysis is structurally incomplete — stop patching, deep-dive spec + diff together until convergence is structural. M7 Task 7.9 R20-R22 (per-instance) → R23 (structural #1) → R24 still found gap → R25 (structural #2 — extended success-path coverage) → R26 SHIP. The rule earned its keep here: each successive structural pass NARROWED the gap class (per-instance → failure-mode parametrization → success-mode parametrization) rather than chasing individual instances.
2. **Memory: "No pause after comprehensive re-analysis audit"** (`feedback_no_pause_after_audit.md`). Codified after I paused for confirmation post-R23 audit. Subsequent rounds proceeded directly: audit → patch → review.

**Final HEAD.** R26 verdict commit is `68bfa48`. The full convergence chain (R23/R24/R25 patches) lives in: `51ba0c8`, `02dda36`, `68bfa48` + meta updates `9945396`, `c069893` (AGENTS.md rule).

**Tests added during convergence (cumulative):**

- `tests/api/agenda-asset-route.test.ts`: +13 R23 + +7 R24 + +3 R25 (23 new).
- `tests/api/reel-asset-route.test.ts`: +15 R23 + +7 R24 + +3 R25 (25 new).
- `tests/api/diagram-asset-route.test.ts`: +13 R23 + +8 R24 + +3 R25 (24 new).
- `tests/components/tiles/OpeningReelVideo.test.tsx`: +3 R25 (new file).

**Net delta from R23 first comprehensive audit through R26 SHIP:** +75 tests, +1262 / -42 lines of code across 9 files. Two new AGENTS.md rules, one new feedback memory.
