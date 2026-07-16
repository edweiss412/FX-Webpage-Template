# Roles Settings Desktop Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the mock's one-line desktop grid row (`150px | chips | meta | actions`) for `/admin/settings/roles` at ≥760px, per spec `docs/superpowers/specs/2026-07-16-role-vocab-settings-desktop-grid.md`.

**Architecture:** Single-DOM responsive branch inside the existing `RoleMappingRow` client component — mobile keeps the shipped stacked flex card; `min-[760px]:` variants turn the `<li>` into the mock's 4-column grid (header wrapper dissolves via `min-[760px]:contents`, cells get explicit `col-start`/`row-start-1`, panels span `col-span-4`). Page container bumps `max-w-2xl` → `max-w-3xl`. Edit button gets a constant `aria-label` + two `aria-hidden` responsive label spans.

**Tech Stack:** Next.js 16 / React client component, Tailwind v4 arbitrary variants, Vitest + jsdom (component), Playwright desktop-chromium (real-browser layout).

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-16-role-vocab-settings-desktop-grid.md`. Compare rendered output against the mock's Desktop width section (`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Roles You've Added.dc.html:179-226`) throughout.
- NO base (non-`min-[760px]:`-prefixed) CLASS edits in `RoleMappingRow.tsx`. Non-visual ATTRIBUTE additions (`data-testid`, `title`, `aria-label`, `aria-hidden`) and the Edit-button content restructure are allowed — they change no computed layout. AC-2 (mobile layout unchanged) is guaranteed by construction.
- NO global `md:` breakpoint (`app/globals.css:222-231`). Only `min-[760px]:` arbitrary variants.
- Every user-visible string flows through `components/admin/roleRecognizeCopy.ts` (copy-hygiene meta-test scans these files; `data-testid`/`aria-label`-from-COPY/`title`-from-data are fine — string literals are stripped before the raw-JSX-text scan).
- jsdom computes no layout and applies no Tailwind — every dimensional assertion lives in the Playwright spec, never in Vitest.
- TDD per task; commit per task (`feat(admin):` / `test(admin):` scope); `--no-verify` on commits (worktree; run prettier/eslint manually in Task 3).
- All commands run from the worktree root `/Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid` (use `git -C`, absolute paths; harness cwd resets between compound commands).
- Meta-test inventory (declared): none created or extended — no new Supabase call boundary in app code, no advisory locks (`pg_advisory*` untouched), no admin-alert codes, no email normalization, no new mutation surfaces. The only new Supabase calls are in the Playwright spec's seed block (test scope, invariant-9 destructure-and-throw style, not subject to `tests/auth/_metaInfraContract.test.ts`).

---

### Task 1: Copy constant + Edit-button aria-label/dual-span + token title (component TDD)

**Files:**
- Modify: `components/admin/roleRecognizeCopy.ts` (add `EDIT_LABEL_SHORT` next to `EDIT_LABEL`, currently line 64)
- Modify: `app/admin/settings/roles/RoleMappingRow.tsx:137-139` (token/meta testids + title), `:169-176` (actions div testid + Edit button restructure)
- Test: `tests/components/roleMappingSettingsRows.test.tsx` (additive describe block only — no existing assertion edited)

**Interfaces:**
- Produces: `COPY.EDIT_LABEL_SHORT === "Edit"`; stable testids `role-mapping-token`, `role-mapping-meta`, `role-mapping-chips`, `role-mapping-actions`, `role-mapping-edit-label-long`, `role-mapping-edit-label-short` (Task 2's Playwright spec consumes all of these).

- [ ] **Step 1: Write the failing tests** — append this describe block at the end of `tests/components/roleMappingSettingsRows.test.tsx`:

```tsx
describe("RoleMappingRow — desktop label mechanics (spec 2026-07-16 §4)", () => {
  it("EDIT_LABEL_SHORT is the mock's short label", () => {
    expect(COPY.EDIT_LABEL_SHORT).toBe("Edit");
  });

  it("Edit button: constant aria-label, EXACTLY one per row, two aria-hidden label spans", () => {
    render(
      <ul>
        <RoleMappingRow row={row()} />
      </ul>,
    );
    // Exactly one — a duplicated (even aria-hidden) actionable subtree must fail here.
    const buttons = screen.getAllByRole("button", { name: COPY.EDIT_LABEL });
    expect(buttons).toHaveLength(1);
    const button = buttons[0];
    expect(button).toHaveAttribute("aria-label", COPY.EDIT_LABEL);
    const long = screen.getByTestId("role-mapping-edit-label-long");
    const short = screen.getByTestId("role-mapping-edit-label-short");
    expect(button).toContainElement(long);
    expect(button).toContainElement(short);
    expect(long).toHaveTextContent(COPY.EDIT_LABEL);
    expect(short).toHaveTextContent(COPY.EDIT_LABEL_SHORT);
    expect(long).toHaveAttribute("aria-hidden", "true");
    expect(short).toHaveAttribute("aria-hidden", "true");
    // Responsive visibility classes (structural pin only — real visibility is e2e's job).
    expect(long.className).toContain("min-[760px]:hidden");
    expect(short.className).toMatch(/(?:^| )hidden(?: |$)/);
    expect(short.className).toContain("min-[760px]:inline");
  });

  it("clicking the restructured Edit button still opens the edit panel (handler intact)", () => {
    render(
      <ul>
        <RoleMappingRow row={row()} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: COPY.EDIT_LABEL }));
    expect(screen.getByText(COPY.PANEL_HEADING)).toBeInTheDocument();
  });

  it("token renders the full value with an unconditional title attribute", () => {
    render(
      <ul>
        <RoleMappingRow row={row()} />
      </ul>,
    );
    const token = screen.getByTestId("role-mapping-token");
    expect(token).toHaveTextContent("DRONE OP");
    expect(token).toHaveAttribute("title", "DRONE OP");
  });
});
```

Note: `COPY.EDIT_LABEL_SHORT` does not exist yet — TypeScript may flag it; that IS the red state. Do not add `// @ts-expect-error`.

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid && pnpm exec vitest run tests/components/roleMappingSettingsRows.test.tsx`
Expected: FAIL — `EDIT_LABEL_SHORT` undefined; `toHaveAttribute("aria-label", …)` fails; `getByTestId("role-mapping-edit-label-long")` not found; `getByTestId("role-mapping-token")` not found. Every PRE-EXISTING test in the file must still PASS.

- [ ] **Step 3: Minimal implementation**

`components/admin/roleRecognizeCopy.ts` — directly below `EDIT_LABEL` (line 64):

```ts
/** Desktop (≥760px) short Edit label — mock "Desktop width" section (spec 2026-07-16 §2). */
export const EDIT_LABEL_SHORT = "Edit";
```

`app/admin/settings/roles/RoleMappingRow.tsx` — the header block (lines 137-140) becomes:

```tsx
      <div className="flex items-baseline justify-between gap-2">
        <span
          data-testid="role-mapping-token"
          title={row.token}
          className="text-sm font-semibold text-text-strong"
        >
          {row.token}
        </span>
        <span
          data-testid="role-mapping-meta"
          className="whitespace-nowrap text-[11px] text-text-subtle"
        >
          {meta}
        </span>
      </div>
```

The view-mode chips container (line 144) gains `data-testid="role-mapping-chips"`:

```tsx
          <div data-testid="role-mapping-chips" className="flex flex-wrap gap-1.5">
```

The view-mode actions block (lines 169-176) becomes:

```tsx
          <div data-testid="role-mapping-actions" className="flex items-center gap-2">
            <button
              type="button"
              onClick={startEdit}
              aria-label={COPY.EDIT_LABEL}
              className={outlineBtn}
            >
              <span
                aria-hidden="true"
                data-testid="role-mapping-edit-label-long"
                className="min-[760px]:hidden"
              >
                {COPY.EDIT_LABEL}
              </span>
              <span
                aria-hidden="true"
                data-testid="role-mapping-edit-label-short"
                className="hidden min-[760px]:inline"
              >
                {COPY.EDIT_LABEL_SHORT}
              </span>
            </button>
            <button type="button" onClick={startConfirm} className={ghostBtn}>
              {COPY.REMOVE_LABEL}
            </button>
          </div>
```

No other line changes in this task.

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid && pnpm exec vitest run tests/components/roleMappingSettingsRows.test.tsx`
Expected: PASS — all pre-existing + 4 new tests.

- [ ] **Step 5: Transition audit (spec §4 inventory — verify, no code)**

Confirm by reading the diff: the `popIn` animation classes on the edit panel (line ~191) and confirm panel (line ~278) are untouched; no `AnimatePresence`/exit animations exist in this file; the only new visual states are CSS media variants (instant by design per the spec's transition inventory). Record "transition audit clean" in the commit body.

- [ ] **Step 6: Commit**

```bash
git -C /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid add -A
git -C /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid commit --no-verify -m "feat(admin): roles settings Edit button aria-label + dual responsive label spans

Transition audit clean: popIn panels untouched, breakpoint swap is pure CSS."
```

---

### Task 2: Desktop grid layout + container bump + real-browser layout spec (e2e TDD)

**Files:**
- Test (create): `tests/e2e/roles-settings-layout.spec.ts`
- Modify: `playwright.config.ts:71` (add `roles-settings-layout` to the desktop-chromium `testMatch` alternation)
- Modify: `app/admin/settings/roles/RoleMappingRow.tsx` (grid classes), `app/admin/settings/roles/page.tsx:30` (`max-w-3xl`)

**Interfaces:**
- Consumes: Task 1's testids and `COPY.EDIT_LABEL_SHORT`.
- Produces: nothing downstream; this is the layout-dimensions gate.

- [ ] **Step 1: Write the failing Playwright spec**

Create `tests/e2e/roles-settings-layout.spec.ts`:

```ts
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
const FIXTURES: MappingRow[] = [
  {
    token: "DRONE OP",
    grants: ["A1", "V1"],
    decided_by: "seed-roles-layout@example.com",
    decided_at: "2026-06-12T12:00:00.000Z",
    updated_at: "2026-06-12T12:00:00.000Z",
  },
  {
    token: "SOUND TECH",
    grants: ["A1", "FINANCIALS"],
    decided_by: "seed-roles-layout@example.com",
    decided_at: "2026-04-03T12:00:00.000Z",
    updated_at: "2026-04-03T12:00:00.000Z",
  },
  {
    token: "STAGE RIGGER",
    grants: [],
    decided_by: "seed-roles-layout@example.com",
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
    // snapshot NOW — afterAll is not guaranteed when beforeAll throws.
    if (snapshot.length > 0) await admin.from("role_token_mappings").insert(snapshot);
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
  return { ...box, right: box.x + box.width, bottom: box.y + box.height, cy: box.y + box.height / 2 };
}

test.describe("roles settings — desktop one-line grid (≥760px)", () => {
  test("each row lays out as one grid line: 150px token | chips | meta | right-aligned actions", async ({ page }) => {
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
      expect(Math.abs(liRect.height - expectedHeight)).toBeLessThanOrEqual(1);
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

  test("edit panel spans the full row content width (col-span-4) and survives a resize", async ({ page }) => {
    await gotoRolesSettings(page, 1280, 900);
    const firstRow = page.getByTestId("role-mapping-row").first();
    await firstRow.getByRole("button", { name: COPY.EDIT_LABEL }).click();
    const checkbox = firstRow.getByTestId("role-mapping-check-L1");
    await checkbox.check();

    const liRect = await rect(firstRow);
    const { paddingLeft, paddingRight, borderLeftWidth, borderRightWidth } = await firstRow.evaluate(
      (el) => {
        const cs = getComputedStyle(el);
        return {
          paddingLeft: Number.parseFloat(cs.paddingLeft),
          paddingRight: Number.parseFloat(cs.paddingRight),
          borderLeftWidth: Number.parseFloat(cs.borderLeftWidth),
          borderRightWidth: Number.parseFloat(cs.borderRightWidth),
        };
      },
    );
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

  test("confirm panel and saved-confirm status also span the full row content width", async ({ page }) => {
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
```

- [ ] **Step 2: Register the spec + run to verify RED**

In `playwright.config.ts:71`, add `roles-settings-layout` to the desktop-chromium alternation — change `…|admin-settings-admins-refresh|…` to `…|admin-settings-admins-refresh|roles-settings-layout|…` (one filename added; the project matches an explicit list, an unregistered spec silently never runs — spec §6.2 Registration).

Run: `cd /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid && pnpm exec playwright test --project=desktop-chromium roles-settings-layout`
Expected RED, with the failures attributable to LAYOUT (not harness gaps): the cell testids (`role-mapping-token`/`-meta`/`-chips`/`-actions`/`-edit-label-*`) already exist from Task 1, so the first desktop test runs its geometry and FAILS on the vertical-center + main-width (672 ≠ 768) + token-width assertions; the label-swap test FAILS on span visibility (no responsive CSS active... both spans follow their classes — long visible, short hidden via base `hidden`, so specifically `toBeHidden()` on the long span fails); the panel tests FAIL earlier on the not-yet-added `role-mapping-edit-panel`/`role-mapping-confirm-panel` testids (harness-gap failures — acceptable ONLY for these two tests). The mobile describe should PASS already (stacked is current behavior). Confirm the geometry failures are present before proceeding.

- [ ] **Step 3: Implement the grid**

`app/admin/settings/roles/RoleMappingRow.tsx` — exact class/attribute changes (base classes untouched):

1. `<li>` (Task-1 state, originally lines 133-136):

```tsx
    <li
      data-testid="role-mapping-row"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 min-[760px]:grid min-[760px]:grid-cols-[150px_1fr_auto_auto] min-[760px]:items-center min-[760px]:gap-x-4 min-[760px]:gap-y-2 min-[760px]:px-3.5 min-[760px]:py-2"
    >
```

2. Header wrapper div: `className="flex items-baseline justify-between gap-2 min-[760px]:contents"` (dissolves at ≥760px so token/meta become grid items; safe — plain layout div, no ARIA role).

3. Token span className gains ` min-[760px]:col-start-1 min-[760px]:row-start-1 min-[760px]:truncate` (150px track; long tokens ellipsize at desktop only — `title` from Task 1 carries the full value).

4. Meta span className gains ` min-[760px]:col-start-3 min-[760px]:row-start-1`.

5. Chips container className gains ` min-[760px]:col-start-2 min-[760px]:row-start-1`.

6. Actions container className gains ` min-[760px]:col-start-4 min-[760px]:row-start-1`.

7. Full-width sub-rows gain ` min-[760px]:col-span-4` on their outer element: the `savedConfirm` `<p>` (line ~177), the edit-panel `<div>` (line ~190 — also gains `data-testid="role-mapping-edit-panel"`), the confirm-panel `<div>` (line ~277 — also gains `data-testid="role-mapping-confirm-panel"`).

`app/admin/settings/roles/page.tsx:30`: `max-w-2xl` → `max-w-3xl`.

- [ ] **Step 4: Run to verify GREEN**

Run: `cd /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid && pnpm exec playwright test --project=desktop-chromium roles-settings-layout`
Expected: PASS (4 tests). Then re-run the component suite (grid classes must not disturb jsdom semantics): `pnpm exec vitest run tests/components/roleMappingSettingsRows.test.tsx` — PASS.

- [ ] **Step 5: Visual mock comparison (spec AC-1 review obligation)**

Load the mock file (`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Roles You've Added.dc.html`, Desktop width section) and the live page at 1280px side by side (screenshot via `pnpm exec playwright test --project=desktop-chromium roles-settings-layout --trace on` artifacts or a manual browser). Verify: column proportions, right-aligned actions, short Edit label, chip/meta typography. Note any divergence for the impeccable run (Task 4).

- [ ] **Step 6: Commit**

```bash
git -C /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid add -A
git -C /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid commit --no-verify -m "feat(admin): roles settings desktop one-line grid rows + max-w-3xl container

Real-browser layout gate: tests/e2e/roles-settings-layout.spec.ts (registered in
desktop-chromium testMatch). Mock: 2026-07-15-extend-role-scope-vocab-mock Desktop width."
```

---

### Task 3: Full local gates

**Files:** none (verification only; fix-forward any failure it surfaces inside this task).

- [ ] **Step 1: Unit suite** — `cd /Users/ericweiss/fxav-worktrees/feat-role-vocab-desktop-grid && pnpm test` → Expected: PASS (shared-chokepoint rule: scoped runs are not sufficient).
- [ ] **Step 2: Typecheck** — `pnpm typecheck` → PASS (vitest strips types; `next build`/CI would catch what vitest misses).
- [ ] **Step 3: Lint** — `pnpm lint` → PASS (canonical-Tailwind rule is ERROR-level in CI).
- [ ] **Step 4: Format** — `pnpm format:check` → PASS (`--no-verify` bypassed the prettier hook; run `pnpm format` first if it flags the new files, then re-check).
- [ ] **Step 5: Build** — `pnpm build` → PASS (client/server boundary + canonical build gate).
- [ ] **Step 6: Structural meta-tests touching edited surfaces** — `pnpm exec vitest run tests/messages/_metaCatalogCopyHygiene.test.ts` → PASS (new `EDIT_LABEL_SHORT` export + restructured JSX are inside its scan).
- [ ] **Step 7: Commit any fixes** — if steps 1-6 required changes: `git -C … commit --no-verify -m "fix(admin): <what the gate surfaced>"`. If everything passed with no diff, no commit.

---

### Task 4: Impeccable dual-gate (invariant 8)

**Files:** possibly `RoleMappingRow.tsx` / `page.tsx` (finding fixes); `DEFERRED.md` (only if a P0/P1 is explicitly deferred).

- [ ] **Step 1:** Run `/impeccable critique` on the diff (canonical v3 setup gates: `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read). Anchor the critique against the mock's Desktop width section per spec AC-1.
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix every P0/P1 in-diff (re-running Task 2's Playwright spec + Task 1's component suite after each fix), or record an explicit deferral in `DEFERRED.md` with trigger + backlog ref. P2/P3 may defer without a DEFERRED.md entry only if noted in the close-out summary.
- [ ] **Step 4:** Commit: `git -C … commit --no-verify -m "fix(admin): impeccable dual-gate fixes — roles desktop grid"` (or note "dual-gate clean, no diff").
