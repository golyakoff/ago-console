import { useEffect, useMemo, useState, type ReactNode } from "react";
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
 */
export function OperatorConnectionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  if (!accessToken) {
    // `RequireAuth` (the route this is always mounted inside) guarantees a signed-in user by the
    // time children render - reaching here is a wiring bug (this provider mounted outside
    // `RequireAuth`), not a state this component should render around.
    throw new Error("OperatorConnectionProvider requires an authenticated user - mount it inside RequireAuth.");
  }

  const connection = useMemo(() => new OperatorConnection(accessToken), [accessToken]);

  useEffect(() => {
    connection.onStateChange(setConnectionState);
    connection.start().catch(() => setConnectionState("disconnected"));

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

  const value = useMemo<OperatorConnectionState>(() => ({ connection, connectionState }), [connection, connectionState]);

  return <OperatorConnectionContext.Provider value={value}>{children}</OperatorConnectionContext.Provider>;
}
