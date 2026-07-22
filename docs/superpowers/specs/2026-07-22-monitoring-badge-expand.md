# Spec — Monitoring badge expands: enumerate monitoring items in the attention menu

Date: 2026-07-22
Status: Draft
Amends: `docs/superpowers/specs/2026-07-21-attention-needs-attention-split.md` §3.2 (pill state B non-interactive), §3.4 "Monitoring group" (items not enumerated), §11 tests 4/6, §11.5a exit matrix.

## 1. Summary

The published-show review modal's monitoring-only attention pill ("N monitoring") is currently a non-interactive `<span>` (`components/admin/showpage/PublishedReviewModal.tsx:837`), and even when the composite pill opens the attention menu, the Monitoring group renders a single summary row, never the items (`components/admin/showpage/AttentionMenu.tsx:218-238`). The user cannot see WHICH issues the system is watching.

This feature makes the monitoring-only pill an interactive button that opens the existing attention menu, and makes the Monitoring group enumerate one row per item — hollow positive-tone dot + alert title + a per-row auto-resolve note — in both the monitoring-only and composite cases. The one-line summary row is retired.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Monitoring pill becomes expandable ("full expand"), reversing split-spec §3.2 state B (non-interactive) and §3.4 "not enumerated". | User decision 2026-07-22 (this spec's session; visual mockup artifact) — this spec IS the ratified amendment. |
| Row content is Option B: title + per-row note, notes sourced from the existing `AUTO_RESOLVE_NOTES` map via `autoResolveNote()` (`lib/adminAlerts/audience.ts:135-140`). No new copy strings. | User picked Option B from the three-option mockup, 2026-07-22. |
| Monitoring-only pill keeps its QUIET visual (grey `bg-surface-sunken` palette, hollow positive dot, no solid review dot) — it gains a chevron and button behavior, not the amber warning palette. | User-approved mockup shows the grey pill with chevron. |
| Menu stays open when the last actionable/needs-look item clears while monitoring items remain (previously force-closed as an A→B exit). | User-approved design summary, 2026-07-22. |
| Auto-open on alert deep-link still fires only when `actionable.length > 0` (`PublishedReviewModal.tsx:442`) — unchanged. Monitoring items never auto-open the menu. | Scope decision this spec; monitoring is informational. |
| Monitoring rows are read-only — no row-level navigation, no links, no buttons. Enumeration adds visibility, not actions. | Consistent with split-spec §3.4.2 read-only posture; nothing to act on remains true per item. |

## 2. Current behavior (citations verified 2026-07-22 at `origin/main` = 108d98244)

- Interactivity gate: `const interactive = actionable.length > 0 || needsLook.length > 0` — `PublishedReviewModal.tsx:319`.
- Interactive composite pill button: `PublishedReviewModal.tsx:726-821`; monitoring segment `PublishedReviewModal.tsx:776-801` renders its leading middot UNCONDITIONALLY (`PublishedReviewModal.tsx:778`), safe only because the segment is unreachable without a preceding segment today.
- Non-interactive monitoring-only span: `PublishedReviewModal.tsx:831-856` (hollow dot, `title` attr, sr-only tail "clearing on their own, no action needed").
- Degraded span ("Alerts unavailable"): `PublishedReviewModal.tsx:822-830`, gated `alertsDegraded && selfHeal.length === 0`.
- Menu monitoring group summary row: `AttentionMenu.tsx:218-238` ("`{selfHealCount}` clearing on their own, no action needed").
- Menu accessible name: `hasActionable ? "Needs your confirmation" : "Needs a look"` — `AttentionMenu.tsx:110`.
- Derivations: `actionable` `PublishedReviewModal.tsx:303`, `needsLook` `PublishedReviewModal.tsx:307-309`, `selfHeal` `PublishedReviewModal.tsx:313-315`; `AttentionMenu.tsx:92-99` mirrors them from `items`.
- Item shape: `AttentionItem.menuTitle` (`lib/admin/attentionItems.ts:74`), `clearingKind?: "self_heal" | "needs_look"` (`lib/admin/attentionItems.ts:78`) — set ONLY on non-actionable alert rows (`lib/admin/attentionItems.ts:262-266`), so every self-heal item is an alert item carrying `alert.code`.
- Note source: `autoResolveNote(code)` returns `AUTO_RESOLVE_NOTES[code]` else the generic line "Clears automatically when the system detects recovery. No action is needed here." (`lib/adminAlerts/audience.ts:135-140`). All three self-healing codes (`SYNC_STALLED`, `WATCH_CHANNEL_ORPHANED`, plus map rows for others) are covered or fall back; the map is already swept by the copy meta-test for banned characters (`audience.ts:107-109` comment).

## 3. Design

### 3.1 Pill (PublishedReviewModal)

- Gate widens: `interactive = actionable.length > 0 || needsLook.length > 0 || selfHeal.length > 0`.
- The monitoring-only span branch (`PublishedReviewModal.tsx:831-856`) is DELETED. Its rendering folds into the interactive button:
  - When `actionable === 0 && needsLook === 0 && selfHeal > 0` ("monitoring-only"): button uses the quiet palette (`bg-surface-sunken` / `text-text-subtle`, hover `bg-surface-sunken/80`), leads with the hollow positive dot, shows `{n} monitoring` (99+ cap + sr-only exact count preserved), keeps the `title` attribute and the sr-only tail "clearing on their own, no action needed", and appends the chevron.
  - Otherwise (any actionable or needs-look): existing amber warning palette and solid review dot, unchanged.
- **Separator rule (hardened):** the middot before the monitoring segment renders only when `actionable.length > 0 || needsLook.length > 0`. Never a leading glyph. (Split-spec §3.2 separator rule now applies for real to this segment.)
- Degraded state C is unchanged: `alertsDegraded && selfHeal.length === 0` renders the "Alerts unavailable" span. When `alertsDegraded && selfHeal.length > 0`, the monitoring-only INTERACTIVE pill wins (same precedence as today, where the monitoring span won).
- In-sync state D unchanged.
- Hit-band: the interactive button's existing `before:-inset-y-3` band applies as-is to the monitoring-only state (same `py-1 text-xs` box arithmetic, `PublishedReviewModal.tsx:716-720` comment).

### 3.2 Menu Monitoring group (AttentionMenu)

Replaces `AttentionMenu.tsx:218-238`:

- Subheading "Monitoring" (unchanged, sunken header idiom).
- One row per self-heal item, derivation order, shape mirroring the needs-look rows (`AttentionMenu.tsx:171-215`) minus the action link:
  - hollow positive dot (`border-status-positive`, the existing cue at `AttentionMenu.tsx:231`),
  - sr-only tone prefix: `"monitoring, "` (comma, no em dash — banned in user-visible copy), mirroring how the needs-look rows carry `TONE_DOT.notice.srText` (`AttentionMenu.tsx:188`),
  - `item.menuTitle` (title line, truncate),
  - note line: `autoResolveNote(item.alert.code)` for alert items; the generic `autoResolveNote` fallback line for a (currently impossible) non-alert self-heal item — guard with `item.kind === "alert"`, defensive not reachable.
- Rows are read-only `<div>`s — no interactive descendants (stricter than needs-look, which may carry an `<a>`).
- The summary row and its copy string are retired from this surface. (The string "clearing on their own, no action needed" survives on the pill's sr-only tail and `title` only.)
- Scroll boundary: rows render inside the existing `max-h-96` scroller (`AttentionMenu.tsx:122`), which already wraps all groups.
- Accessible name fallback: `hasActionable ? "Needs your confirmation" : needsLook.length > 0 ? "Needs a look" : "Monitoring"`.
- Group separator: `border-t` above the group only when a group precedes it (actionable or needs-look present); when Monitoring leads the panel, its sunken header takes `rounded-t-md` (same rule as the needs-look header, `AttentionMenu.tsx:161-166`).

### 3.3 Open-menu reconciliation (amends split-spec §11.5a)

- The non-interactive exit set shrinks to C (degraded, no monitoring) and D (in-sync). Product: 3 entry shapes × 2 exits = 6 cells. Outcome contract unchanged for those: menu closes, no stale `aria-expanded`, focus rescued to the dialog root.
- NEW behavior: any interactive shape (open) → monitoring-only is NOT an exit. The menu stays open; groups reconcile instantly per split-spec §9 rule 1 (instant insert/remove); the pill recolors amber→quiet instantly (no animation — palette follows data, same doctrine as §9 "client presence follows data"); `aria-expanded` stays true; focus is NOT moved (if focus was on a removed row, the existing focus-rescue contract applies — focus must not land on `<body>`; rescue to the dialog root is acceptable).
- Rebound guard (whole-diff 2026-07-22 in `pillFocusReconcile.test.tsx`) still applies to the C/D paths.

### 3.4 Transition inventory (delta)

Pill states after this change: **A** interactive (composite OR monitoring-only, one button), **C** degraded, **D** in-sync. Pairs A↔C, A↔D, C↔D: instant, no animation (unchanged doctrine). Intra-A palette flip (warning↔quiet as counts move): instant recolor; `transition-colors duration-fast` on the button may smooth it (existing class, acceptable). Menu open motion unchanged (fade+scale entrance, instant close). Compound: palette flip while menu open — covered in §3.3; group appear/disappear mid-open — split-spec §9 rule 1 unchanged.

### 3.5 Guard conditions

- `selfHeal.length === 0`: no Monitoring group, no monitoring segment (unchanged).
- All counts 0 + degraded: state C (unchanged). All counts 0, not degraded: state D (unchanged).
- Unknown/uncatalogued alert code in a self-heal item: `menuTitle` falls back via `alertTitle` (`lib/admin/attentionItems.ts:235-239`), note falls back to the `autoResolveNote` generic line. Nothing renders a raw code (invariant 5).
- `selfHeal.length > 99`: pill caps at "99+", sr-only + `title` carry the exact count (unchanged contract, now on a button).
- 12+ rows: scroller handles overflow (existing `max-h-96`).

## 4. Copy

No new user-visible strings. Reused verbatim: alert titles from the message catalog, notes from `AUTO_RESOLVE_NOTES`/generic fallback, headings "Monitoring", pill copy "{n} monitoring". The sr-only row prefix "monitoring, " is the only new sr-only fragment (no em dash, no raw codes).

## 5. Tests (flips + new pins)

All named files verified live at `origin/main`:

1. `tests/components/admin/showpage/publishedPill.test.tsx:75` — `(0,0,1)` row flips `interactive` to `true`. Keep `publishedPill.test.tsx:103` (hollow dot, no solid dot), `publishedPill.test.tsx:109-140` (sr-only expansion, caps, `title`) — now against a `<button>`. NEW: monitoring-only pill has `aria-expanded` and opens the menu on click; quiet palette class asserted (`bg-surface-sunken`); middot never leads the pill (assert visible text for `(0,0,2)` is exactly "2 monitoring").
2. `tests/components/admin/showpage/clearingPillLabel.test.tsx` — same accessible-label contract, element is now a button; update the "non-interactive" framing comments.
3. `tests/components/admin/showpage/attentionMenuGroups.test.tsx:164-174` — REPLACE "one summary row, individual titles NOT rendered" with: one row per self-heal item in derivation order; each row shows `menuTitle` + `autoResolveNote(code)` text; rows contain NO interactive descendants (`querySelectorAll("button, a")` empty within the group, clone-and-strip actionable/needs-look rows first per anti-tautology rule); summary copy "clearing on their own, no action needed" absent from the menu. Expected note text derived by calling `autoResolveNote(fixtureCode)` — never hardcoded (anti-tautology).
4. `tests/components/admin/showpage/attentionMenuGroups.test.tsx` accessible-name: monitoring-only items → `aria-label="Monitoring"`.
5. `tests/components/admin/showpage/pillFocusReconcile.test.tsx:52-63` — EXIT matrix drops B; cell-count pin becomes 6. NEW test: open `[a,n]` → `(0,0,1)`: menu STAYS open, Monitoring group rows visible, `aria-expanded="true"` retained, focus not on `<body>`.
6. `tests/e2e/attention-pill-focus.spec.ts:131-141` — same matrix change (6 cells) + same new stays-open case (real browser).
7. `tests/components/admin/showpage/pageTransitions.test.tsx:129-141` — update the enumerated animation-site list (monitoring summary row site → monitoring rows site).
8. Gallery: add a monitoring-only scenario to `lib/dev/attentionScenarios/tier2.ts` (the class-mix pattern at `lib/dev/attentionScenarios/tier2.ts:321-326` is the template) so the gallery renders the new expandable quiet pill; existing composite scenarios (`tier3.ts:100`) exercise the enumerated group.
9. Meta/registry sweep: `_metaAttentionItemsTopology.test.ts` (topology), `tests/components/admin/showpage/pageTransitions.test.tsx` (sites), styles registries — run and reconcile; no new mutation surface (invariant 10 N/A — read-only UI), no Supabase call sites (invariant 9 N/A), no DB (tier×domain matrix N/A).

Impeccable dual-gate (invariant 8) applies — `components/` surface.

## 6. Out of scope

- No change to which codes are self-healing (`SELF_HEALING_CODES`, `lib/adminAlerts/audience.ts:97`).
- No actions/links on monitoring rows.
- No change to Overview alert cards, auto-open, or deep-link behavior.
- No change to needs-look or actionable rows.
- The dev attention-gallery beyond the one added scenario.

## 7. Dimensional invariants

None — no fixed-height/width parent with flex/grid children is introduced; the menu keeps its intrinsic-height rows inside the existing `max-h-96` scroller.
