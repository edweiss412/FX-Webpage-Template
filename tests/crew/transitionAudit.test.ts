import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
// §5.7: these four surfaces are synchronous Server Components — every visual
// difference across viewers/days/show-counts is a distinct render, NOT an
// in-page animated transition. They MUST NOT gain 'use client', framer-motion,
// AnimatePresence, or exit/initial/animate motion props.
const SSR_SURFACES = [
  "components/crew/primitives/KeyTimesStrip.tsx",
  "components/crew/primitives/DayCard.tsx",
  "components/crew/sections/ScheduleSection.tsx",
  "components/crew/sections/TodaySection.tsx",
];

describe("§5.7 SSR surfaces stay instant (no client motion)", () => {
  for (const rel of SSR_SURFACES) {
    test(`${rel} is a synchronous Server Component (no 'use client'/framer/AnimatePresence/motion props)`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      // Match only the actual directive (line-start, optional semicolon) — not
      // JSDoc comments that mention 'use client' in backtick or prose form.
      expect(/^['"]use client['"];?\s*$/m.test(src), "must NOT be a client component").toBe(false);
      expect(/framer-motion/.test(src), "must NOT import framer-motion").toBe(false);
      expect(/AnimatePresence/.test(src), "must NOT use AnimatePresence").toBe(false);
      // No motion props on any ternary/conditional render — these surfaces fork
      // SSR output, they do not animate between states.
      expect(
        /\b(exit|initial|animate)\s*=/.test(src),
        "must carry NO exit/initial/animate motion props",
      ).toBe(false);
    });
  }
});

describe("§5.7 RightNowHero IS the single client component (inverse guard)", () => {
  test("RightNowHero carries 'use client' + framer-motion (the ONE animated surface)", () => {
    const src = readFileSync(join(ROOT, "components/crew/RightNowHero.tsx"), "utf8");
    expect(/['"]use client['"]/.test(src)).toBe(true);
    expect(/framer-motion/.test(src)).toBe(true);
    // It must select the dated anchor by the client-computed show-tz todayIso.
    expect(/formatIsoForTimezone\(now,\s*ctx\.timezone\)/.test(src)).toBe(true);
  });
});
