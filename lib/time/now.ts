import { headers } from "next/headers";

const ISO_8601_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;

/**
 * Returns the current instant as an ISO string.
 *
 * In normal production shape this is equivalent to `new Date().toISOString()`.
 * During screenshot capture, it honors `X-Screenshot-Frozen-Now` only when the
 * request also satisfies the existing test-auth env + bearer gate.
 */
export async function now(): Promise<string> {
  return (await nowDate()).toISOString();
}

/**
 * Returns the current instant as a Date.
 *
 * Use this for server-side render-time timestamps. Mutation paths should keep
 * real wall-clock timestamps and carry the C.4 `not-render-side` waiver.
 */
export async function nowDate(): Promise<Date> {
  if (process.env.ENABLE_TEST_AUTH !== "true") {
    return new Date();
  }

  let requestHeaders: Awaited<ReturnType<typeof headers>>;
  try {
    requestHeaders = await headers();
  } catch {
    // Outside a request scope, such as build-time RSC compilation, there is no
    // per-request header to honor.
    return new Date();
  }

  const frozen = requestHeaders.get("x-screenshot-frozen-now");
  if (!frozen) {
    return new Date();
  }

  const expectedSecret = process.env.TEST_AUTH_SECRET;
  if (!expectedSecret || expectedSecret.length < 16) {
    return new Date();
  }

  if (requestHeaders.get("authorization") !== `Bearer ${expectedSecret}`) {
    return new Date();
  }

  const match = ISO_8601_RE.exec(frozen);
  if (!match) {
    return new Date();
  }
  const [, yyyy = "", MM = "", dd = "", hh = "", mm = "", ss = ""] = match;

  const parsed = new Date(frozen);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  if (
    parsed.getUTCFullYear() !== Number(yyyy) ||
    parsed.getUTCMonth() + 1 !== Number(MM) ||
    parsed.getUTCDate() !== Number(dd) ||
    parsed.getUTCHours() !== Number(hh) ||
    parsed.getUTCMinutes() !== Number(mm) ||
    parsed.getUTCSeconds() !== Number(ss)
  ) {
    return new Date();
  }

  return parsed;
}
