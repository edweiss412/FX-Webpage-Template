// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, cleanup } from "@testing-library/react";
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError: vi.fn() }));
import CrewError from "@/app/show/[slug]/[shareToken]/error";
afterEach(cleanup);
const CREW = "app/show/[slug]/[shareToken]/error.tsx";
const GLOBAL = "app/global-error.tsx";
describe("error-boundary fallback layout/transition (§10/§11)", () => {
  test("crew fallback: single rendered button has min-h-tap-min, centered container", () => {
    render(<CrewError error={new Error("x")} reset={() => {}} />);
    expect(screen.getByRole("button").className).toMatch(/min-h-tap-min/);
    // centered column container present
    expect(readFileSync(CREW, "utf8")).toMatch(/items-center[\s\S]*justify-center/);
  });
  test("global fallback: button min-h-tap-min + centered full-viewport column (source — it renders <html>, awkward to RTL-render)", () => {
    const src = readFileSync(GLOBAL, "utf8");
    expect(src).toMatch(/min-h-tap-min/); // the Reload button tap target
    expect(src).toMatch(/min-h-screen/); // full-viewport
    expect(src).toMatch(/items-center[\s\S]*justify-center/); // centered column
  });
  test("both fallbacks are instant — no framer-motion (transition inventory)", () => {
    for (const f of [CREW, GLOBAL]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/framer-motion|AnimatePresence|motion\./);
    }
  });
});
