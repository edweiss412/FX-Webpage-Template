# CARDREPORT-1 Tap-Target Hit Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the two crew-card header affordances (`SourceLink`, `CardReportTrigger`) ≥44×44px tap targets without changing the header's visual height, via transparent out-of-flow `::before` overlays that grow 44px in a context-appropriate direction.

**Architecture:** A `hitDirection: "up" | "down"` prop (default `"up"`) selects a single-direction pseudo-element overlay: SectionCard headers grow UP (zero downward overhang → clears interactive rows below); the one bare `schedule-days` header grows DOWN (zero upward overhang → clears the agenda above; day cards below are non-interactive). `CardHeaderActions` threads the prop to both leaves, reflects `data-hit-direction`, and widens its cluster `gap-2`→`gap-4` for symmetric horizontal clearance. Behavior is proved by a real-browser `elementFromPoint` hit-probe plus a jsdom production-wiring guard.

**Tech Stack:** Next.js 16, React Server/Client Components, Tailwind v4 (`--spacing-tap-min: 44px`), Vitest + jsdom (unit), Playwright `desktop-chromium` (real-browser e2e).

**Spec:** `docs/superpowers/specs/2026-07-17-cardreport-tap-targets.md` (Codex-APPROVED, 4 rounds).

## Global Constraints

- **Full-literal Tailwind class strings** — never string-interpolate utility fragments; the Tailwind v4 JIT only sees complete literals. Direction-conditional class sets are chosen by a `hitDirection === "down" ? "<full literal>" : "<full literal>"` ternary (repo precedent: `ReportButton` ringOffset map, DQIGNORE-5).
- **Sizing token:** `--spacing-tap-min` = 44px (`app/globals.css:162`), utilities `h-tap-min` / `w-tap-min`. **Fallback:** if a `before:h-tap-min` / `before:w-tap-min` variant fails to emit CSS (verify at Task 5 — overlay would compute to 0px and the probe fails), substitute the plain-scale `before:h-11` / `before:w-11` (44px). Prefer the semantic token; fall back only on a proven non-emit.
- **No header-height change** (spec constraint 2): the overlay is a positioned `::before`, invisible to `getBoundingClientRect()`. The existing row-height + affordance-box assertions in `tests/e2e/source-link-dimensional.spec.ts` must stay green.
- **Recessive appearance unchanged**: glyphs, `text-text-faint`, labels, and the existing hover/focus color transitions are untouched. Only the invisible hit area grows.
- **Invariant 8 (UI quality gate):** every file under `components/`, `app/` (non-`app/api`) touched here ships only after `/impeccable critique` AND `/impeccable audit` pass on the diff, P0/P1 fixed or DEFERRED-logged, BEFORE the cross-model close-out (Task 7).

## Meta-test inventory

**None created or extended (structural-registry sense).** This milestone touches no auth-helper / Supabase-call-boundary / DB-write / `admin_alerts` catalog / tile-sentinel / advisory-lock / inline-email surface. It extends two EXISTING behavioral tests — `tests/e2e/source-link-dimensional.spec.ts` (real-browser) and `tests/components/crew/sourceLinkCoverage.test.tsx` (jsdom) — neither of which is a registry meta-test. **Advisory-lock holder topology: N/A** (no `pg_advisory*` in scope). **Transition-audit task: N/A** (the overlay is static; no `AnimatePresence`, no new multi-state animation — the only motion is the pre-existing `transition-colors` hover, unchanged).

## Layout-dimensions task

Task 5 is the mandatory real-browser layout/dimensional assertion (Playwright `getBoundingClientRect()` + `elementFromPoint()` on the fixed-dimension header band). jsdom is NOT sufficient and is not used for the dimensional proof.

## File Structure

| File | Responsibility |
| --- | --- |
| `components/crew/primitives/SourceLink.tsx` | Add `hitDirection?` prop; `relative` host + direction-anchored full-width 44px `::before`. |
| `components/shared/CardReportTrigger.tsx` | Add `hitDirection?` prop; `relative` host + direction-anchored centered 44×44 `::before`. |
| `components/crew/primitives/CardHeaderActions.tsx` | Add `hitDirection?` (default `"up"`); thread to both leaves; reflect `data-hit-direction`; `gap-2`→`gap-4`. |
| `components/crew/sections/ScheduleSection.tsx` | Bare `schedule-days` cluster passes `hitDirection="down"`. |
| `app/admin/dev/source-link-dim/page.tsx` | Add `card-actions-up` + `card-actions-down` harness contexts with interactive neighbors. |
| `tests/e2e/source-link-dimensional.spec.ts` | Direction-aware `elementFromPoint` hit-probe. |
| `tests/components/crew/sourceLinkCoverage.test.tsx` | jsdom production-wiring guard on `data-hit-direction`. |
| `DEFERRED.md` | Mark CARDREPORT-1 ✅ RESOLVED. |

---

### Task 1: `SourceLink` — `hitDirection` prop + vertical hit overlay

**Files:**
- Modify: `components/crew/primitives/SourceLink.tsx`
- Test: `tests/components/crew/sourceLink.test.tsx` (create if absent; else append)

**Interfaces:**
- Produces: `SourceLink({ driveFileId, anchor, hitDirection }: { driveFileId: string | null; anchor?: SourceAnchor | null | undefined; hitDirection?: "up" | "down" })`. `hitDirection` defaults to `"up"`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SourceLink } from "@/components/crew/primitives/SourceLink";

afterEach(cleanup);
const ANCHOR = { title: "INFO", gid: 0, a1: "A1:B2" } as const;

it("default (up): the <a> is a positioned host carrying a bottom-anchored 44px hit overlay", () => {
  const { container } = render(<SourceLink driveFileId="d1" anchor={ANCHOR} />);
  const a = container.querySelector('a[data-slot="source-link"]')!;
  const c = a.getAttribute("class")!;
  // Positioned host + full-width, bottom-anchored, 44px-tall transparent ::before.
  // Failure mode caught: overlay omitted, or grown from the wrong edge (would
  // bleed downward into the interactive rows below in a SectionCard).
  expect(c).toContain("relative");
  expect(c).toContain("before:absolute");
  expect(c).toContain("before:inset-x-0");
  expect(c).toContain("before:bottom-0");
  expect(c).toContain("before:h-tap-min");
  expect(c).not.toContain("before:top-0");
});

it("down: the overlay is top-anchored instead", () => {
  const { container } = render(<SourceLink driveFileId="d1" anchor={ANCHOR} hitDirection="down" />);
  const c = container.querySelector('a[data-slot="source-link"]')!.getAttribute("class")!;
  expect(c).toContain("before:top-0");
  expect(c).not.toContain("before:bottom-0");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/crew/sourceLink.test.tsx`
Expected: FAIL (current class string has no `relative`/`before:*`).

- [ ] **Step 3: Write minimal implementation**

In `SourceLink.tsx`, extend the prop type and compute a full-literal overlay class, then apply `relative` + the overlay to the `<a>` className:

```tsx
type SourceLinkProps = {
  driveFileId: string | null;
  anchor?: SourceAnchor | null | undefined;
  /** Direction the invisible 44px tap overlay grows. Default "up" (SectionCard
   *  headers: zero downward overhang clears interactive rows below). "down" for
   *  the bare schedule-days header (clears the agenda above). */
  hitDirection?: "up" | "down";
};

export function SourceLink({ driveFileId, anchor, hitDirection = "up" }: SourceLinkProps): ReactNode {
  const href = buildSheetDeepLink(driveFileId, anchor);
  if (href === null) return null;

  // Full-literal per branch so the Tailwind v4 JIT sees complete class names.
  const overlay =
    hitDirection === "down"
      ? "relative before:absolute before:content-[''] before:inset-x-0 before:top-0 before:h-tap-min"
      : "relative before:absolute before:content-[''] before:inset-x-0 before:bottom-0 before:h-tap-min";

  return (
    <a
      data-slot="source-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View this section in the source sheet"
      className={`inline-flex h-fit shrink-0 items-center gap-1 text-xs font-medium text-text-faint transition-colors hover:text-text-subtle focus-visible:text-text-subtle [&_svg]:size-3.5 [&_svg]:opacity-70 ${overlay}`}
    >
      <SheetIcon />
      <span>In sheet</span>
    </a>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/crew/sourceLink.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/crew/primitives/SourceLink.tsx tests/components/crew/sourceLink.test.tsx
git commit --no-verify -m "feat(crew-page): SourceLink direction-anchored 44px hit overlay (CARDREPORT-1)"
```

---

### Task 2: `CardReportTrigger` — `hitDirection` prop + 44×44 hit overlay

**Files:**
- Modify: `components/shared/CardReportTrigger.tsx`
- Test: `tests/components/crew/CardReportTrigger.test.tsx` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CardReportTrigger` gains `hitDirection?: "up" | "down"` (default `"up"`) on its existing props object.

- [ ] **Step 1: Write the failing test**

```tsx
// append to tests/components/crew/CardReportTrigger.test.tsx (jsdom env already set there)
it("default (up): the <button> is a positioned host with a bottom-anchored 44x44 overlay", () => {
  const { container } = render(
    <CardReportTrigger cardId="today-dress" region="info" showId="s1" />,
  );
  const c = container.querySelector('button[data-slot="card-report-trigger"]')!.getAttribute("class")!;
  // Failure mode: missing overlay (14px target), or wrong grow-edge (down-bleed
  // into interactive rows below).
  expect(c).toContain("relative");
  expect(c).toContain("before:absolute");
  expect(c).toContain("before:w-tap-min");
  expect(c).toContain("before:h-tap-min");
  expect(c).toContain("before:left-1/2");
  expect(c).toContain("before:-translate-x-1/2");
  expect(c).toContain("before:bottom-0");
  expect(c).not.toContain("before:top-0");
});

it("down: 44x44 overlay is top-anchored", () => {
  const { container } = render(
    <CardReportTrigger cardId="today-dress" region="info" showId="s1" hitDirection="down" />,
  );
  const c = container.querySelector('button[data-slot="card-report-trigger"]')!.getAttribute("class")!;
  expect(c).toContain("before:top-0");
  expect(c).not.toContain("before:bottom-0");
});
```

(Use the same `region` value shape the existing tests in that file pass; if they import a `RegionId`, reuse it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/crew/CardReportTrigger.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add `hitDirection = "up"` to the destructured props and its type, compute the overlay, and append `relative` + overlay to the button className:

```tsx
export function CardReportTrigger({
  cardId,
  region,
  showId,
  cardReport = DEFAULT_CARD_REPORT,
  hitDirection = "up",
}: {
  cardId: CardId;
  region: RegionId;
  showId: string;
  cardReport?: CardReportContext;
  hitDirection?: "up" | "down";
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!showId) return null;
  // ...surfaceId / autocapture unchanged...

  const overlay =
    hitDirection === "down"
      ? "relative before:absolute before:content-[''] before:left-1/2 before:-translate-x-1/2 before:w-tap-min before:h-tap-min before:top-0"
      : "relative before:absolute before:content-[''] before:left-1/2 before:-translate-x-1/2 before:w-tap-min before:h-tap-min before:bottom-0";

  return (
    <>
      <button
        type="button"
        data-slot="card-report-trigger"
        data-testid="card-report-trigger"
        aria-label="Report a problem with this card"
        onClick={() => setOpen(true)}
        className={`inline-flex h-fit shrink-0 items-center text-text-faint transition-colors hover:text-text-subtle focus-visible:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&_svg]:size-3.5 [&_svg]:opacity-70 ${overlay}`}
      >
        <FlagIcon />
      </button>
      {/* ReportModal block unchanged */}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/crew/CardReportTrigger.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/shared/CardReportTrigger.tsx tests/components/crew/CardReportTrigger.test.tsx
git commit --no-verify -m "feat(crew-page): CardReportTrigger direction-anchored 44x44 hit overlay (CARDREPORT-1)"
```

---

### Task 3: `CardHeaderActions` — thread `hitDirection`, reflect `data-hit-direction`, `gap-4`

**Files:**
- Modify: `components/crew/primitives/CardHeaderActions.tsx`
- Test: `tests/components/crew/CardHeaderActions.test.tsx` (append)

**Interfaces:**
- Consumes: `SourceLink` / `CardReportTrigger` `hitDirection` prop (Tasks 1–2).
- Produces: `CardHeaderActions` gains `hitDirection?: "up" | "down"` (default `"up"`); its wrapper `<div>` carries `data-hit-direction={hitDirection}` and `gap-4`.

- [ ] **Step 1: Write the failing test**

```tsx
// append to tests/components/crew/CardHeaderActions.test.tsx
it("reflects the default up direction and uses gap-4; threads it to both leaves", () => {
  const { container } = render(
    <CardHeaderActions cardId="today-dress" driveFileId={DRIVE} anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }} showId="s1" />,
  );
  const wrap = container.querySelector('[data-slot="card-header-actions"]')!;
  expect(wrap.getAttribute("data-hit-direction")).toBe("up");
  expect(wrap.getAttribute("class")).toContain("gap-4");
  // threaded: the leaves grew UP (bottom-anchored overlay)
  expect(container.querySelector('[data-slot="source-link"]')!.getAttribute("class")).toContain("before:bottom-0");
  expect(container.querySelector('[data-slot="card-report-trigger"]')!.getAttribute("class")).toContain("before:bottom-0");
});

it("threads hitDirection=down to both leaves and reflects it", () => {
  const { container } = render(
    <CardHeaderActions cardId="today-dress" driveFileId={DRIVE} anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }} showId="s1" hitDirection="down" />,
  );
  const wrap = container.querySelector('[data-slot="card-header-actions"]')!;
  expect(wrap.getAttribute("data-hit-direction")).toBe("down");
  expect(container.querySelector('[data-slot="source-link"]')!.getAttribute("class")).toContain("before:top-0");
  expect(container.querySelector('[data-slot="card-report-trigger"]')!.getAttribute("class")).toContain("before:top-0");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/crew/CardHeaderActions.test.tsx`
Expected: FAIL (no `data-hit-direction`; class has `gap-2`).

- [ ] **Step 3: Write minimal implementation**

```tsx
export function CardHeaderActions({
  cardId,
  driveFileId,
  anchor,
  showId,
  cardReport = DEFAULT_CARD_REPORT,
  hitDirection = "up",
}: {
  cardId: CardId;
  driveFileId: string | null;
  anchor?: SourceAnchor | null | undefined;
  showId: string;
  cardReport?: CardReportContext;
  hitDirection?: "up" | "down";
}): ReactNode {
  const region = CARD_REGION_MAP[cardId];
  return (
    <div
      data-slot="card-header-actions"
      data-hit-direction={hitDirection}
      className="inline-flex h-fit shrink-0 items-center gap-4"
    >
      <SourceLink driveFileId={driveFileId} anchor={anchor} hitDirection={hitDirection} />
      <CardReportTrigger cardId={cardId} region={region} showId={showId} cardReport={cardReport} hitDirection={hitDirection} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/crew/CardHeaderActions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/crew/primitives/CardHeaderActions.tsx tests/components/crew/CardHeaderActions.test.tsx
git commit --no-verify -m "feat(crew-page): CardHeaderActions threads hitDirection + gap-4 (CARDREPORT-1)"
```

---

### Task 4: Wire `schedule-days` to `hitDirection="down"` + production-wiring guard

**Files:**
- Modify: `components/crew/sections/ScheduleSection.tsx:253` (the bare `schedule-days` `CardHeaderActions`)
- Test: `tests/components/crew/sourceLinkCoverage.test.tsx` (append §4.2 guard)

**Interfaces:**
- Consumes: `CardHeaderActions` `hitDirection` (Task 3) + `data-hit-direction` reflection. The test appends to `sourceLinkCoverage.test.tsx`, reusing its file-local `fullFixture()` (`:84`) and `renderAllSections()` (`:188`) helpers (verified present).

- [ ] **Step 1: Write the failing test**

```tsx
// append to tests/components/crew/sourceLinkCoverage.test.tsx
// (reuses this file's existing fullFixture() + renderAllSections helpers)
it("schedule-days actions grow DOWN; every other actions cluster grows UP (production wiring)", () => {
  const { container } = renderAllSections(fullFixture());
  const clusters = Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="card-header-actions"]'),
  );
  expect(clusters.length, "no CardHeaderActions clusters rendered").toBeGreaterThan(8);
  let sawScheduleDown = false;
  for (const cluster of clusters) {
    const card = cluster.closest("[data-card-id]");
    const id = card?.getAttribute("data-card-id");
    const dir = cluster.getAttribute("data-hit-direction");
    if (id === "schedule-days") {
      expect(dir, "schedule-days must grow DOWN (clears the agenda above)").toBe("down");
      sawScheduleDown = true;
    } else {
      expect(dir, `cluster in "${id}" must default to UP`).toBe("up");
    }
  }
  expect(sawScheduleDown, "schedule-days cluster was never rendered — assertion vacuous").toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/crew/sourceLinkCoverage.test.tsx -t "production wiring"`
Expected: FAIL — `schedule-days` currently reflects `"up"` (prop not yet passed).

- [ ] **Step 3: Write minimal implementation**

At `ScheduleSection.tsx:253`, add the prop to the bare-header `CardHeaderActions` only:

```tsx
<CardHeaderActions
  cardId="schedule-days"
  driveFileId={data.driveFileId}
  anchor={data.sourceAnchors[CARD_REGION_MAP["schedule-days"]]}
  showId={showId}
  cardReport={cardReport}
  hitDirection="down"
/>
```

Leave the other `ScheduleSection` `CardHeaderActions` (the `schedule-call-times` SectionCard at `:383`) on the default `"up"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/crew/sourceLinkCoverage.test.tsx -t "production wiring"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/crew/sections/ScheduleSection.tsx tests/components/crew/sourceLinkCoverage.test.tsx
git commit --no-verify -m "feat(crew-page): schedule-days grows hit target DOWN + wiring guard (CARDREPORT-1)"
```

---

### Task 5: Real-browser hit-probe + dev harness (test-first TDD) — layout-dimensions task

**Files:**
- Modify: `tests/e2e/source-link-dimensional.spec.ts` (the test — written and run FIRST)
- Modify: `app/admin/dev/source-link-dim/page.tsx` (the harness — the implementation that turns the test green)

**Interfaces:**
- Consumes: overlays from Tasks 1–3, wiring from Task 4; `[data-slot=source-link]` / `[data-slot=card-report-trigger]`.
- Produces: harness containers `[data-testid=card-actions-up|down]` with neighbor testids `dim-tel-above`, `dim-tel-below`, `dim-agenda-above`, `dim-daycard-below`.

**TDD note (why test-first is honest here):** the e2e probe is written and run BEFORE the harness exists, so its `beforeEach` `getByTestId("card-actions-up")` FAILS (harness absent) — a real red. The harness markup is the implementation that turns it green. The overlays' own fail-first proofs are the jsdom tests in Tasks 1–3; a cross-cutting real-browser probe cannot also fail-first on "overlay absent" once Tasks 1–3 have landed, so its red is on harness/probe wiring. The negative probes (`bottom+2`/`top-2` NOT the slot; below/above neighbor still hittable) are what make a PASS non-vacuous — a centered/symmetric or absent overlay fails them.

- [ ] **Step 1: Write the e2e test (append a new `test.describe`)**

Coordinates are derived from measured rects; the only literals are ±1/±2/±21/−43/+43 probe offsets (each strictly inside/outside the 44px span). `elementFromPoint` over a `::before` returns the originating element (which carries `data-slot`); `.closest()` also resolves a glyph child up to its slot.

```ts
test.describe("CARDREPORT-1: ≥44px direction-aware hit targets (spec §4)", () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    const res = await page.goto(HARNESS_PATH, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("card-actions-up")).toBeVisible();
    await expect(page.getByTestId("card-actions-down")).toBeVisible();
  });

  // The data-slot the point resolves to inside `rootTestId`, or `testid:<id>` for
  // an interactive neighbor that has no data-slot, or null.
  async function hitSlot(page, rootTestId: string, x: number, y: number): Promise<string | null> {
    return page.evaluate(
      ([rid, px, py]) => {
        const el = document.elementFromPoint(px as number, py as number) as Element | null;
        if (!el) return null;
        const root = document.querySelector(`[data-testid="${rid}"]`);
        const slotEl = el.closest("[data-slot]");
        if (!slotEl || !root || !root.contains(slotEl)) {
          const tid = el.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
          return tid ? `testid:${tid}` : null;
        }
        return slotEl.getAttribute("data-slot");
      },
      [rootTestId, x, y] as const,
    );
  }

  async function box(page, rootTestId: string, slot: string) {
    return page.locator(`[data-testid="${rootTestId}"] [data-slot="${slot}"]`).boundingBox();
  }

  test("UP context: 44px reachable upward; zero downward bleed; both tel rows intact", async ({ page }) => {
    for (const slot of ["source-link", "card-report-trigger"]) {
      const b = (await box(page, "card-actions-up", slot))!;
      expect(b, `${slot} must lay out`).not.toBeNull();
      const cx = b.x + b.width / 2;
      const bottom = b.y + b.height;
      expect(await hitSlot(page, "card-actions-up", cx, bottom - 1)).toBe(slot);   // near overlay bottom
      expect(await hitSlot(page, "card-actions-up", cx, bottom - 43)).toBe(slot);  // near overlay top (44px up)
      expect(await hitSlot(page, "card-actions-up", cx, bottom + 2)).not.toBe(slot); // zero down overhang
    }
    const t = (await box(page, "card-actions-up", "card-report-trigger"))!;
    const tcy = t.y + t.height / 2;
    expect(await hitSlot(page, "card-actions-up", t.x + t.width / 2 - 21, tcy)).toBe("card-report-trigger"); // 44px wide
    expect(await hitSlot(page, "card-actions-up", t.x + t.width / 2 + 21, tcy)).toBe("card-report-trigger");
    const row = (await page.getByTestId("dim-tel-below").boundingBox())!;
    expect(await hitSlot(page, "card-actions-up", row.x + row.width / 2, row.y + 1)).toBe("testid:dim-tel-below"); // below row top intact
    const above = (await page.getByTestId("dim-tel-above").boundingBox())!;
    expect(await hitSlot(page, "card-actions-up", above.x + above.width / 2, above.y + above.height - 1)).toBe("testid:dim-tel-above"); // above row bottom intact
  });

  test("DOWN context: 44px reachable downward + wide; zero upward bleed; no sibling overlap; agenda intact", async ({ page }) => {
    for (const slot of ["source-link", "card-report-trigger"]) {
      const b = (await box(page, "card-actions-down", slot))!;
      const cx = b.x + b.width / 2;
      const top = b.y;
      expect(await hitSlot(page, "card-actions-down", cx, top + 1)).toBe(slot);   // near overlay top
      expect(await hitSlot(page, "card-actions-down", cx, top + 43)).toBe(slot);  // near overlay bottom (44px down)
      expect(await hitSlot(page, "card-actions-down", cx, top - 2)).not.toBe(slot); // zero up overhang
    }
    // trigger reaches 44px WIDE in the DOWN branch too (F2: down-branch width was previously unprobed)
    const t = (await box(page, "card-actions-down", "card-report-trigger"))!;
    const tcy = t.y + t.height / 2;
    expect(await hitSlot(page, "card-actions-down", t.x + t.width / 2 - 21, tcy)).toBe("card-report-trigger");
    expect(await hitSlot(page, "card-actions-down", t.x + t.width / 2 + 21, tcy)).toBe("card-report-trigger");
    // no sibling overlap in the DOWN branch: SourceLink's right edge belongs to SourceLink, not the trigger
    const s = (await box(page, "card-actions-down", "source-link"))!;
    const scy = s.y + s.height / 2;
    expect(await hitSlot(page, "card-actions-down", s.x + s.width - 2, scy)).toBe("source-link");
    // agenda link above still hittable at its BOTTOM edge (down overlay stole nothing)
    const ag = (await page.getByTestId("dim-agenda-above").boundingBox())!;
    expect(await hitSlot(page, "card-actions-down", ag.x + ag.width / 2, ag.y + ag.height - 1)).toBe("testid:dim-agenda-above");
  });

  test("UP context no sibling overlap: SourceLink label + right edge belong to SourceLink, not the trigger", async ({ page }) => {
    const s = (await box(page, "card-actions-up", "source-link"))!;
    const scy = s.y + s.height / 2;
    expect(await hitSlot(page, "card-actions-up", s.x + s.width - 2, scy)).toBe("source-link");
    expect(await hitSlot(page, "card-actions-up", s.x + s.width / 2, scy)).toBe("source-link");
  });
});
```

- [ ] **Step 2: Run to verify it FAILS (red)**

Run: `pnpm exec playwright test tests/e2e/source-link-dimensional.spec.ts --project=desktop-chromium -g "direction-aware"`
Expected: FAIL — `beforeEach` errors because `card-actions-up`/`card-actions-down` are not in the harness yet.

- [ ] **Step 3: Add the harness markup (implementation)**

In `app/admin/dev/source-link-dim/page.tsx`, add two context blocks alongside the existing measured cards. Import `ClockIcon` from `@/components/crew/icons/sectionIcons` (add to imports). `SectionCard`/`CardHeaderActions` are already imported per the file header. `today-dress` and `schedule-days` are valid `CardId`s (used by `TodaySection`/`ScheduleSection`); a non-null `driveFileId` guarantees a rendered `SourceLink`.

```tsx
<div data-testid="card-actions-up" className="flex flex-col gap-3">
  {/* interactive neighbor ABOVE at the tightest real inter-card gap (gap-3) */}
  <a data-testid="dim-tel-above" href="tel:5085550100" className="inline-flex min-h-tap-min items-center text-sm">Call sheet lead</a>
  <SectionCard
    icon={<ClockIcon />}
    title="Tonight"
    action={<CardHeaderActions cardId="today-dress" driveFileId="drive-1" anchor={{ title: "INFO", gid: 0, a1: "A1:B2" }} showId="s1" />}
  >
    {/* interactive neighbor BELOW, first body child */}
    <a data-testid="dim-tel-below" href="tel:5085550111" className="inline-flex min-h-tap-min items-center text-sm">Call venue</a>
  </SectionCard>
</div>

<div data-testid="card-actions-down" className="flex flex-col gap-4">
  {/* possibly-interactive neighbor ABOVE (agenda link) */}
  <a data-testid="dim-agenda-above" href="#agenda" className="inline-flex min-h-tap-min items-center text-sm">Full agenda (PDF)</a>
  {/* bare schedule-days-style header, grows DOWN */}
  <div className="mb-2 flex justify-end">
    <div data-slot="section-card-action" className="flex shrink-0 items-center">
      <CardHeaderActions cardId="schedule-days" driveFileId="drive-1" anchor={{ title: "SCHED", gid: 1, a1: "A1:B2" }} showId="s1" hitDirection="down" />
    </div>
  </div>
  {/* non-interactive day-card stub BELOW */}
  <div data-testid="dim-daycard-below" className="rounded-md border border-border p-tile-pad text-sm text-text-subtle">Fri · Show day</div>
</div>
```

- [ ] **Step 4: Run to verify it PASSES (green)**

Run: `pnpm exec playwright test tests/e2e/source-link-dimensional.spec.ts --project=desktop-chromium`
Expected: the 3 new tests PASS; the 2 pre-existing tests still PASS.

- [ ] **Step 5: Verify the `before:*` utilities actually emitted 44px**

If any probe at the `−43`/`+43`/`±21` extreme fails, the `before:h-tap-min`/`before:w-tap-min` variant did not emit CSS — apply the Global-Constraints fallback (`before:h-11`/`before:w-11`) in Tasks 1–2, re-commit those, and re-run this task.

- [ ] **Step 6: Commit both**

```bash
git add tests/e2e/source-link-dimensional.spec.ts app/admin/dev/source-link-dim/page.tsx
git commit --no-verify -m "test(crew-page): real-browser direction-aware hit-probe + harness (CARDREPORT-1)"
```

---

### Task 6: Full-suite + typecheck + lint + format gate

**Files:** none (verification task).

- [ ] **Step 1: Grep for any test that snapshots the changed components' class strings**

Run: `grep -rn "card-header-actions\|source-link\|card-report-trigger" tests/ | grep -i "toMatchSnapshot\|tocontain(\"gap-2\"\|inline-flex"`
Fix any assertion that hard-codes the old `gap-2` or asserts an exact className that the overlay changed.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (vitest strips types; only `tsc` catches a bad `hitDirection` union).

- [ ] **Step 3: Lint + format**

Run: `pnpm lint && pnpm format:check`
Expected: clean (canonical Tailwind ordering; `--no-verify` commits bypass the pre-commit prettier hook, so run it explicitly).

- [ ] **Step 4: Full unit suite**

Run: `pnpm test`
Expected: green (scoped gates can miss a cross-file regression, e.g. a page render test that counts affordances).

- [ ] **Step 5: Commit any fixups**

```bash
git add -A && git commit --no-verify -m "chore(crew-page): typecheck/lint/format fixups (CARDREPORT-1)"
```

(Skip the commit if Steps 1–4 needed no changes.)

---

### Task 7: Impeccable dual-gate + DEFERRED.md close-out

**Files:**
- Modify: `DEFERRED.md`

- [ ] **Step 1: Run the invariant-8 impeccable dual-gate on the UI diff**

Run `/impeccable critique` then `/impeccable audit` on the diff (both with the canonical v3 setup: `context.mjs` PRODUCT.md+DESIGN.md load → register reference read). Affected UI files: `SourceLink.tsx`, `CardReportTrigger.tsx`, `CardHeaderActions.tsx`, `ScheduleSection.tsx`, `app/admin/dev/source-link-dim/page.tsx`. Fix every P0/P1, or log an explicit `DEFERRED.md` entry with citation. Record findings + dispositions for the close-out.

- [ ] **Step 2: Mark CARDREPORT-1 resolved**

In `DEFERRED.md`, under the CARDREPORT-1 entry, add a `**Resolved (…, 2026-07-17):**` line summarizing the shipped mechanism (direction-aware `::before` overlay: SectionCards grow UP via `hitDirection="up"` default, bare `schedule-days` grows DOWN; `gap-2`→`gap-4`; `data-hit-direction` wiring guard + real-browser hit-probe). Cite the spec + plan paths.

- [ ] **Step 3: Commit**

```bash
git add DEFERRED.md
git commit --no-verify -m "docs: CARDREPORT-1 resolved — direction-aware tap-target overlays"
```

---

## Self-Review

**Spec coverage:** §2 constraints 1–5 → Tasks 1–3 (overlay + no-height-change + non-overlap) + Task 5 (behavioral proof). §3.1 direction anchoring → Tasks 1–4. §3.2 gap-4 + trigger width → Task 3 + Task 5 width probe. §4 e2e probe + §4.1 harness → Task 5 (merged, test-first). §4.2 wiring guard → Task 4. §5 guards → covered by defaults (Task 3) + Task 5 negative probes. §7 files → Tasks 1–7. Invariant 8 → Task 7.

**Placeholder scan:** every code step has full literal code; no TBD/TODO.

**Type consistency:** `hitDirection?: "up" | "down"` identical across `SourceLink`, `CardReportTrigger`, `CardHeaderActions`; `data-hit-direction` string value matches the prop; harness testids match the probe reads within Task 5 (`card-actions-up/down`, `dim-tel-above/below`, `dim-agenda-above`).

**Anti-tautology:** Task 5 is the load-bearing behavioral gate — it probes the live compositor, derives all coordinates from measured rects, and its negative probes (`bottom+2`/`top-2` NOT the slot) would fail a centered/symmetric overlay, so it cannot pass vacuously. The jsdom class-string tests (Tasks 1–3) are explicitly scoped to catch prop-threading/direction regressions, with the failure mode stated; they are not the dimensional proof.
