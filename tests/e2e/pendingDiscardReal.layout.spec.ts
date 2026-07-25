/**
 * tests/e2e/pendingDiscardReal.layout.spec.ts
 * Real-TREE layout proof for the pending-discard fork
 * (spec 2026-07-25-destruct-thumb-order-drift-guard §6.3.a).
 *
 * The sibling `pendingDiscardReflow.layout.spec.ts` transcribes classes into
 * local constants. Adversarial rounds 2 and 3 both landed on the same defect in
 * that approach: a transcription can satisfy every assertion while the SHIPPED
 * component differs. The concrete case is `w-full` on the `@container` root —
 * load-bearing, because `container-type: inline-size` collapses a shrink-to-fit
 * flex item to 0px — which a transcribed panel supplies from the harness rather
 * than from the component.
 *
 * So every POSITIVE claim about the shipped component lives here, measured
 * against markup rendered by the real component tree
 * (`tests/e2e/_pendingDiscardHarness.tsx` renders the real NeedsAttentionInbox,
 * hence the real PendingPanelDiscardButtons inside real card padding, the real
 * action row and the real `Retry now` sibling). The transcribed spec keeps only
 * negative controls — markup the product no longer contains.
 *
 * SCOPE: `renderToStaticMarkup` emits markup, not behaviour. Classes and layout
 * are provable here; client effects (useEffect, timers, ResizeObserver) are not,
 * and stay in the jsdom suite.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_MIN = 44;
const INGESTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Live geometries. 320 = dashboard rail (`min-[1240px]:w-80`); 390 = the mobile
 *  Needs-attention page; 900 = a full-width card. Single source for the widths so
 *  a threshold change cannot leave a panel testing the old boundary. */
const STATES = {
  rail320: 320,
  page390: 390,
  thresholdUnder617: 617,
  thresholdAt618: 618,
  wide900: 900,
} as const;
/** Component container width at the two threshold rails: the card consumes 42px
 *  (1px borders + 20px p-tile-pad, both sides), so 618 - 42 = 576 exactly. */
const THRESHOLD = 576;
type StateName = keyof typeof STATES;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "pending-discard-real-"));
  const jsonPath = join(workDir, "states.json");

  // The harness's JSX + the real component tree break react-dom/server under
  // Playwright's transform, so it runs OUT of process (same as the modal-header
  // family harnesses).
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_pendingDiscardHarness.tsx"), jsonPath],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const states = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, string>;

  const body = Object.entries(states)
    .map(([name, html]) => `<section data-state="${name}">${html}</section>`)
    .join("\n");
  const harnessHtml = `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="out.css"></head>
<body class="bg-bg" style="margin:0;padding:16px;">${body}</body></html>`;
  writeFileSync(join(workDir, "harness.html"), harnessHtml);

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const payload = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(payload);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

type Box = { x: number; y: number; w: number; h: number; bottom: number; right: number };
type Probe = {
  found: { row: boolean; root: boolean; stacked: boolean; inline: boolean; buttons: boolean };
  railW: number;
  rowW: number;
  rootW: number;
  stackedW: number;
  inlineW: number;
  liveBranchW: number;
  rootHasWFull: boolean;
  rootHasContainer: boolean;
  liveBranch: "stacked" | "inline" | "none";
  stackedDisplay: string;
  inlineDisplay: string;
  defer: Box;
  ignore: Box;
};

async function probe(page: import("@playwright/test").Page, state: StateName): Promise<Probe> {
  return page.evaluate(
    ({ state, id }) => {
      const root = document.querySelector(`[data-state="${state}"]`)!;
      const pick = (t: string) => root.querySelector(`[data-testid="${t}-${id}"]`);
      const rail = root.querySelector('[data-testid="rail"]')!;

      // Every element is ADDRESSED by test id, never inferred from DOM shape.
      // Round 5: a probe that guessed the branches via `:scope > div > div`
      // matched nothing and reported missing/missing, so the assertion could
      // never go green no matter what shipped.
      const discardRoot = pick("discard-root") as HTMLElement | null;
      const branchStacked = pick("discard-branch-stacked") as HTMLElement | null;
      const branchInline = pick("discard-branch-inline") as HTMLElement | null;
      // Variant-suffixed button ids (the bare ones are retired by §4.4). Whichever
      // branch is live owns the pair we measure.
      const deferStacked = pick("admin-pending-defer-stacked") as HTMLElement | null;
      const deferInline = pick("admin-pending-defer-inline") as HTMLElement | null;
      const ignoreStacked = pick("admin-pending-ignore-stacked") as HTMLElement | null;
      const ignoreInline = pick("admin-pending-ignore-inline") as HTMLElement | null;

      const vis = (el: HTMLElement | null) =>
        el !== null && getComputedStyle(el).display !== "none";
      const liveStacked = vis(branchStacked);
      const defer = liveStacked ? deferStacked : deferInline;
      const ignore = liveStacked ? ignoreStacked : ignoreInline;

      const ZERO = { x: 0, y: 0, w: 0, h: 0, bottom: 0, right: 0 };
      const b = (el: Element | null) => {
        if (!el) return ZERO;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
      };
      const w = (el: Element | null) => (el ? el.getBoundingClientRect().width : -1);
      // Addressed by id, not inferred: round 6 caught that `discardRoot.parentElement`
      // would silently measure an intermediate wrapper, so the w-full oracle could
      // pass while the root no longer filled the real action row.
      const row = pick("pending-action-row") as HTMLElement | null;

      return {
        // `found` lets a missing element fail as a readable assertion rather than a
        // null deref, which is how round 5's version broke.
        found: {
          row: row !== null,
          root: discardRoot !== null,
          stacked: branchStacked !== null,
          inline: branchInline !== null,
          buttons: defer !== null && ignore !== null,
        },
        railW: w(rail),
        rowW: w(row),
        rootW: w(discardRoot),
        stackedW: w(branchStacked),
        inlineW: w(branchInline),
        liveBranchW: liveStacked ? w(branchStacked) : w(branchInline),
        rootHasWFull: discardRoot ? discardRoot.classList.contains("w-full") : false,
        rootHasContainer: discardRoot ? discardRoot.classList.contains("@container") : false,
        liveBranch: liveStacked ? "stacked" : vis(branchInline) ? "inline" : "none",
        stackedDisplay: branchStacked ? getComputedStyle(branchStacked).display : "missing",
        inlineDisplay: branchInline ? getComputedStyle(branchInline).display : "missing",
        defer: b(defer),
        ignore: b(ignore),
      };
    },
    { state, id: INGESTION_ID },
  );
}

for (const [state, width] of Object.entries(STATES) as [StateName, number][]) {
  test(`${state}: the shipped root carries w-full + @container and does NOT collapse`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl);
    const p = await probe(page, state);

    expect(p.found.root, "discard-root-* not found — is the fork implemented?").toBe(true);
    expect(p.found.row, "pending-action-row-* not found — is the parent labelled?").toBe(true);
    // Read off RENDERED markup, not the source file: this is the assertion round 3
    // showed was missing everywhere, and it is why this spec exists.
    expect(p.rootHasContainer, "shipped root must carry @container").toBe(true);
    expect(p.rootHasWFull, "shipped root must carry w-full").toBe(true);

    // The direct 0px-collapse test. `container-type: inline-size` severs inline size
    // from contents, so a shrink-to-fit root measures 0 and the buttons shrink to
    // ~26px. This assertion cannot pass if w-full is dropped.
    expect(p.rootW, "container root collapsed — w-full missing?").toBeGreaterThan(0);
    // Exact oracle: `w-full` fills the parent action row's content box. Comparing
    // against the RAIL would be wrong by the card's borders + padding (round 4).
    expect(Math.abs(p.rootW - p.rowW), `root ${p.rootW} vs row ${p.rowW}`).toBeLessThanOrEqual(TOL);
    expect(width).toBeGreaterThan(0); // width participates via STATES, kept for the label
  });

  test(`${state}: exactly one branch copy is displayed`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl);
    const p = await probe(page, state);
    expect(p.found.stacked && p.found.inline, "both branch containers must exist").toBe(true);
    const hiddenCount = [p.stackedDisplay, p.inlineDisplay].filter((d) => d === "none").length;
    expect(hiddenCount, `displays: ${p.stackedDisplay} / ${p.inlineDisplay}`).toBe(1);
    expect(p.liveBranch, "exactly one branch must be live").not.toBe("none");
  });

  test(`${state}: D2 — tap targets clear ${TAP_MIN}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(baseUrl);
    const p = await probe(page, state);
    expect(p.found.buttons, "variant-suffixed button ids not found").toBe(true);
    expect(p.defer.h, "D2: Defer below tap minimum").toBeGreaterThanOrEqual(TAP_MIN - TOL);
    expect(p.ignore.h, "D2: Ignore below tap minimum").toBeGreaterThanOrEqual(TAP_MIN - TOL);
  });
}

test("rail320 + page390: the safe action is NOT above the destructive one", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  for (const state of ["rail320", "page390"] as StateName[]) {
    const p = await probe(page, state);
    const stacked = p.ignore.y >= p.defer.bottom - TOL || p.defer.y >= p.ignore.bottom - TOL;
    if (stacked) {
      // D5: when they stack, Ignore must be ABOVE Defer.
      expect(p.ignore.bottom, `${state}: Ignore must sit above Defer when stacked`).toBeLessThanOrEqual(
        p.defer.y + TOL,
      );
    } else {
      // D3: when they share a row, Defer must be on the LEFT.
      expect(p.defer.x, `${state}: Defer must be left of Ignore when inline`).toBeLessThan(p.ignore.x);
    }
  }
});

test("wide900: they share one row with Defer on the left", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  const p = await probe(page, "wide900");
  expect(Math.abs(p.ignore.y - p.defer.y)).toBeLessThanOrEqual(TOL);
  expect(p.defer.x).toBeLessThan(p.ignore.x);
});

test("the 576px threshold switches which branch is live (idle markup only)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  const under = await probe(page, "thresholdUnder617");
  const at = await probe(page, "thresholdAt618");

  // The rails are chosen so the COMPONENT container lands on 575 / 576 exactly.
  expect(Math.abs(at.rootW - THRESHOLD), `root at 618px rail = ${at.rootW}`).toBeLessThanOrEqual(
    TOL,
  );
  expect(under.rootW).toBeLessThan(THRESHOLD);

  // Below: stacked, safe action lower. At/above: inline, Defer on the left.
  expect(under.ignore.bottom, "below threshold must stack Ignore above Defer").toBeLessThanOrEqual(
    under.defer.y + TOL,
  );
  expect(Math.abs(at.ignore.y - at.defer.y), "at threshold must be one row").toBeLessThanOrEqual(
    TOL,
  );
  expect(at.defer.x).toBeLessThan(at.ignore.x);
});

test("D1: in the stacked branch, both buttons fill the branch width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  for (const state of ["rail320", "page390", "thresholdUnder617"] as StateName[]) {
    const p = await probe(page, state);
    expect(p.liveBranch, `${state} should be stacked`).toBe("stacked");
    // Round 6: D1 was claimed but never measured. `self-start` on a button shrinks
    // it to intrinsic width while keeping every canonical token, the 44px height,
    // the correct order and one visible branch — the whole suite passed with D1
    // false. Comparing against the BRANCH is the only assertion that catches it.
    expect(Math.abs(p.defer.w - p.liveBranchW), `${state} Defer ${p.defer.w} vs branch ${p.liveBranchW}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(p.ignore.w - p.liveBranchW), `${state} Ignore ${p.ignore.w} vs branch ${p.liveBranchW}`).toBeLessThanOrEqual(TOL);
  }
});

test("D3: inline button widths are intrinsic, not stretched", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseUrl);
  for (const state of ["thresholdAt618", "wide900"] as StateName[]) {
    const p = await probe(page, state);
    expect(p.liveBranch, `${state} should be inline`).toBe("inline");
    // Round 7: D3 was measured only as shared-row placement + left-to-right order.
    // Giving both inline buttons flex growth preserves the row, the ordering, the
    // threshold switch, the tap heights and D6's pinned left edge while D3 is false.
    // Neither button may fill the branch.
    expect(p.defer.w, `${state} Defer stretched to branch width`).toBeLessThan(p.liveBranchW - TOL);
    expect(p.ignore.w, `${state} Ignore stretched to branch width`).toBeLessThan(
      p.liveBranchW - TOL,
    );
    expect(p.defer.right).toBeLessThan(p.ignore.x);
  }
});
