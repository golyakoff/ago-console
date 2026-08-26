import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { OperatorConnection, type ConnectionState } from "./operatorConnection.js";
import { OperatorConnectionContext, type OperatorConnectionState } from "./OperatorConnectionContext.js";

/**
 * `5-07`: one `OperatorConnection` for the operator's whole signed-in session, created here rather
 * than inside `QueuePage`/`ConversationPage` themselves (`5-06`'s scaffold had `QueuePage` open its
 * own connection directly - the first thing this item's routing rework fixes). `App.tsx` mounts this
 * once, as a layout route wrapping both pages, specifically so navigating from the queue into a
 * conversation and back never tears down and reopens the underlying SignalR connection - doing that
 * per-page would defeat the whole point of `operatorConnection.ts`'s reconnect-resume logic, which
 * assumes it owns one connection for as long as the operator is looking at *something*, not one per
 * page.
 *
 * Split from `OperatorConnectionContext.tsx` (the context object and `useOperatorConnection` hook)
 * the same way `AuthProvider.tsx`/`AuthContext.tsx` already are - a file that exports both a
 * component and a plain function breaks Vite's Fast Refresh for the component
 * (`react-refresh/only-export-components`), the same reason that split already existed here before
 * this item touched it.
 *
 * ## `5-16`: why the access token is not a dependency
 *
 * It used to be: `useMemo(() => new OperatorConnection(accessToken), [accessToken])`. That reads as
 * harmless and is not, because `oidc-client-ts` renews the access token on its own - `UserManager`'s
 * `automaticSilentRenew` defaults to **true**, and since Keycloak's code flow returns a refresh
 * token, `signinSilent` renews straight off it with no iframe and no `silent_redirect_uri`, which is
 * why `userManager.ts`'s note about silent renew "not being wired up" was true of the iframe
 * plumbing and false about whether renewal happens. Each renewal fires `userLoaded`, `AuthProvider`
 * publishes a new `user`, and a *brand-new* `OperatorConnection` was built with an empty
 * subscription record - so the conversation on screen quietly stopped receiving messages while
 * continuing to render, and the connection it replaced was never stopped, leaving one live
 * server-side entry per renewal.
 *
 * So the token is not what identifies a connection - the **operator** is, and the operator cannot
 * change under a mounted provider (see the memo's own comment). The token now reaches SignalR
 * through a factory reading the live value at connect and reconnect time (`OperatorConnection`'s
 * constructor), which is what a renewal is supposed to look like: nothing is rebuilt, and the next
 * negotiate carries the current token.
 *
 * The alternative - keep rebuilding on every renewal, and have the new connection re-join whatever
 * the old one had open - was rejected: it fixes the reported symptom, keeps the orphaned connections
 * (which were a second, separately-reported anomaly), and leaves the console permanently doing the
 * most expensive thing available (a full WebSocket teardown and negotiate) on a schedule set by
 * Keycloak's token lifetime.
 *
 * What it does *not* fix on its own is the general case, which is why `OperatorConnection` also
 * gained a single replay path for its subscription record (see that class's doc comment). Removing
 * one cause of a connection coming back up empty is not the same as covering them all, and the
 * reported symptom - "switched to another chat and back and it recovered" - is what a lost
 * subscription looks like from *any* cause, not just this one.
 */
export function OperatorConnectionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [serverDraining, setServerDraining] = useState(false);

  // The live token. Assigned during render (the same pattern `WorkspaceLayout` uses for the open
  // conversation id) so `accessTokenFactory` reads the newest renewal without the connection
  // itself being a function of it.
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  if (!accessToken) {
    // `RequireAuth` (the route this is always mounted inside) guarantees a signed-in user by the
    // time children render - reaching here is a wiring bug (this provider mounted outside
    // `RequireAuth`), not a state this component should render around.
    throw new Error("OperatorConnectionProvider requires an authenticated user - mount it inside RequireAuth.");
  }

  // Empty dependencies, on purpose and not by oversight: **nothing** about a signed-in operator can
  // invalidate this connection while the provider stays mounted. Not the token (the factory reads it
  // live); not the operator either - a different `sub` can only arrive through a Keycloak redirect,
  // which is a full page load, and losing the user at all takes `RequireAuth` down and this
  // component with it. That is also this item's answer to "stop the old connection when one is
  // genuinely replaced": there is no replacement left to stop, because the replacement was the bug.
  // Should a future change ever reintroduce a dependency here, it owes this file a `stop()` of the
  // connection it replaces - a replaced-but-running connection sits in the server-side registry
  // until its TTL expires (`realtime.md`'s connection registry), which is exactly how one tab came
  // to hold twelve entries for one operator.
  const connection = useMemo(() => new OperatorConnection(() => accessTokenRef.current ?? ""), []);

  useEffect(() => {
    connection.onStateChange((state) => {
      setConnectionState(state);
      // `11-06`: a successful (re)connect retires the drain hint. Safe to clear on *every*
      // "connected" rather than only on a reconnect, because the hint can only ever arrive after
      // the "connected" that preceded it - the server has to have a live connection to push it
      // down. `linkStatus.ts` has the state table this feeds.
      if (state === "connected") {
        setServerDraining(false);
      }
    });
    // Nothing consumed this before `11-06`: `5-07` wired the listener up and left it informational.
    // It is the console's only honest source for a "degraded" indicator, so the workspace now shows
    // it (`linkStatus.ts`). The reconnect itself is still SignalR's own - this is the operator
    // finding out *why* their connection is about to blink, not a second reconnect mechanism.
    connection.onReconnectHint(() => setServerDraining(true));
    connection.start().catch((error: unknown) => {
      // `5-18`: logged, not swallowed. This `catch` used to discard the error and set the badge to
      // "disconnected", which is how a total outage - every operator connection aborted by the server
      // straight after a successful handshake - produced a console with **nothing at all** in it: no
      // failed request, no error, just the word "Offline". The server's close was clean, so SignalR
      // logged nothing either; this line was the only place the reason could have surfaced and it
      // threw it away. `configureLogging(Warning)` in `operatorConnection.ts` keeps SignalR's own
      // errors, and this keeps the one it does not raise.
      console.error("Operator hub connection failed to start", error);
      setConnectionState("disconnected");
    });

    // Deliberately no `connection.stop()` here. This provider sits at the layout-route level
    // specifically so it survives every in-app navigation between QueuePage and ConversationPage
    // (its own doc comment above) - there is no legitimate in-app unmount of this component while
    // the operator's session is still meant to be live, only React StrictMode's synthetic
    // dev-only mount -> cleanup -> remount, which a real `stop()` here would race against: calling
    // `stop()` while `start()` is still negotiating aborts it ("The connection was stopped during
    // negotiation"), and the resulting remount's `start()` call was found live to permanently fail
    // instead of recovering. A genuine end of session (browser tab closed, hard navigation away) is
    // already handled by the browser tearing down the WebSocket itself, and an explicit logout
    // (`AuthProvider`'s `signoutRedirect`) is a full-page redirect that unloads this component tree
    // anyway - neither needs this cleanup to run to behave correctly.
  }, [connection]);

  const value = useMemo<OperatorConnectionState>(
    () => ({ connection, connectionState, serverDraining }),
    [connection, connectionState, serverDraining],
  );

  return <OperatorConnectionContext.Provider value={value}>{children}</OperatorConnectionContext.Provider>;
}
