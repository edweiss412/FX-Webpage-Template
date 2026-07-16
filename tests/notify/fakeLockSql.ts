// Shared fake single-flight lock client (batching spec §2.1b).
// STANDING RULE: any fake-SQL unit test calling deliverRealtimeCandidates with
// non-empty inputs MUST inject this via deps.lockSql — otherwise the default
// path constructs a real postgres lock client and the test stops being a unit test.
import { vi } from "vitest";
import type { DeliverySql } from "@/lib/notify/deliver";

export function fakeLockSql(options: { locked?: boolean; heartbeatFailsAt?: number } = {}) {
  let heartbeats = 0;
  const tx = (<T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    const text = String.raw(strings, ...values.map((_v, i) => `$${i + 1}`));
    if (/pg_try_advisory_xact_lock/i.test(text)) {
      return Promise.resolve([{ locked: options.locked ?? true } as unknown as T]);
    }
    heartbeats += 1;
    if (options.heartbeatFailsAt !== undefined && heartbeats >= options.heartbeatFailsAt) {
      return Promise.reject(new Error("lock connection lost"));
    }
    return Promise.resolve([] as T[]);
  }) as DeliverySql;
  return {
    begin: vi.fn(<T,>(fn: (sql: DeliverySql) => Promise<T>): Promise<T> => fn(tx)),
    end: vi.fn(async () => {}),
    heartbeatCount: () => heartbeats,
  };
}
