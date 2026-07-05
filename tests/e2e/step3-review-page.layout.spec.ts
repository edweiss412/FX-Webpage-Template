/**
 * tests/e2e/step3-review-page.layout.spec.ts (Variant B — spec §7 dimensional invariants)
 *
 * Real-browser layout assertions for the redesigned Step-3 "Review & publish"
 * page shell. jsdom computes NO layout, so a fixed-dimension collapse (Tailwind
 * v4 flex parents are not relied on to stretch children implicitly) passes unit
 * tests — these MUST run end-to-end in a real browser.
 *
 * STANDALONE static harness (no app boot / no Supabase / no seed): modelled on
 * tests/e2e/step3-schedule-bookend-layout.spec.ts — compile the REAL token CSS
 * from app/globals.css via the Tailwind CLI, write a static harness.html that
 * transcribes the redesigned shell markup, serve over HTTP, measure
 * getBoundingClientRect().
 *
 * FIDELITY: every class string below is copied VERBATIM from the shell components
 * so the compiled Tailwind resolves identically. Keep in sync with:
 *   - StepIndicator            → components/admin/OnboardingWizard.tsx
 *   - Step3SheetCard (compact) → components/admin/wizard/Step3SheetCard.tsx
 *   - Step3PublishBar          → components/admin/wizard/Step3PublishBar.tsx
 *   - the wizard container     → components/admin/OnboardingWizard.tsx
 *   - Step3ReviewWithFinalize wrapper (relative flex min-h-full w-full flex-col + pb-24)
 *
 * Invariants (spec §7):
 *   DI-1: the stepper does not overflow at 320px.
 *   DI-2: the card's visible checkbox box + View/Review button are vertically
 *         centered within the card.
 *   DI-3: the sticky bar spans the container width, does not occlude the last
 *         card, keeps Publish within the viewport, and baselines its idle row.
 *   DI-4: at 360px the card does not overflow and its right cluster wraps below
 *         the title.
 *
 * Runs via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");

// A lucide-style Check glyph (done pills render a <Check/> — the harness inlines
// an equivalent svg so the pill has the same in-box content).
const CHECK_SVG = `<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>`;

// StepIndicator (OnboardingWizard.tsx) — step=3: pills 1,2 done, pill 3 active.
function stepper(): string {
  const base =
    "flex size-7 shrink-0 items-center justify-center rounded-pill border text-xs font-semibold tabular-nums transition-colors duration-fast";
  const labelInactive = "text-xs font-medium whitespace-nowrap sm:text-sm hidden text-text-subtle sm:inline";
  const labelActive = "text-xs font-medium whitespace-nowrap sm:text-sm font-semibold text-text-strong";
  const done = (n: number, label: string) => `
    <div class="flex items-center gap-2">
      <a data-testid="wizard-step-indicator-${n}" class="${base} border-border-strong bg-surface text-text-subtle">${CHECK_SVG}</a>
      <span class="${labelInactive}">${label}</span>
    </div>
    <span data-testid="wizard-step-connector" aria-hidden="true" class="h-px max-w-[60px] flex-1 rounded-full bg-border-strong"></span>`;
  const active = (n: number, label: string) => `
    <div class="flex items-center gap-2">
      <a data-testid="wizard-step-indicator-${n}" class="${base} border-transparent bg-accent text-accent-text">${n}</a>
      <span class="${labelActive}">${label}</span>
    </div>`;
  return `<nav aria-label="Onboarding progress" data-testid="wizard-step-indicator" class="flex items-center gap-2 sm:gap-3">
    ${done(1, "Share folder")}${done(2, "Verify")}${active(3, "Review &amp; publish")}
    <span class="sr-only">Step 3 of 3</span>
  </nav>`;
}

// Step3SheetCard (compact selectable variant) — needsLook toggles the warn border,
// the chip, and the View↔Review label.
function card(dfid: string, title: string, needsLook: boolean): string {
  const border = needsLook ? "border-border-strong" : "border-border";
  const chip = needsLook
    ? `<span data-testid="wizard-step3-card-${dfid}-review-chip" class="inline-flex items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-text"><span aria-hidden="true" class="size-1.5 rounded-full bg-status-review"></span>2 need a look</span>`
    : "";
  const btnBorder = needsLook ? " border border-border-strong" : "";
  const btnLabel = needsLook ? "Review" : "View";
  return `<article data-testid="wizard-step3-card-${dfid}" class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border ${border} bg-surface p-tile-pad shadow-tile">
    <label class="relative -m-3 inline-flex shrink-0 cursor-pointer items-center justify-center p-3">
      <input type="checkbox" class="peer sr-only" data-testid="wizard-step3-checkbox-${dfid}" />
      <span aria-hidden="true" data-testid="wizard-step3-card-${dfid}-checkbox-box" class="flex size-5 items-center justify-center rounded-sm border-2 border-border-strong bg-bg"></span>
    </label>
    <div class="min-w-0 flex-1">
      <p data-testid="wizard-step3-card-${dfid}-title" class="truncate text-base font-semibold text-text-strong">${title}</p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle">
        <span data-testid="wizard-step3-card-${dfid}-client">Acme Capital</span>
        <span aria-hidden="true" class="size-[3px] shrink-0 rounded-full bg-border-strong"></span>
        <span data-testid="wizard-step3-card-${dfid}-dates">Travel in Apr 9 · Show Apr 10 – Apr 11</span>
        <span aria-hidden="true" class="size-[3px] shrink-0 rounded-full bg-border-strong"></span>
        <span data-testid="wizard-step3-card-${dfid}-venue">Grand Ballroom</span>
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:justify-between">
      ${chip}
      <button type="button" data-testid="wizard-step3-card-${dfid}-more" class="inline-flex min-h-tap-min shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken${btnBorder}">${btnLabel}</button>
    </div>
  </article>`;
}

// Enough cards to exceed the viewport height so DI-3's occlusion scroll is
// meaningful; at least one needs-a-look card.
function cards(): string {
  const list: string[] = [];
  for (let i = 0; i < 8; i++) {
    list.push(card(`c${i}`, `Show ${i} — A Reasonably Long Title For The Compact Row`, i === 1));
  }
  return list.join("\n");
}

// Step3PublishBar (Step3PublishBar.tsx) + the bar children from
// Step3ReviewWithFinalize (count, Back, the AccentButton finalize trigger).
function bar(): string {
  return `<div data-testid="wizard-step3-publish-bar" class="sticky bottom-0 z-10 flex w-full flex-wrap items-end gap-x-3 gap-y-2 border-t border-border bg-surface/90 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
    <p data-testid="wizard-step3-publish-count" class="text-sm tabular-nums text-text-subtle"><b class="text-text-strong">3</b> of 8 selected to publish</p>
    <div class="ml-auto flex items-end gap-3">
      <a data-testid="wizard-step3-back" href="/admin?step=2" class="inline-flex min-h-tap-min items-center rounded-md px-3 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong">Back</a>
      <button data-testid="wizard-finalize-button" class="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-tile">Publish 3 shows &amp; finish setup</button>
    </div>
  </div>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">
  <div data-testid="onboarding-wizard" class="mx-auto flex max-w-3xl flex-col gap-section-gap">
    <div class="flex items-center justify-between gap-3">${stepper()}</div>
    <div class="relative flex min-h-full w-full flex-col">
      <div class="pb-24">
        <section data-testid="wizard-step3" class="flex flex-col gap-section-gap">
          <header class="flex flex-col gap-2">
            <h1 data-testid="wizard-step3-heading" class="text-2xl font-semibold text-text-strong sm:text-[28px]">Review what we found</h1>
            <p data-testid="wizard-step3-summary" class="max-w-prose text-base text-text-subtle"><b class="font-semibold text-text-strong">8 sheets</b> parsed from your Drive folder.</p>
          </header>
          <ul data-testid="wizard-step3-card-grid" class="flex flex-col gap-3" style="list-style:none;margin:0;padding:0;">
            ${cards()}
          </ul>
        </section>
      </div>
      ${bar()}
    </div>
  </div>
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "step3-review-page-"));
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));

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
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(body);
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

test.describe("Step-3 review page — layout dimensions (spec §7)", () => {
  test("DI-1: the stepper does not overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(baseUrl);
    // Measure the stepper's intrinsic CONTENT width against the container it lives
    // in — comparing the nav to ITSELF would pass even when the nav grows past its
    // parent (nav.scrollWidth === nav.clientWidth). The container is the width the
    // stepper must fit within at 320px.
    const nav = page.getByTestId("wizard-step-indicator");
    const container = page.getByTestId("onboarding-wizard");
    const navScrollW = await nav.evaluate((n) => n.scrollWidth);
    const contClientW = await container.evaluate((c) => c.clientWidth);
    expect(navScrollW).toBeLessThanOrEqual(contClientW + 0.5);
  });

  test("DI-2: the card checkbox box + button are vertically centered within the card", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(baseUrl);
    // A SELECTABLE card (one that actually has the visible checkbox box). Scope to
    // the ARTICLE, not a descendant testid.
    const cardEl = page
      .locator('article[data-testid^="wizard-step3-card-"]:has([data-testid$="-checkbox-box"])')
      .first();
    const rects = await cardEl.evaluate((el) => {
      const c = el.getBoundingClientRect();
      const box = el.querySelector('[data-testid$="-checkbox-box"]')!.getBoundingClientRect();
      const btn = el.querySelector('[data-testid$="-more"]')!.getBoundingClientRect();
      const mid = (r: DOMRect) => r.top + r.height / 2;
      return { cardMid: mid(c), boxMid: mid(box), btnMid: mid(btn) };
    });
    expect(Math.abs(rects.boxMid - rects.cardMid)).toBeLessThanOrEqual(1);
    expect(Math.abs(rects.btnMid - rects.cardMid)).toBeLessThanOrEqual(1);
  });

  test("DI-3: the sticky bar spans the container width and does not occlude the last card", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.goto(baseUrl);
    const barEl = page.getByTestId("wizard-step3-publish-bar");
    const container = page.getByTestId("onboarding-wizard");
    const [barW, contW] = await Promise.all([
      barEl.evaluate((b) => b.getBoundingClientRect().width),
      container.evaluate((c) => c.getBoundingClientRect().width),
    ]);
    expect(Math.abs(barW - contW)).toBeLessThanOrEqual(0.5);

    // Not-occluded: scroll the last card into view (the list is unbounded → it
    // starts below the fold), settle at the absolute bottom, then assert the
    // body's bottom padding keeps it clear of the sticky bar.
    const lastCard = page.locator('article[data-testid^="wizard-step3-card-"]').last();
    await lastCard.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastCardBottom = await lastCard.evaluate((el) => el.getBoundingClientRect().bottom);
    const barTop = await barEl.evaluate((b) => b.getBoundingClientRect().top);
    expect(lastCardBottom).toBeLessThanOrEqual(barTop + 0.5);

    // The idle bar's Publish button is fully within the viewport…
    const vh = page.viewportSize()!.height;
    const pubRect = await page.getByTestId("wizard-finalize-button").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { bottom: r.bottom, mid: r.top + r.height / 2 };
    });
    expect(pubRect.bottom).toBeLessThanOrEqual(vh + 0.5);

    // …and the idle-row items (count · Back · Publish) sit within the bar's box.
    const barBox = await barEl.evaluate((b) => {
      const r = b.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const backMid = await page.getByTestId("wizard-step3-back").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const countMid = await page.getByTestId("wizard-step3-publish-count").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    for (const m of [pubRect.mid, backMid, countMid]) {
      expect(m).toBeGreaterThanOrEqual(barBox.top - 0.5);
      expect(m).toBeLessThanOrEqual(barBox.bottom + 0.5);
    }
  });

  test("DI-4: at 360px the card does not overflow and its right cluster wraps below the title", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(baseUrl);
    const cardEl = page
      .locator('article[data-testid^="wizard-step3-card-"]:has([data-testid$="-checkbox-box"])')
      .first();
    // No horizontal overflow within the card at mobile width.
    const { scrollW, clientW } = await cardEl.evaluate((el) => ({
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    }));
    expect(scrollW).toBeLessThanOrEqual(clientW + 0.5);
    // The right cluster (the -more button) has wrapped to its own row: its top is
    // at/below the title's bottom.
    const { titleBottom, btnTop } = await cardEl.evaluate((el) => ({
      titleBottom: el.querySelector('[data-testid$="-title"]')!.getBoundingClientRect().bottom,
      btnTop: el.querySelector('[data-testid$="-more"]')!.getBoundingClientRect().top,
    }));
    expect(btnTop).toBeGreaterThanOrEqual(titleBottom - 0.5);
  });
});
