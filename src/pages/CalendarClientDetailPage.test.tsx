import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarClientDetailPage } from "./CalendarClientDetailPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import { CalendarApiError, type Contact, type PersonBooking } from "../api/calendarApi.js";
import type { PersonConversation, PersonProfile } from "../api/personsApi.js";
import { formatRuPhoneForDisplay } from "../components/phoneFormat.js";

/**
 * `26-269`/`26-269-clients-redesign.md` §4: `/calendar/clients/:personId` - the client-detail hub the
 * redesigned Клиенты list's own rows open (`CalendarContactsPage.test.tsx`'s own sibling). Exercises
 * the header (phone/reveal/warning-glyph/confirm-phone), the Предстоящие/Прошедшие booking split
 * (`getPersonBookings`, `26-269`'s new calendar read), and the dialog navigation
 * (`getPersonConversations`, `26-269`'s new chat read) - both consumed here for the first time; the
 * list itself (`CalendarContactsPage.test.tsx`) never called either.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const calendarApi = vi.hoisted(() => ({
  getContacts: vi.fn(),
  getPersonBookings: vi.fn(),
  revealCustomerPhone: vi.fn(),
  confirmOperatorVerifiedPhone: vi.fn(),
  getWorkerSlots: vi.fn(),
  rescheduleBooking: vi.fn(),
  // `26-275`/`adr/0189`: the delete-client action and the per-row booking cancel it composes with.
  deleteClient: vi.fn(),
  cancelBooking: vi.fn(),
}));
const personsApi = vi.hoisted(() => ({ getPersons: vi.fn(), getPersonConversations: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});
vi.mock("../api/personsApi.js", () => personsApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PERSON_ID = "p1";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter initialEntries={[`/calendar/clients/${PERSON_ID}`]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/calendar/clients/:personId" element={<CalendarClientDetailPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

/** `26-275`: the delete flow's own success path leaves for `/calendar/clients` - this variant of
 * `page()` gives that route a real element (a marker, not the real list page) so a test can prove the
 * navigation happened rather than only that `deleteClient` was called. */
function pageWithClientsListRoute(): ReactNode {
  return (
    <MemoryRouter initialEntries={[`/calendar/clients/${PERSON_ID}`]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/calendar/clients/:personId" element={<CalendarClientDetailPage />} />
            <Route path="/calendar/clients" element={<p>the clients list</p>} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

/** `26-275`: the one non-dialog «Cancel» button on an upcoming booking's own row - filters out
 * `RescheduleBookingButton`'s own identically-labelled dismiss control inside its (closed but still
 * mounted) dialog, the same `.closest("dialog") === null` filter the reschedule test above already
 * establishes for the sibling "Reschedule" trigger. */
function rowCancelButton(container: ParentNode, rowMarker: string): HTMLButtonElement | null {
  const row = Array.from(container.querySelectorAll("tr")).find((tr) => (tr.textContent ?? "").includes(rowMarker)) ?? null;
  if (row === null) {
    return null;
  }
  return (
    Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent === "Cancel" && btn.closest("dialog") === null,
    ) ?? null
  );
}

function person(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
    personId: PERSON_ID,
    displayName: "Anna",
    channels: [],
    firstSeenAt: "2026-03-01T09:00:00+00:00",
    lastSeenAt: "2026-05-01T09:00:00+00:00",
    ...overrides,
  };
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    personId: PERSON_ID,
    phone: "+79990000001",
    masked: false,
    noShowCount: 0,
    phoneVerifiedAt: null,
    phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-03-01T09:00:00+00:00",
    lastSeenAt: "2026-05-01T09:00:00+00:00",
    ...overrides,
  };
}

function booking(overrides: Partial<PersonBooking> = {}): PersonBooking {
  return {
    bookingId: "b1",
    calendarId: "cal-1",
    workerId: "w1",
    workerDisplayName: "Alex Doe",
    serviceId: "s1",
    serviceName: "Haircut",
    personId: PERSON_ID,
    startsAt: "2026-06-10T09:00:00Z",
    endsAt: "2026-06-10T09:30:00Z",
    localDate: "2026-06-10",
    weekday: 3,
    phone: "+79990000001",
    masked: false,
    originConversationId: null,
    status: "Booked",
    ...overrides,
  };
}

function conversation(overrides: Partial<PersonConversation> = {}): PersonConversation {
  return {
    conversationId: "conv-1",
    state: "Assigned",
    isActive: true,
    startedAt: "2026-05-01T09:00:00Z",
    closedAt: null,
    lastActivityAt: "2026-05-01T09:05:00Z",
    ...overrides,
  };
}

// `26-269`: frozen "now" so the Предстоящие/Прошедшие split (`CalendarClientDetailPage`'s own
// `useState(() => new Date())`) is deterministic regardless of the machine's real clock.
const NOW = new Date("2026-06-05T00:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getContacts.mockResolvedValue([contact()]);
  calendarApi.getPersonBookings.mockResolvedValue([]);
  calendarApi.deleteClient.mockResolvedValue(undefined);
  calendarApi.cancelBooking.mockResolvedValue(undefined);
  personsApi.getPersons.mockResolvedValue([person()]);
  personsApi.getPersonConversations.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("the client-detail header", () => {
  it("shows the client's name and phone, read from the same contacts read the list uses", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Anna");
    expect(container.textContent).toContain(formatRuPhoneForDisplay("+79990000001"));
  });

  it("shows the not-found panel when the contacts list loaded but carries no row for this id", async () => {
    calendarApi.getContacts.mockResolvedValue([contact({ personId: "someone-else" })]);

    const container = await render(page());

    expect(container.textContent).toContain("Client not found");
  });

  it("shows the warning glyph and the confirm-phone action when neither verification fact is on file", async () => {
    const container = await render(page());

    expect(container.querySelector(".ago-phone-status-warning")).not.toBeNull();
    expect(byText(container, "button", "Confirm phone")).not.toBeNull();
  });

  it("shows no glyph and no confirm-phone action once the phone is verified", async () => {
    calendarApi.getContacts.mockResolvedValue([contact({ phoneVerifiedAt: "2026-05-01T09:00:00Z" })]);

    const container = await render(page());

    expect(container.querySelector(".ago-phone-status-warning")).toBeNull();
    expect(byText(container, "button", "Confirm phone")).toBeNull();
  });

  it("confirms the phone by operator and clears the warning glyph without a further reload", async () => {
    calendarApi.confirmOperatorVerifiedPhone.mockResolvedValue({ confirmedAt: "2026-06-05T00:00:00Z" });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Confirm phone")?.click());

    expect(calendarApi.confirmOperatorVerifiedPhone).toHaveBeenCalledWith("token", PERSON_ID);
    expect(container.querySelector(".ago-phone-status-warning")).toBeNull();
  });

  it("shows a no-show pill only when this client has at least one", async () => {
    calendarApi.getContacts.mockResolvedValue([contact({ noShowCount: 3 })]);

    const container = await render(page());

    expect(container.textContent).toContain("3 no-shows");
  });

  it("offers a Reveal control for a masked phone, and replaces it with the real value on Reveal", async () => {
    calendarApi.getContacts.mockResolvedValue([contact({ phone: "+7999•••0001", masked: true })]);
    calendarApi.revealCustomerPhone.mockResolvedValue({ phone: "+79990000001" });

    const container = await render(page());
    expect(container.textContent).toContain("+7999•••0001");

    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal")?.click());

    expect(calendarApi.revealCustomerPhone).toHaveBeenCalledWith("token", PERSON_ID, "ConsoleClientDetail");
    expect(container.textContent).toContain(formatRuPhoneForDisplay("+79990000001"));
  });
});

describe("the Предстоящие/Прошедшие booking split (26-269)", () => {
  it("shows the combined empty state when this client has no booking at all", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("No bookings yet.");
  });

  it("splits bookings against now, soonest-upcoming first and most-recent-past first", async () => {
    calendarApi.getPersonBookings.mockResolvedValue([
      booking({ bookingId: "future-far", serviceName: "Beard trim", startsAt: "2026-06-20T09:00:00Z", endsAt: "2026-06-20T09:20:00Z" }),
      booking({ bookingId: "future-near", serviceName: "Haircut", startsAt: "2026-06-06T09:00:00Z", endsAt: "2026-06-06T09:30:00Z" }),
      booking({ bookingId: "past-row", serviceName: "Shave", status: "NoShow", startsAt: "2026-05-01T09:00:00Z", endsAt: "2026-05-01T09:15:00Z" }),
    ]);

    const container = await render(page());

    expect(container.textContent).not.toContain("No bookings yet.");
    expect(container.textContent).not.toContain("No upcoming bookings.");
    expect(container.textContent).not.toContain("No past bookings.");

    const rows = Array.from(container.querySelectorAll("tbody tr")).map((tr) => tr.textContent ?? "");
    // Soonest-first within Предстоящие: "Haircut" (Jun 6) before "Beard trim" (Jun 20).
    expect(rows.findIndex((text) => text.includes("Haircut"))).toBeLessThan(rows.findIndex((text) => text.includes("Beard trim")));
    // The NoShow row carries its own status badge - the quiet Booked default carries none.
    expect(rows.find((text) => text.includes("Shave"))).toContain("NoShow");
    expect(rows.find((text) => text.includes("Haircut"))).not.toContain("NoShow");
  });

  it("offers Reschedule only on a Booked row, never on a NoShow row", async () => {
    // `RescheduleBookingButton` hides itself entirely without `booking:reschedule` - grant it here,
    // the identical permission `CalendarBookingsPage.test.tsx` grants for its own reschedule tests.
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "booking:reschedule"], siteId: SITE_ID });
    calendarApi.getPersonBookings.mockResolvedValue([
      booking({ bookingId: "booked-row", serviceName: "Haircut", status: "Booked" }),
      booking({ bookingId: "noshow-row", serviceName: "Shave", status: "NoShow", startsAt: "2026-05-01T09:00:00Z", endsAt: "2026-05-01T09:15:00Z" }),
    ]);

    const container = await render(page());

    // `RescheduleBookingButton` reuses the identical "Reschedule" text for both its own row trigger
    // and its dialog's submit control (that component's own doc comment) - the dialog is a native
    // `<dialog>` always present in the DOM (closed, not unmounted), so only a trigger button outside
    // one counts as "this row offers Reschedule".
    const rescheduleButtons = Array.from(container.querySelectorAll("button"))
      .filter((btn) => btn.textContent === "Reschedule" && btn.closest("dialog") === null);
    expect(rescheduleButtons).toHaveLength(1);
  });
});

describe("dialog navigation (26-269)", () => {
  it("links to the person's own active-or-latest conversation when one exists", async () => {
    personsApi.getPersonConversations.mockResolvedValue([conversation({ conversationId: "conv-active" })]);

    const container = await render(page());

    const link = byText<HTMLAnchorElement>(container, "a", "Open dialog");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/conversations/conv-active");
  });

  it("hides the dialog link entirely when this person has no conversation yet", async () => {
    personsApi.getPersonConversations.mockResolvedValue([]);

    const container = await render(page());

    expect(byText(container, "a", "Open dialog")).toBeNull();
  });

  it("degrades to hiding the dialog link, rather than failing the page, when chat is unreachable", async () => {
    personsApi.getPersonConversations.mockRejectedValue(new Error("chat down"));

    const container = await render(page());

    // The rest of the hub still renders - the phone is here - the dialog link is simply absent.
    expect(container.textContent).toContain(formatRuPhoneForDisplay("+79990000001"));
    expect(byText(container, "a", "Open dialog")).toBeNull();
  });
});

describe("the contact channels meta section (26-269)", () => {
  it("lists chat's own recorded channels for this person", async () => {
    personsApi.getPersons.mockResolvedValue([
      person({ channels: [{ id: "ch1", kind: "Phone", value: "+79990000001", masked: false, verified: true, assessment: "Confirmed", recordedAt: "2026-05-01T09:00:00Z" }] }),
    ]);

    const container = await render(page());

    // `26-326`: a linked `Phone` channel's own value is now formatted the same as every other phone
    // display site.
    expect(one(container, "ul").textContent).toContain(formatRuPhoneForDisplay("+79990000001"));
  });

  it("shows an honest empty state when chat holds no channel for this person", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("No contact channels recorded yet.");
  });
});

describe("permission gate", () => {
  it("refuses an operator without calendar:configure or customer:read", async () => {
    // `enabledModules: ["calendar"]` - this tenant does have the calendar, this operator just lacks
    // the permission (the "forbidden" branch, not the "absent" one - `CalendarQueuePage.test.tsx`'s
    // own identical fixture for the same distinction, `CalendarAccessRefusal`'s own doc comment).
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID, enabledModules: ["calendar"] });

    const container = await render(page());

    expect(container.textContent).toMatch(/not have permission/i);
    expect(calendarApi.getContacts).not.toHaveBeenCalled();
  });
});

/**
 * `26-275`/`adr/0189`: the delete-client action - hidden without `customer:erase`, then the two-dialog
 * flow (`CalendarClientDetailPage.tsx`'s own doc comment): a past-only confirm naming the blast radius,
 * or a future-present block with a jump to Предстоящие, chosen client-side from the bookings this page
 * already loaded, and re-decided the same way when the server itself refuses.
 */
describe("the delete-client action (26-275)", () => {
  it("hides the delete button entirely without customer:erase - hide, not disable", async () => {
    const container = await render(page());

    expect(byText(container, "button", "Delete client")).toBeNull();
  });

  it("shows the delete button once customer:erase is held", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:erase"], siteId: SITE_ID });

    const container = await render(page());

    expect(byText(container, "button", "Delete client")).not.toBeNull();
  });

  it("confirms and deletes a past-only client, then returns to the clients list", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:erase"], siteId: SITE_ID });
    calendarApi.getPersonBookings.mockResolvedValue([
      booking({ bookingId: "past-row", status: "NoShow", startsAt: "2026-05-01T09:00:00Z", endsAt: "2026-05-01T09:15:00Z" }),
    ]);

    const container = await render(pageWithClientsListRoute());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete client")?.click());

    // Past-only client: the confirm dialog, not the blocked one - and it names the full blast radius
    // (`adr/0189` §2.3 Option A), never left silent.
    const confirmDialog = one<HTMLDialogElement>(container, "dialog[open]");
    expect(confirmDialog.open).toBe(true);
    expect(confirmDialog.textContent).toContain("chat history");
    expect(calendarApi.deleteClient).not.toHaveBeenCalled();

    await interact(() => byText<HTMLButtonElement>(confirmDialog, "button", "Delete")?.click());

    expect(calendarApi.deleteClient).toHaveBeenCalledWith("token", PERSON_ID);
    expect(container.textContent).toContain("the clients list");
  });

  it("blocks the delete client-side, without ever calling the server, when a future booking is already loaded", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:erase"], siteId: SITE_ID });
    calendarApi.getPersonBookings.mockResolvedValue([booking({ startsAt: "2026-06-10T09:00:00Z" })]);

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete client")?.click());

    expect(calendarApi.deleteClient).not.toHaveBeenCalled();
    const blockedDialog = one<HTMLDialogElement>(container, "dialog[open]");
    expect(blockedDialog.textContent).toContain("upcoming bookings");
    expect(byText(blockedDialog, "button", "Go to bookings")).not.toBeNull();
  });

  it("swaps the confirm dialog for the blocked one when the server refuses with 409 person_erase.future_bookings", async () => {
    // The client-side read is stale (empty/past-only) - the server is the real authority (rule 8) and
    // catches a booking made in the moment between this page's load and the click.
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:erase"], siteId: SITE_ID });
    calendarApi.getPersonBookings.mockResolvedValue([]);
    calendarApi.deleteClient.mockRejectedValue(
      new CalendarApiError("person_erase.future_bookings", "Person has one or more upcoming bookings.", 409),
    );

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete client")?.click());
    const confirmDialog = one<HTMLDialogElement>(container, "dialog[open]");
    await interact(() => byText<HTMLButtonElement>(confirmDialog, "button", "Delete")?.click());

    expect(calendarApi.deleteClient).toHaveBeenCalledWith("token", PERSON_ID);
    expect(confirmDialog.open).toBe(false);
    const blockedDialog = one<HTMLDialogElement>(container, "dialog[open]");
    expect(blockedDialog.textContent).toContain("upcoming bookings");
  });

  it("treats a 404 person_erase.not_found the same as a completed delete - the person is gone either way", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:erase"], siteId: SITE_ID });
    calendarApi.deleteClient.mockRejectedValue(new CalendarApiError("person_erase.not_found", "Person does not exist.", 404));

    const container = await render(pageWithClientsListRoute());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete client")?.click());
    const confirmDialog = one<HTMLDialogElement>(container, "dialog[open]");
    await interact(() => byText<HTMLButtonElement>(confirmDialog, "button", "Delete")?.click());

    expect(container.textContent).toContain("the clients list");
  });

  it("shows a plain error and keeps the confirm dialog open on any other refusal", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:erase"], siteId: SITE_ID });
    calendarApi.deleteClient.mockRejectedValue(new CalendarApiError("person_erase.forbidden", "Not allowed.", 403));

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete client")?.click());
    const confirmDialog = one<HTMLDialogElement>(container, "dialog[open]");
    await interact(() => byText<HTMLButtonElement>(confirmDialog, "button", "Delete")?.click());

    expect(confirmDialog.open).toBe(true);
    expect(confirmDialog.textContent).toMatch(/not have permission/i);
  });
});

/**
 * `26-275`/`adr/0189` §5: the per-row «Отменить» on an upcoming booking - the navigate-to-cancel
 * affordance the blocked-delete dialog points at, composing the existing `cancelBooking` write.
 */
describe("cancelling an upcoming booking, gated booking:cancel (26-275)", () => {
  it("offers Cancel on an upcoming held row once booking:cancel is granted, and reloads on success", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "booking:cancel"], siteId: SITE_ID });
    calendarApi.getPersonBookings.mockResolvedValue([
      booking({ bookingId: "future-row", serviceName: "Haircut", status: "Booked", startsAt: "2026-06-10T09:00:00Z", endsAt: "2026-06-10T09:30:00Z" }),
    ]);

    const container = await render(page());
    const cancel = rowCancelButton(container, "Haircut");
    expect(cancel).not.toBeNull();

    await interact(() => cancel?.click());

    expect(calendarApi.cancelBooking).toHaveBeenCalledWith("token", "future-row");
    // `handleCancelBooking`'s own re-read, the identical "reload rather than patch by hand" shape
    // `RescheduleBookingButton.onRescheduled` already uses on this page - one initial load, one reload.
    expect(calendarApi.getPersonBookings).toHaveBeenCalledTimes(2);
  });

  it("hides Cancel on the identical row without booking:cancel", async () => {
    calendarApi.getPersonBookings.mockResolvedValue([
      booking({ bookingId: "future-row", serviceName: "Haircut", status: "Booked", startsAt: "2026-06-10T09:00:00Z", endsAt: "2026-06-10T09:30:00Z" }),
    ]);

    const container = await render(page());

    expect(rowCancelButton(container, "Haircut")).toBeNull();
  });

  it("never offers Cancel on a past NoShow row, even with booking:cancel", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "booking:cancel"], siteId: SITE_ID });
    calendarApi.getPersonBookings.mockResolvedValue([
      booking({ bookingId: "past-row", serviceName: "Shave", status: "NoShow", startsAt: "2026-05-01T09:00:00Z", endsAt: "2026-05-01T09:15:00Z" }),
    ]);

    const container = await render(page());

    expect(rowCancelButton(container, "Shave")).toBeNull();
  });
});
