// M12.13 Task 11 — confirm-page POST server action (spec §5 POST contract).
// The action re-validates the recipient binding from the FORM PAYLOAD before
// any token use (R9 — the GET-time check does not protect the POST), then
// consumes EXCLUSIVELY via the locked wrapper `unpublishShowViaEmailedLink`
// (structural pin: never plain `unpublishShow` — R15 would leave the
// check-then-consume race on this leg). Outcome mapping per §5:
//   success → success copy w/ title; expired → catalog copy; consumed AND
//   not_found → NEUTRAL (R19/R20 — CONSUMED never renders publicly);
//   infra (returned precheck fault or thrown wrapper fault) → retry state.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { UnpublishShowResult } from "@/lib/sync/unpublishShow";
import { messageFor } from "@/lib/messages/lookup";

const wrapperMock = vi.hoisted(() => ({
  result: { outcome: "success", status: 200, showId: "show-1" } as UnpublishShowResult,
  throws: false,
  calls: [] as Array<{ slug: string; token: string; r: string }>,
}));

const precheckMock = vi.hoisted(() => ({
  result: { kind: "ok", title: "Client Show" } as
    | { kind: "ok"; title: string }
    | { kind: "neutral" }
    | { kind: "infra" },
  calls: [] as Array<{ slug: string; token: string; r: string }>,
}));

vi.mock("@/lib/sync/unpublishShow", () => ({
  unpublishShowViaEmailedLink: async (args: { slug: string; token: string; r: string }) => {
    wrapperMock.calls.push(args);
    if (wrapperMock.throws) throw new Error("simulated wrapper infra fault");
    return wrapperMock.result;
  },
  // Plain unpublishShow is exported here ONLY to detonate if the action ever
  // reaches for it — the structural pin below also greps the source.
  unpublishShow: async () => {
    throw new Error("STRUCTURAL VIOLATION: public action called plain unpublishShow");
  },
}));

vi.mock("@/lib/sync/unpublishConfirmPage", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    prevalidateUnpublishBinding: async (args: { slug: string; token: string; r: string }) => {
      precheckMock.calls.push(args);
      return precheckMock.result;
    },
  };
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const VALID_FIELDS = { slug: "client-show", token: "tok-1", r: "0123456789abcdef" };

async function runAction(fields: Record<string, string> = VALID_FIELDS) {
  const { confirmUnpublishAction } = await import("@/app/show/[slug]/unpublish/actions");
  return confirmUnpublishAction({ status: "idle" }, form(fields));
}

beforeEach(() => {
  wrapperMock.result = { outcome: "success", status: 200, showId: "show-1" };
  wrapperMock.throws = false;
  wrapperMock.calls = [];
  precheckMock.result = { kind: "ok", title: "Client Show" };
  precheckMock.calls = [];
});

describe("confirmUnpublishAction", () => {
  test("missing token/r/slug in the payload → neutral; wrapper NEVER called", async () => {
    for (const broken of [
      { slug: "client-show", r: "0123456789abcdef" },
      { slug: "client-show", token: "tok-1" },
      { token: "tok-1", r: "0123456789abcdef" },
      { slug: "client-show", token: "", r: "0123456789abcdef" },
    ]) {
      const state = await runAction(broken as Record<string, string>);
      expect(state).toEqual({ status: "neutral" });
    }
    expect(wrapperMock.calls).toEqual([]);
    expect(precheckMock.calls).toEqual([]);
  });

  test("binding pre-check neutral → neutral; wrapper NEVER called (token not consumed)", async () => {
    precheckMock.result = { kind: "neutral" };
    const state = await runAction();
    expect(state).toEqual({ status: "neutral" });
    expect(precheckMock.calls).toEqual([VALID_FIELDS]);
    expect(wrapperMock.calls).toEqual([]);
  });

  test("binding pre-check infra fault → retry state; wrapper NEVER called", async () => {
    precheckMock.result = { kind: "infra" };
    const state = await runAction();
    expect(state).toEqual({ status: "infra" });
    expect(wrapperMock.calls).toEqual([]);
  });

  test("pre-check ok → consumes via unpublishShowViaEmailedLink with {slug, token, r}; success carries the title", async () => {
    const state = await runAction();
    expect(wrapperMock.calls).toEqual([VALID_FIELDS]);
    expect(state).toEqual({ status: "success", title: "Client Show" });
  });

  test("expired outcome → catalog copy via lib/messages/lookup (invariant 5 — never the raw code)", async () => {
    wrapperMock.result = {
      outcome: "expired",
      status: 400,
      code: "UNPUBLISH_TOKEN_EXPIRED",
      showId: "show-1",
    };
    const state = await runAction();
    const entry = messageFor("UNPUBLISH_TOKEN_EXPIRED");
    expect(state).toEqual({
      status: "expired",
      title: entry.title,
      body: entry.dougFacing,
    });
    // The rendered payload must not smuggle the raw code anywhere.
    expect(JSON.stringify(state)).not.toContain("UNPUBLISH_TOKEN_EXPIRED");
  });

  test("not_found outcome → neutral", async () => {
    wrapperMock.result = { outcome: "not_found", status: 404 };
    expect(await runAction()).toEqual({ status: "neutral" });
  });

  test("consumed outcome → NEUTRAL (R20: CONSUMED never renders on any public leg)", async () => {
    wrapperMock.result = {
      outcome: "consumed",
      status: 400,
      code: "UNPUBLISH_TOKEN_CONSUMED",
      showId: "show-1",
    };
    const state = await runAction();
    expect(state).toEqual({ status: "neutral" });
    expect(JSON.stringify(state)).not.toContain("UNPUBLISH_TOKEN_CONSUMED");
  });

  test("double-submit shape: wrapper sees the token columns gone → not_found → neutral (R19)", async () => {
    // After a successful consume the re-fired action's wrapper call finds the
    // mint gone and r underivable — the wrapper returns not_found, and the
    // submitter (who already saw success render in place) sees neutral.
    wrapperMock.result = { outcome: "not_found", status: 404 };
    expect(await runAction()).toEqual({ status: "neutral" });
  });

  test("wrapper THROWN infra fault → retry state (invariant 9: never a benign state)", async () => {
    wrapperMock.throws = true;
    const state = await runAction();
    expect(state).toEqual({ status: "infra" });
  });

  test("STRUCTURAL: the action source consumes only via unpublishShowViaEmailedLink, never plain unpublishShow", () => {
    const source = readFileSync(
      join(process.cwd(), "app/show/[slug]/unpublish/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/unpublishShowViaEmailedLink\(/);
    // `unpublishShow(` with a word boundary would not match the wrapper name
    // (which continues with "ViaEmailedLink"), so this pins the bypass out.
    expect(source).not.toMatch(/\bunpublishShow\(/);
  });
});
