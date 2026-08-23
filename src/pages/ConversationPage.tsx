import { useParams } from "react-router-dom";

/** Placeholder route - the real conversation view (message thread, send box, presence) is `5-07`. */
export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  return <p>Conversation {conversationId} - {"5-07"}'s own job, not this scaffold's.</p>;
}
