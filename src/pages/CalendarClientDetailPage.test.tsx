import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarClientDetailPage } from "./CalendarClientDetailPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { Contact, PersonBooking } from "../api/calendarApi.js";
import type { PersonConversation, PersonProfile } from "../api/personsApi.js";

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
    expect(container.textContent).toContain("+79990000001");
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
    expect(container.textContent).toContain("+79990000001");
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
    expect(container.textContent).toContain("+79990000001");
    expect(byText(container, "a", "Open dialog")).toBeNull();
  });
});

describe("the contact channels meta section (26-269)", () => {
  it("lists chat's own recorded channels for this person", async () => {
    personsApi.getPersons.mockResolvedValue([
      person({ channels: [{ id: "ch1", kind: "Phone", value: "+79990000001", masked: false, verified: true, assessment: "Confirmed", recordedAt: "2026-05-01T09:00:00Z" }] }),
    ]);

    const container = await render(page());

    expect(one(container, "ul").textContent).toContain("+79990000001");
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
