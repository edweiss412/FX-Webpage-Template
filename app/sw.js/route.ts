/**
 * GET /sw.js: the saved-copy worker (spec 4.1, 4.10).
 *
 * A route handler rather than a file in public/ so the kill switch can swap the
 * body at runtime. The environment is read inside GET on every request and the
 * route opts out of static rendering, so flipping `CREW_OFFLINE_DISABLED` in the
 * Vercel project takes effect on the next request with no deploy. Headers are
 * the PWA guide's (spec 3.6): the worker URL is never cached, which is what
 * lets a browser's update check see a new worker.
 */
import { SW_SOURCE } from "@/lib/offline/__generated__/swSource";
import { KILL_SWITCH_SOURCE, crewOfflineDisabled } from "@/lib/offline/killSwitch";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const source = crewOfflineDisabled(process.env) ? KILL_SWITCH_SOURCE : SW_SOURCE;
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
