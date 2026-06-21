// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(join(process.cwd(), "app/help/admin/dashboard/page.mdx"), "utf8");

describe("/help/admin/dashboard (E.5)", () => {
  it("renders without throwing through the real MDX pipeline (r3 per E-r2 finding 2)", async () => {
    // Production wires MDX components via `useMDXComponents` in
    // `mdx-components.tsx` (Next.js auto-injection). In the Vitest pipeline
    // we replicate that wiring by wrapping the page in `MDXProvider` with
    // the same component map. Without this, Screenshot / Callout / etc.
    // compile to `undefined` and `render()` throws (verified during E.1 fix
    // pass 2026-05-20). The wrapper is load-bearing for the Vitest pipeline;
    // it is not needed in production where Next.js auto-injects the same map.
    const Mod = await import("@/app/help/admin/dashboard/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    expect(() =>
      render(
        <MDXProvider components={components}>
          <Page />
        </MDXProvider>,
      ),
    ).not.toThrow();
  });

  it("renders the canonical H1 into the DOM (catches MDX compiler/component-map regression where source has H1 but rendered output drops it)", async () => {
    const Mod = await import("@/app/help/admin/dashboard/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Reading the dashboard");
  });

  it("has the canonical H1", () => {
    expect(src).toMatch(/^# Reading the dashboard\b/m);
  });

  it("has plain h2 section anchors matching §5.6 matrix fragments", () => {
    expect(src).toMatch(/<h2[^>]*id=["']active-shows["']/);
    expect(src).toMatch(/<h2[^>]*id=["']pending-ingestion["']/);
  });

  it("does NOT use RefAnchor for these section anchors (catalog-code-only per D.5)", () => {
    expect(src).not.toMatch(/<RefAnchor\s+id=["']ACTIVE_SHOWS["']/);
    expect(src).not.toMatch(/<RefAnchor\s+id=["']PENDING_INGESTION["']/);
  });

  it("links to /help/admin/review-queues", () => {
    expect(src).toContain("/help/admin/review-queues");
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });

  it("does NOT claim an 'Open in Drive' action on pending-row UI (Codex R8 regression — real actions are Retry now / Defer until modified / Permanently ignore)", () => {
    // The shipped PendingPanelRetryButton + PendingPanelDiscardButtons render
    // three actions: "Retry now", "Defer until modified", "Permanently ignore".
    // "Open in Drive" appears only in unrelated AgendaEmbed JSDoc + an asset
    // route comment — never as a pending-row button. Pin docs against drift.
    expect(src).not.toMatch(/\bOpen in Drive\b/);
    // Positive: the three real action labels are documented.
    expect(src).toContain("Retry now");
    expect(src).toContain("Defer until modified");
    expect(src).toContain("Permanently ignore");
  });
});
