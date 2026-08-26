import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertSettings } from "./AlertSettings.js";
import { useAlerts } from "./useAlerts.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `18-05`: **the permission prompt, and the three states of the answer.**
 *
 * The first test is the one this file exists for. The item's reasoning is that a browser permission
 * prompt on first load is the most reliable way to teach somebody to click Block for ever, and the
 * damage is permanent per browser profile - once denied, this page cannot ask again and the operator
 * has to find a setting they will never find. So the requirement is not "we currently call it from a
 * click"; it is "it cannot move". **That test fails the moment `requestPermission()` is called from
 * a mount, an effect, or a render**, which is the only form of this rule worth having.
 *
 * The component takes a real `useAlerts` rather than a stubbed API, because the rule being pinned
 * down lives in the hook and a hand-written fake would prove the fake behaves.
 */
function Harness() {
  const alerts = useAlerts({ openConversationId: null, onOpenConversation: () => undefined });
  return <AlertSettings alerts={alerts} />;
}

let requestPermission: ReturnType<typeof vi.fn>;

/** A `Notification` stub. jsdom has none at all, which is itself one of the four states this
 * component renders for - so every test that is not about that state has to supply one. */
function stubNotification(permission: NotificationPermission, answer: NotificationPermission = "granted") {
  requestPermission = vi.fn(() => Promise.resolve(answer));
  vi.stubGlobal(
    "Notification",
    Object.assign(function () {}, { permission, requestPermission }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  requestPermission = vi.fn();
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the notification permission prompt", () => {
  it("is not requested on mount", async () => {
    stubNotification("default");

    await render(<Harness />);

    // The whole point. Reading `Notification.permission` is fine and happens here - it is a
    // synchronous property read that shows nobody anything. Calling `requestPermission()` is what
    // puts a browser dialog in front of an operator who did not ask for one.
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("is requested when, and only when, the operator turns the switch on", async () => {
    stubNotification("default");
    const container = await render(<Harness />);
    const toggle = one<HTMLInputElement>(container, "input[type='checkbox']");

    await interact(() => toggle.click());

    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("leaves the switch off when the operator is asked and says no", async () => {
    // A control reading "on" while nothing can ever fire is worse than one reading "off".
    stubNotification("default", "denied");
    const container = await render(<Harness />);
    const toggle = one<HTMLInputElement>(container, "input[type='checkbox']");

    await interact(() => toggle.click());

    expect(one<HTMLInputElement>(container, "input[type='checkbox']").checked).toBe(false);
  });

  it("does not prompt again when permission was already granted", async () => {
    stubNotification("granted");
    const container = await render(<Harness />);
    const toggle = one<HTMLInputElement>(container, "input[type='checkbox']");

    await interact(() => toggle.click());

    expect(requestPermission).not.toHaveBeenCalled();
    expect(one<HTMLInputElement>(container, "input[type='checkbox']").checked).toBe(true);
  });

  it("never prompts when the operator turns notifications off", async () => {
    stubNotification("granted");
    const container = await render(<Harness />);
    const toggle = one<HTMLInputElement>(container, "input[type='checkbox']");

    await interact(() => toggle.click());
    await interact(() => one<HTMLInputElement>(container, "input[type='checkbox']").click());

    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe("the three states of the browser's answer, and the fourth", () => {
  it("offers the switch, and says what turning it on will do, when nothing has been asked yet", async () => {
    stubNotification("default");
    const container = await render(<Harness />);

    expect(byText(container, ".ago-switch__label", "Desktop notifications")).not.toBeNull();
    expect(container.textContent).toContain("asks the browser for permission");
  });

  it("offers an ordinary switch once granted", async () => {
    stubNotification("granted");
    const container = await render(<Harness />);

    expect(byText(container, ".ago-switch__label", "Desktop notifications")).not.toBeNull();
    expect(container.textContent).not.toContain("asks the browser for permission");
  });

  it("shows no notification switch at all once the browser has denied it", async () => {
    // `requestPermission()` on a denied origin resolves instantly with "denied" and shows nothing.
    // A switch here would appear to work and silently do nothing for ever.
    stubNotification("denied");
    const container = await render(<Harness />);

    expect(byText(container, ".ago-switch__label", "Desktop notifications")).toBeNull();
    expect(container.textContent).toContain("Your browser is blocking notifications");
    // And it says the one actionable thing left, rather than pretending the page can fix it.
    expect(container.textContent).toContain("browser");

    // The sound switch survives - it needs no permission, and silencing it here would punish the
    // operator for an answer about a different feature.
    expect(byText(container, ".ago-switch__label", "Sound")).not.toBeNull();
    expect(all(container, "input[type='checkbox']")).toHaveLength(1);
  });

  it("says something truthful, and different, when the browser has no notifications at all", async () => {
    // jsdom itself is this state, so nothing is stubbed here. iOS Safari and any non-secure origin
    // are the real ones. "Your browser blocked this" would be a lie about a browser that has no
    // such feature to block.
    const container = await render(<Harness />);

    expect(container.textContent).toContain("does not offer desktop notifications");
    expect(container.textContent).not.toContain("blocking");
    expect(byText(container, ".ago-switch__label", "Sound")).not.toBeNull();
  });
});

describe("the sound switch", () => {
  it("needs no permission and is off until turned on", async () => {
    const container = await render(<Harness />);
    const sound = one<HTMLInputElement>(container, "input[type='checkbox']");

    expect(sound.checked).toBe(false);

    await interact(() => sound.click());

    expect(one<HTMLInputElement>(container, "input[type='checkbox']").checked).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("survives a reload", async () => {
    const container = await render(<Harness />);
    await interact(() => one<HTMLInputElement>(container, "input[type='checkbox']").click());

    await unmount();
    const remounted = await render(<Harness />);

    // Read synchronously on the first render rather than in an effect: a console that showed the
    // switch off and then flipped it on would read as forgetting the choice on every reload.
    expect(one<HTMLInputElement>(remounted, "input[type='checkbox']").checked).toBe(true);
  });
});
