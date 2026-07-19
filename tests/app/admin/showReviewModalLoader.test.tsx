// @vitest-environment jsdom
/**
 * tests/app/admin/showReviewModalLoader.test.tsx
 * (admin-show-modal spec §4 / §7 — Task 7 loader retarget of perShowPage.test.tsx)
 *
 * The `ShowReviewModal({ slug, alertId })` server loader (`app/admin/
 * _showReviewModal.tsx`): the transplanted per-show page body feeding the
 * snapshot-RPC read path (`readShowReviewSnapshot`) into the client
 * `PublishedReviewModal` inside the `ReviewModalShell` chrome. Every scenario
 * from the retired per-show page suite is preserved, with exactly the D8 gate
 * deltas the spec ratifies:
 *   - absent row + snapshot not_admin_or_missing → `redirect("/admin")`
 *     (were the two `notFound()` sites);
 *   - infra faults (client construction, lookup returned-error, lookup throw,
 *     snapshot infra_error) still THROW to the error boundary, unchanged;
 *   - archived read-only posture, share-panel gating, Preview-As gating,
 *     roster cap, finalize-owned invariant-9 fault coverage, and the
 *     ADMIN_SHOW_* slug-correlation structural guard all transplant verbatim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { fireEvent, cleanup, render, screen } from "@testing-library/react";
import { CREW_ROSTER_READ_CAP } from "@/app/admin/show/[slug]/crewLinkMailto";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

const state = vi.hoisted(() => ({
  // slug→id lookup on shows.
  showIdRow: { id: "s1" } as { id: string } | null,
  showIdError: null as { message: string } | null,
  // snapshot RPC result.
  snapshotKind: "ok" as "ok" | "not_admin_or_missing" | "infra_error",
  snapshot: null as ShowReviewSnapshot | null,
  finalizeOwned: false as boolean,
  // finalize-owned RPC fault injection (invariant 9): a returned {error} or a
  // thrown await must BOTH be logged and BOTH fail toward NOT-finalize-owned.
  finalizeError: null as { message: string } | null,
  finalizeThrows: false as boolean,
  token: "tok-123" as string | null,
  tokenThrows: false as boolean,
  feed: { entries: [], truncated: false, totalShown: 0 } as {
    entries: Array<Record<string, unknown>>;
    truncated: boolean;
    totalShown: number;
  },
  feedThrows: false as boolean,
  ignoredFingerprints: [] as string[],
  ignoredInfraError: false as boolean,
  alerts: [] as Array<Record<string, unknown>>,
  // Perceived-latency tier 3 (parallel wave): when set, the snapshot mock
  // blocks on this gate; the `started` flags record which reads have been
  // ENTERED, so a test can assert the whole post-lookup wave launched before
  // the snapshot resolved.
  snapshotGate: null as Promise<void> | null,
  started: {
    snapshot: false,
    finalize: false,
    feed: false,
    token: false,
    ignored: false,
    alerts: false,
  },
}));

const logSpy = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logSpy }));

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-14T18:00:00.000Z") }));
// D8: `redirect` throws a sentinel (Next semantics — redirect() never returns);
// the client hooks back the modal shell + useShowModalNav consume in jsdom.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams("show=rpas"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(_table: string) {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = pass;
      builder.limit = pass;
      builder.maybeSingle = async () => ({ data: state.showIdRow, error: state.showIdError });
      return builder;
    },
    rpc: async (fn: string) => {
      if (fn === "readfinalizeowned_b2") {
        state.started.finalize = true;
        if (state.finalizeThrows) throw new Error("META: finalize rpc await fault");
        return { data: state.finalizeOwned, error: state.finalizeError };
      }
      return { data: null, error: null };
    },
  }),
}));

vi.mock("@/lib/admin/readShowReviewSnapshot", () => ({
  readShowReviewSnapshot: async () => {
    state.started.snapshot = true;
    if (state.snapshotGate) await state.snapshotGate;
    if (state.snapshotKind === "not_admin_or_missing") return { kind: "not_admin_or_missing" };
    if (state.snapshotKind === "infra_error") return { kind: "infra_error", message: "boom" };
    return { kind: "ok", snapshot: state.snapshot };
  },
}));

vi.mock("@/lib/data/loadShowShareToken", () => ({
  loadShowShareToken: async () => {
    state.started.token = true;
    if (state.tokenThrows) throw new Error("META: token read fault");
    return { token: state.token, epoch: 7 };
  },
}));

vi.mock("@/lib/sync/feed/readShowChangeFeed", async () => {
  const { SyncInfraError } = await import("@/lib/sync/perFileProcessor");
  return {
    readShowChangeFeed: async () => {
      state.started.feed = true;
      if (state.feedThrows)
        throw new SyncInfraError("readShowChangeFeed.test", "thrown_error", null);
      return state.feed;
    },
  };
});

vi.mock("@/lib/admin/loadIgnoredWarnings", () => ({
  loadIgnoredWarnings: async () => {
    state.started.ignored = true;
    return state.ignoredInfraError
      ? { kind: "infra_error", message: "boom" }
      : { kind: "ok", fingerprints: new Set(state.ignoredFingerprints) };
  },
}));

// Server child components: PerShowAlertSection is an async Server Component (stub
// to null); fetchPerShowAlerts is the count source (returns the seeded rows).
vi.mock("@/components/admin/PerShowAlertSection", () => ({
  PerShowAlertSection: () => null,
  fetchPerShowAlerts: async () => {
    state.started.alerts = true;
    return state.alerts;
  },
}));

// CurrentShareLinkPanel is an async Server shell — stub it, exposing the wired
// props so the loader's threading (crewEmails/showTitle/isCrewLinkActive) is
// assertable and the resetSlot passthrough is observable.
vi.mock("@/app/admin/show/[slug]/CurrentShareLinkPanel", async () => {
  const React = await import("react");
  return {
    CurrentShareLinkPanel: (props: {
      resetSlot?: React.ReactNode;
      isCrewLinkActive?: boolean;
      crewEmails?: readonly string[];
      showTitle?: string;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "admin-current-share-link-panel",
          "data-crew-emails": JSON.stringify(props.crewEmails ?? null),
          "data-show-title": props.showTitle ?? "",
          "data-is-crew-link-active": String(props.isCrewLinkActive ?? ""),
        },
        props.resetSlot,
      ),
  };
});

function baseSnapshot(overrides: Partial<Record<string, unknown>> = {}): ShowReviewSnapshot {
  return {
    show: {
      id: "s1",
      slug: "rpas",
      title: "RPAS Central",
      client_label: "Northwind Bank",
      client_contact: null,
      dates: {
        travelIn: "2026-06-14",
        set: null,
        showDays: ["2026-06-14", "2026-06-15"],
        travelOut: "2026-06-15",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: "d1",
      published: true,
      archived: false,
      picker_epoch: 7,
      last_synced_at: "2026-06-14T10:00:00.000Z",
      last_sync_status: "ok",
      ...overrides,
    },
    internal: {
      financials: null,
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: "s1",
    },
    crew_members: [{ id: "c1", name: "Alex Lee", role: "A1", email: "alex@example.com" }],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

async function buildLoaderElement(alertId: string | null = null): Promise<ReactElement> {
  const mod = await import("@/app/admin/_showReviewModal");
  return (await mod.ShowReviewModal({ slug: "rpas", alertId })) as ReactElement;
}

async function renderLoader() {
  render(await buildLoaderElement());
}

// The loader returns <ShareTokenProvider><PublishedReviewModal shareSlot=… /></…>.
// Read the shareSlot prop the server loader hands the client shell — the RSC
// serialization boundary — WITHOUT rendering (rendered-tree assertions can't
// distinguish "withheld from the payload" from "hidden client-side", since
// OverviewSection hides the slot for ineligible shows either way).
function modalProps(ui: ReactElement): Record<string, unknown> {
  const shell = (ui.props as { children: ReactElement }).children;
  return shell.props as Record<string, unknown>;
}
function shareSlotProp(ui: ReactElement): unknown {
  return modalProps(ui).shareSlot;
}

beforeEach(() => {
  state.showIdRow = { id: "s1" };
  state.showIdError = null;
  state.snapshotKind = "ok";
  state.snapshot = baseSnapshot();
  state.finalizeOwned = false;
  state.finalizeError = null;
  state.finalizeThrows = false;
  logSpy.error.mockClear();
  logSpy.warn.mockClear();
  logSpy.info.mockClear();
  state.token = "tok-123";
  state.tokenThrows = false;
  state.feed = { entries: [], truncated: false, totalShown: 0 };
  state.feedThrows = false;
  state.ignoredFingerprints = [];
  state.ignoredInfraError = false;
  state.alerts = [];
  state.snapshotGate = null;
  state.started = {
    snapshot: false,
    finalize: false,
    feed: false,
    token: false,
    ignored: false,
    alerts: false,
  };
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

// ── Post-lookup parallel wave (perceived-latency tier 3) ─────────────────────
// The loader used to serialize snapshot → finalize RPC → {feed, token, now,
// ignored, alerts}: three DB round-trip waves stacked behind the skeleton.
// Failure mode caught: any post-lookup read waiting on the snapshot (or on the
// finalize RPC) re-serializes the waves and the open latency regresses.

describe("show review modal loader — post-lookup parallel wave", () => {
  it("snapshot, finalize, feed, token, ignored and alerts ALL start before the snapshot resolves", async () => {
    let release!: () => void;
    state.snapshotGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mod = await import("@/app/admin/_showReviewModal");
    const pending = mod.ShowReviewModal({ slug: "rpas", alertId: null });
    // Bounded macrotask flushes while the gate holds the snapshot open — if
    // any read is serialized behind it, its flag can never flip here.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(state.started).toEqual({
      snapshot: true,
      finalize: true,
      feed: true,
      token: true,
      ignored: true,
      alerts: true,
    });
    release();
    render((await pending) as ReactElement);
    // getByRole throws when absent — truthiness is the render-completed pin.
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("archived show: an unconditionally-fired finalize RPC can never mark it finalize-owned", async () => {
    // The wave fires the finalize read before `archived` is known — the
    // APPLICATION stays archived-gated. A stray `true` for an archived show
    // must not leak into the client props.
    state.snapshot = baseSnapshot({ archived: true, published: false });
    state.finalizeOwned = true;
    const ui = await buildLoaderElement();
    expect(modalProps(ui).finalizeOwned).toBe(false);
  });
});

describe("show review modal loader — lookup + snapshot gates (§4, D8)", () => {
  it("missing show (slug lookup returns no row) → redirect('/admin') (was notFound)", async () => {
    state.showIdRow = null;
    await expect(renderLoader()).rejects.toThrow("NEXT_REDIRECT:/admin");
  });

  it("slug lookup returned error → throws (error boundary), not a silent render", async () => {
    state.showIdError = { message: "db down" };
    await expect(renderLoader()).rejects.toThrow("show_lookup_failed");
    const call = logSpy.error.mock.calls.find(
      (c) => (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_LOOKUP_FAILED",
    );
    expect(call, "returned-error path must emit ADMIN_SHOW_LOOKUP_FAILED").toBeTruthy();
  });

  it("slug lookup threw → ADMIN_SHOW_LOOKUP_THREW + throws (error boundary)", async () => {
    // A non-`show_lookup_failed` throw from the awaited builder exercises the
    // catch's distinct "threw" branch.
    state.showIdRow = null;
    state.showIdError = null;
    const mod = await import("@/lib/supabase/server");
    vi.spyOn(mod, "createSupabaseServerClient").mockResolvedValueOnce({
      from() {
        const builder: Record<string, unknown> = {};
        const pass = () => builder;
        builder.select = pass;
        builder.eq = pass;
        builder.limit = pass;
        builder.maybeSingle = async () => {
          throw new Error("META: lookup await fault");
        };
        return builder;
      },
      rpc: async () => ({ data: null, error: null }),
    } as never);
    await expect(renderLoader()).rejects.toThrow("show_lookup_failed");
    const call = logSpy.error.mock.calls.find(
      (c) => (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_LOOKUP_THREW",
    );
    expect(call, "thrown path must emit ADMIN_SHOW_LOOKUP_THREW").toBeTruthy();
  });

  it("snapshot not_admin_or_missing → redirect('/admin') (was notFound)", async () => {
    state.snapshotKind = "not_admin_or_missing";
    await expect(renderLoader()).rejects.toThrow("NEXT_REDIRECT:/admin");
  });

  it("snapshot infra_error → throws to the error boundary (no raw code rendered)", async () => {
    state.snapshotKind = "infra_error";
    await expect(renderLoader()).rejects.toThrow("show_review_snapshot_failed");
  });

  it("supabase client construction throw → throws supabase_client_construction_failed + emit", async () => {
    const mod = await import("@/lib/supabase/server");
    vi.spyOn(mod, "createSupabaseServerClient").mockRejectedValueOnce(
      new Error("META: construction fault"),
    );
    await expect(renderLoader()).rejects.toThrow("supabase_client_construction_failed");
    const call = logSpy.error.mock.calls.find(
      (c) =>
        (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED",
    );
    expect(call, "construction path must emit ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED").toBeTruthy();
  });
});

describe("show review modal loader — shell + rail sections (§4/§6)", () => {
  it("renders the open modal shell with the show title in the h2 header", async () => {
    await renderLoader();
    expect(screen.getByTestId("published-show-review-modal")).toBeTruthy();
    expect(screen.getByTestId("published-show-review-title").textContent).toBe("RPAS Central");
  });

  it("mounts Overview first and Changes last as rail sections", async () => {
    await renderLoader();
    const overview = screen.getByTestId("overview-section");
    const changes = screen.getByTestId("changes-section");
    expect(overview).toBeTruthy();
    expect(changes).toBeTruthy();
    // Every registry section sits between Overview and Changes.
    const registry = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid*="review-section-"]'),
    );
    expect(registry.length).toBeGreaterThan(0);
    const after = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const s of registry) {
      expect(after(overview, s)).toBe(true);
      expect(after(s, changes)).toBe(true);
    }
  });

  it("published+active: strip publish toggle present, no archived badge", async () => {
    await renderLoader();
    expect(screen.getByTestId("strip-publish-toggle")).toBeTruthy();
    expect(screen.queryByTestId("strip-archived-badge")).toBeNull();
  });

  it("threads alertId through to the PublishedReviewModal (§3 one-shot highlight)", async () => {
    const ui = await buildLoaderElement("alert-77");
    expect(modalProps(ui).alertId).toBe("alert-77");
    // Absent param → explicit null (no highlight, modal opens at top — §6.2).
    const uiNull = await buildLoaderElement(null);
    expect(modalProps(uiNull).alertId).toBeNull();
  });
});

describe("show review modal loader — share panel gating (§5.1/§6)", () => {
  it("published+active: Overview shows the share panel, NOT the inactive notice", async () => {
    await renderLoader();
    expect(screen.getByTestId("admin-current-share-link-panel")).toBeTruthy();
    expect(screen.queryByTestId("admin-share-link-inactive")).toBeNull();
  });

  it("unpublished (held): Overview shows the inactive notice, no share panel", async () => {
    state.snapshot = baseSnapshot({ published: false, archived: false });
    await renderLoader();
    expect(screen.queryByTestId("admin-current-share-link-panel")).toBeNull();
    expect(screen.getByTestId("admin-share-link-inactive")).toBeTruthy();
  });

  it("threads fixture-derived non-null emails + title into the share panel", async () => {
    state.snapshot = baseSnapshot();
    state.snapshot.crew_members = [
      { id: "c1", name: "Ann", role: "A1", email: "ann@example.com" },
      { id: "c2", name: "Bob", role: "A2", email: null },
      { id: "c3", name: "Cal", role: "V1", email: "cal@example.com" },
    ];
    await renderLoader();
    const panel = screen.getByTestId("admin-current-share-link-panel");
    expect(JSON.parse(panel.getAttribute("data-crew-emails")!)).toEqual([
      "ann@example.com",
      "cal@example.com",
    ]);
    expect(panel.getAttribute("data-show-title")).toBe("RPAS Central");
  });

  it("ineligible (unpublished) show never serializes the real token to the client", async () => {
    state.snapshot = baseSnapshot({ published: false, archived: false });
    state.token = "s3cr3ttokenvalue9f8e7d6c5b4a";
    await renderLoader();
    expect(document.body.innerHTML).not.toContain(state.token);
  });
});

describe("show review modal loader — share-cluster serialization gate (§6, server-side)", () => {
  // The share cluster (CurrentShareLinkPanel + PickerResetControl) carries live
  // server-action refs (rotate share-token + per-member picker reset). For an
  // ineligible show OverviewSection HIDES it client-side, but the server loader
  // must ALSO withhold the slot from the RSC payload — hiding is not enough
  // because reset_crew_member_selection has no archived/published/finalize
  // lifecycle guard (admin-only but lifecycle-agnostic). Assert the shareSlot
  // PROP is null for archived AND unpublished (withheld, not merely hidden), and
  // a real element for published+active. Old-page parity (merge-base page.tsx:792
  // gated the cluster with isShowEligibleForCrewLink server-side).

  it("published+active: the share cluster IS serialized (a real element slot)", async () => {
    const ui = await buildLoaderElement();
    expect(isValidElement(shareSlotProp(ui))).toBe(true);
  });

  it("unpublished (held): shareSlot withheld from the payload (null, not merely hidden)", async () => {
    state.snapshot = baseSnapshot({ published: false, archived: false });
    const ui = await buildLoaderElement();
    expect(shareSlotProp(ui)).toBeNull();
  });

  it("archived: shareSlot withheld from the payload (null, not merely hidden)", async () => {
    state.snapshot = baseSnapshot({ archived: true, published: true });
    const ui = await buildLoaderElement();
    expect(shareSlotProp(ui)).toBeNull();
  });
});

describe("show review modal loader — archived read-only posture (§6)", () => {
  it("archived: strip archived badge, no publish toggle, Overview Unarchive + inactive notice", async () => {
    state.snapshot = baseSnapshot({ archived: true, published: true });
    await renderLoader();
    expect(screen.getByTestId("strip-archived-badge")).toBeTruthy();
    expect(screen.queryByTestId("strip-publish-toggle")).toBeNull();
    expect(screen.getByTestId("admin-share-link-inactive")).toBeTruthy();
    // Re-sync paused on the read-only surface (no re-sync button in Overview).
    expect(screen.getByTestId("admin-show-resync-archived")).toBeTruthy();
  });

  it("archived: no Preview-As links (gate published && !archived)", async () => {
    state.snapshot = baseSnapshot({ archived: true, published: true });
    await renderLoader();
    expect(screen.queryByTestId("admin-show-preview-as-link-c1")).toBeNull();
    expect(screen.queryByTestId("crew-row-menu-button-c1")).toBeNull();
  });
});

describe("show review modal loader — Preview-As gating (§5.5)", () => {
  it("published+!archived: crew row shows a Preview-As link (inside the row ⋮ menu)", async () => {
    await renderLoader();
    fireEvent.click(screen.getByTestId("crew-row-menu-button-c1"));
    expect(screen.getByTestId("admin-show-preview-as-link-c1")).toBeTruthy();
  });

  it("roster over CREW_ROSTER_READ_CAP → Preview-As links blanked + empty crewEmails + overflow emit", async () => {
    state.snapshot = baseSnapshot();
    state.snapshot.crew_members = Array.from({ length: CREW_ROSTER_READ_CAP + 5 }, (_, i) => ({
      id: `c${i}`,
      name: `Crew ${i}`,
      role: "A1",
      email: `crew${i}@example.com`,
    }));
    await renderLoader();
    expect(screen.queryByTestId("admin-show-preview-as-link-c0")).toBeNull();
    expect(screen.queryByTestId("crew-row-menu-button-c0")).toBeNull();
    const panel = screen.getByTestId("admin-current-share-link-panel");
    expect(JSON.parse(panel.getAttribute("data-crew-emails")!)).toEqual([]);
    const call = logSpy.warn.mock.calls.find(
      (c) => (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_CREW_ROSTER_OVERFLOW",
    );
    expect(call, "over-cap roster must emit ADMIN_SHOW_CREW_ROSTER_OVERFLOW").toBeTruthy();
  });
});

describe("show review modal loader — Changes + alerts (§5.4/§5.1)", () => {
  it("Changes section renders the calm empty state when there are no changes", async () => {
    await renderLoader();
    expect(screen.getByTestId("changes-section")).toBeTruthy();
    expect(screen.getByTestId("change-feed-empty")).toBeTruthy();
  });

  it("feed SyncInfraError degrades to a calm notice inside Changes (feed=null render)", async () => {
    state.feedThrows = true;
    await renderLoader();
    expect(screen.getByTestId("change-feed-infra-error")).toBeTruthy();
    expect(screen.queryByTestId("change-feed-empty")).toBeNull();
  });

  // REWRITTEN, not retired (modal-header-reconciliation §6.6, Task 5): the alert
  // count moved from the strip badge to the modal HEADER pill. The intent this
  // case owns — the loader's server-derived count reaches the rendered surface —
  // survives verbatim; only the element it lands in changed.
  it("open alerts → header alert pill shows the count; zero → no pill", async () => {
    state.alerts = [{ id: "a1" }, { id: "a2" }];
    await renderLoader();
    const pillEl = screen.getByTestId("published-show-review-alert-pill");
    expect(pillEl.textContent).toMatch(/2/);
    // The count must not ALSO render in the strip — the relocation is a move.
    expect(screen.queryByTestId("strip-alert-badge")).toBeNull();
  });

  it("no open alerts → no header alert pill", async () => {
    state.alerts = [];
    await renderLoader();
    expect(screen.queryByTestId("published-show-review-alert-pill")).toBeNull();
  });
});

// Finalize-owned read fault (invariant 9): the readfinalizeowned_b2 RPC read
// must NOT be silently dark. A RETURNED {error} and a THROWN await are BOTH
// logged (log.error, source admin.show, ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED +
// slug) and BOTH fail toward NOT-finalize-owned (fail-open). The observable
// fail-open proof: a published+!archived show whose finalize read faults still
// renders the Archive control (finalizeOwned true would suppress it, §6), rather
// than freezing the affordance on a transient blip.
describe("show review modal loader — finalize-owned read fault (invariant 9)", () => {
  const finalizeErrorCall = () =>
    logSpy.error.mock.calls.find(
      (c) =>
        (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
    );

  it("readfinalizeowned_b2 returned error → fail-open (Archive control renders) + logged, not silent", async () => {
    state.finalizeError = { message: "rpc boom" };
    await renderLoader();
    // fail-open: finalizeOwned=false, so the Archive affordance is NOT frozen.
    expect(screen.getByTestId("archive-show-button")).toBeTruthy();
    // NOT silent: the returned-error path emits the forensic code with source+slug.
    const call = finalizeErrorCall();
    expect(
      call,
      "returned-error path did not emit ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED",
    ).toBeTruthy();
    expect(String(call![0])).toMatch(/returned error/);
    const ctx = call![1] as { source?: string; slug?: string };
    expect(ctx.source).toBe("admin.show");
    expect(ctx.slug).toBe("rpas");
  });

  it("readfinalizeowned_b2 threw → fail-open (Archive control renders) + logged (distinct 'threw' path)", async () => {
    state.finalizeThrows = true;
    await renderLoader();
    expect(screen.getByTestId("archive-show-button")).toBeTruthy();
    const call = finalizeErrorCall();
    expect(call, "thrown path did not emit ADMIN_SHOW_FINALIZE_OWNED_RPC_FAILED").toBeTruthy();
    expect(String(call![0])).toMatch(/threw/);
    expect((call![1] as { slug?: string }).slug).toBe("rpas");
  });

  it("healthy finalize=true (no fault) suppresses the Archive control — proves the affordance is finalize-gated", async () => {
    state.finalizeOwned = true;
    await renderLoader();
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    expect(finalizeErrorCall()).toBeUndefined();
  });
});

// Structural guard (carried over): every ADMIN_SHOW_* read-fault emit carries a
// top-level slug correlator, so a future edit that drops it fails here.
describe("show review modal loader — ADMIN_SHOW_* emits all carry slug (structural)", () => {
  it("every ADMIN_SHOW_* read-fault log call has a top-level slug field", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const ts = (await import("typescript")).default;
    const file = join(process.cwd(), "app/admin/_showReviewModal.tsx");
    const src = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const offenders: string[] = [];
    const allCodes: string[] = [];
    const visit = (node: import("typescript").Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "log" &&
        (node.expression.name.text === "error" || node.expression.name.text === "warn")
      ) {
        const arg2 = node.arguments[1];
        if (arg2 && ts.isObjectLiteralExpression(arg2)) {
          let code: string | null = null;
          let hasSlug = false;
          for (const p of arg2.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
              if (p.name.text === "code" && ts.isStringLiteralLike(p.initializer))
                code = p.initializer.text;
              if (p.name.text === "slug") hasSlug = true;
            } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === "slug") {
              hasSlug = true;
            }
          }
          if (code && code.startsWith("ADMIN_SHOW_")) {
            allCodes.push(code);
            if (!hasSlug) offenders.push(code);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    expect(allCodes.length).toBeGreaterThanOrEqual(5);
    expect(
      offenders,
      `these ADMIN_SHOW_* emits are missing a slug field: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
