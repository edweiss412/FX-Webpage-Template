// lib/log/requestContext.ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string | null;
  showId?: string | null;
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
