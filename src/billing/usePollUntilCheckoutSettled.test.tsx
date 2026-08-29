import { afterEach, describe, expect, it, vi } from "vitest";
import { usePollUntilCheckoutSettled } from "./usePollUntilCheckoutSettled.js";
import type { CheckoutConfirmationOutcome } from "./checkoutConfirmation.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `13-04`: this hook's own polling/completion logic, tested directly against a bare harness the same
 * way `erasure/usePollUntilErased.test.tsx` tests its own close sibling - what this file owns is
 * independent of which UI ends up calling it (`BillingPage`'s own tests assume this behaviour rather
 * than re-proving it).
 */
function Harness({
  active,
  intervalMs,
  check,
  onSettled,
}: {
  active: boolean;
  intervalMs: number;
  check: () => Promise<CheckoutConfirmationOutcome>;
  onSettled: (outcome: "confirmed" | "failed") => void;
}) {
  usePollUntilCheckoutSettled(active, intervalMs, check, onSettled);
  return null;
}

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("polling", () => {
  it("checks immediately on mount, then again on each interval tick", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<CheckoutConfirmationOutcome>>().mockResolvedValue("pending");
    const onSettled = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onSettled={onSettled} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("does nothing at all while inactive", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<CheckoutConfirmationOutcome>>().mockResolvedValue("confirmed");
    const onSettled = vi.fn();

    await render(<Harness active={false} check={check} intervalMs={1000} onSettled={onSettled} />);
    await vi.advanceTimersByTimeAsync(5000);

    expect(check).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });
});

describe("what counts as settled", () => {
  it("never calls onSettled for a pending outcome, and keeps polling", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<CheckoutConfirmationOutcome>>().mockResolvedValue("pending");
    const onSettled = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onSettled={onSettled} />);
    await vi.advanceTimersByTimeAsync(3000);

    expect(check.mock.calls.length).toBeGreaterThan(1);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("never calls onSettled for an unknown outcome - a network drop is never read as confirmation", async () => {
    // The exact bug this screen must never ship: a poll tick that could not reach the server (or
    // the site has no subscription in a recognised state) must not be read as "the payment went
    // through" - `checkoutConfirmation.ts`'s own rule.
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<CheckoutConfirmationOutcome>>().mockResolvedValue("unknown");
    const onSettled = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onSettled={onSettled} />);
    await vi.advanceTimersByTimeAsync(3000);

    expect(onSettled).not.toHaveBeenCalled();
  });

  it("calls onSettled('confirmed') exactly once, the first tick that resolves confirmed, and stops polling after", async () => {
    vi.useFakeTimers();
    const check = vi
      .fn<() => Promise<CheckoutConfirmationOutcome>>()
      .mockResolvedValueOnce("pending")
      .mockResolvedValue("confirmed");
    const onSettled = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onSettled={onSettled} />);
    await vi.advanceTimersByTimeAsync(0); // tick 1: "pending"
    expect(onSettled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000); // tick 2: "confirmed"
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("confirmed");

    const callsAtCompletion = check.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000); // every later tick would also answer "confirmed"
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(check.mock.calls.length).toBe(callsAtCompletion);
  });

  it("calls onSettled('failed') exactly once when ЮKassa declines the payment", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<CheckoutConfirmationOutcome>>().mockResolvedValue("failed");
    const onSettled = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onSettled={onSettled} />);
    await vi.advanceTimersByTimeAsync(0);

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("failed");
  });
});
