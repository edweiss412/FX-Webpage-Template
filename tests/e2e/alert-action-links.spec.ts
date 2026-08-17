/**
 * tests/e2e/alert-action-links.spec.ts — BL-ALERT-ACTION-LINKS-E2E (PR6 of the
 * BL-NULLCODE-STAMP-BATCH-2 residual sweep).
 *
 * PR #287 shipped the per-code action-link registry with unit + jsdom + structural
 * coverage, but nobody had clicked the links in a LIVE app. This spec seeds one
 * unresolved admin_alerts row per registered ALERT_ACTIONS code — derived from
 * ALERT_ACTION_CODES, never a hand-copied list, with a set-equality guard so a
 * 21st code fails here instead of silently under-seeding — plus per-shape
 * negative rows, and asserts the rendered anchors in a real browser.
 *
 * RENDERER CENSUS (verified against this tree, superseding the backlog item's
 * four-renderer claim — re-verify before extending):
 *   - BellPanel `bell-action-<alertId>-<i>` (components/admin/BellPanel.tsx),
 *     non-health entries only, at /admin.
 *   - AttentionBanner `attention-banner-action-<alertId>` (footer, action &&
 *     !isClearingNeedsYou) and `attention-banner-destination-<alertId>` (the
 *     EXTERNAL-ONLY destination chip, §2.3) at /admin?show=<slug>.
 *   - HealthAlertsPanel `health-alert-action-<id>` at /admin/dev/telemetry
 *     (mounted ONLY there; developer-gated).
 *   - AttentionMenu renders NO per-item action anchors in the current tree —
 *     the backlog prep's `:208-218` citation rotted (the rows there are
 *     monitoring rows). Deliberately not asserted.
 *
 * CONTRACT DIRECTION (anti-tautology): expected hrefs come from
 * resolveAlertAction/resolveAlertActions — the SAME registry the renderers
 * consume — so these assertions prove the real render pipeline (feed query →
 * server component → DOM) delivers the registry's link untampered, external
 * links carry target/_blank + rel and are asserted VERBATIM without being
 * followed, and every internal fragment resolves to a real element on the
 * landed route (the generalized #resync dead-fragment bug: RESYNC_SHRINK_HELD
 * deliberately targets #overview because #resync never had a DOM id — the
 * DECLARED fragment is the contract).
 */
import { expect, test, type Page } from "@playwright/test";
import {
  ALERT_ACTION_CODES,
  resolveAlertAction,
  type AlertActionLink,
} from "@/lib/adminAlerts/alertActions";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";
import { admin } from "./helpers/supabaseAdmin";
import { clearAlerts } from "./helpers/seedAlerts";
import { settleDashboardAdminState } from "./helpers/dashboardState";
import { signInAs, signOut } from "./helpers/signInAs";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { awaitReviewModalOrRecover, openShowReviewModalAt } from "./helpers/openShowReviewModal";

test.describe.configure({ mode: "serial" });

// ─── Per-code seed contexts ──────────────────────────────────────────────────
// Each context satisfies its builder's guards (lib/adminAlerts/alertActions.ts)
// so the positive rows all produce a link. Slug/driveFileId ride on the seeded
// show row, mirroring how bellFeed/attentionItems thread them.
const GITHUB_REPO = "edweiss412/FX-Webpage-Template";
const ORPHAN_URL = "https://github.com/edweiss412/FX-Webpage-Template/issues/999";
const FOLDER_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

const SEED_CONTEXTS: Record<string, Record<string, unknown>> = {
  SHOW_FIRST_PUBLISHED: {},
  PICKER_EPOCH_RESET: {},
  PICKER_SELECTION_RACE: {},
  ROLE_FLAGS_NOTICE: {},
  LIVE_ROW_CONFLICT: {}, // drive_file_id injected from the seeded show below
  WIZARD_SESSION_SUPERSEDED_RACE: {},
  REPORT_ORPHANED_LOST_LEASE: { orphan_url: ORPHAN_URL },
  BRANCH_PROTECTION_DRIFT: { repo: GITHUB_REPO },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: { repo: GITHUB_REPO },
  RESYNC_SHRINK_HELD: {},
  ONBOARDING_SHEET_UNREADABLE: { folder_id: FOLDER_ID },
  SHEET_UNAVAILABLE: {},
  OPENING_REEL_NOT_VIDEO: {},
  OPENING_REEL_PERMISSION_DENIED: {},
  REEL_DRIFTED: {},
  EMBEDDED_ASSET_DRIFTED: {},
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: {},
  PARSE_ERROR_LAST_GOOD: {},
  RESYNC_QUALITY_REGRESSED: {},
  SHOW_UNPUBLISHED: {},
};

// Negative rows: one per null-return SHAPE in the builders (enumerated from the
// 13 `return null` sites — see the backlog item's class sweep), not per commented
// site. Each uses a REGISTERED code whose builder rejects this exact input.
const NEGATIVE_ROWS: Array<{
  code: string;
  context: Record<string, unknown>;
  global: boolean;
  why: string;
}> = [
  // shape: usable field entirely absent (str() → null; no folder fallback either)
  { code: "ONBOARDING_SHEET_UNREADABLE", context: {}, global: true, why: "no folder_id" },
  // shape: field present but WRONG TYPE (str() rejects non-strings)
  {
    code: "REPORT_ORPHANED_LOST_LEASE",
    context: { orphan_url: 42 },
    global: true,
    why: "orphan_url not a string",
  },
  // shape: slug missing — shareAccess/showAnchor fail-quiet on a GLOBAL row
  { code: "SHOW_UNPUBLISHED", context: {}, global: true, why: "global row has no slug" },
  // shape: malformed repo — the producer's own missing-env placeholder
  {
    code: "BRANCH_PROTECTION_DRIFT",
    context: { repo: "owner/repo" },
    global: true,
    why: "literal owner/repo placeholder",
  },
];

type SeededShow = { id: string; slug: string; driveFileId: string | null };
type SeededRow = { id: string; code: string; context: Record<string, unknown>; global: boolean };

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;
const positives: SeededRow[] = [];
const negatives: SeededRow[] = [];

function expectedLink(row: SeededRow): AlertActionLink | null {
  // Opts mirror the surfaces' own calls: the bell feed and the health panel
  // both pass { slug } WITHOUT driveFileId (lib/admin/bellFeed.ts,
  // HealthAlertsPanel.tsx); attentionItems additionally threads the show's
  // driveFileId, but every seeded openSheet context carries drive_file_id, so
  // the expected href is identical across surfaces.
  return resolveAlertAction(row.code, row.context, {
    slug: row.global ? null : show.slug,
  });
}

const isHealth = (code: string): boolean =>
  (MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as { audience?: string } | undefined)
    ?.audience === "health";

async function assertAnchor(page: Page, testId: string, link: AlertActionLink): Promise<void> {
  const anchor = page.getByTestId(testId);
  await expect(anchor, testId).toBeVisible();
  // VERBATIM href — never followed for external links.
  await expect(anchor).toHaveAttribute("href", link.href);
  if (link.external) {
    await expect(anchor).toHaveAttribute("target", "_blank");
    await expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  } else {
    await expect(anchor).not.toHaveAttribute("target", "_blank");
  }
}

test.beforeAll(async () => {
  // Set-equality guard: the seed map IS the registry. A new ALERT_ACTIONS code
  // fails here by name instead of silently under-seeding (the backlog item's
  // own history: a 9-code list had become 20 without the item noticing).
  expect(Object.keys(SEED_CONTEXTS).sort()).toEqual([...ALERT_ACTION_CODES].sort());

  // /admin renders the first-run setup wizard (no nav, no bell) while
  // app_settings.watched_folder_id is NULL — settle it and restore after.
  restoreDashboardState = await settleDashboardAdminState();

  // Deterministic pick, and NEVER an archived show: the seeded DB carries two
  // archived rows, an unordered limit(1) sometimes selected one, and the show
  // modal does not mount its sections for an archived show — the fragment
  // guard then failed only on the runs that drew the bad row (observed as a
  // 1-in-3 flake before the ORDER BY landed).
  const { data: shows, error: showsErr } = await admin
    .from("shows")
    .select("id, slug, drive_file_id")
    .not("slug", "is", null)
    .eq("archived", false)
    .order("slug")
    .limit(1);
  if (showsErr) throw new Error(`shows select failed: ${showsErr.message}`);
  if (!shows?.length) throw new Error("no seeded show available for alert-action-links");
  show = {
    id: shows[0]!.id as string,
    slug: shows[0]!.slug as string,
    driveFileId: (shows[0]!.drive_file_id as string | null) ?? null,
  };

  await clearAlerts();
  positives.length = 0;
  negatives.length = 0;

  // Positive rows: show-scoped so slug/driveFileId thread through the feeds.
  // LIVE_ROW_CONFLICT carries the show's drive_file_id in context (its builder
  // reads context, not opts). Unique (coalesce(show_id,''), code) holds: one
  // show, twenty distinct codes.
  // openSheet-family codes read context.drive_file_id (the bell feed passes
  // { slug } only — lib/admin/bellFeed.ts resolveAlertActions call — so opts
  // threading cannot supply it there; production producers stamp it in context,
  // per the producer-scope registry). LIVE_ROW_CONFLICT reads context too.
  const DRIVE_CONTEXT_CODES = new Set([
    "LIVE_ROW_CONFLICT",
    "ROLE_FLAGS_NOTICE",
    "SHEET_UNAVAILABLE",
    "OPENING_REEL_NOT_VIDEO",
    "OPENING_REEL_PERMISSION_DENIED",
    "REEL_DRIFTED",
    "EMBEDDED_ASSET_DRIFTED",
    "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  ]);
  const positiveRows = ALERT_ACTION_CODES.map((code, i) => ({
    show_id: show.id,
    code,
    context:
      DRIVE_CONTEXT_CODES.has(code) && show.driveFileId
        ? { ...SEED_CONTEXTS[code]!, drive_file_id: show.driveFileId }
        : SEED_CONTEXTS[code]!,
    raised_at: new Date(Date.now() - 3600_000 - i * 1000).toISOString(),
  }));
  // Negative rows are GLOBAL (show_id null) — distinct codes among themselves
  // and distinct (show_id, code) pairs from every positive row.
  const negativeRows = NEGATIVE_ROWS.map((n, i) => ({
    show_id: null,
    code: n.code,
    context: n.context,
    raised_at: new Date(Date.now() - 7200_000 - i * 1000).toISOString(),
  }));

  const { data: inserted, error: insErr } = await admin
    .from("admin_alerts")
    .insert([...positiveRows, ...negativeRows])
    .select("id, code, show_id");
  if (insErr) throw new Error(`alert-action-links seed insert failed: ${insErr.message}`);
  for (const r of inserted ?? []) {
    const rowIsGlobal = r.show_id === null;
    const source = rowIsGlobal
      ? NEGATIVE_ROWS.find((n) => n.code === r.code)!
      : { context: positiveRows.find((p) => p.code === r.code)!.context };
    (rowIsGlobal ? negatives : positives).push({
      id: r.id as string,
      code: r.code as string,
      context: source.context as Record<string, unknown>,
      global: rowIsGlobal,
    });
  }
  if (positives.length !== ALERT_ACTION_CODES.length) {
    throw new Error(`seeded ${positives.length}/${ALERT_ACTION_CODES.length} positive rows`);
  }
  if (negatives.length !== NEGATIVE_ROWS.length) {
    throw new Error(`seeded ${negatives.length}/${NEGATIVE_ROWS.length} negative rows`);
  }
  // EVERY positive must resolve a link (review R1: set-equality proves seed
  // NAMES, not that each context satisfies its builder — a broken context
  // would otherwise be silently discarded by every downstream filter).
  const unresolved = positives.filter((row) => !expectedLink(row)).map((row) => row.code);
  expect(unresolved, `positive contexts must all resolve: ${unresolved.join(", ")}`).toEqual([]);
});

test.afterAll(async () => {
  await clearAlerts();
  await restoreDashboardState?.();
});

test.beforeEach(async ({ page }) => {
  await signOut(page);
  await signInAs(page, ADMIN_FIXTURE);
});

test("bell panel renders every registry link verbatim; negative rows render none", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByTestId("admin-notif-bell").click();
  await expect(page.getByTestId(/^bell-action-cell-/).first()).toBeVisible();

  // Bell-visible action rows: the panel renders actions on non-health entries
  // only (BellPanel), and the feed EXCLUDES inbox-routed codes entirely — the
  // Needs-attention inbox owns those, and its links are generic deep-links, not
  // registry links (their registry links are asserted on the banner instead).
  const bellRows = positives.filter(
    (row) => !isHealth(row.code) && !INBOX_ROUTED_CODES.includes(row.code),
  );
  // Non-vacuity: if a surface-routing change drains the bell of action-bearing
  // codes, this spec must complain rather than quietly assert nothing.
  expect(bellRows.length).toBeGreaterThanOrEqual(5);

  // Collect EVERY mismatch before asserting (a first-fail loop reports one
  // finding per run — the drip pattern this repo's review discipline bans).
  const missing: string[] = [];
  for (const row of bellRows) {
    const anchor = page.getByTestId(`bell-action-${row.id}-0`);
    if ((await anchor.count()) === 0) {
      missing.push(`${row.code} (row ${row.id}): no bell action anchor`);
      continue;
    }
    await assertAnchor(page, `bell-action-${row.id}-0`, expectedLink(row)!);
  }
  expect(missing, missing.join("\n")).toEqual([]);

  // Health-audience negatives are asserted on the health panel (below) — the
  // bell suppresses actions for health rows unconditionally, so asserting
  // their absence HERE would pass regardless of resolver behavior (review R1).
  for (const row of negatives.filter((r) => !isHealth(r.code))) {
    // The ROW must be present — an absence check against a row the surface
    // never rendered proves nothing (review R2). Then its ACTION must not be.
    await expect(
      page.getByTestId(`bell-action-cell-${row.id}`),
      `${row.code} negative row must itself render in the bell`,
    ).toBeVisible();
    await expect(
      page.getByTestId(`bell-action-${row.id}-0`),
      `${row.code} (${NEGATIVE_ROWS.find((n) => n.code === row.code)?.why}) must render NO action`,
    ).toHaveCount(0);
  }
});

test("every internal bell link's fragment resolves to a real element (dead-fragment guard)", async ({
  page,
}) => {
  // The generalized #resync bug: a dead fragment is silent. Collect the
  // DISTINCT internal hrefs the registry produced for this seed and visit each,
  // asserting the declared fragment's element exists on the landed page.
  // Group by ROUTE and navigate each route ONCE, asserting every declared
  // fragment on that single load. #share-access, #overview and #warnings all live on
  // /admin?show=<slug>; navigating the heavy show-modal route repeatedly in
  // dev mode wedged intermittently (observed ~1-in-4 as a 30s timeout on the
  // SECOND load of the same route), and one load per route is also the honest
  // shape of the contract: the ids either exist on the landed page or not.
  // A /admin route carrying a `show` param in any position — the only
  // destinations in this loop whose content lives inside the review modal and
  // can therefore starve on the route error boundary.
  const MODAL_ROUTE = /admin\?[^"'`]*\bshow=/;
  const routes = new Map<string, Array<{ fragment: string | null; code: string }>>();
  let internalCount = 0;
  const seenHrefs = new Set<string>();
  for (const row of positives) {
    const link = expectedLink(row);
    if (!link || link.external || seenHrefs.has(link.href)) continue;
    seenHrefs.add(link.href);
    internalCount++;
    const hashAt = link.href.indexOf("#");
    const route = hashAt === -1 ? link.href : link.href.slice(0, hashAt);
    const fragment = hashAt === -1 ? null : link.href.slice(hashAt + 1);
    const list = routes.get(route) ?? [];
    list.push({ fragment, code: row.code });
    routes.set(route, list);
  }
  expect(internalCount).toBeGreaterThanOrEqual(3); // share-access + overview + warnings families

  for (const [route, targets] of routes) {
    // waitUntil "commit" + tolerated abort: the show route performs a
    // client-side history replace on load, which can abort the navigation's
    // own load event (observed intermittently as net::ERR_ABORTED). Only that
    // abort is tolerated (review R3: a catch-all lets a failed navigation pass
    // the asserts below against the PREVIOUS route's page, which also renders
    // admin-layout and matches the broad /admin URL guard); any other failure
    // rethrows, and after a tolerated abort the URL must have left the prior
    // page — proof the replacement navigation committed.
    const urlBeforeGoto = page.url();
    try {
      await page.goto(route, { waitUntil: "commit" });
    } catch (err) {
      if (!String(err).includes("net::ERR_ABORTED")) throw err;
      await expect
        .poll(() => page.url(), {
          message: `navigation to ${route} must commit after tolerated ERR_ABORTED`,
        })
        .not.toBe(urlBeforeGoto);
    }
    await expect(page.getByTestId("admin-layout")).toBeVisible();
    // `admin-layout` survives the route error boundary (app/admin/error.tsx is a
    // sibling of page.tsx), so it is satisfied on the boundary and proves
    // nothing. The modal-interior fragment waits below are the class signal, and
    // only /admin?show= destinations can starve on them.
    if (MODAL_ROUTE.test(route)) {
      await awaitReviewModalOrRecover(page, { timeoutMs: 30_000, label: `route-loop:${route}` });
    }
    for (const { fragment, code } of targets) {
      if (fragment) {
        // toBeAttached, not toBeVisible: the target section may sit offscreen
        // or inside a scroll container — existence of the id is the contract.
        await expect(
          page.locator(`[id="${fragment}"]`),
          `declared fragment #${fragment} (from ${code}, route ${route}) must resolve to a real element`,
        ).toBeAttached({ timeout: 30_000 });
      } else {
        // Fragmentless internal link (WIZARD_SESSION_SUPERSEDED_RACE →
        // /admin/onboarding). With no wizard session pending, that route
        // legitimately bounces to /admin — the contract is that the
        // destination EXISTS and lands on an admin surface, not that the URL
        // survives the app's own state-based redirects.
        await expect(
          page,
          `${code} internal link ${route} must land on an admin surface`,
        ).toHaveURL(/\/admin(\/|\?|$)/);
      }
    }
  }
});

test("attention banner renders the footer action / external destination chip per its own gate", async ({
  page,
}) => {
  await openShowReviewModalAt(page, `/admin?show=${encodeURIComponent(show.slug)}`);
  // The banner renders inside the show review surface; wait for it to settle.
  await page.waitForLoadState("networkidle");

  // Exact expected set, pinned (review R1: a floor lets anchors vanish while
  // the test stays green, and unexpected anchors inflate it). Checked in like
  // EXPECTED_CUT_IDS: a routing/derivation change must fail loudly here.
  const EXPECTED_BANNER_CODES = [
    "EMBEDDED_ASSET_DRIFTED",
    "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    "LIVE_ROW_CONFLICT",
    "ONBOARDING_SHEET_UNREADABLE",
    "OPENING_REEL_NOT_VIDEO",
    "OPENING_REEL_PERMISSION_DENIED",
    "REEL_DRIFTED",
    "SHEET_UNAVAILABLE",
  ].sort();

  const renderedCodes: string[] = [];
  for (const row of positives) {
    const link = expectedLink(row)!;
    const action = page.getByTestId(`attention-banner-action-${row.id}`);
    const chip = page.getByTestId(`attention-banner-destination-${row.id}`);
    if ((await action.count()) > 0) {
      await assertAnchor(page, `attention-banner-action-${row.id}`, link);
      renderedCodes.push(row.code);
    } else if ((await chip.count()) > 0) {
      // §2.3: the destination chip is EXTERNAL-ONLY by design.
      expect(link.external, `${row.code} destination chip implies external`).toBe(true);
      await expect(chip).toHaveAttribute("href", link.href);
      await expect(chip).toHaveAttribute("target", "_blank");
      await expect(chip).toHaveAttribute("rel", "noopener noreferrer");
      renderedCodes.push(row.code);
    }
  }
  expect(renderedCodes.sort()).toEqual(EXPECTED_BANNER_CODES);
});

test("health panel renders health-audience registry links verbatim at /admin/dev/telemetry", async ({
  page,
}) => {
  const healthRows = positives.filter((r) => isHealth(r.code) && expectedLink(r));
  test.skip(healthRows.length === 0, "no health-audience codes in the action registry");

  await page.goto("/admin/dev/telemetry");
  for (const row of healthRows) {
    await assertAnchor(page, `health-alert-action-${row.id}`, expectedLink(row)!);
  }
  // Health-audience NEGATIVE rows belong to this surface (the bell suppresses
  // health actions unconditionally, so absence there is vacuous — review R1).
  for (const row of negatives.filter((r) => isHealth(r.code))) {
    // Row presence first — absence of the action is meaningful only on a row
    // the panel actually rendered (review R2).
    await expect(
      page.getByTestId(`health-alert-row-${row.id}`),
      `${row.code} negative row must itself render in the health panel`,
    ).toBeVisible();
    await expect(
      page.getByTestId(`health-alert-action-${row.id}`),
      `${row.code} (${NEGATIVE_ROWS.find((n) => n.code === row.code)?.why}) must render NO action`,
    ).toHaveCount(0);
  }
});
