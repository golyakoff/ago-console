import { afterEach, describe, expect, it } from "vitest";
import { PhoneInput, type PhoneInputProps } from "./PhoneInput.js";
import { interact, one, render, unmount } from "../testing/dom.js";

/**
 * `25-186`/`26-326`: `PhoneInput`'s own tests. `26-326` rewrote the component from "plain `Input` plus a
 * non-interactive `🇷🇺 +7` chip beside it" to "the whole `+7 (XXX) XXX-XX-XX` mask, fixed prefix
 * included, rendered inside the one native control" (`ago-android`'s `RuPhoneField` mirrored in
 * behaviour) - these cases replace the old chip-focused ones. The normalisation/mask/offset-mapping
 * *functions* have their own thorough, Android-mirroring cases in `phoneFormat.test.ts`; this file only
 * has to prove the DOM wiring around them - the mask renders, `onChange` forwards the canonical value,
 * the caret survives a re-render, and the `25-209` foreign escape hatch still switches the control to
 * plain, unmasked passthrough.
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

/** Sets a controlled `<input>`'s DOM value through React's own tracked native setter (a plain
 * `el.value = ...` is invisible to React's controlled-input diffing in a real browser, though jsdom's
 * own `dispatchEvent` happens to still notice it) - `PhoneInput.test.tsx`'s own pre-26-326 precedent. */
function setNativeValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
}

async function typeInto(input: HTMLInputElement, nextRawValue: string, caret: number) {
  await interact(() => {
    setNativeValue(input, nextRawValue);
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("PhoneInput", () => {
  it("renders the fixed, non-deletable +7 mask lead with no value typed yet", async () => {
    const { input } = await mount();

    expect(input.value).toBe("+7 ");
    expect(input.type).toBe("tel");
  });

  it("no longer renders a separate country-code chip beside the control - 26-326 moved +7 inside the mask", async () => {
    const { wrapper, container } = await mount();

    expect(container.querySelector(".ago-phone-input__prefix")).toBeNull();
    expect(wrapper.textContent).not.toContain("🇷🇺");
  });

  it("renders the masked display for a canonical value the caller already holds", async () => {
    const { input } = await mount({ value: "+7921" });

    expect(input.value).toBe("+7 (921) ");
  });

  it("forwards the canonical value on a keystroke, not the raw masked text the DOM produced", async () => {
    let seen: string | null = null;
    const { input } = await mount({
      value: "",
      onChange: (e) => {
        seen = e.target.value;
      },
    });

    await typeInto(input, "+7 9", 4);

    expect(seen).toBe("+79");
  });

  it("normalises a full paste in one path, the same as a keystroke - 89211234567 collapses to +79211234567", async () => {
    let seen: string | null = null;
    const { input } = await mount({
      value: "",
      onChange: (e) => {
        seen = e.target.value;
      },
    });

    await typeInto(input, "89211234567", 11);

    expect(seen).toBe("+79211234567");
  });

  it("re-renders with the grouped mask once the caller stores the new canonical value", async () => {
    const { container } = await mount({ value: "+7921" });

    // Simulate the caller re-rendering with the value PhoneInput's own onChange just handed it.
    await render(<PhoneInput value="+79211234567" onChange={() => undefined} />);
    const rerendered = one<HTMLInputElement>(container, "input");

    expect(rerendered.value).toBe("+7 (921) 123-45-67");
  });

  it("keeps the caret right after the digit just typed, not at the end of the field", async () => {
    let value = "";
    const onChange = (raw: string) => {
      value = raw;
    };
    const { input, container } = await mount({
      value,
      onChange: (e) => onChange(e.target.value),
    });

    await typeInto(input, "+7 9", 4);
    await render(<PhoneInput value={value} onChange={(e) => onChange(e.target.value)} />);
    const rerendered = one<HTMLInputElement>(container, "input");

    expect(rerendered.value).toBe("+7 (9");
    expect(rerendered.selectionStart).toBe("+7 (9".length);
  });

  it("snaps the fixed +7 lead back the moment the field is cleared to empty", async () => {
    let value = "+79211234567";
    const onChange = (raw: string) => {
      value = raw;
    };
    const { input, container } = await mount({
      value,
      onChange: (e) => onChange(e.target.value),
    });

    await typeInto(input, "", 0);
    expect(value).toBe("");

    await render(<PhoneInput value={value} onChange={(e) => onChange(e.target.value)} />);
    const rerendered = one<HTMLInputElement>(container, "input");
    expect(rerendered.value).toBe("+7 ");
  });

  describe("the 25-209 foreign-passthrough escape hatch, inferred from value alone", () => {
    it("renders a plain unmasked control once the value carries an explicit non-+7 country code", async () => {
      const { input } = await mount({ value: "+1 555 019 4567" });

      expect(input.value).toBe("+1 555 019 4567");
    });

    it("forwards further edits verbatim, with no RU mask imposed, while in foreign mode", async () => {
      let seen: string | null = null;
      const { input } = await mount({
        value: "+1 555 019 4567",
        onChange: (e) => {
          seen = e.target.value;
        },
      });

      await typeInto(input, "+1 555 019 45678", 16);

      expect(seen).toBe("+1 555 019 45678");
    });
  });

  it("forwards disabled to the native input", async () => {
    const { input } = await mount({ disabled: true });

    expect(input.disabled).toBe(true);
  });

  it("is enabled by default", async () => {
    const { input } = await mount();

    expect(input.disabled).toBe(false);
  });

  it("applies ago-phone-input--invalid on the wrapper and aria-invalid on the input when invalid", async () => {
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
