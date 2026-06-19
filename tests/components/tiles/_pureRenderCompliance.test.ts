/**
 * tests/components/tiles/_pureRenderCompliance.test.ts (crew-redesign retarget
 * of M9 Task 9.2 — §12.1)
 *
 * Static-analysis assertion for the pure-render contract that <WrappedSection>
 * (the crew-redesign successor to <TileServerFallback>) depends on. Each crew
 * section + primitive is a SYNCHRONOUS Server Component that <WrappedSection>
 * INVOKES via `render()` inside its try/catch — React then calls the returned
 * element's component function LATER, outside the wrapper's try/catch. So any
 * `await` in the render body, or any import from throwing infrastructure
 * (lib/db, lib/drive, lib/sync, lib/supabase server clients), would let a
 * synchronous throw escape to the route-level error boundary and defeat the
 * per-section fallback guarantee.
 *
 * RETARGET NOTE: the deleted M4 tiles used a `*TileView` alias + `load*Data`
 * loader split so <TileServerFallback> could separate the pure view from the
 * throwable loader. The crew sections DON'T use that split — they receive an
 * already-resolved `ShowForViewer` projection as a prop and render
 * synchronously, with the throwable transform wrapped INSIDE <WrappedSection>'s
 * `render` callback. So this retarget KEEPS the substantive purity assertions
 * (no forbidden infra imports, no `await` / direct Supabase client construction
 * in the render path) and DROPS the tile-only `*TileView` / `load*Data` alias
 * assertions, which no longer apply.
 *
 * The static analysis is a regex sweep — sufficient for the common mistakes the
 * plan calls out. Future polish can swap for an AST pass.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Crew section + primitive trees (the new homes of the deleted tiles).
const CREW_DIRS = [
  join("components", "crew", "sections"),
  join("components", "crew", "primitives"),
];

/** Recursively collect `.tsx` files under `dir` (repo-relative). [] if absent. */
function walkTsx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkTsx(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function listSectionFiles(): string[] {
  return CREW_DIRS.flatMap((d) => walkTsx(d)).sort();
}

// Forbidden import paths — any module that can throw on data fetch. A section
// receives a pre-resolved projection; it must never reach into these.
const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/db\b/, //              DB calls — must live in the loader
  /from\s+["']@\/lib\/drive\b/, //           Drive API calls
  /from\s+["']@\/lib\/sync\b/, //            sync engine internals
  /from\s+["']@\/lib\/supabase\/server\b/, // Supabase service client
];

// Forbidden call-site patterns — async work / direct client construction in the
// synchronous render path.
const FORBIDDEN_CALL_PATTERNS = [
  /\bawait\b/, //                            async work in the render path
  /\bcreateSupabaseServiceRoleClient\(/, //  direct Supabase client construction
  /\bcreateSupabaseServerClient\(/, //       ditto
];

describe("META crew section/primitive pure-render compliance", () => {
  const files = listSectionFiles();

  test("the walk reaches the crew section + primitive trees (sanity)", () => {
    // If this fails, the directories moved or the walk regressed to empty —
    // which would let an impure section slip through with green CI.
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files.some((f) => f.includes(join("crew", "sections")))).toBe(true);
    expect(files.some((f) => f.includes(join("crew", "primitives")))).toBe(true);
  });

  test.each(listSectionFiles())("%s has no forbidden infra imports", (file) => {
    const source = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(
        pattern.test(source),
        `${file} imports forbidden module matching ${pattern} — a section must receive a resolved projection, not fetch`,
      ).toBe(false);
    }
  });

  test.each(listSectionFiles())(
    "%s render path has no await / direct Supabase client construction",
    (file) => {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_CALL_PATTERNS) {
        expect(
          pattern.test(source),
          `${file} contains forbidden pattern ${pattern} in the synchronous render path`,
        ).toBe(false);
      }
    },
  );

  test.each(listSectionFiles())("%s is not a client component (no 'use client')", (file) => {
    // A section/primitive that <WrappedSection> direct-invokes must be a Server
    // Component — a 'use client' directive would change the invocation contract
    // (the throwable transform must run synchronously inside the wrapper).
    const source = readFileSync(file, "utf8");
    expect(
      /^\s*["']use client["']/m.test(source),
      `${file} declares 'use client' — sections/primitives in the WrappedSection render path must be Server Components`,
    ).toBe(false);
  });
});
