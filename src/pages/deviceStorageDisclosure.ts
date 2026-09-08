import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `24-15`: one row of the tenant-facing document at `/settings/device-storage` - one key the widget
 * writes to a visitor's own `localStorage`, and the three facts a tenant needs to declare it: what
 * it holds, why it exists, and how long it lives. `holdsKey`/`whyKey`/`lifetimeKey` name entries in
 * `ConsoleStrings` rather than carrying literal text, so the page renders in whichever locale the
 * tenant's site is configured for, the same as every other settings screen.
 */
export interface DeviceStorageDisclosureRow {
  /** The key suffix a tenant would see in their browser's dev tools, after `ago-chat:<siteKey>:`.
   * `last-sequence:<conversationId>` is templated - one physical key per conversation the browser
   * has resumed, not a single literal key - stated as such rather than picking one example id. */
  key: string;
  holdsKey: keyof ConsoleStrings;
  whyKey: keyof ConsoleStrings;
  lifetimeKey: keyof ConsoleStrings;
}

/**
 * **Not a live import.** `ago-widget` and `ago-console` are separate repositories that build and
 * deploy independently - the console does not consume the widget as a package, so there is no
 * mechanical link between this list and `ago-widget/src/storage.ts`'s own `WIDGET_STORAGE_DISCLOSURE`,
 * the single source of truth for what the widget actually writes (guarded there by
 * `storage.disclosure.test.ts`, which drives `WidgetStorage` against a real `localStorage` and fails
 * if any key drifts from that list).
 *
 * This array is therefore a **hand-maintained copy** of that list's key names, in the same order.
 * `DeviceStorageDisclosurePage.test.tsx` checks this copy against a second, independent copy kept in
 * the test file itself (transcribed from `ago-widget`'s list at the time this item shipped) - it
 * cannot reach across the repository boundary to check the code that writes the keys, only that this
 * page's own rows have not silently drifted from what this repository last recorded that code doing.
 * Closing that gap for real would need a published package or a generated artifact neither repository
 * has today - named here rather than quietly assumed solved, the same posture `personal-data.md`
 * takes wherever a fact could not be established.
 */
export const DEVICE_STORAGE_DISCLOSURE_ROWS: DeviceStorageDisclosureRow[] = [
  {
    key: "visitor-token",
    holdsKey: "deviceStorageVisitorTokenHolds",
    whyKey: "deviceStorageVisitorTokenWhy",
    lifetimeKey: "deviceStorageVisitorTokenLifetime",
  },
  {
    key: "visitor-id",
    holdsKey: "deviceStorageVisitorIdHolds",
    whyKey: "deviceStorageVisitorIdWhy",
    lifetimeKey: "deviceStorageVisitorIdLifetime",
  },
  {
    key: "widget-color",
    holdsKey: "deviceStorageWidgetColorHolds",
    whyKey: "deviceStorageWidgetColorWhy",
    lifetimeKey: "deviceStorageWidgetColorLifetime",
  },
  {
    key: "widget-position",
    holdsKey: "deviceStorageWidgetPositionHolds",
    whyKey: "deviceStorageWidgetPositionWhy",
    lifetimeKey: "deviceStorageWidgetPositionLifetime",
  },
  {
    key: "widget-locale",
    holdsKey: "deviceStorageWidgetLocaleHolds",
    whyKey: "deviceStorageWidgetLocaleWhy",
    lifetimeKey: "deviceStorageWidgetLocaleLifetime",
  },
  {
    key: "widget-notice-text",
    holdsKey: "deviceStorageWidgetNoticeTextHolds",
    whyKey: "deviceStorageWidgetNoticeTextWhy",
    lifetimeKey: "deviceStorageWidgetNoticeTextLifetime",
  },
  {
    key: "widget-notice-url",
    holdsKey: "deviceStorageWidgetNoticeUrlHolds",
    whyKey: "deviceStorageWidgetNoticeUrlWhy",
    lifetimeKey: "deviceStorageWidgetNoticeUrlLifetime",
  },
  {
    key: "enabled-modules",
    holdsKey: "deviceStorageEnabledModulesHolds",
    whyKey: "deviceStorageEnabledModulesWhy",
    lifetimeKey: "deviceStorageEnabledModulesLifetime",
  },
  {
    key: "conversation-id",
    holdsKey: "deviceStorageConversationIdHolds",
    whyKey: "deviceStorageConversationIdWhy",
    lifetimeKey: "deviceStorageConversationIdLifetime",
  },
  {
    key: "last-sequence:<conversationId>",
    holdsKey: "deviceStorageLastSequenceHolds",
    whyKey: "deviceStorageLastSequenceWhy",
    lifetimeKey: "deviceStorageLastSequenceLifetime",
  },
];
