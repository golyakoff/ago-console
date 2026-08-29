import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import { closeConversation, fetchVisitorHistory } from "../api/conversationsApi.js";
import type { VisitorHistoryResponse } from "../realtime/protocol/types.js";
import { CloseConversationButton } from "../workspace/CloseConversationButton.js";
import { Composer } from "../workspace/Composer.js";
import { Thread } from "../workspace/Thread.js";
import { VisitorPanel } from "../workspace/VisitorPanel.js";
import { useWorkspace } from "../workspace/workspaceContext.js";

const PRESENCE_POLL_INTERVAL_MS = 10_000;
const HISTORY_PAGE_SIZE = 50;

/** `18-01`: how many `loadOlderHistory` hops `locateSequence` below will take looking for a search
 * hit's own message before giving up. A hard stop, not an unbounded loop - the ordinary case (a
 * search hit inside a normal-length conversation) resolves in one or two hops, and this guards
 * against a pathological one (a stale hit whose `sequence` no longer exists in this conversation at
 * all) turning into thousands of requests instead of a bounded, honest "could not find it". 40 hops
 * of `HISTORY_PAGE_SIZE` each is 2,000 messages - an operational ceiling, not a measurement
 * (`CLAUDE.md`'s ban on invented figures applies to claims about *performance*, not to a defensive
 * loop bound with no traffic to measure against). */
const MAX_LOCATE_HOPS = 40;

/** `5-15`: how long the newest sequence has to hold still before the conversation is marked read.
 * Not zero: during a rapid exchange every arriving message would otherwise be its own request, and
 * marking read one message later is invisible to the operator while a request per message is not.
 * Not seconds either - an operator who opens a conversation and immediately switches away should
 * still have cleared it. */
const MARK_READ_DEBOUNCE_MS = 500;

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
 * to call here because the only way to reach this page is via a link from the workspace's
 * "Assigned to me" list (never "Waiting"), so the conversation is already assigned to this operator
 * and the call is the documented same-operator no-op, not a claim (`OperatorConnection`'s own doc
 * comment has the detail).
 *
 * `5-08`: adds attachment upload (with real progress from the PUT itself), inline thumbnail preview,
 * download, and a permission-gated delete action. Never renders a downloaded attachment as trusted
 * same-origin content (`file-storage.md`'s "Validation and safety" section): a thumbnail is a real
 * generated image safe to `<img>` inline, but the full-file download always goes through a plain link
 * to the presigned URL - a different origin (MinIO/S3) than the console itself, so even a malicious
 * upload can only ever render in *that* origin's own tab, never this one's.
 *
 * `11-05` restyled it and changed nothing it does.
 *
 * ## What `11-06` changes, and what it deliberately does not
 *
 * This is no longer a page: it is the middle and right regions of the workspace
 * (`WorkspaceLayout`), returned as a fragment so both land in their own grid areas. The route is
 * unchanged - `/conversations/:id` is still real, still linkable, still reloadable - and so is every
 * piece of protocol behaviour below it: the deferred join that waits for `connected`, the
 * `joinedConversationId` guard against re-joining on each reconnect, `loadOlderHistory`'s keyset
 * paging, the `SendOutcomeUnknownError`/`NotConnectedError` split and the retry rule that goes with
 * it (same `clientMessageId` when the outcome is unknown, a fresh one when nothing was sent), and
 * `5-08`'s create -> presigned PUT -> confirm upload sequence, which is called from the composer now
 * but is otherwise untouched.
 *
 * Three things did change, all of them the item's own scope:
 *
 * - **Rendering moved out.** The thread is `Thread` (grouping, day separators, timestamps) and the
 *   send box is `Composer` (multiline, Enter/Shift+Enter, drag-and-drop and paste). This file keeps
 *   the state and the protocol; those two own the presentation.
 * - **The composer's contract.** Enter now sends from a `<textarea>` rather than submitting a
 *   `<form>` - there is no `<form>` any more, so the "an untyped button inside a form submits it"
 *   trap `Button` guards against does not arise here at all.
 * - **The visitor readout became a panel** rather than two badges beside a page title, and it says
 *   out loud how little the platform actually knows (`VisitorPanel`).
 */
export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { hasPermission, siteId } = usePermissions();
  const strings = useStrings();
  const { connection, connectionState } = useOperatorConnection();
  const { conversation, now, timeZone, refreshQueue, markRead, composerRef } = useWorkspace();
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [failedSend, setFailedSend] = useState<FailedSend | null>(null);
  const [visitorOnline, setVisitorOnline] = useState<boolean | null>(null);
  const [visitorHistory, setVisitorHistory] = useState<VisitorHistoryResponse | null>(null);
  const [visitorHistoryError, setVisitorHistoryError] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentDetails, setAttachmentDetails] = useState<Record<string, AttachmentDetail>>({});
  /**
   * `11-09`: this tab closed this conversation.
   *
   * Local state rather than something read off `conversation.state`, and that is forced rather than
   * chosen: a closed conversation leaves the operator queue entirely (`GetAssignedToOperatorAsync`
   * filters on `State == Assigned`), so `useWorkspace().conversation` goes to `null` the moment the
   * rail refreshes. The server's own view can therefore only say "no longer here", which renders as
   * a thread with no title and a live composer - the two things this flag exists to prevent. It is
   * reset by the route effect below, so it never survives into a different conversation.
   */
  const [closed, setClosed] = useState(false);
  /**
   * `18-01`: set when this conversation's own join failed outright - see `searchConversations`'s own
   * doc comment for why the console cannot reliably tell "assigned to someone else" apart from
   * "closed" apart from a dropped connection (`HubException` carries only a string, no error code).
   * Before this item, a join failure logged to the console and left an empty thread with a live
   * composer on screen - a pre-existing gap this item's own `?at=` navigation makes routine rather
   * than rare (most site-wide search hits are *not* the searching operator's own conversation, so
   * their join is expected to fail - `searchConversations`'s doc comment), which is what makes fixing
   * it in the same change the honest choice rather than scope creep.
   */
  const [joinError, setJoinError] = useState<string | null>(null);
  /** `18-01`: the search hit's own `sequence`, from `?at=` - `null` for every conversation opened the
   * ordinary way. Kept even after the target message is found (not cleared once located): the
   * highlight itself is a one-shot CSS animation (`workspace.css`), so leaving this set costs nothing
   * and re-deriving "have we already scrolled" would only duplicate `Thread`'s own guard. */
  const [highlightSequence, setHighlightSequence] = useState<number | null>(null);
  const [locatingMessage, setLocatingMessage] = useState(false);
  const joinedConversationId = useRef<string | null>(null);
  const requestedAttachmentIds = useRef<Set<string>>(new Set());

  // Resets which conversation has been joined whenever the route param itself changes - not on
  // every `connectionState` flicker, which is what the effect below depends on (see its own
  // comment for why joining must wait for "connected" but must not re-join on every reconnect).
  // `11-06` makes this reachable far more often than `5-07` could: switching conversations is now a
  // click in the rail rather than a full page navigation, so the same component instance is reused.
  useEffect(() => {
    joinedConversationId.current = null;
    setDraft("");
    setPendingAttachment(null);
    setUploadError(null);
    setVisitorOnline(null);
    setVisitorHistory(null);
    setVisitorHistoryError(null);
    setClosed(false);
    setJoinError(null);
    setHighlightSequence(null);
    setLocatingMessage(false);
  }, [conversationId]);

  /**
   * `18-01`: paging backward looking for a search hit's own message, when it was not already on the
   * freshly-joined page - `JoinConversationAsync`'s own fresh-join page is always the newest
   * `HISTORY_PAGE_SIZE`, unconditionally (`OperatorHub.cs`), so an older hit needs exactly the same
   * `loadOlderHistory` walk the manual "Load older messages" button already does, just automatic and
   * bounded (`MAX_LOCATE_HOPS`) rather than one click at a time. Stops the moment the target sequence
   * shows up in a fetched page, or once the keyset cursor is exhausted (`nextBeforeSequence === null`,
   * meaning the message genuinely is not in this conversation - a stale search hit for one since
   * erased, say), or after `MAX_LOCATE_HOPS` hops, whichever comes first.
   */
  const locateSequence = useCallback(
    async (
      targetConversationId: string,
      targetSequence: number,
      initialMessages: MessageDto[],
      initialNextBeforeSequence: number | null,
    ) => {
      if (initialMessages.some((message) => message.sequence === targetSequence)) {
        return;
      }

      setLocatingMessage(true);
      try {
        let cursor = initialNextBeforeSequence;
        for (let hop = 0; hop < MAX_LOCATE_HOPS && cursor !== null; hop++) {
          const page = await connection.loadOlderHistory(targetConversationId, cursor, HISTORY_PAGE_SIZE);
          const older = [...page.messages].reverse();
          setMessages((prev) => [...older, ...prev]);
          setNextBeforeSequence(page.nextBeforeSequence);
          cursor = page.nextBeforeSequence;

          if (page.messages.some((message) => message.sequence === targetSequence)) {
            break;
          }
        }
      } catch (err) {
        console.error("Failed to locate the searched message", err);
      } finally {
        setLocatingMessage(false);
      }
    },
    [connection],
  );

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    // `OperatorConnectionProvider` starts the shared connection asynchronously (a real WebSocket
    // handshake); this page can mount before that handshake finishes, e.g. a direct deep link to
    // `/conversations/:id` or a hard reload while already on one - found live, manually verifying
    // `5-07`: `JoinConversationAsync` threw "Cannot send data if the connection is not in the
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
        // the rest of this component can simply append. `Thread` re-sorts by `sequence` regardless,
        // which is the guarantee that actually holds (`date-and-time.md` rule 6).
        const initialMessages = [...page.messages].reverse();
        setMessages(initialMessages);
        setNextBeforeSequence(page.nextBeforeSequence);
        setJoinError(null);

        // `18-01`: `?at=<sequence>` is `SearchConversationsPage`'s own cue - a search hit's `Assigned`
        // link (`searchConversations`'s own doc comment on why only that state gets one). Read once,
        // right after a successful join, rather than kept in this effect's dependency array: the join
        // above already re-runs whenever `conversationId` changes, which is the only time a new target
        // sequence can matter, and reacting to the query string changing on its own (with the same
        // conversation still open) is not a case this item needs to support.
        const atParam = searchParams.get("at");
        if (atParam !== null) {
          const targetSequence = Number(atParam);
          if (Number.isInteger(targetSequence)) {
            setHighlightSequence(targetSequence);
            void locateSequence(conversationId, targetSequence, initialMessages, page.nextBeforeSequence);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          joinedConversationId.current = null;
          console.error("Failed to join conversation", err);
          setJoinError(strings.conversationOpenFailed);
        }
      });

    return () => {
      cancelled = true;
      connection.leaveConversation();
    };
    // `18-01`: `searchParams`, `strings` and `locateSequence` are read inside this effect but
    // deliberately absent from its own dependency list, for a reason sharper than "keep the array
    // small": the guard above (`joinedConversationId.current === conversationId`) is what stops a
    // reconnect from discarding an already-open thread, and it only works because this effect's
    // cleanup (which calls `leaveConversation()`) and its body run as a *pair* on every dependency
    // change. Adding `strings` (which changes if the tenant's locale ever changes mid-session) or
    // `searchParams` (which changes on every navigation, including ones unrelated to this page) would
    // make React run that cleanup-then-guarded-no-op pair on an unrelated change - the cleanup calls
    // `leaveConversation()`, the guard then sees `joinedConversationId.current` already equal to
    // `conversationId` and returns before rejoining or re-registering `onMessage`, leaving the
    // operator silently disconnected from a conversation they never navigated away from. `connection`
    // is already a dependency, so `locateSequence` (a `useCallback` closing over only `connection`)
    // changes exactly when this effect would already re-run for another reason, and both `strings`
    // and `searchParams` are read fresh from the closure each time the join itself actually happens,
    // which is the only moment either needs to be current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // `18-07`: the returning-visitor-history panel's own read - one fetch per conversation open, not
  // polled like presence above (a visitor's past-conversation list does not change while this one is
  // on screen the way their online/offline status does). REST, not the hub: `fetchVisitorHistory`
  // (`api/conversationsApi.ts`) is a plain authenticated GET, the same reasoning
  // `fetchOperatorQueue`'s own doc comment already gives for the queue.
  useEffect(() => {
    if (!conversationId || !user?.access_token) {
      return;
    }

    let cancelled = false;
    fetchVisitorHistory(user.access_token, conversationId)
      .then((response) => {
        if (!cancelled) {
          setVisitorHistory(response);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVisitorHistoryError(err instanceof Error ? err.message : strings.visitorHistoryError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, user?.access_token, strings]);

  // `5-15`: whether this tab is actually in front of the operator. The document-title unread count
  // exists precisely so a *backgrounded* tab still tells the truth (`attention.ts`), so a
  // conversation left open behind another tab must not go on silently marking itself read - that
  // would clear the very number the title is there to show.
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // `5-15`: the read position this console can honestly claim - the newest message it has actually
  // rendered. Not `conversation.lastSequence` from the queue row: that is what the *server* has, which
  // may already be ahead of what is on screen, and claiming it would mute a message the operator
  // never saw. `Thread` auto-scrolls to the newest arrival whenever the operator is at the bottom
  // (which they are on open), so "the newest message is loaded" and "the newest message is on screen"
  // are the same thing here - which is what makes the simple "opening reads it" rule defensible
  // rather than a stand-in for scroll tracking that does not exist.
  const newestSequence = messages.reduce<number | null>(
    (highest, message) => (highest === null || message.sequence > highest ? message.sequence : highest),
    null,
  );
  const lastMarked = useRef<{ conversationId: string; sequence: number } | null>(null);

  useEffect(() => {
    if (!conversationId || newestSequence === null || !tabVisible) {
      return;
    }

    // Already told the server about this exact position - re-sending is a no-op server-side (the
    // handler skips the write entirely), but there is no reason to spend the round trip.
    const marked = lastMarked.current;
    if (marked?.conversationId === conversationId && marked.sequence >= newestSequence) {
      return;
    }

    const timer = setTimeout(() => {
      lastMarked.current = { conversationId, sequence: newestSequence };
      markRead(conversationId, newestSequence);
    }, MARK_READ_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [conversationId, newestSequence, tabVisible, markRead]);

  const send = useCallback(
    async (body: string, clientMessageId: string, attachmentId: string | null) => {
      if (!conversationId) {
        return;
      }

      try {
        await connection.sendMessage(conversationId, body, clientMessageId, attachmentId);
        setFailedSend(null);
        // `11-06`: the rail shows this conversation's own row, so let it re-read rather than sit on
        // a snapshot taken before the operator answered.
        refreshQueue();
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
    [connection, conversationId, refreshQueue],
  );

  const handleSend = () => {
    const body = draft.trim();
    // An attachment always rides with a caption, never sent body-less - MessageBody
    // (`Ago.Chat.Domain`) rejects an empty/whitespace-only body regardless of whether a message
    // carries an attachment, and this item does not touch that domain rule to add an exception.
    // `Composer` disables Send for an empty draft; this is the second half of the same guard, for
    // the keyboard path.
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

  /** `5-08`'s upload sequence, unchanged and not reimplemented - only its trigger moved. It used to
   * be an `onChange` handler bound to a visible file input; the composer now calls it with a file
   * that may equally have been dropped or pasted. */
  const handleFileChosen = async (file: File) => {
    if (!conversationId || !user?.access_token) {
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
      setUploadError(err instanceof Error ? err.message : strings.conversationUploadFailed);
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
      return <Spinner label={strings.conversationLoadingAttachment} />;
    }

    if (detail === "deleted") {
      return <span className="ago-meta">{strings.conversationAttachmentDeleted}</span>;
    }

    if (detail === "error") {
      return (
        <span className="ago-message__attachment" role="alert">
          <Badge tone="danger">{strings.conversationAttachmentUnavailable}</Badge>
        </span>
      );
    }

    return (
      <span className="ago-message__attachment">
        {detail.thumbnailUrl ? (
          // A real generated thumbnail (5-04) - the one case safe to render inline, unlike the raw
          // download below (this component's own doc comment has the reasoning).
          <a href={detail.url} target="_blank" rel="noopener noreferrer">
            <img
              className="ago-message__thumb"
              src={detail.thumbnailUrl}
              alt={strings.conversationAttachmentThumbnailAlt}
            />
          </a>
        ) : (
          <a href={detail.url} target="_blank" rel="noopener noreferrer">
            {strings.conversationDownloadAttachmentLabel} ({detail.contentType})
          </a>
        )}
        {hasPermission("attachment:delete") && (
          <Button size="sm" variant="danger" onClick={() => void handleDeleteAttachment(attachmentId)}>
            {strings.conversationDeleteAttachmentButton}
          </Button>
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

  if (!conversationId) {
    return null;
  }

  return (
    <>
      <section className="ago-workspace__main" aria-label={strings.conversationTitleFallback}>
        <header className="ago-workspace__main-head">
          {/* Only visible in the single-column layout, where the rail is off screen - see
              `workspace.css`. On a laptop the list is right there and a back link would be a
              control that undoes nothing. */}
          <Link className="ago-workspace__back" to="/">
            {strings.conversationBackLink}
          </Link>
          <h2 className="ago-workspace__main-title">
            {conversation ? (
              <>
                {strings.conversationWithPrefix} <span className="ago-mono">{conversation.visitorId.slice(0, 8)}</span>
              </>
            ) : (
              strings.conversationTitleFallback
            )}
          </h2>

          {/* `11-09`. Absent once this tab has closed the conversation - a second close would be a
              `409` the operator can only be confused by - and absent entirely for an operator
              without `conversation:close`, which the component itself decides. */}
          {!closed && (
            <CloseConversationButton
              onClose={async () => {
                if (!user?.access_token || !conversationId) {
                  return;
                }

                await closeConversation(user.access_token, conversationId);
              }}
              onClosed={() => {
                setClosed(true);
                // The rail drops the row on its own once the queue is re-read - the conversation is
                // no longer `Assigned`, so it simply is not in the response any more.
                refreshQueue();
              }}
              onStaleQueue={refreshQueue}
            />
          )}
        </header>

        {connectionState === "connected" ? null : (
          <p className="ago-meta ago-workspace__main-note" role="status">
            {strings.conversationWaitingForHub}
          </p>
        )}

        {/* `18-01`: the join this page's own effect just attempted failed outright - most often
            because `?at=` sent it here for a search hit that is not, in fact, the searching
            operator's own conversation (`searchConversations`'s own doc comment). Rendered instead of
            an empty thread with a live composer, which is what happened here before this item. */}
        {joinError && <Alert tone="danger">{joinError}</Alert>}

        <Thread
          messages={messages}
          now={now}
          timeZone={timeZone}
          renderAttachment={renderAttachment}
          canLoadOlder={nextBeforeSequence !== null}
          loadingOlder={loadingOlder}
          onLoadOlder={() => void loadOlder()}
          highlightSequence={highlightSequence}
          locating={locatingMessage}
        />

        {/* `11-09`: the thread stays readable and the composer goes.

            Navigating back to `/` on a successful close was the obvious alternative and is wrong for
            `11-06`'s own reason: the operator decides when to leave. What must not survive is the
            composer, because the server will refuse every send to a closed conversation and a
            reply box that silently cannot work is worse than no reply box.

            `18-01`: `joinError` gets the identical treatment - a composer that can never send because
            the join itself failed is the same "silently cannot work" trap. */}
        {closed ? (
          <div className="ago-workspace__composer">
            <Alert tone="info" title={strings.conversationClosedTitle}>
              {strings.conversationClosedBody}
            </Alert>
          </div>
        ) : joinError ? null : (
        <div className="ago-workspace__composer">
          {failedSend && (
            <Alert
              tone="danger"
              title={strings.conversationSendFailedTitle}
              action={
                <Button size="sm" variant="danger" onClick={handleRetry}>
                  {strings.conversationRetryButton}
                </Button>
              }
            >
              &quot;{failedSend.body}&quot;
            </Alert>
          )}

          {/* `18-05`: `inputRef` is the workspace layout's own ref, filled in here. That is what
              lets its `C` shortcut focus this textarea from anywhere on the screen, including with
              no conversation open - see `workspaceContext.ts` for why this one field runs
              outlet-to-layout while everything else on that interface runs the other way. */}
          <Composer
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            onFileChosen={(file) => void handleFileChosen(file)}
            onRemoveAttachment={() => setPendingAttachment(null)}
            pendingAttachment={pendingAttachment}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
            inputRef={composerRef}
          />
        </div>
        )}
      </section>

      <VisitorPanel
        conversationId={conversationId}
        conversation={conversation}
        visitorOnline={visitorOnline}
        siteId={siteId}
        now={now}
        timeZone={timeZone}
        visitorHistory={visitorHistory}
        visitorHistoryError={visitorHistoryError}
        accessToken={user?.access_token ?? null}
      />
    </>
  );
}
