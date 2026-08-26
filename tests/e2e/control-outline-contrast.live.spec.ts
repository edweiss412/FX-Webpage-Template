/**
 * tests/e2e/control-outline-contrast.live.spec.ts
 *
 * Spec: docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md
 * §14 and the done-condition's contrast half, AC-13.
 *
 * ALL FIVE surfaces AC-13 names, measured in a REAL browser rather than pinned
 * from source, at 390px in both themes. An earlier draft of this arc claimed
 * the wizard route was closed because `CrewRowActions` transitively imports
 * `lib/auth/requireAdmin.ts`; that was wrong, and the refutation is in this
 * same directory. `_step3ReviewModalBundle.mjs` replaces any `"use server"`
 * module with a throwing stub and empties node builtins by CLASS, which is
 * exactly that edge, and `_step3ReviewModalLiveEntry.tsx` mounts the real tree
 * with react-dom/client. This spec reuses both.
 *
 * TWO PAGES, one server. The venue tile and the crew contact icons render
 * inside the step-3 review tree, so they are measured on the modal page. The
 * BellPanel config row, the report textarea, the wizard step indicator's done
 * pill and the row-actions trigger do not, so they get their own entry
 * (`_controlOutlineAdminSurfacesEntry.tsx`) and their own page: the review
 * modal portals out of #root and covers the viewport, and anything mounted
 * beside it would be measured through an overlay.
 *
 * WHAT IT ASSERTS, and it is contrast rather than only geometry: the swept
 * outline is read off the COMPUTED style in both themes and its ratio against
 * the surface behind it must clear the 3:1 non-text floor (SC 1.4.11), which is
 * the done-condition this whole arc exists to move. Width parity is proved
 * elsewhere (`scripts/ac15-width-parity.mts`, 767 elements, 0 differences) and
 * cannot stand in for contrast.
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { enterWizardAdminState } from "./helpers/dashboardState";

const REPO_ROOT = resolve(__dirname, "..", "..");
const MOBILE = { width: 390, height: 900 } as const;
const FLOOR = 3.0;

/** One active row, at its most boring values: enough to keep the panel off its
 *  empty-state branch, and nothing this spec measures is derived from it. */
const BELL_ENTRY = {
  alertId: "alert-1",
  code: "SHOW_PARSE_FAILED",
  showId: "show-1",
  slug: "east-coast",
  state: "active",
  activityAt: "2026-07-05T09:00:00.000Z",
  resolvedAt: null,
  occurrences: 1,
  unread: true,
  context: null,
  identity: null,
  isAutoResolving: false,
  autoResolveNote: null,
  actions: [],
  messageParams: {},
  isHealth: false,
};

let server: Server | undefined;
let workDir: string;
let baseUrl = "";

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "control-outline-contrast-live-"));

  // NOTE on why this spec does not run the static tsx harness its two siblings
  // do. Running that harness BARE (`pnpm exec tsx …`) dies in
  // `lib/auth/requireDeveloper.ts`, but the cause is a missing e2e env
  // (`HASH_FOR_LOG_PEPPER`), NOT the module graph: with `.env.local` loaded it
  // renders 526KB fine. An earlier revision of this note called it broken on
  // main; it is not, and the correction is left visible rather than deleted.
  //
  // Those siblings use it only as a tailwind @source. So does this spec's need,
  // and the BUNDLE is a better source anyway: it is the same tree, it carries
  // every literal class string the live render can produce, and it is built by
  // the helper that already models Next's "use server" elision. One fewer
  // moving part, and not one that is currently red.
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_controlOutlineContrastLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // The four AC-13 surfaces that do NOT render inside the step-3 tree get a
  // SECOND entry, bundle and page rather than being appended to the first. The
  // review modal portals out of #root and covers the viewport, so anything
  // mounted beside it would be measured through an overlay.
  writeFileSync(
    join(workDir, "admin.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="admin.js"></script></body></html>`,
  );
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_controlOutlineAdminSurfacesEntry.tsx"),
      join(workDir, "admin.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(workDir, "bundle.js")}";\n@source "${join(workDir, "admin.js")}";\n${globals}`,
  );
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    // The bell panel renders its config row only once its feed load RESOLVES,
    // so the harness answers that one endpoint. Exactly ONE entry, and not
    // zero: an empty feed takes the panel's empty-state branch, which replaces
    // the whole body and the config row with it (probed — the page rendered
    // `bell-empty` and no `bell-config-history` at all).
    if (url === "/api/admin/alerts/bell/feed") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          entries: [BELL_ENTRY],
          unseenCount: 0,
          truncated: false,
          historyDays: 14,
          feedCap: 50,
          seenThrough: "2026-07-05T10:00:00.000Z",
        }),
      );
      return;
    }
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const addr = server!.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
});

async function open(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(MOBILE);
  await page.goto(baseUrl);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.evaluate(() => document.fonts.ready);
  // The modal portals OUT of #root, so a childElementCount wait on #root never
  // resolves even though the tree mounted. Wait for a testid the tree renders.
  await page.waitForSelector('[data-testid$="-review-main"]', { state: "attached" });
}

/**
 * Same as `open`, for the admin-surfaces page. Both waits are on surfaces that
 * arrive LATE — the bell panel's config row only exists once its feed load
 * resolves — so neither is decoration.
 */
async function openAdmin(
  page: Page,
  theme: "light" | "dark",
  surface: "bell" | "report" | "rows",
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(MOBILE);
  await page.goto(`${baseUrl}admin.html?surface=${surface}`);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.evaluate(() => document.fonts.ready);
  // Each wait is on the LAST thing that surface produces. The bell panel's
  // config row only exists once its feed load resolves, so waiting on the panel
  // itself would let a case read a still-loading panel.
  const settled = {
    bell: '[data-testid="bell-config-history"]',
    report: '[data-testid="report-modal-textarea"]',
    rows: '[data-testid="row-actions-open-host"] [data-testid^="row-actions-trigger-"]',
  } as const;
  await page.waitForSelector(settled[surface], { state: "attached" });
}

/**
 * The computed outline colour of a testid, its parent chain's first opaque
 * background, and the WCAG ratio between them.
 *
 * The background is walked rather than assumed: the element's own fill is the
 * inner edge, and where it has none the ground behind it is what the outline is
 * read against, which is exactly how DESIGN.md §1.2 states each pinned row.
 */
async function outlineContrast(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = (c: string): [number, number, number] | null => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      if (m[4] !== undefined && Number(m[4]) === 0) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const border = parse(getComputedStyle(el).borderTopColor);
    let node: Element | null = el;
    let bg: [number, number, number] | null = null;
    while (node && !bg) {
      bg = parse(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    if (!border || !bg) return { border: null, bg: null, ratio: null };
    const [hi, lo] = [lum(border), lum(bg)].sort((a, b) => b - a) as [number, number];
    return {
      border: getComputedStyle(el).borderTopColor,
      bg: bg.join(","),
      ratio: (hi + 0.05) / (lo + 0.05),
    };
  }, selector);
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: the venue Directions visual clears the 3:1 non-text floor`, async ({ page }) => {
    await open(page, theme);
    const region = page.locator('[data-testid="venue-map-region"]');
    await expect(region, "the fixture supplies a venue, so the tile mounts").toHaveCount(1);
    const visual = page.locator('[data-testid="venue-directions"]');
    await expect(visual, "the tile renders its Directions visual").toHaveCount(1);

    const measured = await outlineContrast(page, '[data-testid="venue-directions"]');
    expect(measured, "the visual is in the DOM").not.toBeNull();
    expect(
      measured!.ratio,
      `${theme}: ${measured!.border} on ${measured!.bg} is measurable`,
    ).not.toBeNull();
    expect(
      measured!.ratio!,
      `${theme}: ${measured!.border} on ${measured!.bg}`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  test(`${theme}: the crew contact icon visuals clear the 3:1 non-text floor`, async ({ page }) => {
    await open(page, theme);
    // The crew rows' tel/mailto anchors, each wrapping the painted 32px visual
    // this arc swapped. Counted first so the loop below cannot pass vacuously.
    const anchors = page.locator('a[href^="tel:"], a[href^="mailto:"]');
    const count = await anchors.count();
    expect(count, "the fixture's crew carry phone and email, so both icons mount").toBeGreaterThan(
      0,
    );

    const ratios = await page.evaluate(() => {
      const parse = (c: string): [number, number, number] | null => {
        const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        if (m[4] !== undefined && Number(m[4]) === 0) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      };
      const lum = ([r, g, b]: [number, number, number]) => {
        const f = (v: number) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const out: { border: string; bg: string; ratio: number | null }[] = [];
      for (const a of document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]')) {
        const span = a.querySelector("span");
        if (!span) continue;
        const border = parse(getComputedStyle(span).borderTopColor);
        let node: Element | null = span;
        let bg: [number, number, number] | null = null;
        while (node && !bg) {
          bg = parse(getComputedStyle(node).backgroundColor);
          node = node.parentElement;
        }
        out.push({
          border: getComputedStyle(span).borderTopColor,
          bg: bg ? bg.join(",") : "none",
          ratio:
            border && bg
              ? (() => {
                  const [hi, lo] = [lum(border), lum(bg)].sort((x, y) => y - x) as [number, number];
                  return (hi + 0.05) / (lo + 0.05);
                })()
              : null,
        });
      }
      return out;
    });

    expect(ratios.length, "every anchor exposes its painted visual").toBe(count);
    for (const r of ratios) {
      expect(r.ratio, `${theme}: ${r.border} on ${r.bg} is measurable`).not.toBeNull();
      expect(r.ratio!, `${theme}: ${r.border} on ${r.bg}`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  // ── The four AC-13 surfaces outside the step-3 tree ────────────────────────

  test(`${theme}: the BellPanel config inputs clear the 3:1 non-text floor`, async ({ page }) => {
    await openAdmin(page, theme, "bell");
    // Both inputs, not one: the sweep moved two identical className literals in
    // this file, and measuring one would leave the other unmeasured while the
    // case name claims the row.
    for (const tid of ["bell-config-history", "bell-config-cap"]) {
      const measured = await outlineContrast(page, `[data-testid="${tid}"]`);
      expect(measured, `${tid} is in the DOM`).not.toBeNull();
      expect(
        measured!.ratio,
        `${theme} ${tid}: ${measured!.border} on ${measured!.bg}`,
      ).not.toBeNull();
      expect(
        measured!.ratio!,
        `${theme} ${tid}: ${measured!.border} on ${measured!.bg}`,
      ).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  test(`${theme}: the report textarea clears the 3:1 non-text floor`, async ({ page }) => {
    await openAdmin(page, theme, "report");
    const measured = await outlineContrast(page, '[data-testid="report-modal-textarea"]');
    expect(measured, "the modal is open, so the textarea mounts").not.toBeNull();
    expect(measured!.ratio, `${theme}: ${measured!.border} on ${measured!.bg}`).not.toBeNull();
    expect(
      measured!.ratio!,
      `${theme}: ${measured!.border} on ${measured!.bg}`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  test(`${theme}: the wizard step indicator's DONE pill clears the 3:1 non-text floor`, async ({
    page,
  }) => {
    // The ONE surface of the five measured on its real route rather than in the
    // static harness, because `OnboardingWizard.tsx` is a server component and
    // a client bundle is the wrong vehicle for it (the entry file carries the
    // probe). `?step=2` is the cheapest state where a pill is DONE: `isDone` is
    // `n < step`, so pill 1 is done and pill 2 is current.
    //
    // Two pieces of setup, both load-bearing, both learned by watching this case
    // fail without them. The wizard renders only while onboarding is INCOMPLETE
    // and the shared e2e database does not sit in that state, so
    // `enterWizardAdminState` puts it there and the finally puts it back. And
    // signOut precedes signIn, exactly as
    // tests/e2e/onboarding-wizard-step1.spec.ts does it.
    const restore = await enterWizardAdminState();
    try {
      await signOut(page);
      await signInAs(page, ADMIN_FIXTURE);
      // `emulateMedia`, NOT a `data-theme` write. The static harness pages have
      // no theme system so stamping the attribute is fine there; the real route
      // does, and a run that stamped it read a colour from the OTHER theme
      // against this theme's background — a ratio that belonged to neither.
      // globals.css keys dark off `prefers-color-scheme` for exactly this case.
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
      await page.setViewportSize(MOBILE);
      await page.goto("/admin?step=2");
      await page.evaluate(() => document.fonts.ready);

      await expect(
        page.locator("[data-testid=onboarding-wizard]"),
        "the wizard itself renders, so a missing pill below is a pill problem",
      ).toBeVisible();
      // The painted `-visual` span exists only on a REACHABLE pill (the Link
      // branch); an unreachable one paints on the bare testid instead. Asserting
      // it is what distinguishes "the done pill is fine" from "the pill rendered
      // in its other shape and this case measured nothing".
      const done = page.locator('[data-testid="wizard-step-indicator-1-visual"]');
      await expect(done, "pill 1 mounts its painted visual at step 2").toHaveCount(1);
      // The arm is asserted, not assumed: reading the CURRENT pill instead would
      // measure a state this sweep never touched, and would still pass.
      await expect(
        page.locator('[data-testid="wizard-step-indicator-2"][aria-current="step"]'),
        "step 2 is the current step, so pill 1 is the DONE arm",
      ).toHaveCount(1);

      const measured = await outlineContrast(
        page,
        '[data-testid="wizard-step-indicator-1-visual"]',
      );
      expect(measured!.ratio, `${theme}: ${measured!.border} on ${measured!.bg}`).not.toBeNull();
      expect(
        measured!.ratio!,
        `${theme}: ${measured!.border} on ${measured!.bg}`,
      ).toBeGreaterThanOrEqual(FLOOR);
    } finally {
      await restore();
    }
  });

  test(`${theme}: the row-actions trigger clears the floor in BOTH arms`, async ({ page }) => {
    await openAdmin(page, theme, "rows");
    const arm = (host: string) =>
      `[data-testid="${host}"] [data-testid^="row-actions-trigger-"] > span`;
    // A real gesture, not a synthetic one from the entry: the menu's open state
    // depends on effects that have not run at commit time, so a click issued
    // from a ref callback leaves the panel closed.
    await page.click('[data-testid="row-actions-open-host"] [data-testid^="row-actions-trigger-"]');
    // `aria-expanded` on the trigger, NOT the panel: the panel PORTALS out of
    // this host, so a descendant selector for it never resolves however open
    // the menu is. The trigger stays put and its own attribute is the
    // authoritative open signal.
    await page.waitForSelector(
      '[data-testid="row-actions-open-host"] [data-testid^="row-actions-trigger-"][aria-expanded="true"]',
      { state: "attached" },
    );
    const closed = await outlineContrast(page, arm("row-actions-closed-host"));
    const opened = await outlineContrast(page, arm("row-actions-open-host"));
    expect(closed, "the closed instance mounts its visual").not.toBeNull();
    expect(opened, "the opened instance mounts its visual").not.toBeNull();

    // The two arms differ only in FILL (`bg-surface-sunken` on the open one), so
    // a harness that failed to open its instance would hand back two readings of
    // the closed arm and every ratio below would still pass. This is the guard
    // on that: the backgrounds must not be equal.
    expect(
      opened!.bg,
      `${theme}: the open arm's fill (${opened!.bg}) matches the closed arm's (${closed!.bg}), so the trigger did not open`,
    ).not.toBe(closed!.bg);

    for (const [name, measured] of [
      ["closed", closed],
      ["open", opened],
    ] as const) {
      expect(
        measured!.ratio,
        `${theme} ${name}: ${measured!.border} on ${measured!.bg}`,
      ).not.toBeNull();
      expect(
        measured!.ratio!,
        `${theme} ${name}: ${measured!.border} on ${measured!.bg}`,
      ).toBeGreaterThanOrEqual(FLOOR);
    }
  });
}
