/**
 * tests/components/admin/showpage/shareChipOrphanRemoval.test.ts
 *
 * Completion guard for K1/K2 (plan 2026-07-24-share-link-chrome-backlog §Task 1).
 *
 * `ShareChip` and `CrewPageLink` were orphans: mounted by no production module,
 * imported only by their own tests, and the sole holders of the `max-w-[16rem]`
 * that BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE asked to tokenize. Deleting them
 * resolves that item more completely than naming the value would have.
 *
 * This is a filesystem walk rather than an import assertion on purpose: an
 * import-based check would itself have to import the thing it claims is gone.
 *
 * Declared EXEMPT from the Task 6 adversary matrix (spec §9.0): it asserts the
 * absence of deleted code, so no cue mutation can red it. Exempt does not mean
 * optional — K1/K2 require it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCANNED_DIRS = ["app", "components"];
const CODE = /\.(ts|tsx)$/;

/** Every .ts/.tsx file under the scanned roots, excluding build output. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(entry)) out.push(full);
  }
  return out;
}

describe("orphaned share-chip surfaces are gone (K1/K2)", () => {
  const files = SCANNED_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it("scans a non-trivial file set (guards against a vacuous walk)", () => {
    // Without this, a broken walk returning [] would make every assertion below
    // pass while proving nothing — the exact defect class this milestone spent
    // eight spec rounds on.
    expect(files.length).toBeGreaterThan(200);
  });

  it.each(["ShareChip", "CrewPageLink"])(
    "%s is referenced by no file under app/ or components/",
    (name) => {
      const offenders = files.filter((f) => readFileSync(f, "utf8").includes(name));
      expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
    },
  );

  it("the arbitrary max-w-[16rem] the backlog item named is gone with them", () => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes("max-w-[16rem]"));
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});
