/**
 * Third probe for the DiagramTile state split, written to settle spec review
 * round 1 findings 3 and 5.
 *
 * F5: sections 3.4's numbers were INTRINSIC wrapper heights, measured one
 * wrapper at a time. Grid items stretch, so a live wrapper sharing a row with a
 * failed one is as tall as the failed one. This measures a REAL grid.
 *
 * F3: nothing executable proved the caption is readable rather than merely
 * present. This measures each caption's clipping (scrollHeight vs clientHeight)
 * and its rendered height, which is the shape the Playwright task asserts.
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
const cardWidthAt = (v) => {
  const panel = Math.min(v - (v >= 640 ? M.PAD : 0), M.MAX);
  const main = v >= 1024 ? panel - M.RAIL : panel;
  return main - M.CONTENT - M.CARD;
};

const ABSENT = "Not captured. Won't appear on the crew page.";
const FAILED = "Preview couldn't load. The diagram will still publish.";
const NAME = "Main stage plot rev 4";

// One row's worth at each column count: a live tile FIRST, so the stretch shows.
const STATES = ["live", "absent", "live", "load-failed", "live", "live", "live", "live"];

const page = await (await chromium.launch()).newPage();
await page.setContent(`<!doctype html><html><head><style>
@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;
  src:url(data:font/woff2;base64,${fontB64}) format("woff2");}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Inter",ui-sans-serif,system-ui,sans-serif;font-optical-sizing:auto}
/* the shipped grid: grid grid-cols-3 gap-2 sm:grid-cols-4 */
.grid{display:grid;gap:8px}
.wrap{display:flex;flex-direction:column;gap:4px}
.box{aspect-ratio:4/3;width:100%;display:grid;place-items:center;overflow:hidden;
  border:1px solid #999;border-radius:12px}
.icon{width:16px;height:16px}
/* The name line as SHIPPED: a two-line clamp, not a single ellipsised line.
   It was truncate-to-one-line while the caption lived inside the
   overflow-hidden box and could not grow; out here growth is the point, and one
   line does not hold the names this surface carries. This probe reported
   "name truncated" at 320 and 390 against the old rule, which is the
   measurement the impeccable critique acted on.
   Mirrors line-clamp-2 max-w-full wrap-break-word text-xs. */
.name{font-size:.75rem;line-height:1.4;max-width:100%;overflow:hidden;
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;
  overflow-wrap:break-word}
.msg{font-size:.75rem;line-height:1.625;display:block}
</style></head><body><div id="out"></div></body></html>`);
await page.evaluate(() => document.fonts.ready);

const rows = await page.evaluate(
  ({ points, STATES, ABSENT, FAILED, NAME }) => {
    const host = document.getElementById("out");
    const out = [];
    for (const { viewport, cardW, cols } of points) {
      const grid = document.createElement("div");
      grid.className = "grid";
      grid.style.width = `${cardW}px`;
      grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      STATES.forEach((state, i) => {
        const w = document.createElement("span");
        w.className = "wrap";
        w.dataset.i = String(i);
        w.dataset.state = state;
        const msg = state === "absent" ? ABSENT : state === "load-failed" ? FAILED : null;
        w.innerHTML =
          `<span class="box"><span class="icon"></span></span>` +
          `<span class="name">${NAME}</span>` +
          (msg ? `<span class="msg">${msg}</span>` : "");
        grid.append(w);
      });
      host.append(grid);
      for (const w of grid.children) {
        const box = w.querySelector(".box");
        const msg = w.querySelector(".msg");
        const name = w.querySelector(".name");
        const br = box.getBoundingClientRect();
        out.push({
          viewport,
          cols,
          i: Number(w.dataset.i),
          state: w.dataset.state,
          cellH: Math.round(w.getBoundingClientRect().height * 10) / 10,
          boxW: Math.round(br.width * 10) / 10,
          boxH: Math.round(br.height * 10) / 10,
          ratio: Math.round((br.width / br.height) * 1000) / 1000,
          nameClipped: name.scrollWidth > name.clientWidth,
          msgH: msg ? Math.round(msg.getBoundingClientRect().height * 10) / 10 : 0,
          msgClipped: msg ? msg.scrollHeight > msg.clientHeight + 0.5 : false,
        });
      }
      grid.remove();
    }
    return out;
  },
  {
    points: [320, 390, 640, 1072].map((v) => ({
      viewport: v,
      cardW: cardWidthAt(v),
      cols: v >= 640 ? 4 : 3,
    })),
    STATES,
    ABSENT,
    FAILED,
    NAME,
  },
);

let vp = null;
for (const r of rows) {
  if (r.viewport !== vp) {
    vp = r.viewport;
    console.log(`\n--- ${vp}px, ${r.cols} columns`);
  }
  if (r.i >= r.cols) continue; // first row only; later rows repeat the pattern
  console.log(
    `  tile ${r.i} ${r.state.padEnd(11)} cell ${String(r.cellH).padStart(6)}  ` +
      `box ${String(r.boxW).padStart(5)}x${String(r.boxH).padStart(5)} ratio ${r.ratio}  ` +
      `msg-h ${String(r.msgH).padStart(5)}  ` +
      `${r.msgClipped ? "MSG CLIPPED" : "msg ok"}  ${r.nameClipped ? "name truncated" : "name full"}`,
  );
}
const bad = rows.filter((r) => Math.abs(r.ratio - 4 / 3) > 0.01 || r.msgClipped);
console.log(
  `\n${bad.length === 0 ? "OK" : "FAIL"}: ${bad.length} tile(s) off 4:3 or with clipped copy`,
);
for (const r of bad) {
  console.log(`  ${r.viewport}px tile ${r.i} ${r.state}: ratio ${r.ratio}, clipped ${r.msgClipped}`);
}
await page.context().browser().close();
// THE EXIT IS THE CLAIM. Printing "FAIL" and exiting 0 is a gate that gates
// nothing, which is what spec review round 2 caught here: two spec sections
// cited this file as failing its process on a bad ratio and it never did.
process.exitCode = bad.length === 0 ? 0 : 1;
