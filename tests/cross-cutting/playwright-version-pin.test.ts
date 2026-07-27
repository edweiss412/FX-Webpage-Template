/**
 * tests/cross-cutting/playwright-version-pin.test.ts
 *
 * Discovery pin for EVERY workflow that references the
 * mcr.microsoft.com/playwright Docker image (the AGENTS.md byte-comparison
 * rule: pin BOTH the image AND the host architecture, and tie the tag to the
 * dependency version).
 *
 * Rewritten 2026-07-26 (header-probe-residual-closure, plan review R1 f6 +
 * whole-diff R1 f3/f4) from a single-workflow major.minor check against the
 * package.json caret literal. The current shape closes every escape that
 * version had:
 *  - DISCOVERY, not a hand-registry: every workflow file mentioning the image
 *    is checked, so a fifth pinned-image workflow cannot be forgotten. The
 *    known set is asserted too, so a silent rename/removal is also loud.
 *  - The compared version is the INSTALLED @playwright/test manifest — the
 *    version that actually executes — not the caret range in package.json.
 *  - The amd64 pin is asserted on each `docker run` CONTINUATION BLOCK that
 *    references the image, so a compliant-looking tag in commit-message prose
 *    cannot stand in for a real invocation's platform pin.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");

const IMAGE_MARKER = "mcr.microsoft.com/playwright";
const IMAGE_RE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-jammy/g;
/** One shell invocation as YAML sees it: `docker run` plus its
 *  backslash-continuation lines. Prose (e.g. a `git commit -m` message naming
 *  the image) is never part of such a block, so pairing image and platform
 *  WITHIN a block cannot be satisfied by a later unrelated string. */
const DOCKER_BLOCK_RE = /docker run(?:[^\n]*\\\n)*[^\n]*/g;

/** Workflows known to run the image today — asserted present so a rename or
 *  removal is a loud diff here, not a silently shrunk discovery set. */
const KNOWN_PINNED_IMAGE_WORKFLOWS = [
  "screenshots-drift.yml",
  "screenshots-regen.yml",
  "section-header-visual.yml",
  "section-header-visual-regen.yml",
] as const;

const localRequire = createRequire(import.meta.url);

/** The RESOLVED installed @playwright/test version — what actually executes —
 *  not the caret range declared in package.json. */
function installedPlaywrightVersion(): string {
  const manifest = localRequire("@playwright/test/package.json") as { version?: string };
  if (!manifest.version) throw new Error("@playwright/test manifest has no version");
  return manifest.version;
}

function discoverPinnedImageWorkflows(): Array<{ file: string; yaml: string }> {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((file) => ({ file, yaml: readFileSync(join(WORKFLOWS_DIR, file), "utf8") }))
    .filter(({ yaml }) => yaml.includes(IMAGE_MARKER));
}

describe("every workflow referencing the pinned Playwright image matches the installed @playwright/test exactly", () => {
  const installed = installedPlaywrightVersion();
  const discovered = discoverPinnedImageWorkflows();

  it("discovers the known pinned-image workflows (rename/removal is loud)", () => {
    const names = discovered.map((d) => d.file);
    for (const known of KNOWN_PINNED_IMAGE_WORKFLOWS) {
      expect(names, `expected ${known} among pinned-image workflows`).toContain(known);
    }
  });

  for (const { file, yaml } of discoverPinnedImageWorkflows()) {
    describe(file, () => {
      it("every image reference (including prose) carries the installed version", () => {
        const tags = [...yaml.matchAll(IMAGE_RE)].map((m) => m[1]);
        expect(
          tags.length,
          `${file} mentions ${IMAGE_MARKER} but no vN.M.K-jammy tag parsed`,
        ).toBeGreaterThan(0);
        for (const tag of tags) {
          expect(
            tag,
            `${file}: image tag v${tag}-jammy must match installed @playwright/test ${installed} exactly`,
          ).toBe(installed);
        }
      });

      it("runs the image at least once, and every such docker run block pins linux/amd64 and the exact tag", () => {
        const blocks = [...yaml.matchAll(DOCKER_BLOCK_RE)]
          .map((m) => m[0])
          .filter((b) => b.includes(IMAGE_MARKER));
        expect(
          blocks.length,
          `${file} references the image but has no docker run block invoking it`,
        ).toBeGreaterThan(0);
        for (const block of blocks) {
          expect(
            block,
            `${file}: a docker run of the pinned image is missing --platform linux/amd64`,
          ).toContain("--platform linux/amd64");
          // The EXACT installed tag inside the block itself (whole-diff R2):
          // the global reference check above cannot stop one invocation
          // drifting to :latest or a variable while a valid tag survives in
          // prose elsewhere in the file.
          expect(
            block,
            `${file}: a docker run block must name the exact pinned tag v${installed}-jammy`,
          ).toContain(`${IMAGE_MARKER}:v${installed}-jammy`);
        }
      });
    });
  }
});
