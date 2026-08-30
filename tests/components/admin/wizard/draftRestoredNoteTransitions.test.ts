/**
 * Transition audit for the draft-restored note (spec 2026-08-30 §3.6).
 *
 * Reads `components/admin/wizard/DraftRestoredNote.tsx` as source. That file's
 * whole content is the note, so there is no sibling element to slice into by
 * accident: an earlier draft of this audit read `Step3ReviewModal.tsx` and
 * walked back to the nearest `className=`, which landed on the publish
 * button's `transition-colors duration-fast` and would have failed a correct
 * note.
 *
 * The behavioural half of §3.6 lives in draftRestoredNote.test.tsx (timing,
 * AC-18's mutations, announce-once) and in the browser cases of
 * step3-review-modal.interactions.spec.ts (the shift, the scrolled case, and
 * AC-17's four-cell compound matrix). What is left, and what this file owns,
 * is the STRUCTURAL claim: that the note declares no exit treatment at all and
 * cannot become a live region.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(__dirname, "..", "..", "..", "..", "components", "admin", "wizard", "DraftRestoredNote.tsx"),
  "utf8",
);

describe("draft-restored note — transition audit (spec §3.6)", () => {
  it("premise: the file under audit is the note and nothing else", () => {
    // Without this the bans below pass by reading the wrong file, or an empty
    // one, which is the vacuity shape this repo's premise rule exists for.
    expect(SRC).toContain("draft-restored-note");
    expect(SRC).toContain("DraftRestoredNote");
    expect(SRC.length, "a plausible single-component file").toBeLessThan(6000);
  });

  it("declares no transition, animation or exit treatment (AC-15)", () => {
    // §3.6 resolves V -> G to an instant unmount. The reasons are recorded in
    // the spec: there is no AnimatePresence anywhere in this modal, reduced
    // motion collapses the duration tokens to 0ms so a fraction of users get an
    // instant removal regardless, and an animated exit would lengthen the
    // window in which content below the note is in motion.
    for (const banned of [
      "transition",
      "animate-",
      "duration-",
      "AnimatePresence",
      "framer-motion",
      "exit=",
      "animation",
    ]) {
      expect(SRC, `the note must be instant; found ${banned}`).not.toContain(banned);
    }
  });

  it("is conditionally mounted and therefore must NOT be a live region (AC-12)", () => {
    // tests/components/_metaLiveRegionMounting.test.ts forbids a live region
    // whose MOUNT is gated, because a region inserted together with its text is
    // never announced. This note is gated by design, so it announces through
    // UndoAnnounceContext and stays decorative in the DOM.
    expect(SRC, "a gated live region is the shape the meta-test forbids").not.toMatch(
      /role=["']status["']|aria-live=/,
    );
    expect(SRC, "the visible note is decorative; the announcement carries it").toContain(
      'aria-hidden="true"',
    );
    expect(SRC, "and the announcement goes through the shell's provider").toContain(
      "UndoAnnounceContext",
    );
  });

  it("reads its store exactly once, which is what makes A -> V unreachable", () => {
    // §3.6 calls the absent-to-visible transition unreachable after mount. That
    // is structural rather than asserted: the store is read in the mount
    // initializer and never again, so no later store change can surface the
    // note. Counted on the CALL, not the import, because the import line
    // mentions the same identifier.
    const calls = SRC.match(/readStoredDraft\s*\(/g) ?? [];
    expect(calls.length, "exactly one readStoredDraft call site").toBe(1);
    expect(SRC, "no effect re-reads the store").not.toMatch(
      /useEffect\([^)]*\)\s*=>\s*\{[^}]*readStoredDraft/,
    );
  });
});
