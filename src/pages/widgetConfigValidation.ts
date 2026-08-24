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
