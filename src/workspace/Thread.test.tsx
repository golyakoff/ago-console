import { afterEach, describe, expect, it, vi } from "vitest";
import { Thread } from "./Thread.js";
import type { MessageDto } from "../realtime/protocol/types.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `23-10`: the "select text in a message, promote it to a contact" affordance - `Thread`'s own doc
 * comment has the full reasoning for why this is deliberately dumb (a selection, never a scan).
 *
 * **Real `Range`/`Selection`, not a stub.** jsdom implements enough of both for a plain-text-node
 * selection's `toString()`, `isCollapsed`, `anchorNode` and `focusNode` to behave exactly as a real
 * browser's would for the cases this component reads - which is what lets these tests select a
 * *substring* of a message rather than asserting against the whole body, the same "a copied fragment,
 * not the whole message" shape the backlog item itself asks for.
 */

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

function mount(messages: MessageDto[], onPromoteSelection?: (text: string) => void) {
  return render(
    <Thread
      messages={messages}
      now={NOW}
      timeZone="UTC"
      renderAttachment={() => null}
      canLoadOlder={false}
      loadingOlder={false}
      onLoadOlder={() => undefined}
      onPromoteSelection={onPromoteSelection}
    />,
  );
}

/** Selects `substring` inside `body`'s own text node - the DOM equivalent of an operator dragging
 * across exactly that text - then fires the real `mouseup` a drag/double-click/triple-click ends
 * with. `body` is expected to hold a single text node, true of every `.ago-message__body` this file
 * mounts. */
function selectWithin(body: Element, substring: string): void {
  const textNode = body.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    throw new Error("expected a single text node inside .ago-message__body");
  }

  const text = textNode.textContent ?? "";
  const start = text.indexOf(substring);
  if (start < 0) {
    throw new Error(`"${substring}" not found in "${text}"`);
  }

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, start + substring.length);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Selects from inside `fromBody` to inside `toBody` - two different messages' own text - the shape
 * a drag that overruns one bubble into the next produces. */
function selectAcross(fromBody: Element, toBody: Element): void {
  const fromNode = fromBody.firstChild;
  const toNode = toBody.firstChild;
  if (!fromNode || !toNode) {
    throw new Error("expected text nodes in both bodies");
  }

  const range = document.createRange();
  range.setStart(fromNode, 0);
  range.setEnd(toNode, (toNode.textContent ?? "").length);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function collapseSelection(): void {
  window.getSelection()?.removeAllRanges();
}

/** A real, in-body collapsed selection - start and end at the same offset - the shape a plain click
 * (no drag) leaves behind. Distinct from `collapseSelection` above (no ranges at all): this one has a
 * non-null `anchorNode` that resolves to a real `.ago-message__body`, so it is what actually exercises
 * `handleSelectionEnd`'s `isCollapsed` check rather than its earlier "no anchor at all" one. */
function collapseWithin(body: Element): void {
  const textNode = body.firstChild;
  if (!textNode) {
    throw new Error("expected a text node inside .ago-message__body");
  }

  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 0);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function fireMouseUp(container: HTMLElement): void {
  one(container, ".ago-thread-scroll").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

afterEach(async () => {
  window.getSelection()?.removeAllRanges();
  await unmount();
});

describe("no promote affordance without onPromoteSelection", () => {
  it("never shows the button, even with a real selection made", async () => {
    const container = await mount([
      message("m1", 1, { body: "call me on +7 000 000-00-01 please" }),
    ]);

    const body = one(container, ".ago-message__body");
    await interact(() => selectWithin(body, "+7 000 000-00-01"));
    await interact(() => fireMouseUp(container));

    expect(byText(container, "button", "Add to contact details")).toBeNull();
  });
});

describe("selecting text inside one message", () => {
  it("shows 'Add to contact details' beside that message once the selection ends", async () => {
    const onPromoteSelection = vi.fn();
    const container = await mount(
      [message("m1", 1, { body: "call me on +7 000 000-00-01 please" })],
      onPromoteSelection,
    );

    const body = one(container, ".ago-message__body");
    await interact(() => selectWithin(body, "+7 000 000-00-01"));
    await interact(() => fireMouseUp(container));

    const button = byText<HTMLButtonElement>(container, "button", "Add to contact details");
    expect(button).not.toBeNull();
    expect(onPromoteSelection).not.toHaveBeenCalled();
  });

  it("hands the exact selected substring to onPromoteSelection when clicked, and clears the selection", async () => {
    const onPromoteSelection = vi.fn();
    const container = await mount(
      [message("m1", 1, { body: "call me on +7 000 000-00-01 please" })],
      onPromoteSelection,
    );

    const body = one(container, ".ago-message__body");
    await interact(() => selectWithin(body, "+7 000 000-00-01"));
    await interact(() => fireMouseUp(container));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Add to contact details").click());

    expect(onPromoteSelection).toHaveBeenCalledTimes(1);
    expect(onPromoteSelection).toHaveBeenCalledWith("+7 000 000-00-01");
    expect(window.getSelection()?.toString()).toBe("");
    expect(byText(container, "button", "Add to contact details")).toBeNull();
  });

  it("never promotes the whole message - only the substring the operator actually selected", async () => {
    const onPromoteSelection = vi.fn();
    const container = await mount(
      [message("m1", 1, { body: "call me on +7 000 000-00-01 please" })],
      onPromoteSelection,
    );

    const body = one(container, ".ago-message__body");
    await interact(() => selectWithin(body, "+7 000 000-00-01"));
    await interact(() => fireMouseUp(container));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Add to contact details").click());

    expect(onPromoteSelection).toHaveBeenCalledWith("+7 000 000-00-01");
    expect(onPromoteSelection).not.toHaveBeenCalledWith("call me on +7 000 000-00-01 please");
  });
});

describe("selections the affordance refuses", () => {
  it("offers nothing when nothing is selected at all", async () => {
    const onPromoteSelection = vi.fn();
    const container = await mount(
      [message("m1", 1, { body: "call me on +7 000 000-00-01 please" })],
      onPromoteSelection,
    );

    await interact(() => collapseSelection());
    await interact(() => fireMouseUp(container));

    expect(byText(container, "button", "Add to contact details")).toBeNull();
  });

  it("offers nothing for a collapsed selection inside a message (a plain click, nothing dragged)", async () => {
    const onPromoteSelection = vi.fn();
    const container = await mount(
      [message("m1", 1, { body: "call me on +7 000 000-00-01 please" })],
      onPromoteSelection,
    );

    const body = one(container, ".ago-message__body");
    await interact(() => collapseWithin(body));
    await interact(() => fireMouseUp(container));

    expect(byText(container, "button", "Add to contact details")).toBeNull();
  });

  it("offers nothing when the selection spans two different messages", async () => {
    const onPromoteSelection = vi.fn();
    const container = await mount(
      [
        message("m1", 1, { body: "call me on +7 000 000-00-01" }),
        message("m2", 2, { authorKind: "Operator", authorId: "op-1", body: "thanks, calling now" }),
      ],
      onPromoteSelection,
    );

    const bodies = all(container, ".ago-message__body");
    expect(bodies).toHaveLength(2);
    await interact(() => selectAcross(bodies[0], bodies[1]));
    await interact(() => fireMouseUp(container));

    expect(byText(container, "button", "Add to contact details")).toBeNull();
    expect(onPromoteSelection).not.toHaveBeenCalled();
  });
});
