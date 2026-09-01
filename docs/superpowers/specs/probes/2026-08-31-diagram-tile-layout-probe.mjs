/**
 * Second half of the DiagramTile spike: (A) does TODAY's placeholder already
 * clip its own content, and (B) how tall is the proposed caption-below-the-box
 * layout. Same font, same tile widths as measure-tile-copy.mjs.
 *
 * MEASUREMENT ONLY: it reports today's clipping and the proposed layout's heights and makes no pass/fail claim, so it
 * always exits 0. The probe that GATES is
 * docs/superpowers/specs/probes/2026-08-31-diagram-tile-grid-probe.mjs, which sets a
 * non-zero exit code on a bad ratio or clipped copy.
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

const M = { PAD: 48, MAX: 1024, RAIL: 240, CONTENT: 40, CARD: 42, GAP: 8 };
const tileW = (v) => {
  const panel = Math.min(v - (v >= 640 ? M.PAD : 0), M.MAX);
  const main = v >= 1024 ? panel - M.RAIL : panel;
  const card = main - M.CONTENT - M.CARD;
  return (card - M.GAP * ((v >= 640 ? 4 : 3) - 1)) / (v >= 640 ? 4 : 3);
};

const ABSENT = "Not captured. Won't appear on the crew page.";
const FAILED = "Preview couldn't load. The diagram will still publish.";
const NAME = "Main stage plot rev 4";

const page = await (await chromium.launch()).newPage();
await page.setContent(`<!doctype html><html><head><style>
@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;
  src:url(data:font/woff2;base64,${fontB64}) format("woff2");}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Inter",ui-sans-serif,system-ui,sans-serif;font-optical-sizing:auto}
.xs{font-size:.75rem;line-height:1.4}
.xsr{font-size:.75rem;line-height:1.625}
.today{display:grid;place-items:center;gap:4px;padding-inline:4px;text-align:center;
  aspect-ratio:4/3;overflow:hidden;border:1px solid #000}
.icon{width:16px;height:16px}
.trunc{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* The PROPOSED arm ships a two-line clamp, not a single ellipsised line. Arm (A)
   below keeps .trunc because it models TODAY, which really was one line. */
.nameNew{max-width:100%;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;
  -webkit-line-clamp:2;overflow-wrap:break-word}
.wrap{display:flex;flex-direction:column;gap:4px}
.boxNew{aspect-ratio:4/3;display:grid;place-items:center;overflow:hidden;border:1px solid #000}
</style></head><body><div id="out"></div></body></html>`);
await page.evaluate(() => document.fonts.ready);

const rows = await page.evaluate(
  ({ widths, ABSENT, FAILED, NAME }) => {
    const host = document.getElementById("out");
    const out = [];
    const mk = (html, w) => {
      const el = document.createElement("div");
      el.style.width = `${w}px`;
      el.innerHTML = html;
      host.append(el);
      return el;
    };
    for (const { viewport, w } of widths) {
      // (A) TODAY's placeholder: icon + "Preview unavailable" + truncated name,
      // inside an aspect-4/3 overflow-hidden box.
      const today = mk(
        `<div class="today"><span class="icon"></span>` +
          `<span class="xs">Preview unavailable</span>` +
          `<span class="xs trunc">${NAME}</span></div>`,
        w,
      );
      const boxEl = today.firstElementChild;
      out.push({
        viewport,
        tileW: Math.round(w * 10) / 10,
        which: "TODAY placeholder",
        boxH: Math.round(boxEl.getBoundingClientRect().height * 10) / 10,
        contentH: Math.round(boxEl.scrollHeight * 10) / 10,
        totalH: Math.round(today.getBoundingClientRect().height * 10) / 10,
      });
      today.remove();

      // (B) PROPOSED: box (icon only) + caption below.
      for (const [which, msg] of [
        ["PROPOSED live", null],
        ["PROPOSED absent", ABSENT],
        ["PROPOSED load-failed", FAILED],
      ]) {
        const el = mk(
          `<div class="wrap"><span class="boxNew"><span class="icon"></span></span>` +
            `<span class="xs nameNew" style="display:block">${NAME}</span>` +
            (msg ? `<span class="xsr" style="display:block">${msg}</span>` : "")+
            `</div>`,
          w,
        );
        const box = el.querySelector(".boxNew");
        out.push({
          viewport,
          tileW: Math.round(w * 10) / 10,
          which,
          boxH: Math.round(box.getBoundingClientRect().height * 10) / 10,
          contentH: Math.round(box.scrollHeight * 10) / 10,
          totalH: Math.round(el.getBoundingClientRect().height * 10) / 10,
        });
        el.remove();
      }
    }
    return out;
  },
  { widths: [320, 390, 640, 1072].map((v) => ({ viewport: v, w: tileW(v) })), ABSENT, FAILED, NAME },
);

for (const r of rows) {
  const clipped = r.contentH > r.boxH + 0.5;
  console.log(
    `${String(r.viewport).padStart(4)}px tile ${String(r.tileW).padStart(5)}  ${r.which.padEnd(21)} ` +
      `box ${String(r.boxH).padStart(5)}  content ${String(r.contentH).padStart(5)}  cell ${String(r.totalH).padStart(5)}  ` +
      (clipped ? `CLIPPED by ${Math.round((r.contentH - r.boxH) * 10) / 10}` : "not clipped"),
  );
}
await page.context().browser().close();
