// tests/_shared/stripComments.ts
// THE comment-stripping module for structural guards. Single source (spec
// docs/superpowers/specs/2026-07-26-stripcomments-shared-design.md); the meta-test
// tests/cross-cutting/_metaStripCommentsSingleSource.test.ts forbids local copies.
import ts from "typescript";

export const LINE_TERMINATORS = /[\n\r\u2028\u2029]/;

/* Sound by construction: the PARSE reports where literals are (string, template parts,
 * regex, JSX text) and the lexical pass only treats a `/` as a comment start outside
 * them. `kind` is REQUIRED: parsing plain .ts as TSX reads `<T>(x: T) => x` as JSX and
 * misses every comment after it (spec §1). */
export function commentRanges(
  src: string,
  kind: ts.ScriptKind,
  sourceFile?: ts.SourceFile,
): [number, number][] {
  const sf = sourceFile ?? ts.createSourceFile("__cmt", src, ts.ScriptTarget.Latest, true, kind);
  const protectedRanges: [number, number][] = [];
  const collect = (n: ts.Node): void => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isRegularExpressionLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n)
    ) {
      protectedRanges.push([n.getStart(sf), n.getEnd()]);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const inProtected = (i: number): boolean => protectedRanges.some(([a, b]) => i >= a && i < b);

  // A shebang is not a comment: blanking its bytes destroys real content, and a URL
  // inside it contains `//`.
  let from = 0;
  if (src.startsWith("#!")) {
    const nl = src.search(LINE_TERMINATORS);
    from = nl === -1 ? src.length : nl;
  }

  // A `//` comment ends at ANY JavaScript line terminator, not only LF.
  const isLineTerminator = (ch: string | undefined): boolean => LINE_TERMINATORS.test(ch ?? "");

  const out: [number, number][] = [];
  for (let i = from; i < src.length - 1; i += 1) {
    if (src[i] !== "/" || inProtected(i)) continue;
    if (src[i + 1] === "/") {
      let j = i + 2;
      while (j < src.length && !isLineTerminator(src[j])) j += 1;
      out.push([i, j]);
      i = j;
    } else if (src[i + 1] === "*") {
      let j = i + 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
      const endEx = Math.min(j + 2, src.length);
      out.push([i, endEx]);
      i = endEx - 1;
    }
  }
  return out;
}

/** Blank every comment to spaces, preserving length, offsets and line numbers. */
export function stripCommentsSafely(src: string, kind: ts.ScriptKind): string {
  const out = src.split("");
  for (const [a, b] of commentRanges(src, kind)) {
    for (let i = a; i < b; i += 1) {
      const ch = out[i];
      if (ch !== "\n" && ch !== "\r" && ch !== "\u2028" && ch !== "\u2029") out[i] = " ";
    }
  }
  return out.join("");
}

/* MDX is not JavaScript: a bare `//` there is a URL or prose far more often than a
 * comment; a missed comment risks only a NOISY false positive while a truncated line
 * hides real content silently. Line comments stay; block comments (JSX) are removed
 * line-based: a multi-line opener must start its line or follow a JSX `{`
 * (lineage: tests/styles/_classScanUtils.ts R19-R22). */
export function stripMdxComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    let l = line;
    if (inBlock) {
      const end = l.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      l = l.slice(end + 2);
      inBlock = false;
    }
    l = l.replace(/\{?\/\*.*?\*\/\}?/g, "");
    const open = l.indexOf("/*");
    if (open !== -1 && /^\{?$/.test(l.slice(0, open).trim())) {
      inBlock = true;
      l = l.slice(0, open);
    }
    out.push(l);
  }
  return out.join("\n");
}

/* SQL: `--` to EOL and NESTABLE block comments, outside single-quoted strings.
 * Dollar-quote DELIMITERS (tagged or untagged) are transparent — span contents are SQL
 * code per spec §1.1; single-quoted strings inside them stay protected. Blanks with
 * spaces preserving offsets/newlines (undo-change-lock-order's `.search()` ordering
 * depends on it). */
export function stripSqlComments(src: string): string {
  const out = src.split("");
  const blank = (i: number): void => {
    const ch = out[i];
    if (ch !== "\n" && ch !== "\r") out[i] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "'") {
      i += 1;
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") i += 2;
        else if (src[i] === "'") {
          i += 1;
          break;
        } else i += 1;
      }
      continue;
    }
    if (c === "-" && next === "-") {
      while (i < src.length && src[i] !== "\n") {
        blank(i);
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      let depth = 0;
      do {
        if (src[i] === "/" && src[i + 1] === "*") {
          depth += 1;
          blank(i);
          blank(i + 1);
          i += 2;
        } else if (src[i] === "*" && src[i + 1] === "/") {
          depth -= 1;
          blank(i);
          blank(i + 1);
          i += 2;
        } else {
          blank(i);
          i += 1;
        }
      } while (i < src.length && depth > 0);
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** CSS: block comments outside single/double-quoted strings; CSS has no line comments. */
export function stripCssComments(src: string): string {
  const out = src.split("");
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i += 2;
      else {
        if (c === quote) quote = null;
        i += 1;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (out[i] !== "\n") out[i] = " ";
        i += 1;
      }
      if (i < src.length) {
        out[i] = " ";
        if (i + 1 < src.length) out[i + 1] = " ";
        i += 2;
      }
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** Primary caller API: route by extension; throw on unknown so a guard passing an
 *  unexpected file type decides explicitly (spec §3). */
export function stripCommentsForFile(src: string, filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".tsx":
      return stripCommentsSafely(src, ts.ScriptKind.TSX);
    case ".jsx":
      return stripCommentsSafely(src, ts.ScriptKind.JSX);
    case ".ts":
    case ".mts":
    case ".cts":
      return stripCommentsSafely(src, ts.ScriptKind.TS);
    case ".js":
    case ".mjs":
    case ".cjs":
      return stripCommentsSafely(src, ts.ScriptKind.JS);
    case ".mdx":
      return stripMdxComments(src);
    case ".sql":
      return stripSqlComments(src);
    case ".css":
      return stripCssComments(src);
    default:
      throw new Error(`stripCommentsForFile: unknown extension "${ext}" for ${filePath}`);
  }
}
