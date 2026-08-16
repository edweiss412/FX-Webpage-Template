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
/** Seeds the SHORT grid row-mate the `items-start` assertion compares against. */
const SEEDED_VEHICLE = "Sprinter ABC-1042";
/**
 * Spec 2026-08-15-step3-tap-cluster §2.2.3, the compaction contract: a contact
 * cell's ENTIRE non-content vertical budget — `py-2` (16px) + the eyebrow gap
 * (4px) + the name gap (4px) + the phone-to-email chip separation (10px).
 *
 * The number comes from the SPEC, never read back off computed styles, which is
 * what keeps the assertion non-tautological: the render has to match a figure
 * the render did not produce. A later gap or padding regression fails by name,
 * and because the content heights are added in, the bound can never be met by
 * shrinking a tap target instead of the dead space.
 */
const CONTACT_CELL_DEAD_SPACE_PX = 34;
/** Spec §2.3: the derived 10px chip separation, less the suite's 0.5px tolerance. */
const CHIP_CLEARANCE_MIN_PX = 9.5;

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

type StyledRect = Rect & { backgroundColor: string; borderTopWidth: string };

type TransportMeasurement =
  | { ok: false; error: string }
  | {
      ok: true;
      driverCell: StyledRect;
      vehicleCell: StyledRect;
      body: StyledRect;
      eyebrow: StyledRect;
      nameRow: StyledRect;
      tel: StyledRect;
      mailto: StyledRect;
    };

/**
 * ONE layout-and-style snapshot of the seeded transport grid.
 *
 * Same single-`evaluate` rule as `rectsWithin` and for the same reason, with
 * computed `backgroundColor`/`borderTopWidth` read in the SAME pass: the chip
 * treatment (spec 2026-08-15-step3-tap-cluster §2.3) is a geometry change AND a
 * paint change, and reading the two from separate snapshots would let them
 * disagree about which layout they describe.
 *
 * Elements are walked STRUCTURALLY from the production DOM — the grid is
 * whatever ancestor of the seeded `tel:` anchor actually computes to
 * `display: grid`, not a class-name guess — so the measurement follows a
 * refactor instead of quietly measuring nothing after one.
 */
async function measureTransportGrid(
  transport: Locator,
  seed: { email: string; vehicle: string },
): Promise<TransportMeasurement> {
  return transport.evaluate((root, s): TransportMeasurement => {
    const describe = (el: Element, label: string): StyledRect => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        label,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        nestedInteractive: el.querySelectorAll("a, button, input, select, textarea, summary")
          .length,
        backgroundColor: cs.backgroundColor,
        borderTopWidth: cs.borderTopWidth,
      };
    };
    const tel = root.querySelector('a[href^="tel:"]');
    if (!tel)
      return { ok: false, error: "premise: no seeded tel: anchor in the transport section" };
    const mailto = root.querySelector(`a[href="mailto:${s.email}"]`);
    if (!mailto) return { ok: false, error: "premise: no seeded mailto: anchor" };

    let grid: Element | null = tel.parentElement;
    while (grid && getComputedStyle(grid).display !== "grid") grid = grid.parentElement;
    if (!grid) return { ok: false, error: "premise: no display:grid ancestor above the tel: link" };

    const cells = [...grid.children];
    const driverCell = cells.find((c) => c.contains(tel));
    if (!driverCell)
      return { ok: false, error: "premise: the tel: link is not inside a grid cell" };
    // The row-mate: the seeded vehicle cell is the SHORT one, and it carries no
    // anchor — which is what makes it a fair height comparison against a cell
    // whose height is set by two 44px targets.
    const vehicleCell = cells.find(
      (c) => c !== driverCell && (c.textContent ?? "").includes(s.vehicle) && !c.querySelector("a"),
    );
    if (!vehicleCell)
      return { ok: false, error: "premise: no seeded vehicle cell beside the driver cell" };

    const eyebrow = driverCell.children[0];
    const body = driverCell.children[1];
    if (!eyebrow || !body)
      return { ok: false, error: "premise: the driver cell lost its eyebrow/body structure" };
    // The OUTER avatar+name row, never the inner text span: the budget counts
    // the row the cell actually stacks, and the inner span is shorter.
    const nameRow = body.children[0];
    if (!nameRow) return { ok: false, error: "premise: the driver cell body has no name row" };

    return {
      ok: true,
      driverCell: describe(driverCell, "driver cell"),
      vehicleCell: describe(vehicleCell, "vehicle cell"),
      body: describe(body, "driver cell body"),
      eyebrow: describe(eyebrow, "driver cell eyebrow"),
      nameRow: describe(nameRow, "driver name row"),
      tel: describe(tel, "site 6 (tel: chip)"),
      mailto: describe(mailto, "site 7 (mailto: chip)"),
    };
  }, seed);
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

/**
 * The site-5 geometry contract at ONE viewport, in ONE layout snapshot.
 *
 * The title link's hit box bleeds UPWARD ONLY (spec 2026-08-15-step3-tap-cluster
 * §2.1): `pt-5` over the 24.8px `text-base` line box makes the floor, and the
 * absence of bottom padding leaves the box bottom flush with the text bottom.
 * That is what `beneathSelector` pins — the text line directly under the title
 * (the meta line on a demoted card, the warning line on a no-details card) is
 * a NON-interactive neighbour, so the pre-existing interactive-disjointness
 * assertion never looked at it, and the shipped symmetric `-my-2.5 py-2.5`
 * recipe covered it by ~8px and ~6px respectively.
 */
async function assertTitleLinkGeometry(
  card: Locator,
  opts: {
    targetTestId: string;
    beneathSelector: string;
    beneathWhat: string;
    floor: number;
    what: string;
  },
): Promise<void> {
  const { self: cardRect, groups } = await rectsWithin(card, {
    target: `[data-testid="${opts.targetTestId}"]`,
    interactive: "a, button, input, select, textarea, summary",
    beneath: opts.beneathSelector,
  });
  const target = only(groups["target"], opts.what);
  assertFloor(target, opts.floor, opts.what);
  assertDisjoint(
    target,
    (groups["interactive"] ?? []).filter((r) => r.label !== opts.targetTestId),
    opts.what,
  );
  const beneath = only(groups["beneath"], `${opts.what}: ${opts.beneathWhat}`);
  assertDisjoint(target, [beneath], `${opts.what} vs the ${opts.beneathWhat}`);

  // Containment: the 20px of upward bleed is absorbed by the card's own
  // `p-tile-pad` (20px), so the hit box never escapes the card it belongs to.
  expect(
    target.y,
    `${opts.what}: upward bleed leaves the card — target top ${target.y} vs card top ${cardRect.y}`,
  ).toBeGreaterThanOrEqual(cardRect.y - 0.5);
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
      preview: {
        driverPhone: DRIVER_PHONE,
        driverEmail: DRIVER_EMAIL,
        vehicle: SEEDED_VEHICLE,
      },
    });
    try {
      await openStep3Modal(page, dfid);
      const floor = await tapFloorPx(page);

      const transport = page.getByTestId(`wizard-step3-card-${dfid}-review-section-transport`);
      await expect(transport, "premise: the transport section renders").toBeVisible();

      // Located by the SEEDED values, so the assertion cannot drift onto the
      // other tel:/mailto: pair this component renders (the crew contact rows).
      const m = await measureTransportGrid(transport, {
        email: DRIVER_EMAIL,
        vehicle: SEEDED_VEHICLE,
      });
      expect(m.ok, m.ok ? "" : m.error).toBe(true);
      if (!m.ok) return;
      const { tel, mailto, driverCell, vehicleCell, body, eyebrow, nameRow } = m;

      assertFloor(tel, floor, "site 6 (tel: chip)");
      assertFloor(mailto, floor, "site 7 (mailto: chip)");
      // Stacked in one `flex-col` cell: both are at the floor, so both must fit.
      assertDisjoint(tel, [mailto], "sites 6/7");

      // Short cells stay short (spec §3.5). Without `items-start` the grid
      // stretches every item to the tallest in its row, so a one-line Vehicle
      // cell becomes a ~160px panel around ~34px of content.
      expect(
        vehicleCell.height,
        `the short Vehicle cell stretched: ${vehicleCell.height}px vs driver ${driverCell.height}px`,
      ).toBeLessThan(driverCell.height);

      // Dead-space budget (spec §2.2.3) — compaction comes out of the gaps and
      // padding, never out of the two 44px floors, which are added in here.
      const contentHeight = eyebrow.height + nameRow.height + tel.height + mailto.height;
      expect(
        driverCell.height,
        `contact-cell dead space over budget: cell ${driverCell.height}px vs content ${contentHeight}px + ${CONTACT_CELL_DEAD_SPACE_PX}px`,
      ).toBeLessThanOrEqual(contentHeight + CONTACT_CELL_DEAD_SPACE_PX + 1);

      // Separation: two 44px targets 6px apart put "dial the driver mid-show"
      // one thumb-width from "email them".
      expect(
        mailto.y - (tel.y + tel.height),
        `sites 6/7 clearance: ${mailto.y - (tel.y + tel.height)}px, floor is ${CHIP_CLEARANCE_MIN_PX}px`,
      ).toBeGreaterThanOrEqual(CHIP_CLEARANCE_MIN_PX);

      // Full-width chip rows — the deliberate OPPOSITE of the shrink-wrap
      // contract sites 4/8 keep, and what makes 44px read as a row not a void.
      for (const chip of [tel, mailto]) {
        expect(
          Math.abs(chip.width - body.width),
          `${chip.label} must span its container: ${chip.width}px vs ${body.width}px`,
        ).toBeLessThanOrEqual(1);
      }

      // Visible edge at rest, asserted PER CHIP: an asymmetric regression that
      // leaves one of the two invisible fails by name (spec §3.8). Phones cannot
      // hover, so the container IS the affordance.
      for (const chip of [tel, mailto]) {
        // Transparency is checked SEPARATELY from the delta: a fully transparent
        // chip has a computed background that differs from the cell's as a
        // string while painting nothing at all, so the delta alone would be
        // satisfied by the exact state this assertion exists to reject.
        expect(chip.backgroundColor, `${chip.label} must paint a background`).not.toMatch(
          /rgba\([^)]*,\s*0\)$/,
        );
        expect(
          chip.backgroundColor,
          `${chip.label} must be distinguishable from the cell ground`,
        ).not.toBe(driverCell.backgroundColor);
        expect(chip.borderTopWidth, `${chip.label} must carry a visible border`).toBe("1px");
      }

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

      // At-rest affordance (spec 2026-08-15-step3-tap-cluster §2.4). Read with
      // no pointer over the control, so a `hover:underline`-only treatment —
      // 44px of text that looks exactly like the static items above it, on a
      // surface read at venues where nothing can hover — fails here.
      const decoration = await toggle.evaluate((el) => getComputedStyle(el).textDecorationLine);
      expect(decoration, `site 4 must carry an at-rest underline, found "${decoration}"`).toContain(
        "underline",
      );

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

      // The meta line is located by the EXISTING production testid on its client
      // segment (Step3SheetCard.tsx:520); the demoted_rescan seed emits
      // `client_label` (devCaptureStaged.ts:446), so it always renders.
      const geometry = {
        targetTestId,
        beneathSelector: `[data-testid="wizard-step3-card-${dfid}-client"]`,
        beneathWhat: "meta line (client segment)",
        floor,
      };

      // 390px: the control cluster wraps full-width BELOW the title, so the
      // vertical bleed is the live relationship here.
      await assertTitleLinkGeometry(card, {
        ...geometry,
        what: "site 5 (sheet title link, 390px)",
      });

      // Wide: the cluster sits on the title's row, so the -mx-2 horizontal
      // bleed into the gap-x-4 column is the live relationship.
      await page.setViewportSize(WIDE_VIEWPORT);
      await assertTitleLinkGeometry(card, {
        ...geometry,
        what: `site 5 (sheet title link, ${WIDE_VIEWPORT.width}px)`,
      });

      await signOut(page);
    } finally {
      await cleanupStagedRow(dfid);
    }
  });

  test("site 5 (no-details) — the title link clears the floor without covering the warning line", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    // The SECOND seedable SheetTitleLink render site (Step3SheetCard.tsx:456).
    // Its neighbour beneath is a `mt-1` warning line — 4px of clearance against
    // the shipped recipe's 10px downward bleed, so it is the tighter of the two
    // filed overlap contexts and the one a half-fix would still fail.
    const dfid = await seedStagedRow({ variant: "no_details", title: "Tap Floor No Details" });
    try {
      const targetTestId = `wizard-step3-card-${dfid}-title-link`;
      const card = await gotoStep3Card(page, dfid);
      const floor = await tapFloorPx(page);
      await expect(page.getByTestId(targetTestId), "premise: the title link renders").toBeVisible();
      await assertIsControl(
        page.getByTestId(targetTestId),
        { tag: "a" },
        "site 5 (no-details title link)",
      );
      await expect(
        card.locator("p.text-warning-text"),
        "premise: the no-details warning line renders",
      ).toBeVisible();

      const geometry = {
        targetTestId,
        beneathSelector: "p.text-warning-text",
        beneathWhat: "no-details warning line",
        floor,
      };

      await assertTitleLinkGeometry(card, {
        ...geometry,
        what: "site 5 (no-details title link, 390px)",
      });

      await page.setViewportSize(WIDE_VIEWPORT);
      await assertTitleLinkGeometry(card, {
        ...geometry,
        what: `site 5 (no-details title link, ${WIDE_VIEWPORT.width}px)`,
      });

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
