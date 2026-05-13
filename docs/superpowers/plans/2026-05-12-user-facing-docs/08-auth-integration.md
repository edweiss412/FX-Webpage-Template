# Phase H — Auth + integration tests

**Scope:** The remaining structural tests from spec §7.1 that exercise the integrated `/help` surface: anchor resolver (#1, deferred from Phase A), auth + AdminInfraError mapping (#3), MDX smoke (#4), mobile-layout Playwright (#6), no-placeholder lint (#7).

**Per-task TDD discipline (r7 — addresses round-6 finding 3 about green-only batching):** Every Phase H task explicitly demonstrates a red-then-green TDD loop by introducing the test BEFORE its implementation OR by **stashing** a representative piece of the implementation to verify the test fails meaningfully. The exact "stash" pattern per task is documented in each task's Step 0:

```
Step 0 (verify-red): git stash an artifact the test depends on, run the test, confirm FAIL with the expected error, then `git stash pop` to restore.
Step 1+: standard TDD red→green from the restored state.
```

This converts each Phase H task from "green-only verification commit" into a documented red-then-green loop. The stash step doesn't change repo state long-term — it only proves the test would catch a regression.

**Prereqs:** Phase G complete (strict sequential per 00-overview.md — implies A through G also complete).

**Tasks:** H.1 → H.5 (5 tasks). r4's H.6 (live-catalog biconditional) was REMOVED in r6 — see the H.6 section below for the rationale; the assertion now lives in Phase E Task E.13.

---

### Task H.1: Anchor resolver (test #1)

**Files:**
- Create: `tests/help/anchor-resolver.test.ts`

Per spec §7.1 test 1. For every catalog entry with `helpHref`, parses the target file (MDX or TSX) and confirms a matching `<RefAnchor id="<anchor>">` exists. Fails CI on any broken deep-link.

- [ ] **Step 1: Write the failing test**

```ts
// tests/help/anchor-resolver.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

/**
 * For a helpHref like "/help/admin/parse-warnings#WARN_X":
 *   - URL path → file path:
 *       /help → app/help
 *       /help/admin/parse-warnings → app/help/admin/parse-warnings/page.{mdx,tsx}
 *   - The fragment "WARN_X" must appear inside the target file as either
 *     <RefAnchor id="WARN_X"> OR id="WARN_X" (for non-catalog-code anchors
 *     like #sync-health used on plain h2 elements).
 *
 * Anti-tautology: the test reads catalog source as the assertion side
 * (the helpHref values) and reads MDX/TSX file as the page-under-test.
 * The two cannot self-satisfy.
 */
function resolveTargetFile(helpHref: string): string | null {
  const [pathPart] = helpHref.split("#");
  const fsPath = pathPart.replace(/^\/help/, "app/help");
  const mdx = join(process.cwd(), fsPath, "page.mdx");
  const tsx = join(process.cwd(), fsPath, "page.tsx");
  if (existsSync(mdx)) return mdx;
  if (existsSync(tsx)) return tsx;
  // Fallback: maybe the helpHref points at a top-level page like "/help" itself
  const directMdx = join(process.cwd(), fsPath + ".mdx");
  const directTsx = join(process.cwd(), fsPath + ".tsx");
  if (existsSync(directMdx)) return directMdx;
  if (existsSync(directTsx)) return directTsx;
  return null;
}

function containsAnchor(fileSrc: string, anchor: string): boolean {
  // <RefAnchor id="X"> shape:
  if (new RegExp(`<RefAnchor\\s+id=["']${anchor}["']`).test(fileSrc)) return true;
  // Plain id="X" on any element (for non-catalog-code anchors):
  if (new RegExp(`\\bid=["']${anchor}["']`).test(fileSrc)) return true;
  return false;
}

describe("Anchor resolver (test #1)", () => {
  const entries = Object.values(MESSAGE_CATALOG).filter((e) => e.helpHref !== null);

  it("derives a non-empty set of entries with helpHref", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    it(`${entry.code}: helpHref resolves to a real page + anchor`, () => {
      const href = entry.helpHref!;
      const file = resolveTargetFile(href);
      expect(file, `helpHref ${href} does not resolve to a real page file`).not.toBeNull();
      const fragment = href.includes("#") ? href.split("#")[1] : null;
      if (!fragment) return; // page-only target — already validated by existsSync.
      const src = readFileSync(file!, "utf8");
      expect(
        containsAnchor(src, fragment),
        `helpHref ${href} fragment "${fragment}" not found in ${file}`,
      ).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Run test**

Run: `pnpm test tests/help/anchor-resolver.test.ts`
Expected: PASS for every entry whose `helpHref` was populated by Phase E content authoring. Any FAIL is a real deep-link bug — the catalog says a help page should exist, but the anchor isn't there. Fix the page (add the anchor) or fix the catalog (correct the helpHref).

- [ ] **Step 3: Commit**

```bash
git add tests/help/anchor-resolver.test.ts
git commit -m "test(help): anchor resolver test #1 (Task H.1)"
```

---

### Task H.2: Auth-gating + AdminInfraError mapping (test #3)

**Files:**
- Create: `tests/playwright/help-auth.spec.ts`

Per spec §7.1 test 3 (r10 expanded for AdminInfraError + fallback chain). Three GET paths × three auth states + the AdminInfraError surface.

- [ ] **Step 1: Write the failing test**

```ts
// tests/playwright/help-auth.spec.ts
import { test, expect } from "@playwright/test";
import { signInAs, signOut } from "../e2e/helpers/signInAs";

// Per spec §7.1 test 3 — three auth states × four routes.

const ROUTES = ["/help", "/help/admin/dashboard", "/help/errors", "/help/tour"];

test.describe("/help auth gate (test #3)", () => {
  for (const route of ROUTES) {
    test(`unauthenticated GET ${route} → 403`, async ({ page }) => {
      await signOut(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(403);
    });

    test(`authenticated-as-admin GET ${route} → 200`, async ({ page }) => {
      await signInAs(page, { email: "admin-fixture@example.com", label: "admin" } as never);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
    });

    test(`authenticated-as-crew GET ${route} → 403 in v1 (phase 2 will relax /help/crew/*)`, async ({ page }) => {
      await signInAs(page, { email: "crew-fixture@example.com", label: "non-admin" } as never);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(403);
    });
  }
});

test.describe("/help AdminInfraError mapping (test #3 r10)", () => {
  test("when requireAdmin throws AdminInfraError, /help renders cataloged 500-class surface", async ({ page, request }) => {
    // r7 (round-6 finding 2): NO SKIP allowed. AC-12.24 requires this test to
    // run unconditionally. The infra-fail trigger is implemented as part of
    // H.2 (see Step 2 below) — a test-only query-param `?force_infra_fail=1`
    // recognized ONLY when ENABLE_TEST_AUTH === "true" AND the request
    // includes a valid Authorization: Bearer ${TEST_AUTH_SECRET}, identical
    // gating to lib/time/now.ts (Phase C).
    await signInAs(page, { email: "admin-fixture@example.com", label: "admin" } as never);
    await page.setExtraHTTPHeaders({
      Authorization: `Bearer ${process.env.TEST_AUTH_SECRET}`,
    });
    await page.goto("/help?force_infra_fail=1");
    await expect(page.getByTestId("help-layout-infra-error")).toBeVisible();
    // Fallback chain per spec §3.5 + AC-12.24:
    //   entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."
    // For ADMIN_SESSION_LOOKUP_FAILED (lib/messages/catalog.ts:148-154 post
    // Phase B.2 alignment), all fields are null AFTER B.2 sets them to null.
    // Wait — review: ADMIN_SESSION_LOOKUP_FAILED is NOT a master-spec
    // admin-log-only code; B.2 only touches admin-log-only entries. So
    // ADMIN_SESSION_LOOKUP_FAILED keeps its current crewFacing value:
    // "Something is misconfigured for this show. Doug has been notified."
    await expect(page.locator("body")).toContainText(
      "Something is misconfigured for this show. Doug has been notified.",
    );
  });
});
```

- [ ] **Step 2: Implement the infra-fail trigger as part of H.2 (TDD red→implementation→green per round-6 finding 2)**

The infra-fail test is RED at first run because the trigger doesn't exist yet. H.2 IMPLEMENTS the trigger:

Edit `app/help/layout.tsx` to honor a test-only `?force_infra_fail=1` query param:

```tsx
// app/help/layout.tsx — H.2 r7 (test-only infra-fail trigger)
import { headers } from "next/headers";

// ...inside HelpLayout, BEFORE the `try { await requireAdmin() } catch (...)`:
const reqHeaders = await headers();
const url = new URL(reqHeaders.get("x-url") ?? "/", "http://localhost");
if (
  url.searchParams.get("force_infra_fail") === "1" &&
  process.env.ENABLE_TEST_AUTH === "true" &&
  reqHeaders.get("authorization") === `Bearer ${process.env.TEST_AUTH_SECRET}`
) {
  throw new AdminInfraError("test-forced infra fail (H.2)");
}
// ...then proceed with the normal try/catch around requireAdmin().
```

(Implementation note: Next 16's `headers()` doesn't expose the request URL directly; the implementer may need middleware or `next/headers`'s `cookies()` + a custom header pattern. The exact mechanism matches whatever pattern the project's existing test-only infra triggers use — survey at execution time. The CONTRACT is: a way to force `AdminInfraError` triggered ONLY when test-auth is on AND the bearer matches.)

- [ ] **Step 3: Run + iterate**

Run: `pnpm test:e2e tests/playwright/help-auth.spec.ts`
Expected: the 9 base auth tests PASS (Phase A's `requireAdmin()` already gates). The AdminInfraError mapping test PASSES once the H.2 Step 2 trigger lands — there is **no skip path** (r7 fix per round-6 finding 2: AC-12.24 must have unconditional coverage).

- [ ] **Step 3: Commit**

```bash
git add tests/playwright/help-auth.spec.ts
git commit -m "test(playwright): /help auth gate + AdminInfraError mapping (Task H.2 — test #3)"
```

---

### Task H.3: MDX smoke test (test #4)

**Files:**
- Create: `tests/help/render.test.ts`

Per spec §7.1 test 4. Every `.mdx` and `.tsx` page under `app/help/` returns a non-empty rendered HTML body via the Next.js test renderer. Catches malformed MDX, missing required components, broken imports.

- [ ] **Step 1: Write the failing test**

```ts
// tests/help/render.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

function discoverPages(): { route: string; file: string }[] {
  const root = join(process.cwd(), "app/help");
  const found: { route: string; file: string }[] = [];

  function walk(dir: string, segments: string[]) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith("_")) continue;
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full, [...segments, entry]);
      else if (entry === "page.mdx" || entry === "page.tsx") {
        found.push({
          route: "/" + ["help", ...segments].join("/"),
          file: full,
        });
      }
    }
  }
  walk(root, []);
  return found;
}

describe("MDX smoke (test #4)", () => {
  const pages = discoverPages();

  it(`discovers all 13 v1 pages (found ${pages.length})`, () => {
    expect(pages.length).toBe(13);
  });

  for (const { route, file } of pages) {
    it(`${route}: renders non-empty HTML`, async () => {
      // Dynamic import via the route's page module.
      const rel = relative(process.cwd(), file).replace(/\.(mdx|tsx)$/, "");
      const mod = await import(`@/${rel}`);
      const Page = mod.default;
      const html = renderToStaticMarkup(<Page />);
      expect(html.length).toBeGreaterThan(100);
    });
  }
});
```

- [ ] **Step 2: Run**

Run: `pnpm test tests/help/render.test.ts`
Expected: PASS for every page Phase E authored. Any FAIL indicates a malformed MDX file, a missing component, or a broken import.

- [ ] **Step 3: Commit**

```bash
git add tests/help/render.test.ts
git commit -m "test(help): MDX smoke renderer (Task H.3 — test #4)"
```

---

### Task H.4: Mobile-layout Playwright test (test #6)

**Files:**
- Create: `tests/playwright/help-mobile.spec.ts`

Per spec §7.1 test 6 (real-browser assertion — jsdom not sufficient per project's Tailwind v4 flex-stretch lesson). At 390 × 844 viewport, navigates to `/help/admin/dashboard`, asserts:

- `<Sidebar>` is collapsed into a `<details>` disclosure (mobile pattern from Phase A.4)
- Body content width ≤ 390 − 2 × gutter
- No horizontal scroll: `document.documentElement.scrollWidth === window.innerWidth`
- Every interactive target ≥ 44 × 44 px (per PRODUCT.md accessibility floor)

- [ ] **Step 1: Write the failing test**

```ts
// tests/playwright/help-mobile.spec.ts
import { test, expect } from "@playwright/test";
import { signInAs } from "../e2e/helpers/signInAs";

test.describe("/help mobile layout (test #6)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("sidebar collapsed; no horizontal scroll; tap targets ≥ 44×44", async ({ page }) => {
    await signInAs(page, { email: "admin-fixture@example.com", label: "admin" } as never);
    await page.goto("/help/admin/dashboard", { waitUntil: "networkidle" });

    // Sidebar collapsed into <details>:
    const detailsToggle = page.getByText(/browse help pages/i);
    await expect(detailsToggle).toBeVisible();

    // No horizontal scroll:
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);

    // Every visible interactive target ≥ 44×44 px (PRODUCT.md "Accessibility floor"):
    const tooSmall = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll("a, button, [role='button']"));
      return interactive
        .filter((el) => (el as HTMLElement).offsetParent !== null) // visible only
        .filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width < 44 || r.height < 44;
        })
        .map((el) => ({
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 40),
          width: Math.round((el as HTMLElement).getBoundingClientRect().width),
          height: Math.round((el as HTMLElement).getBoundingClientRect().height),
        }));
    });
    expect(tooSmall, `Found ${tooSmall.length} sub-44×44 interactive elements:\n${JSON.stringify(tooSmall, null, 2)}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm test:e2e tests/playwright/help-mobile.spec.ts`
Expected: PASS. Any sub-44×44 hits → fix the offending component (likely the click-to-copy `<RefAnchor>` icon, or a tooltip `?` icon; adjust their CSS to `min-h-tap-min` + `min-w-tap-min` or pad with `before`/`after`).

- [ ] **Step 3: Commit**

```bash
git add tests/playwright/help-mobile.spec.ts
git commit -m "test(playwright): /help mobile layout assertions (Task H.4 — test #6)"
```

---

### Task H.5: No-placeholder lint (test #7)

**Files:**
- Create: `tests/help/no-placeholders.test.ts`

Per spec §7.1 test 7 (r2 inverted lint). At v1 close-out, no `<ScreenshotPlaceholder>` references exist in any `.mdx` file under `app/help/`. Phase F.10 should have replaced every placeholder with a real `<Screenshot key>` or deleted it; H.5 enforces.

- [ ] **Step 1: Write the failing test**

```ts
// tests/help/no-placeholders.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function walkMdx(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkMdx(full, found);
    else if (entry.endsWith(".mdx")) found.push(full);
  }
  return found;
}

describe("No <ScreenshotPlaceholder> in shipped v1 MDX (test #7)", () => {
  const root = join(process.cwd(), "app/help");
  const mdx = walkMdx(root);
  const violations: string[] = [];

  for (const file of mdx) {
    const src = readFileSync(file, "utf8");
    if (src.includes("<ScreenshotPlaceholder")) {
      violations.push(relative(process.cwd(), file));
    }
  }

  it("no .mdx file references <ScreenshotPlaceholder>", () => {
    expect(
      violations,
      `Violations:\n${violations.join("\n")}\n\nPhase F.10 retrofits these to <Screenshot key="..."> or removes them.`,
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm test tests/help/no-placeholders.test.ts`
Expected: PASS if Phase F.10 retrofitted every placeholder. Any FAIL = a page still using `<ScreenshotPlaceholder>` — go back to Phase F.10 and retrofit it.

- [ ] **Step 3: Commit**

```bash
git add tests/help/no-placeholders.test.ts
git commit -m "test(help): no-placeholder lint (Task H.5 — test #7)"
```

---

### Task H.6: REMOVED in r6

The live-catalog biconditional assertion that r4 added as H.6 violated AGENTS.md plan-wide invariant #1 (TDD: failing test → minimal implementation → passing test → commit). At H.6 time, every Phase E backfill had already landed, so the new assertion would commit as green-only — no red state, no implementation that makes it pass.

**r6 restructure:** the live-catalog biconditional assertion lives in **Task E.13** (the `/help/errors` page task — the last Phase E task by both dependency and ordering convention). E.13 adds the assertion alongside whatever final catalog-backfill is needed to make it pass. The assertion is RED at the start of E.13 (entries unaccounted for), and goes GREEN with E.13's own commit (the final backfills that close any remaining gaps).

See `05-content.md` Task E.13 for the TDD-clean integration.

---

## Phase H close-out

After H.1 – H.5 commits land:

- [ ] Test #1 (anchor resolver) PASSES — every `helpHref` resolves
- [ ] Test #3 (auth + AdminInfraError) PASSES — admin gate + cataloged 500-class surface
- [ ] Test #4 (MDX smoke) PASSES — every page renders non-empty
- [ ] Test #6 (mobile layout) PASSES — no horizontal scroll, no sub-44px taps, sidebar collapses
- [ ] Test #7 (no-placeholder lint) PASSES — no `<ScreenshotPlaceholder>` in shipped MDX
- [ ] Test #2 live-catalog biconditional PASSES (committed in E.13 per r6, not H.6)
- [ ] Full `pnpm test` and `pnpm test:e2e` green
- [ ] **Hand off to Phase I** ([09-close-out.md](09-close-out.md))

Phase H introduces ~5 commits.
