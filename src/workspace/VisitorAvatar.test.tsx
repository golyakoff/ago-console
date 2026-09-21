import { afterEach, describe, expect, it } from "vitest";
import { VisitorAvatar } from "./VisitorAvatar.js";
import { all, one, render, unmount } from "../testing/dom.js";

afterEach(async () => {
  await unmount();
});

/**
 * `25-207`: the badge composition itself - `ConversationList.test.tsx`/`ConversationPage.test.tsx`
 * already prove this renders correctly at all three real call sites; this file is the
 * component-level, render-shape proof in isolation (`testing.md`'s "Component / behaviour" level),
 * the same split every other shared component in this codebase (`Badge.test.tsx`, `Tooltip.test.tsx`)
 * already keeps between "does the component itself render right" and "does a caller wire it up right".
 */
describe("VisitorAvatar", () => {
  it("renders the creature centered and the food as a badge, both in their own element", async () => {
    const container = await render(<VisitorAvatar emojiCreature="🦉" emojiFood="🍓" />);

    const avatar = one(container, ".ago-visitor-avatar");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(one(container, ".ago-visitor-avatar__creature").textContent).toBe("🦉");
    expect(one(container, ".ago-visitor-avatar__food").textContent).toBe("🍓");
  });

  it("renders a trailing space after the avatar, so a caller never has to supply its own", async () => {
    const container = await render(<VisitorAvatar emojiCreature="🦉" emojiFood="🍓" />);
    expect(container.textContent).toBe("🦉🍓 ");
  });

  it("renders nothing - no element, no stray space - when the pair is absent", async () => {
    const container = await render(<VisitorAvatar />);
    expect(all(container, ".ago-visitor-avatar")).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when only one half of the pair is present", async () => {
    const container = await render(<VisitorAvatar emojiCreature="🦉" emojiFood={null} />);
    expect(all(container, ".ago-visitor-avatar")).toHaveLength(0);
  });
});
