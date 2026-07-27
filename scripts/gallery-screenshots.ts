/**
 * scripts/gallery-screenshots.ts — attention-gallery screenshot capture sweep
 * (spec docs/superpowers/specs/2026-07-26-gallery-screenshot-capture-design.md).
 *
 * Pure core (this file, unit-tested in tests/scripts/gallery-screenshots.test.ts):
 * filter parsing, entry derivation, index building, scroll-container picking,
 * prior-index loading, reconciliation, and the run orchestrator that owns EVERY
 * filesystem effect through an injected adapter — the browser layer only returns
 * encoded WebP buffers. Crash contract (§4): captures land in `.staging/`; canonical
 * names and index.json mutate only during the terminal finalize, so an aborted run
 * leaves the prior artifact fully intact.
 *
 * The browser-driving `captureGallery()` (plan Task 3) composes this core with
 * Playwright; it is exercised by tests/e2e/screenshots-gallery-capture.spec.ts.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { CAPTURE_LAUNCH_ARGS } from "./capture-launch-args";
import {
  disableAnimations,
  encodeWebp,
  installDeterminism,
  waitForQuiescence,
} from "./capture-core";
import type { ExcludedScenario, GallerySwitcherScenario } from "@/lib/dev/galleryModalTypes";
import { partitionScenarios } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import type { TestAuthFixture } from "@/tests/e2e/helpers/fixtures";
import { signInAs } from "@/tests/e2e/helpers/signInAs";

export const GALLERY_OUTPUT_DIR = "screenshots/attention-gallery";
export const GALLERY_STAGING_DIR = `${GALLERY_OUTPUT_DIR}/.staging`;
export const GALLERY_INDEX_PATH = `${GALLERY_OUTPUT_DIR}/index.json`;
export const GALLERY_VIEWPORT = { width: 1280, height: 800 } as const;
export const GALLERY_THEMES = ["light", "dark"] as const;
export type GalleryTheme = (typeof GALLERY_THEMES)[number];

/** The §7 catalog-derived subset reconciliation joins prior entries against. */
export type RenderedCatalogEntry = Pick<
  GallerySwitcherScenario,
  "id" | "label" | "tier" | "group" | "codes"
>;

export type GalleryIndexEntry = {
  id: string;
  label: string;
  tier: number;
  group: string;
  codes: string[];
  capturedAt: string;
  files: {
    light: string;
    dark: string;
    lightOverflow: string | null;
    darkOverflow: string | null;
  };
};

export type GalleryIndex = {
  generatedAt: string;
  viewport: { width: number; height: number };
  themes: GalleryTheme[];
  scenarios: GalleryIndexEntry[];
  excluded: ExcludedScenario[];
};

export type GalleryPartition = {
  rendered: GallerySwitcherScenario[];
  excluded: ExcludedScenario[];
};

/**
 * §2/§5: comma-split, trim, drop empties, dedup; selection keeps the rendered
 * (group-sorted) catalog order, never the filter's. Unknown/excluded ids and an
 * empty rendered catalog fail loud before any browser launches.
 */
export function parseScenarioFilter(
  raw: string | undefined,
  partition: GalleryPartition,
): GallerySwitcherScenario[] {
  if (partition.rendered.length === 0) {
    throw new Error(
      "attention-gallery catalog has no rendered scenarios - catalog regression, nothing to capture",
    );
  }
  const wanted = [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ];
  if (wanted.length === 0) return partition.rendered;

  const renderedIds = new Set(partition.rendered.map((s) => s.id));
  for (const id of wanted) {
    if (renderedIds.has(id)) continue;
    const excluded = partition.excluded.find((e) => e.id === id);
    if (excluded) {
      throw new Error(
        `GALLERY_SCENARIO "${id}" is an excluded scenario (reason: ${excluded.reason}) - it never renders in the modal`,
      );
    }
    throw new Error(
      `GALLERY_SCENARIO "${id}" is not a rendered scenario. Valid ids: ${[...renderedIds].join(", ")}`,
    );
  }
  const wantedSet = new Set(wanted);
  return partition.rendered.filter((s) => wantedSet.has(s.id));
}

export type GalleryRunPlan = {
  baseUrl: string;
  testAuthSecret: string;
  selected: GallerySwitcherScenario[];
  entries: GalleryIndexEntry[];
};

/**
 * §5: the pre-launch composition. Every input-guard throw happens here, BEFORE
 * `chromium.launch` — captureGallery hands the browser layer a validated plan.
 * Env contract (§2): TEST_AUTH_SECRET required; SCREENSHOT_BASE_URL optional
 * override of the port-3004 default.
 */
export function prepareRun(
  env: Record<string, string | undefined>,
  partition: GalleryPartition,
  now: string,
): GalleryRunPlan {
  const testAuthSecret = env.TEST_AUTH_SECRET;
  if (!testAuthSecret) {
    throw new Error("TEST_AUTH_SECRET is required before gallery screenshot capture");
  }
  const selected = parseScenarioFilter(env.GALLERY_SCENARIO, partition);
  return {
    baseUrl: env.SCREENSHOT_BASE_URL ?? "http://localhost:3004",
    testAuthSecret,
    selected,
    entries: deriveIndexEntries(selected, now),
  };
}

/** §5 identity guard: the error a label mismatch raises before any shot is taken. */
export function buildScenarioMismatchError(
  id: string,
  expectedLabel: string,
  actualText: string,
): Error {
  return new Error(
    `scenario "${id}" did not render: control bar shows ${JSON.stringify(actualText)} instead of ${JSON.stringify(expectedLabel)} - likely a stale server on :3004; stop it or rebuild`,
  );
}

export function deriveIndexEntries(
  selected: GallerySwitcherScenario[],
  now: string,
): GalleryIndexEntry[] {
  return selected.map((s) => ({
    id: s.id,
    label: s.label,
    tier: s.tier,
    group: s.group,
    codes: [...s.codes],
    capturedAt: now,
    files: {
      light: `${s.id}-light.webp`,
      dark: `${s.id}-dark.webp`,
      lightOverflow: null,
      darkOverflow: null,
    },
  }));
}

export function buildIndex(
  scenarios: GalleryIndexEntry[],
  excluded: ExcludedScenario[],
  now: string,
): GalleryIndex {
  return {
    generatedAt: now,
    viewport: { ...GALLERY_VIEWPORT },
    themes: [...GALLERY_THEMES],
    scenarios,
    excluded,
  };
}

/**
 * §4 step 7: SELF-CONTAINED on purpose — no imports, no closure captures — because
 * the browser side re-implements nothing: an evaluate returns candidate metrics,
 * Node runs THIS tested function, and a second evaluate scrolls the winner by tag.
 * Overflow predicate `scrollHeight > clientHeight + 1`; greatest
 * clientWidth*clientHeight area wins (height ties between the w-60 rail and the
 * flex-1 content pane resolve to the wider pane); area ties break toward the LAST
 * in document order; none → null.
 */
export function pickScrollContainer(
  candidates: { scrollHeight: number; clientHeight: number; clientWidth: number }[],
): number | null {
  let winner: number | null = null;
  let winnerArea = -1;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (c.scrollHeight <= c.clientHeight + 1) continue;
    const area = c.clientWidth * c.clientHeight;
    if (area >= winnerArea) {
      winner = i;
      winnerArea = area;
    }
  }
  return winner;
}

/**
 * §6 prior-index boundary: absent → {null, null}; unreadable / malformed /
 * schema-invalid → {null, one-line warning}. The read seam returns null for a
 * missing file and throws for an unreadable one.
 */
export function loadPriorIndex(
  read: (path: string) => string | null,
  path: string,
): { prior: GalleryIndex | null; warning: string | null } {
  let rawText: string | null;
  try {
    rawText = read(path);
  } catch (error) {
    return { prior: null, warning: `prior index at ${path} is unreadable (${String(error)})` };
  }
  if (rawText === null) return { prior: null, warning: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { prior: null, warning: `prior index at ${path} is not valid JSON - treating as empty` };
  }
  if (!isGalleryIndex(parsed)) {
    return {
      prior: null,
      warning: `prior index at ${path} does not match the index schema - treating as empty`,
    };
  }
  return { prior: parsed, warning: null };
}

function isGalleryIndex(value: unknown): value is GalleryIndex {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.generatedAt !== "string" || !Array.isArray(v.scenarios)) return false;
  return v.scenarios.every((s) => {
    if (typeof s !== "object" || s === null) return false;
    const e = s as Record<string, unknown>;
    const files = e.files as Record<string, unknown> | undefined;
    return (
      typeof e.id === "string" &&
      typeof e.capturedAt === "string" &&
      typeof files === "object" &&
      files !== null &&
      typeof files.light === "string" &&
      typeof files.dark === "string"
    );
  });
}

/**
 * §6 end-of-run reconciliation — pure over (prior | null, captured entries, the
 * current rendered catalog, the on-disk *.webp basenames). Returns the index to
 * write plus the WebPs to delete. index.json and .staging/ are outside the file
 * universe by construction (callers pass canonical *.webp basenames only).
 */
export function reconcile(
  prior: GalleryIndex | null,
  captured: GalleryIndexEntry[],
  renderedCatalog: RenderedCatalogEntry[],
  filesOnDisk: string[],
  excluded: ExcludedScenario[],
  now: string,
): { index: GalleryIndex; filesToDelete: string[] } {
  const catalogById = new Map(renderedCatalog.map((c) => [c.id, c]));
  const capturedIds = new Set(captured.map((e) => e.id));
  const disk = new Set(filesOnDisk);

  const survivors: GalleryIndexEntry[] = [...captured];
  const filesToDelete = new Set<string>();

  for (const entry of prior?.scenarios ?? []) {
    if (capturedIds.has(entry.id)) continue; // recaptured: fresh entry wins
    const catalogRow = catalogById.get(entry.id);
    const referenced = [
      entry.files.light,
      entry.files.dark,
      entry.files.lightOverflow,
      entry.files.darkOverflow,
    ].filter((f): f is string => f !== null);
    const dropped = catalogRow === undefined || referenced.some((f) => !disk.has(f));
    if (dropped) {
      for (const f of referenced) if (disk.has(f)) filesToDelete.add(f);
      continue;
    }
    // Carry forward: metadata refreshed from the CURRENT catalog (id is the join
    // key); only files + capturedAt travel from the prior entry (§6 rule 1).
    survivors.push({
      id: catalogRow.id,
      label: catalogRow.label,
      tier: catalogRow.tier,
      group: catalogRow.group,
      codes: [...catalogRow.codes],
      capturedAt: entry.capturedAt,
      files: { ...entry.files },
    });
  }

  // Keep the catalog's rendered order in the final index.
  const orderById = new Map(renderedCatalog.map((c, i) => [c.id, i]));
  survivors.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));

  const referencedNow = new Set(
    survivors.flatMap((e) =>
      [e.files.light, e.files.dark, e.files.lightOverflow, e.files.darkOverflow].filter(
        (f): f is string => f !== null,
      ),
    ),
  );
  for (const f of filesOnDisk) {
    if (!referencedNow.has(f)) filesToDelete.add(f);
  }

  return { index: buildIndex(survivors, excluded, now), filesToDelete: [...filesToDelete] };
}

/** All filesystem effects flow through this seam (spec §8.1). Paths are repo-relative. */
export type GalleryFsAdapter = {
  read: (path: string) => string | null;
  mkdir: (path: string) => void;
  write: (path: string, data: Buffer | string) => void;
  rename: (from: string, to: string) => void;
  delete: (path: string) => void;
  list: (path: string) => string[];
};

export type GalleryCaptureResult = { shot: Buffer; overflow: Buffer | null };

/**
 * §4 run orchestrator. Owns EVERY filesystem effect: discards leftover staging
 * FIRST, routes every capture write into `.staging/`, and finalizes only after all
 * captures succeed — renames, then reconciliation deletes, then index.json LAST.
 * A capture-callback throw aborts before finalize with zero canonical mutation.
 */
export async function runGallerySweep(opts: {
  fs: GalleryFsAdapter;
  warn: (line: string) => void;
  partition: GalleryPartition;
  env: Record<string, string | undefined>;
  now: string;
  capture: (
    scenario: GallerySwitcherScenario,
    theme: GalleryTheme,
  ) => Promise<GalleryCaptureResult>;
}): Promise<GalleryIndex> {
  const { fs, warn, partition, env, now, capture } = opts;
  const plan = prepareRun(env, partition, now);

  fs.mkdir(GALLERY_OUTPUT_DIR);
  fs.mkdir(GALLERY_STAGING_DIR);
  for (const leftover of fs.list(GALLERY_STAGING_DIR)) {
    fs.delete(`${GALLERY_STAGING_DIR}/${leftover}`);
  }

  const entriesById = new Map(plan.entries.map((e) => [e.id, e]));
  const staged: { basename: string }[] = [];
  // THEME-major on purpose (§3 item 2): the browser layer holds one authenticated
  // context per theme, and a second signInAs revokes the prior context's session —
  // so all of theme A's scenarios capture before theme B begins.
  for (const theme of GALLERY_THEMES) {
    for (const scenario of plan.selected) {
      const result = await capture(scenario, theme);
      const entry = entriesById.get(scenario.id)!;
      const shotName = `${scenario.id}-${theme}.webp`;
      fs.write(`${GALLERY_STAGING_DIR}/${shotName}`, result.shot);
      staged.push({ basename: shotName });
      if (result.overflow) {
        const overflowName = `${scenario.id}-${theme}-overflow.webp`;
        fs.write(`${GALLERY_STAGING_DIR}/${overflowName}`, result.overflow);
        staged.push({ basename: overflowName });
        if (theme === "light") entry.files.lightOverflow = overflowName;
        else entry.files.darkOverflow = overflowName;
      }
    }
  }

  // FINALIZE. Prior index + disk state are read now; canonical mutations begin here.
  const { prior, warning } = loadPriorIndex(fs.read, GALLERY_INDEX_PATH);
  if (warning) warn(warning);
  const canonicalWebps = fs.list(GALLERY_OUTPUT_DIR).filter((f) => f.endsWith(".webp"));

  for (const { basename } of staged) {
    fs.rename(`${GALLERY_STAGING_DIR}/${basename}`, `${GALLERY_OUTPUT_DIR}/${basename}`);
  }
  const stagedNames = new Set(staged.map((s) => s.basename));
  const diskAfterRenames = [...new Set([...canonicalWebps, ...stagedNames])];

  const { index, filesToDelete } = reconcile(
    prior,
    plan.entries,
    partition.rendered,
    diskAfterRenames,
    partition.excluded,
    now,
  );
  for (const f of filesToDelete) {
    fs.delete(`${GALLERY_OUTPUT_DIR}/${f}`);
  }
  fs.write(GALLERY_INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

const GALLERY_ROUTE = "/admin/dev/attention-gallery";
const DIALOG_SELECTOR = '[data-testid="published-show-review-modal"]';
const CONTROLS_SELECTOR = '[data-testid="attention-switcher-controls"]';
const SCAN_ATTR = "data-gallery-scan-idx";

// The JWT-arm developer identity (same fixture the gallery acceptance suite
// uses): requireDeveloper() admits the developer:true claim without any seed.
const DEVELOPER_FIXTURE: TestAuthFixture = {
  email: "fxav-developer@example.com",
  isAdmin: true,
  label: "developer (gallery capture)",
};

/** node:fs-backed adapter; paths are repo-relative per the GalleryFsAdapter contract. */
function realFsAdapter(root: string): GalleryFsAdapter {
  return {
    read: (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null),
    mkdir: (p) => mkdirSync(join(root, p), { recursive: true }),
    write: (p, data) => writeFileSync(join(root, p), data),
    rename: (from, to) => renameSync(join(root, from), join(root, to)),
    delete: (p) => rmSync(join(root, p), { force: true }),
    list: (p) => (existsSync(join(root, p)) ? readdirSync(join(root, p)) : []),
  };
}

/** Bounded goto retry (pattern: tests/e2e/attention-modal-gallery.spec.ts gotoScenario). */
async function gotoScenario(page: Page, baseUrl: string, id: string): Promise<void> {
  const ATTEMPTS = 3;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await page.goto(`${baseUrl}${GALLERY_ROUTE}?scenario=${encodeURIComponent(id)}`, {
      waitUntil: "domcontentloaded",
    });
    try {
      await page.locator(DIALOG_SELECTOR).waitFor({ state: "visible", timeout: 8000 });
      return;
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
    }
  }
}

/**
 * Overflow companion protocol (§4 step 7): evaluate #1 tags scrollable dialog
 * descendants in document order and returns their metrics; Node runs the
 * unit-tested pickScrollContainer; evaluate #2 scrolls the winner by tag and
 * strips every scan tag. No element handle crosses an evaluate boundary.
 */
async function shootOverflowCompanion(page: Page): Promise<Buffer | null> {
  const metrics = await page.evaluate(
    ({ dialogSelector, scanAttr }) => {
      const out: { scrollHeight: number; clientHeight: number; clientWidth: number }[] = [];
      const dialog = document.querySelector(dialogSelector);
      if (!dialog) return out;
      let idx = 0;
      for (const el of dialog.querySelectorAll("*")) {
        // Candidacy needs actual scrollABILITY, not just clipped content: the
        // modal panel is `overflow-clip` and reports scrollHeight > clientHeight
        // in virtually every scenario, but setting scrollTop on it is a no-op —
        // the first sweep shipped 128/129 "overflow" shots byte-identical to
        // their base shots this way. Computed overflow-y auto|scroll only.
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY !== "auto" && overflowY !== "scroll") continue;
        if (el.scrollHeight > el.clientHeight + 1) {
          el.setAttribute(scanAttr, String(idx));
          out.push({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            clientWidth: el.clientWidth,
          });
          idx += 1;
        }
      }
      return out;
    },
    { dialogSelector: DIALOG_SELECTOR, scanAttr: SCAN_ATTR },
  );

  const winner = pickScrollContainer(metrics);
  await page.evaluate(
    ({ scanAttr, winner: winnerIdx }) => {
      if (winnerIdx !== null) {
        const el = document.querySelector(`[${scanAttr}="${winnerIdx}"]`);
        if (el) el.scrollTop = el.scrollHeight;
      }
      for (const el of document.querySelectorAll(`[${scanAttr}]`)) {
        el.removeAttribute(scanAttr);
      }
    },
    { scanAttr: SCAN_ATTR, winner },
  );
  if (winner === null) return null;

  await page.evaluate(
    async () =>
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return await encodeWebp(await page.screenshot({ type: "png" }));
}

/**
 * The browser-driving sweep (§3 item 2, §4): prepareRun validates BEFORE
 * chromium.launch; themes run strictly sequentially — one authenticated context
 * per theme, CLOSED before the next theme's signInAs (fixture deletion revokes
 * the prior session); one page per scenario with the capture-core determinism
 * init scripts registered pre-navigation. All filesystem effects flow through
 * runGallerySweep's adapter.
 */
export async function captureGallery(): Promise<void> {
  const now = new Date().toISOString();
  const partition = partitionScenarios();
  const plan = prepareRun(process.env, partition, now);

  const browser = await chromium.launch({ args: CAPTURE_LAUNCH_ARGS });
  let context: BrowserContext | null = null;
  let currentTheme: GalleryTheme | null = null;
  try {
    await runGallerySweep({
      fs: realFsAdapter(process.cwd()),
      warn: (line) => console.warn(line),
      partition,
      env: process.env,
      now,
      capture: async (scenario, theme) => {
        if (theme !== currentTheme) {
          if (context) await context.close();
          context = await browser.newContext({
            baseURL: plan.baseUrl,
            colorScheme: theme,
            locale: "en-US",
            reducedMotion: "reduce",
            timezoneId: "America/New_York",
            viewport: { ...GALLERY_VIEWPORT },
          });
          const authPage = await context.newPage();
          try {
            await signInAs(authPage, DEVELOPER_FIXTURE, { baseUrl: plan.baseUrl });
          } finally {
            await authPage.close();
          }
          currentTheme = theme;
        }

        const page = await context!.newPage();
        try {
          await installDeterminism(page, theme);
          await disableAnimations(page);
          await gotoScenario(page, plan.baseUrl, scenario.id);

          // §5 identity guard: catches resolveInitialScenario's silent
          // fallback-to-index-0 against a stale :3004 server build.
          const controlsText = await page.locator(CONTROLS_SELECTOR).innerText();
          if (!controlsText.includes(scenario.label)) {
            throw buildScenarioMismatchError(scenario.id, scenario.label, controlsText);
          }

          await waitForQuiescence(page, { waitForSelector: DIALOG_SELECTOR });
          const shot = await encodeWebp(await page.screenshot({ type: "png" }));
          const overflow = await shootOverflowCompanion(page);
          return { shot, overflow };
        } finally {
          await page.close();
        }
      },
    });
  } finally {
    if (context) await (context as BrowserContext).close();
    await browser.close();
  }
}
