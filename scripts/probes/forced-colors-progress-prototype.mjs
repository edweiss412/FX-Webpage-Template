import { chromium, firefox } from "@playwright/test";
const PAGE = `<!doctype html><meta charset="utf-8"><style>
progress { width: 200px; height: 12px; }
progress::-webkit-progress-bar { background-color: var(--bar, #eee); background-image: linear-gradient(90deg, transparent, #ff8c1a, transparent); }
progress::-moz-progress-bar { background-color: transparent; background-image: linear-gradient(90deg, transparent, #ff8c1a, transparent); }
@media (forced-colors: active) {
  progress::-webkit-progress-bar { background-color: Highlight; background-image: none; }
  progress::-moz-progress-bar   { background-color: Highlight; background-image: none; }
}
</style><progress id="p"></progress>`;
const READ = () => {
  const el = document.getElementById("p");
  const out = { element: getComputedStyle(el).backgroundColor };
  for (const pe of ["::-webkit-progress-bar", "::-moz-progress-bar"]) {
    try {
      const s = getComputedStyle(el, pe);
      out[pe] = s
        ? `${s.backgroundColor} img=${s.backgroundImage === "none" ? "none" : "gradient"}`
        : "null";
    } catch {
      out[pe] = "throw";
    }
  }
  return out;
};
for (const [n, L] of [
  ["chromium", chromium],
  ["firefox", firefox],
]) {
  const b = await L.launch();
  for (const fc of [false, true]) {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.setContent(PAGE);
    if (fc) await p.emulateMedia({ forcedColors: "active" });
    const r = await p.evaluate(READ);
    console.log(`${n.padEnd(9)} forced=${String(fc).padEnd(5)}`, JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
}
