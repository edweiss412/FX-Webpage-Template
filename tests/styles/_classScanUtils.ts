// tests/styles/_classScanUtils.ts
// Shared filesystem walk + comment-strip + class tokenizer for the two
// accent scanners (_metaRawAccentText, _metaBgAccentInventory).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    // R20: .mdx was excluded, so 13 shipped help pages were never scanned — a dead
    // class in app/help/**/page.mdx reached production with every scanner green.
    return /\.(tsx|ts|mdx)$/.test(e) ? [p] : [];
  });
}

/* Line-safe comment stripping. The previous whole-file form let ANY "/*" open a block
 * span, including one inside a string or a path — `* Wraps every route under /admin/*`
 * in app/admin/layout.tsx opened a span that swallowed all six of that file's live
 * className sites, so a scanner using it reported nothing there (whole-diff R19).
 *
 * Fixed by refusing to open a multi-line block unless the opener STARTS its line, which
 * is what a real block comment does and what a path fragment never does. Same-line
 * `/* … *\/` pairs are still removed, and a URL's "//" is preserved. */
/** Remove a `//` line comment, respecting quotes so a URL inside a string survives. */
function stripLineComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

export function stripComments(src: string): string {
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
    /* Line comments first, so they cannot open a block. A "//" only starts a comment
     * when it is not part of a URL: `https://x` was already handled by requiring the
     * preceding char not be ":", but a PROTOCOL-RELATIVE url — href="//cdn/x" — has no
     * colon and was being read as a comment, truncating the rest of the line and hiding
     * any class after it (R20 F1). Require that the "//" not sit inside a quoted string
     * opened earlier on the line. */
    l = stripLineComment(l);
    l = l.replace(/\/\*.*?\*\//g, ""); // pairs that open and close on this line
    const open = l.indexOf("/*");
    // A real opener starts its line, or starts it after a JSX `{`. Anything else — a
    // path like /admin/*, a glob in a string — is not opening a comment.
    if (open !== -1 && /^\{?$/.test(l.slice(0, open).trim())) {
      inBlock = true;
      l = l.slice(0, open);
    }
    out.push(l);
  }
  return out.join("\n");
}

// Shared token splitter for BOTH scanners. Splits on whitespace,
// quotes/backticks, braces, and JSX/TS punctuation — but NEVER on ":"
// (variant separator), "-" (utility body), or "/" (opacity suffix:
// splitting bg-accent/10 would fabricate a bare bg-accent false positive).
export function tokensOf(line: string): string[] {
  return line.split(/[\s"'`{}$()[\],;<>=&|]+/);
}
