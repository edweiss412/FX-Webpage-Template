# Monitor digest — "New shows this period" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) — small, single-file-centric feature. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a 4th "New shows this period" sub-block to the daily-digest monitor section, surfacing non-gate-exempt `GAP_CLASSES` on the latest applied sync of first-seen published shows (a `current` applied sync in the window, no `baseline` ≤ windowStart).

**Architecture:** One new pure helper `computeNewShowGaps(driftRows)` consuming the SAME rows the existing drift query produces (no new SQL, no migration); a new `newShowGaps` field on `MonitorDigestModel`; a render sub-block; a `monitor_totals` context field. `newShowGaps` ∩ `drift` = ∅ by construction (drift needs a baseline; new-show-gaps needs none).

**Tech Stack:** TypeScript, postgres.js `sql`, vitest, local Postgres for `.db.test.ts`.

**Spec:** `docs/superpowers/specs/2026-07-09-monitor-new-show-gaps.md` (APPROVED, 2 rounds).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. **Commit per task**, conventional-commits.
- **Inv 5:** email renders `GAP_CLASSES` **labels**, never codes.
- **Inv 9:** no new Supabase boundary (`computeNewShowGaps` is pure over already-fetched rows); `_metaInfraContract` unchanged. **Meta-test inventory: none created/extended** (declared per rule).
- **Inv 2 / 8 / 10:** N/A (read-only; email template not a `app/`/`components/` UI surface; no mutation surface). No migration → no validation-parity step.
- Caps single-sourced from `DIGEST_MAX_SHOWS=12` / `DIGEST_MAX_ITEMS_PER_SHOW=5` (`lib/notify/constants.ts:16-17`).
- Full-suite gate before push: `pnpm typecheck && pnpm build && pnpm lint && pnpm format:check` + `pnpm vitest run tests/notify tests/sync tests/log`.

---

### Task 1: `computeNewShowGaps` helper + `newShowGaps` model field

**Files:**
- Modify: `lib/notify/monitorDigest.ts` (add field to `MonitorDigestModel:33-38`; add helper after `computeDrift:131`)
- Test: `tests/notify/monitorNewShowGaps.test.ts` (create)
- Modify (fixture compat): `tests/notify/renderDigest.monitor.test.ts`, `tests/notify/runDigestNotify.monitor.test.ts`

**Interfaces:**
- Consumes: `DriftRow` (`monitorDigest.ts:85-91`), `summarizeDataGaps` / `GAP_CLASSES` / `DataGapsSummary` (`lib/parser/dataGaps.ts`), `MonitorShowGroup` (`monitorDigest.ts:27`).
- Produces: `export function computeNewShowGaps(rows: DriftRow[]): MonitorShowGroup[]`; `MonitorDigestModel.newShowGaps: MonitorShowGroup[]`.

- [ ] **Step 1: Write the failing test** — `tests/notify/monitorNewShowGaps.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { computeNewShowGaps } from "@/lib/notify/monitorDigest";
import { GAP_CLASSES } from "@/lib/parser/dataGaps";

// Build a DriftRow whose parse_warnings carry the given warn codes (count 1 each).
function row(
  drive: string,
  phase: "baseline" | "current",
  codes: string[],
  title = "Show " + drive,
  slug = "s-" + drive,
) {
  return {
    drive_file_id: drive,
    slug,
    title,
    phase,
    parse_warnings: codes.map((code) => ({ code, severity: "warn", message: "x" })),
  };
}
const label = (code: string) => GAP_CLASSES.find((g) => g.code === code)!.label;

describe("computeNewShowGaps (spec §3.2, §3.3)", () => {
  test("first-seen isolation: reports current-only show, not a baselined one", () => {
    const out = computeNewShowGaps([
      row("A", "current", ["ROOM_HEADER_SPLIT_AMBIGUOUS"]),
      row("B", "baseline", []),
      row("B", "current", ["ROOM_HEADER_SPLIT_AMBIGUOUS"]),
    ]);
    expect(out.map((g) => g.slug)).toEqual(["s-A"]);
  });

  test("clean first-seen (no gaps) is skipped", () => {
    expect(computeNewShowGaps([row("A", "current", [])])).toEqual([]);
  });

  test("label mapping incl. ambiguity codes, GAP_CLASSES order, derived labels", () => {
    const out = computeNewShowGaps([
      row("A", "current", [
        "DATE_ORDER_SUGGESTS_DMY",
        "ROOM_HEADER_SPLIT_AMBIGUOUS",
        "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      ]),
    ]);
    expect(out[0]!.items).toEqual([
      label("ROOM_HEADER_SPLIT_AMBIGUOUS"),
      label("HOTEL_GUEST_SPLIT_AMBIGUOUS"),
      label("DATE_ORDER_SUGGESTS_DMY"),
    ]);
  });

  test("gate-exempt excluded, non-exempt kept (discrimination)", () => {
    const out = computeNewShowGaps([
      row("A", "current", ["VENUE_GEOCODE_UNRESOLVED", "FIELD_UNREADABLE"]),
    ]);
    expect(out[0]!.items).toEqual([label("FIELD_UNREADABLE")]);
    expect(out[0]!.items).not.toContain(label("VENUE_GEOCODE_UNRESOLVED"));
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm vitest run tests/notify/monitorNewShowGaps.test.ts`
Expected: FAIL — `computeNewShowGaps` is not exported.

- [ ] **Step 3: Add the field to `MonitorDigestModel`** (`lib/notify/monitorDigest.ts:33-38`)

```ts
export type MonitorDigestModel = {
  windowStart: string;
  autoApplied: MonitorShowGroup[];
  autofix: AutoFixSummary;
  drift: MonitorDriftEntry[];
  newShowGaps: MonitorShowGroup[];
};
```

- [ ] **Step 4: Implement `computeNewShowGaps`** — insert after `computeDrift` (after `monitorDigest.ts:131`)

```ts
/**
 * "New shows this period" (spec §3.2). Complement of computeDrift: for each show with a
 * current applied row but NO baseline row (first-seen inside the window), lists the
 * non-gateExempt GAP_CLASSES present (count > 0) in that current sync. Labels only (inv 5).
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
      if ((g as { gateExempt?: boolean }).gateExempt) continue; // parity with drift (spec D1)
      if (e.current.classes[g.code] > 0) items.push(g.label);
    }
    if (items.length > 0) out.push({ showTitle: e.title, slug: e.slug, items });
  }
  return out;
}
```

- [ ] **Step 5: Fix existing typed fixtures** — add `newShowGaps: []` to each hand-built `MonitorDigestModel` literal.
  - `tests/notify/renderDigest.monitor.test.ts` — the `monitor: MonitorDigestModel` object (has `drift: [...]`).
  - `tests/notify/runDigestNotify.monitor.test.ts` — the `monitorModel: MonitorDigestModel` object (`:8`).
  - Any other literal `pnpm typecheck` flags.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm vitest run tests/notify/monitorNewShowGaps.test.ts && pnpm typecheck`
Expected: PASS (helper green; no typecheck error from the new required field).

- [ ] **Step 7: Commit**

```bash
git add lib/notify/monitorDigest.ts tests/notify/monitorNewShowGaps.test.ts tests/notify/renderDigest.monitor.test.ts tests/notify/runDigestNotify.monitor.test.ts
git commit --no-verify -m "feat(notify): computeNewShowGaps helper + newShowGaps model field"
```

---

### Task 2: Wire `newShowGaps` into `buildMonitorDigestModel`

**Files:**
- Modify: `lib/notify/monitorDigest.ts` (`buildMonitorDigestModel`, empty-check `:194`, return `:197`)
- Test: `tests/notify/monitorNewShowGaps.db.test.ts` (create)

**Interfaces:**
- Consumes: `computeNewShowGaps` (Task 1), the existing `driftRows` (`monitorDigest.ts:175-191`).
- Produces: builder output `model.newShowGaps`; `{ kind: "empty" }` when all four signals empty.

- [ ] **Step 1: Write the failing DB filter-proof test** — `tests/notify/monitorNewShowGaps.db.test.ts`

```ts
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";
import type { DigestBuilderSql } from "@/lib/notify/digest";

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, { max: 2, idle_timeout: 2, connect_timeout: 3, prepare: false });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

const MARK = `f62ng-${Date.now()}`;
const FIRST = `${MARK}-first`;
const BASED = `${MARK}-based`;
const UNPUB = `${MARK}-unpub`;
const ORPHAN = `${MARK}-orphan`;
const gap = (code: string) => [{ code, severity: "warn", message: "x" }];

afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.sync_log where drive_file_id in (${FIRST}, ${BASED}, ${UNPUB}, ${ORPHAN})`.catch(() => {});
  await sql`delete from public.shows where drive_file_id in (${FIRST}, ${BASED}, ${UNPUB})`.catch(() => {});
  await sql.end().catch(() => {});
});

describe.runIf(dbUp)("buildMonitorDigestModel — new-show-gaps DB filter proof", () => {
  test("reports only the first-seen published show's gap; excludes baselined/unpublished/orphan", async () => {
    if (!sql) throw new Error("db not up");
    // Far-future window isolates from concurrent ~now() sibling .db.test.ts rows
    // (production filter is occurred_at-lower-bound only).
    const pre = "2097-01-01T10:00:00Z"; // <= windowStart (would-be baseline)
    const curr = "2099-01-01T10:00:00Z"; // > windowStart

    const mkShow = (drive: string, slug: string, pub: boolean) =>
      sql!`insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${drive}, ${slug}, ${"T"}, ${"c"}, ${"v1"}, ${pub})`;
    await mkShow(FIRST, MARK + "-fs", true);
    await mkShow(BASED, MARK + "-bs", true);
    await mkShow(UNPUB, MARK + "-us", false);

    const log = (drive: string, status: string, code: string | null, at: string) => sql!`
      insert into public.sync_log (drive_file_id, status, message, parse_warnings, occurred_at)
      values (${drive}, ${status}, ${status}, ${sql!.json(code ? gap(code) : [])}, ${at})`;

    // First-seen published: only a current row with a gap → REPORTED.
    await log(FIRST, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);
    // Baselined published: has a prior applied row → NOT reported (drift owns it).
    await log(BASED, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", pre);
    await log(BASED, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);
    // Unpublished first-seen: excluded by s.published = true.
    await log(UNPUB, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);
    // Orphan first-seen (no shows row): excluded by inner join.
    await log(ORPHAN, "applied", "ROOM_HEADER_SPLIT_AMBIGUOUS", curr);

    const r = await buildMonitorDigestModel(new Date("2099-01-01T12:00:00Z"), {
      sql: sql as unknown as DigestBuilderSql,
      getWatermark: async () => ({ kind: "value", watermark: new Date("2098-01-01T00:00:00Z") }),
    });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.model.newShowGaps.map((g) => g.slug)).toEqual([MARK + "-fs"]);
    expect(r.model.newShowGaps[0]!.items).toEqual(["unclear room split"]);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm vitest run tests/notify/monitorNewShowGaps.db.test.ts`
Expected: FAIL — `r.model.newShowGaps` is `undefined` (builder doesn't populate it yet); `.map` throws.

- [ ] **Step 3: Wire the builder** (`lib/notify/monitorDigest.ts`) — after `const drift = computeDrift(driftRows);` (`:192`):

```ts
    const drift = computeDrift(driftRows);
    const newShowGaps = computeNewShowGaps(driftRows);

    if (
      autoApplied.length === 0 &&
      autofix.total === 0 &&
      drift.length === 0 &&
      newShowGaps.length === 0
    ) {
      return { kind: "empty" };
    }
    return { kind: "ok", model: { windowStart: windowIso, autoApplied, autofix, drift, newShowGaps } };
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/notify/monitorNewShowGaps.db.test.ts`
Expected: PASS (first-seen show reported; baselined/unpublished/orphan excluded).

- [ ] **Step 5: Commit**

```bash
git add lib/notify/monitorDigest.ts tests/notify/monitorNewShowGaps.db.test.ts
git commit --no-verify -m "feat(notify): populate newShowGaps in buildMonitorDigestModel + DB filter proof"
```

---

### Task 3: Render sub-block 4 ("New shows this period")

**Files:**
- Modify: `lib/notify/templates/digest.ts` (`renderMonitorSection`, after sub-block 3 ends `:98`, before the `if (text.length === 0)` guard `:100`)
- Test: `tests/notify/renderDigest.newShowGaps.test.ts` (create)

**Interfaces:**
- Consumes: `MonitorDigestModel.newShowGaps` (Task 1), `DIGEST_MAX_SHOWS` / `DIGEST_MAX_ITEMS_PER_SHOW`, `escapeHtml`.

- [ ] **Step 1: Write the failing test** — `tests/notify/renderDigest.newShowGaps.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { renderDigest } from "@/lib/notify/templates/digest";
import type { MonitorDigestModel } from "@/lib/notify/monitorDigest";

const origin = "https://x.test";
function monitor(over: Partial<MonitorDigestModel> = {}): MonitorDigestModel {
  return {
    windowStart: "2026-07-09T00:00:00Z",
    autoApplied: [],
    autofix: {
      total: 0,
      classes: {
        STAGE_WORD_AUTOCORRECTED: 0,
        ROLE_TOKEN_AUTOCORRECTED: 0,
        COLUMN_HEADER_AUTOCORRECTED: 0,
        SECTION_HEADER_AUTOCORRECTED: 0,
        FIELD_LABEL_AUTOCORRECTED: 0,
      },
    },
    drift: [],
    newShowGaps: [{ showTitle: "RPAS", slug: "rpas", items: ["possibly merged hotel guests", "dates may be day-first"] }],
    ...over,
  };
}

describe("renderDigest — new-show-gaps sub-block (spec §3.5)", () => {
  test("renders heading + 'Title: label, label' line", () => {
    const r = renderDigest({ origin, shows: [], monitor: monitor() });
    expect(r.html).toContain("New shows this period");
    expect(r.text).toContain("New shows this period");
    expect(r.html).toContain("possibly merged hotel guests");
    expect(r.html).toContain("dates may be day-first");
  });

  test("absent when empty", () => {
    const r = renderDigest({ origin, shows: [], monitor: monitor({ newShowGaps: [] }) });
    expect(r.html).not.toContain("New shows this period");
  });

  test("no raw code token appears (invariant 5)", () => {
    const r = renderDigest({ origin, shows: [], monitor: monitor() });
    expect(r.html).not.toMatch(/AMBIGUOUS|UNREADABLE|SUGGESTS_DMY|CARDINALITY/);
  });

  test("escapes HTML in show titles", () => {
    const r = renderDigest({
      origin,
      shows: [],
      monitor: monitor({ newShowGaps: [{ showTitle: "<script>x</script>", slug: "s", items: ["too many hotels"] }] }),
    });
    expect(r.html).not.toContain("<script>x</script>");
  });

  test("caps at 12 shows / 5 items with overflow notes", () => {
    const r = renderDigest({
      origin,
      shows: [],
      monitor: monitor({
        newShowGaps: Array.from({ length: 13 }, (_, i) => ({
          showTitle: `Show ${i}`,
          slug: `s${i}`,
          items: i === 0 ? Array.from({ length: 6 }, (_, j) => `gap ${j}`) : ["one"],
        })),
      }),
    });
    expect(r.html).toContain("+1 more"); // 6 items → +1 more
    expect(r.html).toContain("+1 more shows"); // 13 shows → +1
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm vitest run tests/notify/renderDigest.newShowGaps.test.ts`
Expected: FAIL — "New shows this period" not in output.

- [ ] **Step 3: Add sub-block 4** — in `renderMonitorSection`, after sub-block 3 closes (`templates/digest.ts:98`), before `if (text.length === 0) return null;` (`:100`):

```ts
  // Sub-block 4: new shows this period (first-seen shows carrying data gaps, spec §3.5).
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

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/notify/renderDigest.newShowGaps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/templates/digest.ts tests/notify/renderDigest.newShowGaps.test.ts
git commit --no-verify -m "feat(notify): render new-show-gaps sub-block in monitor section"
```

---

### Task 4: `monitor_totals.newShowGapsShows` context field

**Files:**
- Modify: `lib/notify/deliver.ts` (`monitor_totals`, `:498-503`)
- Modify: `tests/notify/deliver.test.ts` (the monitor `monitor_totals` expectation)

**Interfaces:**
- Consumes: `input.monitor.newShowGaps` (Task 1).

- [ ] **Step 1: Update the failing expectation** — find the `deliver.test.ts` assertion on `monitor_totals` and add `newShowGapsShows` to the expected object (and set `newShowGaps` on that test's monitor fixture to a known length). Run it to confirm it fails against the current code.

Run: `pnpm vitest run tests/notify/deliver.test.ts`
Expected: FAIL — actual `monitor_totals` lacks `newShowGapsShows`.

- [ ] **Step 2: Add the field** (`lib/notify/deliver.ts:498-503`)

```ts
              monitor_totals: {
                autoAppliedShows: input.monitor.autoApplied.length,
                autoAppliedRows: input.monitor.autoApplied.reduce((n, g) => n + g.items.length, 0),
                autofixTotal: input.monitor.autofix.total,
                driftShows: input.monitor.drift.length,
                newShowGapsShows: input.monitor.newShowGaps.length,
              },
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/notify/deliver.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/notify/deliver.ts tests/notify/deliver.test.ts
git commit --no-verify -m "feat(notify): surface newShowGapsShows in deliver monitor_totals context"
```

---

### Task 5: Full-suite verification gate

- [ ] **Step 1:** `pnpm vitest run tests/notify tests/sync tests/log` → all pass (0 new failures vs. baseline).
- [ ] **Step 2:** `pnpm typecheck` → green.
- [ ] **Step 3:** `pnpm build` → green.
- [ ] **Step 4:** `pnpm lint` → 0 errors.
- [ ] **Step 5:** `pnpm format:check` → clean (prettier the 4-5 touched files if `--no-verify` bypassed the hook).
- [ ] **Step 6:** Confirm pre-existing failures (email-canonicalization, pg-cron-coverage, validation-* — env/live-DB dependent) match `origin/main` baseline; my diff introduces zero regressions.

---

## Self-Review

**Spec coverage:** §3.2 helper → Task 1; §3.4 model + empty-check → Task 1/2; §3.5 render → Task 3; §3.6 deliver context → Task 4; §6.1 units → Task 1; §6.2 render tests → Task 3; §6.3 db proof → Task 2; §6.4 fixture updates → Task 1 Step 5. Covered.

**Placeholder scan:** none — every code step carries full code.

**Type consistency:** `computeNewShowGaps(rows: DriftRow[]): MonitorShowGroup[]` used identically in Tasks 1-2; `newShowGaps: MonitorShowGroup[]` field used in Tasks 1-4; `newShowGapsShows` (context) is a distinct name from `newShowGaps` (model) — intentional, matches sibling `driftShows`/`drift`.

**Anti-tautology:** Task 1 label test derives expected labels from `GAP_CLASSES` (not hardcoded); gate-exempt test asserts BOTH inclusion of the non-exempt label AND absence of the exempt one; first-seen-isolation test proves a baselined show is NOT reported (the no-double-report guarantee, not just "function runs"). Task 2 db proof seeds 4 distinct exclusion reasons.

**Meta-test inventory:** none created/extended (declared). **Advisory-lock topology:** N/A (no `pg_advisory*`).
