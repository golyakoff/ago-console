import { afterEach, describe, expect, it, vi } from "vitest";
import { AwayControl } from "./AwayControl.js";
import { byText, one, interact, render, unmount } from "../testing/dom.js";

/**
 * `23-20`: the console side of the item's own done-when - a control the operator can act on, and one
 * that says what it does, both before and while it is in effect. The domain/hub-level defect (a
 * reconnect must not silently clear a deliberate Away) is proven in `ago-chat`'s own tests; this file
 * is about the surface `flows.md` 2.5 says does not exist yet.
 */
afterEach(async () => {
  await unmount();
});

describe("while online", () => {
  it("offers a button that says what going away does, before the click", async () => {
    const onToggle = vi.fn(() => Promise.resolve());
    const container = await render(<AwayControl isAway={false} onToggle={onToggle} />);

    const button = byText<HTMLButtonElement>(container, "button", "Step away");
    expect(button).not.toBeNull();
    expect(button.title).toContain("New conversations stop being routed to you");

    // No persistent notice yet - the effect has not happened.
    expect(container.textContent).not.toContain("You're marked away");
  });

  it("calls onToggle(true) when clicked", async () => {
    const onToggle = vi.fn(() => Promise.resolve());
    const container = await render(<AwayControl isAway={false} onToggle={onToggle} />);
    const button = byText<HTMLButtonElement>(container, "button", "Step away");

    await interact(() => button.click());

    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe("while away", () => {
  it("shows a persistent, visible notice - not only a tooltip - naming the effect on visitors", async () => {
    const onToggle = vi.fn(() => Promise.resolve());
    const container = await render(<AwayControl isAway={true} onToggle={onToggle} />);

    expect(container.textContent).toContain("You're marked away");
    expect(container.textContent).toContain("automatic away reply");
    // And the button now offers the way back.
    expect(byText(container, "button", "I'm back")).not.toBeNull();
  });

  it("calls onToggle(false) - coming back - when clicked", async () => {
    const onToggle = vi.fn(() => Promise.resolve());
    const container = await render(<AwayControl isAway={true} onToggle={onToggle} />);
    const button = byText<HTMLButtonElement>(container, "button", "I'm back");

    await interact(() => button.click());

    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe("when the toggle fails", () => {
  it("shows the failure rather than silently doing nothing", async () => {
    const onToggle = vi.fn(() => Promise.reject(new Error("hub connection lost")));
    const container = await render(<AwayControl isAway={false} onToggle={onToggle} />);
    const button = one<HTMLButtonElement>(container, "button");

    await interact(() => button.click());

    expect(container.textContent).toContain("hub connection lost");
  });
});
