# Role-vocab mapping convergence — drift-derived cron re-sync eligibility

**Date:** 2026-07-16 · **Backlog:** `BL-ROLE-VOCAB-MAPPING-CONVERGENCE` (BACKLOG.md:15) · **Parent specs:** `2026-07-15-extend-role-scope-vocab.md`, `2026-07-16-role-vocab-staging-overlay.md` (§3.4 files this gap)

## 1. Problem

Editing or deleting a `role_token_mappings` row changes no sheet bytes, so cron/push watermark-skip every unmodified sheet (`lib/sync/perFileProcessor.ts:214-218` — `fileMeta.modifiedTime <= effective_watermark → skip`). An already-published show's `role_flags`/warnings converge only on its next sheet edit or a manual sync. Worst direction: a post-publish delete/narrow leaves revoked grants (crew-visible scope tiles) live indefinitely. The staging-overlay publish freshness gate closes every `published=false→true` path; this feature closes the residual class: **already-published shows and genuinely post-publish revokes** (staging-overlay spec §3.4).

## 2. Resolved decisions (in-session brainstorm, 2026-07-16)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Convergence latency | **Next scheduled cron tick** is acceptable. No immediate-on-settings-save path. Manual sync stays the deterministic immediate lever (`perFileProcessor.ts:170-172`). |
| D2 | Blast radius | **Only affected shows.** Content-based eligibility derived from persisted per-show state; no "all shows re-process on any vocab change." |
| D3 | Mechanism | **Derived eligibility (approach A)** — a read-only batch predicate computed once per cron tick from persisted stamp + warnings, threaded to the per-file gate as a watermark-skip-suppression disjunct. Rejected: mutation-time fan-out marks (approach B — new write surface on lockless settings actions, orphanable marks, misses non-settings drift sources); global vocab version / `updated_at` watermark (approach C — `max(updated_at)` misses DELETEs, re-processes every show per edit, and would add a new gating-watermark symbol; see §8 preempts). |
| D4 | Drift semantics | **Exact-match, both directions.** The publish gate's containment predicate (`role_mappings_stamp_satisfied`, migration `20260716210000_role_mappings_publish_freshness.sql:28-50`) passes broadened grants (truth table at `:22-27` — "equal / broadened / [] → true"), so it cannot detect the broaden case, where the show SHOULD re-sync to gain the wider grants. The drift predicate therefore compares stamped grants to current grants as **set equality**, and is a NEW predicate — `role_mappings_stamp_satisfied` stays publish-gate-only, unmodified. |

## 3. Design

### 3.1 Eligibility predicate — what "affected" means

A **published, non-archived** show is **drift-eligible** when either of (a)/(b) below holds. The `published = true` bound (adversarial R2 F1) is an ownership boundary, not an optimization: an unpublished/held show has no crew-visible grants to go stale (unpublished = not crew-visible), its freshness at the moment of publish is already owned by the `role_mappings_stamp_satisfied` gate on every `published=false→true` path (staging-overlay spec §3.5), and its staged/wizard state is owned by the rescan heal — cron must not rewrite a held show's snapshot/stamp/watermark out from under the finalize workflow on a mapping-only change (a genuine sheet edit reaching cron is the pre-existing, CAS-protected class, unchanged here). Unpublish-then-drift converges at re-publish via the freshness gate.

**(a) Stamp drift** — its consumed-token stamp `shows_internal.applied_role_mappings` (shape `[{token, grants}]`, deduped by token, `null` when nothing consumed — built at `lib/sync/phase2.ts:289-301`, persisted at `lib/sync/applyParseResult.ts:267`) contains an entry whose token no longer has a `role_token_mappings` row (**delete**), or whose stamped grants differ from the current row's grants as a set in either direction (**narrow AND broaden** — set equality via mutual containment, which also neutralizes ordering and hypothetical duplicates; the table CHECK `role_token_mappings_grants_allowed` at `20260716000000_role_token_mappings.sql:14-18` bounds values but not order/duplication).

**(b) New-mapping catch** — its persisted `shows_internal.parse_warnings` (written at `lib/sync/applyParseResult.ts:263`) contains an `UNKNOWN_ROLE_TOKEN` warning whose `roleToken` now has a `role_token_mappings` row. Join is direct string equality: the parser emits `roleToken` already canonical (`lib/parser/personalization.ts:316` maps every token through `canonicalRoleToken`; emission at `:345-352`), and the table PK is CHECK-constrained to the same canonical form (`role_token_mappings_token_canonical`, `20260716000000_role_token_mappings.sql:12-13`).

Direction coverage (why these two cover the whole matrix):

| Vocab change | Show state at last processed sync | Detected by | Converges to |
|---|---|---|---|
| CREATE mapping | Warning persisted (token was unmapped) | (b) — for `roleToken`-carrying warnings; legacy pre-`roleToken` warnings excluded (see guard below) | Grants applied, warning consumed, stamp gains entry |
| BROADEN grants | Token consumed (stamp entry, warning gone) | (a) set-inequality | Wider grants, stamp rewritten |
| NARROW grants | Token consumed | (a) set-inequality | Narrower grants (downward — `role_flags` rebuilt from parse, not accumulated) |
| DELETE mapping, token was consumed | Stamp entry present | (a) missing row | Grants revoked, warning re-emitted, stamp entry gone |
| DELETE mapping, token never consumed by this show | Warning persisted, no stamp entry | *(not eligible — correct)* | Nothing to converge: show already reflects no-mapping |
| EDIT then revert before next tick | Any | *(not eligible — correct)* | Content-based predicate sees no net drift; no wasted re-sync |
| Recognize-only mapping (`grants: []`) created | Warning persisted | (b) | Warning consumed, stamp entry `{token, grants: []}` (overlay consumes any mapped token, `lib/sync/roleMappingOverlay.ts:72-98`; stamp records it, `phase2.ts:295`); exact-match `[] = []` → predicate self-clears |

Guard conditions (every input's null/empty/malformed case):

- `applied_role_mappings` **null** (legacy row / nothing consumed): no stamp drift possible — direction (a) is vacuously false; direction (b) still applies.
- `applied_role_mappings` **malformed** (non-array, entry not `{token: string, grants: array}`): treat as **eligible** — a re-sync rewrites the stamp from a fresh parse, self-healing the corruption. (Deliberately the opposite of the publish gate's fail-closed refusal: the publish gate must never publish on corrupt evidence; the drift scanner's re-sync is exactly the heal.)
- `parse_warnings` **null/malformed/entries without `roleToken`**: those entries simply never match direction (b); no eligibility. **Legacy-warning carve-out (adversarial R1 F2):** shows whose last processed sync predates the `roleToken` field (feat/extend-role-scope-vocab, merged 2026-07-16) carry `UNKNOWN_ROLE_TOKEN` warnings WITHOUT `roleToken` — those shows are deliberately outside direction (b) until their next processed sync (sheet edit, manual sync, or a direction-(a) rescue) rewrites `parse_warnings` with `roleToken`-carrying entries, after which drift eligibility engages normally. No backfill: fabricating `roleToken` from legacy warning text (message-string parsing) is fragile, and the admin's mapping-creation affordance sits on `roleToken`-carrying warnings anyway, so the show that prompted the mapping is never in the legacy class for that token. Behavior pinned by a test (§6 item 1).
- `role_token_mappings` **empty table**: direction (b) joins to nothing; direction (a) flags any show with a non-empty stamp (all its consumed tokens were deleted) — correct.

### 3.2 Where it runs — batch pre-pass per cron tick

One read-only SQL query, computed **once per cron tick** in `runScheduledCronSync` (`lib/sync/runScheduledCronSync.ts:3580`), adjacent to the existing `list-live-shows` phase work (`:3663-3668`), returning the set of drift-eligible `drive_file_id`s. Execution follows the `listPostgresLiveShows` precedent (`:2115-2139`): tick-level postgres.js client against `DATABASE_URL`, `archived = false AND published = true` filter (§3.1 ownership bound), closed in `finally`. It is **not** a supabase-js call site — outside `tests/auth/_metaInfraContract.test.ts` scope by construction, same as the in-tx vocabulary loader (`:3441-3442` states this precedent).

The SQL lives inline in a new module `lib/sync/roleVocabDrift.ts` (exact-match containment-both-ways over `jsonb_array_elements` of the stamp, plus the warnings join). **No migration**: no DDL, no new SQL function, so no schema-manifest regen and no validation-project apply are needed.

**Failure posture:** a query fault during the pre-pass must not kill the cron tick. Typed catch → `log.warn` with durable forensic code `ROLE_VOCAB_DRIFT_SCAN_FAILED` (`persist: true`, `source: "cron/sync"`) → treat the set as empty for this tick. Convergence degrades to the status quo (next tick retries the scan; manual sync remains the lever). This is a discriminated, logged degrade — not a silent `continue` — satisfying invariant 9's posture for a read-only availability-over-freshness surface (mirror of the staging loader's best-effort-`[]` posture noted at `lib/onboarding/roleMappingsFreshnessGate.ts:15`). The forensic code is app_events-only (never user-visible), so it is **not** a §12.4 catalog row; it must not collide with the `REPORT_*` namespace (M8 scanner rule).

**Observability:** when the set is non-empty, one `log.info` with durable code `ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE` (`persist: true`), carrying the count and the `drive_file_id` list (Drive file ids are not PII; no emails, no tokens). Each actual re-sync then produces its normal `sync_log` rows — the convergence is queryable via `pnpm observe synclog`.

### 3.3 Threading — gate disjunct, cron mode only

- `runScheduledCronSync` passes the computed set through `ProcessOneFileDeps` (`:488` — the existing injection surface) as a new optional readonly member, e.g. `roleVocabDriftEligibleIds?: ReadonlySet<string>`.
- `prepareProcessOneFile` (`:2779`) derives the per-file boolean (`set.has(driveFileId)`) and passes it to `perFileProcessor` (`lib/sync/perFileProcessor.ts:165`) via a new optional trailing options parameter. Absent everywhere else — `runManualSyncForShow`, `runPushSyncForShow`, `runOnboardingScan`, `retrySingleFile` never set it, so their behavior is byte-identical.
- Inside the gate, the disjunct rescues **exactly one** skip: the final plain watermark skip at `perFileProcessor.ts:214-218`, and only for `mode === "cron"`, and only when **no live `pending_syncs` gate row exists** for the file (adversarial R1 F1). The effective watermark is `maxTimestampMs(shows.last_seen_modified_time, pending_syncs.staged_modified_time)` (`:194-197`) — two sources with different meanings. The drift rescue suppresses only the `shows.last_seen_modified_time` side: a live `pending_syncs` row means a staged parse is awaiting admin review, and cron must never mutate live state out from under that review. The gate already reads the live pending-sync row (`readLivePendingSyncGateRow`, `:187`); the rescue condition is simply `pendingSync == null` (when a live row exists but `staged_modified_time` is below `fileMeta.modifiedTime`, the watermark doesn't skip anyway — no rescue needed). Staged-row convergence stays owned by the staging-overlay rescan heal (§3.4 last paragraph). Everything above the watermark skip keeps precedence unchanged — deferral skips (`:176-183`; an admin's defer decision is never overridden by vocab drift), archived silent-skip (`:191-193`), `sheet_unavailable` recovery proceed (`:199-201`), `asset_recovery` proceed (`:203-206`), `partial_failure_restage_required` skip (`:207-212`). The push-mode `WEBHOOK_NOOP_ALREADY_SYNCED` reason (`:217`) is untouched: push fires on Drive changes, where the watermark logic is already correct, and the flag is never threaded there.
- A rescued file proceeds in **normal automatic mode** (`{ outcome: "proceed", mode: "cron" }`): full pipeline, same per-show advisory lock acquired by `processOneFile` via `withPostgresSyncPipelineLock` (`runScheduledCronSync.ts:1839`) — the pre-pass itself is read-only and runs at tick level outside any lock, so **no advisory-lock topology change and no new holder** (invariant 2).
- **Equal-watermark apply (adversarial R3 F1).** Getting past the preflight gate is not sufficient: the locked apply's stale CAS uses `staleGuardForMode` (`lib/sync/phase2.ts:217-219`) — `strict_less_than` for cron/push, so an unchanged sheet (`binding.modifiedTime` equal to the stored watermark) updates no row and the run ends `stale`, rewriting nothing. The rescue therefore threads a **`driftResync` marker** alongside the proceed outcome (prepare → pipeline → Phase 2 args), and a drift-rescued cron run uses the **`less_than_or_equal`** guard — the exact guard manual mode already uses on this same locked path (`:218`), which is the shipped proof that an equal-watermark re-apply is safe under the per-show lock. Race posture is unchanged by the relaxation: a concurrent real edit advances the stored watermark past `binding.modifiedTime`, the `<=` CAS then fails, and the run ends `stale` exactly as today; the stale code stays `STALE_WRITE_ABORTED` (`:221-224`). Additionally, a drift-rescued run **re-verifies inside the locked transaction** (adversarial R3 F1 + R4 F1) that ALL THREE of the pre-pass/preflight conditions still hold — the pre-lock reads leave a gate→lock window in which any of them can flip under the same show advisory lock: (i) **no live `pending_syncs` row** (concurrent staging; preflight read at `perFileProcessor.ts:187` is pre-lock), (ii) **`shows.published = true`** (`unpublish_show` flips it under the show lock without creating any pending row — the eligibility bound alone cannot survive the window), and (iii) **`shows.archived = false`** (archive flips under the lock the same way — same race shape, swept per the class-sweep rule). If any check fails, the run exits with a benign skip before Phase 2, rewriting nothing. The `driftResync` marker is never set by push, manual, onboarding, or retry paths.

### 3.4 Convergence and self-clearing

A rescued re-sync re-reads the unchanged sheet, re-parses, applies the overlay under the **current** vocabulary (loader at `runScheduledCronSync.ts:3444-3450`), rebuilds `role_flags` from the parse (downward-capable — staging-overlay spec §3.4), rewrites `parse_warnings` and the stamp. After the apply, neither predicate direction matches → the show drops out of the set at the next tick. Steady-state telemetry stays silent: the `ROLE_TOKEN_MAPPED` delta gate compares against prior-persisted state (`lib/sync/roleMappingOverlay.ts:109-154`), and narrow/delete re-syncs change flags, which is exactly the delta the gate exists to surface.

**Accepted residual — non-self-clearing defect loop:** if a persisted `UNKNOWN_ROLE_TOKEN` warning carries a mapped token but the overlay cannot consume it (corrupt/missing `blockRef` anchor — the fail-closed branch at `roleMappingOverlay.ts:81-84`), the warning persists after re-sync and the show stays eligible every tick. This is a defensive-only path (warning and anchor are produced by the same parse); the cost is one bounded re-parse of that show per tick, and it is observable (repeating `ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE` + `sync_log` rows for the same id). Accepted and documented; no suppression state is added for a path that should never occur.

**Out of scope by prior ownership:** staged rows / wizard-held shows converge via the staging-overlay rescan heal and the publish freshness gate (`RESCANNABLE_CAS_CODES`, staging-overlay spec §3.5); a parse that fails re-application retries next tick exactly as any failed sync does today (watermark not advanced on failure).

## 4. Completeness matrix (layer × action)

| Layer | Action |
|---|---|
| Table DDL | N/A — no schema change; predicate reads existing columns |
| Migrations / schema manifest / validation apply | N/A — no migration in this diff |
| SQL predicate | New inline read-only SQL in `lib/sync/roleVocabDrift.ts` (tick-level postgres.js, `listPostgresLiveShows` pattern) |
| Cron read path | `runScheduledCronSync`: pre-pass call + set threading via `ProcessOneFileDeps` |
| Gate | `perFileProcessor`: optional trailing param; disjunct rescues only the `:214-218` cron watermark skip |
| Locked apply (Phase 2) | `driftResync` marker → `less_than_or_equal` stale guard for drift-rescued cron runs only (`phase2.ts:217-219`); in-lock re-verification of no-live-`pending_syncs` + `published=true` + `archived=false` → benign skip |
| Push / manual / onboarding / retry paths | Untouched — param never passed; behavior byte-identical |
| RPC / triggers / cleanup | N/A — none touched |
| Frontend / UI | N/A — no UI surface (invariant 8 does not engage) |
| Telemetry | Two forensic app_events codes (`ROLE_VOCAB_DRIFT_SCAN_FAILED` warn, `ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE` info), both `persist: true`; no §12.4 rows; no new mutation surface (invariant 10: cron route already instrumented; this is read-path telemetry inside an existing surface) |
| Tests | §6 |
| Docs | BACKLOG.md status line on `BL-ROLE-VOCAB-MAPPING-CONVERGENCE`; staging-overlay spec §3.4 gains a pointer line (window now bounded by next cron tick) |

## 5. Flag lifecycle / zombie-flag check

No new boolean config field or toggle. The threaded set/boolean is a per-tick in-memory value: **storage** none · **write path** cron tick pre-pass · **read path** `perFileProcessor` gate · **effect** watermark-skip suppression. All four columns non-empty; not a zombie.

## 6. Testing

All test names below are illustrative; the plan pins exact files/names. No UI → no Playwright layout/transition tasks (dimensional invariants and transition inventory are N/A — no rendered surface).

1. **Predicate (DB-bound, `TEST_DATABASE_URL` loopback-guarded like existing DB suites):** seed `shows` + `shows_internal` + `role_token_mappings`; assert eligibility for each §3.1 matrix row — create / broaden / narrow / delete-consumed / delete-unconsumed(not eligible) / edit-revert(not eligible) / recognize-only equal(not eligible) / null stamp / malformed stamp(eligible) / warning without `roleToken`(not eligible — pins the R1 F2 legacy carve-out) / archived excluded / **`published = false` excluded even with stamp drift and no live `pending_syncs` row (pins the R2 F1 ownership bound — a held show is never drift-rescued)**. Anti-tautology: expected eligibility derives from the seeded fixture rows, never from re-running the predicate's own logic in JS.
2. **Gate unit tests (`tests/sync/perFileProcessor.test.ts` fake-supabase pattern):** cron + at-watermark + flag true → `{ outcome: "proceed", mode: "cron" }`; **cron + flag true + live `pending_syncs` row at/after modifiedTime → still `{ outcome: "skip", reason: "watermark" }` (pins R1 F1 — drift never bypasses pending review)**; flag true does NOT override deferral / archived / `partial_failure_restage_required` skips; push mode with flag never threaded keeps `WEBHOOK_NOOP_ALREADY_SYNCED`; flag absent → existing behavior (regression).
3. **Pin-test revision (the sanctioned revisit — backlog: "revisit it with any watermark change"):** rewrite the drift-window pin at `tests/sync/perFileProcessor.test.ts:334-356` to pin the NEW topology: (a) cron at-watermark WITHOUT the flag still skips (`reason: "watermark"`); (b) cron at-watermark WITH the flag proceeds; (c) manual unconditional bypass unchanged. Failure mode caught: someone re-tightens the gate and silently reopens the indefinite drift window, or breaks the manual lever.
4. **Cron threading (injected-deps `runScheduledCronSync` tests):** injected drift scanner returning `{file-1}` → `processOneFile` receives the set and file-1 proceeds despite unchanged modtime; scanner returning empty set → tick byte-identical to today; scanner throwing → tick completes, `ROLE_VOCAB_DRIFT_SCAN_FAILED` emitted with `code` on the log call (AST-verifiable arg position), set treated as empty.
5. **Self-clear integration (DB-bound):** narrow a consumed mapping → predicate flags the show; simulate the re-sync apply rewriting stamp + warnings → predicate no longer flags it on the second evaluation.
6. **Equal-watermark apply (R3 F1 — the finding's own test):** a drift-rescued cron run over an UNCHANGED sheet returns `outcome: "applied"` and actually rewrites `crew_members.role_flags`, `shows_internal.parse_warnings`, and `shows_internal.applied_role_mappings` — not merely that the gate proceeds. Counterparts: equal-modtime cron WITHOUT `driftResync` stays `stale` (strict guard regression); concurrent watermark advance past `binding.modifiedTime` → drift-rescued run ends `stale` (`STALE_WRITE_ABORTED`); in-lock live `pending_syncs` row discovered → benign skip, nothing rewritten; **unpublish-race (R4 F1): pre-pass marks the file eligible, `unpublish_show` commits before the cron lock is acquired → in-lock `published` recheck fails → benign skip, no rows rewritten; archive-race counterpart identically.**

## 7. Meta-test inventory (declared per writing-plans rule)

- `tests/auth/_metaInfraContract.test.ts`: **no new registry row** — the pre-pass is postgres.js, not a supabase-js call site (same by-construction exemption as the vocabulary loader, `runScheduledCronSync.ts:3441-3442`).
- `tests/auth/advisoryLockRpcDeadlock.test.ts`: **untouched** — no new lock holder; pre-pass is lock-free read at tick level; rescued files use the existing single holder (`withPostgresSyncPipelineLock`).
- `lib/audit/noGlobalCursor.ts` + `watermark-symbols.generated.ts`: **no new gating watermark symbol** — the predicate is content-based (no timestamp comparison; `role_token_mappings.updated_at` is deliberately unused). The plan verifies the audit suite passes unmodified; if the scanner flags the new module, the fix is to keep timestamps out of the predicate, not to allowlist one.
- `tests/log/_metaMutationSurfaceObservability.test.ts`: **no new mutation surface** (no new route/action; cron route pre-exists).
- Sentinel-hiding / admin-alert-catalog / no-inline-email meta-tests: N/A — no tile rendering, no `admin_alerts` codes, no email handling. (The new module lives in `lib/sync/` — the no-inline-email guard scans it; the predicate contains no `.toLowerCase()`/`.trim()` calls, and any incidental one must carry `// canonicalize-exempt`.)

## 8. Do-not-relitigate preempts

- **Why not `role_token_mappings.updated_at` in the watermark (the backlog's first candidate):** timestamp participation misses DELETEs entirely (`max(updated_at)` over remaining rows), re-processes every show on any edit (rejected D2), and would introduce a new authoritative gating watermark symbol into the AC-X.4 audit surface. The content predicate needs no clock and self-clears. Decided at D3/D4.
- **Why not reuse `shows.requires_resync`:** that flag is the unarchive catch-up publish-blocker (`20260601000000_b2_show_lifecycle.sql:8`, `lib/showLifecycle/unarchiveShow.ts:16`), cleared on successful apply (`runScheduledCronSync.ts:1475,1502`, `runManualSyncForShow.ts:454`). Drift eligibility must NOT block publish (the freshness predicate already owns publish gating) and must not be a persisted mark (mark-based = rejected approach B). Reusing it would conflate two lifecycles.
- **Fail-open pre-pass posture is deliberate** (§3.2): read-only availability-over-freshness degrade with a persisted forensic code; the publish freshness gate keeps its opposite fail-closed posture. Both postures are quoted from shipped precedent (`roleMappingsFreshnessGate.ts:12-15`).
- **The pin-test rewrite is sanctioned**, not a regression: the backlog entry itself says the test is "pinned … revisit it with any watermark change," and the test's own comment block (`perFileProcessor.test.ts:327-333`) pins the *documented window*, which this feature is narrowing by design.
- **Exact-match predicate is intentionally NOT the publish predicate:** containment (`role_mappings_stamp_satisfied`) answers "may this publish?" (broadened is fine); exact-match answers "is this stale?" (broadened is stale). Two predicates, two questions; no drift risk because the drift predicate is derived-read-only and has no publish authority.

## 9. Non-goals

- No settings-action changes (`app/admin/settings/_actions/roleTokenMappings.ts` untouched).
- No queue/mark tables; no new columns; no migrations.
- No change to watermark semantics (`shows.last_seen_modified_time` meaning, its advancement rule, or any AC-X.4 symbol). The drift-rescued `<=` stale guard (§3.3) relaxes one CAS comparison for one marked run type — it never moves the watermark (an equal-value apply rewrites derived state; the stored timestamp value is unchanged) and never alters the guard for unmarked runs.
- No immediate-convergence path; no UI affordance ("N shows pending re-sync" stays a future idea).
- No change to push, manual, onboarding-scan, or retry behavior.
- No §12.4 catalog rows (forensic codes only).
- No legacy-warning backfill: pre-`roleToken` persisted warnings converge via the show's next processed sync, not via fabricated tokens (§3.1 guard, R1 F2).
- No override of the pending-review hold: a live `pending_syncs` row always keeps its watermark skip (§3.3, R1 F1).
- No drift rescue for unpublished/held shows: eligibility is bounded to `published = true` (§3.1, R2 F1) — held-show freshness is the publish gate's job.

## 10. Numeric sweep / consistency

Two forensic codes (§3.2, §4 telemetry row — same two names). One rescued skip site (`perFileProcessor.ts:214-218`, cited identically in §1, §3.3, §4). Stamp shape `[{token, grants}]` cited from `phase2.ts:289-301` in §3.1 and §3.4 consistently. Zero migrations (§3.2, §4, §9 agree). Grants closed vocabulary `A1/V1/L1/FINANCIALS` appears once (§3.1) and matches `20260716000000_role_token_mappings.sql:16` and `GRANTABLE_FLAGS` (`roleMappingOverlay.ts:4`).
