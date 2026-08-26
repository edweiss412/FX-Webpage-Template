/**
 * tests/supabase/_metaServerClientObserverCoverage.test.ts — Task 2.
 *
 * The transport observer is only as complete as the set of clients it is installed on, and
 * enumerating that set once is worthless: the next server-side client somebody constructs by hand
 * is unobserved, and nothing notices. So the coverage is WALKED from disk rather than listed, and
 * a new direct construction fails by default.
 *
 * Two properties the scanner needs, and both are why it strips before matching:
 *
 *   A CALL is not a MENTION. `lib/observe/query/events.ts` and `lib/validation/reseedFixtures.ts`
 *   both name `createClient()` inside comments about types. A bare grep flags them, and a guard
 *   that is noise from its first run gets suppressed rather than fixed.
 *
 *   A BINDING is not a NAME. `createClient` counts only when it was imported from
 *   `@supabase/supabase-js` or `@supabase/ssr` in that same file, so a same-named local helper is
 *   never claimed.
 *
 * not-subject-to-meta: a structural guard over source text; it makes no Supabase call.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { premise } from "../_shared/premise";
import { stripCommentsForFile } from "../_shared/stripComments";
import { PRODUCT_SOURCE_EXTENSION } from "./retryableRpcVolatilityScan";

const ROOT = process.cwd();
const ROOTS = ["app", "lib", "components"];
const SUPABASE_PKG = /@supabase\/(?:supabase-js|ssr)/;
const CONSTRUCTORS = ["createClient", "createServerClient", "createBrowserClient"] as const;

/**
 * The three factories. Every other construction must be an exemption below.
 *
 * `browser.ts` is sanctioned and NOT observed: the observer's record is a server log line, and a
 * browser client cannot reach one.
 */
const FACTORIES: Record<string, number> = {
  // path -> how many constructions the file may contain. A COUNT rather than a membership test,
  // because membership cannot distinguish the two sanctioned factories in server.ts from a third
  // one added beside them.
  "lib/supabase/server.ts": 2,
  "lib/supabase/browser.ts": 1,
  // Observed, not exempt. It was exempted as "not a request path" and round-4 review showed the
  // ground was FALSE: two server actions in app/admin/dev/actions.ts construct it per request.
  // An exemption is only ever as good as the sentence justifying it, and this one was wrong.
  "lib/dev/materialize/client.ts": 1,
};

/**
 * Exempt constructions, each with the ground it is exempt ON. A path alone would let the reason
 * rot away from the row.
 */
const EXEMPT: Record<string, { count: number; ground: string }> = {
  "app/api/test-auth/set-session/route.ts": {
    count: 2,
    // VERIFIED 2026-08-26, not assumed. Round 4 showed the sibling exemption's ground was simply
    // false, so this one was re-read rather than trusted: gate 1 of the route returns 404 unless
    // ENABLE_TEST_AUTH is the literal string "true", and production builds never set it. An
    // exemption is only ever as good as the sentence justifying it.
    ground: "test-auth gated (ENABLE_TEST_AUTH + bearer); never a production request path",
  },
};

/**
 * Comments and string literals blanked, so a MENTION of a call is never read as one.
 *
 * Comment handling is NOT local: it goes through the one shared stripper, which lexes
 * with the TypeScript scanner and so gets the cases a regex silently loses -- a `//`
 * inside a string, a `/*` inside a regex literal. The local half is string-literal
 * blanking, which is a different question and no part of the single source.
 *
 * Every replacement preserves length AND newlines, because the caller derives a 1-based
 * line number from the match offset. Collapsing a multi-line template to spaces would
 * keep the offsets and still report the wrong line.
 */
export function blankNonCode(src: string, filePath: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  // Each replacement is written as an arrow AT THE CALL SITE rather than passing `blank`
  // directly. tests/cross-cutting/replacementString.test.ts accepts a string literal, a
  // no-substitution template, or a function written inline, and refuses a bare identifier --
  // because an identifier can just as easily name a string carrying `$&` or `$1`, which
  // substitutes silently. The judge cannot resolve the binding, so it fails closed, correctly.
  // Do not shorten these back to `blank`.
  return stripCommentsForFile(src, filePath)
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => blank(m))
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => blank(m))
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => blank(m));
}

/** Constructor names this file imported from a Supabase package, statically OR dynamically. */
export function supabaseBindings(src: string): Set<string> {
  const bound = new Set<string>();
  const add = (names: string) => {
    for (const part of names.split(",")) {
      const n = part.split(" as ").pop()?.split(":").pop()?.trim();
      if (n) bound.add(n);
    }
  };
  for (const m of src.matchAll(
    /import\s*\{([^{}]*)\}\s*from\s*["']@supabase\/(?:supabase-js|ssr)["']/g,
  )) {
    const names = m[1];
    if (names !== undefined) add(names);
  }
  // `[^{}]*` and not `[^}]*`: the looser class starts the match at the enclosing FUNCTION's
  // opening brace and captures `\n  const { createClient ` as the binding list, which then names
  // nothing. Caught by the dynamic-form control below rather than by reading.
  for (const m of src.matchAll(
    /\{([^{}]*)\}\s*=\s*await\s+import\(\s*["']@supabase\/(?:supabase-js|ssr)["']\s*\)/g,
  )) {
    const names = m[1];
    if (names !== undefined) add(names);
  }
  return bound;
}

export function scanConstructions(root: string, roots: readonly string[]): string[] {
  const hits: string[] = [];
  for (const file of walkSourceFiles(
    roots.map((r) => join(root, r)),
    { extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".mdx"] },
  )) {
    if (file.includes("node_modules")) continue;
    if (!PRODUCT_SOURCE_EXTENSION.test(file)) continue;
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
    const raw = readFileSync(file, "utf8");
    if (!SUPABASE_PKG.test(raw)) continue;
    const bound = supabaseBindings(raw);
    const code = blankNonCode(raw, file);
    for (const name of CONSTRUCTORS) {
      if (!bound.has(name)) continue;
      // Every CALL SITE, not the first per file. Round 3 probed why: recording a path and
      // breaking meant a fourth construction added BESIDE an existing one inside
      // lib/supabase/server.ts left the hit set unchanged, so the guard stayed green while a new
      // server client bypassed the observer. That is the exact case AC-3 names, and the original
      // fail-by-default proof missed it because it added a new FILE rather than a new SITE.
      for (const m of code.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))) {
        const line = code.slice(0, m.index).split("\n").length;
        hits.push(`${file.slice(root.length + 1)}:${line}`);
      }
    }
  }
  return [...new Set(hits)].sort();
}

describe("every server-side Supabase client is observed, or exempt on a stated ground", () => {
  it("accounts for every construction SITE, not merely every file", () => {
    const hits = scanConstructions(ROOT, ROOTS);

    // PREMISE, and it executes before anything it guards. An empty or near-empty walk — a wrong
    // root, an extension miss, a stripper that blanked the file — makes every assertion below
    // pass vacuously, which is the exact shape retryableRpcVolatilityScan.ts records.
    premise("construction sites found in the product roots", hits.length, 2);

    const perFile = new Map<string, number>();
    for (const site of hits) {
      const file = site.slice(0, site.lastIndexOf(":"));
      perFile.set(file, (perFile.get(file) ?? 0) + 1);
    }
    for (const f of Object.keys(FACTORIES))
      expect([...perFile.keys()], `the walk must reach the factory ${f}`).toContain(f);

    // A COUNT comparison, so a construction added beside a sanctioned one is UNACCOUNTED rather
    // than absorbed by its file's good name. That was round 3's finding.
    const allowed: Record<string, number> = {
      ...FACTORIES,
      ...Object.fromEntries(Object.entries(EXEMPT).map(([f, e]) => [f, e.count])),
    };
    const unaccounted = [...perFile.entries()]
      .filter(([f, n]) => (allowed[f] ?? 0) !== n)
      .map(([f, n]) => `${f}: ${n} construction(s), ${allowed[f] ?? 0} accounted`);
    expect(
      unaccounted,
      "every Supabase client construction must be a known factory site or carry an exemption",
    ).toEqual([]);
  });

  it("stays silent on the two LIVE comment mentions", () => {
    // Real negative coverage, not a constructed fixture: both files genuinely name
    // `createClient()` in prose about types, and a bare grep flags both.
    const files = scanConstructions(ROOT, ROOTS).map((h) => h.slice(0, h.lastIndexOf(":")));
    expect(files).not.toContain("lib/observe/query/events.ts");
    expect(files).not.toContain("lib/validation/reseedFixtures.ts");
  });
});

describe("the scanner itself (a guard that matches nothing is worse than none)", () => {
  const fixture = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), "obs-cov-"));
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, body);
    }
    return dir;
  };

  it("FIRES on a new static construction (fail-by-default)", () => {
    const dir = fixture({
      "lib/newthing.ts":
        'import { createClient } from "@supabase/supabase-js";\nexport const c = createClient(u, k, {});\n',
    });
    try {
      expect(scanConstructions(dir, ["lib"])).toEqual(["lib/newthing.ts:2"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FIRES on a dynamic import binding", () => {
    // No live instance exists in the product roots today; the dynamic constructions are all under
    // scripts/, which these roots exclude on a stated ground. Covered anyway, because a scanner
    // that fails open on a form the codebase could adopt tomorrow is a scanner nobody can trust.
    const dir = fixture({
      "lib/dyn.ts":
        'export async function make() {\n  const { createClient } = await import("@supabase/supabase-js");\n  return createClient(u, k, {});\n}\n',
    });
    try {
      expect(scanConstructions(dir, ["lib"])).toEqual(["lib/dyn.ts:3"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stays SILENT on a type-only import plus a comment naming the call", () => {
    const dir = fixture({
      "lib/mention.ts":
        '// the untyped `createClient()` in the vendored package\nimport type { SupabaseClient } from "@supabase/supabase-js";\nexport type T = SupabaseClient;\n',
    });
    try {
      expect(scanConstructions(dir, ["lib"])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("claims the CALL and not a string literal naming it", () => {
    // The discriminating control. A stripper that blanked nothing would report this file for the
    // wrong reason and still look correct, because the file also contains a real call.
    const dir = fixture({
      "lib/stringy.ts":
        'import { createClient } from "@supabase/supabase-js";\nexport const doc = "call createClient( to build one";\n',
      "lib/real.ts":
        'import { createClient } from "@supabase/supabase-js";\nexport const c = createClient(u, k, {});\n',
    });
    try {
      expect(scanConstructions(dir, ["lib"])).toEqual(["lib/real.ts:2"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not claim a same-named local helper", () => {
    const dir = fixture({
      "lib/local.ts":
        "// mentions @supabase/supabase-js so the file is scanned at all\nfunction createClient() { return 1; }\nexport const c = createClient();\n",
    });
    try {
      expect(scanConstructions(dir, ["lib"])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
