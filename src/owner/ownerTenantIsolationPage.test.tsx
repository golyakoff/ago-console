import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerTenantIsolationPage } from "./OwnerTenantIsolationPage.js";
import type { OwnerTenantIsolationSummary } from "../api/ownerApi.js";
import type { CalendarTenantScopeSummary } from "../api/calendarApi.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `24-17`: the combined-screen's own behaviour tests - mirrors `ownerPricingPage.test.tsx`'s setup
 * (the identical mocked modules, the identical `Signed` wrapper), since this page is mounted the
 * identical way and gated the identical way. Covers the one property this item's own Scope names as
 * the thing that must never be wrong: a non-zero `unaccountedKeys` from AGO Chat reads as a real
 * finding, distinctly from every plain count and distinctly from AGO Calendar's own unclassified
 * `notGated`.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ fetchOwnerTenantIsolationSummary: vi.fn() }));
const calendarApi = vi.hoisted(() => ({ fetchOwnerTenantScopeSummary: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/calendarApi.js", () => calendarApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

function signedIn(): User {
  return { access_token: "token", profile: { sub: "owner-sub", preferred_username: "golyakoff" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function shellAt() {
  return (
    <MemoryRouter initialEntries={["/owner/tenant-isolation"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner/tenant-isolation" element={<OwnerTenantIsolationPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

const CHAT_SUMMARY: OwnerTenantIsolationSummary = {
  entryPoints: 179,
  handlerClasses: 166,
  rbacGated: 106,
  exemptListed: 73,
  unaccountedKeys: [],
  exemptButAlsoLooksGated: [],
  routesAndHubMethods: 140,
  clientSuppliedSiteIdRoutes: 58,
  generatedAtUtc: "2026-09-14T02:00:00Z",
};

const CALENDAR_SUMMARY: CalendarTenantScopeSummary = {
  entryPoints: 50,
  handlerClasses: 50,
  rbacGated: 31,
  notGated: 19,
  notGatedKeys: ["Ago.Calendar.Application.UseCases.PublicBooking.BookEventHandler.HandleAsync"],
  routesAndHubMethods: 30,
  clientSuppliedTenantIdRoutes: 10,
  generatedAtUtc: "2026-09-14T02:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
  ownerApi.fetchOwnerTenantIsolationSummary.mockResolvedValue({ status: "ok", summary: CHAT_SUMMARY });
  calendarApi.fetchOwnerTenantScopeSummary.mockResolvedValue({ status: "ok", summary: CALENDAR_SUMMARY });
});

afterEach(async () => {
  await unmount();
});

describe("the combined tenant-isolation screen", () => {
  it("shows both products' own figures and the console's own combined sum", async () => {
    const container = await render(shellAt());

    // AGO Chat's own figures.
    expect(container.textContent).toContain("179");
    expect(container.textContent).toContain("106");
    // AGO Calendar's own figures.
    expect(container.textContent).toContain("50");
    expect(container.textContent).toContain("31");
    // The console's own sum: 179 + 50 entry points, 106 + 31 gated.
    expect(container.textContent).toContain("229");
    expect(container.textContent).toContain("137");
  });

  it("renders a calm, explicit success state when AGO Chat's Unaccounted is zero - never silence", async () => {
    const container = await render(shellAt());

    expect(container.textContent).toContain("Unaccounted: 0");
    expect(container.textContent).toContain("Ago.Chat.Architecture.Tests.TenantScopeTests");
  });

  // `24-17`'s own rule, proven directly: a real finding must be visually distinct from a plain count,
  // not merely present somewhere on the page.
  it("renders a non-zero Unaccounted as a danger alert naming the exact entry points", async () => {
    ownerApi.fetchOwnerTenantIsolationSummary.mockResolvedValue({
      status: "ok",
      summary: {
        ...CHAT_SUMMARY,
        unaccountedKeys: ["Ago.Chat.Application.UseCases.Whatever.WhateverHandler.HandleAsync"],
      },
    });

    const container = await render(shellAt());

    const dangerAlerts = container.querySelectorAll(".ago-alert--danger");
    const unaccountedAlert = Array.from(dangerAlerts).find((el) =>
      el.textContent?.includes("Unaccounted: 1"),
    );
    expect(unaccountedAlert).toBeDefined();
    expect(unaccountedAlert?.textContent).toContain(
      "Ago.Chat.Application.UseCases.Whatever.WhateverHandler.HandleAsync",
    );
    expect(unaccountedAlert?.textContent).toContain("real finding");
  });

  // The property AGO Calendar's own `TenantScopeSnapshot` remarks insist on: its unclassified count
  // must never read as the same kind of fact AGO Chat's Unaccounted is - `info` tone, not `danger`,
  // and never labelled "Unaccounted".
  it("renders AGO Calendar's notGated as an unclassified info note, never as an Unaccounted-shaped alert", async () => {
    const container = await render(shellAt());

    expect(container.textContent).toContain("Not RBAC-gated (unclassified): 19");
    const infoAlerts = container.querySelectorAll(".ago-alert--info");
    const calendarAlert = Array.from(infoAlerts).find((el) =>
      el.textContent?.includes("Not RBAC-gated (unclassified)"),
    );
    expect(calendarAlert).toBeDefined();
    expect(calendarAlert?.textContent).toContain("no exemption catalogue");
    // Never rendered in the danger tone AGO Chat's own real finding uses.
    expect(
      Array.from(container.querySelectorAll(".ago-alert--danger")).some((el) =>
        el.textContent?.includes("Not RBAC-gated"),
      ),
    ).toBe(false);
  });

  it("states plainly when the AGO Calendar backend is not configured, rather than a bare error", async () => {
    calendarApi.fetchOwnerTenantScopeSummary.mockResolvedValue({ status: "not-configured" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("AGO Calendar backend is not configured");
    // No combined figure without both sides answering.
    expect(container.textContent).not.toContain("Combined, across both products");
  });

  it("shows the server's own refusal when neither backend answers as the platform owner", async () => {
    ownerApi.fetchOwnerTenantIsolationSummary.mockResolvedValue({ status: "not-authorized" });
    calendarApi.fetchOwnerTenantScopeSummary.mockResolvedValue({ status: "not-authorized" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Not authorized");
  });
});
