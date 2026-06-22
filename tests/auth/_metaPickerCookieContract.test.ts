import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const COOKIE_MUTATOR_ALLOWLIST = new Set([
  "lib/auth/picker/selectIdentity.ts",
  "lib/auth/picker/clearIdentity.ts",
  "lib/auth/picker/cleanupStaleEntry.ts",
  "app/api/auth/picker-bootstrap/route.ts",
  "app/auth/sign-out/route.ts",
]);

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, ent);
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(rel)) out.push(rel);
  }
  return out;
}

describe("META picker cookie contract", () => {
  test("timestamp ceiling is Number.MAX_SAFE_INTEGER, not a Unix-seconds cap", () => {
    expect(read("lib/auth/picker/cookieEnvelope.ts")).toMatch(
      /MAX_SAFE_T_MILLIS\s*=\s*Number\.MAX_SAFE_INTEGER/,
    );
  });

  test("show selection keys and crew ids are UUID-shaped", () => {
    const src = read("lib/auth/picker/cookieEnvelope.ts");
    expect(src).toMatch(/UUID_RE\s*=\s*\/\^\[0-9a-f\]\{8\}/);
    expect(src).toMatch(/!UUID_RE\.test\(showId\)/);
    expect(src).toMatch(/!UUID_RE\.test\(entry\.id\)/);
  });

  test("HMAC signature verification uses timingSafeEqual", () => {
    const src = read("lib/auth/picker/cookieEnvelope.ts");
    expect(src).toMatch(/createHmac\("sha256"/);
    expect(src).toMatch(/timingSafeEqual/);
  });

  test("only the five approved surfaces mutate the picker cookie", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("lib")];
    const offenders: string[] = [];
    for (const file of files) {
      const src = read(file);
      if (!/__Host-fxav_picker|COOKIE_NAME|encodePickerCookie/.test(src)) continue;
      if (/\.cookies\.set\(COOKIE_NAME|cookieStore\.set\(COOKIE_NAME|Set-Cookie/.test(src)) {
        const rel = relative(ROOT, join(ROOT, file));
        if (!COOKIE_MUTATOR_ALLOWLIST.has(rel)) offenders.push(rel);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});
