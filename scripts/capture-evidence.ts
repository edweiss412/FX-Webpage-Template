import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { MANIFEST, type ManifestEntry } from "./help-screenshots.manifest";

/** Files land here during a run. See STAGING_DIR_NAME's contract below. */
export const STAGING_DIR_NAME = ".capture-staging";

export type RunHeader = {
  eventName: string;
  runnerName: string;
  runnerArch: string;
  runnerOs: string;
  cpuModel: string;
  cpuCount: number;
};

/**
 * SHA-256 over DECODED RGB, never the PNG container.
 *
 * A container hash is not a render identity: the same pixels re-encoded at two
 * compression levels produce different container hashes, so a container hash
 * would report a render change whenever only the encoding moved. Alpha is
 * dropped so an opaque capture and its alpha-carrying re-encode agree.
 */
export async function pixelSha256(pngBuffer: Buffer): Promise<string> {
  const { data } = await sharp(pngBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Create the staging directory EMPTY, removing whatever a previous run left.
 *
 * Emptiness at start is the load-bearing property. It is what makes "this file
 * exists" mean "this run wrote it" — production is certified by the provenance
 * of the workspace, never by any property of the artifact. A read-back proves
 * matching bytes exist; it cannot prove which run produced them, and against a
 * directory holding the committed baselines it passes without the capture
 * having written anything at all.
 */
export function createStagingDir(parent: string): string {
  const dir = join(parent, STAGING_DIR_NAME);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The `(entry.key, theme)` identities whose artifacts are present in `dir`. */
export function completedIdentities(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".webp"))
    .map((name) => name.slice(0, -".webp".length));
}

function themesFor(entry: ManifestEntry): ("light" | "dark")[] {
  if (entry.theme === "light" || entry.theme === "dark") return [entry.theme];
  return ["light", "dark"];
}

/**
 * The expected identity set, DERIVED from the manifest rather than written
 * down. A literal count passes unchanged the day someone adds an entry and the
 * capture silently skips it.
 */
export function expectedIdentities(): string[] {
  return MANIFEST.flatMap((entry) => themesFor(entry).map((theme) => `${entry.key}-${theme}`));
}

/**
 * The run-level header.
 *
 * Every field is read from the environment the CAPTURE runs in, which is inside
 * `docker run`. None of these variables crosses that boundary without an
 * explicit `-e NAME` passthrough, so an absent value here means the workflow
 * step is missing one — recorded as an empty string, which the CI parser
 * rejects, rather than as `undefined`, which a jq check reads as absent.
 */
export function buildRunHeader(env: NodeJS.ProcessEnv | Record<string, string>): RunHeader {
  const core = cpus();
  return {
    eventName: env.GITHUB_EVENT_NAME ?? "",
    runnerName: env.RUNNER_NAME ?? "",
    runnerArch: env.RUNNER_ARCH ?? "",
    runnerOs: env.RUNNER_OS ?? "",
    cpuModel: core[0]?.model ?? "",
    cpuCount: core.length,
  };
}
