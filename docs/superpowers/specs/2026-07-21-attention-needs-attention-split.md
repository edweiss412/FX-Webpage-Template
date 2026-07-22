# Spec — Attention menu: split the auto-clearing bucket into "needs a look" vs "monitoring"

- **Date:** 2026-07-21
- **Branch:** `feat/attention-needs-attention-split`
- **Surface:** show-modal attention menu + header pill (`app/admin` published show modal). UI-owned (Opus + impeccable v3 dual-gate per AGENTS.md invariant 8).
- **Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 code catalog is canonical).
- **Related ratified surfaces:** alert-audience-split `docs/superpowers/specs/alerts/2026-07-04-alert-audience-split.md` (DOUG_EXCLUDED_CODES); show-scoped alert copy `2026-07-20-show-scoped-alert-copy-design` (topology meta-test).

---

## 1. Problem

The show-modal header pill collapses every non-actionable admin_alert into a single count. The menu footer today shows a "clearing on their own, no action needed" line (`AttentionMenu.tsx:148`; the live string uses an em-dash) and the pill shows an "N clearing" line (`PublishedReviewModal.tsx:724`). Two defects:

1. **The copy lies.** Most of the bucket does need a human. `resolution:"auto"` means "no in-app Resolve button" — not "self-resolves with zero involvement." Of the auto-resolving codes that actually reach this menu, only 3 truly self-heal; the rest need someone to re-share a sheet, fix a sheet, re-sync, or re-publish.
2. **The bucket is a dead end.** The operator sees a count with no names and no way to act. The individual items only render as banners deep in the modal body; there is no path from the count to the fix.

Also, the "{n} clearing" pill state is an **else-branch** of the "{n} to confirm" state (`PublishedReviewModal.tsx:714`, reached only when `actionable.length === 0`). So whenever any action item exists, the clearing count **vanishes entirely** — the operator sees "3 to confirm" and zero hint that 4 other items are sitting there.

### Goal

Split the auto-clearing bucket into two honest groups, surface the "needs a look" items as read-only rows in the menu, and — where a direct target exists — give each row a one-click button to where the fix happens. Drive operator effort toward zero: 11 of 12 "needs a look" codes get a direct link; the 1 remainder gets inline context. The pill shows both counts, and the second count stops disappearing when action items exist.

---

## 1.1 Resolved scope — do NOT relitigate

Each decision below is ratified. A reviewer verifies the contract; does not re-derive it.

1. **Universe = 15 doug-audience auto-resolving codes ONLY.** The other 12 auto-resolving codes are `health`-audience and are excluded from this menu upstream by `fetchPerShowAlerts` (`lib/adminAlerts/fetchPerShowAlerts.ts:79-80`) AND `deriveAttentionItems` (`lib/admin/attentionItems.ts:335-337`, via `DOUG_EXCLUDED_CODES`, `lib/adminAlerts/audience.ts:34-39`). They live on the health/developer surface and are **out of scope**. This includes all `EMAIL_*`, `BRANCH_PROTECTION_*`, `PENDING_SNAPSHOT_*_STUCK`, `GITHUB_BOT_LOGIN_MISSING`, `WEBHOOK_TOKEN_INVALID`, `TILE_PROJECTION_FETCH_FAILED`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `ASSET_RECOVERY_REVISION_DRIFT`. Ratified by base re-audit 2026-07-21 against the worktree base.
2. **No Ignore/dismiss mechanic.** These are `admin_alerts`, not parse-warnings. The content-hash Ignore lives in the separate parse-warnings system (`ignored_warnings`, `lib/dataQuality/warningFingerprint.ts`, `DataQualityWarningControls.tsx:89-106`) and is NOT ported here. Rows are read-only. (Ignore-parity was considered as "Direction 3" and rejected.)
3. **No new repair routes.** `PENDING_SNAPSHOT_PROMOTE/DELETE_STUCK` have no repair route by design (scheduled observations that auto-resolve) — and are health-audience/out of scope anyway. Exposing a delete-repair route is filed to BACKLOG, not built here.
4. **No DB change.** No migration, no new table, no CHECK/enum edit. All new state is derived TypeScript (a code-classification set + an `AttentionItem` field). DB completeness matrix = N/A (§9).
5. **Rows are read-only for inspection; the only interactive affordance is an action link (`<a>`).** No nested popover inside the menu (the menu is itself a floating dropdown; a popover-in-popover is banned). The existing `CompactAlertHelp` "?" popover stays only on the body `AttentionBanner`, untouched.
6. **The action links are navigations, not resolutions.** They take the operator to where the fix is done (the Google Sheet, or the `#overview` section). They do NOT mark the alert resolved; the alert clears when its upstream condition resolves (existing behavior, unchanged).
7. **Sequencing.** Code merge WAITS for `fix/unread-callout-dedup` to land on `origin/main`; this branch then rebases onto it and supersedes/updates its clearing-pill label test (basename `clearingPillLabel`, arriving with that branch) as part of the pill copy change (we inherit its a11y-label work). See §12.
8. **Fail-open on missing data.** A "needs a look" row whose action link cannot be built (missing `driveFileId`) renders as a plain read-only row with its fix-hint copy — never a dead/broken link, never a crash. See §6.

---

## 2. The universe (single source of truth)

15 doug-audience `resolution:"auto"` codes reach the menu. All are non-actionable (`actionable = !isInboxRouted && !isAutoResolving`, `attentionItems.ts:248`). This table is the canonical classification; every later section references it.

| # | Code | Group | Action target | Builder |
|---|------|-------|---------------|---------|
| 1 | `SHEET_UNAVAILABLE` | needs-a-look | Open in Sheet | `openSheet` (show `driveFileId`) |
| 2 | `OPENING_REEL_NOT_VIDEO` | needs-a-look | Open in Sheet | `openSheet` |
| 3 | `OPENING_REEL_PERMISSION_DENIED` | needs-a-look | Open in Sheet | `openSheet` |
| 4 | `REEL_DRIFTED` | needs-a-look | Open in Sheet | `openSheet` |
| 5 | `EMBEDDED_ASSET_DRIFTED` | needs-a-look | Open in Sheet | `openSheet` |
| 6 | `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` | needs-a-look | Open in Sheet | `openSheet` (show-level `driveFileId`; alert context lacks it) |
| 7 | `PARSE_ERROR_LAST_GOOD` | needs-a-look | Go to Overview | `showAnchor("#overview")` |
| 8 | `RESYNC_QUALITY_REGRESSED` | needs-a-look | Go to Overview | `showAnchor("#overview")` |
| 9 | `RESYNC_SHRINK_HELD` | needs-a-look | Review & re-sync (existing `#overview`) | already registered (`alertActions.ts:109-117`) |
| 10 | `SHOW_UNPUBLISHED` | needs-a-look | Go to Overview | `showAnchor("#overview")` |
| 11 | `USE_RAW_DECISION_STALE` | needs-a-look | Go to Overview | `showAnchor("#overview")` |
| 12 | `ASSET_RECOVERY_BYTES_EXCEEDED` | needs-a-look | none — context-only | inline limits copy (60 images / 50MB / 3GB) |
| 13 | `DRIVE_FETCH_FAILED` | monitoring | none | — |
| 14 | `SYNC_STALLED` | monitoring | none | — |
| 15 | `WATCH_CHANNEL_ORPHANED` | monitoring | none | — |

- **needs-a-look: 12** (11 with a direct link, 1 context-only).
- **monitoring: 3** (transient/self-heal — the system is on it, nobody acts).

**Classification storage:** a new explicit set `SELF_HEALING_CODES = { DRIVE_FETCH_FAILED, SYNC_STALLED, WATCH_CHANNEL_ORPHANED }` in `lib/adminAlerts/audience.ts`. An auto-resolving code is "monitoring" iff it is in `SELF_HEALING_CODES`; otherwise "needs-a-look". A meta-test (§10) pins exhaustiveness so any NEW auto-resolving doug-audience code must be explicitly classified or the test fails.

---

## 3. Behavior

### 3.1 `deriveAttentionItems` (`lib/admin/attentionItems.ts`)

- **New arg:** `driveFileId: string | null` added to `args` (alongside `slug`, line 303-315). Threaded to `toAlertItem` so action builders can use show-level `driveFileId`.
- **New `AttentionItem` field** on the non-actionable alert branch: `clearingKind: "self_heal" | "needs_look"`. Derived in `toAlertItem`: `isSelfHealing(row.code) ? "self_heal" : "needs_look"`. Actionable items and holds do not carry it (undefined).
- **Return ordering unchanged in spirit** (`[...holdItems, ...actionableAlerts, ...clearing]`, line 341), but `clearing` now sub-orders `needs_look` before `self_heal` so the items that matter sort first within the bucket.

### 3.2 Header pill (`PublishedReviewModal.tsx:656-738`)

Replace the four mutually-exclusive states with a composed pill that always shows what is present:

- Derive `needsLookCount` and `selfHealCount` from `live` (§3.3), alongside the existing `actionable`.
- **Interactive pill** renders when `actionable.length > 0 OR needsLookCount > 0` (i.e. anything a human might act on). Segments, in order, each rendered only when its count > 0:
  - `{actionable.length} to confirm` (warning tone dot, existing `bg-status-review`)
  - `· {needsLookCount} to review` (muted, `text-text-subtle`)
- **Non-interactive `{selfHealCount} monitoring`** pill segment appended (hollow dot) — shown when `selfHealCount > 0`. Never the sole reason the pill is interactive.
- **Degraded** (`alertsDegraded && everything === 0`): "Alerts unavailable" (unchanged, line 712).
- **In sync** (all counts 0, not degraded): "In sync" (unchanged, line 736).
- **Key fix:** `needsLookCount` and `selfHealCount` are NO LONGER gated behind `actionable.length === 0`. The count no longer vanishes when action items exist.

Clicking the interactive pill opens `AttentionMenu` (unchanged mechanism, `items={live}`).

### 3.3 Derivation (`PublishedReviewModal.tsx:304-309`)

```
const live = attentionItems.filter(i => !doneIds.has(i.id));           // unchanged
const actionable = live.filter(i => i.actionable);                     // unchanged
const needsLook = live.filter(i => !i.actionable && i.clearingKind === "needs_look");
const selfHeal  = live.filter(i => !i.actionable && i.clearingKind === "self_heal");
```
`clearingCount` (old) is retired in favor of `needsLook.length + selfHeal.length`.

### 3.4 `AttentionMenu` (`AttentionMenu.tsx`)

Menu body, top to bottom:

1. **Actionable rows** — unchanged (buttons that `onNavigate` → scroll to banner; `AttentionMenu.tsx:112-138`).
2. **"Needs a look" group** — new. A group subheading ("Needs a look"), then one read-only row per `needs_look` item:
   - hollow/`look`-tone dot (aria-hidden) + `sr-only` tone text
   - `menuTitle` (strong) + a one-line fix hint (see §5) in `text-xs text-text-subtle`
   - if the item's `action` link resolves: an inline `<a>` (label from the builder, e.g. "Open in Sheet ↗" / "Go to Overview"), `min-h-tap-min`, external links get `target=_blank rel=noopener noreferrer` + "↗". Reuses the exact anchor pattern from `AttentionBanner.tsx:160-174`.
   - the row itself is NOT a navigate button (no `onNavigate`); only the `<a>` is interactive.
   - `ASSET_RECOVERY_BYTES_EXCEEDED` (context-only): fix hint carries the limits inline; no `<a>`.
3. **"Monitoring" group** — new. A quiet subheading ("Monitoring") + a single summary row: hollow dot + "{selfHealCount} clearing on their own, no action needed" (the same shape as the old copy, and now it is TRUE because it only covers the 3 genuinely self-healing codes). No em-dash in the string (project rule). Individual self-heal items are not enumerated (nothing to act on).

Retire the old bottom footer (`AttentionMenu.tsx:141-151`) — its role is replaced by the Monitoring group.

---

## 4. Action links (`lib/adminAlerts/alertActions.ts`)

- **Extend `AlertActionBuilder` opts** from `{ slug }` to `{ slug, driveFileId }` (line 31-34). `resolveAlertAction` (line 131-138) and its `toAlertItem` call site (`attentionItems.ts:272`) thread `driveFileId` through.
- **`openSheet`** (existing, line 58): prefer `opts.driveFileId` (show-level, always present for a show modal), fall back to `str(context,"drive_file_id")`. This makes it robust for `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` whose context lacks it.
- **New `showAnchor(hash, label)` builder:** returns `/admin?show={slug}#{hash}` (internal). Mirrors `shareAccess` (line 45-55).
- **Register 10 new codes** in `ALERT_ACTION_CODES` / `ALERT_ACTIONS` (line 13-25, 81-127): the 6 sheet codes (`SHEET_UNAVAILABLE`, `OPENING_REEL_NOT_VIDEO`, `OPENING_REEL_PERMISSION_DENIED`, `REEL_DRIFTED`, `EMBEDDED_ASSET_DRIFTED`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`) → `openSheet`; the 4 codes `PARSE_ERROR_LAST_GOOD`, `RESYNC_QUALITY_REGRESSED`, `SHOW_UNPUBLISHED`, `USE_RAW_DECISION_STALE` → `showAnchor("overview", "Go to Overview")`. That is 6 + 4 = 10 new. (`RESYNC_SHRINK_HELD` is the 11th linked code but is ALREADY registered → `#overview`, so it is not re-added.)
- **`AttentionMenu` now renders `item.action`** (previously only the banner did). Same `AlertActionLink` shape; no new type.

---

## 5. Copy

Working copy (final wording is refinable in the impeccable copy pass; user-visible strings carry no em-dash per project rule, only a period or middot):

- Pill: `{n} to confirm`, `{n} to review`, `{n} monitoring`.
- Menu group headings: "Needs a look", "Monitoring".
- Monitoring summary row: "{n} clearing on their own, no action needed".
- Per-code fix hints (needs-a-look), one short line each:
  - `SHEET_UNAVAILABLE`: "Re-share the sheet with the service account."
  - `OPENING_REEL_NOT_VIDEO`: "Replace the reel link with a video URL."
  - `OPENING_REEL_PERMISSION_DENIED`: "Re-share the video, or replace the link."
  - `REEL_DRIFTED` / `EMBEDDED_ASSET_DRIFTED`: "Re-save the sheet to re-stage it."
  - `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`: "Re-save the sheet to recover the diagram."
  - `PARSE_ERROR_LAST_GOOD`: "Fix the sheet, crew keep the last good version."
  - `RESYNC_QUALITY_REGRESSED`: "Fix the sheet to restore data quality."
  - `RESYNC_SHRINK_HELD`: "Review, then re-sync or fix the sheet."
  - `SHOW_UNPUBLISHED`: "Turn Published back on when ready."
  - `USE_RAW_DECISION_STALE`: "Re-choose raw text if you still want it."
  - `ASSET_RECOVERY_BYTES_EXCEEDED`: "Trim the gallery under 60 images / 50MB / 3GB."

(Copy strings are shared definitions referenced by tests; do not duplicate literals across sections — the fix-hint map is the one source.)

---

## 6. Guard conditions / edge cases

- **`driveFileId` null/empty:** `buildSheetDeepLink` returns null (`buildSheetDeepLink.ts:12`) → `resolveAlertAction` returns null → row renders read-only with fix hint, no `<a>`. No dead link.
- **`slug` null/empty:** `showAnchor` returns null (mirrors `shareAccess:47-49`) → read-only row, no `<a>`.
- **`needsLookCount === 0`:** the "Needs a look" group and its pill segment do not render.
- **`selfHealCount === 0`:** the "Monitoring" group and its pill segment do not render.
- **All counts 0:** "In sync" (unchanged).
- **`alertsDegraded`:** alerts array is empty (`_showReviewModal.tsx:306` passes `[]`), so all counts 0 → "Alerts unavailable" pill (unchanged). No group renders.
- **`clearingKind` undefined on an actionable/hold item:** groups filter on `!i.actionable && clearingKind === X`, so holds/actionables never leak into a clearing group.
- **A code that is auto-resolving, doug-audience, but NOT yet classified** (new code added later): `isSelfHealing` returns false → defaults to `needs_look` (fails safe visible, not hidden), and the exhaustiveness meta-test (§10) fails in CI until it is explicitly classified.

---

## 7. Dimensional invariants

The menu rows and groups are flow-layout (`flex` with `gap`, no fixed-height parent constraining children). No fixed-dimension parent → child stretch relationship is introduced. **Dimensional-invariants layout task = N/A** (declared, per AGENTS.md writing-plans rule). The dot uses `size-2 shrink-0`; rows use `min-h-tap-min` for tap target (existing pattern, `AttentionMenu.tsx:112`).

---

## 8. Transition inventory

Pill visual states: `to-confirm/review composite`, `monitoring-only`, `degraded`, `in-sync`. Menu: `closed`, `open`.

| From → To | Treatment |
|-----------|-----------|
| pill state → pill state (count changes) | instant — text/segment swap, no animation (matches current pill, which is instant) |
| menu closed → open | existing `AttentionMenu` open transition (unchanged) |
| menu open → closed | existing (unchanged) |
| chevron rotate (menu open) | existing `rotate-180 transition-transform` (`PublishedReviewModal.tsx` chevron, unchanged) |

No new animated states. Groups appear/disappear with the menu (no independent enter/exit). No `AnimatePresence` added. Compound transitions: none introduced.

---

## 9. Data / DB completeness matrix

**N/A — no DB-touching change.** No table DDL, CHECK, RPC, trigger, cleanup, or migration. New state is derived TypeScript only (`SELF_HEALING_CODES` set; `AttentionItem.clearingKind`; extended `AlertActionBuilder` opts). No §12.4 catalog code added or edited (fix-hint copy is UI copy, not catalog message rows). Flag lifecycle table = N/A (no boolean config/toggle).

---

## 10. Meta-test inventory

- **CREATE** a new exhaustiveness test `selfHealingClassification` in `tests/adminAlerts/` — guard: every doug-audience `resolution:"auto"` code (the 15) is classified as exactly one of `SELF_HEALING_CODES` (monitoring) or its complement (needs-a-look); a NEW such code that is unclassified fails the test. Pins §2 as the single source of truth.
- **EXTEND** `tests/admin/_metaAttentionItemsTopology.test.ts` — the new `driveFileId` arg + gallery call site must keep `deriveAttentionItems` reachable from exactly the two admitted callers (`app/admin/_showReviewModal.tsx:306`, `app/admin/dev/attention-gallery/buildBlockProps.ts:163`). Update the gallery call site to pass `driveFileId` (mock).
- **EXTEND** `tests/admin/attentionExclusionSet.test.ts` — unchanged behavior (health codes still excluded), confirm the 15-code RENDERS set is unaffected by the new field.
- No admin-mutation observability registry change (invariant 10): this feature adds NO mutation surface (read/render only, no new route or server action). Declared N/A.
- No `admin_alerts.upsert` catalog change; no advisory-lock surface. Declared N/A.

---

## 11. Tests (TDD per task)

Anti-tautology: assert against the derived data (`deriveAttentionItems` output, the classification set), not a container that renders both groups. Derive expected counts from fixtures, not hardcoded.

1. `deriveAttentionItems` tags `clearingKind` correctly: a `SYNC_STALLED` alert → `self_heal`; a `SHEET_UNAVAILABLE` alert → `needs_look`; an actionable alert → no `clearingKind`. (extends `attentionItems.test.ts`)
2. Ordering: within clearing, `needs_look` sorts before `self_heal`.
3. Action resolution: `SHEET_UNAVAILABLE` with show `driveFileId` (and empty context) → `openSheet` link built from show-level id (failure mode caught: the EMBEDDED_RECOVERY context-less case). `SHOW_UNPUBLISHED` → `/admin?show={slug}#overview`. Missing `driveFileId` → null action (read-only row).
4. Exhaustiveness meta-test (§10) — a synthetic unclassified auto-resolving doug code fails.
5. Pill (real-browser or RTL): with `actionable=3, needsLook=4, selfHeal=2` the pill shows all three segments and the `to review` count does NOT vanish (the core bug). With `actionable=0, needsLook=0, selfHeal=1` → "monitoring" only, non-interactive. With all 0 → "In sync".
6. Menu render: needs-a-look rows are read-only (no row-level `onNavigate`); the `<a>` is the only interactive descendant; external sheet links carry `target=_blank rel=noopener`. Monitoring group is a single summary row, not enumerated. (Clone-and-strip the actionable rows before scanning, per anti-tautology rule.)
7. Fail-open: a needs-a-look item with null `driveFileId` renders its fix hint and NO anchor (no dead link).
8. e2e (if attaching Playwright): pill → open menu → sheet link has correct `href`. Harness-readiness: reuse existing published-modal e2e boot; gate on row hydration.

---

## 12. Sequencing (in-flight coordination)

- **`fix/unread-callout-dedup`** (live sibling, adds a clearing-pill label test — basename `clearingPillLabel` — pinning the old "N clearing" pill a11y label): this branch's CODE MERGE waits for it to land on `origin/main`. Then rebase this branch onto it and update/supersede that test to match the new pill copy (`to confirm · to review · monitoring`), inheriting its accessible-label approach. Spec + plan + adversarial reviews proceed independently now (docs, no conflict).
- **`feat/attention-modal-gallery`** (live sibling, dev scenario switcher touching `_metaAttentionItemsTopology.test.ts`): once it lands, add scenario fixtures for the new pill/menu variants (composite pill, needs-a-look rows with/without link, monitoring-only, in-sync) to its `AttentionModalSwitcher` for visual review. Coupling deferred, not structural. If it lands first, the topology-meta extension (§10) must reconcile with its gallery call-site changes at rebase.

---

## 13. Out of scope / backlog

- Ignore/dismiss mechanic on admin_alerts (rejected Direction 3).
- The 12 health-audience auto-resolving codes (different surface).
- New snapshot repair routes; `BL: expose snapshot-delete-repair route` (delete-unstick logic already exists in `repairSnapshotRollback`, `promoteSnapshot.ts:412-427`, just unexposed) — filed to BACKLOG.
- Final copy polish (impeccable pass owns wording within the structure fixed here).

---

## 14. Citation ledger (verified against worktree base `origin/main`, 2026-07-21)

- Exclusion filters: `fetchPerShowAlerts.ts:79-80`, `attentionItems.ts:335-337`, `audience.ts:34-39`.
- `deriveAttentionItems` sig/args/split: `attentionItems.ts:303-315, 335-341`; actionable flag `attentionItems.ts:248`; `AttentionItemBase` `attentionItems.ts:63-71`.
- Pill states: `PublishedReviewModal.tsx:656-704, 705-713, 714-725, 726-738`; derivation `PublishedReviewModal.tsx:304-309`; navigateTo `PublishedReviewModal.tsx:345`; onResolved `PublishedReviewModal.tsx:357-363`.
- Menu rows/footer/props: `AttentionMenu.tsx:112-138 / 141-151 / 29-35`; copy `:105, :148`.
- Actions: `alertActions.ts:13-25 (codes), 31-34 (builder), 45-55 (shareAccess), 58 (openSheet), 81-127 (registry), 131-138 (resolve)`; `buildSheetDeepLink.ts:9-26`.
- Banner (unchanged surface): `AttentionBanner.tsx:160-174 (action), 185-191 (autoClearNote), 208-220 (help popover), 224 (anchor)`.
- Call sites: `app/admin/_showReviewModal.tsx:257 (driveFileId available), 306 (derive call)`; `app/admin/dev/attention-gallery/buildBlockProps.ts:163`.
- Anchors: `OverviewSection.tsx:52 (#overview)`, `ChangesSection.tsx:55 (#changes)`; no `#parse` in published modal.
- drive_file_id in context: `runManualSyncForShow.ts`, `runScheduledCronSync.ts`, `applyStaged.ts:1960-1966` (5 of the 6 sheet-link codes carry it in context); `assetRecovery.ts:590-592` shows `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` does NOT, so it uses the threaded show-level `driveFileId`.
- Topology meta-test: `tests/admin/_metaAttentionItemsTopology.test.ts:2-14, 57-113`.
