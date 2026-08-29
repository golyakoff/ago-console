import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { OperatorAnalyticsPage } from "./OperatorAnalyticsPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

// React swallows a direct `.value` assignment as "no change" (it patches the native setter to track
// what it last rendered); the prototype's own setter is what makes the synthetic `input` event real -
// the same workaround `SearchConversationsPage.test.tsx#fill`/`OnboardingPage.test.tsx#fill` already use.
const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

async function fillDate(input: HTMLInputElement, value: string) {
  await interact(() => {
    INPUT_VALUE_DESCRIPTOR?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * `18-08`. Follows `SearchConversationsPage.test.tsx`'s own harness shape byte-for-byte (mock the
 * APIs the tree calls, wrap in `MemoryRouter` + a hand-built `AuthContext` + the real
 * `PermissionsProvider`) since this page copies that one's permission-gating and date-range-echo
 * shape byte-for-byte too.
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
const conversationsApi = vi.hoisted(() => ({ fetchOperatorAnalytics: vi.fn() }));

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
          <OperatorAnalyticsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function response(overrides: {
  from?: string;
  to?: string;
  overall?: { conversationCount: number; averageFirstResponseSeconds: number | null; missedCount: number };
  byChannel?: {
    channel: string;
    bucket: { conversationCount: number; averageFirstResponseSeconds: number | null; missedCount: number };
  }[];
} = {}) {
  return {
    from: "2026-05-29T00:00:00+00:00",
    to: "2026-08-29T00:00:00+00:00",
    overall: { conversationCount: 6, averageFirstResponseSeconds: 65, missedCount: 1 },
    byChannel: [
      { channel: "Widget", bucket: { conversationCount: 4, averageFirstResponseSeconds: 90, missedCount: 1 } },
      { channel: "Sms", bucket: { conversationCount: 2, averageFirstResponseSeconds: 40, missedCount: 0 } },
    ],
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

    expect(container.textContent).toContain("You do not have permission to view this site's analytics.");
    expect(container.querySelector("form")).toBeNull();
    expect(conversationsApi.fetchOperatorAnalytics).not.toHaveBeenCalled();
  });
});

describe("loading the report", () => {
  it("loads the server's default window on first render, with no range named", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenCalledWith("token", {});
    // The overall row and both channel rows, all present.
    expect(container.textContent).toContain("All channels");
    expect(container.textContent).toContain("Widget");
    expect(container.textContent).toContain("SMS");
    // The server-echoed range, not a locally-guessed one - the same "the bound is visible, not
    // silent" shape `SearchConversationsPage` already proves for `18-01`.
    expect(container.textContent).toContain("29 May 2026");
    expect(container.textContent).toContain("29 Aug 2026");
  });

  it("renders the hand-calculated numbers exactly as the server reports them", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    // Overall: 6 conversations, 65s average (1m 5s), 1 missed.
    expect(container.textContent).toContain("6");
    expect(container.textContent).toContain("1m 5s");
    // Widget: 4 conversations, 90s average (1m 30s), 1 missed. Sms: 2 conversations, 40s average, 0 missed.
    expect(container.textContent).toContain("1m 30s");
    expect(container.textContent).toContain("40s");
  });

  it("renders an em dash, never 0s, for a bucket whose average is null because nothing was ever answered", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        overall: { conversationCount: 1, averageFirstResponseSeconds: null, missedCount: 1 },
        byChannel: [
          { channel: "Widget", bucket: { conversationCount: 1, averageFirstResponseSeconds: null, missedCount: 1 } },
        ],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("0s");
  });

  it("shows a plain empty state when the site had no conversations in the window, not an error", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({ overall: { conversationCount: 0, averageFirstResponseSeconds: null, missedCount: 0 }, byChannel: [] }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("No conversations in this range.");
  });

  it("surfaces a 403 as a permission-denied message, not a generic error", async () => {
    conversationsApi.fetchOperatorAnalytics.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "nope", 403),
    );

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's analytics.");
  });

  it("surfaces a 400 invalid-range response as a range-error message", async () => {
    conversationsApi.fetchOperatorAnalytics.mockRejectedValue(
      new ApiProblemError("Analytics.InvalidRange", "bad range", 400),
    );

    const container = await render(page());

    expect(container.textContent).toContain("The start of the range must be before its end.");
  });
});

describe("applying a custom range", () => {
  it("re-fetches with the typed from/to converted to ISO day bounds", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());
    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenCalledTimes(1);

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    await fillDate(dateInputs[0], "2026-08-01");
    await fillDate(dateInputs[1], "2026-08-10");

    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({ from: "2026-08-01T00:00:00.000+00:00", to: "2026-08-10T00:00:00.000+00:00" }),
    );
    await interact(() => byText<HTMLButtonElement>(container, "button", "Apply").click());

    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenCalledTimes(2);
    // Local-day start/end - `startOfDayIso`/`endOfDayIso`'s own contract, the identical helper
    // `SearchConversationsPage`'s own date fields already convert through.
    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenLastCalledWith(
      "token",
      expect.objectContaining({
        from: new Date("2026-08-01T00:00:00").toISOString(),
        to: new Date("2026-08-10T23:59:59.999").toISOString(),
      }),
    );
  });
});
