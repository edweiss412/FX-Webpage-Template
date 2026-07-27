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
 *  - Each block is PARSED BY ARGUMENT ROLE (whole-diff R3): the pinned tag
 *    must be the actual positional image argument and linux/amd64 the actual
 *    value of a --platform flag. A substring check would accept
 *    `--label 'note=<pinned tag> --platform linux/amd64'` wrapping a real
 *    invocation of :latest with no platform pin.
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

/** docker-run flags that take NO value. Any other `-`/`--` token either
 *  carries its value inline (`--flag=value`) or consumes the next token.
 *  An omission here is fail-safe: the flag would swallow the following token
 *  and the image assertion below would fail LOUD, never pass vacuously. */
const BOOLEAN_DOCKER_FLAGS = new Set([
  "--rm",
  "--init",
  "--privileged",
  "--read-only",
  "-d",
  "--detach",
  "-i",
  "--interactive",
  "-t",
  "--tty",
  "-it",
  "-P",
  "--publish-all",
]);

/** Split one logical shell line into tokens, honoring single/double quotes
 *  (a quoted span is one token, quotes stripped). Enough shell for a
 *  workflow `docker run` line; NOT a general shell parser. */
function tokenizeShell(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let sawQuote = false;
  let quote: '"' | "'" | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      sawQuote = true;
    } else if (/\s/.test(ch)) {
      if (current.length > 0 || sawQuote) tokens.push(current);
      current = "";
      sawQuote = false;
    } else {
      current += ch;
    }
  }
  if (current.length > 0 || sawQuote) tokens.push(current);
  return tokens;
}

/** Parse a docker-run continuation block by ARGUMENT ROLE: the image is the
 *  first positional token after flag consumption; the platform is the value
 *  of an actual --platform flag (space or `=` form). Strings inside flag
 *  VALUES (-e, --label, ...) can never be reported as image or platform —
 *  the whole-diff R3 bypass. Returns null when the block does not parse as
 *  `docker run ...` (callers treat that as a loud failure). */
function parseDockerRunBlock(block: string): { image: string | null; platform: string | null } | null {
  const tokens = tokenizeShell(block.replace(/\\\n/g, " "));
  if (tokens[0] !== "docker" || tokens[1] !== "run") return null;
  let platform: string | null = null;
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!token.startsWith("-")) return { image: token, platform };
    if (BOOLEAN_DOCKER_FLAGS.has(token)) continue;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      if (token.slice(0, eq) === "--platform") platform = token.slice(eq + 1);
    } else {
      if (token === "--platform") platform = tokens[i + 1] ?? null;
      i++; // value-taking flag: consume its value token
    }
  }
  return { image: null, platform };
}

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
          // Role-parsed, not substring-matched (whole-diff R2 + R3): the
          // exact pinned tag must be the ACTUAL image argument, and
          // linux/amd64 the ACTUAL --platform value. A pinned-looking string
          // buried in a -e/--label value cannot satisfy either.
          const parsed = parseDockerRunBlock(block);
          expect(
            parsed,
            `${file}: docker run block did not parse as \`docker run ...\`:\n${block}`,
          ).not.toBeNull();
          expect(
            parsed!.image,
            `${file}: the image ARGUMENT of a docker run block must be the exact pinned tag v${installed}-jammy`,
          ).toBe(`${IMAGE_MARKER}:v${installed}-jammy`);
          expect(
            parsed!.platform,
            `${file}: a docker run of the pinned image is missing a real --platform linux/amd64 flag`,
          ).toBe("linux/amd64");
        }
      });
    });
  }
});

describe("docker-run block parser sensitivity (the whole-diff R3 bypass shapes must not parse as compliant)", () => {
  const pinned = `${IMAGE_MARKER}:v${installedPlaywrightVersion()}-jammy`;

  it("rejects the flag-value smuggle: pinned tag + platform inside a --label value, real image :latest", () => {
    const bypass = `docker run --label 'note=${pinned} --platform linux/amd64' ${IMAGE_MARKER}:latest bash`;
    const parsed = parseDockerRunBlock(bypass);
    expect(parsed?.image).toBe(`${IMAGE_MARKER}:latest`);
    expect(parsed?.platform).toBeNull();
  });

  it("rejects a smuggle via -e value with no platform flag at all", () => {
    const bypass = `docker run --rm -e NOTE="${pinned} --platform linux/amd64" ${IMAGE_MARKER}:latest bash`;
    const parsed = parseDockerRunBlock(bypass);
    expect(parsed?.image).toBe(`${IMAGE_MARKER}:latest`);
    expect(parsed?.platform).toBeNull();
  });

  it("accepts a real continuation block in the workflows' shape", () => {
    const real = `docker run --rm --platform linux/amd64 --network host \\\n  -v "$PWD:/work" \\\n  -w /work \\\n  -e CI=true \\\n  ${pinned} \\\n  bash -lc "corepack enable && pnpm screenshot:help"`;
    expect(parseDockerRunBlock(real)).toEqual({ image: pinned, platform: "linux/amd64" });
  });

  it("accepts the --platform=VALUE equals form", () => {
    const real = `docker run --rm --platform=linux/amd64 ${pinned} bash`;
    expect(parseDockerRunBlock(real)).toEqual({ image: pinned, platform: "linux/amd64" });
  });

  it("returns null (loud, not vacuous) for a block that is not docker run", () => {
    expect(parseDockerRunBlock(`docker build -t x .`)).toBeNull();
  });
});
