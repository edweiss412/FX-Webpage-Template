/**
 * The single show fixture behind the Wi-Fi raw-fallback regression pin.
 *
 * Shared deliberately: `tests/fixtures/venueSectionRawWifi.html` was captured by
 * rendering VenueSection with EXACTLY these props BEFORE the Wi-Fi split landed,
 * and the assertion in VenueSection.wifiRoom.test.tsx re-renders with the same
 * builder. If the props were declared twice, the byte-identical claim would
 * quietly become a claim about two different renders.
 *
 * `internet` is the East Coast corpus value (prose only, unsplittable), so the
 * post-change component must take the raw-fallback branch. `rooms` is empty so
 * the room row is absent on both sides and the diff isolates the Wi-Fi rows.
 */
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";

/** East Coast `event_details.internet` — prose only, no label vocabulary. */
export const RAW_WIFI_VALUE = "The conference wifi has 20mb download speed.";

export const RAW_WIFI_SHOW_ID = "show-raw-wifi";
export const RAW_WIFI_TODAY = new Date("2026-05-14T15:00:00Z");

export function makeRawWifiShow(): ShowForViewer {
  return makeShowForViewer({
    show: {
      venue: {
        name: "Test Venue",
        address: "123 Main St, Chicago",
        loadingDock: "Dock at rear",
        notes: "Quiet load-in",
      },
      coi_status: "Received",
      event_details: { internet: RAW_WIFI_VALUE, power: "200A 3-phase" },
    },
    rooms: [],
  });
}
