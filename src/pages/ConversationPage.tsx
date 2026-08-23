import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import { NotConnectedError, SendOutcomeUnknownError } from "../realtime/operatorConnection.js";
import { newClientMessageId } from "../realtime/protocol/dedup.js";
import type { MessageDto } from "../realtime/protocol/types.js";
import {
  confirmAttachment,
  createAttachment,
  deleteAttachment,
  getAttachmentDownload,
  uploadToPresignedUrl,
  type AttachmentDownloadResponse,
} from "../api/attachmentsApi.js";

const PRESENCE_POLL_INTERVAL_MS = 10_000;
const HISTORY_PAGE_SIZE = 50;

interface FailedSend {
  clientMessageId: string;
  body: string;
  attachmentId: string | null;
}

interface PendingAttachment {
  attachmentId: string;
  fileName: string;
}

/** One attachment's fetched download info, or a marker for a state that has no info to fetch -
 * `"loading"` while the `GET /api/v1/attachments/{id}` call is in flight, `"deleted"` once this
 * console's own delete action removed it (no point re-fetching - the server would now return
 * `Attachment.NotReady`), `"error"` for anything else that went wrong. */
type AttachmentDetail = AttachmentDownloadResponse | "loading" | "deleted" | "error";

/**
 * `5-07`: the conversation view - message thread, send box, keyset history paging, visitor presence.
 * Joining calls `OperatorConnection.joinConversation`, which invokes `JoinConversationAsync` - safe
 * to call here because the only way to reach this page is via a `Link` from `QueuePage`'s
 * "Assigned to me" list (never "Waiting"), so the conversation is already assigned to this operator
 * and the call is the documented same-operator no-op, not a claim (`OperatorConnection`'s own doc
 * comment has the detail).
 *
 * `5-08`: adds attachment upload (with real progress from the PUT itself), inline thumbnail preview,
 * download, and a permission-gated delete action - the ordinary conversation view's own closeout from
 * `authorization.md`'s Stage 5 console notes, layered onto the same message thread rather than a
 * separate view. Never renders a downloaded attachment as trusted same-origin content
 * (`file-storage.md`'s "Validation and safety" section): a thumbnail is a real generated image safe
 * to `<img>` inline, but the full-file download always goes through a plain link to the presigned URL
 * - a different origin (MinIO/S3) than the console itself, so even a malicious upload can only ever
 * render in *that* origin's own tab, never this one's.
 */
export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { connection, connectionState } = useOperatorConnection();
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [failedSend, setFailedSend] = useState<FailedSend | null>(null);
  const [visitorOnline, setVisitorOnline] = useState<boolean | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentDetails, setAttachmentDetails] = useState<Record<string, AttachmentDetail>>({});
  const joinedConversationId = useRef<string | null>(null);
  const requestedAttachmentIds = useRef<Set<string>>(new Set());

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
    async (body: string, clientMessageId: string, attachmentId: string | null) => {
      if (!conversationId) {
        return;
      }

      try {
        await connection.sendMessage(conversationId, body, clientMessageId, attachmentId);
        setFailedSend(null);
      } catch (err) {
        if (err instanceof SendOutcomeUnknownError) {
          // Retry-safe with the *same* clientMessageId - server-side dedup (5-07's own ago-chat
          // addition) guarantees this cannot land twice even if the original send actually went
          // through and only the ack was lost. `attachmentId` carries over unchanged - the
          // attachment itself stays `Ready` (unlinked) until a send actually lands, so retrying with
          // the same id is exactly as safe as retrying the body text.
          setFailedSend({ clientMessageId, body, attachmentId });
        } else if (err instanceof NotConnectedError) {
          // Nothing was sent at all - safe to retry with a fresh id once reconnected.
          setFailedSend({ clientMessageId: newClientMessageId(), body, attachmentId });
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
    // An attachment always rides with a caption, never sent body-less - MessageBody
    // (`Ago.Chat.Domain`) rejects an empty/whitespace-only body regardless of whether a message
    // carries an attachment, and this item does not touch that domain rule to add an exception.
    if (!body) {
      return;
    }
    const attachmentId = pendingAttachment?.attachmentId ?? null;
    setDraft("");
    setPendingAttachment(null);
    void send(body, newClientMessageId(), attachmentId);
  };

  const handleRetry = () => {
    if (!failedSend) {
      return;
    }
    void send(failedSend.body, failedSend.clientMessageId, failedSend.attachmentId);
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !conversationId || !user?.access_token) {
      return;
    }

    const accessToken = user.access_token;
    setUploadError(null);
    setPendingAttachment(null);
    setUploadProgress({ fileName: file.name, percent: 0 });

    try {
      const created = await createAttachment(accessToken, conversationId, file.type, file.size);
      await uploadToPresignedUrl(created.uploadUrl, file, (percent) => setUploadProgress({ fileName: file.name, percent }));
      await confirmAttachment(accessToken, created.attachmentId);
      setPendingAttachment({ attachmentId: created.attachmentId, fileName: file.name });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!user?.access_token) {
      return;
    }

    try {
      await deleteAttachment(user.access_token, attachmentId);
      setAttachmentDetails((prev) => ({ ...prev, [attachmentId]: "deleted" }));
    } catch (err) {
      console.error("Failed to delete attachment", err);
    }
  };

  // Lazily fetches download info (the presigned URL, content type, thumbnail URL) for any message's
  // attachment not already known - `requestedAttachmentIds` (a ref, not state) is what keeps this
  // from re-fetching an id it has already asked for, without needing `attachmentDetails` itself in
  // the dependency array (which would re-run this effect on every fetch's own result).
  useEffect(() => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    for (const message of messages) {
      const attachmentId = message.attachmentId;
      if (!attachmentId || requestedAttachmentIds.current.has(attachmentId)) {
        continue;
      }

      requestedAttachmentIds.current.add(attachmentId);
      setAttachmentDetails((prev) => ({ ...prev, [attachmentId]: "loading" }));
      getAttachmentDownload(accessToken, attachmentId)
        .then((info) => setAttachmentDetails((prev) => ({ ...prev, [attachmentId]: info })))
        .catch(() => setAttachmentDetails((prev) => ({ ...prev, [attachmentId]: "error" })));
    }
  }, [messages, user?.access_token]);

  const renderAttachment = (attachmentId: string) => {
    const detail = attachmentDetails[attachmentId];

    if (detail === undefined || detail === "loading") {
      return <span> (loading attachment…)</span>;
    }

    if (detail === "deleted") {
      return <span> (attachment deleted)</span>;
    }

    if (detail === "error") {
      return <span role="alert"> (attachment unavailable)</span>;
    }

    return (
      <span>
        {" "}
        {detail.thumbnailUrl ? (
          // A real generated thumbnail (5-04) - the one case safe to render inline, unlike the raw
          // download below (this component's own doc comment has the reasoning).
          <a href={detail.url} target="_blank" rel="noopener noreferrer">
            <img src={detail.thumbnailUrl} alt="Attachment thumbnail" style={{ maxWidth: 120, maxHeight: 120, verticalAlign: "middle" }} />
          </a>
        ) : (
          <a href={detail.url} target="_blank" rel="noopener noreferrer">
            Download attachment ({detail.contentType})
          </a>
        )}{" "}
        {hasPermission("attachment:delete") && (
          <button type="button" onClick={() => void handleDeleteAttachment(attachmentId)}>
            Delete attachment
          </button>
        )}
      </span>
    );
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
            {m.attachmentId && renderAttachment(m.attachmentId)}
          </li>
        ))}
      </ul>

      {failedSend && (
        <p role="alert">
          Send failed or is unconfirmed: "{failedSend.body}" - <button onClick={handleRetry}>Retry</button>
        </p>
      )}

      <div>
        <label>
          Attach a file: <input type="file" onChange={(e) => void handleFileSelected(e)} disabled={uploadProgress !== null} />
        </label>
        {uploadProgress && (
          <p>
            Uploading {uploadProgress.fileName}: {uploadProgress.percent}%
          </p>
        )}
        {uploadError && <p role="alert">{uploadError}</p>}
        {pendingAttachment && (
          <p>
            Ready to send: {pendingAttachment.fileName}{" "}
            <button type="button" onClick={() => setPendingAttachment(null)}>
              Remove
            </button>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
