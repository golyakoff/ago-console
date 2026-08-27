import { act, useEffect, useMemo, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { OperatorConnection } from "./operatorConnection.js";
import { OperatorConnectionProvider } from "./OperatorConnectionProvider.js";
import { useOperatorConnection } from "./OperatorConnectionContext.js";

/**
 * `5-16`, and the first test in this repository at `testing.md`'s "Component / behaviour" level: a
 * DOM plus fakes for the hub, exercising a behaviour rather than a rendering.
 *
 * The behaviour is the one that broke live: **an operator watching a conversation keeps receiving
 * its messages across an access-token renewal.** No unit test of `backoff`, `dedup` or
 * `SequenceTracker` could have caught it - every one of those pieces was individually correct, and
 * the defect lived in what happened to the object that owned them.
 *
 * ## The fakes
 *
 * `@microsoft/signalr` is mocked, not `OperatorConnection` - mocking a third-party interface is what
 * `testing.md` permits, and the point of the test is the code between the provider and that
 * interface. The fake hub records every connection ever built, every `invoke`, and the
 * `accessTokenFactory` it was handed, and lets a test drive the three things only a server can do:
 * push a message, complete a reconnect, and drop the connection.
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

  interface Invocation {
    method: string;
    args: unknown[];
  }

  /** `5-18`: set by a test before the provider mounts; every hub built after it is refused. */
  const refuseNextStart: { error: Error | null } = { error: null };

  class FakeHubConnection {
    state: string = HubConnectionState.Disconnected;
    readonly invocations: Invocation[] = [];
    readonly accessTokenFactory: () => string;
    /** What `JoinConversationAsync` answers with - a fresh page or a resume delta, per test. */
    joinResult: { messages: unknown[]; nextBeforeSequence: number | null } = { messages: [], nextBeforeSequence: null };
    private readonly handlers = new Map<string, (payload: unknown) => void>();
    private readonly reconnectedCallbacks: (() => void)[] = [];
    private readonly closeCallbacks: (() => void)[] = [];

    constructor(accessTokenFactory: () => string) {
      this.accessTokenFactory = accessTokenFactory;
    }

    on(method: string, handler: (payload: unknown) => void): void {
      this.handlers.set(method, handler);
    }

    onreconnecting(): void {
      // Not driven by any test here - `linkStatus.test.ts` already covers the badge this feeds.
    }

    onreconnected(callback: () => void): void {
      this.reconnectedCallbacks.push(callback);
    }

    onclose(callback: () => void): void {
      this.closeCallbacks.push(callback);
    }

    /** `5-18`: settable so a test can reproduce the server refusing the connection - which is what
     * `OperatorHub.OnConnectedAsync`'s abort looked like from here. */
    startRejectsWith: Error | null = null;

    start(): Promise<void> {
      if (this.startRejectsWith !== null) {
        this.state = HubConnectionState.Disconnected;
        return Promise.reject(this.startRejectsWith);
      }

      this.state = HubConnectionState.Connected;
      return Promise.resolve();
    }

    stop(): Promise<void> {
      this.state = HubConnectionState.Disconnected;
      for (const callback of this.closeCallbacks) {
        callback();
      }
      return Promise.resolve();
    }

    invoke(method: string, ...args: unknown[]): Promise<unknown> {
      this.invocations.push({ method, args });
      if (method === "JoinConversationAsync") {
        return Promise.resolve(this.joinResult);
      }

      return Promise.resolve(null);
    }

    /** Stands in for the server pushing over this connection. */
    push(method: string, payload: unknown): void {
      this.handlers.get(method)?.(payload);
    }

    /** Stands in for `@microsoft/signalr`'s own reconnect completing. */
    completeReconnect(): void {
      this.state = HubConnectionState.Connected;
      for (const callback of this.reconnectedCallbacks) {
        callback();
      }
    }

    invocationsOf(method: string): Invocation[] {
      return this.invocations.filter((invocation) => invocation.method === method);
    }
  }

  const hubs: FakeHubConnection[] = [];

  class HubConnectionBuilder {
    private accessTokenFactory: () => string = () => "";

    withUrl(_url: string, options: { accessTokenFactory?: () => string }): HubConnectionBuilder {
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
      const hub = new FakeHubConnection(this.accessTokenFactory);
      // `5-18`: a connection the server will refuse has to be refusable *before* it is built - the
      // provider starts it in the same effect that creates it, so a test cannot reach in afterwards.
      hub.startRejectsWith = refuseNextStart.error;
      hubs.push(hub);
      return hub;
    }
  }

  return { hubs, HubConnectionState, LogLevel, HubConnectionBuilder, refuseNextStart };
});

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: signalr.HubConnectionBuilder,
  HubConnectionState: signalr.HubConnectionState,
  LogLevel: signalr.LogLevel,
}));

// `config.ts` throws at import time on a missing `VITE_*` variable, by design. Faked rather than
// worked around with an env file, so this test has no environment to set up at all.
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
  },
}));

const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";

function message(id: string, sequence: number, conversationId: string = CONVERSATION_ID) {
  return {
    id,
    sequence,
    authorKind: "Visitor",
    authorId: "22222222-2222-2222-2222-222222222222",
    body: `message ${id}`,
    createdAt: "2026-08-25T09:00:00+00:00",
    conversationId,
  };
}

function signedInAs(accessToken: string): User {
  // Only the two fields this provider reads. A real `User` carries a great deal more, none of which
  // any code under test touches.
  return { access_token: accessToken, profile: { sub: "operator-sub" } } as unknown as User;
}

/**
 * `ConversationPage`'s join effect, reduced to the protocol contract it implements and nothing else:
 * join once per conversation id, and register the message listener at the moment of joining. The
 * guard on `joined` is not incidental - it is what made `5-16` silent, because a rebuilt connection
 * re-ran this effect and this guard correctly refused to re-join a conversation it believed was
 * already joined. Reproduced here rather than mounting the real page, which would drag in the
 * router, the permissions context, the workspace context and four API modules to prove none of them.
 */
function Subscriber({ conversationId, onMessage }: { conversationId: string; onMessage: (m: unknown) => void }) {
  const { connection, connectionState } = useOperatorConnection();
  const joined = useRef<string | null>(null);

  useEffect(() => {
    joined.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (connectionState !== "connected" || joined.current === conversationId) {
      return;
    }

    joined.current = conversationId;
    connection.onMessage(onMessage);
    void connection.joinConversation(conversationId);
  }, [connection, connectionState, conversationId, onMessage]);

  return null;
}

// `13-07`: `OperatorConnectionProvider` now waits on `usePermissions().tenancies` before starting the
// hub (its own doc comment has the race this closes). A single already-resolved tenancy is all this
// file's own tests need - none of them are about tenancy resolution, only about what happens to the
// hub connection itself once it is allowed to start, which a `null` (not-yet-known) value would
// simply delay forever and stall every test below.
const SINGLE_TENANCY: PermissionsState = {
  permissions: [],
  siteId: "33333333-3333-3333-3333-333333333333",
  hasPermission: () => false,
  tenancies: [{ siteId: "33333333-3333-3333-3333-333333333333", siteName: "Test Site" }],
  activeSiteId: "33333333-3333-3333-3333-333333333333",
  switchTenancy: () => undefined,
};

function Harness({ accessToken, onMessage }: { accessToken: string; onMessage: (m: unknown) => void }) {
  const auth = useMemo<AuthState>(
    () => ({
      user: signedInAs(accessToken),
      isLoading: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    }),
    [accessToken],
  );

  return (
    <AuthContext.Provider value={auth}>
      <PermissionsContext.Provider value={SINGLE_TENANCY}>
        <OperatorConnectionProvider>
          <Subscriber conversationId={CONVERSATION_ID} onMessage={onMessage} />
        </OperatorConnectionProvider>
      </PermissionsContext.Provider>
    </AuthContext.Provider>
  );
}

let container: HTMLDivElement;
let root: Root;

async function render(node: ReactNode): Promise<void> {
  await act(async () => {
    root.render(node);
    await flush();
  });
}

/** Drains the microtask queue the fake hub's own resolved promises sit on. No timers are involved
 * anywhere in this file, so there is nothing to advance - only pending `.then` callbacks to run. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  signalr.hubs.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

describe("an access-token renewal", () => {
  it("leaves the open conversation still receiving messages", async () => {
    const received: unknown[] = [];
    const onMessage = (m: unknown) => received.push(m);

    await render(<Harness accessToken="token-1" onMessage={onMessage} />);
    await render(<Harness accessToken="token-2" onMessage={onMessage} />);

    // Whatever connection is live now is the one the server would deliver to.
    const live = signalr.hubs[signalr.hubs.length - 1];
    await act(async () => {
      live.push("MessageReceived", message("m1", 7));
      await flush();
    });

    expect(received).toHaveLength(1);
  });

  it("does not leave an orphaned connection behind per renewal", async () => {
    const onMessage = () => undefined;

    await render(<Harness accessToken="token-1" onMessage={onMessage} />);
    await render(<Harness accessToken="token-2" onMessage={onMessage} />);
    await render(<Harness accessToken="token-3" onMessage={onMessage} />);
    await render(<Harness accessToken="token-4" onMessage={onMessage} />);

    expect(signalr.hubs).toHaveLength(1);
  });

  it("is what the connection's own accessTokenFactory returns on the next negotiate", async () => {
    const onMessage = () => undefined;

    await render(<Harness accessToken="token-1" onMessage={onMessage} />);
    await render(<Harness accessToken="token-2" onMessage={onMessage} />);

    expect(signalr.hubs[0].accessTokenFactory()).toBe("token-2");
  });
});

describe("OperatorConnection's subscription record", () => {
  it("is replayed with the last known sequence after SignalR reconnects", async () => {
    const connection = new OperatorConnection(() => "token");
    await connection.start();

    const hub = signalr.hubs[0];
    hub.joinResult = { messages: [message("m1", 4), message("m2", 5)], nextBeforeSequence: null };
    await connection.joinConversation(CONVERSATION_ID);

    hub.joinResult = { messages: [], nextBeforeSequence: null };
    hub.completeReconnect();
    await flush();

    const joins = hub.invocationsOf("JoinConversationAsync");
    expect(joins).toHaveLength(2);
    expect(joins[1].args).toEqual([CONVERSATION_ID, 5]);
  });

  it("is replayed when the connection is restarted, not only when SignalR reconnects it", async () => {
    const connection = new OperatorConnection(() => "token");
    await connection.start();

    const hub = signalr.hubs[0];
    hub.joinResult = { messages: [message("m1", 9)], nextBeforeSequence: null };
    await connection.joinConversation(CONVERSATION_ID);

    hub.joinResult = { messages: [], nextBeforeSequence: null };
    await connection.stop();
    await connection.start();

    const joins = hub.invocationsOf("JoinConversationAsync");
    expect(joins).toHaveLength(2);
    expect(joins[1].args).toEqual([CONVERSATION_ID, 9]);
  });

  it("is not replayed once the conversation has been left", async () => {
    const connection = new OperatorConnection(() => "token");
    await connection.start();

    const hub = signalr.hubs[0];
    await connection.joinConversation(CONVERSATION_ID);
    connection.leaveConversation();

    await connection.stop();
    await connection.start();

    expect(hub.invocationsOf("JoinConversationAsync")).toHaveLength(1);
  });
});

/**
 * `5-18`: what the console does when the server refuses the connection.
 *
 * The live failure this covers: `OperatorHub` aborted every operator's connection immediately after a
 * successful SignalR handshake, and the console showed "Offline" with **nothing else anywhere** - no
 * failed request in the network tab, no error in the browser console. SignalR itself logged nothing
 * because a server-side abort is a *clean* close, and this provider's own `catch` discarded the only
 * remaining evidence. Diagnosing it took hours that one log line would have saved.
 */
/**
 * `13-07`: found live, against the real cluster, once a second real tenancy finally existed to test
 * against - every operator before this item had exactly one tenancy, and `ResolveOperatorIdentityHandler`
 * resolves an absent active-site signal identically to an explicit one in that case, so the race this
 * closes was invisible in production and in every other test in this file (all of which fix
 * `tenancies` to a resolved value before the provider ever mounts). This is the one test that leaves
 * it unresolved on purpose, to prove the gate itself.
 */
describe("the hub waits for tenancy resolution before connecting", () => {
  it("does not start a connection while tenancies is still null", async () => {
    const auth: AuthState = {
      user: signedInAs("token-1"),
      isLoading: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    };
    const unresolved: PermissionsState = { ...SINGLE_TENANCY, tenancies: null };

    await render(
      <AuthContext.Provider value={auth}>
        <PermissionsContext.Provider value={unresolved}>
          <OperatorConnectionProvider>
            <Subscriber conversationId={CONVERSATION_ID} onMessage={() => undefined} />
          </OperatorConnectionProvider>
        </PermissionsContext.Provider>
      </AuthContext.Provider>,
    );

    // `OperatorConnection`'s constructor builds the underlying SignalR object eagerly (client-side
    // only, no network activity) - the fix gates `.start()`, the call that actually negotiates, so
    // the fake hub existing is expected; it must never have moved off its initial state.
    expect(signalr.hubs).toHaveLength(1);
    expect(signalr.hubs[0].state).toBe(signalr.HubConnectionState.Disconnected);
  });

  it("starts the connection once tenancies resolves", async () => {
    await render(<Harness accessToken="token-1" onMessage={() => undefined} />);

    expect(signalr.hubs).toHaveLength(1);
    expect(signalr.hubs[0].state).toBe(signalr.HubConnectionState.Connected);
  });
});

describe("a hub connection the server refuses", () => {
  it("logs the reason instead of swallowing it", async () => {
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    signalr.refuseNextStart.error = new Error("The connection was stopped during negotiation.");

    try {
      await render(<Harness accessToken="token-1" onMessage={() => undefined} />);
      await act(async () => {
        await flush();
      });
    } finally {
      console.error = original;
      signalr.refuseNextStart.error = null;
    }

    // Before `5-18` this was empty for exactly the failure that took the product down.
    expect(logged.some((line) => line.includes("Operator hub connection failed to start"))).toBe(true);
  });
});
