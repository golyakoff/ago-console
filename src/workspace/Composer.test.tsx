import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerProps } from "./Composer.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `11-08`: **`11-06`'s composer contract**, which until now was a doc comment and a live check.
 *
 * Every rule here is one an operator's hands learn in a day and would notice the loss of within
 * minutes - Enter sends, Shift+Enter does not, Escape clears - and none of them is visible to a
 * typecheck. The IME case is the one that most needs a test: `event.nativeEvent.isComposing` is
 * invisible on a Latin keyboard and sends a half-typed Japanese sentence on every conversion if it
 * regresses, so nobody working in English would ever find it by using the screen.
 *
 * Props, not context: this component takes everything it does from its caller, so the whole contract
 * is observable as "which callback fired with what". `ConversationPage.test.tsx` covers what the page
 * does with those callbacks.
 */
function props(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    draft: "",
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onFileChosen: vi.fn(),
    onRemoveAttachment: vi.fn(),
    pendingAttachment: null,
    uploadProgress: null,
    uploadError: null,
    ...overrides,
  };
}

const REFUND_RESPONSE = { title: "Refund policy", body: "Refunds take three working days." };
const GREETING_RESPONSE = { title: "Greeting", body: "Hi, how can I help?" };

function keyDown(element: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("the composer's keyboard contract", () => {
  it("sends on Enter", async () => {
    const p = props({ draft: "on my way" });
    const container = await render(<Composer {...p} />);

    let event: KeyboardEvent | null = null;
    await interact(() => {
      event = keyDown(one(container, "textarea"), "Enter");
    });

    expect(p.onSend).toHaveBeenCalledTimes(1);
    // The newline the textarea would otherwise insert is suppressed, or the draft the operator just
    // sent would be replaced by an empty line rather than cleared.
    expect(event.defaultPrevented).toBe(true);
  });

  it("starts a new line on Shift+Enter instead of sending", async () => {
    const p = props({ draft: "first line" });
    const container = await render(<Composer {...p} />);

    let event: KeyboardEvent | null = null;
    await interact(() => {
      event = keyDown(one(container, "textarea"), "Enter", { shiftKey: true });
    });

    expect(p.onSend).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not send when Enter is the input method committing a candidate", async () => {
    const p = props({ draft: "こんにちは" });
    const container = await render(<Composer {...p} />);

    await interact(() => {
      keyDown(one(container, "textarea"), "Enter", { isComposing: true });
    });

    expect(p.onSend).not.toHaveBeenCalled();
  });

  it("does not send an empty draft", async () => {
    const p = props({ draft: "   " });
    const container = await render(<Composer {...p} />);

    await interact(() => {
      keyDown(one(container, "textarea"), "Enter");
    });

    expect(p.onSend).not.toHaveBeenCalled();
    expect(byText<HTMLButtonElement>(container, "button", "Send")?.disabled).toBe(true);
  });

  it("clears the draft and any pending attachment on Escape", async () => {
    const p = props({ draft: "never mind", pendingAttachment: { fileName: "screenshot.png" } });
    const container = await render(<Composer {...p} />);

    await interact(() => {
      keyDown(one(container, "textarea"), "Escape");
    });

    expect(p.onDraftChange).toHaveBeenCalledWith("");
    expect(p.onRemoveAttachment).toHaveBeenCalledTimes(1);
    expect(p.onSend).not.toHaveBeenCalled();
  });

  it("enables sending as soon as the draft has something in it", async () => {
    const container = await render(<Composer {...props({ draft: "" })} />);
    expect(byText<HTMLButtonElement>(container, "button", "Send")?.disabled).toBe(true);

    await render(<Composer {...props({ draft: "hello" })} />);
    expect(byText<HTMLButtonElement>(container, "button", "Send")?.disabled).toBe(false);
  });
});

describe("the canned-response picker", () => {
  it("stays closed with an ordinary draft, even one containing a slash mid-sentence", async () => {
    const container = await render(
      <Composer {...props({ draft: "see docs/readme.md", cannedResponses: [REFUND_RESPONSE] })} />,
    );

    expect(container.querySelector("[role=listbox]")).toBeNull();
  });

  it("stays closed when the site has no canned responses, even with a leading slash", async () => {
    const container = await render(<Composer {...props({ draft: "/refund", cannedResponses: [] })} />);

    expect(container.querySelector("[role=listbox]")).toBeNull();
  });

  it("opens on a leading slash and lists every response with nothing typed after it", async () => {
    const container = await render(
      <Composer {...props({ draft: "/", cannedResponses: [REFUND_RESPONSE, GREETING_RESPONSE] })} />,
    );

    const options = all(container, "[role=option]").map((o) => o.textContent);
    expect(options).toEqual(["Refund policy", "Greeting"]);
  });

  it("filters by title as the query grows", async () => {
    const container = await render(
      <Composer {...props({ draft: "/ref", cannedResponses: [REFUND_RESPONSE, GREETING_RESPONSE] })} />,
    );

    const options = all(container, "[role=option]").map((o) => o.textContent);
    expect(options).toEqual(["Refund policy"]);
  });

  it("says so, rather than showing an empty list, when nothing matches", async () => {
    const container = await render(
      <Composer {...props({ draft: "/nothing-like-this", cannedResponses: [REFUND_RESPONSE] })} />,
    );

    expect(container.querySelector("[role=listbox]")).toBeNull();
    expect(container.textContent).toContain("No canned response matches");
  });

  it("moves the highlight with ArrowDown/ArrowUp and never past either end", async () => {
    const container = await render(
      <Composer {...props({ draft: "/", cannedResponses: [REFUND_RESPONSE, GREETING_RESPONSE] })} />,
    );
    const textarea = one(container, "textarea");
    const highlightedTitle = () => one(container, "[role=option][aria-selected=true]").textContent;

    expect(highlightedTitle()).toBe("Refund policy");

    await interact(() => keyDown(textarea, "ArrowDown"));
    expect(highlightedTitle()).toBe("Greeting");

    // The end stops rather than wraps - `conversationAfter` (`shortcuts.ts`) makes the identical
    // choice for `J`/`K`, for the identical reason: a boundary the operator can feel.
    await interact(() => keyDown(textarea, "ArrowDown"));
    expect(highlightedTitle()).toBe("Greeting");

    await interact(() => keyDown(textarea, "ArrowUp"));
    expect(highlightedTitle()).toBe("Refund policy");

    await interact(() => keyDown(textarea, "ArrowUp"));
    expect(highlightedTitle()).toBe("Refund policy");
  });

  it("resets the highlight to the top match whenever the filter changes", async () => {
    const p = props({ draft: "/", cannedResponses: [REFUND_RESPONSE, GREETING_RESPONSE] });
    const container = await render(<Composer {...p} />);
    const textarea = one(container, "textarea");

    await interact(() => keyDown(textarea, "ArrowDown"));
    expect(one(container, "[role=option][aria-selected=true]").textContent).toBe("Greeting");

    // A new render with a narrower query, the same "the parent already applied the typed text" shape
    // this file's other tests use for a controlled `draft` - `Composer` never edits it itself.
    await render(<Composer {...p} draft="/ref" />);

    expect(one(container, "[role=option][aria-selected=true]").textContent).toBe("Refund policy");
  });

  it("inserts the highlighted response on Enter, and does not send", async () => {
    const p = props({ draft: "/ref", cannedResponses: [REFUND_RESPONSE, GREETING_RESPONSE] });
    const container = await render(<Composer {...p} />);

    let event: KeyboardEvent | null = null;
    await interact(() => {
      event = keyDown(one(container, "textarea"), "Enter");
    });

    expect(p.onDraftChange).toHaveBeenCalledWith("Refunds take three working days.");
    expect(p.onSend).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing on Enter when the query matches nothing, rather than sending the literal query", async () => {
    const p = props({ draft: "/nothing-like-this", cannedResponses: [REFUND_RESPONSE] });
    const container = await render(<Composer {...p} />);

    await interact(() => {
      keyDown(one(container, "textarea"), "Enter");
    });

    expect(p.onDraftChange).not.toHaveBeenCalled();
    expect(p.onSend).not.toHaveBeenCalled();
  });

  it("closes on Escape without inserting anything, via the same clear-the-draft path", async () => {
    const p = props({ draft: "/ref", cannedResponses: [REFUND_RESPONSE] });
    const container = await render(<Composer {...p} />);

    await interact(() => {
      keyDown(one(container, "textarea"), "Escape");
    });

    expect(p.onDraftChange).toHaveBeenCalledWith("");
    expect(p.onSend).not.toHaveBeenCalled();
  });

  it("inserts on a pointer click too, without losing focus first", async () => {
    const p = props({ draft: "/", cannedResponses: [REFUND_RESPONSE, GREETING_RESPONSE] });
    const container = await render(<Composer {...p} />);
    const option = byText(container, "[role=option]", "Greeting");

    let event: MouseEvent | null = null;
    await interact(() => {
      event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      option.dispatchEvent(event);
    });

    expect(p.onDraftChange).toHaveBeenCalledWith("Hi, how can I help?");
    // `preventDefault` on `mousedown` is what stops the browser's own default focus-and-blur handling
    // from firing before this component's own handler does - see `Composer.tsx`'s own remarks.
    expect(event.defaultPrevented).toBe(true);
  });

  it("names the picker's own keys on the textarea via ARIA, only while it is open", async () => {
    const closed = await render(<Composer {...props({ draft: "", cannedResponses: [REFUND_RESPONSE] })} />);
    const closedTextarea = one(closed, "textarea");
    expect(closedTextarea.getAttribute("aria-expanded")).toBe("false");
    expect(closedTextarea.hasAttribute("aria-controls")).toBe(false);

    const open = await render(<Composer {...props({ draft: "/ref", cannedResponses: [REFUND_RESPONSE] })} />);
    const openTextarea = one(open, "textarea");
    expect(openTextarea.getAttribute("aria-expanded")).toBe("true");
    expect(openTextarea.getAttribute("aria-controls")).toBe(one(open, "[role=listbox]").id);
    expect(openTextarea.getAttribute("aria-activedescendant")).toBe(one(open, "[role=option]").id);
  });

  it("advertises the trigger in the hint only when the site has something to offer", async () => {
    const withResponses = await render(
      <Composer {...props({ draft: "", cannedResponses: [REFUND_RESPONSE] })} />,
    );
    expect(withResponses.textContent).toContain("Type / to insert a canned response");

    const withoutResponses = await render(<Composer {...props({ draft: "", cannedResponses: [] })} />);
    expect(withoutResponses.textContent).not.toContain("Type / to insert a canned response");
  });
});

describe("the composer's file paths", () => {
  it("takes a pasted screenshot as an attachment", async () => {
    const p = props();
    const container = await render(<Composer {...p} />);
    const file = new File(["png bytes"], "screenshot.png", { type: "image/png" });

    await interact(() => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
      one(container, "textarea").dispatchEvent(event);
    });

    expect(p.onFileChosen).toHaveBeenCalledWith(file);
  });

  it("leaves an ordinary text paste alone", async () => {
    const p = props();
    const container = await render(<Composer {...p} />);

    let event: Event | null = null;
    await interact(() => {
      event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { files: [] } });
      one(container, "textarea").dispatchEvent(event);
    });

    expect(p.onFileChosen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("attaches the first of several dropped files and says so rather than discarding them silently", async () => {
    const p = props();
    const container = await render(<Composer {...p} />);
    const first = new File(["a"], "first.png", { type: "image/png" });
    const second = new File(["b"], "second.png", { type: "image/png" });

    await interact(() => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: { files: [first, second] } });
      one(container, ".ago-composer").dispatchEvent(event);
    });

    expect(p.onFileChosen).toHaveBeenCalledWith(first);
    expect(container.textContent).toContain("Only the first file was attached");
  });
});

/**
 * `19-01`: "Suggest a reply" - absent when the caller supplies no `onSuggestReply` (the same
 * "omit rather than render a disabled dead control" shape every other optional prop here follows),
 * present and wired to the callback otherwise, disabled while `suggestingReply`, and showing whatever
 * error text the caller hands it. `ConversationPage.test.tsx` covers what actually happens when it is
 * clicked for real (the request, the draft it fills, the trust boundary it never crosses).
 */
describe("the suggest-a-reply control", () => {
  it("is absent when the caller supplies no onSuggestReply", async () => {
    const p = props();
    const container = await render(<Composer {...p} />);

    expect(byText(container, "button", "Suggest a reply")).toBeNull();
  });

  it("calls onSuggestReply when clicked", async () => {
    const onSuggestReply = vi.fn();
    const p = props({ onSuggestReply });
    const container = await render(<Composer {...p} />);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Suggest a reply")?.click());

    expect(onSuggestReply).toHaveBeenCalledTimes(1);
  });

  it("shows the generating label and disables itself while suggestingReply is true", async () => {
    const p = props({ onSuggestReply: vi.fn(), suggestingReply: true });
    const container = await render(<Composer {...p} />);

    expect(byText(container, "button", "Suggest a reply")).toBeNull();
    const generating = byText<HTMLButtonElement>(container, "button", "Generating a suggestion…");
    expect(generating).not.toBeNull();
    expect(generating?.disabled).toBe(true);
  });

  it("shows the caller's own error text", async () => {
    const p = props({ onSuggestReply: vi.fn(), suggestReplyError: "The AI suggestion is temporarily unavailable." });
    const container = await render(<Composer {...p} />);

    expect(container.textContent).toContain("The AI suggestion is temporarily unavailable.");
  });

  it("never touches the draft on its own - only ConversationPage's onSuggestReply callback may", async () => {
    const onSuggestReply = vi.fn();
    const p = props({ draft: "what the operator already typed", onSuggestReply });
    const container = await render(<Composer {...p} />);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Suggest a reply")?.click());

    expect(p.onDraftChange).not.toHaveBeenCalled();
    expect(one<HTMLTextAreaElement>(container, "textarea").value).toBe("what the operator already typed");
  });
});
