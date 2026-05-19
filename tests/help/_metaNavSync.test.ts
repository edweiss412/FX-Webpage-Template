import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NAV } from "@/app/help/_nav";

/**
 * Walk app/help/ recursively, collecting every directory that contains
 * page.mdx or page.tsx. Each such directory corresponds to a route slug
 * (relative to app/help) — collapse "" → "/help", "admin/dashboard" →
 * "/help/admin/dashboard", etc.
 */
function discoverRoutes(): string[] {
  const root = join(process.cwd(), "app/help");
  const found: string[] = [];

  function walk(dir: string, segments: string[]) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith("_")) continue; // _components, _nav.ts, etc. are not routes
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full, [...segments, entry]);
      } else if (entry === "page.mdx" || entry === "page.tsx") {
        found.push("/" + ["help", ...segments].join("/"));
      }
    }
  }
  walk(root, []);
  return found.sort();
}

describe("_nav.ts ↔ filesystem consistency (test #5)", () => {
  it("every NAV entry has a real page on disk", () => {
    const routes = discoverRoutes();
    for (const entry of NAV) {
      expect(routes).toContain(entry.slug);
    }
  });

  it("every page.mdx/page.tsx on disk is referenced in NAV", () => {
    const routes = discoverRoutes();
    const navSlugs = NAV.map((e) => e.slug);
    for (const route of routes) {
      expect(navSlugs).toContain(route);
    }
  });
});
