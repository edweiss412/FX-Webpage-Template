/**
 * tests/components/auth/avatarMenuTransitionAudit.test.ts
 *
 * Structural transition audit for `components/auth/AvatarMenu.tsx`, in the
 * shape `tests/show/claimedRowTransitionAudit.test.ts` uses on the same-route
 * sibling. Two shapes for one job would be one shape too many.
 *
 * The component's inventory is spec §4.6 (amended 2026-08-27 to five states and
 * ten pairs). This file is the STRUCTURAL half: every conditional in the source
 * carries a declared treatment, and the count is pinned so a branch added later
 * fails rather than passing silently.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SOURCE = readFileSync(join(process.cwd(), "components", "auth", "AvatarMenu.tsx"), "utf8");

/** Every conditional in the component, with its §4.6 treatment. */
const DECLARED = [
  {
    id: "C1",
    what: "the accessible-name builder appends role only when non-empty",
    marker: /if \(role\.trim\(\) !== ""\) parts\.push/,
    treatment: "not a render branch, no animation",
  },
  {
    id: "C2",
    what: "the re-entry guard on the click, reading the DERIVED busy flag",
    marker: /if \(switchBusy\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;/,
    treatment: "not a render branch; admitting the retry once the watchdog has fired is the point",
  },
  {
    id: "C3",
    what: "the settle path drops a superseded attempt's result",
    // Anchored on what FOLLOWS it, because the catch path (C6) spells the same
    // condition and a bare marker would match either. Round 4 F1 caught exactly
    // that aliasing in an earlier row.
    marker: /if \(switchAttempt\.current !== attempt\) return;\s*\n\s*setSwitchPhase\("idle"\);/,
    treatment: "not a render branch; a superseded attempt enters no state",
  },
  {
    id: "C4",
    what: "the settle path reports a failure",
    marker: /if \(failed\) setSwitchStatus\("error"\);/,
    treatment: "instant; batched with the phase's return to idle",
  },
  {
    id: "C5",
    what: "the watchdog effect arms only while pending",
    marker: /if \(switchPhase !== "pending"\) return;/,
    treatment: "not a render branch; arming, not painting",
  },
  {
    id: "C6",
    what: "the catch drops a superseded attempt BEFORE rethrowing control flow",
    marker: /catch \(error\) \{[\s\S]*?if \(switchAttempt\.current !== attempt\) return;/,
    treatment: "not a render branch; a superseded redirect is not this row's to follow",
  },
  {
    id: "C7",
    what: "the watchdog callback refuses to leave a phase that is not pending",
    marker: /setSwitchPhase\(\(phase\) => \(phase === "pending" \? "timedout" : phase\)\)/,
    treatment: "instant when it fires; a no-op after a settle",
  },
  {
    id: "C8a",
    what: "the announcement says Switching person while pending",
    marker: /if \(switchPhase === "pending"\) switchAnnouncement =/,
    treatment: "instant; announcement only, no visual state",
  },
  {
    id: "C8b",
    what: "the announcement says the timeout notice while timed out",
    marker: /else if \(switchPhase === "timedout"\) switchAnnouncement =/,
    treatment: "instant; announcement only, no visual state",
  },
  {
    id: "C9",
    what: "close() restores focus only when asked",
    marker: /if \(opts\.restoreFocus\) triggerRef\.current\?\.focus\(\);/,
    treatment: "not a render branch; focus, not paint",
  },
  {
    id: "C10",
    what: "the outside-pointerdown effect is inert while closed",
    marker: /if \(!open\) return;\s*\n\s*const onPointerDown/,
    treatment: "not a render branch",
  },
  {
    id: "C11",
    what: "an in-container pointerdown does not close",
    marker: /if \(target instanceof Node && containerRef\.current\?\.contains\(target\)\) return;/,
    treatment: "not a render branch",
  },
  {
    id: "C12",
    what: "the deferred-focus effect is inert while closed",
    marker: /if \(!open\) return;\s*\n\s*const index = pendingFocus\.current;/,
    treatment: "not a render branch",
  },
  {
    id: "C13",
    what: "the deferred-focus effect is inert with no pending index",
    marker: /if \(index === null\) return;/,
    treatment: "not a render branch",
  },
  {
    id: "C14",
    what: "trigger keydown: open-at-first on ArrowDown/Enter/Space",
    marker: /if \(event\.key === "ArrowDown" \|\| event\.key === "Enter" \|\| event\.key === " "\)/,
    treatment: "Closed→Open-idle, the duration-fast enter treatment",
  },
  {
    id: "C15",
    what: "trigger keydown: open-at-last on ArrowUp",
    marker: /\} else if \(event\.key === "ArrowUp"\)/,
    treatment: "Closed→Open-idle (or Closed→Open-pending / Open-timedout if a clear is live)",
  },
  {
    id: "C16",
    what: "the popover renders only while open",
    marker: /\{open \? \(/,
    treatment: "enter: motion-safe avatar-menu-in; exit is an unmount, motion-reduce instant",
  },
  {
    id: "C17",
    what: "the identity header renders only with an identity",
    marker: /\{hasIdentity \? \(/,
    treatment: "instant; absent it, the menu takes aria-label instead of aria-labelledby",
  },
  {
    id: "C18",
    what: "the sr-only separator between name and role",
    marker: /avatar-menu-sr-separator/,
    treatment: "instant; screen-reader punctuation only",
  },
  {
    id: "C19",
    what: "the visible middot between name and role",
    marker: /aria-hidden="true">\s*\n\s*\{" · "\}/,
    treatment: "instant",
  },
  {
    id: "C20",
    what: "the theme row toggles light and dark",
    marker: /setTheme\(isDark \? "light" : "dark"\)/,
    treatment: "instant; the menu deliberately stays open",
  },
  {
    id: "C21",
    what: "the theme check glyph is visible only when mounted and dark",
    marker: /mounted && isDark \? "visible" : "invisible"/,
    treatment: "instant; invisible rather than absent, so the row cannot reflow",
  },
  {
    id: "C22",
    what: "the failure alert renders only in Open-error",
    marker: /\{switchStatus === "error" \? \(/,
    treatment: "instant; a sibling of role=menu, and the menu stays open behind it",
  },
  {
    id: "C24",
    what: "the visible timeout note renders only in the timed-out phase",
    marker: /\{switchPhase === "timedout" \? \(/,
    treatment:
      "instant; a sibling of role=menu, aria-hidden so the sr-only region stays the single AT channel",
  },
  {
    // The census is a REGEX over the whole source, prose included, so the
    // module header's "`Not you?` button" reads as a ternary. Declared rather
    // than carved out: an exception for comments would also hide a real branch
    // someone commented out, and the sibling's audit made the same choice by
    // counting its own source whole.
    id: "C23",
    what: "the module header's `Not you?` sentence, which the census counts as a ternary",
    marker: /an always-visible `Not you\?` button/,
    treatment: "not a branch at all; prose, declared so the count stays honest",
  },
] as const;

describe("AvatarMenu transition audit (spec §4.6)", () => {
  test.each(DECLARED)("$id is present and has a declared treatment", ({ marker, treatment }) => {
    expect(SOURCE).toMatch(marker);
    expect(treatment.length).toBeGreaterThan(0);
  });

  test("every conditional in the source is declared above", () => {
    // Same census the sibling's audit uses: `? (`, `? <`, `? \``, `? "`,
    // `&& (`, `&& <` and `if (`. The count is the completeness proof: a branch
    // added later fails HERE rather than passing silently.
    const ternaries = SOURCE.match(/\?\s*[(<`"']/g)?.length ?? 0;
    const andGuards = SOURCE.match(/&&\s*[(<]/g)?.length ?? 0;
    const ifGuards = SOURCE.match(/\bif\s*\(/g)?.length ?? 0;

    expect(
      ternaries + andGuards + ifGuards,
      `conditionals found: ${ternaries} ternaries + ${andGuards} && guards + ${ifGuards} if guards. ` +
        `If you added a branch, add its row to DECLARED with its §4.6 treatment.`,
    ).toBe(DECLARED.length);
  });

  test("the pending affordances read the component's own phase, never React's flag", () => {
    // Rendering from `switchPending` put the row in states the inventory
    // forbids, and the behavioural cases that catch a return to it are
    // avatarMenu.test.tsx's two "the RETRY settles ... while the first is still
    // hung". This is the structural half: the flag is not read at all.
    expect(SOURCE).toMatch(/const \[, startSwitch\] = useTransition\(\)/);
    expect(SOURCE).not.toMatch(/\bswitchPending\b/);
    expect(SOURCE).toMatch(/aria-disabled=\{switchBusy\}/);
    expect(SOURCE).toMatch(/aria-busy=\{switchBusy \|\| undefined\}/);
  });
});
