import { useEffect, useRef, useState } from "react";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import { getAttachmentDownload, type AttachmentDownloadResponse } from "../api/attachmentsApi.js";
import type { MessageDto, VisitorHistoryConversationDto, VisitorHistoryResponse } from "../realtime/protocol/types.js";
import { Badge } from "../components/Badge.js";
import { Dialog } from "../components/Dialog.js";
import { Button } from "../components/Button.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Alert } from "../components/Alert.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatAbsolute, formatDateStamp, parseInstant } from "../time/format.js";
import { Thread } from "./Thread.js";

const HISTORICAL_PAGE_SIZE = 50;

type AttachmentDetail = AttachmentDownloadResponse | "loading" | "error";

/** `ConversationSummaryDto.state`'s three values - `VisitorPanel`'s own `stateLabel` restated here
 * rather than imported, since that function is private to that file and this is the identical,
 * small mapping, not a shared abstraction worth extracting for one more caller. */
function stateLabel(state: VisitorHistoryConversationDto["state"], strings: ConsoleStrings): string {
  switch (state) {
    case "Waiting":
      return strings.queueWaitingTitle;
    case "Assigned":
      return strings.conversationStateAssigned;
    case "Closed":
      return strings.conversationStateClosed;
  }
}

export interface VisitorHistoryPanelProps {
  /** The conversation currently open - the operator's own standing, and the id
   * `GetVisitorHistoryConversationAsync` checks against (`OperatorHub`'s own remarks). */
  conversationId: string;
  /** `null` while the first fetch is in flight - "not yet known", the same convention
   * `ConversationList`'s own `queue` prop uses. */
  history: VisitorHistoryResponse | null;
  historyError: string | null;
  now: Date;
  timeZone: string | null;
  accessToken: string | null;
}

/**
 * `18-07`: the returning-visitor-history panel - a channel-identified visitor's prior conversations,
 * read-only, opened from `VisitorPanel`.
 *
 * **The hard gate.** `history === null` while loading renders a skeleton, same as every other
 * loading list in this workspace. Once loaded, `history.hasChannelIdentity === false` renders
 * **nothing at all** - not this component's section heading, not an empty-state sentence. That is
 * the backlog item's own hard requirement: a widget visitor structurally cannot have returning
 * history (`14-01`'s model - no `ChannelIdentity` row exists for one, ever), and a panel that shows
 * an empty state for that case would visually imply the opposite. `history.conversations.length ===
 * 0` **with** `hasChannelIdentity === true` is a different, real case (a channel-identified visitor
 * on their first-ever conversation) and does get an empty-state sentence, because that state can
 * genuinely occur and change later.
 *
 * **Opening one reuses `Thread`**, the same component `ConversationPage` renders the live
 * conversation with - the backlog item's own "reusing 11-06's existing history-rendering rather than
 * a second message-list component", applied to the fetch as well as the render:
 * `OperatorConnection.getVisitorHistoryConversation` returns the identical `HistoryPage`/`MessageDto`
 * wire shape `joinConversation`/`loadOlderHistory` already do. Attachments render read-only (a
 * thumbnail or a download link, fetched the same way `ConversationPage` fetches them) - never a
 * delete action, matching this item's own Out-of-scope ("editing, annotating, or acting on a past
 * conversation from this panel").
 */
export function VisitorHistoryPanel({ conversationId, history, historyError, now, timeZone, accessToken }: VisitorHistoryPanelProps) {
  const strings = useStrings();
  const { connection } = useOperatorConnection();

  const [openConversationId, setOpenConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [attachmentDetails, setAttachmentDetails] = useState<Record<string, AttachmentDetail>>({});
  const requestedAttachmentIds = useRef<Set<string>>(new Set());

  // A different conversation on screen invalidates whichever historical dialog might be open for the
  // last one - conversationId is not part of GetVisitorHistoryConversationAsync's own authorization
  // check by accident (OperatorHub's own remarks), and a stale dialog left open across a navigation
  // would be asking the server a question about a conversation the operator is no longer on.
  useEffect(() => {
    setOpenConversationId(null);
  }, [conversationId]);

  const openHistorical = (historicalConversationId: string) => {
    setOpenConversationId(historicalConversationId);
    setMessages([]);
    setNextBeforeSequence(null);
    setError(null);
    setAttachmentDetails({});
    requestedAttachmentIds.current = new Set();
    setLoading(true);

    connection
      .getVisitorHistoryConversation(conversationId, historicalConversationId, null, HISTORICAL_PAGE_SIZE)
      .then((page) => {
        setMessages([...page.messages].reverse());
        setNextBeforeSequence(page.nextBeforeSequence);
      })
      .catch(() => setError(strings.visitorHistoryDialogError))
      .finally(() => setLoading(false));
  };

  const loadOlder = () => {
    if (openConversationId === null || nextBeforeSequence === null || loadingOlder) {
      return;
    }

    setLoadingOlder(true);
    connection
      .getVisitorHistoryConversation(conversationId, openConversationId, nextBeforeSequence, HISTORICAL_PAGE_SIZE)
      .then((page) => {
        setMessages((prev) => [...[...page.messages].reverse(), ...prev]);
        setNextBeforeSequence(page.nextBeforeSequence);
      })
      .catch(() => setError(strings.visitorHistoryDialogError))
      .finally(() => setLoadingOlder(false));
  };

  // Lazily fetches download info for any attachment in the open historical thread - the identical
  // fetch-on-demand shape `ConversationPage` uses (including the ref-based "already requested" guard,
  // for the identical reason: it keeps this effect off `attachmentDetails` itself, so a fetch landing
  // does not re-trigger the effect that started it).
  useEffect(() => {
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
  }, [messages, accessToken]);

  const renderAttachment = (attachmentId: string) => {
    const detail = attachmentDetails[attachmentId];

    if (detail === undefined || detail === "loading") {
      return <Spinner label={strings.conversationLoadingAttachment} />;
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
          <a href={detail.url} target="_blank" rel="noopener noreferrer">
            <img className="ago-message__thumb" src={detail.thumbnailUrl} alt={strings.conversationAttachmentThumbnailAlt} />
          </a>
        ) : (
          <a href={detail.url} target="_blank" rel="noopener noreferrer">
            {strings.conversationDownloadAttachmentLabel} ({detail.contentType})
          </a>
        )}
      </span>
    );
  };

  if (history !== null && !history.hasChannelIdentity) {
    // The hard gate - see this component's own doc comment. Nothing renders, not even a heading.
    return null;
  }

  const openRow = history?.conversations.find((c) => c.conversationId === openConversationId) ?? null;

  return (
    <section className="ago-aside__section" aria-labelledby="ago-visitor-history-title">
      <h3 className="ago-aside__subtitle" id="ago-visitor-history-title">
        {strings.visitorHistoryTitle}
      </h3>

      {history === null ? (
        <Skeleton lines={2} label={strings.visitorHistoryLoadingLabel} />
      ) : historyError ? (
        <Alert tone="danger">{historyError}</Alert>
      ) : history.conversations.length === 0 ? (
        <p className="ago-empty">{strings.visitorHistoryEmpty}</p>
      ) : (
        <ul className="ago-list ago-list--history">
          {history.conversations.map((c) => {
            const started = parseInstant(c.startedAt);
            const closed = parseInstant(c.closedAt);

            return (
              <li key={c.conversationId}>
                <button
                  type="button"
                  className="ago-list__row ago-list__row--history"
                  onClick={() => openHistorical(c.conversationId)}
                >
                  <span className="ago-list__row-top">
                    <Badge tone={c.state === "Closed" ? "neutral" : "brand"}>{stateLabel(c.state, strings)}</Badge>
                    <span className="ago-meta">
                      {started ? (
                        <span title={formatAbsolute(started, timeZone)}>
                          {strings.visitorHistoryStartedLabel} {formatDateStamp(started, timeZone)}
                        </span>
                      ) : null}
                      {closed ? (
                        <>
                          {" — "}
                          <span title={formatAbsolute(closed, timeZone)}>
                            {strings.visitorHistoryClosedLabel} {formatDateStamp(closed, timeZone)}
                          </span>
                        </>
                      ) : (
                        <> — {strings.visitorHistoryStillOpen}</>
                      )}
                    </span>
                  </span>
                  <span className="ago-list__row-bottom">
                    <span className="ago-meta ago-list__preview">{c.previewBody ?? strings.visitorHistoryNoPreview}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={openConversationId !== null}
        title={openRow ? `${stateLabel(openRow.state, strings)} · ${formatDateStamp(parseInstant(openRow.startedAt) ?? now, timeZone)}` : strings.visitorHistoryTitle}
        onClose={() => setOpenConversationId(null)}
        footer={
          <Button variant="secondary" onClick={() => setOpenConversationId(null)}>
            {strings.workspaceDoneButton}
          </Button>
        }
      >
        {loading ? (
          <Skeleton lines={4} label={strings.visitorHistoryDialogLoadingLabel} />
        ) : error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <Thread
            messages={messages}
            now={now}
            timeZone={timeZone}
            renderAttachment={renderAttachment}
            canLoadOlder={nextBeforeSequence !== null}
            loadingOlder={loadingOlder}
            onLoadOlder={loadOlder}
          />
        )}
      </Dialog>
    </section>
  );
}
