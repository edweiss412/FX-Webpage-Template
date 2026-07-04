import type { PickerInterstitialBannerCode } from "./_PickerInterstitial";

/**
 * The picker-resolver "stale" result kinds that render the <PickerInterstitial> re-pick banner.
 * A per-member `selection_reset` uses the SAME crew-facing copy as `epoch_stale`
 * (PICKER_EPOCH_STALE_BANNER = "Doug reset access for this show — pick yourself again.") —
 * accurate for an admin reset, unlike the claimed-after-pick banner ("claimed by a signed-in user").
 */
export type StaleBannerKind =
  | "epoch_stale"
  | "removed_from_roster"
  | "selection_reset"
  | "identity_invalidated";

export function staleBannerFor(kind: StaleBannerKind): PickerInterstitialBannerCode {
  switch (kind) {
    case "epoch_stale":
    case "selection_reset":
      return "PICKER_EPOCH_STALE_BANNER";
    case "removed_from_roster":
      return "PICKER_REMOVED_FROM_ROSTER_BANNER";
    case "identity_invalidated":
      return "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER";
  }
}
