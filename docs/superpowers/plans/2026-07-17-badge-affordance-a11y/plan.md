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
| `components/admin/DataQualityBadge.tsx` (modify) | Two-chip render + hardened gate + `Users` import | 1 |
| `tests/components/admin/DataQualityBadge.chips.test.tsx` (create) | jsdom behavioral matrix (chips, counts, guards, order, glyph identity, aria-label preserved) | 1 |
| `tests/components/admin/dataGapsTransitionAudit.test.tsx` (modify `:146`) | Gate-literal grep lockstep update | 1 |
| `tests/e2e/_dataQualityBadgeHarness.tsx` (create) | `renderToStaticMarkup` harness rendering the badge in 4 states | 2 |
| `tests/e2e/dataQualityBadge-dimensional.spec.ts` (create) | Real-browser height==glyph + no-wrap assertions | 2 |
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
          className="inline-flex items-center gap-0.5 leading-none"
        >
          <Users className="size-3.5" />
          <span className="text-xs font-medium tabular-nums leading-none">{rosterTotal}</span>
        </span>
      ) : null}
      {hasGap ? (
        <span
          data-testid="dq-chip-gap"
          aria-hidden="true"
          className="inline-flex items-center gap-0.5 leading-none"
        >
          <TriangleAlert className="size-3.5" />
          <span className="text-xs font-medium tabular-nums leading-none">{gapTotal}</span>
        </span>
      ) : null}
    </span>
  );
```

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

### Task 2: Real-browser dimensional gate (standalone Tailwind harness)

**Files:**
- Create: `tests/e2e/_dataQualityBadgeHarness.tsx` (server-rendered markup, mirrors `tests/e2e/_step3ReviewModalHarness.tsx`)
- Create: `tests/e2e/dataQualityBadge-dimensional.spec.ts` (mirrors the setup of `tests/e2e/step3-review-modal.layout.spec.ts`: Tailwind-CLI-compiled `app/globals.css` served over a `node:http` server; NO Next route → no dev-route registry fan-out)

**Interfaces:**
- Consumes: `DataQualityBadge` (default rendering); `renderToStaticMarkup` from `react-dom/server`; the same Tailwind-compile + `createServer` harness scaffolding as `_step3ReviewModalHarness.tsx` / `step3-review-modal.layout.spec.ts`.
- Produces: a served page exposing four badges under stable ids — `badge-gap` (gap-only), `badge-roster` (roster-only), `badge-both` (both chips) — each measurable via `getBoundingClientRect()`, with each glyph reachable via its lucide svg class.

**Dimensional invariant (spec §5.4):** `badge.height ≈ glyph.height` (the 14px `size-3.5` box) — the `leading-none` on the counts keeps their 16.8px (`0.75rem × 1.4`) line box from growing the badge; and `badge-both.height ≈ badge-roster.height` (adding the second chip must not wrap to a second line). Both within 0.5px.

- [ ] **Step 1: Write the harness component**

Create `tests/e2e/_dataQualityBadgeHarness.tsx`. Mirror the top-of-file structure of `_step3ReviewModalHarness.tsx` (it exports a function returning an HTML string built with `renderToStaticMarkup`, wrapping the subject in `<div id=...>` probes and linking `/globals.css`). Render the badge in three states inside a normal inline flex row (to reproduce the shows-table context), plus a bare-glyph reference:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";

// Each badge sits in an inline row beside a title span, matching the shows-table
// header context (ShowsTable.tsx:468) so the measured layout is representative.
function Row({ id, node }: { id: string; node: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
      <span>East Coast Tour</span>
      <span id={id}>{node}</span>
    </div>
  );
}

export function dataQualityBadgeHarnessHtml(): string {
  const body = renderToStaticMarkup(
    <main style={{ padding: "2rem", maxWidth: "480px" }}>
      <Row id="badge-gap" node={<DataQualityBadge slug="gap" dataGaps={{ total: 3, classes: {} as never }} />} />
      <Row
        id="badge-roster"
        node={
          <DataQualityBadge
            slug="roster"
            dataGaps={undefined}
            rosterShift={{ added: 2, removed: 0, renamed: 0, total: 2 }}
          />
        }
      />
      <Row
        id="badge-both"
        node={
          <DataQualityBadge
            slug="both"
            dataGaps={{ total: 3, classes: {} as never }}
            rosterShift={{ added: 2, removed: 0, renamed: 0, total: 2 }}
          />
        }
      />
    </main>,
  );
  // The `<link rel="stylesheet" href="/globals.css">` + <html> shell is added by the
  // spec's server (identical to _step3ReviewModalHarness's served-page wrapper).
  return body;
}
```

Note: the gap-only/both badges pass `classes: {}` — `formatDataGapBreakdown` returns `""` for an empty class map at `total>0`, which is harmless for a LAYOUT harness (the aria-label/breakdown text is not what's measured; height is). If the harness's compiled build rejects the `{} as never` cast, pass a real all-zero-but-one class map via the same shape `mkDataGaps` produces (`{ UNKNOWN_FIELD: 3, ...zeros }`).

- [ ] **Step 2: Write the failing Playwright spec**

Create `tests/e2e/dataQualityBadge-dimensional.spec.ts`. Copy the harness scaffolding (Tailwind compile of `app/globals.css`, `node:http` server serving the harness HTML + compiled CSS at `/globals.css`, `beforeAll`/`afterAll`) verbatim from `tests/e2e/step3-review-modal.layout.spec.ts`, then:

```ts
test("badge height equals its glyph height (leading-none holds the line box)", async ({ page }) => {
  await page.goto(baseUrl);
  for (const id of ["badge-gap", "badge-roster", "badge-both"]) {
    const badge = await page.locator(`#${id} [role="img"]`).boundingBox();
    const glyph = await page.locator(`#${id} [role="img"] svg`).first().boundingBox();
    expect(badge).not.toBeNull();
    expect(glyph).not.toBeNull();
    expect(Math.abs(badge!.height - glyph!.height)).toBeLessThanOrEqual(0.5);
  }
});

test("adding the second chip does not wrap (both ≈ single-chip height)", async ({ page }) => {
  await page.goto(baseUrl);
  const roster = await page.locator(`#badge-roster [role="img"]`).boundingBox();
  const both = await page.locator(`#badge-both [role="img"]`).boundingBox();
  expect(Math.abs(both!.height - roster!.height)).toBeLessThanOrEqual(0.5);
});
```

- [ ] **Step 3: Run the spec to verify it passes (real browser)**

Run: `cd /Users/ericweiss/fxav-wt-badge-a11y && pnpm exec playwright test tests/e2e/dataQualityBadge-dimensional.spec.ts`
Expected: PASS. If `badge.height` exceeds `glyph.height` by >0.5px, the `leading-none` on a count span is missing — fix Task 1's markup, do NOT loosen the tolerance.

- [ ] **Step 4: Commit**

```bash
cd /Users/ericweiss/fxav-wt-badge-a11y
git add tests/e2e/_dataQualityBadgeHarness.tsx tests/e2e/dataQualityBadge-dimensional.spec.ts
git commit --no-verify -m "test(admin): real-browser dimensional gate for DataQualityBadge chips

Standalone Tailwind-compiled harness (no Next route): badge height ==
glyph height (leading-none holds the 16.8px count line box), and the
second chip does not wrap. jsdom cannot compute this (Tailwind v4 no
default align-items:stretch)."
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
- §5.4 dimensional invariant → Task 2. ✔
- §5.5 transition inventory (all instant; audit lockstep) → Task 1 Step 5. ✔
- §6 DESIGN.md amendment + invariant 8 → Task 3. ✔
- §7 meta-test inventory (EXTENDS dataGapsTransitionAudit only) → Task 1 Step 5. ✔
- §8 test plan (all 7 items) → Task 1 Step 1 (behavioral) + Task 2 (layout). ✔

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** chip testids `dq-chip-roster`/`dq-chip-gap` used identically in Task 1 impl + test; `hasGap`/`hasRoster` names identical in impl + transition-audit grep; `Users`/`TriangleAlert` from lucide-react consistent across impl + harness + tests.

**Anti-tautology:** counts derived from fixture `.total`; chips scoped by own testid; aria-label derived via `formatDataGapBreakdown`; layout measures the badge vs its own glyph (both present in every state), never a hardcoded pixel value.
