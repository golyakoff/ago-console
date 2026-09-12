import { afterEach, describe, expect, it } from "vitest";
import { Thread } from "./Thread.js";
import type { ChannelDeliveryDto } from "../api/channelDeliveriesApi.js";
import type { MessageDto } from "../realtime/protocol/types.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

function message(id: string, sequence: number, overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id,
    sequence,
    authorKind: "Visitor",
    authorId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    body: `message ${id}`,
    createdAt: "2026-08-25T09:00:00+00:00",
    ...overrides,
  };
}

const NOW = new Date("2026-08-25T09:05:00Z");

function mount(messages: MessageDto[], channelDeliveries?: ChannelDeliveryDto[] | null) {
  return render(
    <Thread
      messages={messages}
      now={NOW}
      timeZone="UTC"
      renderAttachment={() => null}
      canLoadOlder={false}
      loadingOlder={false}
      onLoadOlder={() => undefined}
      channelDeliveries={channelDeliveries}
    />,
  );
}

/** `23-19`: the thread's own delivery badge - `docs/design/decisions.md` §9. */
describe("channel delivery badges", () => {
  afterEach(async () => {
    await unmount();
  });

  function delivery(overrides: Partial<ChannelDeliveryDto> = {}): ChannelDeliveryDto {
    return {
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      messageId: "m1",
      channelKind: "Sms",
      status: "Delivered",
      providerMessageId: "sms-1",
      failureReason: null,
      attemptedAt: "2026-08-25T09:00:01+00:00",
      ...overrides,
    };
  }

  it("shows a delivered badge on the operator message it belongs to", async () => {
    const container = await mount(
      [message("m1", 1, { authorKind: "Operator", authorId: "op-1", body: "hi there" })],
      [delivery()],
    );

    expect(byText(container, "span", "Delivered")).not.toBeNull();
  });

  it("shows a not-delivered badge, carrying the provider's own reason, for a refused send", async () => {
    const container = await mount(
      [message("m1", 1, { authorKind: "Operator", authorId: "op-1", body: "hi there" })],
      [delivery({ status: "Refused", providerMessageId: null, failureReason: "unknown number" })],
    );

    const badge = byText(container, "span", "Not delivered");
    expect(badge).not.toBeNull();
    expect(badge?.closest("[title]")?.getAttribute("title")).toBe("Reason: unknown number");
  });

  it("shows no badge on a visitor message, even if a delivery happened to carry its id", async () => {
    const container = await mount([message("m1", 1, { authorKind: "Visitor" })], [delivery()]);

    expect(byText(container, "span", "Delivered")).toBeNull();
  });

  it("shows no badge on an operator message with no recorded delivery - a widget conversation's own shape", async () => {
    const container = await mount(
      [message("m1", 1, { authorKind: "Operator", authorId: "op-1", body: "hi there" })],
      [],
    );

    expect(byText(container, "span", "Delivered")).toBeNull();
    expect(byText(container, "span", "Not delivered")).toBeNull();
  });

  /**
   * `25-54`: the scope caption that explains a silent widget conversation used to be a standing
   * paragraph, shown regardless - it is now a `Tooltip`, reachable but not permanently visible. The
   * two tests below prove both halves: nothing renders the sentence inline any more, and it is still
   * there, one focus away.
   */
  it("does not render the delivery-scope caption as permanent inline text, only inside its own hidden tooltip", async () => {
    const container = await mount([message("m1", 1, { authorKind: "Operator", authorId: "op-1" })], []);

    const bubble = one<HTMLElement>(container, '[role="tooltip"]');
    expect(bubble.textContent).toContain("Delivery status is shown on messages sent through a connected channel");
    expect(bubble.hidden).toBe(true);
  });

  it("reveals the delivery-scope caption when its tooltip trigger receives focus", async () => {
    const container = await mount([message("m1", 1, { authorKind: "Operator", authorId: "op-1" })], []);

    const trigger = one<HTMLButtonElement>(container, ".ago-tooltip__trigger");
    const bubble = one<HTMLElement>(container, '[role="tooltip"]');

    await interact(() => trigger.focus());
    expect(bubble.hidden).toBe(false);
  });
});
