import { config } from "../config.js";

/**
 * `5-08`: `GET /api/v1/operators/me` (`Ago.Chat.Api.Operators.OperatorsEndpoints`, an addition this
 * item made to `ago-chat` for the exact reason `GetMyPermissionsHandler`'s own doc comment gives -
 * nothing before this let the console learn which permissions the signed-in operator holds, and
 * Keycloak's own token carries none of that). Same plain-`fetch` shape as `conversationsApi.ts`.
 */
export interface OperatorPermissionsResponse {
  operatorId: string;
  siteId: string;
  permissions: string[];
}

export async function fetchMyPermissions(accessToken: string): Promise<OperatorPermissionsResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operators/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to load permissions: ${response.status}`);
  }

  return (await response.json()) as OperatorPermissionsResponse;
}
