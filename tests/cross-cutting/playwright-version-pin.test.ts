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
 *  - Each invocation is PARSED BY ARGUMENT ROLE against a STRICT ALLOWLIST
 *    grammar (whole-diff R3 + R4). The guard does NOT model general shell —
 *    it recognizes exactly the workflows' canonical invocation shape
 *    (enumerated flags, space- or `=`-separated values, plain or quoted
 *    tokens) and treats EVERYTHING else — unknown flags, attached short
 *    values (`-v/x:/y`), backslash escapes, unquoted `$` expansions, a
 *    missing image — as a LOUD failure. False failures on exotic-but-valid
 *    shell are accepted by design; a silent false PASS is the only defect
 *    class this guard must not have. Every `docker run` occurrence in a
 *    block is parsed from its own offset, so a compliant invocation cannot
 *    mask a later `&& docker run :latest` or a nested `$(docker run ...)`.
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

/** ALLOWLIST: docker-run flags that take NO value. Not exhaustive docker
 *  coverage — a flag in neither this set nor VALUE_TAKING_DOCKER_FLAGS makes
 *  the invocation unparseable, which the assertions treat as a loud failure
 *  (whole-diff R4: an unenumerated flag must never silently shift roles). */
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
]);

/** ALLOWLIST: flags that consume the next token (or an `=`-attached value). */
const VALUE_TAKING_DOCKER_FLAGS = new Set([
  "--platform",
  "--network",
  "-v",
  "--volume",
  "-w",
  "--workdir",
  "-e",
  "--env",
  "--name",
  "-u",
  "--user",
  "--entrypoint",
  "--label",
  "--mount",
  "--add-host",
  "--shm-size",
]);

type ShellToken = { text: string; quoted: boolean; escaped: boolean };

/** Split one logical shell line into tokens, honoring single/double quotes
 *  (a quoted span is one token, quotes stripped). Backslashes anywhere mark
 *  the token `escaped` — including inside single quotes, where shell treats
 *  them literally; over-flagging there only fails loud, never passes. */
function tokenizeShell(line: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  let started = false;
  let quote: '"' | "'" | null = null;
  const push = () => {
    if (started) tokens.push({ text: current, quoted, escaped });
    current = "";
    quoted = false;
    escaped = false;
    started = false;
  };
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else {
        if (ch === "\\") escaped = true;
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      continue;
    }
    if (ch === "\\") escaped = true;
    current += ch;
    started = true;
  }
  push();
  return tokens;
}

/** A token this guard cannot vouch for: backslash escapes change tokenization
 *  (`note=ok\ <tag>` is ONE shell word), and an UNQUOTED expansion can vanish
 *  at runtime and shift every later argument's role (`--label $EMPTY <tag>`).
 *  A quoted expansion (`"$PWD:/work"`) stays one argument whatever its value,
 *  so roles are stable and it is allowed. (Whole-diff R4.) */
function unsafeToken(t: ShellToken): boolean {
  return t.escaped || (!t.quoted && t.text.includes("$"));
}

/** Every `docker run` occurrence in a continuation block, each sliced from
 *  its own offset — so a compliant invocation cannot mask a later
 *  `&& docker run :latest` or a nested `$(docker run ...)` (whole-diff R4). */
function dockerRunInvocationsOf(block: string): string[] {
  const logical = block.replace(/\\\n/g, " ");
  const slices: string[] = [];
  for (let idx = logical.indexOf("docker run"); idx !== -1; idx = logical.indexOf("docker run", idx + 1)) {
    slices.push(logical.slice(idx));
  }
  return slices;
}

/** Parse one invocation by ARGUMENT ROLE under the strict allowlist grammar.
 *  Returns the positional image argument and the value of a real --platform
 *  flag, or null when the invocation cannot be vouched for — unknown flag,
 *  attached short value, unsafe token, or no image. Callers treat null as a
 *  loud failure, so every escape from the grammar fails the build. */
function parseDockerRunInvocation(invocation: string): { image: string; platform: string | null } | null {
  const tokens = tokenizeShell(invocation);
  if (tokens[0]?.text !== "docker" || tokens[1]?.text !== "run") return null;
  let platform: string | null = null;
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (unsafeToken(token)) return null;
    if (!token.text.startsWith("-")) {
      return token.text.length > 0 ? { image: token.text, platform } : null;
    }
    const eq = token.text.indexOf("=");
    if (eq !== -1) {
      const flag = token.text.slice(0, eq);
      if (!VALUE_TAKING_DOCKER_FLAGS.has(flag)) return null;
      if (flag === "--platform") platform = token.text.slice(eq + 1);
    } else if (BOOLEAN_DOCKER_FLAGS.has(token.text)) {
      // boolean flag: no value to consume
    } else if (VALUE_TAKING_DOCKER_FLAGS.has(token.text)) {
      const value = tokens[++i];
      if (!value || unsafeToken(value)) return null;
      if (token.text === "--platform") platform = value.text;
    } else {
      return null; // unknown flag (incl. attached short values like -v/x:/y)
    }
  }
  return null; // no positional image argument found
}

function discoverPinnedImageWorkflows(): Array<{ file: string; yaml: string }> {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((file) => ({ file, yaml: readFileSync(join(WORKFLOWS_DIR, file), "utf8") }))
    .filter(({ yaml }) => yaml.includes(IMAGE_MARKER));
}

describe("every workflow referencing the pinned Playwright image matches the installed @playwright/test exactly", () => {
  const installed = installedPlaywrightVersion();
  const pinnedRef = `${IMAGE_MARKER}:v${installed}-jammy`;
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

      it("runs the image at least once, and every image-bearing docker run invocation pins linux/amd64 and the exact tag by argument role", () => {
        const blocks = [...yaml.matchAll(DOCKER_BLOCK_RE)].map((m) => m[0]);
        const invocations = blocks
          .flatMap((b) => dockerRunInvocationsOf(b))
          .filter((inv) => inv.includes(IMAGE_MARKER));
        expect(
          invocations.length,
          `${file} references the image but has no docker run invocation naming it`,
        ).toBeGreaterThan(0);
        for (const invocation of invocations) {
          const parsed = parseDockerRunInvocation(invocation);
          expect(
            parsed,
            `${file}: image-bearing docker run invocation could not be role-parsed ` +
              `(unknown flag, attached short value, shell escape, unquoted expansion, or no image). ` +
              `Restructure it to the workflows' canonical shape:\n${invocation}`,
          ).not.toBeNull();
          expect(
            parsed!.image,
            `${file}: the image ARGUMENT of a docker run invocation must be the exact pinned tag v${installed}-jammy`,
          ).toBe(pinnedRef);
          expect(
            parsed!.platform,
            `${file}: a docker run of the pinned image is missing a real --platform linux/amd64 flag`,
          ).toBe("linux/amd64");
        }
      });
    });
  }
});

describe("docker-run role parser sensitivity (whole-diff R3 + R4 bypass shapes)", () => {
  const pinned = `${IMAGE_MARKER}:v${installedPlaywrightVersion()}-jammy`;
  const parseAll = (block: string) =>
    dockerRunInvocationsOf(block).map((inv) => parseDockerRunInvocation(inv));

  it("R3 flag-value smuggle: pinned tag + platform inside a --label value, real image :latest", () => {
    const [parsed] = parseAll(
      `docker run --label 'note=${pinned} --platform linux/amd64' ${IMAGE_MARKER}:latest bash`,
    );
    expect(parsed).toEqual({ image: `${IMAGE_MARKER}:latest`, platform: null });
  });

  it("R3 smuggle via a quoted -e value with no platform flag at all", () => {
    const [parsed] = parseAll(
      `docker run --rm -e NOTE="${pinned} --platform linux/amd64" ${IMAGE_MARKER}:latest bash`,
    );
    expect(parsed).toEqual({ image: `${IMAGE_MARKER}:latest`, platform: null });
  });

  it("R4 unknown flag before the image fails loud, never shifts roles silently", () => {
    const [parsed] = parseAll(`docker run --platform linux/amd64 --quiet ${IMAGE_MARKER}:latest ${pinned}`);
    expect(parsed).toBeNull();
  });

  it("R4 attached short-option value (-v/tmp:/work) fails loud", () => {
    const [parsed] = parseAll(`docker run --rm -v/tmp:/work ${pinned} bash`);
    expect(parsed).toBeNull();
  });

  it("R4 backslash escape in a flag value fails loud", () => {
    const [parsed] = parseAll(`docker run --label note=ok\\ ${pinned} ${IMAGE_MARKER}:latest bash`);
    expect(parsed).toBeNull();
  });

  it("R4 unquoted expansion as a flag value fails loud (empty expansion would shift roles)", () => {
    const [parsed] = parseAll(`docker run --label $EMPTY ${pinned} ${IMAGE_MARKER}:latest bash`);
    expect(parsed).toBeNull();
  });

  it("R4 a compliant invocation cannot mask a chained unpinned one — both are parsed", () => {
    const results = parseAll(
      `docker run --rm --platform linux/amd64 ${pinned} true && docker run ${IMAGE_MARKER}:latest true`,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ image: pinned, platform: "linux/amd64" });
    // The second invocation surfaces its own (unpinned) image — the per-
    // invocation assertions in the main suite fail it against the exact tag.
    expect(results[1]?.image).toBe(`${IMAGE_MARKER}:latest`);
  });

  it("accepts a real continuation block in the workflows' shape (quoted $PWD volume allowed)", () => {
    const real = `docker run --rm --platform linux/amd64 --network host \\\n  -v "$PWD:/work" \\\n  -w /work \\\n  -e CI=true \\\n  ${pinned} \\\n  bash -lc "corepack enable && pnpm screenshot:help"`;
    const [parsed] = parseAll(real);
    expect(parsed).toEqual({ image: pinned, platform: "linux/amd64" });
  });

  it("accepts the --platform=VALUE equals form", () => {
    const [parsed] = parseAll(`docker run --rm --platform=linux/amd64 ${pinned} bash`);
    expect(parsed).toEqual({ image: pinned, platform: "linux/amd64" });
  });

  it("returns null (loud, not vacuous) for a block that is not docker run", () => {
    expect(parseDockerRunInvocation(`docker build -t x .`)).toBeNull();
  });
});
