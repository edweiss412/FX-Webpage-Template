// M12.13 Task 11 — confirm-page GET state machine (spec §5, R11 evaluation
// order). The evaluator's NON-CONSUMING order is the contract under test:
//   (1) absent token/r → neutral, NOTHING fetched;
//   (2) show fetch (id, stored token for in-memory mintId, expiry) —
//       fault → retry, missing/no live token → neutral;
//   (3) binding validation against unrevoked admin_emails via the tuple HMAC —
//       fault → retry, no match → neutral with the submitted token NEVER
//       compared (the call-order pin: binding failures must not leak token
//       validity);
//   (4) constant-time token compare LAST → confirm / neutral / expired.
import { describe, expect, test, vi } from "vitest";
import {
  evaluateUnpublishConfirmGet,
  prevalidateUnpublishBinding,
  type UnpublishConfirmDeps,
} from "@/lib/sync/unpublishConfirmPage";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";

const SHOW_ID = "11111111-2222-3333-4444-555555555555";
const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ADMIN_EMAIL = "doug@example.com";
const NOW = new Date("2026-06-12T12:00:00.000Z");
const LIVE_EXPIRY = "2026-06-12T20:00:00.000Z";
const PAST_EXPIRY = "2026-06-12T04:00:00.000Z";

function validR(): string {
  return recipientBindingFor(ADMIN_EMAIL, SHOW_ID, mintIdFor(TOKEN));
}

function makeDeps(overrides: Partial<UnpublishConfirmDeps> = {}): {
  deps: UnpublishConfirmDeps;
  spies: {
    readShow: ReturnType<typeof vi.fn>;
    readAdmins: ReturnType<typeof vi.fn>;
    compareTokens: ReturnType<typeof vi.fn>;
  };
} {
  const readShow = vi.fn(async (_slug: string) => ({
    id: SHOW_ID,
    title: "Client Show",
    unpublishToken: TOKEN as string | null,
    unpublishTokenExpiresAt: LIVE_EXPIRY as string | null,
  }));
  const readAdmins = vi.fn(async () => [{ email: ADMIN_EMAIL }]);
  const compareTokens = vi.fn((submitted: string, stored: string) => submitted === stored);
  const deps: UnpublishConfirmDeps = {
    readShowForConfirm: readShow,
    readActiveAdminEmails: readAdmins,
    compareTokens,
    now: () => NOW,
    ...overrides,
  };
  return { deps, spies: { readShow, readAdmins, compareTokens } };
}

describe("evaluateUnpublishConfirmGet — §5 R11 order", () => {
  test("step 1: absent token → neutral with NOTHING fetched", async () => {
    const { deps, spies } = makeDeps();
    const state = await evaluateUnpublishConfirmGet(
      { slug: "s", token: undefined, r: validR() },
      deps,
    );
    expect(state).toEqual({ state: "neutral" });
    expect(spies.readShow).not.toHaveBeenCalled();
    expect(spies.readAdmins).not.toHaveBeenCalled();
    expect(spies.compareTokens).not.toHaveBeenCalled();
  });

  test("step 1: absent r → neutral with NOTHING fetched", async () => {
    const { deps, spies } = makeDeps();
    const state = await evaluateUnpublishConfirmGet(
      { slug: "s", token: TOKEN, r: undefined },
      deps,
    );
    expect(state).toEqual({ state: "neutral" });
    expect(spies.readShow).not.toHaveBeenCalled();
  });

  test("step 1: empty-string token or r → neutral with NOTHING fetched", async () => {
    const { deps, spies } = makeDeps();
    expect(await evaluateUnpublishConfirmGet({ slug: "s", token: "", r: validR() }, deps)).toEqual({
      state: "neutral",
    });
    expect(await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: "" }, deps)).toEqual({
      state: "neutral",
    });
    expect(spies.readShow).not.toHaveBeenCalled();
  });

  test("step 2: show fetch THROWN fault → retry state (never neutral/expired)", async () => {
    const { deps } = makeDeps({
      readShowForConfirm: vi.fn(async () => {
        throw new Error("simulated DB fault");
      }),
    });
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "infra" });
  });

  test("step 2: show fetch SYNC-thrown fault (returned-error channel of a raw seam) → retry state", async () => {
    const { deps } = makeDeps({
      readShowForConfirm: (() => {
        throw new Error("simulated sync construction fault");
      }) as unknown as UnpublishConfirmDeps["readShowForConfirm"],
    });
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "infra" });
  });

  test("step 2: show missing → neutral; binding + compare never run", async () => {
    const { deps, spies } = makeDeps({ readShowForConfirm: vi.fn(async () => null) });
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "neutral" });
    expect(spies.readAdmins).not.toHaveBeenCalled();
    expect(spies.compareTokens).not.toHaveBeenCalled();
  });

  test("step 2: no live token columns (consumed) → neutral — CONSUMED never surfaces publicly (R19)", async () => {
    const { deps, spies } = makeDeps({
      readShowForConfirm: vi.fn(async () => ({
        id: SHOW_ID,
        title: "Client Show",
        unpublishToken: null,
        unpublishTokenExpiresAt: null,
      })),
    });
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "neutral" });
    expect(spies.readAdmins).not.toHaveBeenCalled();
    expect(spies.compareTokens).not.toHaveBeenCalled();
  });

  test("step 3: admin_emails read fault → retry state; token never compared", async () => {
    const { deps, spies } = makeDeps({
      readActiveAdminEmails: vi.fn(async () => {
        throw new Error("simulated admin_emails fault");
      }),
    });
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "infra" });
    expect(spies.compareTokens).not.toHaveBeenCalled();
  });

  test("step 3: binding no-match → neutral with the submitted token NEVER compared (order pin)", async () => {
    const { deps, spies } = makeDeps();
    const state = await evaluateUnpublishConfirmGet(
      { slug: "s", token: TOKEN, r: "0123456789abcdef" },
      deps,
    );
    expect(state).toEqual({ state: "neutral" });
    expect(spies.readShow).toHaveBeenCalledTimes(1);
    expect(spies.readAdmins).toHaveBeenCalledTimes(1);
    expect(spies.compareTokens).not.toHaveBeenCalled();
  });

  test("step 3: revoked-recipient r (no unrevoked rows) → neutral, token never compared", async () => {
    const { deps, spies } = makeDeps({ readActiveAdminEmails: vi.fn(async () => []) });
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "neutral" });
    expect(spies.compareTokens).not.toHaveBeenCalled();
  });

  test("step 4: binding valid + token matches + unexpired → confirm with title; compare ran LAST", async () => {
    const { deps, spies } = makeDeps();
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "confirm", title: "Client Show" });
    expect(spies.compareTokens).toHaveBeenCalledTimes(1);
    // Call order: show fetch, then admins, then compare.
    const showOrder = spies.readShow.mock.invocationCallOrder[0]!;
    const adminOrder = spies.readAdmins.mock.invocationCallOrder[0]!;
    const compareOrder = spies.compareTokens.mock.invocationCallOrder[0]!;
    expect(showOrder).toBeLessThan(adminOrder);
    expect(adminOrder).toBeLessThan(compareOrder);
  });

  test("step 4: binding valid + token mismatch → neutral (not expired, even when expiry is past)", async () => {
    const wrongToken = "ffffffff-0000-1111-2222-333333333333";
    const { deps } = makeDeps({
      readShowForConfirm: vi.fn(async () => ({
        id: SHOW_ID,
        title: "Client Show",
        unpublishToken: TOKEN,
        unpublishTokenExpiresAt: PAST_EXPIRY,
      })),
    });
    const state = await evaluateUnpublishConfirmGet(
      { slug: "s", token: wrongToken, r: validR() },
      deps,
    );
    expect(state).toEqual({ state: "neutral" });
  });

  test("step 4: binding valid + token matches + expired → expired state", async () => {
    const { deps } = makeDeps({
      readShowForConfirm: vi.fn(async () => ({
        id: SHOW_ID,
        title: "Client Show",
        unpublishToken: TOKEN,
        unpublishTokenExpiresAt: PAST_EXPIRY,
      })),
    });
    const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r: validR() }, deps);
    expect(state).toEqual({ state: "expired" });
  });

  test("an r minted for ANOTHER show or a PRIOR mint fails (R10) — neutral, token never compared", async () => {
    const otherShowR = recipientBindingFor(
      ADMIN_EMAIL,
      "99999999-8888-7777-6666-555555555555",
      mintIdFor(TOKEN),
    );
    const priorMintR = recipientBindingFor(
      ADMIN_EMAIL,
      SHOW_ID,
      mintIdFor("deadbeef-dead-beef-dead-beefdeadbeef"),
    );
    for (const r of [otherShowR, priorMintR]) {
      const { deps, spies } = makeDeps();
      const state = await evaluateUnpublishConfirmGet({ slug: "s", token: TOKEN, r }, deps);
      expect(state).toEqual({ state: "neutral" });
      expect(spies.compareTokens).not.toHaveBeenCalled();
    }
  });
});

describe("prevalidateUnpublishBinding — POST pre-check (steps 1-3 only; the wrapper owns step 4)", () => {
  test("valid binding → ok with the show title; the submitted token is NEVER compared", async () => {
    const { deps, spies } = makeDeps();
    const result = await prevalidateUnpublishBinding(
      { slug: "s", token: TOKEN, r: validR() },
      deps,
    );
    expect(result).toEqual({ kind: "ok", title: "Client Show" });
    expect(spies.compareTokens).not.toHaveBeenCalled();
  });

  test("absent params → neutral, nothing fetched", async () => {
    const { deps, spies } = makeDeps();
    expect(await prevalidateUnpublishBinding({ slug: "s", token: "", r: validR() }, deps)).toEqual({
      kind: "neutral",
    });
    expect(spies.readShow).not.toHaveBeenCalled();
  });

  test("consumed (null token columns) → neutral — r is underivable (R19)", async () => {
    const { deps } = makeDeps({
      readShowForConfirm: vi.fn(async () => ({
        id: SHOW_ID,
        title: "Client Show",
        unpublishToken: null,
        unpublishTokenExpiresAt: null,
      })),
    });
    expect(
      await prevalidateUnpublishBinding({ slug: "s", token: TOKEN, r: validR() }, deps),
    ).toEqual({
      kind: "neutral",
    });
  });

  test("binding no-match → neutral; infra fault → infra", async () => {
    const { deps } = makeDeps();
    expect(
      await prevalidateUnpublishBinding({ slug: "s", token: TOKEN, r: "0123456789abcdef" }, deps),
    ).toEqual({ kind: "neutral" });

    const { deps: faultDeps } = makeDeps({
      readShowForConfirm: vi.fn(async () => {
        throw new Error("simulated fault");
      }),
    });
    expect(
      await prevalidateUnpublishBinding({ slug: "s", token: TOKEN, r: validR() }, faultDeps),
    ).toEqual({ kind: "infra" });
  });
});
