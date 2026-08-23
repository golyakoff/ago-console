import { useEffect, useState } from "react";
import type { HubConnectionState } from "@microsoft/signalr";
import { useAuth } from "../auth/AuthContext.js";
import { createOperatorConnection } from "../realtime/operatorConnection.js";

/**
 * Placeholder - the waiting queue itself is `5-07`'s job. What this page proves, per `5-06`'s own
 * Done-when: the Keycloak-issued token this operator just signed in with actually opens
 * `/hubs/operator` - `RequireOperatorIdentity` (`5-05`) accepting it end to end, not just the login
 * redirect completing.
 */
export function QueuePage() {
  const { user, logout } = useAuth();
  const [connectionState, setConnectionState] = useState<HubConnectionState | "connecting">("connecting");

  useEffect(() => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    const connection = createOperatorConnection(accessToken);
    connection.onclose(() => setConnectionState(connection.state));
    connection.onreconnecting(() => setConnectionState(connection.state));
    connection.onreconnected(() => setConnectionState(connection.state));

    connection
      .start()
      .then(() => setConnectionState(connection.state))
      .catch(() => setConnectionState(connection.state));

    return () => {
      void connection.stop();
    };
  }, [user]);

  return (
    <div>
      <p>
        Signed in as {user?.profile.preferred_username ?? user?.profile.sub} - <button onClick={() => void logout()}>Sign out</button>
      </p>
      <p>Operator hub: {connectionState}</p>
      <p>Waiting queue - {"5-07"}'s own job, not this scaffold's.</p>
    </div>
  );
}
