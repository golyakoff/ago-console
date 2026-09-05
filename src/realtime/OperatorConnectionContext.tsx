import { createContext, useContext } from "react";
import type { OperatorConnection, ConnectionState } from "./operatorConnection.js";

export interface OperatorConnectionState {
  connection: OperatorConnection;
  connectionState: ConnectionState;
  /** `11-06`: the server pushed `"Reconnect"` (`ConnectionDrainCoordinator`) and the resulting drop
   * has not happened yet - the one genuinely observable degradation, see `linkStatus.ts` for why it
   * is the only one shown. Cleared by the next successful (re)connect. */
  serverDraining: boolean;
  /** `23-20`: the operator's own deliberate presence, read from the server (`OperatorConnection.getMyPresence`)
   * whenever `connectionState` becomes `"connected"` - a first connect and every reconnect alike - so
   * this never renders a locally-remembered value a reconnect has already made stale. See
   * `AwayControl`'s own doc comment for why it must be read rather than assumed. */
  isAway: boolean;
  /** `23-20`: the one action `AwayControl` needs - calls `OperatorConnection.setAway` and, once the
   * server confirms, updates `isAway` itself, so no second component has to remember to do that.
   * Rejects (and leaves `isAway` unchanged) on failure - `AwayControl` decides how to surface that. */
  setAway: (away: boolean) => Promise<void>;
}

export const OperatorConnectionContext = createContext<OperatorConnectionState | null>(null);

/** Throws outside `OperatorConnectionProvider` on purpose, same reasoning as `useAuth` - every route
 * that needs this is already inside it (`App.tsx`'s layout route). */
export function useOperatorConnection(): OperatorConnectionState {
  const context = useContext(OperatorConnectionContext);
  if (context === null) {
    throw new Error("useOperatorConnection() called outside <OperatorConnectionProvider>.");
  }

  return context;
}
