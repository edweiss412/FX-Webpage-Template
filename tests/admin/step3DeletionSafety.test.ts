/**
 * tests/admin/step3DeletionSafety.test.ts (Step-3 consolidation, spec §11)
 *
 * AUTHORITATIVE deletion-safety guard. Walks the app/ + components/ + lib/ source
 * tree (so a NEW surviving reference fails-by-default) and asserts the surfaces
 * retired by the Step-3 consolidation stay gone:
 *   - no import of FinalizeInProgress / ReadyToPublish / StaleReadyToPublish /
 *     ResumeFinalizeButton / _unresolvedSheets / the standalone staged page;
 *   - no in-app <Link href> out to the retired /admin/onboarding/staged/ page
 *     (the resolution modal on /admin is the only path; old URLs 307 to /admin);
 * AND that CleanupAbandonedFinalizeButton — RE-HOMED into the Step-3 footer, not
 * deleted — is still imported somewhere (a false-delete tripwire).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOTS = ["app", "components", "lib"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = ROOTS.flatMap((r) => walk(r)).map((path) => ({
  path,
  src: readFileSync(path, "utf8"),
}));

// Import paths of the retired modules (path-anchored → no comment/substring false
// positives; ReadyToPublish vs StaleReadyToPublish are disambiguated by the quote).
const RETIRED_IMPORT_PATHS = [
  "@/components/admin/FinalizeInProgress",
  "@/components/admin/ReadyToPublish",
  "@/components/admin/StaleReadyToPublish",
  "@/components/admin/ResumeFinalizeButton",
  "@/app/admin/_unresolvedSheets",
  "@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page",
];

describe("Step-3 consolidation deletion safety (spec §11)", () => {
  test("no source file imports a retired consolidation surface", () => {
    const offenders: string[] = [];
    for (const { path, src } of SOURCES) {
      for (const mod of RETIRED_IMPORT_PATHS) {
        // Match `from "<mod>"` / `import("<mod>")` — the closing quote pins the
        // exact module, so `ReadyToPublish` never matches `StaleReadyToPublish`.
        if (src.includes(`"${mod}"`) || src.includes(`'${mod}'`)) {
          offenders.push(`${path} → ${mod}`);
        }
      }
    }
    expect(offenders, `retired-surface import(s) survived:\n${offenders.join("\n")}`).toEqual([]);
  });

  test("no in-app <Link href> out to the retired staged page", () => {
    const offenders: string[] = [];
    for (const { path, src } of SOURCES) {
      src.split("\n").forEach((line, i) => {
        // A page-nav link: an href to the staged PAGE (not the /api/... routes,
        // which are legitimate mutation endpoints).
        if (
          line.includes("href") &&
          line.includes("/admin/onboarding/staged/") &&
          !line.includes("/api/")
        ) {
          offenders.push(`${path}:${i + 1}`);
        }
      });
    }
    expect(offenders, `staged-page <Link href> survived:\n${offenders.join("\n")}`).toEqual([]);
  });

  test("CleanupAbandonedFinalizeButton is RE-HOMED, not deleted (still imported)", () => {
    const stillImported = SOURCES.some(({ src }) =>
      src.includes('"@/components/admin/CleanupAbandonedFinalizeButton"'),
    );
    expect(stillImported).toBe(true);
  });
});
