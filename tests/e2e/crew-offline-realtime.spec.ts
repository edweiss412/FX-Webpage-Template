/**
 * tests/e2e/crew-offline-realtime.spec.ts: lifecycle changes that reach an
 * OPEN crew page by realtime refresh, not by a navigation (spec §7 "Client-side
 * renders", §4.3 "The marker also speaks for client-side renders").
 *
 * `ShowRealtimeBridge` calls `router.refresh()` on the invalidation each admin
 * RPC publishes, so the page re-renders through RSC and never passes through
 * the worker as a document. `<SavedCopyMarker>` posts the new render's
 * disposition instead: a reset renders the not-found page (`check`, status
 * `gone`, purge), an unpublish the paused page (`purge`), and an archive the
 * not-found page whose check answers `ended`, which marks the copy and reloads
 * so the worker serves it ended. A following offline reload shows the matching
 * result.
 *
 * Runs under Chromium only, by the crew-offline-chromium project's testMatch
 * (playwright.config.ts); nothing in this file chooses an engine.
 *
 * Readiness: the bridge's join reply on the show's invalidation channel is
 * observed on the page's own websocket before the change is made, and the
 * invalidation frame after it, so a pass cannot come from anything but the
 * realtime path (the frame oracle is tests/e2e/helpers/realtimeOracle.ts).
 */
import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import {
  assertServerUnderTest,
  crewUrlPath,
  expect,
  expectNoCopyOf,
  expectNotSavedPage,
  pickAndSave,
  savedCopyBar,
  test,
} from "./helpers/crewOfflineFixture";
import { archiveShow, rotateShareToken, unpublishShow } from "./helpers/crewOfflineLifecycle";
import {
  INVALIDATION_FRAME_TIMEOUT_MS,
  JOIN_REPLY_TIMEOUT_MS,
  isInvalidationFrame,
  isJoinReplyOk,
} from "./helpers/realtimeOracle";
import { readSavedCopies, waitForCrewHydrated } from "./helpers/savedCopyProbe";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";

/** Realtime refresh, the status check and the marker's reload, on a cold production server. */
const REALTIME_OUTCOME = { timeout: 30_000 };

const seeded: string[] = [];

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ crewOfflineProxy }) => {
  await assertServerUnderTest(crewOfflineProxy);
});

test.afterEach(async () => {
  for (const driveFileId of seeded.splice(0)) await deleteSeededShow(driveFileId);
});

/**
 * Seeds a show, records the page's websocket frames from before the first
 * navigation, picks the crew member and waits for the saved copy, then for the
 * bridge's join reply on the show's invalidation channel.
 */
async function openSavedShowWithRealtime(page: Page, origin: string) {
  const seed = await seedShowWithCrew({
    driveFileId: `crew-offline-e2e:${randomUUID()}`,
    title: "Crew Offline Realtime E2E",
    crew: [{ name: "Riley Offline", role: "A1" }],
  });
  seeded.push(seed.driveFileId);
  const crewMember = seed.crew[0];
  if (crewMember === undefined) throw new Error("the seeded show has no crew member");
  const frames: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", (frame) => frames.push(String(frame.payload)));
  });
  const path = crewUrlPath(seed);
  await pickAndSave(page, origin, {
    showId: seed.showId,
    path,
    crewMemberId: crewMember.id,
  });
  await expect
    .poll(() => frames.some((frame) => isJoinReplyOk(frame, seed.showId)), {
      message: "the realtime bridge joined the show's invalidation channel",
      timeout: JOIN_REPLY_TIMEOUT_MS,
    })
    .toBe(true);
  const invalidated = () =>
    expect
      .poll(() => frames.some((frame) => isInvalidationFrame(frame, seed.showId)), {
        message: "the invalidation reached the open page",
        timeout: INVALIDATION_FRAME_TIMEOUT_MS,
      })
      .toBe(true);
  return { showId: seed.showId, path, invalidated };
}

test("a reset arriving by realtime refresh wipes the copy", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await openSavedShowWithRealtime(page, origin);

  await rotateShareToken(show.showId);
  await show.invalidated();
  await expect(page.getByTestId("crew-not-found-root")).toBeVisible(REALTIME_OUTCOME);
  await expectNoCopyOf(page, show.showId);

  proxy.setMode("refuse");
  await page.reload();
  await expectNotSavedPage(page);
  await expect(page.getByTestId("crew-shell")).toHaveCount(0);
});

test("an archive arriving by realtime refresh marks the copy ended and reloads into it", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await openSavedShowWithRealtime(page, origin);
  const { bar, content } = savedCopyBar(page);

  expect(await archiveShow(show.showId)).toBe(true);
  await show.invalidated();
  // Only a document the worker served carries this meta, so the ended bar
  // below comes from the reload the marker triggered, not from the refresh.
  await expect(page.locator('meta[name="fxav-served"]')).toHaveAttribute(
    "content",
    "ended",
    REALTIME_OUTCOME,
  );
  await waitForCrewHydrated(page);
  await expect(bar).toHaveAttribute("data-state", "ended");
  await expect(content).toHaveText(/^This show has ended\./);
  const copy = (await readSavedCopies(page)).copies.find((c) => c.showId === show.showId);
  expect(copy?.endedAt).toEqual(expect.any(Number));

  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  await expect(bar).toHaveAttribute("data-state", "ended");
  await expect(content).toHaveText(/^This show has ended\./);
});

test("an unpublish arriving by realtime refresh wipes the copy", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  const show = await openSavedShowWithRealtime(page, origin);

  expect(await unpublishShow(show.showId)).toBe(true);
  await show.invalidated();
  await expect(page.getByTestId("crew-show-paused-root")).toBeVisible(REALTIME_OUTCOME);
  await expectNoCopyOf(page, show.showId);

  proxy.setMode("refuse");
  await page.reload();
  await expectNotSavedPage(page);
  await expect(page.getByTestId("crew-shell")).toHaveCount(0);
});
