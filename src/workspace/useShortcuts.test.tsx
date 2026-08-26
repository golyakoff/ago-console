import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShortcuts, type ShortcutHandlers } from "./useShortcuts.js";
import { interact, one, render, unmount } from "../testing/dom.js";

/**
 * `18-05`: the listener half - which keypresses actually reach a handler.
 *
 * The second block is what this file is for. "A shortcut does nothing while the composer has focus"
 * is the difference between a keyboard scheme and a trap: an operator writing a sentence to a
 * visitor must not move conversation on every `j` and close the thread on the space bar's
 * neighbours. `shortcuts.test.ts` proves `isTypingTarget` classifies elements correctly; this proves
 * the listener actually consults it before dispatching.
 */
function Harness({ handlers }: { handlers: ShortcutHandlers }) {
  useShortcuts(handlers);

  return (
    <div>
      <textarea aria-label="Message to send" />
      <input aria-label="A search box" />
      <button type="button">A button</button>
      <dialog open>
        <button type="button">Dialog button</button>
      </dialog>
    </div>
  );
}

function keyDown(target: Element | Document, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function spies(): Required<Pick<ShortcutHandlers, "nextConversation" | "focusComposer" | "closeThread" | "showHelp">> {
  return {
    nextConversation: vi.fn(),
    focusComposer: vi.fn(),
    closeThread: vi.fn(),
    showHelp: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("dispatching a shortcut", () => {
  it("runs the handler for a key pressed on the page itself", async () => {
    const handlers = spies();
    await render(<Harness handlers={handlers} />);

    let event: KeyboardEvent | null = null;
    await interact(() => {
      event = keyDown(document.body, "j");
    });

    expect(handlers.nextConversation).toHaveBeenCalledTimes(1);
    // The keypress is claimed only because something ran with it.
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a key with no handler entirely alone", async () => {
    // `?` with no help dialog wired must still do whatever the browser would have done. Only a
    // shortcut that actually ran claims its keypress.
    await render(<Harness handlers={{}} />);

    let event: KeyboardEvent | null = null;
    await interact(() => {
      event = keyDown(document.body, "?", { shiftKey: true });
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("stops listening once unmounted", async () => {
    const handlers = spies();
    await render(<Harness handlers={handlers} />);
    await unmount();

    await interact(() => {
      keyDown(document.body, "j");
    });

    expect(handlers.nextConversation).not.toHaveBeenCalled();
  });
});

describe("keeping out of the way of anyone typing", () => {
  it("does nothing while the composer holds the keypress", async () => {
    // The requirement, stated as its failure: an operator typing "just checking" would otherwise
    // move conversation twice (`j`, `c`) before finishing the phrase.
    const handlers = spies();
    const container = await render(<Harness handlers={handlers} />);
    const composer = one<HTMLTextAreaElement>(container, "textarea");

    let event: KeyboardEvent | null = null;
    await interact(() => {
      composer.focus();
      event = keyDown(composer, "j");
    });

    expect(handlers.nextConversation).not.toHaveBeenCalled();
    // And the letter is left alone, so it lands in the draft where the operator aimed it.
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not close the thread on Escape while the composer holds it", async () => {
    // `11-06` gave Escape a meaning *inside* the composer - clear the draft. If this listener also
    // fired, one keypress would clear the draft and throw the operator back to the list.
    const handlers = spies();
    const container = await render(<Harness handlers={handlers} />);

    await interact(() => {
      keyDown(one(container, "textarea"), "Escape");
    });

    expect(handlers.closeThread).not.toHaveBeenCalled();
  });

  it("does nothing in any other text field either", async () => {
    const handlers = spies();
    const container = await render(<Harness handlers={handlers} />);

    await interact(() => {
      keyDown(one(container, "input"), "c");
    });

    expect(handlers.focusComposer).not.toHaveBeenCalled();
  });

  it("does nothing inside an open dialog", async () => {
    // So Escape closes the help dialog as a dialog, rather than also closing the thread behind it.
    const handlers = spies();
    const container = await render(<Harness handlers={handlers} />);

    await interact(() => {
      keyDown(one(container, "dialog button"), "Escape");
    });

    expect(handlers.closeThread).not.toHaveBeenCalled();
  });

  it("still works from a control that is not a text field", async () => {
    // A button is focusable and is not somewhere a person types. Treating "anything focusable" as
    // typing would make the shortcuts stop working after any click.
    const handlers = spies();
    const container = await render(<Harness handlers={handlers} />);

    await interact(() => {
      keyDown(one(container, "button"), "j");
    });

    expect(handlers.nextConversation).toHaveBeenCalledTimes(1);
  });

  it("ignores a keypress something else has already handled", async () => {
    const handlers = spies();
    await render(<Harness handlers={handlers} />);

    await interact(() => {
      const event = new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true });
      event.preventDefault();
      document.body.dispatchEvent(event);
    });

    expect(handlers.nextConversation).not.toHaveBeenCalled();
  });
});

describe("the handler identity trap", () => {
  it("dispatches to the newest handlers without re-installing the listener", async () => {
    // The handlers go through a ref precisely so the document listener is installed once. If they
    // were captured instead, a re-render (this component's parent re-renders on a ten-second timer)
    // would leave the first render's closures running for ever.
    const first = vi.fn();
    const second = vi.fn();

    await render(<Harness handlers={{ nextConversation: first }} />);
    await render(<Harness handlers={{ nextConversation: second }} />);

    await interact(() => {
      keyDown(document.body, "j");
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
