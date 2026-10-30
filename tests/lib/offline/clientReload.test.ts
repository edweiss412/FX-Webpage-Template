/**
 * reloadPage (lib/offline/client/reload.ts) is the seam the offline client
 * components reload through, because jsdom's `location.reload` cannot be
 * spied (preflight ruling D6). This pins that the seam really reloads.
 */
import { afterEach, expect, test, vi } from "vitest";
import { reloadPage } from "@/lib/offline/client/reload";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reloads the current page", () => {
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });

  reloadPage();

  expect(reload).toHaveBeenCalledTimes(1);
});
