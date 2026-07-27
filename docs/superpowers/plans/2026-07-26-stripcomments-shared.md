# Shared stripComments Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One TS-parser-backed comment-stripper module under `tests/_shared/`, 45 migrated call sites, and a five-family content-shape meta-test that keeps the class dead.

**Architecture:** Extract `commentRanges`/`stripCommentsSafely` from `tests/styles/_newTabScan.ts` into `tests/_shared/stripComments.ts` with required `ts.ScriptKind`; add `stripSqlComments` (nesting + dollar-span-as-code), `stripCssComments`, `stripMdxComments`, and an extension router `stripCommentsForFile`. A meta-test walks `tests/**/*.{ts,tsx,mts,cts}` and flags five comment-idiom families; migrations drain its `PENDING_MIGRATIONS` scaffold row by row (delete entry → red → migrate → green).

**Tech Stack:** TypeScript compiler API (`typescript` already a dependency — `tests/styles/_newTabScan.ts:30`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-stripcomments-shared-design.md` (APPROVED, Codex R5, commit d4514747d). Section references (§N) below point there.

## Global Constraints

- Commit per task, conventional commits (AGENTS.md invariant 6); migration commits use `test(<area>): migrate <file> to shared stripComments`.
- TDD ordering per migration = pending-entry deletion first (spec §5.3a) — the meta-test red IS the failing test.
- Never leave the suite red at a commit boundary (spec §5.3d).
- Strict tsconfig: `noUncheckedIndexedAccess` — all index reads use `?? ""` guards or bounds checks.
- Triage rule: trivial finding → fix in the surfacing commit; non-trivial → BACKLOG row + per-guard allowlist entry citing it (spec §1.1).
- Rename rule: retained wrappers matching detector family 5 get non-matching names in the same commit (spec §5.3b).
- No behavior change beyond the comment-handling step (spec §1.1); Tier-C/E use the pre-strip pattern.

## Meta-test inventory (mandatory declaration)

This plan CREATES `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` (Task 2). It EXTENDS no existing registry. Advisory-lock topology test (`tests/auth/advisoryLockRpcDeadlock.test.ts`) is TOUCHED (B2) but only its comment-stripping helper changes — lock-topology assertions untouched; no `pg_advisory*` code paths change anywhere in this plan.

## CI wiring

Both new test files match `BASE_INCLUDE` (`tests/**/*.test.ts`, `vitest.projects.ts:34`) and run in the unit suite automatically. No workflow edits, no x-audit registration, no env-bound exclusions needed (both are DB-free static tests). No `supabase/migrations/**` changes → validation-schema-parity N/A. No UI files → impeccable gate N/A.

## Reconciliation sweeps (run at plan time, 2026-07-26, origin/main 2411d4450)

Sweep 1 — name-shape: `rg -n "function strip\w*|const strip\w*|function codeOf|function commentRanges|stripCommentsSafely" tests/` → the named rows of spec §2 Tiers A/B/D (A1–A20, B1–B4, D1–D3).
Sweep 2 — content-shape block-regex: `rg -n "s\\\\S\]\*\?\\\\\*\\\\/|/\\\\\*\.\*\?\\\\\*\\\\/" tests/ -g '*.ts' -g '*.tsx'` → 34 hits; every hit is a §2 row (Tier C rows C1–C13 came from this sweep).
Sweep 3 — two-char literals + startsWith families: outputs reproduced in spec review R2/R3; every hit dispositioned as §2 rows E1–E12 / D3 / A16, or refuted as non-comment code (`tests/styles/_metaDoublePrefixColorToken.test.ts:28` CSS-variable regex; `tests/auth/oauth-flow.test.ts:42` URL assertion → E12 standing row).
Disposition completeness: every hit of all three sweeps appears in spec §2 with a migrate/keep/documentation-only disposition. The meta-test (Task 2) re-runs this detection permanently.

---

### Task 1: Shared module + self-test

**Files:**
- Create: `tests/_shared/stripComments.ts`
- Create: `tests/_shared/stripComments.test.ts`

**Interfaces (Produces — later tasks rely on exactly these):**
```ts
export const LINE_TERMINATORS: RegExp;
export function commentRanges(src: string, kind: ts.ScriptKind, sourceFile?: ts.SourceFile): [number, number][];
export function stripCommentsSafely(src: string, kind: ts.ScriptKind): string;
export function stripCommentsForFile(src: string, filePath: string): string;
export function stripMdxComments(src: string): string;
export function stripSqlComments(src: string): string;
export function stripCssComments(src: string): string;
```

- [ ] **Step 1: Write the failing self-test** — `tests/_shared/stripComments.test.ts`:

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
    expect(() => stripCommentsForFile("x", "notes.yaml")).toThrow(/unknown|unsupported/i);
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

  // Documented limitation (§1.1): NON-SQL data inside a dollar span containing comment
  // markers WILL be stripped. Pinned so the contract is visible, not accidental.
  it("documented limitation: comment markers in dollar-quoted NON-SQL data are stripped", () => {
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

Concrete failure modes caught (anti-tautology): runaway block span (BL-904), JSX-vs-TS mis-parse (R1 F2), URL truncation (R20 F1), offset drift (blanking contract), SQL string erasure and dollar-span policy (R2 F6), router grammar mix-ups. Expected values are derived from the input strings inside each test, not from the implementation.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/_shared/stripComments.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `tests/_shared/stripComments.ts`**

```ts
// tests/_shared/stripComments.ts
// THE comment-stripping module for structural guards. Single source (spec
// docs/superpowers/specs/2026-07-26-stripcomments-shared-design.md); the meta-test
// tests/cross-cutting/_metaStripCommentsSingleSource.test.ts forbids local copies.
import ts from "typescript";

export const LINE_TERMINATORS = /[\n\r  ]/;

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
      if (ch !== "\n" && ch !== "\r" && ch !== " " && ch !== " ") out[i] = " ";
    }
  }
  return out.join("");
}

/* MDX is not JavaScript: a bare `//` there is a URL or prose far more often than a
 * comment, and a missed comment only risks a NOISY false positive while a truncated
 * line hides real content silently. So line comments are left alone; block comments
 * (which MDX has via JSX) are removed line-based: a multi-line opener must start its
 * line or follow a JSX `{` (lineage: tests/styles/_classScanUtils.ts R19-R22). */
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
    l = l.replace(/\{?\/\*.*?\*\/\}?/g, ""); // pairs opening and closing on this line
    const open = l.indexOf("/*");
    if (open !== -1 && /^\{?$/.test(l.slice(0, open).trim())) {
      inBlock = true;
      l = l.slice(0, open);
    }
    out.push(l);
  }
  return out.join("\n");
}

/* SQL: `--` to EOL and nestable block comments, outside single-quoted strings.
 * Dollar-quote DELIMITERS (tagged or untagged) are transparent — span contents are SQL
 * code per spec §1.1; single-quoted strings inside them stay protected. Blanks with
 * spaces, preserving offsets/newlines (B1's `.search()` ordering depends on it). */
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
        if (src[i] === "'" && src[i + 1] === "'") {
          i += 2; // '' escape
        } else if (src[i] === "'") {
          i += 1;
          break;
        } else {
          i += 1;
        }
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
 *  unexpected file type decides explicitly instead of silently getting the wrong
 *  grammar (spec §3). */
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

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/_shared/stripComments.test.ts` → PASS. Also `pnpm exec tsc --noEmit` scoped typecheck (strict flags) if the repo exposes it; otherwise rely on vitest's transform + `pnpm lint` if configured.

- [ ] **Step 5: Commit** — `test(infra): add shared stripComments module with self-test`

### Task 2: Single-source meta-test

**Files:**
- Create: `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`

**Interfaces:**
- Consumes: `stripCommentsForFile` from Task 1.
- Produces: `PENDING_MIGRATIONS` array (drained by Tasks 3–46) and `STANDING_ALLOWLIST` (permanent).

- [ ] **Step 1: Write the meta-test (negative-proof describe first — red until the detector exists, then green):**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

const ROOT = process.cwd();
const TESTS_DIR = join(ROOT, "tests");
const SHARED_MODULE = "tests/_shared/stripComments.ts";
const SELF = "tests/cross-cutting/_metaStripCommentsSingleSource.test.ts";

/** Permanent rows — different grammar, comment-READERS, documented designs, detector
 *  false positives. Spec §2 Tier D1/E5–E10/E12. Every row carries its reason. */
const STANDING_ALLOWLIST: { file: string; reason: string }[] = [
  { file: "tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts", reason: "D1: YAML # stripper — different grammar, quote-aware, block-safe" },
  { file: "tests/cross-cutting/vitest-projects-partition.test.ts", reason: "E5: YAML # line filter" },
  { file: "tests/cross-cutting/unit-suite-shard-topology.test.ts", reason: "E6: YAML # directives filter" },
  { file: "tests/cross-cutting/db-test-connection-hygiene.test.ts", reason: "E7: documented loud-error trailing-comment design (its lines 110-114)" },
  { file: "tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts", reason: "E8: loop-integrated SQL doc-line skips" },
  { file: "tests/log/mutationSurface/exemptions.ts", reason: "E9: comment-READER — searches leading comments for no-telemetry marker" },
  { file: "tests/drive/loadLocalEnv.ts", reason: "E10: dotenv # grammar" },
  { file: "tests/auth/oauth-flow.test.ts", reason: "E12: startsWith(\"//\") is a protocol-relative-URL assertion, not comment handling" },
];

/** Migration-window scaffold: one row per not-yet-migrated spec §2 row file. A
 *  migration commit deletes ALL of its file's rows FIRST (meta-test red), then
 *  migrates (green). Task 47 removes the emptied constant. */
const PENDING_MIGRATIONS: string[] = [
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

/** Five detector families (spec §4), run on comment-STRIPPED source so comment TEXT
 *  mentioning an idiom cannot false-positive. */
export function detectCommentIdioms(strippedSrc: string): string[] {
  const hits: string[] = [];
  // 1. Block-comment regex literals — [\s\S], [^], and .*? spellings.
  if (/\\\/\\\*(\[\\s\\S\]|\[\^\]|\.)\*\?/.test(strippedSrc)) hits.push("block-regex-literal");
  // 2. Line-comment replace idioms — // or -- to EOL inside .replace(/.../).
  if (/\.replace\(\s*\/(\\\/\\\/|--)/.test(strippedSrc)) hits.push("line-replace-idiom");
  // 3. Two-char scanner literals.
  if (/["'`](\/\/|\/\*|\*\/)["'`]/.test(strippedSrc)) hits.push("two-char-literal");
  // 4. Line-start skip filters — startsWith with a marker, or bare marker-skip regexes.
  if (/startsWith\(\s*["'`](\/\/|--|#|\/\*|\*)["'`]\s*\)/.test(strippedSrc)) hits.push("startswith-filter");
  if (/\/\^\\s\*(--|#|\\\/\\\/)\/[gmiy]*/.test(strippedSrc)) hits.push("marker-skip-regex");
  // 5. Name family (old names stay tripwires even after renames — spec §5.3b).
  if (/\b(function|const)\s+(strip\w*[Cc]omment\w*|commentRanges|stripNonCode|stripCodeNoise|codeOf)\b/.test(strippedSrc))
    hits.push("name-family");
  return hits;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|mts|cts)$/.test(e) ? [p] : [];
  });
}

describe("single-source comment stripping (spec §4)", () => {
  it("no test file implements its own comment handling outside the shared module", () => {
    const standing = new Set(STANDING_ALLOWLIST.map((r) => r.file));
    const pending = new Set(PENDING_MIGRATIONS);
    const offenders: string[] = [];
    for (const abs of walk(TESTS_DIR)) {
      const rel = relative(ROOT, abs);
      if (rel === SHARED_MODULE || rel === SELF) continue;
      if (standing.has(rel) || pending.has(rel)) continue;
      const stripped = stripCommentsForFile(readFileSync(abs, "utf8"), abs);
      const hits = detectCommentIdioms(stripped);
      if (hits.length > 0) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(
      offenders,
      `local comment-handling idioms found — import tests/_shared/stripComments instead, or add a reasoned STANDING_ALLOWLIST row:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the shared module exists and exports the full API", async () => {
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

describe("detector negative proofs (spec §4 plants a–e)", () => {
  it("flags a naive regex stripper", () => {
    const plant = 'function stripComments(s: string) { return s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ""); }';
    expect(detectCommentIdioms(plant).length).toBeGreaterThan(0);
  });
  it("flags a RENAMED char-loop copy (R2 F2 evasion)", () => {
    const plant = 'function removeNoise(s: string) { const two = s.slice(0, 2); if (two === "//") return ""; return s; }';
    expect(detectCommentIdioms(plant)).toContain("two-char-literal");
  });
  it("flags an alternate-spelling inline chain", () => {
    const plant = 'const x = src.replace(/\\/\\*[^]*?\\*\\//g, "");';
    expect(detectCommentIdioms(plant).length).toBeGreaterThan(0);
  });
  it("flags a line-start skip filter", () => {
    const plant = 'const lines = src.split("\\n").filter((l) => !l.trim().startsWith("//"));';
    expect(detectCommentIdioms(plant)).toContain("startswith-filter");
  });
  it("flags a SQL line-comment replace idiom (R3 F1)", () => {
    const plant = 'const y = sql.replace(/--.*$/gm, "");';
    expect(detectCommentIdioms(plant)).toContain("line-replace-idiom");
  });
});
```

Concrete failure modes caught: a NEW hand-rolled stripper in any walked file fails the suite by default; each historically-observed evasion family has a plant proving the detector fires. The walk is filesystem-derived (no named list to go stale).

- [ ] **Step 2: Run** — `pnpm vitest run tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` → PASS (all current copies are pending/standing rows; plants pass). If any walked file trips a family NOT in the §2 inventory, STOP: that is a missed inventory row — add it to `PENDING_MIGRATIONS` + a migration task, and record the addition in the commit body.

- [ ] **Step 3: Commit** — `test(cross-cutting): add single-source stripComments meta-test with migration scaffold`

---

### Canonical migration procedure (referenced as "PROC" by Tasks 3–46)

Every migration task runs these steps with its row's specifics:

1. **Red:** delete the task's file path(s) from `PENDING_MIGRATIONS`. Run the meta-test → expect FAIL naming exactly that file. (Failing-test-first — spec §5.3a.)
2. **Migrate:** apply the task's edit spec. Named strippers become imports; inline idioms become the pre-strip pattern (strip whole input once via `stripCommentsForFile(src, path)` — offsets preserved, extraction logic unchanged). Retained wrappers matching detector family 5 are renamed (spec §5.3b).
3. **Green:** re-run the meta-test → PASS. Run the row's guard file AND every consumer listed in its task → PASS, or triage.
4. **Triage** (spec §5.3d): for each NEW finding, verify against raw source by hand. Trivial → fix in this commit. Non-trivial → BACKLOG row + the guard's allowlist entry citing it (add a minimal allowlist mirroring the guard's nearest sibling if it has none).
5. **Commit:** `test(<area>): migrate <basename> to shared stripComments` (+ triage notes in body).

### Task 3: A1 — canonical source `tests/styles/_newTabScan.ts`

**Files:** Modify `tests/styles/_newTabScan.ts` (delete `LINE_TERMINATORS` def at :45, `commentRanges` at :2747, `stripCommentsSafely` at :2800; import from `../_shared/stripComments`; re-export both for its existing importers). Update every internal call site of `commentRanges(src)`/`stripCommentsSafely(src)` to pass the ScriptKind derived from the file being scanned (`.tsx` → TSX, `.ts` → TS, MDX-compiled output → TSX — locate call sites with `rg -n "commentRanges\(|stripCommentsSafely\(" tests/styles/_newTabScan.ts`, 5 hits).
**Consumers to run:** `pnpm vitest run tests/styles/_metaNewTabAnnouncement.test.ts tests/components/a11y/newTabAnnouncementBehavior.test.tsx`
**Special:** `.ts` inputs previously parsed as TSX may change protected-range maps (spec §8) — inspect any finding delta and record it in the commit body. PROC steps 1–5.

### Task 4: A2 — `tests/styles/_classScanUtils.ts`

**Files:** Modify `tests/styles/_classScanUtils.ts` — delete `stripLineComment` (:33) and the line-based `stripComments` (:60); move MDX logic into shared (already Task 1); reimplement `stripCommentsForFile(src, filePath)` here as a thin re-export of the shared one (its 6 consumers keep their import path), or update all 6 consumers to import shared directly — choose the re-export (smaller diff, single commit).
**Consumers to run:** `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts tests/styles/_metaDoublePrefixColorToken.test.ts tests/styles/_metaBgAccentInventory.test.ts tests/styles/_metaRawAccentText.test.ts tests/components/admin/_metaResolveLabelSingleSource.test.ts tests/admin/_metaAttentionItemsTopology.test.ts`
**Special:** `tests/styles/_metaDoublePrefixColorToken.test.ts` pins the OLD line-based behavior in its self-test block — port those pins onto the shared behavior (they must still pass: the shared stripper satisfies them strictly). PROC steps 1–5.

### Tasks 5–22: A3–A20 (one task per row, PROC each)

Row specifics (Files = the row's file; edit spec per row):

- **Task 5 / A3** `tests/help/_metaServerTimeGuard.test.ts` — delete the ~100-line state machine at :54; `const stripped = stripCommentsForFile(src, filePath)` at its call sites (:219, :343 consumption unchanged — line split survives blanking).
- **Task 6 / A4** `tests/admin/no-inline-email-normalization.test.ts` — local `stripComments` (:41) becomes: filter `canonicalize-exempt:` lines (retained, RENAMED `dropExemptLines` per spec §5.3b), then `stripCommentsForFile`. Corpus includes `lib/sync/attachWarningAnchors.ts` (the R1 F2 poison file) — after migration, run the guard and confirm it still sees that file's canonicalization sites (delta expected: none missed, possibly newly-seen sites → triage).
- **Task 7 / A5** `tests/admin/serverNoClientValueCall.test.ts` — replace def :48 AND the second inline idiom at :59 in the same commit.
- **Task 8 / A6** `tests/messages/_metaAdminAlertProducer.test.ts` — replace def :33. Line-number derivation at :46 becomes CORRECT under blanking (was skewed by deletion) — if reported line numbers in any allowlist/fixture encode the old skew, update them with the correction noted in the commit body.
- **Task 9 / A7** `tests/admin/dev-requires-developer.test.ts` — replace def :32. Verify the 40-char window assertions (:56-62) still pass; if a window truncates due to blanking padding, widen the window (mechanical, note in commit).
- **Task 10 / A8** `tests/help/_metaUiLabelCrosswalk.test.ts` — replace def :262, drop `export`. Corpus includes `.js/.jsx` — router covers.
- **Task 11 / A9** `tests/help/_metaAffordanceMatrixParity.test.ts` — replace def :32 with `stripCommentsForFile` so `.mdx` corpus files get MDX policy (behavior change is the FIX: previously JS line-comment rules ran on MDX).
- **Task 12 / A10** `tests/crew/stageRestrictionThreading.test.ts` — replace def :20.
- **Task 13 / A11** `tests/sync/_livePartitionClassificationContract.test.ts` — replace def :48.
- **Task 14 / A12** `tests/sync/no-direct-drive-folder-env.test.ts` — replace def :8.
- **Task 15 / A13** `tests/components/admin/_metaPopoverViewportSource.test.ts` — replace def :77; the `codeOf` wrapper at :127 delegates to `stripCommentsForFile` and is RENAMED `strippedSourceOf`. Corpus includes `.mts/.cts` — router covers.
- **Task 16 / A14** `tests/components/admin/review/reviewModalShell.test.tsx` — replace def :535; ALSO D2: `animationContexts` (:444) pre-strips its CSS input with `stripCssComments` instead of its own regex.
- **Task 17 / A15** `tests/components/admin/wizard/venueTransitionAudit.test.ts` — replace def :10.
- **Task 18 / A16** `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — delete `stripTsComments` (:72), import shared (`stripCommentsSafely` with TS kind — its input is a workflow-referenced TS spec file). The YAML stripper at :47 STAYS (STANDING_ALLOWLIST row D1 covers this file — note: this file is BOTH a standing row and a pending row until this task; PROC step 1 deletes only the pending row, and the standing row's reason names ONLY the YAML symbol, so the meta-test reds on the remaining TS idiom via family hits — verify red actually fires; if the standing row masks it, narrow the standing row mechanism to require BOTH the file match AND absence of family-1/2 hits, and pin that in the plant tests).
- **Task 19 / A17** `tests/docs/designSevenAEmptyHiddenSites.test.ts` — delete `stripNonCode` (:37), pre-strip via `stripCommentsForFile`. JSX `{/* */}` comments: shared blanking leaves the `{ }` braces — confirm the guard's assertions tolerate empty JSX expressions (raw-source check per PROC step 4 if not).
- **Task 20 / A18** `tests/crew/_metaTileProducerTopology.test.ts` — `codeOf` (:65) delegates to `stripCommentsForFile`, RENAMED `strippedSourceOf`.
- **Task 21 / A19** `tests/messages/_metaCatalogCopyHygiene.test.ts` — `stripCodeNoise` (:164): comment-strip replaces become a shared pre-strip; string-blanking replaces stay; RENAMED `blankStringNoise`.
- **Task 22 / A20** `tests/admin/stagedPageRefScan.ts` — delete local `commentRanges` (:49); import shared, passing its existing parsed `sourceFile` and the kind it already uses. **Consumers:** `pnpm vitest run tests/admin/stagedPageRefScan.test.ts tests/admin/step3DeletionSafety.test.ts`.

### Tasks 23–28: B1–B6 (SQL rows, PROC each)

- **Task 23 / B1** `tests/db/undo-change-lock-order.test.ts` — replace def :16 with shared `stripSqlComments`. `.search()` ordering preserved by blanking.
- **Task 24 / B2** `tests/auth/advisoryLockRpcDeadlock.test.ts` — replace def :10; at each call site pass the file through `stripCommentsForFile(src, file)` (corpus is `.sql` + `.ts` — the router splits correctly; call sites at :81, :166, :186, :209, :218, :272, :316, :367, :384 all have the file path in scope). Lock-topology assertions untouched.
- **Task 25 / B3** `tests/db/_resetRpcSource.ts` — local `stripSqlComments` (:18) deleted; shared import. **Consumers:** `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts tests/db/resetValidationDataDriveKeyedAudit.test.ts tests/db/resetValidationDataFkAudit.test.ts`.
- **Task 26 / B4** `tests/cross-cutting/_canonicalEmailCheckContract.test.ts` — local `stripSqlComments` (:54, line-only) deleted; shared import (adds block-comment + quote handling — strictly safer; corpus includes the tagged-span migrations, §1.1 contract applies).
- **Task 27 / B5** `tests/sync/runScheduledCronSync.holdWrite.test.ts` — inline per-line `--` strip (:127-131) becomes one `stripSqlComments(text)` on the file content before the existing scan.
- **Task 28 / B6** `tests/db/schema.test.ts` — inline per-line `--` strip (:406-410) becomes `stripSqlComments(raw)` then the existing split/trim/filter chain (blanked comment lines trim to empty and are filtered — first-statement assertion unchanged).

### Tasks 29–41: C1–C13 (inline idioms, PROC each, pre-strip pattern)

Each task: replace the cited inline `.replace(...)` chain(s) with a single pre-strip of the input via `stripCommentsForFile(src, <the path already in scope at the call site>)`; downstream extraction unchanged.

- **Task 29 / C1** `tests/components/shared/staleFooter-now-prop.test.ts` :58 + :106 (both in one commit).
- **Task 30 / C2** `tests/admin/attentionExclusionSet.test.ts` :173.
- **Task 31 / C3** `tests/admin/upsertAdminAlert.test.ts` :77 + :111.
- **Task 32 / C4** `tests/components/admin/showpage/statusStrip.test.tsx` :439.
- **Task 33 / C5** `tests/components/admin/showpage/warningsPanelTransitions.test.tsx` :132 + :172.
- **Task 34 / C6** `tests/cross-cutting/no-vestigial-middleware.test.ts` :37.
- **Task 35 / C7** `tests/components/admin/bellRetainsCutCodes.test.tsx` :159.
- **Task 36 / C8** `tests/messages/showScopedCopy.test.ts` :152.
- **Task 37 / C9** `tests/onboarding/finalizeNoDriveExport.test.ts` :17.
- **Task 38 / C10** `tests/admin/dev/filesMembership.test.ts` :83 — pre-strip the WHOLE file first, then the existing `const FILES = [...]` extraction runs on stripped text (offsets preserved).
- **Task 39 / C11** `tests/sync/_phase2ArgsParityContract.test.ts` :75 — same whole-input pre-strip shape.
- **Task 40 / C12** `tests/auth/_metaInfraContract.test.ts` — `braceDelta` (:236-240) loses its inline `//` strip; the FILE content is pre-stripped once (offset-preserving) before line iteration begins. R2 F3's refutation case (`"https://x"` in a try block) becomes correct.
- **Task 41 / C13** `tests/e2e/pendingDiscardReal.layout.spec.ts` :409 — pre-strip the searched source once; the per-line token/context match runs unchanged. Import path `../_shared/stripComments` is plain TS — fine in Playwright specs.

### Task 42: D3 — `tests/components/admin/showpage/shareHubFlashTransitions.test.ts`

`css.indexOf("*/")` comment-skip branch (:62-70) deleted; the CSS input is pre-stripped with `stripCssComments` before the depth counter runs. PROC steps 1–5.

### Tasks 43–46: E1–E4 (line-filter rows, PROC each, pre-strip pattern)

- **Task 43 / E1** `tests/styles/_metaDestructiveConfirm.test.ts` :243-249 — drop the startsWith filter; pre-strip the source input.
- **Task 44 / E2** `tests/cross-cutting/test-fast-deferred.test.ts` :63-68 — drop the filter; pre-strip `vitest.config.ts` content (path literal in scope).
- **Task 45 / E3** `tests/admin/parseAndStage-auth.test.ts` :73-80 — drop the filter; pre-strip, then first non-blank line IS the first executable statement (blanked comments trim empty).
- **Task 46 / E4** `tests/sync/jsonbBoundaryRepresentation.meta.test.ts` — delete `isCommentLine` (:49-52); pre-strip the source before line iteration.

### Task 47: Scaffold removal + close-out

- [ ] **Step 1:** Delete the emptied `PENDING_MIGRATIONS` constant and its filter plumbing from the meta-test (walk + STANDING_ALLOWLIST remain). Run the meta-test → PASS.
- [ ] **Step 2:** Update `BACKLOG.md` row `BL-STRIPCOMMENTS-DUPLICATED-AND-FAIL-OPEN` (BACKLOG.md:904): status → RESOLVED (2026-07-26, this branch), summary of end state (shared module, 45 migrated sites, meta-test), pointer to the spec.
- [ ] **Step 3:** Full suite: `pnpm test` → green. Fix or triage any residue per PROC step 4.
- [ ] **Step 4:** Commit — `test(infra): drain stripComments migration scaffold; resolve BL-STRIPCOMMENTS backlog row`

## Self-review notes (run at plan time)

1. **Spec coverage:** §3 API → Task 1; §4 meta-test + plants → Task 2; §5 procedure → PROC + Tasks 3–46 (every §2 migrating row has exactly one task; keep rows D1/E5–E12 are STANDING_ALLOWLIST rows in Task 2; E11 documentation-only — outside walk); §6 test plan → Task 1 self-test + Task 2 plants + PROC step 3; §7/§8 respected (no scanning-logic changes; pre-strip pattern).
2. **Placeholder scan:** none — every migration task names its file, line, edit shape, and consumers; Task 1/2 carry full code.
3. **Type consistency:** `stripCommentsForFile(src, filePath)` signature identical across Tasks 1, 2, and all migration tasks; `detectCommentIdioms` used only within Task 2's file.
4. **Snippet typecheck:** Task 1/2 code written against `noUncheckedIndexedAccess` (`?? ""` guards on all index reads; `out[i]` writes bounds-safe); verified by running the files, not just reading them (PROC/Task steps run vitest per file).
5. **Known risk carried forward:** Task 18's standing-vs-pending interplay is called out inside the task with a verification step and a fallback design.
