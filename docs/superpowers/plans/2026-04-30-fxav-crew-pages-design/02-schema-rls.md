# Milestone 2 — Schema, RLS, migrations, seed (AC-2.1..2.7)

> Part of [the FXAV crew pages design plan](README.md).

Spec context: §4 entire data model, §17.1 milestone 2.

### Task 2.1: Initial schema migration — public tables

**Files:** Create: `supabase/migrations/20260501000000_initial_public_schema.sql`.

> Filename correction (2026-05-02): the earlier `20260501T0000_...` form is not applied by `supabase db reset`; Supabase CLI requires `<timestamp>_name.sql` with a numeric timestamp. M2 migrations therefore use `YYYYMMDDHHMMSS_name.sql`.

- [x] **Step 1: Author the migration** — copy SQL verbatim from §4.1 for the **public** tables (`shows`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`). Drop the comments that reference other tables; defer those to subsequent migrations. Include:
  - Every column from spec §4.1. : the migration's column list MUST include all FOUR reel pin columns; an earlier draft enumerated only two of them — a 4-tuple regression.
  - The partial unique index `crew_members_show_email_unique`.
  - The CHECK `crew_members_email_canonical` per §4.1.1.
  - All other email-bearing columns also get the canonical CHECK (transportation.driver_email, contacts.email, etc.).
  - The `last_sync_status` column has no CHECK in v1 (it's a free-text status; values listed in §4.1 comment).
- [x] **Step 2: Apply locally** `pnpm dlx supabase db reset` and confirm migration applies cleanly.
- [x] **Step 3: Commit** `feat(db): initial public schema (§4.1)`.

### Task 2.2: shows_internal + admin-only tables migration

**Files:** Create: `supabase/migrations/20260501001000_internal_and_admin.sql`.

- [ ] **Step 1: Author the canonical fresh-schema DDL — ONE source per table.** Earlier draft said "copy verbatim from §4 + §5.5.1 + §6.8.1 + §13.2.3" — but those sections contain overlapping additive DDL: §4.1 `CREATE TABLE drive_watch_channels` already defines `status`, then §5.5.1 `ALTER TABLE drive_watch_channels ADD COLUMN IF NOT EXISTS status` repeats it. §4.1 has `reports.idempotency_key .. unique`, §13.2.3 then adds an incremental unique index with a different name. Replaying both would either duplicate constraints or have `IF NOT EXISTS` mask drift that Task 2.5's exact-def matching is supposed to catch. The corrected design pins ONE authoritative source per table:

  | Table                                                                                                  | Canonical fresh-schema source (exact spec section that owns the CREATE TABLE block)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Spec sections to IGNORE during initial migration                                                                                                                                                                                                           |
  | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `shows`, `shows_internal`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts` | §4.1 `create table` blocks for the public crew-readable schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | none — these are §4.1-canonical                                                                                                                                                                                                                            |
  | `crew_member_auth`, `revoked_links`, `link_sessions`                                                   | §4.1 `create table` blocks for the auth schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | none                                                                                                                                                                                                                                                       |
  | `bootstrap_nonces`                                                                                     | §4.1 `create table bootstrap_nonces` block ( + — login-CSRF defense table for `/api/auth/redeem-link`; columns `nonce_hash text not null, show_id uuid not null references shows(id) on delete cascade, issued_at timestamptz not null default now, consumed_at timestamptz, primary key (nonce_hash, show_id)` plus the `issued_at` index per spec §4.1; admin-only per spec §4.3). ** composite PK is mandatory** — earlier single-PK on `nonce_hash` alone forced one live nonce per browser regardless of show, breaking multi-tab/multi-show flows; the composite key + consume-by-`(nonce_hash, show_id)` lets multiple live nonces coexist. The cleanup cron's range scan against `issued_at` is what motivates the index. | none                                                                                                                                                                                                                                                       |
  | `pending_syncs`, `pending_ingestions`                                                                  | §6.8.1 `create table` blocks (the staging surfaces are spec'd in §6.8.1, NOT §4.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | none                                                                                                                                                                                                                                                       |
  | `sync_audit`, `sync_log`                                                                               | §6.8.3 `create table` blocks (sync audit/log spec'd in §6.8.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | none                                                                                                                                                                                                                                                       |
  | `app_settings`                                                                                         | §4.5 `create table app_settings` block — includes the `check (id = 'default')` singleton AND the bootstrap `INSERT INTO app_settings (id) VALUES ('default') ON CONFLICT DO NOTHING` AS PART OF THE CREATE BLOCK. **No follow-on `ALTER TABLE app_settings ADD CONSTRAINT app_settings_singleton CHECK (id = 'default')` step** — the CHECK is already part of the spec's §4.5 CREATE definition and replaying it as an ALTER would duplicate the constraint. The migration includes the bootstrap insert verbatim from spec §4.5.                                                                                                                                                                                                |
  | `deferred_ingestions`                                                                                  | §4.5 `create table deferred_ingestions` (deferral surfaces are §4.5-canonical) — surrogate `id uuid` PK + `wizard_session_id uuid` (nullable) + the two partial unique indexes `deferred_ingestions_live_drive_file_idx` (live partition) and `deferred_ingestions_session_drive_file_idx` (wizard partition). The schema mirrors the / `pending_syncs` partition pattern; cron/push consult ONLY the live partition, wizard step-3 Discard writes the wizard partition, and finalize deletes the wizard partition (clean slate option A).                                                                                                                                                                                        | none                                                                                                                                                                                                                                                       |
  | `admin_alerts`                                                                                         | §4.6 `create table admin_alerts` (admin alerts are §4.6-canonical, including the `admin_alerts_one_unresolved_idx` partial unique index)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                                                                                                                                                                       |
  | `drive_watch_channels`                                                                                 | §5.5.1 `create table drive_watch_channels` (fresh-schema form including all columns + the `active_requires_drive_state` CHECK + `one_active_per_folder_idx`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | the §5.5.1 `ALTER TABLE drive_watch_channels ADD COLUMN IF NOT EXISTS ...` block at the bottom of §5.5.1 — those ALTER fragments are historical/migration-evolution notes; the fresh-schema CREATE at the top of §5.5.1 is canonical.                      |
  | `reports`                                                                                              | §4.1 `create table reports` block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | §13.2.3's `ALTER TABLE reports ADD COLUMN IF NOT EXISTS idempotency_key ...` and the secondary `CREATE UNIQUE INDEX IF NOT EXISTS reports_idempotency_key_idx` block — those are historical migration fragments; spec §13.2.3 keeps them for context only. |
  | `report_rate_limits`                                                                                   | §13.3 `create table report_rate_limits` block (rate-limit table spec'd in §13.3 — the bug-report rate-limit section, NOT §4.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | none                                                                                                                                                                                                                                                       |
  | `onboarding_scan_manifest`                                                                             | §4.5 `create table onboarding_scan_manifest` block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | M10 Task 10.4 contains the same DDL inline as historical context only — the canonical fresh-schema CREATE lives in §4.5 and is authored exclusively by Task 2.2; M10 just stamps rows.                                                                     |
  | `pending_snapshot_uploads`                                                                             | §4.5 `create table pending_snapshot_uploads` block ( + findings 1–2 + findings 1–2 — commit-aware snapshot ledger; one row per Apply attempt; 3-state lifecycle (unclaimed / claimed / committing_delete); includes `unique (temp_prefix)`, `unique (snapshot_revision_id)`, the `claim_token`/`claimed_at`/`claim_expires_at` triple-symmetry CHECK, the two `delete_started_at` invariant CHECKs, the `pending_snapshot_uploads_unpromoted_idx` partial index, the `pending_snapshot_uploads_claim_expiry_idx` partial index, and the `pending_snapshot_uploads_committing_delete_idx` partial index)                                                                                                                           | none — §4.5-canonical                                                                                                                                                                                                                                      |
  | `revision_race_cooldowns`                                                                              | §4.1 `create table revision_race_cooldowns` block ( — per-`(drive_file_id, raced_head_revision_id)` cooldown ledger that bounds revision-race retry storms; composite PK on `(drive_file_id, raced_head_revision_id)`; includes the `revision_race_cooldowns_last_race_idx` non-partial index on `(last_race_at)` for §7.8 GC age sweep)                                                                                                                                                                                                                                                                                                                                                                                          | none — §4.1-canonical                                                                                                                                                                                                                                      |

  : an earlier draft of this matrix put `app_settings`, `deferred_ingestions`, `admin_alerts`, `sync_audit` all under §4.1 even though their CREATE blocks live in §4.5/§4.6/§6.8.3 of the spec, AND added a redundant `ALTER TABLE app_settings ADD CONSTRAINT app_settings_singleton CHECK (id = 'default')` step that recreated the additive-replay hazard the matrix was supposed to eliminate (the §4.5 CREATE already defines that CHECK inline). The corrected matrix above points to the exact owning section per table and has no redundant ALTER steps.

  **The initial migration is a CREATE-only artifact** — every table appears as a single `CREATE TABLE` block + its own `CREATE INDEX` / `CREATE UNIQUE INDEX` lines per §4.1. **No `ALTER TABLE` statements** in the initial migration. No `IF NOT EXISTS` modifiers (those mask drift). If a future schema change needs to adjust an existing column, it lands as a NEW migration with a fresh timestamp, not by re-replaying additive fragments.

  Task 8.1 is now a TEST + LEASE-LOGIC formalization milestone — it asserts the columns/indexes Task 2.2 authored from §4.1 are in place AND adds application-side helpers around them. No duplicate ALTER migration.

  Include in the initial migration:
  - The `pending_syncs.source_kind` CHECK constraint (`('cron','push','manual','onboarding_scan')`).
  - The `pending_syncs.wizard_session_id` partial index.
  - `admin_alerts_one_unresolved_idx` partial unique index.
  - `drive_watch_channels` status CHECK + active-row constraint + partial unique index.
  - `revoked_links.token_version > 0` CHECK (AC-2.4).
  - **JWT signing-key rotation columns (§7.2.3 / AC-5.6a):** `link_sessions.signing_key_id text not null` (captured at redemption time from `app_settings.active_signing_key_id`); `app_settings.active_signing_key_id text not null default 'k1'` inline in the §4.5 CREATE block. Task 2.5 introspection adds REQUIRED_COLUMNS entries for both. Validator step 3a (Task 5.2) reads `app_settings.active_signing_key_id` per request and DELETEs + 401's `LINK_SESSION_KEY_ROTATED` on mismatch. JWT mint (Task 5.1) reads `app_settings.active_signing_key_id` at sign time so newly-issued JWTs carry the active key id; the redeem-link route (Task 5.4) writes the row with the captured `signing_key_id`. **The columns ship in the initial migration as a single linked unit** — no follow-on ALTER per Step 1's no-ALTER rule.
  - `deferred_ingestions` surrogate `id uuid` PK + `wizard_session_id uuid` column + both partial unique indexes (`deferred_ingestions_live_drive_file_idx` on `(drive_file_id) WHERE wizard_session_id IS NULL`; `deferred_ingestions_session_drive_file_idx` on `(drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL`). Spec §4.5 is the canonical source.
  - ** + **: `bootstrap_nonces` table (`nonce_hash text not null, show_id uuid not null references shows(id) on delete cascade, issued_at timestamptz not null default now, consumed_at timestamptz, primary key (nonce_hash, show_id)`) + the `issued_at` index per spec §4.1. ** composite PK is mandatory** — earlier single-PK on `nonce_hash` alone forced one live nonce per browser regardless of show, breaking multi-tab/multi-show flows. Admin-only RLS per spec §4.3.
  - ** + findings 1–2 + findings 1–2**: `pending_snapshot_uploads` table — **grain is one row per Apply attempt (NOT per asset)** per . DDL: `id uuid primary key default gen_random_uuid, show_id uuid not null references shows(id) on delete cascade, drive_file_id text not null, temp_prefix text not null, snapshot_revision_id uuid not null, asset_count int not null check (asset_count >= 0), uploaded_at timestamptz not null default now, promoted_at timestamptz, claim_token uuid, claimed_at timestamptz, claim_expires_at timestamptz, delete_started_at timestamptz, promote_started_at timestamptz, unique (temp_prefix), unique (snapshot_revision_id), check ((claim_token IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL) OR (claim_token IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL)), check (delete_started_at IS NULL OR claim_token IS NOT NULL), check (delete_started_at IS NULL OR promoted_at IS NULL)`. **3-state lifecycle (with promote sub-state)**: rows are in `unclaimed` (all five nullable cols NULL), `claimed` (claim_token + claimed_at + claim_expires_at set; `delete_started_at IS NULL`; lease = claimed_at + 5 minutes; `promote_started_at` may be NULL or NOT NULL — the latter signals the row is mid-promote and is therefore invisible to the reclaim-expired sweep), or `committing_delete` (above + `delete_started_at IS NOT NULL`; lease extended to `delete_started_at + 15 minutes`). Each transition is an atomic UPDATE with state-guarding WHERE clause; 0-row return = lost ownership, abort. The decisive transition is **commit-to-delete**: `UPDATE pending_snapshot_uploads SET delete_started_at = now, claim_expires_at = now + interval '15 minutes' WHERE id = $1 AND claim_token = $2 AND promoted_at IS NULL AND delete_started_at IS NULL AND promote_started_at IS NULL RETURNING *` — Storage DELETE runs ONLY after this returns 1 row; **promote** and **reclaim-expired** both refuse rows with `delete_started_at IS NOT NULL`, AND **reclaim-expired** ALSO refuses rows with `promote_started_at IS NOT NULL` (the non-reclaimable promotion sub-state safety invariant — a stalled rename CANNOT be reclaimed by another worker mid-rename). Spec §6.11 documents the full transition table (claim / heartbeat / reclaim-expired / commit-to-delete / delete / promote). **`claim_expires_at` replaces the prior `claimed_at + 5 minutes` derivation** because the lease length now varies by state (5 min in claimed, 15 min in committing_delete) AND heartbeats need to extend it independently of `claimed_at`. **`delete_started_at` is the state-discriminator column** that makes the lifecycle a 3-state machine instead of the 2-state machine. **`promote_started_at` is the non-reclaimable-promotion sub-state column** — set in the SAME UPDATE that acquires the claim for the post-commit promoter (so the reclaim-expired sweep refuses the row immediately); cleared (set to NULL) when `promoted_at` is set OR on (P5) rollback success; NOT cleared on (P5-stuck) reverse-rename failure (admin-only repair via `/api/admin/snapshot-rollback/[id]/repair` clears it after reconciling the split-prefix state). Stuck-promote recovery: rows with `promote_started_at < now() - interval '15 min' AND promoted_at IS NULL` emit `PENDING_SNAPSHOT_PROMOTE_STUCK` admin alerts via the new `pending_snapshot_uploads_promote_stuck_idx` partial index. **All-or-nothing promotion**: the post-commit promoter runs Storage `LIST` on the temp prefix → asserts `count === asset_count` → forward-renames every asset → re-`LIST`s the canonical prefix → asserts manifest match → only then runs the **promote** state transition. ANY failure (rename error, manifest mismatch) reverse-renames every successfully-promoted asset back to the temp prefix; `shows.diagrams.pending_revision_id` stays staged on the JSONB AND `promoted_at` stays NULL so the next sweep retries. A partial canonical prefix never becomes live. Indexes: (a) `pending_snapshot_uploads_unpromoted_idx` on `(uploaded_at) WHERE promoted_at IS NULL AND claim_token IS NULL` for the GC sweep range scan in Task 7.8; (b) `pending_snapshot_uploads_claim_expiry_idx` on `(claim_expires_at) WHERE claim_token IS NOT NULL AND promoted_at IS NULL AND delete_started_at IS NULL AND promote_started_at IS NULL` — the reclaim-expired path range-scans this index AND the `promote_started_at IS NULL` predicate is what makes mid-promote rows invisible to reclaim; (c) `pending_snapshot_uploads_promote_stuck_idx` on `(promote_started_at) WHERE promote_started_at IS NOT NULL AND promoted_at IS NULL` for the admin-attention sweep (`PENDING_SNAPSHOT_PROMOTE_STUCK` admin alerts); (d) `pending_snapshot_uploads_committing_delete_idx` on `(delete_started_at) WHERE delete_started_at IS NOT NULL` for crashed-delete-worker recovery (rare; bounded by the 15-minute extended lease). **The §4.5 admin-only list grows from 16 → 17 tables** with this addition; AC-2.5 / Task 2.3 / Task 2.5 propagate automatically since the `ADMIN_TABLES` registry is derived from the spec §4.3 admin-only list at build time. Per spec §6.11 + plan Task 7.3 amendment: each Apply attempt inserts EXACTLY ONE ledger row at temp-prefix-allocation time; post-commit Storage rename promotes via the all-or-nothing manifest protocol — claim acquisition sets `promote_started_at` in the SAME UPDATE — then runs the **promote** state transition; abort path leaves `promoted_at IS NULL AND delete_started_at IS NULL AND promote_started_at IS NULL` for the Task 7.8 GC sweep.
  - ** — `shows.pending_snapshot_path` column REMOVED**: the earlier draft added a `shows.pending_snapshot_path TEXT` column that the asset route consulted as a temp-prefix fallback when the post-commit Storage rename hadn't yet completed. That fallback was the very mechanism that exposed an unpromoted (still-temp-prefix) revision as the live gallery to crew, defeating the all-or-nothing-promotion safety guarantee. The corrected design keeps the prior approved revision authoritative until the rename completes and atomically cuts over via the JSONB `pending_revision_id` field on `shows.diagrams` (no new column on `shows`; field lives inside the existing `diagrams` JSONB). The `shows.pending_snapshot_path` column is therefore NOT in the initial schema migration AND is NOT in Task 2.5's `REQUIRED_COLUMNS` matrix — the asset route serves only `snapshot_revision_id`-prefixed bytes per the prior-revision-authoritative-until-promote-succeeds contract documented in Task 7.5 / spec §7.3 / spec §6.11 (P4)/(P5).
  - `revision_race_cooldowns` table (admin-only per §4.3 — list grows from 17 → 18 tables). DDL: `drive_file_id text not null, raced_head_revision_id text not null, last_race_at timestamptz not null default now, retry_count int not null default 0, primary key (drive_file_id, raced_head_revision_id)` + index `revision_race_cooldowns_last_race_idx` on `(last_race_at)` for the §7.8 GC age sweep. Cron / push consult BEFORE retrying a `STAGED_PARSE_REVISION_RACE`: compute `cooldown_seconds = LEAST(60 * (2 ^ retry_count), 600)`; if `now < last_race_at + cooldown_seconds`, skip with `STAGED_PARSE_REVISION_RACE_COOLDOWN` (§12.4 — admin-log only). Manual re-sync and `sheet_unavailable` recovery skip the gate. On race detect: UPSERT with `last_race_at = now, retry_count = retry_count + 1`. On successful Phase 2 commit: `DELETE FROM revision_race_cooldowns WHERE drive_file_id = $1`. The `ADMIN_TABLES` registry / AC-2.5 propagate automatically via the §4.3 build-time parity invariant (Task X.6).
  - `wizard_finalize_checkpoints` table (admin-only per §4.3 — 19 tables total). DDL: `id uuid primary key default gen_random_uuid, wizard_session_id uuid not null unique, last_processed_drive_file_id text, last_processed_at timestamptz, batches_completed int not null default 0, status text not null default 'in_progress' check (status in ('in_progress', 'all_batches_complete', 'final_cas_done'))` + partial index `wizard_finalize_checkpoints_status_idx` on `(status) WHERE status <> 'final_cas_done'` for the dashboard's "in-flight finalize" lookup AND for the `FINALIZE_OWNED_SHOW` admin-write guard (the join-from-show-to-checkpoint path filters on this index). **Server-owned multi-batch finalize cursor** — the `/finalize` endpoint accepts NO query parameter; each batch's row set is derived authoritatively from `pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = TRUE ORDER BY drive_file_id LIMIT 100` (re-Approved rows naturally re-enter regardless of `drive_file_id` ordering because §6.8.1 step-list 6L DELETEs promoted rows AND the per-row race-abort follow-up sets `wizard_approved = FALSE` for raced rows). The checkpoint row's `last_processed_drive_file_id` is observability-only — NEVER consulted by the next batch's SELECT. Lifecycle: first finalize call INSERTs with `status = 'in_progress'`; each batch UPDATEs `last_processed_drive_file_id` + `batches_completed` + `last_processed_at`; when a batch drains the last `wizard_approved = TRUE` row, that batch flips `status = 'all_batches_complete'`; the separate Phase D `/finalize-cas` endpoint reads the row, verifies `status = 'all_batches_complete'` AND `pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = TRUE` count is 0, then runs §4.5 atomic-promotion CAS + `published = TRUE` flip + clean-slate DELETE in ONE short transaction (no Drive/Storage I/O), then sets `status = 'final_cas_done'`. The `ADMIN_TABLES` registry / AC-2.5 propagate automatically via the §4.3 build-time parity invariant (Task X.6) — AC-2.5 covers 19 tables × 4 verbs = 76 assertions.
  - `shows_pending_changes` table (admin-only per §4.3). DDL: `id uuid primary key default gen_random_uuid, wizard_session_id uuid not null, drive_file_id text not null, show_id uuid not null references shows(id) on delete cascade, payload jsonb not null, applied_by_email text not null, applied_at_intent timestamptz not null, staged_at timestamptz not null default now, unique (wizard_session_id, drive_file_id)` + indexes `shows_pending_changes_session_idx` on `(wizard_session_id)` AND `shows_pending_changes_show_idx` on `(show_id)`. **Wizard-scoped shadow surface for re-run-setup updates** — Phase B's per-row sub-transaction for an EXISTING-SHOW lock-time SELECT writes the Phase-2 payload INTO this table instead of UPDATEing the live `shows` row directly. The full `payload` JSONB carries every sheet-derived column the prior contract would have written (title, client_label, template_version, financials snapshot, diagrams with canonical Storage paths, transportation, hotel_reservations, rooms, contacts, last_seen_modified_time, parse_warnings, raw_unrecognized) plus the freshly-minted `snapshot_revision_id`. Phase D reads every staged row for the session, applies `UPDATE shows SET <payload columns> WHERE id = $show_id` under a per-show advisory lock with manual-mode CAS-gating against `last_seen_modified_time`, writes `sync_audit` using `applied_by_email` + `applied_at_intent` (Doug's Apply-time attribution preserved per the operator-attribution contract), DELETEs the staged rows on success. `cleanupAbandonedFinalize` simply `DELETE FROM shows_pending_changes WHERE wizard_session_id = $sessionId` — already-live shows revert to their pre-finalize state without ANY `shows` mutation. The `FINALIZE_OWNED_SHOW` admin-write guard expands to fire when a `shows_pending_changes` row exists for the show's `drive_file_id` joined to `wizard_finalize_checkpoints.status IN ('in_progress','all_batches_complete')`. The `ADMIN_TABLES` registry / AC-2.5 propagate automatically via the §4.3 build-time parity invariant (Task X.6) — AC-2.5 covers 20 tables × 4 verbs = 80 assertions.
  - `recovery_drift_cooldowns` table (admin-only per §4.3). DDL: `show_id uuid not null, preview_revision_id uuid not null, last_drift_at timestamptz not null default now, retry_count int not null default 0, primary key (show_id, preview_revision_id)` + index `recovery_drift_cooldowns_last_drift_idx` on `(last_drift_at)` for the §7.8 GC age sweep. **Bounds `ASSET_RECOVERY_REVISION_DRIFT` retry storms.** Cron consults BEFORE running the asset_recovery pre-pass (Task 7.4 Step 0a): compute `cooldown_seconds = LEAST(60 * (2 ^ retry_count), 600)`; if `now < last_drift_at + cooldown_seconds`, skip with `ASSET_RECOVERY_DRIFT_COOLDOWN` (§12.4 — admin-log only). Manual re-sync from `/admin/show/<slug>` skips the gate (admin override). On revision drift detected (Task 7.4 Step 3): UPSERT with `last_drift_at = now, retry_count = retry_count + 1`. On successful asset_recovery completion: `DELETE FROM recovery_drift_cooldowns WHERE show_id = $1`. The `ADMIN_TABLES` registry / AC-2.5 propagate automatically via the §4.3 build-time parity invariant (Task X.6) — AC-2.5 covers 21 tables × 4 verbs = 84 assertions. **Mirrors the `revision_race_cooldowns` pattern** — same UPSERT-on-event / DELETE-on-success / manual-bypass / composite-key-isolation semantics; substitute `(show_id, preview_revision_id)` for `(drive_file_id, raced_head_revision_id)` and `ASSET_RECOVERY_REVISION_DRIFT`/`ASSET_RECOVERY_DRIFT_COOLDOWN` for `STAGED_PARSE_REVISION_RACE`/`STAGED_PARSE_REVISION_RACE_COOLDOWN`.
  - ** — composite `viewer_version_token` columns + UPDATE triggers + SQL helper.** Realtime invalidation needs a monotonic per-show token that advances on EVERY mutation visible to a viewer — including auth-only mutations on `crew_member_auth` and role-only mutations on `crew_members` that don't touch `shows`. Add the following inline in §4.1's `create table crew_member_auth (...)` and `create table crew_members (...)` blocks; the new columns ship in the initial migration alongside the table CREATE (no follow-on ALTER per Step 1's no-ALTER rule):
    - `crew_member_auth.last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now` — bumped to `now` by a per-row BEFORE-UPDATE trigger on every UPDATE of any other column.
    - `crew_members.last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now` — same pattern.
    - **Trigger split: BEFORE-ROW for `last_changed_at` bump (cheap, per-row); AFTER-STATEMENT for `pg_notify` (one notify per show_id per statement, regardless of row count).** A naive design that combined both into a single per-row trigger fires `pg_notify` once per touched row AND re-aggregates `MAX(last_changed_at)` across BOTH `crew_member_auth` and `crew_members` for the affected show on EVERY row. An Apply touching 5 `crew_members` rows + 2 `crew_member_auth` rows + the `shows` row would emit 8 notifies AND run the helper's two `SELECT MAX(...)` aggregates 7 times — O(N×rows-per-table) write amplification on busy shows. The corrected design uses Postgres `REFERENCING NEW TABLE AS new_rows` transition-table support: the AFTER-STATEMENT trigger reads `SELECT DISTINCT show_id FROM new_rows` (cardinality bounded by the number of distinct show_ids the statement touched — typically 1) and emits exactly ONE `pg_notify` per unique show_id. DDL form (copy spec §4.1 verbatim, including the SECURITY DEFINER hardening: `SET search_path = public, pg_temp` with `pg_temp` placed LAST; every relation/function reference inside the body schema-qualified; `REVOKE ALL ... FROM PUBLIC` to deny ambient EXECUTE since the function is invoked only via trigger context):

      ```sql
      -- BEFORE-ROW trigger: bump last_changed_at only. No pg_notify here. Cheap per-row work.
      create or replace function bump_last_changed_at()
        returns trigger
        language plpgsql
        security definer
        set search_path = public, pg_temp
      as $$
      begin
        new.last_changed_at := now();
        return new;
      end;
      $$;
      revoke all on function bump_last_changed_at() from public;

      create trigger crew_member_auth_bump_last_changed_at
        before update on crew_member_auth
        for each row
        when (old.* is distinct from new.*)
        execute function bump_last_changed_at();

      create trigger crew_members_bump_last_changed_at
        before update on crew_members
        for each row
        when (old.* is distinct from new.*)
        execute function bump_last_changed_at();

      -- AFTER-STATEMENT trigger: emit pg_notify exactly ONCE per distinct show_id
      -- the statement touched, regardless of how many rows. Reads the transition
      -- table `new_rows` provided by Postgres for AFTER-STATEMENT triggers with a
      -- REFERENCING NEW TABLE clause. An Apply touching 5 crew_members rows for
      -- a single show emits exactly ONE pg_notify, NOT 5.
      create or replace function publish_show_invalidation_after_statement()
        returns trigger
        language plpgsql
        security definer
        set search_path = public, pg_temp
      as $$
      declare
        r record;
      begin
        for r in select distinct show_id from new_rows where show_id is not null loop
          perform pg_notify(
            'realtime:broadcast',
            json_build_object(
              'topic',   'show:' || r.show_id || ':invalidation',
              'event',   'invalidate',
              'payload', json_build_object('show_id', r.show_id, 'version_token', public.viewer_version_token(r.show_id))
            )::text
          );
        end loop;
        return null;
      end;
      $$;
      revoke all on function publish_show_invalidation_after_statement() from public;

      -- Per-table AFTER-STATEMENT triggers; transition table named `new_rows`.
      -- Postgres requires a separate trigger per table; a single trigger cannot
      -- span tables. Both UPDATE and INSERT fire (the publish path covers both
      -- "an existing crew row's role_flags changed" and "a new crew row was
      -- inserted by Apply" — both are viewer-visible mutations).
      create trigger crew_member_auth_publish_invalidation
        after update on crew_member_auth
        referencing new table as new_rows
        for each statement
        execute function publish_show_invalidation_after_statement();

      create trigger crew_member_auth_publish_invalidation_insert
        after insert on crew_member_auth
        referencing new table as new_rows
        for each statement
        execute function publish_show_invalidation_after_statement();

      create trigger crew_members_publish_invalidation
        after update on crew_members
        referencing new table as new_rows
        for each statement
        execute function publish_show_invalidation_after_statement();

      create trigger crew_members_publish_invalidation_insert
        after insert on crew_members
        referencing new table as new_rows
        for each statement
        execute function publish_show_invalidation_after_statement();
      ```

      The `WHEN (OLD.* IS DISTINCT FROM NEW.*)` predicate on the BEFORE-ROW bump trigger prevents trigger recursion on the trigger's own `last_changed_at` write. The AFTER-STATEMENT trigger does NOT take a WHEN predicate (transition-table triggers cannot use `OLD.*` / `NEW.*` row references); recursion is structurally impossible because the AFTER-STATEMENT body issues only `pg_notify` and `SELECT` calls, no UPDATE/INSERT/DELETE on the same tables. **Write-amplification regression test (mandatory)**: in a single transaction execute `UPDATE crew_member_auth SET ... WHERE show_id = $1` (5 rows) AND `UPDATE crew_members SET ... WHERE show_id = $1` (2 rows) AND `UPDATE shows SET ... WHERE id = $1` (1 row). Capture every `pg_notify` issued during the transaction (via a `LISTEN realtime:broadcast` test fixture). Assert: EXACTLY THREE notifies were issued — one per statement, each carrying the same `show_id` payload — NOT seven (one-per-row regression) and NOT eight. **Helper-call regression test**: count `viewer_version_token($1)` invocations during the same transaction. Assert: EXACTLY THREE (one per AFTER-STATEMENT firing), NOT seven. The per-statement boundary is the contract.

    - SQL helper (copy spec §4.1 verbatim, including the SECURITY DEFINER hardening: `SET search_path = public, pg_temp`; every relation reference inside the body schema-qualified with `public.`; `REVOKE ALL ... FROM PUBLIC` then explicit `GRANT EXECUTE TO authenticated, anon, service_role` so the `/api/show/[slug]/version` route can call it under the request principal regardless of whether it carries a Supabase Auth session):
      ```sql
      create or replace function viewer_version_token(p_show_id uuid)
        returns text
        language sql
        stable
        security definer
        set search_path = public, pg_temp
      as $$
        select to_char(greatest(
          coalesce((select extract(epoch from last_synced_at) * 1000 from public.shows where id = p_show_id), 0),
          coalesce((select extract(epoch from max(last_changed_at)) * 1000 from public.crew_member_auth where show_id = p_show_id), 0),
          coalesce((select extract(epoch from max(last_changed_at)) * 1000 from public.crew_members      where show_id = p_show_id), 0)
        ), 'FM999999999999999');
      $$;
      revoke all on function viewer_version_token(uuid) from public;
      grant execute on function viewer_version_token(uuid) to authenticated, anon, service_role;
      ```
      Returns a stringified epoch-ms representation that's stable for equality + ordering comparisons. The function is SECURITY DEFINER so non-admin callers (the `/api/show/[slug]/version` route running as the request principal) can compute it without RLS-blocking on `crew_member_auth` reads — the function is owned by the migration role and exposes only the aggregate timestamp, NOT any auth-bearing column. **Hardening posture:** `SET search_path = public, pg_temp` with `pg_temp` placed LAST closes the writable-schema search-path attack (an attacker with CREATE on `pg_temp` cannot shadow `public.shows` / `public.crew_member_auth` / `public.crew_members` because the planner resolves unqualified names against `public` first). Schema-qualifying every relation reference inside the body provides defense-in-depth even if `search_path` is later misconfigured. `REVOKE ALL ... FROM PUBLIC` denies ambient EXECUTE; the explicit `GRANT EXECUTE TO authenticated, anon, service_role` is the minimal role set needed by the version route's three caller identities (signed-in admin via `service_role`-equivalent, signed-in crew via `authenticated`, redeemed-link crew with no Supabase Auth via `anon`).
    - The publish helper `lib/realtime/showInvalidation.ts` `publishShowInvalidation(tx, showId)` (M4 Task 4.16) is the application-side equivalent for Phase 2 commit sites that don't go through one of these triggers. **Both producers emit the same payload shape AND the same composite token** — the bridge cannot tell whether a Broadcast came from the trigger or from the helper.
    - Task 2.5 introspection MUST add new `REQUIRED_COLUMNS` entries for `crew_member_auth.last_changed_at` and `crew_members.last_changed_at`, AND add a `REQUIRED_TRIGGERS` matrix covering the BEFORE-ROW bump triggers (`crew_member_auth_bump_last_changed_at`, `crew_members_bump_last_changed_at`) AND the AFTER-STATEMENT publish triggers (`crew_member_auth_publish_invalidation`, `crew_member_auth_publish_invalidation_insert`, `crew_members_publish_invalidation`, `crew_members_publish_invalidation_insert`). The publish-trigger assertion MUST verify (i) trigger timing is `AFTER` (not `BEFORE`); (ii) trigger level is `STATEMENT` (not `ROW`); (iii) the trigger references a transition table named `new_rows` — query `pg_trigger.tgoldtable` / `pg_trigger.tgnewtable` and assert `tgnewtable = 'new_rows'` AND `tgoldtable IS NULL`; (iv) the bump trigger is `BEFORE ROW` with WHEN predicate `(old.* IS DISTINCT FROM new.*)`. AND add a `REQUIRED_FUNCTIONS` matrix asserting (a) `viewer_version_token(uuid)` returns `text` and is `STABLE` `SECURITY DEFINER`, (b) `bump_last_changed_at()` returns `trigger` and is `SECURITY DEFINER`, (c) `publish_show_invalidation_after_statement()` returns `trigger` and is `SECURITY DEFINER`. **For all three functions the matrix MUST also assert SECURITY DEFINER hardening posture verbatim:** (i) `pg_get_functiondef(oid)` contains the literal substring `SET search_path TO public, pg_temp` — a regression that drops the SET clause OR places `pg_temp` first OR omits it entirely fails the assertion; (ii) `pg_get_functiondef(oid)` shows every relation/function reference inside the body schema-qualified — regex `/\bpublic\.(shows|crew_member_auth|crew_members|viewer_version_token)\b/` matching at least once AND `/(?<!public\.)\b(shows|crew_member_auth|crew_members|viewer_version_token)\b/` matching ZERO times inside the body region; (iii) `has_function_privilege('public', '<fn>', 'EXECUTE')` returns FALSE for `bump_last_changed_at()` AND for `publish_show_invalidation_after_statement()` (proves `REVOKE ALL ... FROM PUBLIC` ran on both trigger-context functions); (iv) for `viewer_version_token(uuid)`, `has_function_privilege` returns TRUE for `authenticated`, `anon`, AND `service_role`; (v) the two trigger-context functions assert no GRANT (invoked only via trigger context — `REVOKE ALL FROM PUBLIC` is sufficient). The matrix is the introspection counterpart to the new DDL — without it, a regression that drops the AFTER-STATEMENT trigger but leaves the BEFORE-ROW bump trigger would silently break Realtime invalidation (rows get bumped, no broadcast fires), AND a regression that re-merges the two triggers into the original per-row form would silently restore the O(N) write-amplification bug.

- [ ] **Step 2: `app_settings` singleton bootstrap is part of the §4.5 CREATE block**. Spec §4.5 already defines `id text primary key check (id = 'default')` inline AND specifies the bootstrap `INSERT INTO app_settings (id) VALUES ('default') ON CONFLICT DO NOTHING` immediately after the CREATE. The migration copies that block verbatim — no follow-on ALTER. The bootstrap insert is the only post-CREATE step (a one-row INSERT, not a constraint addition):
  ```sql
  -- (CREATE TABLE app_settings .. copied from spec §4.5 — includes the singleton CHECK inline)
  -- Bootstrap row (idempotent — `db reset` rerun is safe; spec §4.5 specifies this verbatim)
  INSERT INTO app_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;
  ```
- [ ] **Step 3: Apply locally; verify** every table in §4 exists with documented columns (AC-2.1) AND `SELECT count(*) FROM app_settings WHERE id = 'default'` returns exactly 1 after `db reset`.
- [ ] **Step 4: Commit** `feat(db): shows_internal + admin-only tables + app_settings singleton bootstrap (§4)`.

### Task 2.3: RLS policies (AC-2.5, AC-2.6)

**Files:** Create: `supabase/migrations/20260501002000_rls_policies.sql`.

- [ ] **Step 1: Author** RLS per §4.3. For each table:
  - **Admin-only tables** (full list in §4.3): `ENABLE RLS` + a single policy `admin_only` granting select/insert/update/delete to roles where the zero-arg SQL helper `is_admin()` returns TRUE. `is_admin()` returns BOOLEAN and is TRUE iff `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'` OR `canonicalize_email(auth.email())` matches a configured admin allowlist email. AC-2.5 covers EVERY table in §4.3's admin-only list across ALL FOUR verbs (SELECT/INSERT/UPDATE/DELETE) — the `ADMIN_TABLES` registry in the AC-2.5 test (Step 4 below) is the single source of truth and MUST contain entries for the complete **21-table** §4.3 list: `shows_internal`, `sync_log`, `reports`, `pending_syncs`, `pending_ingestions`, `crew_member_auth`, `revoked_links`, `link_sessions`, `bootstrap_nonces`, `app_settings`, `deferred_ingestions`, `admin_alerts`, `sync_audit`, `drive_watch_channels`, `report_rate_limits`, `onboarding_scan_manifest`, `pending_snapshot_uploads`, `revision_race_cooldowns` (per-`(drive_file_id, raced_head_revision_id)` cooldown ledger that bounds revision-race retry storms; admin-only by construction since cron/push are the only writers), `wizard_finalize_checkpoints`, `shows_pending_changes` (wizard-scoped shadow surface for re-run-setup updates to ALREADY-LIVE shows; admin-only by construction since /finalize, /finalize-cas, and cleanupAbandonedFinalize are the sole writers), `recovery_drift_cooldowns` (per-`(show_id, preview_revision_id)` cooldown ledger that bounds asset_recovery revision-drift retry storms; admin-only by construction since cron is the sole writer). The test exercises every (table × verb) cell; missing any cell fails AC-2.5. The `__test_singleton_rls_probe` SECURITY-INVOKER helper handles the singleton tables (`app_settings`); the standard 4-test harness handles all others. **Build-time invariant (X.6 audit)**: the `ADMIN_TABLES` registry's count and identity MUST agree with the spec §4.3 admin-only list at build time; CI fails if they drift. Task X.6 owns the cross-cutting §4.3 ↔ AC-2.5 parity assertion (see Task X.6 Step 2).
  - **`SECURITY DEFINER` membership helper.** A naïve `EXISTS (SELECT 1 FROM crew_members ...)` predicate applied to `crew_members` itself is self-referential — when Postgres evaluates the policy, it consults the same RLS-protected relation, which can recurse or fail outright. The corrected design defines a `SECURITY DEFINER` helper that bypasses RLS for the membership lookup:
    ```sql
    CREATE OR REPLACE FUNCTION can_read_show(p_show_id uuid)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER -- runs with the function owner's privileges, NOT the caller's
    SET search_path = public, pg_temp -- : pg_temp MUST be LAST (not omitted).
                                              -- Postgres prepends an implicit `pg_temp` to search_path if
                                              -- not listed, meaning `pg_temp` is searched FIRST. An attacker
                                              -- with CREATE on pg_temp can shadow `crew_members` /
                                              -- `is_admin()` / `auth_email_canonical()` with malicious temp
                                              -- objects and hijack this SECURITY DEFINER predicate.
                                              -- Listing `pg_temp` explicitly LAST forces the planner to
                                              -- resolve unqualified names against `public` first. Per
                                              -- PostgreSQL docs (CREATE FUNCTION → SET clause + Security
                                              -- chapter on writable-schema-search-path attacks). Same
                                              -- pattern applied to every SECURITY DEFINER function in
                                              -- this plan/spec.
    STABLE -- pure within a transaction; planner can cache
    AS $$
      SELECT public.is_admin()
          OR EXISTS (
               SELECT 1 FROM public.crew_members c
                WHERE c.show_id = p_show_id
                  AND c.email = public.auth_email_canonical()
             );
    $$;
    REVOKE ALL ON FUNCTION can_read_show(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION can_read_show(uuid) TO authenticated, anon;
    ```
    Because the helper runs with the function owner's privileges, the inner `SELECT FROM crew_members` is NOT subject to crew_members' RLS — no recursion. The `STABLE` marker lets Postgres cache the result within a query plan. Every relation/function reference in the body is schema-qualified (`public.crew_members`, `public.is_admin()`, `public.auth_email_canonical()`) so even a misordered search_path or a pg_temp shadow cannot redirect resolution. **Helper API contract — three canonical helpers (Task 2.5 introspection enforces shape):** (a) `is_admin()` — zero-arg, returns BOOLEAN, body `SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR public.auth_email_canonical() = ANY(<admin allowlist>)`. (b) `auth_email_canonical()` — zero-arg, returns TEXT, body `SELECT public.canonicalize_email(auth.email())`. Convenience wrapper for the current session; equivalent to `canonicalize_email(auth.email())` but readable inline in policies. (c) `canonicalize_email(text)` — one-arg pure function (`IMMUTABLE`), returns TEXT, body `SELECT lower(btrim($1))`. Used by triggers/migrations that operate without session context (the email-canonicalization invariant from §4.x lives here). **Every callsite invokes these as proper function calls (with parens) — never as bare identifiers.** Sweep the plan AND spec for any remaining bare-identifier usage (`public.is_admin` without `()`, `public.auth_email_canonical` without `()`) and convert; AC-2.1 introspection adds these assertions explicitly: `SELECT pronargs FROM pg_proc WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace` returns exactly `0`; `SELECT pronargs FROM pg_proc WHERE proname = 'auth_email_canonical'` returns exactly `0`; `SELECT pronargs FROM pg_proc WHERE proname = 'canonicalize_email'` returns exactly `1`. `pg_get_functiondef(oid)` for each helper MUST contain the documented body literal (regex match on the canonical SELECT shape) so a regression that drops/renames/changes the body fails AC-2.1 explicitly. **SECURITY DEFINER hardening matrix:** every SECURITY DEFINER function defined or referenced anywhere in this plan or spec MUST satisfy three rules: (a) `SET search_path = public, pg_temp` (or `= pg_temp` placed LAST in any longer list), never `SET search_path = public` alone; (b) every relation/function reference inside the body is schema-qualified; (c) `REVOKE ALL .. FROM PUBLIC` then explicit `GRANT EXECUTE TO <minimal-role-set>`. Affected sites audited and amended in this plan: `can_read_show` (this section), `is_admin()` (defined inline below — apply the same rule), `auth_email_canonical()` (helper used by `can_read_show`), `canonicalize_email(text)` (the one-arg pure helper; `IMMUTABLE` rather than SECURITY DEFINER but still SCHEMA-qualifies its dependencies and applies REVOKE/GRANT), `__test_singleton_rls_probe`, `introspect_fk` (Task 2.5 FK-introspection helper), and any other SECURITY DEFINER helper added by Tasks 2.2–2.5, M5 (`applyStaged`-time helpers), M6 (`withShowSyncTransaction` if defined as SECURITY DEFINER), M8 (report-rate-limit helpers), or M10 (wizard-CAS helpers). Self-review must grep the plan and spec for every `SECURITY DEFINER` literal and confirm each adjacent definition shows `pg_temp` in its `SET search_path` and uses fully-qualified names in the body.
  - **Crew-readable tables** (`shows`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`): the SELECT policy on EVERY crew-readable table is `is_admin() OR (can_read_show(<table>.show_id) AND EXISTS (SELECT 1 FROM public.shows WHERE id = <table>.show_id AND published = TRUE))`. For the `shows` table itself, the predicate simplifies to `is_admin() OR (can_read_show(shows.id) AND shows.published = TRUE)` since the join target IS the row being checked. **The `published = TRUE` gate MUST be replicated on every peer crew-readable table** (`crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`) — NOT only on `shows` — because Supabase clients (PostgREST) can issue direct queries against any peer table without traversing `shows`, so a non-admin session whose email matches a `crew_members` row for an interim-batch (`published = FALSE`) show could otherwise SELECT pre-publish peer rows directly via `crewClient.from('crew_members').select(...).eq('show_id', $interimShow)` even though the parent `shows` row is RLS-hidden. The replicated `EXISTS (SELECT 1 FROM public.shows WHERE id = <table>.show_id AND published = TRUE)` predicate closes that gap row-by-row. Admins (the `is_admin()` branch) DO see unpublished interim-batch rows on `shows` (and on every peer table) so the dashboard can render the yellow "Publishing…" badge per §6.8.1 / spec §4.1 published-column comment. The `can_read_show` helper itself stays unchanged (`is_admin() OR membership`) — the `published = TRUE` gate lives in each table's policy USING clause, NOT inside the helper, so admin paths that need to bypass the publish gate (the dashboard SELECTing interim-batch rows) can do so via the `is_admin()` branch of each policy without restructuring the helper. All writes on crew-readable tables remain admin-only (the app uses the service role for mutating operations).
- [ ] **Step 2: Failing tests** in `tests/db/rls.test.ts` using a Supabase client with anon-only credentials and a synthesized JWT for a fictitious crew email. **EXHAUSTIVE coverage of every admin-only table from §4.3 is required:** an earlier draft only spot-checked `shows_internal`. A missing policy on any other admin-only table would let crew leak operational/auth data and the spot-check suite would still pass.

  **Complete admin-only table list per §4.3** — every table needs four denial tests (SELECT/INSERT/UPDATE/DELETE), each scoped to a known seeded row so empty-table noise can't make a missing policy look denied. The earlier draft used a generic `eq('id', uuid)` shape and `insert({} as any)` — both fail before RLS is exercised on tables that don't have an `id` column (`link_sessions`, `pending_syncs`, `report_rate_limits`, `crew_member_auth`, `revoked_links`) or that have NOT NULL columns. : **a missing policy on any such table would still produce a green test**. The replacement design seeds one valid row per admin-only table via the service role, then probes the same row from a non-admin client with table-specific valid payloads — and proves the operation is real by running a service-role control before the denial assertion.

  ```ts
  // tests/db/rls.test.ts
  type AdminTableSpec = {
    name: string;
    pk: Record<string, any>; // matchable primary or partial-unique key columns
    seed: => Promise<Record<string, any>>; // service-role insert returning the row
    validInsert: => Record<string, any>; // a payload that would succeed if RLS didn't block
    validUpdate: Record<string, any>; // a column-set update that would succeed if RLS didn't block
    // tables whose physical model rules out the generic INSERT/DELETE harness
    // (e.g., singleton CHECK constraints) opt into a custom strategy. Default is the standard
    // 4-test harness; 'singleton' delegates write-denial probing to the SECURITY DEFINER RPC
    // `__test_singleton_rls_probe` (defined later in this file) which executes the entire
    // disposable-INSERT / RLS-attempt / verify / restore cycle inside a single Postgres
    // transaction server-side. : earlier draft used `BEGIN; SAVEPOINT ...`
    // issued through `admin.rpc('exec_sql')` and assumed subsequent `admin.from(...)` /
    // `crewClient.from(...)` calls would participate in that transaction. PostgREST does NOT
    // pool requests into the same backend connection — every `from(...)` call opens its own
    // transaction, so the savepoint never wrapped the probes and a failed assertion would
    // leave the bootstrap row deleted. The SECURITY DEFINER RPC eliminates this entirely:
    // one round-trip, one server-side tx, atomic rollback regardless of probe outcome.
    testStrategy?: 'standard' | 'singleton';
  };

  const ADMIN_TABLES: AdminTableSpec[] = [
    /* one entry per admin-only table from §4.3 — examples below. The implementer fills in every
       table; AC-2.5 fails review if any table is missing an entry. */
    {
      name: 'shows_internal',
      seed: async => (await admin.from('shows_internal').insert({ show_id: knownShowId, financials: {}, parse_warnings: [], raw_unrecognized: [] }).select.single).data!,
      pk: { show_id: knownShowId },
      validInsert: => ({ show_id: anotherShowId, financials: {}, parse_warnings: [], raw_unrecognized: [] }),
      validUpdate: { parse_warnings: ['probe'] },
    },
    {
      // link_sessions.signing_key_id is NOT NULL (§4.5 / §7.2.3) — every seed/validInsert payload
      // MUST set it to the current `app_settings.active_signing_key_id` (or the literal default 'k1'
      // when seeding a fresh fixture before any rotation has occurred). Without it, the service-role
      // control INSERT fails with a NOT NULL violation BEFORE RLS is exercised, and the AC-2.5
      // denial test silently passes for the wrong reason (the row never existed to deny access to).
      name: 'link_sessions',
      seed: async => (await admin.from('link_sessions').insert({
        token: crypto.randomUUID,
        crew_member_id: knownCrewId,
        show_id: knownShowId,
        jwt_token_version: 1,
        signing_key_id: 'k1', // captured from app_settings.active_signing_key_id; literal 'k1' for fresh fixtures
        expires_at: new Date(Date.now + 12 * 3600_000).toISOString,
      }).select.single).data!,
      pk: { token: '<captured from seed>' }, // string PK, not 'id'
      validInsert: => ({ token: crypto.randomUUID, crew_member_id: knownCrewId, show_id: knownShowId, jwt_token_version: 1, signing_key_id: 'k1', expires_at: new Date(Date.now + 12 * 3600_000).toISOString }),
      validUpdate: { last_active_at: new Date.toISOString },
    },
    {
      name: 'crew_member_auth',
      seed: async => (await admin.from('crew_member_auth').insert({
        show_id: knownShowId, crew_name: 'Probe Crew',
        current_token_version: 1, max_issued_version: 1, revoked_below_version: 0,
      }).select.single).data!,
      pk: { show_id: knownShowId, crew_name: 'Probe Crew' }, // composite key, no 'id'
      validInsert: => ({ show_id: knownShowId, crew_name: 'Other Crew', current_token_version: 1, max_issued_version: 1, revoked_below_version: 0 }),
      validUpdate: { current_token_version: 2, max_issued_version: 2 },
    },
    /* ...repeat for sync_log, reports, pending_syncs, pending_ingestions, revoked_links,
       bootstrap_nonces, app_settings, deferred_ingestions,
       admin_alerts, sync_audit, drive_watch_channels, report_rate_limits — each with its own pk
       shape and required-column payload. */
    {
      // + : bootstrap_nonces is admin-only per spec §4.1 / §4.3.
      // ** composite PK**: primary key is `(nonce_hash, show_id)` — NOT `nonce_hash` alone.
      // The pk shape below is composite so the .match probe scopes to BOTH columns. Standard 4-test
      // harness applies. Seed payload uses a deterministic nonce_hash for the row probes; validInsert
      // mints a fresh hash so the INSERT-denial harness exercises a non-collision payload.
      name: 'bootstrap_nonces',
      seed: async => (await admin.from('bootstrap_nonces').insert({
        nonce_hash: 'probe-seeded-' + crypto.randomUUID,
        show_id: knownShowId,
      }).select.single).data!,
      pk: { nonce_hash: '<captured from seed>', show_id: knownShowId }, // composite PK shape
      validInsert: => ({ nonce_hash: 'probe-' + crypto.randomUUID, show_id: knownShowId }),
      validUpdate: { consumed_at: new Date.toISOString }, // simulates atomic single-use consumption
    },
    {
      // onboarding_scan_manifest is admin-only per spec §4.3 / §4.5.
      // Standard 4-test harness applies (composite unique key on (wizard_session_id, drive_file_id)).
      name: 'onboarding_scan_manifest',
      seed: async => (await admin.from('onboarding_scan_manifest').insert({
        folder_id: 'probe-folder', wizard_session_id: knownWizardSessionId,
        drive_file_id: 'probe-drive-file-id', mime_type: 'application/vnd.google-apps.spreadsheet',
        name: 'Probe Sheet', status: 'staged',
      }).select.single).data!,
      pk: { wizard_session_id: knownWizardSessionId, drive_file_id: 'probe-drive-file-id' },
      validInsert: => ({
        folder_id: 'probe-folder', wizard_session_id: knownWizardSessionId,
        drive_file_id: crypto.randomUUID, mime_type: 'application/vnd.google-apps.spreadsheet',
        name: 'Other Probe', status: 'staged',
      }),
      validUpdate: { status: 'applied' },
    },
    {
      // app_settings is a singleton (CHECK (id = 'default')) — generic
      // INSERT/DELETE harness is impossible because no second row can exist and the bootstrap
      // row is inserted at migration time. Use the singleton-specific harness below.
      name: 'app_settings',
      pk: { id: 'default' },
      seed: async => (await admin.from('app_settings').select('*').eq('id', 'default').single).data!,
      validInsert: => ({ /* never used — singleton strategy skips generic INSERT/DELETE harness */ }),
      validUpdate: { watched_folder_id: 'probe-folder-id' },
      testStrategy: 'singleton' as const, // skips generic harness; see singleton-specific block below
    },
  ];

  describe('AC-2.5: every admin-only table denies non-admin access (with service-role control)', => {
    // singleton-strategy tables are tested in a dedicated block below; the
    // generic 4-test harness assumes a second disposable row can be inserted, which is impossible
    // when a CHECK constraint (e.g., app_settings.check (id = 'default')) caps the table at one row.
    for (const t of ADMIN_TABLES.filter(s => (s.testStrategy ?? 'standard') === 'standard')) {
      let seeded: Record<string, any>;
      beforeAll(async => { seeded = await t.seed; });

      it(`${t.name}: non-admin SELECT cannot see seeded row`, async => {
        const { data, error } = await crewClient.from(t.name).select('*').match(t.pk);
        // Anonymous probes can be rejected (PGRST permission) OR return zero rows — both prove no leak.
        // The control below proves the row is actually present.
        expect(error || (data?.length ?? 0) === 0).toBeTruthy;
        const control = await admin.from(t.name).select('*').match(t.pk);
        expect(control.error).toBeNull;
        expect(control.data!.length).toBe(1); // proves the seed exists; denial test was meaningful
      });

      it(`${t.name}: non-admin INSERT denied (with service-role control)`, async => {
        const probePayload = t.validInsert;
        const { error: denyErr } = await crewClient.from(t.name).insert(probePayload);
        expect(denyErr).toBeTruthy; // RLS or column-grant denial expected
        // Control: same payload via service-role MUST succeed, otherwise the test was passing for the wrong reason.
        const { error: ctrlErr } = await admin.from(t.name).insert(probePayload);
        expect(ctrlErr).toBeNull; // proves the payload itself is valid; RLS was the gate
      });

      it(`${t.name}: non-admin UPDATE denied`, async => {
        const { error: denyErr, count } = await crewClient
          .from(t.name).update(t.validUpdate).match(t.pk).select('*', { count: 'exact' });
        expect(denyErr || count === 0).toBeTruthy; // permission error OR zero rows updated
        const { error: ctrlErr, count: ctrlCount } = await admin
          .from(t.name).update(t.validUpdate).match(t.pk).select('*', { count: 'exact' });
        expect(ctrlErr).toBeNull;
        expect(ctrlCount).toBe(1); // proves admin can update; denial was real
      });

      it(`${t.name}: non-admin DELETE denied (with disposable-row service-role control)`, async => {
        // DELETE-denial proof requires its own disposable row + service-role control,
        // mirroring INSERT/UPDATE. Without a control, count===0 could mean "RLS denied" OR "row didn't
        // match the predicate", and the test would silently pass even if DELETE access were open.
        // Insert a disposable row keyed identically to the seeded probe but with a fresh PK so the
        // existing seed survives:
        const disposable = await admin.from(t.name).insert({ ...t.validInsert, /* fresh PK */ }).select.single;
        const disposablePk = pickPk(disposable.data!, t.pk); // extracts the same key shape
        // 1. Non-admin DELETE attempt — must be denied OR affect zero rows.
        const { error: denyErr, count } = await crewClient
          .from(t.name).delete.match(disposablePk).select('*', { count: 'exact' });
        expect(denyErr || count === 0).toBeTruthy;
        // 2. Service-role control DELETE — proves the disposable row exists AND the predicate is correct.
        const { error: ctrlErr, count: ctrlCount } = await admin
          .from(t.name).delete.match(disposablePk).select('*', { count: 'exact' });
        expect(ctrlErr).toBeNull;
        expect(ctrlCount).toBe(1); // proves admin DELETE removes exactly one matching row
      });
    }
  });

  // /49 amendment: singleton-strategy block for tables capped at exactly one row by a
  // CHECK constraint (currently only `app_settings` per spec §4.5 `check (id = 'default')`). The
  // generic INSERT/DELETE harness above is impossible here — no second row can exist, and the
  // bootstrap row is inserted at migration time so the first INSERT also fails.
  //
  // . The earlier draft tried to
  // wrap a DELETE-attempt-restore cycle in `BEGIN; SAVEPOINT singleton_probe;` issued through
  // `admin.rpc('exec_sql')` and assumed subsequent `admin.from(t.name).delete(...)` and
  // `crewClient.from(t.name).insert(...)` calls would participate in that same transaction.
  // They don't: PostgREST opens a fresh transaction (and frequently a fresh backend connection)
  // for every HTTP request, so the BEGIN/SAVEPOINT issued via the first RPC commits/rolls back
  // independently of the probes that follow, and the rollback at the end restores nothing.
  // A failed assertion in the middle of the test would leave the singleton's bootstrap row
  // deleted for the rest of the suite.
  //
  // The corrected design moves the entire INSERT-denial / DELETE-denial / restore cycle into a
  // SECURITY DEFINER helper RPC `__test_singleton_rls_probe(table_name, expected_admin_can_delete,
  // expected_crew_cannot_delete)` that runs server-side in a single transaction. The helper is
  // installed only in test environments (gated by `app_settings.environment = 'test'` OR by a
  // dedicated migration in `tests/db/_test_helpers.sql` that is NOT registered for production
  // apply). It returns a structured `probe_result` jsonb describing each step's outcome.
  //
  // Helper contract (installed in tests/db/_test_helpers.sql for test runs only):
  //
  // create or replace function __test_singleton_rls_probe(
  // table_name text,
  // pk_column text,
  // pk_value text
  // ) returns jsonb
  // language plpgsql security definer set search_path = public, pg_temp as $$
  // declare
  // row_before jsonb;
  // crew_insert_err text := null;
  // crew_insert_count int := 0;
  // crew_delete_err text := null;
  // crew_delete_count int := 0;
  // admin_delete_count int := 0;
  // admin_insert_count int := 0;
  // row_after jsonb;
  // begin
  // execute format('select to_jsonb(t) from %I t where %I = $1', table_name, pk_column)
  // into row_before using pk_value;
  // if row_before is null then
  // raise exception 'singleton row missing before probe';
  // end if;
  //
  // -- Step 1: install non-admin JWT claim.
  // -- DO NOT use `SET LOCAL ROLE authenticated` inside SECURITY DEFINER. PostgREST
  // -- applies non-admin RLS by setting `request.jwt.claims` only; we mirror that here.
  // -- Earlier draft also tried to re-INSERT a row with the same `id='default'` PK,
  // -- which fails on the singleton PK regardless of RLS — non-discriminating.
  // -- Corrected design DELETEs the bootstrap row first (as service-role, before
  // -- installing the claim), so the crew INSERT attempt hits RLS, NOT the PK.
  // execute format('delete from %I where %I = $1', table_name, pk_column) using pk_value;
  // -- crew claim shape per §7.2 (no admin claim).
  // perform set_config('request.jwt.claims',
  // jsonb_build_object('role', 'authenticated', 'sub', '00000000-0000-0000-0000-000000000000')::text,
  // true);
  // -- Probe INSERT: row was just deleted, table is empty. RLS evaluates the crew
  // -- claim against the policy. If RLS denies, INSERT raises SQLSTATE 42501 (or
  // -- returns 0 affected rows depending on RLS shape); if RLS allows, INSERT succeeds.
  // begin
  // execute format('insert into %I (%I) values ($1)', table_name, pk_column) using pk_value;
  // get diagnostics crew_insert_count = row_count;
  // exception when others then
  // crew_insert_err := SQLSTATE || ': ' || SQLERRM;
  // end;
  //
  // -- For the DELETE probe to be discriminating, the row must EXIST at probe time.
  // -- Clear the JWT claim, restore the bootstrap row as service-role, then reinstall
  // -- the crew claim before probing DELETE.
  // perform set_config('request.jwt.claims', null, true);
  // execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)',
  // table_name, table_name) using row_before;
  // perform set_config('request.jwt.claims',
  // jsonb_build_object('role', 'authenticated', 'sub', '00000000-0000-0000-0000-000000000000')::text,
  // true);
  // begin
  // execute format('delete from %I where %I = $1', table_name, pk_column) using pk_value;
  // get diagnostics crew_delete_count = row_count;
  // exception when others then
  // crew_delete_err := SQLSTATE || ': ' || SQLERRM;
  // end;
  //
  // -- Step 2: clear the JWT claim and run the positive control as service-role.
  // -- (NO `reset role` — we never set the role; we toggled jwt.claims only.)
  // perform set_config('request.jwt.claims', null, true);
  // execute format('delete from %I where %I = $1', table_name, pk_column) using pk_value;
  // get diagnostics admin_delete_count = row_count;
  //
  // -- Step 3: restore the bootstrap row from the snapshot (insert from row_before).
  // execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)',
  // table_name, table_name) using row_before;
  // get diagnostics admin_insert_count = row_count;
  //
  // execute format('select to_jsonb(t) from %I t where %I = $1', table_name, pk_column)
  // into row_after using pk_value;
  //
  // return jsonb_build_object(
  // 'crew_insert_err', crew_insert_err,
  // 'crew_insert_count', crew_insert_count,
  // 'crew_delete_err', crew_delete_err,
  // 'crew_delete_count', crew_delete_count,
  // 'admin_delete_count', admin_delete_count,
  // 'admin_insert_count', admin_insert_count,
  // 'row_before_eq_after', (row_before = row_after),
  // 'row_after_present', row_after is not null
  // );
  // end;
  // $$;
  //
  // The whole function body runs in one auto-committed plpgsql block; if any statement raises
  // and the helper does not catch it, the implicit transaction rolls back atomically and the
  // bootstrap row survives. The test code calls the RPC ONCE per singleton table and asserts
  // the structured result.
  describe('AC-2.5 singleton variant: tables with one-row CHECK constraints', => {
    for (const t of ADMIN_TABLES.filter(s => s.testStrategy === 'singleton')) {
      it(`${t.name}: non-admin SELECT denied (single-row probe with service-role control)`, async => {
        const { data, error } = await crewClient.from(t.name).select('*').match(t.pk);
        expect(error || (data?.length ?? 0) === 0).toBeTruthy;
        const ctrl = await admin.from(t.name).select('*').match(t.pk);
        expect(ctrl.error).toBeNull;
        expect(ctrl.data!.length).toBe(1); // proves the singleton exists
      });
      it(`${t.name}: non-admin UPDATE denied (with service-role control on the same row)`, async => {
        const { error: denyErr, count } = await crewClient
          .from(t.name).update(t.validUpdate).match(t.pk).select('*', { count: 'exact' });
        expect(denyErr || count === 0).toBeTruthy;
        const { error: ctrlErr, count: ctrlCount } = await admin
          .from(t.name).update(t.validUpdate).match(t.pk).select('*', { count: 'exact' });
        expect(ctrlErr).toBeNull;
        expect(ctrlCount).toBe(1);
      });
      it(`${t.name}: non-admin INSERT + DELETE denied (atomic SECURITY DEFINER probe — bootstrap row restored regardless of probe outcome)`, async => {
        // Single round-trip; the helper runs INSERT-attempt + DELETE-attempt + admin control +
        // restore in one server-side transaction. PostgREST request boundaries are no longer in
        // play — the entire cycle is one psql call that either commits the restore or aborts
        // and rolls back. No SAVEPOINT spanning multiple `from(...)` calls.
        const pkColumn = Object.keys(t.pk)[0];
        const pkValue = String(t.pk[pkColumn]);
        const { data, error } = await admin.rpc('__test_singleton_rls_probe', {
          table_name: t.name,
          pk_column: pkColumn,
          pk_value: pkValue,
        });
        expect(error).toBeNull;
        const r = data as {
          crew_insert_err: string | null; crew_insert_count: number;
          crew_delete_err: string | null; crew_delete_count: number;
          admin_delete_count: number; admin_insert_count: number;
          row_before_eq_after: boolean; row_after_present: boolean;
        };
        // Crew-side INSERT denied (either RLS error OR zero rows affected).
        expect(r.crew_insert_err !== null || r.crew_insert_count === 0).toBe(true);
        // Crew-side DELETE denied (either RLS error OR zero rows affected).
        expect(r.crew_delete_err !== null || r.crew_delete_count === 0).toBe(true);
        // Service-role control DELETE proves the row WAS present and admin can delete it.
        expect(r.admin_delete_count).toBe(1);
        // Restore succeeded and the row is byte-for-byte identical to the pre-probe snapshot.
        expect(r.admin_insert_count).toBe(1);
        expect(r.row_after_present).toBe(true);
        expect(r.row_before_eq_after).toBe(true);
      });
    }
  });

  // AC-2.6 (crew-readable tables) — admin-positive read AND crew write-denial across the full CRUD verb set.
  // **Write-denial coverage on crew-readable tables is mandatory.** Earlier draft only
  // tested SELECT semantics for shows / crew_members / hotel_reservations / rooms / transportation / contacts.
  // A migration that accidentally allows authenticated crew to INSERT, UPDATE, or DELETE on those tables would
  // pass the SELECT-only suite while letting signed-in crew bypass the app flow and mutate operational data
  // through Supabase directly. The corrected design runs the same four-operation harness with controls on
  // crew-readable tables under BOTH matching-crew and non-matching-crew identities.
  const CREW_READABLE_TABLES: AdminTableSpec[] = [
    {
      name: 'shows',
      pk: { id: '<seeded show id>' },
      seed: async => /* service-role insert */,
      validInsert: => ({ /* minimal valid show row */ }),
      validUpdate: { title: 'probe' },
    },
    { name: 'crew_members', /* id PK */ pk: { id: '<seeded id>' }, seed: ..., validInsert: ..., validUpdate: { phone: '555-0001' } },
    { name: 'hotel_reservations', pk: { id: '...' }, seed: ..., validInsert: ..., validUpdate: { confirmation: 'X' } },
    { name: 'rooms', pk: { id: '...' }, seed: ..., validInsert: ..., validUpdate: { notes: 'probe' } },
    { name: 'transportation', pk: { show_id: '<seeded show>' }, seed: ..., validInsert: ..., validUpdate: { driver_name: 'X' } },
    { name: 'contacts', pk: { id: '...' }, seed: ..., validInsert: ..., validUpdate: { name: 'probe' } },
  ];
  describe('AC-2.6: crew-readable tables — write-denial under matching AND non-matching crew', => {
    for (const t of CREW_READABLE_TABLES) {
      let seeded: Record<string, any>;
      beforeAll(async => { seeded = await t.seed; });

      // SELECT positives + negatives (existing coverage):
      it(`${t.name}: matching crew CAN SELECT for their show`, async => { /* .. */ });
      it(`${t.name}: non-matching crew CANNOT SELECT for a different show`, async => { /* .. */ });
      it(`${t.name}: admin CAN SELECT (is_admin branch)`, async => { /* .. */ });

      // **Published-gate regression — applies to EVERY crew-readable table.** The non-admin
      // branch of every crew-readable table's SELECT policy carries
      // `AND EXISTS (SELECT 1 FROM public.shows WHERE id = <table>.show_id AND published = TRUE)`
      // (or, on `shows` itself, the simplified `AND shows.published = TRUE`). Without the gate
      // replicated on EVERY peer table, a non-admin client could direct-query `crew_members` /
      // `hotel_reservations` / `rooms` / `transportation` / `contacts` for an interim-batch
      // (`published = FALSE`) show — bypassing the parent `shows` policy because PostgREST never
      // joins to `shows` for a same-table SELECT. The regression seeds an interim-batch show, a
      // matching-crew row, AND one peer row per crew-readable peer table; then asserts the
      // matching-crew client gets ZERO rows on every direct query.
      const CREW_READABLE_PEER_TABLES = [
        // Each entry: { name, seedPeer: (show_id, crew_member_id) => Promise<row> }. The peer row
        // is whatever satisfies that table's NOT NULL constraints AND is keyed back to show_id so
        // RLS has a row to evaluate. The seedPeer for `crew_members` returns the matching-crew row
        // itself (already inserted above); for the others, a minimal show-keyed row.
        'crew_members', 'hotel_reservations', 'rooms', 'transportation', 'contacts',
      ] as const;
      if (t.name === 'shows' || (CREW_READABLE_PEER_TABLES as readonly string[]).includes(t.name)) {
        it(`${t.name}: matching crew identity returns zero rows when parent shows.published = FALSE (interim wizard-finalize batch)`, async => {
          const interimShow = await admin
            .from('shows')
            .insert({ /* minimal valid row */ published: false })
            .select
            .single;
          // Seed the matching-crew row so the membership predicate of `can_read_show` is satisfied
          // — this PROVES the published-gate is what denies the read, not a missing membership.
          const matchingCrew = await admin.from('crew_members').insert({
            show_id: interimShow.data!.id,
            email: matchingCrewEmail, // same email the matchingCrewClient is signed in as
            name: 'Interim Probe',
          }).select.single;
          // Seed a peer row for the table under test (skip if t.name === 'shows' or 'crew_members'
          // — those rows already exist from the seeding above).
          if (t.name !== 'shows' && t.name !== 'crew_members') {
            await admin.from(t.name).insert({
              ...t.validInsert,
              show_id: interimShow.data!.id,
            });
          }
          // Direct-query the table under test as the matching-crew client; expect zero rows.
          const probe = t.name === 'shows'
            ? matchingCrewClient.from('shows').select('id, published').eq('id', interimShow.data!.id)
            : matchingCrewClient.from(t.name).select('show_id').eq('show_id', interimShow.data!.id);
          const { data, error } = await probe;
          expect(error).toBeNull; // RLS denial returns empty result, not an error
          expect(data).toEqual([]); // zero rows — published-gate EXISTS predicate fired
          // Service-role control: admin SEES the row regardless (the is_admin() branch bypasses
          // the published gate on every crew-readable table — proves the denial was the gate, not
          // a missing row).
          const adminProbe = t.name === 'shows'
            ? admin.from('shows').select('id, published').eq('id', interimShow.data!.id)
            : admin.from(t.name).select('show_id').eq('show_id', interimShow.data!.id);
          const { data: adminData } = await adminProbe;
          expect(adminData!.length).toBeGreaterThanOrEqual(1);
          // Cleanup: ON DELETE CASCADE from shows propagates to peer rows.
          await admin.from('shows').delete.eq('id', interimShow.data!.id);
        });
      }

      // **Write denial — applies to BOTH matching-crew and non-matching-crew identities**: for (const identity of ['matching-crew', 'non-matching-crew'] as const) {
        const client = identity === 'matching-crew' ? matchingCrewClient : nonMatchingCrewClient;

        it(`${t.name}: ${identity} INSERT denied (with service-role control)`, async => {
          const payload = t.validInsert;
          const { error: denyErr } = await client.from(t.name).insert(payload);
          expect(denyErr).toBeTruthy;
          const { error: ctrlErr } = await admin.from(t.name).insert(payload);
          expect(ctrlErr).toBeNull; // proves payload would otherwise succeed
        });
        it(`${t.name}: ${identity} UPDATE denied`, async => {
          const { error: denyErr, count } = await client
            .from(t.name).update(t.validUpdate).match(t.pk).select('*', { count: 'exact' });
          expect(denyErr || count === 0).toBeTruthy;
          const { error: ctrlErr, count: ctrlCount } = await admin
            .from(t.name).update(t.validUpdate).match(t.pk).select('*', { count: 'exact' });
          expect(ctrlErr).toBeNull;
          expect(ctrlCount).toBe(1); // proves admin can still update; denial was real
        });
        it(`${t.name}: ${identity} DELETE denied`, async => {
          // Insert a disposable row with a fresh PK so the existing seed survives the test:
          const disposable = await admin.from(t.name).insert({ ...t.validInsert, /* fresh PK */ }).select.single;
          const disposablePk = pickPk(disposable.data!, t.pk);
          // 1. Non-admin DELETE attempt — must be denied OR affect zero rows.
          const { error: denyErr, count } = await client
            .from(t.name).delete.match(disposablePk).select('*', { count: 'exact' });
          expect(denyErr || count === 0).toBeTruthy;
          // 2. Service-role control DELETE — proves the disposable row exists AND the predicate is correct.
          const { error: ctrlErr, count: ctrlCount } = await admin
            .from(t.name).delete.match(disposablePk).select('*', { count: 'exact' });
          expect(ctrlErr).toBeNull;
          expect(ctrlCount).toBe(1); // proves admin DELETE removes exactly one matching row; non-admin denial was real
        });
      }
    }
  });
  ```

  The four-test pattern (with controls) per admin-only table catches missing policies, over-permissive policies, and accidental column-grant gaps. The crew-readable block adds explicit admin-read positives AND write-denial across the full CRUD verb set under both matching-crew and non-matching-crew identities — without this, a `FOR ALL` policy slipping into a public table would still pass the SELECT-only suite.

- [ ] **Step 3: Apply migration; run RLS tests; iterate until pass.**
- [ ] **Step 4: Commit** `feat(db): RLS policies (§4.3)`.

### Task 2.4: Seed script (AC-2.7)

**Files:** Create: `supabase/seed.ts`. Modify: `package.json` (add `db:seed` script).

- [ ] **Step 1: Failing test** `tests/db/seed.test.ts` asserts AC-2.7 against the **persisted shape from §4.1 + + s** — the test must validate every field the production pipeline writes, including `drive_file_id`, `last_seen_modified_time`, and the full reel pin **quadruple**, AND the structured `diagrams` JSONB shape (`{ snapshot_revision_id, snapshot_status, embeddedImages[], linkedFolderItems[] }`):

  ```ts
  it("AC-2.7 seed loads 10 fixtures via production pipeline with full persisted-shape integrity", (async) => {
    const supa = createServiceClient;
    const { data: shows } = await supa
      .from("shows")
      .select(
        "id, slug, drive_file_id, last_seen_modified_time, " +
          "opening_reel_drive_file_id, opening_reel_drive_modified_time, opening_reel_head_revision_id, opening_reel_mime_type, " +
          "diagrams",
      );
    expect(shows!.length).toBe(10);
    for (const s of shows!) {
      // Production pipeline persists the Drive metadata even at seed time:
      expect(s.drive_file_id).toEqual(expect.any(String)); // mock Drive provides a deterministic id per fixture
      expect(s.last_seen_modified_time).toEqual(expect.any(String)); // ISO timestamp from mock Drive metadata

      // Reel pin quadruple — present iff fixture has a reel:
      if (FIXTURES_WITH_REEL.has(s.slug)) {
        expect(s.opening_reel_drive_file_id).not.toBeNull;
        expect(s.opening_reel_drive_modified_time).not.toBeNull;
        expect(s.opening_reel_head_revision_id).not.toBeNull; // column is mandatory when reel present
        expect(s.opening_reel_mime_type).not.toBeNull; // column; mandatory for video reels
        expect(s.opening_reel_mime_type as string).toMatch(/^video\//);
      }

      // Diagrams JSONB structured shape per PersistedDiagrams type — full contract.
      const diagrams = s.diagrams as any;
      if (FIXTURES_WITH_DIAGRAMS.has(s.slug)) {
        expect(diagrams).not.toBeNull;
        expect(diagrams.snapshot_revision_id).toEqual(expect.any(String));
        // snapshot_status union includes the terminal restage-required state.
        expect(["complete", "partial_failure", "partial_failure_restage_required"]).toContain(
          diagrams.snapshot_status,
        );
        // linkedFolder is a top-level field on the persisted shape per spec §4.1.
        // Either null (no linked folder URL in the parsed sheet) OR { driveFolderId, driveFolderUrl }.
        expect(
          diagrams.linkedFolder === null ||
            (typeof diagrams.linkedFolder?.driveFolderId === "string" &&
              typeof diagrams.linkedFolder?.driveFolderUrl === "string"),
        ).toBe(true);
        expect(Array.isArray(diagrams.embeddedImages)).toBe(true);
        expect(Array.isArray(diagrams.linkedFolderItems)).toBe(true);
        // full PersistedDiagrams field coverage per spec §4.1.
        // Earlier draft asserted only a subset (objectId/sheetTab/sheetsRevisionId/
        // embeddedFingerprint/recovery_disposition for embedded; driveFileId/headRevisionId/
        // md5Checksum/drive_modified_time for linked) and missed mimeType, snapshotPath,
        // sourceFolder on BOTH lists, plus recovery_disposition + cross-invariants on linked
        // entries. Every field the production pipeline persists is now asserted, AND every
        // cross-field invariant the spec calls out.
        for (const e of diagrams.embeddedImages) {
          expect(e.objectId).toEqual(expect.any(String));
          expect(e.sheetTab).toEqual(expect.any(String));
          // mimeType: REQUIRED string per §4.1 (every embedded image carries the Drive-reported
          // MIME type so /api/asset/diagram serves the right Content-Type).
          expect(e.mimeType).toEqual(expect.any(String));
          expect(e.mimeType.length).toBeGreaterThan(0);
          // alt: optional — present iff the sheet supplied alt text.
          if ("alt" in e && e.alt !== undefined && e.alt !== null) {
            expect(e.alt).toEqual(expect.any(String));
          }
          // snapshotPath: nullable string per §4.1. Restage-required entries stay null
          // permanently until a fresh sheet edit re-mints the fingerprint.
          expect(e.snapshotPath === null || typeof e.snapshotPath === "string").toBe(true);
          // sourceFolder: REQUIRED literal 'embedded' — discriminator for asset_recovery / GC.
          expect(e.sourceFolder).toBe("embedded");
          // sheetsRevisionId: mandatory immutable Drive revision token.
          expect(e.sheetsRevisionId).toEqual(expect.any(String));
          expect(e.sheetsRevisionId.length).toBeGreaterThan(0);
          // embeddedFingerprint: null (restage-required) OR non-empty string.
          expect(
            e.embeddedFingerprint === null ||
              (typeof e.embeddedFingerprint === "string" && e.embeddedFingerprint.length > 0),
          ).toBe(true);
          // recovery_disposition: union enum constraint per §4.1.
          expect(["normal", "restage_required"]).toContain(e.recovery_disposition);
          // Cross-invariant 1: null fingerprint MUST coincide with restage_required.
          if (e.embeddedFingerprint === null) {
            expect(e.recovery_disposition).toBe("restage_required");
          }
          // Cross-invariant 2: if recovery_disposition is 'normal', BOTH
          // sheetsRevisionId AND embeddedFingerprint must be non-null (the byte fence pair).
          if (e.recovery_disposition === "normal") {
            expect(e.sheetsRevisionId).toEqual(expect.any(String));
            expect(e.embeddedFingerprint).toEqual(expect.any(String));
          }
          // Cross-invariant 3: restage_required entries have snapshotPath = null
          // (asset_recovery skips them, so the Storage slot is permanently empty).
          if (e.recovery_disposition === "restage_required") {
            expect(e.snapshotPath).toBeNull;
          }
        }
        // Linked-folder entries — PersistedLinkedFolderItem per §4.1 (the persisted
        // counterpart of LinkedFolderItemStub; widens snapshotPath to string|null).
        for (const l of diagrams.linkedFolderItems) {
          expect(l.driveFileId).toEqual(expect.any(String));
          expect(l.driveFileId.length).toBeGreaterThan(0);
          // mimeType: REQUIRED string per §4.1.
          expect(l.mimeType).toEqual(expect.any(String));
          expect(l.mimeType.length).toBeGreaterThan(0);
          // alt: optional — present iff the sheet supplied alt text.
          if ("alt" in l && l.alt !== undefined && l.alt !== null) {
            expect(l.alt).toEqual(expect.any(String));
          }
          // drive_modified_time: ISO timestamp (informational; revision/checksum is the byte fence).
          expect(l.drive_modified_time).toEqual(expect.any(String));
          // Byte-fence pair: headRevisionId + md5Checksum. Both REQUIRED per §4.1.
          expect(l.headRevisionId).toEqual(expect.any(String));
          expect(l.headRevisionId.length).toBeGreaterThan(0);
          expect(l.md5Checksum).toEqual(expect.any(String));
          expect(l.md5Checksum.length).toBeGreaterThan(0);
          // snapshotPath: nullable string per §4.1.
          expect(l.snapshotPath === null || typeof l.snapshotPath === "string").toBe(true);
          // sourceFolder: REQUIRED literal 'linked' — discriminator for asset_recovery / GC.
          expect(l.sourceFolder).toBe("linked");
          // recovery_disposition: union enum constraint per §4.1 — applies to BOTH
          // embedded AND linked entries (earlier draft only asserted on embedded).
          expect(["normal", "restage_required"]).toContain(l.recovery_disposition);
          // Cross-invariant: restage_required entries have snapshotPath = null.
          if (l.recovery_disposition === "restage_required") {
            expect(l.snapshotPath).toBeNull;
          }
        }
      }
      // at least one seeded fixture exercises the partial_failure_restage_required
      // terminal state so the seed corpus covers all three snapshot_status values production can
      // produce. Synthesize via a fixture variant whose enrichment mock returns a Sheets API response
      // with no content-derived fingerprint for at least one embedded image.
      if (s.slug === FIXTURE_WITH_RESTAGE_REQUIRED) {
        expect(diagrams.snapshot_status).toBe("partial_failure_restage_required");
        const restageRequired = diagrams.embeddedImages.find(
          (e: any) => e.recovery_disposition === "restage_required",
        );
        expect(restageRequired).toBeDefined;
        expect(restageRequired.embeddedFingerprint).toBeNull;
      }

      const { count: crew } = await supa
        .from("crew_members")
        .select("id", { count: "exact", head: true })
        .eq("show_id", s.id);
      expect(crew).toBeGreaterThan(0);
    }
  });
  ```

- [ ] **Step 2: Implement** seed using **the exact production pipeline from the type split — including the first-seen Apply gate**. On a fresh database every fixture is first-seen, and §5.2/§9.0 require first-seen sheets to STAGE with a `FIRST_SEEN_REVIEW` review item before any `shows` row exists. A seed that calls `applyParseResult` directly bypasses that gate and produces show rows that production could never produce. The corrected design: seed runs the same `parseSheet → enrichWithDrivePins → runInvariants → phase1` chain as production, then dispatches a **synthetic Apply** that supplies pre-approved reviewer choices for the `FIRST_SEEN_REVIEW` item AND any other invariants the fixture trips:

  ```ts
  // supabase/seed.ts — same path production uses, plus a synthetic-reviewer wrapper.
  // the pre-Phase1 invariant gate is REMOVED. Earlier draft called
  // `runInvariants(null, enriched)` and threw on `!ok`, but `runInvariants` returns
  // `outcome: 'pass' | 'stage' | 'hard_fail'` (Task 1.12) — and per spec §5.2 first-seen
  // fixtures ALWAYS route to STAGE regardless of MI outcome. Treating `stage` as a failure
  // would reject every clean fixture in the corpus. The seed instead defers all routing to
  // `runPhase1Standalone`, which is the canonical production entry point that knows how to
  // route pass/stage/hard_fail correctly. Only `hard_fail` is a real seed failure.
  for (const fixturePath of fixtureFiles) {
    const raw = await fs.readFile(fixturePath, "utf8");
    const parsed = parseSheet(raw); // ParsedSheet
    const fixtureMockMeta = mockDriveMetaFor(fixturePath);
    const enriched = await enrichWithDrivePins(parsed, mockDriveClient, {
      driveFileId: fixtureMockMeta.driveFileId,
      fileMeta: fixtureMockMeta,
    }); // ParseResult

    // Stage via the production Phase 1 path — first-seen lands in pending_syncs with FIRST_SEEN_REVIEW.
    // runPhase1Standalone runs the invariants internally and returns the routed outcome.
    const phase1Result = await runPhase1Standalone(supabaseAdmin, {
      mode: "manual",
      driveFileId: fixtureMockMeta.driveFileId,
      parseResult: enriched,
      fileMeta: fixtureMockMeta,
    });
    if (phase1Result.outcome === "hard_fail") {
      throw new Error(`seed fixture ${fixturePath} hard-failed: ${phase1Result.code}`);
    }
    // `stage` is the EXPECTED outcome for first-seen fixtures (the FIRST_SEEN_REVIEW gate per §5.2 / §9.0
    // forces stage routing even on otherwise-clean parses). Continue to the synthetic Apply.
    // `pass` is unreachable for first-seen — included for completeness; treat as stage-equivalent.

    // Synthetic Apply with seed-mode reviewer choices: one `apply` choice per triggered_review_item.
    // This goes through the SAME applyStaged endpoint production uses (Task 6.11) — no parallel writer.
    await applyStagedSeedMode(supabaseAdmin, {
      driveFileId: fixtureMockMeta.driveFileId,
      reviewerChoices: {
        /* one pre-approved 'apply' choice per triggered_review_item from the staged row */
      },
      seedMode: true, // bypasses interactive admin auth; otherwise identical to runtime Apply
    });
  }
  ```

  `applyStagedSeedMode` is a thin wrapper around `applyStaged` (Task 6.11) that synthesizes the `seed-mode` admin identity AND auto-derives reviewer choices from the staged row's `triggered_review_items` (each gets `action: 'apply'`). Its output is byte-identical to a real admin Apply: same `shows` row insert with full persisted shape, same `sync_audit` row, same auth side-effects. **This is the seed's commitment to "exact production pipeline" — passing through Apply means seeded shows match the shape of any production-applied show.**
  **The seed has ONE canonical implementation path — through `applyStaged`.** Earlier draft showed both an `applyStaged` path (with synthetic reviewer choices) AND a direct `applyParseResult` shortcut as alternative implementations; the duplicate code block has been removed in this batch so the implementer reading Task 2.4 sees ONLY the canonical seed path defined above. The shortcut bypassed the staged row, reviewer-choice validation, the `sync_audit` write, and the auth side-effects — producing seeded shows that production could never produce. Seed exclusively goes through `runPhase1Standalone` → `applyStagedSeedMode` (which is `applyStaged` with synthesized admin identity + auto-derived `apply` reviewer choices for every `triggered_review_items` entry). Step 1's failing test additionally asserts production-path artifacts: one `sync_audit` row per fixture, no lingering `pending_*` rows, expected auth side-effects (e.g., `crew_member_auth` rows with the universal "bump on add" floor for every newly-added crew name).

  Task 6.5 (M6) formalizes the `applyParseResult` low-level helper that `applyStaged` invokes internally. **`applyParseResult` is NEVER called directly by the seed.** The seed always goes through `applyStaged` so the path is byte-identical to production Apply.

- [ ] **Step 3: Run** `pnpm db:seed`. Expect 10 shows inserted, no errors.
- [ ] **Step 4: Commit** `feat(db): seed script for fixture corpus (AC-2.7)`.

### Task 2.5: CHECK constraint + FK/cascade introspection test coverage

**Files:** Test: `tests/db/checks.test.ts`, `tests/db/schema-introspection.test.ts`.

- [ ] **Step 1: Failing tests** — try inserts that should be rejected:
  ```ts
  it("crew_members_email_canonical rejects mixed-case (AC-2.3)", (async) => {
    /* assert INSERT with email='Alice@FXAV.NET' raises check_violation */
  });
  it("crew_members_show_email_unique rejects dup (AC-2.2)", (async) => {
    /* .. */
  });
  it("revoked_links rejects token_version=0 (AC-2.4)", (async) => {
    /* .. */
  });
  ```
- [ ] **Step 2: Run; iterate until pass.**
- [ ] **Step 3: Schema introspection matrix — exact-definition matching.** Name-based presence checks ("constraint with name X exists") are too shallow: a wrong CHECK expression, wrong indexed columns, or weakened partial predicate would still pass while the schema silently drifted from spec. The corrected design asserts the FULL definition via `pg_get_constraintdef` and `pg_get_indexdef` against expected normalized strings. Plan also catches the index-name drift (the earlier draft had `pending_syncs_wizard_session_id_idx`; spec uses `pending_syncs_wizard_session_idx` — implementation must align AND the introspection test uses the canonical name from spec, not the draft name).

  Add `tests/db/schema-introspection.test.ts`:

  ```ts
  // Generator-driven expected definitions.
  // Earlier draft hand-wrote regexes with `.*` wildcards that allowed real drift to pass — extra
  // enum values could sneak into `pending_syncs_source_kind_check`, extra predicate terms into
  // partial indexes. The corrected design generates expected definitions from spec's SQL at build
  // time (scripts/extract-spec-sql.ts) AND uses byte-for-byte string equality after whitespace
  // normalization, NOT regex matching. The expected string is the exact `pg_get_constraintdef` /
  // `pg_get_indexdef` output the spec's SQL would produce when applied to a fresh database.

  function normalizeWhitespace(s: string): string {
    return s.replace(/\s+/g, " ").trim;
  }
  function assertExactDefMatch(actual: string, expected: string, context: string) {
    const a = normalizeWhitespace(actual);
    const e = normalizeWhitespace(expected);
    if (a !== e) throw new Error(`${context}: definition mismatch\n expected: ${e}\n actual: ${a}`);
  }
  const REQUIRED_CHECKS = [
    {
      table: "crew_members",
      constraint: "crew_members_email_canonical",
      // Spec §4.1.1: email column is nullable, so the CHECK admits NULL OR canonical-form match.
      // Exact pg_get_constraintdef output (whitespace-normalized).
      expectDef: `CHECK (((email IS NULL) OR (email = lower(btrim(email)))))`,
    },
    {
      table: "pending_syncs",
      constraint: "pending_syncs_source_kind_check",
      // Exact enum list — extra values would silently slip past a `.*` regex.
      expectDef: `CHECK ((source_kind = ANY (ARRAY['cron'::text, 'push'::text, 'manual'::text, 'onboarding_scan'::text])))`,
    },
    {
      table: "revoked_links",
      constraint: "revoked_links_token_version_positive",
      expectDef: `CHECK ((token_version > 0))`,
    },
    {
      table: "drive_watch_channels",
      constraint: "drive_watch_channels_active_requires_drive_state",
      // Spec §5.5.1: column is `resource_id` (not `drive_resource_id`); CHECK admits non-active status
      // OR an active row with both resource_id AND expires_at non-null.
      expectDef: `CHECK (((status <> 'active'::text) OR ((resource_id IS NOT NULL) AND (expires_at IS NOT NULL))))`,
    },
    {
      // onboarding_scan_manifest.status enum CHECK (spec §4.5).
      table: "onboarding_scan_manifest",
      constraint: "onboarding_scan_manifest_status_check",
      // 'live_row_conflict' joins the enum so the LIVE_ROW_CONFLICT manifest write
      // (Task 6.8 / Task 10.3 per-file warn-and-continue path) is accepted by the CHECK.
      expectDef: `CHECK ((status = ANY (ARRAY['staged'::text, 'hard_failed'::text, 'skipped_non_sheet'::text, 'applied'::text, 'defer_until_modified'::text, 'permanent_ignore'::text, 'discard_retryable'::text, 'live_row_conflict'::text])))`,
    },
    /* …repeat for every CHECK named in §4 with its exact expected string generated from spec source. */
  ] as const;
  for (const c of REQUIRED_CHECKS) {
    it(`AC-2.1 CHECK definition matches: ${c.table}.${c.constraint}`, (async) => {
      const { rows } = await admin.rpc("introspect_check", {
        p_table: c.table,
        p_name: c.constraint,
      });
      expect(rows.length).toBe(1);
      assertExactDefMatch(rows[0].def, c.expectDef, `${c.table}.${c.constraint}`); // string equality (whitespace-normalized)
    });
  }

  const REQUIRED_FKS = [
    {
      table: "shows_internal",
      column: "show_id",
      refTable: "shows",
      refColumn: "id",
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    },
    // finding: link_sessions.crew_member_id FK MUST be ON DELETE SET NULL,
    // NOT CASCADE. Cascade silently destroys the session row when crew is deleted by
    // sync, making §7.2.2 step 5 (LINK_NO_CREW_MATCH) unreachable — the row the
    // validator's step 5 expects to observe is gone before the validator runs. SET NULL
    // preserves the session so the validator can detect the deletion (crew_member_id IS
    // NULL) and render the documented 410 + "you've been removed" copy. The exact-match
    // introspection assertion below proves a future migration can't silently revert this
    // to CASCADE without failing AC-2.1.
    {
      table: "link_sessions",
      column: "crew_member_id",
      refTable: "crew_members",
      refColumn: "id",
      onDelete: "SET NULL",
      onUpdate: "NO ACTION",
    },
    {
      table: "link_sessions",
      column: "show_id",
      refTable: "shows",
      refColumn: "id",
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    },
    // finding: bootstrap_nonces is the CSRF-defense table minted by
    // /show/<slug>/p and consumed by /api/auth/redeem-link. show_id FK uses CASCADE
    // because deleting the show invalidates any in-flight bootstrap (the nonce only
    // makes sense for that show's redeem-link flow); 30-second TTL means the cleanup
    // is benign even without cascade, but cascade keeps the table tidy and matches
    // the pattern used by other auth-related FKs.
    {
      table: "bootstrap_nonces",
      column: "show_id",
      refTable: "shows",
      refColumn: "id",
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    },
    // pending_snapshot_uploads.show_id FK is the
    // commit-aware snapshot ledger's tether to its show. CASCADE matches the pattern: deleting the
    // show invalidates the in-flight Apply ledger rows; the GC sweep would have orphaned them
    // otherwise. The unique constraint on temp_prefix is asserted via the partial-index matrix below.
    {
      table: "pending_snapshot_uploads",
      column: "show_id",
      refTable: "shows",
      refColumn: "id",
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    },
    {
      table: "admin_alerts",
      column: "show_id",
      refTable: "shows",
      refColumn: "id",
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    },
    /* …every FK named in §4.1, including the /40 reports additions. */
  ] as const;
  for (const fk of REQUIRED_FKS) {
    it(`AC-2.1 FK exact-match: ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn}`, (async) => {
      const { rows } = await admin.rpc("introspect_fk", { p_table: fk.table, p_column: fk.column });
      expect(rows[0].ref_table).toBe(fk.refTable);
      expect(rows[0].ref_column).toBe(fk.refColumn);
      expect(rows[0].on_delete).toBe(fk.onDelete);
      expect(rows[0].on_update).toBe(fk.onUpdate);
    });
  }

  const REQUIRED_PARTIAL_INDEXES = [
    {
      name: "crew_members_show_email_unique",
      // Exact pg_get_indexdef output — string equality, not regex.
      expectDef: `CREATE UNIQUE INDEX crew_members_show_email_unique ON public.crew_members USING btree (show_id, email) WHERE (email IS NOT NULL)`,
    },
    {
      name: "pending_syncs_wizard_session_idx", // canonical spec name
      expectDef: `CREATE INDEX pending_syncs_wizard_session_idx ON public.pending_syncs USING btree (wizard_session_id) WHERE (wizard_session_id IS NOT NULL)`,
    },
    // / amendment: live-row vs wizard-row partial unique indexes
    // for pending_syncs and pending_ingestions enable coexistence of one live (NULL-session)
    // row and one wizard (UUID-session) row per drive_file_id, preventing wizard scans from
    // overwriting live cron/push/manual rows during Re-run Setup. Spec §4.5 declares them.
    {
      name: "pending_syncs_live_drive_file_idx",
      expectDef: `CREATE UNIQUE INDEX pending_syncs_live_drive_file_idx ON public.pending_syncs USING btree (drive_file_id) WHERE (wizard_session_id IS NULL)`,
    },
    {
      name: "pending_syncs_session_drive_file_idx",
      expectDef: `CREATE UNIQUE INDEX pending_syncs_session_drive_file_idx ON public.pending_syncs USING btree (drive_file_id, wizard_session_id) WHERE (wizard_session_id IS NOT NULL)`,
    },
    {
      name: "pending_ingestions_live_drive_file_idx",
      expectDef: `CREATE UNIQUE INDEX pending_ingestions_live_drive_file_idx ON public.pending_ingestions USING btree (drive_file_id) WHERE (wizard_session_id IS NULL)`,
    },
    {
      name: "pending_ingestions_session_drive_file_idx",
      expectDef: `CREATE UNIQUE INDEX pending_ingestions_session_drive_file_idx ON public.pending_ingestions USING btree (drive_file_id, wizard_session_id) WHERE (wizard_session_id IS NOT NULL)`,
    },
    {
      name: "admin_alerts_one_unresolved_idx",
      // Spec §4.6: admin_alerts.show_id is nullable for global alerts; partial unique key uses
      // `coalesce(show_id::text, '')` so global alerts participate in the dedup index.
      expectDef: `CREATE UNIQUE INDEX admin_alerts_one_unresolved_idx ON public.admin_alerts USING btree (COALESCE((show_id)::text, ''::text), code) WHERE (resolved_at IS NULL)`,
    },
    // deferred_ingestions live-vs-wizard partial unique indexes
    //. The live
    // partition is what cron/push consult exclusively (`WHERE wizard_session_id IS NULL`);
    // the wizard partition is what wizard step-3 Discard writes and is DELETEd at finalize
    // (clean slate, option A per spec §4.5 lifecycle).
    {
      name: "deferred_ingestions_live_drive_file_idx",
      expectDef: `CREATE UNIQUE INDEX deferred_ingestions_live_drive_file_idx ON public.deferred_ingestions USING btree (drive_file_id) WHERE (wizard_session_id IS NULL)`,
    },
    {
      name: "deferred_ingestions_session_drive_file_idx",
      expectDef: `CREATE UNIQUE INDEX deferred_ingestions_session_drive_file_idx ON public.deferred_ingestions USING btree (drive_file_id, wizard_session_id) WHERE (wizard_session_id IS NOT NULL)`,
    },
    {
      name: "drive_watch_channels_one_active_per_folder_idx",
      expectDef: `CREATE UNIQUE INDEX drive_watch_channels_one_active_per_folder_idx ON public.drive_watch_channels USING btree (watched_folder_id) WHERE (status = 'active'::text)`,
    },
    {
      // onboarding_scan_manifest_session_idx is a non-partial composite index
      // on (wizard_session_id, status) per spec §4.5. Listed here so the introspection matrix proves
      // its exact definition rather than just presence — extra columns or a missing predicate would
      // silently slip past name-only checks.
      name: "onboarding_scan_manifest_session_idx",
      expectDef: `CREATE INDEX onboarding_scan_manifest_session_idx ON public.onboarding_scan_manifest USING btree (wizard_session_id, status)`,
    },
    {
      // onboarding_scan_manifest unique constraint on (wizard_session_id, drive_file_id)
      // per spec §4.5 `unique (wizard_session_id, drive_file_id)`. PG default name is the table+column form.
      name: "onboarding_scan_manifest_wizard_session_id_drive_file_id_key",
      expectDef: `CREATE UNIQUE INDEX onboarding_scan_manifest_wizard_session_id_drive_file_id_key ON public.onboarding_scan_manifest USING btree (wizard_session_id, drive_file_id)`,
    },
    // + findings 1–2 + :
    // pending_snapshot_uploads partial index for the GC pass (iii) initial-claim range scan in Task 7.8.
    // Predicate `WHERE promoted_at IS NULL AND claim_token IS NULL` keeps the index small (only unpromoted,
    // unclaimed ledger rows) so the periodic sweep does a bounded range scan AND skips rows already
    // claimed by another in-flight GC worker — critical for the 3-state lifecycle that
    // closes the GC-vs-promoter race AND the revived-after-expiry vs committing_delete race.
    {
      name: "pending_snapshot_uploads_unpromoted_idx",
      expectDef: `CREATE INDEX pending_snapshot_uploads_unpromoted_idx ON public.pending_snapshot_uploads USING btree (uploaded_at) WHERE ((promoted_at IS NULL) AND (claim_token IS NULL))`,
    },
    // + : claim-expiry reclaim
    // index. renames from `pending_snapshot_uploads_claimed_idx` to
    // `pending_snapshot_uploads_claim_expiry_idx` because the predicate column shifted from
    // `claimed_at` (start time) to `claim_expires_at` (lease deadline) — the lease length now
    // varies by state (5 min in `claimed`, 15 min in `committing_delete`) so the reclaim sweep
    // MUST range-scan the deadline column, not the start column. Predicate adds
    // `delete_started_at IS NULL` so a worker that committed-to-delete is invisible to the
    // reclaim path — that is the that prevents byte destruction after
    // claim expiry. Without this index a crashed-GC worker's row would be permanently stuck.
    {
      name: "pending_snapshot_uploads_claim_expiry_idx",
      expectDef: `CREATE INDEX pending_snapshot_uploads_claim_expiry_idx ON public.pending_snapshot_uploads USING btree (claim_expires_at) WHERE ((claim_token IS NOT NULL) AND (promoted_at IS NULL) AND (delete_started_at IS NULL) AND (promote_started_at IS NULL))`,
    },
    // pending_snapshot_uploads_promote_stuck_idx — partial index on
    // (promote_started_at) WHERE promote_started_at IS NOT NULL AND promoted_at IS NULL per spec §4.5.
    // Backs the PENDING_SNAPSHOT_PROMOTE_STUCK admin-alert sweep — rows in the non-reclaimable
    // promotion sub-state for >15min without `promoted_at` are admin-attention candidates (rename
    // hangs or process crashes mid-flight; reclaim-expired refuses these rows by design, so an
    // admin must repair via /api/admin/snapshot-rollback/[id]/repair). Without this index the
    // admin sweep would full-scan the ledger every time.
    {
      name: "pending_snapshot_uploads_promote_stuck_idx",
      expectDef: `CREATE INDEX pending_snapshot_uploads_promote_stuck_idx ON public.pending_snapshot_uploads USING btree (promote_started_at) WHERE ((promote_started_at IS NOT NULL) AND (promoted_at IS NULL))`,
    },
    // committing-delete recovery index. Rows in
    // the `committing_delete` state hold a 15-minute lease; in the rare case a worker crashes
    // AFTER commit-to-delete but BEFORE Storage DELETE completes, the row stays stuck unless an
    // operator-driven recovery sweep can find it. Predicate `WHERE delete_started_at IS NOT NULL`
    // is the simplest possible: it identifies every row in committing_delete state. The sweep is
    // not on the hourly cron path (the 15-min lease means there is no urgency); it runs on the
    // daily reconciler path or on-demand for forensics.
    {
      name: "pending_snapshot_uploads_committing_delete_idx",
      expectDef: `CREATE INDEX pending_snapshot_uploads_committing_delete_idx ON public.pending_snapshot_uploads USING btree (delete_started_at) WHERE (delete_started_at IS NOT NULL)`,
    },
    // + : pending_snapshot_uploads.temp_prefix
    // unique constraint per spec §4.5 `unique (temp_prefix)`. PG default name is the table+column form.
    // Per , grain is one row per Apply attempt (not per asset), so this uniqueness
    // pairs with `unique (snapshot_revision_id)` below — both columns are unique-per-Apply.
    {
      name: "pending_snapshot_uploads_temp_prefix_key",
      expectDef: `CREATE UNIQUE INDEX pending_snapshot_uploads_temp_prefix_key ON public.pending_snapshot_uploads USING btree (temp_prefix)`,
    },
    // pending_snapshot_uploads.snapshot_revision_id
    // unique constraint per spec §4.5 `unique (snapshot_revision_id)`. Pairs with the per-Apply grain:
    // every Apply mints a fresh `snapshot_revision_id` so the ledger row keyed on it is also unique-per-Apply.
    // The post-commit promoter UPDATEs WHERE snapshot_revision_id = $rev for the rename-success transition.
    {
      name: "pending_snapshot_uploads_snapshot_revision_id_key",
      expectDef: `CREATE UNIQUE INDEX pending_snapshot_uploads_snapshot_revision_id_key ON public.pending_snapshot_uploads USING btree (snapshot_revision_id)`,
    },
    // revision_race_cooldowns_last_race_idx
    // is a non-partial index on `(last_race_at)` per spec §4.1; powers the §7.8 GC age sweep that
    // deletes cooldown rows older than 24 hours (defensive cleanup for cooldowns whose successful
    // sync happened off the explicit clear path). Listed here so a future migration that drops the
    // index OR changes its column set fails AC-2.1 explicitly.
    {
      name: "revision_race_cooldowns_last_race_idx",
      expectDef: `CREATE INDEX revision_race_cooldowns_last_race_idx ON public.revision_race_cooldowns USING btree (last_race_at)`,
    },
    // revision_race_cooldowns composite
    // PK on `(drive_file_id, raced_head_revision_id)`. PG default name for the PK index is the
    // `<table>_pkey` form. The composite key (NOT a single-column PK on `drive_file_id`) is what
    // makes per-`raced_head_revision_id` cooldown isolation work: a race against R1 doesn't gate a
    // race against R2 even when both target the same drive_file_id.
    {
      name: "revision_race_cooldowns_pkey",
      expectDef: `CREATE UNIQUE INDEX revision_race_cooldowns_pkey ON public.revision_race_cooldowns USING btree (drive_file_id, raced_head_revision_id)`,
    },
    /* …reports.idempotency_key unique index, reports.lease_holder partial-not-null index, etc. */
  ] as const;
  for (const idx of REQUIRED_PARTIAL_INDEXES) {
    it(`AC-2.1 partial index exact-def: ${idx.name}`, (async) => {
      const { rows } = await admin.query(
        `SELECT pg_get_indexdef(c.oid) AS def FROM pg_class c WHERE c.relname = $1`,
        [idx.name],
      );
      expect(rows.length).toBe(1);
      assertExactDefMatch(rows[0].def, idx.expectDef, `index ${idx.name}`); // string equality
    });
  }

  // **REQUIRED_COLUMNS — column-presence + type/null/default introspection.**
  // Three / columns are critical for the wizard finalize CAS, the wizard-Apply
  // gate, and the first-seen `defer_until_modified` retro-deferral path; all three would silently
  // absent in a future migration that forgets them, and the CHECK/FK/index matrices above would
  // not catch it. Add a dedicated REQUIRED_COLUMNS matrix driven by `information_schema.columns`,
  // plus a CHECK-invariant entry for the wizard_approved-requires-session contract.
  const REQUIRED_COLUMNS = [
    {
      // wizard-approved gate: pending_syncs.wizard_approved BOOLEAN NOT NULL DEFAULT FALSE
      //.
      table: "pending_syncs",
      column: "wizard_approved",
      data_type: "boolean",
      is_nullable: "NO",
      column_default: "false",
    },
    {
      // durable wizard-approval payload. NULL until step 5W; finalize
      // reads these as sync_audit attribution + reviewer-choices replay payload. The §4.5
      // symmetry CHECK (wizard_approved=false OR all-three-NOT-NULL) is asserted below.
      table: "pending_syncs",
      column: "wizard_approved_by_email",
      data_type: "text",
      is_nullable: "YES",
      column_default: null,
    },
    {
      table: "pending_syncs",
      column: "wizard_approved_at",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    {
      // validated reviewer_choices payload (post §6.8.2 schema validation)
      // captured at step 5W and replayed verbatim by finalize Phase B as the Phase 2 `choices`
      // argument so MI-11/12/13/14 derived_side_effects reflect the operator's actual decisions.
      table: "pending_syncs",
      column: "wizard_reviewer_choices",
      data_type: "jsonb",
      is_nullable: "YES",
      column_default: null,
    },
    {
      // payload-shape version. Finalize-time replay dispatches to the
      // version-1 validator + derivation table; unknown version emits
      // WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED and the operator must re-Apply.
      // Symmetry CHECK requires NULL on live rows AND NOT NULL when wizard_approved = TRUE
      //.
      table: "pending_syncs",
      column: "wizard_reviewer_choices_version",
      data_type: "smallint",
      is_nullable: "YES",
      column_default: null,
    },
    {
      // row visibility gate for multi-batch wizard finalize. Default TRUE
      // so live cron/push/manual rows AND existing fixtures behave correctly without explicit
      // backfill. Wizard-finalize INTERIM batches INSERT shows rows with FALSE; the FINAL batch's
      // transaction flips to TRUE in the same transaction as the §4.5 atomic-promotion CAS.
      // The non-admin branch of EVERY crew-readable table's SELECT policy carries
      // `AND EXISTS (SELECT 1 FROM public.shows WHERE id = <table>.show_id AND published = TRUE)`
      // (or, on `shows` itself, `AND shows.published = TRUE`) so interim-batch rows are denied
      // even to crew whose email matches a `crew_members` row — the gate is replicated on every
      // peer table to close the PostgREST direct-query bypass.
      table: "shows",
      column: "published",
      data_type: "boolean",
      is_nullable: "NO",
      column_default: "true",
    },
    {
      // wizard-session timestamp: app_settings.pending_wizard_session_at TIMESTAMPTZ
      // NULL — set when a wizard session is opened; cleared on finalize/abort. Used by the §4.5
      // pending-wizard-session CAS in Task 10.x.
      table: "app_settings",
      column: "pending_wizard_session_at",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    {
      // pending_ingestions.last_seen_modified_time TIMESTAMPTZ NULL — populated on
      // every Phase 1 hard-fail UPSERT; read by `/api/admin/pending-ingestions/[id]/discard` to
      // populate `deferred_ingestions.deferred_at_modified_time` when kind='defer_until_modified'
      // (mirrors how `pending_syncs.staged_modified_time` feeds the first-seen Discard path).
      table: "pending_ingestions",
      column: "last_seen_modified_time",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    // shows.pending_snapshot_path REMOVED. The corrected design
    // stages the not-yet-promoted revision id on `shows.diagrams.pending_revision_id` (a
    // JSONB field inside the existing `diagrams` column) and atomically cuts over via a
    // single jsonb_set UPDATE post-Storage-manifest-verification. The asset route never
    // falls back to the temp prefix; it serves only `snapshot_revision_id`-prefixed bytes.
    // No `pending_snapshot_path` column entry needed in REQUIRED_COLUMNS — the column does
    // not exist on `shows`. (Task 2.5 still asserts the `diagrams` JSONB column itself is
    // present per its existing entry; the JSONB shape is documented in spec §4.1.)
    // pending_snapshot_uploads ledger column
    // presence — every column on the new admin-only ledger table needs introspection so a
    // partial migration can't silently drop one. The unique-on-temp_prefix and partial-index
    // assertions live in REQUIRED_PARTIAL_INDEXES above; the FK lives in REQUIRED_FKS above.
    {
      table: "pending_snapshot_uploads",
      column: "id",
      data_type: "uuid",
      is_nullable: "NO",
      column_default: "gen_random_uuid",
    },
    {
      table: "pending_snapshot_uploads",
      column: "show_id",
      data_type: "uuid",
      is_nullable: "NO",
      column_default: null,
    },
    {
      table: "pending_snapshot_uploads",
      column: "drive_file_id",
      data_type: "text",
      is_nullable: "NO",
      column_default: null,
    },
    {
      table: "pending_snapshot_uploads",
      column: "temp_prefix",
      data_type: "text",
      is_nullable: "NO",
      column_default: null,
    },
    {
      table: "pending_snapshot_uploads",
      column: "uploaded_at",
      data_type: "timestamp with time zone",
      is_nullable: "NO",
      column_default: "now",
    },
    {
      table: "pending_snapshot_uploads",
      column: "promoted_at",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    // pending_snapshot_uploads.snapshot_revision_id
    // is part of the per-Apply ledger key (along with temp_prefix). Both are UNIQUE-per-Apply per the
    // amended grain. The post-commit promoter UPDATEs `WHERE snapshot_revision_id = $rev` to flip
    // promoted_at + clear claim_token in one statement.
    {
      table: "pending_snapshot_uploads",
      column: "snapshot_revision_id",
      data_type: "uuid",
      is_nullable: "NO",
      column_default: null,
    },
    // pending_snapshot_uploads.asset_count is the
    // number of assets uploaded under this Apply's temp prefix. Captured at INSERT time so the GC
    // sweep / promoter can sanity-check the prefix LIST result against the recorded count and
    // detect partial-upload corner cases.
    {
      table: "pending_snapshot_uploads",
      column: "asset_count",
      data_type: "integer",
      is_nullable: "NO",
      column_default: null,
    },
    // pending_snapshot_uploads.claim_token —
    // the GC worker's single-claim CAS token. NULL on initial INSERT and on the post-promote
    // success UPDATE; non-NULL only between GC's claim transaction and either (a) the GC delete
    // transaction's CAS check or (b) the 5-minute claim expiry. Without this column the
    // GC-vs-promoter race deletes assets out from under a committed revision.
    {
      table: "pending_snapshot_uploads",
      column: "claim_token",
      data_type: "uuid",
      is_nullable: "YES",
      column_default: null,
    },
    // pending_snapshot_uploads.claimed_at — the
    // timestamp the worker first claimed this row. Distinct from `claim_expires_at` (lease deadline);
    // the splits these because the lease length now varies by state
    // (5 min in `claimed`, 15 min in `committing_delete`) AND heartbeats extend the deadline without
    // resetting `claimed_at`. CHECK invariant `(claim_token IS NULL AND claimed_at IS NULL AND
    // claim_expires_at IS NULL) OR (claim_token IS NOT NULL AND claimed_at IS NOT NULL AND
    // claim_expires_at IS NOT NULL)` is asserted in REQUIRED_TABLE_CHECKS.
    {
      table: "pending_snapshot_uploads",
      column: "claimed_at",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    // pending_snapshot_uploads.claim_expires_at —
    // the lease deadline. Set to `claimed_at + interval '5 minutes'` on initial claim; extended
    // heartbeat-style on long-running work; jumped to `delete_started_at + interval '15 minutes'`
    // on commit-to-delete. Replaces the prior `claimed_at < now - interval '5 minutes'` derivation
    // because heartbeats need to extend the lease independently of `claimed_at`. The reclaim-expired
    // path range-scans this column WHERE `delete_started_at IS NULL` — the new
    // `pending_snapshot_uploads_claim_expiry_idx` partial index supports this.
    {
      table: "pending_snapshot_uploads",
      column: "claim_expires_at",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    // pending_snapshot_uploads.delete_started_at —
    // the state-discriminator that turns the lifecycle into a 3-state machine (unclaimed / claimed /
    // committing_delete). NULL in unclaimed and claimed states; NON-NULL ONLY in committing_delete.
    // The commit-to-delete UPDATE sets this column atomically alongside extending the lease; the
    // reclaim-expired and promote UPDATEs both INCLUDE `delete_started_at IS NULL` in their WHERE
    // clauses so they refuse rows that are mid-delete. THIS is the safety invariant that prevents
    // byte destruction after claim expiry — a revived GC worker after the original claim's
    // `claim_expires_at` slips CANNOT delete bytes that another worker already committed to delete.
    // CHECK invariants `delete_started_at IS NULL OR claim_token IS NOT NULL` (must be claimed first)
    // and `delete_started_at IS NULL OR promoted_at IS NULL` (cannot delete a promoted row) are
    // asserted in REQUIRED_TABLE_CHECKS.
    {
      table: "pending_snapshot_uploads",
      column: "delete_started_at",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    // pending_snapshot_uploads.promote_started_at —
    // the non-reclaimable-promotion sub-state column. Set in the SAME UPDATE that acquires the
    // claim for the post-commit promoter (so the reclaim-expired sweep refuses the row
    // immediately); cleared (set to NULL) when `promoted_at` is set OR on (P5) rollback success;
    // NOT cleared on (P5-stuck) reverse-rename failure (admin-only repair clears it). The
    // reclaim-expired path's WHERE clause includes `promote_started_at IS NULL` so a stalled
    // rename cannot be reclaimed by another worker mid-rename. The
    // `pending_snapshot_uploads_promote_stuck_idx` partial index in REQUIRED_PARTIAL_INDEXES backs
    // the `PENDING_SNAPSHOT_PROMOTE_STUCK` admin-alert sweep over this column.
    {
      table: "pending_snapshot_uploads",
      column: "promote_started_at",
      data_type: "timestamp with time zone",
      is_nullable: "YES",
      column_default: null,
    },
    // shows.opening_reel_mime_type TEXT NULL — the
    // 4th reel pin column added by to gate inline `<video>` rendering on
    // `mimeType.startsWith('video/')`. AC-7.24 / AC-7.25 require ALL FOUR pin columns to be
    // non-NULL for inline video to render and treat ANY NULL as the single 410 contract trigger.
    // Earlier introspection only covered the original three pin columns; this entry plus the
    // amended ACs ensure a future migration can't silently drop the MIME-type gate.
    {
      table: "shows",
      column: "opening_reel_mime_type",
      data_type: "text",
      is_nullable: "YES",
      column_default: null,
    },
    // revision_race_cooldowns
    // columns. The composite PK / non-partial last_race_at index assertions live in
    // REQUIRED_PARTIAL_INDEXES above (the `revision_race_cooldowns_pkey` and
    // `revision_race_cooldowns_last_race_idx` entries). Listed here so a future migration that
    // forgets any column on this admin-only ledger fails AC-2.1 explicitly. The admin-only RLS
    // policy is exercised by AC-2.5 (the table is in the §4.3 admin-only list, count = 18).
    {
      table: "revision_race_cooldowns",
      column: "drive_file_id",
      data_type: "text",
      is_nullable: "NO",
      column_default: null,
    },
    {
      table: "revision_race_cooldowns",
      column: "raced_head_revision_id",
      data_type: "text",
      is_nullable: "NO",
      column_default: null,
    },
    {
      table: "revision_race_cooldowns",
      column: "last_race_at",
      data_type: "timestamp with time zone",
      is_nullable: "NO",
      column_default: "now",
    },
    {
      table: "revision_race_cooldowns",
      column: "retry_count",
      data_type: "integer",
      is_nullable: "NO",
      column_default: "0",
    },
    // JWT signing-key rotation columns (§4.5 / §7.2.3 / AC-5.6a). Both columns ship in the initial
    // migration as a single linked unit (no follow-on ALTER per Step 1's no-ALTER rule). The
    // validator's step 3a (Task 5.2) compares `link_sessions.signing_key_id` against
    // `app_settings.active_signing_key_id` per request and DELETEs + 401's
    // `LINK_SESSION_KEY_ROTATED` on mismatch. Without these introspection entries, a future
    // migration could silently drop either column and break the §7.2.3 global-rotation contract
    // without any failing test surfacing the regression.
    {
      table: "link_sessions",
      column: "signing_key_id",
      data_type: "text",
      is_nullable: "NO",
      column_default: null,
    },
    {
      table: "app_settings",
      column: "active_signing_key_id",
      data_type: "text",
      is_nullable: "NO",
      column_default: "'k1'::text",
    },
  ] as const;
  for (const c of REQUIRED_COLUMNS) {
    it(`AC-2.1 column presence: ${c.table}.${c.column}`, (async) => {
      const { rows } = await admin.query(
        `SELECT data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [c.table, c.column],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].data_type).toBe(c.data_type);
      expect(rows[0].is_nullable).toBe(c.is_nullable);
      if (c.column_default === null) expect(rows[0].column_default).toBeNull;
      else
        expect(String(rows[0].column_default).toLowerCase).toContain(
          String(c.column_default).toLowerCase,
        );
    });
  }
  // Additional CHECK invariants tied to columns. Spec §4.5
  // declares `pending_syncs (.. CHECK (wizard_session_id IS NOT NULL OR wizard_approved = false))`
  // — a wizard_approved=TRUE row MUST have a wizard_session_id; live-partition rows can never be
  // `approved`. Add the CHECK to REQUIRED_CHECKS above (it's listed there from spec); also assert
  // its presence here so it can't be silently dropped:
  it("AC-2.1 CHECK invariant present: pending_syncs_wizard_approved_requires_session", (async) => {
    const { rows } = await admin.rpc("introspect_check", {
      p_table: "pending_syncs",
      p_name: "pending_syncs_wizard_approved_requires_session",
    });
    expect(rows.length).toBe(1);
    assertExactDefMatch(
      rows[0].def,
      `CHECK (((wizard_session_id IS NOT NULL) OR (wizard_approved = false)))`,
      "pending_syncs_wizard_approved_requires_session",
    );
  });

  // live-rows-have-no-payload invariant. The three approval-payload
  // columns (wizard_approved_by_email, wizard_approved_at, wizard_reviewer_choices) are
  // meaningful only for wizard-scope rows. A live-scope row (wizard_session_id IS NULL) MUST
  // keep all three NULL — the §4.5 CHECK below blocks any attempt to write the payload onto
  // a live row.
  it("AC-2.1 CHECK invariant present: pending_syncs_live_rows_have_no_approval_payload", (async) => {
    const { rows } = await admin.rpc("introspect_check", {
      p_table: "pending_syncs",
      p_name: "pending_syncs_live_rows_have_no_approval_payload",
    });
    expect(rows.length).toBe(1);
    assertExactDefMatch(
      rows[0].def,
      // `wizard_reviewer_choices_version` joins the symmetry pair —
      // live rows (wizard_session_id IS NULL) MUST keep all FOUR payload columns NULL.
      `CHECK (((wizard_session_id IS NOT NULL) OR ((wizard_approved_by_email IS NULL) AND (wizard_approved_at IS NULL) AND (wizard_reviewer_choices IS NULL) AND (wizard_reviewer_choices_version IS NULL))))`,
      "pending_syncs_live_rows_have_no_approval_payload",
    );
  });

  // + : approval-payload symmetry invariant.
  // wizard_approved=TRUE MUST co-occur with all FOUR payload columns being NOT NULL — the §4.5
  // CHECK below makes it impossible to set wizard_approved=TRUE without also persisting the
  // operator email, approval timestamp, validated reviewer_choices payload, AND the payload-shape
  // version. This is what guarantees finalize can reconstruct sync_audit + replay
  // MI-11/12/13/14 derived_side_effects through the correct version-keyed handler.
  it("AC-2.1 CHECK invariant present: pending_syncs_approved_requires_full_payload", (async) => {
    const { rows } = await admin.rpc("introspect_check", {
      p_table: "pending_syncs",
      p_name: "pending_syncs_approved_requires_full_payload",
    });
    expect(rows.length).toBe(1);
    assertExactDefMatch(
      rows[0].def,
      `CHECK (((wizard_approved = false) OR ((wizard_approved_by_email IS NOT NULL) AND (wizard_approved_at IS NOT NULL) AND (wizard_reviewer_choices IS NOT NULL) AND (wizard_reviewer_choices_version IS NOT NULL))))`,
      "pending_syncs_approved_requires_full_payload",
    );
  });

  // runtime CHECK enforcement — try to violate each invariant and
  // assert SQL `23514` *check_violation* fires. This catches a schema where the constraints
  // exist by name but were authored with weakened predicates (e.g., a typo'd column reference
  // making the OR-clause always true). The introspection-def matchers above guard against
  // that statically; this runtime check provides defense in depth.
  it("AC-2.1 CHECK enforces live-rows-have-no-payload at runtime", (async) => {
    const seed = {
      drive_file_id: "m12-runtime-1",
      wizard_session_id: null,
      wizard_approved: false /* …other required fields */,
    };
    await admin.from("pending_syncs").insert(seed);
    const result = await admin
      .from("pending_syncs")
      .update({ wizard_approved_by_email: "doug@example.com" })
      .eq("drive_file_id", seed.drive_file_id);
    expect(result.error?.code).toBe("23514");
  });
  it("AC-2.1 CHECK enforces approved-requires-full-payload at runtime", (async) => {
    // Insert a wizard-scope row, then try wizard_approved=TRUE with one payload column NULL.
    const seed = {
      drive_file_id: "m12-runtime-2",
      wizard_session_id: TEST_WIZARD_SESSION_ID,
      wizard_approved: false,
    };
    await admin.from("pending_syncs").insert(seed);
    const result = await admin
      .from("pending_syncs")
      .update({
        wizard_approved: true,
        wizard_approved_by_email: "doug@example.com",
        wizard_approved_at: new Date.toISOString(),
        // wizard_reviewer_choices intentionally omitted → NULL → violates symmetry CHECK
      })
      .eq("drive_file_id", seed.drive_file_id);
    expect(result.error?.code).toBe("23514");
  });

  // **Live-vs-wizard partition execution contract.** Index
  // shape introspection above proves DDL is correct but does NOT prove the conflict-target
  // arbiter fires at runtime. Add execution-level UPSERT contract tests for `pending_syncs`
  // AND `pending_ingestions` covering: (a) live-partition idempotence (two NULL-session
  // UPSERTs on same drive_file_id produce one row, second has xmax>0); (b) wizard-partition
  // idempotence (two same-session UUID UPSERTs same shape); (c) cross-partition coexistence
  // (one live (NULL) + one wizard (UUID) row coexist, count=2, live_n=1, wizard_n=1);
  // (d) missing-index rollback — wrap in BEGIN/ROLLBACK, DROP both partial indexes, run a
  // wizard UPSERT, assert Postgres raises with SQLSTATE 42P10 OR 23505 AND that production
  // helper `classifyOnboardingUpsertError(err)` (Task 6.8) returns `'LIVE_ROW_CONFLICT'`.
  // Earlier draft inferred from a zero-row RETURNING heuristic, which silently swallowed
  // real misses. Classification MUST be SQLSTATE-based, NOT row-count-based. Companion
  // file `tests/db/partial-index-execution.test.ts` runs the four cases as a parameterized
  // loop. Sample assertion shape:
  // const sql = `INSERT INTO ${tableName} (drive_file_id, wizard_session_id) VALUES ($1, NULL)
  // ON CONFLICT (drive_file_id) WHERE wizard_session_id IS NULL DO UPDATE
  // SET attempt_count = ${tableName}.attempt_count + 1
  // RETURNING xmax::text::bigint > 0 AS was_update`;
  // const a = await admin.query(sql, [driveFileId]); expect(a.rows[0].was_update).toBe(false);
  // const b = await admin.query(sql, [driveFileId]); expect(b.rows[0].was_update).toBe(true);
  // Divergence between the two tables would silently break the wizard-isolation guarantee
  // in §6.4 / §9.0 / spec §4.5 amendment.
  // Transportation singular-row contract — spec §4.1 enforces unique(show_id)
  // because the parser/data-model is `TransportationRow | null`. Add both an introspection assertion
  // for the unique constraint AND a duplicate-insert test that exercises the constraint at runtime.
  it("AC-2.1 transportation has unique(show_id) — introspection", (async) => {
    const { rows } = await admin.query(
      `SELECT pg_get_indexdef(c.oid) AS def FROM pg_class c WHERE c.relname = $1`,
      ["transportation_show_id_key"], // PG default name for `UNIQUE` column constraint; adjust if migration uses an explicit name
    );
    expect(rows.length).toBe(1);
    assertExactDefMatch(
      rows[0].def,
      `CREATE UNIQUE INDEX transportation_show_id_key ON public.transportation USING btree (show_id)`,
      "transportation_show_id_key",
    );
  });
  it("AC-2.1 transportation rejects duplicate (show_id) insert", (async) => {
    const { error: firstErr } = await admin
      .from("transportation")
      .insert({ show_id: knownShowId, driver_name: "A" });
    expect(firstErr).toBeNull;
    const { error: dupErr } = await admin
      .from("transportation")
      .insert({ show_id: knownShowId, driver_name: "B" });
    expect(dupErr?.code).toBe("23505"); // Postgres unique_violation
  });

  // Negative assertions — intentionally absent constraints.
  // Some spec rules require the ABSENCE of FKs (e.g., pending_* tables shouldn't FK to shows since
  // the file may exist before the show row does; crew_member_auth must NOT FK to crew_members.id
  // since §4.1 requires the auth state to survive crew_members row deletion-and-recreation —
  // the "remove-and-readd" contract that prevents old JWTs from resurrecting when a name returns
  // to the sheet). Assert these explicitly so a future migration can't accidentally tighten the
  // schema in a way that breaks the staging contract OR the auth-survival contract.
  it("AC-2.1 pending_syncs.drive_file_id has NO FK to shows (first-seen staging requires no parent row)", (async) => {
    const { rows } = await admin.rpc("introspect_fk", {
      p_table: "pending_syncs",
      p_column: "drive_file_id",
    });
    expect(rows.length).toBe(0);
  });
  it("AC-2.1 pending_ingestions.drive_file_id has NO FK to shows (same rationale)", (async) => {
    const { rows } = await admin.rpc("introspect_fk", {
      p_table: "pending_ingestions",
      p_column: "drive_file_id",
    });
    expect(rows.length).toBe(0);
  });
  // — crew_member_auth durability invariant (§4.1 remove-and-readd contract).
  // §4.1 requires `crew_member_auth` to survive `crew_members` row deletion AND recreation:
  // when sync deletes a crew_members row (sheet no longer lists that name), crew_member_auth
  // is NOT touched, and if the same name returns later the prior current_token_version /
  // max_issued_version / revoked_below_version state must still be in force so old JWTs are
  // rejected via strict equality. This is structurally guaranteed by (a) crew_member_auth's
  // (show_id, crew_name) primary key NOT being a foreign key to crew_members.id and (b) NO
  // ON DELETE CASCADE from crew_members to crew_member_auth. Earlier draft only added negative
  // FK assertions for pending_syncs and pending_ingestions; missing crew_member_auth here
  // would let a future migration accidentally add `REFERENCES crew_members(...) ON DELETE
  // CASCADE` and silently break the auth-survival contract.
  it("AC-2.1 crew_member_auth has NO FK to crew_members (remove-and-readd survival per §4.1)", (async) => {
    // Introspect every FK on crew_member_auth and assert NONE references crew_members.
    // Use pg_get_constraintdef so we can also assert against the FK definition string in case
    // a future migration adds a non-standard column referencing the wrong target.
    const { rows } = await admin.query(
      `SELECT conname, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'crew_member_auth' AND c.contype = 'f'`,
      [],
    );
    // ZERO foreign-key constraints referencing crew_members. (FK to shows IS allowed and
    // expected — that's the show-level cascade per §4.1; only crew_members is forbidden.)
    for (const r of rows) {
      expect(r.def.toLowerCase).not.toMatch(/references\s+crew_members/);
    }
  });
  it("AC-2.1 crew_member_auth survives crew_members delete-and-readd (runtime durability)", (async) => {
    // Integration probe: the negative FK assertion above proves the schema CAN survive the
    // cycle; this test proves the runtime contract is actually preserved. Earlier draft only
    // had introspection — without exercising the cycle, nothing catches a future trigger that
    // deletes from crew_member_auth on crew_members DELETE.
    const showId = await seedShow; // service-role helper (see Task 2.4 fixtures)
    const name = `Probe ${crypto.randomUUID}`; // unique within the show
    const email = `${name.toLowerCase.replace(/\s+/g, ".")}@probe.test`;
    // 1. Insert a crew_members row; a crew_member_auth row should exist (per §5.2 sync interaction).
    // We seed both directly to avoid coupling this test to the sync code path.
    const { data: crewRow } = await admin.from("crew_members").insert({
      show_id: showId,
      name,
      email,
      role: "PROBE",
      role_flags: ["PROBE"],
    }).select.single;
    expect(crewRow!.id).toEqual(expect.any(String));
    // Pre-existing auth state with non-default values so a stealth re-init would be visible:
    const initial = {
      show_id: showId,
      crew_name: name,
      current_token_version: 7,
      max_issued_version: 9,
      revoked_below_version: 4,
    };
    const { error: authInsertErr } = await admin
      .from("crew_member_auth")
      .upsert(initial, { onConflict: "show_id,crew_name" });
    expect(authInsertErr).toBeNull;
    // 2. Delete the crew_members row (sync's "delete-not-in-set" path simulating a sheet
    // where Doug removed the name).
    const { error: delErr } = await admin.from("crew_members").delete.eq("id", crewRow!.id);
    expect(delErr).toBeNull;
    // 3. crew_member_auth MUST still hold the prior (current_token_version, max_issued_version,
    // revoked_below_version) tuple — no implicit cascade, no trigger, nothing.
    const afterDelete = await admin
      .from("crew_member_auth")
      .select("current_token_version, max_issued_version, revoked_below_version")
      .eq("show_id", showId)
      .eq("crew_name", name).maybeSingle;
    expect(afterDelete.error).toBeNull;
    expect(afterDelete.data).toEqual({
      current_token_version: 7,
      max_issued_version: 9,
      revoked_below_version: 4,
    });
    // 4. Re-insert the crew_members row with the SAME (show_id, name). Per §5.2 the sync
    // INSERT...ON CONFLICT DO NOTHING for crew_member_auth must NOT clobber the prior
    // auth state — the existing row joins back in and old JWTs continue to be rejected.
    const { data: crewRow2 } = await admin.from("crew_members").insert({
      show_id: showId,
      name,
      email,
      role: "PROBE_V2",
      role_flags: ["PROBE"],
    }).select.single;
    expect(crewRow2!.id).toEqual(expect.any(String));
    // Idempotent upsert mimicking sync's behavior — DO NOTHING when the auth row already exists:
    await admin
      .from("crew_member_auth")
      .upsert(
        { show_id: showId, crew_name: name },
        { onConflict: "show_id,crew_name", ignoreDuplicates: true },
      );
    const afterReadd = await admin
      .from("crew_member_auth")
      .select("current_token_version, max_issued_version, revoked_below_version")
      .eq("show_id", showId)
      .eq("crew_name", name).single;
    expect(afterReadd.error).toBeNull;
    expect(afterReadd.data).toEqual({
      current_token_version: 7,
      max_issued_version: 9,
      revoked_below_version: 4,
    });
  });
  ```

- [ ] **Step 4: Commit** `test(db): exact-def CHECK + FK + partial-index introspection + negative assertions`.

---
