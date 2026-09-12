import { useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  connectVkChannel,
  disconnectVkChannel,
  type ConnectVkChannelResponseDto,
} from "../api/vkChannelApi.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/** `25-15`: the same `channel:manage` gate `Ago.Chat.Api`'s `VkChannelEndpoints` actually enforces on
 * both of its own routes (`RegisterChannelCredentialHandler`/`RevokeChannelCredentialHandler` each check
 * it independently) - the identical chain `TELEGRAM_CHANNEL_PERMISSION`'s/`MAX_CHANNEL_PERMISSION`'s own
 * doc comments already walk through, named once here the same way. `consoleNav.ts`'s own
 * `buildChannelsItems` still gates the whole "Каналы" section on `site:configure` rather than this
 * permission specifically - the same gap every other `isAdmin`-gated screen in that section already
 * has, not one this item introduces.
 */
export const VK_CHANNEL_PERMISSION = "channel:manage";

/**
 * `25-15`: `/channels/vk` - the third of `23-31`'s reserved "Каналы" places to become a real screen,
 * built the same "one channel end to end" way `23-36`/`25-09` built Telegram's and MAX's first.
 *
 * ## VK, not WhatsApp or Avito
 *
 * All three (`14-08`/`14-10`/`14-11`) had a real, working backend adapter and no console screen before
 * this item. Read against the actual endpoint code, not assumed from either precedent
 * (`VkChannelEndpoints`/`WhatsAppChannelEndpoints`/`AvitoChannelEndpoints`, all in `ago-chat`):
 *
 * - **WhatsApp** goes through Meta's own onboarding - a `phoneNumberId` the operator has to already
 *   have obtained from Meta's own App Dashboard or Embedded Signup flow, on top of the token itself
 *   (`WhatsAppChannelEndpoints.ConnectWhatsAppChannelRequest`'s own remarks). Nothing about a single
 *   community token pasted into a form.
 * - **Avito** is a real OAuth 2 authorization-code pair (access token *and* refresh token,
 *   `AvitoChannelEndpoints.ConnectAvitoChannelRequest`) plus a programmatic webhook-subscribe step this
 *   endpoint performs and rolls back on rejection - a shape closer to MAX's own extra step than to
 *   Telegram's single secret, but with a second secret MAX and Telegram do not have at all.
 * - **VK** needs exactly one secret - a community access token - and `VkChannelEndpoints.
 *   HandleConnectAsync` validates it with a single live call (`groups.getById`) before ever writing a
 *   row, the identical "reject before you persist" discipline Telegram's `getMe` and MAX's
 *   `POST /subscriptions` already established. No OAuth dance, no second provider-supplied id to
 *   collect first - the smallest, most honest "one channel, all the way" of the three, the same reason
 *   `TelegramChannelPage`'s own doc comment gave for picking Telegram over MAX first.
 *
 * ## The one real gap this screen cannot paper over: there is no status read
 *
 * `vkChannelApi.ts`'s own doc comment has the finding in full: `VkChannelEndpoints` maps `POST`/`DELETE`
 * only, never `GET` - unlike `TelegramChannelEndpoints`/`MaxChannelEndpoints`, both of which back a
 * `GET` with the channel-neutral `GetChannelCredentialStatusHandler`. `WhatsAppChannelEndpoints`/
 * `AvitoChannelEndpoints` have the identical gap, so this is not a reason to have picked either of them
 * instead - the same missing route, three times over.
 *
 * Concretely, this means: on mount, this screen does not know - and has no honest way to find out -
 * whether VK is already connected. It shows the connect form unconditionally rather than
 * `TelegramChannelPage`'s/`MaxChannelPage`'s "load status, then decide which view to show". A
 * successful connect renders the credentials-and-disconnect view for the rest of that page visit
 * (`channelCredentialId` held in memory, the only place this screen ever learns it); a reload forgets
 * it, because nothing exists to ask. Attempting to connect while a credential is already active is
 * refused server-side (`ChannelCredential.AlreadyConnected`, `RegisterChannelCredentialHandler`'s own
 * check) - surfaced here as `connectError` like any other refusal, with `vkChannelAlreadyConnectedHint`
 * added underneath because, unlike a bad token, this refusal's remedy is not "try a different value in
 * this same form" and deserves saying so.
 *
 * This is a real, load-bearing gap in what this screen can offer next to Telegram's/MAX's own screens,
 * not a corner cut for expedience: adding the missing `GET` route is a small, low-risk backend change
 * (`GetChannelCredentialStatusHandler` already does the channel-neutral half of the work), but it is
 * backend work in `ago-chat`, and this item is scoped frontend-only against the backend as it actually
 * ships today. Papering over it with a client-side guess (`localStorage`, an optimistic flag that
 * survives a reload untested) would silently lie the moment a different operator, or the same operator
 * in a different browser, opens this screen - exactly the failure every other channel screen in this
 * console was built to avoid.
 *
 * ## The token is never rendered back, in either direction
 *
 * Same guarantee as `TelegramChannelPage`/`MaxChannelPage`: `ConnectVkChannelResponseDto` carries an id,
 * a timestamp, and the two values VK itself needs handed to a human (`callbackUrl`/`webhookSecret`,
 * `vkChannelApi.ts`'s own remarks on why this response, uniquely among the three, carries a secret at
 * all) - never a field the community's own access token could come back through.
 */
export function VkChannelPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [connection, setConnection] = useState<ConnectVkChannelResponseDto | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectAlreadyConnected, setConnectAlreadyConnected] = useState(false);

  const [callbackUrlCopied, setCallbackUrlCopied] = useState(false);
  const [webhookSecretCopied, setWebhookSecretCopied] = useState(false);

  const [disconnectConfirming, setDisconnectConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const accessToken = user?.access_token;

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(VK_CHANNEL_PERMISSION)) {
    return <AccessRefusal title={strings.vkChannelTitle} message={strings.vkChannelForbidden} strings={strings} />;
  }

  const attemptConnect = async () => {
    if (!accessToken || !siteId) {
      return;
    }

    setConnecting(true);
    setConnectError(null);
    setConnectAlreadyConnected(false);
    try {
      const response = await connectVkChannel(accessToken, siteId, tokenInput);
      setTokenInput("");
      setConnection(response);
      setCallbackUrlCopied(false);
      setWebhookSecretCopied(false);
    } catch (err) {
      setConnectError(err instanceof ApiProblemError ? err.message : strings.vkChannelConnectError);
      setConnectAlreadyConnected(err instanceof ApiProblemError && err.code === "ChannelCredential.AlreadyConnected");
    } finally {
      setConnecting(false);
    }
  };

  const attemptDisconnect = async () => {
    if (!accessToken || !siteId || !connection) {
      return;
    }

    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await disconnectVkChannel(accessToken, siteId, connection.channelCredentialId);
      setDisconnectConfirming(false);
      setConnection(null);
    } catch (err) {
      setDisconnectError(err instanceof ApiProblemError ? err.message : strings.vkChannelDisconnectError);
    } finally {
      setDisconnecting(false);
    }
  };

  const copyCallbackUrl = () => {
    if (!connection) {
      return;
    }
    void navigator.clipboard.writeText(connection.callbackUrl);
    setCallbackUrlCopied(true);
  };

  const copyWebhookSecret = () => {
    if (!connection) {
      return;
    }
    void navigator.clipboard.writeText(connection.webhookSecret);
    setWebhookSecretCopied(true);
  };

  const createdAtDate = connection?.createdAt ? parseInstant(connection.createdAt) : null;

  return (
    <>
      <PageHead title={strings.vkChannelTitle} description={strings.vkChannelDescription} />

      {connection === null ? (
        <Panel title={strings.vkChannelPanelTitle}>
          <div className="ago-stack">
            <p>{strings.vkChannelNotConnectedBody}</p>

            <Field label={strings.vkChannelTokenFieldLabel} description={strings.vkChannelTokenFieldDescription}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  disabled={connecting}
                />
              )}
            </Field>

            {connectError && <Alert tone="danger">{connectError}</Alert>}
            {connectAlreadyConnected && <Alert tone="info">{strings.vkChannelAlreadyConnectedHint}</Alert>}

            <div>
              <Button variant="primary" onClick={() => void attemptConnect()} disabled={connecting || tokenInput.trim().length === 0}>
                {connecting ? strings.vkChannelConnectingButton : strings.vkChannelConnectButton}
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel
          title={strings.vkChannelPanelTitle}
          actions={
            <Button variant="ghost" onClick={() => { setDisconnectError(null); setDisconnectConfirming(true); }}>
              {strings.vkChannelDisconnectButton}
            </Button>
          }
        >
          <div className="ago-stack">
            <Badge tone="success" dot>
              {strings.vkChannelConnectedBadge}
            </Badge>

            {createdAtDate && (
              <p>
                {strings.vkChannelConnectedSinceLabel} {formatDateStamp(createdAtDate, timeZone, strings)}
              </p>
            )}

            <Alert tone="info" title={strings.vkChannelSetupTitle}>
              {strings.vkChannelSetupBody}
            </Alert>

            <div className="ago-row">
              <code className="ago-mono">{connection.callbackUrl}</code>
              <Button onClick={copyCallbackUrl}>{strings.vkChannelCopyCallbackUrlButton}</Button>
            </div>
            {callbackUrlCopied && <Alert tone="success">{strings.vkChannelCallbackUrlCopiedLabel}</Alert>}

            <div className="ago-row">
              <code className="ago-mono">{connection.webhookSecret}</code>
              <Button onClick={copyWebhookSecret}>{strings.vkChannelCopyWebhookSecretButton}</Button>
            </div>
            {webhookSecretCopied && <Alert tone="success">{strings.vkChannelWebhookSecretCopiedLabel}</Alert>}
          </div>
        </Panel>
      )}

      <Dialog
        open={disconnectConfirming}
        title={strings.vkChannelDisconnectDialogTitle}
        onClose={() => setDisconnectConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisconnectConfirming(false)} disabled={disconnecting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attemptDisconnect()} disabled={disconnecting}>
              {strings.vkChannelDisconnectConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.vkChannelDisconnectDialogBody}</p>
        {disconnectError && <Alert tone="danger">{disconnectError}</Alert>}
      </Dialog>
    </>
  );
}
