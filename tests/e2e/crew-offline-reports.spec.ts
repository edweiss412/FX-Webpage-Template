/**
 * tests/e2e/crew-offline-reports.spec.ts: offline reports in a real browser
 * (crew offline spec 2026-10-26 §7, Reports), under Chromium and WebKit against
 * the production build.
 *
 * "No signal" is the proxy refusing, as in crew-offline.spec.ts, so the browser
 * meets a real network error. Every POST that could reach `createIssue` is either
 * answered by the proxy or goes to a server whose GitHub repo is blanked in
 * playwright.config.ts, so no case can file a real issue, whatever the route does.
 * `upstreamStatus` on the proxy's log tells a real answer from a scripted one.
 *
 * Run (one production build per invocation; heavy, so through the slot):
 *   CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test \
 *     --project=crew-offline-chromium --project=crew-offline-webkit \
 *     tests/e2e/crew-offline-reports.spec.ts
 *
 * Data: `seedShowWithCrew` per case, deleted after it. A POST that reaches the
 * route reserves a `reports` row and `reports.show_id` has no delete cascade, so
 * those rows go first.
 */
import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { premiseHolds } from "../_shared/premise";

import type { CrewOfflineProxy, ReceivedRequest } from "./helpers/crewOfflineProxy";
import {
  assertServerUnderTest,
  crewUrlPath,
  expect,
  pickAndSave,
  test,
} from "./helpers/crewOfflineFixture";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { admin } from "./helpers/supabaseAdmin";

const DB_NAME = "fxav-report-queue";
const STORE = "reports";
const CREATED = { status: 201, body: { ok: true, status: "created" } };

type Stored = Record<string, unknown> & { id: string; status: string; message: string };

type CaseShow = { showId: string; slug: string; shareToken: string; crewMemberId: string };

const seeded: Array<{ driveFileId: string; showId: string }> = [];

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ crewOfflineProxy }) => {
  await assertServerUnderTest(crewOfflineProxy);
});

test.afterEach(async () => {
  for (const { driveFileId, showId } of seeded.splice(0)) {
    const { error } = await admin.from("reports").delete().eq("show_id", showId);
    if (error) throw new Error(`crew offline reports e2e: ${error.message}`);
    await deleteSeededShow(driveFileId);
  }
});

async function seedCase(): Promise<CaseShow> {
  const show = await seedShowWithCrew({
    driveFileId: `crew-offline-reports-e2e:${randomUUID()}`,
    title: "Crew Offline Reports E2E",
    venue: { name: "Offline Hall", address: "41 Dock Road" } as never,
    crew: [{ name: "Riley Offline", role: "A1" }],
  });
  seeded.push({ driveFileId: show.driveFileId, showId: show.showId });
  const crewMember = show.crew[0];
  if (crewMember === undefined) throw new Error("seedCase: the show has no crew member");
  return {
    showId: show.showId,
    slug: show.slug,
    shareToken: show.shareToken,
    crewMemberId: crewMember.id,
  };
}

async function openShow(page: Page, origin: string, show: CaseShow): Promise<void> {
  await pickAndSave(page, origin, {
    showId: show.showId,
    path: crewUrlPath(show),
    crewMemberId: show.crewMemberId,
  });
  await queueReady(page);
}

/** Set only after the first queue read and the listeners, so a later assertion can trust them. */
async function queueReady(page: Page): Promise<void> {
  await expect(
    page.locator('[data-testid="report-queue-region"][data-queue-ready="true"]'),
  ).toBeAttached();
}

const waiting = (page: Page) => page.getByTestId("report-queue-waiting");
const failed = (page: Page) => page.getByTestId("report-queue-failed");

/** Writes a report and submits it with the proxy refusing, up to the queued notice. */
async function writeReport(page: Page, text: string): Promise<void> {
  await page.getByTestId("report-button-trigger").click();
  await page.getByTestId("report-modal-textarea").fill(text);
  await page.getByTestId("report-modal-submit").click();
}

async function holdReport(page: Page, proxy: CrewOfflineProxy, text: string): Promise<void> {
  proxy.setMode("refuse");
  await writeReport(page, text);
  await expect(page.getByTestId("report-modal-queued")).toBeVisible();
  await page.getByTestId("report-modal-done").click();
  proxy.setMode("pass");
}

async function signalBack(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

function reportPosts(proxy: CrewOfflineProxy): ReceivedRequest[] {
  return proxy.received().filter((row) => row.method === "POST" && row.path === "/api/report");
}

function postBody(row: ReceivedRequest | undefined): Record<string, unknown> {
  premiseHolds("the POST was scripted, so its body was kept", row?.body !== undefined);
  return JSON.parse(row?.body ?? "{}") as Record<string, unknown>;
}

/** The queue as the page's own origin stores it. */
async function readQueue(page: Page): Promise<Stored[]> {
  return page.evaluate(
    ([name, store]) =>
      new Promise<Stored[]>((resolve, reject) => {
        const open = indexedDB.open(name as string);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db
            .transaction(store as string)
            .objectStore(store as string)
            .getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result as Stored[]);
          };
        };
      }),
    [DB_NAME, STORE],
  );
}

async function writeQueue(page: Page, records: Stored[]): Promise<void> {
  await page.evaluate(
    ([name, store, rows]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name as string);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction(store as string, "readwrite");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          const objects = transaction.objectStore(store as string);
          for (const row of rows as Stored[]) objects.put(row);
        };
      }),
    [DB_NAME, STORE, records] as const,
  );
}

function storedReport(show: CaseShow, n: number, overrides: Partial<Stored> = {}): Stored {
  return {
    id: randomUUID(),
    showId: show.showId,
    slug: show.slug,
    surface: "crew",
    surfaceId: `footer-crew-${show.slug}`,
    context: {},
    message: `report ${n}`,
    writtenAt: new Date(Date.UTC(2026, 10, 7, 12, n)).toISOString(),
    pageRenderedAt: null,
    writer: "viewer-key",
    status: "failed",
    errorCode: null,
    ...overrides,
  };
}

test("a report written with no signal survives the tab and sends itself", async ({
  crewPage,
  crewContext,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  // From a card, so the POST has the context only a card report carries.
  await crewPage.goto(`${origin}${crewUrlPath(show)}?s=venue`);
  const sheet = crewPage.getByTestId("crew-section-sheet-dialog");
  await expect(sheet).toHaveAttribute("data-section", "venue");
  await queueReady(crewPage);
  const marker = crewPage.locator("#fxav-saved-copy");
  const renderedAt = await marker.getAttribute("data-rendered-at");
  const viewer = await marker.getAttribute("data-viewer");

  crewProxy.setMode("refuse");
  await sheet.getByTestId("card-report-trigger").first().click();
  await crewPage.getByTestId("report-modal-textarea").fill("Freight elevator 3 is out");
  await crewPage.getByTestId("report-modal-submit").click();
  await expect(crewPage.getByTestId("report-modal-queued")).toHaveText(
    "Saved on your phone. It will send by itself when you have signal.",
  );
  await crewPage.getByTestId("report-modal-done").click();
  await expect(waiting(crewPage)).toHaveText("1 report waiting for signal");
  const [held] = await readQueue(crewPage);

  await crewPage.close();
  const next = await crewContext.newPage();
  await next.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(next);
  await expect(waiting(next)).toHaveText("1 report waiting for signal");

  crewProxy.answerNext("/api/report", [CREATED]);
  crewProxy.setMode("pass");
  await signalBack(next);
  await expect(waiting(next)).toHaveCount(0);
  expect(await readQueue(next)).toEqual([]);

  const body = postBody(reportPosts(crewProxy).find((row) => row.body !== undefined));
  expect(body.idempotency_key).toBe(held?.id);
  expect(body.message).toBe("Freight elevator 3 is out");
  expect(body.offline).toEqual({ writtenAt: held?.writtenAt, pageRenderedAt: renderedAt });
  expect(body.writer).toBe(viewer);
  expect(body.fieldRef).toMatchObject({ cardId: expect.any(String) });
});

test("reports written in two tabs at once both keep their place, in every tab", async ({
  crewPage,
  crewContext,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  const second = await crewContext.newPage();
  await second.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(second);
  const watcher = await crewContext.newPage();
  await watcher.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(watcher);
  await expect(waiting(watcher)).toHaveCount(0);

  crewProxy.setMode("refuse");
  for (const [page, text] of [
    [crewPage, "from the first tab"],
    [second, "from the second tab"],
  ] as const) {
    await page.getByTestId("report-button-trigger").click();
    await page.getByTestId("report-modal-textarea").fill(text);
  }
  await Promise.all([
    crewPage.getByTestId("report-modal-submit").click(),
    second.getByTestId("report-modal-submit").click(),
  ]);

  await expect(waiting(crewPage)).toHaveText("2 reports waiting for signal");
  await expect(waiting(second)).toHaveText("2 reports waiting for signal");
  await expect(waiting(watcher)).toHaveText("2 reports waiting for signal");
  const messages = (await readQueue(watcher)).map((report) => report.message).sort();
  expect(messages).toEqual(["from the first tab", "from the second tab"]);
});

test("a report sent from another tab clears the count here with no reload", async ({
  crewPage,
  crewContext,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  const second = await crewContext.newPage();
  await second.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(second);
  await holdReport(crewPage, crewProxy, "sent from the first tab");
  await expect(waiting(second)).toHaveText("1 report waiting for signal");

  crewProxy.answerNext("/api/report", [CREATED]);
  await signalBack(crewPage);
  await expect(waiting(crewPage)).toHaveCount(0);
  await expect(waiting(second)).toHaveCount(0);
});

test("503, 409 and 429 keep the report queued under one key", async ({
  crewPage,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  await holdReport(crewPage, crewProxy, "the rate limit case");
  const before = reportPosts(crewProxy).length;

  crewProxy.answerNext("/api/report", [
    { status: 503, body: { ok: false } },
    { status: 409, body: { ok: false, code: "IDEMPOTENCY_IN_FLIGHT" } },
    { status: 429, body: { ok: false, code: "REPORT_RATE_LIMITED_CREW" } },
    CREATED,
  ]);
  for (const attempt of [1, 2, 3]) {
    await signalBack(crewPage);
    await expect.poll(() => reportPosts(crewProxy).length).toBe(before + attempt);
    await expect(waiting(crewPage)).toHaveText("1 report waiting for signal");
  }

  // The 429's wait is live: a further try posts nothing.
  await signalBack(crewPage);
  await crewPage.waitForTimeout(500);
  expect(reportPosts(crewProxy).length).toBe(before + 3);

  // A load forgets the wait, in memory by design.
  await crewPage.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(crewPage);
  await expect(waiting(crewPage)).toHaveCount(0);

  const keys = new Set(
    reportPosts(crewProxy)
      .slice(before)
      .map((row) => postBody(row).idempotency_key),
  );
  expect(keys.size).toBe(1);
});

test("the real server files nothing for the wrong writer, and the report can be sent again", async ({
  crewPage,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  await holdReport(crewPage, crewProxy, "the writer case");

  // As written: the marker's key is the server's, so the POST gets past the writer
  // check, and the blanked GitHub repo answers 502. The report stays queued.
  await signalBack(crewPage);
  await expect
    .poll(() => reportPosts(crewProxy).at(-1)?.upstreamStatus, { timeout: 30_000 })
    .toBe(502);
  await expect(waiting(crewPage)).toHaveText("1 report waiting for signal");

  const [held] = await readQueue(crewPage);
  premiseHolds("the report is still held", held !== undefined);
  await writeQueue(crewPage, [{ ...(held as Stored), writer: "somebody-else" }]);
  await signalBack(crewPage);
  await expect.poll(() => reportPosts(crewProxy).at(-1)?.upstreamStatus).toBe(401);
  await expect(failed(crewPage)).toHaveText("1 report couldn't be sent");

  await failed(crewPage).click();
  await expect(crewPage.getByTestId("report-modal-textarea")).toHaveValue("the writer case");
  crewProxy.answerNext("/api/report", [CREATED]);
  await crewPage.getByTestId("report-modal-submit").click();
  await expect(crewPage.getByTestId("report-modal-success")).toBeVisible();
  await expect(failed(crewPage)).toHaveCount(0);
  expect(await readQueue(crewPage)).toEqual([]);
});

test("a refused report can be discarded, and stays gone", async ({
  crewPage,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  await holdReport(crewPage, crewProxy, "the discard case");

  crewProxy.answerNext("/api/report", [
    { status: 410, body: { ok: false, code: "REPORT_HORIZON_EXPIRED" } },
  ]);
  await signalBack(crewPage);
  await failed(crewPage).click();
  const discard = crewPage.getByTestId("report-modal-discard");
  await discard.click();
  await expect(discard).toHaveText("Tap again to discard");
  await discard.click();
  await expect(failed(crewPage)).toHaveCount(0);

  await crewPage.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(crewPage);
  await expect(failed(crewPage)).toHaveCount(0);
  expect(await readQueue(crewPage)).toEqual([]);
});

test("an eleventh report shows the failure copy and keeps its draft", async ({
  crewPage,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  await writeQueue(
    crewPage,
    Array.from({ length: 10 }, (_unused, n) => storedReport(show, n)),
  );

  crewProxy.setMode("refuse");
  await writeReport(crewPage, "the eleventh");

  await expect(crewPage.getByTestId("report-modal-error")).toBeVisible();
  await expect(crewPage.getByTestId("report-modal-queued")).toHaveCount(0);
  await expect(crewPage.getByTestId("report-modal-textarea")).toHaveValue("the eleventh");
  expect(await readQueue(crewPage)).toHaveLength(10);
});

test("the footer band holds both counts at 390px with no overflow", async ({
  crewPage,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  await writeQueue(crewPage, [
    storedReport(show, 1, { status: "queued" }),
    storedReport(show, 2, { status: "failed" }),
  ]);

  crewProxy.setMode("refuse");
  await crewPage.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(crewPage);
  await expect(waiting(crewPage)).toHaveText("1 report waiting for signal");
  await expect(failed(crewPage)).toHaveText("1 report couldn't be sent");

  const overflow = await crewPage
    .getByTestId("page-footer")
    .evaluate((footer) => footer.scrollWidth - footer.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const failedBox = await failed(crewPage).boundingBox();
  const triggerBox = await crewPage.getByTestId("report-button-trigger").boundingBox();
  expect(failedBox?.height).toBeGreaterThanOrEqual(44);
  expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
  expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
  const viewport = crewPage.viewportSize();
  premiseHolds("the case runs at the phone width", viewport?.width === 390);
  expect((triggerBox?.x ?? 0) + (triggerBox?.width ?? 0)).toBeLessThanOrEqual(390);
});

test("the counts and the failed sheet hold on a small screen and at a short one", async ({
  crewPage,
  crewProxy,
  origin,
}) => {
  const show = await seedCase();
  await openShow(crewPage, origin, show);
  await writeQueue(crewPage, [
    storedReport(show, 1, { status: "queued" }),
    storedReport(show, 2, { status: "failed" }),
  ]);
  crewProxy.setMode("refuse");
  await crewPage.setViewportSize({ width: 320, height: 568 });
  await crewPage.goto(`${origin}${crewUrlPath(show)}`);
  await queueReady(crewPage);
  await expect(failed(crewPage)).toBeVisible();

  // Past a phone's width of room, the counts take their own row rather than
  // pushing the band sideways. Text at 200% is the harshest ordinary case.
  await crewPage.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const overflow = await crewPage
    .getByTestId("page-footer")
    .evaluate((footer) => footer.scrollWidth - footer.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const trigger = await crewPage.getByTestId("report-button-trigger").boundingBox();
  expect((trigger?.x ?? 0) + (trigger?.width ?? 0)).toBeLessThanOrEqual(320);
  // Just past the small breakpoint the band is still one row, so 200% text there
  // is where the counts and the fine print would collide.
  await crewPage.setViewportSize({ width: 680, height: 800 });
  const finePrint = await crewPage.getByTestId("page-footer-fine-print").boundingBox();
  const count = await failed(crewPage).boundingBox();
  premiseHolds("both boxes measured", finePrint !== null && count !== null);
  const apart =
    (finePrint?.x ?? 0) + (finePrint?.width ?? 0) <= (count?.x ?? 0) ||
    (finePrint?.y ?? 0) + (finePrint?.height ?? 0) <= (count?.y ?? 0);
  expect(apart, "the counts never paint over the fine print").toBe(true);
  await crewPage.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });

  // A landscape phone: the sheet scrolls, so both ends can be reached.
  await crewPage.setViewportSize({ width: 844, height: 390 });
  await failed(crewPage).click();
  const close = crewPage.getByTestId("report-modal-close");
  const send = crewPage.getByTestId("report-modal-submit");
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeInViewport();
});
