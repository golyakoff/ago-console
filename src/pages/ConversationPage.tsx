import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import { NotConnectedError, SendOutcomeUnknownError } from "../realtime/operatorConnection.js";
import { newClientMessageId } from "../realtime/protocol/dedup.js";
import type { MessageDto } from "../realtime/protocol/types.js";

const PRESENCE_POLL_INTERVAL_MS = 10_000;
const HISTORY_PAGE_SIZE = 50;

interface FailedSend {
  clientMessageId: string;
  body: string;
}

/**
 * `5-07`: the conversation view - message thread, send box, keyset history paging, visitor presence.
 * Joining calls `OperatorConnection.joinConversation`, which invokes `JoinConversationAsync` - safe
 * to call here because the only way to reach this page is via a `Link` from `QueuePage`'s
 * "Assigned to me" list (never "Waiting"), so the conversation is already assigned to this operator
 * and the call is the documented same-operator no-op, not a claim (`OperatorConnection`'s own doc
 * comment has the detail).
 */
export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { connection, connectionState } = useOperatorConnection();
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [failedSend, setFailedSend] = useState<FailedSend | null>(null);
  const [visitorOnline, setVisitorOnline] = useState<boolean | null>(null);
  const joinedConversationId = useRef<string | null>(null);

  // Resets which conversation has been joined whenever the route param itself changes - not on
  // every `connectionState` flicker, which is what the effect below depends on (see its own
  // comment for why joining must wait for "connected" but must not re-join on every reconnect).
  useEffect(() => {
    joinedConversationId.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    // `OperatorConnectionProvider` starts the shared connection asynchronously (a real WebSocket
    // handshake); this page can mount before that handshake finishes, e.g. a direct deep link to
    // `/conversations/:id` or a hard reload while already on one - found live, manually verifying
    // this item: `JoinConversationAsync` threw "Cannot send data if the connection is not in the
    // 'Connected' State" every time, because `@microsoft/signalr`'s `invoke` does not queue behind
    // a not-yet-connected `HubConnection`, it rejects immediately. Waiting for `connectionState ===
    // "connected"` here is the fix; `joinedConversationId` is what stops this same effect from
    // re-running the *initial* join (discarding already-loaded messages) every time connection
    // state cycles back to "connected" after a reconnect - `OperatorConnection`'s own
    // `resumeAfterReconnect` already resumes that case internally via the exact same underlying
    // hub call, just with `lastKnownSequence` set.
    if (connectionState !== "connected" || joinedConversationId.current === conversationId) {
      return;
    }

    joinedConversationId.current = conversationId;
    let cancelled = false;
    setMessages([]);
    setNextBeforeSequence(null);
    setFailedSend(null);

    connection.onMessage((message) => {
      if (cancelled) {
        return;
      }
      setMessages((prev) => [...prev, message]);
    });

    connection
      .joinConversation(conversationId)
      .then((page) => {
        if (cancelled) {
          return;
        }
        // `JoinConversationAsync`'s fresh-join page is newest-first, same convention as
        // `GetHistoryAsync` (`ConversationHistoryPage`'s own doc comment) - reversed once here so
        // the rest of this component can simply append.
        setMessages([...page.messages].reverse());
        setNextBeforeSequence(page.nextBeforeSequence);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          joinedConversationId.current = null;
          console.error("Failed to join conversation", err);
        }
      });

    return () => {
      cancelled = true;
      connection.leaveConversation();
    };
  }, [connection, conversationId, connectionState]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const checkPresence = () =>
      connection
        .getVisitorPresence(conversationId)
        .then(setVisitorOnline)
        .catch(() => setVisitorOnline(null));

    void checkPresence();
    const interval = setInterval(() => void checkPresence(), PRESENCE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [connection, conversationId]);

  const send = useCallback(
    async (body: string, clientMessageId: string) => {
      if (!conversationId) {
        return;
      }

      try {
        await connection.sendMessage(conversationId, body, clientMessageId);
        setFailedSend(null);
      } catch (err) {
        if (err instanceof SendOutcomeUnknownError) {
          // Retry-safe with the *same* clientMessageId - server-side dedup (5-07's own ago-chat
          // addition) guarantees this cannot land twice even if the original send actually went
          // through and only the ack was lost.
          setFailedSend({ clientMessageId, body });
        } else if (err instanceof NotConnectedError) {
          // Nothing was sent at all - safe to retry with a fresh id once reconnected.
          setFailedSend({ clientMessageId: newClientMessageId(), body });
        } else {
          throw err;
        }
      }
    },
    [connection, conversationId],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }
    setDraft("");
    void send(body, newClientMessageId());
  };

  const handleRetry = () => {
    if (!failedSend) {
      return;
    }
    void send(failedSend.body, failedSend.clientMessageId);
  };

  const loadOlder = async () => {
    if (!conversationId || nextBeforeSequence === null || loadingOlder) {
      return;
    }

    setLoadingOlder(true);
    try {
      const page = await connection.loadOlderHistory(conversationId, nextBeforeSequence, HISTORY_PAGE_SIZE);
      setMessages((prev) => [...[...page.messages].reverse(), ...prev]);
      setNextBeforeSequence(page.nextBeforeSequence);
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div>
      <p>
        Operator hub: {connectionState} - Visitor:{" "}
        {visitorOnline === null ? "unknown" : visitorOnline ? "online" : "offline"}
      </p>

      {nextBeforeSequence !== null && (
        <button onClick={() => void loadOlder()} disabled={loadingOlder}>
          {loadingOlder ? "Loading…" : "Load older messages"}
        </button>
      )}

      <ul aria-label="Message thread">
        {messages.map((m) => (
          <li key={m.id}>
            [{m.sequence}] {m.authorKind}: {m.body}
          </li>
        ))}
      </ul>

      {failedSend && (
        <p role="alert">
          Send failed or is unconfirmed: "{failedSend.body}" - <button onClick={handleRetry}>Retry</button>
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
