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
| D6 | UI mocks | **Committed** — `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/` (`Recognize Role Control.dc.html`, `Roles You've Added.dc.html`, README), fetched verbatim from Claude Design project `8658e1ec-fa7d-4ff7-9776-9df9f10b7405`. The mocks are the visual source of truth for §8; §9 pins their copy. Trigger style = neutral-outline (mock exploration A). |
| D7 | Doug-facing copy | Plain language only. The words "scope", "flag", "token", "mapping" never appear Doug-facing. Copy pinned in §9. |

## 3. Data model

New migration `supabase/migrations/20260716000000_role_token_mappings.sql`:

```sql
create table public.role_token_mappings (
  token text primary key,
  grants text[] not null default '{}',
  decided_by text not null
    constraint role_token_mappings_decided_by_canonical
    check (decided_by = lower(btrim(decided_by)) and decided_by <> ''),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_token_mappings_token_canonical
    check (token = upper(btrim(token)) and length(token) between 1 and 64),
  constraint role_token_mappings_grants_allowed
    check (
      grants <@ array['A1','V1','L1','FINANCIALS']::text[]
      and array_position(grants, null) is null
    )
);

alter table public.role_token_mappings enable row level security;
grant all privileges on table public.role_token_mappings to service_role;
revoke select, insert, update, delete on public.role_token_mappings from anon, authenticated;
```

(SELECT is revoked explicitly too — defense in depth over the zero-policy RLS denial, so the posture never rests on RLS alone; plan-R2 F2.)

**Read posture (Codex R2 F1 + R3 F1; precedent claim corrected R5 F5):** RLS enabled with NO policies = default-deny for `anon`/`authenticated` PostgREST reads regardless of default table grants. This is deliberately STRICTER than the `shows_internal`/`sync_log`/`pending_syncs` posture (`supabase/migrations/20260501002000_rls_policies.sql:61-85`), which grants client roles table privileges plus an `admin_only` RLS policy — those tables have legitimate client-session readers; this one has none (all readers are server-side service-role), so it gets zero policies and zero client-role grants. Do NOT copy the admin_only-policy pattern here. The explicit `grant all privileges … to service_role` follows the same file's per-table precedent (`:60,:68,:76,:84`; also `20260504000001_bootstrap_nonces_signing_key.sql:7`) — RLS bypass alone is not sufficient if the role lacks table privileges. Every legitimate reader/writer is server-side service-role (sync loaders §6.2, admin settings page + actions §8.2/§8.3). Without the RLS posture, the table would leak the global vocabulary AND `decided_by` admin emails to any authenticated crew member via PostgREST. Test (§13, two-sided so a privilege gap can't masquerade as denial): `authenticated`-role SELECT is denied/empty AND a service-role round-trip (insert → select → delete) succeeds against the same table.

- `token` — the canonical token exactly as the parser's tokenizer produces it: the role cell is split on `/` and `-`, then `.trim().toUpperCase()` (`lib/parser/personalization.ts:344-346`). One shared normalization helper (§5.3) guarantees mapping keys can't drift from parser tokens.
- `grants` — subset of the four grantable flags (§4). Empty array = recognize-only. The inline CHECK is the safety net; the action boundary (§8.3) and the sync-side loader (§6.2) are the primary validators (three layers, same posture as email canonicalization).
- `decided_by`/`decided_at` mean **"last decided"** (Codex R12 F3): the settings grant-edit updates BOTH to the editing admin + now (the displayed "who · when" always names the admin who chose the CURRENT grants); `updated_at` tracks any row write — no trigger; EVERY update statement sets `updated_at = now()` explicitly (Codex R13 F1), asserted by the §13 settings-edit persistence test. `decided_by` is the deciding admin's canonicalized email from the admin identity chain (same source as use-raw's `decidedBy`). Display-only. The canonical-shape CHECK is the invariant-3 schema safety net, copied from the `admin_email` precedent (`supabase/migrations/20260705100000_bell_state_tables.sql:20`) — a fixture, bug, or manual service-role repair can't persist `Doug@Example.COM` or blank (Codex R4 F1).
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
| **Read paths** | TWO gates, both extended (Codex R1 F1 — render predicate alone is NOT enough): (1) `financialsVisible(flags, isAdmin)` (`lib/visibility/scopeTiles.ts:137-139`) → `isAdmin \|\| flags.includes("LEAD") \|\| flags.includes("FINANCIALS")`; (2) the **data projection gate** in `getShowForViewer` — `const isLead = isAdmin \|\| derivedFlags.includes("LEAD")` (`lib/data/getShowForViewer.ts:365`) decides whether the `shows_internal.financials` read even issues (`:746`, `isLead ? readFinancials() : Promise.resolve(undefined)`). Introduce an explicit entitlement predicate (e.g. `financialsEntitled = isAdmin \|\| LEAD \|\| FINANCIALS`) used for the financials JOIN/read slot, leaving every OTHER `isLead` consumer in that file untouched; update the file-header application-gate comments (`:29,:37,:75,:128`). Without (2), a FINANCIALS-only viewer passes the tile predicate but receives no `financials` data — an admin grant silently rendering an empty budget section. No RLS/data-access change is needed beyond this JS gate: `getShowForViewer` reads via `createSupabaseServiceRoleClient` (`getShowForViewer.ts:46`; header `:34,:41` — "service-role client to bypass RLS on the LEAD branch"), the exact path non-admin LEADs already receive financials through today (refutes Codex R10 F1). |
| **Effect** | Financials tile renders WITH data for the crew member. Nothing else — `FINANCIALS` is not added to `SCOPE_TILE_UNLOCKING_FLAGS` (`scopeTiles.ts:66`) unless the financials tile participates in that transition machinery; the plan verifies whether `capabilityTransitions.ts` (`CAPABILITY_TRANSITION_MATRIX`, `affectedTilesOnFlip`) covers financials and extends the matrix if so. |
| **Deliberately NOT extended** | `hasLead()` in `lib/sync/phase2.ts:215` and `lib/sync/phase1.ts:265` — those detect LEAD *transitions* for change-feed routing (LEAD-flips route differently from `nonLeadRoleFlagChanges`); FINANCIALS grants flow through the ordinary non-lead flag-change notice, which is correct. Class-sweep result for the `includes("LEAD")` shape: `scopeTiles.ts:86,:97,:114` (LEAD as read-in to audio/video/lighting — unchanged), `:138` + `getShowForViewer.ts:365` (extended per above), `phase2.ts:215`/`phase1.ts:265` (excluded per this row). |

Deliberately rejected: granting financials via `LEAD` (unlocks audio+video+lighting+financials at once — silent over-grant) and adding a synthetic non-`RoleFlag` vocabulary (breaks the typed union and every downstream consumer).

- Touching `lib/parser/types.ts` triggers the **mutation-harness local rerun** rule (rerun mutation project locally before push; benign fingerprint drift handled per the established ledger discipline).

## 5. Parser change (behavior unchanged except one additive warning field; module refactor explicit in §5.3 — Codex R9 F4)

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
- Legacy persisted warnings without `roleToken` (staged/published before this ships): the overlay skips them (fail-closed — no prose parsing, no fallback). They re-emit WITH `roleToken` on the next re-parse. **Post-deploy UX contract (Codex R5 F1):** a legacy warning renders exactly as today — line visible, NO "Recognize this role" control (§8.1 guard) — until the show next re-parses (sheet edit picked up by cron, or the admin's existing manual sync affordance, which drives `runManualSyncForShow` and re-persists warnings with `roleToken`). No backfill migration; the state is self-healing and the degraded window loses nothing that exists today. The provenance gate (§8.3) is consistent: no control ⇒ no action ⇒ no legacy-shaped `stale` rejections.

### 5.3 Shared vocabulary leaf module (module topology pinned — Codex R8 F1)

`lib/parser/roleVocabulary.ts` (new **dependency-free leaf module**, the hotelConfTokens extraction pattern from PR #388): `ROLE_NORMALIZATIONS` and `MULTI_WORD_TOKENS` MOVE here from `personalization.ts` (which re-imports them — one-way dependency `personalization → roleVocabulary`, no cycle possible), alongside `canonicalRoleToken(raw: string): string` = `raw.trim().toUpperCase()` — **exactly** the tokenizer's per-token transform (`personalization.ts:344-346`: split on `/`/`-`, then `.trim().toUpperCase()`; the parser's inline `.trim().toUpperCase()` is refactored to CALL this helper, so parity is by construction, not by test alone) — and `isBuiltInRoleToken` (§8.3). The action boundary and UI import from the leaf; the parser imports from the leaf; nothing imports from `personalization.ts` for vocabulary. (A new `lib/parser/*.ts` file is not under `lib/parser/blocks/` — no `SECTION_HEADER_TOKENS`/`TRANSFORM_SITES` walker obligations; the plan re-checks both walkers' scopes anyway.) **NO whitespace collapsing** (Codex R1 F3): the live tokenizer preserves internal whitespace, so a helper that collapsed `DRONE   OP` → `DRONE OP` would store a key future warnings (still emitting `DRONE   OP`) never match — the mapping would silently never apply. Internal multi-space tokens are stored and matched verbatim; the DB CHECK (`token = upper(btrim(token))`, §3) is compatible (it constrains edges and case only). Parity test required: an unknown multi-word role with repeated internal spaces round-trips action-save → overlay-match (§13). (Privacy-sanitizer-parity lesson from PR #388: shared leaf module, never a reimplementation.) `.trim()`/`.toUpperCase()` calls in `lib/sync`/`lib/drive` scope need same-line `// canonicalize-exempt: role-token canonicalization, not email` markers per the no-inline-email-normalization guard.

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
  applied: Array<{
    token: string;
    grants: GrantableFlag[];
    memberIndex: number;
    memberName: string;
    blockRefName: string | null; // the consumed warning's blockRef.name (raw NAME cell) — §10 gate identity
  }>;
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

`normalizeRoleTokenMappings(raw: unknown): RoleTokenMapping[]` — the single validation boundary for rows read from the DB (mirrors `normalizeUseRawDecisions`, `lib/sync/useRawOverlay.ts:188`): non-array → `[]`; drops rows with non-canonical token, grants ∉ allowed set, blank `decidedBy`, unparseable `decidedAt`; deduplicates `grants` into the stable A1/V1/L1/FINANCIALS order (§8.3). NEVER throws.

**Loading pattern (pinned, mirrors use-raw exactly):** `phase2` receives mappings via a new optional `Phase2Args` field `roleTokenMappings?: RoleTokenMapping[]` (alongside `useRawDecisions?`, `lib/sync/phase2.ts:131`). ALL THREE sync callers that assemble those args load the table once per sync and normalize — `runScheduledCronSync.ts` (where it loads `use_raw_decisions`, `:920`), **`runManualSyncForShow.ts`** (Codex R14 F2 — the path `mapRoleToken` invokes; it must thread BOTH `roleTokenMappings` and `priorParseWarnings` (§10 point 3) or live creates would neither apply immediately nor gate correctly), and the staged-apply path (`applyStaged.ts:530` / `applyStagedCore.ts:456,583`). One difference from use-raw: mappings are a GLOBAL table read (`select token, grants, decided_by, decided_at from role_token_mappings`), not a per-show column. Reads are read-only inside the paths' existing transactions/queries; no extra lock. The read follows call-boundary discipline (invariant 9) in whichever client style its surrounding loader already uses (postgres.js tx at those seams), with a registry row or inline `// not-subject-to-meta: <reason>` per the meta-test's scope rules.

## 7. Lifecycle (create / edit / delete / surfacing)

Flags remain recomputed-from-sheet on every sync; the overlay runs inside that recompute. No new persistence of derived flags.

| Event | What happens |
|---|---|
| **Create** (from a show's warning) | Row upserted (durable) → `logAdminOutcome` → `runManualSyncForShow` (`lib/sync/runManualSyncForShow.ts:292`) applies to THAT show immediately. Other shows converge on their next cron sync. **Partial-failure boundary (Codex R1 F2):** the mapping commit and the re-sync are two steps; the re-sync can fail or return a non-`applied` outcome AFTER the row is durable. The action mirrors the use-raw contract exactly (`app/admin/show/[slug]/_actions/useRaw.ts:155-170`): a thrown re-sync fault is caught, never escapes post-commit, and the action returns `{ ok: true, state: "applied" \| "apply_pending" }` — `apply_pending` = mapping saved, this show not yet refreshed (it self-heals on the next successful sync; cron picks it up). The UI saved state has a truthful `apply_pending` copy variant (§9). It NEVER claims "nothing changed" after the row committed, and NEVER shows the error state (that is reserved for the upsert itself failing, before anything is durable). |
| **Create** (wizard staged) | Row upserted → staged twin re-stages the current wizard session so step-3 refreshes (use-raw staged pattern, `app/admin/onboarding/_actions/useRawStaged.ts`). |
| **Edit grants** (settings page) | Row updated (`updated_at` bumped) → per-show convergence on next sync. |
| **Delete** (settings page) | Row deleted → on each show's next sync the token is unknown again: granted flags revert, `UNKNOWN_ROLE_TOKEN` warning returns. Nothing orphaned. |
| **Auto-apply surfacing (D1 requirement)** | (a) Flag deltas on re-sync flow through the existing `ROLE_FLAGS_NOTICE` changes-feed path (`nonLeadRoleFlagChanges`, `lib/sync/phase2.ts:218-240`, emitted `:468-493`) — no new feed machinery. (b) `ROLE_TOKEN_MAPPED` telemetry — the complete end-to-end contract (overlay → gate → args → result shape → per-caller emission → tests) is pinned in §10 and is the single source; summary: pure overlay, delta-gate inside `phase2` against prior-persisted state, `Phase2Result.appliedRoleMappings` carries post-gate `{ token, grants, newMemberCount }` entries, all three apply surfaces emit post-commit outside the lock tx, steady state is silent. |

Dormant mappings — two accepted classes, both harmless (rows that never match; the overlay consumes only genuinely-emitted `UNKNOWN_ROLE_TOKEN` warnings): (a) token later added to the built-in vocabulary in code — warning stops firing; (b) a token the parser would AUTOCORRECT rather than emit as unknown (e.g. `CONTENT CRETION` → `CONTENT_CREATION`, `personalization.ts:361-372`) — such a row can only arise from a tampered/hand-crafted action call, since both create paths take the token from a fired warning's `roleToken` and the settings page has no create affordance (§8.2); it grants nothing and applies to no one (Codex R3 F4 — deliberate: inert-row class, not an action-boundary fuzzy-match check, which would import autocorrect logic into the boundary for zero capability risk). Settings list still shows dormant rows. Detecting/flagging dormancy is **out of scope** (§14).

## 8. Admin surfaces & actions

### 8.1 Warning affordance (both surfaces)

`UNKNOWN_ROLE_TOKEN` is operator-actionable (`OPERATOR_ACTIONABLE_ANCHORED`, `lib/parser/dataGaps.ts:307-310`) and renders through `PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx:22`), which already exposes the `renderItemControls?: (w: ParseWarning, i: number) => ReactNode` slot (`:25,:31,:103`) used by use-raw on both the per-show page and wizard step-3. The new control mounts in that same slot for `UNKNOWN_ROLE_TOKEN` entries.

**Same-cell dedup exception (Codex R2 F3):** `operatorActionableWarnings` dedups by `(code, sourceCell.a1)`, so a role cell with TWO unknown tokens currently collapses to one rendered line — the second token's control would be unreachable until the first is mapped and a re-sync re-surfaces it. Fix at the dedup key, using the established FIELD_UNREADABLE exception mechanism (`lib/parser/dataGaps.ts:338-343` — fold a per-row discriminator into the key; "adding it can only REDUCE collapsing, never hide a row"): for `UNKNOWN_ROLE_TOKEN` warnings that carry `roleToken`, fold `roleToken` into the dedup key so each unknown token in the same cell renders its own line + control. Legacy warnings without `roleToken` keep the a1-only key (unchanged collapse). **The React key path gets the SAME fold (Codex R6 F1):** `stableWarningKeys` (`lib/dataQuality/warningIdentity.ts:22`, consumed at `PerShowActionableWarnings.tsx:40`) must include `roleToken` in the identity of `UNKNOWN_ROLE_TOKEN` items — otherwise two same-cell rows share a React key and expanded checkbox state can migrate between controls. Tests: (a) one role cell with two unknown tokens → two rendered warnings, two independent controls; (b) `stableWarningKeys` returns distinct keys for two same-cell `UNKNOWN_ROLE_TOKEN` items with different `roleToken`s.

New presentational component `components/admin/RoleRecognizeControl.tsx` (+ client boundary glue, use-raw pattern): shows the unrecognized word, "Recognize this role" affordance, capability checkboxes, save. Exact copy §9; exact visual design from the committed mock `…-mock/Recognize Role Control.dc.html` (D6): neutral-outline trigger with ⌄ chevron beside the existing "Open in Sheet" link; expanded white panel inside the amber warning card; 20px checkboxes with `accent` color; financial caution as amber sub-text under its checkbox; save = accent-filled button with spinner+label swap when saving ("Recognizing…"); error = amber inline `role="alert"` box, selections kept, button relabels "Try again"; saved = teal ✓ badge + confirmation copy inside a card that settles to neutral tint, with a "Change what they see" link that reopens the panel in REVISE mode (Codex R10 F3 — the mapping now exists, so a plain re-create with different grants would hit the §8.3 conflict branch): the reopened panel's save submits through `updateRoleTokenMapping` (§8.3, the settings edit action — the one sanctioned mutation path), pre-filled with the saved grants; visually identical to the mock. **Live-surface caveat (Codex R11 F2):** the action's post-save revalidation (useRaw precedent, `revalidateShow` before return) may re-render the list and unmount the control quickly — the link carries NO liveness guarantee; if it's gone, Settings is the durable revise path (§8.2), nothing is lost. Test is component-level with the actions mocked (pre-unmount contract per the §8.1 timing rule): reopen → check Financials → submit invokes `updateRoleTokenMapping` (not the create action); no e2e/refresh-timing assertion. Desktop (≥~560px panel width): checkboxes two-up grid, financial row spanning both columns.

**Guard conditions (per prop):** warning without `roleToken` → control does NOT render (legacy warning, §5.2). Token already mapped (race: mapped in another tab, this page stale) → action returns the idempotent success path (§8.3). Empty/blank token after canonicalization → control does not render.

**Control states (5):** collapsed (trigger only) · idle (panel expanded, checkboxes default unchecked) · saving (pending, inputs disabled) · saved-confirmation · error (plain-language failure copy via `lib/messages/lookup.ts` — never a raw code, invariant 5).

**Saved-state timing contract (Codex R3 F5):** the saved card is CLIENT-LOCAL state — once the action resolves `ok:true`, the control renders it and keeps it until the control unmounts. Server refresh (live: revalidation after the action; wizard: re-stage) eventually re-renders the warning list without the resolved warning, unmounting the control — the saved card makes no persistence promise beyond that. "Change what they see" is a best-effort affordance for the pre-unmount window (it reopens the panel with the saved grants; re-save is an idempotent upsert); after unmount, edits live on the settings page — no loss either way. Component tests assert only pre-unmount behavior (saved card renders from the action result; link reopens the panel); NO test may assert refresh/unmount timing.

**Transition inventory (all 10 pairs, reconciled with the mock):** collapsed→idle (expand — mock: 120ms `rr-pop` fade/translate-in, ease-out); idle→collapsed (Cancel — instant); idle→saving (instant disable + spinner, save label → "Recognizing…"); saving→saved (instant swap to confirmation card, `rr-pop` in); saving→error (instant, error box appears, button relabels "Try again", selections kept); error→saving (retry, instant disable); error→collapsed (Cancel from error — instant; abandons nothing, no row was written); saved→idle ("Change what they see" reopens panel — instant, checkboxes pre-filled from the just-saved grants); collapsed↔saving, collapsed↔saved (unreachable — Cancel is disabled while saving; saved replaces the trigger); idle→saved, idle→error (unreachable — only saving reaches terminal states). Saved ultimately exits via surface refresh (live: sync outcome; wizard: re-stage) unmounting the control with the resolved warning. Compound: warning list re-sorts/removes entries while a sibling control is expanded — each control's state is keyed to its warning identity (`code` + `roleToken` + `blockRef.index`), so unrelated list churn never migrates state between rows. The plan's transition-audit task enumerates the two `rr-pop` entrances + spinner against this table.

### 8.2 Settings list page

`app/admin/settings/roles/page.tsx` (precedent: `app/admin/settings/admins/`). Server component lists all mappings; visual design from `…-mock/Roles You've Added.dc.html` (D6): white row cards — token label + "who · when" meta line, grants as plain-language pill chips (financial chip amber-tinted; empty grants = single dashed muted "Standard page only" chip) — with two quiet actions per row: "Edit what they see" (reopens the same checkbox set INLINE, save label "Save changes"/"Saving…") and "Remove" (two-step INLINE confirm, amber wash: "Remove this role? …" with "Yes, remove it"/"Keep it", spinner label "Removing…"). No modals. Empty state: dashed card, "Nothing here yet" + pointer copy (§9). Desktop: one-line grid rows (label | chips | meta | actions). New admin route → auth-chain audit touchpoints (`lib/audit/protectedRoutes.ts` TRUST_DOMAINS registration per the auth-chain audit test `tests/cross-cutting/auth-chain-audit.test.ts`).

### 8.3 Server actions

| Action | File | Registry code |
|---|---|---|
| `mapRoleToken` (live show) | `app/admin/show/[slug]/_actions/roleToken.ts` | `ROLE_TOKEN_MAPPING_SET` |
| `mapRoleTokenStaged` (wizard) | `app/admin/onboarding/_actions/roleTokenStaged.ts` | `ROLE_TOKEN_MAPPING_SET` |
| `updateRoleTokenMapping` | `app/admin/settings/_actions/roleTokenMappings.ts` | `ROLE_TOKEN_MAPPING_SET` |
| `deleteRoleTokenMapping` | `app/admin/settings/_actions/roleTokenMappings.ts` | `ROLE_TOKEN_MAPPING_DELETED` |

All four: admin-gated (`requireAdminIdentity` chain), **`AUDITABLE_MUTATIONS` registry rows** (`tests/log/_auditableMutations.ts:13`, shape `{file, fn, code}`) with success-branch behavioral proof in `tests/log/adminOutcomeBehavior.test.ts` (invariant 10 strict admin tier). `logAdminOutcome` post-commit; context carries `{ token, grants }` only (no secrets, no crew PII). **`decided_by` write shape (Codex R7 F3 + R10 F5):** the identity email is passed through `canonicalize` (the actual export: `lib/email/canonicalize.ts:2`, `canonicalize(raw: string | null | undefined): string | null` — invariant 3, canonicalization at every boundary) immediately before the upsert; if canonicalization fails/returns no valid email (malformed identity source), the action returns `{ ok: false, code: "infra_error" }` and writes NOTHING — a non-email string never persists into `decided_by`. Tests: mixed-case identity email → row persists lowercased, no CHECK violation; malformed identity → infra_error, no row.

Boundary validation in every action: token canonicalized via `canonicalRoleToken` (§5.3), non-empty, ≤64 chars; reject built-in tokens via a single-source helper `isBuiltInRoleToken(token)` in the §5.3 leaf module, defined as `Object.hasOwn(ROLE_NORMALIZATIONS, token) || Object.hasOwn(ROLE_NORMALIZATIONS, token.replace(/\s+/g, " "))` — the second clause covers the parser's flexible-whitespace multi-word recognition (`personalization.ts:334`, `mwt.replace(/\s+/g, "\\s+")` regex means `CAM   OP` is recognized and never emits unknown; Codex R6 F5) since the map's single-space keys (`CAM OP`, `CAM_OP`, …) are the canonical spellings. Tie-to-emission test matrix (scoped, Codex R7 F2): (a) every exact `ROLE_NORMALIZATIONS` key → helper true; (b) repeated-internal-whitespace variants ONLY for the space-containing keys (the `MULTI_WORD_TOKENS` forms — underscore aliases and single-word codes get no variant) → role cell emits NO `UNKNOWN_ROLE_TOKEN` and helper true; (c) `ONLY` explicitly (Codex R11 F4 — the tokenizer `continue`s on it at `personalization.ts:352` before lookup, so it can never emit unknown; the helper must return true for it whether or not it is a map key, so a tampered submit of `ONLY` is rejected as built-in). Whitespace-class parity (Codex R13 F3): "flexible whitespace" means JS `\s` on BOTH sides — the parser's multi-word regex builds `\s+` and the helper's collapse uses `/\s+/g`, the same class by construction; `canonicalRoleToken` never touches internal whitespace, and the DB CHECK constrains edges/case only (Codex R5 F4; defense-in-depth — the provenance gate below already makes built-in tokens unreachable via the create paths; the helper also guards the settings `update` path, which accepts an existing row's token); `grants` must be a subset of the four grantable flags (reject otherwise — fail-closed, not silently filtered) and is **deduplicated + stably ordered (A1, V1, L1, FINANCIALS) before write** (Codex R2 F4 — the `<@` CHECK admits duplicates; the action write path and `normalizeRoleTokenMappings` (§6.2) BOTH dedupe, so chips/audit context never render duplicates even from hand-edited rows). Set is an upsert keyed on token with an **existing-row branch (Codex R9 F1 — a stale warning must not silently overwrite another admin's global decision):** if a row for the token already exists with set-equal grants → success no-op (idempotent); with DIFFERENT grants → `{ ok: false, code: "conflict" }`, nothing written — the create affordance never mutates an existing mapping; that is exclusively the settings-page edit path. Component branch + copy in §9; test: concurrent-admins scenario (A maps Audio, B's stale control submits Financials → conflict, row still Audio).

**Create-path evaluation order (pinned — Codex R11 F1; state pinned R12 F1):** after boundary validation, the action checks the EXISTING ROW first: row exists with set-equal grants → idempotent success that STILL proceeds to the follow-up step (re-sync live / re-stage wizard — this show may not have applied the mapping yet, which is why its control rendered), so `state` comes from that follow-up exactly as on create: `"applied"` only when the re-sync reports applied, else `"apply_pending"`; row exists with different grants → `{ ok: false, code: "conflict" }`. Only when NO row exists does the **warning-provenance check** run (Codex R4 F3, mirrors use-raw's freshness protection): `mapRoleToken` re-reads the show's current persisted parse warnings and requires an `UNKNOWN_ROLE_TOKEN` warning whose `roleToken` equals the submitted token; `mapRoleTokenStaged` does the same against the wizard session's staged parse. No matching warning → `{ ok: false, code: "stale" }` (nothing written). Test matrix: existing-row set-equal + warning gone → success; existing-row different grants → conflict; no row + no warning → stale; no row + warning → created. This closes create-without-warning entirely: a stale or tampered admin client cannot mint a global row for a token no sheet ever produced; the two warning-attached actions are the ONLY create paths (§8.2 — settings has no create affordance), so the §7 dormant-row class (b) shrinks to hand-crafted DB writes only.

Result contract for `mapRoleToken` (live), exact union (Codex R8 F3 + R9 F1): `{ ok: false, code: "stale" | "conflict" | "infra_error" | "show_not_found" | "validation_error" }` when nothing durable happened — and the component MUST branch `code: "stale"` and `code: "conflict"` to their §9 benign notices, never the generic error copy (own tested branches) · `{ ok: true, state: "applied" }` when the follow-up `runManualSyncForShow` reports `outcome === "applied"` · `{ ok: true, state: "apply_pending" }` when the mapping committed but the re-sync failed, threw (caught), or returned any non-applied outcome (§7; mirrors `_actions/useRaw.ts:155-170`). `mapRoleTokenStaged` has the same shape with the re-stage in place of the re-sync; its success-state rule (Codex R14 F1): `state: "applied"` means the re-stage COMPLETED and the refreshed staged parse reflects the mapping (warning consumed) — an assertion about the staged data only, never about any published show; a failed/thrown re-stage after the durable upsert → `"apply_pending"`. **RATIFIED IMPLEMENTATION AMENDMENT (2026-07-16, whole-diff R1 F1):** the wizard rescan/staging pipeline does NOT run the role-mapping overlay in v1 (only `runPhase2` at apply/publish does), so the refreshed staged parse retains the warning and staged saves ALWAYS resolve `"apply_pending"` — a truthful state: the mapping is durable and applies when the show publishes/finalizes (the staged-apply path threads `roleTokenMappings`, tested). The `"applied"` branch is retained in the contract for the future staging-overlay integration (`DEFERRED.md` ROLE-VOCAB-2); the control may reappear in idle state after a wizard refresh, and a re-save resolves through the idempotent set-equal path. No capability or data loss on any path. Settings-page `update`/`delete` return plain ok/error — no attached re-sync, convergence is cron-driven (§7). **Built-in guard scope (Codex R14 F3):** `isBuiltInRoleToken` gates the CREATE paths only. `updateRoleTokenMapping`/`deleteRoleTokenMapping` operate on an existing row's token as a historical fact and skip the guard — a dormant row whose token later becomes built-in stays editable and removable (it is inert either way, §7).

**Settings-mutation audit vs auto-apply surfacing (Codex R13 F2 — two distinct channels, both intended):** a settings edit/delete is audited IMMEDIATELY and unconditionally via `logAdminOutcome` (`ROLE_TOKEN_MAPPING_SET`/`_DELETED` — the durable decision record, visible on the admin events surface); the changes feed + `ROLE_TOKEN_MAPPED` fire only when a show's sync later observably applies the change. A dormant/unmatched token's edit therefore has forensic audit ONLY — correct, since nothing observable changed on any show.

**Absent-row behavior (Codex R12 F5):** `updateRoleTokenMapping` affects an EXISTING row only — row gone (deleted by another admin) → `{ ok: false, code: "stale" }` benign branch, it never recreates (settings has no create affordance; recreation would bypass the provenance gate); `deleteRoleTokenMapping` on an absent row → idempotent success (the desired end state already holds). Both tested.

### 8.4 Locking

`role_token_mappings` writes take NO per-show advisory lock (global table, not in the invariant-2 mutation list). The live-show action's subsequent `runManualSyncForShow` call acquires the show lock exactly as it does today — the action itself must NOT wrap the mapping upsert inside that lock (single-holder topology unchanged; no new holder introduced). The plan cites this in the advisory-lock topology declaration.

## 9. Doug-facing copy (pinned; the impeccable dual-gate may refine wording, not vocabulary)

All strings below are pinned from the committed mocks (D6). `<TOKEN>` = the raw unrecognized word (e.g. DRONE OP).

**Warning control:**
- Trigger: **"Recognize this role"** (neutral-outline button, ⌄ chevron)
- Panel heading: **"What should people with this role see?"** · scope line: **"Applies to anyone whose role says `<TOKEN>` — this show and every show after."**
- Checkboxes: **"Audio details"**, **"Video details"**, **"Lighting details"**, **"Financial details"** — financials inline caution: **"Includes budgets and rates. Only grant this if people with this role should see money."**
- Nothing checked (default) helper: **"They'll get the standard show page."**
- Buttons: **"Recognize role"** · saving label **"Recognizing…"** · **"Cancel"** · error retry **"Try again"**
- Error: **"That didn't save, so nothing has changed yet. Check your connection and try again."** (generic infra failure; specific catalog-backed failures still route through `lib/messages/lookup.ts`)
- Stale provenance (`code: "stale"`, §8.3 — the warning no longer exists; Codex R6 F2): distinct benign notice, NOT error styling and never the raw code: **"Looks like this was already taken care of. The page will show the latest next time it loads."** Tested as its own component branch.
- Conflict (`code: "conflict"`, §8.3 — the role already exists with different choices; Codex R9 F1): distinct benign notice: **"This role was already added with different choices. You can change what people with it see from Settings."** Tested as its own component branch.
- Saved (`state: "applied"`): **"Got it — anyone with this role is recognized from now on, on every show."** + summary line **"People with `<TOKEN>` now see `<grants summary>`."** (grants summary = "Audio and Video details" style join; empty grants = "the standard show page") + link **"Change what they see"**
- Saved but show not refreshed (`state: "apply_pending"`, §7): same saved card, summary line replaced with **"The role is saved and applies to every show. This show couldn't refresh just now — it'll catch up on its next sheet check."** + the same **"Change what they see"** link. Never the error state — the role IS saved.

**Settings page:**
- Title: **"Roles you've added"** · subtitle: **"Anyone whose sheet role matches one of these gets the page you picked — on every show."**
- Chips: grant names as above; empty grants chip: **"Standard page only"**
- Row actions: **"Edit what they see"** (desktop short form "Edit") · **"Remove"** · edit save **"Save changes"**/**"Saving…"**
- Edit-saved confirmation (Codex R6 F4 — must not imply immediate effect on live shows): **"Saved. Each show picks this up the next time it checks its sheet."** (Remove already states the same convergence in its confirm copy.)
- Remove confirm: **"Remove this role? People with it go back to 'unrecognized' the next time each show checks its sheet."** · buttons **"Yes, remove it"**/**"Removing…"** · **"Keep it"**
- Empty state: **"Nothing here yet"** + **"When a sheet uses a role we don't recognize, you can add it from the warning — added roles show up here."**

Banned Doug-facing vocabulary (D7): scope, flag, token, mapping, capability, sync, overlay, parse. Replacement phrases (pin for ALL adjacent status/error copy, not just the exact strings above — Codex R4 F4): sync/re-sync → **"checks its sheet" / "sheet check"**; a mapped token → **"a role you added"**; role_flags/grants → **"what they see"**. **"refresh" is explicitly ALLOWED product copy for UI/page state** (Codex R14 F6) — "sync"/"re-sync" remain banned; the two are not interchangeable ("refresh" describes the page, "checks its sheet" describes the data).

## 10. §12.4 catalog changes (3-way lockstep + the full CI touchpoint set)

**New code `ROLE_TOKEN_MAPPED`** (info-level app_event, emitted post-commit). This block is the COMPLETE end-to-end telemetry contract (consolidated after three same-vector rounds — R5 F3, R7 F1, R8 F2/F4/F5 — per the AGENTS.md comprehensive re-analysis rule):

1. **Overlay** (§6, pure, gate-free): returns `applied[]` with `{ token, grants, memberIndex, memberName, blockRefName }` — `blockRefName` is the consumed warning's `blockRef.name` (the raw NAME cell, `crew.ts:293`), carried explicitly because `memberName` (the parsed crew-row name) can differ from the raw cell after normalization/restriction stripping and the gate's identity key needs the RAW form (Codex R11 F3). Neither name field ever reaches telemetry.
2. **Gate (computed inside `phase2`):** emission-worthiness is decided per applied entry against PRIOR-PERSISTED state only, never this parse's pre-overlay output (a fresh parse always re-emits the warning pre-overlay; using it would emit every sync): (a) `grants` non-empty AND ≥1 granted flag newly present vs the member's prior persisted `role_flags` (same prior-crew source `nonLeadRoleFlagChanges` diffs, `phase2.ts:218`); or (b) `grants` empty (recognize-only) AND the prior persisted `parse_warnings` still contained a matching entry under the pinned identity key `(roleToken, blockRefName)` — the applied entry's `blockRefName` (point 1) matched against the prior warnings' `blockRef.name` (Codex R9 F2 — NEVER `blockRef.index`, which is reorder-unstable; both sides are the raw NAME cell stamped at `crew.ts:293`, so equality is exact, no name-equivalence rules needed). Duplicate-name crew collapse to one identity pair — a single emission per pair per sync, an accepted undercount for an informational event; crew-row reorder does NOT re-emit (tested). A recognize-only applied entry whose warning LACKS `blockRef.name` (Codex R10 F2 — `blockRef` is optional on `ParseWarning`; only the crew path stamps it) has no dedupe identity: the gate SKIPS emission for it (fail-closed against flooding — the flags-delta branch (a) is unaffected, and the change feed still surfaces real changes); tested. **Legacy-window carve-out (Codex R12 F4, accepted):** when the PRIOR persisted warnings predate this feature (no `roleToken` on them), branch (b)'s match fails, so a recognize-only mapping's first post-deploy application emits no event — a one-time informational loss confined to the legacy window; grant-bearing mappings still emit via branch (a). Absent prior state ⇒ everything is new ⇒ emit.
3. **Args:** `Phase2Args` gains TWO explicit fields: `roleTokenMappings?: RoleTokenMapping[]` (§6.2) and `priorParseWarnings?: ParseWarning[]`. Provenance per caller — each is an explicit REQUIREMENT, not an example (Codex R12 F2): the cron path AND `runManualSyncForShow` (which `mapRoleToken` invokes — a manual path that omitted the field would make every recognize-only mapping emit on every manual re-sync) each load the previous `shows_internal.parse_warnings` where they already read prior show state (`runScheduledCronSync.ts:920` region) and thread it; the staged-apply/wizard path threads `priorParseWarnings: []` (RATIFIED IMPLEMENTATION AMENDMENT, 2026-07-16 — the earlier "prior staged row's parse warnings" wording was imprecise: the staged parse IS the current parse, and using it as "prior" would defeat the gate; the correct prior for a staged apply is the previous PUBLISHED state, which the grants branch already gets via prior crew inside `runPhase2`, while the recognize-only branch accepts an informational under-emit on staged applies — the same accepted family as the legacy-window and duplicate-name carve-outs; documented at `applyStagedCore.ts`). A fourth args-assembly site the original enumeration missed, `runManualStageForFirstSeen.ts:97` (first-seen auto-publish), threads `roleTokenMappings` (parity contract) and carries `// first-publish-only:` for prior warnings; it is not a §10-point-5 emit surface — flag deltas still surface via `ROLE_FLAGS_NOTICE`. Omitting the field gets emit-everything-new semantics — permitted ONLY at genuine first publish (no prior exists), enforced by the threading walker (§13).
4. **Result:** `Phase2Result.appliedRoleMappings` carries POST-GATE, emission-ready entries only: gate-passing `applied[]` entries are GROUPED BY token (grants are per-token by construction — one row per token), `newMemberCount` = the count of gate-passing members in that group, ONE entry (⇒ one event) per token per sync (Codex R14 F4). Shape `{ token, grants, newMemberCount }` — **no member names (Codex R8 F2: crew names are PII; they already surface with names in the changes feed via `ROLE_FLAGS_NOTICE`, telemetry does not need them)**. Always present, `[]` when nothing gate-passing.
5. **Emission:** every `Phase2Result`-consuming commit surface (cron `runScheduledCronSync.ts`, manual `runManualSyncForShow.ts`, staged-apply `applyStaged.ts`/`applyStagedCore.ts`) emits ONE `ROLE_TOKEN_MAPPED` event per entry AFTER its transaction commits, outside the advisory-lock tx (invariant 10); a rolled-back sync emits nothing. Walker-style test: every consuming commit site emits or carries an inline exemption comment.
6. **Context:** `{ token, grants, newMemberCount }`. Catalog dougFacing reworded to be name-free: "_<token>_, a role you added, matched someone on this show — we set up their page the way you chose." Empty-grants rendering branch resolves to "the standard show page" (Codex R4 F2).
7. **Steady-state silence + lifecycle tests (§13):** unchanged-sheet consecutive syncs — first emits (incl. recognize-only), second emits zero; grants edit `[A1]`→`[A1,V1]` — next sync emits exactly once (V1 newly present); delete — next sync emits zero `ROLE_TOKEN_MAPPED` and the warning returns; rollback — zero.

- §12.4 prose row in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (NEVER prettier this file) + `pnpm gen:spec-codes` + matching `lib/messages/catalog.ts` row — same commit.
- Additional gates (per the new-code checklist): `pnpm gen:internal-code-enums` (x2), help families test, full `pnpm test`. Namespace check: name must not collide with a scanner namespace (`REPORT_*` rule) — `ROLE_TOKEN_MAPPED` is clear.
- dougFacing is the name-free string in point 6 above (superseding the earlier `<crew-name>` draft — context carries no names). Rendering must branch on empty grants (Codex R4 F2): with grants, the grant summary reads as in §9 ("Audio and Video details"); with `grants: []` (recognize-only — a valid v1 state) the copy resolves to "the standard show page", never an empty/awkward join. Test (§13): an empty-grants `ROLE_TOKEN_MAPPED` event renders the catalog copy cleanly.

**Edit `UNKNOWN_ROLE_TOKEN` row** (`lib/messages/catalog.ts:1193-1205`): dougFacing/helpfulContext/longExplanation currently end "let us know and we'll add it" — update to point at the new affordance ("you can add it right from this warning"); `followUp` becomes "Doug → recognize role (or optional Report)". Same 3-way lockstep commit discipline (§12.4 prose + gen + catalog).

Admin-outcome forensic codes `ROLE_TOKEN_MAPPING_SET` / `ROLE_TOKEN_MAPPING_DELETED` are §12.4-exempt via the `_metaAdminOutcomeContract` stamp (established mechanism — these are logAdminOutcome codes, not user-visible messages).

**Vocabulary-ban structural test (Codex R5 F2; scope pinned R7 F4):** extend the existing plain-language/jargon copy sweep (the Flow-7 "jargon class-sweep pin" in `tests/messages/`) to cover this feature's Doug-facing strings — asserting none matches the D7 banned list (scope/flag/token/mapping/capability/sync/overlay/parse as standalone words; "role" is allowed). Sweep scope is **rendered-copy string fields only**: catalog `dougFacing`/`helpfulContext`/`title`/`longExplanation` values, the §9-pinned component strings, AND every action-result-driven UI string in the two components (all branches: saved, apply_pending, stale, error — Codex R8 F6), with `_<placeholder>_`/`<placeholder>` templating spans excluded before matching. It never scans object keys, code identifiers (`ROLE_TOKEN_MAPPED` is a required name, not copy), or test fixture names. `followUp` IS in scope (Codex R11 F6 — it renders on the admin telemetry surface, `components/admin/telemetry/HealthAlertsPanel.tsx`); the edited value "Doug → recognize role (or optional Report)" contains no banned standalone words. Allowed plain-language terms pinned alongside the replacements: "refresh", "checks its sheet"/"sheet check". Manual pinning alone doesn't survive later copy edits; the sweep does.

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
| Crew data projection | `getShowForViewer` financials entitlement gate extended (§4.1) — the only projection change; A1/V1/L1 grants flow through the existing `role_flags`-driven reads unchanged |
| Frontend forms | Warning control (§8.1) + settings page rows (§8.2) |
| Audit surface | settings list shows decided_by/decided_at; `logAdminOutcome` events; `ROLE_TOKEN_MAPPED` app_events |
| Undo interplay | Undo RPC rebuilds `role_flags` from JSONB snapshots (`supabase/migrations/20260608000003_undo_change_rpc.sql:250`) — snapshots taken AFTER overlay, so undo restores overlay-applied flags consistently; next sync re-applies the (unchanged) mapping. No change needed; plan adds a regression test. |
| Tests | §13 |

## 13. Testing & meta-test inventory

- **Overlay unit tests** (`tests/sync/roleMappingOverlay.test.ts`): apply/union-dedupe/recognize-only/no-`roleToken`-skip/unmapped-skip/bad-blockRef-skip/multi-member/multi-token/input-not-mutated. Anti-tautology: expected flags derived from fixture mapping rows, never hardcoded to match implementation constants.
- **Normalize boundary tests**: corrupt rows dropped (bad token case, out-of-set grants, blank decidedBy, bad decidedAt), non-array → [].
- **Parser test**: `UNKNOWN_ROLE_TOKEN` carries `roleToken` equal to the canonical token; absent on all other codes (walker-style assertion over emitted warnings in existing fixtures).
- **Action tests** (all four): gate, validation rejections (built-in token, bad grants, blank token), warning-provenance rejection (token with no matching current `UNKNOWN_ROLE_TOKEN` warning → `stale`, nothing written — §8.3), upsert idempotency, behavioral outcome proof (sink-spy on committed-success branch); for `mapRoleToken`: re-sync failure AFTER the committed upsert returns `{ ok: true, state: "apply_pending" }` (thrown fault caught, mapping row still present), re-sync `applied` returns `state: "applied"`; for `mapRoleTokenStaged` explicitly (Codex R5 F6): a re-stage failure/throw AFTER the committed upsert returns `{ ok: true, state: "apply_pending" }` with the row durable — never an error state.
- **Whitespace parity test** (§5.3): unknown role `DRONE   OP` (repeated internal spaces) → warning `roleToken` preserves internal spacing; action save stores it verbatim; overlay matches it. Derived from the fixture string, not a hardcoded expectation.
- **Financials projection test** (§4.1): a FINANCIALS-only (non-LEAD, non-admin) viewer's `getShowForViewer` result includes `financials` data (read issued); a viewer with neither entitlement issues ZERO financials reads (existing contract preserved).
- **Read-posture test** (§3, two-sided): (a) `authenticated`-role PostgREST SELECT on `role_token_mappings` is denied/empty (RLS no-policy default-deny); (b) a service-role insert → select → delete round-trip succeeds — so missing `service_role` privileges can never false-pass as "denial works". The DML side is NOT re-implemented here (Codex R9 F3): the existing postgrest-dml-lockdown suite's registry row asserts `authenticated`/`anon` INSERT, UPDATE, and DELETE are each rejected for every registered table — adding `role_token_mappings` to that registry is the mandated coverage for all three verbs.
- **Dedup-exception test** (§8.1): one role cell with two unknown tokens → `operatorActionableWarnings` returns two rows (roleToken folded into the key); legacy same-cell warnings without `roleToken` still collapse to one.
- **Grants-dedupe test** (§8.3/§6.2): duplicate values in a stored `grants` array normalize to the unique stable-ordered set at both the action write path and `normalizeRoleTokenMappings`.
- **Settings-edit persistence test** (§3, Codex R13 F4): a grant-edit by admin B on a row created by admin A persists `decided_by = B`, fresh `decided_at`, and bumped `updated_at` (last-decided semantics end-to-end).
- **Absent-row branches** (§8.3, Codex R14 F5): `updateRoleTokenMapping` on a deleted row → `{ ok: false, code: "stale" }`, NO row recreated; `deleteRoleTokenMapping` on an absent row → idempotent success.
- **Telemetry-carrier test** (§7): a sync whose transaction rolls back after overlay application emits ZERO `ROLE_TOKEN_MAPPED` events; a committed sync emits one per gate-passing mapping.
- **Prior-warnings threading walker** (§10 point 3, Codex R10 F4): static/walker test over every `phase2` caller — each either passes `priorParseWarnings` or carries an inline `// first-publish-only: <reason>` exemption; plus a first-publish (no-prior) behavioral test proving emit-everything-new fires exactly once and goes silent on the following sync.
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

## 15. Claude Design kickoff prompts (D6 deliverable — COMPLETED)

Status: session ran 2026-07-15; both mocks fetched and committed to `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/`; §8/§9 updated from them. Prompts retained below for provenance only.

Session order: prompt A then B (shared visual language).

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
