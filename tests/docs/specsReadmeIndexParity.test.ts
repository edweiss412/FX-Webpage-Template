/**
 * tests/docs/specsReadmeIndexParity.test.ts
 *
 * Every spec doc under `docs/superpowers/specs/<subsystem>/` must appear in that
 * directory's own `README.md` index table.
 *
 * WHY: the index is the only discovery surface for these docs — nothing links
 * them otherwise — and adding a spec without adding its row is silent. Nothing
 * fails, so the doc simply stops being findable. Measured 2026-08-01: 15 docs
 * across six subsystems had drifted out of their indexes, the oldest by ~six
 * weeks, including a CI retrospective that a live BACKLOG entry cites as its
 * "reusable asset".
 *
 * Discovery is filesystem-walked in BOTH directions, not a hardcoded list:
 *   - a doc with no row fails (the drift that actually happened);
 *   - a row pointing at an entry that no longer exists also fails, so a rename
 *     or deletion cannot leave a dangling index entry behind.
 *
 * An index entry is a `.md` file OR a nested directory: several subsystems index
 * a dated mock folder (`2026-07-02-step3-review-modal-mock/`) as one row, with a
 * trailing slash in the link. Both spellings are normalised before comparison —
 * modelling only `.md` files reported every such row as dangling.
 *
 * A new subsystem directory is picked up automatically. A directory counts as an
 * indexed subsystem when its README carries the `| Entry | Date |` table HEADER —
 * not merely when a README exists, and not when it happens to have rows. Dated
 * mock folders also carry a README, but theirs is prose, so presence alone
 * over-selects; keying on ROWS instead would let an index whose table was emptied
 * quietly drop out of the guard. The header is the stable declaration of intent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const SPECS_ROOT = join(process.cwd(), "docs", "superpowers", "specs");

/** `| [`name.md`](./name.md) | 2026-08-01 |` → `name.md` */
const ROW = /^\|\s*\[`([^`]+)`\]\([^)]*\)\s*\|/;

/** The header that declares a README to be an index table. */
const INDEX_HEADER = /^\|\s*Entry\s*\|\s*Date\s*\|/m;

type Subsystem = { dir: string; docs: string[]; listed: string[] };

/** `foo.md` and `bar-mock/` compare on equal terms; only the trailing slash differs. */
const norm = (name: string): string => name.replace(/\/$/, "");

function subsystems(): Subsystem[] {
  const out: Subsystem[] = [];
  for (const entry of readdirSync(SPECS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(SPECS_ROOT, entry.name);
    const children = readdirSync(full, { withFileTypes: true });
    if (!children.some((c) => c.isFile() && c.name === "README.md")) continue;
    const readme = readFileSync(join(full, "README.md"), "utf8");
    if (!INDEX_HEADER.test(readme)) continue; // prose README (dated mock folder), not an index
    out.push({
      dir: entry.name,
      docs: children
        .filter((c) => (c.isFile() ? c.name.endsWith(".md") && c.name !== "README.md" : true))
        .map((c) => c.name)
        .sort(),
      listed: readme
        .split("\n")
        .map((line) => ROW.exec(line)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(norm)
        .sort(),
    });
  }
  return out;
}

const ALL = subsystems();

describe("docs/superpowers/specs/*/README.md indexes every doc beside it", () => {
  test("the walk finds real subsystems and real rows (a vacuous walk would pass everything below)", () => {
    // Anti-vacuity: if the directory scan or the row regex silently matched
    // nothing, every per-subsystem assertion would trivially compare [] to [].
    expect(ALL.length).toBeGreaterThan(5);
    expect(ALL.every((s) => s.docs.length > 0)).toBe(true);
    expect(ALL.every((s) => s.listed.length > 0)).toBe(true);
  });

  test.each(ALL)("$dir — every doc has an index row", ({ dir, docs, listed }) => {
    const unlisted = docs.filter((d) => !listed.includes(d));
    expect(
      unlisted,
      `docs/superpowers/specs/${dir}/README.md is missing a row for:\n` +
        unlisted.map((d) => `  | [\`${d}\`](./${d}) | <date> |`).join("\n") +
        "\nAdd each in date order. The index is the only way these docs are discoverable.",
    ).toEqual([]);
  });

  test.each(ALL)("$dir — no index row points at a missing file", ({ dir, docs, listed }) => {
    const dangling = listed.filter((l) => !docs.includes(l));
    expect(
      dangling,
      `docs/superpowers/specs/${dir}/README.md has rows for files that do not exist ` +
        `(renamed or deleted?):\n${dangling.map((d) => `  ${d}`).join("\n")}`,
    ).toEqual([]);
  });
});
