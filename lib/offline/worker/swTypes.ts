/**
 * The few service-worker types the worker glue needs (spec 4.2).
 *
 * The repo's tsconfig carries the `dom` lib and not `webworker`, so
 * `FetchEvent`, `ExtendableEvent` and the worker's global scope are not
 * declared. These are the minimal shapes the handlers read; the browser's real
 * objects satisfy them, and the unit tests build plain objects that do.
 */

/** An event whose lifetime the worker can extend while background work runs. */
export interface ExtendableEvent {
  waitUntil(promise: Promise<unknown>): void;
}

export interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

/** The end of a `MessageChannel` a page sends with its message; the reply goes back on it. */
export interface ReplyPort {
  postMessage(message: unknown): void;
}

export interface ExtendableMessageEvent extends ExtendableEvent {
  readonly data: unknown;
  readonly ports: readonly ReplyPort[];
}

/** An open page of this origin. */
export interface WindowClient {
  readonly url: string;
  postMessage(message: unknown): void;
}

export interface Clients {
  matchAll(options: {
    type: "window";
    includeUncontrolled: boolean;
  }): Promise<readonly WindowClient[]>;
  claim(): Promise<void>;
}

export type WorkerEventMap = {
  install: ExtendableEvent;
  activate: ExtendableEvent;
  fetch: FetchEvent;
  message: ExtendableMessageEvent;
};

/** What the handlers need from `self`. */
export interface WorkerScope {
  readonly location: { readonly origin: string };
  addEventListener<K extends keyof WorkerEventMap>(
    type: K,
    listener: (event: WorkerEventMap[K]) => void,
  ): void;
  skipWaiting(): Promise<void>;
}

/** The subset of `Cache` the worker uses. Keys are absolute URL strings. */
export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
  keys(): Promise<readonly Request[]>;
}

/** The subset of `CacheStorage` the worker uses (preflight ruling D3). */
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<readonly string[]>;
  delete(name: string): Promise<boolean>;
}

export interface Timers {
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}
