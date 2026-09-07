import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderErrorBoundary } from "./RenderErrorBoundary.js";
import { interact, one, render, unmount } from "../testing/dom.js";

/**
 * `23-41`. The mechanism on its own, isolated from the three real mount points
 * (`appShellErrorBoundary.test.tsx`/`operatorShellErrorBoundary.test.tsx` prove those) - this file
 * proves the class component itself: it catches a render-phase throw, calls `onError` once, and a
 * `reset()` call re-attempts rendering `children` rather than staying tripped forever.
 */

/** Throws on purpose, on every render, until `flag.shouldThrow` turns false - a purpose-built
 * component for the "a component that throws during render" proof the item's own Done-when asks
 * for, not a bug reproduction. Reads a mutable object rather than taking a plain boolean prop: the
 * element `<Bomb flag={flag} />` below is constructed once, by this test's own initial `render()`
 * call, so a boolean prop's value would be frozen into that element forever - `flag.shouldThrow` is
 * read fresh on each of `Bomb`'s own calls instead, which is what lets a later mutation of the same
 * object change what the *next* render throws. */
function Bomb({ flag }: { flag: { shouldThrow: boolean } }) {
  if (flag.shouldThrow) {
    throw new Error("Bomb: thrown on purpose by a test");
  }
  return <p data-testid="ok">still here</p>;
}

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("RenderErrorBoundary", () => {
  it("renders its children normally when nothing throws", async () => {
    const container = await render(
      <RenderErrorBoundary fallback={() => <p>fallback</p>}>
        <p>ordinary content</p>
      </RenderErrorBoundary>,
    );

    expect(container.textContent).toContain("ordinary content");
  });

  it("catches a render-phase throw and renders the fallback instead of propagating it", async () => {
    // React logs the caught error to the console by default (the same "componentStack" log React
    // itself has always produced for an error boundary) - expected noise, not a failure, so it is
    // silenced here rather than left to print during a green test run.
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(
      <RenderErrorBoundary fallback={(error) => <p data-testid="fallback">{error.message}</p>}>
        <Bomb flag={{ shouldThrow: true }} />
      </RenderErrorBoundary>,
    );

    expect(one(container, '[data-testid="fallback"]').textContent).toContain("Bomb: thrown on purpose by a test");
  });

  it("calls onError exactly once with the thrown error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn();

    await render(
      <RenderErrorBoundary fallback={() => <p>fallback</p>} onError={onError}>
        <Bomb flag={{ shouldThrow: true }} />
      </RenderErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("Bomb: thrown on purpose by a test");
  });

  it("re-attempts rendering children when reset() is called, rather than staying tripped forever", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flag = { shouldThrow: true };

    const container = await render(
      <RenderErrorBoundary
        fallback={(_error, reset) => (
          <button
            type="button"
            data-testid="retry"
            onClick={() => {
              flag.shouldThrow = false;
              reset();
            }}
          >
            retry
          </button>
        )}
      >
        <Bomb flag={flag} />
      </RenderErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="retry"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ok"]')).toBeNull();

    await interact(() => {
      one<HTMLButtonElement>(container, '[data-testid="retry"]').click();
    });

    expect(one(container, '[data-testid="ok"]').textContent).toBe("still here");
  });
});
