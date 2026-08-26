/**
 * The two crew announce channels in `components/diagrams/Gallery.tsx`.
 *
 * WHY THIS EXISTS. `components/admin/announceLog.tsx` prescribes a TTL and
 * exports `ANNOUNCE_LOG_TTL_MS` for it; the gallery's two channels shipped
 * without one (`BL-DIAGRAMS-ANNOUNCE-CHANNEL-TTL`). Unpruned, a failure sentence
 * stays in the region for the whole page session, so a crew member who hits one
 * image failure carries that sentence under every later diagram they open, and
 * a re-opened dialog mounts a region pre-loaded with the last session's
 * failures — dead text on a top-down read and a replay for any assistive
 * technology that reads an inserted live region. The module's own doc comment
 * describes exactly this and the gallery is the surface it names.
 *
 * WHAT IS DELIBERATELY NOT SWEPT, so a reader does not read it as a miss.
 * `components/admin/review/ShowReviewSurface.tsx` is a THIRD `useAnnounceLog()`
 * caller with no TTL, and it stays that way: announcer spec 2026-07-22 §2.2
 * ratifies no timer-based pruning on that channel because a recently trimmed
 * node may still be queued and unspoken, and that surface's own
 * MutationObserver suite pins it. AGENTS.md invariant 7 says the spec wins, so
 * sweeping it would silently supersede another spec's ratified contract. This
 * suite asserts that exclusion rather than leaving it to a comment, because an
 * unremarked absence is what the next sweep "fixes".
 *
 * Read from source rather than rendered: the question is which ARGUMENT each
 * call site passes, and a render can only show the behaviour that argument
 * produces after 30 seconds of fake timers, which tests the hook rather than
 * the call site. The hook's own pruning is already covered where it lives.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** Every `useAnnounceLog(` call in a file, with its argument text. */
function calls(src: string): string[] {
  return [...src.matchAll(/useAnnounceLog\(([^)]*)\)/g)].map((m) => m[1]!.trim());
}

describe("the crew diagram announce channels prune", () => {
  const gallery = read("components/diagrams/Gallery.tsx");
  const galleryCalls = calls(gallery);

  it("premise: the gallery still owns two announce channels", () => {
    // Two, not "at least one": the gallery deliberately holds a gallery channel
    // AND the dialog's channel, and a refactor down to one would make the
    // per-call assertion below true of a surface that no longer exists.
    premise("gallery useAnnounceLog call sites", galleryCalls.length, 1);
    expect(galleryCalls.length).toBe(2);
  });

  it("passes the module's own TTL to both", () => {
    for (const arg of galleryCalls) {
      expect(arg).toContain("ttlMs: ANNOUNCE_LOG_TTL_MS");
    }
    expect(gallery).toContain("ANNOUNCE_LOG_TTL_MS");
  });

  it("leaves the review surface's ratified no-TTL channel alone", () => {
    const review = read("components/admin/review/ShowReviewSurface.tsx");
    const reviewCalls = calls(review);
    premise("the review surface still owns an announce channel", reviewCalls.length, 0);
    for (const arg of reviewCalls) {
      expect(arg, "announcer spec 2026-07-22 §2.2 ratifies no pruning here").toBe("");
    }
  });
});
