/**
 * `11-06`: what fills the thread region at `/` - the workspace with nothing open yet.
 *
 * It exists because `/` is still a real route with a real element, and because the alternative -
 * redirecting `/` to whichever conversation happens to be first - would make the operator's own
 * navigation history unusable and would open a conversation nobody asked for.
 *
 * The empty state also carries the one thing a new operator needs told, which the old queue page
 * said in a `<p>` and the new layout would otherwise leave unsaid: conversations arrive here on
 * their own. There is no button to press, and that is the design (`4-02`, `docs/vision.md`), not a
 * missing feature.
 */
export function NoConversationSelected() {
  return (
    <section className="ago-workspace__main ago-workspace__main--empty" aria-label="No conversation open">
      <div className="ago-empty-state">
        <span className="ago-empty-state__glyph" aria-hidden="true">
          ⌘
        </span>
        <h2 className="ago-empty-state__title">Pick a conversation</h2>
        <p className="ago-empty-state__body">
          Choose one of the conversations assigned to you on the left. New ones are assigned to you
          automatically as visitors start chatting — nothing here needs claiming.
        </p>
      </div>
    </section>
  );
}
