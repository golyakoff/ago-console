import { describe, expect, it, vi } from "vitest";
import { CalendarApiError } from "../api/calendarApi.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";

// `calendarErrorMessage` pulls in `CalendarApiError` from `calendarApi.js`, which imports the real
// `config.ts` - and that throws at load time without the Vite env vars. Every `fetch`-level test in
// this console stubs `config.js` for the same reason; this one needs only that the module loads.
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
  },
}));

/**
 * `23-41`: the surfacing half of "validate at every API boundary". A reader rejects a mis-shaped
 * response with `CalendarApiError('shape.mismatch', <endpoint+field diagnostic>)`; this mapper is
 * what a calendar screen's `catch` renders, and the item's requirement is that a viewer sees a
 * localized "couldn't load this", carrying enough detail to identify the endpoint/field - never the
 * raw English `ShapeMismatchError` sentence, and never a blank screen.
 */
describe("calendarErrorMessage - shape.mismatch (23-41)", () => {
  const diagnostic = "GET /api/v1/me/tenancies (calendar): tenantId, tenantName";

  it("returns the localized frame in English, with the endpoint+field diagnostic appended", () => {
    const message = calendarErrorMessage(new CalendarApiError("shape.mismatch", diagnostic, 200), en);

    expect(message).toContain(en.calendarShapeMismatchError);
    expect(message).toContain(diagnostic);
  });

  it("returns the localized frame in Russian for the identical error", () => {
    const message = calendarErrorMessage(new CalendarApiError("shape.mismatch", diagnostic, 200), ru);

    expect(message).toContain(ru.calendarShapeMismatchError);
    expect(message).toContain(diagnostic);
    // The two locales must not resolve to the same sentence - proves the string is actually localized.
    expect(ru.calendarShapeMismatchError).not.toBe(en.calendarShapeMismatchError);
  });

  it("keeps the diagnostic's field names, so a report can say which endpoint and field disagreed", () => {
    const message = calendarErrorMessage(new CalendarApiError("shape.mismatch", diagnostic, 200), en);

    expect(message).toContain("tenantId");
    expect(message).toContain("tenantName");
  });
});

/** `26-268`§2a/`adr/0188`: `GetPersonCandidatesByPhoneHandler`'s own `customer:read` refusal - the
 * manual-entry dialog's phone-recognition step, given the identical localized sentence
 * `contacts.forbidden`/`confirmed_bookings.forbidden` already get above it in this file. */
describe("calendarErrorMessage - person_recognition.forbidden (26-268)", () => {
  it("explains the permission failure rather than the server's raw English detail", () => {
    const message = calendarErrorMessage(
      new CalendarApiError("person_recognition.forbidden", "This operator does not hold 'customer:read' for this tenant.", 403),
      en,
    );

    expect(message).toBe(en.calendarPermissionDeniedError);
  });
});

/** `26-275`/`adr/0189`: the delete-client route's own three outcomes. `CalendarClientDetailPage`
 * branches on `person_erase.future_bookings`/`person_erase.not_found` itself before ever reaching this
 * mapper (its own two-dialog flow); these mappings are the defensive fallback for any caller that has
 * not made that branch, and `person_erase.forbidden` reaches the ordinary permission sentence. */
describe("calendarErrorMessage - person_erase.* (26-275/adr-0189)", () => {
  it("explains the permission failure the same way every other forbidden code does", () => {
    const message = calendarErrorMessage(
      new CalendarApiError("person_erase.forbidden", "This operator does not hold 'customer:erase' for this tenant.", 403),
      en,
    );

    expect(message).toBe(en.calendarPermissionDeniedError);
  });

  it("gives the future-bookings guard its own localized sentence, in both languages", () => {
    const englishMessage = calendarErrorMessage(
      new CalendarApiError("person_erase.future_bookings", "Person has one or more upcoming bookings.", 409),
      en,
    );
    const russianMessage = calendarErrorMessage(
      new CalendarApiError("person_erase.future_bookings", "Person has one or more upcoming bookings.", 409),
      ru,
    );

    expect(englishMessage).toBe(en.calendarDeleteClientFutureBookingsError);
    expect(russianMessage).toBe(ru.calendarDeleteClientFutureBookingsError);
    expect(ru.calendarDeleteClientFutureBookingsError).not.toBe(en.calendarDeleteClientFutureBookingsError);
  });

  it("gives an already-erased person its own localized sentence, in both languages", () => {
    const englishMessage = calendarErrorMessage(new CalendarApiError("person_erase.not_found", "Person does not exist.", 404), en);
    const russianMessage = calendarErrorMessage(new CalendarApiError("person_erase.not_found", "Person does not exist.", 404), ru);

    expect(englishMessage).toBe(en.calendarDeleteClientNotFoundError);
    expect(russianMessage).toBe(ru.calendarDeleteClientNotFoundError);
    expect(ru.calendarDeleteClientNotFoundError).not.toBe(en.calendarDeleteClientNotFoundError);
  });
});
