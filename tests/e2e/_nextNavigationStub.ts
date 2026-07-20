// tests/e2e/_nextNavigationStub.ts
// esbuild --alias target for `next/navigation` in the compact-alert-card live
// harness: AttentionBanner (and its resolve button) read router hooks that the
// standalone browser bundle has no Next runtime for. Static values are correct
// here - the harness never navigates.
export const usePathname = () => "/admin";
export const useRouter = () => ({ refresh() {}, push() {} });
export const useSearchParams = () => new URLSearchParams("");
