# Operator-Actionable Parse-Warning Deep Links — Design

**Date:** 2026-06-26
**Status:** Design (autonomous-ship approved)
**Worktree:** `.claude/worktrees/feat+parse-warning-deeplinks` (branch `worktree-feat+parse-warning-deeplinks`, off `origin/main` @ `6b4d2699`)
**All `file:line` citations verified against HEAD `6b4d2699`.**

---

## 1. Goal

Give **operator-actionable parse warnings** a source-sheet **deep link** ("Open in Sheet ↗") on **every** operator review surface, **regardless of ingestion path** (initial folder onboarding *and* cron sync). The originating ask was: the "Role we didn't recognize" (`UNKNOWN_ROLE_TOKEN`) warning surfaces without a deep link to the offending CREW cell. Investigation widened the true defect to a two-part coverage gap that also silently disables the *already-shipped* `SCHEDULE_TIME_UNPARSED` link for cron-ingested shows.

This feature closes the gap for a tightly-scoped set of **four** codes and is structured so future codes can join the set cheaply.

## 2. Background — the gap (verified)

Two independent gaps make operator-actionable warnings invisible for the steady-state (cron) ingestion path:

1. **Anchors are populated on the onboarding scan path only.** `attachSourceCellAnchors` / `extractShowDayTimeAnchors` / `hasCellAnchoredWarning` have exactly one call site each — the pre-lock, side-effect-free Drive read in `runOnboardingScan.prepareOne` (`lib/sync/runOnboardingScan.ts:946-953`). The cron sync (`lib/sync/runScheduledCronSync.ts`) computes only *region-level* `extractSourceAnchors` (`runScheduledCronSync.ts:2443`) for `shows.source_anchors`; it never calls `attachSourceCellAnchors`, so `shows_internal.parse_warnings` written on the cron path carries **no `sourceCell`**. Result: even `SCHEDULE_TIME_UNPARSED`'s shipped deep link does not exist for any cron-ingested or cron-re-parsed sheet.

2. **No cron-reachable surface renders per-warning deep links.** The only surface that renders a `sourceCell` link is `Step3SheetCard` (`components/admin/wizard/Step3SheetCard.tsx:382`), exclusive to the initial onboarding wizard. The cron new-sheet review gate `StagedReviewCard` (`components/admin/StagedReviewCard.tsx`, `first_seen` mode), the per-show `/admin/show/[slug]` Data Quality panel, and `/admin/unpublished` all filter to `DATA_GAP_CODES = {FIELD_UNREADABLE, UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED}` (`lib/parser/dataGaps.ts:37-41`) and render counts / `.message` text only — never `sourceCell` links. `UNKNOWN_ROLE_TOKEN` and `SCHEDULE_TIME_UNPARSED` are warn-severity but are **not** `DATA_GAP_CODES`, so they appear on no post-publish operator surface at all (only the raw `/admin/dev` dump).

**Net:** a role typo (or unreadable show-day time) on a sheet Doug adds to the folder *after* onboarding is invisible to the operator everywhere actionable. This was confirmed live: across six real shows, the only one that trips `UNKNOWN_ROLE_TOKEN` is East Coast (a `Strke` typo in `Eric Weiss - Load In/Set/Strke/Load Out - A1` breaks the stage-word strip and cascades into ~4 unknown tokens on that one row).

## 3. Taxonomy

Introduce one new constant alongside the unchanged `DATA_GAP_CODES`:

```ts
// lib/parser/dataGaps.ts (new export, sibling of DATA_GAP_CODES:37-41)
export const OPERATOR_ACTIONABLE_ANCHORED: ReadonlySet<string> = new Set([
  "SCHEDULE_TIME_UNPARSED",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_DAY_RESTRICTION",
  "FIELD_UNREADABLE",
]);
```

- **`DATA_GAP_CODES` is unchanged** — the count-only "data-gap digest" (`summarizeDataGaps` / `dataGapClassDetails`, `dataGaps.ts:53-111`) keeps its exact three members and existing surfaces.
- **`OPERATOR_ACTIONABLE_ANCHORED`** is **not** a subset of `DATA_GAP_CODES`. `FIELD_UNREADABLE` is deliberately in **both** sets: it keeps its data-gap count *and* additionally gets a region deep link.
- `isDataQualityWarning` (`dataGaps.ts:44-46`) cannot be the gate for the new set (two of the four are not data-gap codes). Surfaces gate the deep-link affordance on `OPERATOR_ACTIONABLE_ANCHORED` membership + a resolved `sourceCell`.

### 3.1 Render pattern (invariant 5)

The established, invariant-5-safe pattern is already encoded at `Step3SheetCard.tsx:349-353`:

```ts
const cataloged = isMessageCode(w.code);
const entry = cataloged ? messageFor(w.code as MessageCode) : null;
const title = (entry?.title ?? null) || w.message; // catalog title if present, else human message — never the bare code
const context = entry?.helpfulContext ?? null;
```

New surfaces (StagedReviewCard, per-show panel) MUST adopt this exact **title-or-message** pattern, never rendering the bare `w.code`. This is safe for all four codes because each has a human-readable `.message` and three have full catalog copy (§4). The audit's "always render the catalog title" framing is superseded by this verified-in-code pattern (`FIELD_UNREADABLE` has all-null catalog fields by design — see §4 — and renders via its human `.message`).

## 4. The four codes — anchorability matrix

| Code | Severity | Catalog copy | User-addressable | Anchor | Semantic key / locator |
|---|---|---|---|---|---|
| `SCHEDULE_TIME_UNPARSED` | warn | full (`catalog.ts:1143-1155`; title "Show-day time unreadable") | yes — fix the TIME cell | **cell** | **already built**: `extractShowDayTimeAnchors` keys each show-day TIME cell by ISO date (`showDayTimeAnchors.ts:33-67`); only gap is cron-path population |
| `UNKNOWN_ROLE_TOKEN` | warn | full (`catalog.ts:1052-1064`; title "Role we didn't recognize") | yes — fix the role token | **cell** | **new** crew-role scanner, keyed by crew NAME, both geometries (§5.3) |
| `UNKNOWN_DAY_RESTRICTION` | warn | full (`catalog.ts:1026-1038`; title "Day-restricted crew with no days listed") | yes — add `(… ONLY)` to the name | **cell** | **new** — same crew row, same NAME key, same scanner as `UNKNOWN_ROLE_TOKEN` |
| `FIELD_UNREADABLE` | warn | **all-null by design** (`catalog.ts:1291-1304`; renders via `.message`) | yes — fix the phone/email/field | **region** | crew (or any) block REGION via `REGION_ANCHOR_SPEC[blockRef.kind]` when a spec exists, else no link (keeps its count) |

`UNKNOWN_ROLE_TOKEN`'s `.message` is `Unknown role token: '<tok>' in role cell: '<roleCell>'` (`personalization.ts:252`); `UNKNOWN_DAY_RESTRICTION`'s is `Role cell contains *** but no explicit day dates found: '<roleRaw>'` (`crew.ts:276`). Both render the friendlier **catalog title** ("Role we didn't recognize" / "Day-restricted crew with no days listed") via the title-or-message pattern — the technical `.message` is the fallback, not the rendered string.

### 4.1 Catalog: NO change (no §12.4 / x1 lockstep)

The deep link renders from `sourceCell`, not from copy. **No catalog row, no §12.4 prose, no `spec-codes.ts` is touched.** The `x1-catalog-parity` gate (`tests/messages/codes.test.ts`) is unaffected. This is an explicit non-goal: do not edit any `dougFacing`/`title`/`helpfulContext` for these codes.

## 5. Architecture

### 5.1 `ParseWarning.blockRef.name` (new optional field)

`ParseWarning.blockRef` is currently `{ kind: string; index?: number; iso?: string }` (`lib/parser/types.ts:4-21`). Add an optional `name?: string` — a backward-compatible, jsonb-persisted optional field, exactly how `iso` was introduced. Carries the crew member's **raw name cell** (`params.nameRaw`, pre-restriction-strip) for the crew-role resolver's stable key.

### 5.2 Emission enrichment (in `buildCrewMember`, `crew.ts`)

Both crew-role-cell codes are emitted/pushed inside `buildCrewMember`, where `params.nameRaw` and the crew row `index` are in scope:

- **`UNKNOWN_ROLE_TOKEN`** is produced by `extractRoleFlags(cleanedRole)` (`personalization.ts:249-254`, no blockRef) and pushed at `crew.ts:263`. `extractRoleFlags` stays a pure function; instead, in `buildCrewMember`, map the returned warnings and stamp `blockRef: { kind: "crew", index, name: params.nameRaw }` onto any `UNKNOWN_ROLE_TOKEN` before pushing.
- **`UNKNOWN_DAY_RESTRICTION`** is constructed inline at `crew.ts:273-280`; add the same `blockRef` to its object literal directly.

This mirrors the existing precedent in the same file family: `emitFieldUnreadable` already sets `blockRef: { kind: params.section, index }` (`lib/parser/warnings.ts:74-95`). `name` is the only synthesis-stable per-row key (row index is explicitly unsafe — synthesis can reorder rows, `showDayTimeAnchors.ts:15-19`).

### 5.3 New crew-role-cell scanner — `extractCrewRoleAnchors(bytes, titleToGid)`

A new function (new module `lib/drive/crewRoleAnchors.ts`, sibling of `showDayTimeAnchors.ts`) that re-walks the **raw** workbook abs-grid (`buildAbsGrid`, `lib/drive/sourceAnchors.ts:34-74`, which carries absolute row/col + gid) on the **INFO** tab and emits, per crew row, an anchor keyed by the crew NAME whose `a1` is the **role cell** for that row. It must reproduce the parser's own crew walk for **both geometries**:

- **New/standardized template** (5 of 6 live shows: RPAS, RFI, Consultants Roundtable, FIT, RIA): header `CREW / NAME / ROLE / PHONE [/ EMAIL]` → dedicated **ROLE column** (detected like `detectColumns`, `crew.ts:69-86`). NAME cell == the row's col-B value; anchor the **ROLE-column cell** (col C). Match key: `clean(grid NAME cell) === clean(blockRef.name)`.
- **Old "TECH" template** (East Coast): header `TECH / PHONE / ARRIVAL / DEPARTURE`, parsed by the separate `parseTechBlock` (`crew.ts:194`) → name + schedule + role in **one compound col-B cell**. There is no ROLE column; anchor the **compound col-B cell** itself. **Match by EQUALITY of the extracted name segment, never by prefix** — reproduce `parseTechBlock`'s own name extraction (split the compound cell on the leading ` - ` delimiter, take the first segment as the name) and compare `clean(extractedNameSegment) === clean(blockRef.name)`. A bare "starts-with" test is forbidden: it would false-match `Ann` against `Anna - … - A1` and deep-link the wrong row (wrong-cell links are the worst failure mode). Using the parser's own split makes the scanner's name extraction identical to the parser's, which is also the companion-surface-drift mitigation (§9).

Header/column detection and `TERMINATING_LABELS` (`crew.ts:31-48`) MUST be reused/shared with the parser to avoid companion-surface drift (§9). Name cleaning (`clean()`): trim, collapse whitespace, strip the day-restriction parenthetical (`(… ONLY)`) — confirmed necessary live (`Calvin Saller (10/7 and 10/9 ONLY)`, `Maria Davila (10/19 ONLY)`) — and case-fold, applied identically on both sides. This is exact-cell targeting, not PII matching: prefer strict equality and degrade to null/region on any miss.

**Resolution requires EXACTLY ONE candidate → else null.** For both geometries, after the geometry-specific name extraction + `clean()`, the resolver counts crew rows whose extracted name equals `clean(blockRef.name)`. **Zero or two-or-more matches → no anchor** (mirror `resolveSourceCell`'s ambiguity-null, `showDayTimeAnchors.ts:90`). This subsumes both the duplicate-cleaned-name case and any multi-candidate case (e.g. a hypothetical multi-match in the old geometry), so the rule is uniform and does not depend on prefix semantics. In practice multi-match is essentially unreachable: `MI-5a_DUPLICATE_CREW_NAME` hard-fails the parse on duplicate crew names, so any show that reaches the role-warning stage has unique names (confirmed across six live shows). The exactly-one guard is defensive but mandatory.

### 5.4 `CELL_ANCHORED_CODES` (the anchor-population gate) + resolver dispatch

`CELL_ANCHORED_CODES` (`showDayTimeAnchors.ts:9`) is the gate for `hasCellAnchoredWarning`, which in turn gates the **entire** shared helper (§5.6) — including the region-anchor computation. Therefore **every** code that should receive a `sourceCell` MUST be in this set, or the helper short-circuits and the link is silently never produced (this includes the region-anchored `FIELD_UNREADABLE`).

- **`CELL_ANCHORED_CODES` must have identical membership to `OPERATOR_ACTIONABLE_ANCHORED`** (§3) — i.e. add all of `UNKNOWN_ROLE_TOKEN`, `UNKNOWN_DAY_RESTRICTION`, **and `FIELD_UNREADABLE`** alongside the existing `SCHEDULE_TIME_UNPARSED`. (The name `CELL_ANCHORED_CODES` is retained for continuity even though `FIELD_UNREADABLE` resolves to a *region* anchor; the set's true meaning is "codes that get a `sourceCell`.") A structural test (§10) pins `CELL_ANCHORED_CODES` ≡ `OPERATOR_ACTIONABLE_ANCHORED` so the two never drift across the `lib/drive` ↔ `lib/parser` layer boundary.
- `attachSourceCellAnchors` (`showDayTimeAnchors.ts:88-96`) dispatches by `w.code`:
  - `SCHEDULE_TIME_UNPARSED` → resolve by `blockRef.iso` against show-day anchors (unchanged).
  - `UNKNOWN_ROLE_TOKEN` / `UNKNOWN_DAY_RESTRICTION` → resolve by `blockRef.name` against crew-role anchors; not-exactly-one match → null (§5.3).
  - `FIELD_UNREADABLE` → resolve to the REGION anchor for `blockRef.kind` (§5.5).
- `hasCellAnchoredWarning` (`showDayTimeAnchors.ts:101-103`) widens to the new membership; it remains the cost gate (a sheet with no operator-actionable warning pays no extra fetch). A sheet that has **only** `FIELD_UNREADABLE` now correctly passes the gate, so its region anchor is computed and its link is produced.

### 5.5 `FIELD_UNREADABLE` region anchor

`FIELD_UNREADABLE` carries `blockRef: { kind, index }` (`warnings.ts:74-95`); its row index is not synthesis-stable, so region is the safe granularity. Region anchors come from `extractSourceAnchors` (`sourceAnchors.ts:173-235`), whose output is a `Record<blockKind, SourceAnchor>` — **kind-keyed and 1:1** (one region per section kind; section kinds like `crew`/`dates`/`venue` occur once per show, so there is no kind collision). The resolver uses **`blockRef.kind` only** (NOT `index`) to look up `sourceAnchors[blockRef.kind]`:

- The kind resolves to exactly one region anchor → stamp it as `sourceCell`.
- The kind has **no** entry (no `REGION_ANCHOR_SPEC` for it, or `extractSourceAnchors` produced none) → **null** (no link). `FIELD_UNREADABLE` keeps its existing data-gap **count** regardless (current surfacing unchanged; the link is purely additive).

Because the region map is structurally 1:1 by kind, `index` is intentionally unused for region resolution — there is no "which of N same-kind regions" ambiguity to resolve, and a missing/duplicate kind degrades to null (never a wrong-region link). The shared helper (§5.6) self-computes the region map (or reuses the cron path's already-computed `sourceAnchors` map from `runScheduledCronSync.ts:2443`) and passes it into `attachSourceCellAnchors`, so this resolution runs on **both** ingestion paths.

### 5.6 Shared anchor helper — populate on BOTH paths

Factor the onboarding anchor block (`runOnboardingScan.ts:946-953`) into one helper, `lib/sync/attachWarningAnchors.ts`:

```ts
export async function attachWarningAnchors(
  warnings: ParseWarning[] | undefined,
  bytes: Buffer | Uint8Array | undefined,
  // LAZY gids resolver: invoked ONLY after the cost gate passes, so a warning-free
  // sheet never triggers a Drive fetch. Onboarding passes a fetch thunk; cron passes
  // its already-computed titleToGid map wrapped in a resolved promise (no extra fetch).
  resolveGids: () => Promise<Map<string, number>>,
  regionAnchors?: Record<string, SourceAnchor>, // optional precomputed (cron already has it)
): Promise<void> {
  if (!bytes || !warnings || !hasCellAnchoredWarning(warnings)) return;
  try {
    const gids = await resolveGids();
    attachSourceCellAnchors(warnings, {
      showDay: extractShowDayTimeAnchors(bytes, gids),
      crewRole: extractCrewRoleAnchors(bytes, gids),
      region: regionAnchors ?? extractSourceAnchors(bytes, gids), // self-compute so FIELD_UNREADABLE links on BOTH paths
    });
  } catch {
    // deep-link anchors are optional; never break the scan/sync.
  }
}
```

The single `resolveGids` thunk resolves the API ambiguity between the two callers: the cost gate (`hasCellAnchoredWarning`) runs **before** `resolveGids` is called, so a warning-free sheet pays no Drive round-trip on either path. The helper **self-computes region anchors** only when the caller doesn't supply them, so `FIELD_UNREADABLE` links uniformly on both paths (no onboarding/cron asymmetry).

- **Onboarding** (`runOnboardingScan.prepareOne:946-953`): replace the inline block with a call to the helper, passing `resolveGids = () => listSheetGids(file.driveFileId)` (the existing fetch) and no `regionAnchors` (helper self-computes). Behaviorally identical to today's inline gate-then-fetch.
- **Cron** (`runScheduledCronSync.ts`, immediately after the region-anchor computation at `:2437-2443`): the `titleToGid` map and `xlsxBytes` are already in scope. Call the helper with `resolveGids = async () => titleToGid` (**no fetch** — reuse the precomputed map) and the already-computed `sourceAnchors` region map (`:2443`, avoids recomputation). This is the pre-persist, pure-read point; it mutates the in-memory parse warnings before they are written to `shows_internal.parse_warnings`.

**Advisory lock (invariant 2).** The helper is a pure raw-workbook read — **no DB access, no `pg_advisory*` call**. The cron lock is acquired in `lib/sync/lockedShowTx.ts:59/61`; the helper runs at the parse/prepare stage and acquires no lock of its own, so the single-holder topology is unchanged. No edit to `tests/auth/advisoryLockRpcDeadlock.test.ts` is required (the helper adds no lock surface).

## 6. Render surfaces (UI — Opus + impeccable v3 dual-gate, invariant 8)

All three surfaces render the **title-or-message** line (§3.1) + a conditional "Open in Sheet ↗" link from `buildSheetDeepLink(driveFileId, w.sourceCell)` for warnings in `OPERATOR_ACTIONABLE_ANCHORED` whose `sourceCell` resolved. The link label/aria carries no raw code.

1. **`Step3SheetCard`** (`Step3SheetCard.tsx:348-397`) — already renders the link; no behavioral change beyond the new codes now resolving `sourceCell`. Verify it still renders correctly.
2. **`StagedReviewCard`** (`StagedReviewCard.tsx`) — today renders `warningSummary` text + data-gap counts (`:541-565`), **no per-warning rows**. Add an operator-actionable warning list (title-or-message + deep link) for `OPERATOR_ACTIONABLE_ANCHORED` warnings, in all three modes (`live` / `first_seen` / `wizard_failed_reapply`, `:268`). The data-gap count breakdown is unchanged.
3. **Per-show `/admin/show/[slug]` Data Quality panel** (`page.tsx:260-288` read; `:719-782` JSX) — today reads `shows_internal.parse_warnings`, filters `isDataQualityWarning`, renders `.message` only. Add a dedicated subsection within the panel that renders `OPERATOR_ACTIONABLE_ANCHORED` warnings with the title-or-message line + deep link; the read step's filter widens to include `OPERATOR_ACTIONABLE_ANCHORED` (it must carry `code` + `sourceCell` + `blockRef` through, not just `.message`). The existing data-gap rendering (the three `DATA_GAP_CODES`) is unchanged. Keep the existing read-failure fallback ("couldn't read this show's data-quality notes") intact.

### 6.1 Mode boundaries & guard conditions (spec-review discipline)

- **Empty / no anchored warnings:** every surface renders exactly as today (the new list/section is absent when there are zero `OPERATOR_ACTIONABLE_ANCHORED` warnings). No empty headers.
- **`sourceCell` null (resolution failed / cron infra fault / ambiguous name):** render the warning line **without** the link (same as a non-anchored warning today). Never render a dead/empty link.
- **`driveFileId` absent:** `buildSheetDeepLink` returns null → no link (existing `Step3SheetCard` guard, `:382`).
- **Non-allowlisted tab:** `buildSheetDeepLink` falls back to the base sheet URL (existing behavior); INFO is allowlisted (`buildSheetDeepLink.ts:1`), so all four codes (crew/dates on INFO) get a precise region/cell link.
- **Read failure on per-show panel:** unchanged — the existing `failed` branch renders the fallback copy; the new section is simply not shown.
- **Multiple warnings on one cell — ordering + dedup:** a single role cell with several unknown tokens emits one `UNKNOWN_ROLE_TOKEN` per token (e.g. East Coast's `Strke` cascade → ~4), each carrying the **same** `blockRef.name` and therefore the **same** resolved anchor (the cell is the anchor unit, not the token). Because the surfaces render the catalog **title** ("Role we didn't recognize"), not the per-token `.message`, those lines would otherwise be visually identical. Rules:
  - **The two new durable surfaces (StagedReviewCard, per-show panel) dedup** the operator-actionable list by `(code, resolved-anchor-A1)` — collapsing the cascade to one line + one link, so the digest stays clean. The operator clicks through to the cell to see all offending tokens in context. **Warnings WITHOUT a resolved anchor are never deduped** (each renders on its own line) — the dedup key is the resolved A1 only, never the synthesis-unstable `blockRef.index`, so unrelated unanchored warnings can't be collapsed and the list is stable across re-parses (no actionable row is ever hidden).
  - **`Step3SheetCard` is unchanged** (renders the full per-warning list as today). It is the detailed pre-publish review where per-token fidelity is wanted, and altering shipped behavior is out of scope.
  - **Ordering:** stable parse order (the order warnings were emitted) on all surfaces — deterministic, no re-sort.
  - **No numeric cap:** the deduped operator-actionable list is bounded by crew rows × distinct anchors (small in practice); a cap would risk hiding a real issue.
  - A shared selector `operatorActionableWarnings(warnings)` (filter to `OPERATOR_ACTIONABLE_ANCHORED` → stable-order → dedup) is used by both new surfaces so the dedup/order rule lives in one place.

### 6.2 Dimensional invariants / transition inventory

**N/A — declared explicitly.** The UI additions are list items (a text line + an inline anchor) inside existing flow-layout containers; there is no fixed-dimension parent with flex/grid children whose dimensions must be pinned, and no multi-state animated component (the link is conditionally present, an instant render with no transition). No "Dimensional Invariants" or "Transition Inventory" table is required. Impeccable v3 critique + audit still gate the three surfaces (invariant 8).

## 7. Data flow (both ingestion paths)

```
parse (markdown) ──► warnings[] (UNKNOWN_ROLE_TOKEN/UNKNOWN_DAY_RESTRICTION carry blockRef.name; FIELD_UNREADABLE carries blockRef.kind; SCHEDULE_TIME_UNPARSED carries blockRef.iso)
   │
   ├─ ONBOARDING: runOnboardingScan.prepareOne ──► attachWarningAnchors(warnings, bytes, resolveGids=()=>listSheetGids(id)) ──► warnings[*].sourceCell
   └─ CRON:       runScheduledCronSync (~:2443)  ──► attachWarningAnchors(warnings, xlsxBytes, resolveGids=async()=>titleToGid, sourceAnchors) ──► warnings[*].sourceCell
   │
   ▼ persist warnings[] (with sourceCell) to shows_internal.parse_warnings (cron) / staged payload (onboarding)
   │
   ▼ RENDER: Step3SheetCard | StagedReviewCard | per-show panel
        title-or-message line + "Open in Sheet ↗" (when sourceCell resolved & code ∈ OPERATOR_ACTIONABLE_ANCHORED)
```

## 8. Error handling / degradation

- Any failure inside the shared helper (gid fetch, malformed bytes, scanner throw) is swallowed → warnings stay link-less, scan/sync never breaks (mirrors `runOnboardingScan.ts:950-952`).
- `hasCellAnchoredWarning` cost gate preserved on both paths: a sheet with no anchored warning pays **no** extra `listSheetGids` round-trip or grid walk.
- `xlsxBytes === undefined` on the cron path (existing guard, `:2443`) → helper returns early, link-less.
- Infra faults are never persisted as a "no warning" — the warning is always written; only its `sourceCell` may be null.

## 9. Risks & mitigations

- **Companion-surface drift** (highest): the new `extractCrewRoleAnchors` duplicates the parser's crew-block walk (CREW/TECH header detection, `detectColumns` `crew.ts:69-86`, `TERMINATING_LABELS` `crew.ts:31-48`, the `parseTechBlock` old-geometry split `crew.ts:194`). A divergence anchors the wrong cell. **Mitigation:** extract a shared header/column-detection helper used by both parser and scanner. The parity test must **not** be tautological — asserting only "scanner agrees with parser" proves nothing if both consume the same (possibly wrong) shared helper. Therefore the test pins the scanner's resolved A1 against **fixture-known, hand-verified cell expectations** for both geometries: e.g. old-template East Coast `Eric Weiss` → `INFO!B21` (the compound col-B cell), and a new-template fixture's role cell → the known `INFO!C<row>` (the dedicated ROLE column). These expected A1 values are derived from the raw fixture geometry independently of the implementation, so a shared-but-wrong helper fails the test.
- **Invariant 5 (raw-code leak):** surfaces must render the catalog title or human `.message`, never `w.code`. **Mitigation:** a meta/structural test asserting every `OPERATOR_ACTIONABLE_ANCHORED` code renders a non-code string on each new surface (clone-and-scrub the rendered tree; see anti-tautology rule).
- **Advisory lock (invariant 2):** the helper must add no `pg_advisory*`. **Mitigation:** pure-read helper; structural assertion that the helper module imports no DB client.
- **Cron-path anchor cost:** widening `CELL_ANCHORED_CODES` to the common `UNKNOWN_*` codes fires the `listSheetGids` fetch for more sheets. **Mitigation:** the `hasCellAnchoredWarning` gate already bounds this to sheets that actually have an anchored warning, and gids are fetched once per sheet; the crew grid walk is in-memory.
- **§12.4 lockstep:** avoided entirely by touching no catalog copy (§4.1). Guard: the plan forbids editing any of the four codes' catalog rows.
- **impeccable dual-gate (invariant 8):** the three UI surfaces require `/impeccable critique` AND `/impeccable audit` to pass (HIGH/CRITICAL fixed or DEFERRED) before adversarial review.

## 10. Meta-test inventory (declared)

- **CREATES:** `extractCrewRoleAnchors` ↔ parser parity structural test (companion-surface guard, §9). Invariant-5 render test for `OPERATOR_ACTIONABLE_ANCHORED` on each new surface. **`CELL_ANCHORED_CODES` ≡ `OPERATOR_ACTIONABLE_ANCHORED` membership-parity test** (§5.4) — pins that the anchor-population gate and the render gate never drift across the `lib/drive` ↔ `lib/parser` boundary (catches the HIGH-class bug where a code is renderable but never gets its anchor computed).
- **EXTENDS / INVERTS:** `tests/drive/showDayTimeAnchors.test.ts` — the assertions that `UNKNOWN_ROLE_TOKEN` gets no `sourceCell` (`:114/:118`) and `hasCellAnchoredWarning` is false for it (`:139-141`) MUST be inverted (these are negative-pins of the current absence; the plan must flag the change so it is not mistaken for a regression). `tests/onboarding/prepareSourceCellAnchors.test.ts` (scan-time gate/attach, `:59-77`) — extend to cover the cron path + the new codes.
- **NOT APPLICABLE:** advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — the helper adds no lock surface; Supabase call-boundary meta-test (`tests/auth/_metaInfraContract.test.ts`) — the helper performs no Supabase call (pure raw-workbook read); §12.4 admin-alert catalog — no catalog change.

## 11. Testing strategy (TDD per task)

Every task: failing test → minimal implementation → passing test → commit. Key tests:

- `blockRef.name` plumbed: `buildCrewMember` stamps `{kind:'crew', index, name: nameRaw}` on `UNKNOWN_ROLE_TOKEN` and `UNKNOWN_DAY_RESTRICTION` (both geometries fixtures).
- `extractCrewRoleAnchors`: new-template ROLE-column cell; old-template compound col-B cell; name parenthetical stripping; ambiguous-name → null; non-crew sheets → empty.
- Resolver dispatch in `attachSourceCellAnchors`: iso vs name vs region; `FIELD_UNREADABLE` → crew region; unknown `blockRef.kind` → null.
- Shared helper populates `sourceCell` on **both** onboarding and cron paths (the regression that this whole feature exists to fix); failure path leaves link-less.
- Invert the two negative-pin tests (§10).
- Surface render tests: each surface renders the title-or-message + link for anchored codes, no link when `sourceCell` null, no raw code (clone-and-scrub).
- **Derive expected values from fixture geometry** (anti-tautology): assert the resolved A1 against the fixture's known crew-row cell, not against the container that renders it.

## 12. Scope

**In scope (4 codes):** `SCHEDULE_TIME_UNPARSED`, `UNKNOWN_ROLE_TOKEN`, `UNKNOWN_DAY_RESTRICTION`, `FIELD_UNREADABLE` — anchors populated on both ingestion paths; rendered with deep links on Step-3, StagedReviewCard (3 modes), and the per-show panel.

**Explicitly out of scope (from the parse-warning audit — 51 codes classified):**
- `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED` — keep count-only (region weak / target empty).
- `TRAVEL_FLIGHT_*` — TRAVEL is allowlisted but bound to no `REGION_ANCHOR_SPEC` (needs a region spec first).
- `PULL_SHEET_*`, `AGENDA_*` — region-only (whole-tab), not actionable enough now.
- `DIAGRAMS_*`, `LINKED_FOLDER_*`, `EMBEDDED_ASSET_DRIFTED`, `AGENDA_PDF_*`, `AGENDA_SCHEDULE_*` — DIAGRAMS tab not allowlisted; faults live in external PDFs/assets, not sheet cells.
- `MI-1..MI-5b` hard-fail parser codes — block show creation; live on the failure screen, a different surface.
- `MI-6/7/7b/8/9/11/12/13/14` identity-and-diff holds — routed through the changes-feed / holds surface; intent/approval decisions, not sheet-cell fixes.
- info-severity (`ROLE_FLAGS_NOTICE`, `TYPO_NORMALIZED`, `DAY_RESTRICTION_DOUBLE_LOCATION`, `SHEET_PROCESS_FAILED`) and internal diagnostics (`UNEXPECTED_PARENT`, `SECTION_HEADER_NO_FIELDS`, dead `AGENDA_GRID_MALFORMED`).
- Adding new tabs to `SOURCE_LINK_ALLOWLIST` — separate decision.

## 13. Plan-wide invariants honored

1. **TDD per task** — every task is failing-test-first.
2. **Advisory lock single-holder** — helper is a pure read, no lock acquired (§5.6, §9).
5. **No raw error codes in UI** — title-or-message render pattern, meta-test (§3.1, §9, §10).
8. **UI quality gate** — impeccable v3 dual-gate on the three surfaces (§6, §9).
9. **Supabase call-boundary** — N/A for the helper (no Supabase call); existing reads on the surfaces unchanged.

No DB migration (the `sourceCell` field already exists in the `parse_warnings` jsonb; we only populate it on a new path). No §12.4 / x1 change.

## 14. Watchpoints (do NOT relitigate)

Contracts an adversarial reviewer is likely to challenge — each is a deliberate decision with its citation:

- **`FIELD_UNREADABLE` is REGION-anchored, not cell-anchored — by design.** Its `blockRef` carries only `{kind, index}` (`warnings.ts:74-95`) and the row index is not synthesis-stable (synthesis can reorder rows, `showDayTimeAnchors.ts:15-19`). Cell-anchoring it would require threading the crew name through `emitFieldUnreadable` (which fires for multiple sections, not just crew) — out of scope. Region (the block) is the conservative, correct granularity.
- **No catalog / §12.4 / x1 change — intentional.** The link renders from `sourceCell`, never from copy (§4.1). Do not propose editing any `dougFacing`/`title`/`helpfulContext`. Adding the crew name to a `.message` would trip the 3-part lockstep (`tests/messages/codes.test.ts`) for zero benefit.
- **Ambiguous-name → null is defensive, not load-bearing.** `MI-5a_DUPLICATE_CREW_NAME` hard-fails the parse on duplicate crew names, so a show that reaches the role-warning stage has unique names (confirmed across six live shows). The null-on-ambiguity guard exists for robustness; do not demand a heavier disambiguation (email key, fuzzy match) — exact-cell targeting prefers strict equality + degrade.
- **The crew scanner duplicates parser logic deliberately** — the parser runs on synthesized markdown that has lost A1 (`showDayTimeAnchors.ts:15-19`), so anchors MUST be reconstructed by re-walking the raw xlsx. This is the same ratified pattern as `extractShowDayTimeAnchors`. The drift risk is mitigated by a shared detection helper + a parser-parity structural test (§9), not by abandoning the re-walk.
- **The helper runs at the parse/prepare stage and acquires no lock — single-holder preserved.** It is a pure raw-workbook read; it does not touch the DB and does not call `pg_advisory*`. The cron lock (`lockedShowTx.ts:59/61`) is unaffected. Do not relitigate as an advisory-lock topology change.
- **Overwrite-on-reparse is correct.** Re-running the helper on a cron re-parse recomputes `sourceCell` from the current sheet (deterministic); the new value reflects the current cell. This mirrors the agenda-extraction precedent (deterministic recompute, embed↔schedule consistency) and is not a "low overwrites high" regression.
- **`SCHEDULE_TIME_UNPARSED` is in scope as a population+surface fix, not a re-implementation.** Its locator already exists and is unchanged; we only (a) run it on the cron path via the shared helper and (b) render its (already-built) anchor on the two new surfaces.
