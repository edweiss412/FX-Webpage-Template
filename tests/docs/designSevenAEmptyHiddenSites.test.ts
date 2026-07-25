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

/** Files applying the §7a idiom, as basenames (the doc names components, not paths). */
function componentsUsingEmptyHidden(): string[] {
  return walk(COMPONENTS)
    .filter((f) => readFileSync(f, "utf8").includes("empty:hidden"))
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
    const listText = design.slice(idx, idx + 1200);

    const used = componentsUsingEmptyHidden();
    expect(used.length, "at least one component applies the idiom").toBeGreaterThan(0);

    const missing = used.filter((rel) => {
      const base = rel.split("/").pop() ?? rel;
      // A component counts as listed if the doc names its file or its component name.
      const stem = base.replace(/\.tsx$/, "");
      return !listText.includes(base) && !listText.includes(stem);
    });

    expect(
      missing,
      `DESIGN.md §7a's "Current sites" list is stale — these carry empty:hidden but are` +
        ` not named: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
