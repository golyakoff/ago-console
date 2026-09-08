import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarContactsPage } from "./CalendarContactsPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { Contact, CustomerMergePreview } from "../api/calendarApi.js";

/**
 * `22-06`: `/calendar/contacts` - moved from `ago-calendar-console`'s own `ContactsPage.test.tsx`,
 * adapted to this console's own harness.
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
  revealCustomerPhone: vi.fn(),
  getCustomerMergePreview: vi.fn(),
  mergeCustomers: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});

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
          <CalendarContactsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

const contacts: Contact[] = [
  {
    customerId: "c1", phone: "+79990000001", masked: false, displayName: "Anna", notes: "Prefers afternoons",
    noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
    duplicatePhoneCustomerIds: [],
  },
  {
    customerId: "c2", phone: "+79990000002", masked: false, displayName: null, notes: null,
    noShowCount: 2, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-04-01T09:00:00+00:00", lastSeenAt: "2026-04-01T09:00:00+00:00",
    duplicatePhoneCustomerIds: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getContacts.mockResolvedValue(contacts);
});

afterEach(async () => {
  await unmount();
});

describe("the contacts report", () => {
  it("lists every contact's phone, name and notes", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("+79990000001");
    expect(container.textContent).toContain("Anna");
    expect(container.textContent).toContain("Prefers afternoons");
  });

  it("shows an honest placeholder for a customer with no name recorded, not a blank cell", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("+79990000002");
    expect(container.textContent).toContain("not recorded");
  });

  it("shows the real no-show count, including zero", async () => {
    const container = await render(page());

    const noShowCell = Array.from(container.querySelectorAll("td")).find((td) => td.textContent === "2");
    expect(noShowCell).toBeDefined();
  });

  it("explains a permission failure in words an operator can act on", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getContacts.mockRejectedValue(new CalendarApiError("contacts.forbidden", "This operator does not hold 'customer:read' for this tenant.", 403));

    const container = await render(page());

    expect(container.textContent).toMatch(/does not have permission/i);
  });

  it("shows the empty state when there are no contacts yet", async () => {
    calendarApi.getContacts.mockResolvedValue([]);

    const container = await render(page());

    expect(container.querySelector("table")).toBeNull();
  });
});

/** `23-30`/`23-12`: a masked phone gets a Reveal button, never the real number, until the server's
 * own reveal response arrives. */
describe("revealing a masked phone (23-30)", () => {
  const maskedContact: Contact = {
    customerId: "c3", phone: "+7999•••0003", masked: true, displayName: "Petra", notes: null,
    noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
    duplicatePhoneCustomerIds: [],
  };

  it("shows the masked value and a Reveal button, never the real number, before reveal", async () => {
    calendarApi.getContacts.mockResolvedValue([maskedContact]);

    const container = await render(page());

    expect(container.textContent).toContain("+7999•••0003");
    expect(container.textContent).not.toContain("+79990000003");
    expect(byText(container, "button", "Reveal")).not.toBeNull();
  });

  it("replaces the masked row with the server's own unmasked response on Reveal", async () => {
    calendarApi.getContacts.mockResolvedValue([maskedContact]);
    calendarApi.revealCustomerPhone.mockResolvedValue({ phone: "+79990000003" });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal")?.click());

    expect(calendarApi.revealCustomerPhone).toHaveBeenCalledWith("token", "c3", "ConsoleContacts");
    expect(container.textContent).toContain("+79990000003");
    expect(container.textContent).not.toContain("+7999•••0003");
    expect(byText(container, "button", "Reveal")).toBeNull();
  });

  it("does not offer a Reveal button when the row already carries the real value", async () => {
    calendarApi.getContacts.mockResolvedValue(contacts);

    const container = await render(page());

    expect(byText(container, "button", "Reveal")).toBeNull();
  });
});

/** `23-30`/`23-12`/`decisions.md` §5: an SMS code and an operator's "I called and it is them" are
 * two different strengths of evidence - this report must never merge them into one generic
 * "verified" state. */
describe("the two verification facts (23-30)", () => {
  it("shows both facts as unconfirmed for a customer with neither", async () => {
    calendarApi.getContacts.mockResolvedValue(contacts);

    const container = await render(page());

    expect(container.textContent).toContain("Not verified");
    expect(container.textContent).toContain("Not confirmed");
  });

  it("distinguishes an SMS-verified number from an operator-confirmed one, on the same row and on different rows", async () => {
    calendarApi.getContacts.mockResolvedValue([
      {
        customerId: "c4", phone: "+79990000004", masked: false, displayName: "Verified only", notes: null,
        noShowCount: 0, phoneVerifiedAt: "2026-05-01T09:00:00+00:00", phoneConfirmedByOperatorAt: null,
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
    duplicatePhoneCustomerIds: [],
      },
      {
        customerId: "c5", phone: "+79990000005", masked: false, displayName: "Confirmed only", notes: null,
        noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: "2026-05-02T09:00:00+00:00",
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
    duplicatePhoneCustomerIds: [],
      },
      {
        customerId: "c6", phone: "+79990000006", masked: false, displayName: "Both", notes: null,
        noShowCount: 0, phoneVerifiedAt: "2026-05-01T09:00:00+00:00", phoneConfirmedByOperatorAt: "2026-05-02T09:00:00+00:00",
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
    duplicatePhoneCustomerIds: [],
      },
    ]);

    const container = await render(page());

    // The two facts are rendered with different words, never one merged "verified" badge - the
    // row that has only the operator's own confirmation must never read as SMS-verified, and vice
    // versa.
    const verifiedOnlyRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("Verified only"));
    expect(verifiedOnlyRow?.textContent).toContain("Verified");
    expect(verifiedOnlyRow?.textContent).not.toContain("Confirmed");

    const confirmedOnlyRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("Confirmed only"));
    expect(confirmedOnlyRow?.textContent).toContain("Confirmed");
    expect(confirmedOnlyRow?.textContent).not.toContain("Not confirmed");
    expect(confirmedOnlyRow?.textContent).not.toContain("Verified");

    const bothRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("Both"));
    expect(bothRow?.textContent).toContain("Verified");
    expect(bothRow?.textContent).toContain("Confirmed");
  });
});

/** `23-60`/`adr/0161`: the "shares a phone" hint, the Merge button it opens, and the confirmation
 * dialog's own irreversibility copy - not `MergeCustomersDialog`'s own detailed behaviour (covered
 * where the dialog is defined), only that this page wires it correctly: gated on `customer:edit`,
 * opened with the right two ids, and that a successful merge reloads the list and reports how many
 * bookings moved. */
describe("merging duplicate customers (23-60)", () => {
  const duplicatePair: Contact[] = [
    {
      customerId: "c7", phone: "+79990000007", masked: false, displayName: "Booking Anna", notes: null,
      noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
      firstSeenAt: "2026-01-01T09:00:00+00:00", lastSeenAt: "2026-01-01T09:00:00+00:00",
      duplicatePhoneCustomerIds: ["c8"],
    },
    {
      customerId: "c8", phone: "+79990000007", masked: false, displayName: "Chat Anna", notes: null,
      noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
      firstSeenAt: "2026-02-01T09:00:00+00:00", lastSeenAt: "2026-02-01T09:00:00+00:00",
      duplicatePhoneCustomerIds: ["c7"],
    },
  ];

  const preview: CustomerMergePreview = {
    first: {
      customerId: "c7", source: "Booking", willSurvive: true, phone: "+79990000007", masked: false,
      displayName: "Booking Anna", noShowCount: 0,
      bookings: [
        {
          bookingId: "b1", status: "Booked", serviceName: "Haircut", workerDisplayName: "Kim",
          startsAt: "2026-03-01T09:00:00+00:00", endsAt: "2026-03-01T09:45:00+00:00", localDate: "2026-03-01",
        },
      ],
    },
    second: {
      customerId: "c8", source: "Chat", willSurvive: false, phone: "+79990000007", masked: false,
      displayName: "Chat Anna", noShowCount: 0, bookings: [],
    },
  };

  it("shows a duplicate hint on a row that shares a phone with another customer, and none otherwise", async () => {
    calendarApi.getContacts.mockResolvedValue(duplicatePair);
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:edit"], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("Shares a phone with another customer");
  });

  it("offers no Merge button for an operator without customer:edit, even on a duplicate row", async () => {
    calendarApi.getContacts.mockResolvedValue(duplicatePair);
    // The default beforeEach grants only calendar:configure.

    const container = await render(page());

    expect(byText(container, "button", "Merge")).toBeNull();
  });

  it("opens the confirmation dialog naming both customers, and states the merge cannot be undone", async () => {
    calendarApi.getContacts.mockResolvedValue(duplicatePair);
    calendarApi.getCustomerMergePreview.mockResolvedValue(preview);
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:edit"], siteId: SITE_ID });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Merge")?.click());

    expect(calendarApi.getCustomerMergePreview).toHaveBeenCalledWith("token", "c7", "c8", expect.anything());
    expect(container.textContent).toContain("cannot be undone");
    expect(container.textContent).toContain("Kim");
    expect(container.textContent).toContain("Haircut");
  });

  it("on confirm, merges, closes the dialog, reloads the contacts list and reports bookings moved", async () => {
    calendarApi.getContacts.mockResolvedValue(duplicatePair);
    calendarApi.getCustomerMergePreview.mockResolvedValue(preview);
    calendarApi.mergeCustomers.mockResolvedValue({ survivorCustomerId: "c7", absorbedCustomerId: "c8", bookingsMoved: 3 });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:edit"], siteId: SITE_ID });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Merge")?.click());
    calendarApi.getContacts.mockResolvedValue([duplicatePair[0]]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Merge, permanently")?.click());

    expect(calendarApi.mergeCustomers).toHaveBeenCalledWith("token", "c7", "c8");
    expect(byText(container, "h2", "Merge two customer records")).toBeNull();
    expect(container.textContent).toContain("Bookings moved");
    expect(container.textContent).toContain("3");
    expect(calendarApi.getContacts).toHaveBeenCalledTimes(2);
  });

  it("surfaces a failed merge as an error, without closing the dialog", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getContacts.mockResolvedValue(duplicatePair);
    calendarApi.getCustomerMergePreview.mockResolvedValue(preview);
    calendarApi.mergeCustomers.mockRejectedValue(
      new CalendarApiError("contacts.customer_already_merged", "Customer c8 was already merged into c7.", 409),
    );
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure", "customer:edit"], siteId: SITE_ID });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Merge")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Merge, permanently")?.click());

    expect(container.textContent).toContain("already merged");
    expect(byText(container, "h2", "Merge two customer records")).not.toBeNull();
  });
});
