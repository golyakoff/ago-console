import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "./AuthContext.js";
import { PermissionsProvider } from "./PermissionsProvider.js";
import { usePermissions } from "./PermissionsContext.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `23-99`: `PermissionsProvider` is what decides, for the whole console, how many shops this
 * identity is offered (`tenancies`) and what its own tenant has switched on (`enabledModules`) -
 * `calendarAccess.tsx`'s own doc comment calls the latter "flows.md 4.3's 'absent and forbidden look
 * identical' rule, generalised past the calendar tenancy switcher". Every other test file that uses
 * this provider mocks `tenanciesApi`/`operatorsApi` at the module level, which bypasses the real
 * `fetch`-parsing code entirely - fine for testing everything *downstream* of a resolved value, but
 * it cannot exercise the shape check this item adds *inside* those two modules. This file mocks
 * `fetch` instead, so the real `fetchMyTenancies`/`fetchMyPermissions` run.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({
      user: { access_token: "token", profile: { sub: "operator-sub" } } as unknown as User,
      isLoading: false,
      isSigningOut: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** Renders exactly what a gated screen (`CalendarBookingsPage`'s own `permissions === null` branch,
 * for one) actually reads - never "not yet known" and "known to be empty" collapsed into the same
 * text, which is the distinction this whole item is about. */
function Probe() {
  const { permissions, enabledModules, tenancies } = usePermissions();

  if (permissions === null) {
    return <div data-testid="probe">STILL-LOADING</div>;
  }

  return (
    <div data-testid="probe">
      READY permissions={JSON.stringify(permissions)} enabledModules={JSON.stringify(enabledModules)} tenancies=
      {JSON.stringify(tenancies)}
    </div>
  );
}

function probe(): ReactNode {
  return (
    <Signed>
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>
    </Signed>
  );
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("PermissionsProvider - 23-99 shape validation", () => {
  it("resolves normally end to end when both responses are well-formed", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/me/tenancies")) {
        return Promise.resolve(jsonResponse(200, { tenancies: [{ siteId: "s1", siteName: "Shop One" }] }));
      }
      return Promise.resolve(
        jsonResponse(200, { operatorId: "op1", siteId: "s1", permissions: ["customer:read"], locale: "En", enabledModules: ["calendar"] }),
      );
    });

    const container = await render(probe());
    await flush();

    expect(container.textContent).toContain("READY");
    expect(container.textContent).toContain('enabledModules=["calendar"]');
  });

  /**
   * The case this item exists for: before this change, a response silently missing
   * `enabledModules` still resolved - `enabledModules ?? []` (`PermissionsProvider`'s own comment)
   * turned "the field never arrived" into "this tenant has zero modules", which renders identically
   * to a real tenant with none. After this change, `fetchMyPermissions` itself throws before
   * `PermissionsProvider` ever reaches that default, so the provider's own existing fail-soft
   * `.catch()` (documented: "a permissions fetch failing must not crash the console") takes over and
   * `permissions` stays `null` - "not yet known" forever, not a concrete, misleadingly-empty answer.
   * A stuck probe is not everything a person could want here (a further, more informative state is
   * not this item's own scope - see the report), but it is genuinely distinguishable from "this
   * account has nothing", which is the one thing this test exists to prove.
   */
  it("stays 'not yet known' rather than resolving into a misleadingly-empty state, when enabledModules is dropped", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/me/tenancies")) {
        return Promise.resolve(jsonResponse(200, { tenancies: [{ siteId: "s1", siteName: "Shop One" }] }));
      }
      // enabledModules dropped - an otherwise well-formed operators/me response.
      return Promise.resolve(jsonResponse(200, { operatorId: "op1", siteId: "s1", permissions: ["customer:read"], locale: "En" }));
    });

    const container = await render(probe());
    await flush();

    expect(container.textContent).toBe("STILL-LOADING");
  });

  it("stays 'not yet known' when one tenancy in the list is missing siteName, rather than resolving with a corrupted entry", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/me/tenancies")) {
        return Promise.resolve(jsonResponse(200, { tenancies: [{ siteId: "s1" }] }));
      }
      return Promise.resolve(
        jsonResponse(200, { operatorId: "op1", siteId: "s1", permissions: [], locale: "En", enabledModules: [] }),
      );
    });

    const container = await render(probe());
    await flush();

    expect(container.textContent).toBe("STILL-LOADING");
  });
});
