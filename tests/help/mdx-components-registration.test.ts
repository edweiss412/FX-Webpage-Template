import { describe, it, expect } from "vitest";
import { useMDXComponents } from "@/mdx-components";

describe("mdx-components.tsx registration (Task D.7)", () => {
  it("registers all six M11 components", () => {
    const components = useMDXComponents({});
    expect(typeof components.Callout).toBe("function");
    expect(typeof components.Step).toBe("function");
    expect(typeof components.Screenshot).toBe("function");
    expect(typeof components.ScreenshotPlaceholder).toBe("function");
    expect(typeof components.RefAnchor).toBe("function");
    expect(typeof components.TipFromSheets).toBe("function");
  });
});
