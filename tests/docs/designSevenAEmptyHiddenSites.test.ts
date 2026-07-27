/**
 * DESIGN.md §7a's "Current sites" list must name every component that carries
 * `empty:hidden`.
 *
 * §7a is the ratified rule for empty state-gated slots inside gapped parents, and it
 * enumerates the components applying it. That list is the kind of prose that goes
 * stale silently: adding the utility to a new component is a one-line change, and
 * nothing pointed at the doc. This test is that pointer.
 *
 * It is also T8's RED contract. Documentation tasks have no natural failing test, so
 * plan review round 6 was right that calling T8 a "documentation task" did not waive
 * invariant 1 — a real contract existed, and this is it: T5 added `empty:hidden` to
 * TravelSection while §7a still listed only OverviewSection and ScheduleDayRow.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { stripCommentsForFile } from "../_shared/stripComments";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const COMPONENTS = join(REPO_ROOT, "components");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Comments and string literals stripped before the search. Review round 1: a
 * `// see empty:hidden` comment made this test demand a DESIGN.md entry for a file
 * that does not apply the idiom, and the reverse — documentation could be correct
 * while a stray mention failed the run.
 */

/** Files applying the §7a idiom, as basenames (the doc names components, not paths). */
function componentsUsingEmptyHidden(): string[] {
  return walk(COMPONENTS)
    .filter((f) => stripCommentsForFile(readFileSync(f, "utf8"), f).includes("empty:hidden"))
    .map((f) => f.slice(COMPONENTS.length + 1))
    .sort();
}

describe("DESIGN.md §7a lists every empty:hidden site", () => {
  it("names each component that applies the idiom", () => {
    const design = readFileSync(join(REPO_ROOT, "DESIGN.md"), "utf8");
    // The paragraph that enumerates them. Scoped so an unrelated mention of a
    // filename elsewhere in DESIGN.md cannot satisfy the assertion.
    const marker = "Current sites:";
    const idx = design.indexOf(marker);
    expect(idx, "DESIGN.md §7a carries a 'Current sites:' list").toBeGreaterThan(-1);
    // Bounded by the next heading, not by a 1200-character window. Review round 1:
    // an arbitrary window can reach an unrelated later mention of a filename and
    // satisfy the check while the list itself is stale.
    const rest = design.slice(idx);
    const nextHeading = rest.search(/\n#{1,6} /);
    const listText = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

    const used = componentsUsingEmptyHidden();
    expect(used.length, "at least one component applies the idiom").toBeGreaterThan(0);

    // Matched on the PATH-QUALIFIED name where the doc gives one, so two components
    // sharing a basename cannot cover for each other (review round 1). A bare
    // basename in the doc still counts — the doc names components, not paths — but a
    // second file with the same basename must then be named distinctly.
    const byBase = new Map<string, string[]>();
    for (const rel of used) {
      const base = rel.split("/").pop() ?? rel;
      byBase.set(base, [...(byBase.get(base) ?? []), rel]);
    }
    const missing = used.filter((rel) => {
      const base = rel.split("/").pop() ?? rel;
      const stem = base.replace(/\.tsx$/, "");
      // Ambiguous basename: require the doc to disambiguate by path.
      // Anchored, not substring: `legacy/admin/Foo.tsx` contains `admin/Foo.tsx`, so
      // documenting only the former satisfied a lookup for the latter and left one of
      // the two undocumented (review round 2). A match must begin at a path boundary.
      if ((byBase.get(base) ?? []).length > 1) {
        const anchored = new RegExp(`(^|[^\\w/.-])${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
        return !anchored.test(listText);
      }
      return !listText.includes(base) && !listText.includes(stem);
    });

    expect(
      missing,
      `DESIGN.md §7a's "Current sites" list is stale — these carry empty:hidden but are` +
        ` not named: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
