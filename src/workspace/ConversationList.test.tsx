import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationList } from "./ConversationList.js";
import { applyAttentionEvent, type ReadStateMap } from "./attention.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { all, interact, one, render, unmount } from "../testing/dom.js";

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

async function mount(
  queue: { assignedToMe: ConversationSummaryDto[]; waiting: ConversationSummaryDto[] },
  attention: ReadStateMap = {},
): Promise<HTMLElement> {
  return render(
    <MemoryRouter>
      <ConversationList queue={queue} attention={attention} now={NOW} timeZone={null} waitingRefreshSeconds={15} />
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
  // `25-207`: the fallback label used to be nothing but the pair and the short code - it now reads as
  // each emoji's own localized name (`ConsoleStrings.visitorEmojiNames` - `en` here, the default
  // `useStrings()` falls back to when no provider wraps this component, `StringsContext.tsx`'s own
  // doc comment), with the short code kept as a faint trailing detail rather than dropped.
  it("prepends the emoji pair to the short code when the visitor has one, in both rows", async () => {
    const container = await mount({
      assignedToMe: [assignedSummary({ emojiCreature: "🐔", emojiFood: "🍊" })],
      waiting: [waitingSummary({ emojiCreature: "🐠", emojiFood: "🥝" })],
    });

    const assignedBadge = one(container, ".ago-badge--brand");
    expect(assignedBadge.textContent?.trim()).toBe(`🐔🍊 Chicken · Orange ${ASSIGNED_VISITOR_ID.slice(0, 8)}`);

    const waitingBadge = one(container, ".ago-badge--neutral");
    expect(waitingBadge.textContent?.trim()).toBe(`🐠🥝 Fish · Kiwi ${WAITING_VISITOR_ID.slice(0, 8)}`);
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

/**
 * `25-56`'s own second half: the visitor's own name, rendered between the emoji pair and the short
 * code (the item's own Scope section: `{emoji}{emoji} {name} {shortCode}`). Same two rows, same
 * "goes through the real DTO shape" discipline as the emoji-only tests above.
 */
describe("25-56: the visitor's own name beside the short code", () => {
  it("renders the pair, the name, and the short code, in that order, in both rows", async () => {
    const container = await mount({
      assignedToMe: [assignedSummary({ emojiCreature: "🐔", emojiFood: "🍊", visitorName: "Иван Иванов" })],
      waiting: [waitingSummary({ emojiCreature: "🐠", emojiFood: "🥝", visitorName: "Мария" })],
    });

    const assignedBadge = one(container, ".ago-badge--brand");
    expect(assignedBadge.textContent?.trim()).toBe(`🐔🍊 Иван Иванов ${ASSIGNED_VISITOR_ID.slice(0, 8)}`);

    const waitingBadge = one(container, ".ago-badge--neutral");
    expect(waitingBadge.textContent?.trim()).toBe(`🐠🥝 Мария ${WAITING_VISITOR_ID.slice(0, 8)}`);
  });

  // `25-207`'s own Done-when: "no name yet" now reads as the localized fallback label rather than
  // nothing - `Chicken · Orange`, not a stray double space and not the bare glyphs as text.
  it("renders the localized fallback label, not a stray space, when no name is known yet", async () => {
    const container = await mount({
      assignedToMe: [assignedSummary({ emojiCreature: "🐔", emojiFood: "🍊", visitorName: null })],
      waiting: [],
    });

    const assignedBadge = one(container, ".ago-badge--brand");
    expect(assignedBadge.textContent?.trim()).toBe(`🐔🍊 Chicken · Orange ${ASSIGNED_VISITOR_ID.slice(0, 8)}`);
    expect(assignedBadge.textContent).not.toMatch(/ {2}/);
  });
});

/**
 * `25-54`: both section headings used to carry a standing paragraph underneath explaining what "live"
 * and "assigned automatically" mean - each now moves into its own `Tooltip`, beside the heading it
 * explains rather than under it. No queue data is needed for either check, so both mount an empty
 * queue - the note renders (or does not) purely off the heading, not off any row.
 */
describe("25-54: the section notes become tooltips", () => {
  it("does not render either section's note as permanent inline text - only two hidden tooltip bubbles", async () => {
    const container = await mount({ assignedToMe: [], waiting: [] });

    const bubbles = all(container, '[role="tooltip"]') as HTMLElement[];
    expect(bubbles).toHaveLength(2);
    expect(bubbles.every((bubble) => bubble.hidden)).toBe(true);
    expect(bubbles[0].textContent).toContain("Live");
    expect(bubbles[1].textContent).toContain("assigned automatically");
  });

  it("reveals the assigned-section note when its own tooltip trigger receives focus", async () => {
    const container = await mount({ assignedToMe: [], waiting: [] });

    const [assignedTrigger] = all(container, ".ago-tooltip__trigger") as HTMLButtonElement[];
    const [assignedBubble] = all(container, '[role="tooltip"]') as HTMLElement[];

    await interact(() => assignedTrigger.focus());
    expect(assignedBubble.hidden).toBe(false);
  });

  it("reveals the waiting-section note, poll cadence included, when its own tooltip trigger receives focus", async () => {
    const container = await mount({ assignedToMe: [], waiting: [] });

    const triggers = all(container, ".ago-tooltip__trigger") as HTMLButtonElement[];
    const bubbles = all(container, '[role="tooltip"]') as HTMLElement[];

    await interact(() => triggers[1].focus());
    expect(bubbles[1].hidden).toBe(false);
    expect(bubbles[1].textContent).toContain("15");
  });
});

/**
 * `25-162`'s own Done-when: "'Мои' cards render most-recently-active conversation first, oldest
 * last - proven by a test with cards seeded out of order." Three assigned rows, seeded in an order
 * `createdAt` alone would not produce, so a test that accidentally passed under the old `oldestFirst`
 * sort would fail here.
 */
describe("25-162: the assigned section sorts by most recent activity, not by createdAt", () => {
  it("renders the most-recently-active conversation first, oldest last", async () => {
    const rows = [
      assignedSummary({
        conversationId: "aaaaaaaa-0000-0000-0000-000000000000", visitorId: "aaaaaaaa-1111-1111-1111-111111111111",
        createdAt: "2026-09-09T08:00:00+00:00",
      }),
      assignedSummary({
        conversationId: "bbbbbbbb-0000-0000-0000-000000000000", visitorId: "bbbbbbbb-1111-1111-1111-111111111111",
        createdAt: "2026-09-09T09:00:00+00:00",
      }),
      assignedSummary({
        conversationId: "cccccccc-0000-0000-0000-000000000000", visitorId: "cccccccc-1111-1111-1111-111111111111",
        createdAt: "2026-09-09T07:00:00+00:00",
      }),
    ];
    // The oldest-by-createdAt row is the one a real visitor message just arrived for - it must render
    // first anyway, which is exactly what `oldestFirst` would have gotten wrong.
    const attention = applyAttentionEvent(
      {}, { kind: "incoming", conversationId: "cccccccc-0000-0000-0000-000000000000", at: "2026-09-09T09:59:00+00:00" },
    );

    const container = await mount({ assignedToMe: rows, waiting: [] }, attention);

    const badges = all(container, ".ago-badge--brand") as HTMLElement[];
    expect(badges.map((b) => b.textContent?.trim())).toEqual(["cccccccc", "bbbbbbbb", "aaaaaaaa"]);
  });
});

/**
 * `25-162`'s own Done-when ("the visitor emoji-pair icon is visibly larger...") is now met by
 * `25-207`'s badge composition instead of a single enlarged span - `ConversationPage.test.tsx` covers
 * the header, this covers both rows this component renders. Asserts the creature and food each sit in
 * their own element (`.ago-visitor-avatar__creature`/`__food`, the classes the CSS composition
 * actually targets), not merely that the glyphs are present somewhere in the badge - a regression that
 * dropped the badge's own DOM structure but kept the characters would still pass the plain
 * text-content checks in the describe block above.
 */
describe("25-207: the visitor emoji pair renders as the badge composition", () => {
  it("renders the creature and food each in their own element, in both the assigned and waiting rows", async () => {
    const container = await mount({
      assignedToMe: [assignedSummary({ emojiCreature: "🐔", emojiFood: "🍊" })],
      waiting: [waitingSummary({ emojiCreature: "🐠", emojiFood: "🥝" })],
    });

    const avatars = all(container, ".ago-visitor-avatar") as HTMLElement[];
    expect(avatars).toHaveLength(2);

    const [assignedCreature, waitingCreature] = all(container, ".ago-visitor-avatar__creature") as HTMLElement[];
    const [assignedFood, waitingFood] = all(container, ".ago-visitor-avatar__food") as HTMLElement[];
    expect(assignedCreature.textContent).toBe("🐔");
    expect(assignedFood.textContent).toBe("🍊");
    expect(waitingCreature.textContent).toBe("🐠");
    expect(waitingFood.textContent).toBe("🥝");

    // `25-207`'s own Scope: the avatar carries no accessible name of its own - the text label beside
    // it (asserted above, in the "25-56" describe block) already says the same thing in words.
    expect(avatars[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("renders no avatar at all, not an empty one, when the visitor has no pair yet", async () => {
    const container = await mount({ assignedToMe: [assignedSummary()], waiting: [] });

    expect(all(container, ".ago-visitor-avatar")).toHaveLength(0);
  });
});
