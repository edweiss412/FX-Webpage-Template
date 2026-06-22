import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 0.A close-out finding (2026-05-27): a vestigial `middleware.ts` left
 * over from commit 05ecf7e (M11.5 G3 cutover — `refactor(auth): delete legacy
 * signed-link surfaces`) broke every production route with
 * `ReferenceError: __dirname is not defined`. Next 16 deprecated `middleware.ts`
 * (https://nextjs.org/docs/messages/middleware-to-proxy) and the deprecated
 * file's Edge Runtime wrapper references `__dirname`, which doesn't exist in
 * the V8 isolate. The `export const runtime = "nodejs"` opt-in inside the file
 * was not honored. Deletion eliminates the broken wrapper.
 *
 * This structural defense prevents a future refactor from accidentally
 * re-introducing a vestigial no-op middleware/proxy file at the repo root.
 *
 * Contract: at the repo root, neither `middleware.ts` nor `proxy.ts` may exist
 * as a no-op pass-through. If a real middleware/proxy is needed in the future,
 * it must contain non-trivial logic (i.e. not just `return NextResponse.next()`
 * with nothing else). The "no-op pass-through" heuristic: file body (sans
 * comments + blank lines + imports + export-const-runtime lines) must include
 * at least one statement beyond `return NextResponse.next();` — e.g. a
 * conditional, a cookie inspection, a header rewrite.
 *
 * Self-exclusion: this test file mentions the literals "middleware" and
 * "proxy" for pattern definition; it lives under tests/cross-cutting/ which
 * never ships to Vercel and never participates in the Edge wrapper chain.
 */

const REPO_ROOT = process.cwd();
const CANDIDATE_FILES = ["middleware.ts", "middleware.js", "proxy.ts", "proxy.js"] as const;

function isNoOpPassThrough(source: string): boolean {
  // Strip block comments, line comments, blank lines, imports, runtime-config exports.
  // What remains is the "real" body.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("//"))
    .filter((line) => !line.startsWith("import "))
    .filter((line) => !/^export\s+const\s+runtime\s*=/.test(line))
    .filter((line) => !/^export\s+const\s+config\s*=/.test(line))
    .filter((line) => !/^export\s+function\s+(middleware|proxy)\s*\(/.test(line))
    .filter((line) => line !== "}")
    .filter((line) => line !== "{");

  // After stripping the wrapper, look for "real work": anything beyond a single
  // `return NextResponse.next();` (or its variants).
  const realWork = stripped.filter(
    (line) => !/^return\s+NextResponse\.next\s*\(\s*\)\s*;?\s*$/.test(line),
  );

  return realWork.length === 0;
}

describe("Phase 0.A: no vestigial middleware/proxy at repo root (Next 16 Edge wrapper finding)", () => {
  test("no middleware.ts/proxy.ts at repo root, OR if present, not a no-op pass-through", () => {
    const offenders: string[] = [];

    for (const filename of CANDIDATE_FILES) {
      const filePath = join(REPO_ROOT, filename);
      if (!existsSync(filePath)) continue;

      const content = readFileSync(filePath, "utf8");
      if (isNoOpPassThrough(content)) {
        offenders.push(
          `${filename} exists at repo root and is a no-op pass-through (Next 16 Edge wrapper around such a file caused production 500s on every route — see Phase 0.A finding 2026-05-27). Either delete the file or add real middleware/proxy logic.`,
        );
      }
    }

    if (offenders.length > 0) {
      throw new Error(`Vestigial middleware/proxy file(s) detected:\n${offenders.join("\n")}`);
    }
    expect(offenders).toEqual([]);
  });

  test("anti-tautology: heuristic correctly identifies a no-op pass-through fixture", () => {
    const noOpFixture = `
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next();
}
`;
    expect(isNoOpPassThrough(noOpFixture)).toBe(true);

    const realWorkFixture = `
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.get("session")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}
`;
    expect(isNoOpPassThrough(realWorkFixture)).toBe(false);
  });
});
