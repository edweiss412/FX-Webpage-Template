/**
 * tests/e2e/resolve-label-layout.spec.ts
 * (spec 2026-07-20-show-scoped-alert-copy-design §9)
 *
 * "Confirm" is narrower than "Mark resolved", and the bell's change is larger
 * still ("Dismiss" -> "Confirm"). This measures whether that narrowing disturbs
 * the footer row, in a real engine: jsdom computes no layout, so none of these
 * claims are observable there.
 *
 * TWO DELIBERATE CHOICES, both from plan review:
 *
 *   - The comparison HOLDS MESSAGE CONTENT CONSTANT and varies only the label.
 *     Rendering a confirm-intent code beside a resolve-intent code would
 *     confound button width with body wrapping: a height difference could come
 *     from the message, and equal heights could mask a real button-driven
 *     change. The harness therefore renders one fixed card and takes the label
 *     from a ?code= query param.
 *   - A NEGATIVE CONTROL asserts the button's own width actually differs
 *     between the two renders. Without it, every geometry assertion would pass
 *     trivially if the harness ignored the param and rendered the same page
 *     twice.
 *
 * The label travels the production code -> intent -> label path: the harness
 * imports resolveActionLabels rather than hardcoding strings. The real
 * <PerShowAlertResolveButton> cannot mount in this bundle (no Next runtime,
 * useRouter), so its classes are mirrored in the harness; the label strings
 * themselves are pinned to one module by
 * tests/components/admin/_metaResolveLabelSingleSource.test.ts.
 *
 * Harness is the same standalone bundle+CSS+serve used by
 * compact-alert-card-layout.spec.ts. Runs via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/resolve-label-layout.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;

const CONFIRM_CODE = "ROLE_FLAGS_NOTICE"; // -> "Confirm"
const RESOLVE_CODE = "AMBIGUOUS_EMAIL_BINDING"; // -> "Mark resolved"

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "resolve-label-layout-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_compactAlertCardLiveEntry.tsx"),
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      "--external:node:fs",
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--outfile=${join(workDir, "bundle.js")}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "CompactAlertCard.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "compactAlertHelp.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "HoverHelp.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_compactAlertCardLiveEntry.tsx")}";`,
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

type Measured = {
  label: string;
  row: { height: number };
  button: { right: number; width: number };
  contentRight: number;
};

async function measure(page: Page, code: string): Promise<Measured> {
  await page.goto(`${baseUrl}?code=${code}`);
  // Readiness gate. Mount alone is not enough for a cross-navigation
  // comparison: a web font landing between the two renders would move a 0.5px
  // assertion, so wait for fonts too.
  await page.waitForSelector('html[data-harness-hydrated="true"]');
  await page.evaluate(() => document.fonts.ready);

  return page.getByTestId("card-short-400").evaluate((card) => {
    const bar = card.querySelector('[data-testid="compact-alert-footer"]');
    const right = card.querySelector('[data-testid="compact-alert-footer-right"]');
    const button = card.querySelector('[data-testid="harness-resolve"]');
    // Fail loudly and by name rather than through a non-null assertion: a
    // detached or missing element must not surface as an opaque null deref.
    if (!bar) throw new Error("no footer bar");
    if (!right) throw new Error("no footer-right cluster");
    if (!button) throw new Error("no resolve button");

    const barRect = bar.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    const contentRight =
      barRect.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);

    return {
      label: (button.textContent ?? "").trim(),
      row: { height: barRect.height },
      button: { right: buttonRect.right, width: buttonRect.width },
      contentRight: Math.max(contentRight, rightRect.right - rightRect.width * 0),
    };
  });
}

test("the label swap does not disturb the footer row", async ({ page }) => {
  const resolveIntent = await measure(page, RESOLVE_CODE);
  const confirmIntent = await measure(page, CONFIRM_CODE);

  // The harness really did render the two different labels.
  expect(resolveIntent.label).toBe("Mark resolved");
  expect(confirmIntent.label).toBe("Confirm");

  // NEGATIVE CONTROL: the narrower verb must actually produce a narrower
  // button. Without this the geometry assertions below could pass by comparing
  // a page to itself.
  expect(confirmIntent.button.width).toBeLessThan(resolveIntent.button.width - 1);

  // The footer row's height is unchanged by the swap.
  expect(Math.abs(resolveIntent.row.height - confirmIntent.row.height)).toBeLessThan(TOL);
});

test("the button stays flush with the footer's content edge under both labels", async ({
  page,
}) => {
  for (const code of [RESOLVE_CODE, CONFIRM_CODE]) {
    const m = await measure(page, code);
    // ml-auto on the footer-right cluster is what holds this; a narrower label
    // must not leave the button floating away from the edge.
    expect(Math.abs(m.button.right - m.contentRight), `${code} button not flush`).toBeLessThan(TOL);
  }
});
