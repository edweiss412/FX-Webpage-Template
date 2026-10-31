import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = process.cwd();

const DATA_API_CONSUMERS = [
  "app/api/realtime/subscriber-token/route.ts",
  "app/api/asset/diagram/[show]/[rev]/[key]/route.ts",
  "app/api/asset/reel/[show]/route.ts",
  "app/api/asset/agenda/[show]/[id]/route.ts",
  "app/api/show/[slug]/version/route.ts",
  "app/api/show/[slug]/search-miss/route.ts",
  "app/api/report/route.ts",
] as const;

/**
 * The one data API that reaches validateGoogleSession, and only through the page's own
 * identity function: the saved-copy status route exists to answer exactly as the crew page
 * would (spec §4.5), so it consults the Google session the page consults. It must never
 * restate that logic itself, and no other data API may borrow the same path.
 */
const IDENTITY_PARITY_CONSUMER = "app/api/saved-copy/status/route.ts";
const SHARED_IDENTITY_MODULE = "lib/auth/picker/resolveCrewIdentity.ts";

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walkFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    return [path.relative(repoRoot, fullPath)];
  });
}

describe("picker resolver data API callsite contract", () => {
  test("data APIs do not import Google session validators", () => {
    for (const file of DATA_API_CONSUMERS) {
      expect(source(file), file).not.toMatch(/validateGoogleSession/);
    }
  });

  test("the saved-copy status route reaches the Google session only through resolveCrewIdentity", () => {
    const route = source(IDENTITY_PARITY_CONSUMER);
    expect(route).toMatch(
      /import\s*\{[^}]*\bresolveCrewIdentity\b[^}]*\}\s*from\s*"@\/lib\/auth\/picker\/resolveCrewIdentity"/,
    );
    expect(route).not.toMatch(/\.rpc\(/);
    expect(route).not.toMatch(/validateGoogleSession/);
    expect(route).not.toMatch(/resolvePickerSelection/);
    // The consumption is real: the shared module is what calls the Google validator.
    expect(source(SHARED_IDENTITY_MODULE)).toMatch(/\bvalidateGoogleSession\s*\(/);
  });

  test("no other data API reaches the Google session through resolveCrewIdentity", () => {
    const apiFiles = walkFiles(path.join(repoRoot, "app/api"));
    expect(apiFiles, "the walk sees the one sanctioned consumer").toContain(
      IDENTITY_PARITY_CONSUMER,
    );
    const offenders = apiFiles.filter(
      (file) => file !== IDENTITY_PARITY_CONSUMER && source(file).includes("resolveCrewIdentity"),
    );

    expect(offenders).toEqual([]);
  });

  test("resolveShowPageAccess remains page-route only and is not imported by app/api", () => {
    const offenders = walkFiles(path.join(repoRoot, "app/api")).filter((file) =>
      source(file).includes("resolveShowPageAccess"),
    );

    expect(offenders).toEqual([]);
  });

  test("auth_email_canonical RPC stays isolated to resolvePickerSelection", () => {
    const offenders = [
      ...walkFiles(path.join(repoRoot, "app")),
      ...walkFiles(path.join(repoRoot, "components")),
      ...walkFiles(path.join(repoRoot, "lib")),
      ...walkFiles(path.join(repoRoot, "tests")),
    ].filter((file) => {
      if (file === "lib/auth/picker/resolvePickerSelection.ts") return false;
      return /\.rpc\(\s*["']auth_email_canonical/.test(source(file));
    });

    expect(offenders.sort()).toEqual([]);
  });
});
