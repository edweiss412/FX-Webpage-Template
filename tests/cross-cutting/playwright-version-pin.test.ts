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
 *    grammar (whole-diff R3–R5). The guard does NOT emulate shell — it
 *    recognizes exactly the workflows' canonical invocation shape and fails
 *    LOUD on everything else. Concretely, every token before the image must
 *    be STATICALLY WORD-STABLE: a single unmixed segment that is either
 *    single-quoted (no expansion), double-quoted containing only simple
 *    $VAR/${VAR} expansions (one word regardless of value), or plain text
 *    from a conservative character set that excludes every bash word-count-
 *    changing feature (whitespace via escapes, `$`, backticks, braces,
 *    globs, redirections, control operators, backslashes). Continuation
 *    lines are joined the way bash joins them — `\<newline>` deleted, NOT
 *    replaced by a space — so parser word boundaries match bash's. False
 *    failures on exotic-but-valid shell are accepted by design; a silent
 *    false PASS is the only defect class this guard must not have. Every
 *    `docker run` occurrence in a block is parsed from its own offset, so a
 *    compliant invocation cannot mask a chained or nested unpinned one.
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

/** Plain (unquoted) text this guard will vouch for: no whitespace, no bash
 *  expansion or word-splitting trigger of any kind — `$`, backtick, braces,
 *  globs (`*?[]`), tilde, redirections (`<>`), control operators (`;|&()`),
 *  backslash, `#` are all absent. Word count is therefore static. */
const SAFE_PLAIN_RE = /^[A-Za-z0-9_.:,/=-]+$/;

type Segment = { text: string; kind: "plain" | "single" | "double" };
type ShellToken = { text: string; segments: Segment[] };

/** Split one logical shell line into tokens, recording per-token QUOTE
 *  SEGMENTS. `"$PWD:/work"` is one double-quoted segment; `""$SHIFT` is a
 *  double-quoted segment plus a plain one — a MIXED token the safety check
 *  rejects (whole-diff R5: the unquoted part can word-split at runtime). */
function tokenizeShell(line: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let segments: Segment[] = [];
  let current = "";
  let kind: Segment["kind"] = "plain";
  let quote: '"' | "'" | null = null;
  const endSegment = () => {
    if (current.length > 0 || kind !== "plain") segments.push({ text: current, kind });
    current = "";
    kind = "plain";
  };
  const endToken = () => {
    endSegment();
    if (segments.length > 0) {
      tokens.push({ text: segments.map((s) => s.text).join(""), segments });
    }
    segments = [];
  };
  for (const ch of line) {
    if (quote) {
      if (ch === quote) {
        quote = null;
        endSegment();
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      endSegment();
      quote = ch;
      kind = ch === '"' ? "double" : "single";
      continue;
    }
    // ONLY the separators bash itself splits on (default IFS + newline).
    // JS `\s` also matches U+00A0 and friends, which bash keeps INSIDE a
    // word — splitting on those invented boundaries bash does not have
    // (whole-diff R6). Such characters now stay in the token, where the
    // ASCII-only SAFE_PLAIN_RE rejects them loud.
    if (ch === " " || ch === "\t" || ch === "\n") {
      endToken();
      continue;
    }
    current += ch;
  }
  endToken();
  return tokens;
}

/** Every `$` in a double-quoted segment must be a SIMPLE variable —
 *  `$NAME` or `${NAME}` — which expands to exactly one word inside double
 *  quotes whatever its value. `$@`, `${array[@]}`, `$(...)`, `$((...))` all
 *  fail this and are rejected (whole-diff R5: they can change word count or
 *  run commands even when quoted). */
function dollarsAreSimpleVars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "$") continue;
    if (!/^([A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/.test(text.slice(i + 1))) {
      return false;
    }
  }
  return true;
}

/** A token is WORD-STABLE when bash is guaranteed to pass it to docker as
 *  exactly one argv entry with no surprises: one unmixed segment that is
 *  single-quoted (no expansion), double-quoted with only simple $VAR/${VAR}
 *  (and no backticks/backslashes), or plain safe-charset text. */
function tokenWordStable(t: ShellToken): boolean {
  if (t.segments.length !== 1) return false;
  const seg = t.segments[0]!;
  if (seg.kind === "single") return true;
  if (seg.kind === "double") return !/[`\\]/.test(seg.text) && dollarsAreSimpleVars(seg.text);
  return SAFE_PLAIN_RE.test(seg.text);
}

/** Every `docker run` occurrence in a continuation block, each sliced from
 *  its own offset — so a compliant invocation cannot mask a later
 *  `&& docker run :latest` or a nested `$(docker run ...)` (whole-diff R4).
 *  `\<newline>` is DELETED, exactly as bash deletes it — joining with a
 *  space would invent an argument boundary bash does not have
 *  (whole-diff R5: `sh=\<newline>--name` is ONE bash word). */
function dockerRunInvocationsOf(block: string): string[] {
  const logical = block.replace(/\\\n/g, "");
  const slices: string[] = [];
  for (
    let idx = logical.indexOf("docker run");
    idx !== -1;
    idx = logical.indexOf("docker run", idx + 1)
  ) {
    slices.push(logical.slice(idx));
  }
  return slices;
}

/** Parse one invocation by ARGUMENT ROLE under the strict allowlist grammar.
 *  Returns the positional image argument and the value of a real --platform
 *  flag, or null when the invocation cannot be vouched for — unknown flag,
 *  attached short value, non-word-stable token, or no image. Callers treat
 *  null as a loud failure, so every escape from the grammar fails the build. */
function parseDockerRunInvocation(
  invocation: string,
): { image: string; platform: string | null } | null {
  const tokens = tokenizeShell(invocation);
  if (tokens[0]?.text !== "docker" || tokens[1]?.text !== "run") return null;
  let platform: string | null = null;
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!tokenWordStable(token)) return null;
    if (!token.text.startsWith("-")) {
      // Positional: the image. Must be a plain safe-charset word (a quoted
      // or empty image is outside the canonical shape — loud, not vouched).
      const seg = token.segments[0]!;
      return seg.kind === "plain" && SAFE_PLAIN_RE.test(seg.text)
        ? { image: token.text, platform }
        : null;
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
      if (!value || !tokenWordStable(value)) return null;
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
              `(unknown flag, attached short value, or a token that is not statically ` +
              `word-stable). Restructure it to the workflows' canonical shape:\n${invocation}`,
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

describe("docker-run role parser sensitivity (whole-diff R3–R5 bypass shapes)", () => {
  const pinned = `${IMAGE_MARKER}:v${installedPlaywrightVersion()}-jammy`;
  const latest = `${IMAGE_MARKER}:latest`;
  const parseAll = (block: string) =>
    dockerRunInvocationsOf(block).map((inv) => parseDockerRunInvocation(inv));

  it("R3 flag-value smuggle: pinned tag + platform inside a --label value, real image :latest", () => {
    const [parsed] = parseAll(
      `docker run --label 'note=${pinned} --platform linux/amd64' ${latest} bash`,
    );
    expect(parsed).toEqual({ image: latest, platform: null });
  });

  it("R3 smuggle via a quoted -e value with no platform flag at all", () => {
    // NOTE="..." is a MIXED token (plain prefix + quoted segment) under the
    // R5 word-stability rule, so the parser refuses to vouch at all — a loud
    // failure, which is even stronger than surfacing the :latest image.
    const [parsed] = parseAll(
      `docker run --rm -e NOTE="${pinned} --platform linux/amd64" ${latest} bash`,
    );
    expect(parsed).toBeNull();
  });

  it("R4 unknown flag before the image fails loud, never shifts roles silently", () => {
    const [parsed] = parseAll(`docker run --platform linux/amd64 --quiet ${latest} ${pinned}`);
    expect(parsed).toBeNull();
  });

  it("R4 attached short-option value (-v/tmp:/work) fails loud", () => {
    const [parsed] = parseAll(`docker run --rm -v/tmp:/work ${pinned} bash`);
    expect(parsed).toBeNull();
  });

  it("R4 backslash escape in a flag value fails loud", () => {
    const [parsed] = parseAll(`docker run --label note=ok\\ ${pinned} ${latest} bash`);
    expect(parsed).toBeNull();
  });

  it("R4 unquoted expansion as a flag value fails loud (empty expansion would shift roles)", () => {
    const [parsed] = parseAll(`docker run --label $EMPTY ${pinned} ${latest} bash`);
    expect(parsed).toBeNull();
  });

  it("R4 a compliant invocation cannot mask a chained unpinned one — both are parsed", () => {
    const results = parseAll(
      `docker run --rm --platform linux/amd64 ${pinned} true && docker run ${latest} true`,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ image: pinned, platform: "linux/amd64" });
    // The second invocation surfaces its own (unpinned) image — the per-
    // invocation assertions in the main suite fail it against the exact tag.
    expect(results[1]?.image).toBe(latest);
  });

  it("R5 continuation join matches bash: `x=\\<newline>--flag` is ONE word, roles shift loud", () => {
    // Joined with a space (the old bug) this parsed as pinned+amd64 while
    // bash ran the smuggled image. Bash-correct joining makes `sh=--name`
    // one token, so the image role lands on the smuggled token and the
    // exact-tag assertion fails loud.
    const [parsed] = parseAll(
      `docker run --entrypoint sh=\\\n--name alpine:latest --platform linux/amd64 ${pinned}`,
    );
    expect(parsed?.image).not.toBe(pinned);
  });

  it('R5 mixed-quoting token (""$SHIFT) is not word-stable — fails loud', () => {
    const [parsed] = parseAll(`docker run --entrypoint ""$SHIFT --platform linux/amd64 ${pinned}`);
    expect(parsed).toBeNull();
  });

  it('R5 quoted multi-word expansions ("$@", "${array[@]}") fail loud', () => {
    expect(parseAll(`docker run --entrypoint "$@" --platform linux/amd64 ${pinned}`)[0]).toBeNull();
    expect(
      parseAll(`docker run --entrypoint "\${array[@]}" --platform linux/amd64 ${pinned}`)[0],
    ).toBeNull();
  });

  it("R5 legacy backtick substitution fails loud", () => {
    const [parsed] = parseAll(
      "docker run --entrypoint `emit_args` --platform linux/amd64 " + pinned,
    );
    expect(parsed).toBeNull();
  });

  it("R5 brace expansion fails loud", () => {
    const [parsed] = parseAll(
      `docker run --entrypoint {sh,alpine:latest} --platform linux/amd64 ${pinned}`,
    );
    expect(parsed).toBeNull();
  });

  it("R5 pathname expansion (glob) fails loud", () => {
    const [parsed] = parseAll(`docker run --entrypoint * --platform linux/amd64 ${pinned}`);
    expect(parsed).toBeNull();
  });

  it("R6 Unicode whitespace (U+00A0) is NOT a separator — stays in the token and fails loud", () => {
    // Bash keeps U+00A0 inside a word; a tokenizer splitting on JS \s would
    // report a platform pin bash never hands docker. The NBSP-joined token
    // is one plain word containing non-ASCII, rejected by SAFE_PLAIN_RE.
    const nbsp = "\u00a0";
    const [parsed] = parseAll(`docker run --env X=1${nbsp}--platform${nbsp}linux/amd64 ${pinned}`);
    expect(parsed).toBeNull();
  });

  it("R5 shell redirection before the image fails loud", () => {
    const [parsed] = parseAll(`docker run --rm >/dev/null --platform linux/amd64 ${pinned}`);
    expect(parsed).toBeNull();
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
