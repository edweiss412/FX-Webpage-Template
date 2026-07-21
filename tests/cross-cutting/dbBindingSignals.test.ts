// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hasDbBindingSignal } from "@/lib/test/dbBindingSignals";

// Anti-tautology (reclassification spec §3.2, plan Task 3 Codex R3): the static
// guard over the 533-file allowlist only proves those files return false. A
// matcher that ALWAYS returned false would pass that guard. These table-driven
// cases pin the actual signal vocabulary — positives MUST flag, negatives must
// NOT — so the matcher can't silently become a no-op.
const POSITIVE: [string, string, string][] = [
  ["driver from-import", "a.test.ts", `import postgres from "postgres";`],
  ["driver require", "a.test.ts", `const p = require("postgres");`],
  ["driver dynamic import", "a.test.ts", `await import("postgres");`],
  ["DATABASE_URL dotted", "a.test.ts", `const u = process.env.TEST_DATABASE_URL;`],
  ["DATABASE_URL bracket", "a.test.ts", `const u = process.env["VALIDATION_DATABASE_URL"];`],
  ["postgres() call", "a.test.ts", `const sql = postgres(url);`],
  ["local pg url literal", "a.test.ts", `const u = "127.0.0.1:54322";`],
  ["http local pg url (Codex mech-1)", "a.test.ts", `const u = "http://127.0.0.1:54321";`],
  [
    "postgresql:// connection string (Codex mech-1)",
    "a.test.ts",
    `const u = "postgresql://postgres@127.0.0.1:54322/postgres";`,
  ],
  [
    "child_process node: + token",
    "a.test.ts",
    `import { execFileSync } from "node:child_process"; execFileSync("psql", []);`,
  ],
  [
    "child_process bare + token",
    "a.test.ts",
    `import { execFileSync } from "child_process"; run("psql");`,
  ],
  [
    "child_process/promises + token",
    "a.test.ts",
    `import { execFile } from "node:child_process/promises"; run("psql");`,
  ],
  ["db filename", "x.db.test.ts", `export {};`],
  ["real-db filename", "foo.real-db.test.ts", `export {};`],
];

const NEGATIVE: [string, string, string][] = [
  ["pure unit test", "a.test.ts", `import { render } from "@testing-library/react";`],
  ["mocked supabase, no driver", "a.test.ts", `vi.mock("@/lib/supabase/server"); createClient();`],
  ["non-DB port in an assertion string", "a.test.ts", `expect(row).toEqual(["127.0.0.1:9999"]);`],
  [
    "child_process WITHOUT a db token",
    "a.test.ts",
    `import { spawn } from "node:child_process"; spawn("git", ["log"]);`,
  ],
  [
    "DATABASE_URL only inside a comment",
    "a.test.ts",
    `// process.env.TEST_DATABASE_URL read elsewhere\nexport {};`,
  ],
];

describe("hasDbBindingSignal", () => {
  it.each(POSITIVE)("flags %s", (_n, p, src) => expect(hasDbBindingSignal(p, src)).toBe(true));
  it.each(NEGATIVE)("does NOT flag %s", (_n, p, src) =>
    expect(hasDbBindingSignal(p, src)).toBe(false),
  );
});
