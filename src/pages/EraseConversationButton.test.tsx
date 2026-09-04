import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { EraseConversationButton, CONVERSATION_ERASE_PERMISSION } from "./EraseConversationButton.js";
import type { ErasureCheckOutcome } from "../erasure/erasureCheck.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `16-02`: the row action `AdminConversationsPage` offers for erasing one conversation, modeled
 * directly on `CloseConversationButton.test.tsx` for the "hidden, not disabled" gate and the
 * confirm-before-fire shape, plus this item's own new part - a `202` does not finish the story, only
 * a later poll tick does, and the row must not disappear (nor `onErased` fire) before that.
 */
function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      locale: null,
      enabledModules: [],
      hasPermission: (permission: string) => permissions.includes(permission),
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

interface Handlers {
  onErase: Mock<() => Promise<void>>;
  checkErased: Mock<() => Promise<ErasureCheckOutcome>>;
  onErased: Mock<() => void>;
}

function handlers(
  onErase: () => Promise<void> = () => Promise.resolve(),
  checkErased: () => Promise<ErasureCheckOutcome> = () => Promise.resolve("pending"),
): Handlers {
  return { onErase: vi.fn(onErase), checkErased: vi.fn(checkErased), onErased: vi.fn<() => void>() };
}

async function mount(permissions: string[], h: Handlers): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <EraseConversationButton onErase={h.onErase} checkErased={h.checkErased} onErased={h.onErased} />
    </Permitted>,
  );
}

function confirmButton(container: ParentNode): HTMLButtonElement {
  const button = byText<HTMLButtonElement>(container, "button", "Erase it");
  if (button === null) {
    throw new Error("the confirmation dialog has no destructive action");
  }

  return button;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("who is offered the control", () => {
  it("offers it to an operator holding conversation:erase", async () => {
    const container = await mount([CONVERSATION_ERASE_PERMISSION], handlers());

    expect(byText(container, "button", "Erase")).not.toBeNull();
  });

  it("does not render it at all for an operator without the permission - not even disabled", async () => {
    const container = await mount(["conversation:read"], handlers());

    expect(byText(container, "button", "Erase")).toBeNull();
    expect(all(container, "button[disabled]")).toHaveLength(0);
    expect(container.textContent).not.toContain("Erase");
  });
});

describe("the confirmation", () => {
  it("does not erase anything until it is confirmed", async () => {
    const h = handlers();
    const container = await mount([CONVERSATION_ERASE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase").click());

    expect(h.onErase).not.toHaveBeenCalled();
    expect(one(container, "dialog").textContent).toContain("cannot be undone");
  });

  it("erases nothing when the operator cancels", async () => {
    const h = handlers();
    const container = await mount([CONVERSATION_ERASE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase").click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(h.onErase).not.toHaveBeenCalled();
  });
});

describe("after a confirmed erase starts (the 202 case)", () => {
  it("shows an erasing state instead of the button, and does not call onErased on the 202 alone", async () => {
    const h = handlers(() => Promise.resolve(), () => Promise.resolve("pending"));
    const container = await mount([CONVERSATION_ERASE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase").click());
    await interact(() => confirmButton(container).click());

    expect(h.onErase).toHaveBeenCalledTimes(1);
    expect(byText(container, "button", "Erase")).toBeNull();
    expect(container.textContent).toContain("Erasing");
    expect(h.onErased).not.toHaveBeenCalled();
  });

  it("calls onErased only once the poll actually observes completion, never before", async () => {
    const h = handlers(() => Promise.resolve(), () => Promise.resolve("pending"));
    const container = await mount([CONVERSATION_ERASE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase").click());
    await interact(() => confirmButton(container).click());
    expect(h.onErased).not.toHaveBeenCalled();

    // The poll now starts reporting completion.
    h.checkErased.mockResolvedValue("erased");
    await vi.advanceTimersByTimeAsync(3000);

    expect(h.onErased).toHaveBeenCalledTimes(1);
  });

  it("keeps polling, and reports nothing, while the check answers unknown - a dropped connection is not completion", async () => {
    const h = handlers(() => Promise.resolve(), () => Promise.resolve("unknown"));
    const container = await mount([CONVERSATION_ERASE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase").click());
    await interact(() => confirmButton(container).click());
    await vi.advanceTimersByTimeAsync(9000);

    expect(h.onErased).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Erasing");
  });
});

describe("when starting the erasure itself fails", () => {
  it("shows the server's own message and leaves the button in place, not the erasing state", async () => {
    const h = handlers(() => Promise.reject(new ApiProblemError("Conversation.Forbidden", "not your conversation", 403)));
    const container = await mount([CONVERSATION_ERASE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase").click());
    await interact(() => confirmButton(container).click());

    expect(container.textContent).toContain("not your conversation");
    expect(h.onErased).not.toHaveBeenCalled();
    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(true);
  });
});
