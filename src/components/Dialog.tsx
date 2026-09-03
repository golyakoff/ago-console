import { useEffect, useId, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  title: string;
  /** Called for every way out of the dialog - the close button, Escape, and a click on the
   * backdrop. The caller owns the `open` state; this component never closes itself behind its
   * back. */
  onClose: () => void;
  /** The action row. Rendered right-aligned under the content. */
  footer?: ReactNode;
  /**
   * `11-14`: `"modal"` (the default) is every consumer this component had before - a centred card.
   * `"drawer"` is the mobile navigation drawer (`AppShell`'s own hamburger control): the identical
   * `<dialog>`/`showModal()` mechanism, repositioned to the left edge by `components.css`'s
   * `.ago-dialog--drawer` rule rather than given a second component. `adr/0030` closes the
   * hand-rolled set at eleven and asks that the list be reopened deliberately rather than grown
   * quietly - a variant of the one component whose whole job is "the browser's own modal
   * semantics, repositioned" is the reuse that ADR's own point 3 argues for, not a twelfth
   * component in the set.
   */
  variant?: "modal" | "drawer";
  /** Lets a trigger control point `aria-controls` at this dialog - optional because most existing
   * callers (a confirmation in front of a destructive action) have no such control to link. */
  id?: string;
  children: ReactNode;
}

/**
 * `11-05`. The eleventh component, built on the native `<dialog>` element.
 *
 * This is the component that would most obviously have justified a library - a hand-rolled modal is
 * the classic example of accessibility debt: focus trapping, restoring focus to the trigger on
 * close, inertness of the rest of the page, Escape handling, scroll locking. `showModal()` provides
 * every one of those in the platform itself, which is exactly why `adr/0030` could decide against a
 * library without hand-waving: the hard part is not hand-rolled here, it is delegated to the browser.
 * `close()`/`showModal()` are called from an effect rather than rendered declaratively because the
 * element's open state is DOM state the browser owns, not a React attribute - setting the `open`
 * attribute directly renders a *non-modal* dialog with none of the above.
 *
 * No screen retrofitted by this item mounts one: the seven existing screens have no modal
 * interaction, and introducing one (a confirmation in front of `ConversationPage`'s attachment
 * delete, say) would be a behaviour change, which this presentation-only item excludes. It exists
 * because the item's list is closed at eleven and names it, and because `11-06`/`13-04` are the
 * screens that will need it.
 */
export function Dialog({ open, title, onClose, footer, variant = "modal", id, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // `11-14`: was a fixed `"ago-dialog-title"` before this item, which was already fragile - any two
  // `Dialog`s mounted at once (a screen's own confirmation dialog alongside this component's second
  // consumer) collide on the id. Harmless while only one `Dialog` was ever mounted on a given screen;
  // wrong once the drawer is mounted on *every* screen via `AppShell`, alongside whatever confirmation
  // dialog that screen's own content renders. `useId()` is the platform's own per-instance id.
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={variant === "drawer" ? "ago-dialog ago-dialog--drawer" : "ago-dialog"}
      aria-labelledby={titleId}
      // Fires for Escape as well as for a programmatic `close()`, so this one handler covers every
      // native exit route without a keydown listener of its own.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      // A click that lands on the `<dialog>` element itself rather than on its content is a click on
      // the backdrop - `::backdrop` is not an event target of its own, so this is the standard way
      // to detect it.
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose();
        }
      }}
    >
      <div className="ago-dialog__inner">
        <h2 className="ago-dialog__title" id={titleId}>
          {title}
        </h2>
        <div>{children}</div>
        {footer && <div className="ago-dialog__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
