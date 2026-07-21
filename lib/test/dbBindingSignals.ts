// DB-binding signals — the SINGLE source of truth for "does this test file reach
// a database", consumed by BOTH the CI static guard
// (tests/cross-cutting/db-free-movable-static-guard.test.ts) AND the regeneration
// sweep (scripts/regen-db-free.mjs). Sharing one constant means the CI tripwire
// can never be narrower than the sweep that built the allowlist (spec §3.2/§3.4,
// Codex spec R2b-2).
//
// It exists because the runtime DB-touch probe under-counts: it hooks THIS
// process's sockets, so a lazy postgres.js pool whose async connect the per-file
// attribution races, or a child `psql`, is invisible (spec §1.1). This static
// scan closes that class deterministically.

// Comments are stripped before matching so a DB reference inside a `//` or `/* */`
// comment does not false-positive (Codex plan R3). The line-comment strip is
// guarded with `(?<!:)` so a URL scheme's `//` is NOT mistaken for a comment —
// otherwise `"postgresql://…@127.0.0.1:54322"` or `"http://127.0.0.1:54321"`
// would lose everything after `//`, erasing the exact local-pg-url / postgres://
// signals this scans for (Codex mech-1).
const stripComments = (s: string): string =>
  s.replace(/(?<!:)\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

type Signal = { name: string; test: (relPath: string, src: string) => boolean };

export const DB_BINDING_SIGNALS: readonly Signal[] = [
  // A `.db.test.ts` / `*real-db*` filename is the repo's explicit "this is a DB
  // integration test" convention.
  { name: "db-filename", test: (p) => /\.db\.test\.tsx?$|real-?db/.test(p) },
  // The postgres.js driver: static `from "postgres"`, `require("postgres")`, or a
  // dynamic `import("postgres")` (Codex plan R3).
  {
    name: "postgres-driver",
    test: (_p, s) =>
      /(?:from|import)\s*\(?\s*["']postgres["']|require\(\s*["']postgres["']\s*\)/.test(s),
  },
  // Any `*DATABASE_URL` env, dotted or bracket form — as wide as the §3.4 sweep,
  // not just TEST_/LOCAL_TEST_ (Codex spec R2b-2, plan R3).
  {
    name: "database-url-env",
    test: (_p, s) =>
      /process\.env\.[A-Z0-9_]*DATABASE_URL|process\.env\[\s*["'][A-Z0-9_]*DATABASE_URL["']\s*\]/.test(
        s,
      ),
  },
  // A `postgres(...)` client construction.
  { name: "postgres-client-call", test: (_p, s) => /\bpostgres\s*\(/.test(s) },
  // A loopback Postgres/PostgREST URL literal (a real local connection target).
  {
    name: "local-pg-url",
    test: (_p, s) => /(?:127\.0\.0\.1|localhost):(?:5432|54321|54322)\b/.test(s),
  },
  // A child process (bare, `node:`, or `/promises` subpath — Codex plan R3) that
  // also names a DB token: the subprocess-psql class the socket probe can't see.
  {
    name: "subprocess-db",
    test: (_p, s) =>
      /(?:from|import)\s*\(?\s*["'](?:node:)?child_process(?:\/promises)?["']|require\(\s*["'](?:node:)?child_process(?:\/promises)?["']\s*\)/.test(
        s,
      ) && /\bpsql\b|databaseUrl|postgres:\/\/|_validation-cleanup-helpers|supabase\s+db/.test(s),
  },
  // A DB access that reaches psql through an IMPORTED helper rather than a direct
  // child_process import — the transitive gap the CI no-DB leg caught on
  // validation-report-fixtures (it calls `runPsql(...)` and imports
  // `_validation-cleanup-helpers`, which themselves shell out). Narrow on purpose:
  // it flags an actual `runPsql(` CALL or an import of the psql-shelling cleanup
  // helper, NOT a test that merely imports (and mocks) a DB-touching lib module.
  {
    name: "db-helper-call",
    test: (_p, s) =>
      /\brunPsql\s*\(/.test(s) ||
      /(?:from|import)\s*\(?\s*["'][^"']*_validation-cleanup-helpers["']/.test(s),
  },
];

/** True when a test file's source shows any DB-binding signal. */
export function hasDbBindingSignal(relPath: string, rawSrc: string): boolean {
  const src = stripComments(rawSrc);
  return DB_BINDING_SIGNALS.some((sig) => sig.test(relPath, src));
}
