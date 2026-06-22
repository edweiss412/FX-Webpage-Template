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
const forbiddenCodes = buildForbiddenCodeIndex({ runtimeSubstringMinLength: 4 });

async function scanPage(page: Page) {
  return collectRawCodeLeaksInPage(page, forbiddenCodes);
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
