# Stacked Mobile Control Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md` — a deterministic stacked control band below `sm` in the published review modal, with an exactly-matching skeleton, resolving `STRIP-MOBILE-WRAP-1` and `STRIP-SKELETON-MOBILE-BAND-1`.

**Architecture:** Flat full-width direct children of the existing `flex-wrap` strip form the mobile rows (no wrappers between strip and children, no break elements). ONE PublishedToggle (new `settings` variant) and ONE ReSyncButton serve both breakpoints via `max-sm:`/`sm`-gated internals. The e2e verification layer (parity re-tighten + a new 390px geometry spec) is authored FIRST and runs RED against today's code; component tasks turn it green.

**Tech Stack:** Next.js 16 / React 19, Tailwind v4 tokens, lucide-react, Vitest + Testing Library (jsdom), Playwright standalone static harnesses.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md` (R5 APPROVE). §1.1 decisions are closed.
- Phones only: every change `max-sm:`-scoped or `sm`-hidden; `≥sm` layout/labels/behavior unchanged (spec §1.1).
- TDD: the e2e verification set is written RED in Task 1; each component task additionally carries its own RED-first jsdom cycle.
- New user-visible copy exactly: "Published", "Visible to crew", "Hidden from crew", "Sync", "Live", "Draft", "Archived" (spec §7). No em-dashes in copy.
- 44px tap floor via `min-h-tap-min`/`min-w-tap-min`/`size-tap-min` tokens; no new magic pixels (badge dot `size-2`; lucide `size={15}` precedent ShareHub.tsx:414-416).
- Single-instance rule: never a second `published-toggle` / `admin-resync-button` testid (spec §1.1).
- Meta-test inventory: NONE created or extended. §9 strip lexical scanner + help scanners must stay green (Task 8).
- Advisory-lock topology: N/A.
- Worktree: `/Users/ericweiss/FX-worktrees/strip-mobile-reflow`; all commands from its root; commits use `--no-verify` (autonomous gate); conventional-commit messages, exact staged paths only (never `git add tests/` or a directory).
- Every commit's staged file list is written in its step — stage exactly those.

---

### Task 1: Author the RED e2e verification layer + CI wiring

**Files:**
- Create: `tests/e2e/stackedBandLayout.spec.ts`
- Modify: `tests/e2e/skeletonBandParity.spec.ts` (re-tighten E)
- Modify: `tests/e2e/statusStripToggleLayout.spec.ts` (migrate (a)/(c) to ≥sm; add 390 finalize test)
- Modify: `tests/e2e/standalone.config.ts` (allow-list — line ~36 regex)
- Modify: `package.json` (line 52 `test:e2e:modal-header` script)
- Modify: `.github/workflows/modal-header-layout-e2e.yml` (path filter, if it names spec files individually — mirror the `skeletonBandParity` entries)

**Interfaces:**
- Produces: the executable definition of done. RED/GREEN matrix below is the task's deliverable.
- Consumes: testids that Tasks 2-6 will create — `strip-state-badge`, `strip-state-badge-row`, `strip-divider-1`, `strip-divider-2`, `admin-resync-mobile-label`, `published-toggle-sublabel` (names fixed HERE; later tasks conform).

- [ ] **Step 1: Re-tighten parity E** — in `skeletonBandParity.spec.ts` replace the `if (mode === "popup") { … } else { … }` block (lines ~314-342) with the unconditional exact clause, and delete `TAP_ROW_PLUS_PADDING`:

```ts
    test(`E: the subheader band heights match within ${BAND_TOL}px`, async ({ page }) => {
      const { skeleton, loaded } = await bandHeights(page);
      expect(skeleton, "skeleton band is non-vacuous").toBeGreaterThan(0);
      expect(
        Math.abs(skeleton - loaded),
        `skeleton band ${skeleton} vs loaded band ${loaded}`,
      ).toBeLessThanOrEqual(BAND_TOL);
    });
```

Rewrite the header comment for clause E (lines ~29-38) and the sheet-mode rationale comment (lines ~282-304) to cite `docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md` §6.

- [ ] **Step 2: Write `tests/e2e/stackedBandLayout.spec.ts`** (spec §9.2/§9.4; every §4 invariant measured):

```ts
/**
 * tests/e2e/stackedBandLayout.spec.ts
 * (spec docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md §9.2/§9.4)
 *
 * Real-browser geometry for the stacked mobile band at 390x844. Reuses the
 * skeleton-parity harness page and measures the LOADED strip. Worst-case
 * strings come from the REAL producers (syncStatusBucket + formatRelative) —
 * never hardcoded; the typical-state comparison restores the fixture's own
 * initially-rendered strings (anti-tautology, spec §9.2).
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { syncStatusBucket } from "../../lib/admin/syncStatus";
import { formatRelative } from "../../lib/admin/showDisplay";

const REPO_ROOT = resolve(__dirname, "..", "..");
// Derived, never literal: longest catalog label + the longest minute-form
// relative string the producer can emit.
const WORST_HEALTH = syncStatusBucket("shrink_held").label;
const NOW = new Date("2026-07-24T12:00:00Z");
const WORST_EDITED = `Edited ${formatRelative(new Date(NOW.getTime() - 59 * 60_000).toISOString(), NOW)}`;

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "stacked-band-"));
  const jsonPath = join(workDir, "page.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_skeletonParityHarness.tsx"), jsonPath],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" },
    },
  );
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { page: string };
  writeFileSync(
    join(workDir, "parity.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head><body class="bg-bg">${parsed.page}</body></html>`,
  );
  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    `@source "${join(workDir, "parity.html")}";\n` +
      readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"),
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "parity.html" : url.replace(/^\//, "");
    try {
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(readFileSync(join(workDir, file)));
    } catch {
      res.statusCode = 404;
      res.end("nf");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

const S = (name: string) => `[data-parity="loaded"] [data-testid="${name}"]`;
const BAND = `[data-parity="loaded"] [data-testid="published-show-review-subheader"]`;

async function open390(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await expect(page.locator(S("show-status-strip"))).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

type Box = { name: string; top: number; bottom: number; height: number; right: number; width: number };

const MEASURED = [
  "strip-state-badge-row",
  "strip-state-badge",
  "strip-publish-toggle",
  "strip-divider-1",
  "strip-sync-age",
  "admin-resync-button",
  "strip-divider-2",
  "share-hub-group",
  "share-hub-root",
  "share-hub-primary",
  "share-hub-kebab",
] as const;

async function boxes(page: Page): Promise<Record<string, Box>> {
  const out: Record<string, Box> = {};
  for (const name of MEASURED) {
    const r = await page
      .locator(S(name))
      .evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    out[name] = { name, top: r.top, bottom: r.bottom, height: r.height, right: r.right, width: r.width };
  }
  return out;
}

/** Group measured elements into disjoint vertical bands (shared line = overlap). */
function membership(all: Record<string, Box>, names: readonly string[]): string[] {
  const sorted = names.map((n) => all[n]!).sort((a, b) => a.top - b.top);
  const lines: Box[][] = [];
  for (const b of sorted) {
    const line = lines.find((l) => l.some((o) => b.top < o.bottom - 0.5 && o.top < b.bottom - 0.5));
    if (line) line.push(b);
    else lines.push([b]);
  }
  return lines.map((l) => l.map((b) => b.name).sort().join("+"));
}

async function readStatusText(page: Page): Promise<{ health: string; edited: string }> {
  return await page.evaluate(
    ({ syncedSel, editedSel }) => ({
      health: (document.querySelector(syncedSel) as HTMLElement).textContent ?? "",
      edited: (document.querySelector(editedSel) as HTMLElement | null)?.textContent ?? "",
    }),
    { syncedSel: S("strip-synced-line"), editedSel: S("strip-edited-age") },
  );
}

async function setStatusText(page: Page, health: string, edited: string): Promise<void> {
  await page.evaluate(
    ({ h, e, syncedSel, editedSel }) => {
      (document.querySelector(syncedSel) as HTMLElement).textContent = h;
      const ed = document.querySelector(editedSel) as HTMLElement | null;
      if (ed) ed.textContent = e;
    },
    { h: health, e: edited, syncedSel: S("strip-synced-line"), editedSel: S("strip-edited-age") },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

test("rows, caps, clip priority, containment — worst-case vs fixture-typical", async ({ page }) => {
  await open390(page);
  const fixtureText = await readStatusText(page); // the producers' own rendered output
  await setStatusText(page, WORST_HEALTH, WORST_EDITED);
  const worst = await boxes(page);

  // (a) Row membership: four disjoint bands in spec §3 order (dividers are
  // their own 1px lines between them).
  const rowNames = [
    "strip-state-badge-row",
    "strip-publish-toggle",
    "strip-divider-1",
    "strip-sync-age",
    "admin-resync-button",
    "strip-divider-2",
    "share-hub-group",
  ] as const;
  expect(membership(worst, rowNames)).toEqual([
    "strip-state-badge-row",
    "strip-publish-toggle",
    "strip-divider-1",
    "admin-resync-button+strip-sync-age",
    "strip-divider-2",
    "share-hub-group",
  ]);

  // (b) Heights (spec §4): badge pill fixed 24±1; dividers 1±0.5; R1/R2-union/
  // R3 rows in [44,48]; sync-age fits inside its row (no vertical overflow).
  expect(worst["strip-state-badge"]!.height).toBeGreaterThanOrEqual(23);
  expect(worst["strip-state-badge"]!.height).toBeLessThanOrEqual(25);
  for (const d of ["strip-divider-1", "strip-divider-2"] as const) {
    expect(worst[d]!.height, d).toBeGreaterThan(0);
    expect(worst[d]!.height, d).toBeLessThanOrEqual(1.5);
  }
  expect(worst["strip-publish-toggle"]!.height).toBeGreaterThanOrEqual(44);
  expect(worst["strip-publish-toggle"]!.height).toBeLessThanOrEqual(48);
  const r2Top = Math.min(worst["strip-sync-age"]!.top, worst["admin-resync-button"]!.top);
  const r2Bottom = Math.max(worst["strip-sync-age"]!.bottom, worst["admin-resync-button"]!.bottom);
  expect(r2Bottom - r2Top).toBeGreaterThanOrEqual(44);
  expect(r2Bottom - r2Top).toBeLessThanOrEqual(48);
  expect(worst["strip-sync-age"]!.height).toBeLessThanOrEqual(r2Bottom - r2Top + 0.5);
  for (const n of ["share-hub-group", "share-hub-primary", "share-hub-kebab"] as const) {
    expect(worst[n]!.height, n).toBeGreaterThanOrEqual(44);
    expect(worst[n]!.height, n).toBeLessThanOrEqual(48);
  }

  // (c) Tap widths: Sync + kebab >= 44 wide (switch is pseudo-extended by
  // existing design and EXCLUDED here — spec §9.2.d).
  expect(worst["admin-resync-button"]!.width).toBeGreaterThanOrEqual(44);
  expect(worst["share-hub-kebab"]!.width).toBeGreaterThanOrEqual(44);

  // (d) Containment: no horizontal overflow at the band root AND every
  // measured child's right edge inside the band content edge (+0.5).
  const band = await page.locator(BAND).evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const contentLeft = r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const contentRight = r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return {
      contentLeft,
      contentRight,
      contentWidth: contentRight - contentLeft,
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    };
  });
  expect(band.scrollW).toBe(band.clientW);
  for (const name of MEASURED) {
    expect(worst[name]!.right, `${name} right edge`).toBeLessThanOrEqual(band.contentRight + 0.5);
  }

  // (d2) Full-width chain + anchor datum (spec §3 R3): group == root width
  // within 0.5px, and the group/kebab right edges sit at the band content
  // edge — the popover anchor datum survives the mobile layout.
  // Every link fills the BAND CONTENT WIDTH — equal widths alone would also
  // pass a half-width right-aligned chain (plan R3 finding 2).
  expect(Math.abs(worst["share-hub-group"]!.width - band.contentWidth)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(worst["share-hub-root"]!.width - band.contentWidth)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(worst["share-hub-group"]!.right - band.contentRight)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(worst["share-hub-kebab"]!.right - band.contentRight)).toBeLessThanOrEqual(1);

  // (e) Clip priority: the health label's own box never clips.
  const health = await page
    .locator(S("strip-synced-line"))
    .evaluate((el) => ({ scrollW: el.scrollWidth, clientW: el.clientWidth }));
  expect(health.scrollW).toBeLessThanOrEqual(health.clientW + 1);

  // (f) Determinism: restore the fixture's own producer-rendered strings —
  // IDENTICAL membership and heights (fails on today's wrap layout).
  await setStatusText(page, fixtureText.health, fixtureText.edited);
  const typical = await boxes(page);
  expect(membership(typical, rowNames)).toEqual(membership(worst, rowNames));
  for (const name of MEASURED) {
    expect(Math.abs(typical[name]!.height - worst[name]!.height), name).toBeLessThanOrEqual(0.5);
  }
});

test("badge flush + single state signal + accessible names per breakpoint", async ({ page }) => {
  await open390(page);
  const badgeRight = await page
    .locator(S("strip-state-badge"))
    .evaluate((el) => el.getBoundingClientRect().right);
  const contentRight = await page.locator(BAND).evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  });
  expect(Math.abs(badgeRight - contentRight)).toBeLessThanOrEqual(1);
  await expect(page.locator(S("strip-live-badge"))).not.toBeVisible();
  const loaded = page.locator(`[data-parity="loaded"]`);
  await expect(loaded.getByRole("button", { name: "Sync" })).toBeVisible();
  await expect(loaded.getByRole("switch", { name: "Published" })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await expect(page.locator(S("strip-state-badge"))).not.toBeVisible();
  await expect(page.locator(S("strip-live-badge"))).toBeVisible();
  await expect(loaded.getByRole("button", { name: "Re-sync" })).toBeVisible();
  await expect(loaded.getByRole("switch", { name: "Published" })).toBeVisible();
});
```

- [ ] **Step 3: statusStripToggleLayout migration** — change invariants (a) and (c) viewports from `MOBILE` to `{ width: 800, height: 800 }` (retitle `@>=sm`), keep (b)/(d) untouched, and append:

```ts
test("finalize @390: sublabel in-flow, no chip, row stays one line", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto(`${baseUrl}finalizeShort.html`); // per-state page pattern (line ~161)
  await expect(page.getByTestId("published-toggle-popover")).not.toBeVisible();
  await expect(page.getByTestId("published-toggle-sublabel")).toBeVisible();
  const row = await page
    .getByTestId("published-toggle-inline")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(row).toBeLessThanOrEqual(48);
});
```

If `_statusStripToggleHarness.tsx` renders `variant="inline"` for its strip states, switch those renders to `variant="settings"` (production parity — the strip mount changes in Task 3). NOTE: `variant="settings"` does not exist until Task 3; the harness build will fail typecheck until then — expected RED.

- [ ] **Step 4: CI wiring (verified-live config, plan R1 finding 4):**
  - `tests/e2e/standalone.config.ts` testMatch regex: add `|stackedBandLayout` inside the alternation (e.g. after `statusStripToggleLayout`).
  - `package.json` line 52 `test:e2e:modal-header`: append ` tests/e2e/stackedBandLayout.spec.ts`.
  - `.github/workflows/modal-header-layout-e2e.yml`: grep for `skeletonBandParity`; mirror every per-file entry (path filters and/or run lines) for `stackedBandLayout.spec.ts`.

```bash
grep -n "skeletonBandParity" .github/workflows/modal-header-layout-e2e.yml
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts --list 2>/dev/null | grep -c stackedBand
```

Expected: the `--list` grep prints ≥1 once the regex is edited.

- [ ] **Step 5: Run the set — document the RED matrix**

```bash
pnpm test:e2e:modal-header
```

Expected against TODAY's code:
- parity A-D: PASS; popup E: PASS; sheet E: **FAIL** (loaded 149 vs skeleton 73).
- stackedBandLayout: **FAIL** (`strip-state-badge-row` locator resolves nothing).
- statusStripToggleLayout: harness typecheck **FAIL** if Step 3's variant swap was applied (settings absent until Task 3) — otherwise (a)/(c)@≥sm PASS, new 390 finalize test **FAIL** (no sublabel).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/stackedBandLayout.spec.ts tests/e2e/skeletonBandParity.spec.ts tests/e2e/statusStripToggleLayout.spec.ts tests/e2e/_statusStripToggleHarness.tsx tests/e2e/standalone.config.ts package.json .github/workflows/modal-header-layout-e2e.yml
git commit --no-verify -m "test(e2e): RED verification layer for stacked mobile band + CI wiring"
```

---

### Task 2: StatusStrip mobile rows + state badge

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx`
- Test: `tests/components/admin/showpage/statusStrip.test.tsx`

**Interfaces:**
- Produces: testids fixed by Task 1 (`strip-state-badge`, `strip-state-badge-row`, `strip-divider-1`, `strip-divider-2`); module-private `stateBadge(archived, isLive, published): { label; pill; dot }`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing jsdom tests** — append a describe block to `statusStrip.test.tsx` (uses the file's `renderStrip` helper, line 84):

```tsx
describe("stacked mobile band (spec 2026-07-24-strip-mobile-stacked-band §3)", () => {
  it("badge matrix: literal outcomes per lifecycle", () => {
    const cases = [
      { archived: true, isLive: false, published: true, label: "Archived" },
      { archived: true, isLive: true, published: false, label: "Archived" },
      { archived: false, isLive: true, published: true, label: "Live" },
      { archived: false, isLive: false, published: true, label: "Published" },
      { archived: false, isLive: false, published: false, label: "Draft" },
      // Contract-violation input (spec §10 garbage-in): precedence shows Live.
      { archived: false, isLive: true, published: false, label: "Live" },
    ] as const;
    for (const c of cases) {
      renderStrip({ archived: c.archived, isLive: c.isLive, published: c.published });
      const badge = screen.getByTestId("strip-state-badge");
      expect(badge).toHaveTextContent(c.label);
      expect(badge.className).toContain("h-6");
      expect(badge.className).toContain("rounded-pill");
      cleanup();
    }
  });

  it("badge row wrapper: full-width right-aligning mobile-only line, direct strip child", () => {
    renderStrip();
    const row = screen.getByTestId("strip-state-badge-row");
    for (const cls of ["hidden", "max-sm:flex", "w-full", "justify-end"]) {
      expect(row.className).toContain(cls);
    }
    expect(row.parentElement).toBe(screen.getByTestId("show-status-strip"));
  });

  it("Live badge recipe: pinned accent-tint pair, accent-on-bg dot", () => {
    renderStrip({ isLive: true, published: true });
    const badge = screen.getByTestId("strip-state-badge");
    expect(badge.className).toContain("bg-accent-tint");
    expect(badge.className).toContain("text-accent-on-bg");
    const dot = badge.querySelector("span[aria-hidden]");
    expect(dot?.className).toContain("size-2");
    expect(dot?.className).toContain("bg-accent-on-bg");
  });

  it("desktop badges hide below sm; one state signal per breakpoint", () => {
    renderStrip({ isLive: true, published: true });
    expect(screen.getByTestId("strip-live-badge").className).toContain("max-sm:hidden");
    cleanup();
    renderStrip({ archived: true });
    expect(screen.getByTestId("strip-archived-badge").className).toContain("max-sm:hidden");
    expect(screen.getByTestId("strip-state-badge")).toHaveTextContent("Archived");
  });

  it("dividers: D1 iff not archived; D2 iff R2 renders anything; correct classes", () => {
    renderStrip();
    for (const id of ["strip-divider-1", "strip-divider-2"] as const) {
      const d = screen.getByTestId(id);
      for (const cls of ["hidden", "max-sm:block", "h-px", "w-full", "bg-border"]) {
        expect(d.className).toContain(cls);
      }
      expect(d.parentElement).toBe(screen.getByTestId("show-status-strip"));
    }
    cleanup();
    renderStrip({ archived: true });
    expect(screen.queryByTestId("strip-divider-1")).toBeNull();
    expect(screen.getByTestId("strip-divider-2")).toBeInTheDocument();
    cleanup();
    renderStrip({ archived: true, lastSyncedAt: null });
    expect(screen.queryByTestId("strip-divider-1")).toBeNull();
    expect(screen.queryByTestId("strip-divider-2")).toBeNull();
  });

  it("R2 clip-priority classes are max-sm scoped; desktop shrink-0 retained", () => {
    renderStrip();
    const group = screen.getByTestId("strip-sync-age");
    for (const cls of ["shrink-0", "max-sm:shrink", "max-sm:min-w-0", "max-sm:overflow-hidden"]) {
      expect(group.className).toContain(cls);
    }
    const synced = screen.getByTestId("strip-synced-line");
    expect(synced.className).toContain("max-sm:whitespace-nowrap");
    expect(synced.className).toContain("max-sm:shrink-0");
    const edited = screen.getByTestId("strip-edited-age");
    for (const cls of [
      "max-sm:whitespace-nowrap",
      "max-sm:min-w-0",
      "max-sm:overflow-hidden",
      "max-sm:text-ellipsis",
    ]) {
      expect(edited.className).toContain(cls);
    }
  });

  it("share-hub group spans the band below sm; root row classes unchanged", () => {
    renderStrip();
    expect(screen.getByTestId("share-hub-group").className).toContain("max-sm:w-full");
    const classes = screen.getByTestId("show-status-strip").className.split(/\s+/);
    for (const cls of ["flex", "w-full", "flex-wrap", "items-center", "sm:flex-nowrap"]) {
      expect(classes).toContain(cls);
    }
  });

  it("badge transitions: all state pairs swap instantly with no animation classes", () => {
    const states = [
      { archived: false, isLive: true, published: true, label: "Live" },
      { archived: false, isLive: false, published: true, label: "Published" },
      { archived: false, isLive: false, published: false, label: "Draft" },
      { archived: true, isLive: false, published: false, label: "Archived" },
    ] as const;
    for (let i = 0; i < states.length; i++) {
      for (let j = 0; j < states.length; j++) {
        if (i === j) continue;
        const { rerender } = renderStrip(states[i]!);
        rerenderStrip(rerender, states[j]!);
        const badge = screen.getByTestId("strip-state-badge");
        expect(badge).toHaveTextContent(states[j]!.label);
        expect(badge.className).not.toMatch(/animate-|transition-/);
        cleanup();
      }
    }
  });

  it("compound: badge swap does not remount R2 (stable node identity)", () => {
    const { rerender } = renderStrip({ published: true, isLive: true });
    const syncBefore = screen.getByTestId("strip-sync-age");
    rerenderStrip(rerender, { published: false, isLive: false });
    expect(screen.getByTestId("strip-state-badge")).toHaveTextContent("Draft");
    expect(screen.getByTestId("strip-sync-age")).toBe(syncBefore);
  });
});
```

Also add, next to `renderStrip` (line 84), the rerender twin it uses:

```tsx
function rerenderStrip(
  rerender: (ui: React.ReactElement) => void,
  overrides: Partial<StatusStripProps> = {},
  { token = "TOK" as string | null, epoch = 5 } = {},
) {
  rerender(
    <ShareTokenProvider initialToken={token} initialEpoch={epoch}>
      <StatusStrip {...baseProps(overrides)} />
    </ShareTokenProvider>,
  );
}
```

(If `React` types are not imported for the `ReactElement` annotation, use
`Parameters<ReturnType<typeof render>["rerender"]>[0]` or simply type the
first parameter as `(ui: JSX.Element) => void` — match the file's existing
style.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="strip-state-badge"]`.

- [ ] **Step 3: Implement in `StatusStrip.tsx`**

(a) Module-private resolver above the component:

```tsx
type StateBadge = { label: string; pill: string; dot: string };

// Mobile state badge (spec §3 R0). Precedence archived > isLive > published.
// `isLive && !published` is upstream-unreachable (this file:43-45); precedence
// shows "Live" on that garbage-in (spec §10).
function stateBadge(archived: boolean, isLive: boolean, published: boolean): StateBadge {
  if (archived)
    return {
      label: "Archived",
      pill: "border border-border bg-surface text-text-subtle",
      dot: "bg-text-faint",
    };
  if (isLive) return { label: "Live", pill: "bg-accent-tint text-accent-on-bg", dot: "bg-accent-on-bg" };
  if (published)
    return {
      label: "Published",
      pill: "bg-surface-sunken text-text-subtle",
      dot: "bg-status-positive",
    };
  return { label: "Draft", pill: "bg-surface-sunken text-text-subtle", dot: "bg-text-faint" };
}
```

(b) First child inside the strip root (before the archived/toggle ternary):

```tsx
      {/* R0 (spec §3): mobile-only state badge on its own full-width line. */}
      <div data-testid="strip-state-badge-row" className="hidden max-sm:flex w-full justify-end">
        {(() => {
          const b = stateBadge(archived, isLive, published);
          return (
            <span
              data-testid="strip-state-badge"
              className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 text-xs font-semibold ${b.pill}`}
            >
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-pill ${b.dot}`} />
              {b.label}
            </span>
          );
        })()}
      </div>
```

(c) Archived badge (line ~192) and live-badge wrapper (line ~217): append `max-sm:hidden` to each className.

(d) D1 directly after the archived/toggle ternary; D2 directly before the share-hub group:

```tsx
      {!archived ? (
        <div
          aria-hidden="true"
          data-testid="strip-divider-1"
          className="hidden max-sm:block h-px w-full bg-border"
        />
      ) : null}
```

```tsx
      {lastSyncedAt != null || !archived ? (
        <div
          aria-hidden="true"
          data-testid="strip-divider-2"
          className="hidden max-sm:block h-px w-full bg-border"
        />
      ) : null}
```

(e) `strip-publish-toggle` wrapper: `"shrink-0"` → `"shrink-0 max-sm:w-full"`.

(f) R2: sync-age span (line ~223) className → `"flex shrink-0 items-center gap-2 max-sm:shrink max-sm:min-w-0 max-sm:overflow-hidden"`; status line (line ~246) appends ` max-sm:min-w-0 max-sm:overflow-hidden`; `strip-synced-line` gains `className="max-sm:whitespace-nowrap max-sm:shrink-0"`; `strip-edited-age` gains `className="max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden max-sm:text-ellipsis"`.

(g) `share-hub-group` appends ` max-sm:w-full`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS (new block + ALL pre-existing tests: direct-parent 329, DOM order, root classes 594-611, lexical scanner).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/showpage/StatusStrip.tsx tests/components/admin/showpage/statusStrip.test.tsx
git commit --no-verify -m "feat(admin): mobile state badge + stacked-row classes in StatusStrip"
```

---

### Task 3: PublishedToggle `settings` variant (single responsive instance)

**Files:**
- Modify: `components/admin/PublishedToggle.tsx`
- Modify: `components/admin/showpage/StatusStrip.tsx` (variant swap, one attribute)
- Test: `tests/components/admin/PublishedToggle.test.tsx`

**Interfaces:**
- Produces: `variant?: "card" | "inline" | "settings"`; settings renders container testid `published-toggle-inline` (the inline arm made responsive) + `data-testid="published-toggle-sublabel"` (no id); describedby rule unchanged.
- Consumes: Task 2's `max-sm:w-full` strip wrapper.

- [ ] **Step 1: Write the failing tests** — append to `PublishedToggle.test.tsx` (its `renderInline` at line 139 hardcodes variant+slug, so settings gets a sibling helper):

```tsx
describe("settings variant (spec 2026-07-24-strip-mobile-stacked-band §3 R1)", () => {
  function renderSettings(
    over: Partial<{
      published: boolean;
      finalizeOwned: boolean;
      setPublished: (n: boolean) => Promise<{ ok: true } | { ok: false; code: string }>;
    }> = {},
  ) {
    return render(
      <PublishedToggle
        slug="s1"
        variant="settings"
        published={over.published ?? true}
        finalizeOwned={over.finalizeOwned ?? false}
        setPublished={over.setPublished ?? (async () => ({ ok: true }) as const)}
      />,
    );
  }

  it("renders ONE switch; responsive container classes; both label blocks breakpoint-gated", () => {
    renderSettings({ published: true });
    expect(screen.getAllByTestId("published-toggle")).toHaveLength(1);
    const container = screen.getByTestId("published-toggle-inline");
    for (const cls of [
      "max-sm:flex",
      "max-sm:w-full",
      "max-sm:min-h-tap-min",
      "max-sm:items-center",
      "max-sm:justify-between",
    ]) {
      expect(container.className).toContain(cls);
    }
    // Desktop label span hides below sm; mobile block shows only below sm.
    const desktopLabel = within(container).getAllByText("Published", { selector: "span" })
      .find((el) => el.className.includes("max-sm:hidden"));
    expect(desktopLabel).toBeDefined();
    const mobileBlock = screen.getByTestId("published-toggle-sublabel").parentElement!;
    expect(mobileBlock.className).toContain("hidden");
    expect(mobileBlock.className).toContain("max-sm:flex");
    expect(mobileBlock.className).toContain("max-sm:min-w-0");
    expect(mobileBlock.className).toContain("max-sm:flex-col");
  });

  it("sublabel branches: visible / hidden / both finalize sublines; truncate; no id", () => {
    renderSettings({ published: true });
    const sub = screen.getByTestId("published-toggle-sublabel");
    expect(sub).toHaveTextContent("Visible to crew");
    expect(sub.className).toContain("truncate");
    expect(sub.hasAttribute("id")).toBe(false);
    cleanup();
    renderSettings({ published: false });
    expect(screen.getByTestId("published-toggle-sublabel")).toHaveTextContent("Hidden from crew");
    cleanup();
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-sublabel")).toHaveTextContent(
      "Changes are being finalized — the switch unlocks when they commit.",
    );
    cleanup();
    renderSettings({ published: false, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-sublabel")).toHaveTextContent(
      "A publish is finishing — the switch unlocks when it's done.",
    );
  });

  it("aria-describedby rule UNCHANGED: absent normally; popover id under finalize", () => {
    renderSettings({ published: true });
    expect(screen.getByTestId("published-toggle").hasAttribute("aria-describedby")).toBe(false);
    cleanup();
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle").getAttribute("aria-describedby")).toBe(
      "published-toggle-popover-s1",
    );
  });

  it("finalize chip desktop-only; refusal banner class-identical to inline's", async () => {
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-popover").className).toContain("max-sm:hidden");
    cleanup();
    const failing = async () => ({ ok: false as const, code: "PUBLISH_BLOCKED_PENDING_REVIEW" });
    renderInline({ published: true, setPublished: failing });
    fireEvent.click(screen.getByTestId("published-toggle"));
    const inlineCls = (await screen.findByTestId("published-toggle-popover")).className;
    cleanup();
    renderSettings({ published: true, setPublished: failing });
    fireEvent.click(screen.getByTestId("published-toggle"));
    const settingsCls = (await screen.findByTestId("published-toggle-popover")).className;
    expect(settingsCls).toBe(inlineCls);
  });
});
```

(If `within` is not already imported in the file, add it to the existing
`@testing-library/react` import.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx`
Expected: FAIL — TS excess-property/JSX error on `variant="settings"` first; that IS the red.

- [ ] **Step 3: Implement**

(a) Prop type:

```tsx
  /** Presentation. "card" (default) = full bordered box w/ h3 + subline + in-flow error.
   *  "inline" = compact switch + "Published" label; refusal/finalize copy → anchored popover.
   *  "settings" = the inline arm made responsive for the strip (spec
   *  2026-07-24-strip-mobile-stacked-band §3 R1): below sm a full-width row
   *  with a heading + state sublabel; at ≥sm identical to "inline". */
  variant?: "card" | "inline" | "settings";
```

(b) `if (variant === "inline") {` → `if (variant === "inline" || variant === "settings") {`, then inside the branch:

```tsx
    const isSettings = variant === "settings";
    const settingsSublabel = finalizeOwned
      ? subline
      : published
        ? "Visible to crew"
        : "Hidden from crew";
```

Container div className:

```tsx
        className={
          isSettings
            ? "inline-flex items-center gap-2 max-sm:flex max-sm:w-full max-sm:min-h-tap-min max-sm:items-center max-sm:justify-between max-sm:gap-3"
            : "inline-flex items-center gap-2"
        }
```

Desktop label span className:

```tsx
        <span className={`text-sm font-medium text-text-strong${isSettings ? " max-sm:hidden" : ""}`}>
          Published
        </span>
```

Mobile label block directly after it:

```tsx
        {isSettings ? (
          <span className="hidden max-sm:flex max-sm:min-w-0 max-sm:flex-col">
            <span className="text-sm font-semibold text-text-strong">Published</span>
            <span data-testid="published-toggle-sublabel" className="truncate text-xs text-text-subtle">
              {settingsSublabel}
            </span>
          </span>
        ) : null}
```

Finalize chip className: `className={FINALIZE_CHIP}` → `className={isSettings ? `${FINALIZE_CHIP} max-sm:hidden` : FINALIZE_CHIP}`. Nothing else changes (form, SwitchButton, error banner, describedBy).

(c) StatusStrip mount: `variant="inline"` → `variant="settings"`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS incl. every pre-existing inline test.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/PublishedToggle.tsx components/admin/showpage/StatusStrip.tsx tests/components/admin/PublishedToggle.test.tsx
git commit --no-verify -m "feat(admin): PublishedToggle settings variant - responsive single-instance strip row"
```

---

### Task 4: ReSyncButton mobile skin

**Files:**
- Modify: `components/admin/ReSyncButton.tsx`
- Test: `tests/components/ReSyncButton.test.tsx`

**Interfaces:**
- Produces: single `admin-resync-button`; `admin-resync-mobile-label` block; `admin-resync-desktop-label` wrapper.
- Consumes: Task 2's R2 layout.

- [ ] **Step 1: Write the failing tests** — append to `tests/components/ReSyncButton.test.tsx`. The file (verified, lines 14-31) imports `test` (not `it`) and `waitFor`, uses a module-level `fetchMock = vi.fn<typeof fetch>()` assigned to `global.fetch` in `beforeEach`, and `render(...).getByTestId` destructuring. Match that exactly:

```tsx
describe("mobile Sync skin (spec 2026-07-24-strip-mobile-stacked-band §3 R2)", () => {
  test("one trigger; two breakpoint-gated label blocks; real 44px box; mobile paddings", () => {
    const { getByTestId, getAllByTestId } = render(<ReSyncButton slug="s1" />);
    expect(getAllByTestId("admin-resync-button")).toHaveLength(1);
    const btn = getByTestId("admin-resync-button");
    for (const cls of ["min-h-tap-min", "min-w-tap-min", "max-sm:px-0", "max-sm:ml-auto"]) {
      expect(btn.className).toContain(cls);
    }
    expect(getByTestId("admin-resync-desktop-label").className).toContain("max-sm:hidden");
    const mobile = getByTestId("admin-resync-mobile-label");
    for (const cls of [
      "hidden",
      "max-sm:inline-flex",
      "h-8",
      "px-3",
      "rounded-sm",
      "border",
      "border-border",
    ]) {
      expect(mobile.className).toContain(cls);
    }
    expect(mobile).toHaveTextContent("Sync");
  });

  test("pending: icon spins with motion-reduce escape; aria-busy on", async () => {
    let release!: () => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((r) => {
          release = () =>
            r({
              json: async () => ({ ok: true, result: { outcome: "skipped" } }),
            } as unknown as Response);
        }),
    );
    const { getByTestId } = render(<ReSyncButton slug="s1" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() =>
      expect(getByTestId("admin-resync-button").getAttribute("aria-busy")).toBe("true"),
    );
    const icon = getByTestId("admin-resync-mobile-label").querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("animate-spin");
    expect(icon?.getAttribute("class") ?? "").toContain("motion-reduce:animate-none");
    release();
    // Spin STOP (spec §8 S idle<->pending both directions): busy clears and
    // the spin class is removed once the POST settles.
    await waitFor(() =>
      expect(getByTestId("admin-resync-button").getAttribute("aria-busy")).toBe("false"),
    );
    const settled = getByTestId("admin-resync-mobile-label").querySelector("svg");
    expect(settled?.getAttribute("class") ?? "").not.toContain("animate-spin");
  });
});
```

ALSO append to `tests/components/admin/showpage/statusStrip.test.tsx` the
strip-level dual-pending compound (spec §8 compound; RED now — the mobile
label does not exist until this task's implementation):

```tsx
  it("compound: toggle pending and Sync pending simultaneously, independent controls", async () => {
    let releaseFetch!: () => void;
    const held = new Promise<Response>((r) => {
      releaseFetch = () =>
        r({
          json: async () => ({ ok: true, result: { outcome: "skipped" } }),
        } as unknown as Response);
    });
    vi.stubGlobal("fetch", vi.fn(() => held));
    let releaseAction!: (v: { ok: true }) => void;
    renderStrip({ setPublished: () => new Promise((r) => { releaseAction = r; }) });
    fireEvent.click(screen.getByTestId("published-toggle"));
    fireEvent.click(screen.getByTestId("admin-resync-button"));
    await waitFor(() =>
      expect(screen.getByTestId("published-toggle").getAttribute("aria-busy")).toBe("true"),
    );
    expect(screen.getByTestId("admin-resync-button").getAttribute("aria-busy")).toBe("true");
    const icon = screen.getByTestId("admin-resync-mobile-label").querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("animate-spin");
    releaseAction({ ok: true });
    releaseFetch();
    vi.unstubAllGlobals();
  });
```

(Add `waitFor`/`fireEvent`/`vi` to statusStrip.test.tsx's imports if any is
missing — check its existing import lines and extend, never duplicate.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/ReSyncButton.test.tsx tests/components/admin/showpage/statusStrip.test.tsx`
Expected: FAIL in BOTH files — `admin-resync-mobile-label` absent (unit tests
and the strip-level dual-pending compound).

- [ ] **Step 3: Implement** in `ReSyncButton.tsx`:

(a) `import { RefreshCw } from "lucide-react";`

(b) Trigger className appends ` max-sm:px-0 max-sm:ml-auto` (keep `px-2` — it applies ≥sm).

(c) Replace the label grid block with:

```tsx
        {/* >=sm: existing width-reservation grid, untouched (T-RESYNC-WIDTH). */}
        <span data-testid="admin-resync-desktop-label" className="max-sm:hidden">
          <span className="grid place-items-center">
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
              {pending ? IDLE_LABEL : PENDING_LABEL}
            </span>
            <span className="col-start-1 row-start-1 whitespace-nowrap">
              {pending ? PENDING_LABEL : IDLE_LABEL}
            </span>
          </span>
        </span>
        {/* <sm: bordered 32px skin inside the 44px button (spec §3 R2). Visible
            text IS the accessible name at this breakpoint: "Sync". */}
        <span
          data-testid="admin-resync-mobile-label"
          className="hidden max-sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-border"
        >
          <RefreshCw
            aria-hidden="true"
            size={15}
            className={pending ? "animate-spin motion-reduce:animate-none" : undefined}
          />
          Sync
        </span>
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/components/ReSyncButton.test.tsx tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS incl. existing width-reservation tests.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/ReSyncButton.tsx tests/components/ReSyncButton.test.tsx tests/components/admin/showpage/statusStrip.test.tsx
git commit --no-verify -m "feat(admin): ReSyncButton mobile icon+Sync skin, single instance"
```

---

### Task 5: ShareHub mobile geometry

**Files:**
- Modify: `components/admin/showpage/ShareHub.tsx`
- Test: `tests/components/admin/showpage/shareHub.test.tsx`

**Interfaces:**
- Produces: `max-sm:` classes on root/primary/kebab exactly as spec §3 R3; testids unchanged.
- Consumes: Task 2's `share-hub-group max-sm:w-full`.

- [ ] **Step 1: Write the failing tests** — append (uses `renderHub`, line 56):

```tsx
describe("mobile split actions row (spec 2026-07-24-strip-mobile-stacked-band §3 R3)", () => {
  it("root spans; primary carries the FULL §3 R3 class contract; kebab bordered square", () => {
    renderHub();
    const primary = screen.getByTestId("share-hub-primary");
    for (const cls of [
      "max-sm:flex-1",
      "max-sm:justify-center",
      "max-sm:min-h-tap-min",
      "max-sm:rounded-sm",
      "max-sm:border",
      "max-sm:border-border",
      "max-sm:whitespace-nowrap",
      "max-sm:min-w-0",
      "max-sm:overflow-hidden",
    ]) {
      expect(primary.className).toContain(cls);
    }
    const kebab = screen.getByTestId("share-hub-kebab");
    for (const cls of [
      "max-sm:min-h-tap-min",
      "max-sm:min-w-tap-min",
      "max-sm:rounded-sm",
      "max-sm:border",
      "max-sm:border-border",
    ]) {
      expect(kebab.className).toContain(cls);
    }
    const root = screen.getByTestId("share-hub-root");
    expect(root.className).toContain("max-sm:w-full");
    expect(primary.parentElement).toBe(root);
  });

  it("labels unchanged in all lifecycles", () => {
    renderHub({ archived: false, published: true });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Share link");
    cleanup();
    renderHub({ archived: false, published: false });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Share link · paused");
    cleanup();
    renderHub({ archived: true });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Show actions");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/components/admin/showpage/shareHub.test.tsx`; FAIL on `max-sm:flex-1`.

- [ ] **Step 3: Implement** in `ShareHub.tsx`:

- Root div (line ~368): append ` max-sm:w-full` inside its template literal
  AND give it `data-testid="share-hub-root"` (the layout spec measures the
  full-width chain through this previously un-testid'd element).
- Primary trigger: append to BOTH ternary arms:
  ` max-sm:flex-1 max-sm:justify-center max-sm:min-h-tap-min max-sm:rounded-sm max-sm:border max-sm:border-border max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden`
  (`max-sm:border-border` deliberately overrides the arm's `border-border-strong` color below sm — spec §3 R3 skin; width stays 1px).
- Kebab: append ` max-sm:min-h-tap-min max-sm:min-w-tap-min max-sm:rounded-sm max-sm:border max-sm:border-border` to its template literal.

- [ ] **Step 4: Run tests** — target file + `pnpm vitest run tests/components/admin/showpage/`; all green.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/showpage/ShareHub.tsx tests/components/admin/showpage/shareHub.test.tsx
git commit --no-verify -m "feat(admin): ShareHub full-width mobile split row"
```

---

### Task 6: Skeleton stacked band (closes the parity RED from Task 1)

**Files:**
- Modify: `components/admin/showpage/ShowReviewModalSkeleton.tsx`
- Test: `tests/e2e/skeletonBandParity.spec.ts` (already re-tightened in Task 1 — it IS this task's failing test)

- [ ] **Step 1: Confirm the failing state** (loaded band is now stacked from Tasks 2-5; skeleton still single-row):

```bash
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/skeletonBandParity.spec.ts
```

Expected: sheet-mode E **FAIL** (loaded ≈215 vs skeleton ≈73); popup E PASS.

- [ ] **Step 2: Implement** — in the `subHeader` slot: existing placeholder row div appends ` max-sm:hidden`; directly after it:

```tsx
        {/* <sm stacked mirror (spec §6): same row/divider/gap structure as the
            loaded band; HEIGHTS are the contract, widths cosmetic. */}
        <div
          aria-hidden="true"
          className="hidden max-sm:flex w-full flex-wrap items-center gap-x-4 gap-y-2"
        >
          <div className="flex w-full justify-end">
            <Skeleton className="h-6 w-16 rounded-pill" />
          </div>
          <div className="flex min-h-tap-min w-full items-center justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-12 rounded-pill" />
          </div>
          <div className="h-px w-full bg-border" />
          <div className="flex min-h-tap-min w-full items-center justify-between">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-8 w-16 rounded-sm" />
          </div>
          <div className="h-px w-full bg-border" />
          <div className="flex w-full items-center gap-2">
            <Skeleton className="h-11 flex-1 rounded-sm" />
            <Skeleton className="h-11 w-11 rounded-sm" />
          </div>
        </div>
```

- [ ] **Step 3: Run to verify pass**

```bash
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/skeletonBandParity.spec.ts
```

Expected: PASS both viewports. If sheet E fails, the printed delta identifies
the off row — fix Task-step-2 bar/min-h values, never the tolerance.

- [ ] **Step 4: Commit**

```bash
git add components/admin/showpage/ShowReviewModalSkeleton.tsx
git commit --no-verify -m "feat(admin): skeleton mirrors stacked mobile band rows - parity exact at 390"
```

---

### Task 7: Full e2e verification GREEN

- [ ] **Step 1: Run the whole wired set**

```bash
pnpm test:e2e:modal-header
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/stackedBandLayout.spec.ts
```

Expected: ALL PASS (Task 1's RED matrix fully green). Diagnosis map:
membership mismatch → §3 row classes; height out of band → §4 caps;
containment → R2/R3 shrink contracts; name mismatch → Task 4 label blocks.

- [ ] **Step 2: Commit any geometry fixes** with scoped paths and
`fix(admin): <what>` messages (one commit per logical fix; stage exactly the
files touched by that fix).

---

### Task 8: Scanners + migration leftovers green

- [ ] **Step 1: Run the scanners and neighbor suites**

```bash
pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx tests/components/admin/PublishedToggle.test.tsx tests/components/ReSyncButton.test.tsx tests/components/admin/showpage/shareHub.test.tsx
pnpm vitest run tests/help/
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/statusStripToggleLayout.spec.ts
```

Expected: PASS. The §9 lexical scanner (statusStrip.test.tsx) still counts
the strip's conditional mounts; help scanners do not flag "Sync" (not a
help-doc-declared label; `tests/help/_uiLabelExceptions.ts` unchanged).

- [ ] **Step 2:** If any scanner is red, fix per its message (e.g. Prettier
collapsing the `{!archived ? (` mount — restore the multi-line counted form,
StatusStrip.tsx:291-304 comment explains the required shape). Commit scoped:
`test(admin): keep scanner-counted mount form` or as appropriate.

---

### Task 9: Transition audit — verification pass (spec §8)

The §8 inventory's executable pins were authored RED-first inside their
owning tasks: badge pairs + stable-R2 identity (Task 2 Step 1), dual-pending
compound + spin/motion-reduce (Task 4 Step 1), settings breakpoint boundary
(Task 3 Step 1). This task is the AUDIT that nothing animated slipped in and
that every declared-instant pair stays class-free — no new tests, so no TDD
cycle applies.

- [ ] **Step 1: Animation-surface grep** — the diff's ONLY animation tokens
must be the Task 4 spin pair:

```bash
git diff origin/main...HEAD -- 'components/**' | grep -nE "AnimatePresence|animate-|transition-"
```

Expected output: exactly the `animate-spin motion-reduce:animate-none` line
(plus unchanged context lines). Anything else → check against spec §8
(instant is the contract) and remove or justify against the table before
proceeding.

- [ ] **Step 2: Conditional-render inventory** — list every ternary/
conditional the diff adds and confirm each maps to a §8 row or a §3 presence
rule: badge resolver arms (4), D1/D2 conditions, `isSettings` blocks (3),
mobile/desktop label blocks (toggle + resync), spin className ternary.

```bash
git diff origin/main...HEAD -- 'components/**' | grep -nE "\? \(|\? "|isSettings|!archived|lastSyncedAt"
```

Record the mapping as a checklist in the Task 11 close-out doc (one line per
conditional). No commit unless a defect is found (then fix + scoped commit
`fix(admin): <what>`).

- [ ] **Step 3: Confirm the owning-task pins are green**

```bash
pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx tests/components/admin/PublishedToggle.test.tsx tests/components/ReSyncButton.test.tsx
```

Expected: PASS.

### Task 10: DESIGN.md delta + DEFERRED graduation

**Files:** `DESIGN.md`, `DEFERRED.md`, `DEFERRED-archive.md`

- [ ] **Step 1: DESIGN.md** (spec §7): §1.1 accent-tint row (~line 48) — append the Live-pill scope; §1.3 pill scope (~line 89) — add the mobile state badge with the accent-on-bg text+dot note.
- [ ] **Step 2: DEFERRED** — move both entries (DEFERRED.md:11-25) verbatim to `DEFERRED-archive.md` under "Resolved 2026-07-24", each with: "Resolved by spec 2026-07-24-strip-mobile-stacked-band (stacked mobile band; parity re-tightened)." Update DEFERRED.md's "Last reconciled" date.
- [ ] **Step 3: Commit**

```bash
git add DESIGN.md DEFERRED.md DEFERRED-archive.md
git commit --no-verify -m "docs: DESIGN accent-tint/badge scope; graduate strip-mobile deferrals"
```

---

### Task 11: Impeccable dual-gate + close-out record

- [ ] **Step 1:** `/impeccable critique` then `/impeccable audit` on the diff (canonical v3 setup gates).
- [ ] **Step 2:** Fix P0/P1 or defer via DEFERRED.md.
- [ ] **Step 3: Close-out record (invariant 8's §12 convention):** Create `docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band-closeout.md` with: §1 shipped-scope summary; §12 impeccable findings + dispositions table; adversarial-review triage log (populated in Task 13, incl. refuted diff-only claims). Commit:

```bash
git add docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band-closeout.md DEFERRED.md
git commit --no-verify -m "docs(plan): close-out record - impeccable dispositions"
```

---

### Task 12: Full local gates

- [ ] **Step 1:**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
pnpm test:e2e:modal-header
```

Expected: all green. FULL `pnpm test` (scoped runs miss registry suites).

- [ ] **Step 2:** If `format:check` flags files, run `pnpm format`, then stage
EXACTLY the reformatted paths (never `-u`, never a directory):

```bash
git status --short          # confirm: only modified tracked files, no untracked
git diff --name-only        # the exact reformatted list
git add $(git diff --name-only)
git commit --no-verify -m "chore: prettier residue from full-suite gates"
```

---

### Task 13: Adversarial review (cross-model) — split tight-scope

- [ ] **Step 1:** Two codex-guard dispatches (components diff; tests+config diff), fresh-eyes, REVIEWER ONLY, §1.1 do-not-relitigate, verdict marker. Iterate to APPROVE; class-sweep every finding before patching. Each repair round commits its fixes with scoped paths (`fix(admin)`/`test(admin): <what>`).
- [ ] **Step 2:** Log findings + refutations in the Task 11 close-out doc and commit it:

```bash
git add docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band-closeout.md
git commit --no-verify -m "docs(plan): close-out - adversarial review triage log"
```

---

### Task 14: Ship

- [ ] **Step 1:** Push; open PR (body: spec/plan/close-out links; Claude Code footer).
- [ ] **Step 2:** Real CI green (`gh pr checks <PR#> --watch`).
- [ ] **Step 3:** `gh pr merge --merge`; ff main checkout; verify `git rev-list --left-right --count main...origin/main` = `0  0`.
- [ ] **Step 4:** Stage 4.4: CronDelete job `036572cc`; ship-state `stage: "done"`; final report.

---

## Self-review

1. Spec coverage: §3 R0-R3 → T2-T5; §4/§9.2/§9.4 → T1 (authored) + T7 (green); §6/§9.1 → T1+T6; §9.3 → T2/T3/T9; §9.5 → T1/T3; §9.6 → T11; §7 → T10; §12 → T10/T14. TDD: e2e RED in T1; jsdom RED per component task.
2. Placeholder scan: clean (fetch-helper note in T4 instructs reuse of the file's own mechanism — deliberate, not a placeholder).
3. Type consistency: testids identical across T1 measurement list and T2-T5 implementations; `stateBadge` private; `renderSettings` local to PublishedToggle.test.
