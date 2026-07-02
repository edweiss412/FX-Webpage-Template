// lib/log/requestContext.ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string | null;
  showId?: string | null;
  // Cron in-flight attribution (audit #4 PR-1): runScheduledCronSync mirrors its
  // phase/driveFileId/processedCount here so runCronRoute's throw-catch can
  // attribute a detached/route-tail throw that bypasses the S1 syncRunContext attach.
  cronPhase?: string;
  cronInFlightDriveFileId?: string | null;
  cronProcessedCount?: number;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

export function deriveRequestId(headers: Headers): string {
  return headers.get("x-vercel-id") ?? crypto.randomUUID();
}

export function setRequestShowId(showId: string): void {
  const store = als.getStore();
  if (store) store.showId = showId;
}

/**
 * Mirror the cron in-flight markers into the active request-context store (no-op
 * outside an ALS scope). `driveFileId: null` clears the id (exactOptional-safe —
 * no `= undefined`, no `delete`). Only keys present in `patch` are written.
 */
export function setCronInFlight(patch: {
  phase?: string;
  driveFileId?: string | null;
  processedCount?: number;
}): void {
  const store = als.getStore();
  if (!store) return;
  if (patch.phase !== undefined) store.cronPhase = patch.phase;
  if (patch.driveFileId !== undefined) store.cronInFlightDriveFileId = patch.driveFileId; // null = clear
  if (patch.processedCount !== undefined) store.cronProcessedCount = patch.processedCount;
}
