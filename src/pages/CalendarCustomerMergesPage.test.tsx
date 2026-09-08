import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarCustomerMergesPage } from "./CalendarCustomerMergesPage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";
import type { CustomerMergeRecord } from "../api/calendarApi.js";

/**
 * `23-60`/`adr/0161`: `/calendar/customer-merges` - the merge audit trail. Adapted directly from
 * `CalendarPhoneRevealsPage.test.tsx`'s own harness shape - the same gate half and the same
 * keyset-pagination half, restated for a second, independent audit trail.
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
const calendarApi = vi.hoisted(() => ({ getCustomerMerges: vi.fn() }));

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
          <CalendarCustomerMergesPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function mergeRecord(overrides: Partial<CustomerMergeRecord> = {}): CustomerMergeRecord {
  return {
    id: "m1",
    mergedAt: "2026-05-05T09:00:00+00:00",
    survivorCustomerId: "ssssssss-ssss-ssss-ssss-ssssssssssss",
    absorbedCustomerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    operatorId: "oooooooo-oooo-oooo-oooo-oooooooooooo",
    bookingsMoved: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getCustomerMerges.mockResolvedValue({ items: [], nextBefore: null });
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the merge audit view (23-60)", () => {
  it("shows an explicit refusal, not an empty list, for a caller without calendar:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["customer:edit"], siteId: SITE_ID, enabledModules: ["calendar"],
    });

    const container = await render(page());

    expect(container.textContent).toMatch(/do not have permission/i);
    expect(calendarApi.getCustomerMerges).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Nobody has merged two customer records yet.");
  });

  it("shows the genuinely-empty state, distinguishable from the forbidden one, for a caller who holds the permission", async () => {
    calendarApi.getCustomerMerges.mockResolvedValue({ items: [], nextBefore: null });

    const container = await render(page());

    expect(container.textContent).toContain("Nobody has merged two customer records yet.");
    expect(container.textContent).not.toMatch(/do not have permission/i);
  });
});

describe("the merge list", () => {
  it("shows each merge's survivor, absorbed customer, operator and bookings-moved count", async () => {
    calendarApi.getCustomerMerges.mockResolvedValue({
      items: [mergeRecord({ id: "m1", bookingsMoved: 5 })],
      nextBefore: null,
    });

    const container = await render(page());

    expect(container.textContent).toContain("ssssssss".slice(0, 8));
    expect(container.textContent).toContain("aaaaaaaa".slice(0, 8));
    expect(container.textContent).toContain("oooooooo".slice(0, 8));
    expect(container.textContent).toContain("5");
  });

  it("shows a Load more button only while a next page exists, and appends the next page on click", async () => {
    calendarApi.getCustomerMerges
      .mockResolvedValueOnce({ items: [mergeRecord({ id: "m1" })], nextBefore: "m1" })
      .mockResolvedValueOnce({ items: [mergeRecord({ id: "m2" })], nextBefore: null });

    const container = await render(page());

    expect(byText(container, "button", "Load more")).not.toBeNull();

    await interact(() => byText<HTMLButtonElement>(container, "button", "Load more")?.click());

    expect(calendarApi.getCustomerMerges).toHaveBeenLastCalledWith("token", "m1", undefined, undefined);
    expect(all(container, "tr")).toHaveLength(3); // header row + m1 + m2
    expect(byText(container, "button", "Load more")).toBeNull();
  });

  it("explains a permission failure in words an operator can act on", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getCustomerMerges.mockRejectedValue(
      new CalendarApiError("contacts.forbidden", "This operator does not hold 'calendar:configure' for this tenant.", 403),
    );

    const container = await render(page());

    expect(container.textContent).toMatch(/does not have permission/i);
  });
});
