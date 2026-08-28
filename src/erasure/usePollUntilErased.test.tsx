import { afterEach, describe, expect, it, vi } from "vitest";
import { usePollUntilErased } from "./usePollUntilErased.js";
import type { ErasureCheckOutcome } from "./erasureCheck.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `16-02`: this console's first "poll until a real async job completes" mechanism - see the hook's
 * own doc comment for how it differs from every existing periodic-refresh timer here. Tested directly
 * against a bare harness rather than through `EraseConversationButton`/`AccountDeletionPage`: what
 * this file owns is the polling and completion logic itself, independent of which UI ends up calling
 * it - both of those components' own tests assume this behaviour rather than re-proving it.
 */
function Harness({
  active,
  intervalMs,
  check,
  onErased,
}: {
  active: boolean;
  intervalMs: number;
  check: () => Promise<ErasureCheckOutcome>;
  onErased: () => void;
}) {
  usePollUntilErased(active, intervalMs, check, onErased);
  return null;
}

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("polling", () => {
  it("checks immediately on mount, then again on each interval tick", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<ErasureCheckOutcome>>().mockResolvedValue("pending");
    const onErased = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onErased={onErased} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(onErased).not.toHaveBeenCalled();
  });

  it("does nothing at all while inactive", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<ErasureCheckOutcome>>().mockResolvedValue("erased");
    const onErased = vi.fn();

    await render(<Harness active={false} check={check} intervalMs={1000} onErased={onErased} />);
    await vi.advanceTimersByTimeAsync(5000);

    expect(check).not.toHaveBeenCalled();
    expect(onErased).not.toHaveBeenCalled();
  });
});

describe("what counts as completion", () => {
  it("never calls onErased for a pending outcome, and keeps polling", async () => {
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<ErasureCheckOutcome>>().mockResolvedValue("pending");
    const onErased = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onErased={onErased} />);
    await vi.advanceTimersByTimeAsync(3000);

    expect(check.mock.calls.length).toBeGreaterThan(1);
    expect(onErased).not.toHaveBeenCalled();
  });

  it("never calls onErased for an unknown outcome - a network drop is not completion", async () => {
    // `erasureCheck.ts`'s own rule: `"unknown"` (a network failure, a generic 401, a 500) must never
    // read as `"erased"`. This is the test that would catch the exact bug this item's Done-when names.
    vi.useFakeTimers();
    const check = vi.fn<() => Promise<ErasureCheckOutcome>>().mockResolvedValue("unknown");
    const onErased = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onErased={onErased} />);
    await vi.advanceTimersByTimeAsync(3000);

    expect(onErased).not.toHaveBeenCalled();
  });

  it("calls onErased exactly once, the first tick that resolves erased, and stops polling after", async () => {
    vi.useFakeTimers();
    const check = vi
      .fn<() => Promise<ErasureCheckOutcome>>()
      .mockResolvedValueOnce("pending")
      .mockResolvedValue("erased");
    const onErased = vi.fn();

    await render(<Harness active check={check} intervalMs={1000} onErased={onErased} />);
    await vi.advanceTimersByTimeAsync(0); // tick 1: "pending"
    expect(onErased).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000); // tick 2: "erased"
    expect(onErased).toHaveBeenCalledTimes(1);

    const callsAtCompletion = check.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000); // every later tick would also answer "erased"
    expect(onErased).toHaveBeenCalledTimes(1);
    expect(check.mock.calls.length).toBe(callsAtCompletion);
  });
});

describe("keeping the latest callbacks without needing the caller to memoise them", () => {
  it("uses the check and onErased from the most recent render, not the one active when polling started", async () => {
    // The shape `EraseConversationButton` actually produces: `AdminConversationsPage` builds a fresh
    // `checkErased`/`onErased` closure every time it re-renders a row (`buildColumns`' own `render()`),
    // so this hook cannot rely on either identity staying stable across renders the way
    // `AdminConversationsPage`'s own `refresh` (a real `useCallback`) can for its own effect.
    vi.useFakeTimers();
    const staleCheck = vi.fn<() => Promise<ErasureCheckOutcome>>().mockResolvedValue("pending");
    const staleOnErased = vi.fn();
    const freshCheck = vi.fn<() => Promise<ErasureCheckOutcome>>().mockResolvedValue("erased");
    const freshOnErased = vi.fn();

    await render(<Harness active check={staleCheck} intervalMs={1000} onErased={staleOnErased} />);
    await vi.advanceTimersByTimeAsync(0);

    // A re-render with brand-new closures - never `staleCheck`/`staleOnErased` again after this line.
    await render(<Harness active check={freshCheck} intervalMs={1000} onErased={freshOnErased} />);
    await vi.advanceTimersByTimeAsync(1000);

    expect(freshOnErased).toHaveBeenCalledTimes(1);
    expect(staleOnErased).not.toHaveBeenCalled();
  });
});
