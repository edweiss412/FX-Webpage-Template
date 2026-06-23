import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import {
  buildForbiddenCodeIndex,
  collectRawCodeLeaksInPage,
  discoverStaticAppRoutePaths,
  formatRuntimeLeak,
} from "@/tests/cross-cutting/no-raw-codes-audit";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const RUNTIME_FIXTURE_ROOT = "tests/cross-cutting/fixtures/no-raw-codes/runtime";
const MDX_FIXTURE_ROOT = "tests/cross-cutting/fixtures/no-raw-codes/mdx";
const forbiddenCodes = buildForbiddenCodeIndex({ runtimeSubstringMinLength: 4 });

async function scanPage(page: Page) {
  return collectRawCodeLeaksInPage(page, forbiddenCodes);
}

/**
 * Compile an `.mdx` fixture through the SAME `@mdx-js/mdx` pipeline `@next/mdx`
 * uses, then render the resulting component to static HTML. This is the DOM
 * shape a real `app/help/**\/page.mdx` route produces — proving the runtime
 * crawl below walks MDX-authored surfaces exactly as it walks `.tsx` ones.
 */
async function renderMdxFixtureToHtml(name: string): Promise<string> {
  // `@mdx-js/mdx` + `react/jsx-runtime` are ESM-only; load them via dynamic
  // import so Playwright's CJS test loader doesn't try to `require()` them.
  const { compile, run } = await import("@mdx-js/mdx");
  const jsxRuntime = await import("react/jsx-runtime");
  const { renderToStaticMarkup } = await import("react-dom/server");

  const source = readFileSync(`${MDX_FIXTURE_ROOT}/${name}`, "utf8");
  const compiled = await compile(source, { outputFormat: "function-body" });
  // No `baseUrl` is passed: these fixtures import nothing, and referencing
  // `import.meta.url` would force the spec module into ESM scope, which
  // Playwright's CJS test loader cannot evaluate.
  const mdxModule = await run(String(compiled), { ...jsxRuntime });
  return renderToStaticMarkup(mdxModule.default({ components: {} }));
}

test.describe("AC-X.2 no raw codes runtime crawl", () => {
  test("runtime fixture discovery is directory-driven", () => {
    const names = walkSourceFiles([RUNTIME_FIXTURE_ROOT], { extensions: [".html"] }).map((file) =>
      basename(file),
    );
    expect(names).toContain("bad-controlled-input.html");
    expect(names).toContain("bad-controlled-textarea.html");
    expect(names).toContain("bad-controlled-select.html");
    expect(names).toContain("bad-contenteditable.html");
    expect(names).toContain("good-noncontrolled-input.html");
  });

  for (const name of ["bad-controlled-input.html", "bad-controlled-textarea.html"]) {
    test(`live DOM property crawl catches controlled ${name} raw code values`, async ({ page }) => {
      await page.setContent(readFileSync(`${RUNTIME_FIXTURE_ROOT}/${name}`, "utf8"));
      const leaks = await scanPage(page);
      expect(leaks.map((leak) => leak.phase)).toContain("live-dom-property");
      expect(leaks.map((leak) => leak.code)).toContain("SHEET_UNAVAILABLE");
    });
  }

  test("live DOM property crawl catches selected option values", async ({ page }) => {
    await page.setContent(
      readFileSync(`${RUNTIME_FIXTURE_ROOT}/bad-controlled-select.html`, "utf8"),
    );
    const leaks = await scanPage(page);
    expect(leaks.map((leak) => `${leak.phase}:${leak.kind}`)).toContain(
      "live-dom-property:select.selectedOptions[0].value",
    );
  });

  test("runtime crawl catches contenteditable and internal enum leaks", async ({ page }) => {
    for (const name of ["bad-contenteditable.html", "bad-internal-enum-leak.html"]) {
      await page.setContent(readFileSync(`${RUNTIME_FIXTURE_ROOT}/${name}`, "utf8"));
      expect((await scanPage(page)).map((leak) => leak.code)).not.toEqual([]);
    }
  });

  test("runtime crawl passes a non-controlled input with non-code copy", async ({ page }) => {
    await page.setContent(
      readFileSync(`${RUNTIME_FIXTURE_ROOT}/good-noncontrolled-input.html`, "utf8"),
    );
    expect((await scanPage(page)).map(formatRuntimeLeak)).toEqual([]);
  });

  test("discovers static app routes by page.tsx shape and crawls visible text, attributes, and live properties", async ({
    page,
  }) => {
    await signOut(page);
    const routePaths = discoverStaticAppRoutePaths();
    expect(routePaths).toContain("/");
    expect(routePaths).toContain("/admin");
    expect(routePaths).not.toContain("/admin/dev");

    for (const routePath of routePaths) {
      if (routePath.startsWith("/admin") || routePath === "/me") {
        await signInAs(page, ADMIN_FIXTURE);
      }
      const response = await page.goto(routePath);
      expect(
        response?.status(),
        `route ${routePath} should be reachable enough for the raw-code crawl`,
      ).toBeLessThan(500);
      expect((await scanPage(page)).map(formatRuntimeLeak)).toEqual([]);
    }
  });
});

test.describe("M11-A-D3 MDX runtime no-raw-codes coverage", () => {
  test("route discovery includes page.mdx surfaces", () => {
    // The historical M11-A-D3 gap was that `discoverStaticAppRoutePaths()`
    // crawled only `page.tsx`. M11 introduced most help routes as `page.mdx`,
    // so an MDX-authored raw code would have escaped the crawl. The live
    // discovery now walks `.mdx` too; assert a known live help MDX route is in
    // scope so a future regression that drops `.mdx` filtering fails here.
    const routePaths = discoverStaticAppRoutePaths();
    expect(routePaths).toContain("/help/getting-started");
  });

  test("runtime crawl catches a raw §12.4 code rendered from an MDX help page", async ({
    page,
  }) => {
    const source = readFileSync(`${MDX_FIXTURE_ROOT}/bad-help-page.mdx`, "utf8");
    // Guard the fixture itself: it must genuinely be MDX carrying a raw code,
    // otherwise the assertion below would be tautological.
    expect(source).toContain("SHEET_UNAVAILABLE");

    await page.setContent(await renderMdxFixtureToHtml("bad-help-page.mdx"));
    const leaks = await scanPage(page);
    expect(leaks.map((leak) => leak.code)).toContain("SHEET_UNAVAILABLE");
    // The code leaks via BOTH the compiled `<p>` text node and the
    // `<abbr title=...>` user-visible attribute — proving the crawl's
    // textContent and attribute phases both cover MDX-compiled DOM.
    expect(leaks.map((leak) => leak.phase)).toContain("textContent");
    expect(leaks.map((leak) => leak.phase)).toContain("attribute");
  });

  test("runtime crawl passes an MDX help page with only plain-language copy", async ({ page }) => {
    await page.setContent(await renderMdxFixtureToHtml("good-help-page.mdx"));
    expect((await scanPage(page)).map(formatRuntimeLeak)).toEqual([]);
  });
});
