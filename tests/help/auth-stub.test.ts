import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("/help layout (Phase A smoke)", () => {
  it("app/help/layout.tsx exists", () => {
    expect(existsSync(join(process.cwd(), "app/help/layout.tsx"))).toBe(true);
  });

  it("app/help/layout.tsx calls requireAdmin and catches AdminInfraError", () => {
    const src = readFileSync(join(process.cwd(), "app/help/layout.tsx"), "utf8");
    expect(src).toMatch(/await\s+requireAdmin\(\)/);
    expect(src).toMatch(/instanceof\s+AdminInfraError/);
  });

  it("app/help/layout.tsx exports dynamic = 'force-dynamic'", () => {
    const src = readFileSync(join(process.cwd(), "app/help/layout.tsx"), "utf8");
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });

  it("app/help/page.mdx exists", () => {
    expect(existsSync(join(process.cwd(), "app/help/page.mdx"))).toBe(true);
  });
});
