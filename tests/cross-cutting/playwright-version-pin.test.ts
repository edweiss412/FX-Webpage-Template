/**
 * tests/cross-cutting/playwright-version-pin.test.ts
 *
 * Registry pin for EVERY workflow that runs the mcr.microsoft.com/playwright
 * Docker image (the AGENTS.md byte-comparison rule: pin BOTH the image AND the
 * host architecture, and tie the tag to the dependency version).
 *
 * Rewritten 2026-07-26 (header-probe-residual-closure plan, review R1 f6) from
 * a single-workflow major.minor check against the package.json caret literal:
 * that shape left three escapes — a new pinned-image workflow could be omitted
 * entirely, a patch-version skew could pass, and a lockfile update inside the
 * caret range could change the EXECUTED Playwright without changing the parsed
 * literal. The registry + installed-manifest comparison closes all three: a
 * workflow added to the registry before it exists fails (fail-by-default), and
 * the compared version is the one `node_modules` actually resolves.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Every workflow that runs the pinned Playwright image. A workflow using the
 *  image but absent here escapes the pin — add it when adding the workflow. */
const PINNED_IMAGE_WORKFLOWS = [
  "screenshots-drift.yml",
  "screenshots-regen.yml",
  "section-header-visual.yml",
  "section-header-visual-regen.yml",
] as const;

const IMAGE_RE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-jammy/g;
/** A `docker run` invocation up to its image reference: the span that must
 *  carry the amd64 platform pin. */
const DOCKER_RUN_SPAN_RE =
  /docker run[\s\S]*?mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-jammy/g;

const localRequire = createRequire(import.meta.url);

/** The RESOLVED installed @playwright/test version — what actually executes —
 *  not the caret range declared in package.json. */
function installedPlaywrightVersion(): string {
  const manifest = localRequire("@playwright/test/package.json") as { version?: string };
  if (!manifest.version) throw new Error("@playwright/test manifest has no version");
  return manifest.version;
}

describe("pinned Playwright image workflows match the installed @playwright/test exactly", () => {
  const installed = installedPlaywrightVersion();

  const readWorkflow = (workflow: string) =>
    readFileSync(join(ROOT, ".github", "workflows", workflow), "utf8");

  for (const workflow of PINNED_IMAGE_WORKFLOWS) {
    describe(workflow, () => {
      it("references the pinned image with the installed version, everywhere it runs docker", () => {
        const yaml = readWorkflow(workflow);
        const tags = [...yaml.matchAll(IMAGE_RE)].map((m) => m[1]);
        expect(
          tags.length,
          `${workflow} must run mcr.microsoft.com/playwright:vN.M.K-jammy at least once`,
        ).toBeGreaterThan(0);
        for (const tag of tags) {
          expect(
            tag,
            `${workflow} image tag v${tag}-jammy must match installed @playwright/test ${installed} exactly`,
          ).toBe(installed);
        }
      });

      it("pins every docker run of the image to linux/amd64", () => {
        const yaml = readWorkflow(workflow);
        const spans = [...yaml.matchAll(DOCKER_RUN_SPAN_RE)].map((m) => m[0]);
        expect(
          spans.length,
          `${workflow} must invoke the pinned image via docker run`,
        ).toBeGreaterThan(0);
        for (const span of spans) {
          expect(
            span,
            `${workflow}: a docker run of the pinned image is missing --platform linux/amd64`,
          ).toContain("--platform linux/amd64");
        }
      });
    });
  }
});
