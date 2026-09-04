import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarElsewhereNotice } from "./CalendarElsewhereNotice.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `22-14`/`adr/0100`: the item's own defect is that "you have no calendar" and "you have a calendar,
 * in a shop other than the one you are looking at" render identically. These are the four answers
 * that distinguishability actually consists of - name the others, say nothing when there are none,
 * say nothing when the backend cannot be reached, and never name the shop already being looked at.
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
const calendarTenanciesApi = vi.hoisted(() => ({ fetchMyCalendarTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarTenanciesApi.js", async () => {
  const actual =
    await vi.importActual<typeof import("../api/calendarTenanciesApi.js")>("../api/calendarTenanciesApi.js");
  return { ...actual, ...calendarTenanciesApi };
});

const HERE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ELSEWHERE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({
      user: { access_token: "token", profile: { sub: "operator-sub" } } as unknown as User,
      isLoading: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function notice(): ReactNode {
  return (
    <Signed>
      <PermissionsProvider>
        <CalendarElsewhereNotice />
      </PermissionsProvider>
    </Signed>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Two shops in the chat-side switcher, so `PermissionsProvider` resolves an active site rather
  // than leaving it null - the state a person with two shops is actually in.
  tenanciesApi.fetchMyTenancies.mockResolvedValue({
    tenancies: [
      { siteId: HERE, siteName: "Here" },
      { siteId: ELSEWHERE, siteName: "Elsewhere" },
    ],
  });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: HERE, locale: "en" });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
});

describe("the where-is-my-calendar notice", () => {
  it("names the shops whose calendar this person can reach, and never the one they are in", async () => {
    calendarTenanciesApi.fetchMyCalendarTenancies.mockResolvedValue([
      { tenantId: HERE, tenantName: "Here" },
      { tenantId: ELSEWHERE, tenantName: "Elsewhere" },
    ]);

    const container = await render(notice());

    expect(container.textContent).toContain("Elsewhere");
    // "Here" would be actively misleading: it is the shop whose calendar just refused them.
    expect(container.querySelectorAll("li")).toHaveLength(1);
  });

  it("renders nothing when this identity has no calendar anywhere else", async () => {
    calendarTenanciesApi.fetchMyCalendarTenancies.mockResolvedValue([{ tenantId: HERE, tenantName: "Here" }]);

    const container = await render(notice());

    expect(container.textContent).toBe("");
  });

  it("renders nothing when this identity has no calendar at all", async () => {
    calendarTenanciesApi.fetchMyCalendarTenancies.mockResolvedValue([]);

    const container = await render(notice());

    expect(container.textContent).toBe("");
  });

  it("renders nothing, rather than a second error, when the calendar backend cannot be asked", async () => {
    // The refusal above this component is already the answer; a hint that failed to load must not
    // turn into a message of its own.
    calendarTenanciesApi.fetchMyCalendarTenancies.mockRejectedValue(new Error("network"));

    const container = await render(notice());

    expect(container.textContent).toBe("");
  });
});
