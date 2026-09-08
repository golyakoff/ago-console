import { describe, expect, it } from "vitest";
import { DEVICE_STORAGE_DISCLOSURE_ROWS } from "./deviceStorageDisclosure.js";

/**
 * `24-15`: this repository's own half of "a test asserts the documented key set matches what the
 * widget actually writes." `deviceStorageDisclosure.ts`'s own doc comment explains why this array
 * cannot be a live import of `ago-widget/src/storage.ts`'s `WIDGET_STORAGE_DISCLOSURE` - the two
 * repositories build and deploy independently, and console does not consume widget as a package.
 *
 * `WIDGET_STORAGE_KEYS_AS_OF_THIS_ITEM` below is a hand transcription of that widget-side list's key
 * names, taken when `24-15` shipped and updated by `23-105` for the `enabled-modules` row that item
 * added. `ago-widget`'s own `storage.disclosure.test.ts` is what actually
 * proves *that* list matches the widget's runtime writes, by driving `WidgetStorage` against a real
 * `localStorage` - this test proves the other half available on this side of the boundary: that this
 * console's own copy of the list has not silently drifted from the transcription. A key added to (or
 * removed from, or renamed in) `DEVICE_STORAGE_DISCLOSURE_ROWS` without updating this array, or the
 * reverse, fails here rather than in review.
 *
 * This is not a substitute for a real cross-repository check - it cannot see `ago-widget`'s source at
 * all - and that gap is named rather than assumed closed (`deviceStorageDisclosure.ts`'s own comment
 * says so too). Closing it for real would need a published package or a generated artifact shared
 * between the two repositories, which neither has today.
 */
const WIDGET_STORAGE_KEYS_AS_OF_THIS_ITEM = [
  "visitor-token",
  "visitor-id",
  "widget-color",
  "widget-position",
  "widget-locale",
  "widget-notice-text",
  "widget-notice-url",
  "enabled-modules",
  "conversation-id",
  "last-sequence:<conversationId>",
];

describe("DEVICE_STORAGE_DISCLOSURE_ROWS", () => {
  it("matches the transcribed copy of ago-widget's own documented key list, in order", () => {
    expect(DEVICE_STORAGE_DISCLOSURE_ROWS.map((row) => row.key)).toEqual(WIDGET_STORAGE_KEYS_AS_OF_THIS_ITEM);
  });

  it("has no duplicate keys", () => {
    const keys = DEVICE_STORAGE_DISCLOSURE_ROWS.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
