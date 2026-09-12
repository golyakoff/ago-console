import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { CalendarOperatorConnectionProvider } from "./CalendarOperatorConnectionProvider.js";
import { useCalendarConnection } from "./CalendarConnectionContext.js";

/**
 * `25-63`: `operatorConnection.test.tsx`'s own fake-hub shape (`@microsoft/signalr` mocked, not
 * `CalendarOperatorConnection`), trimmed to this class's own, much smaller surface - see that
 * class's own doc comment for why it carries none of `OperatorConnection`'s message/sequence/dedup
 * machinery. The one behaviour worth a DOM-level test, the same way `5-16` was for the chat
 * connection: **`CalendarOperatorConnectionProvider` opens a connection only when this operator can
 * actually use it, and the one push this hub sends reaches a listener that asked for it.**
 */
const signalr = vi.hoisted(() => {
  const HubConnectionState = {
    Disconnected: "Disconnected",
    Connecting: "Connecting",
    Connected: "Connected",
    Disconnecting: "Disconnecting",
    Reconnecting: "Reconnecting",
  };

  const LogLevel = { Trace: 0, Debug: 1, Information: 2, Warning: 3, Error: 4, Critical: 5, None: 6 };

  class FakeHubConnection {
    state: string = HubConnectionState.Disconnected;
    readonly url: string;
    readonly accessTokenFactory: () => string;
    private readonly handlers = new Map<string, (payload: unknown) => void>();
    private readonly reconnectedCallbacks: (() => void)[] = [];

    constructor(url: string, accessTokenFactory: () => string) {
      this.url = url;
      this.accessTokenFactory = accessTokenFactory;
    }

    on(method: string, handler: (payload: unknown) => void): void {
      this.handlers.set(method, handler);
    }

    onreconnecting(): void {}

    onreconnected(callback: () => void): void {
      this.reconnectedCallbacks.push(callback);
    }

    onclose(): void {}

    start(): Promise<void> {
      this.state = HubConnectionState.Connected;
      return Promise.resolve();
    }

    stop(): Promise<void> {
      this.state = HubConnectionState.Disconnected;
      return Promise.resolve();
    }

    /** Stands in for the server pushing `PendingBookingsChanged`. */
    push(method: string, payload: unknown): void {
      this.handlers.get(method)?.(payload);
    }

    completeReconnect(): void {
      this.state = HubConnectionState.Connected;
      for (const callback of this.reconnectedCallbacks) {
        callback();
      }
    }
  }

  const hubs: FakeHubConnection[] = [];

  class HubConnectionBuilder {
    private url = "";
    private accessTokenFactory: () => string = () => "";

    withUrl(url: string, options: { accessTokenFactory?: () => string }): HubConnectionBuilder {
      this.url = url;
      if (options.accessTokenFactory) {
        this.accessTokenFactory = options.accessTokenFactory;
      }

      return this;
    }

    configureLogging(): HubConnectionBuilder {
      return this;
    }

    withAutomaticReconnect(): HubConnectionBuilder {
      return this;
    }

    build(): FakeHubConnection {
      const hub = new FakeHubConnection(this.url, this.accessTokenFactory);
      hubs.push(hub);
      return hub;
    }
  }

  return { hubs, HubConnectionState, LogLevel, HubConnectionBuilder };
});

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: signalr.HubConnectionBuilder,
  HubConnectionState: signalr.HubConnectionState,
  LogLevel: signalr.LogLevel,
}));

// `vi.hoisted`, not a bare module-scope `let`: `vi.mock`'s own factory below is hoisted above every
// other statement in this file, so referencing an ordinary outer variable from inside it would read
// past its own declaration (a TDZ error) - the same reason `operatorConnection.test.tsx`'s own
// `refuseNextStart` is hoisted this way.
const calendarConfig = vi.hoisted(() => ({ apiBaseUrl: "https://calendar-api.test.invalid" }));

vi.mock("../config.js", () => ({
  get config() {
    return {
      apiBaseUrl: "https://api.test.invalid",
      keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
      keycloakClientId: "ago-console",
      calendarApiBaseUrl: calendarConfig.apiBaseUrl,
    };
  },
}));

function signedInAs(accessToken: string): User {
  return { access_token: accessToken, profile: { sub: "operator-sub" } } as unknown as User;
}

function permissionsOf(permissions: string[]): PermissionsState {
  return {
    permissions,
    siteId: "site-1",
    locale: null,
    enabledModules: ["calendar"],
    credentialsArePublished: null,
    hasPermission: (permission) => permissions.includes(permission),
    tenancies: [],
    activeSiteId: null,
    switchTenancy: () => {},
  };
}

function ProbeAndPush({
  onConnection,
}: {
  onConnection: (state: { connection: unknown; connectionState: string }) => void;
}) {
  const { connection, connectionState } = useCalendarConnection();
  useEffect(() => {
    onConnection({ connection, connectionState });
  });
  return null;
}

function mountApp(permissions: string[], onConnection: (state: { connection: unknown; connectionState: string }) => void): Root {
  const auth: AuthState = {
    user: signedInAs("token-1"),
    isLoading: false,
    isSigningOut: false,
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <AuthContext.Provider value={auth}>
        <PermissionsContext.Provider value={permissionsOf(permissions)}>
          <CalendarOperatorConnectionProvider>
            <ProbeAndPush onConnection={onConnection} />
          </CalendarOperatorConnectionProvider>
        </PermissionsContext.Provider>
      </AuthContext.Provider>,
    );
  });

  return root;
}

let roots: Root[] = [];

beforeEach(() => {
  signalr.hubs.length = 0;
  calendarConfig.apiBaseUrl = "https://calendar-api.test.invalid";
  roots = [];
});

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
});

describe("CalendarOperatorConnectionProvider", () => {
  it("never opens a connection when the operator holds none of the queue's own permissions", async () => {
    let latest: { connection: unknown; connectionState: string } | null = null;
    const root = mountApp(["customer:read"], (state) => {
      latest = state;
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(signalr.hubs).toHaveLength(0);
    expect(latest?.connection).toBeNull();
  });

  it("never opens a connection when calendarApiBaseUrl is not configured, even with the permission", async () => {
    calendarConfig.apiBaseUrl = null;
    let latest: { connection: unknown; connectionState: string } | null = null;
    const root = mountApp(["calendar:configure"], (state) => {
      latest = state;
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(signalr.hubs).toHaveLength(0);
    expect(latest?.connection).toBeNull();
  });

  it("opens exactly one connection, to the calendar backend's own hub path, for an operator holding a booking-action permission alone", async () => {
    let latest: { connection: unknown; connectionState: string } | null = null;
    const root = mountApp(["booking:reject"], (state) => {
      latest = state;
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(signalr.hubs).toHaveLength(1);
    expect(signalr.hubs[0].url).toBe("https://calendar-api.test.invalid/hubs/operator");
    expect(latest?.connection).not.toBeNull();
    expect(latest?.connectionState).toBe("connected");
  });

  it("delivers a real PendingBookingsChanged push to a listener registered through the connection", async () => {
    let connection: { onPendingBookingsChanged: (listener: (dto: unknown) => void) => void } | null = null;
    const root = mountApp(["calendar:configure"], (state) => {
      connection = state.connection as typeof connection;
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    const received: unknown[] = [];
    connection.onPendingBookingsChanged((dto) => received.push(dto));

    const dto = {
      eventId: "11111111-1111-1111-1111-111111111111",
      tenantId: "22222222-2222-2222-2222-222222222222",
      status: "Cancelled",
      occurredAt: "2026-09-12T09:00:00+00:00",
      correlationId: "33333333-3333-3333-3333-333333333333",
    };
    act(() => signalr.hubs[0].push("PendingBookingsChanged", dto));

    expect(received).toEqual([dto]);
  });

  it("reports 'reconnecting' then 'connected' again across a real SignalR reconnect cycle", async () => {
    let latest: { connection: unknown; connectionState: string } | null = null;
    const root = mountApp(["calendar:configure"], (state) => {
      latest = state;
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(latest?.connectionState).toBe("connected");

    act(() => signalr.hubs[0].completeReconnect());
    expect(latest?.connectionState).toBe("connected");
  });
});
