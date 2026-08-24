import { useEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  title: string;
  /** Called for every way out of the dialog - the close button, Escape, and a click on the
   * backdrop. The caller owns the `open` state; this component never closes itself behind its
   * back. */
  onClose: () => void;
  /** The action row. Rendered right-aligned under the content. */
  footer?: ReactNode;
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
export function Dialog({ open, title, onClose, footer, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

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
      className="ago-dialog"
      aria-labelledby="ago-dialog-title"
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
        <h2 className="ago-dialog__title" id="ago-dialog-title">
          {title}
        </h2>
        <div>{children}</div>
        {footer && <div className="ago-dialog__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
