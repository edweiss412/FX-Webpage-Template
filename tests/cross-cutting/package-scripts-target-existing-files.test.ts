import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = process.cwd();
const EXPLICIT_TEST_PATH_RE = /(?:^|\s)([^\s"'`]+\.test\.tsx?)(?=\s|$)/g;

function explicitVitestTestPaths(script: string): string[] {
  if (!/\bvitest\b/.test(script)) return [];
  return [...script.matchAll(EXPLICIT_TEST_PATH_RE)]
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path))
    .filter((path) => !path.includes("*"));
}

describe("package.json vitest script targets", () => {
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
});
