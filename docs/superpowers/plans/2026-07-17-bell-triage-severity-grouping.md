# Bell Triage Severity Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add threshold-gated severity grouping to the bell panel's active list (Critical → Warning → Notice sections at ≥9 active, active-complete feeds) and correct `rowTone` so notice-weight health codes stop rendering as critical.

**Architecture:** Extract a pure client-safe `lib/admin/bellTriage.ts` (threshold, tone, grouping) so tests import it without dragging BellPanel's `"use server"` chain. Surface an active-specific `activeTruncated` on the client feed result (derived from the RPC's existing `meta.active_hit_cap`). BellPanel renders flat below threshold / on active-truncated feeds, grouped otherwise. Display-only + one read-path field; no RPC/DB/migration change.

**Tech Stack:** Next.js 16 (React client component), TypeScript, Vitest + Testing Library (jsdom) for component/unit, Playwright for real-browser layout, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-17-bell-triage-severity-grouping.md` (Codex-APPROVED, 6 rounds). Section refs below (§N) point there.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task** (invariant 6): conventional-commits `<type>(<scope>): <summary>`; scope `bell` or `admin`. One task per commit; `--no-verify` (shared hooks belong to the main checkout).
- **No raw error codes in UI** (invariant 5): unchanged — this feature renders no new user copy beyond tier labels sourced from `TONE[tone].label`.
- **UI quality gate** (invariant 8): BellPanel + bellTriage are UI surfaces → Opus-only + impeccable `critique` AND `audit` dual-gate on the diff BEFORE cross-model review (Task 6).
- **Single-source threshold:** `GROUP_THRESHOLD = 9` lives only in `lib/admin/bellTriage.ts`; every test imports it, never re-literals `9` (§1.1, §1.7).
- **Fail-closed grouping predicate:** group iff `activeCount >= GROUP_THRESHOLD && feed.activeTruncated === false` (strict `=== false`; missing/non-boolean → flat) (§1.1 R5).
- **No RPC/DB/SQL/migration change.** `activeTruncated` derives on the client from `meta.active_hit_cap` the RPC already returns (§1.1 R4, §9).
- **Meta-test inventory:** NONE created or extended. Display-only render change + one read-path feed field; no Supabase call boundary, admin-alert catalog row, advisory-lock, mutation surface, or §12.4 code. (Declared per the writing-plans meta-test-inventory rule.)

## File Structure

- **Create** `lib/admin/bellTriage.ts` — pure triage module: `GROUP_THRESHOLD`, `RowTone`, `rowTone`, `TIER_ORDER`, `groupActiveBySeverity`.
- **Create** `tests/admin/bellTriage.test.ts` — unit tests for the module.
- **Modify** `lib/admin/bellFeed.ts` — add `activeTruncated: boolean` to `BellFeedResult` ok arm, `shapeBellEntries` return, the shaped value, and the public map.
- **Modify** `components/admin/BellPanel.tsx` — import triage from `bellTriage.ts` (delete local `RowTone`/`rowTone`); render grouped/flat active list.
- **Modify** `tests/components/bellPanelRedesign.test.tsx` — fix the existing `derives data-tone` critical fixture; add grouping + fail-closed assertions.
- **Modify** (or add `tests/admin/bellFeed*.test.ts`) — `activeTruncated` derivation + feed route/body proof.
- **Modify** `tests/e2e/bell-panel-layout.spec.ts` — grouped-layout + transition-audit assertions.
- **Modify** `DEFERRED.md`, `DEFERRED-archive.md`, `BACKLOG.md` — ledger reconciliation.

---

### Task 1: Extract `lib/admin/bellTriage.ts` + correct `rowTone`

**Files:**
- Create: `lib/admin/bellTriage.ts`
- Create: `tests/admin/bellTriage.test.ts`
- Modify: `components/admin/BellPanel.tsx:127-132` (delete local `RowTone`/`rowTone`; import from bellTriage) and `:66-72` import block
- Modify: `tests/components/bellPanelRedesign.test.tsx:98-111` (fix the critical fixture)

**Interfaces:**
- Produces: `GROUP_THRESHOLD: 9`, `type RowTone = "critical" | "notice" | "info"`, `rowTone(entry: BellEntry): RowTone`, `TIER_ORDER: readonly RowTone[]`, `groupActiveBySeverity(active: BellEntry[]): { tone: RowTone; rows: BellEntry[] }[]`.
- Consumes: `BellEntry` (`lib/admin/bellFeed`), `isMessageCode`/`messageFor` (`lib/messages/lookup`), `DEGRADED_HEALTH_CODES` (`lib/adminAlerts/audience`).

- [ ] **Step 1: Write the failing unit test**

Create `tests/admin/bellTriage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  GROUP_THRESHOLD,
  TIER_ORDER,
  rowTone,
  groupActiveBySeverity,
} from "@/lib/admin/bellTriage";
import { DEGRADED_HEALTH_CODES, NOTICE_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import type { BellEntry } from "@/lib/admin/bellFeed";

function entry(over: Partial<BellEntry> & { alertId: string }): BellEntry {
  return {
    alertId: over.alertId,
    code: over.code ?? "ADMIN_ALERT_COUNT_FAILED",
    slug: null,
    state: "active",
    activityAt: over.activityAt ?? "2026-07-17T10:00:00.000Z",
    resolvedAt: null,
    occurrences: 1,
    unread: false,
    context: null,
    identity: null,
    isAutoResolving: false,
    autoResolveNote: null,
    action: null,
    isHealth: over.isHealth ?? false,
    ...over,
  } as BellEntry;
}

describe("bellTriage", () => {
  it("GROUP_THRESHOLD is 9 and TIER_ORDER is critical→notice→info", () => {
    expect(GROUP_THRESHOLD).toBe(9);
    expect(TIER_ORDER).toEqual(["critical", "notice", "info"]);
  });

  it("rowTone: degraded-weight health → critical", () => {
    expect(rowTone(entry({ alertId: "d", isHealth: true, code: DEGRADED_HEALTH_CODES[0] }))).toBe(
      "critical",
    );
  });

  it("rowTone: notice-weight health → notice (the §1.6 fix, NOT critical)", () => {
    expect(rowTone(entry({ alertId: "n", isHealth: true, code: NOTICE_HEALTH_CODES[0] }))).toBe(
      "notice",
    );
  });

  it("rowTone: non-health info-severity → info; default → notice", () => {
    expect(rowTone(entry({ alertId: "i", code: "SHOW_FIRST_PUBLISHED" }))).toBe("info");
    expect(rowTone(entry({ alertId: "x", code: "ADMIN_ALERT_COUNT_FAILED" }))).toBe("notice");
  });

  it("groupActiveBySeverity: TIER_ORDER, omits empty tiers, stable within-tier order", () => {
    const rows = [
      entry({ alertId: "n1", code: "ADMIN_ALERT_COUNT_FAILED", activityAt: "2026-07-17T12:00:00Z" }),
      entry({ alertId: "c1", isHealth: true, code: DEGRADED_HEALTH_CODES[0] }),
      entry({ alertId: "n2", code: "ADMIN_ALERT_COUNT_FAILED", activityAt: "2026-07-17T11:00:00Z" }),
    ];
    const groups = groupActiveBySeverity(rows);
    // critical first, then notice; no info tier (empty)
    expect(groups.map((g) => g.tone)).toEqual(["critical", "notice"]);
    // within notice, input order preserved (n1 before n2)
    expect(groups[1].rows.map((r) => r.alertId)).toEqual(["n1", "n2"]);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/admin/bellTriage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin/bellTriage'`.

- [ ] **Step 3: Create the module**

Create `lib/admin/bellTriage.ts`:

```ts
// lib/admin/bellTriage.ts
//
// Pure, client-safe bell triage logic (spec 2026-07-17-bell-triage-severity-grouping).
// Extracted from BellPanel.tsx so tests import the threshold/tone/grouping WITHOUT
// dragging BellPanel's "use server" action chain (spec §1.7). No React, no
// server-only imports — only catalog-derived helpers.
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import { DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import type { BellEntry } from "@/lib/admin/bellFeed";

/** Active-list count at/above which the panel re-sections by severity (spec §1.1). */
export const GROUP_THRESHOLD = 9;

export type RowTone = "critical" | "notice" | "info";

/**
 * Severity tone for a row (spec §1.6). Health rows are critical ONLY when
 * degraded-weight; notice-weight health codes (9 of them) are amber, matching
 * the health rollup — fixes BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT.
 */
export function rowTone(entry: BellEntry): RowTone {
  if (entry.isHealth) return DEGRADED_HEALTH_CODES.includes(entry.code) ? "critical" : "notice";
  const severity = isMessageCode(entry.code) ? messageFor(entry.code).severity : undefined;
  return severity === "info" ? "info" : "notice";
}

/** Fixed render order: highest severity first (spec §1.2). */
export const TIER_ORDER: readonly RowTone[] = ["critical", "notice", "info"];

/**
 * Stable partition of active entries by tone, in TIER_ORDER, empty tiers
 * omitted. `filter` preserves the server's activityAt-DESC order within each
 * tier — never a re-sort (spec §1.2).
 */
export function groupActiveBySeverity(
  active: BellEntry[],
): { tone: RowTone; rows: BellEntry[] }[] {
  return TIER_ORDER.map((tone) => ({ tone, rows: active.filter((e) => rowTone(e) === tone) })).filter(
    (g) => g.rows.length > 0,
  );
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/admin/bellTriage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Rewire BellPanel to import from bellTriage; delete the local copies**

In `components/admin/BellPanel.tsx`, add to the import block (near `:71`):

```ts
import { GROUP_THRESHOLD, TIER_ORDER, rowTone, groupActiveBySeverity, type RowTone } from "@/lib/admin/bellTriage";
```

Delete the local `type RowTone = ...` and `function rowTone(...) {...}` at `:127-132`. Leave the `TONE` map (`:139-151`) in place — it uses lucide icons and stays in BellPanel. (`TONE` is typed `Record<RowTone, ...>`; `RowTone` now comes from the import.) Verify no other local `rowTone`/`RowTone` definition remains.

- [ ] **Step 6: Fix the existing `derives data-tone` critical fixture**

In `tests/components/bellPanelRedesign.test.tsx:98-111`, the critical case uses `makeEntry({ alertId: "crit", state: "active", isHealth: true })` with the default (non-health) code. After the §1.6 fix, `isHealth:true` + a non-health code → `notice`. Change that fixture to a real degraded-weight health code so the "critical" assertion stays meaningful:

```ts
import { DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
// ...
makeEntry({ alertId: "crit", state: "active", isHealth: true, code: DEGRADED_HEALTH_CODES[0] }),
```

Keep the `info` (`INFO_CODE`) and `notice` (`NOTICE_CODE`) cases as-is; assert `bell-sev-crit` `data-tone === "critical"`, `-info` `=== "info"`, `-note` `=== "notice"`.

- [ ] **Step 7: Run the affected suites — verify green**

Run: `pnpm vitest run tests/admin/bellTriage.test.ts tests/components/bellPanelRedesign.test.tsx`
Expected: PASS. Then `pnpm typecheck` — expected: no errors (the `RowTone` import resolves `TONE`'s key type).

- [ ] **Step 8: Commit**

```bash
git add lib/admin/bellTriage.ts tests/admin/bellTriage.test.ts components/admin/BellPanel.tsx tests/components/bellPanelRedesign.test.tsx
git commit --no-verify -m "feat(bell): extract bellTriage module and fix rowTone notice-weight health tone"
```

---

### Task 2: Add active-specific `activeTruncated` to the feed result

**Files:**
- Modify: `lib/admin/bellFeed.ts:49-57` (ok arm), `:91-97` (shaped return type), `:143-147` (shaped value), `:276-284` (public map)
- Test: `tests/admin/bellFeed.test.ts` (extend or create), plus a feed-route body assertion

**Interfaces:**
- Produces: `BellFeedResult` ok arm gains `activeTruncated: boolean`; therefore `BellFeedBody` (BellPanel `:82`) and the `/api/admin/alerts/bell/feed` JSON body gain it automatically (route spreads `{ kind: _kind, ...body }`, `feed/route.ts:24`).
- Consumes: existing `meta.active_hit_cap` (`bellFeed.ts:70`).

- [ ] **Step 1: Write the failing test**

In `tests/admin/bellFeed.test.ts` (add if absent), test `shapeBellEntries` (or the exported shaper) derives `activeTruncated` from `active_hit_cap` independently of `history_hit_cap`. Use the existing test's RPC-row builders; the key assertion:

```ts
it("activeTruncated tracks active_hit_cap independent of history_hit_cap", () => {
  // meta row with active complete but history capped
  const shaped = shapeBellEntries(
    [metaRow({ active_hit_cap: false, history_hit_cap: true }), ...someActiveRows],
    /* feedCap */ 50,
  );
  expect(shaped.activeTruncated).toBe(false);
  expect(shaped.truncated).toBe(true); // global flag still true (history)

  const shaped2 = shapeBellEntries(
    [metaRow({ active_hit_cap: true, history_hit_cap: false }), ...someActiveRows],
    50,
  );
  expect(shaped2.activeTruncated).toBe(true);
});
```

(Reuse the file's existing `metaRow`/row helpers; if none exist, build a meta row matching `RpcRow` with `is_meta: true`, `seen_through` set, `active_hit_cap`/`history_hit_cap` as given.)

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/admin/bellFeed.test.ts`
Expected: FAIL — `activeTruncated` is `undefined` on the shaped result.

- [ ] **Step 3: Add the field through the pipeline**

In `lib/admin/bellFeed.ts`:

1. `shapeBellEntries` return type (`:91-97`) — add `activeTruncated: boolean;`.
2. The shaped return object (the `return { entries: sliced, ... truncated: ..., seenThrough: ... }` near `:141-147`) — add `activeTruncated: Boolean(meta.active_hit_cap),`.
3. `BellFeedResult` ok arm (`:49-57`) — add `activeTruncated: boolean;`.
4. Public map (`:276-284`) — add `activeTruncated: shaped.activeTruncated,`.

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/admin/bellFeed.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the route/body proof test**

Assert the feed route body carries `activeTruncated`. If there is an existing `tests/**/bell*feed*route*.test.ts`, extend it; otherwise add a focused test that calls the route handler with a mocked `buildBellFeed` returning `kind:"ok"` incl. `activeTruncated: false` and asserts `await res.json()` contains `activeTruncated: false`. (The route strips only `kind`; no route code change is needed — this test pins that the field survives serialization.)

- [ ] **Step 6: Run + typecheck**

Run: `pnpm vitest run tests/admin/bellFeed.test.ts` and `pnpm typecheck`
Expected: PASS / no errors (BellPanel's `BellFeedBody` now includes `activeTruncated`; no consumer breaks since Task 3 adds the read).

- [ ] **Step 7: Commit**

```bash
git add lib/admin/bellFeed.ts tests/admin/bellFeed.test.ts
git commit --no-verify -m "feat(bell): expose active-specific activeTruncated on the feed result"
```

---

### Task 3: Render grouped/flat active list in BellPanel

**Files:**
- Modify: `components/admin/BellPanel.tsx:799-828` (active section render branch)
- Test: `tests/components/bellPanelRedesign.test.tsx` (extend)

**Interfaces:**
- Consumes: `GROUP_THRESHOLD`, `TIER_ORDER`, `groupActiveBySeverity`, `rowTone` (Task 1); `feed.activeTruncated` (Task 2); `TONE` (local).
- Produces: testid `bell-section-active-tier-{tone}` per rendered tier header.

- [ ] **Step 1: Write the failing component tests**

Extend `tests/components/bellPanelRedesign.test.tsx`. Import `GROUP_THRESHOLD` from `@/lib/admin/bellTriage`. Build a feed helper that yields `n` active entries across tones (use `isHealth:true`+`DEGRADED_HEALTH_CODES[0]` for critical, `INFO_CODE` for info, default for notice) and a `NOTICE_HEALTH_CODES[0]`+`isHealth:true` entry for the notice-health case. Assertions (each its own `it`):

```ts
// a) flat below threshold: GROUP_THRESHOLD-1 active → no tier headers
// b) grouped at threshold (non-truncated, activeTruncated:false), ≥2 tones:
//    tier headers present only for non-empty tones, DOM order critical→notice→info;
//    header text `${TONE[tone].label} · ${count}` with counts from partitioning the
//    fixture via groupActiveBySeverity (NOT hardcoded); `Active · N` = total.
// c) within-tier alertId order == fixture order for that tone.
// d) notice-weight health lands under bell-section-active-tier-notice, NOT -critical.
// e) empty tier (no info rows) → no bell-section-active-tier-info.
// f) single-tier (all notice) → one "Warning · N" header, no others, still no flat fallback.
// g) boundary: exactly GROUP_THRESHOLD (activeTruncated:false) → grouped;
//    GROUP_THRESHOLD-1 → flat.
// h) activeTruncated:true at ≥GROUP_THRESHOLD → flat (no tier headers), bell-truncation-row present.
// i) history-only: activeTruncated:false + truncated:true, ≥GROUP_THRESHOLD complete active → grouped.
// j) fail-closed: activeTruncated omitted (and a non-boolean) at ≥GROUP_THRESHOLD → flat.
// k) set-preservation: grouped with one row pre-expanded; rerender dropping below
//    threshold → that row stays expanded.
// l) mark-all-read stability: grouped w/ unread → click bell-mark-all-read →
//    tier headers + counts unchanged.
```

Derive expected tier counts by calling `groupActiveBySeverity(fixtureActive)` in the test (anti-tautology: assert the rendered header against the partition, not a literal).

- [ ] **Step 2: Run — verify failures**

Run: `pnpm vitest run tests/components/bellPanelRedesign.test.tsx`
Expected: FAIL on the grouped/boundary/fail-closed cases (no tier headers rendered yet).

- [ ] **Step 3: Implement the grouped render branch**

In `BellPanel.tsx`, replace the active-section body (currently `:799-828`, the `active.length > 0 ? <section>...{active.map(...)}...</section>` block). Compute the mode from the ready feed and render either flat (unchanged) or grouped:

```tsx
{active.length > 0 ? (
  <section
    data-testid="bell-section-active"
    aria-label="Active notifications"
    className="-mx-2 sm:-mx-2.5"
  >
    <h3
      data-testid="bell-section-active-heading"
      className="px-4 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wider text-text-faint tabular-nums"
    >
      Active · {active.length}
    </h3>
    {active.length >= GROUP_THRESHOLD && feed.activeTruncated === false ? (
      // Grouped mode (spec §1.2/§1.3): static severity dividers, activityAt DESC within tier.
      groupActiveBySeverity(active).map((group) => (
        <div key={group.tone}>
          <h4
            data-testid={`bell-section-active-tier-${group.tone}`}
            className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint tabular-nums"
          >
            {TONE[group.tone].label} · {group.rows.length}
          </h4>
          {group.rows.map((entry, j) => (
            <div key={entry.alertId}>
              {j > 0 ? <div aria-hidden="true" className="mx-4 h-px bg-border" /> : null}
              <ActiveRow
                entry={entry}
                now={now}
                expanded={expandedIds.has(entry.alertId)}
                readCleared={readClearedIds.has(entry.alertId)}
                onToggle={() => handleToggle(entry)}
                onRefetch={() => void load(true)}
              />
            </div>
          ))}
        </div>
      ))
    ) : (
      // Flat mode (unchanged from today).
      active.map((entry, i) => (
        <div key={entry.alertId}>
          {i > 0 ? <div aria-hidden="true" className="mx-4 h-px bg-border" /> : null}
          <ActiveRow
            entry={entry}
            now={now}
            expanded={expandedIds.has(entry.alertId)}
            readCleared={readClearedIds.has(entry.alertId)}
            onToggle={() => handleToggle(entry)}
            onRefetch={() => void load(true)}
          />
        </div>
      ))
    )}
  </section>
) : null}
```

Note the predicate `feed.activeTruncated === false` (strict, fail-closed §1.1 R5) — `feed` here is the ready-branch `feed` already in scope in this render path. Do NOT change the mark-all-read predicate (`showMarkAll`, `:891`) — it keeps the global `truncated` flag (spec §8).

- [ ] **Step 4: Run — verify green**

Run: `pnpm vitest run tests/components/bellPanelRedesign.test.tsx tests/components/bellPanelDeferrals.test.tsx tests/components/bellPanel.test.tsx tests/components/bellPanelActions.test.tsx`
Expected: PASS (new + all existing bell component tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/BellPanel.tsx tests/components/bellPanelRedesign.test.tsx
git commit --no-verify -m "feat(bell): severity-group the active list at 9+ on active-complete feeds"
```

---

### Task 4: Real-browser layout + transition audit (e2e)

**Files:**
- Modify: `tests/e2e/bell-panel-layout.spec.ts`

**Interfaces:**
- Consumes: `GROUP_THRESHOLD` from `@/lib/admin/bellTriage` (NOT BellPanel — §1.7); the `bell-section-active-tier-*` testids (Task 3).

This is the mandatory layout-dimensions + transition-audit task (§2, §3). jsdom is insufficient — assertions run in a real browser via the existing Playwright harness in this spec file.

- [ ] **Step 1: Write the failing e2e assertions**

Seed a feed of `GROUP_THRESHOLD` active alerts spanning tones (critical via degraded-health, notice via default, info via an info-severity code), `activeTruncated:false`, open the panel. Add, using the file's existing seed/open helpers and `getBoundingClientRect`:

```ts
// 1. Tier headers exist in Critical→Warning→Notice document order:
//    compare boundingClientRect().top of bell-section-active-tier-critical
//    < -notice < -info (only those present).
// 2. A row's severity glyph box stays 18px (DI-4, unchanged) and the row's
//    left edge in grouped mode equals the flat-mode left edge (no header-induced
//    horizontal shift).
// 3. Panel scroll container has no horizontal overflow at 639px and 640px
//    (reuse the existing breakpoint-boundary assertions).
// 4. Transition audit: the grouped render adds NO AnimatePresence / transition
//    wrapper on tier headers (assert headers carry no transition/animate props);
//    the compound "resolve a row mid-expand so count drops below threshold →
//    grouped→flat" keeps the expanded row expanded.
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm test:e2e tests/e2e/bell-panel-layout.spec.ts` (or the repo's Playwright invocation for this spec)
Expected: FAIL (tier headers not yet asserted / seed lacks 9-alert grouped case) — confirm the new assertions fail for the right reason before Task 3's code is present; since Task 3 already landed, they should PASS once written correctly. If running strictly TDD, stage the assertion additions and confirm they exercise the grouped path.

- [ ] **Step 3: Run — verify green**

Run: `pnpm test:e2e tests/e2e/bell-panel-layout.spec.ts`
Expected: PASS. Also confirm the pre-existing dot-slot/opacity/no-shift and anchored-desktop assertions stay green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/bell-panel-layout.spec.ts
git commit --no-verify -m "test(bell): e2e grouped-layout order + transition audit"
```

---

### Task 5: Full-suite + gates green (pre-impeccable)

**Files:** none (verification task).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS (no regression in the ~full suite; env-bound/e2e excluded per repo config).

- [ ] **Step 2: Typecheck, lint, format**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all clean. (Vitest strips types; `--no-verify` skipped prettier — these gates catch what the commits didn't.)

- [ ] **Step 3: Commit any format/lint fixes** (if the gates modified files)

```bash
git add -A && git commit --no-verify -m "chore(bell): lint/format after triage grouping"
```

---

### Task 6: Impeccable dual-gate + ledger reconciliation

**Files:**
- Modify: `DEFERRED.md`, `DEFERRED-archive.md`, `BACKLOG.md`

- [ ] **Step 1: Impeccable critique + audit (invariant 8)**

Run `/impeccable critique` then `/impeccable audit` on the diff (BellPanel + bellTriage are UI surfaces) with the v3 setup gates (context.mjs PRODUCT.md + DESIGN.md → register reference). Fix P0/P1 findings in-branch or defer via a `DEFERRED.md` entry. Record findings + dispositions for the close-out summary. (The tier headers reuse existing eyebrow classes; expect a light pass, but the notice-health glyph color change red→amber is a visual delta the audit should confirm holds the §1 color-blind floor.)

- [ ] **Step 2: Reconcile the ledgers (spec §10)**

- `DEFERRED.md`: remove the `BELL-2` entry (`:23`) from the open queue; move its full text to `DEFERRED-archive.md` marked RESOLVED (severity grouping shipped; count/mark-all-read already shipped).
- `BACKLOG.md`: mark `BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT` (`:543`) SHIPPED (resolved by Task 1 §1.6) — the DEFERRED↔BACKLOG twin closes with BELL-2.

- [ ] **Step 3: Commit**

```bash
git add DEFERRED.md DEFERRED-archive.md BACKLOG.md
git commit --no-verify -m "docs(plan): close BELL-2 + BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT twin"
```

---

## Self-Review

**Spec coverage:** §1.1 threshold + fail-closed → Task 3 predicate + tests (b,g,h,i,j). §1.2 grouping/stable-partition → Task 1 `groupActiveBySeverity` + Task 3 (b,c). §1.3 rendered elements → Task 3 code. §1.4 guard conditions → Task 3 tests (a,e,f,h,i,j). §1.6 rowTone fix → Task 1. §1.7 module → Task 1. §2 DI → Task 4. §3 transitions → Task 4. §1.1 R4 activeTruncated → Task 2. §5 tests → Tasks 1-4. §10 ledger → Task 6. Invariant 8 → Task 6 Step 1. All covered.

**Placeholder scan:** no TBD/TODO; every code step shows code; test bullets in Task 3/4 enumerate concrete cases (the compact `// a)..l)` list is a per-case checklist, each case having a stated concrete failure mode). Acceptable — each is one assertion with named testids.

**Type consistency:** `RowTone`, `rowTone`, `TIER_ORDER`, `groupActiveBySeverity`, `GROUP_THRESHOLD` names identical across Tasks 1/3/4. `activeTruncated: boolean` identical across Task 2's four edit sites and Task 3's predicate. `bell-section-active-tier-{tone}` testid identical Task 3/4.
