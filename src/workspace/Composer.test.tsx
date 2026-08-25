import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerProps } from "./Composer.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

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
