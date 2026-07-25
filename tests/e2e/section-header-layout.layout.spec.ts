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

/**
 * T2 — the centring contract, measured rather than restated.
 *
 * The rebuilt header centres the name + count between a left icon and a right
 * corner link. A section with NO link (Diagrams, "Report an issue", the defensive
 * empty-dfid states) would centre its name 15px further right if nothing replaced
 * the link's slot, so `pr-header-link-slot` reserves it.
 *
 * WHY THIS IS NOT A RESTATEMENT OF THE CSS: every number below is READ FROM THE
 * RENDER, and the token's value is derived twice by two independent routes that
 * must agree.
 *
 *   route 1 (no-link cells) — the reserved padding must equal the link box plus
 *     the row gap, since that is exactly what disappears when the link does.
 *   route 2 (every cell)    — the ink's centre must sit `(icon - link) / 2` right
 *     of the row's centre. The icon is wider than the link, so a PERFECTLY centred
 *     group is not the contract; symmetry with the link-bearing case is.
 *
 * A hardcoded `30` would satisfy neither: route 1 recomputes it from two other
 * measurements, and route 2 never mentions it.
 *
 * The centre is taken from the rendered INK (the union of the name's text rects
 * and the count chip), not from the flex container's box. The box is centred by
 * construction — asserting on it would pass with `justify-start` on a name that
 * happens to fill the row. The ink is what the eye judges.
 */
const CENTRING_TOLERANCE_PX = 1;

for (const viewport of [320, 375, 430, 1280] as const) {
  test(`header centring @ ${viewport}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: Math.max(viewport, 900), height: 900 });

    const measured: Array<{
      cell: string;
      hasLink: boolean;
      iconWidth: number;
      linkWidth: number | null;
      padRight: number;
      rowGap: number;
      inkCentre: number;
      rowCentre: number;
    }> = [];

    for (const spec of MATRIX) {
      await page.goto(`${baseUrl}${spec.cell}-${viewport}.html`, { waitUntil: "load" });
      const m = await page.evaluate(
        ({ cell }) => {
          const root = document.querySelector(`[data-cell="${cell}"]`);
          if (!(root instanceof HTMLElement)) return { error: `cell root not found: ${cell}` };
          const icon = root.querySelector('span[aria-hidden="true"]');
          const row = icon?.parentElement;
          if (!(icon instanceof HTMLElement) || !(row instanceof HTMLElement)) {
            return { error: "icon/row not found" };
          }
          const heading = root.querySelector("h3, h4");
          if (!(heading instanceof HTMLElement)) return { error: "heading not found" };
          const group = heading.parentElement;
          if (!(group instanceof HTMLElement)) return { error: "centred group not found" };
          const link = root.querySelector("a[href]");

          // Ink extent: the name's own text rects plus the count chip, if present.
          const rects: DOMRect[] = [];
          for (const n of Array.from(heading.childNodes)) {
            if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? "").trim() === "") continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            rects.push(...Array.from(r.getClientRects()).filter((x) => x.width > 0.5));
          }
          const countEl = Array.from(root.querySelectorAll("span")).find((el) =>
            /^\(\d+\)$/.test((el.textContent ?? "").trim()),
          );
          if (countEl instanceof HTMLElement) rects.push(countEl.getBoundingClientRect());
          if (rects.length === 0) return { error: "no ink measured" };

          const rowRect = row.getBoundingClientRect();
          const rowCs = getComputedStyle(row);
          const groupCs = getComputedStyle(group);
          return {
            error: null,
            hasLink: link !== null,
            iconWidth: icon.getBoundingClientRect().width,
            linkWidth: link instanceof HTMLElement ? link.getBoundingClientRect().width : null,
            padRight: parseFloat(groupCs.paddingRight || "0"),
            rowGap: parseFloat(rowCs.columnGap || "0"),
            inkCentre:
              (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2,
            // Content-box centre: the row's own padding must not read as slack.
            rowCentre:
              (rowRect.left +
                parseFloat(rowCs.paddingLeft || "0") +
                (rowRect.right - parseFloat(rowCs.paddingRight || "0"))) /
              2,
          };
        },
        { cell: spec.cell },
      );

      expect(m.error, `${spec.cell} fixture shape`).toBeNull();
      if (m.error !== null) return;
      measured.push({ cell: spec.cell, ...m } as (typeof measured)[number]);
    }

    expect(measured.length, "every matrix cell measured").toBe(MATRIX.length);

    // The link box is one width across every cell that has one — established here
    // so the rest of the test can treat it as the reserve without assuming a value.
    const linkWidths = [
      ...new Set(measured.filter((m) => m.linkWidth !== null).map((m) => m.linkWidth!)),
    ];
    expect(
      linkWidths.length,
      `one link box width across link cells, saw ${linkWidths.join("/")}`,
    ).toBe(1);
    const linkWidth = linkWidths[0]!;
    expect(linkWidth, "the corner link renders a real box").toBeGreaterThan(0);

    // Route 1 — the reserve, recomputed. Link cells reserve nothing; the rest
    // reserve exactly what the link plus its gap occupied.
    for (const m of measured) {
      if (m.hasLink) {
        expect(m.padRight, `${m.cell}: a link cell reserves no extra slot`).toBeCloseTo(0, 1);
      } else {
        expect(
          m.padRight,
          `${m.cell}: the reserved slot is the link box (${linkWidth}px) plus the row gap (${m.rowGap}px)`,
        ).toBeCloseTo(linkWidth + m.rowGap, 1);
      }
    }

    // Route 2 — the ink lands on one axis regardless of whether a link renders.
    for (const m of measured) {
      const expected = (m.iconWidth - linkWidth) / 2;
      const actual = m.inkCentre - m.rowCentre;
      expect(
        Math.abs(actual - expected),
        `${m.cell} @ ${viewport}: name+count sits (icon ${m.iconWidth} - link ${linkWidth}) / 2 = ` +
          `${expected.toFixed(2)}px right of centre, measured ${actual.toFixed(2)}px`,
      ).toBeLessThan(CENTRING_TOLERANCE_PX);
    }

    // And the cross-check the two routes exist for: cells sharing an icon size land
    // on the SAME offset whether or not they carry a link. This is the assertion
    // that fails if `pr-header-link-slot` is dropped — route 2 would fail with it,
    // but only this one names the link/no-link pair as the thing being compared.
    const byIcon = new Map<number, number[]>();
    for (const m of measured) {
      const key = Math.round(m.iconWidth);
      byIcon.set(key, [...(byIcon.get(key) ?? []), m.inkCentre - m.rowCentre]);
    }
    for (const [icon, offsets] of byIcon) {
      const spread = Math.max(...offsets) - Math.min(...offsets);
      expect(
        spread,
        `icon ${icon}px: every cell centres on one axis, link or not (spread ${spread.toFixed(2)}px)`,
      ).toBeLessThan(CENTRING_TOLERANCE_PX * 2);
    }
  });
}

/**
 * T2 — the corner link's tap target, proven by HIT TESTING rather than by geometry.
 *
 * The link paints a 20px icon and expands its hit area with a `::before` overlay
 * (`before:absolute before:-inset-3`). `getBoundingClientRect()` CANNOT see that:
 * a pseudo-element contributes no box to its host's rect, so a rect-based check
 * would report 20px and fail a passing implementation — or, worse, pass a broken
 * one that grew the icon instead of the target.
 *
 * `elementFromPoint` is the oracle because it answers the question a thumb asks.
 */
const TAP_MIN_PX = 44;

test("corner link carries a 44px tap target @ 375", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto(`${baseUrl}G1-clean-375.html`, { waitUntil: "load" });

  const m = await page.evaluate((tapMin) => {
    const link = document.querySelector('[data-cell="G1-clean"] a[href]');
    if (!(link instanceof HTMLElement)) return { error: "corner link not found" };
    const r = link.getBoundingClientRect();
    // The overlay's own box, read from the pseudo-element's resolved inset rather
    // than assumed: -inset-3 on a 20px icon is 44px, but the check must fail if the
    // token changes underneath it.
    const inset = parseFloat(getComputedStyle(link, "::before").insetBlockStart || "0");
    const box = {
      left: r.left + inset,
      top: r.top + inset,
      right: r.right - inset,
      bottom: r.bottom - inset,
    };
    const probe = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit === link || (hit instanceof Node && link.contains(hit));
    };
    return {
      error: null,
      iconWidth: r.width,
      targetWidth: box.right - box.left,
      targetHeight: box.bottom - box.top,
      // Viewport coordinates, which is what elementFromPoint takes. Corners are
      // inset 1px so a rounding difference does not probe the pixel outside.
      corners: [
        probe(box.left + 1, box.top + 1),
        probe(box.right - 1, box.top + 1),
        probe(box.left + 1, box.bottom - 1),
        probe(box.right - 1, box.bottom - 1),
      ],
      centre: probe((box.left + box.right) / 2, (box.top + box.bottom) / 2),
      // Just outside the expanded box: proves the target is bounded, so a full-row
      // overlay swallowing neighbouring clicks reads as a failure, not a pass.
      outside: probe(box.left - 3, (box.top + box.bottom) / 2),
    };
  }, TAP_MIN_PX);

  expect(m.error, "fixture shape").toBeNull();
  if (m.error !== null) return;

  expect(m.iconWidth, "the PAINTED icon stays small — the target grows, not the glyph").toBeCloseTo(
    20,
    0,
  );
  expect(m.targetWidth, `tap target width >= ${TAP_MIN_PX}px`).toBeGreaterThanOrEqual(TAP_MIN_PX);
  expect(m.targetHeight, `tap target height >= ${TAP_MIN_PX}px`).toBeGreaterThanOrEqual(TAP_MIN_PX);
  expect(m.corners, "all four corners of the expanded target hit the link").toEqual([
    true,
    true,
    true,
    true,
  ]);
  expect(m.centre, "the target's centre hits the link").toBe(true);
  expect(m.outside, "the target does not extend past its own expanded box").toBe(false);
});

/**
 * T2 — the transition audit for spec §8.
 *
 * §8 enumerates 12 reachable states / 66 pairs and resolves every one of them to
 * the SAME treatment: instant, no animation. A table saying "instant" proves
 * nothing on its own, so this is the executable half, in two parts.
 *
 * PART 1 — nothing in the header subtree may animate geometry. §8's uniform
 * "instant" verdict holds only while no transition is attached to a property that
 * moves a box, and `transition-all` added anywhere below the header would break
 * all 66 pairs at once while looking like a one-line hover polish. The sweep walks
 * every element AND its `::before`/`::after`, because the sheet link's tap target
 * IS a pseudo-element and a transition there is invisible to an element-only walk.
 * Colour-family properties are allowed — §8's last row deliberately keeps
 * `transition-colors duration-fast` on the link.
 *
 * PART 2 — both header heights belong to ONE MOUNTED node. Rounds 1 and 2 both
 * flagged that the header changes in place: `key={showId}` remounts only when the
 * SHOW changes, so `router.refresh()` reconciles a new pill or count under the
 * same key (spec §8). The 44px and 72.8px figures the matrix asserts are measured
 * on separately-loaded pages, which cannot distinguish "two states of one header"
 * from "two headers" — this toggles the pill on a live node and gets both.
 *
 * WHAT PART 2 DOES NOT PROVE, established by mutation rather than assumed: it is
 * NOT the guard against an attached transition. Adding `transition-all` to the
 * header leaves this test green, because the height is `auto` and CSS does not
 * transition auto heights. Part 1 caught that mutation; this one caught a fixed
 * `min-height`, where the pill's presence stops driving the height at all and the
 * 72.8px figure becomes a coincidence. Two mechanisms, two tests.
 */
const ANIMATABLE_LAYOUT_PROPS = [
  "all",
  "height",
  "width",
  "inline-size",
  "block-size",
  "margin",
  "padding",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "transform",
  "translate",
  "scale",
  "opacity",
  "flex",
  "gap",
  "font-size",
  "line-height",
];

test("transition audit: no geometry transition anywhere in the header subtree", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 900, height: 900 });

  const offenders: string[] = [];
  for (const spec of MATRIX) {
    await page.goto(`${baseUrl}${spec.cell}-375.html`, { waitUntil: "load" });
    const found = await page.evaluate(
      ({ cell, banned }) => {
        const root = document.querySelector(`[data-cell="${cell}"]`);
        if (!(root instanceof HTMLElement)) return { error: `cell root not found: ${cell}` };
        const icon = root.querySelector('span[aria-hidden="true"]');
        const header = icon?.parentElement?.parentElement;
        if (!(header instanceof HTMLElement)) return { error: "header block not found" };

        const bad: string[] = [];
        const check = (el: Element, pseudo: string | null) => {
          const cs = getComputedStyle(el, pseudo);
          const where = pseudo ? `${el.tagName.toLowerCase()}${pseudo}` : el.tagName.toLowerCase();
          const label = `${where}[${(el.className || "").toString().slice(0, 40)}]`;

          // A KEYFRAME animation is a separate mechanism the transition sweep below
          // cannot see: `animate-pulse` on the pill would animate its appearance with
          // `transition-property: none`. §8 admits neither, so both are checked here.
          if (cs.animationName !== "none" && parseFloat(cs.animationDuration || "0") > 0) {
            bad.push(`${label} runs keyframe animation ${cs.animationName}`);
          }

          if (cs.transitionProperty === "none" || parseFloat(cs.transitionDuration || "0") === 0) {
            return;
          }
          const props = cs.transitionProperty.split(",").map((p) => p.trim());
          for (const p of props) {
            if (!banned.some((b) => p === b || p.startsWith(`${b}-`))) continue;
            bad.push(`${label} transitions ${p}`);
          }
        };
        for (const el of [header, ...Array.from(header.querySelectorAll("*"))]) {
          check(el, null);
          check(el, "::before");
          check(el, "::after");
        }
        return { error: null, bad };
      },
      { cell: spec.cell, banned: ANIMATABLE_LAYOUT_PROPS },
    );

    expect(found.error, `${spec.cell} fixture shape`).toBeNull();
    if (found.error !== null) return;
    offenders.push(...found.bad.map((b) => `${spec.cell}: ${b}`));
  }

  expect(
    offenders,
    "spec §8 resolves all 66 state pairs to instant; a geometry transition here breaks every one",
  ).toEqual([]);
});

test("transition audit: the header snaps when its pill changes on a mounted node", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto(`${baseUrl}G1-flagged-375.html`, { waitUntil: "load" });

  const m = await page.evaluate(() => {
    const root = document.querySelector('[data-cell="G1-flagged"]');
    if (!(root instanceof HTMLElement)) return { error: "cell root not found" };
    const icon = root.querySelector('span[aria-hidden="true"]');
    const header = icon?.parentElement?.parentElement;
    if (!(header instanceof HTMLElement)) return { error: "header block not found" };
    const pillRow = root.querySelector('[class*="rounded-pill"]')?.parentElement;
    if (!(pillRow instanceof HTMLElement)) return { error: "pill row not found" };

    const h = () => Math.round(header.getBoundingClientRect().height * 100) / 100;
    const withPill = h();
    // Measured in the SAME task as the mutation: a transitioned height would still
    // read its start value here, so an already-final number is the proof.
    pillRow.style.display = "none";
    const withoutPill = h();
    pillRow.style.display = "";
    const restored = h();
    return { error: null, withPill, withoutPill, restored };
  });

  expect(m.error, "fixture shape").toBeNull();
  if (m.error !== null) return;

  expect(m.withPill, "flagged header starts at its two-row height").toBeCloseTo(
    HEADER_WITH_PILL_PX,
    0,
  );
  expect(
    m.withoutPill,
    "removing the pill collapses to the one-line height in the same task, not on a later frame",
  ).toBeCloseTo(HEADER_LINE_PX, 0);
  expect(
    m.restored,
    "restoring the pill grows back in the same task — instant in BOTH directions",
  ).toBeCloseTo(HEADER_WITH_PILL_PX, 0);
});
