import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CloseAsSpamButton, CLOSE_AS_SPAM_PERMISSION } from "./CloseAsSpamButton.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/** `23-69`: the console's own half of "close as spam" - the identical permission-gating shape
 * `CloseConversationButton.test.tsx` already establishes, restated for the new dedicated permission
 * and the new dialog copy. Failure-message coverage is intentionally thin here: `CloseAsSpamButton`
 * reuses `closeOutcomeFor` directly, and that function's own four branches are already proven by
 * `closeOutcome.test.ts` and `CloseConversationButton.test.tsx` - this file only needs to prove the
 * reuse actually wires through, not re-litigate each branch. */
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
  onCloseAsSpam: Mock<() => Promise<{ mutedUntil: string }>>;
  onClosed: Mock<() => void>;
  onStaleQueue: Mock<() => void>;
}

function handlers(
  onCloseAsSpam: () => Promise<{ mutedUntil: string }> = () => Promise.resolve({ mutedUntil: "2026-01-02T12:00:00Z" }),
): Handlers {
  return { onCloseAsSpam: vi.fn(onCloseAsSpam), onClosed: vi.fn<() => void>(), onStaleQueue: vi.fn<() => void>() };
}

async function mount(permissions: string[], h: Handlers): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <CloseAsSpamButton onCloseAsSpam={h.onCloseAsSpam} onClosed={h.onClosed} onStaleQueue={h.onStaleQueue} />
    </Permitted>,
  );
}

function confirmButton(container: ParentNode): HTMLButtonElement {
  const button =
    byText<HTMLButtonElement>(container, "button", "Yes, close as spam") ??
    byText<HTMLButtonElement>(container, "button", "Try again");
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
  it("offers it to an operator holding conversation:mark_spam", async () => {
    const container = await mount([CLOSE_AS_SPAM_PERMISSION], handlers());

    expect(byText(container, "button", "Close as spam")).not.toBeNull();
  });

  it("does not render it at all for an operator without the permission — not even disabled", async () => {
    const container = await mount(["conversation:close"], handlers());

    expect(container.textContent).not.toContain("Close as spam");
    expect(all(container, "button[disabled]")).toHaveLength(0);
  });
});

describe("the confirmation", () => {
  it("does not close anything until it is confirmed", async () => {
    const h = handlers();
    const container = await mount([CLOSE_AS_SPAM_PERMISSION], h);

    // Two buttons share the label at this point: the row action that opens the dialog, and (once
    // open) the dialog's own confirm action - clicking the first must not itself close anything.
    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());

    expect(h.onCloseAsSpam).not.toHaveBeenCalled();
    expect(one(container, "dialog").textContent).toContain("muted for 24 hours");
  });

  it("closes and mutes once, and tells the page, when confirmed", async () => {
    const h = handlers();
    const container = await mount([CLOSE_AS_SPAM_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());
    await interact(() => confirmButton(container).click());

    expect(h.onCloseAsSpam).toHaveBeenCalledTimes(1);
    expect(h.onClosed).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the operator cancels", async () => {
    const h = handlers();
    const container = await mount([CLOSE_AS_SPAM_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(h.onCloseAsSpam).not.toHaveBeenCalled();
    expect(h.onClosed).not.toHaveBeenCalled();
  });

  it("shows the server's own reported failure and keeps the dialog open", async () => {
    const h = handlers(() => Promise.reject(new ApiProblemError("Conversation.Forbidden", "server wording", 403)));
    const container = await mount([CLOSE_AS_SPAM_PERMISSION], h);

    await interact(() => (all(container, "button")[0] as HTMLButtonElement).click());
    await interact(() => confirmButton(container).click());

    expect(container.textContent).toContain("no longer assigned to you");
    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(true);
    expect(h.onClosed).not.toHaveBeenCalled();
  });
});
