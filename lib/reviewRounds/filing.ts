import type { Paragraph, Parent, RootContent } from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

/** The Mechanizable block analysis, derived from the section body's markdown
 *  AST (enforcement-pair spec §3.1). Null when no canonical marker exists. */
export type MechanizableAnalysis = {
  /** the marker paragraph's remainder begins `none` (word-bounded) */
  isNone: boolean;
  /** a structural decline declaration exists (marker remainder or block item) */
  hasDecline: boolean;
  /** BL-/DEF- ids cited inside the Mechanizable block (text + inline code only) */
  citedIds: string[];
  /** how many canonical Mechanizable markers the section holds */
  markerCount: number;
};

export type FilingSection = {
  stage: string;
  /** The `<n>` in `## <stage> — <n> rounds`, or null when absent/unparseable. */
  declaredRounds: number | null;
  hasExamined: boolean;
  hasDisposition: boolean;
  citedIds: string[];
  /** 1-indexed line of the heading, for a message that names its location. */
  line: number;
  mechanizable: MechanizableAnalysis | null;
  /** A rendered `Mechanizable:` field nested under a listItem (spec R12): it
   *  renders for the reader while marker discovery sees nothing, so the corpus
   *  gate rejects it loudly for non-grandfathered filings. */
  nestedMechanizable: boolean;
  /** Disposition field names carried by LINE-OPENING rendered strong labels
   *  (spec R9; diff R2 finding 2): paragraph-initial, after a soft line break,
   *  or after a hard break - never mid-sentence, never in code/html/delete
   *  content. The raw-scan booleans above are satisfied by fenced/indented/
   *  HTML lines the reader never sees rendered; these witness a real rendered
   *  field line, so the corpus gate's raw+rendered conjunction cannot be
   *  assembled from two unrelated occurrences. */
  astDispositions: string[];
  astExamined: boolean;
};

// `—` (em dash) is the documented separator; `-` and `--` are tolerated so a
// filing is not rejected over a keyboard, which would be prose-quality
// gatekeeping (spec §7.2).
const HEADING = /^##\s+(\S+)\s*(?:—|--|-)\s*(\d+)\s+rounds?\s*$/;
const HEADING_LOOSE = /^##\s+(\S+)\b/;
const DISPOSITIONS = ["Mechanizable", "Judgment", "Infra"] as const;
/**
 * Narrow on purpose (plan R2). DEFERRED entries carry bare SHOUTY ids, and a
 * recognizer wide enough to catch them would classify ordinary prose as a
 * citation. An unrecognized token is not a citation: it is neither checked nor
 * rejected - a conservative under-check, recorded as a documented limit.
 */
const CITED_ID = /\b(?:BL|DEF)-[A-Z0-9][A-Z0-9-]*\b/g;

// One shared processor: remarkGfm registers its micromark syntax extensions at
// freeze time, so `.parse()` is synchronous and GFM-aware (strikethrough
// becomes a `delete` node rather than literal tildes).
const parser = remark().use(remarkGfm);

/**
 * Visible text of a phrasing tree. `code`, `html`, and `delete` (struck text
 * is a RETRACTION, spec R11) never contribute; `inlineCode` contributes only
 * when `withInlineCode` is set — id citation keeps backticked ids (plan R1
 * finding 6), while `none`/`declined:` decisions treat backticks as MENTION.
 */
function visibleText(node: RootContent | Paragraph, withInlineCode: boolean): string {
  if (node.type === "code" || node.type === "html") return "";
  if (node.type === "delete") return "";
  if (node.type === "inlineCode") return withInlineCode ? node.value : "";
  if (node.type === "text") return node.value;
  if ("children" in node) {
    return (node as Parent).children.map((c) => visibleText(c, withInlineCode)).join("");
  }
  return "";
}

/** The field name of a paragraph opening with `**<name>:**`, or null. */
function fieldName(node: RootContent): string | null {
  if (node.type !== "paragraph") return null;
  const first = node.children[0];
  if (first === undefined || first.type !== "strong") return null;
  const label = visibleText(first as unknown as RootContent, true).trim();
  if (!label.endsWith(":")) return null;
  return label.slice(0, -1);
}

/** Paragraph text after the opening strong marker, decisions-mode (no ticks). */
function remainderText(p: Paragraph): string {
  return p.children
    .slice(1)
    .map((c) => visibleText(c, false))
    .join("");
}

const DECLINE = /^declined:\s*\S/i;

/** First visible text of a block paragraph or list item begins `declined:`. */
function beginsWithDecline(node: RootContent): boolean {
  if (node.type === "paragraph") return DECLINE.test(visibleText(node, false).trim());
  return false;
}

/**
 * Every LINE-OPENING `**<name>:**` label in rendered paragraphs (spec R9; diff
 * R2 finding 2). A strong label counts only when it OPENS a line - it is its
 * paragraph's first child, or the previous sibling ends with a newline (the
 * compact soft-broken form), or follows a hard break. A strong run
 * mid-sentence is a MENTION and never a field, so a fenced example plus a
 * prose mention can no longer assemble a duty from two unrelated occurrences:
 * this set alone witnesses a real rendered field line. Fenced, indented, HTML,
 * and struck-through content stays invisible.
 */
function renderedFieldLabels(nodes: RootContent[], out: Set<string>): void {
  for (const node of nodes) {
    if (node.type === "code" || node.type === "html" || node.type === "delete") continue;
    if (node.type === "paragraph") {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        if (child.type !== "strong") continue;
        const prev = i === 0 ? null : children[i - 1]!;
        const opensLine =
          prev === null ||
          prev.type === "break" ||
          visibleText(prev as RootContent, true).endsWith("\n");
        if (!opensLine) continue;
        const label = visibleText(child as unknown as RootContent, true).trim();
        if (label.endsWith(":")) out.add(label.slice(0, -1));
      }
    }
    if ("children" in node) {
      renderedFieldLabels((node as Parent).children as RootContent[], out);
    }
  }
}

/**
 * True when a rendered Mechanizable FIELD PARAGRAPH exists anywhere BELOW the
 * top level - under a list item, inside a blockquote (bare or nested), in a
 * doubly nested list (diff R1 finding 3: the first version checked only direct
 * children of list items, so `- > **Mechanizable:** x` rendered for the reader
 * while marker discovery saw nothing). Callers pass each top-level node's
 * CHILDREN, so a top-level marker never matches itself.
 */
function hasNestedMechanizable(nodes: RootContent[]): boolean {
  for (const node of nodes) {
    if (node.type === "code" || node.type === "html" || node.type === "delete") continue;
    if (fieldName(node) === "Mechanizable") return true;
    if ("children" in node && hasNestedMechanizable((node as Parent).children as RootContent[])) {
      return true;
    }
  }
  return false;
}

/**
 * True when any descendant paragraph (outside code/html/delete) declares a
 * decline. Paragraph-scoped begins-with, so a mid-sentence mention still fails
 * the test wherever it nests (diff R1 finding 4: a conforming decline in a
 * sub-list item or a blockquote paragraph was rejected over its depth).
 */
function declinesAnywhere(nodes: RootContent[]): boolean {
  for (const node of nodes) {
    if (node.type === "code" || node.type === "html" || node.type === "delete") continue;
    if (beginsWithDecline(node)) return true;
    if ("children" in node && declinesAnywhere((node as Parent).children as RootContent[])) {
      return true;
    }
  }
  return false;
}

type AstAnalysis = {
  mechanizable: MechanizableAnalysis | null;
  nestedMechanizable: boolean;
  astDispositions: string[];
  astExamined: boolean;
};

function analyzeBody(text: string): AstAnalysis {
  const root = parser.parse(text);
  const top = root.children;

  const fieldNames = top.map((n) => fieldName(n));
  const labels = new Set<string>();
  renderedFieldLabels(top, labels);
  const astDispositions = DISPOSITIONS.filter((d) => labels.has(d));
  const astExamined = labels.has("Examined");
  // Each top node's CHILDREN, so a canonical top-level marker is not its own
  // nesting violation while anything rendered below the top level is.
  const nestedMechanizable = top.some(
    (n) =>
      n.type !== "code" &&
      n.type !== "html" &&
      "children" in n &&
      hasNestedMechanizable((n as Parent).children as RootContent[]),
  );

  const markerIndexes = top.flatMap((n, i) => (fieldNames[i] === "Mechanizable" ? [i] : []));
  if (markerIndexes.length === 0) {
    return { mechanizable: null, nestedMechanizable, astDispositions, astExamined };
  }

  // The FIRST marker's block; the duplicate case is blocked by the corpus gate
  // before parity is consulted, so which block this models cannot matter there.
  const start = markerIndexes[0]!;
  let end = top.length;
  for (let i = start + 1; i < top.length; i++) {
    const node = top[i]!;
    // Any field paragraph (spec R5 finding 2: derived, never an enumerated
    // name list) or any heading (spec R9 finding 2) closes the block.
    if (fieldName(node) !== null || node.type === "heading") {
      end = i;
      break;
    }
  }
  const block = top.slice(start, end);
  const marker = top[start] as Paragraph;
  const remainder = remainderText(marker).trim();

  const isNone = /^none\b/i.test(remainder);

  const hasDecline = DECLINE.test(remainder) || declinesAnywhere(block.slice(1));

  const blockText = block.map((n) => visibleText(n, true)).join("\n");
  const citedIds = [...new Set(blockText.match(CITED_ID) ?? [])];

  return {
    mechanizable: { isNone, hasDecline, citedIds, markerCount: markerIndexes.length },
    nestedMechanizable,
    astDispositions,
    astExamined,
  };
}

export function parseFiling(md: string): FilingSection[] {
  const lines = md.split("\n");
  const sections: FilingSection[] = [];
  let current: FilingSection | null = null;
  let body: string[] = [];

  const close = (): void => {
    if (!current) return;
    const text = body.join("\n");
    current.hasExamined = /^\s*\*\*Examined:\*\*/m.test(text);
    current.hasDisposition = DISPOSITIONS.some((d) =>
      new RegExp(`^\\s*\\*\\*${d}:\\*\\*`, "m").test(text),
    );
    current.citedIds = [...new Set(text.match(CITED_ID) ?? [])];
    const ast = analyzeBody(text);
    current.mechanizable = ast.mechanizable;
    current.nestedMechanizable = ast.nestedMechanizable;
    current.astDispositions = ast.astDispositions;
    current.astExamined = ast.astExamined;
    sections.push(current);
    current = null;
    body = [];
  };

  const emptySection = (
    stage: string,
    declaredRounds: number | null,
    i: number,
  ): FilingSection => ({
    stage,
    declaredRounds,
    hasExamined: false,
    hasDisposition: false,
    citedIds: [],
    line: i + 1,
    mechanizable: null,
    nestedMechanizable: false,
    astDispositions: [],
    astExamined: false,
  });

  lines.forEach((line, i) => {
    const strict = HEADING.exec(line);
    const loose = HEADING_LOOSE.exec(line);
    if (strict) {
      close();
      current = emptySection(strict[1] as string, Number(strict[2]), i);
    } else if (loose) {
      close();
      current = emptySection(loose[1] as string, null, i);
    } else if (current) {
      body.push(line);
    }
  });
  close();
  return sections;
}
