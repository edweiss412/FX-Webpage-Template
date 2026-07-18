/**
 * components/messages/renderEmphasis.tsx
 *
 * Shared renderer for the Markdown emphasis markers the §12.4 catalog
 * authors into copy (`**bold**`, `*em*`, word-boundary `_em_`). Converts
 * markers to <strong>/<em> so no literal `*` / `_` characters reach the DOM.
 *
 * Companion to `stripEmphasis` in lib/messages/collapsedSummary.ts (the
 * collapsed AlertBanner line strips; full surfaces render styled — this
 * helper is the "render styled" half). Same pass order (**bold** → *em* →
 * _em_), the same word-boundary contract for `_em_` (internal underscores
 * in tokens like (SW-POST_SHOW) are left intact), and the same `[^*]+`
 * content classes — so a literal `***` run (the UNKNOWN_DAY_RESTRICTION
 * day-restriction marker) is preserved identically by both the styled and
 * the plaintext (stripEmphasis / plainCatalogText) paths.
 *
 * Consumers: every surface that renders catalog copy as JSX — pinned by
 * tests/messages/_metaEmphasisRenderContract.test.ts.
 */
import { cloneElement, isValidElement, type ReactNode } from "react";
import { interpolate, PLACEHOLDER_RE, type MessageParams } from "@/lib/messages/lookup";

const BOLD_RE = /\*\*([^*]+)\*\*/g;
const EM_RE = /\*([^*]+)\*/g;
// Word-boundary _em_: same boundary contract as stripEmphasis. The leading
// boundary character is captured so it can be re-emitted as plain text.
const UNDERSCORE_EM_RE = /(^|[\s("'])_(\S(?:.*?\S)?)_(?=[\s)"'.,!?;:]|$)/g;

type Wrap = (content: string, key: string) => ReactNode;

/** Run one marker pass over the string segments of a node list. */
function applyPass(
  nodes: ReactNode[],
  re: RegExp,
  emit: (match: RegExpExecArray, key: string) => ReactNode[],
  passName: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  for (const [i, node] of nodes.entries()) {
    if (typeof node !== "string") {
      out.push(node);
      continue;
    }
    let cursor = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(node)) !== null) {
      if (m.index > cursor) out.push(node.slice(cursor, m.index));
      out.push(...emit(m, `${passName}-${i}-${m.index}`));
      cursor = m.index + m[0].length;
    }
    if (cursor < node.length) out.push(node.slice(cursor));
  }
  return out;
}

function wrapPass(nodes: ReactNode[], re: RegExp, wrap: Wrap, passName: string): ReactNode[] {
  return applyPass(nodes, re, (m, key) => [wrap(m[1] as string, key)], passName);
}

/**
 * Param-safe renderer: parse emphasis on the raw catalog TEMPLATE, then
 * interpolate placeholder values into the resulting text nodes. Parameter
 * values are opaque text — byte-preserved, never parsed as markup. Use this
 * (not renderEmphasis on an already-interpolated string) whenever params
 * exist: a sheet literally named "Foo *draft*" must render byte-identical
 * inside the styled wrapper instead of being consumed as emphasis and
 * splitting the catalog-authored marker pair (Codex R1 MEDIUM).
 *
 * Placeholders are atomic `<token>` runs with no marker characters, so they
 * never span an emphasis boundary; interpolating per text node (including
 * the single string child of each <em>/<strong> this module creates) is
 * exactly equivalent to messageFor's whole-string interpolation.
 */
export function renderCatalogEmphasis(
  template: string,
  params?: MessageParams,
  identityKeys?: ReadonlySet<string>,
): ReactNode[] {
  const nodes = renderEmphasis(template);
  if (!params) return nodes;
  if (!identityKeys || identityKeys.size === 0) {
    // Unchanged 2-arg path — byte-identical to today (back-compat for
    // HealthAlertsPanel and every other non-identity caller).
    return nodes.map((node, i) => {
      if (typeof node === "string") {
        return interpolate(node, params) ?? node;
      }
      if (
        isValidElement<{ children?: ReactNode }>(node) &&
        typeof node.props.children === "string"
      ) {
        return cloneElement(
          node,
          { key: node.key ?? `p-${i}` },
          interpolate(node.props.children, params) ?? node.props.children,
        );
      }
      return node;
    });
  }
  // Identity-aware pass (WI-3, ALERT-COPY-IDENTITY-BOLD-1): split string nodes on
  // placeholder boundaries; a placeholder whose (hyphen/underscore-normalized)
  // key ∈ identityKeys renders BOLD, every other placeholder + literal stays
  // plain (delegating to interpolate's not-found semantics). Emphasis from the
  // template `*`/`**` markers composes — an identity param inside an `*em*` span
  // is both italic and bold.
  const norm = (k: string): string[] => [k, k.replace(/-/g, "_"), k.replace(/_/g, "-")];
  const boldSplit = (s: string, keyPrefix: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let cursor = 0;
    let m: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(s)) !== null) {
      const key = m[1] as string;
      const value = params[key] ?? params[key.replace(/-/g, "_")] ?? params[key.replace(/_/g, "-")];
      if (m.index > cursor) out.push(s.slice(cursor, m.index));
      if (value === undefined || value === null) {
        out.push(m[0]); // not-found: leave the literal placeholder (matches interpolate)
      } else if (norm(key).some((k) => identityKeys.has(k)) && String(value) !== "") {
        out.push(
          <strong key={`${keyPrefix}-${m.index}`} className="font-semibold text-text-strong">
            {String(value)}
          </strong>,
        );
      } else {
        out.push(String(value));
      }
      cursor = m.index + m[0].length;
    }
    if (cursor < s.length) out.push(s.slice(cursor));
    return out;
  };
  const result: ReactNode[] = [];
  nodes.forEach((node, i) => {
    if (typeof node === "string") {
      result.push(...boldSplit(node, `id-${i}`));
      return;
    }
    if (isValidElement<{ children?: ReactNode }>(node) && typeof node.props.children === "string") {
      result.push(
        cloneElement(
          node,
          { key: node.key ?? `p-${i}` },
          boldSplit(node.props.children, `ide-${i}`),
        ),
      );
      return;
    }
    result.push(node);
  });
  return result;
}

/** Nullable-copy convenience: render styled markers, or the plain fallback. */
export function renderEmphasisOr(text: string | null | undefined, fallback: string): ReactNode {
  return text == null ? fallback : renderEmphasis(text);
}

/**
 * Convert catalog emphasis markers in `text` to styled React nodes.
 * Marker-free strings come back as a single-element array containing the
 * original string, so textContent is byte-identical for plain copy.
 */
export function renderEmphasis(text: string): ReactNode[] {
  let nodes: ReactNode[] = [text];
  nodes = wrapPass(nodes, BOLD_RE, (c, k) => <strong key={k}>{c}</strong>, "b");
  nodes = wrapPass(nodes, EM_RE, (c, k) => <em key={k}>{c}</em>, "e");
  nodes = applyPass(
    nodes,
    UNDERSCORE_EM_RE,
    (m, key) => [m[1] as string, <em key={key}>{m[2]}</em>],
    "u",
  );
  return nodes;
}
