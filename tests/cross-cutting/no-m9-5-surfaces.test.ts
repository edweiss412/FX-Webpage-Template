import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOTS = ["app", "lib", "components", "tests"];
const ALLOWED_FILES = new Set([
  "tests/cross-cutting/no-m9-5-surfaces.test.ts",
  "tests/db/cutover-drop-m9-5.test.ts",
]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".mdx"]);

const TERMS = [
  "crew_member_auth",
  "link_sessions",
  "revoked_links",
  "bootstrap_nonces",
  "validateLinkSession",
  "validateCrewAssetSession",
  "resolveShowViewer",
  "__Host-fxav_session",
  "__Host-fxav_bootstrap_v",
  "IssueLinkButton",
  "RevokeAllLinksButton",
  "signedLinks",
  "signLinkJwt",
  "verifyLinkJwt",
  "app/api/auth/redeem-link",
  "app/show/[slug]/p/",
  "crew_link",
  "crew_google",
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (ALLOWED_FILES.has(path)) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (path.includes("__snapshots__")) continue;
      out.push(...filesUnder(path));
      continue;
    }
    if (![...EXTENSIONS].some((ext) => path.endsWith(ext))) continue;
    out.push(path);
  }
  return out;
}

describe("M9.5 signed-link surfaces are removed", () => {
  test("app/lib/components/tests carry no legacy signed-link references", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(filesUnder)) {
      const source = readFileSync(file, "utf8");
      for (const term of TERMS) {
        if (source.includes(term)) offenders.push(`${file}: ${term}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
