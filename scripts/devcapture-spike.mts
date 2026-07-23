/**
 * scripts/devcapture-spike.mts — Task 1 capture-library spike (spec §3.3/§3.4).
 *
 * Boots the e2e dev server (same env pair as playwright.config.ts webServer),
 * signs in as the developer fixture, seeds a published show, opens the real
 * published review modal, overflows both inner scroll panes, appends the two
 * sentinel divs, then for each candidate library captures the panel twice
 * (plain + clone-expanded) and pixel-scans the expanded PNG for BOTH sentinel
 * colors. Prints a per-candidate PASS/FAIL line. PNGs land in scratch/spike/.
 *
 * Run: pnpm exec tsx scripts/devcapture-spike.mts
 * (Temporary — deleted in Task 7 once SPIKE.md records the decision.)
 */
import "../tests/e2e/helpers/loadTestEnv";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { chromium, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { signInAs } from "../tests/e2e/helpers/signInAs";
import { ADMIN_FIXTURE } from "../tests/e2e/helpers/fixtures";
import { seedShowWithCrew, deleteSeededShow } from "../tests/e2e/helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "../tests/e2e/helpers/dashboardState";

const BASE = "http://127.0.0.1:3000";
const OUT = "scratch/spike";
// Sentinel colors: deliberately outside the design token palette.
const RAIL_SENTINEL = { r: 255, g: 0, b: 254 }; // near-magenta
const CONTENT_SENTINEL = { r: 1, g: 255, b: 0 }; // near-green
const CANDIDATES = [
  { name: "html-to-image", entry: "node_modules/html-to-image/es/index.js", global: "htmlToImage" },
  {
    name: "modern-screenshot",
    entry: "node_modules/modern-screenshot/dist/index.mjs",
    global: "modernScreenshot",
  },
  { name: "html2canvas", entry: "node_modules/html2canvas/dist/html2canvas.esm.js", global: "html2canvas" },
];

// Same env pair as playwright.config.ts:239 (non-CI webServer command).
const SERVER_ENV = {
  JWT_SIGNING_SECRET: "redeem-link-test-secret-32-bytes-min",
  ADMIN_DEV_PANEL_ENABLED: "true",
  ENABLE_TEST_AUTH: "true",
  TEST_AUTH_SECRET: "fxav-m3-test-auth-2026-DO-NOT-SHIP",
} as const;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server at ${url} not ready after ${timeoutMs}ms`);
}

function bundleCandidate(c: (typeof CANDIDATES)[number]): string {
  const out = `${OUT}/${c.name}.iife.js`;
  execFileSync(
    "pnpm",
    ["exec", "esbuild", c.entry, "--bundle", "--format=iife", `--global-name=${c.global}`, `--outfile=${out}`],
    { stdio: "inherit" },
  );
  return out;
}

function scanPng(path: string, color: { r: number; g: number; b: number }): number {
  const png = PNG.sync.read(readFileSync(path));
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (
      Math.abs((png.data[i] ?? 0) - color.r) <= 2 &&
      Math.abs((png.data[i + 1] ?? 0) - color.g) <= 2 &&
      Math.abs((png.data[i + 2] ?? 0) - color.b) <= 2
    ) {
      hits += 1;
    }
  }
  return hits;
}

async function prepareModal(page: Page, slug: string): Promise<void> {
  await page.goto(`${BASE}/admin?show=${slug}`, { timeout: 120_000 });
  try {
    await page.waitForSelector("[data-review-modal-panel]", { timeout: 120_000 });
  } catch (err) {
    await page.screenshot({ path: `${OUT}/debug-no-panel.png`, fullPage: true });
    console.error("debug: url =", page.url());
    console.error("debug: body snippet =", (await page.innerText("body")).slice(0, 400));
    throw err;
  }
  // Overflow both panes + append sentinels (rail is hidden < lg; viewport is 1280).
  await page.evaluate(
    ({ rail, content }) => {
      const panel = document.querySelector("[data-review-modal-panel]");
      if (!panel) throw new Error("panel missing");
      const railEl = panel.querySelector('[data-testid$="-review-rail"]');
      const contentEl = panel.querySelector('[data-testid$="-review-content"]');
      if (!railEl || !contentEl) throw new Error("panes missing");
      const filler = (h: number) => {
        const d = document.createElement("div");
        d.style.height = `${h}px`;
        d.style.flexShrink = "0";
        return d;
      };
      const sentinel = (c: { r: number; g: number; b: number }, id: string) => {
        const d = document.createElement("div");
        d.id = id;
        d.style.height = "24px";
        d.style.width = "120px";
        d.style.flexShrink = "0";
        d.style.backgroundColor = `rgb(${c.r}, ${c.g}, ${c.b})`;
        return d;
      };
      railEl.appendChild(filler(2000));
      railEl.appendChild(sentinel(rail, "spike-rail-sentinel"));
      contentEl.appendChild(filler(3000));
      contentEl.appendChild(sentinel(content, "spike-content-sentinel"));
    },
    { rail: RAIL_SENTINEL, content: CONTENT_SENTINEL },
  );
}

/** In-page: clone the panel, lift height caps + overflow on panel and panes,
 * mount offscreen, capture with the injected lib, remove clone. */
const CAPTURE_FN = `
async function spikeCapture(libName, expanded) {
  const panel = document.querySelector("[data-review-modal-panel]");
  if (!panel) throw new Error("panel missing");
  // (Re)inject filler + sentinels NOW: React reconciliation wipes foreign
  // children appended earlier (observed live: injected nodes vanished between
  // prepareModal and capture). Idempotent via the sentinel ids.
  if (!panel.querySelector("#spike-content-sentinel")) {
    const railEl = panel.querySelector('[data-testid$="-review-rail"]');
    const contentEl = panel.querySelector('[data-testid$="-review-content"]');
    if (!railEl || !contentEl) throw new Error("panes missing at capture time");
    const filler = (h) => { const d = document.createElement("div"); d.style.height = h + "px"; d.style.flexShrink = "0"; return d; };
    const sentinel = (rgb, id) => { const d = document.createElement("div"); d.id = id; d.style.height = "24px"; d.style.width = "120px"; d.style.flexShrink = "0"; d.style.backgroundColor = rgb; return d; };
    railEl.appendChild(filler(2000));
    railEl.appendChild(sentinel("rgb(255, 0, 254)", "spike-rail-sentinel"));
    contentEl.appendChild(filler(3000));
    contentEl.appendChild(sentinel("rgb(1, 255, 0)", "spike-content-sentinel"));
  }
  let target = panel;
  let cleanup = () => {};
  if (expanded) {
    const clone = panel.cloneNode(true);
    const width = panel.getBoundingClientRect().width;
    clone.style.maxHeight = "none";
    clone.style.height = "auto";
    clone.style.overflow = "visible"; // panel ships overflow-clip; without this spilled pane content clips at the panel box
    clone.style.width = width + "px";
    clone.style.position = "fixed";
    clone.style.left = "-100000px";
    clone.style.top = "0";
    for (const sel of ['[data-testid$="-review-rail"]', '[data-testid$="-review-content"]', '[data-testid$="-review-main"]']) {
      const el = clone.querySelector(sel);
      if (el) {
        el.style.overflow = "visible";
        el.style.maxHeight = "none";
        el.style.height = "auto";
      }
    }
    document.body.appendChild(clone);
    console.log("[spike] live content scrollHeight", document.querySelector('[data-testid$="-review-content"]').scrollHeight,
      "clone content h", clone.querySelector('[data-testid$="-review-content"]').getBoundingClientRect().height,
      "clone total h", clone.getBoundingClientRect().height,
      "clone sentinel?", !!clone.querySelector("#spike-content-sentinel"));
    target = clone;
    cleanup = () => clone.remove();
  }
  try {
    const unwrap = (m) => (m && m.default && typeof m.default === "function" ? m.default : m);
    if (libName === "html2canvas") {
      const h2c = unwrap(window.html2canvas);
      const canvas = await h2c(target, { scale: 1 });
      return canvas.toDataURL("image/png");
    }
    if (libName === "html-to-image") {
      const lib = window.htmlToImage.default ?? window.htmlToImage;
      return await lib.toPng(target, { pixelRatio: 1 });
    }
    if (libName === "modern-screenshot") {
      const lib = window.modernScreenshot.default ?? window.modernScreenshot;
      return await lib.domToPng(target, { scale: 1 });
    }
    throw new Error("unknown lib " + libName);
  } finally {
    cleanup();
  }
}
window.spikeCapture = spikeCapture;
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  let server: ChildProcess | null = null;
  let reused = false;
  try {
    await fetch(BASE);
    reused = true;
    console.log("reusing existing server on :3000");
  } catch {
    console.log("booting dev server…");
    server = spawn("pnpm", ["dev", "-H", "127.0.0.1"], {
      stdio: "ignore",
      env: { ...process.env, ...SERVER_ENV },
    });
    await waitForServer(BASE, 120_000);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (m) => {
    if (m.text().startsWith("[spike]")) console.log(m.text());
  });
  // tsx (esbuild keepNames) wraps serialized evaluate callbacks in __name();
  // stub it in-page or every page.evaluate throws ReferenceError.
  await page.addInitScript("window.__name = (f) => f;");
  const show = await seedShowWithCrew();
  const restoreDashboardState = await settleDashboardAdminState();
  const results: string[] = [];
  try {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE });
    for (const c of CANDIDATES) {
      try {
      const bundle = bundleCandidate(c);
      await prepareModal(page, show.slug);
      await page.addScriptTag({ path: bundle });
      await page.addScriptTag({ content: CAPTURE_FN });
      for (const mode of ["plain", "expanded"] as const) {
        const t0 = Date.now();
        const dataUrl = (await page.evaluate(
          ({ lib, expanded }) =>
            (window as unknown as { spikeCapture: (l: string, e: boolean) => Promise<string> }).spikeCapture(
              lib,
              expanded,
            ),
          { lib: c.name, expanded: mode === "expanded" },
        )) as string;
        const file = `${OUT}/${c.name}-${mode}.png`;
        writeFileSync(file, Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));
        const ms = Date.now() - t0;
        const png = PNG.sync.read(readFileSync(file));
        if (mode === "expanded") {
          const railHits = scanPng(file, RAIL_SENTINEL);
          const contentHits = scanPng(file, CONTENT_SENTINEL);
          const pass = railHits >= 1 && contentHits >= 1;
          results.push(
            `${pass ? "PASS" : "FAIL"} ${c.name}: ${png.width}x${png.height} rail=${railHits}px content=${contentHits}px (${ms}ms)`,
          );
        } else {
          results.push(`INFO ${c.name} plain ${png.width}x${png.height} ${ms}ms`);
        }
      }
      } catch (err) {
        results.push(`ERROR ${c.name}: ${String(err).slice(0, 200)}`);
      }
      // fresh page per candidate so injected globals/sentinels don't stack
      await page.goto("about:blank");
    }
  } finally {
    console.log("\n=== SPIKE RESULTS ===");
    for (const r of results) console.log(r);
    await deleteSeededShow(show.driveFileId);
    await restoreDashboardState();
    await browser.close();
    if (server && !reused) server.kill();
  }
}

await main();
