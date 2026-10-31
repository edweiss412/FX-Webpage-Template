/**
 * Reloads the page. A seam of its own because jsdom's `location.reload` is a
 * non-configurable property no test can spy on, so the offline client
 * components reload through this function and their tests mock it
 * (preflight ruling D6).
 */
export function reloadPage(): void {
  window.location.reload();
}
