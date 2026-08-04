// @vitest-environment jsdom
//
// Task 1 — the shared append-shaped announce channel, extracted from
// ShowReviewSurface (spec 2026-08-03-undo-success-announcement-design §3.1).
//
// Every assertion here names a defect it catches; none of them is satisfied by
// "the function was called". The cap assertion derives its expectation from the
// exported ANNOUNCE_LOG_CAP so the test cannot silently disagree with the module.
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ANNOUNCE_LOG_CAP,
  ANNOUNCE_LOG_TTL_MS,
  AnnounceLogRegion,
  useAnnounceLog,
  type AnnounceLogEntry,
} from "@/components/admin/announceLog";

/** Harness exposing the hook's api to the test body. */
function Harness({
  onReady,
  ttlMs,
}: {
  onReady: (api: ReturnType<typeof useAnnounceLog>) => void;
  ttlMs?: number | undefined;
}) {
  const api = useAnnounceLog(ttlMs === undefined ? undefined : { ttlMs });
  onReady(api);
  return <AnnounceLogRegion entries={api.entries} label="Test updates" testId="test-status" />;
}

function mount(ttlMs?: number) {
  let api!: ReturnType<typeof useAnnounceLog>;
  const identities: Array<(m: string) => void> = [];
  const utils = render(
    <Harness
      ttlMs={ttlMs}
      onReady={(a) => {
        api = a;
        identities.push(a.announce);
      }}
    />,
  );
  return {
    get api() {
      return api;
    },
    identities,
    ...utils,
  };
}

const region = () => screen.getByTestId("test-status");
const children = () => Array.from(region().children) as HTMLElement[];

describe("useAnnounceLog", () => {
  it("gives two announces in ONE commit distinct ids", () => {
    // Catches: ids derived from log length or a timestamp. Both collide when two
    // calls batch into a single commit, and a duplicate React key drops a node.
    const h = mount();
    act(() => {
      h.api.announce("first");
      h.api.announce("second");
    });
    expect(children().map((c) => c.textContent)).toEqual(["first", "second"]);
    const ids = children().map((c) => c.getAttribute("data-announce-id"));
    expect(new Set(ids).size).toBe(2);
  });

  it("ignores empty and whitespace-only messages", () => {
    // Catches: a blank entry appended, which a screen reader announces as silence.
    const h = mount();
    act(() => {
      h.api.announce("");
      h.api.announce("   ");
      h.api.announce("\n\t");
    });
    expect(children()).toHaveLength(0);
  });

  it("caps at ANNOUNCE_LOG_CAP, dropping the OLDEST", () => {
    // Catches: an off-by-one in the slice, or dropping the newest instead of the
    // oldest. Expectations derive from the exported cap, never a literal 50.
    const h = mount();
    act(() => {
      for (let i = 0; i < ANNOUNCE_LOG_CAP + 1; i++) h.api.announce(`m${i}`);
    });
    const texts = children().map((c) => c.textContent);
    expect(texts).toHaveLength(ANNOUNCE_LOG_CAP);
    expect(texts[0]).toBe("m1");
    expect(texts[texts.length - 1]).toBe(`m${ANNOUNCE_LOG_CAP}`);
  });

  it("keeps `announce` referentially stable across rerenders", () => {
    // Catches: an unstable callback, which re-subscribes every consumer that puts
    // it in a dependency array.
    const h = mount();
    act(() => {
      h.api.announce("one");
    });
    expect(h.identities.length).toBeGreaterThan(1);
    expect(new Set(h.identities).size).toBe(1);
  });

  it("appends without replacing the region node", () => {
    // Catches: the whole point of the append shape. A region re-created on each
    // announce is the not-announced pitfall this channel exists to avoid.
    const h = mount();
    const before = region();
    act(() => {
      h.api.announce("one");
    });
    act(() => {
      h.api.announce("two");
    });
    expect(region()).toBe(before);
    expect(children()).toHaveLength(2);
  });

  it("announces two IDENTICAL messages as two separate additions", () => {
    // Catches: any regression to text-swap semantics. Identical text changes may
    // not re-announce; identical additions always do. This is the reachable case
    // (spec §1.2: two shows dropping a crew member of the same name).
    const h = mount();
    act(() => {
      h.api.announce("Crew member Alice Chen removed");
    });
    act(() => {
      h.api.announce("Crew member Alice Chen removed");
    });
    const texts = children().map((c) => c.textContent);
    expect(texts).toEqual(["Crew member Alice Chen removed", "Crew member Alice Chen removed"]);
  });
});

describe("AnnounceLogRegion", () => {
  it("renders role=log, sr-only, and the given label and testId", () => {
    render(<AnnounceLogRegion entries={[]} label="Undo updates" testId="x-status" />);
    const el = screen.getByTestId("x-status");
    expect(el.getAttribute("role")).toBe("log");
    expect(el.className).toBe("sr-only");
    expect(el.getAttribute("aria-label")).toBe("Undo updates");
  });

  it("writes NO explicit aria-live, aria-atomic or aria-relevant", () => {
    // Catches: someone "helpfully" adding attributes that fight role=log's
    // implicits (polite, atomic=false, relevant=additions text).
    render(<AnnounceLogRegion entries={[]} label="Undo updates" testId="x-status" />);
    const el = screen.getByTestId("x-status");
    expect(el.getAttribute("aria-live")).toBeNull();
    expect(el.getAttribute("aria-atomic")).toBeNull();
    expect(el.getAttribute("aria-relevant")).toBeNull();
  });

  it("is mounted and empty before anything is announced", () => {
    // Catches: gating the region on having entries, which re-creates the
    // insertion pitfall the moment the first announcement arrives.
    render(<AnnounceLogRegion entries={[]} label="Undo updates" testId="x-status" />);
    expect(screen.getByTestId("x-status")).toHaveTextContent("");
  });

  it("renders each entry keyed by its id, in insertion order", () => {
    const entries: AnnounceLogEntry[] = [
      { id: 7, text: "seven" },
      { id: 9, text: "nine" },
    ];
    render(<AnnounceLogRegion entries={entries} label="Undo updates" testId="x-status" />);
    const kids = Array.from(screen.getByTestId("x-status").children) as HTMLElement[];
    expect(kids.map((c) => c.getAttribute("data-announce-id"))).toEqual(["7", "9"]);
    expect(kids.map((c) => c.textContent)).toEqual(["seven", "nine"]);
  });
});

describe("useAnnounceLog pruning (impeccable audit P2)", () => {
  it("prunes a spoken entry after the TTL so the region is empty at rest", () => {
    // Catches: stale announcements accumulating for a whole admin session. The
    // layout channel's region is the FIRST content in the admin subtree, so an
    // unpruned log makes a top-down screen-reader read recite every undo of the
    // session before reaching the nav.
    vi.useFakeTimers();
    try {
      const h = mount(ANNOUNCE_LOG_TTL_MS);
      act(() => {
        h.api.announce("first");
      });
      expect(children()).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(ANNOUNCE_LOG_TTL_MS - 1);
      });
      // Still present just before the TTL: pruning a node assistive technology
      // has not spoken yet can strand it unsaid.
      expect(children()).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(children()).toHaveLength(0);
      expect(region()).toBeInTheDocument(); // the REGION survives; only entries go
    } finally {
      vi.useRealTimers();
    }
  });

  it("prunes each entry on its own clock, not all at once", () => {
    vi.useFakeTimers();
    try {
      const h = mount(ANNOUNCE_LOG_TTL_MS);
      act(() => {
        h.api.announce("older");
      });
      act(() => {
        vi.advanceTimersByTime(ANNOUNCE_LOG_TTL_MS / 2);
      });
      act(() => {
        h.api.announce("newer");
      });
      act(() => {
        vi.advanceTimersByTime(ANNOUNCE_LOG_TTL_MS / 2 + 1);
      });
      // The older one has aged out; the newer one has not.
      expect(children().map((c) => c.textContent)).toEqual(["newer"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT prune when no ttlMs is given — the cap-only contract", () => {
    // Load-bearing default. The warnings channel relies on it: its spec ratifies
    // that a recent entry is never removed, because a trimmed node may still be
    // queued and unspoken (2026-07-22 announcer spec §2.2, R3 F2). A TTL
    // defaulted ON here would silently supersede that contract.
    vi.useFakeTimers();
    try {
      const h = mount(); // no ttlMs
      act(() => {
        h.api.announce("stays");
      });
      act(() => {
        vi.advanceTimersByTime(ANNOUNCE_LOG_TTL_MS * 10);
      });
      expect(children().map((c) => c.textContent)).toEqual(["stays"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
