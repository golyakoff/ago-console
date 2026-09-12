import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationList } from "./ConversationList.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { one, render, unmount } from "../testing/dom.js";

const ASSIGNED_ID = "11111111-1111-1111-1111-111111111111";
const ASSIGNED_VISITOR_ID = "88888888-8888-8888-8888-888888888888";
const WAITING_ID = "22222222-2222-2222-2222-222222222222";
const WAITING_VISITOR_ID = "99999999-9999-9999-9999-999999999999";
const NOW = new Date("2026-09-09T10:00:00.000Z");

function assignedSummary(overrides: Partial<ConversationSummaryDto> = {}): ConversationSummaryDto {
  return {
    conversationId: ASSIGNED_ID,
    visitorId: ASSIGNED_VISITOR_ID,
    state: "Assigned",
    createdAt: "2026-09-09T09:00:00+00:00",
    operatorUnreadCount: 0,
    ...overrides,
  };
}

function waitingSummary(overrides: Partial<ConversationSummaryDto> = {}): ConversationSummaryDto {
  return {
    conversationId: WAITING_ID,
    visitorId: WAITING_VISITOR_ID,
    state: "Waiting",
    createdAt: "2026-09-09T09:30:00+00:00",
    operatorUnreadCount: 0,
    ...overrides,
  };
}

async function mount(queue: { assignedToMe: ConversationSummaryDto[]; waiting: ConversationSummaryDto[] }): Promise<HTMLElement> {
  return render(
    <MemoryRouter>
      <ConversationList queue={queue} attention={{}} now={NOW} timeZone={null} waitingRefreshSeconds={15} />
    </MemoryRouter>,
  );
}

afterEach(async () => {
  await unmount();
});

/**
 * `25-56`: this component's two rows (an "assigned to me" one and a "waiting" one) are the first of
 * the item's exactly-two render locations - `ConversationPage.test.tsx` covers the other, the
 * open-dialog header. Both cases below go through `ConversationSummaryDto` as the wire really sends
 * it - `emojiCreature`/`emojiFood` present together, or both absent - never a hand-built string, so a
 * regression in `visitorEmojiPrefix`'s own null handling would fail here too, not just in its unit
 * test.
 */
describe("25-56: the visitor emoji pair beside the short code", () => {
  it("prepends the emoji pair to the short code when the visitor has one, in both rows", async () => {
    const container = await mount({
      assignedToMe: [assignedSummary({ emojiCreature: "🐔", emojiFood: "🍊" })],
      waiting: [waitingSummary({ emojiCreature: "🐠", emojiFood: "🥝" })],
    });

    const assignedBadge = one(container, ".ago-badge--brand");
    expect(assignedBadge.textContent?.trim()).toBe(`🐔🍊 ${ASSIGNED_VISITOR_ID.slice(0, 8)}`);

    const waitingBadge = one(container, ".ago-badge--neutral");
    expect(waitingBadge.textContent?.trim()).toBe(`🐠🥝 ${WAITING_VISITOR_ID.slice(0, 8)}`);
  });

  it("renders only the short code, no stray text, when the pair is absent", async () => {
    const container = await mount({
      assignedToMe: [assignedSummary()],
      waiting: [waitingSummary()],
    });

    const assignedBadge = one(container, ".ago-badge--brand");
    expect(assignedBadge.textContent?.trim()).toBe(ASSIGNED_VISITOR_ID.slice(0, 8));

    const waitingBadge = one(container, ".ago-badge--neutral");
    expect(waitingBadge.textContent?.trim()).toBe(WAITING_VISITOR_ID.slice(0, 8));
  });

  it("renders only the short code when only one half of the pair is present", async () => {
    const container = await mount({
      assignedToMe: [assignedSummary({ emojiCreature: "🐔", emojiFood: null })],
      waiting: [],
    });

    const assignedBadge = one(container, ".ago-badge--brand");
    expect(assignedBadge.textContent?.trim()).toBe(ASSIGNED_VISITOR_ID.slice(0, 8));
  });
});
