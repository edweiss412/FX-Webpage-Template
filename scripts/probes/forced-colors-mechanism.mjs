/**
 * Forced-colors mechanism probe — spec input for
 * docs/superpowers/specs/2026-09-01-forced-colors-pass.md.
 *
 * WHY THIS EXISTS. The pass's whole design turns on which CSS properties a UA
 * drops, flattens, or leaves alone under `forced-colors: active`, and on whether
 * an authored system-colour keyword survives the forcing. Every one of those is
 * a UA behaviour question, and this repo's spec discipline settles those by
 * probe rather than by recollection (`docs/agents/spec-self-review.md`,
 * "Empirical spike before speccing ... framework surfaces"). Reasoning from the
 * compiled stylesheet alone produced a WRONG headline on this arc: the
 * per-site focus idiom reads as fatal in the CSS while focus is in fact safe,
 * because `app/globals.css:899` is unlayered, wins, and paints an outline that
 * forced colors keeps. Only the browser said so.
 *
 * Be exact about which half loses, because a first draft of this comment said the
 * per-site declarations were "never applied" and the cascade table below refutes
 * it: with forced colors OFF those rows read `box-shadow=present`. The ring paints
 * in normal mode, alongside the outline. What loses is `outline-none` alone, which
 * cannot suppress an unlayered rule. Focus survives forced colors because the
 * outline survives, NOT because the ring was never there.
 *
 * Run: `node scripts/probes/forced-colors-mechanism.mjs`
 * Transcript: docs/superpowers/specs/probes/2026-09-01-forced-colors-mechanism.md
 *
 * The probe reads COMPUTED styles with forced colors off and on for the same
 * element, so every row is a before/after on one input rather than two
 * measurements that might not be comparable. Both engines Playwright ships that
 * implement forced colors are exercised; WebKit does not implement the feature
 * and is deliberately absent (see the transcript's limits section).
 */
import { chromium, firefox } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Properties read back for every case. Everything the pattern can depend on. */
const READ_PROPS = (id) => {
  const s = getComputedStyle(document.getElementById(id));
  return {
    color: s.color,
    background: s.backgroundColor,
    backgroundImage: s.backgroundImage,
    boxShadow: s.boxShadow,
    textShadow: s.textShadow,
    outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
    border: `${s.borderTopStyle} ${s.borderTopWidth} ${s.borderTopColor}`,
    opacity: s.opacity,
  };
};

/** Case id -> the CSS under test. Ids are cited by the spec, so they are stable. */
const CASES = {
  "M1-boxshadow-ring": "box-shadow: 0 0 0 2px #e06000;",
  // M1b exists because the spec licenses text-shadow as a dropped carrier in its
  // durable authoring rule, and round 1 of review found the claim unprobed.
  // Adding a text-shadow carrier is ordinary authoring that rule expressly
  // covers, so the claim is measured rather than inferred from box-shadow.
  "M1b-textshadow": "text-shadow: 0 1px 2px #e06000;",
  "M2-system-keyword-color": "color: Highlight;",
  "M3-system-keyword-pair": "background-color: Canvas; color: CanvasText;",
  "M4-system-keyword-outline": "outline: 2px solid Highlight;",
  "M5-transparent-border": "border: 2px solid transparent;",
  "M6-transparent-outline": "outline: 2px solid transparent;",
  "M7-forced-color-adjust-none":
    "forced-color-adjust: none; background-color: #ff8c1a; color: #0e0f12;",
  "M8-warning-background": "background-color: #fff3d6;",
  "M9-danger-background": "background-color: #fbeae8;",
  "M10-opacity": "opacity: 0.4; color: #1a1b1f;",
  "M11-gradient": "background-image: linear-gradient(#ff8c1a, #e67a0e);",
};

/**
 * M12 is the one case that cannot be expressed as a single declaration block:
 * it asks whether a box-shadow re-declared INSIDE a forced-colors block comes
 * back. The answer decides whether the pattern can repair a dropped shadow by
 * swapping its value (it cannot) or must change the property (it must).
 */
const M12 = `#M12-boxshadow-inside-forced { box-shadow: 0 0 0 2px #e06000; }
@media (forced-colors: active) { #M12-boxshadow-inside-forced { box-shadow: 0 0 0 2px Highlight; } }`;

/**
 * M13 asks whether a custom property re-pointed inside a forced-colors block
 * reaches a property that survives. This is the narrow token-mapping leg.
 */
const M13 = `:root { --probe-edge: #7a3d00; }
@media (forced-colors: active) { :root { --probe-edge: Highlight; } }
#M13-token-repoint { outline: 2px solid var(--probe-edge); }`;

const ids = [...Object.keys(CASES), "M12-boxshadow-inside-forced", "M13-token-repoint"];

const PAGE = `<!doctype html><meta charset="utf-8"><style>
body { background: #fafaf9; color: #1a1b1f; }
${Object.entries(CASES)
  .map(([id, css]) => `#${id} { ${css} }`)
  .join("\n")}
${M12}
${M13}
</style>${ids.map((id) => `<div id="${id}">${id}</div>`).join("")}`;

/**
 * The cascade cases need the REAL compiled stylesheet, because the question is
 * whether an author rule beats Tailwind's emitted `@layer utilities`. A
 * hand-written stand-in for the utility layer would be asking a different
 * question than the one the repo faces.
 */
function compileAppCss() {
  const out = join(mkdtempSync(join(tmpdir(), "fc-probe-")), "app.css");
  execFileSync("pnpm", ["exec", "tailwindcss", "-i", "app/globals.css", "-o", out], {
    stdio: "pipe",
  });
  return readFileSync(out, "utf8");
}

/** The shipped focus idiom, verbatim from the corpus (e.g. components/crew/CrewSubNav.tsx:88-89). */
const FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const CASCADE_RULE = `@media (forced-colors: active) { :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; } }`;

async function runMechanism(engineName, launcher) {
  const browser = await launcher.launch();
  const rows = [];
  for (const forced of [false, true]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setContent(PAGE);
    if (forced) await page.emulateMedia({ forcedColors: "active" });
    for (const id of ids) rows.push({ id, forced, ...(await page.evaluate(READ_PROPS, id)) });
    await ctx.close();
  }
  await browser.close();

  console.log(`\n## Mechanism — ${engineName}\n`);
  for (const id of ids) {
    const off = rows.find((r) => r.id === id && !r.forced);
    const on = rows.find((r) => r.id === id && r.forced);
    const changed = Object.keys(off).filter(
      (k) => k !== "id" && k !== "forced" && off[k] !== on[k],
    );
    console.log(`### ${id}`);
    for (const k of Object.keys(off)) {
      if (k === "id" || k === "forced") continue;
      console.log(
        `  ${changed.includes(k) ? "CHANGED" : "same   "}  ${k}: ${off[k]}  =>  ${on[k]}`,
      );
    }
  }
}

async function runCascade(engineName, launcher, appCss) {
  const browser = await launcher.launch();
  console.log(`\n## Cascade — ${engineName}\n`);
  console.log(
    "Does an author rule reach an element wearing the shipped focus idiom, under forced colors?\n",
  );
  for (const [label, extra] of [
    ["no author rule (control)", ""],
    ["unlayered author rule", CASCADE_RULE],
    ["rule inside @layer base", `@layer base { ${CASCADE_RULE} }`],
    ["rule inside @layer utilities", `@layer utilities { ${CASCADE_RULE} }`],
  ]) {
    for (const forced of [false, true]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.setContent(
        `<!doctype html><meta charset="utf-8"><style>${appCss}\n${extra}</style>` +
          `<button id="native" class="${FOCUS_CLASSES}">native</button>` +
          `<div id="synthetic" tabindex="0" class="${FOCUS_CLASSES}">synthetic</div>`,
      );
      if (forced) await page.emulateMedia({ forcedColors: "active" });
      for (const id of ["native", "synthetic"]) {
        await page.locator(`#${id}`).focus();
        const r = await page.evaluate((i) => {
          const s = getComputedStyle(document.getElementById(i));
          return `outline=${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} offset=${s.outlineOffset} box-shadow=${s.boxShadow === "none" ? "none" : "present"}`;
        }, id);
        console.log(
          `  ${label.padEnd(28)} forced=${String(forced).padEnd(5)} #${id.padEnd(10)} ${r}`,
        );
      }
      await ctx.close();
    }
  }
  await browser.close();
}

const appCss = compileAppCss();
console.log(`compiled app/globals.css: ${appCss.length} bytes`);
for (const [name, launcher] of [
  ["chromium", chromium],
  ["firefox", firefox],
]) {
  await runMechanism(name, launcher);
  await runCascade(name, launcher, appCss);
}
