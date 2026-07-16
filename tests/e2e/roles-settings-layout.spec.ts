/**
 * tests/e2e/roles-settings-layout.spec.ts — real-browser dimensional gate for the
 * roles settings desktop grid (spec 2026-07-16-role-vocab-settings-desktop-grid §6.2).
 *
 * WHY A REAL BROWSER: jsdom computes no layout and applies no Tailwind; this
 * project's Tailwind v4 does not default `.flex` to `align-items: stretch`
 * (AGENTS.md). Every dimensional invariant below reads getBoundingClientRect()
 * against the live render.
 *
 * Seed hygiene (spec §6.2): role_token_mappings is a GLOBAL table — snapshot all
 * rows in beforeAll, replace with the 3 mock-mirroring fixtures, restore the
 * snapshot verbatim in afterAll. Order-independent under Playwright workers:1.
 *
 * ANTI-TAUTOLOGY: expected values derive from measured rects + computed styles
 * and the spec's two design literals (150px token column, 768px max-w-3xl cap);
 * nothing is copied from sibling assertions.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./helpers/signInAs";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { admin } from "./helpers/supabaseAdmin";
import * as COPY from "@/components/admin/roleRecognizeCopy";

const TOLERANCE = 0.5;

type MappingRow = {
  token: string;
  grants: string[];
  decided_by: string;
  decided_at: string;
  updated_at: string;
};

// Mirrors the mock triple (spec §6.2): 2 grants / financial grant / empty grants.
// Every row is nominal one-line (≤2 chips). CHECK constraints: token upper/trim
// ≤64; grants ⊆ {A1,V1,L1,FINANCIALS}; decided_by canonical lowercase email.
// decided_by = the signed-in admin fixture so the meta cell renders the compact
// "You · <date>" label (mock's nominal case). A foreign email renders verbatim in
// the auto meta column and can legitimately squeeze the 1fr chips track until
// chips wrap — allowed guard behavior, but NOT the one-line case this fixture pins.
const FIXTURES: MappingRow[] = [
  {
    token: "DRONE OP",
    grants: ["A1", "V1"],
    decided_by: ADMIN_FIXTURE.email,
    decided_at: "2026-06-12T12:00:00.000Z",
    updated_at: "2026-06-12T12:00:00.000Z",
  },
  {
    token: "SOUND TECH",
    grants: ["A1", "FINANCIALS"],
    decided_by: ADMIN_FIXTURE.email,
    decided_at: "2026-04-03T12:00:00.000Z",
    updated_at: "2026-04-03T12:00:00.000Z",
  },
  {
    token: "STAGE RIGGER",
    grants: [],
    decided_by: ADMIN_FIXTURE.email,
    decided_at: "2026-05-30T12:00:00.000Z",
    updated_at: "2026-05-30T12:00:00.000Z",
  },
];

let snapshot: MappingRow[] = [];

test.beforeAll(async () => {
  const { data, error } = await admin.from("role_token_mappings").select("*");
  if (error) throw new Error(`snapshot select failed: ${error.message}`);
  snapshot = (data ?? []) as MappingRow[];
  const { error: delErr } = await admin.from("role_token_mappings").delete().neq("token", "");
  if (delErr) throw new Error(`pre-seed delete failed: ${delErr.message}`);
  const { error: insErr } = await admin.from("role_token_mappings").insert(FIXTURES);
  if (insErr) {
    // Failure-atomic hygiene: if seeding fails after the delete, restore the
    // snapshot NOW — afterAll is not guaranteed when beforeAll throws. The
    // restore itself follows invariant 9: a silent restore failure must never
    // masquerade as "table left as found".
    if (snapshot.length > 0) {
      const { error: restoreErr } = await admin.from("role_token_mappings").insert(snapshot);
      if (restoreErr) {
        throw new Error(
          `fixture insert failed AND snapshot restore failed — role_token_mappings is left EMPTY, restore manually: insert=${insErr.message}; restore=${restoreErr.message}`,
        );
      }
    }
    throw new Error(`fixture insert failed: ${insErr.message}`);
  }
});

test.afterAll(async () => {
  const { error: delErr } = await admin.from("role_token_mappings").delete().neq("token", "");
  if (delErr) throw new Error(`post-spec delete failed: ${delErr.message}`);
  if (snapshot.length > 0) {
    const { error: insErr } = await admin.from("role_token_mappings").insert(snapshot);
    if (insErr) throw new Error(`snapshot restore failed: ${insErr.message}`);
  }
});

async function gotoRolesSettings(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await signInAs(page, ADMIN_FIXTURE);
  await page.goto("/admin/settings/roles");
  await expect(page.getByTestId("role-mapping-row")).toHaveCount(FIXTURES.length);
}

async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no bounding box for ${String(locator)}`);
  return {
    ...box,
    right: box.x + box.width,
    bottom: box.y + box.height,
    cy: box.y + box.height / 2,
  };
}

test.describe("roles settings — desktop one-line grid (≥760px)", () => {
  test("each row lays out as one grid line: 150px token | chips | meta | right-aligned actions", async ({
    page,
  }) => {
    await gotoRolesSettings(page, 1280, 900);

    // max-w-3xl container proof (spec AC-4): border-box width 768px at a 1280 viewport.
    const main = await rect(page.locator("main"));
    expect(Math.abs(main.width - 768)).toBeLessThanOrEqual(1);

    const rows = page.getByTestId("role-mapping-row");
    for (let i = 0; i < FIXTURES.length; i++) {
      const li = rows.nth(i);
      const liRect = await rect(li);
      const token = await rect(li.getByTestId("role-mapping-token"));
      const chips = await rect(li.getByTestId("role-mapping-chips"));
      const meta = await rect(li.getByTestId("role-mapping-meta"));
      const actions = await rect(li.getByTestId("role-mapping-actions"));

      // One grid line: all four cells share a vertical center (items-center).
      for (const cell of [chips, meta, actions]) {
        expect(Math.abs(cell.cy - token.cy)).toBeLessThanOrEqual(TOLERANCE);
      }
      // Column order: token < chips < meta < actions on the x axis.
      expect(token.right).toBeLessThanOrEqual(chips.x + TOLERANCE);
      expect(chips.right).toBeLessThanOrEqual(meta.x + TOLERANCE);
      expect(meta.right).toBeLessThanOrEqual(actions.x + TOLERANCE);
      // Token column is the mock's 150px fixed track.
      expect(Math.abs(token.width - 150)).toBeLessThanOrEqual(TOLERANCE);

      // Right-aligned actions: right edge == row CONTENT right edge, derived from
      // computed style (rects are border-box) — spec §6.2 definition.
      const { paddingRight, borderRightWidth } = await li.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          paddingRight: Number.parseFloat(cs.paddingRight),
          borderRightWidth: Number.parseFloat(cs.borderRightWidth),
        };
      });
      const contentRight = liRect.right - borderRightWidth - paddingRight;
      expect(Math.abs(actions.right - contentRight)).toBeLessThanOrEqual(1);

      // One-line row height: li height == actions cell height + vertical padding +
      // borders (derived, not hardcoded) — fails if any cell wrapped to row 2.
      // FIXTURE-SCOPED: every fixture row is deliberately nominal one-line (<=2
      // chips, spec §6.2), so this is AC-1's compact-case proof. The spec's
      // many-chip guard (chips wrap, row grows) is allowed behavior but is NOT
      // seeded here — do not add a many-chip fixture to this test.
      const { paddingTop, paddingBottom, borderTopWidth, borderBottomWidth } = await li.evaluate(
        (el) => {
          const cs = getComputedStyle(el);
          return {
            paddingTop: Number.parseFloat(cs.paddingTop),
            paddingBottom: Number.parseFloat(cs.paddingBottom),
            borderTopWidth: Number.parseFloat(cs.borderTopWidth),
            borderBottomWidth: Number.parseFloat(cs.borderBottomWidth),
          };
        },
      );
      const expectedHeight =
        actions.height + paddingTop + paddingBottom + borderTopWidth + borderBottomWidth;
      const debug = await li.evaluate((el) => {
        const cs = getComputedStyle(el);
        const kids = Array.from(el.children).map((c) => {
          const r = (c as HTMLElement).getBoundingClientRect();
          return `${(c as HTMLElement).dataset.testid ?? c.tagName}:h=${r.height} y=${r.y}`;
        });
        const chipsEl = el.querySelector('[data-testid="role-mapping-chips"]');
        const chipKids = chipsEl
          ? Array.from(chipsEl.children)
              .map((c) => `${(c as HTMLElement).textContent}:w=${(c as HTMLElement).getBoundingClientRect().width}`)
              .join(",")
          : "";
        return `rows=${cs.gridTemplateRows} cols=${cs.gridTemplateColumns} liW=${el.getBoundingClientRect().width} chipsW=${chipsEl?.getBoundingClientRect().width} chips=[${chipKids}] display=${cs.display} kids=[${kids.join(" | ")}]`;
      });
      expect(Math.abs(liRect.height - expectedHeight), `row ${i} ${debug}`).toBeLessThanOrEqual(1);
    }
  });

  test("desktop shows the short Edit label; accessible name stays constant", async ({ page }) => {
    await gotoRolesSettings(page, 1280, 900);
    const firstRow = page.getByTestId("role-mapping-row").first();
    await expect(firstRow.getByTestId("role-mapping-edit-label-short")).toBeVisible();
    await expect(firstRow.getByTestId("role-mapping-edit-label-long")).toBeHidden();
    // Accessible-name contract (spec §4): aria-label wins at every width.
    await expect(firstRow.getByRole("button", { name: COPY.EDIT_LABEL })).toBeVisible();
  });

  test("edit panel spans the full row content width (col-span-4) and survives a resize", async ({
    page,
  }) => {
    await gotoRolesSettings(page, 1280, 900);
    const firstRow = page.getByTestId("role-mapping-row").first();
    await firstRow.getByRole("button", { name: COPY.EDIT_LABEL }).click();
    const checkbox = firstRow.getByTestId("role-mapping-check-L1");
    await checkbox.check();

    const liRect = await rect(firstRow);
    const { paddingLeft, paddingRight, borderLeftWidth, borderRightWidth } =
      await firstRow.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          paddingLeft: Number.parseFloat(cs.paddingLeft),
          paddingRight: Number.parseFloat(cs.paddingRight),
          borderLeftWidth: Number.parseFloat(cs.borderLeftWidth),
          borderRightWidth: Number.parseFloat(cs.borderRightWidth),
        };
      });
    const contentWidth =
      liRect.width - paddingLeft - paddingRight - borderLeftWidth - borderRightWidth;
    // Grid mechanics: a col-span-4 item's grid area = all 4 tracks + the 3
    // column gaps = the grid container's content box; default justify-self
    // stretch makes the item's border-box fill that area exactly.
    const panel = await rect(firstRow.getByTestId("role-mapping-edit-panel"));
    expect(Math.abs(panel.width - contentWidth)).toBeLessThanOrEqual(1);

    // Compound transition (spec §4 inventory): breakpoint change mid-edit keeps
    // React state — panel still open, checkbox still checked, layout reflows only.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(firstRow.getByTestId("role-mapping-edit-panel")).toBeVisible();
    await expect(checkbox).toBeChecked();
  });

  test("confirm panel and saved-confirm status also span the full row content width", async ({
    page,
  }) => {
    await gotoRolesSettings(page, 1280, 900);
    const firstRow = page.getByTestId("role-mapping-row").first();
    const contentWidth = async () => {
      const liRect = await rect(firstRow);
      const pads = await firstRow.evaluate((el) => {
        const cs = getComputedStyle(el);
        return (
          Number.parseFloat(cs.paddingLeft) +
          Number.parseFloat(cs.paddingRight) +
          Number.parseFloat(cs.borderLeftWidth) +
          Number.parseFloat(cs.borderRightWidth)
        );
      });
      return liRect.width - pads;
    };

    // Confirm panel (col-span-4).
    await firstRow.getByRole("button", { name: COPY.REMOVE_LABEL }).click();
    const confirm = await rect(firstRow.getByText(COPY.REMOVE_CONFIRM));
    // The copy <p> sits inside the panel; measure the panel via the testid.
    const confirmPanel = await rect(firstRow.getByTestId("role-mapping-confirm-panel"));
    expect(confirm.width).toBeLessThanOrEqual(confirmPanel.width);
    expect(Math.abs(confirmPanel.width - (await contentWidth()))).toBeLessThanOrEqual(1);
    await firstRow.getByRole("button", { name: COPY.REMOVE_KEEP }).click();

    // Saved-confirm status (col-span-4): set-equal save is idempotent ok — the
    // real server action runs against the seeded row and returns to view with
    // the transient confirmation (existing testid role-mapping-saved-confirm).
    await firstRow.getByRole("button", { name: COPY.EDIT_LABEL }).click();
    await firstRow.getByTestId("role-mapping-save").click();
    const saved = firstRow.getByTestId("role-mapping-saved-confirm");
    await expect(saved).toBeVisible();
    expect(Math.abs((await rect(saved)).width - (await contentWidth()))).toBeLessThanOrEqual(1);
  });
});

test.describe("roles settings — stacked mobile card (<760px)", () => {
  test("card stacks vertically and shows the long Edit label", async ({ page }) => {
    await gotoRolesSettings(page, 390, 900);
    const firstRow = page.getByTestId("role-mapping-row").first();
    const token = await rect(firstRow.getByTestId("role-mapping-token"));
    const chips = await rect(firstRow.getByTestId("role-mapping-chips"));
    const actions = await rect(firstRow.getByTestId("role-mapping-actions"));
    // Stacked order proof (spec AC-2): the chips block starts below the ENTIRE
    // header row. token.bottom <= header.bottom always (token is the header's
    // tallest child at text-sm vs text-[11px] meta), so chips.y >= token.bottom
    // is implied by the current stacked layout and fails if the grid leaked
    // below 760px. 1px tolerance for baseline rounding.
    expect(chips.y).toBeGreaterThanOrEqual(token.bottom - 1);
    expect(actions.y).toBeGreaterThanOrEqual(chips.bottom - 1);
    await expect(firstRow.getByTestId("role-mapping-edit-label-long")).toBeVisible();
    await expect(firstRow.getByTestId("role-mapping-edit-label-short")).toBeHidden();
    await expect(firstRow.getByRole("button", { name: COPY.EDIT_LABEL })).toBeVisible();
  });
});
