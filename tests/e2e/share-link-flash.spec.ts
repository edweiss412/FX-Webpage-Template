/**
 * tests/e2e/share-link-flash.spec.ts
 *
 * The share-link cue's RESOLVED style, measured in a real engine
 * (spec 2026-07-24-share-link-chrome-backlog-design §9.2/§9.3).
 *
 * Why this exists at all: the source scan in shareHubFlashTransitions is a regex
 * over CSS text. Regexes see fragments, not the cascade. A later duplicate
 * `@keyframes`, an unconditional `animation: none`, an `animation-play-state:
 * paused`, an `!important` on either painted property, or a rule scoped to an
 * ancestor selector all leave every fragment intact while the cue renders
 * nothing. Only a resolved computed style settles those.
 *
 * Harness: the real StatusStrip -> ShareHub tree, hydrated, inside a panel
 * carrying ReviewModalShell's clip + PopoverHostContext — the ancestry the
 * popover portals into in production. A bare element mount would be green
 * against an ancestor-qualified override.
 *
 * Bundling goes through the PLUGIN builder, not plain esbuild: ShareHub's graph
 * reaches `"use server"` modules through the rotate and picker-reset controls,
 * and esbuild has no `"use server"` semantics, so it follows them as ordinary
 * imports and fails to resolve node:crypto / node:async_hooks. See
 * _step3ReviewModalBundle.mjs:10-32.
 *
 * Runs under tests/e2e/standalone.config.ts (no dev server, no Supabase):
 *   pnpm exec playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/share-link-flash.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FLASH_MS = 1600;

/** Both keyframe names, in the order the shorthand declares them. */
const TRACKS = ["share-link-flash-bg", "share-link-flash-ring"];

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "share-link-flash-"));
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    "node",
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_shareLinkFlashLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // `@source` per participating file: without them Tailwind emits none of the
  // classes these components use and the harness would measure a bare box while
  // reporting green.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "showpage", "ShareHub.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "showpage", "StatusStrip.tsx")}";`,
      `@source "${join(REPO_ROOT, "app", "admin", "show", "[slug]", "ShareLinkCopyButton.tsx")}";`,
      `@source "${join(REPO_ROOT, "app", "admin", "show", "[slug]", "RotateShareTokenButton.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_shareLinkFlashLiveEntry.tsx")}";`,
      globals,
    ].join("\n"),
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
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
      res.end("nope");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no addr");
  baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/** Settle fonts + one frame before any computed read. No network settling: the
 *  page inlines its stylesheet and references no remote asset. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

async function openHub(page: Page) {
  await page.goto(baseUrl);
  await settle(page);
  await page.getByTestId("share-hub-primary").click();
  // The popover portals into the panel; wait for attachment rather than a
  // network idle that means nothing here.
  await page.getByTestId("share-hub-popover").waitFor({ state: "attached" });
  await settle(page);
}

/** One full two-tap rotate through the REAL confirm, resolved by the override
 *  fake. Re-resolves the buttons each time: the block is replaced by design, so
 *  a handle held across the transition would auto-wait on a detached node. */
async function rotate(page: Page) {
  await page.getByTestId("admin-rotate-share-token-button").click();
  await page.getByTestId("admin-rotate-share-token-confirm-button").click();
}

/**
 * One entry per ANIMATING ELEMENT inside the panel, not a set of names.
 *
 * A `Set` of names cannot see a newly mounted element that reuses an animation
 * already running before the rotate — the harness runs `sync-heartbeat`, so a
 * flash-only sibling using it left the delta exactly equal to the two cue tracks
 * and the check passed (round-2 review). Counting per element closes that:
 * mounting anything animated changes the census whatever it animates with.
 *
 * Elements are keyed by STRUCTURAL PATH, not by tag+truncated-className. The
 * earlier identifier sliced the class list to 40 characters, which on Tailwind
 * markup collides constantly — two different elements routinely share their
 * first 40 characters of class, so they censused as the same entry and one
 * could stand in for the other (round-3 review). A path is unique by
 * construction and survives the URL block's keyed remount, which lands at the
 * same position with a new object.
 */
/**
 * Give every panel descendant a durable object identity before the rotate.
 *
 * An expando, deliberately — not a data attribute, which would be visible to
 * selectors and could perturb the very styles being measured.
 */
async function stampPanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const panel = document.querySelector("[data-review-modal-panel]");
    let n = 0;
    for (const el of Array.from(panel?.querySelectorAll("*") ?? [])) {
      (el as unknown as { __cs?: number }).__cs = n++;
    }
  });
}

async function animationCensus(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const panel = document.querySelector("[data-review-modal-panel]");
    const out: string[] = [];
    /** `tag:nth-child` from the panel root — unique per position, no truncation. */
    const pathOf = (el: Element) => {
      const parts: string[] = [];
      for (let node: Element | null = el; node && node !== panel; node = node.parentElement) {
        const i = node.parentElement ? Array.from(node.parentElement.children).indexOf(node) : 0;
        parts.unshift(`${node.tagName.toLowerCase()}:${i}`);
      }
      return parts.join("/");
    };
    for (const el of Array.from(panel?.querySelectorAll("*") ?? [])) {
      const n = getComputedStyle(el).animationName;
      if (!n || n === "none") continue;
      const testid = el.getAttribute("data-testid");
      // The stamp, not the path, is what makes this an ELEMENT census. Paths
      // identify POSITIONS: inserting a same-tag/same-testid sibling before an
      // element while silencing the original preserved the entry at that path,
      // so both directional diffs stayed empty (round-4 review). A survivor
      // keeps its stamp; anything mounted after stamping reads NEW.
      const stamp = (el as unknown as { __cs?: number }).__cs;
      out.push(`#${stamp ?? "NEW"} ${pathOf(el)}${testid ? `[${testid}]` : ""} :: ${n}`);
    }
    return out.sort();
  });
}

/** Multiset difference: entries in `a` beyond their count in `b`. */
function diff(a: string[], b: string[]): string[] {
  const pool = [...b];
  const extra: string[] = [];
  for (const entry of a) {
    const i = pool.indexOf(entry);
    if (i === -1) extra.push(entry);
    else pool.splice(i, 1);
  }
  return extra.sort();
}

/** Resolved style of the URL block, sampled fresh. */
async function urlStyle(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="admin-current-share-link-url"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const anims = el.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName,
      time: typeof a.currentTime === "number" ? a.currentTime : 0,
      state: a.playState,
    }));
    return {
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      animationDelay: cs.animationDelay,
      animationPlayState: cs.animationPlayState,
      animationTimingFunction: cs.animationTimingFunction,
      animationDirection: cs.animationDirection,
      animationIterationCount: cs.animationIterationCount,
      animationFillMode: cs.animationFillMode,
      backgroundColor: cs.backgroundColor,
      boxShadow: cs.boxShadow,
      hasAttr: el.hasAttribute("data-share-link-flash"),
      anims,
    };
  });
}

test.describe("share-link cue — resolved style", () => {
  test("T-FLASH-REST: no attribute means no animation and resting paint", async ({ page }) => {
    await openHub(page);
    const s = await urlStyle(page);
    expect(s).not.toBeNull();
    expect(s!.hasAttr).toBe(false);
    expect(s!.animationName).toBe("none");
    expect(s!.anims).toHaveLength(0);
  });

  test("T-FLASH-RUN: a rotate resolves BOTH tracks, undelayed and running", async ({ page }) => {
    await openHub(page);
    const rest = await urlStyle(page);
    await rotate(page);
    const during = await urlStyle(page);

    expect(during!.hasAttr).toBe(true);
    // EXACTLY the cue's two tracks, in order. Containment allowed a third track
    // to ride along (round-4 review).
    expect(during!.animationName.split(",").map((t) => t.trim())).toEqual(TRACKS);
    // A non-zero delay would clip the cue while leaving every duration, easing,
    // stop, property, colour and width untouched.
    expect(during!.animationDelay.split(",").map((s) => s.trim())).toEqual(["0s", "0s"]);
    expect(during!.animationDuration.split(",").map((s) => s.trim())).toEqual(["1.6s", "1.6s"]);
    expect(during!.animationPlayState).toContain("running");
    // Easing was unasserted everywhere until round-1 whole-diff review: the
    // source scan only proved the expected shorthand EXISTS, so a later
    // `animation-timing-function: linear` override left every assertion green
    // while violating the ratified ease-out.
    expect(during!.animationTimingFunction.split(",").map((s) => s.trim())).toEqual([
      "ease-out",
      "ease-out",
    ]);

    // The remaining longhands, pinned because N1 CANNOT see them. N1 compares the
    // cue's own rules, selected by name; a rule that never mentions the cue —
    // targeting the URL block by testid, class or an ancestor — can still retune
    // direction, iteration or fill and never enter that comparison set (round-4
    // review). Resolved style is where those become visible, so this is the
    // closure for that gap, not a duplicate of the stylesheet check.
    expect(during!.animationDirection.split(",").map((t) => t.trim())).toEqual([
      "normal",
      "normal",
    ]);
    expect(during!.animationIterationCount.split(",").map((t) => t.trim())).toEqual(["1", "1"]);
    expect(during!.animationFillMode.split(",").map((t) => t.trim())).toEqual(["none", "none"]);

    // BOTH paints actually move. Sampling one cannot see the other suppressed.
    expect(during!.backgroundColor).not.toBe(rest!.backgroundColor);
    expect(during!.boxShadow).not.toBe(rest!.boxShadow);
  });

  test("T-FLASH-SETTLE: both paints return to rest and the attribute clears", async ({ page }) => {
    await openHub(page);
    const rest = await urlStyle(page);
    await rotate(page);
    await page.waitForTimeout(FLASH_MS + 250);
    const after = await urlStyle(page);

    expect(after!.hasAttr).toBe(false);
    expect(after!.animationName).toBe("none");
    expect(after!.backgroundColor).toBe(rest!.backgroundColor);
    expect(after!.boxShadow).toBe(rest!.boxShadow);
  });

  test("T-FLASH-RESTART: a second rotate restarts the tracks from the top", async ({ page }) => {
    await openHub(page);
    await rotate(page);
    await page.waitForTimeout(700);
    const mid = await urlStyle(page);
    expect(mid!.anims.length).toBeGreaterThan(0);
    const elapsedBefore = Math.max(...mid!.anims.map((a) => a.time));
    expect(elapsedBefore).toBeGreaterThan(400);

    // Production restarts by REPLACING the keyed node, not by toggling the
    // attribute on a surviving one. Driving a real second rotate exercises that
    // transition rather than a convenient stand-in.
    await rotate(page);
    const restarted = await urlStyle(page);

    expect(restarted!.hasAttr).toBe(true);
    const elapsedAfter = Math.max(...restarted!.anims.map((a) => a.time));
    expect(elapsedAfter).toBeLessThan(elapsedBefore);
  });

  test("T-FLASH-SOLE: exactly one element carries the attribute, and nothing else animates", async ({
    page,
  }) => {
    await openHub(page);
    await stampPanel(page);
    const before = await animationCensus(page);
    await rotate(page);

    const after = await animationCensus(page);
    const audit = await page.evaluate(() => {
      const marked = document.querySelectorAll("[data-share-link-flash]");
      const target = document.querySelector('[data-testid="admin-current-share-link-url"]');
      return { markedCount: marked.length, isTarget: marked[0] === target };
    });

    expect(audit.markedCount).toBe(1);
    expect(audit.isTarget).toBe(true);

    // A DELTA against the resting page, not an absolute census: the panel
    // legitimately animates already — StatusStrip's synced-dot heartbeat
    // (DESIGN.md SYNC-PULSE-1) runs continuously — so "nothing else animates"
    // would fail on shipped, intended motion.
    //
    // The delta is a MULTISET over elements, checked in BOTH directions.
    // Additions alone were not enough: stopping an existing animation while
    // mounting an identically-keyed animated node cancels out in an
    // additions-only diff and passes (round-3 review). Requiring the removal
    // side to be empty means the rotate may not silence shipped motion either.
    // Non-vacuity: the removal check only means something if the census can
    // SEE resting motion. If the harness ever stopped animating at rest, an
    // empty `before` would make `removed` trivially empty and this assertion
    // would pass while proving nothing.
    expect(
      before.length,
      "census saw no resting motion, so removals are untestable",
    ).toBeGreaterThan(0);

    const added = diff(after, before);
    const removed = diff(before, after);
    expect(removed, "the rotate stopped motion that was already running").toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]).toContain("admin-current-share-link-url");
    // EXACT track set, not containment. `toContain` per track left a third
    // track on the same element passing both assertions with added.length still
    // 1 (round-4 review) — the stray-`opacity`-track defect the spec calls out.
    const names = (added[0] ?? "")
      .split(" :: ")[1]
      ?.split(",")
      .map((t) => t.trim())
      .sort();
    expect(names).toEqual([...TRACKS].sort());
  });

  test("T-FLASH-REDUCED: reduced motion paints nothing, with no residual ring", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHub(page);
    const rest = await urlStyle(page);
    await rotate(page);
    const during = await urlStyle(page);

    // The attribute still lands — the component does not read the media query.
    expect(during!.hasAttr).toBe(true);
    expect(during!.animationName).toBe("none");
    expect(during!.anims).toHaveLength(0);
    // Neither paint moves. A steady wash or a stuck ring would be as wrong as
    // motion here: a one-shot cue has no correct steady state.
    expect(during!.backgroundColor).toBe(rest!.backgroundColor);
    expect(during!.boxShadow).toBe(rest!.boxShadow);
  });
});
