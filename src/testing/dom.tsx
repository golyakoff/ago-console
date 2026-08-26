import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The mounting boilerplate `testing.md`'s "Component / behaviour" level needs, shared by this
 * repository's behaviour tests (`11-08`).
 *
 * **No testing-library.** `5-16` got the first component tests in this repository working with React
 * 19's own `act` plus `createRoot` in the already-configured jsdom environment, and nothing here
 * needed more: a query helper is `container.querySelector`, and firing a real DOM event is
 * `element.dispatchEvent`. A dependency has to replace something or beat hand-rolling
 * (`CLAUDE.md`); this file is what hand-rolling costs, and it is forty lines.
 *
 * Nothing here is imported by application code, so none of it reaches a build.
 */

// React 19 refuses to treat `act` as an act scope unless this is set, and warns on every render
// otherwise. Set once here rather than in each test file's `beforeEach` (which is what `5-16` had to
// do before this helper existed) - importing this module is what a file needs it for.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom implements no layout, so it has no `scrollIntoView` at all - `Thread`'s "keep the newest
// message in view" effect would throw on every render rather than fail an assertion. Given a no-op
// because there is nothing here to assert about it: whether the thread really scrolls is a layout
// question, which belongs to live verification (`testing.md`), not to a DOM with no viewport.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => undefined;
}

// `11-09`: jsdom parses `<dialog>` and reflects its `open` attribute, but implements neither
// `showModal()` nor `close()` - so `Dialog` (`11-05`) throws "element.showModal is not a function"
// on the first render of any component that opens one. The same shape as the `scrollIntoView` patch
// above, and for the same reason: the missing capability is a *browser* one, and its real behaviour
// (focus trapping, the top layer, inertness, the backdrop) is the platform's own and not something a
// DOM with no viewport could assert anything about.
//
// What is emulated is only the part a test can legitimately observe - `open`, and the `close` event
// React binds `onClose` to. `18-05` already leans on `open` from the other side, since
// `isTypingTarget` treats anything inside a `dialog[open]` as a text field.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) {
      return;
    }

    this.open = false;
    // Non-bubbling, exactly as the real event is. React 19 attaches a direct listener for `onClose`
    // rather than relying on delegation, so this reaches the component.
    this.dispatchEvent(new Event("close"));
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Renders (or re-renders) `node` into a fresh document-attached container. */
export async function render(node: ReactNode): Promise<HTMLElement> {
  if (container === null || root === null) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const mountPoint = root;
  await act(async () => {
    mountPoint.render(node);
    await flush();
  });

  return container;
}

/** Tears down whatever `render` mounted. Call from `afterEach`. */
export async function unmount(): Promise<void> {
  const mounted = root;
  const host = container;
  root = null;
  container = null;
  if (mounted === null) {
    return;
  }

  await act(async () => {
    mounted.unmount();
    await Promise.resolve();
  });
  host?.remove();
}

/** Drains the microtask queue the fakes' own already-resolved promises sit on. Tests that need
 * timers advance them explicitly with `vi.advanceTimersByTimeAsync`; nothing here waits on wall
 * clock. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Runs `body` inside `act` and then drains, which is what every user interaction needs. */
export async function interact(body: () => void): Promise<void> {
  await act(async () => {
    body();
    await flush();
  });
}

/** The one element matching `selector`, or a failure that names what was missing - an assertion on
 * `null` reads as "expected null to have text", which says nothing about what went wrong. */
export function one<T extends Element>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`no element matched ${selector}`);
  }

  return element;
}

export function all(scope: ParentNode, selector: string): Element[] {
  return Array.from(scope.querySelectorAll(selector));
}

/** Finds a control by the text a person reads on it - a button's label, a link's text. Deliberately
 * not by class name: `testing.md` forbids asserting "the button has class x", and finding by class
 * would put the same brittleness one level earlier, in the query. */
export function byText<T extends Element>(scope: ParentNode, selector: string, text: string): T | null {
  return Array.from(scope.querySelectorAll<T>(selector)).find((element) => (element.textContent ?? "").trim() === text) ?? null;
}
