import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import type { ConnectionState } from "../realtime/operatorConnection.js";
import { newClientMessageId } from "../realtime/protocol/dedup.js";
import type { TeamMessageDto } from "../realtime/protocol/types.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";
import { RemoveTeamMessageButton } from "./RemoveTeamMessageButton.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatClockTime, resolveTimeZone } from "../time/format.js";

const HISTORY_PAGE_SIZE = 50;

/** `23-33`: the account owner's own capability, reused from the exact permission
 * `SendTeamMessageHandler` already checks to decide the admin label (`ago-chat`'s own remarks state
 * why this codebase treats `site:manage_operators` as the precise definition of "the account owner"
 * rather than minting a dedicated permission) - the same per-page-constant precedent
 * `OperatorsTeamPage.OPERATORS_TEAM_PERMISSION` establishes. */
const TEAM_MESSAGE_REMOVE_PERMISSION = "site:manage_operators";

/**
 * `23-32`: `/team/chat` - "people working the same queue can talk to each other without leaving the
 * console" (the backlog item's own Goal). One room per tenant, every operator in it unconditionally
 * (`consoleNav.ts#buildTeamItems`'s own remarks - this screen carries no permission gate, unlike
 * almost every other screen in "Администрирование"/"Каналы"), the account's admin(s) labelled.
 *
 * ## Why this is not `Thread`/`Composer`
 *
 * Those two components are built for a conversation: two sides (`MessageDto.authorKind`), an
 * attachment flow, a slash-command canned-response palette, a "load older" keyset cursor tied to a
 * search highlight. A team room has none of that - one kind of author (always an operator), no
 * attachments, no per-message actions - so reusing them would mean threading a conversation-shaped
 * prop contract through a screen that has nothing conversation-shaped to offer it. This page is its
 * own small, self-contained implementation instead: a history load, a live push listener, and a
 * composer, in well under a tenth of `ConversationPage`'s own size.
 *
 * ## No left/right side
 *
 * Every message renders identically regardless of who sent it - there is no "my own messages on the
 * right" the way `Thread` draws for the operator's own side of a conversation, because this console
 * has no route to the caller's own operator id to compare against (`usePermissions()` carries
 * permissions and the active site, not an operator id) and the backlog item names no requirement for
 * one. The one distinction this screen *does* draw - the admin badge - is the one the item actually
 * asks for.
 *
 * ## The initial load waits for `connectionState === "connected"`, and that is load-bearing
 *
 * `OperatorConnectionProvider` starts every session in `"connecting"` and mounts every route beneath
 * it - this page included - immediately, before the first `connection.start()` even resolves. A first
 * cut of this page called `connection.getTeamHistory` unconditionally on mount and crashed with
 * `OperatorConnection`'s own "no connection has been started yet" the instant a reload landed
 * directly on `/team/chat` - a fake connection in a component test never catches this, because a fake
 * has no connection lifecycle to be caught not having started; the ux-gate's real hub handshake did,
 * the first time this screen was added to it. See the effect below for the fix.
 *
 * ## Reconnect catch-up, and why it lives here rather than in `OperatorConnection`
 *
 * A conversation's resume protocol (`OperatorConnection`'s own `subscribedConversationId`/
 * `sequenceTracker`) exists because a hub reconnect gives a fresh connection none of the previous
 * one's server-side state, and there is a specific conversation to re-join. A team room has no
 * "join" at all - `OperatorHub.SendTeamMessageAsync`/`GetTeamHistoryAsync` are reachable the moment
 * the connection authenticates, with nothing analogous to `JoinConversationAsync` to replay - so the
 * only gap a reconnect can open is "a `TeamMessageReceived` push sent while this socket was down",
 * and this page already knows the last sequence it rendered. The same `connectionState`-gated effect
 * that fixes the initial-load race above also closes this gap (asking for `getTeamDelta` after that
 * sequence once the socket comes back), without adding a second subscription record to a shared class
 * that has no other reason to know this room exists.
 */
export function TeamChatPage() {
  const { connection, connectionState } = useOperatorConnection();
  const { hasPermission } = usePermissions();
  const canRemove = hasPermission(TEAM_MESSAGE_REMOVE_PERMISSION);
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [messages, setMessages] = useState<TeamMessageDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const lastSequenceRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  // `23-32`: the combined load/reconnect effect's own memory of the *previous* render's connection
  // state - `null` until that effect has run once, which is what tells "this is the very first time
  // this page has ever seen a connected socket" apart from "this is a later reconnect" (see that
  // effect's own remarks).
  const previousConnectionStateRef = useRef<ConnectionState | null>(null);

  const appendIncoming = useCallback((dto: TeamMessageDto) => {
    setMessages((current) => {
      if (current === null) {
        return current;
      }
      if (current.some((existing) => existing.id === dto.id)) {
        return current;
      }
      return [...current, dto].sort((a, b) => a.sequence - b.sequence);
    });
    lastSequenceRef.current = Math.max(lastSequenceRef.current, dto.sequence);
  }, []);

  useEffect(() => {
    connection.onTeamMessage(appendIncoming);
  }, [connection, appendIncoming]);

  /** `23-33`: updates the message already on screen by `id` - never appended, and deliberately not
   * routed through `appendIncoming`'s own "already seen, skip" dedup above (that logic exists for a
   * *new* post's local echo against its fan-out copy; a removal names an id already rendered once and
   * must always take effect - `operatorConnection.ts`'s own `teamMessageRemovedListener` remarks). A
   * removal for a message this page has not loaded yet (older than the current page, or from before
   * this page's first history load) is silently ignored - there is no row on screen for it to
   * update, and the next `getTeamHistory`/`getTeamDelta` call will simply return it already redacted. */
  const applyRemoval = useCallback((removed: TeamMessageDto) => {
    setMessages((current) => {
      if (current === null) {
        return current;
      }
      if (!current.some((existing) => existing.id === removed.id)) {
        return current;
      }
      return current.map((existing) => (existing.id === removed.id ? removed : existing));
    });
  }, []);

  useEffect(() => {
    connection.onTeamMessageRemoved(applyRemoval);
  }, [connection, applyRemoval]);

  const loadHistory = useCallback(async () => {
    setLoadError(null);
    try {
      const page = await connection.getTeamHistory(null, HISTORY_PAGE_SIZE);
      const ordered = [...page.messages].reverse();
      setMessages(ordered);
      lastSequenceRef.current = ordered.length > 0 ? ordered[ordered.length - 1].sequence : 0;
    } catch {
      setLoadError(strings.teamChatLoadError);
    }
  }, [connection, strings]);

  /**
   * The one effect that both loads the room and catches it up again after a real reconnect -
   * deliberately not two separate effects (an unconditional "on mount" load plus a
   * `connectionState`-gated catch-up), because the two are the same underlying bug otherwise:
   * `OperatorConnectionProvider` starts every session in `"connecting"`, and every route beneath it
   * - this page included - mounts immediately, before the first `connection.start()` even resolves
   * (`OperatorConnectionProvider.tsx`'s own state machine). `OperatorConnection.getTeamHistory` calls
   * `requireConnection()`, which throws "no connection has been started yet" on a `HubConnection`
   * that has never connected once - a real crash the ux-gate's own `team-chat` screen caught the
   * first time this page shipped, precisely because that gate drives a real hub handshake where a
   * hand-written fake connection in a component test does not.
   *
   * So the load itself waits for `connectionState === "connected"` the same way the catch-up does,
   * and the two share one `previousConnectionStateRef`: `null` (the very first run) or `messages`
   * still `null` means "this is the first time this page has had a live socket, do the bounded
   * keyset load"; any later transition into `"connected"` means "the socket was down and came back,
   * ask for what was missed instead."
   */
  useEffect(() => {
    const previous = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;

    if (connectionState !== "connected") {
      return;
    }

    if (messages === null) {
      // `23-100`: suppressed here rather than rewritten. `react-hooks/set-state-in-effect` is new in the
      // plugin's v7, which folded the React Compiler's own analyzer in; it follows the call below and sees a
      // `setState` reachable from an effect body. It is right about the shape and wrong about the defect:
      // fetching in an effect is what React's own documentation prescribes until a framework or Suspense
      // removes the need, and every `setState` reached from here runs after an `await`, never synchronously
      // in the effect body. Rewriting the call to satisfy the analyzer would answer "when should this
      // request happen" by accident rather than by decision.
      //
      // Per-line, replacing the file-scoped override `23-96` left: that one downgraded the rule for the
      // whole file, so a genuinely synchronous `setState` written here tomorrow was also only a warning.
      // This marks the one site that is deliberate and leaves the rest of the file an error again.
      //
      // Loads history on mount and catches up after a reconnect from the same effect. This file's own remarks explain why those two are one effect and not two.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadHistory();
      return;
    }

    if (previous === "connected") {
      // Already connected and already loaded - this re-run is only `messages` changing (a live push
      // arrived), not a reconnect.
      return;
    }

    void connection
      .getTeamDelta(lastSequenceRef.current)
      .then((page) => {
        for (const message of page.messages) {
          appendIncoming(message);
        }
      })
      .catch(() => {
        // Best-effort: a live push, or the next reconnect's own catch-up, will still arrive. Nothing
        // here is worth a second error banner stacked over `loadError`.
      });
  }, [connectionState, connection, appendIncoming, messages, loadHistory]);

  useEffect(() => {
    // `testing/dom.ts`'s own precedent for `scrollIntoView`: jsdom implements no layout, so this
    // guard is what keeps a component test from throwing on an API real browsers always have -
    // whether the room really scrolls is a layout question for live verification, not a DOM with no
    // viewport.
    if (typeof listRef.current?.scrollTo === "function") {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = body.trim();
    if (trimmed.length === 0 || sending) {
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      await connection.sendTeamMessage(trimmed, newClientMessageId());
      setBody("");
    } catch {
      // `NotConnectedError` and `SendOutcomeUnknownError` both resolve to the identical action here -
      // "try again" - unlike `ConversationPage`'s own composer, which remembers a failed send's
      // `clientMessageId` for an exact retry against the same text. That refinement is real and this
      // screen deliberately does not build it: `body` is left exactly as the operator typed it on
      // any failure (only success clears it below), so a plain retry click already resends the same
      // text with no re-typing needed - the missing piece is only reusing the same `clientMessageId`
      // on that retry, which `TeamChatRepository`'s server-side dedup makes safe to skip: a second,
      // different `clientMessageId` for the identical body simply posts a second real message if the
      // first one actually landed, rather than silently duplicating one already delivered.
      setSendError(strings.teamChatSendError);
    } finally {
      setSending(false);
    }
  }, [body, sending, connection, strings]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // The same Enter-sends/Shift+Enter-newline/no-send-mid-IME-composition convention `Composer.tsx`
    // establishes for the ordinary conversation composer - see its own doc comment for why each of
    // the three rules exists.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="ago-stack">
      <PageHead title={strings.teamChatTitle} description={strings.teamChatDescription} />
      <Panel>
        {messages === null && loadError === null && <Spinner label={strings.teamChatLoadingLabel} />}
        {loadError !== null && (
          <Alert
            tone="danger"
            action={
              <Button onClick={() => void loadHistory()}>{strings.teamChatRetryButton}</Button>
            }
          >
            {loadError}
          </Alert>
        )}
        {messages !== null && (
          <div className="ago-team-chat__list" ref={listRef}>
            {messages.length === 0 && <p>{strings.teamChatEmptyState}</p>}
            {messages.map((message) => (
              <div className="ago-team-message" key={message.id}>
                <div className="ago-row ago-row--tight">
                  <span className="ago-team-message__author">
                    {message.authorDisplayName ?? strings.teamChatUnnamedAuthor}
                  </span>
                  {message.authorIsAdmin && <Badge tone="brand">{strings.teamChatAdminBadge}</Badge>}
                  <span className="ago-team-message__time ago-mono">
                    {formatClockTime(new Date(message.createdAt), timeZone, strings)}
                  </span>
                  {/* `23-33`: hidden once already removed - nothing left to remove, the same
                      "tolerate already-gone" idempotency RemoveTeamMessageHandler's own server-side
                      check gives a retry; there is simply no button to retry from here. */}
                  {canRemove && !message.removedAt && (
                    <RemoveTeamMessageButton onRemove={() => connection.removeTeamMessage(message.id)} />
                  )}
                </div>
                <p className="ago-team-message__body">
                  {message.removedAt ? <em>{strings.teamChatRemovedPlaceholder}</em> : message.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        {sendError !== null && <Alert tone="danger">{sendError}</Alert>}
        <div className="ago-row ago-row--align-end">
          <textarea
            className="ago-control ago-control--textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={strings.teamChatComposerPlaceholder}
            disabled={sending}
            rows={2}
          />
          <Button
            variant="primary"
            onClick={() => void handleSend()}
            disabled={sending || body.trim().length === 0}
          >
            {sending ? strings.teamChatSendingButton : strings.teamChatSendButton}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
