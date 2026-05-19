# Handoff — X.4: No global cursor — positive invariant audit (AC-X.4)

**Handed off:** 2026-05-19 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md "X.\* — Cross-cutting" row — backend audit + small helper refactor; no UI surface).
**Adversarial reviewer:** Opus 4.7 / Claude Code (reviewer-pairing logic — Codex implements → Opus reviews, per ROUTING.md + memory `feedback_iterate_until_convergence.md`). Two consecutive R1 APPROVE convergences (X.2, X.3) preceded this task — Codex is calibrated; expect 1–2 rounds.
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md` — Task X.4 only (lines 1459–~1900).

> X.4 is the fourth of six cross-cutting audit tasks (X.1–X.6). No §A/§B split — backend test/audit infrastructure (three-layer audit: schema + token-aware AST + semantic data-flow; Postgres DDL event trigger; ~15 regression fixtures; CI workflow extension; spec ↔ plan parity assertion). UI hard rule N/A — no file under `app/` (outside `app/api/**`), `components/`, or design tokens is mutated.

> **X.4 is the structural enforcement of AGENTS.md §1.4 — "No global sync cursor."** Per spec §3.2 / §5.2: there is no global `lastPollAt`-shape watermark; each show is tracked via `shows.last_seen_modified_time`. M6-era enforcement is an ad-hoc `! rg "lastPollAt" ...` grep. X.4 replaces that with three-layer structural enforcement: (1) `information_schema.columns` allowlist over the live database; (2) ts-morph token-aware AST identifier audit (catches `lastWatermark`, `globalCursor`, `app_state.last_processed_at`, `process.env.LAST_WATERMARK`, etc. — entire token-family, not just the `lastPollAt` literal); (3) semantic data-flow audit walking the call graph from `SYNC_ENTRY_POINTS` and resolving every watermark-shape comparison's operand to a per-row column or rejecting it. Plus a Postgres DDL event trigger that rejects new watermark-named columns on any `public` schema table.

> **X.4 catches the bug classes X.1 / X.2 / X.3 cannot.** X.1 enforces catalog parity; X.2 enforces no raw codes in UI; X.3 enforces auth-chain dominance over protected sinks. None of those audit the watermark surface. X.4's semantic-layer audit catches the canonical bug class (per plan ~line 1461): an implementer introduces a singleton sync checkpoint under a domain-neutral name like `processedAt` / `runStartedAt` / `checkpoint` on `app_settings`, slipping past every name-based check while still being a global cursor. The semantic layer rejects this regardless of naming because the operand resolves to `from('app_settings')` (singleton-table read) instead of `from('shows').eq('id', showId)` (per-row).

> **Derive from spec, not from handoff** (NEW memory `feedback_audit_derives_from_spec_not_handoff.md`, codified 2026-05-19 after X.3 R1 caught the 21-vs-19 admin-tables drift). X.4 enumerates `AUTHORITATIVE_GATING_WATERMARKS` + `DISPLAY_ONLY_TIMESTAMPS` from spec §X.4 prose at AUDIT-EXECUTION time, NOT from a handoff array. The handoff may cite expected symbols for context, but the audit MUST NOT assert against those copies — the audit derives from the canonical spec body. A spec amendment that adds a new watermark column (rare but possible) must be picked up automatically; an audit that hardcodes the lists silently goes stale.

> **X.3 R1 close-out residuals roll into X.4 as a helper refactor.** X.3's three non-blocking nits — `sameFixtureFamily` substring escape (`lib/audit/authPrimitives.ts:473-475`), `inferFixtureDomain` path-substring fixture-name coupling (`authPrimitives.ts:729-733`), `findRequestEntries` `lowerPath.includes("bad-loading")` etc. (`authPrimitives.ts:285-303` per X.3 review) — all share the same root cause: production-audit code branching on fixture filenames. X.4 refactors all three to AST-aware or unique-key-based discrimination (e.g., explicit allowlist injection in the test, fixture-domain inference via per-fixture metadata JSON or convention-via-AST). LAND in X.4; do not defer.

> **Same-model self-review pattern (X.1 R2 lesson, attenuated by X.2 / X.3 R1 wins).** X.1 (R3 close): same-model self-review missed 2 P0 + 4 minor. X.2 / X.3 (R1 close): Codex calibrated. X.4 expected 1–2 rounds. Highest-risk pre-emptable failure modes — verify before claiming done: (a) spec-§X.4-prose-driven extraction of both symbol sets; (b) semantic-layer precheck that throws on unresolved / ambiguous `SYNC_ENTRY_POINTS` (a renamed entry MUST fail loudly, not silently skip); (c) the three X.3 helper-refactor surfaces; (d) JSONB-path expression normalization for `shows.diagrams->>snapshot_revision_id`.

---

## 1. Spec sections in scope

Exhaustive, not representative.

- **§3.2** — "There is no global `lastPollAt` cursor anywhere in the system. Each show is tracked independently via `shows.last_seen_modified_time`." (spec line 118).
- **§4.1** — `shows.last_seen_modified_time` column definition + `pending_syncs.{staged_modified_time, base_modified_time, staged_id, parsed_at}` + `pending_ingestions.{last_attempt_at, first_seen_at}` + `deferred_ingestions.{deferred_at, deferred_at_modified_time}` (spec line 182 + ~line 503).
- **§5.2** — Per-show watermark contract: "no global watermark; each show is tracked independently via `shows.last_seen_modified_time`" (spec line 939). The cron lists every sheet (folder-scoped `files.list`, no `modifiedTime` filter); per-file decisions use per-show `last_seen_modified_time` (spec line 966).
- **§5.4 / §9.0 / §9.2** — `shows.last_synced_at` / `pending_syncs.parsed_at` / `pending_ingestions.last_attempt_at` / `pending_ingestions.first_seen_at` / `deferred_ingestions.deferred_at` are DISPLAY-ONLY rendered to operator; never gate writes.
- **§5.5.1** — `drive_watch_channels.{expires_at, activated_at, superseded_at, stopped_at, created_at}` lifecycle columns (per-channel; gates webhook activation).
- **§6.8.1 / §6.8.2** — Apply-time CAS: `shows.last_seen_modified_time IS NOT DISTINCT FROM pending_syncs.base_modified_time`. Discard-time CAS: `pending_syncs.staged_id`. Both are sync-decision entry points covered by `SYNC_ENTRY_POINTS`.
- **§6.11** — Snapshot-stability JSONB-path expression `(shows.diagrams ->> 'snapshot_revision_id')::uuid = reviewed_revision_id`. The audit MUST recognize the JSONB-path form as a member access into `AUTHORITATIVE_GATING_WATERMARKS`, not just bare column references.
- **§7 / §6.11** — Per-row tokens `embeddedFingerprint` / `sheetsRevisionId` (revision-pin verification).
- **§4.5** — `deferred_ingestions.deferred_at_modified_time` (per-file).
- **§17.2** — AC-X.4 verbatim. AC-X.6 verbatim CI status check name `x4-no-global-cursor` + the cross-cutting AC-X.4 spec ↔ plan parity assertion (`AUTHORITATIVE_GATING_WATERMARKS` and `DISPLAY_ONLY_TIMESTAMPS` symbol sets in spec §X.4 prose MUST match those in Plan Task X.4 step 1; build fails on column-name drift).
- **AGENTS.md §1.4** — "No global sync cursor" invariant. X.4 IS the canonical structural enforcement.

## 2. Acceptance criteria

**Primary AC (verbatim from spec §17.2):**

- **AC-X.4** — **No global cursor; gating watermarks are Drive-derived per-row only.** Static analysis (three-layer): (1) no source file references a `lastPollAt`-shape global variable, env var, or table column; (2) sync entry points include `runScheduledCronSync`, `runManualSyncForShow`, `runPushSyncForShow`, `runOnboardingScan`, `retrySingleFile`, `assetRecovery`, `applyStagedParse` (Task 6.11 Apply CAS), and `discardStagedParse` (Task 6.12 Discard CAS); (3) per-row sources are split into `AUTHORITATIVE_GATING_WATERMARKS` (Drive-derived; valid as the RHS of a sync-decision comparison: `shows.last_seen_modified_time`, `pending_syncs.base_modified_time`, `shows.diagrams ->> 'snapshot_revision_id'` (JSONB path), `pending_syncs.staged_modified_time`, `pending_syncs.staged_id`, `fileMeta.modifiedTime`/`driveModifiedTime`/`headRevisionId`/`md5Checksum`, `deferred_ingestions.deferred_at_modified_time`, `drive_watch_channels.{expires_at, activated_at}`) and `DISPLAY_ONLY_TIMESTAMPS` (`shows.last_synced_at`, `pending_syncs.parsed_at`, `pending_ingestions.last_attempt_at`, `pending_ingestions.first_seen_at`, `deferred_ingestions.deferred_at`); a sync-decision read of any `DISPLAY_ONLY_TIMESTAMPS` member fails the audit. The audit fixture set MUST exercise the JSONB-path form. The matcher rule is **driven from the symbol set itself** — a `BinaryExpression` is in scope iff at least one operand resolves to an `AUTHORITATIVE_GATING_WATERMARKS` member regardless of textual shape, AND the audit performs **per-row UUID-CAS coverage** for `pending_syncs.staged_id` and `(shows.diagrams ->> 'snapshot_revision_id')::uuid` (provenance check + coverage sweep) — not just timestamp-shaped operands.

**Task-internal sub-criteria (from plan Task X.4, `11-cross-cutting.md:1459-~1900`):**

- **Symbol-set extractor** at `scripts/extract-watermark-symbols.ts` (new) — parses spec §X.4 prose at audit-execution time and emits `AUTHORITATIVE_GATING_WATERMARKS` + `DISPLAY_ONLY_TIMESTAMPS` + `SYNC_ENTRY_POINTS` as a generated module `lib/audit/watermark-symbols.generated.ts` (mirrors X.3's `admin-tables.generated.ts` pattern). The audit imports the generated manifest; `pretypecheck`/`prelint`/`pretest`/`prebuild` chain to `gen:watermark-symbols`. CI freshness gate: `pnpm gen:watermark-symbols && git diff --exit-code lib/audit/watermark-symbols.generated.ts`. Per memory `feedback_audit_derives_from_spec_not_handoff.md`.
- **Layer 1: Schema audit** (plan ~line 1497-1504) — SELECT against `information_schema.columns` for `public` tables matching `/last_(seen|sync|poll|processed|run|cursor)/` OR `/watermark|cursor/i`. Every returned row MUST be in the union of `AUTHORITATIVE_GATING_WATERMARKS` + `DISPLAY_ONLY_TIMESTAMPS` (plus auth/quota timestamps explicitly out-of-scope: `crew_member_auth.*`, `link_sessions.*`, `report_rate_limits.hour_bucket`, `sync_log.occurred_at`, etc.). `app_settings` MUST NOT contain any column matching the heuristic. Audit fails on any new column without an allowlist entry. Test harness: use a Supabase test client OR parse `supabase/migrations/` + `supabase/tables/` for the live schema.
- **Layer 2: Token-aware AST identifier audit** (plan ~line 1505-1612) — ts-morph `Project({ tsConfigFilePath: 'tsconfig.json' })` enumerates every TS/TSX file. For each `Identifier` + `StringLiteral` + `NoSubstitutionTemplateLiteral` node, tokenize (`camelCase` → `['camel','case']`; `snake_case` / kebab / dot → tokens; lowercase). Reject if tokens form a superset of any `BANNED_COMBOS` entry (per plan ~line 1524-1531: `['last','watermark']`, `['global','watermark']`, `['last','cursor']`, `['global','cursor']`, `['last','poll']`, `['last','sync','at']`, `['last','run']`, `['last','processed']`, `['watermark','at']`, `['cursor','at']`, `['app','watermark']`, `['app','cursor']`) UNLESS qualified reference is in `ALLOWED_REFS` (the union set from Step 1). Property accesses normalize to `'object.property'`; element accesses use full text. Fixtures live under `tests/cross-cutting/fixtures/no-global-cursor/` and are EXCLUDED from the audit's source-file walk via tsconfig `exclude` (so bad fixtures don't trip the audit on the live tree).
- **Layer 3: Semantic data-flow audit** (plan ~line 1636-1843) — for each entry point in `SYNC_ENTRY_POINTS` (8 entries: `runScheduledCronSync`, `runManualSyncForShow`, `runPushSyncForShow`, `runOnboardingScan`, `retrySingleFile`, `assetRecovery`, `applyStagedParse`, `discardStagedParse`), build a transitive call graph and walk every BinaryExpression. **Matcher rule** (plan ~line 1820): a BinaryExpression is in scope iff at least one operand resolves (via `resolveSourceOfValue`) to a member access into `AUTHORITATIVE_GATING_WATERMARKS` — regardless of whether the operand name contains `modified_time`. Audit recognizes the JSONB-path expression form `(shows.diagrams ->> 'snapshot_revision_id')::uuid` and normalizes to `'shows.diagrams->>snapshot_revision_id'`. **Audit checks** (plan ~line 1821-1822): **(a) Other-operand provenance** — the OTHER operand MUST derive from a reviewed/staged-context input (function parameter, route param, payload field, another already-CAS'd watermark), NOT from a fresh `from(<sameTable>).select(<col>)` read in the same data-flow lineage (that collapses CAS to "compare a row to itself"). **(b) Coverage sweep** — every `AUTHORITATIVE_GATING_WATERMARKS` member read by an entry point MUST be CAS'd against the reviewed/staged context value before reaching a write sink (UPDATE / DELETE / UPSERT). A field that's READ but never CAS'd is a violation. **Display-only check preserved** — a sync-decision comparison reading any `DISPLAY_ONLY_TIMESTAMPS` member throws with the canonical message at plan ~line 1670-1674.
- **Forbidden source kinds** (plan ~line 1731-1743): `isAppSettingsRead`, `isSingletonTableRead`, `isEnvVarRead` (`process.env.X` / `import.meta.env.X` / `Deno.env.get('X')`), `isModuleLevelMutableConst`. Anything resolving to one of these fails regardless of variable name. Unresolvable sources (`as any` escape) fail closed.
- **Sync-entry-point precheck** (plan ~line 1745-1779) — HARD FAILURE on zero declarations OR multiple declarations for any `SYNC_ENTRY_POINTS` member. Emits `AC-X.4 semantic-layer precheck failed — unresolved sync entry points (zero declarations): <names>` or `ambiguous sync entry points (multiple declarations): <name> (N matches)`. Regression fixtures `bad-missing-entry-point.fixture` + `bad-ambiguous-entry-point.fixture` + `bad-missing-applyStagedParse-entry-point.fixture` + `bad-missing-discardStagedParse-entry-point.fixture` all throw at precheck.
- **Layer 4 (defense-in-depth): Postgres DDL event trigger** (plan ~line 1845-end) — at `supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql`. Creates `_allowed_watermark_columns` allowlist table seeded with the Step-1 set; an event trigger on `ddl_command_end` rejects any new column whose name matches the watermark heuristic on any `public` table UNLESS the `(table_name, column_name)` pair is in `_allowed_watermark_columns`. Every migration that adds a legitimate per-row watermark column MUST also INSERT into `_allowed_watermark_columns` in the same migration. Audit verifies the trigger exists and the allowlist matches the Step-1 set.
- **Regression fixtures** (plan ~line 1614-1632 layer-2; 1827-1842 layer-3) under `tests/cross-cutting/fixtures/no-global-cursor/`:
  - **Layer 2** (token-aware identifier): `bad-camel.ts` (`lastWatermark`), `bad-snake.ts` (`last_cursor`), `bad-property.ts` (`appState.lastWatermark`), `bad-bracket.ts` (`process.env['LAST_WATERMARK']`), `bad-aliased.ts` (`s.lastWatermark` after alias-import), `bad-component.tsx` (RSC `const lastWatermark = ...`), `bad-page-prop.tsx` (`params.lastWatermark`), `good-allowlisted.ts` (`shows.last_seen_modified_time`), `good-unrelated.ts` (`lastUserAction`), `good-component.tsx` (RSC reads `shows.last_seen_modified_time`).
  - **Layer 3** (semantic data-flow) under `tests/cross-cutting/fixtures/no-global-cursor-semantic/`: `bad-app-settings-cursor.ts` (singleton-table read `from('app_settings').select('processed_at')`), `bad-env-watermark.ts` (`process.env.LAST_WATERMARK`), `bad-module-const-checkpoint.ts` (`export let CHECKPOINT`), `bad-untyped-any.ts` (`(rows[0] as any).runStartedAt`), `good-per-row.ts` (`from('shows').select('last_seen_modified_time').eq('id', showId)`), `good-fileMeta-only.ts`.
  - **Display-only-in-sync-decision**: `bad-display-only-in-sync-decision.fixture` (`applyStagedParse` reads `shows.last_synced_at` as CAS RHS), `bad-display-only-parsed-at.fixture` (`discardStagedParse` reads `pending_syncs.parsed_at`), `bad-display-only-last-attempt-at.fixture` (sync entry compares `pending_ingestions.last_attempt_at` vs `fileMeta.modifiedTime`).
  - **Apply / Discard CAS positive**: `good-apply-cas.fixture` (`pending_syncs.staged_id` + `base_modified_time`), `good-discard-cas.fixture` (`pending_syncs.staged_id`), `good-apply-cas-staged-id.fixture` (UUID-gate positive — `staged_id === reviewedStagedId` from function parameter), `good-discard-cas-staged-id.fixture`.
  - **JSONB-path positive**: `good-asset-route-cas-revision-id.fixture` (`(shows.diagrams ->> 'snapshot_revision_id')::uuid === req.params.rev`), `good-asset-route-cas-head-revision.fixture` (`fileMeta.headRevisionId === pinnedRevisionId`), `good-asset-route-cas-md5.fixture` (`fileMeta.md5Checksum === pinnedChecksum`).
  - **Fresh-read CAS regression**: `bad-uuid-cas-against-fresh-read.fixture` (`applyStagedParse` regenerates RHS via fresh `from('pending_syncs').select('staged_id')` — collapses CAS to row-vs-itself), `bad-uuid-cas-revision-id-against-fresh-read.fixture` (JSONB-path version).
  - **Uncovered gating watermark**: `bad-uncovered-gating-watermark.fixture` (reads JSONB-path expression but never CAS-compares before UPDATE).
  - **Entry-point precheck**: `bad-missing-entry-point.fixture` (renames `runScheduledCronSync` → `runScheduledCronSyncRenamed`), `bad-ambiguous-entry-point.fixture` (two declarations in different files), `bad-missing-applyStagedParse-entry-point.fixture`, `bad-missing-discardStagedParse-entry-point.fixture`.
- **Spec ↔ plan parity assertion** (plan ~line 8019 / spec §17.2 AC-X.6 cross-cutting parity): parses spec §X.4 prose to extract both symbol sets; asserts `setEqual(specSymbols, planSymbols)`. Fails on column-name drift (e.g., `shows.snapshot_revision_id` vs `shows.diagrams->>snapshot_revision_id`; `last_attempted_at` vs `last_attempt_at`; `shows.base_modified_time` vs `pending_syncs.base_modified_time`). Wired into the `x4-no-global-cursor` audit.
- **X.3 helper-refactor surfaces** (X.3 R1 close-out C1/C2/C3 caveats):
  - `lib/audit/authPrimitives.ts:473-475` `sameFixtureFamily` — replace substring-coupled escape with explicit allowlist injection in test (construct distinct `DynamicFromAllowEntry` records per fixture path).
  - `lib/audit/authPrimitives.ts:729-733` `inferFixtureDomain` — replace fixture-path-substring discrimination with explicit per-fixture metadata (sidecar JSON `tests/cross-cutting/fixtures/auth-x3/<fixture>.meta.json` declaring `domain: "crew-session" | "admin" | "me"`) OR rename fixtures so canonical naming infers domain via path semantics (e.g., `auth-x3/me/*.tsx` → `me` domain).
  - `lib/audit/authPrimitives.ts:285-303` (or `lib/audit/trustDomains.ts` `findRequestEntries`) — replace `lowerPath.includes("bad-loading")` etc. with function-name pattern matching ONLY (`function Loading\b`, `function Error\b`, `function NotFound\b`, `function Head\b`, `function Template\b`) OR rename fixtures to canonical filenames (`loading.tsx`, `error.tsx`, etc.). The X.3 review verbatim said: "recommend renaming fixtures to canonical filenames or relying solely on function-name pattern matching to remove the fixture-name coupling."
  - All three refactors land in X.4 commit range. After refactor, re-run `pnpm test:audit:x3-trust-domain` and confirm all 28 X.3 tests still green.
- **CI workflow** exposes the audit as status check `x4-no-global-cursor` verbatim per spec §17.2. Uses canonical artifact-naming pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}` (X.2 R1 codification). Includes the `pnpm gen:admin-tables && git diff --exit-code lib/audit/admin-tables.generated.ts` freshness gate AND the new `pnpm gen:watermark-symbols && git diff --exit-code lib/audit/watermark-symbols.generated.ts` freshness gate BEFORE the audit step.
- **AVOID the X.2 residual substring-matching trap** (also flagged as X.3 watchpoint). The audit walks AST nodes + exact-value matching against the literal `lastPollAt` (the defense-in-depth secondary check per plan ~line 1634); BANNED_COMBOS tokenize first then check superset — no `text.indexOf` substring sweep over file contents.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [x] Amendment 1 — `listForRepo` recovery contract — **N/A — M8-only.**
- [x] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8-only.**
- [x] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8-only.**

X.4 audits sync-cursor surfaces; none of the three §13.2.3 amendments touch sync gating. Other amendments (2026-05-12 AGENDA, 2026-05-14 admin-allowlist, 2026-05-19 §12.4 catalog cleanup) are also not in scope.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0..M10 closed. X.1 closed at `2090dc2`. X.2 closed at `84af646`. X.3 closed at `d4775f9`. M11 Phase A in-flight commits at HEAD (Phase A's `app/help/**` work is parallel and does NOT touch sync-cursor surfaces).
- [x] **Pre-flight tests passing in isolation**:
  - `pnpm lint` exits 0 (four pre-existing M7 `<img>` warnings carry forward).
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0.
  - `pnpm test:audit:x1-catalog-parity` exits 0.
  - `pnpm test:audit:x2-no-raw-codes` exits 0.
  - `pnpm test:audit:x3-trust-domain` exits 0 (28 tests).
  - `pnpm verify:spec-amendment` exits 0.
- [x] **Specific files present from prior milestones**:
  - `lib/audit/admin-tables.generated.ts` + `scripts/generate-admin-tables.ts` (X.3-shipped). X.4 mirrors this pattern for `watermark-symbols.generated.ts`.
  - `lib/audit/authChain.ts` + `lib/audit/trustDomains.ts` + `lib/audit/protectedRoutes.ts` + `lib/audit/authPrimitives.ts` (X.3-shipped) — X.4 refactors the three helper surfaces listed in §2.
  - `lib/messages/__internal__/walkSourceFiles.ts` (X.1-shipped) — X.4 reuses for source-file enumeration.
  - `tests/cross-cutting/auth.test.ts` (X.3-shipped, 28 tests) — must still pass after the helper refactor.
  - `.github/workflows/x-audits.yml` (X.1/X.2/X.3-shipped) — X.4 extends with `x4-no-global-cursor` job + the watermark-symbols freshness gate.
  - `tsconfig.json` — X.4 extends `exclude` to add `tests/cross-cutting/fixtures/no-global-cursor*` so the audit's own bad fixtures don't trip the live-tree walk.
- [x] **NEW X.4 deliverables**:
  - `scripts/extract-watermark-symbols.ts` — parser for spec §X.4 prose; emits `lib/audit/watermark-symbols.generated.ts` (`AUTHORITATIVE_GATING_WATERMARKS`, `DISPLAY_ONLY_TIMESTAMPS`, `SYNC_ENTRY_POINTS`, `BANNED_COMBOS` derived from spec).
  - `lib/audit/watermark-symbols.generated.ts` — committed `readonly` sets; `// @generated` header; eslint override entry.
  - `lib/audit/noGlobalCursor.ts` — the three-layer audit (schema + token-aware AST + semantic data-flow). Or split into `lib/audit/noGlobalCursor/{schema,tokenAst,semantic}.ts`.
  - `tests/cross-cutting/no-global-cursor.test.ts` — the CI gate `x4-no-global-cursor`.
  - `tests/cross-cutting/fixtures/no-global-cursor/` — layer-2 fixtures (~10).
  - `tests/cross-cutting/fixtures/no-global-cursor-semantic/` — layer-3 fixtures (~15).
  - `supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql` — DDL event trigger + `_allowed_watermark_columns` table.
  - `package.json` script entries: `gen:watermark-symbols`, `test:audit:x4-no-global-cursor`. `pretypecheck`/`prelint`/`pretest`/`prebuild` chained to BOTH `gen:admin-tables` AND `gen:watermark-symbols`.
  - `.github/workflows/x-audits.yml` job extension exposing `x4-no-global-cursor` with canonical artifact-naming + dual freshness gates.
  - `eslint.config.js` (or `.eslintrc.json`) override entry for `lib/audit/watermark-symbols.generated.ts`.
  - **REFACTORED FROM X.3 (in same commit range)**: `lib/audit/authPrimitives.ts` `sameFixtureFamily` / `inferFixtureDomain` / `findRequestEntries` path-substring discrimination → AST-aware or per-fixture metadata; sidecar `*.meta.json` files in `tests/cross-cutting/fixtures/auth-x3/` if that's the chosen discriminator; X.3 tests stay green.
- [x] **DEFERRED.md** — no X.4 sub-items pre-listed. Audit findings on the live tree are not expected (the project has never had a global cursor per AGENTS.md §1.4); any mechanical fix lands in X.4 scope per memory `feedback_deferral_discipline.md`.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (invariant 1) — always. Each fixture is failing-test-first.
- [ ] **Per-show advisory lock** (invariant 2) — **N/A.** X.4 makes no DB mutations; the DDL trigger migration is a one-shot schema change with no `pg_advisory*` requirement.
- [ ] **Email canonicalization** (invariant 3) — **N/A.**
- [x] **No global cursor** (invariant 4) — **X.4 IS the canonical structural enforcement.** Replaces M6-era advisory `! rg "lastPollAt"` grep with three-layer audit + DDL trigger.
- [ ] **No raw error codes in user-visible UI** (invariant 5) — **N/A for X.4's own code; structurally enforced by X.2.**
- [x] **Commit per task** (invariant 6) — always. Conventional-commits: `<type>(<scope>): <summary>`. Suggested scopes: `audit`, `cross-cutting`, `scripts`, `test`, `ci`, `migration`. Example commits:
  - `scripts(audit): bootstrap extract-watermark-symbols extractor (Task X.4 Step 1)`
  - `feat(audit): commit lib/audit/watermark-symbols.generated.ts manifest`
  - `feat(audit): layer-1 schema audit over information_schema.columns`
  - `feat(audit): layer-2 token-aware AST identifier audit`
  - `feat(audit): layer-3 semantic data-flow audit with entry-point precheck`
  - `migration(db): no-global-cursor DDL event trigger + allowlist table (Task X.4 Step 4)`
  - `test(cross-cutting): X.4 no-global-cursor audit + ~25 regression fixtures (Task X.4 Step 2)`
  - `refactor(audit): replace X.3 fixture-name-coupling in authPrimitives helpers (X.3 R1 caveats C1/C2/C3)`
  - `ci(audits): wire x4-no-global-cursor as PR-required status check + watermark-symbols freshness gate`
- [x] **Spec is canonical** (invariant 7) — both symbol sets derive from spec §X.4 prose. Parity assertion fails on spec ↔ plan drift.
- [ ] **UI quality gate / impeccable dual-gate** (invariant 8) — **N/A — no UI surface.** X.4 touches `scripts/`, `lib/audit/`, `tests/cross-cutting/`, `.github/workflows/`, `package.json`, `supabase/migrations/`, `eslint.config.js`.
- [x] **Supabase call-boundary discipline** (invariant 9) — **N/A for X.4's own audit code** (audit makes no live Supabase calls; layer 1 reads `information_schema.columns` via the project's existing test client OR static parse of `supabase/migrations/` + `supabase/tables/`). If layer 3 surfaces a §1.9 violation in a sync entry point's call graph (silent `continue`, returned-error not distinguished from thrown-error), route to the owning milestone's meta-test `tests/auth/_metaInfraContract.test.ts`; do not absorb.

## 6. Watchpoints from prior adversarial review

Pulled forward from X.1 R1–R3 + X.2 R1 + X.3 R1 close-out + new 2026-05-19 memories.

1. **Derive from spec at audit-execution time, NOT from handoff arrays** (memory `feedback_audit_derives_from_spec_not_handoff.md`, codified 2026-05-19 from X.3's 21-vs-19 admin-tables drift). The symbol-set extractor parses spec §X.4 prose. Reviewer verifies that editing spec §X.4 + running `pnpm gen:watermark-symbols` produces a diff in `lib/audit/watermark-symbols.generated.ts`; reverting the spec edit and re-running produces no diff (round-trip cleanly). Hardcoded symbol arrays in the audit code are a P0.

2. **AST scoping, NOT substring grep** (X.2 residual, X.3 watchpoint). Tokenize identifiers FIRST, then check superset against BANNED_COMBOS. `BANNED_OUTSIDE_AUTH_LIB`-style `.some(b => v.includes(b))` substring patterns are banned. `ADMIN_FROM_REGEXES`-style bracketed regex containment is fine. Reviewer greps `lib/audit/noGlobalCursor*.ts` for `.includes(` and `.indexOf(` over file text + confirms each hit is exact-value or bounded-regex.

3. **Sync-entry-point precheck MUST throw on missing OR ambiguous declarations** (plan ~line 1745-1779). A renamed entry point that silently skipped audit was the explicit bug class. Fixtures `bad-missing-entry-point.fixture` (rename) + `bad-ambiguous-entry-point.fixture` (duplicate declaration) + the four entry-point variants (`runScheduledCronSync`, `applyStagedParse`, `discardStagedParse`, `runManualSyncForShow`) MUST all throw at precheck. Reviewer reads the precheck code AND verifies the inner-loop defensive backstop (per plan ~line 1786-1791) emits "AC-X.4 invariant violation" if the precheck and resolver ever disagree.

4. **JSONB-path expression normalization** (plan ~line 1820 + spec §X.4 prose). `(shows.diagrams ->> 'snapshot_revision_id')::uuid` normalizes to `'shows.diagrams->>snapshot_revision_id'` (the entry in `AUTHORITATIVE_GATING_WATERMARKS`). The resolver MUST handle the JSONB-path operator chain + parenthesized type cast. Required positive fixture: `good-asset-route-cas-revision-id.fixture`. Reviewer hand-traces the resolver against this fixture.

5. **Provenance check vs coverage sweep are DISTINCT audits** (plan ~line 1821-1822). (a) "Other operand must come from reviewed/staged context, NOT a fresh `from(<sameTable>)` read" — `bad-uuid-cas-against-fresh-read.fixture` exercises. (b) "Every gating watermark read by an entry point MUST be CAS'd against the reviewed context before a write sink" — `bad-uncovered-gating-watermark.fixture` exercises. Both checks MUST be implemented; reviewer verifies neither is a no-op AND neither subsumes the other (a gating field can be CAS'd correctly AND elsewhere read-without-CAS — both audits fire on the second site).

6. **Three X.3 helper-refactor surfaces** (X.3 R1 close C1/C2/C3 caveats). Land in X.4 commit range. After refactor, ALL 28 X.3 tests still pass. Reviewer verifies by re-running `pnpm test:audit:x3-trust-domain` post-refactor. If the refactor breaks any X.3 test, escalate — do not weaken the refactor's discrimination.

7. **Class-sweep code-shape-based** (memory). Layer 2 walks every `.ts`/`.tsx` in the tsconfig program (NOT a hardcoded path array). Reviewer verifies by adding a hypothetical new root directory under `app/` and confirming the audit picks it up automatically.

8. **Same-model-blind-spot pattern** (X.1 R2 lesson, attenuated by X.2/X.3 R1). Pre-emptively self-audit before declaring done. Highest-risk pre-emptable failure modes: (a) spec-prose extraction completeness (every symbol in spec §X.4 ends up in the generated manifest); (b) precheck fires on all four entry-point regression fixtures; (c) helper-refactor preserves X.3 behavior; (d) JSONB-path normalization handles parentheses + `::uuid` cast; (e) provenance vs coverage are independently exercised.

9. **CI artifact-naming + dual freshness gates** (X.2 R1 codification + X.3 freshness pattern). Canonical artifact pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}`. TWO freshness gates: `pnpm gen:admin-tables && git diff --exit-code lib/audit/admin-tables.generated.ts` (inherited from X.3) AND `pnpm gen:watermark-symbols && git diff --exit-code lib/audit/watermark-symbols.generated.ts` (new). `pretypecheck`/`prelint`/`pretest`/`prebuild` ALL chain BOTH `gen:admin-tables` AND `gen:watermark-symbols`.

10. **Cross-cutting parity assertion** (AC-X.6 cross-cutting at ~line 8019). The spec ↔ plan parity for AUTHORITATIVE_GATING_WATERMARKS + DISPLAY_ONLY_TIMESTAMPS is wired and asserted. Reviewer adds a hypothetical column-name drift (e.g., rename `pending_syncs.base_modified_time` → `shows.base_modified_time` in the spec) + re-runs the audit + confirms it fails with a named diff naming the drifted column.

11. **Anti-tautology** (CLAUDE.md). Each bad fixture must have a real failure mode tied to a real sync-cursor shape. Derive expected values from fixture geometry (the `app_settings.processed_at` column name MUST be the one resolved to forbidden-source-kind `isAppSettingsRead`). Spot-check 3 random bad fixtures.

12. **Deferral discipline** (memory `feedback_deferral_discipline.md`). Mechanical fixes land in X.4 scope. Speculative work (e.g., "what if we want to allow `app_settings.last_processed_at` for a specific use case") goes to BACKLOG.md only if there's no current motivation — otherwise open a spec question.

13. **Verify findings against actual code site before patching** (memory `feedback_verify_review_findings_against_external_api_spec.md`). When adversarial review surfaces a finding, read the audit code verbatim AND read the live sync entry point's call graph (e.g., `lib/sync/runScheduledCronSync.ts` or wherever the canonical entry lives) AND confirm the audit's complaint is real.

14. **Same-vector recurrence rule** (memory). If 3+ rounds surface findings on the same audit vector (e.g., "matcher misses a new sync entry-point shape"), ship a structural defensive layer — e.g., make `SYNC_ENTRY_POINTS` derive from a registry parsed out of `lib/sync/` rather than a hardcoded array.

## 7. Test commands

- **X.4 audit:** `pnpm test tests/cross-cutting/no-global-cursor.test.ts` (or `pnpm test:audit:x4-no-global-cursor` after the package.json script entry lands).
- **Watermark-symbols generator idempotency:** `pnpm gen:watermark-symbols && git diff --exit-code lib/audit/watermark-symbols.generated.ts`.
- **Existing X.1/X.2/X.3 gates remain green:** `pnpm test:audit:x1-catalog-parity && pnpm test:audit:x2-no-raw-codes && pnpm test:audit:x3-trust-domain`.
- **DDL event trigger validation:** apply the new migration locally; verify the trigger fires on a synthetic `ALTER TABLE app_settings ADD COLUMN last_processed_at timestamptz` and rejects with the expected error message; verify an `INSERT INTO _allowed_watermark_columns (table_name, column_name) VALUES ('shows', 'last_seen_modified_time')` pre-step lets the legitimate column through.
- **Type + lint + full test gate (final):** `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings (the four pre-existing M7 `<img>` warnings carry forward).
- **CI workflow check:** `.github/workflows/x-audits.yml` exposes a job named `x4-no-global-cursor` verbatim; runs on `pull_request` + `push` to `main`; includes BOTH freshness gates BEFORE the audit step; canonical artifact naming.

## 8. Exit criteria

- [ ] All sub-steps in `11-cross-cutting.md` Task X.4 (Steps 1–4) checked off.
- [ ] AC-X.4 has at least one passing test asserting each named surface: layer 1 (schema), layer 2 (token-aware AST), layer 3 semantic provenance check, layer 3 coverage sweep, layer 3 display-only check, layer 4 DDL trigger.
- [ ] `scripts/extract-watermark-symbols.ts` derives `AUTHORITATIVE_GATING_WATERMARKS` + `DISPLAY_ONLY_TIMESTAMPS` + `SYNC_ENTRY_POINTS` from spec §X.4 prose at audit-execution time. Hardcoded symbol arrays in the audit code are a P0.
- [ ] `lib/audit/watermark-symbols.generated.ts` is committed with `// @generated` header; `pnpm gen:watermark-symbols && git diff --exit-code` passes; CI regenerate is byte-identical; `eslint.config.js` override entry exists.
- [ ] All ~25 regression fixtures under `tests/cross-cutting/fixtures/no-global-cursor*/` exist and behave as specified. Spot-check the M10-R3-style canonical bug: `bad-app-settings-cursor.ts` (singleton-table read with column name `processed_at` slips past layers 1–2 but fails layer 3 with the canonical `forbidden source 'app_settings.processed_at'` error).
- [ ] Entry-point precheck fires on all four entry-point regression fixtures (`bad-missing-entry-point` for cron + apply + discard + ambiguous variant).
- [ ] JSONB-path expression normalization handled — `good-asset-route-cas-revision-id.fixture` passes; spec ↔ plan parity assertion's drift fixture fails with named diff.
- [ ] Three X.3 helper-refactor surfaces closed: `sameFixtureFamily`, `inferFixtureDomain`, `findRequestEntries` path-substring discrimination → AST-aware or unique-key-based. ALL 28 X.3 tests still green after refactor.
- [ ] Postgres DDL event trigger at `supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql` applies cleanly; rejects a synthetic watermark-named column on `app_settings`; allows a column when its `(table_name, column_name)` pair is pre-inserted into `_allowed_watermark_columns`.
- [ ] M6-era advisory `! rg "lastPollAt"` is retired OR explicitly noted as superseded (whichever fits the current workflow; the literal grep MAY remain as defense-in-depth per plan ~line 1634).
- [ ] CI exposes `x4-no-global-cursor` verbatim. Spot-check `.github/workflows/x-audits.yml`. Artifact name uses canonical pattern. BOTH freshness gates run BEFORE the audit step.
- [ ] `pretypecheck` / `prelint` / `pretest` / `prebuild` ALL chained to BOTH `gen:admin-tables` AND `gen:watermark-symbols` in `package.json`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings.
- [ ] No new `// TODO` or `// FIXME` lines.
- [ ] Adversarial review converged to APPROVE (Opus reviewer; expected R1–R2 per lineage trend).
- [ ] All commits follow `<type>(<scope>): <summary>` format with one logical task per commit.
- [ ] Convergence log at the bottom of this file is filled in.

## 9. Sandbox / git protocol

- [x] **Codex CLI with relaxed sandbox** — verified working through X.1 / X.2 / X.3. Commits run in-session.
- **Invocation discipline (memory `feedback_codex_exec_needs_stdin_closed.md`):** every `codex exec` invocation must close stdin (`< /dev/null`); monitor worker CPU% — 0.0% for 2+ minutes signals a stdin hang.

## 10. Adversarial review handoff

1. Implementer (Codex) summarizes deliverables, AC sub-criteria satisfied, and any sync-cursor drift findings the audit surfaced (with fix-commit SHAs or DEFERRED.md routing).
2. Adversarial reviewer (Opus / Claude Code) invoked. Suggested invocation:
   ```
   /codex:adversarial-review --background --base d4775f9 "X.4 no-global-cursor audit (single-implementer Codex backend + X.3 helper refactor) — see handoff §6 watchpoints + §8 exit criteria. Focus on spec-prose extraction completeness, sync-entry-point precheck regression fixtures (renamed + ambiguous), JSONB-path expression normalization, provenance-vs-coverage independence, and the X.3 helper refactor preserving all 28 X.3 tests."
   ```
3. Reviewer iterates until APPROVE (memory `feedback_iterate_until_convergence.md`).
4. Per-round routing: X.4 is single-implementer Codex; almost every finding is Codex's. Exceptions surface to orchestrator: spec amendments (none expected), DDL trigger interaction with `supabase/migrations/` ordering (review-routed to M2-owner if any).
5. Class-sweep before patching (memory `feedback_class_sweep_before_patch.md`): when review surfaces a single missed BANNED_COMBO or a single missed `SYNC_ENTRY_POINTS` member, grep the live sync layer for sibling shapes before patching only the named site.
6. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies

- **X.1 closed** (catalog parity, `2090dc2`). **X.2 closed** (no raw codes, `84af646`). **X.3 closed** (trust-domain audit, `d4775f9`). X.4 inherits the canonical artifact-naming pattern, the `__generated__`/`*.generated.ts` manifest pattern, the freshness-gate CI shape, and the `walkSourceFiles` helper.
- **X.3 helper refactor in scope (C1/C2/C3 caveats)**: `sameFixtureFamily`, `inferFixtureDomain`, `findRequestEntries` path-substring discrimination — all three close in X.4 commit range. After refactor, all 28 X.3 tests stay green. If the refactor surfaces a deeper X.3 issue (e.g., an inferred-domain change reveals a previously-hidden audit bug), surface as an X.3 reopen rather than absorbing into X.4.
- **X.2 residual #1 (FIRST_SEEN_REVIEW allowlist registry migration trigger)**: combined registry count remains at 1 (X.1's `FIRST_SEEN_REVIEW` only; X.2 + X.3 added empty allowlists). X.4 does not add new entries to any registry-shaped allowlist (audit fails closed on unresolved sources; no allowlist escape hatch). Trigger still does not fire.
- **X.2 residual #2 (substring-matching false-positive risk for long internal tokens)**: X.4 inherits the watchpoint. X.4 uses AST scoping + tokenize-then-superset matching + exact-value comparison; no substring grep over file text.
- **M11 Phase A in flight** (parallel Opus implementer; `app/help/**`). X.4 walks the entire tsconfig program; Phase A's commits will be picked up. Highly unlikely Phase A introduces a watermark-named identifier (Phase A is help docs / breadcrumbs, no sync). If found, route as an X.4 finding back to Phase A handoff.
- **M11 Phase B start unblocked by X.1 closure** (already done). X.4 closure does not gate M11 progression.
- **X.5 (RLS coverage) + X.6 (traceability + branch-protection)**: independent of X.4. X.6 reads X.4's `lib/audit/watermark-symbols.generated.ts` as one input to the cross-cutting parity gate (AUTHORITATIVE_GATING_WATERMARKS + DISPLAY_ONLY_TIMESTAMPS spec ↔ plan parity); X.4 does not block them.
- **X.6's branch-protection contract**: once `x4-no-global-cursor` is merged + green, it becomes one of 7 required-status-checks the X.6 reader+privileged-script enforces. X.4 does not itself configure branch protection.
- **M6 advisory `! rg "lastPollAt"` retirement**: M6-era advisory grep is superseded by X.4's structural audit. Per plan ~line 1634, the literal-string grep MAY remain as defense-in-depth secondary check, but the primary mechanism is the AST audit. Document the disposition in convergence log.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**N/A — no UI surface.** X.4 ships scripts, generated TypeScript manifests, Vitest meta-tests, regression fixtures, a Postgres migration, and a CI workflow extension. No file under `app/` (outside `app/api/**`), `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`. The dual `/impeccable critique` + `/impeccable audit` gate does not apply.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

Declared at handoff time per memory `feedback_meta_test_at_plan_time_not_round_n.md`.

- [ ] **Supabase call-boundary discipline** — **N/A.** X.4's own audit code makes no Supabase calls. If layer 3 surfaces a §1.9 violation in a sync entry point's call graph, route to `tests/auth/_metaInfraContract.test.ts`; do not absorb.
- [ ] **Sentinel hiding in optional text** — **N/A.** X.4 doesn't render.
- [ ] **`admin_alerts` catalog completeness** — **N/A.** X.4 audits sync watermarks, not catalog producer registry.
- [ ] **Advisory-lock topology** — **N/A.** X.4 makes no `pg_advisory*` calls.
- [ ] **No-inline-email-normalization** — **N/A.** X.5's audit surface.
- [x] **CREATE: no-global-cursor three-layer audit** (`tests/cross-cutting/no-global-cursor.test.ts`) — schema + token-aware AST + semantic data-flow. Concrete failure mode: an implementer introduces `app_settings.processed_at` as a singleton sync checkpoint (no `last_` prefix, no BANNED_COMBO match, no `lastPollAt` literal) and gates `applyStagedParse` against it; layer 3 catches via `isAppSettingsRead` forbidden source kind.
- [x] **CREATE: watermark-symbols generator** (`scripts/extract-watermark-symbols.ts`) + **CREATE: manifest** (`lib/audit/watermark-symbols.generated.ts`) — derived from spec §X.4 prose. Concrete failure mode: spec amendment that renames `pending_syncs.base_modified_time` → `shows.base_modified_time` without `pnpm gen:watermark-symbols` run fails the freshness gate with named diff `+missing_in_generated:<column>`.
- [x] **CREATE: ~25 regression fixtures** (`tests/cross-cutting/fixtures/no-global-cursor*/`) per §2.
- [x] **CREATE: Postgres DDL event trigger** (`supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql`) — global allowlist-based trigger on `ddl_command_end`; rejects new watermark-named columns on any `public` table not in `_allowed_watermark_columns`. Concrete failure mode: a future migration that adds `system_state.last_processed_at` (a singleton table that's not `app_settings`) is rejected at apply-time, not just at audit-time.
- [x] **REFACTOR (X.3 R1 caveats)**: `lib/audit/authPrimitives.ts` `sameFixtureFamily` / `inferFixtureDomain` / `findRequestEntries` path-substring discrimination → AST-aware or unique-key-based. Concrete failure mode: a future fixture renamed without updating production-audit code does not silently change audit behavior on live `app/**` paths.
- [x] **EXTEND: tests/cross-cutting/auth.test.ts** — all 28 X.3 tests stay green after the helper refactor. Verified during X.4 implementation.

---

## Convergence log

### Implementation ready for adversarial review

- _(filled by Codex when implementation is staged and ready for review)_

### Adversarial review

- _(filled by Opus reviewer round-by-round; format mirrors X.1/X.2/X.3 closure logs)_
