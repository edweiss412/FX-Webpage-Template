// Structural guard over the deferral ledgers and the invariant-8 closeout trail.
//
// Shipped as the class defense for a vector that recurred across two adversarial
// rounds of the 2026-07-24 dev-row copy close-out: a ledger/docs task with no
// genuine red state, only post-hoc checks that were already green. Rather than
// patch the prose a third time, the graduation itself became a test.
//
// Spec: docs/superpowers/specs/2026-07-24-settings-devrow-copy-close.md §9 T8.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** A deferral entry heading: `### SOME-ID — human text`. */
const DEFERRAL_ID = /^### ([A-Z0-9][A-Z0-9-]+)/gm;

/**
 * Deferrals graduated to the archive since this guard shipped. NOT a mirror of
 * the ~130 historical archive entries: those predate the guard and are covered
 * only by the no-overlap invariant below, not by per-id presence.
 */
const GRADUATED = ["SETTINGS-DEVROW-GALLERY-RESIDUE-1"] as const;

const PLANS_DIR = "docs/superpowers/plans";

/** A plan declares the invariant-8 UI gate if it names the invariant or the skill. */
const DECLARES_INVARIANT_8 = /invariant[- ]8|impeccable/i;

/**
 * Pre-guard debt, NOT an opt-out. Every plan directory here declared an
 * invariant-8 gate before this guard existed and shipped without a §12 closeout
 * (or with a closeout that predates the §12 convention). Discovery below is
 * fail-by-default, so a NEW plan cannot join this list by omission — it has to
 * be added deliberately, which is the point.
 *
 * Shrinking this list is welcome; growing it needs a reason in the PR body.
 */
const KNOWN_PRE_GUARD_PLANS: ReadonlySet<string> = new Set([
  "2026-07-19-crew-row-controls",
  "2026-07-19-published-show-alerts",
  "2026-07-19-show-modal-prefetch",
  "2026-07-20-share-hub",
  "2026-07-20-warning-surface-trim",
  "2026-07-21-gallery-switcher-slim-bar",
  "2026-07-21-warning-card-identity-placement",
  "2026-07-22-warning-announcer-copy",
  "2026-07-22-warning-panel-polish",
  "2026-07-23-gallery-action-outcomes",
  "2026-07-23-warning-trim-undefer",
]);

// process.cwd() is the project root under vitest — the convention
// tests/cross-cutting/vitest-projects-partition.test.ts already uses.
// import.meta.url is NOT a file: URL under vitest's transform, so
// readFileSync(new URL(..., import.meta.url)) throws "The URL must be of scheme
// file" and every assertion fails for the wrong reason.
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

const idsIn = (rel: string): Set<string> =>
  new Set(Array.from(read(rel).matchAll(DEFERRAL_ID), (m) => m[1]!));

/**
 * Walk the plans tree and return every plan directory that declares an
 * invariant-8 gate. Filesystem-walked, so a NEW plan is discovered whether or
 * not anyone remembers to register it.
 */
function discoverInvariant8Plans(): string[] {
  const root = join(process.cwd(), PLANS_DIR);
  return readdirSync(root, { withFileTypes: true })
    .filter((ent) => ent.isDirectory())
    .map((ent) => ent.name)
    .filter((name) => {
      const planPath = join(root, name, "plan.md");
      return existsSync(planPath) && DECLARES_INVARIANT_8.test(readFileSync(planPath, "utf8"));
    })
    .sort();
}

/** The body of a `## 12` section: heading to next heading, or to EOF. */
function sectionTwelve(markdown: string): string | null {
  const heading = /^##\s*12\b.*$/m.exec(markdown);
  if (heading === null) return null;
  const after = markdown.slice(heading.index + heading[0].length);
  const next = /^##\s/m.exec(after);
  return (next ? after.slice(0, next.index) : after).toLowerCase();
}

describe("deferral ledger graduation", () => {
  it("no id is both active and archived", () => {
    // The recurring shape: a graduation that copies the entry into the archive
    // without deleting it from the active queue, or a re-opened entry left
    // behind in the archive. Either way the ledgers disagree about what is open.
    const active = idsIn("DEFERRED.md");
    const archived = idsIn("DEFERRED-archive.md");
    const both = [...active].filter((id) => archived.has(id));
    expect(both).toEqual([]);
  });

  it("every graduated id is archive-only", () => {
    const active = idsIn("DEFERRED.md");
    const archived = idsIn("DEFERRED-archive.md");
    for (const id of GRADUATED) {
      expect(archived.has(id), `${id} missing from DEFERRED-archive.md`).toBe(true);
      expect(active.has(id), `${id} still in DEFERRED.md`).toBe(false);
    }
  });

  it("every invariant-8 plan outside the pre-guard debt list has a §12 closeout", () => {
    // Filesystem-walked, NOT a hand-maintained allowlist: a new UI plan that
    // declares the gate and ships no closeout fails here by default. The only
    // way out is an explicit KNOWN_PRE_GUARD_PLANS row, which is a visible,
    // reviewable act rather than an omission.
    const owing = discoverInvariant8Plans().filter((name) => !KNOWN_PRE_GUARD_PLANS.has(name));
    expect(owing.length, "no invariant-8 plans discovered — the walk is broken").toBeGreaterThan(
      0,
    );

    for (const name of owing) {
      const path = `${PLANS_DIR}/${name}/closeout.md`;
      expect(existsSync(join(process.cwd(), path)), `${path} missing`).toBe(true);

      const body = sectionTwelve(read(path));
      expect(body, `${path} has no "## 12" section`).not.toBeNull();

      // Both gate halves must be NAMED, and the P0/P1 disposition invariant 8
      // requires must be STATED. Searching the whole document would pass on an
      // empty §12 whenever the words appear in a title or boilerplate; a bare
      // substring check would pass on "critique not run" (whole-diff review F3),
      // which is why the negative phrasings are rejected explicitly.
      expect(body).toContain("critique");
      expect(body).toContain("audit");
      expect(body).toMatch(/\bp0\b/);
      expect(body).toMatch(/\bp1\b/);
      expect(body, `${path} §12 records a gate as not run`).not.toMatch(
        /\b(critique|audit)\b[^.\n]{0,40}\bnot run\b/,
      );
    }
  });
});
