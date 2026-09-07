import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  connectTelegramChannel,
  disconnectTelegramChannel,
  fetchTelegramChannelStatus,
  type TelegramChannelStatusDto,
} from "../api/telegramChannelApi.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
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

/** `23-36`: same `channel:manage` gate `Ago.Chat.Api`'s `TelegramChannelEndpoints` actually enforces
 * on all three of its own routes (`RegisterChannelCredentialHandler`/`RevokeChannelCredentialHandler`/
 * `GetChannelCredentialStatusHandler` each check it independently) - this constant names it once,
 * the same `OPERATORS_TEAM_PERMISSION`/`SITE_ERASE_PERMISSION` precedent every other dedicated-
 * permission screen in this codebase already follows. `consoleNav.ts`'s own `buildChannelsItems`
 * gates the whole "Каналы" section on `site:configure` (the `isAdmin` proxy) rather than this
 * permission specifically - a real gap between what the rail hides and what the server enforces, but
 * the same gap every other `isAdmin`-gated screen in that section already has (`WidgetConfigPage`,
 * `InstallSnippetPage`), not one this item introduces. This screen's own internal gate below is what
 * actually matters: an operator who reaches `/channels/telegram` some other way without
 * `channel:manage` gets a real, server-enforced refusal, never a form that quietly does nothing.
 */
export const TELEGRAM_CHANNEL_PERMISSION = "channel:manage";

/**
 * `23-36`: `/channels/telegram` - "a tenant who has a Telegram bot can connect it themselves"
 * (backlog's own Goal), the first of the three reserved places `23-31` drew under "Каналы" to become
 * a real screen. MAX and "Другие каналы" stay reserved - this item builds exactly one channel end to
 * end, the shape its own brief asked for (rule 15: one complete promise beats three half ones).
 *
 * ## Why Telegram, not MAX
 *
 * Both already have a complete, symmetric backend (`Ago.Chat.Api.Channels.MaxChannelEndpoints`/
 * `TelegramChannelEndpoints`, both live-verifying the token at entry via the provider's own API
 * before ever reporting success). Telegram's own connect flow is the simpler of the two - no
 * subscribe-a-webhook step, no `PublicWebhookBaseUrl` branch to reason about client-side - so it is
 * the smaller, more honest "one channel, all the way" to ship first; MAX's own extra step (and its
 * local-compose-has-no-public-endpoint carve-out) is exactly the kind of provider-specific complexity
 * that would have made this the wrong item to also decide MAX's UX in.
 *
 * ## "Connected" means the provider just agreed, not that a flag says so
 *
 * `fetchTelegramChannelStatus` calls a `GET` that itself asks Telegram again, live, every time this
 * screen loads (`TelegramChannelEndpoints.HandleStatusAsync`, `adr/0143`) - never a stored boolean
 * alone. `status.verified` is what actually decides the badge and the message below it; `status.
 * connected` on its own only means a credential row exists. A tenant whose bot was deleted at
 * Telegram's own side sees that here, on this screen, the moment they look - not a green tick that
 * quietly lies, which is the exact failure `23-36`'s own brief opens with.
 *
 * `adr/0143`'s own bound on that live call (5 seconds, server-side) means this screen can also render
 * a third state - `status.unreachable` - distinct from both the verified and the refused cases: the
 * live check itself could not complete (a timeout, or Telegram/this deployment's own outbound relay
 * not answering at all), which says nothing about whether the token is actually good. Rendered as its
 * own neutral badge and its own `Alert`, never folded into the refused case's red "get a new token"
 * message - the two facts call for opposite tenant actions (wait and retry, versus reconnect).
 *
 * ## The token is never rendered back, in either direction
 *
 * The connect form never receives anything back that could be the token - `ConnectTelegramChannelResponseDto`
 * carries only an id and a timestamp, and every status read after that carries only `verified`/
 * `refusalReason`/`checkedAt`. There is no code path on this screen that could echo the value the
 * tenant just typed, because no response this screen ever parses has a field it could come from.
 */
export function TelegramChannelPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [status, setStatus] = useState<TelegramChannelStatusDto | null>(null);
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

    fetchTelegramChannelStatus(accessToken, siteId)
      .then((response) => {
        setStatus(response);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiProblemError ? err.message : strings.telegramChannelLoadError));
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(TELEGRAM_CHANNEL_PERMISSION)) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(TELEGRAM_CHANNEL_PERMISSION)) {
    return <AccessRefusal title={strings.telegramChannelTitle} message={strings.telegramChannelForbidden} strings={strings} />;
  }

  const attemptConnect = async () => {
    if (!accessToken || !siteId) {
      return;
    }

    setConnecting(true);
    setConnectError(null);
    try {
      await connectTelegramChannel(accessToken, siteId, tokenInput);
      setTokenInput("");
      load();
    } catch (err) {
      setConnectError(err instanceof ApiProblemError ? err.message : strings.telegramChannelConnectError);
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
      await disconnectTelegramChannel(accessToken, siteId, status.channelCredentialId);
      setDisconnectConfirming(false);
      load();
    } catch (err) {
      setDisconnectError(err instanceof ApiProblemError ? err.message : strings.telegramChannelDisconnectError);
    } finally {
      setDisconnecting(false);
    }
  };

  const createdAtDate = status?.createdAt ? parseInstant(status.createdAt) : null;
  const checkedAtDate = status?.checkedAt ? parseInstant(status.checkedAt) : null;

  return (
    <>
      <PageHead title={strings.telegramChannelTitle} description={strings.telegramChannelDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {status === null ? (
        loadError ? null : (
          <Panel>
            <Skeleton lines={3} label={strings.telegramChannelLoadingLabel} />
          </Panel>
        )
      ) : status.connected ? (
        <Panel
          title={strings.telegramChannelPanelTitle}
          actions={
            <Button variant="ghost" onClick={() => { setDisconnectError(null); setDisconnectConfirming(true); }}>
              {strings.telegramChannelDisconnectButton}
            </Button>
          }
        >
          <div className="ago-stack">
            {status.unreachable ? (
              <Badge tone="neutral" dot>
                {strings.telegramChannelUnreachableBadge}
              </Badge>
            ) : status.verified ? (
              <Badge tone="success" dot>
                {strings.telegramChannelVerifiedBadge}
              </Badge>
            ) : (
              <Badge tone="danger" dot>
                {strings.telegramChannelUnverifiedBadge}
              </Badge>
            )}

            {createdAtDate && (
              <p>
                {strings.telegramChannelConnectedSinceLabel} {formatDateStamp(createdAtDate, timeZone, strings)}
              </p>
            )}

            {/* `adr/0143`: unreachable and refused are two different facts, rendered as two different
                Alerts - a tenant acts on "try again in a moment" and "get a new token" differently, so
                the two must never share one message. */}
            {status.unreachable ? (
              <Alert tone="info" title={strings.telegramChannelUnreachableBadge}>
                {strings.telegramChannelUnreachableBody}
              </Alert>
            ) : (
              !status.verified &&
              status.refusalReason && (
                <Alert tone="danger" title={strings.telegramChannelUnverifiedBadge}>
                  {strings.telegramChannelUnverifiedBody} {status.refusalReason}
                </Alert>
              )
            )}

            {checkedAtDate && (
              <p className="ago-muted">
                {strings.telegramChannelCheckedAtLabel} {formatAbsolute(checkedAtDate, timeZone, strings)}
              </p>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title={strings.telegramChannelPanelTitle}>
          <div className="ago-stack">
            <p>{strings.telegramChannelNotConnectedBody}</p>

            <Field label={strings.telegramChannelTokenFieldLabel} description={strings.telegramChannelTokenFieldDescription}>
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
                {connecting ? strings.telegramChannelConnectingButton : strings.telegramChannelConnectButton}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <Dialog
        open={disconnectConfirming}
        title={strings.telegramChannelDisconnectDialogTitle}
        onClose={() => setDisconnectConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisconnectConfirming(false)} disabled={disconnecting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void attemptDisconnect()} disabled={disconnecting}>
              {strings.telegramChannelDisconnectConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.telegramChannelDisconnectDialogBody}</p>
        {disconnectError && <Alert tone="danger">{disconnectError}</Alert>}
      </Dialog>
    </>
  );
}
