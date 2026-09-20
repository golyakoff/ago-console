import { afterEach, describe, expect, it } from "vitest";
import { PhoneInput, type PhoneInputProps } from "./PhoneInput.js";
import { interact, one, render, unmount } from "../testing/dom.js";

/**
 * `25-186`: `PhoneInput`'s own first test file, matching `Tooltip.test.tsx`'s precedent - the one
 * other component in this directory with its own direct test file (`adr/0030`'s closed-component-set
 * consequence, revisited here for the component this item adds). Covers the mechanism this wrapper
 * owns - the prefix, and forwarding `value`/`onChange`/`disabled`/`invalid` to the underlying `Input`
 * the same way `Input` itself already documents those props - not any one call site's own copy.
 */
afterEach(async () => {
  await unmount();
});

async function mount(props: PhoneInputProps = {}) {
  const container = await render(<PhoneInput {...props} />);
  return {
    container,
    wrapper: one<HTMLDivElement>(container, ".ago-phone-input"),
    input: one<HTMLInputElement>(container, "input"),
  };
}

describe("PhoneInput", () => {
  it("renders the non-interactive 🇷🇺 +7 prefix beside the native control", async () => {
    const { wrapper, input } = await mount();

    expect(wrapper.textContent).toContain("🇷🇺 +7");
    expect(input.type).toBe("tel");
  });

  it("forwards value and fires the passed onChange when the operator types", async () => {
    let seen = "";
    const { input } = await mount({
      value: "+7 900",
      onChange: (e) => {
        seen = e.target.value;
      },
    });

    expect(input.value).toBe("+7 900");

    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "+7 900 123");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(seen).toBe("+7 900 123");
  });

  it("forwards disabled to the native input", async () => {
    const { input } = await mount({ disabled: true });

    expect(input.disabled).toBe(true);
  });

  it("is enabled by default", async () => {
    const { input } = await mount();

    expect(input.disabled).toBe(false);
  });

  it("applies ago-phone-input--invalid on the wrapper and aria-invalid on the input when invalid, the same way Input's own invalid prop reddens its control", async () => {
    const { wrapper, input } = await mount({ invalid: true });

    expect(wrapper.classList.contains("ago-phone-input--invalid")).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("carries neither the invalid class nor aria-invalid when not invalid", async () => {
    const { wrapper, input } = await mount();

    expect(wrapper.classList.contains("ago-phone-input--invalid")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});
