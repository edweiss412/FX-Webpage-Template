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

/**
 * Declared CLIENT ISLANDS living in these trees.
 *
 * The contract this file enforces is about what <WrappedSection> INVOKES:
 * `render()` calls the section function inside its try/catch, so that function
 * must be synchronous and server-side. An island is never invoked that way — a
 * server primitive renders it as an ELEMENT child, React mounts it on the
 * client, and no throw of its can reach the wrapper's call frame. Applying the
 * server-only assertions to one would be asserting the wrong premise, so a row
 * here exempts a file from the `use client` and `await` checks ONLY.
 *
 * Everything else still applies: an island may not import throwable server
 * infrastructure either (asserted below, not assumed), and a row that names a
 * file which is NOT actually a client island fails — so the registry cannot rot
 * into a blanket hole the way a skip list would.
 *
 * Adding a row is a deliberate act with a reason, recorded next to it:
 *   - CopyFactValue.tsx — the Wi-Fi password copy control
 *     (docs/superpowers/specs/2026-08-10-wifi-password-legibility.md §4.0). It
 *     is the smallest possible island so FactRows and VenueSection stay server
 *     components; it awaits `navigator.clipboard.writeText`, which is a browser
 *     API call in an event handler, not data fetching in a render path.
 */
const CLIENT_ISLANDS = new Set<string>([
  join("components", "crew", "primitives", "CopyFactValue.tsx"),
]);

/** Files subject to the server-component assertions (everything not declared). */
function listServerFiles(): string[] {
  return listSectionFiles().filter((f) => !CLIENT_ISLANDS.has(f));
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

  test.each(Array.from(CLIENT_ISLANDS))(
    "%s is a real client island, so its exemption is not a hole",
    (file) => {
      // A row naming a server file would silently exempt it from every
      // assertion above. The registry only ever exempts what it can prove.
      expect(existsSync(file), `${file} is registered as a client island but does not exist`).toBe(
        true,
      );
      const source = readFileSync(file, "utf8");
      expect(
        /^\s*["']use client["']/m.test(source),
        `${file} is registered as a client island but declares no 'use client'`,
      ).toBe(true);
    },
  );

  test.each(listServerFiles())(
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

  test.each(listServerFiles())("%s is not a client component (no 'use client')", (file) => {
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
