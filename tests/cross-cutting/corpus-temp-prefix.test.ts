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

  it("every parallel-set file that LISTS the raw corpus filters the temp prefix", () => {
    const listers = testFiles.filter((p) => {
      if (!matchesParallel(p)) return false;
      const src = readFileSync(p, "utf8");
      return src.includes(CORPUS_DIR) && /readdirSync\s*\(/.test(src);
    });
    // Guard the guard: if this ever hits zero the discovery arm has silently
    // stopped finding readers (glob shape change, dir rename).
    expect(listers.length).toBeGreaterThanOrEqual(6);

    for (const p of listers) {
      const src = readFileSync(p, "utf8");
      const filtersPrefix =
        src.includes("CORPUS_TEMP_PREFIX") ||
        // Equivalent broader guard: any leading-underscore fixture is excluded.
        /startsWith\(["']_["']\)/.test(src);
      expect(
        filtersPrefix,
        `${p} lists ${CORPUS_DIR} in the PARALLEL project but does not filter ` +
          `${CORPUS_TEMP_PREFIX} — a serial test's synthetic fixture would be parsed mid-overlap`,
      ).toBe(true);
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
