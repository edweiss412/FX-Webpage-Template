/**
 * Section-header layout probe — real browser, no dev server, no database.
 *
 * Runs under tests/e2e/standalone.config.ts, whose `testMatch` is an explicit
 * allow-list: this file's name must appear there or it runs nowhere and silently
 * proves nothing.
 *
 * Contains so far:
 *   - T4 `hairline floor @ 240px row`: the decorative rule in the event-detail
 *     group row. Spec §3.2 chose a floor rather than a breakpoint because the rule
 *     never collapses in the supported range — measured 22.94px at the narrowest
 *     real row (240px), reaching 0 only at rows <=215px. `width > 0` and "the label
 *     does not wrap" therefore BOTH pass on the no-floor tree, so the assertion
 *     that makes this task red is the resolved `min-width`.
 *
 * The 15 matrix cases and the transition audit land in T2.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REPO_ROOT = join(__dirname, "..", "..");

/** Deterministic env for the harness subprocess: `lib/email/hashForLog.ts` throws at
 *  import without a 32+ char pepper, and the standalone config does not load
 *  `.env.local`, so these are supplied rather than assumed present. */
const HARNESS_ENV = {
  ...process.env,
  HASH_FOR_LOG_PEPPER: "fxav-section-header-harness-pepper-32-chars-min",
  JWT_SIGNING_SECRET: "fxav-section-header-harness-jwt-secret-32-min",
};

/** The floor T4 applies, asserted as a resolved pixel value. `min-w-4` is 16px on
 *  the project's 4px spacing scale — NOT `min-w-6` (24px), which exceeds the 22.94px
 *  the rule actually gets at a 240px row and would bind, wrapping the label. */
const EXPECTED_MIN_WIDTH_PX = 16;

let server: Server;
let baseUrl = "";
let workDir = "";

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "section-header-layout-"));

  // Render the REAL component tree to static markup OUTSIDE Playwright's loader.
  const cellsJson = join(workDir, "cells.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_sectionHeaderCellHarness.tsx"), cellsJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000, env: HARNESS_ENV },
  );
  const cells = JSON.parse(readFileSync(cellsJson, "utf8")) as {
    dfid: string;
    narrowestRowPx: number;
    hairline: string;
    rowWidths: Record<string, number>;
    cells: Record<string, Record<string, string>>;
  };
  expect(Object.keys(cells.cells).length, "harness emitted all 15 matrix cells").toBe(15);
  expect(cells.hairline, "harness emitted the hairline fixture").toBeTruthy();

  const pageOf = (markup: string) =>
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<link rel="stylesheet" href="out.css"></head><body class="bg-bg">${markup}</body></html>`;

  const sources = [join(workDir, "hairline.html")];
  writeFileSync(join(workDir, "hairline.html"), pageOf(cells.hairline));
  for (const [cell, perWidth] of Object.entries(cells.cells)) {
    for (const [viewport, markup] of Object.entries(perWidth)) {
      const file = join(workDir, `${cell}-${viewport}.html`);
      writeFileSync(file, pageOf(markup));
      sources.push(file);
    }
  }

  // Compile the real token CSS so computed styles are the product's, not defaults.
  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    `${sources.map((f) => `@source "${f}";`).join("\n")}\n` +
      readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"),
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "hairline.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(body);
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

async function openHairline(page: Page) {
  // Reduced motion so entrance animation cannot perturb geometry. T2's transition
  // cases deliberately run with NORMAL motion, in their own group.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(`${baseUrl}hairline.html`, { waitUntil: "load" });
}

test("hairline floor @ 240px row", async ({ page }) => {
  await openHairline(page);

  const measured = await page.evaluate(() => {
    // Structural selection, deliberately: no production `data-testid` is added
    // ahead of this test. The rule is the `h-px` span that is the next element
    // sibling of the eyebrow label carrying the group title.
    const label = Array.from(document.querySelectorAll("span")).find((el) =>
      (el.textContent ?? "").trim().startsWith("Wardrobe"),
    );
    if (!label) return { error: "group title label not found" };
    const rule = label.nextElementSibling;
    if (!(rule instanceof HTMLElement)) return { error: "rule sibling not found" };

    const cs = getComputedStyle(rule);
    const labelCs = getComputedStyle(label);
    const lineHeight = parseFloat(labelCs.lineHeight);

    return {
      error: null,
      ruleWidth: Math.round(rule.getBoundingClientRect().width * 100) / 100,
      // A string like "16px" — parsed, never compared as text.
      minWidthPx: parseFloat(cs.minWidth),
      labelHeight: Math.round(label.getBoundingClientRect().height * 100) / 100,
      labelLineHeight: Number.isFinite(lineHeight) ? lineHeight : 0,
    };
  });

  expect(measured.error, "fixture shape").toBeNull();
  if (measured.error !== null) return;

  // (a) The rule is DRAWN. A permanently hidden rule would satisfy the phantom-gap
  //     probes while violating the intent, so this stays asserted.
  expect(measured.ruleWidth, "decorative rule is drawn at the narrowest real row").toBeGreaterThan(
    0,
  );

  // (b) THE RED ASSERTION. `width > 0` alone passes on today's no-floor tree
  //     (22.94px), so without this the task could not go red at all.
  expect(measured.minWidthPx, "resolved min-width is exactly min-w-4 (16px)").toBeCloseTo(
    EXPECTED_MIN_WIDTH_PX,
    1,
  );

  // (c) The label does NOT wrap — the property that rules `min-w-6` out, since 24px
  //     exceeds the width actually available and would push the label to two lines.
  //     Derived from the label's own line-height, never a hardcoded height.
  expect(
    measured.labelHeight,
    `group title stays on one line (h=${measured.labelHeight}, lh=${measured.labelLineHeight})`,
  ).toBeLessThan(measured.labelLineHeight * 1.5);
});

/**
 * T2 — the 15-cell header matrix, at the four measured widths.
 *
 * CELL MEMBERSHIP IS ASSERTED FIRST, before any geometry. Every cell carries a
 * distinct heading text and its expected link/pill/heading-level identity, so 15
 * copies of one fixture cannot be labelled as 15 cells — otherwise the metadata,
 * not the render, would be the oracle.
 */
const MATRIX = [
  { cell: "G1-clean", heading: "Rooms & scope", level: 3, count: "(4)", link: true, pill: "none" },
  {
    cell: "G1-flagged",
    heading: "Sheet warnings",
    level: 3,
    count: "(128)",
    link: true,
    pill: "amber",
  },
  { cell: "G1-judgment", heading: "Contacts", level: 3, count: "(4)", link: true, pill: "info" },
  { cell: "G2-clean", heading: "Venue", level: 3, count: null, link: true, pill: "none" },
  {
    cell: "G2-flagged",
    heading: "Crew schedule",
    level: 3,
    count: null,
    link: true,
    pill: "amber",
  },
  {
    cell: "G2-judgment",
    heading: "Billing & docs",
    level: 3,
    count: null,
    link: true,
    pill: "info",
  },
  {
    cell: "G3-clean",
    heading: "Report an issue",
    level: 3,
    count: null,
    link: false,
    pill: "none",
  },
  { cell: "G4-clean", heading: "Diagrams", level: 4, count: null, link: false, pill: "none" },
  {
    cell: "G5-clean",
    heading: "Standalone partial",
    level: 3,
    count: null,
    link: false,
    pill: "none",
  },
  {
    cell: "G6a-clean",
    heading: "Rooms (A)",
    level: 3,
    count: "(4)",
    link: false,
    pill: "none",
  },
  {
    cell: "G6a-flagged",
    heading: "Rooms (B)",
    level: 3,
    count: "(4)",
    link: false,
    pill: "amber",
  },
  {
    cell: "G6a-judgment",
    heading: "Rooms (C)",
    level: 3,
    count: "(4)",
    link: false,
    pill: "info",
  },
  {
    cell: "G6b-clean",
    heading: "Venue (A)",
    level: 3,
    count: null,
    link: false,
    pill: "none",
  },
  {
    cell: "G6b-flagged",
    heading: "Venue (B)",
    level: 3,
    count: null,
    link: false,
    pill: "amber",
  },
  {
    cell: "G6b-judgment",
    heading: "Venue (C)",
    level: 3,
    count: null,
    link: false,
    pill: "info",
  },
] as const;

/** Heights the rebuilt header must hold, per spec §3.1.4. */
const HEADER_LINE_PX = 44;
const HEADER_WITH_PILL_PX = 72.8;

for (const spec of MATRIX) {
  for (const viewport of [320, 375, 430, 1280] as const) {
    test(`section-header ${spec.cell} @ ${viewport}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: Math.max(viewport, 900), height: 900 });
      await page.goto(`${baseUrl}${spec.cell}-${viewport}.html`, { waitUntil: "load" });

      const m = await page.evaluate(
        ({ cell, headingText }) => {
          const root = document.querySelector(`[data-cell="${cell}"]`);
          if (!(root instanceof HTMLElement)) return { error: `cell root not found: ${cell}` };
          const heading = root.querySelector("h3, h4");
          if (!(heading instanceof HTMLElement)) return { error: "heading not found" };

          // The name's own TEXT node, never the heading box: the box is inflated by
          // the inline link and reports one line even when the text wraps.
          const textNode = Array.from(heading.childNodes).find(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
          );
          let lines = 0;
          if (textNode) {
            const range = document.createRange();
            range.selectNodeContents(textNode);
            lines = Array.from(range.getClientRects()).filter((r) => r.width > 0.5).length;
          }

          // The count is a SIBLING of the heading, not inside it — deliberate, so the
          // heading's accessible name is the section name alone. Read it from the row.
          const countEl = Array.from(root.querySelectorAll("span")).find((el) =>
            /^\(\d+\)$/.test((el.textContent ?? "").trim()),
          );
          const countText = (countEl?.textContent ?? "").trim();

          const pill = root.querySelector('[class*="rounded-pill"]');
          const pillText = (pill?.textContent ?? "").trim();
          // The header LINE is the row holding the icon; the whole header is the
          // outer block above the panel card.
          const iconChip = root.querySelector('span[aria-hidden="true"]');
          const headerLine = iconChip?.parentElement ?? null;
          const outer = headerLine?.parentElement ?? null;

          return {
            error: null,
            tag: heading.tagName.toLowerCase(),
            countText,
            headingText: (heading.textContent ?? "").replace(/\s+/g, " ").trim(),
            hasExpectedHeading: (heading.textContent ?? "").includes(headingText),
            lines,
            hasLink: root.querySelector("a[href]") !== null,
            pillText,
            headerLineHeight:
              headerLine instanceof HTMLElement
                ? Math.round(headerLine.getBoundingClientRect().height * 100) / 100
                : 0,
            outerHeight:
              outer instanceof HTMLElement
                ? Math.round(outer.getBoundingClientRect().height * 100) / 100
                : 0,
          };
        },
        { cell: spec.cell, headingText: spec.heading },
      );

      expect(m.error, "fixture shape").toBeNull();
      if (m.error !== null) return;

      // --- Cell membership, before any geometry ---
      expect(m.hasExpectedHeading, `${spec.cell} renders its own distinct heading`).toBe(true);
      expect(m.tag, `${spec.cell} heading level`).toBe(spec.level === 4 ? "h4" : "h3");
      expect(m.hasLink, `${spec.cell} link presence`).toBe(spec.link);
      if (spec.pill === "none") {
        expect(m.pillText, `${spec.cell} renders no pill`).toBe("");
      } else if (spec.pill === "amber") {
        expect(m.pillText, `${spec.cell} renders the amber flag pill`).toBe("Needs a look");
      } else {
        expect(m.pillText, `${spec.cell} renders the calm judgment pill`).toBe(
          "Parsed with judgment",
        );
      }
      expect(m.countText, `${spec.cell} count chip`).toBe(spec.count ?? "");

      // --- Geometry: the contract the rebuild exists to hold ---
      expect(m.lines, `${spec.cell} @ ${viewport}: the section name occupies ONE text line`).toBe(
        1,
      );
      expect(
        m.headerLineHeight,
        `${spec.cell} @ ${viewport}: the header LINE stays ${HEADER_LINE_PX}px in every state`,
      ).toBeCloseTo(HEADER_LINE_PX, 0);
      expect(
        m.outerHeight,
        `${spec.cell} @ ${viewport}: whole header is ${spec.pill === "none" ? HEADER_LINE_PX : HEADER_WITH_PILL_PX}px`,
      ).toBeCloseTo(spec.pill === "none" ? HEADER_LINE_PX : HEADER_WITH_PILL_PX, 0);
    });
  }
}
