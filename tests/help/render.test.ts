// @vitest-environment jsdom
import { MDXProvider } from "@mdx-js/react";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { useMDXComponents } from "@/mdx-components";

type HelpPage = {
  route: string;
  file: string;
};

function discoverPages(): HelpPage[] {
  const root = join(process.cwd(), "app/help");
  const found: HelpPage[] = [];

  function walk(dir: string, segments: string[]) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith("_")) continue;
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk(full, [...segments, entry]);
      } else if (entry === "page.mdx" || entry === "page.tsx") {
        found.push({
          route: `/${["help", ...segments].join("/")}`,
          file: full,
        });
      }
    }
  }

  walk(root, []);
  return found.sort((a, b) => a.route.localeCompare(b.route));
}

async function importPage(file: string): Promise<ComponentType> {
  const mod = await import(/* @vite-ignore */ pathToFileURL(file).href);
  return mod.default;
}

describe("MDX smoke renderer (test #4)", () => {
  const pages = discoverPages();

  it(`discovers all 14 v1 pages (found ${pages.length})`, () => {
    expect(pages.map((page) => page.route)).toEqual([
      "/help",
      "/help/admin/dashboard",
      "/help/admin/onboarding-wizard",
      "/help/admin/parse-warnings",
      "/help/admin/per-show-panel",
      "/help/admin/preview-as-crew",
      "/help/admin/review-queues",
      "/help/admin/settings",
      "/help/admin/sharing-links",
      "/help/daily-rhythm",
      "/help/errors",
      "/help/getting-started",
      "/help/tour",
      "/help/whats-different",
    ]);
  });

  for (const { route, file } of pages) {
    it(`${route}: renders non-empty HTML`, async () => {
      const Page = await importPage(file);
      const html = renderToStaticMarkup(
        createElement(
          MDXProvider,
          { components: useMDXComponents({}) },
          createElement(Page),
        ),
      );

      expect(html.length).toBeGreaterThan(100);
    });
  }
});
