const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * `11-02`: mirrors `Ago.Chat.Domain.WidgetConfig`'s own constructor pattern (`^#[0-9A-Fa-f]{6}$`)
 * closely enough to catch an obvious typo before a round trip - UX-only, the same "client-side check
 * mirrors the server's own rule without trying to replicate every case" posture `OnboardingPage`'s own
 * `validate()` already takes toward `OriginValidator`. `11-01`'s `UpdateWidgetConfigHandler` is the
 * real, authoritative gate; a false "looks fine" here just means the server rejects it instead and
 * `WidgetConfigPage` surfaces that `detail` text unchanged.
 */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/**
 * `16-04`: mirrors `Ago.Chat.Domain.WidgetConfig`'s own `https://`-only check on the notice URL - the
 * same UX-only, "server is the real gate" posture `isValidHexColor` already takes, not `6-03`'s wider
 * SSRF/private-range validator (which exists because a webhook URL is fetched *by the server*; a
 * notice URL is only ever opened in the visitor's own browser, so that threat model does not apply -
 * `WidgetConfig`'s own remarks have the full reasoning). `URL` is a browser/Node global available in
 * this bundle's target environment without an extra dependency.
 */
export function isValidNoticeUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
