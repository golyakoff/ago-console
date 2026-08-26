import { Dialog } from "../components/Dialog.js";
import { Button } from "../components/Button.js";
import { SHORTCUTS } from "./shortcuts.js";

export interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * `18-05`: the discoverability half of the shortcut set.
 *
 * The item's wording is the requirement: "Discoverable means listed somewhere in the interface, not
 * only in a file." <b>This list is generated from `SHORTCUTS`</b>, the same array the key handler
 * dispatches on, so a shortcut that exists is a shortcut that is documented - there is no second
 * list to forget to update. That is the only reason the catalogue is data rather than a `switch`.
 *
 * Reached two ways, because discoverability that depends on already knowing a shortcut is not
 * discoverability: a visible <b>Shortcuts</b> button in the conversation rail, and `?` for people
 * who expect `?` to do this.
 *
 * `Dialog` is `11-05`'s component, which shipped with no consumer and named `11-06`/`13-04` as the
 * screens that would need one. This is the first. Its native `<dialog>` gives focus trapping,
 * Escape-to-close and inertness for free - and `isTypingTarget` treats anything inside an open
 * dialog as a typing target for exactly that reason, so Escape closes this rather than also firing
 * the close-the-thread shortcut behind it.
 */
export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  return (
    <Dialog
      open={open}
      title="Keyboard shortcuts"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="ago-meta">
        These work anywhere in the workspace except while you are typing — the composer, and any
        other text field, keep every key to themselves.
      </p>

      <dl className="ago-shortcuts">
        {SHORTCUTS.map((shortcut) => (
          <div className="ago-shortcuts__row" key={shortcut.id}>
            <dt>
              <kbd className="ago-kbd">{shortcut.label}</kbd>
            </dt>
            <dd>{shortcut.description}</dd>
          </div>
        ))}
      </dl>

      <p className="ago-meta">
        Inside the composer: <kbd className="ago-kbd">Enter</kbd> sends,{" "}
        <kbd className="ago-kbd">Shift</kbd>+<kbd className="ago-kbd">Enter</kbd> starts a new line,{" "}
        <kbd className="ago-kbd">Esc</kbd> clears the draft.
      </p>
    </Dialog>
  );
}
