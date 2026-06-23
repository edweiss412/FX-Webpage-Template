/**
 * tests/e2e/help-typography.spec.ts
 *
 * Real-browser regression for the /help prose typography layer.
 *
 * Why this exists: the /help MDX pipeline is "vanilla" (no
 * @tailwindcss/typography plugin, no base-element CSS). Before the typography
 * layer, Tailwind v4 preflight left markdown headings/lists/links unstyled —
 * h1/h2 rendered at body size (16px/400), <ul> had no bullets or indent,
 * inline links had no underline/color, paragraphs had no spacing, and the
 * desktop reading column ran ~113ch. jsdom can't catch this (no layout/cascade),
 * so the contract is pinned here against a real browser at both viewports.
 *
 * Runs in the CI-gated help-docs projects (help-affordances.yml): help-docs
 * (webkit, 390) and help-docs-desktop (chromium, 1280) against the :3004 server
 * with admin auth. The heading / list / link / code / paragraph-rhythm
 * assertions hold at both viewports; the measure assertion binds meaningfully at
 * desktop (where the column was ~856px) and is trivially satisfied at mobile.
 * Relative URLs + signInAs(no baseUrl) inherit the project baseURL, matching
 * help-mobile.spec.ts (the sibling spec in the same project family).
 *
 * Anti-tautology: every numeric assertion compares a heading/measure against
 * the live paragraph metrics on the SAME page (h2 > p, not a hardcoded px), so
 * the test can't pass by accident if the base font size changes.
 */
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers/signInAs";
import { ADMIN_FIXTURE } from "./helpers/fixtures";

test.describe("/help prose typography layer", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("headings, lists, code, paragraph rhythm and reading measure are styled", async ({
    page,
  }) => {
    await page.goto("/help/admin/onboarding-wizard", {
      waitUntil: "networkidle",
    });

    const m = await page.evaluate(() => {
      const num = (v: string) => parseFloat(v);
      const h1 = document.querySelector("main .help-prose h1")!;
      const h2 = document.querySelector("main .help-prose h2")!;
      const p = document.querySelector("main .help-prose p")!;
      const ul = document.querySelector("main .help-prose ul")!;
      const code = document.querySelector("main .help-prose code")!;
      const [p0, p1] = Array.from(document.querySelectorAll("main .help-prose p")) as HTMLElement[];
      const paragraphGap =
        p0 && p1 ? p1.getBoundingClientRect().top - p0.getBoundingClientRect().bottom : -1;

      // Reading measure of the prose column in CSS `ch` units (the `ch` unit is
      // the advance of the "0" glyph — the same unit `max-width: 70ch` uses).
      const prose = document.querySelector("main .help-prose") as HTMLElement | null;
      const pcs = getComputedStyle(p);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `${pcs.fontWeight} ${pcs.fontSize} ${pcs.fontFamily}`;
      const chWidth = ctx.measureText("0".repeat(50)).width / 50;
      const measureCh = prose ? prose.getBoundingClientRect().width / chWidth : -1;

      return {
        hasProseWrapper: !!prose,
        viewport: window.innerWidth,
        h1Size: num(getComputedStyle(h1).fontSize),
        h2Size: num(getComputedStyle(h2).fontSize),
        h2Weight: Number(getComputedStyle(h2).fontWeight),
        pSize: num(pcs.fontSize),
        ulListStyle: getComputedStyle(ul).listStyleType,
        ulPadStart: num(getComputedStyle(ul).paddingInlineStart),
        codeBg: getComputedStyle(code).backgroundColor,
        paragraphGap,
        measureCh,
      };
    });

    // The wrapper that scopes the prose layer must be present.
    expect(m.hasProseWrapper, "main should contain a .help-prose wrapper").toBe(true);

    // Heading hierarchy — headings must read larger and heavier than body.
    expect(m.h1Size, "h1 must be larger than body").toBeGreaterThan(m.pSize);
    expect(m.h2Size, "h2 must be larger than body").toBeGreaterThan(m.pSize);
    expect(m.h2Weight, "h2 must be semibold+").toBeGreaterThanOrEqual(600);

    // Lists — preflight stripped markers + indent; both must be restored.
    expect(m.ulListStyle, "ul must show a marker").not.toBe("none");
    expect(m.ulPadStart, "ul must be indented").toBeGreaterThan(0);

    // Paragraph rhythm — consecutive paragraphs must have a visible gap.
    expect(m.paragraphGap, "consecutive paragraphs need a gap").toBeGreaterThan(4);

    // Code — must carry a visible background tint (not transparent).
    expect(m.codeBg, "inline code needs a background tint").not.toBe("rgba(0, 0, 0, 0)");

    // Reading measure — capped at ~70ch (DESIGN.md §2.5: 65–75ch); the desktop
    // column was the full ~856px (~85ch) before the layer. 76 = 70ch cap + a
    // little headroom for cross-engine glyph-metric variance.
    expect(
      m.measureCh,
      `reading measure too wide (${Math.round(m.measureCh)}ch)`,
    ).toBeLessThanOrEqual(76);
  });

  test("inline prose links are underlined and inherit the AA-safe body text color", async ({
    page,
  }) => {
    await page.goto("/help/admin/per-show-panel", { waitUntil: "networkidle" });

    const link = await page.evaluate(() => {
      const a = document.querySelector("main .help-prose :is(p, li) a");
      if (!a) return null;
      const cs = getComputedStyle(a);
      return {
        decoration: cs.textDecorationLine,
        color: cs.color,
        bodyColor: getComputedStyle(document.body).color,
      };
    });

    expect(link, "per-show-panel should contain an inline prose link").not.toBeNull();
    // Underline is the link affordance (WCAG 1.4.1 — not color alone).
    expect(link!.decoration, "inline link must be underlined").toContain("underline");
    // At rest the link inherits the high-contrast body text color (≈16:1, AAA),
    // NOT the sub-AA brand accent (4.11:1). Pins the AA-safe rest-state color and
    // catches a regression back to --color-accent-on-bg as the body-link color.
    expect(link!.color, "inline link must inherit the AA-safe body text color").toBe(
      link!.bodyColor,
    );
  });

  test("errors page inherits the prose layer (no inert typography-plugin classes)", async ({
    page,
  }) => {
    await page.goto("/help/errors", { waitUntil: "networkidle" });

    const m = await page.evaluate(() => {
      const h1 = document.querySelector("main .help-prose h1");
      const p = document.querySelector("main .help-prose p");
      return {
        hasProseWrapper: !!document.querySelector("main .help-prose"),
        h1Size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
        pSize: p ? parseFloat(getComputedStyle(p).fontSize) : 0,
      };
    });

    expect(m.hasProseWrapper, "errors page must be inside .help-prose").toBe(true);
    expect(m.h1Size, "errors h1 must be styled larger than body").toBeGreaterThan(m.pSize);
  });

  // Chunk 2 (audit Theme B): the catalog pages render markdown pipe-tables via
  // remark-gfm (next.config.ts) — vanilla @next/mdx would render `| a | b |` as
  // literal text. This proves, in the REAL Next build, that the dashboard
  // sync-status catalog is an actual <table> AND picks up the .help-prose table
  // styling shipped in Chunk 1 (tinted header + token border).
  test("dashboard sync-status renders as a styled .help-prose table (remark-gfm + Chunk-1 styling)", async ({
    page,
  }) => {
    await page.goto("/help/admin/dashboard", { waitUntil: "networkidle" });

    const m = await page.evaluate(() => {
      const table = document.querySelector("main .help-prose table");
      if (!table) return { hasTable: false };
      const th = table.querySelector("thead th");
      const thCs = th ? getComputedStyle(th) : null;
      const bodyRows = table.querySelectorAll("tbody tr").length;
      const headerText = table.querySelector("thead")?.textContent ?? "";
      return {
        hasTable: true,
        bodyRows,
        headerHasStatus: /Status/.test(headerText) && /What to do/.test(headerText),
        thBg: thCs?.backgroundColor ?? "",
        thBorderWidth: thCs ? parseFloat(thCs.borderBottomWidth) : 0,
      };
    });

    expect(m.hasTable, "dashboard must render a real <table> (remark-gfm)").toBe(true);
    expect(m.headerHasStatus, "the sync-status table header is present").toBe(true);
    expect(m.bodyRows, "five sync-status rows").toBe(5);
    // .help-prose th styling (Chunk 1): tinted header fill + a token border.
    expect(m.thBg, "table header has a (non-transparent) tint").not.toBe("rgba(0, 0, 0, 0)");
    expect(m.thBorderWidth, "table cells are bordered").toBeGreaterThan(0);
  });

  // D8: ALL THREE dense 3-column catalogs become labeled stacked cards at
  // ≤480px (thead hidden, each row a block card; the first cell's label is
  // sr-only so its value leads the card, the other cells carry a visible label)
  // and stay a normal table on desktop. Proven in a real browser at BOTH
  // help-docs viewports (webkit 390 + chromium 1280) — jsdom can't do this.
  // (Each iteration also asserts no horizontal overflow, which covers the
  // onboarding Drive-URL inline-<code> overflow-wrap fix.)
  // Onboarding step-3 redesign (2026-06-23): the onboarding-wizard page no longer
  // carries a dense ≥3-column catalog — step 3 is inline review cards now, and
  // the old "Badge / What it means / Your options" 3-col table was removed. Its
  // sole remaining table is the 2-column clean-card outcome table, which is not
  // a stacked (data-stack) catalog. Dashboard + settings keep their 3-col dense
  // catalogs, so they remain the stacked-card coverage here.
  const D8_DENSE_PAGES = [
    { url: "/help/admin/dashboard", firstLabel: "Status" },
    { url: "/help/admin/settings", firstLabel: "Status line" },
  ];
  for (const { url, firstLabel } of D8_DENSE_PAGES) {
    test(`D8: ${url} dense catalog stacks into labeled cards on mobile, stays a table on desktop`, async ({
      page,
    }) => {
      await page.goto(url, { waitUntil: "networkidle" });

      const m = await page.evaluate(() => {
        const table = document.querySelector(
          'main .help-prose table[data-stack="true"]',
        ) as HTMLElement | null;
        if (!table) return { hasStackTable: false as const };
        const thead = table.querySelector("thead")!;
        const tr = table.querySelector("tbody tr")!;
        const labels = Array.from(tr.querySelectorAll(".th-label")) as HTMLElement[];
        const [first, second] = labels;
        return {
          hasStackTable: true as const,
          vw: window.innerWidth,
          theadDisplay: getComputedStyle(thead).display,
          trDisplay: getComputedStyle(tr).display,
          firstLabelText: first?.textContent ?? "",
          firstLabelWidth: first ? Math.round(first.getBoundingClientRect().width) : -1,
          secondLabelText: second?.textContent ?? "",
          secondLabelDisplay: second ? getComputedStyle(second).display : "none",
          secondLabelWidth: second ? Math.round(second.getBoundingClientRect().width) : -1,
          docOverflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });

      expect(m.hasStackTable, `${url}: a dense catalog is tagged data-stack`).toBe(true);
      if (!m.hasStackTable) return;
      expect(m.docOverflow, `${url}: no horizontal overflow`).toBe(false);
      expect(m.firstLabelText, "first cell label is its column header").toBe(firstLabel);
      expect(m.secondLabelText, "second cell label").toBe("What it means");
      if (m.vw <= 480) {
        expect(m.theadDisplay, "thead hidden on mobile").toBe("none");
        expect(m.trDisplay, "each row is a block card on mobile").toBe("block");
        // the non-first label is visibly shown...
        expect(m.secondLabelDisplay, "non-first label shown on mobile").toBe("block");
        expect(m.secondLabelWidth, "non-first label is visible").toBeGreaterThan(1);
        // ...while the first cell's label is sr-only (clipped) so the value is the card heading
        expect(m.firstLabelWidth, "first label is sr-only (visually clipped)").toBeLessThanOrEqual(
          1,
        );
      } else {
        expect(m.theadDisplay, "thead visible on desktop").toBe("table-header-group");
        expect(m.secondLabelDisplay, "labels hidden on desktop (real <th> used)").toBe("none");
      }
    });
  }
});
