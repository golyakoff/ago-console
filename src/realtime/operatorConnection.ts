import * as signalR from "@microsoft/signalr";
import { config } from "../config.js";

/**
 * `api-design.md`'s "Shipped in `5-09`" note names this exact gotcha for "any other SignalR client
 * this project adds": `@microsoft/signalr` defaults to `withCredentials: true`, which sends cookies
 * cross-origin and then requires the server's CORS policy to answer with
 * `Access-Control-Allow-Credentials: true` - the console never uses cookies (identity travels
 * entirely through the Keycloak-issued bearer token, `adr/0022`/`adr/0023`), so this must be
 * disabled here too, exactly as `ago-widget`'s own `connection.ts` already had to learn live in `5-09`.
 */
export function createOperatorConnection(accessToken: string): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${config.apiBaseUrl}/hubs/operator`, {
      accessTokenFactory: () => accessToken,
      withCredentials: false,
    })
    .withAutomaticReconnect()
    .build();
}
