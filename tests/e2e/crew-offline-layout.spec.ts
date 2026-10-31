/**
 * tests/e2e/crew-offline-layout.spec.ts: the saved-copy bar's Dimensional
 * Invariants (spec 4.7.2) measured in a real browser, under Chromium and WebKit
 * against the production build.
 *
 * The bar renders inside an always-mounted live region, `saved-copy-bar-region`
 * (components/offline/SavedCopyBar.tsx), and the region is the crew shell's
 * flex child. So the rows that face the shell measure the region against
 * `crew-shell`, and the bar against the region. Every rect comes from
 * getBoundingClientRect() and every comparison allows 0.5 px. A row that holds
 * by CSS default says so where it is asserted: it is a regression pin, and the
 * comment names what it rests on.
 *
 * The saved copy is served as crew-offline.spec.ts serves it, by the fixture's
 * proxy refusing every request (helpers/crewOfflineFixture.ts). Readiness is
 * the fixture's: the crew shell, the bar's hydration signal on <html>, then the
 * bar's own state attribute. Reduced motion is emulated before the first
 * navigation, so the section crossfade and the avatar menu's enter animation
 * are instant and every rect read is a settled one.
 *
 * Case 7 is the bar's one accessibility row: a focused control scrolls out from
 * under the sticky bar, because the bar keeps the page's `scroll-padding-top` at
 * its own height (WCAG 2.4.11). Case 8 is the in-flow detail the owner's
 * one-line bar adds (2026-10-30): it sits right under the region, spans the
 * shell, and scrolls away while the region stays pinned. Case 9 is the bar's one
 * bottom edge (UI gate re-check E4): the detail draws it at rest, the pinned
 * line once the detail has scrolled under it, at an unchanged height.
 *
 * Run it with the command crew-offline.spec.ts gives, naming this file instead.
 *
 * Data: one `seedShowWithCrew` show per case, deleted after it. Its dates span
 * eighteen days, so the Schedule section is tall enough to scroll the header
 * out of view with room to spare (a premise wherever it is relied on).
 */
import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { premise, premiseHolds } from "../_shared/premise";

import type { CrewOfflineProxy } from "./helpers/crewOfflineProxy";
import {
  assertServerUnderTest,
  crewUrlPath,
  expect,
  openAvatarMenu,
  pickAndSave,
  savedCopyBar,
  test,
} from "./helpers/crewOfflineFixture";
import { waitForCrewHydrated } from "./helpers/savedCopyProbe";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";

/** Every geometric comparison in this file. */
const TOLERANCE_PX = 0.5;

/** The phone width the spec's table is written for (the fixture's own viewport). */
const PHONE = { width: 390, height: 844 };

/** The narrowest supported width, where the bar's copy wraps. */
const NARROW = { width: 320, height: 844 };

/**
 * Wide enough for CrewSubNav's in-flow tab row (`min-[720px]:flex`), which
 * scrolls with the page and so can pass under the stuck bar. Below 720 px the
 * tabs are the fixed bottom bar, which never does.
 */
const TABLET = { width: 800, height: 844 };

/** How far past the header's bottom the sticky row scrolls (the brief's figure). */
const SCROLL_PAST_HEADER_PX = 200;

/** Sixteen show days between travel in and set, and travel out: eighteen day cards. */
const SHOW_DAYS = Array.from({ length: 16 }, (_, i) => `2027-03-${String(3 + i).padStart(2, "0")}`);

type CaseShow = { showId: string; slug: string; shareToken: string; crewMemberId: string };

type Box = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

const seeded: string[] = [];

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ crewOfflineProxy }) => {
  await assertServerUnderTest(crewOfflineProxy);
});

test.afterEach(async () => {
  for (const driveFileId of seeded.splice(0)) await deleteSeededShow(driveFileId);
});

/** A fresh published show with one crew member and a long schedule, removed after the case. */
async function seedCase(): Promise<CaseShow> {
  const show = await seedShowWithCrew({
    driveFileId: `crew-offline-layout-e2e:${randomUUID()}`,
    title: "Crew Offline Layout E2E",
    crew: [{ name: "Riley Layout", role: "A1" }],
    dates: {
      travelIn: "2027-03-01",
      set: "2027-03-02",
      showDays: SHOW_DAYS,
      travelOut: "2027-03-19",
    },
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

/** Picks the show's crew member on a live page and waits for the first visit's save. */
async function openLive(page: Page, origin: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(PHONE);
  const show = await seedCase();
  await pickAndSave(page, origin, {
    showId: show.showId,
    path: crewUrlPath(show),
    crewMemberId: show.crewMemberId,
  });
}

/** The saved copy, served with the proxy refusing, with its bar showing `saved-fresh`. */
async function openSavedCopy(page: Page, origin: string, proxy: CrewOfflineProxy): Promise<void> {
  await openLive(page, origin);
  proxy.setMode("refuse");
  await page.reload();
  await waitForCrewHydrated(page);
  await expect(savedCopyBar(page).bar).toHaveAttribute("data-state", "saved-fresh");
}

/** Switches the saved copy to its Schedule section from the phone sub-nav. */
async function showSchedule(page: Page): Promise<void> {
  await page.getByTestId("crew-sub-nav").locator('[data-section="schedule"]:visible').click();
  await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
    "data-active-section",
    "schedule",
  );
  await expect(page.getByTestId("section-schedule")).toBeVisible();
}

async function boxOf(page: Page, testId: string): Promise<Box> {
  return page.getByTestId(testId).evaluate((node) => {
    const r = node.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  });
}

/**
 * Soft, so a run reports every row that fails rather than stopping at the
 * first: the red record for this task names each row.
 */
function expectNear(actual: number, expected: number, what: string): void {
  expect
    .soft(Math.abs(actual - expected), `${what}: measured ${actual}, expected ${expected}`)
    .toBeLessThanOrEqual(TOLERANCE_PX);
}

/** The region is the shell's own flex child and holds the bar, when there is one. */
async function expectRegionIsShellChild(page: Page): Promise<void> {
  const parent = await page
    .getByTestId("saved-copy-bar-region")
    .evaluate((node) => node.parentElement?.getAttribute("data-testid") ?? null);
  premiseHolds(
    `saved-copy-bar-region is a direct child of crew-shell (its parent is ${parent ?? "none"}), ` +
      "so the shell rows below measure the flex relationship they name",
    parent === "crew-shell",
  );
}

test("1. on a live page the empty region adds no height", async ({ crewPage: page, origin }) => {
  await openLive(page, origin);
  await expectRegionIsShellChild(page);
  await expect(savedCopyBar(page).bar).toHaveCount(0);
  const childCount = await page
    .getByTestId("saved-copy-bar-region")
    .evaluate((node) => node.childElementCount);
  premiseHolds("the live page's region holds no bar (the bar is hidden)", childCount === 0);

  const region = await boxOf(page, "saved-copy-bar-region");
  expectNear(region.height, 0, "the empty region's height");
});

test("2. the region spans the shell and hugs the bar", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await openSavedCopy(page, origin, proxy);
  await expectRegionIsShellChild(page);
  const shell = await boxOf(page, "crew-shell");
  const region = await boxOf(page, "saved-copy-bar-region");
  const bar = await boxOf(page, "saved-copy-bar");
  const content = await boxOf(page, "saved-copy-bar-content");
  const style = await page.getByTestId("saved-copy-bar").evaluate((node) => {
    const s = getComputedStyle(node);
    return {
      padding: parseFloat(s.paddingTop) + parseFloat(s.paddingBottom),
      border: parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth),
    };
  });
  const iconOuter = await page.getByTestId("saved-copy-bar-icon").evaluate((node) => {
    return node.getBoundingClientRect().height + parseFloat(getComputedStyle(node).marginTop);
  });

  // Width. Regression pin: the shell sets no align-items, and `normal` stretches
  // a flex column's items, so this holds without `self-stretch`; the class keeps
  // it holding if the shell ever gains an items-* utility.
  expectNear(region.width, shell.width, "the region's width against crew-shell's");
  expectNear(region.left, shell.left, "the region's left edge against crew-shell's");
  expectNear(bar.width, region.width, "the bar's width against the region's");

  // Height. Regression pin: a flex item's grow factor defaults to 0, so this
  // holds without `flex-none`; the class keeps it holding if the region ever
  // gains a grow utility. The bar's formula assumes the copy is the bar's
  // tallest item, which is the premise.
  premise("the copy is taller than the icon and its top margin", content.height, iconOuter);
  expectNear(region.height, bar.height, "the region's height against the bar's");
  expectNear(
    bar.height,
    content.height + style.padding + style.border,
    "the bar's height against its copy plus vertical padding and borders",
  );
});

test("3. the region stays at the viewport top after scrolling past the header", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await openSavedCopy(page, origin, proxy);
  await showSchedule(page);
  const header = await boxOf(page, "page-header");
  const target = Math.round(header.bottom + SCROLL_PAST_HEADER_PX);
  const room = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  premise("the page scrolls past the header's bottom plus 200 px", room, target);
  const scrolled = await page.evaluate((y) => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, target);
  premiseHolds(
    `the window scrolled to ${target} (it reads ${scrolled})`,
    Math.abs(scrolled - target) <= 1,
  );

  const region = await boxOf(page, "saved-copy-bar-region");
  const bar = await boxOf(page, "saved-copy-bar");
  expectNear(region.top, 0, "the region's top after scrolling past the header");
  expectNear(bar.top, 0, "the bar's top after scrolling past the header");

  const hit = await page.getByTestId("saved-copy-bar").evaluate((node) => {
    const r = node.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      inside: at !== null && node.contains(at),
      what:
        at === null
          ? "nothing"
          : `${at.tagName} ${at.getAttribute("data-testid") ?? at.getAttribute("aria-label") ?? ""}`,
    };
  });
  expect(hit.inside, `the bar's centre hits the bar, not ${hit.what}`).toBe(true);
});

test("4. the region paints above a positioned element scrolled under it", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await openSavedCopy(page, origin, proxy);
  await showSchedule(page);

  // A positioned, z-index auto element of the page, after the region in tree
  // order, that can be scrolled to sit under the stuck bar. Such an element
  // paints over an in-flow element whose stacking is `auto` or 0, so only a
  // positive z-index on the region keeps the bar on top of it. A plain block of
  // text under the bar proves nothing about the z-index, which is why the bar's
  // own centre (case 3) is not enough.
  const pick = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="crew-shell"]');
    const region = document.querySelector('[data-testid="saved-copy-bar-region"]');
    const header = document.querySelector('[data-testid="page-header"]');
    if (shell === null || region === null || header === null) return null;
    const barHeight = region.getBoundingClientRect().height;
    const stuckFrom = header.getBoundingClientRect().bottom + window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    // An element inside fixed or sticky chrome (the phone sub-nav is fixed) does
    // not scroll with the page, so it can never be brought under the bar.
    const scrollsWithPage = (node: Element): boolean => {
      for (let at = node.parentElement; at !== null && at !== shell; at = at.parentElement) {
        const position = getComputedStyle(at).position;
        if (position === "fixed" || position === "sticky") return false;
      }
      return true;
    };
    for (const node of shell.querySelectorAll("*")) {
      if (region.contains(node) || header.contains(node)) continue;
      if (!(region.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const s = getComputedStyle(node);
      if (s.position !== "relative" && s.position !== "absolute") continue;
      if (s.zIndex !== "auto" || s.visibility !== "visible" || s.pointerEvents === "none") continue;
      if (!scrollsWithPage(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const centreX = r.left + r.width / 2;
      if (centreX < 0 || centreX >= window.innerWidth) continue;
      const scrollTo = Math.round(r.top + r.height / 2 + window.scrollY - barHeight / 2);
      if (scrollTo <= stuckFrom + 1 || scrollTo > maxScroll) continue;
      node.setAttribute("data-layout-probe", "");
      return {
        scrollTo,
        what: `${node.tagName} ${node.getAttribute("data-testid") ?? node.getAttribute("aria-label") ?? ""}`,
      };
    }
    return null;
  });
  premiseHolds(
    "the page has a positioned element, after the region, that scrolls under the stuck bar",
    pick !== null,
  );
  if (pick === null) return;
  await page.evaluate((y) => window.scrollTo(0, y), pick.scrollTo);

  const region = await boxOf(page, "saved-copy-bar-region");
  expect(
    Math.abs(region.top),
    `the region is stuck at the viewport top (top ${region.top})`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);

  const probe = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="saved-copy-bar"]');
    const target = document.querySelector("[data-layout-probe]");
    if (bar === null || target === null) return null;
    const b = bar.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const x = t.left + t.width / 2;
    const y = t.top + t.height / 2;
    const at = document.elementFromPoint(x, y);
    return {
      underBar: x >= b.left && x <= b.right && y >= b.top && y <= b.bottom,
      hitTestable: document.elementsFromPoint(x, y).includes(target),
      inBar: at !== null && bar.contains(at),
      hit:
        at === null
          ? "nothing"
          : `${at.tagName} ${at.getAttribute("data-testid") ?? at.getAttribute("aria-label") ?? ""}`,
    };
  });
  premiseHolds("the bar and the probe element are both on the page", probe !== null);
  if (probe === null) return;
  premiseHolds(`the centre of ${pick.what} lies inside the stuck bar`, probe.underBar);
  premiseHolds(`${pick.what} is hit-testable at its centre, beneath the bar`, probe.hitTestable);
  expect(probe.inBar, `the bar paints above ${pick.what}; the point hit ${probe.hit}`).toBe(true);
});

test("5. an open avatar menu paints above the bar", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await openSavedCopy(page, origin, proxy);
  await openAvatarMenu(page);
  const probe = await page.evaluate(() => {
    const popover = document.querySelector('[data-testid="avatar-menu-popover"]');
    const bar = document.querySelector('[data-testid="saved-copy-bar"]');
    if (popover === null || bar === null) return null;
    const p = popover.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const left = Math.max(p.left, b.left);
    const right = Math.min(p.right, b.right);
    const top = Math.max(p.top, b.top);
    const bottom = Math.min(p.bottom, b.bottom);
    const at = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return {
      width: right - left,
      height: bottom - top,
      inMenu: at !== null && popover.contains(at),
      hit:
        at === null
          ? "nothing"
          : `${at.tagName} ${at.getAttribute("data-testid") ?? at.getAttribute("aria-label") ?? ""}`,
    };
  });
  premiseHolds("the open menu and the bar are both on the page", probe !== null);
  if (probe === null) return;
  premise("the open menu overlaps the bar horizontally", probe.width, 1);
  premise("the open menu overlaps the bar vertically", probe.height, 1);
  expect(probe.inMenu, `the menu paints above the bar where they overlap; hit ${probe.hit}`).toBe(
    true,
  );
});

/** The pinned line's rendered line count, and the icon against its declared size. */
async function measurePinnedLine(page: Page) {
  const measured = await page.evaluate(() => {
    const icon = document.querySelector('[data-testid="saved-copy-bar-icon"]');
    const content = document.querySelector('[data-testid="saved-copy-bar-content"]');
    if (icon === null || content === null) return null;
    const sizeClasses = [...icon.classList].filter((name) => name.startsWith("size-"));
    // What the icon's size class declares, read from a free-standing element
    // carrying the same class, outside any flex row that could shrink it.
    const declared = document.createElement("div");
    declared.className = sizeClasses.join(" ");
    declared.style.position = "absolute";
    declared.style.visibility = "hidden";
    document.body.append(declared);
    const d = declared.getBoundingClientRect();
    declared.remove();
    const i = icon.getBoundingClientRect();
    return {
      sizeClasses,
      declared: { width: d.width, height: d.height },
      icon: { width: i.width, height: i.height },
      contentHeight: content.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(content).lineHeight),
    };
  });
  premiseHolds("the icon and the pinned line are on the page", measured !== null);
  const m = measured!;
  premiseHolds(
    `the icon carries exactly one size class (${m.sizeClasses.join(", ")})`,
    m.sizeClasses.length === 1,
  );
  premise("the size class declares a real size", m.declared.width, 0);
  premise("the pinned line has a real line height", m.lineHeight, 0);
  return { ...m, lines: Math.round(m.contentHeight / m.lineHeight) };
}

/** Below the narrowest supported width, where the pinned line must wrap. */
const WRAPPING = { width: 240, height: 844 };

test("6. the pinned line is one line at 390 px and at most two at 320 px, and the icon keeps its size", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  // Spec 4.7.2 (owner decision 2026-10-30): one short pinned line. For this
  // case's same-day save served offline it reads "Saved {time}, {ago}. No signal."
  await openSavedCopy(page, origin, proxy);
  const phone = await measurePinnedLine(page);
  expect(phone.lines, `the pinned line's lines at 390 px (${phone.contentHeight} px)`).toBe(1);

  await page.setViewportSize(NARROW);
  const narrow = await measurePinnedLine(page);
  expect(
    narrow.lines,
    `the pinned line's lines at 320 px (${narrow.contentHeight} px)`,
  ).toBeLessThanOrEqual(2);
  expectNear(narrow.icon.width, narrow.declared.width, "the icon's width at 320 px");
  expectNear(narrow.icon.height, narrow.declared.height, "the icon's height at 320 px");

  // The icon row's invariant is about a wrapping line, which 320 px may not
  // produce for a short line, so it is also measured where the line must wrap.
  await page.setViewportSize(WRAPPING);
  const wrapped = await measurePinnedLine(page);
  premise("the pinned line wraps at 240 px", wrapped.lines, 1);
  expectNear(wrapped.icon.width, wrapped.declared.width, "the icon's width when the line wraps");
  expectNear(wrapped.icon.height, wrapped.declared.height, "the icon's height when the line wraps");
});

test("7. a focused control is not left under the bar", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await openSavedCopy(page, origin, proxy);
  await page.setViewportSize(TABLET);
  await showSchedule(page);

  // A section tab in the in-flow tab row: the control under test. Not the open
  // section's tab, which showSchedule just clicked, and Chromium focuses a
  // button on click.
  const tabs = page
    .getByTestId("crew-sub-nav")
    .locator("nav button[data-section]:not([aria-current]):visible");
  premise("the in-flow tab row shows another section's tab", await tabs.count(), 0);
  const target = tabs.first();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // Scroll so the target's top sits at the viewport top, where the stuck bar is.
  const place = await target.evaluate((node) => {
    const header = document.querySelector('[data-testid="page-header"]');
    return {
      scrollTo: Math.round(node.getBoundingClientRect().top + window.scrollY),
      headerBottom: (header?.getBoundingClientRect().bottom ?? Number.NaN) + window.scrollY,
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  premise(
    "the tab row starts below the header, so the bar is stuck when the row reaches the top",
    place.scrollTo,
    place.headerBottom + 1,
  );
  premise(
    "the page scrolls far enough to bring the tab row to the top",
    place.maxScroll + 1,
    place.scrollTo,
  );
  await page.evaluate((y) => window.scrollTo(0, y), place.scrollTo);

  const regionBefore = await boxOf(page, "saved-copy-bar-region");
  const barBefore = await boxOf(page, "saved-copy-bar");
  const targetBefore = await target.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const bar = document.querySelector('[data-testid="saved-copy-bar"]');
    return {
      top: r.top,
      height: r.height,
      focused: node === document.activeElement,
      coveredByBar: at !== null && bar !== null && bar.contains(at),
    };
  });
  premiseHolds(
    `the region is stuck at the viewport top (top ${regionBefore.top})`,
    Math.abs(regionBefore.top) <= TOLERANCE_PX,
  );
  premiseHolds(
    `the tab's top (${targetBefore.top}) is under the bar, which ends at ${barBefore.bottom}`,
    targetBefore.top >= barBefore.top - TOLERANCE_PX && targetBefore.top < barBefore.bottom - 1,
  );
  premiseHolds(
    `more than half of the tab (${targetBefore.height} px) is under the bar`,
    targetBefore.top + targetBefore.height / 2 < barBefore.bottom,
  );
  premiseHolds("the bar paints over the tab's centre before focus", targetBefore.coveredByBar);
  premiseHolds("the tab is not focused yet", !targetBefore.focused);

  // The page reserves the bar's height while it shows: the mechanism under test.
  const padding = await page.evaluate(() => document.documentElement.style.scrollPaddingTop);
  expectNear(
    parseFloat(padding),
    regionBefore.height,
    "html scroll-padding-top against the region's height",
  );

  // Programmatic focus scrolls an obscured element into view under the same
  // scroll padding that keyboard focus uses, and it is the same call on every
  // engine. The element is inside the viewport, so with no padding nothing
  // scrolls and it stays under the bar.
  await target.focus();
  premiseHolds(
    "the target tab has focus",
    await target.evaluate((node) => node === document.activeElement),
  );

  const barAfter = await boxOf(page, "saved-copy-bar");
  const targetAfter = await target.evaluate((node) => node.getBoundingClientRect().top);
  expect(
    targetAfter,
    `the focused tab's top (${targetAfter}) is at or below the bar's bottom (${barAfter.bottom})`,
  ).toBeGreaterThanOrEqual(barAfter.bottom - TOLERANCE_PX);
});

test("8. the detail sits right under the region, spans the shell, and scrolls away", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  await openSavedCopy(page, origin, proxy);
  await showSchedule(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(savedCopyBar(page).detail).toHaveText("Showing your saved copy.");

  const sibling = await page
    .getByTestId("saved-copy-bar-region")
    .evaluate((node) => node.nextElementSibling?.getAttribute("data-testid") ?? null);
  premiseHolds(
    `the detail is the region's next sibling in crew-shell (found ${sibling ?? "none"})`,
    sibling === "saved-copy-bar-detail",
  );
  const shell = await boxOf(page, "crew-shell");
  const region = await boxOf(page, "saved-copy-bar-region");
  const detail = await boxOf(page, "saved-copy-bar-detail");
  premise("the detail has a real height", detail.height, 0);
  expectNear(detail.top, region.bottom, "the detail's top against the region's bottom");
  expectNear(detail.width, shell.width, "the detail's width against crew-shell's");
  expectNear(detail.left, shell.left, "the detail's left edge against crew-shell's");
  const position = await page
    .getByTestId("saved-copy-bar-detail")
    .evaluate((node) => getComputedStyle(node).position);
  expect(position, "the detail is in normal flow").toBe("static");

  // Scrolled past the header plus 200 px: the region is pinned, the detail gone.
  const header = await boxOf(page, "page-header");
  const target = Math.round(header.bottom + SCROLL_PAST_HEADER_PX);
  const room = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  premise("the page scrolls past the header's bottom plus 200 px", room, target);
  await page.evaluate((y) => window.scrollTo(0, y), target);
  const regionAfter = await boxOf(page, "saved-copy-bar-region");
  const detailAfter = await boxOf(page, "saved-copy-bar-detail");
  expectNear(regionAfter.top, 0, "the region's top after scrolling past the header");
  expect(detailAfter.top, "the detail's top has scrolled above the viewport").toBeLessThan(0);
  expect(detailAfter.bottom, "and so has the rest of it").toBeLessThanOrEqual(TOLERANCE_PX);
});

/** The bottom border's computed width and colour, read from the element with `testId`. */
async function bottomEdgeOf(page: Page, testId: string): Promise<{ width: number; color: string }> {
  return page.getByTestId(testId).evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: parseFloat(style.borderBottomWidth), color: style.borderBottomColor };
  });
}

/** A computed colour's alpha: 0 for `transparent`, 1 for an opaque `rgb()`. */
function alphaOf(color: string): number {
  const rgba = /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)$/.exec(color);
  if (rgba !== null) return Number(rgba[1]);
  if (/^rgb\(/.test(color)) return 1;
  throw new Error(`not an rgb() or rgba() colour: ${color}`);
}

test("9. one bottom edge: under the detail at rest, under the pinned line once the detail has scrolled away", async ({
  crewPage: page,
  origin,
  crewProxy: proxy,
}) => {
  // UI gate re-check E4: the edge never splits the pinned line from its detail.
  await openSavedCopy(page, origin, proxy);
  await showSchedule(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(savedCopyBar(page).detail).toHaveText("Showing your saved copy.");

  const barAtRest = await bottomEdgeOf(page, "saved-copy-bar");
  const detailAtRest = await bottomEdgeOf(page, "saved-copy-bar-detail");
  const heightAtRest = (await boxOf(page, "saved-copy-bar")).height;
  premise("the detail draws a visible edge at rest", alphaOf(detailAtRest.color), 0);
  expect(barAtRest.color, "at rest the pinned line's edge is transparent").toBe("rgba(0, 0, 0, 0)");
  expect(barAtRest.width, "the pinned line keeps its border at rest").toBeGreaterThan(0);

  // Scrolled until the detail is entirely under the pinned line.
  const header = await boxOf(page, "page-header");
  const target = Math.round(header.bottom + SCROLL_PAST_HEADER_PX);
  await page.evaluate((y) => window.scrollTo(0, y), target);
  const detailAfter = await boxOf(page, "saved-copy-bar-detail");
  const regionAfter = await boxOf(page, "saved-copy-bar-region");
  premiseHolds(
    `the detail is under the pinned line (detail bottom ${detailAfter.bottom}, region bottom ${regionAfter.bottom})`,
    detailAfter.bottom <= regionAfter.bottom + TOLERANCE_PX,
  );
  await expect
    .poll(async () => (await bottomEdgeOf(page, "saved-copy-bar")).color, {
      message: "the pinned line draws the edge once the detail has gone",
    })
    .toBe(detailAtRest.color);
  const barAfter = await bottomEdgeOf(page, "saved-copy-bar");
  expectNear(barAfter.width, barAtRest.width, "the pinned line's border width, scrolled");
  expectNear(
    (await boxOf(page, "saved-copy-bar")).height,
    heightAtRest,
    "the pinned line's height, scrolled",
  );

  // Back to the top: the detail draws it again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () => (await bottomEdgeOf(page, "saved-copy-bar")).color)
    .toBe("rgba(0, 0, 0, 0)");
});
