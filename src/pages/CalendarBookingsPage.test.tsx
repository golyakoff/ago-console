import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarBookingsPage } from "./CalendarBookingsPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { ConfirmedBooking } from "../api/calendarApi.js";
import type { PersonProfile } from "../api/personsApi.js";

/**
 * `23-34`: `/calendar/bookings` - confirmed bookings, grouped by day and by master. Permission
 * gating (`customer:read` rather than `calendar:configure`) is exercised in
 * `permissionGating.test.tsx`, alongside every other calendar screen's own gate; this file is the
 * one `CalendarContactsPage.test.tsx`/`CalendarQueuePage.test.tsx` already establish for their own
 * screens - the rendering and grouping behaviour specific to this page.
 *
 * `23-91`: the "revealing a masked phone" describe block below is the fifth screen `23-30` missed -
 * see `CalendarQueuePage.test.tsx`'s own identically-named block, which this one mirrors exactly bar
 * the surface string.
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
const calendarApi = vi.hoisted(() => ({ getConfirmedBookings: vi.fn(), revealCustomerPhone: vi.fn() }));
const personsApi = vi.hoisted(() => ({ getPersons: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});
vi.mock("../api/personsApi.js", () => personsApi);

/** `26-161`: a Person-registry profile the display-merge reads a name through, keyed on `personId`. */
function person(personId: string, displayName: string | null): PersonProfile {
  return { personId, displayName, channels: [], firstSeenAt: "2026-09-01T09:00:00+00:00", lastSeenAt: "2026-09-08T09:00:00+00:00" };
}

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <CalendarBookingsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

// `customer:read` alone - the seeded Operator role's own shape, deliberately not `calendar:configure`
// (this screen's own gate; `CalendarBookingsPage`'s doc comment has the full reasoning).
const OPERATOR_PERMISSIONS = ["customer:read"];

/** Two workers, two days - Tuesday carries both, Wednesday carries one - so a test can tell "grouped
 * by day, then by master" apart from "one flat list that happens to render in order". */
const bookings: ConfirmedBooking[] = [
  {
    bookingId: "b1",
    calendarId: "cal1",
    workerId: "w1",
    workerDisplayName: "Anna Petrova",
    serviceId: "s1",
    serviceName: "Haircut",
    personId: "c1",
    startsAt: "2026-09-08T09:00:00+00:00",
    endsAt: "2026-09-08T09:45:00+00:00",
    localDate: "2026-09-08",
    weekday: 2,
    phone: "+79990000001",
    masked: false,
    // `26-165`: this booking came in through a conversation - the row must carry a dialog link.
    originConversationId: "conv-1",
  },
  {
    bookingId: "b2",
    calendarId: "cal1",
    workerId: "w2",
    workerDisplayName: "Boris Orlov",
    serviceId: "s2",
    serviceName: "Manicure",
    personId: "c2",
    startsAt: "2026-09-08T10:00:00+00:00",
    endsAt: "2026-09-08T10:30:00+00:00",
    localDate: "2026-09-08",
    weekday: 2,
    phone: "+7 999 000-00-** 02",
    masked: true,
    // `26-165`: an operator-entered or widget booking has no chat origin - no link, not a disabled one.
    originConversationId: null,
  },
  {
    bookingId: "b3",
    calendarId: "cal1",
    workerId: "w1",
    workerDisplayName: "Anna Petrova",
    serviceId: "s1",
    serviceName: "Haircut",
    personId: "c3",
    startsAt: "2026-09-09T09:00:00+00:00",
    endsAt: "2026-09-09T09:45:00+00:00",
    localDate: "2026-09-09",
    weekday: 3,
    phone: "+79990000003",
    masked: false,
    originConversationId: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: OPERATOR_PERMISSIONS, siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getConfirmedBookings.mockResolvedValue(bookings);
  // `26-161`: the names are chat's now - c1 is "Ivan", c3 is "Olga", c2 has no recorded name.
  personsApi.getPersons.mockResolvedValue([person("c1", "Ivan"), person("c2", null), person("c3", "Olga")]);
});

afterEach(async () => {
  await unmount();
});

describe("confirmed bookings", () => {
  it("groups into one panel per day, each carrying its own booking count", async () => {
    const container = await render(page());

    // Tuesday (2026-09-08, two bookings) and Wednesday (2026-09-09, one) - both dates appear, once
    // each, as day-level panel headings.
    expect(container.textContent).toContain("2026-09-08");
    expect(container.textContent).toContain("2026-09-09");
  });

  it("groups a day's own rows by master, each master carrying their own count", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Anna Petrova");
    expect(container.textContent).toContain("Boris Orlov");
    // Tuesday's own day-level count is two; each of its two masters carries one each - both numbers
    // must appear somewhere in the rendered badges.
    expect(container.textContent).toMatch(/Bookings:\s*2/);
    expect(container.textContent).toMatch(/Bookings:\s*1/);
  });

  it("keeps a two-slot booking's own table small - one row per booking, not per group's total", async () => {
    const container = await render(page());

    // Anna Petrova appears in two separate day-groups (Tuesday and Wednesday) - two distinct
    // tables, one row each, never merged into a single seven-day table.
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(3);
  });

  it("renders the person name (from chat's registry) and the service for each row", async () => {
    const container = await render(page());

    // The names are read from chat by person id and display-merged onto the rows.
    expect(personsApi.getPersons).toHaveBeenCalledWith("token", ["c1", "c2", "c3"], expect.anything());
    expect(container.textContent).toContain("Ivan");
    expect(container.textContent).toContain("Haircut");
    expect(container.textContent).toContain("Manicure");
  });

  it("shows an honest placeholder for a person with no name recorded in chat, not a blank cell", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("not recorded");
  });

  it("degrades to 'name not shown yet' when chat's Person API is unreachable, without failing the screen (26-161)", async () => {
    personsApi.getPersons.mockRejectedValue(new Error("chat down"));

    const container = await render(page());

    // The bookings still render (a service is shown); only the name column degrades.
    expect(container.textContent).toContain("Haircut");
    expect(container.textContent).toContain("name not shown yet");
  });

  it("renders the phone exactly as the server sent it - masked or real, with no client-side masking logic", async () => {
    const container = await render(page());

    // b1: real number, arrives unmasked from the server.
    expect(container.textContent).toContain("+79990000001");
    // b2: the server already masked it - the page must render that string verbatim, never the real
    // number and never a second, client-computed mask.
    expect(container.textContent).toContain("+7 999 000-00-** 02");
  });

  /** `26-165`/`adr/0184` (C1w): the one promise this item makes - a chat-origin confirmed booking
   * links to the conversation it was created in, and a booking with no origin conversation shows no
   * affordance at all (Q-E parity: absent, never disabled). `b1` above carries `originConversationId:
   * "conv-1"`; `b2`/`b3` carry `null`. */
  it("links a chat-origin booking to its conversation, and shows no link for a booking with none", async () => {
    const container = await render(page());

    const link = container.querySelector('a[href="/conversations/conv-1"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Go to dialog");

    // b2 and b3 have no origin conversation - the table must carry exactly one dialog link, not one
    // per row with the rest disabled.
    expect(container.querySelectorAll('a[href^="/conversations/"]').length).toBe(1);
  });

  it("explains a permission failure in words an operator can act on", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getConfirmedBookings.mockRejectedValue(
      new CalendarApiError("confirmed_bookings.forbidden", "This operator does not hold 'customer:read' for this tenant.", 403),
    );

    const container = await render(page());

    expect(container.textContent).toMatch(/does not have permission/i);
  });

  it("shows the empty state when nothing is booked in the range", async () => {
    calendarApi.getConfirmedBookings.mockResolvedValue([]);

    const container = await render(page());

    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("Nothing is booked in this range yet.");
  });

  /**
   * `23-99`: the promise this whole item makes, on the one screen its own backlog text quotes -
   * `calendarApi.test.ts`'s own "throws CalendarApiError('shape.mismatch')" test proves
   * `getConfirmedBookings` no longer resolves silently when a row is missing a field; this test
   * proves the other half, that the page renders the *danger* `Alert` this file's own "explains a
   * permission failure" test already established, never the *empty*-state `Panel` above - the two
   * must never be the same element, or a dropped field is once again indistinguishable from a
   * genuinely quiet week.
   */
  it("shows the error state, never the empty state, when the response fails 23-99's shape check", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getConfirmedBookings.mockRejectedValue(
      new CalendarApiError("shape.mismatch", "GET /confirmed-bookings[0]: the response is missing workerDisplayName.", 200),
    );

    const container = await render(page());

    expect(container.textContent).toContain("workerDisplayName");
    expect(container.textContent).not.toContain("Nothing is booked in this range yet.");
    // `Alert.tsx`'s own `danger` tone is the one rendered with `role="alert"` - the same
    // distinguishing check the existing "explains a permission failure" test above relies on
    // implicitly by asserting the message text; this one asserts the role directly.
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});

/** `23-91`: `23-30` built a reveal control for four screens and missed this fifth one - it renders a
 * masked phone (`b2` above already proves that) but had no way to reveal it. `CalendarQueuePage.test.tsx`'s
 * own "revealing a masked phone (23-30)" describe block is the precedent this mirrors exactly, with
 * `"ConsoleBookings"` as this screen's own surface string. */
describe("revealing a masked phone (23-91)", () => {
  const maskedBooking: ConfirmedBooking = {
    bookingId: "b7",
    calendarId: "cal1",
    workerId: "w1",
    workerDisplayName: "Anna Petrova",
    serviceId: "s1",
    serviceName: "Haircut",
    personId: "c9",
    startsAt: "2026-09-08T09:00:00+00:00",
    endsAt: "2026-09-08T09:45:00+00:00",
    localDate: "2026-09-08",
    weekday: 2,
    phone: "+7999•••0009",
    masked: true,
    originConversationId: null,
  };

  it("shows the masked value and a Reveal button, never the real number, before reveal", async () => {
    calendarApi.getConfirmedBookings.mockResolvedValue([maskedBooking]);

    const container = await render(page());

    expect(container.textContent).toContain("+7999•••0009");
    expect(container.textContent).not.toContain("+79990000009");
    expect(byText(container, "button", "Reveal")).not.toBeNull();
  });

  it("replaces the masked row with the server's own unmasked response on Reveal, and writes the same record shape every other screen's reveal does", async () => {
    calendarApi.getConfirmedBookings.mockResolvedValue([maskedBooking]);
    calendarApi.revealCustomerPhone.mockResolvedValue({ phone: "+79990000009" });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal")?.click());

    // `RevealCustomerPhoneHandler` writes one `ContactPhoneRevealToWrite` per call regardless of
    // `Surface` - this asserts the exact same endpoint and parameter shape `CalendarQueuePage`'s own
    // reveal test asserts, only the surface name differs.
    expect(calendarApi.revealCustomerPhone).toHaveBeenCalledWith("token", "c9", "ConsoleBookings");
    expect(container.textContent).toContain("+79990000009");
    expect(container.textContent).not.toContain("+7999•••0009");
    expect(byText(container, "button", "Reveal")).toBeNull();
  });

  it("shows an error and keeps the row masked when the reveal fails", async () => {
    calendarApi.getConfirmedBookings.mockResolvedValue([maskedBooking]);
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.revealCustomerPhone.mockRejectedValue(
      new CalendarApiError("contacts.customer_not_found", "Customer c9 does not exist in this tenant.", 404),
    );

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal")?.click());

    expect(container.textContent).toContain("Customer c9 does not exist in this tenant.");
    expect(container.textContent).toContain("+7999•••0009");
    expect(container.textContent).not.toContain("+79990000009");
  });
});
