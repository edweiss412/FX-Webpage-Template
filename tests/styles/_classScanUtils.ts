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

export { stripCommentsForFile } from "../_shared/stripComments";

// Shared token splitter for BOTH scanners. Splits on whitespace,
// quotes/backticks, braces, and JSX/TS punctuation — but NEVER on ":"
// (variant separator), "-" (utility body), or "/" (opacity suffix:
// splitting bg-accent/10 would fabricate a bare bg-accent false positive).
export function tokensOf(line: string): string[] {
  return line.split(/[\s"'`{}$()[\],;<>=&|]+/);
}
