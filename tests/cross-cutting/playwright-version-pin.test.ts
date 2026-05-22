import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PACKAGE_JSON_PATH = join(ROOT, "package.json");
const DRIFT_WORKFLOW_PATH = join(ROOT, ".github", "workflows", "screenshots-drift.yml");

type Semver = {
  raw: string;
  major: number;
  minor: number;
  patch: number;
};

function parseSemver(raw: string, source: string): Semver {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match) {
    throw new Error(`${source} does not contain a parseable semver: ${raw}`);
  }

  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function playwrightPackageVersion(): Semver {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const version =
    packageJson.devDependencies?.["@playwright/test"] ??
    packageJson.dependencies?.["@playwright/test"];

  if (!version) {
    throw new Error("package.json is missing @playwright/test");
  }

  return parseSemver(version, "package.json @playwright/test");
}

function driftWorkflowDockerVersion(): Semver {
  const workflow = readFileSync(DRIFT_WORKFLOW_PATH, "utf8");
  const match =
    /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-jammy/.exec(workflow);

  if (!match) {
    throw new Error(
      "screenshots drift workflow is missing mcr.microsoft.com/playwright:vN.M.K-jammy",
    );
  }

  return parseSemver(match[1] ?? "", "screenshots drift workflow Docker tag");
}

describe("Playwright package and screenshot drift Docker image stay minor-version pinned", () => {
  it("uses the same Playwright major.minor in package.json and the drift workflow image", () => {
    const packageVersion = playwrightPackageVersion();
    const dockerVersion = driftWorkflowDockerVersion();
    const packageMinor = `${packageVersion.major}.${packageVersion.minor}`;
    const dockerMinor = `${dockerVersion.major}.${dockerVersion.minor}`;

    expect(
      dockerMinor,
      `Playwright version skew: package.json says ${packageVersion.raw}, drift workflow uses v${dockerVersion.raw}-jammy`,
    ).toBe(packageMinor);
  });
});
