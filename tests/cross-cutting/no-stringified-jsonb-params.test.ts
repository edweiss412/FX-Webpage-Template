import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Structural guard for the postgres.js jsonb double-encode class
// (documented at lib/db/coerceJsonbObject.ts and lib/sync/applyStaged.ts):
// postgres.js serializes a `${param}::jsonb` value itself, so passing
// `JSON.stringify(obj)` stores a jsonb STRING SCALAR, not an object.
// Surfaced by the 2026-06-11 bug audit on lib/notify/deliver.ts, where
// every email_deliveries.context row was written double-encoded.
//
// Two shapes are banned:
//   (a) direct:   ${JSON.stringify(x)}::jsonb
//   (b) indirect: const c = JSON.stringify(x); ... ${c}::jsonb
// The correct pattern passes the raw object: ${x}::jsonb.

const ROOTS = ["lib", "app", "scripts"];
const EXTENSIONS = [".ts", ".tsx"];

type Violation = { path: string; line: number; text: string };

export function findStringifiedJsonbParams(source: string, path: string): Violation[] {
  const violations: Violation[] = [];
  const lines = source.split("\n");

  // Shape (a): ${JSON.stringify(...)}::jsonb on a single line.
  const direct = /\$\{\s*JSON\.stringify\([^}]*\)\s*\}\s*::jsonb/;
  lines.forEach((text, index) => {
    if (direct.test(text)) violations.push({ path, line: index + 1, text: text.trim() });
  });

  // Shape (b): a binding assigned from JSON.stringify(...) later interpolated
  // with an ::jsonb cast anywhere in the same file.
  const bindingRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*JSON\.stringify\(/g;
  for (const match of source.matchAll(bindingRe)) {
    const name = match[1]!;
    const interpolated = new RegExp(`\\$\\{\\s*${name}\\s*\\}\\s*::jsonb`);
    lines.forEach((text, index) => {
      if (interpolated.test(text)) violations.push({ path, line: index + 1, text: text.trim() });
    });
  }

  return violations;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, out);
    } else if (EXTENSIONS.some((ext) => full.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("no JSON.stringify into ::jsonb params (postgres.js double-encode guard)", () => {
  test("auditor flags the direct shape", () => {
    const source = "await sql`insert into t (c) values (${JSON.stringify(obj)}::jsonb)`;";
    expect(findStringifiedJsonbParams(source, "fixture.ts")).toHaveLength(1);
  });

  test("auditor flags the indirect const-then-interpolate shape (the deliver.ts bug)", () => {
    const source = [
      "const context = JSON.stringify(input.context);",
      "await sql`insert into t (c) values (${context}::jsonb)`;",
    ].join("\n");
    expect(findStringifiedJsonbParams(source, "fixture.ts")).toHaveLength(1);
  });

  test("auditor passes the correct raw-object shape", () => {
    const source = [
      "const context = input.context;",
      "await sql`insert into t (c) values (${context}::jsonb)`;",
      "const unrelated = JSON.stringify(other); // logged, never cast",
      "console.log(unrelated);",
    ].join("\n");
    expect(findStringifiedJsonbParams(source, "fixture.ts")).toHaveLength(0);
  });

  test("no source file passes a stringified value to an ::jsonb param", () => {
    const violations = ROOTS.flatMap((root) =>
      walk(root).flatMap((path) => findStringifiedJsonbParams(readFileSync(path, "utf8"), path)),
    );
    expect(
      violations,
      violations
        .map((v) => `${v.path}:${v.line} — ${v.text} (pass the raw object; postgres.js serializes ::jsonb params itself)`)
        .join("\n"),
    ).toEqual([]);
  });
});
