# DataQualityBadge Affordance A11y Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the admin shows-table `DataQualityBadge` from one amber `TriangleAlert` glyph into up to two visible amber glyph+count chips (roster-shift `Users` + count, then parse-gap `TriangleAlert` + count), making the signal type+count visible to touch/keyboard users and visually distinct per type — resolving deferred findings FLOW4-2 and FLOW4-3.

**Architecture:** `components/admin/DataQualityBadge.tsx` stays a hook-free presentational component (no `"use client"`). The `aria-label`/`title`/`data-testid`/`role="img"` contract is byte-preserved; only the visible children change (two chips) and the render gate is hardened (`Number.isFinite && > 0`). A `DESIGN.md` note records the two-glyph convention (invariant-8 dual-gate). Real-browser height invariant verified via a standalone Tailwind-compiled Playwright harness (no Next route).

**Tech Stack:** Next.js 16, React Server Components, Tailwind v4, lucide-react, Vitest (jsdom) for unit tests, Playwright for the real-browser dimensional gate.

**Spec:** `docs/superpowers/specs/2026-07-17-badge-affordance-a11y.md` (Codex-APPROVED, 5 rounds).

## Global Constraints

- **Invariant 5 (no raw codes in UI):** `aria-label`/`title` stay plain-language and byte-identical to today; counts are finite positive integers, never codes.
- **Invariant 8 (impeccable dual-gate):** any UI diff (badge + DESIGN.md + harness page) ships only after `/impeccable critique` AND `/impeccable audit` pass with P0/P1 fixed or `DEFERRED.md`-deferred, BEFORE cross-model review.
- **TDD per task:** failing test → minimal implementation → passing test → commit. One task per commit, conventional-commits (`feat(admin):` / `test(admin):` / `docs:`), `--no-verify` (shared hooks live in the main checkout).
- **No advisory-lock / DB / telemetry / §12.4 / RPC** touched.
- **Meta-test inventory:** CREATES none; EXTENDS one (`tests/components/admin/dataGapsTransitionAudit.test.tsx:146` gate-literal grep, updated in lockstep in Task 1).
- **Tailwind v4 has NO default `align-items: stretch`** on `.flex` (AGENTS.md / DESIGN §7) — vertical centering is explicit (`items-center`); the height invariant needs a real browser (jsdom is insufficient).
- **Two call sites pass `dataGaps` only** (`ArchivedShowRow.tsx:59`, `Step3SheetCard.tsx:703`) → roster chip never appears there; only `ShowsTable.tsx:468` passes `rosterShift`. Do NOT change the call sites.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `components/admin/DataQualityBadge.tsx` (modify) | Two-chip render + hardened gate + `Users` import (Task 1); `leading-none` (Task 2, its dimensional TDD) | 1, 2 |
| `tests/components/admin/DataQualityBadge.chips.test.tsx` (create) | jsdom behavioral matrix (chips, counts, guards, order, glyph identity, aria-label preserved) | 1 |
| `tests/components/admin/dataGapsTransitionAudit.test.tsx` (modify `:146`) | Gate-literal grep lockstep update | 1 |
| `tests/e2e/_dataQualityBadgeHarness.tsx` (create) | `renderToStaticMarkup` + main-guard JSON writer (run via `tsx`, never imported) | 2 |
| `tests/e2e/dataQualityBadge.layout.spec.ts` (create) | Real-browser height==glyph + no-wrap assertions (standalone Tailwind harness) | 2 |
| `tests/e2e/standalone.config.ts` (modify `:23`) | Add `dataQualityBadge.layout` to the `testMatch` allowlist | 2 |
| `DESIGN.md` (modify) | Two-glyph data-quality convention note (invariant-8) | 3 |

---

### Task 1: Two-chip split + hardened render gate (+ transition-audit lockstep)

**Files:**
- Modify: `components/admin/DataQualityBadge.tsx` (render gate `:22-24`, output `:47-56`, import `:6`)
- Create: `tests/components/admin/DataQualityBadge.chips.test.tsx`
- Modify: `tests/components/admin/dataGapsTransitionAudit.test.tsx:146` (gate-literal grep)

**Interfaces:**
- Consumes: `DataQualityBadge` props `{ slug: string; dataGaps: DataGapsSummary | undefined; rosterShift?: RosterShiftSummary | undefined }` (unchanged); `mkDataGaps` from `tests/helpers/dataGapsFixture.ts:9`; `RosterShiftSummary` from `lib/admin/showDisplay.ts:19`; `formatDataGapBreakdown` from `lib/parser/dataGaps.ts:349`.
- Produces: badge DOM with outer `<span role="img" data-testid="shows-data-quality-${slug}">` containing chip spans `[data-testid="dq-chip-roster"]` (lucide `Users` + roster count) and `[data-testid="dq-chip-gap"]` (lucide `TriangleAlert` + gap count), roster chip first.

- [ ] **Step 1: Write the failing behavioral test**

Create `tests/components/admin/DataQualityBadge.chips.test.tsx`:

```tsx
// @vitest-environment jsdom
// FLOW4-2 + FLOW4-3 — the badge now renders up to two VISIBLE glyph+count chips
// (roster `Users` THEN gap `TriangleAlert`), dissolving the hover-only dependency
// and distinguishing the two signals for sighted touch/keyboard users. The
// aria-label / title / role="img" / data-testid contract is byte-preserved.
//
// Anti-tautology: counts are derived from each fixture's `.total` (never a literal);
// each chip is scoped by its own data-testid so a chip cannot pass by a sibling's
// glyph; the aria-label assertions derive the gap portion from formatDataGapBreakdown.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
import type { RosterShiftSummary } from "@/lib/admin/showDisplay";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";
import { mkDataGaps } from "../../helpers/dataGapsFixture";

afterEach(cleanup);

function roster(p: Partial<RosterShiftSummary>): RosterShiftSummary {
  const added = p.added ?? 0;
  const removed = p.removed ?? 0;
  const renamed = p.renamed ?? 0;
  return { added, removed, renamed, total: p.total ?? added + removed + renamed };
}

describe("DataQualityBadge — visible glyph+count chips (FLOW4-2/3)", () => {
  it("gap-only: exactly the gap chip (TriangleAlert), count === dataGaps.total, no roster chip", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    render(<DataQualityBadge slug="g" dataGaps={dg} />);
    const gap = screen.getByTestId("dq-chip-gap");
    expect(gap).toHaveTextContent(String(dg.total)); // derived, not literal
    expect(gap.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(screen.queryByTestId("dq-chip-roster")).toBeNull();
  });

  it("roster-only: exactly the roster chip (Users), count === rosterShift.total, no gap chip", () => {
    const rs = roster({ added: 2, renamed: 1 }); // total 3
    render(<DataQualityBadge slug="r" rosterShift={rs} dataGaps={undefined} />);
    const rosterChip = screen.getByTestId("dq-chip-roster");
    expect(rosterChip).toHaveTextContent(String(rs.total));
    expect(rosterChip.querySelector("svg.lucide-users")).not.toBeNull();
    expect(screen.queryByTestId("dq-chip-gap")).toBeNull();
  });

  it("both: roster chip precedes gap chip in DOM order; counts match their fixture totals", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    const rs = roster({ added: 1, renamed: 1 }); // total 2
    render(<DataQualityBadge slug="b" rosterShift={rs} dataGaps={dg} />);
    const rosterChip = screen.getByTestId("dq-chip-roster");
    const gapChip = screen.getByTestId("dq-chip-gap");
    expect(rosterChip).toHaveTextContent(String(rs.total));
    expect(gapChip).toHaveTextContent(String(dg.total));
    // roster BEFORE gap (Node.DOCUMENT_POSITION_FOLLOWING === 4)
    expect(rosterChip.compareDocumentPosition(gapChip) & 4).toBeTruthy();
  });

  it("0/0: renders nothing", () => {
    const { container } = render(<DataQualityBadge slug="z" dataGaps={mkDataGaps({})} rosterShift={roster({ total: 0 })} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each([NaN, -1, Infinity])("hardened gate: lone non-signal total %p on either input renders nothing", (bad) => {
    const r1 = render(<DataQualityBadge slug="rn" rosterShift={roster({ total: bad })} dataGaps={undefined} />);
    expect(r1.container).toBeEmptyDOMElement();
    cleanup();
    const dgBad = { ...mkDataGaps({ UNKNOWN_FIELD: 1 }), total: bad };
    const r2 = render(<DataQualityBadge slug="gn" dataGaps={dgBad} />);
    expect(r2.container).toBeEmptyDOMElement();
  });

  it("aria-label / role=img / data-testid contract byte-preserved (both inputs, §6.5 order)", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    render(<DataQualityBadge slug="c" rosterShift={roster({ added: 1, renamed: 1 })} dataGaps={dg} />);
    const gapPart = `${dg.total} data ${dg.total === 1 ? "gap" : "gaps"}: ${formatDataGapBreakdown(dg)}`;
    const expected = `Roster changed since last review: 1 added, 1 renamed. ${gapPart}`;
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("aria-label", expected);
    expect(img).toHaveAttribute("title", expected);
    expect(img).toHaveAttribute("data-testid", "shows-data-quality-c");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm exec vitest run tests/components/admin/DataQualityBadge.chips.test.tsx`
Expected: FAIL — `getByTestId("dq-chip-gap")` throws (chips don't exist yet; current badge is a single `TriangleAlert` with no chip testids).

- [ ] **Step 3: Implement the two-chip render + hardened gate**

In `components/admin/DataQualityBadge.tsx`: change the import at `:6` to add `Users`:

```tsx
import { TriangleAlert, Users } from "lucide-react";
```

Replace the render gate (`:22-24`) — keep the two total vars, add the finite-positive predicates, harden the gate:

```tsx
  const rosterTotal = rosterShift?.total ?? 0;
  const gapTotal = dataGaps?.total ?? 0;
  const hasRoster = Number.isFinite(rosterTotal) && rosterTotal > 0;
  const hasGap = Number.isFinite(gapTotal) && gapTotal > 0;
  if (!hasGap && !hasRoster) return null; // instant, no animation (§4.2)
```

Leave the `rosterLabel` / `gapLabel` / `label` builders (`:29-46`) BYTE-IDENTICAL. Replace the output (`:47-56`) with:

```tsx
  return (
    <span
      data-testid={`shows-data-quality-${slug}`}
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-status-warn-text"
    >
      {hasRoster ? (
        <span
          data-testid="dq-chip-roster"
          aria-hidden="true"
          className="inline-flex items-center gap-0.5"
        >
          <Users className="size-3.5" />
          <span className="text-xs font-medium tabular-nums">{rosterTotal}</span>
        </span>
      ) : null}
      {hasGap ? (
        <span
          data-testid="dq-chip-gap"
          aria-hidden="true"
          className="inline-flex items-center gap-0.5"
        >
          <TriangleAlert className="size-3.5" />
          <span className="text-xs font-medium tabular-nums">{gapTotal}</span>
        </span>
      ) : null}
    </span>
  );
```

> **TDD note:** `leading-none` (spec §5.2, load-bearing for the height invariant) is deliberately NOT added here. It is added in **Task 2** as the minimal implementation that turns the real-browser dimensional test from red→green — without it the count's 16.8px line box grows the badge above the 14px glyph, which is exactly what Task 2's failing test must first observe. The jsdom unit tests in this task do not measure height, so they pass with or without `leading-none`.

- [ ] **Step 4: Run the chips test to verify it passes**

Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm exec vitest run tests/components/admin/DataQualityBadge.chips.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 5: Update the transition-audit gate-literal grep in lockstep**

The hardened gate changes the literal that `tests/components/admin/dataGapsTransitionAudit.test.tsx:146` greps. Update ONLY that regex (leave the motion-absence assertions untouched):

Find:
```ts
    expect(s).toMatch(/if \(gapTotal === 0 && rosterTotal === 0\) return null;/); // instant unmount
```
Replace with:
```ts
    expect(s).toMatch(/if \(!hasGap && !hasRoster\) return null;/); // instant unmount (hardened gate, FLOW4-2/3)
```

- [ ] **Step 6: Run the coupled + full unit suites**

Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm exec vitest run tests/components/admin/DataQualityBadge.chips.test.tsx tests/components/admin/DataQualityBadge.rosterShift.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx tests/components/admin/dataQualityBadgeArchivedTab.test.tsx tests/components/admin/ShowsTable.test.tsx tests/components/step3SheetCard.test.tsx`
Expected: PASS (contract preserved: rosterShift/archived/ShowsTable/step3 query by aria-label/testid/role; transition-audit now matches the new gate literal).

Then the full suite (catches source-scanning registry fan-out from the component rebuild):
Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm test`
Expected: PASS (or only pre-existing/env-excluded failures — confirm none reference the badge).

- [ ] **Step 7: Commit**

```bash
cd /Users/ericweiss/fxav-wt-badge-a11y
git add components/admin/DataQualityBadge.tsx tests/components/admin/DataQualityBadge.chips.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx
git commit --no-verify -m "feat(admin): DataQualityBadge two-chip glyph+count split + hardened gate (FLOW4-2/3)

Roster (Users) + gap (TriangleAlert) chips with visible counts, roster
first (§6.5 order). Dissolves hover-only dependency; aria-label/title/
role=img/data-testid byte-preserved. Gate hardened to Number.isFinite &&
>0 (NaN/negative/+Inf). Transition-audit gate-literal grep updated in
lockstep."
```

---

### Task 2: Real-browser dimensional gate — proves `leading-none` (standalone Tailwind harness)

This task is the TDD home of the `leading-none` implementation (deferred from Task 1). It mirrors the `_step3ReviewModalHarness.tsx` / `step3-review-modal.layout.spec.ts` precedent EXACTLY: the harness `.tsx` is **run via `tsx`** (a main-guard writes rendered HTML as JSON) and is **NOT imported** by the spec — Playwright's test transform rewrites JSX in every `.tsx` it loads into component-testing payloads that `react-dom/server` cannot render (`step3-review-modal.layout.spec.ts:80-82`). The spec compiles real Tailwind from `app/globals.css` via the pinned CLI and serves over `node:http`. NO Next route → no dev-route registry fan-out.

**Files:**
- Create: `tests/e2e/_dataQualityBadgeHarness.tsx` (renderToStaticMarkup + main-guard JSON writer)
- Create: `tests/e2e/dataQualityBadge.layout.spec.ts` (name ends `.layout.spec.ts` to match the standalone allowlist convention)
- Modify: `tests/e2e/standalone.config.ts:23` (add `dataQualityBadge.layout` to the `testMatch` regex)
- Modify: `components/admin/DataQualityBadge.tsx` (add `leading-none` — the minimal impl this task's test drives)

**Interfaces:**
- Consumes: `DataQualityBadge`; `mkDataGaps` (`tests/helpers/dataGapsFixture.ts:9`) for a valid `DataGapsSummary`; `renderToStaticMarkup`; the Tailwind-CLI + `createServer` scaffolding copied from `step3-review-modal.layout.spec.ts`.
- Produces: a served page exposing three badges under ids `badge-gap` / `badge-roster` / `badge-both`, each with an inner `[role="img"]` and lucide `svg`.

**Dimensional invariant (spec §5.4):** `badge.height ≈ glyph.height` (14px `size-3.5`) and `badge-both.height ≈ badge-roster.height` (no wrap). Both within 0.5px.

- [ ] **Step 1: Write the harness `.tsx` with a main-guard JSON writer**

Create `tests/e2e/_dataQualityBadgeHarness.tsx` (mirrors `_step3ReviewModalHarness.tsx`'s main-guard tail):

```tsx
/**
 * tests/e2e/_dataQualityBadgeHarness.tsx — renderToStaticMarkup harness for the
 * DataQualityBadge dimensional gate (spec §5.4). Run via `tsx` from the layout
 * spec (NOT imported — Playwright's transform rewrites JSX into non-renderable
 * payloads; same boundary as _step3ReviewModalHarness.tsx). The main-guard writes
 * { gap, roster, both } rendered-HTML strings to argv[2].
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
import type { RosterShiftSummary } from "@/lib/admin/showDisplay";
import { mkDataGaps } from "./../helpers/dataGapsFixture";

const ROSTER: RosterShiftSummary = { added: 2, removed: 0, renamed: 0, total: 2 };
const GAPS = mkDataGaps({ UNKNOWN_FIELD: 3 }); // total 3, full valid classes record

// Each badge sits in an inline flex row beside a title span, reproducing the
// shows-table header context (ShowsTable.tsx:468) so the measured layout is
// representative. The `#badge-*` id wraps the badge for measurement.
function Row({ id, node }: { id: string; node: ReactNode }): ReactNode {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
      <span>East Coast Tour</span>
      <span id={id}>{node}</span>
    </div>
  );
}

export function renderBadgeHarnessBody(): string {
  return renderToStaticMarkup(
    <main style={{ padding: "2rem", maxWidth: "480px" }}>
      <Row id="badge-gap" node={<DataQualityBadge slug="gap" dataGaps={GAPS} />} />
      <Row id="badge-roster" node={<DataQualityBadge slug="roster" dataGaps={undefined} rosterShift={ROSTER} />} />
      <Row id="badge-both" node={<DataQualityBadge slug="both" dataGaps={GAPS} rosterShift={ROSTER} />} />
    </main>,
  );
}

// Direct-execution entry: `tsx _dataQualityBadgeHarness.tsx <out.json>` writes the
// rendered body so the layout spec never imports this .tsx (see file header).
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _dataQualityBadgeHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(outPath, JSON.stringify({ body: renderBadgeHarnessBody() }));
}
```

- [ ] **Step 2: Register the spec in the standalone config allowlist**

In `tests/e2e/standalone.config.ts:23`, add `dataQualityBadge\.layout` to the `testMatch` alternation (insert before the closing `)\.spec\.ts/`):

```ts
    /(step3-review-page\.layout|step3-schedule-bookend-layout|agendaScheduleLayout|agendaBreakdown\.layout|step3-review-modal\.layout|step3-review-modal\.interactions|developer-toggle-layout|toggle-edge-layout|appHealthIndicator\.layout|overrideableField\.layout|dataQualityBadge\.layout)\.spec\.ts/,
```

- [ ] **Step 3: Write the failing Playwright spec**

Create `tests/e2e/dataQualityBadge.layout.spec.ts`. Copy the `beforeAll`/`afterAll` scaffolding from `tests/e2e/step3-review-modal.layout.spec.ts` — `execFileSync` shell-out to `node_modules/.bin/tsx` running the harness to a temp JSON, the `pageHtml(cssHref, body)` shell (`<!doctype html><html><head><link rel="stylesheet" href="/${cssHref}"></head><body>${body}</body></html>`), the `@tailwindcss/cli@4.2.4` compile of `app/globals.css` with an `@source` line for the written `harness.html`, and the `node:http` `createServer` — then:

```ts
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = join(__dirname, "..", "..");
let server: Server;
let baseUrl: string;

function pageHtml(cssHref: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/${cssHref}"></head><body>${body}</body></html>`;
}

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "dq-badge-dim-"));
  const outJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_dataQualityBadgeHarness.tsx"), outJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const { body } = JSON.parse(readFileSync(outJson, "utf8")) as { body: string };
  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", body));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const buf = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(buf);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

async function boxHeight(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `bounding box for ${selector}`).not.toBeNull();
  return box!.height;
}

test("badge height equals its glyph height (leading-none holds the count line box)", async ({ page }) => {
  await page.goto(baseUrl);
  for (const id of ["badge-gap", "badge-roster", "badge-both"]) {
    const badge = await boxHeight(page, `#${id} [role="img"]`);
    const glyph = await boxHeight(page, `#${id} [role="img"] svg`);
    expect(Math.abs(badge - glyph), `${id}: badge vs glyph height`).toBeLessThanOrEqual(0.5);
  }
});

test("adding the second chip does not wrap (both ≈ single-chip height)", async ({ page }) => {
  await page.goto(baseUrl);
  const roster = await boxHeight(page, `#badge-roster [role="img"]`);
  const both = await boxHeight(page, `#badge-both [role="img"]`);
  expect(Math.abs(both - roster), "both vs roster-only height").toBeLessThanOrEqual(0.5);
});
```

- [ ] **Step 4: Run the spec to verify it FAILS (red — leading-none not yet added)**

Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/dataQualityBadge.layout.spec.ts`
Expected: FAIL — with no `leading-none`, each count's `0.75rem × 1.4 = 16.8px` line box makes the badge ~16.8px vs the 14px glyph, so `|badge − glyph|` ≈ 2.8px > 0.5px. (If it does not fail, the invariant is not being measured — investigate before proceeding; do NOT skip the red phase.)

- [ ] **Step 5: Add `leading-none` (minimal impl) to make it pass**

In `components/admin/DataQualityBadge.tsx`, add `leading-none` to BOTH chip spans and BOTH count spans (spec §5.2):
- chip span className: `inline-flex items-center gap-0.5` → `inline-flex items-center gap-0.5 leading-none`
- count span className: `text-xs font-medium tabular-nums` → `text-xs font-medium tabular-nums leading-none`

(Apply to the roster chip and the gap chip identically.)

- [ ] **Step 6: Run the spec + Task-1 unit tests to verify green**

Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/dataQualityBadge.layout.spec.ts`
Expected: PASS (badge height == glyph within 0.5px; both ≈ roster).
Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm exec vitest run tests/components/admin/DataQualityBadge.chips.test.tsx`
Expected: PASS (unaffected — jsdom does not measure height).

- [ ] **Step 7: Commit**

```bash
cd /Users/ericweiss/fxav-wt-badge-a11y
git add tests/e2e/_dataQualityBadgeHarness.tsx tests/e2e/dataQualityBadge.layout.spec.ts tests/e2e/standalone.config.ts components/admin/DataQualityBadge.tsx
git commit --no-verify -m "test(admin): real-browser dimensional gate for DataQualityBadge chips + leading-none

Standalone Tailwind-compiled harness (tsx main-guard shell-out, no Next
route, no dev-route registries): red without leading-none (count 16.8px
line box grows the badge), green after — badge height == 14px glyph, and
the second chip does not wrap. Registered in standalone.config.ts. jsdom
cannot compute this (Tailwind v4 no default align-items:stretch)."
```

---

### Task 3: DESIGN.md two-glyph convention note + invariant-8 impeccable dual-gate

**Files:**
- Modify: `DESIGN.md` (append a short subsection near the status-token / color-blind-floor discussion, §1.3 area)

**Interfaces:**
- Consumes: nothing new. Produces: a durable DESIGN.md record of the two-glyph data-quality convention (the FLOW4-3 "DESIGN.md decision" the deferral required).

- [ ] **Step 1: Add the DESIGN.md note**

Append this subsection to `DESIGN.md` (place it immediately after the status dot/text-pairing bullet at `DESIGN.md:84`, keeping the surrounding numbered/bulleted structure intact — read the lines around `:84` first and match the list style):

```markdown
- **Data-quality badge — two-glyph split (FLOW4-2/3, 2026-07-17).** The admin shows-table `DataQualityBadge` carries up to two amber chips, each a distinct glyph + visible count: `Users` = "roster changed since last review", `TriangleAlert` = "parse gaps". Both use `--color-status-warn-text`; the two signals are distinguished by **glyph shape + count, never by hue** (upholds the §1 color-blind floor — no information carried by color alone). The visible count dissolves the prior hover/`title`-only dependency for touch/keyboard users; the full class-level breakdown stays in the badge's `aria-label`/`title`. Roster chip renders before the gap chip, matching the accessible-name concatenation order.
```

- [ ] **Step 2: Commit the DESIGN.md note**

```bash
cd /Users/ericweiss/fxav-wt-badge-a11y
git add DESIGN.md
git commit --no-verify -m "docs(design): record DataQualityBadge two-glyph data-quality convention (FLOW4-3)"
```

- [ ] **Step 3: Run the invariant-8 impeccable dual-gate**

Run the impeccable v3 setup gates (`context.mjs` context load: PRODUCT.md + DESIGN.md → register reference read), then on the UI diff (`components/admin/DataQualityBadge.tsx` + `DESIGN.md` + `tests/e2e/_dataQualityBadgeHarness.tsx`):
- `/impeccable critique`
- `/impeccable audit`

Both must pass with zero P0/P1 unresolved. Record findings + dispositions (fix in-branch, or defer via a `DEFERRED.md` entry with a backlog ref) in the branch's close-out notes. Icon choice (lucide `Users` vs the crew `UsersIcon`) is legitimately in scope for the critique — if it flags a consistency concern, resolve per the critique (the admin surface already uses lucide `Users` at `step3ReviewSections.tsx:60`).

- [ ] **Step 4: Address P0/P1 findings**

For each P0/P1: fix in the relevant file (re-run the Task 1/2 tests after any component/markup change) OR add a `DEFERRED.md` entry with justification + backlog ref. Re-run `/impeccable critique` + `/impeccable audit` until clean. Commit any fixes per the touched-file convention.

---

## Self-Review

**Spec coverage:**
- FLOW4-2 (touch/keyboard reach) → Task 1 (visible chips) + Task 2 (height holds). ✔
- FLOW4-3 (distinguish signals) → Task 1 (distinct `Users`/`TriangleAlert` glyphs + counts) + Task 3 (DESIGN.md decision). ✔
- §5.3 hardened gate + guards (NaN/-1/+Inf) → Task 1 Step 1 `it.each` + Step 3 gate. ✔
- §5.4 dimensional invariant → Task 2 (real-browser, genuine red→green: `leading-none` deferred from Task 1 so the layout test observes a true failure first; runs under `standalone.config.ts` via `--config`; harness run via `tsx` main-guard, never imported — avoids the Playwright JSX-transform trap). ✔
- §5.5 transition inventory (all instant; audit lockstep) → Task 1 Step 5. ✔
- §6 DESIGN.md amendment + invariant 8 → Task 3. ✔
- §7 meta-test inventory (EXTENDS dataGapsTransitionAudit only) → Task 1 Step 5. ✔
- §8 test plan (all 7 items) → Task 1 Step 1 (behavioral) + Task 2 (layout). ✔

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** chip testids `dq-chip-roster`/`dq-chip-gap` used identically in Task 1 impl + test; `hasGap`/`hasRoster` names identical in impl + transition-audit grep; `Users`/`TriangleAlert` from lucide-react consistent across impl + harness + tests.

**Anti-tautology:** counts derived from fixture `.total`; chips scoped by own testid; aria-label derived via `formatDataGapBreakdown`; layout measures the badge vs its own glyph (both present in every state), never a hardcoded pixel value.
