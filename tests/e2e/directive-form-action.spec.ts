/**
 * tests/e2e/directive-form-action.spec.ts (PR-C / C4 — guard case f)
 *
 * Proves the shared "use server" resolver's stub is LOUD when the REAL app
 * boundary invokes it — the property that distinguishes a directive stub from a
 * silent no-op. _directiveFormActionLiveEntry.tsx imports the actual server
 * action setUseRawDecisionAction and wires it as a React form action; the plugin
 * replaces that module with a throwing stub. Submitting the form invokes the
 * stub, which throws the plugin's message. The message is asserted across every
 * channel React 19 might use (pageerror / console.error / the window-error box
 * the live entry mirrors to the DOM).
 *
 * HARNESS: standalone, no app boot — bundles the live entry out of process via
 * bundleLiveEntry (which routes through the directive plugin) and serves it over
 * node:http, mirroring packlist-rescan-recovery.spec.ts.
 */
import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { bundleLiveEntry } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "directive-form-action-"));
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  bundleLiveEntry({
    entry: join(REPO_ROOT, "tests", "e2e", "_directiveFormActionLiveEntry.tsx"),
    outFile: join(workDir, "bundle.js"),
    // The real server action's subtree is stubbed by the directive plugin;
    // node:crypto survives only on the never-called parser-overlay path.
    aliases: { "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts") },
  });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
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

test.describe("use-server directive stub is loud at the real form-action boundary", () => {
  test.setTimeout(120_000);

  test("submitting a form whose action is a stubbed server action throws the plugin message", async ({
    page,
  }) => {
    const messages: string[] = [];
    page.on("pageerror", (e) => messages.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") messages.push(m.text());
    });

    await page.goto(baseUrl + "live.html");
    await expect(page.getByTestId("harness-mount")).toBeVisible();
    await page.getByTestId("submit").click();

    // Whichever channel React 19 uses to surface the action throw, the plugin's
    // stub message must appear. A silent no-op (the failure this guards) would
    // never populate any channel and time out here.
    await expect
      .poll(
        async () => {
          const box = (await page.getByTestId("captured-error").textContent()) ?? "";
          return `${messages.join("\n")}\n${box}`;
        },
        { timeout: 15_000 },
      )
      .toContain("is not callable in a browser bundle");

    const box = (await page.getByTestId("captured-error").textContent()) ?? "";
    const all = `${messages.join("\n")}\n${box}`;
    expect(all).toContain("setUseRawDecisionAction");
  });
});
