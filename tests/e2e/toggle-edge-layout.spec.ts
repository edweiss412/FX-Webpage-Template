/**
 * tests/e2e/toggle-edge-layout.spec.ts (accent-contrast token pass, spec
 * 2026-07-16-accent-contrast-token-pass §6.1 computed-style proof + §9.1
 * dimensional invariants)
 *
 * Real-browser proof that the `border-accent-edge` utility actually GENERATES
 * CSS (Tailwind v4: a runtime value without its @theme alias is a dead token —
 * jsdom cannot prove this) and that adding the 1px border to the previously
 * borderless AutoRefreshControl track changes no geometry (border-box).
 *
 * Coverage mapping to spec §9.1: the settings track here covers the "one
 * representative of the color-only four" row (the four share one recipe,
 * changed color-only); the AutoRefresh ON+OFF tracks cover the
 * geometry-touching row. developer-toggle-layout.spec.ts continues to pin the
 * 44px/AdminRow invariants with its updated verbatim string.
 *
 * HARNESS: standalone (no app boot), same pattern as
 * developer-toggle-layout.spec.ts — real token CSS compiled from
 * app/globals.css via the Tailwind CLI, static harness transcribing the EXACT
 * post-change class strings, served over HTTP.
 *
 * Runs via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;

// Class strings transcribed VERBATIM from the components (post-change).
const SETTINGS_TRACK_ON =
  "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-fast border-accent-edge bg-accent";
const SETTINGS_THUMB_ON =
  "inline-block h-5 w-5 rounded-full bg-bg shadow-(--shadow-tile) transition-transform duration-fast translate-x-6";
const AUTOREFRESH_TRACK = (on: boolean) =>
  `relative inline-flex h-5 w-[34px] items-center rounded-full border transition-colors ${on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"}`;
const AUTOREFRESH_THUMB = (on: boolean) =>
  `absolute size-4 rounded-full bg-surface shadow-tile transition-transform ${on ? "translate-x-[16px]" : "translate-x-[2px]"}`;

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">
  <div style="display:flex; flex-direction:column; gap:24px; align-items:flex-start; padding:24px;">
    <span data-testid="settings-track-on" class="${SETTINGS_TRACK_ON}"><span data-testid="settings-thumb-on" class="${SETTINGS_THUMB_ON}"></span></span>
    <span data-testid="autorefresh-track-on" class="${AUTOREFRESH_TRACK(true)}"><span data-testid="autorefresh-thumb-on" class="${AUTOREFRESH_THUMB(true)}"></span></span>
    <span data-testid="autorefresh-track-off" class="${AUTOREFRESH_TRACK(false)}"><span data-testid="autorefresh-thumb-off" class="${AUTOREFRESH_THUMB(false)}"></span></span>
  </div>
</body></html>`;
}

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "toggle-edge-"));
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);

  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

test.describe("accent-edge boundary — computed style + §9.1 geometry", () => {
  test.setTimeout(120_000);

  test("ON toggle border is the accent-edge token and geometry invariants hold", async ({
    page,
  }) => {
    await page.goto(baseUrl);

    // Computed-style proof: the utility generated real CSS (#7a3d00 light).
    // If the @theme alias were missing, the border-color would resolve to the
    // initial `currentColor`/inherited value — never rgb(122, 61, 0).
    const track = page.getByTestId("autorefresh-track-on");
    const borderColor = await track.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(borderColor).toBe("rgb(122, 61, 0)");
    const settingsBorder = await page
      .getByTestId("settings-track-on")
      .evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(settingsBorder).toBe("rgb(122, 61, 0)");

    // §9.1 geometry: border-box — outer rects unchanged by the border.
    const t = await track.boundingBox();
    expect(Math.abs(t!.width - 34)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(t!.height - 20)).toBeLessThanOrEqual(TOL);

    const trackOff = await page.getByTestId("autorefresh-track-off").boundingBox();
    const thumbOn = await page.getByTestId("autorefresh-thumb-on").boundingBox();
    const thumbOff = await page.getByTestId("autorefresh-thumb-off").boundingBox();
    // Thumb fully inside its own track, both states.
    for (const [th, tr] of [
      [thumbOn, t],
      [thumbOff, trackOff],
    ] as const) {
      expect(th!.x).toBeGreaterThanOrEqual(tr!.x - TOL);
      expect(th!.x + th!.width).toBeLessThanOrEqual(tr!.x + tr!.width + TOL);
      expect(th!.y).toBeGreaterThanOrEqual(tr!.y - TOL);
      expect(th!.y + th!.height).toBeLessThanOrEqual(tr!.y + tr!.height + TOL);
    }
    // ON−OFF travel = 14px (16px − 2px offsets) — each thumb measured against
    // ITS OWN track origin so harness layout position cancels out.
    const onOffset = thumbOn!.x - t!.x;
    const offOffset = thumbOff!.x - trackOff!.x;
    expect(Math.abs(onOffset - offOffset - 14)).toBeLessThanOrEqual(TOL);

    // Settings toggle (representative of the color-only four): 48×28 outer,
    // thumb contained.
    const settings = await page.getByTestId("settings-track-on").boundingBox();
    expect(Math.abs(settings!.width - 48)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(settings!.height - 28)).toBeLessThanOrEqual(TOL);
    const settingsThumb = await page.getByTestId("settings-thumb-on").boundingBox();
    expect(settingsThumb!.x + settingsThumb!.width).toBeLessThanOrEqual(
      settings!.x + settings!.width + TOL,
    );
  });
});
