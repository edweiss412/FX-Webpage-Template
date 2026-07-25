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

import {
  classifyRetiredPathOccurrences,
  hrefHitsRetiredPage,
  resolveNavHrefs,
  type OccurrenceKind,
} from "./stagedPageRefScan";

const ROOTS = ["app", "components", "lib"];

function walk(dir: string, pattern = /\.(ts|tsx)$/): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, pattern));
    } else if (pattern.test(name)) {
      out.push(full);
    }
  }
  return out;
}

// next.config.ts is scanned too: the 307 redirect whose SOURCE is the retired path
// lives there, outside every root, so a root-only scan cannot see the one file that
// is allowed to name it in code (spec 2026-07-24-test-safety-hardening-batch §3.3).
//
// readFileSync, never a shelled-out grep: components/admin/wizard/Step3Review.tsx
// carries a raw NUL byte, so `file(1)` reports it as `data` and grep skips it
// silently — it holds one of the ratified references below (spec §3.2a).
const SOURCES = [...ROOTS.flatMap((r) => walk(r)), "next.config.ts"].map((path) => ({
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

  // Layer A — every occurrence of the retired path, pinned by POSITION KIND rather
  // than by count. A count-only allow-list accepts "delete the ratified comment,
  // add `const routes = { staged: … }`" at an unchanged total; the kind vector does
  // not (BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS, whole-diff R1 finding 5b).
  const RATIFIED_RETIRED_PATH_REFS: Record<string, OccurrenceKind[]> = {
    // The finalize race row's `re_apply_url` builder. Ratified by spec §4.6: old
    // URLs 307 to /admin, so the value is a redirect entrypoint, not in-app nav.
    "app/api/admin/onboarding/finalize/route.ts": ["string-literal"],
    // The 307 itself: its explanatory comment plus the `source` pattern.
    "next.config.ts": ["comment", "string-literal"],
    // Prose only — each names the retired page to explain what replaced it.
    "app/admin/show/staged/[stagedId]/page.tsx": ["comment"],
    "components/admin/wizard/Step3Review.tsx": ["comment"],
    "lib/audit/trustDomains.ts": ["comment"],
    "lib/parser/dataGaps.ts": ["comment"],
  };

  test("every retired-path reference is one of the ratified ones, in its ratified form", () => {
    const live: Record<string, OccurrenceKind[]> = {};
    for (const { path, src } of SOURCES) {
      const kinds = classifyRetiredPathOccurrences(src, path);
      if (kinds.length > 0) live[path] = kinds;
    }
    expect(
      live,
      "the retired /admin/onboarding/staged/ page is referenced somewhere new, or a " +
        "ratified reference changed kind (comment turned into code) or disappeared. " +
        "Update RATIFIED_RETIRED_PATH_REFS deliberately, or remove the reference.",
    ).toEqual(RATIFIED_RETIRED_PATH_REFS);
  });

  // Layer B — resolve what <Link>/<a> hrefs actually POINT AT, so a helper-built or
  // concatenated href cannot slip past a lexical scan.
  test("no in-app <Link href> resolves to the retired staged page", () => {
    const offenders: string[] = [];
    for (const { path, src } of SOURCES) {
      for (const href of resolveNavHrefs(src, path)) {
        if (hrefHitsRetiredPage(href.value)) offenders.push(`${path}:${href.line} → ${href.value}`);
      }
    }
    expect(offenders, `staged-page nav href survived:\n${offenders.join("\n")}`).toEqual([]);
  });

  // Layer C — the assembled form has no contiguous literal for Layer A to catch and
  // is not necessarily an href for Layer B to resolve.
  test("no file assembles the retired path from segments", () => {
    const offenders = SOURCES.filter(({ path, src }) =>
      classifyRetiredPathOccurrences(src, path).includes("assembled"),
    ).map(({ path }) => path);
    expect(offenders, `retired path assembled from segments in:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  // MDX help pages render real <Link>s but are not TypeScript, so the AST layers
  // above cannot read them (whole-diff R2 finding 4). A raw scan is sufficient here
  // because NO mdx page is allowed to name the retired page at all — there is no
  // ratified reference to carve out, so any occurrence is a regression.
  test("no MDX help page references the retired staged page", () => {
    const mdx = walk("app", /\.mdx$/);
    expect(
      mdx.length,
      "the mdx walker found nothing, so this guard would be vacuous",
    ).toBeGreaterThan(0);
    const offenders = mdx.filter((path) => hrefHitsRetiredPage(readFileSync(path, "utf8")));
    expect(offenders, `retired staged-page reference in MDX:\n${offenders.join("\n")}`).toEqual([]);
  });

  test("CleanupAbandonedFinalizeButton is RE-HOMED, not deleted (still imported)", () => {
    const stillImported = SOURCES.some(({ src }) =>
      src.includes('"@/components/admin/CleanupAbandonedFinalizeButton"'),
    );
    expect(stillImported).toBe(true);
  });
});
