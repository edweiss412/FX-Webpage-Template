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
 * _em_) and the same word-boundary contract for `_em_` (internal
 * underscores in tokens like (SW-POST_SHOW) are left intact). One
 * deliberate divergence: content classes here are `[^*]+` (stripEmphasis
 * uses lazy `.+?`), so the `***` day-restriction token in
 * CREW_DAY_RESTRICTED copy is never treated as emphasis here even though
 * stripEmphasis would mangle it.
 *
 * Consumers: every surface that renders catalog copy as JSX — pinned by
 * tests/messages/_metaEmphasisRenderContract.test.ts.
 */
import type { ReactNode } from "react";

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
