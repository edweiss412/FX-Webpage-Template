// @vitest-environment jsdom
/**
 * tests/help/help-catalog-tables.test.tsx (audit Chunk 2 — Theme B)
 *
 * The four highest-traffic /help lookup catalogs were run-on prose bullets that
 * should be scannable tables (dashboard sync-status, settings health-badge,
 * onboarding Step-3 badges, review-queues Apply/Discard). Markdown pipe-tables
 * require `remark-gfm` — vanilla @next/mdx does NOT parse `| a | b |` as a
 * table. This file pins, at two levels:
 *   1. STRUCTURAL — the pipeline is wired (next.config + vitest), each catalog
 *      is a table in source (not the old bullets), and the linked sub-anchors
 *      survive.
 *   2. RENDER — each catalog actually renders as a <table> through the real MDX
 *      pipeline (the whole point of remark-gfm), with the documented cells +
 *      cross-links inside the table (anti-tautology: assertions are scoped to
 *      the rendered <table>, not the whole container).
 *
 * The .help-prose <table> STYLING (borders, header tint) is proven in a real
 * browser by tests/e2e/help-typography.spec.ts.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentType } from "react";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// A real React component (Uppercase) so the useMDXComponents hook is called in a
// valid context (react-hooks/rules-of-hooks). Mirrors production's Next-injected
// component map, the way the per-page render smokes do.
function MdxPage({ Page }: { Page: ComponentType }) {
  const components = useMDXComponents({});
  return (
    <MDXProvider components={components}>
      <Page />
    </MDXProvider>
  );
}
const renderMdx = (Page: ComponentType) => render(<MdxPage Page={Page} />);

/** Find the rendered <table> whose header row contains all given cell texts. */
function tableByHeader(container: HTMLElement, headerCells: string[]): HTMLTableElement {
  const tables = Array.from(container.querySelectorAll("table"));
  const match = tables.find((t) => {
    const head = t.querySelector("thead")?.textContent ?? "";
    return headerCells.every((c) => head.includes(c));
  });
  if (!match) {
    throw new Error(
      `no <table> with header [${headerCells.join(", ")}]; found ${tables.length} table(s)`,
    );
  }
  return match as HTMLTableElement;
}

const bodyRows = (t: HTMLTableElement) => Array.from(t.querySelectorAll("tbody tr"));

describe("Chunk 2 — remark-gfm pipeline + Theme B source conversions (structural)", () => {
  it("remark-gfm is wired into BOTH the production and test MDX pipelines", () => {
    // next.config (@next/mdx) passes the plugin by STRING NAME — its loader
    // requires serializable options, so the function form fails the build.
    const next = read("next.config.ts");
    expect(next, "next.config registers remark-gfm by string name (serializable)").toMatch(
      /remarkPlugins:\s*\[\s*\[\s*["']remark-gfm["']/,
    );
    // vitest (@mdx-js/rollup) takes the plugin FUNCTION directly, so it mirrors
    // remark-gfm via the imported symbol — keeping test renders matched to prod.
    const vitestCfg = read("vitest.config.ts");
    expect(vitestCfg, "vitest imports remark-gfm").toMatch(
      /import\s+remarkGfm\s+from\s+["']remark-gfm["']/,
    );
    expect(vitestCfg, "vitest registers the remarkGfm function").toMatch(
      /remarkPlugins:\s*\[\s*remarkGfm/,
    );
  });

  it("dashboard/settings/review-queues/onboarding sources are tables, not the old bullets", () => {
    // Header regexes tolerate prettier's markdown-table column padding.
    const dash = read("app/help/admin/dashboard/page.mdx");
    expect(dash).not.toMatch(/^- \*\*Synced\*\* —/m);
    expect(dash).toMatch(/\|\s*Status\s*\|\s*What it means\s*\|\s*What to do\s*\|/);
    expect(dash).toContain("/help/admin/review-queues");

    const settings = read("app/help/admin/settings/page.mdx");
    expect(settings).not.toMatch(/^- \*\*Connected\.\*\*/m);
    expect(settings).toMatch(/\|\s*Status line\s*\|\s*What it means\s*\|\s*What to do\s*\|/);
    expect(settings).toContain("/help/admin/dashboard#pending-ingestion");

    const rq = read("app/help/admin/review-queues/page.mdx");
    expect(rq).not.toMatch(/^## When to (Apply|Discard)\b/m);
    expect(rq).toMatch(/\|\s*Apply when\s*\|\s*Discard when\s*\|/);
    expect(rq).toMatch(/<Callout type="tip">/);
    expect(rq, "#re-stage anchor preserved").toMatch(/<h2 id="re-stage">/);

    // Onboarding step-3 redesign (2026-06-23): step 3 is now inline review
    // cards + a publish checkbox, not the old badge/resolve flow. The catalog
    // table here is the clean-card outcome table (tick → live / unticked →
    // draft); the old [Badge, What it means, Your options] and [Resolved badge,
    // Meaning] tables were removed with the badge model.
    const onb = read("app/help/admin/onboarding-wizard/page.mdx");
    expect(onb).not.toMatch(/^- \*\*Ready for review\.\*\*/m);
    expect(onb).toMatch(/\|\s*Your choice on a clean card\s*\|\s*What happens\s*\|/);
    expect(onb, "#step-3 anchor preserved").toMatch(/<h2 id="step-3">/);
    expect(onb, "#unpublished anchor added").toMatch(/<h2 id="unpublished">/);
    expect(onb, "#ignored-sheets anchor added").toMatch(/<h2 id="ignored-sheets">/);
  });
});

describe("Chunk 2 — catalogs render as real <table> elements (behavioral)", () => {
  it("dashboard sync-status renders a Status/What-it-means/What-to-do table with the Needs-attention link", async () => {
    const Page = (await import("@/app/help/admin/dashboard/page.mdx")).default;
    const { container } = renderMdx(Page);
    const t = tableByHeader(container, ["Status", "What it means", "What to do"]);
    expect(bodyRows(t).length, "5 sync-status rows").toBe(5);
    expect(t.textContent).toContain("Not synced yet");
    // The "Changes to review" row points to the Needs-attention inbox (same page),
    // NOT a staged-review card on the panel — that retired model is gone. Scoped
    // query so the link is the one INSIDE the table, not a sibling.
    expect(
      within(t)
        .getByRole("link", { name: /Needs attention inbox/i })
        .getAttribute("href"),
    ).toContain("#pending-ingestion");
  });

  it("settings health-badge renders a status table with the needs-attention link", async () => {
    const Page = (await import("@/app/help/admin/settings/page.mdx")).default;
    const { container } = renderMdx(Page);
    const t = tableByHeader(container, ["Status line", "What it means", "What to do"]);
    expect(bodyRows(t).length, "5 health-badge rows").toBe(5);
    expect(t.textContent).toContain("Connection needs attention");
    expect(
      within(t)
        .getByRole("link", { name: /Needs attention inbox/i })
        .getAttribute("href"),
    ).toContain("/help/admin/dashboard#pending-ingestion");
  });

  it("review-queues renders a side-by-side Apply/Discard decision table", async () => {
    const Page = (await import("@/app/help/admin/review-queues/page.mdx")).default;
    const { container } = renderMdx(Page);
    const t = tableByHeader(container, ["Apply when", "Discard when"]);
    expect(bodyRows(t).length, "3 decision rows").toBe(3);
    // the "not sure → Discard" guidance is a Callout, present alongside the table
    expect(container.textContent).toMatch(/Not sure\?/);
  });

  it("onboarding Step-3 renders the clean-card outcome table (tick → live / unticked → draft)", async () => {
    const Page = (await import("@/app/help/admin/onboarding-wizard/page.mdx")).default;
    const { container } = renderMdx(Page);
    const outcomes = tableByHeader(container, ["Your choice on a clean card", "What happens"]);
    expect(bodyRows(outcomes).length, "2 clean-card outcomes").toBe(2);
    // Both outcomes documented inside the rendered table (anti-tautology: scoped
    // to the <table>, not the whole container).
    expect(outcomes.textContent).toContain("Tick the publish checkbox");
    expect(outcomes.textContent).toContain("Leave it unticked");
    expect(outcomes.textContent, "unticked → draft marked Held in Active shows").toMatch(
      /draft[\s\S]*Held/,
    );
  });
});
