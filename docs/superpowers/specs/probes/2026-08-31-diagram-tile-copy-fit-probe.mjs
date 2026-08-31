/**
 * Empirical spike for the DiagramTile state-copy split (spec self-review rule:
 * measure, do not estimate). Renders the two RATIFIED strings at the four tile
 * widths `diagramTileWidthAt` produces, in Inter at --text-xs, and reports the
 * laid-out height of each against the height of the 4:3 box it would have to
 * fit inside.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const fontB64 = readFileSync(
  join(ROOT, "public/fonts/InterVariable-latin.d5549562.woff2"),
).toString("base64");

// Mirrors components/admin/wizard/diagramTileGeometry.ts exactly.
const MODAL_OUTER_PAD = 48, MODAL_PANEL_MAX = 1024, MODAL_RAIL = 240,
  CONTENT_PAD = 40, CARD_BOX = 42, TILE_GAP = 8;
const diagramTileWidthAt = (v) => {
  const panel = Math.min(v - (v >= 640 ? MODAL_OUTER_PAD : 0), MODAL_PANEL_MAX);
  const main = v >= 1024 ? panel - MODAL_RAIL : panel;
  const card = main - CONTENT_PAD - CARD_BOX;
  const cols = v >= 640 ? 4 : 3;
  return (card - TILE_GAP * (cols - 1)) / cols;
};

const VIEWPORTS = [320, 390, 640, 1072];
const STRINGS = {
  "absent (ratified)": "Not captured. Won't appear on the crew page.",
  "load-failed (ratified)": "Preview couldn't load. The diagram will still publish.",
  "today's string": "Preview unavailable",
  "a long diagram name": "Main stage plot rev 4",
};

const page = await (await chromium.launch()).newPage();
await page.setContent(`<!doctype html><html><head><style>
@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;
  src:url(data:font/woff2;base64,${fontB64}) format("woff2");}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Inter",ui-sans-serif,system-ui,sans-serif;font-optical-sizing:auto}
/* --text-xs: 0.75rem / 1.4, DESIGN.md 2.2 */
.xs{font-size:.75rem;line-height:1.4}
/* the placeholder box as it ships today: grid place-items-center gap-1 px-1 */
.box{display:grid;place-items:center;gap:4px;padding-inline:4px;text-align:center;overflow:hidden}
.icon{width:16px;height:16px;flex:none}
</style></head><body><div id="out"></div></body></html>`);
await page.evaluate(() => document.fonts.ready);

const rows = await page.evaluate(
  ({ widths, strings }) => {
    const out = [];
    const host = document.getElementById("out");
    for (const { viewport, w } of widths) {
      for (const [label, text] of Object.entries(strings)) {
        const box = document.createElement("div");
        box.className = "box";
        box.style.width = `${w}px`;
        const icon = document.createElement("span");
        icon.className = "icon";
        const t = document.createElement("span");
        t.className = "xs";
        t.textContent = text;
        box.append(icon, t);
        host.append(box);
        const textH = t.getBoundingClientRect().height;
        // icon 16 + gap 4 + text, which is what `grid gap-1` lays out.
        const needed = 16 + 4 + textH;
        out.push({
          viewport,
          tileW: Math.round(w * 10) / 10,
          boxH: Math.round(w * 0.75 * 10) / 10,
          label,
          lines: Math.round(textH / 16.8),
          textH: Math.round(textH * 10) / 10,
          neededH: Math.round(needed * 10) / 10,
        });
        box.remove();
      }
    }
    return out;
  },
  {
    widths: VIEWPORTS.map((v) => ({ viewport: v, w: diagramTileWidthAt(v) })),
    strings: STRINGS,
  },
);

for (const r of rows) {
  const fits = r.neededH <= r.boxH;
  console.log(
    `${String(r.viewport).padStart(4)}px  tile ${String(r.tileW).padStart(5)}  box-h ${String(r.boxH).padStart(5)}  ` +
      `${r.label.padEnd(22)} lines ${r.lines}  text-h ${String(r.textH).padStart(5)}  needs ${String(r.neededH).padStart(5)}  ` +
      (fits ? "FITS" : `OVERFLOWS by ${Math.round((r.neededH - r.boxH) * 10) / 10}`),
  );
}
await page.context().browser().close();
