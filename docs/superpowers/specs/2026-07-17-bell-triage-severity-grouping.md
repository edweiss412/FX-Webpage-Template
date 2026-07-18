# Bell active-list triage grouping (BELL-2 remaining scope)

**Date:** 2026-07-17
**Slug:** `bell-triage-severity-grouping`
**Surface:** `components/admin/BellPanel.tsx` (active-list render branch only)
**Origin:** DEFERRED.md `BELL-2` — "[P2] No triage structure at 9+ (severity/show grouping + mark-all-read)". Trigger: D4 calibration — real alert volume now observed (notify LIVE on validation 2026-07-16), so the `/impeccable shape` triage pass is un-deferred.

---

## 0. Intent & scope

The bell panel's active section renders one flat, server-ordered list under a single `Active · N` eyebrow. At high volume it opens as an undifferentiated wall — no triage structure. This feature adds **threshold-gated severity grouping**: below a threshold the list stays flat (zero change to today's calm low-volume UX); at or above it, the list re-sections into fixed-order severity groups so "what is on fire" reads first.

**This is a display-only re-section of already-loaded, already-ordered entries, PLUS one prerequisite severity-correctness fix** (§1.6). No feed/API/DB/realtime/badge change. Severity is computed per-row client-side (`rowTone`, `BellPanel.tsx:128-132`), which this feature both **groups by** and **corrects**.

### Prerequisite pulled into scope: `rowTone` notice-weight health fix (closes a BACKLOG twin)

`rowTone` short-circuits `if (entry.isHealth) return "critical"` (`BellPanel.tsx:129`) BEFORE consulting the health weight, so all **9** `audience:"health"` + `healthWeight:"notice"` codes (`NOTICE_HEALTH_CODES` — `WIZARD_SESSION_SUPERSEDED_RACE`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`, `REPORT_ORPHANED_LOST_LEASE`, `REPORT_LOOKUP_INCONCLUSIVE`, `STALE_ORPHAN_REPORT`, `PICKER_SELECTION_RACE`, `OAUTH_IDENTITY_CLAIMED`, `CALLBACK_CLAIM_THREW`) render a red `CircleAlert`/critical rail even though the health rollup weights them amber. This is the open backlog item `BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT` (`BACKLOG.md:543`), whose stated trigger is **"next bell/health-panel UI pass"** — i.e. this feature.

Grouping by the uncorrected `rowTone` would bake the misclassification into triage (a notice-weight health alert grouped under **Critical**), and since grouping and the per-row glyph share the same `rowTone`, the group header and the row glyph would be consistently-but-wrongly red. Correcting `rowTone` first makes both the glyph AND the grouping correct in one pass. **This closes `BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT` and the remaining `BELL-2` in the same PR (a DEFERRED↔BACKLOG twin reconciliation).**

### Already shipped (NOT this scope — the DEFERRED open-queue line is stale on these)

The `2026-07-06-bell-notification-redesign.md` redesign already shipped the other half of the BELL-2 title:

- **mark-all-read** — `bell-mark-all-read` header button + decoupled `markRead` helper (`BellPanel.tsx:674`, `onMarkAllRead` `:892`, predicate `showMarkAll` `:890`). Unchanged here.
- **per-row severity** — icon-circle / rail glyph `bell-sev-{id}` `data-tone` (`BellPanel.tsx:342-343`), tone from `rowTone` (`:128`). Reused as the grouping key; unchanged.
- **count eyebrow** — `Active · N` heading `bell-section-active-heading` (`BellPanel.tsx:811-815`). Retained; becomes the group container's top eyebrow.

The genuinely-remaining BELL-2 scope = **the grouping itself**. "Show grouping" and "collapsible sections" were both considered and **rejected** in the shape pass (see §8) in favor of static severity dividers.

---

## 1. Behavior

### 1.1 Threshold

- Let `activeCount = active.length` where `active = feed.entries.filter((e) => e.state === "active")` (`BellPanel.tsx:776`).
- Grouped mode engages iff **`activeCount >= GROUP_THRESHOLD && feed.activeTruncated === false`** (strict `=== false`, **fail-closed**). Otherwise **flat mode** (today's render, byte-for-byte).
- **Fail-closed on a missing/non-boolean field (spec R5):** `BellPanel` casts the feed JSON with no runtime validation (`body = (await res.json()) as BellFeedBody`, `BellPanel.tsx:620`), so a stale-deploy / malformed / mock response could omit `activeTruncated`. A loose `!feed.activeTruncated` would then be `!undefined === true` and render groups on a possibly-capped feed — the exact false-completeness this gate exists to prevent. The predicate therefore requires `activeTruncated === true|false` and groups **only** on an explicit `false`; any other value (`undefined`, non-boolean) is treated as truncated → flat. Worst case is a false FLAT (honest, "more exist"), never a false-complete grouped view. The `ready`-arm type makes `activeTruncated` a required `boolean` (§below), so a current server always sends it; the strict check defends only the cross-version / mock edge.
- **Truncation gate (spec R3/R4 — active-completeness honesty):** the server orders active alerts by `greatest(raised_at, last_seen_at) desc limit p_cap` (`get_bell_feed_rows.sql:76-77`) — a **recency** window, severity-blind. So when the ACTIVE list is capped, an older **critical** alert can sit OUTSIDE the loaded window; a severity-grouped view whose `Critical` section is absent would then falsely read as "nothing critical." Grouping's per-severity headers imply severity-**completeness**, which a recency-capped active window cannot honor. Therefore **grouping is suppressed and the list renders flat when the active list is capped** — the flat list + `bell-truncation-row` is the honest signal. This mirrors the shipped mark-all-read truncation gate (`BellPanel.tsx:890`; redesign D3/R3: a partial action "would lie").
- **Gate on ACTIVE-specific truncation, not the global flag (spec R4):** `feed.truncated` (`bellFeed.ts:143-146`) is a GLOBAL OR of `active_hit_cap || history_hit_cap || (slice dropped rows)`. History-only capping (`history_hit_cap`) sets `truncated` true even when the **active** list is complete — gating grouping on the global bit would kill the triage feature exactly under high history volume. The correct signal is active-completeness. This feature therefore **adds a derived `activeTruncated: boolean` field to the client feed result** (`lib/admin/bellFeed.ts` shaped/ready shapes), computed as `Boolean(meta.active_hit_cap)` — a value the RPC ALREADY returns (`get_bell_feed_rows.sql:59-67`, the `p_cap+1` active probe). **No RPC/DB/SQL change** (§9). Active-completeness ⟺ `!meta.active_hit_cap`: the active CTE is capped at `limit p_cap` so `active.length <= feedCap`, and the combined `shaped.slice(0, feedCap)` sorts active-first (`bellFeed.ts:129-141`), so the slice only ever drops HISTORY rows — an active row is dropped only when `active_hit_cap` is already true.
- `GROUP_THRESHOLD = 9`, exported from a new client-safe pure module `lib/admin/bellTriage.ts` (§1.7), NOT from `BellPanel.tsx`. **Rationale — explicit product decision, NOT derived from the badge:** the `BELL-2` ticket frames the wall as "at 9+", read as **nine-or-more active entries** — the point where a flat activity-ordered list stops being glanceable and triage structure earns its keep. Single source of truth; referenced by both the render branch and its tests (tests import the constant, never re-literal `9`).
- **NOT anchored to the badge cap (disagreement-loop preempt, corrected in spec R2):** an earlier draft claimed the threshold "anchors to the badge's `9+` cap." That was wrong on two counts: (a) `NotifBell.tsx:81` renders `count > 9 ? "9+"`, so the badge shows `9+` starting at **10**, not 9; (b) the badge counts **unseen/unread** alerts (`NotifBell.tsx:68`) while the panel groups the **active LIST** (a read alert stays active) — different populations. The badge is therefore not a valid anchor. `9` is a deliberate product choice for the active-list count; the boundary test (§5) proves grouping begins at exactly 9 so no future edit can silently drift it.
- **Threshold vs cap:** `feedCap` min is 10 (`bellConfig.ts:6`), so an active-complete feed can hold ≥9 active rows and reach grouped mode. `activeTruncated` and grouping are mutually exclusive by the gate above — an active-capped feed always renders flat regardless of count. A feed with capped HISTORY but a complete active list of ≥9 **still groups** (that is the whole point of gating on `activeTruncated`, not the global `truncated`).

### 1.2 Grouping (grouped mode only)

- **Tiers, in fixed render order:** `["critical", "notice", "info"]` (the `RowTone` union, `BellPanel.tsx:127`). Displayed labels come from the existing `TONE[tone].label` map (`BellPanel.tsx:139-151`): `critical → "Critical"`, `notice → "Warning"`, `info → "Notice"`. Render order therefore reads **Critical → Warning → Notice** (a clean severity descent). Reusing `TONE[tone].label` keeps the section header vocabulary identical to the per-row glyph tooltip vocabulary — one source of truth for tone names.
- **Partition is stable, not a re-sort:** `active` arrives server-ordered `activityAt DESC` (ratified §7.2). Grouping is a stable partition — within each tier, rows keep their incoming relative order (still `activityAt DESC`). Implementation: `TIER_ORDER.map((tone) => ({ tone, rows: active.filter((e) => rowTone(e) === tone) }))` — `filter` preserves order; no comparator. Never re-sort within or across tiers.
- **Empty tiers are omitted:** a tier with `rows.length === 0` renders nothing (no header, no empty state).
- **Single-tier case:** if all `activeCount` rows share one tone, exactly one tier section renders (e.g. `Warning · 11`). Still grouped mode — the tier header is still triage information. No fallback to flat.
- **Every active entry lands in exactly one tier:** `rowTone` is total over `RowTone` (after the §1.6 fix — `isHealth` → `critical` iff `DEGRADED_HEALTH_CODES.includes(code)` else `notice`; non-health catalog `severity === "info"` → `info`; else `notice`, including codes absent from the catalog). No "other/uncategorized" bucket is possible or needed.

### 1.3 Rendered elements (grouped mode)

Inside the existing `<section data-testid="bell-section-active">` (`BellPanel.tsx:804`):

1. The existing `Active · N` eyebrow `h3` `bell-section-active-heading` (`:811-815`) is **retained unchanged** as the section's top eyebrow; `N = active.length` (total, all tiers).
2. For each non-empty tier, in `TIER_ORDER`:
   - A tier sub-header: `<h4 data-testid={`bell-section-active-tier-${tone}`}>` with text `` `${TONE[tone].label} · ${rows.length}` ``. Styling reuses the existing eyebrow voice one weight down from the section eyebrow — `px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint tabular-nums`. It is a **plain heading, non-interactive** (not a button, no caret, no `aria-expanded`, no collapse state).
   - The tier's rows: `rows.map((entry, j) => ...)` reusing the exact existing `<ActiveRow>` render (`BellPanel.tsx:819-826`) with the exact existing inter-row hairline `<div aria-hidden="true" className="mx-4 h-px bg-border" />`, gated `j > 0` (first row of each tier has no top hairline — the tier header is the visual separator).
3. `key` on each row stays `entry.alertId` (unique feed-wide; grouping does not change keys, so React reconciliation across a flat↔grouped switch is by stable alertId — no remount, expanded/read Sets preserved).

**Flat mode is unchanged**: the existing `active.map((entry, i) => ...)` with `i > 0` hairline (`BellPanel.tsx:816-827`) renders verbatim; no tier headers.

### 1.4 Guard conditions (input edge cases)

| `active.length` | Render |
| --- | --- |
| `0` | No active section at all (existing `active.length > 0` guard, `BellPanel.tsx:799`). Unchanged. |
| `1`–`8` | Flat mode (today's exact render). |
| `>= 9`, `!activeTruncated` | Grouped mode. |
| `>= 9`, `!activeTruncated`, all one tone | Grouped mode, single tier section. |
| `>= 9`, `activeTruncated` | **Flat mode** (grouping suppressed — active-completeness gate §1.1); truncation row renders below (unchanged). |
| `>= 9`, active complete but history capped (`truncated` true, `activeTruncated` false) | **Grouped mode** — history capping does not suppress grouping; truncation row still renders below. |

`feed`, `active`, `history`, `expandedIds`, `readClearedIds`, `now` inputs are all pre-existing and unchanged; no new prop is introduced. `rowTone` never throws (pure switch over defined fields); a malformed/absent code yields `notice`.

### 1.5 Mode boundaries (which elements belong to which mode)

| Element | Flat mode | Grouped mode |
| --- | --- | --- |
| `bell-section-active` wrapper | ✅ | ✅ (same element) |
| `bell-section-active-heading` (`Active · N`) | ✅ | ✅ (same, N=total) |
| `bell-section-active-tier-{tone}` sub-headers | ✗ (never rendered) | ✅ (non-empty tiers only) |
| `<ActiveRow>` rows | ✅ (one `active.map`) | ✅ (one map per tier) |
| inter-row hairline | between all rows (`i>0`) | between rows **within** a tier (`j>0`); tier header separates tiers |
| mark-all-read, history section, truncation row, dev footer | ✅ unchanged | ✅ unchanged |

### 1.6 `rowTone` severity-correctness fix (prerequisite)

(`rowTone` relocates to `lib/admin/bellTriage.ts` per §1.7; the fix below applies as it moves.)

**Before** (`BellPanel.tsx:128-132`):

```ts
function rowTone(entry: BellEntry): RowTone {
  if (entry.isHealth) return "critical";
  const severity = isMessageCode(entry.code) ? messageFor(entry.code).severity : undefined;
  return severity === "info" ? "info" : "notice";
}
```

**After:**

```ts
function rowTone(entry: BellEntry): RowTone {
  if (entry.isHealth) return DEGRADED_HEALTH_CODES.includes(entry.code) ? "critical" : "notice";
  const severity = isMessageCode(entry.code) ? messageFor(entry.code).severity : undefined;
  return severity === "info" ? "info" : "notice";
}
```

- `DEGRADED_HEALTH_CODES` is imported from `@/lib/adminAlerts/audience` (`audience.ts:19` — `audience:"health"` ∧ `healthWeight:"degraded"`, 16 codes). `BellPanel` already imports `isMessageCode`/`messageFor` from `lib/messages`; this adds one import from `audience.ts` (a client-safe pure catalog-derived module — no server-only imports; verify at plan time it is import-safe from a `"use client"` component).
- **Effect on tone:** the 9 `NOTICE_HEALTH_CODES` move `critical → notice` (both the per-row rail/glyph color red→amber AND their grouping tier Critical→Warning). The 16 `DEGRADED_HEALTH_CODES` stay `critical`. Non-health codes are unaffected. A health code that were ever weightless (neither set) resolves to `notice` — the safe, non-over-escalating direction.
- **This is a per-row visual change** (glyph/rail color) independent of the ≥9 grouping — it applies in flat mode too. It is therefore a UI-surface change under invariant 8; the impeccable dual-gate already required by the grouping covers it.
- **No token/contrast regression:** the `TONE` map (`BellPanel.tsx:139-151`) is unchanged — only which tone a given code maps to changes. The `status-token-contrast` pairs are untouched.
- **Guard:** `entry.code` is always a string on `BellEntry` (`bellFeed.ts` shape); `DEGRADED_HEALTH_CODES.includes` on an uncataloged/empty code returns `false` → `notice`. `rowTone` still never throws.

### 1.7 Module layout — extract a client-safe triage module (spec R5)

`BellPanel.tsx` imports a `"use server"` action (`retryWatchSubscriptionFormAction` from `@/app/admin/actions`, `BellPanel.tsx:69`), so importing the component just to read a constant drags a server-action dependency chain into node/Playwright tests (existing component tests already mock around it). Requiring e2e/unit tests to `import { GROUP_THRESHOLD } from BellPanel` would risk CI failures or push implementers to re-literal `9`, defeating the single-source rule.

**Create `lib/admin/bellTriage.ts`** — a pure, client-safe module (no React, no server-only imports; may import the catalog-derived `lib/messages` + `lib/adminAlerts/audience`, both already client-safe). It exports:

- `GROUP_THRESHOLD = 9`
- `type RowTone = "critical" | "notice" | "info"` and `rowTone(entry): RowTone` (moved verbatim from `BellPanel.tsx:127-132`, with the §1.6 fix applied)
- `TIER_ORDER: readonly RowTone[] = ["critical", "notice", "info"]`
- `groupActiveBySeverity(active: BellEntry[]): { tone: RowTone; rows: BellEntry[] }[]` — the stable partition (§1.2), returning only non-empty tiers in `TIER_ORDER`.

`BellPanel.tsx` imports all of the above from `bellTriage.ts` (the `TONE` display map with its lucide icons STAYS in `BellPanel.tsx` — it is not pure). Tests (component, e2e, and a new `tests/admin/bellTriage.test.ts` unit) import from `bellTriage.ts`, never re-literal `9`. This is a pure refactor of existing `rowTone` plus the new grouping helper; no behavior change beyond §1.6.

---

## 2. Dimensional invariants

The active list is normal block flow inside the panel's fixed-max-height **scroll** container (`max-h-panel-max-mobile sm:max-h-panel-max`, overflow-y auto). Adding block-level `<h4>` headings introduces **no new fixed-dimension parent → flex/grid-child stretch relationship** — tier headers and rows are block-flow siblings, exactly like the existing `Active · N` eyebrow and its rows. The severity rail/glyph geometry inside each `ActiveRow` (DI-4/DI-5/DI-7 from the redesign spec) is untouched.

Therefore no new DI relationship is added. The layout e2e (§5) still asserts, in a real browser at 9+ entries: (a) tier headers render in `Critical → Warning → Notice` document order; (b) each row's existing severity-glyph box stays 18px and the row left-edge does not shift between flat and grouped mode; (c) the panel does not overflow horizontally. These reuse the existing `bell-panel-layout.spec.ts` harness and `getBoundingClientRect` assertions — no jsdom.

---

## 3. Transition inventory

States that can change at runtime for this surface: **flat ↔ grouped** (driven by `active.length >= 9 && !feed.activeTruncated` flipping on a load/refetch — the count crossing 9 or `activeTruncated` flipping) and, orthogonally, the per-row and mark-all-read transitions the redesign already owns.

| Transition | Treatment |
| --- | --- |
| flat → grouped (predicate becomes true on refetch) | **Instant — no animation.** A data-driven re-render; rows keyed by `alertId` are preserved (no remount), tier headers appear in place. No layout animation is specified or added. |
| grouped → flat (count drops below 9, OR `activeTruncated` flips true, on resolve/refetch) | **Instant — no animation.** Reverse of the above; tier headers unmount, single `active.map` resumes. |
| tier header idle | **No state.** Static heading — no hover/expand/collapse transition exists. |
| row collapsed ↔ expanded (within a tier) | Unchanged from redesign spec §4B (caret rotate + helpful-context disclosure, `--duration-fast`). Grouping does not touch `expandedIds`. |
| row unread → read | Unchanged (dot+tint fade). |
| mark-all-read click | Unchanged. Clears unread markers via `markRead` (no `expandedIds` mutation, no count change), so **grouping is stable across mark-all-read** — no tier moves, no header count changes (tier counts are entry counts, not unread counts). |
| **compound:** resolve a row WHILE another row is mid-expand, dropping count 9→8 | The expanded row (keyed by `alertId`) stays expanded through the grouped→flat re-render (same element, preserved Set); the resolved row unmounts. Instant re-section; no shared animated property. |
| **compound:** mark-all-read WHILE grouped | Independent — mark-all drives dot/tint opacity only; grouping is a pure function of `active.length`/`rowTone`, neither of which mark-all changes. No clobber. |
| reduced-motion | N/A for the grouping itself (no motion added); inherited row/caret transitions already collapse to 0ms via the global override. |

No N×(N-1)/2 explosion: the grouping adds exactly one binary display axis (flat/grouped) whose only transition is an instant re-render.

---

## 4. Motion

None added. Tier headers are static. The flat↔grouped switch is an instant re-render (no enter/exit animation) — a deliberate craft choice: an animated re-flow of the whole list on every refetch that crosses the threshold would be noise, not signal.

---

## 5. Test strategy (TDD)

All new assertions import `GROUP_THRESHOLD` from `BellPanel` — never re-literal `9`.

0. **`rowTone` correctness (`tests/components/bellPanelRedesign.test.tsx`, extend the existing `derives data-tone` test at `:98-111`):**
   - A `NOTICE_HEALTH_CODES` member (e.g. `STALE_ORPHAN_REPORT`) with `isHealth: true` → `bell-sev-*` `data-tone === "notice"` (the fix; **fails on the pre-fix `isHealth → critical` short-circuit** — this is the TDD red).
   - A `DEGRADED_HEALTH_CODES` member (e.g. `WEBHOOK_TOKEN_INVALID`) with `isHealth: true` → `data-tone === "critical"`.
   - **Non-regression fixture update:** the existing critical case at `:100` (`makeEntry({ alertId: "crit", isHealth: true })` with the default non-health code) currently passes only because of the short-circuit; after the fix a non-health `isHealth` fixture resolves to `notice`. Update that fixture to a real `DEGRADED_HEALTH_CODES` member so the "critical" assertion stays meaningful (production `isHealth` is always a health code — `bellFeed.ts:126` — so an `isHealth:true` + non-health-code fixture is not a real shape anyway). Assert tier membership derives from `DEGRADED_HEALTH_CODES`, not a hardcoded map (anti-tautology).
1. **Component (`tests/components/bellPanelRedesign.test.tsx` or `bellPanelDeferrals.test.tsx`, extend):**
   - **Flat below threshold:** a feed with `GROUP_THRESHOLD - 1` active entries → no `bell-section-active-tier-*` headers present; `Active · N` present with N = count; rows render in feed order.
   - **Grouped at threshold:** a fixture of `GROUP_THRESHOLD` active entries spanning ≥2 tones (mix of `isHealth`, an `info`-severity code, and a default/notice code) → tier headers present for exactly the non-empty tones, in `critical → notice → info` DOM order; each header text is `` `${TONE[tone].label} · ${count}` `` with counts derived **from the fixture's per-tone partition** (not hardcoded — anti-tautology: compute expected counts by partitioning the fixture with the same `rowTone` logic, assert the rendered header matches). `Active · N` shows the TOTAL.
   - **Within-tier order preserved:** assert the rendered `alertId` order inside a tier equals the fixture's `activityAt DESC` order for that tier (assert against the partitioned fixture data source, not the rendered container alone).
   - **Notice-weight health lands in Warning (not Critical):** a 9+ fixture including a `NOTICE_HEALTH_CODES` member (`isHealth: true`) → that row is rendered under `bell-section-active-tier-notice` (Warning), NOT under `bell-section-active-tier-critical`. Directly guards the §1.6 fix at the grouping layer (the concrete failure mode: the pre-fix tone would place it in Critical).
   - **Empty tier omitted:** a 9+ fixture with zero `info` rows → no `bell-section-active-tier-info` header.
   - **Single-tier:** a 9+ fixture all `notice` → exactly one header `Warning · 9`, no other tier headers, still no flat fallback.
   - **Boundary flip:** at exactly `GROUP_THRESHOLD` (non-truncated) → grouped; at `GROUP_THRESHOLD - 1` → flat. (The concrete failure mode: an off-by-one `>` vs `>=` — this test catches it.)
   - **Active truncation suppresses grouping (completeness-honesty, spec R3):** an `activeTruncated: true` feed with `>= GROUP_THRESHOLD` active rows spanning multiple tones → **no** `bell-section-active-tier-*` headers (flat render); `bell-truncation-row` present. Concrete failure mode: a cap-evicted critical alert producing a false-empty Critical section — the flat fallback prevents the misleading "nothing critical" read.
   - **History-only truncation does NOT suppress grouping (spec R4):** a feed with `activeTruncated: false` but the global `truncated: true` (history capped) and `>= GROUP_THRESHOLD` complete active rows → grouping STILL renders (tier headers present). Concrete failure mode this catches: gating on the global `truncated` bit would kill triage under high history volume.
   - **Fail-closed on missing `activeTruncated` (spec R5):** a ready feed whose body OMITS `activeTruncated` (cast-through, cross-version/mock shape) with `>= GROUP_THRESHOLD` active rows → **flat** (no tier headers). Concrete failure mode: `!undefined === true` grouping a possibly-capped feed and falsely implying Critical completeness. Assert the strict `=== false` predicate by feeding `activeTruncated: undefined` AND a non-boolean.
   - **Set preservation across flip:** render grouped with one row pre-expanded; re-render (rerender with a feed one shorter that drops below threshold) → the still-present expanded row stays expanded (expanded Set survives the grouped→flat switch because keys are stable `alertId`).
   - **mark-all-read stability:** grouped fixture with unread rows → click `bell-mark-all-read` → tier headers and their counts unchanged (unread markers clear, grouping does not move).
   - **Non-regression:** existing flat-mode / dot / mark-all-read / severity-glyph assertions stay green unchanged.

2. **Feed pipeline (`tests/admin/bellFeed*.test.ts` — extend/add):**
   - `activeTruncated` derives from `meta.active_hit_cap` **independently** of `history_hit_cap`: a meta row with `active_hit_cap:false, history_hit_cap:true` → `activeTruncated === false` while global `truncated === true`; `active_hit_cap:true` → `activeTruncated === true`.
   - **Route/body proof:** `app/api/admin/alerts/bell/feed/route.ts` returns `activeTruncated` in the JSON body (guards the field actually reaches the client — a spec R5 ask). Assert the serialized body includes a boolean `activeTruncated`.

3. **Triage module unit (`tests/admin/bellTriage.test.ts` — new):** `rowTone` tone mapping incl. the §1.6 notice-health fix (asserted against `DEGRADED_HEALTH_CODES`, not hardcoded); `groupActiveBySeverity` returns tiers in `TIER_ORDER`, omits empty tiers, preserves within-tier input order (stable partition), and `GROUP_THRESHOLD === 9`.

4. **Layout e2e (`tests/e2e/bell-panel-layout.spec.ts`, extend):** seed a 9+ active feed spanning tones; open panel; real-browser `getBoundingClientRect`:
   - tier headers exist in `Critical → Warning → Notice` document order (compare `getBoundingClientRect().top` ascending);
   - a row's severity glyph box stays 18px and its left edge matches the flat-mode left edge (no horizontal shift introduced by headers);
   - panel scroll container shows no horizontal overflow at both breakpoints (639/640, reusing the existing boundary harness).

5. **Transition audit (in the same e2e or a component test):** assert the flat↔grouped switch adds no `AnimatePresence`/transition wrapper (grep the grouped render for animation props — there should be none on tier headers); the compound "resolve mid-expand across the threshold" preserves the expanded row.

**Meta-test inventory:** **None created or extended.** This is a display-only component render change — it adds no Supabase call boundary, no admin-alert catalog row, no advisory-lock surface, no mutation surface, no email boundary, no §12.4 code. Declared explicitly per the writing-plans meta-test-inventory rule.

---

## 6. Testids

**Add:** `bell-section-active-tier-{tone}` (one per rendered tier header; `tone ∈ {critical, notice, info}`).
**Unchanged:** `bell-section-active`, `bell-section-active-heading`, `bell-entry-{id}`, `bell-sev-{id}`, `bell-mark-all-read`, `bell-truncation-row`, `bell-section-history`, all `ActiveRow` internals.

---

## 7. Live-code citations (verified 2026-07-17 against worktree off origin/main `200af2d85`)

- Active/history split: `active = feed.entries.filter((e) => e.state === "active")` `components/admin/BellPanel.tsx:776`; `history` `:777`.
- Active section render: `<section data-testid="bell-section-active">` `:804`; `Active · {active.length}` heading `bell-section-active-heading` `:811-815`; `active.map((entry, i) => ...)` with `i > 0` hairline `mx-4 h-px bg-border` `:816-827`.
- Tone: `type RowTone = "critical" | "notice" | "info"` `:127`; `rowTone(entry)` `:128-132` (CURRENT: `isHealth → critical`; `messageFor(entry.code).severity === "info" → info`; else `notice`); `TONE` label map `:139-151` (`critical:"Critical"`, `notice:"Warning"`, `info:"Notice"`). `isHealth = HEALTH_CODES.includes(r.code)` `lib/admin/bellFeed.ts:126`.
- Health-code sets (for the §1.6 fix): `HEALTH_CODES` `lib/adminAlerts/audience.ts:14` (25 codes), `DEGRADED_HEALTH_CODES` `:19` (16), `NOTICE_HEALTH_CODES` `:24` (9) — all catalog-derived from `audience:"health"` + `healthWeight` (`healthWeight?: "degraded" | "notice"` `lib/messages/catalog.ts:19`). Exemplars verified: `WEBHOOK_TOKEN_INVALID` (`catalog.ts:353`, `audience:"health"`+`healthWeight:"degraded"`); `STALE_ORPHAN_REPORT`/`WIZARD_SESSION_SUPERSEDED_RACE` (in `NOTICE_HEALTH_CODES` at runtime). NOTE: the backlog item's named examples `SYNC_STALLED`/`WATCH_CHANNEL_ORPHANED` are actually `audience:"doug"` (`catalog.ts:2284`,`:338`), NOT health — stale examples; the 9-code class is real regardless (enumerated §0).
- Backlog twin: `BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT` `BACKLOG.md:543` (trigger: "next bell/health-panel UI pass"). BELL-2 open entry `DEFERRED.md:23`.
- mark-all-read (unchanged): `markRead` `:674`; `activeUnread` `:886-889`; `showMarkAll` `:890`; `onMarkAllRead` `:892`; button testid `bell-mark-all-read` `:948`.
- Truncation row: `bell-truncation-row` `:846`.
- Module extraction: `BellPanel` imports `retryWatchSubscriptionFormAction` from `@/app/admin/actions` (`"use server"`) `components/admin/BellPanel.tsx:69`; feed body raw cast `body = (await res.json()) as BellFeedBody` `:620`; `BellFeedBody = Omit<Extract<BellFeedResult,{kind:"ok"}>,"kind">` `:82`. New module `lib/admin/bellTriage.ts` (does not exist yet — created by this feature).
- Feed truncation shape: `BellFeedResult` ready arm `lib/admin/bellFeed.ts:49-57` (`truncated`, `feedCap`, `seenThrough`); global `truncated = Boolean(meta.active_hit_cap) || Boolean(meta.history_hit_cap) || sliced.length < shaped.length` `:143-146`; meta fields `active_hit_cap`/`history_hit_cap` `:70-71`; active-first sort + `slice(0, feedCap)` `:129-141`; public map `:280`. Active `p_cap+1` probe (active-specific hit-cap) `supabase/migrations/20260705100001_get_bell_feed_rows.sql:59-77`.
- Badge cap anchor: `count > 9 ? "9+"` `components/admin/nav/NotifBell.tsx:81`.
- Feed cap floor: `feedCap: { min: 10, max: 200, default: 50 }` `lib/admin/bellConfig.ts:6`.
- Eyebrow tracking tokens (canonical-class lint): `DESIGN.md:176-185` — `tracking-wide` is a non-arbitrary Tailwind default (allowed; the eyebrow-tracking meta-test only bans arbitrary bracket forms).

---

## 8. Shape-pass decisions (disagreement-loop preempts for the reviewer)

- **Grouping axis = severity, not show.** Considered show-grouping; rejected — many codes are show-less system alerts (no slug), forcing an "Other/System" bucket, and severity answers the triage question ("what is on fire") more directly. Severity is also already computed (`rowTone`), so it is zero-new-data. **Do not relitigate show-grouping** — it was a deliberate shape-pass rejection, filed nowhere as pending.
- **Static dividers, not collapsible sections.** Collapsible severity sections were considered and rejected to avoid new per-section collapse state, a caret-rotation transition inventory, and a heavier §13/§14 re-entry — for a panel that already scrolls, static labeled dividers deliver the triage win at a fraction of the surface. **Do not propose adding collapse** — deliberate.
- **Threshold on `active.length`, not unread count; value 9 is a product choice, NOT a badge anchor** — see §1.1 (corrected in spec R2). The `9+` badge counts unread and caps at ≥10; it is explicitly not the anchor.
- **Grouping gated on ACTIVE-completeness (`activeTruncated`), not the global `truncated` bit (spec R3/R4)** — an active-capped recency window (`get_bell_feed_rows.sql:76-77`) can hide an older critical alert, so severity sections would falsely imply completeness → suppress to flat (mirrors the shipped mark-all-read gate `BellPanel.tsx:890`). But history-only capping must NOT suppress grouping, so the gate uses a new derived `activeTruncated` (`= Boolean(meta.active_hit_cap)`, no RPC/DB change). Server-side critical-priority-before-cap is out of scope (RPC/DB). **Do not relitigate** as "grouping should still apply to loaded rows," "the feed should prioritize critical," or "use the existing `truncated` flag" (it is not active-specific).
- **mark-all-read keeps using the global `truncated` flag — deliberately unchanged.** It is out of scope (§9) and its global-flag gate is strictly MORE conservative (hides slightly more often under history-only capping), never wrong. Retrofitting it onto `activeTruncated` is a separate nicety, intentionally not bundled. **Do not relitigate** the asymmetry.
- **`rowTone` fix is in scope, not scope creep** — it is the ratified trigger of `BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT` (BACKLOG.md:543) and a prerequisite for correct grouping (§0/§1.6). Grouping by an uncorrected tone would ship visibly-wrong triage. **Do not relitigate as out-of-scope.**
- **Fail-closed on missing `activeTruncated` is deliberate (spec R5)** — the feed body is a raw `as` cast (`BellPanel.tsx:620`), so the predicate is strict `=== false`; a missing/non-boolean value renders flat, never a false-complete grouped view. **Do not relitigate** as "use `!activeTruncated`."
- **Triage constants live in `lib/admin/bellTriage.ts`, not `BellPanel.tsx` (spec R5)** — because BellPanel imports a `"use server"` action (`:69`) that would leak into node/e2e tests. Single-source `GROUP_THRESHOLD`. **Do not relitigate** the module split.
- **Flat↔grouped is instant (no animation)** — see §3/§4. Deliberate craft choice, not an oversight.
- **`GROUP_THRESHOLD = 9`** is the only magic number; single-sourced as a `const` and imported by tests.

---

## 9. Out of scope

The `get_bell_feed_rows` RPC / SQL / DB / migrations (unchanged — the new `activeTruncated` field is derived on the CLIENT from the `meta.active_hit_cap` the RPC already returns), resolve-route semantics, realtime transport, badge sources, catalog copy/`healthWeight` assignments (consumed as-is, not edited), mark-all-read behavior (keeps the global `truncated` gate, §8), history-section rendering, the server-side truncation/cap policy. **In scope but narrow:** adding the derived `activeTruncated: boolean` to the client `lib/admin/bellFeed.ts` result shapes (`BellFeedResult` ready arm + the internal `shapeBellEntries` return), and the `rowTone` fix (§1.6). Per-row severity **derivation** is in scope; the underlying catalog `audience`/`healthWeight` data is NOT edited — only how `rowTone` reads it. Any out-of-scope item surfacing in review → open a question, do not silently expand.

## 10. Ledger reconciliation (lands in this PR)

- `DEFERRED.md` `BELL-2` (`:23`): move the full entry to `DEFERRED-archive.md` marked RESOLVED (severity grouping + the already-shipped count/mark-all-read now all closed).
- `BACKLOG.md` `BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT` (`:543`): mark SHIPPED (resolved by §1.6) — the twin closes with BELL-2 per the DEFERRED↔BACKLOG twin rule.
