# Bell active-list triage grouping (BELL-2 remaining scope)

**Date:** 2026-07-17
**Slug:** `bell-triage-severity-grouping`
**Surface:** `components/admin/BellPanel.tsx` (active-list render branch only)
**Origin:** DEFERRED.md `BELL-2` — "[P2] No triage structure at 9+ (severity/show grouping + mark-all-read)". Trigger: D4 calibration — real alert volume now observed (notify LIVE on validation 2026-07-16), so the `/impeccable shape` triage pass is un-deferred.

---

## 0. Intent & scope

The bell panel's active section renders one flat, server-ordered list under a single `Active · N` eyebrow. At high volume (a 9+ badge) it opens as an undifferentiated wall — no triage structure. This feature adds **threshold-gated severity grouping**: below a threshold the list stays flat (zero change to today's calm low-volume UX); at or above it, the list re-sections into fixed-order severity groups so "what is on fire" reads first.

**This is a display-only re-section of already-loaded, already-ordered entries.** No feed/API/DB/realtime/badge/catalog change. Severity is already computed per-row client-side (`rowTone`, `BellPanel.tsx:128-132`).

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
- `activeCount < GROUP_THRESHOLD` → **flat mode** (today's render, byte-for-byte).
- `activeCount >= GROUP_THRESHOLD` → **grouped mode**.
- `GROUP_THRESHOLD = 9`, a module-level `const` in `BellPanel.tsx`. Rationale: anchors to the badge's `9+` display cap (`NotifBell.tsx:81`, `count > 9 ? "9+"`) — the same "9+" the DEFERRED entry frames the wall around. Single source of truth; referenced by both the render branch and its tests (tests import the constant, never re-literal `9`).
- **Threshold semantics — deliberate (disagreement-loop preempt):** the threshold is on the **active-entry count** (`active.length`), NOT the unread badge count. The badge counts unseen alerts (`NotifBell.tsx:68`); the panel groups the active LIST. These differ (a read alert stays active). The grouping is a property of the list being triaged, not of unread-ness, so `active.length` is correct. The `9+` badge value is only the mnemonic anchor for the literal `9`, not a data dependency.
- **No collision with truncation:** `feedCap` min is 10 (`bellConfig.ts:6`), so a feed can never truncate below 9 active rows — the threshold sits inside every possible loaded window. If `feed.truncated`, grouping applies to the loaded rows exactly as flat mode renders the loaded rows; the truncation row (`bell-truncation-row`, `BellPanel.tsx:846`) is unchanged and still the honest "there are more" signal.

### 1.2 Grouping (grouped mode only)

- **Tiers, in fixed render order:** `["critical", "notice", "info"]` (the `RowTone` union, `BellPanel.tsx:127`). Displayed labels come from the existing `TONE[tone].label` map (`BellPanel.tsx:139-151`): `critical → "Critical"`, `notice → "Warning"`, `info → "Notice"`. Render order therefore reads **Critical → Warning → Notice** (a clean severity descent). Reusing `TONE[tone].label` keeps the section header vocabulary identical to the per-row glyph tooltip vocabulary — one source of truth for tone names.
- **Partition is stable, not a re-sort:** `active` arrives server-ordered `activityAt DESC` (ratified §7.2). Grouping is a stable partition — within each tier, rows keep their incoming relative order (still `activityAt DESC`). Implementation: `TIER_ORDER.map((tone) => ({ tone, rows: active.filter((e) => rowTone(e) === tone) }))` — `filter` preserves order; no comparator. Never re-sort within or across tiers.
- **Empty tiers are omitted:** a tier with `rows.length === 0` renders nothing (no header, no empty state).
- **Single-tier case:** if all `activeCount` rows share one tone, exactly one tier section renders (e.g. `Warning · 11`). Still grouped mode — the tier header is still triage information. No fallback to flat.
- **Every active entry lands in exactly one tier:** `rowTone` is total over `RowTone` (`BellPanel.tsx:128-132` — `isHealth → critical`; catalog `severity === "info" → info`; else `notice`, including codes absent from the catalog where `isMessageCode` is false). No "other/uncategorized" bucket is possible or needed.

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
| `>= 9` | Grouped mode. |
| `>= 9`, all one tone | Grouped mode, single tier section. |
| `>= 9`, `feed.truncated` | Grouped mode over loaded rows; truncation row still renders below (unchanged). |

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

---

## 2. Dimensional invariants

The active list is normal block flow inside the panel's fixed-max-height **scroll** container (`max-h-panel-max-mobile sm:max-h-panel-max`, overflow-y auto). Adding block-level `<h4>` headings introduces **no new fixed-dimension parent → flex/grid-child stretch relationship** — tier headers and rows are block-flow siblings, exactly like the existing `Active · N` eyebrow and its rows. The severity rail/glyph geometry inside each `ActiveRow` (DI-4/DI-5/DI-7 from the redesign spec) is untouched.

Therefore no new DI relationship is added. The layout e2e (§5) still asserts, in a real browser at 9+ entries: (a) tier headers render in `Critical → Warning → Notice` document order; (b) each row's existing severity-glyph box stays 18px and the row left-edge does not shift between flat and grouped mode; (c) the panel does not overflow horizontally. These reuse the existing `bell-panel-layout.spec.ts` harness and `getBoundingClientRect` assertions — no jsdom.

---

## 3. Transition inventory

States that can change at runtime for this surface: **flat ↔ grouped** (driven only by `active.length` crossing 9 on a load/refetch) and, orthogonally, the per-row and mark-all-read transitions the redesign already owns.

| Transition | Treatment |
| --- | --- |
| flat → grouped (count rises to ≥9 on refetch) | **Instant — no animation.** A data-driven re-render; rows keyed by `alertId` are preserved (no remount), tier headers appear in place. No layout animation is specified or added. |
| grouped → flat (count drops below 9 on resolve/refetch) | **Instant — no animation.** Reverse of the above; tier headers unmount, single `active.map` resumes. |
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

1. **Component (`tests/components/bellPanelRedesign.test.tsx` or `bellPanelDeferrals.test.tsx`, extend):**
   - **Flat below threshold:** a feed with `GROUP_THRESHOLD - 1` active entries → no `bell-section-active-tier-*` headers present; `Active · N` present with N = count; rows render in feed order.
   - **Grouped at threshold:** a fixture of `GROUP_THRESHOLD` active entries spanning ≥2 tones (mix of `isHealth`, an `info`-severity code, and a default/notice code) → tier headers present for exactly the non-empty tones, in `critical → notice → info` DOM order; each header text is `` `${TONE[tone].label} · ${count}` `` with counts derived **from the fixture's per-tone partition** (not hardcoded — anti-tautology: compute expected counts by partitioning the fixture with the same `rowTone` logic, assert the rendered header matches). `Active · N` shows the TOTAL.
   - **Within-tier order preserved:** assert the rendered `alertId` order inside a tier equals the fixture's `activityAt DESC` order for that tier (assert against the partitioned fixture data source, not the rendered container alone).
   - **Empty tier omitted:** a 9+ fixture with zero `info` rows → no `bell-section-active-tier-info` header.
   - **Single-tier:** a 9+ fixture all `notice` → exactly one header `Warning · 9`, no other tier headers, still no flat fallback.
   - **Boundary flip:** at exactly `GROUP_THRESHOLD` → grouped; at `GROUP_THRESHOLD - 1` → flat. (The concrete failure mode: an off-by-one `>` vs `>=` — this test catches it.)
   - **Set preservation across flip:** render grouped with one row pre-expanded; re-render (rerender with a feed one shorter that drops below threshold) → the still-present expanded row stays expanded (expanded Set survives the grouped→flat switch because keys are stable `alertId`).
   - **mark-all-read stability:** grouped fixture with unread rows → click `bell-mark-all-read` → tier headers and their counts unchanged (unread markers clear, grouping does not move).
   - **Non-regression:** existing flat-mode / dot / mark-all-read / severity-glyph assertions stay green unchanged.

2. **Layout e2e (`tests/e2e/bell-panel-layout.spec.ts`, extend):** seed a 9+ active feed spanning tones; open panel; real-browser `getBoundingClientRect`:
   - tier headers exist in `Critical → Warning → Notice` document order (compare `getBoundingClientRect().top` ascending);
   - a row's severity glyph box stays 18px and its left edge matches the flat-mode left edge (no horizontal shift introduced by headers);
   - panel scroll container shows no horizontal overflow at both breakpoints (639/640, reusing the existing boundary harness).

3. **Transition audit (in the same e2e or a component test):** assert the flat↔grouped switch adds no `AnimatePresence`/transition wrapper (grep the grouped render for animation props — there should be none on tier headers); the compound "resolve mid-expand across the threshold" preserves the expanded row.

**Meta-test inventory:** **None created or extended.** This is a display-only component render change — it adds no Supabase call boundary, no admin-alert catalog row, no advisory-lock surface, no mutation surface, no email boundary, no §12.4 code. Declared explicitly per the writing-plans meta-test-inventory rule.

---

## 6. Testids

**Add:** `bell-section-active-tier-{tone}` (one per rendered tier header; `tone ∈ {critical, notice, info}`).
**Unchanged:** `bell-section-active`, `bell-section-active-heading`, `bell-entry-{id}`, `bell-sev-{id}`, `bell-mark-all-read`, `bell-truncation-row`, `bell-section-history`, all `ActiveRow` internals.

---

## 7. Live-code citations (verified 2026-07-17 against worktree off origin/main `200af2d85`)

- Active/history split: `active = feed.entries.filter((e) => e.state === "active")` `components/admin/BellPanel.tsx:776`; `history` `:777`.
- Active section render: `<section data-testid="bell-section-active">` `:804`; `Active · {active.length}` heading `bell-section-active-heading` `:811-815`; `active.map((entry, i) => ...)` with `i > 0` hairline `mx-4 h-px bg-border` `:816-827`.
- Tone: `type RowTone = "critical" | "notice" | "info"` `:127`; `rowTone(entry)` `:128-132` (`isHealth → critical`; `messageFor(entry.code).severity === "info" → info`; else `notice`); `TONE` label map `:139-151` (`critical:"Critical"`, `notice:"Warning"`, `info:"Notice"`).
- mark-all-read (unchanged): `markRead` `:674`; `activeUnread` `:886-889`; `showMarkAll` `:890`; `onMarkAllRead` `:892`; button testid `bell-mark-all-read` `:948`.
- Truncation row: `bell-truncation-row` `:846`.
- Badge cap anchor: `count > 9 ? "9+"` `components/admin/nav/NotifBell.tsx:81`.
- Feed cap floor: `feedCap: { min: 10, max: 200, default: 50 }` `lib/admin/bellConfig.ts:6`.
- Eyebrow tracking tokens (canonical-class lint): `DESIGN.md:176-185` — `tracking-wide` is a non-arbitrary Tailwind default (allowed; the eyebrow-tracking meta-test only bans arbitrary bracket forms).

---

## 8. Shape-pass decisions (disagreement-loop preempts for the reviewer)

- **Grouping axis = severity, not show.** Considered show-grouping; rejected — many codes are show-less system alerts (no slug), forcing an "Other/System" bucket, and severity answers the triage question ("what is on fire") more directly. Severity is also already computed (`rowTone`), so it is zero-new-data. **Do not relitigate show-grouping** — it was a deliberate shape-pass rejection, filed nowhere as pending.
- **Static dividers, not collapsible sections.** Collapsible severity sections were considered and rejected to avoid new per-section collapse state, a caret-rotation transition inventory, and a heavier §13/§14 re-entry — for a panel that already scrolls, static labeled dividers deliver the triage win at a fraction of the surface. **Do not propose adding collapse** — deliberate.
- **Threshold on `active.length`, not unread count** — see §1.1. Deliberate; the `9+` badge is a mnemonic anchor for the literal, not a data dependency.
- **Flat↔grouped is instant (no animation)** — see §3/§4. Deliberate craft choice, not an oversight.
- **`GROUP_THRESHOLD = 9`** is the only magic number; single-sourced as a `const` and imported by tests.

---

## 9. Out of scope

Server feed shape, `get_bell_feed_rows` RPC, resolve-route semantics, realtime transport, badge sources, catalog copy, DB, mark-all-read behavior, per-row severity derivation, history-section rendering, truncation behavior. Any of these surfacing in review → open a question, do not silently expand.
