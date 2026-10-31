/**
 * tests/e2e/crew-offline.spec.ts: the crew page saved copy in a real browser
 * (spec §7), under Chromium and WebKit against the production build.
 *
 * Every case runs under both engines and asserts the same things under both:
 * the engine, the proxy origin and the per-case context come from the fixture
 * (helpers/crewOfflineFixture.ts), which is why nothing in this file names
 * either. "Offline" is the proxy refusing (the spike found
 * `context.setOffline` unreliable for workers); "slow" is the proxy holding.
 *
 * Run (one production build per invocation; heavy, so through the slot):
 *   CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test \
 *     --project=crew-offline-chromium --project=crew-offline-webkit \
 *     tests/e2e/crew-offline.spec.ts tests/e2e/crew-offline-realtime.spec.ts
 *
 * Data: `seedShowWithCrew` per case, deleted after it. Case 1 (and case 15's
 * replay of it) reads the `pnpm db:seed` Waldorf show, the one seeded show with
 * stage diagrams, and never writes to it.
 *
 * Lifecycle cases (3, 4, 5, 15) leave the show for the sign-in page before the
 * admin change and navigate back after it. That is the reload the case
 * describes, as the worker sees it (a navigation to the saved link), without
 * the open page's realtime bridge refreshing it first and racing the reload.
 * The realtime path is crew-offline-realtime.spec.ts.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

import { KILL_SWITCH_SOURCE } from "@/lib/offline/killSwitch";
import { savedCopyStatusUrl } from "@/lib/offline/protocol";
import { STATIC_CACHE } from "@/lib/offline/storeSchema";

import { premise, premiseHolds } from "../_shared/premise";

import type { CrewOfflineProxy, ReceivedRequest } from "./helpers/crewOfflineProxy";
import {
  NOT_SAVED_BODY,
  NOT_SAVED_HEADING,
  NOT_SAVED_NOTE,
  NOT_SAVED_RETRY,
  SAVED_TODAY_LEAD,
  assertServerUnderTest,
  crewUrlPath,
  expect,
  expectNoCopyOf,
  expectNotSavedPage,
  openAvatarMenu,
  pickAndSave,
  savedCopyBar,
  test,
  waitForSaved,
} from "./helpers/crewOfflineFixture";
import { archiveShow, rotateShareToken, unpublishShow } from "./helpers/crewOfflineLifecycle";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import {
  poisonStaticScripts,
  readSavedCopies,
  readSavedCopyHtml,
  waitForCrewHydrated,
  waitForSavedCopy,
  waitForWorkerControl,
  type SavedCopyRecord,
} from "./helpers/savedCopyProbe";
import {
  deleteSeededShow,
  seedShowWithCrew,
  type SeedShowWithCrewOptions,
} from "./helpers/seedShowWithCrew";
import { signInAs } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const WALDORF_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const AGENDA_FILE_ID = "crew-offline-e2e-agenda";
const AGENDA_PDF = readFileSync(resolve(__dirname, "fixtures", "agenda-fixture.pdf"));

/** React's production hydration errors (#418 text, #423 recovery, #425 text content). */
const HYDRATION_ERROR = /#(418|423|425)\b|hydrat/i;

type CaseShow = { showId: string; slug: string; shareToken: string; crewMemberId: string };

const seeded: string[] = [];

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ crewOfflineProxy }) => {
  await assertServerUnderTest(crewOfflineProxy);
});

test.afterEach(async () => {
  for (const driveFileId of seeded.splice(0)) await deleteSeededShow(driveFileId);
});

/** A fresh published show with one crew member, removed after the case. */
async function seedCase(options: SeedShowWithCrewOptions = {}): Promise<CaseShow> {
  const show = await seedShowWithCrew({
    driveFileId: `crew-offline-e2e:${randomUUID()}`,
    title: "Crew Offline E2E",
    crew: [{ name: "Riley Offline", role: "A1" }],
    ...options,
  });
  seeded.push(show.driveFileId);
  const crewMember = show.crew[0];
  if (crewMember === undefined) throw new Error("seedCase: the show has no crew member");
  return {
    showId: show.showId,
    slug: show.slug,
    shareToken: show.shareToken,
    crewMemberId: crewMember.id,
  };
}

/** The db:seed Waldorf show, read only: its link and an unclaimed crew member to pick. */
async function waldorfShow(): Promise<CaseShow> {
  const { data: show, error: showError } = await admin
    .from("shows")
    .select("id, slug, published, archived")
    .eq("drive_file_id", WALDORF_DRIVE_FILE_ID)
    .maybeSingle();
  if (showError || !show) {
    throw new Error(
      `crew offline e2e: the Waldorf seed is missing (run \`pnpm db:seed\`): ${showError?.message ?? "no row"}`,
    );
  }
  if (show.published !== true || show.archived !== false) {
    throw new Error("crew offline e2e: the Waldorf seed is not a live show (run `pnpm db:seed`)");
  }
  const { data: token, error: tokenError } = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", show.id)
    .maybeSingle();
  if (tokenError || !token?.share_token) {
    throw new Error(`crew offline e2e: no Waldorf share token: ${tokenError?.message ?? "no row"}`);
  }
  const { data: crew, error: crewError } = await admin
    .from("crew_members")
    .select("id, name, email, claimed_via_oauth_at")
    .eq("show_id", show.id)
    .order("name");
  if (crewError || !crew) {
    throw new Error(`crew offline e2e: no Waldorf crew: ${crewError?.message ?? "no rows"}`);
  }
  // Unclaimed, so the tap selects rather than routing through OAuth recovery,
  // and never the admin fixture's address, so no Google session can be its.
  const pick = crew.find(
    (member) => member.claimed_via_oauth_at === null && member.email !== ADMIN_FIXTURE.email,
  );
  if (pick === undefined) throw new Error("crew offline e2e: no unclaimed Waldorf crew member");
  return {
    showId: show.id as string,
    slug: show.slug as string,
    shareToken: token.share_token as string,
    crewMemberId: pick.id as string,
  };
}

function caseTarget(show: CaseShow) {
  return { showId: show.showId, path: crewUrlPath(show), crewMemberId: show.crewMemberId };
}

/** `pathname + search`, the form the worker's static index and a copy's lists use. */
function rootRelative(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * Every `/_next/static/**` URL anywhere in the stored HTML, element attributes
 * and inline scripts alike (the RSC payload names client chunks too). Read
 * here independently of the worker's own completeness reader, so the check
 * cannot agree with the worker by sharing its blind spots.
 */
function nextStaticUrlsIn(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\/_next\/static\/[^"'\s<>\\)]+/g)) {
    found.add(match[0].replaceAll("&amp;", "&"));
  }
  return [...found];
}

/**
 * Leaves the show for a same-origin page with no crew route and no realtime
 * bridge (the sign-in page), so an admin change made next cannot reach this
 * page by realtime refresh first.
 */
async function leaveShow(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/auth/sign-in`);
}

/**
 * What the status route answers for `copy` now, asked from a same-origin
 * document the way the worker asks: a same-origin fetch carrying the
 * browser's cookies. Not through Playwright's request context, which drops
 * `Secure` cookies (the `__Host-` picker cookie) on http://127.0.0.1.
 */
async function statusFor(page: Page, copy: SavedCopyRecord): Promise<unknown> {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    return { status: response.status, body: (await response.json()) as unknown };
  }, savedCopyStatusUrl(copy));
}

/**
 * The status-route requests the proxy received after `mark` (an index into its
 * log). The worker's own fetches pass through the proxy, so this sees the
 * worker's check in both engines, where no page listener can.
 */
function statusAsksSince(proxy: CrewOfflineProxy, mark: number): ReceivedRequest[] {
  return proxy
    .received()
    .slice(mark)
    .filter((request) => request.path.startsWith("/api/saved-copy/status?"));
}

/** A visible sub-nav tab (the 390px layout shows the mobile bar only). */
function sectionTab(page: Page, section: string) {
  return page.getByTestId("crew-sub-nav").locator(`[data-section="${section}"]:visible`);
}

test("1. first visit is saved, then an offline reload shows full content, a working tab switch and the bar", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await waldorfShow();
  const path = crewUrlPath(show);
  await pickAndSave(page, origin, caseTarget(show));

  // Right after the first visit's save, before any further navigation. The page
  // fetched its font and chunks before the worker controlled it, so none of
  // those fetches reached the worker: only the save's completeness step can
  // have stored them. The browser's HTTP cache holds /fonts/** and the hashed
  // chunks as immutable and would hide a missing one offline, so the worker's
  // Cache Storage is read directly.
  const fontHref = await page.evaluate(
    () => document.querySelector('link[rel="preload"][as="font"]')?.getAttribute("href") ?? null,
  );
  expect(fontHref, "the page carries the font preload link").toMatch(/^\/fonts\/.+\.woff2$/);
  const html = await readSavedCopyHtml(page, show.showId);
  expect(html, "the stored copy has its HTML").not.toBeNull();
  const referenced = nextStaticUrlsIn(html ?? "");
  expect(referenced.length, "the stored HTML references /_next/static files").toBeGreaterThan(0);
  const stored = new Set(
    ((await readSavedCopies(page)).caches[STATIC_CACHE] ?? []).map(rootRelative),
  );
  expect([...stored]).toContain(fontHref);
  expect(referenced.filter((url) => !stored.has(url))).toEqual([]);

  const savedSection = /data-active-section="([^"]+)"/.exec(html ?? "")?.[1];
  expect(savedSection, "the stored copy names its section").toBeTruthy();
  expect(savedSection, "Venue is a real switch from the saved section").not.toBe("venue");

  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  const { bar, content, detail } = savedCopyBar(page);
  await expect(page.getByTestId("crew-shell")).toBeVisible();
  await expect(bar).toHaveAttribute("data-state", "saved-fresh");
  await expect(content.locator("strong")).toHaveText(SAVED_TODAY_LEAD);
  await expect(content).toHaveText(new RegExp(`${SAVED_TODAY_LEAD.source} No signal\\.$`));
  await expect(detail).toHaveText("Showing your saved copy.");

  // The section in the URL (spec 4.7.4, Task 21's replaceState): open the copy
  // at a URL naming another section. The copy opens on its own section and the
  // bar rewrites `s` to say so.
  const tabs = await page
    .getByTestId("crew-sub-nav")
    .locator("[data-section]:visible")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-section")));
  const otherSection = tabs.find((tab) => tab !== savedSection && tab !== "venue");
  expect(otherSection, "the sub-nav offers a third section").toBeTruthy();
  await page.goto(`${origin}${path}?s=${otherSection}`);
  await waitForCrewHydrated(page);
  await expect(bar).toHaveAttribute("data-state", "saved-fresh");
  const sections = page.getByTestId("crew-shell-sections");
  await expect(sections).toHaveAttribute("data-active-section", savedSection ?? "");
  await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe(savedSection);

  await sectionTab(page, "venue").click();
  await expect(page.getByTestId("section-venue")).toBeVisible();
  await expect(sections).toHaveAttribute("data-active-section", "venue");
  await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("venue");

  // The stage diagrams render from the stored assets: the proxy refuses every
  // request, and the asset route sends `private, max-age=0`.
  const images = page.locator(
    '[data-testid="venue-diagrams"] [data-testid^="diagram-slot-"]:not([data-unavailable]) img',
  );
  await expect.poll(() => images.count(), { message: "Waldorf seeds two diagrams" }).toBe(2);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth))
      .toBeGreaterThan(0);
  }

  await openAvatarMenu(page);
  await expect(page.getByTestId("avatar-menu-items")).toBeVisible();
});

test("2. a hung connection shows slow, then the page updates by itself", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await seedCase();
  const saved = await pickAndSave(page, origin, caseTarget(show));
  // The render time of the copy the slow page is about to show (Codex R1 D5).
  premiseHolds(
    `the saved copy's render time was captured (${saved.savedAt})`,
    Number.isFinite(Date.parse(saved.savedAt)),
  );

  proxy.setMode("hang");
  const started = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForCrewHydrated(page);
  const { bar, content, detail } = savedCopyBar(page);
  await expect(bar).toHaveAttribute("data-state", "saved-fresh");
  await expect(content).toHaveText(new RegExp(`${SAVED_TODAY_LEAD.source} Slow connection\\.$`));
  await expect(detail).toHaveText("Showing your saved copy.");
  expect(Date.now() - started, "the worker waits out its 8 s budget first").toBeGreaterThanOrEqual(
    8_000,
  );

  // Every bar state this document shows from here on, kept in session storage
  // so it survives the recovery reload. `updating` lasts only from the fresh
  // save to the reload, so it is recorded as it happens rather than polled.
  const recordKey = "fxav-e2e-bar-states";
  await page.evaluate((key) => {
    const record = (): void => {
      const state =
        document.querySelector('[data-testid="saved-copy-bar"]')?.getAttribute("data-state") ??
        "none";
      const seen = JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[];
      if (seen.at(-1) !== state) sessionStorage.setItem(key, JSON.stringify([...seen, state]));
    };
    record();
    new MutationObserver(record).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
  }, recordKey);

  // The held navigation goes on to the server; the worker's continuation saves
  // the fresh page and the bar takes it.
  proxy.setMode("pass");
  await expect(bar).toHaveAttribute("data-state", "updated", { timeout: 60_000 });
  await expect(content).toHaveText("Updated. You're on the latest version.");
  // Fresh content, not the saved copy with recovery indicators on top (Codex R1
  // D5). Changing a seeded value cannot show it: the show's data is cached for
  // 300 s and only the app's own writes bust it (lib/data/getShowForViewer.ts,
  // tests/e2e/helpers/lockedShowCopy.ts), so the server's render time stands in.
  const recovered = await page.evaluate(() => ({
    servedMeta: document.querySelector('meta[name="fxav-served"]') !== null,
    renderedAt:
      document.querySelector("template#fxav-saved-copy")?.getAttribute("data-rendered-at") ?? null,
  }));
  expect(recovered.servedMeta, "the recovered page is not a served copy").toBe(false);
  expect(
    Date.parse(recovered.renderedAt ?? ""),
    `the recovered page (${recovered.renderedAt}) was rendered after the saved copy (${saved.savedAt})`,
  ).toBeGreaterThan(Date.parse(saved.savedAt));
  await expect
    .poll(
      async () =>
        (await readSavedCopies(page)).copies.find((copy) => copy.showId === show.showId)?.savedAt ??
        null,
      { message: "the worker's copy of the page is the recovered render" },
    )
    .toBe(recovered.renderedAt);
  const seenStates = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[],
    recordKey,
  );
  expect(seenStates).toEqual(["saved-fresh", "updating"]);
  await expect(bar).toHaveCount(0, { timeout: 15_000 });
});

test("3. an archive keeps the copy, with the ended bar online and offline", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await seedCase();
  const path = crewUrlPath(show);
  const saved = await pickAndSave(page, origin, caseTarget(show));

  await leaveShow(page, origin);
  expect(await archiveShow(show.showId)).toBe(true);
  // The verdict the worker's check will get (spec 4.5): an archive alone keeps the copy.
  expect(await statusFor(page, saved)).toEqual({ status: 200, body: { state: "ended" } });

  await page.goto(`${origin}${path}`);
  await waitForCrewHydrated(page);
  const { bar, content, detail } = savedCopyBar(page);
  await expect(bar).toHaveAttribute("data-state", "ended");
  await expect(content).toHaveText("This show has ended.");
  await expect(detail).toHaveText(/^You're seeing the last version, from .+\.$/);
  const ended = (await readSavedCopies(page)).copies.find((copy) => copy.showId === show.showId);
  expect(ended?.endedAt).toEqual(expect.any(Number));

  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  await expect(bar).toHaveAttribute("data-state", "ended");
  await expect(content).toHaveText("This show has ended.");
  await expect(detail).toHaveText(/^You're seeing the last version, from .+\.$/);
});

test("4. a link reset wipes the copy", async ({ crewPage: page, origin, crewProxy: proxy }) => {
  const show = await seedCase();
  const path = crewUrlPath(show);
  const saved = await pickAndSave(page, origin, caseTarget(show));

  await leaveShow(page, origin);
  await rotateShareToken(show.showId);
  expect(await statusFor(page, saved)).toEqual({ status: 200, body: { state: "gone" } });

  const mark = proxy.received().length;
  await page.goto(`${origin}${path}`);
  await expect(page.getByTestId("crew-not-found-root")).toBeVisible();
  await expectNoCopyOf(page, show.showId);
  // The not-found page's `check` marker sent the worker to the status route
  // (spec 4.4 step 3), whose `gone` is what removed the copy.
  expect(statusAsksSince(proxy, mark), "the worker asked the status route").not.toEqual([]);

  proxy.setMode("refuse");
  await page.reload();
  await expectNotSavedPage(page);
  await expect(page.getByTestId("crew-shell")).toHaveCount(0);
});

test("5. an unpublish wipes the copy", async ({ crewPage: page, origin, crewProxy: proxy }) => {
  const show = await seedCase();
  const path = crewUrlPath(show);
  await pickAndSave(page, origin, caseTarget(show));

  await leaveShow(page, origin);
  expect(await unpublishShow(show.showId)).toBe(true);

  await page.goto(`${origin}${path}`);
  await expect(page.getByTestId("crew-show-paused-root")).toBeVisible();
  await expectNoCopyOf(page, show.showId);

  proxy.setMode("refuse");
  await page.reload();
  await expectNotSavedPage(page);
  await expect(page.getByTestId("crew-shell")).toHaveCount(0);
});

test('6. "Not you?" wipes the copy', async ({ crewPage: page, origin, crewProxy: proxy }) => {
  const show = await seedCase();
  await pickAndSave(page, origin, caseTarget(show));

  await openAvatarMenu(page);
  await page.getByTestId("avatar-menu-switch-person").click();
  await expect(page.getByTestId("crew-shell")).toHaveCount(0, { timeout: 30_000 });
  await expectNoCopyOf(page, show.showId);

  proxy.setMode("refuse");
  await page.reload();
  await expectNotSavedPage(page);
  await expect(page.getByTestId("crew-shell")).toHaveCount(0);
});

test("7. the avatar menu's purge bracket wipes the copy on its own", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await seedCase();
  await pickAndSave(page, origin, caseTarget(show));

  // Fail the clear itself (a Server Action carries a next-action header), so the
  // crew shell stays and no page render can purge: only the menu's two
  // purge-show posts can remove the copy.
  const refusedActions: string[] = [];
  proxy.refuseMatching((request) => {
    const action = request.method === "POST" && request.headers["next-action"] !== undefined;
    if (action) refusedActions.push(request.path);
    return action;
  });
  await openAvatarMenu(page);
  await page.getByTestId("avatar-menu-switch-person").click();
  await expect(page.getByTestId("avatar-menu-switch-error")).toBeVisible({ timeout: 30_000 });
  expect(refusedActions.length, "the clear reached the proxy and was refused").toBeGreaterThan(0);
  await expect(page.getByTestId("crew-shell")).toBeVisible();
  await expectNoCopyOf(page, show.showId);

  proxy.refuseMatching(null);
  proxy.setMode("refuse");
  await page.reload();
  await expectNotSavedPage(page);
});

test("8. signing out wipes the copy", async ({ crewPage: page, origin, crewProxy: proxy }) => {
  const show = await seedCase({
    crew: [{ name: "Riley Offline", role: "A1", email: NON_ADMIN_CREW_FIXTURE.email }],
  });
  const path = crewUrlPath(show);
  await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: origin });
  // The Google session matches the crew row and no picker entry exists yet, so
  // the page bootstraps the selection and then resolves to the crew shell.
  await page.goto(`${origin}${path}`);
  await waitForSaved(page, { showId: show.showId, path });
  await expect(page.getByTestId("avatar-menu-trigger")).toHaveAttribute(
    "aria-label",
    /^Riley Offline,/,
  );

  await page.goto(`${origin}/me`);
  await page.getByTestId("me-sign-out-button").click();
  await page.waitForURL(/\/auth\/sign-in/);
  await expectNoCopyOf(page, show.showId);

  proxy.setMode("refuse");
  await page.goto(`${origin}${path}`);
  await expectNotSavedPage(page);
});

test("9. an admin view wipes the copy", async ({ crewPage: page, origin }) => {
  const show = await seedCase();
  await pickAndSave(page, origin, caseTarget(show));

  await signInAs(page, ADMIN_FIXTURE, { baseUrl: origin });
  await page.reload();
  await expect(page.getByTestId("crew-shell")).toBeVisible();
  // The admin arm rendered: an admin viewer gets no saved-copy bar at all.
  await expect(page.getByTestId("saved-copy-bar-region")).toHaveCount(0);
  await expectNoCopyOf(page, show.showId);
});

test("10. a show with no saved copy gets the not-saved page, which reloads when signal returns", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const showA = await seedCase();
  const showB = await seedCase();
  await pickAndSave(page, origin, caseTarget(showA));

  proxy.setMode("refuse");
  await page.goto(`${origin}${crewUrlPath(showB)}`);
  await expect(page.getByRole("heading", { level: 1, name: NOT_SAVED_HEADING })).toBeVisible();
  await expect(page.getByText(NOT_SAVED_BODY, { exact: true })).toBeVisible();
  await expect(page.getByText(NOT_SAVED_NOTE, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: NOT_SAVED_RETRY, exact: true })).toBeVisible();
  // Show A's copy is still there: B has none of its own, and A's is never served for it.
  const copies = (await readSavedCopies(page)).copies.map((copy) => copy.showId);
  expect(copies).toEqual([showA.showId]);

  proxy.setMode("pass");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("sign-in-or-skip-gate")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: NOT_SAVED_HEADING })).toHaveCount(0);
});

/** A `/_next/static/**` script, as the worker's static index and a copy's lists name it. */
function nextStaticScript(path: string): boolean {
  const pathname = path.split("?")[0] ?? "";
  return pathname.startsWith("/_next/static/") && pathname.endsWith(".js");
}

/**
 * A show with an agenda, picked and saved, once the registrar's prefetch has run:
 * the saved copy lists the agenda and the static cache holds the pdf.js worker
 * and every script the viewer's import loaded. Nobody has opened the agenda yet.
 *
 * Neither the browser's HTTP cache nor anything but the worker can answer offline
 * (Codex R1 D4). The agenda is stubbed no-store. Every `/_next/static/` answer is
 * marked no-store too, so a chunk the worker failed to keep has nowhere else to
 * come from: Next sends them immutable, and the HTTP cache would otherwise answer
 * for a lazily imported viewer chunk the worker never stored. Poisoning the stored
 * scripts, case 12's way to keep the HTTP cache out, would stop the viewer itself.
 */
async function agendaShowPrefetched(
  page: Page,
  origin: string,
  proxy: CrewOfflineProxy,
): Promise<void> {
  proxy.stub("/api/asset/agenda/", AGENDA_PDF, "application/pdf", {
    "cache-control": "no-store",
  });
  proxy.overrideHeaders("/_next/static/", { "cache-control": "no-store" });
  // Every script requested, by the page and (on a cache miss) by the worker on
  // its behalf: WebKit reports none of a worker's own requests to Playwright,
  // and the proxy sees both engines' (helpers/crewOfflineProxy.ts).
  const pageScripts = new Set<string>();
  page.on("request", (request) => {
    const path = rootRelative(request.url());
    if (nextStaticScript(path)) pageScripts.add(path);
  });
  const show = await seedCase({ agendaLinks: [{ label: "AGENDA", fileId: AGENDA_FILE_ID }] });
  const agendaUrl = `/api/asset/agenda/${show.showId}/${AGENDA_FILE_ID}`;
  await pickAndSave(page, origin, caseTarget(show));

  await expect
    .poll(
      async () => {
        const state = await readSavedCopies(page);
        const copy = state.copies.find((c) => c.showId === show.showId);
        const statics = (state.caches[STATIC_CACHE] ?? []).map(rootRelative);
        return {
          agendaListed: copy?.assets.includes(agendaUrl) ?? false,
          pdfWorkerStored: statics.some((url) => /\/pdf\.worker[^/]*$/.test(url.split("?")[0]!)),
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({ agendaListed: true, pdfWorkerStored: true });
  await expect(page.getByTestId("agenda-sheet"), "the agenda was never opened").toHaveCount(0);

  // The scripts the viewer's import loaded are the ones the stored HTML does not
  // name (case 1 covers those). Each is in the worker's static cache.
  const html = await readSavedCopyHtml(page, show.showId);
  const named = new Set(nextStaticUrlsIn(html ?? ""));
  premise("the stored HTML names /_next/static files", named.size, 0);
  const requested = new Set([
    ...pageScripts,
    ...proxy
      .received()
      .map((request) => request.path)
      .filter(nextStaticScript),
  ]);
  const lazy = [...requested].filter((path) => !named.has(path));
  premise("the viewer's import loaded scripts the HTML does not name", lazy.length, 0);
  await expect
    .poll(
      async () => {
        const stored = new Set(
          ((await readSavedCopies(page)).caches[STATIC_CACHE] ?? []).map(rootRelative),
        );
        return lazy.filter((path) => !stored.has(path));
      },
      { message: "every lazily loaded script is in the worker's static cache", timeout: 15_000 },
    )
    .toEqual([]);
}

/**
 * Schedule, then `View agenda`: the viewer shows the first page, painted. The page
 * counter appears once the document loads, before react-pdf's `<Page>` renders
 * (Codex R1 D3), so the case also waits for the first page's canvas and reads its
 * pixels: a real width, and ink on it (the fixture is black text on white).
 */
async function openAgenda(page: Page): Promise<void> {
  await sectionTab(page, "schedule").click();
  await expect(page.getByTestId("section-schedule")).toBeVisible();
  await page
    .getByTestId("agenda-embed")
    .getByRole("button", { name: /View agenda/ })
    .click();
  await expect(page.getByTestId("agenda-active-page")).toHaveText("1", { timeout: 30_000 });
  const canvas = page.locator('[data-page="1"] canvas').first();
  await expect(canvas, "react-pdf rendered the first page's canvas").toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        canvas.evaluate((node: HTMLCanvasElement) => {
          if (node.width === 0 || node.height === 0) return { width: node.width, ink: false };
          const context = node.getContext("2d");
          if (context === null) return { width: node.width, ink: false };
          const { data } = context.getImageData(0, 0, node.width, node.height);
          for (let at = 0; at < data.length; at += 4) {
            const dark = Math.min(data[at]!, data[at + 1]!, data[at + 2]!) < 128;
            if (data[at + 3]! > 0 && dark) return { width: node.width, ink: true };
          }
          return { width: node.width, ink: false };
        }),
      { message: "the first page's canvas has a width and ink on it", timeout: 30_000 },
    )
    .toMatchObject({ ink: true });
  expect(await canvas.evaluate((node: HTMLCanvasElement) => node.width)).toBeGreaterThan(0);
}

test("11a. an agenda nobody opened opens offline", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await agendaShowPrefetched(page, origin, proxy);

  // Offline before anyone opens it: everything the viewer needs came from the
  // registrar's prefetch alone.
  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  await expect(savedCopyBar(page).bar).toHaveAttribute("data-state", "saved-fresh");
  await openAgenda(page);
});

test("11b. the agenda opens online after the registrar's prefetch", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await agendaShowPrefetched(page, origin, proxy);

  // Online, on the page whose registrar just ran the prefetch. A registrar that
  // imported react-pdf itself reset pdf.js's worker URL for the whole page, and
  // the viewer then failed here as well as offline.
  await openAgenda(page);
});

/** The page-side release for `holdWorkerRegistration`, one per document. */
const RELEASE_REGISTRATION = "__fxavReleaseWorkerRegistration";

/**
 * Holds `navigator.serviceWorker.register` on every document the page loads
 * until the case calls the document's release, so a first visit can open the
 * agenda before any worker controls the page (Codex R3 C). Nothing else about
 * registration changes: the registrar's own call goes through once released.
 */
async function holdWorkerRegistration(page: Page): Promise<void> {
  await page.addInitScript((releaseName: string) => {
    const container = navigator.serviceWorker as ServiceWorkerContainer | undefined;
    if (container === undefined) return;
    const register = container.register.bind(container);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as unknown as Record<string, () => void>)[releaseName] = release;
    container.register = (...args: Parameters<ServiceWorkerContainer["register"]>) =>
      released.then(() => register(...args));
  }, RELEASE_REGISTRATION);
}

// Codex R3 C: the agenda opened during the first visit, while the worker was
// still installing, so its code loaded outside the worker; the registrar's own
// import then reused the loaded modules and fetched nothing. Every file the
// page loaded must reach the worker's static cache once the worker controls it.
test("11c. an agenda opened before the worker controlled the page opens offline", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  // As agendaShowPrefetched: nothing but the worker can answer offline.
  proxy.stub("/api/asset/agenda/", AGENDA_PDF, "application/pdf", {
    "cache-control": "no-store",
  });
  proxy.overrideHeaders("/_next/static/", { "cache-control": "no-store" });
  await holdWorkerRegistration(page);
  const show = await seedCase({ agendaLinks: [{ label: "AGENDA", fileId: AGENDA_FILE_ID }] });
  const target = caseTarget(show);
  const agendaUrl = `/api/asset/agenda/${show.showId}/${AGENDA_FILE_ID}`;

  await page.goto(`${origin}${target.path}?gate=skip`);
  await expect(page.getByTestId("picker-interstitial-root")).toBeVisible({ timeout: 30_000 });
  await page
    .locator(`[data-testid="picker-roster-row"][data-crew-member-id="${target.crewMemberId}"]`)
    .click();
  await waitForCrewHydrated(page);
  premiseHolds(
    "no worker controls the page while registration is held",
    await page.evaluate(() => navigator.serviceWorker.controller === null),
  );

  // The agenda opens online with no worker: every file it needs comes from the
  // network, and the proxy sees each request (the page's own, in both engines).
  const mark = proxy.received().length;
  await openAgenda(page);
  const loadedBeforeControl = [
    ...new Set(
      proxy
        .received()
        .slice(mark)
        .map((request) => request.path)
        .filter((path) => path.startsWith("/_next/static/")),
    ),
  ];
  premise("the agenda loaded static files before control", loadedBeforeControl.length, 0);
  premiseHolds(
    "still no worker controls the page",
    await page.evaluate(() => navigator.serviceWorker.controller === null),
  );

  // Now the worker registers, takes control, saves the page, and the registrar's
  // prefetch runs.
  await page.evaluate((name) => {
    (window as unknown as Record<string, () => void>)[name]?.();
  }, RELEASE_REGISTRATION);
  await waitForWorkerControl(page);
  await waitForSavedCopy(page, { showId: show.showId, url: target.path });
  const html = await readSavedCopyHtml(page, show.showId);
  const named = new Set(nextStaticUrlsIn(html ?? ""));
  const lazy = loadedBeforeControl.filter((path) => !named.has(path));
  premise("the agenda loaded files the stored HTML does not name", lazy.length, 0);
  premiseHolds("a script the stored HTML does not name is among them", lazy.some(nextStaticScript));
  await expect
    .poll(
      async () => {
        const state = await readSavedCopies(page);
        const stored = new Set((state.caches[STATIC_CACHE] ?? []).map(rootRelative));
        const copy = state.copies.find((c) => c.showId === show.showId);
        return {
          agendaListed: copy?.assets.includes(agendaUrl) ?? false,
          missing: lazy.filter((path) => !stored.has(path)),
        };
      },
      {
        message: "every file the agenda loaded before control is in the worker's static cache",
        timeout: 30_000,
      },
    )
    .toEqual({ agendaListed: true, missing: [] });

  // Offline: the reload is the saved copy, and the agenda opens from the worker alone.
  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  await expect(savedCopyBar(page).bar).toHaveAttribute("data-state", "saved-fresh");
  await openAgenda(page);
});

test("12. a saved copy whose JavaScript fails to load still shows the CSS notice", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await seedCase();
  await pickAndSave(page, origin, caseTarget(show));

  // Overwrite, not delete: on a miss the worker would refetch, and the HTTP
  // cache holds these immutable URLs and would answer even with the proxy refusing.
  const poisoned = await poisonStaticScripts(page);
  expect(poisoned.length).toBeGreaterThan(0);

  proxy.setMode("refuse");
  await page.reload();
  // Premise: the page ran the poisoned entries, so no real script can have
  // reached it from another cache.
  expect(
    await page.evaluate(
      () => (window as unknown as { __fxavScriptBlocked?: unknown }).__fxavScriptBlocked,
    ),
  ).toBe(true);
  // Visible, not only present (Codex R1 D2): the properties lib/offline/inject.ts
  // sets on the notice, plus the ones that would hide it. A pseudo-element has no
  // rect of its own, so its box is its resolved width and height.
  const notice = await page.evaluate(() => {
    const style = getComputedStyle(document.body, "::before");
    return {
      content: style.content,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position,
      top: style.top,
      paddingTop: parseFloat(style.paddingTop),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
    };
  });
  expect(notice.content).toContain("Saved copy from");
  expect(notice.display, "the notice is laid out").toBe("block");
  expect(notice.visibility).toBe("visible");
  expect(notice.opacity).toBe("1");
  expect(notice.position, "the notice stays at the top as the page scrolls").toBe("sticky");
  expect(notice.top).toBe("0px");
  expect(notice.paddingTop).toBeGreaterThan(0);
  expect(notice.width, "the notice has a width").toBeGreaterThan(0);
  expect(notice.height, "the notice has a height").toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-fxav-bar"))).toBe(
    false,
  );
});

test("13. an unpublish the phone never saw still wipes an ended copy", async ({
  crewPage: page,
  crewContext,
  origin,
  crewProxy: proxy,
}) => {
  const show = await seedCase();
  const path = crewUrlPath(show);
  const saved = await pickAndSave(page, origin, caseTarget(show));
  await page.close();

  expect(await unpublishShow(show.showId)).toBe(true);
  // One epoch bump: only `unpublished_at` can make the status route say gone.
  expect(await archiveShow(show.showId)).toBe(true);
  const fresh = await crewContext.newPage();
  await leaveShow(fresh, origin);
  // Case 3 is this sequence without the unpublish and gets `ended`.
  expect(await statusFor(fresh, saved)).toEqual({ status: 200, body: { state: "gone" } });

  const mark = proxy.received().length;
  await fresh.goto(`${origin}${path}`);
  await expect(fresh.getByTestId("crew-not-found-root")).toBeVisible();
  await expectNoCopyOf(fresh, show.showId);
  expect(statusAsksSince(proxy, mark), "the worker asked the status route").not.toEqual([]);

  proxy.setMode("refuse");
  await fresh.reload();
  await expectNotSavedPage(fresh);
});

test("14. the kill-switch worker removes itself and every saved copy", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await seedCase();
  await pickAndSave(page, origin, caseTarget(show));

  proxy.stub("/sw.js", Buffer.from(KILL_SWITCH_SOURCE), "application/javascript");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration === undefined) throw new Error("no worker registration to update");
    await registration.update();
  });
  await expect
    .poll(
      () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      {
        timeout: 30_000,
      },
    )
    .toBe(0);
  await expect
    .poll(
      async () => {
        const state = await readSavedCopies(page);
        return { database: state.database, caches: Object.keys(state.caches) };
      },
      { timeout: 30_000 },
    )
    .toEqual({ database: false, caches: [] });

  proxy.setMode("refuse");
  await expect(page.reload()).rejects.toThrow();
});

test("15. hydration is clean on a served copy, offline and ended", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const hydrationErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && HYDRATION_ERROR.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));

  // Case 1's served copy: the Waldorf page, offline.
  const waldorf = await waldorfShow();
  await pickAndSave(page, origin, caseTarget(waldorf));
  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  await expect(savedCopyBar(page).bar).toHaveAttribute("data-state", "saved-fresh");

  // Case 3's served copy: an archived show, ended online and then offline.
  proxy.setMode("pass");
  const show = await seedCase();
  const path = crewUrlPath(show);
  await pickAndSave(page, origin, caseTarget(show));
  await leaveShow(page, origin);
  expect(await archiveShow(show.showId)).toBe(true);
  await page.goto(`${origin}${path}`);
  await waitForCrewHydrated(page);
  await expect(savedCopyBar(page).bar).toHaveAttribute("data-state", "ended");
  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  await expect(savedCopyBar(page).bar).toHaveAttribute("data-state", "ended");

  expect(hydrationErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
