import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarContactsPage } from "./CalendarContactsPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { Contact } from "../api/calendarApi.js";

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
const calendarApi = vi.hoisted(() => ({ getContacts: vi.fn(), revealCustomerPhone: vi.fn() }));

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
  },
  {
    customerId: "c2", phone: "+79990000002", masked: false, displayName: null, notes: null,
    noShowCount: 2, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-04-01T09:00:00+00:00", lastSeenAt: "2026-04-01T09:00:00+00:00",
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
      },
      {
        customerId: "c5", phone: "+79990000005", masked: false, displayName: "Confirmed only", notes: null,
        noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: "2026-05-02T09:00:00+00:00",
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
      },
      {
        customerId: "c6", phone: "+79990000006", masked: false, displayName: "Both", notes: null,
        noShowCount: 0, phoneVerifiedAt: "2026-05-01T09:00:00+00:00", phoneConfirmedByOperatorAt: "2026-05-02T09:00:00+00:00",
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
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
