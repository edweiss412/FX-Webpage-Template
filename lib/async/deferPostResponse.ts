/**
 * lib/async/deferPostResponse.ts
 * Schedule `task` to run after the current response is sent (Next `after()`).
 *
 * Plain module, NOT "use server": a "use server" file may only export server
 * actions, and a function-typed dep cannot ride an action's serialized
 * argument channel without widening the client-facing wire surface (spec
 * 2026-07-16-use-raw-bg-apply §2.1). Callers own the task's error handling —
 * a rejected task must be caught INSIDE the task body; this helper never
 * awaits it. Outside a request scope (unit tests), after() throws
 * synchronously — callers that must not throw post-commit wrap the call.
 */
import { after } from "next/server";

export function deferPostResponse(task: () => Promise<void>): void {
  after(task);
}
