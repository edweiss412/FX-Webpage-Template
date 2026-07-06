# Spec — Pull-sheet on archived ("OLD") tabs: detect + in-app override

**Date:** 2026-07-06
**Slug:** `pull-sheet-archived-tab-override`
**Status:** Draft → self-review → adversarial (Codex) → APPROVE
**Owner harness:** Opus / Claude Code (UI surface → Opus-only per ROUTING hard rule)

---

## 1. Problem

`lib/drive/exportSheetToMarkdown.ts:222` drops any worksheet whose name contains the word `OLD` (`/\bOLD\b/i`) **before** parsing, so an archived tab's stale prior-show gear can't contaminate the current show (owner decision `DEFERRED AUDIT-2026-06-18-PARSE-FIDELITY-DEF-2`). The drop is **silent**: no `ParseWarning`, no telemetry. `showDayTimeAnchors.ts:59` mirrors the same skip.

Consequence: when a show's only pull sheet lives on an OLD-named tab, step-3 review renders the identical `"No pack list parsed."` (`components/admin/wizard/step3ReviewSections.tsx:1323`) whether (a) no pull sheet ever existed, (b) we deliberately dropped a genuinely-archived one, or (c) we dropped a *current* pull sheet that Doug reused/kept under an OLD name. Three different situations collapse to one dead-end message. Case (c) is real: Doug reuses a prior show's pull sheet as a template or keeps it as reference.

**Verified live example** (`II - Redefining Fixed Income Forum / Private Credit Forum 2025`, sheet `1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg`): tabs are `INFO, AGENDA, DIAGRAMS, FORM, OLD PULL SHEET, LIST, CONTACTS, DROP DOWN`. The only pull sheet is on `OLD PULL SHEET`, whose header block reads `RIA - CHICAGO, IL / Lakeview - 7th Floor / Set: 4/15/24 - 7:00am` — genuinely a different show (RIA Chicago, 13 months prior). For this sheet the skip is correct; but the admin has no way to *see* that it was skipped or why.

## 2. Goals

1. **Un-silence the drop.** When an OLD-named tab actually contains a pull-sheet block, surface a `ParseWarning` (with the tab name + a header preview) so step-3 shows a look-before-publish prompt instead of a false `"No pack list parsed."`.
2. **In-app override.** Let an admin explicitly include one show's archived-tab pull sheet without editing the Google Sheet. Sticky and **content-pinned**: it auto-drops (and re-prompts) if the archived tab's content materially changes, so stale/swapped gear can never silently publish.
3. **Preserve the anti-contamination guard.** The default remains skip. The override un-skips **only the pull-sheet blocks** of **one** admin-named tab for **one** show — rooms, contacts, schedule, and time anchors on that tab stay skipped. The blanket `\bOLD\b` protection is intact for every non-accepted tab.

## 3. Non-goals

- No editing of parsed content in-app (the sheet remains source of truth). The override selects *which existing tab's pull sheet to ingest*; it never lets an admin type gear.
- No change to the "current" (non-OLD) pull-sheet path — content-based detection (`parsePullSheet`) already parses a pull sheet on any non-dropped tab regardless of tab name.
- No auto-inclusion. Absent an explicit admin accept, an OLD tab's pull sheet is never ingested.
- Fix-in-sheet stays available (Doug renames the tab to remove "OLD" → parses automatically) — it is the *alternative*, not removed.

## 4. Resolved decisions (single source of truth — every later section references these)

| # | Decision | Value |
|---|---|---|
| D1 | Resolution mechanism | **In-app override** (admin accepts), not fix-in-sheet-only and not a hard publish block. |
| D2 | Override stickiness | **Sticky, content-pinned.** Persists across syncs while the archived tab's pull-sheet fingerprint is unchanged; auto-drops + re-prompts on material change. |
| D3 | Override storage | New nullable `jsonb` column `pull_sheet_override` on **both** `public.pending_syncs` (onboarding preview) and `public.shows` (durable / cron), propagated preview→durable at publish — mirroring `source_anchors` (`20260622000000_add_source_anchors.sql`, `20260701000001_pending_syncs_source_anchors.sql`). |
| D4 | Override shape | `{ "tabName": string, "fingerprint": string, "acceptedBy": string, "acceptedAt": string }` (ISO). `null`/absent = skipped (default). |
| D5 | Fingerprint | SHA-256 hex of the archived tab's **normalized pull-sheet grid** (the cell rows that feed `parsePullSheet` for that tab), computed in the exporter layer where the xlsx bytes are available. |
| D6 | Un-skip granularity | The exporter emits **only pull-sheet-shaped blocks** from an accepted tab; all other blocks from it are discarded. Time-anchor path (`showDayTimeAnchors.ts`) and room/other-block emission stay unconditionally OLD-skipping. |
| D7 | New §12.4 codes | `PULL_SHEET_ON_ARCHIVED_TAB` (warn, audience `doug`, data-gap class) and `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (forensic, audience `health`, auto-drop event). |
| D8 | Accept/revoke surface | New admin-gated route under `app/api/admin/onboarding/` calling a `SECURITY DEFINER` RPC that holds `pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`; persists override to `pending_syncs.pull_sheet_override` then triggers the existing re-scan. Revoke sets it `null` + re-scans. |
| D9 | Telemetry | Accept/revoke ride `logAdminOutcome` (admin mutation, invariant 10 → `AUDITABLE_MUTATIONS` + behavioral proof). Auto-drop (cron) emits `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`. |

## 5. Architecture — units

### 5.1 Detection (exporter layer)

`lib/drive/exportSheetToMarkdown.ts` — `synthesizeMarkdownFromXlsx(bytes)` gains an options object and a richer return:

```ts
synthesizeMarkdownFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string }
): { markdown: string; archivedPullSheetTabs: ArchivedPullSheetTab[] }
```

- `ArchivedPullSheetTab = { tabName: string; headerPreview: string; fingerprint: string }`.
- For every worksheet dropped by the `\bOLD\b` rule, before dropping, run the pull-sheet header detector (a cell whose value contains `"PULL SHEET"`, case-insensitive — the same signature `pull-sheet.ts:60` uses). If present, compute `headerPreview` (first non-blank block's up-to-4 lines, `&#10;`/newlines flattened to `" / "`, length-capped 120 chars) and `fingerprint` (D5), and record an `ArchivedPullSheetTab`. Still drop the tab from `markdown` (unless it is the accepted tab — see next).
- When `opts.includePullSheetFromTab === sheetName` for an OLD tab, that tab is **not** dropped, but only its pull-sheet blocks are emitted (D6): run `normalizePullSheetGrid` (already name-gated to `/PULL SHEET/i`, which "OLD PULL SHEET" matches) + `splitBlocks`, keep only blocks whose header row satisfies the all-cells-contain-"PULL SHEET" test, discard the rest.

**Return-shape callers.** `synthesizeMarkdownFromXlsx` is called at `lib/drive/fetch.ts:497` and `:614` (both returning `{ markdown, bytes }` from the fetch helpers). Update both to also surface `archivedPullSheetTabs` up to the sync layer, and to accept + thread `includePullSheetFromTab`. Every existing caller that destructures `synthesizeMarkdownFromXlsx(...)` as a bare string must move to `.markdown` (grep-swept in the plan).

> **Backwards-compat guard:** the second OLD-skip site `lib/drive/showDayTimeAnchors.ts:59` is **not** touched — an accepted pull-sheet tab must still be invisible to time-anchor extraction (its stale SHOW DAY grid must never anchor the current show). This is the single-holder rule for the un-skip: it lives only in the exporter's pull-sheet emission path.

### 5.2 Warning emission (sync layer)

The sync layer (`lib/sync/runOnboardingScan.ts`, `lib/sync/runScheduledCronSync.ts`, `lib/sync/applyStaged.ts` via `fetchSheetMarkdown*`) receives `archivedPullSheetTabs`. For each such tab **not** currently the accepted tab, push a `ParseWarning`:

```ts
{ severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB",
  message: <catalog copy>, rawSnippet: headerPreview,
  blockRef: { kind: "pull_sheet_archived_tab", name: tabName } }
```

This flows through the existing warnings→`pending_syncs`→step-3 pipeline. `PULL_SHEET_ON_ARCHIVED_TAB` is added to `GAP_CLASSES` (`lib/parser/dataGaps.ts:50-52`) so it counts in `summarizeDataGaps` / the `DataQualityBadge`.

If the accepted tab is present and its fingerprint **matches** the stored override → no warning; the pull sheet is included (5.1). If accepted but fingerprint **mismatches** (content changed) → clear the override (write `null`), emit `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (forensic), and fall through to emit `PULL_SHEET_ON_ARCHIVED_TAB` so the admin re-confirms.

### 5.3 Override read (sync layer)

Before invoking the exporter, the sync/scan path reads the row's `pull_sheet_override` (onboarding: `pending_syncs`; cron: `shows`). If present, it passes `includePullSheetFromTab: override.tabName` to the exporter **and** compares `fingerprint`. This is the only place stickiness + content-pin is enforced (5.2 handles the mismatch branch).

### 5.4 Accept / revoke (admin action)

- New route `app/api/admin/onboarding/pull-sheet-override/route.ts` (`POST`), admin-gated (`requireAdmin`/`requireAdminIdentity` per the existing onboarding routes). Body: `{ driveFileId, wizardSessionId, tabName | null }`. `tabName` set = accept; `null` = revoke.
- Calls a new `SECURITY DEFINER` RPC `set_pull_sheet_override(p_drive_file_id, p_wizard_session_id, p_tab_name, p_fingerprint, p_accepted_by)` that:
  - holds `pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id))` (invariant 2 single-holder; the route/JS does **not** take the lock),
  - writes `pending_syncs.pull_sheet_override` (`null` on revoke),
  - is the sole writer of that column at the onboarding layer.
- On success the route triggers the existing re-scan (`app/api/admin/onboarding/rescan-sheet/route.ts` path) so the preview re-parses with the pull sheet included/excluded. Accept therefore re-runs 5.3 with the new override present.
- Fingerprint for accept is taken from the `archivedPullSheetTabs` entry the UI already holds for that tab (the route re-derives/validates it from a fresh detect to avoid trusting client input — the fingerprint written is the server-computed one).
- Post-commit, outside the lock tx: `logAdminOutcome({ code: "PULL_SHEET_OVERRIDE_SET" | "PULL_SHEET_OVERRIDE_CLEARED", ... })` (forensic admin codes; §12.4-exempt via the admin-outcome contract, same as existing `logAdminOutcome` codes). No secret is logged; the tab name is not a secret.

### 5.5 Publish propagation

At publish/apply (`lib/sync/applyStaged.ts`), `pending_syncs.pull_sheet_override` is copied to `shows.pull_sheet_override`, exactly as `source_anchors` is propagated. Cron sync (post-publish) reads `shows.pull_sheet_override`.

### 5.6 Step-3 UI (Pack list section)

`components/admin/wizard/step3ReviewSections.tsx` `PackListBreakdown` (label `"Pack list"`, `:1319`/`:2599`) gains states driven by (a) `pr.pullSheet` (`PullSheetCase[]`), (b) the row's `PULL_SHEET_ON_ARCHIVED_TAB` warning (name + `rawSnippet` preview), and (c) whether an override is active (`pull_sheet_override` non-null on the row):

| State | Condition | Render |
|---|---|---|
| **S1 Empty** | no pull sheet, no archived-tab warning | `"No pack list parsed."` (unchanged) |
| **S2 Offer** | archived-tab warning present, no active override | Warning card: `"Found a pull sheet on archived tab '{tabName}' — header reads '{preview}'. If this is this show's gear, include it; otherwise leave it skipped."` + `[Use this show's gear]` / `[Keep skipped]` |
| **S3 Included** | override active, fingerprint matches (pull sheet populated) | Pack list rendered normally + subtle note `"Included from archived tab '{tabName}'."` + `[Revoke]` |
| **S4 Re-confirm** | override was active but content changed (warning re-fired, pull sheet empty) | Warning card as S2 + prefix `"The archived tab '{tabName}' changed — re-confirm before it publishes."` |

Buttons call the 5.4 route; on success the wizard re-fetches the (re-scanned) preview. All copy routed through the catalog (`lib/messages/lookup.ts`) — no raw codes (invariant 5).

## 6. Guard conditions (per input)

- `pr.pullSheet` null/empty → S1 (or S2/S4 if a warning is present). Empty array never crashes `PackListBreakdown`.
- `archivedPullSheetTabs` empty → no warning, no S2/S4.
- `headerPreview` empty string (OLD tab with a pull-sheet header row but blank block-4) → preview renders as `"(no header text)"`; warning still fires (a pull-sheet block exists).
- Multiple OLD tabs each with a pull-sheet block → one `PULL_SHEET_ON_ARCHIVED_TAB` warning **per tab**; S2 lists each with its own accept button; override `tabName` disambiguates. (Cap: render all; realistic count ≤2. State it, don't truncate.)
- `tabName` in override no longer present on the sheet (tab deleted/renamed) → detect finds no matching tab → override treated as content-changed → cleared + `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` + (if another OLD pull-sheet tab exists) S2, else S1.
- Fingerprint of accepted tab === stored → include (S3). Non-loopback/whitespace-only differences are normalized out before hashing (D5 normalization) so cosmetic reformat doesn't drop the override; only material cell-content change does.
- Client-supplied `fingerprint`/`tabName` in the accept POST are **not trusted**: the RPC writes the server-computed fingerprint from a fresh detect. If the named tab has no pull-sheet block server-side → route returns a typed error (no override written), surfaced via lookup copy.
- Concurrent accept + cron sync on the same show → serialized by the show advisory lock (single-holder); no double-write.

## 7. Flag lifecycle table (the override)

| Flag | Storage | Write path(s) | Read path(s) | Effect on output |
|---|---|---|---|---|
| `pull_sheet_override` | `pending_syncs.pull_sheet_override` jsonb (onboarding), `shows.pull_sheet_override` jsonb (durable) | `set_pull_sheet_override` RPC (accept/revoke, 5.4); auto-clear in sync on fingerprint mismatch (5.2); publish propagation pending→shows (5.5) | Sync/scan override-read (5.3) → threads `includePullSheetFromTab` to exporter; step-3 `PackListBreakdown` (5.6) reads presence for S3/S4 | When set + fingerprint matches: that tab's pull-sheet blocks are ingested → `pr.pullSheet` populated → crew Pack list shows the gear. When null: default skip. |

No zombie: every column of the row is populated (storage, ≥1 write, ≥1 read, concrete effect).

## 8. DB layer matrix (single DB-touching change: the new column)

| Layer | Action |
|---|---|
| Table DDL | `alter table public.pending_syncs add column if not exists pull_sheet_override jsonb;` and same for `public.shows`. Nullable, default `null` (NOT `'{}'` — null is the meaningful "skipped" sentinel, distinct from source_anchors' `'{}'` default). |
| Inline CHECK | None (free-form jsonb, shape enforced in app). CHECK/enum migration matrix → **N/A** (no CHECK, no enum). |
| RPC write path | `set_pull_sheet_override` SECURITY DEFINER (D8), advisory-locked. |
| RPC read path | Existing staged-read / cron-read RPCs `select` the new column (additive; add to their projections). |
| Propagation | `applyStaged` publish copies `pending_syncs.pull_sheet_override` → `shows.pull_sheet_override` (5.5). |
| Cleanup | Onboarding cleanup/reset flows that clear `pending_syncs` rows already delete the whole row (`runOnboardingScan.ts:489`) → column goes with it; no separate cleanup needed. Verify no `pending_syncs`-column-list INSERT omits it where it must carry. |
| PostgREST DML lockdown | `pull_sheet_override` is written only via the SECURITY DEFINER RPC. If `pending_syncs`/`shows` already REVOKE direct DML from `authenticated`/`anon` (RPC-gated), the new column inherits that; confirm in plan and add a structural note. No new table → no new lockdown migration unless the tables aren't already locked. |
| Frontend | `PackListBreakdown` states (5.6); accept/revoke buttons. |
| Manifest / validation | `pnpm gen:schema-manifest` regenerated + committed; migration applied surgically to validation project `vzakgrxqwcalbmagufjh`; `validation-schema-parity` gate green. |
| Tests | Detection unit, fingerprint stability, un-skip granularity (rooms not leaked), warning emission, override read/include, content-change auto-drop, publish propagation, RPC advisory-lock held, route admin-gate + AUDITABLE_MUTATIONS behavioral proof, step-3 S1–S4 rendering, DataQualityBadge count. |

## 9. §12.4 codes (each = full 4-gate lockstep: spec §12.4 prose + `pnpm gen:spec-codes` → `spec-codes.ts` + `catalog.ts` row; run full `tests/messages/`)

| Code | Severity | Audience | Class | Copy intent |
|---|---|---|---|---|
| `PULL_SHEET_ON_ARCHIVED_TAB` | warn | doug | data-gap (`GAP_CLASSES`) | "A pull sheet was found on an archived tab ('{tab}') and left out. If it's this show's gear, include it in review; otherwise ignore." |
| `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` | warn | health | forensic (not a data-gap class) | "An included archived-tab pull sheet changed and was set back to skipped for safety; admin must re-confirm." |

`logAdminOutcome` forensic codes `PULL_SHEET_OVERRIDE_SET` / `PULL_SHEET_OVERRIDE_CLEARED` follow the admin-outcome §12.4-exemption contract (`_metaAdminOutcomeContract`), not new §12.4 rows — matching existing `logAdminOutcome` usage.

> **Namespace guard (M8 lesson):** none of the four new codes may collide with a subsystem prefix scanner (e.g. `REPORT_*`). `PULL_SHEET_*` is an established parser namespace (`PULL_SHEET_PARSE_PARTIAL` et al.) — safe.

## 10. Transition inventory — Pack list section (states S1–S4)

4 states → 6 pairs. All transitions are **content swaps on re-fetch after a re-scan** (the section re-renders from new preview data); there is no in-place animation requirement (the wizard already re-renders step-3 cards on re-scan without bespoke transitions).

| Pair | Trigger | Treatment |
|---|---|---|
| S1↔S2 | archived-tab warning appears/clears between scans | instant — re-render, no animation |
| S2→S3 | admin accepts → re-scan includes pull sheet | instant — re-render |
| S3→S2/S4 | admin revokes (S2) / content changed (S4) | instant — re-render |
| S2↔S4 | S4 is S2 + a prefix line | instant — re-render (same card, extra line) |
| S1↔S3 | first accept from a no-warning state (not reachable: S3 requires a prior S2) | N/A — unreachable |
| S1↔S4 | content-change from empty (unreachable: S4 requires a prior override) | N/A — unreachable |

Compound: accept while a cron sync is mid-flight → serialized by advisory lock (§6); UI shows stale state until re-fetch, then resolves to S3/S4. No mid-animation compound case (transitions are instant).

## 11. Dimensional invariants

`PackListBreakdown` is not a fixed-dimension parent with flex/grid children requiring stretch guarantees; it is flow content inside the section card. **No dimensional-invariant obligations** beyond existing section styling. (Stated explicitly per the checklist; a real-browser layout task is therefore **not** required for this feature — noted for the plan so it isn't added reflexively.)

## 12. Numeric sweep

- OLD-skip regex: `/\bOLD\b/i` (unchanged, `exportSheetToMarkdown.ts:222`, `showDayTimeAnchors.ts:59`).
- `headerPreview` cap: 120 chars; up to 4 lines.
- New §12.4 codes: **2** warn codes + **2** forensic admin-outcome codes.
- New DB columns: **2** (`pending_syncs`, `shows`), both `jsonb` nullable default `null`.
- OLD-skip sites: **2** (exporter un-skipped conditionally; anchors never).
- `synthesizeMarkdownFromXlsx` call sites to migrate to `.markdown`: enumerate in plan (≥2 known: `fetch.ts:497`, `:614`).
- Realistic OLD-pull-sheet-tab count per show: ≤2 (render all; no truncation).

## 13. Meta-test inventory

- **Extends** `tests/log/_auditableMutations.ts` (`AUDITABLE_MUTATIONS`) + `tests/log/adminOutcomeBehavior.test.ts` — the accept/revoke route is an admin mutation (invariant 10).
- **Extends** advisory-lock topology pin `tests/auth/advisoryLockRpcDeadlock.test.ts` (or `_advisoryLockSingleHolderContract.test.ts`) — `set_pull_sheet_override` is a new `show:`-keyed lock holder; single-holder (RPC only, not JS).
- **Extends** §12.4 catalog parity (`tests/messages/codes.test.ts`) — 2 new rows.
- **Extends** `lib/parser/dataGaps.ts` GAP_CLASSES → the data-gap drift guard (`tests/…` for `summarizeDataGaps`).
- **No** new Supabase call-boundary registry surface beyond the standard `{ data, error }` discipline for the new route/RPC caller (add row or inline exemption per invariant 9).
- **No** sentinel-hiding / admin-alert-catalog meta-test applies (no `admin_alerts.upsert`).

## 14. Disagreement-loop preempts (for the reviewer)

- **DEF-2 is not being reverted.** Default remains skip; the override is explicit, per-show, per-tab, content-pinned, and un-skips **only** pull-sheet blocks (D6). Cite `exportSheetToMarkdown.ts:217-222` — the guard's rationale is preserved for every non-accepted tab.
- **Single-holder lock.** The advisory lock is taken **only** in `set_pull_sheet_override` RPC, never in the JS route (invariant 2; M5 R20 deadlock class). The route→RPC is one holder.
- **Storage on both tables is intentional**, mirroring `source_anchors` (not a redundancy) — onboarding preview vs durable cron read, propagated at publish.
- **`null` default (not `'{}'`) is intentional** — null is the "skipped" sentinel; source_anchors uses `'{}'` because empty-map is its neutral, but override's neutral is absence.
- **Fingerprint is server-computed, client input untrusted** (§6) — not a trust hole.
- **Content-pin auto-drop is fail-safe** (drops to skip + re-prompts, never auto-includes changed content) — the conservative direction.

## 15. Testing — concrete failure modes each test catches

1. **Detection**: OLD tab with a pull-sheet header → `archivedPullSheetTabs` has one entry with correct `tabName`/preview/fingerprint. Catches: silent-drop regression.
2. **No-pull-sheet OLD tab**: OLD tab without a pull-sheet block → no entry, no warning. Catches: false-positive warnings on genuinely-archived non-gear tabs.
3. **Un-skip granularity**: accepted OLD tab that ALSO contains a rooms/contacts block → `markdown` includes the pull-sheet block but **not** the stale rooms/contacts; parsed `rooms`/`contacts` unaffected. Catches: cross-contamination re-introduction (the core DEF-2 risk).
4. **Fingerprint stability**: cosmetic reformat (whitespace, blank rows) → same fingerprint; a changed QTY/ITEM cell → different fingerprint. Catches: over-eager auto-drop and under-eager (missed) content change. Derive expected from fixture cell edits, not hardcoded hashes.
5. **Override read/include**: override set + matching fingerprint → `pr.pullSheet` populated from that tab. Catches: override not threaded.
6. **Content-change auto-drop**: override set, tab content changed → override cleared, `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` emitted, `PULL_SHEET_ON_ARCHIVED_TAB` re-fired, `pr.pullSheet` empty. Catches: stale gear silently publishing.
7. **Publish propagation**: `pending_syncs.pull_sheet_override` → `shows.pull_sheet_override` at apply. Catches: override lost at publish (cron would re-skip).
8. **Advisory lock**: `set_pull_sheet_override` holds `show:`-keyed lock; JS route does not. Catches: deadlock / lock-not-held.
9. **Admin gate + behavioral proof**: route requires admin; success branch records the outcome code (sink-spy after committed success). Catches: dark mutation surface (invariant 10).
10. **Step-3 S1–S4**: each state renders the right copy/buttons from (pullSheet, warning, override) inputs; empty/multi-tab guards. Anti-tautology: assert against the section's data inputs, and when scanning DOM for the tab name, scope to the Pack list section (remove sibling sections that might independently render a tab name).
11. **DataQualityBadge**: a `PULL_SHEET_ON_ARCHIVED_TAB` warning increments the gap count. Catches: badge not reflecting the new gap class.

---

## Appendix — verified live-code citations

- `lib/drive/exportSheetToMarkdown.ts:206` `synthesizeMarkdownFromXlsx`, `:217-222` OLD-skip, `:123-147` `normalizePullSheetGrid` (name-gated `/PULL SHEET/i`), `:104-121` `splitBlocks`.
- `lib/parser/pull-sheet.ts:33` `parsePullSheet`, `:59-60` `isPullSheetHeader` signature.
- `lib/parser/types.ts:4-14` `ParseWarning` (`severity`/`code`/`message`/`blockRef`/`rawSnippet`), `:210-217` `PullSheetItem`/`PullSheetCase`, `:378`/`:404` `pullSheet` on `ParsedSheet`/`ParseResult`.
- `lib/parser/dataGaps.ts:50-52` `GAP_CLASSES`, `:69` `DATA_GAP_CODES`, `:85` `summarizeDataGaps`.
- `lib/drive/fetch.ts:497`,`:614` exporter call sites.
- `lib/drive/showDayTimeAnchors.ts:58-59` second OLD-skip (mirror, untouched).
- `components/admin/wizard/step3ReviewSections.tsx:1319`/`:1323` Pack list label + "No pack list parsed.", `:2053` `pullSheet: PullSheetCase[]`, `:2599`/`:2604` `PackListBreakdown`.
- `components/admin/wizard/Step3SheetCard.tsx:429` `arr(pr.pullSheet)`.
- `app/api/admin/onboarding/rescan-sheet/route.ts` (re-scan trigger).
- `supabase/migrations/20260622000000_add_source_anchors.sql:5` `shows.source_anchors` precedent; `20260701000001_pending_syncs_source_anchors.sql:9` pending_syncs mirror.
- `supabase/migrations/20260502000000_dev_schema_clone.sql:412` / `20260504000004_...:29` `pg_advisory_xact_lock(hashtext('show:'||…))` precedent.
- `supabase/migrations/20260601000000_b2_show_lifecycle.sql:23,129` `shows.published`.
- `lib/log/logAdminOutcome.ts:27` `logAdminOutcome`; `tests/log/_auditableMutations.ts:13` `AUDITABLE_MUTATIONS`.
- `lib/messages/catalog.ts:1255`/`:1411` existing `PULL_SHEET_*` catalog rows; `lib/messages/__generated__/spec-codes.ts:869-881` generated `PULL_SHEET_*`.
- Live sheet `1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg` tab list + `OLD PULL SHEET` header (§1), read via gsheets MCP 2026-07-06.
