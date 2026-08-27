import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CloseConversationButton, CLOSE_PERMISSION } from "./CloseConversationButton.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `11-09`: the control `6-02` shipped a server for in Stage 6 and nobody could press.
 *
 * The first block is the item's own Done-when, worded as it is because "hidden" and "disabled" are
 * one CSS class apart and only one of them is what was asked for: **a test that fails if the control
 * is merely disabled.** Asserting the button is absent would pass against a disabled button only if
 * the query happened to miss it, so the second assertion looks for a disabled control wearing the
 * same label and requires that there is none.
 *
 * A hand-made permissions context rather than the real `PermissionsProvider`: what is under test is
 * this component's own gating, and the path from `GET /api/v1/operators/me` to a rendered control is
 * already covered by `permissionGating.test.tsx`.
 */
function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      hasPermission: (permission: string) => permissions.includes(permission),
      // `13-07`: this file is about the close button's own gating, not the switcher - a single,
      // already-resolved tenancy, the same shape every operator before this item had.
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

interface Handlers {
  onClose: Mock<() => Promise<void>>;
  onClosed: Mock<() => void>;
  onStaleQueue: Mock<() => void>;
}

// vitest 4: `vi.fn()` with no type argument and no typed callee infers the generic
// `Mock<Procedure | Constructable>` `ReturnType<typeof vi.fn>` used to paper over pre-4 - explicit
// generics on the two no-callee calls are what `CloseConversationButtonProps`'s own `() => void`
// signatures need to line up against.
function handlers(onClose: () => Promise<void> = () => Promise.resolve()): Handlers {
  return { onClose: vi.fn(onClose), onClosed: vi.fn<() => void>(), onStaleQueue: vi.fn<() => void>() };
}

async function mount(permissions: string[], h: Handlers): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <CloseConversationButton onClose={h.onClose} onClosed={h.onClosed} onStaleQueue={h.onStaleQueue} />
    </Permitted>,
  );
}

/** The confirmation's own destructive action. Its label changes to "Try again" after a retryable
 * failure, which is itself asserted below. */
function confirmButton(container: ParentNode): HTMLButtonElement {
  const button =
    byText<HTMLButtonElement>(container, "button", "Close it") ??
    byText<HTMLButtonElement>(container, "button", "Try again");
  if (button === null) {
    throw new Error("the confirmation dialog has no destructive action");
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
  it("offers it to an operator holding conversation:close", async () => {
    const container = await mount([CLOSE_PERMISSION], handlers());

    expect(byText(container, "button", "Close conversation")).not.toBeNull();
  });

  it("does not render it at all for an operator without the permission — not even disabled", async () => {
    // The item's own Done-when, and the reason it is worded that way: a disabled button still
    // advertises that the action exists and still ships its markup to somebody who will never use
    // it. That is a different product decision from not having it.
    const container = await mount(["conversation:read"], handlers());

    expect(byText(container, "button", "Close conversation")).toBeNull();
    // The assertion that makes this fail against a merely-disabled control rather than passing by
    // accident: nothing disabled is wearing the label either.
    expect(all(container, "button[disabled]")).toHaveLength(0);
    expect(container.textContent).not.toContain("Close conversation");
  });

  it("renders nothing whatsoever, not an empty wrapper", async () => {
    const container = await mount([], handlers());

    expect(all(container, "button")).toHaveLength(0);
    expect(all(container, "dialog")).toHaveLength(0);
  });
});

describe("the confirmation", () => {
  it("does not close anything until it is confirmed", async () => {
    // Closing is terminal - `Conversation.Close()` has no path back - and it hands the operator's
    // capacity claim to the assignment engine. A single misfired click is not recoverable here.
    const h = handlers();
    const container = await mount([CLOSE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation").click());

    expect(h.onClose).not.toHaveBeenCalled();
    expect(one(container, "dialog").textContent).toContain("cannot be reopened");
  });

  it("closes once, and tells the page, when confirmed", async () => {
    const h = handlers();
    const container = await mount([CLOSE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation").click());
    await interact(() => confirmButton(container).click());

    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(h.onClosed).toHaveBeenCalledTimes(1);
    expect(h.onStaleQueue).not.toHaveBeenCalled();
  });

  it("closes nothing when the operator cancels", async () => {
    const h = handlers();
    const container = await mount([CLOSE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation").click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(h.onClose).not.toHaveBeenCalled();
    expect(h.onClosed).not.toHaveBeenCalled();
  });
});

describe("what the operator is told when it does not work", () => {
  async function attemptWith(error: Error): Promise<{ container: HTMLElement; h: Handlers }> {
    const h = handlers(() => Promise.reject(error));
    const container = await mount([CLOSE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation").click());
    await interact(() => confirmButton(container).click());

    return { container, h };
  }

  it("names an already-closed conversation, and stops offering to retry", async () => {
    const { container, h } = await attemptWith(
      new ApiProblemError("Conversation.InvalidState", "server wording", 409),
    );

    expect(container.textContent).toContain("This conversation has already been closed.");
    // Not a generic failure, and not the server's raw sentence either.
    expect(container.textContent).not.toContain("server wording");
    expect(byText(container, "button", "Try again")).toBeNull();
    // The queue this tab holds is stale, so the page is told.
    expect(h.onStaleQueue).toHaveBeenCalledTimes(1);
    expect(h.onClosed).not.toHaveBeenCalled();
  });

  it("names a reassignment underneath, and does not blame the operator's permissions", async () => {
    const { container, h } = await attemptWith(
      new ApiProblemError("Conversation.Forbidden", "server wording", 403),
    );

    expect(container.textContent).toContain("no longer assigned to you");
    expect(container.textContent).not.toContain("permission");
    expect(h.onStaleQueue).toHaveBeenCalledTimes(1);
  });

  it("offers a retry, and only a retry, for a lost race", async () => {
    // `6-08`'s own code. The two 409s reach the operator as different sentences with different
    // affordances, which is the whole substance of the item's last Done-when.
    const { container, h } = await attemptWith(
      new ApiProblemError("Conversation.ConcurrencyConflict", "server wording", 409),
    );

    expect(container.textContent).toContain("Try closing it again");
    expect(byText(container, "button", "Try again")).not.toBeNull();
    // Nothing is known to have changed, so the rail is left alone.
    expect(h.onStaleQueue).not.toHaveBeenCalled();
  });

  it("succeeds on a retry after a lost race", async () => {
    let attempts = 0;
    const h = handlers(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new ApiProblemError("Conversation.ConcurrencyConflict", "x", 409))
        : Promise.resolve();
    });
    const container = await mount([CLOSE_PERMISSION], h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation").click());
    await interact(() => confirmButton(container).click());
    await interact(() => confirmButton(container).click());

    expect(attempts).toBe(2);
    expect(h.onClosed).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open on a failure", async () => {
    // The operator is mid-decision. Dismissing the dialog would put the explanation somewhere they
    // are no longer looking.
    const { container } = await attemptWith(
      new ApiProblemError("Conversation.NotFound", "server wording", 404),
    );

    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(true);
    expect(container.textContent).toContain("no longer exists");
  });
});
