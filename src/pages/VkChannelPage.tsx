import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  connectVkChannel,
  disconnectVkChannel,
  fetchVkChannelStatus,
  type ConnectVkChannelResponseDto,
  type VkChannelStatusDto,
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
import { Skeleton, Spinner } from "../components/Spinner.js";
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
 * `25-15`/`25-65`: `/channels/vk` - the third of `23-31`'s reserved "Каналы" places to become a real
 * screen, built the same "one channel end to end" way `23-36`/`25-09` built Telegram's and MAX's first.
 *
 * ## VK, not WhatsApp or Avito
 *
 * All three (`14-08`/`14-10`/`14-11`) had a real, working backend adapter and no console screen before
 * `25-15`. Read against the actual endpoint code, not assumed from either precedent
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
 * ## `25-65`: the status read `25-15`'s own doc comment named as a real, load-bearing gap
 *
 * `vkChannelApi.ts`'s own doc comment has the backend half: `VkChannelEndpoints` gained a `GET` route
 * in `25-65`, backed by the same channel-neutral `GetChannelCredentialStatusHandler`
 * `TelegramChannelEndpoints`/`MaxChannelEndpoints` already used. This screen now loads `status` on
 * mount (`load`, the identical `useCallback`+`useEffect` shape `MaxChannelPage` already uses) and
 * decides which view to show from the server's own answer, not from whether *this page visit* happened
 * to perform the connect - the exact gap this doc comment used to describe under "there is no status
 * read" is closed. `WhatsAppChannelEndpoints`/`AvitoChannelEndpoints` still have it (out of `25-65`'s
 * own scope; neither has a console screen yet for this same reason) - not a reason this file's own fix
 * needed to wait, since nothing here depends on either.
 *
 * ## Two separate pieces of "connected" state, not one - `status` versus `justConnected`
 *
 * `status: VkChannelStatusDto | null` is the server's own answer, loaded on mount and after every
 * mutation - the same "one source of truth, reloaded" discipline `MaxChannelPage` already establishes.
 * It drives which panel renders (loading skeleton / connect form / connected view) and, once connected,
 * `channelCredentialId`/`createdAt` for the disconnect call and the "Connected since" line - all of it
 * genuinely persists across a reload, unlike before `25-65`.
 *
 * `justConnected: ConnectVkChannelResponseDto | null` is deliberately a *second*, narrower piece of
 * state: the one payload `VkChannelEndpoints.HandleConnectAsync` ever returns that carries
 * `callbackUrl`/`webhookSecret` (`vkChannelApi.ts`'s own remarks - `GetChannelCredentialStatusHandler`
 * never had either to give back, so `status` can never carry them, on this page visit or any other).
 * Set only by a successful `attemptConnect` in *this* page visit, cleared on disconnect, and never
 * reloaded from anywhere - the values it carries were shown to this operator once, by design
 * (`adr/0069`'s "console never shows it back" is about the shop's own token; VK's own webhook secret is
 * the one exception that class's own remarks already name, and it stays a one-time reveal even here).
 * When `status.connected` is `true` but `justConnected` is `null` (a reload, or a second operator/
 * browser opening an already-connected screen), the connected panel shows
 * `vkChannelSecretsShownOnceHint` instead of the setup instructions - stating plainly that those two
 * values are gone for this session, rather than silently omitting the panel with no explanation.
 *
 * ## The token is never rendered back, in either direction
 *
 * Same guarantee as `TelegramChannelPage`/`MaxChannelPage`: `ConnectVkChannelResponseDto`/
 * `VkChannelStatusDto` together carry an id, a timestamp, and (only on `ConnectVkChannelResponseDto`)
 * the two values VK itself needs handed to a human (`callbackUrl`/`webhookSecret`, `vkChannelApi.ts`'s
 * own remarks on why that response, uniquely among the three connect responses, carries a secret at
 * all) - never a field the community's own access token could come back through.
 */
export function VkChannelPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [status, setStatus] = useState<VkChannelStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** `25-65`: the callback URL/webhook secret, alive only for the page visit that connected them - see
   * this component's own doc comment ("Two separate pieces of "connected" state") for why this is not
   * folded into `status`. */
  const [justConnected, setJustConnected] = useState<ConnectVkChannelResponseDto | null>(null);

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

  const load = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchVkChannelStatus(accessToken, siteId)
      .then((response) => {
        setStatus(response);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiProblemError ? err.message : strings.vkChannelLoadError));
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(VK_CHANNEL_PERMISSION)) {
      return;
    }
    load();
  }, [load, hasPermission]);

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
      setJustConnected(response);
      setCallbackUrlCopied(false);
      setWebhookSecretCopied(false);
      load();
    } catch (err) {
      setConnectError(err instanceof ApiProblemError ? err.message : strings.vkChannelConnectError);
      setConnectAlreadyConnected(err instanceof ApiProblemError && err.code === "ChannelCredential.AlreadyConnected");
    } finally {
      setConnecting(false);
    }
  };

  const attemptDisconnect = async () => {
    if (!accessToken || !siteId || !status?.channelCredentialId) {
      return;
    }

    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await disconnectVkChannel(accessToken, siteId, status.channelCredentialId);
      setDisconnectConfirming(false);
      setJustConnected(null);
      load();
    } catch (err) {
      setDisconnectError(err instanceof ApiProblemError ? err.message : strings.vkChannelDisconnectError);
    } finally {
      setDisconnecting(false);
    }
  };

  const copyCallbackUrl = () => {
    if (!justConnected) {
      return;
    }
    void navigator.clipboard.writeText(justConnected.callbackUrl);
    setCallbackUrlCopied(true);
  };

  const copyWebhookSecret = () => {
    if (!justConnected) {
      return;
    }
    void navigator.clipboard.writeText(justConnected.webhookSecret);
    setWebhookSecretCopied(true);
  };

  const createdAtDate = status?.createdAt ? parseInstant(status.createdAt) : null;

  return (
    <>
      <PageHead title={strings.vkChannelTitle} description={strings.vkChannelDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {status === null ? (
        loadError ? null : (
          <Panel>
            <Skeleton lines={3} label={strings.vkChannelLoadingLabel} />
          </Panel>
        )
      ) : !status.connected ? (
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

            {justConnected ? (
              <>
                <Alert tone="info" title={strings.vkChannelSetupTitle}>
                  {strings.vkChannelSetupBody}
                </Alert>

                <div className="ago-row">
                  <code className="ago-mono">{justConnected.callbackUrl}</code>
                  <Button onClick={copyCallbackUrl}>{strings.vkChannelCopyCallbackUrlButton}</Button>
                </div>
                {callbackUrlCopied && <Alert tone="success">{strings.vkChannelCallbackUrlCopiedLabel}</Alert>}

                <div className="ago-row">
                  <code className="ago-mono">{justConnected.webhookSecret}</code>
                  <Button onClick={copyWebhookSecret}>{strings.vkChannelCopyWebhookSecretButton}</Button>
                </div>
                {webhookSecretCopied && <Alert tone="success">{strings.vkChannelWebhookSecretCopiedLabel}</Alert>}
              </>
            ) : (
              <Alert tone="info">{strings.vkChannelSecretsShownOnceHint}</Alert>
            )}
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
