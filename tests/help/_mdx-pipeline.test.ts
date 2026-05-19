import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("MDX pipeline", () => {
  it("mdx-components.tsx exists at project root", () => {
    expect(existsSync(join(process.cwd(), "mdx-components.tsx"))).toBe(true);
  });

  it("next.config.ts registers mdx in pageExtensions", async () => {
    const cfg = await import("@/next.config");
    expect(cfg.default.pageExtensions).toContain("mdx");
  });
});
