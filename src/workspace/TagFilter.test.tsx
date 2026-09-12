import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TagFilter } from "./TagFilter.js";
import type { TagDto } from "../api/tagsApi.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `25-59`: the rail's own tag filter - proves the one behaviour this backlog item's Done-when is
 * actually about (checking a tag narrows, checking a second ANDs rather than ORs, clearing empties
 * the selection), at the level this console already tests a checkbox control at
 * (`AlertSettings.test.tsx`'s own precedent). `WorkspaceLayout` owns the wiring from this component's
 * `onChange` to `fetchOperatorQueue` - not re-proven here, the same "the dedicated component's test
 * proves the contract, the layout test proves it is connected" split `18-03`'s own
 * `WorkspaceLayout.test.tsx` doc comment already states for canned responses.
 */
const SITE_TAGS: TagDto[] = [
  { id: "tag-vip", name: "VIP", createdAt: "2026-01-01T00:00:00Z" },
  { id: "tag-billing", name: "Billing", createdAt: "2026-01-01T00:00:00Z" },
];

/** A real, stateful harness rather than a hand-fed `onChange` spy for the multi-select assertions -
 * `AND` is a property of a *sequence* of toggles, and only a component that actually re-renders with
 * its own new `selected` can prove the second checkbox's own state after the first one is checked. */
function Harness({ initial = [] as readonly string[] }: { initial?: readonly string[] }) {
  const [selected, setSelected] = useState<readonly string[]>(initial);
  return <TagFilter tags={SITE_TAGS} selected={selected} onChange={setSelected} />;
}

/** The checkbox inside the row whose own label reads `name` - `one`/`byText` composed so a missing
 * label fails with "no element matched", never a silent `null`. */
function checkboxFor(container: HTMLElement, name: string): HTMLInputElement {
  const label = byText<HTMLLabelElement>(container, "label", name);
  if (label === null) {
    throw new Error(`no label reading "${name}"`);
  }

  return one<HTMLInputElement>(label, "input");
}

function checkboxes(container: HTMLElement): HTMLInputElement[] {
  return all(container, "input[type='checkbox']") as HTMLInputElement[];
}

afterEach(async () => {
  await unmount();
});

describe("TagFilter", () => {
  it("renders one unchecked checkbox per tag in the site's own vocabulary when nothing is selected", async () => {
    const container = await render(<Harness />);

    const boxes = checkboxes(container);
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => !box.checked)).toBe(true);
  });

  it("checking a tag selects only that tag", async () => {
    const container = await render(<Harness />);

    await interact(() => checkboxFor(container, "VIP").click());

    expect(checkboxFor(container, "VIP").checked).toBe(true);
    expect(checkboxFor(container, "Billing").checked).toBe(false);
  });

  it("checking a second tag ANDs it in rather than replacing the first - both stay checked", async () => {
    const container = await render(<Harness initial={["tag-vip"]} />);

    await interact(() => checkboxFor(container, "Billing").click());

    expect(checkboxFor(container, "VIP").checked).toBe(true);
    expect(checkboxFor(container, "Billing").checked).toBe(true);
  });

  it("unchecking one of two selected tags leaves only the other selected", async () => {
    const container = await render(<Harness initial={["tag-vip", "tag-billing"]} />);

    await interact(() => checkboxFor(container, "VIP").click());

    expect(checkboxFor(container, "VIP").checked).toBe(false);
    expect(checkboxFor(container, "Billing").checked).toBe(true);
  });

  it("offers no clear button when nothing is selected", async () => {
    const container = await render(<Harness />);

    expect(one(container, "fieldset").querySelector("button")).toBeNull();
  });

  it("the clear button empties every selection at once", async () => {
    const container = await render(<Harness initial={["tag-vip", "tag-billing"]} />);
    const clear = byText<HTMLButtonElement>(container, "button", "Clear");
    if (clear === null) {
      throw new Error(`no "Clear" button`);
    }

    await interact(() => clear.click());

    expect(checkboxes(container).every((box) => !box.checked)).toBe(true);
    expect(one(container, "fieldset").querySelector("button")).toBeNull();
  });
});
