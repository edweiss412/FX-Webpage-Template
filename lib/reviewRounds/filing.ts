import type { ListItem, Paragraph, Parent, RootContent } from "mdast";
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
  /** Disposition field names RENDERED anywhere in the body (spec R9): a strong
   *  `**<name>:**` label outside code/html/delete content. The raw-scan
   *  booleans above are satisfied by fenced/indented/HTML lines the reader
   *  never sees rendered; these are not. Deliberately wider than the marker
   *  rule (any rendered position, not only paragraph-initial): the R9 defect is
   *  non-rendered-ONLY fields, and a field on a soft-broken line is rendered. */
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

function listItemDeclines(item: ListItem): boolean {
  const first = item.children[0];
  return first !== undefined && beginsWithDecline(first);
}

/**
 * Every `**<name>:**` label rendered anywhere in the tree - a strong node whose
 * text ends in a colon, outside code/html/delete content (spec R9). Feeds
 * `astDispositions`/`astExamined`, which the corpus gate uses to reject a
 * NON-grandfathered filing whose only field lines live in non-rendered content.
 */
function renderedFieldLabels(nodes: RootContent[], out: Set<string>): void {
  for (const node of nodes) {
    if (node.type === "code" || node.type === "html" || node.type === "delete") continue;
    if (node.type === "strong") {
      const label = visibleText(node as unknown as RootContent, true).trim();
      if (label.endsWith(":")) out.add(label.slice(0, -1));
    }
    if ("children" in node) {
      renderedFieldLabels((node as Parent).children as RootContent[], out);
    }
  }
}

/** True when any listItem, at any depth, holds a rendered Mechanizable field. */
function hasNestedMechanizable(nodes: RootContent[]): boolean {
  for (const node of nodes) {
    if (node.type === "code" || node.type === "html") continue;
    if (node.type === "listItem") {
      for (const child of node.children) {
        if (fieldName(child) === "Mechanizable") return true;
      }
    }
    if ("children" in node && hasNestedMechanizable((node as Parent).children as RootContent[])) {
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
  const nestedMechanizable = hasNestedMechanizable(top);

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

  let hasDecline = DECLINE.test(remainder);
  if (!hasDecline) {
    for (const node of block.slice(1)) {
      if (beginsWithDecline(node)) {
        hasDecline = true;
        break;
      }
      if (node.type === "list") {
        if (node.children.some((item) => listItemDeclines(item))) {
          hasDecline = true;
          break;
        }
      }
    }
  }

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
