// The harness renders the COMMITTED bytes, proven in a real browser.
//
// `tests/e2e/helpers/liveEntryToolchain.fonts.test.ts` proves what the toolchain
// EMITS -- descriptors, hashes, the bare sibling URL. It cannot prove a browser
// loads and renders those bytes, and the difference is the whole point of
// BL-HARNESS-FONT-FIDELITY: the old failure was a stylesheet that looked
// perfectly correct while every harness rendered the ambient host font.
//
// TWO ASSERTIONS THAT TOGETHER AN IMPOSTOR CANNOT SATISFY:
//
//   1. the font REQUEST succeeded, and the face reached `loaded`
//   2. rendered advance width matches the expectation computed from the
//      committed file with fontkit, within 0.5px
//
// A loaded-face check alone is NOT sufficient, and that is measured rather than
// argued. Emit `font-family: "Inter"; src: local("Arial")` and
// `document.fonts` reports `{ family: "Inter", status: "loaded" }`, because
// `FontFace.family` is whatever the author wrote and identifies nothing about
// the source. Every harness would render Arial under the name Inter, geometry
// baselines would be regenerated around the wrong face, and the suite would be
// green. `document.fonts.check()` is deliberately unused for the same reason:
// it returns true for a system-installed family.
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { compileEntryCss } from "./helpers/liveEntryToolchain";
import {
  WIDTH_TOLERANCE_PX,
  expect,
  measureProbe,
  probeExpectation,
  test,
} from "./helpers/fontFidelityFixture";

const REPO_ROOT = resolve(__dirname, "..", "..");

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "harness-face-"));
  const entry = join(workDir, "entry.css");
  writeFileSync(entry, readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"));
  compileEntryCss({ entryCss: entry, outFile: join(workDir, "out.css") });

  // Serve the output directory exactly as the 32 callers do -- a flat static
  // server with content-type derived from the extension. None of them has a
  // .woff2 branch, so the binary is served as text/html; that works because CSS
  // Fonts does not require a font MIME type and the browser selects on the
  // format() hint and the bytes. The request assertion below is what keeps that
  // a checked fact rather than a tolerated accident.
  writeFileSync(
    join(workDir, "harness.html"),
    `<!doctype html><html><head><link rel="stylesheet" href="out.css"></head>` +
      `<body><p id="sample">Hamburgefonstiv</p></body></html>`,
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

test("the harness loads and renders the committed Inter bytes", async ({ page }) => {
  const requests: { url: string; status: number }[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".woff2")) requests.push({ url: r.url(), status: r.status() });
  });

  await page.goto(baseUrl);
  await page.evaluate(() => document.fonts.ready);

  // (1) THE REQUEST SUCCEEDED. A 404 renders identically to a missing face, so
  // without this a wrong URL is invisible to every width assertion that follows
  // -- the fallback simply measures something else and could be blessed into a
  // pinned figure.
  expect(requests.length, "the harness requested exactly one woff2").toBe(1);
  expect(requests[0]!.status, `the font request returned ${requests[0]?.status}`).toBe(200);

  // (2) THE FACE IS REGISTERED AND LOADED, read from document.fonts rather than
  // from check(), which cannot tell a system-installed family from a declared
  // one.
  const faces = await page.evaluate(() =>
    [...document.fonts].map((f) => ({ family: f.family, status: f.status, weight: f.weight })),
  );
  const inter = faces.filter((f) => f.family === "Inter");
  expect(inter, "exactly one Inter face is registered").toHaveLength(1);
  expect(inter[0]!.status).toBe("loaded");
  expect(inter[0]!.weight, "the variable axis survived into the browser").toBe("100 900");

  // (3) IT RENDERS THOSE BYTES. The discriminating assertion: an impostor fails
  // on Arial's advance widths however the alias is spelled.
  const rendered = await measureProbe(page, "#sample");
  const delta = Math.abs(rendered - probeExpectation());
  expect(
    delta,
    `rendered ${rendered}px against an expectation of ${probeExpectation()}px ` +
      `(delta ${delta}px). The contract is ${WIDTH_TOLERANCE_PX}px; an impostor misses by ~9.8px.`,
  ).toBeLessThan(WIDTH_TOLERANCE_PX);
});

test("the emitted face blocks rather than swaps", async ({ page }) => {
  // The deliberate divergence from the app, asserted where it is observable.
  // `swap` in a harness lets an unsynchronized caller measure a fallback frame
  // and then have those metrics re-derived into a pinned figure -- worse than
  // today's ambient measurement, which is at least stable.
  await page.goto(baseUrl);
  // Asserted through document.fonts, NOT by string-matching the stylesheet.
  // The emitted file carries app/fonts.css's comments through, and one of them
  // explains what "the `font-display: swap` window" does -- so a text assertion
  // fails on prose that is merely describing the app's value. Ask the browser
  // what the registered face actually says.
  await page.goto(baseUrl);
  const displays = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.family === "Inter").map((f) => f.display),
  );
  expect(displays).toEqual(["block"]);
});
