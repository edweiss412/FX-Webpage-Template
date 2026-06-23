import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * HelpTable — the MDX `table` override for /help (audit Chunk-6 follow-up, D8).
 *
 * remark-gfm renders catalog tables as real `<table><thead><tr><th>…`. On a
 * phone (≤480px) the DENSE 3-column reference tables (dashboard sync-status,
 * settings health-badge, onboarding first-contact) wrap into very tall cells
 * that are barely faster to scan than the old prose (DEFERRED.md D8). This
 * component tags tables with ≥3 columns `data-stack="true"` and injects a
 * REAL-TEXT per-cell label (the cell's column header) so globals.css can turn
 * each row into a labeled stacked card at ≤480px.
 *
 * Why real-text labels (a `.th-label` span), not CSS `::before { content:
 * attr(data-label) }`: generated content is read inconsistently by screen
 * readers. The span is real DOM text — `display:none` on desktop (so it leaves
 * the a11y tree and the real `<th>` column-header association is used) and shown
 * on mobile (where the stacked `display:block` layout has dropped the implicit
 * table roles, so the visible label is what carries the header for SR users).
 *
 * 2-column tables (the review-queues TL;DR + Apply/Discard comparison + the
 * onboarding resolved-states table) are LEFT UNCHANGED: they fit acceptably at
 * 390px, and stacking the Apply/Discard comparison would falsely pair its two
 * independent columns. The DOM structure (thead/tbody/tr/td/th) is preserved
 * either way, so the render tests still find tables by header + count body rows.
 */

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function childrenOf(el: ReactElement): ReactNode {
  return (el.props as { children?: ReactNode }).children;
}

function findChild(node: ReactNode, type: string): ReactElement | undefined {
  return Children.toArray(node).find(
    (c): c is ReactElement => isValidElement(c) && c.type === type,
  );
}

export function HelpTable({ children, ...rest }: { children?: ReactNode }) {
  const thead = findChild(children, "thead");
  const tbody = findChild(children, "tbody");

  // Column headers, in order, from the first header row.
  const headerRow = thead ? findChild(childrenOf(thead), "tr") : undefined;
  const headers = headerRow
    ? Children.toArray(childrenOf(headerRow))
        .filter(isValidElement)
        .map((th) => textOf(childrenOf(th)))
    : [];

  // Only the dense (≥3-col) reference tables stack; 2-col tables render as-is.
  if (headers.length < 3 || !tbody) {
    return <table {...rest}>{children}</table>;
  }

  const stackedBody = cloneElement(
    tbody,
    {},
    Children.toArray(childrenOf(tbody))
      .filter(isValidElement)
      .map((tr, rowIndex) =>
        cloneElement(
          tr,
          { key: `r${rowIndex}` },
          Children.toArray(childrenOf(tr))
            .filter(isValidElement)
            .map((td, colIndex) =>
              cloneElement(
                td,
                { key: `c${colIndex}` },
                <span key="label" className="th-label">
                  {headers[colIndex] ?? ""}
                </span>,
                <span key="content" className="td-content">
                  {childrenOf(td)}
                </span>,
              ),
            ),
        ),
      ),
  );

  return (
    <table {...rest} data-stack="true">
      {thead}
      {stackedBody}
    </table>
  );
}
