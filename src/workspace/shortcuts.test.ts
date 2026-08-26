import { describe, expect, it } from "vitest";
import { conversationAfter, isTypingTarget, matchShortcut, SHORTCUTS } from "./shortcuts.js";

/**
 * `18-05`: the keyboard catalogue, tested where the decisions actually are.
 *
 * None of this needs a workspace, a router or a hub connection - which is the reason `shortcuts.ts`
 * is data plus two pure functions rather than a `switch` inside an event handler. The listener that
 * consumes it is `useShortcuts.test.tsx`.
 */
describe("matching a keypress to a shortcut", () => {
  it("maps the bare letters the help dialog advertises", () => {
    expect(matchShortcut({ key: "j" })).toBe("nextConversation");
    expect(matchShortcut({ key: "k" })).toBe("previousConversation");
    expect(matchShortcut({ key: "c" })).toBe("focusComposer");
    expect(matchShortcut({ key: "Escape" })).toBe("closeThread");
    expect(matchShortcut({ key: "?", shiftKey: true })).toBe("showHelp");
  });

  it("ignores anything held with a modifier", () => {
    // `Ctrl+C` is copy. `Cmd+K` is a browser command on some platforms. A letter is only ours while
    // it is the bare letter - the moment a modifier is down, the keypress belongs to the browser or
    // the operating system.
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(matchShortcut({ key: "c", [modifier]: true })).toBeNull();
      expect(matchShortcut({ key: "j", [modifier]: true })).toBeNull();
      expect(matchShortcut({ key: "Escape", [modifier]: true })).toBeNull();
    }
  });

  it("ignores a shifted letter, while still allowing the one shortcut that needs Shift", () => {
    // `Shift+J` is a capital J somebody meant to type somewhere. `?` cannot be produced without
    // Shift on most layouts, so it is the single exception.
    expect(matchShortcut({ key: "J", shiftKey: true })).toBeNull();
    expect(matchShortcut({ key: "?", shiftKey: true })).toBe("showHelp");
  });

  it("has nothing to say about an ordinary letter", () => {
    expect(matchShortcut({ key: "a" })).toBeNull();
    expect(matchShortcut({ key: "Enter" })).toBeNull();
  });

  it("advertises every shortcut it can dispatch", () => {
    // The help dialog renders `SHORTCUTS`; the handler dispatches on `matchShortcut`. If those two
    // ever drift, a shortcut exists that nothing tells the operator about - which is the exact
    // promise the item's "discoverable" wording makes. Checked here rather than trusted.
    const advertised = new Set(SHORTCUTS.map((shortcut) => shortcut.id));
    const dispatchable = [
      matchShortcut({ key: "j" }),
      matchShortcut({ key: "k" }),
      matchShortcut({ key: "c" }),
      matchShortcut({ key: "Escape" }),
      matchShortcut({ key: "?", shiftKey: true }),
    ];

    expect(advertised.size).toBe(SHORTCUTS.length);
    for (const id of dispatchable) {
      expect(id).not.toBeNull();
      expect(advertised.has(id)).toBe(true);
    }
  });
});

describe("deciding whether a keypress landed somewhere a person is typing", () => {
  function element(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild;
  }

  it("treats every text-entry control as typing", () => {
    // The guard the whole scheme rests on: without it, an operator writing "just checking" moves
    // conversation twice and closes the thread before finishing the word.
    expect(isTypingTarget(element("<textarea></textarea>"))).toBe(true);
    expect(isTypingTarget(element("<input />"))).toBe(true);
    expect(isTypingTarget(element("<select></select>"))).toBe(true);
    expect(isTypingTarget(element("<div contenteditable='true'></div>"))).toBe(true);
  });

  it("looks through a nested element inside an editable region", () => {
    const editable = element("<div contenteditable='true'><span>inner</span></div>");
    expect(isTypingTarget(editable.querySelector("span"))).toBe(true);
  });

  it("does not treat contenteditable='false' as typing", () => {
    // The attribute's own opt-out. Reading only for the attribute's *presence* would make every
    // explicitly non-editable region swallow shortcuts.
    expect(isTypingTarget(element("<div contenteditable='false'></div>"))).toBe(false);
  });

  it("treats anything inside an open dialog as typing", () => {
    // So Escape closes the help dialog as a dialog rather than also firing close-the-thread behind
    // it, which would dump the operator back to the list they did not ask to leave.
    const dialog = element("<dialog open><button>Close</button></dialog>");
    expect(isTypingTarget(dialog.querySelector("button"))).toBe(true);
  });

  it("says no for the page body and for a non-element target", () => {
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(new EventTarget())).toBe(false);
  });
});

describe("where J and K land", () => {
  const order = ["a", "b", "c"];

  it("moves one step in the list as drawn", () => {
    expect(conversationAfter(order, "a", 1)).toBe("b");
    expect(conversationAfter(order, "b", -1)).toBe("a");
  });

  it("stops at both ends rather than wrapping", () => {
    // An operator holding J through a wrapping list cycles for ever and cannot tell they reached the
    // end. Stopping is a fact they can feel.
    expect(conversationAfter(order, "c", 1)).toBeNull();
    expect(conversationAfter(order, "a", -1)).toBeNull();
  });

  it("opens an end of the list when nothing is selected", () => {
    expect(conversationAfter(order, null, 1)).toBe("a");
    expect(conversationAfter(order, null, -1)).toBe("c");
  });

  it("still moves when the open conversation is not in the list", () => {
    // Reached by direct URL, or no longer assigned. The list is still navigable and refusing to move
    // would strand the operator on a row the rail does not show.
    expect(conversationAfter(order, "somewhere-else", 1)).toBe("a");
  });

  it("does nothing with an empty list", () => {
    expect(conversationAfter([], null, 1)).toBeNull();
    expect(conversationAfter([], "a", -1)).toBeNull();
  });
});
