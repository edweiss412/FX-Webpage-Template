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
| D5 | Fingerprint | SHA-256 hex over **all pull-sheet CASE REGIONS inclusion would emit from the tab** — each region = a `PULL SHEET` header through its `collectDataBlock` item rows (`pull-sheet.ts:92`), the exact span `parsePullSheet` consumes (Codex R7) — header/preview cells AND item rows, concatenated in stable order — normalized (whitespace/blank-row collapsed so cosmetic reformat is stable), computed in the exporter where the xlsx bytes are available. Three coverage mandates: (a) header cells, not just items, so a header-only re-heading changes it (Codex R5); (b) *every* emitted region, not just the first, so a change to any case in a multi-case tab changes it (Codex R6); (c) the full `collectDataBlock` span, so item rows in a later block are pinned, not dropped (Codex R7). Fingerprint unit ≡ emitted unit ≡ parsed unit ≡ reviewed unit. |
| D6 | Un-skip granularity | The exporter emits **exactly the collected pull-sheet case regions** (header + `collectDataBlock` items — the same set the fingerprint covers) from an accepted tab; all other blocks from it are discarded. Time-anchor path (`showDayTimeAnchors.ts`) and room/other-block emission stay unconditionally OLD-skipping. |
| D7 | New §12.4 codes | `PULL_SHEET_ON_ARCHIVED_TAB` (warn, audience `doug`, data-gap class) and `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (forensic, audience `health`, auto-drop event). |
| D8 | Accept/revoke surface | New admin-gated route under `app/api/admin/onboarding/` calling a `SECURITY DEFINER` RPC that holds `pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`; persists override to `pending_syncs.pull_sheet_override` then triggers the existing re-scan. Revoke sets it `null` + re-scans. Accept is compare-and-set against the reviewed `expectedFingerprint` (5.4). |
| D10 | Staged consistency | `pending_syncs.pull_sheet_override_applied jsonb` stores `overrideSnapshot(...)` = `{ tabName, fingerprint } | null` the staged parse was produced under; apply refuses when it ≠ `overrideSnapshot(desired override for that path)` — Flow A live `pending_syncs` override, Flow B payload-carried override, **Flow C live cron durable `shows.pull_sheet_override`** (5.8, Codex R8/R11), audit fields excluded. Lives on **all** `pending_syncs` rows (wizard AND live partitions) + shadow-payload-carried; not a durable `shows` column. |
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

- `ArchivedPullSheetTab = { tabName: string; headerPreviews: string[]; fingerprint: string; included: boolean; contentChangedSinceAccept: boolean }`. `headerPreviews` has **one entry per emitted case region** (Codex R9 finding 1) — because accepting one tab-level offer ingests *every* case on the tab, the admin must be shown *every* case's show-identifying header, not just the first. Each preview = that region's up-to-4 header lines (`&#10;`/newlines flattened to `" / "`, capped 120 chars). `contentChangedSinceAccept` is set `true` on the offer the sync layer emits when it just auto-cleared an active override due to content drift (5.2) — it carries the auto-drop event into Step 3 so S4's changed-specific copy is reachable (Codex R10 finding 2); `false` for a first-time offer.
- **Single source of truth for detection/regions/fingerprint/emission = the emitted markdown the parser consumes** (plan-R3 finding 2): detection, region-splitting, `fingerprint`, and the emitted bytes are all derived from the same per-tab pull-sheet markdown that `parsePullSheet` would read (`normalizePullSheetGrid` → `splitBlocks` → `tableMarkdown`), so **emitted ≡ hashed ≡ parsed** (I1). **`headerPreviews` are the one exception, and come from the RAW grid** (implementation finding): `normalizePullSheetGrid` collapses case-1's identity/title rows AND the `QTY/ITEM` column-header row into a single synthetic `PULL SHEET/<…>/QTY/ITEM` cell, and does NOT collapse a *second* case's identity into any synthetic cell at all — so an `extractCaseLabel`-style split of the synthetic cell cannot recover each case's clean show identity (it captures the column header and misses later cases). Instead, `headerPreviews[i]` = the first non-blank row after the *i*-th raw all-cells-"PULL SHEET" header row (`" / "`-joined, capped 120, `"(no header text)"` when empty), index-aligned to the emitted regions. This still guarantees I2 — the admin sees **every** case's show-identity line before accepting — while keeping the fingerprint/emission on the normalized-markdown single source. The preview is a review aid; the fingerprint (over emitted bytes) remains the change-detection authority.
- **The unit is a parser CASE REGION, not a split block** (Codex R7 finding 1). In the live parser, a pull-sheet case starts at a header row (all cells contain "PULL SHEET") and its item rows are gathered by `collectDataBlock` (`pull-sheet.ts:92`), which scans **forward across blank/separator-bounded blocks** to the next PULL-SHEET header — item rows frequently live in a *later* block than the header. Collecting only the header block would emit/hash the header and drop the items. So detection/emission/fingerprint all operate on the **case region**: from each pull-sheet header through the data block `collectDataBlock` selects, stopping before the next pull-sheet header. This is exactly the span `parsePullSheet` consumes, so what is emitted, hashed, and later parsed are the same bytes.
- **Detection is independent of the include/drop decision and runs for EVERY OLD tab — including the accepted one** (Codex R6 finding 2). For each worksheet matched by the `\bOLD\b` rule, run `normalizePullSheetGrid` (name-gated `/PULL SHEET/i`, which "OLD PULL SHEET" matches) then walk it with the same header predicate (`cells.every(c => c.toUpperCase().includes("PULL SHEET"))`, `pull-sheet.ts:60`) + `collectDataBlock` region rule. If ≥1 case region exists, record one `ArchivedPullSheetTab` for the tab. A stale notes/contact/room OLD tab that merely mentions "pull sheet" in one cell has no header-predicate row → no region → no entry, no warning, no offer.
- **Fingerprint unit == emitted unit == reviewed unit** (Codex R6 finding 1 + R7 finding 1 + R9 finding 1): `fingerprint` is computed over **every case region inclusion would emit from this tab** — each region's header/preview cells AND its `collectDataBlock` item rows, concatenated in stable order (D5). One offer per tab; the pin covers *all* cases (even non-first), so a change to any case's header or items changes the fingerprint. `headerPreviews[]` shows the admin **every** emitted region's header so the reviewed content matches the pinned content (a hash is not reviewable — the admin must see each case's show-identity header before accepting). The fingerprint remains the authority for change-detection; the previews are what makes "reviewed" honest.
- `archivedPullSheetTabs` is returned for every such OLD tab regardless of inclusion. The entry for the tab named by `opts.includePullSheetFromTab` has `included: true` (its current fingerprint is still returned, so the sync layer can compare against the stored override and drive match-vs-content-changed — 5.2); all others `included: false`.
- **Emission:** when `opts.includePullSheetFromTab === sheetName` for an OLD tab, that tab is **not** dropped, and exactly the collected case regions (the same set the fingerprint covers) are emitted; every non-pull-sheet block on it is discarded (D6). All other OLD tabs are dropped from `markdown` entirely.

**Return-shape callers.** `synthesizeMarkdownFromXlsx` is called at `lib/drive/fetch.ts:497` and `:614` (both returning `{ markdown, bytes }` from the fetch helpers). Update both to also surface `archivedPullSheetTabs` up to the sync layer, and to accept + thread `includePullSheetFromTab`. Every existing caller that destructures `synthesizeMarkdownFromXlsx(...)` as a bare string must move to `.markdown` (grep-swept in the plan).

> **Backwards-compat guard:** the second OLD-skip site `lib/drive/showDayTimeAnchors.ts:59` is **not** touched — an accepted pull-sheet tab must still be invisible to time-anchor extraction (its stale SHOW DAY grid must never anchor the current show). This is the single-holder rule for the un-skip: it lives only in the exporter's pull-sheet emission path.

### 5.2 Warning emission (sync layer)

The sync layer (`lib/sync/runOnboardingScan.ts`, `lib/sync/runScheduledCronSync.ts`, `lib/sync/applyStaged.ts` via `fetchSheetMarkdown*`) receives `archivedPullSheetTabs` (one entry per OLD tab that has a pull-sheet block, each carrying its **current** fingerprint and `included` flag). For each entry with `included: false`, push a `ParseWarning`:

```ts
{ severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB",
  message: <catalog copy>, rawSnippet: headerPreviews.join(" | "),
  blockRef: { kind: "pull_sheet_archived_tab", name: tabName } }
```

This flows through the existing warnings→`pending_syncs`→step-3 pipeline. `PULL_SHEET_ON_ARCHIVED_TAB` is added to `GAP_CLASSES` (`lib/parser/dataGaps.ts:50-52`) so it counts in `summarizeDataGaps` / the `DataQualityBadge`.

The warning alone is **not** sufficient transport for the `expectedFingerprint` the accept route needs (Codex R4 finding 1: `ParseWarning` has only `severity`/`code`/`message`/`blockRef`/`rawSnippet` — no fingerprint field). See 5.9 for the durable fingerprint transport.

For the `included: true` entry (the accepted tab), the sync layer compares its **returned current fingerprint** to the stored override's fingerprint: **match** → no warning; the pull sheet stays included (5.1).

**Mismatch** (content changed, incl. header-only, 5.1/D5) is a **discard-and-rerun**, not a stage-then-flag (Codex R9 finding 2). The exporter emitted the accepted tab's (now-changed) case regions into `markdown` because the *override row* still matched the pre-lock snapshot (5.7 only catches an override-row change, not sheet-content drift under an unchanged override). So the just-produced parse **already contains the changed gear** and MUST NOT be staged. Under the `show:` lock the sync path:
1. clears the override (write `null`) + emits `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (forensic);
2. treats the current parse as **unusable** and **re-exports/re-parses WITHOUT `includePullSheetFromTab`** (a no-override parse), staging THAT result with `pull_sheet_override_applied = null`. The no-override re-parse **preserves any current non-OLD pull sheet** and drops only the OLD-tab gear (plan-R4 finding 1) — it is NOT force-emptied. `parse_result.pullSheet` is empty only when the workbook has no non-OLD pull sheet; if a valid current pull sheet exists on a normal tab, it survives. The invariant is "no *changed OLD-tab* gear reaches the staged pullSheet," not "the pullSheet is emptied";
3. re-emits an `included: false` offer with `contentChangedSinceAccept: true` (`PULL_SHEET_ON_ARCHIVED_TAB` + S4 re-confirm) carrying the *new* previews/fingerprint for re-review. The persisted `contentChangedSinceAccept` flag (5.1/5.9) is what lets Step 3 render S4 ("changed — re-confirm") vs a first-time S2, even though the override is now `null` (Codex R10 finding 2).

The changed archived gear therefore never reaches a staged/published `pullSheet`. The accepted tab always returns comparable fingerprint metadata, so the auto-drop path can never be defeated by the tab being un-dropped.

### 5.3 Override read (sync layer)

Before invoking the exporter, the sync/scan path reads the row's `pull_sheet_override` (onboarding: `pending_syncs`; cron: `shows`). If present, it passes `includePullSheetFromTab: override.tabName` to the exporter **and** compares `fingerprint`. This is the only place stickiness + content-pin is enforced (5.2 handles the mismatch branch).

### 5.4 Accept / revoke (admin action)

- New route `app/api/admin/onboarding/pull-sheet-override/route.ts` (`POST`), admin-gated (`requireAdmin`/`requireAdminIdentity` per the existing onboarding routes). Body: `{ driveFileId, wizardSessionId, tabName, expectedFingerprint } | { driveFileId, wizardSessionId, tabName: null }`. `tabName` set = accept; `null` = revoke.
- **Accept is compare-and-set on the reviewed content** (Codex R2 finding 1): the admin approved the header/preview the S2/S4 card rendered, which corresponds to a specific `expectedFingerprint`. The route fresh-detects the tab's current server-side fingerprint and **rejects with a typed re-prompt error if it differs from `expectedFingerprint`** — so if the OLD tab changed between render and click, the changed gear is NOT pinned; the admin re-reviews the new preview first. Only when server == expected does the RPC write the (identical, server-computed) fingerprint. Revoke carries no fingerprint.
- **CAS mismatch must REFRESH the persisted preview, not just reject** (plan-R5 finding 1 — stale-preview dead-end): on `serverFingerprint !== expectedFingerprint` the route MUST re-persist the freshly-detected `archivedPullSheetTabs` (new fingerprint + new `headerPreviews`) into the staged Step-3 envelope **before** returning `409 stale_review` — by triggering the standard re-scan (which re-detects and re-writes the offer entry; the override is untouched because the RPC is not called). Without this refresh the client re-fetches the SAME stale envelope (`fingerprint = 'ff'`), re-POSTs the same `expectedFingerprint`, and dead-loops on 409. With it, the re-fetched S2/S4 card shows the NEW fingerprint, and a second accept against that new fingerprint matches and succeeds.
- **Both accept AND revoke are compare-and-set on the override ROW state** (plan-R3 finding 1 — lost-update guard): every request carries `expectedOverrideSnapshot` = `overrideSnapshot({tabName,fingerprint})|null` the admin's UI last rendered. Under the `show:` lock the RPC reads the CURRENT `pull_sheet_override`, projects its snapshot, and **refuses (→ 409 stale_review, the client re-fetches) if it differs from `expectedOverrideSnapshot`**. This closes the stale-page lost-update: a stale S3 page revoking after another accept, or a stale accept after a revoke, cannot clobber the newer decision. The advisory lock serializes writes; the row-state CAS proves the admin acted on the current row.
- Calls a new `SECURITY DEFINER` RPC `set_pull_sheet_override(p_drive_file_id, p_wizard_session_id, p_tab_name, p_fingerprint, p_accepted_by, p_expected_override_snapshot jsonb)` — the 6th param is the row-state CAS snapshot (plan-R3 finding 1); the arity is authoritative and the grant/route/tests must match it exactly. It:
  - holds `pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id))` (invariant 2 single-holder; the route/JS does **not** take the lock),
  - writes `pending_syncs.pull_sheet_override` (`null` on revoke),
  - is the sole writer of that column at the onboarding layer.
- **RPC authorization contract** (Codex R1 finding 3 — a `SECURITY DEFINER` write to `pending_syncs` is a privileged surface independent of the route): the RPC must NOT be a PostgREST bypass. Belt-and-suspenders:
  1. **Grant lockdown:** `revoke execute on function set_pull_sheet_override(...) from public, anon, authenticated;` `grant execute ... to service_role;`. The route calls it with the service-role client (matching existing onboarding RPCs), so `authenticated`/`anon` can never call it via PostgREST.
  2. **In-RPC guard:** the function additionally asserts the caller context is a live onboarding session — it validates `p_wizard_session_id` against the active `app_settings.pending_wizard_session_id` and that the target `pending_syncs` row exists for `(session, drive_file_id)`; on mismatch it raises (no write). This mirrors how the existing onboarding RPCs gate to the active session, so a stale/forged session id cannot mutate an unrelated show.
  3. A **grant meta-test** asserts `execute` is revoked from `authenticated`/`anon`, and a **direct-RPC non-admin denial test** confirms a non-service caller is rejected.
- On success the route triggers the existing re-scan (`app/api/admin/onboarding/rescan-sheet/route.ts` path) so the preview re-parses with the pull sheet included/excluded. Accept therefore re-runs 5.3 with the new override present.
- Fingerprint for accept is taken from the `archivedPullSheetTabs` entry the UI already holds for that tab (the route re-derives/validates it from a fresh detect to avoid trusting client input — the fingerprint written is the server-computed one).
- Post-commit, outside the lock tx: `logAdminOutcome({ code: "PULL_SHEET_OVERRIDE_SET" | "PULL_SHEET_OVERRIDE_CLEARED", ... })` (forensic admin codes; §12.4-exempt via the admin-outcome contract, same as existing `logAdminOutcome` codes). No secret is logged; the tab name is not a secret.

### 5.5 Publish propagation — BOTH onboarding flows

The override must reach durable `shows.pull_sheet_override` on **both** finalize paths, or a cron sync after publish reads `null`, re-skips the OLD tab, and removes the gear again (Codex R1 finding 2):

- **Flow A — new/first-seen show** (`lib/onboarding/applyRescanDecisionUnderLock.ts` reading `pending_syncs`): copy `pending_syncs.pull_sheet_override` → `shows.pull_sheet_override`, exactly as `source_anchors` is propagated.
- **Flow B — existing (already-live) show shadow path** (`app/api/admin/onboarding/finalize/route.ts` stages approved existing shows into `shows_pending_changes.payload` and deletes the `pending_syncs` row, then `finalize-cas` / `applyRescanDecisionUnderLock` applies the shadow via `parseShadowPayloadForApply`, `lib/onboarding/shadowPayload.ts:75`): because the `pending_syncs` row (and its `pull_sheet_override` + `pull_sheet_override_applied` columns) is **deleted** at staging, BOTH values MUST ride the shadow payload (Codex R7 finding 2). Specifically: (a) write `pull_sheet_override` (the desired value) AND `pull_sheet_override_applied` (the snapshot the staged parse used) into `shows_pending_changes.payload` when the existing show is staged, (b) surface both via `parseShadowPayloadForApply` (add to `ParsedShadowPayloadForApply`), (c) at Phase-D apply, under the `show:` lock, run the 5.8 consistency gate **payload-internally** (`payload.pull_sheet_override_applied` vs `overrideSnapshot(payload.pull_sheet_override)` — NOT vs the stale durable `shows.pull_sheet_override`, Codex R8), and on match write `payload.pull_sheet_override` to `shows`. Without the payload-carried values, Flow B either skips the gate (stale gear publishes for a live show), can never finalize (snapshot missing), or compares against the wrong source of truth.

Cron sync (post-publish) reads `shows.pull_sheet_override`.

### 5.7 Concurrency — locked-snapshot protocol (single-holder + re-read under lock)

`rescanWizardSheet` (and the cron equivalent) fetch + export + parse **pre-lock** (`lib/onboarding/rescanWizardSheet.ts:99-139` — the advisory `app_settings` read is non-mutating; the authoritative `show:` lock is taken later at `:170`). The override read that drives `includePullSheetFromTab` therefore happens **before** the lock, while accept/revoke and content-change auto-clear mutate the override **under** the lock. A naive design has a TOCTOU: a rescan/cron that read an accepted override pre-lock can stage OLD-tab gear even though an admin revoked (or content-change cleared) it under the lock in the interim; the inverse race can overwrite a fresh accept with a null-override parse (Codex R1 finding 1).

Protocol (mandatory):

1. The pre-lock export carries the **exact override snapshot it used**: `{ tabName, fingerprint }` (or `null`) that produced the parse.
2. Inside the `show:` locked transaction, **re-read** `pull_sheet_override` for the row.
3. If the locked value differs from the pre-lock snapshot (tabName changed, fingerprint changed, null↔set), the pre-lock parse is **stale**: do NOT write staged/live results from it. Refuse-and-retry — re-export under the caller's retry envelope, or drop the stale parse (the next scan re-derives). Never write a staged pull sheet that disagrees with the override as-of-lock.
4. The auto-clear on content-change (5.2) and the accept/revoke write (5.4) both occur **under the same `show:` lock**, so all override state transitions are serialized against each other and against the apply.

Single-holder (invariant 2): the `show:` lock is held by the writing layer that already holds it (`rescanWizardSheet` locked tx / `applyRescanDecisionUnderLock` / the `set_pull_sheet_override` RPC) — never doubly. `set_pull_sheet_override` is the sole holder for its own call; it does not nest under a JS-side `show:` lock.

### 5.8 Staged-parse ↔ override consistency (persisted snapshot + finalize gate)

5.7 protects a *live* pre-lock parse from writing stale results. But accept/revoke write the override **then** trigger a re-scan, and the *already-staged* `parse_result` in `pending_syncs` was produced under a possibly-different override. If the re-scan fails or times out after the RPC write, finalize could apply a staged parse that disagrees with the current override — e.g. accepted gear staged → admin revokes → override null → re-scan fails → finalize still applies the archived gear; or the inverse (override set, staged parse still lacks the gear) (Codex R2 finding 2).

Mechanism:

- **Comparison is on the operational snapshot, not the full object** (Codex R3 finding 1). Define `overrideSnapshot(o) = o ? { tabName: o.tabName, fingerprint: o.fingerprint } : null` — it drops the audit fields (`acceptedBy`, `acceptedAt`) that don't affect what gets parsed. `pull_sheet_override` (D4) is the full object; `pull_sheet_override_applied` stores exactly `overrideSnapshot(...)` (i.e. `{ tabName, fingerprint } | null`). The gate deep-equals `pull_sheet_override_applied` against `overrideSnapshot(current pull_sheet_override)`, so a successful re-scan makes them equal (they would NEVER be equal if compared full-object-to-subset — the bug this fixes).
- New column `public.pending_syncs.pull_sheet_override_applied jsonb` (nullable; on **all** `pending_syncs` rows — wizard AND live partitions — NOT propagated to `shows`). It records the `overrideSnapshot(...)` the **currently-staged parse was actually produced under**. Every write of a staged parse (wizard re-scan AND live `upsertLivePendingSync`) sets it **atomically with the staged `parse_result`, under the `show:` lock**, to `overrideSnapshot(override-as-of-lock)` (per 5.7).
- `set_pull_sheet_override` (accept/revoke) writes `pull_sheet_override` but does **not** touch `pull_sheet_override_applied`. So immediately after accept/revoke the two diverge → the row is **not** consistent yet.
- **Finalize/apply gate** (under the `show:` lock): the gate compares the applied snapshot against the **desired override for THIS finalize** — never the stale durable value (Codex R8, critical):
  - **Flow A:** `pending_syncs.pull_sheet_override_applied` === `overrideSnapshot(pending_syncs.pull_sheet_override)` — both the applied snapshot and the desired override are the live onboarding-row values.
  - **Flow B (existing-show wizard shadow):** `payload.pull_sheet_override_applied` === `overrideSnapshot(payload.pull_sheet_override)` — both carried in the shadow payload; do **NOT** compare against the pre-existing `shows.pull_sheet_override`, which still holds the *previously published* value. On pass, `payload.pull_sheet_override` is written to `shows`. (Concurrency CAS against the durable row is the existing shadow/finalize mechanism's concern, orthogonal to this content-consistency gate.)
  - **Flow C (live cron deferred apply):** the live-partition staging path — `upsertLivePendingSync` (`runScheduledCronSync.ts:933`, `wizard_session_id IS NULL`) writes a live `pending_syncs` row when `triggeredReviewItems` exist, and `readLivePendingSyncForApply` (`applyStaged.ts:1197,1437`) applies it later — is ALSO deferred-apply and MUST gate. `upsertLivePendingSync` writes `pull_sheet_override_applied = overrideSnapshot(override-as-of-lock)` with the staged parse; at `applyStaged` under the `show:` lock, gate `staged.pull_sheet_override_applied` === `overrideSnapshot(shows.pull_sheet_override)` (the durable override IS the desired value for live sync — there is no wizard/payload). On mismatch, discard-and-rerun (do not apply the stale live parse); the next cron re-parses under the current override.
  - Rationale: the gate asks "was the staged parse produced under the same override that is desired NOW." Flow A/C read the desired value from the live row / durable `shows`; Flow B reads it from the payload. Comparing Flow B to durable `shows` would (a) pass a revoke-then-failed-rescan (durable=A, applied=A, but desired=null → stale gear published) and (b) permanently block a legitimate accept from durable-null to A.
  - On mismatch: typed blocking outcome surfaced via lookup copy — never a silent apply of mismatched gear. This **reuses the existing cataloged code `STAGED_PARSE_OUTDATED_AT_PHASE_D`** (`lib/messages/catalog.ts:2865`, `finalize-cas/route.ts:414,420`) — the override-snapshot mismatch is exactly the "staged parse is out of sync at Phase-D → re-scan before publishing" case that code already covers, with existing lookup copy + `helpHref`. **No new §12.4 code** and no 3-way lockstep is introduced (Codex plan-R8-2); the gate returns that existing code and it resolves to non-null user-facing copy.
- **Failed re-scan after the RPC:** the row simply stays in the divergent (unfinalizable) state and the admin sees a "re-scan needed" state, rather than a mixed row. A successful re-scan reconverges `pull_sheet_override_applied` to `pull_sheet_override` and clears the gate. No compensation write is required because the gate is declarative (compare-at-finalize), not a mutation that must be rolled back.
- **Scope — three deferred-apply paths, all gated** (Codex R11 corrects R10): PF31 (`supabase/migrations/20260608000004_retire_live_pending_syncs.sql`) retired only the **whole-parse** live staging; a **triggered-review-items** live `pending_syncs` path SURVIVES (`upsertLivePendingSync`/`readLivePendingSyncForApply`, `wizard_session_id IS NULL`). So there are three stage-then-apply-later paths, each carrying `pull_sheet_override_applied` and gating at apply: **Flow A** wizard new-show (desired = live `pending_syncs` override), **Flow B** wizard existing-show shadow (desired = payload override), **Flow C** live cron (desired = durable `shows.pull_sheet_override`). Non-staged inline cron apply (no `triggeredReviewItems`) is still covered by 5.7 + 5.2 in its locked tx. A **held** sync retains last-good and re-parses fresh (no stale deferred apply). The gate is path-general (I4/I5); every path that stages-then-applies carries and checks the snapshot.

### 5.10 Override consistency — complete invariant set (class closure)

Rounds R1–R9 all probed one vector: *can archived-tab gear reach a published `pullSheet` that the admin did not knowingly review-and-pin?* Rather than continue per-leak, this is the exhaustive invariant list; every path in 5.1–5.9 must satisfy all of them, and the test inventory (§15) has a case per invariant. A new path is correct iff it preserves I1–I7.

- **I1 — One unit.** Emitted ≡ hashed ≡ parsed ≡ reviewed content: the set of pull-sheet **case regions** (header + `collectDataBlock` items, 5.1/D5). No path may emit, hash, or review a different slice than the others.
- **I2 — Reviewed = all of it.** The admin is shown *every* emitted region's header (`headerPreviews[]`, 5.1/5.6). A hash never substitutes for reviewable content.
- **I3 — Accept pins only reviewed content.** Accept is compare-and-set: server fresh-detect must equal the persisted `expectedFingerprint` the admin reviewed (5.4/5.9); any drift between render and click → reject + re-prompt.
- **I4 — Publish gate uses the desired override.** At finalize under the `show:` lock, `applied` must equal `overrideSnapshot(desired)` — Flow A the live `pending_syncs` override, Flow B the payload-carried override (5.8); never the stale durable `shows` value.
- **I5 — No stale parse is ever staged OR applied.** Guards under the `show:` lock: (a) override-**row** drift vs the pre-lock snapshot → refuse-and-retry (5.7); (b) sheet-**content** drift under an unchanged override (`included:true` fingerprint mismatch) → discard-and-rerun: clear override, re-parse WITHOUT inclusion (drops OLD gear, **preserves any current non-OLD pull sheet** — plan-R4), `applied=null` (5.2); (c) deferred-apply snapshot gate at apply for ALL three stage-then-apply paths — Flow A/B wizard + **Flow C live cron** (5.8). Non-staged inline cron apply is covered by (a)+(b) in its locked tx. A changed/mismatched **OLD-tab** gear never reaches a staged OR applied `pullSheet` (current non-OLD gear is untouched).
- **I6 — Durable on both flows.** The accepted override reaches `shows.pull_sheet_override` on Flow A and Flow B (5.5); cron reads it (5.3) so accepted gear survives and revoked gear stays gone.
- **I7 — Write surface is locked down.** `set_pull_sheet_override` is service-role-only + in-RPC session-guarded (5.4); direct PostgREST callers cannot set/clear overrides.

### 5.9 Fingerprint transport to Step 3 (durable, structured)

The `expectedFingerprint` in the accept POST (5.4 compare-and-set) must be the fingerprint of the **content the admin actually reviewed in S2/S4**, carried end-to-end — not a fresh client- or server-side re-detect (which would reopen the stale-preview race the CAS closes). Transport (Codex R4 finding 1):

- The sync/scan layer persists `archivedPullSheetTabs` (`ArchivedPullSheetTab[]` = `{ tabName, headerPreviews, fingerprint, included, contentChangedSinceAccept }` — the FULL shape from 5.1, including the `contentChangedSinceAccept` flag S4 depends on; never omit it on an entry, Codex R11 finding 2) into the **staged preview envelope** in `pending_syncs` — the same envelope that already carries `pullSheet`/`warnings` for step-3 — as a first-class field (e.g. `parse_result.archivedPullSheetTabs`). It is NOT reconstructed from the warning; the warning is only the badge/gap signal.
- The step-3 preview DTO surfaced to the wizard (the `pr` object read by `PackListBreakdown`, `step3ReviewSections.tsx:2053`) exposes `pr.archivedPullSheetTabs`. `Step3SheetCard.tsx:429`-style shaping adds it alongside `pr.pullSheet`.
- S2/S4 render each offer from a persisted `ArchivedPullSheetTab`, and the accept button POSTs **that entry's `fingerprint`** as `expectedFingerprint`. The server then fresh-detects and compares to `expectedFingerprint` (5.4): equal → pin; changed-since-review → reject + re-prompt.
- Because the fingerprint is persisted with the staged parse, a page reload / new admin session still holds the exact reviewed fingerprint. When a re-scan re-stages, `archivedPullSheetTabs` (and its fingerprints) refresh together with `pullSheet` — S2 always reflects the currently-staged content.

> **Exact-shape note:** persisting a new field on the staged parse envelope must not break the `Phase1ShowRow`/preview `toEqual` fixtures — treat it as a required-nullable/array-default field (`archivedPullSheetTabs: []` when none), class-swept across the preview doubles (per the required-nullable-field lesson). Each entry always carries all five keys (incl. `included`, `contentChangedSinceAccept`) so S4 survives reload/rescan.

### 5.6 Step-3 UI (Pack list section)

`components/admin/wizard/step3ReviewSections.tsx` `PackListBreakdown` (label `"Pack list"`, `:1319`/`:2599`) gains states driven by (a) `pr.pullSheet` (`PullSheetCase[]`), (b) `pr.archivedPullSheetTabs` (`ArchivedPullSheetTab[]` — the persisted offer entries incl. `fingerprint`, 5.9; a non-empty array is the S2/S4 trigger, not the warning text), and (c) whether an override is active (`pull_sheet_override` non-null on the row). The `PULL_SHEET_ON_ARCHIVED_TAB` warning drives only the badge/gap count; the render reads the structured tabs:

| State | Condition | Render |
|---|---|---|
| **S1 Empty** | no pull sheet, no archived-tab warning | `"No pack list parsed."` (unchanged) |
| **S2 Offer** | `pr.archivedPullSheetTabs` has an entry with `contentChangedSinceAccept === false`, no active override | Warning card per tab: `"Found a pull sheet on archived tab '{tabName}'."` then **every** `headerPreviews[]` entry rendered as a list (`"Case 1 header reads '…'"`, `"Case 2 header reads '…'"`, …) so the admin reviews all cases the accept would ingest. `"If this is this show's gear, include it; otherwise leave it skipped."` + `[Use this show's gear]` (POSTs that tab's `fingerprint` as `expectedFingerprint`) / `[Keep skipped]` |
| **S3 Included** | override active, fingerprint matches (pull sheet populated) | Pack list rendered normally + subtle note `"Included from archived tab '{tabName}'."` + `[Revoke]` |
| **S4 Re-confirm** | `pr.archivedPullSheetTabs` entry has `contentChangedSinceAccept === true` AND `!overrideActive` (5.2 auto-cleared) — **regardless of whether `pr.pullSheet` is empty** (plan-R5) | Warning card as S2 + prefix `"The archived tab '{tabName}' changed — re-confirm before it publishes."` (driven by the persisted `contentChangedSinceAccept` flag, not by inferring from absent override — Codex R10-2). In the **mixed-workbook** case (a current non-OLD pull sheet survived the auto-clear, plan-R4), S4 renders the normal current Pack list **plus** the changed-tab re-confirm card — the re-prompt must NOT be suppressed just because current gear is present. |

Buttons call the 5.4 route; on success the wizard re-fetches the (re-scanned) preview. All copy routed through the catalog (`lib/messages/lookup.ts`) — no raw codes (invariant 5).

## 6. Guard conditions (per input)

- `pr.pullSheet` null/empty → S1 (or S2/S4 if a warning is present). Empty array never crashes `PackListBreakdown`.
- `archivedPullSheetTabs` empty → no warning, no S2/S4.
- `headerPreviews` entry empty string (a case with a pull-sheet header row but blank block-4) → that entry renders as `"(no header text)"`; warning still fires (a pull-sheet region exists). An empty `headerPreviews[]` array is impossible when an entry exists (≥1 region ⇒ ≥1 preview).
- Multiple OLD tabs each with a pull-sheet block → one `ArchivedPullSheetTab` + one `PULL_SHEET_ON_ARCHIVED_TAB` warning **per tab**; S2 lists each with its own accept button; override `tabName` disambiguates. (Cap: render all; realistic count ≤2. State it, don't truncate.) A single OLD tab with multiple pull-sheet **cases/blocks** is still **one** offer whose fingerprint spans all its blocks (D5) — accept ingests them all together.
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
| Table DDL | `alter table public.pending_syncs add column if not exists pull_sheet_override jsonb;` and same for `public.shows`. Plus onboarding-only `alter table public.pending_syncs add column if not exists pull_sheet_override_applied jsonb;` (5.8). All nullable, default `null` (NOT `'{}'` — null is the meaningful "skipped" sentinel, distinct from source_anchors' `'{}'` default). |
| Inline CHECK | None (free-form jsonb, shape enforced in app). CHECK/enum migration matrix → **N/A** (no CHECK, no enum). |
| RPC write path | `set_pull_sheet_override` SECURITY DEFINER (D8), advisory-locked; `execute` revoked from `public`/`anon`/`authenticated`, granted `service_role`; in-RPC active-session + target-row guard (5.4). |
| RPC read path | Existing staged-read / cron-read RPCs `select` the new column (additive; add to their projections). |
| Propagation | BOTH flows (5.5): Flow A `pending_syncs.pull_sheet_override` → `shows.pull_sheet_override`; Flow B existing-show shadow carries BOTH `pull_sheet_override` + `pull_sheet_override_applied` in `shows_pending_changes.payload` → `parseShadowPayloadForApply` (`lib/onboarding/shadowPayload.ts:75`) → Phase-D gate+apply → `shows.pull_sheet_override` (post-`pending_syncs`-deletion). |
| Concurrency | Locked-snapshot protocol (5.7): pre-lock parse carries its override snapshot; re-read under `show:` lock; refuse-and-retry on mismatch. |
| Staged consistency | `pull_sheet_override_applied` written atomically with every staged parse under lock (wizard re-scan AND live `upsertLivePendingSync`); apply gate refuses when `applied` ≠ `overrideSnapshot(desired)` — Flow A live `pending_syncs`, Flow B payload-internal, Flow C live cron durable `shows` (5.8, Codex R8/R11). |
| Cleanup | Onboarding cleanup/reset flows that clear `pending_syncs` rows already delete the whole row (`runOnboardingScan.ts:489`) → both new `pending_syncs` columns go with it; no separate cleanup needed. Verify no `pending_syncs`-column-list INSERT omits `pull_sheet_override` / `pull_sheet_override_applied` where they must carry (a re-stage that drops `_applied` would spuriously trip the 5.8 finalize gate). |
| PostgREST DML lockdown | `pull_sheet_override` is written only via the SECURITY DEFINER RPC. If `pending_syncs`/`shows` already REVOKE direct DML from `authenticated`/`anon` (RPC-gated), the new column inherits that; confirm in plan and add a structural note. No new table → no new lockdown migration unless the tables aren't already locked. **Plus** the new function's own `execute` grants are locked down (RPC write-path row above). |
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
- `headerPreviews[]` per-entry cap: 120 chars; up to 4 lines; one entry per emitted case region.
- New §12.4 codes: **2** warn codes + **2** forensic admin-outcome codes.
- New DB columns: **3** (`pending_syncs.pull_sheet_override`, `shows.pull_sheet_override`, `pending_syncs.pull_sheet_override_applied`), all `jsonb` nullable default `null`.
- OLD-skip sites: **2** (exporter un-skipped conditionally; anchors never).
- `synthesizeMarkdownFromXlsx` call sites to migrate to `.markdown`: enumerate in plan (≥2 known: `fetch.ts:497`, `:614`).
- Realistic OLD-pull-sheet-tab count per show: ≤2 (render all; no truncation).
- Finalize propagation flows the override must traverse: **2** (Flow A new-show pending_syncs→shows; Flow B existing-show shadow payload→shows).
- Override-lock TOCTOU race tests: **2** (revoke-vs-rescan, accept-vs-cron).
- New DB columns total: **3** (`pending_syncs.pull_sheet_override`, `shows.pull_sheet_override`, `pending_syncs.pull_sheet_override_applied`).
- Failed-re-scan consistency regression tests: **2** (revoke-then-fail, accept-then-fail).

## 13. Meta-test inventory

- **Extends** `tests/log/_auditableMutations.ts` (`AUDITABLE_MUTATIONS`) + `tests/log/adminOutcomeBehavior.test.ts` — the accept/revoke route is an admin mutation (invariant 10).
- **Extends** advisory-lock topology pin `tests/auth/advisoryLockRpcDeadlock.test.ts` (or `_advisoryLockSingleHolderContract.test.ts`) — `set_pull_sheet_override` is a new `show:`-keyed lock holder; single-holder (RPC only, not JS).
- **New** grant meta-test: `execute` on `set_pull_sheet_override` revoked from `authenticated`/`anon` (PostgREST-bypass guard, 5.4). Analogous to the postgrest-dml-lockdown structural pins.
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
- **Pre-lock parse is reconciled under-lock** (5.7) — the override include/exclude decision is snapshotted pre-lock and re-validated under the `show:` lock before any staged/live write; a mismatch refuses the stale parse. This closes the revoke-vs-rescan and accept-vs-cron TOCTOU.
- **Override propagates on BOTH finalize flows** (5.5) — Flow A (pending_syncs→shows) and Flow B (existing-show shadow payload→shows). Durable `shows.pull_sheet_override` is written on the existing-show path too, so cron never re-strips accepted gear.
- **The RPC is not a PostgREST bypass** (5.4) — `execute` revoked from `authenticated`/`anon`, service-role-only, plus an in-RPC active-session guard; a direct non-admin call cannot set/clear overrides.
- **Accept pins only reviewed content** (5.4) — compare-and-set against the S2/S4 `expectedFingerprint`; a tab that changed between render and click is rejected + re-prompted, never silently pinned.
- **The reviewed fingerprint is persisted, not re-detected** (5.9) — `archivedPullSheetTabs` (incl. `fingerprint`) rides the staged `pending_syncs` preview envelope and the step-3 DTO; S2/S4 POST that persisted fingerprint, surviving reload/new-session. The CAS is not defeatable by a fresh client/server detect.
- **Staged parse can never publish out of sync with the override** (5.8) — the applied snapshot is compared to the **desired** override for this finalize (Flow A: live pending_syncs values; Flow B: payload-internal `applied` vs `overrideSnapshot(payload.override)`, NOT the stale durable `shows` value — Codex R8). Divergence (incl. after a failed re-scan) refuses finalize rather than applying mismatched gear. Declarative gate, no compensation write. Flow B carries both values in the shadow payload so the gate survives `pending_syncs` deletion (5.5/5.8).
- **Emitted/hashed/parsed unit is the parser case region** (5.1/D5) — header through `collectDataBlock` items, so late item blocks are pinned and emitted, never dropped to a header-only shell. Not a naive `splitBlocks` header block.
- **Three deferred-apply paths are gated, not two** (Codex R11 corrected R10): PF31 retired only whole-parse live staging; the triggered-review-items live `pending_syncs` path survives (`upsertLivePendingSync`/`readLivePendingSyncForApply`). Flow C (live cron, desired = durable `shows.pull_sheet_override`) carries + gates `pull_sheet_override_applied` exactly like Flow A/B. Do not treat cron as purely inline.

## 15. Testing — concrete failure modes each test catches

1. **Detection**: OLD tab with a pull-sheet header → `archivedPullSheetTabs` has one entry with correct `tabName`/preview/fingerprint. Catches: silent-drop regression.
2. **No-pull-sheet OLD tab + stray-mention negative**: (a) OLD tab without any pull-sheet block → no entry, no warning; (b) OLD notes/contact tab with a single cell that merely mentions "pull sheet" but no header row where ALL cells contain "PULL SHEET" → no entry, no warning (detection uses the parser's all-cells block predicate, not substring). Catches: false-positive warnings/offers on genuinely-archived non-gear tabs (Codex R3-2).
3. **Un-skip granularity + late-item case region**: (a) accepted OLD tab that ALSO contains a rooms/contacts block → `markdown` includes the pull-sheet case regions but **not** the stale rooms/contacts; parsed `rooms`/`contacts` unaffected (DEF-2 risk). (b) fixture where a case's item rows live in a **later** blank/separator-bounded block than the header (with an intervening non-item block) → the full `collectDataBlock` region is emitted, parsed pack list is complete (not header-only), and changing that late item block changes the fingerprint (Codex R7-1). Catches: cross-contamination re-introduction AND header-only emission dropping/failing to pin late item rows.
4. **Fingerprint stability + staged↔finalize convergence**: cosmetic reformat (whitespace, blank rows) → same fingerprint; a changed QTY/ITEM cell → different fingerprint; **a header-only change (show-identity line, item rows untouched) → different fingerprint** (Codex R5 — the reviewed header is inside the pin); `overrideSnapshot` compare ignores `acceptedBy`/`acceptedAt` so an accepted-then-rescanned row DOES finalize (Flow A and Flow B) — the shape-mismatch permanent-block bug (Codex R3-1) cannot recur. Catches: over-eager auto-drop, missed content/header change, and full-object-vs-subset compare. Derive expected from fixture cell edits, not hardcoded hashes.
5. **Override read/include**: override set + matching fingerprint → `pr.pullSheet` populated from that tab. Catches: override not threaded.
5b. **Multi-block tab pin** (Codex R6-1): OLD tab with ≥2 pull-sheet cases, override accepted → all cases emitted AND the fingerprint covers all; changing the **second** case's item row → fingerprint differs → auto-drop. Catches: unpinned block silently publishing under a still-matching first-block fingerprint.
5d. **Multi-case preview (all headers reviewed)** (Codex R9-1): OLD tab with 2 cases whose **second** header is a different show-identity → `headerPreviews` has both, and S2/S4 renders BOTH before the accept button. Catches: accepting ingests a second case the admin never saw.
5c. **Accepted-tab metadata returned** (Codex R6-2): with an active override, the exporter returns the accepted tab's entry with `included: true` and its current fingerprint even though the tab is NOT dropped; when that content changed, the returned fingerprint drives `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` + auto-drop rather than silent inclusion. Catches: auto-drop defeated because the un-dropped accepted tab returned no comparable fingerprint.
6. **Content-change auto-drop is discard-and-rerun**: override set, tab item rows OR header-preview cells changed → override cleared, `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` emitted, `PULL_SHEET_ON_ARCHIVED_TAB` re-fired, `pull_sheet_override_applied = null`, and the staged `parse_result.pullSheet` equals the **no-override re-parse** — the changed OLD-tab gear is absent, but any current non-OLD pull sheet is preserved (plan-R4). Two fixtures: (a) OLD-tab-only workbook → empty pullSheet; (b) **mixed workbook (valid current pull sheet + accepted OLD tab that drifts) → current gear REMAINS, only OLD gear dropped**. Explicit header-only case (Codex R5). Catches: stale/re-headed gear silently publishing AND legitimate current gear being erased by the safety clear.
7. **Publish propagation — both flows**: Flow A (new show) `pending_syncs.pull_sheet_override` → `shows`; Flow B (existing live show) accept → finalize via shadow payload → `shows.pull_sheet_override` present → next cron preserves the pull sheet. Flow B carries BOTH `pull_sheet_override` and `pull_sheet_override_applied` in `shows_pending_changes.payload` and the Phase-D gate reads the payload-carried applied snapshot **after `pending_syncs` deletion** (Codex R7-2). Catches: override lost at publish on the existing-show path (Codex R1-2) so cron re-strips gear; Flow B gate having no snapshot to read post-deletion.
8. **Advisory lock + locked snapshot**: `set_pull_sheet_override` holds `show:`-keyed lock; JS route does not. Race tests: (a) revoke-vs-rescan — override cleared under lock after a pre-lock accepted parse → stale parse refused, no OLD gear staged; (b) accept-vs-cron — accept under lock while cron parsed pre-lock with null → cron's stale null-parse does not overwrite the accept. Catches: deadlock / lock-not-held / TOCTOU (Codex R1-1).
8b. **RPC grant/auth**: `execute` revoked from `authenticated`/`anon`; a direct non-service RPC call is denied; a forged/stale `wizard_session_id` raises without writing. Catches: PostgREST bypass of the route's admin gate + fingerprint validation (Codex R1-3).
8c. **Accept compare-and-set**: OLD tab changes between S2 render and accept click → server fingerprint ≠ `expectedFingerprint` → accept rejected with re-prompt, no override written. Catches: pinning content the admin never reviewed (Codex R2-1).
8e. **Flow C live-cron deferred-apply gate** (Codex R11-1): live cron with `triggeredReviewItems` stages a live `pending_syncs` row (`upsertLivePendingSync`) with `pull_sheet_override_applied = overrideSnapshot(A)` under override A; then the durable `shows.pull_sheet_override` is revoked (→null) or content-changed **before** `readLivePendingSyncForApply` applies. Apply must REFUSE/discard (gate `staged.applied` vs `overrideSnapshot(shows.pull_sheet_override)`), not apply the stale live parse. Catches: archived gear outliving the override via the surviving-post-PF31 live staging path.
8d. **Staged↔override consistency on failed re-scan (both flows, payload-internal Flow B)**: (a) Flow A accepted gear staged → revoke → re-scan fails → finalize REFUSED (row unfinalizable, not applying archived gear); (b) accept → re-scan fails → override set but staged parse lacks gear → finalize REFUSED until a successful re-scan reconverges `pull_sheet_override_applied`; (c) Flow B **where durable `shows.pull_sheet_override` differs from the payload's desired override**: live `shows.override=A`, staged-under-A, admin revokes→null, re-scan fails → payload `{override:null, applied:A}` → gate compares `A` vs `overrideSnapshot(null)=null` → REFUSED (NOT the buggy durable-A-vs-applied-A pass that would publish stale gear, Codex R8); (d) Flow B legitimate accept durable-null→A, staged-under-A → payload `{override:A, applied:A}` → gate passes → `shows.override=A` written (NOT permanently blocked by null-vs-A). Catches: mixed-row publish across failed re-scan (Codex R2-2) and wrong-source-of-truth Flow B gate (Codex R8) on both flows.
9. **Admin gate + behavioral proof**: route requires admin; success branch records the outcome code (sink-spy after committed success). Catches: dark mutation surface (invariant 10).
10. **Step-3 S1–S4**: each state renders the right copy/buttons from (`pr.pullSheet`, `pr.archivedPullSheetTabs`, override) inputs; empty/multi-tab guards. **S4 specifically**: a preview entry with `contentChangedSinceAccept: true` + null override renders the "changed — re-confirm" prefix, NOT the generic first-time S2 copy (Codex R10-2). Anti-tautology: assert against the section's data inputs, and when scanning DOM for the tab name, scope to the Pack list section (remove sibling sections that might independently render a tab name).
10b. **Fingerprint transport** (Codex R4): render S2/S4 from a **persisted** preview artifact (`pr.archivedPullSheetTabs` seeded from a `pending_syncs`-shaped fixture, not a live re-detect) and assert the accept POST's `expectedFingerprint` equals that persisted entry's `fingerprint`. Catches: UI unable to supply `expectedFingerprint`, or supplying a fresh-detected one that doesn't prove what the admin reviewed.
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
