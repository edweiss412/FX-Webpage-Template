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
const FACTORIES = new Set(["lib/supabase/server.ts", "lib/supabase/browser.ts"]);

/**
 * Exempt constructions, each with the ground it is exempt ON. A path alone would let the reason
 * rot away from the row.
 */
const EXEMPT: Record<string, string> = {
  "app/api/test-auth/set-session/route.ts":
    "test-auth gated (ENABLE_TEST_AUTH + bearer); never a production request path",
  "lib/dev/materialize/client.ts":
    "a one-line indirection so tests can stub the module; not a request path",
};

/** Comments and string literals blanked, so a MENTION of a call is never read as one. */
export function stripNonCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p: string) => p + " ".repeat(m.length - p.length))
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => " ".repeat(m.length))
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => " ".repeat(m.length));
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
    const code = stripNonCode(raw);
    for (const name of CONSTRUCTORS) {
      if (!bound.has(name)) continue;
      if (new RegExp(`\\b${name}\\s*\\(`).test(code)) {
        hits.push(file.slice(root.length + 1));
        break;
      }
    }
  }
  return [...new Set(hits)].sort();
}

describe("every server-side Supabase client is observed, or exempt on a stated ground", () => {
  it("finds only the factories and the stated exemptions", () => {
    const hits = scanConstructions(ROOT, ROOTS);

    // PREMISE, and it executes before anything it guards. An empty or near-empty walk — a wrong
    // root, an extension miss, a stripper that blanked the file — makes every assertion below
    // pass vacuously, which is the exact shape retryableRpcVolatilityScan.ts records.
    premise("constructions found in the product roots", hits.length, 2);
    for (const f of FACTORIES) expect(hits, `the walk must reach the factory ${f}`).toContain(f);

    const unaccounted = hits.filter((f) => !FACTORIES.has(f) && EXEMPT[f] === undefined);
    expect(
      unaccounted,
      "a new directly-constructed Supabase client must be a factory or carry an exemption",
    ).toEqual([]);
  });

  it("stays silent on the two LIVE comment mentions", () => {
    // Real negative coverage, not a constructed fixture: both files genuinely name
    // `createClient()` in prose about types, and a bare grep flags both.
    const hits = scanConstructions(ROOT, ROOTS);
    expect(hits).not.toContain("lib/observe/query/events.ts");
    expect(hits).not.toContain("lib/validation/reseedFixtures.ts");
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
      expect(scanConstructions(dir, ["lib"])).toEqual(["lib/newthing.ts"]);
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
      expect(scanConstructions(dir, ["lib"])).toEqual(["lib/dyn.ts"]);
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
      expect(scanConstructions(dir, ["lib"])).toEqual(["lib/real.ts"]);
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
