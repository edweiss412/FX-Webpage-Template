/**
 * tests/e2e/tap-target-inline-controls.layout.spec.ts
 *
 * Real-browser floor + neighbour-overlap assertions for the FIVE inline text
 * controls the 2026-08-10 decision round classified as CHROME (spec
 * docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md §2). The
 * other three sites in that corpus are exempt inline prose and are pinned in
 * SOURCE by tests/a11y/tapTargetInlineExemptions.test.ts — a rendered box is
 * the wrong instrument for "this stays as it is".
 *
 * Every assertion runs on the PRODUCTION route, driven to the state that
 * renders the control. No test-only transcription of the markup: a copy of the
 * JSX in a fixture would keep passing after the real component changed, which
 * is the exact regression this file exists to catch.
 *
 * The floor is READ FROM THE TOKEN (`--spacing-tap-min`, app/globals.css:179),
 * never hardcoded as 44 — a token change must move the assertion with it.
 *
 * Render premises (spec §6): each site's premise is asserted BEFORE its rect is
 * read, so a seed that stops producing the control fails loudly instead of
 * vacuously passing on an element that is not there.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { cleanupStagedRow, openStep3Modal, seedStagedRow } from "./helpers/devCaptureStaged";

/** Items seeded into the one pack case — must exceed PACK_LIST_ITEMS_CAP (8). */
const PACK_ITEMS = 11;
const DRIVER_PHONE = "+1 555 0100 991";
const DRIVER_EMAIL = "tap.floor.driver@fxav.local";
/** The fixture whose parse yields raw_unrecognized chunks (probed 2026-08-10: 4). */
const UNRECOGNIZED_FIXTURE = "2024-05-east-coast-family-office.md";
/** A width where the sheet card's control cluster sits on the title's row. */
const WIDE_VIEWPORT = { width: 800, height: 900 };

type Rect = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Interactive descendants — lets a caller separate a row from its control. */
  nestedInteractive: number;
};

/** The tap-target floor in px, resolved from the design token at runtime. */
async function tapFloorPx(page: Page): Promise<number> {
  const raw = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--spacing-tap-min").trim(),
  );
  expect(raw, "--spacing-tap-min must resolve to a px length").toMatch(/^[\d.]+px$/);
  const px = Number.parseFloat(raw);
  expect(px).toBeGreaterThan(0);
  return px;
}

/**
 * Every named group's rects, plus `scope`'s own, read in ONE evaluate.
 *
 * Reading them one Locator at a time does NOT work here and the first version
 * of this file was wrong because of it: `boundingBox()` is viewport-relative,
 * and Playwright's actionability check scrolls the element into view, so two
 * successive reads come from two different scroll positions. Comparing rects
 * across that gap reported a 5px "overlap" between rows that are 18px apart in
 * flow. One synchronous evaluate is one layout snapshot, which is the only
 * state in which comparing two rects means anything.
 */
async function rectsWithin(
  scope: Locator,
  selectors: Record<string, string>,
): Promise<{ self: Rect; groups: Record<string, Rect[]> }> {
  return scope.evaluate((root, sels) => {
    const INTERACTIVE = "a, button, input, select, textarea, summary";
    const describe = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute("data-testid") ?? el.tagName.toLowerCase(),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        nestedInteractive: el.querySelectorAll(INTERACTIVE).length,
      };
    };
    const groups: Record<string, Rect[]> = {};
    for (const [name, sel] of Object.entries(sels)) {
      groups[name] = [...root.querySelectorAll(sel)]
        .map(describe)
        .filter((r) => r.width > 0 && r.height > 0);
    }
    return { self: describe(root), groups };
  }, selectors);
}

/**
 * The located element is still the INTERACTIVE control it claims to be.
 *
 * A testid is a label, not a contract. Whole-diff review r1 (finding 2) probed
 * the gap: swap `<button type="submit">` for a `<span>`, keep the testid and the
 * classes, and every floor/colour assertion here reads identical inputs while
 * the control has stopped existing — a 44px box that cannot be activated is a
 * worse outcome than a small one, and it passed silently.
 */
async function assertIsControl(
  locator: Locator,
  expected: { tag: string; type?: string },
  what: string,
): Promise<void> {
  const actual = await locator.evaluate((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type"),
  }));
  expect(actual.tag, `${what}: expected a <${expected.tag}>, found <${actual.tag}>`).toBe(
    expected.tag,
  );
  if (expected.type !== undefined) {
    expect(actual.type, `${what}: expected type="${expected.type}"`).toBe(expected.type);
  }
}

/** The single rect a group must contain — a group of 0 or 2+ is a premise failure. */
function only(group: Rect[] | undefined, what: string): Rect {
  expect(
    group ?? [],
    `${what}: render premise not met (expected exactly one visible element)`,
  ).toHaveLength(1);
  return group![0]!;
}

function assertFloor(rect: Rect, floor: number, what: string): void {
  expect(
    rect.height,
    `${what}: hit target is ${rect.height}px tall, floor is ${floor}px`,
  ).toBeGreaterThanOrEqual(floor);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function assertDisjoint(target: Rect, neighbours: Rect[], what: string): void {
  // A comparison against an empty neighbour set proves nothing, so the premise
  // is asserted rather than assumed.
  expect(
    neighbours.length,
    `${what}: overlap premise — no neighbours to be clear of`,
  ).toBeGreaterThan(0);
  for (const n of neighbours) {
    expect(
      overlaps(target, n),
      `${what}: overlaps "${n.label}" — ${JSON.stringify(target)} vs ${JSON.stringify(n)}`,
    ).toBe(false);
  }
}

/** Navigate to wizard step 3 and wait for the seeded card. Retries the goto:
 *  a sibling actor on the shared local DB can wipe the wizard session between
 *  the seed and the first paint (the openStep3Modal helper retries for the same
 *  reason). CI is isolated and lands on the first attempt. */
async function gotoStep3Card(page: Page, dfid: string): Promise<Locator> {
  const card = page.getByTestId(`wizard-step3-card-${dfid}`);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.goto("/admin?step=3");
    try {
      await expect(card).toBeVisible({ timeout: 5_000 });
      return card;
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(
    `gotoStep3Card final-fail body: ${(await page.innerText("body")).slice(0, 400).replace(/\n/g, "|")}`,
  );
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

test.describe("tap-target floor — repaired inline text controls (spec §2, sites 4-8)", () => {
  test("sites 6/7 — tel: and mailto: contact links clear the floor and stay disjoint", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const dfid = await seedStagedRow({
      variant: "ready",
      title: "Tap Floor Transport Row",
      preview: { driverPhone: DRIVER_PHONE, driverEmail: DRIVER_EMAIL },
    });
    try {
      await openStep3Modal(page, dfid);
      const floor = await tapFloorPx(page);

      const transport = page.getByTestId(`wizard-step3-card-${dfid}-review-section-transport`);
      await expect(transport, "premise: the transport section renders").toBeVisible();

      // Located by the SEEDED values, so the assertion cannot drift onto the
      // other tel:/mailto: pair this component renders (the crew contact rows).
      const { groups } = await rectsWithin(transport, {
        tel: 'a[href^="tel:"]',
        mailto: `a[href="mailto:${DRIVER_EMAIL}"]`,
      });
      const tel = only(groups["tel"], "site 6 (tel: link)");
      const mailto = only(groups["mailto"], "site 7 (mailto: link)");

      assertFloor(tel, floor, "site 6 (tel: link)");
      assertFloor(mailto, floor, "site 7 (mailto: link)");
      // Stacked in one `flex-col gap-1.5` cell: both grew, so both must still fit.
      assertDisjoint(tel, [mailto], "sites 6/7");

      await signOut(page);
    } finally {
      await cleanupStagedRow(dfid);
    }
  });

  test("site 4 — the pack-list overflow toggle clears the floor, shrink-wraps, and stays disjoint", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const dfid = await seedStagedRow({
      variant: "ready",
      title: "Tap Floor Pack Row",
      preview: { packCaseItems: PACK_ITEMS },
    });
    try {
      await openStep3Modal(page, dfid);
      const floor = await tapFloorPx(page);

      const packSection = page.getByTestId(`wizard-step3-card-${dfid}-review-section-packlist`);
      await expect(packSection, "premise: the pack list section renders").toBeVisible();

      // The toggle lives inside a CLOSED disclosure — expand it first, else the
      // measurement reads a hidden element (spec §6, premise for site 4).
      const disclosure = page.getByTestId(`wizard-step3-card-${dfid}-pack-case-0`);
      await expect(disclosure, "premise: the seeded pack case renders").toBeVisible();
      await disclosure.locator("summary").click();

      const toggle = packSection.getByRole("button", { name: `Show all ${PACK_ITEMS} items` });
      await expect(toggle, "premise: the overflow toggle renders").toBeVisible();

      const itemList = toggle.locator("xpath=ancestor::ul[1]");
      const { self: list, groups } = await rectsWithin(itemList, {
        toggle: ":scope > li button",
        rows: ":scope > li",
      });
      const toggleRect = only(groups["toggle"], "site 4 (pack overflow toggle)");
      assertFloor(toggleRect, floor, "site 4 (pack overflow toggle)");

      // `w-fit` is load-bearing (recipe probe P2): without it the control
      // becomes a full-width invisible band across the list.
      expect(
        toggleRect.width,
        `site 4 must shrink-wrap: toggle ${toggleRect.width}px vs list ${list.width}px`,
      ).toBeLessThan(list.width);

      // Neighbour overlap in a `gap-0.5` (2px) list: the tail row has to grow IN
      // FLOW. An inline-level control would instead bleed up over the row above,
      // which is what this catches.
      const itemRows = (groups["rows"] ?? []).filter((r) => r.nestedInteractive === 0);
      assertDisjoint(toggleRect, itemRows, "site 4 (pack overflow toggle)");

      await signOut(page);
    } finally {
      await cleanupStagedRow(dfid);
    }
  });

  test("site 5 — the sheet-title deep link clears the floor without colliding, at 390px and wide", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    // The finalize-demoted variant is the one that renders SheetTitleLink; the
    // ordinary selectable card renders a plain <p> and has no target at all.
    // A SHORT title keeps the one-line case under test (a two-line title clears
    // the floor on its own and would pass vacuously).
    const dfid = await seedStagedRow({ variant: "demoted_rescan", title: "Tap Floor Sheet" });
    try {
      const targetTestId = `wizard-step3-card-${dfid}-title-link`;
      const card = await gotoStep3Card(page, dfid);
      const floor = await tapFloorPx(page);
      await expect(page.getByTestId(targetTestId), "premise: the title link renders").toBeVisible();
      await assertIsControl(
        page.getByTestId(targetTestId),
        { tag: "a" },
        "site 5 (sheet title link)",
      );

      const selectors = {
        target: `[data-testid="${targetTestId}"]`,
        interactive: "a, button, input, select, textarea, summary",
      };

      // 390px: the control cluster wraps full-width BELOW the title, so the
      // -my-2.5 vertical bleed is the live relationship here.
      const narrow = await rectsWithin(card, selectors);
      const narrowTarget = only(narrow.groups["target"], "site 5 (sheet title link, 390px)");
      assertFloor(narrowTarget, floor, "site 5 (sheet title link, 390px)");
      assertDisjoint(
        narrowTarget,
        (narrow.groups["interactive"] ?? []).filter((r) => r.label !== targetTestId),
        "site 5 (sheet title link, 390px)",
      );

      // Wide: the cluster sits on the title's row, so the -mx-2 horizontal
      // bleed into the gap-x-4 column is the live relationship.
      await page.setViewportSize(WIDE_VIEWPORT);
      const wide = await rectsWithin(card, selectors);
      const wideTarget = only(wide.groups["target"], "site 5 (sheet title link, wide)");
      assertFloor(wideTarget, floor, "site 5 (sheet title link, wide)");
      assertDisjoint(
        wideTarget,
        (wide.groups["interactive"] ?? []).filter((r) => r.label !== targetTestId),
        `site 5 (sheet title link, ${WIDE_VIEWPORT.width}px)`,
      );

      await signOut(page);
    } finally {
      await cleanupStagedRow(dfid);
    }
  });

  test("site 8 — the dev-panel Report this button clears the floor, shrink-wraps, and is on-token", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);

    // Premise: a STAGED fixture whose parse carries raw_unrecognized chunks —
    // the page renders the list (and therefore the button) only from a staged
    // dev.pending_syncs row. The POST server action is the only path that
    // stages; the GET is deliberately side-effect free.
    await page.goto("/admin/dev");
    await page.getByTestId("fixture-picker").selectOption(UNRECOGNIZED_FIXTURE);
    await page.getByTestId("parse-and-stage").click();
    await expect(page.getByTestId("raw-unrecognized")).toBeVisible();
    const firstItem = page.getByTestId("raw-unrecognized-item").first();
    await expect(
      firstItem,
      "premise: the fixture staged at least one unrecognized snippet",
    ).toBeVisible();

    const floor = await tapFloorPx(page);
    await assertIsControl(
      page.getByTestId("report-snippet-button").first(),
      { tag: "button", type: "submit" },
      "site 8 (Report this)",
    );
    const { self: row, groups } = await rectsWithin(firstItem, {
      button: '[data-testid="report-snippet-button"]',
    });
    const button = only(groups["button"], "site 8 (Report this)");
    assertFloor(button, floor, "site 8 (Report this)");
    expect(
      button.width,
      `site 8 must shrink-wrap: button ${button.width}px vs row ${row.width}px`,
    ).toBeLessThan(row.width);

    // On-token colour: compared against the RESOLVED token value, not a literal
    // and not a class-name string, so a token retune moves the expectation with
    // it while the off-token `text-blue-700` it replaced still fails.
    const [actual, expected] = await Promise.all([
      page
        .getByTestId("report-snippet-button")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-accent-on-bg)";
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      }),
    ]);
    expect(actual, "site 8 must use the accent-on-bg token, not text-blue-700").toBe(expected);

    await signOut(page);
  });
});
