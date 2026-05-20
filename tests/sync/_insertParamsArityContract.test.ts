import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function extractBlock(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`startMarker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error(`endMarker not found after startMarker: ${endMarker}`);
  return src.slice(start, end + endMarker.length);
}

function maxPlaceholder(sqlBlock: string): number {
  const matches = sqlBlock.match(/\$(\d+)/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = Number.parseInt(m.slice(1), 10);
    if (n > max) max = n;
  }
  return max;
}

function countArrayLiteralEntries(arrayBlock: string): number {
  const inner = arrayBlock.replace(/^[^\[]*\[/, "").replace(/\][^\]]*$/, "");
  let depth = 0;
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      current += c;
    } else if (c === ")" || c === "]" || c === "}") {
      depth--;
      current += c;
    } else if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts.filter((p) => p.trim().length > 0).length;
}

describe("SQL insert param arity contract", () => {
  test("PostgresPipelineTx.applyShowSnapshot insertParamsForSlug matches the first-seen INSERT placeholder count", () => {
    const src = readFileSync(
      join(root, "lib/sync/runScheduledCronSync.ts"),
      "utf8",
    );

    const insertSqlBlock = extractBlock(
      src,
      "insert into public.shows (",
      "returning id",
    );
    const placeholderArity = maxPlaceholder(insertSqlBlock);

    const paramsBlock = extractBlock(
      src,
      "const insertParamsForSlug = (slug: string) => [",
      "];",
    );
    const paramsArity = countArrayLiteralEntries(paramsBlock);

    expect({ paramsArity, placeholderArity }).toEqual({
      paramsArity: placeholderArity,
      placeholderArity,
    });
  });
});
