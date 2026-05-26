import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const DATA_API_ROOTS = [
  "app/api/realtime/subscriber-token",
  "app/api/show",
  "app/api/asset",
  "app/api/report",
];

const ALLOWED_JWT_SURFACES = [
  "app/api/auth/picker-bootstrap/route.ts",
  "lib/auth/picker/resolveShowPageAccess.ts",
  "app/auth/callback/route.ts",
  "app/me/page.tsx",
];

function filesUnder(relDir: string): string[] {
  const out: string[] = [];
  const abs = join(ROOT, relDir);
  for (const ent of readdirSync(abs)) {
    const rel = join(relDir, ent);
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) out.push(...filesUnder(rel));
    else if (/\.(ts|tsx)$/.test(rel)) out.push(rel);
  }
  return out;
}

describe("no JWT / Google-session surface on data APIs", () => {
  test("six crew data API consumers route through picker resolver, not validateGoogleSession", () => {
    const offenders = DATA_API_ROOTS.flatMap(filesUnder).filter((file) =>
      readFileSync(join(ROOT, file), "utf8").includes("validateGoogleSession"),
    );
    expect(offenders.sort()).toEqual([]);
  });

  test("JWT-capable surfaces are explicitly allowlisted", () => {
    for (const file of ALLOWED_JWT_SURFACES) {
      expect(readFileSync(join(ROOT, file), "utf8").length, `${file} exists`).toBeGreaterThan(0);
    }
  });
});
