import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarPhoneRevealsPage } from "./CalendarPhoneRevealsPage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";
import type { PhoneReveal } from "../api/calendarApi.js";

/**
 * `23-30`/`23-12`: `/calendar/phone-reveals` - the reveal audit trail. Adapted from
 * `CalendarContactsPage.test.tsx`'s own harness shape for the gate half, and from
 * `SearchConversationsPage.test.tsx`'s own keyset-pagination shape for the "Load more" half.
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
const calendarApi = vi.hoisted(() => ({ getPhoneReveals: vi.fn() }));

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
          <CalendarPhoneRevealsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function reveal(overrides: Partial<PhoneReveal> = {}): PhoneReveal {
  return {
    id: "r1",
    occurredAt: "2026-05-05T09:00:00+00:00",
    customerId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    operatorId: "oooooooo-oooo-oooo-oooo-oooooooooooo",
    surface: "ConsoleContacts",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getPhoneReveals.mockResolvedValue({ items: [], nextBefore: null });
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the audit view (23-30)", () => {
  it("shows an explicit refusal, not an empty list, for a caller without CalendarConfigure", async () => {
    // `enabledModules: ["calendar"]` - this tenant does have the calendar, this operator just lacks
    // `calendar:configure` (the "forbidden" branch `CalendarAccessRefusal`'s own doc comment names,
    // distinct from "absent" for a tenant that never enabled the module at all).
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["customer:read"], siteId: SITE_ID, enabledModules: ["calendar"],
    });

    const container = await render(page());

    expect(container.textContent).toMatch(/do not have permission/i);
    expect(calendarApi.getPhoneReveals).not.toHaveBeenCalled();
    // The refusal itself is not the empty-list state a genuinely empty audit trail would show.
    expect(container.textContent).not.toContain("Nobody has revealed a phone number yet.");
  });

  it("shows the genuinely-empty state, distinguishable from the forbidden one, for a caller who holds the permission", async () => {
    calendarApi.getPhoneReveals.mockResolvedValue({ items: [], nextBefore: null });

    const container = await render(page());

    expect(container.textContent).toContain("Nobody has revealed a phone number yet.");
    expect(container.textContent).not.toMatch(/do not have permission/i);
  });
});

describe("the reveal list", () => {
  it("shows each reveal's customer, operator and surface", async () => {
    calendarApi.getPhoneReveals.mockResolvedValue({
      items: [reveal({ id: "r1", surface: "ConsoleQueue" })],
      nextBefore: null,
    });

    const container = await render(page());

    expect(container.textContent).toContain("ConsoleQueue");
    expect(container.textContent).toContain("cccccccc".slice(0, 8));
    expect(container.textContent).toContain("oooooooo".slice(0, 8));
  });

  it("shows a Load more button only while a next page exists, and appends the next page on click", async () => {
    calendarApi.getPhoneReveals
      .mockResolvedValueOnce({ items: [reveal({ id: "r1" })], nextBefore: "r1" })
      .mockResolvedValueOnce({ items: [reveal({ id: "r2" })], nextBefore: null });

    const container = await render(page());

    expect(byText(container, "button", "Load more")).not.toBeNull();

    await interact(() => byText<HTMLButtonElement>(container, "button", "Load more")?.click());

    expect(calendarApi.getPhoneReveals).toHaveBeenLastCalledWith("token", "r1", undefined, undefined);
    expect(all(container, "tr")).toHaveLength(3); // header row + r1 + r2
    expect(byText(container, "button", "Load more")).toBeNull();
  });

  it("explains a permission failure in words an operator can act on", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getPhoneReveals.mockRejectedValue(
      new CalendarApiError("contacts.forbidden", "This operator does not hold 'calendar:configure' for this tenant.", 403),
    );

    const container = await render(page());

    expect(container.textContent).toMatch(/does not have permission/i);
  });
});
