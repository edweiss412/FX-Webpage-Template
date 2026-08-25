import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";
import { CAPTURE_LAUNCH_ARGS } from "./capture-launch-args";
import { GeometryMismatchError } from "./capture-geometry";
import { type CaptureTheme, disableAnimations, installDeterminism } from "./capture-core";
import {
  buildRunHeader,
  completedIdentities,
  createStagingDir,
  expectedIdentities,
} from "./capture-evidence";
import { quiesceWithLayer0, SelectorAbsentError } from "./capture-layer0";
import { captureOrRefuse, type CapturedEntry } from "./capture-refusal";
import { MANIFEST, type ManifestEntry } from "./help-screenshots.manifest";
import { parseFixtureDateRangeFromPath } from "./help-screenshots-fixture-range";
import { ADMIN_FIXTURE } from "@/tests/e2e/helpers/fixtures";
import { signInAs } from "@/tests/e2e/helpers/signInAs";

const DEFAULT_BASE_URL = "http://localhost:3004";
const OUTPUT_DIR = join(process.cwd(), "public/help/screenshots");
const REQUIRED_TEST_AUTH = "true";
export const EVIDENCE_FILENAME = "capture-evidence.json";

function requireCaptureEnv(): { baseUrl: string; testAuthSecret: string } {
  if (process.env.ENABLE_TEST_AUTH !== REQUIRED_TEST_AUTH) {
    throw new Error("ENABLE_TEST_AUTH=true is required before screenshot capture");
  }

  const testAuthSecret = process.env.TEST_AUTH_SECRET;
  if (!testAuthSecret) {
    throw new Error("TEST_AUTH_SECRET is required before screenshot capture");
  }

  return {
    baseUrl: process.env.SCREENSHOT_BASE_URL ?? DEFAULT_BASE_URL,
    testAuthSecret,
  };
}

function fixturePathFor(entry: ManifestEntry): string {
  const rawPath = join(process.cwd(), "fixtures/shows/raw", `${entry.fixture}.md`);
  if (existsSync(rawPath)) return rawPath;

  const pdfOnlyPath = join(process.cwd(), "fixtures/shows/pdf-only", `${entry.fixture}__INFO.md`);
  if (existsSync(pdfOnlyPath)) return pdfOnlyPath;

  throw new Error(
    `Fixture "${entry.fixture}" for screenshot "${entry.key}" was not found in raw/ or pdf-only/`,
  );
}

function validateFrozenClockInstant(entry: ManifestEntry): void {
  const frozen = new Date(entry.frozenClockInstant);
  if (Number.isNaN(frozen.getTime())) {
    throw new Error(`Invalid frozenClockInstant for ${entry.key}: ${entry.frozenClockInstant}`);
  }

  const range = parseFixtureDateRangeFromPath(fixturePathFor(entry));
  const latestExclusive = new Date(range.latest);
  latestExclusive.setUTCDate(latestExclusive.getUTCDate() + 1);
  if (frozen < range.earliest || frozen >= latestExclusive) {
    throw new Error(
      [
        `frozenClockInstant for ${entry.key} is outside fixture range`,
        `fixture=${entry.fixture}`,
        `instant=${entry.frozenClockInstant}`,
        `range=${range.earliest.toISOString()}..${range.latest.toISOString()}`,
      ].join(" "),
    );
  }
}

function themesFor(entry: ManifestEntry): CaptureTheme[] {
  if (entry.theme === "light" || entry.theme === "dark") return [entry.theme];
  return ["light", "dark"];
}

async function captureEntryTheme(
  context: BrowserContext,
  entry: ManifestEntry,
  theme: CaptureTheme,
  baseUrl: string,
  testAuthSecret: string,
  stagingDir: string,
): Promise<CapturedEntry> {
  await context.clock.install({ time: new Date(entry.frozenClockInstant) });

  const page = await context.newPage();
  try {
    await installDeterminism(page, theme);
    await disableAnimations(page);
    await signInAs(page, ADMIN_FIXTURE, { baseUrl });
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": entry.frozenClockInstant,
      Authorization: `Bearer ${testAuthSecret}`,
    });
    await page.goto(new URL(entry.route, baseUrl).toString(), { waitUntil: "domcontentloaded" });

    // Layer 0 owns the wait, so a capture selector that never resolves is an
    // attributed refusal rather than a bare timeout naming nothing.
    await quiesceWithLayer0(page, {
      waitForSelector: entry.waitFor ?? entry.captureSelector ?? "body",
      ...(entry.captureSelector !== undefined ? { captureSelector: entry.captureSelector } : {}),
      ...(entry.expectStableMs !== undefined ? { stableMs: entry.expectStableMs } : {}),
    });

    return await captureOrRefuse(
      page,
      entry,
      theme,
      stagingDir,
      join(OUTPUT_DIR, `${entry.key}-${theme}.webp`),
    );
  } finally {
    await page.close();
  }
}

export async function captureAll(): Promise<void> {
  const { baseUrl, testAuthSecret } = requireCaptureEnv();
  for (const entry of MANIFEST) {
    validateFrozenClockInstant(entry);
  }

  // This launch produces the drift-gated WebPs — Playwright config
  // launchOptions do NOT reach it, so the determinism args must be consumed
  // here directly (shared constant; Codex R2 finding on PR #22).
  const browser = await chromium.launch({
    args: CAPTURE_LAUNCH_ARGS,
  });

  // Created EMPTY, which is what makes "this file exists" mean "this run wrote
  // it". The oracle reads this directory, never public/help/screenshots/, where
  // the committed baselines are already on disk before capture begins.
  const stagingDir = createStagingDir(process.cwd());
  const entries: CapturedEntry[] = [];
  let refusal: unknown = null;

  try {
    outer: for (const entry of MANIFEST) {
      for (const theme of themesFor(entry)) {
        const context = await browser.newContext({
          baseURL: baseUrl,
          colorScheme: theme,
          locale: "en-US",
          reducedMotion: "reduce",
          timezoneId: "America/New_York",
          viewport: entry.viewport,
        });
        try {
          entries.push(
            await captureEntryTheme(context, entry, theme, baseUrl, testAuthSecret, stagingDir),
          );
        } catch (error: unknown) {
          // A refusal still records an entry — the outcome most in need of
          // evidence is the one that would otherwise leave none — then aborts.
          entries.push(refusedEntry(entry, theme, error));
          refusal = error;
          break outer;
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    await writeEvidence(stagingDir, entries);
  }

  if (refusal !== null) throw refusal;

  // The oracle runs BEFORE the publish, which is what makes "only a clean run
  // publishes" true rather than aspirational. It reads the staging directory, so
  // the order is free: with the copy first, a run that produced 13 of 14
  // identities had already overwritten the committed baselines IN PLACE by the
  // time it threw. The throw still reddened the run, so nothing shipped, but the
  // operator was left diagnosing a half-republished baseline set -- and "the
  // capture overwrites in place" is exactly why a was-a-file-created check
  // cannot see this class.
  assertCompleteCapture(stagingDir, expectedIdentities());
  publishStaging(stagingDir, OUTPUT_DIR);
}

/**
 * The identity oracle, EXPORTED so it is executable without a browser.
 *
 * It ran only inside `captureAll`, which launches Chromium and needs a seeded
 * database, so nothing exercised it: the scoped tests scan this file's SOURCE
 * TEXT and never run the chain. Whole-diff review r4a named the consequence --
 * a one-edit no-op of the publish below leaves staging and the evidence
 * verifier green while the byte gate compares untouched committed baselines,
 * so real drift ships silently.
 */
export function assertCompleteCapture(stagingDir: string, expectedIds: readonly string[]): void {
  const produced = completedIdentities(stagingDir).sort();
  const expected = [...expectedIds].sort();
  if (produced.join("|") === expected.join("|")) return;

  const missing = expected.filter((id) => !produced.includes(id));
  const unexpected = produced.filter((id) => !expected.includes(id));
  throw new Error(
    `capture produced ${produced.length} identities, expected ${expected.length}: ` +
      `missing ${missing.join(", ") || "none"}` +
      // Without this arm a count mismatch with nothing missing reports
      // "missing none", which reads as a contradiction. Two manifest entries
      // sharing key+theme collide in staging and land exactly there.
      (unexpected.length > 0 ? `; unexpected ${unexpected.join(", ")}` : ""),
  );
}

/**
 * Publish staging into the directory the byte gate reads. Returns the names
 * copied, so a caller (and a test) can tell "published nothing" from
 * "published everything" -- the void version could not, which is what made a
 * no-op invisible.
 */
export function publishStaging(stagingDir: string, outputDir: string): string[] {
  mkdirSync(outputDir, { recursive: true });
  const names = readdirSync(stagingDir);
  for (const name of names) {
    copyFileSync(join(stagingDir, name), join(outputDir, name));
  }
  return names;
}

function refusedEntry(
  entry: { key: string; frozenClockInstant: string },
  theme: CaptureTheme,
  error: unknown,
): CapturedEntry {
  const selectorAbsent = error instanceof SelectorAbsentError;
  const geometryMismatch = error instanceof GeometryMismatchError ? error : null;
  return {
    key: entry.key,
    theme,
    capturedAtUtc: new Date().toISOString(),
    frozenClockInstant: entry.frozenClockInstant,
    // Spec section 4.2.1 and plan Task 3 both require the MISSING SELECTOR in the
    // entry, not only in the throw's message. `SelectorAbsentError` has carried
    // it as a field all along and the record discarded it, so an operator
    // triaging a refused capture from the artifact alone could not tell WHICH
    // selector failed to resolve without parsing prose.
    ...(selectorAbsent ? { absentSelector: error.selector } : {}),
    // Spec section 6: a geometry refusal carries the OBSERVED DIMENSIONS. They
    // are the narrowing evidence the operator gets in exchange for the honest
    // ceiling that unique attribution needs dataflow this arc declines. Without
    // them the record says only "geometry moved" and the measurement that makes
    // that actionable lives in a log line nobody keeps.
    ...(geometryMismatch !== null
      ? {
          geometry: {
            baselineWidth: geometryMismatch.baselineWidth,
            baselineHeight: geometryMismatch.baselineHeight,
            capturedWidth: geometryMismatch.capturedWidth,
            capturedHeight: geometryMismatch.capturedHeight,
          },
        }
      : {}),
    pixelWidth: null,
    pixelHeight: null,
    pixelSha256: null,
    webpBytes: null,
    webpSha256: null,
    faultHits: selectorAbsent ? error.markers : ((error as { reasons?: string[] }).reasons ?? []),
    refusedReason: selectorAbsent
      ? error.refusedReason
      : error instanceof Error
        ? error.name
        : "unknown",
  };
}

async function writeEvidence(stagingDir: string, entries: CapturedEntry[]): Promise<void> {
  const record = { ...buildRunHeader(process.env), entries };
  await writeFile(join(stagingDir, EVIDENCE_FILENAME), `${JSON.stringify(record, null, 2)}\n`);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  copyFileSync(join(stagingDir, EVIDENCE_FILENAME), join(OUTPUT_DIR, EVIDENCE_FILENAME));
}

async function main(): Promise<void> {
  await captureAll();
}

const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("scripts/help-screenshots.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
