import { NavLink } from "react-router-dom";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { Badge } from "../components/Badge.js";
import { Skeleton } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, formatElapsed, formatElapsedWords, parseInstant } from "../time/format.js";
import { isNewlyAssigned, oldestFirst, unreadCountFor, type ReadStateMap } from "./attention.js";

export interface ConversationListProps {
  /** `null` while the first queue fetch is in flight - "not yet known", never "empty". */
  queue: { assignedToMe: ConversationSummaryDto[]; waiting: ConversationSummaryDto[] } | null;
  attention: ReadStateMap;
  now: Date;
  timeZone: string | null;
  waitingRefreshSeconds: number;
}

/**
 * `11-06`: the workspace's first region - what is mine, and what is waiting.
 *
 * ## One decision this list inherited from `QueuePage` (`5-07`) and one `23-04` reverses
 *
 * 1. **`23-04`: a waiting row is a real link now, the same shape as an assigned one.**
 *    `OperatorHub.JoinConversationAsync` already claims a still-`Waiting` conversation for whoever
 *    joins it (`AssignConversationHandler`'s own remarks) - the only thing missing before this item was
 *    a link that actually reached it, which is why the row used to be a bare `<li>` with no anchor, no
 *    hover response and a flat sunken surface, under a heading that said "read-only" in words. That
 *    absence was `decisions.md` §2's *old* model; §2 now records the opposite explicitly - "capacity
 *    stops the auto-assigner, never the human" - so the row is a `NavLink` to the same
 *    `/conversations/{id}` route the assigned rows already use, and clicking it is a deliberate take
 *    (`ConversationAssignmentSource.Taken`), not an accident: nothing here fires on hover or on render,
 *    only on the operator's own click.
 * 2. **The two halves still have different freshness guarantees, and both are stated.** "Assigned to me" is
 *    genuinely live (`onConversationAssigned`); "Waiting" only moves on the layout's 15-second poll,
 *    because nothing broadcasts "a new conversation started waiting" to every operator of a site.
 *    That is a deliberate, documented limitation rather than an oversight, so the heading says which
 *    is which instead of letting the operator assume both are live.
 *
 * ## Waiting time rather than arrival time
 *
 * Every row leads with how long it has been going, oldest first, because "waiting 14m" is the number
 * an operator triages on and "10:42" is not. The absolute, zone-labelled instant is always one
 * `title` away (`date-and-time.md` rule 5) - the short form is for scanning, the `title` is the
 * truth.
 *
 * The honest limit on that: the only per-conversation timestamp the queue endpoint returns is
 * `createdAt`. For a waiting conversation that genuinely is the waiting time. For an assigned one it
 * is how long the conversation has been *open*, which is not the same as how long the visitor has
 * been waiting for a reply - that would need the last inbound message's timestamp, which is a
 * backend change and is not invented here. The two are therefore labelled differently ("Waiting" vs
 * "Open"), rather than one number pretending to be both.
 */
export function ConversationList({ queue, attention, now, timeZone, waitingRefreshSeconds }: ConversationListProps) {
  const strings = useStrings();

  return (
    <>
      <section className="ago-list-group" aria-labelledby="ago-list-assigned">
        <header className="ago-list-group__head">
          <h2 className="ago-list-group__title" id="ago-list-assigned">
            {strings.queueAssignedTitle}
            {queue && queue.assignedToMe.length > 0 && (
              <span className="ago-list-group__count">{queue.assignedToMe.length}</span>
            )}
          </h2>
          <p className="ago-list-group__note">{strings.queueAssignedNote}</p>
        </header>

        {queue === null ? (
          <Skeleton lines={3} label={strings.queueAssignedLoadingLabel} />
        ) : queue.assignedToMe.length === 0 ? (
          <p className="ago-empty">{strings.queueAssignedEmpty}</p>
        ) : (
          <ul className="ago-list">
            {oldestFirst(queue.assignedToMe).map((c) => {
              const unread = unreadCountFor(c, attention);
              const started = parseInstant(c.createdAt);

              return (
                <li key={c.conversationId}>
                  <NavLink
                    to={`/conversations/${c.conversationId}`}
                    className={({ isActive }) => (isActive ? "ago-list__row ago-list__row--active" : "ago-list__row")}
                  >
                    <span className="ago-list__row-top">
                      <Badge tone="brand" mono>
                        {c.visitorId.slice(0, 8)}
                      </Badge>
                      {isNewlyAssigned(c, attention) && <Badge tone="accent">{strings.queueNewBadge}</Badge>}
                      {unread > 0 && (
                        <Badge tone="danger">
                          {unread}
                          <span className="ago-visually-hidden">
                            {" "}
                            {unread === 1 ? strings.queueUnreadMessageOne : strings.queueUnreadMessageOther}
                          </span>
                        </Badge>
                      )}
                    </span>
                    <span className="ago-list__row-bottom">
                      {started ? (
                        <span
                          className="ago-meta"
                          title={`${strings.queueConversationStartedTitle} ${formatAbsolute(started, timeZone, strings)} — ${formatElapsedWords(started, now, strings)} ${strings.agoSuffix}`}
                        >
                          {strings.queueOpenLabel} {formatElapsed(started, now, strings)}
                        </span>
                      ) : (
                        <span className="ago-meta">{strings.queueStartUnknown}</span>
                      )}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ago-list-group" aria-labelledby="ago-list-waiting">
        <header className="ago-list-group__head">
          <h2 className="ago-list-group__title" id="ago-list-waiting">
            {strings.queueWaitingTitle}
            {queue && queue.waiting.length > 0 && <span className="ago-list-group__count">{queue.waiting.length}</span>}
          </h2>
          <p className="ago-list-group__note">
            {strings.queueWaitingNotePrefix} {waitingRefreshSeconds} {strings.queueWaitingNoteSuffix}
          </p>
        </header>

        {queue === null ? (
          <Skeleton lines={2} label={strings.queueWaitingLoadingLabel} />
        ) : queue.waiting.length === 0 ? (
          <p className="ago-empty">{strings.queueWaitingEmpty}</p>
        ) : (
          <ul className="ago-list">
            {oldestFirst(queue.waiting).map((c) => {
              const started = parseInstant(c.createdAt);

              return (
                // `23-04`: a real link, the same shape the assigned section above uses - see this
                // component's own doc comment for why the absence of one used to be the assignment
                // model, and no longer is. Navigating here reaches OperatorHub.JoinConversationAsync,
                // which claims the conversation for this operator as a side effect of the join.
                <li key={c.conversationId}>
                  <NavLink
                    to={`/conversations/${c.conversationId}`}
                    className={({ isActive }) => (isActive ? "ago-list__row ago-list__row--active" : "ago-list__row")}
                  >
                    <span className="ago-list__row-top">
                      <Badge tone="neutral" mono>
                        {c.visitorId.slice(0, 8)}
                      </Badge>
                    </span>
                    <span className="ago-list__row-bottom">
                      {started ? (
                        <span
                          className="ago-meta"
                          title={`${strings.queueWaitingSinceTitle} ${formatAbsolute(started, timeZone, strings)} — ${formatElapsedWords(started, now, strings)}`}
                        >
                          {strings.queueWaitingTitle} {formatElapsed(started, now, strings)}
                        </span>
                      ) : (
                        <span className="ago-meta">{strings.queueWaitingSinceUnknown}</span>
                      )}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
