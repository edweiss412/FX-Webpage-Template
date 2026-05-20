// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_PATTERNS = [/\bnew Date\(\s*\)/, /\bDate\.now\(\s*\)/];
const WAIVER_COMMENT = /\/\/\s*not-render-side:/;

function discoverScanRoots(): string[] {
  const roots = new Set<string>(["components"]);
  const manifestPath = join(process.cwd(), "scripts/help-screenshots.manifest.ts");

  if (!existsSync(manifestPath)) {
    roots.add("app/show");
    roots.add("app/admin");
    // R2 finding (M11 Phase C): app/me was missing from the fallback set;
    // `MeShowSections` held a direct render-side `new Date()` that the
    // guard never scanned. The manifest-derived path (Phase F) will
    // include any route the screenshot harness captures, so this fallback
    // becomes moot post-Phase F — but pre-Phase F we must enumerate
    // every user-facing app/<segment>/ route here.
    roots.add("app/me");
    return [...roots].sort();
  }

  const src = readFileSync(manifestPath, "utf8");
  const routes = [...src.matchAll(/route:\s*["']([^"']+)["']/g)].map((m) => m[1]).filter((route): route is string => Boolean(route));
  for (const route of routes) {
    const segment = route.split("/").filter(Boolean)[0];
    if (segment) roots.add(join("app", segment));
  }

  return [...roots].sort();
}

function walkTsTsx(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsTsx(full, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }

  return found;
}

function stripComments(src: string): string {
  type Frame =
    | { mode: "code" | "single" | "double" | "template" | "line" | "block" }
    | { mode: "templateExpression"; braceDepth: number };

  const out: string[] = [];
  let i = 0;
  const stack: Frame[] = [{ mode: "code" }];
  const top = (): Frame => stack[stack.length - 1] ?? { mode: "code" };

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    const frame = top();

    if (frame.mode === "code" || frame.mode === "templateExpression") {
      if (c === "/" && next === "/") {
        stack.push({ mode: "line" });
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        stack.push({ mode: "block" });
        i += 2;
        continue;
      }
      if (c === "'") {
        stack.push({ mode: "single" });
        out.push(c);
        i++;
        continue;
      }
      if (c === '"') {
        stack.push({ mode: "double" });
        out.push(c);
        i++;
        continue;
      }
      if (c === "`") {
        stack.push({ mode: "template" });
        out.push(c);
        i++;
        continue;
      }
      if (frame.mode === "templateExpression" && c === "{") {
        frame.braceDepth++;
        out.push(c);
        i++;
        continue;
      }
      if (frame.mode === "templateExpression" && c === "}") {
        if (frame.braceDepth > 0) {
          frame.braceDepth--;
        } else {
          stack.pop();
        }
        out.push(c);
        i++;
        continue;
      }
      out.push(c ?? "");
      i++;
      continue;
    }

    if (frame.mode === "line") {
      if (c === "\n") {
        out.push("\n");
        stack.pop();
      }
      i++;
      continue;
    }

    if (frame.mode === "block") {
      if (c === "*" && next === "/") {
        stack.pop();
        i += 2;
        continue;
      }
      if (c === "\n") out.push("\n");
      i++;
      continue;
    }

    if (frame.mode === "single") {
      if (c === "\\") {
        out.push(c ?? "");
        if (next) out.push(next);
        i += 2;
        continue;
      }
      if (c === "'") stack.pop();
      out.push(c ?? "");
      i++;
      continue;
    }

    if (frame.mode === "double") {
      if (c === "\\") {
        out.push(c);
        if (next) out.push(next);
        i += 2;
        continue;
      }
      if (c === '"') stack.pop();
      out.push(c ?? "");
      i++;
      continue;
    }

    if (frame.mode === "template") {
      if (c === "\\") {
        out.push(c);
        if (next) out.push(next);
        i += 2;
        continue;
      }
      if (c === "$" && next === "{") {
        out.push(c, next);
        stack.push({ mode: "templateExpression", braceDepth: 0 });
        i += 2;
        continue;
      }
      if (c === "`") stack.pop();
      out.push(c ?? "");
      i++;
    }
  }

  return out.join("");
}

function isClientComponent(src: string): boolean {
  let i = 0;

  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i] ?? "")) i++;

    if (src.startsWith("//", i)) {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }

    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }

    break;
  }

  return /^["']use client["'][ \t]*(?:;|$|\r?\n)/.test(src.slice(i));
}

function findViolations(files: string[]): string[] {
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (file.endsWith("lib/time/now.ts")) continue;
    if (isClientComponent(src)) continue;

    const strippedLines = stripComments(src).split("\n");
    const originalLines = src.split("\n");

    for (let i = 0; i < strippedLines.length; i++) {
      const strippedLine = strippedLines[i] ?? "";
      const originalLine = originalLines[i] ?? "";
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(strippedLine) && !WAIVER_COMMENT.test(originalLine)) {
          violations.push(`${relative(process.cwd(), file)}:${i + 1}: ${originalLine.trim()}`);
        }
      }
    }
  }

  return violations;
}

describe("Server-time grep guard — multi-violation regex stability (r2)", () => {
  it("reports BOTH forbidden calls on adjacent lines at different columns", () => {
    const synthetic = [
      "const a = computeSomethingLongAndDescriptive_takingHere_with_padding_paddingX = new Date();",
      "const b = new Date();",
    ].join("\n");

    const violations: string[] = [];
    synthetic.split("\n").forEach((line, i) => {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) violations.push(`L${i + 1}`);
      }
    });

    expect(violations).toEqual(["L1", "L2"]);
  });
});

describe("Server-side time-call grep guard (test #16 — AC-11.38)", () => {
  const scanRoots = discoverScanRoots();
  const allFiles = scanRoots.flatMap((root) => walkTsTsx(join(process.cwd(), root)));
  const violations = findViolations(allFiles);

  it(`has at least one scan root (got ${scanRoots.join(", ")})`, () => {
    expect(scanRoots.length).toBeGreaterThan(0);
  });

  it("every render-side time call uses lib/time/now.ts or carries a per-line waiver", () => {
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("client-vs-server classification: includes Footer/StaleFooter (server), excludes RightNowCard/ReportModal (use client)", () => {
    const footerSrc = readFileSync(join(process.cwd(), "components/layout/Footer.tsx"), "utf8");
    const staleSrc = readFileSync(join(process.cwd(), "components/shared/StaleFooter.tsx"), "utf8");
    const rightSrc = readFileSync(join(process.cwd(), "components/right-now/RightNowCard.tsx"), "utf8");
    const reportSrc = readFileSync(join(process.cwd(), "components/shared/ReportModal.tsx"), "utf8");

    expect(isClientComponent(footerSrc)).toBe(false);
    expect(isClientComponent(staleSrc)).toBe(false);
    expect(isClientComponent(rightSrc)).toBe(true);
    expect(isClientComponent(reportSrc)).toBe(true);
  });

  it("comment-stripping: comment-only mentions of new Date() do NOT register as violations", () => {
    const synthetic = [
      " // This function returns the equivalent of new Date() but...",
      "/* Block: new Date() is bad here */",
      "export function f() { return 1; }",
    ].join("\n");

    expect(/\bnew Date\(\s*\)/.test(stripComments(synthetic))).toBe(false);
  });

  it("comment-stripping: real new Date() OUTSIDE a comment IS flagged", () => {
    const synthetic = ["// This is a comment about new Date()", "const x = new Date(); // a real call"].join(
      "\n",
    );

    expect(/\bnew Date\(\s*\)/.test(stripComments(synthetic))).toBe(true);
  });

  it("string-literal containing '//' (URL) does NOT cause new Date() after it to be stripped", () => {
    const synthetic = 'const url = "https://example.test"; const t = new Date();\n';

    expect(/\bnew Date\(\s*\)/.test(stripComments(synthetic))).toBe(true);
  });

  it("real // comment after a string literal IS stripped", () => {
    const synthetic = 'const url = "https://example.test"; // a comment with new Date()\n';

    expect(/\bnew Date\(\s*\)/.test(stripComments(synthetic))).toBe(false);
  });

  it("template-literal interpolation: `${new Date()}` IS flagged", () => {
    const synthetic = "const label = `${new Date()}`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripComments(synthetic))).toBe(true);
  });

  it("template-literal interpolation: nested template inside `${...}` works recursively", () => {
    const synthetic = "const label = `outer ${`inner ${new Date()}`} done`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripComments(synthetic))).toBe(true);
  });

  it("template-literal interpolation: comment inside `${...}` IS stripped", () => {
    const synthetic = "const label = `${ /* mention new Date() */ realCall() }`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripComments(synthetic))).toBe(false);
  });

  it("comment-stripping: multi-line block comment preserves newline count for waiver alignment", () => {
    const original = [
      "/**",
      " * Multi-line JSDoc.",
      " * Reference: new Date() — documentation, not code.",
      " * not-render-side: this is JUST a comment, ignored by the guard",
      " */",
      "const x = new Date(); // ACTUAL violation",
    ].join("\n");
    const strippedLines = stripComments(original).split("\n");
    const originalLines = original.split("\n");

    expect(strippedLines.length).toBe(originalLines.length);
    expect(/\bnew Date\(\s*\)/.test(strippedLines[5] ?? "")).toBe(true);
    expect(/\/\/\s*not-render-side:/.test(originalLines[5] ?? "")).toBe(false);
  });

  it("directive-prologue boundary: standalone 'use client' string AFTER imports does NOT classify as client", () => {
    const synthetic = ['import { foo } from "bar";', '"use client";', "export function X() { return null; }"].join(
      "\n",
    );

    expect(isClientComponent(synthetic)).toBe(false);
  });

  it("directive-prologue boundary: 'use client' inside a function body does NOT classify as client", () => {
    const synthetic = ["export function X() {", '  "use client";', "  return new Date();", "}"].join("\n");

    expect(isClientComponent(synthetic)).toBe(false);
  });

  it("directive-prologue: leading JSDoc + 'use client' DOES classify as client", () => {
    const synthetic = ["/**", " * Long header doc comment.", " */", '"use client";', 'import React from "react";'].join(
      "\n",
    );

    expect(isClientComponent(synthetic)).toBe(true);
  });

  it("directive-prologue boundary: 'use client' + foo() is an expression, NOT a directive -> server", () => {
    expect(isClientComponent("'use client' + sideEffect();\n")).toBe(false);
  });

  it("directive-prologue boundary: `'use client'.length` is a member expression, NOT a directive -> server", () => {
    expect(isClientComponent("'use client'.length;\n")).toBe(false);
  });
});
