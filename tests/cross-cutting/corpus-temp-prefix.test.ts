import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PARALLEL_TEST_GLOBS } from "@/vitest.projects";

import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";

// Contract (spec §4.1.2): serial tests write synthetic fixtures into
// fixtures/shows/raw/ under CORPUS_TEMP_PREFIX, and EVERY parallel-set test that
// lists that directory filters the prefix out. Without this, `test:fast`'s
// serial/parallel overlap lets a reader list a deliberately malformed synthetic
// fixture mid-run and fail its parse assertions.
//
// Both arms are DISCOVERY-DRIVEN (filesystem-walked, not a hardcoded file list):
// a new reader in a parallel dir, or a new corpus write site, fails by default.
// That matters — the reader set grew silently when Phase 2 (PR #507) moved
// tests/parser/** into the parallel project.

const CORPUS_DIR = "fixtures/shows/raw";

function matchesParallel(file: string): boolean {
  return PARALLEL_TEST_GLOBS.some((g) => {
    const starIdx = g.indexOf("/**");
    if (starIdx >= 0) return file.startsWith(g.slice(0, starIdx + 1));
    return file === g;
  });
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

const testFiles = listFiles("tests")
  .map((p) => p.replaceAll("\\", "/"))
  .filter((p) => /\.tsx?$/.test(p));

describe("corpus temp-prefix contract", () => {
  it("prefix constant is the ratified literal", () => {
    expect(CORPUS_TEMP_PREFIX).toBe("_temp-");
  });

  it("every parallel-set corpus listing site filters the temp prefix", () => {
    // PER-SITE, not per-file: resolve each readdirSync call's argument, then
    // require the guard inside THAT call's filter chain. A file with two listing
    // sites and one guard fails. Argument shapes handled: an inline literal or
    // TEMPLATE (`fixtures/shows/${d}` — two readers use exactly that, which a
    // plain substring predicate misses), an identifier assigned such a path in
    // the same file, and — conservatively — an unresolvable identifier (helper
    // parameter) in a file that names the raw corpus somewhere.
    const corpusSites = (src: string): string[] => {
      const slices: string[] = [];
      const mentionsRaw = src.includes(CORPUS_DIR);
      for (const m of src.matchAll(/\breaddirSync\s*\(\s*([^,)]+)/g)) {
        const arg = m[1]!.trim();
        const ident = /^[A-Za-z_$][\w$]*$/.test(arg) ? arg : null;
        const identPath = ident
          ? (new RegExp(`\\b${ident}\\s*=([^;\n]*)`).exec(src)?.[1] ?? null)
          : null;

        const isCorpus = /fixtures\/shows/.test(arg)
          ? // Inline literal or template. A template under fixtures/shows can
            // resolve to raw at runtime, so it counts.
            arg.includes(CORPUS_DIR) || /fixtures\/shows\/\$\{/.test(arg)
          : identPath !== null
            ? identPath.includes(CORPUS_DIR)
            : // Unresolvable (helper param): in scope iff the file names the corpus.
              mentionsRaw;
        if (!isCorpus) continue;

        // The site's filter chain: from the call to the end of its statement.
        const from = m.index!;
        const semi = src.indexOf(";", from);
        slices.push(src.slice(from, semi === -1 ? src.length : semi));
      }
      return slices;
    };

    const listers = testFiles
      .filter(matchesParallel)
      .map((p) => [p, readFileSync(p, "utf8")] as const)
      .map(([p, src]) => ({ p, sites: corpusSites(src) }))
      .filter((r) => r.sites.length > 0);

    // Guard the guard: PR #507 moved tests/parser/** into the parallel project,
    // which is how this set grew from 1 file to 7. A collapse means the arm has
    // stopped finding readers (glob change, dir rename) and must be repaired.
    expect(listers.length).toBeGreaterThanOrEqual(7);

    for (const { p, sites } of listers) {
      for (const site of sites) {
        const guarded = site.includes("CORPUS_TEMP_PREFIX") || /startsWith\(["']_["']\)/.test(site);
        expect(
          guarded,
          `${p}: a corpus listing site in the PARALLEL project does not filter ` +
            `${CORPUS_TEMP_PREFIX} — a serial test's synthetic fixture would be parsed ` +
            `mid-overlap. Site: ${site.slice(0, 120).replace(/\s+/g, " ")}`,
        ).toBe(true);
      }
    }
  });

  it("every corpus write site writes a prefix-derived name", () => {
    const writers = testFiles.filter((p) => {
      const src = readFileSync(p, "utf8");
      return src.includes(CORPUS_DIR) && /\bwriteFile(Sync)?\s*\(/.test(src);
    });
    expect(writers.length).toBeGreaterThanOrEqual(1);

    for (const p of writers) {
      const src = readFileSync(p, "utf8");
      expect(src, `${p} writes to ${CORPUS_DIR} — derive names from CORPUS_TEMP_PREFIX`).toContain(
        "CORPUS_TEMP_PREFIX",
      );
      // Every name bound for the corpus dir must be a CORPUS_TEMP_PREFIX
      // template, whatever the identifier's casing. A bare string literal
      // filename passed to a corpus write is the bypass this catches.
      const writeArgs = [
        ...src.matchAll(/\bwriteFile(?:Sync)?\s*\(\s*join\(\s*([A-Za-z_$][\w$]*)\s*,\s*([^),]+)/g),
      ];
      for (const m of writeArgs) {
        const dirVar = m[1]!;
        const nameArg = m[2]!.trim();
        // Only constrain writes aimed at the corpus dir variable.
        const dirIsCorpus = new RegExp(`${dirVar}\\s*=[^;]*${CORPUS_DIR}`).test(src);
        if (!dirIsCorpus) continue;
        expect(
          /^["'`]/.test(nameArg),
          `${p}: corpus write uses a literal filename (${nameArg}) instead of a CORPUS_TEMP_PREFIX-derived const`,
        ).toBe(false);
        expect(
          new RegExp(`${nameArg}\\s*=\\s*\`\\$\\{CORPUS_TEMP_PREFIX\\}`).test(src),
          `${p}: ${nameArg} must be defined as \`\${CORPUS_TEMP_PREFIX}…\``,
        ).toBe(true);
      }
    }
  });
});
