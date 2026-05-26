import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = process.cwd();
const EXPLICIT_TEST_PATH_RE =
  /(?:^|\s)(?:"([^"]+\.test\.tsx?)"|'([^']+\.test\.tsx?)'|`([^`]+\.test\.tsx?)`|([^\s"'`]+\.test\.tsx?))(?=\s|$)/g;
const AUDIT_SCRIPT_SYMBOLS: Record<string, readonly string[]> = {
  "test:audit:x1-catalog-parity": ["MESSAGE_CATALOG", "SPEC_CODES"],
  "test:audit:x2-no-raw-codes": ["auditNoRawCodesInSourceFiles"],
  "test:audit:x3-trust-domain": ["auditProjectAuthChains", "auditAuthSource"],
  "test:audit:x4-no-global-cursor": ["auditProjectNoGlobalCursor"],
  "test:audit:x5-email-canonicalization": [
    "auditEmailCanonicalizationSources",
    "auditLiveEmailCanonicalization",
  ],
  "test:audit:traceability": ["auditTraceability"],
  "test:audit:branch-protection": ["verifyBranchProtection"],
};

function explicitVitestTestPaths(script: string): string[] {
  if (!/\bvitest\b/.test(script)) return [];
  return [...script.matchAll(EXPLICIT_TEST_PATH_RE)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4])
    .filter((path): path is string => Boolean(path))
    .filter((path) => !path.includes("*"));
}

describe("package.json vitest script targets", () => {
  test.each([
    ["vitest run tests/x.test.ts"],
    ['vitest run "tests/x.test.ts"'],
    ["vitest run 'tests/x.test.ts'"],
    ["vitest run `tests/x.test.ts`"],
    ["vitest --run tests/x.test.ts"],
    ["DEBUG=1 vitest run tests/x.test.ts"],
  ])("extracts explicit test-file target from %s", (script) => {
    expect(explicitVitestTestPaths(script)).toEqual(["tests/x.test.ts"]);
  });

  test("explicit test-file targets exist", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const missing = Object.entries(packageJson.scripts ?? {}).flatMap(([scriptName, script]) =>
      explicitVitestTestPaths(script).flatMap((target) =>
        existsSync(join(repoRoot, target)) ? [] : [`${scriptName}: ${target}`],
      ),
    );

    expect(missing).toEqual([]);
  });

  test("named audit scripts invoke their audit entrypoints", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const missing = Object.entries(AUDIT_SCRIPT_SYMBOLS).flatMap(([scriptName, symbols]) => {
      const script = packageJson.scripts?.[scriptName];
      if (!script) return [`${scriptName}: missing script`];
      const targetSource = explicitVitestTestPaths(script)
        .filter((target) => existsSync(join(repoRoot, target)))
        .map((target) => readFileSync(join(repoRoot, target), "utf8"))
        .join("\n");
      return symbols.some((symbol) => new RegExp(String.raw`\b${symbol}\b`).test(targetSource))
        ? []
        : [`${scriptName}: missing ${symbols.join(" or ")}`];
    });

    expect(missing).toEqual([]);
  });
});
