// mdast walker for the deferral-ledger graduation guard.
//
// Port of the reviewed prototype at
// docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-lane-probe.mjs
// (spec §2/§3; eleven adversarial rounds, r11 APPROVE). The guard file
// consumes entries + lane verdicts; the walker owns parsing, flattening, id
// extraction, and lane evaluation.
//
// RATIFIED SCOPE (r28, carried through the rewrite): this guard is a drift
// TRIPWIRE over first-party ledger prose, not a markdown renderer. Its
// threat model is the honest in-place closure. Render-equivalent
// OBFUSCATION — link labels, table cells, code blocks, HTML comments,
// BLOCK-level raw-HTML islands — is out of scope by ratification: an author
// reaching for those is hiding, not drifting, and review owns that class.
// The r30 boundary (no regex reimplementation of markdown grammar) is
// resolved BY this walker: grammar questions go to remark, not to regexes.
import type { Heading, InlineCode, Node, Parent, Root, RootContent, Text } from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

/** The archive-bound terminal states — ONE union for every lane (r13/r14). */
export const TERMINAL_WORDS = [
  "CLOSED",
  "WITHDRAWN",
  "RESOLVED",
  "SUPERSEDED",
  "SHIPPED",
  "DONE",
  "OBSOLETE",
  "REFUTED",
] as const;

const TERMINAL = new RegExp(`^(?:${TERMINAL_WORDS.join("|")})$`, "i");

/**
 * Closed-class preposition inventory (r38/r39, ported verbatim): a label's
 * claim may end in a preposition chain (`**Resolved by:**`), while a noun a
 * terminal word modifies (`**Shipped precedent:**`) never appears here.
 */
const PARTICLE_WORDS =
  "aboard|about|above|absent|across|after|against|along|alongside|amid|amidst|among|amongst|around|as|at|atop|barring|before|behind|below|beneath|beside|besides|between|beyond|but|by|circa|concerning|considering|despite|down|during|except|excepting|excluding|failing|following|for|from|in|including|inside|into|like|minus|near|notwithstanding|of|off|on|onto|opposite|out|outside|over|past|pending|per|plus|regarding|respecting|save|since|through|throughout|till|to|toward|towards|under|underneath|until|unto|up|upon|using|versus|via|with|within|without|worth";

const PARTICLES = new Set(PARTICLE_WORDS.split("|"));

const FIELD_LABELS = /^(status|resolution|filed)$/i;

/**
 * Word-position veto (r16 PARTIAL; r26/r29 negations + historical
 * qualifiers): only a modifier DIRECTLY before the word — with at most one
 * intervening non-terminal word — turns the claim into an open state.
 */
const VETO = new RegExp(
  `(?:PARTIAL(?:LY)?|\\bNOT|\\bNEVER|\\bNO\\s+LONGER|\\bPREVIOUSLY|\\bFORMERLY)` +
    `(?:\\s+(?!(?:${TERMINAL_WORDS.join("|")})\\b)[A-Za-z]+)?[\\s:—–-]*$`,
  "i",
);

export type FlatLine = {
  text: string;
  /** One span per `strong` NODE per touched line (r6: interior lines keep provenance). */
  strongSpans: Array<[number, number]>;
  /** `inlineCode`-contributed ranges — label recognizers reject overlap (r2/r3). */
  codeSpans: Array<[number, number]>;
};

export type LedgerEntry = {
  id: string;
  headingLine: FlatLine;
  body: RootContent[];
};

const parser = remark().use(remarkGfm);

export function parseLedger(text: string): Root {
  return parser.parse(text);
}

const isParent = (n: Node): n is Parent => Array.isArray((n as Parent).children);

const BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "list", "listItem"]);

/**
 * Flatten block nodes into lines per the spec §2 disposition table.
 * `"claim"` drops `delete` (a struck claim is a negation, r15); `"id"`
 * keeps it (a struck id still occupies its heading).
 */
export function flattenLines(nodes: readonly RootContent[], mode: "claim" | "id"): FlatLine[] {
  const lines: FlatLine[] = [{ text: "", strongSpans: [], codeSpans: [] }];
  const cur = (): FlatLine => lines[lines.length - 1]!;
  const push = (s: string): void => {
    cur().text += s;
  };
  const newline = (): void => {
    lines.push({ text: "", strongSpans: [], codeSpans: [] });
  };
  const walk = (n: Node): void => {
    switch (n.type) {
      case "text": {
        const value = String((n as Text).value);
        value.split("\n").forEach((part, i) => {
          if (i > 0) newline();
          push(part);
        });
        return;
      }
      case "inlineCode": {
        const value = String((n as InlineCode).value);
        const start = cur().text.length;
        push(value);
        cur().codeSpans.push([start, start + value.length]);
        return;
      }
      case "strong": {
        const startLine = lines.length - 1;
        const start = cur().text.length;
        if (isParent(n)) for (const c of n.children) walk(c);
        // r6: one span per strong NODE per touched line — start line from
        // its offset, interior lines full-width, last line to its end.
        const endLine = lines.length - 1;
        for (let li = startLine; li <= endLine; li++) {
          const a = li === startLine ? start : 0;
          const b = lines[li]!.text.length;
          if (b > a || li === startLine) lines[li]!.strongSpans.push([a, b]);
        }
        return;
      }
      case "emphasis": {
        if (isParent(n)) for (const c of n.children) walk(c);
        return;
      }
      case "delete": {
        if (mode === "id" && isParent(n)) for (const c of n.children) walk(c);
        return;
      }
      // Dropped whole (spec §2 table): code blocks and inline HTML TAG
      // nodes (a block html island is one node; an inline island's prose
      // sits in sibling text nodes and survives), links/images with their
      // labels, tables, footnotes, reference definitions.
      case "code":
      case "html":
      case "link":
      case "linkReference":
      case "image":
      case "imageReference":
      case "table":
      case "footnoteDefinition":
      case "footnoteReference":
      case "definition":
      case "thematicBreak":
      case "yaml":
        return;
      case "break":
        newline();
        return;
      default: {
        const block = BLOCK_TYPES.has(n.type);
        if (block && cur().text !== "") newline();
        if (isParent(n)) for (const c of n.children) walk(c);
        if (block) newline();
      }
    }
  };
  for (const n of nodes) walk(n);
  return lines.filter((l) => l.text.trim() !== "");
}

type Provenance = "plain" | "delete" | "fmt" | "code";

/**
 * Id extraction with SOURCE parity (r8–r10): the heading's inline children
 * flatten with a per-character provenance map. The optional bracket prefix
 * is consumed formatting-blind (the legacy raw matcher's `[^\]]+` accepts
 * `[**P2**]`), while the id token must lie WHOLLY in plain-text or delete
 * provenance — `### **NOTES**` and `### [P2] **BL-X**` mint nothing.
 */
function headingId(heading: Heading): string | null {
  const flatChars: string[] = [];
  const prov: Provenance[] = [];
  const pwalk = (node: Node, kind: Provenance): void => {
    if (node.type === "text") {
      const value = String((node as Text).value);
      // UTF-16 code UNITS, not code points: the provenance array indexes
      // must align with regex match offsets on the joined string (whole-diff
      // r1 — an astral character in a bracket prefix skewed every later
      // index, minting formatted ids and dropping plain ones).
      for (let i = 0; i < value.length; i++) {
        const ch = value[i]!;
        if (ch === "\n") return;
        flatChars.push(ch);
        prov.push(kind);
      }
      return;
    }
    if (node.type === "inlineCode") {
      const value = String((node as InlineCode).value);
      for (let i = 0; i < value.length; i++) {
        flatChars.push(value[i]!);
        prov.push("code");
      }
      return;
    }
    // Provenance propagation (whole-diff r4): DELETE is transparent only
    // over plain text — the moment any OTHER formatting wrapper appears on
    // the path, provenance is fmt and STAYS fmt (legacy raw parity:
    // `~~**BL-X**~~` starts with `*` after the tildes and never minted).
    // An html TAG node contributes no prose but occupies raw position —
    // emit one zero-width fmt sentinel so `~~<b>ID</b>~~` cannot read as
    // tag-adjacent plain text while `[<b>P2</b>] BL-X` still mints (the
    // sentinel rides inside the bracket prefix, which is formatting-blind).
    if (node.type === "html") {
      flatChars.push("\u0000");
      prov.push("fmt");
      return;
    }
    const next: Provenance =
      node.type === "delete" ? (kind === "plain" ? "delete" : kind) : kind === "code" ? kind : "fmt";
    if (isParent(node)) for (const c of node.children) pwalk(c, next);
  };
  for (const c of heading.children) pwalk(c, "plain");
  const flat = flatChars.join("");
  const prefix = /^\s*(?:\[[^\]]+\]\s*)?/.exec(flat);
  const idStart = prefix?.[0].length ?? 0;
  const m = /^([A-Za-z0-9][A-Za-z0-9/-]*)/.exec(flat.slice(idStart));
  if (!m) return null;
  const token = m[1]!;
  if (/[a-z]/.test(token)) return null;
  for (let ci = idStart; ci < idStart + token.length; ci++) {
    const p = prov[ci];
    if (p !== "plain" && p !== "delete") return null;
  }
  return token;
}

export type ExtractOpts = {
  /** `"BL-"` for the backlog pair; `null` for DEFERRED (any SHOUTY id). */
  requirePrefix: string | null;
  /** Accepted heading depths — `[2, 3]` backlog, `[3]` DEFERRED. */
  levels: readonly number[];
};

/**
 * Entries partition id-heading to id-heading at any accepted depth (r3
 * repair — exact regex parity: non-id prose headings never close an entry;
 * the nine live nested H3 entries own their spans). Top-level headings
 * only: a container-nested heading neither opens an entry nor mints an id.
 */
export function extractEntries(text: string, opts: ExtractOpts): LedgerEntry[] {
  const tops = parseLedger(text).children;
  const found: Array<{ id: string; index: number; heading: Heading }> = [];
  tops.forEach((n, index) => {
    if (n.type !== "heading" || !opts.levels.includes(n.depth)) return;
    const id = headingId(n);
    if (id === null) return;
    if (opts.requirePrefix !== null && !id.startsWith(opts.requirePrefix)) return;
    found.push({ id, index, heading: n });
  });
  return found.map((f, k) => ({
    id: f.id,
    headingLine: flattenLines([f.heading], "claim")[0] ?? {
      text: "",
      strongSpans: [],
      codeSpans: [],
    },
    body: tops.slice(f.index + 1, k + 1 < found.length ? found[k + 1]!.index : tops.length),
  }));
}

/** All ids in one ledger — the graduation/no-overlap invariants' view. */
export function ledgerIds(text: string, opts: ExtractOpts): Set<string> {
  return new Set(extractEntries(text, opts).map((e) => e.id));
}

// ---------------------------------------------------------------------------
// Lane evaluation (spec §3)
// ---------------------------------------------------------------------------

type Token = { t: string; i: number };

/** Maximal `[A-Za-z0-9-]` runs of the LINE (r5 — never re-tokenized inside a span). */
const lineTokens = (text: string): Token[] =>
  [...text.matchAll(/[A-Za-z0-9-]+/g)].map((m) => ({ t: m[0], i: m.index }));

/** Line-tokens FULLY CONTAINED in [s, e) — a boundary-straddling run belongs to the line. */
const spanTokens = (line: FlatLine, s: number, e: number): Token[] =>
  lineTokens(line.text).filter((x) => x.i >= s && x.i + x.t.length <= e);

const tokenAt = (text: string, i: number): string => /^[A-Za-z0-9-]*/.exec(text.slice(i))![0];

const vetoed = (text: string, at: number): boolean => VETO.test(text.slice(0, at));

const overlaps = (spans: ReadonlyArray<[number, number]>, s: number, e: number): boolean =>
  spans.some(([a, b]) => s < b && e > a);

type LabelSpan = { s: number; e: number };

/**
 * A strong span is a LABEL when its text ends with a colon or the text
 * after it opens with a colon/dash (r35/r36) — and its characters overlap
 * no code span (r2/r3 label provenance: `**Sta\`tus\`:**` is no label).
 */
function labelSpans(line: FlatLine): LabelSpan[] {
  const out: LabelSpan[] = [];
  for (const [s, e] of line.strongSpans) {
    if (overlaps(line.codeSpans, s, e)) continue;
    const inner = line.text.slice(s, e);
    const after = line.text.slice(e);
    // External separators: colon/em-en dash may sit flush; an ASCII dash
    // must be whitespace-delimited on BOTH sides (whole-diff r3 —
    // `**Resolved** -by` is a compound, not a labeled claim).
    if (/:\s*$/.test(inner) || /^(?:\s*:|\s*[—–]|\s+-(?=\s))/.test(after)) out.push({ s, e });
  }
  return out;
}

/**
 * Label rule under the global token rule (r3/r5): strip trailing
 * whole-token particles; the final remaining fully-contained line-token
 * must EQUAL a terminal word.
 */
function labelTerminal(line: FlatLine, label: LabelSpan): string | null {
  const tk = spanTokens(line, label.s, label.e);
  while (tk.length > 0 && PARTICLES.has(tk[tk.length - 1]!.t.toLowerCase())) tk.pop();
  const last = tk[tk.length - 1];
  if (last !== undefined && TERMINAL.test(last.t) && !vetoed(line.text, last.i)) return last.t;
  return null;
}

// Separator after a field label: colon, em/en dash, or a whitespace-
// delimited ASCII dash — never a bare hyphen, which would re-admit the
// token-splitting class the maximal-token rule excludes (whole-diff r2:
// `Status-CLOSED` and `**Status:**-CLOSED` are not field claims).
const SEP_AFTER_LABEL = /^(?:\s*:|\s*[—–]|\s+-(?=\s))?\s*✅?\s*/;

/**
 * Every field-lane verdict for one flattened line. Returns `lane:WORD`
 * hits. Input domains (spec §3): the line-leading value lane, the bold
 * NON-label scan, and the bare-field lane run only on lines line-led by
 * Status/Resolution/Filed; the two label-structure-gated lanes run on
 * every line.
 */
export function lineVerdicts(line: FlatLine): string[] {
  const hits: string[] = [];
  const labels = labelSpans(line);

  // Terminal-label lane (line-wide): `**Resolved by:** PR #621` closes;
  // `**Shipped precedent:**` does not.
  for (const label of labels) {
    const word = labelTerminal(line, label);
    if (word !== null) hits.push(`terminal-label:${word}`);
  }

  // Mid-line field-label lane (line-wide; r2 F1 — fixes the reordered
  // multi-field row): `**Class:** x · **Status:** CLOSED` closes.
  for (const label of labels) {
    const labelTk = spanTokens(line, label.s, label.e);
    if (labelTk.length !== 1 || !FIELD_LABELS.test(labelTk[0]!.t)) continue;
    const sep = SEP_AFTER_LABEL.exec(line.text.slice(label.e))!;
    const at = label.e + sep[0].length;
    const tok = tokenAt(line.text, at);
    if (TERMINAL.test(tok) && !vetoed(line.text, at)) hits.push(`field-label:${tok}`);
  }

  // The label itself must be a MAXIMAL token — \b would match before a
  // hyphen and read `Status-CLOSED` as a lead (whole-diff r2).
  const lead = /^\s*(status|resolution|filed)(?![A-Za-z0-9-])/i.exec(line.text);
  const leadStart = lead === null ? 0 : lead[0].length - lead[1]!.length;
  const leadField =
    lead !== null && !overlaps(line.codeSpans, leadStart, leadStart + lead[1]!.length);
  if (!leadField || lead === null) return hits;

  // Line-leading value lane.
  {
    const sep = SEP_AFTER_LABEL.exec(line.text.slice(lead[0].length))!;
    const at = lead[0].length + sep[0].length;
    const tok = tokenAt(line.text, at);
    if (TERMINAL.test(tok) && !vetoed(line.text, at)) hits.push(`leading:${tok}`);
  }

  // Per-occurrence bold NON-label scan (r17 per-occurrence semantics).
  for (const [s, e] of line.strongSpans) {
    if (labels.some((label) => label.s === s)) continue;
    for (const { t, i } of spanTokens(line, s, e)) {
      if (TERMINAL.test(t) && !vetoed(line.text, i)) hits.push(`bold-nonlabel:${t}`);
    }
  }

  // Bare-field lane (r39/r40): terminal token whose following tokens are
  // all particles until a colon / em-en dash / whitespace-delimited dash.
  const chainRe = new RegExp(`^(?:\\s+(?:${PARTICLE_WORDS}))*`, "i");
  for (const { t, i } of lineTokens(line.text)) {
    if (!TERMINAL.test(t)) continue;
    const rest = line.text.slice(i + t.length);
    const chain = chainRe.exec(rest)![0];
    const afterChain = rest.slice(chain.length);
    if (/^\s*:|^\s*[—–](?=\s|$)|^\s+-(?=\s|$)/.test(afterChain) && !vetoed(line.text, i)) {
      hits.push(`bare-field:${t}`);
    }
  }
  return hits;
}

/**
 * Heading lane (r30 anchored ✅; r3/r4 — anchors scan strictly AFTER the id
 * token, located by re-running the extraction shape on the claim flatten so
 * a duplicated id or id-substring inside the bracket prefix never anchors;
 * a delete-wrapped id is absent from the claim flatten and the scan falls
 * back to offset 0, conservative-loud).
 */
export function headingVerdicts(headingLine: FlatLine, id: string): string[] {
  const text = headingLine.text;
  const em = /^\s*(?:\[[^\]]+\]\s*)?([A-Za-z0-9][A-Za-z0-9/-]*)/.exec(text);
  const from = em !== null && em[1] === id ? em.index + em[0].length : 0;
  const anchor = /(?:[—–]|(?<=\s)-(?=\s)|✅)\s*✅?\s*/g;
  const hits: string[] = [];
  for (let m = anchor.exec(text); m !== null; m = anchor.exec(text)) {
    if (m.index < from) continue;
    const at = m.index + m[0].length;
    const tok = tokenAt(text, at);
    if (TERMINAL.test(tok) && !vetoed(text, at)) hits.push(`heading:${tok}`);
  }
  return hits;
}

/**
 * Opening lane (whole-diff r3; r6 casing split): the body's first
 * non-empty flattened line — bold opening claims match any case, bare ones
 * ALL-CAPS only, so narrating prose cannot false-positive.
 */
export function openingVerdicts(line: FlatLine | undefined): string[] {
  if (line === undefined) return [];
  const first = lineTokens(line.text)[0];
  if (first === undefined || !TERMINAL.test(first.t)) return [];
  if (line.text.slice(0, first.i).trim() !== "") return [];
  const inStrong = overlaps(line.strongSpans, first.i, first.i + first.t.length);
  const allCaps = first.t === first.t.toUpperCase();
  if ((inStrong || allCaps) && !vetoed(line.text, first.i)) return [`opening:${first.t}`];
  return [];
}

/**
 * ONE evaluator per entry (r40 architecture kept): the live walk and every
 * plant share it, so removing a lane wiring breaks an executable plant.
 */
export function entryTerminal(entry: LedgerEntry): string[] {
  const hits: string[] = [];
  hits.push(...headingVerdicts(entry.headingLine, entry.id));
  const bodyLines = flattenLines(entry.body, "claim");
  // Opening line = first body line carrying at least one TOKEN (r26
  // semantics: a marker-only line — a bare `- [ ]` flattens to literal
  // `[ ]` — is not content and must not consume the opening slot).
  hits.push(...openingVerdicts(bodyLines.find((l) => /[A-Za-z0-9-]/.test(l.text))));
  for (const line of bodyLines) hits.push(...lineVerdicts(line));
  return hits;
}
