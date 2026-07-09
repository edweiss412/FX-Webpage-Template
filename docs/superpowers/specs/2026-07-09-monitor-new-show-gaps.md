# Monitor digest — "New shows this period" data-gap signal

**Date:** 2026-07-09
**Status:** spec (autonomous ship)
**Predecessor:** `docs/superpowers/specs/2026-07-08-flow6.2-monitor-digest.md` (flow 6.2 — shipped PR #366). This is the deferred 4th signal, unblocked now that `ambiguity-warnings-v1` (PR #367) has landed.

---

## 1. Intent

Flow 6.2 deferred "New data gaps as a first-class digest line" until `ambiguity-warnings-v1` landed (flow 6.2 spec §"Out of scope", line 34). That branch added **four** ambiguity codes to `lib/parser/dataGaps.ts` `GAP_CLASSES` (`ROOM_HEADER_SPLIT_AMBIGUOUS` → "unclear room split", `HOTEL_GUEST_SPLIT_AMBIGUOUS` → "possibly merged hotel guests", `DATE_ORDER_SUGGESTS_DMY` → "dates may be day-first", `HOTEL_CARDINALITY_EXCEEDED` → "too many hotels"; `dataGaps.ts:61-64`), so the deferral is now clear.

**The genuine coverage hole.** The flow 6.2 sub-threshold **drift** signal (`computeDrift`, `lib/notify/monitorDigest.ts:100`) reports a class going `0 → N` on a show — **but only for shows that have a prior *baseline* applied sync** (a row with `occurred_at <= windowStart`). Line 119 explicitly drops any show missing a baseline: `if (!e.baseline || !e.current) continue; // §3.1 no-baseline / no-current guard`.

So a show whose **first-ever applied sync lands inside the digest window** (no baseline row) carries data-gap / ambiguity warnings that are **invisible today** — dropped by that guard. On the pull-only (cron auto-apply) band this is exactly the silent case flow 6.2 exists to close: an admin who never opens the dashboard never learns a brand-new show came in with, e.g., "possibly merged hotel guests."

**This spec adds a 4th monitor sub-block — "New shows this period"** — that surfaces the non-gate-exempt `GAP_CLASSES` present on the latest applied sync of each **first-seen** show (a show with a `current` applied row but **no** `baseline` applied row in the window).

---

## 2. Scope

### In scope
- New pure helper `computeNewShowGaps(rows: DriftRow[]): MonitorShowGroup[]` in `lib/notify/monitorDigest.ts`, consuming the **same** `driftRows` the drift query already produces (`monitorDigest.ts:175-191`). No new SQL query, no migration.
- New `newShowGaps: MonitorShowGroup[]` field on `MonitorDigestModel` (`monitorDigest.ts:33-38`).
- Fold `newShowGaps` into the model's empty-check (`monitorDigest.ts:194`) and the `deliverDigest` `monitor_totals` context (`lib/notify/deliver.ts:498-503`).
- New render sub-block 4 in `renderMonitorSection` (`lib/notify/templates/digest.ts:26-102`), placed after quiet drift.
- Tests: pure-helper units + a `.db.test.ts` first-seen filter proof.

**Class set in scope.** Every `GAP_CLASSES` entry (`dataGaps.ts:30-64`) **except the single `gateExempt` one** — including all 4 ambiguity codes (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY`, `HOTEL_CARDINALITY_EXCEEDED`). This is exactly the class set `summarizeDataGaps` counts (`DATA_GAP_CODES`, minus the one gate-exempt entry), and the same set `computeDrift` iterates (`monitorDigest.ts:122-123`) — one consistent class filter shared with drift.

### Out of scope (deferred, with reason)
- **Brand-new classes on shows *with* a baseline** — already reported as `0 → N` by the existing drift sub-block. Not re-surfaced here (see §3.3, no-double-report guarantee).
- **Gate-exempt classes** (`VENUE_GEOCODE_UNRESOLVED`; the `gateExempt: true` flag at `dataGaps.ts:60`). Excluded for parity with drift's own class filter (`monitorDigest.ts:123`). See §3.2 Resolved Decision D1.

---

## 3. Design

### 3.1 First-seen detection (reusing the drift query)

The drift query (`monitorDigest.ts:175-191`) selects, per `(drive_file_id, phase)`, the single latest applied `sync_log` row of a **published** show, labelling it `baseline` (`occurred_at <= windowStart`) or `current` (`> windowStart`). It has **no lower bound** on `baseline`, so `baseline` = the most recent applied sync *at or before* the window start (any time in the past).

A **first-seen show** therefore appears in `driftRows` with a `current`-phase row and **no** `baseline`-phase row — precisely the set `computeDrift` skips at line 119. `computeNewShowGaps` consumes the identical `driftRows` array and keeps exactly that complementary set.

### 3.2 `computeNewShowGaps`

```ts
/**
 * "New shows this period" (§new-show-gaps). Complement of computeDrift: for each show
 * with a current applied row but NO baseline row (first-seen inside the window), lists the
 * non-gateExempt GAP_CLASSES present (count > 0) in that current sync. Labels only.
 */
export function computeNewShowGaps(rows: DriftRow[]): MonitorShowGroup[] {
  const byShow = new Map<
    string,
    { slug: string | null; title: string | null; baseline?: DataGapsSummary; current?: DataGapsSummary }
  >();
  for (const r of rows) {
    const e = byShow.get(r.drive_file_id) ?? { slug: r.slug, title: r.title };
    const summary = summarizeDataGaps(r.parse_warnings as never);
    if (r.phase === "baseline") e.baseline = summary;
    else e.current = summary;
    byShow.set(r.drive_file_id, e);
  }
  const out: MonitorShowGroup[] = [];
  for (const e of byShow.values()) {
    if (e.baseline || !e.current) continue; // first-seen only: has current, no baseline
    const items: string[] = [];
    for (const g of GAP_CLASSES) {
      if ((g as { gateExempt?: boolean }).gateExempt) continue; // parity with drift (D1)
      if (e.current.classes[g.code] > 0) items.push(g.label);
    }
    if (items.length > 0) out.push({ showTitle: e.title, slug: e.slug, items });
  }
  return out;
}
```

- Returns `MonitorShowGroup[]` (`{ showTitle, slug, items }`, `monitorDigest.ts:27`); `items` are gap-class **labels** (never codes — invariant 5).
- The `current` summary is the **latest** current sync (the query already selected `rn = 1`), i.e. the show's current state.

**Resolved Decision D1 — gate-exempt classes excluded.** Matches `computeDrift`'s class filter (`monitorDigest.ts:123`) so both signals share one definition of "reportable class." `VENUE_GEOCODE_UNRESOLVED` (the only gate-exempt entry) is intentionally not surfaced here.

**Resolved Decision D2 — no count in the label.** Unlike drift (`prior → curr`), a first-seen show has no prior, so a bare label ("possibly merged hotel guests") is clearer than "0 → N". Counts are omitted.

### 3.3 No-double-report guarantee (structural)

`newShowGaps` ∩ `drift` = ∅ **by construction**: `computeDrift` requires a `baseline` (skips when `!e.baseline`, line 119); `computeNewShowGaps` requires **no** `baseline` (skips when `e.baseline`). A show is in at most one. No dedup logic needed. (A first-seen show CAN also appear in the `autoApplied` sub-block — that reads `show_change_log`, a different source/facet; intended, not a duplicate.)

### 3.4 Model change

`MonitorDigestModel` (`monitorDigest.ts:33-38`) gains a field:

```ts
export type MonitorDigestModel = {
  windowStart: string;
  autoApplied: MonitorShowGroup[];
  autofix: AutoFixSummary;
  drift: MonitorDriftEntry[];
  newShowGaps: MonitorShowGroup[]; // NEW
};
```

`buildMonitorDigestModel` computes `const newShowGaps = computeNewShowGaps(driftRows);` right after `const drift = computeDrift(driftRows);` (`monitorDigest.ts:192`), and:
- Empty-check (`monitorDigest.ts:194`) becomes:
  `if (autoApplied.length === 0 && autofix.total === 0 && drift.length === 0 && newShowGaps.length === 0) return { kind: "empty" };`
- Return payload includes `newShowGaps`.

### 3.5 Render sub-block 4

Appended to `renderMonitorSection` (`templates/digest.ts`) after sub-block 3 (quiet drift), before the `if (text.length === 0) return null` guard:

```ts
// Sub-block 4: new shows this period (first-seen shows carrying data gaps).
if (monitor.newShowGaps.length > 0) {
  text.push("New shows this period:");
  html.push("<h3>New shows this period</h3>");
  const shown = monitor.newShowGaps.slice(0, DIGEST_MAX_SHOWS);
  const rowsHtml: string[] = [];
  for (const g of shown) {
    const title = g.showTitle ?? "Untitled show";
    const shownItems = g.items.slice(0, DIGEST_MAX_ITEMS_PER_SHOW);
    const overflowItems = Math.max(0, g.items.length - DIGEST_MAX_ITEMS_PER_SHOW);
    const clsText = shownItems.join(", ");
    const suffix = overflowItems > 0 ? `, +${overflowItems} more` : "";
    text.push(`  ${title}: ${clsText}${suffix}`);
    rowsHtml.push(`<li>${escapeHtml(`${title}: ${clsText}${suffix}`)}</li>`);
  }
  html.push(`<ul>${rowsHtml.join("")}</ul>`);
  const overflowShows = Math.max(0, monitor.newShowGaps.length - DIGEST_MAX_SHOWS);
  if (overflowShows > 0) {
    const more = `+${overflowShows} more shows`;
    text.push(`${more}: ${dashboard}`);
    html.push(`<p><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></p>`);
  }
}
```

- Caps: `DIGEST_MAX_SHOWS = 12`, `DIGEST_MAX_ITEMS_PER_SHOW = 5` (`lib/notify/constants.ts:16-17`) — same as every other sub-block.
- Overflow: `+N more` per show (inline), `+M more shows` (dashboard link) — mirrors drift's boundary behavior (`templates/digest.ts:87,92-97`).
- Every dynamic value HTML-escaped via `escapeHtml`.
- Omitted entirely when `newShowGaps.length === 0`.

### 3.6 Wiring — `deliver.ts` context

`monitor_totals` (`deliver.ts:498-503`) gains one field:
`newShowGapsShows: input.monitor.newShowGaps.length`.
No `runNotify.ts` change — it passes the whole model through (`runNotify.ts:463`); the empty-check and send-condition already live in `buildMonitorDigestModel` / the existing loop.

---

## 4. Guard conditions

| Input state | Behavior |
| --- | --- |
| `newShowGaps` empty | Sub-block omitted; no heading. If it's the only signal and it's empty, the whole monitor section can still be empty → `{ kind: "empty" }`. |
| A first-seen show with a clean current sync (0 gaps) | Not included (`items.length === 0` → skipped). |
| First-seen show, all present classes gate-exempt | Not included (all filtered by D1 → `items.length === 0`). |
| `showTitle === null` | Renders "Untitled show" (mirrors `templates/digest.ts:40,83`). |
| `> 12` first-seen shows | Capped at 12; "+N more shows" note links to `${origin}/admin`. |
| `> 5` gap classes on one show | First 5 labels; ", +N more" suffix. |
| Show in both `autoApplied` and `newShowGaps` | Appears in both sub-blocks (different sources); intended. |
| Show has a baseline (not first-seen) | Never in `newShowGaps`; drift owns it (§3.3). |

---

## 5. Invariants

- **Inv 5 (no raw codes in UI).** Email renders `GAP_CLASSES` **labels** only; codes never appear. Test asserts no `AMBIGUOUS`/`UNREADABLE`-style token in output.
- **Inv 9 (Supabase call-boundary).** **No new boundary.** `computeNewShowGaps` is a pure function over already-fetched `driftRows`; it issues no query. `buildMonitorDigestModel` (already registered in `tests/notify/_metaInfraContract.test.ts`) keeps its single try/catch → `{ kind: "infra_error" }`. No `_metaInfraContract` change.
- **Inv 2 (advisory lock).** N/A — read-only; no mutation of `shows`/`crew_members`/… .
- **Inv 8 (impeccable UI gate).** N/A — email template (`lib/notify/templates/**`), not a `app/`/`components/` UI surface.
- **Inv 10 (mutation-surface telemetry).** N/A — no mutation surface added.
- **Migration → validation parity.** N/A — no migration.

**Meta-test inventory:** none created or extended. `_metaInfraContract` unchanged (no new boundary, per Inv 9 above). Declared explicitly per the writing-plans meta-test-inventory rule.

---

## 6. Test plan

Two-tier, mirroring flow 6.2 (pure-helper units + `.db.test.ts` filter proof).

### 6.1 Pure-helper units — `tests/notify/monitorNewShowGaps.test.ts`
Failure modes each test catches:
- **First-seen isolation:** rows for show A (`current` only) + show B (`baseline` + `current`) → only A returned. Catches a helper that ignores the baseline check and double-reports B (already in drift).
- **Clean first-seen skipped:** show with `current` row, zero gaps → not returned. Catches emitting empty-item groups.
- **Gate-exempt excluded (D1):** first-seen show whose only gap is the gate-exempt class → not returned. Catches dropping the `gateExempt` filter.
- **Label mapping (incl. ambiguity codes):** first-seen show with `ROOM_HEADER_SPLIT_AMBIGUOUS` + `HOTEL_GUEST_SPLIT_AMBIGUOUS` + `DATE_ORDER_SUGGESTS_DMY` → `items === ["unclear room split", "possibly merged hotel guests", "dates may be day-first"]` (order = `GAP_CLASSES` order). **Expected labels are derived by looking up each seeded code in `GAP_CLASSES` at test-build time (not hardcoded)**, so the assertion tracks the source. Explicitly includes `DATE_ORDER_SUGGESTS_DMY` to pin that all in-scope ambiguity codes surface (the R1 corrected-scope guard).
- **All non-gate-exempt classes surface / gate-exempt does not:** a first-seen show seeded with `VENUE_GEOCODE_UNRESOLVED` (gate-exempt) PLUS one non-exempt class → `items` contains only the non-exempt label; "unresolved venue location" is absent. Catches dropping the `gateExempt` filter AND catches a filter that also drops a legit class.
- **`current`-only with `baseline` present is NOT first-seen:** show with both phases and a new `0→N` class → NOT in `newShowGaps` (drift's job). Pins §3.3.

### 6.2 Render — `tests/notify/renderDigest.newShowGaps.test.ts`
- Section renders heading + "Title: label, label" line when `newShowGaps` non-empty; absent when empty.
- No raw code token in `html`/`text` (inv 5): `expect(r.html).not.toMatch(/AMBIGUOUS|UNREADABLE|_/)` on the gap tokens.
- HTML-escapes a `<script>`-bearing show title.
- Cap proof: 13 shows → "+1 more shows"; 6 items on one show → "+1 more".

### 6.3 DB filter proof — `tests/notify/monitorNewShowGaps.db.test.ts`
`describe.runIf(dbUp)`; far-future window (2098 windowStart, rows at 2099; a "would-be-baseline" row at 2097) to isolate from concurrent ~now() parallel-worker rows (flow 6.2 pattern — production filter is `occurred_at`-lower-bound-only). Seeds:
- **PUB-firstseen** (published, applied `current` sync at 2099 with `ROOM_HEADER_SPLIT_AMBIGUOUS`, **no** row ≤ 2098) → **reported**.
- **PUB-baselined** (published, applied row at 2097 baseline + applied `current` at 2099 with the same gap) → **NOT** reported (has baseline; drift owns it).
- **UNPUB-firstseen** (unpublished, `current` at 2099 with a gap) → **NOT** reported (`s.published = true` filter).
- **ORPHAN** (applied `sync_log` row, no matching `shows`) → **NOT** reported (inner join).
Asserts `model.newShowGaps.map(g => g.slug)` equals only the PUB-firstseen slug, and its `items` equal `["unclear room split"]`.

### 6.4 Existing-fixture updates (required-field blast radius)
Adding a **required** `newShowGaps` field to `MonitorDigestModel` breaks every hand-built model literal in the existing suite at typecheck. These get `newShowGaps: []` added in the same task that adds the field:
- `tests/notify/renderDigest.monitor.test.ts` — the `monitor: MonitorDigestModel` literal.
- `tests/notify/runDigestNotify.monitor.test.ts` — the `monitorModel: MonitorDigestModel` literal (`:8`).
- Any other `tests/notify/*` literal the typecheck flags (result-asserting `.db.test.ts` / unit tests read the field off the builder output and need no change, but any `toEqual(expectedModel)` comparison does).
`deliver.test.ts` `monitor_totals` expectation gains `newShowGapsShows`. The `pnpm typecheck` + `pnpm build` gate is the backstop that proves none were missed.

Full-suite gate before push: `pnpm typecheck && pnpm build && pnpm lint && pnpm format:check`; `pnpm vitest run tests/notify tests/sync tests/log`.

---

## 7. Numeric sweep / cross-references

- Caps `12` / `5` — single-sourced from `DIGEST_MAX_SHOWS` / `DIGEST_MAX_ITEMS_PER_SHOW` (`lib/notify/constants.ts:16-17`); never re-literaled in new code.
- All 4 `GAP_CLASSES` ambiguity additions (`lib/parser/dataGaps.ts:61-64`, all in scope): `ROOM_HEADER_SPLIT_AMBIGUOUS` ("unclear room split"), `HOTEL_GUEST_SPLIT_AMBIGUOUS` ("possibly merged hotel guests"), `DATE_ORDER_SUGGESTS_DMY` ("dates may be day-first"), `HOTEL_CARDINALITY_EXCEEDED` ("too many hotels").
- The single gate-exempt entry (excluded): `VENUE_GEOCODE_UNRESOLVED` (`dataGaps.ts:60`).
- First-seen guard cited at `lib/notify/monitorDigest.ts:119`; gate-exempt filter at `:123`.

## 8. Disagreement-loop preempt (for the reviewer)

- **Reusing `driftRows` (no new query) is deliberate**, not an oversight — first-seen shows are already fetched by the drift CTE (`monitorDigest.ts:175-191`), which has no lower bound on `baseline`. A separate query would duplicate the join and risk divergence.
- **All 4 ambiguity codes ARE in scope** (they are all in `GAP_CLASSES`, `dataGaps.ts:61-64`). A first-seen show whose only gap is `DATE_ORDER_SUGGESTS_DMY` renders "dates may be day-first" — intended. (An earlier draft wrongly claimed 2 of them were outside `GAP_CLASSES`; corrected R1.)
- **Excluding gate-exempt classes (D1)** matches drift (`:123`); intentional parity, not asymmetric behavior.
- **No dedup code** because `newShowGaps` ∩ `drift` = ∅ structurally (§3.3). A reviewer expecting explicit dedup should verify the baseline-presence complementarity instead.
