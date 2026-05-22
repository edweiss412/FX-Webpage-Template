import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function walkMdx(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkMdx(full, found);
    else if (entry.endsWith(".mdx")) found.push(full);
  }
  return found;
}

describe("No <ScreenshotPlaceholder> in shipped v1 MDX (test #7)", () => {
  const root = join(process.cwd(), "app/help");
  const mdx = walkMdx(root);
  const violations: string[] = [];

  for (const file of mdx) {
    const src = readFileSync(file, "utf8");
    if (src.includes("<ScreenshotPlaceholder")) {
      violations.push(relative(process.cwd(), file));
    }
  }

  it("no .mdx file references <ScreenshotPlaceholder>", () => {
    expect(
      violations,
      `Violations:\n${violations.join(
        "\n",
      )}\n\nPhase F.10 retrofits these to <Screenshot name="..."> or removes them.`,
    ).toEqual([]);
  });
});
