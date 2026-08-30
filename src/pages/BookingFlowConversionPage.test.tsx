import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { BookingFlowConversionPage } from "./BookingFlowConversionPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

// React swallows a direct `.value` assignment as "no change" - the same workaround
// `OperatorAnalyticsPage.test.tsx#fillDate` already uses for its own two date fields.
const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

async function fillDate(input: HTMLInputElement, value: string) {
  await interact(() => {
    INPUT_VALUE_DESCRIPTOR?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * `18-14`. Follows `OperatorAnalyticsPage.test.tsx`'s own harness shape byte-for-byte (mock the APIs
 * the tree calls, wrap in `MemoryRouter` + a hand-built `AuthContext` + the real `PermissionsProvider`)
 * since this page copies that one's permission-gating and date-range-echo shape.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const conversationsApi = vi.hoisted(() => ({ fetchBookingFlowReport: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/conversationsApi.js", () => conversationsApi);

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
          <BookingFlowConversionPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function response(overrides: { from?: string; to?: string; flowsStarted?: number; flowsClosed?: number } = {}) {
  return {
    from: "2026-05-29T00:00:00+00:00",
    to: "2026-08-29T00:00:00+00:00",
    flowsStarted: 5,
    flowsClosed: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
});

afterEach(async () => {
  await unmount();
});

describe("permission gating", () => {
  it("shows a forbidden message and no report for an operator without site:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["conversation:read"], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's booking flow report.");
    expect(container.querySelector("form")).toBeNull();
    expect(conversationsApi.fetchBookingFlowReport).not.toHaveBeenCalled();
  });
});

describe("loading the report", () => {
  it("loads the server's default window on first render, with no range named", async () => {
    conversationsApi.fetchBookingFlowReport.mockResolvedValue(response());

    const container = await render(page());

    expect(conversationsApi.fetchBookingFlowReport).toHaveBeenCalledWith("token", {});
    // The server-echoed range, not a locally-guessed one - the same "the bound is visible, not
    // silent" shape `OperatorAnalyticsPage` already proves for `18-08`.
    expect(container.textContent).toContain("29 May 2026");
    expect(container.textContent).toContain("29 Aug 2026");
  });

  it("renders the two numbers exactly as the server reports them", async () => {
    conversationsApi.fetchBookingFlowReport.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("Booking flows started");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("Flows closed");
    expect(container.textContent).toContain("3");
  });

  /** The item's own load-bearing Done-when: the honesty caveat is text the site owner actually reads
   * on this page, not only a code comment - and it must never claim "booked"/"converted"/"confirmed". */
  it("renders the flow-closed-is-not-confirmed-booked caveat beside the numbers", async () => {
    conversationsApi.fetchBookingFlowReport.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("not the same as a confirmed booking");
    expect(container.textContent).not.toContain("bookings confirmed");
    expect(container.textContent).not.toContain("Bookings started");
  });

  it("shows a plain empty state when no flow was started in the window, not an error", async () => {
    conversationsApi.fetchBookingFlowReport.mockResolvedValue(response({ flowsStarted: 0, flowsClosed: 0 }));

    const container = await render(page());

    expect(container.textContent).toContain("No booking flow was started in this range.");
  });

  it("surfaces a 403 as a permission-denied message, not a generic error", async () => {
    conversationsApi.fetchBookingFlowReport.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "nope", 403),
    );

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's booking flow report.");
  });

  it("surfaces a 400 invalid-range response as a range-error message, distinct from the analytics report's own code", async () => {
    conversationsApi.fetchBookingFlowReport.mockRejectedValue(
      new ApiProblemError("ModuleFlow.InvalidRange", "bad range", 400),
    );

    const container = await render(page());

    expect(container.textContent).toContain("The start of the range must be before its end.");
  });

  it("treats an unrelated error code as a generic load failure, not the invalid-range message", async () => {
    conversationsApi.fetchBookingFlowReport.mockRejectedValue(
      new ApiProblemError("Analytics.InvalidRange", "wrong report's code", 400),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Failed to load the booking flow report.");
    expect(container.textContent).not.toContain("The start of the range must be before its end.");
  });
});

describe("applying a custom range", () => {
  it("re-fetches with the typed from/to converted to ISO day bounds", async () => {
    conversationsApi.fetchBookingFlowReport.mockResolvedValue(response());

    const container = await render(page());
    expect(conversationsApi.fetchBookingFlowReport).toHaveBeenCalledTimes(1);

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    await fillDate(dateInputs[0], "2026-08-01");
    await fillDate(dateInputs[1], "2026-08-10");

    conversationsApi.fetchBookingFlowReport.mockResolvedValue(
      response({ from: "2026-08-01T00:00:00.000+00:00", to: "2026-08-10T00:00:00.000+00:00" }),
    );
    await interact(() => byText<HTMLButtonElement>(container, "button", "Apply").click());

    expect(conversationsApi.fetchBookingFlowReport).toHaveBeenCalledTimes(2);
    expect(conversationsApi.fetchBookingFlowReport).toHaveBeenLastCalledWith(
      "token",
      expect.objectContaining({
        from: new Date("2026-08-01T00:00:00").toISOString(),
        to: new Date("2026-08-10T23:59:59.999").toISOString(),
      }),
    );
  });
});
