import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { BlockVisitorButton, BLOCK_VISITOR_PERMISSION } from "./BlockVisitorButton.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/** `23-77`: the console's own half of "block visitor" - the identical permission-gating and
 * confirm-dialog shape `CloseConversationButton.test.tsx`/`CloseAsSpamButton.test.tsx` already
 * establish, restated for `conversation:block` and a control that does not close the conversation. */
function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      locale: null,
      enabledModules: [],
      credentialsArePublished: false,
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
  onBlock: Mock<() => Promise<void>>;
  onBlocked: Mock<() => void>;
}

function handlers(onBlock: () => Promise<void> = () => Promise.resolve()): Handlers {
  return { onBlock: vi.fn(onBlock), onBlocked: vi.fn<() => void>() };
}

async function mount(permissions: string[], h: Handlers): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <BlockVisitorButton onBlock={h.onBlock} onBlocked={h.onBlocked} />
    </Permitted>,
  );
}

function confirmButton(container: ParentNode): HTMLButtonElement {
  const button = byText<HTMLButtonElement>(container, "button", "Yes, block");
  if (button === null) {
    throw new Error("the confirmation dialog has no confirm action");
  }

  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the control", () => {
  it("offers it to an operator holding conversation:block", async () => {
    const container = await mount([BLOCK_VISITOR_PERMISSION], handlers());

    expect(byText(container, "button", "Block visitor")).not.toBeNull();
  });

  it("does not render it at all for an operator without the permission — not even disabled", async () => {
    const container = await mount(["conversation:close"], handlers());

    expect(container.textContent).not.toContain("Block visitor");
    expect(all(container, "button[disabled]")).toHaveLength(0);
  });
});

describe("the confirmation", () => {
  it("does not block anything until it is confirmed", async () => {
    const h = handlers();
    const container = await mount([BLOCK_VISITOR_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());

    expect(h.onBlock).not.toHaveBeenCalled();
    expect(one(container, "dialog").textContent).toContain("blocked on this site, indefinitely");
  });

  it("blocks once, and tells the page, when confirmed", async () => {
    const h = handlers();
    const container = await mount([BLOCK_VISITOR_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());
    await interact(() => confirmButton(container).click());

    expect(h.onBlock).toHaveBeenCalledTimes(1);
    expect(h.onBlocked).toHaveBeenCalledTimes(1);
  });

  it("blocks nothing when the operator cancels", async () => {
    const h = handlers();
    const container = await mount([BLOCK_VISITOR_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(h.onBlock).not.toHaveBeenCalled();
    expect(h.onBlocked).not.toHaveBeenCalled();
  });

  it("names a vanished conversation without blaming the operator's permission", async () => {
    const h = handlers(() => Promise.reject(new ApiProblemError("Conversation.NotFound", "server wording", 404)));
    const container = await mount([BLOCK_VISITOR_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());
    await interact(() => confirmButton(container).click());

    expect(container.textContent).toContain("no longer exists");
    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(true);
    expect(h.onBlocked).not.toHaveBeenCalled();
  });

  it("names a permission refusal distinctly from a vanished conversation", async () => {
    const h = handlers(() => Promise.reject(new ApiProblemError("Conversation.Forbidden", "server wording", 403)));
    const container = await mount([BLOCK_VISITOR_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());
    await interact(() => confirmButton(container).click());

    expect(container.textContent).toContain("do not have permission");
  });
});
