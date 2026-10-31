import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { premiseHolds } from "@/tests/_shared/premise";
import { SW_SOURCE } from "@/lib/offline/__generated__/swSource";
import { KILL_SWITCH_SOURCE } from "@/lib/offline/killSwitch";
import * as route from "@/app/sw.js/route";

// /sw.js (spec 4.10, 3.6): the bundled worker, or the self-removing worker when
// CREW_OFFLINE_DISABLED is 1 at the moment of the request.

const VARIABLE = "CREW_OFFLINE_DISABLED";
const original = process.env[VARIABLE];

beforeEach(() => {
  delete process.env[VARIABLE];
});

afterEach(() => {
  if (original === undefined) delete process.env[VARIABLE];
  else process.env[VARIABLE] = original;
});

describe("/sw.js", () => {
  test("premise: the two workers differ and neither is empty", () => {
    premiseHolds(
      "SW_SOURCE and KILL_SWITCH_SOURCE are non-empty and distinct, or every body case below passes on either",
      SW_SOURCE.length > 0 && KILL_SWITCH_SOURCE.length > 0 && SW_SOURCE !== KILL_SWITCH_SOURCE,
    );
  });

  test("opts out of static rendering", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  test("serves the bundled worker, byte for byte, when the variable is unset", async () => {
    const response = await route.GET();
    expect(response.status).toBe(200);
    const body = await response.arrayBuffer();
    expect(Buffer.from(body).equals(Buffer.from(SW_SOURCE, "utf8"))).toBe(true);
  });

  test("serves the self-removing worker when the variable is 1", async () => {
    process.env[VARIABLE] = "1";
    const response = await route.GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(KILL_SWITCH_SOURCE);
  });

  test.each(["0", "true", "", "yes"])(
    "serves the bundled worker when the variable is %j",
    async (value) => {
      process.env[VARIABLE] = value;
      expect(await (await route.GET()).text()).toBe(SW_SOURCE);
    },
  );

  test("reads the variable on every request, not once at module load", async () => {
    // The module is already loaded with the variable unset, so any answer that
    // follows the variable below can only come from a read inside GET.
    expect(await (await route.GET()).text()).toBe(SW_SOURCE);

    process.env[VARIABLE] = "1";
    expect(await (await route.GET()).text()).toBe(KILL_SWITCH_SOURCE);

    delete process.env[VARIABLE];
    expect(await (await route.GET()).text()).toBe(SW_SOURCE);

    process.env[VARIABLE] = "1";
    expect(await (await route.GET()).text()).toBe(KILL_SWITCH_SOURCE);
  });

  test.each([
    ["the bundled worker", undefined],
    ["the self-removing worker", "1"],
  ])("sends the worker headers with %s", async (_label, value) => {
    if (value !== undefined) process.env[VARIABLE] = value;
    const response = await route.GET();
    expect(response.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
  });
});
