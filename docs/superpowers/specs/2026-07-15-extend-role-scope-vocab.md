# Extend Role→Scope Vocabulary (admin role-token mappings) — v1

**Date:** 2026-07-15 · **Backlog:** `BL-EXTEND-ROLE-SCOPE-VOCAB` (BACKLOG.md:7-11) · **Branch:** `feat/extend-role-scope-vocab` (worktree off `origin/main` @ b54f2d0af)

## 1. Summary & why

When a crew member's role cell contains a legitimate token the parser doesn't recognize, `extractRoleFlags` fails closed: the token is dropped, `UNKNOWN_ROLE_TOKEN` is emitted (`lib/parser/personalization.ts:374-381`), and the person gets no scope tiles. The vocabulary is a hardcoded closed map (`ROLE_NORMALIZATIONS`, `lib/parser/personalization.ts:18-42`); today the ONLY way to extend it is a developer code change. No admin surface lists or edits the vocabulary.

This feature gives the admin (Doug) the first in-app mechanism: **map a novel role token to a small set of scope capabilities** (or to nothing — "recognize only"). The mapping is **global** (applies to every show, past and future), stored in a new table, and applied as a **pure post-parse overlay** at sync time — the parser stays a pure closed-vocab function. This is explicitly NOT a free-form value override (the removed field-override feature, PR #376/#382); it maps a token to a closed-vocab capability set.

## 2. Resolved decisions (ratified in brainstorm — do not relitigate)

| # | Decision | Choice |
|---|---|---|
| D1 | Mapping scope | **Global** — one row per token, applies to all shows. Auto-application must surface through existing infrastructure (changes feed + telemetry), see §7. |
| D2 | Mapping shape | **Token → capability set**, constrained to the grantable capabilities (§4), NOT an 18-role alias picker and NOT an arbitrary flag multi-select. Empty set = "recognize only" and is valid. |
| D3 | Financials | **Included** as a grantable capability, with strong warning copy (§9). Implemented as a NEW `RoleFlag` member `FINANCIALS` — never via `LEAD` (which would silently unlock every scope). |
| D4 | UI scope v1 | Warning-attached affordance (both admin surfaces) **plus** a global settings list page to view/edit/remove mappings. |
| D5 | Application mechanism | **Post-parse overlay** (approach A) at the existing sync seam — parser untouched except one additive warning payload field (§5). Rejected: parser-time DB injection (breaks parser purity, mutation-harness blast radius); read-time join (violates the `role_flags`-column visibility contract, `lib/visibility/scopeTiles.ts:12-31`). |
| D6 | UI mocks | Claude Design session (user-driven) between spec draft and adversarial review; mock snapshots committed verbatim to `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/` BEFORE any UI task dispatch; kickoff prompts in §13. |
| D7 | Doug-facing copy | Plain language only. The words "scope", "flag", "token", "mapping" never appear Doug-facing. Copy pinned in §9. |

## 3. Data model

New migration `supabase/migrations/20260716000000_role_token_mappings.sql`:

```sql
create table public.role_token_mappings (
  token text primary key,
  grants text[] not null default '{}',
  decided_by text not null,
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_token_mappings_token_canonical
    check (token = upper(btrim(token)) and length(token) between 1 and 64),
  constraint role_token_mappings_grants_allowed
    check (grants <@ array['A1','V1','L1','FINANCIALS']::text[])
);

revoke insert, update, delete on public.role_token_mappings from anon, authenticated;
```

- `token` — the canonical token exactly as the parser's tokenizer produces it: the role cell is split on `/` and `-`, then `.trim().toUpperCase()` (`lib/parser/personalization.ts:344-346`). One shared normalization helper (§5.3) guarantees mapping keys can't drift from parser tokens.
- `grants` — subset of the four grantable flags (§4). Empty array = recognize-only. The inline CHECK is the safety net; the action boundary (§8.3) and the sync-side loader (§6.2) are the primary validators (three layers, same posture as email canonicalization).
- `decided_by` — the deciding admin's canonicalized email from the admin identity chain (same source as use-raw's `decidedBy`). Display-only.
- No `show_id` — global by design (D1). Not in the advisory-lock table list (AGENTS.md invariant 2); mapping writes do NOT acquire the per-show lock (§8.4).
- **PostgREST DML lockdown** row: `role_token_mappings` added to the lockdown meta-test (cross-cutting rule, AGENTS.md "PostgREST DML lockdown for RPC-gated tables"); mutations flow only through admin server actions using the service-role/postgres.js path.
- **Migration parity checklist** (same PR): apply locally → `pnpm gen:schema-manifest` + commit manifest → apply surgically to validation project `vzakgrxqwcalbmagufjh` (`supabase db query --linked` + `notify pgrst, 'reload schema';`). Enforced by `validation-schema-parity`.
- CHECK/enum migration matrix: N/A-with-reason — brand-new table in a single one-shot migration (repo has migrations/ only, no `supabase/tables/` pre-apply layer), no enum change, no transitional window; the two CHECKs are born with the table. Migration prefix `20260716000000` verified unique against `supabase/migrations/` (sibling-collision rule).

## 4. Grantable capabilities & the FINANCIALS flag

Grantable set (exactly four, closed):

| Checkbox (Doug-facing, §9) | Stored flag | Existing gate it feeds |
|---|---|---|
| Audio details | `A1` | `audioScopeVisible` — A1, A2, or LEAD (`lib/visibility/scopeTiles.ts:85`) |
| Video details | `V1` | `videoScopeVisible` — V1 or LEAD (`:96`) |
| Lighting details | `L1` | `lightingScopeVisible` — L1 or LEAD (`:113`) |
| Financial details | `FINANCIALS` (new) | `financialsVisible` — extended (§4.1) |

### 4.1 New `RoleFlag` member: `FINANCIALS` — flag lifecycle table

| | |
|---|---|
| **Storage** | Member of the `RoleFlag` union (`lib/parser/types.ts:98-123`); persisted in `crew_members.role_flags text[]` like every other flag (`supabase/migrations/20260501000000_initial_public_schema.sql:38`); also in `role_token_mappings.grants`. |
| **Write paths** | ONLY the role-mapping overlay (§6). `ROLE_NORMALIZATIONS` never maps any sheet token to it; `extractRoleFlags` cannot produce it. No sheet content can grant financial visibility. |
| **Read paths** | `financialsVisible(flags, isAdmin)` (`lib/visibility/scopeTiles.ts:137-139`) extended to `isAdmin || flags.includes("LEAD") || flags.includes("FINANCIALS")`. |
| **Effect** | Financials tile renders for the crew member. Nothing else — `FINANCIALS` is not in `SCOPE_TILE_UNLOCKING_FLAGS` (`scopeTiles.ts:66`) additions unless the financials tile participates in that transition machinery; the plan verifies whether `capabilityTransitions.ts` (`CAPABILITY_TRANSITION_MATRIX`, `affectedTilesOnFlip`) covers financials and extends the matrix if so. |

Deliberately rejected: granting financials via `LEAD` (unlocks audio+video+lighting+financials at once — silent over-grant) and adding a synthetic non-`RoleFlag` vocabulary (breaks the typed union and every downstream consumer).

- Touching `lib/parser/types.ts` triggers the **mutation-harness local rerun** rule (rerun mutation project locally before push; benign fingerprint drift handled per the established ledger discipline).

## 5. Parser change (additive, minimal)

### 5.1 Machine-readable token on the warning

`UNKNOWN_ROLE_TOKEN` warnings currently carry the token only inside `message` prose (`personalization.ts:377-380`). The overlay must never parse prose. Add one optional field to `ParseWarning` (`lib/parser/types.ts:38-68`), following the `resolution` precedent (additive, jsonb-persisted, backward-compatible, no migration):

```ts
// The exact canonical role token that failed vocabulary lookup. ALWAYS set on
// UNKNOWN_ROLE_TOKEN; ABSENT on every other warning code.
roleToken?: string;
```

Emit site change (`personalization.ts:374-381`): add `roleToken: tok` to the pushed warning. `tok` is already canonical (uppercased/trimmed by the tokenizer at `:344-346`).

### 5.2 What does NOT change

- `ROLE_NORMALIZATIONS`, `extractRoleFlags` control flow, autocorrect behavior (`ROLE_TOKEN_AUTOCORRECTED` still wins before a token is declared unknown — mapping is consulted only for tokens that ended UNKNOWN), the crew-row `blockRef` stamping (`lib/parser/blocks/crew.ts:367-373`), `unknownTokens` (no consumers outside the parser).
- Legacy persisted warnings without `roleToken` (staged/published before this ships): the overlay skips them (fail-closed — no prose parsing, no fallback). They resolve themselves on the next re-parse, which re-emits with `roleToken`.

### 5.3 Shared token normalization helper

`lib/parser/roleTokenCanonical.ts` (new leaf module, single source): `canonicalRoleToken(raw: string): string` = `raw.trim().toUpperCase()` collapsed whitespace — the exact transform the tokenizer applies, used by BOTH the action boundary (§8.3) and any UI echo. (Privacy-sanitizer-parity lesson from PR #388: shared leaf module, never a reimplementation.) `.trim()`/`.toUpperCase()` calls in `lib/sync`/`lib/drive` scope need same-line `// canonicalize-exempt: role-token canonicalization, not email` markers per the no-inline-email-normalization guard.

## 6. Overlay: `lib/sync/roleMappingOverlay.ts`

Pure function, sibling of `applyUseRawDecisions` (`lib/sync/useRawOverlay.ts`):

```ts
export type RoleTokenMapping = {
  token: string;                 // canonical
  grants: GrantableFlag[];       // ⊆ {A1,V1,L1,FINANCIALS}, may be empty
  decidedBy: string;
  decidedAt: string;
};

export type ApplyRoleMappingsResult = {
  result: ParseResult;           // new object; input never mutated (structuredClone)
  applied: Array<{ token: string; grants: GrantableFlag[]; memberIndex: number; memberName: string }>;
};

export function applyRoleTokenMappings(parseResult: ParseResult, mappings: RoleTokenMapping[]): ApplyRoleMappingsResult;
```

Semantics:

1. For each warning with `code === "UNKNOWN_ROLE_TOKEN"` and `roleToken` present and `roleToken` ∈ mappings (exact string match on canonical token):
   - Locate the crew row via `blockRef.index` (`crewBlockRef = { kind: "crew", index, name }`, `lib/parser/blocks/crew.ts:293`); guard: index in range and `blockRef.kind === "crew"`, else skip (fail-closed).
   - Union the mapping's `grants` into that row's `role_flags` (dedupe; append order = grants order; never removes existing flags; never touches `ONLY`/stage restrictions).
   - Remove the warning from `result.warnings`.
   - Record in `applied`.
2. Recognize-only mapping (empty `grants`): warning removed, flags unchanged, still recorded in `applied`.
3. Warnings without `roleToken` (legacy) or with unmapped tokens: untouched — warning stays, fail-closed.
4. Multiple crew members sharing the token: each has its own warning; all matched.
5. Same cell with several unknown tokens: one warning per token (`personalization.ts` loop); each matched independently.

### 6.1 Ordering at the sync seam

Applied in `phase2` immediately after the use-raw overlay (`lib/sync/phase2.ts:263`), before the crew upsert (`role_flags` at `:377`) and before `nonLeadRoleFlagChanges` diffing (`:218`, invoked `:468`). The two overlays are disjoint (use-raw touches rooms/hotels/dates; this touches crew `role_flags` + warnings) — order is fixed for determinism, not correctness.

### 6.2 Loader + validation boundary

`normalizeRoleTokenMappings(raw: unknown): RoleTokenMapping[]` — the single validation boundary for rows read from the DB (mirrors `normalizeUseRawDecisions`, `lib/sync/useRawOverlay.ts:188`): non-array → `[]`; drops rows with non-canonical token, grants ∉ allowed set, blank `decidedBy`, unparseable `decidedAt`. NEVER throws.

**Loading pattern (pinned, mirrors use-raw exactly):** `phase2` receives mappings via a new optional `Phase2Args` field `roleTokenMappings?: RoleTokenMapping[]` (alongside `useRawDecisions?`, `lib/sync/phase2.ts:131`). The existing sync callers that already assemble those args load the table once per sync and normalize: `runScheduledCronSync.ts` (where it loads `use_raw_decisions`, `:920`) and the staged-apply path (`applyStaged.ts:530` / `applyStagedCore.ts:456,583`). One difference from use-raw: mappings are a GLOBAL table read (`select token, grants, decided_by, decided_at from role_token_mappings`), not a per-show column. Reads are read-only inside the paths' existing transactions/queries; no extra lock. The read follows call-boundary discipline (invariant 9) in whichever client style its surrounding loader already uses (postgres.js tx at those seams), with a registry row or inline `// not-subject-to-meta: <reason>` per the meta-test's scope rules.

## 7. Lifecycle (create / edit / delete / surfacing)

Flags remain recomputed-from-sheet on every sync; the overlay runs inside that recompute. No new persistence of derived flags.

| Event | What happens |
|---|---|
| **Create** (from a show's warning) | Row upserted → `logAdminOutcome` → `runManualSyncForShow` (`lib/sync/runManualSyncForShow.ts:292`) applies to THAT show immediately. Other shows converge on their next cron sync. |
| **Create** (wizard staged) | Row upserted → staged twin re-stages the current wizard session so step-3 refreshes (use-raw staged pattern, `app/admin/onboarding/_actions/useRawStaged.ts`). |
| **Edit grants** (settings page) | Row updated (`updated_at` bumped) → per-show convergence on next sync. |
| **Delete** (settings page) | Row deleted → on each show's next sync the token is unknown again: granted flags revert, `UNKNOWN_ROLE_TOKEN` warning returns. Nothing orphaned. |
| **Auto-apply surfacing (D1 requirement)** | (a) Flag deltas on re-sync flow through the existing `ROLE_FLAGS_NOTICE` changes-feed path (`nonLeadRoleFlagChanges`, `lib/sync/phase2.ts:218-240`, emitted `:468-493`) — no new feed machinery. (b) Each overlay application emits the new info-level code `ROLE_TOKEN_MAPPED` (§10) as post-commit telemetry, outside the advisory-lock tx (invariant 10). |

Dormant mappings (token later added to the built-in vocabulary in code): warning stops firing, mapping never matches, harmless. Settings list still shows the row. Detecting/flagging dormancy is **out of scope** (§14).

## 8. Admin surfaces & actions

### 8.1 Warning affordance (both surfaces)

`UNKNOWN_ROLE_TOKEN` is operator-actionable (`OPERATOR_ACTIONABLE_ANCHORED`, `lib/parser/dataGaps.ts:307-310`) and renders through `PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx:22`), which already exposes the `renderItemControls?: (w: ParseWarning, i: number) => ReactNode` slot (`:25,:31,:103`) used by use-raw on both the per-show page and wizard step-3. The new control mounts in that same slot for `UNKNOWN_ROLE_TOKEN` entries.

New presentational component `components/admin/RoleRecognizeControl.tsx` (+ client boundary glue, use-raw pattern): shows the unrecognized word, "Recognize this role" affordance, capability checkboxes, save. Exact copy §9; exact visual design from the committed mocks (D6).

**Guard conditions (per prop):** warning without `roleToken` → control does NOT render (legacy warning, §5.2). Token already mapped (race: mapped in another tab, this page stale) → action returns the idempotent success path (§8.3). Empty/blank token after canonicalization → control does not render.

**Control states (5):** collapsed (trigger only) · idle (panel expanded, checkboxes default unchecked) · saving (pending, inputs disabled) · saved-confirmation (transient, then the surface refreshes: live page via `runManualSyncForShow` outcome, wizard via re-stage) · error (plain-language failure copy via `lib/messages/lookup.ts` — never a raw code, invariant 5).

**Transition inventory (all 10 pairs):** collapsed↔idle (expand/collapse — animation per mock, else instant); idle→saving (instant disable); saving→saved (instant); saving→error (instant); error→saving (retry, instant disable); error→idle (edit inputs clears error, instant); collapsed↔saving, collapsed↔saved, collapsed↔error (unreachable — panel cannot collapse mid-flight; saved exits via surface refresh, not collapse); idle→saved, idle→error (unreachable — only saving reaches terminal states); saved→any (unreachable — surface refresh unmounts the control with the resolved warning). Compound: warning list re-sorts/removes entries while a sibling control is expanded — each control's state is keyed to its warning identity (`code` + `roleToken` + `blockRef.index`), so unrelated list churn never migrates state between rows. If the committed mock adds animated transitions, the plan's transition-audit task enumerates them against this table.

### 8.2 Settings list page

`app/admin/settings/roles/page.tsx` (precedent: `app/admin/settings/admins/`). Server component lists all mappings (token, plain-language grants, decided_by, decided_at) with per-row edit (checkboxes) + remove. Remove confirmation copy states the consequence (§9). New admin route → auth-chain audit touchpoints (`lib/audit/protectedRoutes.ts` TRUST_DOMAINS registration per the auth-chain audit test `tests/cross-cutting/auth-chain-audit.test.ts`).

### 8.3 Server actions

| Action | File | Registry code |
|---|---|---|
| `mapRoleToken` (live show) | `app/admin/show/[slug]/_actions/roleToken.ts` | `ROLE_TOKEN_MAPPING_SET` |
| `mapRoleTokenStaged` (wizard) | `app/admin/onboarding/_actions/roleTokenStaged.ts` | `ROLE_TOKEN_MAPPING_SET` |
| `updateRoleTokenMapping` | `app/admin/settings/_actions/roleTokenMappings.ts` | `ROLE_TOKEN_MAPPING_SET` |
| `deleteRoleTokenMapping` | `app/admin/settings/_actions/roleTokenMappings.ts` | `ROLE_TOKEN_MAPPING_DELETED` |

All four: admin-gated (`requireAdminIdentity` chain), **`AUDITABLE_MUTATIONS` registry rows** (`tests/log/_auditableMutations.ts:13`, shape `{file, fn, code}`) with success-branch behavioral proof in `tests/log/adminOutcomeBehavior.test.ts` (invariant 10 strict admin tier). `logAdminOutcome` post-commit; context carries `{ token, grants }` only (no secrets, no crew PII).

Boundary validation in every action: token canonicalized via `canonicalRoleToken` (§5.3), non-empty, ≤64 chars; reject tokens already in the built-in vocabulary (`ROLE_NORMALIZATIONS` key or multi-word token — pointless row, confusing UX); `grants` must be a subset of the four grantable flags (reject otherwise — fail-closed, not silently filtered). Set/update is an upsert keyed on token (idempotent; re-save with same grants = success no-op).

### 8.4 Locking

`role_token_mappings` writes take NO per-show advisory lock (global table, not in the invariant-2 mutation list). The live-show action's subsequent `runManualSyncForShow` call acquires the show lock exactly as it does today — the action itself must NOT wrap the mapping upsert inside that lock (single-holder topology unchanged; no new holder introduced). The plan cites this in the advisory-lock topology declaration.

## 9. Doug-facing copy (pinned; the impeccable dual-gate may refine wording, not vocabulary)

- Control trigger: **"Recognize this role"**
- Panel heading: **"What should people with this role see?"**
- Checkboxes: **"Audio details"**, **"Video details"**, **"Lighting details"**, **"Financial details"** — financials carries inline warning text: **"Includes budgets and rates. Only grant this if people with this role should see money."**
- Nothing checked (default) helper text: **"They'll get the standard show page."**
- Save button: **"Recognize role"**
- Saved confirmation: **"Got it — anyone with this role is recognized from now on, on every show."**
- Settings page title: **"Roles you've added"**; empty state: **"When a sheet uses a role we don't recognize, you can add it from the warning — added roles show up here."**
- Remove confirmation: **"Remove this role? People with it go back to 'unrecognized' the next time each show checks its sheet."**
- Banned Doug-facing vocabulary (D7): scope, flag, token, mapping, capability, sync, overlay, parse.

## 10. §12.4 catalog changes (3-way lockstep + the full CI touchpoint set)

**New code `ROLE_TOKEN_MAPPED`** (info-level app_event, emitted post-commit per overlay application during sync):

- §12.4 prose row in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (NEVER prettier this file) + `pnpm gen:spec-codes` + matching `lib/messages/catalog.ts` row — same commit.
- Additional gates (per the new-code checklist): `pnpm gen:internal-code-enums` (x2), help families test, full `pnpm test`. Namespace check: name must not collide with a scanner namespace (`REPORT_*` rule) — `ROLE_TOKEN_MAPPED` is clear.
- Draft dougFacing: "_<crew-name>_'s role includes _<token>_, a role you added — we recognized it and set up their page the way you chose."

**Edit `UNKNOWN_ROLE_TOKEN` row** (`lib/messages/catalog.ts:1193-1205`): dougFacing/helpfulContext/longExplanation currently end "let us know and we'll add it" — update to point at the new affordance ("you can add it right from this warning"); `followUp` becomes "Doug → recognize role (or optional Report)". Same 3-way lockstep commit discipline (§12.4 prose + gen + catalog).

Admin-outcome forensic codes `ROLE_TOKEN_MAPPING_SET` / `ROLE_TOKEN_MAPPING_DELETED` are §12.4-exempt via the `_metaAdminOutcomeContract` stamp (established mechanism — these are logAdminOutcome codes, not user-visible messages).

## 11. Security posture

- Sheet content can never grant visibility beyond the built-in vocabulary: `FINANCIALS` is unreachable from `ROLE_NORMALIZATIONS`; grants originate only from an admin-gated action.
- Table is REVOKEd from `anon`/`authenticated` (§3); reads at sync run server-side.
- `decided_by` is admin identity (already-canonicalized email) — display-only, shown only on the admin settings page; never crew-facing, never logged beyond `logAdminOutcome`'s standard identity handling.
- Financials over-grant risk is a deliberate, warned, admin decision (D3) — copy in §9; the grant is visible and reversible on the settings page.

## 12. Tier × domain completeness matrix

| Layer | Action |
|---|---|
| Table DDL | §3 migration (new table + CHECKs + REVOKEs) |
| Inline CHECK | token-canonical + grants-allowed (§3) |
| RPC read path | N/A — no RPC; sync-side loader (§6.2) |
| RPC write path | N/A — server actions via service-role path (§8.3) |
| Propagation trigger | N/A — no triggers; convergence via per-show sync (§7) |
| Cleanup function | N/A — rows live until deleted by admin; delete semantics §7 |
| Frontend forms | Warning control (§8.1) + settings page rows (§8.2) |
| Audit surface | settings list shows decided_by/decided_at; `logAdminOutcome` events; `ROLE_TOKEN_MAPPED` app_events |
| Undo interplay | Undo RPC rebuilds `role_flags` from JSONB snapshots (`supabase/migrations/20260608000003_undo_change_rpc.sql:250`) — snapshots taken AFTER overlay, so undo restores overlay-applied flags consistently; next sync re-applies the (unchanged) mapping. No change needed; plan adds a regression test. |
| Tests | §13 |

## 13. Testing & meta-test inventory

- **Overlay unit tests** (`tests/sync/roleMappingOverlay.test.ts`): apply/union-dedupe/recognize-only/no-`roleToken`-skip/unmapped-skip/bad-blockRef-skip/multi-member/multi-token/input-not-mutated. Anti-tautology: expected flags derived from fixture mapping rows, never hardcoded to match implementation constants.
- **Normalize boundary tests**: corrupt rows dropped (bad token case, out-of-set grants, blank decidedBy, bad decidedAt), non-array → [].
- **Parser test**: `UNKNOWN_ROLE_TOKEN` carries `roleToken` equal to the canonical token; absent on all other codes (walker-style assertion over emitted warnings in existing fixtures).
- **Action tests** (all four): gate, validation rejections (built-in token, bad grants, blank token), upsert idempotency, behavioral outcome proof (sink-spy on committed-success branch).
- **Meta-test rows (declared inventory):** `postgrest-dml-lockdown` (+`role_token_mappings`); `_metaMutationSurfaceObservability` auto-discovers the new actions (registry rows §8.3 satisfy it); `AUDITABLE_MUTATIONS` + `adminOutcomeBehavior` (4 rows); auth-chain audit for the new route; infra-contract registry row or `// not-subject-to-meta:` for the loader (§6.2); no new walker needed — `roleMappingOverlay.ts` is `lib/sync`, not `lib/parser/blocks` (no `SECTION_HEADER_TOKENS`/`TRANSFORM_SITES` obligations).
- **Visibility tests**: `financialsVisible` accepts `FINANCIALS`; `capabilityTransitions` matrix extension if applicable (§4.1).
- **UI**: component tests for control states + settings rows; impeccable v3 critique+audit dual-gate on the diff (invariant 8); real-browser layout assertions only if the mock introduces fixed-dimension parents.
- **e2e**: existing picker/crew e2e untouched; one integration test through `phase2` proving mapped token → upserted `role_flags` + warning absent + `ROLE_FLAGS_NOTICE` delta on the change feed.
- Full `pnpm test` + `pnpm typecheck` + `pnpm build` + `pnpm lint` + `pnpm format:check` before push; mutation-harness local rerun (lib/parser touched).

## 14. Out of scope

- New tiles/capabilities beyond the four grantable flags (a genuinely new capability is a developer feature — tiles are code).
- Per-show mapping overrides (D1 rejected).
- Dormancy detection (token later added to built-in vocab) — harmless, listed, not flagged.
- Editing the built-in vocabulary from the UI.
- Autocorrect interplay changes — autocorrect still wins first (§5.2).
- Crew-facing rendering changes beyond tiles unlocking (role display string stays the raw sheet value, `CrewMemberRow.role`).

## 15. Claude Design kickoff prompts (D6 deliverable)

Session order: prompt A then B (shared visual language). Fetched mocks → `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/` verbatim, then this spec's §8/§9 gain mock references before adversarial review.

**Prompt A — "Recognize this role" control:**
> Design an inline admin control for a mobile-first admin tool (existing product: FXAV Crew Pages — warm, plain-spoken, non-technical admin named Doug). Context: a warnings list on an admin page; one warning says a crew member's role label (e.g. "DRONE OP") wasn't recognized, so that person gets the standard page. The control lets Doug "Recognize this role": expands to a short panel — heading "What should people with this role see?", four checkboxes ("Audio details", "Video details", "Lighting details", "Financial details" — the financial one carries an inline caution: "Includes budgets and rates. Only grant this if people with this role should see money."), helper text when nothing is checked ("They'll get the standard show page."), primary button "Recognize role". States to design: collapsed trigger inside the warning row; expanded panel; saving (disabled); saved confirmation ("Got it — anyone with this role is recognized from now on, on every show."); error state (plain-language). Constraints: fits inside an existing warning card on mobile (360px) and desktop; no modal; no red/green as sole state carrier; tap targets ≥44px; matches a clean, quiet admin aesthetic (neutral surfaces, one accent). Never use the words: scope, flag, token, mapping, sync.

**Prompt B — "Roles you've added" settings page:**
> Same product/visual language as prompt A. Design a small admin settings page "Roles you've added": a list of role labels the admin has taught the app (e.g. "DRONE OP", "SOUND TECH"), each row showing the label, what those people see (plain chips: Audio details / Video details / Lighting details / Financial details, or "Standard page only"), who added it and when, an edit affordance (reopens the same checkbox set), and a remove affordance with confirmation copy: "Remove this role? People with it go back to 'unrecognized' the next time each show checks its sheet." Include the empty state: "When a sheet uses a role we don't recognize, you can add it from the warning — added roles show up here." Mobile-first, list not table on small screens; no modal for edit if avoidable (inline expansion preferred).

## 16. Watchpoints (adversarial-review preempts — do not relitigate)

- **Overlay vs parser-injection** is ratified (D5) with reasons; precedent `lib/sync/useRawOverlay.ts` shipped PR #388.
- **Financials inclusion** is a user decision (D3) with warning copy — challenge implementation, not the inclusion.
- **Fail-closed posture everywhere**: legacy warnings without `roleToken` are skipped, unmapped tokens keep warning, corrupt rows dropped at the normalize boundary. Fail-open alternatives were not chosen; don't propose them.
- **Global (no show_id)** is a user decision (D1); per-show isolation was explicitly rejected.
- **No advisory-lock change**: the mapping table is outside the invariant-2 list; the only lock acquisition remains inside `runManualSyncForShow` exactly as today (§8.4).
- **Copy vocabulary bans** (D7/§9) are product decisions; wording refinements welcome via impeccable, vocabulary reintroduction is not.
