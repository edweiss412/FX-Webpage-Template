// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import { stripCommentsForFile } from "../_shared/stripComments";
import { premise } from "../_shared/premise";
import { deriveImportedLibFiles, resolveSpecifier } from "./_renderFaultScan";
import { Project, ScriptTarget } from "ts-morph";
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
  const routes = [...src.matchAll(/route:\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((route): route is string => Boolean(route));
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

/** Synthetic sources in the pins below are TSX-shaped. */
function stripSyntheticSource(src: string): string {
  return stripCommentsForFile(src, "synthetic.tsx");
}

function isClientComponent(src: string): boolean {
  // Strip comments (shared module), then the first non-whitespace token is the first
  // real statement — no hand-rolled comment-skipping needed.
  return /^["']use client["'][ \t]*(?:;|$|\r?\n)/.test(stripSyntheticSource(src).trimStart());
}

function findViolations(files: string[]): string[] {
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (file.endsWith("lib/time/now.ts")) continue;
    if (isClientComponent(src)) continue;

    const strippedLines = stripCommentsForFile(src, file).split("\n");
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

  // ---- Direct-render-import widening (BL-SERVER-TIME-GUARD-EXCLUDES-LIB) ----
  //
  // The population below is the guard's ROOT WALK plus every lib/** module those
  // files import DIRECTLY at runtime. Depth 1, not the transitive closure: a
  // module a rendered file imports directly is on the render path, while one
  // four hops behind it is in the same module graph for reasons that have
  // nothing to do with rendering. Measured -- depth 1 is 213 lib files and 13
  // violations, unbounded is 396 and 31, the whole directory is 532 and 55; all
  // three reach the survivor, and every violation unbounded depth adds sits in a
  // module whose only app/ importers are under app/api/** or a cron path.
  const libFiles = deriveImportedLibFiles(allFiles);
  const libViolations = findViolations(libFiles);

  it("premise: the derived lib population is non-empty and contains the known survivor", () => {
    // Without these, a widening whose resolver returns nothing passes
    // unconditionally forever -- which is the exact shape the guard-premise rule
    // exists to stop, and it would look identical to a clean run.
    premise("the direct-import widening reaches lib/**", libFiles.length, 0);
    expect(
      libFiles.some((f) => f.endsWith("lib/admin/loadAppEvents.ts")),
      "the widening must contain the survivor it was built to reach",
    ).toBe(true);
  });

  it("resolveSpecifier resolves each live specifier shape, and refuses the rest", () => {
    // The population above is only as wide as this resolver. Whole-diff review
    // round 1 caught these cases promised and not shipped: without them the
    // resolver could silently narrow and the widening would still look clean,
    // which is the exact defect shape this arc closes.
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      skipAddingFilesFromTsConfig: true,
    });
    const anchor = project.addSourceFileAtPath(
      join(process.cwd(), "tests/help/_renderFaultScan.ts"),
    );

    // Alias, and a DIRECTORY INDEX — the form whose absence made the population 209.
    expect(resolveSpecifier(anchor, "@/lib/time/now")?.getFilePath()).toMatch(
      /lib\/time\/now\.ts$/,
    );
    expect(resolveSpecifier(anchor, "@/lib/log")?.getFilePath()).toMatch(/lib\/log\/index\.ts$/);
    // Relative, resolved against the IMPORTING file's directory.
    expect(resolveSpecifier(anchor, "./_metaServerTimeGuard.test")?.getFilePath()).toMatch(
      /tests\/help\/_metaServerTimeGuard\.test\.ts$/,
    );
    // A bare package specifier is not ours to resolve, and a dangling path resolves to nothing.
    expect(resolveSpecifier(anchor, "react")).toBeNull();
    expect(resolveSpecifier(anchor, "@/lib/this-module-does-not-exist")).toBeNull();
  });

  it("the computed population CONTAINS lib/admin/loadAppEvents.ts", () => {
    // Asserted by direct containment, never by a root count: the root-count case
    // above passes over an empty widening.
    expect(libFiles.map((f) => relative(process.cwd(), f))).toContain("lib/admin/loadAppEvents.ts");
  });

  it("the derived lib population has exactly 213 members, including both directory-index modules", () => {
    // The shipped resolver tried only <base>.ts and <base>.tsx, so five live
    // imports of @/lib/log and @/lib/parser missed and the population was 209.
    // Neither missed module holds a time violation, so the count of 13 was
    // unaffected -- the guard would have reported clean over a population two
    // files smaller than the one the ladder measured.
    const rel = libFiles.map((f) => relative(process.cwd(), f));
    expect(rel).toContain("lib/log/index.ts");
    expect(rel).toContain("lib/parser/index.ts");
    // 212 -> 213 (fix/observe-error-telemetry): components/observe/GlobalErrorListener.tsx
    // is a rendered file and now imports lib/observe/describeClientValue.ts directly,
    // so that module joins the depth-1 population. It makes no time call, and the
    // violation count below is unchanged at 13.
    expect(rel.length).toBe(213);
  });

  // The twelve waivers this arc added, bound to their SITE and their REASON
  // FAMILY. Not a count, and not a diff: a count of 12 passes when a
  // contributor repairs any one of the thirteen violations and waives the
  // survivor instead, and a diff-derived count has no durable base once the
  // branch merges. Reading the comment AT the coordinate is also what verifies
  // the coordinate -- a row whose line has drifted finds no waiver there.
  const WAIVER_REGISTRY: Record<
    string,
    "mutation-timestamp" | "di-default" | "observe-read-window"
  > = {
    "lib/adminAlerts/resolveAdminAlert.ts:33": "mutation-timestamp",
    "lib/adminAlerts/resolveAdminAlert.ts:60": "mutation-timestamp",
    "lib/drive/watch.ts:956": "di-default",
    "lib/drive/watch.ts:1044": "di-default",
    "lib/drive/watch.ts:1172": "di-default",
    "lib/drive/watch.ts:1389": "di-default",
    "lib/drive/watch.ts:1562": "di-default",
    "lib/observe/query/events.ts:90": "observe-read-window",
    "lib/observe/query/failures.ts:43": "observe-read-window",
    "lib/observe/query/staged.ts:39": "observe-read-window",
    "lib/observe/query/syncLog.ts:30": "observe-read-window",
    "lib/sync/runManualSyncForShow.ts:297": "di-default",
  };
  const FAMILY_TEXT: Record<string, RegExp> = {
    "mutation-timestamp": /mutation timestamp/i,
    "di-default": /dependency-injection default/i,
    "observe-read-window": /observe read-path window/i,
  };

  it("the waived sites in the derived lib population are exactly the twelve registered ones", () => {
    const waived: string[] = [];
    for (const file of libFiles) {
      const originalLines = readFileSync(file, "utf8").split("\n");
      const strippedLines = stripCommentsForFile(readFileSync(file, "utf8"), file).split("\n");
      for (let i = 0; i < strippedLines.length; i++) {
        const stripped = strippedLines[i] ?? "";
        const original = originalLines[i] ?? "";
        if (!FORBIDDEN_PATTERNS.some((pattern) => pattern.test(stripped))) continue;
        if (WAIVER_COMMENT.test(original)) waived.push(`${relative(process.cwd(), file)}:${i + 1}`);
      }
    }
    expect(waived.sort()).toEqual(Object.keys(WAIVER_REGISTRY).sort());
  });

  it("every registered waiver carries the reason family it is registered under, read at its own line", () => {
    for (const [site, family] of Object.entries(WAIVER_REGISTRY)) {
      const [path, lineText] = [
        site.slice(0, site.lastIndexOf(":")),
        site.slice(site.lastIndexOf(":") + 1),
      ];
      const line =
        readFileSync(join(process.cwd(), path), "utf8").split("\n")[Number(lineText) - 1] ?? "";
      expect(WAIVER_COMMENT.test(line), `${site} has no waiver comment at that line`).toBe(true);
      expect(
        FAMILY_TEXT[family]!.test(line),
        `${site} is registered ${family} but its reason does not say so`,
      ).toBe(true);
    }
  });

  it("the survivor is REPAIRED, not waived", () => {
    // Site-bound, because the population-level cases are satisfiable by
    // repairing some other violation and waiving this one instead -- which is
    // exactly the outcome BL-SERVER-TIME-GUARD-EXCLUDES-LIB exists to prevent.
    const source = readFileSync(join(process.cwd(), "lib/admin/loadAppEvents.ts"), "utf8");
    const stripped = stripCommentsForFile(source, "lib/admin/loadAppEvents.ts");
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(pattern.test(stripped), "the survivor must carry no bare time call at all").toBe(
        false,
      );
    }
    expect(source).toContain('from "@/lib/time/now"');
    expect(Object.keys(WAIVER_REGISTRY)).not.toContain("lib/admin/loadAppEvents.ts:45");
  });

  it("every render-side time call in the derived lib population is clean too", () => {
    // Green in the wrong direction on its own: a population that collapsed to
    // nothing also has no violations. The premise case above is the other half.
    expect(libViolations, libViolations.join("\n")).toEqual([]);
  });

  it("client-vs-server classification: includes Footer/StaleFooter (server), excludes RightNowHero/ReportModal (use client)", () => {
    const footerSrc = readFileSync(join(process.cwd(), "components/layout/Footer.tsx"), "utf8");
    const staleSrc = readFileSync(join(process.cwd(), "components/shared/StaleFooter.tsx"), "utf8");
    // The island exemplar is RightNowHero (the live Today hero). It carried the
    // 'use client' directive over from the retired RightNowCard verbatim, so the
    // classifier's contract — it separates a directive-carrying island from a
    // server component — is unchanged by the swap.
    const rightSrc = readFileSync(join(process.cwd(), "components/crew/RightNowHero.tsx"), "utf8");
    const reportSrc = readFileSync(
      join(process.cwd(), "components/shared/ReportModal.tsx"),
      "utf8",
    );

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

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(false);
  });

  it("comment-stripping: real new Date() OUTSIDE a comment IS flagged", () => {
    const synthetic = [
      "// This is a comment about new Date()",
      "const x = new Date(); // a real call",
    ].join("\n");

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("string-literal containing a URL does NOT cause new Date() after it to be stripped", () => {
    const synthetic = 'const url = "https://example.test"; const t = new Date();\n';

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("real // comment after a string literal IS stripped", () => {
    const synthetic = 'const url = "https://example.test"; // a comment with new Date()\n';

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(false);
  });

  it("template-literal interpolation: `${new Date()}` IS flagged", () => {
    const synthetic = "const label = `${new Date()}`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("template-literal interpolation: nested template inside `${...}` works recursively", () => {
    const synthetic = "const label = `outer ${`inner ${new Date()}`} done`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("template-literal interpolation: comment inside `${...}` IS stripped", () => {
    const synthetic = "const label = `${ /* mention new Date() */ realCall() }`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(false);
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
    const strippedLines = stripSyntheticSource(original).split("\n");
    const originalLines = original.split("\n");

    expect(strippedLines.length).toBe(originalLines.length);
    expect(/\bnew Date\(\s*\)/.test(strippedLines[5] ?? "")).toBe(true);
    expect(/\/\/\s*not-render-side:/.test(originalLines[5] ?? "")).toBe(false);
  });

  it("directive-prologue boundary: standalone 'use client' string AFTER imports does NOT classify as client", () => {
    const synthetic = [
      'import { foo } from "bar";',
      '"use client";',
      "export function X() { return null; }",
    ].join("\n");

    expect(isClientComponent(synthetic)).toBe(false);
  });

  it("directive-prologue boundary: 'use client' inside a function body does NOT classify as client", () => {
    const synthetic = [
      "export function X() {",
      '  "use client";',
      "  return new Date();",
      "}",
    ].join("\n");

    expect(isClientComponent(synthetic)).toBe(false);
  });

  it("directive-prologue: leading JSDoc + 'use client' DOES classify as client", () => {
    const synthetic = [
      "/**",
      " * Long header doc comment.",
      " */",
      '"use client";',
      'import React from "react";',
    ].join("\n");

    expect(isClientComponent(synthetic)).toBe(true);
  });

  it("directive-prologue boundary: 'use client' + foo() is an expression, NOT a directive -> server", () => {
    expect(isClientComponent("'use client' + sideEffect();\n")).toBe(false);
  });

  it("directive-prologue boundary: `'use client'.length` is a member expression, NOT a directive -> server", () => {
    expect(isClientComponent("'use client'.length;\n")).toBe(false);
  });
});
