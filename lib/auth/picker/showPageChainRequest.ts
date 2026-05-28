import { cookies, headers } from "next/headers";

/**
 * Build the synthetic `Request` that `resolveShowPageAccess` reads to dispatch
 * the show-page auth chain (picker cookie, admin session, Google session).
 *
 * Cookies are sourced from Next's `cookies()` store — NOT from the inbound
 * `headers().get("cookie")` value. This is load-bearing: when a Server Action
 * on the show route (e.g. `selectIdentity`) sets `__Host-fxav_picker` and calls
 * `revalidatePath`, Next re-renders the page within the SAME response. The
 * inbound request header is immutable and still lacks the just-set selection,
 * but the `cookies()` store reflects same-request Server Action writes. Reading
 * the immutable header instead is what caused the picker "double-tap" bug
 * (M12 Phase 0.F smokes 5+6): the first tap's re-render missed the new cookie
 * and re-rendered the picker, and only the second tap (whose browser request
 * replayed the stored cookie) resolved.
 */
export async function buildShowPageChainRequest(): Promise<Request> {
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const path = h.get("x-pathname") ?? "/";
  return new Request(`http://internal${path}`, {
    headers: { cookie: cookieHeader },
  });
}
