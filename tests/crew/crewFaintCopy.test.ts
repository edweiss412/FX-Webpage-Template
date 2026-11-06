/**
 * tests/crew/crewFaintCopy.test.ts (crew page redesign PR C, gate repair 8)
 *
 * DESIGN.md §1.1: `text-text-faint` measures 3.35:1, so it is for decoration and
 * divider labels, never crew-actionable copy. The gate found a flight's date and
 * confirmation number, a schedule's weekday and a fact's sub line resting on it, none
 * of them in the diff it was reviewing: a grep of the files in front of you does not
 * find these, because shared code reaches the crew page from other directories.
 *
 * So the census is derived. It walks the import graph from the crew routes and lists
 * every reachable file that paints the class, and this ledger names each one with why
 * it may. A new site on any crew path fails here by default. A row that goes stale
 * fails too: the comparison is exact, in both directions.
 *
 * The defect it catches: a crew-facing value rendered in the faint tone anywhere the
 * crew page can reach, under a sunlit dock's 7:1 floor and AA's 4.5:1 alike.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { premise, premiseHolds } from "@/tests/_shared/premise";

const ROOT = process.cwd();

/** Every route a crew member can land on. */
const CREW_ROUTES = ["app/show", "app/me", "app/auth", "app/layout.tsx"];

const IMPORT = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/** The class, with any variant in front of it, and never `border-text-faint`. */
const FAINT = /(?<![\w-])(?:[a-z-]+:)*text-text-faint(?![\w-])/g;

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function moduleAt(specifier: string, from: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(ROOT, dirname(from), specifier);
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(ROOT, candidate);
  }
  return null;
}

function sourcesUnder(path: string): string[] {
  if (statSync(join(ROOT, path)).isFile()) return [path];
  return readdirSync(join(ROOT, path), { recursive: true, encoding: "utf8" })
    .map((entry) => join(path, entry))
    .filter((entry) => /\.tsx?$/.test(entry));
}

function crewReachable(): Set<string> {
  const seen = new Set<string>();
  const stack = CREW_ROUTES.flatMap(sourcesUnder);
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of readFileSync(join(ROOT, file), "utf8").matchAll(IMPORT)) {
      const next = moduleAt(specifier!, file);
      if (next !== null) stack.push(next);
    }
  }
  return seen;
}

/** Each crew-reachable file that paints the class: how many times, and why it may. */
const LEDGER: Record<string, { count: number; why: string }> = {
  "app/auth/sign-in/page.tsx": { count: 1, why: "divider label" },
  "app/me/meShowSections.tsx": { count: 2, why: "aria-hidden separators" },
  "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx": { count: 1, why: "attribution line" },
  "components/crew/CrewAllSections.tsx": { count: 1, why: "decorative chevron" },
  "components/crew/CrewLoadingSkeleton.tsx": { count: 2, why: "inert labels while loading" },
  "components/crew/search/CrewSearchResults.tsx": { count: 1, why: "decorative chevron" },
  "components/layout/Footer.tsx": { count: 2, why: "aria-hidden separators" },
  "components/layout/Header.tsx": { count: 1, why: "decorative wordmark" },
  "components/shared/CardReportTrigger.tsx": { count: 1, why: "glyph-only control, DESIGN §1.1a" },
  "components/shared/ReportModal.tsx": { count: 1, why: "the admin arm; crew reads subtle" },
  "components/show-panels/EventDetailsBody.tsx": {
    count: 3,
    why: "admin only: a muted sentinel and the chips; crew hides sentinels and draws no chips",
  },
  "components/show-panels/RoomsBody.tsx": {
    count: 1,
    why: "admin only: an empty discipline's glyph; crew drops the row",
  },
  "components/show-panels/TransportBody.tsx": {
    count: 2,
    why: 'admin only: a sentinel sub and the bare rider names; crew hides sentinels and passes riders: "with"',
  },
};

describe("faint text on the crew page's reach", () => {
  const reachable = crewReachable();

  test("the walk reaches the crew page, through shared code too", () => {
    premise("the walk covers a real graph", reachable.size, 300);
    for (const member of [
      "components/crew/sections/TransportSection.tsx",
      "components/crew/primitives/DayCard.tsx",
      "components/show-panels/TransportBody.tsx",
      "components/tiles/OpeningReelVideo.tsx",
    ]) {
      premiseHolds(`the walk reaches ${member}`, reachable.has(member));
    }
  });

  test("every site it finds is decoration, a divider, or never renders for crew", () => {
    const found = Object.fromEntries(
      [...reachable]
        .map((file) => {
          const source = stripComments(readFileSync(join(ROOT, file), "utf8"));
          return [file, source.match(FAINT)?.length ?? 0] as const;
        })
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    const expected = Object.fromEntries(
      Object.entries(LEDGER)
        .map(([file, { count }]) => [file, count] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    expect(found).toEqual(expected);
  });
});
