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

const JWT_CUTOVER_SCAN_ROOTS = ["app", "lib", "components"] as const;
// Top-level files that should be scanned for JWT-cutover strings.
// `middleware.ts` was removed in commit b5999c8 (Phase 0.A finding 2026-05-27)
// after Next 16's Edge wrapper around the post-M11.5-G3 no-op middleware caused
// production 500s. The vestigial-middleware structural defense at
// tests/cross-cutting/no-vestigial-middleware.test.ts prevents reintroducing a
// no-op middleware.ts/proxy.ts; if a real `proxy.ts` is added with JWT-cutover
// scrutiny needed, append it here.
const JWT_CUTOVER_TOP_LEVEL_FILES: readonly string[] = [];
const CUTOVER_MIGRATION_TIMESTAMP = "20260523000099";

export const FORBIDDEN_JWT_CUTOVER_SUBSTRINGS = [
  "LEAKED_LINK_DETECTED",
  "CSRF_DENIED",
  "CSRF_NONCE_EXPIRED",
  "CSRF_KEY_ROTATED",
  "LINK_REVOKED_FLOOR",
  "LINK_REVOKED_SURGICAL",
  "LINK_EXPIRED",
  "LINK_VERSION_MISMATCH",
  "LINK_NO_CREW_MATCH",
  "LINK_SESSION_KEY_ROTATED",
  "LINK_REDEEM_KEY_ROTATED",
  "LINKED_ASSET_DRIFTED",
  "current_token_version",
  "revoked_below_version",
  "max_issued_version",
] as const;

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

function jwtCutoverScanFiles(): string[] {
  return [
    ...JWT_CUTOVER_SCAN_ROOTS.flatMap(filesUnder),
    ...JWT_CUTOVER_TOP_LEVEL_FILES,
  ].filter((file) => /\.(ts|tsx)$/.test(file));
}

function migrationFilesAfterCutover(): string[] {
  return filesUnder("supabase/migrations")
    .filter((file) => /\.sql$/.test(file))
    .filter((file) => {
      const timestamp = file.match(/\/(\d{14})_/)?.[1];
      return timestamp ? timestamp > CUTOVER_MIGRATION_TIMESTAMP : false;
    });
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

  test("M9.5 signed-link and JWT cutover strings stay out of production source", () => {
    const offenders: string[] = [];
    for (const file of [...jwtCutoverScanFiles(), ...migrationFilesAfterCutover()]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const forbidden of FORBIDDEN_JWT_CUTOVER_SUBSTRINGS) {
        if (source.includes(forbidden)) {
          offenders.push(`${file}: ${forbidden}`);
        }
      }
    }

    expect(offenders.sort()).toEqual([]);
  });
});
