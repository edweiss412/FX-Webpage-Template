// @vitest-environment jsdom
/**
 * tests/help/help-table-responsive.test.tsx (D8 — responsive catalog tables)
 *
 * The HelpTable MDX `table` override drives the ≤480px stacked-card transform:
 * it tags DENSE (≥3-column) tables `data-stack="true"` and injects a real-text
 * `.th-label` per body cell (from that cell's column header) so the cards stay
 * screen-reader-readable on mobile. 2-column tables (incl. the Apply/Discard
 * comparison) are left untagged so they keep the normal table layout and are
 * never falsely paired. The DOM structure (thead/tbody/tr/td/th) is preserved.
 *
 * jsdom has no layout/media-query engine, so the actual ≤480px STACKING is
 * proven by the real-browser assertion in tests/e2e/help-typography.spec.ts;
 * here we pin the component contract that the CSS keys off.
 */
import { render, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ComponentType } from "react";
import { useMDXComponents } from "@/mdx-components";
import { HelpTable } from "@/app/help/_components/HelpTable";
import Dashboard from "@/app/help/admin/dashboard/page.mdx";
import ReviewQueues from "@/app/help/admin/review-queues/page.mdx";

function MdxPage({
  Page,
}: {
  Page: ComponentType<{ components?: ReturnType<typeof useMDXComponents> }>;
}) {
  return <Page components={useMDXComponents({})} />;
}

describe("HelpTable — responsive catalog tables (D8)", () => {
  it("tags a ≥3-column table data-stack and injects a real-text label per cell", () => {
    const { container } = render(
      <HelpTable>
        <thead>
          <tr>
            <th>Status</th>
            <th>What it means</th>
            <th>What to do</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Synced</td>
            <td>Polled cleanly</td>
            <td>Nothing</td>
          </tr>
        </tbody>
      </HelpTable>,
    );
    const table = container.querySelector("table")!;
    expect(table.getAttribute("data-stack")).toBe("true");
    // structure preserved
    expect(table.querySelector("thead th")?.textContent).toBe("Status");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    // one real-text label per body cell, in column order, from the headers
    const labels = Array.from(table.querySelectorAll("tbody .th-label")).map((l) => l.textContent);
    expect(labels).toEqual(["Status", "What it means", "What to do"]);
    // labels are real DOM text (not ::before/aria-hidden) so SR reads them on mobile
    expect(table.querySelector("tbody .th-label")?.getAttribute("aria-hidden")).toBeNull();
    // cell content survives intact alongside the label
    const firstCell = table.querySelector("tbody td")!;
    expect(firstCell.textContent).toBe("StatusSynced");
    expect(firstCell.querySelector(".td-content")?.textContent).toBe("Synced");
  });

  it("leaves a 2-column table untagged and uninjected (no false pairing, no labels)", () => {
    const { container } = render(
      <HelpTable>
        <thead>
          <tr>
            <th>Apply when</th>
            <th>Discard when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Intentional change</td>
            <td>A typo</td>
          </tr>
        </tbody>
      </HelpTable>,
    );
    const table = container.querySelector("table")!;
    expect(table.getAttribute("data-stack")).toBeNull();
    expect(table.querySelectorAll(".th-label")).toHaveLength(0);
    expect(table.querySelector("tbody td")?.textContent).toBe("Intentional change");
  });

  it("real pages: the 3 dense catalogs stack, the 2-col tables do not", () => {
    const dash = render(<MdxPage Page={Dashboard as never} />).container;
    // dashboard sync-status (3-col) is tagged
    const dashStacked = Array.from(dash.querySelectorAll('table[data-stack="true"]'));
    expect(dashStacked).toHaveLength(1);
    // and its cells carry labels matching the header
    expect(
      within(dashStacked[0] as HTMLElement).getAllByText("What it means", { selector: ".th-label" })
        .length,
    ).toBeGreaterThan(0);

    const rq = render(<MdxPage Page={ReviewQueues as never} />).container;
    // review-queues has only 2-col tables (TL;DR + Apply/Discard) -> none stacked
    expect(rq.querySelectorAll('table[data-stack="true"]')).toHaveLength(0);
    expect(rq.querySelectorAll("table").length).toBeGreaterThanOrEqual(2);
  });
});
