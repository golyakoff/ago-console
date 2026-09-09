import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  connectMaxChannel,
  disconnectMaxChannel,
  fetchMaxChannelStatus,
  type MaxChannelStatusDto,
} from "../api/maxChannelApi.js";
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

/** `25-09`: same `channel:manage` gate `Ago.Chat.Api`'s `MaxChannelEndpoints` actually enforces on all
 * three of its own routes (`RegisterChannelCredentialHandler`/`RevokeChannelCredentialHandler`/
 * `GetChannelCredentialStatusHandler` each check it independently, the identical chain
 * `TELEGRAM_CHANNEL_PERMISSION`'s own doc comment already walks through for Telegram) - named once here
 * the same way. `consoleNav.ts`'s own `buildChannelsItems` still gates the whole "Каналы" section on
 * `site:configure` (the `isAdmin` proxy) rather than this permission specifically - the same gap every
 * other `isAdmin`-gated screen in that section already has, not one this item introduces. This screen's
 * own internal gate below is what actually matters: an operator who reaches `/channels/max` some other
 * way without `channel:manage` gets a real, server-enforced refusal, never a form that quietly does
 * nothing.
 */
export const MAX_CHANNEL_PERMISSION = "channel:manage";

/**
 * `25-09`: `/channels/max` - the second of `23-31`'s three reserved "Каналы" places to become a real
 * screen, built the same "one channel end to end" way `23-36` built `TelegramChannelPage` first
 * (`docs/backlog/25-09-*.md`'s own "which channel, and why it went first, is stated rather than
 * assumed"). MAX rather than VK, Email, WhatsApp or Avito: `TelegramChannelPage`'s own doc comment
 * ("Why Telegram, not MAX") already named MAX as the shape closest to Telegram's - operator-only,
 * bot-token-shaped, and (unlike WhatsApp/Avito) still a single-secret connect - and `23-31`'s own nav
 * comment reserved "Бот MAX" as its own named place, distinct from the generic "Другие каналы" catch-all
 * VK/Email/WhatsApp/Avito all still share, which is a standing signal MAX was meant to be the second
 * screen rather than an arbitrary pick.
 *
 * ## This screen is not `TelegramChannelPage` with the labels swapped
 *
 * Copying that screen's live-verification badge here would claim something MAX's backend cannot back
 * up. `TelegramChannelPage` shows `Verified`/`Not responding`/`Could not check just now` because
 * `TelegramChannelEndpoints.HandleStatusAsync` re-asks Telegram's own `getMe` live, on every read
 * (`adr/0143`). `MaxChannelEndpoints.HandleStatusAsync` does not, and cannot: MAX's public API has no
 * cheap, side-effect-free equivalent of `getMe` (that endpoint's own remarks) - its only two
 * credential-shaped calls are `POST /subscriptions` (a write that would re-register the live webhook as
 * a side effect of a tenant merely loading this screen) and the long-polling `GET /updates`
 * `MaxLongPollingService` already owns exclusively (a second caller would race it for the same marker).
 * So this screen renders one honest state - `Connected` means "an active credential row exists", the
 * same, narrower fact Telegram's own status endpoint reported before `23-36`/`adr/0143` gave it a live
 * check - never a green tick implying MAX was just asked and agreed, because on every read after the
 * first, nobody asked it anything.
 *
 * ## What "connected" is actually evidence of, for MAX
 *
 * The one moment MAX is genuinely asked is at connect time, inside `MaxChannelEndpoints.HandleConnectAsync`
 * - when `MaxBotApiOptions.PublicWebhookBaseUrl` is configured (the deployed system, not the local
 * compose loop), a bad or revoked token is refused there via `POST /subscriptions`, rolled back the
 * identical way Telegram's `getMe` rejection is. `connectError` below surfaces that refusal text
 * verbatim, matching `TelegramChannelPage`'s own "show what the provider said" discipline
 * (`connectMaxChannelError` is a fallback only, never overwriting a real `ApiProblemError.message`).
 *
 * ## The token is never rendered back, in either direction
 *
 * Same guarantee as `TelegramChannelPage`: `ConnectMaxChannelResponseDto` carries only an id and a
 * timestamp, and `MaxChannelStatusDto` after that carries only `connected`/`channelCredentialId`/
 * `createdAt`. No response this screen ever parses has a field the typed token could come back through.
 */
export function MaxChannelPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [status, setStatus] = useState<MaxChannelStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [disconnectConfirming, setDisconnectConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const accessToken = user?.access_token;

  const load = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchMaxChannelStatus(accessToken, siteId)
      .then((response) => {
        setStatus(response);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiProblemError ? err.message : strings.maxChannelLoadError));
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(MAX_CHANNEL_PERMISSION)) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(MAX_CHANNEL_PERMISSION)) {
    return <AccessRefusal title={strings.maxChannelTitle} message={strings.maxChannelForbidden} strings={strings} />;
  }

  const attemptConnect = async () => {
    if (!accessToken || !siteId) {
      return;
    }

    setConnecting(true);
    setConnectError(null);
    try {
      await connectMaxChannel(accessToken, siteId, tokenInput);
      setTokenInput("");
      load();
    } catch (err) {
      setConnectError(err instanceof ApiProblemError ? err.message : strings.maxChannelConnectError);
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
      await disconnectMaxChannel(accessToken, siteId, status.channelCredentialId);
      setDisconnectConfirming(false);
      load();
    } catch (err) {
      setDisconnectError(err instanceof ApiProblemError ? err.message : strings.maxChannelDisconnectError);
    } finally {
      setDisconnecting(false);
    }
  };

  const createdAtDate = status?.createdAt ? parseInstant(status.createdAt) : null;

  return (
    <>
      <PageHead title={strings.maxChannelTitle} description={strings.maxChannelDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {status === null ? (
        loadError ? null : (
          <Panel>
            <Skeleton lines={3} label={strings.maxChannelLoadingLabel} />
          </Panel>
        )
      ) : status.connected ? (
        <Panel
          title={strings.maxChannelPanelTitle}
          actions={
            <Button variant="ghost" onClick={() => { setDisconnectError(null); setDisconnectConfirming(true); }}>
              {strings.maxChannelDisconnectButton}
            </Button>
          }
        >
          <div className="ago-stack">
            <Badge tone="success" dot>
              {strings.maxChannelConnectedBadge}
            </Badge>

            {createdAtDate && (
              <p>
                {strings.maxChannelConnectedSinceLabel} {formatDateStamp(createdAtDate, timeZone, strings)}
              </p>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title={strings.maxChannelPanelTitle}>
          <div className="ago-stack">
            <p>{strings.maxChannelNotConnectedBody}</p>

            <Field label={strings.maxChannelTokenFieldLabel} description={strings.maxChannelTokenFieldDescription}>
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

            <div>
              <Button variant="primary" onClick={() => void attemptConnect()} disabled={connecting || tokenInput.trim().length === 0}>
                {connecting ? strings.maxChannelConnectingButton : strings.maxChannelConnectButton}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <Dialog
        open={disconnectConfirming}
        title={strings.maxChannelDisconnectDialogTitle}
        onClose={() => setDisconnectConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisconnectConfirming(false)} disabled={disconnecting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attemptDisconnect()} disabled={disconnecting}>
              {strings.maxChannelDisconnectConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.maxChannelDisconnectDialogBody}</p>
        {disconnectError && <Alert tone="danger">{disconnectError}</Alert>}
      </Dialog>
    </>
  );
}
