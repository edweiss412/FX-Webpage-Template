/**
 * tests/e2e/attention-anchor-placement.spec.ts
 * (spec 2026-07-20-attention-alert-routing §3.3)
 *
 * Real-browser proof that anchored asset/reel cards mount INSIDE their content
 * container: a `diagrams`-routed card inside the Diagrams sub-block, an
 * `opening_reel`-routed card inside the opening_reel field. Asserted by DOM
 * ANCESTRY (`element.closest(...)`) in a real engine — one jsdom composition trap
 * this catches is a card that resolves but detaches from the intended subtree once
 * the real component tree (with its inner Diagrams chrome provider) mounts.
 *
 * NO assertion about the `?` trigger's geometry (spec §9): the 22px trigger is owned
 * and pinned by feat/warning-card-copy-restore; this spec only asserts its presence.
 *
 * HARNESS (standalone, no app boot, no Supabase — mirrors compact-alert-card-layout):
 *   1. bundles tests/e2e/_attentionAnchorEntry.tsx out-of-process with a
 *      version-pinned esbuild;
 *   2. compiles the real token CSS with the Tailwind CLI over app/globals.css, with
 *      explicit @source entries for step3ReviewSections + the entry so the mounted
 *      classes are emitted;
 *   3. serves live.html over node:http.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/attention-anchor-placement.spec.ts
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "attention-anchor-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // step3ReviewSections' graph reaches "use server" action modules (postgres,
  // node:crypto, node:async_hooks) that Next elides from the client bundle; a plain
  // `esbuild --bundle` follows them as value imports and fails to resolve the node
  // builtins they drag in. Reuse the shared elision bundler (use-server → no-op
  // exports + empty-CJS node builtins) that _step3ReviewModalBundle.mjs implements.
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_attentionAnchorEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "step3ReviewSections.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_attentionAnchorEntry.tsx")}";`,
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
        file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".js")
            ? "text/javascript"
            : "text/html",
      );
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

test("diagram card mounts inside the Diagrams sub-block; reel card inside the opening_reel field", async ({
  page,
}) => {
  await page.goto(baseUrl);
  await page.waitForSelector('[data-testid="attention-card-EMBEDDED_ASSET_DRIFTED"]');
  await page.waitForSelector('[data-testid="attention-card-REEL_DRIFTED"]');

  // DIAGRAM anchor: the card is a descendant of the diagrams sub-block, AND that
  // sub-block sits inside the rooms host (not floated up to Overview).
  const diagramAncestry = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="attention-card-EMBEDDED_ASSET_DRIFTED"]');
    const subblock = card?.closest('[data-testid="published-diagrams-subblock"]') ?? null;
    return {
      inSubblock: subblock !== null,
      inRoomsHost: subblock?.closest('[data-testid="rooms-host"]') !== null,
      helpPresent:
        card?.querySelector('[data-testid="attention-card-help-EMBEDDED_ASSET_DRIFTED"]') !== null,
    };
  });
  expect(diagramAncestry.inSubblock).toBe(true);
  expect(diagramAncestry.inRoomsHost).toBe(true);
  expect(diagramAncestry.helpPresent).toBe(true); // §9: presence only, no geometry.

  // REEL anchor: the card is a descendant of the opening_reel field wrapper, which
  // co-locates the reel value (proving field placement, not a floating card).
  const reelAncestry = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="attention-card-REEL_DRIFTED"]');
    const field = card?.closest('[data-testid="event-opening-reel"]') ?? null;
    return {
      inField: field !== null,
      fieldHasReelValue: (field?.textContent ?? "").includes("Opening reel"),
      inEventHost: field?.closest('[data-testid="event-host"]') !== null,
    };
  });
  expect(reelAncestry.inField).toBe(true);
  expect(reelAncestry.fieldHasReelValue).toBe(true);
  expect(reelAncestry.inEventHost).toBe(true);
});
