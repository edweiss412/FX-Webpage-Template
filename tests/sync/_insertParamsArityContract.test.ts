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

  // F1 Task 1.5: postgres.js sends EVERY params-array entry as a wire parameter, and real
  // Postgres rejects an unreferenced one with 42P18 ("could not determine data type of
  // parameter $N"). The UPDATE arm carried two trailing autoPublish entries ($18/$19) that its
  // SQL never references — latent since Amendment 9 because every prior suite faked the tx;
  // the first real-DB execution (Phase D via the shared apply core) hard-failed every
  // existing-show apply. Concrete failure mode pinned: params arity drifting above the SQL's
  // max placeholder on either UPDATE variant.
  test("PostgresPipelineTx.applyShowSnapshot updateParams matches the existing-show UPDATE placeholder count", () => {
    const src = readFileSync(join(root, "lib/sync/runScheduledCronSync.ts"), "utf8");

    // Anchor past the unrelated earlier `update public.shows` statements: the two
    // applyShowSnapshot variants are the first two AFTER the updateParams array. The
    // skipDiagrams variant appears first in the ternary, the full variant second.
    const anchored = src.slice(src.indexOf("const updateParams = ["));
    const firstUpdateAt = anchored.indexOf("update public.shows");
    const skipVariantBlock = extractBlock(
      anchored.slice(firstUpdateAt),
      "update public.shows",
      "returning id",
    );
    const fullVariantBlock = extractBlock(
      anchored.slice(firstUpdateAt + skipVariantBlock.length),
      "update public.shows",
      "returning id",
    );
    // Sanity: the variants are the ones we think they are (diagrams only in the full variant).
    expect(skipVariantBlock).not.toContain("diagrams = ");
    expect(fullVariantBlock).toContain("diagrams = ");
    // Placeholder maxima ignore the interpolated stale predicates ($14/$15 — below the maxima).
    const fullArity = maxPlaceholder(fullVariantBlock);
    const skipArity = maxPlaceholder(skipVariantBlock);

    const updateParamsBlock = extractBlock(src, "const updateParams = [", "];");
    const skipParamsBlock = extractBlock(src, "const skipDiagramsParams = [", "];");

    expect(countArrayLiteralEntries(updateParamsBlock)).toBe(fullArity);
    expect(countArrayLiteralEntries(skipParamsBlock)).toBe(skipArity);
  });
});
