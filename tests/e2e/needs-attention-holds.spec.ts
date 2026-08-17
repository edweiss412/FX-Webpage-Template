/**
 * tests/e2e/needs-attention-holds.spec.ts (holds rollup Task 10 — plan §Task 10)
 *
 * Seeded end-to-end proof that OPEN MI-11 identity holds surface as a fourth
 * needs-attention stream: cards on /admin/needs-attention, the AdminNav badge,
 * the mobile summary-card chip, the multi-hold disclosure, and clear-through
 * (rejecting the only hold removes the card and decrements the badge).
 *
 * Seeds sync_holds DIRECTLY (the materializer only produces single-hold shows,
 * so it cannot reach the multi-hold card) with four shows:
 *   1. active, ONE mi11_pending          → single-hold card
 *   2. active, THREE mi11_pending        → multi-hold card + disclosure
 *   3. active, ONE undo_override         → NO card (a reader that ignored the
 *      kind filter would add a visible card here — spec §9.8)
 *   4. ARCHIVED, one mi11_pending        → NO card (spec R6 archived filter)
 *
 * Failure modes caught that unit tests cannot: the reader's kind/archived
 * filters (mocked clients never see a filter); the badge count double-counting
 * a multi-hold show; a client island that never hydrates; a rejected hold
 * leaving a stale card behind.
 *
 * Requires the e2e env (server on E2E_PORT with TEST_DATABASE_URL → local
 * Supabase). Every fixture row is namespaced by prefix and pre-cleaned.
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { admin } from "./helpers/supabaseAdmin";
import { awaitReviewModalOrRecover, openShowReviewModal } from "./helpers/openShowReviewModal";

const MOBILE = { width: 390, height: 844 };

const FIXTURE_PREFIX = "e2e-needs-attention-holds-";

function holdId(n: number): string {
  return `88888888-8888-4888-8888-${String(n).padStart(12, "0")}`;
}
const slugOf = (n: number) => `${FIXTURE_PREFIX}show-${n}`;
const driveOf = (n: number) => `${FIXTURE_PREFIX}drive-${n}`;

// Show rows are seeded through the shared helper (it owns the service-role
// shows/crew/share-token writes and its own create-or-replace pre-clean), so
// this spec adds NO unlocked PostgREST DML on a locked table. Ids come back
// from the seed and are keyed by fixture number for the assertions below.
const showIds = new Map<number, string>();
function showId(n: number): string {
  const id = showIds.get(n);
  if (!id) throw new Error(`show ${n} was not seeded`);
  return id;
}

// The MI-11 gate's optimistic-concurrency token: the reject RPC compares this
// EXACTLY against the row's base_modified_time, so the seed and the hidden form
// field must round-trip the same value.
const BASE_MODIFIED = "2026-08-01T00:00:00+00:00";

async function seedShow({ n, archived }: { n: number; archived: boolean }): Promise<void> {
  const seeded = await seedShowWithCrew({
    driveFileId: driveOf(n),
    slug: slugOf(n),
    title: `Holds e2e show ${n}`,
    clientLabel: "Holds e2e",
    archived,
    published: !archived,
    crew: [],
  });
  showIds.set(n, seeded.showId);
}

/**
 * One sync_holds row. `mi11_pending` carries the canonical email_change
 * disposition — `name` is REQUIRED by lib/sync/holds/types.ts and the gate UI
 * reads it for its accessible control names — plus a non-null
 * base_modified_time (sync_holds_kind_shape_chk). `undo_override` must carry a
 * NULL proposed_value under the same CHECK.
 */
async function seedHold(opts: {
  id: string;
  show: number;
  entityKey: string;
  domain: "crew_email" | "crew_identity";
  kind: "mi11_pending" | "undo_override";
  createdAt?: string;
}): Promise<void> {
  const pending = opts.kind === "mi11_pending";
  const { error } = await admin.from("sync_holds").insert({
    id: opts.id,
    show_id: showId(opts.show),
    drive_file_id: driveOf(opts.show),
    domain: opts.domain,
    entity_key: opts.entityKey,
    held_value: { email: "old@x.com" },
    proposed_value: pending
      ? { disposition: "email_change", name: opts.entityKey, email: "new@x.com" }
      : null,
    base_modified_time: pending ? BASE_MODIFIED : null,
    kind: opts.kind,
    created_by: "e2e",
    ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
  });
  if (error) throw new Error(`sync_holds fixture insert failed: ${error.message}`);
}

async function seedFixtures(): Promise<void> {
  await seedShow({ n: 1, archived: false });
  await seedShow({ n: 2, archived: false });
  await seedShow({ n: 3, archived: false });
  await seedShow({ n: 4, archived: true });

  await seedHold({
    id: holdId(1),
    show: 1,
    entityKey: "Ann Poe",
    domain: "crew_email",
    kind: "mi11_pending",
  });
  // Three holds on show 2 — distinct entity_keys satisfy the
  // (show_id, domain, entity_key) uniqueness even where the domain repeats.
  await seedHold({
    id: holdId(21),
    show: 2,
    entityKey: "Bob Roe",
    domain: "crew_email",
    kind: "mi11_pending",
  });
  await seedHold({
    id: holdId(22),
    show: 2,
    entityKey: "Cara Doe",
    domain: "crew_identity",
    kind: "mi11_pending",
  });
  await seedHold({
    id: holdId(23),
    show: 2,
    entityKey: "Dev Loe",
    domain: "crew_email",
    kind: "mi11_pending",
  });
  // Show 3 holds ONLY an undo_override: in-scope table, out-of-scope kind.
  await seedHold({
    id: holdId(3),
    show: 3,
    entityKey: "Eve Moe",
    domain: "crew_email",
    kind: "undo_override",
  });
  // Show 4 is archived: an in-scope hold on an out-of-scope show.
  await seedHold({
    id: holdId(4),
    show: 4,
    entityKey: "Fay Noe",
    domain: "crew_email",
    kind: "mi11_pending",
  });
}

async function cleanupFixtures(): Promise<void> {
  // sync_holds cascades from shows (ON DELETE CASCADE), but clear it first so a
  // partially-seeded run still cleans: its rows carry the prefixed drive_file_id
  // even when no show row survived. sync_holds is not a locked table.
  const { error } = await admin
    .from("sync_holds")
    .delete()
    .like("drive_file_id", `${FIXTURE_PREFIX}%`);
  if (error) throw new Error(`sync_holds fixture cleanup failed: ${error.message}`);
  // Shows go through the helper's own service-role delete.
  for (const n of [1, 2, 3, 4]) await deleteSeededShow(driveOf(n));
  showIds.clear();
}

/**
 * Hydration gate for a CLIENT ONCLICK handler (the disclosure toggle). React
 * attaches component props onto the DOM node under a `__reactProps$…` key once
 * the tree has hydrated; a gesture before that does nothing.
 */
async function waitForHydration(page: Page, testId: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((tid) => {
          const el = document.querySelector(`[data-testid="${tid}"]`) as
            | (Element & Record<string, { onClick?: unknown }>)
            | null;
          if (!el) return false;
          return Object.keys(el).some(
            (k) => k.startsWith("__reactProps$") && typeof el[k]?.onClick === "function",
          );
        }, testId),
      { message: `${testId} hydrated (React onClick attached)`, timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Badge / chip counts are asserted as DELTAS against a pre-seed baseline, never
 * as absolutes: this local database is shared with every other suite, and an
 * unrelated open hold (or a pending row) left by a neighbour would make an
 * absolute "2" fail for a reason that has nothing to do with this feature. The
 * delta is also the sharper assertion — it is exactly the semantic under test
 * (two held SHOWS carrying four holds must move the count by 2, not 4).
 */
async function readBadge(page: Page): Promise<number> {
  const badge = page.getByTestId("admin-attention-badge");
  if ((await badge.count()) === 0) return 0; // no badge renders at zero
  const text = (await badge.innerText()).trim();
  if (text.endsWith("+"))
    throw new Error(`badge is capped ("${text}") - baseline too high to test a delta`);
  return Number.parseInt(text, 10);
}

async function readHeldChip(page: Page): Promise<number> {
  const chip = page.getByTestId("summary-chip-identity-holds");
  if ((await chip.count()) === 0) return 0; // chip renders only above zero
  const text = (await chip.innerText()).trim();
  return Number.parseInt(text.replace(/\s*held$/, ""), 10);
}

/**
 * Hydration gate for a SERVER-ACTION FORM. The MI-11 gate buttons carry their own
 * `onClick` (it records which action was submitted), so gating on the BUTTON says
 * nothing about whether the form's action dispatch is wired yet — the two hydrate
 * independently. That gap is not theoretical: on CI the reject click landed with
 * the button hydrated and the form not, the submit did nothing, and the assertion
 * burned its full 15s before the retry passed. Gate on the FORM's own action prop.
 */
async function waitForFormAction(page: Page, buttonTestId: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((tid) => {
          const btn = document.querySelector(`[data-testid="${tid}"]`);
          const form = btn?.closest("form") as
            | (HTMLFormElement & Record<string, { action?: unknown }>)
            | null;
          if (!form) return false;
          return Object.keys(form).some(
            (k) => k.startsWith("__reactProps$") && typeof form[k]?.action === "function",
          );
        }, buttonTestId),
      { message: `${buttonTestId}'s form action is wired`, timeout: 30_000 },
    )
    .toBe(true);
}

test.describe("needs-attention identity holds: cards, badge, chip, clear-through", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupFixtures(); // residue from aborted runs
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test.afterEach(async () => {
    await cleanupFixtures();
  });

  test("cards render for held ACTIVE shows only, with the single/multi copy fork", async ({
    page,
  }) => {
    await seedFixtures();
    await page.goto("/admin/needs-attention");

    const single = page.getByTestId(`needs-attention-item-identity-hold-${showId(1)}`);
    await expect(single).toBeVisible();
    // Copy is generated by shapeHoldEntry, so assert on the seeded identity
    // rather than a hand-authored sentence.
    await expect(single).toContainText("Ann Poe");
    await expect(single).toContainText("old@x.com");
    await expect(single).toContainText("new@x.com");
    await expect(page.getByTestId(`identity-hold-toggle-${showId(1)}`)).toHaveCount(0);

    const multi = page.getByTestId(`needs-attention-item-identity-hold-${showId(2)}`);
    await expect(multi).toBeVisible();
    await expect(multi).toContainText("3 held changes waiting");

    // Out-of-scope kind (undo_override) and out-of-scope show (archived).
    await expect(page.getByTestId(`needs-attention-item-identity-hold-${showId(3)}`)).toHaveCount(
      0,
    );
    await expect(page.getByTestId(`needs-attention-item-identity-hold-${showId(4)}`)).toHaveCount(
      0,
    );
  });

  test("badge counts held SHOWS, not held rows (2 shows, 4 open holds → +2)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/admin");
    const before = await readBadge(page);

    await seedFixtures();
    await page.reload();
    // +2, NOT +4: the badge counts shows with open holds, and show 2 carries
    // three of the four. The archived show and the undo_override show add none.
    await expect.poll(() => readBadge(page)).toBe(before + 2);
  });

  test("mobile summary card shows the held-changes chip at 390px", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/admin");
    const before = await readHeldChip(page);

    await seedFixtures();
    await page.reload();
    await expect(page.getByTestId("summary-chip-identity-holds")).toBeVisible();
    await expect.poll(() => readHeldChip(page)).toBe(before + 2);
  });

  test("disclosure expands to all three summaries; a reload remounts it collapsed", async ({
    page,
  }) => {
    await seedFixtures();
    await page.goto("/admin/needs-attention");
    const toggleId = `identity-hold-toggle-${showId(2)}`;
    await waitForHydration(page, toggleId);

    await page.getByTestId(toggleId).click();
    await expect(page.getByTestId(toggleId)).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByTestId(`identity-hold-panel-${showId(2)}`);
    for (const name of ["Bob Roe", "Cara Doe", "Dev Loe"]) {
      await expect(panel).toContainText(name);
    }

    // A full document remount mounts the island at its default. (Soft-refresh
    // persistence is deliberately UNRATIFIED — spec G3 — and is exercised by the
    // jsdom rerender cases; only the reload path is pinned here.)
    await page.reload();
    await expect(page.getByTestId(toggleId)).toHaveAttribute("aria-expanded", "false");
  });

  test("card link opens the show's review surface with the MI-11 gate controls", async ({
    page,
  }) => {
    await seedFixtures();
    await page.goto("/admin/needs-attention");
    await page.getByTestId(`needs-attention-link-identity-hold-${showId(1)}`).click();
    await expect(page).toHaveURL(new RegExp(`show=${slugOf(1)}`));
    await awaitReviewModalOrRecover(page, { label: "click:inbox-identity-hold" });
    await expect(page.getByTestId("mi11-approve").first()).toBeVisible();
    await expect(page.getByTestId("mi11-reject").first()).toBeVisible();
  });

  test("clear-through: rejecting show 1's only hold removes its card and decrements the badge", async ({
    page,
  }) => {
    await seedFixtures();
    await page.setViewportSize(MOBILE);
    await page.goto("/admin");
    const seededBadge = await readBadge(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await openShowReviewModal(page, slugOf(1));
    // Reject (not approve): approve needs a live Drive modifiedTime match plus a
    // crew_members row, neither of which is seedable here. Reject needs only the
    // hold row and the round-tripped base_modified_time. It is a single direct
    // server-action submit — no confirmation phase.
    await waitForFormAction(page, "mi11-reject");
    await page.getByTestId("mi11-reject").first().click();
    await expect(page.getByTestId("mi11-reject")).toHaveCount(0, { timeout: 30_000 });

    await page.goto("/admin/needs-attention");
    await expect(page.getByTestId(`needs-attention-item-identity-hold-${showId(1)}`)).toHaveCount(
      0,
    );
    // Show 2's three holds are untouched, so exactly one held show remains.
    await expect(page.getByTestId(`needs-attention-item-identity-hold-${showId(2)}`)).toBeVisible();
    await page.setViewportSize(MOBILE);
    await page.goto("/admin");
    // Exactly one fewer held show than the seeded state.
    await expect.poll(() => readBadge(page)).toBe(seededBadge - 1);
  });
});
