import { createContext, useContext } from "react";
import type { OperatorConnection, ConnectionState } from "./operatorConnection.js";

export interface OperatorConnectionState {
  connection: OperatorConnection;
  connectionState: ConnectionState;
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
