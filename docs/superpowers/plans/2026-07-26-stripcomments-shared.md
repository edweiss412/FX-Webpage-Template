# Shared stripComments Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One TS-parser-backed comment-stripper module under `tests/_shared/`, 45 migrated call sites, and a five-family content-shape meta-test that keeps the class dead.

**Architecture:** Extract `commentRanges`/`stripCommentsSafely` from `tests/styles/_newTabScan.ts` into `tests/_shared/stripComments.ts` with required `ts.ScriptKind`; add `stripSqlComments` (nesting + dollar-span-as-code), `stripCssComments`, `stripMdxComments`, and an extension router `stripCommentsForFile`. A meta-test walks `tests/**/*.{ts,tsx,mts,cts}` and flags five comment-idiom families via a pure `offendersOf` core; migrations drain its `PENDING_MIGRATIONS` scaffold row by row (delete entry → red → migrate → green). Standing exemptions are **site-granular** `{file, family, marker}` triples, never file-wide.

**Tech Stack:** TypeScript compiler API (`typescript` already a dependency — `tests/styles/_newTabScan.ts:30`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-stripcomments-shared-design.md` (APPROVED, Codex R5, commit d4514747d). §N references point there. Plan review R1 findings are incorporated throughout (marked PR1-Fn).

## Global Constraints

- Commit per task, conventional commits; migration commits: `test(<area>): migrate <basename> to shared stripComments`.
- TDD per migration = pending-entry deletion first (spec §5.3a); the meta-test red IS the failing test.
- Suite never red at commit boundaries (spec §5.3d).
- Strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): index reads guarded; **no raw U+2028/U+2029 characters in source — always `\u2028`/`\u2029` escapes** (PR1-F1).
- Triage: trivial → fix in surfacing commit; non-trivial → BACKLOG row + guard allowlist entry citing it (spec §1.1).
- Rename rule: retained wrappers matching family 5 renamed in the same commit; family-5 name list keeps old names as tripwires (spec §5.3b).
- No behavior change beyond comment handling; Tier-C/E use the pre-strip pattern (spec §1.1).

## Meta-test inventory (mandatory declaration)

CREATES `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` (Task 2). EXTENDS no existing registry. `tests/auth/advisoryLockRpcDeadlock.test.ts` is touched (B2) but only its comment stripper changes — lock-topology assertions untouched; no `pg_advisory*` code paths change.

## CI wiring

Both new test files match `BASE_INCLUDE` (`tests/**/*.test.ts`, `vitest.projects.ts:34`) — unit suite picks them up automatically. No workflow edits, no x-audit registration, no env-bound exclusions (both DB-free). No `supabase/migrations/**` → validation-schema-parity N/A. No UI files → impeccable N/A. C13 (`tests/e2e/pendingDiscardReal.layout.spec.ts`) is a Playwright spec outside `BASE_INCLUDE` — its verification is Task 41's explicit Playwright step (PR1-F8).

## Reconciliation sweeps (run at plan time, 2026-07-26, origin/main 2411d4450)

Sweep 1 — name-shape: `rg -n "function strip\w*|const strip\w*|function codeOf|function commentRanges|stripCommentsSafely" tests/` → the named rows of spec §2 Tiers A/B/D.
Sweep 2 — content-shape block-regex: `rg -n "s\\\\S\]\*\?\\\\\*\\\\/|/\\\\\*\.\*\?\\\\\*\\\\/" tests/ -g '*.ts' -g '*.tsx'` → 34 hits; every hit is a §2 row (Tier C came from this sweep).
Sweep 3 — two-char literals + startsWith families → outputs in spec reviews R2/R3; dispositioned as §2 rows E1–E12 / D3 / A16 or refuted (`tests/styles/_metaDoublePrefixColorToken.test.ts:28` CSS-variable regex; `tests/auth/oauth-flow.test.ts:42` URL assertion → E12).
Plan-review sweep (PR1-F6/F7): B2 has **20** live `stripComments` call sites (`rg -n "stripComments\(" tests/auth/advisoryLockRpcDeadlock.test.ts`): 81, 166, 186, 209, 218, 272, 316, 367, 384, 410, 465, 504, 517, 518, 603, 632, 648, 688, 708, 813. C6 has a second idiom (`startsWith("//")` filter) at `tests/cross-cutting/no-vestigial-middleware.test.ts:42`. C13 has three idiom sites: line-start filters at `tests/e2e/pendingDiscardReal.layout.spec.ts:400`, the replace chain at `tests/e2e/pendingDiscardReal.layout.spec.ts:409`, a CSS comment filter at `tests/e2e/pendingDiscardReal.layout.spec.ts:433`.
Every hit of every sweep appears in a task below. The meta-test re-runs detection permanently.

---

### Task 1: Shared module + self-test

**Files:**
- Create: `tests/_shared/stripComments.ts`
- Create: `tests/_shared/stripComments.test.ts`

**Interfaces (Produces):**
```ts
export const LINE_TERMINATORS: RegExp; // /[\n\r\u2028\u2029]/
export function commentRanges(src: string, kind: ts.ScriptKind, sourceFile?: ts.SourceFile): [number, number][];
export function stripCommentsSafely(src: string, kind: ts.ScriptKind): string;
export function stripCommentsForFile(src: string, filePath: string): string;
export function stripMdxComments(src: string): string;
export function stripSqlComments(src: string): string;
export function stripCssComments(src: string): string;
```

- [ ] **Step 1: Write the failing self-test** — `tests/_shared/stripComments.test.ts`. Full test code as in the sections below; imports `describe/expect/it` from vitest and the module under test via `./stripComments`.

```ts
import { describe, expect, it } from "vitest";
import ts from "typescript";

import {
  commentRanges,
  stripCommentsForFile,
  stripCssComments,
  stripMdxComments,
  stripCommentsSafely,
  stripSqlComments,
} from "./stripComments";

const TS = ts.ScriptKind.TS;
const TSX = ts.ScriptKind.TSX;

describe("stripCommentsSafely — TS/TSX", () => {
  it("does not let a path-like /* inside a JSDoc open a runaway span (BL-904 measured case)", () => {
    const src = [
      "/**",
      " * Wraps every route under /admin/*",
      " */",
      'const a = "text-subtle";',
      "/* real */",
      'const b = "bg-accent";',
    ].join("\n");
    const out = stripCommentsSafely(src, TSX);
    expect(out).toContain('const a = "text-subtle";');
    expect(out).toContain('const b = "bg-accent";');
    expect(out).not.toContain("real");
  });

  it("protects /* inside a string literal", () => {
    const src = 'const g = "/* not a comment */"; const live = 1;';
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain('"/* not a comment */"');
    expect(out).toContain("const live = 1;");
  });

  it("protects protocol-relative and scheme URLs and regex literals", () => {
    const src = [
      'const a = "//cdn/x";',
      'const b = "https://cdn/y";',
      "const re = /https:\\/\\/z/; // trailing",
    ].join("\n");
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain('"//cdn/x"');
    expect(out).toContain('"https://cdn/y"');
    expect(out).toContain("/https:\\/\\/z/");
    expect(out).not.toContain("trailing");
  });

  it("parses .ts generic arrows as TS, not JSX (R1 F2 — lib/sync/attachWarningAnchors.ts:40 shape)", () => {
    const src = "const f = <T>(x: T) => x; // gone";
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain("const f = <T>(x: T) => x;");
    expect(out).not.toContain("gone");
    expect(commentRanges(src, TS).length).toBe(1);
  });

  it("preserves offsets and line numbers (blanking, not deletion)", () => {
    const src = "/* one\ntwo */\nconst z = 3;";
    const out = stripCommentsSafely(src, TS);
    expect(out.length).toBe(src.length);
    expect(out.split("\n").length).toBe(src.split("\n").length);
    expect(out.indexOf("const z")).toBe(src.indexOf("const z"));
  });

  it("keeps a shebang", () => {
    const src = "#!/usr/bin/env node // https://x\nconst a = 1; // c";
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain("#!/usr/bin/env node // https://x");
    expect(out).not.toContain("// c");
  });
});

describe("stripCommentsForFile — routing", () => {
  it("routes every declared extension", () => {
    expect(stripCommentsForFile("const a = 1; // c", "x.ts")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.mts")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.cts")).not.toContain("// c");
    expect(stripCommentsForFile("const a = <div/>; // c", "x.tsx")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.js")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.mjs")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.cjs")).not.toContain("// c");
    expect(stripCommentsForFile("const a = <div/>; // c", "x.jsx")).not.toContain("// c");
    expect(stripCommentsForFile("select 1; -- c", "m.sql")).not.toContain("-- c");
    expect(stripCommentsForFile("a { } /* c */", "s.css")).not.toContain("c ");
    expect(stripCommentsForFile("text // keep", "p.mdx")).toContain("// keep");
  });

  it("throws on an unknown extension (fail-closed)", () => {
    expect(() => stripCommentsForFile("x", "notes.yaml")).toThrow(/unknown/i);
  });
});

describe("stripMdxComments", () => {
  it("keeps MDX prose line comments and URLs, strips JSX block comments", () => {
    const src = "[CDN](https://cdn/x)\n{/* gone */}\nplain // keep";
    const out = stripMdxComments(src);
    expect(out).toContain("[CDN](https://cdn/x)");
    expect(out).toContain("// keep");
    expect(out).not.toContain("gone");
  });
});

describe("stripSqlComments", () => {
  it("strips line and block comments, honors '' escaping and quoted markers", () => {
    const src = [
      "select 1; -- gone",
      "select 'a -- b';",
      "select 'it''s -- still data';",
      "select '/* data */';",
      "/* gone2 */ select 2;",
    ].join("\n");
    const out = stripSqlComments(src);
    expect(out).not.toContain("gone");
    expect(out).toContain("'a -- b'");
    expect(out).toContain("'it''s -- still data'");
    expect(out).toContain("'/* data */'");
    expect(out).toContain("select 2;");
  });

  it("handles nested block comments (Postgres nests them)", () => {
    const out = stripSqlComments("/* a /* b */ c */ select 3;");
    expect(out).toContain("select 3;");
    expect(out).not.toContain("c */");
  });

  it("treats dollar-quoted spans as SQL code — tagged and untagged (§1.1 contract)", () => {
    const src = [
      "create function f() returns void as $$",
      "  -- gone-in-untagged",
      "  select 1;",
      "$$ language sql;",
      "create function g() returns void as $function$",
      "begin -- gone-in-tagged",
      "  perform 1; -- also gone",
      "end $function$;",
    ].join("\n");
    const out = stripSqlComments(src);
    expect(out).not.toContain("gone-in-untagged");
    expect(out).not.toContain("gone-in-tagged");
    expect(out).not.toContain("also gone");
    expect(out).toContain("select 1;");
    expect(out).toContain("perform 1;");
  });

  it("still protects single-quoted strings INSIDE dollar spans", () => {
    const out = stripSqlComments("do $$ begin perform log('x -- data'); end $$;");
    expect(out).toContain("'x -- data'");
  });

  it("documented limitation: comment markers in dollar-quoted NON-SQL data are stripped", () => {
    // Spec §1.1 — pinned so the contract is visible, not accidental.
    const out = stripSqlComments("select $d$ text -- looks like data $d$;");
    expect(out).not.toContain("looks like data");
  });
});

describe("stripCssComments", () => {
  it("strips block comments, protects quoted strings", () => {
    const out = stripCssComments('a::before { content: "/*"; } /* gone */ b { color: red; }');
    expect(out).toContain('content: "/*";');
    expect(out).not.toContain("gone");
    expect(out).toContain("b { color: red; }");
  });
});
```

Failure modes caught: runaway block span (BL-904), TSX-vs-TS mis-parse (R1 F2), URL truncation (R20 F1), offset drift, SQL string erasure + dollar-span policy (R2 F6), router grammar mix-ups. Expected values derive from each test's own input strings.

- [ ] **Step 2: Run** — `pnpm vitest run tests/_shared/stripComments.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `tests/_shared/stripComments.ts`** — exactly the Task-1 implementation below. **PR1-F1: `LINE_TERMINATORS` and the blanking check use `\u2028`/`\u2029` ESCAPES, never raw characters.**

```ts
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
 * spaces preserving offsets/newlines (B1's `.search()` ordering depends on it). */
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
```

- [ ] **Step 4: Run** — `pnpm vitest run tests/_shared/stripComments.test.ts` → PASS.
- [ ] **Step 5: Commit** — `test(infra): add shared stripComments module with self-test`

### Task 2: Single-source meta-test

**Files:**
- Create: `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`

**Interfaces:**
- Consumes: `stripCommentsForFile` (Task 1).
- Produces: `PENDING_MIGRATIONS: string[]` (file paths — drained by Tasks 3–46), `STANDING_ALLOWLIST: {file, family, marker, reason}[]` (site-granular, permanent — PR1-F2), `detectCommentIdioms(src): IdiomHit[]`, `offendersOf(entries, standing, pending): string[]` (pure core, walk-independent — PR1-F3).

- [ ] **Step 1: Write the meta-test.** Structure: pure detection core + walk adapter + plant suites that exercise BOTH the core (precedence semantics) AND a real filesystem walk over a temp directory (pipeline proof). Full code:

```ts
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

const ROOT = process.cwd();
const TESTS_DIR = join(ROOT, "tests");
const SHARED_MODULE = "tests/_shared/stripComments.ts";
const SELF = "tests/cross-cutting/_metaStripCommentsSingleSource.test.ts";

export type IdiomHit = { family: string; marker: string };

/** Five detector families (spec §4) on comment-STRIPPED source. Markers are normalized
 *  ("//", "--", "#", "/*", "*\/", or the family-5 identifier) so standing rows can pin
 *  exact sites (PR1-F2). */
export function detectCommentIdioms(strippedSrc: string): IdiomHit[] {
  const hits: IdiomHit[] = [];
  // 1. Block-comment regex literals — [\s\S], [^], and .*? spellings.
  if (/\\\/\\\*(\[\\s\\S\]|\[\^\]|\.)\*\?/.test(strippedSrc)) hits.push({ family: "block-regex-literal", marker: "/*" });
  // 2. Line-comment replace idioms — // or -- to EOL inside .replace(/.../).
  for (const m of strippedSrc.matchAll(/\.replace\(\s*\/(\\\/\\\/|--)/g)) {
    hits.push({ family: "line-replace-idiom", marker: m[1] === "--" ? "--" : "//" });
  }
  // 3. Two-char scanner literals.
  for (const m of strippedSrc.matchAll(/["'`](\/\/|\/\*|\*\/)["'`]/g)) {
    hits.push({ family: "two-char-literal", marker: m[1] ?? "" });
  }
  // 4. Line-start skip filters.
  for (const m of strippedSrc.matchAll(/startsWith\(\s*["'`](\/\/|--|#|\/\*|\*)["'`]\s*\)/g)) {
    hits.push({ family: "startswith-filter", marker: m[1] ?? "" });
  }
  for (const m of strippedSrc.matchAll(/\/\^\\s\*(--|#|\\\/\\\/)\/[gmiy]*/g)) {
    hits.push({ family: "marker-skip-regex", marker: m[1] === "\\/\\/" ? "//" : (m[1] ?? "") });
  }
  // 5. Name family — old names stay tripwires after renames (spec §5.3b).
  for (const m of strippedSrc.matchAll(
    /\b(?:function|const)\s+(strip\w*[Cc]omment\w*|commentRanges|stripNonCode|stripCodeNoise|codeOf)\b/g,
  )) {
    hits.push({ family: "name-family", marker: m[1] ?? "" });
  }
  return hits;
}

export type StandingRow = { file: string; family: string; marker: string; reason: string };

/** Site-granular permanent exemptions (spec §2 D1/E5–E10/E12). NEVER file-wide: an
 *  unlisted (family, marker) in the same file still fails (PR1-F2 — the A16/D1
 *  shared-file case is the regression this design exists for). */
export const STANDING_ALLOWLIST: StandingRow[] = [
  { file: "tests/auth/oauth-flow.test.ts", family: "two-char-literal", marker: "//", reason: "E12: protocol-relative-URL assertion string" },
  { file: "tests/auth/oauth-flow.test.ts", family: "startswith-filter", marker: "//", reason: "E12: protocol-relative-URL assertion, not comment handling" },
  { file: "tests/cross-cutting/db-test-connection-hygiene.test.ts", family: "two-char-literal", marker: "//", reason: "E7: marker literal in the documented loud-error design (its lines 110-114)" },
  { file: "tests/cross-cutting/db-test-connection-hygiene.test.ts", family: "startswith-filter", marker: "#", reason: "E7: documented loud-error trailing-comment design, YAML half" },
  { file: "tests/cross-cutting/db-test-connection-hygiene.test.ts", family: "startswith-filter", marker: "//", reason: "E7: same documented design, JS half" },
  { file: "tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts", family: "marker-skip-regex", marker: "--", reason: "E8: loop-integrated SQL doc-line skips (two sites, one row)" },
  { file: "tests/cross-cutting/unit-suite-shard-topology.test.ts", family: "marker-skip-regex", marker: "#", reason: "E6: YAML # directives filter" },
  { file: "tests/cross-cutting/vitest-projects-partition.test.ts", family: "startswith-filter", marker: "#", reason: "E5: YAML # line filter" },
  { file: "tests/db/_localDbUrl.ts", family: "line-replace-idiom", marker: "//", reason: "DSN credential redaction (its line 31), not comment handling — detector false positive (plan-review R2 F2)" },
  { file: "tests/drive/loadLocalEnv.ts", family: "startswith-filter", marker: "#", reason: "E10: dotenv # grammar" },
  { file: "tests/log/mutationSurface/exemptions.ts", family: "two-char-literal", marker: "//", reason: "E9: marker literal in the comment-READER" },
  { file: "tests/log/mutationSurface/exemptions.ts", family: "startswith-filter", marker: "//", reason: "E9: comment-READER — searches leading comments for the no-telemetry marker" },
];

/** Migration-window scaffold (file-granular is CORRECT here: a migration commit clears
 *  a whole file at once — spec §5.3a/PR1-F2). Task 47 deletes the emptied constant. */
export const PENDING_MIGRATIONS: string[] = [
  "tests/styles/_newTabScan.ts",
  "tests/styles/_classScanUtils.ts",
  "tests/help/_metaServerTimeGuard.test.ts",
  "tests/admin/no-inline-email-normalization.test.ts",
  "tests/admin/serverNoClientValueCall.test.ts",
  "tests/messages/_metaAdminAlertProducer.test.ts",
  "tests/admin/dev-requires-developer.test.ts",
  "tests/help/_metaUiLabelCrosswalk.test.ts",
  "tests/help/_metaAffordanceMatrixParity.test.ts",
  "tests/crew/stageRestrictionThreading.test.ts",
  "tests/sync/_livePartitionClassificationContract.test.ts",
  "tests/sync/no-direct-drive-folder-env.test.ts",
  "tests/components/admin/_metaPopoverViewportSource.test.ts",
  "tests/components/admin/review/reviewModalShell.test.tsx",
  "tests/components/admin/wizard/venueTransitionAudit.test.ts",
  "tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts",
  "tests/docs/designSevenAEmptyHiddenSites.test.ts",
  "tests/crew/_metaTileProducerTopology.test.ts",
  "tests/messages/_metaCatalogCopyHygiene.test.ts",
  "tests/admin/stagedPageRefScan.ts",
  "tests/db/undo-change-lock-order.test.ts",
  "tests/auth/advisoryLockRpcDeadlock.test.ts",
  "tests/db/_resetRpcSource.ts",
  "tests/cross-cutting/_canonicalEmailCheckContract.test.ts",
  "tests/sync/runScheduledCronSync.holdWrite.test.ts",
  "tests/db/schema.test.ts",
  "tests/components/shared/staleFooter-now-prop.test.ts",
  "tests/admin/attentionExclusionSet.test.ts",
  "tests/admin/upsertAdminAlert.test.ts",
  "tests/components/admin/showpage/statusStrip.test.tsx",
  "tests/components/admin/showpage/warningsPanelTransitions.test.tsx",
  "tests/cross-cutting/no-vestigial-middleware.test.ts",
  "tests/components/admin/bellRetainsCutCodes.test.tsx",
  "tests/messages/showScopedCopy.test.ts",
  "tests/onboarding/finalizeNoDriveExport.test.ts",
  "tests/admin/dev/filesMembership.test.ts",
  "tests/sync/_phase2ArgsParityContract.test.ts",
  "tests/auth/_metaInfraContract.test.ts",
  "tests/e2e/pendingDiscardReal.layout.spec.ts",
  "tests/components/admin/showpage/shareHubFlashTransitions.test.ts",
  "tests/styles/_metaDestructiveConfirm.test.ts",
  "tests/cross-cutting/test-fast-deferred.test.ts",
  "tests/admin/parseAndStage-auth.test.ts",
  "tests/sync/jsonbBoundaryRepresentation.meta.test.ts",
];

export type ScanEntry = { rel: string; src: string };

/** Pure core: detection + precedence, no filesystem. Both the real walk and the plant
 *  suites go through this, so precedence semantics are themselves under test (PR1-F3). */
export function offendersOf(
  entries: ScanEntry[],
  standing: StandingRow[],
  pendingFiles: string[],
): string[] {
  const pending = new Set(pendingFiles);
  const offenders: string[] = [];
  for (const { rel, src } of entries) {
    if (rel === SHARED_MODULE || rel === SELF) continue;
    if (pending.has(rel)) continue; // migration window: whole file deferred
    const stripped = stripCommentsForFile(src, rel);
    const residual = detectCommentIdioms(stripped).filter(
      (h) => !standing.some((r) => r.file === rel && r.family === h.family && r.marker === h.marker),
    );
    if (residual.length > 0)
      offenders.push(`${rel}: ${residual.map((h) => `${h.family}(${h.marker})`).join(", ")}`);
  }
  return offenders;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|mts|cts)$/.test(e) ? [p] : [];
  });
}

describe("single-source comment stripping (spec §4)", () => {
  it("no walked test file implements its own comment handling outside the shared module", () => {
    const entries: ScanEntry[] = walk(TESTS_DIR).map((abs) => ({
      rel: relative(ROOT, abs),
      src: readFileSync(abs, "utf8"),
    }));
    const offenders = offendersOf(entries, STANDING_ALLOWLIST, PENDING_MIGRATIONS);
    expect(
      offenders,
      `local comment-handling idioms found — import tests/_shared/stripComments, or add a reasoned STANDING_ALLOWLIST row:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("every STANDING_ALLOWLIST row still matches a live hit (no stale rows)", () => {
    for (const row of STANDING_ALLOWLIST) {
      const src = readFileSync(join(ROOT, row.file), "utf8");
      const hits = detectCommentIdioms(stripCommentsForFile(src, row.file));
      expect(
        hits.some((h) => h.family === row.family && h.marker === row.marker),
        `${row.file} no longer trips ${row.family}(${row.marker}) — delete the stale row`,
      ).toBe(true);
    }
  });

  it("the shared module exports the full API", async () => {
    const mod = await import("../_shared/stripComments");
    for (const name of [
      "commentRanges",
      "stripCommentsSafely",
      "stripCommentsForFile",
      "stripMdxComments",
      "stripSqlComments",
      "stripCssComments",
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name], name).toBe("function");
    }
  });
});

describe("detector negative proofs — through the WALK pipeline (spec §4 plants a–e; PR1-F3)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "stripcomments-plants-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const plant = (name: string, src: string): ScanEntry[] => {
    const dir = join(tmp, name.replace(/\W/g, "_"));
    mkdirSync(dir, { recursive: true });
    const abs = join(dir, name);
    writeFileSync(abs, src);
    return walk(dir).map((p) => ({ rel: `planted/${name}`, src: readFileSync(p, "utf8") }));
  };

  it("(a) naive regex stripper in a walked file fails by default", () => {
    const entries = plant("a.ts", 'function stripComments(s: string) { return s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ""); }\n');
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
  it("(b) RENAMED char-loop copy is caught (R2 F2 evasion)", () => {
    const entries = plant("b.ts", 'function removeNoise(s: string) { const two = s.slice(0, 2); if (two === "//") return ""; return s; }\n');
    expect(offendersOf(entries, [], []).join("")).toContain("two-char-literal");
  });
  it("(c) alternate-spelling inline chain is caught", () => {
    const entries = plant("c.ts", 'export const x = (s: string) => s.replace(/\\/\\*[^]*?\\*\\//g, "");\n');
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
  it("(d) line-start skip filter is caught", () => {
    const entries = plant("d.ts", 'export const l = (s: string) => s.split("\\n").filter((x) => !x.trim().startsWith("//"));\n');
    expect(offendersOf(entries, [], []).join("")).toContain("startswith-filter");
  });
  it("(e) SQL line-comment replace idiom is caught (R3 F1)", () => {
    const entries = plant("e.ts", 'export const y = (sql: string) => sql.replace(/--.*$/gm, "");\n');
    expect(offendersOf(entries, [], []).join("")).toContain("line-replace-idiom");
  });

  it("standing rows are SITE-granular: an unlisted idiom in an allowlisted file still fails (A16/D1 case — PR1-F2)", () => {
    const src = 'function stripYamlComments(y: string) { return y.split("\\n").filter((l) => !l.trim().startsWith("#")).join("\\n"); }\nconst two = "//";\n';
    const entries: ScanEntry[] = [{ rel: "planted/mixed.ts", src }];
    const standing: StandingRow[] = [
      { file: "planted/mixed.ts", family: "name-family", marker: "stripYamlComments", reason: "plant" },
      { file: "planted/mixed.ts", family: "startswith-filter", marker: "#", reason: "plant" },
    ];
    const offenders = offendersOf(entries, standing, []);
    expect(offenders.join("")).toContain("two-char-literal");
    expect(offenders.join("")).not.toContain("name-family");
  });

  it("a pending row suppresses its file only during the window", () => {
    const entries: ScanEntry[] = [
      { rel: "planted/p.ts", src: 'const s = (x: string) => x.replace(/--.*$/gm, "");' },
    ];
    expect(offendersOf(entries, [], ["planted/p.ts"])).toEqual([]);
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
});
```

Note the family-5 name regex intentionally matches `stripYamlComments` (via `strip\w*[Cc]omment\w*`) — D1's standing row pins it by exact marker.

- [ ] **Step 2: Run** — `pnpm vitest run tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` → expect PASS. The STANDING_ALLOWLIST above is EXACTLY the plan-time simulation's offender set (plan-review R2; transcript in the "Simulation" section below) — no D1 rows yet: picker-flow's pending row covers it until Task 18, which adds its residual standing rows. Failure shapes: (i) a walked file trips a family and is in NO list → missed inventory row — add to `PENDING_MIGRATIONS` + a migration task + commit-body note; (ii) a STANDING row is stale (no-stale-rows test) → correct its `marker` to what the detector reports, noting it.
- [ ] **Step 3: Commit** — `test(cross-cutting): add single-source stripComments meta-test with migration scaffold`

---

### Canonical migration procedure ("PROC", used by Tasks 3–46)

1. **Red:** delete the task's file path(s) from `PENDING_MIGRATIONS`; run the meta-test → FAIL naming exactly that file (spec §5.3a).
2. **Migrate:** apply the task's edit spec. Named strippers → imports. Inline idioms / Tier-C/E → pre-strip pattern: strip the whole input once via `stripCommentsForFile(src, path)`; extraction logic unchanged. Rename retained family-5 wrappers (spec §5.3b).
3. **Green:** meta-test PASS; run the row's guard file AND every consumer listed in the task.
4. **Triage** (spec §5.3d): verify each NEW finding against raw source by hand. Trivial → fix here. Non-trivial → BACKLOG row + guard allowlist entry citing it. **Residual meta-test hits after migrating** (e.g. quoted `"//"` fixture strings or test titles in a guard's own test cases — A3's `tests/help/_metaServerTimeGuard.test.ts:304` title is the known instance): if the hit is a fixture/title string and not comment handling, either reword it out of detector shape or add a reasoned STANDING row in the same commit; never widen the pending list.
5. **Commit:** `test(<area>): migrate <basename> to shared stripComments` (+ triage notes).

### Task 3: A1 — canonical source `tests/styles/_newTabScan.ts` + its importers (PR1-F4)

**Files:**
- Modify: `tests/styles/_newTabScan.ts` — delete `LINE_TERMINATORS` (:45), `commentRanges` (:2747), `stripCommentsSafely` (:2800); add `import { LINE_TERMINATORS, commentRanges as sharedCommentRanges, stripCommentsSafely as sharedStrip } from "../_shared/stripComments"` and **re-export thin TSX-bound compatibility wrappers with the OLD arity**:
  ```ts
  export { LINE_TERMINATORS } from "../_shared/stripComments";
  /** Old-arity compat: _newTabScan's corpus is TSX/MDX-compiled — TSX kind preserves
   *  its existing behavior exactly; the .ts-kind fix applies where callers know their
   *  file type and call the shared module directly. */
  export function commentRanges(src: string): [number, number][] {
    return sharedCommentRanges(src, ts.ScriptKind.TSX);
  }
  export function stripCommentsSafely(src: string): string {
    return sharedStrip(src, ts.ScriptKind.TSX);
  }
  ```
  This keeps ALL internal call sites (incl. `tests/styles/_newTabScan.ts:2404`, which has no path in scope) and the 15 old-arity calls in `tests/styles/_metaNewTabAnnouncement.test.ts` (lines 985, 3208-3209, 3217-3218, 3285, 3290, 3298, 3303, 3478, 3482, 3489, 3501, 3509-3510) compiling unchanged, and keeps the `LINE_TERMINATORS` import at `tests/styles/_metaNewTabAnnouncement.test.ts:20` working. Behavior identical to today (TSX everywhere) — the SINGLE-SOURCE goal is met (one implementation), and the ScriptKind fix reaches the guards that migrate to `stripCommentsForFile`.
**Consumers to run:** `pnpm vitest run tests/styles/_metaNewTabAnnouncement.test.ts tests/components/a11y/newTabAnnouncementBehavior.test.tsx`
PROC 1–5. Note: the compat wrappers do NOT trip the family-5 detector going forward — their names are in the family list, so this FILE would red once its pending row is deleted… the wrappers delegate and carry no idiom from families 1–4, but family 5 matches the names `commentRanges`/`stripCommentsSafely`. Add two STANDING rows in this task's commit: `{file: "tests/styles/_newTabScan.ts", family: "name-family", marker: "commentRanges", reason: "A1 compat re-export delegating to shared"}` and the same for `stripCommentsSafely`. (The no-stale-rows test pins both.)

### Task 4: A2 — `tests/styles/_classScanUtils.ts` + its six consumers (PR1-F5)

**Files:**
- Modify: `tests/styles/_classScanUtils.ts` — delete `stripLineComment` (:33) and line-based `stripComments` (:60); `stripCommentsForFile` (:56) becomes `export { stripCommentsForFile } from "../_shared/stripComments";` (same name + signature). Keep `walk`/`tokensOf`.
- Modify (only where they import the DELETED `stripComments` symbol — verify each with `rg -n "stripComments" <file>` first): `tests/styles/_metaDestructiveConfirm.test.ts`, `tests/styles/_metaDoublePrefixColorToken.test.ts`, `tests/styles/_metaBgAccentInventory.test.ts`, `tests/styles/_metaRawAccentText.test.ts`, `tests/components/admin/_metaResolveLabelSingleSource.test.ts`, `tests/admin/_metaAttentionItemsTopology.test.ts` — switch `stripComments(src)`/`stripComments(src, opts)` calls to `stripCommentsForFile(src, <path in scope>)` (every call site reads the file it passes, so a path is in scope).
**Consumers to run:** all six files above via one `pnpm vitest run` invocation.
**Special:** `tests/styles/_metaDoublePrefixColorToken.test.ts` self-test block pins the OLD line-based behavior — port the pins to the shared behavior (they pass against it; if any pin encodes the heuristic's limitation rather than its guarantee, replace with the §6 equivalent case and note it). PROC 1–5.

### Tasks 5–22: A3–A20 (PROC each)

- **Task 5 / A3** `tests/help/_metaServerTimeGuard.test.ts` — delete state machine (:54); call sites use `stripCommentsForFile(src, filePath)` (corpus `.ts/.tsx` via `walkTsTsx`).
- **Task 6 / A4** `tests/admin/no-inline-email-normalization.test.ts` — def :41 → exempt-line filter retained + RENAMED `dropExemptLines`; then `stripCommentsForFile`. Poison-file check: guard still sees `lib/sync/attachWarningAnchors.ts` sites; delta triaged.
- **Task 7 / A5** `tests/admin/serverNoClientValueCall.test.ts` — def :48 AND inline idiom :59, one commit.
- **Task 8 / A6** `tests/messages/_metaAdminAlertProducer.test.ts` — def :33. Line numbers become correct under blanking; update any fixture/allowlist encoding the old skew (note in commit).
- **Task 9 / A7** `tests/admin/dev-requires-developer.test.ts` — def :32. Verify :56-62 window assertions; widen mechanically if blanking padding shifts content (note in commit).
- **Task 10 / A8** `tests/help/_metaUiLabelCrosswalk.test.ts` — def :262, drop `export`. `.js/.jsx` corpus → router covers.
- **Task 11 / A9** `tests/help/_metaAffordanceMatrixParity.test.ts` — def :32 → `stripCommentsForFile` (fixes MDX policy violation).
- **Task 12 / A10** `tests/crew/stageRestrictionThreading.test.ts` — def :20.
- **Task 13 / A11** `tests/sync/_livePartitionClassificationContract.test.ts` — def :48.
- **Task 14 / A12** `tests/sync/no-direct-drive-folder-env.test.ts` — def :8.
- **Task 15 / A13** `tests/components/admin/_metaPopoverViewportSource.test.ts` — def :77; `codeOf` (:127) delegates + RENAMED `strippedSourceOf`. `.mts/.cts` corpus → router covers.
- **Task 16 / A14** `tests/components/admin/review/reviewModalShell.test.tsx` — def :535; D2: `animationContexts` (:444) pre-strips via `stripCssComments`.
- **Task 17 / A15** `tests/components/admin/wizard/venueTransitionAudit.test.ts` — def :10.
- **Task 18 / A16** `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — delete `stripTsComments` (:72) → `stripCommentsSafely(src, ts.ScriptKind.TS)`. RENAME the YAML stripper (:47) `stripComments` → `stripYamlComments`. PROC step 1 reds every idiom in the file (no standing rows exist for it yet); after migrating, run the detector on the file and add STANDING rows for exactly the YAML stripper's residual hits (expected: `{name-family, stripYamlComments}`; possibly a quoted-marker literal from its scanner) in this same commit — the no-stale-rows test pins each (PR1-F2, PR2-F1).
- **Task 19 / A17** `tests/docs/designSevenAEmptyHiddenSites.test.ts` — delete `stripNonCode` (:37) → pre-strip. Blanked `{/* */}` leaves `{ }` — confirm assertions tolerate empty JSX expressions (raw-source triage otherwise).
- **Task 20 / A18** `tests/crew/_metaTileProducerTopology.test.ts` — `codeOf` (:65) delegates + RENAMED `strippedSourceOf`.
- **Task 21 / A19** `tests/messages/_metaCatalogCopyHygiene.test.ts` — `stripCodeNoise` (:164): comment replaces → shared pre-strip; string-blanking stays; RENAMED `blankStringNoise`.
- **Task 22 / A20** `tests/admin/stagedPageRefScan.ts` — delete local `commentRanges` (:49); shared import passing its parsed `sourceFile` + its kind. **Consumers:** `pnpm vitest run tests/admin/stagedPageRefScan.test.ts tests/admin/step3DeletionSafety.test.ts`.

### Tasks 23–28: B1–B6 (PROC each)

- **Task 23 / B1** `tests/db/undo-change-lock-order.test.ts` — def :16 → shared `stripSqlComments`.
- **Task 24 / B2** `tests/auth/advisoryLockRpcDeadlock.test.ts` — def :10 deleted; ALL **20** call sites updated (PR1-F6 list: 81, 166, 186, 209, 218, 272, 316, 367, 384, 410, 465, 504, 517, 518, 603, 632, 648, 688, 708, 813): each becomes `stripCommentsForFile(content, <the same path expression its readFileSync uses>)` — several sites use route/helper constants; pass that exact constant/variable, do not re-derive. Sites reading `.ts` files get TS routing, `.sql` files SQL routing, automatically.
- **Task 25 / B3** `tests/db/_resetRpcSource.ts` — local `stripSqlComments` (:18) → shared import. **Consumers:** `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts tests/db/resetValidationDataDriveKeyedAudit.test.ts tests/db/resetValidationDataFkAudit.test.ts`.
- **Task 26 / B4** `tests/cross-cutting/_canonicalEmailCheckContract.test.ts` — local `stripSqlComments` (:54) → shared (adds block+quote handling; tagged-span corpus per §1.1).
- **Task 27 / B5** `tests/sync/runScheduledCronSync.holdWrite.test.ts` — per-line `--` strip (:127-131) → one `stripSqlComments(text)`.
- **Task 28 / B6** `tests/db/schema.test.ts` — per-line `--` strip (:406-410) → `stripSqlComments(raw)` then existing split/trim/filter (blanked lines trim empty → filtered; first-statement assertion unchanged).

### Tasks 29–41: C1–C13 (PROC each; pre-strip pattern)

- **Task 29 / C1** `tests/components/shared/staleFooter-now-prop.test.ts` :58 + :106.
- **Task 30 / C2** `tests/admin/attentionExclusionSet.test.ts` :173.
- **Task 31 / C3** `tests/admin/upsertAdminAlert.test.ts` :77 + :111.
- **Task 32 / C4** `tests/components/admin/showpage/statusStrip.test.tsx` :439.
- **Task 33 / C5** `tests/components/admin/showpage/warningsPanelTransitions.test.tsx` :132 + :172.
- **Task 34 / C6** `tests/cross-cutting/no-vestigial-middleware.test.ts` — BOTH the block replacement (:38) AND the `startsWith("//")` filter (:42) in one commit (PR1-F7).
- **Task 35 / C7** `tests/components/admin/bellRetainsCutCodes.test.tsx` :159.
- **Task 36 / C8** `tests/messages/showScopedCopy.test.ts` :152.
- **Task 37 / C9** `tests/onboarding/finalizeNoDriveExport.test.ts` :17.
- **Task 38 / C10** `tests/admin/dev/filesMembership.test.ts` :83 — whole-file pre-strip, then existing `const FILES = [...]` extraction (offsets preserved).
- **Task 39 / C11** `tests/sync/_phase2ArgsParityContract.test.ts` :75 — same shape.
- **Task 40 / C12** `tests/auth/_metaInfraContract.test.ts` — `braceDelta` (:236-240) drops its inline strip; FILE content pre-stripped once before line iteration. R2 F3's `"https://x"` case becomes correct.
- **Task 41 / C13** `tests/e2e/pendingDiscardReal.layout.spec.ts` — ALL THREE sites in one commit (PR1-F7): line-start filters (:400), replace chain (:409) → one TS pre-strip of the searched source; CSS comment filter (:433) → `stripCssComments`. **Verification (PR1-F8, e2e harness-readiness):** this is a Playwright spec, not collected by vitest. (a) Typecheck via the repo's standard check (`pnpm exec tsc --noEmit -p .` or the project's lint/typecheck script). (b) Run `pnpm exec playwright test tests/e2e/pendingDiscardReal.layout.spec.ts` — server boot per `playwright.config.ts` `webServer` (local Supabase already up from preflight); hydration gates are the spec's own existing `toPass` blocks; no sampler outlives its element in the changed code (pre-strip is node-side string work). If the local e2e harness cannot boot, record the exact failure in the commit body and rely on the meta-test + typecheck (the edit is node-side string handling, not page behavior) — do NOT silently skip.

### Task 42: D3 — `tests/components/admin/showpage/shareHubFlashTransitions.test.ts`

Comment-skip branch (:66-70) deleted; CSS input pre-stripped with `stripCssComments` before depth counting. PROC 1–5.

### Tasks 43–46: E1–E4 (PROC each; pre-strip pattern)

- **Task 43 / E1** `tests/styles/_metaDestructiveConfirm.test.ts` :243-249 — drop filter; pre-strip.
- **Task 44 / E2** `tests/cross-cutting/test-fast-deferred.test.ts` :63-68 — drop filter; pre-strip `vitest.config.ts` content.
- **Task 45 / E3** `tests/admin/parseAndStage-auth.test.ts` :73-80 — drop filter; pre-strip; first non-blank line = first executable statement.
- **Task 46 / E4** `tests/sync/jsonbBoundaryRepresentation.meta.test.ts` — delete `isCommentLine` (:49-52); pre-strip before iteration.

### Task 47: Close-out gate + scaffold removal (PR1-F9)

- [ ] **Step 1 (red-capable gate):** add to the meta-test: `it("migration window is closed", () => { expect(PENDING_MIGRATIONS).toEqual([]); });` Run it — FAILS if any Task 3–46 was skipped (this is the failing-test-first step; if it fails, the plan is not done — go back).
- [ ] **Step 2:** with the gate green, delete `PENDING_MIGRATIONS`, its `offendersOf` parameter usage at the real-walk call site (pass `[]` → then remove the param entirely and update `offendersOf`'s signature + the pending-window plant to construct locally), and the Step-1 gate itself. Meta-test → PASS.
- [ ] **Step 3:** Update `BACKLOG.md` row `BL-STRIPCOMMENTS-DUPLICATED-AND-FAIL-OPEN` (BACKLOG.md:904): status RESOLVED (2026-07-26, this branch), end-state summary, spec pointer.
- [ ] **Step 4:** Full suite `pnpm test` → green (triage residue per PROC 4).
- [ ] **Step 5:** Commit — `test(infra): drain stripComments migration scaffold; resolve BL-STRIPCOMMENTS backlog row`

## Simulation (run at plan time — plan-review R2)

`scratchpad/simulate-meta.mjs` reimplements Task 2's strip+detect+walk pipeline and ran against this plan's PENDING_MIGRATIONS on the live tree (origin/main 2411d4450). Output (= the exact required STANDING_ALLOWLIST):

```
tests/auth/oauth-flow.test.ts -> two-char-literal(//), startswith-filter(//)
tests/cross-cutting/db-test-connection-hygiene.test.ts -> two-char-literal(//), startswith-filter(#), startswith-filter(//)
tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts -> marker-skip-regex(--), marker-skip-regex(--)
tests/cross-cutting/unit-suite-shard-topology.test.ts -> marker-skip-regex(#)
tests/cross-cutting/vitest-projects-partition.test.ts -> startswith-filter(#)
tests/db/_localDbUrl.ts -> line-replace-idiom(//)
tests/drive/loadLocalEnv.ts -> startswith-filter(#)
tests/log/mutationSurface/exemptions.ts -> two-char-literal(//), startswith-filter(//)
```

Notes: comment-text mentions (e.g. `tests/styles/_metaDoublePrefixColorToken.test.ts:46`, `tests/styles/_metaNewTabAnnouncement.test.ts:3223`) do NOT trip — detection runs on stripped source. `tests/styles/_metaNewTabAnnouncement.test.ts` fixture strings do not match the quote-adjacent family-3 regex. E11 (`.mjs`) correctly absent (outside walk).

## Self-review notes (run at plan time; revised after plan-review R1)

1. **Spec coverage:** §3 → Task 1; §4 → Task 2 (site-granular standing per PR1-F2, walk-exercising plants per PR1-F3); §5 → PROC + Tasks 3–46; §6 → Task 1 self-test + Task 2 plants; §7/§8 respected. Every §2 migrating row has exactly one task; keep rows are STANDING rows; E11 documentation-only.
2. **Placeholder scan:** clean — every task names file, sites, edit shape, consumers, and commands; Tasks 1/2 carry full code.
3. **Type consistency:** `stripCommentsForFile(src, filePath)` identical everywhere; `offendersOf`/`detectCommentIdioms`/`StandingRow`/`ScanEntry` defined once in Task 2; A1 compat wrappers keep old arity by design.
4. **Snippet typecheck:** written against `noUncheckedIndexedAccess` (`?? ""` guards, `m[1] ?? ""` on match groups); **no raw U+2028/U+2029 anywhere** (PR1-F1); verified by running the files per task steps.
5. **PR1 findings ledger:** F1→Task 1 escapes; F2→Task 2 site-granular standing + A16/D1 plant + Task 18; F3→plants through walk + pure `offendersOf`; F4→Task 3 compat wrappers + consumer list + :2404 note; F5→Task 4 consumer migration; F6→Task 24's 20 sites; F7→Tasks 34/41 co-located idioms; F8→Task 41 Playwright verification; F9→Task 47 red-capable gate.

## Close-out record (2026-07-27)

Task 41 Playwright verification: two local attempts could not complete — attempt 1 wedged in `config.webServer` (next-server pegged ~2.7h, killed), attempt 2 timed out at 720s with zero output (build phase, machine under review load). Loud fallback per the task's contract: the edit is node-side string handling verified by tsc + the meta-test; `pendingDiscardReal.layout.spec.ts` is run by no CI workflow (BL-E2E-LIFECYCLE-SPECS-CI-DARK ledger row), so local execution was best-effort, not a gate. Full suite: 1640 passed; 4 failing files are all OUTSIDE this diff (3 live-DB/CI-bound tests failing on local env by design, 1 was the BACKLOG graduation rule — fixed by graduating the row to BACKLOG-archive.md).
