import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST } from "@/scripts/help-screenshots.manifest";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "app");
const SCREENSHOTS_DIR = join(ROOT, "public", "help", "screenshots");

function fixtureExists(fixture: string): boolean {
  return (
    existsSync(join(ROOT, "fixtures", "shows", "raw", `${fixture}.md`)) ||
    existsSync(join(ROOT, "fixtures", "shows", "pdf-only", `${fixture}__INFO.md`))
  );
}

function appPageForRoute(route: string): string | null {
  const pathname = route.split("?")[0]?.replace(/^\/+|\/+$/g, "") ?? "";
  const segments = pathname === "" ? [] : pathname.split("/");
  let dir = APP_ROOT;

  for (const segment of segments) {
    const exact = join(dir, segment);
    if (existsSync(exact) && statSync(exact).isDirectory()) {
      dir = exact;
      continue;
    }

    const dynamic = readdirSync(dir, { withFileTypes: true }).find(
      (entry) => entry.isDirectory() && /^\[[^\]]+\]$/.test(entry.name),
    );
    if (!dynamic) return null;
    dir = join(dir, dynamic.name);
  }

  const pageTsx = join(dir, "page.tsx");
  if (existsSync(pageTsx)) return pageTsx;

  const pageMdx = join(dir, "page.mdx");
  if (existsSync(pageMdx)) return pageMdx;

  return null;
}

function screenshotsDirActive(): boolean {
  if (!existsSync(SCREENSHOTS_DIR)) return false;
  if (!statSync(SCREENSHOTS_DIR).isDirectory()) return false;
  return readdirSync(SCREENSHOTS_DIR).some((entry) => entry.endsWith(".webp"));
}

describe("help screenshot manifest integrity (Task F.7 / test #9)", () => {
  it("every manifest fixture resolves to a raw or pdf-only INFO fixture", () => {
    const missing = MANIFEST.filter((entry) => !fixtureExists(entry.fixture)).map(
      (entry) => `${entry.key}: ${entry.fixture}`,
    );

    expect(missing, `Missing screenshot fixtures:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every manifest route resolves to a real App Router page", () => {
    const missing = MANIFEST.filter((entry) => appPageForRoute(entry.route) === null).map(
      (entry) => `${entry.key}: ${entry.route}`,
    );

    expect(missing, `Routes without App Router pages:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every manifest entry has light + dark WebPs once screenshots exist", () => {
    if (!screenshotsDirActive()) return;

    const missing: string[] = [];
    for (const entry of MANIFEST) {
      for (const theme of ["light", "dark"] as const) {
        const path = join(SCREENSHOTS_DIR, `${entry.key}-${theme}.webp`);
        if (!existsSync(path)) missing.push(`${entry.key}-${theme}.webp`);
      }
    }

    expect(missing, `Missing screenshot WebPs:\n${missing.join("\n")}`).toEqual([]);
  });

  it("does not contain orphan WebPs outside the manifest key set", () => {
    if (!screenshotsDirActive()) return;

    const keys = new Set(MANIFEST.map((entry) => entry.key));
    const orphans = readdirSync(SCREENSHOTS_DIR)
      .filter((entry) => entry.endsWith(".webp"))
      .filter((entry) => {
        const match = /^(.*)-(?:light|dark)\.webp$/.exec(entry);
        return !match || !keys.has(match[1] ?? "");
      });

    expect(orphans, `Orphan screenshot WebPs:\n${orphans.join("\n")}`).toEqual([]);
  });
});
