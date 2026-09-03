import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarContactsPage } from "./CalendarContactsPage.js";
import { render, unmount } from "../testing/dom.js";
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
const calendarApi = vi.hoisted(() => ({ getContacts: vi.fn() }));

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
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
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
  { customerId: "c1", phone: "+79990000001", displayName: "Anna", notes: "Prefers afternoons", noShowCount: 0, firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00" },
  { customerId: "c2", phone: "+79990000002", displayName: null, notes: null, noShowCount: 2, firstSeenAt: "2026-04-01T09:00:00+00:00", lastSeenAt: "2026-04-01T09:00:00+00:00" },
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
